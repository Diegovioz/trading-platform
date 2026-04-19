'use client';

import Link from 'next/link';
import TradeTable from '@/components/journal/TradeTable';
import { useTrades } from '@/hooks/useTrades';
import { useProfile } from '@/hooks/useProfile';
import { useCoach } from '@/hooks/useCoach';

export default function JournalPage() {
  const { isAdmin } = useProfile();
  const { trades, loading, error, deleteTrade } = useTrades({ isAdmin });
  const { evaluationMap, evaluateTrade } = useCoach();

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trade Journal</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isAdmin ? 'Viewing all team trades.' : 'Your personal trade log.'}
          </p>
        </div>
        <Link href="/journal/add" className="btn-primary">
          + Add Trade
        </Link>
      </div>

      {loading && (
        <div className="text-center py-16 text-muted-foreground">Loading trades…</div>
      )}

      {error && (
        <div className="card border-destructive/50 text-destructive text-sm">{error}</div>
      )}

      {!loading && !error && (
        <TradeTable
          trades={trades}
          isAdmin={isAdmin}
          onDelete={deleteTrade}
          evaluationMap={isAdmin ? undefined : evaluationMap}
          onEvaluate={isAdmin ? undefined : evaluateTrade}
        />
      )}
    </div>
  );
}
