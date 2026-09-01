import { chromium } from 'playwright';
import { config } from '../config.js';
import {
  absoluteUrl,
  canonicalizeUrl,
  cleanText,
  isProductLikeUrl,
  parseBrazilianMoney
} from '../utils/normalize.js';

const PRODUCT_SELECTORS = [
  '[data-product-id]',
  '[data-testid*="product"]',
  '[data-testid*="Product"]',
  '.product-card',
  '.productCard',
  '.vtex-product-summary-2-x-container',
  'article[class*="product"]',
  'li[class*="product"]',
  'app-produtos-produto',
  '.product-item'
];

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

function flattenStructured(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenStructured);
  if (typeof value !== 'object') return [];
  const graph = Array.isArray(value['@graph']) ? value['@graph'] : [];
  return [value, ...graph.flatMap(flattenStructured)];
}

function isProductObject(value) {
  const type = value?.['@type'];
  return type === 'Product' || (Array.isArray(type) && type.includes('Product')) || String(type ?? '').includes('Product');
}

function offerList(product) {
  return asArray(product?.offers).filter(Boolean);
}

function bestOffer(product) {
  const offers = offerList(product);
  return offers.find((offer) => offer.price !== undefined || offer.lowPrice !== undefined) ?? offers[0] ?? {};
}

function productFromJsonLd(json, pageUrl, baseUrl, source) {
  const product = flattenStructured(json).find(isProductObject);
  if (!product) return null;
  const offer = bestOffer(product);
  const price = parseBrazilianMoney(offer.price ?? offer.lowPrice ?? product.price);
  const highPrice = parseBrazilianMoney(offer.highPrice);
  const availability = String(offer.availability ?? product.availability ?? '').toLowerCase();
  const images = product.image ?? product.images;
  return {
    source,
    external_id: cleanText(product.sku ?? product.productID ?? product.mpn ?? product.gtin13),
    name: cleanText(product.name),
    brand: cleanText(typeof product.brand === 'object' ? product.brand?.name : product.brand),
    category: cleanText(product.category),
    sku: cleanText(product.sku ?? product.mpn),
    price,
    promotional_price: highPrice !== null && price !== null && highPrice > price ? price : null,
    unit: cleanText(product.size ?? product.weight),
    available: availability ? !/(outofstock|soldout|unavailable|indispon)/i.test(availability) : true,
    image_url: absoluteUrl(Array.isArray(images) ? images[0] : images, baseUrl),
    product_url: canonicalizeUrl(product.url, pageUrl) ?? canonicalizeUrl(pageUrl, baseUrl),
    raw_data: { kind: 'json-ld', data: product }
  };
}

function productIdFromFallback({ source, name, imageUrl, externalId }) {
  const value = externalId || imageUrl?.match(/\/([^/]+?)(?:\.(?:webp|png|jpe?g|avif))(?:\?|$)/i)?.[1] || name;
  const slug = String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
  return `${source}-${slug || 'unknown'}`;
}

