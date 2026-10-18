// Building CSS selectors from one clicked element that keep working on the next page.
//
// Card selector: from one picked card, find its similar siblings and the shortest selector
// that matches exactly that group. Field selector: a path relative to the card that finds the
// same part in (most) other cards. Hashed class names (css-x8f2k, sc-…, kVcKcL) are ignored
// because they change between site builds.
(function (PS) {
  const UNSAFE_CHARS = /[:\/\[\]@!%()=,+~>.#]/; // tailwind-style utilities (md:flex, w-1/2)
  // Classes a site adds and removes as you interact (a row gets "on-hover" while the mouse is over it).
  const STATE = /^((is|has|on|are|was)[-_])?(active|selected|current|hover|hovered|focus|focused|visible|hidden|open|opened|loaded|lazyloaded|lazyload|highlight|highlighted|pressed|checked|expanded|collapsed|disabled)$/i;

  function caseFlips(s) {
    let n = 0;
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1], b = s[i];
      if ((a >= 'a' && a <= 'z' && b >= 'A' && b <= 'Z') || (a >= 'A' && a <= 'Z' && b >= 'a' && b <= 'z')) n++;
    }
    return n;
  }

  function isUnstableClass(cls) {
    if (!cls || UNSAFE_CHARS.test(cls) || STATE.test(cls)) return true;
    if (/^(css|sc|jsx|svelte|emotion|styled|tw)-/i.test(cls)) return true; // CSS-in-JS hashes
    // per-item: post-123, item_4 — but not layout classes like col-md-3
    if (/[-_]\d{3,}$/.test(cls) || /^(item|post|entry|card|row|node|id|index|list|n|i)[-_]?\d+$/i.test(cls)) return true;
    if (/__[A-Za-z0-9-]{5,}$/.test(cls) && /\d|[A-Z]/.test(cls.split('__').pop())) return true; // CSS modules
    if (cls.split(/[-_]+/).some(seg => seg.length >= 5 && /\d/.test(seg) && /[a-z]/i.test(seg))) return true;
    if (/^[A-Za-z]{5,10}$/.test(cls) && caseFlips(cls) >= cls.length / 2) return true; // kVcKcL
    return false;
  }

  function classesOf(el) {
    return (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  }

  function stableClasses(el) {
    return classesOf(el).filter(c => !isUnstableClass(c));
  }

  function sig(el) {
    return el.tagName.toLowerCase() + stableClasses(el).sort().map(c => '.' + CSS.escape(c)).join('');
  }

  function nthOfType(el) {
    let i = 1;
    for (let s = el.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === el.tagName) i++;
    return `:nth-of-type(${i})`;
  }

  function uniqueId(el) {
    const id = el.id;
    if (!id || /\d{2,}/.test(id) || isUnstableClass(id)) return null;
    const sel = '#' + CSS.escape(id);
    try {
      return document.querySelectorAll(sel).length === 1 ? sel : null;
    } catch {
      return null;
    }
  }

  function describe(el) {
    const cls = stableClasses(el).slice(0, 2).map(c => '.' + c).join('');
    return el.tagName.toLowerCase() + cls;
  }

  // ---------- card detection ----------

  // Nearest ancestor-or-self whose parent holds 2+ children with the same signature.
  function repeatGroup(el) {
    for (let n = el; n && n.parentElement && n !== document.body; n = n.parentElement) {
      const s = sig(n);
      const sibs = [...n.parentElement.children].filter(c => sig(c) === s);
      if (sibs.length >= 2) return { anchor: n, sibs };
    }
    return { anchor: el, sibs: [el] };
  }

  // How much "stuff" an element holds: text leaves + images. A card has several, a genre tag has one.
  function contentScore(el, cap = 6) {
    let n = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let node = walker.currentNode; node && n < cap; node = walker.nextNode()) {
      if (node.nodeType === 3) {
        if (node.nodeValue.trim()) n++;
      } else if (node.tagName === 'IMG' || node.tagName === 'PICTURE' || node.tagName === 'svg') {
        n++;
      }
    }
    return n;
  }

  // Snap from whatever is under the cursor to the card it belongs to: the innermost ancestor that
  // repeats among its siblings (3+) and holds several pieces of content. Falls back to 2+ siblings.
  function snapToCard(el) {
    let fallback = null;
    for (let n = el; n && n.parentElement && n !== document.body; n = n.parentElement) {
      const s = sig(n);
      let count = 0;
      for (const c of n.parentElement.children) if (sig(c) === s) count++;
      if (count >= 2 && contentScore(n) >= 3) {
        if (count >= 3) return n;
        if (!fallback) fallback = n;
      }
    }
    return fallback || el;
  }

  // Similar elements to `el` (used to preview the card group while hovering).
  function similar(el) {
    const { anchor, sibs } = repeatGroup(el);
    if (anchor === el) return sibs;
    const down = relSelector(anchor, el, false);
    return sibs.map(s => resolve(s, down)).filter(Boolean);
  }

  function sameSet(list, target) {
    if (list.length !== target.length) return false;
    const set = new Set(list);
    return target.every(t => set.has(t));
  }

  function qsa(sel) {
    try {
      return [...document.querySelectorAll(sel)];
    } catch {
      return [];
    }
  }

  function cardSelector(el) {
    const { anchor } = repeatGroup(el);
    const target = similar(el);
    let best = null;
    for (const nth of [false, true]) {
      const steps = [];
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const aboveAnchor = !anchor.contains(n);
        const id = aboveAnchor && uniqueId(n);
        if (id) {
          steps.unshift(id);
        } else {
          steps.unshift(sig(n) + (nth && aboveAnchor ? nthOfType(n) : ''));
        }
        const sel = steps.join(' > ');
        const found = qsa(sel);
        if (sameSet(found, target)) return sel;
        if (target.every(t => found.includes(t)) && (!best || found.length < best.count)) {
          best = { sel, count: found.length };
        }
        if (id) break;
      }
    }
    return best ? best.sel : sig(el);
  }

  // All cards for a selector, minus elements nested inside another match.
  function findCards(sel, root = document) {
    let list;
    try {
      list = [...root.querySelectorAll(sel)];
    } catch {
      return [];
    }
    const set = new Set(list);
    return list.filter(el => {
      for (let p = el.parentElement; p; p = p.parentElement) if (set.has(p)) return false;
      return true;
    });
  }

  // ---------- fields inside a card ----------

  function nthLastOfType(el) {
    let i = 1;
    for (let s = el.nextElementSibling; s; s = s.nextElementSibling) if (s.tagName === el.tagName) i++;
    return `:nth-last-of-type(${i})`;
  }

  // withNth: false = signatures only, true = :nth-of-type on every step,
  // 'last' = :nth-of-type on ancestors and :nth-last-of-type on the element itself.
  function relSelector(from, to, withNth) {
    if (from === to) return ':scope';
    const parts = [];
    for (let n = to; n && n !== from; n = n.parentElement) {
      const pos = !withNth ? '' : withNth === 'last' && n === to ? nthLastOfType(n) : nthOfType(n);
      parts.unshift(sig(n) + pos);
    }
    return ':scope > ' + parts.join(' > ');
  }

  // Rough "shape" of a value so "Ch. 229" and "Ch. 35" look alike but "702.5K views" doesn't.
  function shape(el) {
    return (el.textContent || '')
      .replace(/\d[\d.,]*/g, '9')
      .replace(/[^\W\d_]+/gu, 'a')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function resolve(card, sel) {
    if (sel === ':scope') return card;
    try {
      return card.querySelector(sel);
    } catch {
      return null;
    }
  }

  function fieldSelector(card, el, cards) {
    if (card === el) return ':scope';
    const cands = [];
    if (stableClasses(el).length) cands.push(sig(el));
    // nearest classed ancestor inside the card + the element's signature
    for (let p = el.parentElement; p && p !== card; p = p.parentElement) {
      if (stableClasses(p).length) {
        cands.push(sig(p) + ' ' + sig(el));
        break;
      }
    }
    const named = cands.length; // candidates built from class names are preferred as-is
    cands.push(relSelector(card, el, false));
    cands.push(relSelector(card, el, true));
    cands.push(relSelector(card, el, 'last'));

    // Positional candidates ("2nd span") break when an earlier sibling is missing in some cards
    // (no rating → chapters becomes the 1st span). For numeric-looking values, prefer the position
    // whose matches look like the picked value in the most cards.
    const total = Math.max(cards.length, 1);
    const want = /\d/.test(el.textContent || '') ? shape(el) : null;
    let best = null;
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      if (resolve(card, c) !== el) continue;
      let hits = 0;
      let alike = 0;
      for (const k of cards) {
        const r = resolve(k, c);
        if (!r) continue;
        hits++;
        if (want && shape(r) === want) alike++;
      }
      const cov = hits / total;
      if (i < named && cov >= 0.6) return c;
      const score = (want ? alike / total : cov) * 10 + cov;
      if (!best || score > best.score + 1e-9) best = { c, score };
    }
    return best ? best.c : relSelector(card, el, true);
  }

  // ---------- which pages a tracker applies to ----------

  // "/search/page/2" -> "/search/**"; "/series-finder/" -> "/series-finder/**"; "/" -> "/**"
  function suggestPattern(path) {
    const keep = [];
    for (const seg of path.split('/').filter(Boolean)) {
      if (/\d/.test(seg) || /^(page|p|pg)$/i.test(seg)) break;
      keep.push(seg);
    }
    return '/' + keep.join('/') + (keep.length ? '/**' : '**');
  }

  // "*" = one path segment, "/**" at the end = this path and anything below it.
  function compilePattern(p) {
    p = (p || '').trim();
    if (!p || p === '*' || p === '**' || p === '/**') return /^/;
    let tail = '';
    if (p.endsWith('/**')) {
      p = p.slice(0, -3);
      tail = '(?:/.*)?';
    }
    const body = p
      .split(/(\*\*|\*)/)
      .map(t => (t === '**' ? '.*' : t === '*' ? '[^/]*' : t.replace(/[.+?^${}()|[\]\\]/g, '\\$&')))
      .join('');
    return new RegExp('^' + body.replace(/\/$/, '') + tail + '/?$');
  }

  PS.sel = {
    isUnstableClass,
    stableClasses,
    sig,
    describe,
    snapToCard,
    similar,
    cardSelector,
    findCards,
    fieldSelector,
    resolve,
    suggestPattern,
    compilePattern,
  };
})(window.__PS);
