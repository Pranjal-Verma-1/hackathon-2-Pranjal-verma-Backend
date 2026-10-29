export type CustomerLedgerType = "DEBIT" | "CREDIT";

export type PaymentMode = "CASH" | "UPI" | "BANK";

export interface CustomerLedgerEntry {
  id: string;
  tenantId: string;
  customerId: string;
  date: string;
  type: CustomerLedgerType; // DEBIT = sale on udhaar, CREDIT = payment received
  amount: number;
  balanceAfter: number;
  descriptionEn: string;
  descriptionHi: string;
  referenceId?: string; // Bill ID or Receipt ID
  paymentMode?: PaymentMode;
  createdAt?: string;
}

export interface Customer {
  id: string;
  tenantId: string;
  nameEn: string;
  nameHi: string;
  phone: string;
  address: string;
  outstandingBalance: number; // in INR
  creditLimit: number;
  lastTransactionDate: string;
  totalPurchases: number;
  ledgerHistory?: CustomerLedgerEntry[];
  createdAt?: string;
  updatedAt?: string;
}

export interface UdhaarAgingSummary {
  totalOutstandingInr: number;
  activeAccountsCount: number;
  freshUnder7Days: number;
  due8To15Days: number;
  overdue15PlusDays: number;
}

