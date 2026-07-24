import { apiFetch } from "./client.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: "Bearer";
  user: AuthUser;
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
}

export function signup(
  name: string,
  email: string,
  password: string,
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/signup", {
    method: "POST",
    body: { name, email, password },
    auth: false,
  });
}

export function me(): Promise<AuthUser> {
  return apiFetch<AuthUser>("/auth/me");
}

/** Full-page redirect into the backend's Google OAuth flow. */
export function googleLoginUrl(): string {
  return "/auth/google";
}
