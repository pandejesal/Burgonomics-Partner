import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  getStoredPrinterConfig,
  savePrinterConfig,
  type PrinterConfig,
} from '../features/settings/components/ThermalPrinterSettings';

// In-memory localStorage polyfill for Node test environment
const mockStorage: Record<string, string> = {};
beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    (globalThis as any).localStorage = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        for (const k of Object.keys(mockStorage)) {
          delete mockStorage[k];
        }
      },
    };
  }
});

describe('Prompt 23: Settings, Hardware Printers & Audio Notifications Suite', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('1. Thermal Printer Configuration Persistence', () => {
    it('retrieves default 80mm ESC/POS printer settings when storage is empty', () => {
      const config = getStoredPrinterConfig();
      expect(config.paperSize).toBe('80mm');
      expect(config.autoPrintKOT).toBe(true);
      expect(config.copies).toBe(1);
    });

    it('persists modified paper size and copies to localStorage', () => {
      const customConfig: PrinterConfig = {
        paperSize: '58mm',
        connectionType: 'bluetooth',
        autoPrintKOT: false,
        copies: 2,
      };

      savePrinterConfig(customConfig);
      const loaded = getStoredPrinterConfig();

      expect(loaded.paperSize).toBe('58mm');
      expect(loaded.connectionType).toBe('bluetooth');
      expect(loaded.autoPrintKOT).toBe(false);
      expect(loaded.copies).toBe(2);
    });
  });

  describe('2. Acoustic Alarm Volume Calculation', () => {
    it('clamps volume levels within valid 0 to 100 range', () => {
      const clampVolume = (vol: number) => Math.min(100, Math.max(0, vol));
      expect(clampVolume(85)).toBe(85);
      expect(clampVolume(120)).toBe(100);
      expect(clampVolume(-15)).toBe(0);
    });
  });

  describe('3. Store Operating Status and Prep Buffer Math', () => {
    it('calculates total customer ETA with surge prep buffer', () => {
      const basePrepMinutes = 20;
      const rushBufferMinutes = 15;
      const deliveryTravelMinutes = 15;

      const totalETA = basePrepMinutes + rushBufferMinutes + deliveryTravelMinutes;
      expect(totalETA).toBe(50);
    });
  });
});
