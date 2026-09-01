import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNagumoProductJsonLd } from '../src/collectors/nagumo_http.js';

test('parseNagumoProductJsonLd extrai produto estruturado do Nagumo', () => {
  const sampleJsonLd = {
    '@context': 'http://schema.org/',
    '@type': 'Product',
    name: 'Queijo Mussarela Fatiado',
    mpn: '231439',
    sku: '231439',
    brand: {
      '@type': 'Thing',
      name: 'FRIOS'
    },
    image: ['https://www.nagumo.com.br/img/231439.webp'],
    offers: {
      '@type': 'Offer',
      priceCurrency: 'BRL',
      price: '59.90',
      highPrice: '69.90',
      availability: 'http://schema.org/InStock'
    }
  };

  const pageUrl = 'https://www.nagumo.com.br/categoria/departamentos/frios-e-laticinios/laticinios/queijos/queijo-mussarela-fatiado-231439.html';
  const parsed = parseNagumoProductJsonLd(sampleJsonLd, pageUrl, 'https://www.nagumo.com.br', 'nagumo');

  assert.equal(parsed.source, 'nagumo');
  assert.equal(parsed.name, 'Queijo Mussarela Fatiado');
  assert.equal(parsed.sku, '231439');
  assert.equal(parsed.brand, 'FRIOS');
  assert.equal(parsed.price, 69.9);
  assert.equal(parsed.promotional_price, 59.9);
  assert.equal(parsed.available, true);
  assert.equal(parsed.product_url, pageUrl);
});
