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

function thumbEl(video, cls) {
  const a = mk('a', cls);
  openLink(a, video.url);
  a.setAttribute('aria-label', 'Open video: ' + (video.title || 'video'));
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

// ---- Left-side list of all videos, each with a "Show on map" button ----
function createVideoPanel(entries, goTo) {
  const total = entries.reduce((n, en) => n + en.videos.length, 0);

  const root = mk('aside', 'vpanel');
  root.setAttribute('aria-label', 'Video list');
  if (window.innerWidth < 700) root.classList.add('collapsed'); // small screens: start folded

  const head = mk('button', 'vpanel-head');
  head.type = 'button';
  const title = mk('span', 'vpanel-title');
  title.textContent = 'Videos';
  const count = mk('span', 'vmodal-count');
  count.textContent = String(total);
  const chevron = mk('span', 'vpanel-chevron');
  chevron.textContent = '\u25BE';
  head.append(title, count, chevron);
  head.setAttribute('aria-expanded', String(!root.classList.contains('collapsed')));
  head.addEventListener('click', () => {
    const collapsed = root.classList.toggle('collapsed');
    head.setAttribute('aria-expanded', String(!collapsed));
  });

  const list = mk('div', 'vpanel-list');
  entries.forEach(en => {
    en.videos.forEach(v => {
      const item = mk('div', 'vitem');
      const body = mk('div', 'vitem-body');
      const t = mk('a', 'vitem-title');
      openLink(t, v.url);
      t.textContent = v.title || 'Untitled';
      const go = mk('button', 'vitem-go');
      go.type = 'button';
      go.textContent = 'Show on map';
      go.addEventListener('click', () => goTo(en.pos));
      body.append(t, go);
      item.append(thumbEl(v, 'vitem-thumb'), body);
      list.append(item);
    });
  });

  root.append(head, list);
  document.body.append(root);
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
    entries.push({ pos, videos });
    new maplibregl.Marker({ element: el, anchor: 'bottom-left' })
      .setLngLat([pos.lng, pos.lat])
      .addTo(map);
  });

  createVideoPanel(entries, pos =>
    map.flyTo({ center: [pos.lng, pos.lat], zoom: Math.max(map.getZoom(), LABEL_MIN_ZOOM + 1), duration: 1200 })
  );

  const update = () => map.getContainer().classList.toggle('labels-off', map.getZoom() < LABEL_MIN_ZOOM);
  map.on('zoom', update);
  update();
}