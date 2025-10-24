#!/bin/bash

# Comprehensive AI Search Test Suite
# 32 diverse queries testing all aspects

API="https://kunstpakket-ai-search.vercel.app/api/search"

echo "🧪 COMPREHENSIVE AI SEARCH TEST - 32 QUERIES"
echo "=============================================="
echo ""

# Test function
test_query() {
  local num=$1
  local query=$2
  local category=$3
  
  echo "[$num/32] $category: \"$query\""
  
  result=$(curl -s -X POST "$API" \
    -H 'Content-Type: application/json' \
    -d "{\"query\":\"$query\"}" | jq -c '{
      type: .query.parsed.type,
      kw: (.query.parsed.keywords | length),
      price_min: .query.parsed.price_min,
      price_max: .query.parsed.price_max,
      results: .results.total
    }')
  
  echo "  → $result"
  echo ""
}

# CATEGORY 1: SPECIFIC SUBJECTS (should have 3-8 keywords)
echo "=== CATEGORY 1: SPECIFIC SUBJECTS ==="
test_query 1 "bodybuilder" "Specific sport"
test_query 2 "tennisser" "Specific sport"
test_query 3 "judoka" "Specific sport"
test_query 4 "ballerina" "Specific art"

# CATEGORY 2: BROAD SUBJECTS (should have 15-30 keywords)
echo "=== CATEGORY 2: BROAD SUBJECTS ==="
test_query 5 "sporter" "Broad sport"
test_query 6 "dieren" "Broad animals"
test_query 7 "kunst" "Broad art"
test_query 8 "cadeau" "Broad theme"

# CATEGORY 3: SPECIFIC ANIMALS
echo "=== CATEGORY 3: SPECIFIC ANIMALS ==="
test_query 9 "hond" "Animal"
test_query 10 "kat" "Animal"
test_query 11 "olifant" "Animal"
test_query 12 "vogel" "Animal"

# CATEGORY 4: ARTISTS
echo "=== CATEGORY 4: ARTISTS ==="
test_query 13 "van gogh" "Artist"
test_query 14 "klimt" "Artist"
test_query 15 "mondriaan" "Artist"
test_query 16 "picasso" "Artist"

# CATEGORY 5: THEMES
echo "=== CATEGORY 5: THEMES ==="
test_query 17 "liefde" "Theme"
test_query 18 "vriendschap" "Theme"
test_query 19 "succes" "Theme"
test_query 20 "geluk" "Theme"

# CATEGORY 6: PRODUCT TYPES
echo "=== CATEGORY 6: PRODUCT TYPES ==="
test_query 21 "beeldje" "Type"
test_query 22 "schilderij" "Type"
test_query 23 "vaas" "Type"
test_query 24 "mok" "Type"

# CATEGORY 7: PRICE QUERIES
echo "=== CATEGORY 7: PRICE QUERIES ==="
test_query 25 "schilderij onder 100" "Price max"
test_query 26 "beeld tussen 50 en 100" "Price range"
test_query 27 "cadeau max 50 euro" "Price max"
test_query 28 "mok rond 30 euro" "Price range"

# CATEGORY 8: COMPLEX QUERIES
echo "=== CATEGORY 8: COMPLEX QUERIES ==="
test_query 29 "beeld voor sporter" "Type + subject"
test_query 30 "cadeau voor arts" "Theme + profession"
test_query 31 "beeldje met hart" "Type + theme"
test_query 32 "romeinse goden" "Multi-word phrase"

echo "=============================================="
echo "✅ TEST COMPLETE - 32 QUERIES EXECUTED"
echo ""
echo "EXPECTED PATTERNS:"
echo "- Specific subjects: 3-8 keywords"
echo "- Broad subjects: 15-30 keywords"
echo "- Types should be detected correctly"
echo "- Prices should be parsed"
echo "- Multi-word phrases should stay together"

