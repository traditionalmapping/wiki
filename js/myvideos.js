// ============================================================================
//  MY VIDEOS  (button in the bottom-left corner)
//
//  Lets every visitor pin THEIR OWN video file onto the map:
//    1. choose a video file from the computer,
//    2. georeference it with control points, like in the QGIS Georeferencer
//       (click a spot on the video, then the same spot on the map),
//    3. the video plays on the map at that place.
//
//  Nothing is uploaded anywhere. The file and the coordinates are stored in the
//  visitor's own browser (IndexedDB), so they are private to that person and that
//  browser. Clearing the browser's site data deletes them. Videos added from the
//  shared library are temporary and must be added again after a reload.
//
//  Needs one line in js/map.js, after initBorders(map):   initMyVideos(map);
// ============================================================================
const MYV_DB = 'tmw-myvideos';
const MYV_STORE = 'videos';
const MYV_MAX_LAT = 85.05;

// ---- Storage of georeferenced videos (opened with the "Add video" button) ----
//  One block per video.
//    video:  link to the video file (big files: Cloudflare R2, which must allow this site through CORS)
//    georef: the .json made with the Export button of My Videos; keep it in the site files,
//            e.g. 'data/library/moscow.json' (a full link also works)
const MYV_STORAGE = [
  { name: 'Moscow 1941', video: 'https://pub-0b66549169434e89be867e91db96609a.r2.dev/The%20War%20of%20Annihilation%20-%20Battle%20of%20Moscow%20_%20%D0%92%D0%BE%D0%B9%D0%BD%D0%B0%20%D0%BD%D0%B0%20%D0%A3%D0%BD%D0%B8%D1%87%D1%82%D0%BE%D0%B6%D0%B5%D0%BD%D0%B8%D0%B5%20-%20%D0%91%D0%B8%D1%82%D0%B2%D0%B0%20%D0%B7%D0%B0%20%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D1%83_1080p.mp4', georef: 'data/library/moscow.json' },
];

// Checks that a video link really loads as a video (with CORS, which the map needs to draw it)
function myvCanPlayUrl(url) {
  return new Promise(resolve => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'metadata';
    v.crossOrigin = 'anonymous';
    const done = ok => { clearTimeout(timer); v.removeAttribute('src'); v.load(); resolve(ok); };
    const timer = setTimeout(() => done(false), 15000);
    v.addEventListener('loadedmetadata', () => done(true), { once: true });
    v.addEventListener('error', () => done(false), { once: true });
    v.src = url;
  });
}

// Turns one library .json into the same kind of item the browser-stored videos use
function myvFromLibrary(file, d, videoOverride) {
  const video = videoOverride || (d && d.video);
  if (!d || typeof video !== 'string' || !Array.isArray(d.corners) || d.corners.length !== 4) return null;
  if (!d.corners.every(c => Array.isArray(c) && c.length === 2 && c.every(Number.isFinite))) return null;
  return {
    id: 'lib-' + file.replace(/\.json$/i, '').replace(/[^a-z0-9_-]+/gi, '-'),
    library: true,
    visible: false,                                   // nothing downloads until someone ticks it
    name: String(d.name || file.replace(/\.json$/i, '')),
    videoUrl: new URL(video, document.baseURI).href,
    corners: d.corners,
    opacity: Math.min(1, Math.max(0.1, Number(d.opacity) || 1)),
    startDate: d.startDate || '',
    endDate: d.endDate || '',
    stamps: Array.isArray(d.stamps) ? d.stamps : [],
    crop: d.crop || { x: 0, y: 0, w: 1, h: 1 },
    sharp: !!d.sharp,
    gcps: Array.isArray(d.gcps) ? d.gcps : [],
    gcpMethod: d.gcpMethod || 'affine',
    gcpAspect: d.gcpAspect || 1,
    created: 0
  };
}

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

// metres -> "320 m" / "1.4 km"
function myvMeters(m) {
  if (!isFinite(m)) return '';
  return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(m < 10000 ? 2 : 1) + ' km';
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

// ---------- timestamps: "when the video is at this time, the map shows this date" ----------
// A timestamp is { y, m, d, h, mi, t }: year (AD), month 1-12, day, hour, minute, and the video time t in
// seconds. Between two timestamps the date moves in a straight line. Dates may jump or go backwards.
function myvUtc(y, mo, d, h, mi) {
  const t = new Date(0);
  t.setUTCFullYear(y, mo - 1, d);
  t.setUTCHours(h || 0, mi || 0, 0, 0);
  return t.getTime();
}
function myvDaysIn(y, m) { return new Date(myvUtc(y, m + 1, 0, 0, 0)).getUTCDate(); }
const myvP2 = n => String(n).padStart(2, '0');
const myvIso = ms => new Date(ms).toISOString().slice(0, 10);

// seconds <-> "hh:mm:ss.cc"
function myvStampClock(t) {
  const c = Math.round(Math.max(0, Number(t) || 0) * 100);
  return myvP2(Math.floor(c / 360000)) + ':' + myvP2(Math.floor(c / 6000) % 60) + ':' + myvP2(Math.floor(c / 100) % 60) + '.' + myvP2(c % 100);
}
function myvParseClock(str) {                      // accepts 12.5, 2:51.06 or 0:02:51.06
  const m = /^\s*(?:(?:(\d+):)?(\d+):)?(\d+(?:[.,]\d+)?)\s*$/.exec(str || '');
  if (!m) return NaN;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3].replace(',', '.'));
}

// The (video time -> date) points of a video, sorted by video time. Uses the timestamps when there are
// two or more, otherwise the old "first frame / last frame" dates. null when there is no usable timeline.
function myvPoints(it, dur) {
  let pts = [];
  if (Array.isArray(it.stamps) && it.stamps.length >= 2) {
    pts = it.stamps.map(s => ({ ms: myvUtc(s.y, s.m, s.d, s.h, s.mi), t: Number(s.t) }));
  } else {
    const a = myvDay(it.startDate), b = myvDay(it.endDate);
    if (isFinite(a) && isFinite(b) && b > a && dur > 0) pts = [{ ms: a, t: 0 }, { ms: b, t: dur }];
  }
  if (pts.length < 2 || pts.some(p => !isFinite(p.ms) || !isFinite(p.t))) return null;
  pts.sort((p, q) => p.t - q.t);
  for (let i = 1; i < pts.length; i++) if (!(pts[i].t > pts[i - 1].t)) return null;
  return pts;
}
// video seconds -> date in ms (before the first / after the last timestamp the date stays put)
function myvTimeToMs(pts, t) {
  if (t <= pts[0].t) return pts[0].ms;
  const last = pts[pts.length - 1];
  if (t >= last.t) return last.ms;
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i].t) {
      const k = (t - pts[i - 1].t) / (pts[i].t - pts[i - 1].t);
      return pts[i - 1].ms + k * (pts[i].ms - pts[i - 1].ms);
    }
  }
  return last.ms;
}
// date in ms -> video seconds (the first stretch of the video that passes through that date)
function myvMsToTime(pts, ms) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (a.ms === b.ms) continue;
    if (ms >= Math.min(a.ms, b.ms) && ms <= Math.max(a.ms, b.ms)) return a.t + (ms - a.ms) / (b.ms - a.ms) * (b.t - a.t);
  }
  let best = pts[0];
  pts.forEach(p => { if (Math.abs(p.ms - ms) < Math.abs(best.ms - ms)) best = p; });
  return best.t;                                   // outside every stretch: go to the nearest timestamp
}
// fraction of the video (0..1) -> the date it shows, snapped to a whole day
function myvFracToDate(it, frac, dur) {
  const pts = myvPoints(it, dur);
  if (!pts) return '';
  const snap = Array.isArray(it.stamps) && it.stamps.length >= 2 ? Math.floor : Math.round;
  return myvIso(snap(myvTimeToMs(pts, frac * dur) / 86400000) * 86400000);
}

// The part of the video (seconds) that shows a span of time starting at dayMs (one calendar day,
// or `span` ms): { from, to }. null when none of that span is inside the video's timeline.
function myvDaySegment(pts, dayMs, dur, span) {
  const DAY = span || 86400000;
  let from = Infinity, to = -Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (a.ms === b.ms) continue;
    const lo = Math.min(a.ms, b.ms), hi = Math.max(a.ms, b.ms);
    if (!(dayMs + DAY > lo && dayMs <= hi)) {            // this stretch does not touch the span
      if (to > -Infinity) break;                         // only the first unbroken run of stretches counts
      continue;
    }
    const tAt = ms => a.t + (ms - a.ms) / (b.ms - a.ms) * (b.t - a.t);
    const t1 = tAt(Math.max(dayMs, lo)), t2 = tAt(Math.min(dayMs + DAY, hi));
    from = Math.min(from, t1, t2);
    to = Math.max(to, t1, t2);
  }
  if (to === -Infinity) return null;
  if (dur > 0) { from = Math.min(Math.max(from, 0), dur); to = Math.min(Math.max(to, 0), dur); }
  if (to - from < 0.5) from = Math.max(0, to - 1);       // the very last day: keep a short piece to show
  return { from, to };
}

// The dates a video covers, in ms: { a, b }, or null when it has no dates.
function myvDateRange(it) {
  if (Array.isArray(it.stamps) && it.stamps.length >= 2) {
    const ms = it.stamps.map(s => myvUtc(s.y, s.m, s.d, s.h, s.mi)).filter(isFinite);
    return ms.length >= 2 ? { a: Math.min(...ms), b: Math.max(...ms) } : null;
  }
  const a = myvDay(it.startDate), b = myvDay(it.endDate);
  return isFinite(a) && isFinite(b) && b > a ? { a, b } : null;
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

// ---------- georeferencing with control points (like the QGIS Georeferencer) ----------
// A control point pairs a spot on the video picture (u, v = fractions of the picture) with its
// place on the map (lng, lat). From the pairs a transformation is fitted, and the picture's
// four corners are moved through it. MapLibre can draw any 4-corner quad (that includes
// perspective), so Linear, Helmert, Polynomial 1 (affine) and Projective can all be shown.
const MYV_METHODS = {
  linear:     { label: 'Linear (2+ points: scale and shift)', min: 2 },
  helmert:    { label: 'Helmert (2+ points: scale, rotate, shift)', min: 2 },
  affine:     { label: 'Polynomial 1 / Affine (3+ points)', min: 3 },
  projective: { label: 'Projective (4+ points: with perspective)', min: 4 },
  poly2:      { label: 'Polynomial 2 (6+ points, curved)', min: 6, curved: true },
  poly3:      { label: 'Polynomial 3 (10+ points, curved)', min: 10, curved: true },
  tps:        { label: 'Thin plate spline (3+ points, curved)', min: 3, curved: true }
};

function myvSolve(M, b) {                         // Gaussian elimination, null when singular
  const n = b.length;
  const a = M.map((row, i) => row.concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    if (Math.abs(a[piv][c]) < 1e-12) return null;
    const t = a[c]; a[c] = a[piv]; a[piv] = t;
    for (let r = c + 1; r < n; r++) {
      const f = a[r][c] / a[c][c];
      for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k];
    }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let sum = a[r][n];
    for (let k = r + 1; k < n; k++) sum -= a[r][k] * x[k];
    x[r] = sum / a[r][r];
  }
  return x;
}

