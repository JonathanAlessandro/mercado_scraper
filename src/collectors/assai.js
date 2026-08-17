import { config } from '../config.js';
import { collectSource } from './generic.js';

export const sourceConfig = {
  source: 'assai',
  baseUrl: config.sources.assai,
  startUrl: config.sources.assai,
  selectors: [
    '[data-product-id]',
    '[data-testid*="product"]',
    '[class*="product-card"]',
    '[class*="productCard"]',
    'article[class*="product"]',
    'li[class*="product"]'
  ]
};

export function collectAssai(options = {}) {
  return collectSource({ ...sourceConfig, ...options });
}
