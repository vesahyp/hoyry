import { HUMAN, botPickCog, humanPickCog, type Player } from './autoplayer';
import type { HeroDef } from '../src/game/content/heroes';
import { gunScore, hold, rollGun } from '../src/game/guns';
import { LEGENDS } from '../src/game/content/legends';
import type { GunType } from '../src/game/types';
import { Rng } from '../src/game/rng';
import { newRun, startFloor } from '../src/game/sim';
import type { SimState } from '../src/game/state';
import { applyCog, rollCogs } from '../src/game/upgrades';

/**
 * A run that starts on `floor` with the build a run gets there with: one
 * cog a floor and two on a boss floor, picked as the player profile picks
 * them, and two guns a run keeps by then (one of the hero's own type from
 * two floors back, one a floor old and a rarity better after a boss), the
 * better one in hand. Used by `?floor=N` in the game and by the gauntlet,
 * so the hard floors can be played without the easy ones first.
 */
/** `start` is `type@level` or `legend@level`: a gun the run carries in place of the found one, for weighing it (the gauntlet's sixth argument). */
export function practiceRun(seed: number, defs: HeroDef[], floor: number, who: Player = HUMAN, start?: string): SimState {
  const s = newRun(seed, defs);
  const rng = new Rng(seed ^ 0x7777);
  const pick = who === HUMAN ? humanPickCog : botPickCog;
  for (const h of s.heroes) {
    for (let f = 1; f < floor; f++) {
      for (let k = 0; k < (f % 5 === 0 ? 2 : 1); k++) applyCog(h, pick(rollCogs(s, h), rng).id);
    }
    const own = rollGun(s.rng, Math.max(1, floor - 2), 1, { type: h.def.start.type });
    let found = rollGun(s.rng, Math.max(1, floor - 1), Math.min(2, 1 + Math.floor((floor - 1) / 5)));
    if (start) {
      const [what, lvl] = start.split('@');
      const level = Number(lvl) || floor;
      found = what in LEGENDS ? rollGun(s.rng, level, 4, { legend: what }) : rollGun(s.rng, level, 2, { type: what as GunType });
    }
    h.guns = [hold(own), hold(found)];
    h.active = gunScore(found) > gunScore(own) ? 1 : 0;
    h.hp = h.stats.maxHp;
  }
  s.run.bosses = Math.floor((floor - 1) / 5);
  startFloor(s, floor);
  return s;
}
