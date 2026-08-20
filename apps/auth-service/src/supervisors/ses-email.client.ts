import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { appConfig } from '../config/app-config';

// Single shared client for the process lifetime — same rationale as
// media-service's s3.client.ts (HTTP agent/keep-alive pooling, and avoids
// re-resolving the default credential provider chain on every call).
const sesClient = new SESClient({ region: appConfig.AWS_REGION });

/**
 * Sends the Missed Visit Escalation TRANSFER notice (FR-SV-4.3) to a
 * resolved Manager. Returns `false` instead of throwing when
 * `SES_FROM_ADDRESS` isn't configured — no SES sending domain is verified
 * in every environment yet, and this call's own caller
 * (SupervisorService.sendTransferNotice) treats that the same as any other
 * send failure: logged, non-fatal. Deliberately not a generic mailer — one
 * narrow function for this one email, until a second real use case justifies
 * generalizing it.
 */
export async function sendTransferNoticeEmail(input: {
  to: string;
  sakhiName: string;
  beneficiaryName: string;
  visitsMissedCount: number | null;
  visitType: string;
}): Promise<boolean> {
  if (!appConfig.SES_FROM_ADDRESS) {
    console.warn('SES_FROM_ADDRESS is not configured — skipping Manager transfer-notice email.');
    return false;
  }

  const subject = `Beneficiary transfer review needed: ${input.beneficiaryName}`;
  const body =
    `${input.sakhiName}'s beneficiary ${input.beneficiaryName} has missed ` +
    `${input.visitsMissedCount ?? 'multiple'} ${input.visitType} visit(s) and has been escalated ` +
    `for TRANSFER. She has been removed from ${input.sakhiName}'s active list pending your review ` +
    `(up to 15 days) — please review and reassign to another Sakhi.`;

  try {
    await sesClient.send(
      new SendEmailCommand({
        Source: appConfig.SES_FROM_ADDRESS,
        Destination: { ToAddresses: [input.to] },
        Message: {
          Subject: { Data: subject },
          Body: { Text: { Data: body } },
        },
      }),
    );
    return true;
  } catch (err) {
    console.error('Failed to send Manager transfer-notice email:', err);
    return false;
  }
}
