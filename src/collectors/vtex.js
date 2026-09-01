import pLimit from 'p-limit';
import { config } from '../config.js';
import {
  canonicalizeUrl,
  cleanText,
  parseBrazilianMoney
} from '../utils/normalize.js';

export function parseVtexProduct(p, baseUrl, source) {
  if (!p || !p.productName) return null;
  const item = p.items?.[0];
  const seller = item?.sellers?.[0] ?? item?.sellers?.find((s) => s.sellerDefault) ?? {};
  const offer = seller.commertialOffer ?? {};

  const listPrice = parseBrazilianMoney(offer.ListPrice);
  const price = parseBrazilianMoney(offer.Price);
  const regularPrice = listPrice && listPrice > 0 ? listPrice : price;
  const promotionalPrice = listPrice && price && listPrice > price ? price : null;

  const availability = offer.AvailableQuantity !== undefined
    ? offer.AvailableQuantity > 0
    : true;

  const rawCategory = Array.isArray(p.categories) ? p.categories[0] : p.categories;
  const category = cleanText(rawCategory ? String(rawCategory).replace(/^\/|\/$/g, '').replace(/\//g, ' > ') : null);

  const images = item?.images ?? [];
  const imageUrl = images[0]?.imageUrl ?? null;
  const productUrl = canonicalizeUrl(p.link, baseUrl);

  return {
    source,
    external_id: cleanText(p.productId ?? item?.itemId),
    name: cleanText(p.productName),
    brand: cleanText(p.brand),
    category,
    sku: cleanText(item?.itemId ?? item?.ean),
    price: regularPrice,
    promotional_price: promotionalPrice,
    unit: cleanText(item?.measurementUnit || item?.unitMultiplier ? `${item?.unitMultiplier ?? ''} ${item?.measurementUnit ?? ''}`.trim() : null),
    available: availability,
    image_url: imageUrl,
    product_url: productUrl,
    raw_data: {
      kind: 'vtex-api',
      productId: p.productId,
      itemId: item?.itemId
    }
  };
}

export async function collectVtex({
  source = 'coop',
  baseUrl = config.sources.coop,
  onProduct = null,
  maxProducts = 50000
} = {}) {
  const startedAt = Date.now();
  console.log(`[${source}] iniciando coleta direta via API VTEX...`);

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9'
  };

  // 1. Obter arvore de categorias
  let categories = [];
  try {
    const treeRes = await fetch(`${baseUrl}/api/catalog_system/pub/category/tree/2`, { headers });
    if (treeRes.ok) {
      const tree = await treeRes.json();
      const flatten = (list) => {
        for (const node of list) {
          if (node.id) categories.push({ id: node.id, name: node.name, url: node.url });
          if (node.children && node.children.length > 0) flatten(node.children);
        }
      };
      flatten(tree);
      console.log(`[${source}] ${categories.length} categorias identificadas na arvore VTEX.`);
    }
  } catch (err) {
    console.warn(`[${source}] aviso ao buscar arvore de categorias: ${err.message}`);
  }

  if (categories.length === 0) {
    categories = [{ id: '', name: 'Geral' }];
  }

  const limit = pLimit(config.httpConcurrency);
  const products = new Map();
  let pagesProcessed = 0;
  let failedPages = 0;

  async function fetchCategoryBatch(categoryId, from, to) {
    const query = categoryId ? `fq=C:${categoryId}&_from=${from}&_to=${to}` : `_from=${from}&_to=${to}`;
    const url = `${baseUrl}/api/catalog_system/pub/products/search?${query}`;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, { headers });
        if (!res.ok && res.status !== 206) {
          if (res.status === 404 || res.status === 400) return [];
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        pagesProcessed++;
        return Array.isArray(data) ? data : [];
      } catch (err) {
        if (attempt === 3) {
          failedPages++;
          return [];
        }
        await new Promise((r) => setTimeout(r, attempt * 400));
      }
    }
    return [];
  }

  const categoryTasks = categories.map((cat) => limit(async () => {
    let from = 0;
    const pageSize = 50;
    const maxPerCategory = 2500;

    while (from < maxPerCategory && products.size < maxProducts) {
      const to = from + pageSize - 1;
      const rawProducts = await fetchCategoryBatch(cat.id, from, to);
      if (rawProducts.length === 0) break;

      for (const raw of rawProducts) {
        const product = parseVtexProduct(raw, baseUrl, source);
        if (!product || !product.product_url || !product.name) continue;

        const key = product.product_url;
        if (!products.has(key)) {
          products.set(key, product);
          if (onProduct) {
            await onProduct(product);
          }
        }
      }

      if (rawProducts.length < pageSize) {
        break;
      }
      from += pageSize;
    }
  }));

  await Promise.all(categoryTasks);

  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[${source}] finalizado: ${products.size} produtos coletados via VTEX API em ${durationSec}s (${pagesProcessed} paginas, ${failedPages} falhas).`);

  const result = [...products.values()];
  Object.defineProperty(result, 'stats', {
    value: {
      source,
      pagesProcessed,
      failedPages,
      products: result.length,
      durationSec: Number(durationSec),
      mode: 'vtex-api'
    },
    enumerable: false
  });

  return result;
}
