import mysql from 'mysql2/promise';
import { config } from '../config.js';

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  namedPlaceholders: true,
  charset: 'utf8mb4'
});

export async function ensureDatabase() {
  const connection = await pool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS products (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        source VARCHAR(30) NOT NULL,
        external_id VARCHAR(255) NULL,
        name VARCHAR(500) NOT NULL,
        brand VARCHAR(255) NULL,
        category VARCHAR(255) NULL,
        sku VARCHAR(255) NULL,
        price DECIMAL(12,2) NULL,
        promotional_price DECIMAL(12,2) NULL,
        unit VARCHAR(100) NULL,
        available TINYINT(1) NOT NULL DEFAULT 1,
        image_url TEXT NULL,
        product_url TEXT NOT NULL,
        raw_data JSON NULL,
        collected_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_source_product_url (source, product_url(255)),
        KEY idx_source_category (source, category),
        KEY idx_collected_at (collected_at),
        KEY idx_external_id (source, external_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS price_history (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        product_id BIGINT UNSIGNED NOT NULL,
        price DECIMAL(12,2) NULL,
        promotional_price DECIMAL(12,2) NULL,
        available TINYINT(1) NOT NULL,
        collected_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        KEY idx_price_product_date (product_id, collected_at),
        CONSTRAINT fk_price_history_product
          FOREIGN KEY (product_id) REFERENCES products(id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  } finally {
    connection.release();
  }
}

export async function upsertProduct(product) {
  const [savedCount] = await bulkUpsertProducts([product]);
  return savedCount;
}

export async function bulkUpsertProducts(products) {
  if (!Array.isArray(products) || products.length === 0) return 0;

  const map = new Map();
  for (const p of products) {
    if (!p || !p.source || !p.product_url) continue;
    const key = `${p.source}|${p.product_url}`;
    map.set(key, p);
  }
  const uniqueProducts = [...map.values()];
  if (uniqueProducts.length === 0) return 0;

  const placeholders = [];
  const values = [];

  for (const p of uniqueProducts) {
    placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    values.push(
      p.source,
      p.external_id ?? null,
      p.name,
      p.brand ?? null,
      p.category ?? null,
      p.sku ?? null,
      p.price ?? null,
      p.promotional_price ?? null,
      p.unit ?? null,
      p.available ? 1 : 0,
      p.image_url ?? null,
      p.product_url,
      JSON.stringify(p.raw_data ?? {}),
      p.collected_at ?? new Date()
    );
  }

  const sql = `
    INSERT INTO products
      (source, external_id, name, brand, category, sku, price,
       promotional_price, unit, available, image_url, product_url,
       raw_data, collected_at)
    VALUES
      ${placeholders.join(', ')}
    ON DUPLICATE KEY UPDATE
      external_id = VALUES(external_id),
      name = VALUES(name),
      brand = VALUES(brand),
      category = VALUES(category),
      sku = VALUES(sku),
      price = VALUES(price),
      promotional_price = VALUES(promotional_price),
      unit = VALUES(unit),
      available = VALUES(available),
      image_url = VALUES(image_url),
      raw_data = VALUES(raw_data),
      collected_at = VALUES(collected_at);
  `;

  await pool.query(sql, values);

  if (config.savePriceHistory) {
    try {
      const source = uniqueProducts[0].source;
      const urls = uniqueProducts.map((p) => p.product_url);
      const historySql = `
        INSERT INTO price_history (product_id, price, promotional_price, available, collected_at)
        SELECT p.id, p.price, p.promotional_price, p.available, p.collected_at
        FROM products p
        WHERE p.source = ? AND p.product_url IN (?)
      `;
      await pool.query(historySql, [source, urls]);
    } catch (err) {
      console.warn(`[db] aviso ao gravar histórico de preços: ${err.message}`);
    }
  }

  return uniqueProducts.length;
}

export class BatchSaver {
  constructor({ batchSize = config.batchSize, onFlush = null } = {}) {
    this.batchSize = batchSize;
    this.buffer = [];
    this.savedCount = 0;
    this.onFlush = onFlush;
  }

  async add(product) {
    if (!product) return;
    this.buffer.push(product);
    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  async flush() {
    if (this.buffer.length === 0) return 0;
    const items = this.buffer;
    this.buffer = [];
    try {
      const count = await bulkUpsertProducts(items);
      this.savedCount += count;
      if (this.onFlush) this.onFlush(count, this.savedCount);
      return count;
    } catch (error) {
      console.error(`[db] erro ao gravar lote de ${items.length} produtos:`, error.message);
      let fallbackCount = 0;
      for (const item of items) {
        try {
          await upsertProduct(item);
          fallbackCount++;
        } catch {}
      }
      this.savedCount += fallbackCount;
      return fallbackCount;
    }
  }
}

