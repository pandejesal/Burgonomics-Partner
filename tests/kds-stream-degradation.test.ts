import { describe, expect, it } from 'vitest';
import {
  KDS_STREAM_INDEX_ERROR,
  classifyKdsStreamFailure,
  deriveKdsColumnState,
  deriveKdsStreamStatus,
  kdsDataVerified,
} from '@/features/kds/hooks/useKDSRealtimeStream';
import { deriveDeliveryFeedState } from '@/features/delivery/hooks/usePorterLogistics';

/**
 * A06 regression net (parent-authored after the lane landed source without
 * tests). The bug being pinned: a failed live listener used to fall through
 * to the one-shot query and, when that also returned nothing, the makeline
 * rendered "empty kitchen" — telling the operator no orders existed while the
 * feed was actually broken. The delivery queue had the same false-empty shape.
 *
 * Every case here is a pure-function contract; no Firebase/provider calls.
 */

describe('classifyKdsStreamFailure', () => {
  it('maps Firestore failed-precondition to a missing index', () => {
    expect(classifyKdsStreamFailure({ code: 'failed-precondition' })).toBe(
      'missing_index',
    );
  });

  it('maps an index rejection surfaced without a code by message', () => {
    expect(
      classifyKdsStreamFailure(new Error('The query requires an index.')),
    ).toBe('missing_index');
  });

  it('classifies anything else as a generic listener error', () => {
    expect(classifyKdsStreamFailure({ code: 'permission-denied' })).toBe(
      'listener_error',
    );
    expect(classifyKdsStreamFailure(undefined)).toBe('listener_error');
    expect(classifyKdsStreamFailure('boom')).toBe('listener_error');
  });
});

describe('deriveKdsStreamStatus', () => {
  const base = {
    streamHydrated: false,
    listenerFailed: false,
    oneShotLoading: false,
    oneShotError: null as unknown,
  };

  it('never claims live once the listener has failed', () => {
    // Regression: a dead listener must not be reported as a live makeline.
    expect(deriveKdsStreamStatus({ ...base, listenerFailed: true })).toBe(
      'live_unavailable',
    );
    // Even when the one-shot fallback happens to have delivered data.
    expect(
      deriveKdsStreamStatus({ ...base, listenerFailed: true, streamHydrated: true }),
    ).toBe('live_unavailable');
  });

  it('claims live only after a source actually delivered', () => {
    expect(deriveKdsStreamStatus({ ...base, streamHydrated: true })).toBe('live');
  });

  it('reports unavailable when the fallback read also failed', () => {
    expect(
      deriveKdsStreamStatus({ ...base, oneShotError: new Error('denied') }),
    ).toBe('live_unavailable');
  });

  it('stays connecting while the only available source is still loading', () => {
    expect(deriveKdsStreamStatus({ ...base, oneShotLoading: true })).toBe(
      'connecting',
    );
  });

  it('does not report live merely because the one-shot query finished', () => {
    expect(deriveKdsStreamStatus(base)).toBe('connecting');
  });
});

describe('kdsDataVerified', () => {
  it('is true once the live stream hydrated', () => {
    expect(
      kdsDataVerified({
        streamHydrated: true,
        oneShotLoading: false,
        oneShotError: new Error('x'),
      }),
    ).toBe(true);
  });

  it('is true when the one-shot read completed cleanly', () => {
    expect(
      kdsDataVerified({
        streamHydrated: false,
        oneShotLoading: false,
        oneShotError: null,
      }),
    ).toBe(true);
  });

  it('is false while loading or after a failed fallback — never an empty kitchen', () => {
    expect(
      kdsDataVerified({
        streamHydrated: false,
        oneShotLoading: true,
        oneShotError: null,
      }),
    ).toBe(false);
    expect(
      kdsDataVerified({
        streamHydrated: false,
        oneShotLoading: false,
        oneShotError: new Error('denied'),
      }),
    ).toBe(false);
  });
});

describe('deriveKdsColumnState', () => {
  it('prefers loading over everything', () => {
    expect(
      deriveKdsColumnState({ isLoading: true, dataVerified: false, itemCount: 0 }),
    ).toBe('loading');
  });

  it('shows error only when no verified data exists at all', () => {
    // Regression: unverified zero rows must NOT render as "empty kitchen".
    expect(
      deriveKdsColumnState({
        isLoading: false,
        dataVerified: false,
        itemCount: 0,
      }),
    ).toBe('error');
  });

  it('keeps last good orders on screen after the listener died', () => {
    expect(
      deriveKdsColumnState({
        isLoading: false,
        dataVerified: true,
        itemCount: 3,
      }),
    ).toBe('orders');
  });

  it('renders empty only for verified zero rows', () => {
    expect(
      deriveKdsColumnState({
        isLoading: false,
        dataVerified: true,
        itemCount: 0,
      }),
    ).toBe('empty');
  });
});

describe('KDS_STREAM_INDEX_ERROR', () => {
  it('is a stable named error telling the operator data is stale', () => {
    expect(KDS_STREAM_INDEX_ERROR.name).toBe('KdsStreamIndexError');
    expect(KDS_STREAM_INDEX_ERROR.message).toContain('not deployed');
    // Identity stability is what prevents a re-announce on every rejection.
    expect(KDS_STREAM_INDEX_ERROR).toBe(KDS_STREAM_INDEX_ERROR);
  });
});

describe('deriveDeliveryFeedState', () => {
  it('surfaces an errored orders read as error, not as an empty queue', () => {
    // Regression: "No Delivery Orders In Queue" used to render on a failed
    // read, which reads as "no work" to the operator.
    expect(
      deriveDeliveryFeedState({ isLoading: false, error: new Error('denied') }),
    ).toBe('error');
  });

  it('reports loading ahead of a stale error', () => {
    expect(
      deriveDeliveryFeedState({ isLoading: true, error: new Error('denied') }),
    ).toBe('loading');
  });

  it('reports ready only when the read succeeded', () => {
    expect(deriveDeliveryFeedState({ isLoading: false, error: null })).toBe(
      'ready',
    );
  });
});
