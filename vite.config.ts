import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    sourcemap: false,
    // Warn on chunks over 800kB so admin-bundle regressions surface again
    // (heavy chart pages are React.lazy code-split; initial load stays lean).
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            {
              name: 'vendor-firebase',
              test: /[\\/]node_modules[\\/](firebase|@firebase)[\\/]/,
            },
            {
              name: 'vendor-charts',
              test: /[\\/]node_modules[\\/](recharts|d3-[a-z-]+|victory|react-smooth|internmap|decimal\.js|fast-equals)[\\/]/,
            },
            {
              name: 'vendor-motion',
              test: /[\\/]node_modules[\\/]motion[\\/]/,
            },
            {
              name: 'vendor-react',
              test: /[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/,
            },
            {
              name: 'vendor-icons',
              test: /[\\/]node_modules[\\/]lucide-react[\\/]/,
            },
          ],
        },
      },
    },
    rollupOptions: {
      output: {
        // NOTE: vendor splitting lives in rolldownOptions.advancedChunks below
        // (the Rolldown-native API — manualChunks string returns were silently
        // ignored for node_modules, duplicating recharts across chunks).
        // This function only owns admin page grouping.
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')
          if (normalizedId.includes('node_modules')) {
            return undefined
          }
          if (normalizedId.includes('/src/admin/pages/petpooja')) {
            return 'admin-petpooja'
          }
          if (normalizedId.includes('/src/admin/pages/system')) {
            return 'admin-system'
          }
          if (
            normalizedId.includes('/src/admin/pages/AdminMarketing') ||
            normalizedId.includes('/src/admin/pages/marketing') ||
            normalizedId.includes('/src/admin/pages/AdminCampaigns') ||
            normalizedId.includes('/src/admin/pages/AdminCreateCampaign') ||
            normalizedId.includes('/src/admin/pages/AdminTemplates') ||
            normalizedId.includes('/src/admin/pages/AdminAutomation')
          ) {
            return 'admin-marketing'
          }
          if (
            normalizedId.includes('/src/admin/pages/AdminAnalytics') ||
            normalizedId.includes('/src/admin/pages/AdminCustomerAnalytics')
          ) {
            return 'admin-analytics'
          }
          if (
            normalizedId.includes('/src/admin/pages/AdminPayments') ||
            normalizedId.includes('/src/admin/pages/AdminPaymentDetails') ||
            normalizedId.includes('/src/admin/pages/AdminPaymentHealth') ||
            normalizedId.includes('/src/admin/pages/AdminRefunds') ||
            normalizedId.includes('/src/admin/pages/AdminReconciliation')
          ) {
            return 'admin-payments'
          }
          if (
            normalizedId.includes('/src/admin/pages/AdminCustomers') ||
            normalizedId.includes('/src/admin/pages/AdminCustomerProfile') ||
            normalizedId.includes('/src/admin/pages/AdminSegments') ||
            normalizedId.includes('/src/admin/pages/AdminLoyalty')
          ) {
            return 'admin-customers'
          }
          if (normalizedId.includes('/src/admin/') || normalizedId.includes('/src/pages/admin/')) {
            return 'admin-core'
          }
        },
      },
    },
  },
})
