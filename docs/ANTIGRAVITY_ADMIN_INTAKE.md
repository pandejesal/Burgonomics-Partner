# Antigravity — Admin Portal Intake (Partner App)

**Source:** `burgonomics-foundation-core` (`src/admin/**` + `src/routes/admin*.tsx`, 85+53 files)  
**Target:** `burgonomics-partner` (`C:\Users\DELL\Desktop\Burgonomics\burgonomics-partner`)  
**Author:** Muse Spark (planning only) · **Executor:** Antigravity

> Mirror of `burgonomics-foundation-core/docs/antigravity/07b_PARTNER_INTAKE_ADMIN.md` — read that file as canonical. This file is the partner-side pointer.

## Quick Start for Antigravity (in partner repo)
1. Read `../burgonomics-foundation-core/docs/antigravity/07_ADMIN_PORTAL_EXTRACTION.md` and `07b_PARTNER_INTAKE_ADMIN.md` (full spec, file map, router conversion).
2. Create branch `feat/intake-admin-portal`.
3. Copy `src/admin` + `src/routes/admin*` from delivery (pre-deletion commit) → adapt TanStack Router → `react-router-dom@7` (`Outlet`/`useNavigate`/`useLocation`).
4. Set `capacitor.config.ts` appId → `com.glassdoorsstudio.burgonomics.partner`; add `VITE_API_BASE=https://burgonomics.netlify.app` to `.env.example`.
5. Align `src/config/firebase.ts` with delivery's `firebaseConfig` (same project); copy admin `firestore.rules` blocks.
6. Verify: `npm run typecheck`, `npm run lint`, `npm run build`, manual `/admin/login`.

## Backend Focus This Week
Even though this is a UI move, the admin portal is backend-heavy (orders, payments, stores, Firestore admin checks). Treat as backend work per week-1 constraint — no delivery UI polish until extraction lands.

## References
- Delivery removal: `burgonomics-foundation-core/docs/antigravity/07a_DELIVERY_REMOVE_ADMIN.md`
- Week plan: `burgonomics-foundation-core/docs/antigravity/00_BACKEND_WEEK_PLAN.md`
