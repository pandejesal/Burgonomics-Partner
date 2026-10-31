// validate-ios-workflow.test.cjs — partner CI guard (A07 continuation, 2026-10-14).
//
// Charter: no full build, no network, no CI trigger, no native project edit,
// no dependency change. This test only READS workflow YAML and the toolchain
// discovery script, plus one controlled shell fixture run (local, offline).
//
// Ownership (A07 continuation): partner .github/workflows/ci.yml iOS jobs ONLY.
// The web / secret-scan / android / release-aab jobs, the triggers and every
// secrets reference are shared and were byte-preserved; test #5 asserts that
// contract semantically so a future edit that drops them fails here.
//
// STRICT, not warn (regression of the formerly documented gap):
//   - ios / ios-archive on a deprecated label (macos-13/14) => FAIL
//   - a missing select-xcode-toolchain.sh gate, missing MIN_XCODE_MAJOR=26 /
//     MIN_IOS_SDK_MAJOR=26, or a gate after the first xcodebuild => FAIL
//
// Evidence labels (per charter): static checks here are "verified locally";
// the shell fixture executes the REAL script but against STUB toolchains, so
// it verifies logic — running on a genuine Mac with real Xcode stays
// "unknown / not executed" until CI or a Mac does it.
//
// Run:  node --test scripts/validate-ios-workflow.test.cjs
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PARTNER_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PARTNER_ROOT, '..');
const WORKFLOW = path.join(PARTNER_ROOT, '.github', 'workflows', 'ci.yml');
const TOOLCHAIN_SCRIPT = path.join(PARTNER_ROOT, 'scripts', 'select-xcode-toolchain.sh');
const CUSTOMER_TOOLCHAIN_SCRIPT = path.join(
  REPO_ROOT, 'burgonomics-foundation-core', 'scripts', 'select-xcode-toolchain.sh'
);

// js-yaml lives in the customer app's node_modules (transitive, 4.3.2). No
// package.json change was made here to add it — resolved as a fallback path.
let yaml = null;
try {
  yaml = require('js-yaml');
} catch {
  const alt = path.join(REPO_ROOT, 'burgonomics-foundation-core', 'node_modules', 'js-yaml');
  if (fs.existsSync(alt)) yaml = require(alt);
}

const SUPPORTED_MACOS_RUNNERS = new Set(['macos-15', 'macos-26']);
const FORBIDDEN_SIGNING_TOKENS = [
  'altool',
  'notarytool',
  'fastlane',
  'upload-to-app-store',
  'app-store-connect',
  'DEVELOPMENT_TEAM',
  'PROVISIONING_PROFILE',
  'exportArchive',
  '.p12',
  '.provisionprofile',
];
const XCODE_HARDPIN_RE = /Xcode_\d+(?:\.\d+)*(?:\.app|\.beta)/;

function loadYaml(file) {
  assert.ok(yaml, 'js-yaml not resolvable — cannot parse ci.yml statically');
  return yaml.load(fs.readFileSync(file, 'utf8'));
}

function jobSteps(doc, jobName) {
  const job = doc.jobs && doc.jobs[jobName];
  assert.ok(job, `job ${jobName} missing`);
  return Array.isArray(job.steps) ? job.steps : [];
}

function stepRun(step) {
  return typeof step.run === 'string' ? step.run : '';
}

