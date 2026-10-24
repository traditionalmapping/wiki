const DEFAULT_BASEMAP = 'dark';

let current = DEFAULT_BASEMAP;
try {
  const saved = localStorage.getItem('basemap');
  if (saved && BASEMAPS[saved]) current = saved;
} catch (e) {}

// --- Layers that must survive base map switches ---------------------------
// setStyle() wipes all custom sources/layers, so register them here:
//   onStyleReady(() => { map.addSource(...); map.addLayer(...); });
const styleReadyHandlers = [];
let map;
function onStyleReady(fn) {
  styleReadyHandlers.push(fn);
  if (map && map.isStyleLoaded()) fn();
}

// --- Base map switcher -----------------------------------------------------
class BasemapControl {
  onAdd() {
    this.el = document.createElement('div');
    this.el.className = 'maplibregl-ctrl basemap-switch';
    Object.entries(BASEMAPS).forEach(([id, bm]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = bm.label;
      b.dataset.id = id;
      b.classList.toggle('active', id === current);
      b.addEventListener('click', () => setBasemap(id));
      this.el.appendChild(b);
    });
    return this.el;
  }
  onRemove() { this.el.remove(); }
  refresh() {
    this.el.querySelectorAll('button').forEach(b =>
      b.classList.toggle('active', b.dataset.id === current));
  }
}
const basemapControl = new BasemapControl();

async function setBasemap(id) {
  if (id === current || !BASEMAPS[id]) return;
  try {
    const style = await resolveStyle(id);
    current = id;
    try { localStorage.setItem('basemap', id); } catch (e) {}
    map.setStyle(style);
    basemapControl.refresh();
  } catch (err) {
    console.error('Could not switch base map:', err);
  }
}

// --- Init ------------------------------------------------------------------
(async function init() {
  let style;
  try {
    style = await resolveStyle(current);
  } catch (err) {
    console.error('Base map failed, falling back to OSM:', err);
    current = 'osm';
    style = await resolveStyle('osm');
  }

  map = new maplibregl.Map({
    container: 'map',
    style,
    // Start with all of Europe in view, whatever the screen size
    bounds: [[-25, 34], [45, 72]],
    fitBoundsOptions: { padding: 20 },
    minZoom: 2,
    maxZoom: 18,
    maxPitch: 60,
    pitchWithRotate: false, // built-in tilt is too fast; replaced by slower tilt below
    touchPitch: false,
    attributionControl: { compact: true }
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
  map.addControl(new MenuButtonControl(), 'top-left');
  map.addControl(basemapControl, 'top-left');
  map.addControl(new SearchControl(map, MAPTILER_KEY), 'top-left');


  // --- Slower tilt: right-drag (or Ctrl+drag) up/down. Left/right still rotates. ---
  const TILT_SPEED = 0.15; // degrees per pixel (lower = slower)
  let tilt = null;
  const canvasBox = map.getCanvasContainer();
  canvasBox.addEventListener('mousedown', e => {
    if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
      tilt = { y: e.clientY, pitch: map.getPitch() };
    }
  });
  window.addEventListener('mousemove', e => {
    if (!tilt) return;
    const p = tilt.pitch + (e.clientY - tilt.y) * TILT_SPEED;
    map.setPitch(Math.max(0, Math.min(60, p)));
  });
  window.addEventListener('mouseup', () => { tilt = null; });

  // --- Coordinates panel (center of the screen = the cross) ---
  const coordsText = document.getElementById('coords-text');
  const copyBtn = document.getElementById('coords-copy');
  const fmt = () => {
    const c = map.getCenter();
    return c.lat.toFixed(5) + ', ' + c.lng.toFixed(5); // lat, lng
  };
  const updateCoords = () => { coordsText.textContent = fmt(); };
  map.on('move', updateCoords);
  updateCoords();

  copyBtn.addEventListener('click', async () => {
    const text = fmt();
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      const t = document.createElement('textarea'); // fallback (e.g. file://)
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    copyBtn.textContent = 'Copied';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
  });

  addVideoPlaces(map); // panels from js/places.js
  initContinents(map);
  initHistory(map);    // History button, js/history.js

  map.on('style.load', () => styleReadyHandlers.forEach(fn => fn()));
  map.on('error', e => {
    const err = e.error || e;
    console.error('Map error:', err);
    // If MapTiler refuses the request (bad key, blocked domain, quota), fall back to OSM
    // so the visitor still gets a map instead of a blank screen.
    const refused = [401, 403, 429].includes(err.status) && String(err.url || '').includes('maptiler.com');
    if (refused && current === 'dark') {
      console.warn('Dark base map was refused by MapTiler (HTTP ' + err.status + '). Switching to OSM.');
      setBasemap('osm');
    }
  });
})();