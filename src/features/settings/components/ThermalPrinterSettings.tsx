import React, { useState, useEffect } from 'react';
import { Printer, CheckCircle2, Sparkles, Sliders, RefreshCw, Usb, Wifi, Bluetooth } from 'lucide-react';
import { toast } from 'sonner';
import { generateASCIIReceipt } from '@/features/orders/services/thermalPrinterService';

export interface PrinterConfig {
  paperSize: '80mm' | '58mm';
  connectionType: 'usb' | 'network' | 'bluetooth';
  copies: number;
}

const DEFAULT_CONFIG: PrinterConfig = {
  paperSize: '80mm',
  connectionType: 'usb',
  copies: 1,
};

/**
 * Only the keys this screen actually uses survive. A stored config written by
 * an older build may carry the retired auto-print flag, which nothing ever
 * consumed (Petpooja prints the kitchen tickets while an outlet is linked).
 * Picking fields explicitly means a legacy blob can never resurrect a control
 * that does nothing.
 */
export function getStoredPrinterConfig(): PrinterConfig {
  return readStoredConfig();
}

function readStoredConfig(): PrinterConfig {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('burgonomics_printer_config');
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const paperSize = parsed.paperSize === '58mm' ? '58mm' : '80mm';
        const connectionType =
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
  return { ...DEFAULT_CONFIG };
}

export function savePrinterConfig(config: PrinterConfig): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('burgonomics_printer_config', JSON.stringify(config));
    }
  } catch (e) {
    console.warn('Failed to save printer config:', e);
  }
}

