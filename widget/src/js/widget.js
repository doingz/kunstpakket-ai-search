import { searchProducts } from './search.js';
import { renderUI, showLoading, showResults, closeModal } from './ui.js';

let debounceTimer = null;

export const initWidget = () => {
  // Inject styles
  const styleEl = document.createElement('style');
  styleEl.textContent = import.meta.CSS;
  document.head.appendChild(styleEl);

  // Attach click handlers to search triggers
  const desktopSearch = document.querySelector('#formSearch');
  const mobileSearch = document.querySelector('#nav .search');
  
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
export const handleSearch = async (query) => {
  if (!query.trim()) {
    return;
  }

  showLoading();
  
  try {
    const results = await searchProducts(query);
    showResults(results);
  } catch (error) {
    console.error('Search error:', error);
    showResults({ answer: 'Er ging iets mis. Probeer het opnieuw.', products: [] });
  }
};
