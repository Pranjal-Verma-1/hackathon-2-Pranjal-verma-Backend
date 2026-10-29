export type AuditSeverity = "INFO" | "WARNING" | "AUDIT_SEAL" | "SECURITY_ALERT";

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  timestamp: string;
  actor: string;
  userId?: string;
  action: string;
  scope: string;
  severity: AuditSeverity;
  details: string;
  metadata?: Record<string, unknown>;
}

