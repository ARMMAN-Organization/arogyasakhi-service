-- AlterEnum
-- REFERRAL_INCOMPLETE_UPDATE / ACCOMPANIED_REFERRAL_UPDATE / DATA_RESTORE_UPDATE /
-- CLOSURE_REVIEW_UPDATE — approval-service's and closure-reopen-service's Quick
-- Response decision-outcome notify() calls have always sent these notificationType
-- values, but they were missing from this enum, so POST /notifications 400'd and
-- the notification was silently never created (best-effort try/catch at every
-- call site swallowed the failure). ALTER TYPE ... ADD VALUE cannot run inside
-- the same transaction as other statements that use the new value, but this
-- migration only adds the values (no data backfill references them), so separate
-- single statements are safe here.
ALTER TYPE "NotificationType" ADD VALUE 'REFERRAL_INCOMPLETE_UPDATE';
ALTER TYPE "NotificationType" ADD VALUE 'ACCOMPANIED_REFERRAL_UPDATE';
ALTER TYPE "NotificationType" ADD VALUE 'DATA_RESTORE_UPDATE';
ALTER TYPE "NotificationType" ADD VALUE 'CLOSURE_REVIEW_UPDATE';
