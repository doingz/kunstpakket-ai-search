# Setup Guide - Kunstpakket AI Search

## ✅ Wat is geïmplementeerd

De volledige AI-powered search engine is klaar! Dit is wat er werkt:

### Core Features
- ✅ **AI Query Parser** - Natuurlijke taal → gestructureerde filters
- ✅ **Database Search** - Snel zoeken in Neon Postgres (broad matching)
- ✅ **AI Advisor** - Persoonlijk advies bij resultaten
- ✅ **Full-text Search** - Nederlandse stemming, synoniemen
- ✅ **Multi-field Search** - Titel, beschrijving, tags, categorieën
- ✅ **Price Filtering** - Min/max prijzen
- ✅ **Pagination** - Limit/offset voor grote resultsets

### Infrastructure
- ✅ Database schema (4 SQL migratie files)
- ✅ Lightspeed sync (bestaand, werkt al)
- ✅ Data import pipeline
- ✅ CLI test tool
- ✅ API endpoint
- ✅ Example scripts

---

## 🚀 Hoe het te gebruiken

### Stap 1: Dependencies installeren

```bash
npm install
```

Dit installeert:
- `@vercel/postgres` - Neon database client
- `openai` - OpenAI API client
- `dotenv` - Environment variables

### Stap 2: Credentials instellen

Je hebt **3 dingen** nodig:

#### A. Neon Database (gratis)

1. Ga naar https://neon.tech
2. Maak een gratis account
3. Maak een nieuw project: "kunstpakket-search"
4. Kopieer de **DATABASE_URL** (zie "Connection Details")
5. Zet in `.env`:

```bash
DATABASE_URL=postgresql://username:password@ep-xxx.region.neon.tech/kunstpakket?sslmode=require
```

#### B. OpenAI API Key (betaald, maar goedkoop)

1. Ga naar https://platform.openai.com/api-keys
2. Maak een API key
3. Zet in `.env`:

```bash
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx
```

**Kosten:** ~€0.0003 per search (€9/maand bij 1000 searches/dag)

#### C. Lightspeed Credentials (heb je al)

Deze heb je al in je lokale `.env`:

```bash
LIGHTSPEED_API_KEY=xxx
LIGHTSPEED_SECRET=xxx
```

### Stap 3: Volledige setup runnen

**Optie A - Alles in één keer:**

```bash
npm run setup
```

Dit doet:
1. Sync Lightspeed data
2. Maak database schema
3. Import data naar Neon
4. Test search

**Optie B - Stap voor stap:**

```bash
# 1. Sync Lightspeed data
npm run sync

# 2. Maak database schema
npm run db:schema

# 3. Import data naar Neon
npm run import

# 4. Test search
npm run search "beeldje met hart max 80 euro"
```

---

## 🔍 Search testen

### Via CLI

```bash
# Basic search
npm run search "beeldje"

# Met filters
npm run search "beeldje met hart max 80 euro"

# Thema search
npm run search "cadeau voor moeder"

# Kleur + categorie
npm run search "blauw servies"
```

### Via code

Zie `examples/simple-search.js`:

```javascript
import { search } from './api/search.js';

const result = await search("beeldje met hart max 80 euro", 20, 0);

console.log(`Found ${result.results.total} products`);
console.log(`Advice: ${result.results.advice}`);
result.results.items.forEach(item => {
  console.log(`- ${item.title}: €${item.price}`);
});
```

Run:
```bash
node examples/simple-search.js
```

---

## 📊 Verwachte output

### Succesvolle search:

```
🔍 Searching: "beeldje met hart max 80 euro"
  ✅ Parsed: {
    "search_terms": ["beeldje", "beeld", "sculptuur"],
    "tag_terms": ["hart", "hartje", "liefde", "love"],
    "price_max": 80,
    "categories": ["beelden"]
  }
  ✅ Found 12 products (showing 5)
  ✅ Advice: "Ik vond 12 beeldjes met hartmotieven onder €80..."
  ⏱️  Total: 450ms

📊 RESULTS

Query: "beeldje met hart max 80 euro"
Confidence: 95%

📦 Found 12 products (showing 5)

🎯 Top results:
⭐ 1. Liefde Eeuwig
      €65.00 - /products/liefde-eeuwig
      Prachtig beeldje met hart, handgemaakt...
   2. Hart van Brons
      €72.00 - /products/hart-brons
      ...

💬 AI Advice:
   "Ik vond 12 beeldjes met hartmotieven onder €80. Het beeldje 
   'Liefde Eeuwig' (€65) is een topper - prachtige detaillering 
   en handgemaakt."

⏱️  Performance:
   AI Parse: 180ms
   DB Query: 45ms
   AI Advice: 225ms
   Total: 450ms
```

