/**
 * BizPilot: Server-Side PostgreSQL Connection Pool
 *
 * Provides a production-ready, singleton connection pool using standard `pg` (node-postgres).
 * Strictly server-only: client components cannot and must not import this module.
 *
 * Security Invariants:
 * 1. Reads connection details strictly from server-only `DATABASE_URL`.
 * 2. Connection strings and passwords are NEVER exposed to client bundles, logs, or API responses.
 * 3. Parameterized queries ($1, $2, ...) MUST be used for all user inputs.
 * 4. Multi-table mutations must execute inside `withTransaction`.
 * 5. If `DATABASE_URL` is absent, functions report unconfigured state gracefully without crashing.
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { isDatabaseConfigured, sanitizeDatabaseUrl } from "../services/backend-config";

export { isDatabaseConfigured, sanitizeDatabaseUrl };

export class DatabaseNotConfiguredError extends Error {
  constructor(message = "PostgreSQL is not configured. DATABASE_URL environment variable is missing.") {
    super(message);
    this.name = "DatabaseNotConfiguredError";
  }
}

// Global declaration for Next.js hot-reload singleton preservation
declare global {
  // eslint-disable-next-line no-var
  var __bizpilot_pg_pool: Pool | undefined;
}


/**
 * Internal getter for the singleton Pool instance.
 */
function getPool(): Pool {
  if (typeof (globalThis as any).window !== "undefined") {
    throw new Error("SECURITY VIOLATION: Database access cannot be performed on client browser.");
  }

  if (!isDatabaseConfigured()) {
    throw new DatabaseNotConfiguredError();
  }

  if (!globalThis.__bizpilot_pg_pool) {
    const connectionString = process.env.DATABASE_URL!;
    const isRemote =
      connectionString.includes("supabase.co") ||
      !connectionString.includes("localhost") &&
      !connectionString.includes("127.0.0.1");

    globalThis.__bizpilot_pg_pool = new Pool({
      connectionString,
      ssl: isRemote ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Handle idle client errors gracefully to prevent node unhandled exceptions
    globalThis.__bizpilot_pg_pool.on("error", (err: any) => {
      // Log sanitized notice
      console.error("[PostgreSQL Pool Error]", err.message);
    });
  }

  return globalThis.__bizpilot_pg_pool;
}

/**
 * Executes a parameterized SQL query against PostgreSQL.
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const pool = getPool();
  return pool.query<T>(text, params);
}

/**
 * Executes a callback within a database transaction (BEGIN ... COMMIT / ROLLBACK).
 * Automatically releases the acquired client back to the pool.
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("[Transaction Rollback Failed]", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

export interface DatabaseHealthResult {
  configured: boolean;
  reachable: boolean;
  latencyMs?: number;
  serverTime?: string;
  version?: string;
  error?: string;
}

/**
 * Diagnostic health check for the PostgreSQL database connection.
 * Never leaks password or raw credentials.
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealthResult> {
  if (!isDatabaseConfigured()) {
    return {
      configured: false,
      reachable: false,
      error: "DATABASE_URL environment variable is not configured.",
    };
  }

  const start = Date.now();
  try {
    const res = await query<{ now: string; pg_version: string }>(
      "SELECT NOW() as now, version() as pg_version"
    );
    const row = res.rows[0];
    return {
      configured: true,
      reachable: true,
      latencyMs: Date.now() - start,
      serverTime: row?.now,
      version: row?.pg_version?.split(" ")?.slice(0, 2)?.join(" "),
    };
  } catch (err: any) {
    return {
      configured: true,
      reachable: false,
      latencyMs: Date.now() - start,
      error: err.message || "Failed to reach database server.",
    };
  }
}

/**
 * Graceful shutdown for database pool (useful in testing or process teardown).
 */
export async function closePool(): Promise<void> {
  if (globalThis.__bizpilot_pg_pool) {
    await globalThis.__bizpilot_pg_pool.end();
    globalThis.__bizpilot_pg_pool = undefined;
  }
}
