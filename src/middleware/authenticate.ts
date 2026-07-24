import type { RequestHandler } from "express";
import { verifyAuthToken, type AuthTokenPayload } from "../auth/tokens.js";
import { HttpError } from "./errorHandler.js";

export interface AuthenticatedRequest {
  auth?: AuthTokenPayload;
}

export const authenticate: RequestHandler = (req, _res, next) => {
  const authorization = req.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "Missing bearer token");
  }

  const payload = verifyAuthToken(authorization.slice("Bearer ".length));
  if (!payload) {
    throw new HttpError(401, "Invalid authentication token");
  }

  (req as typeof req & AuthenticatedRequest).auth = payload;
  next();
};

/** Guard a route by role. Must run after `authenticate`. */
export function requireRole(...roles: ("user" | "tenant" | "admin")[]): RequestHandler {
  return (req, _res, next) => {
    const auth = (req as typeof req & AuthenticatedRequest).auth;
    if (!auth) {
      throw new HttpError(401, "Authentication required");
    }
    if (!roles.includes(auth.role)) {
      throw new HttpError(403, "You do not have permission to perform this action");
    }
    next();
  };
}
