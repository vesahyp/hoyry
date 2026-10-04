import { useEffect, useRef, useState } from 'react';
import { newRun, step, DT, nextFloor } from '../game/sim';
import type { SimState } from '../game/state';
import type { HeroDef } from '../game/content/heroes';
import { COG_BY_ID, type CogDef } from '../game/content/cogs';
import { BOSSES } from '../game/content/enemies';
import { rollCogs, applyCog } from '../game/upgrades';
import { maxAmmo } from '../game/weapons';
import { RARITY_COLOR, TYPE_NAME } from '../game/guns';
import type { Gun } from '../game/types';
import { Renderer } from '../render/renderer';
import { InputController } from '../input/input';
import { audio } from '../audio';
import { Rng } from '../game/rng';
import { botInput, botPickCog, humanPickCog, BOT, HUMAN } from '../../tools/autoplayer';
import { practiceRun } from '../../tools/build';
import { track } from '../records';
import { t, tr, num } from '../i18n';
import { CogCard, GunCard } from './Cards';
import { UpdateBanner } from './Update';

export interface RunSummary {
  hero: HeroDef;
  floor: number;
  time: number;
  kills: number;
  coins: number;
  bosses: number;
  guns: Gun[];
  bestRarity: number;
  /** the floor a ?floor=N run started on (not a record), 0 for a real run */
  practice: number;
}

interface Hud {
  floor: number;
  coins: number;
  kills: number;
  boss: { name: string; hp: number; max: number } | null;
  banner: { text: string; sub: string; color?: string } | null;
  toast: { text: string; color: string } | null;
  guns: { gun: Gun; ammo: number; max: number; active: boolean; blink: boolean }[];
  superCharge: number;
  superName: string;
  near: Gun | null;
  enemies: number;
  phase: SimState['phase'];
}

type Overlay = { kind: 'none' } | { kind: 'cogs'; offers: CogDef[]; left: number } | { kind: 'pause' };

