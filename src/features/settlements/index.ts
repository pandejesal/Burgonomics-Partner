import type { UserRole } from '@/types';
import { istMonthKey, istMonthLabel, previousIstMonthKey } from '@/utils/analyticsMath';

/**
 * Franchise settlement screen: policy, display maths and ordering (owner
 * decision 2026-11-20).
 *
 * One statement per branch per Asia/Kolkata calendar month:
 *
 *   net payable = online collected - online refunds - ONE flat monthly fee
 *
 * Cash is what the branch already holds. It is shown for information and never
 * enters the net payable. Every judgement behind that sentence is listed in the
 * evidence root's `ASSUMPTIONS.md`.
 *
 * The server computes every amount; this module only *presents* it. There is no
 * arithmetic here that could disagree with the stored statement.
 */

/** One payment record appended by "mark as paid" (cash evidence, not a transfer). */
export interface SettlementPaymentRecord {
  paidAtMs: number;
  reference: string;
  recordedBy: string;
  recordedByEmail: string | null;
  note: string | null;
  /** The signed net this payment settled (a part payout is smaller than the balance). */
  settledNetPaise?: number;
}

/**
 * Stored statement shape (`branch_settlements/{branchId}_{monthKey}_v00N`).
 * Only the fields the screen renders are typed; extra server fields pass
 * through untouched.
 */
export interface SettlementStatement {
  id: string;
  branchId: string;
  branchName: string;
  monthKey: string;
  version: number;
  currency: 'INR';
  onlineCollectedPaise: number;
  onlineRefundedPaise: number;
  onlineNetPaise: number;
  onlineOrders: number;
  /** Cash the branch already collected. Informational: never part of the net. */
  cashCollectedPaise: number;
  cashOrders: number;
  cashPendingOrders: number;
  /** Walk-in counter UPI the branch took itself: reported apart from cash. */
  branchUpiCollectedPaise?: number;
  branchUpiOrders?: number;
  /** Signed change against the previous version of the same month. */
  netAdjustmentPaise?: number;
  /** Online captures still pending brand review: they block this month. */
  unresolvedCaptures?: number;
  platformFeePaise: number;
  /** Negative or zero net means the branch owes the brand. */
  netPayablePaise: number;
  branchOwes: boolean;
  outstandingPaise?: number;
  ledgerSchema?: number;
  current?: boolean;
  complete?: boolean;
  feeApplicable: boolean;
  feeApplicableReason?: string;
  feeNote?: string;
  paidStatus: 'unpaid' | 'paid';
  paidAtMs: number | null;
  paymentReference: string | null;
  payments: SettlementPaymentRecord[];
  generatedAtMs: number;
  generatedBy?: string;
  assumptionsVersion?: string;
  ordersTruncated?: boolean;
  notes?: string[];
}

/** Month filter selection: a closed `YYYY-MM` month. */
export interface SettlementMonthOption {
  monthKey: string;
  label: string;
}

/** Roles the route policy admits (mirrors the server's read scope). */
const SETTLEMENT_READ_ROLES: UserRole[] = ['brand_owner', 'developer', 'branch_owner'];

/** Roles that may generate a month or record a payment (server: brand only). */
const SETTLEMENT_WRITE_ROLES: UserRole[] = ['brand_owner', 'developer'];

/** Roles that see every branch; everyone else sees their own branches only. */
const BRAND_WIDE_ROLES: UserRole[] = ['brand_owner', 'developer'];

/** Documentation shown beside the fee line, mirroring the server's note. */
export const SETTLEMENT_FEE_EXPLAINER =
  'Flat platform fee, once per branch per month, whatever the sales — shown as a single ' +
  'GST-inclusive line. Cash and counter money stays with the branch and is never deducted.';

/** True when the role may open the Settlements screen at all. */
export function canReadSettlements(role: UserRole | undefined): boolean {
  return !!role && SETTLEMENT_READ_ROLES.includes(role);
}