// pairs: [{x, y, X, Y}]  picture units -> Mercator world units.  Returns { f(x, y) -> [X, Y, w] } or { error }.
function myvFitTransform(method, pairs) {
  const n = pairs.length, need = MYV_METHODS[method].min;
  if (n < need) return { error: 'Add ' + (need - n) + ' more point' + (need - n > 1 ? 's' : '') + ' for this transformation.' };
  const mean = k => pairs.reduce((t, p) => t + p[k], 0) / n;
  const mx = mean('X'), my = mean('Y');
  let sc = 0;
  pairs.forEach(p => { sc = Math.max(sc, Math.abs(p.X - mx), Math.abs(p.Y - my)); });
  if (!(sc > 1e-12)) return { error: 'All the map points are at the same place.' };
  const P = pairs.map(p => ({ x: p.x, y: p.y, X: (p.X - mx) / sc, Y: (p.Y - my) / sc }));
  const xb = P.reduce((t, p) => t + p.x, 0) / n, yb = P.reduce((t, p) => t + p.y, 0) / n;
  const Xb = P.reduce((t, p) => t + p.X, 0) / n, Yb = P.reduce((t, p) => t + p.Y, 0) / n;
  let f = null;

  if (method === 'linear') {
    let sxx = 0, sxX = 0, syy = 0, syY = 0;
    P.forEach(p => { sxx += (p.x - xb) ** 2; sxX += (p.x - xb) * (p.X - Xb); syy += (p.y - yb) ** 2; syY += (p.y - yb) * (p.Y - Yb); });
    if (sxx < 1e-12 || syy < 1e-12) return { error: 'The points must differ both across and down the picture.' };
    const a = sxX / sxx, d = syY / syy;
    f = (x, y) => [a * (x - xb) + Xb, d * (y - yb) + Yb, 1];
  } else if (method === 'helmert') {
    let den = 0, na = 0, nb = 0;
    P.forEach(p => {
      const dx = p.x - xb, dy = p.y - yb, dX = p.X - Xb, dY = p.Y - Yb;
      den += dx * dx + dy * dy;
      na += dx * dX + dy * dY;
      nb += dx * dY - dy * dX;
    });
    if (den < 1e-12) return { error: 'The points on the picture are all at the same spot.' };
    const a = na / den, b = nb / den;
    f = (x, y) => { const dx = x - xb, dy = y - yb; return [a * dx - b * dy + Xb, b * dx + a * dy + Yb, 1]; };
  } else if (method === 'affine') {
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], rX = [0, 0, 0], rY = [0, 0, 0];
    P.forEach(p => {
      const v = [p.x, p.y, 1];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) M[i][j] += v[i] * v[j];
        rX[i] += v[i] * p.X;
        rY[i] += v[i] * p.Y;
      }
    });
    const cx = myvSolve(M, rX), cy = myvSolve(M, rY);
    if (!cx || !cy) return { error: 'The points are in a line. Spread them out over the picture.' };
    f = (x, y) => [cx[0] * x + cx[1] * y + cx[2], cy[0] * x + cy[1] * y + cy[2], 1];
  } else if (method === 'projective') {
    const M = Array.from({ length: 8 }, () => new Array(8).fill(0)), r = new Array(8).fill(0);
    const add = (row, rhs) => {
      for (let i = 0; i < 8; i++) { for (let j = 0; j < 8; j++) M[i][j] += row[i] * row[j]; r[i] += row[i] * rhs; }
    };
    P.forEach(p => {
      add([p.x, p.y, 1, 0, 0, 0, -p.x * p.X, -p.y * p.X], p.X);
      add([0, 0, 0, p.x, p.y, 1, -p.x * p.Y, -p.y * p.Y], p.Y);
    });
    const h = myvSolve(M, r);
    if (!h) return { error: 'The points do not define a perspective (three or more are in a line?).' };
    f = (x, y) => {
      const w = h[6] * x + h[7] * y + 1;
      return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w, w];
    };
  } else if (method === 'poly2' || method === 'poly3') {
    const cube = method === 'poly3', k = cube ? 10 : 6;
    const rx = Math.max(1e-9, ...P.map(p => Math.abs(p.x - xb))), ry = Math.max(1e-9, ...P.map(p => Math.abs(p.y - yb)));
    const terms = (x, y) => {
      const a = (x - xb) / rx, b = (y - yb) / ry;
      const t = [1, a, b, a * a, a * b, b * b];
      if (cube) t.push(a * a * a, a * a * b, a * b * b, b * b * b);
      return t;
    };
    const M = Array.from({ length: k }, () => new Array(k).fill(0)), rX = new Array(k).fill(0), rY = new Array(k).fill(0);
    P.forEach(p => {
      const t = terms(p.x, p.y);
      for (let i = 0; i < k; i++) {
        for (let j = 0; j < k; j++) M[i][j] += t[i] * t[j];
        rX[i] += t[i] * p.X;
        rY[i] += t[i] * p.Y;
      }
    });
    const cx = myvSolve(M, rX), cy = myvSolve(M, rY);
    if (!cx || !cy) return { error: 'These points do not pin down a curve. Spread more points over the whole picture.' };
    f = (x, y) => {
      const t = terms(x, y);
      let X = 0, Y = 0;
      for (let i = 0; i < k; i++) { X += cx[i] * t[i]; Y += cy[i] * t[i]; }
      return [X, Y, 1];
    };
  } else {                                           // thin plate spline: passes exactly through every point
    const U = r2 => (r2 > 0 ? 0.5 * r2 * Math.log(r2) : 0);
    const L = Array.from({ length: n + 3 }, () => new Array(n + 3).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) L[i][j] = U((P[i].x - P[j].x) ** 2 + (P[i].y - P[j].y) ** 2);
      L[i][i] += 1e-9;
      L[i][n] = 1; L[i][n + 1] = P[i].x; L[i][n + 2] = P[i].y;
      L[n][i] = 1; L[n + 1][i] = P[i].x; L[n + 2][i] = P[i].y;
    }
    const wx = myvSolve(L, P.map(q => q.X).concat([0, 0, 0])), wy = myvSolve(L, P.map(q => q.Y).concat([0, 0, 0]));
    if (!wx || !wy) return { error: 'The points must not all lie on one line, and no two may be at the same spot.' };
    f = (x, y) => {
      let X = wx[n] + wx[n + 1] * x + wx[n + 2] * y, Y = wy[n] + wy[n + 1] * x + wy[n + 2] * y;
      for (let i = 0; i < n; i++) {
        const u = U((x - P[i].x) ** 2 + (y - P[i].y) ** 2);
        X += wx[i] * u;
        Y += wy[i] * u;
      }
      return [X, Y, 1];
    };
  }
  return { f: (x, y) => { const o = f(x, y); return [o[0] * sc + mx, o[1] * sc + my, o[2]]; } };
}

// ---------- curved warps: the picture is drawn as a mesh of small triangles ----------
// Every mesh point of the picture is moved through the fitted transformation, so edges can bend
// (like a QGIS raster georeferenced with a polynomial or thin plate spline).
function myvBuildMesh(fit, A, crop, N) {
  const c = crop || { x: 0, y: 0, w: 1, h: 1 };
  const mid = fit.f(A / 2, 0.5);
  const cx = mid[0], cy = mid[1];
  const verts = new Float32Array((N + 1) * (N + 1) * 4);
  let k = 0;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const a = i / N, b = j / N;
      const q = fit.f(a * A, b);
      if (!isFinite(q[0]) || !isFinite(q[1])) return null;
      verts[k++] = q[0] - cx;                 // relative to the centre: keeps full precision when zoomed in
      verts[k++] = q[1] - cy;
      verts[k++] = c.x + a * c.w;             // the crop is just a smaller part of the texture
      verts[k++] = c.y + b * c.h;
    }
  }
  const idx = new Uint16Array(N * N * 6);
  k = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const v0 = j * (N + 1) + i, v1 = v0 + 1, v2 = v0 + N + 1, v3 = v2 + 1;
      idx[k++] = v0; idx[k++] = v1; idx[k++] = v2;
      idx[k++] = v1; idx[k++] = v3; idx[k++] = v2;
    }
  }
  return { verts, idx, cx, cy };
}

// A MapLibre custom layer that draws the video on such a mesh with WebGL
class MyvMeshLayer {
  constructor(id, video, opacity, sharp) {
    this.id = id;
    this.type = 'custom';
    this.renderingMode = '2d';
    this.video = video;
    this.opacity = opacity;
    this.sharp = !!sharp;
    this.mesh = null;
    this.dirty = false;
    this.uploaded = false;
    this.lastT = -1;
  }

  setMesh(mesh) {
    this.mesh = mesh;
    this.dirty = true;
    if (this.map) this.map.triggerRepaint();
  }

  onAdd(map, gl) {
    this.map = map;
    this.gl = gl;
    const shader = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const vs = shader(gl.VERTEX_SHADER,
      'attribute vec2 a_pos; attribute vec2 a_uv; uniform mat4 u_matrix; varying vec2 v_uv;' +
      'void main() { v_uv = a_uv; gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0); }');
    const fs = shader(gl.FRAGMENT_SHADER,
      'precision mediump float; uniform sampler2D u_tex; uniform float u_alpha; varying vec2 v_uv;' +
      'void main() { gl_FragColor = vec4(texture2D(u_tex, v_uv).rgb, 1.0) * u_alpha; }');
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error('My Videos: shader failed', gl.getProgramInfoLog(prog)); return; }
    this.prog = prog;
    this.aPos = gl.getAttribLocation(prog, 'a_pos');
    this.aUv = gl.getAttribLocation(prog, 'a_uv');
    this.uMatrix = gl.getUniformLocation(prog, 'u_matrix');
    this.uTex = gl.getUniformLocation(prog, 'u_tex');
    this.uAlpha = gl.getUniformLocation(prog, 'u_alpha');
    this.vbuf = gl.createBuffer();
    this.ibuf = gl.createBuffer();
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const filter = this.sharp ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  }

  onRemove(map, gl) {
    if (this.prog) gl.deleteProgram(this.prog);
    if (this.vbuf) gl.deleteBuffer(this.vbuf);
    if (this.ibuf) gl.deleteBuffer(this.ibuf);
    if (this.tex) gl.deleteTexture(this.tex);
    this.prog = null;
  }

  render(gl, matrix) {
    const v = this.video, mesh = this.mesh;
    if (!this.prog || !mesh || !v || v.readyState < 2 || !v.videoWidth) return;
    gl.useProgram(this.prog);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    if (!this.uploaded || v.currentTime !== this.lastT) {            // a new video picture
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
      this.uploaded = true;
      this.lastT = v.currentTime;
    }
    gl.uniform1i(this.uTex, 0);
    gl.uniform1f(this.uAlpha, this.opacity);

    // move the map matrix to the mesh centre in double precision, then hand it over as floats
    const out = new Float32Array(16);
    for (let i = 0; i < 16; i++) out[i] = matrix[i];
    out[12] = matrix[0] * mesh.cx + matrix[4] * mesh.cy + matrix[12];
    out[13] = matrix[1] * mesh.cx + matrix[5] * mesh.cy + matrix[13];
    out[14] = matrix[2] * mesh.cx + matrix[6] * mesh.cy + matrix[14];
    out[15] = matrix[3] * mesh.cx + matrix[7] * mesh.cy + matrix[15];
    gl.uniformMatrix4fv(this.uMatrix, false, out);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbuf);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibuf);
    if (this.dirty) {
      gl.bufferData(gl.ARRAY_BUFFER, mesh.verts, gl.DYNAMIC_DRAW);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.DYNAMIC_DRAW);
      this.dirty = false;
    }
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(this.aUv);
    gl.vertexAttribPointer(this.aUv, 2, gl.FLOAT, false, 16, 8);
    gl.drawElements(gl.TRIANGLES, mesh.idx.length, gl.UNSIGNED_SHORT, 0);
    gl.disableVertexAttribArray(this.aPos);
    gl.disableVertexAttribArray(this.aUv);
  }
}

