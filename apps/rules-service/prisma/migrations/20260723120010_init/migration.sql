-- CreateEnum
CREATE TYPE "RuleCategory" AS ENUM ('SCHEDULE', 'RISK', 'ESCALATION', 'INCENTIVE', 'CLOSURE', 'NOTIFICATION');

-- CreateEnum
CREATE TYPE "RuleSetStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "RuleVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateTable
CREATE TABLE "rule_sets" (
    "rule_set_id" TEXT NOT NULL,
    "rule_category" "RuleCategory" NOT NULL,
    "rule_set_name" VARCHAR(160) NOT NULL,
    "status" "RuleSetStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "rule_sets_pkey" PRIMARY KEY ("rule_set_id")
);

-- CreateTable
CREATE TABLE "rule_versions" (
    "rule_version_id" TEXT NOT NULL,
    "rule_set_id" TEXT NOT NULL,
    "version_no" VARCHAR(40) NOT NULL,
    "rules_json" JSONB NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "published_by_user_id" TEXT,
    "checksum" BYTEA NOT NULL,
    "status" "RuleVersionStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "rule_versions_pkey" PRIMARY KEY ("rule_version_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rule_versions_rule_set_id_version_no_key" ON "rule_versions"("rule_set_id", "version_no");

-- AddForeignKey
ALTER TABLE "rule_versions" ADD CONSTRAINT "rule_versions_rule_set_id_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "rule_sets"("rule_set_id") ON DELETE RESTRICT ON UPDATE CASCADE;

