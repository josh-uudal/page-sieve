// Test-only stand-in for the chrome.* APIs, so the real content scripts run inside a normal page.
// storage.local is backed by localStorage (shared across the fixture pages on the same origin).
// window.psToggle() simulates clicking the toolbar icon.
(function () {
  const PFX = 'psshim:';
  const changeListeners = [];
  const msgListeners = [];

  const read = k => {
    const v = localStorage.getItem(PFX + k);
    return v == null ? undefined : JSON.parse(v);
  };
  const fire = changes => setTimeout(() => changeListeners.forEach(fn => fn(changes, 'local')));

  const local = {
    async get(keys) {
      const list =
        keys == null
          ? Object.keys(localStorage).filter(k => k.startsWith(PFX)).map(k => k.slice(PFX.length))
          : [].concat(keys);
      const out = {};
      for (const k of list) {
        const v = read(k);
        if (v !== undefined) out[k] = v;
      }
      return out;
    },
    async set(obj) {
      const changes = {};
      for (const [k, v] of Object.entries(obj)) {
        changes[k] = { oldValue: read(k), newValue: v };
        localStorage.setItem(PFX + k, JSON.stringify(v));
      }
      fire(changes);
    },
    async remove(keys) {
      const changes = {};
      for (const k of [].concat(keys)) {
        changes[k] = { oldValue: read(k) };
        localStorage.removeItem(PFX + k);
      }
      fire(changes);
    },
  };

  window.addEventListener('storage', e => {
    if (!e.key || !e.key.startsWith(PFX)) return;
    const k = e.key.slice(PFX.length);
    changeListeners.forEach(fn => fn({ [k]: { newValue: e.newValue && JSON.parse(e.newValue) } }, 'local'));
  });

  const shim = {
    storage: { local, onChanged: { addListener: fn => changeListeners.push(fn) } },
    runtime: { onMessage: { addListener: fn => msgListeners.push(fn) } },
  };
  try {
    window.chrome = shim;
  } catch {}
  if (window.chrome !== shim) Object.defineProperty(window, 'chrome', { value: shim, configurable: true });

  window.psToggle = () => msgListeners.forEach(fn => fn({ type: 'ps:toggle' }, {}, () => {}));
  window.psReset = () => {
    Object.keys(localStorage).filter(k => k.startsWith(PFX)).forEach(k => localStorage.removeItem(k));
    location.reload();
  };
})();
