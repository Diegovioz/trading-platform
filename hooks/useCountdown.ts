'use client';

import { useState, useEffect } from 'react';

export interface RemainingTime {
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

function calc(lastActionAt: string | null | undefined, limitHours: number): RemainingTime | null {
  if (!lastActionAt) return null;
  const remaining = limitHours * 3_600_000 - (Date.now() - new Date(lastActionAt).getTime());
  if (remaining <= 0) return null;
  return {
    hours:   Math.floor(remaining / 3_600_000),
    minutes: Math.floor((remaining % 3_600_000) / 60_000),
    seconds: Math.floor((remaining % 60_000) / 1_000),
    totalMs: remaining,
  };
}

export function useCountdown(lastActionAt: string | null | undefined, limitHours: number): RemainingTime | null {
  const [remaining, setRemaining] = useState<RemainingTime | null>(() => calc(lastActionAt, limitHours));

  useEffect(() => {
    const initial = calc(lastActionAt, limitHours);
    setRemaining(initial);
    if (!initial) return;
    const id = setInterval(() => {
      const r = calc(lastActionAt, limitHours);
      setRemaining(r);
      if (!r) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [lastActionAt, limitHours]);

  return remaining;
}

export function fmtCountdown(r: RemainingTime): string {
  return [r.hours, r.minutes, r.seconds]
    .map(n => String(n).padStart(2, '0'))
    .join(':');
}
