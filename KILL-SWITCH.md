# 🔴 Kill-Switch Instructions

## Overview

The widget requires `?f=1` in the URL to load. This is **hardcoded** in `public/widget.js`.

## Current Status

**Widget is OFFLINE for public users** ✅

- ❌ `kunstpakket.nl` → Widget does NOT load
- ✅ `kunstpakket.nl?f=1` → Widget loads (for testing)

---

## 🚨 EMERGENCY: Disable Widget Immediately

If you need to disable the widget completely (even with `?f=1`):

### Option 1: Edit widget.js (FASTEST - 2 minutes)

```bash
# Edit public/widget.js
# Change line 863 to:
return { widget_enabled: false, require_f1: true };

# Deploy
git add public/widget.js
git commit -m "EMERGENCY: Disable widget completely"
git push
```

### Option 2: Remove widget from site (NUCLEAR - 5 minutes)

Remove the widget script tag from kunstpakket.nl entirely.

---

## 🚀 GO LIVE: Enable Widget for Everyone

When ready to go live:

```bash
# Edit public/widget.js
# Change line 863 to:
return { widget_enabled: true, require_f1: false };

# Deploy
git add public/widget.js
git commit -m "GO LIVE: Enable widget for all users"
git push
```

⏱️ Takes ~1 minute to deploy.

---

## 🔧 Testing Mode (Current)

Widget only works with `?f=1`:

```javascript
// public/widget.js line 863
return { widget_enabled: true, require_f1: true };
```

**How to test:**
- Visit `kunstpakket.nl?f=1`
- Widget loads and stores `kp_search_enabled=true` in localStorage
- Widget stays enabled for rest of session
- Other users without `?f=1` won't see it

---

## Architecture

**Simple and maintainable:**

1. ✅ No environment variables needed
2. ✅ No API calls to feature-flags endpoint
3. ✅ Just 1 line of code to change in `widget.js`
4. ✅ Changes deploy in ~1 minute via git push

**Kill-switch location:**
```
public/widget.js:863
```

---

## Checklist Before Going Live

See `GO-LIVE-CHECKLIST.md` for full checklist.
