#!/bin/bash

# Test 16 diverse queries to validate AI-enriched search

API="https://frederique-ai.lotapi.workers.dev/ai-search"

echo "🔍 Testing 16 diverse search queries..."
echo "========================================"
echo ""

# Array of test queries with descriptions
declare -a queries=(
  "een mok voor koffie"
  "goedkoop beeld onder 50 euro"
  "schilderij ongeveer 300 euro"
  "cadeau voor moederdag"
  "abstract modern kunst"
  "Herman Brood"
  "bronzen beeld liefde"
  "vaas voor bloemen"
  "sportbeeld voetbal"
  "beeldje hart"
  "wanddecoratie"
  "exclusief cadeau 500 euro"
  "iets voor in de tuin"
  "kunstwerk voor kantoor"
  "iets romantisch"
  "cadeau voor kunstliefhebber"
)

for i in "${!queries[@]}"; do
  query="${queries[$i]}"
  num=$((i + 1))
  
  echo "📝 Test $num/16: \"$query\""
  echo "----------------------------------------"
  
  response=$(curl -s -X POST "$API" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"$query\", \"limit\": 3}")
  
  # Extract key info
  total=$(echo "$response" | jq -r '.products | length')
  message=$(echo "$response" | jq -r '.friendlyMessage' | cut -c 1-120)
  
  echo "💬 AI: $message..."
  echo "📊 Resultaten: $total producten"
  
  # Show top 3 products
  echo "$response" | jq -r '.products[0:3] | .[] | "   • \(.title) (€\(.price), score: \(.score | tonumber | . * 100 | round / 100))"'
  
  echo ""
  
  # Small delay
  sleep 0.5
done

echo "========================================"
echo "✅ All 16 tests completed!"

