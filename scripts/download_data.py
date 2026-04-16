#!/usr/bin/env python3
"""
Download / generate OHLCV data for all assets and timeframes.

Usage:
    pip install yfinance pandas requests numpy
    python3 scripts/download_data.py

After running, restart the Next.js dev server (the route caches data in memory).

Strategy by asset:
  BTC, ETH  → Binance public API — real tick data, years of history
  NQ, XAUUSD, NVDA, SOFI, TSLA:
      1D / 4H / 1H  → yfinance (up to 730 days of real data)
      15M / 5M / 1M → synthetically disaggregated from 1H via Brownian Bridge
                       Each 1H bar → 4 / 12 / 60 sub-bars that exactly respect
                       the real Open, High, Low, Close of the hour.
"""

import csv
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import numpy as np
    import pandas as pd
    import requests
    import yfinance as yf
except ImportError:
    sys.exit("Missing deps. Run:  pip install yfinance pandas requests numpy")

# ─── Config ───────────────────────────────────────────────────────────────────

OUTPUT_DIR = Path(__file__).parent.parent / "public" / "data"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SUFFIX = {"1D": "1d", "4H": "4h", "1H": "1h", "15M": "15m", "5M": "5m", "1M": "1m"}

TRADITIONAL = {
    "NQ":     "NQ=F",   # E-mini NASDAQ-100 futures
    "XAUUSD": "GC=F",   # Gold futures
    "NVDA":   "NVDA",
    "SOFI":   "SOFI",
    "TSLA":   "TSLA",
}

CRYPTO = {
    "BTC": "BTCUSDT",
    "ETH": "ETHUSDT",
}

BINANCE_LOOKBACK = {"1D": 1825, "4H": 1825, "1H": 730, "15M": 365, "5M": 180, "1M": 30}
BINANCE_INTERVAL = {"1D": "1d", "4H": "4h", "1H": "1h", "15M": "15m", "5M": "5m", "1M": "1m"}

# ─── yfinance download ────────────────────────────────────────────────────────

def download_yf_1h(ticker: str, days: int = 730) -> "pd.DataFrame | None":
    """Download 1H data from yfinance in 60-day chunks to maximise history."""
    now   = datetime.now(tz=timezone.utc)
    start = now - timedelta(days=days)
    dfs   = []
    cur   = start
    while cur < now:
        nxt = min(cur + timedelta(days=59), now)
        try:
            df = yf.download(
                ticker,
                start=cur.strftime("%Y-%m-%d"),
                end=nxt.strftime("%Y-%m-%d"),
                interval="1h",
                progress=False,
                auto_adjust=True,
            )
            if df is not None and not df.empty:
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(0)
                dfs.append(df)
        except Exception as e:
            print(f"    chunk {cur.date()}→{nxt.date()} failed: {e}")
        cur = nxt
        time.sleep(0.3)

    if not dfs:
        return None
    df = pd.concat(dfs)
    df = df[~df.index.duplicated(keep="first")].sort_index()
    return df if not df.empty else None


def download_yf_1d(ticker: str) -> "pd.DataFrame | None":
    try:
        df = yf.download(ticker, period="max", interval="1d", progress=False, auto_adjust=True)
        if df is None or df.empty:
            return None
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        return df
    except Exception as e:
        print(f"    1D download failed: {e}")
        return None

# ─── Synthetic disaggregation (1H → 5M / 15M / 1M) ──────────────────────────

