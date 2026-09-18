-- SRS 3C.4.1 linelist fields, added as unpopulated placeholders. Meaningful
-- only for PP visits (maternal_death_date) and Neonatal visits (temperature)
-- respectively; always null on every other visit type by convention.
ALTER TABLE "visit_instances" ADD COLUMN     "maternal_death_date" DATE,
ADD COLUMN     "temperature" DECIMAL(4,1);
