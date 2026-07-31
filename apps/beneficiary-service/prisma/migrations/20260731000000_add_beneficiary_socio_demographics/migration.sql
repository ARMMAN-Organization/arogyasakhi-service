-- CreateTable
CREATE TABLE "beneficiary_socio_demographics" (
    "socio_demographics_id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "phone_owner_lookup_id" TEXT,
    "mobile_network_availability_lookup_id" TEXT,
    "education_level_lookup_id" TEXT,
    "partner_education_level_lookup_id" TEXT,
    "partner_occupation_lookup_id" TEXT,
    "years_in_village" INTEGER,
    "migration_pattern_lookup_id" TEXT,
    "monthly_income_lookup_id" TEXT,
    "religion_lookup_id" TEXT,
    "social_category_lookup_id" TEXT,
    "family_members_count" INTEGER,
    "children_under_5_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,

    CONSTRAINT "beneficiary_socio_demographics_pkey" PRIMARY KEY ("socio_demographics_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "beneficiary_socio_demographics_beneficiary_id_key" ON "beneficiary_socio_demographics"("beneficiary_id");

-- AddForeignKey
ALTER TABLE "beneficiary_socio_demographics" ADD CONSTRAINT "beneficiary_socio_demographics_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiary_cases"("beneficiary_id") ON DELETE RESTRICT ON UPDATE CASCADE;
