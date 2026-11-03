export const cleanQuery = value => String(value || '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
export const searchPath = (language, query) => `${language === 'ar' ? '/ar' : ''}/search/?s=${encodeURIComponent(cleanQuery(query))}`;
const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, '').toLocaleLowerCase().replace(/[أإآ]/g, 'ا');
export function searchPages(index, value, language, requestedPage = 1) {
  const query = cleanQuery(value), tokens = normalize(query).split(' ').filter(Boolean);
  const results = tokens.length ? index.filter(p => p.language === language).map(p => {
    const title = normalize(p.title), text = normalize(p.text);
    return { ...p, score: tokens.reduce((score, token) => score + (title.includes(token) ? 10 : 0), 0), matches: tokens.every(token => title.includes(token) || text.includes(token)) };
  }).filter(p => p.matches).sort((a,b) => b.score - a.score) : [];
  const total = results.length, pageSize = 10, pageCount = Math.max(1, Math.ceil(total / pageSize));
  const numeric = Number(requestedPage), page = Math.min(pageCount, Math.max(1, Number.isSafeInteger(numeric) ? numeric : 1));
  return { query, total, page, pageCount, results: results.slice((page - 1) * pageSize, page * pageSize) };
}
