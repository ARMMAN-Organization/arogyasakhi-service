-- AlterEnum
-- HR_MISSED_VISIT_ESCALATION — visit-form-service's HR-missed-visit escalation
-- trigger (missedVisit.job.ts) sends this notificationType to the assigned
-- supervisor whenever an HR visit family (ANC_HR/PP_HR/NN_HR/INC_HR/CCV_HR)
-- crosses its escalation threshold, distinct from the generic
-- MISSED_VISIT_ESCALATION every other missed-visit family still uses.
ALTER TYPE "NotificationType" ADD VALUE 'HR_MISSED_VISIT_ESCALATION';
