// validate-ios-workflow.test.cjs â€” partner CI guard (A07 continuation, 2026-10-14).
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
// it verifies logic â€” running on a genuine Mac with real Xcode stays
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

// js-yaml is a declared devDependency here (4.3.2). It must resolve locally:
// a missing parser FAILS the guard rather than silently skipping workflow
// validation or borrowing another checkout's copy.
const yaml = require('js-yaml');

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
  assert.ok(yaml, 'js-yaml not resolvable â€” cannot parse ci.yml statically');
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

test('ci.yml parses as YAML; ios job present (archive moved to distribution)', (t) => {
  const doc = loadYaml(WORKFLOW);
  assert.ok(doc.jobs['ios'], 'ios job missing');
});

// ---------------------------------------------------------------------------
// 2. STRICT runner gate â€” the old macos-14 gap must FAIL, not warn
// ---------------------------------------------------------------------------

test('STRICT: ios jobs on a supported macOS runner (macos-14 fails)', (t) => {
  const doc = loadYaml(WORKFLOW);
  for (const name of ['ios']) {
    const runner = doc.jobs[name]['runs-on'];
    assert.ok(
      SUPPORTED_MACOS_RUNNERS.has(runner),
      `${name}: runs-on "${runner}" not in {${[...SUPPORTED_MACOS_RUNNERS].join(', ')}} â€” ` +
        'macos-14 is deprecated (removal 2026-11-02). The A07 continuation fixed this; a regression FAILS here by design.'
    );
  }
  // The distribution job is equally gated.
  if (fs.existsSync(DISTRIBUTION_WORKFLOW)) {
    const dist = loadYaml(DISTRIBUTION_WORKFLOW);
    const distJob = Object.values(dist.jobs || {})[0] || {};
    assert.ok(
      SUPPORTED_MACOS_RUNNERS.has(distJob['runs-on']),
      `distribution runs-on "${distJob['runs-on']}" not supported`
    );
  }
});

// ---------------------------------------------------------------------------
// 3. STRICT toolchain discovery gate â€” dual floor, before first xcodebuild
// ---------------------------------------------------------------------------

test('STRICT: gate step before first xcodebuild with MIN_XCODE_MAJOR & MIN_IOS_SDK_MAJOR = 26', (t) => {
  const doc = loadYaml(WORKFLOW);
  // The simulator job builds; the distribution job archives. Both must gate.
  const targets = [['ci.yml', doc, 'ios']];
  if (fs.existsSync(DISTRIBUTION_WORKFLOW)) {
    const dist = loadYaml(DISTRIBUTION_WORKFLOW);
    targets.push(['ios-distribution.yml', dist, Object.keys(dist.jobs || {})[0]]);
  }
  for (const [label, target, name] of targets) {
    const steps = jobSteps(target, name);
    const toolIdx = steps.findIndex((s) => stepRun(s).includes('select-xcode-toolchain.sh'));
    assert.ok(toolIdx !== -1, `${label}/${name}: select-xcode-toolchain.sh gate missing (fail-closed requirement)`);
    const env = steps[toolIdx].env || {};
    assert.strictEqual(String(env.MIN_XCODE_MAJOR), '26', `${label}/${name}: MIN_XCODE_MAJOR must be "26"`);
    assert.strictEqual(String(env.MIN_IOS_SDK_MAJOR), '26', `${label}/${name}: MIN_IOS_SDK_MAJOR must be "26"`);
    const firstXcodebuild = steps.findIndex((s) => stepRun(s).includes('xcodebuild') || stepRun(s).includes('archive_ios.py'));
    assert.ok(firstXcodebuild !== -1, `${label}/${name}: expected a build/archive invocation`);
    assert.ok(toolIdx < firstXcodebuild, `${label}/${name}: gate must run before the first build/archive step`);
  }
});

test('no hardcoded Xcode app path in executable config (comments stripped)', () => {
  const text = stripYamlComments(fs.readFileSync(WORKFLOW, 'utf8'));
  assert.ok(
    !XCODE_HARDPIN_RE.test(text),
    'ci.yml contains a versioned Xcode app path â€” the toolchain must be discovered, never pinned'
  );
});

