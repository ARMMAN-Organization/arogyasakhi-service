-- AlterTable
ALTER TABLE "service_accounts" ADD COLUMN "last_auth_at" TIMESTAMP(3),
ADD COLUMN "failed_auth_count" INTEGER NOT NULL DEFAULT 0;
