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

// Track purchase on thankyou page (temporary solution until webhook is available)
const trackPurchaseIfThankyou = async () => {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const isTestMode = params.get('thankyou') === 'true';
  
  // Check if this is the thankyou/success page OR test mode
  // Note: both /checkout/ and /checkouts/ (plural) are used
  const isThankyouPage = isTestMode ||
                         path.includes('/checkout/thank_you') || 
                         path.includes('/checkout/thankyou') ||
                         path.includes('/checkout/success') ||
                         path.includes('/checkouts/thankyou') ||
                         path.includes('/checkouts/thank_you') ||
                         path.includes('/checkouts/success');
  
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
    
    // Only track if interaction was within last 2 hours
    if (now - interactionTime > 2 * 60 * 60 * 1000) {
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

    // Send purchase event to analytics worker
    console.log('[Frederique] Tracking purchase:', {
      interaction_id: interaction.id,
      order_id: orderId,
      path: window.location.pathname
    });
    
    const response = await fetch('https://frederique-ai.lotapi.workers.dev/track-purchase-thankyou', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interaction_id: interaction.id,
        order_id: orderId,
        commission_amount: 10, // Fixed €10 per order (temporary)
        source: 'thankyou_page'
      })
    });

    const responseData = await response.json().catch(() => null);
    console.log('[Frederique] Purchase tracking response:', {
      status: response.status,
      ok: response.ok,
      data: responseData
    });

    if (!response.ok) {
      console.error('[Frederique] Purchase tracking failed:', responseData);
    }

    // Clear the interaction only if tracking was successful
    if (response.ok) {
      localStorage.removeItem('kp_last_interaction');
      console.log('[Frederique] Purchase tracked successfully and interaction cleared');
    } else {
      console.log('[Frederique] Keeping interaction in localStorage due to failed tracking');
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