async function extractPageProducts(page, { source, baseUrl, selectors = PRODUCT_SELECTORS }) {
  return page.evaluate(({ source, baseUrl, selectors }) => {
    const text = (el) => el?.textContent?.replace(/\s+/g, ' ').trim() || null;
    const attr = (el, name) => el?.getAttribute?.(name) || null;
    const first = (root, candidates) => {
      for (const selector of candidates) {
        const value = root.querySelector?.(selector);
        if (value) return value;
      }
      return null;
    };
    const absolute = (value) => {
      if (!value) return null;
      try { return new URL(value, baseUrl).href; } catch { return null; }
    };
    const amount = (value) => {
      if (!value || !/(?:R\$|BRL|\d[\d.]*,\d{2}|\d+\.\d{2})/i.test(value)) return null;
      const match = String(value).match(/-?\d[\d.]*,\d{2}|-?\d+\.\d{2}/);
      return match ? match[0] : null;
    };
    const isUnitPrice = (el) => /(?:pre[cç]o\s+por|por\s+(?:kg|quilo|litro|l|100g|unidade))/i.test(text(el?.parentElement) || text(el));
    const cardPriceTexts = (card) => {
      const candidates = [];
      const seen = new Set();
      const add = (el, role = null) => {
        if (!el || isUnitPrice(el)) return;
        const value = attr(el, 'content') || attr(el, 'data-price') || text(el);
        const parsed = amount(value);
        if (!parsed) return;
        const key = `${role || ''}|${parsed}|${text(el)}`;
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push({ value: parsed, role, text: text(el) });
        }
      };
      for (const selector of [
        'meta[itemprop="price"]',
        '[itemprop="price"]',
        '[data-price]',
        '[class*="preco-por"]',
        '[class*="price"]',
        '[class*="Price"]',
        '[class*="preco"]',
        '[class*="Preco"]',
        '[class*="valor"]'
      ]) {
        for (const el of card.querySelectorAll(selector)) {
          const className = attr(el, 'class') || '';
          const valueText = text(el) || '';
          const startsWithOffer = /^\s*(?:por|agora|oferta)\s*:/i.test(valueText);
          const isCurrent = /(?:final[_-]?price|promo|price-current|selling[_-]?price|sale)/i.test(className) || startsWithOffer;
          add(el, isCurrent ? 'current' : null);
        }
      }
      const ordered = [...card.querySelectorAll('span,div,p,meta')];
      for (const el of ordered) {
        const value = text(el) || attr(el, 'content') || attr(el, 'data-price');
        if (value && /R\$|BRL/i.test(value)) add(el, null);
      }
      return candidates;
    };

    const result = [];
    const seen = new Set();
    for (const selector of selectors) {
      for (const card of document.querySelectorAll(selector)) {
        const link = card.matches?.('a[href]') ? card : card.querySelector('a[href]') || card.closest?.('a[href]');
        const explicitUrl = absolute(attr(link, 'href'));
        const image = first(card, ['img[src]', 'img[data-src]', 'img[data-lazy-src]']);
        const imageUrl = absolute(attr(image, 'src') || attr(image, 'data-src') || attr(image, 'data-lazy-src') || attr(image, 'data-original'));
        const nameElement = first(card, [
          '[itemprop="name"]',
          '.produto-descricao',
          '[class*="product-name"]',
          '[class*="productName"]',
          '[class*="name"]',
          '[class*="Name"]',
          '[class*="title"]',
          '[class*="descricao"]',
          'h2', 'h3', 'h4',
          'img[alt]'
        ]);
        const name = text(nameElement) || attr(nameElement, 'alt') || text(link);
        if (!name) continue;
        const externalId = attr(card, 'data-product-id') || attr(card, 'data-id') || attr(card, 'data-sku') || attr(card, 'data-product') || null;
        const fallbackId = externalId || imageUrl?.match(/\/([^/]+?)(?:\.(?:webp|png|jpe?g|avif))(?:\?|$)/i)?.[1] || name;
        const productUrl = explicitUrl || `${baseUrl}/produto/${encodeURIComponent(String(fallbackId).slice(0, 180))}`;
        const prices = cardPriceTexts(card);
        const promotional = prices.find((item) => item.role === 'current') || null;
        const regular = prices.find((item) => item.role !== 'current') || prices[0] || promotional;
        const cardText = text(card) || '';
        const available = !/(?:indispon[ií]vel|esgotado|out of stock|sold out|sem estoque)/i.test(cardText);
        const key = `${productUrl}|${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          source,
          external_id: externalId,
          name,
          brand: text(first(card, ['[itemprop="brand"]', '[class*="brand"]', '[class*="Brand"]'])),
          category: text(first(card, ['[itemprop="category"]', '[class*="category"]', '[class*="categoria"]'])),
          sku: attr(card, 'data-sku') || attr(card, 'data-sku-id'),
          price_text: regular?.value || null,
          promotional_price_text: promotional && regular && promotional.value !== regular.value ? promotional.value : null,
          unit: text(first(card, ['[class*="unit"]', '[class*="Unit"]', '[class*="unidade"]', '.preco-unitario'])),
          available,
          image_url: imageUrl,
          product_url: productUrl,
          raw_data: {
            kind: 'card',
            card_text: cardText,
            price_texts: prices,
            image_url: imageUrl
          }
        });
      }
    }
    return result;
  }, { source, baseUrl, selectors });
}

function normalizeCardProduct(product, source, baseUrl) {
  const price = parseBrazilianMoney(product.price_text);
  const promotionalPrice = parseBrazilianMoney(product.promotional_price_text);
  return {
    source,
    external_id: cleanText(product.external_id),
    name: cleanText(product.name),
    brand: cleanText(product.brand),
    category: cleanText(product.category),
    sku: cleanText(product.sku),
    price,
    promotional_price: promotionalPrice !== null && price !== null && promotionalPrice < price ? promotionalPrice : null,
    unit: cleanText(product.unit),
    available: Boolean(product.available),
    image_url: absoluteUrl(product.image_url, baseUrl),
    product_url: canonicalizeUrl(product.product_url, baseUrl),
    raw_data: product.raw_data
  };
}

function scoreProduct(product) {
  return [
    product.name,
    product.external_id,
    product.sku,
    product.brand,
    product.category,
    product.price,
    product.promotional_price,
    product.unit,
    product.image_url,
    product.product_url
  ].filter((value) => value !== null && value !== undefined && value !== '').length;
}

function mergeProducts(previous, next) {
  const merged = { ...previous };
  for (const field of ['external_id', 'name', 'brand', 'category', 'sku', 'price', 'promotional_price', 'unit', 'image_url', 'product_url']) {
    if ((merged[field] === null || merged[field] === undefined || merged[field] === '') && next[field] !== null && next[field] !== undefined && next[field] !== '') {
      merged[field] = next[field];
    }
  }
  if (scoreProduct(next) >= scoreProduct(previous)) {
    merged.available = next.available;
    merged.raw_data = { previous: previous.raw_data, latest: next.raw_data };
  }
  return merged;
}

function xmlLocations(xml) {
  return [...String(xml).matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => match[1].trim());
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'mercado_scraper/patch-validation (+public-catalog)', accept: 'application/xml,text/xml,text/plain,*/*' },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function discoverSitemapProducts(sourceConfig) {
  const urls = [];
  for (const sitemapUrl of sourceConfig.sitemapUrls ?? []) {
    if (urls.length >= config.maxSitemapUrls) break;
    try {
      const root = await fetchText(sitemapUrl);
      const locations = xmlLocations(root);
      const children = locations.filter((location) => /\.xml(?:\?|$)/i.test(location));
      const productLocations = locations.filter((location) => !/\.xml(?:\?|$)/i.test(location));
      urls.push(...productLocations);
      for (const child of children) {
        if (urls.length >= config.maxSitemapUrls) break;
        try {
          const childXml = await fetchText(child);
          urls.push(...xmlLocations(childXml).filter((location) => !/\.xml(?:\?|$)/i.test(location)));
        } catch (error) {
          console.warn(`[${sourceConfig.source}] sitemap inacessível ${child}: ${error.message}`);
        }
      }
    } catch (error) {
      console.warn(`[${sourceConfig.source}] sitemap inacessível ${sitemapUrl}: ${error.message}`);
    }
  }
  return [...new Set(urls)]
    .filter((url) => isProductLikeUrl(url, sourceConfig))
    .slice(0, config.maxSitemapUrls);
}

async function discoverLinks(page, sourceConfig) {
  const links = await page.locator('a[href], link[rel="next"]').evaluateAll((elements, base) => elements.map((element) => {
    try { return new URL(element.href || element.getAttribute('href'), base).href; } catch { return null; }
  }).filter(Boolean), sourceConfig.baseUrl);
  return [...new Set(links)]
    .map((url) => canonicalizeUrl(url, sourceConfig.baseUrl))
    .filter((url) => isProductLikeUrl(url, sourceConfig));
}

function blockedPage(title, body, responseStatus, productsFound) {
  if (productsFound > 0) return false;
  const marker = `${title}\n${body}`;
  return responseStatus >= 400 || /captcha|just a moment|verifying you are human|access denied|403 forbidden|cloudfront distribution/i.test(marker);
}

async function processPage(page, url, sourceConfig) {
  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: config.navigationTimeoutMs
  });

  if (sourceConfig.waitForSelector) {
    await page.waitForSelector(sourceConfig.waitForSelector, {
      state: 'attached',
      timeout: Math.min(sourceConfig.waitForSelectorTimeout ?? 5000, 5000)
    }).catch(() => {});
  }

  const jsonProducts = await extractJsonLd(page, sourceConfig);
  const cardProducts = (await extractPageProducts(page, sourceConfig))
    .map((product) => normalizeCardProduct(product, sourceConfig.source, sourceConfig.baseUrl));
  const products = [...jsonProducts, ...cardProducts].filter((product) => product.name && product.product_url);
  const title = await page.title().catch(() => '');
  const body = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
  const status = response?.status?.() ?? 200;
  if (blockedPage(title, body, status, products.length)) {
    throw new Error(`fonte bloqueada ou indisponível (HTTP ${status}; título: ${title || 'sem título'})`);
  }
  const links = await discoverLinks(page, sourceConfig);
  return { products, links, status };
}

async function extractJsonLd(page, sourceConfig) {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const result = [];
  for (const block of blocks) {
    try {
      const json = JSON.parse(block);
      for (const value of asArray(json)) {
        const item = productFromJsonLd(value, page.url(), sourceConfig.baseUrl, sourceConfig.source);
        if (item?.name && item.product_url) result.push(item);
      }
    } catch {
      // JSON-LD parcial ou inválido: os cards permanecem como fonte de fallback.
    }
  }
  return result;
}

async function processWithRetry(page, url, sourceConfig) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await processPage(page, url, sourceConfig);
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

export async function collectSource({
  source,
  startUrl,
  startUrls = [],
  baseUrl,
  browser,
  onProduct,
  pageSettleMs = config.pageSettleMs,
  waitForSelector = null,
  waitForSelectorTimeout = null,
  selectors = PRODUCT_SELECTORS,
  productUrlPattern,
  catalogPathPatterns = [],
  sitemapUrls = []
}) {
  const sourceConfig = { source, baseUrl, pageSettleMs, waitForSelector, waitForSelectorTimeout, selectors, productUrlPattern, catalogPathPatterns, sitemapUrls };
  const sameHost = (url) => {
    try { return new URL(url).hostname === new URL(baseUrl).hostname; } catch { return false; }
  };
  const initialSeeds = [...(startUrls.length ? startUrls : [startUrl])]
    .map((url) => canonicalizeUrl(url, baseUrl))
    .filter((url) => url && sameHost(url));
  const sitemapSeeds = await discoverSitemapProducts(sourceConfig);
  const seedUrls = [...new Set([...initialSeeds, ...sitemapSeeds])];
  const queue = [...seedUrls];
  const queued = new Set(queue);
  const visited = new Set();
  const products = new Map();
  let inFlight = 0;
  let pagesProcessed = 0;
  let failedPages = 0;

  const enqueue = (url) => {
    const canonical = canonicalizeUrl(url, baseUrl);
    if (!canonical || visited.has(canonical) || queued.has(canonical) || queue.length >= config.maxPagesPerSource * 4) return;
    if (!isProductLikeUrl(canonical, sourceConfig)) return;
    queued.add(canonical);
    queue.push(canonical);
  };

  const takeUrl = () => {
    while (queue.length && pagesProcessed < config.maxPagesPerSource) {
      const url = queue.shift();
      if (!url || visited.has(url)) continue;
      visited.add(url);
      pagesProcessed += 1;
      return url;
    }
    return null;
  };

  const worker = async (workerId) => {
    const context = await browser.newContext({
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    // Bloquear imagens, fontes, estilos e trackers para acelerar navegação em 400%
    await page.route('**/*', (route) => {
      const req = route.request();
      const type = req.resourceType();
      const reqUrl = req.url();
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        return route.abort();
      }
      if (/google-analytics|googletagmanager|facebook|criteo|doubleclick|hotjar|clarity|bing|yandex/i.test(reqUrl)) {
        return route.abort();
      }
      return route.continue();
    });

    try {
      while (true) {
        const url = takeUrl();
        if (!url) {
          if (inFlight === 0 && (queue.length === 0 || pagesProcessed >= config.maxPagesPerSource)) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }
        inFlight += 1;
        try {
          const { products: pageProducts, links } = await processWithRetry(page, url, sourceConfig);
          for (const link of links) enqueue(link);
          for (const product of pageProducts) {
            const key = canonicalizeUrl(product.product_url, baseUrl) || `${source}:${product.external_id || product.name}`;
            const merged = products.has(key) ? mergeProducts(products.get(key), product) : product;
            products.set(key, merged);
            if (onProduct) await onProduct(merged);
          }
          if (pagesProcessed % 10 === 0 || pagesProcessed === 1) {
            console.log(`[${source}/worker-${workerId}] página ${pagesProcessed}/${config.maxPagesPerSource}; ${products.size} produtos`);
          }
        } catch (error) {
          failedPages += 1;
          console.warn(`[${source}/worker-${workerId}] falha em ${url}: ${error.message}`);
        } finally {
          inFlight -= 1;
        }
        if (config.requestDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, config.requestDelayMs));
        }
      }
    } finally {
      await context.close();
    }
  };

  const concurrency = config.browserConcurrency ?? config.maxConcurrency ?? 3;
  const workerCount = Math.max(1, Math.min(concurrency, config.maxPagesPerSource));
  await Promise.all(Array.from({ length: workerCount }, (_, index) => worker(index + 1)));
  console.log(`[${source}] concluído: ${products.size} produtos; ${pagesProcessed} páginas; ${failedPages} falhas.`);
  const result = [...products.values()];
  Object.defineProperty(result, 'stats', {
    value: { source, seedCount: seedUrls.length, pagesProcessed, failedPages, products: result.length },
    enumerable: false
  });
  return result;
}

export async function createBrowser() {
  return chromium.launch({
    headless: config.headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ]
  });
}

