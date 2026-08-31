# Phase 1 Deployment Guide

**Status**: Ready for deployment  
**Target**: Railway (persistent server) + Vercel (API + dashboard)  
**Timeline**: ~30 minutes setup  

---

## Pre-Deployment Checklist

- ✅ Code complete & tested (561 tests passing)
- ✅ Railway config created (railway.toml)
- ✅ Vercel config ready (vercel.json)
- ⏳ Supabase Vault secrets setup
- ⏳ Railway deployment
- ⏳ Vercel deployment
- ⏳ Database migrations
- ⏳ Telegram bot configuration

---

## 1. Supabase Setup (5 min)

### 1.1 Verify Supabase Project
```
Go to: https://app.supabase.com
Project: [your-project-name]
Confirm you have:
  - Project URL
  - Anon Key (public)
  - Service Role Key (private, for Vault)
```

### 1.2 Create Vault Secrets

**Via Supabase Dashboard**:
1. Go to: Settings → Vault → Secrets
2. Add 4 new secrets:

| Name | Value |
|------|-------|
| `angel_one_api_key` | `XP8jd2me` |
| `angel_one_client_code` | `A400840` |
| `angel_one_password` | `1833` |
| `angel_one_totp_secret` | `RCIDZOJNCJ3OCJ33T2ZETLE2OM` |

**Via SQL** (alternative):
```sql
-- Run in Supabase SQL Editor

-- Vault must be enabled (Settings → Extensions → vault)
INSERT INTO vault.secrets (name, secret) 
VALUES 
  ('angel_one_api_key', 'XP8jd2me'),
  ('angel_one_client_code', 'A400840'),
  ('angel_one_password', '1833'),
  ('angel_one_totp_secret', 'RCIDZOJNCJ3OCJ33T2ZETLE2OM');

-- Verify
SELECT * FROM vault.secrets;
```

### 1.3 Run Database Migration

**In Supabase SQL Editor**:
```
1. Go to: SQL Editor
2. New Query
3. Copy content from: migrations/002_signals_table.sql
4. Execute
5. Verify: Tables → signals, signal_configs, telegram_notifications
```

Or via CLI:
```bash
# (requires supabase-cli installed)
supabase db push migrations/002_signals_table.sql --project-ref your-project-id
```

**Verify**:
```sql
SELECT * FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('signals', 'signal_configs', 'telegram_notifications');
-- Should return 3 rows
```

---

## 2. Railway Deployment (10 min)

### 2.1 Connect Repository
```
1. Go to: https://railway.app
2. Create account or login
3. New Project → Deploy from GitHub
4. Connect repo: shetsathi/cerebro-signals
5. Select branch: main
```

### 2.2 Set Environment Variables
```
In Railway Dashboard → Variables:

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ... (your anon key)
SUPABASE_SERVICE_ROLE_KEY=eyJ... (your service role key)

ANGEL_ONE_API_KEY=XP8jd2me
ANGEL_ONE_CLIENT_CODE=A400840
ANGEL_ONE_PASSWORD=1833
ANGEL_ONE_TOTP_SECRET=RCIDZOJNCJ3OCJ33T2ZETLE2OM

TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id

MONITOR_SYMBOLS=NIFTY50,RELIANCE,INFY
NODE_ENV=production
```

### 2.3 Configure Start Command
```
Build Command: npm install && npm run build
Start Command: npm run start:live
Port: 3000 (default)
```

### 2.4 Deploy
```
Railway will:
1. Clone repo
2. Install dependencies
3. Run build
4. Start persistent server
5. Begin live signal pipeline
```

### 2.5 Monitor Logs
```
In Railway Dashboard → Logs:
- Watch for "WebSocket connected to Angel One"
- Watch for first candle aggregation
- Watch for "Signal persisted: [signal_id]"
- Watch for "Telegram notification sent" (if enabled)
```

---

## 3. Telegram Bot Setup (5 min, optional but recommended)

### 3.1 Create Bot
```
1. Open Telegram → Search "BotFather"
2. /newbot
3. Name: "Cerebro Signals"
4. Username: "cerebro_signals_bot" (or unique name)
5. Copy token: 123456789:ABCDEFghijklmnop...
```

### 3.2 Get Chat ID
```
1. Create Telegram group (or DM bot)
2. Send message to bot: @cerebro_signals_bot
3. Go to: https://api.telegram.org/bot[YOUR_BOT_TOKEN]/getUpdates
4. Find your chat ID in response
5. Copy chat_id value
```

### 3.3 Set Environment Variables
```
In Railway → Variables:

TELEGRAM_BOT_TOKEN=123456789:ABCDEFghijklmnop...
TELEGRAM_CHAT_ID=987654321
```

### 3.4 Verify
```
When persistent server starts, you'll receive a message:
"Cerebro Signals live. Monitoring: NIFTY50, RELIANCE, INFY"
```

---

## 4. Vercel Deployment (API + Dashboard)