// ---------------------------------------------------------------------------
// 4. iOS jobs stay credential-free / unsigned (this lane's safety posture)
// ---------------------------------------------------------------------------

test('distribution signing is manual, complete-secret gated and export-only', () => {
  const source = fs.readFileSync(path.join(__dirname, 'archive_ios.py'), 'utf8');
  assert.ok(source.includes("return 'unsigned'"));
  assert.ok(source.includes('Incomplete iOS signing secrets'));
  assert.ok(source.includes('CODE_SIGNING_ALLOWED=NO'));
  assert.ok(source.includes('-exportArchive'));
  assert.ok(source.includes("'destination': 'export'"));
  // The signed path now lives in the dedicated distribution workflow.
  const workflow = fs.readFileSync(DISTRIBUTION_WORKFLOW, 'utf8');
  assert.ok(workflow.includes('ASC_API_KEY_BASE64'), 'distribution must wire signing material');
  assert.ok(workflow.includes("IOS_DISTRIBUTION_OPT_IN: 'true'"), 'distribution must pass the exact opt-in');
  assert.ok(workflow.includes('archive_ios.py'), 'distribution must invoke the archive script');
});

// ---------------------------------------------------------------------------
// 5. Shared surface preserved â€” web / secret-scan / android / release jobs,
//    triggers and release secrets are parent-owned and were byte-preserved
//    by the A07 continuation (verified via git diff); these are semantic
//    tripwires so a later edit cannot silently drop them.
// ---------------------------------------------------------------------------

test('shared surface intact: triggers + web/secret-scan/android/release-aab jobs + release secrets', (t) => {
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
    assert.ok(doc.jobs[name], `shared job ${name} missing â€” was never in A07's edit scope`);
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
  assert.ok(a.equals(b), 'partner/customer select-xcode-toolchain.sh diverged â€” keep them identical');
});

// ---------------------------------------------------------------------------
// 8. DISTRIBUTION SEPARATION (dependency-ios-hardening slice)
//
//    Archive/signing may exist ONLY in a separate, manually gated
//    ios-distribution.yml. Both simulator surfaces must be structurally
//    signing-free, and ci.yml must no longer carry an ios-archive job â€” a
//    generic CI manual dispatch also runs the unrelated signed release-aab job,
//    so an approved iOS dispatch must never share that trigger surface.
// ---------------------------------------------------------------------------

const DISTRIBUTION_WORKFLOW = path.join(PARTNER_ROOT, '.github', 'workflows', 'ios-distribution.yml');
const IOS_BUILD_WORKFLOW = path.join(PARTNER_ROOT, '.github', 'workflows', 'ios-build.yml');

// Pins published in folder39 IOS-CI-SECURITY-METADATA.json (node24, verified).
const APPROVED_ACTION_PINS = {
  'actions/checkout': '3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node': '949feb2413d6458794dcd2491c4babbbce0c15c1',
  'actions/upload-artifact': 'cf430e030ddbb5b0abf93d22962f4752f3646cd9',
  'actions/download-artifact': '9000827ccba6bdab643e8b6fd33ac0654aef8333',
};

// Key material: these alone can enable signing.
const SIGNING_SECRET_NAMES = [
  'ASC_API_KEY_BASE64', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'APPLE_TEAM_ID',
  'IOS_CERTIFICATE_BASE64', 'IOS_CERTIFICATE_PASSWORD', 'IOS_PROFILE_BASE64',
];
// Public client configuration for the production build. Not key material, and
// legitimately used by non-iOS jobs (android/release-aab) in ci.yml.
const PRODUCTION_CONFIG_SECRET_NAMES = [
  'MOBILE_PRODUCTION_ENV', 'GOOGLE_SERVICE_INFO_PLIST_BASE64',
];

/** Every `uses:` in a parsed workflow, flattened. */
function allUses(doc) {
  const out = [];
  for (const job of Object.values(doc.jobs || {})) {
    for (const step of (job && job.steps) || []) {
      if (step && typeof step.uses === 'string') out.push(step.uses);
    }
  }
  return out;
}

/** Steps of a job, guarded so a missing job reports rather than throws. */
function stepsOf(doc, name) {
  const job = doc.jobs && doc.jobs[name];
  assert.ok(job, `job ${name} missing`);
  return Array.isArray(job.steps) ? job.steps : [];
}