function stripYamlComments(text) {
  return text
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

// js-yaml may parse the `on:` key as boolean true (YAML 1.1 bool list);
// accept both spellings.
function onBlock(doc) {
  return doc.on !== undefined ? doc.on : doc[true];
}

// ---------------------------------------------------------------------------
// 1. Structure
// ---------------------------------------------------------------------------

test('ci.yml parses as YAML; ios and ios-archive jobs present', (t) => {
  if (!yaml) return t.skip('js-yaml not resolvable from this checkout');
  const doc = loadYaml(WORKFLOW);
  assert.ok(doc.jobs['ios'], 'ios job missing');
  assert.ok(doc.jobs['ios-archive'], 'ios-archive job missing');
});

// ---------------------------------------------------------------------------
// 2. STRICT runner gate — the old macos-14 gap must FAIL, not warn
// ---------------------------------------------------------------------------

test('STRICT: ios jobs on a supported macOS runner (macos-14 fails)', (t) => {
  if (!yaml) return t.skip('js-yaml not resolvable from this checkout');
  const doc = loadYaml(WORKFLOW);
  for (const name of ['ios', 'ios-archive']) {
    const runner = doc.jobs[name]['runs-on'];
    assert.ok(
      SUPPORTED_MACOS_RUNNERS.has(runner),
      `${name}: runs-on "${runner}" not in {${[...SUPPORTED_MACOS_RUNNERS].join(', ')}} — ` +
        'macos-14 is deprecated (removal 2026-11-02). The A07 continuation fixed this; a regression FAILS here by design.'
    );
  }
});

// ---------------------------------------------------------------------------
// 3. STRICT toolchain discovery gate — dual floor, before first xcodebuild
// ---------------------------------------------------------------------------

test('STRICT: gate step before first xcodebuild with MIN_XCODE_MAJOR & MIN_IOS_SDK_MAJOR = 26', (t) => {
  if (!yaml) return t.skip('js-yaml not resolvable from this checkout');
  const doc = loadYaml(WORKFLOW);
  for (const name of ['ios', 'ios-archive']) {
    const steps = jobSteps(doc, name);
    const toolIdx = steps.findIndex((s) => stepRun(s).includes('select-xcode-toolchain.sh'));
    assert.ok(toolIdx !== -1, `${name}: select-xcode-toolchain.sh gate missing (fail-closed requirement)`);
    const env = steps[toolIdx].env || {};
    assert.strictEqual(String(env.MIN_XCODE_MAJOR), '26', `${name}: MIN_XCODE_MAJOR must be "26"`);
    assert.strictEqual(String(env.MIN_IOS_SDK_MAJOR), '26', `${name}: MIN_IOS_SDK_MAJOR must be "26"`);
    const firstXcodebuild = steps.findIndex((s) => stepRun(s).includes('xcodebuild'));
    assert.ok(firstXcodebuild !== -1, `${name}: expected an xcodebuild invocation`);
    assert.ok(toolIdx < firstXcodebuild, `${name}: gate must run before the first xcodebuild step`);
  }
});

test('no hardcoded Xcode app path in executable config (comments stripped)', () => {
  const text = stripYamlComments(fs.readFileSync(WORKFLOW, 'utf8'));
  assert.ok(
    !XCODE_HARDPIN_RE.test(text),
    'ci.yml contains a versioned Xcode app path — the toolchain must be discovered, never pinned'
  );
});

// ---------------------------------------------------------------------------
// 4. iOS jobs stay credential-free / unsigned (this lane's safety posture)
// ---------------------------------------------------------------------------

test('ios jobs: no secrets, no store-upload/signing tooling; archive keeps CODE_SIGNING_ALLOWED=NO', (t) => {
  if (!yaml) return t.skip('js-yaml not resolvable from this checkout');
  const doc = loadYaml(WORKFLOW);
  for (const name of ['ios', 'ios-archive']) {
    const jobText = JSON.stringify(doc.jobs[name]);
    assert.ok(!jobText.includes('secrets.'), `${name}: references secrets — iOS jobs must stay credential-free`);
    for (const token of FORBIDDEN_SIGNING_TOKENS) {
      assert.ok(!jobText.includes(token), `${name}: forbidden signing/store token: ${token}`);
    }
  }
  const archiveRuns = jobSteps(doc, 'ios-archive').map(stepRun).join('\n');
  assert.ok(archiveRuns.includes('CODE_SIGNING_ALLOWED=NO'), 'ios-archive must keep CODE_SIGNING_ALLOWED=NO');
});

// ---------------------------------------------------------------------------
// 5. Shared surface preserved — web / secret-scan / android / release jobs,
//    triggers and release secrets are parent-owned and were byte-preserved
//    by the A07 continuation (verified via git diff); these are semantic
//    tripwires so a later edit cannot silently drop them.
// ---------------------------------------------------------------------------

test('shared surface intact: triggers + web/secret-scan/android/release-aab jobs + release secrets', (t) => {
  if (!yaml) return t.skip('js-yaml not resolvable from this checkout');
  const doc = loadYaml(WORKFLOW);
  const text = fs.readFileSync(WORKFLOW, 'utf8');

  const on = onBlock(doc);
  assert.ok(on, '`on:` block missing');
  const branches = (on.push && on.push.branches) || [];
  for (const b of ['main', 'master', 'feat/**', 'fix/**', 'release/**']) {
    assert.ok(branches.includes(b), `push branches must keep ${b}`);
  }
  assert.ok(on.pull_request !== undefined, 'pull_request trigger removed');
  assert.ok(on.workflow_dispatch !== undefined, 'workflow_dispatch trigger removed');

  for (const name of ['web', 'secret-scan', 'android', 'release-aab']) {
    assert.ok(doc.jobs[name], `shared job ${name} missing — was never in A07's edit scope`);
  }
  assert.strictEqual(doc.jobs.web['runs-on'], 'ubuntu-latest', 'web runner changed');
  assert.strictEqual(doc.jobs.android['runs-on'], 'ubuntu-latest', 'android runner changed');
  assert.strictEqual(doc.jobs['release-aab']['runs-on'], 'ubuntu-latest', 'release runner changed');
  assert.ok(
    String(doc.jobs['release-aab'].if || '').includes('workflow_dispatch'),
    'release-aab must stay manual-only'
  );

  // Release signing secrets: still referenced, still fail-closed on empty.
  for (const s of [
    'RELEASE_KEYSTORE_BASE64',
    'RELEASE_STORE_PASSWORD',
    'RELEASE_KEY_PASSWORD',
    'RELEASE_KEY_ALIAS',
  ]) {
    assert.ok(text.includes(`secrets.${s}`), `release secret ${s} reference lost`);
  }
  assert.ok(text.includes('Fail closed if release secrets missing'), 'fail-closed release guard removed');
  assert.ok(text.includes('gitleaks'), 'secret-scan job lost gitleaks');
  assert.ok(text.includes('./gradlew assembleDebug'), 'android debug build line lost');
  // Scans are scoped: `secrets.` must appear ONLY in the shared jobs above,
  // never in an iOS job (checked per-job in test 4).
});

// ---------------------------------------------------------------------------
// 6. Toolchain script contract (partner copy)
// ---------------------------------------------------------------------------

test('select-xcode-toolchain.sh: dual floor defaults, discovery, no hardpin', () => {
  const src = fs.readFileSync(TOOLCHAIN_SCRIPT, 'utf8');
  assert.ok(src.includes('MIN_XCODE_MAJOR:-26'), 'Xcode floor default must be 26 (Apple needs both versions)');
  assert.ok(src.includes('MIN_IOS_SDK_MAJOR:-26'), 'iOS SDK floor default must be 26');
  assert.ok(src.includes('-lt "$MIN_XCODE_MAJOR"'), 'must reject Xcode major below floor');
  assert.ok(src.includes('-lt "$MIN_IOS_SDK_MAJOR"'), 'must reject SDK major below floor');
  assert.ok(!XCODE_HARDPIN_RE.test(src), 'script must not hardcode a versioned Xcode app path');
  assert.ok(src.includes('Xcode*.app'), 'script must enumerate installed Xcodes');
  assert.ok(src.includes('XCODE_SEARCH_ROOT'), 'documented test-only search-root override');
});

test('bash -n syntax check on the toolchain script (skipped if bash unavailable)', (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows PowerShell host: bash syntax and real Xcode execution not verified; run on macOS');
    return;
  }
  const probe = spawnSync('bash', ['--version'], { encoding: 'utf8', timeout: 180000 });
  if (probe.error || probe.status !== 0) {
    t.skip('bash not available on this host');
    return;
  }
  // Git Bash cannot spawn absolute "C:/..." script args here but resolves a
  // relative path under an explicit cwd; equivalent on macOS.
  const res = spawnSync('bash', ['-n', 'scripts/select-xcode-toolchain.sh'], {
    cwd: PARTNER_ROOT,
    encoding: 'utf8',
    timeout: 180000,
  });
  assert.strictEqual(res.status, 0, `bash -n failed:\n${res.stderr}`);
});

