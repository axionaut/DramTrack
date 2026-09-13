/* Bottle lookup and 30-day persistent image cache. No server or credentials. */
(() => {
  'use strict';
  const TTL = 30 * 86400000;
  const pending = new Map(), generations = new Map();
  let active = 0;
  const queue = [];
  const db = new Promise(resolve => {
    try {
      const request = indexedDB.open('dramtrack.images.v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('images');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  async function cached(key, record) {
    const database = await db; if (!database) return null;
    return new Promise(resolve => {
      try {
        const tx = database.transaction('images', record ? 'readwrite' : 'readonly');
        const store = tx.objectStore('images');
        const request = record ? store.put(record, key) : store.get(key);
        tx.oncomplete = () => resolve(record || request.result || null);
        tx.onerror = tx.onabort = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  async function limited(task) {
    if (active >= 3) await new Promise(resolve => queue.push(resolve));
    else active++;
    try { return await task(); }
    finally { if (queue.length) queue.shift()(); else active--; }
  }
  function url(name, variant = '') {
    // Keep cache version out of the bottle search terms.
    return `https://tse1.mm.bing.net/th?q=${encodeURIComponent(name.trim() + ' whiskey bottle')}&w=300&h=450&c=7&rs=1&p=0&dpr=1&pid=1.7${variant ? '&v=' + encodeURIComponent(variant) : ''}`;
  }
  function get(name, force = false) {
    const key = name.trim().toLowerCase();
    if (!force && pending.has(key)) return pending.get(key);
    const generation = (generations.get(key) || 0) + 1;
    generations.set(key, generation);
    const job = (async () => {
      const old = await cached(key);
      if (!force && old?.blob && Date.now() - old.savedAt < TTL) return { blob: old.blob };
      try {
        return await limited(async () => {
          const response = await fetch(url(name, force ? Date.now() : ''), { signal: AbortSignal.timeout(12000), cache: force ? 'reload' : 'default', credentials: 'omit' });
          if (!response.ok) throw Error('Image request failed');
          const blob = await response.blob();
          if (!blob.type.startsWith('image/') || !blob.size || blob.size > 5000000) throw Error('Invalid image response');
          const bitmap = await createImageBitmap(blob); bitmap.close();
          if (generations.get(key) === generation) await cached(key, { blob, savedAt: Date.now() });
          return { blob };
        });
      } catch {
        if (old?.blob) return { blob: old.blob, stale: true };
        return { error: true };
      }
    })();
    pending.set(key, job);
    job.finally(() => { if (pending.get(key) === job) pending.delete(key); });
    return job;
  }
  async function paint(node, force = false) {
    const token = {}; node.imageToken = token;
    node.setAttribute('aria-busy', 'true');
    const result = await get(node.dataset.bottleImage, force);
    if (!node.isConnected || node.imageToken !== token) return;
    node.removeAttribute('aria-busy');
    if (!result.blob) { node.textContent = 'Image unavailable'; node.classList.add('image-unavailable'); return; }
    const img = new Image(); img.alt = node.dataset.bottleImage + ' bottle'; img.decoding = 'async';
    const objectUrl = URL.createObjectURL(result.blob);
    img.onload = img.onerror = () => URL.revokeObjectURL(objectUrl);
    img.src = objectUrl;
    node.replaceChildren(img); node.classList.remove('image-unavailable');
    node.title = result.stale ? 'Saved image - image service unavailable' : 'Bottle image via Bing';
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target); paint(entry.target); }
  }, { rootMargin: '200px' });
  function mount(root = document) {
    // Renders can remove pending observed nodes; do not retain detached cards.
    for (const node of observed) if (!node.isConnected) { observer.unobserve(node); observed.delete(node); }
    for (const node of root.querySelectorAll('[data-bottle-image]')) {
      if (node.dataset.imageMounted) continue;
      node.dataset.imageMounted = 'true'; observed.add(node); observer.observe(node);
    }
  }
  const observed = new Set();
  async function refresh(name) {
    const nodes = [...document.querySelectorAll('[data-bottle-image]')].filter(node => node.dataset.bottleImage === name);
    await get(name, true);
    await Promise.all(nodes.map(node => paint(node)));
  }
  window.DramImages = { mount, refresh, url };
})();
