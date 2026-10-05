// Screenshots of the in-run UI on an emulated iPhone, portrait and
// landscape, into shots/ui/<orientation>/: the gun slots and the swap
// button with guns of several levels, the pickup card against a held gun,
// and each hero's super aim locked on a pack. For looking at, not a check:
// nothing here fails. Run with `make ui-shots`; needs `make shots-setup`.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const port = 5197;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();

const HEROES = [
  { id: 'nuohooja', button: /The Sweep/ },
  { id: 'konemestari', button: /The Engineer/ },
  { id: 'ilmalaivuri', button: /The Aeronaut/ },
  { id: 'seppa', button: /The Smith/ },
];

/** Three enemies in a pack `dist` px from the hero at `angle`, on cleared floor (as in super-check). */
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
  const es = s.enemies.filter((e) => !e.dead && !e.boss).slice(0, 3);
  const offs = [[0, 0], [22, 18], [22, -18]];
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
  s.heroes[0].superCharge = 1;
};

/** Two guns in hand at the given levels (a copy of the held gun for the second), and the enemies out of the way. */
const GUNS = ({ a, b }) => {
  const s = window.__sim;
  const h = s.heroes[0];
  h.invuln = 1e6;
  for (const e of s.enemies) { e.x = 40; e.y = 40; e.speed = 0; }
  const g2 = structuredClone(h.guns[0].gun);
  g2.id += 1000 + b;
  g2.level = b;
  h.guns[0].gun.level = a;
  h.guns.length = 1;
  h.guns.push({ gun: g2, ammo: g2.ammo, refill: 0, lock: 0, burstLeft: 0, burstTimer: 0, burstAngle: 0, burstReach: 1, shots: 0 });
  h.active = 0;
};

/** A gun of level `lvl` on the floor under the hero. */
const DROP = (lvl) => {
  const s = window.__sim;
  const h = s.heroes[0];
  const g = structuredClone(h.guns[0].gun);
  g.id += 5000 + lvl;
  g.level = lvl;
  s.drops = s.drops.filter((d) => d.kind !== 'gun');
  s.drops.push({ id: 90000 + lvl, kind: 'gun', x: h.x + 10, y: h.y, vx: 0, vy: 0, value: 0, gun: g, age: 1, pull: false });
};

const start = async (page, button) => {
  await page.goto(`http://localhost:${port}/?lang=en&seed=3`);
  await page.getByRole('button', { name: 'Play', exact: true }).tap();
  await page.getByRole('button', { name: button }).tap();
  await page.waitForFunction(() => window.__sim && window.__sim.enemies.filter((e) => !e.dead && e.age > 0.5).length >= 3, null, { timeout: 15000 });
};

try {
  for (const [orient, size] of [['portrait', null], ['landscape', { width: 844, height: 390 }]]) {
    const dir = `shots/ui/${orient}`;
    mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ ...devices['iPhone 15'], hasTouch: true });
    const page = await ctx.newPage();
    if (size) await page.setViewportSize(size);

    // The slots at several levels, and a pickup card above and below the held gun.
    await start(page, /The Sweep/);
    for (const [a, b] of [[1, 2], [4, 9], [12, 27]]) {
      await page.evaluate(GUNS, { a, b });
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${dir}/slots-${a}-${b}.png` });
    }
    await page.evaluate(DROP, 15);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${dir}/pickup-up.png` });
    await page.evaluate(DROP, 6);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${dir}/pickup-down.png` });
    // A fresh pickup mid-pop, a tenth of a second after the take.
    await page.locator('.pickup .take').tap();
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${dir}/pickup-pop.png` });

    // Each hero's super aim, locked on a pack to the right.
    for (const hero of HEROES) {
      await start(page, hero.button);
      await page.evaluate(PACK, { dist: 150, angle: orient === 'portrait' ? -0.9 : -0.3 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/aim-${hero.id}.png` });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
