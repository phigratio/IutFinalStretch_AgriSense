/**
 * Leaf disease detection from a photo (Tier-2 T2-4) — the orchestrator.
 *
 * Flow: validate image -> load the farmer's context (crop/land/location/season from
 * the DB, reusing the pest store) -> PRIMARY HuggingFace classifier -> decide accept
 * vs fall back -> OpenAI vision (grounded in the farm context + weather, with a
 * caution message) -> cross-reference the pest/disease KB for grounded treatment +
 * ৳cost + [KB:…] citation -> optional high-severity alert SMS -> persist -> return a
 * full trace so a judge can see which model produced each number.
 *
 * Consumed by: routes/vision.ts (POST /api/vision/diagnose). Reuses: pest store
 * (context + alerts), pestRiskEngine KB, weatherTool, cloudinary, smsDispatcher.
 */
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { config } from "../config.js";
import { type IntakeTraceEvent } from "../agent/intakeSchema.js";
import { type CropId } from "../data/crops.js";
import { normalizeLanguage, type SupportedLanguage } from "../language/localization.js";
import { getWeatherForecastForLocation } from "../agrisense/weatherTool.js";
import { getDefaultAgriSenseStore } from "../agrisense/agrisenseStore.js";
import { type WeatherForecast } from "../agrisense/types.js";
import { deliverPendingAlerts } from "../notifications/smsDispatcher.js";
import { resolvePestCropId } from "../pest/pestRiskEngine.js";
import {
  getDefaultPestRiskStore,
  type PestContext,
  type PestRiskAssessInput,
} from "../pest/pestRiskService.js";
import { cloudinaryConfigured, uploadImageToCloudinary } from "../kb/cloudinary.js";
import { plantDiseaseClassifier, type HfClassification, type HfClassifyInput } from "./hfClient.js";
import { openAiLeafVision, type OpenAiLeafDiagnosis, type VisionContext } from "./openaiVision.js";
import { diseaseSeverityHint, parseLeafLabel } from "./labelMap.js";
import { buildCaution, decideUseHf, matchKbTreatment } from "./leafDiagnosisEngine.js";

