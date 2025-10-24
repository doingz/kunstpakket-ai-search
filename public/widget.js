/**
 * Kunstpakket AI Search - Fullscreen Overlay Version
 * Usage: Add search bar to .container-bar, opens fullscreen overlay with results
 */
(function() {
  'use strict';
  
  const VERSION = '2.0.0';
  const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api'
    : 'https://kunstpakket.bluestars.app/api';
  const ANALYTICS_API = 'https://analytics.bluestars.app/api/track';
  
  let isSearching = false;
  let currentResults = null;
  let currentFilter = 'all';
  let currentSort = 'popular';
  
  /**
   * Analytics tracking
   */
  function trackSearch(query, resultCount) {
    try {
      const searchId = crypto.randomUUID();
      sessionStorage.setItem('kp_search_id', searchId);
      sessionStorage.setItem('kp_last_query', query);
      
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
   * Inject search bar into .container-bar
   */
  function injectSearchBar() {
    const containerBar = document.querySelector('.container-bar');
    if (!containerBar) {
      console.warn('[KP Search] .container-bar not found');
      return;
    }
    
    const searchBar = document.createElement('div');
    searchBar.id = 'kp-search-bar';
    searchBar.innerHTML = `
      <div class="kp-search-wrapper">
        <svg class="kp-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        <input 
          type="text" 
          id="kp-search-input-bar" 
          placeholder="Zoek naar kunst..."
          autocomplete="off"
        />
        <button id="kp-search-button-bar" class="kp-search-btn">Zoeken</button>
      </div>
    `;
    
    // Insert as first child
    containerBar.insertBefore(searchBar, containerBar.firstChild);
    
    // Add event listeners
    const input = document.getElementById('kp-search-input-bar');
    const button = document.getElementById('kp-search-button-bar');
    
    const handleSearch = () => {
      const query = input.value.trim();
      if (query) {
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
              type="text" 
              id="kp-search-input-overlay" 
              placeholder="Zoek naar kunst... bijv. \\"beeldje met hart max 80 euro\\""
              autocomplete="off"
            />
            <button id="kp-search-button-overlay">Zoeken</button>
          </div>
          <button class="kp-close-button" id="kp-close-overlay">&times;</button>
        </div>
        <div id="kp-search-results-overlay"></div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Event listeners
    document.getElementById('kp-close-overlay').addEventListener('click', closeOverlay);
    document.getElementById('kp-search-button-overlay').addEventListener('click', () => {
      const query = document.getElementById('kp-search-input-overlay').value.trim();
      if (query) performSearch(query);
    });
    document.getElementById('kp-search-input-overlay').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const query = e.target.value.trim();
        if (query) performSearch(query);
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
    }
    
    input.focus();
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
    button.textContent = 'Zoeken...';
    resultsContainer.innerHTML = '<div class="kp-loading">🔍 Zoeken...</div>';
    
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
      trackSearch(query, resultCount);
      
      renderResults(data);
      
    } catch (error) {
      console.error('[KP Search] Error:', error);
      resultsContainer.innerHTML = '<div class="kp-error">⚠️ Er ging iets mis. Probeer opnieuw.</div>';
    } finally {
      isSearching = false;
      button.disabled = false;
      button.textContent = 'Zoeken';
    }
  }
  
  /**
   * Render results
   */
  function renderResults(data) {
    const container = document.getElementById('kp-search-results-overlay');
    
    if (!data.success || !data.results?.items || data.results.items.length === 0) {
      container.innerHTML = '<div class="kp-no-results">Geen producten gevonden</div>';
      return;
    }
    
    const products = filterAndSortProducts(data.results.items);
    const saleCount = products.filter(p => p.onSale).length;
    
    let html = `
      <div class="kp-results-header">
        <div class="kp-results-count">
          ${products.length} ${products.length === 1 ? 'product' : 'producten'} gevonden
        </div>
        <div class="kp-controls">
          <select id="kp-filter-select" class="kp-select">
            <option value="all">Alle producten</option>
            <option value="sale">Alleen aanbiedingen (${saleCount})</option>
          </select>
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
    
    products.forEach(product => {
      const imageUrl = getOptimizedImageUrl(product.image);
      html += `
        <a href="https://www.kunstpakket.nl/${product.url}.html" 
           class="kp-product-card" 
           data-product-id="${product.id}"
           data-product-url="${product.url}">
          ${product.image ? `<img src="${imageUrl}" alt="${escapeHtml(product.title)}" loading="lazy" />` : '<div class="kp-no-image"></div>'}
          <div class="kp-product-info">
            ${product.onSale ? `<div class="kp-sale-badge">-${product.discount}%</div>` : ''}
            <div class="kp-product-title">${escapeHtml(product.title)}</div>
            ${product.price ? `
              <div class="kp-product-pricing">
                <div class="kp-product-price">€${product.price.toFixed(2)}</div>
                ${product.oldPrice ? `<div class="kp-product-old-price">€${product.oldPrice.toFixed(2)}</div>` : ''}
              </div>
            ` : ''}
          </div>
        </a>
      `;
    });
    
    html += '</div>';
    container.innerHTML = html;
    
    // Attach event listeners
    document.getElementById('kp-filter-select')?.addEventListener('change', (e) => {
      currentFilter = e.target.value;
      renderResults(currentResults);
    });
    
    document.getElementById('kp-sort-select')?.addEventListener('change', (e) => {
      currentSort = e.target.value;
      renderResults(currentResults);
    });
    
    document.querySelectorAll('.kp-product-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const productId = card.getAttribute('data-product-id');
        const productUrl = card.getAttribute('data-product-url');
        if (productId && productUrl) {
          trackProductClick(productId, productUrl);
        }
      });
    });
  }
  
  function filterAndSortProducts(products) {
    let filtered = [...products];
    
    if (currentFilter === 'sale') {
      filtered = filtered.filter(p => p.onSale === true);
    }
    
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
      /* Search bar in .container-bar */
      #kp-search-bar {
        flex: 1;
        display: flex;
        justify-content: center;
        max-width: 800px;
        margin: 0 auto;
      }
      
      .kp-search-wrapper {
        display: flex;
        align-items: center;
        gap: 0;
        width: 100%;
        max-width: 600px;
        background: white;
        border: 2px solid #e2e8f0;
        border-radius: 12px;
        padding: 4px 4px 4px 16px;
        transition: all 0.2s;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      }
      
      .kp-search-wrapper:focus-within {
        border-color: #3b82f6;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
      }
      
      .kp-search-icon {
        color: #94a3b8;
        flex-shrink: 0;
        margin-right: 12px;
      }
      
      #kp-search-input-bar {
        flex: 1;
        border: none;
        outline: none;
        padding: 12px 0;
        font-size: 15px;
        color: #1e293b;
        background: transparent;
      }
      
      #kp-search-input-bar::placeholder {
        color: #94a3b8;
      }
      
      .kp-search-btn {
        padding: 12px 24px;
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }
      
      .kp-search-btn:hover {
        background: #2563eb;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
      }
      
      .kp-search-btn:active {
        transform: translateY(0);
      }
      
      /* Fullscreen overlay */
      #kp-search-overlay {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        z-index: 999999;
        align-items: flex-start;
        justify-content: center;
        overflow-y: auto;
        padding: 20px;
      }
      
      .kp-overlay-content {
        background: white;
        width: 100%;
        max-width: 1400px;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        margin: 40px auto;
        max-height: calc(100vh - 80px);
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
        gap: 16px;
        z-index: 10;
        border-radius: 12px 12px 0 0;
      }
      
      .kp-search-box-overlay {
        flex: 1;
        display: flex;
        gap: 12px;
      }
      
      #kp-search-input-overlay {
        flex: 1;
        padding: 14px 18px;
        border: 2px solid #e2e8f0;
        border-radius: 8px;
        font-size: 16px;
        transition: all 0.2s;
      }
      
      #kp-search-input-overlay:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }
      
      #kp-search-button-overlay {
        padding: 14px 28px;
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      #kp-search-button-overlay:hover {
        background: #2563eb;
      }
      
      #kp-search-button-overlay:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      
      .kp-close-button {
        width: 48px;
        height: 48px;
        border: none;
        background: #f1f5f9;
        border-radius: 50%;
        font-size: 32px;
        color: #64748b;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        line-height: 1;
        flex-shrink: 0;
      }
      
      .kp-close-button:hover {
        background: #e2e8f0;
        color: #334155;
      }
      
      #kp-search-results-overlay {
        padding: 24px;
        overflow-y: auto;
      }
      
      .kp-loading, .kp-error, .kp-no-results {
        text-align: center;
        padding: 60px 20px;
        font-size: 18px;
        color: #64748b;
      }
      
      .kp-error {
        color: #ef4444;
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
        padding: 10px 14px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 14px;
        background: white;
        cursor: pointer;
      }
      
      .kp-products-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
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
      
      .kp-sale-badge {
        position: absolute;
        top: -12px;
        right: 16px;
        background: #ef4444;
        color: white;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 700;
      }
      
      .kp-product-title {
        font-size: 15px;
        font-weight: 500;
        color: #1e293b;
        margin-bottom: 8px;
        line-height: 1.4;
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
      
      .kp-product-old-price {
        font-size: 15px;
        color: #94a3b8;
        text-decoration: line-through;
      }
      
      /* Responsive */
      @media (max-width: 1024px) {
        .kp-products-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      
      @media (max-width: 640px) {
        #kp-search-bar {
          max-width: 100%;
          padding: 0 12px;
        }
        
        .kp-search-wrapper {
          flex-direction: row;
          padding: 8px;
        }
        
        .kp-search-btn {
          padding: 10px 16px;
          font-size: 14px;
        }
        
        .kp-overlay-content {
          margin: 0;
          border-radius: 0;
          max-height: 100vh;
        }
        
        .kp-overlay-header {
          flex-direction: column;
          align-items: stretch;
        }
        
        .kp-search-box-overlay {
          flex-direction: column;
        }
        
        .kp-close-button {
          align-self: flex-end;
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
   * Initialize
   */
  function init() {
    console.log(`[KP Search Overlay] v${VERSION} loaded`);
    
    // Check purchase page
    checkPurchasePage();
    
    // Check if enabled
    const enabled = localStorage.getItem('kp_search_enabled');
    if (enabled !== 'true') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('f') === '1') {
        localStorage.setItem('kp_search_enabled', 'true');
      } else {
        return;
      }
    }
    
    // Inject styles
    injectStyles();
    
    // Create overlay
    createOverlay();
    
    // Inject search bar
    injectSearchBar();
    
    console.log('[KP Search Overlay] Initialized');
  }
  
  // Public API
  window.KunstpakketSearchOverlay = {
    version: VERSION,
    open: openOverlay,
    close: closeOverlay
  };
  
  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();

