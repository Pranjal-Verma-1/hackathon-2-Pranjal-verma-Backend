/**
 * BizPilot: Backend Connectivity & Environment Configuration
 *
 * Implements safe, zero-crash environment inspection.
 * When DATABASE_URL is missing, the application automatically operates
 * in DEMO MODE with browser-local persistence and clear UI labelling.
 *
 * Security Invariants:
 * 1. DATABASE_URL is server-only and NEVER exposed to client bundles or browser logs.
 * 2. Supabase is used EXCLUSIVELY as a hosted PostgreSQL database.
 *    No Supabase Auth, Storage, Realtime, Edge Functions, or PostgREST APIs are used.
 * 3. Secrets are never printed in plain text.
 */

export const DEFAULT_DEMO_TENANT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
export const DEFAULT_DEMO_TENANT_SLUG = "shree-ganesh-kirana";
export const DEFAULT_DEMO_USER_ID = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

/**
 * Returns true if the DATABASE_URL environment variable is present and valid.
 */
export function isDatabaseConfigured(): boolean {
  if (typeof (globalThis as any).window !== "undefined") {
    return false;
  }
  const url = process.env.DATABASE_URL;
  return Boolean(url && url.trim().length > 10 && url.startsWith("postgres"));
}

/**
 * Sanitizes a database URL to hide credentials for safe logging and diagnostics.
 */
export function sanitizeDatabaseUrl(rawUrl?: string): string {
  if (!rawUrl) return "[UNCONFIGURED]";
  try {
    const parsed = new URL(rawUrl);
    parsed.password = "***";
    return parsed.toString();
  } catch {
    return "[MALFORMED_URL]";
  }
}

export interface BackendConfig {
  isDemoMode: boolean;
  hasDatabaseConfigured: boolean;
  hasValidCredentials: boolean;
  sanitizedDatabaseUrl?: string;
}

export function getBackendConfig(): BackendConfig {
  const forceDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const configured = isDatabaseConfigured();

  return {
    isDemoMode: forceDemo || !configured,
    hasDatabaseConfigured: configured,
    hasValidCredentials: configured,
    sanitizedDatabaseUrl: configured
      ? sanitizeDatabaseUrl(process.env.DATABASE_URL)
      : undefined,
  };
}

export function isDemoMode(): boolean {
  return getBackendConfig().isDemoMode;
}
