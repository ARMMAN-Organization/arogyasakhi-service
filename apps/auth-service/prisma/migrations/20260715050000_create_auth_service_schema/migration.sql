-- Prisma is configured to target the auth_service schema (multiSchema +
-- @@schema on every model/enum in schema.prisma), but no earlier migration
-- in this history actually created that schema or moved the tables/enums
-- created by 20260714113255_init, 20260715000000_add_username, and
-- 20260715020000_add_funders_projects into it — those all ran against the
-- default "public" schema. On a fresh database this leaves auth_service
-- missing entirely (migrations targeting it would fail); on an existing
-- database (e.g. production, already moved by hand outside of a tracked
-- migration) the objects already live in auth_service, so every statement
-- below is written to be a safe no-op there.
--
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "auth_service";

DO $$
BEGIN
  -- Move tables, only if they still exist in "public" (idempotent on
  -- databases where this was already done by hand, e.g. production).
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users') THEN
    ALTER TABLE "public"."users" SET SCHEMA "auth_service";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'roles') THEN
    ALTER TABLE "public"."roles" SET SCHEMA "auth_service";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_roles') THEN
    ALTER TABLE "public"."user_roles" SET SCHEMA "auth_service";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_sessions') THEN
    ALTER TABLE "public"."user_sessions" SET SCHEMA "auth_service";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'funders') THEN
    ALTER TABLE "public"."funders" SET SCHEMA "auth_service";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects') THEN
    ALTER TABLE "public"."projects" SET SCHEMA "auth_service";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'geography_units') THEN
    ALTER TABLE "public"."geography_units" SET SCHEMA "auth_service";
  END IF;

  -- Move enum types, only if they still exist in "public".
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'UserStatus'
  ) THEN
    ALTER TYPE "public"."UserStatus" SET SCHEMA "auth_service";
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'UserRoleStatus'
  ) THEN
    ALTER TYPE "public"."UserRoleStatus" SET SCHEMA "auth_service";
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'FunderStatus'
  ) THEN
    ALTER TYPE "public"."FunderStatus" SET SCHEMA "auth_service";
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'ProjectStatus'
  ) THEN
    ALTER TYPE "public"."ProjectStatus" SET SCHEMA "auth_service";
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'GeoType'
  ) THEN
    ALTER TYPE "public"."GeoType" SET SCHEMA "auth_service";
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'GeographyUnitStatus'
  ) THEN
    ALTER TYPE "public"."GeographyUnitStatus" SET SCHEMA "auth_service";
  END IF;
END $$;
