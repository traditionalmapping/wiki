// ============================================================================
//  CONTINENT FILTER for the video panels
//
//  - Every place in places.js gets its continent AUTOMATICALLY from its coordinates.
//  - A row of buttons at the bottom of the screen (All, Europe, Asia, ...) shows only
//    the panels of the chosen continent and moves the map to them.
//  - Only continents that actually have videos get a button.
//
//  Optional: if a place ends up on the wrong continent (the borders below are rough,
//  e.g. around Turkey, the Caucasus or the Urals), add  continent: 'Asia'  to that
//  place in places.js and it will be used instead.
// ============================================================================

// Rough outlines as [lng, lat] points. The first one that contains a place wins, so the
// order matters. Good enough for sorting videos; not meant as exact borders.
const CONTINENT_SHAPES = [
  { name: 'Europe', ring: [
    [-26, 67.2], [-13, 67.2], [-9, 72], [0, 76], [10, 81.5], [60, 82], [60, 55], [58, 51], [51, 50.5],
    [51, 46.5], [49, 44], [48.3, 41.7], [44.5, 42.6], [42.4, 43.2], [39.5, 43.4], [29.2, 41.3],
    [29, 40.9], [26.9, 40.3], [26, 39.95], [27.5, 37.5], [28.5, 36], [28.5, 34.3], [22, 34.3],
    [15, 35.3], [12.2, 37], [10.5, 37.9], [3, 38], [-4.5, 35.95], [-26, 35.95] ] },
  { name: 'Europe', ring: [[-32, 36.5], [-24.5, 36.5], [-24.5, 40], [-32, 40]] }, // Azores
  { name: 'Africa', ring: [
    [-26, -35.5], [-26, 37.5], [11, 37.5], [22, 34.5], [29, 32.3], [32.5, 31.7], [32.6, 30],
    [33.6, 28.4], [34.1, 27.5], [35.6, 25.5], [37.5, 21], [40.5, 15], [43.4, 12.6], [51.5, 12.2],
    [58, 12.2], [58, -35.5] ] },
  { name: 'Oceania', ring: [[112, -50], [112, -11], [130.2, -11], [130.2, 1], [131, 1], [131, 21], [180, 21], [180, -50]] },
  { name: 'Oceania', ring: [[-180, -50], [-180, 30], [-125, 30], [-125, -50]] }, // Hawaii, Polynesia
  { name: 'South America', ring: [
    [-112, -60], [-112, 3], [-82, 3], [-77.8, 7], [-77.3, 8.7], [-77.3, 13], [-25, 13], [-25, -60] ] },
  { name: 'North America', ring: [[-180, 0], [-180, 84], [-10, 84], [-10, 0]] },
  { name: 'Asia', ring: [[26, -11], [26, 82], [180, 82], [180, -11]] }
];

const CONTINENT_ORDER = ['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania', 'Other'];

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function detectContinent(lat, lng) {
  lng = ((lng + 540) % 360) - 180;
  for (const s of CONTINENT_SHAPES) {
    if (pointInRing(lng, lat, s.ring)) return s.name;
  }
  return 'Other';
}

// 'asia', 'ASIA', 'north america' ... -> 'Asia', 'North America'; unknown text -> null
function normalizeContinent(text) {
  const t = String(text || '').trim().toLowerCase();
  return CONTINENT_ORDER.find(c => c.toLowerCase() === t) || null;
}

function initContinents(map) {
  // Match each marker on the map with its entry in PLACES (same order, same skipped entries as markers.js)
  const els = [...document.querySelectorAll('.place')];
  const entries = [];
  PLACES.forEach(place => {
    const pos = parseLatLng(place.coords);
    const videos = (place.videos || []).filter(v => safeUrl(v.url));
    if (!pos || !videos.length) return;
    entries.push({
      pos,
      count: videos.length,
      continent: normalizeContinent(place.continent) || detectContinent(pos.lat, pos.lng)
    });
  });
  if (!entries.length) return;
  if (entries.length !== els.length) {
    console.warn('Continent filter: found ' + els.length + ' panels on the map but ' + entries.length +
      ' places in places.js; the filter is switched off.');
    return;
  }
  entries.forEach((e, i) => { e.el = els[i]; });

  // How many videos per continent
  const totals = {};
  entries.forEach(e => { totals[e.continent] = (totals[e.continent] || 0) + e.count; });
  const all = entries.reduce((n, e) => n + e.count, 0);

  const bar = document.createElement('div');
  bar.className = 'continents';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Filter videos by continent');
  document.body.append(bar);

  const buttons = {};
  function addButton(name, label, count) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    const c = document.createElement('span');
    c.className = 'count';
    c.textContent = count;
    b.append(c);
    b.addEventListener('click', () => select(name));
    bar.append(b);
    buttons[name] = b;
  }
  addButton('All', 'All', all);
  CONTINENT_ORDER.filter(c => totals[c]).forEach(c => addButton(c, c, totals[c]));

  function select(name) {
    Object.entries(buttons).forEach(([n, b]) => {
      b.classList.toggle('active', n === name);
      b.setAttribute('aria-pressed', String(n === name));
    });
    const shown = entries.filter(e => name === 'All' || e.continent === name);
    entries.forEach(e => e.el.classList.toggle('continent-hidden', !shown.includes(e)));

    const bounds = new maplibregl.LngLatBounds();
    shown.forEach(e => bounds.extend([e.pos.lng, e.pos.lat]));
    map.fitBounds(bounds, {
      padding: { top: 90, bottom: 120, left: 60, right: 60 },
      maxZoom: name === 'All' ? 5 : 6,
      duration: 1200
    });
  }

  // Start on "All" without moving the map (it already opens on Europe)
  buttons.All.classList.add('active');
  buttons.All.setAttribute('aria-pressed', 'true');
}