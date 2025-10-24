#!/bin/bash

# Comprehensive Final Test - 32 diverse queries
# Check EVERYTHING: keywords, use_keywords flag, results

API="https://kunstpakket-ai-search.vercel.app/api/search"

echo "🧪 COMPREHENSIVE FINAL TEST - 32 QUERIES"
echo "========================================"
echo ""

test_query() {
  local num=$1
  local query=$2
  local category=$3
  
  echo "[$num/32] $category: \"$query\""
  
  result=$(curl -s -X POST "$API" \
    -H 'Content-Type: application/json' \
    -d "{\"query\":\"$query\"}" | jq '{
      type: .query.parsed.type,
      kw_count: (.query.parsed.keywords | length),
      use_kw: .query.parsed.use_keywords,
      total: .results.total,
      first: .results.items[0].title
    }')
  
  echo "    $result"
  echo ""
}

echo "=== CATEGORY 1: TYPE + PRICE (should use_kw: false) ==="
test_query 1 "schilderij onder 300" "Type + price"
test_query 2 "een mok" "Type only"
test_query 3 "vaas onder 50" "Type + price"
test_query 4 "beeldje tussen 50 en 100" "Type + price range"
echo ""

echo "=== CATEGORY 2: TYPE + CONTEXT (should use_kw: true) ==="
test_query 5 "beeldje met hart" "Type + attribute"
test_query 6 "beeld voor sporter" "Type + theme"
test_query 7 "beeld van van gogh" "Type + artist"
test_query 8 "mok met klimt" "Type + artist"
echo ""

echo "=== CATEGORY 3: ARTISTS (should use_kw: true) ==="
test_query 9 "van gogh" "Artist"
test_query 10 "klimt" "Artist"
test_query 11 "mondriaan" "Artist"
test_query 12 "picasso" "Artist"
echo ""

echo "=== CATEGORY 4: THEMES (should use_kw: true) ==="
test_query 13 "liefde" "Theme"
test_query 14 "vriendschap" "Theme"
test_query 15 "romeinse goden" "Multi-word theme"
test_query 16 "boeddha" "Theme"
echo ""

echo "=== CATEGORY 5: SPECIFIC SUBJECTS (should use_kw: true) ==="
test_query 17 "bodybuilder" "Specific sport"
test_query 18 "tennisser" "Specific sport"
test_query 19 "ballerina" "Specific art"
test_query 20 "olifant" "Specific animal"
echo ""

echo "=== CATEGORY 6: BROAD SUBJECTS (should use_kw: true) ==="
test_query 21 "sporter" "Broad sport"
test_query 22 "dieren" "Broad animals"
test_query 23 "kunst" "Broad art"
test_query 24 "cadeau" "Broad theme"
echo ""

echo "=== CATEGORY 7: COMPLEX QUERIES ==="
test_query 25 "een beeld voor een sporter onder 80 euro" "Type + context + price"
test_query 26 "beeldje met een hart onder 80 euro" "Type + attribute + price"
test_query 27 "een schilderij van herman brood" "Type + artist"
test_query 28 "cadeau voor arts" "Theme + profession"
echo ""

echo "=== CATEGORY 8: EDGE CASES ==="
test_query 29 "zijn er romeinse goden" "Question format"
test_query 30 "wat is boeddha" "Question format"
test_query 31 "hond" "Single animal"
test_query 32 "kat" "Single animal"
echo ""

echo "========================================"
echo "✅ TEST COMPLETE"

