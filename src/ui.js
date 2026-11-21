'use strict';
// ---------------------------------------------------------------------------
// HUD, minimap, the evolution (pick 1 of 3) screen, and full screens.
// ---------------------------------------------------------------------------

// --- Evolution screen -----------------------------------------------------------
// Pick one of 3 cards. A card is a new PART for a free slot, or the next
// BRANCH of a part you're growing (which locks out its sibling). Cards
// deliberately do NOT explain what mutations do: you learn by growing them.

function openEvolution(opts) {
  const p = game.player;
  if (opts.apex) { becomeApex(p); return; } // the ultimate metamorphosis has no cards
  if (opts.vial && !opts.loc) opts.loc = vialTarget(p); // a mutagen vial grows what you're missing (or anything, if nothing is)
  game.menu = {
    choices: opts.evolve && p.parts.includes(opts.evolve) && childrenOf(opts.evolve.id).length ? childrenOf(opts.evolve.id).map(id => ({ id, kind: 'branch', part: opts.evolve }))
      : opts.levelUp ? rollLevelUps(p, 3) : rollChoices(p, 3, opts.minRarity, opts.slot || opts.loc, opts.plain, opts.opened),
    color: opts.color,
    slotsLeft: freeSlots(p),
    src: opts,
    title: opts.title || 'EVOLUTION',
    sub: opts.evolve ? MUTATIONS[opts.evolve.id].name.toUpperCase() + ' IS READY TO CHANGE' : opts.levelUp ? `LEVEL ${p.level} - GROW A PART` : opts.slot ? 'ITS CORE BECOMES YOURS' : opts.loc ? `GROW A ${LOC_NAME[opts.loc] || opts.loc}` : opts.vial ? 'IT GROWS WHATEVER IT LIKES' : `LEVEL ${p.level} - CHOOSE A MUTATION`,
    hover: -1, t: 0,
    stage: 'cards', stageT: 0,
  };
  Sfx.play('evolve');
}

const CARD = { w: 94, h: 146, gap: 7, y: 50 };

function cardX(i, n) {
  const total = n * CARD.w + (n - 1) * CARD.gap;
  return Math.round((VIEW_W - total) / 2) + i * (CARD.w + CARD.gap);
}

// Your first weapon can't be put off: a body is never left with no attack.
function mustChoose(p, menu) {
  return !partAt(p, 'MOUTH') && menu.choices.some(c => c.id !== '_gorge' && MUTATIONS[c.id] && locOf(c.id) === 'MOUTH' && !MUTATIONS[c.id].from);
}


function closeMenu() {
  game.menu = null;
  game.player.fireT = 0.3; // don't fire from the click that closed the menu
}

function updateMenu(dt) {
  const menu = game.menu, p = game.player;
  menu.t += dt;
  menu.stageT += dt;
  const mx = Input.mouse.x, my = Input.mouse.y;
  const n = menu.choices.length;
  menu.hover = -1;
  for (let i = 0; i < n; i++) {
    const x = cardX(i, n);
    if (mx >= x && mx < x + CARD.w && my >= CARD.y && my < CARD.y + CARD.h) menu.hover = i;
  }
  if (Input.padUsed) { // gamepad: d-pad or stick moves between the cards, A takes one
    if (!(menu.padSel >= 0 && menu.padSel < n)) menu.padSel = 0;
    if (Input.hit('pad:left')) menu.padSel = (menu.padSel + n - 1) % n;
    if (Input.hit('pad:right')) menu.padSel = (menu.padSel + 1) % n;
    menu.hover = menu.padSel;
  }
  if (menu.t < 0.5 || menu.stageT < 0.2) return; // ignore input briefly so a held fire button doesn't pick by accident

  // Esc: not now. Everything waiting stays banked; hold F in a cleared room later.

  let choice = -1;
  for (let i = 0; i < n; i++) if (Input.hit(String(i + 1))) choice = i;
  if (Input.mouse.clicked && menu.hover >= 0) choice = menu.hover;
  if (Input.hit('pad:a') && Input.padUsed && menu.hover >= 0) choice = menu.hover;
  if (choice < 0) return;

  applyChoice(p, menu.choices[choice]);
  closeMenu();
}

