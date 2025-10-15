# Lightspeed Webhook Setup - Kunstpakket

## 🎯 Doel
Perfect tracking van aankopen met complete product data via Lightspeed webhooks.

## ✅ Wat werkt NU al
- ✅ DOM scraping als **backup** (werkt maar onbetrouwbaar)
- ✅ Omzet wordt gelogd
- ✅ Commissie wordt berekend
- ⚠️ Producten worden niet goed geëxtraheerd ("n.v.t.")

## 🚀 Wat webhook oplost
- ✅ **Perfecte product data** (namen, aantallen, prijzen)
- ✅ **100% betrouwbare omzet**
- ✅ **Automatisch** bij elke completed order
- ✅ **Geen afhankelijkheid** van HTML structuur

---

## 📋 Setup Instructies

### 1. Log in op Lightspeed Admin
Ga naar je Lightspeed admin panel: https://www.webshopapp.com/admin/

### 2. Navigeer naar Webhooks
- Ga naar **Instellingen** → **Integraties** → **Webhooks**
- Of direct: https://www.webshopapp.com/admin/settings/webhooks

### 3. Maak een nieuwe Webhook
Klik op **"Nieuwe webhook toevoegen"**

### 4. Configureer de Webhook

**Webhook URL:**
```
https://frederique-ai.lotapi.workers.dev/lightspeed-webhook
```

**Event Type:** Selecteer:
- ✅ `order.completed` (order compleet)
- ✅ `order.paid` (order betaald)

**Method:** `POST`

**Format:** `JSON`

**Status:** `Actief` ✅

### 5. Test de Webhook (Optioneel)
Lightspeed heeft meestal een "Test" knop. Klik daarop om te testen.

Je zou een succesvol response moeten zien:
```json
{
  "success": true,
  "message": "Purchase tracked via webhook"
}
```

### 6. Plaats een Test Order
1. Gebruik de widget op kunstpakket.nl (zoek iets)
2. Plaats een test order
3. Betaal (gebruik Mollie test mode indien beschikbaar)
4. Check je analytics dashboard → je ziet de order met **complete product data**! 🎉

---

## 🔍 Hoe het werkt

### Flow Diagram:
```
Klant bestelt op kunstpakket.nl
         ↓
Mollie payment compleet
         ↓
Lightspeed markeert order als "completed"
         ↓
🔔 Lightspeed stuurt webhook naar:
   https://frederique-ai.lotapi.workers.dev/lightspeed-webhook
         ↓
Worker ontvangt:
   - Order ID
   - Totaal bedrag
   - Alle producten (namen, prijzen, aantallen)
   - Customer data
         ↓
Worker stuurt naar analytics:
   - products_summary: "Beeldje Olifant (2x), Vaas Blauw"
   - order_total: €159.95
   - commission: €15.99 (10%)
         ↓
📊 Analytics dashboard toont alles perfect!
```

### Backup Systeem:
Als webhook om welke reden dan ook faalt:
1. Widget DOM scraper draait nog steeds op thankyou page
2. Probeert producten uit de HTML te halen
3. Minder betrouwbaar maar beter dan niets

---

## 🧪 Testen

### Test de webhook endpoint:
```bash
curl -X POST https://frederique-ai.lotapi.workers.dev/lightspeed-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "order.completed",
    "order": {
      "id": "test-123",
      "number": "TEST-123",
      "total": 99.95,
      "items": [
        {
          "title": "Test Product 1",
          "quantity": 2,
          "price": 29.95
        },
        {
          "title": "Test Product 2",
          "quantity": 1,
          "price": 40.05
        }
      ]
    }
  }'
```

Verwacht response:
```json
{
  "success": true,
  "message": "Purchase tracked via webhook",
  "response": { ... }
}
```

### Check Cloudflare logs:
```bash
cd /Users/doingz/Documents/projecten/bluestars/kunstpakket/widget
npx wrangler tail
```

Je ziet dan:
```
📦 Received Lightspeed webhook: { event: 'order.completed', order_id: 'test-123', total: 99.95 }
📦 Webhook order data: { order_id: 'test-123', total: 99.95, items_count: 2 }
📤 Sending to analytics: { products_summary: 'Test Product 1 (2x), Test Product 2', ... }
✅ Webhook purchase tracked successfully
```

---

## 📊 Resultaat in Analytics

Na setup zie je in je analytics dashboard:

| MOMENT | PRODUCTEN | OMZET | COMMISSIE |
|--------|-----------|-------|-----------|
| 15-10-2025, 17:30 | **Beeldje Olifant (2x), Vaas Blauw Glas** | € 159,95 | € 15,99 |
| 15-10-2025, 17:19 | **Schilderij Herman Brood** | € 249,00 | € 24,90 |

Niet meer "n.v.t." maar **echte producten**! 🎉

---

## ⚠️ Troubleshooting

### Webhook wordt niet ontvangen?
1. Check Lightspeed webhook status (Actief?)
2. Check de URL is exact correct
3. Kijk in Cloudflare logs: `npx wrangler tail`

### Producten nog steeds "n.v.t."?
1. Check of webhook event `order.completed` of `order.paid` is
2. Check Cloudflare logs voor errors
3. DOM scraper valt terug maar is onbetrouwbaar

### Interaction_id link ontbreekt?
- Webhook tracked orders zonder link naar specifieke zoek-interactie
- Voor perfecte tracking: beide systemen blijven draaien
  - Webhook: perfecte product/omzet data
  - DOM scraper: link naar interaction_id

---

## 🔐 Security

De webhook endpoint is publiek toegankelijk maar:
- Accepteert alleen JSON POST requests
- Valideert event types
- Stuurt alleen naar analytics met API key
- Lightspeed IP whitelisting mogelijk (optioneel)

---

## 📞 Support

Vragen? Check Lightspeed documentatie:
https://developers.lightspeedhq.com/ecom/webhooks/introduction/

Of check Cloudflare Worker logs voor debugging.

