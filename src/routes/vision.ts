/**
 * Leaf disease detection routes (Tier-2 T2-4):
 *   POST /api/vision/diagnose   multipart {image} + optional farmId/sessionId/crop/…
 *   GET  /api/vision/diagnoses  recent diagnoses for a farm
 * Thin HTTP layer over leafDiagnosisService (HuggingFace primary + OpenAI fallback).
 * Mirrors the multer memory-upload pattern used by routes/voice.ts.
 */
import multer from "multer";
import { Router, type Request, type Response } from "express";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  leafDiagnosisService,
  type LeafDiagnosisService,
} from "../vision/leafDiagnosisService.js";

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      callback(new Error(`unsupported image type: ${file.mimetype} (use JPEG, PNG, or WebP)`));
      return;
    }
    callback(null, true);
  },
}).single("image");

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function createVisionRouter(service: LeafDiagnosisService = leafDiagnosisService): Router {
  const router = Router();

  router.post("/diagnose", (req: Request, res: Response): void => {
    uploadImage(req, res, async (uploadError): Promise<void> => {
      if (uploadError) {
        res.status(400).json({ error: (uploadError as Error).message });
        return;
      }
      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "image file is required" });
          return;
        }
        const body = req.body as Record<string, string | undefined>;
        const result = await service.diagnose({
          image: { originalname: file.originalname, mimetype: file.mimetype, size: file.size, buffer: file.buffer },
          farmerId: body.farmerId,
          farmId: body.farmId,
          sessionId: body.sessionId,
          planId: body.planId,
          userId: body.userId,
          crop: body.crop,
          locationText: body.locationText,
          latitude: optionalNumber(body.latitude),
          longitude: optionalNumber(body.longitude),
          areaAcres: optionalNumber(body.areaAcres),
          language: body.language,
          save: body.save !== "false",
          createAlerts: body.createAlerts !== "false",
        });
        res.json(result);
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });
  });

  router.get("/diagnoses", async (req: Request, res: Response): Promise<void> => {
    try {
      const farmId = typeof req.query.farmId === "string" ? req.query.farmId : undefined;
      const limit = optionalNumber(req.query.limit);
      res.json(await service.listDiagnoses({ farmId, limit }));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
}

export const visionRouter = createVisionRouter();