export interface UploadedImage {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type LeafSeverity = "none" | "low" | "medium" | "high";
export type LeafSource = "hf" | "openai" | "unavailable";

export interface LeafTreatment {
  text: string;
  estimatedCostBdt?: number;
  /** kb = grounded in pest_disease_rules.csv, ai = from the vision model, none = generic advice. */
  source: "kb" | "ai" | "none";
}

export interface LeafDiagnosisResult {
  id?: string;
  source: LeafSource;
  crop: string;
  cropId?: CropId;
  disease: string;
  healthy: boolean;
  confidence: number;
  severity: LeafSeverity;
  symptoms?: string;
  differentials: string[];
  treatment: LeafTreatment;
  prevention: LeafTreatment;
  citation?: string;
  caution?: string;
  modelLabels: HfClassification[];
  imageUrl?: string;
  weatherNote?: string;
  decisionReason: string;
  context: {
    farmerId?: string;
    farmId?: string;
    sessionId?: string;
    planId?: string;
    cropContext?: string;
    locationText?: string;
    areaAcres?: number;
  };
  trace: IntakeTraceEvent[];
}

export interface LeafDiagnosisInput {
  image: UploadedImage;
  farmerId?: string;
  farmId?: string;
  sessionId?: string;
  planId?: string;
  userId?: string;
  crop?: string;
  locationText?: string;
  latitude?: number;
  longitude?: number;
  areaAcres?: number;
  language?: string;
  /** default true; set false to skip DB persistence (tests / stateless demo). */
  save?: boolean;
  /** default true; create a high-severity alert + SMS when a farm is known. */
  createAlerts?: boolean;
  /** default true; host the photo on Cloudinary when configured. */
  hostImage?: boolean;
}

const MONITOR_NOTE = "No disease detected. Keep monitoring the crop and scout weekly.";
const GENERIC_TREATMENT = "No specific treatment card in the knowledge base for this crop — consult your local DAE/SAAO officer.";

export interface LeafDiagnosisRecord extends LeafDiagnosisResult {
  createdAt: string;
}

export interface LeafDiagnosisStore {
  saveDiagnosis(input: {
    result: LeafDiagnosisResult;
    context: PestContext;
    sourceTraceIds: string[];
  }): Promise<{ id: string; createdAt: string }>;
  listDiagnoses(input: { farmId?: string; limit?: number }): Promise<LeafDiagnosisRecord[]>;
  createAlert(input: { result: LeafDiagnosisResult; context: PestContext }): Promise<boolean>;
  close?(): Promise<void>;
}

export interface LeafDiagnosisDeps {
  classifier: { configured: boolean; classify(input: HfClassifyInput): Promise<HfClassification[]> };
  vision: {
    configured: boolean;
    diagnose(input: { imageBuffer: Buffer; mimeType: string; context: VisionContext }): Promise<OpenAiLeafDiagnosis>;
  };
  store: LeafDiagnosisStore;
  loadContext(input: PestRiskAssessInput): Promise<PestContext>;
  getWeather(input: { locationText: string; latitude?: number; longitude?: number }): Promise<WeatherForecast>;
}

export function validateImage(image: UploadedImage | undefined): asserts image is UploadedImage {
  if (!image) throw new Error("image file is required");
  if (!image.buffer?.length || image.size <= 0) throw new Error("image file is empty");
  if (image.size > MAX_IMAGE_BYTES) throw new Error("image file must be 8 MB or smaller");
  if (!ALLOWED_IMAGE_MIME_TYPES.has(image.mimetype)) {
    throw new Error(`unsupported image type: ${image.mimetype} (use JPEG, PNG, or WebP)`);
  }
}

export class LeafDiagnosisService {
  private readonly deps: LeafDiagnosisDeps;

  constructor(deps: Partial<LeafDiagnosisDeps> = {}) {
    this.deps = {
      classifier: deps.classifier ?? plantDiseaseClassifier,
      vision: deps.vision ?? openAiLeafVision,
      store: deps.store ?? getDefaultLeafDiagnosisStore(),
      loadContext: deps.loadContext ?? ((input) => getDefaultPestRiskStore().loadContext(input)),
      getWeather: deps.getWeather ?? ((input) => getWeatherForecastForLocation(input)),
    };
  }

