import { T, freeSpot, lineOfSight, moveCircle } from './arena';
import { cogLevel, effect, explode, hurtEnemy, newId } from './combat';
import { hold } from './guns';
import type { Hero, SimState, SuperPlan } from './state';
import type { Enemy, Turret } from './types';

/**
 * The four supers: where each one aims, and what it does. A tap on the
 * super button aims it here (the best enemy or group in reach); a drag
 * aims the two that need a direction (the dash and the leap, which are
 * also escapes) and snaps to the nearest enemy near the drag line.
 * `planSuper` runs every step while the super is charged, so the renderer
 * can show where a tap will land before the player presses. A super's own
 * hits do not charge the next one (the turret's shots are a gun's, and do).
 */

/** Soot Dash: the dash runs through its target and this far past it */
export const DASH = { min: 120, max: 300, past: 50, speed: 900, width: 22, dmg: 60, burstR: 90, burstDmg: 40, cloudR: 100, cloudLife: 4 };
export const LEAP = { min: 0, max: 310, r: 120, dmg: 70 };
/** Anvil: a short hop toward the group, then the slam */
export const SLAM = { look: 230, hop: 150, r: 130, dmg: 60, shield: 3 };
export const TURRET = { ahead: 40, life: 9, dmgMul: 0.8, cap: 2 };
/** a drag snaps to an enemy within this angle of the drag line */
const SNAP = 0.6;

/**
 * A super's level, 1 to 5: the hero's own super cog (content/cogs.ts)
 * adds a level each pick. `superNums` is every number the level changes,
 * read here, by the renderer for the aim marker, and by the HUD.
 */
export function superLevel(h: Hero): number {
  return 1 + cogLevel(h, `super_${h.def.super}`);
}

export interface SuperNums {
  dash: typeof DASH & { trail: boolean };
  leap: typeof LEAP & { safe: number; slow: boolean; bounce: boolean };
  slam: typeof SLAM & { stun: boolean; aftershock: boolean };
  turret: typeof TURRET & { burst: boolean };
}

export function superNums(h: Hero): SuperNums {
  const L = superLevel(h);
  const more = L >= 2 ? 1.35 : 1;
  return {
    dash: { ...DASH, dmg: DASH.dmg * more, burstDmg: DASH.burstDmg * more, max: L >= 3 ? 380 : DASH.max, width: L >= 3 ? 30 : DASH.width, burstR: L >= 4 ? 120 : DASH.burstR, cloudR: L >= 4 ? 130 : DASH.cloudR, cloudLife: L >= 4 ? 7 : DASH.cloudLife, trail: L >= 5 },
    leap: { ...LEAP, dmg: LEAP.dmg * more, r: L >= 3 ? 150 : LEAP.r, max: L >= 3 ? 360 : LEAP.max, safe: L >= 2 ? 0.6 : 0, slow: L >= 4, bounce: L >= 5 },
    slam: { ...SLAM, r: L >= 2 ? 160 : SLAM.r, dmg: L >= 3 ? SLAM.dmg * 1.35 : SLAM.dmg, shield: L >= 3 ? 5 : SLAM.shield, stun: L >= 4, aftershock: L >= 5 },
    turret: { ...TURRET, life: L >= 2 ? 13 : TURRET.life, dmgMul: L >= 3 ? 1 : TURRET.dmgMul, cap: L >= 4 ? 3 : TURRET.cap, burst: L >= 5 },
  };
}

const scale = (s: SimState) => 1 + 0.15 * (s.floor - 1);

function live(s: SimState): Enemy[] {
  return s.enemies.filter((e) => !e.dead && e.age >= 0.4);
}

/** enemies within r (plus their body) of (x, y) */
function around(es: Enemy[], x: number, y: number, r: number): number {
  let n = 0;
  for (const e of es) if (Math.hypot(e.x - x, e.y - y) < r + e.r) n++;
  return n;
}

/** The centre of the group around `e`, and how many are in it. */
function groupAt(es: Enemy[], e: Enemy, r: number): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const o of es) {
    if (Math.hypot(o.x - e.x, o.y - e.y) < r + o.r) {
      x += o.x;
      y += o.y;
      n++;
    }
  }
  return { x: x / n, y: y / n };
}

function clampTo(h: Hero, x: number, y: number, max: number): { x: number; y: number } {
  const d = Math.hypot(x - h.x, y - h.y);
  if (d <= max) return { x, y };
  return { x: h.x + ((x - h.x) / d) * max, y: h.y + ((y - h.y) / d) * max };
}

