import { Router } from "express";
import { authenticate, requireRole, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { getDefaultOnboardingStore, type OnboardingStore, type OnboardingInput } from "../onboarding/store.js";
import { getDefaultAuthStore, type AuthStore } from "../auth/store.js";
import { getKbRuntime } from "../kb/runtime.js";

/** Injectable runtime so the routes are testable with in-memory stores. */
export interface OnboardingRuntime {
  onboarding: OnboardingStore;
  auth: AuthStore;
}
let runtime: OnboardingRuntime | null = null;
function rt(): OnboardingRuntime {
  runtime ??= { onboarding: getDefaultOnboardingStore(), auth: getDefaultAuthStore() };
  return runtime;
}
export function setOnboardingRuntime(partial: Partial<OnboardingRuntime>): void {
  runtime = { ...rt(), ...partial };
}

function uid(req: unknown): string {
  return (req as AuthenticatedRequest).auth!.sub;
}
function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "tenant";
}

function readProfileFields(body: Record<string, unknown>): Partial<OnboardingInput> {
  return {
    fullName: typeof body.fullName === "string" ? body.fullName : undefined,
    phone: typeof body.phone === "string" ? body.phone : undefined,
    upazila: typeof body.upazila === "string" ? body.upazila : undefined,
    farmSizeDecimals: body.farmSizeDecimals != null ? Number(body.farmSizeDecimals) : undefined,
    soilTexture: typeof body.soilTexture === "string" ? body.soilTexture : undefined,
    waterAvailability: typeof body.waterAvailability === "string" ? body.waterAvailability : undefined,
    budgetBdt: body.budgetBdt != null ? Number(body.budgetBdt) : undefined,
    targetSeason: typeof body.targetSeason === "string" ? body.targetSeason : undefined,
  };
}

export const onboardingRouter: Router = Router();

// ---- User onboarding (any authenticated user) ------------------------------

/** Current user's role + onboarding status (drives the Bengali onboarding screen). */
onboardingRouter.get("/onboarding/me", authenticate, async (req, res, next) => {
  try {
    const user = await rt().auth.findUserById(uid(req));
    const onboarding = await rt().onboarding.getOnboardingByUser(uid(req));
    res.json({ role: user?.role ?? "user", onboarding: onboarding ?? null });
  } catch (err) {
    next(err);
  }
});

