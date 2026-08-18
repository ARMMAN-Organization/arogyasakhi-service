-- CreateTable
CREATE TABLE "visit_masters" (
    "visit_master_id" TEXT NOT NULL,
    "visit_code" VARCHAR(40) NOT NULL,
    "visit_type" "VisitCodeType" NOT NULL,
    "display_name" VARCHAR(160) NOT NULL,
    "entity_type" "FormEntityType" NOT NULL,
    "sequence_order" INTEGER,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "visit_masters_pkey" PRIMARY KEY ("visit_master_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "visit_masters_visit_code_key" ON "visit_masters"("visit_code");
