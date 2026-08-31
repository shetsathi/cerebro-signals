#!/bin/bash

# Phase 1 Deployment Script
# Deploys to Railway (persistent server) and Vercel (API + dashboard)

set -e

echo "🚀 PHASE 1 DEPLOYMENT - Cerebro Signals"
echo "========================================"

# Load tokens
export RAILWAY_TOKEN="c0f7bfcc-d3b5-4863-ad03-c439f741d753"
export VERCEL_TOKEN="vcp_2TbFmzf9xmPxBnqqlA28uBcJicZ9WxDXKSzSd2emjwvwY5x3iL0odcNd"

echo ""
echo "📦 STEP 1: Vercel Deployment (API + Dashboard)"
echo "=============================================="

# Deploy to Vercel
vercel deploy \
  --token "$VERCEL_TOKEN" \
  --prod \
  --env SUPABASE_URL="https://ykpcgaeeckeywsgvalqp.supabase.co" \
  --env SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrcGNnYWVlY2tleXdzZ3ZhbHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTczNDU2MzAsImV4cCI6MTk5NDU0NTYzMH0.z7s3K5M9Q-xYz5pL8Z3N6R4W9T2V5C8X1A4B7D0E3F6" \
  --env NODE_ENV="production"

echo "✅ Vercel deployment complete"

echo ""
echo "🚂 STEP 2: Railway Deployment (Persistent Server)"
echo "================================================="

# Deploy to Railway
railway deploy \
  --token "$RAILWAY_TOKEN"

echo "✅ Railway deployment complete"

echo ""
echo "✨ DEPLOYMENT SUCCESSFUL!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Go to Supabase dashboard"
echo "2. SQL Editor → New Query"
echo "3. Paste migrations/002_signals_table.sql"
echo "4. Click Run"
echo ""
echo "5. Check Railway logs for live signal pipeline"
echo "6. Visit Vercel dashboard URL for live signals"
echo ""
