// Place search in the top-left corner, using MapTiler Geocoding (same key as the base map).
class SearchControl {
  constructor(map, key) {
    this.map = map;
    this.key = key;
    this.results = [];
    this.active = -1;
    this.timer = null;
    this.seq = 0;
  }

  onAdd() {
    const el = this.el = document.createElement('div');
    el.className = 'maplibregl-ctrl search';

    const input = this.input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Search places or lat, lng';
    input.setAttribute('aria-label', 'Search places');
    input.autocomplete = 'off';

    const list = this.list = document.createElement('ul');
    list.className = 'search-results';
    list.hidden = true;

    el.append(input, list);

    input.addEventListener('input', () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.query(input.value.trim()), 300);
    });
    input.addEventListener('keydown', e => this.onKey(e));
    input.addEventListener('focus', () => { if (this.results.length) this.list.hidden = false; });
    this.outside = e => { if (!el.contains(e.target)) list.hidden = true; };
    document.addEventListener('mousedown', this.outside);
    return el;
  }

  onRemove() {
    document.removeEventListener('mousedown', this.outside);
    this.el.remove();
  }

  async query(text) {
    if (text.length < 2) { this.show([]); return; }
    const coords = this.parseCoords(text);
    if (coords) { // "lat, lng" typed or pasted: skip the geocoder
      ++this.seq;
      this.show([{
        place_name: 'Go to ' + coords.lat.toFixed(5) + ', ' + coords.lng.toFixed(5),
        center: [coords.lng, coords.lat],
        isCoords: true
      }]);
      return;
    }
    const id = ++this.seq;
    const c = this.map.getCenter();
    const lng = ((c.lng + 540) % 360) - 180; // keep within -180..180 after world wrap
    const base = 'https://api.maptiler.com/geocoding/' + encodeURIComponent(text) + '.json?key=' + this.key;

    // Try with the richest options first; if the API answers 400, retry with fewer.
    const attempts = [
      '&limit=10&proximity=' + lng.toFixed(4) + ',' + c.lat.toFixed(4),
      '&limit=10',
      ''
    ];
    try {
      let data = null;
      for (const extra of attempts) {
        const res = await fetch(base + extra);
        if (res.ok) { data = await res.json(); break; }
        const body = await res.text().catch(() => '');
        console.warn('Geocoding ' + res.status + ' for "' + extra + '":', body);
        if (res.status !== 400) throw new Error('Geocoding request failed: ' + res.status);
      }
      if (!data) throw new Error('Geocoding rejected the request (400)');
      if (id !== this.seq) return; // a newer search replaced this one
      this.show(this.preferNearby(data.features || [], c).slice(0, 8));
    } catch (err) {
      console.error('Search error:', err);
      if (id === this.seq) this.show([], 'Search is unavailable');
    }
  }

  // Reads "49.24891, 34.19907" as lat, lng (the order the coordinates panel copies).
  // If the first number can't be a latitude (|n| > 90), the pair is read as lng, lat.
  parseCoords(text) {
    const m = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!m) return null;
    let lat = parseFloat(m[1]);
    let lng = parseFloat(m[2]);
    if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) [lat, lng] = [lng, lat];
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  }

  // Keep MapTiler's relevance order, but put results near the current map view first.
  preferNearby(features, center) {
    const NEAR_KM = 1500;
    const rad = d => d * Math.PI / 180;
    const km = f => {
      if (!f.center) return Infinity;
      const [lng, lat] = f.center;
      const a = Math.sin(rad(lat - center.lat) / 2) ** 2 +
        Math.cos(rad(center.lat)) * Math.cos(rad(lat)) * Math.sin(rad(lng - center.lng) / 2) ** 2;
      return 12742 * Math.asin(Math.sqrt(a));
    };
    const near = features.filter(f => km(f) <= NEAR_KM);
    const far = features.filter(f => km(f) > NEAR_KM);
    return near.concat(far);
  }

  show(features, message) {
    this.results = features;
    this.active = -1;
    this.list.replaceChildren();
    if (!features.length) {
      if (message || this.input.value.trim().length >= 2) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = message || 'No results';
        this.list.append(li);
        this.list.hidden = false;
      } else {
        this.list.hidden = true;
      }
      return;
    }
    features.forEach((f, i) => {
      const li = document.createElement('li');
      li.textContent = f.place_name || f.text || 'Unnamed place';
      li.addEventListener('mousedown', e => { e.preventDefault(); this.pick(i); });
      this.list.append(li);
    });
    this.list.hidden = false;
  }

  onKey(e) {
    const n = this.results.length;
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      this.setActive((this.active + 1) % n);
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      this.setActive((this.active - 1 + n) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (n) this.pick(this.active >= 0 ? this.active : 0);
      else this.query(this.input.value.trim());
    } else if (e.key === 'Escape') {
      this.list.hidden = true;
      this.input.blur();
    }
  }

  setActive(i) {
    this.active = i;
    [...this.list.children].forEach((li, idx) => li.classList.toggle('active', idx === i));
  }

  pick(i) {
    const f = this.results[i];
    if (!f) return;
    this.input.value = f.place_name || f.text || '';
    this.list.hidden = true;
    this.input.blur();
    if (f.bbox && f.bbox.length === 4) {
      this.map.fitBounds([[f.bbox[0], f.bbox[1]], [f.bbox[2], f.bbox[3]]],
        { maxZoom: 14, padding: 40, duration: 1200 });
    } else if (f.center) {
      this.map.flyTo({ center: f.center, zoom: f.isCoords ? 13 : 12, duration: 1200 });
    }
  }
}