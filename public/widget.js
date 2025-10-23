/**
 * Kunstpakket AI Search Widget
 * Embed this on any page: <script src="https://kunstpakket.bluestars.app/widget.js"></script>
 */
(function() {
  'use strict';
  
  const WIDGET_VERSION = '1.0.2';
  const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api'
    : 'https://kunstpakket.bluestars.app/api';
  
  // Configuration (can be overridden via data attributes)
  const config = {
    placeholder: 'Zoek naar kunst... bijv. "beeldje met hart max 80 euro"',
    buttonText: 'Zoeken',
    maxResults: 10
  };
  
  // Widget state
  let isSearching = false;
  let currentResults = null;
  
  /**
   * Check if widget should be shown
   */
  function shouldShowWidget() {
    // Check sessionStorage first
    const sessionFlag = sessionStorage.getItem('kp_search_enabled');
    if (sessionFlag === 'true') {
      return true;
    }
    
    // Check URL for f=1 parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('f') === '1') {
      // Store in session so it persists across pages
      sessionStorage.setItem('kp_search_enabled', 'true');
      return true;
    }
    
    return false;
  }
  
  /**
   * Initialize widget
   */
  function init() {
    console.log(`[Kunstpakket AI Search] Widget v${WIDGET_VERSION} loaded`);
    
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
      
      .kp-results-count {
        color: #64748b;
        margin-bottom: 1rem;
        font-size: 0.9rem;
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
      }
      
      .kp-product-title {
        font-weight: 600;
        margin-bottom: 0.5rem;
        color: #1e293b;
        font-size: 0.95rem;
        line-height: 1.4;
      }
      
      .kp-product-price {
        font-size: 1.25rem;
        font-weight: 700;
        color: #3b82f6;
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
    
    // Results count
    html += `
      <div class="kp-results-count">
        ${results.total} ${results.total === 1 ? 'product' : 'producten'} gevonden
      </div>
    `;
    
    // Products grid
    html += '<div class="kp-results-grid">';
    
    results.items.forEach((product, index) => {
      const isHighlighted = results.highlighted?.includes(index);
      html += `
        <a href="https://www.kunstpakket.nl/${product.url}" class="kp-product-link" target="_blank">
          <div class="kp-product-card ${isHighlighted ? 'highlighted' : ''}">
            ${product.image ? `
              <img 
                src="${product.image}" 
                alt="${escapeHtml(product.title)}"
                class="kp-product-image"
                loading="lazy"
              />
            ` : `
              <div class="kp-product-image"></div>
            `}
            <div class="kp-product-info">
              <div class="kp-product-title">${escapeHtml(product.title)}</div>
              ${product.price && typeof product.price === 'number' ? `
                <div class="kp-product-price">€${product.price.toFixed(2)}</div>
              ` : ''}
            </div>
          </div>
        </a>
      `;
    });
    
    html += '</div>';
    
    resultsContainer.innerHTML = html;
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
      sessionStorage.setItem('kp_search_enabled', 'true');
      if (!document.getElementById('kp-ai-search-widget')) {
        init();
      }
    },
    disable: () => {
      sessionStorage.removeItem('kp_search_enabled');
      const widget = document.getElementById('kp-ai-search-widget');
      if (widget) widget.remove();
    },
    isEnabled: () => sessionStorage.getItem('kp_search_enabled') === 'true'
  };
  
  // Auto-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();

