/**
 * Entry point boot-order contract:
 *   1. Mount something FIRST — the app, or a dependency-free failure screen.
 *   2. Only then hide the native splash (launchAutoHide:false — the shell
 *      stays on the splash forever unless we explicitly hide it).
 *   3. One render, one App Check init, one back-button init, one shell init.
 *
 * `./App` and `./config/firebase` are imported DYNAMICALLY inside `mountApp`
 * on purpose: both have module-evaluation side effects (Firebase
 * `initializeApp`/`getAuth` throws fail-closed when env vars are absent,
 * e.g. `auth/invalid-api-key` on a QA shell without env). A static import of
 * a throwing module kills this ESM bundle before ANY runtime code runs —
 * before render and before the splash could ever be hidden — leaving the
 * native splash frozen with the process alive (Samsung SM-S921B incident).
 * Dynamic-import rejection, synchronous boot throws, and render throws are
 * all routed to the dependency-free ConfigErrorScreen instead.
 */
import { StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import './index.css';
import { initHardwareBackButton } from './shared/platform/hardwareBackButton.ts';
import { initNativeShell } from './shared/platform/nativeBootstrap.ts';
import { ConfigErrorScreen } from './shared/components/feedback/ConfigErrorScreen.tsx';
import { startBoot } from './shared/platform/bootstrapFailure.ts';

const rootEl = document.getElementById('root');

// One React root for the entire session — the failure screen reuses it so a
// throw mid-render can never trigger a second createRoot on the same element.
let root: Root | null = null;
function getRoot(): Root {
  if (root) return root;
  if (!rootEl) {
    throw new Error('Missing #root element — index.html contract broken, refusing blank render.');
  }
  root = createRoot(rootEl);
  return root;
}

function renderBootFailureScreen(error: unknown): void {
  try {
    // Commit the failure screen before startBoot is allowed to hide the splash.
    // root.render is asynchronous in React 19; without flushSync the native
    // splash can disappear before this screen reaches the DOM.
    flushSync(() => {
      getRoot().render(<ConfigErrorScreen error={error} />);
    });
  } catch {
    // Last resort when even #root is missing: straight DOM injection.
    // Text-only (no error string interpolated) — no injection surface.
    const alertNode = document.createElement('div');
    alertNode.setAttribute('role', 'alert');
    alertNode.textContent =
      'BURGONOMICS PARTNER — The app could not start. A required service is not configured. Please update the app.';
    document.body.replaceChildren(alertNode);
  }
}

void startBoot({
  async mountApp() {
    // Parallel dynamic imports: if either rejects (module-eval throw or
    // chunk fetch failure), startBoot falls through to the failure screen.
    const [{ default: App }, { initAppCheck }] = await Promise.all([
      import('./App'),
      import('./config/firebase'),
    ]);
    getRoot().render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    // App Check attestation (web only; no-op without VITE_RECAPTCHA_SITE_KEY).
    void initAppCheck();
  },
  mountFailureScreen: renderBootFailureScreen,
  // Native: hides splash + brand status bar ONLY after something mounted.
  // initNativeShell itself no-ops on web, so browser behavior is unchanged.
  hideNativeSplash: () => initNativeShell(),
});

// Android hardware back button → router-back, else minimize (native only).
// Independent of which screen mounted — registered exactly once.
initHardwareBackButton();
