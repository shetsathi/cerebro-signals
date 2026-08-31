# Phase 1 Deployment Status

**Date**: 2026-08-31  
**Status**: ✅ READY FOR DEPLOYMENT  
**V1 Core**: Frozen (Parts 1-9 complete, 561 tests passing)

---

## ✅ What's Prepared

| Component | Status | Details |
|-----------|--------|---------|
| **Code** | ✅ Complete | V1 core frozen, all 9 parts implemented |
| **Tests** | ✅ 561/561 passing | 0 regressions, TypeScript 0 errors |
| **Configs** | ✅ Ready | railway.toml, vercel.json, .env |
| **Database Migration** | ✅ Ready | 002_signals_table.sql (3 tables, indexes, comments) |
| **Tokens** | ✅ Added to .env | Railway, Vercel, Supabase tokens |
| **Documentation** | ✅ Complete | DEPLOY_NOW.md, DEPLOYMENT.md |

---

## 🚀 NEXT: 3-Step Deployment (20 min)

### **Step 1: Supabase Migration** (5 min)
```
Dashboard: https://app.supabase.com
→ SQL Editor → New Query
→ Paste: migrations/002_signals_table.sql
→ Click Run
```

**Creates 3 tables**:
- `signals` (immutable audit trail)
- `signal_configs` (version tracking)
- `telegram_notifications` (delivery logs)

---

### **Step 2: Railway** (10 min)
```
Go: https://railway.app
→ New Project → Deploy from GitHub
→ Select: shetsathi/cerebro-signals
→ Wait for build (~2 min)
→ Add Environment Variables (from .env file)
→ Deploy
```

**Env vars to add** (copy from .env):
```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANGEL_ONE_API_KEY
ANGEL_ONE_CLIENT_CODE
ANGEL_ONE_PASSWORD
ANGEL_ONE_TOTP_SECRET
TELEGRAM_BOT_TOKEN (optional)
TELEGRAM_CHAT_ID (optional)
MONITOR_SYMBOLS
NODE_ENV=production
```

**Railway does**:
- Starts persistent Node.js server
- Connects to Angel One WebSocket (at 09:15 IST)
- Aggregates 5m candles
- Runs V1 Parts 1-9
- Persists signals to Supabase
- Sends Telegram alerts

---

### **Step 3: Vercel** (5 min)
```
Go: https://vercel.com
→ Add New → Import Git Repository
→ Select: shetsathi/cerebro-signals
→ Add Environment Variables (from .env file)
→ Deploy
```

**Env vars to add**:
```
SUPABASE_URL
SUPABASE_ANON_KEY
NODE_ENV=production
```

**Vercel does**:
- Serverless API endpoints
- Live signals dashboard
- Static HTML UI

---

## 🎯 Success Criteria

✅ **Supabase**:
- 3 tables created (signals, signal_configs, telegram_notifications)
- Indexes created
- Ready for signal persistence

✅ **Railway**:
- Build successful
- Server starts
- Logs show: "WebSocket connection established"

✅ **Vercel**:
- Deployment successful
- Dashboard URL live (e.g., cerebro-signals.vercel.app)
- API /health returns 200

✅ **Live Testing** (09:15 IST, next trading day):
- Railway: "WebSocket connected to Angel One"
- Railway: "Candle closed: NIFTY50 5m ..."
- Supabase: Signal row appears in table
- Vercel: Dashboard shows signal
- Telegram: Alert received (if enabled)

---

## 📊 Architecture After Deployment

```
Angel One SmartAPI (Live LTP)
    ↓
Railway (Persistent Server)
    ├─ TickAggregator (5m candles)
    ├─ V1 Parts 1-9 (deterministic pipeline)
    ├─ Signal Persistence (Supabase)
    └─ Telegram Alerts
    ↓
Supabase Database (Immutable Audit Trail)
    ├─ signals table
    ├─ signal_configs table
    └─ telegram_notifications table
    ↓
Vercel API + Dashboard
    ├─ /api/signals (REST endpoints)
    ├─ /api/health (status check)
    └─ /dashboard (live UI)
```

---

## 🔐 Security Notes

✅ **Credentials Protected**:
- Angel One creds: In .env (gitignored), loaded into Railway env
- Supabase keys: In .env (gitignored), loaded into Railway/Vercel env
- Telegram token: In .env (gitignored), loaded into Railway env
- **NEVER** in code, logs, or responses

✅ **Database**:
- Signal Entry/Stop/Target immutable (no updates after creation)
- Audit trail preserved (created_at, evaluation_time_utc, knowledge_time_utc)
- No credentials logged to telegram_notifications table

---

## ⏭️ What's NOT in Phase 1 (Phase 2+)

- ❌ Live price tracking (entry/SL/T1/T2 hit detection)
- ❌ Settings UI / credential management
- ❌ Outcome recording & P&L calculation
- ❌ T1/T2 (frozen Risk contract has single target only)
- ❌ Broker order execution
- ❌ Advanced analytics

These are P1+ features (future phases).

---

## 📞 Troubleshooting

**Railway WebSocket not connecting**:
- Verify Angel One credentials in env vars
- Check that market is open (09:15-15:30 IST)

**Vercel dashboard blank**:
- Check Supabase ANON_KEY is correct
- Verify signals are in database (Supabase dashboard)

**Supabase tables not created**:
- Verify SQL migration ran without errors
- Check SQL Editor results for error messages

**Telegram not sending**:
- Optional feature - can skip for now
- Requires bot token + chat ID if enabling

---

## ✨ You're Ready!

**Status**: Phase 1 is **FULLY PREPARED** and **PRODUCTION READY**

All code, configs, migrations, and documentation complete.

**Next action**: Follow the 3-step deployment guide above.

**Timeline**: ~20 minutes to live.

---

**Questions?** Review DEPLOY_NOW.md or DEPLOYMENT.md for details.

**Good luck!** 🚀
