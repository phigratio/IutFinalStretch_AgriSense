import { Router } from "express";
import { AuthService } from "../auth/service.js";
import { getDefaultAuthStore, type AuthStore } from "../auth/store.js";
import { GoogleOAuthService, getOAuthStateFromCookie } from "../auth/googleOAuth.js";
import { BdappsAuthService } from "../auth/bdappsAuth.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { config } from "../config.js";

export function createAuthRouter(store: AuthStore = getDefaultAuthStore()): Router {
  const router = Router();
  const authService = new AuthService(store);
  const googleOAuthService = new GoogleOAuthService(store);
  const bdappsAuthService = new BdappsAuthService(store);

  router.post("/signup", async (req, res) => {
    res.status(201).json(await authService.signup(req.body ?? {}));
  });

  router.post("/login", async (req, res) => {
    res.json(await authService.login(req.body ?? {}));
  });

  router.get("/me", authenticate, async (req, res) => {
    const auth = (req as typeof req & AuthenticatedRequest).auth!;
    res.json(await authService.getUser(auth.sub));
  });

  router.post("/logout", (_req, res) => {
    res.status(204).send();
  });

  // BDApps phone identity (verification / channel activation; doubles as
  // mobile sign-in). Additive to email/Google — same shared AppUser + token.
  router.post("/bdapps/otp/request", async (req, res) => {
    res.json(await bdappsAuthService.requestOtp(req.body?.mobile));
  });

  router.post("/bdapps/otp/verify", async (req, res) => {
    res.json(
      await bdappsAuthService.verifyOtp({
        referenceNo: req.body?.referenceNo,
        otp: req.body?.otp,
        mobile: req.body?.mobile,
        name: req.body?.name,
      }),
    );
  });

  // Web: logged-in user verifies their phone to enable BDApps features.
  // Activates the channel on the CURRENT user — no new user/token (R3).
  router.post("/bdapps/verify-phone", authenticate, async (req, res) => {
    const auth = (req as typeof req & AuthenticatedRequest).auth!;
    res.json(
      await bdappsAuthService.activatePhoneForUser(auth.sub, {
        referenceNo: req.body?.referenceNo,
        otp: req.body?.otp,
        mobile: req.body?.mobile,
      }),
    );
  });

  router.get("/google", (_req, res) => {
    googleOAuthService.createAuthorizationRedirect(res);
  });

  router.get("/google/callback", async (req, res) => {
    const accessToken = await googleOAuthService.handleCallback({
      code: req.query.code,
      state: req.query.state,
      cookieState: getOAuthStateFromCookie(req.get("cookie")),
    });
    res.clearCookie("google_oauth_state");

    if (config.frontendAuthSuccessUrl) {
      const url = new URL(config.frontendAuthSuccessUrl);
      url.searchParams.set("token", accessToken);
      res.redirect(url.toString());
      return;
    }

    res.json({ accessToken, tokenType: "Bearer" });
  });

  return router;
}

export const authRouter = createAuthRouter();
