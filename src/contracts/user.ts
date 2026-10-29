import { TenantRole } from "./tenant.js";

export interface UserProfile {
  id: string;
  email: string;
  phone?: string;
  fullName: string;
  avatarUrl?: string;
  defaultTenantId: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SessionContext {
  userId: string;
  tenantId: string;
  role: TenantRole;
  isDemoSession: boolean;
  tokenExpiresAt: number;
}

export interface SignUpCredentials {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  storeName?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface TenantMembershipSummary {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: TenantRole;
  isActive: boolean;
}

export interface AuthSession {
  user: {
    id: string;
    authUserId?: string;
    email: string;
    fullName: string;
    phone?: string;
  };
  activeTenant: {
    id: string;
    name: string;
    slug: string;
    role: TenantRole;
  };
  memberships: TenantMembershipSummary[];
  authMode: "APPLICATION_SESSION" | "SUPABASE_JWT" | "DEMO_SIMULATION";
  isAuthenticated: boolean;
  isDemo: boolean;
  accessToken?: string;
  expiresAt?: string;
  notes?: string;
}