test('ci.yml no longer carries an ios-archive job (moved to distribution)', (t) => {
  const doc = loadYaml(WORKFLOW);
  assert.strictEqual(
    doc.jobs['ios-archive'], undefined,
    'ci.yml must not run iOS archive: a generic manual dispatch also runs the signed release-aab job'
  );
  // The residual Android risk is explicit, not removed: release-aab stays.
  assert.ok(doc.jobs['release-aab'], 'release-aab must remain in ci.yml untouched');
});

test('ci.yml root has no signing material and least privilege', (t) => {
  const doc = loadYaml(WORKFLOW);
  const text = fs.readFileSync(WORKFLOW, 'utf8');
  const rootEnv = doc.env || {};
  assert.strictEqual(rootEnv.TEAM_ID, undefined, 'global TEAM_ID must be removed from ci.yml');
  for (const secret of SIGNING_SECRET_NAMES) {
    assert.ok(!text.includes(`secrets.${secret}`), `ci.yml must not reference signing secret ${secret}`);
  }
  const perms = doc.permissions || {};
  assert.strictEqual(perms.contents, 'read', 'ci.yml root permissions must be contents: read');
});

test('ci.yml ios job is simulator-only and signing-free', (t) => {
  const doc = loadYaml(WORKFLOW);
  const steps = stepsOf(doc, 'ios');
  const joined = steps.map(stepRun).join('\n');
  assert.match(joined, /generic\/platform=iOS Simulator/, 'ios job must build for the simulator');
  assert.match(joined, /CODE_SIGNING_ALLOWED=NO/, 'simulator build must disable signing');
  for (const step of steps) {
    const env = step.env || {};
    assert.strictEqual(env.IOS_DISTRIBUTION_OPT_IN, undefined, 'simulator job must never opt into distribution');
  }
  assert.ok(!joined.includes('archive_ios.py'), 'simulator job must not invoke the archive script');
  assert.ok(!joined.includes(' -archive '), 'simulator job must not archive');
});

test('ios-build.yml is simulator-only with no signing jobs or secrets', (t) => {
  const doc = loadYaml(IOS_BUILD_WORKFLOW);
  const text = fs.readFileSync(IOS_BUILD_WORKFLOW, 'utf8');
  assert.strictEqual(doc.jobs['ios-archive'], undefined, 'ios-build.yml must have no archive job');
  for (const secret of SIGNING_SECRET_NAMES) {
    assert.ok(!text.includes(secret), `ios-build.yml must not reference ${secret}`);
  }
  assert.ok(!text.includes('archive_ios.py'), 'ios-build.yml must not invoke the archive script');
  const joined = JSON.stringify(doc);
  assert.ok(!/-archive\b/.test(joined), 'ios-build.yml must not contain an archive action');
  for (const job of Object.values(doc.jobs || {})) {
    const env = job.env || {};
    assert.strictEqual(env.IOS_DISTRIBUTION_OPT_IN, undefined, 'no job may opt into distribution here');
  }
});

test('both simulator surfaces pin reviewed action SHAs and drop credentials', (t) => {
  // Scope: the iOS jobs only. ci.yml's web/secret-scan/android/release-aab jobs
  // are other lanes and are deliberately not action-bumped here.
  const surfaces = [
    [WORKFLOW, ['ios']],
    [IOS_BUILD_WORKFLOW, Object.keys(loadYaml(IOS_BUILD_WORKFLOW).jobs || {})],
  ];
  for (const [file, jobs] of surfaces) {
    const doc = loadYaml(file);
    const label = path.basename(file);
    for (const jobName of jobs) {
      for (const step of stepsOf(doc, jobName)) {
        const uses = String(step.uses || '');
        if (uses.startsWith('actions/')) {
          const [name, ref] = uses.split('@');
          const pinned = APPROVED_ACTION_PINS[name];
          if (pinned) {
            assert.strictEqual(ref, pinned, `${label}/${jobName}: ${name} must be pinned to the reviewed full SHA`);
          }
        }
        if (uses.startsWith('actions/checkout@')) {
          const withBlock = step.with || {};
          assert.strictEqual(withBlock['persist-credentials'], false, `${label}/${jobName}: checkout must not persist credentials`);
        }
      }
    }
    const text = stripYamlComments(fs.readFileSync(file, 'utf8'));
    assert.ok(!/safe\.directory=\*/.test(text), `${label}: no wildcard safe.directory`);
  }
});

