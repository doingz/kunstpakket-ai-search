/**
 * Debug endpoint to check catalog metadata loading on Vercel
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCatalogMetadata, buildPromptInstructions } from '../lib/catalog-metadata';

export const config = {
  runtime: 'nodejs',
  maxDuration: 10
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const metadata = getCatalogMetadata();
    const instructions = buildPromptInstructions();
    
    return res.status(200).json({
      success: true,
      metadata: {
        brandsCount: metadata.brands.length,
        categoriesCount: metadata.categories.length,
        productTypesCount: metadata.productTypes.length,
        themesCount: metadata.popularThemes.length,
        categoryMapSize: metadata.categoryMap.size,
        firstBrands: metadata.brands.slice(0, 10),
        productTypes: metadata.productTypes,
        firstCategories: metadata.categories.slice(0, 10)
      },
      instructions: {
        length: instructions.length,
        preview: instructions.substring(0, 1000) + '...'
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}

