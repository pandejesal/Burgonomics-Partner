import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
test('compile fixture uses a nonfunctional but native-SDK-valid API key shape', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'partner-ios-fixture-'));
  try {
    mkdirSync(path.join(dir, 'ios/App/App'), { recursive: true });
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./prepare-simulator-config.mjs', import.meta.url))], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'true', RUNNER_OS: 'macOS', CI_SIMULATOR_ONLY: 'true' },
    });
    assert.equal(result.status, 0, result.stderr);
    const plist = readFileSync(path.join(dir, 'ios/App/App/GoogleService-Info.plist'), 'utf8');
    const key = plist.match(/<key>API_KEY<\/key><string>([^<]+)<\/string>/)?.[1];
    assert.match(key, /^A[\w-]{38}$/);
    assert.match(plist, /<string>ci-simulator<\/string>/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
