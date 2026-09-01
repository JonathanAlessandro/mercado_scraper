import { config } from './config.js';
import { ensureDatabase, pool, BatchSaver } from './db/mysql.js';
import { createBrowser } from './collectors/generic.js';
import { collectNagumo } from './collectors/nagumo.js';
import { collectCoop } from './collectors/coop.js';
import { collectSonda } from './collectors/sonda.js';
import { collectJoanin } from './collectors/joanin.js';
import { collectCarrefour } from './collectors/carrefour.js';
import { collectAssai } from './collectors/assai.js';
import { collectSuperAbc } from './collectors/superabc.js';

if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const allCollectors = [
  ['nagumo', collectNagumo],
  ['coop', collectCoop],
  ['sonda', collectSonda],
  ['joanin', collectJoanin],
  ['carrefour', collectCarrefour],
  ['assai', collectAssai],
  ['superabc', collectSuperAbc]
];

async function main() {
  const cliArgs = process.argv.slice(2).map((s) => s.toLowerCase().trim()).filter(Boolean);
  const activeCollectors = cliArgs.length > 0
    ? allCollectors.filter(([name]) => cliArgs.includes(name))
    : allCollectors;

  if (activeCollectors.length === 0) {
    console.error(`Nenhum mercado válido especificado. Opções: ${allCollectors.map(([n]) => n).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const startedAt = new Date();
  const startTimeMs = Date.now();
  console.log(`================================================================`);
  console.log(`Iniciando coleta de ${activeCollectors.length} mercado(s) em ${startedAt.toISOString()}`);
  console.log(`Mercados ativos: ${activeCollectors.map(([name]) => name).join(', ')}`);
  console.log(`Concorrência HTTP: ${config.httpConcurrency} | Concorrência Browser: ${config.browserConcurrency} | Tamanho do Lote: ${config.batchSize}`);
  console.log(`================================================================`);

  await ensureDatabase();

  let browser = null;
  const requiresBrowser = activeCollectors.some(([name]) => !['coop', 'nagumo'].includes(name)) || !config.useApiCollectors;
  if (requiresBrowser) {
    browser = await createBrowser();
  }

  try {
    const results = await Promise.all(activeCollectors.map(async ([source, collect]) => {
      const sourceStart = Date.now();
      const saver = new BatchSaver({ batchSize: config.batchSize });

      try {
        const products = await collect({
          browser,
          onProduct: async (product) => {
            await saver.add({ ...product, collected_at: startedAt });
          }
        });

        await saver.flush();

        const durationSec = ((Date.now() - sourceStart) / 1000).toFixed(1);
        const stats = products.stats ?? {};
        const status = stats.failedPages > 0
          ? (products.length > 0 ? 'partial' : 'blocked_or_unavailable')
          : 'ok';

        console.log(`[${source}] CONCLUÍDO: ${saver.savedCount} produtos gravados em ${durationSec}s; ${stats.pagesProcessed ?? 0} págs; ${stats.failedPages ?? 0} falhas; status=${status}.`);
        return {
          source,
          status,
          found: products.length,
          saved: saver.savedCount,
          durationSec: Number(durationSec),
          mode: stats.mode ?? 'browser',
          pages: stats.pagesProcessed ?? 0,
          failed: stats.failedPages ?? 0
        };
      } catch (error) {
        await saver.flush().catch(() => {});
        const durationSec = ((Date.now() - sourceStart) / 1000).toFixed(1);
        console.warn(`[${source}] coleta interrompida após ${durationSec}s: ${error.message}`);
        return {
          source,
          status: 'error',
          found: 0,
          saved: saver.savedCount,
          durationSec: Number(durationSec),
          error: error.message
        };
      }
    }));

    console.log('\n--- RESUMO DA EXECUÇÃO ---');
    console.table(results);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    await pool.end().catch(() => {});
  }

  const totalDuration = ((Date.now() - startTimeMs) / 1000).toFixed(1);
  console.log(`================================================================`);
  console.log(`Coleta completa finalizada em ${new Date().toISOString()} (Tempo total: ${totalDuration}s)`);
  console.log(`================================================================`);
}

main().catch((error) => {
  console.error('Erro fatal:', error);
  process.exitCode = 1;
});

