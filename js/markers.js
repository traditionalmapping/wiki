// Draws the video panels from places.js on the map. You normally don't need to edit this file.
const LABEL_MIN_ZOOM = 5; // zoomed out further than this, panels collapse to dots

function mk(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

// "52.2297, 21.0122" (lat, lng) or [52.2297, 21.0122] -> { lat, lng } or null
function parseLatLng(value) {
  const parts = Array.isArray(value) ? value : String(value).split(/[,;\s]+/).filter(Boolean);
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// Only allow normal web links (blocks javascript: and similar)
function safeUrl(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : null;
  } catch (e) { return null; }
}

function youtubeId(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1) || null;
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/);
      if (m) return m[1];
    }
  } catch (e) {}
  return null;
}

function thumbUrl(video) {
  if (video.thumb) return safeUrl(video.thumb);
  const id = youtubeId(video.url);
  return id ? 'https://i.ytimg.com/vi/' + encodeURIComponent(id) + '/mqdefault.jpg' : null;
}

function openLink(a, url) {
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
}

function linkEl(url) {
  const a = mk('a', 'vlink');
  openLink(a, url);
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}
  a.textContent = host + ' \u2197';
  return a;
}

// ---- In-page YouTube player (opens when a YouTube thumbnail is clicked) ----
let playerApi = null;

function createVideoPlayer() {
  const back = mk('div', 'pmodal');
  back.hidden = true;
  const panel = mk('div', 'pmodal-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Video player');

  const head = mk('div', 'pmodal-head');
  const title = mk('span', 'pmodal-title');
  head.append(title);

  const close = mk('button', 'vmodal-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '\u2715';

  const frame = mk('div', 'pmodal-frame');
  const foot = mk('div', 'pmodal-foot');
  const yt = mk('a', 'pmodal-link');
  yt.textContent = 'Open on YouTube \u2197';
  foot.append(yt);

  panel.append(head, close, frame, foot);
  back.append(panel);
  document.body.append(back);

  const FADE_MS = 260; // keep in sync with the CSS transition time
  let opener = null;
  let closeTimer = null;

  const isOpen = () => back.classList.contains('open');
  const hide = () => {
    if (!isOpen()) return;
    back.classList.remove('open');
    frame.replaceChildren();                   // removing the iframe stops the video
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { back.hidden = true; }, FADE_MS);
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  };
  close.addEventListener('click', hide);
  back.addEventListener('mousedown', e => { if (e.target === back) hide(); });
  // capture phase: Escape closes only the player, not the "+N" list under it
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen()) { e.stopImmediatePropagation(); hide(); }
  }, true);

  return {
    open(video, id, fromEl) {
      opener = fromEl || null;
      clearTimeout(closeTimer);
      title.textContent = video.title || 'Video';
      openLink(yt, video.url);

      const iframe = mk('iframe');
      iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0&playsinline=1';
      iframe.title = video.title || 'Video';
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.replaceChildren(iframe);

      back.hidden = false;
      void back.offsetWidth;
      back.classList.add('open');
      close.focus({ preventScroll: true });
    }
  };
}

function thumbEl(video, cls) {
  const a = mk('a', cls);
  openLink(a, video.url);
  const yid = youtubeId(video.url);
  a.setAttribute('aria-label', (yid ? 'Play video: ' : 'Open video: ') + (video.title || 'video'));
  if (yid && video.embed !== false) {
    // Plain click plays it here; Ctrl/Shift/middle-click still opens YouTube in a new tab
    a.addEventListener('click', e => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      if (noEmbedIds.has(yid)) return;          // embedding disabled: let the link open YouTube
      e.preventDefault();
      e.stopPropagation();
      if (!playerApi) playerApi = createVideoPlayer();
      playerApi.open(video, yid, a);
    });
  }
  const src = thumbUrl(video);
  const placeholder = () => { a.classList.add('no-thumb'); a.replaceChildren(); a.textContent = '\u25B6'; };
  if (src) {
    const img = mk('img');
    img.alt = '';
    img.loading = 'lazy';
    img.src = src;
    img.addEventListener('error', placeholder);
    a.append(img);
  } else {
    placeholder();
  }
  return a;
}

