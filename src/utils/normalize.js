export function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text || null;
}

export function absoluteUrl(value, baseUrl) {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}

export function parseBrazilianMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const text = String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/R\$|BRL/gi, '')
    .replace(/por\s*:/gi, '')
    .trim();

  const match = text.match(/-?\d[\d.]*,\d{2}|-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const normalized = match[0].includes(',')
    ? match[0].replace(/\./g, '').replace(',', '.')
    : match[0];
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function firstNonEmpty(...values) {
  return values.find((value) => cleanText(value)) ?? null;
}

export function isProductLikeUrl(url) {
  if (!url) return false;
  const pathname = new URL(url).pathname.toLowerCase();
  return !/(login|account|checkout|cart|politica|termos|fale-conosco|blog|receitas)/.test(pathname);
}
