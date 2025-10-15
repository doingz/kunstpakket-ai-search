import { initWidget, handleSearch } from './widget.js';
import { renderUI } from './ui.js';

// Check for ?frederique=open parameter IMMEDIATELY before anything else can modify URL
const urlParams = new URLSearchParams(window.location.search);
const shouldAutoOpen = urlParams.get('frederique') === 'open';
const autoSearchQuery = urlParams.get('search') || urlParams.get('query');

// Feature flag check: load if WIDGET_LIVE=true OR ?f=1 OR session enabled
const checkFeatureFlag = () => {
  // Check if widget is live (set by worker)
  if (window.__KP_WIDGET_LIVE__ === true) {
    return true;
  }
  
  // Check if manually enabled via ?f=1
  const params = new URLSearchParams(window.location.search);
  if (params.get('f') === '1') {
    sessionStorage.setItem('kp_widget_enabled', '1');
    return true;
  }
  
  // Check if session enabled
  const enabled = sessionStorage.getItem('kp_widget_enabled');
  return enabled === '1';
};

// Extract order items from thankyou page DOM (Lightspeed specific)
const extractOrderItems = () => {
  const items = [];
  
  try {
    // Try Lightspeed order items structure
    const orderItems = document.querySelectorAll('.order-item, .checkout-item, [class*="order-line"], [class*="product-line"]');
    
    orderItems.forEach(item => {
      // Try to find product name
      const nameEl = item.querySelector('.product-title, .item-title, .product-name, [class*="product-title"], [class*="item-name"]');
      const name = nameEl ? nameEl.textContent.trim() : '';
      
      // Try to find quantity
      const qtyEl = item.querySelector('.quantity, .qty, [class*="quantity"]');
      const quantity = qtyEl ? parseInt(qtyEl.textContent.trim()) || 1 : 1;
      
      // Try to find price
      const priceEl = item.querySelector('.price, .item-price, [class*="price"]');
      const priceText = priceEl ? priceEl.textContent.trim() : '';
      const price = parseFloat(priceText.replace(/[^0-9,.]/g, '').replace(',', '.')) || 0;
      
      if (name) {
        items.push({
          name: name,
          title: name,
          quantity: quantity,
          price: price
        });
      }
    });
    
    console.log('[Frederique] Extracted items from DOM:', items);
  } catch (err) {
    console.error('[Frederique] Failed to extract order items:', err);
  }
  
  return items;
};

// Extract order total from thankyou page DOM
const extractOrderTotal = () => {
  try {
    // Try to find order total in various common locations
    const totalSelectors = [
      '.order-total .price',
      '.total-price',
      '[class*="order-total"]',
      '[class*="grand-total"]',
      '.checkout-total',
      '#order-total'
    ];
    
    for (const selector of totalSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.textContent.trim();
        const total = parseFloat(text.replace(/[^0-9,.]/g, '').replace(',', '.'));
        if (total && total > 0) {
          console.log('[Frederique] Extracted order total:', total);
          return total;
        }
      }
    }
  } catch (err) {
    console.error('[Frederique] Failed to extract order total:', err);
  }
  
  return null;
};

