# Athoo Data Retention Policy

This engineering policy must be aligned with legal advice before public launch.

- Database backups: retain at least `BACKUP_RETENTION_DAYS` (default 30).
- Audit logs: retain at least `AUDIT_LOG_RETENTION_DAYS` (default 365).
- Failed background jobs: retain at least `FAILED_JOB_RETENTION_DAYS` (default 30).
- Authentication sessions: remove expired/revoked records after the investigation window.
- Identity, banking, and payment evidence: private storage only; delete when no longer required by verification, dispute, tax, or legal obligations.
- Support and beta feedback: minimize copied personal data and restrict access by role.

Deletion jobs must be idempotent, auditable, dry-run capable, and excluded from launch until the final legal retention schedule is approved.

## Email verification and delivery records

- Email verification challenges: retain completed or expired records for `EMAIL_CHALLENGE_RETENTION_DAYS` (default 7, allowed 1–90 days).
- Email delivery audit records: retain sent, failed, and suppressed records for `EMAIL_DELIVERY_RETENTION_DAYS` (default 180, allowed 30–730 days).
- Pending/retrying email deliveries are never deleted by the email retention task.
- Marketing consent timestamps and unsubscribe state remain attached to the user preference record until the account is deleted or the approved legal schedule requires removal.
- Email retention maintenance runs at `EMAIL_MAINTENANCE_INTERVAL_MS` and is bounded by environment validation.
