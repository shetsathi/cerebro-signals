# Phase 1 Live Deployment — ACTION ITEMS

**Status**: Ready to deploy  
**Timeline**: Complete steps 1-6 in ~30 minutes  
**Start**: Now  

---

## ✅ ALREADY DONE

- ✅ V1 Core (Parts 1-9) complete & frozen
- ✅ 561 tests passing
- ✅ TypeScript build: 0 errors
- ✅ Code complete & reviewed
- ✅ Railway config created (railway.toml)
- ✅ Vercel config updated (vercel.json)
- ✅ Telegram optional support added
- ✅ Database migrations ready (002_signals_table.sql)
- ✅ .env template prepared

---

## 🚀 DO THIS NOW (In Order)

### STEP 1: Set Up Supabase Vault (5 min)

**Go to**: https://app.supabase.com → Your Project

**Add 4 Vault Secrets** (Settings → Vault → Secrets):

```
Name: angel_one_api_key
Value: XP8jd2me

Name: angel_one_client_code
Value: A400840

Name: angel_one_password
Value: 1833

Name: angel_one_totp_secret
Value: RCIDZOJNCJ3OCJ33T2ZETLE2OM
```

**Test**: Go to SQL Editor, run:
```sql
SELECT * FROM vault.secrets;
-- Should show 4 rows
```

---

### STEP 2: Run Database Migration (3 min)

**Go to**: https://app.supabase.com → SQL Editor → New Query

**Copy & Paste**:
```sql
-- Copy from: migrations/002_signals_table.sql
-- (entire file content)
```

**Execute** ✓

**Verify**: Go to Database → Tables, should see:
- signals
- signal_configs
- telegram_notifications

---

### STEP 3: Connect Railway (10 min)

**Go to**: https://railway.app → New Project → Deploy from GitHub

**Select**:
- Repository: shetsathi/cerebro-signals
- Branch: main

**Wait**: First build complete (~2 min)

**Set Environment Variables** (Railway Dashboard → Variables):

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=[COPY FROM SUPABASE SETTINGS → API]
SUPABASE_SERVICE_ROLE_KEY=[COPY FROM SUPABASE SETTINGS → API]

ANGEL_ONE_API_KEY=XP8jd2me
ANGEL_ONE_CLIENT_CODE=A400840
ANGEL_ONE_PASSWORD=1833
ANGEL_ONE_TOTP_SECRET=RCIDZOJNCJ3OCJ33T2ZETLE2OM

TELEGRAM_BOT_TOKEN=[CREATE BOT VIA BOTFATHER]
TELEGRAM_CHAT_ID=[YOUR CHAT ID]

MONITOR_SYMBOLS=NIFTY50,RELIANCE,INFY
NODE_ENV=production
```

**Deploy**: Click "Deploy"

**Wait**: ~3 min for build & start

**Check Logs**: Should see:
```
> npm run start:live
...
[PERSISTENT SERVER] Starting live signal pipeline
[ANGEL ONE] Initializing client
```

**Note**: Will be waiting for 09:15 IST market open (no WebSocket connection outside market hours)

---

### STEP 4: Connect Vercel (5 min)

**Go to**: https://vercel.com → Add New → Project → Import Git Repository

**Select**:
- Repository: shetsathi/cerebro-signals
- Branch: main

**Set Environment Variables** (Vercel Dashboard → Settings → Environment Variables):

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=[COPY FROM SUPABASE]
NODE_ENV=production
```

**Deploy**: Click "Deploy"

**Wait**: ~2 min

**Test**: Visit dashboard:
```
https://your-vercel-domain.vercel.app
OR
cerebro-signals.vercel.app (if that's the name)
```

Should see: Cerebro Signals Dashboard

**Test API**:
```
https://your-vercel-domain.vercel.app/api/health
Should return: {"status":"ok"}
```

---

### STEP 5: Set Up Telegram Bot (5 min, optional)

**If you want Telegram alerts**:

1. Open Telegram → Search "BotFather"
2. Send: `/newbot`
3. Name: `Cerebro Signals`
4. Username: `cerebro_signals_bot` (or unique)
5. **Copy bot token**: `123456789:ABCDEFghijklmnop...`
6. Send to bot: `/start` (any message)
7. Get chat ID:
   ```
   Go to: https://api.telegram.org/bot[YOUR_TOKEN]/getUpdates
   Find "chat":{"id":your_chat_id_here}
   Copy the ID
   ```
8. Update Railway environment:
   ```
   TELEGRAM_BOT_TOKEN=123456789:ABCDEFghijklmnop...
   TELEGRAM_CHAT_ID=987654321
   ```
9. Railway will restart automatically

**Test**: When market opens (09:15 IST), you should receive:
```
Cerebro Signals Live Pipeline Started
Monitoring: NIFTY50, RELIANCE, INFY
```

---

### STEP 6: Verify Deployment (During Market Hours)

**Timeline**: NSE opens 09:15 IST

**When market opens, watch for**:

**Railway Logs** (https://railway.app → Logs):
```
✅ [ANGEL ONE] WebSocket connected
✅ [ANGEL ONE] Authentication successful
✅ [TICK AGGREGATOR] Tick received: NIFTY50@17500.00
✅ [CANDLE] Closed: NIFTY50 5m close@17500.50
✅ [ORCHESTRATOR] Parts 1-9 complete
✅ [SIGNAL] Generated: LONG / SHORT / WAIT
✅ [DB] Signal persisted: sig_abc123...
✅ [TELEGRAM] Message sent
```

**Vercel Dashboard**:
```
https://your-domain.vercel.app
Signals table should show new signal
```

**Telegram** (if enabled):
```
Cerebro Signals Alert
═════════════════════
Action: LONG
Symbol: NIFTY50
Entry: 17500.50
Stop: 17480.00
Target: 17520.00
R:R: 2.0
```

---

## 🎯 Success Criteria

✅ All 3 services deployed:
- Railway (persistent server running)
- Vercel (API + dashboard live)
- Supabase (database populated)

✅ At 09:15 IST:
- WebSocket connected
- First candle received
- Signal generated (or WAIT)
- Signal in database
- Dashboard shows signal
- Telegram alert (if enabled)

✅ Logs show no errors

---

## 📞 Troubleshooting

**"WebSocket connection failed"**
→ Check Angel One credentials in Vault

**"Database connection error"**
→ Verify SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

**"No signals appearing"**
→ Market hours? (09:15-15:30 IST only)
→ Check MONITOR_SYMBOLS

**"Dashboard showing nothing"**
→ Check SUPABASE_ANON_KEY on Vercel
→ Signals in database? Query: `SELECT * FROM signals LIMIT 10;`

**"Telegram not working"**
→ Check bot token & chat ID
→ Bot added to chat?
→ /start message sent?

---

## 📖 Documentation

For detailed info, see:
- **DEPLOYMENT.md** — Full deployment guide
- **CLAUDE.md** — Architecture & design docs
- **Migration SQL** — `migrations/002_signals_table.sql`

---

## 🎉 YOU'RE LIVE!

Once all steps complete, Phase 1 is operational:

✅ Live market data (NSE)  
✅ Deterministic V1 engine (Parts 1-9)  
✅ Real-time signal generation  
✅ Immutable audit trail  
✅ Telegram alerts  
✅ Dashboard display  

Monitoring: NIFTY50, RELIANCE, INFY  
Timeframe: 5m candles, session-aligned  
Update frequency: Every 5 minutes (at candle close)  

---

**Questions?** → Review logs in Railway/Vercel dashboards  
**Next phase?** → Start Phase 2 (P&L tracking, live price monitoring)
