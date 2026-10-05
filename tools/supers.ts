import { newRun, step, nextFloor, DT } from '../src/game/sim';
import { HEROES, HERO_BY_ID } from '../src/game/content/heroes';
import { rollCogs, applyCog } from '../src/game/upgrades';
import { Rng } from '../src/game/rng';
import type { SimState } from '../src/game/state';
import { LAYOUTS, WINDOW, lab } from './lab';
import { botInput, botPickCog } from './autoplayer';

declare const process: { argv: string[]; exitCode?: number };

/**
 * npm run supers [floors] [runs] [hero]: what each hero's super does in a
 * real fight. The bot plays floors 1..floors and presses the super when it
 * is charged and an enemy is within 220 px (a tap: no drag, so the game
 * aims it). At the press the hero's bullets in flight, burns and fire
 * ground are cleared, and for a short window after it the gun is held
 * silent, so every point of damage in the window is the super's.
 *
 * Damage is divided by the floor scale (1 + 0.15 * (floor - 1)) so floors
 * compare: "dmg/use" reads as floor-1 damage. Weak early enemies cap it,
 * so part two is a lab: floor 1, an open room, dummies that do not die or
 * move, one tap on the super, and how many dummies it reached and for how
 * much. That is the super's reach and power without the kill cap.
 */
const maxFloor = Number(process.argv[2] ?? 10);
const runs = Number(process.argv[3] ?? 3);
const only = process.argv[4];
const heroes = only ? [HERO_BY_ID[only]] : HEROES;


interface Tally {
  uses: number;
  whiffs: number;
  hits: number;
  dmg: number;
  kills: number;
  fightTime: number;
}

function silence(s: SimState): void {
  s.projectiles = s.projectiles.filter((p) => p.team !== 0);
  s.zones = s.zones.filter((z) => z.team !== 0 || z.kind === 'soot');
  for (const e of s.enemies) e.burn = 0;
  for (const h of s.heroes) for (const g of h.guns) g.burstLeft = 0;
}

console.log('in a fight: bot runs, floors 1-' + maxFloor + ', ' + runs + ' runs a hero');
for (const def of heroes) {
  const t: Tally = { uses: 0, whiffs: 0, hits: 0, dmg: 0, kills: 0, fightTime: 0 };
  for (let r = 0; r < runs; r++) {
    const seed = 2000 + r * 13 + def.id.length;
    const s = newRun(seed, [def]);
    const bot = new Rng(seed ^ 0x5151);
    let win = 0;
    let before = new Map<number, number>();
    let scale = 1;
    const close = () => {
      const alive = new Map(s.enemies.map((e) => [e.id, e]));
      let hits = 0;
      let dmg = 0;
      for (const [id, hp] of before) {
        const e = alive.get(id);
        const now = e ? Math.max(0, e.hp) : 0;
        if (now < hp - 0.01) {
          hits++;
          dmg += hp - now;
          if (!e) t.kills++;
        }
      }
      t.hits += hits;
      t.dmg += dmg / scale;
      if (!hits) t.whiffs++;
    };
    while (!s.gameOver && s.floor <= maxFloor && s.time < 60 * 60) {
      const h = s.heroes[0];
      const inp = botInput(s, h, bot);
      if (win > 0) {
        inp.fire = false;
        inp.superFire = false;
      }
      const pressing = inp.superFire && h.superCharge >= 1;
      if (pressing) {
        inp.fire = false;
        silence(s);
        before = new Map(s.enemies.filter((e) => !e.dead).map((e) => [e.id, e.hp]));
        scale = 1 + 0.15 * (s.floor - 1);
        win = WINDOW[def.super];
        t.uses++;
      }
      if (s.phase === 'fight') t.fightTime += DT;
      step(s, [inp], DT);
      if (win > 0) {
        for (const g of h.guns) g.burstLeft = 0;
        win -= DT;
        if (win <= 0) close();
      }
      if (s.phase === 'done') {
        for (let k = 0; k < s.pendingCogs; k++) applyCog(h, botPickCog(rollCogs(s, h), bot).id);
        s.pendingCogs = 0;
        if (s.floor === maxFloor) break;
        nextFloor(s);
      }
      if (s.floorTime > 240) break;
    }
  }
  const u = Math.max(1, t.uses);
  console.log(
    `${def.id.padEnd(12)} ${def.super.padEnd(7)} uses ${String(t.uses).padStart(3)}  per fight-min ${(t.uses / (t.fightTime / 60)).toFixed(2)}  whiff ${Math.round((100 * t.whiffs) / u)}%  hits/use ${(t.hits / u).toFixed(2)}  kills/use ${(t.kills / u).toFixed(2)}  dmg/use ${Math.round(t.dmg / u)}`,
  );
}

// ————— part two: the lab —————

console.log('\nlab: floor 1, open room, immortal dummies, one tap. hits/dummies dmg');
console.log('             ' + Object.keys(LAYOUTS).map((k) => k.padEnd(13)).join(''));
for (const def of heroes) {
  const cells = Object.values(LAYOUTS).map((l) => {
    const r = lab(def.id, l);
    return `${r.hits}/${l.length} ${Math.round(r.dmg)}`.padEnd(13);
  });
  console.log(def.id.padEnd(13) + cells.join(''));
}

// ————— part three: the levels —————

console.log('\nby level: the pack at 150, one tap, hits/5 dmg (level 1 is the base; a super cog adds one)');
console.log('             ' + [1, 2, 3, 4, 5].map((l) => `level ${l}`.padEnd(13)).join(''));
for (const def of heroes) {
  const cells = [1, 2, 3, 4, 5].map((l) => {
    const r = lab(def.id, LAYOUTS['pack@150'], undefined, l);
    return `${r.hits}/5 ${Math.round(r.dmg)}`.padEnd(13);
  });
  console.log(def.id.padEnd(13) + cells.join(''));
}
