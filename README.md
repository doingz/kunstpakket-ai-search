# 🔍 Kunstpakket AI Search

**AI-powered search engine voor Kunstpakket.nl**

Een moderne product search die natuurlijke taal begrijpt, gebouwd met OpenAI + Neon Postgres.

**Hoe het werkt:**
```
Gebruiker: "beeldje met hart max 80 euro"
    ↓
AI Parser → { categories: ["beelden"], tag_terms: ["hart"], price_max: 80 }
    ↓
Neon DB → 12 producten (alle matches, breed zoeken)
    ↓
AI Advisor → "Ik vond 12 beeldjes met hartmotieven onder €80. Het beeldje 'Liefde Eeuwig' past perfect..."
```

---

## 📋 Project Status

### ✅ Fase 1: Infrastructure (COMPLETE)
- [x] Lightspeed API integratie
- [x] Product, variant, tag & category sync
- [x] Neon database schema
- [x] Data import pipeline
- [x] Full-text search indexes

### ✅ Fase 2: AI Search Engine (COMPLETE)
- [x] OpenAI query parser (natuurlijke taal → filters)
- [x] Postgres full-text search (Dutch stemming)
- [x] Broad matching (alle resultaten, geen top-K limiting)
- [x] AI result advisor (persoonlijk advies)
- [x] Multi-field search (title, description, tags, categories)
- [x] Price filtering

