import { config } from '../config.js';
import { collectSource } from './generic.js';
import { collectVtex } from './vtex.js';

export const sourceConfig = config.collectors.coop;

export async function collectCoop(options = {}) {
  if (config.useApiCollectors) {
    try {
      const results = await collectVtex({ ...sourceConfig, ...options });
      if (results.length > 0) return results;
      console.warn('[coop] nenhum produto retornado via API, acionando fallback para Playwright...');
    } catch (err) {
      console.warn(`[coop] falha no coletor API VTEX (${err.message}), acionando fallback Playwright...`);
    }
  }
  return collectSource({ ...sourceConfig, ...options });
}

