-- SRS 3C.4.1 linelist fields.
-- referral_level: unpopulated placeholder (no value set defined by ARMMAN yet).
-- entity_type/child_id/followup_attempt_number: populated at write time by
-- ReferralFollowupService.create; entity_type/child_id backfilled once via a
-- separate batch job for pre-existing rows.
ALTER TABLE "referrals" ADD COLUMN     "referral_level" VARCHAR(50);

ALTER TABLE "referral_followups" ADD COLUMN     "entity_type" "RiskEntityType",
ADD COLUMN     "child_id" TEXT,
ADD COLUMN     "followup_attempt_number" INTEGER;
