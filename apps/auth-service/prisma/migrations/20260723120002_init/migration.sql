-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED', 'PAUSED', 'DELETED');

-- CreateEnum
CREATE TYPE "UserRoleStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "FunderStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "GeoType" AS ENUM ('STATE', 'DISTRICT', 'BLOCK', 'PHC', 'SUBCENTRE', 'VILLAGE', 'PADA');

-- CreateEnum
CREATE TYPE "GeographyUnitStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'WEB');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'LOST', 'REPLACED', 'PAUSED', 'BLOCKED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TargetPeriodType" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL', 'PROJECT_PERIOD');

-- CreateEnum
CREATE TYPE "SakhiAssignmentType" AS ENUM ('PRIMARY', 'SECONDARY', 'TEMPORARY_COVERAGE', 'PAUSED', 'STOPPED');

-- CreateTable
CREATE TABLE "users" (
    "user_id" TEXT NOT NULL,
    "mobile_number" VARCHAR(13) NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(254),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "password_changed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "roles" (
    "role_id" TEXT NOT NULL,
    "role_code" VARCHAR(50) NOT NULL,
    "role_name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_role_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "project_id" TEXT,
    "geography_unit_id" TEXT,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "status" "UserRoleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_role_id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token_hash" VARCHAR(255) NOT NULL,
    "device_id" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "funders" (
    "funder_id" TEXT NOT NULL,
    "funder_code" VARCHAR(50) NOT NULL,
    "funder_name" VARCHAR(40) NOT NULL,
    "status" "FunderStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "funders_pkey" PRIMARY KEY ("funder_id")
);

-- CreateTable
CREATE TABLE "projects" (
    "project_id" TEXT NOT NULL,
    "funder_id" TEXT,
    "project_code" VARCHAR(80) NOT NULL,
    "project_name" VARCHAR(80) NOT NULL,
    "financial_year" VARCHAR(9) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "sakhi_profiles" (
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

-- CreateTable
CREATE TABLE "lookup_categories" (
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
CREATE TABLE "lookup_values" (
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

-- CreateTable
CREATE TABLE "supervisor_profiles" (
    "supervisor_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "manager_user_id" TEXT,
    "geography_unit_id" TEXT,
    "active_from" DATE NOT NULL,
    "active_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "supervisor_profiles_pkey" PRIMARY KEY ("supervisor_id")
);

-- CreateTable
CREATE TABLE "device_registry" (
    "device_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_uuid" VARCHAR(128) NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "os_version" VARCHAR(60),
    "app_version" VARCHAR(40),
    "last_sync_at" TIMESTAMP(3),
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "device_registry_pkey" PRIMARY KEY ("device_id")
);

-- CreateTable
CREATE TABLE "project_geographies" (
    "project_geo_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "geography_unit_id" TEXT NOT NULL,
    "active_from" DATE NOT NULL,
    "active_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "project_geographies_pkey" PRIMARY KEY ("project_geo_id")
);

-- CreateTable
CREATE TABLE "project_registration_targets" (
    "target_id" TEXT NOT NULL,
    "funder_id" TEXT,
    "project_id" TEXT NOT NULL,
    "geography_unit_id" TEXT,
    "case_type_lookup_id" TEXT,
    "target_period_type" "TargetPeriodType",
    "target_period_start" DATE NOT NULL,
    "target_period_end" DATE NOT NULL,
    "registration_target" INTEGER,
    "status_lookup_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,

    CONSTRAINT "project_registration_targets_pkey" PRIMARY KEY ("target_id")
);

-- CreateTable
CREATE TABLE "sakhi_assignments" (
    "assignment_id" TEXT NOT NULL,
    "sakhi_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "geography_unit_id" TEXT NOT NULL,
    "assignment_type" "SakhiAssignmentType" NOT NULL DEFAULT 'PRIMARY',
    "active_from" DATE NOT NULL,
    "active_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sakhi_assignments_pkey" PRIMARY KEY ("assignment_id")
);

-- CreateTable
CREATE TABLE "sakhi_location_assignments" (
    "sakhi_location_assignment_id" TEXT NOT NULL,
    "sakhi_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "village_id" TEXT NOT NULL,
    "pada_id" TEXT,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "status_lookup_id" TEXT,

    CONSTRAINT "sakhi_location_assignments_pkey" PRIMARY KEY ("sakhi_location_assignment_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_mobile_number_key" ON "users"("mobile_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_role_code_key" ON "roles"("role_code");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_refresh_token_hash_key" ON "user_sessions"("refresh_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "funders_funder_code_key" ON "funders"("funder_code");

-- CreateIndex
CREATE UNIQUE INDEX "projects_project_code_key" ON "projects"("project_code");

-- CreateIndex
CREATE UNIQUE INDEX "sakhi_profiles_user_id_key" ON "sakhi_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sakhi_profiles_employee_code_key" ON "sakhi_profiles"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "geography_units_parent_id_geo_type_geo_code_key" ON "geography_units"("parent_id", "geo_type", "geo_code");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_categories_category_code_key" ON "lookup_categories"("category_code");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_values_lookup_category_id_value_code_key" ON "lookup_values"("lookup_category_id", "value_code");

-- CreateIndex
CREATE UNIQUE INDEX "supervisor_profiles_user_id_key" ON "supervisor_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_registry_device_uuid_key" ON "device_registry"("device_uuid");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("role_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_funder_id_fkey" FOREIGN KEY ("funder_id") REFERENCES "funders"("funder_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sakhi_profiles" ADD CONSTRAINT "sakhi_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sakhi_profiles" ADD CONSTRAINT "sakhi_profiles_primary_project_id_fkey" FOREIGN KEY ("primary_project_id") REFERENCES "projects"("project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geography_units" ADD CONSTRAINT "geography_units_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "geography_units"("geography_unit_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lookup_values" ADD CONSTRAINT "lookup_values_lookup_category_id_fkey" FOREIGN KEY ("lookup_category_id") REFERENCES "lookup_categories"("lookup_category_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lookup_values" ADD CONSTRAINT "lookup_values_parent_lookup_value_id_fkey" FOREIGN KEY ("parent_lookup_value_id") REFERENCES "lookup_values"("lookup_value_id") ON DELETE SET NULL ON UPDATE CASCADE;

