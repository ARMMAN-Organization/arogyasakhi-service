import type { AuthenticatedUser } from '@armman/service-commons';
import { EscalationsBySakhiService } from './escalations-by-sakhi.service';
import type { EscalationsBySakhiRepository } from './escalations-by-sakhi.repository';
import { BeneficiaryClient } from './beneficiary.client';
import { listSakhiIdsForSupervisor } from './sakhi.client';

jest.mock('./sakhi.client');

const SAKHI_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_SAKHI_ID = '22222222-2222-2222-2222-222222222222';
const BENEFICIARY_A = '33333333-3333-3333-3333-333333333333';
const BENEFICIARY_B = '44444444-4444-4444-4444-444444444444';
const AUTH_HEADER = 'Bearer test-token';

function caller(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: SAKHI_ID,
    roles: ['ADMIN'],
    projectId: null,
    geographyUnitId: null,
    ...overrides,
  };
}

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'escalation-1',
    beneficiaryId: BENEFICIARY_A,
    escalationType: 'CLOSURE_PENDING',
    status: 'OPEN',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  } as unknown as Awaited<
    ReturnType<EscalationsBySakhiRepository['findOpenByBeneficiaryIdsAndTypes']>
  >[number];
}

describe('EscalationsBySakhiService', () => {
  const repository = {
    findOpenByBeneficiaryIdsAndTypes: jest.fn(),
  } as unknown as jest.Mocked<EscalationsBySakhiRepository>;
  const beneficiaryClient = {
    getIds: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryClient>;
  const listSakhiIdsForSupervisorMock = jest.mocked(listSakhiIdsForSupervisor);
  let service: EscalationsBySakhiService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new EscalationsBySakhiService(repository, beneficiaryClient);
  });

  describe('scoping', () => {
    it('allows a SAKHI caller requesting her own sakhiId', async () => {
      beneficiaryClient.getIds.mockResolvedValue([]);

      await expect(
        service.getEscalationsBySakhi(
          SAKHI_ID,
          ['CLOSURE_PENDING'],
          caller({ id: SAKHI_ID, roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).resolves.toEqual({ cards: [] });
    });

    it('rejects a SAKHI caller requesting a different sakhiId', async () => {
      await expect(
        service.getEscalationsBySakhi(
          OTHER_SAKHI_ID,
          ['CLOSURE_PENDING'],
          caller({ id: SAKHI_ID, roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(beneficiaryClient.getIds).not.toHaveBeenCalled();
    });

    it('allows a SUPERVISOR caller requesting a sakhiId on their roster', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue([SAKHI_ID]);
      beneficiaryClient.getIds.mockResolvedValue([]);

      await expect(
        service.getEscalationsBySakhi(
          SAKHI_ID,
          ['CLOSURE_PENDING'],
          caller({ roles: ['SUPERVISOR'], projectId: 'project-1' }),
          AUTH_HEADER,
        ),
      ).resolves.toEqual({ cards: [] });
    });

    it('rejects a SUPERVISOR caller requesting a sakhiId outside their roster', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue([OTHER_SAKHI_ID]);

      await expect(
        service.getEscalationsBySakhi(
          SAKHI_ID,
          ['CLOSURE_PENDING'],
          caller({ roles: ['SUPERVISOR'], projectId: 'project-1' }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(beneficiaryClient.getIds).not.toHaveBeenCalled();
    });

    it('rejects a SUPERVISOR caller with no projectId', async () => {
      await expect(
        service.getEscalationsBySakhi(
          SAKHI_ID,
          ['CLOSURE_PENDING'],
          caller({ roles: ['SUPERVISOR'], projectId: null }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
    });

    it.each(['MANAGER', 'ADMIN'] as const)(
      'allows a %s caller to query any sakhiId without a roster check',
      async (role) => {
        beneficiaryClient.getIds.mockResolvedValue([]);

        await expect(
          service.getEscalationsBySakhi(
            SAKHI_ID,
            ['CLOSURE_PENDING'],
            caller({ roles: [role] }),
            AUTH_HEADER,
          ),
        ).resolves.toEqual({ cards: [] });
        expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
      },
    );
  });

  describe('results', () => {
    it('returns an empty list (not an error) when the sakhi has no beneficiaries', async () => {
      beneficiaryClient.getIds.mockResolvedValue([]);

      const result = await service.getEscalationsBySakhi(
        SAKHI_ID,
        ['CLOSURE_PENDING'],
        caller(),
        AUTH_HEADER,
      );

      expect(result).toEqual({ cards: [] });
      expect(repository.findOpenByBeneficiaryIdsAndTypes).not.toHaveBeenCalled();
    });

    it('returns an empty list when beneficiaries exist but none have a matching escalation', async () => {
      beneficiaryClient.getIds.mockResolvedValue([BENEFICIARY_A, BENEFICIARY_B]);
      repository.findOpenByBeneficiaryIdsAndTypes.mockResolvedValue([]);

      const result = await service.getEscalationsBySakhi(
        SAKHI_ID,
        ['CLOSURE_PENDING'],
        caller(),
        AUTH_HEADER,
      );

      expect(result).toEqual({ cards: [] });
    });

    it('maps repository rows onto cards, filtered by the requested types', async () => {
      beneficiaryClient.getIds.mockResolvedValue([BENEFICIARY_A]);
      repository.findOpenByBeneficiaryIdsAndTypes.mockResolvedValue([
        row(),
        row({
          id: 'escalation-2',
          escalationType: 'DELIVERY_FORM_PENDING',
          createdAt: new Date('2026-06-02T00:00:00.000Z'),
        }),
      ]);

      const result = await service.getEscalationsBySakhi(
        SAKHI_ID,
        ['CLOSURE_PENDING', 'DELIVERY_FORM_PENDING'],
        caller(),
        AUTH_HEADER,
      );

      expect(repository.findOpenByBeneficiaryIdsAndTypes).toHaveBeenCalledWith(
        [BENEFICIARY_A],
        ['CLOSURE_PENDING', 'DELIVERY_FORM_PENDING'],
      );
      expect(result).toEqual({
        cards: [
          {
            cardId: 'escalation-1',
            beneficiaryId: BENEFICIARY_A,
            escalationType: 'CLOSURE_PENDING',
            status: 'OPEN',
            raisedAt: '2026-06-01T00:00:00.000Z',
          },
          {
            cardId: 'escalation-2',
            beneficiaryId: BENEFICIARY_A,
            escalationType: 'DELIVERY_FORM_PENDING',
            status: 'OPEN',
            raisedAt: '2026-06-02T00:00:00.000Z',
          },
        ],
      });
    });

    it('propagates a beneficiary-service failure (e.g. unreachable) as-is', async () => {
      beneficiaryClient.getIds.mockRejectedValue(
        Object.assign(new Error('bad gateway'), { status: 502 }),
      );

      await expect(
        service.getEscalationsBySakhi(SAKHI_ID, ['CLOSURE_PENDING'], caller(), AUTH_HEADER),
      ).rejects.toMatchObject({ status: 502 });
    });
  });
});
