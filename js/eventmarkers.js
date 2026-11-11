// Draws the historical events from js/events.js as markers with a popup, and
// gives them their own "Events" mode in the left panel (next to Videos and
// Countries). You normally don't need to edit this file; add events in js/events.js.
// Uses mk() from js/markers.js.
const EVENT_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// '1941-06-22' -> '22 June 1941'
function formatEventDate(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ''));
  if (!m) return String(d || '');
  return Number(m[3]) + ' ' + EVENT_MONTHS[Number(m[2]) - 1] + ' ' + m[1];
}

function buildEventPopup(ev) {
  const box = document.createElement('div');
  box.className = 'event-popup';

  const date = document.createElement('div');
  date.className = 'event-date';
  date.textContent = formatEventDate(ev.date);

  const title = document.createElement('div');
  title.className = 'event-title';
  title.textContent = ev.title;

  box.append(date, title);
  if (ev.desc) {
    const desc = document.createElement('div');
    desc.className = 'event-desc';
    desc.textContent = ev.desc;
    box.append(desc);
  }
  return box;
}

// Markers are created once. They stay hidden (see css/events.css) until the
// panel is switched to Events mode.
let eventItems = null;

function buildEventMarkers(map) {
  if (eventItems) return eventItems;
  eventItems = [];
  if (!Array.isArray(window.HISTORY_EVENTS)) {
    console.warn('js/events.js did not load; no event markers.');
    return eventItems;
  }
  window.HISTORY_EVENTS.forEach((ev, i) => {
    if (!isFinite(ev.lng) || !isFinite(ev.lat)) {
      console.warn('Event #' + (i + 1) + ' (' + ev.title + '): bad coordinates');
      return;
    }
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'event-marker';
    el.setAttribute('aria-label', ev.title + ', ' + formatEventDate(ev.date));
    el.title = ev.title;

    const popup = new maplibregl.Popup({ offset: 14, maxWidth: '300px', className: 'event-popup-wrap' })
      .setDOMContent(buildEventPopup(ev));

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([ev.lng, ev.lat])
      .setPopup(popup)
      .addTo(map);
    eventItems.push({ ev, marker });
  });
  return eventItems;
}

// Called from js/map.js
function initEventMarkers(map) {
  buildEventMarkers(map);
}

// ---- The Events list in the left panel ----
// Called from initCountries() in js/countries.js.
//   panelRoot: the left panel     goTo(pos): moves the map to {lat, lng}
// Returns { setActive(on) }, which the Videos / Countries / Events switch calls.
function initEventsPanel(map, panelRoot, goTo) {
  if (!panelRoot) return null;
  const items = buildEventMarkers(map);

  // count next to the panel title
  const countEl = mk('span', 'vmodal-count events-count');
  countEl.textContent = String(items.length);
  const counts = panelRoot.querySelectorAll('.vpanel-head > .vmodal-count');
  if (counts.length) counts[counts.length - 1].after(countEl);

  // search + group by
  const tools = mk('div', 'etools');
  const search = mk('input', 'vpanel-search');
  search.type = 'search';
  search.placeholder = 'Search events';
  search.setAttribute('aria-label', 'Search events');
  tools.append(search);

  let groupMode = 'year';
  const folderClosed = new Set();
  const groupWrap = mk('label', 'vtool');
  const groupSpan = mk('span');
  groupSpan.textContent = 'Group by';
  const groupSel = mk('select');
  [['year', 'Year'], ['none', 'None']].forEach(([v, t]) => {
    const o = mk('option');
    o.value = v;
    o.textContent = t;
    groupSel.append(o);
  });
  groupSel.addEventListener('change', () => { groupMode = groupSel.value; render(); });
  groupWrap.append(groupSpan, groupSel);
  tools.append(groupWrap);

  const list = mk('div', 'vpanel-list elist');

  const show = it => {
    goTo({ lat: it.ev.lat, lng: it.ev.lng });
    const p = it.marker.getPopup();
    if (p && !p.isOpen()) it.marker.togglePopup();
  };

  const rowEl = it => {
    const row = mk('div', 'erow');
    const date = mk('div', 'erow-date');
    date.textContent = formatEventDate(it.ev.date);
    const name = mk('button', 'erow-title');
    name.type = 'button';
    name.textContent = it.ev.title;
    name.addEventListener('click', () => show(it));
    const go = mk('button', 'vitem-go');
    go.type = 'button';
    go.textContent = 'Show on map';
    go.addEventListener('click', () => show(it));
    row.append(date, name, go);
    return row;
  };

  const folderEl = (key, rows, forceOpen) => {
    const open = forceOpen || !folderClosed.has(key);
    const f = mk('div', 'cfolder efolder' + (open ? '' : ' closed'));
    const h = mk('button', 'cfolder-head');
    h.type = 'button';
    h.setAttribute('aria-expanded', String(open));
    const chev = mk('span', 'cfolder-chev');
    chev.textContent = '\u25BE';
    const nm = mk('span', 'cfolder-name');
    nm.textContent = key;
    const n = mk('span', 'vgroup-count');
    n.textContent = String(rows.length);
    h.append(chev, nm, n);
    const body = mk('div', 'cfolder-body');
    rows.forEach(it => body.append(rowEl(it)));
    h.addEventListener('click', () => {
      const closed = f.classList.toggle('closed');
      h.setAttribute('aria-expanded', String(!closed));
      if (closed) folderClosed.add(key); else folderClosed.delete(key);
    });
    f.append(h, body);
    return f;
  };

  const sorted = items.slice().sort((a, b) => String(a.ev.date).localeCompare(String(b.ev.date)));

  const render = () => {
    const q = search.value.trim().toLowerCase();
    const shown = sorted.filter(it =>
      !q || [it.ev.title, it.ev.desc, formatEventDate(it.ev.date)].join(' ').toLowerCase().includes(q));
    const frag = document.createDocumentFragment();
    if (!shown.length) {
      const empty = mk('div', 'vpanel-empty');
      empty.textContent = items.length ? 'No events match.' : 'No events yet. Add them in js/events.js.';
      frag.append(empty);
    } else if (groupMode === 'none') {
      shown.forEach(it => frag.append(rowEl(it)));
    } else {
      const byYear = new Map();
      shown.forEach(it => {
        const y = String(it.ev.date).slice(0, 4);
        if (!byYear.has(y)) byYear.set(y, []);
        byYear.get(y).push(it);
      });
      byYear.forEach((rows, y) => frag.append(folderEl(y, rows, !!q)));
    }
    list.replaceChildren(frag);
    list.scrollTop = 0;
  };
  search.addEventListener('input', render);
  render();
  panelRoot.append(tools, list);

  return {
    setActive(on) {
      if (on) return;
      // leaving Events mode: close any open event popup
      items.forEach(it => {
        const p = it.marker.getPopup();
        if (p && p.isOpen()) p.remove();
      });
    }
  };
}