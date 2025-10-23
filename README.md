# 🔍 Kunstpakket AI Search

**Mega goede search engine voor Kunstpakket.nl**

Dit project bevat de data sync en search infrastructure voor een geavanceerde product search, gebouwd op Lightspeed e-commerce data.

---

## 📋 Project Status

### ✅ Fase 1: Data Sync (CURRENT)
- [x] Lightspeed API integratie
- [x] Product, variant, tag & category sync
- [x] Local JSON export
- [ ] Neon database setup
- [ ] Data transformatie & normalisatie
- [ ] Database sync script

### 🚧 Fase 2: Search Engine (PLANNED)
- [ ] Postgres full-text search (tsvector)
- [ ] Trigram similarity matching
- [ ] Multi-field search (title, description, tags, categories)
- [ ] Faceted filtering (prijs, categorie, kleur, etc.)
- [ ] Ranking & relevance tuning

### 🎯 Fase 3: Advanced Features (FUTURE)
- [ ] Hybrid search (full-text + vector/semantic)
- [ ] Autocomplete & suggestions
- [ ] Search analytics
- [ ] A/B testing infrastructure
- [ ] ML-based ranking

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp env.example .env
# Edit .env with your Lightspeed credentials
```

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

---

## 📁 Project Structure

```
kunstpakket-ai-search/
├── scripts/
│   └── sync-lightspeed.js    # Lightspeed → Local JSON sync
│
├── data/                      # Synced data (gitignored)
│   ├── products.json
│   ├── variants.json
│   ├── tags.json
│   ├── tags-products.json
│   ├── categories.json
│   └── categories-products.json
│
├── env.example               # Environment template
├── package.json
└── README.md
```

---

## 🗄️ Next Step: Neon Database

**Waarom Neon?**
- ✅ Postgres = beste DB voor full-text search
- ✅ Serverless, auto-scaling
- ✅ pgvector support voor toekomstige semantic search
- ✅ Gratis tier (0.5 GB storage, 100 uur compute/maand)

**Database schema (concept):**

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

## 🔎 Search Strategy

### Phase 1: Full-Text Search (Postgres native)

**Query voorbeeld:**
```sql
SELECT 
  p.id,
  p.title,
  p.price,
  p.image,
  ts_rank(p.search_vector, query) AS rank
FROM products p, to_tsquery('dutch', 'cadeau & hart') query
WHERE p.search_vector @@ query
  AND p.is_visible = true
ORDER BY rank DESC
LIMIT 20;
```

**Features:**
- ✅ Nederlandse stemming (cadeau = cadeautje)
- ✅ Weighted ranking (titel > beschrijving)
- ✅ Fuzzy matching via trigrams
- ✅ Fast (GIN indexes)

### Phase 2: Hybrid Search (Full-Text + Vector)

Combineer:
1. **Full-text** → exact matches, trefwoorden
2. **Vector/semantic** → betekenis, context, synoniemen

Voorbeeld: "iets voor mijn moeder" → vindt producten met tag "moeder", "mama", "familie"

---

## 📦 Dependencies

```json
{
  "dependencies": {
    "dotenv": "^16.x",
    "@vercel/postgres": "^0.x"  // Later toevoegen
  }
}
```

---

## 🎯 Goals

1. **Snelheid** - < 100ms response time
2. **Relevantie** - juiste producten bovenaan
3. **Schaalbaarheid** - 10.000+ producten, 1000+ zoekopdrachten/dag
4. **UX** - autocomplete, filters, suggestions
5. **Analytics** - welke queries, CTR, conversie

---

## 🔧 Development Roadmap

### Week 1: Foundation
- [x] Project setup
- [x] Lightspeed sync script
- [ ] Neon database setup
- [ ] Schema design & migratie
- [ ] Data import script

### Week 2: Basic Search
- [ ] Full-text search query builder
- [ ] API endpoint (`/api/search?q=...`)
- [ ] Faceted filtering (categorie, prijs)
- [ ] Pagination

### Week 3: Optimization
- [ ] Index tuning
- [ ] Query optimization
- [ ] Caching layer (Redis?)
- [ ] Performance testing

### Week 4: Advanced Features
- [ ] Autocomplete/suggestions
- [ ] Search analytics logging
- [ ] Ranking improvements
- [ ] A/B testing setup

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

**Status:** 🚧 In Development  
**Last Updated:** 2025-01-23

