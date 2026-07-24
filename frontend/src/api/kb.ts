import { apiFetch } from "./client.js";

const tenantHeaders = (userId: string) => ({ "x-user-id": userId });

export function postTenantPrice(tenantId: string, userId: string, body: Record<string, unknown>) {
  return apiFetch(`/api/tenants/${encodeURIComponent(tenantId)}/prices`, {
    method: "POST", body, headers: tenantHeaders(userId),
  });
}

export function postTenantDocument(tenantId: string, userId: string, body: Record<string, unknown>) {
  return apiFetch(`/api/tenants/${encodeURIComponent(tenantId)}/kb/docs`, {
    method: "POST", body, headers: tenantHeaders(userId),
  });
}
