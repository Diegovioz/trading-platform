'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { compressImage } from '@/lib/utils/compressImage';
import type { JournalTrade, Account } from '@/types';

const ASSETS = ['NQ', 'BTC', 'ETH', 'XAUUSD', 'NVDA', 'SOFI', 'TSLA'];
const PRESET_TAGS = ['Breakout', 'Reversal', 'Trend', 'News', 'Scalp', 'Swing', 'FOMO', 'Overtraded'];
const NO_TRADE_REASONS = ['Sin setup claro', 'Reglas Orion', 'Mercado cerrado', 'Alta volatilidad / noticias', 'Disciplina', 'Revisión / estudio'];

interface AddTradeFormProps {
  onAdd: (trade: Omit<JournalTrade, 'id' | 'user_id' | 'created_at' | 'profile'>) => Promise<{ error?: string }>;
  onAddNoTradeDay?: (day: { date: string; reason: string | null }) => Promise<{ error?: string }>;
  accounts?: Account[];
}

export default function AddTradeForm({ onAdd, onAddNoTradeDay, accounts = [] }: AddTradeFormProps) {
  const router  = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<'trade' | 'no-trade'>('trade');

  // No-trade-day state
  const [noTradeDate,   setNoTradeDate]   = useState(new Date().toISOString().split('T')[0]);
  const [noTradeReason, setNoTradeReason] = useState('');
  const [noTradeCustom, setNoTradeCustom] = useState('');
  const [noTradeLoading, setNoTradeLoading] = useState(false);
  const [noTradeError,   setNoTradeError]   = useState('');

  const [accountId,   setAccountId]   = useState<string>('');
  const [asset,       setAsset]       = useState('NQ');
  const [direction,   setDirection]   = useState<'long' | 'short'>('long');
  const [entryPrice,  setEntryPrice]  = useState('');
  const [exitPrice,   setExitPrice]   = useState('');
  const [stopLoss,    setStopLoss]    = useState('');
  const [takeProfit,  setTakeProfit]  = useState('');
  const [size,        setSize]        = useState('1');
  const [tradeDate,   setTradeDate]   = useState(new Date().toISOString().split('T')[0]);
  const [tags,        setTags]        = useState<string[]>([]);
  const [notes,       setNotes]       = useState('');
  const [imageFile,   setImageFile]   = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError,    setImageError]    = useState('');
  const [imageOptimizing, setImageOptimizing] = useState(false);
  const [imageWarning,  setImageWarning]  = useState('');
  const [error,         setError]         = useState('');
  const [loading,       setLoading]       = useState(false);

  const entry = parseFloat(entryPrice);
  const exit  = parseFloat(exitPrice);
  const sz    = parseFloat(size) || 1;
  const pnlPreview = !isNaN(entry) && !isNaN(exit)
    ? (direction === 'long' ? (exit - entry) * sz : (entry - exit) * sz)
    : null;

  function toggleTag(tag: string) {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setImageError('Solo se permiten archivos JPG y PNG.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setImageError('La imagen debe ser menor de 10MB.');
      return;
    }
    setImageError('');
    setImageWarning('');
    setImageOptimizing(true);
    setImagePreview(URL.createObjectURL(file)); // show original while compressing

    const { file: compressed, warning } = await compressImage(file);
    setImageFile(compressed);
    setImagePreview(URL.createObjectURL(compressed));
    setImageOptimizing(false);
    if (warning) setImageWarning(warning);
  }

  function removeImage() {
    setImageFile(null);
    setImagePreview(null);
    setImageError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (isNaN(entry) || isNaN(exit) || isNaN(sz)) {
      setError('Entry price, exit price, and size are required numeric fields.');
      setLoading(false);
      return;
    }

    if (accountId) {
      const selectedAcc = accounts.find(a => a.id === accountId);
      if (selectedAcc?.is_failed) {
        setError('This account has breached its drawdown limit. No new trades allowed.');
        setLoading(false);
        return;
      }
    }

    const pnl = direction === 'long' ? (exit - entry) * sz : (entry - exit) * sz;

    // Upload image if provided
    let imageUrl: string | null = null;
    if (imageFile) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        setError('Usuario no autenticado.');
        setLoading(false);
        return;
      }

      const filePath = `trades/${user.id}/${Date.now()}.jpg`;
      console.log('[upload] path:', filePath, '| size:', (imageFile.size / 1024).toFixed(1), 'KB');

      const { error: uploadErr } = await supabase.storage
        .from('trade-images')
        .upload(filePath, imageFile, { contentType: 'image/jpeg', upsert: false });

      if (uploadErr) {
        console.error('[upload] UPLOAD ERROR:', uploadErr);
        setError(`Error al subir la imagen: ${uploadErr.message}`);
        setLoading(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from('trade-images')
        .getPublicUrl(filePath);
      imageUrl = publicUrlData.publicUrl;
    }

    const result = await onAdd({
      account_id:   accountId || null,
      asset,
      direction,
      entry_price:  entry,
      exit_price:   exit,
      stop_loss:    stopLoss   ? parseFloat(stopLoss)   : null,
      take_profit:  takeProfit ? parseFloat(takeProfit) : null,
      size:         sz,
      pnl,
      trade_date:   tradeDate,
      tags:         tags.length ? tags : null,
      notes:            notes || null,
      image_url:        imageUrl,
      image_expires_at: imageUrl
        ? new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString()
        : null,
    });

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.push('/journal');
    }
  }

  async function handleNoTradeSubmit(e: FormEvent) {
    e.preventDefault();
    if (!onAddNoTradeDay) return;
    setNoTradeLoading(true);
    setNoTradeError('');
    const reason = noTradeCustom.trim() || noTradeReason || null;
    const result = await onAddNoTradeDay({ date: noTradeDate, reason });
    if (result.error) {
      setNoTradeError(result.error);
      setNoTradeLoading(false);
    } else {
      router.push('/journal');
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Mode toggle */}
      <div className="flex gap-2 p-1 bg-muted/30 rounded-xl border border-border w-fit">
        {(['trade', 'no-trade'] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === m ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {m === 'trade' ? 'Registrar trade' : 'No operé hoy'}
          </button>
        ))}
      </div>

    {mode === 'no-trade' ? (
      <form onSubmit={handleNoTradeSubmit} className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Registra un día sin operar para mantener tu journal completo.
        </p>

        <div>
          <label className="label">Fecha</label>
          <input
            type="date"
            className="input"
            value={noTradeDate}
            onChange={e => setNoTradeDate(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="label">Motivo <span className="text-muted-foreground">(opcional)</span></label>
          <div className="flex flex-wrap gap-2 mb-3">
            {NO_TRADE_REASONS.map(r => (
              <button
                key={r}
                type="button"
                onClick={() => { setNoTradeReason(prev => prev === r ? '' : r); setNoTradeCustom(''); }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                  noTradeReason === r
                    ? 'bg-primary/20 border-primary text-primary'
                    : 'border-border text-muted-foreground hover:border-foreground'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            type="text"
            className="input"
            placeholder="O escribe un motivo personalizado…"
            value={noTradeCustom}
            onChange={e => { setNoTradeCustom(e.target.value); setNoTradeReason(''); }}
          />
        </div>

        {noTradeError && <p className="text-destructive text-sm">{noTradeError}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={noTradeLoading} className="btn-primary">
            {noTradeLoading ? 'Guardando…' : 'Guardar día sin trade'}
          </button>
          <button type="button" onClick={() => router.push('/journal')} className="btn-ghost">
            Cancelar
          </button>
        </div>
      </form>
    ) : (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Account */}
      {accounts.length > 0 && (
        <div>
          <label className="label">Account <span className="text-muted-foreground">(optional)</span></label>
          <select className="input" value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="">No account</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      )}

      {/* Asset + Direction */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Asset</label>
          <select className="input" value={asset} onChange={e => setAsset(e.target.value)}>
            {ASSETS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Direction</label>
          <div className="flex gap-2">
            {(['long', 'short'] as const).map(dir => (
              <button
                key={dir}
                type="button"
                onClick={() => setDirection(dir)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                  direction === dir
                    ? dir === 'long'
                      ? 'bg-green-500/20 border-green-500 text-green-500'
                      : 'bg-red-500/20 border-red-500 text-red-500'
                    : 'border-border text-muted-foreground hover:border-foreground'
                }`}
              >
                {dir.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Prices */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Entry Price</label>
          <input type="number" step="any" className="input" placeholder="0.00" value={entryPrice} onChange={e => setEntryPrice(e.target.value)} required />
        </div>
        <div>
          <label className="label">Exit Price</label>
          <input type="number" step="any" className="input" placeholder="0.00" value={exitPrice} onChange={e => setExitPrice(e.target.value)} required />
        </div>
        <div>
          <label className="label">Stop Loss <span className="text-muted-foreground">(optional)</span></label>
          <input type="number" step="any" className="input" placeholder="0.00" value={stopLoss} onChange={e => setStopLoss(e.target.value)} />
        </div>
        <div>
          <label className="label">Take Profit <span className="text-muted-foreground">(optional)</span></label>
          <input type="number" step="any" className="input" placeholder="0.00" value={takeProfit} onChange={e => setTakeProfit(e.target.value)} />
        </div>
      </div>

      {/* Size + Date */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Size / Contracts</label>
          <input type="number" step="any" min="0.01" className="input" value={size} onChange={e => setSize(e.target.value)} required />
        </div>
        <div>
          <label className="label">Trade Date</label>
          <input type="date" className="input" value={tradeDate} onChange={e => setTradeDate(e.target.value)} required />
        </div>
      </div>

      {/* P&L preview */}
      {pnlPreview != null && (
        <div className={`px-4 py-3 rounded-lg border text-sm font-medium ${
          pnlPreview >= 0 ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-red-500/10 border-red-500/30 text-red-500'
        }`}>
          Estimated P&L: {pnlPreview >= 0 ? '+' : ''}${pnlPreview.toFixed(2)}
        </div>
      )}

      {/* Tags */}
      <div>
        <label className="label">Tags</label>
        <div className="flex flex-wrap gap-2">
          {PRESET_TAGS.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                tags.includes(tag)
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'border-border text-muted-foreground hover:border-foreground'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="label">Notes</label>
        <textarea
          className="input resize-none"
          rows={3}
          placeholder="What was your thesis? What did you do well or poorly?"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      {/* Screenshot upload */}
      <div>
        <label className="label">
          Screenshot <span className="text-muted-foreground">(opcional · JPG/PNG · máx. 2MB)</span>
        </label>
        {imagePreview ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview} alt="Preview" className="h-32 rounded-lg border border-border object-cover" />
            <button
              type="button"
              onClick={removeImage}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-white text-xs flex items-center justify-center hover:opacity-80"
            >
              ✕
            </button>
          </div>
        ) : (
          <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-border cursor-pointer hover:border-foreground transition-colors">
            <svg className="w-5 h-5 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm text-muted-foreground">Haz clic para subir una captura de pantalla</span>
            <input
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={handleImageChange}
            />
          </label>
        )}
        {imageOptimizing && <p className="text-muted-foreground text-xs mt-1">Optimizando imagen…</p>}
        {imageWarning   && <p className="text-yellow-500 text-xs mt-1">{imageWarning}</p>}
        {imageError     && <p className="text-destructive text-xs mt-1">{imageError}</p>}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {/* Actions */}
      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Saving…' : 'Save Trade'}
        </button>
        <button type="button" onClick={() => router.push('/journal')} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
    )}
    </div>
  );
}
