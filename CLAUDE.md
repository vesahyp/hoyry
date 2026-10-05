# CLAUDE.md

Guidance for AI agents working in this repo. `README.md` is the player page:
what the game is and how to play it. Code, architecture and process notes
live here. `ROADMAP.md` is forward-looking only.

## What this is

**Höyry** (Finnish for steam) is a twin-stick looter shooter for the
browser, phones first: Brawl Stars hands, Borderlands guns, a Diablo-style
floor-by-floor descent, set in a steampunk mill town on the rapids. Two
thumbs: one walks, one fires. A run goes down through the works floor by
floor to a boss every fifth floor. See `docs/design.md` for the design and
`docs/adr/0001-reboot-on-canvas-2d.md` for why the game was rebuilt on this
stack. The architecture is copied from the sibling game Räkkä
(`../rakka`), which proved it on a phone first.

## Stack

- **Vite + TypeScript + React.** React renders the menus, the HUD and the
  overlays. The game itself never goes through React.
- **Canvas 2D** for the game view. No engine, no WebGL library. Sprites are
  drawn once with canvas paths and cached as images (`src/render/sprites.ts`).
- **No physics, no ECS.** Enemies, projectiles, drops and zones are plain
  arrays of objects on `SimState`.
- **Seeded RNG** (`src/game/rng.ts`, mulberry32). One stream per run, on
  the sim state. Same seed and same input replay the same run.

## Where things live

```
src/
  game/                 the simulation, no DOM anywhere in here
    state.ts            SimState, Hero, HeroInput, createState
    sim.ts               newRun, startFloor, step(): heroes, waves, enemy AI,
                         bosses, the lift, nextFloor
    arena.ts             map generation (mirrored stamps), tile collision,
                         the walk field, line of sight
    guns.ts              gun rolls: type x maker x rarity, naming, gunDps
    weapons.ts           firing shared by heroes, enemies and turrets
                         (Shooter), projectile flight, zones
    combat.ts            hurtEnemy, hurtHero, explode, kills, drops
    upgrades.ts          hero stats from cogs, cog offers
    supers.ts            the four supers: their numbers by level
                         (superNums), the auto-aim (planSuper, every step
                         while charged) and the dash, leap and hop in flight
    content/
      heroes.ts          the four playable heroes, their super and passive
      enemies.ts         the works' cast, bosses, elite affixes
      cogs.ts            the lift picks: rule and number changes
      legends.ts         orange guns: a fixed type/maker and one rule
      thrown.ts          the thrown guns' pools: tar, coal dust, steam; what
                           each does for how long, read by weapons.ts
  render/
    renderer.ts          3/4 view, row-sorted walls, HUD-adjacent drawing
    sprites.ts           procedural sprite cache
  input/input.ts         twin stick touch (Brawl Stars style) + mouse/keyboard
  ui/
    Game.tsx             the game loop (fixed step), HUD, overlays
    Screens.tsx          title, hero select, the leaderboard, death
    Initials.tsx         three letters for the leaderboard, the rank line
    Cards.tsx            gun and cog cards
    Update.tsx           the newer-build banner
  audio.ts                Web Audio synth: effects and the music loop
  records.ts             localStorage run records and bests
  api.ts                 the global records API client (infra/records.tf,
                         docs/adr/0002-own-records-api.md)
  config.ts              the back-end URLs, from the build environment only
  i18n.ts                the language: fi or en, t()/tr()/L()
  version.ts             build id and the update check
tools/
  sim-check.ts           npm run sim-check: gun table + assertions
  balance.ts             npm run balance: bot runs, one line per run
  deaths.ts              npm run deaths: what hurt the hero, by floor and source
  gauntlet.ts            npm run gauntlet: the human profile of the bot plays
                           floors 6 to 8 from a typical build; fails under 60 %
  build.ts               practiceRun: a run that starts on floor N with the
                           build a run has by then (?floor=N, the gauntlet)
  supers.ts            npm run supers: each super in bot fights + the lab
  lab.ts               the super lab: open room, dummies, one press
  autoplayer.ts          the bot every tool uses, and its two profiles:
                           BOT (the floor) and HUMAN (a thumb on a phone)
  dbg/stuck.ts           map dump for a stuck floor; not committed
scripts/shots.mjs        npm run shots: Playwright, iPhone 15, ?bot=1&speed=3
scripts/ui-shots.mjs     make ui-shots: the slots at several gun levels, the
                         pickup card and each super aim, portrait and landscape
scripts/thrown-shots.mjs make thrown-shots: each thrown gun landing and its pool
scripts/super-check.mjs  make super-check: each super tapped in a fight hits
scripts/pickup-check.mjs make pickup-check: a gun pickup moves without a jump
scripts/gauntlet-check.mjs make gauntlet-check: floors 6 to 8 on an emulated
                         iPhone by the human profile, on video (shots/gauntlet/)
```

## Rules

1. **The sim is headless.** Nothing under `src/game/` may touch `window`,
   `document`, React or audio. This is what makes `sim-check` and `balance`
   possible. Sounds are names pushed onto `state.sounds`; the game loop
   drains them into `audio.play`.
