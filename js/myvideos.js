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

function myvFormatCorners(corners, order) {
  const r = n => Math.round(n * 1e6) / 1e6;
  return corners.map(c => order === 'lnglat' ? r(c[0]) + ', ' + r(c[1]) : r(c[1]) + ', ' + r(c[0])).join('\n');
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
    this.editingId = null;
    this.ui = new Map();         // id -> timeline controls in the list
    this.media = new Map();      // id -> hidden video (+ canvas for cropped videos)
    this.meshLayers = new Map(); // id -> WebGL layer of a curved (warped) video
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

    const placeField = myvEl('label', 'myv-field');
    placeField.append(myvEl('span', 'myv-label', 'Placement'));
    this.placeSel = myvEl('select');
    [['gcp', 'Georeference with points (like QGIS)'], ['hand', 'Place by hand on the map']].forEach(([v, t]) => {
      const o = myvEl('option', '', t);
      o.value = v;
      this.placeSel.append(o);
    });
    placeField.append(this.placeSel);

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
    this.cornersIn.placeholder = 'Leave empty to use the placement above.\n\nOr type points, one per line:\ntop-left, top-right, bottom-right, bottom-left\n(or 2 points: top-left and bottom-right)';
    cornerLabel.append(cornerHead, this.cornersIn);
    cornerLabel.append(myvEl('div', 'myv-hint', 'Leave this empty to use the placement above. If you cropped the video, the corners are those of the cropped part.'));

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

    form.append(fileLabel, cropBox, nameLabel, placeField, cornerLabel, dateField, opLabel, sharpLabel, buttons, this.status);
    panel.append(form);

    el.append(toggle);
    document.body.append(panel);
    this.buildGeorefDialog();
    this.renderList();
    return el;
  }

  onRemove() {
    if (this.tf) this.endTransform(false);
    if (this.gr) this.endGeoref(false);
    this.grModal.remove();
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
      this.items.forEach(it => this.prepareWarp(it));
    } catch (e) {
      this.db = null;
      this.say('This browser cannot save videos (private mode?). They will be lost when you reload.', true);
    }
    this.renderList();
    this.redrawAll();
  }

  async save(item) {
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
      if (!it.visible) {
        const hidden = this.media.get(it.id);
        if (hidden) hidden.video.pause();            // no need to keep decoding a hidden video
        return;
      }
      if (it._mesh) { this.drawMesh(it); return; }
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
    let url = this.urls.get(it.id);
    if (!url) { url = URL.createObjectURL(it.blob); this.urls.set(it.id, url); }
    const v = document.createElement('video');
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v._myvCropped = true;                      // jumps only need a redraw, not the play/pause trick
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
    if (this.tf) this.endTransform(true);
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
      if (this.editingId === it.id) this.cornersIn.value = myvFormatCorners(it.corners, this.orderSel.value);
    } else {
      const nowMesh = !!it._mesh;
      it.corners = g.orig.corners;
      it._mesh = g.orig.mesh;
      if (nowMesh || it._mesh) { this.disposeMedia(it.id); this.drawOne(it); }
      else this.applyCorners(it);
    }
    this.setOpen(this.grWasOpen);
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
    if (it._mesh) {
      if (!window.confirm('Moving this video by hand replaces its curved warp with a flat picture. Continue?')) return;
      it._mesh = null;
      if (MYV_METHODS[it.gcpMethod] && MYV_METHODS[it.gcpMethod].curved) it.gcpMethod = 'affine';
      this.disposeMedia(it.id);
      this.drawOne(it);
    }
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

    const geo = myvEl('button', 'myv-icon', 'Georef');
    geo.type = 'button';
    geo.title = 'Georeference with control points, like QGIS';
    geo.addEventListener('click', () => this.startGeoref(it));

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

    row.append(vis, name, del);
    const swap = myvEl('button', 'myv-icon', 'Swap');
    swap.type = 'button';
    swap.title = 'Replace with another video file (keeps position, crop and points)';
    swap.addEventListener('click', () => this.replaceVideo(it));
    const actions = myvEl('div', 'myv-actions');
    actions.append(geo, move, swap, edit);
    const tl = this.timelineEl(it);
    const block = myvEl('div', 'myv-block');
    block.append(row, actions, tl);
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
    this.editCorners0 = this.cornersIn.value;
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
    this.editCorners0 = null;
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
      const untouched = this.editCorners0 !== null && this.cornersIn.value === this.editCorners0 && this.orderSel.value === 'latlng';
      if (!untouched) {                                  // new corners replace any curved warp
        item.corners = auto ? this.spawnCorners(crop) : parsed.corners;
        item._mesh = null;
        if (MYV_METHODS[item.gcpMethod] && MYV_METHODS[item.gcpMethod].curved) item.gcpMethod = 'affine';
      }
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
    if (auto) {
      if (this.placeSel.value === 'gcp') this.startGeoref(item);
      else this.startTransform(item, false);
    } else if (!wasEditing) this.flyTo(item);
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