import React, { useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useBranches } from '@/hooks/useBranches';
import { useSettlements, settlementErrorMessage } from '@/hooks/useSettlements';
import {
  SETTLEMENT_FEE_EXPLAINER,
  canGenerateSettlement,
  canRecordSettlementPayment,
  seesEveryBranch,
  settlementAmountDue,
  settlementDateLabel,
  settlementMoney,
  settlementMonthOptions,
  settlementNetLabel,
  settlementPaidLabel,
  settlementTotals,
  type SettlementMonthOption,
  type SettlementStatement,
} from '@/features/settlements';
import { downloadSettlementCsv } from '@/features/settlements/settlementCsv';
import { istMonthLabel } from '@/utils/analyticsMath';
import { Spinner } from '@/components/ui/Spinner';
import {
  ArrowDownToLine,
  CalendarRange,
  CheckCircle2,
  IndianRupee,
  Info,
  RefreshCw,
  ShieldAlert,
  Store,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

interface SettlementsPageProps {
  /** Test/render seam: statements already known, so the real markup renders offline. */
  initialStatements?: SettlementStatement[];
  initialMonthKey?: string;
}

/** Today's local `YYYY-MM-DD` for the paid-date input's default. */
function todayIso(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts;
}

/**
 * Franchise Settlements (owner decision 2026-11-20).
 *
 * One statement per branch per Asia/Kolkata calendar month:
 *
 *   net payable = online collected - online refunds - ONE flat monthly fee
 *
 * Cash and counter money is what the branch already holds: it is displayed for
 * information and never added to the payable. Every amount on this screen comes
 * from the server's stored statement; the screen never re-derives money.
 *
 * "Mark as paid" records a reference and a date. The app moves no money.
 */
export function SettlementsPage({
  initialStatements,
  initialMonthKey,
}: SettlementsPageProps = {}) {
  const { user } = useAuthStore();
  const role = user?.role;

  const months = useMemo<SettlementMonthOption[]>(() => {
    const closed = settlementMonthOptions(12);
    // A caller-supplied month (deep link, a test seam, or a month older than
    // the 12-month picker) must stay selectable — otherwise the control would
    // show a month its list does not contain.
    if (initialMonthKey && !closed.some((m) => m.monthKey === initialMonthKey)) {
      return [
        { monthKey: initialMonthKey, label: istMonthLabel(initialMonthKey) },
        ...closed,
      ];
    }
    return closed;
  }, [initialMonthKey]);
  const [monthKey, setMonthKey] = useState<string>(initialMonthKey || months[0]?.monthKey || '');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [paidTarget, setPaidTarget] = useState<SettlementStatement | null>(null);
  // N1: a statement that is already paid refuses a second payment unless the
  // operator states this is an ADDITIONAL payment. Two UTRs on one statement is
  // a real accounting event, so the escape hatch exists — but it is a decision,
  // never a silent double tap.
  const [additionalPayment, setAdditionalPayment] = useState(false);
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(todayIso());
  const [note, setNote] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const hook = useSettlements({
    monthKey,
    ...(initialStatements ? { initialStatements } : {}),
  });

  const { branches } = useBranches();
  const canGenerate = canGenerateSettlement(role);
  const canMarkPaid = canRecordSettlementPayment(role);
  const brandWide = seesEveryBranch(role);

  if (hook.forbidden) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-rose-900/60 bg-rose-950/40 p-6 text-rose-200 space-y-2"
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5" />
          <h1 className="font-bold">Not available</h1>
        </div>
        <p className="text-sm">
          Settlement statements are visible to the owner, brand roles and a branch's own
          owner. This account does not have access.
        </p>
      </div>
    );
  }

  const statements = hook.statements;
  const totals = settlementTotals(statements);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await downloadSettlementCsv({ monthKey });
      toast.success(`Exported ${result.filename}`);
    } catch (err) {
      toast.error('CSV export failed — nothing was saved.', {
        description: settlementErrorMessage(err),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleGenerate = async (branchId: string) => {
    try {
      const statement = await hook.generate(branchId);
      if (statement) toast.success('Settlement statement generated.');
      else toast.success('Nothing is owed for that branch in this month.');
    } catch (err) {
      toast.error('Statement NOT generated — nothing was stored.', {
        description: settlementErrorMessage(err),
      });
    }
  };

  const handleMarkPaid = async () => {
    if (!paidTarget) return;
    const trimmed = reference.trim();
    if (!trimmed) {
      toast.error('A payment reference is required (bank UTR, cheque or voucher number).');
      return;
    }
    try {
      await hook.markPaid({
        statementId: paidTarget.id,
        reference: trimmed,
        paidOn,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(additionalPayment ? { additionalPayment: true } : {}),
      });
      toast.success('Payment recorded. No money was moved by this app.');
      setPaidTarget(null);
      setReference('');
      setNote('');
      setAdditionalPayment(false);
    } catch (err) {
      toast.error('Payment NOT recorded — the statement is unchanged.', {
        description: settlementErrorMessage(err),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-accent">
            <Wallet className="w-5 h-5" />
            <h1 className="text-xl font-black text-white">Settlements</h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
            Month-end statement per branch. Online money is collected centrally; cash and
            counter money stays with the branch. {SETTLEMENT_FEE_EXPLAINER}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Month
            </span>
            <div className="flex items-center gap-2 rounded-xl bg-neutral-950 border border-neutral-800 px-3">
              <CalendarRange className="w-4 h-4 text-zinc-500" />
              <select
                value={monthKey}
                onChange={(e) => setMonthKey(e.target.value)}
                className="min-h-11 bg-transparent text-white text-xs font-semibold focus:outline-none"
              >
                {months.map((month) => (
                  <option key={month.monthKey} value={month.monthKey}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={isExporting}
            className="min-h-11 px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-white text-xs font-bold hover:border-accent disabled:opacity-50 inline-flex items-center gap-2"
          >
            {isExporting ? <Spinner size="sm" /> : <ArrowDownToLine className="w-4 h-4" />}
            Export CSV
          </button>
        </div>
      </div>

      {hook.error && (
        <div
          role="alert"
          className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-4 text-amber-200 text-xs space-y-2"
        >
          <p className="font-bold">Settlements could not be loaded</p>
          <p>{hook.error}</p>
          <button
            type="button"
            onClick={() => hook.refetch()}
            className="min-h-11 px-3 py-1.5 rounded-lg bg-amber-900/40 border border-amber-700 text-amber-100 font-bold inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )}

      {hook.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : statements.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-sm text-zinc-300">
          <p className="font-bold text-white">No settlement statements for this month.</p>
          <p className="mt-1 text-zinc-400">
            Statements are generated on the 1st of the month for the month just ended.
            {canGenerate
              ? ' You can generate one for a branch below.'
              : ' Ask the brand owner to generate the month.'}
          </p>
          {canGenerate && (
            <div className="mt-4 flex flex-wrap gap-2">
              {branches.map((branch) => (
                <button
                  key={branch.id}
                  type="button"
                  onClick={() => void handleGenerate(branch.id)}
                  disabled={hook.isGenerating}
                  className="min-h-11 px-3 py-2 rounded-xl bg-accent text-white text-xs font-bold disabled:opacity-50"
                >
                  Generate statement · {branch.name}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-800">
          <table className="w-full min-w-[900px] text-left text-xs">
            <caption className="sr-only">
              Settlement statements for the selected month, one row per branch
            </caption>
            <thead className="bg-neutral-950 text-zinc-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th scope="col" className="px-4 py-3">Branch</th>
                <th scope="col" className="px-4 py-3 text-right">Online collected</th>
                <th scope="col" className="px-4 py-3 text-right">Online refunds</th>
                <th scope="col" className="px-4 py-3 text-right">Flat fee</th>
                <th scope="col" className="px-4 py-3 text-right">Net payable</th>
                <th scope="col" className="px-4 py-3">Paid</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {statements.map((statement) => {
                const owing = Number(statement.netPayablePaise) < 0;
                return (
                  <React.Fragment key={statement.id}>
                    <tr className="align-top">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-bold text-white">
                          <Store className="w-4 h-4 text-zinc-500" />
                          {statement.branchName}
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-500">
                          {statement.monthKey} · v{statement.version}
                          {statement.feeApplicable === false && statement.feeApplicableReason
                            ? ` · no fee: ${statement.feeApplicableReason}`
                            : ''}
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-400">
                          Cash the branch holds: {settlementMoney(statement.cashCollectedPaise)}
                          {` (${statement.cashOrders} completed`}
                          {statement.cashPendingOrders > 0
                            ? `, ${statement.cashPendingOrders} still open)`
                            : ')'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-200">
                        {settlementMoney(statement.onlineCollectedPaise)}
                        <div className="text-[11px] text-zinc-500">
                          net {settlementMoney(statement.onlineNetPaise)} · {statement.onlineOrders} order
                          {statement.onlineOrders === 1 ? '' : 's'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-300">
                        {settlementMoney(statement.onlineRefundedPaise)}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-200">
                        {settlementMoney(statement.platformFeePaise)}
                      </td>
                      <td className={`px-4 py-3 text-right font-black ${owing ? 'text-rose-300' : 'text-emerald-300'}`}>
                        {settlementMoney(statement.netPayablePaise)}
                        <div className="text-[11px] font-semibold text-zinc-400">
                          {settlementNetLabel(statement)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">
                        {settlementPaidLabel(statement)}
                        {statement.paidAtMs ? (
                          <div className="text-[11px] text-zinc-500">
                            {settlementDateLabel(statement.paidAtMs)}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setExpandedId(expandedId === statement.id ? null : statement.id)}
                            aria-expanded={expandedId === statement.id}
                            className="min-h-11 px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-zinc-200 font-bold"
                          >
                            {expandedId === statement.id ? 'Hide' : 'Details'}
                          </button>
                          {canMarkPaid && statement.paidStatus !== 'paid' && (
                            <button
                              type="button"
                              onClick={() => {
                                setPaidTarget(statement);
                                setAdditionalPayment(false);
                                setReference('');
                                setPaidOn(todayIso());
                                setNote('');
                              }}
                              className="min-h-11 px-3 py-2 rounded-lg bg-accent text-white font-bold"
                            >
                              Mark as paid
                            </button>
                          )}
                          {canMarkPaid && statement.paidStatus === 'paid' && (
                            <button
                              type="button"
                              onClick={() => {
                                setPaidTarget(statement);
                                // A second payment on a settled statement is an
                                // explicit decision: the form starts with the
                                // additional-payment box ticked.
                                setAdditionalPayment(true);
                                setReference('');
                                setPaidOn(todayIso());
                                setNote('');
                              }}
                              className="min-h-11 px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-zinc-200 font-bold"
                            >
                              Record additional payment
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedId === statement.id && (
                      <tr className="bg-neutral-950/60">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="grid gap-4 lg:grid-cols-3">
                            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                                Online money
                              </p>
                              <ul className="mt-2 space-y-1 text-zinc-200">
                                <li className="flex justify-between gap-3">
                                  <span>Collected (Razorpay)</span>
                                  <span className="font-semibold">{settlementMoney(statement.onlineCollectedPaise)}</span>
                                </li>
                                <li className="flex justify-between gap-3">
                                  <span>Refunded</span>
                                  <span className="font-semibold">-{settlementMoney(statement.onlineRefundedPaise)}</span>
                                </li>
                                <li className="flex justify-between gap-3 border-t border-neutral-800 pt-1">
                                  <span>Online net</span>
                                  <span className="font-black">{settlementMoney(statement.onlineNetPaise)}</span>
                                </li>
                              </ul>
                            </div>

                            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                                Cash the branch holds
                                <Info className="w-3 h-3" aria-hidden="true" />
                              </p>
                              <ul className="mt-2 space-y-1 text-zinc-200">
                                <li className="flex justify-between gap-3">
                                  <span>Completed cash orders</span>
                                  <span className="font-semibold">{settlementMoney(statement.cashCollectedPaise)}</span>
                                </li>
                                <li className="flex justify-between gap-3">
                                  <span>Orders count</span>
                                  <span className="font-semibold">{statement.cashOrders}</span>
                                </li>
                                {statement.cashPendingOrders > 0 && (
                                  <li className="flex justify-between gap-3 text-amber-300">
                                    <span>Still open (not yet in hand)</span>
                                    <span className="font-semibold">{statement.cashPendingOrders}</span>
                                  </li>
                                )}
                              </ul>
                              <p className="mt-2 text-[11px] text-zinc-500">
                                Informational only. The branch already has this money, so it is
                                never added to the payable or deducted from it.
                              </p>
                            </div>

                            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                                The one platform fee
                              </p>
                              <ul className="mt-2 space-y-1 text-zinc-200">
                                <li className="flex justify-between gap-3">
                                  <span>Fee for this month</span>
                                  <span className="font-semibold">{settlementMoney(statement.platformFeePaise)}</span>
                                </li>
                                <li className="flex justify-between gap-3 border-t border-neutral-800 pt-1">
                                  <span className="font-bold">Net payable</span>
                                  <span className={`font-black ${owing ? 'text-rose-300' : 'text-emerald-300'}`}>
                                    {settlementMoney(statement.netPayablePaise)}
                                  </span>
                                </li>
                                {owing && (
                                  <li className="flex justify-between gap-3 text-rose-300">
                                    <span>Branch owes brand</span>
                                    <span className="font-bold">{settlementMoney(settlementAmountDue(statement))}</span>
                                  </li>
                                )}
                              </ul>
                              {statement.feeNote && (
                                <p className="mt-2 text-[11px] text-zinc-500">{statement.feeNote}</p>
                              )}
                            </div>
                          </div>

                          {Array.isArray(statement.notes) && statement.notes.length > 0 && (
                            <ul className="mt-3 list-disc pl-5 text-[11px] text-amber-300">
                              {statement.notes.map((entry) => (
                                <li key={entry}>{entry}</li>
                              ))}
                            </ul>
                          )}

                          {Array.isArray(statement.payments) && statement.payments.length > 0 && (
                            <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                                Recorded payments
                              </p>
                              <ul className="mt-2 space-y-1 text-zinc-200">
                                {statement.payments.map((payment, index) => (
                                  <li key={`${payment.reference}-${payment.paidAtMs}-${index}`} className="flex flex-wrap justify-between gap-2">
                                    <span>
                                      {settlementDateLabel(payment.paidAtMs)} · {payment.reference}
                                    </span>
                                    <span className="text-zinc-500">
                                      {payment.recordedByEmail || payment.recordedBy}
                                      {payment.note ? ` · ${payment.note}` : ''}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            {brandWide && (
              <tfoot className="bg-neutral-950 text-zinc-300 font-bold">
                <tr>
                  <td className="px-4 py-3">
                    All branches · {totals.branchCount}
                    <div className="text-[11px] font-normal text-zinc-500">
                      {totals.unpaidCount} unpaid · {totals.paidCount} paid
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">{settlementMoney(totals.onlineNetPaise)}</td>
                  <td className="px-4 py-3 text-right"></td>
                  <td className="px-4 py-3 text-right">{settlementMoney(totals.feePaise)}</td>
                  <td className="px-4 py-3 text-right">{settlementMoney(totals.netPayablePaise)}</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Mark as paid — evidence only */}
      {paidTarget && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <IndianRupee className="w-4 h-4 text-accent" />
            <h2 className="font-bold text-white">
              Record payment · {paidTarget.branchName} · {settlementMoney(paidTarget.netPayablePaise)}
            </h2>
          </div>
          <p className="text-xs text-zinc-400">
            This records evidence of a payment you made outside the app. It moves no money
            and changes no amount on the statement.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                Payment reference
              </span>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={120}
                placeholder="Bank UTR / cheque / voucher number"
                className="min-h-11 rounded-xl bg-neutral-950 border border-neutral-700 px-3 text-white text-xs focus:outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                Date paid (IST)
              </span>
              <input
                type="date"
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
                className="min-h-11 rounded-xl bg-neutral-950 border border-neutral-700 px-3 text-white text-xs focus:outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                Note (optional)
              </span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="e.g. part payout, balance next week"
                className="min-h-11 rounded-xl bg-neutral-950 border border-neutral-700 px-3 text-white text-xs focus:outline-none focus:border-accent"
              />
            </label>
          </div>
          {paidTarget.paidStatus === 'paid' && (
            <label className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3">
              <input
                type="checkbox"
                checked={additionalPayment}
                onChange={(e) => setAdditionalPayment(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="text-xs text-amber-200">
                This is an <strong>additional</strong> payment on a statement that is already
                marked paid. Leave it unticked unless you are recording a second payout — an
                unticked second payment is refused.
              </span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleMarkPaid()}
              disabled={hook.isMarkingPaid}
              className="min-h-11 px-4 py-2 rounded-xl bg-accent text-white font-bold text-xs disabled:opacity-50 inline-flex items-center gap-2"
            >
              {hook.isMarkingPaid ? <Spinner size="sm" /> : <CheckCircle2 className="w-4 h-4" />}
              Record payment
            </button>
            <button
              type="button"
              onClick={() => setPaidTarget(null)}
              className="min-h-11 px-4 py-2 rounded-xl bg-neutral-800 text-zinc-200 font-bold text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {canGenerate && statements.length > 0 && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
          <p className="text-xs font-bold text-zinc-300">
            Generate a new version
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            A regeneration never overwrites history: it stores the next version of the
            statement.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {branches.map((branch) => (
              <button
                key={branch.id}
                type="button"
                onClick={() => void handleGenerate(branch.id)}
                disabled={hook.isGenerating}
                className="min-h-11 px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-700 text-white text-xs font-bold disabled:opacity-50"
              >
                {branch.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default SettlementsPage;