export function Game({ heroes, seed, onEnd, onQuit, onRestart }: { heroes: HeroDef[]; seed: number; onEnd: (r: RunSummary) => void; onQuit: () => void; onRestart: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const superRef = useRef<HTMLDivElement>(null);
  const moveStickRef = useRef<HTMLDivElement>(null);
  const aimStickRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<SimState | null>(null);
  const inputRef = useRef<InputController | null>(null);
  const overlayRef = useRef<Overlay>({ kind: 'none' });
  const [overlay, setOverlayState] = useState<Overlay>({ kind: 'none' });
  const [hud, setHud] = useState<Hud | null>(null);
  const [muted, setMuted] = useState(audio.muted);
  const endedRef = useRef(false);

  const setOverlay = (o: Overlay) => {
    overlayRef.current = o;
    setOverlayState(o);
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const root = rootRef.current!;
    // ?floor=N starts on that floor with the build a run has by then
    // (tools/build.ts), for playing the hard floors without the easy ones
    // first. Such a run is practice: it goes on no leaderboard.
    const asked = Number(new URLSearchParams(location.search).get('floor'));
    const practice = Number.isInteger(asked) && asked >= 2 && asked <= 40 ? asked : 0;
    const s = practice ? practiceRun(seed, heroes, asked) : newRun(seed, heroes);
    simRef.current = s;
    (window as unknown as { __sim: SimState }).__sim = s;
    const renderer = new Renderer(canvas);
    s.view = renderer.view();
    const input = new InputController();
    input.attach(root);
    inputRef.current = input;
    track('run_start', { hero: heroes.map((h) => h.id).join('+'), seed, practice });
    audio.unlock();
    audio.startMusic();

    let wake: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (window.top === window) nav.wakeLock?.request('screen').then((l) => (wake = l)).catch(() => undefined);

    const layoutSuper = () => {
      const el = superRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      input.superBtn = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
    };
    const onResize = () => {
      renderer.resize();
      s.view = renderer.view();
      layoutSuper();
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    layoutSuper();

    // ?bot=1 is the bot, ?bot=human the bot with a person's limits (tools/autoplayer.ts).
    const params = new URLSearchParams(location.search);
    const botKind = params.get('bot');
    const bot = botKind === '1' || botKind === 'human';
    const who = botKind === 'human' ? HUMAN : BOT;
    const pickCog = botKind === 'human' ? humanPickCog : botPickCog;
    const speed = Math.max(1, Number(params.get('speed') ?? 1));
    const botRng = new Rng(seed ^ 0x5151);
    const perf = { frames: 0, ms: 0, worst: 0 };
    (window as unknown as { __perf: typeof perf }).__perf = perf;

    let reported = false;
    const report = (how: 'death' | 'quit' | 'closed') => {
      if (reported || s.time < 1) return;
      reported = true;
      const h = s.heroes[0];
      track('run_end', {
        hero: heroes.map((x) => x.id).join('+'),
        how,
        practice,
        floor: s.floor,
        time: Math.round(s.time),
        kills: s.run.kills,
        coins: s.run.coins,
        guns: h.guns.map((g) => `${g.gun.type}:${g.gun.maker}:${g.gun.rarity}${g.gun.legend ? ':' + g.gun.legend : ''}`).join(','),
        cogs: Object.entries(h.cogs)
          .map(([k, v]) => `${k}:${v}`)
          .join(','),
      });
    };
    const onPageHide = () => report('closed');
    window.addEventListener('pagehide', onPageHide);

    const publishHud = () => {
      const h = s.heroes[0];
      const boss = s.enemies.find((e) => e.boss);
      const near = h.near !== null ? (s.drops.find((d) => d.id === h.near)?.gun ?? null) : null;
      setHud({
        floor: s.floor,
        coins: s.run.coins,
        kills: s.run.kills,
        boss: boss ? { name: t(BOSSES[(s.floor / 5 - 1) % BOSSES.length].name), hp: boss.hp, max: boss.maxHp } : null,
        banner: s.banner ? { text: s.banner.text, sub: s.banner.sub, color: s.banner.color } : null,
        toast: s.toast ? { text: s.toast.text, color: s.toast.color } : null,
        guns: h.guns.map((g, i) => ({ gun: g.gun, ammo: g.ammo, max: maxAmmo(g, h), active: i === h.active, blink: ammoBlinkT[i] > 0 })),
        superCharge: h.superCharge,
        superName: t(h.def.superName),
        near,
        enemies: s.enemies.length + s.marks.length,
        phase: s.phase,
      });
    };

    let last = performance.now();
    let acc = 0;
    let hudAcc = 0;
    let deathAcc = 0;
    let raf = 0;
    let pauseKey = false;
    // Hit feel: all view-side, read off the sim state rather than changed
    // in it. A brief freeze (skipped sim steps, never a slowed dt) on a big
    // moment, and a once-per-emptied blink on the active gun's ammo.
    let hitStop = 0;
    let ammoBlinkT = [0, 0];
    let prevEnemies = new Map<number, { big: boolean }>();
    let gunsTaken = s.run.guns;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const ov = overlayRef.current;
      const pk = input.pressed('escape') || input.pressed('p');
      if (pk && !pauseKey) {
        if (ov.kind === 'none') setOverlay({ kind: 'pause' });
        else if (ov.kind === 'pause') setOverlay({ kind: 'none' });
      }
      pauseKey = pk;
      const t0 = performance.now();
      if (renderer.needsResize()) onResize();
      const h0 = s.heroes[0];
      // The mouse aims relative to where the hero is drawn.
      input.heroScreen = renderer.toScreen(h0.x, h0.y);
      input.range = h0.guns[h0.active].gun.range * h0.stats.rangeMul;
      input.slots = { active: h0.active, count: h0.guns.length };
      hitStop = Math.max(0, hitStop - dt);
      ammoBlinkT = ammoBlinkT.map((t) => Math.max(0, t - dt));
      if (ov.kind === 'none' && !s.gameOver && hitStop <= 0) {
        acc += dt * speed;
        let n = 0;
        while (acc >= DT && n < 4 * speed) {
          const hpBefore = h0.hp;
          const ammoBefore = h0.guns.map((g) => g.ammo);
          step(s, s.heroes.map((h) => (bot ? botInput(s, h, botRng, who) : input.read())), DT);
          acc -= DT;
          n++;
          // Hit stop: a kill of an elite or boss, or a hit that costs the
          // hero over a fifth of max hp.
          if (h0.alive && hpBefore - h0.hp > h0.stats.maxHp * 0.2) hitStop = Math.max(hitStop, 0.05);
          const curIds = new Set(s.enemies.map((e) => e.id));
          for (const [id, info] of prevEnemies) {
            if (!curIds.has(id) && info.big) hitStop = Math.max(hitStop, 0.055);
          }
          prevEnemies = new Map(s.enemies.map((e) => [e.id, { big: e.boss || e.elite.length > 0 }]));
          // A heavy gun firing: a short camera kick away from the shot.
          // Ammo going empty: a once-only blink on its segments and pip.
          for (let i = 0; i < Math.min(ammoBefore.length, h0.guns.length); i++) {
            const held = h0.guns[i];
            if (ammoBefore[i] > held.ammo) {
              const g = held.gun;
              if (g.maker === 'paukku' || g.type === 'mortar' || g.type === 'rifle') renderer.kick(h0.facing);
            }
            if (ammoBefore[i] >= 1 && held.ammo < 1) ammoBlinkT[i] = 0.5;
          }
          if (s.phase === 'done') {
            if (bot) {
              for (let k = 0; k < s.pendingCogs; k++) applyCog(h0, pickCog(rollCogs(s, h0), botRng).id);
              s.pendingCogs = 0;
              nextFloor(s);
            } else {
              setOverlay({ kind: 'cogs', offers: rollCogs(s, h0), left: s.pendingCogs });
              break;
            }
          }
        }
        if (acc > DT * 4 * speed) acc = 0;
      } else if (s.gameOver) {
        step(s, [], dt);
        deathAcc += dt;
        if (deathAcc > 1.8 && !endedRef.current) {
          endedRef.current = true;
          report('death');
          onEnd({ hero: heroes[0], floor: s.floor, time: s.time, kills: s.run.kills, coins: s.run.coins, bosses: s.run.bosses, guns: h0.guns.map((g) => g.gun), bestRarity: s.run.bestRarity, practice });
        }
      }
      // A gun taken: the card flies into the slot it went to. The card is
      // still in the DOM here, since React only drops it on the next HUD.
      if (s.run.guns !== gunsTaken) {
        gunsTaken = s.run.guns;
        flyToSlot(root, h0.active);
      }
      if (s.sounds.length) {
        for (const name of s.sounds) audio.play(name);
        s.sounds.length = 0;
      }
      audio.intensity = s.bossFloor ? 1 : Math.min(1, s.enemies.length / 25);
      renderer.ammoBlink = ammoBlinkT[h0.active] > 0;
      renderer.render(s, ov.kind === 'none' && hitStop <= 0 ? dt : 0, h0);
      drawSticks(input, moveStickRef.current, aimStickRef.current);
      const ms = performance.now() - t0;
      perf.frames++;
      perf.ms += ms;
      if (ms > perf.worst) perf.worst = ms;
      hudAcc += dt;
      if (hudAcc > 0.08) {
        hudAcc = 0;
        publishHud();
      }
    };
    raf = requestAnimationFrame(frame);

    const onVis = () => {
      if (document.visibilityState === 'hidden' && overlayRef.current.kind === 'none' && !s.gameOver) setOverlay({ kind: 'pause' });
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      report('quit');
      cancelAnimationFrame(raf);
      input.detach(root);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVis);
      audio.stopMusic();
      void wake?.release().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickCog = (c: CogDef) => {
    const s = simRef.current!;
    const h = s.heroes[0];
    applyCog(h, c.id);
    audio.play('cog');
    s.pendingCogs--;
    if (s.pendingCogs > 0) setOverlay({ kind: 'cogs', offers: rollCogs(s, h), left: s.pendingCogs });
    else {
      nextFloor(s);
      setOverlay({ kind: 'none' });
    }
  };

  const s = simRef.current;
  const h0 = s?.heroes[0];
  const active = hud?.guns.find((g) => g.active)?.gun;
  const other = hud && hud.guns.length > 1 ? hud.guns.find((g) => !g.active) : undefined;

  return (
    <div className="game" ref={rootRef}>
      <canvas ref={canvasRef} />
      {hud && (
        <div className="hud">
          <div className="hudtop">
            <div className="floor">
              {tr('Kerros', 'Floor')} <b>{hud.floor}</b>
            </div>
            <div className="counts">
              <span className="coins">⚙ {num(hud.coins)}</span>
              <span className="kills">☠ {num(hud.kills)}</span>
              {hud.phase === 'fight' && hud.enemies > 0 && (
                <span className={`left ${hud.enemies <= 3 ? 'urgent' : ''}`}>{tr(`${hud.enemies} jäljellä`, `${hud.enemies} left`)}</span>
              )}
            </div>
          </div>
          {hud.boss && (
            <div className="bossbar">
              <div className="name">{hud.boss.name}</div>
              <div className="bar">
                <div style={{ width: `${(100 * Math.max(0, hud.boss.hp)) / hud.boss.max}%` }} />
              </div>
            </div>
          )}
        </div>
      )}
      {/* own element, not inside .hud: .hud shrinks to its content height, so a
          banner positioned by percentage inside it would sit near the top and
          overlap the floor counter and gun slots instead of sitting mid-screen */}
      {hud?.banner && (
        <div className="banner" key={hud.banner.text + hud.banner.sub}>
          <div className="t" style={hud.banner.color ? { color: hud.banner.color } : undefined}>
            {hud.banner.text}
          </div>
          <div className="s">{hud.banner.sub}</div>
        </div>
      )}
      {/* A rare drop landing: its own short toast, clear of the centre
          banner above and the pickup card below. */}
      {hud?.toast && (
        <div className="toast" key={hud.toast.text}>
          <span style={{ color: hud.toast.color }}>{hud.toast.text}</span>
        </div>
      )}
      <button className="iconbtn pause" data-ui onClick={() => setOverlay({ kind: 'pause' })} aria-label={tr('Tauko', 'Pause')}>
        ❚❚
      </button>
      <button
        className="iconbtn mute"
        data-ui
        onClick={() => {
          audio.setMuted(!muted);
          setMuted(!muted);
        }}
        aria-label={tr('Äänet', 'Sound')}
      >
        {muted ? '🔇' : '🔊'}
      </button>

      {/* the gun slots: tap to swap */}
      {hud && (
        <div className="slots" data-ui>
          {hud.guns.map((g, i) => (
            <button key={i} className={`slot ${g.active ? 'on' : ''}`} style={{ borderColor: RARITY_COLOR[g.gun.rarity] }} onClick={() => !g.active && inputRef.current?.swap()}>
              <div className="sname" style={{ color: RARITY_COLOR[g.gun.rarity] }}>
                {t(g.gun.name)}
              </div>
              <div className={`pips ${g.blink ? 'blink' : ''}`}>
                {Array.from({ length: g.max }, (_, k) => (
                  <i key={k} className={k < Math.floor(g.ammo) ? 'full' : ''} />
                ))}
              </div>
            </button>
          ))}
          {hud.guns.length < 2 && <div className="slot empty">{tr('Tyhjä paikka', 'Empty slot')}</div>}
        </div>
      )}

      {/* A gun on the floor under you: top centre, under the HUD, clear of
          both thumbs in portrait and landscape. Only the Take button is
          data-ui; the card itself lets a touch through to the sticks, since
          nothing else on it responds to one. */}
      {hud?.near && (
        <div className="pickup">
          <GunCard g={hud.near} vs={active} compact />
          <button className="btn primary take" data-ui onClick={() => inputRef.current?.take()}>
            {hud.guns.length < 2 ? tr('Ota', 'Take') : tr('Vaihda tähän', 'Swap for this')} <small>E</small>
          </button>
        </div>
      )}

      {/* The swap button: beside the super, under the right thumb, so a swap
          mid-fight never means letting go of the move stick. It shows the gun
          you swap to. Pointer down, not click: it acts on the touch itself.
          Mounted from the start and hidden until a second gun is held: the
          first draw of the ⇄ glyph looks up a fallback font, which held one
          frame for over 100 ms, and it fell on the frame you took the gun. */}
      <button
        className={`swapbtn ${other ? '' : 'off'}`}
        data-ui
        style={other ? { borderColor: RARITY_COLOR[other.gun.rarity] } : undefined}
        onPointerDown={(e) => {
          e.preventDefault();
          if (other) inputRef.current?.swap();
        }}
        aria-hidden={!other}
        aria-label={other ? tr(`Vaihda: ${t(other.gun.name)}`, `Swap to ${t(other.gun.name)}`) : undefined}
      >
        <span>⇄</span>
        {other && (
          <>
            <small style={{ color: RARITY_COLOR[other.gun.rarity] }}>{t(TYPE_NAME[other.gun.type])}</small>
            <div className="pips">
              {Array.from({ length: other.max }, (_, k) => (
                <i key={k} className={k < Math.floor(other.ammo) ? 'full' : ''} />
              ))}
            </div>
          </>
        )}
      </button>

      {/* the super button; touches on it are read by the input, not React */}
      <div ref={superRef} className={`superbtn ${hud && hud.superCharge >= 1 ? 'ready' : ''}`} style={{ ['--charge' as string]: `${Math.round((hud?.superCharge ?? 0) * 100)}%` }}>
        <span>★</span>
        <small>{hud?.superName}</small>
      </div>
      <div className="stick" ref={moveStickRef}>
        <div />
      </div>
      <div className="stick aim" ref={aimStickRef}>
        <div />
      </div>

      {overlay.kind === 'cogs' && h0 && (
        <div className="overlay" data-ui>
          <h2>{tr('Hissi nousee. Valitse ratas.', 'The lift rises. Pick a cog.')}</h2>
          {overlay.left > 1 && <p className="small">{tr(`Pomo kaatui: ${overlay.left} valintaa.`, `The boss fell: ${overlay.left} picks.`)}</p>}
          <div className="cards">
            {overlay.offers.map((c) => (
              <CogCard key={c.id} c={c} level={h0.cogs[c.id] ?? 0} onPick={() => pickCog(c)} />
            ))}
          </div>
          <OwnedCogs cogs={h0.cogs} />
        </div>
      )}
      {overlay.kind === 'pause' && h0 && (
        <div className="overlay" data-ui>
          <h2>{tr('Tauko', 'Paused')}</h2>
          <div className="pauseguns">
            {h0.guns.map((g, i) => (
              <GunCard key={i} g={g.gun} />
            ))}
          </div>
          <OwnedCogs cogs={h0.cogs} />
          <div className="row pausebar">
            <button className="btn primary" onClick={() => setOverlay({ kind: 'none' })}>
              {tr('Jatka', 'Resume')}
            </button>
            <button className="btn" onClick={onRestart}>
              {tr('Alusta', 'Restart')}
            </button>
            <button className="btn ghost" onClick={onQuit}>
              {tr('Lopeta', 'Quit')}
            </button>
          </div>
          <p className="help">
            {tr(
              'Vasen peukalo kävelee. Oikea peukalo: napauta niin ase ampuu lähintä, vedä niin näet suunnan ja ammut kun nostat. Tähti on supervoima: se latautuu osumista, ja napautus tähtää sen itse. ⇄ tähden vieressä vaihtaa asetta. Näppäimistöllä WASD, hiiri tähtää ja ampuu, välilyönti on supervoima, Q, hiiren rulla tai 1 ja 2 vaihtavat asetta, E ottaa aseen maasta.',
              'Left thumb walks. Right thumb: tap and the gun fires at the nearest enemy, drag to see the line and fire when you lift. The star is your super: hits charge it, and a tap aims it for you. The ⇄ beside it swaps guns. On a keyboard WASD walks, the mouse aims and fires, space is the super, Q, the scroll wheel or 1 and 2 swap guns, E takes a gun from the floor.',
            )}
          </p>
        </div>
      )}
      {overlay.kind === 'none' && <UpdateBanner />}
    </div>
  );
}

function OwnedCogs({ cogs }: { cogs: Record<string, number> }) {
  const list = Object.entries(cogs);
  if (!list.length) return null;
  return (
    <div className="owned">
      {list.map(([id, n]) => (
        <span key={id} title={t(COG_BY_ID[id].name)}>
          {COG_BY_ID[id].icon}
          <b>{n}</b>
        </span>
      ))}
    </div>
  );
}

function drawSticks(input: InputController, move: HTMLDivElement | null, aim: HTMLDivElement | null): void {
  for (const [st, el] of [
    [input.move, move],
    [input.aim, aim],
  ] as const) {
    if (!el) continue;
    if (!st.active || (st === input.aim && !st.dragged)) {
      el.style.display = 'none';
      continue;
    }
    el.style.display = 'block';
    el.style.left = `${st.cx}px`;
    el.style.top = `${st.cy}px`;
    const dx = st.x - st.cx;
    const dy = st.y - st.cy;
    const d = Math.hypot(dx, dy);
    const m = Math.min(d, input.radius);
    const k = d > 0 ? m / d : 0;
    (el.firstChild as HTMLDivElement).style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
  }
}

/**
 * The taken gun's card flies from where it sat into slot `index` and
 * shrinks to the slot's width. Screen space only, start to end, so it never
 * hops between the world and the HUD. The Web Animations API runs it on
 * time, not frames: the same 0.42 s at 60 Hz or 120 Hz, and a dropped frame
 * skips ahead instead of stalling. Ease-in-out with no overshoot: the card
 * leaves its place from rest and comes to rest on the slot, so neither end
 * has a sudden change of speed.
 */
function flyToSlot(root: HTMLElement, index: number): void {
  const card = root.querySelector<HTMLElement>('.pickup .gun');
  const slot = root.querySelectorAll<HTMLElement>('.slots .slot')[index];
  if (!card || !slot) return;
  const from = card.getBoundingClientRect();
  const to = slot.getBoundingClientRect();
  const home = root.getBoundingClientRect();
  const fly = card.cloneNode(true) as HTMLElement;
  fly.classList.add('flygun');
  Object.assign(fly.style, { left: `${from.left - home.left}px`, top: `${from.top - home.top}px`, width: `${from.width}px` });
  root.appendChild(fly);
  const k = to.width / from.width;
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  fly
    .animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${k})`, opacity: 0 },
      ],
      { duration: 420, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' },
    )
    .finished.then(() => fly.remove(), () => fly.remove());
}
