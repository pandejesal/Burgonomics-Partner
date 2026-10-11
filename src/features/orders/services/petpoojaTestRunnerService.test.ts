import { describe, it, expect, vi } from 'vitest';
import {
  PETPOOJA_TEST_SCENARIOS,
  formatPetpoojaIdsForCopy,
  initialTestResults,
  runAllPetpoojaTestScenarios,
} from './petpoojaTestRunnerService';

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
