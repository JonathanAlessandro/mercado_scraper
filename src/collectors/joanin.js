import { config } from '../config.js';
import { collectSource } from './generic.js';

export const sourceConfig = {
  source: 'joanin',
  baseUrl: config.sources.joanin,
  startUrl: config.sources.joanin,
  selectors: [
    '[data-product-id]',
    '[data-testid*="product"]',
    '.product-card',
    '[class*="product"]',
    'article[class*="product"]',
    'li[class*="product"]'
  ]
};

export function collectJoanin(options = {}) {
  return collectSource({ ...sourceConfig, ...options });
}