/** True when the role sees every branch rather than only its own. */
export function seesEveryBranch(role: UserRole | undefined): boolean {
  return !!role && BRAND_WIDE_ROLES.includes(role);
}

/** Generating (or regenerating) a month is an owner/brand action. */
export function canGenerateSettlement(role: UserRole | undefined): boolean {
  return !!role && SETTLEMENT_WRITE_ROLES.includes(role);
}

/** "Mark as paid" records evidence; only owner/brand may do it. */
export function canRecordSettlementPayment(role: UserRole | undefined): boolean {
  return !!role && SETTLEMENT_WRITE_ROLES.includes(role);
}

/**
 * The closed months a picker may offer, newest first. The running month is
 * never offered: it has not closed, so the server would refuse it.
 */
export function settlementMonthKeys(
  count = 12,
  now: Date = new Date(),
): string[] {
  const currentKey = istMonthKey(now) || istMonthKey(Date.now());
  if (!currentKey) return [];
  const wanted = Math.max(1, Math.floor(Number(count) || 0));
  const keys: string[] = [];
  let cursor = previousIstMonthKey(currentKey);
  while (keys.length < wanted && cursor) {
    keys.push(cursor);
    cursor = previousIstMonthKey(cursor);
  }
  return keys;
}

/** Picker options with human labels ("November 2026"). */
export function settlementMonthOptions(
  count = 12,
  now: Date = new Date(),
): SettlementMonthOption[] {
  return settlementMonthKeys(count, now).map((monthKey) => ({
    monthKey,
    label: istMonthLabel(monthKey),
  }));
}

/** The month an operator most likely wants: the last closed one. */
export function defaultSettlementMonth(now: Date = new Date()): string {
  return settlementMonthKeys(1, now)[0] ?? '';
}

/**
 * `₹` formatting for statement amounts. Paise in, a whole-rupee string out —
 * a statement never shows fractions of a rupee, and a negative amount keeps its
 * sign (the branch owes money). `null`/`undefined` render as an em dash so a
 * missing value never reads as a zero balance.
 */
export function settlementMoney(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '—';
  const value = Number(paise);
  if (!Number.isFinite(value)) return '—';
  const rupees = Math.round(value / 100);
  const sign = rupees < 0 ? '-' : '';
  return `${sign}₹${Math.abs(rupees).toLocaleString('en-IN')}`;
}

