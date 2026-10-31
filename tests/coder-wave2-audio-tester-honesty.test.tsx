/**
 * M2 — AudioNotificationTester: the volume slider, the repeat control and the
 * "push" button must not claim behaviour the code does not perform.
 *
 * Node-env render harness (same pattern as
 * tests/partner-app-high-findings.test.tsx): react hooks are stubbed so the
 * component can also be called as a pure function and its handlers invoked.
 * Fails against the pre-fix source (which renders "FCM", "Repeat every 15s"
 * and announces an "E5-G#5-B5" chord the chime never plays).
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reactState = vi.hoisted(() => ({
  index: 0,
  overrides: new Map<number, unknown>(),
  setters: [] as Array<(value: unknown) => void>,
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

vi.mock('@/utils/kdsAudio', () => ({
  playKDSChime: vi.fn(),
  unlockKDSAudio: vi.fn().mockResolvedValue(true),
  isKDSAudioUnlocked: vi.fn(() => false),
  isKDSAudioMuted: vi.fn(() => false),
  setKDSAudioMuted: vi.fn(),
  KDS_ALARM_REPEAT_MS: 10000,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AudioNotificationTester } from '@/features/settings/components/AudioNotificationTester';
import { playKDSChime, unlockKDSAudio } from '@/utils/kdsAudio';
import { toast } from 'sonner';

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

describe('M2: audio tester labels match real behaviour', () => {
  beforeEach(() => {
    reactState.index = 0;
    reactState.overrides.clear();
    reactState.setters.length = 0;
    vi.clearAllMocks();
  });

  it('advertises no push channel, no 15s repeat, and an honest volume scope', () => {
    const html = renderToStaticMarkup(<AudioNotificationTester />);

    expect(html).not.toContain('FCM');
    expect(html).not.toContain('Repeat every 15s');
    expect(html).toContain('every 10s'); // KDS_ALARM_REPEAT_MS / 1000
    expect(html).toContain('does not change the alarm volume');
  });

  it('announces the real chime tones, not a fabricated chord', async () => {
    const tree = AudioNotificationTester();
    const button = findButton(tree, 'Test Kitchen Chime');
    expect(button).toBeDefined();

    await button!.props.onClick?.();

    expect(playKDSChime).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledOnce();
    const message = String((toast.success as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]);
    expect(message).not.toContain('E5');
    expect(message).toContain('A5');
  });
});

describe('B1: the chime toast/badge never claim a tone that did not play', () => {
  const errorMessage = (): string =>
    String((toast.error as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] ?? '');

  beforeEach(() => {
    reactState.index = 0;
    reactState.overrides.clear();
    reactState.setters.length = 0;
    vi.clearAllMocks();
  });

  it('reports the muted alarm instead of a played tone when muted', async () => {
    // Hook index 1 is `isMuted` (0 volume, 1 mute, 2 unlocked, 3 playing,
    // 4 notification permission) — force the muted branch of the handler.
    reactState.overrides.set(1, true);

    const tree = AudioNotificationTester();
    const button = findButton(tree, 'Test Kitchen Chime');
    await button!.props.onClick?.();

    expect(playKDSChime).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledOnce();
    expect(errorMessage()).toMatch(/muted/i);
    expect(errorMessage()).not.toMatch(/A5/);
    expect(errorMessage()).not.toContain('Played the kitchen alarm test tone');
  });

  it('reports the unlock failure instead of a played tone when audio cannot unlock', async () => {
    vi.mocked(unlockKDSAudio).mockResolvedValueOnce(false);

    const tree = AudioNotificationTester();
    const button = findButton(tree, 'Test Kitchen Chime');
    await button!.props.onClick?.();

    expect(playKDSChime).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledOnce();
    expect(errorMessage()).toMatch(/could not be unlocked/i);
  });
});
