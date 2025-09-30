import { handleSearch } from './widget.js';

let overlay = null;
let modal = null;
let bodyEl = null;
let inputEl = null;

export const renderUI = () => {
  // Create overlay
  overlay = document.createElement('div');
  overlay.className = 'kp-ai-widget__overlay';
  
  // Create modal
  modal = document.createElement('div');
  modal.className = 'kp-ai-widget__modal';
  
  modal.innerHTML = `
    <div class="kp-ai-widget__header">
      <input 
        type="text" 
        class="kp-ai-widget__input" 
        placeholder="Zoek bijvoorbeeld: schilderij voor budget €50..."
        autofocus
      />
      <div class="kp-ai-widget__close" role="button" aria-label="Sluiten">×</div>
    </div>
    <div class="kp-ai-widget__body"></div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  // Get references
  bodyEl = modal.querySelector('.kp-ai-widget__body');
  inputEl = modal.querySelector('.kp-ai-widget__input');
  
  // Attach events
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch(e.target.value);
    }
  });
  
  const closeBtn = modal.querySelector('.kp-ai-widget__close');
  closeBtn.addEventListener('click', closeModal);
  closeBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    closeModal();
  }, { passive: false });
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  overlay.addEventListener('touchstart', (e) => {
    if (e.target === overlay) {
      e.preventDefault();
      closeModal();
    }
  }, { passive: false });
  
  // Focus input
  setTimeout(() => inputEl.focus(), 100);
};

export const showLoading = () => {
  if (!bodyEl) return;
  
  bodyEl.innerHTML = `
    <div class="kp-ai-widget__loading">
      <div class="kp-ai-widget__spinner"></div>
      <p>Aan het zoeken...</p>
    </div>
  `;
};

export const showResults = ({ answer, products }) => {
  if (!bodyEl) return;
  
  let html = '';
  
  // AI Answer
  if (answer) {
    html += `
      <div class="kp-ai-widget__answer">
        <p>${escapeHtml(answer)}</p>
      </div>
    `;
  }
  
  // Products
  if (products?.length) {
    html += '<div class="kp-ai-widget__products">';
    
    products.forEach(p => {
      html += `
        <a href="${escapeHtml(p.url)}" class="kp-ai-widget__product">
          ${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" class="kp-ai-widget__product-img" loading="lazy">` : ''}
          <div class="kp-ai-widget__product-info">
            <h3 class="kp-ai-widget__product-title">${escapeHtml(p.title)}</h3>
            <p class="kp-ai-widget__product-price">€${escapeHtml(p.price)}</p>
          </div>
        </a>
      `;
    });
    
    html += '</div>';
  } else if (!answer) {
    html = `
      <div class="kp-ai-widget__empty">
        <p>Geen resultaten gevonden. Probeer een andere zoekopdracht.</p>
      </div>
    `;
  }
  
  bodyEl.innerHTML = html;
};

export const closeModal = () => {
  overlay?.remove();
  overlay = null;
  modal = null;
  bodyEl = null;
  inputEl = null;
};

const escapeHtml = (str) => {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};
