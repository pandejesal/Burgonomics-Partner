import { describe, it, expect, vi, beforeEach } from 'vitest';
import { partnerFunctionsApi } from '@/services/partnerFunctionsApi';
import {
  PETPOOJA_TEST_SCENARIOS,
  defaultTestScenarioRunner,
  formatPetpoojaIdsForCopy,
  initialTestResults,
  runAllPetpoojaTestScenarios,
} from './petpoojaTestRunnerService';

// The live Functions contract (functions/src/modules/petpooja/testRunner.ts)
// answers { success:true, petpoojaOrderId: string|null, petpoojaOrderIdReturned }.
// `petpoojaOrderId:null` means the POS ACCEPTED the relay without returning an
// id — Petpooja's save_order does this in the real sandbox. Mock the API module
// so the default runner (not an injected stub) is under test.
vi.mock('@/services/partnerFunctionsApi', () => ({
  partnerFunctionsApi: {
    runPetpoojaTestScenario: vi.fn(),
  },
}));

const runPetpoojaTestScenarioMock = vi.mocked(
  partnerFunctionsApi.runPetpoojaTestScenario,
);

beforeEach(() => {
  runPetpoojaTestScenarioMock.mockReset();
});

describe('Petpooja test runner service', () => {
  it('defines exactly 5 test scenarios', () => {
    expect(PETPOOJA_TEST_SCENARIOS).toHaveLength(5);
    const ids = PETPOOJA_TEST_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('starts every scenario at Pending', () => {
    const results = initialTestResults();
    expect(results).toHaveLength(5);
    expect(results.every((r) => r.status === 'Pending')).toBe(true);
    expect(results.every((r) => r.petpoojaOrderId === null)).toBe(true);
  });

  it('relays Pending -> Relaying -> Fulfilled and collects Petpooja Order IDs', async () => {
    const seen: string[][] = [];
    const runner = vi.fn(async (scenarioId: string) => ({
      petpoojaOrderId: `PP-TEST-${scenarioId.toUpperCase().slice(0, 4)}`,
    }));

    const finalResults = await runAllPetpoojaTestScenarios({
      runner,
      onUpdate: (next) => seen.push(next.map((r) => r.status)),
    });

    expect(runner).toHaveBeenCalledTimes(5);
    expect(finalResults.every((r) => r.status === 'Fulfilled')).toBe(true);
    expect(finalResults.every((r) => !!r.petpoojaOrderId)).toBe(true);
    // Lifecycle observed live: every scenario passed through Relaying.
    const flat = seen.flat();
    expect(flat).toContain('Relaying');
    expect(flat).toContain('Fulfilled');
  });

  it('marks relay failures as Failed without dropping the remaining scenarios', async () => {
    const runner = vi.fn(async (scenarioId: string) => {
      if (scenarioId === PETPOOJA_TEST_SCENARIOS[1].id) throw new Error('POS timeout');
      return { petpoojaOrderId: `PP-TEST-${scenarioId}` };
    });

    const finalResults = await runAllPetpoojaTestScenarios({ runner });

    expect(finalResults[1].status).toBe('Failed');
    expect(finalResults[1].error).toContain('POS timeout');
    expect(finalResults.filter((r) => r.status === 'Fulfilled')).toHaveLength(4);
  });

  it('formats fulfilled IDs as copy-ready lines for the support email', async () => {
    const runner = vi.fn(async (scenarioId: string) => ({
      petpoojaOrderId: `PP-TEST-${scenarioId}`,
    }));
    const finalResults = await runAllPetpoojaTestScenarios({ runner });

    const text = formatPetpoojaIdsForCopy(finalResults);
    const lines = text.split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain(PETPOOJA_TEST_SCENARIOS[0].id);
    expect(lines[0]).toContain('PP-TEST-');
  });

  it('formats an empty string when nothing fulfilled yet', () => {
    expect(formatPetpoojaIdsForCopy(initialTestResults())).toBe('');
  });
});

describe('defaultTestScenarioRunner — POS-accepted-without-id honesty contract', () => {
  it('returns the id when the POS returns one', async () => {
    runPetpoojaTestScenarioMock.mockResolvedValueOnce({
      success: true,
      scenarioId: 'dinein-basic-kot',
      petpoojaOrderId: 'PP-123',
    } as never);
    await expect(defaultTestScenarioRunner('dinein-basic-kot')).resolves.toEqual({
      petpoojaOrderId: 'PP-123',
    });
  });

  it('does NOT throw on the documented accepted-without-id response (petpoojaOrderId null)', async () => {
    // Real sandbox norm: /petpooja/testRunner answers success:true with
    // petpoojaOrderId:null (POS registered the order, returned no id).
    // Reporting this as a failure is a false negative — the old code threw.
    runPetpoojaTestScenarioMock.mockResolvedValueOnce({
      success: true,
      scenarioId: 'dinein-basic-kot',
      petpoojaOrderId: null,
      petpoojaOrderIdReturned: false,
    } as never);
    await expect(defaultTestScenarioRunner('dinein-basic-kot')).resolves.toEqual({
      petpoojaOrderId: null,
    });
  });

  it('does NOT throw when the legacy field is simply absent but success is true', async () => {
    runPetpoojaTestScenarioMock.mockResolvedValueOnce({
      success: true,
      scenarioId: 'delivery-gst-fee',
    } as never);
    await expect(defaultTestScenarioRunner('delivery-gst-fee')).resolves.toEqual({
      petpoojaOrderId: null,
    });
  });

  it('still throws when the relay is reported as not accepted (success !== true)', async () => {
    runPetpoojaTestScenarioMock.mockResolvedValueOnce({
      success: false,
      scenarioId: 'cancel-refund-sync',
    } as never);
    await expect(defaultTestScenarioRunner('cancel-refund-sync')).rejects.toThrow(
      /did not accept/i,
    );
  });

  it('truthy numeric/string success spellings count as acceptance', async () => {
    // Mirrors the server's own accepted set (success "1" | 1 | true | status "success").
    runPetpoojaTestScenarioMock.mockResolvedValueOnce({
      success: '1',
      scenarioId: 'delivery-gst-fee',
    } as never);
    await expect(defaultTestScenarioRunner('delivery-gst-fee')).resolves.toEqual({
      petpoojaOrderId: null,
    });
  });

  it('an id present on a body without success is accepted with that id', async () => {
    runPetpoojaTestScenarioMock.mockResolvedValueOnce({
      petpoojaOrderId: 'PP-9',
    } as never);
    await expect(defaultTestScenarioRunner('dinein-basic-kot')).resolves.toEqual({
      petpoojaOrderId: 'PP-9',
    });
  });

  it('a whitespace-only id is treated as no id, not as a present id', async () => {
    runPetpoojaTestScenarioMock.mockResolvedValueOnce({
      success: true,
      petpoojaOrderId: '   ',
    } as never);
    await expect(defaultTestScenarioRunner('bulk-party-order')).resolves.toEqual({
      petpoojaOrderId: null,
    });
  });

  it('an explicit refusal throws even if the body carries an id string', async () => {
    // Acceptance is the server's say — an id on a success:false body is ignored.
    runPetpoojaTestScenarioMock.mockResolvedValueOnce({
      success: false,
      scenarioId: 'cancel-refund-sync',
      petpoojaOrderId: 'PP-suspicious',
    } as never);
    await expect(defaultTestScenarioRunner('cancel-refund-sync')).rejects.toThrow(
      /did not accept/i,
    );
  });

  it('refusal spellings success 0 / "0" still throw even with an id', async () => {
    runPetpoojaTestScenarioMock.mockResolvedValueOnce({
      success: 0,
      petpoojaOrderId: 'PP-suspicious',
    } as never);
    await expect(defaultTestScenarioRunner('cancel-refund-sync')).rejects.toThrow(
      /did not accept/i,
    );
    runPetpoojaTestScenarioMock.mockResolvedValueOnce({
      success: '0',
    } as never);
    await expect(defaultTestScenarioRunner('cancel-refund-sync')).rejects.toThrow(
      /did not accept/i,
    );
  });

  it('still throws on an empty/unexpected body (fail-closed)', async () => {
    runPetpoojaTestScenarioMock.mockResolvedValueOnce(null as never);
    await expect(defaultTestScenarioRunner('bulk-party-order')).rejects.toThrow(/no response|failed/i);
  });

  it('still throws when the API transport rejects', async () => {
    runPetpoojaTestScenarioMock.mockRejectedValueOnce(new Error('HTTP 502 from /petpooja/testRunner'));
    await expect(defaultTestScenarioRunner('bulk-party-order')).rejects.toThrow(
      'HTTP 502 from /petpooja/testRunner',
    );
  });

  it('runAllPetpoojaTestScenarios marks an accepted-no-id relay Fulfilled with a null id', async () => {
    const runner = vi.fn(async () => ({ petpoojaOrderId: null }));
    const finalResults = await runAllPetpoojaTestScenarios({ runner });
    expect(finalResults.every((r) => r.status === 'Fulfilled')).toBe(true);
    expect(finalResults.every((r) => r.petpoojaOrderId === null)).toBe(true);
    // The copy-ready support list must not invent or include a null id.
    expect(formatPetpoojaIdsForCopy(finalResults)).toBe('');
  });

  it('runAllPetpoojaTestScenarios keeps mixing real ids and accepted-no-id outcomes', async () => {
    const runner = vi.fn(async (scenarioId: string) =>
      scenarioId === PETPOOJA_TEST_SCENARIOS[0].id
        ? { petpoojaOrderId: 'PP-1' }
        : { petpoojaOrderId: null },
    );
    const finalResults = await runAllPetpoojaTestScenarios({ runner });
    expect(finalResults[0].petpoojaOrderId).toBe('PP-1');
    expect(finalResults[1].status).toBe('Fulfilled');
    expect(finalResults[1].petpoojaOrderId).toBeNull();
    expect(formatPetpoojaIdsForCopy(finalResults)).toBe(
      `${PETPOOJA_TEST_SCENARIOS[0].id}: PP-1`,
    );
  });

  it('a loosely-shaped runner result (no id key) normalises to null, never undefined', async () => {
    const runner = vi.fn(async () => ({}) as { petpoojaOrderId: string | null });
    const finalResults = await runAllPetpoojaTestScenarios({ runner });
    expect(finalResults.every((r) => r.status === 'Fulfilled')).toBe(true);
    expect(finalResults.every((r) => r.petpoojaOrderId === null)).toBe(true);
  });
});
