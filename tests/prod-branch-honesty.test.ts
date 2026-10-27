/**
 * Production-branch honesty for representative Firestore reads.
 *
 * The rest of the unit lane runs with `import.meta.env.DEV === true`, where the
 * hooks deliberately return demo fixtures when a read is empty or fails. That
 * green says nothing about production. This file flips the *real* hook query
 * functions to DEV=false / PROD=true and asserts the production branch:
 * - empty reads return [] (no seeded branches/users),
 * - a failed read never fabricates rows (useBranches swallows but returns [],
 *   useUsers surfaces the error),
 * - DEV=true still seeds, as an explicitly-labelled contrast case.
 *
 * The query functions are captured from the real hooks; only react-query and
 * the Firestore SDK are mocked. No app source is modified.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SYNTHETIC_ENV_KEYS,
  SYNTHETIC_TEST_ENV,
  applySyntheticTestEnv,
} from './testEnv';

interface CapturedQuery {
  queryKey?: unknown;
  queryFn?: () => Promise<unknown>;
  enabled?: boolean;
}

const { capturedQueries, getDocsMock } = vi.hoisted(() => ({
  capturedQueries: new Map<string, CapturedQuery>(),
  getDocsMock: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: CapturedQuery) => {
    const rawKey = options.queryKey;
    const key = String(Array.isArray(rawKey) ? rawKey[0] : rawKey ?? 'unknown');
    capturedQueries.set(key, options);
    return { data: [], isLoading: false, error: null };
  },
  useMutation: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/config/firebase', () => ({ db: { id: 'hermetic-fake-db' } }));

vi.mock('firebase/firestore', () => {
  const toTimestamp = (millis: number) => ({
    millis,
    seconds: Math.floor(millis / 1000),
    toDate: () => new Date(millis),
  });
  return {
    collection: vi.fn((_db: unknown, name: string) => ({ name })),
    query: vi.fn((...args: unknown[]) => args[0]),
    where: vi.fn(() => ({})),
    limit: vi.fn(() => ({})),
    getDocs: getDocsMock,
    doc: vi.fn(() => ({})),
    addDoc: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    Timestamp: {
      now: () => toTimestamp(Date.now()),
      fromMillis: (millis: number) => toTimestamp(millis),
    },
  };
});

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 'owner-1', role: 'owner', cityIds: [] } }),
}));

import { useBranches } from '@/hooks/useBranches';
import { useUsers } from '@/hooks/useUsers';

const EMPTY_SNAPSHOT = { empty: true, docs: [] };

const queryFnFor = (key: string): (() => Promise<unknown>) => {
  const query = capturedQueries.get(key);
  if (!query?.queryFn) throw new Error(`queryFn for "${key}" was not captured`);
  return query.queryFn;
};

interface EnvFieldSnapshot {
  key: string;
  processPresent: boolean;
  processValue: string | undefined;
  metaPresent: boolean;
  metaValue: unknown;
}

const metaEnvBag = (): Record<string, unknown> =>
  import.meta.env as unknown as Record<string, unknown>;

/** Every field `applySyntheticTestEnv` writes, in both bags plus the flags. */
const ENV_FIELDS_TOUCHED_BY_APPLY: readonly string[] = [
  ...SYNTHETIC_ENV_KEYS,
  'DEV',
  'PROD',
];

/**
 * Capture presence as well as value: a key that was absent must be deleted on
 * restore, never turned into the string "undefined" or a synthetic value.
 */
const snapshotEnvFields = (keys: readonly string[]): EnvFieldSnapshot[] => {
  const meta = metaEnvBag();
  return keys.map((key) => ({
    key,
    processPresent: Object.hasOwn(process.env, key),
    processValue: process.env[key],
    metaPresent: Object.hasOwn(meta, key),
    metaValue: meta[key],
  }));
};

const restoreEnvFields = (snapshot: readonly EnvFieldSnapshot[]): void => {
  const meta = metaEnvBag();
  for (const field of snapshot) {
    if (field.processPresent) {
      process.env[field.key] = field.processValue as string;
    } else {
      Reflect.deleteProperty(process.env, field.key);
    }
    if (field.metaPresent) {
      meta[field.key] = field.metaValue;
    } else {
      Reflect.deleteProperty(meta, field.key);
    }
  }
};

/**
 * Apply the synthetic env in the chosen branch. The returned restore puts back
 * every field the helper touched, including custom values set before the flip
 * and keys that were absent.
 */
