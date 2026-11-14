/**
 * Partner dependency guards (phase39).
 *
 * Plain `node:test` so it runs with no install and no test-framework config:
 * it reads `package.json` and `package-lock.json` only.
 *
 *   node --test scripts/partner-dependency-guards.test.mjs
 *
 * What it pins, and why a floor rather than an exact pin: the fixed releases
 * below are the minimum published versions that clear the recorded advisory
 * for each package. Accepting anything at or above the floor keeps routine
 * in-range patch updates legitimate, while failing the moment the graph is
 * pinned back onto a vulnerable version.
 *
 * It also pins the *limits* of this remediation, so a later "fix" cannot
 * quietly do more than was approved:
 * - no `overrides` block and no Firebase major bump (the `@grpc/grpc-js`
 *   `~1.9.0` finding stays open rather than being forced or downgraded),
 * - no unnecessary Capacitor plugin bumps beyond the coordinated core set,
 * - intact native peer relationships between core / ios / android / cli,
 * - npm as the single package manager, with a declared version.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test, { describe } from 'node:test';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const readJson = (name) => JSON.parse(readFileSync(path.join(appRoot, name), 'utf8'));

const pkg = readJson('package.json');
const lock = readJson('package-lock.json');

/** Installed version from the lockfile, or undefined when absent. */
const locked = (name) => lock.packages?.[`node_modules/${name}`]?.version;

/**
 * Strict `major.minor.patch` parse. Returns null for anything that is not a
 * complete stable triple, so an unparseable or range-like string can never be
 * treated as satisfying a floor.
 *
 * Build metadata (`+sha`) is discarded — it carries no ordering meaning.
 * A prerelease (`-alpha`, `-rc.1`, `-next.0`) is *not* stripped: it is
 * reported separately, because a prerelease sorts below its stable release and
 * therefore must never clear a stable remediation floor.
 */
const parseVersion = (version) => {
  if (typeof version !== 'string') return null;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
};

/** Parse `major.minor.patch` from a version string, rejecting prereleases. */
const semver = (version) => {
  const parsed = parseVersion(version);
  assert.ok(parsed, `not a parseable stable version: ${version}`);
  assert.equal(parsed.prerelease, null, `prerelease is not a stable version: ${version}`);
  return [parsed.major, parsed.minor, parsed.patch];
};

/** Numeric comparison over stable triples only; callers must reject prereleases. */
const compare = (a, b) => {
  const [aMajor, aMinor, aPatch] = semver(a);
  const [bMajor, bMinor, bPatch] = semver(b);
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
};

/**
 * Does `version` satisfy `floor`? Fail-closed by construction:
 * - an unparseable version, or any prerelease on either side, is `false`;
 * - otherwise it is a plain numeric triple comparison.
 *
 * Exported as a pure predicate so boundary cases can be tested with synthetic
 * versions instead of relying on whatever the lockfile happens to hold.
 */
const meetsFloor = (version, floor) => {
  const candidate = parseVersion(version);
  const target = parseVersion(floor);
  if (!candidate || !target) return false;
  if (candidate.prerelease !== null || target.prerelease !== null) return false;
  if (candidate.major !== target.major) return candidate.major > target.major;
  if (candidate.minor !== target.minor) return candidate.minor > target.minor;
  return candidate.patch >= target.patch;
};

const atLeast = (name, floor) => {
  const version = locked(name);
  assert.ok(version, `${name} is missing from the lockfile`);
  assert.ok(
    meetsFloor(version, floor),
    `${name} ${version} does not satisfy the fixed floor ${floor}`,
  );
};

/** Declared dependency range in package.json (dependencies or devDependencies). */
const declaredRange = (name) => pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];

describe('advisory fixed floors', () => {
  test('zod clears the oversized-constrained-collection advisory', () => {
    // Not imported by app source today (peer of @hookform/resolvers only), but
    // it is a declared direct dependency and must not ship a vulnerable copy.
    atLeast('zod', '4.6.6');
    assert.match(declaredRange('zod') ?? '', /^\^?4\.6\.[6-9]$/);
  });

  test('vite clears the dev-server / fs / middleware advisories', () => {
    atLeast('vite', '8.3.3');
    assert.match(declaredRange('vite') ?? '', /^\^?8\.3\.[3-9]$/);
  });

  test('vitest and its exact-pinned mocker clear the mock-registration advisories', () => {
    atLeast('vitest', '5.0.3');
    atLeast('@vitest/mocker', '5.0.3');
    assert.match(declaredRange('vitest') ?? '', /^\^?5\.0\.[3-9]$/);
    // vitest pins @vitest/mocker to its own version, so a skew would be a bug.
    assert.equal(locked('@vitest/mocker'), locked('vitest'));
  });

  test('re2js clears the lookbehind DoS advisory (WebView-reachable path)', () => {
    // Transitive via @firebase/firestore's ^2.8.3 — resolved in range, not forced.
    atLeast('re2js', '2.8.7');
  });

  test('source-map-js clears the indexed-section DoS advisory', () => {
    // Transitive via @tailwindcss/node, postcss and css-tree (^1.2.1).
    atLeast('source-map-js', '1.2.2');
  });
});

