// Derived columns: a formula over other columns, e.g. {Views} / {Chapters}.
//   {Column}     another column's number (date columns count in days, so {Updated} - {Started} = days between)
//   today        the current date in days: today - {Updated} = days since the last update
//   + - * / ( )  arithmetic; numbers like 2 or 0.5
// A blank or non-numeric input, or dividing by zero, gives a blank cell. No eval: parsed into closures.
(function (PS) {
  const DAY = PS.values.DAY;

  // Tokens: numbers, {column refs}, words (only "today"), operators.
  function tokenize(src) {
    const out = [];
    const re = /\s*(?:(\d+(?:\.\d+)?|\.\d+)|\{([^}]*)\}|([A-Za-z_]\w*)|([-+*/()])|(\S))/y;
    let m;
    while (re.lastIndex < src.length && (m = re.exec(src))) {
      if (m[1] != null) out.push({ t: 'num', v: +m[1] });
      else if (m[2] != null) out.push({ t: 'ref', v: m[2].trim() });
      else if (m[3] != null) out.push({ t: 'word', v: m[3] });
      else if (m[4] != null) out.push({ t: 'op', v: m[4] });
      else if (m[5] === '{') throw new Error('Missing } after {');
      else if (m[5] != null) throw new Error(`Unexpected "${m[5]}"`);
    }
    return out;
  }

  // Recursive descent: expr = term (+|- term)*, term = unary (*|/ unary)*, unary = -unary | atom.
  // Each node is a function (env) -> number | null, where env = { get(name), today }.
  function parse(tokens, names) {
    let i = 0;
    const refs = new Set();
    const peek = () => tokens[i];
    const isOp = (tok, ops) => tok && tok.t === 'op' && ops.includes(tok.v);
    const bin = (a, b, f) => env => {
      const x = a(env);
      if (x == null) return null;
      const y = b(env);
      if (y == null) return null;
      const r = f(x, y);
      return Number.isFinite(r) ? r : null;
    };

    function expr() {
      let left = term();
      while (isOp(peek(), '+-')) {
        const op = tokens[i++].v;
        const right = term();
        left = bin(left, right, op === '+' ? (x, y) => x + y : (x, y) => x - y);
      }
      return left;
    }
    function term() {
      let left = unary();
      while (isOp(peek(), '*/')) {
        const op = tokens[i++].v;
        const right = unary();
        left = bin(left, right, op === '*' ? (x, y) => x * y : (x, y) => x / y);
      }
      return left;
    }
    function unary() {
      if (isOp(peek(), '-')) {
        i++;
        const inner = unary();
        return env => {
          const x = inner(env);
          return x == null ? null : -x;
        };
      }
      if (isOp(peek(), '+')) i++;
      return atom();
    }
    function atom() {
      const tok = tokens[i++];
      if (!tok) throw new Error('Formula ends too early');
      if (tok.t === 'num') return () => tok.v;
      if (tok.t === 'ref') {
        const name = names && names.find(n => n.toLowerCase() === tok.v.toLowerCase());
        if (names && !name) throw new Error(`No column named "${tok.v}"`);
        refs.add(name || tok.v);
        return env => env.get(name || tok.v);
      }
      if (tok.t === 'word') {
        if (tok.v.toLowerCase() === 'today') return env => env.today;
        throw new Error(`Unknown word "${tok.v}" — put column names in { }, like {${tok.v}}`);
      }
      if (tok.v === '(') {
        const inner = expr();
        if (!isOp(tokens[i++], ')')) throw new Error('Missing )');
        return inner;
      }
      throw new Error(`Unexpected "${tok.v}"`);
    }

    if (!tokens.length) throw new Error('Empty formula');
    const fn = expr();
    if (i < tokens.length) throw new Error(`Unexpected "${tokens[i].v}"`);
    return { fn, refs: [...refs] };
  }

  // compile(src, names?) -> { fn, refs, error }. With `names`, unknown columns are an error
  // (the editor's check); without, they just evaluate to blank.
  function compile(src, names) {
    try {
      const { fn, refs } = parse(tokenize(String(src ?? '')), names);
      return { fn, refs, error: null };
    } catch (e) {
      return { fn: () => null, refs: [], error: e.message };
    }
  }

  const cache = new Map();
  function compiled(src) {
    if (!cache.has(src)) cache.set(src, compile(src));
    return cache.get(src);
  }

  // Ratios are often well below 1 (follows per view), so small numbers keep 3 significant digits.
  const fmt = n =>
    Math.abs(n) >= 1 || n === 0
      ? n.toLocaleString('en-US', { maximumFractionDigits: 2 })
      : n.toLocaleString('en-US', { maximumSignificantDigits: 3 });

  // A derived column's cell from the row's other (already parsed) cells: { raw, num, kind, display } or null.
  function value(src, vals, now = Date.now()) {
    const c = compiled(src);
    if (c.error) return null;
    const n = c.fn({
      today: now / DAY,
      get(name) {
        let v = vals[name];
        if (v === undefined) {
          const key = Object.keys(vals).find(k => k.toLowerCase() === name.toLowerCase());
          v = key && vals[key];
        }
        if (!v || v.num == null) return null;
        return v.kind === 'date' ? v.num / DAY : v.num;
      },
    });
    if (n == null) return null;
    const s = fmt(n);
    return { raw: s, num: n, kind: 'number', display: s };
  }

  PS.formula = { compile, value, tokenize };
})(window.__PS);
