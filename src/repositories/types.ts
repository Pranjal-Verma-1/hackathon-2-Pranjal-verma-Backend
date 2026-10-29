/**
 * BizPilot: Repository Pattern Interfaces & Data Access Contracts
 *
 * Defines unified interfaces for data persistence across:
 * 1. LocalStorage Repository (in-browser demo & offline mode)
 * 2. Supabase Repository (server-side PostgREST gateway with tenant boundaries)
 */

import type {
  Product,
  StockStatus,
  InventoryValuationSummary,
  Customer,
  CustomerLedgerEntry,
  CustomerLedgerType,
  PaymentMode,
  UdhaarAgingSummary,
  PurchaseOrder,
  PurchaseOrderItem,
  POStatus,
} from "@bizpilot/contracts";

export interface ProductFilter {
  search?: string;
  status?: StockStatus | "ALL";
  category?: string;
}

export interface CustomerFilter {
  search?: string;
  hasUdhaarOnly?: boolean;
}

export interface POFilter {
  status?: POStatus | "ALL";
  supplierId?: string;
}

export interface NewLedgerEntryInput {
  type: CustomerLedgerType;
  amount: number;
  descriptionEn: string;
  descriptionHi: string;
  paymentMode?: PaymentMode;
  referenceId?: string;
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  supplierName: string;
  supplierCity: string;
  expectedDelivery: string;
  items: PurchaseOrderItem[];
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  notes?: string;
}

export interface IProductsRepository {
  list(filter?: ProductFilter): Promise<Product[]>;
  getById(id: string): Promise<Product | null>;
  getBySku(sku: string): Promise<Product | null>;
  updateStock(id: string, qtyDelta: number): Promise<Product>;
  getValuationSummary(): Promise<InventoryValuationSummary>;
}

export interface ICustomersRepository {
  list(filter?: CustomerFilter): Promise<Customer[]>;
  getById(id: string): Promise<Customer | null>;
  addLedgerEntry(customerId: string, entry: NewLedgerEntryInput): Promise<{ customer: Customer; entry: CustomerLedgerEntry }>;
  getUdhaarSummary(): Promise<UdhaarAgingSummary>;
}

export interface IPurchaseOrdersRepository {
  list(filter?: POFilter): Promise<PurchaseOrder[]>;
  getById(id: string): Promise<PurchaseOrder | null>;
  create(po: CreatePurchaseOrderInput): Promise<PurchaseOrder>;
  updateStatus(id: string, status: POStatus): Promise<PurchaseOrder>;
}

export type PersistenceMode = "LOCAL_STORAGE" | "POSTGRESQL_DIRECT" | "UNCONFIGURED_DEMO";

export interface DataLayerStatus {
  mode: PersistenceMode;
  isDemo: boolean;
  activeTenantId: string;
  canWriteToDb: boolean;
  persistence: {
    products: string;
    customers: string;
    purchaseOrders: string;
  };
  notes: string;
}

export type PaymentMethod = "CASH" | "UPI" | "UDHAAR";

export interface SaleItem {
  sku: string;
  productNameEn?: string;
  productNameHi?: string;
  quantity: number;
  unitEn?: string;
  unitHi?: string;
  unitPrice: number;
  lineTotal?: number;
}

export interface SaleRecord {
  id: string;
  timestamp: string;
  customerName?: string;
  customerId?: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
  isDemoSimulation: boolean;
}


