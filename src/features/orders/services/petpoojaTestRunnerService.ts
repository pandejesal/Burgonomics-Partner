/**
 * Petpooja test runner service — the 5-scenario onboarding relay suite.
 *
 * Each scenario relays a synthetic order through POST /petpooja/testRunner
 * (see partnerFunctionsApi.runPetpoojaTestScenario). When the POS returns an
 * order id it is collected for support reconciliation; when the POS accepts
 * without returning an id (its documented sandbox behaviour) the result
 * carries our own client reference (clientOrderRef — the same key the vendor
 * Order List shows as Order No.) and the copy list echoes it, labelled.
 * Status lifecycle per scenario: Pending -> Relaying -> Fulfilled (or Failed
 * on relay error — never a silent skip). NOTE: `Fulfilled` means the POS
 * ACCEPTED the relay — POS-side fulfilment is NOT verified here. When
 * Petpooja returns no order id, `petpoojaOrderId` is null and the support
 * copy list echoes OUR client reference instead (labelled), so an accepted
 * relay never yields an empty reconciliation list.
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
  /** OUR client reference sent as Order.orderID (the vendor Order List's
   *  Order No.). Present even when the POS returned no id; null on failure. */
  clientOrderRef: string | null;
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

export type TestScenarioRunner = (
  scenarioId: string,
) => Promise<{ petpoojaOrderId: string | null; clientOrderRef?: string | null }>;

/**
 * Default runner — live test runner API.
 *
 * Honesty contract (mirrors the functions-side relay in
 * functions/src/modules/petpooja/testRunner.ts; evidence in
 * references/petpooja_save_order_api.md §16.8/§19.2): the server answers
 * { success:true, petpoojaOrderId: string|null, petpoojaOrderIdReturned }. A
 * `success:true` body with an absent / null `petpoojaOrderId` means the POS
 * ACCEPTED the relay and returned no id — Petpooja's real save_order does this
 * in the sandbox (empty `orderID` is the normal shape of a successful save and
 * says nothing about fulfilment). Reporting that as a failure is a false
 * negative: it claims nothing synced when the POS holds the order. It returns
 * { petpoojaOrderId: null } instead of throwing. Only a relay the server did
 * NOT accept (explicit refusal), an unexpected body, or a transport failure
 * throws — never id absence on its own.
 */
export const defaultTestScenarioRunner: TestScenarioRunner = async (scenarioId) => {
  const res = await partnerFunctionsApi.runPetpoojaTestScenario({ scenarioId });
  const body = res as {
    success?: boolean | number | string;
    status?: unknown;
    petpoojaOrderIdReturned?: boolean;
    petpoojaOrderId?: string | null;
    clientOrderID?: string | null;
  } | null;
  const petpoojaOrderId =
    typeof body?.petpoojaOrderId === 'string' && body.petpoojaOrderId.trim().length > 0
      ? body.petpoojaOrderId.trim()
      : null;
  // OUR client reference (Order.orderID we sent). The vendor Order List shows
  // it as the Order No.; with no POS id reachable through the API it is the
  // reconciliation key support actually matches against (ref §16.2/§16.8).
  const clientOrderRef =
    typeof body?.clientOrderID === 'string' && body.clientOrderID.trim().length > 0
      ? body.clientOrderID.trim()
      : null;
  // Fail closed on: no body, an explicit refusal (success false), or a body
  // with neither acceptance nor an id.
  if (!body) {
    throw new Error('Petpooja test runner returned no response.');
  }
  if (body.success === false || body.success === 0 || body.success === '0') {
    throw new Error(
      'Petpooja test runner relay failed — POS did not accept the scenario.',
    );
  }
  // Mirrors the server's own accepted set (testRunner.ts:699-703) so a future
  // variant that reports acceptance without a boolean success still resolves
  // honestly instead of through the "unrecognised response" fallback.
  const accepted =
    body.success === true ||
    body.success === 1 ||
    body.success === '1' ||
    body.status === 'success' ||
    body.petpoojaOrderIdReturned === true ||
    petpoojaOrderId !== null;
  if (!accepted) {
    throw new Error('Petpooja test runner relay failed — unrecognised response.');
  }
  return { petpoojaOrderId, clientOrderRef };
};

export function initialTestResults(
  scenarios: PetpoojaTestScenario[] = PETPOOJA_TEST_SCENARIOS,
): PetpoojaTestResult[] {
  return scenarios.map((s) => ({
    scenarioId: s.id,
    title: s.title,
    status: 'Pending' as const,
    petpoojaOrderId: null,
    clientOrderRef: null,
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
      const { petpoojaOrderId, clientOrderRef } = await runner(scenarios[i].id);
      // POS accepted. `petpoojaOrderId` may be null (documented accepted-
      // without-id sandbox response); the id-less outcome stays Fulfilled,
      // and the copy list echoes our client reference for it. Normalise a
      // loosely-shaped runner result to the declared null contract so
      // downstream `=== null` checks hold; a whitespace-only ref is no ref.
      results[i] = {
        ...results[i],
        status: 'Fulfilled',
        petpoojaOrderId: petpoojaOrderId ?? null,
        clientOrderRef: clientOrderRef?.trim() || null,
        error: null,
      };
    } catch (err) {
      results[i] = {
        ...results[i],
        status: 'Failed',
        petpoojaOrderId: null,
        clientOrderRef: null,
        error: err instanceof Error ? err.message : 'Relay failed.',
      };
    }
    onUpdate?.(results.map((r) => ({ ...r })));
  }
  return results;
}

/** Support reconciliation text for the copy button — the newline join of
 *  petpoojaCopyListLines below. */
export function formatPetpoojaIdsForCopy(results: PetpoojaTestResult[]): string {
  return petpoojaCopyListLines(results).join('\n');
}

/** The per-scenario reconciliation lines behind the copy block. Pure, so the
 *  modal renders exactly what the copy button sends. When the POS returned
 *  an id, both the POS id and our reference are carried (support matches the
 *  Order List by the reference). */
export function petpoojaCopyListLines(results: PetpoojaTestResult[]): string[] {
  return results
    .filter((r) => r.status === 'Fulfilled')
    .filter((r) => r.petpoojaOrderId || r.clientOrderRef)
    .map((r) => {
      const first = r.petpoojaOrderId
        ? `POS order id ${r.petpoojaOrderId}`
        : 'POS returned no order id';
      const ref =
        r.clientOrderRef && r.clientOrderRef !== r.petpoojaOrderId
          ? ` — client reference ${r.clientOrderRef}`
          : r.clientOrderRef
            ? ` (client reference ${r.clientOrderRef})`
            : '';
      return `${r.scenarioId}: ${first}${ref}`;
    });
}
