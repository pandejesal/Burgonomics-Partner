import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Global query/mutation failure wiring.
 *
 * `queryClient` used to live inside `App.tsx`, where the only way to exercise
 * the caches was to render the whole router/page/Firebase graph. It now lives
 * here so the real `QueryCache`/`MutationCache` callbacks can be driven with a
 * synthetic rejected query and mutation — no network, no component render.
 *
 * Contract under test:
 * - the structured logger receives the source-owned event ID plus the error
 *   object (never a formatted message),
 * - the existing user-facing toast copy is unchanged,
 * - query defaults (`staleTime` 30s, `retry` 1) are unchanged.
 */

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/core/logging/logger', () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn(), critical: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

beforeEach(() => {
  mocks.loggerError.mockReset();
  mocks.toastError.mockReset();
});

describe('queryClient failure wiring', () => {
  it('keeps the existing query defaults', async () => {
    const { queryClient } = await import('./queryClient');

    expect(queryClient.getDefaultOptions().queries).toEqual({
      staleTime: 1000 * 30,
      retry: 1,
    });
  });

  it('a rejected query logs query.error with the real error and keeps the toast copy', async () => {
    const { queryClient } = await import('./queryClient');
    const failure = new Error('synthetic query failure');

    await expect(
      queryClient.fetchQuery({
        queryKey: ['synthetic-query-failure'],
        // `retry: 1` is the shipped default; the cache callback is what is under
        // test here, so retries are disabled to keep the case fast and offline.
        retry: false,
        queryFn: () => Promise.reject(failure),
      }),
    ).rejects.toBe(failure);

    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
    expect(mocks.loggerError).toHaveBeenCalledWith('query.error', failure);

    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).toHaveBeenCalledWith('Data load failed', {
      description: 'synthetic query failure',
    });
  });

  it('a rejected mutation logs mutation.error with the real error and keeps the toast copy', async () => {
    const { queryClient } = await import('./queryClient');
    const failure = new Error('synthetic mutation failure');
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationKey: ['synthetic-mutation-failure'],
      mutationFn: () => Promise.reject(failure),
    });

    await expect(mutation.execute(undefined)).rejects.toBe(failure);

    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
    expect(mocks.loggerError).toHaveBeenCalledWith('mutation.error', failure);

    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).toHaveBeenCalledWith('Action failed', {
      description: 'synthetic mutation failure',
    });
  });

  it('falls back to the existing copy when a rejected query carries no message', async () => {
    const { queryClient } = await import('./queryClient');

    await expect(
      queryClient.fetchQuery({
        queryKey: ['synthetic-query-failure-no-message'],
        retry: false,
        queryFn: () => Promise.reject({ reason: 'synthetic non-Error rejection' }),
      }),
    ).rejects.toEqual({ reason: 'synthetic non-Error rejection' });

    expect(mocks.toastError).toHaveBeenCalledWith('Data load failed', {
      description: 'Please reload and try again',
    });
    // The rejection value is forwarded as-is; the logger shapes it downstream.
    expect(mocks.loggerError).toHaveBeenCalledWith('query.error', {
      reason: 'synthetic non-Error rejection',
    });
  });
});
