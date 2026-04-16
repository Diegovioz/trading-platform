'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useAccounts } from '@/hooks/useAccounts';
import { useTrades } from '@/hooks/useTrades';
import { useProfile } from '@/hooks/useProfile';
import AccountSelector from '@/components/dashboard/AccountSelector';
import KPICards, { calcMetrics } from '@/components/dashboard/KPICards';
import EquityCurve from '@/components/dashboard/EquityCurve';
import PnLChart from '@/components/dashboard/PnLChart';
import DashboardFilters from '@/components/dashboard/DashboardFilters';
import DrawdownCard from '@/components/dashboard/DrawdownCard';

interface Filters {
  from: string;
  to: string;
  asset: string;
  direction: string;
}

const EMPTY_FILTERS: Filters = { from: '', to: '', asset: '', direction: '' };

export default function DashboardPage() {
  const { profile } = useProfile();
  const { accounts, loading: accLoading, createAccount, renameAccount, deleteAccount } = useAccounts();
  const { trades, loading: tradesLoading } = useTrades();

  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  function setFilter(key: keyof Filters, value: string) {
    setFilters(f => ({ ...f, [key]: value }));
  }
  function resetFilters() { setFilters(EMPTY_FILTERS); }
  const hasActive = Object.values(filters).some(v => v !== '');

  // Filter trades by account + date/asset/direction
  const filteredTrades = useMemo(() => {
    return trades.filter(t => {
      if (selectedAccount !== 'all' && (t as any).account_id !== selectedAccount) return false;
      if (filters.from && t.trade_date < filters.from) return false;
      if (filters.to   && t.trade_date > filters.to)   return false;
      if (filters.asset     && t.asset     !== filters.asset)     return false;
      if (filters.direction && t.direction !== filters.direction) return false;
      return true;
    });
  }, [trades, selectedAccount, filters]);

  const metrics = useMemo(() => calcMetrics(filteredTrades), [filteredTrades]);

  // Initial capital for the selected account
  const initialCapital = useMemo(() => {
    if (selectedAccount === 'all') return accounts.reduce((s, a) => s + a.initial_capital, 0) || 10000;
    return accounts.find(a => a.id === selectedAccount)?.initial_capital ?? 10000;
  }, [selectedAccount, accounts]);

  // Unique assets for filter dropdown
  const assets = useMemo(() => Array.from(new Set(trades.map(t => t.asset))).sort(), [trades]);

  const loading = accLoading || tradesLoading;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Good morning, {profile?.full_name?.split(' ')[0] ?? 'Trader'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Trading performance overview</p>
        </div>
        <div className="flex items-center gap-3">
          <AccountSelector
            accounts={accounts}
            selected={selectedAccount}
            onChange={setSelectedAccount}
            onCreate={createAccount}
            onRename={renameAccount}
            onDelete={(id) => { deleteAccount(id); if (selectedAccount === id) setSelectedAccount('all'); }}
          />
          <Link href="/journal/add" className="btn-primary text-sm">
            + Add Trade
          </Link>
        </div>
      </div>

      {/* Filters */}
      <DashboardFilters
        filters={filters}
        assets={assets}
        onChange={setFilter}
        onReset={resetFilters}
        hasActive={hasActive}
      />

      {/* Empty state */}
      {!loading && filteredTrades.length === 0 && (
        <div className="card text-center py-16">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-secondary flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h2 className="font-semibold text-lg">No trades yet</h2>
          <p className="text-muted-foreground text-sm mt-2">
            Go to{' '}
            <Link href="/journal/add" className="text-primary hover:underline">Add Trade</Link>
            {' '}to start logging your trades.
          </p>
        </div>
      )}

      {/* KPI Cards */}
      {(loading || filteredTrades.length > 0) && (
        <KPICards metrics={loading ? null : metrics} />
      )}

      {/* Risk Monitor — drawdown cards per account */}
      {!loading && accounts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Risk Monitor
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {accounts.map(acc => (
              <DrawdownCard key={acc.id} account={acc} />
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      {!loading && filteredTrades.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
          <div className="xl:col-span-3">
            <EquityCurve trades={filteredTrades} initialCapital={initialCapital} />
          </div>
          <div className="xl:col-span-2">
            <PnLChart trades={filteredTrades} />
          </div>
        </div>
      )}
    </div>
  );
}
