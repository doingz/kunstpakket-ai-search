/**
 * Kunstpakket AI Search - Fullscreen Overlay Version
 * Usage: Add search bar to .container-bar, opens fullscreen overlay with results
 */
(function() {
  'use strict';
  
  const VERSION = '5.1.0';
  const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api'
    : 'https://kunstpakket.bluestars.app/api';
  const ANALYTICS_API = 'https://analytics.bluestars.app/api/track';
  
  // LIVE MODE - set to true to enable widget for all users
  const LIVE = true;  // Change to false to require ?f=1 parameter
  
  let isSearching = false;
  let currentResults = null;
  let currentSort = 'popular';
  
  /**
   * Analytics tracking
   */
  function trackSearch(searchId, query, resultCount) {
    try {
      // searchId is now passed as parameter (already in sessionStorage)
      fetch(ANALYTICS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'search',
          client_id: 'kunstpakket.nl',
          search_id: searchId,
          query: query,
          result_count: resultCount
        })
      }).catch(err => console.warn('[Analytics] Search tracking failed:', err));
    } catch (err) {
      console.warn('[Analytics] Error:', err);
    }
  }
  
  function trackProductClick(productId, productUrl) {
    try {
      const searchId = sessionStorage.getItem('kp_search_id');
      if (!searchId) return;
      
      sessionStorage.setItem('kp_last_product_id', productId);
      sessionStorage.setItem('kp_last_product_url', productUrl);
      
      const data = JSON.stringify({
        event: 'click',
        client_id: 'kunstpakket.nl',
        search_id: searchId,
        product_id: productId,
        product_url: productUrl
      });
      
      // Use sendBeacon for iOS Safari compatibility (works even when page unloads)
      if (navigator.sendBeacon) {
        const blob = new Blob([data], { type: 'application/json' });
        navigator.sendBeacon(ANALYTICS_API, blob);
      } else {
        // Fallback to fetch with keepalive
        fetch(ANALYTICS_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: data,
          keepalive: true  // Keep request alive during navigation
        }).catch(err => console.warn('[Analytics] Click tracking failed:', err));
      }
    } catch (err) {
      console.warn('[Analytics] Error:', err);
    }
  }
  
  function trackPurchase() {
    try {
      const searchId = sessionStorage.getItem('kp_search_id');
      if (!searchId) return;
      
      const productId = sessionStorage.getItem('kp_last_product_id');
      const productUrl = sessionStorage.getItem('kp_last_product_url');
      
      fetch(ANALYTICS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'purchase',
          client_id: 'kunstpakket.nl',
          search_id: searchId,
          product_id: productId || null,
          product_url: productUrl || null
        })
      }).catch(err => console.warn('[Analytics] Purchase tracking failed:', err));
      
      sessionStorage.removeItem('kp_search_id');
      sessionStorage.removeItem('kp_last_product_id');
      sessionStorage.removeItem('kp_last_product_url');
      sessionStorage.removeItem('kp_last_query');
    } catch (err) {
      console.warn('[Analytics] Error:', err);
    }
  }
  
  function checkPurchasePage() {
    const url = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();
    
    if (url.includes('/thankyou') || 
        url.includes('?thankyou') ||
        url.includes('/bedankt') ||
        url.includes('?bedankt') ||
        url.includes('/thank-you') ||
        url.includes('/success') ||
        url.includes('?order=success') ||
        title.includes('bedankt') ||
        title.includes('thank you')) {
      trackPurchase();
    }
  }
  
  /**
   * Check for click tracking parameter (iOS Safari proof!)
   * URL format: ?bsclick=1&bssid=search_id&bspid=product_id&bspname=product_name
   * All params prefixed with 'bs' to prevent Lightspeed filtering
   */
  function checkClickTracking() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      
      // Debug: always log if we're checking
      if (urlParams.has('bsclick')) {
        console.log('[KP Search] bsclick parameter detected in URL');
      }
      
      if (urlParams.get('bsclick') === '1') {
        const searchId = urlParams.get('bssid');  // Changed from 'sid' to 'bssid'
        const productId = urlParams.get('bspid');  // Changed from 'pid' to 'bspid'
        const productName = urlParams.get('bspname'); // Changed from 'pname' to 'bspname'
        
        if (searchId && productId) {
          console.log('[KP Search] Click tracking detected:', { searchId, productId, productName });
          
          const data = JSON.stringify({
            event: 'click',
            client_id: 'kunstpakket.nl',
            search_id: searchId,
            product_id: productId,
            product_name: productName || null, // Include product name for easy analytics!
            product_url: window.location.pathname.replace('.html', '').replace('/', '')
          });
          
          // Use fetch with keepalive (more reliable than sendBeacon for CORS)
          fetch(ANALYTICS_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: data,
            keepalive: true,
            mode: 'cors',
            credentials: 'omit'  // Don't send cookies (fixes CORS)
          })
          .then(() => console.log('[KP Search] Click tracked ✅'))
          .catch(err => console.warn('[KP Search] Click tracking failed:', err.message));
          
          // Clean up URL (remove tracking params)
          urlParams.delete('bsclick');
          urlParams.delete('bssid');   // Changed from 'sid'
          urlParams.delete('bspid');   // Changed from 'pid'
          urlParams.delete('bspname'); // Changed from 'pname'
          
          const newSearch = urlParams.toString();
          const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '');
          window.history.replaceState({}, '', newUrl);
        }
      }
    } catch (err) {
      console.warn('[KP Search] Click tracking error:', err);
    }
  }
  
  /**
   * Inject search bar after #header
   */
  function injectSearchBar() {
    // Don't show search bar on cart or checkout pages
    const url = window.location.href.toLowerCase();
    if (url.includes('cart') || url.includes('checkout')) {
      console.log('[KP Search] Skipping search bar on cart/checkout page');
      return;
    }
    
    const header = document.querySelector('#header');
    if (!header) {
      console.warn('[KP Search] #header not found');
      return;
    }
    
    const searchBar = document.createElement('div');
    searchBar.id = 'kp-search-bar';
    searchBar.innerHTML = `
      <div class="kp-search-wrapper">
        <input 
          type="search" 
          id="kp-search-input-bar" 
          placeholder="Zoek naar een kunstcadeau"
          autocomplete="off"
          enterkeyhint="search"
        />
        <button id="kp-search-button-bar" class="kp-ai-search-btn" aria-label="Zoeken">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="2">
            <path d="M16.269 18.626c-1.526 1.267-3.502 2.032-5.661 2.032-4.834 0-8.749-3.834-8.749-8.543s3.915-8.543 8.749-8.543c.483 0 .957.038 1.419.112a.8.8 0 1 1-.252 1.58 7.41 7.41 0 0 0-1.167-.092c-3.94 0-7.149 3.105-7.149 6.943s3.209 6.943 7.149 6.943c1.959 0 3.737-.767 5.03-2.01a.83.83 0 0 1 .072-.084.81.81 0 0 1 .102-.089c.999-1.029 1.678-2.356 1.881-3.829a.8.8 0 1 1 1.585.219 8.41 8.41 0 0 1-1.876 4.231l3.92 3.819a.8.8 0 0 1-1.116 1.146l-3.936-3.834zM18.7 1.313l.836 1.805 1.853.814-1.853.814-.836 1.805-.836-1.805-1.853-.814 1.853-.814.836-1.805zm-4.462 3.317l1.216 2.625 2.695 1.185-2.695 1.185-1.216 2.625-1.216-2.625-2.695-1.185 2.695-1.185 1.216-2.625zm5.79 3.526l.657 1.419 1.457.64-1.457.64-.657 1.419-.657-1.419-1.457-.64 1.457-.64.657-1.419z"/>
          </svg>
        </button>
      </div>
    `;
    
    // Insert after #header
    header.parentNode.insertBefore(searchBar, header.nextSibling);
    
    // Add event listeners
    const input = document.getElementById('kp-search-input-bar');
    const button = document.getElementById('kp-search-button-bar');
    
    const handleSearch = () => {
      const query = input.value.trim();
      if (query) {
        // Blur inline input to close mobile keyboard before opening overlay
        input.blur();
        openOverlay(query);
      }
    };
    
    button.addEventListener('click', handleSearch);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleSearch();
      }
    });
  }
  
  /**
   * Create fullscreen overlay
   */
  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'kp-search-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <div class="kp-overlay-content">
        <div class="kp-overlay-header">
          <div class="kp-search-box-overlay">
            <input 
              type="search" 
              id="kp-search-input-overlay" 
              placeholder="Zoek naar een kunstcadeau"
              autocomplete="off"
              enterkeyhint="search"
            />
            <button id="kp-search-button-overlay" class="kp-ai-search-btn-overlay" aria-label="Zoeken">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="2">
                <path d="M16.269 18.626c-1.526 1.267-3.502 2.032-5.661 2.032-4.834 0-8.749-3.834-8.749-8.543s3.915-8.543 8.749-8.543c.483 0 .957.038 1.419.112a.8.8 0 1 1-.252 1.58 7.41 7.41 0 0 0-1.167-.092c-3.94 0-7.149 3.105-7.149 6.943s3.209 6.943 7.149 6.943c1.959 0 3.737-.767 5.03-2.01a.83.83 0 0 1 .072-.084.81.81 0 0 1 .102-.089c.999-1.029 1.678-2.356 1.881-3.829a.8.8 0 1 1 1.585.219 8.41 8.41 0 0 1-1.876 4.231l3.92 3.819a.8.8 0 0 1-1.116 1.146l-3.936-3.834zM18.7 1.313l.836 1.805 1.853.814-1.853.814-.836 1.805-.836-1.805-1.853-.814 1.853-.814.836-1.805zm-4.462 3.317l1.216 2.625 2.695 1.185-2.695 1.185-1.216 2.625-1.216-2.625-2.695-1.185 2.695-1.185 1.216-2.625zm5.79 3.526l.657 1.419 1.457.64-1.457.64-.657 1.419-.657-1.419-1.457-.64 1.457-.64.657-1.419z"/>
              </svg>
            </button>
          </div>
          <button class="kp-close-button" id="kp-close-overlay">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div id="kp-search-results-overlay"></div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Event listeners
    document.getElementById('kp-close-overlay').addEventListener('click', closeOverlay);
    document.getElementById('kp-search-button-overlay').addEventListener('click', () => {
      const input = document.getElementById('kp-search-input-overlay');
      const query = input.value.trim();
      if (query) {
        performSearch(query);
        // Close keyboard on mobile after search
        setTimeout(() => input.blur(), 100);
      }
    });
    document.getElementById('kp-search-input-overlay').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const query = e.target.value.trim();
        if (query) {
          performSearch(query);
          // Close keyboard on mobile after search
          setTimeout(() => e.target.blur(), 100);
        }
      }
    });
    
    // Close on background click
    overlay.addEventListener('click', (e) => {
      if (e.target.id === 'kp-search-overlay') {
        closeOverlay();
      }
    });
    
    // Close on ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.style.display === 'flex') {
        closeOverlay();
      }
    });
  }
  
  function openOverlay(query = '') {
    const overlay = document.getElementById('kp-search-overlay');
    const input = document.getElementById('kp-search-input-overlay');
    
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    if (query) {
      input.value = query;
      performSearch(query);
      
      // Blur input after search to close keyboard on mobile
      setTimeout(() => {
        input.blur();
      }, 100);
    } else {
      // Only focus if no query (empty overlay)
      input.focus();
    }
  }
  
  function closeOverlay() {
    const overlay = document.getElementById('kp-search-overlay');
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }
  
  /**
   * Perform search
   */
  async function performSearch(query) {
    if (isSearching) return;
    
    isSearching = true;
    const resultsContainer = document.getElementById('kp-search-results-overlay');
    const button = document.getElementById('kp-search-button-overlay');
    
    button.disabled = true;
    resultsContainer.innerHTML = '<div class="kp-loading"><span class="kp-dots"><span></span><span></span><span></span></span></div>';
    
    // Generate search_id BEFORE search (so it's available for URL generation)
    const searchId = crypto.randomUUID();
    sessionStorage.setItem('kp_search_id', searchId);
    sessionStorage.setItem('kp_last_query', query);
    
    try {
      const response = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 1000 })
      });
      
      if (!response.ok) throw new Error('Search failed');
      
      const data = await response.json();
      currentResults = data;
      
      const resultCount = data.results?.total || data.results?.items?.length || 0;
      
      // Track search with pre-generated searchId
      trackSearch(searchId, query, resultCount);
      
      renderResults(data);
      
    } catch (error) {
      console.error('[KP Search] Error:', error);
      resultsContainer.innerHTML = '<div class="kp-error">⚠️ Er ging iets mis. Probeer opnieuw.</div>';
    } finally {
      isSearching = false;
      button.disabled = false;
    }
  }
  
  /**
   * Render results
   */
  function renderResults(data) {
    const container = document.getElementById('kp-search-results-overlay');
    
    // No results - show helpful message in same style as AI intro
    if (!data.success || !data.results?.items || data.results.items.length === 0) {
      const adviceText = data.results?.advice || '✨ Laten we je zoekopdracht verfijnen! Probeer bijvoorbeeld: "kat beeld onder 50 euro", "sportbeeld max 100 euro", of "bloemen vaas onder 80 euro".';
      
      container.innerHTML = `
        <div class="kp-ai-intro">
          <div class="kp-ai-intro-text">
            ${escapeHtml(adviceText)}
          </div>
          <button class="kp-search-again-btn" id="kp-search-again-empty">Zoek opnieuw</button>
        </div>
      `;
      
      // Add click handler for search again button
      setTimeout(() => {
        const btn = document.getElementById('kp-search-again-empty');
        if (btn) {
          btn.addEventListener('click', () => {
            const input = document.getElementById('kp-search-input-overlay');
            if (input) {
              input.value = '';
              input.focus();
            }
          });
        }
      }, 100);
      
      return;
    }
    
    const products = filterAndSortProducts(data.results.items);
    const saleCount = products.filter(p => p.onSale).length;
    
    let html = '';
    
    // Add AI advice if available (no wrapper needed - has its own margin)
    if (data.results.advice) {
      html += `
        <div class="kp-ai-intro">
          <div class="kp-ai-intro-text">${escapeHtml(data.results.advice)}</div>
        </div>
      `;
    }
    
    // Wrap results content in container with padding
    html += `<div class="kp-results-content">`;
    
    html += `
      <div class="kp-results-header">
        <div class="kp-results-count">
          ${products.length} ${products.length === 1 ? 'product' : 'producten'} gevonden
        </div>
        <div class="kp-controls">
          <select id="kp-sort-select" class="kp-select">
            <option value="popular">Populair</option>
            <option value="price-asc">Prijs (laag → hoog)</option>
            <option value="price-desc">Prijs (hoog → laag)</option>
            ${saleCount > 0 ? '<option value="discount">Hoogste korting</option>' : ''}
          </select>
        </div>
      </div>
      <div class="kp-products-grid">
    `;
    
    const searchId = sessionStorage.getItem('kp_search_id') || '';
    
    products.forEach(product => {
      const imageUrl = getOptimizedImageUrl(product.image);
      
      // Add tracking params to URL for reliable click tracking (iOS Safari proof!)
      // Include product name for easy analytics without database lookup!
      // All params prefixed with 'bs' so Lightspeed doesn't filter them
      const productName = encodeURIComponent(product.title);
      const trackingUrl = `https://www.kunstpakket.nl/${product.url}.html?bsclick=1&bssid=${searchId}&bspid=${product.id}&bspname=${productName}`;
      
      html += `
        <a href="${trackingUrl}" 
           class="kp-product-card" 
           data-product-id="${product.id}"
           data-product-url="${product.url}">
          ${product.image ? `<img src="${imageUrl}" alt="${escapeHtml(product.title)}" loading="lazy" />` : '<div class="kp-no-image"></div>'}
          <div class="kp-product-info">
            ${product.isPopular || product.isScarce ? `
              <div class="kp-product-badges">
                ${product.isPopular ? `<span class="kp-badge kp-badge-popular">Populair</span>` : ''}
                ${product.isScarce ? `<span class="kp-badge kp-badge-scarce">${product.stock} op voorraad</span>` : ''}
              </div>
            ` : ''}
            <div class="kp-product-title">${escapeHtml(product.title)}</div>
            ${product.dimensions ? `<div class="kp-product-dimensions">Afmetingen: ${escapeHtml(product.dimensions)}</div>` : ''}
            ${product.price ? `
              <div class="kp-product-pricing">
                <div class="kp-product-price">
                  €${product.price.toFixed(2)}
                  <span class="kp-price-vat">incl. BTW</span>
                </div>
                ${product.oldPrice ? `<div class="kp-product-old-price">€${product.oldPrice.toFixed(2)}</div>` : ''}
                ${product.onSale ? `<span class="kp-sale-tag">-${product.discount}%</span>` : ''}
              </div>
            ` : ''}
          </div>
        </a>
      `;
    });
    
    html += '</div>'; // Close products-grid
    html += '</div>'; // Close results-content wrapper
    container.innerHTML = html;
    
    // Restore current sort selection
    const sortSelect = document.getElementById('kp-sort-select');
    if (sortSelect) {
      sortSelect.value = currentSort;
      
      // Attach event listener
      sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderResults(currentResults);
      });
    }
    
    // Note: Click tracking now happens via URL params (?bsclick=1&sid=...&pid=...)
    // This is much more reliable than event listeners, especially on iOS Safari!
  }
  
  function filterAndSortProducts(products) {
    let sorted = [...products];
    
    switch (currentSort) {
      case 'price-asc':
        sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'price-desc':
        sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case 'discount':
        sorted.sort((a, b) => (b.discount || 0) - (a.discount || 0));
        break;
      case 'popular':
      default:
        sorted.sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0));
        break;
    }
    
    return sorted;
  }
  
  function getOptimizedImageUrl(imageUrl) {
    if (!imageUrl) return null;
    const match = imageUrl.match(/(.+\/files\/\d+)\/(.+)$/);
    return match ? `${match[1]}/350x350x2/${match[2]}` : imageUrl;
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * Inject styles
   */
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* Search bar after #header */
      
      /* Hide default search bars */
      #header-search,
      #subheader-search {
        display: none !important;
      }
      
      /* Fix sidebar z-index */
      #wwkSidebar,
      #wwkSidebarMobile {
        z-index: 800 !important;
      }
      
      /* Remove top padding from container-bar */
      .container-bar {
        padding-top: 0 !important;
      }
      
      #kp-search-bar {
        flex: 1;
        display: block;
        max-width: 800px;
        margin: 0 auto;
        padding: 40px 16px;
      }
      
      .kp-search-wrapper {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        max-width: 600px;
        margin: 0 auto;
        background: #f6f6f6;
        border: none;
        border-radius: 12px;
        padding: 12px 16px;
        transition: all 0.2s;
      }
      
      .kp-search-wrapper:focus-within {
        background: #ececec;
      }
      
      #kp-search-input-bar {
        flex: 1;
        border: none;
        outline: none;
        padding: 0;
        font-size: 15px;
        color: #1e293b;
        background: transparent;
      }
      
      /* Remove browser default clear button */
      #kp-search-input-bar::-webkit-search-cancel-button {
        -webkit-appearance: none;
        appearance: none;
      }
      
      #kp-search-input-bar::placeholder {
        color: #64748b;
      }
      
      .kp-ai-search-btn {
        background: transparent;
        border: none;
        padding: 4px;
        cursor: pointer;
        transition: all 0.2s;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
      }
      
      .kp-ai-search-btn svg {
        display: block;
        fill: #1e293b;
        transition: all 0.2s;
      }
      
      .kp-ai-search-btn:hover {
        background: rgba(30, 41, 59, 0.08);
      }
      
      .kp-ai-search-btn:hover svg {
        fill: #f5876e;
        transform: scale(1.1);
      }
      
      .kp-ai-search-btn:active {
        transform: scale(0.95);
      }
      
      /* Help text under search bar */
      .kp-search-help {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        max-width: 600px;
        margin: 16px auto 0;
        padding: 0 20px;
        font-size: 13.5px;
        color: #64748b;
        line-height: 1.6;
      }
      
      .kp-help-icon {
        flex-shrink: 0;
        color: #1e293b;
        margin-top: 3px;
      }
      
      .kp-help-text {
        flex: 1;
      }
      
      /* Fullscreen overlay */
      #kp-search-overlay {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: white;
        z-index: 999999;
        overflow-y: auto;
      }
      
      .kp-overlay-content {
        background: white;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      
      .kp-overlay-header {
        position: sticky;
        top: 0;
        background: white;
        padding: 24px;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        z-index: 10;
      }
      
      .kp-search-box-overlay {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: 640px;
        background: #f6f6f6;
        border: none;
        border-radius: 12px;
        padding: 12px 16px;
        transition: all 0.2s;
      }
      
      .kp-search-box-overlay:focus-within {
        background: #ececec;
      }
      
      #kp-search-input-overlay {
        flex: 1;
        border: none;
        outline: none;
        padding: 0;
        font-size: 15px;
        color: #1e293b;
        background: transparent;
      }
      
      /* Remove browser default clear button */
      #kp-search-input-overlay::-webkit-search-cancel-button {
        -webkit-appearance: none;
        appearance: none;
      }
      
      #kp-search-input-overlay::placeholder {
        color: #64748b;
      }
      
      .kp-ai-search-btn-overlay {
        background: transparent;
        border: none;
        padding: 4px;
        cursor: pointer;
        transition: all 0.2s;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
      }
      
      .kp-ai-search-btn-overlay svg {
        display: block;
        fill: #1e293b;
        transition: all 0.2s;
      }
      
      .kp-ai-search-btn-overlay:hover {
        background: rgba(30, 41, 59, 0.08);
      }
      
      .kp-ai-search-btn-overlay:hover svg {
        fill: #f5876e;
        transform: scale(1.1);
      }
      
      .kp-ai-search-btn-overlay:active {
        transform: scale(0.95);
      }
      
      .kp-close-button {
        width: 48px;
        height: 48px;
        border: none;
        background: #f1f5f9;
        border-radius: 50%;
        color: #64748b;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        flex-shrink: 0;
        padding: 0;
      }
      
      .kp-close-button svg {
        width: 24px;
        height: 24px;
      }
      
      .kp-close-button:hover {
        background: #e2e8f0;
        color: #334155;
        transform: rotate(90deg);
      }
      
      #kp-search-results-overlay {
        padding: 0;
        overflow-y: auto;
      }
      
      .kp-loading, .kp-error, .kp-no-results {
        text-align: center;
        padding: 60px 20px;
        font-size: 18px;
        color: #64748b;
      }
      
      .kp-dots {
        display: flex;
        gap: 12px;
        justify-content: center;
        align-items: center;
      }
      
      .kp-dots span {
        width: 16px;
        height: 16px;
        background: #64748b;
        border-radius: 50%;
        animation: kp-dot-pulse 1.4s infinite;
        opacity: 0;
      }
      
      .kp-dots span:nth-child(1) {
        animation-delay: 0s;
      }
      
      .kp-dots span:nth-child(2) {
        animation-delay: 0.2s;
      }
      
      .kp-dots span:nth-child(3) {
        animation-delay: 0.4s;
      }
      
      @keyframes kp-dot-pulse {
        0%, 80%, 100% {
          transform: scale(0);
          opacity: 0;
        }
        40% {
          transform: scale(1);
          opacity: 1;
        }
      }
      
      .kp-error {
        color: #ef4444;
      }
      
      .kp-ai-intro {
        background: #fefbf3;
        padding: 24px 28px;
        border-radius: 16px;
        margin: 24px;
        border: 1px solid #d4af37;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        max-width: 640px;
      }
      
      .kp-ai-intro-text {
        font-size: 16px;
        line-height: 1.8;
        color: #475569;
        margin-bottom: 20px;
      }
      
      .kp-search-again-btn {
        padding: 10px 20px;
        background: #1e293b;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .kp-search-again-btn:hover {
        background: #334155;
      }
      
      .kp-search-again-btn:active {
        background: #0f172a;
      }
      
      .kp-results-content {
        padding: 24px;
      }
      
      .kp-results-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
        flex-wrap: wrap;
        gap: 16px;
      }
      
      .kp-results-count {
        font-size: 18px;
        font-weight: 600;
        color: #1e293b;
      }
      
      .kp-controls {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      
      .kp-select {
        padding: 10px 32px 10px 14px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 14px;
        background: white;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 10px center;
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        cursor: pointer;
      }
      
      .kp-select:focus {
        outline: none;
        border-color: #f5876e;
        box-shadow: 0 0 0 3px rgba(245, 135, 110, 0.1);
      }
      
      .kp-products-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 24px;
      }
      
      .kp-product-card {
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        overflow: hidden;
        transition: all 0.2s;
        text-decoration: none;
        color: inherit;
        display: flex;
        flex-direction: column;
      }
      
      .kp-product-card:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        transform: translateY(-2px);
      }
      
      .kp-product-card img {
        width: 100%;
        aspect-ratio: 1;
        object-fit: cover;
      }
      
      .kp-no-image {
        width: 100%;
        aspect-ratio: 1;
        background: #f1f5f9;
      }
      
      .kp-product-info {
        padding: 16px;
        position: relative;
      }
      
      .kp-product-title {
        font-size: 15px;
        font-weight: 500;
        color: #1e293b;
        margin-bottom: 6px;
        line-height: 1.4;
      }
      
      .kp-product-badges {
        display: flex;
        gap: 6px;
        margin-bottom: 8px;
        flex-wrap: wrap;
      }
      
      .kp-badge {
        display: inline-block;
        padding: 3px 8px;
        font-size: 11px;
        font-weight: 500;
        border-radius: 3px;
        line-height: 1.2;
      }
      
      .kp-badge-popular {
        background: #000;
        color: #fff;
      }
      
      .kp-badge-scarce {
        background: #000;
        color: #fff;
      }
      
      .kp-sale-tag {
        display: inline-block;
        margin-left: 6px;
        padding: 2px 8px;
        background: #ef4444;
        color: white;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
      }
      
      .kp-product-dimensions {
        font-size: 12px;
        color: #94a3b8;
        margin-bottom: 8px;
      }
      
      .kp-product-pricing {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      
      .kp-product-price {
        font-size: 18px;
        font-weight: 700;
        color: #0f172a;
      }
      
      .kp-price-vat {
        font-size: 10px;
        font-weight: 400;
        color: #94a3b8;
        margin-left: 4px;
      }
      
      .kp-product-old-price {
        font-size: 15px;
        color: #94a3b8;
        text-decoration: line-through;
      }
      
      /* Responsive */
      @media (max-width: 1024px) {
        .kp-products-grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }
      
      @media (max-width: 640px) {
        #kp-search-bar {
          max-width: 100%;
          padding: 40px 12px;
        }
        
        #kp-search-input-bar {
          font-size: 16px;
        }
        
        .kp-overlay-header {
          padding: 16px;
          gap: 12px;
        }
        
        .kp-search-box-overlay {
          flex: 1;
        }
        
        #kp-search-input-overlay {
          font-size: 16px;
        }
        
        .kp-close-button {
          width: 40px;
          height: 40px;
        }
        
        .kp-close-button svg {
          width: 20px;
          height: 20px;
        }
        
        .kp-products-grid {
          grid-template-columns: 1fr;
        }
        
        .kp-results-header {
          flex-direction: column;
          align-items: stretch;
        }
        
        .kp-controls {
          flex-direction: column;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  /**
   * Check feature flags from server
   */
  async function checkFeatureFlags() {
    // HARDCODED: Require f=1 to enable widget
    return { widget_enabled: true, require_f1: true };
  }
  
  /**
   * Initialize
   */
  async function init() {
    console.log(`[KP Search Overlay] v${VERSION} loaded`);
    
    // Check purchase page (only track if user came from search)
    checkPurchasePage();
    
    // Check feature flags from server
    const flags = await checkFeatureFlags();
    
    if (!flags.widget_enabled) {
      console.log('[KP Search] Widget disabled globally (KILL-SWITCH ACTIVE 🔴)');
      // Clear any stored enabled state
      localStorage.removeItem('kp_search_enabled');
      return;
    }
    
    // Check if widget should be enabled (f=1 flag required)
    // Clear old localStorage from when widget was public
    const storedVersion = localStorage.getItem('kp_search_version');
    if (storedVersion !== VERSION) {
      // New version - reset everything
      localStorage.removeItem('kp_search_enabled');
      localStorage.setItem('kp_search_version', VERSION);
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    const hasF1 = urlParams.get('f') === '1';
    const enabled = localStorage.getItem('kp_search_enabled');
    
    // LIVE mode overrides server flag
    const requireF1 = LIVE ? false : flags.require_f1;
    
    if (LIVE) {
      console.log('[KP Search] 🟢 LIVE MODE - Widget enabled for all users');
      localStorage.setItem('kp_search_enabled', 'true');
    } else if (requireF1) {
      // Check if f=1 is required
      if (hasF1) {
        // Enable widget
        localStorage.setItem('kp_search_enabled', 'true');
      } else if (enabled !== 'true') {
        // Not enabled and no f=1 parameter
        console.log('[KP Search] Widget disabled (add ?f=1 to enable)');
        return;
      }
    } else {
      // Widget is enabled globally, no f=1 required
      localStorage.setItem('kp_search_enabled', 'true');
    }
    
    // Inject styles
    injectStyles();
    
    // Create overlay
    createOverlay();
    
    // Inject search bar
    injectSearchBar();
    
    console.log('[KP Search Overlay] Initialized ✅');
  }
  
  // Public API
  window.KunstpakketSearchOverlay = {
    version: VERSION,
    open: openOverlay,
    close: closeOverlay
  };
  
  // ALWAYS check for click tracking (even if widget is disabled!)
  // This must run on every page to track clicks from search results
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkClickTracking);
  } else {
    checkClickTracking();
  }
  
  // Auto-initialize widget
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();

