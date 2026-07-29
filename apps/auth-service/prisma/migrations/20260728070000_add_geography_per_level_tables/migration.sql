-- CreateEnum
CREATE TYPE "GeographyStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "states" (
    "state_id" TEXT NOT NULL,
    "state_code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "status" "GeographyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "states_pkey" PRIMARY KEY ("state_id")
);

-- CreateTable
CREATE TABLE "districts" (
    "district_id" TEXT NOT NULL,
    "state_id" TEXT NOT NULL,
    "district_code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "status" "GeographyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "districts_pkey" PRIMARY KEY ("district_id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "block_id" TEXT NOT NULL,
    "district_id" TEXT NOT NULL,
    "block_code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "status" "GeographyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("block_id")
);

-- CreateTable
CREATE TABLE "phcs" (
    "phc_id" TEXT NOT NULL,
    "block_id" TEXT NOT NULL,
    "phc_code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "status" "GeographyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "phcs_pkey" PRIMARY KEY ("phc_id")
);

-- CreateTable
CREATE TABLE "sub_centres" (
    "sub_centre_id" TEXT NOT NULL,
    "phc_id" TEXT NOT NULL,
    "sub_centre_code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "status" "GeographyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sub_centres_pkey" PRIMARY KEY ("sub_centre_id")
);

-- CreateTable
CREATE TABLE "villages" (
    "village_id" TEXT NOT NULL,
    "sub_centre_id" TEXT NOT NULL,
    "village_code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "status" "GeographyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "villages_pkey" PRIMARY KEY ("village_id")
);

-- CreateTable
CREATE TABLE "padas" (
    "pada_id" TEXT NOT NULL,
    "village_id" TEXT NOT NULL,
    "pada_code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "status" "GeographyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "padas_pkey" PRIMARY KEY ("pada_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "states_state_code_key" ON "states"("state_code");

-- CreateIndex
CREATE UNIQUE INDEX "districts_state_id_district_code_key" ON "districts"("state_id", "district_code");

-- CreateIndex
CREATE UNIQUE INDEX "blocks_district_id_block_code_key" ON "blocks"("district_id", "block_code");

-- CreateIndex
CREATE UNIQUE INDEX "phcs_block_id_phc_code_key" ON "phcs"("block_id", "phc_code");

-- CreateIndex
CREATE UNIQUE INDEX "sub_centres_phc_id_sub_centre_code_key" ON "sub_centres"("phc_id", "sub_centre_code");

-- CreateIndex
CREATE UNIQUE INDEX "villages_sub_centre_id_village_code_key" ON "villages"("sub_centre_id", "village_code");

-- CreateIndex
CREATE UNIQUE INDEX "padas_village_id_pada_code_key" ON "padas"("village_id", "pada_code");

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("state_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("district_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phcs" ADD CONSTRAINT "phcs_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "blocks"("block_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_centres" ADD CONSTRAINT "sub_centres_phc_id_fkey" FOREIGN KEY ("phc_id") REFERENCES "phcs"("phc_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "villages" ADD CONSTRAINT "villages_sub_centre_id_fkey" FOREIGN KEY ("sub_centre_id") REFERENCES "sub_centres"("sub_centre_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "padas" ADD CONSTRAINT "padas_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("village_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "sakhi_assignments_sakhi_id_project_id_geography_unit_id_a_idx" RENAME TO "sakhi_assignments_sakhi_id_project_id_geography_unit_id_act_idx";