### 4.1 Connect Repository
```
1. Go to: https://vercel.com
2. Import Project → GitHub
3. Select repo: shetsathi/cerebro-signals
4. Select branch: main
```

### 4.2 Configure Environment
```
Environment Variables:

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ... (your anon key)
NODE_ENV=production
```

### 4.3 Deploy
```
Vercel will:
1. Build TypeScript
2. Deploy to serverless
3. Serve API routes + dashboard
4. Provide domain: cerebro-signals.vercel.app
```

### 4.4 Verify
```
1. Visit: https://cerebro-signals.vercel.app
2. Should see: Cerebro Signals Dashboard
3. API route: https://cerebro-signals.vercel.app/api/health → {"status":"ok"}
4. Signals: https://cerebro-signals.vercel.app/api/signals
```

---

## 5. Live Testing (during market hours)

### 5.1 Pre-Market (Before 09:15 IST)
```
1. Railway logs: No "WebSocket connected" yet (Angel One offline)
2. Vercel API: /health should return 200
3. Dashboard: Should load
4. Telegram: No messages (market closed)
```

### 5.2 At Session Open (09:15 IST)
```
1. Railway logs:
   ✅ "WebSocket connected to Angel One"
   ✅ "Angel One authentication successful"
   ✅ "Subscribed to LTP: [symbols]"
   
2. Tick reception:
   ✅ "Tick received: NIFTY50@[price]"
   
3. First candle formation (09:20 IST):
   ✅ "Candle closed: NIFTY50 5m 2500.50-2501.00"
   ✅ "Persisted candle to DB"
   
4. First evaluation (5 min after each close):
   ✅ "LiveOrchestrator starting evaluation at [time]"
   ✅ "Parts 1-9 complete"
   ✅ "Signal generated: LONG / SHORT / WAIT"
   
5. If signal LONG/SHORT:
   ✅ "Signal persisted: [signal_id]"
   ✅ "Telegram message sent: [notification_id]"
   
6. Dashboard:
   ✅ Signals table should show new signal
   ✅ Auto-refresh every 5 seconds
   ✅ Click signal to see details
```

### 5.3 Monitor These Metrics
```
Railway Dashboard → Metrics:
  - CPU usage (should be <20% idle)
  - Memory (should be <300MB)
  - Requests (should match candle count)
  - Errors (should be 0)

Supabase Dashboard → Database:
  - signals table row count increasing
  - signal_configs table has entries
  - telegram_notifications table has delivery logs
```

### 5.4 Troubleshooting
```
Issue: "WebSocket connection failed"
  → Check Angel One credentials in Vault
  → Verify TOTP secret is correct
  → Check network connectivity

Issue: "No candles being aggregated"
  → Verify tick subscription in Angel One
  → Check TickAggregator logs for tick reception
  → Verify symbol is in MONITOR_SYMBOLS

Issue: "Signal not persisted"
  → Check Supabase connection (SUPABASE_URL, keys)
  → Verify signals table exists (migration ran)
  → Check signal uniqueness constraint (decision_id)

Issue: "Telegram message not sent"
  → Verify TELEGRAM_BOT_TOKEN is correct
  → Verify TELEGRAM_CHAT_ID is correct
  → Check bot has permissions in chat
  → Check TelegramService logs for errors
```

---

## 6. Post-Deployment Configuration

### 6.1 Backups
```
Supabase → Backups:
  Enable automatic backups (daily)
  Retention: 7 days
  Store: Supabase managed
```

### 6.2 Monitoring
```
Supabase:
  - Enable email alerts (on errors)
  
Railway:
  - Enable email notifications (on deployment failure)
  
Vercel:
  - Enable deployment notifications
```

### 6.3 Scaling
```
Railway:
  Start: Hobby tier ($5/month)
  If needed: Scale to Standard ($12/month) for higher bandwidth
  
Vercel:
  Free tier: 100GB bandwidth/month (sufficient for phase 1)
  Pro: If needed for multiple projects
```

---

## 7. Phase 1 Complete ✅

**Persistent Server** (Railway):
- ✅ Live WebSocket connection
- ✅ Session-aligned 5m candles
- ✅ Parts 1-9 deterministic pipeline
- ✅ Signal generation
- ✅ Telegram alerts

**API + Dashboard** (Vercel):
- ✅ REST endpoints
- ✅ Real-time signal display
- ✅ Static dashboard

**Database** (Supabase):
- ✅ Immutable signal audit trail
- ✅ Configuration versioning
- ✅ Telegram delivery logs

---

## Next: Phase 2 (When Approved)

- Live price tracking (entry/SL/T1/T2 hit detection)
- Settings UI (modify parameters without restart)
- Outcome recording (track closed trades)
- Multi-symbol UI
- Advanced analytics
- P&L calculation

---

**Questions?** Check logs in Railway/Vercel dashboards or review CLAUDE.md for architecture details.