function drawCard(ctx, info, i, x, y, menu) {
  const { w, h } = CARD;
  const hover = menu.stage === 'cards' && menu.hover === i;
  const rc = RARITY[info.rarity].color;
  const frame = info.malignant ? MALIGNANT_COLOR : rc;
  const loses = !!info.shed; // this card tears out a part you already have
  const cx = x + w / 2;

  // Blood seeps off the bottom edge (always the same drips per card; they run on hover).
  for (let k = 0; k < 4; k++) {
    const dx = x + 6 + Math.floor(hash2(i, k, 3) * (w - 12));
    const len = 1 + Math.floor(hash2(k, i, 7) * 3) + (hover ? Math.floor((menu.t * 4 + k * 0.7) % 4) : 0);
    ctx.fillStyle = loses ? '#8a1820' : '#4a1418'; ctx.fillRect(dx, y + h, 1, len + 1);
    if (k % 2 === 0) ctx.fillRect(dx - 1, y + h, 3, 1);
  }

  // A dark specimen slab in a bony frame.
  ctx.fillStyle = PAL.black; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = frame; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = info.malignant ? (hover ? '#28162e' : '#1a0e1e') : hover ? '#221a1e' : '#141014';
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = '#2a2023'; // an inner seam, like a sutured edge
  ctx.fillRect(x + 3, y + 3, w - 6, 1); ctx.fillRect(x + 3, y + h - 4, w - 6, 1);
  ctx.fillRect(x + 3, y + 3, 1, h - 6); ctx.fillRect(x + w - 4, y + 3, 1, h - 6);
  for (let s = x + 7; s < x + w - 6; s += 6) { ctx.fillRect(s, y + 2, 1, 3); ctx.fillRect(s, y + h - 5, 1, 3); } // stitches
  // Bone knuckles on the corners.
  for (const [kx, ky] of [[x - 2, y - 2], [x + w - 2, y - 2], [x - 2, y + h - 2], [x + w - 2, y + h - 2]]) {
    ctx.fillStyle = '#3a3226'; ctx.fillRect(kx, ky, 4, 4);
    ctx.fillStyle = '#d8ccb0'; ctx.fillRect(kx, ky, 3, 3);
    ctx.fillStyle = '#fff4dc'; ctx.fillRect(kx, ky, 1, 1);
  }
  if (hover) { ctx.fillStyle = frame; ctx.fillRect(x + 1, y + 1, w - 2, 1); ctx.fillRect(x + 1, y + h - 2, w - 2, 1); }
  if (info.rarity === 'rare') { // an end form: a slow glint runs round the frame
    ctx.fillStyle = '#fff0c0';
    for (let k = 0; k < 4; k++) {
      const pos = (menu.t * 90 + k * (w + h) / 2) % ((w + h) * 2);
      let sx, sy;
      if (pos < w) { sx = x + pos; sy = y; }
      else if (pos < w + h) { sx = x + w - 1; sy = y + pos - w; }
      else if (pos < w * 2 + h) { sx = x + w - 1 - (pos - w - h); sy = y + h - 1; }
      else { sx = x; sy = y + h - 1 - (pos - w * 2 - h); }
      ctx.fillRect(Math.round(sx), Math.round(sy), 2, 1);
    }
  }

  // Header: what it costs you (a red band) or its rarity.
  if (loses) {
    const pulse = 0.75 + 0.25 * Math.sin(menu.t * 5);
    ctx.fillStyle = '#3a060a'; ctx.fillRect(x + 4, y + 4, w - 8, 9);
    ctx.globalAlpha = pulse; ctx.fillStyle = '#7a1018'; ctx.fillRect(x + 5, y + 5, w - 10, 7); ctx.globalAlpha = 1;
    ctx.fillStyle = '#8a1820'; for (const dx of [9, 23, w - 30, w - 13]) ctx.fillRect(x + dx, y + 13, 1, 1 + (dx % 3)); // it drips
    drawText(ctx, 'REPLACES ' + (LOC_NAME[info.slot] || ''), cx, y + 6, '#f4d8d0', 1, 'center');
  } else if (info.malignant) {
    drawText(ctx, 'MALIGNANT', cx, y + 6, MALIGNANT_COLOR, 1, 'center');
  } else {
    drawText(ctx, RARITY[info.rarity].label, cx, y + 6, rc, 1, 'center');
  }
  // Set gems in the corners (two-window cards show the set on their tag line only).
  if (info.set && !info.from && !info.shed) { const S = SETS[info.set]; ctx.fillStyle = S.color; ctx.fillRect(x + 5, y + 16, 3, 3); ctx.fillRect(x + w - 8, y + 16, 3, 3); }

  // The art, in a dark specimen window. A branch shows the part and what it
  // grows into; a swap shows the part you lose, crossed out.
  const top = y + 15, winH = 38;
  const bob = Math.round(Math.sin(menu.t * 3 + i) * 1);
  const icon = mutIcon(info.id), oldId = info.from || (info.shed && info.shed.id), old = oldId && mutIcon(oldId);
  const box = (bx, by, bw, bh, edge) => { // a specimen window
    ctx.fillStyle = edge; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#060405'; ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2);
    ctx.fillStyle = info.malignant ? '#1e0e22' : '#120d0f'; ctx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
  };
  if (old && icon) {
    // Two windows: what you have now (left, small) and what you get (right).
    const lx = x + 6, ly = top + 6, ls = 26, rs = 38, rx = x + w - 6 - rs;
    box(lx, ly, ls, ls, loses ? '#8a1820' : '#3a3034');
    if (loses) ctx.globalAlpha = 0.55; // it's going
    ctx.drawImage(old, lx + 5, ly + 5, 16, 16);
    ctx.globalAlpha = 1;
    if (loses) for (let k = 0; k < ls - 6; k++) { // crossed out
      ctx.fillStyle = '#e02030';
      ctx.fillRect(lx + 3 + k, ly + 3 + k, 2, 1); ctx.fillRect(lx + ls - 5 - k, ly + 3 + k, 2, 1);
    }
    // Arrows between: red when it tears the old part out, white when it keeps it.
    ctx.fillStyle = loses ? '#e04048' : PAL.white;
    const ax = Math.round((lx + ls + rx) / 2) - 4, ay = top + winH / 2;
    for (const off of [0, 4]) for (let k = 0; k < 3; k++) ctx.fillRect(ax + off + k, ay - 2 + k, 1, 1), ctx.fillRect(ax + off + k, ay + 2 - k, 1, 1);
    box(rx, top, rs, rs, rc);
    ctx.drawImage(icon, rx + 3, top + 3 + bob, 32, 32);
  } else {
    box(Math.round(cx - 27), top, 54, winH, '#060405');
    if (icon) ctx.drawImage(icon, Math.round(cx - 16), top + 3 + bob, 32, 32);
    else if (!info.id) drawGorgeArt(ctx, cx, top + winH / 2, menu.t);
  }
  // Growth pips (how far along its path) or level dots, under the window.
  let ty = top + winH + 2;
  if (info.tier) for (let l = 0; l < 3; l++) { ctx.fillStyle = l <= info.tier ? rc : '#2a2222'; ctx.fillRect(Math.round(cx - 7 + l * 5), ty, 4, 2); }
  if (info.level) for (let l = 0; l < LEVEL_MAX; l++) { ctx.fillStyle = l < info.level ? VIAL_COLOR : '#2a2222'; ctx.fillRect(Math.round(cx - 7 + l * 5), ty, 4, 2); }
  ty += 5;

  for (const line of fitText(info.name, w - 8, 2)) { drawText(ctx, line, cx, ty, rc, 1, 'center'); ty += 8; }
  const tag = info.slot ? `[${LOC_NAME[info.slot] || info.slot}]` : '';
  const setTag = info.set ? SETS[info.set].name + (info.setAfter >= 2 ? ` ${info.setAfter}/${info.setAfter >= 3 ? 5 : 3}` : '') : '';
  if (tag || setTag) {
    const both = tag + (tag && setTag ? ' ' : '') + setTag;
    if (textWidth(both) <= w - 8) {
      const x0 = cx - textWidth(both) / 2;
      drawText(ctx, tag, x0, ty, PAL.slate, 1, 'left', null);
      if (setTag) drawText(ctx, setTag, x0 + (tag ? textWidth(tag + ' ') + 1 : 0), ty, SETS[info.set].color, 1, 'left', null);
      ty += 8;
    } else {
      if (tag) { drawText(ctx, tag, cx, ty, PAL.slate, 1, 'center', null); ty += 7; }
      drawText(ctx, setTag, cx, ty, SETS[info.set].color, 1, 'center', null); ty += 8;
    }
    // What the set does, in its colour (dimmer): "MARKS & BLEEDS", "CORRODES"...
    if (info.set && (info.setNote || SETS[info.set].verb)) {
      // "COMPLETES BLOOD SCENT" (pulsing) / "ONE MORE: ..." when it matters; otherwise what the set does.
      const done = info.setNote && info.setNote.startsWith('COMPLETES');
      ctx.globalAlpha = info.setNote ? (done ? 0.75 + 0.25 * Math.sin(menu.t * 6) : 0.9) : 0.7;
      for (const line of fitText(info.setNote || SETS[info.set].verb, w - 8, 1)) drawText(ctx, line, cx, ty - 1, done && Math.floor(menu.t * 4) % 2 ? '#ffffff' : SETS[info.set].color, 1, 'center', null);
      ctx.globalAlpha = 1; ty += 7;
    }
  }

  // The bottom: its status and what it costs or keeps, above the key.
  const notes = info.note ? fitText(info.note, w - 8, 2) : [];
  let by = y + h - 13 - notes.length * 7 - (info.status ? 9 : 0);
  // The short description fills what's left between.
  ctx.fillStyle = '#2a2023'; ctx.fillRect(Math.round(cx - 12), ty, 24, 1);
  ty += 4;
  const room = Math.max(0, Math.min(5, Math.floor((by - ty - 2) / 7)));
  const said = info.short ? fitText(info.short, w - 10, room) : [];
  for (const line of said) { drawText(ctx, line, cx, ty, '#cbbcae', 1, 'center', null); ty += 7; }
  if (info.cost && ty + 7 <= by - 2) for (const line of fitText(info.costCard || info.cost.split('. ')[0], w - 10, Math.floor((by - ty - 2) / 7))) { drawText(ctx, line, cx, ty, MALIGNANT_COLOR, 1, 'center', null); ty += 7; }
  if (info.status) { drawText(ctx, info.status, cx, by, PAL.white, 1, 'center'); by += 9; }
  for (const line of notes) { drawText(ctx, line, cx, by, info.noteColor, 1, 'center', null); by += 7; }
  if (!notes.length && info.stirs && Math.floor(menu.t * 3) % 3) drawText(ctx, 'SOMETHING STIRS', cx, y + h - 20, VIAL_COLOR, 1, 'center');
  drawText(ctx, `[${i + 1}]`, cx, y + h - 11, hover ? rc : PAL.slate, 1, 'center');
}

// Gorge's art: a heart, beating.
function drawGorgeArt(ctx, cx, cy, t) {
  const s = 1 + (Math.sin(t * 7) > 0.6 ? 1 : 0);
  ctx.save(); ctx.translate(Math.round(cx), Math.round(cy)); ctx.scale(2 + s * 0.25, 2 + s * 0.25);
  ctx.fillStyle = '#5e1a22';
  ctx.fillRect(-5, -3, 4, 3); ctx.fillRect(1, -3, 4, 3); ctx.fillRect(-6, -2, 12, 4); ctx.fillRect(-4, 2, 8, 2); ctx.fillRect(-2, 4, 4, 2);
  ctx.fillStyle = '#a8343c'; ctx.fillRect(-5, -2, 3, 3); ctx.fillRect(2, -2, 3, 3); ctx.fillRect(-3, 0, 6, 3);
  ctx.fillStyle = '#e88080'; ctx.fillRect(-4, -2, 1, 1);
  ctx.restore();
}

