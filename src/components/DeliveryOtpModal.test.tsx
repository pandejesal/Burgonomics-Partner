/**
 * Handover OTP honesty (partner, functional regression).
 *
 * Defect (candidate D2): in a DEV/test build the page passed
 * `allowDemoSkip={import.meta.env.DEV}`, so the modal rendered a "skip OTP"
 * control that called `onVerified(orderId)` directly. `onVerified` is the
 * caller's "handover verified, order delivered" path, so a DEV build reported a
 * completed delivery that never happened — no OTP, no `verifyDeliveryOtp`, no
 * server write.
 *
 * Contract asserted here:
 *   - nothing in the modal may report a verified handover without a successful
 *     server verification;
 *   - a legacy `allowDemoSkip` prop (what the page used to pass in DEV) is
 *     inert: no bypass control, no `onVerified`;
 *   - only a resolved `verifyDeliveryOtp` may call `onVerified`, exactly once;
 *   - the 4-digit check, busy guard and failure message are preserved;
 *   - the OTP travels to the server; no local "0000"-style fallback exists.
 *
 * Hermetic: `verifyDeliveryOtp` and the auth slice are mocked, so no network,
 * no Firebase, no real OTP and no order write leaves this fixture.
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const verifyDeliveryOtp = vi.fn();

vi.mock('@/services/porterDelivery', () => ({
  verifyDeliveryOtp: (...args: unknown[]) => verifyDeliveryOtp(...args),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: { name: string } | null }) => unknown) =>
    selector({ user: { name: 'Fixture Operator' } }),
}));

import { DeliveryOtpModal } from './DeliveryOtpModal';

// Repo test-harness pattern (as in useRootHeightVar.test.tsx et al.): tell React
// this is an act() environment so a mid-pending re-render assertion is legal.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const ORDER_ID = 'ord_fixture_handover_0001';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  verifyDeliveryOtp.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

type ModalProps = React.ComponentProps<typeof DeliveryOtpModal>;

interface RenderOptions {
  /** Reproduces the old page argument: `allowDemoSkip={import.meta.env.DEV}`. */
  legacyDemoSkip?: boolean;
  onVerified?: (orderId: string) => void;
  onClose?: () => void;
}

async function renderModal({ legacyDemoSkip = false, onVerified = vi.fn(), onClose = vi.fn() }: RenderOptions = {}) {
  // A build that still passes the removed prop must stay inert. The cast keeps
  // this fixture compiling once the prop is gone from the public props type.
  const props = {
    orderId: ORDER_ID,
    customerName: 'Fixture Customer',
    onVerified,
    onClose,
    ...(legacyDemoSkip ? { allowDemoSkip: true } : {}),
  } as unknown as ModalProps;

  await act(async () => {
    root.render(<DeliveryOtpModal {...props} />);
  });
  return { onVerified, onClose };
}

function buttons(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button'));
}

function buttonMatching(pattern: RegExp): HTMLButtonElement | undefined {
  return buttons().find((button) => pattern.test(button.textContent ?? ''));
}

function otpInput(): HTMLInputElement {
  const input = container.querySelector('input');
  expect(input).not.toBeNull();
  return input as HTMLInputElement;
}

function typeOtp(value: string) {
  const input = otpInput();
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  expect(setValue).toBeTypeOf('function');
  setValue?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function click(element: Element | null | undefined, times = 1) {
  expect(element).toBeTruthy();
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      (element as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });
}