// ---- The panel pointing at a place ----
function buildPlace(videos, onMore, onDot) {
  const root = mk('div', 'place');
  const bubble = mk('div', 'bubble');
  const first = videos[0];

  const main = mk('div', 'bubble-main');
  const info = mk('div', 'bubble-info');
  const title = mk('div', 'bubble-title');
  title.textContent = first.title || 'Untitled';
  info.append(title, linkEl(first.url));
  main.append(info, thumbEl(first, 'thumb'));
  bubble.append(main);

  if (videos.length > 1) {
    const more = mk('button', 'bubble-more');
    more.type = 'button';
    more.textContent = '+' + (videos.length - 1);
    more.title = 'Show all ' + videos.length + ' videos';
    more.addEventListener('click', e => { e.stopPropagation(); onMore(more); });
    bubble.append(more);
  }

  const dot = mk('button', 'place-dot');
  dot.type = 'button';
  dot.setAttribute('aria-label', 'Zoom to ' + (first.title || 'place'));
  dot.addEventListener('click', e => { e.stopPropagation(); onDot(); });

  root.append(bubble, dot);
  return root;
}

// ---- The list that opens from "+N" ----
function createVideoModal() {
  const back = mk('div', 'vmodal');
  back.hidden = true;
  const panel = mk('div', 'vmodal-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Videos');

  const head = mk('div', 'vmodal-head');
  const heading = mk('span', 'vmodal-title');
  const count = mk('span', 'vmodal-count');
  head.append(heading, count);

  const close = mk('button', 'vmodal-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '\u2715';

  const list = mk('div', 'vmodal-list');
  panel.append(head, close, list);
  back.append(panel);
  document.body.append(back);

  const FADE_MS = 260; // keep in sync with the CSS transition time
  let opener = null;
  let closeTimer = null;

  const isOpen = () => back.classList.contains('open');
  const hide = () => {
    if (!isOpen()) return;
    back.classList.remove('open');            // starts the fade-out
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { back.hidden = true; }, FADE_MS);
    if (opener && opener.focus) opener.focus();
  };
  close.addEventListener('click', hide);
  back.addEventListener('mousedown', e => { if (e.target === back) hide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });

  return {
    open(videos, fromEl) {
      opener = fromEl || null;
      clearTimeout(closeTimer);
      heading.textContent = 'Videos';
      count.textContent = String(videos.length);
      list.replaceChildren();
      videos.forEach((v, i) => {
        const row = mk('div', 'vrow');
        row.style.setProperty('--i', i);
        const info = mk('div', 'vrow-info');
        const t = mk('a', 'vrow-title');
        openLink(t, v.url);
        t.textContent = v.title || 'Untitled';
        info.append(t, linkEl(v.url));
        row.append(info, thumbEl(v, 'vrow-thumb'));
        list.append(row);
      });
      back.hidden = false;
      void back.offsetWidth;                   // let the browser register the start state
      back.classList.add('open');              // starts the fade-in
      close.focus({ preventScroll: true });
    }
  };
}

// ---- Left-side list of all videos: search, group, sort, filter, "Show on map" ----

// '2023', '2023-05' or '2023-05-14' -> sortable 'YYYY-MM-DD' (or '' if missing/invalid)
function dateKey(d) {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(d || '').trim());
  return m ? m[1] + '-' + (m[2] || '01') + '-' + (m[3] || '01') : '';
}

// The date the events in the video happen: one date, or a range like
// '1944-08-01 / 1944-10-02' (also "to" or an en dash between the two).
// -> { key: sortable start date, label: text to show }; key is '' if missing/invalid
function parseDate(value) {
  const parts = String(value || '').split(/\s*(?:\/|\bto\b|\u2013|\u2014)\s*/).map(x => x.trim()).filter(Boolean);
  const key = parts.length ? dateKey(parts[0]) : '';
  if (!key) return { key: '', label: '' };
  return { key, label: parts.slice(0, 2).filter(x => dateKey(x)).join(' \u2013 ') };
}

