import { FLOOR, T } from '../src/game/arena';
import { HERO_BY_ID } from '../src/game/content/heroes';
import { DT, newRun, step } from '../src/game/sim';
import { NO_INPUT } from '../src/game/state';
import type { Enemy } from '../src/game/types';

/**
 * The super lab, shared by `npm run supers` and `sim-check`: floor 1, an
 * open room, dummies that neither die nor walk, one press of the super,
 * and which dummies it reached for how much.
 */

/** seconds after the press that count as the super's */
export const WINDOW: Record<string, number> = { dash: 0.6, leap: 0.9, slam: 0.6, turret: 9.5 };

/** where the dummies stand, relative to the hero, x to the right */
export const LAYOUTS: Record<string, [number, number][]> = {
  'pack@150': [[150, 0], [170, 20], [170, -20], [190, 0], [140, 25]],
  'line': [[90, 0], [150, 0], [210, 0], [270, 0]],
  'ring@170': Array.from({ length: 6 }, (_, i) => [170 * Math.cos((i * Math.PI) / 3), 170 * Math.sin((i * Math.PI) / 3)] as [number, number]),
  'one@100': [[100, 0]],
  'one@280': [[280, 0]],
  'one+pack': [[-100, 0], [210, 0], [230, 20], [230, -20], [250, 0]],
};

function dummy(id: number, x: number, y: number): Enemy {
  return {
    id, kind: 'rotta', x, y, vx: 0, vy: 0, r: 12, hp: 1e6, maxHp: 1e6, speed: 0, behaviour: 'swarm', touch: 0, held: null, elite: [], boss: false,
    mode: 'chase', modeT: 0, cx: 0, cy: 0, seenX: x, seenY: y, lostFor: 0, aware: true, side: 1, burn: 0, burnDps: 0, slow: 0, tar: 0, blind: 0, stun: 0,
    flash: 0, kx: 0, ky: 0, facing: 0, age: 10, dead: false,
  };
}

/** `aim` is a drag on the super button (length 0..1); none is a tap. */
export function lab(heroId: string, layout: [number, number][], aim?: { x: number; y: number }): { hits: number; dmg: number } {
  const def = HERO_BY_ID[heroId];
  const s = newRun(7, [def]);
  const h = s.heroes[0];
  // An open room: everything within 14 tiles of the hero is floor.
  const a = s.arena;
  h.x = (a.w / 2) * T;
  h.y = (a.h / 2) * T;
  for (let ty = 1; ty < a.h - 1; ty++) for (let tx = 1; tx < a.w - 1; tx++) if (Math.hypot(tx * T - h.x, ty * T - h.y) < 14 * T) a.tiles[ty * a.w + tx] = FLOOR;
  s.wavesLeft = 0;
  s.marks = [];
  s.enemies = layout.map(([x, y], i) => dummy(900000 + i, h.x + x, h.y + y));
  h.superCharge = 1;
  step(s, [{ ...NO_INPUT, superFire: true, superAimX: aim?.x ?? 0, superAimY: aim?.y ?? 0 }], DT);
  for (let i = 0; i < 60 * WINDOW[def.super]; i++) step(s, [NO_INPUT], DT);
  let hits = 0;
  let dmg = 0;
  for (const e of s.enemies) {
    if (e.hp < 1e6) hits++;
    dmg += 1e6 - e.hp;
  }
  return { hits, dmg };
}