async function pressEnter() {
  await act(async () => {
    otpInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('DeliveryOtpModal never fakes a verified handover', () => {
  it('does not report verification from a DEV/legacy allowDemoSkip fixture', async () => {
    // This is the exact page wiring that shipped the defect: a DEV build passes
    // the bypass flag. It must not be able to complete a delivery.
    const { onVerified } = await renderModal({ legacyDemoSkip: true });

    const bypassButtons = buttons().filter((button) => /skip/i.test(button.textContent ?? ''));
    expect(bypassButtons).toEqual([]);

    for (const button of bypassButtons) {
      await click(button);
    }

    expect(onVerified).not.toHaveBeenCalled();
    expect(verifyDeliveryOtp).not.toHaveBeenCalled();
  });

  it('re-Enter on the still-enabled INPUT while the server is pending does not re-verify', async () => {
    // The disabled-button case in the guard block below cannot prove the guard:
    // React does not dispatch click handlers for a disabled button. The OTP
    // input stays enabled, so a second Enter is a real re-entry attempt through
    // the live onKeyDown handler and must be stopped by the busy guard itself.
    const pending = deferred<{ success: boolean; orderId: string; deliveredAt: string }>();
    verifyDeliveryOtp.mockReturnValue(pending.promise);
    const { onVerified } = await renderModal();

    typeOtp('4321');
    await pressEnter();

    const input = otpInput();
    expect(input.disabled).toBe(false);

    await pressEnter();

    expect(verifyDeliveryOtp).toHaveBeenCalledTimes(1);
    expect(onVerified).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve({ success: true, orderId: ORDER_ID, deliveredAt: 'x' });
      await pending.promise;
    });
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it('offers only close, cancel and verify — every rendered control is inert without a code', async () => {
    // Not a label check: a differently-worded bypass ("Continue without code",
    // "Confirm manually", …) would keep the old /skip/ regex green. So assert
    // the exact CONTROL INVENTORY, then activate every rendered control with an
    // empty OTP and require that none of them verifies or reports a handover.
    const { onVerified, onClose } = await renderModal({ legacyDemoSkip: true });

    const inventory = buttons().map((button) => (button.textContent ?? '').trim());
    expect(inventory).toEqual(['', 'Cancel', 'Verify & Deliver']);

    for (const button of buttons()) {
      await click(button);
      expect(verifyDeliveryOtp).not.toHaveBeenCalled();
      expect(onVerified).not.toHaveBeenCalled();
    }

    // The close paths are the only inert actions: they dismiss, never verify.
    expect(onClose).toHaveBeenCalled();
    expect(container.textContent).toContain('Enter the 4-digit OTP from the customer screen.');
  });

  it('keeps the modal on screen with the OTP field while nothing is verified', async () => {
    const { onVerified } = await renderModal({ legacyDemoSkip: true });
    expect(otpInput()).not.toBeNull();
    expect(onVerified).not.toHaveBeenCalled();
  });
});

describe('DeliveryOtpModal verified path goes through the server', () => {
  it('calls onVerified exactly once, only after the server confirms', async () => {
    const pending = deferred<{ success: boolean; orderId: string; deliveredAt: string }>();
    verifyDeliveryOtp.mockReturnValue(pending.promise);
    const { onVerified } = await renderModal();

    typeOtp('4321');
    await click(buttonMatching(/Verify & Deliver/i));

    // Before the server answers: the handover is NOT reported.
    expect(verifyDeliveryOtp).toHaveBeenCalledTimes(1);
    expect(onVerified).not.toHaveBeenCalled();
    expect(buttonMatching(/Verifying/i)?.disabled).toBe(true);

    await act(async () => {
      pending.resolve({ success: true, orderId: ORDER_ID, deliveredAt: '2026-11-08T10:00:00.000Z' });
      await pending.promise;
    });

    expect(onVerified).toHaveBeenCalledTimes(1);
    expect(onVerified).toHaveBeenCalledWith(ORDER_ID);
    expect(verifyDeliveryOtp).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      otp: '4321',
      staffName: 'Fixture Operator',
    });
  });

  it('sends the typed OTP unchanged and never substitutes a local code', async () => {
    verifyDeliveryOtp.mockResolvedValue({ success: true, orderId: ORDER_ID, deliveredAt: 'x' });
    await renderModal();

    typeOtp('0000');
    await click(buttonMatching(/Verify & Deliver/i));

    expect(verifyDeliveryOtp).toHaveBeenCalledTimes(1);
    expect(verifyDeliveryOtp).toHaveBeenCalledWith(
      expect.objectContaining({ otp: '0000' }),
    );
    // The submitted code is the one the operator typed, not a constant.
    expect(verifyDeliveryOtp.mock.calls[0][0].otp).toBe(otpInput().value);
  });

  it('submits on Enter as well as the button, still gated on the server', async () => {
    const pending = deferred<{ success: boolean; orderId: string; deliveredAt: string }>();
    verifyDeliveryOtp.mockReturnValue(pending.promise);
    const { onVerified } = await renderModal();

    typeOtp('1357');
    await pressEnter();

    expect(verifyDeliveryOtp).toHaveBeenCalledTimes(1);
    expect(onVerified).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve({ success: true, orderId: ORDER_ID, deliveredAt: 'x' });
      await pending.promise;
    });
    expect(onVerified).toHaveBeenCalledTimes(1);
  });
});

describe('DeliveryOtpModal failure and guard behaviour is preserved', () => {
  it('shows the server message and reports nothing when verification is rejected', async () => {
    verifyDeliveryOtp.mockRejectedValue(new Error('OTP expired. Ask the customer to refresh.'));
    const { onVerified } = await renderModal();

    typeOtp('4321');
    await click(buttonMatching(/Verify & Deliver/i));

    expect(onVerified).not.toHaveBeenCalled();
    expect(container.textContent).toContain('OTP expired. Ask the customer to refresh.');
    // Busy state released so the operator can retry.
    expect(buttonMatching(/Verify & Deliver/i)?.disabled).toBe(false);
  });

  it('rejects a non-4-digit code locally without touching the server', async () => {
    const { onVerified } = await renderModal();

    typeOtp('12');
    await click(buttonMatching(/Verify & Deliver/i));

    expect(verifyDeliveryOtp).not.toHaveBeenCalled();
    expect(onVerified).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Enter the 4-digit OTP from the customer screen.');
  });

  it('does not double-verify on repeated taps while the server is pending', async () => {
    const pending = deferred<{ success: boolean; orderId: string; deliveredAt: string }>();
    verifyDeliveryOtp.mockReturnValue(pending.promise);
    const { onVerified } = await renderModal();

    typeOtp('4321');
    await click(buttonMatching(/Verify & Deliver/i));

    // While the server is pending the button is disabled; a further activation
    // of that rendered (busy) control must not start a second verification.
    const busyButton = container.querySelector('button[disabled]');
    expect(busyButton).not.toBeNull();
    await click(busyButton);

    expect(verifyDeliveryOtp).toHaveBeenCalledTimes(1);
    expect(onVerified).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve({ success: true, orderId: ORDER_ID, deliveredAt: 'x' });
      await pending.promise;
    });
    expect(onVerified).toHaveBeenCalledTimes(1);
  });
});
