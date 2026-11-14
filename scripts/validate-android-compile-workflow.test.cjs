// validate-android-compile-workflow.test.cjs — partner CI guard for the Android lanes.
//
// Charter: no build, no Gradle, no npm install, no network, no CI trigger, no
// credential read. This test READS .github/workflows/ci.yml and the two
// preparation helpers as text/objects, and builds synthetic fixtures so the
// guards cannot rot into "permits everything".
//
// Background: the signed `release-aab` job and the ordinary `android` compile
// job both used to call prepare-native-config.mjs, which fails closed without
// MOBILE_PRODUCTION_ENV. That secret does not exist in this repository, so the
// compile job could never pass. The two lanes are now separate concerns:
//
//   1. `android` — compile only. Synthetic, non-live configuration from
//      scripts/prepare-android-compile-config.mjs. Must never mention a
//      production secret or the production helper: if it does, the job is once
//      again unreachable for a contributor.
//   2. `release-aab` — signed artifact. Still manual-only, still feeds the
//      production configuration from the real secret, still fails closed on
//      empty signing material. Byte-critical: this slice must not relax it.
//
// A green compile check is not a signed release; the two are asserted apart so
// neither can be used to vouch for the other.
//
// Run:  node --test scripts/validate-android-compile-workflow.test.cjs
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'ci.yml');
const COMPILE_JOB = 'android';
const RELEASE_JOB = 'release-aab';

const COMPILE_HELPER = 'prepare-android-compile-config.mjs';
const PRODUCTION_HELPER = 'prepare-native-config.mjs';
const COMPILE_FLAG = 'CI_ANDROID_COMPILE_ONLY';

let yaml;
try {
  yaml = require('js-yaml');
} catch {
  yaml = null;
}

function loadYaml(file) {
  assert.ok(yaml, 'js-yaml not resolvable — cannot parse workflows statically');
  return yaml.load(fs.readFileSync(file, 'utf8'));
}

function job(doc, name) {
  const found = doc && doc.jobs ? doc.jobs[name] : undefined;
  assert.ok(found, `job ${name} missing`);
  return found;
}

function steps(jobObject) {
  return Array.isArray(jobObject.steps) ? jobObject.steps : [];
}

function stepRun(step) {
  return step && typeof step.run === 'string' ? step.run : '';
}

/** Whole job serialized, so an env mapping or step name is found wherever it sits. */
function jobText(jobObject) {
  return JSON.stringify(jobObject);
}

// ---------------------------------------------------------------------------
// 1. Compile lane: synthetic configuration, staging build, no production input.
// ---------------------------------------------------------------------------

