// Column filter syntax. compile(expr, kind) -> { test(value), error } or null for an empty filter.
// `value` is what PS.values.parseAs returns ({ raw, num, kind }) or null for a blank cell.
//
//   number columns  >4.5  <=100  10..50  213 (equals)  !=0  >=1.2M
//   date columns    <7d (newer than 7 days)  >1m (older than a month)  >2025-01-01  2025-01-01..2025-06-30
//   text columns    dragon (contains)  !hiatus (doesn't contain)  ="Ongoing" (exactly)  "dragon chef" (phrase)
//   any column      /regex/i  !/regex/  empty  !empty
//   combining       space = AND, | = OR:   >3 <5     Ongoing | Hiatus
(function (PS) {
  const DAY = PS.values.DAY;
  const UNITS = { h: 36e5, d: DAY, w: 7 * DAY, m: 30 * DAY, mo: 30 * DAY, y: 365 * DAY };

  // Terms: /regex/flags (may contain spaces), "quoted phrases", or runs of non-spaces.
  const tokenize = expr => expr.match(/!?\/(?:\\.|[^/\\])+\/[a-z]*|!?=?"[^"]*"|\S+/gi) || [];

  const isEmpty = v => !v || (!v.raw && v.kind !== 'image');
  const lower = s => String(s ?? '').toLowerCase();

  // A comparison operand: { age: ms } for durations on date columns, { abs: n } otherwise.
  function operand(s, kind) {
    s = s.trim();
    if (kind === 'date') {
      const d = s.match(/^(\d+(?:\.\d+)?)\s*(mo|[hdwmy])$/i);
      if (d) return { age: +d[1] * UNITS[d[2].toLowerCase()] };
      if (/^\d{4}-\d{2}(-\d{2})?$/.test(s) || /[a-z]{3}/i.test(s)) {
        const t = Date.parse(s);
        if (!isNaN(t)) return { abs: t };
      }
      return null;
    }
    if (!/^-?[\d.,]+\s*[kmb]?$/i.test(s)) return null;
    const n = PS.values.parseNumber(s);
    return n == null ? null : { abs: n };
  }

  // Number to compare for a value against an operand (age for durations).
  function measure(v, op, now) {
    if (!v || v.num == null) return null;
    return op.age != null ? now - v.num : v.num;
  }
  const target = op => (op.age != null ? op.age : op.abs);

  const COMPARE = {
    '>': (a, b) => a > b,
    '<': (a, b) => a < b,
    '>=': (a, b) => a >= b,
    '<=': (a, b) => a <= b,
    '=': (a, b) => Math.abs(a - b) < 1e-9,
    '!=': (a, b) => Math.abs(a - b) >= 1e-9,
  };

  function positive(tok, kind, now) {
    // /regex/flags — tested against the cell's text
    let m = tok.match(/^\/(.+)\/([a-z]*)$/i);
    if (m) {
      const re = new RegExp(m[1], m[2].replace(/g/g, '')); // throws on a bad pattern -> reported as error
      return v => !!v && re.test(v.raw);
    }
    // a..b range; either end may be left open (10.. = at least 10, ..50 = at most 50)
    m = tok.match(/^(.*?)\.\.(.*)$/);
    if (m && (m[1] || m[2])) {
      const a = m[1] ? operand(m[1], kind) : null;
      const b = m[2] ? operand(m[2], kind) : null;
      const ok = (!m[1] || a) && (!m[2] || b) && (!a || !b || (a.age != null) === (b.age != null));
      if (ok) {
        const ref = a || b;
        const ends = [a, b].filter(Boolean).map(target);
        const lo = a && b ? Math.min(...ends) : a ? target(a) : -Infinity;
        const hi = a && b ? Math.max(...ends) : b ? target(b) : Infinity;
        return v => {
          const x = measure(v, ref, now);
          return x != null && x >= lo && x <= hi;
        };
      }
    }
    // A lone operator while typing ("<", ">=") filters nothing yet.
    if (/^(>=|<=|!=|>|<|=)$/.test(tok)) return () => true;
    // >x  <x  >=x  <=x  =x  !=x
    m = tok.match(/^(>=|<=|!=|>|<|=)(.+)$/);
    if (m) {
      const op = operand(m[2], kind);
      if (op) {
        const fn = COMPARE[m[1]];
        return v => {
          const x = measure(v, op, now);
          return x != null && fn(x, target(op));
        };
      }
      if (m[1] === '=') {
        const want = lower(m[2].replace(/^"(.*)"$/, '$1'));
        return v => !!v && lower(v.raw) === want;
      }
    }
    // a bare number on a number column means "equals"
    if (kind === 'number') {
      const op = operand(tok, kind);
      if (op) return v => v != null && v.num != null && COMPARE['='](v.num, op.abs);
    }
    // contains (quotes allow spaces)
    const needle = lower(tok.replace(/^"(.*)"$/, '$1'));
    return v => !!v && lower(v.raw).includes(needle);
  }

  // { f, neg }: the positive test and whether the term was negated with a leading "!".
  function term(tok, kind, now) {
    const low = tok.toLowerCase();
    if (low === 'empty') return { f: isEmpty, neg: false };
    if (low === '!empty') return { f: isEmpty, neg: true };
    if (tok.length > 1 && tok[0] === '!' && tok[1] !== '=') return { f: positive(tok.slice(1), kind, now), neg: true };
    return { f: positive(tok, kind, now), neg: false };
  }

  // test(value)      — one column's cell.
  // testAny(values)  — the top search box: each term must hold within some single cell
  //                    (a "!" term: no cell matches it), so ^ and $ anchor to a cell.
  function compile(expr, kind = 'text', now = Date.now()) {
    if (!expr || !expr.trim()) return null;
    try {
      const groups = [[]];
      for (const t of tokenize(expr.trim())) {
        if (t === '|') groups.push([]);
        else groups[groups.length - 1].push(term(t, kind, now));
      }
      const ors = groups.filter(g => g.length);
      if (!ors.length) return null;
      return {
        test: v => ors.some(g => g.every(t => t.f(v) !== t.neg)),
        testAny: vs => ors.some(g => g.every(t => vs.some(v => t.f(v)) !== t.neg)),
        error: null,
      };
    } catch (e) {
      // A half-typed regex shouldn't hide every row.
      return { test: () => true, testAny: () => true, error: e.message };
    }
  }

  // All of a tracker's filters as one test over a row of parsed values ({ [column]: value }).
  // Used for the list and for hiding cards on the page, so both always agree.
  //   colFilters { [column]: expr }, search: the top box, kinds { [column]: 'number'|'date'|'text'|'image' }
  // Returns { test(vals), active, errors }. Filters with errors (half-typed regex) are skipped.
  function rowMatcher(colFilters, search, kinds, now = Date.now()) {
    const errors = {};
    const tests = [];
    for (const [name, expr] of Object.entries(colFilters || {})) {
      const kind = kinds[name];
      if (!kind || kind === 'image') continue;
      const c = compile(expr, kind, now);
      if (!c) continue;
      if (c.error) errors[name] = c.error;
      else tests.push([name, c.test]);
    }
    const g = compile(search, 'text', now);
    if (g && g.error) errors['*'] = g.error;
    const useSearch = !!g && !g.error;
    return {
      active: tests.length > 0 || useSearch,
      errors,
      test(vals) {
        if (useSearch && !g.testAny(Object.values(vals).filter(v => v && v.kind !== 'image'))) return false;
        return tests.every(([name, t]) => t(vals[name]));
      },
    };
  }

  // 'date' | 'number' | 'text' from a column's (parsed) values: 70%+ of filled cells decide.
  function columnKind(values) {
    let filled = 0;
    let dates = 0;
    let nums = 0;
    for (const v of values) {
      if (!v || !v.raw) continue;
      filled++;
      if (v.kind === 'date') dates++;
      if (v.num != null) nums++;
    }
    if (!filled) return 'text';
    if (dates / filled >= 0.7) return 'date';
    if (nums / filled >= 0.7) return 'number';
    return 'text';
  }

  PS.filters = { compile, rowMatcher, columnKind, tokenize };
})(window.__PS);
