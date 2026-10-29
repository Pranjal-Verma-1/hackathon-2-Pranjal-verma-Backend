export type POStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "RECEIVED"
  | "REJECTED";

export interface PurchaseOrderItem {
  sku: string;
  productNameEn: string;
  productNameHi: string;
  quantity: number;
  unitEn: string;
  unitHi: string;
  unitPrice: number;
  lineTotal: number;
}

export interface PurchaseOrder {
  id: string; // e.g. "PO-2026-081"
  tenantId: string;
  supplierId: string;
  supplierName: string;
  supplierCity: string;
  orderDate: string;
  expectedDelivery: string;
  items: PurchaseOrderItem[];
  subtotal: number;
  taxAmount: number; // 18% GST or similar
  grandTotal: number;
  status: POStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

