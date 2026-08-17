-- CreateEnum
CREATE TYPE "RiskParameterDataType" AS ENUM ('NUMERIC', 'BOOLEAN', 'CATEGORICAL');

-- CreateTable
CREATE TABLE "risk_parameters" (
    "risk_parameter_id" TEXT NOT NULL,
    "parameter_code" VARCHAR(80) NOT NULL,
    "parameter_name" VARCHAR(160) NOT NULL,
    "entity_type" "RiskEntityType" NOT NULL,
    "unit" VARCHAR(40),
    "data_type" "RiskParameterDataType" NOT NULL,
    "status" "RiskConditionStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,

    CONSTRAINT "risk_parameters_pkey" PRIMARY KEY ("risk_parameter_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "risk_parameters_parameter_code_key" ON "risk_parameters"("parameter_code");