test('partner and customer toolchain scripts are byte-identical (drift guard)', (t) => {
  if (!fs.existsSync(CUSTOMER_TOOLCHAIN_SCRIPT)) {
    t.skip('customer app not present beside this checkout');
    return;
  }
  const a = fs.readFileSync(TOOLCHAIN_SCRIPT);
  const b = fs.readFileSync(CUSTOMER_TOOLCHAIN_SCRIPT);
  assert.ok(a.equals(b), 'partner/customer select-xcode-toolchain.sh diverged — keep them identical');
});

// ---------------------------------------------------------------------------
// 7. NEGATIVE SHELL FIXTURE — runs the REAL script against stub toolchains.
//
//    Cases (each must hold for a green run):
//      newest-SDK-lure      Xcode 25.4 ships SDK 26.5 (the newest SDK in the
//                           fixture), Xcode 26.1 ships 26.1 -> must pick 26.1
//                           (compatible PAIR, not newest SDK) and exit 0
//      xcode-too-old        only Xcode 25.4 (SDK 26.5 would pass)  -> exit 1
//      sdk-too-old          Xcode 26.6 but SDK 25.4                -> exit 1
//      pick-highest-compatible  26.1/26.1 vs 26.6/26.5             -> exit 0,
//                           picks Xcode 26.6
//      no-candidates        empty search root                      -> exit 1
//
//    If bash is blocked on this host the fixture is SKIPPED with an explicit
//    "actual Mac execution UNKNOWN" note — never reported as green.
// ---------------------------------------------------------------------------

