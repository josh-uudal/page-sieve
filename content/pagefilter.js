// Hiding or dimming the site's own cards that don't pass the tracker's filters.
// Cards are only marked with an attribute; one injected style rule does the hiding, so removing the
// attribute (clear) puts every card back exactly as the site had it.
(function (PS) {
  const ATTR = 'data-ps-filter';
  const READING = 'data-ps-reading'; // on <html> while cards are being read: hidden cards are shown
  let style;

  function ensureStyle() {
    if (style && style.isConnected) return;
    style = document.createElement('style');
    style.textContent =
      `html:not([${READING}]) [${ATTR}="hide"] { display: none !important; }` +
      `[${ATTR}="dim"] { opacity: .2 !important; filter: grayscale(1) !important; }` +
      `[${ATTR}="dim"]:hover { opacity: .65 !important; }`;
    // On <html>, outside <body>, so the collector's MutationObserver never sees it.
    document.documentElement.appendChild(style);
  }

  // Runs fn() with hidden cards shown again, so they read the same as visible ones: the innerText of
  // an element that isn't rendered is its raw text, with no breaks between blocks ("Ch. 5" + "3 days
  // ago" -> "Ch. 53 days ago") and text the site hides included. It all happens in one go, before
  // the browser paints, so nothing flickers.
  function read(fn) {
    const html = document.documentElement;
    if (!document.querySelector(`[${ATTR}="hide"]`)) return fn();
    html.setAttribute(READING, '');
    try {
      return fn();
    } finally {
      html.removeAttribute(READING);
    }
  }

  // keep(card) -> true to leave the card alone. mode: 'hide' | 'dim'. Returns { hidden, total }.
  function apply(cards, keep, mode) {
    ensureStyle();
    // Read every card first, then mark them, so the page is laid out once rather than once per card.
    const keeps = read(() => cards.map(keep));
    const set = new Set(cards);
    for (const el of document.querySelectorAll(`[${ATTR}]`)) if (!set.has(el)) el.removeAttribute(ATTR);
    let hidden = 0;
    cards.forEach((card, i) => {
      if (keeps[i]) {
        if (card.hasAttribute(ATTR)) card.removeAttribute(ATTR);
      } else {
        hidden++;
        if (card.getAttribute(ATTR) !== mode) card.setAttribute(ATTR, mode);
      }
    });
    return { hidden, total: cards.length };
  }

  function clear() {
    for (const el of document.querySelectorAll(`[${ATTR}]`)) el.removeAttribute(ATTR);
  }

  PS.pageFilter = { apply, clear, read };
})(window.__PS);
