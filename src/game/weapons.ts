import { solidShot, tileAt, idxAt } from './arena';
import { cogLevel, damageTile, effect, explode, hurtEnemy, hurtHero, killEnemy, newId } from './combat';
import type { Hero, SimState } from './state';
import type { Gun, Held, Projectile, Team } from './types';
import { isLob } from './guns';
import { poolRadius, THROWN } from './content/thrown';

/**
 * Firing and flight, shared by heroes, enemies and turrets. A shooter is
 * whatever holds the gun; it differs only in team, the damage multiplier
 * and `slow`, which is how enemy bullets are made big and slow enough to
 * dodge without a second code path.
 */
export interface Shooter {
  x: number;
  y: number;
  team: Team;
  /** hero index, or -1 */
  owner: number;
  dmgMul: number;
  /** bullet speed multiplier; enemies fire at about half speed */
  slow: number;
  hero: Hero | null;
}

/**
 * A clockwork (Kellosepät) shot in an enemy hand is fair only as long as a
 * sidestep beats it. In your hand it turns at the gun's full rate; from an
 * enemy it turns at most this fast (radians a second: at enemy bullet speed
 * that is a turning circle wider than the hero's dodge), it flies straight
 * for the last stretch (ENEMY_HOMING_OFF, px), it drops when its range is
 * spent like any bullet, and your own shots break it in the air.
 */
export const ENEMY_HOMING = 1.4;
export const ENEMY_HOMING_OFF = 72;
/** The fastest an enemy bullet flies, px/s: a rifle's would otherwise cross a kiting distance in half a second. */
export const ENEMY_SHOT_MAX = 360;
/** An enemy's explosive shot has a smaller blast: the sidestep that beats the bullet has to beat the blast too. */
export const ENEMY_BLAST_MUL = 0.75;

export function maxAmmo(held: Held, hero: Hero | null): number {
  return held.gun.ammo + (hero ? hero.stats.extraAmmo : 0);
}

/** Refill and timers, every step, for every held gun (the one in the hand and the other). */
export function tickHeld(held: Held, dt: number, hero: Hero | null, inHand: boolean): void {
  held.lock -= dt;
  const max = maxAmmo(held, hero);
  if (held.ammo < max) {
    // The gun in the other hand reloads at half speed: swapping is a choice.
    const rate = (inHand ? 1 : 0.5) / (held.gun.reload * (hero ? hero.stats.reloadMul : 1));
    held.refill += dt * rate;
    if (held.refill >= 1) {
      held.refill = 0;
      held.ammo = Math.min(max, held.ammo + 1);
    }
  } else held.refill = 0;
}

/** Start an attack if the gun is ready. `reach` (0..1) sets where a lob lands. */
export function tryAttack(s: SimState, sh: Shooter, held: Held, angle: number, reach: number): boolean {
  const hero = sh.hero;
  const free = hero !== null && hero.afterburn > 0;
  if (held.lock > 0 || held.burstLeft > 0) return false;
  if (held.ammo < 1 && !free) return false;
  const full = held.ammo >= maxAmmo(held, hero);
  if (!free) held.ammo -= 1;
  const g = held.gun;
  held.lock = g.lockout + (g.burst - 1) * g.burstGap;
  held.burstLeft = g.burst;
  held.burstTimer = 0;
  held.burstAngle = angle;
  held.burstReach = Math.max(0.2, Math.min(1, reach));
  (held as Held & { over?: boolean }).over = full && cogLevel(hero ?? undefined, 'ylipaine') > 0;
  fireBursts(s, sh, held, 0);
  // Heittola: the empty gun is thrown and a fresh one appears.
  if (g.maker === 'heittola' && held.ammo < 1 && !free) {
    throwGun(s, sh, held, angle);
    held.ammo = maxAmmo(held, hero);
    held.lock = Math.max(held.lock, 0.45);
  }
  return true;
}

