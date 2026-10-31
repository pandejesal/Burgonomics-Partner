import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    // TEST-C: src/config/firebase.ts calls getAuth() at import, so without a
    // local .env any suite that imports it dies with auth/invalid-api-key.
    // These are OBVIOUSLY fake, non-routable test values: the suite is
    // hermetic and can never reach a real Firebase project.
    env: {
      VITE_FIREBASE_API_KEY: 'test-only-fake-api-key',
      VITE_FIREBASE_PROJECT_ID: 'burgonomics-test-not-a-real-project',
      VITE_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000000000',
      VITE_FIREBASE_AUTH_DOMAIN: 'burgonomics-test.invalid',
    },
  },
})
