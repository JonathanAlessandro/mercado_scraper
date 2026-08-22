import { config } from './config.js';
import { ensureDatabase, pool, upsertProduct } from './db/mysql.js';
import { createBrowser } from './collectors/generic.js';
import { collectNagumo } from './collectors/nagumo.js';
import { collectCoop } from './collectors/coop.js';
import { collectSonda } from './collectors/sonda.js';
import { collectJoanin } from './collectors/joanin.js';
import { collectCarrefour } from './collectors/carrefour.js';
import { collectAssai } from './collectors/assai.js';
import { collectSuperAbc } from './collectors/superabc.js';

const collectors = [
  ['nagumo', collectNagumo],
  ['coop', collectCoop],
  ['sonda', collectSonda],
  ['joanin', collectJoanin],
  ['carrefour', collectCarrefour],
  ['assai', collectAssai],
  ['superabc', collectSuperAbc]
];

async function main() {
  const startedAt = new Date();
  console.log(`Iniciando coleta de ${collectors.length} mercados em ${startedAt.toISOString()}`);
  console.log(`Workers por mercado: ${config.maxConcurrency}`);
  await ensureDatabase();

  const browser = await createBrowser();
  try {
    const results = await Promise.all(collectors.map(async ([source, collect]) => {
      let saved = 0;
      try {
        const products = await collect({
          browser,
          onProduct: async (product) => {
            await upsertProduct({ ...product, collected_at: startedAt });
            saved += 1;
          }
        });
        const stats = products.stats ?? {};
        const status = stats.failedPages > 0
          ? (products.length > 0 ? 'partial' : 'blocked_or_unavailable')
          : 'ok';
        console.log(`[${source}] ${saved} produtos gravados/atualizados; ${stats.pagesProcessed ?? 0} páginas; ${stats.failedPages ?? 0} falhas; status=${status}.`);
        return { source, status, found: products.length, saved, ...stats };
      } catch (error) {
        console.warn(`[${source}] coleta interrompida: ${error.message}`);
        return { source, status: 'error', found: 0, saved, error: error.message };
      }
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
