import { config } from '../config.js';
import { collectSource } from './generic.js';

export const sourceConfig = config.collectors.superabc;

export function collectSuperAbc(options = {}) {
  return collectSource({ ...sourceConfig, ...options });
}
