-- CreateEnum
CREATE TYPE "Responder" AS ENUM ('RELATIVE', 'HUSBAND', 'SAKHI', 'PERSON_WHO_DOES_NOT_KNOW_WOMAN');

-- CreateEnum
CREATE TYPE "CallStatus_new" AS ENUM ('PICKED_UP_TALKED', 'PICKED_UP_NO_ONE_TALKING', 'PICKED_UP_CUT_MIDWAY', 'CALL_BACK', 'NOT_PICKED_UP', 'RINGING', 'PHONE_OFF', 'OUT_OF_NETWORK');

-- Remap existing call_logs.call_status values onto the new enum's closest equivalent
-- before swapping the column's type (old values have no direct counterpart in the
-- new set, so this preserves each row's meaning rather than failing/discarding it).
ALTER TABLE "call_logs" ADD COLUMN "call_status_new" "CallStatus_new";

UPDATE "call_logs" SET "call_status_new" = CASE "call_status"::text
  WHEN 'CONNECTED' THEN 'PICKED_UP_TALKED'
  WHEN 'NOT_CONNECTED' THEN 'NOT_PICKED_UP'
  WHEN 'FOLLOWUP_REQUIRED' THEN 'CALL_BACK'
  WHEN 'BUSY' THEN 'RINGING'
  WHEN 'SWITCHED_OFF' THEN 'PHONE_OFF'
  WHEN 'WRONG_NUMBER' THEN 'OUT_OF_NETWORK'
END::"CallStatus_new";

ALTER TABLE "call_logs" ALTER COLUMN "call_status_new" SET NOT NULL;
ALTER TABLE "call_logs" DROP COLUMN "call_status";
ALTER TABLE "call_logs" RENAME COLUMN "call_status_new" TO "call_status";

DROP TYPE "CallStatus";
ALTER TYPE "CallStatus_new" RENAME TO "CallStatus";

-- AlterTable
ALTER TABLE "call_logs" ADD COLUMN "responder" "Responder";
