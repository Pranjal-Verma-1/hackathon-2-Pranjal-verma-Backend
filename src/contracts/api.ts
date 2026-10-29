export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    tenantId: string;
    isDemo: boolean;
    timestamp: string;
    latencyMs?: number;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  search?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

