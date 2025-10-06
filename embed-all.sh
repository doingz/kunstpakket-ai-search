#!/bin/bash

# Script to embed all products in Vectorize in chunks (avoids timeout)

URL="https://kunstpakket-sync.lotapi.workers.dev/sync/embeddings"
CHUNK_SIZE=50  # 50 products per request (5 batches of 10)
TOTAL=910
offset=0

echo "🔮 Starting full embedding generation..."
echo "Total products: $TOTAL"
echo "Chunk size: $CHUNK_SIZE"
echo ""

while [ $offset -lt $TOTAL ]; do
  echo "[$offset-$((offset+CHUNK_SIZE))] Embedding..."
  
  result=$(curl -s -X POST "${URL}?offset=${offset}&limit=${CHUNK_SIZE}&wait=1")
  
  count=$(echo "$result" | jq -r '.count // 0')
  done=$(echo "$result" | jq -r '.done // false')
  error=$(echo "$result" | jq -r '.error // ""')
  
  if [ -n "$error" ] && [ "$error" != "null" ]; then
    echo "❌ Error: $error"
    exit 1
  fi
  
  echo "   ✅ Embedded $count products"
  
  if [ "$done" = "true" ]; then
    echo ""
    echo "🎉 All products embedded!"
    break
  fi
  
  offset=$((offset + CHUNK_SIZE))
  
  # Small delay to avoid rate limits
  sleep 2
done

echo ""
echo "Verifying vectorize count..."
curl -s -X POST https://frederique-ai.lotapi.workers.dev/kunstpakket_search \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "limit": 1000}' | jq '{total: .meta.total, ms: .meta.tookMs}'

