import { assertCallerOwnsBeneficiary } from './beneficiaryOwnership.guard';
import { findBeneficiaryOwnership } from './beneficiary.client';
import { listSakhiIdsForSupervisor } from '../sakhis/sakhi.client';

jest.mock('./beneficiary.client');
jest.mock('../sakhis/sakhi.client');

describe('assertCallerOwnsBeneficiary', () => {
  const AUTH_HEADER = 'Bearer test-token';
  const findBeneficiaryOwnershipMock = jest.mocked(findBeneficiaryOwnership);
  const listSakhiIdsForSupervisorMock = jest.mocked(listSakhiIdsForSupervisor);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('throws not-found when the beneficiary case does not exist', async () => {
    findBeneficiaryOwnershipMock.mockResolvedValue(null);

    await expect(
      assertCallerOwnsBeneficiary('ben-1', { id: 'sakhi-1', roles: ['SAKHI'] }, AUTH_HEADER),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('resolves silently for a SAKHI who owns the case', async () => {
    findBeneficiaryOwnershipMock.mockResolvedValue({
      id: 'ben-1',
      sakhiId: 'sakhi-1',
      caseType: 'MOTHER',
    });

    await expect(
      assertCallerOwnsBeneficiary('ben-1', { id: 'sakhi-1', roles: ['SAKHI'] }, AUTH_HEADER),
    ).resolves.toBeUndefined();
    expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
  });

  it('rejects a SAKHI whose id does not match the case owner', async () => {
    findBeneficiaryOwnershipMock.mockResolvedValue({
      id: 'ben-1',
      sakhiId: 'sakhi-owner',
      caseType: 'MOTHER',
    });

    await expect(
      assertCallerOwnsBeneficiary('ben-1', { id: 'sakhi-other', roles: ['SAKHI'] }, AUTH_HEADER),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('resolves for a SUPERVISOR whose roster includes the case owner', async () => {
    findBeneficiaryOwnershipMock.mockResolvedValue({
      id: 'ben-1',
      sakhiId: 'sakhi-1',
      caseType: 'MOTHER',
    });
    listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-1', 'sakhi-2']);

    await expect(
      assertCallerOwnsBeneficiary(
        'ben-1',
        { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'project-1' },
        AUTH_HEADER,
      ),
    ).resolves.toBeUndefined();
    expect(listSakhiIdsForSupervisorMock).toHaveBeenCalledWith(
      'project-1',
      'supervisor-1',
      AUTH_HEADER,
    );
  });

  it('rejects a SUPERVISOR whose roster does not include the case owner', async () => {
    findBeneficiaryOwnershipMock.mockResolvedValue({
      id: 'ben-1',
      sakhiId: 'sakhi-1',
      caseType: 'MOTHER',
    });
    listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-other']);

    await expect(
      assertCallerOwnsBeneficiary(
        'ben-1',
        { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'project-1' },
        AUTH_HEADER,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects a SUPERVISOR with no project scope, without calling listSakhiIdsForSupervisor', async () => {
    findBeneficiaryOwnershipMock.mockResolvedValue({
      id: 'ben-1',
      sakhiId: 'sakhi-1',
      caseType: 'MOTHER',
    });

    await expect(
      assertCallerOwnsBeneficiary(
        'ben-1',
        { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: null },
        AUTH_HEADER,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
  });

  it.each(['MANAGER', 'ADMIN'])(
    'resolves unrestricted for a %s caller, without a roster lookup',
    async (role) => {
      findBeneficiaryOwnershipMock.mockResolvedValue({
        id: 'ben-1',
        sakhiId: 'sakhi-1',
        caseType: 'MOTHER',
      });

      await expect(
        assertCallerOwnsBeneficiary('ben-1', { id: 'user-1', roles: [role] }, AUTH_HEADER),
      ).resolves.toBeUndefined();
      expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
    },
  );
});
