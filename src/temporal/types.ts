export const AGRISENSE_TASK_QUEUE = "agrisense-cron";

export interface WeatherAlertInput {
  lookaheadDays?: number;
  rainfallThresholdMm?: number;
  maxFarms?: number;
}

export interface PlanReminderInput {
  lookaheadDays?: number;
  maxTasks?: number;
}

export interface MemoryRefreshInput {
  maxFarms?: number;
}

export interface SweepResult {
  workflow: string;
  scanned: number;
  created: number;
  skipped: number;
  errors: string[];
}

export interface TemporalScheduleDefinition {
  scheduleId: string;
  workflowType: "weatherAlertSweepWorkflow" | "planTaskReminderSweepWorkflow" | "memoryRefreshSweepWorkflow";
  description: string;
  cronExpression: string;
  args: unknown[];
}

export const AGRISENSE_SCHEDULES: TemporalScheduleDefinition[] = [
  {
    scheduleId: "agrisense-weather-alerts-daily-0700",
    workflowType: "weatherAlertSweepWorkflow",
    description: "Daily proactive weather-triggered advice for active farm plans.",
    cronExpression: "0 1 * * *",
    args: [{ lookaheadDays: 5, rainfallThresholdMm: 20, maxFarms: 50 }],
  },
  {
    scheduleId: "agrisense-plan-reminders-daily-0630",
    workflowType: "planTaskReminderSweepWorkflow",
    description: "Daily reminders for fertilizer, irrigation, pest, and harvest tasks due soon.",
    cronExpression: "30 0 * * *",
    args: [{ lookaheadDays: 3, maxTasks: 100 }],
  },
  {
    scheduleId: "agrisense-memory-refresh-every-6h",
    workflowType: "memoryRefreshSweepWorkflow",
    description: "Refresh semantic farm memory in mem0 for returning-farmer demos.",
    cronExpression: "0 */6 * * *",
    args: [{ maxFarms: 50 }],
  },
];
