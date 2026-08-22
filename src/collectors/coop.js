import { config } from '../config.js';
import { collectSource } from './generic.js';

export const sourceConfig = config.collectors.coop;

export function collectCoop(options = {}) {
  return collectSource({ ...sourceConfig, ...options });
}
