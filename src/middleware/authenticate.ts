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
