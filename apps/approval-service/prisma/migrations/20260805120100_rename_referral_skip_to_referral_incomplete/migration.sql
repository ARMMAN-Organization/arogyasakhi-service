-- AlterEnum
-- Renamed to match the Quick Response spec's card type name — same concept
-- (a Sakhi's referral follow-up wasn't completed), naming drift only.
-- Verify with SELECT COUNT(*) FROM approval_requests WHERE request_type =
-- 'REFERRAL_SKIP' before running in an environment with real data — the
-- rename itself preserves any existing rows' meaning, so this is safe
-- regardless of row count, but worth confirming what will be affected.
ALTER TYPE "ApprovalRequestType" RENAME VALUE 'REFERRAL_SKIP' TO 'REFERRAL_INCOMPLETE';
