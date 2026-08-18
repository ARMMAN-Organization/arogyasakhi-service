-- CreateTable
CREATE TABLE "application_parameters" (
    "application_parameter_id" TEXT NOT NULL,
    "param_key" VARCHAR(100) NOT NULL,
    "param_value" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,

    CONSTRAINT "application_parameters_pkey" PRIMARY KEY ("application_parameter_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "application_parameters_param_key_key" ON "application_parameters"("param_key");
