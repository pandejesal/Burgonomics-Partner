# Dependencies

Authoritative dependency source is **npm** with the committed
`package-lock.json` (`lockfileVersion 3`). Commands were validated with
**npm 11.17.0**, declared in `package.json` as `packageManager: npm@11.17.0`.
That field records intent for developers and tooling that chooses to read it —
it does not enforce a version by itself, and CI does not verify it.

`README.md`'s "npm or pnpm" line predates this policy. npm is the only
supported manager — do not add a second lockfile.

## Install

Preparation and frozen installs use lifecycle scripts disabled:
```bash
npm install --package-lock-only --ignore-scripts   # resolve/prepare
npm ci --ignore-scripts                            # frozen install
```

No `.npmrc` is required. An npm configuration file is a legitimate way to
express npm policy, not a second package manager; `--ignore-scripts` stays
written into each command so the policy is visible. Enabling any install hook
needs a named, reviewed exception first.

## Rules

- No blanket rebuilds, `audit fix`, `--force`, `overrides`, or severity/test
  classification changes to make counts look better.
- Dev-only advisories are not "fixed" by reclassifying them out of the count.
- `npm audit` currently reports **5 high nodes** (`@grpc/grpc-js`,
  `@firebase/firestore`, `@firebase/firestore-compat`, `firebase`,
  `@capacitor-firebase/app-check`). This is **recorded residual risk, not a
  waiver**: no supported Firebase release moves Firestore off `~1.9.0`.

## Not yet verified

The Capacitor 8.6.0 native set needs a generated `cap sync` and review. Xcode
and new-source hardware acceptance remain open; nothing here asserts native
behaviour.

Local phase39 evidence (audits, lock delta) lives in
`staging-review-20261030/39-dependency-ios-hardening-20261110-r1/` — a local
report path, not a portable guarantee.