/** Fire the shots of a burst that are due. Call every step. */
export function fireBursts(s: SimState, sh: Shooter, held: Held, dt: number): void {
  if (held.burstLeft <= 0) return;
  held.burstTimer -= dt;
  while (held.burstLeft > 0 && held.burstTimer <= 0) {
    emitShot(s, sh, held, held.burstAngle, held.burstReach);
    held.burstLeft--;
    held.burstTimer += held.gun.burstGap;
  }
}

function emitShot(s: SimState, sh: Shooter, held: Held, angle: number, reach: number): void {
  const g = held.gun;
  const hero = sh.hero;
  const st = hero?.stats;
  held.shots++;
  const count = g.count + (st ? st.count : 0);
  let dmg = g.damage * sh.dmgMul * (st ? st.dmgMul : 1);
  if (hero) dmg *= Math.pow(0.9, cogLevel(hero, 'monipiippu'));
  if ((held as Held & { over?: boolean }).over) {
    dmg *= 1 + 0.5 * cogLevel(hero ?? undefined, 'ylipaine');
    (held as Held & { over?: boolean }).over = false;
  }
  const range = g.range * (st ? st.rangeMul : 1);
  const enemy = sh.team === 1;
  const speed = Math.min(g.speed * (st ? st.bulletSpeedMul : 1) * sh.slow, enemy ? ENEMY_SHOT_MAX : Infinity);
  const size = enemy ? Math.max(7, g.size * 1.5) : g.size;
  const pierce = g.pierce + (st ? st.pierce : 0);
  const bounces = g.bounces + (st ? st.bounces : 0);
  const blast = g.blast * (st ? st.blastMul : 1) * (enemy ? ENEMY_BLAST_MUL : 1);
  const split = cogLevel(hero ?? undefined, 'sirpaleet') > 0;
  const mx = sh.x + Math.cos(angle) * 16;
  const my = sh.y + Math.sin(angle) * 16;
  effect(s, 'muzzle', mx, my, size * 2 + 6, enemy ? '#ff9060' : '#fff0b0', 0.08, mx + Math.cos(angle), my + Math.sin(angle));
  s.sounds.push(`shot_${g.type}`);
  if (hero) {
    hero.sinceFire = 0;
    hero.facing = angle;
  }

  // The cuckoo: every sixth shot from the Käkikello.
  if (g.legend === 'kakikello' && held.shots % 6 === 0) {
    const p = baseProjectile(s, sh, g, mx, my, angle, speed * 0.8, size * 2.4, dmg * 4, range * 2.5);
    p.homing = 6;
    p.pierce = 4;
    p.legend = 'cuckoo';
    s.projectiles.push(p);
    s.sounds.push('cuckoo');
    return;
  }

  for (let i = 0; i < count; i++) {
    const off = count > 1 ? g.spread * (i / (count - 1) - 0.5) : 0;
    const jitter = g.type === 'scatter' || g.type === 'lance' ? s.rng.range(-0.05, 0.05) : g.burst > 1 ? s.rng.range(-0.04, 0.04) : 0;
    const a = angle + off + jitter;
    if (isLob(g.type)) {
      const dist = Math.max(50, reach * range);
      // Multi-shell mortars land in a small spread around the aim point.
      let tx = sh.x + Math.cos(angle) * dist + (count > 1 ? Math.cos(a + Math.PI / 2) * off * 120 : 0);
      let ty = sh.y + Math.sin(angle) * dist + (count > 1 ? Math.sin(a + Math.PI / 2) * off * 120 : 0);
      // Clockwork in a lob: the shell steers onto an enemy near where it was going to land.
      if (g.homing > 0 && !enemy) {
        let bd = 70;
        for (const e of s.enemies) {
          const d = Math.hypot(e.x - tx, e.y - ty);
          if (!e.dead && d < bd) {
            bd = d;
            tx = e.x;
            ty = e.y;
          }
        }
      }
      const p = baseProjectile(s, sh, g, sh.x, sh.y, a, 0, size, dmg, 0);
      p.lob = { sx: sh.x, sy: sh.y, tx, ty, t: 0, dur: (0.5 + dist / 800) * (enemy ? 1.5 : 1) };
      p.blast = g.type === 'mortar' ? blast || 40 : blast;
      p.pool = g.pool * (st ? st.blastMul : 1);
      s.projectiles.push(p);
      continue;
    }
    const sp = g.type === 'lance' ? speed * s.rng.range(0.85, 1.1) : speed;
    const p = baseProjectile(s, sh, g, mx, my, a, sp, size, dmg, range * (g.type === 'lance' ? s.rng.range(0.8, 1.05) : 1));
    if (enemy && p.homing > 0) {
      p.homing = Math.min(p.homing, ENEMY_HOMING);
      if (i === 0) s.sounds.push('tick');
    }
    p.pierce = pierce;
    p.bounces = bounces;
    p.blast = blast;
    p.split = split;
    s.projectiles.push(p);
  }
}

