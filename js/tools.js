// ============================================================================
//  TOOLS  (top-right, under the zoom buttons):  a ruler (Measure) and a link (Share) icon
//
//  Share link: copies a link that opens the map at the same place, zoom, tilt
//  and base map. The link looks like   https://.../#map=5.20/52.1/21.0/0/0&base=dark
//  Measure: click points on the map to get a distance, or switch to Area.
//
//  Needs:  <link rel="stylesheet" href="css/tools.css">  and  <script src="js/tools.js">
//  in index.html (the script BEFORE js/map.js), and  initTools(map);  in js/map.js.
// ============================================================================

// ---------- share link: reading the address on load (used by js/map.js) ----------
function parseShareHash() {
  const m = /[#&]map=([-\d.]+)\/([-\d.]+)\/([-\d.]+)\/([-\d.]+)\/([-\d.]+)/.exec(location.hash || '');
  if (!m) return null;
  const [zoom, lat, lng, bearing, pitch] = m.slice(1).map(Number);
  if (![zoom, lat, lng, bearing, pitch].every(Number.isFinite)) return null;
  if (Math.abs(lat) > 85.06 || Math.abs(lng) > 360 || zoom < 0 || zoom > 24) return null;
  const b = /[#&]base=([a-z0-9_-]+)/i.exec(location.hash || '');
  return {
    view: { center: [lng, lat], zoom, bearing, pitch: Math.min(60, Math.max(0, pitch)) },
    base: b ? b[1] : null
  };
}

// ---------- measuring ----------
const MEASURE_R = 6371008.8;                       // mean Earth radius, metres
const toolsRad = d => d * Math.PI / 180;

function measureDist(a, b) {                       // haversine, metres
  const dLat = toolsRad(b[1] - a[1]), dLng = toolsRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toolsRad(a[1])) * Math.cos(toolsRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * MEASURE_R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function measureLength(pts, closed) {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += measureDist(pts[i - 1], pts[i]);
  if (closed && pts.length > 2) t += measureDist(pts[pts.length - 1], pts[0]);
  return t;
}
function measureArea(pts) {                        // spherical polygon, square metres
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += toolsRad(b[0] - a[0]) * (2 + Math.sin(toolsRad(a[1])) + Math.sin(toolsRad(b[1])));
  }
  return Math.abs(s * MEASURE_R * MEASURE_R / 2);
}
function measureNum(n) {
  return n < 10 ? n.toFixed(2) : n < 1000 ? n.toFixed(1) : Math.round(n).toLocaleString('en-US');
}
function measureFmtLen(m) {
  const km = m < 1000 ? Math.round(m) + ' m' : measureNum(m / 1000) + ' km';
  return km + '  (' + measureNum(m / 1609.344) + ' mi)';
}
function measureFmtArea(m2) {
  return measureNum(m2 / 1e6) + ' km\u00B2  (' + measureNum(m2 / 2589988.11) + ' mi\u00B2)';
}

// Icons (drawn in the button's text colour)
const toolsIcon = d => '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const TOOLS_ICON_RULER = toolsIcon('<path d="M3.5 16.5 16.5 3.5l4 4-13 13z"/><path d="m7.5 12.5 2 2M10.5 9.5l2 2M13.5 6.5l2 2"/>');
const TOOLS_ICON_LINK = toolsIcon('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>');
const TOOLS_ICON_CHECK = toolsIcon('<path d="m5 12.5 5 5L19.5 7"/>');

function toolsEl(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

class ToolsControl {
  constructor(map) {
    this.map = map;
    this.on = false;
    this.mode = 'distance';          // 'distance' | 'area'
    this.pts = [];                   // placed points [lng, lat]
    this.hover = null;               // the cursor, for the line that follows it
  }

  onAdd() {
    const el = this.el = toolsEl('div', 'maplibregl-ctrl basemap-switch tools-switch');
    this.measureBtn = toolsEl('button', '');
    this.measureBtn.innerHTML = TOOLS_ICON_RULER;
    this.measureBtn.title = 'Measure distance and area';
    this.measureBtn.setAttribute('aria-label', 'Measure distance and area');
    this.measureBtn.type = 'button';
    this.measureBtn.setAttribute('aria-pressed', 'false');
    this.measureBtn.addEventListener('click', () => this.setOn(!this.on));
    this.shareBtn = toolsEl('button', '');
    this.shareBtn.innerHTML = TOOLS_ICON_LINK;
    this.shareBtn.type = 'button';
    this.shareBtn.title = 'Copy a link to this exact view of the map';
    this.shareBtn.setAttribute('aria-label', 'Copy a link to this exact view of the map');
    this.shareBtn.addEventListener('click', () => this.share());
    el.append(this.measureBtn, this.shareBtn);

    // The measuring panel floats at the bottom of the screen
    const p = this.panel = toolsEl('div', 'measure-panel');
    p.hidden = true;
    const modes = toolsEl('div', 'measure-modes');
    this.modeBtns = {};
    [['distance', 'Distance'], ['area', 'Area']].forEach(([id, label]) => {
      const b = toolsEl('button', '', label);
      b.type = 'button';
      b.addEventListener('click', () => { this.mode = id; this.update(); });
      this.modeBtns[id] = b;
      modes.append(b);
    });
    this.readout = toolsEl('div', 'measure-readout');
    this.hint = toolsEl('div', 'measure-hint');
    const row = toolsEl('div', 'measure-actions');
    const undo = toolsEl('button', '', 'Undo');
    undo.type = 'button';
    undo.addEventListener('click', () => { this.pts.pop(); this.update(); });
    const clear = toolsEl('button', '', 'Clear');
    clear.type = 'button';
    clear.addEventListener('click', () => { this.pts = []; this.update(); });
    const close = toolsEl('button', 'measure-close', 'Close');
    close.type = 'button';
    close.addEventListener('click', () => this.setOn(false));
    row.append(undo, clear, close);
    p.append(modes, this.readout, this.hint, row);
    document.body.append(p);

    this.onClick = e => { this.pts.push([e.lngLat.lng, e.lngLat.lat]); this.update(); };
    this.onMove = e => { this.hover = [e.lngLat.lng, e.lngLat.lat]; this.draw(); };
    this.onKey = e => { if (e.key === 'Escape' && this.on) this.setOn(false); };

    onStyleReady(() => this.addLayers());      // the drawing survives base map changes
    this.update();
    return el;
  }

  onRemove() {
    this.setOn(false);
    this.panel.remove();
    this.el.remove();
  }

  // ---------- share ----------
  shareUrl() {
    const m = this.map, c = m.getCenter();
    let base = '';
    try { base = localStorage.getItem('basemap') || ''; } catch (e) { /* ignore */ }
    const hash = '#map=' + m.getZoom().toFixed(2) + '/' + c.lat.toFixed(5) + '/' + c.lng.toFixed(5) +
      '/' + m.getBearing().toFixed(1) + '/' + m.getPitch().toFixed(1) + (base ? '&base=' + base : '');
    return location.origin + location.pathname + location.search + hash;
  }

  async share() {
    const url = this.shareUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch (err) {
      const t = document.createElement('textarea');       // fallback (older browsers, http)
      t.value = url;
      document.body.appendChild(t);
      t.select();
      try { document.execCommand('copy'); } catch (e2) { /* ignore */ }
      t.remove();
    }
    this.shareBtn.innerHTML = TOOLS_ICON_CHECK;           // a tick for a moment: the link is copied
    this.shareBtn.title = 'Link copied';
    setTimeout(() => {
      this.shareBtn.innerHTML = TOOLS_ICON_LINK;
      this.shareBtn.title = 'Copy a link to this exact view of the map';
    }, 1500);
  }

  // ---------- measure ----------
  setOn(on) {
    if (on === this.on) return;
    this.on = on;
    const m = this.map;
    this.measureBtn.classList.toggle('active', on);
    this.measureBtn.setAttribute('aria-pressed', String(on));
    this.panel.hidden = !on;
    if (on) {
      m.on('click', this.onClick);
      m.on('mousemove', this.onMove);
      document.addEventListener('keydown', this.onKey);
      m.getCanvas().style.cursor = 'crosshair';
    } else {
      m.off('click', this.onClick);
      m.off('mousemove', this.onMove);
      document.removeEventListener('keydown', this.onKey);
      m.getCanvas().style.cursor = '';
      this.hover = null;
      this.pts = [];                                     // closing the tool wipes the drawing
    }
    this.update();
  }

  data() {
    const area = this.mode === 'area';
    const path = this.hover && this.on ? this.pts.concat([this.hover]) : this.pts.slice();
    const f = [];
    if (area && path.length >= 3) f.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [path.concat([path[0]])] } });
    if (path.length >= 2) {
      const line = area && path.length >= 3 ? path.concat([path[0]]) : path;
      f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } });
    }
    this.pts.forEach(p => f.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }));
    return { type: 'FeatureCollection', features: f };
  }

  addLayers() {
    const m = this.map;
    if (m.getSource('measure')) return;
    m.addSource('measure', { type: 'geojson', data: this.data() });
    m.addLayer({ id: 'measure-fill', type: 'fill', source: 'measure', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#e0bc62', 'fill-opacity': 0.2 } });
    m.addLayer({ id: 'measure-line', type: 'line', source: 'measure', filter: ['==', '$type', 'LineString'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#e0bc62', 'line-width': 2.5 } });
    m.addLayer({ id: 'measure-pts', type: 'circle', source: 'measure', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#161616', 'circle-stroke-color': '#e0bc62', 'circle-stroke-width': 2 } });
  }

  draw() {
    try {
      this.addLayers();
      const s = this.map.getSource('measure');
      if (s) s.setData(this.data());
    } catch (e) { /* style not ready yet */ }
  }

  update() {
    const area = this.mode === 'area';
    Object.entries(this.modeBtns).forEach(([id, b]) => b.classList.toggle('active', id === this.mode));
    if (area) {
      const ok = this.pts.length >= 3;
      this.readout.textContent = ok
        ? 'Area: ' + measureFmtArea(measureArea(this.pts)) + '\nPerimeter: ' + measureFmtLen(measureLength(this.pts, true))
        : 'Area: \u2013';
      this.hint.textContent = ok ? 'Click to add more corners.' : 'Click at least 3 corners on the map.';
    } else {
      this.readout.textContent = 'Distance: ' + (this.pts.length >= 2 ? measureFmtLen(measureLength(this.pts)) : '\u2013');
      this.hint.textContent = this.pts.length ? 'Click to continue the line.' : 'Click on the map to start measuring.';
    }
    this.draw();
  }
}

function initTools(map) {
  map.addControl(new ToolsControl(map), 'top-right');   // under the zoom buttons
}