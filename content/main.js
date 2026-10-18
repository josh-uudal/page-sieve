// Bootstrap: load this site's trackers, collect cards from the current page, keep collecting as the
// page changes (infinite scroll, client-side navigation), and wire up the toolbar toggle.
(function (PS) {
  if (PS.booted) return;
  PS.booted = true;

  const host = location.host;
  const app = (PS.app = {
    recipes: [], // trackers for this host
    pageStats: {}, // recipeId -> { cards, added } for the current URL
    pageKeys: new Set(), // recipeId|itemKey seen on the current URL
    matches: r => r.host === host && PS.sel.compilePattern(r.pathPattern).test(location.pathname),
    refresh,
  });

  let observer = null;
  let timer = 0;
  let collecting = false;
  let again = false;

  async function collect() {
    if (collecting) {
      again = true;
      return;
    }
    collecting = true;
    let changed = false;
    try {
      for (const r of app.recipes) {
        if (!r.collecting || !app.matches(r)) continue;
        const cards = PS.sel.findCards(r.card);
        const items = PS.pageFilter.read(() => cards.map(c => PS.extract.item(c, r)).filter(Boolean));
        for (const it of items) app.pageKeys.add(r.id + '|' + it.key);
        const res = await PS.store.upsertItems(r.id, items);
        const prev = app.pageStats[r.id];
        if (res.added || res.changed || !prev || prev.cards !== cards.length) changed = true;
        app.pageStats[r.id] = { cards: cards.length, added: (prev ? prev.added : 0) + res.added };
      }
    } finally {
      collecting = false;
    }
    // Nothing new: the site may still have re-drawn its cards, so only mark them again.
    if (changed) PS.panel.update();
    else PS.panel.refilter();
    if (again) {
      again = false;
      collect();
    }
  }

  // At most one run per 600 ms. Not a debounce: on pages that never stop changing (tickers, ads,
  // carousels) a debounce never fires, and new cards would never be collected or filtered.
  function soon() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      collect();
    }, 600);
  }

  function watch() {
    // Also while collecting is paused: the panel still hides/dims cards that load later.
    const active = app.recipes.some(r => app.matches(r));
    if (active && !observer && document.body) {
      // Our own UI lives on <html>, outside <body>, so it never triggers this.
      observer = new MutationObserver(soon);
      observer.observe(document.body, { childList: true, subtree: true });
    } else if (!active && observer) {
      observer.disconnect();
      observer = null;
    }
  }

  // The site loaded more data: rows may now have values for their page data fields.
  PS.data.onRecords(() => {
    if (app.recipes.some(r => app.matches(r) && r.fields.some(PS.extract.isData))) soon();
    PS.panel.dataChanged();
  });

  async function refresh() {
    const all = await PS.store.getRecipes();
    app.recipes = Object.values(all)
      .filter(r => r.host === host)
      .sort((a, b) => (a.created || 0) - (b.created || 0));
    await collect();
    watch();
  }

  // Client-side navigation (SPA sites) doesn't reload the content script; notice URL changes instead.
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    app.pageStats = {};
    app.pageKeys = new Set();
    refresh().then(() => PS.panel.reload());
  }, 1000);

  PS.store.onChange(changes => {
    if (changes[PS.store.RECIPES]) {
      refresh().then(() => PS.panel.reload());
      return;
    }
    if (Object.keys(changes).some(k => k.startsWith('ps:items:'))) PS.panel.update();
  });

  chrome.runtime.onMessage.addListener(msg => {
    if (msg && msg.type === 'ps:toggle') PS.panel.toggle();
  });

  (async () => {
    await refresh();
    const ui = await PS.store.getUI();
    if (ui.open && ui.open[host]) PS.panel.show();
  })();
})(window.__PS);
