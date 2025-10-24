# 🚀 GO LIVE CHECKLIST - Kunstpakket AI Search

## ✅ Current Status: READY TO LAUNCH

All systems tested and working! Use this checklist to go live safely.

---

## 📋 PRE-LAUNCH CHECKLIST

### 1. ✅ Core Features
- [x] AI query parsing (gpt-4o)
- [x] Full-text search (PostgreSQL)
- [x] Product type detection
- [x] Price range filtering
- [x] Keyword expansion (context-aware)
- [x] Artist name recognition
- [x] Multi-word phrase handling
- [x] Search relevance (description, not content)

### 2. ✅ UI/UX
- [x] Inline search bar (after #header)
- [x] Fullscreen overlay on search
- [x] Mobile responsive (4 cols → 3 cols → 1 col)
- [x] Close button (top right)
- [x] Sort filter (popular/price)
- [x] AI intro text (with emoji)
- [x] Loading states
- [x] Empty states

### 3. ✅ Analytics
- [x] Search tracking
- [x] Product click tracking
- [x] Purchase tracking
- [x] Result count tracking
- [x] Analytics dashboard integration

### 4. ✅ Performance
- [x] Response time < 3s (AI + DB)
- [x] Image optimization (CDN)
- [x] Widget caching
- [x] Graceful error handling

### 5. ✅ Safety Features
- [x] Kill-switch (WIDGET_ENABLED env var)
- [x] Testing mode (REQUIRE_F1 env var)
- [x] Version tracking
- [x] Console logging
- [x] Fail-open strategy

### 6. ✅ Edge Cases Fixed
- [x] Artist bios no longer cause false positives
- [x] Jacky Zegers animals filtered out
- [x] Artist names with variants
- [x] Pure type queries with synonyms
- [x] Attribute extraction (hart, arts, etc.)
- [x] Multi-word phrases stay together

---

## 🚀 LAUNCH STEPS

### Step 1: Set Environment Variables (Vercel Dashboard)

Go to: https://vercel.com/doingz/kunstpakket-ai-search/settings/environment-variables

**Add these variables:**

```bash
WIDGET_ENABLED=true       # Enable widget globally
REQUIRE_F1=false          # No testing flag required
```

### Step 2: Redeploy

```bash
# Via Vercel Dashboard:
Deployments → Latest → Redeploy

# OR via CLI:
vercel --prod
```

### Step 3: Verify Feature Flags

```bash
curl https://kunstpakket-ai-search.vercel.app/api/feature-flags
```

**Expected response:**
```json
{
  "success": true,
  "flags": {
    "widget_enabled": true,
    "require_f1": false
  }
}
```

### Step 4: Test on Production

1. Visit: `https://www.kunstpakket.nl`
2. Check for search bar after header
3. Type a query: "een beeld voor een sporter"
4. Verify overlay opens with results
5. Check browser console for: `[KP Search Overlay] Initialized ✅`

### Step 5: Monitor Analytics

Go to: `https://analytics.bluestars.app`

Check for:
- ✅ Search events coming in
- ✅ Click events tracking
- ✅ Purchase events tracking

---

## 🔴 ROLLBACK PROCEDURE

If something goes wrong, immediately disable the widget:

### Option 1: Kill-Switch (FASTEST - 1 minute)

```bash
# Via Vercel Dashboard:
WIDGET_ENABLED=false

# Redeploy
```

### Option 2: Testing Mode (Keep for existing users)

```bash
# Via Vercel Dashboard:
REQUIRE_F1=true

# This hides widget for new visitors but keeps it for existing users
```

### Option 3: Full Rollback (Emergency)

```bash
git revert HEAD
git push
```

See `KILL-SWITCH.md` for detailed instructions.

---

## 📊 SUCCESS METRICS (First 24 Hours)

Track these metrics after launch:

- **Search volume**: How many searches?
- **Click-through rate**: % of searches → clicks
- **Conversion rate**: % of searches → purchases
- **Average results**: How many products per search?
- **Error rate**: Any API failures?
- **Response time**: Average search speed

---

## 🎯 TESTING SCENARIOS BEFORE LAUNCH

Run these test queries to verify everything works:

### 1. Basic Queries
```
- "een beeld"
- "een mok"
- "een vaas"
```

### 2. Artist Queries
```
- "van gogh"
- "klimt"
- "mondriaan"
```

### 3. Theme Queries
```
- "liefde"
- "vriendschap"
- "geluk"
```

### 4. Complex Queries
```
- "een beeld voor een sporter"
- "een beeldje met een hart onder 80 euro"
- "romeinse goden"
```

### 5. Edge Cases
```
- "judoka"
- "bodybuilder"
- "cadeau voor arts"
```

---

## 📞 SUPPORT CONTACTS

If issues arise:

- **Technical**: Check Vercel logs
- **Analytics**: Check analytics.bluestars.app
- **Database**: Check Vercel Postgres
- **AI**: Check OpenAI usage dashboard

---

## 🎉 POST-LAUNCH TASKS

After successful launch:

1. ✅ Monitor analytics for 24 hours
2. ✅ Check error logs
3. ✅ Collect user feedback
4. ✅ Optimize based on real usage
5. ✅ Document learnings

---

## 📈 CURRENT CONFIGURATION

**Environment:**
- Production URL: `kunstpakket.nl`
- API Base: `kunstpakket-ai-search.vercel.app`
- Analytics: `analytics.bluestars.app`

**Feature Flags (Default):**
```json
{
  "widget_enabled": true,
  "require_f1": false
}
```

**AI Model:**
- Model: `gpt-4o`
- Max tokens: `600`
- Temperature: Default

**Database:**
- PostgreSQL (Vercel)
- Full-text search (Dutch stemming)
- Search vector: `title + full_title + description`

---

## 🚦 LAUNCH STATUS

Current: **🟡 READY (Testing Mode)**
- Widget works with `?f=1`
- Analytics tracking active
- Kill-switch tested
- All edge cases fixed

To go live: **Set `REQUIRE_F1=false` in Vercel** 🚀

---

**Last updated:** 2025-10-24
**Version:** 2.3.0
**Status:** ✅ Production Ready

