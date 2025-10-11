#!/bin/bash

# Re-embed all products with new AI-enriched data

BATCH_SIZE=100
TOTAL_PRODUCTS=955

echo "🔮 Starting re-embedding for all products with AI-enriched data..."
echo "Batch size: $BATCH_SIZE products per request"

BATCHES=$(( ($TOTAL_PRODUCTS + $BATCH_SIZE - 1) / $BATCH_SIZE ))
echo "Total batches: $BATCHES"
echo ""

for i in $(seq 0 $(($BATCHES - 1))); do
  OFFSET=$(($i * $BATCH_SIZE))
  echo "📦 Batch $((i + 1))/$BATCHES (offset: $OFFSET)..."
  
  RESPONSE=$(curl -s -X POST "https://kunstpakket-sync.lotapi.workers.dev/sync/embeddings?offset=$OFFSET&limit=$BATCH_SIZE&wait=1")
  
  # Parse response
  COUNT=$(echo "$RESPONSE" | jq -r '.count // 0')
  DONE=$(echo "$RESPONSE" | jq -r '.done // false')
  ERROR=$(echo "$RESPONSE" | jq -r '.error // empty')
  
  if [ -n "$ERROR" ]; then
    echo "❌ Error: $ERROR"
    exit 1
  fi
  
  echo "✅ Embedded $COUNT products"
  
  if [ "$DONE" = "true" ]; then
    echo ""
    echo "🎉 All products re-embedded with AI data!"
    exit 0
  fi
  
  echo ""
  
  # Small delay
  sleep 1
done

echo ""
echo "🎉 Re-embedding complete!"

