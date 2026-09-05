import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initAppCheck } from './config/firebase.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// App Check attestation (web only; no-op without VITE_RECAPTCHA_SITE_KEY).
void initAppCheck()
