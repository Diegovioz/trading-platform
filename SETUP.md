# Trading Platform — Setup Guide

## Prerequisites
- Node.js 18+
- A Supabase project (free tier works)
- Vercel account (free tier works)

---

## 1. Supabase Setup

### 1a. Create a project
Go to [supabase.com](https://supabase.com) → New Project. Note your **Project URL** and **anon public key** (Settings → API).

### 1b. Run the schema
Go to **SQL Editor → New query**, paste the entire contents of `supabase/schema.sql`, and click **Run**.

### 1c. Promote your admin account
After signing up via the app, run this in SQL Editor:
```sql
UPDATE public.profiles SET role = 'admin' WHERE email = 'your@email.com';
```

### 1d. Configure Auth
- Go to **Authentication → URL Configuration**
- Set **Site URL** to your Vercel URL (or `http://localhost:3000` for local dev)
- Add `https://yourdomain.vercel.app/auth/callback` to **Redirect URLs**

---

## 2. Local Development

```bash
# 1. Clone and enter the project
cd /Users/diegovio/Desktop/TradingPlatform

# 2. Install dependencies
npm install

# 3. Copy env file and fill in your values
cp .env.example .env.local
# Edit .env.local:
#   NEXT_PUBLIC_SUPABASE_URL=...
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
#   GATE_PASSWORD=your-team-password

# 4. Add OHLC data
# Copy your CSV files from the old backend into public/data/
# Files must be named: NQ_1d.csv, BTC_1h.csv, etc.
# (see below for naming convention)

# 5. Start dev server
npm run dev
# → http://localhost:3000
```

### CSV file naming
| Timeframe | Suffix | Example |
|-----------|--------|---------|
| 1D | `_1d.csv` | `NQ_1d.csv` |
| 4H | `_4h.csv` | `BTC_4h.csv` |
| 1H | `_1h.csv` | `ETH_1h.csv` |
| 15M | `_15m.csv` | `XAUUSD_15m.csv` |
| 5M | `_5m.csv` | `NVDA_5m.csv` |

**Daily format** (`date,open,high,low,close,volume`):
```
2020-01-02,8820.00,8850.00,8800.00,8835.00,12345
```

**Intraday format** (`timestamp,open,high,low,close,volume`) — Unix seconds:
```
1577836800,8820.00,8850.00,8800.00,8835.00,1234
```

---

## 3. Copy Data from Old App

```bash
# From the old trading dashboard backend
cp "/Users/diegovio/Desktop/App CLAUDE/trading-dashboard/backend/public/data/"*.csv \
   "/Users/diegovio/Desktop/TradingPlatform/public/data/"
```

The old app uses the same CSV format, so files can be copied directly.

---

## 4. Vercel Deployment

### 4a. Push to GitHub
```bash
cd /Users/diegovio/Desktop/TradingPlatform
git init
git add .
git commit -m "Initial commit"
# Create a GitHub repo and push
git remote add origin https://github.com/you/trading-platform.git
git push -u origin main
```

### 4b. Import in Vercel
1. Go to [vercel.com](https://vercel.com) → Add New Project
2. Import your GitHub repo
3. Framework: **Next.js** (auto-detected)

### 4c. Add Environment Variables
In Vercel → Project → Settings → Environment Variables, add:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `GATE_PASSWORD` | Your team password |

### 4d. Deploy
Click **Deploy**. Your app will be live at `https://your-project.vercel.app`.

---

## 5. First Login Flow

1. Navigate to your app URL
2. Enter the **team password** (gate page)
3. Click **Sign up** → enter your name, email, password
4. Check your email and click the confirmation link
5. Sign in → you're on the dashboard
6. Promote yourself to admin via SQL (step 1c above)

---

## Architecture

```
app/
  gate/          → Password gate (before auth)
  auth/          → Login / Signup / Callback
  (app)/         → Protected app (requires auth)
    dashboard/   → Stats overview
    journal/     → Trade journal
    backtesting/ → Replay simulator
    admin/       → Admin-only panel

components/
  layout/Sidebar.tsx      → Navigation sidebar
  journal/TradeTable.tsx  → Sortable trade table
  journal/AddTradeForm.tsx → Trade entry form
  backtesting/BacktestChart.tsx → TradingView LWC v5 chart

hooks/
  useProfile.ts    → Current user profile + role
  useTrades.ts     → Journal CRUD
  useBacktest.ts   → Full backtest session state

supabase/schema.sql  → Tables, RLS, triggers
```

## Security Notes
- `GATE_PASSWORD` is stored in an httpOnly cookie — never exposed to JS
- RLS is enforced at the database level — traders can't read others' trades
- Admin role is set only via SQL — can't be self-assigned
- JWT is never stored in localStorage (Supabase SSR uses cookies)
