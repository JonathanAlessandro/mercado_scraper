export function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text || null;
}

export function absoluteUrl(value, baseUrl) {
  if (!value) return null;
  try {
    const url = new URL(String(value), baseUrl);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function canonicalizeUrl(value, baseUrl) {
  const resolved = absoluteUrl(value, baseUrl);
  if (!resolved) return null;
  const url = new URL(resolved);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|gclid$|fbclid$|srsltid$|ref$|source$)/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  return url.href.replace(/\/$/, '') || url.origin;
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

function testPattern(pattern, value) {
  if (!(pattern instanceof RegExp)) return false;
  pattern.lastIndex = 0;
  const matched = pattern.test(value);
  pattern.lastIndex = 0;
  return matched;
}

export function isProductLikeUrl(url, {
  baseUrl,
  productUrlPattern,
  catalogPathPatterns = []
} = {}) {
  if (!url) return false;
  try {
    const current = new URL(url, baseUrl);
    const base = baseUrl ? new URL(baseUrl) : null;
    if (base && current.hostname !== base.hostname) return false;
    const pathname = current.pathname.toLowerCase();
    if (/\/(?:login|account|checkout|cart|quick-view|espiar|buscapagina)(?:\/|$)/i.test(pathname)) return false;
    if (/(?:politica|termos|fale-conosco|blog|receitas|institucional|trabalhe-conosco|nossas-lojas)/i.test(pathname)) return false;
    if (testPattern(productUrlPattern, `${current.pathname}${current.search}`)) return true;
    if (catalogPathPatterns.some((pattern) => testPattern(pattern, pathname))) return true;
    return /\/(?:produto|product|products|p)(?:\/|$)/i.test(pathname)
      || /(?:[?&](?:cgid|map|page|pageindex)=)/i.test(current.search);
  } catch {
    return false;
  }
}
