-- CreateEnum
CREATE TYPE "HealthEducationMediaType" AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'VIDEO');

-- CreateTable
CREATE TABLE "health_education_messages" (
    "health_education_message_id" TEXT NOT NULL,
    "risk_condition_id" TEXT,
    "condition_label" VARCHAR(200) NOT NULL,
    "stage" VARCHAR(300) NOT NULL,
    "message_order" INTEGER NOT NULL,
    "title_en" VARCHAR(200),
    "body_en" TEXT NOT NULL,
    "body_marathi" TEXT NOT NULL DEFAULT 'Marathi content coming soon',
    "media_type" "HealthEducationMediaType" NOT NULL DEFAULT 'TEXT',
    "media_file" VARCHAR(200),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "health_education_messages_pkey" PRIMARY KEY ("health_education_message_id")
);

-- CreateIndex
CREATE INDEX "health_education_messages_risk_condition_id_idx" ON "health_education_messages"("risk_condition_id");