const setEnvMode = (dev: boolean): (() => void) => {
  const snapshot = snapshotEnvFields(ENV_FIELDS_TOUCHED_BY_APPLY);
  applySyntheticTestEnv(process.env, import.meta.env, { dev });
  return () => restoreEnvFields(snapshot);
};

beforeEach(() => {
  capturedQueries.clear();
  getDocsMock.mockReset();
  // Capture the real hooks' useQuery configurations.
  useBranches();
  useUsers();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('production branch (DEV=false / PROD=true)', () => {
  it('empty branch and user reads return no seeded rows', async () => {
    const restoreMode = setEnvMode(false);
    try {
      getDocsMock.mockResolvedValue(EMPTY_SNAPSHOT);

      const branches = await queryFnFor('branches')();
      const users = await queryFnFor('team-users')();

      expect(branches).toEqual([]);
      expect(users).toEqual([]);
      expect(JSON.stringify(branches)).not.toContain('branch_surat_01');
      expect(JSON.stringify(users)).not.toContain('user_aarav_brand');
    } finally {
      restoreMode();
    }
  });

  it('a failed read never fabricates rows: branches fall back to empty, users surface the error', async () => {
    const restoreMode = setEnvMode(false);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      getDocsMock.mockRejectedValueOnce(new Error('HERMETIC UNIT GUARD blocked http2.connect'));
      const branches = await queryFnFor('branches')();
      expect(branches).toEqual([]);
      expect(JSON.stringify(branches)).not.toContain('branch_surat_01');
      expect(warnSpy).toHaveBeenCalled();

      getDocsMock.mockRejectedValueOnce(new Error('users backend unavailable'));
      await expect(queryFnFor('team-users')()).rejects.toThrow('users backend unavailable');
    } finally {
      warnSpy.mockRestore();
      restoreMode();
    }
  });
});

describe('DEV branch (non-production contrast)', () => {
  it('DEV=true empty reads return demo fixtures — labels what the default lane covers, not production', async () => {
    const restoreMode = setEnvMode(true);
    try {
      getDocsMock.mockResolvedValueOnce(EMPTY_SNAPSHOT);
      const branches = (await queryFnFor('branches')()) as Array<{ id: string }>;
      expect(branches.map((branch) => branch.id)).toContain('branch_surat_01');

      getDocsMock.mockResolvedValueOnce(EMPTY_SNAPSHOT);
      const users = (await queryFnFor('team-users')()) as Array<{ id: string }>;
      expect(users.map((user) => user.id)).toContain('user_aarav_brand');
    } finally {
      restoreMode();
    }
  });
});

describe('env restore isolation', () => {
  it('mode flip restores custom destination values and absent keys exactly in both bags', () => {
    const customKey = 'VITE_FUNCTIONS_API_URL';
    const absentKey = 'VITE_RECAPTCHA_SITE_KEY';
    // In this lane import.meta.env aliases the process env surface, so the same
    // custom value is set through both bags; the regression still fails if the
    // helper restores only DEV/PROD.
    const customValue = 'https://custom-functions.invalid/from-test';
    const meta = metaEnvBag();
    const before = snapshotEnvFields(ENV_FIELDS_TOUCHED_BY_APPLY);

    try {
      process.env[customKey] = customValue;
      meta[customKey] = customValue;
      Reflect.deleteProperty(process.env, absentKey);
      Reflect.deleteProperty(meta, absentKey);

      const restoreMode = setEnvMode(false);
      try {
        expect(import.meta.env.DEV).toBe(false);
        expect(import.meta.env.PROD).toBe(true);
        expect(process.env[customKey]).toBe(SYNTHETIC_TEST_ENV[customKey]);
        expect(meta[customKey]).toBe(SYNTHETIC_TEST_ENV[customKey]);
        expect(process.env[absentKey]).toBe(SYNTHETIC_TEST_ENV[absentKey]);
        expect(meta[absentKey]).toBe(SYNTHETIC_TEST_ENV[absentKey]);
      } finally {
        restoreMode();
      }

      expect(process.env[customKey]).toBe(customValue);
      expect(meta[customKey]).toBe(customValue);
      expect(Object.hasOwn(process.env, absentKey)).toBe(false);
      expect(Object.hasOwn(meta, absentKey)).toBe(false);
      expect(process.env[absentKey]).not.toBe('undefined');
      expect(import.meta.env.DEV).toBe(true);
      expect(import.meta.env.PROD).toBe(false);
    } finally {
      restoreEnvFields(before);
    }
  });
});
