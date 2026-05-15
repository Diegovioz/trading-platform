'use client';

export default function ConfidenceBar() {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Confianza de la proyección</p>
      <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
          <div className="h-full w-full bg-primary/40 rounded-full" />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">100% perfil base</span>
        <span className="text-[10px] bg-muted/50 text-muted-foreground px-2 py-0.5 rounded-full border border-border">
          Historial real — próximamente
        </span>
      </div>
    </div>
  );
}
