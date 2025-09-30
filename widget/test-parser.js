// Test YAML parser
const yaml = `id: 84670256
title: "Beeld In gedachten"
fulltitle: "In gedachten beeldje"
price: 96
imageUrl: "https://cdn.webshopapp.com/shops/269557/files/271998586/ma00356sb.jpg"
url: "https://kunstpakket.nl/in-gedachten.html"`;

const get = (key) => {
  const regex = new RegExp(`^${key}:\\s*(?:"([^"]+)"|'([^']+)'|(\\S+))`, 'm');
  const m = yaml.match(regex);
  return m ? (m[1] || m[2] || m[3]).trim() : '';
};

console.log('Parsed:');
console.log('  id:', get('id'));
console.log('  title:', get('title'));
console.log('  fulltitle:', get('fulltitle'));
console.log('  price:', get('price'));
console.log('  image:', get('imageUrl'));
console.log('  url:', get('url'));

const product = {
  id: get('id'),
  title: get('fulltitle') || get('title'),
  price: get('price'),
  image: get('imageUrl'),
  url: get('url')
};

console.log('\nProduct object:', JSON.stringify(product, null, 2));
