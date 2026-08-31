import { randomBytes } from 'node:crypto';
import { badGateway, encryptPii, type AuthenticatedUser } from '@armman/service-commons';
import { BeneficiaryService } from './beneficiary.service';
import type { BeneficiaryRepository } from './beneficiary.repository';
import type { CreateBeneficiaryInput } from './dto/create-beneficiary.dto';
import {
  resolveHealthBlockIdFromPhc,
  resolvePadaUnits,
  resolveVillageNames,
} from '../geography/geography.client';
import { resolveLookupValues } from '../lookups/lookup.client';
import {
  getSakhiName,
  listSakhiIdsForSupervisor,
  listSakhiNamesForSupervisor,
} from '../sakhi/sakhi.client';
import { resolveProjectNames } from '../projects/project.client';
import { resolveRiskConditions } from '../risk-conditions/riskCondition.client';
import { resolveLatestVisitVitals } from '../visits/visitVitals.client';
import {
  isStillbirthOutcome,
  resolveDeliveryOutcomesBySlot,
} from '../visits/deliveryOutcomes.client';

jest.mock('../geography/geography.client');
jest.mock('../lookups/lookup.client');
jest.mock('../sakhi/sakhi.client');
jest.mock('../projects/project.client');
jest.mock('../risk-conditions/riskCondition.client');
jest.mock('../visits/visitVitals.client');
jest.mock('../visits/deliveryOutcomes.client');

