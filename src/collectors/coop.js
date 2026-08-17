import { config } from '../config.js';
import { collectSource } from './generic.js';

export const sourceConfig = {
  source: 'coop',
  baseUrl: config.sources.coop,
  startUrl: config.sources.coop
};

export function collectCoop(options = {}) {
  return collectSource({ ...sourceConfig, ...options });
}
