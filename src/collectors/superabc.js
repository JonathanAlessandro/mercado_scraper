import { config } from '../config.js';
import { collectSource } from './generic.js';

export const sourceConfig = {
  source: 'superabc',
  baseUrl: config.sources.superabc,
  startUrl: config.sources.superabc,
  selectors: [
    '[data-product-id]',
    '[data-testid*="product"]',
    '[class*="product-card"]',
    '[class*="productCard"]',
    'article[class*="product"]',
    'li[class*="product"]'
  ]
};

export function collectSuperAbc(options = {}) {
  return collectSource({ ...sourceConfig, ...options });
}
