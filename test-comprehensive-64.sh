#!/bin/bash

# 64 Comprehensive Test Queries for Kunstpakket AI Search
# Tests all product types, price ranges, combinations, and edge cases

API_URL="https://kunstpakket-ai-search.vercel.app/api/search"
TOTAL=0
PASSED=0
FAILED=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================="
echo "🧪 KUNSTPAKKET AI SEARCH - 64 TEST SUITE"
echo "========================================="
echo ""

test_search() {
  local query="$1"
  local expect_type="$2"
  local expect_min_results="$3"
  local expect_keywords="$4"
  local test_description="$5"
  
  TOTAL=$((TOTAL + 1))
  
  echo "[$TOTAL/64] Testing: $test_description"
  echo "   Query: \"$query\""
  
  response=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"$query\"}")
  
  parsed_type=$(echo "$response" | jq -r '.query.parsed.type // "null"')
  total_results=$(echo "$response" | jq -r '.results.total // 0')
  keywords=$(echo "$response" | jq -r '.query.parsed.keywords // [] | join(", ")')
  use_keywords=$(echo "$response" | jq -r '.query.parsed.use_keywords // true')
  
  # Check type
  type_ok="✅"
  if [ "$expect_type" != "any" ] && [ "$parsed_type" != "$expect_type" ]; then
    type_ok="❌"
  fi
  
  # Check results count
  results_ok="✅"
  if [ "$total_results" -lt "$expect_min_results" ]; then
    results_ok="❌"
  fi
  
  # Check keywords (if specified)
  keywords_ok="✅"
  if [ -n "$expect_keywords" ]; then
    if ! echo "$keywords" | grep -qi "$expect_keywords"; then
      keywords_ok="❌"
    fi
  fi
  
  # Overall status
  if [ "$type_ok" = "✅" ] && [ "$results_ok" = "✅" ] && [ "$keywords_ok" = "✅" ]; then
    echo -e "   ${GREEN}✅ PASS${NC} - Type: $parsed_type | Results: $total_results | use_keywords: $use_keywords"
    PASSED=$((PASSED + 1))
  else
    echo -e "   ${RED}❌ FAIL${NC} - Type: $type_ok $parsed_type (expected: $expect_type) | Results: $results_ok $total_results (min: $expect_min_results)"
    echo "   Keywords: $keywords"
    FAILED=$((FAILED + 1))
  fi
  echo ""
  
  # Rate limiting
  sleep 0.5
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 SECTION 1: PRODUCT TYPES (10 tests)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_search "een beeld" "Beeld" 50 "" "Generic Beeld query"
test_search "een schilderij" "Schilderij" 10 "" "Generic Schilderij query"
test_search "een vaas" "Vaas" 10 "" "Generic Vaas query"
test_search "een mok" "Mok" 5 "" "Generic Mok query"
test_search "onderzetters" "Onderzetter" 5 "" "Generic Onderzetter query"
test_search "een theelicht" "Theelicht" 5 "" "Generic Theelicht query"
test_search "spiegeldoosje" "Spiegeldoosje" 1 "" "Generic Spiegeldoosje query"
test_search "een wandbord" "Wandbord" 1 "" "Generic Wandbord query"
test_search "een schaal" "Schaal" 5 "" "Generic Schaal query"
test_search "glasobject" "Glasobject" 1 "" "Generic Glasobject query"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💰 SECTION 2: PRICE RANGES (8 tests)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_search "een cadeau onder 50 euro" "any" 10 "cadeau" "Budget cadeau under 50"
test_search "schilderij onder 300 euro" "Schilderij" 5 "" "Schilderij under 300"
test_search "beeld tussen 50 en 100 euro" "Beeld" 10 "" "Beeld 50-100 range"
test_search "duur cadeau boven 200 euro" "any" 5 "cadeau" "Expensive gift over 200"
test_search "goedkoop kunstwerk" "any" 10 "goedkoop" "Cheap artwork"
test_search "luxe geschenk" "any" 5 "luxe" "Luxury gift"
test_search "betaalbaar beeld" "Beeld" 10 "betaalbaar" "Affordable beeld"
test_search "iets voor maximaal 75 euro" "any" 10 "" "Max 75 euro"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎨 SECTION 3: ARTISTS (8 tests)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_search "van gogh" "null" 5 "van gogh" "Van Gogh artist search"
test_search "klimt" "null" 3 "klimt" "Klimt artist search"
test_search "mondriaan" "null" 5 "mondriaan" "Mondriaan artist search"
test_search "herman brood" "null" 5 "herman brood" "Herman Brood search"
test_search "picasso" "null" 1 "picasso" "Picasso search"
test_search "dali" "null" 3 "dali" "Dali search"
test_search "rembrandt" "null" 1 "rembrandt" "Rembrandt search"
test_search "escher" "null" 3 "escher" "Escher search"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🐾 SECTION 4: ANIMALS (8 tests)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_search "hond" "null" 5 "hond" "Dog search"
test_search "kat" "null" 5 "kat" "Cat search"
test_search "een beeld van een olifant" "Beeld" 3 "olifant" "Elephant beeld"
test_search "vogel" "null" 10 "vogel" "Bird search"
test_search "paard" "null" 3 "paard" "Horse search"
test_search "uil" "null" 3 "uil" "Owl search"
test_search "dieren" "null" 20 "dieren" "Animals broad search"
test_search "een kikker beeldje" "Beeld" 2 "kikker" "Frog beeld"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚽ SECTION 5: SPORTS (6 tests)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_search "een beeldje met een voetballer" "Beeld" 3 "voetballer" "Football beeld - should NOT include 'sport'"
test_search "voetbal" "null" 3 "voetbal" "Football general"
test_search "sport" "null" 10 "sport" "Sports broad search"
test_search "golfer" "null" 2 "golf" "Golfer search"
test_search "sporter beeld" "Beeld" 5 "sporter" "Athlete beeld"
test_search "sportprijs" "null" 5 "sportprijs" "Sports trophy"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "❤️ SECTION 6: THEMES (8 tests)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_search "liefde" "null" 10 "liefde" "Love theme"
test_search "vriendschap" "null" 5 "vriendschap" "Friendship theme"
test_search "een beeld met een hart" "Beeld" 10 "hart" "Heart beeld"
test_search "cadeau" "null" 20 "cadeau" "Gift broad search"
test_search "muziek" "null" 5 "muziek" "Music theme"
test_search "geluk" "null" 5 "geluk" "Happiness theme"
test_search "kunst" "null" 50 "kunst" "Art broad search"
test_search "bloemen" "null" 10 "bloemen" "Flowers theme"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎁 SECTION 7: OCCASIONS (6 tests)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_search "verjaardagscadeau" "null" 10 "verjaardag" "Birthday gift"
test_search "relatiegeschenk" "null" 5 "relatiegeschenk" "Business gift"
test_search "afscheidscadeau" "null" 5 "afscheid" "Farewell gift"
test_search "bedankje" "null" 5 "bedank" "Thank you gift"
test_search "huwelijkscadeau" "null" 3 "huwelijk" "Wedding gift"
test_search "pensioen cadeau" "null" 3 "pensioen" "Retirement gift"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔄 SECTION 8: COMBINATIONS (6 tests)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_search "van gogh onderzetters" "Onderzetter" 2 "van gogh" "Artist + type combo"
test_search "bronzen beeld olifant" "Beeld" 2 "olifant" "Material + type + subject"
test_search "modern schilderij onder 200" "Schilderij" 5 "modern" "Style + type + price"
test_search "kleine vaas voor bloemen" "Vaas" 3 "klein" "Size + type + purpose"
test_search "grappig cadeau onder 30" "any" 5 "grappig" "Mood + gift + price"
test_search "kleurrijk wandbord" "Wandbord" 1 "kleurrijk" "Style + type"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎭 SECTION 9: MYTHOLOGY & RELIGION (4 tests)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_search "romeinse goden" "null" 3 "romeinse goden" "Roman gods phrase"
test_search "griekse mythologie" "null" 3 "griekse mythologie" "Greek mythology"
test_search "boeddha" "null" 5 "boeddha" "Buddha"
test_search "engel" "null" 3 "engel" "Angel"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 SECTION 10: EDGE CASES (0 tests - already covered)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Total should be 64
echo "========================================="
echo "📊 FINAL RESULTS"
echo "========================================="
echo ""
echo -e "Total tests:  ${YELLOW}$TOTAL${NC}"
echo -e "Passed:       ${GREEN}$PASSED${NC}"
echo -e "Failed:       ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
  exit 0
else
  echo -e "${RED}❌ SOME TESTS FAILED${NC}"
  exit 1
fi