  async diagnose(input: LeafDiagnosisInput): Promise<LeafDiagnosisResult> {
    validateImage(input.image);
    const language = normalizeLanguage(input.language) ?? "en";
    const trace: IntakeTraceEvent[] = [];

    // 1. Farmer context (crop / land / location / season) from the DB — best-effort.
    const context = await this.loadContextSafe(input, trace);
    const farmerCropId = resolvePestCropId(
      context.crop ?? context.currentCrop ?? input.crop,
      context.targetSeason,
    );
    const areaAcres = input.areaAcres ?? context.areaAcres ?? 1;
    const locationText = input.locationText ?? context.locationText;
    const cropContext = context.crop ?? context.currentCrop ?? input.crop ?? farmerCropId;

    // 2. Optional image hosting (Cloudinary) — never blocks the diagnosis.
    const imageUrl = await this.hostImageSafe(input, trace);

    // 3. PRIMARY: HuggingFace classifier.
    let labels: HfClassification[] = [];
    let hfFailed = false;
    if (this.deps.classifier.configured) {
      const started = Date.now();
      try {
        labels = await this.deps.classifier.classify({ imageBuffer: input.image.buffer, mimeType: input.image.mimetype });
        await this.trace(trace, input.sessionId, "leaf.hf.classify", { model: config.hfPlantDiseaseModel }, { top: labels.slice(0, 3) }, started);
      } catch (error) {
        hfFailed = true;
        await this.trace(trace, input.sessionId, "leaf.hf.classify", { model: config.hfPlantDiseaseModel }, null, started, (error as Error).message);
      }
    } else {
      await this.trace(trace, input.sessionId, "leaf.hf.classify", { model: config.hfPlantDiseaseModel }, { skipped: "HF_TOKEN not set" }, Date.now());
    }

    const top = labels[0];
    const parsed = top ? parseLeafLabel(top.label) : undefined;
    const decision = decideUseHf({ top, parsed, farmerCropId, threshold: config.visionConfidenceThreshold });
    await this.trace(trace, input.sessionId, "leaf.decision", { threshold: config.visionConfidenceThreshold, farmerCropId }, decision, Date.now());

    // 4. Build the result via the chosen path.
    let result: LeafDiagnosisResult;
    if (decision.useHf && top && parsed) {
      result = this.buildHfResult({ top, parsed, labels, farmerCropId, areaAcres, decision, language, trace, sessionId: input.sessionId });
    } else {
      result = await this.buildFallbackResult({ input, labels, context, farmerCropId, areaAcres, locationText, cropContext, decision, language, hfUnavailable: hfFailed || !this.deps.classifier.configured, trace });
    }

    result.imageUrl = imageUrl;
    result.context = {
      farmerId: context.farmerId,
      farmId: context.farmId,
      sessionId: input.sessionId,
      planId: context.planId,
      cropContext: typeof cropContext === "string" ? cropContext : undefined,
      locationText,
      areaAcres,
    };
    result.trace = trace;

    // 5. Persist (best-effort) + optional high-severity alert SMS.
    if (input.save !== false) {
      try {
        const saved = await this.deps.store.saveDiagnosis({ result, context, sourceTraceIds: traceIds(trace) });
        result.id = saved.id;
        await this.trace(trace, input.sessionId, "leaf.assessment.save", { id: saved.id }, { saved: true }, Date.now());
      } catch (error) {
        await this.trace(trace, input.sessionId, "leaf.assessment.save", {}, { saved: false }, Date.now(), (error as Error).message);
      }
    }

    if (input.createAlerts !== false && result.severity === "high" && !result.healthy && context.farmId) {
      try {
        const created = await this.deps.store.createAlert({ result, context });
        await this.trace(trace, input.sessionId, "leaf.alert.create", { severity: result.severity }, { created }, Date.now());
        if (created) void deliverPendingAlerts().catch((err: unknown) => console.error("[leaf.alert] SMS dispatch failed:", (err as Error).message));
      } catch (error) {
        await this.trace(trace, input.sessionId, "leaf.alert.create", { severity: result.severity }, { created: false }, Date.now(), (error as Error).message);
      }
    }

    return result;
  }

  async listDiagnoses(input: { farmId?: string; limit?: number }): Promise<LeafDiagnosisRecord[]> {
    return this.deps.store.listDiagnoses(input);
  }

  private buildHfResult(args: {
    top: HfClassification;
    parsed: ReturnType<typeof parseLeafLabel>;
    labels: HfClassification[];
    farmerCropId?: CropId;
    areaAcres: number;
    decision: { reason: string };
    language: SupportedLanguage;
    trace: IntakeTraceEvent[];
    sessionId?: string;
  }): LeafDiagnosisResult {
    const { top, parsed, labels, farmerCropId, areaAcres, decision } = args;
    const cropId = parsed.cropId ?? farmerCropId;
    const kb = matchKbTreatment({ diseaseName: parsed.diseaseName, cropId, areaAcres });
    void this.trace(args.trace, args.sessionId, "leaf.kb.match", { disease: parsed.diseaseName, cropId }, { matched: kb.matched, issueName: kb.issueName, citation: kb.citation }, Date.now());

    const healthy = parsed.healthy;
    const differentials = labels.slice(1, 3).map((row) => parseLeafLabel(row.label).diseaseName);
    return {
      source: "hf",
      crop: parsed.cropDisplay,
      cropId,
      disease: parsed.diseaseName,
      healthy,
      confidence: round2(top.score),
      severity: healthy ? "none" : diseaseSeverityHint(parsed.condition),
      symptoms: kb.symptoms,
      differentials,
      treatment: healthy
        ? { text: MONITOR_NOTE, source: "none" }
        : kb.matched
          ? { ...kb.treatment, source: "kb" }
          : { text: GENERIC_TREATMENT, source: "none" },
      prevention: healthy
        ? { text: MONITOR_NOTE, source: "none" }
        : kb.matched
          ? { ...kb.prevention, source: "kb" }
          : { text: GENERIC_TREATMENT, source: "none" },
      citation: kb.citation,
      // Trained model + KB-grounded → trustworthy, no caution. Detected but ungrounded → soft note.
      caution: healthy || kb.matched ? undefined : buildCaution("openai", args.language),
      modelLabels: labels.slice(0, 5),
      decisionReason: decision.reason,
      context: {},
      trace: [],
    };
  }

