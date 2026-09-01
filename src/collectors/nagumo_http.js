import pLimit from 'p-limit';
import { config } from '../config.js';
import {
  absoluteUrl,
  canonicalizeUrl,
  cleanText,
  parseBrazilianMoney
} from '../utils/normalize.js';

export function parseNagumoProductJsonLd(json, pageUrl, baseUrl, source = 'nagumo') {
  if (!json) return null;
  const type = json['@type'];
  const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'));
  if (!isProduct) return null;

  const offers = Array.isArray(json.offers) ? json.offers[0] : (json.offers ?? {});
  const price = parseBrazilianMoney(offers.price ?? offers.lowPrice ?? json.price);
  const highPrice = parseBrazilianMoney(offers.highPrice);
  const availability = String(offers.availability ?? json.availability ?? '').toLowerCase();
  const isAvailable = availability ? !/(outofstock|soldout|unavailable|indispon)/i.test(availability) : true;

  const images = json.image ?? json.images;
  const imageUrl = absoluteUrl(Array.isArray(images) ? images[0] : images, baseUrl);
  const productUrl = canonicalizeUrl(pageUrl, baseUrl);

  let category = cleanText(json.category);
  if (!category && pageUrl) {
    try {
      const pathParts = new URL(pageUrl).pathname.split('/').filter(Boolean);
      const catParts = pathParts.filter((p) => p !== 'categoria' && p !== 'departamentos' && !p.endsWith('.html'));
      if (catParts.length > 0) {
        category = catParts.map((p) => decodeURIComponent(p).replace(/-/g, ' ')).join(' > ');
      }
    } catch {}
  }

  return {
    source,
    external_id: cleanText(json.sku ?? json.mpn ?? json.productID),
    name: cleanText(json.name),
    brand: cleanText(typeof json.brand === 'object' ? json.brand?.name : json.brand),
    category,
    sku: cleanText(json.sku ?? json.mpn),
    price: highPrice !== null && price !== null && highPrice > price ? highPrice : price,
    promotional_price: highPrice !== null && price !== null && highPrice > price ? price : null,
    unit: cleanText(json.size ?? json.weight),
    available: isAvailable,
    image_url: imageUrl,
    product_url: productUrl,
    raw_data: { kind: 'json-ld', data: json }
  };
}

export async function collectNagumoHttp({
  source = 'nagumo',
  baseUrl = config.sources.nagumo,
  onProduct = null,
  maxPages = 200,
  maxProducts = 30000
} = {}) {
  const startedAt = Date.now();
  console.log(`[${source}] iniciando coleta de alta velocidade via HTTP / JSON-LD...`);

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'Cache-Control': 'no-cache'
  };

  const seedCategories = [
    `${baseUrl}/busca?cgid=ofertas-dia`,
    `${baseUrl}/busca?cgid=SEMANAL`,
    `${baseUrl}/busca?cgid=MP-GERAL`,
    `${baseUrl}/categoria/departamentos/acougue/`,
    `${baseUrl}/categoria/departamentos/bebidas/`,
    `${baseUrl}/categoria/departamentos/hortifruti/`,
    `${baseUrl}/categoria/departamentos/padaria/`,
    `${baseUrl}/categoria/mercearia-salgada/`,
    `${baseUrl}/categoria/departamentos/limpeza/`,
    `${baseUrl}/categoria/departamentos/frios-e-laticinios/`,
    `${baseUrl}/categoria/departamentos/congelados/`,
    `${baseUrl}/categoria/departamentos/higiene-e-beleza/`,
    `${baseUrl}/categoria/departamentos/bazar-e-utilidades/`,
    `${baseUrl}/categoria/departamentos/pet-shop/`,
    `${baseUrl}/categoria/departamentos/bomboniere-e-biscoitos/`
  ];

  const queue = [...seedCategories];
  const queued = new Set(queue);
  const visited = new Set();
  const productUrls = new Set();
  const products = new Map();
  let pagesProcessed = 0;
  let failedPages = 0;

  async function fetchHtml(url) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, { headers, redirect: 'follow' });
        if (!res.ok) {
          if (res.status === 404) return null;
          throw new Error(`HTTP ${res.status}`);
        }
        return await res.text();
      } catch (err) {
        if (attempt === 3) {
          failedPages++;
          return null;
        }
        await new Promise((r) => setTimeout(r, attempt * 400));
      }
    }
    return null;
  }

  // 1. Descobrir produtos por paginação nas categorias
  const categoryLimit = pLimit(Math.min(config.httpConcurrency, 6));

  const categoryTasks = seedCategories.map((seed) => categoryLimit(async () => {
    let start = 0;
    const sz = 60;
    const maxPerCat = 1800;

    while (start < maxPerCat && pagesProcessed < maxPages) {
      const sep = seed.includes('?') ? '&' : '?';
      const catUrl = `${seed}${sep}start=${start}&sz=${sz}`;
      pagesProcessed++;

      const html = await fetchHtml(catUrl);
      if (!html) break;

      // Extrair JSON-LD ItemList
      const ldJsons = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
      let foundInBatch = 0;

      for (const m of ldJsons) {
        try {
          const parsed = JSON.parse(m[1]);
          if (parsed['@type'] === 'ItemList' && Array.isArray(parsed.itemListElement)) {
            for (const item of parsed.itemListElement) {
              if (item.url) {
                const canonical = canonicalizeUrl(item.url, baseUrl);
                if (canonical && !productUrls.has(canonical)) {
                  productUrls.add(canonical);
                  foundInBatch++;
                }
              }
            }
          }
        } catch {}
      }

      // Descobrir subcategorias caso existam no HTML
      for (const hrefMatch of html.matchAll(/href="([^"]*(?:\/categoria\/|\/busca\?cgid=)[^"]*)"/gi)) {
        const catLink = canonicalizeUrl(hrefMatch[1], baseUrl);
        if (catLink && !queued.has(catLink) && queued.size < 50) {
          queued.add(catLink);
        }
      }

      if (foundInBatch === 0) {
        // Nao ha mais produtos nesta categoria
        break;
      }
      start += sz;
    }
  }));

  await Promise.all(categoryTasks);
  console.log(`[${source}] ${productUrls.size} URLs de produtos encontradas. Iniciando extração de detalhes...`);

  // 2. Extrair dados de cada produto concorrentemente
  const productLimit = pLimit(config.httpConcurrency);
  const prodUrlList = [...productUrls];

  const productTasks = prodUrlList.map((url) => productLimit(async () => {
    if (products.size >= maxProducts) return;
    const html = await fetchHtml(url);
    if (!html) return;

    const ldJsons = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of ldJsons) {
      try {
        const parsed = JSON.parse(m[1]);
        const product = parseNagumoProductJsonLd(parsed, url, baseUrl, source);
        if (product && product.name && product.product_url) {
          const key = product.product_url;
          if (!products.has(key)) {
            products.set(key, product);
            if (onProduct) {
              await onProduct(product);
            }
          }
          break;
        }
      } catch {}
    }
  }));

  await Promise.all(productTasks);

  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[${source}] finalizado: ${products.size} produtos coletados via HTTP/JSON-LD em ${durationSec}s (${pagesProcessed} páginas, ${failedPages} falhas).`);

  const result = [...products.values()];
  Object.defineProperty(result, 'stats', {
    value: {
      source,
      pagesProcessed,
      failedPages,
      products: result.length,
      durationSec: Number(durationSec),
      mode: 'nagumo-http'
    },
    enumerable: false
  });

  return result;
}
