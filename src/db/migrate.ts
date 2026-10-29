/**
 * BizPilot: PostgreSQL Schema Migration & Setup Runner
 *
 * Runs canonical PostgreSQL schema migrations safely when DATABASE_URL is configured.
 * Strictly non-destructive: uses `IF NOT EXISTS` and `ON CONFLICT DO UPDATE/NOTHING`.
 */

import { isDatabaseConfigured, query, withTransaction, closePool } from "./pool";
import fs from "fs";
import path from "path";

export interface MigrationResult {
  applied: boolean;
  message: string;
  error?: string;
  tablesFound?: string[];
}

export async function runDatabaseMigrations(): Promise<MigrationResult> {
  if (!isDatabaseConfigured()) {
    return {
      applied: false,
      message: "PostgreSQL is not configured. DATABASE_URL is missing. Operating in offline demo mode.",
    };
  }

  try {
    const migrationPath = path.resolve(__dirname, "../../migrations/20261029000003_standard_postgres.sql");
    const seedPath = path.resolve(__dirname, "../../migrations/seed.sql");

    if (!fs.existsSync(migrationPath)) {
      return {
        applied: false,
        message: `Migration file not found at: ${migrationPath}`,
      };
    }

    const migrationSql = fs.readFileSync(migrationPath, "utf-8");

    // Execute schema migration within a transaction
    await withTransaction(async (client) => {
      await client.query(migrationSql);
    });

    // Execute seed data if available
    if (fs.existsSync(seedPath)) {
      const seedSql = fs.readFileSync(seedPath, "utf-8");
      await withTransaction(async (client) => {
        await client.query(seedSql);
      });
    }

    // Verify existing tables
    const tablesRes = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`
    );

    const tablesFound = tablesRes.rows.map((r: { table_name: string }) => r.table_name);

    return {
      applied: true,
      message: "PostgreSQL canonical schema verified successfully.",
      tablesFound,
    };
  } catch (err: any) {
    return {
      applied: false,
      message: "Failed to apply database migration.",
      error: err.message || "Unknown migration error",
    };
  }
}

// Allow direct CLI execution: `tsx src/db/migrate.ts`
if (require.main === module || process.argv[1]?.endsWith("migrate.ts")) {
  runDatabaseMigrations()
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
      return closePool();
    })
    .catch((err) => {
      console.error("Migration error:", err);
      process.exit(1);
    });
}