  /**
   * Graceful result when the OpenAI fallback is unavailable or fails (e.g. 429):
   * a low-confidence trained-model guess when its crop matches the farm, otherwise
   * an honest "uncertain". Never throws — the feature must not die on a bad key.
   */
  private degradedResult(args: {
    labels: HfClassification[];
    farmerCropId?: CropId;
    cropContext?: string | CropId;
    language: SupportedLanguage;
    reason: string;
  }): LeafDiagnosisResult {
    const { labels, farmerCropId, cropContext, language, reason } = args;
    const top = labels[0];
    const parsed = top ? parseLeafLabel(top.label) : undefined;
    const usableHf = Boolean(top && parsed && (!farmerCropId || parsed.cropId === farmerCropId));
    if (usableHf && top && parsed) {
      return {
        source: "hf",
        crop: parsed.cropDisplay,
        cropId: parsed.cropId ?? farmerCropId,
        disease: parsed.diseaseName,
        healthy: parsed.healthy,
        confidence: round2(top.score),
        severity: parsed.healthy ? "none" : diseaseSeverityHint(parsed.condition),
        differentials: labels.slice(1, 3).map((row) => parseLeafLabel(row.label).diseaseName),
        treatment: { text: GENERIC_TREATMENT, source: "none" },
        prevention: { text: GENERIC_TREATMENT, source: "none" },
        caution: buildCaution("openai", language),
        modelLabels: labels.slice(0, 5),
        decisionReason: reason,
        context: {},
        trace: [],
      };
    }
    return {
      source: "unavailable",
      crop: typeof cropContext === "string" ? cropContext : "unknown",
      cropId: farmerCropId,
      disease: "Uncertain",
      healthy: false,
      confidence: 0,
      severity: "none",
      differentials: [],
      treatment: { text: GENERIC_TREATMENT, source: "none" },
      prevention: { text: GENERIC_TREATMENT, source: "none" },
      caution: buildCaution("unavailable", language),
      modelLabels: labels.slice(0, 5),
      decisionReason: reason,
      context: {},
      trace: [],
    };
  }

