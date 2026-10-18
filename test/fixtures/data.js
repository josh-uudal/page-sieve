// Deterministic fake catalog: 40 made-up series.
window.FAKE_SERIES = (function () {
  const A = ['Moonlit', 'Silent', 'Crimson', 'Last', 'Wandering', 'Iron', 'Hidden', 'Paper', 'Ninth', 'Frozen'];
  const B = ['Archivist', 'Swordsmith', 'Lantern', 'Dragon Chef', 'Cartographer', 'Tower', 'Alchemist', 'Library', 'Duelist', 'Garden'];
  const STATUS = ['Ongoing', 'Completed', 'Hiatus'];
  const GENRES = ['Action', 'Fantasy', 'Romance', 'Comedy', 'Drama', 'Mystery', 'Slice of Life', 'Isekai'];
  const UPD = ['2 hours ago', '5 hours ago', '1 day ago', '3 days ago', '1 week ago', '2 weeks ago', '1 month ago', '3 months ago'];
  const out = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 40; i++) {
    out.push({
      id: 100 + i,
      title: `The ${A[i % 10]} ${B[(i * 3 + Math.floor(i / 10)) % 10]}`,
      rating: i === 5 ? null : Math.round((3 + rnd() * 2) * 100) / 100,
      chapters: Math.floor(5 + rnd() * 400),
      views: Math.floor(rnd() * 2500) * 1000 + 500,
      status: STATUS[Math.floor(rnd() * 3)],
      updated: UPD[Math.floor(rnd() * UPD.length)],
      genres: [GENRES[i % 8], GENRES[(i + 3) % 8]],
      hue: Math.floor(rnd() * 360),
    });
  }
  return out;
})();

window.coverURI = function (s) {
  const initials = s.title.split(' ').slice(1).map(w => w[0]).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="170"><rect width="120" height="170" fill="hsl(${s.hue},55%,45%)"/><text x="60" y="95" font-size="34" text-anchor="middle" fill="#fff" font-family="sans-serif">${initials}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
};

window.fmtViews = n => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n));

// One catalog card. Hashed class names on purpose (css-…, sc-…), plus a "stretched link" that covers
// the whole card like many real sites use.
window.cardHTML = function (s, extraClass) {
  const rating = s.rating == null ? '' : `<span class="rating">★ ${s.rating}</span>`;
  return `<article class="series-card css-9x2kq1 ${extraClass || ''}">
    <a class="cover sc-f8KqP2" href="series.html?id=${s.id}"><img src="${coverURI(s)}" alt=""></a>
    <div class="info">
      <a class="title" href="series.html?id=${s.id}">${s.title}</a>
      <div class="stats">${rating}<span>Ch. ${s.chapters}</span><span>${fmtViews(s.views)} views</span></div>
      <div class="meta"><span class="status">${s.status}</span><span class="updated">Updated ${s.updated}</span></div>
      <div class="genres">${s.genres.map(g => `<a href="#genre-${g}">${g}</a>`).join('')}</div>
    </div>
    <a class="stretched" href="series.html?id=${s.id}" aria-label="${s.title}"></a>
  </article>`;
};
