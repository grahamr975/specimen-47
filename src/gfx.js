'use strict';
// ---------------------------------------------------------------------------
// Graphics helpers: palette, pixel sprites, crisp circles, and a bitmap font.
// Everything is drawn to a small 320x256 canvas that gets scaled up, so all
// coordinates should be whole numbers to keep pixels crisp.
// ---------------------------------------------------------------------------

const VIEW_W = 320;
const VIEW_H = 256;

// Horror palette: desaturated, grimy, with blood red as the accent.
// (Names are roles, e.g. "white" is old bone, "lime" is sickly bile.)
const PAL = {
  black: '#0b080a', plum: '#4a1a2e', red: '#b01e30', orange: '#c0603f',
  yellow: '#c4b060', lime: '#9aae50', green: '#4f5e34', teal: '#2e3b33',
  navy: '#1a1820', blue: '#3b4a6b', sky: '#7a90a8', cyan: '#a8c0b8',
  white: '#ddd3bc', silver: '#9a9284', slate: '#625b55', dark: '#2a2528',
};

// Body fluids. Each creature bleeds its own kind.
const FLUID = {
  blood: ['#5a0a12', '#7a0f1a', '#3d060c', '#8a1020'],
  rot: ['#3d4a1a', '#2e3814', '#4f5e22'],
  bile: ['#6a7a20', '#4f5a18', '#8a9a30'],
  oil: ['#141214', '#1e1a1c', '#2a2422'],
  ichor: ['#3a0a24', '#2a0618', '#4a1030'],
};

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Build a sprite from rows of characters. Each character is looked up in
// `palette` to get its color; '.' means transparent.
function makeSprite(rows, palette) {
  const h = rows.length;
  const w = Math.max(...rows.map(r => r.length));
  const c = makeCanvas(w, h);
  const x = c.getContext('2d');
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < rows[j].length; i++) {
      const color = palette[rows[j][i]];
      if (!color) continue;
      x.fillStyle = color;
      x.fillRect(i, j, 1, 1);
    }
  }
  return c;
}

// Same shape, one flat color (used for hit flashes and outlines).
function silhouette(src, color) {
  const c = makeCanvas(src.width, src.height);
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

function flipH(src) {
  const c = makeCanvas(src.width, src.height);
  const x = c.getContext('2d');
  x.translate(src.width, 0);
  x.scale(-1, 1);
  x.drawImage(src, 0, 0);
  return c;
}

// Draw a sprite centered on (x, y), snapped to whole pixels.
// A recolored copy of a sprite: the tint's hue over the sprite's own shading
// (the 'color' blend keeps light and dark), an optional accent along the
// top, optionally darkened. Cached per sprite and tint.
const TINT_CACHE = new WeakMap();
function tintedFrame(img, tint, scale = 1) {
  let m = TINT_CACHE.get(img);
  if (!m) TINT_CACHE.set(img, m = new Map());
  const key = tint.key + scale;
  let c = m.get(key);
  if (c) return c;
  c = makeCanvas(img.width, img.height);
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'color';
  if (tint.accent) {
    // Two-tone: the accent owns the back (top), the main color the body, meeting mid-flank.
    const fade = (col, a0, a1) => { const g = x.createLinearGradient(0, img.height * 0.5, 0, img.height * 0.72); g.addColorStop(0, a0 ? col : 'rgba(0,0,0,0)'); g.addColorStop(1, a1 ? col : 'rgba(0,0,0,0)'); return g; };
    x.globalAlpha = tint.accentAmt * scale; x.fillStyle = fade(tint.accent, 1, 0); x.fillRect(0, 0, c.width, c.height);
    x.globalAlpha = tint.amt * scale;       x.fillStyle = fade(tint.color, 0, 1);  x.fillRect(0, 0, c.width, c.height);
  } else {
    x.globalAlpha = tint.amt * scale;
    x.fillStyle = tint.color; x.fillRect(0, 0, c.width, c.height);
  }
  if (tint.dark) {
    x.globalCompositeOperation = 'multiply';
    x.globalAlpha = tint.dark * scale;
    x.fillStyle = '#404040'; x.fillRect(0, 0, c.width, c.height);
  }
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'destination-in';
  x.drawImage(img, 0, 0);
  m.set(key, c);
  return c;
}

function drawCentered(ctx, img, x, y) {
  ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
}

// Filled circle made of horizontal pixel runs (no anti-aliasing).
function pxCircle(ctx, cx, cy, r, color) {
  cx = Math.round(cx); cy = Math.round(cy);
  ctx.fillStyle = color;
  const ri = Math.ceil(r);
  for (let dy = -ri; dy <= ri; dy++) {
    const d = r * r - dy * dy;
    if (d < 0) continue;
    const w = Math.floor(Math.sqrt(d));
    ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
}

// Circle outline, one pixel thick.
function pxRing(ctx, cx, cy, r, color) {
  cx = Math.round(cx); cy = Math.round(cy);
  ctx.fillStyle = color;
  const steps = Math.max(12, Math.floor(r * 7));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
  }
}

// --- 3x5 bitmap font ------------------------------------------------------
// Each glyph is 15 bits, read left-to-right, top-to-bottom.
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010',
  8: '111101111101111', 9: '111101111001110',
  '.': '000000000000010', ',': '000000000010100', '!': '010010010000010', '?': '110001010000010',
  '-': '000000111000000', '+': '000010111010000', ':': '000010000010000', ';': '000010000010100', '/': '001001010100100',
  '#': '101111101111101', '%': '101001010100101', '(': '010100100100010', ')': '010001001001010',
  '>': '100010001010100', '<': '001010100010001', "'": '010010000000000', '=': '000111000111000',
  '[': '110100100100110', ']': '011001001001011', '*': '000101010101000', ' ': '000000000000000',
};