export function ThermalPrinterSettings() {
  const [config, setConfig] = useState<PrinterConfig>(getStoredPrinterConfig);
  const [isTestingPrint, setIsTestingPrint] = useState(false);

  useEffect(() => {
    savePrinterConfig(config);
  }, [config]);

  // Honest test print: renders a REAL slip (same ASCII formatter as live
  // KOTs) into a print window and opens the OS print dialog. Success toasts
  // only after the dialog is invoked — the old code toasted success without
  // touching any printer path, so dead hardware passed setup.
  const handleTestPrint = () => {
    setIsTestingPrint(true);
    try {
      const slip = generateASCIIReceipt({
        orderId: 'test-print',
        shortCode: '#TEST',
        orderType: 'TEST',
        branchName: 'Burgonomics Store',
        createdAtFormatted: new Date().toLocaleString('en-IN'),
        items: [{ name: 'Test KOT Slip', quantity: 1, price: 0 }],
        subtotal: 0,
        tax: 0,
        total: 0,
        specialNotes: `Test print — ${config.paperSize}, ${config.copies} cop${config.copies === 1 ? 'y' : 'ies'}, ${config.connectionType}. If this prints, the printer path works.`,
      });
      const win = window.open('', '_blank', 'width=320,height=600');
      if (!win) {
        toast.error('Popup blocked — allow popups to test print.');
        return;
      }
      win.document.write(
        `<html><head><title>Test KOT Slip</title></head><body><pre style="font-family:monospace;font-size:12px;white-space:pre-wrap;">${slip
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')}</pre><script>window.onload=()=>window.print()<\/script></body></html>`
      );
      win.document.close();
      toast.success('Test slip sent to the print dialog — confirm it prints.');
    } catch (err: any) {
      toast.error(err?.message || 'Test print failed before reaching the printer.');
    } finally {
      setTimeout(() => {
        setIsTestingPrint(false);
      }, 800);
    }
  };

  return (
    <div className="p-6 rounded-3xl bg-[#0E4825]/10 border border-emerald-500/30 space-y-6 text-white">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between border-b border-neutral-800 pb-4">
        <div className="flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-2xl bg-[#0E4825] border border-emerald-500/40 text-emerald-300 shrink-0">
            <Printer className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-black tracking-tight text-white flex flex-wrap items-center gap-2 min-w-0 break-words">
              <span>Thermal KOT Printer Configuration</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-400 font-mono font-bold shrink-0">
                ESC/POS Ready
              </span>
            </h2>
            <p className="text-xs text-neutral-400 min-w-0 break-words">
              Configure 80mm/58mm thermal receipts and interface connections
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={isTestingPrint}
          onClick={handleTestPrint}
          className="px-4 py-2 rounded-xl bg-[#FF6600] hover:bg-[#e05a00] text-white font-black text-xs uppercase tracking-wider shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0 self-start sm:self-auto"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>{isTestingPrint ? 'Printing Slip...' : 'Test Print KOT'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Paper Size Selector */}
        <div className="space-y-2">
          <label className="block text-xs font-bold uppercase text-neutral-400">
            Paper Roll Width
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, paperSize: '80mm' }))}
              className={`p-3 rounded-2xl border text-left transition-colors cursor-pointer ${
                config.paperSize === '80mm'
                  ? 'bg-[#0E4825] border-emerald-500 text-white shadow-xs'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-black text-sm">80mm Standard</span>
                {config.paperSize === '80mm' && <CheckCircle2 className="w-4 h-4 text-emerald-300" />}
              </div>
              <p className="text-[11px] text-neutral-400">Wide QSR standard (42 columns)</p>
            </button>

            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, paperSize: '58mm' }))}
              className={`p-3 rounded-2xl border text-left transition-colors cursor-pointer ${
                config.paperSize === '58mm'
                  ? 'bg-[#0E4825] border-emerald-500 text-white shadow-xs'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-black text-sm">58mm Compact</span>
                {config.paperSize === '58mm' && <CheckCircle2 className="w-4 h-4 text-emerald-300" />}
              </div>
              <p className="text-[11px] text-neutral-400">Mobile Bluetooth slip (32 cols)</p>
            </button>
          </div>
        </div>

        {/* Interface Connection Type */}
        <div className="space-y-2">
          <label className="block text-xs font-bold uppercase text-neutral-400">
            Hardware Interface
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, connectionType: 'usb' }))}
              className={`p-2.5 rounded-xl border font-bold text-xs flex flex-col items-center gap-1.5 transition-colors cursor-pointer ${
                config.connectionType === 'usb'
                  ? 'bg-neutral-200 text-black border-white shadow-xs'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              <Usb className="w-4 h-4" />
              <span>USB Cable</span>
            </button>

            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, connectionType: 'network' }))}
              className={`p-2.5 rounded-xl border font-bold text-xs flex flex-col items-center gap-1.5 transition-colors cursor-pointer ${
                config.connectionType === 'network'
                  ? 'bg-neutral-200 text-black border-white shadow-xs'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              <Wifi className="w-4 h-4" />
              <span>LAN / WiFi</span>
            </button>

            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, connectionType: 'bluetooth' }))}
              className={`p-2.5 rounded-xl border font-bold text-xs flex flex-col items-center gap-1.5 transition-colors cursor-pointer ${
                config.connectionType === 'bluetooth'
                  ? 'bg-neutral-200 text-black border-white shadow-xs'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              <Bluetooth className="w-4 h-4" />
              <span>Bluetooth</span>
            </button>
          </div>
        </div>
      </div>

      {/* Copies per order. The card that used to sit beside this also carried
          an automatic kitchen-slip switch: nothing read its flag, and Petpooja
          prints the kitchen ticket for a linked outlet, so it was removed
          rather than left as a control that controls nothing. */}
      <div className="pt-2 border-t border-neutral-800/80 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-neutral-900/60 border border-neutral-800 min-w-0 md:col-span-2">
          <div className="min-w-0">
            <span className="font-bold text-white text-xs block break-words">Print Copies per Order</span>
            <span className="text-[11px] text-neutral-400 break-words">1x Kitchen only, 2x Kitchen + Customer</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {[1, 2].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, copies: num }))}
                className={`w-8 h-8 rounded-xl font-mono text-xs font-bold border transition-colors cursor-pointer ${
                  config.copies === num
                    ? 'bg-[#0E4825] border-emerald-500 text-emerald-300'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                {num}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ThermalPrinterSettings;
