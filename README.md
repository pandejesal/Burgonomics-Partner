# Burgonomics Partner — POS & Operations Console

> **Production Partner & Franchise Management Application**  
> Built with React 19, TypeScript, React Router v7, Tailwind CSS, Lucide Icons, and Capacitor for Android & iOS.

---

## 1. 🏢 Application Overview

The **Burgonomics Partner App** is the central operational command centre for Burgonomics franchise outlets and brand headquarters. It manages the full restaurant operations lifecycle:

- **Live Orders & KOT Stream**: Real-time kitchen order ticketing with preparation stage progression and looping audible alert chimes.
- **Dedicated Porter Logistics Screen**: Live delivery address verification, instant Porter bike courier quotes, manual 1-tap rider booking, and in-house delivery fallback.
- **3-Tier Support Ticket Escalator**: Direct resolution for customer order complaints with Razorpay full/partial refunds, goodwill coupons, or escalation to Brand Support and Developer diagnostics.
- **Branch Combo & Offer Creator**: Branch Managers create outlet-specific bundles; Brand Owners and Developers deploy brand-wide promotions.
- **Role-Based Scoping (RBAC)**: Branch Managers and Kitchen Staff operate strictly within their assigned branch scope, while Brand Owners have global multi-branch oversight and Royalty split visibility.
- **Developer Diagnostics**: Inspect Firestore snapshots, failed API payloads (Petpooja, Porter, Razorpay), client stack traces, and real-time system logs.

---

## 2. 📁 Folder Structure

```
burgonomics-partner/
├── android/                    # Capacitor Android native project
│   └── app/src/main/java/com/glassdoorsstudio/burgonomics/partner/
├── ios/                        # Capacitor iOS native project (Xcode workspace)
├── src/
│   ├── admin/                  # 44 Admin Portal views & dashboards
│   │   ├── branches/           # Dynamic branch provisioning & lead pipeline
│   │   ├── menu/               # Menu catalog & combo creator
│   │   ├── orders/             # Order management & Porter dispatch
│   │   ├── tickets/            # 3-tier support ticket resolution queue
│   │   ├── analytics/          # Sales trends & royalty ledger
│   │   ├── users/              # Staff & role assignments
│   │   └── system/             # Dev diagnostics, logs & system monitors
│   ├── config/                 # Firebase Auth & Firestore client configuration
│   ├── services/               # Authoritative Cloud Functions v2 API bridge (partnerFunctionsApi.ts)
│   ├── features/               # Feature domain stores, hooks & models
│   ├── pages/ + App.tsx        # Route components (App.tsx) + /admin/* (pages/admin/AdminRoutes.tsx)
│   └── shared/                 # Reusable UI components & 60-30-10 tokens
├── capacitor.config.ts         # Capacitor native mobile configuration
├── vite.config.ts              # Vite bundle builder & chunk splitters (sourcemap: false)
└── package.json
```

---

## ⚡ Cloud Functions Integration (`partnerFunctionsApi.ts`)

All POS mutations communicate directly with Firebase Cloud Functions v2 in `asia-south1` with automatic Bearer ID token attachment:
- **`pushOrderToPetpooja`**: Sends KOT order payloads to Petpooja POS API (`/petpooja/pushOrder`).
- **`bookPorterRider` / `rebookPorterRider`**: Dispatches 3PL courier fleet (`/porter/book`, `/porter/rebook`).
- **`verifyDeliveryOtp`**: Verifies customer 4-digit handover code (`/orders/verifyDeliveryOtp`, staff + branch scope).
- **`manualBranchDispatch`**: In-store rider terminal assignment fallback (`/orders/manualDispatch`, staff + branch scope).
- **`syncPetpoojaMenu`**: Ingests branch catalog and ingredients (`/petpooja/syncMenu`).
- **`syncItemStock`**: Single-item 86-ing push, best-effort (`/petpooja/pushStock` — Firestore is updated first, POS failure only warns).
- **`adjustCustomerCoins`**: Grill-Coins compensation with server ledger row (`/customers/adjustCoins` — branch scope enforced server-side; never fake client-side).
- **`subscribeToTopics`**: Device → branch FCM topic subscription (`/notifications/subscribe`, ownership-checked).

