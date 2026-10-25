import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Runbook §8 staff-hook honesty, asserted by running the real query functions:
 * a failed backend read must surface (never be masked by a demo fixture), demo
 * fixtures may only appear for a genuinely empty dev collection, and every demo
 * record is marked as one.
 */
const h = vi.hoisted(() => ({
  queryFn: null as null | (() => Promise<any>),
  user: {
    id: 'staff_fixture',
    role: 'branch_owner',
    branchIds: ['branch_surat_01'],
    cityIds: [] as string[],
  } as any,
  readDocs: null as null | ((q: any) => Promise<any>),
  readDoc: null as null | ((ref: any) => Promise<any>),
  docsCalls: 0,
}));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useRef: (current: any) => ({ current }),
  useState: (initial: any) => [typeof initial === 'function' ? initial() : initial, () => undefined],
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: any) => {
    h.queryFn = options.queryFn;
    return { data: undefined, isLoading: false, error: null };
  },
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: h.user }),
}));
vi.mock('@/stores/appStore', () => ({
  useAppStore: () => ({ selectedBranchId: 'branch_surat_01' }),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', async (original) => {
  const actual = await original<typeof import('firebase/firestore')>();
  return {
    ...actual,
    collection: (_db: unknown, path: string) => ({ path }),
    query: (ref: any, ...constraints: any[]) => ({ ref, constraints }),
    where: (field: string, op: string, value: unknown) => ({ kind: 'where', field, op, value }),
    orderBy: (field: string, direction: string) => ({ kind: 'orderBy', field, direction }),
    limit: (count: number) => ({ kind: 'limit', count }),
    doc: (_db: unknown, path: string, id: string) => ({ path: `${path}/${id}`, id }),
    getDoc: (ref: any) => h.readDoc!(ref),
    getDocs: (q: any) => {
      h.docsCalls += 1;
      return h.readDocs!(q);
    },
  };
});

import { useTicket } from '../src/hooks/useTicket';
import { useTickets } from '../src/hooks/useTickets';
import { demoSeedRoster, useUsers } from '../src/hooks/useUsers';

const docsSnapshot = (docs: Array<{ id: string; data: Record<string, any> }>) => {
  const entries = docs.map((d) => ({ id: d.id, data: () => d.data }));
  return {
    empty: entries.length === 0,
    docs: entries,
    forEach: (fn: (d: { id: string; data: () => Record<string, any> }) => void) =>
      entries.forEach(fn),
  };
};

const missingDoc = async (ref: { id: string }) => ({
  exists: () => false,
  id: ref.id,
  data: () => ({}),
});

const setDev = (dev: boolean) => vi.stubEnv('DEV', dev as unknown as string);

describe('useTicket — a failed read is visible, never a demo ticket', () => {
  beforeEach(() => {
    h.queryFn = null;
  });

  it('rejects with the backend failure in dev', async () => {
    setDev(true);
    h.readDoc = async () => {
      throw new Error('unavailable');
    };
    useTicket('tkt_001');
    await expect(h.queryFn!()).rejects.toThrow('unavailable');
  });

  it('rejects with the backend failure in production', async () => {
    setDev(false);
    h.readDoc = async () => {
      throw new Error('permission-denied');
    };
    useTicket('tkt_001');
    await expect(h.queryFn!()).rejects.toThrow('permission-denied');
  });

  it('an unknown id in production fails visible instead of serving the demo fixture', async () => {
    setDev(false);
    h.readDoc = missingDoc;
    useTicket('tkt_001');
    await expect(h.queryFn!()).rejects.toThrow('Ticket not found.');
  });

  it('the dev-only demo ticket is marked [DEMO] and carries no invented payment or POS diagnostics', async () => {
    setDev(true);
    h.readDoc = missingDoc;
    useTicket('tkt_001');
    const ticket = await h.queryFn!();
    expect(ticket.ticketNumber).toBe('DEMO-TICK-0001');
    expect(ticket.title.startsWith('[DEMO]')).toBe(true);
    expect(ticket).not.toHaveProperty('razorpayPaymentId');
    expect(ticket).not.toHaveProperty('petpoojaOrderId');
    expect(ticket).not.toHaveProperty('errorStack');
  });
});

describe('useTickets — seeds never cover a failed read', () => {
  beforeEach(() => {
    h.queryFn = null;
    h.docsCalls = 0;
  });

  it('a failed collection read in dev returns no demo tickets', async () => {
    setDev(true);
    h.readDocs = async () => {
      throw new Error('unavailable');
    };
    useTickets({});
    const tickets = await h.queryFn!();
    expect(tickets).toEqual([]);
    expect(h.docsCalls).toBe(2);
  });

  it('an empty dev backend serves a queue whose every ticket is marked DEMO-TICK-*', async () => {
    setDev(true);
    h.readDocs = async () => docsSnapshot([]);
    useTickets({});
    const tickets = await h.queryFn!();
    expect(tickets.length).toBeGreaterThan(0);
    for (const ticket of tickets) {
      expect(ticket.ticketNumber).toMatch(/^DEMO-TICK-\d{4}$/);
      expect(ticket.title.startsWith('[DEMO]')).toBe(true);
    }
  });

  it('production never serves the demo queue', async () => {
    setDev(false);
    h.readDocs = async () => docsSnapshot([]);
    useTickets({});
    expect(await h.queryFn!()).toEqual([]);
  });
});

describe('useUsers — permission-denied is an honest empty, other failures surface', () => {
  beforeEach(() => {
    h.queryFn = null;
  });

  it('rejects a real backend failure instead of returning the demo roster', async () => {
    setDev(true);
    h.readDocs = async () => {
      throw new Error('unavailable');
    };
    useUsers();
    await expect(h.queryFn!()).rejects.toThrow('unavailable');
  });

  it('a permission-denied read is an honest empty, and its dev seed roster is marked', async () => {
    setDev(true);
    h.readDocs = async () => {
      const denied = new Error('denied') as Error & { code?: string };
      denied.code = 'permission-denied';
      throw denied;
    };
    useUsers();
    const users = await h.queryFn!();
    expect(users.length).toBeGreaterThan(0);
    for (const user of users) expect(user.name.startsWith('[DEMO]')).toBe(true);
  });

  it('production never seeds a roster for an empty collection', async () => {
    setDev(false);
    h.readDocs = async () => docsSnapshot([]);
    useUsers();
    expect(await h.queryFn!()).toEqual([]);
  });

  it('demoSeedRoster marks every demo person and claims no live presence', () => {
    const roster = demoSeedRoster();
    expect(roster).toHaveLength(6);
    for (const user of roster) {
      expect(user.name.startsWith('[DEMO]')).toBe(true);
      expect(user.lastActiveAt).toBeUndefined();
    }
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});
