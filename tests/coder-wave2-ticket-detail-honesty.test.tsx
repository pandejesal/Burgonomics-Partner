/**
 * M5 + L5 — TicketDetailPage:
 *  - M5: the copy-payload button must await the clipboard write and report an
 *    honest failure instead of claiming success.
 *  - L5: a failed ticket reply must be reported and the draft kept.
 *
 * Node-env render harness (same pattern as
 * tests/partner-app-high-findings.test.tsx). Fails against the pre-fix source,
 * which fires-and-forgets `clipboard.writeText` and awaits `addMessage` with no
 * error handling.
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reactState = vi.hoisted(() => ({
  index: 0,
  overrides: new Map<number, unknown>(),
  setters: [] as Array<(value: unknown) => void>,
}));

const ticketState = vi.hoisted(() => ({
  ticket: {} as Record<string, unknown>,
  addMessage: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const hookIndex = reactState.index;
      reactState.index += 1;
      const setter = vi.fn();
      reactState.setters.push(setter);
      const value = reactState.overrides.has(hookIndex)
        ? reactState.overrides.get(hookIndex)
        : initial;
      return [value, setter];
    },
    useEffect: vi.fn(),
  };
});

vi.mock('react-router-dom', () => ({
  Link: () => null,
  useParams: () => ({ id: 'ticket_1' }),
  useNavigate: () => vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { role: 'developer', name: 'Dev Lane' } }),
}));

vi.mock('@/hooks/useTicket', () => ({
  useTicket: () => ({
    ticket: ticketState.ticket,
    isLoading: false,
    addMessage: ticketState.addMessage,
  }),
}));

vi.mock('@/services/partnerFunctionsApi', () => ({
  partnerFunctionsApi: {
    resolveTicket: vi.fn(),
    escalateTicket: vi.fn(),
    resolveTicketNote: vi.fn(),
  },
}));

vi.mock('@/utils/ticketContract', () => ({
  normalizeTier: (raw: unknown) => (typeof raw === 'string' ? raw : 'branch'),
  normalizeTimeline: (raw: unknown) => (Array.isArray(raw) ? raw : []),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TicketDetailPage } from '@/pages/TicketDetailPage';
import { toast } from 'sonner';

const writeText = vi.fn();

function flattenText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((child) => flattenText(child)).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return flattenText(node.props.children);
  return '';
}

function findButton(
  node: ReactNode,
  text: string
): ReactElement<{ onClick?: () => unknown }> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findButton(child, text);
      if (hit) return hit;
    }
    return undefined;
  }
  if (!isValidElement<{ children?: ReactNode; onClick?: () => unknown }>(node)) return undefined;
  if (node.type === 'button' && flattenText(node.props.children).includes(text)) return node;
  return findButton(node.props.children, text);
}

describe('M5 / L5: ticket detail reports real outcomes', () => {
  beforeEach(() => {
    reactState.index = 0;
    reactState.overrides.clear();
    reactState.setters.length = 0;
    vi.clearAllMocks();
    ticketState.addMessage.mutateAsync = vi.fn();
    ticketState.ticket = {
      id: 'ticket_1',
      ticketNumber: 'TKT-1',
      title: 'Cold burger',
      category: 'food_quality',
      branchId: 'branch_1',
      branchName: 'Surat Adajan',
      orderId: 'ord_1',
      message: 'Burger arrived cold',
      raisedByName: 'Aarav',
      status: 'open',
      assignedTo: { tier: 'branch' },
      diagnostics: { razorpayPaymentId: 'pay_1' },
      timeline: [],
      createdAt: { toDate: () => new Date('2026-10-01T10:00:00Z') },
    };
    vi.stubGlobal('navigator', { clipboard: { writeText } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('M5: never confirms a copy when the clipboard write rejects', async () => {
    writeText.mockRejectedValue(new Error('NotAllowedError'));

    const tree = TicketDetailPage();
    const button = findButton(tree, 'Copy Payload');
    expect(button).toBeDefined();

    await button!.props.onClick?.();

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Copy failed'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('M5: confirms the copy only after the clipboard write resolves', async () => {
    writeText.mockResolvedValue(undefined);

    const tree = TicketDetailPage();
    const button = findButton(tree, 'Copy Payload');
    expect(button).toBeDefined();

    await button!.props.onClick?.();

    expect(writeText).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('copied to clipboard'));
  });

  it('L5: reports a failed reply send and keeps the draft', async () => {
    ticketState.addMessage.mutateAsync.mockRejectedValueOnce(new Error('offline'));
    reactState.overrides.set(5, 'Please re-check this order'); // replyText useState

    const tree = TicketDetailPage();
    const button = findButton(tree, 'Send');
    expect(button).toBeDefined();

    await button!.props.onClick?.();

    expect(toast.error).toHaveBeenCalledWith('Reply NOT sent.', expect.anything());
    // Draft preserved: the replyText setter (useState #5) is never called.
    expect(reactState.setters[5]).not.toHaveBeenCalled();
  });
});