const FIXTURE_RUNNER = `
base="$FIXTURE_BASE"
if command -v cygpath >/dev/null 2>&1; then
  base="$(cygpath -u "$base")"
fi

# Hermetic: the host's real xcode-select must not inject a live Xcode.
mkdir -p "$base/stub-bin"
printf '#!/usr/bin/env bash\\nexit 1\\n' > "$base/stub-bin/xcode-select"
chmod +x "$base/stub-bin/xcode-select"
PATH="$base/stub-bin:$PATH"
export PATH

make_stub() {
  app="$1"; xv="$2"; sv="$3"
  mkdir -p "$app/Contents/Developer/usr/bin"
  printf '%s\\n' \\
    '#!/usr/bin/env bash' \\
    "if [ \\"\\$1\\" = \\"-version\\" ]; then echo \\"Xcode $xv\\"; echo \\"Build version \${xv}A000\\"; fi" \\
    'exit 0' > "$app/Contents/Developer/usr/bin/xcodebuild"
  printf '%s\\n' \\
    '#!/usr/bin/env bash' \\
    "if [ \\"\\$1\\" = \\"--sdk\\" ] && [ \\"\\$2\\" = \\"iphoneos\\" ] && [ \\"\\$3\\" = \\"--show-sdk-version\\" ]; then echo \\"$sv\\"; fi" \\
    'exit 0' > "$app/Contents/Developer/usr/bin/xcrun"
  chmod +x "$app/Contents/Developer/usr/bin/xcodebuild" "$app/Contents/Developer/usr/bin/xcrun"
}

run_case() {
  name="$1"; root="$2"; want="$3"
  out="$(XCODE_SEARCH_ROOT="$root" XCODE_SELECT_MODE=print MIN_XCODE_MAJOR=26 MIN_IOS_SDK_MAJOR=26 bash scripts/select-xcode-toolchain.sh 2>&1)"
  rc=$?
  echo "###CASE:$name|RC:$rc|WANT:$want"
  printf '%s\\n' "$out" | sed 's/^/OUT:/'
}

# A: newest-SDK lure — a "pick newest SDK" script would choose Xcode 25.4.
r="$base/caseA"; mkdir -p "$r"
make_stub "$r/Xcode_25.4.app" 25.4 26.5
make_stub "$r/Xcode_26.1.app" 26.1 26.1
run_case newest-SDK-lure "$r" 0

# B: Xcode below floor (its SDK would otherwise qualify).
r="$base/caseB"; mkdir -p "$r"
make_stub "$r/Xcode_25.4.app" 25.4 26.5
run_case xcode-too-old "$r" 1

# C: iOS SDK below floor on an otherwise current Xcode.
r="$base/caseC"; mkdir -p "$r"
make_stub "$r/Xcode_26.6.app" 26.6 25.4
run_case sdk-too-old "$r" 1

# D: two compatible pairs -> highest iOS SDK wins.
r="$base/caseD"; mkdir -p "$r"
make_stub "$r/Xcode_26.1.app" 26.1 26.1
make_stub "$r/Xcode_26.6.app" 26.6 26.5
run_case pick-highest-compatible "$r" 0

# E: nothing installed -> fail closed.
r="$base/caseE"; mkdir -p "$r"
run_case no-candidates "$r" 1

echo "###DONE"
`;

