'use strict';
const APP_VERSION = 3;
const KEY = 'dramtrack.browser.v1';
const L = window.DramLogic;
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let state = { version: 1, library: [], rankings: [], ignored: [], currency: 'USD' };
let duel = null, fileMode = '', storageBlocked = false;
let rates = { USD: 1 }, ratesLoaded = false;
function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
function validate(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.library) || !Array.isArray(data.rankings) || !Array.isArray(data.ignored) || !data.ignored.every(n => typeof n === 'string')) throw Error('Unsupported or invalid backup.');
  return { version: 1, source: data.source?.id === 'reddit-whisky-network' && Number.isFinite(data.source.fetchedAt) ? data.source : null, library: L.library(data.library), rankings: L.rankings(data.rankings), ignored: [...new Set(data.ignored)], currency: ['USD', 'INR', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'].includes(data.currency) ? data.currency : 'USD' };
}
try { const saved = localStorage.getItem(KEY); if (saved !== null) state = validate(JSON.parse(saved)); }
catch { storageBlocked = true; notice('Saved data could not be read. It has not been overwritten. Restore a valid backup to continue.'); }
function save(next, restore = false) {
  if (storageBlocked && !restore) { notice('Saved data is unavailable. Restore a backup before making changes.'); return false; }
  try { localStorage.setItem(KEY, JSON.stringify(next)); state = next; storageBlocked = false; return true; }
  catch { notice('This browser could not save the change. Free storage or allow site storage, then try again.'); return false; }
}
function price(value) {
  if (!value) return '\u2014';
  const curr = rates[state.currency] ? state.currency : 'USD';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: curr }).format(value * (rates[curr] || 1));
}
function bottle(name) { return state.library.find(r => L.norm(r.Name) === L.norm(name)); }
function render() {
  $('setup').hidden = !!state.library.length;
  $('add-panel').hidden = !state.library.length || !!duel;
  $('library-count').textContent = `${state.library.length.toLocaleString()} bottles`;
  $('collection-count').textContent = `(${state.rankings.length})`;
  $('currency').value = state.currency;
  $('rates-status').textContent = state.currency === 'USD' ? 'Library prices are in USD.' : rates[state.currency] ? 'Prices use the latest exchange rates fetched for this session.' : 'Exchange rates unavailable. Prices are shown in USD.';
  $('collection').innerHTML = state.rankings.length ? `<div class="table-wrap"><table><thead><tr><th>RANK</th><th>BOTTLE</th><th>INTERNAL SCORE</th><th>PRICE</th><th>VALUE</th><th></th></tr></thead><tbody>${state.rankings.map((r, i) => {
    const b = bottle(r.Name);
    return `<tr><td class="rank">${i + 1}</td><td><button class="name-button" data-detail-rank="${i}">${escapeHtml(r.Name)}</button><div class="subtle">${escapeHtml(b?.Distillery || '')}</div></td><td>${r.Internal_Score.toFixed(2)}</td><td>${b ? price(b.Price) : '—'}</td><td>${b ? (b.Value ? b.Value.toFixed(2) : '\u2014') : '—'}</td><td><button data-remove="${i}" aria-label="Remove ${escapeHtml(r.Name)}" ${duel ? 'disabled' : ''}>Remove</button></td></tr>`;
  }).join('')}</tbody></table></div>` : '<div class="empty">Your shelf starts with one bottle.<br>Search above for a whiskey you’ve tried.</div>';
  const recs = L.recommendations(state.library, state.rankings, state.ignored);
  $('recommendation-section').hidden = !state.rankings.length || !recs.length || !!duel;
  $('recommendations').innerHTML = recs.map(r => {
    const i = state.library.indexOf(r);
    return `<article class="bottle-card"><div class="bottle-art" aria-hidden="true">🥃</div><button class="name-button" data-detail="${i}">${escapeHtml(r.Name)}</button><p class="subtle">Rating ${r.Rating.toFixed(2)} · ${escapeHtml(price(r.Price))}</p><div class="actions"><button class="primary" data-try="${i}">Tried it</button><button data-ignore="${i}" aria-label="Ignore ${escapeHtml(r.Name)}">✕</button></div></article>`;
  }).join('');
  $('ignored').innerHTML = state.ignored.length ? state.ignored.map((name, i) => `<div><span>${escapeHtml(name)}</span><button data-unignore="${i}">Restore</button></div>`).join('') : '<p>No ignored bottles.</p>';
  renderSearch(); renderDuel();
}
function renderSearch() {
  const query = L.norm($('search').value);
  const own = new Set(state.rankings.map(r => L.norm(r.Name)));
  const matches = query ? state.library.filter(r => L.norm(r.Name).includes(query) && !own.has(L.norm(r.Name))).slice(0, 20) : [];
  $('search-results').innerHTML = matches.map(r => `<button data-try="${state.library.indexOf(r)}">${escapeHtml(r.Name)} <span class="subtle">· ${escapeHtml(r.Distillery)}</span></button>`).join('') || (query ? '<p>No unranked bottles match your search.</p>' : '');
}
function startDuel(name) {
  if (duel || state.rankings.some(r => L.norm(r.Name) === L.norm(name))) return;
  if (storageBlocked) { notice('Restore a valid backup before ranking bottles.'); return; }
  duel = { name, low: 0, high: state.rankings.length - 1 };
  if (!state.rankings.length) finishDuel();
  else { render(); $('duel').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}
function finishDuel() {
  const rows = state.rankings.slice(); rows.splice(duel.low, 0, { Name: duel.name });
  if (save({ ...state, rankings: L.score(rows, state.library) })) {
    notice(`${duel.name} added at #${duel.low + 1}.`); duel = null; $('search').value = '';
  }
  render();
}
function renderDuel() {
  $('duel').hidden = !duel;
  if (!duel) return;
  if (duel.low > duel.high) {
    $('duel').innerHTML = '<h2>Ready to save your ranking</h2><button id="retry-save" class="primary">Retry save</button> <button id="cancel-duel">Cancel</button>'; return;
  }
  const other = state.rankings[Math.floor((duel.low + duel.high) / 2)].Name;
  $('duel').innerHTML = `<p class="eyebrow">TRUST YOUR TASTE</p><h2>Which do you prefer?</h2><div class="duel-cards"><button data-choice="new">${escapeHtml(duel.name)}<span>I prefer this one</span></button><button data-choice="old">${escapeHtml(other)}<span>I prefer this one</span></button></div><p><button id="cancel-duel">Cancel ranking</button></p>`;
}
function detail(name) {
  const b = bottle(name);
  $('detail-content').innerHTML = `<div class="bottle-art" aria-hidden="true">🥃</div><h2>${escapeHtml(name)}</h2>${b ? `<p>${escapeHtml(b.Distillery)}</p><p>Library rating: ${b.Rating.toFixed(2)} · ${b.Count} reviews</p><p>${escapeHtml(price(b.Price))} · Value ${(b.Value ? b.Value.toFixed(2) : '\u2014')}</p>` : '<p>This bottle is not in the current library.</p>'}<h3>Community tasting notes</h3><p>No community notes available yet.</p>`;
  $('detail').showModal();
}
function download(name, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function pick(mode) {
  if (duel) { notice('Finish or cancel your current duel before importing data.'); return; }
  fileMode = mode; $('file').accept = mode === 'restore' ? '.json,application/json' : '.csv,text/csv'; $('file').value = ''; $('file').click();
}
$('file').addEventListener('change', async () => {
  const file = $('file').files[0]; if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw Error('Please use a file smaller than 20 MB.');
    const text = await file.text(); let next = { ...state };
    if (fileMode === 'restore') next = validate(JSON.parse(text));
    else {
      const rows = L.csv(text);
      if (fileMode === 'library') { next.library = L.library(rows); if (!next.library.length) throw Error('No bottles found.'); }
      else if (fileMode === 'rankings') next.rankings = L.rankings(rows);
      else { if (rows.some(r => !('Name' in r))) throw Error('Ignored CSV needs a Name column.'); next.ignored = [...new Set(rows.map(r => String(r.Name).trim()).filter(Boolean))]; }
    }
    const replacing = fileMode === 'restore' || (fileMode === 'library' ? state.library.length : fileMode === 'rankings' ? state.rankings.length : state.ignored.length);
    if (replacing && !confirm(`Replace ${fileMode === 'restore' ? 'all browser data' : `your current ${fileMode}`} with this file? Download a backup first if you need to keep it.`)) return;
    if (save(next, fileMode === 'restore')) { notice(`Imported ${file.name}.`); render(); loadRates(); }
  } catch (error) { notice(`Import failed: ${error.message}`); }
});
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  const d = button.dataset;
  if (d.close) $(d.close).close();
  else if (d.try !== undefined) startDuel(state.library[Number(d.try)].Name);
  else if (d.detail !== undefined) detail(state.library[Number(d.detail)].Name);
  else if (d.detailRank !== undefined) detail(state.rankings[Number(d.detailRank)].Name);
  else if (d.choice && duel) { duel = L.choose(duel, d.choice === 'new'); if (duel.low > duel.high) finishDuel(); else renderDuel(); }
  else if (button.id === 'retry-save') finishDuel();
  else if (button.id === 'cancel-duel') { duel = null; render(); }
  else if (d.remove !== undefined && !duel) {
    const i = Number(d.remove);
    if (confirm(`Remove ${state.rankings[i].Name} from your collection?`)) {
      const remaining = state.rankings.filter((_, j) => j !== i);
      const rankings = state.library.length ? L.score(remaining, state.library) : remaining.map((r, j) => ({ ...r, Rank: j + 1 }));
      if (save({ ...state, rankings })) render();
    }
  } else if (d.ignore !== undefined) { if (save({ ...state, ignored: [...new Set([...state.ignored, state.library[Number(d.ignore)].Name])] })) render(); }
  else if (d.unignore !== undefined) { if (save({ ...state, ignored: state.ignored.filter((_, i) => i !== Number(d.unignore)) })) render(); }
});
$('settings-button').onclick = () => $('settings').showModal();
$('search').oninput = renderSearch;
for (const id of ['setup-import', 'refresh-library']) $(id).onclick = () => loadArchive(true);
$('import-rankings').onclick = () => pick('rankings');
$('import-ignored').onclick = () => pick('ignored');
$('restore').onclick = () => pick('restore');
$('backup').onclick = () => {
  if (storageBlocked) { notice('Saved data could not be read; exporting an empty backup is disabled.'); return; }
  download(`dramtrack-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), 'application/json');
};
$('export-rankings').onclick = () => {
  const field = value => `"${String(value).replace(/"/g, '""')}"`;
  download('dramtrack-rankings.csv', 'Name,Rank,Internal_Score\r\n' + state.rankings.map(r => [r.Name, r.Rank, r.Internal_Score].map(field).join(',')).join('\r\n'), 'text/csv');
};
$('currency').onchange = () => { if (save({ ...state, currency: $('currency').value })) { render(); loadRates(); } };
async function loadRates() {
  if (state.currency === 'USD' || ratesLoaded) return;
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw Error('Rates unavailable');
    const data = await response.json();
    if (!data.rates || data.rates.USD !== 1) throw Error('Invalid rates');
    rates = Object.fromEntries(Object.entries(data.rates).filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value > 0));
    ratesLoaded = true;
  } catch { /* Keep USD prices explicitly labelled when rates are unavailable. */ }
  render();
}
window.addEventListener('storage', event => {
  if (event.key !== KEY) return;
  try { if (!event.newValue) throw Error('Removed'); state = validate(JSON.parse(event.newValue)); duel = null; render(); notice('Updated from another tab. Any unfinished duel was cancelled.'); }
  catch { storageBlocked = true; notice('Saved data changed in another tab and could not be read. Reload or restore a backup.'); }
});
render(); loadRates();

