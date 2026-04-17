#!/usr/bin/env python3
"""
Download REAL historical OHLCV data for all assets.

Usage:
    pip install yfinance pandas requests
    python3 scripts/download_data.py

Sources:
    BTC, ETH   → Binance public API  (1m, 5m, 15m, 1h, 4h, 1d) — real tick data
    NQ, XAUUSD, NVDA, SOFI, TSLA:
        1D       → yfinance (max history, 20+ years)
        4H / 1H  → yfinance (up to 730 days)
        15M      → yfinance (up to 60 days — Yahoo Finance limit)
        5M / 1M  → NOT GENERATED (no free real-data source with sufficient history)

NOTE: Non-crypto 5M/1M are intentionally skipped.
      The API will return 404 for those timeframes until synthetic re-enabled.
"""

import csv
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import pandas as pd
    import requests
    import yfinance as yf
except ImportError:
    sys.exit("Missing deps. Run:  pip install yfinance pandas requests")

OUTPUT_DIR = Path(__file__).parent.parent / "public" / "data"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ─── Asset config ─────────────────────────────────────────────────────────────

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

BINANCE_LOOKBACK = {
    "1D":  1825,   # 5 years
    "4H":  1825,
    "1H":  730,
    "15M": 365,
    "5M":  90,
    "1M":  30,
}

BINANCE_INTERVAL = {
    "1D": "1d", "4H": "4h", "1H": "1h",
    "15M": "15m", "5M": "5m", "1M": "1m",
}

FILE_SUFFIX = {
    "1D": "1d", "4H": "4h", "1H": "1h",
    "15M": "15m", "5M": "5m", "1M": "1m",
}

# ─── Binance ──────────────────────────────────────────────────────────────────

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
            r.raise_for_status()
            data = r.json()
            if not data or not isinstance(data, list):
                break
            candles.extend(data)
            if len(data) < 1000:
                break
            cur = data[-1][0] + 1
            time.sleep(0.1)
        except Exception as e:
            print(f"    Binance error ({symbol} {interval}): {e}")
            break

    return candles

def write_binance_intraday(candles: list, path: Path):
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["timestamp", "open", "high", "low", "close", "volume"])
        for c in candles:
            w.writerow([
                c[0] // 1000,
                round(float(c[1]), 6), round(float(c[2]), 6),
                round(float(c[3]), 6), round(float(c[4]), 6),
                int(float(c[5])),
            ])

def write_binance_daily(candles: list, path: Path):
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["date", "open", "high", "low", "close", "volume"])
        for c in candles:
            dt = datetime.utcfromtimestamp(c[0] / 1000).strftime("%Y-%m-%d")
            w.writerow([
                dt,
                round(float(c[1]), 6), round(float(c[2]), 6),
                round(float(c[3]), 6), round(float(c[4]), 6),
                int(float(c[5])),
            ])

# ─── yfinance ─────────────────────────────────────────────────────────────────

def _flatten_columns(df):
    """Flatten MultiIndex columns returned by newer yfinance versions."""
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    return df

def download_yf_daily(ticker: str) -> "pd.DataFrame | None":
    try:
        df = yf.download(ticker, period="max", interval="1d",
                         progress=False, auto_adjust=True)
        return _flatten_columns(df) if df is not None and not df.empty else None
    except Exception as e:
        print(f"    yfinance 1D error: {e}")
        return None

def download_yf_intraday(ticker: str, interval: str, days: int) -> "pd.DataFrame | None":
    """
    Download intraday data in 59-day chunks to work around Yahoo Finance limits.
    interval: '1h', '15m'
    days:     max days of history (730 for 1H, 60 for 15M)
    """
    now   = datetime.now(tz=timezone.utc)
    start = now - timedelta(days=days)
    dfs   = []
    cur   = start

    while cur < now:
        end = min(cur + timedelta(days=59), now)
        try:
            df = yf.download(
                ticker,
                start=cur.strftime("%Y-%m-%d"),
                end=end.strftime("%Y-%m-%d"),
                interval=interval,
                progress=False,
                auto_adjust=True,
            )
            if df is not None and not df.empty:
                dfs.append(_flatten_columns(df))
        except Exception as e:
            print(f"    yfinance {interval} chunk {cur.date()}→{end.date()} failed: {e}")
        cur = end
        time.sleep(0.4)

    if not dfs:
        return None
    df = pd.concat(dfs)
    df = df[~df.index.duplicated(keep="first")].sort_index()
    return df if not df.empty else None

def df_to_intraday_rows(df: "pd.DataFrame") -> list:
    rows = []
    for ts, row in df.iterrows():
        try:
            rows.append({
                "timestamp": int(ts.timestamp()),
                "open":  round(float(row["Open"]),  6),
                "high":  round(float(row["High"]),  6),
                "low":   round(float(row["Low"]),   6),
                "close": round(float(row["Close"]), 6),
                "volume": int(row["Volume"]),
            })
        except (ValueError, KeyError):
            continue
    return rows

def write_intraday(rows: list, path: Path):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["timestamp", "open", "high", "low", "close", "volume"])
        w.writeheader()
        w.writerows(rows)

def write_daily_df(df: "pd.DataFrame", path: Path):
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["date", "open", "high", "low", "close", "volume"])
        for ts, row in df.iterrows():
            try:
                w.writerow([
                    ts.strftime("%Y-%m-%d"),
                    round(float(row["Open"]),  6),
                    round(float(row["High"]),  6),
                    round(float(row["Low"]),   6),
                    round(float(row["Close"]), 6),
                    int(row["Volume"]),
                ])
            except (ValueError, KeyError):
                continue