// Channel names for YouTube videos: asked from YouTube's public oEmbed once, then kept in the browser
const AUTHOR_CACHE_KEY = 'yt-authors-v1';
function loadAuthorCache() {
  try {
    const o = JSON.parse(localStorage.getItem(AUTHOR_CACHE_KEY));
    return o && typeof o === 'object' ? o : {};
  } catch (e) { return {}; }
}
function saveAuthorCache(cache) {
  try { localStorage.setItem(AUTHOR_CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
}
// Videos whose owner disabled embedding (YouTube answers HTTP 401): their thumbnail opens YouTube instead
const NOEMBED_KEY = 'yt-noembed-v1';
const noEmbedIds = new Set((() => {
  try {
    const a = JSON.parse(localStorage.getItem(NOEMBED_KEY));
    return Array.isArray(a) ? a : [];
  } catch (e) { return []; }
})());
function markNoEmbed(id) {
  noEmbedIds.add(id);
  try { localStorage.setItem(NOEMBED_KEY, JSON.stringify([...noEmbedIds])); } catch (e) {}
}
async function fetchYouTubeAuthor(id) {
  const url = 'https://www.youtube.com/oembed?format=json&url=' +
    encodeURIComponent('https://www.youtube.com/watch?v=' + id);
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error('HTTP ' + res.status);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return String(data.author_name || '').trim();
}

function createVideoPanel(entries, goTo) {
  // One flat record per video
  const items = [];
  entries.forEach(en => {
    const place = en.name || (en.pos.lat.toFixed(2) + ', ' + en.pos.lng.toFixed(2));
    en.videos.forEach(v => {
      const tags = [].concat(v.tags || []).map(t => String(t).trim()).filter(Boolean);
      const pd = parseDate(v.date);
      const key = pd.key;
      items.push({
        v, pos: en.pos, place, tags, key,
        author: String(v.author || '').trim(),   // written in places.js; otherwise found below
        date: pd.label,
        year: key.slice(0, 4),
        idx: items.length
      });
    });
  });
  const total = items.length;
  const uniq = arr => [...new Set(arr)].sort((a, b) => a.localeCompare(b));
  const authorCache = loadAuthorCache();
  items.forEach(it => {
    const id = youtubeId(it.v.url);
    if (!it.author && id && authorCache[id]) it.author = authorCache[id];
  });
  let authors = uniq(items.map(it => it.author).filter(Boolean));
  const tagList = uniq(items.flatMap(it => it.tags));

  const DEFAULTS = { q: '', group: 'none', sort: 'default', author: '', tag: '' };
  const state = Object.assign({}, DEFAULTS);

  // ----- panel shell -----
  const root = mk('aside', 'vpanel');
  root.setAttribute('aria-label', 'Video list');
  if (window.innerWidth < 700) root.classList.add('collapsed'); // small screens: start folded

  const head = mk('button', 'vpanel-head');
  head.type = 'button';
  const title = mk('span', 'vpanel-title');
  title.textContent = 'Videos';
  const count = mk('span', 'vmodal-count');
  const chevron = mk('span', 'vpanel-chevron');
  chevron.textContent = '\u25BE';
  head.append(title, count, chevron);
  head.setAttribute('aria-expanded', String(!root.classList.contains('collapsed')));
  head.addEventListener('click', () => {
    const collapsed = root.classList.toggle('collapsed');
    head.setAttribute('aria-expanded', String(!collapsed));
  });

  // ----- tools: search, group, sort, filters -----
  const tools = mk('div', 'vpanel-tools');
  const search = mk('input', 'vpanel-search');
  search.type = 'search';
  search.placeholder = 'Search videos';
  search.setAttribute('aria-label', 'Search videos');
  search.addEventListener('input', () => { state.q = search.value; render(); });

  const grid = mk('div', 'vpanel-grid');
  const control = (label, options, key) => {
    const wrap = mk('label', 'vtool');
    const span = mk('span');
    span.textContent = label;
    const sel = mk('select');
    options.forEach(([val, text]) => {
      const o = mk('option');
      o.value = val;
      o.textContent = text;
      sel.append(o);
    });
    sel.addEventListener('change', () => { state[key] = sel.value; render(); });
    wrap.append(span, sel);
    grid.append(wrap);
    return { wrap, sel };
  };
  const cGroup = control('Group by', [['none', 'None'], ['author', 'Author'], ['year', 'Year'], ['place', 'Place']], 'group');
  const cSort = control('Sort', [['default', 'Default'], ['oldest', 'Earliest first'], ['newest', 'Latest first'], ['title', 'A\u2013Z']], 'sort');
  const cAuthor = control('Author', [['', 'All']].concat(authors.map(a => [a, a])), 'author');
  const cTag = control('Tag', [['', 'All']].concat(tagList.map(t => [t, t])), 'tag');
  const fillAuthorOptions = () => {
    authors = uniq(items.map(it => it.author).filter(Boolean));
    cAuthor.sel.replaceChildren();
    [['', 'All']].concat(authors.map(a => [a, a])).forEach(([val, text]) => {
      const o = mk('option');
      o.value = val;
      o.textContent = text;
      cAuthor.sel.append(o);
    });
    cAuthor.sel.value = authors.includes(state.author) ? state.author : '';
    state.author = cAuthor.sel.value;
    cAuthor.wrap.hidden = !authors.length;       // no author known yet -> nothing to filter by
  };
  fillAuthorOptions();
  cTag.wrap.hidden = !tagList.length;

  const status = mk('div', 'vpanel-status');
  const statusText = mk('span');
  const reset = mk('button', 'vpanel-reset');
  reset.type = 'button';
  reset.textContent = 'Reset';
  reset.addEventListener('click', () => {
    Object.assign(state, DEFAULTS);
    search.value = '';
    cGroup.sel.value = DEFAULTS.group;
    cSort.sel.value = DEFAULTS.sort;
    cAuthor.sel.value = '';
    cTag.sel.value = '';
    render();
  });
  status.append(statusText, reset);
  tools.append(search, grid, status);

  const list = mk('div', 'vpanel-list');

  // ----- one video row -----
  const itemEl = it => {
    const item = mk('div', 'vitem');
    const body = mk('div', 'vitem-body');
    const t = mk('a', 'vitem-title');
    openLink(t, it.v.url);
    t.textContent = it.v.title || 'Untitled';
    body.append(t);

    const meta = [it.author, it.date].filter(Boolean).join(' \u00B7 ');
    if (meta) {
      const m = mk('div', 'vitem-meta');
      m.textContent = meta;
      body.append(m);
    }
    if (it.tags.length) {
      const row = mk('div', 'vitem-tags');
      it.tags.forEach(tag => {
        const b = mk('button', 'vtag');
        b.type = 'button';
        b.textContent = tag;
        b.title = 'Show only: ' + tag;
        b.addEventListener('click', () => { state.tag = tag; cTag.sel.value = tag; render(); });
        row.append(b);
      });
      body.append(row);
    }

    const go = mk('button', 'vitem-go');
    go.type = 'button';
    go.textContent = 'Show on map';
    go.addEventListener('click', () => goTo(it.pos));
    body.append(go);

    item.append(thumbEl(it.v, 'vitem-thumb'), body);
    return item;
  };

  // ----- filter -> sort -> group -> draw -----
  const byDate = dir => (a, b) => {
    if (!a.key !== !b.key) return a.key ? -1 : 1;        // videos without a date go last
    if (a.key !== b.key) return dir * (a.key < b.key ? -1 : 1);
    return a.idx - b.idx;
  };
  const sorters = {
    default: (a, b) => a.idx - b.idx,
    newest: byDate(-1),
    oldest: byDate(1),
    title: (a, b) => (a.v.title || '').localeCompare(b.v.title || '') || a.idx - b.idx
  };
  const groupBy = { author: it => it.author, year: it => it.year, place: it => it.place };
  const groupLabel = {
    author: k => k || 'Unknown author',
    year: k => k || 'Unknown date',
    place: k => k
  };

  function render(keepScroll) {
    const q = state.q.trim().toLowerCase();
    const shown = items
      .filter(it =>
        (!state.author || it.author === state.author) &&
        (!state.tag || it.tags.includes(state.tag)) &&
        (!q || [it.v.title, it.author, it.place, it.date, it.tags.join(' ')].join(' ').toLowerCase().includes(q)))
      .sort(sorters[state.sort]);

    const filtered = shown.length !== total;
    count.textContent = filtered ? shown.length + '/' + total : String(total);
    const changed = Object.keys(DEFAULTS).some(k => state[k] !== DEFAULTS[k]);
    status.hidden = !changed;
    statusText.textContent = 'Showing ' + shown.length + ' of ' + total;

    const frag = document.createDocumentFragment();
    if (!shown.length) {
      const empty = mk('div', 'vpanel-empty');
      empty.textContent = 'No videos match.';
      frag.append(empty);
    } else if (state.group === 'none') {
      shown.forEach(it => frag.append(itemEl(it)));
    } else {
      const groups = new Map();
      shown.forEach(it => {
        const k = groupBy[state.group](it);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(it);
      });
      let keys = [...groups.keys()].sort((a, b) => a.localeCompare(b));
      const known = keys.filter(Boolean);
      if (state.group === 'year' && state.sort === 'newest') known.reverse();
      keys = known.concat(keys.filter(k => !k));          // "unknown" group last
      keys.forEach(k => {
        const h = mk('div', 'vgroup');
        const name = mk('span');
        name.textContent = groupLabel[state.group](k);
        const n = mk('span', 'vgroup-count');
        n.textContent = String(groups.get(k).length);
        h.append(name, n);
        frag.append(h);
        groups.get(k).forEach(it => frag.append(itemEl(it)));
      });
    }
    list.replaceChildren(frag);
    if (!keepScroll) list.scrollTop = 0;
  }

  root.append(head, tools, list);
  document.body.append(root);
  render();

  // YouTube videos without an author in places.js: ask YouTube, then redraw (batched)
  let refreshTimer = null;
  const queueRefresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { fillAuthorOptions(); render(true); }, 150);
  };
  items.forEach(it => {
    if (it.author) return;
    const id = youtubeId(it.v.url);
    if (!id) return;
    fetchYouTubeAuthor(id).then(name => {
      if (!name) return;
      it.author = name;
      authorCache[id] = name;
      saveAuthorCache(authorCache);
      queueRefresh();
    }).catch(err => {
      if (err.status === 401) markNoEmbed(id);  // embedding is disabled for this video
      console.warn('Could not look up the author of "' + (it.v.title || id) + '" (' + id + '):', err);
    });
  });
  return root;
}

