import { T, distanceField, flowDir, lineOfSight, openDir } from '../src/game/arena';
import { gunScore, isLob } from '../src/game/guns';
import type { CogDef } from '../src/game/content/cogs';
import type { Rng } from '../src/game/rng';
import { NO_INPUT, type Hero, type HeroInput, type SimState } from '../src/game/state';
import { DT } from '../src/game/sim';

/**
 * The bot: kites at the gun's range, sidesteps bullets coming at it, steps
 * out of a charge lane, fires at whatever is nearest, takes a gun when it
 * scores better, and walks to the lift. It is a floor for balance, not a
 * player: no plan, no use of bushes, no saving the super.
 *
 * A `Player` profile puts a person's limits on it. BOT is the floor: it
 * sees every bullet the step it leaves the gun and moves the stick in one
 * step. HUMAN is a thumb on a phone: a quarter second before a new bullet
 * or a windup registers, a stick that eases toward where it is going, a
 * tap rate, and an aim a little off the target on every tap. The proof
 * that a floor is beatable (npm run gauntlet) is run with HUMAN.
 */
export interface Player {
  /** seconds before a new bullet or a windup is noticed */
  reaction: number;
  /** the move stick eases toward its wish with this time constant, seconds */
  thumb: number;
  /** taps a second on the fire side, at most */
  taps: number;
  /** aim error on a drag, radians either way; 0 taps without dragging (auto-aim) */
  aim: number;
}
export const BOT: Player = { reaction: 0, thumb: 0, taps: Infinity, aim: 0 };
export const HUMAN: Player = { reaction: 0.25, thumb: 0.12, taps: 4, aim: 0.1 };

interface Mem {
  /** when each enemy bullet, and each windup or charge (by -enemy id), was first seen */
  seen: Map<number, number>;
  mx: number;
  my: number;
  lastTap: number;
}
const mems = new WeakMap<SimState, Map<number, Mem>>();
function memOf(s: SimState, h: Hero): Mem {
  let m = mems.get(s);
  if (!m) {
    m = new Map();
    mems.set(s, m);
  }
  let mem = m.get(h.index);
  if (!mem) {
    mem = { seen: new Map(), mx: 0, my: 0, lastTap: -1 };
    m.set(h.index, mem);
  }
  return mem;
}

/** True once `who` has had its reaction time since the thing keyed `id` was first seen. */
function noticed(mem: Mem, s: SimState, who: Player, id: number): boolean {
  if (who.reaction <= 0) return true;
  let t0 = mem.seen.get(id);
  if (t0 === undefined) {
    t0 = s.time;
    mem.seen.set(id, t0);
  }
  return s.time - t0 >= who.reaction;
}

const fields = new WeakMap<object, Map<number, Int16Array>>();

/** A direction toward (x, y) along walkable ground, fields cached per arena and goal tile. */
function walkTo(s: SimState, h: Hero, x: number, y: number): { dx: number; dy: number } {
  const a = s.arena;
  const key = Math.floor(y / T) * a.w + Math.floor(x / T);
  let m = fields.get(a);
  if (!m) {
    m = new Map();
    fields.set(a, m);
  }
  let f = m.get(key);
  if (!f) {
    f = distanceField(a, [{ x, y }]);
    m.set(key, f);
  }
  const d = Math.hypot(x - h.x, y - h.y) || 1;
  if (d < T) return { dx: (x - h.x) / d, dy: (y - h.y) / d };
  return flowDir(a, h.x, h.y, f) ?? { dx: (x - h.x) / d, dy: (y - h.y) / d };
}