// Track purchase on thankyou page (temporary solution until webhook is available)
const trackPurchaseIfThankyou = async () => {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const isTestMode = params.get('thankyou') === 'true';
  
  // Check if this is the thankyou/success page OR test mode
  // Support multiple e-commerce platforms (Lightspeed, WooCommerce, Shopify, etc.)
  const pathLower = path.toLowerCase();
  const isThankyouPage = isTestMode ||
                         pathLower.includes('/checkout/thank') || 
                         pathLower.includes('/checkout/success') ||
                         pathLower.includes('/checkouts/thank') ||
                         pathLower.includes('/checkouts/success') ||
                         pathLower.includes('/order-received') ||
                         pathLower.includes('/bedankt') ||
                         pathLower.includes('/dankjewel') ||
                         pathLower.includes('/payment-success') ||
                         pathLower.match(/\/(bestelling|order)-voltooid/);
  
  // Debug logging to console
  console.log('[Frederique] Purchase tracking check:', {
    path,
    isTestMode,
    isThankyouPage,
    hasInteraction: !!localStorage.getItem('kp_last_interaction')
  });
  
  if (!isThankyouPage) {
    return;
  }

  // Check if we have a recent interaction in localStorage
  let lastInteraction = localStorage.getItem('kp_last_interaction');
  
  // In test mode, create a fake interaction if none exists
  if (!lastInteraction && isTestMode) {
    console.log('[Frederique] Test mode: Creating fake interaction');
    lastInteraction = JSON.stringify({
      id: 'test-interaction-' + Date.now(),
      timestamp: new Date().toISOString(),
      query: 'test query'
    });
  }
  
  if (!lastInteraction) {
    console.log('[Frederique] No interaction found - skipping tracking');
    return;
  }

  try {
    const interaction = JSON.parse(lastInteraction);
    const interactionTime = new Date(interaction.timestamp).getTime();
    const now = Date.now();
    
    // Only track if interaction was within last 7 days (people can take time to decide)
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    if (now - interactionTime > sevenDaysInMs) {
      console.log('[Frederique] Interaction too old (>7 days), skipping tracking');
      return;
    }

    // Extract order_id from URL if available
    // URL format: /checkouts/thankyou/[order_id] or /checkout/thankyou/[order_id]
    const pathParts = path.split('/').filter(Boolean);
    const thankyouIndex = Math.max(
      pathParts.indexOf('thank_you'),
      pathParts.indexOf('thankyou'),
      pathParts.indexOf('success')
    );
    const orderId = thankyouIndex >= 0 && pathParts[thankyouIndex + 1] 
      ? pathParts[thankyouIndex + 1] 
      : 'unknown';

    // Get last clicked product from localStorage
    const lastClickedProduct = JSON.parse(localStorage.getItem('kp_last_clicked_product') || 'null');
    
    // Use last clicked product data instead of DOM scraping
    let orderTotal = 0;
    let items = [];
    
    if (lastClickedProduct) {
      orderTotal = lastClickedProduct.price;
      items = [{
        name: lastClickedProduct.name,
        title: lastClickedProduct.name,
        quantity: 1,
        price: lastClickedProduct.price,
        product_id: lastClickedProduct.id
      }];
      console.log('[Frederique] Using last clicked product data:', lastClickedProduct);
    } else {
      // Fallback: try DOM extraction (for iframe compatibility)
      const extractedItems = extractOrderItems();
      const extractedTotal = extractOrderTotal();
      if (extractedItems.length > 0) {
        items = extractedItems;
        orderTotal = extractedTotal || 0;
        console.log('[Frederique] Fallback: extracted from DOM');
      } else {
        console.log('[Frederique] No product data available (iframe issue)');
      }
    }

    // Send purchase event to analytics worker
    console.log('[Frederique] Tracking purchase:', {
      interaction_id: interaction.id,
      order_id: orderId,
      order_total: orderTotal,
      items_count: items.length,
      source: lastClickedProduct ? 'last_clicked_product' : 'dom_extraction',
      path: window.location.pathname
    });
    
    const response = await fetch('https://frederique-ai.lotapi.workers.dev/track-purchase-thankyou', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interaction_id: interaction.id,
        order_id: orderId,
        order_total: orderTotal,
        items: items,
        source: lastClickedProduct ? 'last_clicked_product' : 'thankyou_page'
      })
    });

    const responseData = await response.json().catch(() => null);
    console.log('[Frederique] Purchase tracking response:', {
      status: response.status,
      ok: response.ok,
      data: responseData
    });

    if (!response.ok) {
      console.error('[Frederique] ❌ Purchase tracking failed:', responseData);
    }

    // Clear the interaction and last clicked product only if tracking was successful
    if (response.ok) {
      localStorage.removeItem('kp_last_interaction');
      localStorage.removeItem('kp_last_clicked_product');
      console.log('[Frederique] ✅ Purchase tracked successfully! Interaction and product data cleared.');
      console.log('[Frederique] 💰 Commission: €10 for order', orderId);
    } else {
      console.log('[Frederique] ⚠️ Keeping interaction in localStorage due to failed tracking');
    }
  } catch (err) {
    console.error('Failed to track purchase:', err);
  }
};

// Initialize widget if enabled
if (checkFeatureFlag()) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initWidget();
      trackPurchaseIfThankyou();
      
      // Auto-open if ?frederique was in URL or auto-search if ?search was in URL
      if (shouldAutoOpen || autoSearchQuery) {
        setTimeout(() => {
          renderUI(autoSearchQuery || '');
          
          // If there's a search query, execute it after opening
          if (autoSearchQuery) {
            setTimeout(() => {
              handleSearch(autoSearchQuery);
            }, 300);
          }
        }, 500);
      }
    });
  } else {
    initWidget();
    trackPurchaseIfThankyou();
    
    // Auto-open if ?frederique was in URL or auto-search if ?search was in URL
    if (shouldAutoOpen || autoSearchQuery) {
      setTimeout(() => {
        renderUI(autoSearchQuery || '');
        
        // If there's a search query, execute it after opening
        if (autoSearchQuery) {
          setTimeout(() => {
            handleSearch(autoSearchQuery);
          }, 300);
        }
      }, 500);
    }
  }
} else {
  // Even if widget is not enabled, still track purchases
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackPurchaseIfThankyou);
  } else {
    trackPurchaseIfThankyou();
  }
}
