/**
 * Thermal printer preferences — one stored shape, one reader/writer.
 *
 * These used to live inside `ThermalPrinterSettings.tsx`, so anything that
 * wanted the configured paper width had to import a React screen. The live
 * KOT path never did, which is why a "58mm / 2 copies" outlet still printed
 * 48-column single slips (A7 #7): the control saved a value no print path read.
 */

export type PrinterPaperSize = '80mm' | '58mm';
export type PrinterConnectionType = 'usb' | 'network' | 'bluetooth';

export interface PrinterConfig {
  paperSize: PrinterPaperSize;
  connectionType: PrinterConnectionType;
  copies: number;
}

export const PRINTER_CONFIG_KEY = 'burgonomics_printer_config';

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  paperSize: '80mm',
  connectionType: 'usb',
  copies: 1,
};

/**
 * Only the keys this app actually uses survive. A stored config written by an
 * older build may carry the retired auto-print flag, which nothing consumed
 * (Petpooja prints the kitchen tickets while an outlet is linked). Picking
 * fields explicitly means a legacy blob can never resurrect a dead control.
 */
export function getStoredPrinterConfig(): PrinterConfig {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(PRINTER_CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const paperSize: PrinterPaperSize = parsed.paperSize === '58mm' ? '58mm' : '80mm';
        const connectionType: PrinterConnectionType =
          parsed.connectionType === 'network'
            ? 'network'
            : parsed.connectionType === 'bluetooth'
              ? 'bluetooth'
              : 'usb';
        const copies = parsed.copies === 2 ? 2 : 1;
        return { paperSize, connectionType, copies };
      }
    }
  } catch (e) {
    console.warn('Failed to parse printer config:', e);
  }
  return { ...DEFAULT_PRINTER_CONFIG };
}

export function savePrinterConfig(config: PrinterConfig): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PRINTER_CONFIG_KEY, JSON.stringify(config));
    }
  } catch (e) {
    console.warn('Failed to save printer config:', e);
  }
}