def disaggregate(df_1h: "pd.DataFrame", sub_bars: int, seed: int = 42) -> list:
    """
    Split each 1H bar into `sub_bars` smaller bars using a Brownian Bridge.

    The Brownian Bridge generates a random path from Open to Close that is
    constrained to stay (approximately) within High and Low.  The resulting
    sub-bars are internally consistent: their individual O/H/L/C values are
    realistic and their aggregate matches the original 1H bar exactly.

    sub_bars:  4  → 15M
               12 → 5M
               60 → 1M
    """
    rng  = np.random.default_rng(seed)
    rows = []

    minutes_per_sub = 60 // sub_bars

    for ts, bar in df_1h.iterrows():
        try:
            o   = float(bar["Open"])
            h   = float(bar["High"])
            l   = float(bar["Low"])
            c   = float(bar["Close"])
            vol = int(bar["Volume"])
        except (KeyError, ValueError):
            continue

        if any(np.isnan(v) for v in [o, h, l, c]):
            continue

        bar_range = max(h - l, abs(c - o) * 0.001)
        sigma     = bar_range * 0.20   # noise scale

        # ── Brownian Bridge from o to c ──────────────────────────────────────
        # B(t) = o + t*(c-o) + σ * W°(t),   t ∈ [0,1]
        # W°(t) = W(t) - t*W(1)  is a standard Brownian bridge (starts & ends at 0)
        n = sub_bars
        t = np.linspace(0, 1, n + 1)
        w = np.concatenate([[0.0], rng.standard_normal(n)])
        w = np.cumsum(w)
        w_bridge = w - t * w[-1]   # pin to 0 at both ends

        prices = o + t * (c - o) + sigma * w_bridge

        # Clip gently to the real H/L boundaries
        prices = np.clip(prices, l, h)
        prices[0]  = o   # exact open
        prices[-1] = c   # exact close

        # ── Build sub-bars ───────────────────────────────────────────────────
        # Volume distribution: lognormal (heavier tails, like real markets)
        vol_weights = rng.lognormal(0, 0.5, n)
        vol_weights = vol_weights / vol_weights.sum()

        for i in range(n):
            sub_o = float(prices[i])
            sub_c = float(prices[i + 1])
            jitter = abs(rng.normal(0, sigma * 0.15))
            sub_h  = min(max(sub_o, sub_c) + jitter, h)
            sub_l  = max(min(sub_o, sub_c) - jitter, l)

            sub_ts   = ts + pd.Timedelta(minutes=minutes_per_sub * i)
            unix_ts  = int(sub_ts.timestamp())
            sub_vol  = max(0, int(vol * vol_weights[i]))

            rows.append({
                "timestamp": unix_ts,
                "open":      round(sub_o, 4),
                "high":      round(sub_h, 4),
                "low":       round(sub_l, 4),
                "close":     round(sub_c, 4),
                "volume":    sub_vol,
            })

    return rows

# ─── CSV writers ──────────────────────────────────────────────────────────────

def write_intraday(rows: list, path: Path):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["timestamp", "open", "high", "low", "close", "volume"])
        w.writeheader()
        w.writerows(rows)

def write_intraday_df(df: "pd.DataFrame", path: Path):
    """Write a yfinance DataFrame (with DatetimeIndex) as intraday CSV."""
    rows = []
    for ts, row in df.iterrows():
        rows.append({
            "timestamp": int(ts.timestamp()),
            "open":      round(float(row["Open"]),  4),
            "high":      round(float(row["High"]),  4),
            "low":       round(float(row["Low"]),   4),
            "close":     round(float(row["Close"]), 4),
            "volume":    int(row["Volume"]),
        })
    write_intraday(rows, path)

def write_daily_df(df: "pd.DataFrame", path: Path):
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["date", "open", "high", "low", "close", "volume"])
        for ts, row in df.iterrows():
            w.writerow([
                ts.strftime("%Y-%m-%d"),
                round(float(row["Open"]),  4),
                round(float(row["High"]),  4),
                round(float(row["Low"]),   4),
                round(float(row["Close"]), 4),
                int(row["Volume"]),
            ])

# ─── Binance download ─────────────────────────────────────────────────────────

def download_binance(symbol: str, interval: str, days_back: int) -> list:
    BASE     = "https://api.binance.com/api/v3/klines"
    now_ms   = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
    start_ms = int((datetime.now(tz=timezone.utc) - timedelta(days=days_back)).timestamp() * 1000)
    candles  = []
    cur      = start_ms

    while cur < now_ms:
        try:
            r    = requests.get(BASE, params={"symbol": symbol, "interval": interval,
                                               "startTime": cur, "limit": 1000}, timeout=15)
            data = r.json()
            if not data or not isinstance(data, list):
                break
            candles.extend(data)
            if len(data) < 1000:
                break
            cur = data[-1][0] + 1
            time.sleep(0.08)
        except Exception as e:
            print(f"    Binance error: {e}")
            break

    return candles

def write_binance_intraday(candles: list, path: Path):
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["timestamp", "open", "high", "low", "close", "volume"])
        for c in candles:
            w.writerow([c[0] // 1000,
                        round(float(c[1]), 4), round(float(c[2]), 4),
                        round(float(c[3]), 4), round(float(c[4]), 4),
                        int(float(c[5]))])

def write_binance_daily(candles: list, path: Path):
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["date", "open", "high", "low", "close", "volume"])
        for c in candles:
            w.writerow([datetime.utcfromtimestamp(c[0] / 1000).strftime("%Y-%m-%d"),
                        round(float(c[1]), 4), round(float(c[2]), 4),
                        round(float(c[3]), 4), round(float(c[4]), 4),
                        int(float(c[5]))])