function drawMenu(ctx) {
  const menu = game.menu, p = game.player;
  ctx.fillStyle = 'rgba(4,2,4,0.85)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const mutagen = menu.title === 'MUTAGEN';
  drawText(ctx, menu.title, VIEW_W / 2, 18, menu.color || (mutagen ? VIAL_COLOR : PAL.red), 2, 'center');
  drawText(ctx, menu.sub, VIEW_W / 2, 36, PAL.slate, 1, 'center');
  const free = freeSlots(p);
  drawText(ctx, free > 0 ? `${free} FREE SLOT${free > 1 ? 'S' : ''}` : 'NO FREE SLOTS', VIEW_W - 4, 4, free > 0 ? VIAL_COLOR : PAL.slate, 1, 'right');

  const n = menu.choices.length;
  menu.choices.forEach((c, i) => {
    const appear = clamp((menu.t - i * 0.08) / 0.2, 0, 1);
    if (appear <= 0) return;
    const x = cardX(i, n);
    const y = CARD.y + Math.round((1 - appear) * 24) - (menu.stage === 'cards' && menu.hover === i ? 2 : 0);
    drawCard(ctx, choiceInfo(p, c), i, x, y, menu);
  });

  if (menu.t > 0.5) {
    // Hovering a card: everything it does (the card only says the gist).
    const hov = menu.hover >= 0 && menu.choices[menu.hover] && choiceInfo(p, menu.choices[menu.hover]);
    if (hov && hov.shed) drawShedLink(ctx, hov.shed, cardX(menu.hover, n) + CARD.w / 2, CARD.y + CARD.h + 2, menu.t);
    const help = hov && (hov.kind === 'level' ? LEVEL_HELP : !hov.id ? GORGE_HELP : hov.desc + (hov.cost ? ' ' + hov.cost : '') + (hov.setBonus ? ' SET - ' + hov.setBonus.name + ': ' + hov.setBonus.desc : ''));

    if (help) fitText(help, VIEW_W - 16, 3).forEach((line, i) => drawText(ctx, line, VIEW_W / 2, 203 + i * 7, '#c8b8a8', 1, 'center'));
    else drawText(ctx, mustChoose(p, menu) ? 'PRESS 1-3 OR CLICK A CARD  -  CHOOSE YOUR FIRST WEAPON' : 'PRESS 1-3 OR CLICK A CARD', VIEW_W / 2, 206, PAL.slate, 1, 'center');
  }
}

// What each kind of part is for: a short tag on the card, and a line when you hover it.
const LOC_TAG = { MOUTH: 'ATTACK', LIMBS: 'MOVEMENT', HEAD: 'SENSES', BACK: 'DASH/HIT', CORE: 'PASSIVE' };
const LOC_HELP = {
  MOUTH: 'WEAPON: AN ATTACK. YOU HAVE ROOM FOR TWO, AND BOTH FIRE WHEN YOU SHOOT.',
  LIMBS: 'LIMBS: HOW YOU MOVE, PLUS A RIGHT-CLICK (E) ABILITY. ONE SET AT A TIME.',
  HEAD: 'HEAD: SENSES, PLUS AN ABILITY THAT FIRES BY ITSELF. YOU ONLY HAVE ONE HEAD.',
  BACK: 'BACK: GOES OFF WHEN YOU DASH OR GET HIT. ONE BACK.',
  CORE: 'CORE: ALWAYS ON. MAKES YOUR WHOLE BODY STRONGER OR TOUGHER. ONLY FROM BOSS CORES.',
};
const LEVEL_HELP = 'LEVEL UP: A SMALL BOOST TO THIS PART. AT LEVEL 3 IT EVOLVES INTO SOMETHING NEW.';
const GORGE_HELP = 'GORGE: HEAL A HEART AND GROW NOTHING. YOUR BODY STAYS EXACTLY AS IT IS.';

// Hovering a card that replaces a part: a red thread runs from the card down
// to that part's cell in the slot bar, and the cell pulses.
function drawShedLink(ctx, part, fromX, fromY, t) {
  const cell = (game.barCells || []).find(c => c.part === part);
  if (!cell) return;
  const tx = Math.round(cell.x + cell.w / 2), ty = cell.y - 1, midY = 200;
  const a = 0.6 + 0.4 * Math.sin(t * 6);
  ctx.globalAlpha = a; ctx.fillStyle = '#d02030';
  const x0 = Math.round(fromX);
  ctx.fillRect(x0, fromY, 1, midY - fromY);
  ctx.fillRect(Math.min(x0, tx), midY, Math.abs(tx - x0) + 1, 1);
  ctx.fillRect(tx, midY, 1, ty - midY);
  ctx.fillRect(tx - 1, ty - 2, 3, 1); ctx.fillRect(tx, ty - 1, 1, 1); // arrowhead
  ctx.fillRect(cell.x - 1, cell.y - 1, cell.w + 2, 1); ctx.fillRect(cell.x - 1, cell.y + 26, cell.w + 2, 1);
  ctx.fillRect(cell.x - 1, cell.y - 1, 1, 28); ctx.fillRect(cell.x + cell.w, cell.y - 1, 1, 28);
  ctx.globalAlpha = 1;
}

// --- HUD --------------------------------------------------------------------------
function drawHUD(ctx) {
  const p = game.player;
  bakeHud();
  ctx.drawImage(SPR.hudTop, 0, 0);
  ctx.drawImage(SPR.hudBottom, 0, ROOM_Y + VIEW_ROOM_H);

  // Hearts (+ chitin shell)
  // Health is in half hearts: each heart icon is full, half or empty.
  const hearts = Math.ceil(p.maxHp / HP_PER_HEART);
  for (let i = 0; i < hearts; i++) {
    const left = p.hp - i * HP_PER_HEART; // what's left in this heart
    const sh = game.hurtT > HURT_FX * 0.4 ? (Math.floor(game.time * 40 + i) % 2 ? 1 : -1) : 0; // just hit: the hearts shudder
    ctx.drawImage(left >= HP_PER_HEART ? SPR.heart : left > 0 ? halfHeart() : SPR.heartEmpty, 4 + i * 9 + sh, 3);
    if (sh && left > 0 && left <= HP_PER_HEART) { ctx.globalAlpha = 0.6; ctx.drawImage(tintedSprite(SPR.heart, '#ffffff'), 4 + i * 9 + sh, 3); ctx.globalAlpha = 1; } // (the one that took it flashes)
  }
  if (!SPR.armorHeart) SPR.armorHeart = silhouette(SPR.heart, '#a8a8b8');
  for (let i = 0; i < (p.armor || 0); i++) ctx.drawImage(SPR.armorHeart, 4 + (hearts + i) * 9, 3); // grey armor hearts
  if (p.stats.shieldCd > 0) {
    const sx = 6 + (hearts + (p.armor || 0)) * 9;
    ctx.globalAlpha = p.shieldUp ? 1 : 0.3;
    ctx.drawImage(SPR.icons.chitin, sx - 3, 0, 12, 12);
    ctx.globalAlpha = 1;
  }

  drawDnaTube(ctx, p);

  drawSetBadge(ctx, p);
  drawText(ctx, `FLOOR ${game.depth}`, 5, 21, PAL.silver);
  if (p.stats.starve > 0 && p.hungerT > p.stats.starve * 0.5) {
    // Hunger warning: steady, then blinking when you're about to starve.
    const urgent = p.hungerT > p.stats.starve - 6;
    if (!urgent || Math.floor(game.time * 4) % 2) drawText(ctx, urgent ? 'STARVING' : 'HUNGRY', 48, 21, COST_COLOR);
  } else if (Sfx.muted) drawText(ctx, 'MUTED', 48, 21, PAL.slate);

  // Room status message
  const room = game.room;
  let msg = null, col = PAL.white;
  if (p.evolveT > 0) { msg = 'YOU ARE CHANGING...'; col = VIAL_COLOR; }
  else if (evolveReady(p) && !room.locked && !safeToCocoon(p)) { msg = 'GET OUT OF THE ACID TO EVOLVE'; col = VIAL_COLOR; }
  else if (evolveReady(p) && !room.locked && p.snoozeRoom === room && Math.floor(game.time * 2.5) % 2) { msg = 'HOLD [F] TO EVOLVE'; col = VIAL_COLOR; }
  else if (room.locked) { if (Math.floor(game.time * 3) % 2) { msg = 'CONTAINMENT LOCKDOWN'; col = PAL.red; } }
  else if (room.hatch) { msg = 'HATCH OPEN - DESCEND'; col = PAL.lime; }
  else if (!partAt(p, 'MOUTH') && room.pickups.some(k => k.kind === 'vial')) { msg = 'YOU HAVE NO WEAPON - TAKE THE VIAL'; col = VIAL_COLOR; }
  else if (room.orbs.length) { msg = 'BIOMASS SPILLED'; col = VIAL_COLOR; }
  else if (room.corpses.length) { msg = 'FRESH MEAT - DEVOUR IT'; col = VIAL_COLOR; }
  else if (room.type === 'vault') { msg = 'MUTAGEN VAULT'; col = VIAL_COLOR; }
  else if (room.seals && Object.keys(room.seals).some(d => sealAt(room, d) && sealAt(room, d).kind !== 'flesh')) { msg = 'SEALED SAMPLE - BREAK IT OPEN'; col = '#e8c020'; } // (the meat door says nothing)
  if (msg) drawText(ctx, msg, VIEW_W / 2, 24, col, 1, 'center');

  drawMinimap(ctx);
  drawActiveIcons(ctx, p);
  drawMutationList(ctx);
}

