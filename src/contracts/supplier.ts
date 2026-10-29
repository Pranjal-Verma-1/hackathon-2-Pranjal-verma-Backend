export interface Supplier {
  id: string;
  tenantId: string;
  nameEn: string;
  nameHi: string;
  contactPerson: string;
  phone: string;
  email?: string;
  city: string;
  marketArea: string;
  gstin?: string;
  paymentTerms: string;
  leadTimeDays: number;
  productCategoriesEn: string[];
  productCategoriesHi: string[];
  createdAt?: string;
  updatedAt?: string;
}

