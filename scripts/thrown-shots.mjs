// The thrown guns on an emulated iPhone, into shots/thrown/: for each of
// the tar flask, the dust bomb and the steam canister, the hero throws
// one at a pack, and two shots follow: the moment it lands, and the pool
// a second and a half later. Common and a Kipinä roll (an element in the
// pool). For looking at, not a check. Run with `make thrown-shots`.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const port = 5196;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();
mkdirSync('shots/thrown', { recursive: true });

/** Four enemies in a loose pack `dist` px from the hero at `angle`, tough and still, on cleared floor. */
const PACK = ({ dist, angle }) => {
  const s = window.__sim;
  const h = s.heroes[0];
  h.invuln = 1e6;
  const a = s.arena;
  for (let ty = 1; ty < a.h - 1; ty++) {
    for (let tx = 1; tx < a.w - 1; tx++) {
      if (Math.hypot((tx + 0.5) * 32 - h.x, (ty + 0.5) * 32 - h.y) < 9 * 32) a.tiles[ty * a.w + tx] = 0;
    }
  }
  const es = s.enemies.filter((e) => !e.dead && !e.boss).slice(0, 4);
  const offs = [[0, 0], [26, 22], [30, -20], [-24, 26]];
  es.forEach((e, i) => {
    const [ox, oy] = offs[i];
    e.x = h.x + Math.cos(angle) * (dist + ox) - Math.sin(angle) * oy;
    e.y = h.y + Math.sin(angle) * (dist + ox) + Math.cos(angle) * oy;
    e.hp = e.maxHp = 1e5;
    e.speed = 0;
    e.kx = e.ky = 0;
  });
  for (const e of s.enemies) if (!es.includes(e)) { e.x = 64; e.y = 64; e.speed = 0; }
  s.marks.length = 0;
  s.wavesLeft = 0;
};

try {
  for (const [orient, size] of [['portrait', null], ['landscape', { width: 844, height: 390 }]]) {
    for (const type of ['tar', 'dust', 'canister']) {
      for (const [tag, maker] of orient === 'portrait' ? [['', null], ['-kipina', 'kipina']] : [['', null]]) {
        const ctx = await browser.newContext({ ...devices['iPhone 15'], hasTouch: true });
        const page = await ctx.newPage();
        if (size) await page.setViewportSize(size);
        await page.goto(`http://localhost:${port}/?lang=en&seed=3`);
        await page.getByRole('button', { name: 'Play', exact: true }).tap();
        await page.getByRole('button', { name: /The Sweep/ }).tap();
        await page.waitForFunction(() => window.__sim && window.__sim.enemies.filter((e) => !e.dead && e.age > 0.5).length >= 4, null, { timeout: 15000 });
        await page.evaluate(PACK, { dist: 170, angle: orient === 'portrait' ? -0.7 : -0.25 });
        await page.evaluate(({ type, maker }) => {
          window.__give(type, 2);
          const g = window.__sim.heroes[0].guns[window.__sim.heroes[0].active].gun;
          // The maker and element by hand: the plain shot is plain, the Kipinä shot carries the element it is about.
          if (maker) { g.maker = maker; g.element = type === 'tar' ? 'fire' : type === 'dust' ? 'shock' : 'frost'; }
          else { g.maker = 'paukku'; g.element = 'none'; g.name = { fi: 'Paukku-' + g.name.fi.split('-').pop(), en: 'Paukku ' + g.name.en.split(' ').slice(-2).join(' ') }; }
        }, { type, maker });
        await page.waitForTimeout(300);
        // One tap on the right half: the gun fires at the nearest enemy.
        const vp = page.viewportSize();
        await page.touchscreen.tap(vp.width * 0.72, vp.height * 0.62);
        await page.waitForFunction(() => window.__sim.zones.some((z) => z.kind === 'tar' || z.kind === 'dust' || z.kind === 'vent'), null, { timeout: 4000 });
        await page.waitForTimeout(150);
        await page.screenshot({ path: `shots/thrown/${orient}-${type}${tag}-land.png` });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `shots/thrown/${orient}-${type}${tag}-pool.png` });
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
  server.kill();
}
