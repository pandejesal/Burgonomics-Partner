import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Dead KOT hardware code removed (fix wave 2026-11-20).
 *
 * Owner decision: Petpooja prints the kitchen tickets while an outlet is
 * linked, so the Partner app's own "Auto-Print KOT on Incoming Online Orders"
 * switch described a print path that does not exist:
 *
 *   - `autoPrintKOT` had NO consumer: nothing read the flag, so a kitchen that
 *     turned it off (or on) changed nothing — a switch that claims to control
 *     printing and controls nothing is the same class of defect as a toggle
 *     that claims to save and does not.
 *   - `generateESCPOSBuffer` / `generateQRCodeBlock` were reachable only from
 *     the unit tests and the test-print path, i.e. they built binary ESC/POS
 *     commands that no printer transport ever sent.
 *
 * What must stay: the ASCII receipt formatter and the test print, which really
 * renders a slip into the OS print dialog.
 */

const root = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

// In-memory localStorage polyfill for the node test environment.
const mockStorage: Record<string, string> = {};
beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    (globalThis as any).localStorage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        for (const k of Object.keys(mockStorage)) delete mockStorage[k];
      },
    };
  }
});

describe('the auto-print KOT switch is gone, not merely hidden', () => {
  it('PrinterConfig no longer carries autoPrintKOT', () => {
    const source = read('src/features/settings/components/ThermalPrinterSettings.tsx');
    expect(source).not.toContain('autoPrintKOT');
  });

  it('the settings screen no longer renders an Auto-Print KOT control', () => {
    const source = read('src/features/settings/components/ThermalPrinterSettings.tsx');
    expect(source).not.toMatch(/Auto-Print KOT/);
    expect(source).not.toMatch(/prints kitchen slip when order lands/i);
  });

  it('a legacy stored config cannot resurrect the removed key', async () => {
    beforeEach(() => mockStorage && Object.keys(mockStorage).forEach((k) => delete mockStorage[k]));
    localStorage.clear();
    localStorage.setItem(
      'burgonomics_printer_config',
      JSON.stringify({
        paperSize: '58mm',
        connectionType: 'bluetooth',
        autoPrintKOT: false,
        copies: 2,
      }),
    );
    const { getStoredPrinterConfig } = await import(
      '../src/features/settings/components/ThermalPrinterSettings'
    );
    const config = getStoredPrinterConfig();
    expect(config).toEqual({
      paperSize: '58mm',
      connectionType: 'bluetooth',
      copies: 2,
    });
    expect('autoPrintKOT' in config).toBe(false);
  });
});

describe('dead ESC/POS builders are removed', () => {
  it('thermalPrinterService no longer exports an ESC/POS buffer or QR block builder', () => {
    const source = read('src/features/orders/services/thermalPrinterService.ts');
    expect(source).not.toContain('generateESCPOSBuffer');
    expect(source).not.toContain('generateQRCodeBlock');
  });

  it('no production module still references them', () => {
    for (const file of [
      'src/features/settings/components/ThermalPrinterSettings.tsx',
      'src/features/orders/components/KOTPrintPreview.tsx',
      'src/features/orders/index.ts',
    ]) {
      const source = read(file);
      expect(source).not.toContain('generateESCPOSBuffer');
      expect(source).not.toContain('generateQRCodeBlock');
    }
  });
});

describe('the real slip printer still works', () => {
  it('keeps the ASCII formatter and the test print', () => {
    const service = read('src/features/orders/services/thermalPrinterService.ts');
    expect(service).toContain('export function formatOrderForKOT');
    expect(service).toContain('export function generateASCIIReceipt');

    const settings = read('src/features/settings/components/ThermalPrinterSettings.tsx');
    expect(settings).toContain('generateASCIIReceipt');
    expect(settings).toMatch(/Test Print KOT/);
  });
});
