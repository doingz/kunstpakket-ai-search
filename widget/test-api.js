// Test actual API response parsing
const ACCOUNT_ID = '9ca4115b4354987fcb09f8ca5fb970ab';
const RAG_SLUG = 'kunstpakket-ai-search';
const API_TOKEN = 'QTYnM-wsXJni_9FARwUFa7ct7O96Kd1bE8hRA3an';

async function test() {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/autorag/rags/${RAG_SLUG}/ai-search`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_TOKEN}`
      },
      body: JSON.stringify({ query: 'beeldje' })
    }
  );

  const data = await response.json();
  
  console.log('AI Search returned:', data.result.data.length, 'items');
  
  // Parse products (multi-chunk aware)
  const products = data.result.data.map(item => {
    // Find frontmatter in any content chunk
    let yaml = null;
    for (const chunk of item.content || []) {
      const text = chunk.text || '';
      const match = text.match(/---\n([\s\S]*?)\n---/);
      if (match) {
        yaml = match[1];
        break;
      }
    }
    
    if (!yaml) {
      console.log('No frontmatter in any chunk for:', item.filename);
      return null;
    }
    
    const get = (key) => {
      const regex = new RegExp(`^${key}:\\s*(?:"([^"]+)"|'([^']+)'|(\\S+))`, 'm');
      const m = yaml.match(regex);
      return m ? (m[1] || m[2] || m[3]).trim() : '';
    };
    
    const id = get('id');
    if (!id) {
      console.log('No ID found for:', item.filename);
      return null;
    }
    
    return {
      id,
      title: get('fulltitle') || get('title'),
      price: get('price'),
      image: get('imageUrl'),
      url: get('url')
    };
  }).filter(p => p && p.id).slice(0, 8);
  
  console.log('\nParsed products:', products.length);
  console.log('\nFirst product:', JSON.stringify(products[0], null, 2));
}

test();
