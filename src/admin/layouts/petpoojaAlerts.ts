import type { GatewayAlert } from "@/core/integrations/petpooja";

/**
 * Alerts load state — phase "failed" is a REAL outcome the operator must see.
 * The pre-fix PetpoojaOperationsLayout caught every gateway failure into
 * setAlerts([]), indistinguishable from "zero incidents". These pieces carry
 * the behavior; the layout wires them (vitest env is 'node' — no jsdom — so
 * the wiring itself is unit-tested directly, not via a DOM render).
 */
export type PetpoojaAlertsState = {
  phase: "ok" | "failed";
  alerts: GatewayAlert[];
};

export interface PetpoojaAlertsLoaderDeps {
  enabled: boolean;
  getAlerts: () => Promise<GatewayAlert[]>;
  onState: (state: PetpoojaAlertsState) => void;
}

/**
 * Runs one alerts load pass per invocation, with a monotonic attempt token
 * shared across invocations: a SLOWER OLDER attempt must never overwrite the
 * state a newer attempt already published (and resurrect a dismissed banner).
 *
 * Contract:
 * - integration DISABLED: never touches the gateway (the fail-closed throw is
 *   a config guarantee, not an incident), never emits a failure state.
 * - integration ENABLED:
 *     array response            -> phase "ok" (even when empty: truthful none)
 *     non-array / malformed     -> phase "failed" (a shaped lie must not read
 *                                  as "no incidents")
 *     any rejection             -> phase "failed", reason warned, not swallowed
 */
export function createPetpoojaAlertsLoader(deps: PetpoojaAlertsLoaderDeps): () => Promise<void> {
  let attempts = 0;
  return function loadAlerts(): Promise<void> {
    if (!deps.enabled) return Promise.resolve();
    const token = ++attempts;
    return Promise.resolve()
      .then(() => deps.getAlerts())
      .catch((err) => ({ __loadFailed: true as const, reason: err }))
      .then((result) => {
        if (token !== attempts) return; // stale attempt lost the race
        if (result && typeof result === "object" && (result as { __loadFailed?: boolean }).__loadFailed) {
          console.warn(
            "[petpooja] incident alerts load failed (operator sees a load-failure banner):",
            (result as { reason?: unknown }).reason
          );
          deps.onState({ phase: "failed", alerts: [] });
          return;
        }
        if (Array.isArray(result)) {
          deps.onState({ phase: "ok", alerts: result as GatewayAlert[] });
          return;
        }
        // Malformed payload: refusing to present it as a truthful "none".
        console.warn(
          "[petpooja] incident alerts response was not an array:",
          result
        );
        deps.onState({ phase: "failed", alerts: [] });
      });
  };
}

/** Pure banner/feed decision so the honest-vs-nothing distinction is exact. */
export function petpoojaAlertsVisibility(
  state: PetpoojaAlertsState,
  petpoojaEnabled: boolean
): { showLoadFailure: boolean; showIncidents: boolean } {
  return {
    showLoadFailure: state.phase === "failed" && petpoojaEnabled,
    showIncidents: state.phase === "ok" && state.alerts.length > 0,
  };
}