// A glass tube of sloshing pink DNA.
function drawDnaTube(ctx, p) {
  const need = dnaNeeded(p.level);
  const tx = 110, ty = 4, inner = 96;
  ctx.drawImage(SPR.dnaTube, tx, ty);
  const fill = Math.round(inner * Math.min(1, p.dna / need));
  const shades = ['#e8a0b8', '#c96a8f', '#c96a8f', '#8a3a5a', '#8a3a5a', '#6a2a44', '#4a1a30'];
  for (let col = 0; col < fill; col++) {
    const slosh = Math.round(Math.sin(game.time * 3 + col * 0.25) * 0.6);
    for (let row = Math.max(0, slosh); row < 7; row++) {
      ctx.fillStyle = shades[row];
      ctx.fillRect(tx + 2 + col, ty + 1 + row, 1, 1);
    }
  }
  // Bubbles rising through the fluid.
  for (let k = 0; k < 3 && fill > 4; k++) {
    const bxp = (k * 37 + Math.floor(game.time * 9)) % fill;
    const byp = 6 - Math.floor((game.time * 6 + k * 2) % 6);
    ctx.fillStyle = '#f4c8d8';
    ctx.fillRect(tx + 2 + bxp, ty + 1 + byp, 1, 1);
  }
  ctx.fillStyle = 'rgba(200,230,220,0.25)';
  ctx.fillRect(tx + 2, ty + 1, inner, 1); // glass glint
  // Full: the tube glows and throbs, waiting for you to cocoon.
  const full = fill >= inner;
  if (full) {
    ctx.globalAlpha = 0.35 + 0.3 * Math.sin(game.time * 6);
    ctx.fillStyle = '#f4c8d8';
    ctx.fillRect(tx + 2, ty + 1, inner, 7);
    ctx.globalAlpha = 1;
  }
  drawText(ctx, full ? (game.room.locked ? 'BIOMASS FULL - CLEAR ROOM' : 'BIOMASS READY') : `BIOMASS ${p.dna}/${need}`, VIEW_W / 2, 16, full ? VIAL_COLOR : '#8a6a74', 1, 'center');
}

function drawMinimap(ctx) {
  const ox = VIEW_W - 66, oy = 3;
  for (const r of game.floor.rooms) {
    if (!r.visited && !r.seen) continue;
    const x = ox + (r.gx + 4) * 7, y = oy + (r.gy + 2) * 5;
    const current = r === game.room;
    ctx.fillStyle = current ? (Math.floor(game.time * 4) % 2 ? '#e8d8c8' : PAL.red) : r.visited ? '#3e3434' : '#1e1818';
    ctx.fillRect(x, y, 6, 4);
    let mark = null;
    if (r.type === 'exit') mark = PAL.red;
    if (r.type === 'vault') mark = VIAL_COLOR;
    if (r.type === 'heart') mark = '#e02838'; // the cancer ward
    if ((r.corpses.length || r.orbs.length) && r.visited) mark = '#e8a0b8';
    if (mark && !current) { ctx.fillStyle = mark; ctx.fillRect(x + 2, y + 1, 2, 2); }
  }
}

function mutColor(p, id) {
  const d = getMutDef(id);
  if (id === 'secondheart' && p.secondHeartUsed) return PAL.dark;
  return d.malignant ? MALIGNANT_COLOR : RARITY[d.rarity].color;
}

// Your body: one panel per slot along the bottom. Spliced parts are joined
// by a glowing seam; free slots wait, empty. The bar always shows all six slots, in two groups: WEAPON x2 | LIMBS HEAD BACK CORE.
// Locked ones say which comes next: each devoured boss core opens one.
const BAR_LAYOUT = ['MOUTH', 'MOUTH', 'LIMBS', 'HEAD', 'BACK', 'CORE'];
// Fit a name into a box `maxW` pixels wide, on at most `maxLines` lines.
// Words wrap by their real pixel width; a word too long for a whole line is
// shortened with a dot (HAUNCH.), and so is the last line if more is left over.
function fitText(s, maxW, maxLines) {
  if (maxLines <= 0) return [];
  const fits = t => textWidth(t) <= maxW;
  const clip = t => { while (t.length > 1 && !fits(t + '.')) t = t.slice(0, -1); return t + '.'; };
  const lines = [];
  let line = '';
  for (let w of String(s).toUpperCase().split(' ')) {
    if (!fits(w)) w = clip(w);
    const joined = line ? line + ' ' + w : w;
    if (fits(joined)) { line = joined; continue; }
    if (line) lines.push(line);
    line = w;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const out = lines.slice(0, maxLines);
  out[maxLines - 1] = out[maxLines - 1].endsWith('.') ? out[maxLines - 1] : clip(out[maxLines - 1]);
  return out;
}

const BAR_NARROW = 34; // pitch of an empty or locked cell; filled cells share what's left
function drawMutationList(ctx) {
  const p = game.player;
  const top = ROOM_Y + VIEW_ROOM_H + 3;
  // Which part sits in which cell, and which cells are open.
  const seen = {}, cellPart = [], cellOpen = [];
  BAR_LAYOUT.forEach((loc, i) => {
    const k = seen[loc] = (seen[loc] || 0) + 1;
    cellPart[i] = partsAt(p, loc).filter(m => !m.starter)[k - 1] || null;
    cellOpen[i] = k <= slotsAt(p, loc);
  });
  // Filled cells get the room the empty ones don't need, so names have space to read.
  const groupGap = 6, total = 316 - groupGap, filled = cellPart.filter(Boolean).length;
  const wide = filled ? Math.min(96, Math.floor((total - BAR_NARROW * (BAR_LAYOUT.length - filled)) / filled)) : BAR_NARROW;
  const pitches = cellPart.map(m => m ? wide : BAR_NARROW);
  const used = pitches.reduce((a, b) => a + b, 0);
  const lead = 3 + Math.floor((total - used) / 2); // centre the bar if it doesn't fill the width
  const cellX = i => lead + pitches.slice(0, i).reduce((a, b) => a + b, 0) + (i >= 2 ? groupGap : 0);
  const spliced = new Set();
  for (const k of p.splices) for (const ids of SPLICES[k].parts) for (const m of p.parts) if (ids.some(id => m.path.includes(id))) spliced.add(m);
  const act = activeSet(p);
  const panel = (x, w) => {
    ctx.fillStyle = '#070506'; ctx.fillRect(x, top, w, 26);
    ctx.fillStyle = '#0e0b0c'; ctx.fillRect(x + 1, top + 1, w - 2, 24);
    ctx.fillStyle = '#2e2627'; ctx.fillRect(x, top + 26, w, 1); ctx.fillRect(x + w, top, 1, 27);
  };
  const next = nextSlot(p);
  let nextShown = false;
  game.barCells = []; // where each part sits, for the card menu's red thread
  BAR_LAYOUT.forEach((loc, i) => {
    const m = cellPart[i], x = cellX(i), w = pitches[i] - 2;
    game.barCells.push({ part: m, x, y: top, w });
    panel(x, w);
    if (!m) {
      drawText(ctx, LOC_NAME[loc], x + w / 2, top + 3, '#3a3232', 1, 'center', null);
      if (cellOpen[i]) drawText(ctx, 'FREE', x + w / 2, top + 13, '#4a3e3e', 1, 'center', null);
      else {
        const soon = loc === next && !nextShown; if (soon) nextShown = true;
        drawText(ctx, 'LOCKED', x + w / 2, top + 13, soon ? '#4a3a3e' : '#2a2424', 1, 'center', null); // (the next to open, a shade brighter)
      }
      return;
    }
    const d = getMutDef(m.id), col = mutColor(p, m.id);
    ctx.fillStyle = col; ctx.fillRect(x, top, 2, 26); // rarity stripe
    if (spliced.has(m)) { ctx.fillStyle = VIAL_COLOR; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(game.time * 4); ctx.fillRect(x + 2, top, w - 2, 1); ctx.fillRect(x + 2, top + 25, w - 2, 1); ctx.globalAlpha = 1; }
    drawText(ctx, LOC_NAME[m.loc], x + 4, top + 2, '#5a4e4c', 1, 'left', null);
    const set = !m.starter && setOf(m.id);
    if (set) { // set gem (glows when it's part of an active bonus)
      const lit = act && act.set === set;
      ctx.fillStyle = PAL.black; ctx.fillRect(x + w - 7, top + 2, 6, 6);
      ctx.fillStyle = SETS[set].color; ctx.globalAlpha = lit ? 1 : 0.45; ctx.fillRect(x + w - 6, top + 3, 4, 4); ctx.globalAlpha = 1;
      if (lit && Math.floor(game.time * 2) % 2) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + w - 6, top + 3, 1, 1); }
    }
    const icon = mutIcon(m.id);
    if (icon) ctx.drawImage(icon, x + 4, top + 9);
    fitText(d.name, w - 22, 2).forEach((line, k) => drawText(ctx, line, x + 21, top + 9 + k * 7, col, 1, 'left'));
    // How far the path has grown (root, branch, branch). The next pip glows
    // if it can grow again this floor.
    for (let l = 0; l < 3; l++) {
      ctx.fillStyle = l < m.path.length ? col : '#2a2222';
      ctx.fillRect(x + 23 + l * 4, top + 23, 3, 2);
    }
    // Its level: pink dots that fill toward its next evolution.
    if (!m.starter) for (let l = 0; l < LEVEL_MAX; l++) { ctx.fillStyle = l < (m.lvl || 0) ? VIAL_COLOR : '#2a1c22'; ctx.fillRect(x + 38 + l * 3, top + 23, 2, 2); }
    if ((m.lvl || 0) > LEVEL_MAX) drawText(ctx, '+' + (m.lvl - LEVEL_MAX), x + w - 2, top + 21, '#ffd070', 1, 'right', null); // overgrowth
  });
}

