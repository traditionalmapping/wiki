// ============================================================================
//  MY VIDEOS  (button in the bottom-left corner)
//
//  Lets every visitor pin THEIR OWN video file onto the map:
//    1. choose a video file from the computer,
//    2. type the coordinates of its four corners,
//    3. the video plays on the map at that place.
//
//  Nothing is uploaded anywhere. The file and the coordinates are stored in the
//  visitor's own browser (IndexedDB), so they are private to that person and that
//  browser. Clearing the browser's site data deletes them.
//
//  Needs one line in js/map.js, after initBorders(map):   initMyVideos(map);
// ============================================================================
const MYV_DB = 'tmw-myvideos';
const MYV_STORE = 'videos';
const MYV_MAX_LAT = 85.05;

const myvSrcId = id => 'myvid-' + id;
const myvLayerId = id => 'myvid-l-' + id;

// Paints the filled part of a range slider (the CSS reads --pct)
function myvFill(input) {
  const min = Number(input.min) || 0, max = Number(input.max) || 100;
  const pct = max > min ? (Number(input.value) - min) / (max - min) * 100 : 0;
  input.style.setProperty('--pct', Math.min(100, Math.max(0, pct)) + '%');
}

function myvEl(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ---------- storage (IndexedDB) ----------
function myvOpenDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB is not available')); return; }
    let req;
    try { req = indexedDB.open(MYV_DB, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => req.result.createObjectStore(MYV_STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function myvRun(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MYV_STORE, mode);
    let result;
    const req = fn(tx.objectStore(MYV_STORE));
    if (req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ---------- coordinates ----------
// Text with 4 points (8 numbers) or 2 points (4 numbers: top-left and bottom-right)
// -> { corners: [[lng,lat] x4] } in the order MapLibre wants
//    (top-left, top-right, bottom-right, bottom-left), or { error }.
function myvParseCorners(text, order) {
  const nums = (String(text).match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || []).map(Number);
  if (nums.length !== 8 && nums.length !== 4) {
    return { error: 'Enter 4 points (top-left, top-right, bottom-right, bottom-left) or 2 points (top-left, bottom-right). Found ' + nums.length / 2 + ' point(s).' };
  }
  const pts = [];
  for (let i = 0; i < nums.length; i += 2) {
    const a = nums[i], b = nums[i + 1];
    pts.push(order === 'lnglat' ? [a, b] : [b, a]);          // always stored as [lng, lat]
  }
  for (let i = 0; i < pts.length; i++) {
    const [lng, lat] = pts[i];
    if (!isFinite(lng) || !isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > MYV_MAX_LAT) {
      return { error: 'Point ' + (i + 1) + ' is outside the map. Check the order setting (lat, lng or lng, lat).' };
    }
  }
  if (pts.length === 2) {
    const [tl, br] = pts;
    return { corners: [tl, [br[0], tl[1]], br, [tl[0], br[1]]] };
  }
  return { corners: pts };
}

// seconds -> "1:05"
function myvClock(sec) {
  if (!isFinite(sec)) return '0:00';
  const t = Math.max(0, Math.round(sec));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}

// "1939-09-17" <-> milliseconds (UTC). The timeline maps the video's length onto these dates.
function myvDay(iso) {
  const m = /^(\d{4,6})-(\d\d)-(\d\d)$/.exec(iso || '');
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
}
// fraction of the video (0..1) -> the date it shows, snapped to a whole day
function myvFracToDate(it, frac) {
  const a = myvDay(it.startDate), b = myvDay(it.endDate);
  const ms = Math.round((a + frac * (b - a)) / 86400000) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

// ---------- placing a video by hand: the video is a rectangle (centre, size, angle) ----------
// Everything is kept in Mercator "world" units, so moving, rotating and resizing do not depend
// on the zoom level, and the result is turned back into 4 lng/lat corners.
function myvMerc(c) { return maplibregl.MercatorCoordinate.fromLngLat({ lng: c[0], lat: c[1] }); }

function myvCornersFromT(T) {
  const cos = Math.cos(T.a), sin = Math.sin(T.a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const lx = sx * T.w / 2, ly = sy * T.h / 2;
    const ll = new maplibregl.MercatorCoordinate(T.cx + lx * cos - ly * sin, T.cy + lx * sin + ly * cos, 0).toLngLat();
    return [ll.lng, ll.lat];
  });
}

function myvTFromCorners(corners) {
  const m = corners.map(myvMerc);
  const ux = m[1].x - m[0].x, uy = m[1].y - m[0].y, vx = m[3].x - m[0].x, vy = m[3].y - m[0].y;
  return { cx: (m[0].x + m[2].x) / 2, cy: (m[0].y + m[2].y) / 2, w: Math.hypot(ux, uy), h: Math.hypot(vx, vy), a: Math.atan2(uy, ux) };
}

function myvSvg(name, attrs, cls) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.keys(attrs || {}).forEach(k => e.setAttribute(k, attrs[k]));
  if (cls) e.setAttribute('class', cls);
  return e;
}

function myvFormatCorners(corners, order) {
  const r = n => Math.round(n * 1e6) / 1e6;
  return corners.map(c => order === 'lnglat' ? r(c[0]) + ', ' + r(c[1]) : r(c[1]) + ', ' + r(c[0])).join('\n');
}

// Checks that the browser can actually play the chosen file.
function myvCanPlay(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    let done = false;
    const finish = ok => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeAttribute('src');
      v.load();
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), 10000);
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => finish(true);
    v.onerror = () => finish(false);
    v.src = url;
  });
}

class MyVideosControl {
  constructor(map) {
    this.map = map;
    this.items = [];             // { id, name, blob, corners, opacity, visible }
    this.urls = new Map();       // id -> blob: URL
    this.db = null;
    this.editingId = null;
    this.ui = new Map();         // id -> timeline controls in the list
    this.media = new Map();      // id -> hidden video + canvas used for cropped videos
    this.crop = { x: 0, y: 0, w: 1, h: 1 };   // crop shown in the form (fractions of the video)
    this.previewUrl = null;
  }

