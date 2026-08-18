-- CreateTable
CREATE TABLE "sakhi_registration_targets" (
    "sakhi_registration_target_id" TEXT NOT NULL,
    "sakhi_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "target_period_start" DATE NOT NULL,
    "target_period_end" DATE NOT NULL,
    "registration_target" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sakhi_registration_targets_pkey" PRIMARY KEY ("sakhi_registration_target_id")
);