/** Choice A — request to become a tenant (admin decides). */
onboardingRouter.post("/onboarding/tenant-request", authenticate, async (req, res, next) => {
  try {
    const b = req.body as Record<string, unknown>;
    if (typeof b.orgName !== "string" || typeof b.district !== "string" || !b.orgName.trim() || !b.district.trim()) {
      res.status(400).json({ error: "orgName and district are required" });
      return;
    }
    const created = await rt().onboarding.createTenantRequest({
      userId: uid(req),
      orgName: b.orgName.trim(),
      district: b.district.trim(),
      upazila: typeof b.upazila === "string" ? b.upazila : undefined,
      note: typeof b.note === "string" ? b.note : undefined,
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

/** Choice B — fill your own farmer profile. */
onboardingRouter.post("/onboarding/profile", authenticate, async (req, res, next) => {
  try {
    const b = req.body as Record<string, unknown>;
    if (typeof b.district !== "string" || !b.district.trim()) {
      res.status(400).json({ error: "district is required" });
      return;
    }
    const saved = await rt().onboarding.upsertOnboarding({
      userId: uid(req),
      district: b.district.trim(),
      filledBy: "self",
      ...readProfileFields(b),
    });
    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
});

/** Choice C — ask a tenant to fill your profile for you. */
onboardingRouter.post("/onboarding/assist-request", authenticate, async (req, res, next) => {
  try {
    const b = req.body as Record<string, unknown>;
    if (typeof b.district !== "string" || !b.district.trim()) {
      res.status(400).json({ error: "district is required" });
      return;
    }
    const created = await rt().onboarding.createAssistRequest({
      userId: uid(req),
      fullName: typeof b.fullName === "string" ? b.fullName : undefined,
      phone: typeof b.phone === "string" ? b.phone : undefined,
      district: b.district.trim(),
      upazila: typeof b.upazila === "string" ? b.upazila : undefined,
      note: typeof b.note === "string" ? b.note : undefined,
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// ---- Admin ------------------------------------------------------------------

onboardingRouter.get("/admin/tenant-requests", authenticate, requireRole("admin"), async (req, res, next) => {
  try {
    const status = req.query.status as "pending" | "approved" | "rejected" | undefined;
    res.json(await rt().onboarding.listTenantRequests(status));
  } catch (err) {
    next(err);
  }
});

/** Approve a tenant request: grant the tenant role, create the Tenant + jurisdiction + membership. */
onboardingRouter.post("/admin/tenant-requests/:id/approve", authenticate, requireRole("admin"), async (req, res, next) => {
  try {
    const reqRec = await rt().onboarding.getTenantRequest(String(req.params.id));
    if (!reqRec) {
      res.status(404).json({ error: "Tenant request not found" });
      return;
    }
    const { tenantStore } = getKbRuntime();
    const slug = `${slugify(reqRec.orgName)}-${reqRec.id.slice(0, 4)}`;
    await tenantStore.createTenant({ slug, name: reqRec.orgName, kind: "district" });
    await tenantStore.addJurisdiction(slug, reqRec.district, reqRec.upazila);
    await tenantStore.addMember(slug, reqRec.userId, "tenant_admin");
    await rt().auth.setUserRole(reqRec.userId, "tenant");
    const decided = await rt().onboarding.decideTenantRequest(reqRec.id, "approved", uid(req));
    res.json({ ok: true, tenantSlug: slug, request: decided });
  } catch (err) {
    next(err);
  }
});

onboardingRouter.post("/admin/tenant-requests/:id/reject", authenticate, requireRole("admin"), async (req, res, next) => {
  try {
    const decided = await rt().onboarding.decideTenantRequest(String(req.params.id), "rejected", uid(req));
    if (!decided) {
      res.status(404).json({ error: "Tenant request not found" });
      return;
    }
    res.json({ ok: true, request: decided });
  } catch (err) {
    next(err);
  }
});

/** Directly set a user's role (user | tenant | admin). */
onboardingRouter.post("/admin/users/:id/role", authenticate, requireRole("admin"), async (req, res, next) => {
  try {
    const role = (req.body as { role?: string }).role;
    if (role !== "user" && role !== "tenant" && role !== "admin") {
      res.status(400).json({ error: "role must be user, tenant or admin" });
      return;
    }
    const updated = await rt().auth.setUserRole(String(req.params.id), role);
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ id: updated.id, email: updated.email, role: updated.role });
  } catch (err) {
    next(err);
  }
});

// ---- Tenant -----------------------------------------------------------------

/** Assist requests a tenant can fulfil (optionally filtered by district). */
onboardingRouter.get("/tenant/assist-requests", authenticate, requireRole("tenant", "admin"), async (req, res, next) => {
  try {
    const district = req.query.district ? String(req.query.district) : undefined;
    res.json(await rt().onboarding.listAssistRequests({ district, status: "pending" }));
  } catch (err) {
    next(err);
  }
});

/** Fulfil an assist request by filling the farmer's profile on their behalf. */
onboardingRouter.post("/tenant/assist-requests/:id/fulfill", authenticate, requireRole("tenant", "admin"), async (req, res, next) => {
  try {
    const assist = await rt().onboarding.getAssistRequest(String(req.params.id));
    if (!assist) {
      res.status(404).json({ error: "Assist request not found" });
      return;
    }
    const b = req.body as Record<string, unknown>;
    const district = typeof b.district === "string" && b.district.trim() ? b.district.trim() : assist.district;
    const saved = await rt().onboarding.upsertOnboarding({
      userId: assist.userId,
      district,
      filledBy: "tenant",
      filledByUserId: uid(req),
      fullName: (typeof b.fullName === "string" ? b.fullName : undefined) ?? assist.fullName,
      phone: (typeof b.phone === "string" ? b.phone : undefined) ?? assist.phone,
      ...readProfileFields(b),
    });
    await rt().onboarding.fulfillAssistRequest(assist.id);
    res.json({ ok: true, onboarding: saved });
  } catch (err) {
    next(err);
  }
});
