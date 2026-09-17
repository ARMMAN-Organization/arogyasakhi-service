-- Phase 1 of 2 for the SRS "Unique ID" field (State(2)-District(3)-Block(3)-ID(6)):
-- add the column as nullable and create the global sequence backing its
-- ID(6) segment. A companion backfill script assigns unique_id to every
-- existing row (resolving geography via auth-service's API, which a plain
-- SQL migration cannot do), after which a follow-up migration adds the
-- NOT NULL + UNIQUE constraint.

CREATE SEQUENCE "beneficiary_unique_id_seq" START WITH 1 INCREMENT BY 1;

ALTER TABLE "beneficiary_cases" ADD COLUMN "unique_id" VARCHAR(20);
