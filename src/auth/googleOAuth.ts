import { randomBytes } from "node:crypto";
import type { Response } from "express";
import { config } from "../config.js";
import { HttpError } from "../middleware/errorHandler.js";
import type { AuthStore } from "./store.js";
import { AuthService } from "./service.js";

const googleAuthUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const googleUserInfoUrl = "https://openidconnect.googleapis.com/v1/userinfo";
const stateCookieName = "google_oauth_state";

export class GoogleOAuthService {
  constructor(private readonly store: AuthStore) {}

  createAuthorizationRedirect(res: Response): void {
    ensureConfigured();
    const state = randomBytes(24).toString("base64url");
    const url = new URL(googleAuthUrl);
    url.searchParams.set("client_id", config.googleClientId!);
    url.searchParams.set("redirect_uri", config.googleCallbackUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "select_account");

    res.cookie(stateCookieName, state, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: "lax",
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(url.toString());
  }

  async handleCallback(input: {
    code: unknown;
    state: unknown;
    cookieState: string | undefined;
  }): Promise<string> {
    ensureConfigured();
    if (
      typeof input.code !== "string" ||
      typeof input.state !== "string" ||
      !input.cookieState ||
      input.state !== input.cookieState
    ) {
      throw new HttpError(400, "Invalid OAuth state");
    }

    const tokenResponse = await fetch(googleTokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: input.code,
        client_id: config.googleClientId!,
        client_secret: config.googleClientSecret!,
        redirect_uri: config.googleCallbackUrl,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      throw new HttpError(502, "Google token exchange failed");
    }

    const tokens = (await tokenResponse.json()) as { access_token?: string };
    if (!tokens.access_token) {
      throw new HttpError(502, "Google token response did not include an access token");
    }

    const userInfoResponse = await fetch(googleUserInfoUrl, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userInfoResponse.ok) {
      throw new HttpError(502, "Google userinfo request failed");
    }

    const profile = (await userInfoResponse.json()) as {
      sub?: string;
      email?: string;
      name?: string;
      email_verified?: boolean;
    };
    if (!profile.sub || !profile.email || profile.email_verified !== true) {
      throw new HttpError(401, "Google account email must be verified");
    }

    const user = await this.store.upsertOAuthUser({
      provider: "google",
      providerUserId: profile.sub,
      email: profile.email,
      name: profile.name ?? profile.email,
      emailVerified: true,
    });

    return new AuthService(this.store).createResponse(user).accessToken;
  }
}

export function getOAuthStateFromCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim().split("="));
  const cookie = cookies.find(([key]) => key === stateCookieName);
  return cookie?.[1] ? decodeURIComponent(cookie[1]) : undefined;
}

function ensureConfigured(): void {
  if (!config.googleClientId || !config.googleClientSecret) {
    throw new HttpError(503, "Google OAuth is not configured");
  }
}
