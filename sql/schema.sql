CREATE DATABASE IF NOT EXISTS mercado_scraper
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE mercado_scraper;

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
) ENGINE=InnoDB;
