export type TenantTier =
  | "Retail Pro MSME"
  | "Enterprise Partition"
  | "Growth Cluster"
  | "Standard MSME";

export type TenantRole = "OWNER" | "ADMIN" | "MANAGER" | "STAFF" | "VIEWER";

export interface TenantWorkspace {
  id: string;
  name: string;
  slug: string;
  tier: TenantTier;
  region: string;
  activeWorkflows: number;
  slaRate: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TenantMembership {
  id: string;
  tenantId: string;
  userId: string;
  role: TenantRole;
  isActive: boolean;
  createdAt: string;
}

