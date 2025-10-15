const API_ENDPOINT = 'https://frederique-ai.lotapi.workers.dev/ai-search';

export const searchProducts = async (query, options = {}) => {
  const payload = {
    query,
    session_id: crypto.randomUUID(), // Nieuwe unieke ID per query
    filters: options.filters || {}
  };

  if (typeof options.limit === 'number') {
    payload.limit = options.limit;
  }

  if (options.sort) {
    payload.sort = options.sort;
  }

  if (typeof options.offset === 'number') {
    payload.offset = options.offset;
  }

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }

  const data = await response.json();

  return {
    query: data.query || {},
    filters: data.filters || {},
    meta: data.meta || {},
    products: parseProducts(data.products || []),
    friendlyMessage: data.friendlyMessage || null
  };
};

const parseProducts = (products) => {
  return products.map((p) => ({
    id: p.id,
    title: p.title || p.fulltitle || 'Untitled',
    price: p.price ?? p.discountPrice ?? '0.00',
    originalPrice: p.originalPrice ?? null,
    hasDiscount: Boolean(p.hasDiscount && p.originalPrice),
    discountPercent: p.discountPercent ?? null,
    image: p.image || p.imageUrl || '',
    url: p.url || `/product/${p.id}`,
    score: p.score ?? null,
    salesCount: p.salesCount ?? null,
    stock: p.stock ?? null,
    type: p.type || '',
    matchReason: p.matchReason || null
  }));
};
