-- CreateEnum
CREATE TYPE "GeoType" AS ENUM ('STATE', 'DISTRICT', 'BLOCK', 'PHC', 'SUBCENTRE', 'VILLAGE', 'PADA');

-- CreateEnum
CREATE TYPE "GeographyUnitStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "geography_units" (
    "geography_unit_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "geo_type" "GeoType" NOT NULL,
    "geo_code" VARCHAR(80),
    "name" VARCHAR(180) NOT NULL,
    "status" "GeographyUnitStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "geography_units_pkey" PRIMARY KEY ("geography_unit_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "geography_units_parent_id_geo_type_geo_code_key" ON "geography_units"("parent_id", "geo_type", "geo_code");

-- AddForeignKey
ALTER TABLE "geography_units" ADD CONSTRAINT "geography_units_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "geography_units"("geography_unit_id") ON DELETE SET NULL ON UPDATE CASCADE;
