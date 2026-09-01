import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVtexProduct } from '../src/collectors/vtex.js';

test('parseVtexProduct extrai preços normais, promocionais e metadados corretamente', () => {
  const sampleVtexItem = {
    productId: '40906114',
    productName: 'Ovo Branco Grande Com 20 Unidades',
    brand: 'Coop',
    categories: ['/Hortifruti/Ovos/Ovo Branco/'],
    link: 'https://www.coopsupermercado.com.br/ovo-branco-grande-coop-20-unidades/p',
    items: [
      {
        itemId: '123456',
        ean: '7891234567890',
        measurementUnit: 'un',
        unitMultiplier: 1,
        images: [{ imageUrl: 'https://coopsp.vteximg.com.br/img.jpg' }],
        sellers: [
          {
            sellerId: 'COOPSPID',
            commertialOffer: {
              ListPrice: 15.99,
              Price: 13.99,
              AvailableQuantity: 50
            }
          }
        ]
      }
    ]
  };

  const parsed = parseVtexProduct(sampleVtexItem, 'https://www.coopsupermercado.com.br', 'coop');
  assert.equal(parsed.source, 'coop');
  assert.equal(parsed.name, 'Ovo Branco Grande Com 20 Unidades');
  assert.equal(parsed.brand, 'Coop');
  assert.equal(parsed.price, 15.99);
  assert.equal(parsed.promotional_price, 13.99);
  assert.equal(parsed.available, true);
  assert.equal(parsed.sku, '123456');
  assert.equal(parsed.category, 'Hortifruti > Ovos > Ovo Branco');
  assert.equal(parsed.product_url, 'https://www.coopsupermercado.com.br/ovo-branco-grande-coop-20-unidades/p');
});

test('parseVtexProduct lida com itens sem desconto e sem estoque', () => {
  const sampleOutOfStock = {
    productId: '9999',
    productName: 'Leite Integral 1L',
    brand: 'Italac',
    link: 'https://www.coopsupermercado.com.br/leite/p',
    items: [
      {
        itemId: '555',
        sellers: [
          {
            commertialOffer: {
              ListPrice: 4.5,
              Price: 4.5,
              AvailableQuantity: 0
            }
          }
        ]
      }
    ]
  };

  const parsed = parseVtexProduct(sampleOutOfStock, 'https://www.coopsupermercado.com.br', 'coop');
  assert.equal(parsed.price, 4.5);
  assert.equal(parsed.promotional_price, null);
  assert.equal(parsed.available, false);
});
