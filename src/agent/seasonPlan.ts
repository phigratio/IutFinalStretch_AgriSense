/**
 * Season-plan generator (T0-4). Produces a dated calendar from land prep → harvest for the
 * chosen crop. Dates come from the BARC window (month ranges) via an explicit, editable anchor
 * assumption; urea splits come from the FRG row (never hardcoded); a weather-note hook flags
 * heavy rain near a fertilizer task.
 */

import type { CropId } from "../data/crops.js";
import {
  getCalendar,
  getFertilizer,
  getWaterCriticalStages,
  getVarietyForCrop,
  type FertilityClass,
} from "../data/loader.js";
import { scaleDose } from "../engines/financials.js";
import type { WaterAvailability } from "./ranking.js";

export interface PlanInput {
  cropId: CropId;
  areaHa: number;
  fertilityClass: FertilityClass;
  waterAvailability: WaterAvailability;
  /** Farmer-given establishment (sow/transplant) date; else midpoint of the window. */
  anchorDate?: Date;
  /** Used to resolve which calendar year's window applies. */
  systemDate?: Date;
  /** Optional 16-day forecast for the weather-note hook. */
  forecast?: { daily: { date: string; rainMm: number }[] };
}

export interface TaskInput {
  item: string;
  qtyForArea: number;
  unit: string;
}

export interface SeasonTask {
  windowStart: string;
  windowEnd: string;
  stage: string;
  action: string;
  inputs: TaskInput[];
  source: string;
  weatherNote?: string;
}

export interface SeasonPlanResult {
  cropId: CropId;
  anchorDate: string;
  anchorAssumption: string;
  windowStart: string;
  windowEnd: string;
  tasks: SeasonTask[];
}

const HEAVY_RAIN_MM = 40;

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function windowForYear(
  cal: NonNullable<ReturnType<typeof getCalendar>>,
  year: number,
): { start: Date; end: Date } {
  const start = new Date(year, cal.windowStartMonth - 1, cal.windowStartDay);
  const spansYear =
    cal.windowEndMonth < cal.windowStartMonth ||
    (cal.windowEndMonth === cal.windowStartMonth && cal.windowEndDay < cal.windowStartDay);
  const end = new Date(year + (spansYear ? 1 : 0), cal.windowEndMonth - 1, cal.windowEndDay);
  return { start, end };
}

/** Pick the current window if we're inside one, else the next upcoming (system-date driven). */
function resolveWindow(
  cal: NonNullable<ReturnType<typeof getCalendar>>,
  systemDate: Date,
): { start: Date; end: Date } {
  const y = systemDate.getFullYear();
  const candidates = [y - 1, y, y + 1].map((yr) => windowForYear(cal, yr));
  const current = candidates.find((w) => systemDate >= w.start && systemDate <= w.end);
  if (current) return current;
  const upcoming = candidates
    .filter((w) => w.start >= systemDate)
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  return upcoming ?? candidates[candidates.length - 1];
}

