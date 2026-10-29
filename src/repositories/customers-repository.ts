/**
 * BizPilot: PostgreSQL Customers & Khata Repository
 *
 * Implements ICustomersRepository using direct, parameterized SQL queries via `pg.Pool`.
 * Ledger modifications are strictly executed within atomic transactions with row locks (`FOR UPDATE`).
 */

import { query, withTransaction } from "../db/pool";
import type {
  Customer,
  CustomerLedgerEntry,
  CustomerLedgerType,
  PaymentMode,
  UdhaarAgingSummary,
} from "@bizpilot/contracts";
import type {
  ICustomersRepository,
  CustomerFilter,
  NewLedgerEntryInput,
} from "./types";

function mapRowToCustomer(row: any): Customer {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    nameEn: row.name_en,
    nameHi: row.name_hi,
    phone: row.phone,
    address: row.address || "",
    creditLimit: Number(row.credit_limit || 5000),
    outstandingBalance: Number(row.outstanding_balance || 0),
    totalPurchases: Number(row.total_purchases || 0),
    lastTransactionDate: row.last_transaction_date
      ? new Date(row.last_transaction_date).toISOString()
      : new Date().toISOString(),
  };
}

function mapRowToLedgerEntry(row: any): CustomerLedgerEntry {
  const createdAtIso = row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString();
  return {
    id: row.id,
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    date: createdAtIso.split("T")[0],
    type: row.entry_type as CustomerLedgerType,
    amount: Number(row.amount),
    balanceAfter: Number(row.balance_after),
    descriptionEn: row.description_en,
    descriptionHi: row.description_hi,
    referenceId: row.reference_id || undefined,
    paymentMode: (row.payment_mode as PaymentMode) || undefined,
    createdAt: createdAtIso,
  };
}

export class PostgresCustomersRepository implements ICustomersRepository {
  constructor(private readonly tenantId: string) {}

  async list(filter?: CustomerFilter): Promise<Customer[]> {
    const conditions: string[] = ["tenant_id = $1"];
    const params: any[] = [this.tenantId];
    let paramIndex = 2;

    if (filter?.search) {
      conditions.push(
        `(name_en ILIKE $${paramIndex} OR name_hi ILIKE $${paramIndex} OR phone ILIKE $${paramIndex})`
      );
      params.push(`%${filter.search}%`);
      paramIndex++;
    }

    if (filter?.hasUdhaarOnly) {
      conditions.push("outstanding_balance > 0");
    }

    const sql = `
      SELECT id, tenant_id, name_en, name_hi, phone, address, credit_limit,
             outstanding_balance, total_purchases, last_transaction_date
      FROM customers
      WHERE ${conditions.join(" AND ")}
      ORDER BY outstanding_balance DESC, name_en ASC
    `;

    const result = await query(sql, params);
    return result.rows.map(mapRowToCustomer);
  }

  async getById(id: string): Promise<Customer | null> {
    const sql = `
      SELECT id, tenant_id, name_en, name_hi, phone, address, credit_limit,
             outstanding_balance, total_purchases, last_transaction_date
      FROM customers
      WHERE id = $1 AND tenant_id = $2
      LIMIT 1
    `;
    const result = await query(sql, [id, this.tenantId]);
    if (result.rows.length === 0) return null;
    return mapRowToCustomer(result.rows[0]);
  }

  async addLedgerEntry(
    customerId: string,
    entry: NewLedgerEntryInput
  ): Promise<{ customer: Customer; entry: CustomerLedgerEntry }> {
    return withTransaction(async (client) => {
      // 1. Lock customer row for update
      const customerRes = await client.query(
        `SELECT id, tenant_id, name_en, name_hi, phone, address, credit_limit,
                outstanding_balance, total_purchases, last_transaction_date
         FROM customers
         WHERE id = $1 AND tenant_id = $2
         FOR UPDATE`,
        [customerId, this.tenantId]
      );

      if (customerRes.rows.length === 0) {
        throw new Error(`Customer not found with ID: ${customerId}`);
      }

      const currentBalance = Number(customerRes.rows[0].outstanding_balance);
      const balanceDelta = entry.type === "DEBIT" ? entry.amount : -entry.amount;
      const newBalance = Math.max(0, currentBalance + balanceDelta);

      // 2. Update customer balance
      const updateCustRes = await client.query(
        `UPDATE customers
         SET outstanding_balance = $1,
             last_transaction_date = NOW(),
             updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3
         RETURNING id, tenant_id, name_en, name_hi, phone, address, credit_limit,
                   outstanding_balance, total_purchases, last_transaction_date`,
        [newBalance, customerId, this.tenantId]
      );

      // 3. Insert ledger entry
      const insertLedgerRes = await client.query(
        `INSERT INTO customer_ledger_entries (
           tenant_id, customer_id, entry_type, amount, balance_after,
           description_en, description_hi, reference_id, payment_mode, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         RETURNING id, tenant_id, customer_id, entry_type, amount, balance_after,
                   description_en, description_hi, reference_id, payment_mode, created_at`,
        [
          this.tenantId,
          customerId,
          entry.type,
          entry.amount,
          newBalance,
          entry.descriptionEn,
          entry.descriptionHi,
          entry.referenceId || null,
          entry.paymentMode || null,
        ]
      );

      return {
        customer: mapRowToCustomer(updateCustRes.rows[0]),
        entry: mapRowToLedgerEntry(insertLedgerRes.rows[0]),
      };
    });
  }

  async getLedger(customerId: string): Promise<CustomerLedgerEntry[]> {
    const sql = `
      SELECT id, tenant_id, customer_id, entry_type, amount, balance_after,
             description_en, description_hi, reference_id, payment_mode, created_at
      FROM customer_ledger_entries
      WHERE customer_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC
    `;
    const res = await query(sql, [customerId, this.tenantId]);
    return res.rows.map(mapRowToLedgerEntry);
  }

  async getUdhaarSummary(): Promise<UdhaarAgingSummary> {
    const sql = `
      SELECT
        COALESCE(SUM(outstanding_balance), 0)::numeric as total_outstanding,
        COUNT(*) FILTER (WHERE outstanding_balance > 0)::int as total_debtors,
        COALESCE(SUM(CASE WHEN last_transaction_date >= NOW() - INTERVAL '7 days' THEN outstanding_balance ELSE 0 END), 0)::numeric as under_7,
        COALESCE(SUM(CASE WHEN last_transaction_date >= NOW() - INTERVAL '15 days' AND last_transaction_date < NOW() - INTERVAL '7 days' THEN outstanding_balance ELSE 0 END), 0)::numeric as days_8_15,
        COALESCE(SUM(CASE WHEN last_transaction_date < NOW() - INTERVAL '15 days' THEN outstanding_balance ELSE 0 END), 0)::numeric as over_15
      FROM customers
      WHERE tenant_id = $1 AND outstanding_balance > 0
    `;

    const result = await query(sql, [this.tenantId]);
    const row = result.rows[0] || {};

    return {
      totalOutstandingInr: Number(row.total_outstanding || 0),
      activeAccountsCount: Number(row.total_debtors || 0),
      freshUnder7Days: Number(row.under_7 || 0),
      due8To15Days: Number(row.days_8_15 || 0),
      overdue15PlusDays: Number(row.over_15 || 0),
    };
  }
}
