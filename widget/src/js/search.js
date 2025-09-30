const API_ENDPOINT = 'https://frederique-ai.lotapi.workers.dev/search';

export const searchProducts = async (query) => {
  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }

  const data = await response.json();
  
  return {
    answer: data.answer || '',
    products: parseProducts(data.products || [])
  };
};

const parseProducts = (products) => {
  return products.map(p => ({
    id: p.id,
    title: p.title || p.fulltitle || 'Untitled',
    price: p.price || p.discountPrice || '0.00',
    image: p.image || p.imageUrl || '',
    url: p.url || `/product/${p.id}`
  })).slice(0, 8); // Max 8 products
};
