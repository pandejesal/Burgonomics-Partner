import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

/**
 * The KDS Acknowledge control existed but KDSPage never passed a pending
 * count, so it could never render: staff had no way to silence the 10s
 * repeating alarm without leaving the screen. These pin the wiring from the
 * hook's pending tickets to the visible control, and that activating it
 * silences the alarm through the real acknowledge entry point.
 */

const audio = vi.hoisted(() => ({
  acknowledgeKDSAlarm: vi.fn(),
  playKDSChime: vi.fn(),
  isKDSAudioMuted: vi.fn(() => false),
  setKDSAudioMuted: vi.fn(),
  unlockKDSAudio: vi.fn(async () => true),
  isKDSAudioUnlocked: vi.fn(() => true),
}));

const pendingOrder = (id: string) =>
  ({
    id,
    status: 'pending',
    orderType: 'takeaway',
    customerName: 'Aarav Patel',
    customerPhone: '+919876543210',
    items: [],
    total: 250,
  }) as any;

const stream = vi.hoisted(() => ({
  pending: [] as any[],
}));

vi.mock('@/utils/kdsAudio', () => audio);
vi.mock('@/config/firebase', () => ({ app: {}, auth: {}, db: {}, messaging: null }));
vi.mock('@/core/config/firebase', () => ({ db: {} }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { role: 'branch_owner', name: 'Op' } }),
}));
vi.mock('@/stores/appStore', () => ({
  useAppStore: () => ({ selectedBranchId: 'branch_1', setSelectedBranchId: vi.fn() }),
}));
vi.mock('@/features/kds/hooks/useKDSRealtimeStream', () => ({
  useKDSRealtimeStream: () => ({
    isOnline: true,
    isLoading: false,
    streamError: null,
    activeOrders: stream.pending,
    pendingOrders: stream.pending,
    preparingOrders: [],
    readyOrders: [],
    bumpOrder: vi.fn(),
    bumpingIds: {},
    recallLastOrder: vi.fn(),
    canRecall: false,
    lastBumpedOrder: null,
    refresh: vi.fn(),
    lastRefreshAt: Date.now(),
  }),
}));

vi.mock('@/features/kds/components/KDSQuick86Drawer', () => ({
  KDSQuick86Drawer: () => null,
}));

import { AcousticChimePlayer } from '../src/features/kds/components/AcousticChimePlayer';
import { KDSPage } from '../src/pages/KDSPage';

const noop = () => {};

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  const props = (node as React.ReactElement<{ children?: React.ReactNode }>).props;
  return props ? textOf(props.children) : '';
}

function findButton(
  node: React.ReactNode,
  text: string,
): React.ReactElement<{ onClick?: () => void }> | null {
  if (node == null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findButton(child, text);
      if (found) return found;
    }
    return null;
  }
  const el = node as React.ReactElement<{ children?: React.ReactNode; onClick?: () => void }>;
  if (typeof el.props?.onClick === 'function' && textOf(el).includes(text)) {
    return el as React.ReactElement<{ onClick?: () => void }>;
  }
  return findButton(el.props?.children, text);
}

function renderPlayer(pendingCount: number, onAcknowledge?: () => void): string {
  return renderToStaticMarkup(
    <AcousticChimePlayer
      isMuted={false}
      audioUnlocked
      onToggleMute={noop}
      onUnlockAudio={noop}
      pendingCount={pendingCount}
      {...(onAcknowledge ? { onAcknowledge } : {})}
    />,
  );
}

describe('KDS Acknowledge control', () => {
  it('renders the control while tickets are pending', () => {
    expect(renderPlayer(2)).toContain('Acknowledge');
  });

  it('hides the control when the makeline is clear', () => {
    expect(renderPlayer(0)).not.toContain('Acknowledge');
  });

  it('acknowledging silences the alarm exactly once', () => {
    audio.acknowledgeKDSAlarm.mockClear();

    const tree = AcousticChimePlayer({
      isMuted: false,
      audioUnlocked: true,
      onToggleMute: noop,
      onUnlockAudio: noop,
      pendingCount: 2,
    }) as React.ReactElement;

    const button = findButton(tree, 'Acknowledge');
    expect(button).not.toBeNull();

    button!.props.onClick!();

    expect(audio.acknowledgeKDSAlarm).toHaveBeenCalledTimes(1);
    expect(audio.acknowledgeKDSAlarm).toHaveBeenCalledWith(2);
  });

  it('passes the displayed pending count to the acknowledge handler', () => {
    const onAcknowledge = vi.fn();

    const tree = AcousticChimePlayer({
      isMuted: false,
      audioUnlocked: true,
      onToggleMute: noop,
      onUnlockAudio: noop,
      pendingCount: 5,
      onAcknowledge,
    }) as React.ReactElement;

    findButton(tree, 'Acknowledge')!.props.onClick!();

    expect(onAcknowledge).toHaveBeenCalledTimes(1);
    expect(onAcknowledge).toHaveBeenCalledWith(5);
  });

  it('KDSPage passes the live pending count so the control is reachable', () => {
    stream.pending = [pendingOrder('ord_a'), pendingOrder('ord_b')];

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <KDSPage />
      </MemoryRouter>,
    );

    expect(html).toContain('Acknowledge');

    stream.pending = [];
    const empty = renderToStaticMarkup(
      <MemoryRouter>
        <KDSPage />
      </MemoryRouter>,
    );

    expect(empty).not.toContain('Acknowledge');
  });
});
