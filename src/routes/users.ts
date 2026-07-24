import { Router } from "express";
import { getDefaultAuthStore, DuplicateEmailError, type AuthStore, type AuthUser } from "../auth/store.js";
import { hashPassword } from "../auth/password.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { HttpError } from "../middleware/errorHandler.js";

/** Admin-panel view of a user — never exposes the password hash. */
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  provider: "password" | "oauth";
  createdAt: string;
}

export function toAdminUser(user: AuthUser): AdminUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    provider: user.passwordHash ? "password" : "oauth",
    createdAt: user.createdAt,
  };
}

const minPasswordLength = 8;

export function createUsersRouter(store: AuthStore = getDefaultAuthStore()): Router {
  const router = Router();

  // Every admin endpoint below requires a valid bearer token.
  router.use(authenticate);

  router.get("/", async (_req, res) => {
    res.json((await store.listUsers()).map(toAdminUser));
  });

  router.get("/:id", async (req, res) => {
    const user = await store.findUserById(req.params.id);
    if (!user) {
      throw new HttpError(404, `User ${req.params.id} not found`);
    }
    res.json(toAdminUser(user));
  });

  router.post("/", async (req, res) => {
    const { name, email, password } = req.body ?? {};

    if (typeof name !== "string" || name.trim().length < 1) {
      throw new HttpError(400, "Name is required");
    }
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      throw new HttpError(400, "Email must be valid");
    }
    if (typeof password !== "string" || password.length < minPasswordLength) {
      throw new HttpError(400, `Password must be at least ${minPasswordLength} characters`);
    }

    try {
      const user = await store.createPasswordUser({
        email: email.trim().toLowerCase(),
        name: name.trim(),
        passwordHash: await hashPassword(password),
      });
      res.status(201).json(toAdminUser(user));
    } catch (error) {
      if (error instanceof DuplicateEmailError) {
        throw new HttpError(409, error.message);
      }
      throw error;
    }
  });

  router.delete("/:id", async (req, res) => {
    const auth = (req as typeof req & AuthenticatedRequest).auth!;
    // Guard against an admin locking themselves out of the panel.
    if (auth.sub === req.params.id) {
      throw new HttpError(400, "You cannot delete your own account");
    }

    if (!(await store.deleteUser(req.params.id))) {
      throw new HttpError(404, `User ${req.params.id} not found`);
    }
    res.status(204).send();
  });

  return router;
}

export const usersRouter = createUsersRouter();
