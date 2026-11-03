import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareDemoConfig } from './prepare-demo-simulator.mjs';
const project = 'burgonomics-7faa8';
const values = {
  VITE_APP_ENV: 'staging', VITE_FIREBASE_PROJECT_ID: project,
  VITE_FIREBASE_API_KEY: 'A'.padEnd(39, 'x'), VITE_FIREBASE_AUTH_DOMAIN: `${project}.firebaseapp.com`,
  VITE_FIREBASE_STORAGE_BUCKET: `${project}.firebasestorage.app`, VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
  VITE_FIREBASE_APP_ID: '1:1234567890:web:test', VITE_API_BASE_URL: `https://asia-south1-${project}.cloudfunctions.net/api`,
  VITE_RAZORPAY_KEY_ID: 'rzp_test_fixture',
};
const native = `<plist><dict><key>BUNDLE_ID</key><string>com.burgonomics.partner</string><key>PROJECT_ID</key><string>${project}</string><key>API_KEY</key><string>${values.VITE_FIREBASE_API_KEY}</string><key>GCM_SENDER_ID</key><string>1234567890</string><key>GOOGLE_APP_ID</key><string>1:1234567890:ios:test</string></dict></plist>`;
const env = { MOBILE_STAGING_ENV: JSON.stringify(values), STAGING_GOOGLE_SERVICE_INFO_PLIST_BASE64: Buffer.from(native).toString('base64') };
test('partner accepts genuine staging shape without enabling push or fixture APIs', () => {
  const output = prepareDemoConfig(env, 'com.burgonomics.partner');
  assert.equal(output.native, native);
  assert.match(output.dotenv, /VITE_FCM_ENABLED="false"/);
  assert.doesNotMatch(output.dotenv, /ci-simulator|rzp_live_/);
});
test('partner refuses live project, payment, foreign API, enabled mock and wrong native bundle', () => {
  for (const change of [{ VITE_FIREBASE_PROJECT_ID: 'burgonomics-prod' }, { VITE_APP_ENV: 'production' }, { VITE_RAZORPAY_KEY_ID: 'rzp_live_forbidden' }, { VITE_API_BASE: 'https://foreign.example/api' }, { VITE_MOCK_PAYMENTS: 'true' }]) {
    assert.throws(() => prepareDemoConfig({ ...env, MOBILE_STAGING_ENV: JSON.stringify({ ...values, ...change }) }, 'com.burgonomics.partner'));
  }
  assert.throws(() => prepareDemoConfig(env, 'com.burgonomics'), /mismatch/);
  assert.throws(() => prepareDemoConfig({}, 'com.burgonomics.partner'), /MOBILE_STAGING_ENV/);
});
