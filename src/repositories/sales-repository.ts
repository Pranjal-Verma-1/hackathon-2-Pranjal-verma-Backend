/**
 * BizPilot: PostgreSQL Sales & Counter Billing Repository
 *
 * Implements atomic POS counter billing in a single multi-table transaction:
 * - Creates Sale and line items
 * - Deducts product inventory stock atomically
 * - If payment method is UDHAAR, updates Customer balance and appends to Khata ledger
 * - Enforces idempotency via receipt_number unique constraints.
 */

import { withTransaction, query } from "../db/pool";
import type { PaymentMethod, SaleItem, SaleRecord } from "./types";

export interface CreateSaleInput {
  receiptNumber?: string;
  customerId?: string;
  customerName?: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export class PostgresSalesRepository {
  constructor(private readonly tenantId: string) { }

  async createSale(input: CreateSaleInput): Promise<SaleRecord> {
    return withTransaction(async (client) => {
      // 1. Idempotency Check & Receipt Number Resolution
      const receiptNumber =
        input.receiptNumber ||
        `BILL-2026-${Date.now().toString().slice(-6)}`;

      const existingSaleRes = await client.query(
        "SELECT id, receipt_number, total_amount, payment_method, created_at FROM sales WHERE receipt_number = $1 AND tenant_id = $2",
        [receiptNumber, this.tenantId]
      );

      if (existingSaleRes.rows.length > 0) {
        // Return existing record (idempotency safeguard)
        return {
          id: existingSaleRes.rows[0].id,
          timestamp: new Date(existingSaleRes.rows[0].created_at).toISOString(),
          customerName: input.customerName || "Counter Customer",
          customerId: input.customerId,
          items: input.items,
          subtotal: input.subtotal,
          discount: input.discount,
          totalAmount: Number(existingSaleRes.rows[0].total_amount),
          paymentMethod: existingSaleRes.rows[0].payment_method as PaymentMethod,
          isDemoSimulation: false,
        };
      }

      // 2. Insert Sale Record
      const insertSaleRes = await client.query(
        `INSERT INTO sales (
           tenant_id, receipt_number, customer_id, subtotal, discount,
           total_amount, payment_method, notes, is_demo_simulation, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, NOW())
         RETURNING id, created_at`,
        [
          this.tenantId,
          receiptNumber,
          input.customerId || null,
          input.subtotal,
          input.discount,
          input.totalAmount,
          input.paymentMethod,
          input.notes || null,
        ]
      );

      const saleId = insertSaleRes.rows[0].id;
      const createdAt = insertSaleRes.rows[0].created_at;

      // 3. Insert Sale Line Items and Deduct Inventory Stock
      for (const item of input.items) {
        const lineTotal = typeof item.lineTotal === "number" ? item.lineTotal : item.quantity * item.unitPrice;
        await client.query(
          `INSERT INTO sale_items (
             tenant_id, sale_id, sku, quantity, unit_en, unit_hi, unit_price, line_total, created_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [
            this.tenantId,
            saleId,
            item.sku,
            item.quantity,
            item.unitEn || "units",
            item.unitHi || "इकाई",
            item.unitPrice,
            lineTotal,
          ]
        );

        // Deduct inventory atomically
        await client.query(
          `UPDATE products
           SET available_qty = GREATEST(0, available_qty - $1),
               status = CASE
                 WHEN (available_qty - $1) <= 0 THEN 'OUT_OF_STOCK'
                 WHEN (available_qty - $1) <= reorder_level THEN 'LOW_STOCK'
                 ELSE 'IN_STOCK'
               END,
               updated_at = NOW()
           WHERE sku = $2 AND tenant_id = $3`,
          [item.quantity, item.sku, this.tenantId]
        );
      }

      // 4. If UDHAAR: Update customer outstanding balance and create ledger debit entry
      if (input.paymentMethod === "UDHAAR" && input.customerId) {
        const custRes = await client.query(
          `SELECT outstanding_balance FROM customers WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
          [input.customerId, this.tenantId]
        );

        if (custRes.rows.length > 0) {
          const prevBalance = Number(custRes.rows[0].outstanding_balance);
          const newBalance = prevBalance + input.totalAmount;

          await client.query(
            `UPDATE customers
             SET outstanding_balance = $1, last_transaction_date = NOW(), updated_at = NOW()
             WHERE id = $2 AND tenant_id = $3`,
            [newBalance, input.customerId, this.tenantId]
          );

          await client.query(
            `INSERT INTO customer_ledger_entries (
               tenant_id, customer_id, entry_type, amount, balance_after,
               description_en, description_hi, reference_id, payment_mode, created_at
             )
             VALUES ($1, $2, 'DEBIT', $3, $4, $5, $6, $7, 'UDHAAR', NOW())`,
            [
              this.tenantId,
              input.customerId,
              input.totalAmount,
              newBalance,
              `Grocery bill #${receiptNumber}`,
              `किराना बिल #${receiptNumber}`,
              receiptNumber,
            ]
          );
        }
      }

      return {
        id: receiptNumber,
        timestamp: new Date(createdAt).toISOString(),
        customerName: input.customerName || "Counter Customer",
        customerId: input.customerId,
        items: input.items,
        subtotal: input.subtotal,
        discount: input.discount,
        totalAmount: input.totalAmount,
        paymentMethod: input.paymentMethod,
        isDemoSimulation: false,
      };
    });
  }

  async listSales(limit = 20): Promise<SaleRecord[]> {
    const sql = `
      SELECT s.id, s.receipt_number, s.customer_id, s.subtotal, s.discount, s.total_amount,
             s.payment_method, s.notes, s.is_demo_simulation, s.created_at,
             c.name_en as customer_name_en, c.name_hi as customer_name_hi,
             COALESCE(
               json_agg(
                 json_build_object(
                   'sku', si.sku,
                   'quantity', si.quantity,
                   'unitEn', si.unit_en,
                   'unitHi', si.unit_hi,
                   'unitPrice', si.unit_price,
                   'lineTotal', si.line_total
                 )
               ) FILTER (WHERE si.id IS NOT NULL),
               '[]'::json
             ) as items
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE s.tenant_id = $1
      GROUP BY s.id, c.name_en, c.name_hi
      ORDER BY s.created_at DESC
      LIMIT $2
    `;

    const res = await query(sql, [this.tenantId, limit]);
    return res.rows.map((row: any) => ({
      id: row.receipt_number,
      timestamp: new Date(row.created_at).toISOString(),
      customerName: row.customer_name_en || "Walk-in Counter Customer",
      customerId: row.customer_id || undefined,
      items: (row.items || []).map((it: any) => ({
        sku: it.sku,
        productNameEn: it.sku,
        productNameHi: it.sku,
        quantity: Number(it.quantity),
        unitEn: it.unitEn,
        unitHi: it.unitHi,
        unitPrice: Number(it.unitPrice),
        lineTotal: Number(it.lineTotal),
      })),
      subtotal: Number(row.subtotal),
      discount: Number(row.discount),
      totalAmount: Number(row.total_amount),
      paymentMethod: row.payment_method as PaymentMethod,
      isDemoSimulation: Boolean(row.is_demo_simulation),
    }));
  }
}
