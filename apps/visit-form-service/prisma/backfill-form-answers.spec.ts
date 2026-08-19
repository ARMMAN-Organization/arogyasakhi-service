import { backfillSubmission } from './backfill-form-answers';
import type { FormField } from '../src/forms/dto/form-field.dto';

describe('backfillSubmission', () => {
  const updateMany = jest.fn();
  const createMany = jest.fn();
  const client = { formAnswer: { updateMany, createMany } } as never;

  const resolvedSchema: FormField[] = [
    { question_code: 'phone_owner', label: 'x', input_type: 'text', required: false },
    { question_code: 'bp_systolic', label: 'x', input_type: 'number', required: false },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('re-derives form_answers from form_data_json and soft-deletes the existing rows', async () => {
    const result = await backfillSubmission(
      client,
      { id: 'sub-1', formDataJson: { phone_owner: 'SELF', bp_systolic: 118 } },
      resolvedSchema,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { submissionId: 'sub-1', isDeleted: false },
      data: { isDeleted: true, deletedAt: expect.any(Date) },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ submissionId: 'sub-1', fieldCode: 'phone_owner' }),
        expect.objectContaining({ submissionId: 'sub-1', fieldCode: 'bp_systolic' }),
      ]),
    });
    expect(result).toEqual({ answersWritten: 2 });
  });

  it('does not hard-delete — only soft-deletes via isDeleted/deletedAt', async () => {
    await backfillSubmission(
      client,
      { id: 'sub-1', formDataJson: { phone_owner: 'SELF' } },
      resolvedSchema,
    );

    expect(updateMany).toHaveBeenCalled();
    // No deleteMany call exists on the mocked client at all — this would
    // throw if backfillSubmission ever called it, since the mock has no
    // such method.
  });

  it('is idempotent — running it twice in a row produces the same answersWritten count', async () => {
    const submission = { id: 'sub-1', formDataJson: { phone_owner: 'SELF', bp_systolic: 118 } };

    const first = await backfillSubmission(client, submission, resolvedSchema);
    const second = await backfillSubmission(client, submission, resolvedSchema);

    expect(first).toEqual(second);
    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it('replaces with zero rows and does not throw when form_data_json is empty', async () => {
    const result = await backfillSubmission(
      client,
      { id: 'sub-empty', formDataJson: {} },
      resolvedSchema,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { submissionId: 'sub-empty', isDeleted: false },
      data: { isDeleted: true, deletedAt: expect.any(Date) },
    });
    expect(createMany).not.toHaveBeenCalled();
    expect(result).toEqual({ answersWritten: 0 });
  });

  it('treats a JSON array form_data_json as unparseable (empty object), not as numeric-indexed fields', async () => {
    const result = await backfillSubmission(
      client,
      { id: 'sub-array', formDataJson: ['not', 'an', 'object'] },
      resolvedSchema,
    );

    expect(createMany).not.toHaveBeenCalled();
    expect(result).toEqual({ answersWritten: 0 });
  });

  it('treats a null form_data_json as an empty object', async () => {
    const result = await backfillSubmission(
      client,
      { id: 'sub-null', formDataJson: null },
      resolvedSchema,
    );

    expect(result).toEqual({ answersWritten: 0 });
  });
});
