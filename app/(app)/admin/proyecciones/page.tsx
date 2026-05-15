import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ProjectionsList from '@/components/admin/proyecciones/ProjectionsList';
import type { TraderProjection } from '@/types';

export const dynamic = 'force-dynamic';

export default async function ProyeccionesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') redirect('/dashboard');

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .order('created_at', { ascending: true });

  const { data: projections } = await supabase
    .from('trader_projections')
    .select('*');

  const projectionByTrader = ((projections ?? []) as TraderProjection[]).reduce<Record<string, TraderProjection>>(
    (acc, p) => { acc[p.trader_id] = p; return acc; }, {}
  );

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Proyecciones</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gestión de perfiles y proyecciones anuales por trader.
        </p>
      </div>
      <ProjectionsList
        traders={profiles ?? []}
        projectionByTrader={projectionByTrader}
      />
    </div>
  );
}
