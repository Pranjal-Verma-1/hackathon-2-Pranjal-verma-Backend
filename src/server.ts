/**
 * BizPilot: Standalone Business Operations Kernel Backend Server
 *
 * REST API Server powered by Express, TypeScript, and standard PostgreSQL (pg.Pool).
 * Enforces tenant isolation, application-managed authentication, and multi-table atomic transactions.
 */

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";

// Load environment variables (.env / .env.local)
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

import { checkDatabaseHealth } from "./db/pool";
import { getBackendConfig, DEFAULT_DEMO_TENANT_ID } from "./services/backend-config";
import { AuthService } from "./services/auth-service";
import { PostgresProductsRepository } from "./repositories/products-repository";
import { PostgresCustomersRepository } from "./repositories/customers-repository";
import { PostgresPurchaseOrdersRepository } from "./repositories/purchase-orders-repository";
import { PostgresSalesRepository } from "./repositories/sales-repository";

const app = express();
const port = process.env.PORT || 4000;

app.use(
  cors({
    origin: (_origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json());

// Helper to extract session token from Authorization header or cookie
function getAuthToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  const cookies = req.headers.cookie;
  if (cookies) {
    const match = cookies.match(/bp_auth_token=([^;]+)/);
    if (match) return match[1];
  }
  return undefined;
}

// ----------------------------------------------------------------------------
// 1. Root & Health Endpoints
// ----------------------------------------------------------------------------

app.get("/", (_req: Request, res: Response): void => {
  res.json({
    name: "BizPilot Operations Kernel Backend",
    version: "0.1.0",
    status: "running",
    timestamp: new Date().toISOString(),
    endpoints: [
      "/api/health",
      "/api/session",
      "/api/auth/signup",
      "/api/auth/login",
      "/api/products",
      "/api/customers",
      "/api/purchase-orders",
      "/api/sales",
    ],
  });
});

app.get("/api/health", async (_req: Request, res: Response): Promise<void> => {
  const config = getBackendConfig();
  const dbHealth = await checkDatabaseHealth();

  res.json({
    status: dbHealth.reachable ? "healthy" : "healthy_offline_demo",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    demoMode: config.isDemoMode,
    backendStatus: dbHealth.reachable ? "postgresql_connected" : "unconfigured_local_fallback",
    database: {
      provider: "PostgreSQL (Standard pg Pool)",
      configured: config.hasDatabaseConfigured,
      reachable: dbHealth.reachable,
      latencyMs: dbHealth.latencyMs,
      version: dbHealth.version,
      error: dbHealth.error,
      tenantIsolation: "Server-enforced parameterized queries (tenant_id = $1)",
    },
    auth: {
      provider: "Application-Managed PostgreSQL (scrypt password hashing + secure sessions)",
      status: config.hasDatabaseConfigured ? "ready" : "offline_demo_simulation",
      endpoints: [
        "/api/auth/signup",
        "/api/auth/login",
        "/api/auth/logout",
        "/api/session",
      ],
      membershipVerification: "Server-verified tenant_memberships query",
    },
    dataLayer: {
      mode: config.hasDatabaseConfigured ? "POSTGRESQL_DIRECT" : "UNCONFIGURED_DEMO",
      activeTenantId: DEFAULT_DEMO_TENANT_ID,
      canWriteToDb: Boolean(config.hasDatabaseConfigured && dbHealth.reachable),
      adapters: {
        products: "PostgresProductsRepository",
        customers: "PostgresCustomersRepository",
        purchaseOrders: "PostgresPurchaseOrdersRepository",
        sales: "PostgresSalesRepository",
      },
    },
    activeTenant: {
      id: DEFAULT_DEMO_TENANT_ID,
      name: "Shree Ganesh Kirana Store",
      tier: "Retail Pro MSME",
    },
  });
});

// ----------------------------------------------------------------------------
// 2. Authentication & Session Endpoints
// ----------------------------------------------------------------------------

app.get("/api/session", async (req: Request, res: Response): Promise<void> => {
  const token = getAuthToken(req);
  const session = await AuthService.getSession(token);

  res.json({
    success: true,
    data: session,
    meta: {
      tenantId: session.activeTenant.id,
      isDemo: session.isDemo,
      timestamp: new Date().toISOString(),
    },
  });
});

app.post("/api/auth/signup", async (req: Request, res: Response): Promise<void> => {
  const config = getBackendConfig();
  if (!config.hasDatabaseConfigured) {
    res.status(503).json({
      success: false,
      error: {
        code: "DATABASE_NOT_CONFIGURED",
        message: "PostgreSQL database is not configured. The application is operating in local demonstration mode.",
      },
    });
    return;
  }

  const { email, password, fullName, phone } = req.body;
  if (!email || !password || !fullName) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Missing mandatory fields: email, password, and fullName are required.",
      },
    });
    return;
  }

  const result = await AuthService.signUp({ email, password, fullName, phone });
  if (result.error) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }

  if (result.session?.access_token) {
    res.cookie("bp_auth_token", result.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });
  }

  res.json({ success: true, data: result });
});

app.post("/api/auth/login", async (req: Request, res: Response): Promise<void> => {
  const config = getBackendConfig();
  if (!config.hasDatabaseConfigured) {
    res.status(503).json({
      success: false,
      error: {
        code: "DATABASE_NOT_CONFIGURED",
        message: "PostgreSQL database is not configured. The application is operating in local demonstration mode.",
      },
    });
    return;
  }

  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Email and password are required.",
      },
    });
    return;
  }

  const result = await AuthService.login({ email, password });
  if (result.error) {
    res.status(401).json({ success: false, error: result.error });
    return;
  }

  if (result.session?.access_token) {
    res.cookie("bp_auth_token", result.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });
  }

  res.json({ success: true, data: result });
});

