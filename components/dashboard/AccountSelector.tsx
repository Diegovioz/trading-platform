'use client';

import { useState } from 'react';
import type { Account } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface AccountSelectorProps {
  accounts: Account[];
  selected: string; // 'all' | account id
  onChange: (id: string) => void;
  onCreate: (name: string, capital: number) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export default function AccountSelector({
  accounts, selected, onChange, onCreate, onRename, onDelete,
}: AccountSelectorProps) {
  const [open, setOpen]         = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState('');
  const [newCap, setNewCap]     = useState('10000');
  const [editId, setEditId]     = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const totalPnl     = accounts.reduce((s, a) => s + a.total_pnl, 0);
  const totalBalance = accounts.reduce((s, a) => s + a.current_balance, 0);

  const current = selected === 'all'
    ? null
    : accounts.find(a => a.id === selected);

  const label  = selected === 'all' ? 'All Accounts' : (current?.name ?? 'Select account');
  const pnl    = selected === 'all' ? totalPnl : (current?.total_pnl ?? 0);
  const pnlCls = pnl >= 0 ? 'text-green-500' : 'text-red-500';

  function handleCreate() {
    if (!newName.trim()) return;
    onCreate(newName.trim(), parseFloat(newCap) || 10000);
    setNewName(''); setNewCap('10000'); setCreating(false);
  }

  function handleRename(id: string) {
    if (!editName.trim()) return;
    onRename(id, editName.trim());
    setEditId(null);
  }

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 text-sm hover:border-primary/50 transition-colors min-w-[190px]"
      >
        <LayersIcon className="w-4 h-4 text-primary shrink-0" />
        <span className="font-medium truncate flex-1 text-left">{label}</span>
        <span className={`text-xs font-mono ${pnlCls}`}>
          {selected === 'all' ? formatCurrency(totalBalance) : formatCurrency(current?.current_balance ?? 0)}
        </span>
        <ChevronIcon className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 z-40 bg-card border border-border rounded-xl shadow-2xl w-72 overflow-hidden">

            {/* All accounts row */}
            <button
              onClick={() => { onChange('all'); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary transition-colors text-left border-b border-border ${selected === 'all' ? 'bg-secondary' : ''}`}
            >
              <LayersIcon className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">All Accounts</p>
                <p className="text-xs text-muted-foreground">
                  {accounts.length} accounts · {accounts.reduce((s, a) => s + a.total_trades, 0)} trades
                </p>
                <p className={`text-xs font-mono ${totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  Balance: {formatCurrency(totalBalance)} · PnL: {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)}
                </p>
              </div>
              {selected === 'all' && <CheckIcon className="w-3.5 h-3.5 text-primary shrink-0" />}
            </button>

            {/* Individual accounts */}
            {accounts.map(acc => (
              <div
                key={acc.id}
                onClick={() => { if (editId !== acc.id) { onChange(acc.id); setOpen(false); } }}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-secondary cursor-pointer transition-colors ${selected === acc.id ? 'bg-secondary' : ''}`}
              >
                <UserIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  {editId === acc.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename(acc.id);
                        if (e.key === 'Escape') { e.stopPropagation(); setEditId(null); }
                      }}
                      onClick={e => e.stopPropagation()}
                      className="w-full bg-background border border-primary rounded px-2 py-0.5 text-sm focus:outline-none"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{acc.name}</p>
                      {acc.is_failed && (
                        <span className="text-[10px] font-bold text-red-500 bg-red-500/15 px-1.5 py-0.5 rounded shrink-0">FAILED</span>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">{acc.total_trades} trades</p>
                  <p className={`text-xs font-mono ${acc.total_pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {formatCurrency(acc.current_balance)} · Risk: {formatCurrency(Math.max(0, acc.remaining_risk))}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  {selected === acc.id && editId !== acc.id && <CheckIcon className="w-3.5 h-3.5 text-primary" />}
                  {editId === acc.id ? (
                    <button onClick={() => handleRename(acc.id)} className="p-1 rounded hover:text-primary text-muted-foreground">
                      <CheckIcon className="w-3 h-3" />
                    </button>
                  ) : (
                    <button onClick={() => { setEditId(acc.id); setEditName(acc.name); }} className="p-1 rounded hover:text-primary text-muted-foreground">
                      <PencilIcon className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => { if (confirm('Delete this account and all its trades?')) { onDelete(acc.id); if (selected === acc.id) onChange('all'); } }}
                    className="p-1 rounded hover:text-red-500 text-muted-foreground"
                  >
                    <TrashIcon className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}

            {/* Create new account */}
            <div className="border-t border-border p-3">
              {creating ? (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') setCreating(false); }}
                    placeholder="Account name…"
                    className="input text-sm py-1.5"
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={newCap}
                      onChange={e => setNewCap(e.target.value)}
                      placeholder="Initial capital…"
                      className="input text-sm py-1.5 flex-1"
                    />
                    <button onClick={handleCreate} className="btn-primary text-sm py-1.5 px-3 shrink-0">Add</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setCreating(true)}
                  className="w-full flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors py-1"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add account
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Inline SVG icons ─────────────────────────────────────────────────────────
function LayersIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>;
}
function UserIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
}
function ChevronIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
}
function CheckIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>;
}
function PencilIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>;
}
function TrashIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
}
function PlusIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
}
