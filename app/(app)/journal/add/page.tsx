'use client';

import AddTradeForm from '@/components/journal/AddTradeForm';
import { useTrades } from '@/hooks/useTrades';
import { useAccounts } from '@/hooks/useAccounts';

export default function AddTradePage() {
  const { addTrade } = useTrades();
  const { accounts } = useAccounts();

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Log a Trade</h1>
        <p className="text-muted-foreground text-sm mt-1">Record a completed trade in your journal.</p>
      </div>

      <div className="card">
        <AddTradeForm onAdd={addTrade} accounts={accounts} />
      </div>
    </div>
  );
}
