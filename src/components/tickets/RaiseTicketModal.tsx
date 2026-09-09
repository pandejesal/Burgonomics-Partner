import React, { useState } from 'react';
import { X, AlertCircle, Send, Paperclip, ShieldAlert } from 'lucide-react';
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
  defaultBranchId = 'branch_surat_01',
  defaultBranchName = 'Surat Adajan',
  loading = false,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TicketCategory>('pos_sync');
  const [priority, setPriority] = useState<TicketPriority>('high');
  const [message, setMessage] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; message?: string; attachmentUrl?: string }>({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const TITLE_MIN = 8;
  const TITLE_MAX = 120;
  const MESSAGE_MIN = 20;
  const MESSAGE_MAX = 2000;

  function validateFields(): { title?: string; message?: string; attachmentUrl?: string } {
    const errors: { title?: string; message?: string; attachmentUrl?: string } = {};
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      errors.title = 'Issue summary is required.';
    } else if (trimmedTitle.length < TITLE_MIN) {
      errors.title = `Issue summary must be at least ${TITLE_MIN} characters.`;
    } else if (trimmedTitle.length > TITLE_MAX) {
      errors.title = `Issue summary must be at most ${TITLE_MAX} characters.`;
    }
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      errors.message = 'Detailed description is required.';
    } else if (trimmedMessage.length < MESSAGE_MIN) {
      errors.message = `Description must be at least ${MESSAGE_MIN} characters so triage can act on it.`;
    } else if (trimmedMessage.length > MESSAGE_MAX) {
      errors.message = `Description must be at most ${MESSAGE_MAX} characters.`;
    }
    const trimmedUrl = attachmentUrl.trim();
    if (trimmedUrl) {
      let parsed: URL | null = null;
      try {
        parsed = new URL(trimmedUrl);
      } catch {
        parsed = null;
      }
      if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
        errors.attachmentUrl = 'Attachment must be a valid http(s) URL.';
      }
    }
    return errors;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || loading) return;
    const errors = validateFields();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitError('');
    setIsSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        category,
        priority,
        message: message.trim(),
        branchId: defaultBranchId,
        branchName: defaultBranchName,
        attachments: attachmentUrl.trim() ? [attachmentUrl.trim()] : [],
      });
      // Close ONLY on success — on failure the draft is preserved and the
      // modal stays open with an inline error (never an unconditional close).
      onClose();
    } catch {
      setSubmitError('Could not dispatch ticket — check connection and retry. Your draft is preserved.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#132A17] border border-[#234B2A] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl text-white">
        {/* Header */}
        <div className="p-5 border-b border-[#234B2A] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-rose-950/60 text-rose-400 border border-rose-800/40">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Raise Issue Ticket</h2>
              <p className="text-xs text-zinc-400">
                Dispatches immediately to Brand Owners, Developers & Support
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-[#1E3A24]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Issue Summary / Headline <span className="text-[#D95D0F]">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Petpooja KOT printer not printing online orders"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (fieldErrors.title) setFieldErrors((p) => ({ ...p, title: undefined }));
              }}
              aria-invalid={!!fieldErrors.title}
              className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#D95D0F]"
            />
            {fieldErrors.title && (
              <p role="alert" className="mt-1 text-[11px] font-bold text-rose-400">
                {fieldErrors.title}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TicketCategory)}
                className="w-full px-3 py-2 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white focus:outline-none focus:border-[#D95D0F]"
              >
                <option value="pos_sync">POS & Petpooja Sync</option>
                <option value="app_bug">App & System Bug</option>
                <option value="hardware_printer">Kitchen Hardware / Printer</option>
                <option value="inventory_stock">Inventory & Stock Shortage</option>
                <option value="customer_escalation">Customer Escalation</option>
                <option value="payment_refund">Payment & Refund Issue</option>
                <option value="other">Other Inquiry</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                className="w-full px-3 py-2 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white focus:outline-none focus:border-[#D95D0F]"
              >
                <option value="urgent">🔴 Urgent (Operations Blocked)</option>
                <option value="high">🟠 High (Impacting Orders)</option>
                <option value="medium">🟡 Medium (Degraded Service)</option>
                <option value="low">🟢 Low (General Question)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Detailed Description <span className="text-[#D95D0F]">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="Describe what happened, error messages shown on POS, or customer details..."
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                if (fieldErrors.message) setFieldErrors((p) => ({ ...p, message: undefined }));
              }}
              aria-invalid={!!fieldErrors.message}
              className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#D95D0F]"
            />
            {fieldErrors.message && (
              <p role="alert" className="mt-1 text-[11px] font-bold text-rose-400">
                {fieldErrors.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Attachment / Screenshot URL (Optional)
            </label>
            <div className="relative">
              <Paperclip className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="https://..."
                value={attachmentUrl}
                onChange={(e) => {
                  setAttachmentUrl(e.target.value);
                  if (fieldErrors.attachmentUrl)
                    setFieldErrors((p) => ({ ...p, attachmentUrl: undefined }));
                }}
                aria-invalid={!!fieldErrors.attachmentUrl}
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#D95D0F]"
              />
            </div>
            {fieldErrors.attachmentUrl && (
              <p role="alert" className="mt-1 text-[11px] font-bold text-rose-400">
                {fieldErrors.attachmentUrl}
              </p>
            )}
          </div>

          {/* Footer */}
          {submitError && (
            <p role="alert" className="text-[11px] font-bold text-rose-400 bg-rose-950/40 border border-rose-800/60 rounded-xl p-3">
              {submitError}
            </p>
          )}
          <div className="pt-3 flex items-center justify-end space-x-3 border-t border-[#234B2A]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#1E3A24] text-zinc-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || isSubmitting}
              className="px-5 py-2 text-xs font-semibold rounded-xl bg-[#D95D0F] hover:bg-[#b84d0b] text-white disabled:opacity-50 flex items-center space-x-1.5 shadow-md"
            >
              <Send className="w-4 h-4" />
              <span>{loading || isSubmitting ? 'Submitting...' : 'Dispatch Ticket'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