describe('BeneficiaryService', () => {
  const originalEnv = { ...process.env };
  const repository = {
    findMany: jest.fn(),
    findById: jest.fn(),
    findOwnershipById: jest.fn(),
    findByLocalCaseUuid: jest.fn(),
    findDuplicateCandidate: jest.fn(),
    createEnrollment: jest.fn(),
    updateMotherLmp: jest.fn(),
    updatePhase: jest.fn(),
    closeCase: jest.fn(),
    reactivateCase: jest.fn(),
    markPendingTransfer: jest.fn(),
    countByCaseType: jest.fn(),
    countByRiskGrade: jest.fn(),
    findIds: jest.fn(),
    findIdsGroupedByPada: jest.fn(),
    findByIdsWithRisk: jest.fn(),
    upsertRiskConditionSummary: jest.fn(),
    findRiskConditionSummariesByBeneficiaryIds: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryRepository>;
  let service: BeneficiaryService;

  const CALLER_ID = '99999999-9999-9999-9999-999999999999';
  const AUTH_HEADER = 'Bearer test-token';
  const resolveHealthBlockIdFromPhcMock = jest.mocked(resolveHealthBlockIdFromPhc);
  const resolveLookupValuesMock = jest.mocked(resolveLookupValues);
  const listSakhiIdsForSupervisorMock = jest.mocked(listSakhiIdsForSupervisor);
  const listSakhiNamesForSupervisorMock = jest.mocked(listSakhiNamesForSupervisor);
  const getSakhiNameMock = jest.mocked(getSakhiName);
  const resolveVillageNamesMock = jest.mocked(resolveVillageNames);
  const resolvePadaUnitsMock = jest.mocked(resolvePadaUnits);
  const resolveProjectNamesMock = jest.mocked(resolveProjectNames);
  const resolveRiskConditionsMock = jest.mocked(resolveRiskConditions);
  const resolveLatestVisitVitalsMock = jest.mocked(resolveLatestVisitVitals);
  const resolveDeliveryOutcomesBySlotMock = jest.mocked(resolveDeliveryOutcomesBySlot);
  const isStillbirthOutcomeMock = jest.mocked(isStillbirthOutcome);

  function caller(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
    return {
      id: CALLER_ID,
      roles: ['SAKHI'],
      projectId: '11111111-1111-1111-1111-111111111111',
      geographyUnitId: null,
      ...overrides,
    };
  }

  // All SRS FR-S-2.1 required PII fields present (phone, dob, the 7 geography
  // levels, rchNumber). Geography ids are uuid-shaped to satisfy the type.
  const fullPii = {
    fullName: 'Jane Doe',
    phone: '9876543210',
    dateOfBirth: new Date('1995-05-05'),
    villageId: '66666666-6666-6666-6666-666666666666',
    padaId: '77777777-7777-7777-7777-777777777777',
    healthSubCentreId: '88888888-8888-8888-8888-888888888888',
    phcId: '99999999-9999-9999-9999-999999999999',
    healthBlockId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    stateId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    districtId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    rchNumber: 'RCH-0001',
  };

  const baseMotherInput: CreateBeneficiaryInput = {
    pii: { ...fullPii },
    case: {
      localCaseUuid: 'local-case-uuid-mother-1',
      projectId: '11111111-1111-1111-1111-111111111111',
      sakhiId: '33333333-3333-3333-3333-333333333333',
      caseType: 'MOTHER',
      registrationDate: new Date('2026-01-01'),
      beneficiaryTypeLookupId: '44444444-4444-4444-4444-444444444444',
      caseTypeLookupId: '55555555-5555-5555-5555-555555555555',
    },
    motherDetails: {
      lmpDate: new Date('2025-10-01'),
      gravida: 2,
      liveBirths: 1,
      stillbirths: 0,
      abortions: 1,
      heightCm: 160,
      weightKg: 60,
    },
    consent: { status: 'GIVEN', date: new Date('2026-01-01') },
  };

  const baseChildInput: CreateBeneficiaryInput = {
    pii: { ...fullPii, fullName: 'Baby Doe' },
    case: {
      localCaseUuid: 'local-case-uuid-child-1',
      projectId: '11111111-1111-1111-1111-111111111111',
      sakhiId: '33333333-3333-3333-3333-333333333333',
      caseType: 'CHILD',
      registrationDate: new Date('2026-01-01'),
      beneficiaryTypeLookupId: '44444444-4444-4444-4444-444444444444',
      caseTypeLookupId: '55555555-5555-5555-5555-555555555555',
    },
    childDetails: { dateOfBirth: new Date('2025-12-01') },
    consent: { status: 'GIVEN', date: new Date('2026-01-01') },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    process.env.PII_SEARCH_HASH_KEY = randomBytes(32).toString('base64');
    resolveHealthBlockIdFromPhcMock.mockResolvedValue('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    resolveLookupValuesMock.mockResolvedValue({});
    resolveProjectNamesMock.mockResolvedValue(new Map());
    resolveVillageNamesMock.mockResolvedValue(new Map());
    getSakhiNameMock.mockResolvedValue(null);
    listSakhiNamesForSupervisorMock.mockResolvedValue(new Map());
    resolveRiskConditionsMock.mockResolvedValue(new Map());
    resolveLatestVisitVitalsMock.mockResolvedValue(null);
    resolveDeliveryOutcomesBySlotMock.mockResolvedValue([]);
    // jest.mock auto-mocks the whole module, so this pure helper needs its
    // real logic restored too — beneficiary.service.ts calls it directly,
    // not just resolveDeliveryOutcomesBySlot.
    isStillbirthOutcomeMock.mockImplementation((outcome) =>
      ['antepartum_still_birth_fresh', 'intrapartum_still_birth_macerated'].includes(outcome),
    );
    service = new BeneficiaryService(repository);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('applyLmpChange', () => {
    const beneficiaryId = '22222222-2222-2222-2222-222222222222';
    const sakhiId = '55555555-5555-5555-5555-555555555555';

    function caseRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: beneficiaryId,
        sakhiId,
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        ...overrides,
      };
    }

    it('recomputes eddDate (lmpDate + 280 days) and persists via the repository', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      repository.updateMotherLmp.mockResolvedValue(true);

      await service.applyLmpChange(
        beneficiaryId,
        new Date('2026-06-15'),
        caller({ roles: ['ADMIN'] }),
        AUTH_HEADER,
      );

      expect(repository.updateMotherLmp).toHaveBeenCalledWith(
        beneficiaryId,
        new Date('2026-06-15'),
        new Date('2027-03-22'),
      );
    });

    it('returns the updated case via getById', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      repository.updateMotherLmp.mockResolvedValue(true);

      const result = await service.applyLmpChange(
        beneficiaryId,
        new Date('2026-06-15'),
        caller({ roles: ['ADMIN'] }),
        AUTH_HEADER,
      );
      expect(result).toMatchObject({ id: beneficiaryId });
    });

    it('404s on an unknown beneficiary id', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.applyLmpChange(
          beneficiaryId,
          new Date('2026-06-15'),
          caller({ roles: ['ADMIN'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(repository.updateMotherLmp).not.toHaveBeenCalled();
    });

    it('404s when no mother_case_details row exists for this beneficiary', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      repository.updateMotherLmp.mockResolvedValue(false);

      await expect(
        service.applyLmpChange(
          beneficiaryId,
          new Date('2026-06-15'),
          caller({ roles: ['ADMIN'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('403s when a SUPERVISOR targets a case outside their own roster', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      listSakhiIdsForSupervisorMock.mockResolvedValue(['some-other-sakhi']);

      await expect(
        service.applyLmpChange(
          beneficiaryId,
          new Date('2026-06-15'),
          caller({ roles: ['SUPERVISOR'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.updateMotherLmp).not.toHaveBeenCalled();
    });

    it('allows a SUPERVISOR to update a case in their own roster', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      repository.updateMotherLmp.mockResolvedValue(true);
      listSakhiIdsForSupervisorMock.mockResolvedValue([sakhiId]);

      await service.applyLmpChange(
        beneficiaryId,
        new Date('2026-06-15'),
        caller({ roles: ['SUPERVISOR'] }),
        AUTH_HEADER,
      );

      expect(repository.updateMotherLmp).toHaveBeenCalled();
    });
  });

  describe('applyPhaseChange', () => {
    const beneficiaryId = '22222222-2222-2222-2222-222222222222';
    const sakhiId = '55555555-5555-5555-5555-555555555555';
    const otherSakhiId = '66666666-6666-6666-6666-666666666666';

    function caseRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: beneficiaryId,
        sakhiId,
        caseType: 'MOTHER',
        currentPhase: 'ANC',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        ...overrides,
      };
    }

    it('advances a MOTHER case from ANC to PP', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      repository.updatePhase.mockResolvedValue(true);

      await service.applyPhaseChange(
        beneficiaryId,
        'PP',
        caller({ id: sakhiId, roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      expect(repository.updatePhase).toHaveBeenCalledWith(beneficiaryId, 'MOTHER', 'ANC', 'PP');
    });

    it('is a no-op when a CHILD case is already at NN (its creation default)', async () => {
      repository.findById.mockResolvedValue(
        caseRow({ caseType: 'CHILD', currentPhase: 'NN' }) as never,
      );

      const result = await service.applyPhaseChange(
        beneficiaryId,
        'NN',
        caller({ id: sakhiId, roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      expect(repository.updatePhase).not.toHaveBeenCalled();
      expect(result).toMatchObject({ id: beneficiaryId });
    });

    it('409s a CHILD case transition to NN from any phase other than NN — regression: the CHILD branch must validate fromPhase, not just toPhase', async () => {
      repository.findById.mockResolvedValue(
        caseRow({ caseType: 'CHILD', currentPhase: 'INC' }) as never,
      );

      await expect(
        service.applyPhaseChange(
          beneficiaryId,
          'NN',
          caller({ id: sakhiId, roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(repository.updatePhase).not.toHaveBeenCalled();
    });

    it('advances a CHILD case from NN to INC', async () => {
      repository.findById.mockResolvedValue(
        caseRow({ caseType: 'CHILD', currentPhase: 'NN' }) as never,
      );
      repository.updatePhase.mockResolvedValue(true);

      await service.applyPhaseChange(
        beneficiaryId,
        'INC',
        caller({ id: sakhiId, roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      expect(repository.updatePhase).toHaveBeenCalledWith(beneficiaryId, 'CHILD', 'NN', 'INC');
    });

    it('advances a CHILD case from INC to CCV', async () => {
      repository.findById.mockResolvedValue(
        caseRow({ caseType: 'CHILD', currentPhase: 'INC' }) as never,
      );
      repository.updatePhase.mockResolvedValue(true);

      await service.applyPhaseChange(
        beneficiaryId,
        'CCV',
        caller({ id: sakhiId, roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      expect(repository.updatePhase).toHaveBeenCalledWith(beneficiaryId, 'CHILD', 'INC', 'CCV');
    });

    it('409s a CHILD case skipping INC (NN directly to CCV)', async () => {
      repository.findById.mockResolvedValue(
        caseRow({ caseType: 'CHILD', currentPhase: 'NN' }) as never,
      );

      await expect(
        service.applyPhaseChange(
          beneficiaryId,
          'CCV',
          caller({ id: sakhiId, roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(repository.updatePhase).not.toHaveBeenCalled();
    });

    it('409s a regressive CHILD transition (CCV back to INC)', async () => {
      repository.findById.mockResolvedValue(
        caseRow({ caseType: 'CHILD', currentPhase: 'CCV' }) as never,
      );

      await expect(
        service.applyPhaseChange(
          beneficiaryId,
          'INC',
          caller({ id: sakhiId, roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(repository.updatePhase).not.toHaveBeenCalled();
    });

    it('returns the updated case via getById', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      repository.updatePhase.mockResolvedValue(true);

      const result = await service.applyPhaseChange(
        beneficiaryId,
        'PP',
        caller({ id: sakhiId, roles: ['SAKHI'] }),
        AUTH_HEADER,
      );
      expect(result).toMatchObject({ id: beneficiaryId });
    });

    it('404s on an unknown beneficiary id', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.applyPhaseChange(
          beneficiaryId,
          'PP',
          caller({ id: sakhiId, roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(repository.updatePhase).not.toHaveBeenCalled();
    });

    it('409s on a regressive transition (PP back to ANC)', async () => {
      repository.findById.mockResolvedValue(caseRow({ currentPhase: 'PP' }) as never);

      await expect(
        service.applyPhaseChange(
          beneficiaryId,
          'ANC',
          caller({ id: sakhiId, roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(repository.updatePhase).not.toHaveBeenCalled();
    });

    it('409s on an unsupported forward jump (MOTHER case ANC -> NN)', async () => {
      repository.findById.mockResolvedValue(caseRow({ currentPhase: 'ANC' }) as never);

      await expect(
        service.applyPhaseChange(
          beneficiaryId,
          'NN',
          caller({ id: sakhiId, roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(repository.updatePhase).not.toHaveBeenCalled();
    });

    it('is idempotent when the case is already at the target phase', async () => {
      repository.findById.mockResolvedValue(caseRow({ currentPhase: 'PP' }) as never);

      const result = await service.applyPhaseChange(
        beneficiaryId,
        'PP',
        caller({ id: sakhiId, roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      expect(repository.updatePhase).not.toHaveBeenCalled();
      expect(result).toMatchObject({ id: beneficiaryId });
    });

    it('403s when a SAKHI targets a case outside their own roster', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);

      await expect(
        service.applyPhaseChange(
          beneficiaryId,
          'PP',
          caller({ id: otherSakhiId, roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.updatePhase).not.toHaveBeenCalled();
    });

    it('allows a SAKHI to advance their own case', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      repository.updatePhase.mockResolvedValue(true);

      await service.applyPhaseChange(
        beneficiaryId,
        'PP',
        caller({ id: sakhiId, roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      expect(repository.updatePhase).toHaveBeenCalled();
    });

    it('409s when the conditional update races with a concurrent phase change', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      repository.updatePhase.mockResolvedValue(false);

      await expect(
        service.applyPhaseChange(
          beneficiaryId,
          'PP',
          caller({ id: sakhiId, roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('409s a case in PENDING_TRANSFER — markPendingTransfer leaves sakhiId unchanged, so ownership alone must not let a phase change through while Manager review is pending', async () => {
      repository.findById.mockResolvedValue(
        caseRow({ currentStatus: 'PENDING_TRANSFER' }) as never,
      );

      await expect(
        service.applyPhaseChange(
          beneficiaryId,
          'PP',
          caller({ id: sakhiId, roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(repository.updatePhase).not.toHaveBeenCalled();
    });

    it('still allows an ACTIVE case to advance phase (regression for the PENDING_TRANSFER guard)', async () => {
      repository.findById.mockResolvedValue(caseRow({ currentStatus: 'ACTIVE' }) as never);
      repository.updatePhase.mockResolvedValue(true);

      await service.applyPhaseChange(
        beneficiaryId,
        'PP',
        caller({ id: sakhiId, roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      expect(repository.updatePhase).toHaveBeenCalledWith(beneficiaryId, 'MOTHER', 'ANC', 'PP');
    });
  });

  describe('applyClosure', () => {
    const beneficiaryId = '22222222-2222-2222-2222-222222222222';
    const sakhiId = '55555555-5555-5555-5555-555555555555';
    const otherSakhiId = '66666666-6666-6666-6666-666666666666';

    function caseRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: beneficiaryId,
        sakhiId,
        caseType: 'MOTHER',
        currentStatus: 'ACTIVE',
        statusHistory: [],
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        ...overrides,
      };
    }

    it('closes an ACTIVE case', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      repository.closeCase.mockResolvedValue(true);

      await service.applyClosure(
        beneficiaryId,
        'MEDICAL',
        caller({ id: sakhiId, roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      expect(repository.closeCase).toHaveBeenCalledWith(beneficiaryId, sakhiId, 'MEDICAL');
    });

    it('returns the closed case via getById', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      repository.closeCase.mockResolvedValue(true);

      const result = await service.applyClosure(
        beneficiaryId,
        'MEDICAL',
        caller({ id: sakhiId, roles: ['SAKHI'] }),
        AUTH_HEADER,
      );
      expect(result).toMatchObject({ id: beneficiaryId });
    });

    it('404s on an unknown beneficiary id', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.applyClosure(
          beneficiaryId,
          'MEDICAL',
          caller({ id: sakhiId, roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(repository.closeCase).not.toHaveBeenCalled();
    });

    it('is idempotent when the case is already CLOSED with the same reasonCode — no repository write, no error', async () => {
      repository.findById.mockResolvedValue(
        caseRow({
          currentStatus: 'CLOSED',
          statusHistory: [{ toStatus: 'CLOSED', reasonCode: 'MEDICAL' }],
        }) as never,
      );

      const result = await service.applyClosure(
        beneficiaryId,
        'MEDICAL',
        caller({ id: sakhiId, roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      expect(repository.closeCase).not.toHaveBeenCalled();
      expect(result).toMatchObject({ id: beneficiaryId });
    });

    it('is idempotent when already CLOSED with no statusHistory row recorded (pre-existing data)', async () => {
      repository.findById.mockResolvedValue(
        caseRow({ currentStatus: 'CLOSED', statusHistory: [] }) as never,
      );

      const result = await service.applyClosure(
        beneficiaryId,
        'MEDICAL',
        caller({ id: sakhiId, roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      expect(repository.closeCase).not.toHaveBeenCalled();
      expect(result).toMatchObject({ id: beneficiaryId });
    });

    it('409s when already CLOSED with a genuinely different reasonCode — regression: must not silently drop the discrepancy', async () => {
      repository.findById.mockResolvedValue(
        caseRow({
          currentStatus: 'CLOSED',
          statusHistory: [{ toStatus: 'CLOSED', reasonCode: 'MEDICAL' }],
        }) as never,
      );

      await expect(
        service.applyClosure(
          beneficiaryId,
          'MIGRATION',
          caller({ id: sakhiId, roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(repository.closeCase).not.toHaveBeenCalled();
    });

    it('403s when a SAKHI targets a case outside their own roster', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);

      await expect(
        service.applyClosure(
          beneficiaryId,
          'MEDICAL',
          caller({ id: otherSakhiId, roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.closeCase).not.toHaveBeenCalled();
    });

    it('allows a SAKHI to close their own case', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      repository.closeCase.mockResolvedValue(true);

      await service.applyClosure(
        beneficiaryId,
        'MEDICAL',
        caller({ id: sakhiId, roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      expect(repository.closeCase).toHaveBeenCalled();
    });

    it('403s when a SUPERVISOR targets a case outside their own roster', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      listSakhiIdsForSupervisorMock.mockResolvedValue(['some-other-sakhi']);

      await expect(
        service.applyClosure(
          beneficiaryId,
          'MIGRATION',
          caller({ roles: ['SUPERVISOR'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.closeCase).not.toHaveBeenCalled();
    });

    it('allows a SUPERVISOR to close a case in their own roster', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      repository.closeCase.mockResolvedValue(true);
      listSakhiIdsForSupervisorMock.mockResolvedValue([sakhiId]);

      await service.applyClosure(
        beneficiaryId,
        'MIGRATION',
        caller({ roles: ['SUPERVISOR'] }),
        AUTH_HEADER,
      );

      expect(repository.closeCase).toHaveBeenCalled();
    });

    it('allows a MANAGER/ADMIN unrestricted', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      repository.closeCase.mockResolvedValue(true);

      await service.applyClosure(
        beneficiaryId,
        'MIGRATION',
        caller({ roles: ['ADMIN'] }),
        AUTH_HEADER,
      );

      expect(repository.closeCase).toHaveBeenCalled();
    });

    it('re-reads and returns success when closeCase races and the case is already CLOSED', async () => {
      repository.findById
        .mockResolvedValueOnce(caseRow() as never)
        .mockResolvedValueOnce(caseRow({ currentStatus: 'CLOSED' }) as never);
      repository.closeCase.mockResolvedValue(false);

      const result = await service.applyClosure(
        beneficiaryId,
        'MEDICAL',
        caller({ id: sakhiId, roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      expect(result).toMatchObject({ id: beneficiaryId });
    });

    it('409s when closeCase races to a genuinely different reasonCode than the race winner', async () => {
      repository.findById.mockResolvedValueOnce(caseRow() as never).mockResolvedValueOnce(
        caseRow({
          currentStatus: 'CLOSED',
          statusHistory: [{ toStatus: 'CLOSED', reasonCode: 'MIGRATION' }],
        }) as never,
      );
      repository.closeCase.mockResolvedValue(false);

      await expect(
        service.applyClosure(
          beneficiaryId,
          'MEDICAL',
          caller({ id: sakhiId, roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('409s when closeCase fails and the case is still not CLOSED on re-read', async () => {
      repository.findById
        .mockResolvedValueOnce(caseRow() as never)
        .mockResolvedValueOnce(caseRow({ currentStatus: 'ACTIVE' }) as never);
      repository.closeCase.mockResolvedValue(false);

      await expect(
        service.applyClosure(
          beneficiaryId,
          'MEDICAL',
          caller({ id: sakhiId, roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('404s when closeCase fails because the case was deleted mid-request', async () => {
      repository.findById.mockResolvedValueOnce(caseRow() as never).mockResolvedValueOnce(null);
      repository.closeCase.mockResolvedValue(false);

      await expect(
        service.applyClosure(
          beneficiaryId,
          'MEDICAL',
          caller({ id: sakhiId, roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('409s a case in PENDING_TRANSFER — markPendingTransfer leaves sakhiId unchanged, so the owning Sakhi must not be able to close the case out from under a pending Manager review', async () => {
      repository.findById.mockResolvedValue(
        caseRow({ currentStatus: 'PENDING_TRANSFER' }) as never,
      );

      await expect(
        service.applyClosure(
          beneficiaryId,
          'MEDICAL',
          caller({ id: sakhiId, roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(repository.closeCase).not.toHaveBeenCalled();
    });

    it('still allows an ACTIVE case to close (regression for the PENDING_TRANSFER guard)', async () => {
      repository.findById.mockResolvedValue(caseRow({ currentStatus: 'ACTIVE' }) as never);
      repository.closeCase.mockResolvedValue(true);

      await service.applyClosure(
        beneficiaryId,
        'MEDICAL',
        caller({ id: sakhiId, roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      expect(repository.closeCase).toHaveBeenCalledWith(beneficiaryId, sakhiId, 'MEDICAL');
    });

    it('still treats an already-CLOSED case as an idempotent no-op (regression for the PENDING_TRANSFER guard)', async () => {
      repository.findById.mockResolvedValue(
        caseRow({
          currentStatus: 'CLOSED',
          statusHistory: [{ toStatus: 'CLOSED', reasonCode: 'MEDICAL' }],
        }) as never,
      );

      const result = await service.applyClosure(
        beneficiaryId,
        'MEDICAL',
        caller({ id: sakhiId, roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      expect(repository.closeCase).not.toHaveBeenCalled();
      expect(result).toMatchObject({ id: beneficiaryId });
    });
  });

  describe('reactivateCase', () => {
    const beneficiaryId = '22222222-2222-2222-2222-222222222222';
    const supervisorId = '44444444-4444-4444-4444-444444444444';
    const sakhiId = '55555555-5555-5555-5555-555555555555';

    function caseRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: beneficiaryId,
        sakhiId,
        currentStatus: 'CLOSED',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        ...overrides,
      };
    }

    it('reactivates a CLOSED case and returns it via getById', async () => {
      repository.findById
        .mockResolvedValueOnce(caseRow() as never)
        .mockResolvedValueOnce(caseRow() as never);
      repository.reactivateCase.mockResolvedValue(true);

      const result = await service.reactivateCase(
        beneficiaryId,
        supervisorId,
        caller({ roles: ['ADMIN'] }),
        AUTH_HEADER,
      );

      expect(repository.reactivateCase).toHaveBeenCalledWith(beneficiaryId, supervisorId);
      expect(result).toMatchObject({ id: beneficiaryId });
    });

    it('404s on an unknown beneficiary id', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.reactivateCase(
          beneficiaryId,
          supervisorId,
          caller({ roles: ['ADMIN'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(repository.reactivateCase).not.toHaveBeenCalled();
    });

    it('409s when the case is not currently CLOSED', async () => {
      repository.findById.mockResolvedValue(caseRow({ currentStatus: 'ACTIVE' }) as never);

      await expect(
        service.reactivateCase(
          beneficiaryId,
          supervisorId,
          caller({ roles: ['ADMIN'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(repository.reactivateCase).not.toHaveBeenCalled();
    });

    it('409s when the conditional update races with a concurrent status change', async () => {
      repository.findById.mockResolvedValueOnce(caseRow() as never);
      repository.reactivateCase.mockResolvedValue(false);

      await expect(
        service.reactivateCase(
          beneficiaryId,
          supervisorId,
          caller({ roles: ['ADMIN'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('403s when a SUPERVISOR targets a case outside their own roster', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      listSakhiIdsForSupervisorMock.mockResolvedValue(['some-other-sakhi']);

      await expect(
        service.reactivateCase(
          beneficiaryId,
          supervisorId,
          caller({ id: supervisorId, roles: ['SUPERVISOR'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.reactivateCase).not.toHaveBeenCalled();
    });

    it('allows a SUPERVISOR to reactivate a case in their own roster', async () => {
      repository.findById
        .mockResolvedValueOnce(caseRow() as never)
        .mockResolvedValueOnce(caseRow() as never);
      repository.reactivateCase.mockResolvedValue(true);
      listSakhiIdsForSupervisorMock.mockResolvedValue([sakhiId]);

      await service.reactivateCase(
        beneficiaryId,
        supervisorId,
        caller({ id: supervisorId, roles: ['SUPERVISOR'] }),
        AUTH_HEADER,
      );

      expect(repository.reactivateCase).toHaveBeenCalledWith(beneficiaryId, supervisorId);
    });
  });

  describe('applyTransfer', () => {
    const beneficiaryId = '22222222-2222-2222-2222-222222222222';
    const supervisorId = '44444444-4444-4444-4444-444444444444';
    const sakhiId = '55555555-5555-5555-5555-555555555555';

    function caseRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: beneficiaryId,
        sakhiId,
        currentStatus: 'ACTIVE',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        ...overrides,
      };
    }

    it('moves an ACTIVE case to PENDING_TRANSFER and returns it via getById', async () => {
      repository.findById
        .mockResolvedValueOnce(caseRow() as never)
        .mockResolvedValueOnce(caseRow({ currentStatus: 'PENDING_TRANSFER' }) as never);
      repository.markPendingTransfer.mockResolvedValue(true);

      const result = await service.applyTransfer(
        beneficiaryId,
        caller({ roles: ['ADMIN'] }),
        AUTH_HEADER,
      );

      expect(repository.markPendingTransfer).toHaveBeenCalledWith(beneficiaryId, CALLER_ID);
      expect(result).toMatchObject({ id: beneficiaryId });
    });

    it('404s on an unknown beneficiary id', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.applyTransfer(beneficiaryId, caller({ roles: ['ADMIN'] }), AUTH_HEADER),
      ).rejects.toMatchObject({ status: 404 });
      expect(repository.markPendingTransfer).not.toHaveBeenCalled();
    });

    it('409s when the case is CLOSED', async () => {
      repository.findById.mockResolvedValue(caseRow({ currentStatus: 'CLOSED' }) as never);

      await expect(
        service.applyTransfer(beneficiaryId, caller({ roles: ['ADMIN'] }), AUTH_HEADER),
      ).rejects.toMatchObject({ status: 409 });
      expect(repository.markPendingTransfer).not.toHaveBeenCalled();
    });

    it('409s when the conditional update races with a concurrent status change', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      repository.markPendingTransfer.mockResolvedValue(false);

      await expect(
        service.applyTransfer(beneficiaryId, caller({ roles: ['ADMIN'] }), AUTH_HEADER),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('403s when a SUPERVISOR targets a case outside their own roster', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      listSakhiIdsForSupervisorMock.mockResolvedValue(['some-other-sakhi']);

      await expect(
        service.applyTransfer(
          beneficiaryId,
          caller({ id: supervisorId, roles: ['SUPERVISOR'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.markPendingTransfer).not.toHaveBeenCalled();
    });

    it('allows a SUPERVISOR to transfer a case in their own roster', async () => {
      repository.findById
        .mockResolvedValueOnce(caseRow() as never)
        .mockResolvedValueOnce(caseRow({ currentStatus: 'PENDING_TRANSFER' }) as never);
      repository.markPendingTransfer.mockResolvedValue(true);
      listSakhiIdsForSupervisorMock.mockResolvedValue([sakhiId]);

      await service.applyTransfer(
        beneficiaryId,
        caller({ id: supervisorId, roles: ['SUPERVISOR'] }),
        AUTH_HEADER,
      );

      expect(repository.markPendingTransfer).toHaveBeenCalledWith(beneficiaryId, supervisorId);
    });
  });

  describe('list / getById', () => {
    it('lists beneficiaries via the repository, with names decrypted for display', async () => {
      repository.findMany.mockResolvedValue({
        items: [{ id: 'x', pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') } }] as never,
        nextCursor: null,
      });

      const result = await service.list({ limit: 50 }, caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result).toEqual({
        items: [
          expect.objectContaining({
            id: 'x',
            pii: expect.objectContaining({ fullName: 'Jane Doe' }),
          }),
        ],
        nextCursor: null,
      });
    });

    it('passes query filters through to the repository as search hashes/scalars', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list(
        {
          projectId: 'project-1',
          status: 'ACTIVE',
          caseType: 'MOTHER',
          atRiskOnly: true,
          name: 'Jane Doe',
          mobileNumber: '9876543210',
          fromDate: '2026-01-01',
          toDate: '2026-01-31',
          limit: 50,
        },
        caller({ roles: ['ADMIN'] }),
        AUTH_HEADER,
      );

      const call = repository.findMany.mock.calls[0][0];
      expect(call.projectId).toBe('project-1');
      expect(call.currentStatus).toBe('ACTIVE');
      expect(call.caseType).toBe('MOTHER');
      expect(call.atRiskOnly).toBe(true);
      expect(call.nameHash).toBeInstanceOf(Buffer);
      expect(call.phoneHash).toBeInstanceOf(Buffer);
      expect(call.fromDate).toBe('2026-01-01');
      expect(call.toDate).toBe('2026-01-31');
      expect(call.limit).toBe(50);
    });

    it('SAKHI caller is forced to see only their own cases, regardless of query params', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list(
        { projectId: 'some-other-project', limit: 50 },
        caller({ id: 'sakhi-1', roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      const call = repository.findMany.mock.calls[0][0];
      expect(call.sakhiId).toBe('sakhi-1');
      expect(call.sakhiIds).toBeUndefined();
      expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
    });

    it('SAKHI-supplied sakhiId is ignored — own id always wins', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list(
        { sakhiId: 'someone-else', limit: 50 },
        caller({ id: 'sakhi-1', roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      const call = repository.findMany.mock.calls[0][0];
      expect(call.sakhiId).toBe('sakhi-1');
    });

    it('never calls getSakhiName for a SAKHI caller — every row is already their own case', async () => {
      // Regression test: GET /sakhis/:sakhiId (which getSakhiName calls) is
      // SUPERVISOR/MANAGER/ADMIN-only in auth-service — a SAKHI's own token
      // gets 403'd there, which getSakhiName turns into a 502. Every row a
      // SAKHI sees is already forced to their own sakhiId, so there is
      // nothing to look up.
      repository.findMany.mockResolvedValue({
        items: [
          {
            id: 'x',
            sakhiId: 'sakhi-1',
            projectId: 'project-1',
            pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe'), villageId: null },
          },
        ] as never,
        nextCursor: null,
      });

      const result = await service.list(
        { limit: 50 },
        caller({ id: 'sakhi-1', roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      expect(getSakhiNameMock).not.toHaveBeenCalled();
      expect(result.items[0]).toMatchObject({ sakhiName: null });
    });

    it('SUPERVISOR caller sees only their own Sakhis, resolved via the Sakhi lookup', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);

      await service.list(
        { limit: 50 },
        caller({ id: 'sup-1', roles: ['SUPERVISOR'], projectId: 'project-1' }),
        AUTH_HEADER,
      );

      expect(listSakhiIdsForSupervisorMock).toHaveBeenCalledWith('project-1', 'sup-1', AUTH_HEADER);
      const call = repository.findMany.mock.calls[0][0];
      expect(call.sakhiIds).toEqual(['sakhi-a', 'sakhi-b']);
      expect(call.sakhiId).toBeUndefined();
    });

    it('SUPERVISOR narrowing to a sakhiId within their roster scopes to that one Sakhi', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);

      await service.list(
        { sakhiId: 'sakhi-b', limit: 50 },
        caller({ id: 'sup-1', roles: ['SUPERVISOR'], projectId: 'project-1' }),
        AUTH_HEADER,
      );

      const call = repository.findMany.mock.calls[0][0];
      expect(call.sakhiId).toBe('sakhi-b');
      expect(call.sakhiIds).toBeUndefined();
    });

    it('rejects a SUPERVISOR narrowing to a sakhiId outside their roster', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);

      await expect(
        service.list(
          { sakhiId: 'not-mine', limit: 50 },
          caller({ id: 'sup-1', roles: ['SUPERVISOR'], projectId: 'project-1' }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.findMany).not.toHaveBeenCalled();
    });

    it('SUPERVISOR with zero Sakhis gets an empty result, not all beneficiaries', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue([]);
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      const result = await service.list(
        { limit: 50 },
        caller({ id: 'sup-1', roles: ['SUPERVISOR'] }),
        AUTH_HEADER,
      );

      expect(result).toEqual({ items: [], nextCursor: null });
      const call = repository.findMany.mock.calls[0][0];
      expect(call.sakhiIds).toEqual([]);
    });

    it('rejects a SUPERVISOR caller with no projectId instead of resolving Sakhis with an empty path', async () => {
      await expect(
        service.list(
          { limit: 50 },
          caller({ id: 'sup-1', roles: ['SUPERVISOR'], projectId: null }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
      expect(repository.findMany).not.toHaveBeenCalled();
    });

    it('MANAGER caller sees all beneficiaries — no sakhi scoping applied', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list({ limit: 50 }, caller({ roles: ['MANAGER'] }), AUTH_HEADER);

      const call = repository.findMany.mock.calls[0][0];
      expect(call.sakhiId).toBeUndefined();
      expect(call.sakhiIds).toBeUndefined();
      expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
    });

    it('MANAGER caller may still narrow by sakhiId, with no roster to validate against', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list(
        { sakhiId: 'any-sakhi', limit: 50 },
        caller({ roles: ['MANAGER'] }),
        AUTH_HEADER,
      );

      const call = repository.findMany.mock.calls[0][0];
      expect(call.sakhiId).toBe('any-sakhi');
      expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
    });

    it('ADMIN caller sees all beneficiaries — no sakhi scoping applied', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list({ limit: 50 }, caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      const call = repository.findMany.mock.calls[0][0];
      expect(call.sakhiId).toBeUndefined();
      expect(call.sakhiIds).toBeUndefined();
    });

    it("propagates an auth-service failure while resolving a Supervisor's Sakhis", async () => {
      listSakhiIdsForSupervisorMock.mockRejectedValue(
        Object.assign(new Error('bad gateway'), { status: 502 }),
      );

      await expect(
        service.list({ limit: 50 }, caller({ roles: ['SUPERVISOR'] }), AUTH_HEADER),
      ).rejects.toMatchObject({ status: 502 });
      expect(repository.findMany).not.toHaveBeenCalled();
    });

    it('enriches rows with sakhiName/projectName/villageName, resolved server-side', async () => {
      repository.findMany.mockResolvedValue({
        items: [
          {
            id: 'x',
            sakhiId: 'sakhi-a',
            projectId: 'project-1',
            pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe'), villageId: 'village-1' },
          },
        ] as never,
        nextCursor: null,
      });
      resolveProjectNamesMock.mockResolvedValue(new Map([['project-1', 'GEP 2026-27']]));
      resolveVillageNamesMock.mockResolvedValue(new Map([['village-1', 'Sample Village']]));
      getSakhiNameMock.mockResolvedValue('Priya Sharma');

      const result = await service.list({ limit: 50 }, caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result.items[0]).toMatchObject({
        sakhiName: 'Priya Sharma',
        projectName: 'GEP 2026-27',
        villageName: 'Sample Village',
      });
    });

    it('resolves sakhiName from the roster call already made for SUPERVISOR scoping — no extra per-id call', async () => {
      repository.findMany.mockResolvedValue({
        items: [
          {
            id: 'x',
            sakhiId: 'sakhi-a',
            projectId: 'project-1',
            pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe'), villageId: null },
          },
        ] as never,
        nextCursor: null,
      });
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a']);
      listSakhiNamesForSupervisorMock.mockResolvedValue(new Map([['sakhi-a', 'Priya Sharma']]));

      const result = await service.list(
        { limit: 50 },
        caller({ roles: ['SUPERVISOR'], projectId: 'project-1' }),
        AUTH_HEADER,
      );

      expect(result.items[0]).toMatchObject({ sakhiName: 'Priya Sharma' });
      expect(getSakhiNameMock).not.toHaveBeenCalled();
    });

    it('falls back to a per-id Sakhi lookup for a MANAGER/ADMIN page (no roster call made)', async () => {
      repository.findMany.mockResolvedValue({
        items: [
          {
            id: 'x',
            sakhiId: 'sakhi-a',
            projectId: 'project-1',
            pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe'), villageId: null },
          },
        ] as never,
        nextCursor: null,
      });
      getSakhiNameMock.mockResolvedValue('Priya Sharma');

      const result = await service.list({ limit: 50 }, caller({ roles: ['MANAGER'] }), AUTH_HEADER);

      expect(result.items[0]).toMatchObject({ sakhiName: 'Priya Sharma' });
      expect(getSakhiNameMock).toHaveBeenCalledWith('sakhi-a', AUTH_HEADER);
    });

    it('resolves a stale/deleted Sakhi, project, or village to null names, not a failed request', async () => {
      repository.findMany.mockResolvedValue({
        items: [
          {
            id: 'x',
            sakhiId: 'deleted-sakhi',
            projectId: 'deleted-project',
            pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe'), villageId: 'deleted-village' },
          },
        ] as never,
        nextCursor: null,
      });
      // Defaults from beforeEach already resolve nothing (empty maps, null Sakhi name).

      const result = await service.list({ limit: 50 }, caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result.items[0]).toMatchObject({
        sakhiName: null,
        projectName: null,
        villageName: null,
      });
    });

    it('a case with no villageId on file gets a null villageName without calling anything extra', async () => {
      repository.findMany.mockResolvedValue({
        items: [
          {
            id: 'x',
            sakhiId: 'sakhi-a',
            projectId: 'project-1',
            pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe'), villageId: null },
          },
        ] as never,
        nextCursor: null,
      });

      const result = await service.list({ limit: 50 }, caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result.items[0]).toMatchObject({ villageName: null });
    });

    it('an empty page skips every name-resolution call entirely', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list({ limit: 50 }, caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(resolveProjectNamesMock).not.toHaveBeenCalled();
      expect(resolveVillageNamesMock).not.toHaveBeenCalled();
      expect(getSakhiNameMock).not.toHaveBeenCalled();
    });

    it('dedupes repeated sakhiIds on a page into a single lookup per id', async () => {
      repository.findMany.mockResolvedValue({
        items: [
          {
            id: 'x',
            sakhiId: 'sakhi-a',
            projectId: 'project-1',
            pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe'), villageId: null },
          },
          {
            id: 'y',
            sakhiId: 'sakhi-a',
            projectId: 'project-1',
            pii: { id: 'pii-2', fullNameEnc: encryptPii('John Doe'), villageId: null },
          },
        ] as never,
        nextCursor: null,
      });
      getSakhiNameMock.mockResolvedValue('Priya Sharma');

      await service.list({ limit: 50 }, caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(getSakhiNameMock).toHaveBeenCalledTimes(1);
    });

    it('propagates a genuine auth-service dependency failure while enriching names', async () => {
      repository.findMany.mockResolvedValue({
        items: [
          {
            id: 'x',
            sakhiId: 'sakhi-a',
            projectId: 'project-1',
            pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe'), villageId: null },
          },
        ] as never,
        nextCursor: null,
      });
      resolveProjectNamesMock.mockRejectedValue(
        Object.assign(new Error('bad gateway'), { status: 502 }),
      );

      await expect(
        service.list({ limit: 50 }, caller({ roles: ['ADMIN'] }), AUTH_HEADER),
      ).rejects.toMatchObject({ status: 502 });
    });

    it('passes through risk condition summaries and status history from the repository', async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        riskConditionSummaries: [{ riskConditionId: 'risk-1', everAtRiskFlag: true }],
        statusHistory: [{ toStatus: 'ACTIVE', changedAt: new Date('2026-01-01') }],
      };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result.riskConditionSummaries).toEqual([
        expect.objectContaining({ riskConditionId: 'risk-1', everAtRiskFlag: true }),
      ]);
      expect(result.statusHistory).toEqual(found.statusHistory);
    });

    it('returns a found case with the name decrypted for display', async () => {
      const found = { id: 'x', pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') } };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result).toEqual(
        expect.objectContaining({
          id: 'x',
          pii: expect.objectContaining({ fullName: 'Jane Doe' }),
        }),
      );
    });

    it('throws 404 when the case is not found', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(
        service.getById('missing', caller({ roles: ['ADMIN'] }), AUTH_HEADER),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('403s when a SAKHI requests a beneficiary that is not their own', async () => {
      const found = {
        id: 'x',
        sakhiId: 'someone-elses-sakhi-id',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
      };
      repository.findById.mockResolvedValue(found as never);

      await expect(
        service.getById('x', caller({ roles: ['SAKHI'], id: CALLER_ID }), AUTH_HEADER),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('allows a SAKHI to fetch their own beneficiary', async () => {
      const found = {
        id: 'x',
        sakhiId: CALLER_ID,
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
      };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById(
        'x',
        caller({ roles: ['SAKHI'], id: CALLER_ID }),
        AUTH_HEADER,
      );

      expect(result.id).toBe('x');
    });

    it("403s when a SUPERVISOR's roster does not include the beneficiary's Sakhi", async () => {
      const found = {
        id: 'x',
        sakhiId: 'not-in-roster',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
      };
      repository.findById.mockResolvedValue(found as never);
      listSakhiIdsForSupervisorMock.mockResolvedValue(['some-other-sakhi']);

      await expect(
        service.getById('x', caller({ roles: ['SUPERVISOR'] }), AUTH_HEADER),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('allows a SUPERVISOR to fetch a beneficiary in their own roster', async () => {
      const found = {
        id: 'x',
        sakhiId: 'roster-sakhi',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
      };
      repository.findById.mockResolvedValue(found as never);
      listSakhiIdsForSupervisorMock.mockResolvedValue(['roster-sakhi']);

      const result = await service.getById('x', caller({ roles: ['SUPERVISOR'] }), AUTH_HEADER);

      expect(result.id).toBe('x');
    });

    it('allows a MANAGER/ADMIN caller unrestricted', async () => {
      const found = {
        id: 'x',
        sakhiId: 'anyones',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
      };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result.id).toBe('x');
    });

    it('passes through socioDemographics from the repository', async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        socioDemographics: { familyMembersCount: 4, childrenUnder5Count: 1 },
      };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result.socioDemographics).toMatchObject({
        familyMembersCount: 4,
        childrenUnder5Count: 1,
      });
    });

    it('resolves each *LookupId field to a sibling {categoryCode, valueCode, label}', async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        socioDemographics: {
          religionLookupId: 'religion-uuid-1',
          educationLevelLookupId: null,
        },
      };
      repository.findById.mockResolvedValue(found as never);
      resolveLookupValuesMock.mockResolvedValue({
        religionLookupId: { categoryCode: 'RELIGION', valueCode: 'HINDU', label: 'Hindu' },
        educationLevelLookupId: null,
        phoneOwnerLookupId: null,
        mobileNetworkAvailabilityLookupId: null,
        partnerEducationLevelLookupId: null,
        partnerOccupationLookupId: null,
        migrationPatternLookupId: null,
        monthlyIncomeLookupId: null,
        socialCategoryLookupId: null,
      });

      const result = await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(resolveLookupValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          religionLookupId: { categoryCode: 'RELIGION', lookupValueId: 'religion-uuid-1' },
          educationLevelLookupId: { categoryCode: 'EDUCATION_LEVEL', lookupValueId: null },
        }),
        AUTH_HEADER,
      );
      expect((result.socioDemographics as Record<string, unknown>).religion).toEqual({
        categoryCode: 'RELIGION',
        valueCode: 'HINDU',
        label: 'Hindu',
      });
      expect((result.socioDemographics as Record<string, unknown>).educationLevel).toBeNull();
    });

    it('does not call the lookup resolver when socioDemographics is null', async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        socioDemographics: null,
      };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(resolveLookupValuesMock).not.toHaveBeenCalled();
      expect(result.socioDemographics).toBeNull();
    });

    it('returns null socioDemographics for a case with no row yet', async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        socioDemographics: null,
      };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result.socioDemographics).toBeNull();
    });
  });

  describe('getById — risk condition name resolution', () => {
    it('resolves conditionCode/conditionName/gradeScale onto each risk condition summary', async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        riskConditionSummaries: [{ riskConditionId: 'risk-1', everAtRiskFlag: true }],
      };
      repository.findById.mockResolvedValue(found as never);
      resolveRiskConditionsMock.mockResolvedValue(
        new Map([
          [
            'risk-1',
            {
              conditionCode: 'HYPERTENSION_HIGH_BP',
              conditionName: 'Hypertension / High BP',
              gradeScale: 'NORMAL_LOW_MEDIUM_HIGH',
            },
          ],
        ]),
      );

      const result = await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result.riskConditionSummaries).toEqual([
        expect.objectContaining({
          riskConditionId: 'risk-1',
          conditionCode: 'HYPERTENSION_HIGH_BP',
          conditionName: 'Hypertension / High BP',
          gradeScale: 'NORMAL_LOW_MEDIUM_HIGH',
        }),
      ]);
      expect(resolveRiskConditionsMock).toHaveBeenCalledWith(['risk-1'], AUTH_HEADER);
    });

    it('skips the resolver call entirely when riskConditionSummaries is empty', async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        riskConditionSummaries: [],
      };
      repository.findById.mockResolvedValue(found as never);

      await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(resolveRiskConditionsMock).not.toHaveBeenCalled();
    });

    it('dedupes riskConditionId before calling the resolver', async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        riskConditionSummaries: [
          { riskConditionId: 'risk-1', phase: 'ANC' },
          { riskConditionId: 'risk-1', phase: 'PP' },
        ],
      };
      repository.findById.mockResolvedValue(found as never);

      await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(resolveRiskConditionsMock).toHaveBeenCalledWith(['risk-1'], AUTH_HEADER);
    });

    it('degrades to null conditionCode/conditionName/gradeScale, without failing the request, when risk-referral-service is unreachable', async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        riskConditionSummaries: [{ riskConditionId: 'risk-1', everAtRiskFlag: true }],
      };
      repository.findById.mockResolvedValue(found as never);
      resolveRiskConditionsMock.mockRejectedValue(
        Object.assign(new Error('bad gateway'), { status: 502 }),
      );
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      const result = await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result.riskConditionSummaries).toEqual([
        expect.objectContaining({
          riskConditionId: 'risk-1',
          conditionCode: null,
          conditionName: null,
          gradeScale: null,
        }),
      ]);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('leaves an unresolved riskConditionId null while resolving sibling entries', async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        riskConditionSummaries: [
          { riskConditionId: 'risk-1', phase: 'ANC' },
          { riskConditionId: 'risk-retired', phase: 'ANC' },
        ],
      };
      repository.findById.mockResolvedValue(found as never);
      resolveRiskConditionsMock.mockResolvedValue(
        new Map([
          [
            'risk-1',
            {
              conditionCode: 'HYPERTENSION_HIGH_BP',
              conditionName: 'Hypertension / High BP',
              gradeScale: 'NORMAL_LOW_MEDIUM_HIGH',
            },
          ],
        ]),
      );

      const result = await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result.riskConditionSummaries).toEqual([
        expect.objectContaining({
          riskConditionId: 'risk-1',
          conditionCode: 'HYPERTENSION_HIGH_BP',
        }),
        expect.objectContaining({
          riskConditionId: 'risk-retired',
          conditionCode: null,
          conditionName: null,
          gradeScale: null,
        }),
      ]);
    });
  });

  describe('getById — overall riskLevel', () => {
    it("is 'none' when riskConditionSummaries is empty", async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        riskConditionSummaries: [],
      };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result.riskLevel).toBe('none');
    });

    it("is 'mild' when the only summary is graded MILD", async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        riskConditionSummaries: [{ riskConditionId: 'risk-1', latestGrade: 'MILD' }],
      };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result.riskLevel).toBe('mild');
    });

    it("takes the worst grade across multiple summaries — any SEVERE anywhere yields 'high'", async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        riskConditionSummaries: [
          { riskConditionId: 'risk-1', latestGrade: 'MILD' },
          { riskConditionId: 'risk-2', latestGrade: 'SEVERE' },
          { riskConditionId: 'risk-3', latestGrade: 'MODERATE' },
        ],
      };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result.riskLevel).toBe('high');
    });

    it("treats HIGH and CRITICAL grades as 'high', same as the pada visit-list badge", async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        riskConditionSummaries: [{ riskConditionId: 'risk-1', latestGrade: 'CRITICAL' }],
      };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result.riskLevel).toBe('high');
    });

    it("is 'none' when every summary has a null latestGrade (ungraded/self-reported)", async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        riskConditionSummaries: [{ riskConditionId: 'risk-1', latestGrade: null }],
      };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result.riskLevel).toBe('none');
    });
  });

  describe('getById — riskColor derived from riskLevel', () => {
    it("is GREEN when riskLevel is 'none'", async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        riskConditionSummaries: [],
      };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result.riskColor).toBe('GREEN');
    });

    it.each([['mild'], ['moderate']])("is YELLOW when riskLevel is '%s'", async (grade) => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        riskConditionSummaries: [
          { riskConditionId: 'risk-1', latestGrade: grade === 'mild' ? 'MILD' : 'MODERATE' },
        ],
      };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result.riskColor).toBe('YELLOW');
    });

    it("is RED when riskLevel is 'high'", async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        riskConditionSummaries: [{ riskConditionId: 'risk-1', latestGrade: 'SEVERE' }],
      };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result.riskColor).toBe('RED');
    });
  });

  describe('getById — lastVisitVitals', () => {
    it('attaches the resolved vitals snapshot to the response', async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        riskConditionSummaries: [],
      };
      repository.findById.mockResolvedValue(found as never);
      const vitals = {
        visitId: 'visit-1',
        submittedAt: '2026-08-01T00:00:00.000Z',
        weightKg: 58.5,
        systolicBp: 120,
        diastolicBp: 80,
        temperatureF: 98.6,
        hemoglobinGDl: 11.2,
        muacCm: 24.5,
        respiratoryRate: null,
      };
      resolveLatestVisitVitalsMock.mockResolvedValue(vitals);

      const result = await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result.lastVisitVitals).toEqual(vitals);
      expect(resolveLatestVisitVitalsMock).toHaveBeenCalledWith('x', AUTH_HEADER);
    });

    it('is null when the beneficiary has never had a qualifying visit, or visit-form-service is unreachable', async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        riskConditionSummaries: [],
      };
      repository.findById.mockResolvedValue(found as never);
      resolveLatestVisitVitalsMock.mockResolvedValue(null);

      const result = await service.getById('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result.lastVisitVitals).toBeNull();
    });
  });

  describe('getOwnership', () => {
    it('returns bare {id, sakhiId, caseType} for a SAKHI caller who owns the case', async () => {
      repository.findOwnershipById.mockResolvedValue({
        id: 'x',
        sakhiId: CALLER_ID,
        caseType: 'MOTHER',
      } as never);

      const result = await service.getOwnership('x', caller({ roles: ['SAKHI'] }), AUTH_HEADER);

      expect(result).toEqual({ id: 'x', sakhiId: CALLER_ID, caseType: 'MOTHER' });
    });

    it('never triggers projectCase enrichment (no lastVisitVitals/riskLevel/etc.)', async () => {
      repository.findOwnershipById.mockResolvedValue({
        id: 'x',
        sakhiId: CALLER_ID,
        caseType: 'MOTHER',
      } as never);

      const result = await service.getOwnership('x', caller({ roles: ['SAKHI'] }), AUTH_HEADER);

      expect(result).not.toHaveProperty('lastVisitVitals');
      expect(result).not.toHaveProperty('riskLevel');
      expect(repository.findById).not.toHaveBeenCalled();
      expect(resolveLatestVisitVitalsMock).not.toHaveBeenCalled();
    });

    it('404s on an unknown beneficiary id', async () => {
      repository.findOwnershipById.mockResolvedValue(null);

      await expect(
        service.getOwnership('missing', caller({ roles: ['SAKHI'] }), AUTH_HEADER),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("403s a SAKHI caller reading another beneficiary's ownership", async () => {
      repository.findOwnershipById.mockResolvedValue({
        id: 'x',
        sakhiId: 'some-other-sakhi',
        caseType: 'MOTHER',
      } as never);

      await expect(
        service.getOwnership('x', caller({ roles: ['SAKHI'] }), AUTH_HEADER),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('403s a SUPERVISOR caller whose roster does not include the beneficiary sakhi', async () => {
      repository.findOwnershipById.mockResolvedValue({
        id: 'x',
        sakhiId: 'some-other-sakhi',
        caseType: 'MOTHER',
      } as never);
      listSakhiIdsForSupervisorMock.mockResolvedValue(['a-different-sakhi']);

      await expect(
        service.getOwnership('x', caller({ roles: ['SUPERVISOR'] }), AUTH_HEADER),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('allows a MANAGER/ADMIN caller unrestricted', async () => {
      repository.findOwnershipById.mockResolvedValue({
        id: 'x',
        sakhiId: 'some-other-sakhi',
        caseType: 'MOTHER',
      } as never);

      await expect(
        service.getOwnership('x', caller({ roles: ['ADMIN'] }), AUTH_HEADER),
      ).resolves.toEqual({ id: 'x', sakhiId: 'some-other-sakhi', caseType: 'MOTHER' });
    });
  });

  describe('create — idempotent replay on localCaseUuid', () => {
    it('returns the existing case without re-running consent/duplicate/create logic on a replay', async () => {
      repository.findByLocalCaseUuid.mockResolvedValue({
        id: 'existing-id',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        riskConditionSummaries: [],
        statusHistory: [],
      } as never);

      await expect(service.create(baseMotherInput, CALLER_ID, AUTH_HEADER)).resolves.toEqual(
        expect.objectContaining({ id: 'existing-id' }),
      );
      expect(repository.findByLocalCaseUuid).toHaveBeenCalledWith(
        baseMotherInput.case.localCaseUuid,
      );
      expect(repository.findDuplicateCandidate).not.toHaveBeenCalled();
      expect(repository.createEnrollment).not.toHaveBeenCalled();
    });

    it('proceeds with a normal create when no case exists for this localCaseUuid yet', async () => {
      repository.findByLocalCaseUuid.mockResolvedValue(null);
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockResolvedValue({
        id: 'new-id',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
      } as never);

      await expect(service.create(baseMotherInput, CALLER_ID, AUTH_HEADER)).resolves.toEqual(
        expect.objectContaining({ id: 'new-id' }),
      );
      expect(repository.createEnrollment).toHaveBeenCalledTimes(1);
    });
  });

  describe('create — consent (M2)', () => {
    it('rejects with 422 and creates nothing when consent is REFUSED', async () => {
      const dto = { ...baseMotherInput, consent: { status: 'REFUSED' as const, date: new Date() } };
      await expect(service.create(dto, CALLER_ID, AUTH_HEADER)).rejects.toMatchObject({
        status: 422,
      });
      expect(repository.findDuplicateCandidate).not.toHaveBeenCalled();
      expect(repository.createEnrollment).not.toHaveBeenCalled();
    });
  });

  describe('create — duplicate detection (FR-S-2.4 / FR-S-2.5)', () => {
    // A matched case as findDuplicateCandidate now returns it: the case with
    // its currentSummary (delivery/closure/lmp) and currentStatus.
    function matchedCase(overrides: {
      currentStatus?: string;
      dateOfDelivery?: Date | null;
      closureDate?: Date | null;
      lmpDate?: Date | null;
      summary?: boolean; // false → no summary row at all
    }) {
      const hasSummary = overrides.summary !== false;
      return {
        id: 'existing-id',
        currentStatus: overrides.currentStatus ?? 'ACTIVE',
        currentSummary: hasSummary
          ? {
              dateOfDelivery: overrides.dateOfDelivery ?? null,
              closureDate: overrides.closureDate ?? null,
              lmpDate: overrides.lmpDate ?? null,
            }
          : null,
      };
    }

    // A function, not a const: encryptPii must run AFTER beforeEach sets
    // PII_ENCRYPTION_KEY, not at describe-eval time against a stale/unset key.
    const newCase = () => ({
      id: 'new-id',
      pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
    });

    it('blocks with 409 (hard duplicate) when the matched case has neither delivery nor closure', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(matchedCase({}) as never);
      await expect(service.create(baseMotherInput, CALLER_ID, AUTH_HEADER)).rejects.toMatchObject({
        status: 409,
      });
      expect(repository.createEnrollment).not.toHaveBeenCalled();
    });

    it('blocks with 409 when the matched case has no summary row at all (SRS-literal default-deny)', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(matchedCase({ summary: false }) as never);
      await expect(service.create(baseMotherInput, CALLER_ID, AUTH_HEADER)).rejects.toMatchObject({
        status: 409,
      });
      expect(repository.createEnrollment).not.toHaveBeenCalled();
    });

    it('blocks with 409 when only delivery (not closure) exists — both are required', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(
        matchedCase({ dateOfDelivery: new Date('2026-02-01') }) as never,
      );
      await expect(service.create(baseMotherInput, CALLER_ID, AUTH_HEADER)).rejects.toMatchObject({
        status: 409,
      });
      expect(repository.createEnrollment).not.toHaveBeenCalled();
    });

    it('allows the enrollment when the matched case has BOTH delivery and closure (new pregnancy)', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(
        matchedCase({
          dateOfDelivery: new Date('2026-02-01'),
          closureDate: new Date('2026-03-01'),
        }) as never,
      );
      repository.createEnrollment.mockResolvedValue(newCase() as never);

      await expect(service.create(baseMotherInput, CALLER_ID, AUTH_HEADER)).resolves.toEqual(
        expect.objectContaining({ id: 'new-id' }),
      );
      expect(repository.createEnrollment).toHaveBeenCalledTimes(1);
    });

    it('surfaces the FR-S-2.5 re-enrolment prompt for a completed journey with a different LMP', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(
        matchedCase({
          currentStatus: 'JOURNEY_COMPLETE',
          dateOfDelivery: new Date('2025-08-01'),
          lmpDate: new Date('2024-11-01'), // differs from baseMotherInput's 2025-10-01
        }) as never,
      );

      await expect(service.create(baseMotherInput, CALLER_ID, AUTH_HEADER)).rejects.toMatchObject({
        status: 409,
        details: expect.objectContaining({ reason: 'RE_ENROLLMENT' }),
      });
      expect(repository.createEnrollment).not.toHaveBeenCalled();
    });

    it('treats an ACTIVE match (not a completed journey) as a plain hard duplicate, not a re-enrolment', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(
        matchedCase({
          currentStatus: 'ACTIVE',
          dateOfDelivery: new Date('2025-08-01'),
          lmpDate: new Date('2024-11-01'),
        }) as never,
      );

      const err = await service.create(baseMotherInput, CALLER_ID, AUTH_HEADER).catch((e) => e);
      expect(err.status).toBe(409);
      expect(err.details?.reason).toBeUndefined();
    });

    it('proceeds despite a duplicate when acknowledgeDuplicate is true', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(matchedCase({}) as never);
      repository.createEnrollment.mockResolvedValue(newCase() as never);
      const dto = { ...baseMotherInput, acknowledgeDuplicate: true };
      await expect(service.create(dto, CALLER_ID, AUTH_HEADER)).resolves.toEqual(
        expect.objectContaining({ id: 'new-id' }),
      );
      expect(repository.createEnrollment).toHaveBeenCalledTimes(1);
    });

    it('creates normally when no duplicate is found', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockResolvedValue({
        id: 'new-id',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
      } as never);
      await expect(service.create(baseMotherInput, CALLER_ID, AUTH_HEADER)).resolves.toEqual(
        expect.objectContaining({ id: 'new-id' }),
      );
    });

    it('scopes duplicate search to the case type, so a MOTHER search never matches a CHILD case', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockResolvedValue({
        id: 'new-id',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
      } as never);

      await service.create(baseMotherInput, CALLER_ID, AUTH_HEADER);

      expect(repository.findDuplicateCandidate).toHaveBeenCalledWith(
        expect.objectContaining({ caseTypeLookupId: baseMotherInput.case.caseTypeLookupId }),
      );
    });
  });

  describe('create — server-side computation (M5)', () => {
    it('computes eddDate as lmpDate + 280 days, ignoring any client-supplied value', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      await service.create(baseMotherInput, CALLER_ID, AUTH_HEADER);

      const call = repository.createEnrollment.mock.calls[0][0];
      expect(call.motherDetails?.eddDate.toISOString().slice(0, 10)).toBe('2026-07-08');
    });

    it('computes bmiAtRegistration from height and weight', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      await service.create(baseMotherInput, CALLER_ID, AUTH_HEADER);

      const call = repository.createEnrollment.mock.calls[0][0];
      // 60 / (1.6*1.6) = 23.4375
      expect(call.motherDetails?.bmiAtRegistration).toBeCloseTo(23.44, 1);
    });

    it('attributes the case to the authenticated caller when case.sakhiId is omitted', async () => {
      const dto: CreateBeneficiaryInput = {
        ...baseMotherInput,
        case: { ...baseMotherInput.case, sakhiId: undefined },
      };
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      await service.create(dto, CALLER_ID, AUTH_HEADER);

      const call = repository.createEnrollment.mock.calls[0][0];
      expect(call.case.sakhiId).toBe(CALLER_ID);
    });

    it('ignores a client-supplied case.sakhiId and always uses the authenticated caller’s id', async () => {
      // baseMotherInput.case.sakhiId ('33333333-...') deliberately differs
      // from CALLER_ID ('99999999-...') to prove the client value is never trusted.
      expect(baseMotherInput.case.sakhiId).not.toBe(CALLER_ID);
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      await service.create(baseMotherInput, CALLER_ID, AUTH_HEADER);

      const call = repository.createEnrollment.mock.calls[0][0];
      expect(call.case.sakhiId).toBe(CALLER_ID);
      expect(call.case.sakhiId).not.toBe(baseMotherInput.case.sakhiId);
    });

    it('attributes each case to its own caller when two different Sakhis enroll with the same body shape', async () => {
      const CALLER_A = CALLER_ID;
      const CALLER_B = '88888888-8888-8888-8888-888888888888';
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      const dtoA: CreateBeneficiaryInput = {
        ...baseMotherInput,
        case: { ...baseMotherInput.case, localCaseUuid: 'local-case-uuid-caller-a' },
      };
      const dtoB: CreateBeneficiaryInput = {
        ...baseMotherInput,
        case: { ...baseMotherInput.case, localCaseUuid: 'local-case-uuid-caller-b' },
      };

      await service.create(dtoA, CALLER_A, AUTH_HEADER);
      await service.create(dtoB, CALLER_B, AUTH_HEADER);

      const [callA, callB] = repository.createEnrollment.mock.calls;
      expect(callA[0].case.sakhiId).toBe(CALLER_A);
      expect(callB[0].case.sakhiId).toBe(CALLER_B);
    });

    it('attributes a child enrollment to the authenticated caller, ignoring case.sakhiId', async () => {
      expect(baseChildInput.case.sakhiId).not.toBe(CALLER_ID);
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      await service.create(baseChildInput, CALLER_ID, AUTH_HEADER);

      const call = repository.createEnrollment.mock.calls[0][0];
      expect(call.case.sakhiId).toBe(CALLER_ID);
    });
  });

  describe('create — mother enrollment (M1)', () => {
    it('encrypts PII, hashes search tokens, and creates the case atomically', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      await service.create(baseMotherInput, CALLER_ID, AUTH_HEADER);

      const call = repository.createEnrollment.mock.calls[0][0];
      expect(call.pii.fullNameEnc).toBeInstanceOf(Buffer);
      expect(call.pii.fullNameSearchHash).toBeInstanceOf(Buffer);
      expect(call.searchTokens.lmpDateToken).not.toBeNull();
      expect(call.consentCapturedByUserId).toBe(CALLER_ID);
    });

    it('returns empty risk/status-history arrays for a freshly enrolled case', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input, id: 'new-id' } as never),
      );

      const result = await service.create(baseMotherInput, CALLER_ID, AUTH_HEADER);

      expect(result.riskConditionSummaries).toEqual([]);
      expect(result.statusHistory).toEqual([]);
    });
  });

  describe('create — child enrollment (CH1/CH2)', () => {
    it('creates an independent child case with linkedAncCase=false', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      await service.create(baseChildInput, CALLER_ID, AUTH_HEADER);

      const call = repository.createEnrollment.mock.calls[0][0];
      expect(call.childDetails?.linkedAncCase).toBe(false);
    });

    it('creates a mother-linked child case with linkedAncCase=true', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      const dto = {
        ...baseChildInput,
        case: {
          ...baseChildInput.case,
          motherBeneficiaryId: '77777777-7777-7777-7777-777777777777',
        },
      };
      await service.create(dto, CALLER_ID, AUTH_HEADER);

      const call = repository.createEnrollment.mock.calls[0][0];
      expect(call.childDetails?.linkedAncCase).toBe(true);
      expect(call.childDetails?.motherBeneficiaryId).toBe('77777777-7777-7777-7777-777777777777');
    });
  });

  describe('create — stillbirth blocks a separate CHILD case (SRS §G.4)', () => {
    const motherBeneficiaryId = '77777777-7777-7777-7777-777777777777';

    function childDto(birthOrder: number): CreateBeneficiaryInput {
      return {
        ...baseChildInput,
        case: { ...baseChildInput.case, motherBeneficiaryId },
        childDetails: { dateOfBirth: new Date('2025-12-01'), birthOrder },
      };
    }

    it('blocks creating a CHILD case for a slot whose own recorded outcome is a stillbirth', async () => {
      resolveDeliveryOutcomesBySlotMock.mockResolvedValue([
        { birthOrder: 1, outcome: 'antepartum_still_birth_fresh' },
      ]);

      await expect(service.create(childDto(1), CALLER_ID, AUTH_HEADER)).rejects.toMatchObject({
        status: 422,
        details: {
          reason: 'CHILD_ALREADY_STILLBIRTH',
          birthOrder: 1,
          outcome: 'antepartum_still_birth_fresh',
        },
      });
      expect(repository.createEnrollment).not.toHaveBeenCalled();
    });

    it('allows creating a CHILD case for a slot whose own recorded outcome is a live birth, even when a sibling slot was a stillbirth', async () => {
      resolveDeliveryOutcomesBySlotMock.mockResolvedValue([
        { birthOrder: 1, outcome: 'antepartum_still_birth_fresh' },
        { birthOrder: 2, outcome: 'live_birth' },
      ]);
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      await expect(service.create(childDto(2), CALLER_ID, AUTH_HEADER)).resolves.toBeDefined();
      expect(repository.createEnrollment).toHaveBeenCalled();
    });

    // The old count-based guard (existingChildCount >= liveBirthCount) was
    // order-dependent: whichever twin's CHILD case was submitted FIRST
    // always passed, regardless of which slot it was actually for — so a
    // bogus/out-of-order request for the stillborn slot could wrongly
    // consume the "count" and later block the real live twin's legitimate
    // registration. The slot-based guard has no such dependency: this test
    // registers the stillborn slot FIRST (as the old bug's trigger case
    // required), then the live slot, and asserts the live slot is never
    // blocked by having gone second.
    it('is not order-dependent — creating the stillborn slot first does not block the live slot afterward', async () => {
      resolveDeliveryOutcomesBySlotMock.mockResolvedValue([
        { birthOrder: 1, outcome: 'antepartum_still_birth_fresh' },
        { birthOrder: 2, outcome: 'live_birth' },
      ]);

      // Attempt (and expect rejection of) the stillborn slot first.
      await expect(service.create(childDto(1), CALLER_ID, AUTH_HEADER)).rejects.toMatchObject({
        status: 422,
      });
      expect(repository.createEnrollment).not.toHaveBeenCalled();

      // The live slot's registration must still succeed afterward.
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );
      await expect(service.create(childDto(2), CALLER_ID, AUTH_HEADER)).resolves.toBeDefined();
      expect(repository.createEnrollment).toHaveBeenCalled();
    });

    it('never blocks a slot with no recorded outcome yet', async () => {
      resolveDeliveryOutcomesBySlotMock.mockResolvedValue([]);
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      await expect(service.create(childDto(1), CALLER_ID, AUTH_HEADER)).resolves.toBeDefined();
      expect(repository.createEnrollment).toHaveBeenCalled();
    });

    // The standalone Child Registration screen ("registered mother" path —
    // e.g. a child born before this app was in use, or outside any
    // recorded delivery session) has no birthOrder field and submits
    // motherBeneficiaryId without it. This must keep working for a mother
    // whose delivery record has no stillbirth on it (or no delivery record
    // at all) — birthOrder is only ever required once a stillbirth is
    // actually on record for that mother, never merely because
    // motherBeneficiaryId is present.
    it('allows a mother-linked CHILD case with no birthOrder when that mother has no stillbirth on record', async () => {
      resolveDeliveryOutcomesBySlotMock.mockResolvedValue([
        { birthOrder: 1, outcome: 'live_birth' },
      ]);
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      const dto: CreateBeneficiaryInput = {
        ...baseChildInput,
        case: { ...baseChildInput.case, motherBeneficiaryId },
        childDetails: { dateOfBirth: new Date('2025-12-01') },
      };

      await expect(service.create(dto, CALLER_ID, AUTH_HEADER)).resolves.toBeDefined();
      expect(repository.createEnrollment).toHaveBeenCalled();
    });

    it('allows a mother-linked CHILD case with no birthOrder when that mother has no DELIVERY_VISIT submission at all', async () => {
      resolveDeliveryOutcomesBySlotMock.mockResolvedValue([]);
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      const dto: CreateBeneficiaryInput = {
        ...baseChildInput,
        case: { ...baseChildInput.case, motherBeneficiaryId },
        childDetails: { dateOfBirth: new Date('2025-12-01') },
      };

      await expect(service.create(dto, CALLER_ID, AUTH_HEADER)).resolves.toBeDefined();
      expect(repository.createEnrollment).toHaveBeenCalled();
    });

    it('blocks a mother-linked CHILD case with no birthOrder once that mother has a stillbirth on record', async () => {
      resolveDeliveryOutcomesBySlotMock.mockResolvedValue([
        { birthOrder: 1, outcome: 'antepartum_still_birth_fresh' },
        { birthOrder: 2, outcome: 'live_birth' },
      ]);

      const dto: CreateBeneficiaryInput = {
        ...baseChildInput,
        case: { ...baseChildInput.case, motherBeneficiaryId },
        childDetails: { dateOfBirth: new Date('2025-12-01') },
      };

      await expect(service.create(dto, CALLER_ID, AUTH_HEADER)).rejects.toMatchObject({
        status: 422,
      });
      expect(repository.createEnrollment).not.toHaveBeenCalled();
    });

    it('does not call the delivery-outcomes check for a CHILD case with no motherBeneficiaryId', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      await service.create(baseChildInput, CALLER_ID, AUTH_HEADER);

      expect(resolveDeliveryOutcomesBySlotMock).not.toHaveBeenCalled();
    });

    it('does not call the delivery-outcomes check for a MOTHER case', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      await service.create(baseMotherInput, CALLER_ID, AUTH_HEADER);

      expect(resolveDeliveryOutcomesBySlotMock).not.toHaveBeenCalled();
    });

    // resolveDeliveryOutcomesBySlot throws badGateway (not a 422) when it
    // can't reach visit-form-service — this must surface distinctly from a
    // real CHILD_ALREADY_STILLBIRTH conflict so callers (and their logs)
    // can tell "the check itself failed" apart from "a real slot conflict."
    it('surfaces a distinct badGateway error, not a stillbirth conflict, when the delivery-outcomes check itself fails', async () => {
      resolveDeliveryOutcomesBySlotMock.mockRejectedValue(
        badGateway('Unable to verify delivery outcomes — visit-form-service is unreachable.'),
      );

      await expect(service.create(childDto(1), CALLER_ID, AUTH_HEADER)).rejects.toMatchObject({
        status: 502,
      });
      expect(repository.createEnrollment).not.toHaveBeenCalled();
    });
  });

  describe('create — re-enrollment (M10)', () => {
    it('links previousBeneficiaryId without reusing it as the new id', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      const dto = {
        ...baseMotherInput,
        case: {
          ...baseMotherInput.case,
          previousBeneficiaryId: '88888888-8888-8888-8888-888888888888',
        },
      };
      await service.create(dto, CALLER_ID, AUTH_HEADER);

      const call = repository.createEnrollment.mock.calls[0][0];
      expect(call.case.previousBeneficiaryId).toBe('88888888-8888-8888-8888-888888888888');
    });
  });

  it('propagates repository errors on create', async () => {
    repository.findDuplicateCandidate.mockResolvedValue(null);
    repository.createEnrollment.mockRejectedValue(new Error('db down'));
    await expect(service.create(baseMotherInput, CALLER_ID, AUTH_HEADER)).rejects.toThrow(
      'db down',
    );
  });

  describe('getIds', () => {
    it('scopes a SAKHI caller to their own cases', async () => {
      repository.findIds.mockResolvedValue(['b1', 'b2']);

      const result = await service.getIds(undefined, caller(), AUTH_HEADER);

      expect(repository.findIds).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiId: CALLER_ID }),
      );
      expect(result).toEqual(['b1', 'b2']);
    });

    it('scopes a SUPERVISOR caller to their roster', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);
      repository.findIds.mockResolvedValue([]);

      await service.getIds(undefined, caller({ roles: ['SUPERVISOR'] }), AUTH_HEADER);

      expect(repository.findIds).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiIds: ['sakhi-a', 'sakhi-b'] }),
      );
    });

    it('rejects a SUPERVISOR sakhiId outside their roster', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a']);

      await expect(
        service.getIds('sakhi-outside', caller({ roles: ['SUPERVISOR'] }), AUTH_HEADER),
      ).rejects.toThrow("sakhiId is not in this Supervisor's roster.");
    });

    it('leaves a MANAGER/ADMIN caller unscoped with no sakhiId filter', async () => {
      repository.findIds.mockResolvedValue(['b1']);

      await service.getIds(undefined, caller({ roles: ['MANAGER'] }), AUTH_HEADER);

      expect(repository.findIds).toHaveBeenCalledWith(
        expect.not.objectContaining({ sakhiId: expect.anything() }),
      );
    });
  });

  describe('getPadaBreakdown', () => {
    it('scopes a SAKHI caller to their own cases', async () => {
      repository.findIdsGroupedByPada.mockResolvedValue(
        new Map([
          [
            'pada-1',
            [
              { id: 'b1', caseType: 'MOTHER' },
              { id: 'b2', caseType: 'CHILD' },
            ],
          ],
        ]),
      );
      resolvePadaUnitsMock.mockResolvedValue(
        new Map([['pada-1', { name: 'Sample Pada', parentId: 'village-1' }]]),
      );
      resolveVillageNamesMock.mockResolvedValue(new Map([['village-1', 'Sample Village']]));

      const result = await service.getPadaBreakdown(undefined, caller(), AUTH_HEADER);

      expect(repository.findIdsGroupedByPada).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiId: CALLER_ID }),
      );
      expect(result).toEqual([
        {
          padaId: 'pada-1',
          padaName: 'Sample Pada',
          villageName: 'Sample Village',
          beneficiaries: [
            { id: 'b1', caseType: 'MOTHER' },
            { id: 'b2', caseType: 'CHILD' },
          ],
        },
      ]);
    });

    it('scopes a SUPERVISOR caller to their roster', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);
      repository.findIdsGroupedByPada.mockResolvedValue(new Map());

      await service.getPadaBreakdown(undefined, caller({ roles: ['SUPERVISOR'] }), AUTH_HEADER);

      expect(repository.findIdsGroupedByPada).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiIds: ['sakhi-a', 'sakhi-b'] }),
      );
    });

    it('rejects a SUPERVISOR sakhiId outside their roster', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a']);

      await expect(
        service.getPadaBreakdown('sakhi-outside', caller({ roles: ['SUPERVISOR'] }), AUTH_HEADER),
      ).rejects.toThrow("sakhiId is not in this Supervisor's roster.");
    });

    it('leaves a MANAGER/ADMIN caller unscoped with no sakhiId filter', async () => {
      repository.findIdsGroupedByPada.mockResolvedValue(new Map());

      await service.getPadaBreakdown(undefined, caller({ roles: ['MANAGER'] }), AUTH_HEADER);

      expect(repository.findIdsGroupedByPada).toHaveBeenCalledWith(
        expect.not.objectContaining({ sakhiId: expect.anything() }),
      );
    });

    it('returns an empty array with no geography lookups when the caller has no beneficiaries in any pada', async () => {
      repository.findIdsGroupedByPada.mockResolvedValue(new Map());

      const result = await service.getPadaBreakdown(undefined, caller(), AUTH_HEADER);

      expect(result).toEqual([]);
      expect(resolvePadaUnitsMock).not.toHaveBeenCalled();
      expect(resolveVillageNamesMock).not.toHaveBeenCalled();
    });

    it('resolves padaName/villageName to null for a stale/deleted pada, without failing the whole response', async () => {
      repository.findIdsGroupedByPada.mockResolvedValue(
        new Map([['pada-stale', [{ id: 'b1', caseType: 'MOTHER' }]]]),
      );
      resolvePadaUnitsMock.mockResolvedValue(new Map());
      resolveVillageNamesMock.mockResolvedValue(new Map());

      const result = await service.getPadaBreakdown(undefined, caller(), AUTH_HEADER);

      expect(result).toEqual([
        {
          padaId: 'pada-stale',
          padaName: null,
          villageName: null,
          beneficiaries: [{ id: 'b1', caseType: 'MOTHER' }],
        },
      ]);
    });

    it('returns one row per distinct pada when beneficiaries span multiple padas', async () => {
      repository.findIdsGroupedByPada.mockResolvedValue(
        new Map([
          ['pada-1', [{ id: 'b1', caseType: 'MOTHER' }]],
          [
            'pada-2',
            [
              { id: 'b2', caseType: 'MOTHER' },
              { id: 'b3', caseType: 'CHILD' },
            ],
          ],
        ]),
      );
      resolvePadaUnitsMock.mockResolvedValue(
        new Map([
          ['pada-1', { name: 'Pada One', parentId: 'village-1' }],
          ['pada-2', { name: 'Pada Two', parentId: 'village-1' }],
        ]),
      );
      resolveVillageNamesMock.mockResolvedValue(new Map([['village-1', 'Sample Village']]));

      const result = await service.getPadaBreakdown(undefined, caller(), AUTH_HEADER);

      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([
          {
            padaId: 'pada-1',
            padaName: 'Pada One',
            villageName: 'Sample Village',
            beneficiaries: [{ id: 'b1', caseType: 'MOTHER' }],
          },
          {
            padaId: 'pada-2',
            padaName: 'Pada Two',
            villageName: 'Sample Village',
            beneficiaries: [
              { id: 'b2', caseType: 'MOTHER' },
              { id: 'b3', caseType: 'CHILD' },
            ],
          },
        ]),
      );
    });
  });

  describe('getByIdsWithRisk', () => {
    it('decrypts name/phone and maps latestGrade to a riskLevel bucket', async () => {
      repository.findByIdsWithRisk.mockResolvedValue([
        {
          id: 'b1',
          fullNameEnc: encryptPii('Jane Doe'),
          phoneEnc: encryptPii('9876543210'),
          villageId: 'village-1',
          padaId: 'pada-1',
          latestGrade: 'MODERATE',
        },
      ]);

      const result = await service.getByIdsWithRisk(['b1'], undefined, caller(), AUTH_HEADER);

      expect(repository.findByIdsWithRisk).toHaveBeenCalledWith(
        ['b1'],
        undefined,
        expect.objectContaining({ sakhiId: CALLER_ID }),
      );
      expect(result).toEqual([
        {
          id: 'b1',
          beneficiaryName: 'Jane Doe',
          phoneNumber: '9876543210',
          villageId: 'village-1',
          padaId: 'pada-1',
          riskLevel: 'moderate',
        },
      ]);
    });

    it.each([
      ['NORMAL', 'none'],
      ['MILD', 'mild'],
      ['MODERATE', 'moderate'],
      ['SEVERE', 'high'],
      ['HIGH', 'high'],
      ['CRITICAL', 'high'],
      [null, 'none'],
    ])('maps latestGrade %s to riskLevel %s', async (grade, expectedRiskLevel) => {
      repository.findByIdsWithRisk.mockResolvedValue([
        {
          id: 'b1',
          fullNameEnc: encryptPii('Jane Doe'),
          phoneEnc: null,
          villageId: null,
          padaId: null,
          latestGrade: grade,
        },
      ]);

      const result = await service.getByIdsWithRisk(['b1'], undefined, caller(), AUTH_HEADER);

      expect(result[0].riskLevel).toBe(expectedRiskLevel);
    });

    it('returns null phoneNumber when the beneficiary has no phone on record', async () => {
      repository.findByIdsWithRisk.mockResolvedValue([
        {
          id: 'b1',
          fullNameEnc: encryptPii('Jane Doe'),
          phoneEnc: null,
          villageId: null,
          padaId: null,
          latestGrade: null,
        },
      ]);

      const result = await service.getByIdsWithRisk(['b1'], undefined, caller(), AUTH_HEADER);

      expect(result[0].phoneNumber).toBeNull();
    });

    it('hashes a search term and passes it through to the repository', async () => {
      repository.findByIdsWithRisk.mockResolvedValue([]);

      await service.getByIdsWithRisk(['b1'], 'Jane', caller(), AUTH_HEADER);

      expect(repository.findByIdsWithRisk).toHaveBeenCalledWith(
        ['b1'],
        expect.any(Buffer),
        expect.anything(),
      );
    });

    it('returns an empty array when no ids match (id not found, or excluded by search)', async () => {
      repository.findByIdsWithRisk.mockResolvedValue([]);

      const result = await service.getByIdsWithRisk(
        ['unknown-id'],
        undefined,
        caller(),
        AUTH_HEADER,
      );

      expect(result).toEqual([]);
    });

    // Security regression: a caller must never be able to fetch another
    // Sakhi's/roster's beneficiaries by simply passing arbitrary ids — see
    // the IDOR fix in getByIdsWithRisk's own doc comment.
    it('scopes a SAKHI caller to their own ids — an out-of-scope id is silently excluded by the repository filter', async () => {
      repository.findByIdsWithRisk.mockResolvedValue([]);

      await service.getByIdsWithRisk(
        ['some-other-sakhis-beneficiary'],
        undefined,
        caller(),
        AUTH_HEADER,
      );

      expect(repository.findByIdsWithRisk).toHaveBeenCalledWith(
        ['some-other-sakhis-beneficiary'],
        undefined,
        expect.objectContaining({ sakhiId: CALLER_ID }),
      );
    });

    it('scopes a SUPERVISOR caller to their roster', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);
      repository.findByIdsWithRisk.mockResolvedValue([]);

      await service.getByIdsWithRisk(
        ['b1'],
        undefined,
        caller({ roles: ['SUPERVISOR'] }),
        AUTH_HEADER,
      );

      expect(repository.findByIdsWithRisk).toHaveBeenCalledWith(
        ['b1'],
        undefined,
        expect.objectContaining({ sakhiIds: ['sakhi-a', 'sakhi-b'] }),
      );
    });

    it('leaves a MANAGER/ADMIN caller unscoped', async () => {
      repository.findByIdsWithRisk.mockResolvedValue([]);

      await service.getByIdsWithRisk(
        ['b1'],
        undefined,
        caller({ roles: ['MANAGER'] }),
        AUTH_HEADER,
      );

      expect(repository.findByIdsWithRisk).toHaveBeenCalledWith(
        ['b1'],
        undefined,
        expect.not.objectContaining({ sakhiId: expect.anything() }),
      );
    });

    it(
      'leaves a caller holding both MANAGER and SAKHI unscoped — regression: the SAKHI ' +
        'branch must not run ahead of the privileged-role check',
      async () => {
        repository.findByIdsWithRisk.mockResolvedValue([]);

        await service.getByIdsWithRisk(
          ['b1'],
          undefined,
          caller({ roles: ['MANAGER', 'SAKHI'] }),
          AUTH_HEADER,
        );

        expect(repository.findByIdsWithRisk).toHaveBeenCalledWith(
          ['b1'],
          undefined,
          expect.not.objectContaining({ sakhiId: expect.anything() }),
        );
      },
    );
  });

  describe('getRiskConditionSummaryBatch', () => {
    function summaryRow(overrides: Record<string, unknown> = {}) {
      return {
        riskConditionId: 'risk-1',
        phase: 'ANC',
        latestGrade: 'HIGH',
        latestAssessedAt: '2026-01-01T00:00:00.000Z',
        everHighestGrade: 'HIGH',
        everAtRiskFlag: true,
        currentReferralTriggerFlag: true,
        currentHrVisitTriggerFlag: false,
        isFirstInstance: true,
        consecutiveNoImprovementCount: null,
        ...overrides,
      };
    }

    it('scopes a SAKHI caller to their own roster', async () => {
      repository.findRiskConditionSummariesByBeneficiaryIds.mockResolvedValue([]);

      await service.getRiskConditionSummaryBatch(['b1'], caller(), AUTH_HEADER);

      expect(repository.findRiskConditionSummariesByBeneficiaryIds).toHaveBeenCalledWith(
        ['b1'],
        expect.objectContaining({ sakhiId: CALLER_ID }),
      );
    });

    it('scopes a SUPERVISOR caller to their roster', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);
      repository.findRiskConditionSummariesByBeneficiaryIds.mockResolvedValue([]);

      await service.getRiskConditionSummaryBatch(
        ['b1'],
        caller({ roles: ['SUPERVISOR'] }),
        AUTH_HEADER,
      );

      expect(repository.findRiskConditionSummariesByBeneficiaryIds).toHaveBeenCalledWith(
        ['b1'],
        expect.objectContaining({ sakhiIds: ['sakhi-a', 'sakhi-b'] }),
      );
    });

    it('leaves a MANAGER/ADMIN caller unscoped', async () => {
      repository.findRiskConditionSummariesByBeneficiaryIds.mockResolvedValue([]);

      await service.getRiskConditionSummaryBatch(
        ['b1'],
        caller({ roles: ['MANAGER'] }),
        AUTH_HEADER,
      );

      expect(repository.findRiskConditionSummariesByBeneficiaryIds).toHaveBeenCalledWith(
        ['b1'],
        expect.not.objectContaining({ sakhiId: expect.anything() }),
      );
    });

    it('an out-of-scope or nonexistent id is silently absent from the result (repository already filtered it)', async () => {
      repository.findRiskConditionSummariesByBeneficiaryIds.mockResolvedValue([]);

      const result = await service.getRiskConditionSummaryBatch(
        ['out-of-scope-id'],
        caller(),
        AUTH_HEADER,
      );

      expect(result).toEqual([]);
    });

    it('includes a beneficiary with zero summary rows, with an empty riskConditionSummaries array', async () => {
      repository.findRiskConditionSummariesByBeneficiaryIds.mockResolvedValue([
        { beneficiaryId: 'ben-1', riskConditionSummaries: [] },
      ]);

      const result = await service.getRiskConditionSummaryBatch(['ben-1'], caller(), AUTH_HEADER);

      expect(result).toEqual([{ beneficiaryId: 'ben-1', riskConditionSummaries: [] }]);
      expect(resolveRiskConditionsMock).not.toHaveBeenCalled();
    });

    it('includes isFirstInstance/consecutiveNoImprovementCount straight from the repository row', async () => {
      repository.findRiskConditionSummariesByBeneficiaryIds.mockResolvedValue([
        {
          beneficiaryId: 'ben-1',
          riskConditionSummaries: [
            summaryRow({ isFirstInstance: false, consecutiveNoImprovementCount: 3 }),
          ],
        },
      ] as never);
      resolveRiskConditionsMock.mockResolvedValue(new Map());

      const result = await service.getRiskConditionSummaryBatch(['ben-1'], caller(), AUTH_HEADER);

      expect(result[0].riskConditionSummaries[0]).toEqual(
        expect.objectContaining({ isFirstInstance: false, consecutiveNoImprovementCount: 3 }),
      );
    });

    it('resolves condition names in a single call across every distinct riskConditionId in the whole batch', async () => {
      repository.findRiskConditionSummariesByBeneficiaryIds.mockResolvedValue([
        {
          beneficiaryId: 'ben-1',
          riskConditionSummaries: [summaryRow({ riskConditionId: 'risk-1' })],
        },
        {
          beneficiaryId: 'ben-2',
          riskConditionSummaries: [summaryRow({ riskConditionId: 'risk-1' })],
        },
        {
          beneficiaryId: 'ben-3',
          riskConditionSummaries: [summaryRow({ riskConditionId: 'risk-2' })],
        },
      ] as never);
      resolveRiskConditionsMock.mockResolvedValue(
        new Map([
          [
            'risk-1',
            {
              conditionCode: 'ANEMIA',
              conditionName: 'Anemia',
              gradeScale: 'NORMAL_MILD_MODERATE_SEVERE',
            },
          ],
          [
            'risk-2',
            {
              conditionCode: 'HYPERTENSION_HIGH_BP',
              conditionName: 'Hypertension / High BP',
              gradeScale: 'NORMAL_LOW_MEDIUM_HIGH',
            },
          ],
        ]),
      );

      const result = await service.getRiskConditionSummaryBatch(
        ['ben-1', 'ben-2', 'ben-3'],
        caller(),
        AUTH_HEADER,
      );

      expect(resolveRiskConditionsMock).toHaveBeenCalledTimes(1);
      expect(resolveRiskConditionsMock).toHaveBeenCalledWith(
        expect.arrayContaining(['risk-1', 'risk-2']),
        AUTH_HEADER,
      );
      expect(resolveRiskConditionsMock.mock.calls[0][0]).toHaveLength(2);
      expect(result[0].riskConditionSummaries[0]).toEqual(
        expect.objectContaining({ conditionCode: 'ANEMIA', conditionName: 'Anemia' }),
      );
      expect(result[2].riskConditionSummaries[0]).toEqual(
        expect.objectContaining({ conditionCode: 'HYPERTENSION_HIGH_BP' }),
      );
    });

    it('degrades to null conditionCode/conditionName/gradeScale, without failing the request, when risk-referral-service is unreachable', async () => {
      repository.findRiskConditionSummariesByBeneficiaryIds.mockResolvedValue([
        { beneficiaryId: 'ben-1', riskConditionSummaries: [summaryRow()] },
      ] as never);
      resolveRiskConditionsMock.mockRejectedValue(
        Object.assign(new Error('bad gateway'), { status: 502 }),
      );
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      const result = await service.getRiskConditionSummaryBatch(['ben-1'], caller(), AUTH_HEADER);

      expect(result[0].riskConditionSummaries[0]).toEqual(
        expect.objectContaining({
          conditionCode: null,
          conditionName: null,
          gradeScale: null,
        }),
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getRegistrationSummary', () => {
    it('scopes a SAKHI caller to their own cases', async () => {
      repository.countByCaseType.mockResolvedValue({
        total: 5,
        motherCount: 3,
        childCount: 2,
        totalActiveBeneficiaries: 5,
        activeMothersCount: 3,
        activeChildrenCount: 2,
        activeMothersHighRiskCount: 1,
        activeChildrenHighRiskCount: 0,
        activeMothersPercent: 60,
        activeChildrenPercent: 40,
      });

      const result = await service.getRegistrationSummary({}, caller(), AUTH_HEADER);

      expect(repository.countByCaseType).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiId: CALLER_ID }),
      );
      expect(result).toEqual({
        total: 5,
        motherCount: 3,
        childCount: 2,
        totalActiveBeneficiaries: 5,
        activeMothersCount: 3,
        activeChildrenCount: 2,
        activeMothersHighRiskCount: 1,
        activeChildrenHighRiskCount: 0,
        activeMothersPercent: 60,
        activeChildrenPercent: 40,
      });
    });

    it('scopes a SUPERVISOR caller to their roster', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);
      repository.countByCaseType.mockResolvedValue({
        total: 0,
        motherCount: 0,
        childCount: 0,
        totalActiveBeneficiaries: 0,
        activeMothersCount: 0,
        activeChildrenCount: 0,
        activeMothersHighRiskCount: 0,
        activeChildrenHighRiskCount: 0,
        activeMothersPercent: 0,
        activeChildrenPercent: 0,
      });

      await service.getRegistrationSummary({}, caller({ roles: ['SUPERVISOR'] }), AUTH_HEADER);

      expect(repository.countByCaseType).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiIds: ['sakhi-a', 'sakhi-b'] }),
      );
    });

    it('rejects a SUPERVISOR sakhiId outside their roster', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a']);

      await expect(
        service.getRegistrationSummary(
          { sakhiId: 'sakhi-outside' },
          caller({ roles: ['SUPERVISOR'] }),
          AUTH_HEADER,
        ),
      ).rejects.toThrow("sakhiId is not in this Supervisor's roster.");
    });

    it('leaves a MANAGER/ADMIN caller unscoped with no sakhiId filter', async () => {
      repository.countByCaseType.mockResolvedValue({
        total: 10,
        motherCount: 6,
        childCount: 4,
        totalActiveBeneficiaries: 10,
        activeMothersCount: 6,
        activeChildrenCount: 4,
        activeMothersHighRiskCount: 2,
        activeChildrenHighRiskCount: 1,
        activeMothersPercent: 60,
        activeChildrenPercent: 40,
      });

      await service.getRegistrationSummary({}, caller({ roles: ['MANAGER'] }), AUTH_HEADER);

      expect(repository.countByCaseType).toHaveBeenCalledWith(
        expect.not.objectContaining({ sakhiId: expect.anything() }),
      );
    });

    it('rejects fromDate after toDate', async () => {
      await expect(
        service.getRegistrationSummary(
          { fromDate: '2026-02-01', toDate: '2026-01-01' },
          caller(),
          AUTH_HEADER,
        ),
      ).rejects.toThrow('fromDate must be on or before toDate.');
    });

    it('rejects a SUPERVISOR caller with no project scope', async () => {
      await expect(
        service.getRegistrationSummary(
          {},
          caller({ roles: ['SUPERVISOR'], projectId: null }),
          AUTH_HEADER,
        ),
      ).rejects.toThrow('Supervisor caller has no project scope.');
    });

    it('passes through the active-beneficiary breakdown from the repository unchanged', async () => {
      repository.countByCaseType.mockResolvedValue({
        total: 10,
        motherCount: 6,
        childCount: 4,
        totalActiveBeneficiaries: 8,
        activeMothersCount: 5,
        activeChildrenCount: 3,
        activeMothersHighRiskCount: 2,
        activeChildrenHighRiskCount: 1,
        activeMothersPercent: 62.5,
        activeChildrenPercent: 37.5,
      });

      const result = await service.getRegistrationSummary({}, caller(), AUTH_HEADER);

      expect(result).toEqual({
        total: 10,
        motherCount: 6,
        childCount: 4,
        totalActiveBeneficiaries: 8,
        activeMothersCount: 5,
        activeChildrenCount: 3,
        activeMothersHighRiskCount: 2,
        activeChildrenHighRiskCount: 1,
        activeMothersPercent: 62.5,
        activeChildrenPercent: 37.5,
      });
    });
  });

  describe('getRiskSummary', () => {
    it('returns counts grouped by grade, scoped to the caller', async () => {
      repository.countByRiskGrade.mockResolvedValue({
        total: 3,
        byGrade: { HIGH: 2, NORMAL: 1 },
        everAtRiskCount: 2,
        referralTriggerCount: 1,
      });

      const result = await service.getRiskSummary({}, caller(), AUTH_HEADER);

      expect(repository.countByRiskGrade).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiId: CALLER_ID }),
      );
      expect(result.byGrade).toEqual({ HIGH: 2, NORMAL: 1 });
    });

    it('rejects fromDate after toDate', async () => {
      await expect(
        service.getRiskSummary(
          { fromDate: '2026-02-01', toDate: '2026-01-01' },
          caller(),
          AUTH_HEADER,
        ),
      ).rejects.toThrow('fromDate must be on or before toDate.');
    });
  });

  describe('upsertRiskConditionSummary', () => {
    const RISK_CONDITION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const dto = {
      riskConditionId: RISK_CONDITION_ID,
      phase: 'ANC' as const,
      grade: 'HIGH',
      gradeRank: 3,
      assessedAt: new Date('2026-01-01'),
      isReferralTrigger: true,
      isHrVisitTrigger: false,
      isFirstInstance: true,
      consecutiveNoImprovementCount: null,
    };

    it('404s when the beneficiary case does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.upsertRiskConditionSummary('unknown-id', dto, caller(), AUTH_HEADER),
      ).rejects.toThrow('Beneficiary case not found.');
    });

    it('403s when a SAKHI targets a beneficiary that is not their own', async () => {
      repository.findById.mockResolvedValue({ id: 'ben-1', sakhiId: 'someone-else' } as never);

      await expect(
        service.upsertRiskConditionSummary(
          'ben-1',
          dto,
          caller({ id: CALLER_ID, roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toThrow('This beneficiary case is outside your own roster.');
      expect(repository.upsertRiskConditionSummary).not.toHaveBeenCalled();
    });

    it('allows a SAKHI to upsert their own beneficiary', async () => {
      repository.findById.mockResolvedValue({ id: 'ben-1', sakhiId: CALLER_ID } as never);
      repository.upsertRiskConditionSummary.mockResolvedValue({} as never);

      await service.upsertRiskConditionSummary(
        'ben-1',
        dto,
        caller({ id: CALLER_ID, roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      expect(repository.upsertRiskConditionSummary).toHaveBeenCalled();
    });

    it("403s when a SUPERVISOR's roster does not include the beneficiary's Sakhi", async () => {
      repository.findById.mockResolvedValue({ id: 'ben-1', sakhiId: 'sakhi-outside' } as never);
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-inside']);

      await expect(
        service.upsertRiskConditionSummary(
          'ben-1',
          dto,
          caller({ roles: ['SUPERVISOR'] }),
          AUTH_HEADER,
        ),
      ).rejects.toThrow("This beneficiary case is outside this Supervisor's roster.");
      expect(repository.upsertRiskConditionSummary).not.toHaveBeenCalled();
    });

    it('allows a MANAGER/ADMIN caller unrestricted', async () => {
      repository.findById.mockResolvedValue({ id: 'ben-1', sakhiId: 'any-sakhi' } as never);
      repository.upsertRiskConditionSummary.mockResolvedValue({} as never);

      await service.upsertRiskConditionSummary(
        'ben-1',
        dto,
        caller({ roles: ['MANAGER'] }),
        AUTH_HEADER,
      );

      expect(repository.upsertRiskConditionSummary).toHaveBeenCalled();
    });

    it('passes through all fields to the repository upsert', async () => {
      repository.findById.mockResolvedValue({ id: 'ben-1', sakhiId: CALLER_ID } as never);
      repository.upsertRiskConditionSummary.mockResolvedValue({} as never);

      await service.upsertRiskConditionSummary(
        'ben-1',
        {
          ...dto,
          observedValueJson: { systolicBp: 145 },
          visitId: 'visit-1',
          submissionId: 'submission-1',
          ruleVersionId: 'rule-version-1',
        },
        caller({ id: CALLER_ID, roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      expect(repository.upsertRiskConditionSummary).toHaveBeenCalledWith(
        'ben-1',
        expect.objectContaining({
          riskConditionId: RISK_CONDITION_ID,
          grade: 'HIGH',
          gradeRank: 3,
          isReferralTrigger: true,
          isHrVisitTrigger: false,
        }),
      );
    });

    it('passes through null grade/gradeRank unchanged for an ungraded, self-reported entry', async () => {
      repository.findById.mockResolvedValue({ id: 'ben-1', sakhiId: CALLER_ID } as never);
      repository.upsertRiskConditionSummary.mockResolvedValue({} as never);

      await service.upsertRiskConditionSummary(
        'ben-1',
        {
          riskConditionId: RISK_CONDITION_ID,
          phase: 'REGISTRATION',
          assessedAt: new Date('2026-01-01'),
          isReferralTrigger: false,
          isHrVisitTrigger: false,
          isFirstInstance: true,
          consecutiveNoImprovementCount: null,
        },
        caller({ id: CALLER_ID, roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      expect(repository.upsertRiskConditionSummary).toHaveBeenCalledWith(
        'ben-1',
        expect.objectContaining({
          riskConditionId: RISK_CONDITION_ID,
          grade: null,
          gradeRank: null,
        }),
      );
    });
  });
});
