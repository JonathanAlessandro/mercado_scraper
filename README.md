# mercado_scraper

Coletor de produtos atuais de catálogos públicos de supermercados brasileiros, implementado em Node.js, Playwright e MySQL. A versão atual cobre sete fontes configuráveis: **Nagumo, Coop, Sonda, Joanin, Carrefour, Assaí e Super ABC**.

> O coletor registra o que a fonte pública exibiu na execução. Ele não garante estoque físico em todas as lojas, não acessa contas/carrinho/checkout e não contorna captcha, Cloudflare, Incapsula ou bloqueios de CDN.

## O que foi atualizado

O crawler deixou de depender apenas da homepage. Cada mercado agora possui seeds de ofertas, categorias ou compra online, além de padrões específicos de URL e seletores apropriados para a tecnologia observada. A Coop usa seeds de ofertas e categorias VTEX, o Nagumo prioriza a busca de ofertas do dia, a Sonda usa as categorias públicas `/delivery/categoria/...` e o Super ABC reconhece cards Angular/Regex Solutions.

A extração combina JSON-LD, cards renderizados e dados de preço em classes/atributos. Ela diferencia preço normal de preço promocional, remove parâmetros de rastreamento, deduplica URLs e conserva o registro mais completo. O crawler também enumera sitemaps públicos quando a fonte os declara, respeita limite de páginas e usa concorrência conservadora.

As falhas de acesso são visíveis no resumo final. O campo `status` pode ser `ok`, `partial` ou `blocked_or_unavailable`; uma fonte bloqueada não faz o coletor marcar automaticamente todos os produtos antigos como indisponíveis.

## Mercados e seeds

| Fonte | Entrada pública usada pela versão atual | Observação operacional |
| --- | --- | --- |
| Nagumo | `/busca?cgid=ofertas-dia`, `/busca?cgid=SEMANAL`, `/busca?cgid=MP-GERAL` e departamentos | Site público com cards `.productCard`; ofertas exibem preço normal e `Por:`. |
| Coop | `/yes?map=promotion`, homepage, categorias e `sitemap.xml` | Catálogo VTEX; os preços podem aparecer alguns segundos após o HTML inicial. |
| Sonda | `/delivery/categoria/Mercearia-l`, `Bebidas2`, `Carnes,_Aves_e_Peixes`, `Hortifruti`, `Saudaveis`, `Vegano` e `Integrais` | A fonte pode retornar captcha/403; o patch registra a limitação. |
| Joanin | `https://joaninonline.com.br/p` | A URL é configurável e pode estar bloqueada por CDN ou indisponível publicamente. |
| Carrefour | `https://mercado.carrefour.com.br/` | Não contorna a verificação anti-bot; uma execução bloqueada é reportada. |
| Assaí | `https://www.assai.com.br/` como fallback configurável | O domínio institucional pode não expor catálogo público navegável. |
| Super ABC | `https://superabconline.com.br/` | Catálogo renderizado; produtos dependem da loja selecionada e do acesso permitido pela CDN. |

## Dados armazenados

| Campo | Descrição |
| --- | --- |
| `source` | Mercado de origem. |
| `name` | Nome do produto. |
| `brand` | Marca, quando identificada. |
| `category` | Categoria, quando identificada. |
| `sku` / `external_id` | Identificador exposto pela fonte. |
| `price` | Preço normal ou preço vigente quando a fonte não exibe preço de tabela. |
| `promotional_price` | Preço promocional, quando a fonte mostra os dois valores. |
| `unit` | Unidade, peso, volume ou preço por medida quando exibido. |
| `available` | Disponibilidade observada no card/página, não garantia de estoque físico. |
| `image_url` | Imagem principal quando exposta. |
| `product_url` | URL canônica ou URL pública do card. |
| `raw_data` | Dados brutos da extração, incluindo origem `json-ld` ou `card`. |
| `collected_at` | Momento da coleta, usado para representar os produtos observados hoje. |

## Requisitos e instalação

É necessário usar Node.js 20 ou superior, MySQL 8 ou compatível e uma conexão à internet. Instale as dependências e o navegador do Playwright:

