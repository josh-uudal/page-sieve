// Inspect-element style picker: hover outlines the element under the cursor, click picks it.
//   mode 'card'  — the highlight snaps out to the whole card the hovered element belongs to,
//                  and every similar card gets a dashed preview outline.
//   mode 'field' — the highlight follows the exact element, limited to inside `scope` cards.
// ↑ / ↓ grow or shrink the highlight to the parent / back toward the hovered element.
(function (PS) {
  const MAX_BOXES = 400;
  let host, root, box, label, tip, layer, cursorStyle;
  let st = null; // { mode, scope, hint, onPick, onCancel, raw, chain, base, depth, current }
  let marks = []; // [{ el, kind: 'card' | 'field' }] drawn while the wizard is open
  let hoverGroup = [];
  let frame = 0;

  const STYLE = `
    :host { all: initial; }
    .box { position: fixed; display: none; pointer-events: none; border: 2px solid #2c4bd1;
      background: rgba(44, 75, 209, .10); border-radius: 4px; box-sizing: border-box; }
    .label { position: absolute; left: -2px; bottom: 100%; margin-bottom: 4px; max-width: 70vw;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: #2c4bd1; color: #fff;
      font: 11.5px/1.6 ui-monospace, "Cascadia Mono", SFMono-Regular, Consolas, monospace; padding: 1px 7px; border-radius: 5px;
      box-shadow: 0 2px 8px rgba(20, 22, 28, .25); }
    .box.below .label { bottom: auto; top: 100%; margin: 4px 0 0; }
    .m { position: fixed; pointer-events: none; box-sizing: border-box; border-radius: 4px; }
    .m.hover { border: 1.5px dashed rgba(44, 75, 209, .65); }
    .m.card { border: 1.5px dashed #c27803; background: rgba(194, 120, 3, .05); }
    .m.field { border: 2px solid #1d7a4b; background: rgba(29, 122, 75, .12); }
    .tip { position: fixed; left: 50%; top: 14px; transform: translateX(-50%); display: none; align-items: center; gap: 14px;
      background: #1b1c1f; color: #c9cacd; padding: 8px 10px 8px 16px; border-radius: 12px; max-width: 90vw;
      font: 12.5px/1.4 "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif;
      box-shadow: 0 0 0 1px rgba(255, 255, 255, .06), 0 12px 32px -6px rgba(0, 0, 0, .45); white-space: nowrap; }
    .tip b { color: #fff; font-weight: 600; }
    .tip span { display: inline-flex; align-items: center; gap: 5px; }
    kbd { font: 600 11px/1 "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif; color: #fff; background: rgba(255, 255, 255, .12);
      border-radius: 5px; padding: 3px 6px; min-width: 20px; text-align: center; }
  `;

  function ensure() {
    if (host && host.isConnected) return;
    host = document.createElement('ps-overlay');
    host.setAttribute('style', 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483646;');
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style><div class="layer"></div><div class="box"><div class="label"></div></div><div class="tip"></div>`;
    layer = root.querySelector('.layer');
    box = root.querySelector('.box');
    label = root.querySelector('.label');
    tip = root.querySelector('.tip');
    document.documentElement.appendChild(host);
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
  }

  const isOurs = el => !!(el && el.closest && el.closest('ps-overlay, ps-panel'));

  // Smallest element under the cursor, so invisible "stretched link" overlays that cover a whole
  // card don't hide the title or rating underneath them.
  function underPointer(x, y) {
    let best = null;
    let bestArea = Infinity;
    for (const el of document.elementsFromPoint(x, y)) {
      if (isOurs(el) || el === document.documentElement || el === document.body) continue;
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > 0 && area < bestArea) {
        best = el;
        bestArea = area;
      }
    }
    return best;
  }

  function inScope(n) {
    return !st.scope || st.scope.some(c => c === n || c.contains(n));
  }

  function setRaw(el) {
    if (el === st.raw) return;
    st.raw = el;
    st.depth = 0;
    st.chain = [];
    for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (!inScope(n)) break;
      st.chain.push(n);
    }
    st.base = 0;
    if (st.mode === 'card' && el) {
      const i = st.chain.indexOf(PS.sel.snapToCard(el));
      if (i >= 0) st.base = i;
    }
    update();
  }

  function update() {
    const chain = st.chain || [];
    st.depth = Math.max(-st.base, Math.min(chain.length - 1 - st.base, st.depth));
    const el = chain.length ? chain[st.base + st.depth] : null;
    if (el !== st.current) {
      st.current = el;
      hoverGroup = st.mode === 'card' && el ? PS.sel.similar(el) : [];
    }
    schedule();
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function place(div, r) {
    div.style.left = r.left + 'px';
    div.style.top = r.top + 'px';
    div.style.width = r.width + 'px';
    div.style.height = r.height + 'px';
  }

  function draw() {
    frame = 0;
    if (!host) return;
    const vh = innerHeight;
    const vw = innerWidth;
    const list = [];
    for (const m of marks) list.push(m);
    for (const el of hoverGroup) if (el !== (st && st.current)) list.push({ el, kind: 'hover' });
    let used = 0;
    for (const m of list) {
      if (used >= MAX_BOXES) break;
      if (!m.el.isConnected) continue;
      const r = m.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw || !r.width) continue;
      let div = layer.children[used];
      if (!div) div = layer.appendChild(document.createElement('div'));
      div.className = 'm ' + m.kind;
      div.style.display = '';
      place(div, r);
      used++;
    }
    for (let i = used; i < layer.children.length; i++) layer.children[i].style.display = 'none';

    const cur = st && st.current;
    if (cur && cur.isConnected) {
      const r = cur.getBoundingClientRect();
      place(box, r);
      box.style.display = 'block';
      box.classList.toggle('below', r.top < 28);
      let text = PS.sel.describe(cur);
      if (st.mode === 'card') {
        text += `  ·  ${hoverGroup.length} similar on this page`;
      } else {
        const t = PS.values.clean(PS.extract.textOf(cur)).slice(0, 40);
        text += cur.tagName === 'IMG' ? '  ·  image' : t ? `  ·  "${t}"` : '';
      }
      label.textContent = text;
    } else {
      box.style.display = 'none';
    }
  }

  // ---------- events ----------

  function onMove(e) {
    const el = underPointer(e.clientX, e.clientY);
    setRaw(el && inScope(el) ? el : null);
  }

  function swallow(e) {
    if (!st || isOurs(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onClick(e) {
    if (!st || isOurs(e.target)) return;
    swallow(e);
    onMove(e); // pick what's under the click even if no mousemove arrived first (touchpads, tap-to-click)
    if (st.current) st.onPick(st.current);
  }

  function onKey(e) {
    // Typing in the panel's inputs keeps its normal keys; only Esc still stops the picker.
    if (!st || (isOurs(e.target) && e.key !== 'Escape')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      const cb = st.onCancel;
      stop();
      if (cb) cb();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopImmediatePropagation();
      st.depth += e.key === 'ArrowUp' ? 1 : -1;
      update();
    } else if (e.key === 'Enter' && st.current) {
      e.preventDefault();
      e.stopImmediatePropagation();
      st.onPick(st.current);
    }
  }

  const BLOCKED = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'auxclick', 'contextmenu'];

  function start(opts) {
    stop();
    ensure();
    st = { mode: 'card', scope: null, hint: '', ...opts, raw: null, chain: [], base: 0, depth: 0, current: null };
    tip.innerHTML = `<b>${st.hint}</b><span><kbd>↑</kbd><kbd>↓</kbd> bigger / smaller</span><span><kbd>Esc</kbd> stop</span>`;
    tip.style.display = 'flex';
    if (!cursorStyle) {
      cursorStyle = document.createElement('style');
      cursorStyle.textContent = 'html[data-ps-picking], html[data-ps-picking] * { cursor: crosshair !important; }';
    }
    document.documentElement.appendChild(cursorStyle);
    document.documentElement.setAttribute('data-ps-picking', '');
    document.addEventListener('mousemove', onMove, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);
    for (const t of BLOCKED) window.addEventListener(t, swallow, true);
  }

  function stop() {
    if (!st) return;
    st = null;
    hoverGroup = [];
    document.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKey, true);
    for (const t of BLOCKED) window.removeEventListener(t, swallow, true);
    document.documentElement.removeAttribute('data-ps-picking');
    if (cursorStyle) cursorStyle.remove();
    if (tip) tip.style.display = 'none';
    schedule();
  }

  PS.picker = {
    start,
    stop,
    active: () => !!st,
    mode: () => st && st.mode,
    showMatches(list) {
      ensure();
      marks = list;
      schedule();
    },
    clearMatches() {
      marks = [];
      schedule();
    },
  };
})(window.__PS);
