# Search Analytics Integratie

## ✅ Wat is Klaar

1. **Analytics Integratie**: Volledig geïmplementeerd in `public/widget.js` (v1.3.0)
2. **Analytics Dashboard**: https://analytics.bluestars.app
3. **Database**: Volledig geconfigureerd met €10.00 per aankoop
4. **Purchase Tracking**: Detecteert automatisch `/thankyou` pagina's

## 🚀 Implementatie Status

### ✅ KLAAR: Widget Analytics (v1.3.0)

De widget tracking is **volledig geïmplementeerd** en werkt automatisch!

**Wat wordt getrackt:**
1. **Search** - Automatisch bij elke zoekopdracht
2. **Click** - Automatisch bij product klik
3. **Purchase** - Automatisch op `/thankyou` pagina's

**Purchase detectie patronen:**
- URL bevat `/thankyou` ✅ (hoofdpatroon)
- URL bevat `/bedankt`
- URL bevat `/thank-you`
- URL bevat `/success`
- URL bevat `?order=success`
- Title bevat "bedankt"
- Title bevat "thank you"

**Geen verdere actie nodig!** De widget script op de website doet alles automatisch.

## 📊 Hoe het Werkt

### Tracking Flow

1. **Search Event**
   ```
   User zoekt "beeldje" 
   → Widget genereert unieke searchId
   → Tracked: { query: "beeldje", resultCount: 150 }
   → searchId opgeslagen in sessionStorage
   ```

2. **Click Event**
   ```
   User klikt op product #12345
   → Tracked: { searchId, productId: 12345, productUrl: "..." }
   → productId opgeslagen voor purchase attribution
   ```

3. **Purchase Event** (Automatisch!)
   ```
   User komt op /thankyou pagina
   → Widget detecteert URL patroon
   → Tracked: { searchId, productId: 12345 }
   → €10.00 revenue toegekend
   → Push notificatie verstuurd
   → SessionStorage cleared
   ```

### SessionStorage Gebruik

De widget slaat tijdelijk op:
- `kp_search_id` - Unieke ID van laatste zoekopdracht
- `kp_last_query` - Laatste zoekopdracht tekst
- `kp_last_product_id` - ID van laatste geklikte product
- `kp_last_product_url` - URL van laatste geklikte product

Dit wordt automatisch gewist na een purchase.

## 🎯 Wat Word Gemeten?

1. **Search**: 
   - Zoekopdracht
   - Aantal resultaten
   - Tijdstip

2. **Click**:
   - Welk product
   - Product URL
   - Van welke search

3. **Purchase**:
   - €10.00 revenue
   - Gekoppeld aan laatste geklikte product
   - Push notificatie gestuurd

## 📊 Dashboard Bekijken

- URL: https://analytics.bluestars.app
- Metrics: Searches, Clicks, Purchases, Revenue, CTR, Conversion
- Top Searches: Meest gezochte termen
- Recent Purchases: Met zoekopdracht details

## 🔧 Testen

1. Open widget met `?f=1`
2. Doe een zoekopdracht
3. Klik op een product
4. Check console: `[Analytics] Search tracked` en `[Analytics] Click tracked`
5. Ga naar bedankt pagina
6. Check dashboard: https://analytics.bluestars.app

## 💡 Tips

- Analytics faalt **silent** - breekt nooit de user experience
- Search ID wordt opgeslagen in sessionStorage
- Werkt cross-domain (widget → hoofdsite)
- Purchase detection is automatisch

## Vragen?

Check:
- `lib/search-analytics.js` - Voor de implementatie
- Dashboard logs - Voor runtime errors
- Browser console - Voor tracking confirmatie