let archiveBusy = false;
function archiveStatus(message) { $('archive-status').textContent = message; }
function loadArchive(force = false) {
  if (archiveBusy || storageBlocked) return;
  if (!force && state.source?.id === 'reddit-whisky-network' && state.library.length && Date.now() - state.source.fetchedAt < 86400000) {
    archiveStatus(`Reddit Whisky Network Review Archive - ${state.library.length.toLocaleString()} bottles - Updated ${new Date(state.source.fetchedAt).toLocaleString()}`); return;
  }
  if (duel) { notice('Finish or cancel your duel before refreshing the archive.'); return; }
  archiveBusy = true;
  archiveStatus('Loading Reddit Whisky Network Review Archive...');
  $('refresh-library').disabled = true; $('setup-import').disabled = true;
  const worker = new Worker('archive.js?v=3');
  const done = () => { archiveBusy = false; worker.terminate(); $('refresh-library').disabled = false; $('setup-import').disabled = false; };
  const fail = message => { done(); archiveStatus(`Archive unavailable: ${message}. ${state.library.length ? 'Your saved library is still available.' : 'Use Retry archive to try again.'}`); };
  worker.onerror = () => fail('Could not load archive worker');
  worker.onmessage = ({ data }) => {
    if (data.error) { fail(data.error); return; }
    // Use the current state, so personal changes made while downloading are preserved.
    if (duel) { done(); archiveStatus('Archive refresh deferred until your duel is finished. Use Refresh archive afterward.'); return; }
    const saved = save({ ...state, library: data.library, source: data.source });
    done();
    if (saved) { render(); archiveStatus(`Reddit Whisky Network Review Archive - ${data.library.length.toLocaleString()} bottles - ${data.source.validReviews.toLocaleString()} rated reviews - Updated ${new Date(data.source.fetchedAt).toLocaleString()}`); }
    else archiveStatus('Archive downloaded but could not be saved. Your existing library is unchanged.');
  };
  worker.postMessage({});
}
loadArchive();
