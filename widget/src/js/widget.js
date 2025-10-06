import { searchProducts } from './search.js';
import { renderUI, showLoading, showResults, closeModal } from './ui.js';

let debounceTimer = null;
let lastOptions = {
  limit: 24,
  sort: 'score:desc',
  filters: {}
};

export const initWidget = () => {
  // Inject styles
  const styleEl = document.createElement('style');
  styleEl.textContent = import.meta.CSS;
  document.head.appendChild(styleEl);

  // Attach click handlers to search triggers
  const desktopSearch = document.querySelector('#formSearch');
  const mobileSearch = document.querySelector('#nav .search');
  const navInput = document.querySelector('#nav form input#q');

  if (navInput) {
    navInput.setAttribute('placeholder', 'Zoek met Frederique-ai');
  }
  
  const openWidget = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    renderUI();
  };

  // Support both click and touch events for mobile
  const attachHandler = (element) => {
    if (!element) return;
    element.addEventListener('click', openWidget, { passive: false });
    element.addEventListener('touchstart', openWidget, { passive: false });
  };

  attachHandler(desktopSearch);
  attachHandler(mobileSearch);
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
    showResults(results);
  } catch (error) {
    console.error('Search error:', error);
    showResults({ query: { original: query }, meta: {}, filters: lastOptions.filters, products: [], error: error.message });
  }
};
