// Records the site loaded for itself (sent by content/netwatch.js), and matching them to cards.
// Many sites draw only part of what they load: a table might show a title and a cost while the
// response behind it also has dates, funding source, coordinates. "Page data" fields read those.
//
// A card is matched to its record by a "join" field: one whose value (an id like 24DK0055) appears
// in the card's text or links. It's found automatically, from the cards on the page (detectJoin).
(function (PS) {
  if (PS.data) return;
  const MAX = 5000; // records kept (newest win)
  let records = []; // flattened: { 'contractId': '24DK0055', 'location.region': 'Region X', ... }
  let seen = new Set(); // the same records again (the site re-fetched a page) are skipped
  let version = 0;
  const listeners = [];

  // Nested objects become dotted paths; lists of plain values are joined with ", ".
  function flatten(obj, prefix = '', out = {}, depth = 0) {
    for (const [k, v] of Object.entries(obj || {})) {
      const path = prefix + k;
      if (v == null || v === '') continue;
      if (Array.isArray(v)) {
        const plain = v.filter(x => x != null && typeof x !== 'object');
        if (plain.length && plain.length === v.length) out[path] = plain.join(', ');
      } else if (typeof v === 'object') {
        if (depth < 2) flatten(v, path + '.', out, depth + 1);
      } else {
        out[path] = String(v);
      }
    }
    return out;
  }

  function add(lists) {
    let n = 0;
    for (const list of lists || []) {
      for (const r of list || []) {
        if (!r || typeof r !== 'object') continue;
        const flat = flatten(r);
        const id = JSON.stringify(flat);
        if (seen.has(id)) continue;
        seen.add(id);
        records.push(flat);
        n++;
      }
    }
    if (!n) return;
    if (records.length > MAX) {
      records = records.slice(-MAX);
      seen = new Set(records.map(r => JSON.stringify(r)));
    }
    version++;
    for (const fn of listeners) fn();
  }

  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || e.data.psNet !== 1) return;
    add(e.data.lists);
  });
  // Ask netwatch.js for what the page loaded before this script started.
  window.postMessage({ psNetHello: 1 }, '*');

  // Words a card's record might be found by: its text, plus the parts of its links and data-* ids.
  function tokens(card) {
    const parts = [PS.extract.textOf(card)];
    for (const a of [card, ...card.querySelectorAll('a[href]')]) {
      const h = a.getAttribute && a.getAttribute('href');
      if (h) parts.push(h.replace(/[/?&=#.]+/g, ' '));
    }
    for (const el of [card, ...card.querySelectorAll('[data-id], [data-key]')]) {
      for (const at of el.attributes || []) if (/^data-.*(id|key)$/i.test(at.name)) parts.push(at.value);
    }
    return parts.join(' ').split(/[\s,;:()[\]{}"'|·•<>]+/).filter(t => t.length >= 3);
  }

  // value -> record for one path, rebuilt when records change.
  const indexes = new Map();
  function index(path) {
    let ix = indexes.get(path);
    if (!ix || ix.version !== version) {
      const map = new Map();
      for (const r of records) if (r[path] != null) map.set(r[path].toLowerCase(), r);
      ix = { version, map };
      indexes.set(path, ix);
    }
    return ix.map;
  }

  function recordFor(card, path) {
    if (!path || !records.length) return null;
    const map = index(path);
    for (const t of tokens(card)) {
      const r = map.get(t.toLowerCase());
      if (r) return r;
    }
    return null;
  }

  // The field that best ties records to these cards: single-word values (ids), nearly all different,
  // found in as many cards as possible. -> { path, matched, total } or null.
  function detectJoin(cards) {
    if (!records.length || !cards.length) return null;
    const sample = records.slice(-1000);
    const stats = new Map();
    for (const r of sample) {
      for (const [k, v] of Object.entries(r)) {
        if (v.length < 3 || /\s/.test(v)) continue;
        const s = stats.get(k) || { n: 0, vals: new Set() };
        s.n++;
        s.vals.add(v.toLowerCase());
        stats.set(k, s);
      }
    }
    const cardTokens = cards.slice(0, 60).map(c => new Set(tokens(c).map(t => t.toLowerCase())));
    let best = null;
    for (const [path, s] of stats) {
      // Nearly every record must have its own value (an id, not a category). Records from other
      // responses may not have this field at all, so how many have it doesn't matter.
      if (s.n < 2 || s.vals.size < s.n * 0.9) continue;
      const matched = cardTokens.filter(ts => [...ts].some(t => s.vals.has(t))).length;
      if (!matched) continue;
      if (!best || matched > best.matched || (matched === best.matched && path.length < best.path.length)) {
        best = { path, matched, total: cardTokens.length };
      }
    }
    return best;
  }

  // Every path seen in recent records, with an example value: [{ path, sample }].
  function paths() {
    const seen = new Map();
    for (const r of records.slice(-300)) for (const [k, v] of Object.entries(r)) if (!seen.has(k)) seen.set(k, v);
    return [...seen].map(([path, sample]) => ({ path, sample }));
  }

  // 'sourceOfFunds' -> 'Source of funds', 'location.region' -> 'Location region'
  function label(path) {
    const s = path
      .replace(/[._-]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim()
      .toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  PS.data = {
    add,
    flatten,
    recordFor,
    detectJoin,
    paths,
    label,
    count: () => records.length,
    onRecords: fn => listeners.push(fn),
  };
})(window.__PS);
