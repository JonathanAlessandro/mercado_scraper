import { config } from '../config.js';
import { collectSource } from './generic.js';

export const sourceConfig = config.collectors.assai;

export function collectAssai(options = {}) {
  return collectSource({ ...sourceConfig, ...options });
}