/** Date label for a stored epoch-ms instant, in IST. */
export function settlementDateLabel(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  const date = new Date(Number(ms));
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** Who owes whom, in words, instead of asking the reader to parse a minus. */
export function settlementNetLabel(statement: SettlementStatement): string {
  const net = settlementOutstanding(statement);
  if (net === null) return 'Payment blocked';
  if (net < 0) return 'Branch owes brand';
  if (net === 0) return 'Settled to zero';
  return 'Payable to branch';
}

export function settlementOutstanding(statement: SettlementStatement): number | null {
  // Strict cutover gate: a legacy row (no ledger schema) is NEVER payable, even
  // when it carries an old `netPayablePaise`. Only a signed outstanding from a
  // current, complete ledger-schema-1 statement is actionable.
  const amount = statement.outstandingPaise;
  const actionable = statement.ledgerSchema === 1 &&
    statement.current === true &&
    statement.complete === true &&
    statement.ordersTruncated !== true &&
    typeof amount === 'number' && Number.isSafeInteger(amount);
  return actionable ? amount : null;
}

/** Paid state with the reference once money has been recorded. */
export function settlementPaidLabel(statement: SettlementStatement): string {
  const outstanding = settlementOutstanding(statement);
  if (outstanding === null) return 'Blocked';
  if (outstanding !== 0) {
    // A residual is never hidden behind a "Paid" badge: a part payment says so.
    return statement.payments?.length
      ? `Part-settled · ${settlementMoney(Math.abs(outstanding))} ${outstanding < 0 ? 'owed to brand' : 'still owed'}`
      : 'Unpaid';
  }
  if (statement.paidStatus !== 'paid') return 'Settled to zero';
  const reference = String(statement.paymentReference ?? '').trim();
  return reference ? `Paid · ${reference}` : 'Paid';
}

/** The amount the branch owes, as a positive figure, or 0 when it is owed money. */
export function settlementAmountDue(statement: SettlementStatement): number {
  const net = settlementOutstanding(statement) ?? 0;
  return net < 0 ? Math.abs(net) : 0;
}

/** True when a statement carries a note worth surfacing (truncated scan, fee fallback). */
export function settlementHasWarnings(statement: SettlementStatement): boolean {
  return statement?.ordersTruncated === true || (statement?.notes?.length ?? 0) > 0;
}

/**
 * Display ordering: the branches that owe the brand first (those need action),
 * then the rest by branch name. Also keeps one row per branch — the newest
 * version — so a duplicate from the server can never render a branch twice.
 */
export function sortStatementsForDisplay(
  statements: readonly SettlementStatement[],
): SettlementStatement[] {
  const newest = new Map<string, SettlementStatement>();
  for (const statement of statements || []) {
    if (!statement?.branchId) continue;
    const held = newest.get(statement.branchId);
    if (!held || Number(statement.version) > Number(held.version)) {
      newest.set(statement.branchId, statement);
    }
  }
  return [...newest.values()].sort((a, b) => {
    // Display order keeps the historical net key; only the payout surface
    // switches to signed outstanding.
    const owingA = Number(a.netPayablePaise) < 0 ? 0 : 1;
    const owingB = Number(b.netPayablePaise) < 0 ? 0 : 1;
    if (owingA !== owingB) return owingA - owingB;
    return String(a.branchName || a.branchId).localeCompare(
      String(b.branchName || b.branchId),
    );
  });
}

/** Totals across the visible statements (controller view only). */
export interface SettlementTotals {
  netPayablePaise: number;
  feePaise: number;
  onlineCollectedPaise: number;
  onlineRefundedPaise: number;
  onlineNetPaise: number;
  cashCollectedPaise: number;
  branchUpiCollectedPaise: number;
  payableToBranchesPaise: number;
  owesBrandPaise: number;
  unpaidCount: number;
  paidCount: number;
  branchCount: number;
}

export function settlementTotals(
  statements: readonly SettlementStatement[],
): SettlementTotals {
  const rows = sortStatementsForDisplay(statements);
  return rows.reduce<SettlementTotals>(
    (acc, statement) => {
      const outstanding = settlementOutstanding(statement) ?? 0;
      acc.netPayablePaise += outstanding;
      acc.feePaise += Number(statement.platformFeePaise) || 0;
      acc.onlineCollectedPaise += Number(statement.onlineCollectedPaise) || 0;
      acc.onlineRefundedPaise += Number(statement.onlineRefundedPaise) || 0;
      acc.onlineNetPaise += Number(statement.onlineNetPaise) || 0;
      acc.cashCollectedPaise += Number(statement.cashCollectedPaise) || 0;
      acc.branchUpiCollectedPaise += Number(statement.branchUpiCollectedPaise) || 0;
      // Payable and collect-back stay separate figures: netting them hides both
      // the money to fund and the money to recover.
      if (outstanding < 0) acc.owesBrandPaise += Math.abs(outstanding);
      else acc.payableToBranchesPaise += outstanding;
      if (statement.paidStatus === 'paid' && outstanding === 0) acc.paidCount += 1;
      else acc.unpaidCount += 1;
      acc.branchCount += 1;
      return acc;
    },
    {
      netPayablePaise: 0,
      feePaise: 0,
      onlineCollectedPaise: 0,
      onlineRefundedPaise: 0,
      onlineNetPaise: 0,
      cashCollectedPaise: 0,
      branchUpiCollectedPaise: 0,
      payableToBranchesPaise: 0,
      owesBrandPaise: 0,
      unpaidCount: 0,
      paidCount: 0,
      branchCount: 0,
    },
  );
}
