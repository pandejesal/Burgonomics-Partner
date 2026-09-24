import { useState } from 'react';
import { X, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import { verifyDeliveryOtp } from '@/services/porterDelivery';
import { useAuthStore } from '@/stores/authStore';
import { Spinner } from '@/components/ui/Spinner';

interface DeliveryOtpModalProps {
  orderId: string;
  customerName?: string;
  allowDemoSkip: boolean;
  onVerified: (orderId: string) => void;
  onClose: () => void;
}

export function DeliveryOtpModal({
  orderId,
  customerName,
  allowDemoSkip,
  onVerified,
  onClose,
}: DeliveryOtpModalProps) {
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const staffName = useAuthStore((s) => s.user?.name) || 'Branch Staff';

  const confirmWithOtp = async () => {
    // Re-entry guard: Enter-key + button double-taps must not fire
    // verifyDeliveryOtp twice (double server verification).
    if (busy) return;
    if (!/^\d{4}$/.test(otp.trim())) {
      setError('Enter the 4-digit OTP from the customer screen.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyDeliveryOtp({ orderId, otp: otp.trim(), staffName });
      onVerified(orderId);
    } catch (err) {
      setError((err as Error).message || 'Could not verify OTP. Check connectivity and retry.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 font-sans">
      <div className="bg-surface rounded-2xl w-full max-w-sm p-6 border border-border shadow-2xl">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
          <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <span>Verify Handover OTP</span>
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-primary/5 rounded-lg text-text-secondary cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-text-secondary mb-4">
          Ask the customer for the 4-digit code on their order tracking screen
          {customerName ? ` (${customerName})` : ''}. This confirms delivery handover.
        </p>

        <input
          autoFocus
          type="text"
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          value={otp}
          onChange={(e) => {
            setOtp(e.target.value.replace(/\D/g, ''));
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void confirmWithOtp();
          }}
          placeholder="••••"
          className="w-full text-center text-3xl font-black tracking-[0.5em] py-3 bg-bg border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />

        {error && (
          <div className="mt-3 flex items-start gap-2 text-rose-500 text-xs font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-3 pt-4 mt-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-border rounded-xl font-semibold text-xs hover:bg-primary/5 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirmWithOtp()}
            disabled={busy}
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-xs disabled:opacity-60 shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {busy ? <Spinner size="sm" /> : <CheckCircle2 className="w-4 h-4" />}
            <span>{busy ? 'Verifying...' : 'Verify & Deliver'}</span>
          </button>
        </div>

        {allowDemoSkip && (
          <button
            type="button"
            onClick={() => onVerified(orderId)}
            className="mt-3 w-full py-2 text-[11px] text-text-secondary underline hover:text-text-primary cursor-pointer"
          >
            Demo build only: skip OTP
          </button>
        )}
      </div>
    </div>
  );
}