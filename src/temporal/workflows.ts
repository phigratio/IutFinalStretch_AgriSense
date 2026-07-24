import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "./activities.js";
import type { MemoryRefreshInput, PlanReminderInput, SweepResult, WeatherAlertInput } from "./types.js";

const {
  memoryRefreshSweepActivity,
  planTaskReminderSweepActivity,
  weatherAlertSweepActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    maximumAttempts: 3,
    initialInterval: "10 seconds",
    maximumInterval: "1 minute",
  },
});

export async function weatherAlertSweepWorkflow(input: WeatherAlertInput = {}): Promise<SweepResult> {
  return weatherAlertSweepActivity(input);
}

export async function planTaskReminderSweepWorkflow(input: PlanReminderInput = {}): Promise<SweepResult> {
  return planTaskReminderSweepActivity(input);
}

export async function memoryRefreshSweepWorkflow(input: MemoryRefreshInput = {}): Promise<SweepResult> {
  return memoryRefreshSweepActivity(input);
}