describe('floor comparison boundaries (synthetic fixtures)', () => {
  // These use invented versions, not the lockfile: they pin the *comparison*
  // so a wrong floor cannot pass silently on the real resolved versions.
  test('glob: the advisory ends at 14.0.1, so 14.0.1 is still bad', () => {
    assert.equal(meetsFloor('14.0.1', '14.0.2'), false, '14.0.1 must be rejected');
    assert.equal(meetsFloor('14.0.2', '14.0.2'), true, 'the first fixed release must pass');
    assert.equal(meetsFloor('14.0.0', '14.0.2'), false);
    assert.equal(meetsFloor('13.9.9', '14.0.2'), false);
  });

  test('minimatch: the advisory ends at 11.0.0, so 11.0.0 is still bad', () => {
    assert.equal(meetsFloor('11.0.0', '11.0.1'), false, '11.0.0 must be rejected');
    assert.equal(meetsFloor('11.0.1', '11.0.1'), true, 'the first fixed release must pass');
    assert.equal(meetsFloor('10.2.6', '11.0.1'), false);
  });

  test('a prerelease never satisfies a stable remediation floor', () => {
    // `4.6.6-alpha` sorts below 4.6.6 by spec; comparing only major/minor/patch
    // would let it through.
    assert.equal(meetsFloor('4.6.6-alpha.1', '4.6.6'), false);
    assert.equal(meetsFloor('8.3.3-beta', '8.3.3'), false);
    assert.equal(meetsFloor('5.0.3-rc.1', '5.0.3'), false);
    assert.equal(meetsFloor('14.0.2-next.0', '14.0.2'), false);
    // A later prerelease of a later version is still a prerelease.
    assert.equal(meetsFloor('15.0.0-nightly.20261101', '14.0.2'), false);
  });

  test('build metadata is not a prerelease and does not affect the floor', () => {
    assert.equal(meetsFloor('4.6.7+build.5', '4.6.6'), true);
    assert.equal(meetsFloor('14.0.4+sha.abc', '14.0.2'), true);
  });

  test('unparseable versions fail closed', () => {
    for (const bad of [undefined, null, '', 'latest', '^14.0.2', 'x.y.z']) {
      assert.equal(meetsFloor(bad, '14.0.2'), false, `${String(bad)} must not pass`);
    }
  });
});

describe('CLI filesystem-chain floors', () => {
  test('rimraf / glob / minimatch / brace-expansion are all at or above their fix', () => {
    // Chain: @capacitor/cli -> rimraf ^6.0.1 -> glob ^14.0.3 -> minimatch
    // ^11.0.5 -> brace-expansion ^5.0.12. Every hop is satisfied by its own
    // parent range; no override is involved.
    atLeast('rimraf', '6.1.4');
    // Advisory ranges are inclusive of their upper bound: glob's ends at
    // 14.0.1 and minimatch's at 11.0.0, so the first safe release is the next
    // patch. Resolving 14.0.4 / 11.0.6 satisfies this today.
    atLeast('glob', '14.0.2');
    atLeast('minimatch', '11.0.1');
    atLeast('brace-expansion', '5.0.12');
  });
});

describe('coordinated Capacitor native set', () => {
  const core = () => locked('@capacitor/core');

  test('core, android, ios and cli all resolve to the same 8.6.x line', () => {
    for (const name of ['@capacitor/core', '@capacitor/android', '@capacitor/ios', '@capacitor/cli']) {
      const version = locked(name);
      assert.ok(version, `${name} missing from lockfile`);
      assert.ok(compare(version, '8.6.0') >= 0, `${name} ${version} is below 8.6.0`);
      assert.ok(compare(version, '8.7.0') < 0, `${name} ${version} exceeds the approved 8.6 line`);
      assert.equal(semver(version)[0] * 100 + semver(version)[1], 806,
        `${name} ${version} is not on the 8.6 line`);
    }
  });

  test('the native platforms still cohere with core and with each other', () => {
    const coreVersion = core();
    for (const name of ['@capacitor/android', '@capacitor/ios']) {
      const peer = lock.packages[`node_modules/${name}`]?.peerDependencies?.['@capacitor/core'];
      assert.ok(peer, `${name} declares no @capacitor/core peer`);
      // Same minor line as the installed core: the CLI warns when a platform
      // and core differ by a minor or major version.
      assert.equal(peer, `^${coreVersion}`,
        `${name} peer ${peer} does not match installed core ${coreVersion}`);
    }
    // iOS SPM resolves `capacitor-swift-pm` by the installed @capacitor/ios
    // version, so cli and ios staying in step keeps that pin resolvable.
    assert.equal(semver(locked('@capacitor/cli'))[1], semver(locked('@capacitor/ios'))[1]);
  });
});