  private async buildFallbackResult(args: {
    input: LeafDiagnosisInput;
    labels: HfClassification[];
    context: PestContext;
    farmerCropId?: CropId;
    areaAcres: number;
    locationText?: string;
    cropContext?: string | CropId;
    decision: { reason: string };
    language: SupportedLanguage;
    hfUnavailable: boolean;
    trace: IntakeTraceEvent[];
  }): Promise<LeafDiagnosisResult> {
    const { input, labels, context, farmerCropId, areaAcres, locationText, cropContext, decision, language, trace } = args;

    if (!this.deps.vision.configured) {
      return this.degradedResult({ labels, farmerCropId, cropContext, language, reason: `${decision.reason}; OpenAI fallback unavailable` });
    }

    // Weather grounding (best-effort) for the vision prompt.
    let weatherNote: string | undefined;
    let weatherSummary: string | undefined;
    if (locationText) {
      const started = Date.now();
      try {
        const weather = await this.deps.getWeather({ locationText, latitude: input.latitude ?? context.latitude, longitude: input.longitude ?? context.longitude });
        weatherSummary = summarizeWeather(weather);
        weatherNote = weatherSummary;
        await this.trace(trace, input.sessionId, "leaf.weather.fetch", { locationText }, { summary: weatherSummary }, started);
      } catch (error) {
        await this.trace(trace, input.sessionId, "leaf.weather.fetch", { locationText }, null, started, (error as Error).message);
      }
    }

    const visionContext: VisionContext = {
      crop: typeof cropContext === "string" ? cropContext : undefined,
      locationText,
      targetSeason: context.targetSeason,
      growthStage: undefined,
      weatherSummary,
    };

    const started = Date.now();
    let ai: OpenAiLeafDiagnosis;
    try {
      ai = await this.deps.vision.diagnose({ imageBuffer: input.image.buffer, mimeType: input.image.mimetype, context: visionContext });
      await this.trace(trace, input.sessionId, "leaf.openai.diagnose", { model: config.openaiVisionModel, context: visionContext }, ai, started);
    } catch (error) {
      await this.trace(trace, input.sessionId, "leaf.openai.diagnose", { model: config.openaiVisionModel }, null, started, (error as Error).message);
      return this.degradedResult({ labels, farmerCropId, cropContext, language, reason: `${decision.reason}; OpenAI vision failed: ${(error as Error).message}` });
    }

    const healthy = ai.severity === "none" || /healthy/i.test(ai.disease);
    const aiCropId = resolvePestCropId(ai.crop, context.targetSeason) ?? farmerCropId;
    const kb = matchKbTreatment({ diseaseName: ai.disease, cropId: aiCropId, areaAcres });
    await this.trace(trace, input.sessionId, "leaf.kb.match", { disease: ai.disease, cropId: aiCropId }, { matched: kb.matched, issueName: kb.issueName, citation: kb.citation }, Date.now());

    return {
      source: "openai",
      crop: ai.crop,
      cropId: aiCropId,
      disease: healthy ? "Healthy" : ai.disease,
      healthy,
      confidence: round2(ai.confidence),
      severity: ai.severity,
      symptoms: ai.symptoms || kb.symptoms,
      differentials: ai.differentials,
      treatment: kb.matched
        ? { ...kb.treatment, source: "kb" }
        : { text: ai.treatment || GENERIC_TREATMENT, source: ai.treatment ? "ai" : "none" },
      prevention: kb.matched
        ? { ...kb.prevention, source: "kb" }
        : { text: ai.prevention || GENERIC_TREATMENT, source: ai.prevention ? "ai" : "none" },
      citation: kb.citation,
      caution: buildCaution("openai", language, ai.isLeaf),
      modelLabels: labels.slice(0, 5),
      weatherNote,
      decisionReason: decision.reason,
      context: {},
      trace: [],
    };
  }

  private async loadContextSafe(input: LeafDiagnosisInput, trace: IntakeTraceEvent[]): Promise<PestContext> {
    const started = Date.now();
    const request: PestRiskAssessInput = {
      farmerId: input.farmerId,
      farmId: input.farmId,
      sessionId: input.sessionId,
      planId: input.planId,
      crop: input.crop,
      locationText: input.locationText,
      latitude: input.latitude,
      longitude: input.longitude,
      areaAcres: input.areaAcres,
    };
    try {
      const context = await this.deps.loadContext(request);
      await this.trace(trace, input.sessionId, "leaf.context.load", { farmerId: input.farmerId, farmId: input.farmId, sessionId: input.sessionId }, { crop: context.crop ?? context.currentCrop, locationText: context.locationText, targetSeason: context.targetSeason, areaAcres: context.areaAcres }, started);
      return context;
    } catch (error) {
      await this.trace(trace, input.sessionId, "leaf.context.load", { farmerId: input.farmerId, farmId: input.farmId }, null, started, (error as Error).message);
      return {
        farmerId: input.farmerId,
        farmId: input.farmId,
        sessionId: input.sessionId,
        planId: input.planId,
        crop: input.crop,
        locationText: input.locationText,
        latitude: input.latitude,
        longitude: input.longitude,
        areaAcres: input.areaAcres,
      };
    }
  }

