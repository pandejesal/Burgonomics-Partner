/**
 * Petpooja test runner service — the 5-scenario onboarding relay suite.
 *
 * Each scenario relays a synthetic order through POST /petpooja/testRunner
 * (see partnerFunctionsApi.runPetpoojaTestScenario) and returns the
 * Petpooja-side order id that support needs for reconciliation.
 * Status lifecycle per scenario: Pending -> Relaying -> Fulfilled (or Failed
 * on relay error — never a silent skip).
 */
import { partnerFunctionsApi } from '@/services/partnerFunctionsApi';

export type PetpoojaTestStatus = 'Pending' | 'Relaying' | 'Fulfilled' | 'Failed';

export interface PetpoojaTestScenario {
  id: string;
  title: string;
  description: string;
}

export interface PetpoojaTestResult {
  scenarioId: string;
  title: string;
  status: PetpoojaTestStatus;
  petpoojaOrderId: string | null;
  error: string | null;
}

export const PETPOOJA_TEST_SCENARIOS: PetpoojaTestScenario[] = [
  {
    id: 'dinein-basic-kot',
    title: 'Dine-in basic KOT relay',
    description: 'Single veg burger + fries, dine-in table T-01.',
  },
  {
    id: 'takeaway-with-modifiers',
    title: 'Takeaway with addons',
    description: 'Burger with extra cheese + brioche bun modifiers.',
  },
  {
    id: 'delivery-gst-fee',
    title: 'Delivery GST + fee split',
    description: 'Delivery order with 5% GST and delivery fee math.',
  },
  {
    id: 'cancel-refund-sync',
    title: 'Cancel + refund sync',
    description: 'Cancelled order relays refund reconciliation to POS.',
  },
  {
    id: 'bulk-party-order',
    title: 'Bulk party order relay',
    description: 'High-quantity stress order (10+ lines) for POS load.',
  },
];

export type TestScenarioRunner = (scenarioId: string) => Promise<{ petpoojaOrderId: string }>;

/** Default runner — live test runner API. Throws when no order id returns. */
export const defaultTestScenarioRunner: TestScenarioRunner = async (scenarioId) => {
  const res = await partnerFunctionsApi.runPetpoojaTestScenario({ scenarioId });
  const petpoojaOrderId = (res as { petpoojaOrderId?: string } | null)?.petpoojaOrderId;
  if (!petpoojaOrderId) {
    throw new Error('Test runner returned no Petpooja Order ID.');
  }
  return { petpoojaOrderId };
};

export function initialTestResults(
  scenarios: PetpoojaTestScenario[] = PETPOOJA_TEST_SCENARIOS,
): PetpoojaTestResult[] {
  return scenarios.map((s) => ({
    scenarioId: s.id,
    title: s.title,
    status: 'Pending' as const,
    petpoojaOrderId: null,
    error: null,
  }));
}

/**
 * Runs every scenario sequentially, emitting per-scenario updates through
 * onUpdate so the UI can paint Pending -> Relaying -> Fulfilled live.
 * Resolves with the final result list (fulfilled ids ready for support).
 */
export async function runAllPetpoojaTestScenarios(options?: {
  scenarios?: PetpoojaTestScenario[];
  runner?: TestScenarioRunner;
  onUpdate?: (results: PetpoojaTestResult[]) => void;
}): Promise<PetpoojaTestResult[]> {
  const scenarios = options?.scenarios ?? PETPOOJA_TEST_SCENARIOS;
  const runner = options?.runner ?? defaultTestScenarioRunner;
  const onUpdate = options?.onUpdate;

  const results: PetpoojaTestResult[] = initialTestResults(scenarios);
  onUpdate?.(results.map((r) => ({ ...r })));

  for (let i = 0; i < scenarios.length; i++) {
    results[i] = { ...results[i], status: 'Relaying' };
    onUpdate?.(results.map((r) => ({ ...r })));
    try {
      const { petpoojaOrderId } = await runner(scenarios[i].id);
      results[i] = { ...results[i], status: 'Fulfilled', petpoojaOrderId, error: null };
    } catch (err) {
      results[i] = {
        ...results[i],
        status: 'Failed',
        petpoojaOrderId: null,
        error: err instanceof Error ? err.message : 'Relay failed.',
      };
    }
    onUpdate?.(results.map((r) => ({ ...r })));
  }
  return results;
}

/** "scenario-id: PETPOOJA-ID" lines for pasting into a support email. */
export function formatPetpoojaIdsForCopy(results: PetpoojaTestResult[]): string {
  return results
    .filter((r) => r.status === 'Fulfilled' && r.petpoojaOrderId)
    .map((r) => `${r.scenarioId}: ${r.petpoojaOrderId}`)
    .join('\n');
}
