import * as React from 'react';

type RootHeightVar = `--${string}`;

/**
 * Publishes an element's measured border-box height as a CSS custom property on
 * `<html>` for as long as that element is attached, then removes exactly that
 * property when it detaches.
 *
 * Why this exists: `scroll-padding-top` on the document scroller is how the
 * browser keeps a Tab-focused control out from under sticky chrome (WCAG 2.2
 * SC 2.4.11). The partner Header is NOT a fixed height — it is `flex-col` on
 * phones and wraps to two rows, and at 200% text it grows further. A literal
 * padding reserves the wrong band, which is exactly what the hosted 56-row
 * matrix measured on `/orders`, where row actions landed underneath it.
 *
 * Deliberately narrow: it only writes its own property, so other owners can
 * publish independently without clobbering root styles. Nothing is published
 * before layout (height 0), because a stale value would reserve space that is
 * no longer covered.
 */
export function useRootHeightVar(name: RootHeightVar, enabled = true) {
  const cleanup = React.useRef<(() => void) | null>(null);

  const ref = React.useCallback(
    (node: HTMLElement | null) => {
      cleanup.current?.();
      cleanup.current = null;

      if (!node || !enabled || typeof document === 'undefined') return;

      const root = document.documentElement;
      let attached = true;
      const apply = () => {
        if (!attached) return;
        // Measure the border box, independent of any entrance transform.
        const height = node.offsetHeight;
        if (!Number.isFinite(height) || height <= 0) {
          root.style.removeProperty(name);
          return;
        }
        root.style.setProperty(name, `${height}px`);
      };
      const release = () => root.style.removeProperty(name);

      apply();

      let observer: ResizeObserver | null = null;
      const onResize = () => apply();
      if (typeof ResizeObserver === 'function') {
        observer = new ResizeObserver(onResize);
        observer.observe(node);
      } else if (typeof window !== 'undefined') {
        window.addEventListener('resize', onResize);
      }

      cleanup.current = () => {
        attached = false;
        observer?.disconnect();
        if (!observer && typeof window !== 'undefined') {
          window.removeEventListener('resize', onResize);
        }
        release();
      };
    },
    [name, enabled],
  );

  React.useEffect(() => () => cleanup.current?.(), []);

  return ref;
}
