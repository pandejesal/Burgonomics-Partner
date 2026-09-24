import React, { useState } from "react";
import { Network, Search, Lock, Unlock } from "lucide-react";

interface ApiEndpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  route: string;
  group:
    "Auth" | "Orders" | "Stores" | "Customers" | "Payments" | "Petpooja" | "Health" | "Developer";
  auth: boolean;
  rateLimit: string;
  description: string;
  requestSchema?: string;
  responseSchema?: string;
}

const API_BASE_NOTE =
  "Base: https://asia-south1-burgonomics-7faa8.cloudfunctions.net/api (override: VITE_FUNCTIONS_API_URL)";

const DISCOVERED_APIS: ApiEndpoint[] = [
  {
    method: "GET",
    route: "/health",
    group: "Health",
    auth: false,
    rateLimit: "No limit",
    description: `Public liveness probe. ${API_BASE_NOTE}`,
    responseSchema: JSON.stringify({ status: "healthy", timestamp: "...", service: "burgonomics-api" }, null, 2),
  },
  {
    method: "GET",
    route: "/config/app",
    group: "Health",
    auth: false,
    rateLimit: "No limit",
    description:
      "Minimum native build versions (ops-seeded via app_config/native; permissive until seeded).",
    responseSchema: JSON.stringify({ iosMin: "0.0.0", androidMin: "0.0.0" }, null, 2),
  },
  {
    method: "POST",
    route: "/payments/createPaymentOrder",
    group: "Payments",
    auth: false,
    rateLimit: "Per-route limiter",
    description:
      "Server-priced Razorpay order (catalog-validated totals, loyalty cap, idempotency key).",
    requestSchema: JSON.stringify({ items: [], orderType: "delivery", branchId: "branch_..." }, null, 2),
  },
  {
    method: "POST",
    route: "/payments/verifyPayment",
    group: "Payments",
    auth: false,
    rateLimit: "Per-route limiter",
    description: "HMAC verification + Route split. May answer 202 TRANSFER_IN_PROGRESS (retry same key).",
    requestSchema: JSON.stringify({ orderId: "...", razorpayOrderId: "...", razorpayPaymentId: "...", razorpaySignature: "..." }, null, 2),
  },
  {
    method: "POST",
    route: "/payments/refund",
    group: "Payments",
    auth: true,
    rateLimit: "Staff only (brand_owner, developer, support)",
    description: "Claim-leased refund with cumulative cap. 409 when already refunded or in progress.",
    requestSchema: JSON.stringify({ orderId: "...", razorpayPaymentId: "...", amountRupees: 100 }, null, 2),
  },
  {
    method: "POST",
    route: "/porter/quote",
    group: "Orders",
    auth: false,
    rateLimit: "Per-route limiter",
    description: "Live Porter fare quote with 10-minute fee lock (branch-radius pre-check first).",
    requestSchema: JSON.stringify({ pickupLat: 23.01, pickupLng: 72.5, dropLat: 23.03, dropLng: 72.52 }, null, 2),
  },
  {
    method: "POST",
    route: "/porter/book",
    group: "Orders",
    auth: true,
    rateLimit: "Staff only, branch-scoped",
    description: "Books a live Porter courier (idempotent per order; GPS required).",
    requestSchema: JSON.stringify({ orderId: "...", staffName: "..." }, null, 2),
  },
  {
    method: "POST",
    route: "/porter/rebook",
    group: "Orders",
    auth: true,
    rateLimit: "Staff only, branch-scoped",
    description: "Re-books after rider_cancelled / needs_review (refused otherwise with NOT_REBOOKABLE).",
    requestSchema: JSON.stringify({ orderId: "...", staffName: "..." }, null, 2),
  },
  {
    method: "POST",
    route: "/porter/cancel",
    group: "Orders",
    auth: true,
    rateLimit: "Staff only, branch-scoped",
    description:
      "Releases the local booking (rider_cancelled + needsRebook). No provider cancel API is documented — staff confirm in the Porter dashboard (providerCancel: manual-required).",
    requestSchema: JSON.stringify({ orderId: "...", staffName: "..." }, null, 2),
  },
  {
    method: "POST",
    route: "/orders/verifyDeliveryOtp",
    group: "Orders",
    auth: true,
    rateLimit: "Staff only + 3-attempt lockout",
    description: "4-digit handover OTP verification (branch-scoped).",
    requestSchema: JSON.stringify({ orderId: "...", otp: "1234" }, null, 2),
  },
  {
    method: "POST",
    route: "/orders/manualDispatch",
    group: "Orders",
    auth: true,
    rateLimit: "Staff only, branch-scoped",
    description: "In-house rider assignment with persisted rider identity.",
    requestSchema: JSON.stringify({ orderId: "...", riderName: "...", riderPhone: "..." }, null, 2),
  },
  {
    method: "POST",
    route: "/petpooja/syncMenu",
    group: "Petpooja",
    auth: true,
    rateLimit: "Staff only, branch-scoped",
    description: "Pulls outlet menu into the canonical products collection (restId join).",
    requestSchema: JSON.stringify({ branchId: "branch_..." }, null, 2),
  },
  {
    method: "POST",
    route: "/petpooja/pushOrder",
    group: "Petpooja",
    auth: true,
    rateLimit: "Staff only, branch-scoped",
    description: "Pushes the KOT for one order (claim-leased retries server-side).",
    requestSchema: JSON.stringify({ orderId: "..." }, null, 2),
  },
  {
    method: "POST",
    route: "/petpooja/pushStock",
    group: "Petpooja",
    auth: true,
    rateLimit: "Staff only, branch-scoped",
    description: "Instant 86-ing toggle for one item (restId-resolved, never raw branchId).",
    requestSchema: JSON.stringify({ branchId: "branch_...", itemId: "...", inStock: false }, null, 2),
  },
  {
    method: "POST",
    route: "/tickets/create",
    group: "Orders",
    auth: true,
    rateLimit: "Customer + spam guards",
    description: "Customer ticket with branch auto-assignment (server binds customerId).",
    requestSchema: JSON.stringify({ customerName: "...", branchId: "branch_...", category: "wrong_item", subject: "...", description: "..." }, null, 2),
  },
  {
    method: "POST",
    route: "/tickets/resolve",
    group: "Orders",
    auth: true,
    rateLimit: "Staff only, branch-scoped",
    description: "Server-side resolution; refund actions move real money via autoRefund.",
    requestSchema: JSON.stringify({ ticketId: "...", action: "full_refund", notes: "..." }, null, 2),
  },
  {
    method: "POST",
    route: "/auth/deleteAccount",
    group: "Auth",
    auth: true,
    rateLimit: "Self only + confirm:true",
    description: "DPDP erasure of the caller's own Auth user (scrubs carts/admins/PII via trigger).",
    requestSchema: JSON.stringify({ confirm: true }, null, 2),
  },
  {
    method: "POST",
    route: "/customers/adjustCoins",
    group: "Customers",
    auth: true,
    rateLimit: "Staff only, branch-scoped, audited ledger",
    description: "Grill Coins compensation (partner must never write loyaltyPoints directly).",
    requestSchema: JSON.stringify({ customerId: "...", delta: 100, reason: "..." }, null, 2),
  },
];