  private async hostImageSafe(input: LeafDiagnosisInput, trace: IntakeTraceEvent[]): Promise<string | undefined> {
    if (input.hostImage === false || !cloudinaryConfigured()) return undefined;
    const started = Date.now();
    try {
      const uploaded = await uploadImageToCloudinary(input.image.buffer, input.image.originalname || "leaf.jpg", input.image.mimetype);
      await this.trace(trace, input.sessionId, "leaf.image.upload", { provider: "cloudinary" }, { imageUrl: uploaded.imageUrl }, started);
      return uploaded.imageUrl;
    } catch (error) {
      await this.trace(trace, input.sessionId, "leaf.image.upload", { provider: "cloudinary" }, null, started, (error as Error).message);
      return undefined;
    }
  }

  private async trace(
    trace: IntakeTraceEvent[],
    sessionId: string | undefined,
    toolName: string,
    parameters: Record<string, unknown>,
    rawResponse: unknown,
    startedAt: number,
    errorMessage?: string,
  ): Promise<void> {
    const event: IntakeTraceEvent = {
      traceId: randomUUID(),
      kind: errorMessage ? "error" : "tool",
      toolName,
      parameters,
      rawResponse,
      status: errorMessage ? "error" : "success",
      errorMessage,
      latencyMs: Math.max(0, Date.now() - startedAt),
    };
    trace.push(event);
    if (!sessionId) return;
    try {
      await getDefaultAgriSenseStore().saveTrace(sessionId, event);
    } catch {
      // Trace persistence needs a real agent_sessions row; never fail the diagnosis over it.
    }
  }
}

// ---- Persistence -----------------------------------------------------------

export class InMemoryLeafDiagnosisStore implements LeafDiagnosisStore {
  readonly diagnoses: LeafDiagnosisRecord[] = [];
  readonly alerts: LeafDiagnosisResult[] = [];

  async saveDiagnosis(input: { result: LeafDiagnosisResult }): Promise<{ id: string; createdAt: string }> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.diagnoses.unshift({ ...input.result, id, createdAt });
    return { id, createdAt };
  }

  async listDiagnoses(input: { farmId?: string; limit?: number }): Promise<LeafDiagnosisRecord[]> {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    return this.diagnoses.filter((row) => !input.farmId || row.context.farmId === input.farmId).slice(0, limit);
  }

  async createAlert(input: { result: LeafDiagnosisResult }): Promise<boolean> {
    this.alerts.push(input.result);
    return true;
  }
}

