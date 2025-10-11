#!/bin/bash

# Enrich all products with AI in batches
# Always uses offset=0 because the query filters WHERE ai_summary IS NULL

BATCH_SIZE=20
MAX_ITERATIONS=100  # Safety limit

echo "🤖 Starting AI enrichment for all products..."
echo "Batch size: $BATCH_SIZE products per request"
echo ""

BATCH_NUM=0

while [ $BATCH_NUM -lt $MAX_ITERATIONS ]; do
  BATCH_NUM=$((BATCH_NUM + 1))
  
  echo "📦 Batch $BATCH_NUM (offset: 0, always fetches non-enriched products)..."
  
  RESPONSE=$(curl -s -X POST "https://kunstpakket-sync.lotapi.workers.dev/sync/enrich?offset=0&limit=$BATCH_SIZE&wait=1")
  
  # Parse response
  COUNT=$(echo "$RESPONSE" | jq -r '.count // 0')
  TOTAL=$(echo "$RESPONSE" | jq -r '.total // 0')
  DONE=$(echo "$RESPONSE" | jq -r '.done // false')
  ERROR=$(echo "$RESPONSE" | jq -r '.error // empty')
  
  if [ -n "$ERROR" ]; then
    echo "❌ Error: $ERROR"
    exit 1
  fi
  
  echo "✅ Enriched $COUNT/$TOTAL products"
  
  # Stop if done or no products enriched
  if [ "$DONE" = "true" ] || [ "$COUNT" = "0" ]; then
    echo ""
    echo "🎉 All products enriched!"
    exit 0
  fi
  
  echo ""
  
  # Small delay to avoid rate limiting
  sleep 2
done

echo ""
echo "⚠️ Reached max iterations limit. Some products might not be enriched."

