'use client';

interface Filters {
  from: string;
  to: string;
  asset: string;
  direction: string;
}

interface DashboardFiltersProps {
  filters: Filters;
  assets: string[];
  onChange: (key: keyof Filters, value: string) => void;
  onReset: () => void;
  hasActive: boolean;
}

export default function DashboardFilters({ filters, assets, onChange, onReset, hasActive }: DashboardFiltersProps) {
  function setQuickRange(days: number) {
    const to   = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    onChange('from', from.toISOString().split('T')[0]);
    onChange('to',   to.toISOString().split('T')[0]);
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          <h3 className="text-sm font-semibold">Filters</h3>
          {hasActive && <span className="bg-primary/20 text-primary text-xs px-2 py-0.5 rounded-full">Active</span>}
        </div>
        {hasActive && (
          <button onClick={onReset} className="text-xs text-muted-foreground hover:text-red-500 transition-colors flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            Clear all
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <div>
          <label className="label">From</label>
          <input type="date" className="input text-sm py-1.5" value={filters.from} onChange={e => onChange('from', e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input text-sm py-1.5" value={filters.to} onChange={e => onChange('to', e.target.value)} />
        </div>
        <div>
          <label className="label">Asset</label>
          <select className="input text-sm py-1.5" value={filters.asset} onChange={e => onChange('asset', e.target.value)}>
            <option value="">All assets</option>
            {assets.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Direction</label>
          <select className="input text-sm py-1.5" value={filters.direction} onChange={e => onChange('direction', e.target.value)}>
            <option value="">Long & Short</option>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </div>
        <div>
          <label className="label">Quick range</label>
          <select className="input text-sm py-1.5" defaultValue="" onChange={e => { if (e.target.value) setQuickRange(parseInt(e.target.value)); }}>
            <option value="">Select range</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </select>
        </div>
      </div>
    </div>
  );
}
