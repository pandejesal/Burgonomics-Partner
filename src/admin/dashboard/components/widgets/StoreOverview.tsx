import React from "react";
import { useNavigate } from "react-router-dom";
import { useStores } from "../../hooks/useDashboardData";
import { Store, AlertTriangle, ArrowRight } from "lucide-react";

export const StoreOverview: React.FC = () => {
  const navigate = useNavigate();
  const { data: stores, isLoading, isError, refetch } = useStores();

  if (isLoading) {
    return (
      <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-4 animate-pulse">
        <div className="flex justify-between items-center pb-4 border-b border-gray-50 dark:border-gray-800/50">
          <div className="h-5 w-40 bg-gray-100 dark:bg-gray-800 rounded" />
          <div className="h-4 w-12 bg-gray-100 dark:bg-gray-800 rounded" />
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-[72px] bg-gray-100 dark:bg-gray-800 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !stores) {
    return (
      <div className="rounded-[20px] border border-red-100 dark:border-red-950/20 bg-red-50/10 dark:bg-red-950/5 p-6 space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-bold text-sm text-gray-900 dark:text-white uppercase font-sans">
            Store Outlets Overview
          </span>
          <AlertTriangle size={18} className="text-red-500" />
        </div>
        <p className="text-xs font-semibold text-gray-400">
          Failed to pull real-time store configurations from database.
        </p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-xl bg-red-50 dark:bg-red-950/15 text-red-600 dark:text-red-400 text-xs font-bold transition-all cursor-pointer"
        >
          Retry Load
        </button>
      </div>
    );
  }

  // Loop 21/120: a successful-but-empty Firestore read renders an honest
  // empty state — no fixture outlets, no demo badges.
  if (stores.length === 0) {
    return (
      <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-bold text-sm text-gray-900 dark:text-white uppercase font-sans">
            Store Outlets Overview
          </span>
          <Store size={18} className="text-gray-400" />
        </div>
        <p className="text-xs font-semibold text-gray-400">
          No store configurations found in the database yet.
        </p>
        <p className="text-[10px] font-bold text-gray-400/70 uppercase tracking-wider">
          Add your first outlet from the Stores page to see live status here.
        </p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 text-xs font-bold transition-all cursor-pointer"
        >
          Reload
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] flex flex-col h-full">
      <div className="flex items-center justify-between pb-4 border-b border-gray-50 dark:border-gray-800/50 mb-5 shrink-0">
        <div>
          <h4 className="text-sm font-black text-gray-900 dark:text-white font-sans uppercase">
            Store Outlets Overview
          </h4>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
            Real-time status and operational metrics for active franchise locations
          </p>
        </div>
        <button
          onClick={() => navigate("/admin/stores" as any )}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-primary dark:hover:border-emerald-800 text-xs font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-all cursor-pointer"
        >
          <span>All Stores</span>
          <ArrowRight size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[480px] no-scrollbar">
        {stores.map((store) => {
          const isOpen = store.status === "OPEN";

          return (
            <div
              key={store.id}
              onClick={() => navigate(`/admin/stores` as any )} // clicking opens /admin/stores
              className="group p-4 rounded-2xl border border-gray-50 dark:border-gray-900 bg-gray-50/20 dark:bg-[#1E1E1E]/20 hover:border-primary dark:hover:border-emerald-800/60 hover:shadow-sm transition-all duration-300 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-primary dark:text-emerald-400 group-hover:bg-primary group-hover:text-white dark:group-hover:bg-emerald-800 dark:group-hover:text-white transition-all shrink-0">
                  <Store size={18} />
                </div>
                <div>
                  <span className="block font-bold text-xs text-gray-900 dark:text-white group-hover:text-primary dark:group-hover:text-emerald-400 transition-colors">
                    {store.name}
                  </span>
                  <span className="block text-[10px] text-gray-400 font-semibold mt-0.5">
                    {store.city}, {store.state}
                  </span>
                  <div className="flex flex-wrap gap-2.5 mt-2.5">
                    {/* Open/Closed badge */}
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-black uppercase border ${
                        isOpen
                          ? "bg-emerald-50 text-emerald-600 border-emerald-200/40 dark:bg-emerald-950/20 dark:text-emerald-400"
                          : "bg-red-50 text-red-600 border-red-200/40 dark:bg-red-950/20 dark:text-red-400"
                      }`}
                    >
                      <span
                        className={`h-1 w-1 rounded-full ${isOpen ? "bg-emerald-500" : "bg-red-500"}`}
                      />
                      {isOpen ? "Open" : "Closed"}
                    </span>

                    </div>
                </div>
              </div>

              </div>
          );
        })}
      </div>
    </div>
  );
};