export class PostgresLeafDiagnosisStore implements LeafDiagnosisStore {
  private prisma: PrismaClient;

  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  }

  async saveDiagnosis(input: {
    result: LeafDiagnosisResult;
    context: PestContext;
    sourceTraceIds: string[];
  }): Promise<{ id: string; createdAt: string }> {
    const { result, context } = input;
    const payload = { ...result, trace: undefined, id: undefined };
    const rows = await this.prisma.$queryRaw<{ id: string; created_at: Date }[]>`
      INSERT INTO "leaf_diagnoses" (
        "id", "farmer_id", "farm_id", "session_id", "plan_id", "source", "crop_id", "crop_label",
        "disease", "healthy", "confidence", "severity", "image_url", "location_text", "area_acres",
        "citation", "caution", "payload", "trace", "source_trace_ids"
      ) VALUES (
        ${randomUUID()}::uuid,
        ${context.farmerId ?? null}::uuid,
        ${context.farmId ?? null}::uuid,
        ${context.sessionId ?? null}::uuid,
        ${context.planId ?? null}::uuid,
        ${result.source},
        ${result.cropId ?? null},
        ${result.crop},
        ${result.disease},
        ${result.healthy},
        ${result.confidence},
        ${result.severity},
        ${result.imageUrl ?? null},
        ${result.context.locationText ?? context.locationText ?? null},
        ${result.context.areaAcres ?? null},
        ${result.citation ?? null},
        ${result.caution ?? null},
        ${JSON.stringify(payload)}::jsonb,
        ${JSON.stringify(result.trace)}::jsonb,
        ${input.sourceTraceIds}
      )
      RETURNING "id", "created_at"
    `;
    return { id: rows[0]!.id, createdAt: rows[0]!.created_at.toISOString() };
  }

  async listDiagnoses(input: { farmId?: string; limit?: number }): Promise<LeafDiagnosisRecord[]> {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const rows = await this.prisma.$queryRaw<{ id: string; payload: unknown; trace: unknown; created_at: Date }[]>`
      SELECT "id", "payload", "trace", "created_at"
      FROM "leaf_diagnoses"
      WHERE (${input.farmId ?? null}::uuid IS NULL OR "farm_id" = ${input.farmId ?? null}::uuid)
      ORDER BY "created_at" DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({
      ...(row.payload as LeafDiagnosisResult),
      id: row.id,
      trace: Array.isArray(row.trace) ? (row.trace as IntakeTraceEvent[]) : [],
      createdAt: row.created_at.toISOString(),
    }));
  }

  async createAlert(input: { result: LeafDiagnosisResult; context: PestContext }): Promise<boolean> {
    const { result, context } = input;
    const fingerprint = `leaf:${context.farmId ?? "adhoc"}:${result.cropId ?? result.crop}:${result.disease}:${new Date().toISOString().slice(0, 10)}`;
    const inserted = await this.prisma.$executeRaw`
      INSERT INTO "proactive_alerts" (
        "id", "farm_id", "session_id", "plan_id", "alert_type", "severity", "title",
        "message", "recommendation", "rule_id", "trigger_date", "raw_evidence", "fingerprint"
      ) VALUES (
        gen_random_uuid(),
        ${context.farmId ?? null}::uuid,
        ${context.sessionId ?? null}::uuid,
        ${context.planId ?? null}::uuid,
        'leaf_disease_detected',
        ${result.severity},
        ${`${result.disease} detected on ${result.crop}`},
        ${`A leaf photo was diagnosed as ${result.disease} (${Math.round(result.confidence * 100)}% confidence) on ${result.crop}.`},
        ${result.treatment.text},
        ${`leaf.${result.source}`},
        ${new Date().toISOString().slice(0, 10)}::date,
        ${JSON.stringify({ disease: result.disease, confidence: result.confidence, source: result.source, imageUrl: result.imageUrl })}::jsonb,
        ${fingerprint}
      )
      ON CONFLICT ("fingerprint") DO NOTHING
    `;
    return inserted > 0;
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

let defaultStore: LeafDiagnosisStore | undefined;
export function getDefaultLeafDiagnosisStore(): LeafDiagnosisStore {
  defaultStore ??= config.databaseUrl ? new PostgresLeafDiagnosisStore(config.databaseUrl) : new InMemoryLeafDiagnosisStore();
  return defaultStore;
}

function summarizeWeather(weather: WeatherForecast): string {
  const rain7 = weather.daily.slice(0, 7).reduce((sum, day) => sum + day.rainfallMm, 0);
  const today = weather.daily[0];
  const humidity = today?.humidityPct;
  return `${Math.round(rain7)}mm rain over 7 days, today ${Math.round(today?.temperatureMinC ?? 0)}-${Math.round(today?.temperatureMaxC ?? 0)}°C${humidity ? `, humidity ~${Math.round(humidity)}%` : ""}`;
}

function traceIds(trace: IntakeTraceEvent[]): string[] {
  return trace.map((event) => event.traceId).filter((id): id is string => Boolean(id));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export const leafDiagnosisService = new LeafDiagnosisService();