2. **Fixed step.** The sim runs at `DT = 1/60` (`sim.ts`); the render loop
   accumulates real time and calls `step` a whole number of times. Never
   pass a frame delta into `step`.
3. **Seeded RNG on the state.** `s.rng` is the one stream for a run. UI and
   render code never draw from it; anything cosmetic uses its own source.
4. **Content is data.** A new gun maker or type is numbers in `guns.ts`. A
   new enemy is an `EnemyDef` in `content/enemies.ts` plus a wave entry. A
   cog is a `CogDef` plus its rule, read where the rule lives through
   `cogLevel(hero, id)`. An orange gun is a `LegendDef` in `content/legends.ts`:
   `apply` sets its numbers, and `gun.legend` is checked where the rule
   lives (`weapons.ts`, `combat.ts`).
5. **Every hit goes through one of three functions.** `hurtEnemy`, `hurtHero`
   and `explode` in `combat.ts` own damage numbers, knockback, statuses,
   kills and drops. A new gun or cog never has to remember them.
6. **Heroes and enemies share one firing path.** `weapons.ts`'s `Shooter`
   is whatever holds the gun; a hero, an enemy and a turret differ only by
   `team`, `dmgMul` and `slow` (enemy bullets fire at half speed, so they
   are slow enough to dodge without a second code path). Never fork a
   hero-only or enemy-only version of firing.
7. **Two languages, English in the code.** Every player-facing string
   exists in Finnish and English (`src/i18n.ts`): content as `L(fi, en)`,
   UI strings as `tr(fi, en)`. The sim may call `t()` and `tr()` for its
   banners: the language is module state with no DOM in it, so the sim
   stays headless. Identifiers, comments and docs are English.
8. **A hero, not the player.** `SimState.heroes` is a list, for co-op
   later. Everything that belongs to one build (guns, hp, cogs, the super)
   hangs off a `Hero`; what is shared (enemies, drops, the arena, the
   camera) is on `SimState`.

## Workflow

- `make dev` (http://localhost:5173, also on the LAN for a phone).
- **Before committing:** `make check` (typecheck, build, `sim-check`,
  `gauntlet`, `super-check`, `pickup-check`, `gauntlet-check`) must pass.
  The last three drive an emulated iPhone, so they need `make shots-setup`
  once. `sim-check` prints the gun table first; read it when you touched a
  gun maker, type or rarity curve.
- **Balance with `make balance [FLOORS=10] [RUNS=2] [HERO=] [START=]`.**
  The bot kites and takes better guns but has no plan. A change that moves
  the bot's average floor moves the player's run the same way. `START=` a
  gun type starts every run with it, for weighing one type against the
  rest; `sim-check` prints the same types measured in a lab (ten seconds
  of fire at one dummy and at a pack) under the gun table. `make deaths`
  (same knobs) says what the damage came from, floor by floor: every hit
  on a hero carries its source through `hurtHero` (`s.onHurt`).
  `make gauntlet [FROM=6 TO=8 RUNS=8 HERO=] [START=]` is the player's floor: the
  bot with a person's limits (`HUMAN` in `tools/autoplayer.ts`) from the
  build a run has by then (`tools/build.ts`), and it fails under 60 %
  clears. A floor band the gauntlet fails is unfair, not hard. `START=`
  (`veturi@5`, `rifle@10`) puts that gun in the hand instead of the found
  one: the way to ask whether an early gun still carries deep floors.
- **URL knobs for testing:** `?seed=N` fixes the run, `?floor=N` starts
  on floor N with a typical build (a practice run: no leaderboard),
  `?bot=1` plays the bot, `?bot=human` the bot with a person's limits,
  `?speed=3` runs the sim at three times real time, `?lang=en`.
- `make shots` / `make shots-en` for phone screenshots (Playwright, iPhone
  15, `?bot=1&speed=3&seed=`), never from a hand-held browser.
- `make touch-check` when you touch a menu or the input: it taps through
  the pause menu, the swap button and the lift cog pick on an emulated phone,
  then scrolls every menu with a finger in landscape. The touch
  handler blocks the default action of play-field touches, so a menu
  needs `data-ui` (or to be a button or inside `.overlay`) to be tappable.
- `make plan` and `make apply` for `infra/`: the analytics pixel host
  (S3 + CloudFront) and the records API (DynamoDB + Lambda + HTTP API, the
  board cached on the same CloudFront), Terraform. `make deploy-pixel`
  uploads `t.gif`. The back-end URLs reach the build only through the
  environment (`VITE_PIXEL_URL` in `index.html`, `VITE_RECORDS_API` and
  `VITE_BOARD_URL` in `src/config.ts`): `make env` writes `.env.local`
  from the Terraform outputs for builds here, and the Pages deploy reads
  GitHub repository variables of the same names. A clone or fork without
  them has the tracker off and local records only. Never put a URL in a
  committed file. `infra/budget.tf` emails and pushes to the phone when
  hoyry's tagged spend passes $20 a month.
- Deploy is automatic: every push to `master` builds and publishes to
  GitHub Pages (`.github/workflows/deploy.yml`) at
  https://vesahyp.github.io/hoyry/.
- When a change alters what the player sees or does (a control, a gun
  rule, a cog, a hero), update `README.md` in player words.
