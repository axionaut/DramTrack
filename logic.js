/* Pure ranking and CSV functions, shared by the browser and focused checks. */
(function (root) {
  'use strict';
  const norm = value => String(value ?? '').trim().toLowerCase();
  const number = value => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
  function csv(text) {
    const rows = []; let row = [], value = '', quoted = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { value += '"'; i++; }
        else if (quoted || value === '') quoted = !quoted;
        else throw Error('Invalid CSV quoting.');
      } else if (c === ',' && !quoted) { row.push(value); value = ''; }
      else if ((c === '\n' || c === '\r') && !quoted) {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(value); if (row.some(v => v.trim())) rows.push(row); row = []; value = '';
      } else value += c;
    }
    if (quoted) throw Error('The CSV has an unfinished quoted field.');
    row.push(value); if (row.some(v => v.trim())) rows.push(row);
    if (!rows.length) throw Error('The CSV is empty.');
    const headers = rows.shift().map(v => v.trim());
    return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])));
  }
  function library(rows) {
    const seen = new Set();
    const result = rows.map(r => {
      if (!('Name' in r) || !('Rating' in r)) throw Error('Library CSV needs Name and Rating columns.');
      return { Name: String(r.Name).trim(), Rating: number(r.Rating), Count: number(r.Count), Price: number(String(r.Price ?? '').replace(/[^\d.]/g, '')), Value: number(r.Value), Distillery: String(r.Distillery ?? '') };
    }).filter(r => { const key = norm(r.Name); if (!key || seen.has(key)) return false; seen.add(key); return true; });
    return result.sort((a, b) => b.Rating - a.Rating || b.Value - a.Value || b.Count - a.Count || a.Price - b.Price || a.Name.localeCompare(b.Name));
  }
  function rankings(rows) {
    const seen = new Set();
    return rows.map(r => {
      if (!('Name' in r) || !('Rank' in r)) throw Error('Rankings CSV needs Name and Rank columns.');
      if (!String(r.Name).trim() || !Number.isFinite(Number(r.Rank)) || Number(r.Rank) < 1) throw Error('Invalid ranking row.');
      if (seen.has(norm(r.Name))) throw Error('Rankings contain duplicate bottles.');
      seen.add(norm(r.Name));
      return { Name: String(r.Name).trim(), Rank: Number(r.Rank), Internal_Score: number(r.Internal_Score ?? r.My_Score) };
    }).sort((a, b) => a.Rank - b.Rank).map((r, i) => ({ ...r, Rank: i + 1 }));
  }
  function score(rows, lib) {
    const names = new Set(rows.map(r => norm(r.Name)));
    const scores = lib.filter(r => names.has(norm(r.Name))).map(r => r.Rating).sort((a, b) => b - a);
    return rows.map((r, i) => ({ Name: r.Name, Rank: i + 1, Internal_Score: scores[i] ?? 0 }));
  }
  function recommendations(lib, rows, ignored, n = 5) {
    const exclude = new Set([...rows.map(r => norm(r.Name)), ...ignored.map(norm)]);
    const candidates = lib.filter(r => !exclude.has(norm(r.Name)));
    if (!rows.length) return candidates.slice().sort((a, b) => b.Rating - a.Rating).slice(0, n);
    const top = rows[0].Internal_Score;
    const higher = candidates.filter(r => r.Rating > top).sort((a, b) => a.Rating - b.Rating || b.Value - a.Value);
    const lower = candidates.filter(r => r.Rating <= top).sort((a, b) => Math.abs(a.Rating - top) - Math.abs(b.Rating - top));
    return [...higher, ...lower].slice(0, n).sort((a, b) => b.Rating - a.Rating || b.Value - a.Value);
  }
  function choose(duel, preferNew) {
    const mid = Math.floor((duel.low + duel.high) / 2);
    return { ...duel, low: preferNew ? duel.low : mid + 1, high: preferNew ? mid - 1 : duel.high };
  }
  const api = { norm, csv, library, rankings, score, recommendations, choose };
  if (typeof module !== 'undefined') module.exports = api;
  root.DramLogic = api;
})(globalThis);