// --- Set bonus feedback --------------------------------------------------------------------
// The badge under your hearts: the set you're closest to (or have), with pips
// toward 3 and 5. It lights up once the bonus is on, and flashes every time the
// bonus does something (setProc), so you can tell that burst was your set.
function drawSetBadge(ctx, p) {
  const n = setCounts(p), act = activeSet(p);
  const k = act ? act.set : Object.keys(n).sort((a, b) => n[b] - n[a])[0];
  if (!k || !n[k]) return;
  const S = SETS[k], c = n[k], flash = Math.max(0, (p.setPulseT || 0) / SET_PULSE);
  const label = act ? S.bonus[act.tier].name.toUpperCase() : S.name;
  ctx.globalAlpha = act ? 1 : 0.55;
  drawText(ctx, label, 5, 13, flash > 0 && Math.floor(game.time * 20) % 2 ? '#ffffff' : S.color, 1, 'left');
  const x0 = 7 + textWidth(label);
  for (let i = 0; i < 5; i++) { // pips: three to the bonus, five to the full set
    ctx.fillStyle = i < c ? S.color : '#2a2222';
    ctx.fillRect(x0 + i * 4 + (i >= 3 ? 2 : 0), 15, 3, 3);
  }
  ctx.globalAlpha = 1;
  if (flash > 0) { ctx.globalAlpha = flash * 0.6; ctx.fillStyle = S.color; ctx.fillRect(3, 12, x0 + 24 - 3, 1); ctx.fillRect(3, 19, x0 + 24 - 3, 1); ctx.globalAlpha = 1; }
}

// The right-click (E) ability and the head's automatic one, with their cooldowns.
function drawActiveIcons(ctx, p) {
  const s = p.stats, limb = partAt(p, 'LIMBS'), head = partAt(p, 'HEAD');
  const items = [];
  if (limb && (s.limbActive || s.grapple || s.hands)) {
    const own = !!s.limbActive && !s.grapple && !s.hands;
    items.push({ key: 'E', id: limb.path[0], k: p.limbWear > 0 ? 1 : own ? p.limbCd / (p.limbCdMax || 1) : p.grappleCd / (s.grapple || 1) });
  }
  if (head && s.headActive) items.push({ key: '', id: head.path[0], k: p.headCd / (p.headCdMax || 1) }); // automatic: no key
  items.forEach((it, i) => {
    const x = 218 + i * 17, y = 17, k = clamp(it.k, 0, 1);
    ctx.fillStyle = '#070506'; ctx.fillRect(x - 1, y - 1, 14, 14);
    const icon = mutIcon(it.id);
    if (icon) ctx.drawImage(icon, x, y, 12, 12);
    if (k > 0) { const h = Math.ceil(12 * k); ctx.fillStyle = 'rgba(6,4,5,0.78)'; ctx.fillRect(x, y, 12, h); }
    drawText(ctx, it.key, x + 10, y - 2, k > 0 ? PAL.slate : PAL.white, 1, 'left');
  });
}

// --- Whispers: what your body feels as something grows -----------------------------
// When a part grows (`name` given), it pops up mid-screen: the part's name, then
// the feeling of it arriving, typed out letter by letter. The newest letters
// are still raw: red, and twitching.
const WHISPER_TIME = 5.5, WHISPER_CPS = 38;

function whisper(text, name = null, color = null) {
  if (!text) return;
  const lines = fitText(text, 220, 4);
  game.whisper = { text: text.toUpperCase(), lines, name: name && name.toUpperCase(), color: color || PAL.white, t: WHISPER_TIME };
}

function updateWhisper(dt) {
  const w = game.whisper;
  if (!w) return;
  if ((w.t -= dt) <= 0) { game.whisper = null; return; }
  // Each letter makes a sound as it's written (the same clock drawWhisper types with).
  const all = w.lines.join(''), typed = Math.min(all.length, Math.floor(Math.max(0, WHISPER_TIME - w.t - 0.3) * WHISPER_CPS));
  if (typed > (w.typed || 0)) { if (all[typed - 1] !== ' ') Sfx.play('scrawl'); w.typed = typed; }
}