---

## 🔧 Troubleshooting

### Error: "DATABASE_URL environment variable is not set"

→ Zet je Neon DATABASE_URL in `.env`

### Error: "OPENAI_API_KEY environment variable is not set"

→ Zet je OpenAI API key in `.env`

### Error: "No products found. Run npm run sync first"

→ Run eerst `npm run sync` om Lightspeed data te downloaden

### Database connection timeout

→ Check of je Neon database nog actief is (auto-suspend na inactiviteit)
→ Ga naar neon.tech console en wake het project op

### AI returns low confidence (<0.7)

→ Dit is normaal voor vage queries
→ De API returned een suggestie aan de gebruiker om specifieker te zijn

---

## 📂 File Structuur

```
kunstpakket-ai-search/
├── schema/               # Database migrations
│   ├── 001_products.sql
│   ├── 002_tags.sql
│   ├── 003_categories.sql
│   └── 004_variants.sql
│
├── lib/                  # Core logic
│   ├── db.js            # Database connection
│   ├── parse-query.js   # AI query parser
│   ├── build-search-query.js  # SQL builder
│   └── advise-results.js      # AI advisor
│
├── api/
│   └── search.js        # Main API endpoint
│
├── scripts/
│   ├── sync-lightspeed.js     # Sync van Lightspeed
│   ├── setup-schema.js        # Database setup
│   ├── import-to-neon.js      # Data import
│   ├── test-search.js         # CLI tester
│   └── full-setup.js          # All-in-one setup
│
├── examples/
│   └── simple-search.js       # Code examples
│
├── tests/
│   └── search-queries.json    # Test cases
│
└── data/                # Synced Lightspeed data
    ├── products.json
    ├── tags.json
    └── ...
```

---

## 🎯 Volgende Stappen

### 1. Test met echte Kunstpakket data

```bash
# Sync je echte Lightspeed data
npm run sync

# Import naar database
npm run import

# Test searches
npm run search "beeldje"
npm run search "cadeau voor verjaardag"
```

### 2. Integreer in je website/app

```javascript
// In je frontend (Next.js, Express, etc.)
import { search } from './api/search.js';

app.post('/api/search', async (req, res) => {
  const { query, limit = 20, offset = 0 } = req.body;
  const result = await search(query, limit, offset);
  res.json(result);
});
```

### 3. Optimalisaties (optioneel)

- **Caching:** Frequent queries cachen (Redis/in-memory)
- **Analytics:** Log alle searches voor analyse
- **A/B testing:** Test verschillende AI prompts
- **Rate limiting:** Voorkom abuse

---

## 💰 Kosten Overzicht

### OpenAI
- Parse: $0.0001 per search
- Advice: $0.0002 per search
- **Totaal: ~$0.0003 per search**

**Bij 1000 searches/dag:**
- 1000 × $0.0003 = $0.30/dag
- $0.30 × 30 = **$9/maand**

### Neon Postgres
- Free tier: 0.5 GB storage, 100u compute/maand
- **$0/maand** (voor normale usage)

**Totaal: ~$9/maand** voor 1000 searches/dag

---

## ✅ Checklist

- [ ] Dependencies geïnstalleerd (`npm install`)
- [ ] Neon database gemaakt
- [ ] DATABASE_URL in `.env`
- [ ] OpenAI API key in `.env`
- [ ] Lightspeed credentials in `.env`
- [ ] Schema opgezet (`npm run db:schema`)
- [ ] Data gesync'd (`npm run sync`)
- [ ] Data geïmporteerd (`npm run import`)
- [ ] Test search gedraaid (`npm run search "beeldje"`)
- [ ] Eigen queries getest
- [ ] API geïntegreerd in je project

---

**Succes! Als je vragen hebt, check de README.md voor meer details.**