```bash
npm ci
npm run install-browsers
cp .env.example .env
```

Depois, edite `.env` com as credenciais do banco:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=mercado_scraper
DB_USER=root
DB_PASSWORD=minha_senha
DB_CONNECTION_LIMIT=5
HEADLESS=true
REQUEST_DELAY_MS=1500
PAGE_SETTLE_MS=1800
NAVIGATION_TIMEOUT_MS=45000
MAX_CONCURRENCY=1
MAX_PAGES_PER_SOURCE=600
MAX_SITEMAP_URLS=1000
SAVE_PRICE_HISTORY=true
```

As URLs de cada fonte também podem ser sobrescritas no `.env`: `NAGUMO_BASE_URL`, `COOP_BASE_URL`, `SONDA_BASE_URL`, `JOANIN_BASE_URL`, `CARREFOUR_BASE_URL`, `ASSAI_BASE_URL` e `SUPERABC_BASE_URL`. Para fontes com renderização mais lenta, existem `COOP_PAGE_SETTLE_MS`, `SONDA_PAGE_SETTLE_MS` e `SUPERABC_PAGE_SETTLE_MS`.

O banco pode ser criado manualmente com `mysql -u root -p < sql/schema.sql`; a aplicação também cria as tabelas necessárias na inicialização. A chave única continua sendo `(source, product_url(255))`, de modo que execuções repetidas atualizam o registro atual sem duplicá-lo e adicionam histórico de preço quando `SAVE_PRICE_HISTORY=true`.

## Execução e validação

Execute a coleta completa com:

```bash
npm start
```

O resumo exibirá, por fonte, a quantidade encontrada, a quantidade gravada, páginas processadas, falhas e status. Para validar a lógica sem conectar ao banco, use os testes unitários:

```bash
npm test
```

Para uma verificação leve das fontes Nagumo e Coop antes da coleta completa, pode-se usar o smoke test incluído:

```bash
MAX_PAGES_PER_SOURCE=1 MAX_SITEMAP_URLS=0 node tools/smoke_sources.js
```

Se uma fonte apresentar captcha ou bloqueio, não tente contorná-lo. Verifique o site manualmente, confirme os termos de uso e, se necessário, ajuste apenas uma URL pública ou um seletor documentado. A coleta deve ser feita com baixa concorrência e intervalo entre requisições, respeitando as políticas da fonte.

## Consulta de produtos observados hoje

```sql
SELECT source, name, brand, category, price, promotional_price,
       available, collected_at
FROM products
WHERE collected_at >= CURRENT_DATE()
ORDER BY source, name;
```

Para consultar somente as execuções recentes por mercado:

```sql
SELECT source,
       COUNT(*) AS products_seen,
       MAX(collected_at) AS last_collected_at
FROM products
GROUP BY source
ORDER BY source;
```

## Arquivos principais

| Arquivo | Responsabilidade |
| --- | --- |
| `src/config.js` | URLs, seeds, seletores, padrões e limites por fonte. |
| `src/collectors/generic.js` | Playwright, sitemap, descoberta, extração, normalização e retry. |
| `src/collectors/*.js` | Wrappers públicos de cada mercado. |
| `src/utils/normalize.js` | Dinheiro, URLs canônicas e filtro de catálogo. |
| `src/db/mysql.js` | Upsert de produtos e histórico de preços. |
| `test/normalize.test.js` | Testes de moeda, URL e padrões de produto. |

## Referências públicas consultadas

[1]: https://www.nagumo.com.br/ "Supermercados Nagumo"
[2]: https://www.coopsupermercado.com.br/ "Coop Supermercado Online"
[3]: https://www.coopsupermercado.com.br/sitemap.xml "Sitemap público da Coop"
[4]: https://www.sondadelivery.com.br/ "Sonda Delivery"
[5]: https://www.joanin.com.br/comprar-online.php "Compra online do Joanin"
[6]: https://mercado.carrefour.com.br/ "Mercado Carrefour"
[7]: https://www.assai.com.br/ "Assaí Atacadista"
[8]: https://superabconline.com.br/ "Super ABC Loja Online"