function drawWhisper(ctx) {
  const w = game.whisper;
  if (!w) return;
  const age = WHISPER_TIME - w.t;
  let fade = Math.min(1, w.t / 0.8, age / 0.15);
  if (hash2(Math.floor(game.time * 12), 7, 3) < 0.04) fade *= 0.35; // it flickers, now and then
  const y = ROOM_Y + 12, head = 0;
  // The first instant: a faint pulse of red over everything, like a heartbeat.
  if (w.name && age < 0.25) { ctx.globalAlpha = 0.14 * (1 - age / 0.25); ctx.fillStyle = '#c01020'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  // A plain black box behind it (old-school, and easy to read), sized to the text.
  const bw = Math.max(...w.lines.map(l => textWidth(l))) + 10, bh = w.lines.length * 9 + 9;
  ctx.globalAlpha = fade; ctx.fillStyle = '#000000';
  ctx.fillRect(Math.round(VIEW_W / 2 - bw / 2), y - 4, Math.round(bw), bh);
  // Crooked letters: each sits a little off its line, drifts slowly, and some drip.
  const scrawl = (line, cx, ly, color, seed, shown = line.length, raw = 0) => {
    let x = Math.round(cx - textWidth(line) / 2);
    for (let k = 0; k < shown; k++) {
      const ch = line[k], h = hash2(k, seed, 13);
      const settled = k < shown - raw;
      const jy = Math.round((h - 0.5) * 2 + Math.sin(game.time * 1.3 + k * 0.7 + seed) * 0.6) + (settled ? 0 : Math.round((Math.random() - 0.5) * 3));
      const jx = settled ? 0 : Math.round((Math.random() - 0.5) * 2);
      drawText(ctx, ch, x + jx, ly + jy, settled ? color : '#ff3a40', 1, 'left', '#0a0204');
      if (settled && ch !== ' ' && h > 0.9) { // a drip runs off this letter
        const len = Math.min(5, Math.floor((age - k / WHISPER_CPS) * 3 * h)) ;
        ctx.fillStyle = color; if (len > 0) ctx.fillRect(x + 1, ly + jy + 5, 1, len);
      }
      x += textWidth(ch + 'X') - textWidth('X');
    }
  };
  // Type it out across the lines (laid out in full first, so nothing reflows).
  let left = Math.floor(Math.max(0, age - 0.3) * WHISPER_CPS);
  w.lines.forEach((line, i) => {
    const shown = Math.min(line.length, Math.max(0, left)); left -= line.length;
    if (shown) scrawl(line, VIEW_W / 2, y + head + i * 9, '#b8202c', i * 17 + 3, shown, left >= 0 ? 0 : 3);
  });
  ctx.globalAlpha = 1;
}

// --- Banners & overlays -----------------------------------------------------------
function drawBanner(ctx) {
  const b = game.banner;
  if (!b) return;
  const y = ROOM_Y + 60;
  ctx.fillStyle = 'rgba(4,2,4,0.7)';
  ctx.fillRect(0, y - 6, VIEW_W, b.sub ? 34 : 22);
  drawText(ctx, b.text, VIEW_W / 2, y, b.color, 2, 'center');
  if (b.sub) drawText(ctx, b.sub, VIEW_W / 2, y + 16, PAL.white, 1, 'center');
}

function drawCrosshair(ctx) {
  const x = Math.round(Input.mouse.x), y = Math.round(Input.mouse.y);
  ctx.fillStyle = PAL.black;
  ctx.fillRect(x - 4, y - 1, 9, 3); ctx.fillRect(x - 1, y - 4, 3, 9);
  ctx.fillStyle = PAL.white;
  ctx.fillRect(x - 3, y, 2, 1); ctx.fillRect(x + 2, y, 2, 1);
  ctx.fillRect(x, y - 3, 1, 2); ctx.fillRect(x, y + 2, 1, 2);
}

// --- Title screen ------------------------------------------------------------------------
// Specimen 47 in its containment tank. It mutates as you watch; the glass cracks,
// the alarm comes on, and it starts over. The logo glitches now and then, a heart
// monitor traces its pulse, and the controls panel shows whatever you last touched
// (keyboard or gamepad).
// The build shown in the corner of the title screen. Bump both when you put out a new version.
const GAME_VERSION = '0.1.19', GAME_UPDATED = '2026-11-20';
const TITLE_CYCLE = 1.5; // seconds per mutation in the tank
// What it might become: each cycle a different strain (a set's body form) grows five parts.
const TITLE_BUILDS = [
  { name: 'PURE', form: null, color: '#c8b8b0', parts: ['eyes', 'mandibles', 'spines', 'tentacles', 'horns'] },
  { name: 'BONE', form: 'BONE', color: '#d8ccb0', parts: ['ribs', 'spiderlegs', 'calcified', 'gorehorns', 'scythes'] },
  { name: 'FUNGAL', form: 'FUNGAL', color: '#9ab83a', parts: ['sporepods', 'pustules', 'tentlimbs', 'drool', 'compound'] },
  { name: 'HIVE', form: 'HIVE', color: '#d8b040', parts: ['chitin', 'wings', 'eggs', 'antennae', 'mandibles'] },
  { name: 'PREDATOR', form: 'PREDATOR', color: '#d04040', parts: ['hindlegs', 'fangs', 'claws', 'thirdeye', 'barbs'] },
  { name: 'ABOMINATION', form: 'ABOMINATION', color: '#b060c0', parts: ['tumor', 'bigheart', 'tentacles', 'mitosis', 'hands'] },
];
const TANK = { x0: VIEW_W / 2 - 36, x1: VIEW_W / 2 + 36, y0: 72, y1: 146 };

function bakeTitleScene() {
  const c = makeCanvas(VIEW_W, VIEW_H), g = c.getContext('2d');
  g.drawImage(bakeTitleBg(), 0, 0);
  g.fillStyle = 'rgba(6,3,5,0.55)'; g.fillRect(0, 0, VIEW_W, VIEW_H); // a dark room...
  const v = g.createRadialGradient(VIEW_W / 2, 104, 30, VIEW_W / 2, 120, 230); // ...lit only by the tank
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.85)');
  g.fillStyle = v; g.fillRect(0, 0, VIEW_W, VIEW_H);
  for (let y = 0; y < VIEW_H; y += 2) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, y, VIEW_W, 1); } // faint scanlines
  return c;
}

// The logo, baked once: ABERRANT in blood red over a dark drop, STRAIN stamped beneath between rules.
function bakeTitleLogo() {
  const c = makeCanvas(VIEW_W, 56), g = c.getContext('2d');
  drawText(g, 'ABERRANT', VIEW_W / 2 + 1, 6, '#2a0408', 4, 'center', null); // deep shadow
  drawText(g, 'ABERRANT', VIEW_W / 2, 4, '#a01424', 4, 'center', '#3a060c');
  const tw = textWidth('ABERRANT', 4), left = Math.round(VIEW_W / 2 - tw / 2);
  g.fillStyle = '#d83040'; for (let x = left; x < left + tw; x++) if (g.getImageData(x, 5, 1, 1).data[3]) g.fillRect(x, 5, 1, 1); // a wet top edge
  // S T R A I N, letter-spaced, with rules either side.
  const word = 'STRAIN', sp = 7, w = word.length * 4 * 2 + (word.length - 1) * sp;
  let x = Math.round(VIEW_W / 2 - w / 2);
  for (const ch of word) { drawText(g, ch, x, 36, '#d8ccb4', 2, 'left', '#160507'); x += 8 + sp; }
  g.fillStyle = '#5a1a22';
  g.fillRect(VIEW_W / 2 - w / 2 - 34, 41, 26, 1); g.fillRect(VIEW_W / 2 + w / 2 + 8, 41, 26, 1);
  g.fillStyle = '#a01424'; g.fillRect(VIEW_W / 2 - w / 2 - 10, 40, 3, 3); g.fillRect(VIEW_W / 2 + w / 2 + 7, 40, 3, 3);
  return { img: c, left, tw };
}

// One beat of a heart monitor, 0..1 through the beat -> height in px.
function ecgShape(ph) {
  if (ph < 0.06) return Math.sin(ph / 0.06 * Math.PI) * 1.5;           // P
  if (ph > 0.12 && ph < 0.15) return -(ph - 0.12) / 0.03 * 2;          // Q
  if (ph >= 0.15 && ph < 0.19) return -2 + (ph - 0.15) / 0.04 * 12;    // R (up)
  if (ph >= 0.19 && ph < 0.23) return 10 - (ph - 0.19) / 0.04 * 13;    // S (down)
  if (ph >= 0.23 && ph < 0.26) return -3 + (ph - 0.23) / 0.03 * 3;
  if (ph > 0.34 && ph < 0.48) return Math.sin((ph - 0.34) / 0.14 * Math.PI) * 2.5; // T
  return 0;
}

