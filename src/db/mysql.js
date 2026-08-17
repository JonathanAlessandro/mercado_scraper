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
  const sql = `
    INSERT INTO products
      (source, external_id, name, brand, category, sku, price,
       promotional_price, unit, available, image_url, product_url,
       raw_data, collected_at)
    VALUES
      (:source, :external_id, :name, :brand, :category, :sku, :price,
       :promotional_price, :unit, :available, :image_url, :product_url,
       :raw_data, :collected_at)
    ON DUPLICATE KEY UPDATE
      id = LAST_INSERT_ID(id),
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

  const collectedAt = product.collected_at ?? new Date();
  const [result] = await pool.execute(sql, {
    ...product,
    raw_data: JSON.stringify(product.raw_data ?? {}),
    collected_at: collectedAt
  });

  if (config.savePriceHistory) {
    await pool.execute(`
      INSERT INTO price_history
        (product_id, price, promotional_price, available, collected_at)
      VALUES (?, ?, ?, ?, ?)
    `, [result.insertId, product.price ?? null, product.promotional_price ?? null, product.available ? 1 : 0, collectedAt]);
  }

  return result.insertId;
}
