import { config } from '../config.js';
import { collectSource } from './generic.js';

export const sourceConfig = config.collectors.carrefour;

export function collectCarrefour(options = {}) {
  return collectSource({ ...sourceConfig, ...options });
}
