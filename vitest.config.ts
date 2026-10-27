import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { SYNTHETIC_TEST_ENV } from './tests/testEnv.ts'

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
    setupFiles: ['./vitest.setup.ts'],
    // Single source of truth: tests/testEnv.ts. Do not inline literals here.
    env: { ...SYNTHETIC_TEST_ENV },
  },
})