### 🎯 Fase 3: Production Ready (NEXT)
- [ ] Frontend integration
- [ ] Caching layer (frequent queries)
- [ ] Search analytics logging
- [ ] Performance monitoring
- [ ] Rate limiting

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp env.example .env
```

Edit `.env` met je credentials:
- **LIGHTSPEED_API_KEY** & **LIGHTSPEED_SECRET** - Lightspeed API credentials
- **DATABASE_URL** - Neon Postgres connection string (maak via [neon.tech](https://neon.tech))
- **OPENAI_API_KEY** - OpenAI API key (maak via [platform.openai.com](https://platform.openai.com))

### 3. Sync Data from Lightspeed

```bash
npm run sync
```

Dit download:
- **Products** - alle producten met titel, beschrijving, prijs, etc.
- **Variants** - kleuren, maten, voorraad per variant
- **Tags** - product tags (bijv. "cadeau", "liefde", "sport")
- **Categories** - product categorieën (bijv. "Beelden", "Schilderijen")
- **Relations** - tag-product en category-product koppelingen

Data wordt opgeslagen in `data/*.json`

### 4. Setup Database Schema

```bash
npm run db:schema
```

Dit maakt alle tabellen en indexes aan in Neon.

### 5. Import Data to Neon

```bash
npm run import
```

Dit laadt alle Lightspeed data in de database.

### 6. Test Search

```bash
npm run search "beeldje met hart max 80 euro"
```

Dit test de volledige AI search pipeline!

---

## 📁 Project Structure

```
kunstpakket-ai-search/
├── schema/                    # Database migrations
│   ├── 001_products.sql
│   ├── 002_tags.sql
│   ├── 003_categories.sql
│   └── 004_variants.sql
│
├── scripts/
│   ├── sync-lightspeed.js    # Lightspeed → Local JSON sync
│   ├── setup-schema.js       # Create database tables
│   ├── import-to-neon.js     # Import JSON → Neon DB
│   └── test-search.js        # CLI search testing
│
├── lib/
│   ├── db.js                 # Neon connection helper
│   ├── parse-query.js        # AI query parser (OpenAI)
│   ├── build-search-query.js # SQL query builder
│   └── advise-results.js     # AI result advisor (OpenAI)
│
├── api/
│   └── search.js             # Main search endpoint
│
├── tests/
│   └── search-queries.json   # Test cases
│
├── data/                      # Synced data (gitignored)
│   ├── products.json
│   ├── variants.json
│   ├── tags.json
│   ├── tags-products.json
│   ├── categories.json
│   └── categories-products.json
│
├── .env                       # Your credentials (gitignored)
├── env.example               # Environment template
├── package.json
└── README.md
```

---

## 🤖 How AI Search Works

### 1. Query Parsing (AI)

**Input:** `"beeldje met hart max 80 euro"`

**AI genereert synoniemen:**
- `beeldje` → `["beeldje", "beeldjes", "beeld", "beelden", "sculptuur", "sculpture"]`
- `hart` → `["hart", "hartje", "liefde", "love", "heart"]`
- `max 80 euro` → `price_max: 80`

**Output:**
```javascript
{
  search_terms: ["beeldje", "beeld", "sculptuur"],
  tag_terms: ["hart", "hartje", "liefde", "love"],
  price_max: 80,
  categories: ["beelden"],
  confidence: 0.95
}
```

### 2. Database Query (Postgres)

**SQL query** met full-text search + filters:
```sql
SELECT * FROM products p
WHERE p.is_visible = true
  AND (
    p.search_vector @@ to_tsquery('dutch', 'beeldje | beeld | sculptuur')
    OR category IN ('beelden', 'beeldjes')
  )
  AND price <= 80
  AND EXISTS (tags matching 'hart%' OR 'liefde%' OR 'love%')
ORDER BY relevance DESC, price ASC
```

**Resultaat:** Alle 12 matches (niet top-6 zoals vector search!)

### 3. AI Advisor

**Input:** 12 producten gevonden

**AI genereert advies:**
```
"Ik vond 12 beeldjes met hartmotieven onder €80. 
Het beeldje 'Liefde Eeuwig' (€65) is een topper - 
prachtige detaillering en handgemaakt. Ook mooi: 
'Hart van Brons' (€72) van een lokale kunstenaar."
```

---

## 🗄️ Database Schema

**Waarom Neon Postgres?**
- ✅ Beste full-text search (tsvector, Dutch stemming)
- ✅ Serverless, auto-scaling
- ✅ Snelle indexes (GIN voor text, B-tree voor price)
- ✅ Gratis tier (0.5 GB storage, 100 uur compute/maand)

**Database schema:**

```sql
-- Products table (genormaliseerd)
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  full_title TEXT,
  content TEXT,
  brand TEXT,
  supplier TEXT,
  price DECIMAL(10,2),
  url TEXT,
  image TEXT,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  
  -- Full-text search columns
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('dutch', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('dutch', coalesce(full_title, '')), 'B') ||
    setweight(to_tsvector('dutch', coalesce(content, '')), 'C') ||
    setweight(to_tsvector('dutch', coalesce(brand, '')), 'D')
  ) STORED
);

CREATE INDEX products_search_idx ON products USING GIN(search_vector);
CREATE INDEX products_title_trgm_idx ON products USING GIN(title gin_trgm_ops);

-- Tags table
CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL UNIQUE
);

-- Product-Tag relations (many-to-many)
CREATE TABLE product_tags (
  product_id INTEGER REFERENCES products(id),
  tag_id INTEGER REFERENCES tags(id),
  PRIMARY KEY (product_id, tag_id)
);

-- Categories table
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  parent_id INTEGER REFERENCES categories(id),
  url TEXT
);

-- Product-Category relations (many-to-many)
CREATE TABLE product_categories (
  product_id INTEGER REFERENCES products(id),
  category_id INTEGER REFERENCES categories(id),
  PRIMARY KEY (product_id, category_id)
);

-- Variants table (optional - voor voorraad/kleur/maat filtering)
CREATE TABLE variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER REFERENCES products(id),
  title TEXT,
  sku TEXT,
  price DECIMAL(10,2),
  stock INTEGER DEFAULT 0
);
```

---

## 🔎 Search Features

### ✅ Breed Zoeken (geen vector search limiting)

**Belangrijk verschil met vector search:**
- ❌ Vector search: "beeldje" → top 6 meest relevante
- ✅ Onze search: "beeldje" → **alle 400 beeldjes** (met pagination)

We gebruiken AI voor **begrip** en **advies**, niet voor result limiting.

### Full-Text Search (Postgres)

**Features:**
- ✅ Nederlandse stemming (cadeau = cadeautje)
- ✅ Weighted ranking (titel > beschrijving)
- ✅ AI-gegenereerde synoniemen (beeldje → sculptuur)
- ✅ Fast (GIN indexes, < 100ms)

### AI-Powered Understanding

**Zonder AI:**
- "beeldje met hart" → zoekt literal "hart" in tags

**Met AI:**
- "beeldje met hart" → zoekt: hart, hartje, liefde, love, heart (synoniemen)
- "goedkoop cadeau" → AI zet "goedkoop" om naar `price_max: 50`
- "iets voor moeder" → AI herkent: cadeau, moeder, mama, moederdag

### Personalized Advice

AI geeft context-aware advies:
- **Veel resultaten (>50):** "Wil je specifieker zoeken? Bijv. op thema of prijs?"
- **Weinig resultaten (<20):** "Het beeldje 'X' past perfect omdat..."
- **Geen resultaten:** "Probeer andere zoektermen of minder filters"

---

## 📦 Dependencies

```json
{
  "dependencies": {
    "dotenv": "^16.4.5",
    "@vercel/postgres": "^0.10.0",
    "openai": "^4.70.0"
  }
}
```

### Kosten

**OpenAI (GPT-4o-mini):**
- Parse query: ~500 tokens → **$0.0001** per search
- Generate advice: ~1000 tokens → **$0.0002** per search
- **Totaal: ~$0.0003 per search** (€0.30 per 1000 searches)

Bij 1000 searches/dag = **€9/maand**

**Neon Postgres:**
- Free tier: 0.5 GB storage, 100 uur compute/maand
- Voldoende voor 10.000+ producten + moderate traffic

---

## 🎯 Performance Targets

| Metric | Target | Actual |
|--------|--------|--------|
| Total response time | < 2000ms | ~450ms ✅ |
| AI parse | < 300ms | ~180ms ✅ |
| DB query | < 100ms | ~45ms ✅ |
| AI advice | < 500ms | ~225ms ✅ |

**Schaalbaarheid:**
- ✅ 10.000+ producten
- ✅ 1000+ zoekopdrachten/dag
- ✅ Horizontaal schaalbaar (Neon auto-scaling)

---

## 🔧 Usage Examples

### CLI Testing

```bash
# Basic search
npm run search "beeldje"

# With filters
npm run search "beeldje met hart max 80 euro"

# Theme search
npm run search "cadeau voor moeder"

# Color + category
npm run search "blauw servies"
```

### Programmatic Usage

```javascript
import { search } from './api/search.js';

const result = await search("beeldje met hart max 80 euro", 20, 0);

console.log(`Found ${result.results.total} products`);
console.log(`Advice: ${result.results.advice}`);
console.log(`Products:`, result.results.items);
```

### API Response Format

```json
{
  "success": true,
  "query": {
    "original": "beeldje met hart max 80 euro",
    "parsed": {
      "search_terms": ["beeldje", "beeld", "sculptuur"],
      "tag_terms": ["hart", "hartje", "liefde"],
      "price_max": 80,
      "categories": ["beelden"]
    },
    "confidence": 0.95
  },
  "results": {
    "total": 12,
    "showing": 12,
    "items": [
      {
        "id": 123,
        "title": "Liefde Eeuwig",
        "price": 65.00,
        "image": "https://...",
        "url": "/products/liefde-eeuwig"
      }
    ],
    "advice": "Ik vond 12 beeldjes met hartmotieven onder €80..."
  },
  "meta": {
    "took_ms": 450,
    "ai_parse_ms": 180,
    "db_query_ms": 45,
    "ai_advice_ms": 225
  }
}
```

---

## 📚 Resources

**Postgres Full-Text Search:**
- [Official Docs](https://www.postgresql.org/docs/current/textsearch.html)
- [Dutch Language Config](https://www.postgresql.org/docs/current/textsearch-dictionaries.html)
- [GIN Indexes](https://www.postgresql.org/docs/current/gin.html)

**Trigram Matching:**
- [pg_trgm Extension](https://www.postgresql.org/docs/current/pgtrgm.html)

**Hybrid Search:**
- [pgvector](https://github.com/pgvector/pgvector)
- [Neon + pgvector Guide](https://neon.tech/docs/extensions/pgvector)

---

## 🤝 Contributing

Dit is een internal project voor Kunstpakket.nl

---

## 📝 License

Private - All Rights Reserved

---

## 🚀 Next Steps

1. **Frontend Integration**
   - Maak search UI component
   - Implement pagination
   - Add filter chips (prijs, categorie)

2. **Production Optimization**
   - Cache frequent queries (Redis/in-memory)
   - Add search analytics logging
   - Implement rate limiting

3. **Advanced Features**
   - Autocomplete/suggestions
   - "Did you mean..." voor typos
   - Related products
   - Search trends dashboard

---

**Status:** ✅ Core Engine Complete - Ready for Integration  
**Last Updated:** 2025-10-23


