import React from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  UtensilsCrossed,
  Bike,
  Ticket,
  Printer,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';

export function QuickActionsBar() {
  const actions = [
    {
      title: 'Walk-In Counter Order',
      description: 'New counter bill via Petpooja KOT',
      href: '/orders',
      icon: Plus,
      color: 'bg-[#FF6600]/15 text-[#FF6600] border-[#FF6600]/40 hover:bg-[#FF6600]/25',
    },
    {
      title: '86 Out-of-Stock Items',
      description: 'Toggle menu ingredients',
      href: '/menu',
      icon: UtensilsCrossed,
      color: 'bg-emerald-950/40 text-emerald-400 border-emerald-500/40 hover:bg-emerald-950/60',
    },
    {
      title: 'Courier Dispatch Queue',
      description: 'Assign Porter / In-house',
      href: '/delivery-queue',
      icon: Bike,
      color: 'bg-cyan-950/40 text-cyan-400 border-cyan-500/40 hover:bg-cyan-950/60',
    },
    {
      title: 'Customer Support Desk',
      description: 'Review SLA tickets',
      href: '/tickets',
      icon: Ticket,
      color: 'bg-amber-950/40 text-amber-400 border-amber-500/40 hover:bg-amber-950/60',
    },
  ];

  return (
    <div className="space-y-3 select-none">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-white uppercase tracking-wider">
          Quick Operational Shortcuts
        </h2>
        <span className="text-[10px] text-neutral-400 font-bold uppercase">1-Tap Navigation</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <Link
              key={act.title}
              to={act.href}
              className={`p-4 rounded-3xl border transition-all active:scale-98 flex flex-col justify-between space-y-3 ${act.color}`}
            >
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-2xl bg-black/40">
                  <Icon className="w-5 h-5" />
                </div>
                <ChevronRight className="w-4 h-4 opacity-70" />
              </div>

              <div>
                <h3 className="font-bold text-xs text-white leading-tight">{act.title}</h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">{act.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default QuickActionsBar;
