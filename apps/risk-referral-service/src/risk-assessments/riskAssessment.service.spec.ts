import type { AuthenticatedUser } from '@armman/service-commons';
import { RiskAssessmentService } from './riskAssessment.service';
import type { RiskAssessmentRepository } from './riskAssessment.repository';
import type { CreateRiskAssessmentInput } from './dto/create-riskAssessment.dto';
import { evaluateRuleSet } from './ruleSet.client';
import { resolveRiskGradeLookupId } from './lookup.client';
import { pushRiskConditionSummary } from './beneficiaryRiskSummary.client';
import { BeneficiaryClient } from '../referrals/beneficiary.client';
import { listSakhiIdsForSupervisor } from '../referrals/sakhi.client';

jest.mock('./ruleSet.client');
jest.mock('./lookup.client');
jest.mock('./beneficiaryRiskSummary.client');
jest.mock('../referrals/sakhi.client');

describe('RiskAssessmentService', () => {
  const repository = {
    findBySubmissionId: jest.fn(),
    create: jest.fn(),
    findPhasesByConditionIds: jest.fn(),
    findConditionIdsByPhase: jest.fn(),
    findEverFlaggedConditionCodes: jest.fn(),
    findConsecutiveNoImprovementCount: jest.fn(),
    findByVisitIds: jest.fn(),
  } as unknown as jest.Mocked<RiskAssessmentRepository>;
  const beneficiaryClient = {
    getById: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryClient>;
  let service: RiskAssessmentService;

  const AUTH_HEADER = 'Bearer test-token';
  const evaluateRuleSetMock = jest.mocked(evaluateRuleSet);
  const resolveRiskGradeLookupIdMock = jest.mocked(resolveRiskGradeLookupId);
  const pushRiskConditionSummaryMock = jest.mocked(pushRiskConditionSummary);
  const listSakhiIdsForSupervisorMock = jest.mocked(listSakhiIdsForSupervisor);

  const CALLER_ID = '99999999-9999-9999-9999-999999999999';
  const BENEFICIARY_ID = '11111111-1111-1111-1111-111111111111';

  const dto: CreateRiskAssessmentInput = {
    beneficiaryId: BENEFICIARY_ID,
    visitId: '22222222-2222-2222-2222-222222222222',
    submissionId: '33333333-3333-3333-3333-333333333333',
    ruleSetId: '44444444-4444-4444-4444-444444444444',
    riskPhase: 'ANC',
    answers: { systolicBp: 145 },
  };

  function caller(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
    return {
      id: CALLER_ID,
      roles: ['SAKHI'],
      projectId: null,
      geographyUnitId: null,
      ...overrides,
    };
  }

  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

  beforeEach(() => {
    jest.resetAllMocks();
    consoleErrorSpy.mockClear();
    service = new RiskAssessmentService(repository, beneficiaryClient);
    beneficiaryClient.getById.mockResolvedValue({ id: BENEFICIARY_ID, sakhiId: CALLER_ID });
    repository.findPhasesByConditionIds.mockResolvedValue(new Map([['cond-1', 'ANC']]));
    repository.findConditionIdsByPhase.mockResolvedValue(new Map([['ANEMIA', 'cond-1']]));
    repository.findEverFlaggedConditionCodes.mockResolvedValue(new Set());
    repository.findConsecutiveNoImprovementCount.mockResolvedValue(new Map([['ANEMIA', 0]]));
    resolveRiskGradeLookupIdMock.mockResolvedValue('grade-lookup-id-1');
    pushRiskConditionSummaryMock.mockResolvedValue({ ok: true });
  });

  describe('IDOR guard', () => {
    it('404s when the beneficiary case does not exist', async () => {
      beneficiaryClient.getById.mockResolvedValue(null);

      await expect(service.create(dto, caller(), AUTH_HEADER)).rejects.toMatchObject({
        status: 404,
      });
      expect(evaluateRuleSetMock).not.toHaveBeenCalled();
    });

    it('403s when a SAKHI targets a beneficiary that is not their own', async () => {
      beneficiaryClient.getById.mockResolvedValue({
        id: BENEFICIARY_ID,
        sakhiId: 'someone-else',
      });

      await expect(
        service.create(dto, caller({ id: CALLER_ID, roles: ['SAKHI'] }), AUTH_HEADER),
      ).rejects.toThrow('This beneficiary case is outside your own roster.');
      expect(evaluateRuleSetMock).not.toHaveBeenCalled();
    });

    it("403s when a SUPERVISOR's roster does not include the beneficiary's Sakhi", async () => {
      beneficiaryClient.getById.mockResolvedValue({
        id: BENEFICIARY_ID,
        sakhiId: 'sakhi-outside',
      });
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-inside']);

      await expect(
        service.create(dto, caller({ roles: ['SUPERVISOR'], projectId: 'project-1' }), AUTH_HEADER),
      ).rejects.toThrow("This beneficiary case is outside this Supervisor's roster.");
      expect(evaluateRuleSetMock).not.toHaveBeenCalled();
    });

    it('403s when a SUPERVISOR caller has no project scope', async () => {
      await expect(
        service.create(dto, caller({ roles: ['SUPERVISOR'], projectId: null }), AUTH_HEADER),
      ).rejects.toThrow('Supervisor caller has no project scope.');
      expect(evaluateRuleSetMock).not.toHaveBeenCalled();
    });

    it('allows a MANAGER/ADMIN caller unrestricted, with no roster lookup', async () => {
      beneficiaryClient.getById.mockResolvedValue({
        id: BENEFICIARY_ID,
        sakhiId: 'any-sakhi',
      });
      evaluateRuleSetMock.mockResolvedValue({
        ruleVersionId: 'rule-version-1',
        overallRiskCategory: 'NORMAL',
        conditions: [],
      });
      repository.create.mockResolvedValue({ id: 'assessment-1' } as never);

      await service.create(dto, caller({ roles: ['MANAGER'] }), AUTH_HEADER);

      expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
      expect(evaluateRuleSetMock).toHaveBeenCalled();
    });
  });

  it('returns the existing assessment unchanged on a replayed submissionId, without re-evaluating', async () => {
    const existing = { id: 'assessment-1' };
    repository.findBySubmissionId.mockResolvedValue(existing as never);

    await expect(service.create(dto, caller(), AUTH_HEADER)).resolves.toBe(existing);
    expect(evaluateRuleSetMock).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('evaluates, resolves grade lookups, and persists RiskAssessment + RiskFlag rows', async () => {
    repository.findBySubmissionId.mockResolvedValue(null);
    evaluateRuleSetMock.mockResolvedValue({
      ruleVersionId: 'rule-version-1',
      overallRiskCategory: 'HIGH',
      conditions: [
        {
          riskConditionId: 'cond-1',
          grade: 'HIGH',
          gradeRank: 3,
          isReferralTrigger: true,
          isEducationTrigger: false,
          isHrVisitTrigger: true,
          observedValueJson: { systolicBp: 145 },
        },
      ],
    });
    repository.create.mockResolvedValue({ id: 'assessment-1' } as never);

    await service.create(dto, caller(), AUTH_HEADER);

    expect(evaluateRuleSetMock).toHaveBeenCalledWith(
      dto.ruleSetId,
      {
        ...dto.answers,
        conditionIds: { ANEMIA: 'cond-1' },
        isFirstInstance: { ANEMIA: true },
        // dto.riskPhase is 'ANC' — findConsecutiveNoImprovementCount is only
        // read by infant-risk.rulesJson.ts's nutrition conditions (NN/INC/CCV
        // phases), so the query is skipped entirely for ANC and this comes
        // back empty rather than {ANEMIA: 0}.
        consecutiveNoImprovementCount: {},
      },
      AUTH_HEADER,
    );
    expect(resolveRiskGradeLookupIdMock).toHaveBeenCalledWith('HIGH', AUTH_HEADER);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        beneficiaryId: dto.beneficiaryId,
        visitId: dto.visitId,
        submissionId: dto.submissionId,
        ruleVersionId: 'rule-version-1',
        overallRiskCategory: 'HIGH',
        overallHighRiskFlag: true,
        hrDetectedFlag: true,
        flags: [
          expect.objectContaining({
            riskConditionId: 'cond-1',
            riskGradeLookupValueId: 'grade-lookup-id-1',
            gradeRank: 3,
            isReferralTrigger: true,
            isHrVisitTrigger: true,
          }),
        ],
      }),
    );
  });

  it('sets overallHighRiskFlag/hrDetectedFlag false for a NORMAL, non-triggering evaluation', async () => {
    repository.findBySubmissionId.mockResolvedValue(null);
    evaluateRuleSetMock.mockResolvedValue({
      ruleVersionId: 'rule-version-1',
      overallRiskCategory: 'NORMAL',
      conditions: [
        {
          riskConditionId: 'cond-1',
          grade: 'NORMAL',
          gradeRank: 0,
          isReferralTrigger: false,
          isEducationTrigger: false,
          isHrVisitTrigger: false,
          observedValueJson: null,
        },
      ],
    });
    repository.create.mockResolvedValue({ id: 'assessment-1' } as never);

    await service.create(dto, caller(), AUTH_HEADER);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ overallHighRiskFlag: false, hrDetectedFlag: false }),
    );
  });

  it('400s when the rule pack returns a grade not recognized by RISK_GRADE', async () => {
    repository.findBySubmissionId.mockResolvedValue(null);
    evaluateRuleSetMock.mockResolvedValue({
      ruleVersionId: 'rule-version-1',
      overallRiskCategory: 'HIGH',
      conditions: [
        {
          riskConditionId: 'cond-1',
          grade: 'SUPER_HIGH',
          gradeRank: 9,
          isReferralTrigger: false,
          isEducationTrigger: false,
          isHrVisitTrigger: false,
          observedValueJson: null,
        },
      ],
    });
    resolveRiskGradeLookupIdMock.mockResolvedValue(null);

    await expect(service.create(dto, caller(), AUTH_HEADER)).rejects.toMatchObject({
      status: 400,
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('pushes the rollup to beneficiary-service once per distinct condition, mapping RiskPhase to SummaryPhase', async () => {
    repository.findBySubmissionId.mockResolvedValue(null);
    repository.findPhasesByConditionIds.mockResolvedValue(new Map([['cond-1', 'INC']]));
    evaluateRuleSetMock.mockResolvedValue({
      ruleVersionId: 'rule-version-1',
      overallRiskCategory: 'HIGH',
      conditions: [
        {
          riskConditionId: 'cond-1',
          grade: 'HIGH',
          gradeRank: 3,
          isReferralTrigger: true,
          isEducationTrigger: false,
          isHrVisitTrigger: true,
          observedValueJson: { systolicBp: 145 },
        },
      ],
    });
    repository.create.mockResolvedValue({ id: 'assessment-1' } as never);

    await service.create(dto, caller(), AUTH_HEADER);

    expect(pushRiskConditionSummaryMock).toHaveBeenCalledWith(
      dto.beneficiaryId,
      expect.objectContaining({
        riskConditionId: 'cond-1',
        phase: 'INFANT_FOLLOWUP', // INC -> INFANT_FOLLOWUP mapping
        grade: 'HIGH',
        gradeRank: 3,
      }),
      AUTH_HEADER,
    );
  });

  it('does not fail the whole request when the beneficiary-service push fails — logs and continues', async () => {
    repository.findBySubmissionId.mockResolvedValue(null);
    evaluateRuleSetMock.mockResolvedValue({
      ruleVersionId: 'rule-version-1',
      overallRiskCategory: 'HIGH',
      conditions: [
        {
          riskConditionId: 'cond-1',
          grade: 'HIGH',
          gradeRank: 3,
          isReferralTrigger: true,
          isEducationTrigger: false,
          isHrVisitTrigger: true,
          observedValueJson: null,
        },
      ],
    });
    const assessment = { id: 'assessment-1' };
    repository.create.mockResolvedValue(assessment as never);
    pushRiskConditionSummaryMock.mockResolvedValue({ ok: false, error: 'network blip' });

    await expect(service.create(dto, caller(), AUTH_HEADER)).resolves.toBe(assessment);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('skips the push (and logs) for a condition with no resolvable phase', async () => {
    repository.findBySubmissionId.mockResolvedValue(null);
    repository.findPhasesByConditionIds.mockResolvedValue(new Map());
    evaluateRuleSetMock.mockResolvedValue({
      ruleVersionId: 'rule-version-1',
      overallRiskCategory: 'NORMAL',
      conditions: [
        {
          riskConditionId: 'cond-unknown',
          grade: 'NORMAL',
          gradeRank: 0,
          isReferralTrigger: false,
          isEducationTrigger: false,
          isHrVisitTrigger: false,
          observedValueJson: null,
        },
      ],
    });
    repository.create.mockResolvedValue({ id: 'assessment-1' } as never);

    await service.create(dto, caller(), AUTH_HEADER);

    expect(pushRiskConditionSummaryMock).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  describe('conditionIds / isFirstInstance / consecutiveNoImprovementCount resolution', () => {
    beforeEach(() => {
      repository.findBySubmissionId.mockResolvedValue(null);
      evaluateRuleSetMock.mockResolvedValue({
        ruleVersionId: 'rule-version-1',
        overallRiskCategory: 'NORMAL',
        conditions: [],
      });
      repository.create.mockResolvedValue({ id: 'assessment-1' } as never);
      repository.findConsecutiveNoImprovementCount.mockResolvedValue(new Map());
    });

    it('resolves conditionIds from every ACTIVE risk_conditions row in dto.riskPhase', async () => {
      repository.findConditionIdsByPhase.mockResolvedValue(
        new Map([
          ['ANEMIA', 'cond-anemia'],
          ['HYPERTENSION', 'cond-htn'],
        ]),
      );
      repository.findEverFlaggedConditionCodes.mockResolvedValue(new Set());

      await service.create(dto, caller(), AUTH_HEADER);

      expect(repository.findConditionIdsByPhase).toHaveBeenCalledWith('ANC');
      expect(evaluateRuleSetMock).toHaveBeenCalledWith(
        dto.ruleSetId,
        expect.objectContaining({
          conditionIds: { ANEMIA: 'cond-anemia', HYPERTENSION: 'cond-htn' },
        }),
        AUTH_HEADER,
      );
    });

    it('marks a condition as isFirstInstance: false when it was ever flagged before for this beneficiary', async () => {
      repository.findConditionIdsByPhase.mockResolvedValue(new Map([['AGE', 'cond-age']]));
      repository.findEverFlaggedConditionCodes.mockResolvedValue(new Set(['AGE']));

      await service.create(dto, caller(), AUTH_HEADER);

      expect(repository.findEverFlaggedConditionCodes).toHaveBeenCalledWith(dto.beneficiaryId);
      expect(evaluateRuleSetMock).toHaveBeenCalledWith(
        dto.ruleSetId,
        expect.objectContaining({ isFirstInstance: { AGE: false } }),
        AUTH_HEADER,
      );
    });

    it('resolves consecutiveNoImprovementCount for every condition in dto.riskPhase and merges it into the evaluation input', async () => {
      // findConsecutiveNoImprovementCount is only read for NN/INC/CCV phases
      // (infant-risk.rulesJson.ts's nutrition conditions) — override the
      // shared fixture's default 'ANC' so this test actually exercises that
      // path instead of the skip branch.
      const incDto = { ...dto, riskPhase: 'INC' as const };
      repository.findConditionIdsByPhase.mockResolvedValue(new Map([['WASTING', 'cond-wasting']]));
      repository.findEverFlaggedConditionCodes.mockResolvedValue(new Set());
      repository.findConsecutiveNoImprovementCount.mockResolvedValue(new Map([['WASTING', 3]]));

      await service.create(incDto, caller(), AUTH_HEADER);

      expect(repository.findConsecutiveNoImprovementCount).toHaveBeenCalledWith(dto.beneficiaryId, [
        'WASTING',
      ]);
      expect(evaluateRuleSetMock).toHaveBeenCalledWith(
        dto.ruleSetId,
        expect.objectContaining({ consecutiveNoImprovementCount: { WASTING: 3 } }),
        AUTH_HEADER,
      );
    });

    it('skips findConsecutiveNoImprovementCount entirely for a non-infant phase (ANC)', async () => {
      repository.findConditionIdsByPhase.mockResolvedValue(new Map([['ANEMIA', 'cond-anemia']]));
      repository.findEverFlaggedConditionCodes.mockResolvedValue(new Set());

      await service.create({ ...dto, riskPhase: 'ANC' }, caller(), AUTH_HEADER);

      expect(repository.findConsecutiveNoImprovementCount).not.toHaveBeenCalled();
    });

    it.each([['NN' as const], ['INC' as const], ['CCV' as const]])(
      'calls findConsecutiveNoImprovementCount for the %s phase',
      async (riskPhase) => {
        repository.findConditionIdsByPhase.mockResolvedValue(
          new Map([['WASTING', 'cond-wasting']]),
        );
        repository.findEverFlaggedConditionCodes.mockResolvedValue(new Set());

        await service.create({ ...dto, riskPhase }, caller(), AUTH_HEADER);

        expect(repository.findConsecutiveNoImprovementCount).toHaveBeenCalledWith(
          dto.beneficiaryId,
          ['WASTING'],
        );
      },
    );

    it('400s when no ACTIVE risk_conditions rows are seeded for dto.riskPhase', async () => {
      repository.findConditionIdsByPhase.mockResolvedValue(new Map());
      repository.findEverFlaggedConditionCodes.mockResolvedValue(new Set());

      await expect(service.create(dto, caller(), AUTH_HEADER)).rejects.toMatchObject({
        status: 400,
      });
      expect(evaluateRuleSetMock).not.toHaveBeenCalled();
    });
  });

  it('propagates rules-service evaluation failures (e.g. 422 no published version)', async () => {
    repository.findBySubmissionId.mockResolvedValue(null);
    const evalError = { status: 422, message: 'No published rule pack version found.' };
    evaluateRuleSetMock.mockRejectedValue(evalError);

    await expect(service.create(dto, caller(), AUTH_HEADER)).rejects.toBe(evalError);
    expect(repository.create).not.toHaveBeenCalled();
  });

  describe('listByVisitIds', () => {
    it('delegates to the repository with the given beneficiaryId and visitIds', async () => {
      const rows = [{ id: 'ra-1', visitId: 'visit-1' }];
      repository.findByVisitIds.mockResolvedValue(rows as never);

      const result = await service.listByVisitIds(
        BENEFICIARY_ID,
        ['visit-1', 'visit-2'],
        caller(),
        AUTH_HEADER,
      );

      expect(result).toEqual(rows);
      expect(repository.findByVisitIds).toHaveBeenCalledWith(BENEFICIARY_ID, [
        'visit-1',
        'visit-2',
      ]);
    });

    it('returns an empty array when no assessments match', async () => {
      repository.findByVisitIds.mockResolvedValue([]);

      const result = await service.listByVisitIds(
        BENEFICIARY_ID,
        ['visit-1'],
        caller(),
        AUTH_HEADER,
      );

      expect(result).toEqual([]);
    });

    it('404s when the beneficiary case does not exist', async () => {
      beneficiaryClient.getById.mockResolvedValue(null);

      await expect(
        service.listByVisitIds(BENEFICIARY_ID, ['visit-1'], caller(), AUTH_HEADER),
      ).rejects.toMatchObject({ status: 404 });
      expect(repository.findByVisitIds).not.toHaveBeenCalled();
    });

    it("403s a SAKHI caller reading another beneficiary's risk assessments (IDOR guard)", async () => {
      beneficiaryClient.getById.mockResolvedValue({
        id: BENEFICIARY_ID,
        sakhiId: 'some-other-sakhi',
      });

      await expect(
        service.listByVisitIds(
          BENEFICIARY_ID,
          ['visit-1'],
          caller({ roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.findByVisitIds).not.toHaveBeenCalled();
    });

    it('403s a SUPERVISOR caller whose roster does not include the beneficiary sakhi', async () => {
      beneficiaryClient.getById.mockResolvedValue({
        id: BENEFICIARY_ID,
        sakhiId: 'some-other-sakhi',
      });
      listSakhiIdsForSupervisorMock.mockResolvedValue(['a-different-sakhi']);

      await expect(
        service.listByVisitIds(
          BENEFICIARY_ID,
          ['visit-1'],
          caller({ roles: ['SUPERVISOR'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.findByVisitIds).not.toHaveBeenCalled();
    });

    it('allows a MANAGER/ADMIN caller unrestricted', async () => {
      beneficiaryClient.getById.mockResolvedValue({
        id: BENEFICIARY_ID,
        sakhiId: 'some-other-sakhi',
      });
      repository.findByVisitIds.mockResolvedValue([]);

      await expect(
        service.listByVisitIds(
          BENEFICIARY_ID,
          ['visit-1'],
          caller({ roles: ['ADMIN'] }),
          AUTH_HEADER,
        ),
      ).resolves.toEqual([]);
    });
  });
});
