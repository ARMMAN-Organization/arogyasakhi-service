-- CreateEnum
CREATE TYPE "MediaAssetType" AS ENUM ('CONSENT_PHOTO', 'REFERRAL_CASE_PAPER', 'REFERRAL_DISCHARGE_SUMMARY', 'REFERRAL_HEALTH_FACILITY_PHOTO', 'REFERRAL_SAKHI_BENEFICIARY_PHOTO', 'REFERRAL_INVESTIGATION_REPORT', 'TRAINING_PHOTO', 'HEALTH_EDUCATION', 'FAQ', 'REPORT_EXPORT', 'OTHER');

-- CreateTable
CREATE TABLE "media_assets" (
    "media_asset_id" TEXT NOT NULL,
    "asset_type" "MediaAssetType" NOT NULL,
    "storage_uri" VARCHAR(512) NOT NULL,
    "checksum" BYTEA NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "uploaded_by_user_id" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL,
    "linked_entity_type" VARCHAR(80),
    "linked_entity_id" TEXT,
    "encrypted_flag" BOOLEAN NOT NULL DEFAULT true,
    "beneficiary_id" TEXT,
    "visit_id" TEXT,
    "submission_id" TEXT,
    "referral_id" TEXT,
    "followup_id" TEXT,
    "event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("media_asset_id")
);

-- CreateTable
CREATE TABLE "referral_followup_media" (
    "referral_followup_media_id" TEXT NOT NULL,
    "followup_id" TEXT NOT NULL,
    "media_asset_id" TEXT NOT NULL,
    "asset_type_lookup_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_followup_media_pkey" PRIMARY KEY ("referral_followup_media_id")
);

-- AddForeignKey
ALTER TABLE "referral_followup_media" ADD CONSTRAINT "referral_followup_media_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("media_asset_id") ON DELETE RESTRICT ON UPDATE CASCADE;

