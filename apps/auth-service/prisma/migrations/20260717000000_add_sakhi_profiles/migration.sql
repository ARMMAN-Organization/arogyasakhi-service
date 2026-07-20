-- AddForeignKey
-- user_roles.project_id now has a real Prisma relation to projects (both
-- tables live in the auth_service schema already) -- previously modeled as
-- a plain scalar column under a stale "owned by another service" comment.
ALTER TABLE "auth_service"."user_roles" ADD CONSTRAINT "user_roles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "auth_service"."projects"("project_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
-- Column set matches docs/Arogya_Sakhi_Database_Design_ERD_Table_Definitions.docx.md
-- "sakhi_profiles" (Appendix A) exactly. supervisor_id references
-- supervisor_profiles.supervisor_id, which is not modeled anywhere yet --
-- left as a plain scalar column, not a Prisma relation.
CREATE TABLE "auth_service"."sakhi_profiles" (
    "sakhi_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "primary_project_id" TEXT NOT NULL,
    "supervisor_id" TEXT,
    "employee_code" VARCHAR(80),
    "phone_number" VARCHAR(13) NOT NULL,
    "backup_contact" VARCHAR(13),
    "pan_token" BYTEA,
    "aadhaar_token" BYTEA,
    "bank_account_token" BYTEA,
    "ifsc_code" VARCHAR(20),
    "active_from" DATE NOT NULL,
    "active_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sakhi_profiles_pkey" PRIMARY KEY ("sakhi_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sakhi_profiles_user_id_key" ON "auth_service"."sakhi_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sakhi_profiles_employee_code_key" ON "auth_service"."sakhi_profiles"("employee_code");

-- AddForeignKey
ALTER TABLE "auth_service"."sakhi_profiles" ADD CONSTRAINT "sakhi_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_service"."users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_service"."sakhi_profiles" ADD CONSTRAINT "sakhi_profiles_primary_project_id_fkey" FOREIGN KEY ("primary_project_id") REFERENCES "auth_service"."projects"("project_id") ON DELETE RESTRICT ON UPDATE CASCADE;
