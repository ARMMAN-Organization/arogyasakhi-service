/*
  Warnings:

  - You are about to alter the column `funder_code` on the `funders` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `funder_name` on the `funders` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(40)`.
  - You are about to alter the column `project_code` on the `projects` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(80)`.
  - You are about to alter the column `project_name` on the `projects` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(80)`.
  - You are about to alter the column `financial_year` on the `projects` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(9)`.

*/
-- AlterTable
ALTER TABLE "funders" ALTER COLUMN "funder_code" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "funder_name" SET DATA TYPE VARCHAR(40);

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "project_code" SET DATA TYPE VARCHAR(80),
ALTER COLUMN "project_name" SET DATA TYPE VARCHAR(80),
ALTER COLUMN "financial_year" SET DATA TYPE VARCHAR(9);
