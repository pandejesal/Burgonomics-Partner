import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Settlement API wire contract (owner decision 2026-11-20).
 *
 * Server contract (functions/src/index.ts settlement block +
 * modules/settlements/settlementRoutes.ts):
 *
 *   POST /settlements/generate   { branchId, monthKey }            201 statement
 *   POST /settlements/list       { monthKey, branchId?, allVersions? }
 *                              200 { monthKey, statements }
 *   POST /settlements/csv        { monthKey, branchId? }           200 text/csv
 *   POST /settlements/markPaid   { statementId, reference, paidOn, note? }
 *                              200 { statement, reused }
 *
 * Refusals arrive as JSON { code, error } — SETTLEMENT_FORBIDDEN (403),
 * SETTLEMENT_NONE (404), SETTLEMENT_INVALID_PAID_ON (400).
 */

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock('@/config/firebase', () => ({
  auth: { currentUser: null },
  getAppCheckToken: async () => null,
}));

import { ApiRequestError, partnerFunctionsApi } from '../src/services/partnerFunctionsApi';
import { downloadSettlementCsv } from '../src/features/settlements/settlementCsv';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function csvResponse(status: number, text: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-disposition'
          ? 'attachment; filename="settlements-2026-11.csv"'
          : name.toLowerCase() === 'content-type'
            ? 'text/csv; charset=utf-8'
            : null,
    },
    // A CSV success body is NOT JSON: parsing it would throw.
    json: async () => {
      throw new SyntaxError('not JSON');
    },
    text: async () => text,
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('POST /settlements/* wire contract', () => {
  it('generates a statement for a branch and month', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, { id: 'br_surat_2026-11_v001', netPayablePaise: 1080000 })
    );

    const res = await partnerFunctionsApi.generateSettlementStatement({
      branchId: 'br_surat',
      monthKey: '2026-11',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/settlements/generate');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ branchId: 'br_surat', monthKey: '2026-11' });
    expect(res.netPayablePaise).toBe(1080000);
  });

  it('lists the month, passing the version flag through', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { monthKey: '2026-11', statements: [] }));

    const res = await partnerFunctionsApi.listSettlements({
      monthKey: '2026-11',
      allVersions: true,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ monthKey: '2026-11', allVersions: true });
    expect(res.statements).toEqual([]);
  });

  it('records a payment with reference and date and never retries the write', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { statement: { id: 'br_surat_2026-11_v001' }, reused: false })
    );

    await partnerFunctionsApi.markSettlementPaid({
      statementId: 'br_surat_2026-11_v001',
      reference: 'NEFT-8891',
      paidOn: '2026-12-03',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).reference).toBe('NEFT-8891');
    expect(JSON.parse(String(init.body)).paidOn).toBe('2026-12-03');
    // A replay could append a duplicate payment line, so this call must not retry.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces the server code on a refusal instead of a bare status', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(403, {
        code: 'SETTLEMENT_FORBIDDEN',
        error: 'Forbidden: only owner and brand roles may record a settlement payment',
      })
    );

    await expect(
      partnerFunctionsApi.markSettlementPaid({
        statementId: 'br_surat_2026-11_v001',
        reference: 'X',
        paidOn: '2026-12-03',
      })
    ).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 403,
      code: 'SETTLEMENT_FORBIDDEN',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('POST /settlements/csv', () => {
  it('downloads the CSV body as text (never parsed as JSON) with the server filename', async () => {
    fetchMock.mockResolvedValue(csvResponse(200, '"Statement ID","Branch"\r\n"b1","Surat"'));

    const res = await downloadSettlementCsv({ monthKey: '2026-11' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/settlements/csv');
    expect(JSON.parse(String(init.body))).toEqual({ monthKey: '2026-11' });
    expect(res.filename).toBe('settlements-2026-11.csv');
    expect(res.csv).toContain('Statement ID');
    expect(res.csv).not.toContain('{"');
  });

  it('reports an empty month as SETTLEMENT_NONE, with the server explanation', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, {
        code: 'SETTLEMENT_NONE',
        error: 'No settlement statements exist for 2026-11 in your scope',
      })
    );

    const failure = downloadSettlementCsv({ monthKey: '2026-11' });
    await expect(failure).rejects.toBeInstanceOf(ApiRequestError);
    await expect(failure).rejects.toMatchObject({
      code: 'SETTLEMENT_NONE',
      message: 'No settlement statements exist for 2026-11 in your scope',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
