import { backfillSubmission } from './backfill-form-answers';

describe('backfillSubmission', () => {
  const findUnique = jest.fn();
  const deleteMany = jest.fn();
  const createMany = jest.fn();
  const client = {
    formVersion: { findUnique },
    formAnswer: { deleteMany, createMany },
  } as never;

  const publishedVersion = {
    id: 'version-1',
    schemaJson: [
      { question_code: 'phone_owner', label: 'x', input_type: 'text', required: false },
      { question_code: 'bp_systolic', label: 'x', input_type: 'number', required: false },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('re-derives form_answers from form_data_json and replaces the existing rows', async () => {
    findUnique.mockResolvedValue(publishedVersion);

    const result = await backfillSubmission(client, {
      id: 'sub-1',
      formVersionId: 'version-1',
      formDataJson: { phone_owner: 'SELF', bp_systolic: 118 },
    });

    expect(deleteMany).toHaveBeenCalledWith({ where: { submissionId: 'sub-1' } });
    expect(createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ submissionId: 'sub-1', fieldCode: 'phone_owner' }),
        expect.objectContaining({ submissionId: 'sub-1', fieldCode: 'bp_systolic' }),
      ]),
    });
    expect(result).toEqual({ answersWritten: 2 });
  });

  it('is idempotent — running it twice in a row produces the same answersWritten count', async () => {
    findUnique.mockResolvedValue(publishedVersion);
    const submission = {
      id: 'sub-1',
      formVersionId: 'version-1',
      formDataJson: { phone_owner: 'SELF', bp_systolic: 118 },
    };

    const first = await backfillSubmission(client, submission);
    const second = await backfillSubmission(client, submission);

    expect(first).toEqual(second);
    expect(deleteMany).toHaveBeenCalledTimes(2);
  });

  it('skips a submission whose form_version_id no longer resolves, without deleting its existing answers', async () => {
    findUnique.mockResolvedValue(null);

    const result = await backfillSubmission(client, {
      id: 'sub-orphaned',
      formVersionId: 'deleted-version',
      formDataJson: { phone_owner: 'SELF' },
    });

    expect(result).toEqual({ skipped: expect.stringContaining('form_version_id') });
    expect(deleteMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('replaces with zero rows and does not throw when form_data_json is empty', async () => {
    findUnique.mockResolvedValue(publishedVersion);

    const result = await backfillSubmission(client, {
      id: 'sub-empty',
      formVersionId: 'version-1',
      formDataJson: {},
    });

    expect(deleteMany).toHaveBeenCalledWith({ where: { submissionId: 'sub-empty' } });
    expect(createMany).not.toHaveBeenCalled();
    expect(result).toEqual({ answersWritten: 0 });
  });
});
