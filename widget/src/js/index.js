import { initWidget } from './widget.js';

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
  // Check if this is the thankyou page
  if (!window.location.pathname.includes('/checkout/thankyou')) {
    return;
  }

  // Check if we have a recent interaction in localStorage
  const lastInteraction = localStorage.getItem('kp_last_interaction');
  if (!lastInteraction) {
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
    const pathParts = window.location.pathname.split('/');
    const thankyouIndex = pathParts.indexOf('thankyou');
    const orderId = thankyouIndex >= 0 && pathParts[thankyouIndex + 1] 
      ? pathParts[thankyouIndex + 1] 
      : 'unknown';

    // Send purchase event to analytics worker
    await fetch('https://frederique-ai.lotapi.workers.dev/track-purchase-thankyou', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interaction_id: interaction.id,
        order_id: orderId,
        commission_amount: 10, // Fixed €10 per order (temporary)
        source: 'thankyou_page'
      })
    });

    // Clear the interaction after tracking
    localStorage.removeItem('kp_last_interaction');
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
    });
  } else {
    initWidget();
    trackPurchaseIfThankyou();
  }
} else {
  // Even if widget is not enabled, still track purchases
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackPurchaseIfThankyou);
  } else {
    trackPurchaseIfThankyou();
  }
}
