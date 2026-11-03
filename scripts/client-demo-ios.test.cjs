const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
// No YAML dependency in this app: check executable step blocks, not comments.
// YAML syntax itself is also checked by Actions and the local Python validation.
const source = fs.readFileSync(path.join(__dirname, '../.github/workflows/ios-build.yml'), 'utf8');
const step = name => source.split(`      - name: ${name}\n`)[1]?.split('\n      - ')[0] || '';
test('partner real staging is explicit and excludes compile fixture', () => {
  assert.match(source, /real_staging:[\s\S]*?type: boolean\s+default: false/);
  const fixture = step('Prepare simulator-only compile fixture');
  const staging = step('Prepare real staging simulator configuration');
  assert.match(fixture, /inputs.real_staging != true/);
  assert.match(staging, /github.event_name == 'workflow_dispatch' && inputs.real_staging == true/);
  assert.match(staging, /MOBILE_STAGING_ENV:.*secrets.MOBILE_STAGING_ENV/);
  assert.match(staging, /STAGING_GOOGLE_SERVICE_INFO_PLIST_BASE64:.*secrets.STAGING_GOOGLE_SERVICE_INFO_PLIST_BASE64/);
  assert.match(staging, /run: node scripts\/prepare-demo-simulator.mjs/);
  assert.doesNotMatch(staging, /echo|printenv/);
  assert.ok(source.indexOf('prepare-demo-simulator.mjs') < source.indexOf('build:mobile'));
});
test('partner smoke cannot pass on compilation alone', () => {
  const launch = step('Launch simulator app (manual runs only)');
  assert.match(launch, /if:.*workflow_dispatch/);
  assert.match(launch, /simctl install/);
  assert.match(launch, /simctl launch.*com\.burgonomics\.partner/);
  assert.match(launch, /after-45s\.png/);
  assert.match(launch, /launchctl list/);
  assert.match(launch, /scope\.txt/);
  assert.match(step('Upload launch evidence'), /if: always\(\)[\s\S]*actions\/upload-artifact/);
});
