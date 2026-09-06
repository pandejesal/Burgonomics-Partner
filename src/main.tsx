import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initAppCheck } from './config/firebase.ts'
import { initHardwareBackButton } from './shared/platform/hardwareBackButton.ts'
import { initNativeShell } from './shared/platform/nativeBootstrap.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// App Check attestation (web only; no-op without VITE_RECAPTCHA_SITE_KEY).
void initAppCheck()

// Android hardware back button → router-back, else minimize (native only).
initHardwareBackButton()

// Splash hide + status-bar brand color after first render (native only).
void initNativeShell()