export function botInput(s: SimState, h: Hero, rng: Rng, who: Player = BOT): HeroInput {
  const inp: HeroInput = { ...NO_INPUT };
  if (!h.alive) return inp;
  const held = h.guns[h.active];
  const g = held.gun;
  const mem = memOf(s, h);
  if (mem.seen.size > 300) {
    const live = new Set<number>();
    for (const p of s.projectiles) live.add(p.id);
    for (const e of s.enemies) live.add(-e.id);
    for (const k of mem.seen.keys()) if (!live.has(k)) mem.seen.delete(k);
  }
  let mx = 0;
  let my = 0;

  // Nearest enemy.
  let tgt = null as SimState['enemies'][number] | null;
  let td = Infinity;
  for (const e of s.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - h.x, e.y - h.y);
    if (d < td) {
      td = d;
      tgt = e;
    }
  }

  // A better gun on the floor nearby: go and take it.
  let want: SimState['drops'][number] | null = null;
  let wd = s.phase === 'fight' ? 140 : 900;
  for (const d of s.drops) {
    if (d.kind !== 'gun' || !d.gun) continue;
    const dd = Math.hypot(d.x - h.x, d.y - h.y);
    const worst = h.guns.length < 2 ? 0 : Math.min(...h.guns.map((x) => gunScore(x.gun)));
    if (dd < wd && gunScore(d.gun) > worst * 1.08) {
      wd = dd;
      want = d;
    }
  }
  if (want && h.near === want.id) {
    // Replace the weaker gun: make it active first.
    if (h.guns.length === 2) {
      const weak = gunScore(h.guns[0].gun) <= gunScore(h.guns[1].gun) ? 0 : 1;
      if (h.active !== weak) inp.swap = true;
      else inp.take = true;
    } else inp.take = true;
  }

  const range = g.range * h.stats.rangeMul;
  // The last enemies on a floor: a player who sees "1 left" and the edge
  // arrow goes and finishes it instead of holding its usual kiting range.
  const straggler = s.wavesLeft === 0 && s.enemies.length <= 3;
  if (tgt && s.phase === 'fight') {
    const pref = g.type === 'lance' || g.type === 'scatter' ? range * 0.55 : range * 0.7;
    const dx = (tgt.x - h.x) / td;
    const dy = (tgt.y - h.y) / td;
    const sees = lineOfSight(s.arena, h.x, h.y, tgt.x, tgt.y);
    if (!sees) {
      // No line of sight: always path round whatever blocks it, however
      // close the target reads on the straight line. Gating this on a
      // minimum distance used to let the bot settle into a blind orbit
      // right at the edge of its kiting band, next to a wall it never
      // walked around (a boss floor with gunners behind a pillar, seen on
      // seed 1047 with seppa, was the one that stalled 8 seeds in).
      const f = walkTo(s, h, tgt.x, tgt.y);
      mx = f.dx;
      my = f.dy;
    } else if (straggler) {
      // Close in, and do not hold the usual kiting range: a safe distance
      // is for a fight with more enemies due. Against the last one,
      // retreating from a melee straggler that out-runs the hero (a cog
      // rat, seed 1025 with ilmalaivuri) just traded blind chase for blind
      // flight, forever. Only back off from point-blank (a gunner the bot
      // walked fully on top of, seed 1022 with nuohooja, could otherwise
      // stand muzzle-to-chest with the hero and neither side ever resolve
      // the fight).
      if (td > 40) {
        mx = dx;
        my = dy;
      } else if (td < 20) {
        mx = -dx;
        my = -dy;
      }
    } else if (td > pref + 30) {
      mx = dx;
      my = dy;
    } else if (td < pref - 30) {
      mx = -dx;
      my = -dy;
    }
    // Circle a little, always (but not while closing on the last enemies:
    // the drift is what used to leave a straggler fight never quite closing).
    if (!straggler) {
      mx += -dy * 0.6;
      my += dx * 0.6;
    }
    // A boss walking into you costs a touch every 0.7 s: keep off its body.
    if (tgt.boss && td < tgt.r + h.r + 50) {
      mx -= dx * 2;
      my -= dy * 2;
    }
    if (td < range * 1.1 && (sees || isLob(g.type))) inp.fire = true;
    if (h.superCharge >= 1 && td < 220) inp.superFire = true;
  } else if (want) {
    const f = walkTo(s, h, want.x, want.y);
    mx = f.dx;
    my = f.dy;
  } else if (s.phase === 'clear') {
    const f = walkTo(s, h, s.arena.liftX, s.arena.liftY);
    mx = f.dx;
    my = f.dy;
  }

  // A charge coming: a brute or a boss winding up draws its lane toward
  // the hero, then runs it. Step out of the lane, sideways.
  for (const e of s.enemies) {
    if (e.dead) continue;
    const charging = e.mode === 'charge';
    const winding = e.mode === 'windup' && (e.behaviour === 'brute' || e.boss);
    if (!charging && !winding) {
      mem.seen.delete(-e.id);
      continue;
    }
    if (!noticed(mem, s, who, -e.id)) continue;
    const rx = h.x - e.x;
    const ry = h.y - e.y;
    const d = Math.hypot(rx, ry) || 1;
    const ux = charging ? e.cx : rx / d;
    const uy = charging ? e.cy : ry / d;
    const along = rx * ux + ry * uy;
    const across = rx * uy - ry * ux;
    if (along < -10 || along > 340) continue;
    if (Math.abs(across) > e.r + h.r + 24) continue;
    const side = across >= 0 ? 1 : -1;
    mx += uy * side * 3;
    my += -ux * side * 3;
  }

  // Dodge: the most threatening enemy shot within reach, step across its line.
  for (const p of s.projectiles) {
    if (p.team !== 1) continue;
    if (!noticed(mem, s, who, p.id)) continue;
    if (p.lob) {
      const d = Math.hypot(p.lob.tx - h.x, p.lob.ty - h.y);
      if (d < p.blast + 14) {
        mx += (h.x - p.lob.tx) / (d || 1) * 2;
        my += (h.y - p.lob.ty) / (d || 1) * 2;
      }
      continue;
    }
    const rx = h.x - p.x;
    const ry = h.y - p.y;
    const d = Math.hypot(rx, ry);
    if (d > 140) continue;
    const sp = Math.hypot(p.vx, p.vy) || 1;
    const along = (rx * p.vx + ry * p.vy) / sp;
    if (along < 0) continue;
    const across = (rx * p.vy - ry * p.vx) / sp;
    if (Math.abs(across) > h.r + p.r + 10) continue;
    const side = across >= 0 ? 1 : -1;
    mx += (p.vy / sp) * side * 2.5;
    my += (-p.vx / sp) * side * 2.5;
  }

  // Do not walk into walls: try turning the wish.
  const m = Math.hypot(mx, my);
  if (m > 0.01) {
    const o = openDir(s.arena, h.x, h.y, h.r, mx / m, my / m);
    inp.mx = o.dx;
    inp.my = o.dy;
  }
  // A thumb does not move the stick in one step.
  if (who.thumb > 0) {
    const k = Math.min(1, DT / who.thumb);
    mem.mx += (inp.mx - mem.mx) * k;
    mem.my += (inp.my - mem.my) * k;
    inp.mx = mem.mx;
    inp.my = mem.my;
  }
  // A tap rate, and a drag that lands a little off the target.
  if (inp.fire && who.taps < Infinity) {
    if (s.time - mem.lastTap < 1 / who.taps) inp.fire = false;
    else {
      mem.lastTap = s.time + rng.range(-0.04, 0.04);
      if (who.aim > 0 && tgt && !isLob(g.type)) {
        const a = Math.atan2(tgt.y - h.y, tgt.x - h.x) + rng.range(-who.aim, who.aim);
        inp.aimX = Math.cos(a);
        inp.aimY = Math.sin(a);
      }
    }
  }

  // Swap to the other gun when this one is dry and the other is not.
  if (!inp.swap && !inp.take && h.guns.length === 2 && held.ammo < 1 && h.guns[1 - h.active].ammo >= 2 && rng.chance(0.2)) inp.swap = true;
  return inp;
}

export function botPickCog(offers: CogDef[], rng: Rng): CogDef {
  return offers[Math.floor(rng.next() * offers.length)];
}

/** What a player who wants to live picks: health, armour and speed first, then the gun. */
const HUMAN_COGS = ['elinvoima', 'panssari', 'saappaat', 'lataus', 'kattila', 'imu', 'tahtain', 'vaali', 'ylipaine', 'tuli', 'pakkanen', 'lapaisy', 'kimmoke', 'ruumis', 'monipiippu', 'varaaja', 'tesla', 'sirpaleet', 'magneetti', 'kulta', 'vaihde', 'jalkipolte'];
export function humanPickCog(offers: CogDef[], rng: Rng): CogDef {
  const ranked = [...offers].sort((a, b) => HUMAN_COGS.indexOf(a.id) - HUMAN_COGS.indexOf(b.id));
  // Mostly the best of the three, sometimes the second: nobody reads every card.
  return ranked[rng.chance(0.8) ? 0 : Math.min(1, ranked.length - 1)];
}
