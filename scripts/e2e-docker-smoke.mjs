#!/usr/bin/env node

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";
const runRealBdapps = process.env.E2E_BDAPPS_REAL === "1";
const runPaymentCheckout = process.env.E2E_PAYMENT_CHECKOUT === "1";

const state = {
  sessionId: undefined,
  farmId: undefined,
  planId: undefined,
  baseline: undefined,
  temporalWorkflowId: undefined,
};

const tests = [
  ["frontend health proxy", testFrontendHealth],
  ["frontend pages resolve", testFrontendPages],
  ["agent intake asks targeted gaps", testAgentIntakeGaps],
  ["agent intake complete turn", testAgentIntakeComplete],
  ["agrisense full plan workflow", testAgriSensePlan],
  ["agrisense trace and plan readback", testAgriSenseReadbacks],
  ["agrisense scenario simulation", testAgriSenseScenarioSimulation],
  ["finance summary and ledger", testFinanceManagement],
  ["temporal schedules API", testTemporalSchedules],
  ["temporal manual memory workflow", testTemporalManualWorkflow],
  ["payments route wiring", testPaymentsRoutes],
  ["bdapps route wiring", testBdappsRoutes],
];

for (const [name, fn] of tests) {
  const startedAt = Date.now();
  try {
    await fn();
    console.log(`PASS ${name} (${Date.now() - startedAt}ms)`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  }
}

console.log("E2E smoke passed");

async function testFrontendHealth() {
  const health = await requestJson("/health");
  assertEqual(health.status, "ok", "health.status");
}

async function testFrontendPages() {
  for (const page of ["/agrisense", "/agrisense?stage=scenario", "/agent-intake", "/finance", "/temporal", "/payments", "/bdapps"]) {
    const response = await fetch(`${baseUrl}${page}`);
    const text = await response.text();
    assert(response.ok, `${page} returned ${response.status}`);
    assert(text.includes("<!doctype html>") || text.includes("<!DOCTYPE html>"), `${page} did not return frontend HTML`);
  }
}

async function testAgentIntakeGaps() {
  const result = await requestJson("/api/agent/intake", {
    method: "POST",
    body: {
      message: "I have land and want to plant something",
      preferredLanguage: "en",
    },
  });
  assert(Array.isArray(result.missingFields), "missingFields should be an array");
  for (const field of ["location", "farmSize", "soilType", "waterAvailability", "budget", "targetSeason"]) {
    assert(result.missingFields.includes(field), `expected missing field ${field}`);
  }
  assertEqual(result.intakeComplete, false, "intakeComplete");
}

async function testAgentIntakeComplete() {
  const result = await requestJson("/api/agent/intake", {
    method: "POST",
    body: {
      message: "2 acres in Gazipur, sandy loam soil, rainfed, budget 45000 BDT, Aman season",
      preferredLanguage: "en",
    },
  });
  assertEqual(result.intakeComplete, true, "intakeComplete");
  assertEqual(result.missingFields.length, 0, "missingFields.length");
  assert(result.sessionId, "sessionId missing");
}

async function testAgriSensePlan() {
  const result = await requestJson("/api/agrisense/message", {
    method: "POST",
    body: {
      message: "2 acres in Dhaka, soil type is bele, water is from nearby river and rain, budget is 45k and target season is monsoon",
      preferredLanguage: "en",
    },
  });
  assertEqual(result.missingFields.length, 0, "missingFields.length");
  assert(result.weather?.daily?.length > 0, "weather daily forecast missing");
  assert(result.cropRankings?.length >= 3, "crop rankings missing");
  assert(result.seasonPlan?.id, "season plan id missing");
  assert(result.trace?.some((event) => event.toolName === "weather.fetch"), "weather trace missing");
  assert(result.trace?.some((event) => event.toolName === "mem0.memory.add"), "mem0 trace missing");

  state.sessionId = result.sessionId;
  state.farmId = result.farmId;
  state.planId = result.seasonPlan.id;
  state.baseline = result;
}

async function testAgriSenseReadbacks() {
  assert(state.sessionId, "sessionId from previous test missing");
  assert(state.planId, "planId from previous test missing");

  const trace = await requestJson(`/api/agrisense/sessions/${state.sessionId}/trace`);
  assert(Array.isArray(trace), "trace readback should be an array");
  assert(trace.length > 0, "trace readback empty");

  const plan = await requestJson(`/api/agrisense/plans/${state.planId}`);
  assert(plan.id, "plan readback missing id");
  assert(plan.items?.length > 0, "plan items readback empty");
}

async function testAgriSenseScenarioSimulation() {
  assert(state.baseline, "baseline AgriSense result from previous test missing");
  assert(state.sessionId, "sessionId from previous test missing");

  const result = await requestJson("/api/agrisense/scenarios/simulate", {
    method: "POST",
    body: {
      sessionId: state.sessionId,
      farmId: state.farmId,
      planId: state.planId,
      message: "What if rainfall drops 30%?",
      deltas: { rainfallPct: -30 },
      baseline: state.baseline,
    },
  });

  assert(result.id, "scenario simulation persistence id missing");
  assertEqual(result.deltas.rainfallPct, -30, "scenario rainfall delta");
  assert(result.scenario?.seasonPlan?.financials, "scenario financials missing");
  assert(typeof result.comparison?.netProfitBdt === "number", "scenario comparison net profit missing");
  assert(result.trace?.some((event) => event.toolName === "scenario.compare"), "scenario compare trace missing");
}

async function testFinanceManagement() {
  assert(state.farmId, "farmId from previous test missing");
  assert(state.planId, "planId from previous test missing");

  const summary = await requestJson(`/api/finance/summary?farmId=${state.farmId}&seasonPlanId=${state.planId}&year=2026`);
  assert(summary.monthly?.length === 12, "finance monthly projection missing");
  assert(typeof summary.totals?.totalExpenseBdt === "number", "finance expenses missing");
  assert(summary.entries?.some((entry) => entry.source === "season_plan"), "season plan entries missing from finance");
  assert(summary.agentInsights?.length > 0, "finance agent insights missing");
  assert(summary.trace?.some((event) => event.toolName === "finance.aggregate_monthly"), "finance trace missing");

  const created = await requestJson("/api/finance/entries", {
    method: "POST",
    body: {
      farmId: state.farmId,
      seasonPlanId: state.planId,
      entryType: "expense",
      category: "labor",
      label: "E2E extra labor",
      amountBdt: 750,
      entryDate: "2026-07-24",
      season: "monsoon",
      crop: summary.plan?.crop ?? "rice",
    },
  }, { expectedStatus: 201 });
  assert(created.id, "created finance entry missing id");

  const updated = await requestJson(`/api/finance/entries/${created.id}`, {
    method: "PATCH",
    body: { amountBdt: 900 },
  });
  assertEqual(updated.amountBdt, 900, "updated finance amount");

  const advice = await requestJson("/api/finance/advice", {
    method: "POST",
    body: { farmId: state.farmId, seasonPlanId: state.planId, year: 2026 },
  });
  assert(advice.agentInsights?.length > 0, "finance advice missing insights");

  await requestJson(`/api/finance/entries/${created.id}`, { method: "DELETE" }, { expectedStatus: 204 });
}

async function testTemporalSchedules() {
  await requestJson("/api/temporal/schedules/ensure", { method: "POST", body: {} });
  const result = await requestJson("/api/temporal/schedules");
  assertEqual(result.taskQueue, "agrisense-cron", "temporal task queue");
  const workflowTypes = result.schedules.map((schedule) => schedule.workflowType);
  for (const workflowType of ["weatherAlertSweepWorkflow", "planTaskReminderSweepWorkflow", "memoryRefreshSweepWorkflow"]) {
    assert(workflowTypes.includes(workflowType), `missing Temporal workflow ${workflowType}`);
  }
}

async function testTemporalManualWorkflow() {
  const started = await requestJson("/api/temporal/workflows/memoryRefreshSweepWorkflow/run", {
    method: "POST",
    body: { maxFarms: 5 },
  }, { expectedStatus: 202 });
  assert(started.workflowId, "manual workflow id missing");
  state.temporalWorkflowId = started.workflowId;

  const result = await waitForTemporalResult(started.workflowId);
  assertEqual(result.workflow, "memory_refresh_sweep", "workflow result name");
  assert(typeof result.scanned === "number", "workflow scanned count missing");
}

async function testPaymentsRoutes() {
  const invalidCheckout = await requestJson(
    "/api/payments/checkout",
    { method: "POST", body: { mobile: "", amountBdt: 25 } },
    { expectedStatus: 400 },
  );
  assert(invalidCheckout.error, "expected payment validation error");

  const missingReceipt = await requestJson(
    "/api/payments/00000000-0000-0000-0000-000000000000",
    undefined,
    { expectedStatus: 404 },
  );
  assert(missingReceipt.error, "expected missing payment error");

  if (runPaymentCheckout) {
    const checkout = await requestJson("/api/payments/checkout", {
      method: "POST",
      body: {
        mobile: process.env.E2E_PAYMENT_MOBILE ?? "01812345678",
        amountBdt: Number(process.env.E2E_PAYMENT_AMOUNT_BDT ?? 2),
        description: "E2E AgriSense checkout",
        sessionId: state.sessionId,
      },
    });
    assert(checkout.paymentId, "checkout paymentId missing");
  }
}

async function testBdappsRoutes() {
  const invalidBalance = await requestJson(
    "/api/bdapps/balance",
    { method: "POST", body: { mobile: "12345" } },
    { expectedStatus: 400 },
  );
  assert(invalidBalance.error, "expected bdapps validation error");

  if (runRealBdapps) {
    const balance = await requestJson("/api/bdapps/balance", {
      method: "POST",
      body: { mobile: process.env.E2E_BDAPPS_MOBILE ?? "01812345678" },
    });
    assert(balance, "bdapps real balance response missing");
  }
}

async function waitForTemporalResult(workflowId) {
  let lastError;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      return await requestJson(`/api/temporal/workflows/${workflowId}/result`);
    } catch (error) {
      lastError = error;
      await sleep(2000);
    }
  }
  throw lastError ?? new Error(`Temporal workflow ${workflowId} did not finish`);
}

async function requestJson(path, options = {}, { expectedStatus = 200 } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: options.body === undefined ? undefined : { "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;

  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}, expected ${expectedStatus}: ${text}`);
  }

  return payload;
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
