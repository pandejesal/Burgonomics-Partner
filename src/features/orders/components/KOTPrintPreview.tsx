import React, { useState } from 'react';
import { X, Printer, Check, Copy } from 'lucide-react';
import { formatOrderForKOT, generateASCIIReceipt } from '../services/thermalPrinterService';
import type { Order } from '@/types';

interface KOTPrintPreviewProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
}

export function KOTPrintPreview({ order, isOpen, onClose }: KOTPrintPreviewProps) {
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const kotData = formatOrderForKOT(order);
  const asciiKOT = generateASCIIReceipt(kotData);

  const handlePrint = () => {
    window.print();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(asciiKOT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* Interactive Modal */}
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
        <div className="bg-[#0F0F0F] border border-neutral-800 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-4 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-[#FF6600]" />
              <h2 className="text-base font-black text-white">
                Thermal KOT Slip Preview ({paperWidth})
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-neutral-950 p-0.5 rounded-lg border border-neutral-800 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setPaperWidth('80mm')}
                  className={`px-2 py-0.5 rounded ${
                    paperWidth === '80mm' ? 'bg-[#0E4825] text-emerald-300' : 'text-neutral-400'
                  }`}
                >
                  80mm
                </button>
                <button
                  type="button"
                  onClick={() => setPaperWidth('58mm')}
                  className={`px-2 py-0.5 rounded ${
                    paperWidth === '58mm' ? 'bg-[#0E4825] text-emerald-300' : 'text-neutral-400'
                  }`}
                >
                  58mm
                </button>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Thermal Paper Container */}
          <div className="p-6 bg-neutral-950/80 overflow-y-auto max-h-[60vh] flex justify-center">
            <div
              className={`bg-white text-black p-5 rounded-lg font-mono text-[12px] leading-relaxed shadow-lg border-t-8 border-dashed border-neutral-400 ${
                paperWidth === '80mm' ? 'w-[320px]' : 'w-[240px] text-[11px]'
              }`}
            >
              <div className="text-center pb-2 border-b-2 border-dashed border-black">
                <h3 className="font-black text-sm uppercase tracking-wider">BURGONOMICS</h3>
                <p className="text-[10px] font-bold">{kotData.branchName}</p>
                <p className="text-[10px] font-bold uppercase mt-1">*** KITCHEN ORDER TICKET ***</p>
              </div>

              <div className="py-2 border-b border-dashed border-black space-y-0.5 text-[11px]">
                <div className="flex justify-between font-black">
                  <span>Order #:</span>
                  <span>{kotData.shortCode}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Type:</span>
                  <span>{kotData.orderType}</span>
                </div>
                {kotData.tableNumber && (
                  <div className="flex justify-between font-bold">
                    <span>Table:</span>
                    <span>{kotData.tableNumber}</span>
                  </div>
                )}
                <div className="flex justify-between text-[10px]">
                  <span>Date:</span>
                  <span>{kotData.createdAtFormatted}</span>
                </div>
              </div>

              {/* Items List */}
              <div className="py-2 border-b border-dashed border-black space-y-2">
                <div className="flex justify-between font-black text-[11px] pb-1 border-b border-black">
                  <span>ITEM</span>
                  <span>QTY</span>
                </div>
                {kotData.items.map((item, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <div className="flex justify-between font-bold">
                      <span className="truncate pr-2">{item.name}</span>
                      <span className="font-black">x{item.quantity}</span>
                    </div>
                    {item.modifiers &&
                      item.modifiers.map((mod, mIdx) => (
                        <p key={mIdx} className="text-[10px] pl-2 text-neutral-700">
                          + {mod}
                        </p>
                      ))}
                    {item.specialInstructions && (
                      <p className="text-[10px] pl-2 text-red-600 font-bold">
                        * {item.specialInstructions}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Special Note */}
              {kotData.specialNotes && (
                <div className="py-2 border-b border-dashed border-black">
                  <span className="font-bold text-[10px] uppercase">Special Notes:</span>
                  <p className="text-[11px] font-black text-red-700 mt-0.5">
                    {kotData.specialNotes}
                  </p>
                </div>
              )}

              {/* Footer */}
              <div className="pt-3 text-center text-[10px] font-bold">
                <p>Total Items: {kotData.items.reduce((a, b) => a + b.quantity, 0)}</p>
                <p className="mt-1 border-t border-dotted border-black pt-1">
                  Printed via Petpooja POS
                </p>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 bg-neutral-900 border-t border-neutral-800 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy ASCII'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 py-2.5 rounded-xl bg-[#0E4825] hover:bg-[#135d30] text-emerald-300 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print KOT Now</span>
            </button>
          </div>
        </div>
      </div>

      {/* Pure Print-Only Viewport Document */}
      <div className="hidden print:block font-mono text-black text-[12px] leading-tight p-0 m-0">
        <pre className="whitespace-pre-wrap font-mono text-xs">{asciiKOT}</pre>
      </div>
    </>
  );
}

export default KOTPrintPreview;
