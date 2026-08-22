import { config } from '../config.js';
import { collectSource } from './generic.js';

export const sourceConfig = config.collectors.nagumo;

export function collectNagumo(options = {}) {
  return collectSource({ ...sourceConfig, ...options });
}