function baseProjectile(s: SimState, sh: Shooter, g: Gun, x: number, y: number, a: number, speed: number, r: number, damage: number, life: number): Projectile {
  return {
    id: newId(s),
    team: sh.team,
    owner: sh.owner,
    x,
    y,
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
    r,
    damage,
    life,
    pierce: 0,
    bounces: 0,
    blast: 0,
    element: g.element,
    homing: g.homing,
    hit: [],
    gunType: g.type,
    maker: g.maker,
    rarity: g.rarity,
    legend: g.legend,
    lob: null,
    pool: 0,
    spin: 0,
    split: false,
    dead: false,
  };
}

function throwGun(s: SimState, sh: Shooter, held: Held, angle: number): void {
  const g = held.gun;
  const dist = Math.min(g.range, 220);
  const p = baseProjectile(s, sh, g, sh.x, sh.y, angle, 0, 10, g.damage * g.count * g.burst * 1.3 * sh.dmgMul * (sh.hero ? sh.hero.stats.dmgMul : 1), 0);
  p.lob = { sx: sh.x, sy: sh.y, tx: sh.x + Math.cos(angle) * dist, ty: sh.y + Math.sin(angle) * dist, t: 0, dur: 0.55 };
  p.blast = 70;
  p.legend = 'thrown';
  p.gunType = g.type;
  s.projectiles.push(p);
  s.sounds.push('throw');
}

