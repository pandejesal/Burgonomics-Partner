import React, { useState } from "react";
import { Server, Database } from "lucide-react";

interface DBTable {
  name: string;
  rowsCount: number;
  indexesCount: number;
  sizeKb: number;
  description: string;
  relationships: string[];
}

export const SystemDatabaseTab: React.FC = () => {
  const [tables] = useState<DBTable[]>([]);
  const [selectedTable, setSelectedTable] = useState<DBTable | null>(null);

  return (
    <div className="space-y-6">
      {/* Upper overview status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 pb-4 shrink-0 gap-4">
        <div>
          <h3 className="text-sm font-black tracking-wider text-white font-mono uppercase">
            DATABASE CORE EXPLORER
          </h3>
          <p className="text-[10px] text-gray-400 font-mono mt-0.5">
            Read-only metadata explorer • Direct modifications prohibited to secure live assets
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 bg-[#0c130e] border border-gray-800 rounded-xl px-3.5 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-600"></span>
            </span>
            <span className="text-gray-300 font-bold">No live connection telemetry</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Database Table Manifest */}
        <div className="lg:col-span-2 p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 space-y-4 shadow-xl">
          <span className="block text-xs font-black text-emerald-400 font-mono uppercase tracking-widest">
            Database Tables Manifest
          </span>

          {tables.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <Database size={24} className="text-gray-700 mx-auto animate-pulse" />
              <p className="text-xs text-gray-500 font-mono">
                No table metadata yet — this view will populate once the database explorer is wired to a live data source.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500 uppercase text-[9px] tracking-wider text-left">
                    <th className="py-2 px-3">Table Identifier</th>
                    <th className="py-2 px-3 text-right">Rows Count</th>
                    <th className="py-2 px-3 text-right">Indexes</th>
                    <th className="py-2 px-3 text-right">Total Disk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-900/40">
                  {tables.map((tbl) => (
                    <tr
                      key={tbl.name}
                      onClick={() => setSelectedTable(tbl)}
                      className={`hover:bg-black/20 cursor-pointer ${
                        selectedTable?.name === tbl.name ? "bg-primary/10" : ""
                      }`}
                    >
                      <td className="py-3 px-3 font-bold text-white flex items-center gap-2">
                        <Database size={12} className="text-gray-500" />
                        <span>{tbl.name}</span>
                      </td>
                      <td className="py-3 px-3 text-right text-gray-300">
                        {tbl.rowsCount.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-300">{tbl.indexesCount}</td>
                      <td className="py-3 px-3 text-right text-gray-400">
                        {tbl.sizeKb > 1024
                          ? `${(tbl.sizeKb / 1024).toFixed(1)} MB`
                          : `${tbl.sizeKb} KB`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selected Table / DB Inspector */}
        <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="border-b border-gray-800 pb-3 flex items-center justify-between">
              <span className="font-mono text-xs font-black text-emerald-400 uppercase tracking-widest">
                Table Metadata
              </span>
            </div>

            {selectedTable ? (
              <div className="space-y-4 font-mono text-xs">
                <div>
                  <span className="block text-[9px] text-gray-500 uppercase font-bold">
                    SQL Identifier
                  </span>
                  <span className="text-xs font-bold text-white select-all break-all">
                    {selectedTable.name}
                  </span>
                </div>

                <div>
                  <span className="block text-[9px] text-gray-500 uppercase font-bold">
                    Functional Purpose
                  </span>
                  <p className="text-gray-300 leading-relaxed italic">
                    "{selectedTable.description}"
                  </p>
                </div>

                <div>
                  <span className="block text-[9px] text-gray-500 uppercase font-bold">
                    Structural Relationships
                  </span>
                  <div className="space-y-1 mt-1.5">
                    {selectedTable.relationships.length > 0 ? (
                      selectedTable.relationships.map((rel, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded bg-black/40 border border-gray-900 flex items-center justify-between text-[10px]"
                        >
                          <span className="text-gray-400">Foreign Key Constraint</span>
                          <span className="text-emerald-400 font-bold">{rel}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-gray-600 italic">No foreign key schemas mapped</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-20 text-center space-y-2">
                <Server size={24} className="text-gray-700 mx-auto animate-pulse" />
                <p className="text-xs text-gray-500 font-mono">
                  Select a table row to inspect its relationships and metadata
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      </div>
  );
};
