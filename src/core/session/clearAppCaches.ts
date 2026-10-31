import { queryClient } from '@/App';

/**
 * All user-data localStorage keys used by the partner app.
 * Keep in sync with any new localStorage keys that store user-specific data.
 * Infrastructure keys (auth persistence, theme) are NOT cleared — they are
 * device-level preferences that should survive sign-out.
 */
export const USER_DATA_LOCALSTORAGE_KEYS = [
  // CRM (customersData.ts)
  'burg_crm_customers',
  'burg_crm_segments',

  // Marketing (marketingData.ts)
  'burg_mkt_campaigns',
  'burg_mkt_templates',
  'burg_mkt_offers',
  'burg_mkt_automations',
  'burg_mkt_history',
  'burg_mkt_push_logs',

  // KDS (KDSPage.tsx, useKDSRealtimeStream.ts)
  'kds_checklist',
  'kds_audio_enabled',
  'kds_pending_bumps',

  // Printer settings (ThermalPrinterSettings.tsx)
  'burgonomics_printer_config',

  // Admin theme (ThemeContext.tsx) — device preference, NOT cleared

  // Any future user-data keys should be added here
] as const;

/**
 * Clears all app-level caches on sign-out to prevent cross-user data leaks
 * on shared POS/KDS terminals.
 * Best-effort: each removal is individually try/caught so one failure
 * doesn't block the rest. Never throws.
 */
export function clearAppCaches(): void {
  // 1. React Query cache (module-scoped, staleTime 30s)
  try {
    queryClient.clear();
  } catch (e) {
    console.warn('[clearAppCaches] queryClient.clear() failed:', e);
  }

  // 2. localStorage user-data keys
  if (typeof window !== 'undefined') {
    for (const key of USER_DATA_LOCALSTORAGE_KEYS) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        console.warn(`[clearAppCaches] localStorage.removeItem("${key}") failed:`, e);
      }
    }
  }

  // 3. KDS in-memory pending bumps are cleared by the hook's own cleanup
  //    when the component unmounts (useKDSRealtimeStream returns unsubscribe)
}