export function updateProjectiles(s: SimState, dt: number): void {
  const a = s.arena;
  const clockwork = s.projectiles.filter((p) => p.team === 1 && p.homing > 0 && !p.lob);
  for (const p of s.projectiles) {
    if (p.dead) continue;
    p.spin += dt * 14;
    if (p.lob) {
      const L = p.lob;
      L.t += dt;
      const f = Math.min(1, L.t / L.dur);
      p.x = L.sx + (L.tx - L.sx) * f;
      p.y = L.sy + (L.ty - L.sy) * f;
      if (f >= 1) {
        p.dead = true;
        land(s, p);
      }
      continue;
    }
    if (p.homing > 0) steer(s, p, dt);
    const sp = Math.hypot(p.vx, p.vy);
    // Steam slows as it spreads.
    if (p.gunType === 'lance') {
      p.vx *= 1 - 1.6 * dt;
      p.vy *= 1 - 1.6 * dt;
      p.r += dt * 14;
    }
    const nx = p.x + p.vx * dt;
    const ny = p.y + p.vy * dt;
    p.life -= sp * dt;
    if (solidShot(tileAt(a, nx, ny))) {
      if (p.bounces > 0) {
        p.bounces--;
        if (solidShot(tileAt(a, nx, p.y))) p.vx = -p.vx;
        if (solidShot(tileAt(a, p.x, ny))) p.vy = -p.vy;
        if (!solidShot(tileAt(a, nx, p.y)) && !solidShot(tileAt(a, p.x, ny))) {
          p.vx = -p.vx;
          p.vy = -p.vy;
        }
        p.hit.length = 0;
        effect(s, 'spark', p.x, p.y, 6, '#fff0b0', 0.15);
        s.sounds.push('ricochet');
        continue;
      }
      const i = idxAt(a, nx, ny);
      if (i >= 0) damageTile(s, i, p.damage, p.owner);
      impact(s, p, p.x, p.y);
      continue;
    }
    p.x = nx;
    p.y = ny;
    if (p.legend === 'veturi' && p.team === 0 && Math.floor((p.life + sp * dt) / 36) !== Math.floor(p.life / 36)) {
      // The burning track: one patch every 36 px, and a patch laid on a
      // patch still burning only refreshes it. The track used to stack
      // (patches 28 px apart at radius 22, and every shot laid a new set
      // over the last), which made standing on it worth three guns.
      const old = s.zones.find((z) => z.kind === 'fire' && z.team === 0 && z.r === 20 && Math.hypot(z.x - p.x, z.y - p.y) < 24);
      if (old) old.life = old.maxLife;
      else s.zones.push({ id: newId(s), kind: 'fire', team: 0, owner: p.owner, x: p.x, y: p.y, r: 20, dps: p.damage * 0.35, life: 2.5, maxLife: 2.5 });
    }
    if (p.life <= 0) {
      if (p.blast > 0) impact(s, p, p.x, p.y);
      p.dead = true;
      continue;
    }
    if (p.team === 0) {
      // A clockwork shot is a little machine: a hit breaks it, and the
      // bullet that broke it flies on.
      for (const c of clockwork) {
        if (c.dead) continue;
        const rr = c.r + p.r + 2;
        if ((c.x - p.x) ** 2 + (c.y - p.y) ** 2 > rr * rr) continue;
        c.dead = true;
        effect(s, 'spark', c.x, c.y, 12, '#e8c95a', 0.2);
        s.sounds.push('clink');
      }
      for (const e of s.enemies) {
        if (e.dead || e.age < 0.3) continue;
        const rr = e.r + p.r;
        if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 > rr * rr) continue;
        if (p.hit.includes(e.id)) continue;
        p.hit.push(e.id);
        if (p.blast > 0) {
          impact(s, p, p.x, p.y);
          break;
        }
        hurtEnemy(s, e, p.damage, { owner: p.owner, element: p.element, legend: p.legend, x: p.x - p.vx * 0.05, y: p.y - p.vy * 0.05, kb: p.gunType === 'scatter' ? 140 : p.gunType === 'rifle' ? 120 : 60, proc: true });
        effect(s, 'spark', p.x, p.y, 8, '#ffffff', 0.12);
        if (p.split) fragments(s, p);
        if (p.pierce > 0) p.pierce--;
        else {
          p.dead = true;
          break;
        }
      }
    } else {
      for (const h of s.heroes) {
        if (!h.alive) continue;
        // Granny's umbrella: a shield in front while the hero holds fire.
        const held = h.guns[h.active];
        if (held && held.gun.legend === 'sateenvarjo' && h.sinceFire > 0.6) {
          const dx = p.x - h.x;
          const dy = p.y - h.y;
          const d = Math.hypot(dx, dy);
          if (d < 34 && Math.cos(Math.atan2(dy, dx) - h.facing) > 0.45) {
            p.dead = true;
            effect(s, 'spark', p.x, p.y, 10, '#ff9a2a', 0.2);
            s.sounds.push('block');
            break;
          }
        }
        const rr = h.r + p.r * 0.8;
        if ((h.x - p.x) ** 2 + (h.y - p.y) ** 2 > rr * rr) continue;
        if (h.dash || h.leap) continue;
        if (p.blast > 0) {
          impact(s, p, p.x, p.y);
          break;
        }
        hurtHero(s, h, p.damage, p.x, p.y, 0, `${p.gunType}:${p.maker}`);
        p.dead = true;
        break;
      }
    }
  }
  s.projectiles = s.projectiles.filter((p) => !p.dead);
}

