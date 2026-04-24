export default function RulesPage() {
  return (
    <div className="p-8 space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Reglas Orion Funded</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Lee y respeta estas reglas para mantener tu cuenta activa.
        </p>
      </div>

      <Section title="Objetivos de beneficio">
        <Rule icon="📈" text="Fase 1: +8% de beneficio sobre el balance inicial" />
        <Rule icon="📈" text="Fase 2: +5% de beneficio sobre el balance inicial" />
        <Rule icon="✅" text="Cuenta fondeada: sin objetivo de beneficio" />
      </Section>

      <Section title="Límites de riesgo">
        <Rule icon="🔴" text="Pérdida diaria máxima: 5% del balance inicial" />
        <Rule icon="🔴" text="Drawdown máximo: 10% trailing" warn />
      </Section>

      <Section title="Días de trading">
        <Rule icon="📅" text="Mínimo 4 días de trading para completar la evaluación" />
        <Rule icon="♾️" text="Sin límite de tiempo para completar las fases" />
      </Section>

      <Section title="Operativa permitida">
        <Rule icon="✅" text="En evaluación: se puede operar noticias sin restricción" />
        <Rule icon="⚠️" text="En cuenta fondeada: prohibido abrir, cerrar o modificar operaciones desde 5 minutos antes hasta 5 minutos después de noticias de alto impacto" warn />
        <Rule icon="✅" text="Se permiten operaciones overnight y durante el fin de semana" />
        <Rule icon="❌" text="Sin consistency rule obligatoria en evaluación" />
      </Section>

      <Section title="Regla de consistencia (cuenta fondeada)">
        <Rule icon="⚖️" text="Durante el ciclo de pago, el día con mayor ganancia no puede representar más del 30% del total de beneficios generados" warn />
      </Section>

      <Section title="Retiros y profit split">
        <Rule icon="💰" text="Profit split: 80% para el trader" />
        <Rule icon="💵" text="Retiro mínimo: $150 después del split" />
      </Section>

      <Section title="Comportamiento y seguridad">
        <Rule icon="🚫" text="No se permite hacer trampas, arbitraje abusivo o explotar fallos del broker" warn />
        <Rule icon="📍" text="Solo se deben usar dispositivos e IPs coherentes con tu ubicación" />
        <Rule icon="⚠️" text="Si hay inconsistencias de IP o comportamiento sospechoso, pueden cerrar la cuenta o cancelar beneficios" warn />
        <Rule icon="🕐" text="Si no operas en 30 días consecutivos, la cuenta puede ser desactivada" warn />
      </Section>

      <Section title="KYC y activación">
        <Rule icon="📋" text="Al pasar la evaluación, debes completar el KYC en máximo 30 días" />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-3">
      <h2 className="text-base font-semibold border-b border-border pb-2">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Rule({ icon, text, warn }: { icon: string; text: string; warn?: boolean }) {
  return (
    <div className={`flex items-start gap-3 text-sm rounded-lg px-3 py-2 ${warn ? 'bg-yellow-500/5 border border-yellow-500/20' : ''}`}>
      <span className="text-base shrink-0">{icon}</span>
      <span className={warn ? 'text-yellow-200' : 'text-foreground'}>{text}</span>
    </div>
  );
}
