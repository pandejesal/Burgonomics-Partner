import React from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList,
  Users,
  MessageSquare,
  Ticket,
  UtensilsCrossed,
  Building2,
  TrendingUp,
} from 'lucide-react';

const actions = [
  {
    label: 'Live Orders',
    description: 'Track kitchen & delivery',
    icon: ClipboardList,
    path: '/orders',
    color: 'bg-[#1E3A24] text-[#D95D0F]',
  },
  {
    label: 'Customer CRM',
    description: 'Loyalty & spend metrics',
    icon: Users,
    path: '/customers',
    color: 'bg-emerald-950 text-emerald-400 border border-emerald-800/40',
  },
  {
    label: 'Chat Hub',
    description: 'Branch ↔ Brand & Support',
    icon: MessageSquare,
    path: '/chat',
    color: 'bg-[#D95D0F]/20 text-[#D95D0F] border border-[#D95D0F]/40',
  },
  {
    label: 'Support Tickets',
    description: 'Resolve operational issues',
    icon: Ticket,
    path: '/tickets',
    color: 'bg-rose-950/60 text-rose-400 border border-rose-800/40',
  },
  {
    label: 'Store Network',
    description: 'Add & manage future stores',
    icon: Building2,
    path: '/branches',
    color: 'bg-indigo-950 text-indigo-400 border border-indigo-800/40',
  },
  {
    label: 'Performance Analytics',
    description: 'Revenue & export CSV',
    icon: TrendingUp,
    path: '/analytics',
    color: 'bg-cyan-950 text-cyan-400 border border-cyan-800/40',
  },
];

export function QuickActions() {
  return (
    <div className="bg-[#132A17] rounded-2xl border border-[#234B2A] p-5 shadow-lg">
      <h3 className="font-bold text-sm text-white mb-3">Operational Command Center</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {actions.map((action) => (
          <Link
            key={action.path}
            to={action.path}
            className="flex flex-col items-center text-center p-3.5 rounded-xl bg-[#0D0F0D] hover:bg-[#16301B] border border-[#234B2A] hover:border-[#D95D0F]/40 transition-all group"
          >
            <div className={`p-2.5 rounded-xl mb-2 ${action.color}`}>
              <action.icon className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white group-hover:text-[#D95D0F] transition-colors">
              {action.label}
            </span>
            <span className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">
              {action.description}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
