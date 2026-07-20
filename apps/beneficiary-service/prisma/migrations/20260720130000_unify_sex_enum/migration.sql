-- Unify beneficiary_pii.sex (Sex: FEMALE/MALE/OTHER/UNKNOWN) and
-- child_case_details.sex (ChildSex: FEMALE/MALE/OTHER/INTERSEX) into one
-- shared enum, keeping INTERSEX and dropping UNKNOWN. Any existing
-- beneficiary_pii row with sex = 'UNKNOWN' is remapped to 'OTHER' (the
-- closest remaining value) before the old type is dropped.

-- CreateEnum
CREATE TYPE "Sex_new" AS ENUM ('FEMALE', 'MALE', 'OTHER', 'INTERSEX');

-- Remap UNKNOWN -> OTHER on beneficiary_pii before converting the column type.
UPDATE "beneficiary_pii" SET "sex" = 'OTHER' WHERE "sex" = 'UNKNOWN';

-- AlterTable: beneficiary_pii.sex (Sex -> Sex_new)
ALTER TABLE "beneficiary_pii" ALTER COLUMN "sex" DROP DEFAULT;
ALTER TABLE "beneficiary_pii" ALTER COLUMN "sex" TYPE "Sex_new" USING ("sex"::text::"Sex_new");

-- AlterTable: child_case_details.sex (ChildSex -> Sex_new)
ALTER TABLE "child_case_details" ALTER COLUMN "sex" DROP DEFAULT;
ALTER TABLE "child_case_details" ALTER COLUMN "sex" TYPE "Sex_new" USING ("sex"::text::"Sex_new");

-- DropEnum
DROP TYPE "Sex";
DROP TYPE "ChildSex";

-- Rename the new type to the name Prisma's schema.prisma expects ("Sex").
ALTER TYPE "Sex_new" RENAME TO "Sex";
