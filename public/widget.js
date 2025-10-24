/**
 * Kunstpakket AI Search Widget
 * Embed this on any page: <script src="https://kunstpakket.bluestars.app/widget.js"></script>
 */
(function() {
  'use strict';
  
  const WIDGET_VERSION = '2.0.0';  // Major update: Fullscreen overlay mode
  const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api'
    : 'https://kunstpakket.bluestars.app/api';
  const ANALYTICS_API = 'https://analytics.bluestars.app/api/track';
  
  // Configuration (can be overridden via data attributes)
  const config = {
    placeholder: 'Zoek naar kunst... bijv. "beeldje met hart max 80 euro"',
    buttonText: 'Zoeken',
    maxResults: 1000,  // Show ALL results
    mode: 'overlay'  // 'inline' (old) or 'overlay' (new fullscreen)
  };
  
  // Widget state
  let isSearching = false;
  let currentResults = null;
  let currentFilter = 'all';  // 'all' or 'sale'
  let currentSort = 'popular';  // 'popular', 'price-asc', 'price-desc', 'discount'
  
  /**
   * Analytics tracking functions
   */
  function trackSearch(query, resultCount) {
    try {
      const searchId = crypto.randomUUID();
      sessionStorage.setItem('kp_search_id', searchId);
      sessionStorage.setItem('kp_last_query', query);
      
      const payload = {
        event: 'search',
        client_id: 'kunstpakket.nl',
        search_id: searchId,
        query: query,
        result_count: resultCount
      };
      
      console.log('[Analytics] Tracking search:', payload);
      
      fetch(ANALYTICS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(err => console.warn('[Analytics] Search tracking failed:', err));
      
      console.log('[Analytics] Search tracked:', query, resultCount, 'results');
    } catch (err) {
      console.warn('[Analytics] Error:', err);
    }
  }
  
  function trackProductClick(productId, productUrl) {
    try {
      const searchId = sessionStorage.getItem('kp_search_id');
      if (!searchId) return;
      
      // Store clicked product for purchase attribution
      sessionStorage.setItem('kp_last_product_id', productId);
      sessionStorage.setItem('kp_last_product_url', productUrl);
      
      fetch(ANALYTICS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'click',
          client_id: 'kunstpakket.nl',
          search_id: searchId,
          product_id: productId,
          product_url: productUrl
        })
      }).catch(err => console.warn('[Analytics] Click tracking failed:', err));
      
      console.log('[Analytics] Click tracked:', productId);
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
      
      console.log('[Analytics] Purchase tracked');
      
      // Clear session data
      sessionStorage.removeItem('kp_search_id');
      sessionStorage.removeItem('kp_last_product_id');
      sessionStorage.removeItem('kp_last_product_url');
      sessionStorage.removeItem('kp_last_query');
    } catch (err) {
      console.warn('[Analytics] Error:', err);
    }
  }
  
  /**
   * Check if we're on a thank you page and track purchase
   */
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
      console.log('[Analytics] Thank you page detected, tracking purchase...');
      trackPurchase();
    }
  }
  
  /**
   * Check if widget should be shown
   */
  function shouldShowWidget() {
    // Check localStorage first (persists across page loads in same domain)
    const enabledFlag = localStorage.getItem('kp_search_enabled');
    console.log('[Widget] localStorage kp_search_enabled:', enabledFlag);
    
    if (enabledFlag === 'true') {
      console.log('[Widget] Widget enabled via localStorage');
      return true;
    }
    
    // Check URL for f=1 parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('f') === '1') {
      // Store in localStorage so it persists across pages and sessions
      localStorage.setItem('kp_search_enabled', 'true');
      console.log('[Widget] Widget enabled via ?f=1, stored in localStorage');
      return true;
    }
    
    console.log('[Widget] Widget not enabled (add ?f=1 to URL)');
    return false;
  }
  
  /**
   * Initialize widget
   */
  function init() {
    console.log(`[Kunstpakket AI Search] Widget v${WIDGET_VERSION} loaded`);
    
    // Check if we're on a thank you page (always check, even if widget is not shown)
    checkPurchasePage();
    
    // Check if widget should be shown
    if (!shouldShowWidget()) {
      console.log('[Kunstpakket AI Search] Widget not enabled (add ?f=1 to URL)');
      return;
    }
    
    // Check if already initialized
    if (document.getElementById('kp-ai-search-widget')) {
      console.warn('[Kunstpakket AI Search] Widget already initialized');
      return;
    }
    
    // Inject CSS
    injectStyles();
    
    // Create widget container
    const container = createWidgetHTML();
    
    // Find mount point (data-kp-search attribute or default)
    const mountPoint = document.querySelector('[data-kp-search]') || document.body;
    mountPoint.appendChild(container);
    
    // Attach event listeners
    attachEventListeners();
    
    console.log('[Kunstpakket AI Search] Widget initialized');
  }
  
  /**
   * Inject widget styles
   */
  function injectStyles() {
    const styles = `
      #kp-ai-search-widget {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        max-width: 800px;
        margin: 2rem auto;
        padding: 1rem;
      }
      
      .kp-search-box {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
      }
      
      .kp-search-input {
        flex: 1;
        padding: 0.75rem 1rem;
        font-size: 1rem;
        border: 2px solid #e2e8f0;
        border-radius: 8px;
        outline: none;
        transition: border-color 0.2s;
      }
      
      .kp-search-input:focus {
        border-color: #3b82f6;
      }
      
      .kp-search-button {
        padding: 0.75rem 2rem;
        font-size: 1rem;
        font-weight: 600;
        color: white;
        background: #3b82f6;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.2s;
      }
      
      .kp-search-button:hover {
        background: #2563eb;
      }
      
      .kp-search-button:disabled {
        background: #94a3b8;
        cursor: not-allowed;
      }
      
      .kp-loading {
        text-align: center;
        padding: 2rem;
        color: #64748b;
      }
      
      .kp-ai-advice {
        background: #f0f9ff;
        border-left: 4px solid #3b82f6;
        padding: 1rem;
        margin-bottom: 1.5rem;
        border-radius: 4px;
      }
      
      .kp-ai-advice-label {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        color: #3b82f6;
        margin-bottom: 0.5rem;
      }
      
      .kp-ai-advice-text {
        color: #1e40af;
        line-height: 1.6;
      }
      
      .kp-results-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        flex-wrap: wrap;
        gap: 1rem;
      }
      
      .kp-results-count {
        color: #64748b;
        font-size: 0.9rem;
      }
      
      .kp-controls {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
      
      .kp-control-group {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      
      .kp-control-label {
        font-size: 0.75rem;
        color: #64748b;
        font-weight: 500;
      }
      
      .kp-select {
        padding: 0.5rem 0.75rem;
        border: 1px solid #e2e8f0;
        border-radius: 4px;
        background: white;
        color: #1e293b;
        font-size: 0.875rem;
        cursor: pointer;
        transition: border-color 0.2s;
      }
      
      .kp-select:hover {
        border-color: #3b82f6;
      }
      
      .kp-select:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }
      
      .kp-results-grid {
        display: grid;
        gap: 1rem;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      }
      
      .kp-product-card {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        overflow: hidden;
        transition: transform 0.2s, box-shadow 0.2s;
        background: white;
      }
      
      .kp-product-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      }
      
      .kp-product-image {
        width: 100%;
        aspect-ratio: 1;
        object-fit: cover;
        background: #f1f5f9;
      }
      
      .kp-product-info {
        padding: 1rem;
        position: relative;
      }
      
      .kp-sale-badge {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        background: #ef4444;
        color: white;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 700;
      }
      
      .kp-product-title {
        font-weight: 600;
        margin-bottom: 0.5rem;
        color: #1e293b;
        font-size: 0.95rem;
        line-height: 1.4;
      }
      
      .kp-product-pricing {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      
      .kp-product-price {
        font-size: 1.25rem;
        font-weight: 700;
        color: #3b82f6;
      }
      
      .kp-product-old-price {
        font-size: 0.95rem;
        color: #94a3b8;
        text-decoration: line-through;
      }
      
      .kp-product-link {
        text-decoration: none;
        color: inherit;
      }
      
      .kp-error {
        background: #fef2f2;
        border-left: 4px solid #ef4444;
        padding: 1rem;
        border-radius: 4px;
        color: #991b1b;
      }
      
      @media (max-width: 640px) {
        .kp-search-box {
          flex-direction: column;
        }
        
        .kp-results-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }
  
  /**
   * Create widget HTML structure
   */
  function createWidgetHTML() {
    const widget = document.createElement('div');
    widget.id = 'kp-ai-search-widget';
    widget.innerHTML = `
      <div class="kp-search-box">
        <input 
          type="text" 
          class="kp-search-input" 
          placeholder="${config.placeholder}"
          id="kp-search-input"
        />
        <button class="kp-search-button" id="kp-search-button">
          ${config.buttonText}
        </button>
      </div>
      <div id="kp-search-results"></div>
    `;
    return widget;
  }
  
  /**
   * Attach event listeners
   */
  function attachEventListeners() {
    const input = document.getElementById('kp-search-input');
    const button = document.getElementById('kp-search-button');
    
    // Search on button click
    button.addEventListener('click', () => {
      const query = input.value.trim();
      if (query) performSearch(query);
    });
    
    // Search on Enter key
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const query = input.value.trim();
        if (query) performSearch(query);
      }
    });
  }
  
  /**
   * Perform search via API
   */
  async function performSearch(query) {
    if (isSearching) return;
    
    isSearching = true;
    const resultsContainer = document.getElementById('kp-search-results');
    const button = document.getElementById('kp-search-button');
    
    // Show loading state
    button.disabled = true;
    button.textContent = 'Zoeken...';
    resultsContainer.innerHTML = '<div class="kp-loading">🔍 Zoeken naar de perfecte producten...</div>';
    
    try {
      const response = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit: config.maxResults
        })
      });
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      currentResults = data;
      
      // Track search with correct result count
      const resultCount = data.results?.total || data.results?.items?.length || 0;
      console.log('[Widget] Search response:', { 
        total: data.results?.total, 
        itemsLength: data.results?.items?.length,
        resultCount 
      });
      trackSearch(query, resultCount);
      
      // Render results
      renderResults(data);
      
    } catch (error) {
      console.error('[Kunstpakket AI Search] Error:', error);
      resultsContainer.innerHTML = `
        <div class="kp-error">
          ⚠️ Er ging iets mis bij het zoeken. Probeer het opnieuw.
        </div>
      `;
    } finally {
      isSearching = false;
      button.disabled = false;
      button.textContent = config.buttonText;
    }
  }
  
  /**
   * Filter and sort products
   */
  function filterAndSortProducts(products) {
    let filtered = [...products];
    
    // Apply filter
    if (currentFilter === 'sale') {
      filtered = filtered.filter(p => p.onSale === true);
    }
    
    // Apply sort
    switch (currentSort) {
      case 'price-asc':
        filtered.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'price-desc':
        filtered.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case 'discount':
        filtered.sort((a, b) => (b.discount || 0) - (a.discount || 0));
        break;
      case 'popular':
      default:
        filtered.sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0));
        break;
    }
    
    return filtered;
  }
  
  /**
   * Render products grid
   */
  function renderProductsGrid(products) {
    let html = '<div class="kp-results-grid">';
    
    products.forEach((product, index) => {
      const isHighlighted = currentResults?.results?.highlighted?.includes(index);
      html += `
        <a href="https://www.kunstpakket.nl/${product.url}.html" 
           class="kp-product-link" 
           data-product-id="${product.id}"
           data-product-url="${product.url}">
          <div class="kp-product-card ${isHighlighted ? 'highlighted' : ''}">
            ${product.image ? `
              <img 
                src="${getOptimizedImageUrl(product.image)}" 
                alt="${escapeHtml(product.title)}"
                class="kp-product-image"
                loading="lazy"
              />
            ` : `
              <div class="kp-product-image"></div>
            `}
            <div class="kp-product-info">
              ${product.onSale ? `<div class="kp-sale-badge">-${product.discount}%</div>` : ''}
              <div class="kp-product-title">${escapeHtml(product.title)}</div>
              ${product.price && typeof product.price === 'number' ? `
                <div class="kp-product-pricing">
                  <div class="kp-product-price">€${product.price.toFixed(2)}</div>
                  ${product.oldPrice ? `
                    <div class="kp-product-old-price">€${product.oldPrice.toFixed(2)}</div>
                  ` : ''}
                </div>
              ` : ''}
            </div>
          </div>
        </a>
      `;
    });
    
    html += '</div>';
    return html;
  }
  
  /**
   * Render search results
   */
  function renderResults(data) {
    const resultsContainer = document.getElementById('kp-search-results');
    
    if (!data.success) {
      resultsContainer.innerHTML = `
        <div class="kp-error">
          ${data.suggestion || 'Er ging iets mis. Probeer een andere zoekopdracht.'}
        </div>
      `;
      return;
    }
    
    // Store results for filtering/sorting
    currentResults = data;
    const { results } = data;
    
    // No results
    if (results.total === 0) {
      resultsContainer.innerHTML = `
        <div class="kp-error">
          Geen producten gevonden. Probeer een andere zoekopdracht.
        </div>
      `;
      return;
    }
    
    let html = '';
    
    // AI Advice
    if (results.advice) {
      html += `
        <div class="kp-ai-advice">
          <div class="kp-ai-advice-label">AI Advies</div>
          <div class="kp-ai-advice-text">${results.advice}</div>
        </div>
      `;
    }
    
    // Apply filter and sort
    const products = filterAndSortProducts(results.items);
    const saleCount = results.items.filter(p => p.onSale).length;
    
    // Results header with count and controls
    html += `
      <div class="kp-results-header">
        <div class="kp-results-count">
          ${products.length} ${products.length === 1 ? 'product' : 'producten'} gevonden
          ${saleCount > 0 && currentFilter === 'all' ? ` (${saleCount} in de aanbieding)` : ''}
        </div>
        <div class="kp-controls">
          <div class="kp-control-group">
            <label class="kp-control-label">Filter</label>
            <select id="kp-filter-select" class="kp-select">
              <option value="all" ${currentFilter === 'all' ? 'selected' : ''}>Alle producten</option>
              <option value="sale" ${currentFilter === 'sale' ? 'selected' : ''}>Alleen aanbiedingen${saleCount > 0 ? ` (${saleCount})` : ''}</option>
            </select>
          </div>
          <div class="kp-control-group">
            <label class="kp-control-label">Sorteer op</label>
            <select id="kp-sort-select" class="kp-select">
              <option value="popular" ${currentSort === 'popular' ? 'selected' : ''}>Populair</option>
              <option value="price-asc" ${currentSort === 'price-asc' ? 'selected' : ''}>Prijs (laag → hoog)</option>
              <option value="price-desc" ${currentSort === 'price-desc' ? 'selected' : ''}>Prijs (hoog → laag)</option>
              ${saleCount > 0 ? `<option value="discount" ${currentSort === 'discount' ? 'selected' : ''}>Hoogste korting</option>` : ''}
            </select>
          </div>
        </div>
      </div>
    `;
    
    // Products grid
    html += renderProductsGrid(products);
    
    resultsContainer.innerHTML = html;
    
    // Attach event listeners for filter/sort
    const filterSelect = document.getElementById('kp-filter-select');
    const sortSelect = document.getElementById('kp-sort-select');
    
    if (filterSelect) {
      filterSelect.addEventListener('change', (e) => {
        currentFilter = e.target.value;
        renderResults(currentResults);
      });
    }
    
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderResults(currentResults);
      });
    }
    
    // Attach click tracking to product links
    const productLinks = resultsContainer.querySelectorAll('.kp-product-link');
    productLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        const productId = link.getAttribute('data-product-id');
        const productUrl = link.getAttribute('data-product-url');
        if (productId && productUrl) {
          trackProductClick(productId, productUrl);
        }
      });
    });
  }
  
  /**
   * Get optimized image URL (smaller size for better performance)
   */
  function getOptimizedImageUrl(imageUrl) {
    if (!imageUrl) return null;
    
    // Convert to 350x350 thumbnail format
    // From: https://cdn.webshopapp.com/shops/269557/files/486441724/image.jpg
    // To:   https://cdn.webshopapp.com/shops/269557/files/486441724/350x350x2/image.jpg
    const match = imageUrl.match(/(.+\/files\/\d+)\/(.+)$/);
    if (match) {
      return `${match[1]}/350x350x2/${match[2]}`;
    }
    
    return imageUrl; // Return original if pattern doesn't match
  }
  
  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * Public API
   */
  window.KunstpakketSearch = {
    version: WIDGET_VERSION,
    search: performSearch,
    getResults: () => currentResults,
    enable: () => {
      localStorage.setItem('kp_search_enabled', 'true');
      if (!document.getElementById('kp-ai-search-widget')) {
        init();
      }
    },
    disable: () => {
      localStorage.removeItem('kp_search_enabled');
      const widget = document.getElementById('kp-ai-search-widget');
      if (widget) widget.remove();
    },
    isEnabled: () => localStorage.getItem('kp_search_enabled') === 'true'
  };
  
  // Auto-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();

