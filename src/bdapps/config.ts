/**
 * BDApps credentials + settings, loaded from environment variables.
 *
 * Copy `.env.example` to `.env` and fill in BDAPPS_APP_ID and BDAPPS_PASSWORD
 * from the BDApps provisioning dashboard (see ../../BDApps-Service-Setup.md).
 */

// Load .env if present. process.loadEnvFile is built into Node 20.12+/22 — no
// dependency needed. It throws if there's no .env file, which is fine.
try {
  process.loadEnvFile();
} catch {
  // No .env file — we'll read from real environment variables instead, and
  // surface a friendly error later if credentials are actually missing.
}

export interface BdappsConfig {
  /** Base URL of the BDApps API. */
  baseUrl: string;
  /** Application ID from the BDApps dashboard, e.g. "APP_EXAMPLE". */
  applicationId: string;
  /** Application password / API key (~32 chars). */
  password: string;
  /** A short app name/hash, used by the OTP request API. */
  appName: string;
}

export const bdappsConfig: BdappsConfig = {
  baseUrl: process.env.BDAPPS_BASE_URL ?? "https://developer.bdapps.com",
  applicationId: process.env.BDAPPS_APP_ID ?? "",
  password: process.env.BDAPPS_PASSWORD ?? "",
  appName: process.env.BDAPPS_APP_NAME ?? "HackApp",
};
