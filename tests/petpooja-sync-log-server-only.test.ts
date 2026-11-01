/**
 * `petpooja_sync_logs` is server-owned: rules `allow write: if false`.
 * The client gateway must NOT attempt addDoc there (it was denied on every
 * sync). The server already records each sync; the diagnostics read path may
 * stay because rules allow brand/admin reads.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../src/core/integrations/petpooja/httpGateway.ts', import.meta.url),
  'utf8'
);

describe('HttpPetpoojaGateway — no client sync-log writes', () => {
  it('never addDoc()s into the server-owned petpooja_sync_logs collection', () => {
    expect(source).not.toMatch(/addDoc\(\s*collection\(\s*db\s*,\s*["']petpooja_sync_logs["']/);
    expect(source).not.toContain('writeSyncLog');
  });
});
