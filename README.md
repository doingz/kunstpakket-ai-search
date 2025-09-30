# Kunstpakket Lightspeed Sync - Cloudflare Worker

Deze Cloudflare Worker synchroniseert productdata van Lightspeed naar Cloudflare R2 storage en draait automatisch via een cron job.

## 🚀 Features

- ✅ Automatische synchronisatie van Lightspeed producten
- ✅ Intelligente product type detectie
- ✅ Opslag in Cloudflare R2
- ✅ Rate limiting voor Lightspeed API
- ✅ Cron job scheduling (elke 4 uur)
- ✅ Manual trigger via HTTP POST
- ✅ Geavanceerde pricing en stock berekening

## 📋 Vereisten

- Cloudflare account met Workers & R2 toegang
- Lightspeed API credentials
- Node.js en Wrangler CLI

## 🔧 Installatie & Setup

### 1. Cloudflare Workers CLI installeren

```bash
npm install -g wrangler
```

### 2. Inloggen op Cloudflare

```bash
wrangler login
```

### 3. Project configureren

```bash
# Project initialiseren
wrangler init kunstpakket-sync

# Of gebruik de bestaande configuratie
```

### 4. R2 Bucket aanmaken

1. Ga naar Cloudflare Dashboard → R2
2. Maak een nieuwe bucket aan: `kunstpakket-products`
3. Kopieer de bucket naam naar `wrangler.toml`

### 5. Environment Variables configureren

In `wrangler.toml`, pas de volgende variabelen aan:

```toml
[vars]
LIGHTSPEED_BASE_URL = "https://jouw-shop.lightspeedapp.com/api"
LIGHTSPEED_API_KEY = "jouw-api-key-hier"
LIGHTSPEED_SECRET = "jouw-secret-hier"
DEBUG_LIMIT = "0" # Voor testing: zet op 100, voor productie: 0
```

**Environment variabelen verkrijgen:**
1. Ga naar je Lightspeed backend
2. Navigeer naar Instellingen → API
3. Kopieer je API Key en Secret

### 6. Deployen naar Cloudflare

```bash
# Deploy de worker
wrangler deploy

# Test de worker (manual trigger)
curl -X POST https://jouw-worker.jouw-subdomain.workers.dev/sync
```

## 📡 Cron Job

De worker draait automatisch elke 4 uur via de cron trigger in `wrangler.toml`:

```toml
[triggers]
crons = ["0 */4 * * *"]
```

Je kunt dit aanpassen naar:
- `0 * * * *` - elke uur
- `0 0 * * *` - elke dag om middernacht
- `0 9 * * *` - elke dag om 9:00

## 🔍 Testing & Debugging

### Manual trigger
```bash
curl -X POST https://jouw-worker.jouw-subdomain.workers.dev/sync
```

### Debug mode
Zet `DEBUG_LIMIT = "100"` in `wrangler.toml` om alleen de eerste 100 producten te syncen.

### Logs bekijken
```bash
wrangler tail
```

## 📊 Data Structuur

De gesyncte data wordt opgeslagen als losse Markdown bestanden in de bucket root: `<id>.md`.

Voorbeeld per-product Markdown (`123.md`):

```markdown
---
id: 123
title: "Product titel"
fulltitle: "Optioneel volledige titel"
type: "schilderij"
price: 29.99
discountPrice: 24.99
hasDiscount: true
stock: 5
salesCount: 42
url: "https://kunstpakket.nl/product-url.html"
imageUrl: "https://..."
tags:
  - "schilderij"
  - "modern"
categories:
  - "Kunst"
  - "Schilderijen"
---

Korte beschrijving...

Uitgebreide content/omschrijving...
```

## 🔧 Troubleshooting

### Rate Limiting
De worker pauzeert automatisch 600ms tussen API calls en 1 minuut bij 429 errors.

### Memory Limits
Cloudflare Workers hebben geheugen limieten. Bij veel producten kan het nodig zijn om de `DEBUG_LIMIT` te gebruiken.

### Environment Variables
Controleer of alle environment variables correct zijn ingesteld in Cloudflare Dashboard → Workers → jouw-worker → Settings → Variables.

## 📝 Ondersteunde Product Types

De worker detecteert automatisch product types zoals:
- schilderij, mok, schaal, beeldje, vaas, bord, masker, cadeau, kandelaar, glaswerk, kom, karaf, object, klok, sieraad, boek, kaart, poster, doos, tas, textiel

## 🔄 Updates

Bij updates aan de worker:

```bash
# Deploy nieuwe versie
wrangler deploy

# Test nieuwe versie
curl -X POST https://jouw-worker.jouw-subdomain.workers.dev/sync
```

## 📞 Support

Bij problemen, controleer:
1. Lightspeed API credentials
2. Cloudflare R2 bucket naam
3. Worker logs via `wrangler tail`
4. Network connectivity naar Lightspeed API