// M and W need 5 pixels of width to be readable.
FONT.M = '1000111011101011000110001';
FONT.W = '1000110001101011101110001';
const glyphW = ch => (FONT[ch] && FONT[ch].length === 25 ? 5 : 3);

function textWidth(s, scale = 1) {
  s = String(s).toUpperCase();
  let w = 0;
  for (const ch of s) w += (glyphW(ch) + 1) * scale;
  return w - scale;
}

// Large text is "scrawled": letters jitter up and down and are worn away in
// places (always the same way, so it doesn't flicker). Small text stays crisp.
function drawTextRaw(ctx, s, x, y, color, scale) {
  ctx.fillStyle = color;
  const big = scale >= 2;
  for (let i = 0; i < s.length; i++) {
    const g = FONT[s[i]];
    const gw = glyphW(s[i]);
    const code = s.charCodeAt(i);
    const jy = big ? Math.round((hash2(i, code, 5) - 0.5) * scale * 0.9) : 0;
    if (g) {
      for (let p = 0; p < g.length; p++) {
        if (g[p] !== '1') continue;
        if (scale >= 3 && hash2(i * 31 + p, code, 9) < 0.07) continue; // worn (only on big titles, to stay readable)
        ctx.fillRect(x + (p % gw) * scale, y + jy + Math.floor(p / gw) * scale, scale, scale);
      }
    }
    x += (gw + 1) * scale;
  }
}

// align: 'left' | 'center' | 'right'. A dark, blood-tinted drop shadow keeps text readable.
function drawText(ctx, s, x, y, color = PAL.white, scale = 1, align = 'left', shadow = '#160507') {
  s = String(s).toUpperCase();
  if (align === 'center') x -= Math.floor(textWidth(s, scale) / 2);
  else if (align === 'right') x -= textWidth(s, scale);
  x = Math.round(x); y = Math.round(y);
  if (shadow) drawTextRaw(ctx, s, x + (scale >= 2 ? 1 : 0), y + scale, shadow, scale);
  drawTextRaw(ctx, s, x, y, color, scale);
}

// Split text into lines of at most `maxChars` characters.
function wrapText(s, maxChars) {
  const words = String(s).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxChars) { lines.push(line); line = w; }
    else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  return lines;
}

// Small math helpers used everywhere.
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
