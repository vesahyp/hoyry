// Each boss mid-fight on an emulated iPhone, into shots/bosses/<id>.png.
// A practice run on floor 10 (?floor=10) meets a boss the seed decides
// (bossAt in content/enemies.ts), so the script tries seeds until every
// boss has been met once, and shoots each a few seconds into its fight,
// the hero kept alive. For looking at, not a check. `make boss-shots`.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const port = 5195;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();
mkdirSync('shots/bosses', { recursive: true });
const WANT = ['kattilakuningas', 'mestarimorssari', 'kellokoneisto', 'tehtailija', 'sahuri', 'vesiratas', 'masuuni'];
const seen = new Set();

try {
  // Floor 5 is always the King; floor 10 is one of the rest, by the seed.
  const tries = [[1, 5], ...Array.from({ length: 40 }, (_, i) => [i + 1, 10])];
  for (const [seed, floor] of tries) {
    if (seen.size >= WANT.length) break;
    {
      const ctx = await browser.newContext({ ...devices['iPhone 15'], hasTouch: true });
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${port}/?lang=en&seed=${seed}&floor=${floor}`);
      await page.getByRole('button', { name: 'Play', exact: true }).tap();
      await page.getByRole('button', { name: /The Smith/ }).tap();
      await page.waitForFunction(() => window.__sim && window.__sim.enemies.some((e) => e.boss), null, { timeout: 15000 });
      await page.evaluate(() => { window.__sim.heroes[0].invuln = 1e6; });
      await page.waitForSelector('.bossbar .name', { timeout: 5000 }).catch(() => undefined);
      const id = await page.evaluate(() => document.querySelector('.bossbar .name')?.textContent ?? '');
      const key = WANT.find((w) => ({ kattilakuningas: 'Boiler King', mestarimorssari: 'Master Mortar', kellokoneisto: 'Grand Clockwork', tehtailija: 'Mill Owner', sahuri: 'Sawyer', vesiratas: 'Water Wheel', masuuni: 'Blast Furnace' })[w] && id.includes({ kattilakuningas: 'Boiler King', mestarimorssari: 'Master Mortar', kellokoneisto: 'Grand Clockwork', tehtailija: 'Mill Owner', sahuri: 'Sawyer', vesiratas: 'Water Wheel', masuuni: 'Blast Furnace' }[w]));
      if (key && !seen.has(key)) {
        // Walk toward the boss so it engages, then shoot twice: early and mid-fight.
        const vp = page.viewportSize();
        await page.evaluate(() => {
          const s = window.__sim;
          const b = s.enemies.find((e) => e.boss);
          const h = s.heroes[0];
          const d = Math.hypot(b.x - h.x, b.y - h.y);
          h.x = b.x + ((h.x - b.x) / d) * 170;
          h.y = b.y + ((h.y - b.y) / d) * 170;
        });
        await page.waitForTimeout(3500);
        await page.screenshot({ path: `shots/bosses/${key}.png` });
        await page.touchscreen.tap(vp.width * 0.72, vp.height * 0.6);
        await page.waitForTimeout(2600);
        await page.screenshot({ path: `shots/bosses/${key}-2.png` });
        seen.add(key);
        console.log(`${key}: seed ${seed}, floor ${floor}`);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}
