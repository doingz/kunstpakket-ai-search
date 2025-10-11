#!/bin/bash

# Re-index all products with new rich markdown embeddings
# This script calls the sync worker's /sync/embeddings endpoint in batches

WORKER_URL="https://kunstpakket-sync.lotapi.workers.dev"
BATCH_SIZE=100
TOTAL_PRODUCTS=2500  # Adjust based on your product count

echo "🚀 Starting full re-index with new rich markdown embeddings..."
echo "Worker: $WORKER_URL"
echo "Batch size: $BATCH_SIZE"
echo ""

# Counter for successful batches
SUCCESS=0
FAILED=0

for ((offset=0; offset<$TOTAL_PRODUCTS; offset+=$BATCH_SIZE)); do
    echo "📦 Processing batch at offset $offset..."
    
    # Call the embeddings endpoint (simpler approach for macOS compatibility)
    HTTP_STATUS=$(curl -s -o /tmp/reindex_response.json -w "%{http_code}" -X POST "${WORKER_URL}/sync/embeddings?offset=${offset}&limit=${BATCH_SIZE}&wait=1")
    HTTP_BODY=$(cat /tmp/reindex_response.json)
    
    if [ "$HTTP_STATUS" -eq 200 ]; then
        COUNT=$(echo "$HTTP_BODY" | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
        DONE=$(echo "$HTTP_BODY" | grep -o '"done":true')
        
        echo "✅ Batch completed: $COUNT products indexed"
        SUCCESS=$((SUCCESS + 1))
        
        # If done=true, we've reached the end
        if [ ! -z "$DONE" ]; then
            echo ""
            echo "🎉 All products re-indexed!"
            break
        fi
        
        # Small delay to avoid rate limiting
        sleep 1
    else
        echo "❌ Batch failed with HTTP $HTTP_STATUS"
        echo "Response: $HTTP_BODY"
        FAILED=$((FAILED + 1))
        
        # Continue anyway, might just be an empty batch
    fi
    
    echo ""
done

echo ""
echo "📊 Re-indexing Summary:"
echo "   ✅ Successful batches: $SUCCESS"
echo "   ❌ Failed batches: $FAILED"
echo ""
echo "Done! Your vector search now uses rich markdown embeddings 🎨"