function drawTitle(ctx) {
  const t = game.time;
  if (!SPR.titleScene) SPR.titleScene = bakeTitleScene();
  if (!SPR.titleLogo) SPR.titleLogo = bakeTitleLogo();
  ctx.fillStyle = PAL.black; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.drawImage(SPR.titleScene, 0, 0);

  // The specimen's cycle: pure -> five mutations -> the glass gives -> start over.
  // A different strain each cycle: the body form of one set, growing five of its parts.
  const build = TITLE_BUILDS[Math.floor(t / (TITLE_CYCLE * 6)) % TITLE_BUILDS.length], showcase = [''].concat(build.parts);
  const n = Math.floor(t / TITLE_CYCLE) % showcase.length, within = (t % TITLE_CYCLE) / TITLE_CYCLE;
  const alarm = n >= 5, bpm = 60 + n * 22, beat = (t * bpm / 60) % 1, pulse = Math.max(0, 1 - beat * 4);
  const T = TANK, cx = VIEW_W / 2, tw = T.x1 - T.x0, th = T.y1 - T.y0;

  // Its glow on the floor and walls, pulsing with its heart (red once the alarm is on).
  const glow = ctx.createRadialGradient(cx, 110, 4, cx, 110, 90);
  glow.addColorStop(0, alarm ? `rgba(200,40,40,${0.22 + pulse * 0.12})` : `rgba(90,190,120,${0.16 + pulse * 0.08})`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 20, VIEW_W, 200);

  // Hoses from the cap up into the dark.
  ctx.fillStyle = '#1c1a1e';
  for (const [x, dir] of [[T.x0 + 8, -1], [T.x1 - 8, 1]]) for (let y = T.y0 - 8; y > 52; y--) ctx.fillRect(Math.round(x + dir * (T.y0 - 8 - y) * 1.6), y, 3, 1);
  // The fluid, with the specimen floating in it.
  const lvl = T.y0 + 6;
  ctx.fillStyle = alarm ? '#1a0c0e' : '#0c1a14'; ctx.fillRect(T.x0, T.y0, tw, th);
  ctx.fillStyle = alarm ? 'rgba(120,30,30,0.35)' : 'rgba(50,120,80,0.35)'; ctx.fillRect(T.x0, lvl, tw, T.y1 - lvl);
  for (let x = T.x0; x < T.x1; x++) { ctx.fillStyle = alarm ? '#7a3030' : '#4a9a70'; ctx.fillRect(x, Math.round(lvl + Math.sin(x * 0.35 + t * 3) * 0.8), 1, 1); } // the surface
  const st = SPR.stages[Math.min(4, n)], body = build.form ? SPR.forms[build.form][Math.min(4, n)] : st, sz = 64;
  const bx = cx - sz / 2 + Math.round(Math.sin(t * 0.9) * 2), by = 76 + Math.round(Math.sin(t * 1.7) * 3);
  ctx.save(); ctx.beginPath(); ctx.rect(T.x0, T.y0, tw, th); ctx.clip();
  const shown = new Set(showcase.slice(1, n + 1));
  for (const ov of BEHIND_ORDER) if (shown.has(ov) && st.overlay[ov]) ctx.drawImage(st.overlay[ov], bx, by, sz, sz); // legs and wings behind
  ctx.drawImage(Math.floor(t * 1.6) % 2 ? body.body2 : body.body, bx, by, sz, sz);
  for (const ov of OVERLAY_ORDER) if (shown.has(ov) && st.overlay[ov]) ctx.drawImage(st.overlay[ov], bx, by, sz, sz);
  if (within < 0.12 && n > 0) { ctx.globalAlpha = 1 - within / 0.12; ctx.drawImage(tintedSprite(body.body, '#f0e0d0'), bx, by, sz, sz); ctx.globalAlpha = 1; } // a new part bursts out
  ctx.fillStyle = alarm ? 'rgba(90,20,20,0.22)' : 'rgba(30,90,60,0.14)'; ctx.fillRect(T.x0, lvl, tw, T.y1 - lvl); // the fluid in front of it
  for (let i = 0; i < 14; i++) { // bubbles
    const sp = 14 + hash2(i, 1, 7) * 22, bx2 = T.x0 + 4 + hash2(i, 2, 7) * (tw - 8) + Math.sin(t * 2 + i) * 1.5;
    const by2 = T.y1 - 4 - ((t * sp + hash2(i, 3, 7) * th) % (T.y1 - lvl - 6));
    ctx.fillStyle = hash2(i, 4, 7) > 0.5 ? 'rgba(200,240,220,0.55)' : 'rgba(160,220,190,0.35)';
    ctx.fillRect(Math.round(bx2), Math.round(by2), hash2(i, 5, 7) > 0.7 ? 2 : 1, hash2(i, 5, 7) > 0.7 ? 2 : 1);
  }
  ctx.restore();
  // The glass: highlights, and cracks spreading as it outgrows the tank.
  ctx.fillStyle = 'rgba(220,240,235,0.22)'; ctx.fillRect(T.x0 + 4, T.y0 + 2, 2, th - 4); ctx.fillRect(T.x0 + 8, T.y0 + 2, 1, th - 4);
  ctx.fillStyle = 'rgba(220,240,235,0.08)'; ctx.fillRect(T.x1 - 6, T.y0 + 2, 3, th - 4);
  const cracks = [[0.75, 0.3], [0.2, 0.55], [0.6, 0.75], [0.35, 0.2]];
  for (let k = 0; k < Math.max(0, n - 2) + (n === 5 ? 1 : 0); k++) {
    let x = T.x0 + cracks[k][0] * tw, y = T.y0 + cracks[k][1] * th;
    ctx.fillStyle = 'rgba(235,245,240,0.7)';
    for (let s = 0; s < 3; s++) {
      let a = hash2(k, s, 11) * Math.PI * 2, px = x, py = y;
      for (let j = 0; j < 9; j++) { ctx.fillRect(Math.round(px), Math.round(py), 1, 1); a += (hash2(k * 9 + j, s, 13) - 0.5) * 1.2; px += Math.cos(a) * 1.3; py += Math.sin(a) * 1.3; }
    }
  }
  // Metal cap and base, with rivets and a warning light.
  const metal = (y, h) => { ctx.fillStyle = '#2e2c32'; ctx.fillRect(T.x0 - 5, y, tw + 10, h); ctx.fillStyle = '#4a4850'; ctx.fillRect(T.x0 - 5, y, tw + 10, 1); ctx.fillStyle = '#16141a'; ctx.fillRect(T.x0 - 5, y + h - 1, tw + 10, 1); ctx.fillStyle = '#6a6870'; for (let x = T.x0 - 2; x < T.x1 + 4; x += 8) ctx.fillRect(x, y + Math.floor(h / 2), 1, 1); };
  metal(T.y0 - 7, 7); metal(T.y1, 9);
  ctx.fillStyle = alarm && Math.floor(t * 4) % 2 ? '#ff3030' : alarm ? '#601010' : '#3a8a50'; ctx.fillRect(cx - 1, T.y0 - 5, 3, 2);
  drawText(ctx, 'SUBJ. 47', cx, T.y1 + 2, alarm ? '#c04040' : '#8a9a90', 1, 'center', null);

  // The logo: glitches for a moment every few seconds.
  const L = SPR.titleLogo, gl = (t % 4.2) < 0.18 || (alarm && (t % 1.3) < 0.06);
  for (let i = 0; i < L.tw; i++) { // blood running off the letters
    if ((i * 7919) % 11 > 1) continue;
    const len = Math.floor((t * 4 + i * 3.7) % 22);
    ctx.fillStyle = '#4a0810'; ctx.fillRect(L.left + i, 26, 1, len);
    if (len > 3) { ctx.fillStyle = '#a01424'; ctx.fillRect(L.left + i, 26 + len, 1, 2); }
  }
  if (!gl) ctx.drawImage(L.img, 0, 10);
  else {
    ctx.globalAlpha = 0.5; ctx.drawImage(tintedSprite(L.img, '#30c0c8'), -2, 10); ctx.globalAlpha = 1; // the color splits
    for (let y = 0; y < L.img.height; y += 4) { // sliced and shoved sideways
      const dx = Math.round((hash2(y, Math.floor(t * 30), 3) - 0.5) * 8);
      ctx.drawImage(L.img, 0, y, VIEW_W, 4, dx, 10 + y, VIEW_W, 4);
    }
  }

  // Lab readouts in the corners.
  drawText(ctx, 'CONTAINMENT 4-B', 6, 5, '#5a6460', 1, 'left', null);
  drawText(ctx, 'STRAIN: ' + build.name, 6, 14, build.color, 1, 'left', null);
  drawText(ctx, alarm ? 'BREACH' : 'STABLE', VIEW_W - 6, 5, alarm ? (Math.floor(t * 3) % 2 ? '#ff4040' : '#801818') : '#4a8a60', 1, 'right', null);
  drawText(ctx, 'BPM ' + bpm, VIEW_W - 6, 14, '#5a6460', 1, 'right', null);

  // The heart monitor: a trace that sweeps across and fades behind itself.
  const mx0 = 40, mx1 = VIEW_W - 40, my = 168, head = (t * 90) % (mx1 - mx0);
  ctx.fillStyle = '#141c18'; ctx.fillRect(mx0, my, mx1 - mx0, 1);
  let prev = null;
  for (let x = 0; x < mx1 - mx0; x++) { // a connected line, so the spikes read as spikes
    const age = (head - x + (mx1 - mx0)) % (mx1 - mx0); if (age > 120) { prev = null; continue; }
    const ph = ((t - age / 90) * bpm / 60) % 1, y = Math.round(my - ecgShape(ph < 0 ? ph + 1 : ph));
    const a = prev === null ? y : prev, top = Math.min(a, y), bot = Math.max(a, y);
    ctx.globalAlpha = 1 - age / 120;
    ctx.fillStyle = alarm ? "#ff4a4a" : "#5aff8a";
    ctx.fillRect(mx0 + x, top, age < 2 ? 2 : 1, bot - top + 1);
    prev = y;
  }
  ctx.globalAlpha = 1;

  // The prompt, breathing in and out.
  const pad = Input.padUsed;
  ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 3);
  drawText(ctx, pad ? 'PRESS A TO BREAK OUT' : 'CLICK OR PRESS SPACE TO BREAK OUT', cx, 176, PAL.white, 1, 'center');
  ctx.globalAlpha = 1;

  // Controls, in a framed panel: whichever you're holding.
  const lines = pad ? [
    ['LEFT STICK', 'MOVE'], ['RIGHT STICK / RT', 'AIM + FIRE'], ['A / LB', 'DASH'], ['RB / X', 'LIMB ABILITY'], ['START / BACK', 'PAUSE / JOURNAL'],
  ] : [
    ['WASD', 'MOVE'], ['MOUSE / ARROWS', 'AIM + SHOOT'], ['SPACE / SHIFT', 'DASH'], ['RIGHT CLICK / E', 'LIMB ABILITY'], ['M / P / J', 'MUTE / PAUSE / JOURNAL'],
  ];
  const py0 = 188, ph = lines.length * 9 + 7;
  ctx.fillStyle = 'rgba(10,6,8,0.78)'; ctx.fillRect(56, py0, VIEW_W - 112, ph);
  ctx.fillStyle = '#3a1a20'; ctx.fillRect(56, py0, VIEW_W - 112, 1); ctx.fillRect(56, py0 + ph - 1, VIEW_W - 112, 1);
  ctx.fillStyle = '#a01424'; for (const [x, y] of [[56, py0], [VIEW_W - 58, py0], [56, py0 + ph - 2], [VIEW_W - 58, py0 + ph - 2]]) ctx.fillRect(x, y, 2, 2);
  lines.forEach(([k, v], i) => {
    drawText(ctx, k, cx - 5, py0 + 5 + i * 9, '#c04050', 1, 'right', null);
    drawText(ctx, v, cx + 5, py0 + 5 + i * 9, '#c8bca8', 1, 'left', null);
  });
  drawText(ctx, 'CONSUME. EVOLVE. ESCAPE.', cx, VIEW_H - 9, '#4a4044', 1, 'center', null);
  drawText(ctx, 'V' + GAME_VERSION + ' - ' + GAME_UPDATED, VIEW_W - 4, VIEW_H - 9, '#3e3638', 1, 'right', null);

  // The lab's lights: an alarm wash once it's breaking out, and a fluorescent flicker now and then.
  if (alarm) { ctx.fillStyle = `rgba(200,20,30,${0.05 + 0.05 * Math.sin(t * 8)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  if ((t % 7.3) < 0.12 && Math.floor(t * 40) % 2) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
}

function drawGameOver(ctx) {
  ctx.fillStyle = 'rgba(4,2,4,0.82)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawText(ctx, 'SPECIMEN', VIEW_W / 2, 50, PAL.red, 3, 'center');
  drawText(ctx, 'TERMINATED', VIEW_W / 2, 70, PAL.red, 3, 'center');
  drawText(ctx, `REACHED FLOOR ${game.depth}  -  ${game.kills} KILLS  -  LEVEL ${game.player.level}`, VIEW_W / 2, 100, PAL.white, 1, 'center');

  const p = game.player;
  drawText(ctx, 'FINAL FORM', VIEW_W / 2, 120, PAL.slate, 1, 'center');
  const shown = p.parts.slice(0, 6), row = shown.length > 5 ? 8 : 9;
  shown.forEach((m, i) => {
    drawText(ctx, m.loc, VIEW_W / 2 - 8, 130 + i * row, PAL.slate, 1, 'right');
    const d = getMutDef(m.id);
    const label = d.name.toUpperCase() + (m.path.length >= 3 || m.starter ? '' : ` (${m.path.length}/3)`);
    drawText(ctx, label, VIEW_W / 2 + 8, 130 + i * row, mutColor(p, m.id));
  });
  if (p.parts.length > 6) drawText(ctx, `+${p.parts.length - 6} MORE`, VIEW_W / 2 + 8, 130 + 6 * row, PAL.slate);
  if (p.splices.length) drawText(ctx, 'SPLICED: ' + p.splices.map(k => SPLICES[k].name.toUpperCase()).join(', '), VIEW_W / 2, 182, VIAL_COLOR, 1, 'center');

  if (game.overT > 1 && Math.floor(game.time * 2) % 2) drawText(ctx, 'CLICK TO TRY AGAIN', VIEW_W / 2, 200, PAL.white, 1, 'center');
}

// --- The splice journal: what you've fused, kept between runs ------------------------
// Press J on the title screen or while paused. Discovered splices show both
// halves and what they do; the rest show a hint of what they're made from.
const Journal = {
  key: 'specimen47.journal',
  load() { try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch (e) { return {}; } },
  save(d) { try { localStorage.setItem(this.key, JSON.stringify(d)); } catch (e) { /* private mode: it just won't persist */ } },
  found() { const d = this.load(); return Array.isArray(d.splices) ? d.splices : []; },
  discover(k) {
    const d = this.load(), list = Array.isArray(d.splices) ? d.splices : [];
    if (list.includes(k)) return false;
    list.push(k); d.splices = list; this.save(d);
    return true;
  },
};
const JOURNAL_PER_PAGE = 6;

// A hint for an undiscovered splice: what kind of part each half is, and its set.
function spliceHint(k) {
  const S = SPLICES[k];
  const half = ids => { const id = ids[0], set = setOf(id); return (set ? SETS[set].name + ' ' : '') + locOf(id); };
  return 'A ' + half(S.parts[0]) + ' + A ' + half(S.parts[1]) + (S.grown === 3 ? ' (BOTH FULLY GROWN)' : '');
}

function openJournal() { game.journal = { page: 0 }; Sfx.play('flicker'); }

function updateJournal() {
  const j = game.journal, pages = Math.ceil(Object.keys(SPLICES).length / JOURNAL_PER_PAGE);
  if (Input.hit('j', 'escape', 'pad:b')) { game.journal = null; return; }
  if (Input.hit('arrowright', 'd', 'pad:right')) j.page = (j.page + 1) % pages;
  if (Input.hit('arrowleft', 'a', 'pad:left')) j.page = (j.page + pages - 1) % pages;
}

function drawJournal(ctx) {
  const j = game.journal, keys = Object.keys(SPLICES), found = Journal.found();
  const pages = Math.ceil(keys.length / JOURNAL_PER_PAGE);
  ctx.fillStyle = '#060306'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawText(ctx, 'SPLICE JOURNAL', VIEW_W / 2, 8, VIAL_COLOR, 2, 'center');
  drawText(ctx, `${keys.filter(k => found.includes(k)).length} / ${keys.length} DISCOVERED`, VIEW_W / 2, 26, PAL.slate, 1, 'center');
  keys.slice(j.page * JOURNAL_PER_PAGE, (j.page + 1) * JOURNAL_PER_PAGE).forEach((k, i) => {
    const S = SPLICES[k], y = 40 + i * 33, known = found.includes(k);
    ctx.fillStyle = known ? '#1c1018' : '#120c10'; ctx.fillRect(8, y - 2, VIEW_W - 16, 30);
    ctx.fillStyle = known ? VIAL_COLOR : '#3a2a32'; ctx.fillRect(8, y - 2, 2, 30);
    if (known) {
      drawText(ctx, S.name.toUpperCase() + (S.grown === 3 ? '  (BIG)' : ''), 14, y, VIAL_COLOR, 1, 'left');
      drawText(ctx, S.parts.map(ids => ids.map(id => MUTATIONS[id].name).join(' OR ')).join(' + ').toUpperCase(), 14, y + 8, PAL.white, 1, 'left');
      wrapText(S.desc.toUpperCase(), 72).slice(0, 2).forEach((line, n) => drawText(ctx, line, 14, y + 16 + n * 7, PAL.slate, 1, 'left', null));
    } else {
      drawText(ctx, '? ? ?', 14, y, '#5a4a52', 1, 'left');
      drawText(ctx, spliceHint(k), 14, y + 9, '#8a7a82', 1, 'left', null);
    }
  });
  drawText(ctx, `PAGE ${j.page + 1}/${pages}  -  A / D: TURN  -  J: CLOSE`, VIEW_W / 2, VIEW_H - 12, PAL.slate, 1, 'center');
}
