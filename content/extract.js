// Reading a tracker's fields out of one card.
(function (PS) {
  function textOf(el) {
    return el.innerText || el.textContent || '';
  }

  function abs(u) {
    try {
      return u ? new URL(u, location.href).href : null;
    } catch {
      return null;
    }
  }

  function hrefOf(a) {
    const h = a.getAttribute('href');
    if (!h || h.startsWith('#') || /^javascript:/i.test(h)) return null;
    return a.href.split('#')[0];
  }

  // Link that identifies the item: the link around/inside `el`, as long as it belongs to this card.
  function linkOf(el, card) {
    const around = el.closest('a[href]');
    if (around && (card.contains(around) || around.contains(card))) {
      const h = hrefOf(around);
      if (h) return h;
    }
    for (const a of el.querySelectorAll('a[href]')) {
      const h = hrefOf(a);
      if (h) return h;
    }
    return null;
  }

  function imageSrc(el) {
    const img = el.tagName === 'IMG' ? el : el.querySelector('img');
    if (!img) return null;
    const lazy = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original');
    const src = img.currentSrc || img.getAttribute('src');
    return abs(!src || src.startsWith('data:') ? lazy || src : src);
  }

  // What gets stored: the element's text as captured ({ text }) or an image URL ({ src }).
  // Parsing into numbers/dates happens when the list is shown (PS.values.parseAs), so changing a
  // field's type or extract regex later also applies to items saved earlier.
  function field(card, f) {
    const el = PS.sel.resolve(card, f.sel);
    if (!el) return null;
    if (f.attr === 'src') {
      const src = imageSrc(el);
      return src ? { src } : null;
    }
    const text = PS.values.clean(textOf(el));
    return text ? { text } : null;
  }

  // Stored value -> what the list shows/sorts/filters: { raw, num, kind, display } or { kind: 'image', src }.
  // Accepts items saved by older versions ({ raw, num, kind }).
  function shown(v, f, seenAt) {
    if (!v) return null;
    if (v.src || v.kind === 'image') return { kind: 'image', src: v.src || v.raw, raw: '' };
    return PS.values.parseAs(v.text ?? v.raw, f, seenAt);
  }

  // Derived columns are computed from the other columns ({ name, formula }); they have no selector.
  const isCalc = f => f.formula != null;
  // Page data fields come from the record the site loaded for the card ({ name, data: path }).
  const isData = f => f.data != null;
  // Fields picked on the card itself.
  const isPicked = f => !isCalc(f) && !isData(f);

  // Stored values -> what the list shows, per field settings. Picked fields first, then derived
  // columns in order, so a formula can use any picked column and the derived columns above it.
  function shownValues(values, fields, seenAt, now = Date.now()) {
    const vals = {};
    for (const f of fields) if (!isCalc(f)) vals[f.name] = shown(values[f.name], f, seenAt);
    for (const f of fields) if (isCalc(f)) vals[f.name] = PS.formula.value(f.formula, vals, now);
    return vals;
  }

  // A whole item's values, parsed per the recipe's field settings.
  const shownItem = (it, recipe, seenAt, now) => shownValues(it.values, recipe.fields, seenAt, now);

  // The captured values of a card's picked and page data fields. A data field whose record hasn't
  // been seen (yet) is left out, so a value saved earlier is kept (see store.upsertItems).
  function capture(card, fields, join) {
    const out = {};
    let rec;
    for (const f of fields) {
      if (isPicked(f)) out[f.name] = field(card, f);
      else if (isData(f)) {
        if (rec === undefined) rec = PS.data.recordFor(card, join);
        if (rec) out[f.name] = rec[f.data] != null ? { text: rec[f.data] } : null;
      }
    }
    return out;
  }

  function item(card, recipe) {
    const values = capture(card, recipe.fields, recipe.join);
    // The key field (normally the title; else the first text field) supplies the item link; the card's
    // own link is the fallback.
    const text = recipe.fields.filter(f => f.attr !== 'src' && isPicked(f));
    const first = text.find(f => f.key) || text[0];
    const firstEl = first && PS.sel.resolve(card, first.sel);
    const url = (firstEl && linkOf(firstEl, card)) || linkOf(card, card);
    const key = url || (first && values[first.name] && values[first.name].text);
    if (!key) return null;
    return { key, url, values, sourcePage: location.href };
  }

  const KEYWORDS = [
    ['title', 'Title'], ['name', 'Title'], ['rating', 'Rating'], ['score', 'Score'], ['chapter', 'Chapters'],
    ['episode', 'Episodes'], ['status', 'Status'], ['genre', 'Genres'], ['tag', 'Tags'], ['author', 'Author'],
    ['artist', 'Artist'], ['update', 'Updated'], ['date', 'Date'], ['view', 'Views'], ['follow', 'Follows'],
    ['bookmark', 'Bookmarks'], ['rank', 'Rank'], ['type', 'Type'], ['year', 'Year'], ['volume', 'Volumes'],
    ['like', 'Likes'], ['comment', 'Comments'], ['word', 'Words'], ['review', 'Reviews'], ['reader', 'Readers'],
  ];

  // A sensible default column name for a picked element.
  function guessName(el, index) {
    if (el.tagName === 'IMG') return 'Cover';
    const t = PS.values.clean(textOf(el));
    let m = t.match(/^([A-Za-z][A-Za-z ]{1,18}):/);
    if (m) return m[1].trim();
    const prev = el.previousElementSibling;
    if (prev) {
      m = PS.values.clean(textOf(prev)).match(/^([A-Za-z][A-Za-z ]{1,18}):$/);
      if (m) return m[1].trim();
    }
    const hay = [
      el.getAttribute('class'), el.getAttribute('itemprop'), el.getAttribute('aria-label'),
      el.parentElement && el.parentElement.getAttribute('class'),
    ].join(' ').toLowerCase();
    for (const [k, name] of KEYWORDS) if (hay.includes(k)) return name;
    // "1.2M views", "340 follows", "12 reviews" — a keyword right after the number
    m = t.toLowerCase().match(/\d\s*[kmb]?\s+([a-z]+)/);
    if (m) for (const [k, name] of KEYWORDS) if (m[1].startsWith(k)) return name;
    if (/^ch(apter|\.)?\s*\d/i.test(t)) return 'Chapters';
    if (/\bago$|^updated\b/i.test(t)) return 'Updated';
    if (/^[★⭐]/.test(t)) return 'Rating';
    return index === 0 ? 'Title' : 'Field ' + (index + 1);
  }

  PS.extract = { field, capture, item, shown, shownValues, shownItem, isCalc, isData, isPicked, guessName, textOf };
})(window.__PS);
