export type SalePaymentMethod = "CASH" | "UPI" | "UDHAAR" | "MIXED";

export interface SaleItem {
  productId: string;
  sku: string;
  nameEn: string;
  nameHi: string;
  quantity: number;
  unitEn: string;
  unitHi: string;
  unitPrice: number;
  lineTotal: number;
}

export interface SaleRecord {
  id: string; // e.g. "BILL-2026-1042"
  tenantId: string;
  timestamp: string;
  customerName?: string;
  customerId?: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  paymentMethod: SalePaymentMethod;
  notes?: string;
  isDemoSimulation: boolean;
  createdAt?: string;
}

export interface DailySalesMetrics {
  totalSales: number;
  cashCollections: number;
  upiCollections: number;
  udhaarCollections: number;
  billsCount: number;
}

