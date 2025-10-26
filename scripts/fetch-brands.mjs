/**
 * Fetch brand data from Lightspeed API
 * Brands contain artist/designer names for products
 */
import fs from 'fs';
import 'dotenv/config';

const API_KEY = process.env.LIGHTSPEED_API_KEY;
const API_SECRET = process.env.LIGHTSPEED_SECRET;

if (!API_KEY || !API_SECRET) {
  console.error('❌ Missing Lightspeed credentials');
  console.error('Please set LIGHTSPEED_API_KEY and LIGHTSPEED_SECRET in .env');
  process.exit(1);
}

const authString = Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64');

async function fetchBrands() {
  console.log('🔍 Fetching brands from Lightspeed...\n');
  
  const brands = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `https://api.webshopapp.com/nl/brands.json?page=${page}&limit=250`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${authString}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.brands || data.brands.length === 0) {
        hasMore = false;
        break;
      }

      brands.push(...data.brands);
      console.log(`✅ Page ${page}: ${data.brands.length} brands`);
      
      page++;
      
      // Be nice to the API
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`❌ Error fetching page ${page}:`, error.message);
      break;
    }
  }

  return brands;
}

// Main
const brands = await fetchBrands();

console.log(`\n✅ Total brands fetched: ${brands.length}`);

// Save to file
fs.writeFileSync('data/brands.json', JSON.stringify(brands, null, 2));
console.log('💾 Saved to data/brands.json');

// Show some examples
console.log('\n📋 Sample brands:');
brands.slice(0, 10).forEach(brand => {
  console.log(`  ${brand.id}: ${brand.title}`);
});

console.log('\n✅ Done!');

