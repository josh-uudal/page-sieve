// Runs in the page's own JavaScript world (manifest: "world": "MAIN", from document_start), because
// that is the only place the site's fetch / XMLHttpRequest responses can be seen. It never sends
// requests of its own: it reads JSON the site already loaded, picks out lists of records, and posts
// them to the extension's content scripts (content/pagedata.js).
(function () {
  if (window.__psNet) return;
  window.__psNet = true;

  const MAX_TEXT = 4e6; // skip very large responses
  const MAX_RECORDS = 2000;

  // Arrays of objects anywhere in the response, e.g. { data: { items: [ {...}, {...} ] } }.
  function findRecords(json, out = [], depth = 0) {
    if (depth > 4 || !json || typeof json !== 'object') return out;
    if (Array.isArray(json)) {
      const objs = json.filter(x => x && typeof x === 'object' && !Array.isArray(x));
      if (objs.length && objs.length >= json.length * 0.8) {
        out.push(objs.slice(0, MAX_RECORDS));
        for (const o of objs.slice(0, 3)) findRecords(o, out, depth + 1); // nested lists too
        return out;
      }
      for (const x of json.slice(0, 50)) findRecords(x, out, depth + 1);
      return out;
    }
    const vals = Object.values(json);
    for (const v of vals) findRecords(v, out, depth + 1);
    // A single record (a detail response) counts as a list of one.
    if (depth <= 2 && !out.length && vals.some(v => v != null && typeof v !== 'object')) out.push([json]);
    return out;
  }

  function handle(url, body) {
    let json = body;
    if (typeof body === 'string') {
      if (!body || body.length > MAX_TEXT) return;
      const c = body.trimStart()[0];
      if (c !== '{' && c !== '[') return;
      try {
        json = JSON.parse(body);
      } catch {
        return;
      }
    }
    if (!json || typeof json !== 'object') return;
    const lists = findRecords(json);
    if (!lists.length) return;
    const msg = { psNet: 1, url: String(url || ''), lists };
    keep(msg);
    post(msg);
  }

  function post(msg) {
    try {
      window.postMessage(msg, '*');
    } catch {}
  }

  // The extension's other scripts start once the page has loaded, after its first responses, so
  // recent ones are kept and sent again when they say hello.
  let kept = [];
  let keptCount = 0;
  function keep(msg) {
    kept.push(msg);
    keptCount += msg.lists.reduce((n, l) => n + l.length, 0);
    while (keptCount > 5000 && kept.length > 1) {
      keptCount -= kept[0].lists.reduce((n, l) => n + l.length, 0);
      kept.shift();
    }
  }
  window.addEventListener('message', e => {
    if (e.source === window && e.data && e.data.psNetHello === 1) for (const m of kept) post(m);
  });

  const skipType = ct => /event-stream|octet-stream|image\/|video\/|audio\/|font\//i.test(ct);

  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (...args) {
      const p = origFetch.apply(this, args);
      p.then(
        res => {
          if (!res || res.type === 'opaque' || skipType(res.headers.get('content-type') || '')) return;
          res
            .clone()
            .text()
            .then(t => handle(res.url, t), () => {});
        },
        () => {},
      );
      return p;
    };
  }

  const XHR = XMLHttpRequest.prototype;
  const origOpen = XHR.open;
  const origSend = XHR.send;
  XHR.open = function (method, url) {
    this.__psUrl = url;
    return origOpen.apply(this, arguments);
  };
  XHR.send = function () {
    this.addEventListener('load', () => {
      try {
        if (skipType(this.getResponseHeader('content-type') || '')) return;
        const rt = this.responseType;
        if (rt === '' || rt === 'text') handle(this.__psUrl, this.responseText);
        else if (rt === 'json') handle(this.__psUrl, this.response);
      } catch {}
    });
    return origSend.apply(this, arguments);
  };
})();
