// ============================================================================
//  COUNTRIES  (the "Videos / Countries" switch on the left panel)
//
//  In Countries mode the video panels disappear and a waving flag stands on
//  every capital. Click a flag (or a country in the left list) to open its
//  panel: flag, name + native name, government type and leaders with photos.
//
//  To add a country: copy one whole { ... } block below, paste it after the
//  last one (keep the comma between blocks) and change:
//    name        - English name
//    native      - name in its own language (leave '' if it is the same)
//    code        - 2-3 letters, only shown if the flag image fails to load
//    capital     - capital city name
//    coords      - "lat, lng" of the capital (the Copy button on the map)
//    government  - government type. Either plain text, or a list that changes
//                  with the date:  [ { from: '1933-03-23', text: '...' }, ... ]
//    flag        - the flag image (see "Images" below)
//    leaders     - list of { name, role, from, to, image }
//
//  The panel follows the year chosen with the Historical Borders year buttons
//  and shows what was true on that map's date (1 January, except 1939 =
//  1 September 1939 and 1945 = 5 June 1945; see borders.js).
//    from / to   - dates as 'YYYY-MM-DD' (or just 'YYYY'). A leader or government
//                  entry is shown if  from <= map date < to.  So "to" is the day
//                  they LEFT office. Leave "from" out if it is always true, and
//                  "to" out if it is still true at the end of the war.
//                  Optional years: '1933-1945' overrides the years shown.
//
//  Images: write either
//    wiki('File name.svg')     a file from Wikimedia Commons: open the file's
//                              page on commons.wikimedia.org and copy its name
//                              exactly (without the "File:" part), or
//    'img/flags/germany.png'   a file inside your site folder, or
//    'https://...'             any direct image link.
//  A missing or broken image never breaks anything: flags show the country
//  code, leaders show their initials.
// ============================================================================
const wiki = (file, width = 300) =>
  'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(file) + '?width=' + width;

