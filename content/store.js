// chrome.storage.local wrapper.
//   ps:recipes        { [id]: { id, host, pathPattern, name, card, fields: [{ name, sel, attr } | { name, formula } | { name, data }], join, collecting } }
//   ps:items:<id>     { [key]: { key, url, values: { [field]: { text } | { src } }, sourcePage, firstSeen, seenAt } }
//                     (insertion order = discovery order; seenAt = when these values were captured, so
//                     "3 days ago" is measured from then)
//                     removed items stay as { key, removed: true }; "Clear list" wipes those too
//   ps:ui             { open: {host: bool}, active: {host: id}, pos, size, collapsed }
(function (PS) {
  const area = chrome.storage.local;
  const RECIPES = 'ps:recipes';
  const UI = 'ps:ui';
  const itemsKey = id => 'ps:items:' + id;

  // Read-modify-write calls from this tab run one at a time.
  let queue = Promise.resolve();
  const serial = fn => (queue = queue.then(fn, fn));

  async function get(key, fallback) {
    const r = await area.get(key);
    return r[key] ?? fallback;
  }
  const set = (key, value) => area.set({ [key]: value });

  const same = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});

  PS.store = {
    itemsKey,
    RECIPES,

    getRecipes: () => get(RECIPES, {}),

    saveRecipe: recipe =>
      serial(async () => {
        const all = await get(RECIPES, {});
        all[recipe.id] = recipe;
        await set(RECIPES, all);
      }),

    deleteRecipe: id =>
      serial(async () => {
        const all = await get(RECIPES, {});
        delete all[id];
        await set(RECIPES, all);
        await area.remove(itemsKey(id));
      }),

    getItems: id => get(itemsKey(id), {}),

    // Adds new items and refreshes changed ones. Only writes when something changed, so
    // re-collecting the same page is free.
    upsertItems: (id, list) =>
      serial(async () => {
        const items = await get(itemsKey(id), {});
        const now = Date.now();
        let added = 0;
        let changed = 0;
        for (const it of list) {
          const old = items[it.key];
          if (old && old.removed) continue; // removed by the user — don't bring it back
          if (!old) {
            items[it.key] = { ...it, firstSeen: now, seenAt: now };
            added++;
          } else if (!same(old.values, { ...old.values, ...it.values }) || old.url !== it.url) {
            // Values missing from `it` (page data not loaded this time) keep what was saved.
            items[it.key] = { ...old, ...it, values: { ...old.values, ...it.values }, firstSeen: old.firstSeen, seenAt: now };
            changed++;
          }
        }
        if (added || changed) await set(itemsKey(id), items);
        return { added, changed };
      }),

    // Leaves a marker so the item isn't re-added the next time its page is visited.
    removeItem: (id, key) =>
      serial(async () => {
        const items = await get(itemsKey(id), {});
        items[key] = { key, removed: true };
        await set(itemsKey(id), items);
      }),

    clearItems: id => serial(() => set(itemsKey(id), {})),

    getUI: () => get(UI, {}),

    setUI: patch =>
      serial(async () => {
        const ui = await get(UI, {});
        await set(UI, { ...ui, ...patch });
      }),

    onChange(cb) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') cb(changes);
      });
    },
  };
})(window.__PS);
