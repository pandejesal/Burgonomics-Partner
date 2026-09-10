import React, { useState } from 'react';
import { X, Megaphone, Send, Sparkles, CheckCircle2, Users } from 'lucide-react';
import type { Branch } from '@/types';

interface LaunchBroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  branch: Branch | null;
  onBroadcast: (data: { branchId: string; branchName: string; title: string; body: string }) => Promise<void>;
  loading?: boolean;
}

export const LaunchBroadcastModal: React.FC<LaunchBroadcastModalProps> = ({
  isOpen,
  onClose,
  branch,
  onBroadcast,
  loading = false,
}) => {
  const [title, setTitle] = useState(
    branch ? `🎉 Burgonomics ${branch.city} is Opening Soon!` : '🎉 Grand Opening Alert!'
  );
  const [body, setBody] = useState(
    branch
      ? `We are officially firing up the smash burger grills at ${branch.name}. Get ready for 100% Pure Veg gourmet burgers!`
      : 'We are officially open for orders!'
  );
  const [sentSuccess, setSentSuccess] = useState(false);
  const [broadcastError, setBroadcastError] = useState('');

  if (!isOpen || !branch) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

    setBroadcastError('');
    try {
      await onBroadcast({
        branchId: branch.id,
        branchName: branch.name,
        title: title.trim(),
        body: body.trim(),
      });

      setSentSuccess(true);
      setTimeout(() => {
        setSentSuccess(false);
        onClose();
      }, 1800);
    } catch (err) {
      // Loop 5: fan-out failure must surface, never a success screen.
      setBroadcastError(
        err instanceof Error ? err.message : 'Broadcast failed — subscribers were NOT notified.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl text-white">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-surface-hover text-accent-light border border-border">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Broadcast Launch Announcement</h2>
              <p className="text-xs text-zinc-400">
                Push notification to all {branch.subscribersCount || 0} subscribed customers
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-surface-hover cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Alert */}
        {sentSuccess ? (
          <div className="p-10 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h3 className="text-base font-bold text-white">Broadcast sent!</h3>
            <p className="text-xs text-zinc-300">
              Fanned out over <code className="text-amber-400 font-mono">upcoming_{branch.id}</code> and
              stored for the customer app to display.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Target Info */}
            <div className="p-3 bg-bg rounded-xl border border-border flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-accent-light" />
                <span className="font-bold text-white">{branch.name}</span>
              </div>
              <span className="font-mono text-emerald-400 font-bold">
                {branch.subscribersCount ?? 0} Subscribers
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Notification Headline <span className="text-accent-light">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-bg border border-border rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Message Body <span className="text-accent-light">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-bg border border-border rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
              />
            </div>

            <div className="text-[11px] text-zinc-400 bg-bg p-3 rounded-xl border border-border flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Fires high-priority push notification to all customers who clicked "Notify Me" in the delivery app.
              </span>
            </div>

            {/* Footer */}
            {broadcastError && (
              <div role="alert" className="text-[11px] text-red-300 bg-red-950 border border-red-700 p-3 rounded-xl font-bold">
                {broadcastError}
              </div>
            )}
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
                <span>{loading ? 'Broadcasting...' : 'Send Broadcast'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default LaunchBroadcastModal;
