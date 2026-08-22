function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Variável obrigatória ausente: ${name}`);
  }
  return value;
}

function cleanBaseUrl(value) {
  return String(value).replace(/\/$/, '');
}

const sources = {
  nagumo: cleanBaseUrl(required('NAGUMO_BASE_URL', 'https://www.nagumo.com.br')),
  coop: cleanBaseUrl(required('COOP_BASE_URL', 'https://www.coopsupermercado.com.br')),
  sonda: cleanBaseUrl(required('SONDA_BASE_URL', 'https://www.sondadelivery.com.br')),
  joanin: cleanBaseUrl(required('JOANIN_BASE_URL', 'https://joaninonline.com.br')),
  carrefour: cleanBaseUrl(required('CARREFOUR_BASE_URL', 'https://mercado.carrefour.com.br')),
  assai: cleanBaseUrl(required('ASSAI_BASE_URL', 'https://www.assai.com.br')),
  superabc: cleanBaseUrl(required('SUPERABC_BASE_URL', 'https://superabconline.com.br'))
};

const productCardSelectors = [
  '[data-product-id]',
  '[data-testid*="product"]',
  '[data-testid*="Product"]',
  '.product-card',
  '.productCard',
  '.vtex-product-summary-2-x-container',
  'article[class*="product"]',
  'li[class*="product"]'
];

export const config = {
  db: {
    host: required('DB_HOST', '127.0.0.1'),
    port: Number(required('DB_PORT', '3306')),
    database: required('DB_NAME', 'mercado_scraper'),
    user: required('DB_USER', 'root'),
    password: process.env.DB_PASSWORD ?? '',
    connectionLimit: Number(required('DB_CONNECTION_LIMIT', '5'))
  },
  sources,
  collectors: {
    nagumo: {
      source: 'nagumo',
      baseUrl: sources.nagumo,
      startUrls: [
        `${sources.nagumo}/busca?cgid=ofertas-dia`,
        `${sources.nagumo}/busca?cgid=SEMANAL`,
        `${sources.nagumo}/busca?cgid=MP-GERAL`,
        `${sources.nagumo}/categoria/departamentos/acougue/`,
        `${sources.nagumo}/categoria/departamentos/bebidas/`,
        `${sources.nagumo}/categoria/departamentos/hortifruti/`,
        `${sources.nagumo}/categoria/departamentos/padaria/`,
        `${sources.nagumo}/categoria/mercearia-salgada/`,
        `${sources.nagumo}/categoria/departamentos/limpeza/`
      ],
      waitForSelector: '.productCard',
      waitForSelectorTimeout: 15000,
      selectors: ['.productCard', ...productCardSelectors],
      productUrlPattern: /\.html(?:$|\?)/i,
      catalogPathPatterns: [/^\/busca(?:\/|$)/i, /^\/categoria(?:\/|$)/i],
      sitemapUrls: []
    },
    coop: {
      source: 'coop',
      baseUrl: sources.coop,
      startUrls: [
        `${sources.coop}/yes?map=promotion`,
        sources.coop,
        `${sources.coop}/mercearia/alimentos-basicos`,
        `${sources.coop}/bebidas`,
        `${sources.coop}/hortifruti`,
        `${sources.coop}/acougue`,
        `${sources.coop}/limpeza`,
        `${sources.coop}/exclusivos-coop?order=OrderByBestDiscountDESC`
      ],
      pageSettleMs: Math.max(1000, Number(process.env.COOP_PAGE_SETTLE_MS ?? '5000')),
      waitForSelector: '.vtex-product-summary-2-x-container',
      waitForSelectorTimeout: 15000,
      selectors: [...productCardSelectors, '.vtex-product-summary-2-x-container'],
      productUrlPattern: /\/p\/?(?:\?|$)/i,
      catalogPathPatterns: [/^\/yes(?:\/|$)/i, /^\/(?:mercearia|bebidas|hortifruti|acougue|limpeza|exclusivos-coop)(?:\/|$)/i],
      sitemapUrls: [`${sources.coop}/sitemap.xml`]
    },
    sonda: {
      source: 'sonda',
      baseUrl: sources.sonda,
      startUrls: [
        `${sources.sonda}/delivery/categoria/Mercearia-l`,
        `${sources.sonda}/delivery/categoria/Bebidas2`,
        `${sources.sonda}/delivery/categoria/Carnes,_Aves_e_Peixes`,
        `${sources.sonda}/delivery/categoria/Hortifruti`,
        `${sources.sonda}/delivery/categoria/Saudaveis`,
        `${sources.sonda}/delivery/categoria/Vegano`,
        `${sources.sonda}/delivery/categoria/Integrais`
      ],
      pageSettleMs: Math.max(1000, Number(process.env.SONDA_PAGE_SETTLE_MS ?? '3500')),
      waitForSelector: '[id*="linkProduto2"], [class*="produto"], [class*="product"]',
      waitForSelectorTimeout: 15000,
      selectors: [
        'a[id*="linkProduto2"]',
        '[data-product-id]',
        '[data-testid*="product"]',
        '.product-card',
        '[class*="produto"]',
        'article[class*="product"]',
        'li[class*="product"]'
      ],
      productUrlPattern: /\/delivery\/(?:produto|produto\/|p\/)/i,
      catalogPathPatterns: [/^\/delivery\/categoria(?:\/|$)/i, /^\/delivery\/(?:produto|p)(?:\/|$)/i],
      sitemapUrls: []
    },
    joanin: {
      source: 'joanin',
      baseUrl: sources.joanin,
      startUrls: [`${sources.joanin}/p`],
      selectors: [...productCardSelectors, '[class*="produto"]'],
      productUrlPattern: /\/(?:p|produto)(?:\/|$)/i,
      catalogPathPatterns: [/^\/p(?:\/|$)/i, /^\/produto(?:\/|$)/i],
      sitemapUrls: []
    },
    carrefour: {
      source: 'carrefour',
      baseUrl: sources.carrefour,
      startUrls: [sources.carrefour],
      selectors: [...productCardSelectors, '[class*="product-card"]', '[class*="productCard"]'],
      productUrlPattern: /\/(?:p|produto)(?:\/|$)|\.html(?:$|\?)/i,
      catalogPathPatterns: [/^\/(?:categoria|departamento|produto|p)(?:\/|$)/i],
      sitemapUrls: []
    },
    assai: {
      source: 'assai',
      baseUrl: sources.assai,
      startUrls: [sources.assai],
      selectors: [...productCardSelectors, '[class*="product-card"]', '[class*="productCard"]'],
      productUrlPattern: /\/(?:produto|product|p)(?:\/|$)|\.html(?:$|\?)/i,
      catalogPathPatterns: [/^\/(?:produto|product|p|categoria|departamento)(?:\/|$)/i],
      sitemapUrls: []
    },
    superabc: {
      source: 'superabc',
      baseUrl: sources.superabc,
      startUrls: [sources.superabc],
      pageSettleMs: Math.max(1000, Number(process.env.SUPERABC_PAGE_SETTLE_MS ?? '4000')),
      waitForSelector: 'app-produtos-produto, .product-item',
      waitForSelectorTimeout: 15000,
      selectors: [
        'app-produtos-produto',
        '.product-item',
        ...productCardSelectors
      ],
      productUrlPattern: /\/(?:produto|product|p)(?:\/|$)/i,
      catalogPathPatterns: [/^\/(?:produto|product|p|categoria|busca)(?:\/|$)/i],
      sitemapUrls: []
    }
  },
  headless: String(process.env.HEADLESS ?? 'true').toLowerCase() !== 'false',
  requestDelayMs: Math.max(500, Number(required('REQUEST_DELAY_MS', '1500'))),
  pageSettleMs: Math.max(250, Number(required('PAGE_SETTLE_MS', '1800'))),
  navigationTimeoutMs: Math.max(10000, Number(required('NAVIGATION_TIMEOUT_MS', '45000'))),
  maxConcurrency: Math.max(1, Number(required('MAX_CONCURRENCY', '1'))),
  maxPagesPerSource: Math.max(1, Number(required('MAX_PAGES_PER_SOURCE', '600'))),
  maxSitemapUrls: Math.max(0, Number(required('MAX_SITEMAP_URLS', '500'))),
  savePriceHistory: String(process.env.SAVE_PRICE_HISTORY ?? 'true').toLowerCase() !== 'false'
};
