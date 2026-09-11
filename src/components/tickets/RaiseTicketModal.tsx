import React, { useState } from 'react';
import { X, AlertCircle, Send, Paperclip, ShieldAlert, Sparkles, Zap } from 'lucide-react';
import type { TicketCategory, TicketPriority } from '@/types';

interface RaiseTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (ticketData: {
    title: string;
    category: TicketCategory;
    priority: TicketPriority;
    message: string;
    branchId: string;
    branchName?: string;
    targetTier?: 'branch' | 'brand_support' | 'developer_team';
    attachments?: string[];
  }) => Promise<void>;
  defaultBranchId?: string;
  defaultBranchName?: string;
  loading?: boolean;
}

export const RaiseTicketModal: React.FC<RaiseTicketModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  // Loop 49/120: NO fallback branch — the old 'branch_surat_01' default
  // silently misrouted tickets from operators without branch context.
  defaultBranchId = '',
  defaultBranchName = '',
  loading = false,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TicketCategory>('wrong_item' as any);
  const [priority, setPriority] = useState<TicketPriority>('high');
  const [targetTier, setTargetTier] = useState<'branch' | 'brand_support' | 'developer_team'>('branch');
  const [message, setMessage] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');

  if (!isOpen) return null;

  const presets = [
    {
      label: '🍔 Missing Item in Delivery Bag',
      title: 'Missing Peri-Peri Fries in Delivery Bag',
      category: 'wrong_item' as TicketCategory,
      priority: 'high' as TicketPriority,
      tier: 'branch' as const,
      message: 'Customer Aarav received burger order #ord_901 but the French Fries pack was missing from the sealed bag. Customer is asking for ₹99 refund or replacement.',
    },
    {
      label: '💳 UPI Paid but Order Pending (API Timeout)',
      title: 'Razorpay UPI Captured but verifyPayment Gateway Timeout',
      category: 'payment_refund' as TicketCategory,
      priority: 'urgent' as TicketPriority,
      tier: 'developer_team' as const,
      message: 'Customer paid ₹552 on GPay (pay_Rzp99214). Bank debited funds but Cloud Function verifyPayment returned 504 gateway timeout. POS did not print KOT.',
    },
    {
      label: '🖨️ Thermal Printer 2 Driver Jammed',
      title: 'Burger Station Thermal Printer Not Printing KOT',
      category: 'hardware_printer' as TicketCategory,
      priority: 'urgent' as TicketPriority,
      tier: 'branch' as const,
      message: 'Thermal printer 2 in burger station is offline or paper roll jammed. Online orders are accumulating in KDS without paper KOT back-up.',
    },
    {
      label: '🛵 Delivery SLA Delay > 45 Mins',
      title: 'Porter Courier Rider Delayed by 40 Minutes',
      category: 'late_delivery' as any,
      priority: 'high' as TicketPriority,
      tier: 'brand_support' as const,
      message: 'Porter rider has not reached store for pickup. Customer calling for cancellation or ₹150 goodwill voucher compensation.',
    },
  ];

  const handleApplyPreset = (p: typeof presets[0]) => {
    setTitle(p.title);
    setCategory(p.category);
    setPriority(p.priority);
    setTargetTier(p.tier);
    setMessage(p.message);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      alert('Please fill out the ticket summary and description');
      return;
    }
    if (!defaultBranchId) {
      alert('No branch context — ask your manager to assign your outlet before raising tickets.');
      return;
    }

    await onSubmit({
      title: title.trim(),
      category,
      priority,
      targetTier,
      message: message.trim(),
      branchId: defaultBranchId,
      branchName: defaultBranchName,
      attachments: attachmentUrl.trim() ? [attachmentUrl.trim()] : [],
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl text-white">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-rose-950/60 text-rose-400 border border-rose-800/40">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Raise Support Incident Ticket</h2>
              <p className="text-xs text-zinc-400">
                Dispatches immediately to Branch Managers, Brand Support, or Developer Team
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-surface-hover cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Scenario Presets */}
        <div className="px-5 pt-4 pb-2 bg-bg border-b border-border">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1 mb-2">
            <Sparkles className="w-3 h-3 text-accent-light" />
            <span>Quick QSR Scenario Presets (1-Click Fill)</span>
          </span>
          <div className="grid grid-cols-2 gap-2">
            {presets.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleApplyPreset(p)}
                className="p-2 text-left bg-surface hover:bg-surface-hover border border-border hover:border-accent/60 rounded-xl transition-all cursor-pointer"
              >
                <div className="text-[11px] font-bold text-zinc-200 truncate">{p.label}</div>
                <div className="text-[9px] text-zinc-400 font-mono">
                  {p.tier === 'developer_team' ? 'Tier 3 (Dev)' : p.tier === 'brand_support' ? 'Tier 2 (Brand)' : 'Tier 1 (Branch)'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 max-h-[calc(100vh-14rem)] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Issue Summary / Headline <span className="text-accent-light">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Missing Fries in Delivery Bag #ord_901"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs bg-bg border border-border rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TicketCategory)}
                className="w-full px-3 py-2 text-xs bg-bg border border-border rounded-xl text-white focus:outline-none focus:border-accent"
              >
                <option value="wrong_item">Missing / Wrong Item</option>
                <option value="payment_refund">Payment / Refund Issue</option>
                <option value="pos_sync">POS / Petpooja Discrepancy</option>
                <option value="hardware_printer">Kitchen Thermal Printer</option>
                <option value="late_delivery">Delivery SLA Delay</option>
                <option value="app_bug">Mobile / Web App Bug</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Initial Escalation Tier</label>
              <select
                value={targetTier}
                onChange={(e) => setTargetTier(e.target.value as any)}
                className="w-full px-3 py-2 text-xs bg-bg border border-border rounded-xl text-white focus:outline-none focus:border-accent"
              >
                <option value="branch">Tier 1 (Branch Manager)</option>
                <option value="brand_support">Tier 2 (Brand Support)</option>
                <option value="developer_team">Tier 3 (Developer Team)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                className="w-full px-3 py-2 text-xs bg-bg border border-border rounded-xl text-white focus:outline-none focus:border-accent"
              >
                <option value="urgent">🔴 Urgent (Operations Blocked)</option>
                <option value="high">🟠 High (Impacting Customer)</option>
                <option value="medium">🟡 Medium (General Dispute)</option>
                <option value="low">🟢 Low (Minor Inquiry)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Detailed Description & Diagnostics <span className="text-accent-light">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="Describe the incident, error code, customer phone or order ID..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs bg-bg border border-border rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Attachment / Screenshot URL (Optional)
            </label>
            <div className="relative">
              <Paperclip className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="https://images.unsplash.com/..."
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-bg border border-border rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="pt-3 flex items-center justify-end space-x-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-surface-hover text-zinc-300 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-accent hover:bg-accent-hover text-white disabled:opacity-50 flex items-center space-x-1.5 shadow-md cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{loading ? 'Submitting...' : 'Dispatch Ticket'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RaiseTicketModal;