function steer(s: SimState, p: Projectile, dt: number): void {
  let tx = 0;
  let ty = 0;
  let bd = 260 * 260;
  let found = false;
  if (p.team === 0) {
    for (const e of s.enemies) {
      if (e.dead || p.hit.includes(e.id)) continue;
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d < bd) {
        bd = d;
        tx = e.x;
        ty = e.y;
        found = true;
      }
    }
  } else {
    for (const h of s.heroes) {
      if (!h.alive) continue;
      const d = (h.x - p.x) ** 2 + (h.y - p.y) ** 2;
      if (d < bd) {
        bd = d;
        tx = h.x;
        ty = h.y;
        found = true;
      }
    }
    // The last stretch is straight, so a late sidestep is a dodge.
    if (bd < ENEMY_HOMING_OFF * ENEMY_HOMING_OFF) return;
  }
  if (!found) return;
  const sp = Math.hypot(p.vx, p.vy);
  const cur = Math.atan2(p.vy, p.vx);
  const want = Math.atan2(ty - p.y, tx - p.x);
  let d = want - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const turn = Math.max(-p.homing * dt, Math.min(p.homing * dt, d));
  p.vx = Math.cos(cur + turn) * sp;
  p.vy = Math.sin(cur + turn) * sp;
}

function impact(s: SimState, p: Projectile, x: number, y: number): void {
  p.dead = true;
  if (p.blast > 0) {
    explode(s, x, y, p.blast, p.damage, p.team, p.owner, 240, p.element === 'frost' ? '#bfefff' : p.element === 'shock' ? '#8fe0ff' : '#ffb040', true, `${p.gunType}:${p.maker}:blast`);
    if (p.team === 0 && p.element !== 'none') {
      for (const e of s.enemies) if (!e.dead && Math.hypot(e.x - x, e.y - y) < p.blast) hurtEnemy(s, e, 1, { owner: p.owner, element: p.element, legend: null, x, y, kb: 0, proc: false });
    }
  } else effect(s, 'spark', x, y, 8, '#fff0b0', 0.15);
  if (p.split) fragments(s, p);
}

function land(s: SimState, p: Projectile): void {
  const x = p.x;
  const y = p.y;
  if (p.legend === 'thrown') {
    explode(s, x, y, p.blast, p.damage, p.team, p.owner, 300, '#9be36b');
    effect(s, 'debris', x, y, 30, '#9be36b', 0.6);
    if (p.owner >= 0) {
      const h = s.heroes[p.owner];
      if (h.guns[h.active]?.gun.legend === 'leipalapio') {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const f = baseProjectileAt(s, p, x, y, a, 380, 6, p.damage * 0.3, 260);
          f.bounces = 3;
          f.pierce = 1;
          s.projectiles.push(f);
        }
      }
    }
    return;
  }
  // A thrown gun's lob: a splash if it has one, then the pool (content/thrown.ts).
  const th = THROWN[p.gunType];
  if (th) {
    const color = POOL_COLOR[th.zone] ?? '#ffb040';
    if (p.blast > 0) explode(s, x, y, p.blast, p.damage, p.team, p.owner, 160, color, true, `${p.gunType}:${p.maker}:blast`);
    else effect(s, 'ring', x, y, p.pool * 0.5, color, 0.3);
    s.zones.push({ id: newId(s), kind: th.zone, team: p.team, owner: p.owner, x, y, r: p.pool, dps: p.damage * th.dps, life: th.life, maxLife: th.life, element: p.element, tick: 0 });
    s.sounds.push(th.land);
    return;
  }
  explode(s, x, y, p.blast, p.damage, p.team, p.owner, 220, p.team === 1 ? '#ff7050' : '#ffb040', true, `mortar:${p.maker}`);
  if (p.element === 'fire' || (p.team === 0 && p.maker === 'torpeedo' && p.legend === null && s.rng.chance(0.3))) {
    s.zones.push({ id: newId(s), kind: 'fire', team: p.team, owner: p.owner, x, y, r: p.blast * 0.8, dps: p.damage * 0.3, life: 3, maxLife: 3 });
  }
  if (p.legend === 'kiuas') {
    s.zones.push({ id: newId(s), kind: 'steam', team: 0, owner: p.owner, x, y, r: p.blast, dps: p.damage * 0.35, life: 3.5, maxLife: 3.5 });
  }
  if (p.team === 0 && p.element !== 'none') {
    for (const e of s.enemies) if (!e.dead && Math.hypot(e.x - x, e.y - y) < p.blast) hurtEnemy(s, e, 1, { owner: p.owner, element: p.element, legend: null, x, y, kb: 0, proc: false });
  }
}