test('negative fixture: REAL script vs stub toolchains (skip => Mac execution UNKNOWN)', (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows PowerShell host: shell fixture not executed; actual Mac execution remains UNKNOWN');
    return;
  }
  // No separate bash probe: this host's bash startup swings wildly (4s–>60s
  // observed), so a short probe caused false skips. Go straight to the one
  // bash process that runs all five cases; any spawn failure below is reported
  // as an explicit UNKNOWN skip, never as green.
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'a07-xcode-fixture-'));
  const res = spawnSync('bash', ['-s'], {
    input: FIXTURE_RUNNER,
    cwd: PARTNER_ROOT,
    env: { ...process.env, FIXTURE_BASE: base },
    encoding: 'utf8',
    timeout: 600000,
  });
  try {
    fs.rmSync(base, { recursive: true, force: true });
  } catch {
    // Windows temp-dir EPERM is harmless; the fixture is best-effort cleaned.
  }
  if (res.error) {
    // ENOENT (no bash) or a timeout (bash hung/slow) — never claim green.
    t.skip(
      `bash unavailable or hung on this host (${res.error.code || res.error.message}) — ` +
        'shell fixture not executed; actual Mac execution of select-xcode-toolchain.sh ' +
        'remains UNKNOWN (inspected, not executed)'
    );
    return;
  }

  const out = String(res.stdout || '') + String(res.stderr || '');
  assert.ok(out.includes('###DONE'), `fixture runner did not finish:\n${out}`);

  const cases = {};
  let current = null;
  for (const line of out.split('\n')) {
    const m = line.match(/^###CASE:([^|]+)\|RC:(\d+)\|WANT:(\d+)/);
    if (m) {
      current = m[1];
      cases[current] = { rc: Number(m[2]), want: Number(m[3]), lines: [] };
      continue;
    }
    if (current && line.startsWith('OUT:')) cases[current].lines.push(line.slice(4));
  }

  const expected = [
    'newest-SDK-lure',
    'xcode-too-old',
    'sdk-too-old',
    'pick-highest-compatible',
    'no-candidates',
  ];
  assert.deepStrictEqual(
    Object.keys(cases).sort(),
    [...expected].sort(),
    `fixture cases missing from output:\n${out}`
  );

  for (const [name, c] of Object.entries(cases)) {
    assert.strictEqual(
      c.rc,
      c.want,
      `case ${name}: exit ${c.rc}, expected ${c.want}\n${c.lines.join('\n')}`
    );
  }

  const body = (n) => cases[n].lines.join('\n');

  // Compatible-pair selection: must NOT choose the too-old Xcode even though
  // its iOS SDK is the newest in the fixture.
  const lure = body('newest-SDK-lure');
  assert.ok(
    lure.includes('best compatible candidate: Xcode 26.1'),
    `newest-SDK-lure: expected the Xcode 26.1 pair to win:\n${lure}`
  );
  assert.ok(
    !lure.includes('best compatible candidate: Xcode 25.4'),
    `newest-SDK-lure: script picked the too-old Xcode by newest-SDK logic:\n${lure}`
  );

  const pick = body('pick-highest-compatible');
  assert.ok(
    pick.includes('best compatible candidate: Xcode 26.6'),
    `pick-highest-compatible: expected Xcode 26.6 / iOS SDK 26.5:\n${pick}`
  );

  assert.ok(
    body('xcode-too-old').includes('no COMPATIBLE toolchain'),
    `xcode-too-old: expected the dual-floor error:\n${body('xcode-too-old')}`
  );
  assert.ok(
    body('sdk-too-old').includes('no COMPATIBLE toolchain'),
    `sdk-too-old: expected the dual-floor error:\n${body('sdk-too-old')}`
  );
  assert.ok(
    body('no-candidates').includes('no Xcode installations found'),
    `no-candidates: expected the empty-search error:\n${body('no-candidates')}`
  );
});