function nearest(h: Hero, es: Enemy[]): Enemy | null {
  let best: Enemy | null = null;
  let bd = Infinity;
  for (const e of es) {
    const d = Math.hypot(e.x - h.x, e.y - h.y);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/** The nearest enemy within `range` and SNAP of the drag angle. */
function snap(s: SimState, h: Hero, es: Enemy[], angle: number, range: number, sight: boolean): Enemy | null {
  let best: Enemy | null = null;
  let bd = range;
  for (const e of es) {
    const d = Math.hypot(e.x - h.x, e.y - h.y);
    if (d >= bd) continue;
    let da = Math.abs(Math.atan2(e.y - h.y, e.x - h.x) - angle);
    if (da > Math.PI) da = Math.PI * 2 - da;
    if (da > SNAP) continue;
    if (sight && !lineOfSight(s.arena, h.x, h.y, e.x, e.y)) continue;
    bd = d;
    best = e;
  }
  return best;
}

/** How many enemies a dash at `angle` of `len` would touch, and its end burst would catch. */
function dashScore(h: Hero, es: Enemy[], angle: number, len: number): number {
  const cx = Math.cos(angle);
  const cy = Math.sin(angle);
  const ex = h.x + cx * len;
  const ey = h.y + cy * len;
  let n = 0;
  for (const e of es) {
    const rx = e.x - h.x;
    const ry = e.y - h.y;
    const along = rx * cx + ry * cy;
    const across = Math.abs(rx * cy - ry * cx);
    if (along > -h.r && along < len + h.r && across < h.r + e.r + DASH.width) n++;
    else if (Math.hypot(e.x - ex, e.y - ey) < DASH.burstR + e.r) n += 0.7;
  }
  return n;
}

const dashLen = (d: number) => Math.max(DASH.min, Math.min(DASH.max, d + DASH.past));

/**
 * Where the super goes. `aim` is a drag vector (length 0..1) or null for
 * a tap. The plan's (x, y) is the point the marker shows: the dash's
 * target, the leap's and the hop's landing, the turret's group.
 */
export function planSuper(s: SimState, h: Hero, aim: { x: number; y: number } | null): SuperPlan {
  const es = live(s);
  const kind = h.def.super;
  const N = superNums(h);
  const DASH = N.dash;
  const LEAP = N.leap;
  const SLAM = N.slam;
  const plan: SuperPlan = { on: true, angle: h.facing, dist: 0, x: h.x, y: h.y, locked: -1 };
  const at = (x: number, y: number, locked = -1) => {
    plan.x = x;
    plan.y = y;
    plan.angle = Math.atan2(y - h.y, x - h.x);
    plan.dist = Math.hypot(x - h.x, y - h.y);
    plan.locked = locked;
  };
  const fallback = (max: number) => {
    // Nothing in reach: toward the nearest enemy anywhere, else forward.
    const n = nearest(h, es);
    const a = n ? Math.atan2(n.y - h.y, n.x - h.x) : h.facing;
    at(h.x + Math.cos(a) * max, h.y + Math.sin(a) * max);
  };

  if (kind === 'dash') {
    if (aim) {
      const a = Math.atan2(aim.y, aim.x);
      const e = snap(s, h, es, a, DASH.max, true);
      if (e) at(e.x, e.y, e.id);
      else {
        const len = DASH.min + (DASH.max - DASH.min) * Math.min(1, Math.hypot(aim.x, aim.y));
        at(h.x + Math.cos(a) * len, h.y + Math.sin(a) * len);
      }
    } else {
      let best: Enemy | null = null;
      let bs = 0;
      for (const e of es) {
        const d = Math.hypot(e.x - h.x, e.y - h.y);
        if (d > DASH.max || !lineOfSight(s.arena, h.x, h.y, e.x, e.y)) continue;
        // Ties go to the nearer threat.
        const sc = dashScore(h, es, Math.atan2(e.y - h.y, e.x - h.x), dashLen(d)) - d / 10000;
        if (sc > bs) {
          bs = sc;
          best = e;
        }
      }
      if (best) at(best.x, best.y, best.id);
      else fallback(DASH.max);
    }
    plan.dist = plan.locked >= 0 ? dashLen(plan.dist) : plan.dist;
    return plan;
  }

  if (kind === 'leap') {
    if (aim) {
      const a = Math.atan2(aim.y, aim.x);
      const e = snap(s, h, es, a, LEAP.max, false);
      if (e) at(e.x, e.y, e.id);
      else {
        const len = 80 + 230 * Math.min(1, Math.hypot(aim.x, aim.y));
        at(h.x + Math.cos(a) * len, h.y + Math.sin(a) * len);
      }
    } else {
      let bs = -1;
      for (const e of es) {
        if (Math.hypot(e.x - h.x, e.y - h.y) > LEAP.max + LEAP.r) continue;
        const g = groupAt(es, e, LEAP.r);
        const c = clampTo(h, g.x, g.y, LEAP.max);
        const sc = around(es, c.x, c.y, LEAP.r) - Math.hypot(c.x - h.x, c.y - h.y) / 10000;
        if (sc > bs) {
          bs = sc;
          at(c.x, c.y, e.id);
        }
      }
      if (bs < 0) fallback(LEAP.max);
    }
    const a = s.arena;
    plan.x = Math.max(T * 1.5, Math.min((a.w - 1.5) * T, plan.x));
    plan.y = Math.max(T * 1.5, Math.min((a.h - 1.5) * T, plan.y));
    return plan;
  }

  if (kind === 'slam') {
    // Slam where you stand unless a hop reaches more of them.
    let bs = around(es, h.x, h.y, SLAM.r) + 0.001;
    at(h.x, h.y);
    for (const e of es) {
      if (Math.hypot(e.x - h.x, e.y - h.y) > SLAM.look || !lineOfSight(s.arena, h.x, h.y, e.x, e.y)) continue;
      const g = groupAt(es, e, SLAM.r);
      const c = clampTo(h, g.x, g.y, SLAM.hop);
      const sc = around(es, c.x, c.y, SLAM.r);
      if (sc > bs) {
        bs = sc;
        at(c.x, c.y, e.id);
      }
    }
    return plan;
  }

  // turret
  const range = h.guns[h.active].gun.range;
  let bs = -1;
  for (const e of es) {
    if (Math.hypot(e.x - h.x, e.y - h.y) > range || !lineOfSight(s.arena, h.x, h.y, e.x, e.y)) continue;
    const g = groupAt(es, e, 100);
    const sc = around(es, g.x, g.y, 100) - Math.hypot(e.x - h.x, e.y - h.y) / 10000;
    if (sc > bs) {
      bs = sc;
      at(g.x, g.y, e.id);
    }
  }
  if (bs < 0) fallback(TURRET.ahead);
  return plan;
}

export function doSuper(s: SimState, h: Hero, plan: SuperPlan): void {
  s.sounds.push('super');
  const N = superNums(h);
  if (plan.locked >= 0 || h.def.super !== 'slam') effect(s, 'target', plan.x, plan.y, h.def.super === 'leap' ? N.leap.r : 30, '#ffd23c', 0.5);
  switch (h.def.super) {
    case 'dash': {
      const len = plan.dist;
      h.dash = { t: len / DASH.speed, dx: Math.cos(plan.angle), dy: Math.sin(plan.angle), hit: [], sx: h.x, sy: h.y };
      h.invuln = len / DASH.speed + 0.2;
      break;
    }
    case 'leap':
      h.leap = { sx: h.x, sy: h.y, tx: plan.x, ty: plan.y, t: 0, dur: 0.6, lift: 60, then: 'stomp' };
      break;
    case 'slam':
      if (plan.dist > 8) {
        h.leap = { sx: h.x, sy: h.y, tx: plan.x, ty: plan.y, t: 0, dur: 0.22, lift: 22, then: 'slam' };
        h.invuln = 0.3;
      } else slam(s, h);
      break;
    case 'turret': {
      // At most `cap` turrets stand at once: the oldest packs up for a new one.
      const mine = s.turrets.filter((t) => t.owner === h.index);
      while (mine.length >= N.turret.cap) {
        const old = mine.shift()!;
        retireTurret(s, old);
        old.life = 0;
      }
      s.turrets = s.turrets.filter((t) => t.life > 0);
      const x = h.x + Math.cos(plan.angle) * TURRET.ahead;
      const y = h.y + Math.sin(plan.angle) * TURRET.ahead;
      const p = freeSpot(s.arena, x, y, 10);
      s.turrets.push({ id: newId(s), owner: h.index, x: p.x, y: p.y, held: hold(h.guns[h.active].gun), life: N.turret.life, facing: plan.angle });
      effect(s, 'ring', p.x, p.y, 40, '#e8c95a', 0.4);
      break;
    }
  }
}

/** A turret going: a puff, and at the top level a blast. Called when it runs out or is replaced; the caller drops it from the list. */
export function retireTurret(s: SimState, tu: Turret): void {
  const h = s.heroes[tu.owner];
  if (h && superNums(h).turret.burst) explode(s, tu.x, tu.y, 90, 110 * scale(s), 0, tu.owner, 380, '#ffc060', false);
  else effect(s, 'puff', tu.x, tu.y, 18, '#c0c0c8', 0.5);
}

function slam(s: SimState, h: Hero, mul = 1, rMul = 1): void {
  const N = superNums(h).slam;
  const r = N.r * rMul;
  explode(s, h.x, h.y, r, N.dmg * mul * scale(s), 0, h.index, 700, '#ffd8a0', false);
  if (N.stun) for (const e of s.enemies) if (!e.dead && !e.boss && Math.hypot(e.x - h.x, e.y - h.y) < r + e.r) e.stun = Math.max(e.stun, 0.8);
  effect(s, 'ring', h.x, h.y, r * 1.25, '#ffe0b0', 0.5);
  if (mul >= 1) {
    h.shield = N.shield;
    if (N.aftershock) h.aftershock = 0.45;
  }
  s.shake = 0.45;
}

/** The Anvil's top level: the second slam, wider and half as hard. */
export function aftershock(s: SimState, h: Hero): void {
  if (!h.alive) return;
  slam(s, h, 0.5, 1.3);
  s.sounds.push('stomp');
}

/** The stomp at the end of a leap, and at the top level the bounce to the next group. */
function stomp(s: SimState, h: Hero, second: boolean): void {
  const N = superNums(h).leap;
  explode(s, h.x, h.y, N.r, N.dmg * (second ? 0.5 : 1) * scale(s), 0, h.index, 620, '#d8e8ff', false);
  if (N.safe > 0) h.invuln = Math.max(h.invuln, N.safe);
  if (N.slow) for (const e of s.enemies) if (!e.dead && Math.hypot(e.x - h.x, e.y - h.y) < N.r + e.r) e.slow = Math.max(e.slow, 2.5);
  effect(s, 'ring', h.x, h.y, N.r * 1.2, '#ffffff', 0.4);
  s.shake = 0.4;
  s.sounds.push('stomp');
  if (N.bounce && !second) {
    // On to the next group within reach, if there is one not under your feet.
    const es = live(s).filter((e) => Math.hypot(e.x - h.x, e.y - h.y) > N.r * 0.5);
    let bs = 0;
    let to: { x: number; y: number } | null = null;
    for (const e of es) {
      if (Math.hypot(e.x - h.x, e.y - h.y) > 220) continue;
      const g = groupAt(es, e, N.r);
      const sc = around(es, g.x, g.y, N.r);
      if (sc > bs) {
        bs = sc;
        to = g;
      }
    }
    if (to) {
      h.leap = { sx: h.x, sy: h.y, tx: to.x, ty: to.y, t: 0, dur: 0.42, lift: 40, then: 'stomp2' };
      h.invuln = Math.max(h.invuln, 0.5);
    }
  }
}

/** A super in flight owns the body. Returns true while it does. */
export function flySuper(s: SimState, h: Hero, dt: number): boolean {
  if (h.leap) {
    const L = h.leap;
    L.t += dt;
    const f = Math.min(1, L.t / L.dur);
    h.x = L.sx + (L.tx - L.sx) * f;
    h.y = L.sy + (L.ty - L.sy) * f;
    if (f < 1) return true;
    h.leap = null;
    const p = freeSpot(s.arena, h.x, h.y, h.r);
    h.x = p.x;
    h.y = p.y;
    if (L.then === 'slam') slam(s, h);
    else stomp(s, h, L.then === 'stomp2');
    return true;
  }
  if (h.dash) {
    const N = superNums(h).dash;
    const D = h.dash;
    const step = Math.min(D.t, dt);
    D.t -= dt;
    const before = { x: h.x, y: h.y };
    moveCircle(s.arena, h, h.r, D.dx * DASH.speed * step, D.dy * DASH.speed * step);
    effect(s, 'dash', before.x, before.y, 14, 'rgba(40,40,44,0.7)', 0.5, h.x, h.y);
    for (const e of s.enemies) {
      if (e.dead || D.hit.includes(e.id)) continue;
      if (Math.hypot(e.x - h.x, e.y - h.y) < e.r + h.r + N.width) {
        D.hit.push(e.id);
        hurtEnemy(s, e, N.dmg * scale(s), { owner: h.index, element: 'none', legend: null, x: h.x, y: h.y, kb: 300, proc: false, charge: false });
      }
    }
    if (D.t <= 0) {
      h.dash = null;
      // The soot bursts out where the dash ends: a hit, then a cloud that blinds.
      explode(s, h.x, h.y, N.burstR, N.burstDmg * scale(s), 0, h.index, 260, '#4a4a52', false);
      s.zones.push({ id: newId(s), kind: 'soot', team: 0, owner: h.index, x: h.x, y: h.y, r: N.cloudR, dps: 0, life: N.cloudLife, maxLife: N.cloudLife });
      if (N.trail) {
        // The top level: the whole run stays in soot, and the burst slows.
        const len = Math.hypot(h.x - D.sx, h.y - D.sy);
        for (let d = 50; d < len - 40; d += 60) {
          s.zones.push({ id: newId(s), kind: 'soot', team: 0, owner: h.index, x: D.sx + D.dx * d, y: D.sy + D.dy * d, r: 55, dps: 0, life: N.cloudLife, maxLife: N.cloudLife });
        }
        for (const e of s.enemies) if (!e.dead && Math.hypot(e.x - h.x, e.y - h.y) < N.burstR + e.r) e.slow = Math.max(e.slow, 2);
      }
    }
    return true;
  }
  return false;
}