function addVideoPlaces(map) {
  const modal = createVideoModal();
  const entries = []; // valid places, used for the left-side list

  PLACES.forEach((place, i) => {
    const pos = parseLatLng(place.coords);
    if (!pos) { console.warn('Place #' + (i + 1) + ': bad coords', place.coords); return; }
    const videos = (place.videos || []).filter(v => safeUrl(v.url));
    if (!videos.length) { console.warn('Place #' + (i + 1) + ': no valid video links'); return; }

    const el = buildPlace(
      videos,
      from => modal.open(videos, from),
      () => {
        if (map.getZoom() < LABEL_MIN_ZOOM) {
          map.flyTo({ center: [pos.lng, pos.lat], zoom: LABEL_MIN_ZOOM + 1, duration: 1200 });
        }
      }
    );
    entries.push({ pos, videos, name: place.name });
    new maplibregl.Marker({ element: el, anchor: 'bottom-left' })
      .setLngLat([pos.lng, pos.lat])
      .addTo(map);
  });

  const flyToPos = pos =>
    map.flyTo({ center: [pos.lng, pos.lat], zoom: Math.max(map.getZoom(), LABEL_MIN_ZOOM + 1), duration: 1200 });
  const panelRoot = createVideoPanel(entries, flyToPos);
  if (typeof initCountries === 'function') initCountries(map, panelRoot, flyToPos); // Videos/Countries switch, js/countries.js

  const update = () => map.getContainer().classList.toggle('labels-off', map.getZoom() < LABEL_MIN_ZOOM);
  map.on('zoom', update);
  update();
}