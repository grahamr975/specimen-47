# Enemy dismemberment: technical plan

**Decisions:** missing limbs change how enemies fight, severed parts can be eaten, and there is a gore setting in the pause menu.

## 1. Anatomy layers (paint.js, sprites.js)

**Painter part tracking.** Add `Painter.part(name)`. Everything painted after it belongs to that part, and `part(null)` switches back to the body.
- `set()` already writes every pixel, so it also pushes `{p, c, d}` (part, color, darkest ramp tone) onto `this.stack[i]`. Stacks only exist once `part()` has been called, so untagged sprites cost nothing.
- `toCanvas()` attaches `canvas.painter = this` when there are stacks.

**Recomposition.** `Painter.compose(missing)` builds a new Painter of the same size:
- Each pixel is the top stack entry whose part is not in `missing`. Then `outline()` → `toCanvas()`.
- **Stumps** need no hand-placed joints. A body pixel that touches a pixel of a missing part turns blood red (`RAMPS.blood[2..3]`). The stump pixel closest to that part's centroid becomes bone (`#e8e0c8`).

**Part sprites.** `Painter.partSprite(name)` takes every pixel that part ever painted, including ones the body later covered, so a severed leg is whole. It is outlined and returns `{ img, cx, cy }`, where `(cx, cy)` is the part's centroid relative to the sprite's center (the spawn offset).

**Anatomy table.** `ANATOMY[type] = { parts: { legL: 'leg', legR: 'leg', tail: 'tail', head: 'head', ... } }`. The kinds are `leg`, `arm`, `head`, `tail`, `wing`, `organ`, `growth` and `plate`.
- Wrap the existing calls in each paint function, e.g. in `paintRat`: `P.part('tail')` before the tail tube, `P.part('legB')`/`P.part('legF')` around the leg blobs, and `P.part('head')` before the head blob and its eye dots.
- The art doesn't change; a test proves it (see section 8).

**Registration in `withFlash`.** When `img.painter` exists, store `SPR.anat[name] = img.painter`.
- **Missing-part sprites** are made lazily by `anatSprite(name, missingMask, variant)`, where variant is `''`, `'_L'`, `'_flash'`, `'_elite'` or `'_dead'`.
  - It is cached in `ANAT_CACHE[name|mask|variant]`.
  - The `_L` variant is `flipH` of the composite; flash, elite and dead reuse `silhouette` and `darkened`.
  - The cache is bounded by types × frames × 2^parts (≤ 4–5 severable parts per type).
- **Frames:** `rat` and `rat2` (and every `*2` frame) are painted with the same part names, so a single `e.missing` bitmask applies to every frame.

## 2. Drawing (enemies.js)

**Enemy state.** Give enemies `e.missing = 0` (a bitmask over `Object.keys(ANATOMY[type].parts)`).

**Sprite lookup.** In `drawEnemies` (~L840), elite outlines, flash, `drawEnemyMutations`, `drawStatusTint` and `drawEnemyGlow` all look up `SPR[name + variant]`. Route them all through one helper:
```js
function enemySpr(e, name, variant = '') {
  return e.missing && SPR.anat[name] ? anatSprite(name, e.missing, variant) : SPR[name + variant];
}
```
`enemySpriteName` stays as it is.

## 3. Severing during combat (enemies.js `damageEnemy`, ~L299–325)

**When a part comes off.** This replaces `if (heavy >= 0.3 && !T.boss) severChunk(...)`.
- **Heavy hit:** when `heavy >= 0.3`, there is a `0.35 + heavy*0.4` chance to sever the intact part nearest the hit side. The hit direction is `(vx, vy)`; pick the part whose centroid has the largest dot product with it. Otherwise call `severChunk`, as today.
- **HP thresholds:** crossing 66% and 33% of max HP gives a 50% chance each to lose a random intact limb. `e.sevStage` tracks which thresholds have fired.
- **Overkill:** `killEnemy` L381 (`goreExplode`) now also severs every remaining part outward, before the body bursts.

**Severing style** comes from a `src` tag on the hit. `damageEnemy` already receives a source in most call sites; add `e.lastSrc`.

| Style | Sources | Effect |
|---|---|---|
| `cut` | Scythe and plate sources | The whole part flies off fast, with a thin spray |
| `crush` | Battering and jaw-heavy sources | The part spawns as 3–4 `severChunk`s plus a burst, and no limb object |
| `melt` | Bile and corrode | The part drops in place, shrinks, and leaves a puddle (`spawnPuddle`, its fluid) |
| `tear` (default) | Bites and drains | A medium launch plus a blood string: a `tube` streak drawn for 0.3s back to the stump |

**Robots** (`T.robot`) use the same pipeline, but with metal ramps, spark `burst` instead of blood, and oil fluid. Their limbs are never edible.

**Bosses** sever only on phase changes, through a `severPart(e, name)` call from bosses.js. Mother Culture's split stays as it is.

## 4. Gameplay effects of missing parts

Effects are computed in one place: `limbEffects(e)` runs after each sever and caches `e.limp`, `e.fireMul` and friends.

| Lost | Effect |
|---|---|
| Each `leg` | Speed ×0.7. All legs lost: it crawls (×0.35) and can't pounce or lunge. |
| `arm` | Ranged attacks fire ×0.6 as often. A carried weapon is gone, so its shot pattern drops a projectile. |
| `head` | Blind. It wanders toward its last-seen player position plus noise, no longer aims, and bleeds out (`bleed` status, 6s) → dies. |
| `wing` | Fliers become grounded: `flying = false`, and they can take puddles and pits. |
| `tail` | Steering wobbles (turn noise). |
| `growth`/`plate` | A mutation or armor part. Removes that mutation's bonus (e.g. `plated` armor), so mutated enemies shed growths first. |

