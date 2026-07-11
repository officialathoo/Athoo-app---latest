# Athoo Data Retention Policy

This engineering policy must be aligned with legal advice before public launch.

- Database backups: retain at least `BACKUP_RETENTION_DAYS` (default 30).
- Audit logs: retain at least `AUDIT_LOG_RETENTION_DAYS` (default 365).
- Failed background jobs: retain at least `FAILED_JOB_RETENTION_DAYS` (default 30).
- Authentication sessions: remove expired/revoked records after the investigation window.
- Identity, banking, and payment evidence: private storage only; delete when no longer required by verification, dispute, tax, or legal obligations.
- Support and beta feedback: minimize copied personal data and restrict access by role.

Deletion jobs must be idempotent, auditable, dry-run capable, and excluded from launch until the final legal retention schedule is approved.
