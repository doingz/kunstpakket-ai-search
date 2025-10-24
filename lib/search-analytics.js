/**
 * Search Analytics Integration
 * Tracks searches, clicks, and purchases to https://analytics.bluestars.app
 */

const ANALYTICS_API = 'https://analytics.bluestars.app/api/track';
const CLIENT_ID = 'kunstpakket.nl';

/**
 * Generate unique search ID
 */
function generateSearchId() {
  return crypto.randomUUID();
}

/**
 * Track event to analytics API
 */
async function trackEvent(eventData) {
  try {
    const response = await fetch(ANALYTICS_API, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        ...eventData
      })
    });
    
    if (!response.ok) {
      console.warn('[Analytics] Tracking failed:', await response.text());
    }
  } catch (error) {
    // Silent fail - don't break user experience
    console.warn('[Analytics] Tracking error:', error);
  }
}

/**
 * Track search query
 * Call this when user performs a search
 */
export function trackSearch(query, resultCount) {
  const searchId = generateSearchId();
  
  // Store search ID in sessionStorage for later click/purchase tracking
  sessionStorage.setItem('kp_search_id', searchId);
  sessionStorage.setItem('kp_search_query', query);
  
  // Track the search
  trackEvent({
    event: 'search',
    search_id: searchId,
    query: query,
    result_count: resultCount
  });
  
  console.log('[Analytics] Search tracked:', { searchId, query, resultCount });
  
  return searchId;
}

/**
 * Track product click
 * Call this when user clicks on a product from search results
 */
export function trackProductClick(productId, productUrl) {
  const searchId = sessionStorage.getItem('kp_search_id');
  
  if (!searchId) {
    console.warn('[Analytics] No active search, click not tracked');
    return;
  }
  
  trackEvent({
    event: 'click',
    search_id: searchId,
    product_id: productId,
    product_url: productUrl
  });
  
  console.log('[Analytics] Click tracked:', { searchId, productId });
}

/**
 * Track purchase
 * Call this on the thank you / order success page
 */
export function trackPurchase() {
  const searchId = sessionStorage.getItem('kp_search_id');
  
  if (!searchId) {
    console.warn('[Analytics] No active search, purchase not tracked');
    return;
  }
  
  const query = sessionStorage.getItem('kp_search_query');
  
  trackEvent({
    event: 'purchase',
    search_id: searchId
  });
  
  console.log('[Analytics] Purchase tracked:', { searchId, query });
  
  // Clear search session after purchase
  sessionStorage.removeItem('kp_search_id');
  sessionStorage.removeItem('kp_search_query');
}

/**
 * Auto-detect and track purchase on thank you pages
 */
export function autoTrackPurchase() {
  // Detect common thank you page patterns
  const isThankYouPage = 
    window.location.pathname.includes('/bedankt') ||
    window.location.pathname.includes('/thank') ||
    window.location.pathname.includes('/success') ||
    window.location.pathname.includes('/order-complete') ||
    window.location.search.includes('order=success') ||
    document.title.toLowerCase().includes('bedankt');
  
  if (isThankYouPage) {
    trackPurchase();
  }
}

// Auto-init on page load
if (typeof window !== 'undefined') {
  // Check for purchase page on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoTrackPurchase);
  } else {
    autoTrackPurchase();
  }
}