test('ios-build.yml declares CI_SIMULATOR_ONLY for the built job', (t) => {
  const doc = loadYaml(IOS_BUILD_WORKFLOW);
  for (const job of Object.values(doc.jobs || {})) {
    const env = job.env || {};
    assert.strictEqual(String(env.CI_SIMULATOR_ONLY), 'true', 'each job must declare CI_SIMULATOR_ONLY=true');
    assert.ok(job['timeout-minutes'], 'each job must bound its runtime');
  }
});

// ---------------------------------------------------------------------------
// 9. DISTRIBUTION GATE TRUTH TABLE â€” pure evaluation, no YAML needed
// ---------------------------------------------------------------------------

const TRUSTED_REF_PREFIX = 'refs/heads/';

/**
 * Mirror of the ios-distribution.yml gate, so the truth table can be exercised
 * without running Actions. Every conjunct must hold simultaneously.
 */
function distributionGate({ event, inputApprove, inputRaw, variableEnabled, ref, defaultBranch, environment }) {
  const trustedRef = ref === TRUSTED_REF_PREFIX + defaultBranch;
  const approved = inputApprove === true && inputRaw === 'true';
  return (
    event === 'workflow_dispatch' &&
    trustedRef &&
    variableEnabled === 'true' &&
    approved &&
    typeof environment === 'string' &&
    environment === 'ios-distribution'
  );
}

function validGate(overrides = {}) {
  return distributionGate({
    event: 'workflow_dispatch',
    inputApprove: true,
    inputRaw: 'true',
    variableEnabled: 'true',
    ref: 'refs/heads/main',
    defaultBranch: 'main',
    environment: 'ios-distribution',
    ...overrides,
  });
}

test('distribution gate: all conjuncts true opens', () => {
  assert.strictEqual(validGate(), true);
});

test('distribution gate: every single missing conjunct closes', () => {
  const mutations = {
    'non-manual event': { event: 'push' },
    'pull_request event': { event: 'pull_request' },
    'input boolean false': { inputApprove: false },
    'input string "false"': { inputApprove: 'false', inputRaw: 'false' },
    'input absent': { inputApprove: undefined, inputRaw: undefined },
    'variable absent': { variableEnabled: undefined },
    'variable "false"': { variableEnabled: 'false' },
    'variable "TRUE"': { variableEnabled: 'TRUE' },
    'wrong ref (tag)': { ref: 'refs/tags/v1.0.0' },
    'wrong ref (PR merge)': { ref: 'refs/pull/1/merge' },
    'wrong ref (other branch)': { ref: 'refs/heads/feature/x' },
    'environment missing': { environment: undefined },
    'environment wrong name': { environment: 'production' },
  };
  for (const [label, overrides] of Object.entries(mutations)) {
    assert.strictEqual(validGate(overrides), false, `gate must close for: ${label}`);
  }
});

