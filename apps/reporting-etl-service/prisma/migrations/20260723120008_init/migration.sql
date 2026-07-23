-- CreateEnum
CREATE TYPE "EtlRunStatus" AS ENUM ('STARTED', 'SUCCESS', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "etl_runs" (
    "etl_run_id" TEXT NOT NULL,
    "dag_id" VARCHAR(120) NOT NULL,
    "run_started_at" TIMESTAMP(3) NOT NULL,
    "run_completed_at" TIMESTAMP(3),
    "source_watermark" TIMESTAMP(3),
    "target_watermark" TIMESTAMP(3),
    "status" "EtlRunStatus" NOT NULL,
    "rows_processed" BIGINT NOT NULL DEFAULT 0,
    "error_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "etl_runs_pkey" PRIMARY KEY ("etl_run_id")
);

-- CreateTable
CREATE TABLE "report_exports" (
    "report_export_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "report_code" VARCHAR(100) NOT NULL,
    "filter_json" JSONB,
    "exported_at" TIMESTAMP(3) NOT NULL,
    "file_uri" VARCHAR(512),
    "row_count" BIGINT,
    "download_timestamp" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "report_exports_pkey" PRIMARY KEY ("report_export_id")
);

