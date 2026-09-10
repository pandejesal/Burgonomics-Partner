import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTicket } from '@/hooks/useTicket';
import { useAuthStore } from '@/stores/authStore';
import { partnerFunctionsApi } from '@/services/partnerFunctionsApi';
import { validatePartialRefundAmount } from '@/utils/refundValidation';
import { normalizeTier, normalizeTimeline } from '@/utils/ticketContract';
import {
  ArrowLeft,
  ShieldAlert,
  Clock,
  CheckCircle2,
  Store,
  User,
  AlertCircle,
  DollarSign,
  Gift,
  Building,
  Cpu,
  RefreshCw,
  Zap,
  Copy,
  Check,
  Send,
  MessageSquare,
  FileCode,
  Sparkles,
  ShoppingBag,
} from 'lucide-react';

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { ticket, isLoading, updateTicket, addMessage } = useTicket(id || '');
  const queryClient = useQueryClient();

  // 5 Tabs: 'refund' | 'goodwill' | 'escalate_brand' | 'escalate_dev' | 'standard'
  const [activeActionTab, setActiveActionTab] = useState<
    'refund' | 'goodwill' | 'escalate_brand' | 'escalate_dev' | 'standard'
  >('refund');

  const [refundType, setRefundType] = useState<'full' | 'partial'>('full');
  const [refundAmountInput, setRefundAmountInput] = useState('99');
  const [goodwillType, setGoodwillType] = useState<'coupon' | 'coins'>('coupon');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [replyText, setReplyText] = useState('');
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  if (isLoading) {
    return (
      <div className="p-16 text-center text-zinc-400 text-xs">Loading incident details...</div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-16 text-center bg-surface rounded-2xl border border-border text-white space-y-3">
        <AlertCircle className="w-10 h-10 mx-auto text-accent-light" />
        <h3 className="font-bold text-sm">Ticket Not Found</h3>
        <button
          onClick={() => navigate('/tickets')}
          className="px-4 py-2 bg-accent text-white text-xs font-semibold rounded-xl cursor-pointer"
        >
          Return to Incident Queue
        </button>
      </div>
    );
  }

  const isResolved = ticket.status === 'resolved' || ticket.status === 'closed';
  const assignedTier = normalizeTier((ticket as any).assignedTo?.tier);
  const diagnostics = (ticket as any).diagnostics || {};
  const timeline = normalizeTimeline((ticket as any).timeline);

  const handleCopyPayload = () => {
    const payload = JSON.stringify(
      {
        ticketId: ticket.id,
        ticketNumber: (ticket as any).ticketNumber,
        category: ticket.category,
        branchId: ticket.branchId,
        orderId: ticket.orderId,
        diagnostics,
        message: ticket.message,
      },
      null,
      2
    );
    navigator.clipboard.writeText(payload);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  // Partial-refund validation lives in utils/refundValidation (unit-tested):
  // invalid input blocks execution with an inline error — never a fake refund.
  const partialRefundError: string | null =
    activeActionTab === 'refund' && refundType === 'partial'
      ? validatePartialRefundAmount(refundAmountInput)
      : null;

  const handleExecuteAction = async () => {
    setSuccessMessage('');
    setActionError('');
    // Server requires non-empty notes; never send a blank resolution.
    const notes = resolutionNotes.trim() || 'Approved by operator';
    const refreshTicket = async () => {
      await queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
    };

    // Loop 3: money-affecting actions resolve SERVER-side (POST
    // /tickets/resolve runs autoRefund / loyalty ledger). A direct Firestore
    // status flip moves no money — success is claimed only on server proof.
    if (activeActionTab === 'refund') {
      if (partialRefundError) return;
      const action = refundType === 'full' ? 'full_refund' : 'partial_refund';
      const amount = refundType === 'partial' ? Number(refundAmountInput) : undefined;
      setIsResolving(true);
      try {
        const result = await partnerFunctionsApi.resolveTicket({
          ticketId: id || '',
          action,
          ...(amount !== undefined ? { amount } : {}),
          notes,
        });
        const refundResult = (result as any)?.resolution?.refundResult;
        const refundId = refundResult?.refundId || refundResult?.id;
        await refreshTicket();
        setSuccessMessage(
          refundType === 'full'
            ? `Full refund executed server-side${refundId ? ` (refund ${refundId})` : ''}. Ticket resolved.`
            : `Partial refund of ₹${amount} executed server-side${refundId ? ` (refund ${refundId})` : ''}. Ticket resolved.`
        );
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : 'Refund failed server-side — ticket left open, no money moved. Retry or escalate.'
        );
      } finally {
        setIsResolving(false);
      }
      setResolutionNotes('');
      return;
    } else if (activeActionTab === 'goodwill') {
      setIsResolving(true);
      try {
        if (goodwillType === 'coins') {
          // Server mints only when the ticket carries a customerId; guest
          // tickets fail LOUD here instead of a fake "issued" banner.
          if (!ticket?.customerId) {
            throw new Error('Guest ticket has no customer profile — credit Grill Coins via the dashboard, ticket left open.');
          }
          await partnerFunctionsApi.resolveTicket({
            ticketId: id || '',
            action: 'loyalty_credit',
            amount: 100,
            notes,
          });
          await refreshTicket();
          setSuccessMessage('100 Grill Coins credited server-side. Ticket resolved.');
        } else {
          // No coupon-mint endpoint exists server-side (resolve records the
          // request only) — record honestly, never claim a voucher was issued.
          await partnerFunctionsApi.resolveTicket({
            ticketId: id || '',
            action: 'discount_coupon',
            notes: `Coupon request (₹100 goodwill): ${notes}`,
          });
          await refreshTicket();
          setSuccessMessage('Coupon request recorded on the ticket — voucher NOT auto-minted (no issuance endpoint yet). Issue manually via dashboard.');
        }
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : 'Goodwill action failed server-side — ticket left open, nothing issued. Retry or escalate.'
        );
      } finally {
        setIsResolving(false);
      }
      setResolutionNotes('');
      return;
    } else if (activeActionTab === 'escalate_brand') {
      await updateTicket.mutateAsync({
        status: 'in_progress',
        assignedToTier: 'brand_support',
        resolution: `Escalated to Tier 2 (Brand Support): ${resolutionNotes.trim() || 'Franchise/Brand policy review required'}`,
      });
      setSuccessMessage('Successfully escalated to Tier 2 (Brand Support Team).');
    } else if (activeActionTab === 'escalate_dev') {
      await updateTicket.mutateAsync({
        status: 'in_progress',
        assignedToTier: 'developer_team',
        resolution: `Escalated to Tier 3 (Developer Team): ${resolutionNotes.trim() || 'Technical investigation / API gateway timeout'}`,
      });
      setSuccessMessage('Successfully escalated to Tier 3 (Developer Team). P0 Diagnostic snapshot generated.');
    } else {
      await updateTicket.mutateAsync({
        status: 'resolved',
        resolution: resolutionNotes.trim() || `Resolved by ${user?.name || 'Staff'} (${user?.role || 'team'})`,
      });
      setSuccessMessage('Incident marked as resolved.');
    }

    setResolutionNotes('');
  };

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    await addMessage.mutateAsync({
      text: replyText.trim(),
      authorName: user?.name || 'Store Staff',
      authorRole: user?.role || 'branch_staff',
    });
    setReplyText('');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 select-none">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/tickets')}
          className="flex items-center space-x-2 text-xs font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Incident Tickets</span>
        </button>

        <div className="flex items-center space-x-2.5">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-black ${
              isResolved
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                : 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
            }`}
          >
            {isResolved ? '✅ Status: Resolved' : '⚡ Status: Active / Open'}
          </span>
        </div>
      </div>

      {/* 3-Tier Progression Stepper */}
      <div className="bg-[#112415] border border-border rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-surface-hover text-accent-light">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Escalator Level
            </h3>
            <p className="text-sm font-black text-white capitalize">
              {assignedTier.replace('_', ' ')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* Tier 1 */}
          <div
            className={`flex-1 md:flex-initial flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
              assignedTier === 'branch'
                ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                : 'bg-bg text-zinc-500 border-border'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Tier 1: Branch</span>
          </div>

          <span className="text-zinc-600">➔</span>

          {/* Tier 2 */}
          <div
            className={`flex-1 md:flex-initial flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
              assignedTier === 'brand_support'
                ? 'bg-purple-950 text-purple-300 border-purple-600'
                : 'bg-bg text-zinc-500 border-border'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>Tier 2: Brand Review</span>
          </div>

          <span className="text-zinc-600">➔</span>

          {/* Tier 3 */}
          <div
            className={`flex-1 md:flex-initial flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
              assignedTier === 'developer_team'
                ? 'bg-rose-950 text-rose-300 border-rose-600 animate-pulse'
                : 'bg-bg text-zinc-500 border-border'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Tier 3: Dev Team</span>
          </div>
        </div>
      </div>

      {/* Main Incident Card */}
      <div className="bg-surface border border-border rounded-2xl p-6 space-y-6 text-white shadow-xl">
        {/* Title & Metadata */}
        <div className="border-b border-border pb-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-white tracking-wide">
                {ticket.title || (ticket as any).subject || ticket.message?.slice(0, 70)}
              </h1>
              <p className="text-xs text-zinc-400">
                Ticket ID: <span className="font-mono text-zinc-200">{(ticket as any).ticketNumber || ticket.id}</span>
                {ticket.orderId && (
                  <span className="ml-3">
                    Linked Order:{' '}
                    <Link
                      to={`/orders/${ticket.orderId}`}
                      className="font-mono text-amber-400 hover:underline inline-flex items-center gap-1"
                    >
                      <ShoppingBag className="w-3 h-3" />
                      #{ticket.orderId}
                    </Link>
                  </span>
                )}
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-surface-hover text-accent-light shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-300 pt-2">
            <span className="flex items-center gap-1.5 bg-bg px-3 py-1 rounded-xl border border-border">
              <Store className="w-3.5 h-3.5 text-accent-light" />
              <span>{ticket.branchName || ticket.branchId}</span>
            </span>

            <span className="flex items-center gap-1.5 bg-bg px-3 py-1 rounded-xl border border-border">
              <User className="w-3.5 h-3.5 text-zinc-400" />
              <span>Customer: {ticket.raisedByName || ticket.raisedById}</span>
            </span>

            {(ticket as any).customerPhone && (
              <span className="bg-bg px-3 py-1 rounded-xl border border-border font-mono text-zinc-400">
                {(ticket as any).customerPhone}
              </span>
            )}

            <span className="flex items-center gap-1.5 bg-bg px-3 py-1 rounded-xl border border-border">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span>
                {ticket.createdAt?.toDate
                  ? ticket.createdAt.toDate().toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Recent'}
              </span>
            </span>
          </div>
        </div>

        {/* Issue Description */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
            Issue Description
          </h3>
          <div className="bg-bg border border-border rounded-xl p-4 text-xs leading-relaxed text-zinc-200 whitespace-pre-wrap">
            {ticket.message || (ticket as any).description || 'No description provided.'}
          </div>
        </div>

        {/* Developer Diagnostics Drawer (Tier 3 or when diagnostics present) */}
        {(assignedTier === 'developer_team' || Object.keys(diagnostics).length > 0) && (
          <div className="bg-[#0A0C0A] border-2 border-rose-800/60 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-rose-400" />
                <h4 className="text-xs font-black text-rose-300 uppercase tracking-wider">
                  Tier 3 Developer Diagnostics Snapshot
                </h4>
              </div>

              <button
                onClick={handleCopyPayload}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-hover hover:bg-[#284f30] text-emerald-300 text-[11px] font-bold border border-[#2e5e39] transition-colors cursor-pointer"
              >
                {copiedPayload ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedPayload ? 'Copied Payload!' : 'Copy Payload'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px] font-mono">
              <div className="bg-[#112415] p-2.5 rounded-xl border border-border">
                <span className="text-zinc-500 block">Razorpay Payment ID</span>
                <span className="text-amber-400 font-bold">{diagnostics.razorpayPaymentId || 'N/A'}</span>
              </div>
              <div className="bg-[#112415] p-2.5 rounded-xl border border-border">
                <span className="text-zinc-500 block">Petpooja Order ID</span>
                <span className="text-emerald-400 font-bold">{diagnostics.petpoojaOrderId || 'N/A'}</span>
              </div>
              <div className="bg-[#112415] p-2.5 rounded-xl border border-border">
                <span className="text-zinc-500 block">Client Platform</span>
                <span className="text-cyan-400 font-bold">{diagnostics.clientAppVersion || 'v2.4.1 (Web)'}</span>
              </div>
            </div>

            {diagnostics.errorStack && (
              <pre className="bg-[#050705] p-3 rounded-xl border border-rose-900/40 text-[10px] font-mono text-rose-300 overflow-x-auto">
                {diagnostics.errorStack}
              </pre>
            )}
          </div>
        )}

        {/* Resolution Summary if already resolved */}
        {isResolved && ticket.resolution && (
          <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-xl p-4 space-y-1.5 text-xs">
            <div className="flex items-center space-x-2 text-emerald-400 font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Resolution Applied</span>
            </div>
            <p className="text-zinc-200 leading-relaxed">{ticket.resolution}</p>
          </div>
        )}

        {/* Success Alert Banner */}
        {successMessage && (
          <div className="bg-emerald-950 border border-emerald-700 rounded-xl p-3.5 text-xs text-emerald-300 font-bold flex items-center space-x-2 shadow-md">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Server-action failure banner — money did NOT move, ticket left open */}
        {actionError && (
          <div role="alert" className="bg-red-950 border border-red-700 rounded-xl p-3.5 text-xs text-red-300 font-bold flex items-center space-x-2 shadow-md">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Unified 5-Tab Action Panel (Active if not resolved or for updates) */}
        {!isResolved && (
          <div className="bg-bg border border-border rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent-light" />
              <span>Operator Resolution & Escalation Controls</span>
            </h3>

            {/* Action Tabs */}
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: 'refund', label: '💳 Refund & Settle', icon: DollarSign },
                  { key: 'goodwill', label: '🎁 Goodwill Voucher', icon: Gift },
                  { key: 'escalate_brand', label: '🏢 Escalate to Brand (Tier 2)', icon: Building },
                  { key: 'escalate_dev', label: '💻 Escalate to Dev (Tier 3)', icon: Cpu },
                  { key: 'standard', label: '✅ Standard Resolve', icon: CheckCircle2 },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveActionTab(key)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeActionTab === key
                      ? 'bg-accent text-white shadow-sm'
                      : 'bg-surface text-zinc-400 hover:text-white border border-border'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tab 1: Refund & Settle */}
            {activeActionTab === 'refund' && (
              <div className="bg-[#112415] p-4 rounded-xl border border-border space-y-3">
                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer text-white font-bold">
                    <input
                      type="radio"
                      name="refundType"
                      checked={refundType === 'full'}
                      onChange={() => setRefundType('full')}
                      className="accent-[#D95D0F]"
                    />
                    <span>100% Full Order Refund</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer text-white font-bold">
                    <input
                      type="radio"
                      name="refundType"
                      checked={refundType === 'partial'}
                      onChange={() => setRefundType('partial')}
                      className="accent-[#D95D0F]"
                    />
                    <span>Custom Partial Refund (INR)</span>
                  </label>
                </div>

                {refundType === 'partial' && (
                  <div className="max-w-xs space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400 font-bold">₹</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Amount to refund (e.g. 99)"
                        aria-label="Partial refund amount in rupees"
                        value={refundAmountInput}
                        onChange={(e) => setRefundAmountInput(e.target.value)}
                        aria-invalid={!!partialRefundError}
                        className="w-full px-3 py-1.5 bg-bg border border-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
                      />
                    </div>
                    {partialRefundError && (
                      <p role="alert" className="text-[11px] font-bold text-rose-400">
                        {partialRefundError}
                      </p>
                    )}
                  </div>
                )}

                <p className="text-[11px] text-zinc-400">
                  ⚡ Auto-invokes <code className="text-amber-400">autoRefund</code> Cloud Function with Razorpay Route split reversal (net branch deduction).
                </p>
              </div>
            )}

            {/* Tab 2: Goodwill Voucher */}
            {activeActionTab === 'goodwill' && (
              <div className="bg-[#112415] p-4 rounded-xl border border-border space-y-3">
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer text-white font-bold">
                    <input
                      type="radio"
                      name="goodwillType"
                      checked={goodwillType === 'coupon'}
                      onChange={() => setGoodwillType('coupon')}
                      className="accent-[#D95D0F]"
                    />
                    <span>Issue ₹100 Flat Goodwill Promo Code</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer text-white font-bold">
                    <input
                      type="radio"
                      name="goodwillType"
                      checked={goodwillType === 'coins'}
                      onChange={() => setGoodwillType('coins')}
                      className="accent-[#D95D0F]"
                    />
                    <span>Credit 100 Global Grill Coins</span>
                  </label>
                </div>
              </div>
            )}

            {/* Tab 3: Escalate to Brand Support */}
            {activeActionTab === 'escalate_brand' && (
              <div className="bg-[#112415] p-4 rounded-xl border border-border text-xs text-purple-300 space-y-1">
                <span className="font-bold">Franchise & Policy Escalation:</span>
                <p className="text-[11px] text-zinc-400">
                  Reassigns this ticket to Brand Owner & Regional Support desk with SMS/Push alert for franchise boundary mediation or customer compensation exception.
                </p>
              </div>
            )}

            {/* Tab 4: Escalate to Dev Team */}
            {activeActionTab === 'escalate_dev' && (
              <div className="bg-[#112415] p-4 rounded-xl border border-border text-xs text-rose-300 space-y-1">
                <span className="font-bold">P0 Bug Escalation:</span>
                <p className="text-[11px] text-zinc-400">
                  Generates an immutable <code className="text-amber-400">dev_error_snapshots</code> document containing transaction IDs, API error stack traces, and client version context for lead developer triaging.
                </p>
              </div>
            )}

            {/* Resolution Notes Input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-400">Resolution / Escalation Notes</label>
              <textarea
                rows={2}
                placeholder="Explain the resolution or reason for escalation..."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                className="w-full p-3 bg-bg border border-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
              />
            </div>

            {/* Submit Action Button */}
            <button
              onClick={handleExecuteAction}
              disabled={updateTicket.isPending || isResolving || !!partialRefundError}
              className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-black text-xs uppercase tracking-wider shadow-md transition-colors cursor-pointer"
            >
              {isResolving ? 'Processing Server Action…' : (
                <>
                  {activeActionTab === 'refund' && 'Execute Refund & Resolve'}
                  {activeActionTab === 'goodwill' && 'Issue Goodwill & Resolve'}
                  {activeActionTab === 'escalate_brand' && 'Confirm Escalation to Brand Support'}
                  {activeActionTab === 'escalate_dev' && 'Dispatch P0 Snapshot to Developer Team'}
                  {activeActionTab === 'standard' && 'Confirm Resolution'}
                </>
              )}
            </button>
          </div>
        )}

        {/* Timeline & Reply Thread */}
        <div className="border-t border-border pt-5 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-accent-light" />
            <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
              Incident Audit Trail & Messages ({timeline.length})
            </h3>
          </div>

          <div className="space-y-2.5">
            {timeline.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">No messages logged yet.</p>
            ) : (
              timeline.map((event: any, idx: number) => (
                <div
                  key={idx}
                  className="bg-bg p-3 rounded-xl border border-border text-xs space-y-1"
                >
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="font-bold text-white">
                      {event.actorName} <span className="text-[10px] text-zinc-500 capitalize">({event.actorRole})</span>
                    </span>
                    <span className="text-[10px] font-mono">{event.timestamp}</span>
                  </div>
                  <p className="text-zinc-200">{event.message}</p>
                </div>
              ))
            )}
          </div>

          {/* Reply Box */}
          <div className="flex items-center gap-2 pt-2">
            <input
              type="text"
              placeholder="Add an internal note or reply to customer..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
              className="flex-1 px-4 py-2.5 bg-bg border border-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
            />
            <button
              onClick={handleSendReply}
              disabled={!replyText.trim() || addMessage.isPending}
              className="px-4 py-2.5 bg-surface-hover hover:bg-[#284f30] text-emerald-300 border border-[#2e5e39] font-bold text-xs rounded-xl transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TicketDetailPage;