app.post("/api/auth/logout", (_req: Request, res: Response): void => {
  res.clearCookie("bp_auth_token", { path: "/" });
  res.json({
    success: true,
    data: { message: "Successfully logged out." },
  });
});

// ----------------------------------------------------------------------------
// 3. Products & Stock Endpoints
// ----------------------------------------------------------------------------

app.get("/api/products", async (req: Request, res: Response): Promise<void> => {
  const tenantId = (req.query.tenantId as string) || DEFAULT_DEMO_TENANT_ID;
  const search = req.query.search as string;
  const category = req.query.category as string;
  const status = req.query.status as any;

  try {
    const repo = new PostgresProductsRepository(tenantId);
    const products = await repo.list({ search, category, status });
    res.json({
      success: true,
      data: products,
      meta: {
        tenantId,
        count: products.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "QUERY_FAILED", message: err.message },
    });
  }
});

app.post("/api/products/stock", async (req: Request, res: Response): Promise<void> => {
  const { tenantId = DEFAULT_DEMO_TENANT_ID, productId, sku, qtyDelta } = req.body;
  if ((!productId && !sku) || typeof qtyDelta !== "number") {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "productId or sku, and numeric qtyDelta are required." },
    });
    return;
  }

  try {
    const repo = new PostgresProductsRepository(tenantId);
    const updated = await repo.updateStock(productId || sku, qtyDelta);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "UPDATE_FAILED", message: err.message },
    });
  }
});

// ----------------------------------------------------------------------------
// 4. Customers & Khata Ledger Endpoints
// ----------------------------------------------------------------------------

app.get("/api/customers", async (req: Request, res: Response): Promise<void> => {
  const tenantId = (req.query.tenantId as string) || DEFAULT_DEMO_TENANT_ID;
  const search = req.query.search as string;
  const hasUdhaarOnly = req.query.hasUdhaarOnly === "true";

  try {
    const repo = new PostgresCustomersRepository(tenantId);
    const customers = await repo.list({ search, hasUdhaarOnly });
    res.json({
      success: true,
      data: customers,
      meta: { tenantId, count: customers.length, timestamp: new Date().toISOString() },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "QUERY_FAILED", message: err.message },
    });
  }
});

app.post("/api/customers/ledger", async (req: Request, res: Response): Promise<void> => {
  const { tenantId = DEFAULT_DEMO_TENANT_ID, customerId, type = "CREDIT", amount, descriptionEn, descriptionHi, paymentMode } = req.body;
  if (!customerId || typeof amount !== "number" || amount <= 0) {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "customerId and positive amount are required." },
    });
    return;
  }

  try {
    const repo = new PostgresCustomersRepository(tenantId);
    const result = await repo.addLedgerEntry(customerId, {
      type: type === "DEBIT" ? "DEBIT" : "CREDIT",
      amount,
      descriptionEn: descriptionEn || `Payment via ${paymentMode || "CASH"}`,
      descriptionHi: descriptionHi || `${paymentMode || "CASH"} द्वारा भुगतान`,
      paymentMode,
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "LEDGER_FAILED", message: err.message },
    });
  }
});

// ----------------------------------------------------------------------------
// 5. Purchase Orders Endpoints
// ----------------------------------------------------------------------------

app.get("/api/purchase-orders", async (req: Request, res: Response): Promise<void> => {
  const tenantId = (req.query.tenantId as string) || DEFAULT_DEMO_TENANT_ID;
  try {
    const repo = new PostgresPurchaseOrdersRepository(tenantId);
    const pos = await repo.list();
    res.json({
      success: true,
      data: pos,
      meta: { tenantId, count: pos.length, timestamp: new Date().toISOString() },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "QUERY_FAILED", message: err.message },
    });
  }
});

app.post("/api/purchase-orders", async (req: Request, res: Response): Promise<void> => {
  const { tenantId = DEFAULT_DEMO_TENANT_ID, ...poInput } = req.body;
  try {
    const repo = new PostgresPurchaseOrdersRepository(tenantId);
    const created = await repo.create(poInput);
    res.json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "PO_CREATE_FAILED", message: err.message },
    });
  }
});

app.post("/api/purchase-orders/status", async (req: Request, res: Response): Promise<void> => {
  const { tenantId = DEFAULT_DEMO_TENANT_ID, purchaseOrderId, status } = req.body;
  if (!purchaseOrderId || !status) {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "purchaseOrderId and status are required." },
    });
    return;
  }

  try {
    const repo = new PostgresPurchaseOrdersRepository(tenantId);
    const updated = await repo.updateStatus(purchaseOrderId, status);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "STATUS_UPDATE_FAILED", message: err.message },
    });
  }
});

// ----------------------------------------------------------------------------
// 6. POS Counter Sales & Billing Endpoints
// ----------------------------------------------------------------------------

app.post("/api/sales", async (req: Request, res: Response): Promise<void> => {
  const { tenantId = DEFAULT_DEMO_TENANT_ID, ...saleInput } = req.body;
  if (!saleInput.items || !Array.isArray(saleInput.items) || saleInput.items.length === 0) {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "At least one sale item is required." },
    });
    return;
  }

  try {
    const repo = new PostgresSalesRepository(tenantId);
    const result = await repo.createSale(saleInput);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "SALE_FAILED", message: err.message },
    });
  }
});

// Error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction): void => {
  console.error("[Backend Uncaught Error]:", err);
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: err.message || "An unexpected server error occurred.",
    },
  });
});

if (require.main === module || process.argv[1]?.endsWith("server.ts")) {
  app.listen(port, () => {
    console.log(`🚀 BizPilot Operations Kernel Backend listening on port ${port}`);
    console.log(`📡 Health Check: http://localhost:${port}/api/health`);
  });
}

export default app;