export const SystemApiTab: React.FC = () => {
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>(DISCOVERED_APIS);
  const [selectedApi, setSelectedApi] = useState<ApiEndpoint | null>(null);
  const [activeGroup, setActiveGroup] = useState<"all" | "Auth" | "Orders" | "Petpooja" | "Health">(
    "all",
  );
  const [searchQuery, setSearchQuery] = useState("");

  const handleSelectApi = (api: ApiEndpoint) => {
    setSelectedApi(api);
  };

  const filteredApis = endpoints.filter((api) => {
    const matchesGroup = activeGroup === "all" || api.group === activeGroup;
    const matchesSearch =
      api.route.toLowerCase().includes(searchQuery.toLowerCase()) ||
      api.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesGroup && matchesSearch;
  });

  const getMethodColor = (method: string) => {
    switch (method) {
      case "GET":
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "POST":
        return "text-blue-400 bg-blue-500/10 border-blue-500/20";
      case "PUT":
        return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      default:
        return "text-red-400 bg-red-500/10 border-red-500/20";
    }
  };

  return (
    <div className="space-y-6">
      {/* Upper overview status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 pb-4 shrink-0 gap-4">
        <div>
          <h3 className="text-sm font-black tracking-wider text-white font-mono uppercase">
            AUTOMATIC API SCHEMA EXPLORER
          </h3>
          <p className="text-[10px] text-gray-400 font-mono mt-0.5">
            Discover rest controllers, inspect schemas, and monitor rate limit quotas
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 bg-[#0c130e] border border-gray-800 rounded-xl px-3.5 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-gray-300 font-bold">{DISCOVERED_APIS.length} Endpoints Registered</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Endpoints Discovery Manifest */}
        <div className="lg:col-span-2 p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-800 pb-4 gap-4">
            <span className="block text-xs font-black text-emerald-400 font-mono uppercase tracking-widest">
              Live REST Mapping Suite
            </span>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-black/40 border border-gray-800 rounded-lg px-2 py-1">
                <Search size={12} className="text-gray-500" />
                <input
                  type="text"
                  placeholder="Search routes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-0 outline-none text-[11px] text-white placeholder-gray-600 font-mono w-[110px]"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 border-b border-gray-900 pb-2 overflow-x-auto no-scrollbar">
            {(["all", "Auth", "Orders", "Petpooja", "Health"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider font-mono ${
                  activeGroup === g
                    ? "bg-primary text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          <div className="space-y-2.5 max-h-[380px] overflow-y-auto custom-scrollbar">
            {filteredApis.map((api) => (
              <div
                key={api.route}
                onClick={() => handleSelectApi(api)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  selectedApi?.route === api.route
                    ? "bg-primary/15 border-emerald-700/50"
                    : "bg-black/30 border-gray-900/60 hover:border-gray-800"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`px-2 py-0.5 rounded border text-[10px] font-bold font-mono ${getMethodColor(api.method)}`}
                  >
                    {api.method}
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-white font-mono break-all leading-tight">
                      {api.route}
                    </span>
                    <span className="block text-[10px] text-gray-500 mt-1 leading-relaxed max-w-[400px]">
                      {api.description}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 font-mono shrink-0">
                  <div className="text-right text-[10px]">
                    <span className="block text-gray-500">Rate Limit:</span>
                    <span className="text-gray-400 font-bold">{api.rateLimit}</span>
                  </div>
                  {api.auth ? (
                    <span title="Token Authorization needed">
                      <Lock size={12} className="text-red-400" />
                    </span>
                  ) : (
                    <span title="Anonymous route">
                      <Unlock size={12} className="text-emerald-400" />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* REST Testing Client Sandbox */}
        <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl flex flex-col justify-between">
          <div className="space-y-4 flex-1 flex flex-col justify-between">
            <div>
              <div className="border-b border-gray-800 pb-3 flex items-center justify-between">
                <span className="font-mono text-xs font-black text-emerald-400 uppercase tracking-widest">
                  Endpoint Schema Viewer
                </span>
              </div>

              {selectedApi ? (
                <div className="space-y-4 font-mono text-xs mt-4">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${getMethodColor(selectedApi.method)}`}
                    >
                      {selectedApi.method}
                    </span>
                    <span className="text-[11px] font-bold text-white break-all">
                      {selectedApi.route}
                    </span>
                  </div>

                  {selectedApi.requestSchema && (
                    <div>
                      <span className="block text-[9px] text-gray-500 uppercase font-bold mb-1">
                        Body Params (JSON)
                      </span>
                      <pre className="w-full bg-black text-gray-300 border border-gray-900 rounded-lg p-2 font-mono text-[9px] select-all leading-normal whitespace-pre-wrap break-all">
                        {selectedApi.requestSchema}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-20 text-center space-y-2">
                  <Network size={24} className="text-gray-700 mx-auto animate-pulse" />
                  <p className="text-xs text-gray-500 font-mono">
                    Select a registered endpoint row to inspect its request schema
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