export function generateSeasonPlan(input: PlanInput): SeasonPlanResult {
  const { cropId, areaHa, fertilityClass, waterAvailability } = input;
  const systemDate = input.systemDate ?? new Date();
  const cal = getCalendar(cropId);
  if (!cal) throw new Error(`No crop calendar for ${cropId}`);
  const fert = getFertilizer(cropId, fertilityClass);
  const variety = getVarietyForCrop(cropId);
  const duration = variety?.durationDays ?? cal.durationDays;

  const window = resolveWindow(cal, systemDate);
  const midpoint = new Date((window.start.getTime() + window.end.getTime()) / 2);
  const anchor = input.anchorDate ?? midpoint;

  const farmerGiven = Boolean(input.anchorDate);
  const anchorAssumption = farmerGiven
    ? `Using your ${cal.anchorStage} date of ${fmt(anchor)}.`
    : `Assumption: ${cal.anchorStage} date set to ${fmt(anchor)}, midpoint of the ${cal.season} window (${fmt(window.start)}–${fmt(window.end)}). Change it?`;

  const tasks: SeasonTask[] = [];
  const isTransplant = cal.anchorStage === "transplanting";

  // 1. Land preparation
  tasks.push({
    windowStart: fmt(addDays(anchor, -14)),
    windowEnd: fmt(addDays(anchor, -1)),
    stage: "land_preparation",
    action: "Plough and level the land; ensure drainage.",
    inputs: [],
    source: "BARC crop calendar",
  });

  // 2. Seed / seedling preparation
  tasks.push({
    windowStart: fmt(addDays(anchor, isTransplant ? -30 : -3)),
    windowEnd: fmt(addDays(anchor, -1)),
    stage: isTransplant ? "seedling_preparation" : "seed_preparation",
    action: isTransplant
      ? "Raise nursery seedlings for transplanting."
      : "Treat and prepare seed for sowing.",
    inputs: [],
    source: "BARI/BRRI production guide",
  });

  // 3. Establishment (sow / transplant)
  tasks.push({
    windowStart: fmt(window.start),
    windowEnd: fmt(window.end),
    stage: cal.anchorStage,
    action: isTransplant ? "Transplant seedlings." : "Sow the seed.",
    inputs: [],
    source: "BARC crop calendar",
  });

  // 4. Basal fertilizer (at establishment)
  const basalInputs: TaskInput[] = [];
  if (fert) {
    const basalUrea = scaleDose(fert.urea * fert.ureaBasalFraction, areaHa);
    if (basalUrea > 0) basalInputs.push({ item: "Urea (basal)", qtyForArea: round(basalUrea), unit: "kg" });
    basalInputs.push({ item: "TSP", qtyForArea: round(scaleDose(fert.tsp, areaHa)), unit: "kg" });
    basalInputs.push({ item: "MoP (basal)", qtyForArea: round(scaleDose(fert.mop, areaHa)), unit: "kg" });
    if (fert.gypsum > 0) basalInputs.push({ item: "Gypsum", qtyForArea: round(scaleDose(fert.gypsum, areaHa)), unit: "kg" });
    if (fert.zinc > 0) basalInputs.push({ item: "Zinc sulphate", qtyForArea: round(scaleDose(fert.zinc, areaHa)), unit: "kg" });
  }
  tasks.push({
    windowStart: fmt(anchor),
    windowEnd: fmt(addDays(anchor, 2)),
    stage: "basal_fertilizer",
    action: "Apply basal fertilizer during final land prep / at establishment.",
    inputs: basalInputs,
    source: fert ? "FRG-2018 dose table" : "FRG-2018",
  });

  // 5. Urea top-dress splits (timings from the FRG row)
  if (fert && fert.ureaSplitDays.length > 0) {
    const topUreaTotal = fert.urea * (1 - fert.ureaBasalFraction);
    const perSplit = scaleDose(topUreaTotal / fert.ureaSplitDays.length, areaHa);
    fert.ureaSplitDays.forEach((day, idx) => {
      const d = addDays(anchor, day);
      tasks.push({
        windowStart: fmt(d),
        windowEnd: fmt(addDays(d, 2)),
        stage: "urea_topdress",
        action: `Urea top-dress split ${idx + 1} of ${fert.ureaSplitDays.length} (${day} days after ${cal.anchorStage}).`,
        inputs: [{ item: "Urea (top-dress)", qtyForArea: round(perSplit), unit: "kg" }],
        source: "FRG-2018 split schedule",
      });
    });
  }

  // 6. Irrigation checkpoints (critical stages × water availability)
  if (waterAvailability !== "rainfed") {
    const stages = getWaterCriticalStages(cropId);
    stages.forEach((stage, idx) => {
      const day = Math.round((duration * (idx + 1)) / (stages.length + 1));
      const d = addDays(anchor, day);
      tasks.push({
        windowStart: fmt(d),
        windowEnd: fmt(addDays(d, 3)),
        stage: "irrigation",
        action: `Irrigation checkpoint at ${stage.replace(/_/g, " ")}.`,
        inputs: [],
        source: "FAO crop-water + water availability",
      });
    });
  }

  // 7. Weeding rounds
  for (const day of [20, 40]) {
    if (day < duration) {
      const d = addDays(anchor, day);
      tasks.push({
        windowStart: fmt(d),
        windowEnd: fmt(addDays(d, 5)),
        stage: "weeding",
        action: `Weeding round (${day} days after ${cal.anchorStage}).`,
        inputs: [],
        source: "BARI/BRRI production guide",
      });
    }
  }

  // 8. Pest / disease scouting
  const d = addDays(anchor, Math.round(duration / 2));
  tasks.push({
    windowStart: fmt(addDays(d, -5)),
    windowEnd: fmt(addDays(d, 5)),
    stage: "pest_scouting",
    action: "Scout for stage-typical pests and diseases; act on thresholds.",
    inputs: [],
    source: "KB pest/disease notes",
  });

  // 9. Harvest
  tasks.push({
    windowStart: fmt(addDays(anchor, duration)),
    windowEnd: fmt(addDays(anchor, duration + 14)),
    stage: "harvest",
    action: "Harvest at maturity; dry and store.",
    inputs: [],
    source: "BARC crop calendar",
  });

  attachWeatherNotes(tasks, input.forecast);

  // Sort tasks by start date for a clean timeline.
  tasks.sort((a, b) => a.windowStart.localeCompare(b.windowStart));

  return {
    cropId,
    anchorDate: fmt(anchor),
    anchorAssumption,
    windowStart: fmt(window.start),
    windowEnd: fmt(window.end),
    tasks,
  };
}

/** Attach a delay note to any fertilizer task with ≥40 mm rain forecast within ~2 days. */
function attachWeatherNotes(
  tasks: SeasonTask[],
  forecast?: { daily: { date: string; rainMm: number }[] },
): void {
  if (!forecast?.daily?.length) return;
  const fertStages = new Set(["basal_fertilizer", "urea_topdress"]);
  for (const task of tasks) {
    if (!fertStages.has(task.stage)) continue;
    const taskTime = new Date(task.windowStart).getTime();
    const heavy = forecast.daily.find((d) => {
      const diffDays = Math.abs(new Date(d.date).getTime() - taskTime) / 86_400_000;
      return diffDays <= 2 && d.rainMm >= HEAVY_RAIN_MM;
    });
    if (heavy) {
      task.weatherNote = `≥${HEAVY_RAIN_MM} mm rain forecast around ${heavy.date} (${heavy.rainMm} mm) — consider delaying to cut runoff/leaching loss.`;
    }
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
