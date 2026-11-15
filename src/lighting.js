'use strict';
// ---------------------------------------------------------------------------
// Lighting: the lab is dark. We fill a "darkness" canvas, then punch holes
// in it where there is light. Lights are dithered so they stay pixel-art.
// ---------------------------------------------------------------------------

const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

// A circular light mask with an ordered-dither falloff.
function bakeLight(R, power) {
  const s = R * 2;
  const c = makeCanvas(s, s), x = c.getContext('2d');
  x.fillStyle = '#fff';
  for (let j = 0; j < s; j++) {
    for (let i = 0; i < s; i++) {
      const d = Math.hypot(i - R + 0.5, j - R + 0.5) / R;
      if (d >= 1) continue;
      const lit = (1 - d) * power;
      if (lit > (BAYER4[j % 4][i % 4] + 0.5) / 16) x.fillRect(i, j, 1, 1);
    }
  }
  return c;
}

const LIGHT = {
  player: bakeLight(100, 2.6),
  playerFlicker: bakeLight(80, 2.0),
  halo: bakeLight(170, 1.1),
  playerNight: bakeLight(58, 2.6), // Night Eyes: a much smaller light
  playerBig: bakeLight(128, 2.6),   // Compound Eyes: a wider one
  haloNight: bakeLight(96, 1.1),
  med: bakeLight(28, 1.4),
  small: bakeLight(12, 1.3),
};

const darkCanvas = makeCanvas(ROOM_PX_W, ROOM_PX_H);
const dctx = darkCanvas.getContext('2d');

function updateLighting(dt) {
  // Faulty lights: every so often everything goes nearly black for a moment.
  game.flicker = Math.max(0, (game.flicker || 0) - dt);
  if (Math.random() < 0.0025) {
    game.flicker = rand(0.08, 0.35);
    Sfx.play('flicker');
  }
}

function drawLighting(ctx) {
  const p = game.player;
  const flickering = game.flicker > 0 && Math.floor(game.time * 24) % 2;
  dctx.globalCompositeOperation = 'source-over';
  dctx.globalAlpha = 1;
  dctx.clearRect(0, 0, ROOM_PX_W, ROOM_PX_H);
  dctx.fillStyle = flickering ? 'rgba(4,2,4,0.96)' : 'rgba(4,2,4,0.82)';
  dctx.fillRect(0, 0, ROOM_PX_W, ROOM_PX_H);

  dctx.globalCompositeOperation = 'destination-out';
  const light = (img, x, y, a) => {
    dctx.globalAlpha = a;
    dctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
  };

  const night = p.stats.lightMul < 1, big = p.stats.lightMul > 1;
  if (p.blackoutT > 0) light(LIGHT.haloNight, p.x, p.y, 0.3); // Blackout: your light is out
  else {
    if (!flickering) light(night ? LIGHT.haloNight : LIGHT.halo, p.x, p.y, 0.55);
    light(night ? LIGHT.playerNight : big ? LIGHT.playerBig : flickering ? LIGHT.playerFlicker : LIGHT.player, p.x, p.y, flickering ? 0.6 : 1);
  }
  if (p.stats.lure) { const l = lurePoint(p); light(LIGHT.med, l.x, l.y, 0.9); }
  for (const a of game.allies) light(LIGHT.small, a.x, a.y, 0.4);

  // Projectiles and your bile pools give off a little light.
  for (const b of game.bullets) light(LIGHT.small, b.x, b.y, 0.6);
  for (const pd of game.puddles) light(LIGHT.small, pd.x, pd.y, pd.team === 'player' ? 0.5 : 0.35);
  if (game.room.hatch) light(LIGHT.med, ROOM_PX_W / 2, ROOM_PX_H / 2, 0.8);
  for (const pk of game.room.pickups) light(LIGHT.small, pk.x, pk.y, 0.6);
  for (const o of game.room.orbs) light(LIGHT.small, o.x, o.y, 0.45);

  dctx.globalAlpha = 1;
  ctx.drawImage(darkCanvas, 0, 0);
}

// Pulsing red edges when you're nearly dead.
function drawLowHealth(ctx) {
  const p = game.player;
  if (!p || p.hp > 2 || game.state !== 'play') return;
  const beat = Math.max(0, Math.sin(game.time * (p.hp === 1 ? 9 : 6.5)));
  const strength = (p.hp === 1 ? 0.5 : 0.3) * beat;
  for (let i = 0; i < 10; i++) {
    const a = strength * (1 - i / 10);
    if (a <= 0.01) continue;
    if ((i + Math.floor(game.time * 8)) % 2) continue; // dithered
    ctx.fillStyle = `rgba(140,10,24,${a})`;
    ctx.fillRect(i, ROOM_Y + i, VIEW_W - i * 2, 1);
    ctx.fillRect(i, ROOM_Y + ROOM_PX_H - 1 - i, VIEW_W - i * 2, 1);
    ctx.fillRect(i, ROOM_Y + i, 1, ROOM_PX_H - i * 2);
    ctx.fillRect(VIEW_W - 1 - i, ROOM_Y + i, 1, ROOM_PX_H - i * 2);
  }
}
