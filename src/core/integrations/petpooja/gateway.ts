import { appConfig } from "@/core/config/env";
import type { PetpoojaGateway } from "./types";
import { HttpPetpoojaGateway } from "./httpGateway";

/**
 * Gateway factory — the ONE place that creates the Petpooja gateway.
 *
 *   VITE_PETPOOJA_ENABLED=true  → HttpPetpoojaGateway ("live": Cloud
 *                                  Functions proxy + server-held key)
 *   anything else (default)     → THROWS (fail-closed, no mock fallback)
 *
 * Going live = set the flag, add PETPOOJA_APP_KEY / APP_SECRET /
 * ACCESS_TOKEN to the Functions env, redeploy functions + client.
 * No code changes, no consumer edits (same PetpoojaGateway interface).
 */
export function createPetpoojaGateway(): PetpoojaGateway {
  if (appConfig.integrations.petpoojaEnabled) {
    return new HttpPetpoojaGateway();
  }
  throw new Error(
    "[Petpooja] VITE_PETPOOJA_ENABLED is not set to true — refusing to start with mock gateway. " +
    "Set VITE_PETPOOJA_ENABLED=true and provide PETPOOJA_APP_KEY, PETPOOJA_APP_SECRET, PETPOOJA_ACCESS_TOKEN to go live."
  );
}

let cachedGateway: PetpoojaGateway | null = null;

/**
 * Lazily creates the shared singleton on first use. Still throws
 * fail-closed when VITE_PETPOOJA_ENABLED is not true — but only when gateway
 * functionality is actually invoked, never at import time.
 */
export function getPetpoojaGateway(): PetpoojaGateway {
  if (!cachedGateway) {
    cachedGateway = createPetpoojaGateway();
    if (typeof console !== "undefined") {
      console.info(`[petpooja] gateway implementation: ${cachedGateway.implementation}`);
    }
  }
  return cachedGateway;
}

/**
 * Shared singleton — import this, never instantiate gateways directly.
 *
 * Lazily initialized on first property access so importing this module never
 * throws at app boot (a module-scope throw blank-screens the whole app
 * before React mounts). Fail-closed behavior is preserved: touching the
 * gateway without VITE_PETPOOJA_ENABLED=true still throws, just at use-time.
 */
export const petpoojaGateway: PetpoojaGateway = new Proxy({} as PetpoojaGateway, {
  get(_target, prop) {
    const gateway = getPetpoojaGateway();
    const value = (gateway as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === "function" ? value.bind(gateway) : value;
  },
});
