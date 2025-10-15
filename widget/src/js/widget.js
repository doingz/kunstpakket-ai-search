import { searchProducts } from './search.js';
import { renderUI, showLoading, showResults, closeModal } from './ui.js';

let debounceTimer = null;
let lastOptions = {
  limit: 24,
  sort: 'score:desc',
  filters: {}
};

export const initWidget = () => {
  // Remove old widget elements that might be blocking UI
  const widgetWrapper = document.querySelector('.widget-wrapper');
  if (widgetWrapper) {
    widgetWrapper.remove();
  }
  
  // Also remove any leftover overlays from previous sessions
  const oldOverlay = document.querySelector('.kp-ai-widget__overlay');
  if (oldOverlay) {
    oldOverlay.remove();
  }

  // Inject widget styles
  const styleEl = document.createElement('style');
  styleEl.textContent = import.meta.CSS;
  document.head.appendChild(styleEl);
  
  // Inject custom site-specific styles
  const customStyleEl = document.createElement('style');
  customStyleEl.textContent = `
    #subheader-search {
      border: 1px solid #444 !important;
      margin-top: 40px !important;
      border-radius: 0 !important;
    }
    
    #subheader-search-input {
      padding: 20px 10px !important;
    }
    
    #subheader-search:before {
      opacity: 0 !important;
    }
  `;
  document.head.appendChild(customStyleEl);

  // Take over existing search boxes - MINIMAL APPROACH
  // Only intercept clicks/focus ON THE INPUTS THEMSELVES
  const headerSearch = document.querySelector('#header-search');
  const subheaderSearch = document.querySelector('#subheader-search');
  
  // Set custom placeholder for subheader search input
  const subheaderSearchInput = document.querySelector('#subheader-search-input');
  if (subheaderSearchInput) {
    subheaderSearchInput.setAttribute('placeholder', 'Hoi, waar ben je naar opzoek?');
  }
  
  const openWidget = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    renderUI();
  };

  // CRITICAL: Only attach to the specific elements, not to document
  // This prevents interfering with payment forms
  if (headerSearch) {
    headerSearch.addEventListener('click', openWidget);
    headerSearch.addEventListener('focus', openWidget);
  }
  
  if (subheaderSearch) {
    subheaderSearch.addEventListener('click', openWidget);
    subheaderSearch.addEventListener('focus', openWidget);
  }
  
  // Handle form submission - attach directly to search forms only
  // NO document-level listener with capture:true - that blocks Payment API!
  document.querySelectorAll('form').forEach(form => {
    const hasSearchInput = form.querySelector('#header-search, #subheader-search');
    if (hasSearchInput) {
      // Only prevent submission on actual search forms
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        e.stopPropagation();
        renderUI();
      }); // NO capture: true! This is critical for payment forms!
    }
  });
};

// Handle search (triggered on Enter)
export const handleSearch = async (query, options = {}) => {
  if (!query.trim()) {
    return;
  }

  lastOptions = {
    ...lastOptions,
    ...options
  };

  showLoading();
  
  try {
    const results = await searchProducts(query, lastOptions);
    
    // Store interaction_id in localStorage for purchase tracking
    if (results.meta?.interaction_id) {
      localStorage.setItem('kp_last_interaction', JSON.stringify({
        id: results.meta.interaction_id,
        timestamp: new Date().toISOString(),
        query: query
      }));
    }
    
    showResults(results);
  } catch (error) {
    console.error('Search error:', error);
    showResults({ query: { original: query }, meta: {}, filters: lastOptions.filters, products: [], error: error.message });
  }
};
