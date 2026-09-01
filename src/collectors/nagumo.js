import { config } from '../config.js';
import { collectSource } from './generic.js';
import { collectNagumoHttp } from './nagumo_http.js';

export const sourceConfig = config.collectors.nagumo;

export async function collectNagumo(options = {}) {
  if (config.useApiCollectors) {
    try {
      const results = await collectNagumoHttp({ ...sourceConfig, ...options });
      if (results.length > 0) return results;
      console.warn('[nagumo] nenhum produto retornado via HTTP, acionando fallback Playwright...');
    } catch (err) {
      console.warn(`[nagumo] falha no coletor HTTP (${err.message}), acionando fallback Playwright...`);
    }
  }
  return collectSource({ ...sourceConfig, ...options });
}

