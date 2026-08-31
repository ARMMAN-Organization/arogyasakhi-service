-- CreateTable
CREATE TABLE "service_accounts" (
    "service_account_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "client_id" VARCHAR(80) NOT NULL,
    "client_secret_hash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_accounts_pkey" PRIMARY KEY ("service_account_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_accounts_client_id_key" ON "service_accounts"("client_id");
