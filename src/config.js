import 'dotenv/config';

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Variável obrigatória ausente: ${name}`);
  }
  return value;
}

export const config = {
  db: {
    host: required('DB_HOST', '127.0.0.1'),
    port: Number(required('DB_PORT', '3306')),
    database: required('DB_NAME', 'mercado_scraper'),
    user: required('DB_USER', 'root'),
    password: process.env.DB_PASSWORD ?? '',
    connectionLimit: Number(required('DB_CONNECTION_LIMIT', '5'))
  },
  sources: {
    nagumo: required('NAGUMO_BASE_URL', 'https://www.nagumo.com.br').replace(/\/$/, ''),
    coop: required('COOP_BASE_URL', 'https://www.coopsupermercado.com.br').replace(/\/$/, '')
  },
  headless: String(process.env.HEADLESS ?? 'true').toLowerCase() !== 'false',
  requestDelayMs: Number(required('REQUEST_DELAY_MS', '1200')),
  pageSettleMs: Number(required('PAGE_SETTLE_MS', '1500')),
  maxConcurrency: Number(required('MAX_CONCURRENCY', '2')),
  maxPagesPerSource: Number(required('MAX_PAGES_PER_SOURCE', '500'))
};
