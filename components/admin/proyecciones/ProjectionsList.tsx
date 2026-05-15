'use client';

import Link from 'next/link';
import type { TraderProjection, ProjectionStatus } from '@/types';
import { BASE_PROFILES, computeAllScenarios } from '@/lib/projections';
import { formatCurrency } from '@/lib/utils';

const STATUS_COLOR: Record<ProjectionStatus, string> = {
  'Revisión normal':       'bg-muted/50 text-muted-foreground',
  'Candidato a escalar':   'bg-green-500/10 text-green-400',
  'Bajo observación':      'bg-yellow-500/10 text-yellow-400',
  'En proceso de salida':  'bg-red-500/10 text-red-400',
};

interface Props {
  traders: { id: string; full_name: string | null; email: string }[];
  projectionByTrader: Record<string, TraderProjection>;
}

export default function ProjectionsList({ traders, projectionByTrader }: Props) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            {['Trader', 'Perfil', 'Capital', 'Split V&M', 'Proyección base (V&M)', 'Estado', ''].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {traders.map(t => {
            const proj = projectionByTrader[t.id];

            if (!proj) {
              return (
                <tr key={t.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{t.full_name ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{t.email}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">—</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">—</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">—</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">—</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">—</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/proyecciones/${t.id}`}
                      className="text-xs font-medium text-primary hover:underline whitespace-nowrap"
                    >
                      Configurar →
                    </Link>
                  </td>
                </tr>
              );
            }

            const scenarios = computeAllScenarios(proj);
            const profile   = BASE_PROFILES[proj.profile_type];

            return (
              <tr key={t.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium">{t.full_name ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">{t.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary whitespace-nowrap">
                    {proj.profile_type} · {profile?.name ?? '—'}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-sm">
                  {formatCurrency(proj.capital_usd, 0)}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {proj.split_trader}/{proj.split_vm}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-red-400">{formatCurrency(scenarios.pessimistic.vmPnl, 0)}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-yellow-400 font-semibold">{formatCurrency(scenarios.base.vmPnl, 0)}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-green-400">{formatCurrency(scenarios.optimistic.vmPnl, 0)}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLOR[proj.status]}`}>
                    {proj.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/proyecciones/${t.id}`}
                    className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors whitespace-nowrap"
                  >
                    Ver detalle →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
