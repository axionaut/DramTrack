/* Public archive loader; runs off the UI thread. No credentials required. */
importScripts('logic.js?v=6');
const SOURCE = 'https://docs.google.com/spreadsheets/d/1X1HTxkI6SqsdpNSkSSivMzpxNT-oeTbjFFDdEkXD30o/export?format=csv&gid=695409533';
self.onmessage = async () => {
  try {
    const response = await fetch(SOURCE, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw Error(`Archive returned HTTP ${response.status}`);
    const rows = DramLogic.csv(await response.text());
    if (!rows.length || !('Whisky Name' in rows[0]) || !('Reviewer Rating' in rows[0])) throw Error('Archive columns have changed.');
    const groups = new Map(); let validReviews = 0;
    for (const row of rows) {
      const name = row['Whisky Name'].trim();
      const raw = row['Reviewer Rating'].trim();
      const rating = Number(raw);
      if (!name || !raw || !Number.isFinite(rating) || rating < 0 || rating > 100) continue;
      const key = DramLogic.norm(name);
      if (!groups.has(key)) groups.set(key, { Name: name, sum: 0, Count: 0 });
      const group = groups.get(key); group.sum += rating; group.Count++; validReviews++;
    }
    const library = DramLogic.library([...groups.values()].map(group => ({ Name: group.Name, Rating: group.sum / group.Count, Count: group.Count })));
    if (!library.length) throw Error('No valid ratings found in the archive.');
    // Archive prices have no reliable currency field; do not invent USD prices or value scores.
    self.postMessage({ library, source: { id: 'reddit-whisky-network', fetchedAt: Date.now(), rows: rows.length, validReviews } });
  } catch (error) { self.postMessage({ error: error.message || 'Archive unavailable' }); }
};