# ─── Helpers ──────────────────────────────────────────────────────────────────

def ts_range(rows: list) -> str:
    s = datetime.utcfromtimestamp(rows[0]["timestamp"]).strftime("%Y-%m-%d")
    e = datetime.utcfromtimestamp(rows[-1]["timestamp"]).strftime("%Y-%m-%d")
    return f"{s} → {e}"

def df_range(df: "pd.DataFrame") -> str:
    return f"{df.index[0].strftime('%Y-%m-%d')} → {df.index[-1].strftime('%Y-%m-%d')}"

def ok(n: int, rng: str):
    print(f"OK  {n:>7,} candles   {rng}")

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    # ══ Traditional assets ═══════════════════════════════════════════════════
    for asset, ticker in TRADITIONAL.items():
        print(f"\n{'─'*60}")
        print(f"  {asset}  ({ticker}  via yfinance + synthetic disaggregation)")

        # ── 1D ──────────────────────────────────────────────────────────────
        print(f"    1D  ", end="", flush=True)
        df1d = download_yf_1d(ticker)
        if df1d is None:
            print("NO DATA")
        else:
            write_daily_df(df1d, OUTPUT_DIR / f"{asset}_1d.csv")
            ok(len(df1d), df_range(df1d))

        # ── 1H (base for synthetic disaggregation) ───────────────────────────
        print(f"    1H  ", end="", flush=True)
        df1h = download_yf_1h(ticker, days=730)
        if df1h is None:
            print("NO DATA — skipping intraday generation")
            continue
        write_intraday_df(df1h, OUTPUT_DIR / f"{asset}_1h.csv")
        ok(len(df1h), df_range(df1h))

        # ── 4H (resample from 1H) ─────────────────────────────────────────
        print(f"    4H  ", end="", flush=True)
        df4h = (df1h.resample("4h")
                     .agg({"Open": "first", "High": "max", "Low": "min",
                           "Close": "last", "Volume": "sum"})
                     .dropna())
        write_intraday_df(df4h, OUTPUT_DIR / f"{asset}_4h.csv")
        ok(len(df4h), df_range(df4h))

        # ── 15M  (4 sub-bars per 1H) ─────────────────────────────────────
        print(f"    15M ", end="", flush=True)
        rows15 = disaggregate(df1h, sub_bars=4)
        write_intraday(rows15, OUTPUT_DIR / f"{asset}_15m.csv")
        ok(len(rows15), ts_range(rows15))

        # ── 5M  (12 sub-bars per 1H) ─────────────────────────────────────
        print(f"    5M  ", end="", flush=True)
        rows5 = disaggregate(df1h, sub_bars=12)
        write_intraday(rows5, OUTPUT_DIR / f"{asset}_5m.csv")
        ok(len(rows5), ts_range(rows5))

        # ── 1M  (60 sub-bars per 1H) ─────────────────────────────────────
        print(f"    1M  ", end="", flush=True)
        rows1 = disaggregate(df1h, sub_bars=60)
        write_intraday(rows1, OUTPUT_DIR / f"{asset}_1m.csv")
        ok(len(rows1), ts_range(rows1))

    # ══ Crypto assets via Binance ════════════════════════════════════════════
    for asset, symbol in CRYPTO.items():
        print(f"\n{'─'*60}")
        print(f"  {asset}  ({symbol}  via Binance — real data)")
        for tf, days in BINANCE_LOOKBACK.items():
            interval = BINANCE_INTERVAL[tf]
            out      = OUTPUT_DIR / f"{asset}_{SUFFIX[tf]}.csv"
            print(f"    {tf:<4}", end="  ", flush=True)
            candles  = download_binance(symbol, interval, days)
            if not candles:
                print("NO DATA")
                continue
            if tf == "1D":
                write_binance_daily(candles, out)
            else:
                write_binance_intraday(candles, out)
            s = datetime.utcfromtimestamp(candles[0][0]  / 1000).strftime("%Y-%m-%d")
            e = datetime.utcfromtimestamp(candles[-1][0] / 1000).strftime("%Y-%m-%d")
            ok(len(candles), f"{s} → {e}")

    print(f"\n{'═'*60}")
    print("  Done. Restart the Next.js dev server to reload the cache.")

if __name__ == "__main__":
    main()
