import { searchProducts } from './search.js';
import { renderUI, showLoading, showResults, closeModal } from './ui.js';

let debounceTimer = null;
let lastOptions = {
  limit: 24,
  sort: 'score:desc',
  filters: {}
};

export const initWidget = () => {
  // Remove .widget-wrapper if it exists (old element blocking UI)
  const widgetWrapper = document.querySelector('.widget-wrapper');
  if (widgetWrapper) {
    widgetWrapper.remove();
  }

  // Inject styles
  const styleEl = document.createElement('style');
  styleEl.textContent = import.meta.CSS;
  document.head.appendChild(styleEl);

  // Attach click handlers to search triggers
  const desktopSearch = document.querySelector('#formSearch');
  const mobileSearch = document.querySelector('#nav .search');
  const tabletSearch = document.querySelector('#nav>ul>li.search>a');
  const navInput = document.querySelector('#nav form input#q');

  if (navInput) {
    navInput.setAttribute('placeholder', 'Ai Cadeau tips!');
  }
  
  const openWidget = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    renderUI();
  };

  // Support both click and touch events for mobile
  const attachHandler = (element) => {
    if (!element) return;
    element.addEventListener('click', openWidget, { passive: false, capture: true });
    element.addEventListener('touchstart', openWidget, { passive: false, capture: true });
  };

  attachHandler(desktopSearch);
  attachHandler(mobileSearch);
  attachHandler(tabletSearch);
  
  // Hijack the welcome module button
  const welcomeBtn = document.querySelector('#root .module-welcome .link-btn a');
  if (welcomeBtn) {
    // Change text with icon
    welcomeBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="2" style="display: inline-block; vertical-align: middle; margin-right: 8px;">
        <path d="M16.269 18.626c-1.526 1.267-3.502 2.032-5.661 2.032-4.834 0-8.749-3.834-8.749-8.543s3.915-8.543 8.749-8.543c.483 0 .957.038 1.419.112a.8.8 0 1 1-.252 1.58 7.41 7.41 0 0 0-1.167-.092c-3.94 0-7.149 3.105-7.149 6.943s3.209 6.943 7.149 6.943c1.959 0 3.737-.767 5.03-2.01a.83.83 0 0 1 .072-.084.81.81 0 0 1 .102-.089c.999-1.029 1.678-2.356 1.881-3.829a.8.8 0 1 1 1.585.219 8.41 8.41 0 0 1-1.876 4.231l3.92 3.819a.8.8 0 0 1-1.116 1.146l-3.936-3.834zM18.7 1.313l.836 1.805 1.853.814-1.853.814-.836 1.805-.836-1.805-1.853-.814 1.853-.814.836-1.805zm-4.462 3.317l1.216 2.625 2.695 1.185-2.695 1.185-1.216 2.625-1.216-2.625-2.695-1.185 2.695-1.185 1.216-2.625zm5.79 3.526l.657 1.419 1.457.64-1.457.64-.657 1.419-.657-1.419-1.457-.64 1.457-.64.657-1.419z" fill="#2563eb"/>
      </svg>
      <span style="vertical-align: middle;">Klik hier voor Ai Cadeau tips!</span>
    `;
    
    // Style it - white background, blue text
    welcomeBtn.style.cssText = `
      background: #ffffff !important;
      color: #2563eb !important;
      font-weight: 600 !important;
      padding: 14px 28px !important;
      border-radius: 12px !important;
      border: none !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
      transition: all 0.3s ease !important;
      text-decoration: none !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
    `;
    
    // Add hover effect - stays white, just lifts up
    welcomeBtn.addEventListener('mouseenter', () => {
      welcomeBtn.style.transform = 'translateY(-2px)';
      welcomeBtn.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4)';
    });
    
    welcomeBtn.addEventListener('mouseleave', () => {
      welcomeBtn.style.transform = 'translateY(0)';
      welcomeBtn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    });
    
    // Attach handler
    attachHandler(welcomeBtn);
  }
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
