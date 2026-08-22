import { config } from '../config.js';
import { collectSource } from './generic.js';

export const sourceConfig = config.collectors.sonda;

export function collectSonda(options = {}) {
  return collectSource({ ...sourceConfig, ...options });
}
