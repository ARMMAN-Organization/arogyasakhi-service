-- CreateTable
CREATE TABLE "auth_service"."lookup_categories" (
    "lookup_category_id" TEXT NOT NULL,
    "category_code" VARCHAR(80) NOT NULL,
    "category_name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,

    CONSTRAINT "lookup_categories_pkey" PRIMARY KEY ("lookup_category_id")
);

-- CreateTable
CREATE TABLE "auth_service"."lookup_values" (
    "lookup_value_id" TEXT NOT NULL,
    "lookup_category_id" TEXT NOT NULL,
    "value_code" VARCHAR(80) NOT NULL,
    "value_label" VARCHAR(160) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "parent_lookup_value_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,

    CONSTRAINT "lookup_values_pkey" PRIMARY KEY ("lookup_value_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lookup_categories_category_code_key" ON "auth_service"."lookup_categories"("category_code");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_values_lookup_category_id_value_code_key" ON "auth_service"."lookup_values"("lookup_category_id", "value_code");

-- AddForeignKey
ALTER TABLE "auth_service"."lookup_values" ADD CONSTRAINT "lookup_values_lookup_category_id_fkey" FOREIGN KEY ("lookup_category_id") REFERENCES "auth_service"."lookup_categories"("lookup_category_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_service"."lookup_values" ADD CONSTRAINT "lookup_values_parent_lookup_value_id_fkey" FOREIGN KEY ("parent_lookup_value_id") REFERENCES "auth_service"."lookup_values"("lookup_value_id") ON DELETE SET NULL ON UPDATE CASCADE;
