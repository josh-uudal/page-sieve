// Built-in documentation shown by the panel's "?" button.
// Examples marked with data-ex are clickable: they go into a filter box of the matching column type.
(function (PS) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // An example the reader can click to try. kind: number | date | text | global
  const ex = (expr, kind) => `<code class="ex" data-act="ex" data-ex="${esc(expr)}" data-kind="${kind}" title="Click to try">${esc(expr)}</code>`;
  const c = s => `<code>${esc(s)}</code>`;

  function rows(list) {
    return list.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
  }

  function html() {
    return `
<div class="help">
  <p class="lead">Page Sieve collects the fields you pick from catalog pages into one list you can sort and filter.
  <b>Click any <span class="exdemo">highlighted example</span> to try it on your list.</b></p>

  <nav class="toc">
    <a data-act="goto" data-to="h-start">Quick start</a>
    <a data-act="goto" data-to="h-pick">Picking</a>
    <a data-act="goto" data-to="h-list">The list</a>
    <a data-act="goto" data-to="h-filter">Filters</a>
    <a data-act="goto" data-to="h-page">Filter the page</a>
    <a data-act="goto" data-to="h-regex">Regex</a>
    <a data-act="goto" data-to="h-fields">Field settings</a>
    <a data-act="goto" data-to="h-calc">Derived columns</a>
    <a data-act="goto" data-to="h-data">Page data</a>
    <a data-act="goto" data-to="h-pages">Which pages</a>
    <a data-act="goto" data-to="h-trouble">Troubleshooting</a>
  </nav>

  <h2 id="h-start">Quick start</h2>
  <ol>
    <li>Open a catalog, search or browse page and click <b>New tracker</b>.</li>
    <li><b>Pick the card:</b> hover over any item. The highlight snaps to the whole card and the similar cards get a
      dashed outline. Click.</li>
    <li><b>Pick fields:</b> click the title first, then rating, chapters, status, cover… in any outlined card.
      Click <b>Done picking</b>, then <b>Save</b>.</li>
    <li>Keep browsing. Every matching page adds its items. No duplicates (items are matched by their link).</li>
  </ol>

  <h2 id="h-pick">Picking</h2>
  <table class="ht">${rows([
    ['Hover', 'Outlines what will be picked. Picking the card snaps to the whole card; picking fields follows the exact element.'],
    [`${c('↑')} / ${c('↓')}`, 'Make the highlight bigger (parent) or smaller (back toward what is under the mouse).'],
    [`Click or ${c('Enter')}`, 'Pick it. Field picking keeps going until you click Done picking.'],
    [c('Esc'), 'Stop picking.'],
  ])}</table>
  <p>The title should be the first field: its link identifies the item. Links, buttons and menus on the page don't
  react while you're picking.</p>

  <h2 id="h-list">The list</h2>
  <table class="ht">${rows([
    ['Tracker name', 'Switch trackers. Each one shows its item count, its page pattern, and "This page" if it collects here.'],
    ['Column header', 'Sort. Numbers and dates start high→low (newest first), text starts A→Z. Third click turns sorting off. Blank cells always go last.'],
    ['Box under a header', 'Filter that column. See Filters below.'],
    ['Top filter box', 'Searches every column at once. Accepts the same syntax as a text column, including /regex/.'],
    ['Row', 'Opens the item in a new tab. × removes it, and it won\'t be added again.'],
    ['Bar on a row', 'That item is on the page you are looking at.'],
    ['⋯ menu', 'New / Edit tracker, Export CSV / JSON (exports what the filters show, in the shown order), Clear list, Delete.'],
    ['Page: Off / Dim / Hide', `Apply your filters to the site's own cards. <b>Dim</b> fades the cards that don't match, <b>Hide</b> removes them from view. Items you removed with × count as not matching. See <a data-act="goto" data-to="h-page">Filter the page</a>.`],
    ['Collecting', 'Turn off to browse without adding items.'],
    ['Minimize, move, resize', 'Minimize to a small counter you can drag anywhere (click it to expand). Drag the header to move the panel; drag the bottom-right corner to resize.'],
  ])}</table>

  <h2 id="h-filter">Filters</h2>
  <p>Each column decides how its filter box reads what you type. A column counts as a <b>number</b> column when most
  cells contain a number (${c('★ 4.6')}, ${c('Ch. 213')}, ${c('1.2M views')}, ${c('1,234')}), as a <b>date</b> column
  when most cells are dates (${c('3 days ago')}, ${c('Oct 12, 2025')}), otherwise as <b>text</b>. You can force a type in
  Field settings. All column filters must match (AND). Filters are saved per tracker.</p>

  <h3>Number columns</h3>
  <table class="ht">${rows([
    [ex('>4.5', 'number'), 'greater than (also <code>&lt;</code> <code>&gt;=</code> <code>&lt;=</code>)'],
    [ex('100..300', 'number'), 'between, inclusive'],
    [ex('100..', 'number') + ' ' + ex('..50', 'number'), 'at least / at most'],
    [ex('213', 'number') + ' ' + ex('!=0', 'number'), 'equals / not equal'],
    [ex('>=1M', 'number'), 'K, M, B suffixes and 1,234 commas work'],
  ])}</table>

  <h3>Date columns</h3>
  <table class="ht">${rows([
    [ex('<7d', 'date'), 'newer than 7 days (units: h d w m y — m = month)'],
    [ex('>3m', 'date'), 'older than 3 months'],
    [ex('1d..2w', 'date'), 'between 1 day and 2 weeks old'],
    [ex('>2025-01-01', 'date'), 'after a calendar date'],
    [ex('2025-01-01..2025-06-30', 'date'), 'between two dates'],
  ])}</table>

  <h3>Text columns (and the top box)</h3>
  <table class="ht">${rows([
    [ex('dragon', 'text'), 'contains (not case-sensitive)'],
    [ex('!hiatus', 'text'), "doesn't contain"],
    [ex('"dragon chef"', 'text'), 'phrase with spaces'],
    [ex('="Ongoing"', 'text'), 'exactly equals'],
    [ex('iron tower', 'text'), 'both words, anywhere (space = AND)'],
  ])}</table>

  <h3>Any column</h3>
  <table class="ht">${rows([
    [ex('/^the \\w+ dragon/i', 'text'), 'regular expression (see below)'],
    [ex('!/isekai|harem/i', 'text'), "doesn't match the regex"],
    [ex('empty', 'text') + ' ' + ex('!empty', 'text'), 'cell is blank / has a value'],
    [ex('Ongoing | Hiatus', 'text'), '<code>|</code> with spaces around it = OR'],
    [ex('>3 <4.5', 'number'), 'space = AND'],
  ])}</table>
  <p>A filter box turns red while its regex is incomplete, and it hides nothing until the regex is valid.</p>

  <h2 id="h-page">Filter the page itself</h2>
  <p>The <b>Page</b> switch next to the search box applies the same filters to the cards on the site:</p>
  <table class="ht">${rows([
    ['Off', 'The site is left alone (default).'],
    ['Dim', 'Cards that fail your filters fade to grey; hover one to see it better.'],
    ['Hide', `Cards that fail your filters disappear, so the site's list shows only matches.`],
  ])}</table>
  <p>Cards of items you removed with × are dimmed/hidden too. It works on infinite-scroll pages as new cards load, and
  even with Collecting turned off. The status line says how many cards are hidden. The page goes back to normal when
  you clear the filters, set Page to <b>Off</b>, or close the panel (minimizing keeps it on). It pauses while you edit
  a tracker so you can pick any card. The setting is saved per tracker.</p>

  <h2 id="h-regex">Regex in 60 seconds</h2>
  <p>Write a regex as ${c('/pattern/')}. Add ${c('i')} after it for not case-sensitive: ${c('/pattern/i')}.</p>
  <table class="ht">${rows([
    [c('.'), 'any character'],
    [`${c('\\d')} ${c('\\w')} ${c('\\s')}`, 'a digit / a letter, digit or _ / a space'],
    [`${c('+')} ${c('*')} ${c('?')}`, 'one or more / zero or more / optional (applies to what is before it)'],
    [`${c('{2,4}')}`, 'between 2 and 4 of the thing before it'],
    [`${c('^')} ${c('$')}`, 'start / end of the text'],
    [`${c('a|b')}`, 'a or b'],
    [`${c('[abc]')} ${c('[^abc]')}`, 'one of these characters / any character except these'],
    [`${c('( )')}`, 'group; in Field settings the first group is what gets kept'],
    [c('\\.'), 'a literal dot (put \\ before any of . + * ? ( ) [ ] { } ^ $ | / to mean the character itself)'],
  ])}</table>
  <p>Examples: ${ex('/^the /i', 'text')} starts with "the" · ${ex('/\\d{3,}/', 'text')} has a number with 3+ digits ·
  ${ex('/(fantasy|isekai)/i', 'text')} either word.</p>

  <h2 id="h-fields">Field settings</h2>
  <p>In <b>⋯ → Edit this tracker</b>, the settings button (sliders) next to a field opens its settings. Changes apply to items you already
  collected too.</p>
  <table class="ht">${rows([
    ['<b>Type</b> Auto', 'Shows the text as it is; sorts and filters by the number or date inside it if there is one.'],
    ['<b>Type</b> Number', `Shows just the number: ${c('Ch. 213')} → ${c('213')}, ${c('1.2M views')} → ${c('1,200,000')}.`],
    ['<b>Type</b> Date', `Treats the value as a date (${c('3 days ago')}, ${c('2025-03-01')}) for sorting and date filters.`],
    ['<b>Type</b> Text', 'Never treated as a number (e.g. a title like "86" or "1984").'],
    ['<b>Extract</b> (regex)', 'Keeps only part of the text: the first ( group ), or the whole match if there is no group. If it does not match, the cell is blank.'],
  ])}</table>
  <p>Extract examples (no slashes here; always not case-sensitive):</p>
  <table class="ht">${rows([
    [c('Ch\\.\\s*(\\d+)'), `${c('Vol. 3 Ch. 45')} → ${c('45')}`],
    [c('(\\d+)\\s*views'), `${c('Rank 2 · 900 views')} → ${c('900')}`],
    [c('by (.+)'), `${c('by Jane Doe')} → ${c('Jane Doe')}`],
    [c('^([^,]+)'), `${c('Action, Fantasy')} → ${c('Action')} (text before the first comma)`],
    [c('(\\d+(?:\\.\\d+)?)\\s*/\\s*10'), `${c('Score 8.7/10')} → ${c('8.7')}`],
  ])}</table>

  <h2 id="h-calc">Derived columns</h2>
  <p>A derived column is worked out from other columns instead of picked from the page. In <b>⋯ → Edit this tracker</b>,
  click <b>Derived column</b> and write a formula; click a column name under the box to insert it. It sorts and
  filters like any number column, and it's worked out again whenever the list is shown.</p>
  <table class="ht">${rows([
    [c('{Views} / {Chapters}'), 'views per chapter'],
    [c('{Follows} / {Views} * 100'), 'follows as a percentage of views'],
    [c('({Rating} - 3) * {Reviews}'), '<code>+ - * /</code> and parentheses'],
    [c('today - {Updated}'), 'days since the last update (date columns count in days)'],
    [c('{Updated} - {Started}'), 'days between two dates'],
  ])}</table>
  <p>Put column names in ${c('{ }')}; case doesn't matter. A cell is blank when a column it uses is blank or has no
  number, or when dividing by 0. A derived column can use any picked column and the derived columns above it.
  Renaming a column in the editor updates the formulas that use it.</p>

  <h2 id="h-data">Page data</h2>
  <p>Many sites load more about each item than they show: dates, funding source, coordinates, or details that
  only appear when you click a row. In <b>⋯ → Edit this tracker</b>, <b>Page data</b> lists the fields the site
  loaded for the cards on this page. Click one to add it as a column; no clicking through items needed.</p>
  <p>Cards are matched to their data automatically, by an id that shows up in the card (a contract number, or
  the id in its link). The box says which field it used and how many cards matched. Page data columns have the
  usual Type and Extract settings, and derived columns can use them.</p>
  <p class="mut">It reads only what the site already loaded, as JSON, and sends no requests of its own. If nothing
  shows up, reload the page or go to the next page so the site loads its list again.</p>

  <h2 id="h-pages">Which pages it collects from</h2>
  <p>Each tracker is for one site and a page pattern, set in step 3 of the editor:</p>
  <table class="ht">${rows([
    [c('/search/**'), '/search and everything below it (/search/page/2, …). Query strings like ?page=3 are ignored.'],
    [c('/list/*/top'), '* = exactly one path part: /list/2024/top, /list/all/top'],
    [c('/**'), 'the whole site'],
  ])}</table>

  <h2 id="h-trouble">Troubleshooting</h2>
  <table class="ht">${rows([
    ['"No cards found on this page"', 'This page is laid out differently. Use ⋯ → Edit → Re-pick card here, or narrow the page pattern.'],
    ['A column shows the wrong value for some items', 'Some cards are missing a part, so the position shifts. Re-pick that field on a card that has everything, or add an Extract regex.'],
    ['A number column sorts like text', 'Set its Type to Number, or add an Extract regex that keeps just the number.'],
    ['Two different items merged', 'They share the same link. Pick the title (with its link) as the first field.'],
    ['Nothing happens on a page', 'Browser pages (chrome://, the Web Store) can\'t run extensions. On other tabs, reload once after installing.'],
  ])}</table>
  <p class="mut">Data stays in this browser (extension storage). Export CSV/JSON to keep a copy.</p>
</div>`;
  }

  PS.help = { html };
})(window.__PS);
