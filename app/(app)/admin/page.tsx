import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AdminTraderList, { type Trader } from '@/components/admin/AdminTraderList';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  // Check admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') redirect('/dashboard');

  // All profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, created_at')
    .order('created_at', { ascending: true });

  // All trades (no limit — grouped client-side)
  const { data: allTrades } = await supabase
    .from('journal_trades')
    .select('id, user_id, asset, direction, entry_price, exit_price, pnl, trade_date, account_id')
    .order('trade_date', { ascending: false })

  // All accounts (for funding info)
  const { data: allAccounts } = await supabase
    .from('accounts')
    .select('id, user_id, name, initial_capital');

  // ── Group trades by user ───────────────────────────────────────────────────
  const tradesByUser = (allTrades ?? []).reduce<Record<string, typeof allTrades>>((acc, t) => {
    if (!acc[t.user_id]) acc[t.user_id] = [];
    acc[t.user_id]!.push(t);
    return acc;
  }, {});

  const traders: Trader[] = (profiles ?? []).map(p => {
    const trades    = tradesByUser[p.id] ?? [];
    const accounts  = (allAccounts ?? []).filter(a => a.user_id === p.id);
    const total_pnl = trades.reduce((s, t) => s + t.pnl, 0);
    const wins      = trades.filter(t => t.pnl > 0).length;
    const win_rate  = trades.length > 0 ? (wins / trades.length) * 100 : 0;

    const initial_capital   = accounts.reduce((s, a) => s + (a.initial_capital ?? 0), 0);
    const current_balance   = initial_capital + total_pnl;

    return {
      id:              p.id,
      full_name:       p.full_name,
      email:           p.email,
      role:            p.role,
      joined:          p.created_at,
      initial_capital,
      current_balance,
      trades:          trades.map(t => ({
        id:          t.id,
        asset:       t.asset,
        direction:   t.direction,
        entry_price: t.entry_price,
        exit_price:  t.exit_price,
        pnl:         t.pnl,
        trade_date:  t.trade_date,
      })),
      total_pnl,
      trade_count:     trades.length,
      win_rate,
    };
  });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Team overview — click a trader to expand their history.
        </p>
      </div>

      <AdminTraderList traders={traders} />
    </div>
  );
}
