// A gun pickup on an emulated iPhone moves smoothly, frame by frame.
// Puts a gun on the floor under the hero, records the pickup card and the
// card flying into its slot on every animation frame (position, width,
// opacity, transform, frame time), taps Take, and fails when:
//   - the card or the flying card jumps: the change in its speed from one
//     frame to the next, scaled to a 60 Hz frame, is over MAX_JUMP px. An
//     easing never does that at this size; a snap, a restart or a reflow
//     always does. Speed is per millisecond, so a long frame (reported, not
//     failed) does not look like a jump when the motion is on time.
//   - the flight does not start where the card sat or end on the slot
// Two pickups: into the empty second slot, then a swap for the held gun.
// Run with `make pickup-check` (part of `make check`); needs `make shots-setup`.
// LOG=1 prints every frame.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';

const MAX_JUMP = 4;
const port = 5199;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};

/** Worst change of speed between frames, in px per 60 Hz frame, of a track of {t, x, y}. */
const worstJump = (track) => {
  let worst = 0;
  for (let i = 1; i < track.length - 1; i++) {
    const [a, b, c] = [track[i - 1], track[i], track[i + 1]];
    const v1 = [(b.x - a.x) / (b.t - a.t), (b.y - a.y) / (b.t - a.t)];
    const v2 = [(c.x - b.x) / (c.t - b.t), (c.y - b.y) / (c.t - b.t)];
    worst = Math.max(worst, Math.hypot(v2[0] - v1[0], v2[1] - v1[1]) * (1000 / 60));
  }
  return worst;
};

/** The unbroken runs of frames on which `key` is on screen. */
const runs = (log, key) => {
  const out = [];
  let cur = null;
  for (const r of log) {
    if (r[key]) (cur ??= out[out.push([]) - 1]).push({ t: r.t, ...r[key] });
    else cur = null;
  }
  return out;
};

try {
  const page = await (await browser.newContext({ ...devices['iPhone 15'], hasTouch: true })).newPage();
  await page.goto(`http://localhost:${port}/?lang=en&seed=3`);
  await page.getByRole('button', { name: 'Play', exact: true }).tap();
  await page.getByRole('button', { name: /The Sweep/ }).tap();
  await page.waitForFunction(() => window.__sim && window.__sim.heroes[0].guns.length === 1);
  await page.waitForSelector('.slots .slot.empty');
  await page.evaluate(() => {
    const s = window.__sim;
    s.heroes[0].invuln = 1e6;
    window.__log = [];
    let last = performance.now();
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, op: +cs.opacity, tf: cs.transform };
    };
    const f = (now) => {
      // Enemies stay out of the way so the hero stands still on the drop.
      for (const e of s.enemies) { e.x = 40; e.y = 40; e.speed = 0; }
      window.__log.push({ t: now, dt: now - last, card: rect(document.querySelector('.pickup .gun')), fly: rect(document.querySelector('.flygun')) });
      last = now;
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });

  for (const [n, what] of [[0, 'into the empty slot'], [1, 'a swap for the held gun']]) {
    const slotAt = await page.evaluate((n) => {
      const s = window.__sim;
      const h = s.heroes[0];
      s.drops = s.drops.filter((d) => d.kind !== 'gun');
      s.drops.push({ id: 90000 + n, kind: 'gun', x: h.x + 10, y: h.y, vx: 0, vy: 0, value: 0, gun: structuredClone(h.guns[0].gun), age: 1, pull: false });
      window.__log.length = 0;
      const i = h.guns.length < 2 ? 1 : h.active;
      const r = document.querySelectorAll('.slots .slot')[i].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, n);
    await page.waitForTimeout(600);
    await page.locator('.pickup .take').tap();
    await page.waitForTimeout(700);
    const log = await page.evaluate(() => window.__log);
    if (process.env.LOG === '1') {
      const t0 = log[0].t;
      for (const r of log) {
        const c = r.card ? `card ${r.card.x.toFixed(1)},${r.card.y.toFixed(1)} op=${r.card.op.toFixed(2)} ${r.card.tf}` : 'card -';
        const f = r.fly ? `fly ${r.fly.x.toFixed(1)},${r.fly.y.toFixed(1)} w=${r.fly.w.toFixed(0)} op=${r.fly.op.toFixed(2)}` : '';
        console.log(`${(r.t - t0).toFixed(0).padStart(5)} dt=${r.dt.toFixed(1).padStart(5)} ${c} ${f}`);
      }
    }
    // The first run of the card is the one taken; on a swap the held gun's
    // card comes back as a second run, which must slide in smoothly too.
    const cards = runs(log, 'card');
    const card = cards[0] ?? [];
    const fly = runs(log, 'fly')[0] ?? [];
    for (const [k, c] of cards.entries()) {
      const j = worstJump(c);
      check(c.length > 10 && j <= MAX_JUMP, `${what}: the ${k ? 'returned' : 'offered'} card slides in without a jump (worst ${j.toFixed(1)} px over ${c.length} frames)`);
    }
    const fj = worstJump(fly);
    check(fly.length > 10 && fj <= MAX_JUMP, `${what}: the card flies without a jump (worst ${fj.toFixed(1)} px over ${fly.length} frames)`);
    const lastCard = card[card.length - 1];
    const start = fly[0];
    check(!!start && Math.hypot(start.x - lastCard.x, start.y - lastCard.y) <= MAX_JUMP, `${what}: the flight starts where the card sat`);
    // The last recorded frame is up to one frame short of the end.
    const end = fly[fly.length - 1];
    check(!!end && Math.hypot(end.x - slotAt.x, end.y - slotAt.y) <= 12 && end.op < 0.15, `${what}: the flight ends on the slot, faded out`);
    const dts = log.slice(1).map((r) => r.dt);
    console.log(`      frame times: worst ${Math.max(...dts).toFixed(1)} ms, ${dts.filter((d) => d > 25).length} of ${dts.length} over 25 ms`);
  }
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
