import { config } from './config.js';
import { ensureDatabase, pool, upsertProduct } from './db/mysql.js';
import { collectSource, createBrowser } from './collectors/generic.js';

const sources = [
  {
    source: 'nagumo',
    baseUrl: config.sources.nagumo,
    startUrl: config.sources.nagumo
  },
  {
    source: 'coop',
    baseUrl: config.sources.coop,
    startUrl: config.sources.coop
  }
];

async function main() {
  const startedAt = new Date();
  console.log(`Iniciando coleta paralela em ${startedAt.toISOString()}`);
  console.log(`Mercados simultâneos: ${sources.length}; workers por mercado: ${config.maxConcurrency}`);
  await ensureDatabase();

  const browser = await createBrowser();
  try {
    const results = await Promise.all(sources.map(async (source) => {
      let saved = 0;
      const products = await collectSource({
        ...source,
        browser,
        onProduct: async (product) => {
          await upsertProduct({ ...product, collected_at: startedAt });
          saved += 1;
        }
      });
      console.log(`[${source.source}] ${saved} produtos gravados/atualizados.`);
      return { source: source.source, found: products.length, saved };
    }));

    console.table(results);
  } finally {
    await browser.close();
    await pool.end();
  }

  console.log(`Coleta finalizada em ${new Date().toISOString()}`);
}

main().catch((error) => {
  console.error('Erro fatal:', error);
  process.exitCode = 1;
});
