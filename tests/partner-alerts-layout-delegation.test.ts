// Source-level delegation guard for the Petpooja incident-alerts surface.
// Reads the layout source directly (this repo's convention for guard tests in
// tests/ — colocated src tests run under tsc, where node builtins are out of
// the app tsconfig's module graph).
//
// Pins what DOM/node-env tests cannot: the LAYOUT actually delegates the
// incident surface to the extracted loader/component, and the pre-fix
// "catch every failure into setAlerts([])" pattern is gone from the source.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const layoutPath = path.resolve(import.meta.dirname, '../src/admin/layouts/PetpoojaOperationsLayout.tsx');
const src = readFileSync(layoutPath, 'utf8');

describe('PetpoojaOperationsLayout incident-alerts delegation guard', () => {
  it('layout delegates the incident surface to PetpoojaIncidentAlerts and the extracted loader', () => {
    expect(src).toContain('PetpoojaIncidentAlerts');
    expect(src).toContain('createPetpoojaAlertsLoader');
  });

  it('the pre-fix lying catch (setAlerts([])) no longer exists anywhere in the layout', () => {
    expect(src).not.toContain('setAlerts([])');
  });
});
