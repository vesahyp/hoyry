import { newRun, step, nextFloor, DT } from '../src/game/sim';
import { HEROES, HERO_BY_ID } from '../src/game/content/heroes';
import { rollCogs, applyCog } from '../src/game/upgrades';
import { Rng } from '../src/game/rng';
import { botInput, botPickCog } from './autoplayer';

declare const process: { argv: string[]; exitCode?: number };

/**
 * npm run deaths [floors] [runs] [hero]: what hurts the hero, floor by
 * floor. Every hit on a hero carries its source (s.onHurt): the gun type
 * and maker of a bullet, `touch:` and `charge:` for bodies, `mortar:`,
 * `bomber`, `barrel`, `zone:`. The table is damage per floor reached, by
 * source, plus what landed the killing hit, and how many enemies on the
 * floor carried a clockwork (homing) gun.
 */
const maxFloor = Number(process.argv[2] ?? 10);
const runs = Number(process.argv[3] ?? 4);
const only = process.argv[4];
const heroes = only ? [HERO_BY_ID[only]] : HEROES;

interface FloorRow {
  reached: number;
  cleared: number;
  died: Record<string, number>;
  dmg: Record<string, number>;
  homingEnemies: number;
  homingShots: number;
  enemies: number;
  seconds: number;
}
const rows: FloorRow[] = [];
const row = (f: number) => (rows[f] ??= { reached: 0, cleared: 0, died: {}, dmg: {}, homingEnemies: 0, homingShots: 0, enemies: 0, seconds: 0 });
const add = (r: Record<string, number>, k: string, v: number) => (r[k] = (r[k] ?? 0) + v);

for (const def of heroes) {
  for (let r = 0; r < runs; r++) {
    const seed = 1000 + r * 7 + def.id.length;
    const s = newRun(seed, [def]);
    const bot = new Rng(seed ^ 0x5151);
    let last = '';
    s.onHurt = (_h, dmg, src) => {
      add(row(s.floor).dmg, src, dmg);
      last = src;
    };
    const seenEnemy = new Set<number>();
    const seenShot = new Set<number>();
    row(1).reached++;
    let floorStart = 0;
    while (!s.gameOver && s.floor <= maxFloor && s.time < 60 * 60) {
      step(s, s.heroes.map((h) => botInput(s, h, bot)), DT);
      for (const e of s.enemies) {
        if (seenEnemy.has(e.id)) continue;
        seenEnemy.add(e.id);
        row(s.floor).enemies++;
        if (e.held && e.held.gun.homing > 0) row(s.floor).homingEnemies++;
      }
      for (const p of s.projectiles) {
        if (p.team !== 1 || p.homing <= 0 || seenShot.has(p.id)) continue;
        seenShot.add(p.id);
        row(s.floor).homingShots++;
      }
      if (s.phase === 'done') {
        for (const h of s.heroes) for (let k = 0; k < s.pendingCogs; k++) applyCog(h, botPickCog(rollCogs(s, h), bot).id);
        s.pendingCogs = 0;
        row(s.floor).cleared++;
        row(s.floor).seconds += s.time - floorStart;
        floorStart = s.time;
        if (s.floor === maxFloor) break;
        nextFloor(s);
        row(s.floor).reached++;
      }
      if (s.floorTime > 240) break;
    }
    if (s.gameOver) add(row(s.floor).died, last, 1);
  }
}

const total = heroes.length * runs;
console.log(`${total} runs, ${heroes.map((h) => h.id).join('/')}, to floor ${maxFloor}`);
console.log('floor reached cleared  secs  enemies homing(shots)  deaths: by killing hit | damage by source (per run that reached the floor)');
for (let f = 1; f < rows.length; f++) {
  const r = rows[f];
  if (!r) continue;
  const dmg = Object.entries(r.dmg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => `${k} ${Math.round(v / r.reached)}`)
    .join(', ');
  const died = Object.entries(r.died)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');
  const nd = Object.values(r.died).reduce((a, b) => a + b, 0);
  console.log(
    `${String(f).padStart(5)} ${String(r.reached).padStart(7)} ${String(r.cleared).padStart(7)} ${String(Math.round(r.seconds / Math.max(1, r.cleared))).padStart(5)} ${String(Math.round(r.enemies / r.reached)).padStart(8)} ${String(Math.round(r.homingEnemies / r.reached)).padStart(6)} (${String(Math.round(r.homingShots / r.reached)).padStart(3)})  ${String(nd).padStart(2)}: ${died.padEnd(34)} | ${dmg}`,
  );
}
