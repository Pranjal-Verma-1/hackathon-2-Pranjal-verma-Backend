export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export interface Product {
  id: string;
  tenantId: string;
  sku: string;
  nameEn: string;
  nameHi: string;
  categoryEn: string;
  categoryHi: string;
  availableQty: number;
  reorderLevel: number;
  unitEn: string;
  unitHi: string;
  costPrice: number; // in INR paisa or rupees
  sellingPrice: number; // in INR
  status: StockStatus;
  primarySupplierId: string;
  shelfLocation: string;
  lastRestocked: string;
  barcode?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface InventoryValuationSummary {
  totalCount: number;
  inStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalValuationInr: number;
}