describe('scope limits — nothing beyond the approved slice', () => {
  test('no npm overrides were introduced', () => {
    assert.equal(pkg.overrides, undefined, 'package.json must not force transitive versions');
    const rootOverrides = lock.packages?.['']?.overrides;
    assert.equal(rootOverrides, undefined, 'lockfile root must not record overrides');
  });

  test('Firebase stays on the approved 12.x major (no downgrade, no 13 upgrade)', () => {
    const range = declaredRange('firebase') ?? '';
    assert.match(range, /^\^12\./, `firebase range changed to ${range}`);
    const version = locked('firebase');
    assert.ok(version, 'firebase missing from lockfile');
    assert.equal(semver(version)[0], 12, `firebase resolved to ${version}`);
  });

  test('the @grpc/grpc-js finding is left open, not overridden', () => {
    // Firestore still declares ~1.9.0, so the advisory cannot be closed by a
    // supported version bump. This asserts the *absence* of a workaround: no
    // override, and no silent 1.13+ forcing outside the parent range.
    const firestore = lock.packages['node_modules/@firebase/firestore'];
    assert.ok(firestore, '@firebase/firestore missing from lockfile');
    assert.match(firestore.dependencies?.['@grpc/grpc-js'] ?? '', /^~1\.9\./,
      'Firestore no longer declares ~1.9.0 — reopen the grpc assessment');
    assert.ok(pkg.overrides === undefined);
  });

  test('no unnecessary Capacitor plugin bump', () => {
    // Only the coordinated core set moves. Plugins that already accept
    // @capacitor/core >=8.0.0 stay on their reviewed versions.
    assert.equal(locked('@capacitor-firebase/app-check'), '8.5.2');
    assert.equal(lock.packages['node_modules/@capacitor-firebase/app-check']
      ?.peerDependencies?.firebase, '^12.6.0');
    for (const [name, version] of Object.entries({
      '@capacitor/app': '8.1.1',
      '@capacitor/haptics': '8.0.2',
      '@capacitor/keyboard': '8.0.5',
      '@capacitor/local-notifications': '8.3.1',
      '@capacitor/network': '8.0.1',
      '@capacitor/preferences': '8.0.1',
      '@capacitor/push-notifications': '8.1.2',
      '@capacitor/splash-screen': '8.0.2',
      '@capacitor/status-bar': '8.0.3',
    })) {
      assert.equal(locked(name), version, `${name} moved outside the approved slice`);
    }
  });
});

describe('local tooling contracts', () => {
  test('js-yaml is an exact devDependency so iOS workflow guards never skip', () => {
    // The iOS structural guards parse YAML. Resolving the parser from a
    // Customer-named sibling path is not a dependency contract, and a missing
    // parser made the safety checks skip instead of fail. Pinned exactly so the
    // parser behaviour the guards assert cannot drift under them.
    assert.equal(declaredRange('js-yaml'), '4.3.2');
    assert.equal(locked('js-yaml'), '4.3.2');
    // Test/build metadata only — no install hook to run during this phase.
    const entry = lock.packages['node_modules/js-yaml'];
    assert.equal(entry.dev, true);
    const installed = path.join(appRoot, 'node_modules/js-yaml/package.json');
    assert.ok(existsSync(installed), 'js-yaml is not installed; run npm ci --ignore-scripts');
    const scripts = JSON.parse(readFileSync(installed, 'utf8')).scripts ?? {};
    for (const hook of ['preinstall', 'install', 'postinstall']) {
      assert.equal(scripts[hook], undefined, `js-yaml must not run ${hook}`);
    }
  });
});

describe('package manager policy', () => {  test('npm is declared and pinned to the reviewed canonical version', () => {
    assert.equal(pkg.packageManager, 'npm@11.17.0');
  });

  test('the lockfile is npm v3 and no competing lockfile exists', () => {
    assert.equal(lock.lockfileVersion, 3);
    // `.npmrc` is deliberately NOT listed: an npm configuration file is a
    // legitimate way to express npm policy, not a second package manager.
    for (const competing of ['bun.lock', 'bun.lockb', 'yarn.lock', 'pnpm-lock.yaml']) {
      assert.equal(existsSync(path.join(appRoot, competing)), false,
        `${competing} must not exist; npm is the single package manager`);
    }
  });

  test('the scripts-disabled install policy is documented in the source tree', () => {
    // Source-of-truth policy ships with the app, so a fresh clone or CI
    // checkout can validate it. Nothing here may depend on this workstation's
    // retained evidence folder.
    const doc = path.join(appRoot, 'DEPENDENCIES.md');
    assert.ok(existsSync(doc), 'missing source dependency policy DEPENDENCIES.md');
    const text = readFileSync(doc, 'utf8');
    assert.match(text, /--ignore-scripts/);
    assert.match(text, /npm ci/);
    assert.match(text, /npm@11\.17\.0/);
    // The doc must not promise enforcement the tooling does not provide.
    assert.ok(
      /does not\s+enforce a version by itself/i.test(text) || !/enforces/i.test(text),
      'DEPENDENCIES.md must not claim packageManager enforces an npm version',
    );
  });
});
