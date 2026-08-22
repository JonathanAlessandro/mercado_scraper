import { config } from '../config.js';
import { collectSource } from './generic.js';

export const sourceConfig = config.collectors.joanin;

export function collectJoanin(options = {}) {
  return collectSource({ ...sourceConfig, ...options });
}