**Hooks:**
- Speed goes through the existing speed multiplier path, next to the status slow.
- Fire rate goes through the existing rate multiplier.
- Headless uses a state override in the AI update.

**The sim** (tools/balance.js) gets these for free. Rerun it afterwards; if floor clears jump, raise the sever thresholds.

## 5. Severed limbs (new `src/dismember.js`, loaded after gore.js)

**The limb object:** `{ x, y, vx, vy, a, va, z, vz, img, type, part, kind, fluid, robot, t, settled, biomass }`.
- **Physics:** spin, a small hop with z and bounce, and friction. Wall hits reuse `chunkStep`'s wall splat and stain.
- **Trail:** while moving, `stainPx` its fluid every few px.
- **Rotation:** the part is pre-rendered at 16 angles on first use (`rotCache[key][i]`, nearest-neighbour onto a square canvas), so the pixel art isn't blurred.

**When it settles,** it becomes debris on the floor. It stays in `game.limbs` for eating, with a slow-spreading pool under it.
- **Debris cap:** 60 per room. Past it, the oldest is baked into the decal canvas (`leaveCorpse` path) and stops being edible.
- **Room change:** `game.limbs` is cleared on room change, like the other room arrays in main.js.

## 6. Eating limbs (dna.js)

**Reuse the corpse devour path.** Standing on a limb, or biting it, eats it and grants `biomass`, about 15% of the enemy's corpse value per limb. A head is worth 30%. Robot parts are worth nothing.
- This counts as a feed for parts that react to eating (Feeding Frenzy, `broodFedT`, Gorge tags). Each part's existing `onEat`/feed hook gets called with `{ limb: true }` so effects can scale it down.

**Limbs reduce the corpse.** A corpse remembers `missing`. `damageCorpse` tears off one more part per hit, spawning a limb, before `burstCorpse`. The corpse's biomass drops by each limb's share, so the total stays the same and there's no farming.

## 7. Corpses after death (gore.js `leaveCorpse`)

**Partial corpses.** Draw `anatSprite(name, e.missing, '_dead')` instead of `SPR[name + '_dead']`, so stumps stay visible.

**Decay** is cheap because it is baked:
- Pools: at death a pool is stamped under the corpse; 2 more stamps follow at 3s and 8s, each a little bigger. These are timers in `game.deathFx`.
- Flies: a corpse older than 20s gets 2–3 fly particles. This is only for corpses still in `game.room.corpses`.

**Drag smears.** A held corpse (`e.held`) stamps its fluid along its path every 3px. This uses `markWet` too, so footprints pick it up.

## 8. Gore setting (main.js, ui.js)

**The setting:** `game.gore`, which is `2` (full), `1` (reduced) or `0` (off). It is saved in localStorage key `s47.gore` with a try/catch.
- **Pause menu:** `main.js:211`, while paused, `G` cycles it. `main.js:393` draws `GORE: FULL/REDUCED/OFF  (G)` under PAUSED, and ui.js:639 gets a controls row.

| Setting | Effect |
|---|---|
| Full | Everything |
| Reduced | No limbs fly (parts are still lost: stumps become dark, not red). Severing becomes a puff. Blood stains are 50% as dense. No flies. |
| Off | Blood becomes dark dust. Limbs don't spawn, but the gameplay effects still apply, so the balance is unchanged. Corpses fade out after 4s instead of baking. |

**The checks:** `goreOK(level)`, called in `severChunk`, `goreExplode`, `stainPx`, limb spawn and flies.

## 9. Tests (tests/test.html)

| Test | Check |
|---|---|
| Recombine | For each type in `ANATOMY`, `compose(0)` equals the original canvas pixel for pixel |
| Part identity | Every part name exists and has more than 0 pixels |
| Stump | `compose(mask)` with a leg missing has fewer opaque pixels, and at least one stump-red pixel |
| Hit side | A heavy hit from the left severs a left-side part |
| Leg | A rat missing both legs moves slower than a whole one over 2s |
| Head | A headless toad stops aiming and dies within 8s |
| Eating | Eating a limb gives biomass, and the total from the corpse plus its limbs equals the old corpse value (±1) |
| Debris cap | Spawning 100 limbs leaves 60 or fewer |
| Gore off | No limbs or stains spawn, and speed effects still apply |
| Robots | A severed drone part is not edible |

## 10. Build order (one commit each, tests green)

1. **Painter layers:** `part` / `compose` / `partSprite` / `anatSprite`, plus the rat, toad (`spitter`), frostbitten and carrier tagged, and the recombine test.
2. **`dismember.js`:** severing on hits, thresholds and overkill; flying limbs; stumps in `drawEnemies`.
3. **`limbEffects`:** the gameplay effects, and a sim rerun.
4. **Eating and corpses:** edible limbs, partial corpses, corpse tearing, pools, flies, smears.
5. **The gore setting** in the pause menu.
6. **Tag the rest:** the remaining enemies, robots and boss phase severs. Mostly `P.part()` lines in sprites.js.
7. **Severing styles** by damage source (cut, crush, melt, tear).

## Risks

- **Cache size:** with 5 severable parts there are up to 32 masks per frame. They are made lazily, so only the masks actually seen get built.
- **Sim speed:** limbs are cosmetic outside eating, so the sim can skip spawning them (`game.sim` flag) and keep only `limbEffects`.
- **Mutation overlays** (`drawEnemyMutations`) are drawn from anchor points. A growth on a severed part must be hidden: give each mutation anchor the part it sits on.
