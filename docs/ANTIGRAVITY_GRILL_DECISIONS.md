# Burgonomics Partner — Grill Decisions Intake (2026-08-23)

**Source:** `burgonomics-foundation-core/docs/antigravity/GRILL_DECISIONS_2026-08-23.md` (17 decisions)  
**Partner execution order:** `07b` (intake 44 pages) → `08` CRM roles → `09` Porter/FCM

## What moves to partner via 07b

- `src/admin/**` (8 folders, 44 pages) → `src/admin/**` (partner preserves structure)
- `src/routes/admin*.tsx` (53 files, `admin.tsx` guard) → `src/routes/admin*` with `createFileRoute` → `react-router-dom@7` `<Route>`
- `src/utils/api.ts` + shared `firestore.rules` matrices (08/09)

## Partner-specific decisions from grill

- **Keep everything:** All 44 pages land — including System tabs (10 pages: Redis, Queues, Jobs, Logs, Metrics, Database, Audit, APIs, Health) as **Firestore-emulated** placeholders (no Redis).
- **CRM hierarchy:** Branch owner sees own branch orders/sales only; brand sees all; customer loyalty is global — partner dashboards must enforce filtering + smoke test per `08_CRM_RULES_FINAL_SPEC.md` matrix.
- **Petpooja truth:** Menu sync lands in partner `Branches` detail — `lastPetpoojaSync` badge + `PETPOOJA_DISABLED` banner until creds.
- **Porter:** `fulfillment.mode == "delivery"` Porter order created from partner `Order Detail → Assign Porter` (manual fallback if API fails). Costs visible in `ReconciliationPage`.
- **FCM:** Brand/branch/order topics subscribe on partner login — partner receives `branch_{id}` pushes for new orders (no custom WebSockets).

## Week 1 vs Week 2 in partner

- **Week 1 (blocks foundation-core 03→01):** `07b` intake compiles with `npx tsc --noEmit` 0, then CRM smoke (branch vs brand view) — Porter/FCM just scaffolded with feature flags `false`.
- **Week 2:** Live Porter `api.porter.in` + live FCM `notify.ts` + Petpooja `push_order` enable flip.

## Don't Want guard (partner enforces too)

- No second POS/KOT collection — partner KOT view reads `orders` only.
- No in-app wallet UI — loyaltyPoints global is the only balance widget.

## Verification in partner repo

```bash
npm run typecheck  # 0 errors after route conversion
npm run build
# then foundation-core smoke:
# firebase emulators:exec --only firestore "npx vitest run tests/rules --reporter=verbose"
```

## References

- Foundation-core: `docs/antigravity/07b_PARTNER_INTAKE_ADMIN.md`, `08_CRM_RULES_FINAL_SPEC.md`, `09_BACKEND_FINAL_SPEC.md`
- Portfolio spec: `LA_PINOZ_UI_SPEC.md` remains delivery-only (parallax) — partner uses own dashboard theme, not pizzeria fun
