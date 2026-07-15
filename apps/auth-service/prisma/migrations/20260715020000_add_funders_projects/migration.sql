-- CreateEnum
CREATE TYPE "FunderStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CLOSED');

-- CreateTable
CREATE TABLE "funders" (
    "funder_id" TEXT NOT NULL,
    "funder_code" VARCHAR(50) NOT NULL,
    "funder_name" VARCHAR(40) NOT NULL,
    "status" "FunderStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "funders_pkey" PRIMARY KEY ("funder_id")
);

-- CreateTable
CREATE TABLE "projects" (
    "project_id" TEXT NOT NULL,
    "funder_id" TEXT,
    "project_code" VARCHAR(80) NOT NULL,
    "project_name" VARCHAR(80) NOT NULL,
    "financial_year" VARCHAR(9) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("project_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "funders_funder_code_key" ON "funders"("funder_code");

-- CreateIndex
CREATE UNIQUE INDEX "projects_project_code_key" ON "projects"("project_code");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_funder_id_fkey" FOREIGN KEY ("funder_id") REFERENCES "funders"("funder_id") ON DELETE SET NULL ON UPDATE CASCADE;
