import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ProjectionCard from '@/components/admin/proyecciones/ProjectionCard';
import type { TraderProjection, TraderObservation, BurnEvent } from '@/types';

export const dynamic = 'force-dynamic';

export default async function TraderProjectionPage({
  params,
}: {
  params: Promise<{ traderId: string }>;
}) {
  const { traderId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (myProfile?.role !== 'admin') redirect('/dashboard');

  const { data: traderProfile } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', traderId)
    .single();

  if (!traderProfile) notFound();

  const [{ data: projection }, { data: observations }, { data: burnEvents }] = await Promise.all([
    supabase.from('trader_projections').select('*').eq('trader_id', traderId).maybeSingle(),
    supabase.from('trader_observations').select('*').eq('trader_id', traderId).order('created_at', { ascending: false }),
    supabase.from('burn_events').select('*').eq('trader_id', traderId).order('event_date', { ascending: false }),
  ]);

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <a href="/admin/proyecciones" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
          ← Proyecciones
        </a>
      </div>
      <ProjectionCard
        trader={traderProfile}
        initialProjection={projection as TraderProjection | null}
        initialObservations={(observations ?? []) as TraderObservation[]}
        initialBurnEvents={(burnEvents ?? []) as BurnEvent[]}
      />
    </div>
  );
}