---

## 3. 👥 Role-Based Access Control (RBAC) Matrix

| Role | Scope | Key Permissions |
|---|---|---|
| `brand_owner` | Global (All Outlets) | Full access, royalty split ledger, add branches, brand-wide combos, invite users, set custom claims |
| `developer` | Global (All Outlets) | System diagnostics, error snapshot inspection, developer alert channels, claims administration |
| `regional_manager` | Regional (City/Multi-Branch) | Regional sales analytics, franchise lead reviews, multi-outlet operational monitoring |
| `branch_owner` | Assigned Branches | Live KOT stream, manual Porter dispatch, branch combos, ticket resolution & refund |
| `branch_staff` | Assigned Branches | Fullscreen KOT prep stream, mark items ready / 86ing stock toggles |
| `support` | Global Tickets | Tier 2 customer issue mediation & goodwill compensation |

---

## 4. 🛠️ Development & Build Commands

### Prerequisites
- Node.js 20+
- npm or pnpm
- Android Studio (for native Android builds)

### Scripts
```bash
# 1. Install dependencies
npm install

# 2. Start local development server
npm run dev

# 3. Static type check (Mandatory Gate)
npm run typecheck

# 4. Production web bundle build
npm run build

# 5. Sync Capacitor Android project (rebuilds mobile bundle FIRST — never
#    `npx cap sync` on a stale dist)
npm run cap:sync:android

# 6. Open Android Studio
npm run cap:open:android
```

---

## 5. 🎨 Design System

Styled according to the **Burgonomics Strict 60-30-10 Design System**:
- **Canvas (60%)**: `#0A0A0A` Dark Canvas / `#1A1A1A` Card Surfaces
- **Brand (30%)**: `#0E4825` Forest Green Headers & Action Anchors
- **Accent (10%)**: `#CC5200` Deep Orange CTAs & Deal Badges
- **Text**: `#4ADE80` High-Contrast WCAG AAA Emerald Text on dark surfaces

---

## 6. 🧪 Mandatory Verification & Test Suite

The Partner POS app has 118 automated tests passing across 22 test suites:
- **KDS & Orders Stream**: `src/pages/KDSPage.test.tsx`, `src/pages/OrdersPage.test.tsx`, `src/pages/OrderDetailPage.test.tsx`
- **Porter Logistics & Delivery Queue**: `tests/porter-logistics.test.ts`, `src/pages/DeliveryQueuePage.test.tsx`
- **Menu & 86ing Inventory**: `tests/menu-86ing-combo.test.tsx`, `tests/menu-inventory.test.ts`
- **Support Tickets SLA Escalator**: `tests/tickets-sla.test.ts`, `src/pages/TicketsPage.test.tsx`
- **Staff PIN & RBAC**: `tests/auth-rbac.test.ts`, `tests/staff-pin-lockout.test.ts`, `tests/users-page.test.tsx`
- **Analytics & Route Royalty Ledger**: `src/pages/AnalyticsPage.test.tsx`, `tests/crm-royalty-ledger.test.ts`
- **Performance Benchmark**: `src/test/kdsRoyalty.benchmark.test.ts` (1.32 Million operations/second)

```bash
# Run unit & component test suite (118 tests)
npm test

# Static type check (0 errors)
npx tsc --noEmit

# Compile production web & mobile bundle
npm run build
```

---

## 7. 📱 Native Mobile & App Store Release

See [`RELEASE_AND_INTEGRATION_GUIDE.md`](file:///c:/Users/DELL/Desktop/Burgonomics/RELEASE_AND_INTEGRATION_GUIDE.md) and [`STORE_SUBMISSION_GUIDE.md`](file:///c:/Users/DELL/Desktop/Burgonomics/STORE_SUBMISSION_GUIDE.md) for full publication instructions:
- **Package / Bundle ID**: `com.glassdoorsstudio.burgonomics.partner`
- **Android Release AAB**: `npm run build:mobile && npx cap sync android && cd android && ./gradlew bundleRelease`
- **iOS Xcode Archive**: Run `./mac-build.sh` on macOS and distribute via TestFlight / App Store Connect.

