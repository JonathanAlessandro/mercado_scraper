import { config } from '../config.js';
import { collectSource } from './generic.js';

export const sourceConfig = {
  source: 'nagumo',
  baseUrl: config.sources.nagumo,
  startUrl: config.sources.nagumo
};

export function collectNagumo(options = {}) {
  return collectSource({ ...sourceConfig, ...options });
}
