#!/bin/bash

# Test Edge Cases - Focus on the problematic queries

API="https://kunstpakket-ai-search.vercel.app/api/search"

echo "🧪 TESTING EDGE CASES - IMPROVED PROMPT"
echo "========================================"
echo ""
echo "Waiting 20 seconds for deployment..."
sleep 20
echo ""

test_query() {
  local num=$1
  local query=$2
  local expected=$3
  
  echo "[$num] \"$query\""
  echo "    Expected: $expected"
  
  result=$(curl -s -X POST "$API" \
    -H 'Content-Type: application/json' \
    -d "{\"query\":\"$query\"}" | jq -c '{
      type: .query.parsed.type,
      keywords: .query.parsed.keywords,
      kw_count: (.query.parsed.keywords | length),
      results: .results.total
    }')
  
  echo "    Result:   $result"
  echo ""
}

echo "=== 1. ARTIST NAMES (should have 3-5 keywords) ==="
test_query 1 "van gogh" "3-5 kw: van gogh, vincent, gogh, vincent van gogh"
test_query 2 "klimt" "3-5 kw: klimt, gustav klimt, gustav"
test_query 3 "mondriaan" "3-5 kw: mondriaan, piet mondriaan, mondrian"
test_query 4 "picasso" "3-5 kw: picasso, pablo picasso, pablo"
echo ""

echo "=== 2. PURE TYPE QUERIES (should have 3-5 keywords) ==="
test_query 5 "mok" "3-5 kw: mok, mokken, cup, mug, beker"
test_query 6 "vaas" "3-5 kw: vaas, vazen, vase"
test_query 7 "beeldje" "3-5 kw: beeldje, beeld, beeldjes, sculpture"
echo ""

echo "=== 3. TYPE WITH ATTRIBUTES (extract attribute) ==="
test_query 8 "beeldje met hart" "type:Beeld, kw: hart, hartje, heart, liefde"
test_query 9 "beeld voor arts" "type:Beeld, kw: arts, dokter, medisch"
test_query 10 "cadeau voor sporter" "kw: sporter + sport variants (15-30)"
echo ""

echo "=== 4. MULTI-WORD PHRASES (keep together) ==="
test_query 11 "romeinse goden" "kw: romeinse goden, romeins, rome"
test_query 12 "griekse mythologie" "kw: griekse mythologie, grieks, etc"
echo ""

echo "=== 5. THEMES (should have more keywords) ==="
test_query 13 "succes" "8-15 kw: succes, success, prestatie, etc"
test_query 14 "vriendschap" "8-15 kw: vriendschap, vriend, friendship, etc"
echo ""

echo "========================================"
echo "✅ EDGE CASE TESTING COMPLETE"
echo ""
echo "CHECK IF:"
echo "• Artists now have 3-5 keywords ✓"
echo "• Pure types have 3-5 synonyms ✓"
echo "• Attributes are extracted separately ✓"
echo "• Multi-word phrases stay together ✓"

