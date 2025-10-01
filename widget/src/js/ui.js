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
      const priceHtml = renderPrice(p);
      html += `
        <a href="${escapeHtml(p.url)}" class="kp-ai-widget__product">
          ${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" class="kp-ai-widget__product-img" loading="lazy">` : ''}
          <div class="kp-ai-widget__product-info">
            <h3 class="kp-ai-widget__product-title">${escapeHtml(p.title)}</h3>
            ${priceHtml}
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

function renderPrice(product) {
  const currentPrice = formatPrice(product.price);
  if (!currentPrice) return '';

  const pieces = [`<span class="kp-ai-widget__product-price-current">€${escapeHtml(currentPrice)}</span>`];

  const originalPrice = formatPrice(product.originalPrice);
  if (product.hasDiscount && originalPrice) {
    pieces.unshift(`<span class="kp-ai-widget__product-price-old">€${escapeHtml(originalPrice)}</span>`);
    if (product.discountPercent) {
      const percent = Math.round(Number(product.discountPercent));
      if (Number.isFinite(percent) && percent > 0) {
        pieces.push(`<span class="kp-ai-widget__product-price-badge">-${percent}%</span>`);
      }
    }
  }

  return `<div class="kp-ai-widget__product-pricing">${pieces.join('')}</div>`;
}

function formatPrice(value) {
  if (value == null || value === '') return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
