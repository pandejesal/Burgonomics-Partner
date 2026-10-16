import React, { Suspense, lazy, useState, useMemo, useEffect, useRef } from "react";
import {
  Store as StoreIcon,
  MapPin,
  Phone,
  Clock,
  Settings,
  Activity,
  FileText,
  Image as ImageIcon,
  Users,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  XCircle,
  X,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  ExternalLink,
  Copy,
  RotateCw,
  Play,
  Check,
  Lock,
  ShieldAlert,
  Trash2,
  Calendar,
  ChevronRight,
  Download,
  Compass,
  Eye,
  Layers,
  Trash,
  CheckCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { PageHeader } from "../components/Headers";
// Below-the-fold analytics charts are code-split (recharts stays out of the
// initial stores bundle; the shell list/grid/radar renders first).
const StoreAnalyticsCharts = lazy(() => import("./StoreAnalyticsCharts"));
import { StatCard } from "../components/Cards";
import { StatusBadge, HealthBadge } from "../components/Badges";
// Revision 1: ConfirmDialog is intentionally NOT imported here — its submit
// handler fires onClose() without awaiting onConfirm(), which would close the
// open/close dialog before a failed write resolved. This page uses a local
// confirm flow instead (see "CONFIRM TOGGLE STORE MODAL").
import {
  RichStore,
  StaffMember,
  StoreDocument,
  RichStoreHours,
  WeeklySchedule,
} from "./storesData";
import { useAdmin } from "@/admin/hooks/useAdmin";
import { adminStoresService } from "../services/adminStoresService";
import { partnerFunctionsApi } from "@/services/partnerFunctionsApi";

type ViewTab = "list" | "grid" | "radar";

// Loop 6/120: shared validator so store creation cannot persist fabricated
// contact numbers. Returns normalized display form or null.
export function normalizeIndianMobile(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (!/^[6-9]\d{9}$/.test(d)) return null;
  // Reject fabricated/placeholder shapes: the retired "+91 98765 00000"
  // default and all-same-digit numbers must never enter the live directory.
  if (d === "9876500000" || /^(\d)\1{9}$/.test(d)) return null;
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
}

// Loop 57/120: pure mapper so genuinely-synced stores can be stamped without
// touching stores whose sync failed or was never attempted. Unsynced rows
// keep their existing state (no fabricated versions, no forced status).
export function markStoresSynced(
  stores: RichStore[],
  syncedIds: ReadonlySet<string>,
  syncedAt: string,
): RichStore[] {
  return stores.map((s) =>
    syncedIds.has(s.id)
      ? {
          ...s,
          lastSyncTime: syncedAt,
          webhookStatus: "active" as const,
          circuitBreaker: "closed" as const,
          webhookFailures: 0,
          retryCount: 0,
        }
      : s,
  );
}

// P0-3: store ids come from timestamp/random entropy, never a list-length
// counter (the old `str_0` + row-count scheme collided across deletes and let
// two concurrent creates overwrite each other).
export function generateStoreId(): string {
  return `str_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// P0-3: everything the operator typed (plus the validated phone), and nothing
// else. Server-owned health/compliance/analytics fields get honest
// "never measured" defaults instead of plausible fiction:
//
//   field                 value
//   --------------------- ---------------------------------------------
//   id                    str_<base36 ms>_<rand6> (regenerated on collision)
//   name/address/city/area input as entered
//   lat/lng               parseFloat of the form coordinates
//   phone                 normalized/validated input (no placeholder numbers)
//   petpoojaRestId        trimmed input, or null (no invented rest_ mapping)
//   imageUrl              null
//   hours                 { open: "10:00", close: "23:00" } (opening default)
//   isOpen/isBusy         false / false
//   isRecentlyOpened      true (it was literally just registered)
//   supports              { delivery, takeaway, dineIn } = true
//   etaMinutes/pickupEtaMinutes/deliveryFee
//                         30 / 15 / 29 (delivery params)
//   deliveryRadiusKm/MinOrder/MaxDistance
//                         5 / 150 / 7 (delivery params)
//   richHours             default 10:00–23:00 week
//   email                 null → "No contact email on file"
//   managerName/managerPhone null (nobody hired yet)
//   webhookUrl            null → "Not configured"
//   webhookStatus         "unknown" → "Not connected"
//   circuitBreaker        null → "NOT CONNECTED"
//   lastSyncTime          null → "Never"
//   menuVersion           null → "—"
//   webhookFailures/retryCount 0 (no traffic has occurred)
//   queue counters        0, queueWorkerStatus "unknown" → "NOT CONNECTED"
//   todayRevenue/todayOrders/avgOrderValue/customerCount 0 (no orders yet)
//   weekly/monthly trend  [0 x 7] / [0 x 30]
//   popularItem/peakHour/repeatCustomerPercentage
//                         key ABSENT — unmeasured analytics are omitted, not 0
//   autoAccept/kitchenDisplay/onlinePayment/cashOnDelivery true (settings)
//   staff                 [] → "No staff assigned yet…"
//   documents             [] → "No compliance documents uploaded…"
//   media                 { heroBanner: null, logo: null, gallery: [] }
export interface NewStoreInput {
  name: string;
  city: string;
  area: string;
  address: string;
  /** Normalized by normalizeIndianMobile before the call. */
  phone: string;
  petpoojaRestId?: string | null;
  lat?: string | number;
  lng?: string | number;
}

const parseCoord = (value: string | number | undefined): number => {
  if (typeof value === "number") return value;
  return parseFloat(value ?? "");
};

export function buildNewStore(
  input: NewStoreInput,
  existingStores: readonly RichStore[],
): RichStore {
  const taken = new Set(existingStores.map((s) => s.id));
  let id = generateStoreId();
  while (taken.has(id)) id = generateStoreId();

  return {
    id,
    name: input.name,
    address: input.address,
    city: input.city,
    area: input.area,
    lat: parseCoord(input.lat),
    lng: parseCoord(input.lng),
    phone: input.phone,
    imageUrl: null,
    hours: { open: "10:00", close: "23:00" },
    isOpen: false,
    isBusy: false,
    isRecentlyOpened: true,
    supports: { delivery: true, takeaway: true, dineIn: true },
    etaMinutes: 30,
    pickupEtaMinutes: 15,
    deliveryFee: 29,
    petpoojaRestId: input.petpoojaRestId?.trim() || null,
    richHours: {
      monday: { open: "10:00", close: "23:00" },
      tuesday: { open: "10:00", close: "23:00" },
      wednesday: { open: "10:00", close: "23:00" },
      thursday: { open: "10:00", close: "23:00" },
      friday: { open: "10:00", close: "23:59" },
      saturday: { open: "10:00", close: "23:59" },
      sunday: { open: "10:00", close: "23:59" },
    },
    email: null,
    managerName: null,
    managerPhone: null,
    webhookUrl: null,
    webhookStatus: "unknown",
    circuitBreaker: null,
    lastSyncTime: null,
    menuVersion: null,
    webhookFailures: 0,
    retryCount: 0,
    queueOrdersWaiting: 0,
    queueOrdersActive: 0,
    queueFailedJobs: 0,
    queueDeadLetters: 0,
    queueWorkerStatus: "unknown",
    todayRevenue: 0,
    todayOrders: 0,
    avgOrderValue: 0,
    customerCount: 0,
    weeklyRevenueTrend: [0, 0, 0, 0, 0, 0, 0],
    monthlyRevenueTrend: Array.from({ length: 30 }).map(() => 0),
    autoAcceptOrders: true,
    kitchenDisplayEnabled: true,
    onlinePaymentEnabled: true,
    cashOnDeliveryEnabled: true,
    staff: [],
    documents: [],
    deliveryRadiusKm: 5,
    deliveryMinOrder: 150,
    deliveryMaxDistance: 7,
    media: { heroBanner: null, logo: null, gallery: [] },
  };
}

// ---------------------------------------------------------------------------
// P0-3 honest render helpers — every health/compliance render site in this
// page routes through these so an unmeasured value can never be dressed up
// as a live reading. The tests assert on these exact strings.
// ---------------------------------------------------------------------------

/** HealthBadge status for the Petpooja link: "not connected" for unknown. */
export function petpoojaHealthStatus(
  status: RichStore["webhookStatus"],
): "healthy" | "degraded" | "not connected" {
  if (status === "active") return "healthy";
  if (status === "unknown") return "not connected";
  return "degraded";
}

export function displayMenuVersion(menuVersion: RichStore["menuVersion"]): string {
  return menuVersion || "—";
}

export function displayCircuitBreaker(
  circuitBreaker: RichStore["circuitBreaker"],
): string {
  return circuitBreaker ? circuitBreaker.toUpperCase() : "NOT CONNECTED";
}

export function displayLastSyncTime(lastSyncTime: RichStore["lastSyncTime"]): string {
  if (!lastSyncTime) return "Never";
  const at = new Date(lastSyncTime);
  return Number.isNaN(at.getTime()) ? "Never" : at.toLocaleTimeString();
}

export function displayWebhookUrl(webhookUrl: RichStore["webhookUrl"]): string {
  return webhookUrl || "Not configured";
}

export function displayEmail(email: RichStore["email"]): string {
  return email || "No contact email on file";
}

export function displayQueueWorkerStatus(
  status: RichStore["queueWorkerStatus"],
): string {
  return status === "unknown" ? "NOT CONNECTED" : status;
}

// P0-3: honest empty-state copy for zero-length relations — exported so the
// render sites and the honesty tests read the exact same strings.
export const STAFF_EMPTY_STATE =
  "No staff assigned yet — use Assign Staff to add your team.";
export const DOCUMENTS_EMPTY_STATE =
  "No compliance documents uploaded for this outlet yet.";

// #28: no CDN provider is wired to this console, so the cache-purge control is
// rendered disabled with this explicit reason — never a fake success toast.
export const CDN_PURGE_UNAVAILABLE_REASON =
  "No CDN provider is wired to this console — cache purge is unavailable.";

// Finding 12: store-directory RBAC derives from the real session roles
// (brand_owner / developer / regional_manager), not the retired portal role
// names, which matched no live session. Fail-closed: an empty role name
// (logged out / unreachable session) grants neither directory management nor
// sync, whatever the derived flags say.
export function storeDirectoryAccess(
  roleName: string,
  isDeveloper: boolean,
  permissions: string[],
): { isReadOnly: boolean; canRunSync: boolean } {
  const hasRole = roleName !== "";
  const canManageStores = hasRole && isDeveloper;
  const canRunSync =
    hasRole && (isDeveloper || permissions.includes("admin.petpooja.sync"));
  return { isReadOnly: !canManageStores, canRunSync };
}

export const AdminStoresPage: React.FC<{ defaultStoreId?: string; isCreate?: boolean }> = ({
  defaultStoreId,
  isCreate: initialIsCreate,
}) => {
  // Persistence state
  const [stores, setStores] = useState<RichStore[]>([]);
  const [isLoadingStores, setIsLoadingStores] = useState(true);

  // Revision 1 (#29 blocker 2): the last directory state the service actually
  // CONFIRMED. The UI paints optimistically ahead of this, but rollback always
  // restores THIS snapshot — never the current render, which may itself hold an
  // unconfirmed optimistic write. Advanced only on a successful persist, so a
  // failure after a success rolls back to that success, not to load-time state.
  const confirmedStoresRef = useRef<RichStore[]>([]);
  // Synchronous in-flight guard, checked BEFORE any optimistic paint: two
  // callers can never interleave optimistic writes and rollbacks.
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    async function loadStores() {
      setIsLoadingStores(true);
      const res = await adminStoresService.listStores();
      const loaded = res.success && res.data.length > 0 ? res.data : [];
      setStores(loaded);
      // Seed the confirmed snapshot with what actually loaded.
      confirmedStoresRef.current = loaded;
      setIsLoadingStores(false);
    }
    void loadStores();
  }, []);

  const saveStores = async (updated: RichStore[]): Promise<boolean> => {
    // Reject overlapping submissions synchronously — before the optimistic
    // paint — so a second caller cannot capture this unconfirmed state. Returns
    // false and never claims success.
    if (saveInFlightRef.current) {
      toast.info("A store directory save is already in progress — try again.");
      return false;
    }
    saveInFlightRef.current = true;
    // Optimistic paint, but never a lie: on failure we restore the last
    // CONFIRMED snapshot (not the current render). NOTE: the service's
    // multi-document bulkUpsert is NOT atomic, so a partial backend write is
    // possible — this rollback is local UI truth-recovery only and does not
    // undo anything the backend already committed.
    setStores(updated);
    try {
      // In a real app we'd update specific stores, but for this prototype we'll bulk update
      // or we can just update the ones that changed. Let's do bulk for now since it mirrors the localstorage behavior
      // Loop 6/120: return the real persist outcome so money/honesty-critical
      // callers can report truthfully; fire-and-forget callers ignore it.
      const res = await adminStoresService.bulkUpsert(updated);
      if (!res.success) {
        // Restore the confirmed snapshot, not the optimistic render.
        setStores(confirmedStoresRef.current);
        toast.error("Store directory save failed.", { description: res.error.message });
        return false;
      }
      // Advance the confirmed snapshot only on real success.
      confirmedStoresRef.current = updated;
      return true;
    } finally {
      // Release the guard on every exit path.
      saveInFlightRef.current = false;
    }
  };

  // Single sign-in: role comes from the unified partner session.
  const { admin, role: selectedRole, isDeveloper, permissions } = useAdmin();

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedSync, setSelectedSync] = useState("All");
  const [viewTab, setViewTab] = useState<ViewTab>("grid");

  // Selected store detail route tracking
  const [activeStoreId, setActiveStoreId] = useState<string | null>(defaultStoreId || null);
  const [isCreating, setIsCreating] = useState(!!initialIsCreate);

  // Edit store settings form state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingPetpoojaId, setEditingPetpoojaId] = useState<string>("");

  // Active sync states
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncingStoreId, setSyncingStoreId] = useState<string | null>(null);

  // Modals / Overlays
  const [confirmToggleStore, setConfirmToggleStore] = useState<RichStore | null>(null);
  // Pending state for the page-local confirm flow (Revision 1 / #29 blocker 1):
  // keeps the dialog visible and blocks repeat submission until the write
  // resolves. The shared ConfirmDialog could not do this (it fires onClose()
  // without awaiting onConfirm()), so this one flow uses its own dialog.
  const [isTogglingStore, setIsTogglingStore] = useState(false);
  const [viewDoc, setViewDoc] = useState<StoreDocument | null>(null);
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);

  // New Store Form State
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreCity, setNewStoreCity] = useState("Ahmedabad");
  const [newStoreArea, setNewStoreArea] = useState("");
  const [newStoreAddress, setNewStoreAddress] = useState("");
  const [newStorePhone, setNewStorePhone] = useState("");
  const [newStorePetpoojaId, setNewStorePetpoojaId] = useState("");
  const [newStoreLat, setNewStoreLat] = useState("23.034362");
  const [newStoreLng, setNewStoreLng] = useState("72.5548094");

  // New Staff Form State
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<StaffMember["role"]>("Chef");
  const [newStaffPhone, setNewStaffPhone] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");

  // Sync route param with state
  useEffect(() => {
    if (defaultStoreId) setActiveStoreId(defaultStoreId);
  }, [defaultStoreId]);

  // Sync editing ID with active store
  useEffect(() => {
    if (activeStoreId) {
      const store = stores.find((s) => s.id === activeStoreId);
      if (store) setEditingPetpoojaId(store.petpoojaRestId || "");
    }
  }, [activeStoreId, stores]);

  // Handle RBAC View Filtering — derived from the real session role; an
  // empty/unrecognized role fails closed (read-only, no sync).
  const { isReadOnly, canRunSync } = storeDirectoryAccess(
    selectedRole,
    isDeveloper,
    permissions,
  );
  // branch_owner is denied /admin by the layout; if it ever reaches this
  // page, a missing store assignment shows ZERO stores — never a foreign
  // default store id.
  const scopedStoreId =
    !isDeveloper && selectedRole === "branch_owner"
      ? (admin?.assignedStoreId ?? null)
      : null;

  // Visible stores matching filters and RBAC constraints
  const filteredStores = useMemo(() => {
    return stores.filter((store) => {
      // 1. RBAC Check: branch_owner can only see its assigned store
      // (fail-closed on a missing assignment).
      if (
        selectedRole === "branch_owner" &&
        (scopedStoreId === null || store.id !== scopedStoreId)
      ) {
        return false;
      }

      // 2. City Filter
      if (selectedCity !== "All" && store.city !== selectedCity) {
        return false;
      }

      // 3. Status Filter
      if (selectedStatus !== "All") {
        if (selectedStatus === "Open" && !store.isOpen) return false;
        if (selectedStatus === "Closed" && store.isOpen) return false;
        if (selectedStatus === "Busy" && !store.isBusy) return false;
      }

      // 4. Sync Filter — unknown/unlinked stores are their own bucket; they
      // are neither healthy nor a measured connection fault (P0-3).
      if (selectedSync !== "All") {
        if (selectedSync === "Healthy" && store.webhookStatus !== "active") return false;
        if (
          selectedSync === "Degraded" &&
          (store.webhookStatus === "active" || store.webhookStatus === "unknown")
        )
          return false;
        if (selectedSync === "NotConnected" && store.webhookStatus !== "unknown")
          return false;
      }

      // 5. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          store.name.toLowerCase().includes(q) ||
          store.area.toLowerCase().includes(q) ||
          store.address.toLowerCase().includes(q) ||
          (store.petpoojaRestId && store.petpoojaRestId.toLowerCase().includes(q)) ||
          (store.managerName && store.managerName.toLowerCase().includes(q)) ||
          (store.email && store.email.toLowerCase().includes(q)) ||
          store.id.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [
    stores,
    scopedStoreId,
    selectedRole,
    selectedCity,
    selectedStatus,
    selectedSync,
    searchQuery,
  ]);

  const activeStore = useMemo(() => {
    if (!activeStoreId) return null;
    return stores.find((s) => s.id === activeStoreId) || null;
  }, [stores, activeStoreId]);

  // Unique cities list
  const cities = useMemo(() => {
    return ["All", ...Array.from(new Set(stores.map((s) => s.city)))];
  }, [stores]);

  // Global KPIs based on filtered set
  const stats = useMemo(() => {
    const visible = filteredStores;
    const total = visible.length;
    const open = visible.filter((s) => s.isOpen).length;
    const busy = visible.filter((s) => s.isBusy).length;
    const rev = visible.reduce((sum, s) => sum + (s.todayRevenue ?? 0), 0);
    const ords = visible.reduce((sum, s) => sum + (s.todayOrders ?? 0), 0);
    const healthySyncs = visible.filter((s) => s.webhookStatus === "active").length;

    return { total, open, busy, rev, ords, healthySyncs };
  }, [filteredStores]);

  // Copy helpers
  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  // Multi-action store operation handlers
  const handleToggleStoreActiveState = (storeId: string) => {
    if (isReadOnly) {
      toast.error(
        "Access denied — store directory management is limited to brand owners and developers.",
      );
      return;
    }
    const target = stores.find((s) => s.id === storeId);
    if (target) {
      setConfirmToggleStore(target);
    }
  };

  // #29: the open/close flip awaited nothing — a failed persist still toasted
  // success. Revision 1 (blocker 1): this handler is only ever invoked by the
  // page-local dialog below, which does NOT close itself on submit. The dialog
  // stays open while pending and on failure (retry surface); success is claimed
  // only when the directory actually saved.
  const handleConfirmToggleStoreState = async () => {
    if (!confirmToggleStore) return;
    // Block repeat submissions while a write is pending (the dialog also
    // disables its buttons, this guards races).
    if (isTogglingStore) return;
    const { id, name, isOpen } = confirmToggleStore;
    const updated = stores.map((s) => {
      if (s.id === id) {
        const nextOpen = !s.isOpen;
        // P0-3: flipping open/closed used to also stamp webhookStatus
        // active/failed, a circuit-breaker state and a fresh lastSyncTime —
        // all fabricated, none of them measured by this action. Only the
        // operator-controlled flags change here.
        return {
          ...s,
          isOpen: nextOpen,
          isBusy: nextOpen ? s.isBusy : false,
        };
      }
      return s;
    });
    setIsTogglingStore(true);
    try {
      // Close ONLY on a confirmed persist; on failure the dialog stays open
      // with the saveStores error for retry.
      if (!(await saveStores(updated))) return;
      toast.success(`Store "${name}" is now ${!isOpen ? "OPEN" : "CLOSED"}`);
      setConfirmToggleStore(null);
    } finally {
      // Always release, every exit path.
      setIsTogglingStore(false);
    }
  };

  const handleToggleBusyState = async (storeId: string) => {
    if (isReadOnly) {
      toast.error(
        "Access denied — store directory management is limited to brand owners and developers.",
      );
      return;
    }
    const target = stores.find((s) => s.id === storeId);
    if (!target) return;
    if (!target.isOpen) {
      toast.warning("Cannot toggle busy state on a closed store.");
      return;
    }
    const updated = stores.map((s) =>
      s.id === storeId ? { ...s, isBusy: !s.isBusy } : s,
    );
    // #29: await the persist before claiming the status changed.
    if (!(await saveStores(updated))) return;
    const next = updated.find((s) => s.id === storeId);
    toast.success(
      `Store status updated: ${next?.isBusy ? "BUSY (Queue Overloaded)" : "NORMAL"}`,
    );
  };

  // Run synchronization for single store — Loop 57/120: this was a 1200ms
  // timer that fabricated menuVersion via Math.random, forced webhookStatus
  // active, and toasted success with ZERO server contact. It now calls the
  // real POST /petpooja/syncMenu; the server is fail-closed on unlinked
  // branches, so failures toast loud and flip no state.
  const handleSyncStore = async (storeId: string) => {
    if (!canRunSync) {
      toast.error("Access denied — Petpooja sync is not permitted for your role.");
      return;
    }
    const target = stores.find((s) => s.id === storeId);
    setSyncingStoreId(storeId);
    toast.loading("Syncing menu from Petpooja...");
    try {
      const result = await partnerFunctionsApi.syncPetpoojaMenu(storeId);
      const updated = markStoresSynced(
        stores,
        new Set([storeId]),
        new Date().toISOString(),
      );
      const ok = await saveStores(updated);
      toast.dismiss();
      if (ok) {
        toast.success(
          `Petpooja menu synced for ${target?.name ?? storeId}: ${result.itemCount} items, ${result.categoriesCount} categories.`,
        );
      } else {
        // Review nit: the menu API call succeeded but the directory metadata
        // did not persist — report the partial outcome, not an unqualified win.
        toast.warning(
          `Petpooja menu synced for ${target?.name ?? storeId} (${result.itemCount} items), but the local directory metadata could not be saved.`,
        );
      }
    } catch (err: unknown) {
      toast.dismiss();
      toast.error(
        `Petpooja sync failed for ${target?.name ?? storeId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setSyncingStoreId(null);
    }
  };

  // Global sync — Loop 57/120: this was an 1800ms timer stamping every open
  // store active with zero server contact. It now syncs each open store via
  // POST /petpooja/syncMenu and reports an honest summary; failed stores
  // keep their existing state.
  const handleSyncAllStores = async () => {
    if (!canRunSync) {
      toast.error("Access denied — Petpooja sync is not permitted for your role.");
      return;
    }
    const targets = stores.filter((s) => s.isOpen);
    setIsSyncingAll(true);
    toast.loading(`Syncing menus from Petpooja for ${targets.length} stores...`);
    const syncedIds = new Set<string>();
    const failed: string[] = [];
    for (const store of targets) {
      try {
        await partnerFunctionsApi.syncPetpoojaMenu(store.id);
        syncedIds.add(store.id);
      } catch (err: unknown) {
        failed.push(
          `${store.name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    let metadataSaved = true;
    if (syncedIds.size > 0) {
      // saveStores returns false on failure/rejection. The remote menu syncs
      // above may still have succeeded, so the summary below distinguishes a
      // confirmed remote sync from a failed local metadata persistence.
      metadataSaved = await saveStores(
        markStoresSynced(stores, syncedIds, new Date().toISOString()),
      );
    }
    setIsSyncingAll(false);
    toast.dismiss();
    if (failed.length === 0 && metadataSaved) {
      toast.success(`Petpooja menus synced for ${syncedIds.size} stores.`);
    } else if (failed.length === 0) {
      toast.warning(
        `Petpooja menus synced for ${syncedIds.size} stores, but the local directory metadata could not be saved.`,
      );
    } else {
      console.error("Petpooja batch sync failures:", failed);
      toast.error(
        `${syncedIds.size} synced, ${failed.length} failed — ${failed[0]}${
          failed.length > 1 ? ` (+${failed.length - 1} more, see console)` : ""
        }${metadataSaved ? "" : " (directory metadata not saved)"}`,
      );
    }
  };

  // Edit / Save Store Settings Form
  // Loop 6/120 honest persist: the toggles only touch local state — flush to
  // Firestore here and report the real outcome instead of a blind success.
  const handleUpdateStoreSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      toast.error(
        "Access denied — store directory management is limited to brand owners and developers.",
      );
      return;
    }
    // saveStores toasts loud on failure and returns false — only claim
    // success when the directory actually persisted.
    if (!(await saveStores(stores))) return;
    setIsEditMode(false);
    toast.success("Store configurations updated successfully!");
  };

  // Create Store
  // Loop 6/120: no fabricated contact data — a store ships with the real
  // verified phone or it is not created.
  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreName || !newStoreArea || !newStoreAddress) {
      toast.error("Please fill in all required fields.");
      return;
    }
    const validPhone = normalizeIndianMobile(newStorePhone);
    if (!validPhone) {
      toast.error("Enter a valid 10-digit store phone — no placeholder numbers.");
      return;
    }

    // P0-3: build the record from the operator's inputs only. Everything the
    // server owns (webhook link, sync time, menu version, staff, documents,
    // media, analytics) starts as null/"unknown"/empty and renders honestly —
    // see buildNewStore's field table. (No Petpooja mapping call happens here
    // — the old toast claimed one.)
    const newStore = buildNewStore(
      {
        name: newStoreName,
        city: newStoreCity,
        area: newStoreArea,
        address: newStoreAddress,
        phone: validPhone,
        petpoojaRestId: newStorePetpoojaId,
        lat: newStoreLat,
        lng: newStoreLng,
      },
      stores,
    );

    const updated = [newStore, ...stores];
    // Loop 6/120 honest persist: surface the real save outcome.
    if (!(await saveStores(updated))) return;
    setIsCreating(false);
    setActiveStoreId(newStore.id);
    toast.success(`Store "${newStoreName}" saved to the store directory.`);

    // Reset Form
    setNewStoreName("");
    setNewStoreArea("");
    setNewStoreAddress("");
    setNewStorePhone("");
    setNewStorePetpoojaId("");
  };

  // Staff management
  const handleAddStaffMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName || !newStaffPhone) {
      toast.error("Please fill in name and phone.");
      return;
    }
    if (!activeStore) return;

    const newStaff: StaffMember = {
      id: `STF-${activeStore.id}-${Date.now().toString().slice(-4)}`,
      name: newStaffName,
      role: newStaffRole,
      phone: newStaffPhone,
      // P0-3: never invent an email address — blank stays blank.
      email: newStaffEmail.trim(),
      // Online status is observed, not assumed: a freshly assigned member
      // has not been seen online.
      isOnline: false,
    };

    const updated = stores.map((s) => {
      if (s.id === activeStore.id) {
        return {
          ...s,
          staff: [...s.staff, newStaff],
        };
      }
      return s;
    });

    // #29: only claim the assignment once the roster actually persisted
    // (saveStores rolls back and errors on failure; the modal stays open).
    if (!(await saveStores(updated))) return;
    setShowAddStaffModal(false);
    setNewStaffName("");
    setNewStaffPhone("");
    setNewStaffEmail("");
    toast.success(`Staff member "${newStaffName}" assigned to kitchen roster.`);
  };

  const handleRemoveStaffMember = async (staffId: string) => {
    if (!activeStore) return;
    const updated = stores.map((s) => {
      if (s.id === activeStore.id) {
        return {
          ...s,
          staff: s.staff.filter((m) => m.id !== staffId),
        };
      }
      return s;
    });
    // #29: only claim the removal once the roster actually persisted.
    if (!(await saveStores(updated))) return;
    toast.success("Staff member unassigned from store roster.");
  };

  // Honest CSV export: builds a real CSV from the filtered directory and
  // downloads it immediately. No fake formats, no fabricated delay, no JSON
  // blob mislabeled as csv/xlsx/pdf.
  const handleExportDirectory = () => {
    if (filteredStores.length === 0) {
      toast.info("No stores match the current filters — nothing to export.");
      return;
    }
    const escapeCsv = (value: unknown): string => {
      const s = value == null ? "" : String(value);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = [
      "id",
      "name",
      "city",
      "area",
      "address",
      "phone",
      "isOpen",
      "isBusy",
      "petpoojaRestId",
      "webhookStatus",
      "menuVersion",
      "todayRevenue",
      "todayOrders",
    ];
    const rows = filteredStores.map((s) =>
      [
        s.id,
        s.name,
        s.city,
        s.area,
        s.address,
        s.phone ?? "",
        s.isOpen,
        s.isBusy,
        s.petpoojaRestId ?? "",
        s.webhookStatus,
        s.menuVersion,
        s.todayRevenue,
        s.todayOrders,
      ]
        .map(escapeCsv)
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "burgonomics-stores-export.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredStores.length} stores to CSV.`);
  };

  // Spatial Radar Positioning Centering on current filter average
  const avgLat = useMemo(() => {
    const list = filteredStores;
    return list.length > 0 ? list.reduce((sum, s) => sum + s.lat, 0) / list.length : 23.034362;
  }, [filteredStores]);

  const avgLng = useMemo(() => {
    const list = filteredStores;
    return list.length > 0 ? list.reduce((sum, s) => sum + s.lng, 0) / list.length : 72.5548094;
  }, [filteredStores]);

  const getRadarCoordinates = (storeLat: number, storeLng: number) => {
    const dLat = storeLat - avgLat;
    const dLng = storeLng - avgLng;

    // Boundary normalization
    const maxDiff = Math.max(
      ...filteredStores.map((s) => Math.abs(s.lat - avgLat)),
      ...filteredStores.map((s) => Math.abs(s.lng - avgLng)),
      0.015,
    );

    const scale = 150 / maxDiff;
    const x = 200 + dLng * scale;
    const y = 200 - dLat * scale;

    return { x, y };
  };

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Burgonomics Enterprise Outlets"
        description="Operational command, Petpooja rest mapping parameters, live operating shifts, API link status tracking, and performance queue logs."
        breadcrumbs={[{ label: "Stores", to: "/admin/stores" }]}
      />

      <AnimatePresence mode="wait">
        {!activeStoreId && !isCreating ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {isLoadingStores ? (
              <div className="flex h-64 items-center justify-center">
                <RotateCw className="animate-spin text-orange-500" size={32} />
              </div>
            ) : (
              <>
                {/* KPI STATS ROW */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard
                    title="Active Directory Locations"
                    value={`${stats.open} / ${stats.total}`}
                    icon={StoreIcon}
                    subtext={`${stats.busy} busy outlets currently`}
                  />
                  <StatCard
                    title="Consolidated Revenue (Today)"
                    value={`₹${stats.rev.toLocaleString()}`}
                    icon={TrendingUp}
                    subtext="Aggregated from outlet records"
                  />
                  <StatCard
                    title="Petpooja API Link Health"
                    value={`${Math.floor((stats.healthySyncs / (stats.total || 1)) * 100)}%`}
                    icon={Activity}
                    subtext={`${stats.healthySyncs} healthy webhook links`}
                  />
                  <StatCard
                    title="Pending Order Queues"
                    value={stats.ords.toString()}
                    icon={Users}
                    subtext="Total delivery & dine-in orders"
                  />
                </div>

                {/* VIEWS, FILTERS & MAIN LIST BAR */}
                <div className="flex flex-col gap-4 rounded-[20px] bg-white p-5 shadow-sm border border-gray-100 dark:bg-[#1C1C1E] dark:border-gray-800">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Search Bar */}
                    <div className="relative flex-1">
                      <Search
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                        size={18}
                      />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by name, area, city, petpoojaRestId..."
                        className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm font-semibold outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800 focus:ring-1 focus:ring-[#0E4825]"
                      />
                    </div>

                    {/* View Toggles */}
                    <div className="flex items-center gap-2 self-end md:self-auto">
                      <div className="flex rounded-xl bg-gray-50 p-1 border border-gray-100 dark:bg-gray-900 dark:border-gray-800">
                        {(["list", "grid", "radar"] as ViewTab[]).map((tab) => (
                          <button
                            key={tab}
                            onClick={() => setViewTab(tab)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-black capitalize transition-all ${
                              viewTab === tab
                                ? "bg-white text-primary shadow-sm dark:bg-[#1A1A1A] dark:text-emerald-400"
                                : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                            }`}
                          >
                            {tab === "radar" ? "Logistics Radar" : `${tab} View`}
                          </button>
                        ))}
                      </div>

                      {/* Actions */}
                      {!isReadOnly && (
                        <button
                          onClick={() => setIsCreating(true)}
                          className="flex items-center gap-1.5 rounded-xl bg-primary hover:bg-[#082E17] text-white px-4 py-2.5 text-xs font-black shadow-md transition-all shrink-0"
                        >
                          <Plus size={16} />
                          <span>REGISTER STORE</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Advanced Filter Pills */}
                  <div className="flex flex-wrap items-center gap-3 border-t border-gray-50 pt-4 dark:border-gray-800">
                    {/* City select */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black uppercase text-gray-400">City:</span>
                      <select
                        value={selectedCity}
                        onChange={(e) => setSelectedCity(e.target.value)}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-bold dark:border-gray-700 dark:bg-gray-800 outline-none"
                      >
                        {cities.map((city) => (
                          <option key={city} value={city}>
                            {city}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Status Filter */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black uppercase text-gray-400">
                        POS State:
                      </span>
                      <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-bold dark:border-gray-700 dark:bg-gray-800 outline-none"
                      >
                        <option value="All">All States</option>
                        <option value="Open">Active / Open</option>
                        <option value="Closed">Closed</option>
                        <option value="Busy">Busy / Overloaded</option>
                      </select>
                    </div>

                    {/* Sync Status Filter */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black uppercase text-gray-400">
                        Petpooja Sync:
                      </span>
                      <select
                        value={selectedSync}
                        onChange={(e) => setSelectedSync(e.target.value)}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-bold dark:border-gray-700 dark:bg-gray-800 outline-none"
                      >
                        <option value="All">All Sync Status</option>
                        <option value="Healthy">Healthy (Linked)</option>
                        <option value="Degraded">Connection Fault</option>
                        <option value="NotConnected">Not connected</option>
                      </select>
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={handleSyncAllStores}
                        disabled={isSyncingAll}
                        className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                      >
                        <RotateCw size={12} className={isSyncingAll ? "animate-spin" : ""} />
                        <span>POS Batch Sync</span>
                      </button>
                      <div className="h-4 w-[1px] bg-gray-200 dark:bg-gray-800" />
                      <button
                        onClick={handleExportDirectory}
                        className="rounded-lg bg-gray-50 p-1 text-gray-400 hover:text-primary dark:bg-gray-900"
                        title="Export CSV"
                      >
                        <Download size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* NO RESULTS VIEW */}
                {filteredStores.length === 0 && (
                  <div className="flex flex-col items-center justify-center rounded-[20px] bg-white py-16 px-4 text-center border border-dashed border-gray-200 dark:bg-[#1C1C1E] dark:border-gray-800">
                    <StoreIcon
                      size={48}
                      className="text-gray-300 dark:text-gray-700 animate-pulse"
                    />
                    <h3 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">
                      No Burgonomics Outlets Found
                    </h3>
                    <p className="mt-1 max-w-md text-sm text-gray-500 font-semibold">
                      No stores match the active search criteria or your RBAC permission assignment
                      boundaries. Try clearing your filters.
                    </p>
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setSelectedCity("All");
                        setSelectedStatus("All");
                        setSelectedSync("All");
                      }}
                      className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-black shadow-sm hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                    >
                      Reset Active Filters
                    </button>
                  </div>
                )}

                {/* TAB RENDERS */}
                {filteredStores.length > 0 && (
                  <div className="transition-all duration-300">
                    {/* 1. GRID BOARD VIEW */}
                    {viewTab === "grid" && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredStores.map((store) => (
                          <div
                            key={store.id}
                            className="group relative flex flex-col justify-between overflow-hidden rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md dark:border-gray-800/50 dark:bg-[#1C1C1E]"
                          >
                            {/* Card Header */}
                            <div>
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <span className="font-mono text-[10px] font-black tracking-widest text-accent dark:text-accent-light">
                                    {store.id}
                                  </span>
                                  <h3
                                    onClick={() => setActiveStoreId(store.id)}
                                    className="cursor-pointer text-base font-black tracking-tight text-gray-900 hover:text-primary dark:text-white dark:hover:text-emerald-400"
                                  >
                                    {store.name}
                                  </h3>
                                  <p className="mt-1 text-xs font-bold text-gray-400">
                                    {store.city}, {store.area}
                                  </p>
                                </div>

                                {/* Status toggles */}
                                <div className="flex flex-col items-end gap-2">
                                  <span
                                    onClick={() => handleToggleStoreActiveState(store.id)}
                                    className={`cursor-pointer inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black border ${
                                      store.isOpen
                                        ? "bg-emerald-50 text-[#16A34A] border-emerald-200/50"
                                        : "bg-red-50 text-[#DC2626] border-red-200/50"
                                    }`}
                                  >
                                    <span className="h-1 w-1 rounded-full bg-current" />
                                    <span>{store.isOpen ? "OPEN" : "CLOSED"}</span>
                                  </span>

                                  {store.isOpen && (
                                    <span
                                      onClick={() => handleToggleBusyState(store.id)}
                                      className={`cursor-pointer inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black border ${
                                        store.isBusy
                                          ? "bg-amber-50 text-amber-600 border-amber-200"
                                          : "bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-800"
                                      }`}
                                    >
                                      <span>
                                        {store.isBusy ? "BUSY (Queue Limit)" : "NORMAL QUEUE"}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="my-4 border-t border-gray-50 dark:border-gray-800" />

                              {/* Quick Metrics */}
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <span className="block text-[10px] font-black uppercase text-gray-400">
                                    Revenue (Today)
                                  </span>
                                  <span className="font-mono text-base font-black text-gray-900 dark:text-white">
                                    ₹{(store.todayRevenue ?? 0).toLocaleString()}
                                  </span>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-black uppercase text-gray-400">
                                    Total POS Orders
                                  </span>
                                  <span className="font-mono text-base font-black text-gray-900 dark:text-white">
                                    {store.todayOrders} orders
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Card Footer controls */}
                            <div className="mt-5 border-t border-gray-50 pt-4 dark:border-gray-800">
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1 text-gray-500">
                                  <HealthBadge
                                    system="petpooja"
                                    status={petpoojaHealthStatus(store.webhookStatus)}
                                  />
                                  <span className="font-mono text-[10px] font-bold text-gray-400">
                                    {displayMenuVersion(store.menuVersion)}
                                  </span>
                                </div>

                                <button
                                  onClick={() => setActiveStoreId(store.id)}
                                  className="flex items-center gap-1 font-black text-primary hover:text-[#082E17] dark:text-emerald-400"
                                >
                                  <span>ENTER CONSOLE</span>
                                  <ChevronRight size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 2. DIRECTORY LIST TABLE VIEW */}
                    {viewTab === "list" && (
                      <div className="overflow-x-auto rounded-[20px] bg-white shadow-sm border border-gray-100 dark:bg-[#1C1C1E] dark:border-gray-800">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-gray-50 bg-gray-50/50 text-[10px] font-black uppercase tracking-wider text-gray-500 dark:border-gray-800 dark:bg-gray-900/55">
                              <th className="py-4 px-6">Outlet ID</th>
                              <th className="py-4 px-6">Store Name & Address</th>
                              <th className="py-4 px-6">POS Revenue</th>
                              <th className="py-4 px-6">Fulfillment API Sync</th>
                              <th className="py-4 px-6">POS State</th>
                              <th className="py-4 px-6 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 text-sm font-semibold text-gray-700 dark:divide-gray-800 dark:text-gray-300">
                            {filteredStores.map((store) => (
                              <tr
                                key={store.id}
                                className="hover:bg-gray-50/50 dark:hover:bg-gray-900/30"
                              >
                                <td className="py-4 px-6 font-mono text-xs font-black text-gray-400">
                                  {store.id}
                                </td>
                                <td className="py-4 px-6">
                                  <div>
                                    <span
                                      onClick={() => setActiveStoreId(store.id)}
                                      className="cursor-pointer block text-sm font-black text-gray-900 hover:text-primary dark:text-white dark:hover:text-emerald-400"
                                    >
                                      {store.name}
                                    </span>
                                    <span className="block text-xs font-bold text-gray-400">
                                      {store.address.slice(0, 50)}...
                                    </span>
                                  </div>
                                </td>
                                <td className="py-4 px-6">
                                  <div className="font-mono">
                                    <span className="block font-black text-gray-900 dark:text-white">
                                      ₹{(store.todayRevenue ?? 0).toLocaleString()}
                                    </span>
                                    <span className="block text-[10px] text-gray-400 font-bold">
                                      {store.todayOrders} live orders
                                    </span>
                                  </div>
                                </td>
                                <td className="py-4 px-6">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className={`h-2 w-2 rounded-full ${
                                        store.webhookStatus === "active"
                                          ? "bg-emerald-500"
                                          : store.webhookStatus === "unknown"
                                            ? "bg-gray-300 dark:bg-gray-600"
                                            : "bg-red-500"
                                      }`}
                                    />
                                    <span className="font-mono text-xs font-bold">
                                      {store.petpoojaRestId || "No mapping"}
                                    </span>
                                    {store.webhookStatus === "unknown" && (
                                      <span className="text-[10px] font-black uppercase text-gray-400">
                                        Not connected
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-4 px-6">
                                  <span
                                    onClick={() => handleToggleStoreActiveState(store.id)}
                                    className={`cursor-pointer inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-black border ${
                                      store.isOpen
                                        ? "bg-emerald-50 text-[#16A34A] border-emerald-200/50"
                                        : "bg-red-50 text-[#DC2626] border-red-200/50"
                                    }`}
                                  >
                                    {store.isOpen ? "OPEN" : "CLOSED"}
                                  </span>
                                </td>
                                <td className="py-4 px-6 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => handleSyncStore(store.id)}
                                      disabled={syncingStoreId === store.id}
                                      className="rounded-lg p-1.5 text-gray-400 hover:text-primary"
                                      title="Sync Menu"
                                    >
                                      <RotateCw
                                        size={14}
                                        className={
                                          syncingStoreId === store.id ? "animate-spin" : ""
                                        }
                                      />
                                    </button>
                                    <button
                                      onClick={() => setActiveStoreId(store.id)}
                                      className="rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-black text-primary hover:bg-gray-100 dark:bg-gray-800 dark:text-emerald-400"
                                    >
                                      CONSOLE
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* 3. LOGISTICS RADAR VIEW (SVG Spatial Grid) */}
                    {viewTab === "radar" && (
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Radar Screen Card */}
                        <div className="lg:col-span-2 flex flex-col items-center justify-center rounded-[20px] bg-[#121214] p-6 text-white border border-gray-800 relative overflow-hidden">
                          {/* Grid background styling */}
                          <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-20" />

                          {/* Header indicators */}
                          <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                            <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-emerald-500/20">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                            </span>
                            <span className="font-mono text-[10px] font-black tracking-widest text-emerald-400 uppercase">
                              Burgonomics Spatial Radar (Live Tracking)
                            </span>
                          </div>

                          <div className="absolute top-4 right-4 z-10 text-right font-mono text-[9px] text-gray-500">
                            <span>
                              CENTER COORDS: {avgLat.toFixed(4)}N, {avgLng.toFixed(4)}E
                            </span>
                          </div>

                          {/* Radar SVG Circle */}
                          <div className="relative h-96 w-96 max-w-full my-6 flex items-center justify-center">
                            {/* Interactive SVG overlay */}
                            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 400">
                              {/* Concentric rings */}
                              <circle
                                cx="200"
                                cy="200"
                                r="160"
                                fill="none"
                                stroke="#0E4825"
                                strokeWidth="1"
                                strokeDasharray="4 6"
                                opacity="0.4"
                              />
                              <circle
                                cx="200"
                                cy="200"
                                r="110"
                                fill="none"
                                stroke="#0E4825"
                                strokeWidth="1"
                                strokeDasharray="3 4"
                                opacity="0.5"
                              />
                              <circle
                                cx="200"
                                cy="200"
                                r="60"
                                fill="none"
                                stroke="#0E4825"
                                strokeWidth="1"
                                opacity="0.6"
                              />

                              {/* Radar axes */}
                              <line
                                x1="200"
                                y1="40"
                                x2="200"
                                y2="360"
                                stroke="#0E4825"
                                strokeWidth="0.5"
                                opacity="0.4"
                              />
                              <line
                                x1="40"
                                y1="200"
                                x2="360"
                                y2="200"
                                stroke="#0E4825"
                                strokeWidth="0.5"
                                opacity="0.4"
                              />

                              {/* Concentric rings tags */}
                              <text
                                x="205"
                                y="55"
                                fill="#16A34A"
                                fontSize="8"
                                fontFamily="monospace"
                                opacity="0.6"
                              >
                                8KM RADAR
                              </text>
                              <text
                                x="205"
                                y="105"
                                fill="#16A34A"
                                fontSize="8"
                                fontFamily="monospace"
                                opacity="0.6"
                              >
                                5KM RADAR
                              </text>
                              <text
                                x="205"
                                y="155"
                                fill="#16A34A"
                                fontSize="8"
                                fontFamily="monospace"
                                opacity="0.6"
                              >
                                2KM RADAR
                              </text>

                              {/* Dynamic sweep line (CSS rotate) */}
                              <line
                                x1="200"
                                y1="200"
                                x2="341"
                                y2="59"
                                stroke="url(#radarSweepGradient)"
                                strokeWidth="2.5"
                                className="origin-[200px_200px] animate-[spin_5s_linear_infinite]"
                              />

                              {/* Gradients */}
                              <defs>
                                <linearGradient
                                  id="radarSweepGradient"
                                  x1="0%"
                                  y1="0%"
                                  x2="100%"
                                  y2="100%"
                                >
                                  <stop offset="0%" stopColor="#16A34A" stopOpacity="0" />
                                  <stop offset="100%" stopColor="#16A34A" stopOpacity="0.8" />
                                </linearGradient>
                              </defs>

                              {/* Plot Stores on Radar Map */}
                              {filteredStores.map((store) => {
                                const { x, y } = getRadarCoordinates(store.lat, store.lng);
                                const isStoreOpen = store.isOpen;
                                const isStoreBusy = store.isBusy;

                                return (
                                  <g
                                    key={store.id}
                                    className="cursor-pointer group"
                                    onClick={() => setActiveStoreId(store.id)}
                                  >
                                    {/* Pulsing rings for open stores */}
                                    {isStoreOpen && (
                                      <circle
                                        cx={x}
                                        cy={y}
                                        r={isStoreBusy ? "12" : "8"}
                                        fill="none"
                                        stroke={isStoreBusy ? "#F59E0B" : "#10B981"}
                                        strokeWidth="1"
                                        className="animate-ping origin-center"
                                        style={{ transformOrigin: `${x}px ${y}px` }}
                                        opacity="0.5"
                                      />
                                    )}

                                    {/* Main pin point */}
                                    <circle
                                      cx={x}
                                      cy={y}
                                      r="4.5"
                                      fill={
                                        !isStoreOpen
                                          ? "#EF4444"
                                          : isStoreBusy
                                            ? "#F59E0B"
                                            : "#10B981"
                                      }
                                    />

                                    {/* Text Label shown when visible/hovered */}
                                    <text
                                      x={x + 8}
                                      y={y + 3}
                                      fill="#E2E8F0"
                                      fontSize="8"
                                      fontFamily="sans-serif"
                                      fontWeight="bold"
                                      className="opacity-65 group-hover:opacity-100 transition-all font-mono"
                                    >
                                      {store.name.replace("Burgonomics ", "")}
                                    </text>
                                  </g>
                                );
                              })}
                            </svg>
                          </div>
                        </div>

                        {/* Sidebar: Selected Store on radar list */}
                        <div className="flex flex-col rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1C1C1E]">
                          <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider mb-4">
                            Plotting visible outlets ({filteredStores.length})
                          </h3>
                          <div className="flex-1 overflow-y-auto space-y-3 max-h-[360px] pr-2">
                            {filteredStores.map((store) => (
                              <div
                                key={store.id}
                                onClick={() => setActiveStoreId(store.id)}
                                className="cursor-pointer group flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/40 p-3 hover:border-primary/35 hover:bg-primary/5 dark:border-gray-800 dark:bg-gray-900/30 dark:hover:bg-emerald-950/10"
                              >
                                <div>
                                  <span className="block font-black text-sm text-gray-900 group-hover:text-primary dark:text-white dark:group-hover:text-emerald-400">
                                    {store.name}
                                  </span>
                                  <span className="block font-mono text-[9px] text-gray-400 font-bold">
                                    COORDS: {store.lat.toFixed(4)}, {store.lng.toFixed(4)}
                                  </span>
                                </div>
                                <span
                                  className={`h-2.5 w-2.5 rounded-full ${
                                    !store.isOpen
                                      ? "bg-red-500"
                                      : store.isBusy
                                        ? "bg-amber-500"
                                        : "bg-emerald-500"
                                  }`}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </motion.div>
        ) : isCreating ? (
          /* CREATE STORE COMPONENT */
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-[20px] bg-white p-6 shadow-sm border border-gray-100 dark:bg-[#1C1C1E] dark:border-gray-800 max-w-4xl mx-auto"
          >
            <div className="flex items-center justify-between border-b border-gray-50 pb-4 dark:border-gray-800">
              <h2 className="text-lg font-black text-gray-900 dark:text-white">
                REGISTER NEW BURGONOMICS OUTLET
              </h2>
              <button
                onClick={() => setIsCreating(false)}
                className="rounded-lg bg-gray-50 p-1.5 text-gray-500 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-400"
              >
                <XCircle size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateStore} className="mt-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase mb-1.5">
                    Outlet Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newStoreName}
                    onChange={(e) => setNewStoreName(e.target.value)}
                    placeholder="e.g. Burgonomics Satellite"
                    className="w-full rounded-xl border border-gray-200 py-2.5 px-4 text-sm font-semibold outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase mb-1.5">
                    Outlet City *
                  </label>
                  <select
                    value={newStoreCity}
                    onChange={(e) => setNewStoreCity(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 py-2.5 px-4 text-sm font-semibold outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800"
                  >
                    <option value="Ahmedabad">Ahmedabad</option>
                    <option value="Vadodara">Vadodara</option>
                    <option value="Surat">Surat</option>
                    <option value="Rajkot">Rajkot</option>
                    <option value="Lucknow">Lucknow</option>
                    <option value="Kota">Kota</option>
                    <option value="Ayodhya">Ayodhya</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase mb-1.5">
                    Outlet Area *
                  </label>
                  <input
                    type="text"
                    required
                    value={newStoreArea}
                    onChange={(e) => setNewStoreArea(e.target.value)}
                    placeholder="e.g. Satellite"
                    className="w-full rounded-xl border border-gray-200 py-2.5 px-4 text-sm font-semibold outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase mb-1.5">
                    Contact Phone Number
                  </label>
                  <input
                    type="text"
                    value={newStorePhone}
                    onChange={(e) => setNewStorePhone(e.target.value)}
                    placeholder="e.g. +91 78781 82109"
                    className="w-full rounded-xl border border-gray-200 py-2.5 px-4 text-sm font-semibold outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase mb-1.5">
                  Full Street Address *
                </label>
                <textarea
                  required
                  rows={2}
                  value={newStoreAddress}
                  onChange={(e) => setNewStoreAddress(e.target.value)}
                  placeholder="e.g. Shop GF-7 Saaman Complex, Near Mansi Circle, Satellite, Ahmedabad 380015"
                  className="w-full rounded-xl border border-gray-200 py-2.5 px-4 text-sm font-semibold outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase mb-1.5">
                    Petpooja Restaurant ID
                  </label>
                  <input
                    type="text"
                    value={newStorePetpoojaId}
                    onChange={(e) => setNewStorePetpoojaId(e.target.value)}
                    placeholder="e.g. rest_satellite_pos"
                    className="w-full rounded-xl border border-gray-200 py-2.5 px-4 text-sm font-semibold outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase mb-1.5">
                    Latitude Coordinate
                  </label>
                  <input
                    type="text"
                    value={newStoreLat}
                    onChange={(e) => setNewStoreLat(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 py-2.5 px-4 text-sm font-semibold font-mono outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase mb-1.5">
                    Longitude Coordinate
                  </label>
                  <input
                    type="text"
                    value={newStoreLng}
                    onChange={(e) => setNewStoreLng(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 py-2.5 px-4 text-sm font-semibold font-mono outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-50 pt-4 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-black text-gray-500 dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-primary px-5 py-2.5 text-xs font-black text-white hover:bg-[#082E17]"
                >
                  SAVE OUTLET REGISTRATION
                </button>
              </div>
            </form>
          </motion.div>
        ) : (
          /* DEEP DIVE STORE CONSOLE (SPLIT LAYOUT) */
          activeStore && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* Back controls navigation header bar */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <button
                  onClick={() => setActiveStoreId(null)}
                  className="flex items-center gap-1 text-xs font-black uppercase text-gray-500 hover:text-gray-900 dark:hover:text-white"
                >
                  <Compass size={16} />
                  <span>← Back to Outlets Directory</span>
                </button>

                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-gray-400">
                    CONSOLE LINKED TO:{" "}
                    <span className="font-black text-gray-900 dark:text-white">
                      {activeStore.id}
                    </span>
                  </span>
                  <div className="h-4 w-[1px] bg-gray-200 dark:bg-gray-800" />
                  <button
                    onClick={() => handleSyncStore(activeStore.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-black hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  >
                    <RotateCw
                      size={12}
                      className={syncingStoreId === activeStore.id ? "animate-spin" : ""}
                    />
                    <span>Sync POS Settings</span>
                  </button>
                </div>
              </div>

              {/* SPLIT LAYOUT COLUMNS */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* COLUMN LEFT (General info, schedule, documents, media) - Span 5 */}
                <div className="lg:col-span-5 space-y-6">
                  {/* General Info Card */}
                  <div className="rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1C1C1E]">
                    <div className="flex items-start gap-4">
                      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white font-black text-2xl shrink-0">
                        B
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-accent dark:text-accent-light">
                          <Sparkles size={10} />
                          Burgonomics Outlet
                        </span>
                        <h2 className="text-lg font-black text-gray-900 dark:text-white truncate">
                          {activeStore.name}
                        </h2>
                        <span className="block text-xs font-bold text-gray-400">
                          {activeStore.city} Directory
                        </span>
                      </div>
                    </div>

                    <div className="my-5 border-t border-gray-50 dark:border-gray-800" />

                    <div className="space-y-3 text-sm font-semibold text-gray-600 dark:text-gray-300">
                      <div className="flex items-start gap-2">
                        <MapPin size={16} className="text-gray-400 shrink-0 mt-0.5" />
                        <span className="text-xs">{activeStore.address}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone size={16} className="text-gray-400" />
                        <span className="text-xs">{activeStore.phone}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="text-gray-400" />
                        <span className="text-xs">{displayEmail(activeStore.email)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock size={16} className="text-gray-400" />
                        <span className="text-xs font-mono">
                          OPERATING HOURS: {activeStore.hours.open} - {activeStore.hours.close}
                        </span>
                      </div>
                    </div>

                    <div className="my-5 border-t border-gray-50 dark:border-gray-800" />

                    {/* Quick navigation and external map triggers */}
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${activeStore.lat},${activeStore.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-2 text-xs font-black hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                      >
                        <Compass size={12} />
                        <span>Google Maps</span>
                      </a>
                      <button
                        onClick={() =>
                          handleCopyText(`${activeStore.lat}, ${activeStore.lng}`, "Coordinates")
                        }
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-2 text-xs font-black hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                      >
                        <Copy size={12} />
                        <span>Coords</span>
                      </button>
                    </div>
                  </div>

                  {/* WEEKLY OPERATING SCHEDULE COMPONENT */}
                  <div className="rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1C1C1E]">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
                        Operating Shifts Weekly Schedule
                      </h3>
                      <Calendar size={16} className="text-primary" />
                    </div>

                    <div className="divide-y divide-gray-50 dark:divide-gray-800 text-xs font-semibold">
                      {Object.entries(activeStore.richHours).map(([day, shift]) => {
                        const s = shift as RichStoreHours;
                        return (
                          <div
                            key={day}
                            className="flex py-2.5 items-center justify-between text-gray-600 dark:text-gray-300"
                          >
                            <span className="capitalize font-black text-gray-900 dark:text-white w-20">
                              {day}
                            </span>
                            <div className="flex-1 flex items-center gap-2 justify-end">
                              <span className="font-mono bg-gray-50 dark:bg-gray-900 px-2 py-0.5 rounded border border-gray-100 dark:border-gray-800">
                                Shift 1: {s.open} - {s.close}
                              </span>
                              {s.secondShiftOpen && (
                                <span className="font-mono bg-primary/5 text-primary px-2 py-0.5 rounded border border-primary/10">
                                  Shift 2: {s.secondShiftOpen} - {s.secondShiftClose}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* STAFF ROSTER COMPONENT */}
                  <div className="rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1C1C1E]">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
                          Assigned Kitchen Staff Roster
                        </h3>
                        <span className="text-[10px] font-black text-gray-400">
                          Total staff: {activeStore.staff.length}
                        </span>
                      </div>
                      {!isReadOnly && (
                        <button
                          onClick={() => setShowAddStaffModal(true)}
                          className="flex items-center gap-1 rounded-lg bg-primary px-2 py-1 text-[10px] font-black text-white hover:bg-[#082E17]"
                        >
                          <Plus size={10} />
                          <span>ASSIGN STAFF</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-2">
                      {activeStore.staff.length === 0 && (
                        <p className="rounded-xl border border-dashed border-gray-200 p-3 text-xs font-semibold text-gray-500 dark:border-gray-700">
                          {STAFF_EMPTY_STATE}
                        </p>
                      )}
                      {activeStore.staff.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between rounded-xl border border-gray-50 bg-gray-50/40 p-2.5 dark:border-gray-800/50 dark:bg-gray-900/10"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="relative">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-accent font-black text-xs">
                                {member.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")}
                              </div>
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-[#1C1C1E] ${
                                  member.isOnline ? "bg-emerald-500" : "bg-gray-300"
                                }`}
                              />
                            </div>
                            <div>
                              <span className="block text-xs font-black text-gray-900 dark:text-white">
                                {member.name}
                              </span>
                              <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                                {member.role}
                              </span>
                            </div>
                          </div>

                          {!isReadOnly && member.role !== "Manager" && (
                            <button
                              onClick={() => handleRemoveStaffMember(member.id)}
                              className="rounded p-1 text-gray-400 hover:text-red-500"
                              title="Unassign Staff"
                            >
                              <Trash size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* DOCUMENTS VAULT COMPONENT */}
                  <div className="rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1C1C1E]">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
                        Compliance Documents Vault
                      </h3>
                      <FileText size={16} className="text-primary" />
                    </div>

                    <div className="space-y-2">
                      {activeStore.documents.length === 0 && (
                        <p className="rounded-xl border border-dashed border-gray-200 p-3 text-xs font-semibold text-gray-500 dark:border-gray-700">
                          {DOCUMENTS_EMPTY_STATE}
                        </p>
                      )}
                      {activeStore.documents.map((doc) => (
                        <div
                          key={doc.id}
                          onClick={() => setViewDoc(doc)}
                          className="cursor-pointer flex items-center justify-between rounded-xl border border-gray-50 bg-gray-50/20 p-2.5 hover:border-primary/20 dark:border-gray-800 dark:bg-gray-900/10"
                        >
                          <div className="flex items-center gap-2">
                            <FileText size={16} className="text-orange-500 shrink-0" />
                            <div>
                              <span className="block text-xs font-black text-gray-900 dark:text-white truncate max-w-[200px]">
                                {doc.name}
                              </span>
                              <span className="block text-[9px] text-gray-400 font-bold">
                                EXPIRY: {doc.expiryDate}
                              </span>
                            </div>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase border ${
                              doc.status === "active"
                                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                : "bg-amber-50 text-amber-600 border-amber-200"
                            }`}
                          >
                            {doc.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* COLUMN RIGHT (Operations, POS panel, queues, settings, charts) - Span 7 */}
                <div className="lg:col-span-7 space-y-6">
                  {/* REAL-TIME OPERATIONS PANEL AND CONTROLS */}
                  <div className="rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1C1C1E]">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
                        Immediate Operations & Status Controls
                      </h3>
                      <Activity size={16} className="text-accent dark:text-accent-light" />
                    </div>

                    {/* Status switches */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Active Toggle operating status */}
                      <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3 dark:bg-gray-900/40 border border-gray-50 dark:border-gray-800">
                        <div>
                          <span className="block text-xs font-black text-gray-900 dark:text-white uppercase">
                            POS Live State
                          </span>
                          <span className="block text-[10px] text-gray-400 font-bold">
                            Override opening status
                          </span>
                        </div>
                        <button
                          onClick={() => handleToggleStoreActiveState(activeStore.id)}
                          disabled={isReadOnly}
                          className={`rounded-xl px-4 py-1.5 text-xs font-black border transition-all ${
                            activeStore.isOpen
                              ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                              : "bg-red-50 text-red-600 border-red-200"
                          }`}
                        >
                          {activeStore.isOpen ? "OPEN" : "CLOSED"}
                        </button>
                      </div>

                      {/* Toggle busy status */}
                      <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3 dark:bg-gray-900/40 border border-gray-50 dark:border-gray-800">
                        <div>
                          <span className="block text-xs font-black text-gray-900 dark:text-white uppercase">
                            Queue Circuit
                          </span>
                          <span className="block text-[10px] text-gray-400 font-bold">
                            Throttles incoming orders
                          </span>
                        </div>
                        <button
                          onClick={() => handleToggleBusyState(activeStore.id)}
                          disabled={isReadOnly || !activeStore.isOpen}
                          className={`rounded-xl px-4 py-1.5 text-xs font-black border transition-all ${
                            activeStore.isBusy
                              ? "bg-amber-50 text-amber-600 border-amber-200"
                              : "bg-white text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                          }`}
                        >
                          {activeStore.isBusy ? "BUSY" : "NORMAL"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* PETPOOJA SYNC MANAGEMENT PANEL */}
                  <div className="rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1C1C1E]">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                      <div>
                        <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
                          Petpooja POS API Integration Link
                        </h3>
                        <span className="text-[10px] font-black text-gray-400">
                          Active restaurant petpoojaRestId mapping settings
                        </span>
                      </div>
                      <HealthBadge
                        system="petpooja"
                        status={petpoojaHealthStatus(activeStore.webhookStatus)}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold">
                      <div className="space-y-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-900/30">
                        <div className="flex flex-col justify-between">
                          <span className="text-gray-400 mb-1">POS Rest ID:</span>
                          <input
                            type="text"
                            value={editingPetpoojaId}
                            onChange={(e) => setEditingPetpoojaId(e.target.value)}
                            onBlur={async () => {
                              if (editingPetpoojaId !== activeStore.petpoojaRestId) {
                                const updated = stores.map((s) => {
                                  if (s.id === activeStore.id)
                                    return { ...s, petpoojaRestId: editingPetpoojaId };
                                  return s;
                                });
                                // #29 family: only claim the update once the
                                // directory actually persisted.
                                if (await saveStores(updated)) {
                                  toast.success("Petpooja Rest ID updated!");
                                }
                              }
                            }}
                            disabled={isReadOnly}
                            placeholder="Not Linked"
                            className="w-full bg-transparent font-mono font-black border-b border-dashed border-gray-300 dark:border-gray-700 focus:border-primary outline-none px-0 py-0.5 text-gray-900 dark:text-white focus:ring-0"
                          />
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Circuit Breaker:</span>
                          <span
                            className={`font-mono font-bold ${
                              activeStore.circuitBreaker
                                ? "text-emerald-500"
                                : "text-gray-400"
                            }`}
                          >
                            {displayCircuitBreaker(activeStore.circuitBreaker)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Last Synced POS:</span>
                          <span className="font-mono text-gray-500">
                            {displayLastSyncTime(activeStore.lastSyncTime)}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-900/30">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Menu Version:</span>
                          <span className="font-mono font-bold text-accent dark:text-accent-light">
                            {displayMenuVersion(activeStore.menuVersion)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Webhook Errors:</span>
                          <span className="font-mono text-red-500">
                            {activeStore.webhookFailures} failures
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Sync Retries:</span>
                          <span className="font-mono text-gray-500">
                            {activeStore.retryCount} times
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-gray-50 pt-3 dark:border-gray-800">
                      <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">
                        Webhook Endpoint URL
                      </span>
                      <div className="flex items-center justify-between rounded-lg bg-gray-50 p-2 font-mono text-[10px] dark:bg-gray-900/50">
                        <span className="truncate text-gray-500">
                          {displayWebhookUrl(activeStore.webhookUrl)}
                        </span>
                        {activeStore.webhookUrl ? (
                          <button
                            onClick={() =>
                              handleCopyText(activeStore.webhookUrl as string, "Webhook URL")
                            }
                            className="text-primary dark:text-emerald-400 hover:underline shrink-0 ml-2"
                          >
                            COPY
                          </button>
                        ) : (
                          <span className="shrink-0 ml-2 text-[9px] font-black uppercase text-gray-400">
                            Not connected
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => handleSyncStore(activeStore.id)}
                        disabled={syncingStoreId === activeStore.id || !canRunSync}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary text-white py-2 text-xs font-black hover:bg-[#082E17] disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        <RotateCw
                          size={12}
                          className={syncingStoreId === activeStore.id ? "animate-spin" : ""}
                        />
                        <span>Run Full Sync</span>
                      </button>
                      <button
                        type="button"
                        // #28: the old handler toasted a fabricated
                        // "caches cleared and rebuilt" success with zero
                        // backend contact. No CDN provider is wired, so the
                        // control is honestly disabled with the reason on it.
                        disabled
                        aria-disabled="true"
                        title={CDN_PURGE_UNAVAILABLE_REASON}
                        className="flex-1 rounded-xl border border-gray-200 bg-white py-2 text-xs font-black text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
                      >
                        Purge CDN Cache
                      </button>
                    </div>
                    <p className="mt-2 text-[10px] font-bold text-gray-600 dark:text-gray-400">
                      {CDN_PURGE_UNAVAILABLE_REASON}
                    </p>
                  </div>

                  {/* QUEUE MONITOR PANEL (DEVELOPER ONLY) */}
                  {import.meta.env.DEV && isDeveloper && (
                    <div className="rounded-[20px] border border-red-200 bg-red-50/20 p-5 shadow-sm dark:border-red-950/25 dark:bg-red-950/5">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-sm font-black text-red-950 dark:text-red-400 uppercase tracking-wider">
                            Real-time Node Queue Worker Monitor
                          </h3>
                          <span className="text-[10px] font-black text-red-600/70 dark:text-red-500">
                            Developer Privilege Access Only
                          </span>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                            activeStore.queueWorkerStatus === "healthy"
                              ? "bg-emerald-100 text-emerald-800"
                              : activeStore.queueWorkerStatus === "unknown"
                                ? "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                                : "bg-red-100 text-red-800"
                          }`}
                        >
                          {displayQueueWorkerStatus(activeStore.queueWorkerStatus)}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-center text-xs font-semibold">
                        <div className="rounded-lg bg-white p-2.5 dark:bg-gray-900 border border-red-100/50 dark:border-red-950/20">
                          <span className="block text-[9px] font-black text-gray-400 uppercase">
                            Waiting
                          </span>
                          <span className="font-mono text-sm font-black text-gray-800 dark:text-gray-200">
                            {activeStore.queueOrdersWaiting}
                          </span>
                        </div>
                        <div className="rounded-lg bg-white p-2.5 dark:bg-gray-900 border border-red-100/50 dark:border-red-950/20">
                          <span className="block text-[9px] font-black text-gray-400 uppercase">
                            Processing
                          </span>
                          <span className="font-mono text-sm font-black text-gray-800 dark:text-gray-200">
                            {activeStore.queueOrdersActive}
                          </span>
                        </div>
                        <div className="rounded-lg bg-white p-2.5 dark:bg-gray-900 border border-red-100/50 dark:border-red-950/20">
                          <span className="block text-[9px] font-black text-gray-400 uppercase">
                            Failed
                          </span>
                          <span className="font-mono text-sm font-black text-red-600">
                            {activeStore.queueFailedJobs}
                          </span>
                        </div>
                        <div className="rounded-lg bg-white p-2.5 dark:bg-gray-900 border border-red-100/50 dark:border-red-950/20">
                          <span className="block text-[9px] font-black text-gray-400 uppercase">
                            Dead Letter
                          </span>
                          <span className="font-mono text-sm font-black text-red-700">
                            {activeStore.queueDeadLetters}
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] font-bold text-red-700 dark:text-red-400">
                        Queue controls are unavailable — no queue backend is connected in this build.
                      </p>
                    </div>
                  )}

                  {/* ANALYTICS CHARTS DASHBOARD (code-split below-the-fold) */}
                  <Suspense
                    fallback={
                      <div
                        className="rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1C1C1E]"
                        role="status"
                        aria-label="Loading outlet analytics"
                      >
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-400 animate-pulse">
                          Loading outlet analytics...
                        </span>
                      </div>
                    }
                  >
                    <StoreAnalyticsCharts
                      avgOrderValue={activeStore.avgOrderValue}
                      peakHour={activeStore.peakHour}
                      weeklyRevenueTrend={activeStore.weeklyRevenueTrend}
                    />
                  </Suspense>

                  {/* CONFIGURATIONS & SETTINGS TOGGLES */}
                  <div className="rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1C1C1E]">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
                        POS Webhook Toggles & Settings
                      </h3>
                      <Settings size={16} className="text-gray-400" />
                    </div>

                    <form onSubmit={handleUpdateStoreSettings} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold">
                        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-2.5 dark:bg-gray-900/30">
                          <div>
                            <span className="block text-gray-700 dark:text-gray-300">
                              Auto Accept Orders
                            </span>
                            <span className="block text-[8px] text-gray-400 font-bold">
                              POS bypass mode
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            disabled={isReadOnly}
                            checked={activeStore.autoAcceptOrders}
                            onChange={() => {
                              const updated = stores.map((s) => {
                                if (s.id === activeStore.id)
                                  return { ...s, autoAcceptOrders: !s.autoAcceptOrders };
                                return s;
                              });
                              saveStores(updated);
                            }}
                            className="h-4 w-4 text-primary"
                          />
                        </div>

                        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-2.5 dark:bg-gray-900/30">
                          <div>
                            <span className="block text-gray-700 dark:text-gray-300">
                              Kitchen Display Link
                            </span>
                            <span className="block text-[8px] text-gray-400 font-bold">
                              KDS screen syncing
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            disabled={isReadOnly}
                            checked={activeStore.kitchenDisplayEnabled}
                            onChange={() => {
                              const updated = stores.map((s) => {
                                if (s.id === activeStore.id)
                                  return { ...s, kitchenDisplayEnabled: !s.kitchenDisplayEnabled };
                                return s;
                              });
                              saveStores(updated);
                            }}
                            className="h-4 w-4 text-primary"
                          />
                        </div>

                        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-2.5 dark:bg-gray-900/30">
                          <div>
                            <span className="block text-gray-700 dark:text-gray-300">
                              Online Payments
                            </span>
                            <span className="block text-[8px] text-gray-400 font-bold">
                              Card, UPI, Netbanking
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            disabled={isReadOnly}
                            checked={activeStore.onlinePaymentEnabled}
                            onChange={() => {
                              const updated = stores.map((s) => {
                                if (s.id === activeStore.id)
                                  return { ...s, onlinePaymentEnabled: !s.onlinePaymentEnabled };
                                return s;
                              });
                              saveStores(updated);
                            }}
                            className="h-4 w-4 text-primary"
                          />
                        </div>

                        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-2.5 dark:bg-gray-900/30">
                          <div>
                            <span className="block text-gray-700 dark:text-gray-300">
                              Cash on Delivery
                            </span>
                            <span className="block text-[8px] text-gray-400 font-bold">
                              Allow pay-at-doorstep
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            disabled={isReadOnly}
                            checked={activeStore.cashOnDeliveryEnabled}
                            onChange={() => {
                              const updated = stores.map((s) => {
                                if (s.id === activeStore.id)
                                  return { ...s, cashOnDeliveryEnabled: !s.cashOnDeliveryEnabled };
                                return s;
                              });
                              saveStores(updated);
                            }}
                            className="h-4 w-4 text-primary"
                          />
                        </div>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </motion.div>
          )
        )}
      </AnimatePresence>

      {/* CONFIRM TOGGLE STORE MODAL — page-local (Revision 1 / #29 blocker 1).
          The shared ConfirmDialog calls onConfirm() then onClose() without
          awaiting, so it would close before a failed write resolved. This
          dialog resolves the write itself: it stays visible and blocks repeat
          submission while pending, closes only after saveStores returns true,
          and remains open with the error on failure (retry). Cancellation
          (Cancel / X / overlay) is explicit and disabled while pending. The
          page's other destructive flow (compliance document viewer) is a
          read-only metadata modal, not a confirm-with-write, so it is not
          affected by this defect. */}
      {confirmToggleStore && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={isTogglingStore ? undefined : () => setConfirmToggleStore(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-50 w-full max-w-md overflow-hidden rounded-[24px] border border-gray-100 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-[#1A1A1A]"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent dark:text-accent-light">
                <AlertTriangle size={20} />
              </div>
              <button
                type="button"
                onClick={() => setConfirmToggleStore(null)}
                disabled={isTogglingStore}
                aria-label="Cancel"
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-50 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <X size={16} />
              </button>
            </div>

            <h3 className="font-sans text-base font-black tracking-tight text-gray-900 dark:text-white">
              {confirmToggleStore.isOpen ? "CLOSE" : "OPEN"} Burgonomics Outlet POS?
            </h3>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-gray-500">
              Are you sure you want to toggle POS operating state of{" "}
              {confirmToggleStore.name}? Customers ordering from{" "}
              {confirmToggleStore.name} will see updated availability right away.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmToggleStore(null)}
                disabled={isTogglingStore}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmToggleStoreState}
                disabled={isTogglingStore}
                className="rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#0B3A1D] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isTogglingStore ? "Saving…" : "Confirm Toggle State"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compliance document metadata viewer (no file stored) */}
      {viewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]">
          <div className="relative w-full max-w-xl rounded-2xl bg-white p-5 dark:bg-[#1C1C1E] shadow-xl border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-gray-50 pb-3 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-accent dark:text-accent-light" />
                <h3 className="font-black text-sm text-gray-900 dark:text-white">{viewDoc.name}</h3>
              </div>
              <button
                onClick={() => setViewDoc(null)}
                className="rounded-lg bg-gray-50 p-1 text-gray-400 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-300"
              >
                <XCircle size={16} />
              </button>
            </div>

            {/* Document visual preview content */}
            <div className="my-6 rounded-lg bg-gray-50 dark:bg-gray-900 border border-dashed border-gray-200 dark:border-gray-800 p-8 text-center">
              <FileText size={48} className="mx-auto text-gray-300" />
              <span className="block mt-4 text-xs font-black text-gray-700 dark:text-gray-200">
                COMPLIANCE RECORD — METADATA ONLY
              </span>
              <p className="mt-1 text-[10px] text-gray-400 font-mono">
                Metadata record — no file is stored for this document.
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-4 text-xs">
                <div className="text-left bg-white dark:bg-[#1C1C1E] border border-gray-100 dark:border-gray-800 p-3 rounded-lg">
                  <span className="block text-[8px] font-black text-gray-400 uppercase">
                    Document Type
                  </span>
                  <span className="font-bold">{viewDoc.type}</span>
                </div>
                <div className="text-left bg-white dark:bg-[#1C1C1E] border border-gray-100 dark:border-gray-800 p-3 rounded-lg">
                  <span className="block text-[8px] font-black text-gray-400 uppercase">
                    Compliance Expiry
                  </span>
                  <span
                    className={`font-bold ${
                      viewDoc.status === "expired"
                        ? "text-rose-600"
                        : viewDoc.status === "expiring"
                          ? "text-amber-600"
                          : "text-emerald-600"
                    }`}
                  >
                    {viewDoc.expiryDate}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => setViewDoc(null)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-black text-gray-500 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGN STAFF MODAL */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[1px]">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-5 dark:bg-[#1C1C1E] shadow-xl border border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between border-b border-gray-50 pb-3 dark:border-gray-800">
              <h3 className="font-black text-sm text-gray-900 dark:text-white">
                ASSIGN NEW KITCHEN STAFF
              </h3>
              <button
                onClick={() => setShowAddStaffModal(false)}
                className="rounded-lg bg-gray-50 p-1 text-gray-400 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-300"
              >
                <XCircle size={16} />
              </button>
            </div>

            <form onSubmit={handleAddStaffMember} className="mt-4 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">
                  Full Staff Name *
                </label>
                <input
                  type="text"
                  required
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  placeholder="e.g. Ramesh Prajapati"
                  className="w-full rounded-xl border border-gray-200 py-2 px-3 text-xs font-semibold outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">
                    Operational Role
                  </label>
                  <select
                    value={newStaffRole}
                    onChange={(e) => setNewStaffRole(e.target.value as StaffMember["role"])}
                    className="w-full rounded-xl border border-gray-200 py-2 px-3 text-xs font-semibold outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800"
                  >
                    <option value="Chef">Chef / Cook</option>
                    <option value="Cashier">Cashier</option>
                    <option value="Delivery">Delivery Executive</option>
                    <option value="Assistant Manager">Assistant Manager</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={newStaffPhone}
                    onChange={(e) => setNewStaffPhone(e.target.value)}
                    placeholder="e.g. +91 98321 04221"
                    className="w-full rounded-xl border border-gray-200 py-2 px-3 text-xs font-semibold outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">
                  Corporate Email Address
                </label>
                <input
                  type="email"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  placeholder="e.g. ramesh@burgonomics.com"
                  className="w-full rounded-xl border border-gray-200 py-2 px-3 text-xs font-semibold outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-50 pt-3 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-black text-gray-500 dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-black text-white hover:bg-[#082E17]"
                >
                  ASSIGN MEMBER
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
