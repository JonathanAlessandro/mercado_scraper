import { chromium } from 'playwright';
import { config } from '../config.js';
import { absoluteUrl, cleanText, isProductLikeUrl, parseBrazilianMoney } from '../utils/normalize.js';

const PRODUCT_SELECTORS = [
  '[data-product-id]',
  '[data-testid*="product"]',
  '.product-card',
  '.vtex-product-summary-2-x-container',
  'article[class*="product"]',
  'li[class*="product"]'
];

function productFromJsonLd(json, pageUrl, baseUrl, source) {
  const items = Array.isArray(json) ? json : [json];
  const product = items.find((item) => item?.['@type'] === 'Product' || item?.['@type']?.includes?.('Product'));
  if (!product) return null;
  const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
  const price = parseBrazilianMoney(offers?.price);
  return {
    source,
    external_id: cleanText(product.sku ?? product.productID ?? product.mpn),
    name: cleanText(product.name),
    brand: cleanText(typeof product.brand === 'object' ? product.brand.name : product.brand),
    category: cleanText(product.category),
    sku: cleanText(product.sku ?? product.mpn),
    price,
    promotional_price: null,
    unit: null,
    available: offers?.availability ? !String(offers.availability).toLowerCase().includes('outofstock') : true,
    image_url: absoluteUrl(Array.isArray(product.image) ? product.image[0] : product.image, baseUrl),
    product_url: absoluteUrl(product.url, pageUrl) ?? pageUrl,
    raw_data: product
  };
}

async function extractPageProducts(page, { source, baseUrl }) {
  return page.evaluate(({ source, baseUrl, selectors }) => {
    const text = (el) => el?.textContent?.replace(/\\s+/g, ' ').trim() || null;
    const attr = (el, name) => el?.getAttribute(name) || null;
    const absolute = (value) => {
      if (!value) return null;
      try { return new URL(value, baseUrl).href; } catch { return null; }
    };
    const result = [];
    const seen = new Set();

    for (const selector of selectors) {
      for (const card of document.querySelectorAll(selector)) {
        const link = card.querySelector('a[href]');
        const productUrl = absolute(attr(link, 'href'));
        const name = text(card.querySelector('[class*="name"], [class*="Name"], [class*="title"], h2, h3, h4')) || text(link);
        if (!productUrl || !name || seen.has(productUrl)) continue;
        seen.add(productUrl);
        const prices = [...card.querySelectorAll('[class*="price"], [class*="Price"], [data-price]')]
          .map((el) => text(el) || attr(el, 'data-price'))
          .filter(Boolean);
        const image = card.querySelector('img');
        result.push({
          source,
          external_id: attr(card, 'data-product-id') || attr(card, 'data-id'),
          name,
          brand: text(card.querySelector('[class*="brand"], [class*="Brand"]')),
          category: null,
          sku: attr(card, 'data-sku'),
          price_text: prices[0] || null,
          promotional_price_text: prices[1] || null,
          unit: text(card.querySelector('[class*="unit"], [class*="Unit"]')),
          available: !/indispon|esgotado|out of stock/i.test(text(card)),
          image_url: absolute(attr(image, 'src') || attr(image, 'data-src')),
          product_url: productUrl,
          raw_data: { card_text: text(card) }
        });
      }
    }
    return result;
  }, { source, baseUrl, selectors: PRODUCT_SELECTORS });
}

async function extractJsonLd(page, { source, baseUrl }) {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const result = [];
  for (const block of blocks) {
    try {
      const json = JSON.parse(block);
      const values = Array.isArray(json) ? json : [json];
      for (const value of values) {
        const item = productFromJsonLd(value, page.url(), baseUrl, source);
        if (item?.name) result.push(item);
      }
    } catch {
      // JSON-LD incompleto: o extrator de cards continua sendo utilizado.
    }
  }
  return result;
}

function normalizeCardProduct(product, source, baseUrl) {
  return {
    source,
    external_id: cleanText(product.external_id),
    name: cleanText(product.name),
    brand: cleanText(product.brand),
    category: cleanText(product.category),
    sku: cleanText(product.sku),
    price: parseBrazilianMoney(product.price_text),
    promotional_price: parseBrazilianMoney(product.promotional_price_text),
    unit: cleanText(product.unit),
    available: Boolean(product.available),
    image_url: absoluteUrl(product.image_url, baseUrl),
    product_url: absoluteUrl(product.product_url, baseUrl),
    raw_data: product
  };
}

async function discoverLinks(page, baseUrl) {
  const links = await page.locator('a[href]').evaluateAll((anchors, base) => anchors.map((a) => {
    try { return new URL(a.href || a.getAttribute('href'), base).href; } catch { return null; }
  }).filter(Boolean), baseUrl);

  return [...new Set(links)].filter((url) => {
    try {
      const current = new URL(url);
      const base = new URL(baseUrl);
      return current.hostname === base.hostname && isProductLikeUrl(url);
    } catch {
      return false;
    }
  });
}

async function processPage(page, url, sourceConfig) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(config.pageSettleMs);
  const jsonProducts = await extractJsonLd(page, sourceConfig);
  const cardProducts = (await extractPageProducts(page, sourceConfig))
    .map((product) => normalizeCardProduct(product, sourceConfig.source, sourceConfig.baseUrl));
  const links = await discoverLinks(page, sourceConfig.baseUrl);
  return { products: [...jsonProducts, ...cardProducts], links };
}

async function processWithRetry(page, url, sourceConfig) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await processPage(page, url, sourceConfig);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

export async function collectSource({ source, startUrl, baseUrl, browser, onProduct }) {
  const sourceConfig = { source, baseUrl };
  const queue = [startUrl];
  const visited = new Set();
  const products = new Map();
  let activeWorkers = 0;
  let inFlight = 0;
  let pagesProcessed = 0;

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
    const context = await browser.newContext({ locale: 'pt-BR' });
    const page = await context.newPage();
    activeWorkers += 1;
    try {
      while (true) {
        const url = takeUrl();
        if (!url) {
          if (inFlight === 0 && (queue.length === 0 || pagesProcessed >= config.maxPagesPerSource)) break;
          await new Promise((resolve) => setTimeout(resolve, 250));
          continue;
        }
        inFlight += 1;
        try {
          const { products: pageProducts, links } = await processWithRetry(page, url, sourceConfig);
          for (const link of links) {
            if (!visited.has(link) && queue.length < config.maxPagesPerSource * 3) queue.push(link);
          }
          for (const product of pageProducts) {
            if (!product.name || !product.product_url || products.has(product.product_url)) continue;
            products.set(product.product_url, product);
            if (onProduct) await onProduct(product);
          }
          console.log(`[${source}/worker-${workerId}] página ${pagesProcessed}/${config.maxPagesPerSource}; ${products.size} produtos`);
        } catch (error) {
          console.warn(`[${source}/worker-${workerId}] falha em ${url}: ${error.message}`);
        } finally {
          inFlight -= 1;
        }
        await new Promise((resolve) => setTimeout(resolve, config.requestDelayMs));
      }
    } finally {
      activeWorkers -= 1;
      await context.close();
    }
  };

  const workerCount = Math.max(1, Math.min(config.maxConcurrency, config.maxPagesPerSource));
  await Promise.all(Array.from({ length: workerCount }, (_, index) => worker(index + 1)));
  console.log(`[${source}] concluído: ${products.size} produtos; ${pagesProcessed} páginas processadas.`);
  return [...products.values()];
}

export async function createBrowser() {
  return chromium.launch({ headless: config.headless });
}
