/**
 * BizPilot: PostgreSQL Purchase Orders Repository
 *
 * Implements IPurchaseOrdersRepository using direct, parameterized SQL queries via `pg.Pool`.
 * Ensures atomic transactions and strict idempotency for purchase order receipt restocking.
 */

import { query, withTransaction } from "../db/pool";
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  POStatus,
} from "@bizpilot/contracts";
import type {
  IPurchaseOrdersRepository,
  POFilter,
  CreatePurchaseOrderInput,
} from "./types";

export class PostgresPurchaseOrdersRepository implements IPurchaseOrdersRepository {
  constructor(private readonly tenantId: string) {}

  async list(filter?: POFilter): Promise<PurchaseOrder[]> {
    const conditions: string[] = ["po.tenant_id = $1"];
    const params: any[] = [this.tenantId];
    let paramIndex = 2;

    if (filter?.status && filter.status !== "ALL") {
      conditions.push(`po.status = $${paramIndex}`);
      params.push(filter.status);
      paramIndex++;
    }

    if (filter?.supplierId) {
      conditions.push(`po.supplier_id = $${paramIndex}`);
      params.push(filter.supplierId);
      paramIndex++;
    }

    const sql = `
      SELECT
        po.id, po.tenant_id, po.po_number, po.supplier_id, po.order_date, po.expected_delivery,
        po.subtotal, po.tax_amount, po.grand_total, po.status, po.notes, po.created_at, po.updated_at,
        s.name_en as supplier_name_en, s.city as supplier_city,
        COALESCE(
          json_agg(
            json_build_object(
              'sku', poi.sku,
              'productNameEn', COALESCE(p.name_en, poi.sku),
              'productNameHi', COALESCE(p.name_hi, poi.sku),
              'quantity', poi.quantity,
              'unitEn', poi.unit_en,
              'unitHi', poi.unit_hi,
              'unitPrice', poi.unit_price,
              'lineTotal', poi.line_total
            )
          ) FILTER (WHERE poi.id IS NOT NULL),
          '[]'::json
        ) as items
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
      LEFT JOIN products p ON poi.sku = p.sku AND p.tenant_id = po.tenant_id
      WHERE ${conditions.join(" AND ")}
      GROUP BY po.id, s.name_en, s.city
      ORDER BY po.created_at DESC
    `;

    const result = await query(sql, params);

    return result.rows.map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      poNumber: row.po_number,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name_en || "Wholesale Supplier",
      supplierCity: row.supplier_city || "Delhi-NCR",
      orderDate: row.order_date ? new Date(row.order_date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      expectedDelivery: row.expected_delivery ? new Date(row.expected_delivery).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      items: (row.items || []).map((it: any) => ({
        sku: it.sku,
        productNameEn: it.productNameEn || it.sku,
        productNameHi: it.productNameHi || it.sku,
        quantity: Number(it.quantity),
        unitEn: it.unitEn,
        unitHi: it.unitHi,
        unitPrice: Number(it.unitPrice),
        lineTotal: Number(it.lineTotal),
      })),
      subtotal: Number(row.subtotal),
      taxAmount: Number(row.tax_amount),
      grandTotal: Number(row.grand_total),
      status: row.status as POStatus,
      notes: row.notes || undefined,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    }));
  }

  async getById(id: string): Promise<PurchaseOrder | null> {
    const list = await this.list();
    return list.find((p) => p.id === id) || null;
  }

  async create(input: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
    return withTransaction(async (client) => {
      // 1. Generate PO number
      const countRes = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text as count FROM purchase_orders WHERE tenant_id = $1",
        [this.tenantId]
      );
      const nextSeq = Number(countRes.rows[0]?.count || 0) + 1;
      const poNumber = `PO-2026-${String(nextSeq).padStart(3, "0")}`;

      // 2. Ensure supplier exists or get primary supplier
      let supplierId = input.supplierId;
      const supplierCheck = await client.query(
        "SELECT id FROM suppliers WHERE id = $1 AND tenant_id = $2 LIMIT 1",
        [supplierId, this.tenantId]
      );

      if (supplierCheck.rows.length === 0) {
        // Find existing supplier or insert default
        const fallbackSupplier = await client.query<{ id: string }>(
          "SELECT id FROM suppliers WHERE tenant_id = $1 LIMIT 1",
          [this.tenantId]
        );
        if (fallbackSupplier.rows.length > 0) {
          supplierId = fallbackSupplier.rows[0].id;
        } else {
          const newSupp = await client.query<{ id: string }>(
            `INSERT INTO suppliers (tenant_id, name_en, name_hi, contact_person, phone, city, market_area)
             VALUES ($1, $2, $2, 'Wholesale Manager', '+91 98110 00000', $3, 'Khari Baoli')
             RETURNING id`,
            [this.tenantId, input.supplierName || "Mandi Depot", input.supplierCity || "Delhi"]
          );
          supplierId = newSupp.rows[0].id;
        }
      }

      // 3. Insert Purchase Order
      const insertPoRes = await client.query(
        `INSERT INTO purchase_orders (
           tenant_id, po_number, supplier_id, order_date, expected_delivery,
           subtotal, tax_amount, grand_total, status, notes, created_at, updated_at
         )
         VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, 'DRAFT', $8, NOW(), NOW())
         RETURNING id, tenant_id, po_number, supplier_id, order_date, expected_delivery,
                   subtotal, tax_amount, grand_total, status, notes, created_at`,
        [
          this.tenantId,
          poNumber,
          supplierId,
          input.expectedDelivery || new Date().toISOString().split("T")[0],
          input.subtotal,
          input.taxAmount,
          input.grandTotal,
          input.notes || null,
        ]
      );

      const poRow = insertPoRes.rows[0];

      // 4. Insert Items
      const createdItems: PurchaseOrderItem[] = [];
      for (const item of input.items) {
        const itemRes = await client.query(
          `INSERT INTO purchase_order_items (
             tenant_id, purchase_order_id, sku, quantity, unit_en, unit_hi, unit_price, line_total, created_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           RETURNING id, product_id, sku, quantity, unit_en, unit_hi, unit_price, line_total`,
          [
            this.tenantId,
            poRow.id,
            item.sku,
            item.quantity,
            item.unitEn || "units",
            item.unitHi || "इकाई",
            item.unitPrice,
            typeof item.lineTotal === "number" ? item.lineTotal : item.quantity * item.unitPrice,
          ]
        );
        const it = itemRes.rows[0];
        createdItems.push({
          sku: item.sku,
          productNameEn: item.productNameEn || item.sku,
          productNameHi: item.productNameHi || item.sku,
          quantity: Number(it.quantity),
          unitEn: it.unit_en,
          unitHi: it.unit_hi,
          unitPrice: Number(it.unit_price),
          lineTotal: Number(it.line_total),
        });
      }

      return {
        id: poRow.id,
        tenantId: poRow.tenant_id,
        poNumber: poRow.po_number,
        supplierId: poRow.supplier_id,
        supplierName: input.supplierName,
        supplierCity: input.supplierCity,
        orderDate: new Date(poRow.order_date).toISOString().split("T")[0],
        expectedDelivery: new Date(poRow.expected_delivery).toISOString().split("T")[0],
        items: createdItems,
        subtotal: Number(poRow.subtotal),
        taxAmount: Number(poRow.tax_amount),
        grandTotal: Number(poRow.grand_total),
        status: "DRAFT",
        notes: poRow.notes || undefined,
        createdAt: new Date(poRow.created_at).toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async updateStatus(id: string, newStatus: POStatus): Promise<PurchaseOrder> {
    return withTransaction(async (client) => {
      // 1. Lock PO row for update to ensure state consistency
      const poRes = await client.query(
        `SELECT id, tenant_id, po_number, supplier_id, order_date, expected_delivery,
                subtotal, tax_amount, grand_total, status, notes, created_at
         FROM purchase_orders
         WHERE id = $1 AND tenant_id = $2
         FOR UPDATE`,
        [id, this.tenantId]
      );

      if (poRes.rows.length === 0) {
        throw new Error(`Purchase Order not found with ID: ${id}`);
      }

      const poRow = poRes.rows[0];
      const previousStatus = poRow.status as POStatus;

      // 2. Idempotency Check: if already RECEIVED and requested status is RECEIVED, do not double-restock!
      if (previousStatus === "RECEIVED" && newStatus === "RECEIVED") {
        return (await this.getById(id))!;
      }

      // 3. If transitioning to RECEIVED: restock inventory products atomically
      if (newStatus === "RECEIVED" && previousStatus !== "RECEIVED") {
        const itemsRes = await client.query<{ sku: string; quantity: string }>(
          `SELECT sku, quantity FROM purchase_order_items WHERE purchase_order_id = $1 AND tenant_id = $2`,
          [id, this.tenantId]
        );

        for (const item of itemsRes.rows) {
          const qty = Number(item.quantity);
          await client.query(
            `UPDATE products
             SET available_qty = available_qty + $1,
                 status = CASE
                   WHEN (available_qty + $1) <= 0 THEN 'OUT_OF_STOCK'
                   WHEN (available_qty + $1) <= reorder_level THEN 'LOW_STOCK'
                   ELSE 'IN_STOCK'
                 END,
                 last_restocked = NOW(),
                 updated_at = NOW()
             WHERE sku = $2 AND tenant_id = $3`,
            [qty, item.sku, this.tenantId]
          );
        }
      }

      // 4. Update the Purchase Order status
      await client.query(
        `UPDATE purchase_orders
         SET status = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [newStatus, id, this.tenantId]
      );

      return (await this.getById(id))!;
    });
  }
}
