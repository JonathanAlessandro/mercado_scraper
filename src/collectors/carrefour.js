import { config } from '../config.js';
import { collectSource } from './generic.js';

export const sourceConfig = {
  source: 'carrefour',
  baseUrl: config.sources.carrefour,
  startUrl: config.sources.carrefour,
  selectors: [
    '[data-product-id]',
    '[data-testid*="product"]',
    '[class*="product-card"]',
    '[class*="productCard"]',
    'article[class*="product"]',
    'li[class*="product"]'
  ]
};

export function collectCarrefour(options = {}) {
  return collectSource({ ...sourceConfig, ...options });
}
