// Turning the text of a picked element into a sortable value.
// parse('★ 4.6') -> { raw: '★ 4.6', num: 4.6, kind: 'number' }
// parse('Updated 3 days ago') -> { raw, num: <timestamp>, kind: 'date' }
(function (PS) {
  const DAY = 864e5;
  const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';

  function clean(text) {
    return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  }

  function unitMs(u) {
    u = u.toLowerCase();
    if (u === 's' || u.startsWith('se')) return 1e3;
    if (u.startsWith('mo')) return 30 * DAY;
    if (u === 'm' || u.startsWith('mi')) return 6e4;
    if (u.startsWith('h')) return 36e5;
    if (u.startsWith('d')) return DAY;
    if (u.startsWith('w')) return 7 * DAY;
    if (u.startsWith('y')) return 365 * DAY;
    return null;
  }

  function parseDate(raw, now) {
    if (/\b(just now|today)\b/i.test(raw)) return now;
    if (/\byesterday\b/i.test(raw)) return now - DAY;
    let m = raw.match(/\b(\d+|an?|one)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mos?|years?|yrs?|[smhdwy])\.?\s*ago\b/i);
    if (m) {
      const n = /^\d+$/.test(m[1]) ? +m[1] : 1;
      const ms = unitMs(m[2]);
      if (ms) return now - n * ms;
    }
    const patterns = [
      new RegExp(`\\b(${MONTHS})[a-z]*\\.?\\s+\\d{1,2}(st|nd|rd|th)?,?\\s+\\d{4}\\b`, 'i'),
      new RegExp(`\\b\\d{1,2}(st|nd|rd|th)?\\s+(${MONTHS})[a-z]*\\.?,?\\s+\\d{4}\\b`, 'i'),
      /\b\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?\b/,
      /\b\d{1,2}\/\d{1,2}\/\d{4}\b/,
    ];
    for (const re of patterns) {
      m = raw.match(re);
      if (m) {
        const t = Date.parse(m[0].replace(/(\d)(st|nd|rd|th)/i, '$1'));
        if (!isNaN(t)) return t;
      }
    }
    return null;
  }

  function parseNumber(raw) {
    const m = raw.match(/(-?\d[\d,]*(?:\.\d+)?)\s*([kmb])?(?![a-z])/i);
    if (!m) return null;
    let s = m[1];
    // "1,234" is a thousands separator, "4,5" is a decimal comma.
    s = /,\d{3}(?!\d)/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    let n = parseFloat(s);
    if (isNaN(n)) return null;
    const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()];
    if (mult) n *= mult;
    return n;
  }

  function parse(text, now = Date.now()) {
    const raw = clean(text);
    if (!raw) return null;
    const date = parseDate(raw, now);
    if (date != null) return { raw, num: date, kind: 'date' };
    const num = parseNumber(raw);
    if (num != null) return { raw, num, kind: 'number' };
    return { raw, num: null, kind: 'text' };
  }

  // Per-field "extract" regexes, compiled once. Invalid patterns are ignored (null).
  const reCache = new Map();
  function extractRe(src) {
    if (!reCache.has(src)) {
      let re = null;
      try {
        re = new RegExp(src, 'i');
      } catch {}
      reCache.set(src, re);
    }
    return reCache.get(src);
  }

  const fmt = n => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

  // Parse captured text using a field's settings:
  //   field.regex — keep only the first capture group (or the whole match); no match -> null
  //   field.type  — 'auto' | 'number' | 'text' | 'date'
  // Returns { raw, num, kind, display } or null.
  function parseAs(text, field, now = Date.now()) {
    let raw = clean(text);
    if (!raw) return null;
    const re = field && field.regex ? extractRe(field.regex) : null;
    if (re) {
      const m = raw.match(re);
      if (!m) return null;
      raw = clean(m[1] ?? m[0]);
      if (!raw) return null;
    }
    const type = (field && field.type) || 'auto';
    if (type === 'text') return { raw, num: null, kind: 'text', display: raw };
    if (type === 'number') {
      const n = parseNumber(raw);
      return { raw, num: n, kind: 'number', display: n == null ? raw : fmt(n) };
    }
    if (type === 'date') return { raw, num: parseDate(raw, now), kind: 'date', display: raw };
    return { ...parse(raw, now), display: raw };
  }

  PS.values = { clean, parse, parseAs, parseNumber, parseDate, DAY };
})(window.__PS);
