'use strict';
// ---------------------------------------------------------------------------
// A tiny procedural pixel painter.
//
// Instead of hand-placing every pixel, sprites are built from shaded shapes:
//   blob()  - a lit ellipsoid (flesh, heads, eyeballs, pustules...)
//   tube()  - a lit tapering tube along a path (tails, horns, tentacles)
//   cyl()   - a lit vertical cylinder (barrels, tanks)
//   eye()   - a wet eyeball with iris, pupil and highlight
// Shading uses 5-tone color ramps, a top-left light, surface noise and a
// little ordered dithering. outline() then wraps the sprite in a dark edge.
// Everything is baked once at startup into ordinary canvases.
// ---------------------------------------------------------------------------

// Color ramps: darkest -> lightest.
const RAMPS = {
  flesh:  ['#2a1216', '#5a2228', '#8a3a3a', '#b0605a', '#d89a88'],
  socket: ['#140608', '#240c10', '#3a1418', '#4e1e22', '#5e282a'],
  rot:    ['#161a10', '#30361f', '#505a34', '#727c4c', '#98a06c'],
  fur:    ['#141214', '#2c2826', '#48423e', '#6a625a', '#8e857a'],
  pink:   ['#2a1418', '#5a2e32', '#8a4e4e', '#b07070', '#d09a90'],
  metal:  ['#0e0e10', '#24242a', '#3e3e46', '#5e5e66', '#8a8a92'],
  rust:   ['#160c08', '#33180e', '#552a16', '#7a4222', '#a0643a'],
  glow:   ['#3a0608', '#7a0e12', '#c01a20', '#ff4040', '#ffb0a0'],
  bone:   ['#2e2618', '#5e5240', '#968868', '#c4b898', '#e8e0c8'],
  urchin: ['#140810', '#2e101c', '#4c1a2a', '#6e2c3a', '#94485a'],
  toad:   ['#10140c', '#222a18', '#3a4626', '#56643a', '#7a8a52'],
  belly:  ['#2a2a18', '#4e4c2e', '#7a7448', '#a49c68', '#c8c08e'],
  pus:    ['#3a3a12', '#6a6a20', '#9aa030', '#c4c858', '#e8eca0'],
  blood:  ['#2a0608', '#5a0c12', '#8a1420', '#c02a34', '#e86a6a'],
  bile:   ['#1a200a', '#38441a', '#5e6e28', '#8a9a38', '#b8c860'],
  cyst:   ['#2a1020', '#52223e', '#7a3a5a', '#a45a7a', '#cc8aa0'],
  chitin: ['#120c08', '#2a1e14', '#463424', '#6a5038', '#8e7254'],
  muscle: ['#2a0608', '#5a1014', '#8a1c22', '#b0383a', '#d0605a'],
  sclera: ['#3a3022', '#7a6c4e', '#b0a27a', '#d8cca4', '#ece4c8'],
  amber:  ['#3a1a04', '#6a3408', '#a05a10', '#d08a20', '#f0c060'],
  stone:  ['#121012', '#24201f', '#38322f', '#4e4642', '#6a605a'],
  wood:   ['#140c08', '#2c1c10', '#46301c', '#64462a', '#86623c'],
  murk:   ['#060c0a', '#0e1c16', '#18302a', '#26463c', '#3a6052'],
  empty:  ['#120a0c', '#1e1416', '#2a1c1e', '#3a2a2c', '#4a383a'],
};

// Make a 5-tone ramp from a single color (for tinted things like vials).
function rampFrom(hex) {
  const [r, g, b] = hexRgb(hex);
  const f = k => '#' + [r, g, b].map(c => Math.round(clamp(c * k, 0, 255)).toString(16).padStart(2, '0')).join('');
  return [f(0.2), f(0.45), f(0.75), f(1), f(1.3)];
}

const _rgbCache = {};
function hexRgb(hex) {
  if (!_rgbCache[hex]) _rgbCache[hex] = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16));
  return _rgbCache[hex];
}

