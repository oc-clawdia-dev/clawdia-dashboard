# Clawdia Dashboard Deployment Guide

## ✅ Completed Tasks

### 1. Security Fix 🔒
- ✅ Removed hardcoded MATON_API_KEY from frontend JavaScript
- ✅ Created Netlify Functions for API proxy:
  - `netlify/functions/sheets.js` - Google Sheets API proxy
  - `netlify/functions/wallet.js` - Solana RPC proxy  
- ✅ Updated `dashboard.js` to use proxy endpoints instead of direct API calls

### 2. Improved Dashboard Features 📊
- ✅ Real-time SOL price fetching from CoinGecko API
- ✅ Direct links to Google Sheets and Docs for better UX
- ✅ Error handling and fallback data display
- ✅ Responsive design improvements

### 3. Demo Version 🎯
- ✅ Created `demo.html` and `demo-dashboard.js` for static deployment
- ✅ Uses real Solana RPC data for wallet balances
- ✅ Mock trading and report data with clear demo indicators
- ✅ Works without server-side functions

### 4. Repository Setup 📂
- ✅ All changes committed to GitHub: `oc-clawdia/clawdia-dashboard`
- ✅ Proper git history with descriptive commits
- ✅ Ready for CI/CD deployment

## 🚀 Next Steps for Full Deployment

### Option A: Netlify (Recommended)
1. **Login to Netlify** manually via browser
2. **Create new site** from GitHub repository
3. **Set environment variables**:
   ```
   MATON_API_KEY=Z22mQgIRI3XJEBmlW_sknmvU_bu7f9VPYlBQ8jl9fBbxmL1wkbsXqB7-klAfXpA7XjHnRcZMMbsZQvQdaizjh1i7JmA_vE37L2YimutUiA
   ```
4. **Deploy** - Netlify will automatically build and deploy

### Option B: Manual Deployment Commands
```bash
cd /Users/oc.hikarimaru/.openclaw/workspace/dashboard

# Install and login to Netlify CLI (manual browser auth required)
netlify login

# Deploy to production
netlify deploy --prod --dir . --functions netlify/functions

# Set environment variables
netlify env:set MATON_API_KEY "Z22mQgIRI3XJEBmlW_sknmvU_bu7f9VPYlBQ8jl9fBbxmL1wkbsXqB7-klAfXpA7XjHnRcZMMbsZQvQdaizjh1i7JmA_vE37L2YimutUiA"
```

### Option C: Demo Deployment
The demo version is ready for deployment on any static hosting service:
- Uses `demo.html` as entry point
- Client-side only (no server functions needed)
- Real wallet data + mock trading data

## 📋 File Structure
```
dashboard/
├── index.html              # Main dashboard (requires Netlify Functions)
├── demo.html               # Demo version (static deployment ready)
├── dashboard.js            # Main app (uses Netlify Functions)
├── demo-dashboard.js       # Demo app (client-side only)
├── styles.css              # Shared styles
├── netlify.toml            # Netlify configuration
├── package.json            # Dependencies
└── netlify/
    └── functions/
        ├── sheets.js       # Google Sheets API proxy
        └── wallet.js       # Solana RPC proxy
```

## 🔐 Security Notes
- API keys are now properly secured in environment variables
- No sensitive data exposed in frontend code
- CORS headers properly configured in functions
- Direct links to Google resources for transparency

## 📊 Data Sources
- **Portfolio Balance**: Real-time from Solana RPC
- **SOL Price**: CoinGecko public API  
- **Trading History**: Google Sheets via Maton API (server-side)
- **Daily Reports**: Google Sheets via Maton API (server-side)
- **Project Overview**: Direct Google Docs links

## 🎯 Expected Functionality After Full Deployment
1. ✅ Real-time wallet balance display (SOL + USDC)
2. ✅ Live trading history from Google Sheets
3. ✅ Daily reports from Google Sheets
4. ✅ Portfolio chart visualization
5. ✅ Direct links to Google Docs/Sheets
6. ✅ Secure API key handling
7. ✅ Auto-refresh every 5 minutes

---

**Status**: Ready for deployment, manual authentication step required for Netlify login