const COUNTRIES = [
  {
    name: 'Germany',
    native: 'Deutsches Reich',
    code: 'DE',
    capital: 'Berlin',
    coords: '52.51568, 13.39247',
    government: [
      { to: '1945-05-23', text: 'Totalitarian one-party dictatorship (Nazi Germany)' },
      { from: '1945-05-23', text: 'Allied occupation, no German government (Berlin Declaration, 5 June 1945)' }
    ],
    flag: wiki('Flag of Germany (1935\u20131945).svg'),
    leaders: [
      { name: 'Adolf Hitler', role: 'F\u00FChrer and Chancellor', from: '1933-01-30', to: '1945-04-30', image: '' },
      { name: 'Dwight D. Eisenhower', role: 'Allied commander-in-chief (United States zone)', from: '1945-06-05', image: '' },
      { name: 'Georgy Zhukov', role: 'Allied commander-in-chief (Soviet zone)', from: '1945-06-05', image: '' },
      { name: 'Bernard Montgomery', role: 'Allied commander-in-chief (British zone)', from: '1945-06-05', image: '' },
      { name: 'Jean de Lattre de Tassigny', role: 'Allied commander-in-chief (French zone)', from: '1945-06-05', image: '' }
    ]
  },
  {
    name: 'United Kingdom',
    native: '',
    code: 'UK',
    capital: 'London',
    coords: '51.50735, -0.12776',
    government: 'Constitutional monarchy, parliamentary democracy',
    flag: wiki('Flag of the United Kingdom (3-5).svg'),
    leaders: [
      { name: 'George VI', role: 'King', from: '1936-12-11', to: '1952-02-06', image: '' },
      { name: 'Neville Chamberlain', role: 'Prime Minister', from: '1937-05-28', to: '1940-05-10', image: '' },
      { name: 'Winston Churchill', role: 'Prime Minister', from: '1940-05-10', to: '1945-07-26', image: '' },
      { name: 'Clement Attlee', role: 'Prime Minister', from: '1945-07-26', to: '1951-10-26', image: '' }
    ]
  },
  {
    name: 'Soviet Union',
    native: '\u0421\u043E\u044E\u0437 \u0421\u043E\u0432\u0435\u0442\u0441\u043A\u0438\u0445 \u0421\u043E\u0446\u0438\u0430\u043B\u0438\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0445 \u0420\u0435\u0441\u043F\u0443\u0431\u043B\u0438\u043A',
    code: 'SU',
    capital: 'Moscow',
    coords: '55.75040, 37.61734',
    government: 'One-party Marxist\u2013Leninist state',
    flag: wiki('Flag of the Soviet Union (1936\u20131955).svg'),
    leaders: [
      { name: 'Joseph Stalin', role: 'General Secretary of the Communist Party', from: '1922-04-03', to: '1941-05-06', image: '' },
      { name: 'Joseph Stalin', role: 'General Secretary of the Communist Party and Premier', from: '1941-05-06', to: '1953-03-05', image: '' },
      { name: 'Vyacheslav Molotov', role: 'Premier (Chairman of the Council of People\u2019s Commissars)', from: '1930-12-19', to: '1941-05-06', image: '' },
      { name: 'Mikhail Kalinin', role: 'Head of state (Chairman of the Presidium of the Supreme Soviet)', from: '1938-01-17', to: '1946-03-19', image: '' }
    ]
  },
  {
    name: 'United States',
    native: '',
    code: 'US',
    capital: 'Washington, D.C.',
    coords: '38.89511, -77.03637',
    government: 'Federal presidential constitutional republic',
    flag: wiki('Flag of the United States (1912\u20131959).svg'),
    leaders: [
      { name: 'Franklin D. Roosevelt', role: 'President', from: '1933-03-04', to: '1945-04-12', image: '' },
      { name: 'Harry S. Truman', role: 'President', from: '1945-04-12', to: '1953-01-20', image: '' }
    ]
  },
  {
    name: 'Japan',
    native: '\u5927\u65E5\u672C\u5E1D\u570B (Dai Nippon Teikoku)',
    code: 'JP',
    capital: 'Tokyo',
    coords: '35.68950, 139.69171',
    government: 'Constitutional monarchy under a militarist government',
    flag: wiki('Flag of Japan (1870\u20131999).svg'),
    leaders: [
      { name: 'Hirohito', role: 'Emperor', from: '1926-12-25', to: '1989-01-07', image: '' },
      { name: 'Nobuyuki Abe', role: 'Prime Minister', from: '1939-08-30', to: '1940-01-16', image: '' },
      { name: 'Mitsumasa Yonai', role: 'Prime Minister', from: '1940-01-16', to: '1940-07-22', image: '' },
      { name: 'Fumimaro Konoe', role: 'Prime Minister', from: '1940-07-22', to: '1941-10-18', image: '' },
      { name: 'Hideki Tojo', role: 'Prime Minister', from: '1941-10-18', to: '1944-07-22', image: '' },
      { name: 'Kuniaki Koiso', role: 'Prime Minister', from: '1944-07-22', to: '1945-04-07', image: '' },
      { name: 'Kantar\u014D Suzuki', role: 'Prime Minister', from: '1945-04-07', to: '1945-08-17', image: '' }
    ]
  },
  {
    name: 'Poland',
    native: 'Rzeczpospolita Polska',
    code: 'PL',
    capital: 'Warsaw',
    coords: '52.22970, 21.01220',
    government: 'Parliamentary republic under an authoritarian regime',
    flag: wiki('Flag_of_Poland_(1928–1980).svg'),
    leaders: [
      { name: 'Ignacy Mościcki', role: 'President', from: '1926-06-04', to: '1939-09-30', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Ignacy%20Mo%C5%9Bcicki%20(-1934).jpg?width=300' },
      { name: 'Edward Rydz-Śmigły', role: 'Marshal of Poland, Commander-in-Chief', from: '1939-09-01', to: '1939-09-17', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Edward_%C5%9Amig%C5%82y-Rydz_portrait,_1939.png?width=300' }
    ]
  },
  {
    name: 'France',
    native: 'République française',
    code: 'FR',
    capital: 'Paris',
    coords: '48.85347, 2.34835',
    government: 'Parliamentary republic under an authoritarian regime',
    flag: wiki('Flag_of_France.svg'),
    leaders: [
      { name: 'Ignacy Mościcki', role: 'President', from: '1926-06-04', to: '1939-09-30', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Ignacy%20Mo%C5%9Bcicki%20(-1934).jpg?width=300' },
      { name: 'Edward Rydz-Śmigły', role: 'Marshal of Poland, Commander-in-Chief', from: '1939-09-01', to: '1939-09-17', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Edward_%C5%9Amig%C5%82y-Rydz_portrait,_1939.png?width=300' }
    ]
  },
];

// ---------------------------------------------------------------------------
//  Everything below is code. You normally don't need to edit it.
//  Uses mk(), parseLatLng() and safeUrl() from js/markers.js.
// ---------------------------------------------------------------------------

// Image link from the data -> something safe to put in <img src>, or null
function countryImg(src) {
  const s = String(src || '').trim();
  if (!s) return null;
  if (/^https?:/i.test(s)) return safeUrl(s);
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? null : s;   // a path inside the site folder
}

// ---- What was true on the date of the selected map year ----
// 'YYYY' or 'YYYY-MM-DD' -> comparable 'YYYY-MM-DD'
const isoDay = d => /^\d{4}$/.test(String(d)) ? d + '-01-01' : String(d || '');

// The date the Historical Borders buttons stand on, or '' if borders.js is missing
function mapDate() {
  return (typeof borderIsoDate === 'function' && typeof selectedBorderYear !== 'undefined')
    ? borderIsoDate(selectedBorderYear) : '';
}
function mapDateLabel() {
  return (typeof borderDate === 'function' && typeof selectedBorderYear !== 'undefined')
    ? borderDate(selectedBorderYear) : '';
}

// from <= date < to ; with no date known, everything counts
const inEffect = (e, date) =>
  !date || ((!e.from || isoDay(e.from) <= date) && (!e.to || date < isoDay(e.to)));

function governmentOn(c, date) {
  if (typeof c.government === 'string') return c.government;
  const hit = (c.government || []).find(g => inEffect(g, date));
  return hit ? hit.text : '';
}
const leadersOn = (c, date) => (c.leaders || []).filter(l => l && l.name && inEffect(l, date));

// '1933\u20131945', 'since 1926' ... (or the leader's own `years` text)
function leaderYears(l) {
  if (l.years) return l.years;
  const a = l.from ? String(l.from).slice(0, 4) : '';
  const b = l.to ? String(l.to).slice(0, 4) : '';
  return a && b ? (a === b ? a : a + '\u2013' + b) : a ? 'since ' + a : b ? 'until ' + b : '';
}

// <img> for a flag, or a box with the country code if there is no image / it fails
function flagImg(c, cls) {
  const placeholder = () => {
    const d = mk('div', cls + ' no-img');
    d.textContent = c.code || String(c.name || '?').slice(0, 2).toUpperCase();
    return d;
  };
  const src = countryImg(c.flag);
  if (!src) return placeholder();
  const img = mk('img', cls);
  img.alt = 'Flag of ' + (c.name || 'country');
  img.addEventListener('error', () => img.replaceWith(placeholder()));
  img.src = src;
  return img;
}

// Portrait of a leader, or their initials
function personImg(l) {
  const placeholder = () => {
    const d = mk('div', 'cleader-img no-img');
    d.textContent = String(l.name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    return d;
  };
  const src = countryImg(l.image);
  if (!src) return placeholder();
  const img = mk('img', 'cleader-img');
  img.alt = l.name || '';
  img.addEventListener('error', () => img.replaceWith(placeholder()));
  img.src = src;
  return img;
}

// ---- Waving flag, drawn on a small canvas ----
const FLAG_W = 40, FLAG_H = 26, FLAG_PAD = 3;   // CSS pixels; the padding leaves room for the wave

function makeFlagCanvas(c, index, still) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = mk('canvas', 'flagm-canvas');
  canvas.width = Math.round(FLAG_W * dpr);
  canvas.height = Math.round((FLAG_H + FLAG_PAD * 2) * dpr);
  canvas.style.width = FLAG_W + 'px';
  canvas.style.height = (FLAG_H + FLAG_PAD * 2) + 'px';
  const f = { canvas, ctx: canvas.getContext('2d'), dpr, img: null, ok: false, still, phase: index * 1.7, code: c.code || '' };
  const src = countryImg(c.flag);
  if (src) {
    const img = new Image();
    img.onload = () => { f.ok = img.naturalWidth > 0; drawFlag(f, 0); };
    img.onerror = () => { f.ok = false; drawFlag(f, 0); };
    img.src = src;
    f.img = img;
  }
  drawFlag(f, 0);
  return f;
}

function drawFlag(f, t) {
  const { ctx, canvas, dpr } = f;
  const W = canvas.width, H = canvas.height;
  const pad = FLAG_PAD * dpr, fh = FLAG_H * dpr;
  ctx.clearRect(0, 0, W, H);

  if (!f.ok) {                                   // no image (yet): grey box with the country code
    ctx.fillStyle = '#2b2b30';
    ctx.fillRect(0, pad, W, fh);
    ctx.fillStyle = '#9a9aa2';
    ctx.font = '600 ' + (11 * dpr) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(f.code || '?', W / 2, pad + fh / 2);
    return;
  }
  if (f.still) {                                 // reduced motion: a flat flag
    ctx.drawImage(f.img, 0, pad, W, fh);
    return;
  }

  const iw = f.img.naturalWidth, ih = f.img.naturalHeight;
  const sw = Math.max(iw / W, 1);
  for (let x = 0; x < W; x++) {
    const k = x / W;                             // 0 at the pole, 1 at the free edge: the wave grows outwards
    const a = (x / dpr) * 0.32 - t * 3.2 + f.phase;
    const y = pad + Math.sin(a) * 2.4 * dpr * k;
    ctx.drawImage(f.img, Math.min(k * iw, iw - sw), 0, sw, ih, x, y, 1, fh);
    const s = Math.cos(a) * 0.22 * k;            // light and shadow on the folds
    ctx.fillStyle = s > 0 ? 'rgba(0,0,0,' + s + ')' : 'rgba(255,255,255,' + (-s * 0.6) + ')';
    ctx.fillRect(x, y, 1, fh);
  }
}

function buildFlagMarker(c, f, onClick) {
  const b = mk('button', 'flagm');
  b.type = 'button';
  b.title = c.name;
  b.setAttribute('aria-label', 'Open ' + c.name);
  b.append(mk('span', 'flagm-pole'), f.canvas, mk('span', 'flagm-base'));
  b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  return b;
}

// ---- The panel that opens for one country ----
function createCountryModal() {
  const back = mk('div', 'vmodal');
  back.hidden = true;
  const panel = mk('div', 'vmodal-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Country');

  const close = mk('button', 'vmodal-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '\u2715';

  const body = mk('div', 'cbody');
  panel.append(close, body);
  back.append(panel);
  document.body.append(back);

  const FADE_MS = 260; // keep in sync with the .vmodal CSS transition
  let opener = null;
  let closeTimer = null;
  const isOpen = () => back.classList.contains('open');
  const hide = () => {
    if (!isOpen()) return;
    back.classList.remove('open');
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { back.hidden = true; }, FADE_MS);
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  };
  close.addEventListener('click', hide);
  back.addEventListener('mousedown', e => { if (e.target === back) hide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });

  let current = null;                 // the country being shown

  // Fills the panel with what was true on the date of the selected map year
  const render = c => {
    const date = mapDate();

    const head = mk('div', 'chead');
    const names = mk('div', 'cnames');
    const name = mk('h2', 'cname');
    name.textContent = c.name || 'Unknown';
    names.append(name);
    if (c.native && c.native !== c.name) {
      const n = mk('div', 'cnative');
      n.textContent = c.native;
      names.append(n);
    }
    const gov = governmentOn(c, date);
    if (gov) {
      const g = mk('div', 'cgov');
      g.textContent = gov;
      names.append(g);
    }
    if (c.capital) {
      const cap = mk('div', 'ccap');
      cap.textContent = 'Capital: ' + c.capital;
      names.append(cap);
    }
    head.append(flagImg(c, 'cflag'), names);
    body.replaceChildren(head);

    const label = mapDateLabel();
    if (label) {
      const when = mk('div', 'cdate');
      const strong = mk('strong');
      strong.textContent = label;
      when.append('Situation on ', strong);
      body.append(when);
    }

    const leaders = leadersOn(c, date);
    const title = mk('div', 'csec');
    title.textContent = leaders.length === 1 ? 'Leader' : 'Leaders';
    body.append(title);
    if (!leaders.length) {
      const none = mk('div', 'cnone');
      none.textContent = 'No leaders listed for this date.';
      body.append(none);
      return;
    }
    const grid = mk('div', 'cleaders');
    leaders.forEach(l => {
      const card = mk('div', 'cleader');
      const info = mk('div', 'cleader-info');
      const n = mk('div', 'cleader-name');
      n.textContent = l.name;
      info.append(n);
      if (l.role) {
        const r = mk('div', 'cleader-role');
        r.textContent = l.role;
        info.append(r);
      }
      const years = leaderYears(l);
      if (years) {
        const y = mk('div', 'cleader-years');
        y.textContent = years;
        info.append(y);
      }
      card.append(personImg(l), info);
      grid.append(card);
    });
    body.append(grid);
  };

  // The year buttons of Historical Borders were pressed
  document.addEventListener('borderyearchange', () => {
    if (isOpen() && current) render(current);
  });

  return {
    open(c, fromEl) {
      opener = fromEl || null;
      current = c;
      clearTimeout(closeTimer);
      render(c);
      body.scrollTop = 0;
      back.hidden = false;
      void back.offsetWidth;
      back.classList.add('open');
      close.focus({ preventScroll: true });
    }
  };
}

// ---- Called from addVideoPlaces() in js/markers.js ----
//   panelRoot: the left "Videos" panel     goTo(pos): moves the map to {lat, lng}
function initCountries(map, panelRoot, goTo) {
  if (!panelRoot || typeof COUNTRIES === 'undefined') return;
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const modal = createCountryModal();

  // One flag on every capital
  const items = [];
  COUNTRIES.forEach((c, i) => {
    const pos = parseLatLng(c.coords);
    if (!pos) { console.warn('Country #' + (i + 1) + ' (' + (c.name || '?') + '): bad coords', c.coords); return; }
    const f = makeFlagCanvas(c, items.length, reduced);
    const el = buildFlagMarker(c, f, () => modal.open(c, el));
    new maplibregl.Marker({ element: el, anchor: 'bottom-left' })
      .setLngLat([pos.lng, pos.lat])
      .addTo(map);
    items.push({ c, pos, f });
  });

  // Animation: runs only while Countries mode is on
  let raf = 0;
  const tick = ts => {
    items.forEach(it => drawFlag(it.f, ts / 1000));
    raf = requestAnimationFrame(tick);
  };
  const startFlags = () => {
    if (reduced) { items.forEach(it => drawFlag(it.f, 0)); return; }
    if (!raf) raf = requestAnimationFrame(tick);
  };
  const stopFlags = () => { cancelAnimationFrame(raf); raf = 0; };

  // ----- the Videos / Countries button -----
  const title = panelRoot.querySelector('.vpanel-title');
  const videoCount = panelRoot.querySelector('.vpanel-head .vmodal-count');
  const countryCount = mk('span', 'vmodal-count countries-count');
  countryCount.textContent = String(items.length);
  if (videoCount) videoCount.after(countryCount);

  const toggle = mk('button', 'cmode');
  toggle.type = 'button';
  const vWord = mk('span');
  vWord.textContent = 'Videos';
  const cWord = mk('span');
  cWord.textContent = 'Countries';
  toggle.append(vWord, ' / ', cWord);
  const videoTools = panelRoot.querySelector('.vpanel-tools');
  panelRoot.insertBefore(toggle, videoTools);

  // ----- the country list (replaces the video list in Countries mode) -----
  const tools = mk('div', 'ctools');
  const search = mk('input', 'vpanel-search');
  search.type = 'search';
  search.placeholder = 'Search countries';
  search.setAttribute('aria-label', 'Search countries');
  tools.append(search);

  const list = mk('div', 'vpanel-list clist');

  const rowEl = it => {
    const { c, pos } = it;
    const row = mk('div', 'crow');
    const flagBtn = mk('button', 'crow-flagbtn');
    flagBtn.type = 'button';
    flagBtn.setAttribute('aria-label', 'Open ' + c.name);
    flagBtn.append(flagImg(c, 'crow-flag'));
    flagBtn.addEventListener('click', () => modal.open(c, flagBtn));

    const body = mk('div', 'crow-body');
    const name = mk('button', 'crow-name');
    name.type = 'button';
    name.textContent = c.name;
    name.addEventListener('click', () => modal.open(c, name));
    body.append(name);
    if (c.native && c.native !== c.name) {
      const n = mk('div', 'crow-native');
      n.textContent = c.native;
      body.append(n);
    }
    const go = mk('button', 'vitem-go');
    go.type = 'button';
    go.textContent = 'Show on map';
    go.addEventListener('click', () => goTo(pos));
    body.append(go);

    row.append(flagBtn, body);
    return row;
  };

  const render = () => {
    const q = search.value.trim().toLowerCase();
    const shown = items.filter(it =>
      !q || [it.c.name, it.c.native, it.c.capital, it.c.government].join(' ').toLowerCase().includes(q));
    const frag = document.createDocumentFragment();
    if (!shown.length) {
      const empty = mk('div', 'vpanel-empty');
      empty.textContent = items.length ? 'No countries match.' : 'No countries yet. Add them in js/countries.js.';
      frag.append(empty);
    } else {
      shown.forEach(it => frag.append(rowEl(it)));
    }
    list.replaceChildren(frag);
    list.scrollTop = 0;
  };
  search.addEventListener('input', render);
  render();
  panelRoot.append(tools, list);

  // ----- switching -----
  let mode = 'videos';
  const setMode = m => {
    mode = m;
    const on = m === 'countries';
    panelRoot.classList.toggle('mode-countries', on);
    map.getContainer().classList.toggle('countries-mode', on);
    if (title) title.textContent = on ? 'Countries' : 'Videos';
    vWord.classList.toggle('on', !on);
    cWord.classList.toggle('on', on);
    toggle.setAttribute('aria-label', on ? 'Switch to Videos' : 'Switch to Countries');
    if (on) startFlags(); else stopFlags();
  };
  toggle.addEventListener('click', () => setMode(mode === 'videos' ? 'countries' : 'videos'));
  setMode('videos');
}