// Checks that the browser can play the file; gives { w, h } (the video's size) or null.
function myvProbe(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    let done = false;
    const finish = result => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeAttribute('src');
      v.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), 10000);
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => finish({ w: v.videoWidth, h: v.videoHeight });
    v.onerror = () => finish(null);
    v.src = url;
  });
}
const myvCanPlay = file => myvProbe(file).then(r => !!r);

class MyVideosControl {
  constructor(map) {
    this.map = map;
    this.items = [];             // { id, name, blob, corners, opacity, visible }
    this.urls = new Map();       // id -> blob: URL
    this.db = null;
    this.ready = Promise.resolve();
    this.editingId = null;
    this.ui = new Map();         // id -> timeline controls in the list
    this.media = new Map();      // id -> hidden video (+ canvas for cropped videos)
    this.meshLayers = new Map(); // id -> WebGL layer of a curved (warped) video
    this.crop = { x: 0, y: 0, w: 1, h: 1 };   // crop shown in the form (fractions of the video)
    this.previewUrl = null;
    this.stamps = [];            // timestamps shown in the form (see buildStampEditor)
    this.pendingGeo = null;      // a georeference .json chosen in the form, waiting for "Add to map"
    this.segs = new Map();       // id -> { from, to, day, it }: a picked date plays only that day's part of the video
    this.segRaf = 0;
    this.follow = true;          // videos with dates follow the date slider (bottom center)
    try { if (localStorage.getItem('myvFollow') === '0') this.follow = false; } catch (e) { /* storage blocked */ }
    this.onSlider = () => {      // the slider moved: re-sync every video (a short delay while it is being dragged)
      clearTimeout(this.followTimer);
      this.followTimer = setTimeout(() => this.followAll(), 120);
    };
    document.addEventListener('situationdatechange', this.onSlider);
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
    const followRow = myvEl('label', 'myv-follow');
    followRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;font:13px system-ui,sans-serif;color:#ddd;cursor:pointer';
    const followBox = document.createElement('input');
    followBox.type = 'checkbox';
    followBox.checked = this.follow;
    followBox.addEventListener('change', () => this.setFollow(followBox.checked));
    followRow.append(followBox, 'Videos follow the date slider');
    followRow.title = 'A video with dates shows only the part for the slider date, and hides when it has no footage for it';
    panel.append(followRow);
    panel.addEventListener('keydown', e => {
      if (e.key === 'Escape') { this.setOpen(false); this.toggle.focus(); }
    });
    // Videos added to the site itself (data/library), visible to everyone
    this.libWrap = myvEl('div', 'myv-libwrap');
    this.libWrap.append(myvEl('div', 'myv-label', 'Videos from the storage'),
      myvEl('div', 'myv-hint', 'Tick a video to show it on the map, or click its preview to watch it.'));
    this.libEl = myvEl('div', 'myv-list');
    this.libWrap.append(this.libEl);

    // "Add video" opens the storage: the list of ready georeferenced videos (MYV_STORAGE)
    const addToggle = this.addToggle = myvEl('button', 'myv-btn', 'Add video');
    addToggle.type = 'button';
    addToggle.addEventListener('click', () => this.openStorage());
    const addWrap = myvEl('div', 'myv-addwrap');
    addWrap.append(addToggle);
    this.libWrap.append(addWrap);
    panel.append(this.libWrap);

    panel.append(myvEl('div', 'myv-hint', 'Your own files stay in this browser only and nobody else can see them.'));

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
      if (!this.editingId && !this.pendingGeo) this.crop = { x: 0, y: 0, w: 1, h: 1 };
      this.showCropEditor(f);
    });
    const cropBox = this.buildCropEditor();

    const jsonLabel = myvEl('label', 'myv-field');
    jsonLabel.append(myvEl('span', 'myv-label', 'Georeference file (.json, optional)'));
    this.jsonIn = myvEl('input');
    this.jsonIn.type = 'file';
    this.jsonIn.accept = '.json,application/json';
    jsonLabel.append(this.jsonIn, myvEl('div', 'myv-hint', 'The .json made by Export. Choose it together with the video file and the video lands on the map in its saved place. A .json that holds a video link needs no file.'));
    this.jsonIn.addEventListener('change', () => this.loadGeoJson(this.jsonIn.files && this.jsonIn.files[0]));

    const nameLabel = myvEl('label', 'myv-field');
    nameLabel.append(myvEl('span', 'myv-label', 'Name'));
    this.nameIn = myvEl('input');
    this.nameIn.type = 'text';
    this.nameIn.maxLength = 80;
    this.nameIn.placeholder = 'optional';
    nameLabel.append(this.nameIn);

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
      if (!this.editingId) return;
      const L = this.meshLayers.get(this.editingId);
      if (L) { L.opacity = Number(this.opIn.value); this.map.triggerRepaint(); return; }
      if (this.map.getLayer(myvLayerId(this.editingId))) {
        this.map.setPaintProperty(myvLayerId(this.editingId), 'raster-opacity', Number(this.opIn.value));
      }
    });
    opLabel.append(this.opIn);

    const sharpLabel = myvEl('label', 'myv-check');
    this.sharpIn = myvEl('input');
    this.sharpIn.type = 'checkbox';
    sharpLabel.append(this.sharpIn, myvEl('span', '', 'Sharp pixels (no smoothing when zoomed in)'));

    const settings = this.buildStampEditor();      // "Video Settings" > "Edit Timestamps"

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

    form.append(fileLabel, jsonLabel, cropBox, nameLabel, settings, opLabel, sharpLabel, myvEl('div', 'myv-hint', 'After you add a video, a window opens where you georeference it with control points, like in QGIS.'), buttons, this.status);
    panel.append(form);

    el.append(toggle);
    document.body.append(panel);
    this.buildGeorefDialog();
    this.renderList();
    return el;
  }

  onRemove() {
    if (this.gr) this.endGeoref(false);
    cancelAnimationFrame(this.segRaf);
    clearTimeout(this.followTimer);
    document.removeEventListener('situationdatechange', this.onSlider);
    this.grModal.remove();
    this.media.forEach((m, id) => this.disposeMedia(id));
    this.urls.forEach(u => URL.revokeObjectURL(u));
    this.hideCropEditor();
    this.cropModal.remove();
    if (this.pm) this.pm.remove();
    if (this.st) this.st.remove();
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
      const saved = all || [];
      this.items = saved.filter(it => !it.library).sort((a, b) => (a.created || 0) - (b.created || 0));
      const oldLibraryItems = saved.filter(it => it.library);
      if (oldLibraryItems.length) {
        try {
          await myvRun(this.db, 'readwrite', s => {
            oldLibraryItems.forEach(it => s.delete(it.id));
            return null;
          });
        } catch (e) {
          this.say('Previously saved library videos could not be cleared from this browser.', true);
        }
      }
      this.items.forEach(it => this.prepareWarp(it));
    } catch (e) {
      this.db = null;
      this.say('This browser cannot save videos (private mode?). They will be lost when you reload.', true);
    }
    this.renderList();
    this.redrawAll();
  }

  // The address a video plays from: a library video's own address, or the file kept in this browser
  srcUrl(it) {
    let url = this.urls.get(it.id);
    if (!url) {
      url = it.videoUrl || URL.createObjectURL(it.blob);
      this.urls.set(it.id, url);
    }
    return url;
  }

  async save(item) {
    if (item.library) return true;
    if (!this.db) return false;
    try {
      const rec = Object.assign({}, item);
      delete rec._mesh;                                  // functions cannot be stored
      await myvRun(this.db, 'readwrite', s => s.put(rec));
      return true;
    }
    catch (e) { return false; }
  }

  // ---------- drawing on the map ----------
  drawOne(it) {
    const map = this.map;
    const sid = myvSrcId(it.id), lid = myvLayerId(it.id);
    try {
      if (map.getLayer(lid)) map.removeLayer(lid);
      if (map.getSource(sid)) map.removeSource(sid);
      this.meshLayers.delete(it.id);
      it._offDate = this.outsideDate(it, this.currentSliderDate());   // no footage for the slider's date
      if (!it.visible || it._offDate) {
        const hidden = this.media.get(it.id);
        if (hidden) hidden.video.pause();            // no need to keep decoding a hidden video
        return;
      }
      if (it._mesh) { this.drawMesh(it); return; }
      if (this.isCropped(it)) { this.drawCropped(it); return; }
      const url = this.srcUrl(it);
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
    this.ensureTick();
    v.addEventListener('loadedmetadata', () => this.followOne(it));
    if (v.readyState >= 1) setTimeout(() => this.followOne(it), 0);
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
    const seg = this.segs.get(it.id);
    if (ui.dateIn && document.activeElement !== ui.dateIn) ui.dateIn.value = seg && seg.day ? seg.day : myvFracToDate(it, frac, v.duration);
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
    const probe = myvPoints(it, 1);                  // timestamps, or the first / last frame dates
    const hasDates = !!probe;

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
    let dateIn = null, timeEl = null, rangeEl = null, allBtn = null, rangeText = '';
    if (hasDates) {
      dateIn = myvEl('input');
      dateIn.type = 'date';
      const all = probe.map(p => p.ms);
      dateIn.min = myvIso(Math.min(...all));
      dateIn.max = myvIso(Math.max(...all));
      dateIn.value = myvIso(probe[0].ms);
      dateIn.setAttribute('aria-label', 'Go to date');
      rangeText = myvIso(probe[0].ms) + ' \u2192 ' + myvIso(probe[probe.length - 1].ms);
      rangeEl = myvEl('span', 'myv-range', rangeText);
      allBtn = myvEl('button', 'myv-icon', 'All');
      allBtn.type = 'button';
      allBtn.hidden = true;
      allBtn.title = 'Play the whole dated part again';
      allBtn.addEventListener('click', () => this.clearSegment(it));
      line2.append(dateIn, rangeEl, allBtn);
    } else {
      timeEl = myvEl('span', 'myv-range myv-time', '0:00 / 0:00');
      line2.append(timeEl, myvEl('span', 'myv-range', it.library ? 'No dates set for this video' : 'Add dates with Edit to jump by date'));
    }
    tl.append(line1, line2);

    const ui = { slider, dateIn, timeEl, play, rangeEl, allBtn, rangeText, holdUntil: 0 };
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
      let frac = Number(slider.value) / 1000;
      this.clearSegment(it);                 // scrubbing by hand shows the dated part again
      const lim = this.rangeOf(it, v.duration);
      if (lim) { frac = Math.min(lim.to, Math.max(lim.from, frac * v.duration)) / v.duration; slider.value = String(Math.round(frac * 1000)); }
      myvFill(slider);
      ui.holdUntil = Date.now() + 400;
      if (dateIn) dateIn.value = myvFracToDate(it, frac, v.duration);
      if (timeEl) timeEl.textContent = myvClock(frac * v.duration) + ' / ' + myvClock(v.duration);
      this.seekTo(v, frac);
    });
    if (dateIn) {
      dateIn.addEventListener('change', () => {
        const v = this.videoOf(it);
        const d = myvDay(dateIn.value);
        if (!v || !isFinite(v.duration) || !isFinite(d)) return;
        const pts = myvPoints(it, v.duration);
        if (!pts) return;
        ui.holdUntil = Date.now() + 400;
        const seg = myvDaySegment(pts, d, v.duration);
        if (seg) {                                       // play only the part of the video that shows this day
          this.setSegment(it, Object.assign(seg, { day: myvIso(d) }));
          slider.value = String(Math.round(seg.from / v.duration * 1000));
          myvFill(slider);
          dateIn.value = myvIso(d);
          clearTimeout(v._myvPause);
          v.currentTime = seg.from;
          const p = v.play();
          if (p && p.catch) p.catch(() => {});
          return;
        }
        this.clearSegment(it);                           // a date outside the video: jump to the nearest end
        const frac = Math.min(1, Math.max(0, myvMsToTime(pts, d) / v.duration));
        slider.value = String(Math.round(frac * 1000));
        myvFill(slider);
        dateIn.value = myvFracToDate(it, frac, v.duration);
        this.seekTo(v, frac);
      });
    }

    this.syncTimeline(it, this.videoOf(it));
    this.syncSegUi(it);
    return tl;
  }

  // ---------- a picked date plays only that day's part of the video ----------
  setSegment(it, seg) {
    this.segs.set(it.id, { from: seg.from, to: seg.to, day: seg.day, it });
    this.syncSegUi(it);
    this.ensureTick();
  }

  clearSegment(it) {
    if (!this.segs.delete(it.id)) return;
    this.syncSegUi(it);
  }

  // The part of the video that may show: the picked day, else from the first to the last timestamp
  // (so an intro or outro outside the dated part is never shown). null = the whole video.
  rangeOf(it, dur) {
    const seg = this.segs.get(it.id);
    if (seg) return seg;
    const pts = myvPoints(it, dur);
    if (!pts) return null;
    const from = pts[0].t, to = pts[pts.length - 1].t;
    return from <= 0.05 && to >= dur - 0.05 ? null : { from, to };
  }

  ensureTick() {
    if (!this.segRaf) this.segRaf = requestAnimationFrame(() => this.segTick());
  }

  // Keeps every visible video inside its range; at the end of it the video loops back to its start
  segTick() {
    this.segRaf = 0;
    this.items.forEach(it => {
      if (!it.visible || it._offDate) return;
      const v = this.videoOf(it);
      if (!v || v.seeking || !isFinite(v.duration) || !v.duration) return;
      const r = this.rangeOf(it, v.duration);
      if (!r) return;
      const t = v.currentTime;
      if (v.paused) {
        if (t < r.from - 0.3 || t > r.to + 0.3) this.seekTo(v, r.from / v.duration);
      } else if (t >= r.to || t < r.from - 0.3) v.currentTime = r.from;
    });
    this.segRaf = requestAnimationFrame(() => this.segTick());
  }

  syncSegUi(it) {
    const ui = this.ui.get(it.id);
    if (!ui || !ui.rangeEl) return;
    const seg = this.segs.get(it.id);
    const label = d => (typeof situationDateLabel === 'function' ? situationDateLabel(d) : d);
    let text = ui.rangeText;
    if (it._offDate) text = 'Hidden \u00B7 no footage on ' + label(this.currentSliderDate());
    else if (seg && seg.follow) text = 'Slider \u00B7 ' + label(seg.follow) + ' (' + myvClock(seg.from) + '\u2013' + myvClock(seg.to) + ')';
    else if (seg) text = 'Only ' + seg.day + ' (' + myvClock(seg.from) + '\u2013' + myvClock(seg.to) + ')';
    ui.rangeEl.textContent = text;
    ui.allBtn.hidden = !seg || !!it._offDate;
  }

  // ---------- videos follow the date slider ----------
  currentSliderDate() { return typeof selectedSituationDate === 'string' ? selectedSituationDate : null; }

  // The slider moves in steps: a step runs from its date to the next slider date.
  stepSpan(date) {
    const i = SITUATION_DATES.indexOf(date);
    const a = myvDay(date);
    const b = i >= 0 && i < SITUATION_DATES.length - 1 ? myvDay(SITUATION_DATES[i + 1]) : a + 86400000;
    return { a, b };
  }

  // true when the video has dates but none of them fall inside the slider's current step
  outsideDate(it, date) {
    if (!this.follow || !date || this.gr) return false;     // not while a video is being georeferenced
    const r = myvDateRange(it);
    if (!r || typeof SITUATION_DATES === 'undefined') return false;
    const s = this.stepSpan(date);
    return !(s.b > r.a && s.a <= r.b);
  }

  followAll() { this.items.forEach(it => this.followOne(it)); }

  // Shows a video only on the slider dates it has footage for, and plays only that part of it
  followOne(it) {
    const date = this.currentSliderDate();
    if (!date || !it.visible) return;
    const off = this.outsideDate(it, date);
    if (!!it._offDate !== off) { it._offDate = off; this.drawOne(it); }     // appears / disappears
    const prev = this.segs.get(it.id);
    if (off || !this.follow) {
      if (prev && prev.follow) this.clearSegment(it);
      this.syncSegUi(it);
      return;
    }
    if (!myvDateRange(it)) return;                          // no dates: nothing to follow
    const v = this.videoOf(it);
    if (!v || !isFinite(v.duration) || !v.duration) return;  // done again when its length is known
    const pts = myvPoints(it, v.duration);
    if (!pts) return;
    const s = this.stepSpan(date);
    const seg = myvDaySegment(pts, s.a, v.duration, s.b - s.a);
    if (!seg) return;
    const same = prev && prev.follow === date && Math.abs(prev.from - seg.from) < 0.01 && Math.abs(prev.to - seg.to) < 0.01;
    this.setSegment(it, { from: seg.from, to: seg.to, day: null, follow: date });
    if (same && v.currentTime >= seg.from - 0.3 && v.currentTime <= seg.to + 0.3) return;
    clearTimeout(v._myvPause);
    v.currentTime = seg.from;
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
  }

  setFollow(on) {
    this.follow = on;
    try { localStorage.setItem('myvFollow', on ? '1' : '0'); } catch (e) { /* storage blocked */ }
    this.items.forEach(it => {
      const seg = this.segs.get(it.id);
      if (!on && seg && seg.follow) this.clearSegment(it);
      if (it.visible) { if (on) this.followOne(it); else if (it._offDate) this.drawOne(it); }
      this.syncSegUi(it);
    });
  }

  // Ticking a video that has no footage for the slider's date moves the slider to the video's dates
  alignSlider(it) {
    const tl = window.situationTimeline;
    const r = myvDateRange(it);
    if (!tl || !r || !this.outsideDate(it, this.currentSliderDate())) return;
    let target = SITUATION_DATES[0];
    for (const d of SITUATION_DATES) if (myvDay(d) <= r.a) target = d;
    tl.setDate(target);
  }

  redrawAll() { this.items.forEach(it => this.drawOne(it)); }

  allDrawn() {
    return this.items.every(it => {
      const m = this.media.get(it.id);
      return !it.visible || it._offDate || this.map.getLayer(myvLayerId(it.id)) || (m && m.pending);
    });
  }

  flyTo(it) {
    const lngs = it.corners.map(c => c[0]), lats = it.corners.map(c => c[1]);
    this.map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 80, duration: 1200, maxZoom: 12 });
  }

  // ---------- curved warps ----------
  // Rebuilds a saved curved warp (Polynomial 2/3, thin plate spline) from the saved control points
  prepareWarp(it) {
    it._mesh = null;
    const meta = MYV_METHODS[it.gcpMethod];
    if (!meta || !meta.curved || !it.gcps || !it.gcpAspect) return;
    const pairs = it.gcps.map(p => {
      const m = myvMerc([p.lng, p.lat]);
      return { x: p.u * it.gcpAspect, y: p.v, X: m.x, Y: m.y };
    });
    const fit = myvFitTransform(it.gcpMethod, pairs);
    if (!fit.error) it._mesh = { fit, A: it.gcpAspect };
  }

  makeMeshMedia(it) {
    const url = this.srcUrl(it);
    const v = document.createElement('video');
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v._myvCropped = true;                      // jumps only need a redraw, not the play/pause trick
    if (it.videoUrl) v.crossOrigin = 'anonymous';   // library videos need CORS to be drawn on the map
    v.src = url;
    const m = { video: v, mesh: true, alive: true, raf: 0, sleep: 0, pending: false };
    this.media.set(it.id, m);
    const loop = () => {
      m.raf = 0;
      if (!m.alive) return;
      this.map.triggerRepaint();
      if (!v.paused && !v.ended) m.raf = requestAnimationFrame(loop);
    };
    v.addEventListener('play', () => { if (!m.raf) m.raf = requestAnimationFrame(loop); });
    ['pause', 'seeked', 'loadeddata'].forEach(ev => v.addEventListener(ev, () => this.map.triggerRepaint()));
    this.bindVideo(it, v);
    return m;
  }

  drawMesh(it) {
    const map = this.map, lid = myvLayerId(it.id);
    const m = this.media.get(it.id) || this.makeMeshMedia(it);
    const mesh = myvBuildMesh(it._mesh.fit, it._mesh.A, it.crop, 32);
    if (!mesh) return;
    const layer = new MyvMeshLayer(lid, m.video, it.opacity, it.sharp);
    layer.setMesh(mesh);
    const before = map.getLayer('borders-glow-1') ? 'borders-glow-1' : undefined;
    map.addLayer(layer, before);
    this.meshLayers.set(it.id, layer);
    const p = m.video.play();
    if (p && p.catch) p.catch(() => {});
  }

  updateMesh(it) {
    const layer = this.meshLayers.get(it.id);
    if (!layer || !it._mesh) return;
    const mesh = myvBuildMesh(it._mesh.fit, it._mesh.A, it.crop, 32);
    if (mesh) layer.setMesh(mesh);
  }

  // Shows the result of a fit: a curved mesh, or the usual flat 4-corner picture
  applyWarp(it, fit, A, curved) {
    const was = !!it._mesh;
    if (curved && fit) {
      it._mesh = { fit, A };
      if (!was) { this.disposeMedia(it.id); this.drawOne(it); }      // switch to the mesh
      else this.updateMesh(it);
    } else {
      it._mesh = null;
      if (was) { this.disposeMedia(it.id); this.drawOne(it); }       // back to the flat picture
      else this.applyCorners(it);
    }
  }

  // ---------- georeferencer (control points, like QGIS) ----------
  buildGeorefDialog() {
    const modal = this.grModal = myvEl('div', 'myv-cropmodal myv-grmodal');
    modal.hidden = true;
    const dlg = myvEl('div', 'myv-cropdlg myv-grdlg');
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-label', 'Georeference video');

    const head = myvEl('div', 'myv-head');
    this.grTitle = myvEl('div', 'myv-title', 'Georeference');
    const x = myvEl('button', 'myv-icon myv-close', '\u2715');
    x.type = 'button';
    x.setAttribute('aria-label', 'Cancel');
    x.addEventListener('click', () => this.endGeoref(false));
    head.append(this.grTitle, x);

    const body = myvEl('div', 'myv-grbody');

    // --- left: the video picture, with zoom and pan ---
    const left = myvEl('div', 'myv-grleft');
    const viewer = this.grViewer = myvEl('div', 'myv-grviewer');
    const content = this.grContent = myvEl('div', 'myv-grcontent');
    const frame = this.grFrame = myvEl('div', 'myv-grframe');
    const vid = this.grVideo = myvEl('video');
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = 'auto';
    frame.append(vid);
    content.append(frame);
    viewer.append(content);
    left.append(viewer);

    const scrubRow = myvEl('div', 'myv-field');
    scrubRow.append(myvEl('span', 'myv-label', 'Video frame'));
    const scrub = this.grScrub = myvEl('input');
    scrub.type = 'range';
    scrub.min = '0';
    scrub.max = '1000';
    scrub.value = '0';
    scrub.setAttribute('aria-label', 'Video frame');
    scrub.addEventListener('input', () => {
      myvFill(scrub);
      if (isFinite(vid.duration)) vid.currentTime = (Number(scrub.value) / 1000) * vid.duration;
    });
    scrubRow.append(scrub);
    left.append(scrubRow, myvEl('div', 'myv-hint', 'Scroll to zoom, drag to move the picture. Click a spot you can recognise on the map, then click the same spot on the real map.'));

    // --- right: method, points, result ---
    const right = myvEl('div', 'myv-grright');
    const mField = myvEl('label', 'myv-field');
    mField.append(myvEl('span', 'myv-label', 'Transformation'));
    const msel = this.grMethod = myvEl('select');
    Object.keys(MYV_METHODS).forEach(k => {
      const o = myvEl('option', '', MYV_METHODS[k].label);
      o.value = k;
      msel.append(o);
    });
    msel.addEventListener('change', () => {
      if (!this.gr) return;
      this.gr.method = msel.value;
      this.grRefit();
      this.grRender();
    });
    mField.append(msel);

    const addBtn = this.grAddBtn = myvEl('button', 'myv-btn myv-primary', 'Add point');
    addBtn.type = 'button';
    addBtn.setAttribute('aria-pressed', 'true');
    addBtn.addEventListener('click', () => {
      if (!this.gr) return;
      this.gr.addMode = !this.gr.addMode;
      this.grSyncAddBtn();
    });

    this.grList = myvEl('div', 'myv-grpoints');
    this.grStatus = myvEl('div', 'myv-status');

    const foot = myvEl('div', 'myv-cropbtns myv-grfoot');
    const cancel = myvEl('button', 'myv-btn', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => this.endGeoref(false));
    const done = this.grDone = myvEl('button', 'myv-btn myv-primary', 'Done');
    done.type = 'button';
    done.addEventListener('click', () => this.endGeoref(true));
    foot.append(cancel, done);
    right.append(mField, addBtn, this.grList, this.grStatus, foot);

    body.append(left, right);
    dlg.append(head, body);
    modal.append(dlg);
    document.body.append(modal);

    modal.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); this.endGeoref(false); } });

    // zoom with the wheel, about the pointer
    viewer.addEventListener('wheel', e => {
      const g = this.gr;
      if (!g || !g.ready) return;
      e.preventDefault();
      const r = viewer.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const ns = Math.min(40, Math.max(0.4, g.s * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
      g.tx = px - (px - g.tx) * (ns / g.s);
      g.ty = py - (py - g.ty) * (ns / g.s);
      g.s = ns;
      this.grLayout();
    }, { passive: false });

    // drag = move the picture, click = add a point
    viewer.addEventListener('pointerdown', e => {
      const g = this.gr;
      if (!g || !g.ready || e.button !== 0) return;
      const st = { x: e.clientX, y: e.clientY, tx: g.tx, ty: g.ty, moved: false };
      try { viewer.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const move = ev => {
        const dx = ev.clientX - st.x, dy = ev.clientY - st.y;
        if (!st.moved && Math.hypot(dx, dy) < 4) return;
        st.moved = true;
        g.tx = st.tx + dx;
        g.ty = st.ty + dy;
        this.grLayout();
      };
      const up = ev => {
        viewer.removeEventListener('pointermove', move);
        viewer.removeEventListener('pointerup', up);
        viewer.removeEventListener('pointercancel', up);
        if (!st.moved && ev.type === 'pointerup' && this.gr && this.gr.addMode) this.grAddPoint(ev.clientX, ev.clientY);
      };
      viewer.addEventListener('pointermove', move);
      viewer.addEventListener('pointerup', up);
      viewer.addEventListener('pointercancel', up);
    });
  }

  grSyncAddBtn() {
    const on = !!(this.gr && this.gr.addMode);
    this.grAddBtn.classList.toggle('myv-primary', on);
    this.grAddBtn.setAttribute('aria-pressed', String(on));
    this.grViewer.classList.toggle('adding', on);
  }

  startGeoref(it) {
    if (this.gr) this.endGeoref(true);
    const map = this.map;
    this.grWasOpen = !this.panel.hidden;
    this.setOpen(false);
    if (!it.visible) { it.visible = true; this.drawOne(it); this.renderList(); }

    const c = it.crop || { x: 0, y: 0, w: 1, h: 1 };
    const url = URL.createObjectURL(it.blob);
    this.gr = {
      it, url, c,
      orig: { corners: it.corners.map(p => p.slice()), mesh: it._mesh || null },
      gcps: (it.gcps || []).map(p => Object.assign({}, p)),
      method: it.gcpMethod || 'affine',
      addMode: true, ready: false, aspect: 1, srcW: 0, srcH: 0,
      s: 1, tx: 0, ty: 0, picking: -1, markers: [], fit: null
    };
    this.grTitle.textContent = 'Georeference: ' + it.name;
    this.grMethod.value = this.gr.method;
    this.grSyncAddBtn();

    const vid = this.grVideo;
    vid.onloadedmetadata = () => {
      const g = this.gr;
      if (!g) return;
      g.srcW = vid.videoWidth * c.w;
      g.srcH = vid.videoHeight * c.h;
      g.aspect = g.srcW / g.srcH;
      g.ready = true;
      this.grFitView();
      vid.currentTime = Math.min(0.5, (vid.duration || 1) / 2);
      this.grRefit();
      this.grRender();
    };
    vid.src = url;
    this.grScrub.value = '0';
    myvFill(this.grScrub);
    this.grModal.hidden = false;
    this.grRefit();
    this.grRender();
    this.grAddBtn.focus();
  }

  // Sizes the viewer to the screen and fits the whole picture into it
  grFitView() {
    const g = this.gr, v = this.grViewer;
    if (!g || !g.ready) return;
    const narrow = window.innerWidth < 800;
    const vw = narrow ? window.innerWidth * 0.9 - 36 : Math.min(window.innerWidth * 0.92, 1200) - 380;
    const vh = Math.max(200, window.innerHeight * (narrow ? 0.42 : 0.96) - (narrow ? 120 : 210));
    v.style.width = Math.round(Math.max(240, vw)) + 'px';
    v.style.height = Math.round(vh) + 'px';
    const W = Math.max(240, vw);
    const fw = Math.min(W, vh * g.aspect), fh = fw / g.aspect;
    g.fw = fw;
    g.fh = fh;
    this.grFrame.style.width = fw + 'px';
    this.grFrame.style.height = fh + 'px';
    const vd = this.grVideo, c = g.c;                 // show only the cropped part of the video
    vd.style.width = fw / c.w + 'px';
    vd.style.height = fh / c.h + 'px';
    vd.style.left = -c.x * fw / c.w + 'px';
    vd.style.top = -c.y * fh / c.h + 'px';
    g.s = 1;
    g.tx = (W - fw) / 2;
    g.ty = (vh - fh) / 2;
    this.grLayout();
  }

  grLayout() {
    const g = this.gr;
    if (!g) return;
    this.grContent.style.transform = 'translate(' + g.tx + 'px,' + g.ty + 'px) scale(' + g.s + ')';
    this.grContent.style.setProperty('--inv', String(1 / g.s));
  }

  grAddPoint(cx, cy) {
    const g = this.gr, r = this.grFrame.getBoundingClientRect();
    const u = (cx - r.left) / r.width, v = (cy - r.top) / r.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    g.gcps.push({ u, v, lng: null, lat: null });
    this.grPick(g.gcps.length - 1);
  }

  // Hides the dialog and waits for a click on the real map
  grPick(i) {
    const g = this.gr, map = this.map;
    g.picking = i;
    this.grModal.hidden = true;
    const bar = myvEl('div', 'myv-tfbar');
    bar.append(myvEl('span', 'myv-tfhint', 'Point ' + (i + 1) + ': click the same spot on the map. Esc to cancel.'));
    const cancel = myvEl('button', 'myv-btn', 'Cancel');
    cancel.type = 'button';
    bar.append(cancel);
    ['mousedown', 'touchstart', 'dblclick'].forEach(ev => bar.addEventListener(ev, e => e.stopPropagation()));
    map.getCanvasContainer().append(bar);
    map.getCanvas().style.cursor = 'crosshair';

    const finish = ok => {
      map.off('click', onClick);
      document.removeEventListener('keydown', onKey);
      bar.remove();
      map.getCanvas().style.cursor = '';
      g.picking = -1;
      g.cancelPick = null;
      if (!ok && g.gcps[i] && g.gcps[i].lng === null) g.gcps.splice(i, 1);     // a point without a map spot is dropped
      if (this.gr === g) {
        this.grModal.hidden = false;
        this.grRefit();
        this.grRender();
      }
    };
    const onClick = e => {
      g.gcps[i].lng = e.lngLat.lng;
      g.gcps[i].lat = e.lngLat.lat;
      finish(true);
    };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); finish(false); } };
    cancel.addEventListener('click', () => finish(false));
    map.on('click', onClick);
    document.addEventListener('keydown', onKey);
    g.cancelPick = () => finish(false);
  }

  grPairs() {
    const g = this.gr;
    return g.gcps.map((p, i) => ({ p, i })).filter(o => o.p.lng !== null && o.p.lat !== null).map(o => {
      const m = myvMerc([o.p.lng, o.p.lat]);
      return { i: o.i, x: o.p.u * g.aspect, y: o.p.v, X: m.x, Y: m.y, lat: o.p.lat, lng: o.p.lng };
    });
  }

  // Fits the chosen transformation, moves the video on the map, works out the errors
  grRefit() {
    const g = this.gr;
    if (!g || !g.ready) return;          // needs the video's size first
    const pairs = this.grPairs();
    g.resid = {};
    g.fit = myvFitTransform(g.method, pairs);
    let msg = '', bad = false;
    if (g.fit.error) {
      msg = g.fit.error;
      bad = pairs.length >= MYV_METHODS[g.method].min;
      g.fit = null;
    } else {
      const A = g.aspect;
      const curved = !!MYV_METHODS[g.method].curved;
      const cs = [[0, 0], [A, 0], [A, 1], [0, 1]].map(([x, y]) => g.fit.f(x, y));
      const toLL = c => { const ll = new maplibregl.MercatorCoordinate(c[0], c[1], 0).toLngLat(); return [ll.lng, ll.lat]; };
      let corners = null;
      if (curved) {
        // a curved picture has no straight corners; these only serve to find and frame the video
        corners = cs.map(toLL);
        if (corners.some(c => !isFinite(c[0]) || !isFinite(c[1]) || Math.abs(c[1]) > MYV_MAX_LAT)) {
          const lngs = pairs.map(q => q.lng), lats = pairs.map(q => q.lat);
          const w = Math.min(...lngs), e = Math.max(...lngs), so = Math.min(...lats), no = Math.max(...lats);
          corners = [[w, no], [e, no], [e, so], [w, so]];
        }
      } else {
        let sign = 0, okShape = true;
        for (let k = 0; k < 4; k++) {
          const a0 = cs[k], b0 = cs[(k + 1) % 4], c0 = cs[(k + 2) % 4];
          const z = (b0[0] - a0[0]) * (c0[1] - b0[1]) - (b0[1] - a0[1]) * (c0[0] - b0[0]);
          if (!isFinite(z) || z === 0) okShape = false;
          else if (sign === 0) sign = Math.sign(z);
          else if (Math.sign(z) !== sign) okShape = false;
        }
        corners = okShape && cs.every(c => c[2] > 0) ? cs.map(toLL) : null;
        if (corners && corners.some(c => !isFinite(c[0]) || !isFinite(c[1]) || Math.abs(c[1]) > MYV_MAX_LAT)) corners = null;
      }
      if (!corners) {
        msg = 'These points fold or twist the picture. Check them, or try a simpler transformation.';
        bad = true;
        g.fit = null;
      } else {
        g.it.corners = corners;
        this.applyWarp(g.it, g.fit, A, curved);
        let sum = 0;
        pairs.forEach(q => {
          const pr = g.fit.f(q.x, q.y);
          const meters = Math.hypot(pr[0] - q.X, pr[1] - q.Y) * 40075016.686 * Math.cos(q.lat * Math.PI / 180);
          g.resid[q.i] = meters;
          sum += meters * meters;
        });
        const rms = Math.sqrt(sum / pairs.length);
        msg = pairs.length > MYV_METHODS[g.method].min
          ? 'RMS error: ' + myvMeters(rms)
          : 'Exact fit. Add one more point to see how accurate it is.';
      }
    }
    this.grStatus.textContent = msg;
    this.grStatus.classList.toggle('error', bad);
    this.grStatus.hidden = !msg;
    this.grDone.disabled = !g.fit && g.gcps.length > 0 && pairs.length >= MYV_METHODS[g.method].min;
  }

  // Rebuilds the list of points and the numbered markers (on the picture and on the map)
  grRender() {
    const g = this.gr;
    if (!g) return;
    g.markers.forEach(m => m.remove());
    g.markers = [];
    this.grFrame.querySelectorAll('.myv-gcp').forEach(e => e.remove());

    this.grList.replaceChildren(...g.gcps.map((p, i) => {
      const row = myvEl('div', 'myv-grrow');
      const top = myvEl('div', 'myv-grrow-top');
      top.append(myvEl('span', 'myv-grnum', String(i + 1)));
      const px = myvEl('span', 'myv-grpx', Math.round(p.u * g.srcW) + ', ' + Math.round(p.v * g.srcH) + ' px');
      const res = myvEl('span', 'myv-grres', g.resid && g.resid[i] !== undefined ? myvMeters(g.resid[i]) : '');
      const pick = myvEl('button', 'myv-icon', 'Pick');
      pick.type = 'button';
      pick.title = 'Click this point\u2019s place on the map again';
      pick.addEventListener('click', () => this.grPick(i));
      const del = myvEl('button', 'myv-icon', '\u2715');
      del.type = 'button';
      del.setAttribute('aria-label', 'Delete point ' + (i + 1));
      del.addEventListener('click', () => { g.gcps.splice(i, 1); this.grRefit(); this.grRender(); });
      top.append(px, res, pick, del);

      const coords = myvEl('div', 'myv-grrow-coords');
      const mkIn = (key, ph, lo, hi) => {
        const inp = myvEl('input');
        inp.type = 'text';
        inp.inputMode = 'decimal';
        inp.placeholder = ph;
        inp.value = p[key] === null ? '' : String(Math.round(p[key] * 1e6) / 1e6);
        inp.setAttribute('aria-label', ph + ' of point ' + (i + 1));
        inp.addEventListener('change', () => {
          const n = Number(inp.value.replace(',', '.'));
          if (inp.value.trim() === '' || !isFinite(n) || n < lo || n > hi) {
            inp.value = p[key] === null ? '' : String(Math.round(p[key] * 1e6) / 1e6);
            return;
          }
          p[key] = n;
          this.grRefit();
          this.grRender();
        });
        return inp;
      };
      coords.append(mkIn('lat', 'lat', -MYV_MAX_LAT, MYV_MAX_LAT), mkIn('lng', 'lng', -180, 180));
      row.append(top, coords);

      // markers
      const dot = myvEl('div', 'myv-gcp' + (p.lng === null ? ' pending' : ''), String(i + 1));
      dot.style.left = p.u * 100 + '%';
      dot.style.top = p.v * 100 + '%';
      this.grFrame.append(dot);
      if (p.lng !== null && p.lat !== null) {
        const md = myvEl('div', 'myv-gcp myv-gcp-map', String(i + 1));
        g.markers.push(new maplibregl.Marker({ element: md }).setLngLat([p.lng, p.lat]).addTo(this.map));
      }
      return row;
    }));
    this.grList.hidden = !g.gcps.length;
  }

  endGeoref(save) {
    const g = this.gr;
    if (!g) return;
    if (g.picking >= 0 && g.cancelPick) g.cancelPick();
    this.gr = null;
    g.markers.forEach(m => m.remove());
    this.grFrame.querySelectorAll('.myv-gcp').forEach(e => e.remove());
    this.grModal.hidden = true;
    this.grVideo.removeAttribute('src');
    this.grVideo.load();
    URL.revokeObjectURL(g.url);
    const it = g.it;
    if (save) {
      it.gcps = g.gcps.filter(p => p.lng !== null && p.lat !== null).map(p => ({ u: p.u, v: p.v, lng: p.lng, lat: p.lat }));
      it.gcpMethod = g.method;
      it.gcpAspect = g.aspect;
      this.save(it);
    } else {
      const nowMesh = !!it._mesh;
      it.corners = g.orig.corners;
      it._mesh = g.orig.mesh;
      if (nowMesh || it._mesh) { this.disposeMedia(it.id); this.drawOne(it); }
      else this.applyCorners(it);
    }
    this.setOpen(this.grWasOpen);
  }

  // ---------- where a new video first appears ----------
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
    const url = this.srcUrl(it);
    const v = document.createElement('video');
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v._myvCropped = true;
    if (it.videoUrl) v.crossOrigin = 'anonymous';   // library videos need CORS to be drawn on the map
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
      if (!it.visible || it._offDate || !m.alive || map.getLayer(lid)) return;
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

  // Puts another video file into an existing entry; position, crop, points and dates stay.
  replaceVideo(it) {
    const input = myvEl('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      this.say('Checking the video\u2026');
      this.status.hidden = false;
      const [oldInfo, newInfo] = await Promise.all([myvProbe(it.blob), myvProbe(file)]);
      if (!newInfo) { this.say('This browser cannot play that file. Try an H.264 .mp4 or a .webm.', true); return; }
      if (oldInfo && oldInfo.h && newInfo.h) {
        const ratio = (newInfo.w / newInfo.h) / (oldInfo.w / oldInfo.h);
        if (Math.abs(ratio - 1) > 0.02 &&
            !window.confirm('The new video has a different shape. It will keep the same place on the map, so it may look stretched. Use Georef afterwards to adjust it. Continue?')) {
          this.say('');
          return;
        }
      }
      if (this.editingId === it.id) this.resetForm();       // the form still held the old file
      this.disposeMedia(it.id);
      const old = this.urls.get(it.id);
      if (old) { URL.revokeObjectURL(old); this.urls.delete(it.id); }
      it.blob = file;
      this.drawOne(it);
      this.renderList();
      const saved = await this.save(it);
      this.say(saved ? 'Video replaced.' : 'Replaced on the map, but it could not be saved (storage full or blocked).', !saved);
    });
    input.click();
  }

  // ---------- list ----------
  renderList() {
    const own = this.items.filter(it => !it.library), lib = this.items.filter(it => it.library);
    this.toggle.textContent = own.length ? 'My Videos (' + own.length + ')' : 'My Videos';
    this.listEl.hidden = !own.length;
    lib.sort((a, b) => (a.created || 0) - (b.created || 0));
    this.libEl.hidden = !lib.length;
    this.ui.clear();
    this.listEl.replaceChildren(...own.map(it => this.rowEl(it)));
    this.libEl.replaceChildren(...lib.map(it => this.rowEl(it)));
  }

  rowEl(it) {
    const row = myvEl('div', 'myv-item' + (this.editingId === it.id ? ' editing' : ''));

    const vis = myvEl('input');
    vis.type = 'checkbox';
    vis.checked = !!it.visible;
    vis.title = 'Show on the map';
    vis.addEventListener('change', async () => {
      it.visible = vis.checked;
      if (it.visible) this.alignSlider(it);
      this.drawOne(it);
      if (it.library && it.visible && !it._flown) { it._flown = true; this.flyTo(it); }   // show where it is, once
      await this.save(it);
    });

    const name = myvEl('button', 'myv-name', it.name);
    name.type = 'button';
    name.title = 'Go to this video';
    name.addEventListener('click', () => this.flyTo(it));

    const geo = myvEl('button', 'myv-icon', 'Georef');
    geo.type = 'button';
    geo.title = 'Georeference with control points, like QGIS';
    geo.addEventListener('click', () => this.startGeoref(it));

    const edit = myvEl('button', 'myv-icon', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => this.startEdit(it));

    const del = myvEl('button', 'myv-icon', '\u2715');
    del.type = 'button';
    del.title = 'Delete';
    del.setAttribute('aria-label', 'Delete ' + it.name);
    del.addEventListener('click', () => this.remove(it));

    row.append(vis);
    if (it.library) row.append(this.thumbEl(it));
    row.append(name);
    if (!it.library || it.linked) row.append(del);       // videos added with links can be removed again
    const swap = myvEl('button', 'myv-icon', 'Swap');
    swap.type = 'button';
    swap.title = 'Replace with another video file (keeps position, crop and points)';
    swap.addEventListener('click', () => this.replaceVideo(it));
    const exp = myvEl('button', 'myv-icon', 'Export');
    exp.type = 'button';
    exp.title = 'Download a .json with the position, to add this video to the site for everyone';
    exp.addEventListener('click', () => this.exportItem(it));
    const actions = myvEl('div', 'myv-actions');
    actions.append(geo, swap, edit, exp);
    const tl = this.timelineEl(it);
    const block = myvEl('div', 'myv-block');
    block.append(row);
    if (!it.library) block.append(actions);           // library videos are read-only
    block.append(tl);
    return block;
  }

  // ---------- preview + mini player ----------
  thumbEl(it) {
    const b = myvEl('button', 'vitem-thumb myv-thumb');
    b.type = 'button';
    b.title = 'Play';
    b.setAttribute('aria-label', 'Play ' + it.name);
    const v = myvEl('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.src = it.videoUrl.split('#')[0] + '#t=0.1';        // first frame as the preview
    b.append(v);
    b.addEventListener('click', () => this.openPlayer(it));
    return b;
  }

  buildPlayer() {
    const modal = this.pm = myvEl('div', 'pmodal myv-pmodal');
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Video player');
    const panel = myvEl('div', 'pmodal-panel');
    const close = this.pmClose = myvEl('button', 'vmodal-close', '\u2715');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => this.closePlayer());
    const head = myvEl('div', 'pmodal-head');
    this.pmTitle = myvEl('span', 'pmodal-title');
    head.append(this.pmTitle);
    const frame = myvEl('div', 'pmodal-frame');
    const video = this.pmVideo = myvEl('video');
    video.controls = true;
    video.playsInline = true;
    frame.append(video);
    const foot = myvEl('div', 'pmodal-foot');
    const link = this.pmLink = myvEl('a', 'pmodal-link', 'Open the video in a new tab');
    link.target = '_blank';
    link.rel = 'noopener';
    foot.append(link);
    panel.append(close, head, frame, foot);
    modal.append(panel);
    modal.addEventListener('click', e => { if (e.target === modal) this.closePlayer(); });
    document.body.append(modal);
  }

  openPlayer(it) {
    if (!this.pm) this.buildPlayer();
    this.pmTitle.textContent = it.name;
    this.pmLink.href = it.videoUrl;
    this.pmVideo.src = it.videoUrl;
    this.pm.hidden = false;
    requestAnimationFrame(() => this.pm.classList.add('open'));
    const p = this.pmVideo.play();
    if (p && p.catch) p.catch(() => {});
    this.pmClose.focus();
    this.pmKey = e => { if (e.key === 'Escape') this.closePlayer(); };
    document.addEventListener('keydown', this.pmKey);
  }

  closePlayer() {
    if (!this.pm || this.pm.hidden) return;
    this.pm.classList.remove('open');
    this.pmVideo.pause();
    document.removeEventListener('keydown', this.pmKey);
    setTimeout(() => {
      if (this.pm.classList.contains('open')) return;         // opened again in the meantime
      this.pm.hidden = true;
      this.pmVideo.removeAttribute('src');
      this.pmVideo.load();
    }, 280);
  }

  // ---------- the storage (list of ready georeferenced videos) ----------
  buildStorage() {
    const modal = this.st = myvEl('div', 'vmodal myv-storage');
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Video storage');
    const panel = myvEl('div', 'vmodal-panel');
    const head = myvEl('div', 'vmodal-head');
    head.append(myvEl('span', 'vmodal-title', 'Video storage'), myvEl('span', 'vmodal-count', String(MYV_STORAGE.length)));
    const close = this.stClose = myvEl('button', 'vmodal-close', '\u2715');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => this.closeStorage());
    this.stList = myvEl('div', 'vmodal-list');
    this.stStatus = myvEl('div', 'myv-status');
    this.stStatus.hidden = true;
    panel.append(head, close, this.stList, this.stStatus);
    modal.append(panel);
    modal.addEventListener('click', e => { if (e.target === modal) this.closeStorage(); });
    document.body.append(modal);
  }

  storageSay(text, isError) {
    this.stStatus.textContent = text || '';
    this.stStatus.hidden = !text;
    this.stStatus.classList.toggle('error', !!isError);
  }

  openStorage() {
    if (!this.st) this.buildStorage();
    this.storageSay('');
    this.renderStorage();
    this.st.hidden = false;
    requestAnimationFrame(() => this.st.classList.add('open'));
    this.stClose.focus();
    this.stKey = e => { if (e.key === 'Escape' && !(this.pm && !this.pm.hidden)) this.closeStorage(); };
    document.addEventListener('keydown', this.stKey);
  }

  closeStorage() {
    if (!this.st || this.st.hidden) return;
    this.st.classList.remove('open');
    document.removeEventListener('keydown', this.stKey);
    setTimeout(() => { if (!this.st.classList.contains('open')) this.st.hidden = true; }, 280);
  }

  renderStorage() {
    const abs = link => { try { return new URL(link, document.baseURI).href; } catch (e) { return ''; } };
    if (!MYV_STORAGE.length) {
      this.stList.replaceChildren(myvEl('div', 'vpanel-empty', 'No videos in the storage yet.'));
      return;
    }
    this.stList.replaceChildren(...MYV_STORAGE.map((entry, i) => {
      const videoUrl = abs(entry.video);
      const name = entry.name || decodeURIComponent((videoUrl.split(/[?#]/)[0].split('/').pop() || 'Video').replace(/\.[^.]+$/, ''));
      const added = this.items.find(x => x.linked && x.videoUrl === videoUrl);

      const row = myvEl('div', 'vrow');
      row.style.setProperty('--i', i);
      const info = myvEl('div', 'vrow-info');
      const btn = myvEl('button', 'myv-btn' + (added ? '' : ' myv-primary'), added ? 'Remove from map' : 'Add to map');
      btn.type = 'button';
      btn.style.marginTop = '8px';
      btn.addEventListener('click', async () => {
        if (added) { await this.remove(added, true); this.renderStorage(); return; }
        btn.disabled = true;
        btn.textContent = 'Adding\u2026';
        const ok = await this.addFromStorage(entry, name, videoUrl);
        if (ok) this.closeStorage();
        else { btn.disabled = false; btn.textContent = 'Add to map'; }
      });
      info.append(myvEl('span', 'vrow-title', name), btn);

      const thumb = myvEl('button', 'vrow-thumb myv-vthumb');
      thumb.type = 'button';
      thumb.title = 'Play';
      thumb.setAttribute('aria-label', 'Play ' + name);
      const v = myvEl('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'metadata';
      v.src = videoUrl.split('#')[0] + '#t=0.1';              // first frame as the preview
      thumb.append(v);
      thumb.addEventListener('click', () => this.openPlayer({ name, videoUrl }));
      row.append(info, thumb);
      return row;
    }));
  }

  // Reads the georeference file, checks the video and puts it on the map. Returns true when done.
  async addFromStorage(entry, name, videoUrl) {
    this.storageSay('Loading\u2026');
    await this.ready;
    const existing = this.items.find(x => x.linked && x.videoUrl === videoUrl);
    if (existing) {
      this.alignSlider(existing);
      if (!existing.visible) {
        existing.visible = true;
        this.drawOne(existing);
      }
      this.renderList();
      this.flyTo(existing);
      this.storageSay('');
      return true;
    }

    let data;
    try {
      const res = await fetch(new URL(entry.georef, document.baseURI).href);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
    } catch (e) {
      this.storageSay('Could not read the georeference file of "' + name + '".', true);
      return false;
    }
    const it = myvFromLibrary(String(entry.georef).split(/[?#]/)[0].split('/').pop() || 'video.json', data, videoUrl);
    if (!it) { this.storageSay('The georeference file of "' + name + '" is not valid.', true); return false; }
    if (!(await myvCanPlayUrl(videoUrl))) {
      this.storageSay('The video "' + name + '" did not load (an H.264 .mp4 or a .webm, and its storage must allow this site).', true);
      return false;
    }
    it.id = 'link-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    it.name = name;
    it.linked = true;
    it.visible = true;
    it.created = Date.now();
    it._flown = true;
    this.items.push(it);
    this.prepareWarp(it);
    this.alignSlider(it);
    this.drawOne(it);
    this.renderList();
    this.flyTo(it);
    this.storageSay('');
    return true;
  }

  // Downloads the position of a video as a .json (its link goes in MYV_STORAGE at the top of this file)
  exportItem(it) {
    const slug = String(it.name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || ('video-' + it.id);
    const data = {
      format: 'tmw-georeferenced-video',
      version: 1,
      name: it.name,
      corners: it.corners,
      opacity: it.opacity,
      startDate: it.startDate || '',
      endDate: it.endDate || '',
      stamps: it.stamps || [],
      crop: it.crop || { x: 0, y: 0, w: 1, h: 1 },
      sharp: !!it.sharp,
      gcps: it.gcps || [],
      gcpMethod: it.gcpMethod || 'affine',
      gcpAspect: it.gcpAspect || 1
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = slug + '.json';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.say('Saved ' + slug + '.json');
  }

  async remove(it, noConfirm) {
    if (!noConfirm && !window.confirm((it.linked ? 'Remove "' : 'Delete "') + it.name + (it.linked ? '" from the map?' : '" from this browser?'))) return;
    const map = this.map;
    try {
      if (map.getLayer(myvLayerId(it.id))) map.removeLayer(myvLayerId(it.id));
      if (map.getSource(myvSrcId(it.id))) map.removeSource(myvSrcId(it.id));
    } catch (e) { /* ignore */ }
    const url = this.urls.get(it.id);
    if (url) { URL.revokeObjectURL(url); this.urls.delete(it.id); }
    this.items = this.items.filter(x => x !== it);
    this.ui.delete(it.id);
    this.segs.delete(it.id);
    this.disposeMedia(it.id);
    if (this.editingId === it.id) this.resetForm();
    this.renderList();
    if (this.db) { try { await myvRun(this.db, 'readwrite', s => s.delete(it.id)); } catch (e) { /* ignore */ } }
  }

  // Reads a georeference .json (made by Export) and fills the form with it
  async loadGeoJson(file) {
    this.pendingGeo = null;
    if (!file) return;
    const fail = msg => { this.jsonIn.value = ''; this.say(msg, true); };
    let d;
    try { d = JSON.parse(await file.text()); } catch (e) { fail('That file is not valid JSON.'); return; }
    const okPair = c => Array.isArray(c) && c.length === 2 && c.every(Number.isFinite);
    if (!d || !Array.isArray(d.corners) || d.corners.length !== 4 || !d.corners.every(okPair)) {
      fail('This .json has no georeference. Use a file made with the Export button.');
      return;
    }
    this.pendingGeo = d;
    if (!this.nameIn.value.trim() && d.name) this.nameIn.value = String(d.name).slice(0, 80);
    this.opIn.value = String(Math.min(1, Math.max(0.1, Number(d.opacity) || 1)));
    myvFill(this.opIn);
    this.sharpIn.checked = !!d.sharp;
    this.startIn.value = d.startDate || '';
    this.endIn.value = d.endDate || '';
    const c = d.crop;
    this.crop = c && [c.x, c.y, c.w, c.h].every(Number.isFinite) ? { x: c.x, y: c.y, w: c.w, h: c.h } : { x: 0, y: 0, w: 1, h: 1 };
    this.updateCropSummary();
    this.stamps = (Array.isArray(d.stamps) ? d.stamps : []).filter(s => s && [s.y, s.m, s.d, s.h, s.mi, s.t].every(Number.isFinite)).map(s => ({ y: s.y, m: s.m, d: s.d, h: s.h, mi: s.mi, t: s.t }));
    this.renderStamps();
    const hasLink = typeof d.video === 'string';
    this.say('Georeference loaded.' + (hasLink ? ' It holds a video link, so a video file is not needed.' : ' Now choose the video file it belongs to.') + ' Press the button to add it.');
  }

  // ---------- timestamps ----------
  buildStampEditor() {
    const det = this.vsBox = myvEl('details', 'myv-vs');
    det.append(myvEl('summary', 'myv-vs-sum', 'Video Settings'));

    const head = myvEl('div', 'myv-row myv-ts-head');
    head.append(myvEl('span', 'myv-label', 'Edit Timestamps'));
    const btns = myvEl('div', 'myv-ts-btns');
    const mk = (text, title, fn) => {
      const b = myvEl('button', 'myv-icon myv-ts-btn', text);
      b.type = 'button';
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('click', fn);
      return b;
    };
    btns.append(
      mk('\u2195', 'Sort by video time', () => { this.stamps.sort((a, b) => a.t - b.t); this.renderStamps(); }),
      mk('+', 'Add a timestamp', () => this.addStamp()),
      mk('i', 'How timestamps work', () => { this.tsInfo.hidden = !this.tsInfo.hidden; })
    );
    head.append(btns);

    this.tsInfo = myvEl('div', 'myv-hint myv-ts-info',
      'Each row says: when the video is at this time, the map shows this date. Between two rows the date moves smoothly; ' +
      'the dates may jump or go back. Add at least two rows. The \u2192 button takes the current time of the video. ' +
      ''); 
    this.tsInfo.hidden = true;
    this.tsList = myvEl('div', 'myv-ts-list');
    det.append(head, this.tsInfo, this.tsList);
    this.renderStamps();
    return det;
  }

  addStamp() {
    const last = this.stamps[this.stamps.length - 1];
    const sd = /^(\d{4,6})-(\d\d)-(\d\d)$/.exec(this.startIn.value || '');
    const s = last ? Object.assign({}, last, { t: Math.round((last.t + 1) * 100) / 100 })
      : sd ? { y: Number(sd[1]), m: Number(sd[2]), d: Number(sd[3]), h: 0, mi: 0, t: 0 }
      : { y: 1939, m: 9, d: 1, h: 0, mi: 0, t: 0 };
    this.stamps.push(s);
    this.renderStamps();
    this.vsBox.open = true;
  }

  // The video time to copy into a row: the video on the map when editing, else the crop preview
  stampVideoTime() {
    const it = this.editingId ? this.items.find(x => x.id === this.editingId) : null;
    const v = (it && this.videoOf(it)) || (this.cropVideo && this.cropVideo.getAttribute('src') ? this.cropVideo : null);
    return v && isFinite(v.currentTime) ? v.currentTime : null;
  }

  renderStamps() {
    if (!this.tsList) return;
    this.tsList.replaceChildren(...this.stamps.map((s, i) => this.stampRow(s, i)));
    this.tsList.hidden = !this.stamps.length;
    if (this.stamps.length && this.vsBox) this.vsBox.open = true;
  }

  stampRow(s, i) {
    const row = myvEl('div', 'myv-ts-row');
    const field = (key, lo, hi, digits, cls) => {
      const inp = myvEl('input', 'myv-ts-in ' + cls);
      inp.type = 'text';
      inp.inputMode = 'numeric';
      inp.maxLength = digits;
      inp.value = myvP2(s[key]).padStart(digits, '0');
      inp.setAttribute('aria-label', key + ' of timestamp ' + (i + 1));
      inp.addEventListener('change', () => {
        const n = parseInt(inp.value, 10);
        if (isFinite(n)) s[key] = Math.min(hi, Math.max(lo, n));
        inp.value = String(s[key]).padStart(digits, '0');
        s.d = Math.min(s.d, myvDaysIn(s.y, s.m));
        dayIn.value = myvP2(s.d);
      });
      return inp;
    };
    const dayIn = field('d', 1, 31, 2, 'ts-d');
    const month = myvEl('select', 'myv-ts-in ts-m');
    ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
      .forEach((n, k) => { const o = myvEl('option', '', n); o.value = String(k + 1); month.append(o); });
    month.value = String(s.m);
    month.setAttribute('aria-label', 'Month of timestamp ' + (i + 1));
    month.addEventListener('change', () => {
      s.m = Number(month.value);
      s.d = Math.min(s.d, myvDaysIn(s.y, s.m));
      dayIn.value = myvP2(s.d);
    });
    const yearIn = field('y', 1, 9999, 4, 'ts-y');

    const line1 = myvEl('div', 'myv-ts-line');
    line1.append(dayIn, month, yearIn, myvEl('span', 'myv-ts-ad', 'AD'));

    const hIn = field('h', 0, 23, 2, 'ts-h'), mIn = field('mi', 0, 59, 2, 'ts-mi');
    const clock = myvEl('input', 'myv-ts-in ts-t');
    clock.type = 'text';
    clock.value = myvStampClock(s.t);
    clock.title = 'Video time (hh:mm:ss.cc)';
    clock.setAttribute('aria-label', 'Video time of timestamp ' + (i + 1));
    clock.addEventListener('change', () => {
      const n = myvParseClock(clock.value);
      if (isFinite(n)) s.t = Math.round(n * 100) / 100;
      clock.value = myvStampClock(s.t);
    });
    const take = myvEl('button', 'myv-icon myv-ts-btn', '\u2192');
    take.type = 'button';
    take.title = 'Use the current time of the video';
    take.addEventListener('click', () => {
      const t = this.stampVideoTime();
      if (t === null) { this.say('Show the video on the map (or choose a file) to take its time.', true); return; }
      s.t = Math.round(t * 100) / 100;
      clock.value = myvStampClock(s.t);
    });
    const del = myvEl('button', 'myv-icon myv-ts-btn', '\u2715');
    del.type = 'button';
    del.title = 'Delete this timestamp';
    del.addEventListener('click', () => { this.stamps.splice(i, 1); this.renderStamps(); });

    const line2 = myvEl('div', 'myv-ts-line');
    line2.append(hIn, myvEl('span', 'myv-ts-ad', ':'), mIn, clock, take, del);
    row.append(line1, line2);
    return row;
  }

  // The rows as saved data, or { error } when they cannot work
  cleanStamps() {
    const list = this.stamps.map(s => ({ y: s.y, m: s.m, d: s.d, h: s.h, mi: s.mi, t: Math.round(s.t * 100) / 100 }));
    if (!list.length) return { list: [] };
    if (list.length < 2) return { error: 'Add at least two timestamps, or delete the one you have.' };
    list.sort((a, b) => a.t - b.t);
    for (let i = 1; i < list.length; i++) {
      if (!(list[i].t > list[i - 1].t)) return { error: 'Two timestamps have the same video time. Give each row its own video time.' };
    }
    return { list };
  }

  // ---------- form ----------
  startEdit(it) {
    this.editingId = it.id;
    this.fileIn.value = '';
    this.nameIn.value = it.name;
    this.opIn.value = String(it.opacity);
    myvFill(this.opIn);
    this.sharpIn.checked = !!it.sharp;
    this.startIn.value = it.startDate || '';
    this.endIn.value = it.endDate || '';
    this.stamps = (it.stamps || []).map(s => Object.assign({}, s));
    this.renderStamps();
    this.pendingGeo = null;
    this.jsonIn.value = '';
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
    this.opIn.value = '1';
    myvFill(this.opIn);
    this.startIn.value = '';
    this.endIn.value = '';
    this.stamps = [];
    this.renderStamps();
    this.pendingGeo = null;
    if (this.jsonIn) this.jsonIn.value = '';
    if (this.vsBox) this.vsBox.open = false;
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
    const geo = this.pendingGeo;
    if (!editing && !file && !(geo && typeof geo.video === 'string')) {
      this.say(geo ? 'Choose the video file this .json belongs to (it holds only the position).' : 'Choose a video file first.', true);
      return;
    }

    const startDate = this.startIn.value, endDate = this.endIn.value;
    if (startDate || endDate) {
      if (!startDate || !endDate) { this.say('Set both timeline dates, or leave both empty.', true); return; }
      if (!(myvDay(endDate) > myvDay(startDate))) { this.say('The last-frame date must be after the first-frame date.', true); return; }
    }

    const stampData = this.cleanStamps();
    if (stampData.error) { this.say(stampData.error, true); return; }

    if (!editing && !file && geo) {                    // the .json carries a link to the video
      this.say('Loading\u2026');
      const url = new URL(geo.video, document.baseURI).href;
      if (!(await myvCanPlayUrl(url))) { this.say('The video link in this .json did not load (an H.264 .mp4 or a .webm, and its storage must allow this site).', true); return; }
      const it = myvFromLibrary('video.json', geo, url);
      if (!it) { this.say('This .json is not a valid georeference.', true); return; }
      it.id = 'link-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      it.name = this.nameIn.value.trim() || it.name;
      it.linked = true;
      it.visible = true;
      it.created = Date.now();
      it._flown = true;
      this.items.push(it);
      this.prepareWarp(it);
      this.alignSlider(it);
      this.drawOne(it);
      this.resetForm();
      this.flyTo(it);
      this.say('Added. A video added by link is not kept after a reload; add the .json again then.');
      return;
    }

    if (file) {
      this.say('Checking the video\u2026');
      const ok = await myvCanPlay(file);
      if (!ok) { this.say('This browser cannot play that file. Try an H.264 .mp4 or a .webm.', true); return; }
    }

    const crop = this.currentCrop();
    const opacity = Math.min(1, Math.max(0.1, Number(this.opIn.value) || 1));
    const name = this.nameIn.value.trim() || (file ? file.name.replace(/\.[^.]+$/, '') : editing.name);
    let item, redo = false;
    if (editing) {
      // The control points are set on the cropped picture, so a new crop makes them useless
      const cropChanged = JSON.stringify(editing.crop || null) !== JSON.stringify(crop);
      const hadPoints = !!(editing.gcps && editing.gcps.length);
      if (cropChanged && hadPoints && !geo && !window.confirm('Changing the crop moves the picture your control points were set on. They will be removed and you will georeference the video again. Continue?')) return;
      item = editing;
      item.name = name;
      if (cropChanged && hadPoints && !geo) {
        item.gcps = [];
        item._mesh = null;
        if (MYV_METHODS[item.gcpMethod] && MYV_METHODS[item.gcpMethod].curved) item.gcpMethod = 'affine';
        redo = true;
      }
      item.opacity = opacity;
      item.startDate = startDate;
      item.endDate = endDate;
      item.stamps = stampData.list;
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
        name, blob: file, corners: this.spawnCorners(crop), opacity, startDate, endDate, stamps: stampData.list, crop, sharp: this.sharpIn.checked, visible: true, created: Date.now()
      };
      this.items.push(item);
    }

    if (editing) this.disposeMedia(item.id);       // crop / file may have changed
    if (geo) {                                     // position from the .json
      item.corners = geo.corners.map(c => c.slice());
      item.gcps = Array.isArray(geo.gcps) ? geo.gcps : [];
      item.gcpMethod = geo.gcpMethod || 'affine';
      item.gcpAspect = geo.gcpAspect || 1;
      this.prepareWarp(item);
      redo = false;
    }
    this.alignSlider(item);
    this.drawOne(item);
    const saved = await this.save(item);
    const wasEditing = !!editing;
    this.resetForm();
    if (!saved) this.say('The video is on the map, but it could not be saved (storage full or blocked). It will be lost when you reload.', true);
    else if (!wasEditing && navigator.storage && navigator.storage.persist) navigator.storage.persist();
    if ((!wasEditing && !geo) || redo) this.startGeoref(item);          // new video: georeference it right away
  }
}

function initMyVideos(map) {
  const control = new MyVideosControl(map);
  map.addControl(control, 'bottom-left');
  onStyleReady(() => control.redrawAll());   // keep the videos when the base map changes
  control.ready = control.load();

  // Safety net, same idea as the borders: if a style change wipes the videos, draw them again.
  let redrawing = false;
  map.on('styledata', () => {
    if (redrawing || !control.items.length || control.allDrawn()) return;
    redrawing = true;
    try { control.redrawAll(); } catch (e) { /* retry on the next styledata */ }
    redrawing = false;
  });
}