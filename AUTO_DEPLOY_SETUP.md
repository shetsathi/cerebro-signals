# Auto-Deploy & Smart Restart Setup

## ✅ What's Configured

### 1. Auto-Deploy on Git Push
- **How**: GitHub Actions workflow (`.github/workflows/deploy.yml`)
- **When**: Every time you push to `main` branch
- **Result**: Automatic deployment to Railway (no manual redeploy needed)

### 2. Smart Auto-Restart (Market Hours Only)
- **How**: Health monitor service (`src/services/railway-health-monitor.ts`)
- **When**: Only during market hours (09:15-15:00 IST, Monday-Friday)
- **Why**: Preserves free tier limit (10 restarts/month)
- **Respects**: 5-minute minimum interval between restarts

---

## 🔧 Setup Required (One-Time)

### Step 1: Add RAILWAY_TOKEN to GitHub Secrets

1. Go to: https://github.com/shetsathi/cerebro-signals/settings/secrets/actions
2. Click **"New repository secret"**
3. Name: `RAILWAY_TOKEN`
4. Value: Copy from your Railway dashboard → Account → Tokens
   - Go to: https://railway.app/account/tokens
   - Create new token (if needed)
   - Copy the token value
5. Click **"Add secret"** ✓

### Step 2: Enable GitHub Actions

1. Go to: https://github.com/shetsathi/cerebro-signals/actions
2. Workflows should show: **"Auto Deploy to Railway"**
3. If disabled, click **"Enable workflows"**

### Step 3: Verify Setup

1. Make a small commit to `main` (e.g., update README)
2. Push to GitHub: `git push origin main`
3. Check: https://github.com/shetsathi/cerebro-signals/actions
4. Should show workflow "Auto Deploy to Railway" running
5. Check Railway dashboard - new deployment should start automatically

---

## 📊 How It Works

### Auto-Deploy Flow
```
Your Code
    ↓
git push origin main
    ↓
GitHub Actions triggered
    ↓
railway deploy --force
    ↓
Railway builds & deploys automatically
    ↓
No manual redeploy needed! ✅
```

### Smart Restart Flow
```
Service crashes
    ↓
Health monitor detects (every 30 sec)
    ↓
Is it market hours? (09:15-15:00 IST, Mon-Fri)
    ├─ YES → Is 5+ min since last restart?
    │  ├─ YES → Trigger restart ✅
    │  └─ NO → Wait & retry
    └─ NO → Defer restart until market opens
    ↓
Service restarts (saves free tier limit)
```

---

## ✨ Benefits

✅ **Zero Manual Deploys**: Push to main → auto-deploy  
✅ **Smart Restarts**: Only when needed, during market hours  
✅ **Free Tier Safe**: Won't waste your 10 monthly restarts  
✅ **Developer Friendly**: No restarts during development/off-hours  
✅ **Market Hours Focused**: Protects production during trading hours  

---

## 📋 Configuration Details

### GitHub Actions Workflow
**File**: `.github/workflows/deploy.yml`

Triggers on:
- `push` to `main` branch
- Runs: `railway deploy --force`
- Uses: `RAILWAY_TOKEN` secret

### Health Monitor Service
**File**: `src/services/railway-health-monitor.ts`

Features:
- Checks `/api/health` endpoint every 30 seconds
- Only allows restarts during: 09:15-15:00 IST, Mon-Fri
- Minimum 5-minute interval between restarts
- Respects Railway free tier (10 restarts/month)
- Logs all health checks and restart attempts

**Enabled by**: `ENABLE_HEALTH_MONITOR=true` environment variable

---

## 🚀 Test It

### Test Auto-Deploy
```bash
# Make a small change
echo "# Updated at $(date)" >> README.md

# Commit & push
git add README.md
git commit -m "test: trigger auto-deploy"
git push origin main

# Watch: https://github.com/shetsathi/cerebro-signals/actions
# Should see workflow running
```

### Test Smart Restart
Service will automatically monitor health during market hours only.

---

## 📞 Troubleshooting

**GitHub Actions not triggering?**
- Check: https://github.com/shetsathi/cerebro-signals/actions
- Verify: RAILWAY_TOKEN secret is set
- Verify: Workflow file exists at `.github/workflows/deploy.yml`

**Railway deploy failing?**
- Check Railway logs: https://railway.app/project/[project-id]
- May need to rebuild cache (same as before)

**Health monitor not working?**
- Check Railway environment variable: `ENABLE_HEALTH_MONITOR=true`
- Check logs for health check messages
- Verify `/api/health` endpoint is working

---

## 📅 Market Hours Logic

**Active Restart Window**:
- ✅ Monday 09:15-15:00 IST
- ✅ Tuesday 09:15-15:00 IST
- ✅ Wednesday 09:15-15:00 IST
- ✅ Thursday 09:15-15:00 IST
- ✅ Friday 09:15-15:00 IST
- ❌ Saturday (no trading)
- ❌ Sunday (no trading)
- ❌ Outside 09:15-15:00 IST (development hours)

**During off-hours**: Crashes are logged but NOT restarted (preserves limits)

---

## 💡 Pro Tips

1. **Push often**: Every push auto-deploys, so test locally first
2. **Watch Actions**: https://github.com/shetsathi/cerebro-signals/actions
3. **Monitor free tier**: Track restart count in Railway dashboard
4. **Disable if needed**: Set `ENABLE_HEALTH_MONITOR=false` to disable restarts temporarily

---

## 🎯 Result

After setup:
- ✅ Code changes → Auto-deployed instantly
- ✅ Crashes during market → Auto-restarted (with limits)
- ✅ Crashes off-market → Logged, deferred
- ✅ Free tier protected → Won't waste restart quota

**You're now fully automated!** 🚀
