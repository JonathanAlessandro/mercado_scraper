import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeUrl, isProductLikeUrl, parseBrazilianMoney } from '../src/utils/normalize.js';

test('interpreta preços brasileiros com milhar e vírgula decimal', () => {
  assert.equal(parseBrazilianMoney('R$ 1.234,56'), 1234.56);
  assert.equal(parseBrazilianMoney('Por: R$ 22,90'), 22.9);
  assert.equal(parseBrazilianMoney(8.45), 8.45);
});

test('remove rastreadores sem apagar parâmetros de catálogo', () => {
  assert.equal(
    canonicalizeUrl('https://www.nagumo.com.br/busca?cgid=ofertas-dia&utm_source=test#top', 'https://www.nagumo.com.br'),
    'https://www.nagumo.com.br/busca?cgid=ofertas-dia'
  );
});

test('reconhece os padrões atuais de produtos e rejeita áreas proibidas', () => {
  const baseUrl = 'https://www.coopsupermercado.com.br';
  const options = { baseUrl, productUrlPattern: /\/p\/?$/i };
  assert.equal(isProductLikeUrl(`${baseUrl}/acucar-cristal-1kg/p`, options), true);
  assert.equal(isProductLikeUrl(`${baseUrl}/account#/orders`, options), false);
  assert.equal(isProductLikeUrl('https://outro.example/produto/p', options), false);
});
