import React, { useState } from 'react';
import { useFranchiseLeads, type FranchiseLead } from '@/hooks/useFranchiseLeads';
import {
  Users,
  Building,
  Phone,
  Mail,
  MapPin,
  DollarSign,
  Briefcase,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sparkles,
  Search,
  ExternalLink,
  Store,
} from 'lucide-react';

interface FranchiseLeadsPipelineProps {
  onConvertToBranch: (lead: FranchiseLead) => void;
}

export function FranchiseLeadsPipeline({ onConvertToBranch }: FranchiseLeadsPipelineProps) {
  const { leads, isLoading, updateLeadStatus } = useFranchiseLeads();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLeads = leads.filter((lead) => {
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    const matchesSearch =
      lead.applicantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.phone.includes(searchQuery) ||
      (lead.preferredLocation && lead.preferredLocation.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: FranchiseLead['status']) => {
    switch (status) {
      case 'approved':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-950/90 text-emerald-300 border border-emerald-600 uppercase">
            ✓ Approved
          </span>
        );
      case 'site_visit':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-700/60 uppercase">
            🏢 Site Visit
          </span>
        );
      case 'contacted':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/60 uppercase">
            📞 Contacted
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-900 text-zinc-500 border border-zinc-800 uppercase">
            Archived
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-accent/20 text-accent-light border border-accent/50 uppercase">
            ★ New Application
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 select-none">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-surface p-5 rounded-2xl border border-border shadow-xl">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-bold">
            <span>Total Inquiries</span>
            <Users className="w-4 h-4 text-accent-light" />
          </div>
          <div className="font-mono font-black text-2xl text-white mt-2">
            {leads.length}
          </div>
          <div className="text-[10px] text-zinc-400 mt-1">Across 6 Target Metros</div>
        </div>

        <div className="bg-surface p-5 rounded-2xl border border-border shadow-xl">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-bold">
            <span>Pipeline Capital</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="font-mono font-black text-2xl text-emerald-400 mt-2">
            ₹2.25 Cr+
          </div>
          <div className="text-[10px] text-zinc-400 mt-1">Self-Reported Investment</div>
        </div>

        <div className="bg-surface p-5 rounded-2xl border border-border shadow-xl">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-bold">
            <span>Site Visits Active</span>
            <Building className="w-4 h-4 text-purple-400" />
          </div>
          <div className="font-mono font-black text-2xl text-purple-300 mt-2">
            {leads.filter((l) => l.status === 'site_visit').length}
          </div>
          <div className="text-[10px] text-zinc-400 mt-1">Commercial Property Inspection</div>
        </div>

        <div className="bg-surface p-5 rounded-2xl border border-border shadow-xl">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-bold">
            <span>Approved Franchisees</span>
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="font-mono font-black text-2xl text-cyan-300 mt-2">
            {leads.filter((l) => l.status === 'approved').length}
          </div>
          <div className="text-[10px] text-zinc-400 mt-1">Ready for Store Provisioning</div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-[#112415] p-3 rounded-2xl border border-border flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          {(
            [
              { key: 'all', label: 'All Applications' },
              { key: 'new', label: '★ New' },
              { key: 'contacted', label: '📞 Contacted' },
              { key: 'site_visit', label: '🏢 Site Visit' },
              { key: 'approved', label: '✓ Approved' },
              { key: 'rejected', label: 'Archived' },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === key
                  ? 'bg-accent text-white shadow-sm'
                  : 'bg-bg text-zinc-400 hover:text-white border border-border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search applicant, city, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-bg border border-border rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Leads List */}
      {isLoading ? (
        <div className="p-16 text-center text-zinc-400 text-xs">Loading franchise inquiries...</div>
      ) : filteredLeads.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-2xl border border-border p-8 space-y-3">
          <Users className="w-12 h-12 mx-auto text-zinc-600" />
          <h3 className="font-bold text-white text-sm">No franchise inquiries in this filter</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            Customer inquiries submitted through the delivery app will appear here in real time.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredLeads.map((lead) => (
            <div
              key={lead.id}
              className={`bg-surface hover:bg-[#16301B] rounded-2xl border p-5 transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 ${
                lead.status === 'approved'
                  ? 'border-emerald-700/70 shadow-emerald-950/20 shadow-md'
                  : 'border-border hover:border-accent/50'
              }`}
            >
              {/* Left Details */}
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-bold text-white text-base">{lead.applicantName}</span>
                  {getStatusBadge(lead.status)}
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-bg text-amber-300 border border-border">
                    Budget: {lead.investmentBudget}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#112415] text-zinc-300 border border-border">
                    {lead.commercialSpace === 'owned'
                      ? `Owned Space (${lead.spaceAreaSqFt || 1000} sq.ft)`
                      : lead.commercialSpace === 'rented'
                      ? `Rented Space (${lead.spaceAreaSqFt || 800} sq.ft)`
                      : 'Searching for Space'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-300">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-accent-light" />
                    <span><strong>{lead.city}</strong> {lead.preferredLocation && `(${lead.preferredLocation})`}</span>
                  </span>

                  <a
                    href={`tel:${lead.phone}`}
                    className="flex items-center gap-1 text-zinc-300 hover:text-white font-mono"
                  >
                    <Phone className="w-3.5 h-3.5 text-zinc-500" />
                    <span>{lead.phone}</span>
                  </a>

                  <a
                    href={`mailto:${lead.email}`}
                    className="flex items-center gap-1 text-zinc-300 hover:text-white"
                  >
                    <Mail className="w-3.5 h-3.5 text-zinc-500" />
                    <span>{lead.email}</span>
                  </a>

                  <span className="flex items-center gap-1 text-zinc-400">
                    <Briefcase className="w-3.5 h-3.5 text-zinc-500" />
                    <span>{lead.foodExperienceYears ? `${lead.foodExperienceYears} yrs F&B exp` : 'No prior F&B'}</span>
                  </span>
                </div>

                {lead.notes && (
                  <p className="text-xs text-zinc-400 bg-bg p-2.5 rounded-xl border border-border/60 leading-relaxed">
                    <strong className="text-zinc-300">Notes:</strong> {lead.notes}
                  </p>
                )}
              </div>

              {/* Right Controls */}
              <div className="flex items-center gap-2.5 w-full lg:w-auto justify-between lg:justify-end pt-2 lg:pt-0 border-t lg:border-t-0 border-border">
                {/* Status Selector */}
                <select
                  value={lead.status}
                  onChange={(e) =>
                    updateLeadStatus.mutate({
                      leadId: lead.id,
                      status: e.target.value as any,
                    })
                  }
                  className="px-3 py-2 text-xs bg-bg border border-border rounded-xl text-white focus:outline-none focus:border-accent cursor-pointer"
                >
                  <option value="new">★ New</option>
                  <option value="contacted">📞 Contacted</option>
                  <option value="site_visit">🏢 Site Visit</option>
                  <option value="approved">✓ Approved</option>
                  <option value="rejected">Archived</option>
                </select>

                {/* 1-Tap Convert to Store */}
                <button
                  onClick={() => onConvertToBranch(lead)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-xl font-bold text-xs shadow-md transition-colors cursor-pointer"
                  title="Open Branch Provisioning Wizard with this applicant's details"
                >
                  <Store className="w-4 h-4" />
                  <span>Convert to Store</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FranchiseLeadsPipeline;