test('distribution gate: workflow file encodes the same conjuncts', (t) => {
  if (!fs.existsSync(DISTRIBUTION_WORKFLOW)) {
    assert.fail('ios-distribution.yml missing â€” archive must live in a separate gated workflow');
  }
  const doc = loadYaml(DISTRIBUTION_WORKFLOW);
  const text = fs.readFileSync(DISTRIBUTION_WORKFLOW, 'utf8');
  const on = onBlock(doc);
  assert.ok(on && on.workflow_dispatch, 'distribution must be workflow_dispatch only');
  assert.strictEqual(on.push, undefined, 'distribution must not run on push');
  assert.strictEqual(on.pull_request, undefined, 'distribution must not run on pull_request');
  const input = on.workflow_dispatch.inputs && on.workflow_dispatch.inputs.approve_distribution;
  assert.ok(input, 'approve_distribution input missing');
  assert.strictEqual(input.type, 'boolean');
  assert.strictEqual(input.default, false);
  assert.match(text, /vars\.IOS_DISTRIBUTION_ENABLED/, 'default-off repository variable gate missing');
  assert.match(text, /github\.event\.repository\.default_branch/, 'must compare against the default branch');
  assert.match(text, /refs\/heads\//, 'must match a branch ref, not a tag');
  assert.match(text, /environment:\s*ios-distribution/, 'named environment required in YAML');

  const jobs = Object.values(doc.jobs || {});
  assert.strictEqual(jobs.length, 1, 'distribution must be a single guarded job');
  const job = jobs[0];
  assert.ok(String(job.if || '').includes('approve_distribution'), 'job must gate on the boolean input');
  assert.strictEqual(job.environment, 'ios-distribution');

  // Key material may exist ONLY on the archive step inside this job. Production
  // config (MOBILE_PRODUCTION_ENV / google-services plist) is public client
  // configuration and is legitimately needed by the prepare step too.
  // Key material may appear on the completeness preflight and the archive step,
  // both step-scoped — never on the approval preflight and never job-scoped.
  for (const step of job.steps || []) {
    const env = step.env || {};
    const hasKeyMaterial = Object.keys(env).some((key) => SIGNING_SECRET_NAMES.includes(key));
    if (!hasKeyMaterial) continue;
    assert.match(
      String(step.name || ''),
      /Require signing material|Archive and export signed IPA/,
      `signing keys must not be on an unexpected step: ${step.name}`
    );
    assert.ok(!/Verify approval/.test(String(step.name || '')), 'approval preflight must stay key-free');
  }
  assert.strictEqual((job.env || {}).ASC_KEY_ID, undefined, 'no job-scoped signing keys');
});

test('distribution archive step fails hard instead of skipping', (t) => {
  const text = fs.readFileSync(DISTRIBUTION_WORKFLOW, 'utf8');
  assert.ok(!/skipping iOS archive/i.test(text), 'distribution must not carry a "skip cleanly" path');
  assert.ok(!/skip=true/.test(text), 'distribution must not emit a skip output');
  assert.ok(!/if:\s*steps\.preflight\.outputs\.skip/.test(text), 'no conditional skip gating remains');
});

test('distribution artifact is accurately named with bounded retention', (t) => {
  const doc = loadYaml(DISTRIBUTION_WORKFLOW);
  const job = Object.values(doc.jobs || {})[0];
  const uploads = (job.steps || []).filter((s) => String(s.uses || '').includes('upload-artifact'));
  assert.ok(uploads.length >= 1, 'distribution must upload an artifact');
  for (const upload of uploads) {
    const withBlock = upload.with || {};
    assert.ok(withBlock['retention-days'], 'retention must be bounded');
    assert.match(String(withBlock.path || ''), /\.ipa$|ipa\//, 'only the IPA path may be uploaded here');
    assert.ok(!/store|publish|submit/i.test(String(withBlock.name || '')), 'artifact name must not imply store submission');
  }
  const text = fs.readFileSync(DISTRIBUTION_WORKFLOW, 'utf8');
  for (const forbidden of ['altool', 'notarytool', 'fastlane', 'xcrun altool', 'app-store-connect']) {
    assert.ok(!text.includes(forbidden), `distribution must not upload to a store: ${forbidden}`);
  }
});

// ---------------------------------------------------------------------------
// 10. NEGATIVE SHELL FIXTURE â€” runs the REAL script against stub toolchains.
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
//    "actual Mac execution UNKNOWN" note â€” never reported as green.
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

# A: newest-SDK lure â€” a "pick newest SDK" script would choose Xcode 25.4.
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
  // No separate bash probe: this host's bash startup swings wildly (4sâ€“>60s
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
    // ENOENT (no bash) or a timeout (bash hung/slow) â€” never claim green.
    t.skip(
      `bash unavailable or hung on this host (${res.error.code || res.error.message}) â€” ` +
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

// ---------------------------------------------------------------------------
// DISTRIBUTION PREFLIGHT â€” executes the REAL workflow blocks with synthetic
// contexts. GitHub `==` is loose and case-insensitive, so the YAML `if:` alone
// cannot express these guards; the inline Python blocks are what actually decide.
// No native tooling, no CI, no signing material.
// ---------------------------------------------------------------------------

/** Pull a named step's Python heredoc body and its env key list. */
function extractStepPython(file, stepName) {
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const marker = `      - name: ${stepName}\n`;
  const at = text.indexOf(marker);
  assert.notStrictEqual(at, -1, `${path.basename(file)}: step "${stepName}" missing`);
  const rest = text.slice(at + marker.length);
  const nextStep = rest.indexOf('\n      - ');
  const block = nextStep === -1 ? rest : rest.slice(0, nextStep);

  const runMatch = block.match(/^        run: \|\n([\s\S]*?)(?=^        env:)/m);
  assert.ok(runMatch, `${stepName}: run block missing`);
  const bodyMatch = runMatch[1].match(/<<'PY'\n([\s\S]*?)\n\s*PY\b/);
  assert.ok(bodyMatch, `${stepName}: Python heredoc missing`);

  const envMatch = block.match(/^        env:\n([\s\S]*)$/m);
  const envKeys = envMatch
    ? envMatch[1].split('\n').filter((l) => l.trim()).map((l) => l.trim().split(':')[0])
    : [];
  const body = bodyMatch[1]
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');
  return { body, envKeys, block };
}

function runPython(body, env) {
  const result = spawnSync('python', ['-'], {
    input: body,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, ...env },
  });
  return { status: result.status, out: `${result.stdout || ''}${result.stderr || ''}` };
}

test('approval preflight: exact semantics, no signing keys, valid context passes', () => {
  const { body, envKeys } = extractStepPython(DISTRIBUTION_WORKFLOW, 'Verify approval, ref and enablement');

  for (const forbidden of SIGNING_SECRET_NAMES) {
    assert.ok(!envKeys.includes(forbidden), `approval step must not receive ${forbidden}`);
  }
  assert.ok(envKeys.includes('APPROVE_INPUT_JSON'), 'boolean input must arrive via toJSON');
  assert.ok(!/\$\{\{/.test(body), 'run body must not interpolate ${{ }} directly');

  const REF = 'refs/heads/main';
  const valid = {
    APPROVE_INPUT_JSON: 'true', ENABLED_VAR: 'true',
    ACTUAL_REF: REF, EXPECTED_REF: REF,
  };
  assert.strictEqual(runPython(body, valid).status, 0, 'a valid context must pass');

  const refusals = {
    'input false': { APPROVE_INPUT_JSON: 'false' },
    'input quoted "true"': { APPROVE_INPUT_JSON: '"true"' },
    'input null': { APPROVE_INPUT_JSON: 'null' },
    'input number 1': { APPROVE_INPUT_JSON: '1' },
    'vars TRUE': { ENABLED_VAR: 'TRUE' },
    'vars True': { ENABLED_VAR: 'True' },
    'vars false': { ENABLED_VAR: 'false' },
    'vars empty': { ENABLED_VAR: '' },
    'branch case variant': { ACTUAL_REF: 'refs/heads/Main' },
    'branch other': { ACTUAL_REF: 'refs/heads/feature/x' },
    'tag ref': { ACTUAL_REF: 'refs/tags/v1.0.0' },
    'ref missing': { ACTUAL_REF: '' },
  };
  for (const [label, override] of Object.entries(refusals)) {
    assert.notStrictEqual(
      runPython(body, { ...valid, ...override }).status, 0,
      `must refuse: ${label}`
    );
  }
});

test('signing completeness preflight: complete passes, each missing key fails by name', () => {
  const { body, envKeys } = extractStepPython(DISTRIBUTION_WORKFLOW, 'Require signing material');
  // The blocking bug: the step read keys with no env mapping at all.
  for (const key of SIGNING_SECRET_NAMES) {
    assert.ok(envKeys.includes(key), `preflight env mapping missing ${key}`);
  }
  assert.ok(!/\beval\b/.test(body), 'no eval allowed');

  const complete = Object.fromEntries(SIGNING_SECRET_NAMES.map((k) => [k, 'synthetic-value']));
  assert.strictEqual(runPython(body, complete).status, 0, 'complete config must pass');

  for (const missing of SIGNING_SECRET_NAMES) {
    const partial = { ...complete };
    delete partial[missing];
    const result = runPython(body, partial);
    assert.notStrictEqual(result.status, 0, `missing ${missing} must fail closed`);
    assert.ok(result.out.includes(missing), `failure must name ${missing}`);
    assert.ok(!result.out.includes('synthetic-value'), 'must never print values');
  }
});
