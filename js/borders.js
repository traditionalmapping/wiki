// ============================================================================
//  HISTORICAL BORDERS  (button in the bottom-left corner)
//
//  Shows an OUTLINE of the borders as they were on 1 JANUARY of the chosen year
//  (except 1939 = 1 SEPTEMBER 1939 and 1945 = 5 JUNE 1945; see BORDER_DATE_LABELS below).
//  One GeoJSON file per year, in the site folder:
//
//      data/borders/1939.geojson
//      data/borders/1940.geojson
//      ...
//
//  Polygons or lines both work; only the outline is drawn.
//  To add a year: add it to BORDER_YEARS and drop in the matching file.
// ============================================================================
const BORDER_YEARS = [1939, 1940, 1941, 1942, 1943, 1944, 1945];
const bordersUrl = year => 'data/borders/' + year + '.geojson';

// Years that do NOT use 1 January go here; every other year is "1 January <year>".
const BORDER_DATE_LABELS = { 1939: '1 September 1939', 1945: '5 June 1945' };
const borderDate = year => BORDER_DATE_LABELS[year] || '1 January ' + year;

// The same dates in sortable form (YYYY-MM-DD). Keep in sync with BORDER_DATE_LABELS.
// js/countries.js uses them to pick the leaders and government in office on that day.
const BORDER_ISO_DATES = { 1939: '1939-09-01', 1945: '1945-06-05' };
const borderIsoDate = year => BORDER_ISO_DATES[year] || year + '-01-01';

// The year chosen with the year buttons. Other scripts read it, and are told through
// the "borderyearchange" event on document whenever it changes.
let selectedBorderYear = BORDER_YEARS[0];
const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

// Outline color: gold on the Dark map, black on the light OSM map.
// (`current` is the active base map id, defined in map.js)
const borderColor = () => (typeof current !== 'undefined' && current === 'osm') ? '#000000' : '#c9a24b';

class BordersControl {
  constructor(map) {
    this.map = map;
    this.on = false;
    this.year = BORDER_YEARS[0];
    this.cache = {};      // year -> loaded GeoJSON
  }

  onAdd() {
    const el = this.el = document.createElement('div');
    el.className = 'maplibregl-ctrl history borders';   // reuses the History button styling

    const toggle = this.toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'history-toggle';
    toggle.textContent = 'Historical Borders: OFF';
    toggle.setAttribute('aria-pressed', 'false');
    toggle.addEventListener('click', () => this.setOn(!this.on));

    const panel = this.panel = document.createElement('div');
    panel.className = 'history-panel';
    panel.hidden = true;

    const note = this.note = document.createElement('div');
    note.className = 'borders-note';

    const years = document.createElement('div');
    years.className = 'borders-years';
    this.yearButtons = BORDER_YEARS.map(y => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'borders-year';
      b.textContent = y;
      b.dataset.year = y;
      b.addEventListener('click', () => this.setYear(y));
      years.append(b);
      return b;
    });

    this.status = document.createElement('div');
    this.status.className = 'history-status';
    this.status.hidden = true;

    panel.append(note, years, this.status);
    el.append(panel, toggle);
    this.refreshButtons();
    return el;
  }

  onRemove() { this.el.remove(); }

  setOn(value) {
    this.on = value;
    this.toggle.classList.toggle('active', value);
    this.toggle.textContent = value ? 'Historical Borders: ON' : 'Historical Borders: OFF';
    this.toggle.setAttribute('aria-pressed', String(value));
    this.panel.hidden = !value;
    this.apply();
    if (value) this.load();
    else this.say('');
  }

  setYear(year) {
    this.year = year;
    selectedBorderYear = year;
    document.dispatchEvent(new CustomEvent('borderyearchange', { detail: { year } }));
    this.refreshButtons();
    this.load();
  }

  refreshButtons() {
    this.yearButtons.forEach(b => b.classList.toggle('active', Number(b.dataset.year) === this.year));
    const date = document.createElement('strong');
    date.textContent = borderDate(this.year);
    this.note.replaceChildren('Situation on ', date);
  }

  // (Re)draws the layer; also called after every base map switch.
  apply() {
    const map = this.map;
    if (map.getLayer('borders-line')) map.removeLayer('borders-line');
    if (map.getSource('borders')) map.removeSource('borders');
    if (!this.on) return;

    map.addSource('borders', { type: 'geojson', data: this.cache[this.year] || EMPTY_GEOJSON });
    map.addLayer({
      id: 'borders-line',
      type: 'line',
      source: 'borders',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': borderColor(),
        'line-opacity': 0.9,
        'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.8, 6, 1.5, 10, 2.5]
      }
    });
  }

  // Switches the outline color if the base map changed but the layer survived.
  refreshColor() {
    const map = this.map;
    const color = borderColor();
    if (map.getLayer('borders-line') && map.getPaintProperty('borders-line', 'line-color') !== color) {
      map.setPaintProperty('borders-line', 'line-color', color);
    }
  }

  // Loads the file for the selected year, with a clear message if something is wrong.
  async load() {
    const year = this.year;
    this.say('');

    if (!this.cache[year]) {
      if (location.protocol === 'file:') {
        this.show(EMPTY_GEOJSON);
        this.say('Open the site through a local server (for example VS Code "Live Server"). Browsers cannot read files from file://.');
        return;
      }
      try {
        const res = await fetch(bordersUrl(year));
        if (res.status === 404) {
          if (year === this.year) { this.show(EMPTY_GEOJSON); this.say('No border data yet for ' + year + ' (' + bordersUrl(year) + ').'); }
          return;
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        this.cache[year] = await res.json();
      } catch (e) {
        if (year === this.year) { this.show(EMPTY_GEOJSON); this.say('Could not load ' + bordersUrl(year) + '. Is it valid GeoJSON?'); }
        return;
      }
    }

    if (year !== this.year) return;   // another year was clicked while loading
    this.show(this.cache[year]);
  }

  show(data) {
    const src = this.map.getSource('borders');
    if (src) src.setData(data);
  }

  say(text) {
    this.status.textContent = text;
    this.status.hidden = !text;
  }
}

function initBorders(map) {
  const control = new BordersControl(map);
  map.addControl(control, 'bottom-left');
  onStyleReady(() => control.apply()); // keep the outline when the base map changes

  // Safety net: some base map switches update the style in place and never fire
  // "style.load", which wipes the outline without redrawing it. Whenever the style
  // changes and the outline is missing while it should be on, draw it again.
  let redrawing = false;
  map.on('styledata', () => {
    if (redrawing || !control.on) return;
    if (map.getLayer('borders-line')) { control.refreshColor(); return; }
    redrawing = true;
    try { control.apply(); } catch (e) { /* style not ready yet; the next styledata retries */ }
    redrawing = false;
  });

  // Tell the CSS how tall the bottom-left stack is (scale, History, Borders and their
  // panels), so the video list on the left stops above it instead of covering it.
  const corner = document.querySelector('.maplibregl-ctrl-bottom-left');
  if (corner && 'ResizeObserver' in window) {
    const sync = () => document.documentElement.style.setProperty('--bl-height', corner.offsetHeight + 'px');
    new ResizeObserver(sync).observe(corner);
    sync();
  }
}