const appConfigMock: { AWS_REGION: string; SES_FROM_ADDRESS?: string } = {
  AWS_REGION: 'ap-south-1',
  SES_FROM_ADDRESS: 'no-reply@example.com',
};
jest.mock('../config/app-config', () => ({ appConfig: appConfigMock }));

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  SendEmailCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

import { SendEmailCommand } from '@aws-sdk/client-ses';
import { sendTransferNoticeEmail } from './ses-email.client';

describe('sendTransferNoticeEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appConfigMock.SES_FROM_ADDRESS = 'no-reply@example.com';
  });

  it('sends via SES and returns true on success', async () => {
    mockSend.mockResolvedValue({});

    const result = await sendTransferNoticeEmail({
      to: 'manager@example.com',
      sakhiName: 'Priya Sharma',
      beneficiaryName: 'Jane Doe',
      visitsMissedCount: 2,
      visitType: 'ANC',
    });

    expect(result).toBe(true);
    expect(SendEmailCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Source: 'no-reply@example.com',
        Destination: { ToAddresses: ['manager@example.com'] },
      }),
    );
  });

  it('returns false without calling SES when SES_FROM_ADDRESS is not configured', async () => {
    appConfigMock.SES_FROM_ADDRESS = undefined;

    const result = await sendTransferNoticeEmail({
      to: 'manager@example.com',
      sakhiName: 'Priya Sharma',
      beneficiaryName: 'Jane Doe',
      visitsMissedCount: 2,
      visitType: 'ANC',
    });

    expect(result).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns false (not throw) when the SES send fails', async () => {
    mockSend.mockRejectedValue(new Error('SES is down'));

    const result = await sendTransferNoticeEmail({
      to: 'manager@example.com',
      sakhiName: 'Priya Sharma',
      beneficiaryName: 'Jane Doe',
      visitsMissedCount: null,
      visitType: 'PP',
    });

    expect(result).toBe(false);
  });
});
