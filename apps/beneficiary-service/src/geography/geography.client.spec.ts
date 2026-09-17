import {
  getAncestorChain,
  resolveGeographyCodesForBlock,
  resolveHealthBlockIdFromPhc,
  resolvePadaUnits,
  resolveVillageNames,
} from './geography.client';

/** Builds a fetch mock Response for a list of geography units. */
function listResponse(data: Record<string, unknown>[]) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data }),
  };
}

/** Builds a fetch mock Response for one geography unit. */
function unitResponse(data: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data }),
  };
}

const activePhc = {
  geographyUnitId: 'phc-1',
  parentId: 'block-1',
  geoType: 'PHC',
  status: 'ACTIVE',
};
const activeBlock = {
  geographyUnitId: 'block-1',
  parentId: 'district-1',
  geoType: 'BLOCK',
  status: 'ACTIVE',
};

describe('resolveHealthBlockIdFromPhc', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("resolves the PHC's parent BLOCK as the Health Block id", async () => {
    // First call → the PHC; second call → its parent (verified to be a BLOCK).
    fetchMock
      .mockResolvedValueOnce(unitResponse(activePhc))
      .mockResolvedValueOnce(unitResponse(activeBlock));

    const result = await resolveHealthBlockIdFromPhc('phc-1', 'Bearer test-token');

    expect(result).toBe('block-1');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/geography-units/phc-1'),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/geography-units/block-1'),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('throws 422 when the geography unit is not found (404 from auth-service)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await expect(
      resolveHealthBlockIdFromPhc('missing-phc', 'Bearer test-token'),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('throws 502 (not 404) when the auth-service call fails with a 5xx', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(resolveHealthBlockIdFromPhc('phc-1', 'Bearer test-token')).rejects.toMatchObject({
      status: 502,
    });
  });

  it('throws 502 when the auth-service call rejects (network error/timeout)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(resolveHealthBlockIdFromPhc('phc-1', 'Bearer test-token')).rejects.toMatchObject({
      status: 502,
    });
  });

  it('throws 422 when the resolved unit is not PHC-level', async () => {
    fetchMock.mockResolvedValue(
      unitResponse({
        geographyUnitId: 'village-1',
        parentId: 'pada-1',
        geoType: 'VILLAGE',
        status: 'ACTIVE',
      }),
    );

    await expect(
      resolveHealthBlockIdFromPhc('village-1', 'Bearer test-token'),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('throws 422 when the PHC is inactive', async () => {
    fetchMock.mockResolvedValue(unitResponse({ ...activePhc, status: 'INACTIVE' }));

    await expect(resolveHealthBlockIdFromPhc('phc-1', 'Bearer test-token')).rejects.toMatchObject({
      status: 422,
    });
  });

  it('throws 422 when the PHC has no parent Health Block on record', async () => {
    fetchMock.mockResolvedValue(unitResponse({ ...activePhc, parentId: null }));

    await expect(resolveHealthBlockIdFromPhc('phc-1', 'Bearer test-token')).rejects.toMatchObject({
      status: 422,
    });
  });

  it('throws 422 when the PHC parent is not a BLOCK unit (data-entry error)', async () => {
    fetchMock.mockResolvedValueOnce(unitResponse(activePhc)).mockResolvedValueOnce(
      unitResponse({
        geographyUnitId: 'block-1',
        parentId: 'district-1',
        geoType: 'DISTRICT',
        status: 'ACTIVE',
      }),
    );

    await expect(resolveHealthBlockIdFromPhc('phc-1', 'Bearer test-token')).rejects.toMatchObject({
      status: 422,
    });
  });

  it('throws 422 when the parent Health Block is inactive', async () => {
    fetchMock
      .mockResolvedValueOnce(unitResponse(activePhc))
      .mockResolvedValueOnce(unitResponse({ ...activeBlock, status: 'INACTIVE' }));

    await expect(resolveHealthBlockIdFromPhc('phc-1', 'Bearer test-token')).rejects.toMatchObject({
      status: 422,
    });
  });
});

describe('resolveGeographyCodesForBlock', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  const activeState = {
    geographyUnitId: 'state-1',
    parentId: null,
    geoType: 'STATE',
    status: 'ACTIVE',
    geoCode: 'MH',
  };
  const activeDistrict = {
    geographyUnitId: 'district-1',
    parentId: 'state-1',
    geoType: 'DISTRICT',
    status: 'ACTIVE',
    geoCode: 'NANDURBAR',
  };
  const activeBlockWithCode = {
    ...activeBlock,
    geoCode: 'DHADGAON',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('resolves the State/District/Block geoCode triple, walking parentId up from the Block', async () => {
    fetchMock
      .mockResolvedValueOnce(unitResponse(activeBlockWithCode))
      .mockResolvedValueOnce(unitResponse(activeDistrict))
      .mockResolvedValueOnce(unitResponse(activeState));

    const result = await resolveGeographyCodesForBlock('block-1', 'Bearer test-token');

    expect(result).toEqual({ stateCode: 'MH', districtCode: 'NANDURBAR', blockCode: 'DHADGAON' });
  });

  it('throws 422 when the resolved unit is not BLOCK-level', async () => {
    fetchMock.mockResolvedValue(unitResponse({ ...activeBlockWithCode, geoType: 'PHC' }));

    await expect(
      resolveGeographyCodesForBlock('block-1', 'Bearer test-token'),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('throws 422 when the Block has no geoCode set', async () => {
    fetchMock.mockResolvedValue(unitResponse({ ...activeBlockWithCode, geoCode: null }));

    await expect(
      resolveGeographyCodesForBlock('block-1', 'Bearer test-token'),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('throws 422 when the District parent is missing', async () => {
    fetchMock.mockResolvedValue(unitResponse({ ...activeBlockWithCode, parentId: null }));

    await expect(
      resolveGeographyCodesForBlock('block-1', 'Bearer test-token'),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('throws 422 when the District parent is not DISTRICT-level', async () => {
    fetchMock
      .mockResolvedValueOnce(unitResponse(activeBlockWithCode))
      .mockResolvedValueOnce(unitResponse({ ...activeDistrict, geoType: 'BLOCK' }));

    await expect(
      resolveGeographyCodesForBlock('block-1', 'Bearer test-token'),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('throws 422 when the District has no geoCode set', async () => {
    fetchMock
      .mockResolvedValueOnce(unitResponse(activeBlockWithCode))
      .mockResolvedValueOnce(unitResponse({ ...activeDistrict, geoCode: null }));

    await expect(
      resolveGeographyCodesForBlock('block-1', 'Bearer test-token'),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('throws 422 when the State parent is missing', async () => {
    fetchMock
      .mockResolvedValueOnce(unitResponse(activeBlockWithCode))
      .mockResolvedValueOnce(unitResponse({ ...activeDistrict, parentId: null }));

    await expect(
      resolveGeographyCodesForBlock('block-1', 'Bearer test-token'),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('throws 422 when the State parent is not STATE-level', async () => {
    fetchMock
      .mockResolvedValueOnce(unitResponse(activeBlockWithCode))
      .mockResolvedValueOnce(unitResponse(activeDistrict))
      .mockResolvedValueOnce(unitResponse({ ...activeState, geoType: 'DISTRICT' }));

    await expect(
      resolveGeographyCodesForBlock('block-1', 'Bearer test-token'),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('throws 422 when the State has no geoCode set', async () => {
    fetchMock
      .mockResolvedValueOnce(unitResponse(activeBlockWithCode))
      .mockResolvedValueOnce(unitResponse(activeDistrict))
      .mockResolvedValueOnce(unitResponse({ ...activeState, geoCode: null }));

    await expect(
      resolveGeographyCodesForBlock('block-1', 'Bearer test-token'),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('throws 502 when the auth-service call fails with a 5xx', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      resolveGeographyCodesForBlock('block-1', 'Bearer test-token'),
    ).rejects.toMatchObject({ status: 502 });
  });
});

describe('resolveVillageNames', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns a geographyUnitId -> name map for every VILLAGE unit', async () => {
    fetchMock.mockResolvedValue(
      listResponse([
        { geographyUnitId: 'village-1', name: 'Sample Village', geoType: 'VILLAGE' },
        { geographyUnitId: 'village-2', name: 'Other Village', geoType: 'VILLAGE' },
      ]),
    );

    const result = await resolveVillageNames('Bearer test-token');

    expect(result).toEqual(
      new Map([
        ['village-1', 'Sample Village'],
        ['village-2', 'Other Village'],
      ]),
    );
  });

  it('a villageId absent from the response is simply absent from the map', async () => {
    fetchMock.mockResolvedValue(listResponse([]));

    const result = await resolveVillageNames('Bearer test-token');

    expect(result.get('unknown-village')).toBeUndefined();
  });

  it('throws 502 when the auth-service call rejects (network error/timeout)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(resolveVillageNames('Bearer test-token')).rejects.toMatchObject({ status: 502 });
  });

  it('throws 502 when the auth-service call fails with a non-2xx response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(resolveVillageNames('Bearer test-token')).rejects.toMatchObject({ status: 502 });
  });

  it('filters by geoType=VILLAGE', async () => {
    fetchMock.mockResolvedValue(listResponse([]));

    await resolveVillageNames('Bearer test-token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('geoType=VILLAGE'),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });
});

describe('resolvePadaUnits', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns a geographyUnitId -> {name, parentId} map for every PADA unit', async () => {
    fetchMock.mockResolvedValue(
      listResponse([
        { geographyUnitId: 'pada-1', name: 'Sample Pada', parentId: 'village-1', geoType: 'PADA' },
        { geographyUnitId: 'pada-2', name: 'Other Pada', parentId: 'village-2', geoType: 'PADA' },
      ]),
    );

    const result = await resolvePadaUnits('Bearer test-token');

    expect(result).toEqual(
      new Map([
        ['pada-1', { name: 'Sample Pada', parentId: 'village-1' }],
        ['pada-2', { name: 'Other Pada', parentId: 'village-2' }],
      ]),
    );
  });

  it('a padaId absent from the response is simply absent from the map', async () => {
    fetchMock.mockResolvedValue(listResponse([]));

    const result = await resolvePadaUnits('Bearer test-token');

    expect(result.get('unknown-pada')).toBeUndefined();
  });

  it('throws 502 when the auth-service call rejects (network error/timeout)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(resolvePadaUnits('Bearer test-token')).rejects.toMatchObject({ status: 502 });
  });

  it('throws 502 when the auth-service call fails with a non-2xx response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(resolvePadaUnits('Bearer test-token')).rejects.toMatchObject({ status: 502 });
  });

  it('filters by geoType=PADA', async () => {
    fetchMock.mockResolvedValue(listResponse([]));

    await resolvePadaUnits('Bearer test-token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('geoType=PADA'),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });
});

describe('getAncestorChain', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns the ancestor chain ordered from the unit up to STATE', async () => {
    const chain = [
      { geographyUnitId: 'village-1', parentId: 'block-1', geoType: 'VILLAGE' },
      { geographyUnitId: 'block-1', parentId: 'district-1', geoType: 'BLOCK' },
      { geographyUnitId: 'district-1', parentId: 'state-1', geoType: 'DISTRICT' },
      { geographyUnitId: 'state-1', parentId: null, geoType: 'STATE' },
    ];
    fetchMock.mockResolvedValue(listResponse(chain));

    const result = await getAncestorChain('village-1', 'Bearer test-token');

    expect(result).toEqual(chain);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/geography-units/village-1/ancestors'),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('throws 422 when the target geography unit is not found (404 from auth-service)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await expect(getAncestorChain('missing-unit', 'Bearer test-token')).rejects.toMatchObject({
      status: 422,
    });
  });

  it('throws 502 when the auth-service call rejects (network error/timeout)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(getAncestorChain('village-1', 'Bearer test-token')).rejects.toMatchObject({
      status: 502,
    });
  });

  it('throws 502 when the auth-service call fails with a non-404 non-2xx response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(getAncestorChain('village-1', 'Bearer test-token')).rejects.toMatchObject({
      status: 502,
    });
  });
});
