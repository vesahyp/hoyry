import { CRATE, CRATE_HP, FLOOR, T, WALL, updateFlow, type Arena } from './arena';
import type { HeroDef } from './content/heroes';
import { dropAt, dropGun } from './combat';
import { rollRarity } from './guns';
import { newRun } from './sim';
import type { SimState } from './state';
import { tr } from '../i18n';

/**
 * The training ground: a small open room with training dummies that
 * neither walk nor shoot, for learning the hands and trying the guns. No
 * waves, no lift, no death and no record. A broken dummy stands up again
 * at its post a few seconds later, and guns and other pickups drop at
 * random so there is always something new to pick up.
 */

/** where a dummy stands, and the seconds left until a broken one returns */
export interface Post {
  x: number;
  y: number;
  t: number;
}

export interface Training {
  posts: Post[];
  /** seconds until the next random drop */
  dropT: number;
  /** drops so far, to alternate guns with the rest */
  drops: number;
}

export const DUMMY = 'nukke';
export const RESPAWN = 3;
const ROOM = 17;
/** gun drops lying on the floor at once, at most */
const MAX_GUNS = 5;

function trainingArena(): Arena {
  const w = ROOM;
  const h = ROOM;
  const tiles = new Uint8Array(w * h).fill(FLOOR);
  const hp = new Float32Array(w * h);
  for (let x = 0; x < w; x++) tiles[x] = tiles[(h - 1) * w + x] = WALL;
  for (let y = 0; y < h; y++) tiles[y * w] = tiles[y * w + w - 1] = WALL;
  // A few crates to shoot over and around, in mirrored pairs.
  for (const [x, y] of [
    [3, 5],
    [w - 4, 5],
    [3, 11],
    [w - 4, 11],
  ]) {
    tiles[y * w + x] = CRATE;
    hp[y * w + x] = CRATE_HP;
  }
  return {
    w,
    h,
    tiles,
    hp,
    startX: Math.floor(w / 2),
    startY: h - 3,
    // No lift here: it sits outside the room, where nothing draws it.
    liftX: -10 * T,
    liftY: -10 * T,
    flow: new Int16Array(w * h),
    vents: [],
    style: 0,
  };
}

export function trainingRun(seed: number, defs: HeroDef[]): SimState {
  const s = newRun(seed, defs);
  const a = trainingArena();
  s.arena = a;
  s.enemies = [];
  s.marks = [];
  s.drops = [];
  s.wavesLeft = 0;
  s.heroes.forEach((h, i) => {
    h.x = (a.startX + 0.5) * T + (i - (s.heroes.length - 1) / 2) * 30;
    h.y = (a.startY + 0.5) * T;
  });
  s.cam.x = s.heroes[0].x;
  s.cam.y = s.heroes[0].y;
  updateFlow(a, s.heroes);
  const cx = (a.w / 2) * T;
  const posts: Post[] = [
    [cx, 3.5 * T],
    [cx - 4 * T, 5.5 * T],
    [cx + 4 * T, 5.5 * T],
    [cx - 5.5 * T, 9.5 * T],
    [cx + 5.5 * T, 9.5 * T],
  ].map(([x, y]) => ({ x, y, t: 0.4 }));
  s.training = { posts, dropT: 4, drops: 0 };
  s.banner = { text: tr('Harjoituskenttä', 'Training ground'), sub: tr('Nuket eivät ammu eivätkä liiku', 'The dummies do not shoot or move'), life: 2.8 };
  return s;
}

/** Runs each step in place of the waves: dummies return to their posts, and something drops now and then. */
export function updateTraining(s: SimState, dt: number): void {
  const tr = s.training;
  if (!tr) return;
  for (const p of tr.posts) {
    const standing = s.enemies.some((e) => !e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 20) || s.marks.some((m) => m.x === p.x && m.y === p.y);
    if (standing) {
      p.t = RESPAWN;
      continue;
    }
    p.t -= dt;
    if (p.t <= 0) {
      s.marks.push({ kind: DUMMY, x: p.x, y: p.y, t: 0.8, elite: [], boss: -1 });
      p.t = RESPAWN;
    }
  }
  tr.dropT -= dt;
  if (tr.dropT > 0) return;
  tr.dropT = s.rng.range(5, 8);
  const h = s.heroes[0];
  const a = s.arena;
  // A free tile of floor, away from the hero and the posts.
  let x = 0;
  let y = 0;
  for (let tries = 0; tries < 20; tries++) {
    x = (s.rng.int(2, a.w - 3) + 0.5) * T;
    y = (s.rng.int(2, a.h - 3) + 0.5) * T;
    const i = Math.floor(y / T) * a.w + Math.floor(x / T);
    if (a.tiles[i] !== FLOOR) continue;
    if (Math.hypot(x - h.x, y - h.y) < 80) continue;
    if (tr.posts.some((p) => Math.hypot(x - p.x, y - p.y) < 50)) continue;
    break;
  }
  tr.drops++;
  if (tr.drops % 3 === 0) {
    dropAt(s, x, y, s.rng.chance(0.5) ? 'steam' : 'coin', s.rng.chance(0.5) ? 14 : 3);
    return;
  }
  if (s.drops.filter((d) => d.kind === 'gun').length >= MAX_GUNS) return;
  // Rolled as a floor-6 drop with some luck, so every colour turns up, at a level from 1 to 8 so the medals differ.
  dropGun(s, x, y, rollRarity(s.rng, 6, 0.6), {}, s.rng.int(1, 8));
}
