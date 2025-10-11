import { handleSearch } from './widget.js';

let overlay = null;
let modal = null;
let bodyEl = null;
let inputEl = null;
let clearBtn = null;
let visualPlaceholder = null;
let placeholderLabel = null;
let placeholderHtml = '';

export const renderUI = (initialQuery = '') => {
  // Create overlay
  overlay = document.createElement('div');
  overlay.className = 'kp-ai-widget__overlay';
  
  // Create modal
  modal = document.createElement('div');
  modal.className = 'kp-ai-widget__modal';
  
  modal.innerHTML = `
    <div class="kp-ai-widget__header">
      <div class="kp-ai-widget__header-top">
        <div class="kp-ai-widget__title">
          <span class="kp-ai-widget__title-text">Zoek met Frederique</span>
        </div>
        <div class="kp-ai-widget__close" role="button" aria-label="Sluiten">×</div>
      </div>
    </div>
    <div class="kp-ai-widget__search">
      <div class="kp-ai-widget__input-wrap">
        <div class="kp-ai-widget__search-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="2">
            <path d="M16.269 18.626c-1.526 1.267-3.502 2.032-5.661 2.032-4.834 0-8.749-3.834-8.749-8.543s3.915-8.543 8.749-8.543c.483 0 .957.038 1.419.112a.8.8 0 1 1-.252 1.58 7.41 7.41 0 0 0-1.167-.092c-3.94 0-7.149 3.105-7.149 6.943s3.209 6.943 7.149 6.943c1.959 0 3.737-.767 5.03-2.01a.83.83 0 0 1 .072-.084.81.81 0 0 1 .102-.089c.999-1.029 1.678-2.356 1.881-3.829a.8.8 0 1 1 1.585.219 8.41 8.41 0 0 1-1.876 4.231l3.92 3.819a.8.8 0 0 1-1.116 1.146l-3.936-3.834zM18.7 1.313l.836 1.805 1.853.814-1.853.814-.836 1.805-.836-1.805-1.853-.814 1.853-.814.836-1.805zm-4.462 3.317l1.216 2.625 2.695 1.185-2.695 1.185-1.216 2.625-1.216-2.625-2.695-1.185 2.695-1.185 1.216-2.625zm5.79 3.526l.657 1.419 1.457.64-1.457.64-.657 1.419-.657-1.419-1.457-.64 1.457-.64.657-1.419z" fill="#4b5563"/>
          </svg>
        </div>
        <input 
          type="search"
          class="kp-ai-widget__input" 
          placeholder=""
          enterkeyhint="search"
          inputmode="search"
        />
        <div class="kp-ai-widget__visual-placeholder">Hoi, waar ben je naar opzoek?</div>
        <div class="kp-ai-widget__clear" role="button" aria-label="Wis zoekopdracht">Wissen</div>
      </div>
    </div>
    <div class="kp-ai-widget__body"></div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  // Get references
  bodyEl = modal.querySelector('.kp-ai-widget__body');
  inputEl = modal.querySelector('.kp-ai-widget__input');
  clearBtn = modal.querySelector('.kp-ai-widget__clear');
  visualPlaceholder = modal.querySelector('.kp-ai-widget__visual-placeholder');
  placeholderLabel = null;
  placeholderHtml = renderPlaceholder();
  setBodyContent(placeholderHtml);
  
  // Set initial query if provided
  if (initialQuery) {
    inputEl.value = initialQuery;
    if (clearBtn) {
      clearBtn.classList.remove('is-disabled');
      clearBtn.removeAttribute('aria-disabled');
    }
    if (visualPlaceholder) {
      visualPlaceholder.style.display = 'none';
    }
  }

  // Track modal open in Google Analytics
  if (typeof gtag === 'function') {
    gtag('event', 'frederique_open', {
      event_category: 'AI Search',
      event_label: 'Modal Opened'
    });
  }

  if ('enterKeyHint' in inputEl) {
    inputEl.enterKeyHint = 'search';
  }
  if ('inputMode' in inputEl) {
    inputEl.inputMode = 'search';
  }
  
  // Attach events
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch(e.target.value);
      inputEl.blur();
    }
  });

  inputEl.addEventListener('input', () => {
    if (clearBtn) {
      clearBtn.classList.toggle('is-disabled', !inputEl.value);
      clearBtn.toggleAttribute('aria-disabled', !inputEl.value);
    }
    if (visualPlaceholder) {
      visualPlaceholder.style.display = inputEl.value ? 'none' : 'block';
    }
    if (!inputEl.value) {
      setBodyContent(placeholderHtml);
    }
  });

  if (clearBtn) {
    clearBtn.classList.add('is-disabled');
    clearBtn.setAttribute('aria-disabled', 'true');
    const clearHandler = (e) => {
      e.preventDefault();
      inputEl.value = '';
      inputEl.focus();
      clearBtn.classList.add('is-disabled');
      clearBtn.setAttribute('aria-disabled', 'true');
      if (visualPlaceholder) {
        visualPlaceholder.style.display = 'block';
      }
      setBodyContent(placeholderHtml);
    };
    clearBtn.addEventListener('click', clearHandler);
    clearBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        clearHandler(e);
      }
    });
  }
  
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
  
  // Auto-focus with delay to show modal animation first
  setTimeout(() => {
    inputEl.focus({ preventScroll: true });
  }, 100);
};

export const showLoading = () => {
  if (!bodyEl) return;
  
  bodyEl.innerHTML = `
    <div class="kp-ai-widget__loading">
      <div class="kp-ai-widget__spinner"></div>
      <p>Aan het zoeken...</p>
    </div>
  `;
  placeholderLabel?.classList.add('is-hidden');
};

export const showResults = ({ query = {}, products = [], meta = {}, error, friendlyMessage }) => {
  if (!bodyEl) return;

  const pieces = [];

  if (query.corrected) {
    pieces.push(`
      <div class="kp-ai-widget__correction">
        <p>Resultaten voor <strong>${escapeHtml(query.corrected)}</strong> (je zocht: ${escapeHtml(query.original)})</p>
      </div>
    `);
  }

  if (typeof meta.total === 'number') {
    pieces.push(renderMeta(meta, friendlyMessage));
  }

  if (error) {
    pieces.push(`
      <div class="kp-ai-widget__answer">
        <p>${escapeHtml(error)}</p>
      </div>
    `);
  }

  if (products.length) {
    pieces.push(renderProducts(products));
  }

  if (!products.length && !error) {
    pieces.push(`
      <div class="kp-ai-widget__empty">
        <p>Geen resultaten gevonden. Probeer een andere zoekopdracht.</p>
      </div>
    `);
  }

  const html = pieces.join('');
  setBodyContent(html || placeholderHtml);
};

function renderProducts(products) {
  let html = '<div class="kp-ai-widget__products">';

  products.forEach((p) => {
    const priceHtml = renderPrice(p);
    const scoreHtml = renderScore(p);
    const reasonHtml = renderReason(p);

    html += `
      <a href="${escapeHtml(p.url)}" class="kp-ai-widget__product">
        ${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" class="kp-ai-widget__product-img" loading="lazy">` : ''}
        <div class="kp-ai-widget__product-info">
          <h3 class="kp-ai-widget__product-title">${escapeHtml(p.title)}</h3>
          ${reasonHtml}
          ${scoreHtml}
          ${priceHtml}
        </div>
      </a>
    `;
  });

  html += '</div>';
  return html;
}

function renderScore(product) {
  // Score and stock info removed from cards per user request
  return '';
}

function renderReason(product) {
  // Match reason removed from cards per user request
  return '';
}

function setBodyContent(html) {
  if (bodyEl) {
    bodyEl.innerHTML = html;
    attachPlaceholderHandlers();
  }
}

function renderPlaceholder() {
  return `
    <div class="kp-ai-widget__help">
      <div class="kp-ai-widget__help-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <path d="M12 17h.01"/>
        </svg>
      </div>
      <h3 class="kp-ai-widget__help-title">Zoek met volzinnen</h3>
      <p class="kp-ai-widget__help-text">
        Je kunt gewoon typen wat je zoekt in normale taal! Probeer bijvoorbeeld: 
        "Een mooi beeldje voor in de tuin" of "Een vaas van blauw glas voor €50".
      </p>
    </div>
  `;
}

function attachPlaceholderHandlers() {
  if (!bodyEl) return;
  const buttons = bodyEl.querySelectorAll('.kp-ai-widget__placeholder button[data-query]');
  if (!buttons.length) return;

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const query = button.getAttribute('data-query');
      if (!query) return;
      inputEl.value = query;
      if (clearBtn) {
        clearBtn.hidden = false;
      }
      handleSearch(query);
    });
  });
}

export const closeModal = () => {
  overlay?.remove();
  overlay = null;
  modal = null;
  bodyEl = null;
  inputEl = null;
  clearBtn = null;
  placeholderLabel = null;
  placeholderHtml = '';
};

function renderPrice(product) {
  const currentPrice = formatPrice(product.price);
  if (!currentPrice) return '';

  const pieces = [`<span class="kp-ai-widget__product-price-current">${escapeHtml(currentPrice)}</span>`];

  const originalPrice = formatPrice(product.originalPrice);
  if (product.hasDiscount && originalPrice) {
    pieces.unshift(`<span class="kp-ai-widget__product-price-old">${escapeHtml(originalPrice)}</span>`);
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

function renderMeta(meta, friendlyMessage) {
  const infoParts = [];

  if (meta.candidateCount != null) {
    infoParts.push(`${meta.candidateCount} kandidaten`);
  }

  if (meta.llmMatchCount != null) {
    infoParts.push(`${meta.llmMatchCount} door AI gemaakt`);
  }

  const infoText = infoParts.filter(Boolean).join(' · ');
  
  // Use AI-generated friendly message or fallback
  const resultMessage = friendlyMessage || `${meta.total ?? 0} resultaten`;
  
  // No timing shown - just the friendly message
  const leftSide = `${resultMessage}`;

  const badges = [];
  if (meta.fallback) {
    badges.push(`<span class="kp-ai-widget__meta-badge">${escapeHtml(meta.fallback)}</span>`);
  }
  if (meta.llmModel) {
    badges.push(`<span class="kp-ai-widget__meta-badge">${escapeHtml(meta.llmModel)}</span>`);
  }
  if (meta.llmReason && (!meta.fallback || meta.fallback === 'no_llm_matches' || meta.fallback === 'invalid_llm_json')) {
    badges.push(`<span class="kp-ai-widget__meta-badge">${escapeHtml(meta.llmReason)}</span>`);
  }

  return `
    <div class="kp-ai-widget__meta">
      <p>${leftSide}</p>
      ${badges.length ? `<div class="kp-ai-widget__meta-badges">${badges.join('')}</div>` : ''}
    </div>
  `;
}
