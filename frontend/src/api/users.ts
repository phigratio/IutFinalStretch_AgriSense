import { apiFetch } from "./client.js";

/** Mirrors AdminUser in src/routes/users.ts on the backend. */
export interface User {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  provider: "password" | "oauth";
  role: "user" | "tenant" | "admin";
  createdAt: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
}

export function listUsers(): Promise<User[]> {
  return apiFetch<User[]>("/api/users");
}

export function getUser(id: string): Promise<User> {
  return apiFetch<User>(`/api/users/${id}`);
}

export function createUser(input: CreateUserInput): Promise<User> {
  return apiFetch<User>("/api/users", { method: "POST", body: input });
}

export function deleteUser(id: string): Promise<void> {
  return apiFetch<void>(`/api/users/${id}`, { method: "DELETE" });
}
