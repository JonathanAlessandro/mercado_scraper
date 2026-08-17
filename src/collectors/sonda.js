import { config } from '../config.js';
import { collectSource } from './generic.js';

export const sourceConfig = {
  source: 'sonda',
  baseUrl: config.sources.sonda,
  startUrl: config.sources.sonda,
  selectors: [
    'a[id*="linkProduto2"]',
    '[data-product-id]',
    '[data-testid*="product"]',
    '.product-card',
    'article[class*="product"]',
    'li[class*="product"]'
  ]
};

export function collectSonda(options = {}) {
  return collectSource({ ...sourceConfig, ...options });
}
