# 🔴 Kill-Switch Instructions

## Overview

The widget has a **kill-switch** system that allows you to instantly disable it for all users.

## How It Works

The widget checks feature flags on every page load:
- ✅ **`WIDGET_ENABLED=true`** (default) → Widget works normally
- 🔴 **`WIDGET_ENABLED=false`** → Widget is COMPLETELY DISABLED for ALL users
- 🔧 **`REQUIRE_F1=true`** → Widget only works with `?f=1` in URL (testing mode)
- 🚀 **`REQUIRE_F1=false`** → Widget works for everyone (production mode)

---

## 🚨 EMERGENCY: Disable Widget Immediately

### Option 1: Via Vercel Dashboard (FASTEST - 30 seconds)

1. Go to: https://vercel.com/doingz/kunstpakket-ai-search
2. Click **Settings** → **Environment Variables**
3. Add/Edit: `WIDGET_ENABLED` = `false`
4. Click **Save**
5. Go to **Deployments** → Click **...** on latest → **Redeploy**
6. ✅ Widget is now disabled for all users within 1 minute!

### Option 2: Via Vercel CLI (2 minutes)

```bash
# Set environment variable
vercel env add WIDGET_ENABLED false production

# Redeploy
vercel --prod
```

### Option 3: Via Code (5 minutes)

```bash
# Add to .env
echo "WIDGET_ENABLED=false" >> .env

# Deploy
git add .env
git commit -m "EMERGENCY: Disable widget"
git push
```

---

## 🚀 GO LIVE: Enable Widget for Everyone

### Step 1: Set Environment Variables

```bash
# Via Vercel Dashboard:
WIDGET_ENABLED=true
REQUIRE_F1=false
```

**OR via CLI:**

```bash
vercel env add WIDGET_ENABLED true production
vercel env add REQUIRE_F1 false production
vercel --prod
```

### Step 2: Deploy

Widget will now be visible for **ALL visitors** without `?f=1`!

---

## 🔧 TESTING MODE: Require ?f=1

### Use this for testing before full launch:

```bash
# Via Vercel Dashboard:
WIDGET_ENABLED=true
REQUIRE_F1=true
```

**Now:**
- ❌ Normal visitors: Widget hidden
- ✅ With `?f=1`: Widget visible (persists in localStorage)

### Enable Testing Mode:

1. Visit: `https://www.kunstpakket.nl/?f=1`
2. Widget appears!
3. Navigate around → Widget stays visible
4. Clear localStorage or new browser → Widget hidden again

---

## 📊 Status Check

### Check if widget is enabled:

```bash
curl https://kunstpakket-ai-search.vercel.app/api/feature-flags
```

**Response:**

```json
{
  "success": true,
  "flags": {
    "widget_enabled": true,  // ← Main kill-switch
    "require_f1": false      // ← Testing mode
  }
}
```

---

## 🎯 Common Scenarios

### Scenario 1: Launch Day
```bash
WIDGET_ENABLED=true
REQUIRE_F1=false
```
→ Everyone sees widget ✅

### Scenario 2: Testing Phase
```bash
WIDGET_ENABLED=true
REQUIRE_F1=true
```
→ Only testers with `?f=1` see widget 🔧

### Scenario 3: Emergency Disable
```bash
WIDGET_ENABLED=false
REQUIRE_F1=true
```
→ Nobody sees widget (even with `?f=1`) 🔴

### Scenario 4: Gradual Rollback
```bash
WIDGET_ENABLED=true
REQUIRE_F1=true
```
→ Switch back to testing mode, existing users keep it ⚠️

---

## ⏱️ How Fast Does It Work?

- **Kill-switch activation**: ~1-2 minutes (after redeploy)
- **User sees change**: Immediately on next page load
- **localStorage cleared**: Automatically when disabled

---

## 🛡️ Safety Features

1. **Fail-open**: If feature-flags API fails, widget stays enabled (graceful degradation)
2. **Version tracking**: Each version bump clears localStorage (force refresh)
3. **Purchase tracking**: Always works (even if widget is disabled)
4. **Console logging**: Clear messages about widget state

---

## 📞 Quick Commands

```bash
# Disable widget NOW
vercel env add WIDGET_ENABLED false production && vercel --prod

# Enable widget for everyone
vercel env add WIDGET_ENABLED true production && \
vercel env add REQUIRE_F1 false production && \
vercel --prod

# Enable testing mode
vercel env add WIDGET_ENABLED true production && \
vercel env add REQUIRE_F1 true production && \
vercel --prod

# Check status
curl https://kunstpakket-ai-search.vercel.app/api/feature-flags
```

---

## 🎛️ Current Configuration

Check your current settings:

1. Go to Vercel Dashboard
2. Settings → Environment Variables
3. Look for:
   - `WIDGET_ENABLED` (should be `true` for production)
   - `REQUIRE_F1` (should be `false` for production)

**No variables set = defaults:**
- `WIDGET_ENABLED`: `true` (enabled)
- `REQUIRE_F1`: `false` (no f=1 required)

---

## 📝 Console Messages

When widget loads, check browser console:

```
✅ ENABLED:
[KP Search Overlay] v2.3.0 loaded
[KP Search Overlay] Initialized ✅

🔴 KILL-SWITCH ACTIVE:
[KP Search Overlay] v2.3.0 loaded
[KP Search] Widget disabled globally (KILL-SWITCH ACTIVE 🔴)

🔧 TESTING MODE (no f=1):
[KP Search Overlay] v2.3.0 loaded
[KP Search] Widget disabled (add ?f=1 to enable)
```

