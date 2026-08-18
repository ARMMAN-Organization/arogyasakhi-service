import { formSubmissionSchema } from './form.schemas';

function submission(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '9a1b2c3d-4e5f-6789-0abc-def012345678',
    formVersionId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    beneficiaryId: '34197cd7-7a54-4e7f-885c-f297313b9e81',
    visitId: null,
    submittedByUserId: 'ba9c28fa-35fc-44e5-947c-eeca811bc052',
    submittedAt: '2026-07-20T10:15:00.000Z',
    localSubmissionUuid: 'device-abc-submission-001',
    formData: { weightKg: 58 },
    validationStatus: 'VALID',
    createdAt: '2026-07-20T10:15:00.000Z',
    updatedAt: '2026-07-20T10:15:00.000Z',
    ...overrides,
  };
}

describe('formSubmissionSchema', () => {
  it('accepts a submission without childBeneficiaryIds', () => {
    expect(() => formSubmissionSchema.parse(submission())).not.toThrow();
  });

  it('accepts a submission with childBeneficiaryIds', () => {
    const result = formSubmissionSchema.parse(
      submission({
        childBeneficiaryIds: [
          '34197cd7-7a54-4e7f-885c-f297313b9e81',
          '9a1b2c3d-4e5f-6789-0abc-def012345678',
        ],
      }),
    );
    expect(result.childBeneficiaryIds).toEqual([
      '34197cd7-7a54-4e7f-885c-f297313b9e81',
      '9a1b2c3d-4e5f-6789-0abc-def012345678',
    ]);
  });

  it('rejects a childBeneficiaryIds entry that is not a uuid', () => {
    expect(() =>
      formSubmissionSchema.parse(submission({ childBeneficiaryIds: ['not-a-uuid'] })),
    ).toThrow();
  });
});
