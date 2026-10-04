import { step, nextFloor, DT } from '../src/game/sim';
import { HEROES, HERO_BY_ID } from '../src/game/content/heroes';
import { rollCogs, applyCog } from '../src/game/upgrades';
import { Rng } from '../src/game/rng';
import { botInput, humanPickCog, HUMAN } from './autoplayer';
import { practiceRun } from './build';

declare const process: { argv: string[]; exitCode?: number };

/**
 * npm run gauntlet [from] [to] [runs] [hero]: the hard floors, played by
 * the human profile of the bot (a reaction time, a thumb, a tap rate, an
 * aim a little off) from a build a run has by then (tools/build.ts). One
 * line per hero with how many runs cleared each floor, then the share of
 * runs that cleared the whole stretch. The check fails under NEED: the
 * floors have to be beatable by a person on a phone, most of the time.
 */
const from = Number(process.argv[2] ?? 6);
const to = Number(process.argv[3] ?? 8);
const runs = Number(process.argv[4] ?? 8);
const only = process.argv[5];
const heroes = only ? [HERO_BY_ID[only]] : HEROES;
const NEED = 0.6;

let cleared = 0;
let total = 0;
let stuck = 0;
for (const def of heroes) {
  const per: number[] = [];
  for (let f = from; f <= to; f++) per.push(0);
  const died: string[] = [];
  for (let r = 0; r < runs; r++) {
    const seed = 2000 + r * 11 + def.id.length;
    const s = practiceRun(seed, [def], from);
    const bot = new Rng(seed ^ 0x5151);
    let last = '';
    s.onHurt = (_h, _d, src) => (last = src);
    // The sim's own valve closes a floor stuck past 240 s (a pathing bug,
    // not a fight), the same as it does for a player; count those apart.
    while (!s.gameOver && s.floor <= to && s.floorTime < 300) {
      step(s, s.heroes.map((h) => botInput(s, h, bot, HUMAN)), DT);
      if (s.phase === 'done') {
        per[s.floor - from]++;
        if (s.floorTime > 240) stuck++;
        for (const h of s.heroes) for (let k = 0; k < s.pendingCogs; k++) applyCog(h, humanPickCog(rollCogs(s, h), bot).id);
        s.pendingCogs = 0;
        if (s.floor === to) break;
        nextFloor(s);
      }
    }
    total++;
    if (!s.gameOver && s.floor === to && s.phase === 'done') cleared++;
    else died.push(`${s.floor}:${s.gameOver ? last : 'stuck'}`);
  }
  console.log(`${def.id.padEnd(12)} cleared ${per.map((n, i) => `floor ${from + i}: ${n}/${runs}`).join(', ')}${died.length ? ` | fell on ${died.join(', ')}` : ''}`);
}
const rate = cleared / total;
console.log(`${cleared}/${total} runs cleared floors ${from} to ${to} (${Math.round(rate * 100)} %, need ${Math.round(NEED * 100)} %)${stuck ? `; ${stuck} floors closed by the 240 s valve` : ''}`);
if (rate < NEED) {
  console.log('FAIL  the gauntlet is too hard for a person on a phone');
  process.exitCode = 1;
} else console.log('PASS');
