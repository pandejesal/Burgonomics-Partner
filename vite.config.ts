import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')
          if (normalizedId.includes('node_modules')) {
            if (normalizedId.includes('firebase')) {
              return 'firebase'
            }
            if (
              normalizedId.includes('recharts') ||
              normalizedId.includes('d3') ||
              normalizedId.includes('victory') ||
              normalizedId.includes('react-smooth') ||
              normalizedId.includes('internmap') ||
              normalizedId.includes('decimal.js') ||
              normalizedId.includes('fast-equals')
            ) {
              return 'vendor-charts'
            }
            if (normalizedId.includes('lucide-react')) {
              return 'vendor-icons'
            }
            if (normalizedId.includes('motion')) {
              return 'vendor-motion'
            }
            return 'vendor'
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