function baseProjectileAt(s: SimState, from: Projectile, x: number, y: number, a: number, speed: number, r: number, damage: number, life: number): Projectile {
  return { ...from, id: newId(s), x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r, damage, life, pierce: 0, bounces: 0, blast: 0, hit: [], lob: null, split: false, dead: false, legend: null, homing: 0 };
}

function fragments(s: SimState, p: Projectile): void {
  const h = p.owner >= 0 ? s.heroes[p.owner] : undefined;
  const n = 2 * cogLevel(h, 'sirpaleet') + 1;
  const base = Math.atan2(p.vy, p.vx);
  for (let i = 0; i < n; i++) {
    const a = base + s.rng.range(-1.2, 1.2);
    const f = baseProjectileAt(s, p, p.x, p.y, a, 420, 3, p.damage * 0.3, 90);
    f.hit = [...p.hit];
    s.projectiles.push(f);
  }
}

const POOL_COLOR: Partial<Record<string, string>> = { tar: '#3a2a14', dust: '#505058', vent: '#e8f0f8' };

/** Ground effects: fire, soot, löyly, and the thrown guns' pools. */
export function updateZones(s: SimState, dt: number): void {
  for (const z of s.zones) {
    z.life -= dt;
    if (z.kind === 'soot') {
      for (const e of s.enemies) if (!e.dead && Math.hypot(e.x - z.x, e.y - z.y) < z.r) e.blind = 0.3;
      continue;
    }
    if ((z.kind === 'tar' || z.kind === 'dust' || z.kind === 'vent') && z.team === 0) {
      // A pool hurts in ticks through hurtEnemy, so its element and its
      // numbers show like any hit. Tar makes them wade, dust blinds, and
      // the steam shoves them outward a little with every tick.
      const r = poolRadius(z);
      z.tick = (z.tick ?? 0) + dt;
      const hit = z.tick >= 0.25;
      if (hit) z.tick -= 0.25;
      for (const e of s.enemies) {
        if (e.dead || Math.hypot(e.x - z.x, e.y - z.y) > r + e.r * 0.5) continue;
        if (z.kind === 'tar') e.tar = 0.25;
        if (z.kind === 'dust') e.blind = Math.max(e.blind, 0.4);
        if (hit) hurtEnemy(s, e, z.dps * 0.25, { owner: z.owner, element: z.element ?? 'none', legend: null, x: z.x, y: z.y, kb: z.kind === 'vent' ? 18 : 0, proc: false, charge: false });
      }
      continue;
    }
    if (z.team === 0) {
      for (const e of s.enemies) {
        if (e.dead || Math.hypot(e.x - z.x, e.y - z.y) > z.r + e.r) continue;
        e.hp -= z.dps * dt;
        s.run.damageDealt += z.dps * dt;
        if (e.hp <= 0) killEnemy(s, e, z.owner);
      }
      if (z.kind === 'steam' && z.owner >= 0) {
        const h = s.heroes[z.owner];
        if (h.alive && Math.hypot(h.x - z.x, h.y - z.y) < z.r) h.hp = Math.min(h.stats.maxHp, h.hp + 6 * dt);
      }
    } else {
      for (const h of s.heroes) {
        if (!h.alive || h.leap || Math.hypot(h.x - z.x, h.y - z.y) > z.r + h.r * 0.5) continue;
        if (h.invuln <= 0) {
          h.hp -= z.dps * dt * (1 - h.stats.armor);
          if (s.onHurt) s.onHurt(h, z.dps * dt * (1 - h.stats.armor), `zone:${z.kind}`);
          h.hurtFlash = Math.max(h.hurtFlash, 0.05);
          if (h.hp <= 0) hurtHero(s, h, 1, z.x, z.y);
        }
      }
    }
  }
  s.zones = s.zones.filter((z) => z.life > 0);
}
