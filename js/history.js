// ============================================================================
//  HISTORICAL MAPS  (shown from the "History" button, bottom-left)
//
//  Each historical map is ONE .pmtiles file (see the steps in the chat).
//  Put it in the site folder, e.g.  tiles/rkka-europe.pmtiles
//
//  To add another historical map: copy one { ... } block, paste it after the
//  last one, and change id, label and pmtiles.
// ============================================================================
const HISTORY_MAPS = [
  {
    id: 'rkka-europe',
    label: 'RKKA Europe',
    pmtiles: 'tiles/rkka-europe.pmtiles',
    opacity: 0.75,
    attribution: ''
  }
];

class HistoryControl {
  constructor(map) {
    this.map = map;
    this.on = false;
    this.index = 0;
    this.opacity = HISTORY_MAPS[0].opacity;
  }

  get cfg() { return HISTORY_MAPS[this.index]; }

  // Full address of the file (the PMTiles reader needs an absolute URL)
  get fileUrl() { return new URL(this.cfg.pmtiles, document.baseURI).href; }

  onAdd() {
    const el = this.el = document.createElement('div');
    el.className = 'maplibregl-ctrl history';

    const toggle = this.toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'history-toggle';
    toggle.textContent = 'History';
    toggle.setAttribute('aria-pressed', 'false');
    toggle.addEventListener('click', () => this.setOn(!this.on));

    const panel = this.panel = document.createElement('div');
    panel.className = 'history-panel';
    panel.hidden = true;

    const row = document.createElement('label');
    row.className = 'history-row';
    row.append('Opacity');
    const slider = this.slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 10;
    slider.max = 100;
    slider.value = Math.round(this.opacity * 100);
    slider.addEventListener('input', () => {
      this.opacity = slider.value / 100;
      if (this.map.getLayer('history-layer')) {
        this.map.setPaintProperty('history-layer', 'raster-opacity', this.opacity);
      }
    });
    row.append(slider);

    if (HISTORY_MAPS.length > 1) {
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Historical map');
      HISTORY_MAPS.forEach((m, i) => select.add(new Option(m.label, i)));
      select.addEventListener('change', () => {
        this.index = Number(select.value);
        this.opacity = this.cfg.opacity;
        slider.value = Math.round(this.opacity * 100);
        this.apply();
        this.check();
      });
      panel.append(select);
    }

    this.status = document.createElement('div');
    this.status.className = 'history-status';
    this.status.hidden = true;

    panel.append(row, this.status);
    el.append(panel, toggle);
    return el;
  }

  onRemove() { this.el.remove(); }

  setOn(value) {
    this.on = value;
    this.toggle.classList.toggle('active', value);
    this.toggle.setAttribute('aria-pressed', String(value));
    this.panel.hidden = !value;
    this.apply();
    if (value) this.check();
  }

  // (Re)draws the layer; also called after every base map switch.
  apply() {
    const map = this.map;
    if (map.getLayer('history-layer')) map.removeLayer('history-layer');
    HISTORY_MAPS.forEach(m => { if (map.getSource('history-' + m.id)) map.removeSource('history-' + m.id); });
    if (!this.on) return;

    const c = this.cfg;
    map.addSource('history-' + c.id, {
      type: 'raster',
      url: 'pmtiles://' + this.fileUrl,   // zoom range and bounds come from the file itself
      tileSize: 256,
      attribution: c.attribution
    });
    map.addLayer({
      id: 'history-layer',
      type: 'raster',
      source: 'history-' + c.id,
      paint: { 'raster-opacity': this.opacity, 'raster-fade-duration': 150 }
    });
  }

  // Tells you why the overlay is empty, instead of failing silently.
  async check() {
    this.say('');
    if (typeof pmtiles === 'undefined') {
      this.say('The PMTiles reader did not load (internet connection or an ad blocker?).');
      return;
    }
    if (location.protocol === 'file:') {
      this.say('Open the site through a local server (for example VS Code "Live Server"). Browsers cannot read files from file://.');
      return;
    }
    const abort = new AbortController();
    try {
      const res = await fetch(this.fileUrl, { headers: { Range: 'bytes=0-6' }, signal: abort.signal });
      if (res.status === 404) {
        this.say('File not found: ' + this.cfg.pmtiles);
      } else if (res.status !== 206) {
        this.say('This server does not support range requests, which a single .pmtiles file needs. Use VS Code Live Server, or a host like Firebase Hosting.');
      } else if (new TextDecoder().decode(await res.arrayBuffer()) !== 'PMTiles') {
        this.say('That file is not a valid .pmtiles file.');
      }
    } catch (e) {
      this.say('Could not reach ' + this.cfg.pmtiles + '.');
    } finally {
      abort.abort(); // never download the whole file just to test it
    }
  }

  say(text) {
    this.status.textContent = text;
    this.status.hidden = !text;
  }
}

function initHistory(map) {
  if (typeof pmtiles !== 'undefined') {
    maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile);
  } else {
    console.warn('PMTiles reader failed to load; the History button will not work.');
  }
  const control = new HistoryControl(map);
  map.addControl(control, 'bottom-left');
  onStyleReady(() => control.apply()); // keep the overlay when the base map changes
}