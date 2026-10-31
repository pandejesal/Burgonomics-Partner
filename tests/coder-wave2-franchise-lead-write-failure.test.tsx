/**
 * B3 — the franchise-lead status write must actually fail.
 *
 * The L4 rewrite in coder-wave2-partner-scope-and-toggles.test.tsx mocks
 * `useFranchiseLeads` wholesale, so its `onError` is invoked by the mock and it
 * cannot see that the REAL hook swallows the write error in DEV (the mutation
 * resolved and the operator's status select snapped back with no feedback).
 *
 * This file drives the REAL hook: `updateDoc` is mocked to reject, and the
 * rejection must reach the caller. Each test FAILS against the pre-fix hook
 * (which logged the error and `return`-ed in DEV) and passes once the hook
 * rethrows.
 */
import React, { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  leads: [] as any[],
  toastErrors: [] as string[],
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    // Hooks are stubbed so the component (and the real hook it calls) can be
    // driven in the node environment without a DOM.
    useState: (initial: unknown) => [
      typeof initial === 'function' ? (initial as () => unknown)() : initial,
      vi.fn(),
    ],
  };
});

vi.mock('sonner', () => ({
  toast: {
    error: (m: string) => state.toastErrors.push(m),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/config/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ __collection: name }),
  query: (ref: any, ...constraints: any[]) => ({ __collection: ref?.__collection, constraints }),
  where: (field: string, op: string, value: unknown) => ({ __where: { field, op, value } }),
  orderBy: (field: string, dir: string) => ({ __orderBy: { field, dir } }),
  limit: (n: number) => ({ __limit: n }),
  doc: (_db: unknown, name: string, id: string) => ({ __doc: `${name}/${id}` }),
  // The write ALWAYS fails — a rejected lead-status update must surface.
  updateDoc: vi.fn(async () => {
    throw new Error('permission-denied');
  }),
  addDoc: vi.fn(async () => undefined),
  getDocs: vi.fn(async () => ({ docs: [], empty: true, size: 0 })),
  Timestamp: {
    now: () => ({ toMillis: () => Date.now() }),
    fromMillis: (ms: number) => ({ toMillis: () => ms }),
    fromDate: (d: Date) => ({ toMillis: () => d.getTime() }),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: state.leads, isLoading: false, error: null, refetch: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  // Mirrors react-query's contract: a rejected mutationFn runs the call-site
  // onError (which is what FranchiseLeadsPipeline wires to its toast).
  useMutation: (options: any) => ({
    isPending: false,
    mutateAsync: (vars: any) => options.mutationFn(vars),
    mutate: (vars: any, callSiteOptions?: { onError?: (error: unknown) => void }) => {
      Promise.resolve()
        .then(() => options.mutationFn(vars))
        .then((data: unknown) => options.onSuccess?.(data))
        .catch((err: unknown) => callSiteOptions?.onError?.(err));
    },
  }),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 'user_1', role: 'brand_owner', branchIds: [], cityIds: [] } }),
}));

import { useFranchiseLeads } from '@/hooks/useFranchiseLeads';
import { FranchiseLeadsPipeline } from '@/components/stores/FranchiseLeadsPipeline';

const lead = (overrides: Record<string, unknown> = {}) => ({
  id: 'lead_1',
  applicantName: 'Applicant One',
  phone: '+91 90000 00000',
  email: 'applicant.one@example.com',
  city: 'Vadodara',
  investmentBudget: '25L-50L',
  commercialSpace: 'searching',
  status: 'new',
  createdAt: null,
  updatedAt: null,
  ...overrides,
});

function findElement(
  node: ReactNode,
  match: (element: ReactElement<any>) => boolean
): ReactElement<any> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, match);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement<any>(node)) return undefined;
  if (match(node as ReactElement<any>)) return node as ReactElement<any>;
  return findElement((node.props as any).children, match);
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 25));

beforeEach(() => {
  state.leads = [];
  state.toastErrors = [];
});

describe('B3 — a failed franchise-lead write is surfaced, not swallowed', () => {
  it('the real hook rejects when the write is denied', async () => {
    const hook = useFranchiseLeads();

    await expect(
      hook.updateLeadStatus.mutateAsync({ leadId: 'lead_1', status: 'approved' })
    ).rejects.toThrow(/permission-denied/);
  });

  it('the pipeline raises its onError toast when the real hook write is denied', async () => {
    state.leads = [lead()];

    const tree = FranchiseLeadsPipeline({ onConvertToBranch: vi.fn() });
    const select = findElement(tree, (element) => element.type === 'select');
    expect(select).toBeDefined();

    select!.props.onChange({ target: { value: 'approved' } });
    await flush();

    expect(state.toastErrors.some((m) => /Could not update Applicant One/.test(m))).toBe(true);
  });
});
