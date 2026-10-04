// Every hero's super, tapped on an emulated iPhone in a fight, hits.
// For each hero: start a run, wait for the first wave, stand three of its
// enemies in a pack beside the hero (made tough so they live to be
// counted, the hero made safe so the run lasts), charge the super and tap
// the button with a finger. Before the tap the target marker must sit on
// the pack;
// after it, at least two of the pack must have lost health. The hero never
// fires its gun here (no aim touch), so every hit is the super's. The
// Sweep also gets a drag 20 degrees off the pack, which must snap to it.
// Run with `make super-check` (part of `make check`); needs `make shots-setup`.
// SHOTS=1 saves a screenshot of each marker into shots/supers/.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const port = 5198;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();
const shots = process.env.SHOTS === '1';
if (shots) mkdirSync('shots/supers', { recursive: true });
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};

const HEROES = [
  { id: 'nuohooja', button: /The Sweep/, wait: 900 },
  { id: 'konemestari', button: /The Engineer/, wait: 3000 },
  { id: 'ilmalaivuri', button: /The Aeronaut/, wait: 1200 },
  { id: 'seppa', button: /The Smith/, wait: 1000 },
];

/** Three enemies in a pack `dist` px from the hero at `angle`, on cleared floor. Returns their ids. */
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
  // The rest of the floor stays away from the check.
  for (const e of s.enemies) if (!es.includes(e)) { e.x = 64; e.y = 64; e.speed = 0; }
  s.marks.length = 0;
  s.wavesLeft = 0;
  return es.map((e) => e.id);
};

const hpOf = (ids) => {
  const s = window.__sim;
  return ids.map((id) => s.enemies.find((e) => e.id === id)?.hp ?? 0);
};

try {
  for (const hero of HEROES) {
    const page = await (await browser.newContext({ ...devices['iPhone 15'], hasTouch: true })).newPage();
    await page.goto(`http://localhost:${port}/?lang=en&seed=3`);
    await page.getByRole('button', { name: 'Play', exact: true }).tap();
    await page.getByRole('button', { name: hero.button }).tap();
    await page.waitForFunction(() => window.__sim && window.__sim.enemies.filter((e) => !e.dead && e.age > 0.5).length >= 3, null, { timeout: 15000 });

    const ids = await page.evaluate(PACK, { dist: 140, angle: 0 });
    await page.evaluate(() => (window.__sim.heroes[0].superCharge = 1));
    await page.waitForTimeout(200);
    const plan = await page.evaluate((ids) => {
      const s = window.__sim;
      const p = s.heroes[0].superPlan;
      const es = s.enemies.filter((e) => ids.includes(e.id));
      const cx = es.reduce((a, e) => a + e.x, 0) / es.length;
      const cy = es.reduce((a, e) => a + e.y, 0) / es.length;
      return { ...p, off: Math.hypot(p.x - cx, p.y - cy) };
    }, ids);
    check(plan.on && plan.locked >= 0 && plan.off < 40, `${hero.id}: the marker is on the pack before the tap (${Math.round(plan.off)} px off its centre)`);
    if (shots) await page.screenshot({ path: `shots/supers/${hero.id}.png` });

    const before = await page.evaluate(hpOf, ids);
    const box = await page.locator('.superbtn').boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(hero.wait);
    const after = await page.evaluate(hpOf, ids);
    const hits = before.filter((hp, i) => after[i] < hp).length;
    check(hits >= 2, `${hero.id}: a tap on the super hits the pack (${hits} of 3)`);

    if (hero.id === 'nuohooja') {
      // A drag 20 degrees off the pack, the other way round the hero.
      await page.waitForTimeout(600);
      const ids2 = await page.evaluate(PACK, { dist: 140, angle: Math.PI });
      await page.evaluate(() => (window.__sim.heroes[0].superCharge = 1));
      await page.waitForTimeout(100);
      const b2 = await page.evaluate(hpOf, ids2);
      const cdp = await page.context().newCDPSession(page);
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const a = Math.PI + 0.35;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
      for (let k = 1; k <= 6; k++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + Math.cos(a) * 12 * k, y: cy + Math.sin(a) * 12 * k, id: 1 }] });
        await page.waitForTimeout(30);
      }
      const dragPlan = await page.evaluate(() => ({ ...window.__sim.heroes[0].superPlan, aiming: window.__sim.heroes[0].aimShow.superOn }));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(hero.wait);
      const a2 = await page.evaluate(hpOf, ids2);
      const hits2 = b2.filter((hp, i) => a2[i] < hp).length;
      check(dragPlan.aiming && dragPlan.locked >= 0 && hits2 >= 1, `${hero.id}: a drag 20 degrees off the pack snaps to it and hits (${hits2} of 3)`);
    }
    await page.context().close();
  }
} catch (err) {
  console.error(err);
  failed = true;
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
