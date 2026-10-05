import { L, type Text } from '../../i18n';
import type { GunType, Zone } from '../types';

/**
 * The thrown guns: a lob, like the mortar's, that leaves something on the
 * ground where it lands instead of a blast. The gun's `pool` is the
 * radius (guns.ts rolls it, a Wide part grows it, the hero's blast cogs
 * scale it); what the pool does is here, and the sim reads it where the
 * pool lives: `land` and `updateZones` in weapons.ts. Pool damage is a
 * share of the gun's damage per second, so rarity, level and the hero's
 * cogs scale it like any shot, and an element rides on every tick: a
 * Kipinä tar flask leaves burning tar, cold tar or live tar.
 */
export interface ThrownDef {
  zone: Zone['kind'];
  /** seconds the pool lasts */
  life: number;
  /** damage per second to anything in it, as a share of the gun's damage */
  dps: number;
  /** the pool lands at this share of its full size and grows to it over the first part of its life; 1 lands full */
  start: number;
  /** the sound when it lands (audio.ts) */
  land: string;
  rule: Text;
}

export const THROWN: Partial<Record<GunType, ThrownDef>> = {
  tar: {
    zone: 'tar',
    life: 4.5,
    dps: 0.3,
    start: 1,
    land: 'splat',
    rule: L('Jättää tervalammikon: viholliset tahmaantuvat siihen ja kärsivät vähän.', 'Leaves a tar pool: enemies in it crawl and take a little damage.'),
  },
  dust: {
    zone: 'dust',
    life: 3.2,
    dps: 0.9,
    start: 1,
    land: 'poof',
    rule: L('Pöllähtää hiilipölypilveksi: se tukahduttaa ja sokaisee kaiken sisällään.', 'Bursts into a coal-dust cloud: it chokes and blinds whatever stands in it.'),
  },
  canister: {
    zone: 'vent',
    life: 3,
    dps: 1.1,
    start: 0.45,
    land: 'vent',
    rule: L('Suhisee ja kasvaa höyrypilveksi, joka polttaa ja työntää.', 'Hisses and grows into a cloud of steam that scalds and shoves.'),
  },
};

/** How big a pool is right now: a canister's cloud grows over the first 60 % of its life, the others land full. */
export function poolRadius(z: Zone): number {
  const start = z.kind === 'vent' ? THROWN.canister!.start : 1;
  if (start >= 1) return z.r;
  const grown = Math.min(1, (z.maxLife - z.life) / (z.maxLife * 0.6));
  return z.r * (start + (1 - start) * grown);
}
