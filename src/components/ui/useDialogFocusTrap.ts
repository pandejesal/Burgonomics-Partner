import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface DialogFocusTrapOptions {
  /** Whether the dialog is currently mounted and visible. */
  active: boolean;
  /** Called on Escape. The caller decides whether closing is allowed. */
  onEscape?: () => void;
}

/**
 * Minimal modal a11y contract (A11Y-05): while `active`
 *  - focus moves into the dialog,
 *  - Tab / Shift+Tab wrap inside it instead of escaping to the page behind,
 *  - Escape invokes `onEscape`,
 *  - focus returns to the previously focused trigger on unmount/close.
 *
 * Returns the ref to attach to the dialog element. Deliberately does not
 * render anything or manage roles — those stay with each modal's markup.
 */
export function useDialogFocusTrap<T extends HTMLElement>({
  active,
  onEscape,
}: DialogFocusTrapOptions): RefObject<T | null> {
  const ref = useRef<T>(null);
  // Latest callback without re-running the effect on every parent render.
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    const previouslyFocused =
      typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

    const focusables = (): HTMLElement[] =>
      node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];

    if (node) {
      const first = focusables()[0];
      (first ?? node).focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscapeRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !node) return;

      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;

      if (!node.contains(activeEl)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeEl === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return ref;
}

export default useDialogFocusTrap;
