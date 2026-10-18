// The floating panel: tracker list (sortable, filterable table), the new/edit tracker wizard,
// and the built-in help. Lives in a shadow root so the site's CSS can't reach it.
(function (PS) {
  const S = {
    built: false,
    open: false,
    collapsed: false,
    view: 'list', // 'list' | 'wizard' | 'help'
    helpFrom: 'list',
    recipeId: null,
    items: {},
    sort: { col: null, dir: 0 },
    filter: '', // top box: all columns
    colFilters: {}, // { [column]: expression }
    filtersFor: null, // recipe id the filters above belong to
    errors: {}, // { [column | '*']: message } from the last filter compile
    pageMode: 'off', // apply filters to the site's own cards: 'off' | 'dim' | 'hide' (per tracker)
    pageResult: null, // { hidden, total } from the last time cards were hidden/dimmed
    removedKeys: new Set(), // items removed with × — hidden on the page too when pageMode is on
    menu: false,
    tmenu: false, // the tracker switcher is open
    counts: {}, // { [recipe id]: item count } for the tracker switcher
    // { id, card, cards, fields: [{ name, sel, attr, type, regex, key }], name, pattern, picking, open: Set<field> }
    wiz: null,
  };
  let host, root, panel, pill;
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  const esc = s =>
    String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  const STYLE = `
    :host { --bg:#fcfcfb; --fg:#1b1c1f; --mut:#6c6f75; --faint:#9a9ca1; --line:#e7e7e4; --soft:#f3f3f1; --hover:#ececea;
      --raised:#fff; --thumb:#cfd0cc; --acc:#2c4bd1; --accfg:#fff; --accsoft:#eef1fc; --danger:#c3352d; --ok:#1d7a4b; --warn:#9a5a06; --exbg:#eef1fc; --sel:#c3cefa;
      --shadow: 0 0 0 1px rgba(20,22,28,.07), 0 2px 4px rgba(20,22,28,.04), 0 12px 32px -6px rgba(20,22,28,.16),
        0 32px 64px -16px rgba(20,22,28,.14);
      --ui: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
      --display: "Segoe UI Variable Display", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
      --mono: ui-monospace, "Cascadia Mono", SFMono-Regular, Consolas, monospace;
      --scheme: light; }
    @media (prefers-color-scheme: dark) {
      :host { --bg:#18191c; --fg:#e9e9e6; --mut:#9a9da3; --faint:#6d7076; --line:#2a2c30; --soft:#202125; --hover:#2a2b30;
        --raised:#303137; --thumb:#44464c; --acc:#8ea6ff; --accfg:#0f1733; --accsoft:#1f2645; --danger:#f2867e; --ok:#5fcf95; --warn:#e6b45c; --exbg:#1f2645; --sel:#3d4f9e;
        --shadow: 0 0 0 1px rgba(255,255,255,.08), 0 12px 32px -6px rgba(0,0,0,.5), 0 32px 64px -16px rgba(0,0,0,.45);
        --scheme: dark; }
    }
    /* color-scheme set below, not on :host: the host's inline all:initial would override it there. */
    .panel, .pill { color-scheme: var(--scheme); }
    * { box-sizing: border-box; scrollbar-width: thin; scrollbar-color: var(--thumb) transparent; }
    button, input, select { font: inherit; color: inherit; letter-spacing: inherit; }
    :focus { outline: none; }
    /* Selected text: the browser default is a faint grey in the dark theme (and when the window isn't focused). */
    ::selection { background: var(--sel); color: var(--fg); }
    :focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }
    .i { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.5;
      stroke-linecap: round; stroke-linejoin: round; display: block; }

    .panel { position: relative; width: 460px; height: 500px; min-width: 320px; min-height: 180px;
      max-width: 96vw; max-height: 92vh; resize: both; overflow: hidden; display: flex; flex-direction: column;
      background: var(--bg); color: var(--fg); border-radius: 12px; box-shadow: var(--shadow);
      font: 13px/1.45 var(--ui); -webkit-font-smoothing: antialiased; }

    /* header */
    .hd { display: flex; align-items: center; gap: 2px; min-height: 46px; padding: 8px 8px 4px 14px;
      cursor: grab; user-select: none; }
    .hd:active { cursor: grabbing; }
    .ttl { font: 650 14px/1.3 var(--display); letter-spacing: -.005em; white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis; }
    .sp { flex: 1; }
    .ib { display: inline-grid; place-items: center; border: 0; background: none; width: 28px; height: 28px;
      border-radius: 7px; cursor: pointer; color: var(--mut); flex: none; padding: 0; transition: background .12s, color .12s; }
    .ib:hover { background: var(--hover); color: var(--fg); }
    .ib.on { color: var(--acc); }
    .ib.on:hover { background: var(--accsoft); }
    .tsel { display: flex; align-items: center; gap: 4px; min-width: 0; max-width: 280px; margin-left: -8px;
      padding: 4px 6px 4px 8px; border: 0; border-radius: 7px; background: none; cursor: pointer;
      font: 650 14px/1.3 var(--display); letter-spacing: -.005em; transition: background .12s; }
    .tsel:hover, .tsel[aria-expanded=true] { background: var(--hover); }
    .tsel span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tsel .i { color: var(--mut); transition: transform .15s; }
    .tsel[aria-expanded=true] .i { transform: rotate(180deg); }

    /* tracker switcher */
    .tmenu { position: absolute; left: 8px; top: 42px; z-index: 3; display: flex; flex-direction: column;
      width: min(320px, calc(100% - 16px)); max-height: calc(100% - 52px); overflow: auto; padding: 5px;
      background: var(--bg); border-radius: 10px; box-shadow: var(--shadow); }
    .tmenu[hidden] { display: none; }
    .tmenu hr { border: 0; border-top: 1px solid var(--line); margin: 5px -5px; }
    .topt { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; gap: 1px 8px; align-items: center;
      width: 100%; padding: 7px 10px 7px 8px; border: 0; border-radius: 7px; background: none; text-align: left; cursor: pointer; }
    .topt:hover, .topt:focus-visible { background: var(--soft); outline: none; }
    .topt .i { width: 14px; height: 14px; color: var(--acc); stroke-width: 2; }
    .topt .nm { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .topt.cur .nm { color: var(--acc); }
    .topt .sub { grid-column: 2 / 4; color: var(--mut); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; font-variant-numeric: tabular-nums; }
    .topt .here { font-size: 11px; font-weight: 600; color: var(--ok); }
    .topt.new .nm { color: var(--acc); font-weight: 550; }

    /* ⋯ menu */
    .menu { position: absolute; right: 10px; top: 42px; z-index: 3; display: flex; flex-direction: column; min-width: 184px;
      background: var(--bg); border-radius: 10px; padding: 5px; box-shadow: var(--shadow); }
    .menu[hidden] { display: none; }
    .menu button { text-align: left; border: 0; background: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; }
    .menu button:hover { background: var(--soft); }
    .menu hr { border: 0; border-top: 1px solid var(--line); margin: 5px -5px; }
    .danger { color: var(--danger) !important; }

    /* status + toolbar */
    .status { display: flex; flex-wrap: wrap; gap: 2px 12px; padding: 0 14px 10px; color: var(--mut); font-size: 12px; }
    .status b { color: var(--fg); font-weight: 600; font-variant-numeric: tabular-nums; }
    .status .new { color: var(--ok); font-weight: 600; }
    .status .warn { color: var(--warn); font-weight: 600; }
    .status .pmn { color: var(--acc); font-weight: 550; }
    .bar { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; padding: 0 12px 10px; }
    .search { position: relative; flex: 1 1 150px; min-width: 0; display: flex; align-items: center; }
    .search .i { position: absolute; left: 9px; color: var(--faint); pointer-events: none; }
    .search input { width: 100%; height: 30px; padding: 0 8px 0 30px; border: 1px solid transparent; border-radius: 8px;
      background: var(--soft); transition: background .12s, border-color .12s; }
    .search input:hover { background: var(--hover); }
    .search input:focus { background: var(--bg); border-color: var(--acc); box-shadow: 0 0 0 3px var(--accsoft); }
    .search input:not(:placeholder-shown):not(:focus) { background: var(--accsoft); }
    input::placeholder { color: var(--faint); opacity: 1; }

    .seg { display: inline-flex; align-items: center; height: 30px; padding: 2px; border-radius: 8px; background: var(--soft);
      font-size: 12px; flex: none; }
    .seg .lbl { padding: 0 5px 0 7px; color: var(--mut); }
    .seg label { position: relative; cursor: pointer; }
    .seg input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
    .seg label span { display: block; padding: 0 9px; line-height: 26px; border-radius: 6px; color: var(--mut);
      transition: background .12s, color .12s; }
    .seg label:hover span { color: var(--fg); }
    .seg input:checked + span { background: var(--raised); color: var(--fg); font-weight: 600;
      box-shadow: 0 0 0 1px rgba(20,22,28,.06), 0 1px 2px rgba(20,22,28,.14); }
    .seg.on input:checked + span { color: var(--acc); }
    .seg input:focus-visible + span { outline: 2px solid var(--acc); outline-offset: -1px; }

    .sw { display: inline-flex; align-items: center; gap: 7px; color: var(--mut); font-size: 12px; cursor: pointer;
      white-space: nowrap; flex: none; }
    .sw input { appearance: none; -webkit-appearance: none; position: relative; width: 28px; height: 16px; margin: 0;
      border-radius: 99px; background: var(--line); cursor: pointer; transition: background .15s; flex: none; }
    .sw input::before { content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%;
      background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform .15s; }
    .sw input:checked { background: var(--acc); }
    .sw input:checked::before { transform: translateX(12px); }
    .sw input:checked + span { color: var(--fg); }

    /* table */
    .tw { flex: 1; overflow: auto; border-top: 1px solid var(--line); }
    .tw table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .tw thead { position: sticky; top: 0; z-index: 2; background: var(--bg); }
    .tw th { text-align: left; font-weight: 550; padding: 9px 8px 5px; white-space: nowrap; user-select: none;
      color: var(--mut); font-size: 12px; }
    .tw th:first-child, .tw td:first-child { padding-left: 14px; }
    .tw th.num { text-align: right; }
    .tw th[data-sort] { cursor: pointer; transition: color .12s; }
    .tw th[data-sort]:hover, .tw th.sorted { color: var(--fg); }
    .tw th .arr { display: inline-block; vertical-align: -2px; margin-left: 3px; color: var(--acc); }
    .tw th .arr .i { width: 12px; height: 12px; stroke-width: 1.75; }
    .tw tr.flt th { padding: 0 3px 8px; font-weight: 400; box-shadow: inset 0 -1px var(--line); }
    .tw tr.flt th:first-child { padding-left: 10px; }
    .tw tr.flt input { width: 100%; min-width: 56px; height: 24px; padding: 0 7px; font-size: 11.5px;
      border: 1px solid transparent; border-radius: 6px; background: var(--soft); transition: background .12s, border-color .12s; }
    .tw tr.flt input:hover { background: var(--hover); }
    .tw tr.flt input:focus { background: var(--bg); border-color: var(--acc); }
    .tw tr.flt input:not(:placeholder-shown):not(:focus) { background: var(--accsoft); color: var(--acc); font-weight: 600; }
    input.bad, .tw tr.flt input.bad, .search input.bad { border-color: var(--danger) !important; color: var(--danger) !important; }
    .tw th.x, .tw td.x { width: 32px; padding: 0 8px 0 2px; }
    .tw td { height: 38px; padding: 4px 8px; border-bottom: 1px solid var(--line); max-width: 220px; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
    .tw td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .tw tbody tr:last-child td { border-bottom: 0; }
    tr.row { cursor: pointer; }
    tr.row:hover td { background: var(--soft); }
    tr.here td:first-child { box-shadow: inset 2px 0 var(--acc); }
    .tw td img { width: 22px; height: 31px; object-fit: cover; border-radius: 3px; display: block;
      box-shadow: 0 0 0 1px rgba(0,0,0,.08); }
    .rm { display: grid; place-items: center; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px;
      background: none; color: var(--faint); cursor: pointer; opacity: 0; }
    .rm .i { width: 14px; height: 14px; }
    tr.row:hover .rm, .rm:focus-visible { opacity: 1; }
    .rm:hover { color: var(--danger); background: var(--hover); }

    /* footer */
    .ft { display: flex; gap: 4px 14px; align-items: center; flex-wrap: wrap; padding: 8px 14px; font-size: 12px;
      color: var(--mut); border-top: 1px solid var(--line); }
    .ft b { color: var(--fg); font-weight: 600; }
    .ft .lg { display: inline-flex; align-items: center; gap: 6px; }
    .ft .lg::before { content: ""; width: 2px; height: 12px; border-radius: 1px; background: var(--acc); }
    .ft .err { color: var(--danger); flex-basis: 100%; }
    .link { border: 0; background: none; color: var(--acc); cursor: pointer; padding: 0; font-size: 12px; font-weight: 550; }
    .link:hover { text-decoration: underline; text-underline-offset: 2px; }

    /* empty state */
    .empty { padding: 10px 18px 22px; color: var(--mut); }
    .empty h2 { margin: 0 0 6px; color: var(--fg); font: 650 15px/1.35 var(--display); letter-spacing: -.005em; }
    .empty p { margin: 0 0 16px; max-width: 46ch; }
    .empty .row2 { gap: 14px; }

    /* buttons */
    .btn { display: inline-flex; align-items: center; gap: 6px; height: 30px; border: 0; background: var(--soft);
      padding: 0 12px; border-radius: 8px; cursor: pointer; font-weight: 550; box-shadow: inset 0 0 0 1px var(--line);
      transition: background .12s, filter .12s; }
    .btn:hover { background: var(--hover); }
    .btn.primary { background: var(--acc); color: var(--accfg); box-shadow: 0 1px 2px rgba(20,22,28,.18); }
    .btn.primary:hover { filter: brightness(1.1); }
    .btn:disabled { opacity: .4; cursor: default; filter: none; }
    .btn.on { color: var(--acc); background: var(--accsoft); box-shadow: none; }
    .btn.sm { height: 26px; padding: 0 10px; font-size: 12px; border-radius: 7px; }
    .btn.ghost { background: none; box-shadow: none; color: var(--mut); padding: 0 8px 0 4px; margin-left: -6px; gap: 2px; }
    .btn.ghost:hover { background: var(--hover); color: var(--fg); }

    /* wizard */
    .wiz { flex: 1; overflow: auto; padding: 0 16px 8px; }
    .step { position: relative; padding: 12px 0 16px 32px; }
    .step + .step { border-top: 1px solid var(--line); }
    .step.off { opacity: .4; pointer-events: none; }
    .step h3 { margin: 0 0 3px; font-size: 13px; font-weight: 650; }
    .n { position: absolute; left: 0; top: 11px; display: grid; place-items: center; width: 20px; height: 20px;
      border-radius: 50%; font-size: 11px; font-weight: 650; color: var(--mut); box-shadow: inset 0 0 0 1.5px var(--line);
      font-variant-numeric: tabular-nums; }
    .step.cur .n { background: var(--acc); color: var(--accfg); box-shadow: none; }
    .step.done .n { background: var(--accsoft); color: var(--acc); box-shadow: none; }
    .step.done .n .i { width: 12px; height: 12px; stroke-width: 2.25; }
    .hint { margin: 0 0 10px; color: var(--mut); font-size: 12px; max-width: 62ch; }
    .hint .i.inl { display: inline-block; width: 13px; height: 13px; vertical-align: -2px; }
    .row2 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .ok { display: inline-flex; align-items: center; gap: 6px; color: var(--ok); font-weight: 550; font-size: 12px; }
    .ok.live::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor;
      animation: ps-pulse 1.4s ease-in-out infinite; }
    @keyframes ps-pulse { 50% { opacity: .25; } }
    .warn { color: var(--warn); font-size: 12px; }
    .fields { display: flex; flex-direction: column; gap: 4px; margin: 2px 0 10px; }
    .fields:empty { display: none; }
    .fields { position: relative; }
    .fitem { border-radius: 8px; }
    .fitem.moving { position: relative; z-index: 1; background: var(--bg); box-shadow: var(--shadow); }
    .fitem .fset { margin-left: 26px; }
    .field { display: grid; grid-template-columns: 18px 112px 1fr 28px 28px; gap: 4px 8px; align-items: center; }
    .grip { display: grid; place-items: center; width: 18px; height: 28px; padding: 0; border: 0; border-radius: 5px;
      background: none; color: var(--faint); cursor: grab; touch-action: none; }
    .grip:hover { color: var(--fg); background: var(--hover); }
    .fitem.moving .grip { cursor: grabbing; color: var(--acc); }
    .field input { width: 100%; height: 28px; padding: 0 8px; border: 1px solid transparent; border-radius: 7px;
      background: var(--soft); font-weight: 550; }
    .field input:hover, label.lb + input:hover { background: var(--hover); }
    .field input:focus, label.lb + input:focus, .fset input:focus, .fset select:focus { background: var(--bg);
      border-color: var(--acc); }
    .samples { color: var(--mut); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fset { display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; align-items: center; margin: 2px 0 6px;
      padding: 10px 12px; background: var(--soft); border-radius: 8px; font-size: 12px; }
    .fset label { color: var(--mut); }
    .fset select, .fset input { height: 26px; padding: 0 7px; border: 1px solid var(--line); border-radius: 6px;
      background: var(--bg); width: 100%; }
    .fset input { font-family: var(--mono); font-size: 11.5px; }
    .fset .note { grid-column: 2; color: var(--mut); font-size: 11.5px; }
    .fset .note.err { color: var(--danger); }
    .dbox { margin: 2px 0 10px; padding: 8px; border-radius: 8px; background: var(--soft); font-size: 12px; }
    .dbox .dh { padding: 2px 6px 6px; color: var(--mut); }
    .dbox .dh b { color: var(--fg); font-weight: 600; }
    .dlist { display: flex; flex-direction: column; max-height: 230px; overflow: auto; }
    .drow { display: grid; grid-template-columns: minmax(96px, 38%) minmax(0, 1fr) 16px; gap: 10px; align-items: center;
      padding: 5px 6px; border: 0; border-radius: 6px; background: none; text-align: left; cursor: pointer; }
    .drow:hover, .drow:focus-visible { background: var(--hover); outline: none; }
    .drow .dk, .drow .dv { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .drow .dk { font-weight: 600; }
    .drow .dv { color: var(--mut); font-variant-numeric: tabular-nums; }
    .drow .i { width: 14px; height: 14px; color: var(--acc); }
    .field.data input[data-role=fname] { box-shadow: inset 2px 0 var(--acc); }
    .chips { grid-column: 2; display: flex; flex-wrap: wrap; gap: 4px; }
    .chip { height: 22px; padding: 0 8px; border: 0; border-radius: 99px; background: var(--bg); cursor: pointer;
      font-size: 11.5px; box-shadow: inset 0 0 0 1px var(--line); transition: color .12s, box-shadow .12s; }
    .chip:hover { color: var(--acc); box-shadow: inset 0 0 0 1px var(--acc); }
    .field.calc .samples::before { content: "= "; }
    label.lb { display: block; font-size: 12px; color: var(--mut); margin: 8px 0 4px; }
    label.lb + input { width: 100%; height: 30px; padding: 0 10px; border: 1px solid transparent; border-radius: 8px;
      background: var(--soft); }
    code { font: 11.5px var(--mono); background: var(--soft); padding: 1px 5px; border-radius: 4px; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--line); }

    /* help */
    .help { flex: 1; overflow: auto; padding: 0 18px 20px; font-size: 12.5px; line-height: 1.55; }
    .help h2 { font-size: 14px; font-weight: 650; margin: 24px 0 6px; letter-spacing: -.005em; }
    .help h3 { font-size: 12.5px; font-weight: 650; margin: 16px 0 4px; }
    .help p, .help ol { margin: 6px 0; max-width: 64ch; }
    .help ol { padding-left: 18px; }
    .help li { margin: 4px 0; padding-left: 2px; }
    .help .lead { margin-top: 2px; color: var(--mut); }
    .help .lead b { color: var(--fg); font-weight: 550; }
    .help .mut { color: var(--mut); }
    .help .toc { display: flex; flex-wrap: wrap; gap: 4px; margin: 12px 0 4px; }
    .help .toc a { color: var(--fg); cursor: pointer; font-size: 12px; padding: 3px 9px; border-radius: 99px;
      background: var(--soft); }
    .help .toc a:hover { background: var(--hover); }
    .help a[data-act=goto] { color: var(--acc); cursor: pointer; }
    .help .toc a[data-act=goto] { color: var(--fg); }
    .help table.ht { width: 100%; border-collapse: collapse; margin: 4px 0 10px; }
    .help table.ht td { padding: 6px 8px 6px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
    .help table.ht tr:last-child td { border-bottom: 0; }
    .help table.ht td:first-child { white-space: nowrap; width: 1%; padding-right: 14px; }
    .help code.ex, .help .exdemo { background: var(--exbg); color: var(--acc); cursor: pointer; border-radius: 4px; }
    .help code.ex:hover { box-shadow: 0 0 0 1px var(--acc); }
    .help .exdemo { padding: 0 4px; }

    /* minimized badge */
    .pill { display: none; align-items: center; gap: 7px; border: 0; background: var(--bg); color: var(--fg);
      border-radius: 999px; height: 34px; padding: 0 14px 0 11px; cursor: grab; box-shadow: var(--shadow); touch-action: none;
      user-select: none; white-space: nowrap; font: 650 13px/1 var(--ui); font-variant-numeric: tabular-nums; }
    .pill .i { color: var(--acc); }
    .pill:hover { background: var(--soft); }
    .pill.dragging { cursor: grabbing; }

    .toast { position: absolute; left: 50%; bottom: 52px; transform: translateX(-50%); background: var(--fg); color: var(--bg);
      padding: 7px 12px; border-radius: 8px; font-size: 12px; font-weight: 550; pointer-events: none; white-space: nowrap;
      box-shadow: 0 6px 16px rgba(0,0,0,.2); animation: ps-in .18s ease-out; }
    @keyframes ps-in { from { opacity: 0; transform: translate(-50%, 4px); } }
    @media (prefers-reduced-motion: reduce) {
      *, *::before { transition: none !important; animation: none !important; }
    }
    :host(.collapsed) .panel { display: none; }
    :host(.collapsed) .pill { display: inline-flex; }
  `;

  // Small stroked icons, so they look the same whatever fonts the site has.
  const ICONS = {
    help: '<circle cx="8" cy="8" r="6.25"/><path d="M6.3 6.2a1.75 1.75 0 0 1 3.4.6c0 1.2-1.7 1.4-1.7 2.6M8 11.6v.05"/>',
    min: '<path d="M4 8h8"/>',
    close: '<path d="M4.5 4.5l7 7m0-7l-7 7"/>',
    more: '<path d="M3.5 8h.01M8 8h.01M12.5 8h.01" stroke-width="2.4"/>',
    tune: '<path d="M2.5 5h6.5m3 0h1.5M2.5 11h1.5m3 0h6.5"/><circle cx="10.5" cy="5" r="1.5"/><circle cx="5.5" cy="11" r="1.5"/>',
    back: '<path d="M9.5 3.5L5 8l4.5 4.5"/>',
    search: '<circle cx="7" cy="7" r="4.25"/><path d="M10.25 10.25L13.5 13.5"/>',
    chev: '<path d="M4.5 6.5L8 10l3.5-3.5"/>',
    up: '<path d="M8 13V3.5M4 7.5l4-4 4 4"/>',
    down: '<path d="M8 3v9.5M4 8.5l4 4 4-4"/>',
    check: '<path d="M3.5 8.5l3 3 6-7"/>',
    list: '<path d="M6 4.5h7M6 8h7M6 11.5h7M3 4.5h.01M3 8h.01M3 11.5h.01"/>',
    plus: '<path d="M8 3.5v9M3.5 8h9"/>',
    grip: '<path d="M6 3.5h.01M10 3.5h.01M6 8h.01M10 8h.01M6 12.5h.01M10 12.5h.01" stroke-width="2.4"/>',
    data: '<ellipse cx="8" cy="4" rx="5" ry="2"/><path d="M3 4v8c0 1.1 2.24 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.24 2 5 2s5-.9 5-2"/>',
    calc: '<path d="M2.5 4.75h4.5M4.75 2.5v4.5M9 4.75h4.5M2.9 9.4l3.7 3.7m0-3.7l-3.7 3.7M9 10.25h4.5M9 12.75h4.5"/>',
  };
  const icon = name => `<svg class="i" viewBox="0 0 16 16" aria-hidden="true">${ICONS[name]}</svg>`;

  const PLACEHOLDER = { number: '>4.5  10..50', date: '<7d  >1m', text: 'word  !word  /re/', image: '' };
  const TIP = {
    number: 'Number filter:  >4.5   <=100   10..50   10..   213   !=0   >=1.2M\nAlso: /regex/   empty   !empty\nSpace = AND, " | " = OR. Full guide: ? button.',
    date: 'Date filter:  <7d (newer than 7 days)   >1m (older than a month)   1d..2w   >2025-01-01\nUnits: h d w m y\nAlso: /regex/   empty   !empty. Full guide: ? button.',
    text: 'Text filter:  word (contains)   !word (not)   "a phrase"   ="Exact"   /regex/i   !/regex/\nempty   !empty   Space = AND, " | " = OR. Full guide: ? button.',
  };

  // ---------- data ----------

  const recipes = () => PS.app.recipes;
  const current = () => recipes().find(r => r.id === S.recipeId) || null;
  const orderedCols = r => [...r.fields.filter(f => f.attr === 'src'), ...r.fields.filter(f => f.attr !== 'src')];

  function pickRecipe() {
    const list = recipes();
    if (list.some(r => r.id === S.recipeId)) return;
    const matching = list.find(r => PS.app.matches(r));
    S.recipeId = (matching || list[0] || {}).id || null;
  }

  async function loadItems() {
    const r = current();
    const all = r ? await PS.store.getItems(r.id) : {};
    S.items = {};
    S.removedKeys = new Set();
    for (const [k, it] of Object.entries(all)) {
      if (it.removed) S.removedKeys.add(k);
      else S.items[k] = it;
    }
    if (S.filtersFor !== S.recipeId) {
      const ui = await PS.store.getUI();
      const saved = (ui.filters && ui.filters[S.recipeId]) || {};
      S.colFilters = { ...(saved.cols || {}) };
      S.filter = saved.global || '';
      S.pageMode = (ui.pageMode && ui.pageMode[S.recipeId]) || 'off';
      S.filtersFor = S.recipeId;
    }
  }

  async function savePageMode() {
    const ui = await PS.store.getUI();
    await PS.store.setUI({ pageMode: { ...(ui.pageMode || {}), [S.recipeId]: S.pageMode } });
  }

  // Hide or dim the site's cards that fail the current filters (and items removed with ×).
  // Off while the tracker editor is open, on pages the tracker doesn't cover, and when the panel is closed.
  function applyToPage() {
    const r = current();
    if (!S.open || S.view === 'wizard' || !r || S.pageMode === 'off' || !PS.app.matches(r)) {
      PS.pageFilter.clear();
      S.pageResult = null;
      return;
    }
    const m = PS.filters.rowMatcher(S.colFilters, S.filter, derived(r).kinds);
    if (!m.active && !S.removedKeys.size) {
      PS.pageFilter.clear();
      S.pageResult = null;
      return;
    }
    const now = Date.now();
    S.pageResult = PS.pageFilter.apply(
      PS.sel.findCards(r.card),
      card => {
        const it = PS.extract.item(card, r);
        if (!it) return true;
        if (S.removedKeys.has(it.key)) return false;
        return !m.active || m.test(PS.extract.shownItem(it, r, now));
      },
      S.pageMode,
    );
  }

  let saveTimer;
  function saveFilters() {
    clearTimeout(saveTimer);
    const id = S.recipeId;
    const data = { cols: { ...S.colFilters }, global: S.filter };
    saveTimer = setTimeout(async () => {
      const ui = await PS.store.getUI();
      await PS.store.setUI({ filters: { ...(ui.filters || {}), [id]: data } });
    }, 400);
  }

  // Items with values parsed per the tracker's field settings, plus each column's kind.
  // Cached until the items or the field settings change.
  let cache = {};
  function derived(r) {
    const key = r.id + JSON.stringify(r.fields.map(f => [f.name, f.attr, f.type, f.regex, f.formula]));
    if (cache.items === S.items && cache.key === key) return cache;
    const now = Date.now();
    const rows = Object.values(S.items).map(it => ({ it, vals: PS.extract.shownItem(it, r, it.seenAt || it.firstSeen, now) }));
    const kinds = {};
    for (const f of r.fields) {
      kinds[f.name] =
        f.attr === 'src' ? 'image'
        : PS.extract.isCalc(f) ? 'number'
        : f.type && f.type !== 'auto' ? f.type
        : PS.filters.columnKind(rows.map(x => x.vals[f.name]));
    }
    cache = { items: S.items, key, rows, kinds };
    return cache;
  }

  function visibleRows() {
    const r = current();
    if (!r) return { list: [], total: 0, kinds: {} };
    const d = derived(r);
    const m = PS.filters.rowMatcher(S.colFilters, S.filter, d.kinds);
    S.errors = m.errors;
    let list = m.active ? d.rows.filter(x => m.test(x.vals)) : d.rows;
    const { col, dir } = S.sort;
    if (col && dir && d.kinds[col]) {
      const numeric = d.kinds[col] === 'number' || d.kinds[col] === 'date';
      const val = x => {
        const v = x.vals[col];
        if (!v) return null;
        return numeric ? v.num : v.display || v.raw || null;
      };
      list = list.slice().sort((a, b) => {
        const av = val(a);
        const bv = val(b);
        if (av == null && bv == null) return 0;
        if (av == null) return 1; // blanks always last
        if (bv == null) return -1;
        return (numeric ? av - bv : collator.compare(av, bv)) * dir;
      });
    }
    return { list, total: d.rows.length, kinds: d.kinds };
  }

  const activeFilterCount = () => Object.values(S.colFilters).filter(v => v && v.trim()).length + (S.filter.trim() ? 1 : 0);

  // ---------- export ----------

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    root.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const fileBase = r => (r.name || 'tracker').replace(/[^\w-]+/g, '_').slice(0, 40);
  const cellText = v => (!v ? '' : v.kind === 'image' ? v.src : v.display ?? v.raw);

  function exportCSV() {
    const r = current();
    if (!r) return;
    const q = s => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
    const lines = [[...r.fields.map(f => f.name), 'URL', 'First seen'].map(q).join(',')];
    for (const x of visibleRows().list) {
      const cells = r.fields.map(f => String(cellText(x.vals[f.name])));
      cells.push(x.it.url || '', new Date(x.it.firstSeen).toISOString());
      lines.push(cells.map(q).join(','));
    }
    download(fileBase(r) + '.csv', '﻿' + lines.join('\n'), 'text/csv;charset=utf-8');
  }

  function exportJSON() {
    const r = current();
    if (!r) return;
    const { list, kinds } = visibleRows();
    const data = list.map(x => {
      const o = {};
      for (const f of r.fields) {
        const v = x.vals[f.name];
        const k = kinds[f.name];
        o[f.name] = !v ? null : k === 'number' && v.num != null ? v.num : k === 'date' && v.num != null ? new Date(v.num).toISOString() : cellText(v);
      }
      return { ...o, url: x.it.url, firstSeen: new Date(x.it.firstSeen).toISOString() };
    });
    download(fileBase(r) + '.json', JSON.stringify(data, null, 2), 'application/json');
  }

  // ---------- rendering ----------

  function header(inner) {
    return `<div class="hd" data-drag>${inner}<span class="sp"></span>
      <button class="ib${S.view === 'help' ? ' on' : ''}" data-act="help" title="How to use" aria-label="How to use">${icon('help')}</button>
      <button class="ib" data-act="collapse" title="Minimize" aria-label="Minimize">${icon('min')}</button>
      <button class="ib" data-act="close" title="Close (Alt+Shift+T)" aria-label="Close">${icon('close')}</button></div>`;
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    panel.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  function render() {
    if (!S.built) return;
    host.classList.toggle('collapsed', S.collapsed);
    if (S.view === 'wizard') return renderWizard();
    if (S.view === 'help') return renderHelp();
    pickRecipe();
    const list = recipes();
    if (!list.length) {
      panel.innerHTML =
        header('<span class="ttl">Page Sieve</span>') +
        `<div class="empty">
          <h2>No tracker for this site yet</h2>
          <p>Click any item card on this page, then the parts of it you want to follow: title, rating, chapters,
          status. Every page you open on this site after that adds its items to a list here.</p>
          <div class="row2"><button class="btn primary" data-act="new">New tracker</button>
          <button class="link" data-act="help">Read the guide</button></div>
        </div>`;
      renderPill();
      return;
    }
    const r = current();
    const { kinds } = visibleRows();
    const cols = orderedCols(r);
    const filterCells = cols
      .map(f => {
        const k = kinds[f.name];
        if (k === 'image') return '<th aria-hidden="true"></th>';
        return `<th><input data-role="cf" data-col="${esc(f.name)}" value="${esc(S.colFilters[f.name] || '')}"
          placeholder="${esc(PLACEHOLDER[k])}" title="${esc(TIP[k])}" spellcheck="false" autocomplete="off"></th>`;
      })
      .join('');
    panel.innerHTML =
      header(`<button class="tsel" data-act="tmenu" aria-haspopup="listbox" aria-expanded="${S.tmenu}" title="Switch tracker">
          <span>${esc(r.name)}</span>${icon('chev')}</button>
        <button class="ib" data-act="menu" title="More" aria-label="More">${icon('more')}</button>`) +
      `<div class="tmenu" role="listbox" aria-label="Trackers" ${S.tmenu ? '' : 'hidden'}>${trackerOptions()}</div>
      <div class="menu" ${S.menu ? '' : 'hidden'}>
        <button data-act="new">New tracker…</button>
        <button data-act="edit">Edit this tracker…</button>
        <hr>
        <button data-act="csv">Export CSV</button>
        <button data-act="json">Export JSON</button>
        <hr>
        <button data-act="clear">Clear list</button>
        <button data-act="delete" class="danger">Delete tracker</button>
      </div>
      <div class="status"></div>
      <div class="bar">
        <label class="search">${icon('search')}<input type="search" placeholder="Search all columns" data-role="filter"
          value="${esc(S.filter)}" title="${esc(TIP.text)}" spellcheck="false" autocomplete="off" aria-label="Search all columns"></label>
        <div class="seg" role="radiogroup" aria-label="Filter the page"
          title="Apply your filters to the cards on the page itself.\nDim = fade cards that don't match, Hide = remove them from view.\nItems removed with × count as not matching. Close the panel or pick Off to restore the page.">
          <span class="lbl">Page</span>
          ${['off', 'dim', 'hide'].map(v => `<label><input type="radio" name="pagemode" data-role="pagemode" value="${v}"${S.pageMode === v ? ' checked' : ''}><span>${{ off: 'Off', dim: 'Dim', hide: 'Hide' }[v]}</span></label>`).join('')}
        </div>
        <label class="sw" title="Add items from pages you visit"><input type="checkbox" role="switch" data-role="collecting"${r.collecting ? ' checked' : ''}><span>Collecting</span></label>
      </div>
      <div class="tw"><table>
        <thead>
          <tr class="names">${cols.map(f => `<th data-sort="${esc(f.name)}" class="${kinds[f.name] === 'number' ? 'num' : ''}"></th>`).join('')}<th class="x"></th></tr>
          <tr class="flt">${filterCells}<th class="x"></th></tr>
        </thead>
        <tbody></tbody></table></div>
      <div class="ft"></div>`;
    renderData();
  }

  function renderData() {
    if (!S.built || S.view !== 'list') return;
    const r = current();
    renderPill();
    if (!r || !panel.querySelector('tbody')) return;
    const { list, total, kinds } = visibleRows();
    applyToPage();

    const status = panel.querySelector('.status');
    const stats = PS.app.pageStats[r.id];
    const pr = S.pageResult;
    const parts = [];
    if (!PS.app.matches(r)) {
      parts.push(`<span class="warn">Not collecting here.</span> This tracker covers <code>${esc(r.pathPattern)}</code>`);
    } else if (!r.collecting) {
      parts.push(`<span class="warn">Paused.</span> Turn on Collecting to add this page's items`);
    } else if (stats && stats.cards === 0) {
      parts.push(`<span class="warn">No cards found on this page.</span> If the layout differs here, use ⋯ → Edit to re-pick`);
    } else {
      parts.push(`<b>${stats ? stats.cards : 0}</b> cards on this page`);
      if (stats && stats.added) parts.push(`<span class="new">+${stats.added} new</span>`);
    }
    parts.push(`<b>${total}</b> saved`);
    if (pr && pr.hidden) parts.push(`<span class="pmn">${S.pageMode === 'hide' ? 'Hiding' : 'Dimming'} ${pr.hidden} of ${pr.total} on the page</span>`);
    status.innerHTML = parts.map(p => `<span>${p}</span>`).join('');
    panel.querySelector('.seg')?.classList.toggle('on', S.pageMode !== 'off');

    // Header names + sort arrows (updated in place so the filter inputs keep focus).
    for (const th of panel.querySelectorAll('th[data-sort]')) {
      const name = th.dataset.sort;
      const sorted = S.sort.col === name && S.sort.dir;
      const arr = sorted ? `<span class="arr">${icon(S.sort.dir > 0 ? 'up' : 'down')}</span>` : '';
      th.innerHTML = esc(name) + arr;
      const calc = r.fields.find(f => f.name === name && PS.extract.isCalc(f));
      th.title = `Sort by ${name} (${kinds[name] || 'text'})` + (calc ? `
= ${calc.formula}` : '');
      th.classList.toggle('sorted', !!sorted);
      th.classList.toggle('num', kinds[name] === 'number');
    }
    for (const inp of panel.querySelectorAll('input[data-role=cf]')) {
      const k = kinds[inp.dataset.col];
      if (k && inp.placeholder !== PLACEHOLDER[k]) {
        inp.placeholder = PLACEHOLDER[k];
        inp.title = TIP[k];
      }
      const err = S.errors[inp.dataset.col];
      inp.classList.toggle('bad', !!err);
      if (err) inp.title = err;
      else if (k) inp.title = TIP[k];
    }
    panel.querySelector('input[data-role=filter]').classList.toggle('bad', !!S.errors['*']);

    const cols = orderedCols(r);
    const here = PS.app.pageKeys;
    panel.querySelector('tbody').innerHTML = list
      .map(x => {
        const cells = cols
          .map(f => {
            const v = x.vals[f.name];
            if (!v) return '<td></td>';
            if (v.kind === 'image') return `<td><img src="${esc(v.src)}" loading="lazy" referrerpolicy="no-referrer" alt=""></td>`;
            const k = kinds[f.name];
            const num = (k === 'number' || k === 'date') && v.num != null;
            const shown = v.display ?? v.raw;
            return `<td class="${k === 'number' && num ? 'num' : ''}" title="${esc(shown)}">${esc(shown)}</td>`;
          })
          .join('');
        const cls = here.has(r.id + '|' + x.it.key) ? 'row here' : 'row';
        return `<tr class="${cls}" data-key="${esc(x.it.key)}">${cells}<td class="x"><button class="rm" data-act="rm" title="Remove (won't be added again)" aria-label="Remove">${icon('close')}</button></td></tr>`;
      })
      .join('');

    const n = activeFilterCount();
    const { col, dir } = S.sort;
    const order = { number: ['low to high', 'high to low'], date: ['oldest first', 'newest first'] }[kinds[col]] || ['A to Z', 'Z to A'];
    const errs = Object.entries(S.errors).map(([c, m]) => `<span class="err">${c === '*' ? 'Search' : esc(c)}: ${esc(m)}</span>`);
    panel.querySelector('.ft').innerHTML =
      `<span>${list.length === total ? `${total} items` : `<b>${list.length}</b> of ${total} items`}</span>` +
      (col && dir ? `<span>Sorted by ${esc(col)}, ${order[dir > 0 ? 0 : 1]}</span>` : '') +
      (n ? `<button class="link" data-act="clearf">Clear ${n} filter${n > 1 ? 's' : ''}</button>` : '') +
      (here.size ? '<span class="lg">On this page</span>' : '') +
      errs.join('');
  }

  // ---------- tracker switcher ----------

  const countText = id => {
    const n = id === S.recipeId ? Object.keys(S.items).length : S.counts[id];
    return n == null ? '…' : `${n} item${n === 1 ? '' : 's'}`;
  };

  function trackerOptions() {
    return (
      recipes()
        .map(x => {
          const cur = x.id === S.recipeId;
          return `<button class="topt${cur ? ' cur' : ''}" role="option" aria-selected="${cur}" data-act="pick" data-id="${esc(x.id)}">
            ${cur ? icon('check') : '<span></span>'}<span class="nm">${esc(x.name)}</span>
            ${PS.app.matches(x) ? '<span class="here" title="Collects on this page">This page</span>' : '<span></span>'}
            <span class="sub" data-count="${esc(x.id)}">${countText(x.id)} · ${esc(x.pathPattern)}</span></button>`;
        })
        .join('') +
      `<hr><button class="topt new" data-act="new">${icon('plus')}<span class="nm">New tracker…</span></button>`
    );
  }

  function setTrackerMenu(open) {
    S.tmenu = open;
    const box = panel.querySelector('.tmenu');
    const btn = panel.querySelector('.tsel');
    if (!box || !btn) return;
    btn.setAttribute('aria-expanded', open);
    if (!open) return box.setAttribute('hidden', '');
    box.innerHTML = trackerOptions();
    box.removeAttribute('hidden');
    (box.querySelector('.topt.cur') || box.querySelector('.topt')).focus();
    loadCounts();
  }

  // Item counts of the other trackers, filled in once read.
  async function loadCounts() {
    for (const x of recipes()) {
      if (x.id === S.recipeId) continue;
      const items = await PS.store.getItems(x.id);
      S.counts[x.id] = Object.values(items).filter(it => !it.removed).length;
      const sub = panel.querySelector(`.sub[data-count="${CSS.escape(x.id)}"]`);
      if (sub) sub.textContent = `${countText(x.id)} · ${x.pathPattern}`;
    }
  }

  async function switchTracker(id) {
    setTrackerMenu(false);
    if (id === S.recipeId) return panel.querySelector('.tsel')?.focus();
    S.recipeId = id;
    S.sort = { col: null, dir: 0 };
    await setActive(id);
    await loadItems();
    render();
    panel.querySelector('.tsel')?.focus();
  }

  // ↑ ↓ Home End move between options; Esc closes and returns to the button.
  function trackerMenuKey(e) {
    const opts = [...panel.querySelectorAll('.tmenu .topt')];
    const i = opts.indexOf(root.activeElement);
    const go = j => opts[(j + opts.length) % opts.length].focus();
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i < 0 ? -1 : i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(-1);
    else if (e.key === 'Escape' || e.key === 'Tab') {
      setTrackerMenu(false);
      if (e.key === 'Escape') panel.querySelector('.tsel')?.focus();
      if (e.key === 'Tab') return;
    } else return;
    e.preventDefault();
  }

  function renderPill() {
    const r = current();
    pill.innerHTML = `${icon('list')}<span>${r ? Object.keys(S.items).length : 0}</span>`;
    pill.title = `${r ? r.name + ' — ' : ''}click to expand, drag to move`;
  }

  function renderHelp() {
    panel.innerHTML =
      header(`<button class="btn sm ghost" data-act="helpback">${icon('back')}Back</button><span class="ttl">How to use</span>`) +
      PS.help.html();
  }

  // Put a clicked help example into a filter box of the matching column type.
  async function applyExample(expr, kind) {
    const r = current();
    if (r) {
      await loadItems();
      const { kinds } = visibleRows();
      const col = r.fields.find(f => kinds[f.name] === kind);
      if (col) S.colFilters[col.name] = expr;
      else if (kind === 'text') S.filter = expr;
      else {
        try {
          await navigator.clipboard.writeText(expr);
        } catch {}
        toast(`No ${kind} column in this tracker — copied "${expr}"`);
        return;
      }
      S.view = 'list';
      saveFilters();
      render();
      const target = col
        ? [...panel.querySelectorAll('input[data-role=cf]')].find(i => i.dataset.col === col.name)
        : panel.querySelector('input[data-role=filter]');
      if (target) target.focus();
      toast(col ? `Filtering ${col.name}: ${expr}` : `Searching: ${expr}`);
    } else {
      try {
        await navigator.clipboard.writeText(expr);
      } catch {}
      toast(`Copied "${expr}" — make a tracker first`);
    }
  }

  // ---------- wizard ----------

  function startWizard(recipe) {
    const cards = recipe ? PS.sel.findCards(recipe.card) : [];
    S.wiz = recipe
      ? {
          id: recipe.id,
          card: recipe.card,
          cards,
          fields: withKey(recipe.fields.map(f => (PS.extract.isCalc(f) ? { ...f } : { type: 'auto', regex: '', ...f }))),
          name: recipe.name,
          pattern: recipe.pathPattern,
          join: recipe.join || null,
          dataOpen: false,
          picking: null,
          open: new Set(),
        }
      : {
          id: null,
          card: null,
          cards: [],
          fields: [],
          name: '',
          pattern: PS.sel.suggestPattern(location.pathname),
          join: null,
          dataOpen: false,
          picking: null,
          open: new Set(),
        };
    S.view = 'wizard';
    S.menu = false;
    S.tmenu = false;
    S.collapsed = false;
    PS.pageFilter.clear(); // every card visible while picking
    render();
    showWizMarks();
    if (!recipe) pickCard();
  }

  function endWizard() {
    PS.picker.stop();
    PS.picker.clearMatches();
    S.wiz = null;
    S.view = 'list';
    render();
  }

  const picked = w => w.fields.filter(PS.extract.isPicked);

  function showWizMarks() {
    const w = S.wiz;
    if (!w) return PS.picker.clearMatches();
    const marks = w.cards.map(el => ({ el, kind: 'card' }));
    for (const f of picked(w)) {
      for (const c of w.cards) {
        const el = PS.sel.resolve(c, f.sel);
        if (el) marks.push({ el, kind: 'field' });
      }
    }
    PS.picker.showMatches(marks);
  }

  function pickCard() {
    const w = S.wiz;
    w.picking = 'card';
    PS.picker.start({
      mode: 'card',
      hint: 'Click one item card',
      onPick(el) {
        PS.picker.stop();
        w.card = PS.sel.cardSelector(el);
        w.cards = PS.sel.findCards(w.card);
        // Fields picked against an older card choice may not fit any more.
        w.fields = w.fields.filter(f => !PS.extract.isPicked(f) || w.cards.some(c => PS.sel.resolve(c, f.sel)));
        w.open = new Set();
        showWizMarks();
        pickFields();
      },
      onCancel() {
        w.picking = null;
        renderWizard();
      },
    });
    renderWizard();
  }

  function pickFields() {
    const w = S.wiz;
    w.picking = 'field';
    PS.picker.start({
      mode: 'field',
      scope: w.cards,
      hint: picked(w).length ? 'Click more parts of any outlined card' : 'Click the title of any outlined card',
      onPick: addField,
      onCancel() {
        w.picking = null;
        renderWizard();
      },
    });
    renderWizard();
  }

  function addField(el) {
    const w = S.wiz;
    const card = w.cards.find(c => c === el || c.contains(el));
    if (!card) return;
    const img = el.tagName !== 'IMG' && !PS.extract.textOf(el).trim() && el.querySelector('img');
    if (img) el = img;
    const sel = PS.sel.fieldSelector(card, el, w.cards);
    const attr = el.tagName === 'IMG' ? 'src' : 'text';
    if (w.fields.some(f => f.sel === sel && f.attr === attr)) return;
    const name = uniqueName(PS.extract.guessName(el, picked(w).length));
    w.fields.push({ name, sel, attr, type: 'auto', regex: '' });
    withKey(w.fields);
    showWizMarks();
    renderWizard();
  }

  // The field whose link identifies each item is marked `key`, so moving fields around doesn't change
  // which one it is. Older trackers didn't mark it: it was the first text field, so that one gets it.
  function withKey(fields) {
    if (!fields.some(f => f.key && PS.extract.isPicked(f) && f.attr !== 'src')) {
      const first = fields.find(f => PS.extract.isPicked(f) && f.attr !== 'src');
      if (first) first.key = true;
    }
    return fields;
  }

  function uniqueName(name) {
    const taken = new Set(S.wiz.fields.map(f => f.name.toLowerCase()));
    for (let i = 2, base = name; taken.has(name.toLowerCase()); i++) name = `${base} ${i}`;
    return name;
  }

  // The first sample cards' values for every column, as the list will show them.
  function sampleRows() {
    const w = S.wiz;
    const now = Date.now();
    return w.cards.slice(0, 3).map(c => PS.extract.shownValues(PS.extract.capture(c, w.fields, w.join), w.fields, now, now));
  }

  // A derived column, started as {A} / {B} from the first two number columns.
  function addCalc() {
    const w = S.wiz;
    const rows = sampleRows();
    const nums = w.fields.filter(f => !PS.extract.isCalc(f) && f.attr !== 'src' && rows.some(v => v[f.name] && v[f.name].kind === 'number'));
    const [a, b] = nums;
    const formula = a && b ? `{${a.name}} / {${b.name}}` : '';
    w.fields.push({ name: uniqueName(a && b ? `${a.name} / ${b.name}` : 'Derived'), formula });
    w.open.add(w.fields[w.fields.length - 1]);
    renderWizard();
    const inp = panel.querySelector(`input[data-role=fformula][data-i="${w.fields.length - 1}"]`);
    if (inp) {
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  }

  // Columns a derived column can use: every picked text column, and derived columns above it.
  const refNames = i =>
    S.wiz.fields.filter((g, j) => g.attr !== 'src' && (!PS.extract.isCalc(g) || j < i)).map(g => g.name);

  const formulaError = (f, i) => (f.formula.trim() ? PS.formula.compile(f.formula, refNames(i)).error : null);

  // ---------- moving fields ----------

  function moveField(from, to) {
    const w = S.wiz;
    if (to < 0 || to >= w.fields.length || to === from) return false;
    w.fields.splice(to, 0, ...w.fields.splice(from, 1));
    w.renaming = null;
    return true;
  }

  // Re-draws just the field list (the editor keeps its scroll position) and slides the other rows
  // from where they were to their new spots.
  function renderFields(moving) {
    const box = panel.querySelector('.fields');
    if (!box) return;
    const before = new Map([...box.children].map(el => [el.dataset.uid, el.offsetTop]));
    box.innerHTML = fieldsHtml(moving);
    for (const el of box.children) {
      const dy = (before.get(el.dataset.uid) ?? el.offsetTop) - el.offsetTop;
      if (!dy || el.classList.contains('moving')) continue;
      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
      el.offsetWidth; // start from the old spot
      el.style.transition = 'transform .16s ease';
      el.style.transform = '';
    }
  }

  // Drag a row by its grip: it follows the pointer and the others make room.
  function onGripDown(e) {
    const g = e.target.closest('.grip');
    if (!g || e.button !== 0 || !S.wiz) return;
    e.preventDefault();
    const f = S.wiz.fields[+g.dataset.i];
    const box = panel.querySelector('.fields');
    const scroller = panel.querySelector('.wiz');
    const row = () => box.querySelector(`.fitem[data-uid="${uid(f)}"]`);
    const grab = e.clientY - row().getBoundingClientRect().top;
    renderFields(f);
    const move = ev => {
      const sr = scroller.getBoundingClientRect();
      if (ev.clientY < sr.top + 28) scroller.scrollTop -= 10;
      else if (ev.clientY > sr.bottom - 28) scroller.scrollTop += 10;
      const el = row();
      const top = ev.clientY - box.getBoundingClientRect().top - grab; // where the row is being held
      const mid = top + el.offsetHeight / 2;
      const others = [...box.children].filter(x => x !== el);
      const to = others.filter(x => x.offsetTop + x.offsetHeight / 2 < mid).length;
      if (moveField(S.wiz.fields.indexOf(f), to)) renderFields(f);
      const now = row();
      now.style.transform = `translateY(${top - now.offsetTop}px)`;
    };
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      // Settle into its slot, then draw the list normally again.
      let settled = false;
      const settle = () => {
        if (settled || !box.isConnected) return;
        settled = true;
        renderFields();
        row()?.querySelector('.grip').focus();
      };
      const el = row();
      el.style.transition = 'transform .16s ease';
      el.style.transform = '';
      el.addEventListener('transitionend', settle, { once: true });
      setTimeout(settle, 250); // in case no transition ran
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  }

  // With a grip focused, ↑ / ↓ move that field.
  function gripKey(e) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const i = +e.target.dataset.i;
    const f = S.wiz.fields[i];
    if (!moveField(i, i + (e.key === 'ArrowUp' ? -1 : 1))) return;
    renderFields();
    panel.querySelector(`.fitem[data-uid="${uid(f)}"] .grip`).focus();
  }

  // Renaming a column keeps the derived columns that use it working.
  function renameRefs(from, to) {
    const low = from.trim().toLowerCase();
    S.wiz.fields.forEach((f, j) => {
      if (!PS.extract.isCalc(f)) return;
      f.formula = f.formula.replace(/\{([^}]*)\}/g, (m, n) => (n.trim().toLowerCase() === low ? `{${to}}` : m));
      const inp = panel.querySelector(`input[data-role=fformula][data-i="${j}"]`);
      if (inp && inp.value !== f.formula) inp.value = f.formula;
    });
    for (const chip of panel.querySelectorAll('.chip')) {
      if (chip.dataset.name === from) chip.dataset.name = chip.textContent = to;
    }
    S.wiz.fields.forEach((f, j) => PS.extract.isCalc(f) && updateFieldPreview(j));
  }

  // Sample values from the first cards, shown the way the list will show them (type + extract applied).
  function samples(f) {
    const now = Date.now();
    const vals = !PS.extract.isPicked(f)
      ? sampleRows().map(v => v[f.name])
      : S.wiz.cards.slice(0, 3).map(c => PS.extract.shown(PS.extract.field(c, f), f, now));
    return vals
      .map(v => (!v ? '—' : v.kind === 'image' ? '[image]' : trunc(v.display ?? v.raw, 28)))
      .join('  ·  ');
  }

  function regexError(src) {
    if (!src) return null;
    try {
      new RegExp(src, 'i');
      return null;
    } catch (e) {
      return e.message;
    }
  }

  function fieldNote(f, i) {
    if (PS.extract.isCalc(f)) {
      const err = formulaError(f, i);
      if (err) return `<span class="note err">⚠ ${esc(err)}</span>`;
      return '<span class="note">Use + - * / and ( ). Date columns count in days: <code>today - {Updated}</code> = days since. A blank input or dividing by 0 gives a blank cell.</span>';
    }
    const err = regexError(f.regex);
    if (err) return `<span class="note err">⚠ ${esc(err)} — ignored until fixed</span>`;
    if (f.regex) return '<span class="note">Keeps the first ( group ), or the whole match. No match = blank cell.</span>';
    return '<span class="note">Optional. Example: <code>Ch\\.\\s*(\\d+)</code> keeps 45 from "Vol. 3 Ch. 45".</span>';
  }

  // Derived columns depend on the others, so every column's samples are refreshed.
  function updateFieldPreview(i) {
    S.wiz.fields.forEach((g, j) => {
      const s = panel.querySelector(`.samples[data-i="${j}"]`);
      if (s) s.textContent = s.title = samples(g);
    });
    const f = S.wiz.fields[i];
    const note = panel.querySelector(`.fset[data-i="${i}"] .note`);
    if (note) note.outerHTML = fieldNote(f, i);
    const calc = PS.extract.isCalc(f);
    const inp = panel.querySelector(`input[data-role=${calc ? 'fformula' : 'fregex'}][data-i="${i}"]`);
    if (inp) inp.classList.toggle('bad', !!(calc ? formulaError(f, i) : regexError(f.regex)));
  }

  // Field rows get a stable id so a re-drawn list can slide rows from their old spots.
  const uids = new WeakMap();
  let uidN = 0;
  const uid = f => uids.get(f) || (uids.set(f, ++uidN), uidN);
  const fitemClass = (f, moving) => 'fitem' + (f === moving ? ' moving' : '');
  const grip = (f, i) =>
    `<button class="grip" data-role="grip" data-i="${i}" title="Drag to move (or ↑ ↓)" aria-label="Move ${esc(f.name)}: up or down arrow">${icon('grip')}</button>`;

  function fieldsHtml(moving) {
    const w = S.wiz;
    const types = ['auto', 'number', 'text', 'date'];
    const typeLabel = { auto: 'Auto', number: 'Number', text: 'Text', date: 'Date' };
    return w.fields
      .map((f, i) => {
        if (PS.extract.isCalc(f)) return calcRow(f, i, moving);
        const isImg = f.attr === 'src';
        const open = w.open.has(f) && !isImg;
        const s = samples(f);
        const set = open
          ? `<div class="fset" data-i="${i}">
              <label>Type</label>
              <select data-role="ftype" data-i="${i}">${types
                .map(t => `<option value="${t}"${(f.type || 'auto') === t ? ' selected' : ''}>${typeLabel[t]}</option>`)
                .join('')}</select>
              <label>Extract</label>
              <input data-role="fregex" data-i="${i}" value="${esc(f.regex || '')}" placeholder="regex, e.g. Ch\\.\\s*(\\d+)"
                spellcheck="false" autocomplete="off" class="${regexError(f.regex) ? 'bad' : ''}">
              ${fieldNote(f, i)}
            </div>`
          : '';
        const tuned = (f.type && f.type !== 'auto') || f.regex;
        const data = PS.extract.isData(f);
        const nameTip = f.key
          ? "Column name. This field's link identifies each item."
          : data ? `Column name. From the page's data: ${f.data}` : 'Column name';
        return `<div class="${fitemClass(f, moving)}" data-uid="${uid(f)}"><div class="field${data ? ' data' : ''}">
            ${grip(f, i)}
            <input data-role="fname" data-i="${i}" value="${esc(f.name)}" title="${nameTip}">
            <span class="samples" data-i="${i}" title="${esc(s)}">${esc(s)}</span>
            ${isImg ? '<span></span>' : `<button class="ib${open || tuned ? ' on' : ''}" data-act="fset" data-i="${i}" title="Field settings: type, extract regex" aria-label="Field settings" aria-expanded="${open}">${icon('tune')}</button>`}
            <button class="ib" data-act="fdel" data-i="${i}" title="Remove field" aria-label="Remove field">${icon('close')}</button>
          </div>${set}</div>`;
      })
      .join('');
  }

  // ---------- page data ----------

  // What the site loaded for these cards: how they're matched, and the fields that can be added.
  function dataBox() {
    const w = S.wiz;
    const wrap = inner => `<div class="dbox">${inner}</div>`;
    if (!PS.data.count()) {
      return wrap(`<div class="dh">No data seen on this page yet. It works on sites that load their lists as data,
        as most modern sites do. Reload the page (or go to the next page) so the site loads its list again.</div>`);
    }
    const j = PS.data.detectJoin(w.cards);
    if (!j) {
      return wrap(`<div class="dh">The site loaded data, but none of it matches these cards. Try the next page, or
        re-pick the card.</div>`);
    }
    w.join = j.path;
    const card = w.cards.find(c => PS.data.recordFor(c, j.path));
    const rec = card ? PS.data.recordFor(card, j.path) : {};
    const used = new Set(w.fields.filter(PS.extract.isData).map(f => f.data));
    const rows = Object.entries(rec)
      .filter(([path]) => !used.has(path))
      .map(
        ([path, v]) => `<button class="drow" data-act="adddata" data-path="${esc(path)}" title="Add ${esc(path)} as a column">
          <span class="dk">${esc(PS.data.label(path))}</span><span class="dv">${esc(trunc(v, 60))}</span>${icon('plus')}</button>`,
      )
      .join('');
    return wrap(`<div class="dh">Matched <b>${j.matched} of ${j.total}</b> cards by <code>${esc(j.path)}</code>.
      Click a field to add it as a column. Values shown are from the first card.</div>
      <div class="dlist">${rows || '<div class="dh">Every field is already a column.</div>'}</div>`);
  }

  function refreshData() {
    const w = S.wiz;
    if (!w || S.view !== 'wizard') return;
    const box = panel.querySelector('.dbox');
    if (box && w.dataOpen) box.outerHTML = dataBox();
    w.fields.forEach((f, j) => {
      const el = panel.querySelector(`.samples[data-i="${j}"]`);
      if (el && !PS.extract.isPicked(f)) el.textContent = el.title = samples(f);
    });
  }

  function addDataField(path) {
    const w = S.wiz;
    w.fields.push({ name: uniqueName(PS.data.label(path)), data: path, type: 'auto', regex: '' });
    renderFields();
    refreshData();
  }

  function renderWizard() {
    const w = S.wiz;
    if (!w) return;
    const n = w.cards.length;
    const cardDone = !!w.card && n > 0;
    const fieldsDone = picked(w).length > 0;
    const step = !cardDone ? 1 : !fieldsDone ? 2 : 3;
    const num = i => `<span class="n">${i < step ? icon('check') : i}</span>`;
    const cardRow =
      w.picking === 'card'
        ? `<button class="btn sm" data-act="stoppick">Cancel</button> <span class="ok live">Hover a card on the page and click it</span>`
        : `<button class="btn sm${cardDone ? '' : ' primary'}" data-act="pickcard">${cardDone ? 'Re-pick card' : 'Pick card'}</button>
           ${cardDone ? `<span class="ok">${n} card${n === 1 ? '' : 's'} found on this page</span>` : ''}
           ${w.card && !n ? '<span class="warn">No cards match on this page — re-pick.</span>' : ''}
           ${n === 1 ? '<span class="warn">Only 1 — press ↑ while picking to grab a bigger box.</span>' : ''}`;
    const scroll = panel.querySelector('.wiz')?.scrollTop;
    const fieldBtn =
      w.picking === 'field'
        ? '<button class="btn sm primary" data-act="stoppick">Done picking</button> <span class="ok live">Click parts of any outlined card</span>'
        : `<button class="btn sm" data-act="pickfields">${fieldsDone ? 'Pick more fields' : 'Pick fields'}</button>
           <button class="btn sm" data-act="addcalc"${fieldsDone ? '' : ' disabled'} title="A column worked out from other columns, like {Views} / {Chapters}">${icon('calc')}Derived column</button>
           <button class="btn sm${w.dataOpen ? ' on' : ''}" data-act="datatoggle"${cardDone ? '' : ' disabled'} aria-expanded="${w.dataOpen}" title="Details the site loaded for each card but doesn't show">${icon('data')}Page data</button>`;

    panel.innerHTML =
      header(`<span class="ttl">${w.id ? 'Edit tracker' : 'New tracker'}</span>`) +
      `<div class="wiz">
        <section class="step ${cardDone ? 'done' : 'cur'}">
          ${num(1)}<h3>Pick an item card</h3>
          <p class="hint">Hover anything in the list — the highlight snaps to the whole card and outlines the similar
          ones. Click to choose. <code>↑</code> <code>↓</code> make the box bigger or smaller.</p>
          <div class="row2">${cardRow}</div>
        </section>
        <section class="step ${cardDone ? '' : 'off'} ${step > 2 ? 'done' : step === 2 ? 'cur' : ''}">
          ${num(2)}<h3>Pick the fields to track</h3>
          <p class="hint">Click parts of any outlined card: the title first (its link identifies the item), then
          rating, chapters, status… Rename columns here, drag ${icon('grip').replace('class="i"', 'class="i inl"')} to reorder them; the sliders button
          sets a field's type or an extract regex. <b>Derived column</b> adds one worked out from the others, like views per chapter.</p>
          <div class="fields">${fieldsHtml()}</div>
          <div class="row2">${fieldBtn}</div>
          ${w.dataOpen ? dataBox() : ''}
        </section>
        <section class="step ${fieldsDone ? 'cur' : 'off'}">
          ${num(3)}<h3>Name it</h3>
          <label class="lb">Tracker name</label>
          <input data-role="wname" value="${esc(w.name)}" placeholder="${esc(defaultName())}">
          <label class="lb">Collect on pages of <code>${esc(location.host)}</code> matching</label>
          <input data-role="wpattern" value="${esc(w.pattern)}">
          <p class="hint" style="margin-top:6px"><code>*</code> = any one path part, <code>/**</code> at the end = this page and
          everything below it. <code>/**</code> alone = the whole site.</p>
        </section>
      </div>
      <div class="actions">
        <button class="btn" data-act="wcancel">Cancel</button>
        <button class="btn primary" data-act="wsave"${cardDone && fieldsDone ? '' : ' disabled'}>${w.id ? 'Save' : 'Save & start tracking'}</button>
      </div>`;
    if (scroll) panel.querySelector('.wiz').scrollTop = scroll;
  }

  function calcRow(f, i, moving) {
    const open = S.wiz.open.has(f);
    const s = samples(f);
    const chips = refNames(i)
      .map(n => `<button class="chip" data-act="fref" data-i="${i}" data-name="${esc(n)}" title="Insert {${esc(n)}}">${esc(n)}</button>`)
      .join('');
    const err = formulaError(f, i);
    const set = open
      ? `<div class="fset" data-i="${i}">
          <label>Formula</label>
          <input data-role="fformula" data-i="${i}" value="${esc(f.formula)}" placeholder="{Views} / {Chapters}"
            spellcheck="false" autocomplete="off" class="${err ? 'bad' : ''}">
          <span class="chips">${chips}</span>
          ${fieldNote(f, i)}
        </div>`
      : '';
    return `<div class="${fitemClass(f, moving)}" data-uid="${uid(f)}"><div class="field calc">
        ${grip(f, i)}
        <input data-role="fname" data-i="${i}" value="${esc(f.name)}" title="Column name">
        <span class="samples" data-i="${i}" title="${esc(s)}">${esc(s)}</span>
        <button class="ib on" data-act="fset" data-i="${i}" title="Formula" aria-label="Formula" aria-expanded="${open}">${icon('calc')}</button>
        <button class="ib" data-act="fdel" data-i="${i}" title="Remove column" aria-label="Remove column">${icon('close')}</button>
      </div>${set}</div>`;
  }

  function defaultName() {
    const t = (document.title || location.host).split(/[|\-–—]/)[0].trim();
    return t.slice(0, 40) || location.host;
  }

  async function saveWizard() {
    const w = S.wiz;
    if (!w || !w.card || !w.fields.length) return;
    const old = w.id && recipes().find(r => r.id === w.id);
    const recipe = {
      id: w.id || 'r' + Date.now().toString(36),
      host: location.host,
      pathPattern: w.pattern.trim() || '/**',
      name: w.name.trim() || defaultName(),
      card: w.card,
      fields: withKey(w.fields).map(f =>
        PS.extract.isCalc(f)
          ? { name: f.name.trim() || 'Derived', formula: f.formula.trim() }
          : { ...f, name: f.name.trim() || 'Field', regex: (f.regex || '').trim() },
      ),
      join: w.join || null,
      collecting: old ? old.collecting : true,
      created: old ? old.created : Date.now(),
    };
    S.recipeId = recipe.id;
    endWizard();
    await PS.store.saveRecipe(recipe);
    await setActive(recipe.id);
    await PS.app.refresh();
  }

  async function setActive(id) {
    const ui = await PS.store.getUI();
    await PS.store.setUI({ active: { ...(ui.active || {}), [location.host]: id } });
  }

  // ---------- events ----------

  async function onClick(e) {
    const t = e.target.closest('[data-act], th[data-sort], tr.row');
    const act = t && t.dataset.act;
    if (S.menu && act !== 'menu' && !e.target.closest('.menu')) {
      S.menu = false;
      panel.querySelector('.menu')?.setAttribute('hidden', '');
    }
    if (S.tmenu && act !== 'tmenu' && act !== 'pick' && !e.target.closest('.tmenu')) setTrackerMenu(false);
    if (!t) return;
    const r = current();
    if (t.matches('th[data-sort]')) {
      const col = t.dataset.sort;
      const k = r ? derived(r).kinds[col] : 'text';
      const first = k === 'number' || k === 'date' ? -1 : 1; // numbers/dates start high→low (newest), text A→Z
      if (S.sort.col !== col) S.sort = { col, dir: first };
      else if (S.sort.dir === first) S.sort.dir = -first;
      else S.sort = { col: null, dir: 0 };
      return renderData();
    }
    if (!act && t.matches('tr.row')) {
      const it = S.items[t.dataset.key];
      if (it && it.url) window.open(it.url, '_blank', 'noopener');
      return;
    }
    switch (act) {
      case 'close':
        return hide();
      case 'collapse':
        S.collapsed = true;
        PS.store.setUI({ collapsed: true });
        render();
        return reclamp();
      case 'tmenu':
        return setTrackerMenu(!S.tmenu);
      case 'pick':
        return switchTracker(t.dataset.id);
      case 'menu':
        S.menu = !S.menu;
        panel.querySelector('.menu')?.toggleAttribute('hidden', !S.menu);
        return;
      case 'help':
        if (S.view === 'help') {
          S.view = S.helpFrom;
          return render();
        }
        if (S.wiz && S.wiz.picking) {
          PS.picker.stop();
          S.wiz.picking = null;
        }
        S.helpFrom = S.view;
        S.view = 'help';
        return render();
      case 'helpback':
        S.view = S.helpFrom === 'wizard' && S.wiz ? 'wizard' : 'list';
        return render();
      case 'goto': {
        // Scroll only the help pane (scrollIntoView would also scroll the site's page).
        const box = panel.querySelector('.help');
        const target = panel.querySelector('#' + t.dataset.to);
        if (box && target) box.scrollTop = target.offsetTop - box.offsetTop - 6;
        return;
      }
      case 'ex':
        return applyExample(t.dataset.ex, t.dataset.kind);
      case 'clearf':
        S.colFilters = {};
        S.filter = '';
        saveFilters();
        return render();
      case 'new':
        return startWizard(null);
      case 'edit':
        return r && startWizard(r);
      case 'csv':
        return exportCSV();
      case 'json':
        return exportJSON();
      case 'clear':
        if (r && confirm(`Clear all ${Object.keys(S.items).length} items from "${r.name}"? The tracker itself is kept.`)) {
          await PS.store.clearItems(r.id);
        }
        return;
      case 'delete':
        if (r && confirm(`Delete the tracker "${r.name}" and its ${Object.keys(S.items).length} items?`)) {
          S.recipeId = null;
          await PS.store.deleteRecipe(r.id);
        }
        return;
      case 'rm': {
        e.stopPropagation();
        const key = t.closest('tr').dataset.key;
        if (r) await PS.store.removeItem(r.id, key);
        return;
      }
      case 'pickcard':
        return pickCard();
      case 'pickfields':
        return pickFields();
      case 'stoppick':
        PS.picker.stop();
        S.wiz.picking = null;
        return renderWizard();
      case 'fset': {
        const f = S.wiz.fields[+t.dataset.i];
        if (S.wiz.open.has(f)) S.wiz.open.delete(f);
        else S.wiz.open.add(f);
        return renderWizard();
      }
      case 'datatoggle':
        S.wiz.dataOpen = !S.wiz.dataOpen;
        return renderWizard();
      case 'adddata':
        return addDataField(t.dataset.path);
      case 'addcalc':
        return addCalc();
      case 'fref': {
        const i = +t.dataset.i;
        const inp = panel.querySelector(`input[data-role=fformula][data-i="${i}"]`);
        if (!inp) return;
        const ref = `{${t.dataset.name}}`;
        const a = inp.selectionStart ?? inp.value.length;
        const b = inp.selectionEnd ?? inp.value.length;
        inp.value = inp.value.slice(0, a) + ref + inp.value.slice(b);
        inp.focus();
        inp.setSelectionRange(a + ref.length, a + ref.length);
        S.wiz.fields[i].formula = inp.value;
        return updateFieldPreview(i);
      }
      case 'fdel':
        S.wiz.fields.splice(+t.dataset.i, 1);
        S.wiz.renaming = null;
        withKey(S.wiz.fields);
        showWizMarks();
        return renderWizard();
      case 'wcancel':
        return endWizard();
      case 'wsave':
        return saveWizard();
    }
  }

  function onInput(e) {
    const role = e.target.dataset.role;
    const i = +e.target.dataset.i;
    if (role === 'filter') {
      S.filter = e.target.value;
      saveFilters();
      renderData();
    } else if (role === 'cf') {
      S.colFilters[e.target.dataset.col] = e.target.value;
      saveFilters();
      renderData();
    } else if (role === 'fname') {
      // The name before this edit; formulas using it are updated when the edit is done (onChange).
      if (!S.wiz.renaming || S.wiz.renaming.i !== i) S.wiz.renaming = { i, from: S.wiz.fields[i].name };
      S.wiz.fields[i].name = e.target.value;
    } else if (role === 'fregex') {
      S.wiz.fields[i].regex = e.target.value;
      updateFieldPreview(i);
    } else if (role === 'fformula') {
      S.wiz.fields[i].formula = e.target.value;
      updateFieldPreview(i);
    } else if (role === 'wname') {
      S.wiz.name = e.target.value;
    } else if (role === 'wpattern') {
      S.wiz.pattern = e.target.value;
    }
  }

  async function onChange(e) {
    const role = e.target.dataset.role;
    if (role === 'collecting') {
      const r = current();
      if (!r) return;
      await PS.store.saveRecipe({ ...r, collecting: e.target.checked });
    } else if (role === 'pagemode') {
      S.pageMode = e.target.value;
      savePageMode();
      renderData();
    } else if (role === 'fname' && S.wiz && S.wiz.renaming) {
      const { i, from } = S.wiz.renaming;
      S.wiz.renaming = null;
      const to = S.wiz.fields[i] && S.wiz.fields[i].name;
      if (to != null && to !== from) renameRefs(from, to);
    } else if (role === 'ftype') {
      const i = +e.target.dataset.i;
      S.wiz.fields[i].type = e.target.value;
      updateFieldPreview(i);
    }
  }

  // Dragging by the header; position is remembered.
  function onDragStart(e) {
    const hd = e.target.closest('[data-drag]');
    if (!hd || e.button !== 0 || e.target.closest('button, select, input')) return;
    e.preventDefault();
    const rect = host.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    const move = ev => placeAt(ev.clientX - dx, ev.clientY - dy);
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      const r = host.getBoundingClientRect();
      PS.store.setUI({ pos: { x: r.left, y: r.top } });
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
  }

  // Visible area, not counting the page's scrollbars (innerWidth includes them).
  const viewW = () => document.documentElement.clientWidth || innerWidth;
  const viewH = () => document.documentElement.clientHeight || innerHeight;

  // Keep the whole panel (or badge) inside the window.
  function placeAt(x, y) {
    const w = host.offsetWidth || 460;
    const h = host.offsetHeight || 40;
    x = Math.max(0, Math.min(viewW() - w - 4, x));
    y = Math.max(0, Math.min(viewH() - h - 4, y));
    host.style.left = x + 'px';
    host.style.top = y + 'px';
  }

  // First placement: the saved spot, or top right. A tab that hasn't been laid out yet can report a
  // 0×0 window; then wait for the first resize instead of parking the panel in the corner.
  let pendingPos; // undefined = placed; null = default spot pending; { x, y } = saved spot pending
  function placeInitial(pos) {
    if (viewW() < 200 || viewH() < 150) {
      pendingPos = pos || null;
      return;
    }
    pendingPos = undefined;
    if (pos) placeAt(pos.x, pos.y);
    else placeAt(viewW() - host.offsetWidth - 20, 80);
    host.style.visibility = 'visible';
  }

  function reclamp() {
    if (pendingPos !== undefined) return placeInitial(pendingPos);
    const r = host.getBoundingClientRect();
    placeAt(r.left, r.top);
  }

  function build() {
    host = document.createElement('ps-panel');
    // Invisible until placeInitial() puts it in its spot: laid out (so it can be measured) but not shown.
    host.setAttribute('style', 'all:initial;position:fixed;z-index:2147483647;top:80px;left:0;display:block;visibility:hidden;');
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style><div class="panel"></div><button class="pill" data-act="expand"></button>`;
    panel = root.querySelector('.panel');
    pill = root.querySelector('.pill');
    // The minimized badge: drag to move it, click to expand. A drag doesn't count as a click.
    let pillDraggedAt = 0;
    pill.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const rect = host.getBoundingClientRect();
      const sx = e.clientX;
      const sy = e.clientY;
      let dragging = false;
      const move = ev => {
        if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
        dragging = true;
        pill.classList.add('dragging');
        placeAt(rect.left + ev.clientX - sx, rect.top + ev.clientY - sy);
      };
      const up = () => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        pill.classList.remove('dragging');
        if (!dragging) return;
        pillDraggedAt = Date.now();
        const r = host.getBoundingClientRect();
        PS.store.setUI({ pos: { x: r.left, y: r.top } });
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
    });
    pill.addEventListener('click', e => {
      e.stopPropagation();
      if (Date.now() - pillDraggedAt < 400) return;
      S.collapsed = false;
      PS.store.setUI({ collapsed: false });
      render();
      reclamp();
    });
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('pointerdown', onDragStart);
    root.addEventListener('pointerdown', onGripDown);
    root.addEventListener('keydown', e => {
      if (S.tmenu) trackerMenuKey(e);
      else if (e.target.dataset && e.target.dataset.role === 'grip') gripKey(e);
    });
    // Keep the site's keyboard shortcuts from firing while typing in the panel.
    for (const type of ['keydown', 'keyup', 'keypress']) {
      root.addEventListener(type, e => {
        if (e.key !== 'Escape' || !PS.picker.active()) e.stopPropagation();
      });
    }
    let sizeTimer;
    new ResizeObserver(() => {
      clearTimeout(sizeTimer);
      if (!panel.offsetWidth) return;
      sizeTimer = setTimeout(() => PS.store.setUI({ size: { w: panel.offsetWidth, h: panel.offsetHeight } }), 400);
    }).observe(panel);
    window.addEventListener('resize', () => S.open && reclamp());
    // A tab opened in the background may only get its real size once it's shown.
    document.addEventListener('visibilitychange', () => S.open && pendingPos !== undefined && reclamp());
    S.built = true;
  }

  async function show() {
    if (!S.built) build();
    if (!host.isConnected) document.documentElement.appendChild(host);
    const ui = await PS.store.getUI();
    const opening = !S.open;
    if (opening) {
      S.collapsed = !!ui.collapsed;
      if (ui.size) {
        panel.style.width = ui.size.w + 'px';
        panel.style.height = ui.size.h + 'px';
      }
      const active = ui.active && ui.active[location.host];
      if (active) S.recipeId = active;
    }
    S.open = true;
    if (opening) host.style.visibility = 'hidden'; // until placed, so it doesn't flash at its old spot
    host.style.display = 'block';
    pickRecipe();
    await loadItems();
    render();
    if (opening) {
      // Placed after rendering so the panel's real size is known.
      placeInitial(ui.pos);
    }
    if (!(ui.open || {})[location.host]) await PS.store.setUI({ open: { ...(ui.open || {}), [location.host]: true } });
  }

  async function hide() {
    if (S.view === 'wizard') endWizard();
    if (S.view === 'help') S.view = 'list';
    S.open = false;
    S.menu = false;
    S.tmenu = false;
    PS.pageFilter.clear(); // closing the panel puts the site's page back as it was
    S.pageResult = null;
    if (host) host.style.display = 'none';
    const ui = await PS.store.getUI();
    await PS.store.setUI({ open: { ...(ui.open || {}), [location.host]: false } });
  }

  let pending = false;
  PS.panel = {
    show,
    hide,
    toggle: () => (S.open ? hide() : show()),
    isOpen: () => S.open,
    // Coalesced refresh after collection or storage changes.
    update() {
      if (!S.open || pending) return;
      pending = true;
      Promise.resolve().then(async () => {
        pending = false;
        if (S.view !== 'list') return;
        const before = S.recipeId;
        pickRecipe();
        await loadItems();
        if (before !== S.recipeId || !panel.querySelector('tbody')) render();
        else renderData();
      });
    },
    // Mark the page's cards again (the site may have re-drawn them) without redrawing the list.
    // The site loaded more data (content/pagedata.js).
    dataChanged: refreshData,
    refilter() {
      if (!S.open || S.view !== 'list') return;
      const before = JSON.stringify(S.pageResult);
      applyToPage();
      if (JSON.stringify(S.pageResult) !== before) renderData();
    },
    // Recipes list changed (saved, deleted, toggled) — rebuild the header and filter row too.
    async reload() {
      if (!S.open || S.view !== 'list') return;
      pickRecipe();
      await loadItems();
      render();
    },
  };
})(window.__PS);