def resample_4h(df_1h: "pd.DataFrame") -> "pd.DataFrame":
    return (df_1h
            .resample("4h")
            .agg({"Open": "first", "High": "max", "Low": "min",
                  "Close": "last", "Volume": "sum"})
            .dropna())

# ─── Validation ───────────────────────────────────────────────────────────────

def validate_intraday(rows: list, label: str) -> bool:
    ok = True
    for i, r in enumerate(rows):
        o, h, l, c = r["open"], r["high"], r["low"], r["close"]
        if not (l <= o <= h and l <= c <= h):
            print(f"    [VALIDATION FAIL] Row {i}: OHLC inconsistency  O={o} H={h} L={l} C={c}")
            ok = False
        if i > 0 and r["timestamp"] <= rows[i-1]["timestamp"]:
            print(f"    [VALIDATION FAIL] Row {i}: timestamp not strictly increasing")
            ok = False
    if ok:
        s = datetime.utcfromtimestamp(rows[0]["timestamp"]).strftime("%Y-%m-%d")
        e = datetime.utcfromtimestamp(rows[-1]["timestamp"]).strftime("%Y-%m-%d")
        print(f"    ✓ {len(rows):>8,} candles   {s} → {e}")
    return ok

def validate_daily(df: "pd.DataFrame", label: str) -> bool:
    ok = True
    for ts, row in df.iterrows():
        o, h, l, c = float(row["Open"]), float(row["High"]), float(row["Low"]), float(row["Close"])
        if not (l <= o <= h and l <= c <= h):
            print(f"    [VALIDATION FAIL] {ts.date()}: OHLC inconsistency O={o} H={h} L={l} C={c}")
            ok = False
    if ok:
        print(f"    ✓ {len(df):>8,} candles   {df.index[0].strftime('%Y-%m-%d')} → {df.index[-1].strftime('%Y-%m-%d')}")
    return ok

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  REAL DATA DOWNLOAD — no synthetic generation")
    print("=" * 60)

    # ── Crypto via Binance (REAL intraday for all timeframes) ─────────────────
    for asset, symbol in CRYPTO.items():
        print(f"\n{'─'*60}")
        print(f"  {asset}  ({symbol}  via Binance — 100% real data)")

        for tf, days in BINANCE_LOOKBACK.items():
            interval = BINANCE_INTERVAL[tf]
            out      = OUTPUT_DIR / f"{asset}_{FILE_SUFFIX[tf]}.csv"
            print(f"    {tf:<4} ", end="", flush=True)

            candles = download_binance(symbol, interval, days)
            if not candles:
                print("  NO DATA")
                continue

            if tf == "1D":
                write_binance_daily(candles, out)
                s = datetime.utcfromtimestamp(candles[0][0]  / 1000).strftime("%Y-%m-%d")
                e = datetime.utcfromtimestamp(candles[-1][0] / 1000).strftime("%Y-%m-%d")
                print(f"  ✓ {len(candles):>8,} candles   {s} → {e}")
            else:
                write_binance_intraday(candles, out)
                rows = df_to_intraday_rows(pd.read_csv(out))
                validate_intraday(rows, f"{asset} {tf}")

    # ── Traditional assets via yfinance (REAL data, limited intraday) ──────────
    for asset, ticker in TRADITIONAL.items():
        print(f"\n{'─'*60}")
        print(f"  {asset}  ({ticker}  via yfinance)")

        # 1D — full history
        print(f"    1D   ", end="", flush=True)
        df1d = download_yf_daily(ticker)
        if df1d is None:
            print("  NO DATA")
        else:
            write_daily_df(df1d, OUTPUT_DIR / f"{asset}_1d.csv")
            validate_daily(df1d, f"{asset} 1D")

        # 1H — up to 730 days
        print(f"    1H   ", end="", flush=True)
        df1h = download_yf_intraday(ticker, "1h", days=730)
        if df1h is None:
            print("  NO DATA — skipping 4H and 15M")
            continue

        rows1h = df_to_intraday_rows(df1h)
        write_intraday(rows1h, OUTPUT_DIR / f"{asset}_1h.csv")
        validate_intraday(rows1h, f"{asset} 1H")

        # 4H — resampled from real 1H
        print(f"    4H   ", end="", flush=True)
        df4h     = resample_4h(df1h)
        rows4h   = df_to_intraday_rows(df4h)
        write_intraday(rows4h, OUTPUT_DIR / f"{asset}_4h.csv")
        validate_intraday(rows4h, f"{asset} 4H")

        # 15M — real data, Yahoo Finance limit: ~60 days
        print(f"    15M  ", end="", flush=True)
        df15 = download_yf_intraday(ticker, "15m", days=59)
        if df15 is None:
            print("  NO DATA")
        else:
            rows15 = df_to_intraday_rows(df15)
            write_intraday(rows15, OUTPUT_DIR / f"{asset}_15m.csv")
            validate_intraday(rows15, f"{asset} 15M")

        # 5M / 1M — skipped (no free real-data source)
        print(f"    5M   SKIPPED  (no free real-data source; use synthetic when needed)")
        print(f"    1M   SKIPPED  (no free real-data source; use synthetic when needed)")

    print(f"\n{'='*60}")
    print("  Done.")
    print("  → Restart the Next.js dev server to flush the in-memory cache.")
    print("  → Non-crypto 5M/1M will return 404 until synthetic re-enabled.")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    main()
