# Coletor de produtos: Nagumo e Coop

Projeto didático em Node.js que navega pelos catálogos públicos da Nagumo e da Coop com Playwright e grava produtos em MySQL. A coleta tenta extrair dados de JSON-LD e de cards HTML, porque lojas virtuais podem renderizar parte do catálogo no navegador.

## Dados armazenados

| Campo | Descrição |
|---|---|
| `source` | Loja de origem: `nagumo` ou `coop`. |
| `name` | Nome do produto. |
| `brand` | Marca, quando identificada. |
| `category` | Categoria, quando disponível. |
| `sku` / `external_id` | Identificador encontrado no catálogo. |
| `price` | Preço normal. |
| `promotional_price` | Preço promocional, quando identificado. |
| `unit` | Unidade, peso ou volume, quando exibido. |
| `available` | Indicador de disponibilidade. |
| `image_url` | URL da imagem principal. |
| `product_url` | URL do produto. |
| `raw_data` | Dados brutos que ajudaram na extração. |
| `collected_at` | Data e hora da coleta. |

## Requisitos

É necessário ter Node.js 20 ou superior, MySQL 8 ou compatível e acesso à internet durante a coleta. O robô deve ser usado somente em páginas públicas, com baixa concorrência e intervalo entre requisições.

## Instalação

```bash
npm install
npm run install-browsers
cp .env.example .env
```

Edite `.env` com as credenciais do seu MySQL. Exemplo:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=mercado_scraper
DB_USER=root
DB_PASSWORD=minha_senha
HEADLESS=true
REQUEST_DELAY_MS=1200
MAX_CONCURRENCY=2
MAX_PAGES_PER_SOURCE=500
```

O banco e a tabela também podem ser criados manualmente:

```bash
mysql -u root -p < sql/schema.sql
```

A aplicação também cria a tabela `products` automaticamente na inicialização, mas o comando acima é útil para visualizar e apresentar o esquema no trabalho.

## Execução

```bash
npm start
```

Para depurar visualmente o navegador, use `HEADLESS=false` no `.env`.

A chave única formada por `source` e `product_url` permite executar a coleta novamente sem duplicar produtos. Cada nova execução atualiza preço, disponibilidade, imagem, dados brutos e data de coleta.

## Observações importantes

A estrutura dos sites pode mudar. Se uma loja deixar de expor os produtos em JSON-LD ou alterar as classes dos cards, os seletores no arquivo `src/collectors/generic.js` deverão ser ajustados. A Coop apresenta características de uma plataforma de comércio eletrônico com carregamento dinâmico; por isso o Playwright é usado em vez de uma requisição HTTP simples.

O coletor limita a quantidade de páginas, espera entre acessos e não tenta acessar áreas autenticadas, carrinho, checkout ou conta de usuário. Antes de uma execução real, verifique os termos de uso e o arquivo `robots.txt` dos sites.

## Consulta de exemplo

```sql
SELECT source, name, brand, category, price, promotional_price,
       available, collected_at
FROM products
ORDER BY source, name;
```