  onAdd() {
    const el = this.el = myvEl('div', 'maplibregl-ctrl history myv');

    const toggle = this.toggle = myvEl('button', 'history-toggle', 'My Videos');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => this.setOpen(this.panel.hidden));

    // A floating panel of its own (not inside the bottom-left stack), so it never
    // squeezes or overlaps the video list on the left.
    const panel = this.panel = myvEl('div', 'myv-panel');
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'My Videos');

    const head = myvEl('div', 'myv-head');
    head.append(myvEl('div', 'myv-title', 'Pin your own videos on the map'));
    const closeBtn = myvEl('button', 'myv-icon myv-close', '\u2715');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', () => { this.setOpen(false); this.toggle.focus(); });
    head.append(closeBtn);
    panel.append(head);
    panel.addEventListener('keydown', e => {
      if (e.key === 'Escape') { this.setOpen(false); this.toggle.focus(); }
    });
    panel.append(myvEl('div', 'myv-hint', 'Your files stay in this browser only. Nothing is uploaded and nobody else can see them.'));

    this.listEl = myvEl('div', 'myv-list');
    panel.append(this.listEl);

    // ----- form -----
    const form = this.form = myvEl('div', 'myv-form');

    const fileLabel = myvEl('label', 'myv-field');
    fileLabel.append(myvEl('span', 'myv-label', 'Video file'));
    this.fileIn = myvEl('input');
    this.fileIn.type = 'file';
    this.fileIn.accept = 'video/*';
    fileLabel.append(this.fileIn);
    this.fileIn.addEventListener('change', () => {
      const f = this.fileIn.files && this.fileIn.files[0];
      if (!f) { if (!this.editingId) this.hideCropEditor(); return; }
      if (!this.editingId) this.crop = { x: 0, y: 0, w: 1, h: 1 };
      this.showCropEditor(f);
    });
    const cropBox = this.buildCropEditor();

    const nameLabel = myvEl('label', 'myv-field');
    nameLabel.append(myvEl('span', 'myv-label', 'Name'));
    this.nameIn = myvEl('input');
    this.nameIn.type = 'text';
    this.nameIn.maxLength = 80;
    this.nameIn.placeholder = 'optional';
    nameLabel.append(this.nameIn);

    const cornerLabel = myvEl('div', 'myv-field');
    const cornerHead = myvEl('div', 'myv-row');
    cornerHead.append(myvEl('span', 'myv-label', 'Corners (optional)'));
    this.orderSel = myvEl('select');
    [['latlng', 'lat, lng'], ['lnglat', 'lng, lat']].forEach(([v, t]) => {
      const o = myvEl('option', '', t);
      o.value = v;
      this.orderSel.append(o);
    });
    cornerHead.append(this.orderSel);
    this.cornersIn = myvEl('textarea');
    this.cornersIn.rows = 5;
    this.cornersIn.spellcheck = false;
    this.cornersIn.placeholder = 'Leave empty: the video appears at the crosshair and you move, rotate and resize it by hand.\n\nOr type points, one per line:\ntop-left, top-right, bottom-right, bottom-left\n(or 2 points: top-left and bottom-right)';
    cornerLabel.append(cornerHead, this.cornersIn);
    cornerLabel.append(myvEl('div', 'myv-hint', 'Leave this empty to drop the video at the crosshair and place it by hand. If you cropped the video, the corners are those of the cropped part.'));

    const dateField = myvEl('div', 'myv-field');
    dateField.append(myvEl('span', 'myv-label', 'Timeline (optional)'));
    const dateRow = myvEl('div', 'myv-dates');
    const dateBox = (text, input) => {
      const l = myvEl('label', 'myv-datebox');
      l.append(myvEl('span', 'myv-hint', text), input);
      return l;
    };
    this.startIn = myvEl('input');
    this.startIn.type = 'date';
    this.endIn = myvEl('input');
    this.endIn.type = 'date';
    dateRow.append(dateBox('First frame is', this.startIn), dateBox('Last frame is', this.endIn));
    dateField.append(dateRow, myvEl('div', 'myv-hint', 'With both dates set, every video gets a timeline: pick a date (for example 1939-09-17) and the video jumps to that moment.'));

    const opLabel = myvEl('label', 'myv-field');
    opLabel.append(myvEl('span', 'myv-label', 'Opacity'));
    this.opIn = myvEl('input');
    this.opIn.type = 'range';
    this.opIn.min = '0.1';
    this.opIn.max = '1';
    this.opIn.step = '0.05';
    this.opIn.value = '1';
    myvFill(this.opIn);
    this.opIn.addEventListener('input', () => {
      myvFill(this.opIn);
      if (this.editingId) this.map.getLayer(myvLayerId(this.editingId)) &&
        this.map.setPaintProperty(myvLayerId(this.editingId), 'raster-opacity', Number(this.opIn.value));
    });
    opLabel.append(this.opIn);

    const sharpLabel = myvEl('label', 'myv-check');
    this.sharpIn = myvEl('input');
    this.sharpIn.type = 'checkbox';
    sharpLabel.append(this.sharpIn, myvEl('span', '', 'Sharp pixels (no smoothing when zoomed in)'));

    const buttons = myvEl('div', 'myv-row');
    this.submitBtn = myvEl('button', 'myv-btn myv-primary', 'Add to map');
    this.submitBtn.type = 'button';
    this.submitBtn.addEventListener('click', () => this.submit());
    this.cancelBtn = myvEl('button', 'myv-btn', 'Cancel');
    this.cancelBtn.type = 'button';
    this.cancelBtn.hidden = true;
    this.cancelBtn.addEventListener('click', () => this.resetForm());
    buttons.append(this.submitBtn, this.cancelBtn);

    this.status = myvEl('div', 'myv-status');
    this.status.hidden = true;

    form.append(fileLabel, cropBox, nameLabel, cornerLabel, dateField, opLabel, sharpLabel, buttons, this.status);
    panel.append(form);

    el.append(toggle);
    document.body.append(panel);
    this.renderList();
    return el;
  }

  onRemove() {
    if (this.tf) this.endTransform(false);
    this.media.forEach((m, id) => this.disposeMedia(id));
    this.urls.forEach(u => URL.revokeObjectURL(u));
    this.hideCropEditor();
    this.cropModal.remove();
    this.panel.remove();
    this.el.remove();
  }

  setOpen(open) {
    this.panel.hidden = !open;
    this.toggle.classList.toggle('active', open);
    this.toggle.setAttribute('aria-expanded', String(open));
  }

  say(text, isError) {
    this.status.textContent = text || '';
    this.status.hidden = !text;
    this.status.classList.toggle('error', !!isError);
  }

  // Reads the saved videos from the browser and draws them.
  async load() {
    try {
      this.db = await myvOpenDb();
      const all = await myvRun(this.db, 'readonly', s => s.getAll());
      this.items = (all || []).sort((a, b) => (a.created || 0) - (b.created || 0));
    } catch (e) {
      this.db = null;
      this.say('This browser cannot save videos (private mode?). They will be lost when you reload.', true);
    }
    this.renderList();
    this.redrawAll();
  }

  async save(item) {
    if (!this.db) return false;
    try { await myvRun(this.db, 'readwrite', s => s.put(item)); return true; }
    catch (e) { return false; }
  }

  // ---------- drawing on the map ----------
  drawOne(it) {
    const map = this.map;
    const sid = myvSrcId(it.id), lid = myvLayerId(it.id);
    try {
      if (map.getLayer(lid)) map.removeLayer(lid);
      if (map.getSource(sid)) map.removeSource(sid);
      if (!it.visible) {
        const hidden = this.media.get(it.id);
        if (hidden) hidden.video.pause();            // no need to keep decoding a hidden video
        return;
      }
      if (this.isCropped(it)) { this.drawCropped(it); return; }
      let url = this.urls.get(it.id);
      if (!url) { url = URL.createObjectURL(it.blob); this.urls.set(it.id, url); }
      map.addSource(sid, { type: 'video', urls: [url], coordinates: it.corners });
      // Under the border outlines when they are on
      const before = map.getLayer('borders-glow-1') ? 'borders-glow-1' : undefined;
      map.addLayer({
        id: lid, type: 'raster', source: sid,
        paint: { 'raster-opacity': it.opacity, 'raster-fade-duration': 0, 'raster-resampling': it.sharp ? 'nearest' : 'linear' }
      }, before);
      const src = map.getSource(sid);
      const v = src && src.getVideo && src.getVideo();
      if (v) {
        v.muted = true;                 // browsers only autoplay muted video
        v.loop = true;
        v.playsInline = true;
        const p = v.play();
        if (p && p.catch) p.catch(() => {});
        this.bindVideo(it, v);
      }
    } catch (e) { /* style not ready yet; the next styledata retries */ }
  }

  videoOf(it) {
    const m = this.media.get(it.id);
    if (m) return m.video;
    try {
      const src = this.map.getSource(myvSrcId(it.id));
      return src && src.getVideo ? src.getVideo() : null;
    } catch (e) { return null; }
  }

  // Keep the timeline in the list in step with the playing video
  bindVideo(it, v) {
    if (v._myvBound) return;
    v._myvBound = true;
    const sync = () => this.syncTimeline(it, v);
    ['timeupdate', 'play', 'pause', 'loadedmetadata', 'seeked'].forEach(ev => v.addEventListener(ev, sync));
  }

  syncTimeline(it, v) {
    const ui = this.ui.get(it.id);
    if (!ui || !v) return;
    ui.play.textContent = v.paused ? '\u25B6' : '\u275A\u275A';
    if (Date.now() < ui.holdUntil) return;                 // the person is dragging / typing
    if (!isFinite(v.duration) || !v.duration) return;
    const frac = Math.min(1, v.currentTime / v.duration);
    ui.slider.value = String(Math.round(frac * 1000));
    myvFill(ui.slider);
    if (ui.dateIn && document.activeElement !== ui.dateIn) ui.dateIn.value = myvFracToDate(it, frac);
    if (ui.timeEl) ui.timeEl.textContent = myvClock(v.currentTime) + ' / ' + myvClock(v.duration);
  }

  // Jumps the video to a point (0..1). MapLibre only refreshes a video's picture while it is
  // playing, so the video plays for a split second after the jump and is then paused.
  seekTo(v, frac) {
    const t = Math.min(Math.max(frac * v.duration, 0), Math.max(v.duration - 0.05, 0));
    v.currentTime = t;
    if (v._myvCropped) return;          // a cropped picture is redrawn when the jump finishes
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
    clearTimeout(v._myvPause);
    v._myvPause = setTimeout(() => { v.pause(); this.map.triggerRepaint(); }, 150);
  }

  // The timeline under a video in the list. With dates it shows a date box (type 1939-09-17 and the
  // video jumps there); without dates it shows the plain time (0:12 / 1:30).
  timelineEl(it) {
    const a = myvDay(it.startDate), b = myvDay(it.endDate);
    const hasDates = isFinite(a) && isFinite(b) && b > a;

    const tl = myvEl('div', 'myv-timeline');
    const line1 = myvEl('div', 'myv-tl-line');
    const play = myvEl('button', 'myv-icon myv-play', '\u275A\u275A');
    play.type = 'button';
    play.title = 'Play / pause';
    const slider = myvEl('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1000';
    slider.value = '0';
    slider.setAttribute('aria-label', 'Timeline of ' + it.name);
    line1.append(play, slider);

    const line2 = myvEl('div', 'myv-tl-line');
    let dateIn = null, timeEl = null;
    if (hasDates) {
      dateIn = myvEl('input');
      dateIn.type = 'date';
      dateIn.min = it.startDate;
      dateIn.max = it.endDate;
      dateIn.value = it.startDate;
      dateIn.setAttribute('aria-label', 'Go to date');
      line2.append(dateIn, myvEl('span', 'myv-range', it.startDate + ' \u2192 ' + it.endDate));
    } else {
      timeEl = myvEl('span', 'myv-range myv-time', '0:00 / 0:00');
      line2.append(timeEl, myvEl('span', 'myv-range', 'Add dates with Edit to jump by date'));
    }
    tl.append(line1, line2);

    const ui = { slider, dateIn, timeEl, play, holdUntil: 0 };
    this.ui.set(it.id, ui);

    play.addEventListener('click', () => {
      const v = this.videoOf(it);
      if (!v) return;
      if (v.paused) {
        clearTimeout(v._myvPause);
        const p = v.play();
        if (p && p.catch) p.catch(() => {});
      } else v.pause();
    });
    slider.addEventListener('input', () => {
      const v = this.videoOf(it);
      if (!v || !isFinite(v.duration)) return;
      const frac = Number(slider.value) / 1000;
      myvFill(slider);
      ui.holdUntil = Date.now() + 400;
      if (dateIn) dateIn.value = myvFracToDate(it, frac);
      if (timeEl) timeEl.textContent = myvClock(frac * v.duration) + ' / ' + myvClock(v.duration);
      this.seekTo(v, frac);
    });
    if (dateIn) {
      dateIn.addEventListener('change', () => {
        const v = this.videoOf(it);
        const d = myvDay(dateIn.value);
        if (!v || !isFinite(v.duration) || !isFinite(d)) return;
        const frac = Math.min(1, Math.max(0, (d - a) / (b - a)));   // dates outside the video snap to its ends
        ui.holdUntil = Date.now() + 400;
        slider.value = String(Math.round(frac * 1000));
        myvFill(slider);
        dateIn.value = myvFracToDate(it, frac);
        this.seekTo(v, frac);
      });
    }

    this.syncTimeline(it, this.videoOf(it));
    return tl;
  }

  redrawAll() { this.items.forEach(it => this.drawOne(it)); }

  allDrawn() {
    return this.items.every(it => {
      const m = this.media.get(it.id);
      return !it.visible || this.map.getLayer(myvLayerId(it.id)) || (m && m.pending);
    });
  }

  flyTo(it) {
    const lngs = it.corners.map(c => c[0]), lats = it.corners.map(c => c[1]);
    this.map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 80, duration: 1200, maxZoom: 12 });
  }

  // ---------- placing by hand ----------
  pxToWorld() {
    const cv = this.map.getCanvas();
    const a = myvMerc(this.map.unproject([cv.clientWidth / 2, cv.clientHeight / 2]).toArray());
    const b = myvMerc(this.map.unproject([cv.clientWidth / 2 + 100, cv.clientHeight / 2]).toArray());
    return Math.hypot(b.x - a.x, b.y - a.y) / 100;
  }

  // Corners of a new video sitting in the middle of the screen (where the crosshair is)
  spawnCorners(crop) {
    const pv = this.cropVideo;
    const c = crop || { w: 1, h: 1 };
    const aspect = ((pv.videoWidth || 16) * c.w) / ((pv.videoHeight || 9) * c.h);
    const cv = this.map.getCanvas();
    let wpx = cv.clientWidth * 0.4;
    let hpx = wpx / aspect;
    if (hpx > cv.clientHeight * 0.5) { hpx = cv.clientHeight * 0.5; wpx = hpx * aspect; }
    const k = this.pxToWorld();
    const mc = myvMerc(this.map.getCenter().toArray());
    return myvCornersFromT({ cx: mc.x, cy: mc.y, w: wpx * k, h: hpx * k, a: 0 });
  }

  applyCorners(it) {
    try {
      const src = this.map.getSource(myvSrcId(it.id));
      if (src && typeof src.setCoordinates === 'function') src.setCoordinates(it.corners);
    } catch (e) { /* not drawn yet */ }
  }

  startTransform(it, fly) {
    if (this.tf) this.endTransform(true);
    const map = this.map;
    this.tfWasOpen = !this.panel.hidden;
    this.setOpen(false);
    if (!it.visible) { it.visible = true; this.drawOne(it); this.renderList(); }
    if (fly) this.flyTo(it);

    const host = map.getCanvasContainer();
    const svg = myvSvg('svg', {}, 'myv-tf');
    const poly = myvSvg('polygon', {}, 'myv-tf-poly');
    const rotLine = myvSvg('line', {}, 'myv-tf-line');
    svg.append(poly, rotLine);
    const handles = {};
    ['n', 'e', 's', 'w', 'nw', 'ne', 'se', 'sw'].forEach(h => {
      const el = myvSvg('rect', { width: 12, height: 12, rx: 2 }, 'myv-tf-h h-' + h);
      handles[h] = el;
      svg.append(el);
    });
    const rot = myvSvg('circle', { r: 8 }, 'myv-tf-h myv-tf-rot');
    svg.append(rot);

    const bar = myvEl('div', 'myv-tfbar');
    bar.append(myvEl('span', 'myv-tfhint', 'Drag to move \u00B7 corners resize \u00B7 squares stretch \u00B7 round handle rotates (Shift = 15\u00B0 steps)'));
    const cancel = myvEl('button', 'myv-btn', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => this.endTransform(false));
    const done = myvEl('button', 'myv-btn myv-primary', 'Done');
    done.type = 'button';
    done.addEventListener('click', () => this.endTransform(true));
    bar.append(cancel, done);
    ['mousedown', 'touchstart', 'dblclick'].forEach(ev => bar.addEventListener(ev, e => e.stopPropagation()));

    // the shapes must not pan the map while they are dragged
    const grab = (el, mode) => {
      ['mousedown', 'touchstart'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation()));
      el.addEventListener('pointerdown', e => this.tfDown(e, mode));
    };
    grab(poly, 'move');
    grab(rot, 'rotate');
    Object.keys(handles).forEach(h => grab(handles[h], h));

    host.append(svg, bar);

    const onMove = () => this.tfRender();
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); this.endTransform(false); }
      else if (e.key === 'Enter' && !(e.target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName))) { e.preventDefault(); this.endTransform(true); }
    };
    map.on('move', onMove);
    map.on('resize', onMove);
    document.addEventListener('keydown', onKey);

    this.tf = { it, T: myvTFromCorners(it.corners), orig: it.corners.map(c => c.slice()),
                svg, bar, poly, rotLine, handles, rot, onMove, onKey };
    this.tfRender();
  }

  tfRender() {
    const tf = this.tf;
    if (!tf) return;
    const pts = myvCornersFromT(tf.T).map(c => this.map.project(c));
    tf.poly.setAttribute('points', pts.map(p => p.x + ',' + p.y).join(' '));
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const pos = { nw: pts[0], ne: pts[1], se: pts[2], sw: pts[3],
                  n: mid(pts[0], pts[1]), e: mid(pts[1], pts[2]), s: mid(pts[2], pts[3]), w: mid(pts[3], pts[0]) };
    Object.keys(tf.handles).forEach(h => {
      tf.handles[h].setAttribute('x', pos[h].x - 6);
      tf.handles[h].setAttribute('y', pos[h].y - 6);
    });
    const centre = mid(pts[0], pts[2]);
    let dx = pos.n.x - centre.x, dy = pos.n.y - centre.y;
    const len = Math.hypot(dx, dy) || 1;
    const rx = pos.n.x + dx / len * 30, ry = pos.n.y + dy / len * 30;
    tf.rot.setAttribute('cx', rx);
    tf.rot.setAttribute('cy', ry);
    tf.rotLine.setAttribute('x1', pos.n.x);
    tf.rotLine.setAttribute('y1', pos.n.y);
    tf.rotLine.setAttribute('x2', rx);
    tf.rotLine.setAttribute('y2', ry);
  }

  tfWorld(ev) {
    const r = this.map.getCanvas().getBoundingClientRect();
    return myvMerc(this.map.unproject([ev.clientX - r.left, ev.clientY - r.top]).toArray());
  }

  tfDown(e, mode) {
    e.preventDefault();
    e.stopPropagation();
    const tf = this.tf, el = e.currentTarget;
    if (!tf) return;
    const T0 = Object.assign({}, tf.T);
    const m0 = this.tfWorld(e);
    const minSize = this.pxToWorld() * 24;
    const cos = Math.cos(T0.a), sin = Math.sin(T0.a);
    const ang0 = Math.atan2(m0.y - T0.cy, m0.x - T0.cx);
    const d0 = Math.hypot(m0.x - T0.cx, m0.y - T0.cy) || 1e-9;
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

    const move = ev => {
      const m = this.tfWorld(ev);
      const T = Object.assign({}, T0);
      if (mode === 'move') {
        T.cx = T0.cx + (m.x - m0.x);
        T.cy = T0.cy + (m.y - m0.y);
      } else if (mode === 'rotate') {
        let a = T0.a + (Math.atan2(m.y - T0.cy, m.x - T0.cx) - ang0);
        if (ev.shiftKey) { const step = Math.PI / 12; a = Math.round(a / step) * step; }
        T.a = a;
      } else if (mode.length === 2) {                      // a corner: resize, keep the shape
        const k = Math.max(Math.hypot(m.x - T0.cx, m.y - T0.cy) / d0, minSize / T0.w, minSize / T0.h);
        T.w = T0.w * k;
        T.h = T0.h * k;
      } else {                                             // an edge: stretch along one side
        const dx = m.x - T0.cx, dy = m.y - T0.cy;
        const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;   // pointer in the video's own axes
        let clx = 0, cly = 0;
        if (mode === 'e') { const r = Math.max(lx, -T0.w / 2 + minSize); T.w = r + T0.w / 2; clx = (r - T0.w / 2) / 2; }
        if (mode === 'w') { const l = Math.min(lx, T0.w / 2 - minSize); T.w = T0.w / 2 - l; clx = (l + T0.w / 2) / 2; }
        if (mode === 's') { const b = Math.max(ly, -T0.h / 2 + minSize); T.h = b + T0.h / 2; cly = (b - T0.h / 2) / 2; }
        if (mode === 'n') { const t = Math.min(ly, T0.h / 2 - minSize); T.h = T0.h / 2 - t; cly = (t + T0.h / 2) / 2; }
        T.cx = T0.cx + clx * cos - cly * sin;
        T.cy = T0.cy + clx * sin + cly * cos;
      }
      this.tfApply(T);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  tfApply(T) {
    const tf = this.tf;
    const corners = myvCornersFromT(T);
    if (corners.some(c => !isFinite(c[0]) || !isFinite(c[1]) || Math.abs(c[1]) > MYV_MAX_LAT)) return;
    tf.T = T;
    tf.it.corners = corners;
    this.applyCorners(tf.it);
    this.tfRender();
  }

  endTransform(save) {
    const tf = this.tf;
    if (!tf) return;
    this.tf = null;
    this.map.off('move', tf.onMove);
    this.map.off('resize', tf.onMove);
    document.removeEventListener('keydown', tf.onKey);
    tf.svg.remove();
    tf.bar.remove();
    const it = tf.it;
    if (save) {
      this.save(it);
      if (this.editingId === it.id) this.cornersIn.value = myvFormatCorners(it.corners, this.orderSel.value);
    } else {
      it.corners = tf.orig;
      this.applyCorners(it);
    }
    this.setOpen(this.tfWasOpen);
  }

  // ---------- cropping ----------
  // A cropped video is played in a hidden <video>; its cropped part is copied onto a canvas
  // and the canvas is what gets pinned to the map (MapLibre cannot crop a video by itself).
  isCropped(it) {
    const c = it.crop;
    return !!c && (c.x > 0.005 || c.y > 0.005 || c.w < 0.995 || c.h < 0.995);
  }

  currentCrop() {
    const c = this.crop;
    const full = c.x <= 0.005 && c.y <= 0.005 && c.w >= 0.995 && c.h >= 0.995;
    return full ? null : { x: c.x, y: c.y, w: c.w, h: c.h };
  }

  makeMedia(it) {
    let url = this.urls.get(it.id);
    if (!url) { url = URL.createObjectURL(it.blob); this.urls.set(it.id, url); }
    const v = document.createElement('video');
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v._myvCropped = true;
    v.src = url;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const m = { video: v, canvas, ctx, ready: false, waiting: [],
                pending: true, alive: true, raf: 0, sleep: 0, src: null };
    this.media.set(it.id, m);

    v.addEventListener('loadedmetadata', () => {
      const c = it.crop;
      const sw = v.videoWidth * c.w, sh = v.videoHeight * c.h;
      const scale = Math.min(1, 4096 / Math.max(sw, sh));       // full quality, but never beyond what GPUs accept
      canvas.width = Math.max(2, Math.round(sw * scale));
      canvas.height = Math.max(2, Math.round(sh * scale));
      m.ready = true;
      m.waiting.splice(0).forEach(fn => fn());
    });
    v.addEventListener('loadeddata', () => this.paintFrame(m, it));
    const loop = () => {
      m.raf = 0;
      if (!m.alive) return;
      this.paintFrame(m, it);
      if (!v.paused && !v.ended) m.raf = requestAnimationFrame(loop);
    };
    v.addEventListener('play', () => {
      clearTimeout(m.sleep);
      try { if (m.src) m.src.play(); } catch (e) { /* source removed */ }
      if (!m.raf) m.raf = requestAnimationFrame(loop);
    });
    v.addEventListener('pause', () => this.settle(m, it));
    v.addEventListener('seeked', () => this.settle(m, it));
    this.bindVideo(it, v);
    return m;
  }

  paintFrame(m, it) {
    const v = m.video, c = it.crop;
    if (!c || !v.videoWidth || v.readyState < 2) return;
    m.ctx.drawImage(v, c.x * v.videoWidth, c.y * v.videoHeight, c.w * v.videoWidth, c.h * v.videoHeight,
                    0, 0, m.canvas.width, m.canvas.height);
  }

  // Draws the current frame, and lets the map pick it up even while the video is paused
  settle(m, it) {
    this.paintFrame(m, it);
    if (!m.src) return;
    try {
      m.src.play();
      clearTimeout(m.sleep);
      if (m.video.paused) m.sleep = setTimeout(() => { try { m.src.pause(); } catch (e) { /* ignore */ } }, 160);
    } catch (e) { /* source removed */ }
  }

  drawCropped(it) {
    const map = this.map, sid = myvSrcId(it.id), lid = myvLayerId(it.id);
    const m = this.media.get(it.id) || this.makeMedia(it);
    const add = () => {
      m.pending = false;
      if (!it.visible || !m.alive || map.getLayer(lid)) return;
      try {
        if (map.getSource(sid)) map.removeSource(sid);
        map.addSource(sid, { type: 'canvas', canvas: m.canvas, coordinates: it.corners, animate: false });
        const before = map.getLayer('borders-glow-1') ? 'borders-glow-1' : undefined;
        map.addLayer({
          id: lid, type: 'raster', source: sid,
          paint: { 'raster-opacity': it.opacity, 'raster-fade-duration': 0, 'raster-resampling': it.sharp ? 'nearest' : 'linear' }
        }, before);
        m.src = map.getSource(sid);
        this.settle(m, it);
        const p = m.video.play();
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* style not ready yet; the next styledata retries */ }
    };
    if (m.ready) add(); else { m.pending = true; m.waiting.push(add); }
  }

  disposeMedia(id) {
    const m = this.media.get(id);
    if (!m) return;
    m.alive = false;
    cancelAnimationFrame(m.raf);
    clearTimeout(m.sleep);
    m.video.pause();
    m.video.removeAttribute('src');
    m.video.load();
    this.media.delete(id);
  }

  // ---------- crop editor ----------
  // In the form there is only a "Crop" button. It opens a big dialog with the video preview.
  buildCropEditor() {
    // --- row in the form ---
    const row = this.cropBox = myvEl('div', 'myv-field myv-cropbox');
    row.hidden = true;
    row.append(myvEl('span', 'myv-label', 'Crop (optional)'));
    const line = myvEl('div', 'myv-row myv-cropline');
    this.cropBtn = myvEl('button', 'myv-btn', 'Crop\u2026');
    this.cropBtn.type = 'button';
    this.cropBtn.addEventListener('click', () => this.openCrop());
    this.cropSummary = myvEl('span', 'myv-hint myv-cropsum', 'Not cropped');
    line.append(this.cropBtn, this.cropSummary);
    row.append(line);

    // --- the dialog ---
    const modal = this.cropModal = myvEl('div', 'myv-cropmodal');
    modal.hidden = true;
    const dlg = myvEl('div', 'myv-cropdlg');
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-label', 'Crop video');

    const head = myvEl('div', 'myv-head');
    head.append(myvEl('div', 'myv-title', 'Crop video'));
    const x = myvEl('button', 'myv-icon myv-close', '\u2715');
    x.type = 'button';
    x.setAttribute('aria-label', 'Cancel');
    x.addEventListener('click', () => this.closeCrop(false));
    head.append(x);

    const stage = this.cropStage = myvEl('div', 'myv-crop-stage');
    const inner = this.cropInner = myvEl('div', 'myv-crop-inner');
    const pv = this.cropVideo = myvEl('video');
    pv.muted = true;
    pv.playsInline = true;
    pv.preload = 'metadata';
    const rect = this.cropRect = myvEl('div', 'myv-crop-rect');
    ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(h => {
      const d = myvEl('div', 'myv-handle h-' + h);
      d.dataset.h = h;
      rect.append(d);
    });
    inner.append(pv, rect);
    stage.append(inner);

    const scrubRow = myvEl('div', 'myv-field');
    scrubRow.append(myvEl('span', 'myv-label', 'Preview frame'));
    const scrub = this.cropScrub = myvEl('input');
    scrub.type = 'range';
    scrub.min = '0';
    scrub.max = '1000';
    scrub.value = '0';
    scrub.setAttribute('aria-label', 'Preview frame');
    scrub.addEventListener('input', () => {
      myvFill(scrub);
      if (isFinite(pv.duration)) pv.currentTime = (Number(scrub.value) / 1000) * pv.duration;
    });
    scrubRow.append(scrub);

    const foot = myvEl('div', 'myv-row');
    foot.append(myvEl('span', 'myv-hint', 'Drag the gold frame to keep only the map and cut out legends. Drag its edges to resize.'));
    const btns = myvEl('div', 'myv-cropbtns');
    const reset = myvEl('button', 'myv-btn', 'Reset');
    reset.type = 'button';
    reset.addEventListener('click', () => { this.draft = { x: 0, y: 0, w: 1, h: 1 }; this.applyCrop(); });
    const cancel = myvEl('button', 'myv-btn', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => this.closeCrop(false));
    const done = this.cropDone = myvEl('button', 'myv-btn myv-primary', 'Done');
    done.type = 'button';
    done.addEventListener('click', () => this.closeCrop(true));
    btns.append(reset, cancel, done);
    foot.append(btns);

    dlg.append(head, stage, scrubRow, foot);
    modal.append(dlg);
    modal.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); this.closeCrop(false); } });
    modal.addEventListener('pointerdown', e => { if (e.target === modal) this.closeCrop(false); });   // click outside = cancel
    document.body.append(modal);
    window.addEventListener('resize', () => { if (!modal.hidden) this.sizeCropStage(); });

    // dragging the frame (body = move, small squares = resize); works on this.draft
    const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
    const MIN = 0.03;
    rect.addEventListener('pointerdown', e => {
      e.preventDefault();
      const mode = (e.target.dataset && e.target.dataset.h) || 'move';
      const sr = inner.getBoundingClientRect();
      if (!sr.width || !sr.height) return;
      const start = Object.assign({}, this.draft);
      const px = e.clientX, py = e.clientY;
      try { rect.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const move = ev => {
        const dx = (ev.clientX - px) / sr.width, dy = (ev.clientY - py) / sr.height;
        let x0 = start.x, y0 = start.y, x1 = start.x + start.w, y1 = start.y + start.h;
        if (mode === 'move') {
          x0 = clamp(start.x + dx, 0, 1 - start.w);
          y0 = clamp(start.y + dy, 0, 1 - start.h);
          x1 = x0 + start.w;
          y1 = y0 + start.h;
        } else {
          if (mode.includes('w')) x0 = clamp(start.x + dx, 0, x1 - MIN);
          if (mode.includes('e')) x1 = clamp(x1 + dx, x0 + MIN, 1);
          if (mode.includes('n')) y0 = clamp(start.y + dy, 0, y1 - MIN);
          if (mode.includes('s')) y1 = clamp(y1 + dy, y0 + MIN, 1);
        }
        this.draft = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        this.applyCrop();
      };
      const up = () => {
        rect.removeEventListener('pointermove', move);
        rect.removeEventListener('pointerup', up);
        rect.removeEventListener('pointercancel', up);
      };
      rect.addEventListener('pointermove', move);
      rect.addEventListener('pointerup', up);
      rect.addEventListener('pointercancel', up);
    });

    this.draft = { x: 0, y: 0, w: 1, h: 1 };
    return row;
  }

  applyCrop() {
    const c = this.draft, r = this.cropRect;
    r.style.left = c.x * 100 + '%';
    r.style.top = c.y * 100 + '%';
    r.style.width = c.w * 100 + '%';
    r.style.height = c.h * 100 + '%';
  }

  // Makes the preview as big as the screen allows
  sizeCropStage() {
    const pv = this.cropVideo;
    if (!pv.videoWidth || !pv.videoHeight) return;
    const aspect = pv.videoWidth / pv.videoHeight;
    const availW = Math.max(220, Math.min(window.innerWidth * 0.92, 1100) - 70);
    const availH = Math.max(160, window.innerHeight * 0.96 - 230);   // room for title, slider and buttons
    this.cropInner.style.width = Math.round(Math.min(availW, availH * aspect)) + 'px';
  }

  updateCropSummary() {
    const c = this.currentCrop();
    this.cropSummary.textContent = c
      ? 'Keeps ' + Math.round(c.w * 100) + '% \u00D7 ' + Math.round(c.h * 100) + '% of the picture'
      : 'Not cropped';
  }

  openCrop() {
    if (!this.previewUrl) return;
    this.draft = Object.assign({}, this.crop);
    this.cropModal.hidden = false;
    this.sizeCropStage();
    this.applyCrop();
    this.cropDone.focus();
  }

  closeCrop(save) {
    if (save) { this.crop = Object.assign({}, this.draft); this.updateCropSummary(); }
    this.cropModal.hidden = true;
    this.cropBtn.focus();
  }

  // blob: the chosen File, or the saved video's Blob when editing
  showCropEditor(blob) {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = URL.createObjectURL(blob);
    const pv = this.cropVideo;
    pv.onloadedmetadata = () => {
      this.sizeCropStage();
      pv.currentTime = Math.min(0.5, (pv.duration || 1) / 2);      // show a real picture, not black
    };
    pv.src = this.previewUrl;
    this.cropScrub.value = '0';
    myvFill(this.cropScrub);
    this.cropBox.hidden = false;
    this.updateCropSummary();
  }

  hideCropEditor() {
    this.crop = { x: 0, y: 0, w: 1, h: 1 };
    if (this.cropModal) this.cropModal.hidden = true;
    if (this.cropBox) { this.cropBox.hidden = true; this.updateCropSummary(); }
    if (this.cropVideo) { this.cropVideo.removeAttribute('src'); this.cropVideo.load(); }
    if (this.previewUrl) { URL.revokeObjectURL(this.previewUrl); this.previewUrl = null; }
  }

  // ---------- list ----------
  renderList() {
    this.toggle.textContent = this.items.length ? 'My Videos (' + this.items.length + ')' : 'My Videos';
    this.listEl.hidden = !this.items.length;
    this.ui.clear();
    this.listEl.replaceChildren(...this.items.map(it => this.rowEl(it)));
  }

  rowEl(it) {
    const row = myvEl('div', 'myv-item' + (this.editingId === it.id ? ' editing' : ''));

    const vis = myvEl('input');
    vis.type = 'checkbox';
    vis.checked = !!it.visible;
    vis.title = 'Show on the map';
    vis.addEventListener('change', async () => {
      it.visible = vis.checked;
      this.drawOne(it);
      await this.save(it);
    });

    const name = myvEl('button', 'myv-name', it.name);
    name.type = 'button';
    name.title = 'Go to this video';
    name.addEventListener('click', () => this.flyTo(it));

    const move = myvEl('button', 'myv-icon', 'Move');
    move.type = 'button';
    move.title = 'Move, rotate and resize on the map';
    move.addEventListener('click', () => this.startTransform(it, true));

    const edit = myvEl('button', 'myv-icon', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => this.startEdit(it));

    const del = myvEl('button', 'myv-icon', '\u2715');
    del.type = 'button';
    del.title = 'Delete';
    del.setAttribute('aria-label', 'Delete ' + it.name);
    del.addEventListener('click', () => this.remove(it));

    row.append(vis, name, move, edit, del);
    const tl = this.timelineEl(it);
    const block = myvEl('div', 'myv-block');
    block.append(row, tl);
    return block;
  }

  async remove(it) {
    if (!window.confirm('Delete "' + it.name + '" from this browser?')) return;
    const map = this.map;
    try {
      if (map.getLayer(myvLayerId(it.id))) map.removeLayer(myvLayerId(it.id));
      if (map.getSource(myvSrcId(it.id))) map.removeSource(myvSrcId(it.id));
    } catch (e) { /* ignore */ }
    const url = this.urls.get(it.id);
    if (url) { URL.revokeObjectURL(url); this.urls.delete(it.id); }
    this.items = this.items.filter(x => x !== it);
    this.ui.delete(it.id);
    this.disposeMedia(it.id);
    if (this.editingId === it.id) this.resetForm();
    this.renderList();
    if (this.db) { try { await myvRun(this.db, 'readwrite', s => s.delete(it.id)); } catch (e) { /* ignore */ } }
  }

  // ---------- form ----------
  startEdit(it) {
    this.editingId = it.id;
    this.fileIn.value = '';
    this.nameIn.value = it.name;
    this.orderSel.value = 'latlng';
    this.cornersIn.value = myvFormatCorners(it.corners, 'latlng');
    this.opIn.value = String(it.opacity);
    myvFill(this.opIn);
    this.sharpIn.checked = !!it.sharp;
    this.startIn.value = it.startDate || '';
    this.endIn.value = it.endDate || '';
    this.crop = it.crop ? Object.assign({}, it.crop) : { x: 0, y: 0, w: 1, h: 1 };
    this.showCropEditor(it.blob);
    this.submitBtn.textContent = 'Save changes';
    this.cancelBtn.hidden = false;
    this.say('Editing "' + it.name + '". Choose a new file only if you want to replace the video.');
    this.renderList();
  }

  resetForm() {
    this.editingId = null;
    this.fileIn.value = '';
    this.nameIn.value = '';
    this.cornersIn.value = '';
    this.opIn.value = '1';
    myvFill(this.opIn);
    this.startIn.value = '';
    this.endIn.value = '';
    this.sharpIn.checked = false;
    this.hideCropEditor();
    this.submitBtn.textContent = 'Add to map';
    this.cancelBtn.hidden = true;
    this.say('');
    this.renderList();
  }

  async submit() {
    const editing = this.editingId ? this.items.find(x => x.id === this.editingId) : null;
    const file = this.fileIn.files && this.fileIn.files[0];
    if (!editing && !file) { this.say('Choose a video file first.', true); return; }

    const auto = !this.cornersIn.value.trim();          // empty = drop it at the crosshair
    const parsed = auto ? null : myvParseCorners(this.cornersIn.value, this.orderSel.value);
    if (parsed && parsed.error) { this.say(parsed.error, true); return; }

    const startDate = this.startIn.value, endDate = this.endIn.value;
    if (startDate || endDate) {
      if (!startDate || !endDate) { this.say('Set both timeline dates, or leave both empty.', true); return; }
      if (!(myvDay(endDate) > myvDay(startDate))) { this.say('The last-frame date must be after the first-frame date.', true); return; }
    }

    if (file) {
      this.say('Checking the video\u2026');
      const ok = await myvCanPlay(file);
      if (!ok) { this.say('This browser cannot play that file. Try an H.264 .mp4 or a .webm.', true); return; }
    }

    const crop = this.currentCrop();
    const opacity = Math.min(1, Math.max(0.1, Number(this.opIn.value) || 1));
    const name = this.nameIn.value.trim() || (file ? file.name.replace(/\.[^.]+$/, '') : editing.name);
    let item;
    if (editing) {
      item = editing;
      item.name = name;
      item.corners = auto ? this.spawnCorners(crop) : parsed.corners;
      item.opacity = opacity;
      item.startDate = startDate;
      item.endDate = endDate;
      item.crop = crop;
      item.sharp = this.sharpIn.checked;
      if (file) {
        item.blob = file;
        const old = this.urls.get(item.id);
        if (old) { URL.revokeObjectURL(old); this.urls.delete(item.id); }
      }
    } else {
      item = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name, blob: file, corners: auto ? this.spawnCorners(crop) : parsed.corners, opacity, startDate, endDate, crop, sharp: this.sharpIn.checked, visible: true, created: Date.now()
      };
      this.items.push(item);
    }

    if (editing) this.disposeMedia(item.id);       // crop / file may have changed
    this.drawOne(item);
    const saved = await this.save(item);
    const wasEditing = !!editing;
    this.resetForm();
    if (!saved) this.say('The video is on the map, but it could not be saved (storage full or blocked). It will be lost when you reload.', true);
    else if (!wasEditing && navigator.storage && navigator.storage.persist) navigator.storage.persist();
    if (auto) this.startTransform(item, false);
    else if (!wasEditing) this.flyTo(item);
  }
}

function initMyVideos(map) {
  const control = new MyVideosControl(map);
  map.addControl(control, 'bottom-left');
  onStyleReady(() => control.redrawAll());   // keep the videos when the base map changes
  control.load();

  // Safety net, same idea as the borders: if a style change wipes the videos, draw them again.
  let redrawing = false;
  map.on('styledata', () => {
    if (redrawing || !control.items.length || control.allDrawn()) return;
    redrawing = true;
    try { control.redrawAll(); } catch (e) { /* retry on the next styledata */ }
    redrawing = false;
  });
}