// Deterministic hash noise (same sprite every time).
function hash2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Smooth value noise, 0..1.
function vnoise(x, y, scale, seed) {
  const fx = x / scale, fy = y / scale;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const LIGHT_DIR = (() => { const v = [-0.55, -0.7, 0.55]; const l = Math.hypot(...v); return v.map(c => c / l); })();

class Painter {
  constructor(w, h, seed = 1) {
    this.w = w; this.h = h; this.seed = seed;
    this.col = new Array(w * h).fill(null);
    this.dark = new Array(w * h).fill(null); // darkest tone of the ramp that painted each pixel (for outlines)
    this.tf = null;
  }

  // Scale everything painted afterwards by `s` around the anchor point (ax, ay).
  // Used to paint the same creature at different sizes.
  scaleAround(s, ax, ay) { this.tf = { s, ax, ay }; return this; }
  _t(x, y) { const t = this.tf; return t ? [t.ax + (x - t.ax) * t.s, t.ay + (y - t.ay) * t.s] : [x, y]; }
  _r(r) { return this.tf ? r * this.tf.s : r; }

  set(x, y, color, ramp) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.col[i] = color;
    this.dark[i] = ramp ? ramp[0] : color;
    if (this.stack) (this.stack[i] || (this.stack[i] = [])).push(this.cur, color, this.dark[i]);
  }

  // --- Anatomy layers (dismemberment) ---------------------------------------------------
  // part('legL') ... part(null): everything painted in between belongs to that part.
  // Each pixel remembers every [part, color, dark] painted on it, so the sprite can be
  // rebuilt with parts missing (compose) and each part cut out whole (partSprite).
  part(name) {
    if (!this.stack) { // start tracking: what's already painted is the body
      this.stack = new Array(this.w * this.h);
      this.parts = [];
      for (let i = 0; i < this.col.length; i++) if (this.col[i] !== null) this.stack[i] = [null, this.col[i], this.dark[i]];
    }
    if (name && !this.parts.includes(name)) this.parts.push(name);
    this.cur = name || null;
    return this;
  }

  // Where a part sits: the center of every pixel it ever painted (sprite coords).
  partCenter(name) {
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < this.stack.length; i++) {
      const s = this.stack[i]; if (!s) continue;
      for (let k = 0; k < s.length; k += 3) if (s[k] === name) { sx += i % this.w; sy += (i / this.w) | 0; n++; break; }
    }
    return n ? [sx / n + 0.5, sy / n + 0.5, n] : [this.w / 2, this.h / 2, 0];
  }

  // The sprite with some parts gone, raw stumps where they were torn from.
  compose(missing = [], metal = false) { // metal: torn plating and a hot spark instead of meat and bone
    const Q = new Painter(this.w, this.h, this.seed), W = this.w;
    const gone = new Uint8Array(this.w * this.h), raw = new Uint8Array(this.w * this.h);
    for (let i = 0; i < this.stack.length; i++) {
      const s = this.stack[i]; if (!s) continue;
      let top = -1;
      for (let k = s.length - 3; k >= 0; k -= 3) if (!missing.includes(s[k])) { top = k; break; }
      const lost = missing.includes(s[s.length - 3]);
      if (top < 0) { gone[i] = 1; continue; }
      Q.col[i] = s[top + 1]; Q.dark[i] = s[top + 2];
      if (lost) raw[i] = 1; // a missing part used to cover this: exposed meat
    }
    if (missing.length) {
      // Exposed meat only near the tear (within 2px of where the part stuck out); further in, the body shows.
      let near = gone;
      for (let pass = 0; pass < 2; pass++) {
        const nx = near.slice();
        for (let i = 0; i < near.length; i++) if (near[i]) for (const d of [1, -1, W, -W]) if (i + d >= 0 && i + d < near.length) nx[i + d] = 1;
        near = nx;
      }
      for (let i = 0; i < raw.length; i++) if (!near[i]) raw[i] = 0;
      const bone = missing.map(m => this.partCenter(m)), best = bone.map(() => [Infinity, -1]);
      for (let i = 0; i < Q.col.length; i++) {
        if (Q.col[i] === null) continue;
        const x = i % W, y = (i / W) | 0;
        let edge = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < this.h && gone[ny * W + nx]) edge = true;
        }
        if (edge || raw[i]) {
          Q.col[i] = metal ? RAMPS.metal[(x + y) & 1] : edge ? RAMPS.blood[2 + ((x + y) & 1)] : RAMPS.muscle[1 + (hash2(x, y, 9) * 3 | 0)];
          Q.dark[i] = RAMPS.blood[0];
          bone.forEach(([bx, by], j) => { const d = (x + 0.5 - bx) ** 2 + (y + 0.5 - by) ** 2; if (d < best[j][0]) best[j] = [d, i]; });
        }
      }
      for (const [, i] of best) if (i >= 0) Q.col[i] = metal ? '#ffb040' : '#e8e0c8'; // a bone end (or a live wire) in each stump
    }
    return Q.outline().toCanvas();
  }

  // One part on its own, whole (including bits the body was painted over), outlined,
  // with a raw red end where it joined. Returns { img, cx, cy } (center, sprite coords).
  partSprite(name, metal = false) {
    const Q = new Painter(this.w, this.h, this.seed);
    for (let i = 0; i < this.stack.length; i++) {
      const s = this.stack[i]; if (!s) continue;
      for (let k = s.length - 3; k >= 0; k -= 3) if (s[k] === name) { Q.col[i] = s[k + 1]; Q.dark[i] = s[k + 2]; break; }
    }
    // The joint: its edge pixels that touch the rest of the body.
    const W = this.w, joint = [];
    for (let i = 0; i < Q.col.length; i++) {
      if (Q.col[i] === null) continue;
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= this.h) continue;
        const j = ny * W + nx;
        if (Q.col[j] === null && this.stack[j]) { joint.push(i); break; }
      }
    }
    for (const i of joint) { Q.col[i] = metal ? (i & 1 ? '#ffb040' : RAMPS.metal[0]) : RAMPS.blood[2 + (i & 1)]; Q.dark[i] = metal ? RAMPS.metal[0] : RAMPS.blood[0]; }
    const [cx, cy] = this.partCenter(name);
    return { img: Q.outline().toCanvas(), cx, cy };
  }

  has(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.col[y * this.w + x] !== null;
  }

  // Turn a brightness value 0..1 into a ramp color (with a touch of dithering).
  shade(v, ramp, x, y, dither = 0.55) {
    const n = ramp.length;
    const d = ((BAYER[y & 3][x & 3] + 0.5) / 16 - 0.5) * dither;
    return ramp[clamp(Math.floor(v * n + d), 0, n - 1)];
  }

  // A lit ellipsoid. o: { noise, spec, shift, specColor }
  blob(cx, cy, rx, ry, ramp, o = {}) {
    if (!o.raw && this.tf) { [cx, cy] = this._t(cx, cy); rx = Math.max(0.5, this._r(rx)); ry = Math.max(0.5, this._r(ry)); }
    const noise = o.noise === undefined ? 0.14 : o.noise;
    const [lx, ly, lz] = LIGHT_DIR;
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        const nz = Math.sqrt(1 - d);
        let v = 0.5 + 0.5 * (nx * lx + ny * ly + nz * lz);
        v = v * 0.8 + nz * 0.2;
        v += (hash2(x, y, this.seed) - 0.5) * noise + (vnoise(x, y, 3, this.seed) - 0.5) * noise * 1.6;
        v += o.shift || 0;
        let c = this.shade(v, ramp, x, y);
        if (o.spec && v > 0.97) c = o.specColor || '#f6e6d8'; // wet highlight
        this.set(x, y, c, ramp);
      }
    }
    return this;
  }

  // A lit tube following a path of points, tapering from r0 to r1.
  tube(points, r0, r1, ramp, o = {}) {
    let total = 0;
    const segs = [];
    for (let i = 1; i < points.length; i++) {
      const l = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      segs.push(l); total += l;
    }
    let acc = 0;
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1], [x1, y1] = points[i];
      const steps = Math.max(1, Math.ceil(segs[i - 1] * 2));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const r = r0 + (r1 - r0) * ((acc + segs[i - 1] * t) / (total || 1));
        this.blob(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, Math.max(0.5, r), Math.max(0.5, r), ramp, o);
      }
      acc += segs[i - 1];
    }
    return this;
  }

  // A vertical cylinder, lit from the left.
  cyl(x0, x1, y0, y1, ramp, o = {}) {
    for (let x = x0; x <= x1; x++) {
      const nx = ((x + 0.5 - x0) / (x1 - x0 + 1)) * 2 - 1;
      const base = 0.55 - nx * 0.35 + Math.sqrt(Math.max(0, 1 - nx * nx)) * 0.2;
      for (let y = y0; y <= y1; y++) {
        let v = base + (hash2(x, y, this.seed) - 0.5) * (o.noise || 0.12) + (o.shift || 0);
        if (o.bands && o.bands.includes(y)) v -= 0.3;
        this.set(x, y, this.shade(v, ramp, x, y), ramp);
      }
    }
    return this;
  }

  // Flat-ish rectangle with noise (for box faces).
  rect(x0, y0, x1, y1, ramp, v0, o = {}) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const v = v0 + (hash2(x, y, this.seed) - 0.5) * (o.noise || 0.15) + (vnoise(x, y, 4, this.seed) - 0.5) * 0.15;
      this.set(x, y, this.shade(v, ramp, x, y), ramp);
    }
    return this;
  }

  // A wet eyeball. o: { look: [dx, dy], milky, bloodshot }
  eye(cx, cy, r, iris, o = {}) {
    [cx, cy] = this._t(cx, cy); r = Math.max(0.8, this._r(r));
    this.blob(cx, cy, r, r, RAMPS.sclera, { noise: 0.06, spec: 1, raw: true });
    const [lx, ly] = o.look || [0.35, 0.1];
    const ix = cx + lx * r * 0.4, iy = cy + ly * r * 0.4, ir = r * (o.milky ? 0.45 : 0.62);
    const irisRamp = rampFrom(iris);
    for (let y = Math.floor(iy - ir); y <= Math.ceil(iy + ir); y++) {
      for (let x = Math.floor(ix - ir); x <= Math.ceil(ix + ir); x++) {
        const d = Math.hypot(x + 0.5 - ix, y + 0.5 - iy) / ir;
        if (d > 1 || !this.has(x, y)) continue;
        this.set(x, y, o.milky ? '#a8a490' : irisRamp[d > 0.7 ? 1 : 2], RAMPS.sclera);
      }
    }
    if (!o.milky) this.set(ix, iy, '#060304', RAMPS.sclera);
    if (r >= 2) this.set(cx - r * 0.45, cy - r * 0.45, '#fffaf2', RAMPS.sclera);
    if (o.bloodshot) {
      for (let k = 0; k < 4; k++) {
        const a = hash2(k, 7, this.seed) * Math.PI * 2;
        this.set(cx + Math.cos(a) * (r - 0.6), cy + Math.sin(a) * (r - 0.6), '#a01820', RAMPS.sclera);
      }
    }
    return this;
  }

  // A line drawn only over already-painted pixels (veins, seams, cracks).
  scratch(points, color) {
    points = points.map(([x, y]) => this._t(x, y));
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1], [x1, y1] = points[i];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
      for (let k = 0; k <= n; k++) {
        const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n;
        if (this.has(x, y)) this.set(x, y, color, null);
      }
    }
    return this;
  }

  // A wandering vein starting at (x, y).
  vein(x, y, len, color, dir = 0) {
    const pts = [[x, y]];
    for (let i = 0; i < len; i++) {
      dir += (hash2(i, Math.floor(x * 7 + y), this.seed) - 0.5) * 1.6;
      x += Math.cos(dir); y += Math.sin(dir);
      pts.push([x, y]);
    }
    return this.scratch(pts, color);
  }

  dot(x, y, color) { [x, y] = this._t(x, y); this.set(x, y, color, null); return this; }

  // Wrap the sprite in a dark outline tinted by the neighbor's ramp.
  outline() {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.col[y * this.w + x] !== null) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
        const d = this.dark[ny * this.w + nx];
        if (d) { add.push([x, y, d]); break; }
      }
    }
    for (const [x, y, d] of add) {
      const [r, g, b] = hexRgb(d);
      this.col[y * this.w + x] = `#${[r, g, b].map(c => Math.round(c * 0.45).toString(16).padStart(2, '0')).join('')}`;
    }
    return this;
  }

  toCanvas() {
    const c = makeCanvas(this.w, this.h);
    const x = c.getContext('2d');
    const img = x.createImageData(this.w, this.h);
    for (let i = 0; i < this.col.length; i++) {
      const col = this.col[i];
      if (!col) continue;
      const [r, g, b] = hexRgb(col);
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    if (this.stack) c.painter = this; // keeps its layers for dismemberment
    return c;
  }
}
