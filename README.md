# Specimen 47

A pixel-art horror twin-stick roguelike. You're an escaped lab specimen: kill what hunts you, devour the corpses for DNA, and evolve into something worse.

## Play

Open `index.html` in a browser. There's no build step and nothing to install.

| Key | Action |
|---|---|
| WASD | Move |
| Mouse or arrow keys | Aim and shoot |
| Space / Shift | Dash (brief invulnerability; becomes a charge with some mutations) |
| Right click / E | Limb ability (Tentacles: grapple; Grasping Hands: grab, then throw) |
| M / P | Mute / pause |

## How it works

- **Burst corpses.** Some kills leave a usable corpse (it glints pink). Attack it until it bursts, then collect the DNA globules that spill out. Spawnlings and drones never leave one, and rats often don't.
- **You're fragile.** You start with 3 HP.
- **Evolve.** Filling the DNA bar lets you choose 1 of 3 mutations. Cards don't say what a mutation does; you learn by growing it.
- **Body slots.** Every mutation grows in one of five slots: MOUTH, HEAD, BACK, LIMBS or CORE.
  - **LIMBS is how you move.** You start limbless, as a slow, inching slug. Spider Legs skitter, Wings fly (floaty, and over obstacles), Hind Legs hop and pounce, and Tentacles grapple.
  - **MOUTH is your attack.** You start with a weak Bone Spike. Bile Spit, Mandibles, Tentacles and Feral Lunge replace it or combine with it.
  - An empty slot just takes the mutation, and the same mutation levels up.
  - A taken slot lets you **replace** it, or **combine** the two if they form a recipe (for example Bone Spike + Mandibles = Bone Jaws).
- **Rarity.** Mutations are Common, Uncommon, Rare or Legendary. Rare ones get likelier on deeper floors.
- **Malignant mutations** (purple cards) are extra strong with a hidden cost. Most can be cured by combining with the right partner.
- **Mutagen vials** (dropped by elites and found in vaults) give a free evolution with Uncommon-or-better cards.
- Clear the farthest room on each floor to open the hatch down.

## Where to tweak things

| File | What's in it |
|---|---|
| `src/mutations.js` | All mutations (with their slot), combine recipes, rarities and card rolling. Start here. |
| `src/abilities.js` | Mechanics behind the fancier mutations: allies, spore clouds, decoys, slime, burrowing, grabbing |
| `src/dna.js` | Corpses, bursting, DNA amounts and the level curve |
| `src/floors.js` | Each floor's name, enemy mix, hazard and boss |
| `src/bosses.js` | Bosses, telegraphed attacks, floor-specific enemy behaviors, elite affixes |
| `src/enemies.js` | Enemy stats, behaviors and DNA value |
| `src/player.js` | Movement, shooting, dash/charge, bite, tentacles, shield |
| `src/music.js` | Procedural music: chords, tempo, combat layer |
| `src/sprites.js` | All sprites, painted from shaded shapes (blobs, tubes, eyes). Tweak the numbers to reshape a creature. |
| `src/paint.js` | The pixel painter: shading, outlines, and the color ramps (`RAMPS`) |
| `src/world.js` | Room obstacle layouts, floor generation, old bloodstains |
| `src/gore.js` | Blood spray, gibs, floor stains, corpses |
| `src/lighting.js` | Darkness, dithered lights, flickering, low-HP pulse |
| `src/ui.js` | HUD, evolution cards, title and game-over screens |

## Testing

`tests/test.html` loads the real game and forces through scenarios (every mutation, recipe, boss phase and affix, plus full bot runs to floor 5), printing `OK` / `FAIL` lines. Run it after changes:

```powershell
powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1
```

It uses headless Microsoft Edge, takes a minute or two, and exits with code 1 if anything fails. You can also just open `tests/test.html` in a browser and read the page.

## Version control

The project is a git repository. Commit after each working change (`git add -A`, then `git commit -m "what changed"`), so any mistake can be undone with `git restore <file>` or by checking out an earlier commit.

## Sharing

- **itch.io**: zip the folder, create a new project with kind "HTML", upload the zip, and tick "This file will be played in the browser".
- **GitHub Pages**: push the folder to a repo and enable Pages.