/** Problems with the compile job. Empty means clean. */
function inspectCompileJob(jobObject) {
  const problems = [];
  if (!jobObject) return ['android compile job missing — native coverage would disappear'];

  const text = jobText(jobObject);
  if (jobObject.if !== undefined) {
    problems.push(`android compile job must not be conditional (if: ${JSON.stringify(jobObject.if)})`);
  }
  if (jobObject['continue-on-error'] !== undefined && jobObject['continue-on-error'] !== false) {
    problems.push('android compile job must not set continue-on-error');
  }

  for (const forbidden of ['MOBILE_PRODUCTION_ENV', 'MOBILE_STAGING_ENV', 'GOOGLE_SERVICES_JSON_BASE64', PRODUCTION_HELPER]) {
    if (text.includes(forbidden)) {
      problems.push(`android compile job references ${forbidden} — the compile check must not depend on a production preparation path`);
    }
  }
  for (const secret of ['RELEASE_KEYSTORE_BASE64', 'RELEASE_STORE_PASSWORD', 'RELEASE_KEY_PASSWORD', 'RELEASE_KEY_ALIAS']) {
    if (text.includes(secret)) problems.push(`android compile job references signing secret ${secret}`);
  }
  // A compile check that reads any repository secret stops working for forks and
  // for repositories (like this one) that never configured the production pair.
  if (/\$\{\{\s*secrets\./.test(text)) {
    problems.push('android compile job must not read any repository secret');
  }

  const runs = steps(jobObject).map(stepRun);
  const prepared = steps(jobObject).find((step) => stepRun(step).includes(COMPILE_HELPER));
  if (!prepared) {
    problems.push(`android compile job must run the synthetic fixture ${COMPILE_HELPER}`);
  } else if (String((prepared.env || {})[COMPILE_FLAG]) !== 'true') {
    problems.push(`the fixture step must set ${COMPILE_FLAG}: 'true' so the helper's own guard can pass`);
  }

  const build = runs.find((run) => /npm\s+run\s+build:mobile\b/.test(run));
  if (!build) {
    problems.push('android compile job must still build the mobile bundle');
  } else if (!/--mode\s+staging\b/.test(build)) {
    problems.push('the android compile job must build the staging mobile bundle (--mode staging), not the production default');
  }
  if (!runs.some((run) => /\bcap\s+sync\s+android\b/.test(run))) {
    problems.push('android compile job must sync Capacitor Android');
  }
  if (!runs.some((run) => /\bgradlew\s+assembleDebug\b/.test(run))) {
    problems.push('android compile job must run assembleDebug');
  }

  // Prep must precede the build: a fixture written after Vite ran is dead weight.
  const prepareIndex = steps(jobObject).findIndex((step) => stepRun(step).includes(COMPILE_HELPER));
  const buildIndex = steps(jobObject).findIndex((step) => /npm\s+run\s+build:mobile\b/.test(stepRun(step)));
  if (prepareIndex !== -1 && buildIndex !== -1 && prepareIndex > buildIndex) {
    problems.push('the compile fixture must be written before the mobile build');
  }

  // Nothing may escalate the compile lane into an artifact lane.
  for (const step of steps(jobObject)) {
    const uses = String(step.uses || '');
    if (uses.startsWith('actions/upload-artifact')) {
      problems.push('the compile job must not upload the non-distributable debug APK');
    }
    if (/\bgradlew\b[^\n]*(assemble|bundle)Release/.test(stepRun(step))) {
      problems.push('the compile job must not run a release build');
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 2. Release lane: unchanged production preparation, manual only.
// ---------------------------------------------------------------------------

/** Problems with the signed release job. Empty means the slice left it intact. */
function inspectReleaseJob(jobObject) {
  const problems = [];
  if (!jobObject) return ['release-aab job missing'];

  const text = jobText(jobObject);
  for (const required of ['MOBILE_PRODUCTION_ENV', 'GOOGLE_SERVICES_JSON_BASE64', PRODUCTION_HELPER]) {
    if (!text.includes(required)) {
      problems.push(`release-aab must keep ${required} — production preparation cannot be replaced by the compile fixture`);
    }
  }
  if (text.includes(COMPILE_HELPER) || text.includes(COMPILE_FLAG)) {
    problems.push('release-aab must never use the synthetic compile fixture');
  }
  if (!/workflow_dispatch/.test(String(jobObject.if || ''))) {
    problems.push('release-aab must stay manual-only (if: github.event_name == workflow_dispatch)');
  }
  const runs = steps(jobObject).map(stepRun);
  if (!runs.some((run) => /bundleRelease/.test(run))) problems.push('release-aab must still build the release bundle');
  const failClosed = steps(jobObject).find((step) => /fail closed/i.test(String(step.name || '')));
  if (!failClosed) {
    problems.push('release-aab lost its fail-closed signing preflight');
  } else {
    const body = stepRun(failClosed);
    for (const name of ['RELEASE_STORE_PASSWORD', 'RELEASE_KEY_PASSWORD', 'RELEASE_KEY_ALIAS']) {
      if (!body.includes(name)) problems.push(`fail-closed preflight no longer checks ${name}`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 3. Helper guard: the fixture refuses outside its lane, by construction.
// ---------------------------------------------------------------------------

test('the compile fixture script refuses unless GitHub + Linux + compile-only flags are all set', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', COMPILE_HELPER), 'utf8');
  assert.ok(source.includes("env.GITHUB_ACTIONS !== 'true'"), 'GITHUB_ACTIONS guard missing');
  assert.ok(source.includes("env.RUNNER_OS !== 'Linux'"), 'Linux runner guard missing');
  assert.ok(source.includes(`env[COMPILE_ONLY_FLAG] !== 'true'`), 'compile-only flag guard missing');
  // The prose above the code explains which secrets must NOT be consulted; the
  // executable lines are what may not touch them.
  const code = source
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
  assert.ok(
    !code.includes('MOBILE_PRODUCTION_ENV') && !code.includes('MOBILE_STAGING_ENV'),
    'the fixture must not consult any environment secret'
  );
  for (const marker of ['.invalid', 'com.burgonomics.partner']) {
    assert.ok(source.includes(marker), `synthetic output must use ${marker}`);
  }
});

// ---------------------------------------------------------------------------
// Assertions against the real workflow.
// ---------------------------------------------------------------------------

test('ci.yml: the android compile job uses the synthetic fixture and no production path', () => {
  const problems = inspectCompileJob(job(loadYaml(WORKFLOW), COMPILE_JOB));
  assert.deepStrictEqual(problems, [], `compile job problems:\n  ${problems.join('\n  ')}`);
});

test('ci.yml: release-aab keeps the real production preparation and stays manual-only', () => {
  const problems = inspectReleaseJob(job(loadYaml(WORKFLOW), RELEASE_JOB));
  assert.deepStrictEqual(problems, [], `release job problems:\n  ${problems.join('\n  ')}`);
});

test('ci.yml: the two Android lanes never share a trigger or a preparation step', () => {
  const doc = loadYaml(WORKFLOW);
  const compile = jobText(job(doc, COMPILE_JOB));
  const release = jobText(job(doc, RELEASE_JOB));
  assert.ok(!compile.includes(PRODUCTION_HELPER), 'compile lane must not call the production helper');
  assert.ok(!release.includes(COMPILE_HELPER), 'release lane must not call the compile fixture');
  assert.ok(
    !String(job(doc, COMPILE_JOB).if || '').includes('workflow_dispatch'),
    'the compile lane must run on ordinary pushes and pull requests, not only on dispatch'
  );
});

// ---------------------------------------------------------------------------
// Negative fixtures: the guards must still reject real regressions.
// ---------------------------------------------------------------------------

const cleanCompileFixture = () => ({
  'runs-on': 'ubuntu-latest',
  steps: [
    { run: 'npm ci' },
    { name: 'Prepare synthetic Android compile configuration', run: `node scripts/${COMPILE_HELPER}`, env: { [COMPILE_FLAG]: 'true' } },
    { run: 'npm run build:mobile -- --mode staging' },
    { run: 'npx cap sync android' },
    { run: './gradlew assembleDebug', 'working-directory': 'android' },
  ],
});

test('compile guard: permits the intended lane', () => {
  assert.deepStrictEqual(inspectCompileJob(cleanCompileFixture()), []);
});

test('compile guard: rejects a missing job, a production secret, and the production helper', () => {
  assert.match(inspectCompileJob(undefined).join('\n'), /native coverage would disappear/);

  const withSecret = cleanCompileFixture();
  withSecret.steps[1].env.MOBILE_PRODUCTION_ENV = '${{ secrets.MOBILE_PRODUCTION_ENV }}';
  assert.match(inspectCompileJob(withSecret).join('\n'), /references MOBILE_PRODUCTION_ENV/);

  const withHelper = cleanCompileFixture();
  withHelper.steps[1].run = `node scripts/${PRODUCTION_HELPER} android`;
  assert.match(inspectCompileJob(withHelper).join('\n'), /prepare-native-config\.mjs/);

  const withSigning = cleanCompileFixture();
  withSigning.steps.push({ run: 'echo "$RELEASE_KEYSTORE_BASE64" | base64 -d > android/release.keystore' });
  assert.match(inspectCompileJob(withSigning).join('\n'), /signing secret RELEASE_KEYSTORE_BASE64/);

  const withStagingSecret = cleanCompileFixture();
  withStagingSecret.steps[1].env.MOBILE_STAGING_ENV = '${{ secrets.MOBILE_STAGING_ENV }}';
  assert.match(inspectCompileJob(withStagingSecret).join('\n'), /references MOBILE_STAGING_ENV/);
});

test('compile guard: rejects a production build, a missing fixture, or a missing native step', () => {
  const production = cleanCompileFixture();
  production.steps[2].run = 'npm run build:mobile';
  assert.match(inspectCompileJob(production).join('\n'), /--mode staging/);

  const noFixture = cleanCompileFixture();
  noFixture.steps = noFixture.steps.filter((step) => !step.run.includes(COMPILE_HELPER));
  assert.match(inspectCompileJob(noFixture).join('\n'), /must run the synthetic fixture/);

  const noFlag = cleanCompileFixture();
  delete noFlag.steps[1].env;
  assert.match(inspectCompileJob(noFlag).join('\n'), new RegExp(COMPILE_FLAG));

  for (const [command, expected] of [
    ['npx cap sync android', /Capacitor Android/],
    ['./gradlew assembleDebug', /assembleDebug/],
    ['npm run build:mobile -- --mode staging', /build the mobile bundle/],
  ]) {
    const dropped = cleanCompileFixture();
    dropped.steps = dropped.steps.filter((step) => step.run !== command);
    assert.match(inspectCompileJob(dropped).join('\n'), expected, command);
  }
});

test('compile guard: rejects a gated, artifact-uploading or release-building compile job', () => {
  const conditional = cleanCompileFixture();
  conditional.if = 'false';
  assert.match(inspectCompileJob(conditional).join('\n'), /must not be conditional/);

  const skipping = cleanCompileFixture();
  skipping['continue-on-error'] = 'true';
  assert.match(inspectCompileJob(skipping).join('\n'), /must not set continue-on-error/);

  const anySecret = cleanCompileFixture();
  anySecret.steps.push({ run: 'echo "building"', env: { ANY_SECRET: '${{ secrets.SOMETHING_ELSE }}' } });
  assert.match(inspectCompileJob(anySecret).join('\n'), /must not read any repository secret/);

  const uploading = cleanCompileFixture();
  uploading.steps.push({ uses: 'actions/upload-artifact@v4', with: { name: 'debug-apk', path: 'android/app/build/outputs/apk/debug/*.apk' } });
  assert.match(inspectCompileJob(uploading).join('\n'), /must not upload/);

  const releasing = cleanCompileFixture();
  releasing.steps.push({ run: './gradlew assembleRelease', 'working-directory': 'android' });
  assert.match(inspectCompileJob(releasing).join('\n'), /must not run a release build/);

  const late = cleanCompileFixture();
  late.steps.push(late.steps.splice(1, 1)[0]);
  assert.match(inspectCompileJob(late).join('\n'), /before the mobile build/);
});

const cleanReleaseFixture = () => ({
  if: "github.event_name == 'workflow_dispatch'",
  steps: [
    { run: 'npm ci' },
    { name: 'Prepare native production configuration', run: `node scripts/${PRODUCTION_HELPER} android`, env: { MOBILE_PRODUCTION_ENV: '${{ secrets.MOBILE_PRODUCTION_ENV }}', GOOGLE_SERVICES_JSON_BASE64: '${{ secrets.GOOGLE_SERVICES_JSON_BASE64 }}' } },
    { name: 'Fail closed if release secrets missing', run: 'test -n "$RELEASE_STORE_PASSWORD"\ntest -n "$RELEASE_KEY_PASSWORD"\ntest -n "$RELEASE_KEY_ALIAS"' },
    { run: './gradlew bundleRelease --stacktrace' },
  ],
});

test('release guard: permits the intended signed lane', () => {
  assert.deepStrictEqual(inspectReleaseJob(cleanReleaseFixture()), []);
});

test('release guard: rejects a fixture swap, a lost secret, or an automatic trigger', () => {
  const swapped = cleanReleaseFixture();
  swapped.steps[1].run = `node scripts/${COMPILE_HELPER}`;
  assert.match(inspectReleaseJob(swapped).join('\n'), /MOBILE_PRODUCTION_ENV|never use the synthetic/);

  const noSecret = cleanReleaseFixture();
  delete noSecret.steps[1].env.MOBILE_PRODUCTION_ENV;
  noSecret.steps[1].run = `node scripts/${PRODUCTION_HELPER} android`;
  // The helper name is still present, but the secret mapping is gone.
  assert.match(inspectReleaseJob(noSecret).join('\n'), /MOBILE_PRODUCTION_ENV/);

  const automatic = cleanReleaseFixture();
  delete automatic.if;
  assert.match(inspectReleaseJob(automatic).join('\n'), /manual-only/);

  const noPreflight = cleanReleaseFixture();
  noPreflight.steps = noPreflight.steps.filter((step) => !/fail closed/i.test(String(step.name || '')));
  assert.match(inspectReleaseJob(noPreflight).join('\n'), /fail-closed signing preflight/);

  const weakPreflight = cleanReleaseFixture();
  weakPreflight.steps[2].run = 'test -n "$RELEASE_STORE_PASSWORD"';
  assert.match(inspectReleaseJob(weakPreflight).join('\n'), /no longer checks RELEASE_KEY_PASSWORD/);

  const noBundle = cleanReleaseFixture();
  noBundle.steps = noBundle.steps.filter((step) => !/bundleRelease/.test(step.run));
  assert.match(inspectReleaseJob(noBundle).join('\n'), /release bundle/);
});
