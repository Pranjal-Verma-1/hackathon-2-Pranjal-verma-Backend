/**
 * BizPilot: PostgreSQL Products Repository
 *
 * Implements IProductsRepository using direct, parameterized SQL queries via `pg.Pool`.
 * Strictly tenant-scoped: every query enforces `tenant_id = $1`.
 */

import { query } from "../db/pool";
import type {
  Product,
  StockStatus,
  InventoryValuationSummary,
} from "@bizpilot/contracts";
import type { IProductsRepository, ProductFilter } from "./types";

function mapRowToProduct(row: any): Product {
  const availableQty = Number(row.available_qty);
  const reorderLevel = Number(row.reorder_level);
  const costPrice = Number(row.cost_price);
  const sellingPrice = Number(row.selling_price);

  let status: StockStatus = row.status as StockStatus;
  if (!status || status === "IN_STOCK") {
    if (availableQty <= 0) status = "OUT_OF_STOCK";
    else if (availableQty <= reorderLevel) status = "LOW_STOCK";
    else status = "IN_STOCK";
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    sku: row.sku,
    nameEn: row.name_en,
    nameHi: row.name_hi,
    categoryEn: row.category_en,
    categoryHi: row.category_hi,
    availableQty,
    reorderLevel,
    unitEn: row.unit_en,
    unitHi: row.unit_hi,
    costPrice,
    sellingPrice,
    status,
    primarySupplierId: row.primary_supplier_id || undefined,
    shelfLocation: row.shelf_location || undefined,
    barcode: row.barcode || undefined,
    lastRestocked: row.last_restocked ? new Date(row.last_restocked).toISOString() : new Date().toISOString(),
  };
}

export class PostgresProductsRepository implements IProductsRepository {
  constructor(private readonly tenantId: string) {}

  async list(filter?: ProductFilter): Promise<Product[]> {
    const conditions: string[] = ["tenant_id = $1"];
    const params: any[] = [this.tenantId];
    let paramIndex = 2;

    if (filter?.search) {
      conditions.push(
        `(name_en ILIKE $${paramIndex} OR name_hi ILIKE $${paramIndex} OR sku ILIKE $${paramIndex} OR barcode ILIKE $${paramIndex})`
      );
      params.push(`%${filter.search}%`);
      paramIndex++;
    }

    if (filter?.category && filter.category !== "ALL") {
      conditions.push(`(category_en = $${paramIndex} OR category_hi = $${paramIndex})`);
      params.push(filter.category);
      paramIndex++;
    }

    if (filter?.status && filter.status !== "ALL") {
      if (filter.status === "OUT_OF_STOCK") {
        conditions.push(`available_qty <= 0`);
      } else if (filter.status === "LOW_STOCK") {
        conditions.push(`available_qty > 0 AND available_qty <= reorder_level`);
      } else if (filter.status === "IN_STOCK") {
        conditions.push(`available_qty > reorder_level`);
      }
    }

    const sql = `
      SELECT id, tenant_id, sku, name_en, name_hi, category_en, category_hi,
             available_qty, reorder_level, unit_en, unit_hi, cost_price, selling_price,
             status, primary_supplier_id, shelf_location, barcode, last_restocked
      FROM products
      WHERE ${conditions.join(" AND ")}
      ORDER BY name_en ASC
    `;

    const result = await query(sql, params);
    return result.rows.map(mapRowToProduct);
  }

  async getById(id: string): Promise<Product | null> {
    const sql = `
      SELECT id, tenant_id, sku, name_en, name_hi, category_en, category_hi,
             available_qty, reorder_level, unit_en, unit_hi, cost_price, selling_price,
             status, primary_supplier_id, shelf_location, barcode, last_restocked
      FROM products
      WHERE (id::text = $1 OR sku = $1) AND tenant_id = $2
      LIMIT 1
    `;
    const result = await query(sql, [id, this.tenantId]);
    if (result.rows.length === 0) return null;
    return mapRowToProduct(result.rows[0]);
  }

  async getBySku(sku: string): Promise<Product | null> {
    const sql = `
      SELECT id, tenant_id, sku, name_en, name_hi, category_en, category_hi,
             available_qty, reorder_level, unit_en, unit_hi, cost_price, selling_price,
             status, primary_supplier_id, shelf_location, barcode, last_restocked
      FROM products
      WHERE sku = $1 AND tenant_id = $2
      LIMIT 1
    `;
    const result = await query(sql, [sku, this.tenantId]);
    if (result.rows.length === 0) return null;
    return mapRowToProduct(result.rows[0]);
  }

  async updateStock(id: string, qtyDelta: number): Promise<Product> {
    const sql = `
      UPDATE products
      SET available_qty = GREATEST(0, available_qty + $1),
          status = CASE
            WHEN (available_qty + $1) <= 0 THEN 'OUT_OF_STOCK'
            WHEN (available_qty + $1) <= reorder_level THEN 'LOW_STOCK'
            ELSE 'IN_STOCK'
          END,
          last_restocked = CASE WHEN $1 > 0 THEN NOW() ELSE last_restocked END,
          updated_at = NOW()
      WHERE (id::text = $2 OR sku = $2) AND tenant_id = $3
      RETURNING id, tenant_id, sku, name_en, name_hi, category_en, category_hi,
                available_qty, reorder_level, unit_en, unit_hi, cost_price, selling_price,
                status, primary_supplier_id, shelf_location, barcode, last_restocked
    `;

    const result = await query(sql, [qtyDelta, id, this.tenantId]);
    if (result.rows.length === 0) {
      throw new Error(`Product not found or access denied for ID: ${id}`);
    }
    return mapRowToProduct(result.rows[0]);
  }

  async getValuationSummary(): Promise<InventoryValuationSummary> {
    const sql = `
      SELECT
        COUNT(*)::int as total_count,
        COALESCE(SUM(available_qty * cost_price), 0)::numeric as total_valuation,
        COUNT(*) FILTER (WHERE available_qty > reorder_level)::int as in_stock_count,
        COUNT(*) FILTER (WHERE available_qty > 0 AND available_qty <= reorder_level)::int as low_stock_count,
        COUNT(*) FILTER (WHERE available_qty <= 0)::int as out_of_stock_count
      FROM products
      WHERE tenant_id = $1
    `;

    const result = await query(sql, [this.tenantId]);
    const row = result.rows[0] || {};

    return {
      totalCount: Number(row.total_count || 0),
      inStockCount: Number(row.in_stock_count || 0),
      lowStockCount: Number(row.low_stock_count || 0),
      outOfStockCount: Number(row.out_of_stock_count || 0),
      totalValuationInr: Number(row.total_valuation || 0),
    };
  }
}
