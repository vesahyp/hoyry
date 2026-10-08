// Screenshots of the how-to-play guide and the training ground on an
// emulated iPhone, portrait and landscape, into shots/guide/<orientation>/.
// For looking at, not a check: nothing here fails. Run with
// `make guide-shots`; needs `make shots-setup`.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const port = 5198;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();

try {
  for (const [orient, size] of [['portrait', null], ['landscape', { width: 844, height: 390 }]]) {
    const dir = `shots/guide/${orient}`;
    mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ ...devices['iPhone 15'], hasTouch: true });
    const page = await ctx.newPage();
    if (size) await page.setViewportSize(size);

    // The title, then the guide from the top down.
    await page.goto(`http://localhost:${port}/?lang=en&seed=3`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/title.png` });
    await page.getByRole('button', { name: 'How to play' }).tap();
    await page.waitForTimeout(400);
    const screen = page.locator('.screen');
    const total = await screen.evaluate((el) => el.scrollHeight - el.clientHeight);
    const pages = Math.min(6, Math.ceil(total / (await page.evaluate(() => innerHeight * 0.85))) + 1);
    for (let i = 0; i < pages; i++) {
      await screen.evaluate((el, k) => el.scrollTo(0, k), i * (await page.evaluate(() => innerHeight * 0.85)));
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${dir}/guide-${i + 1}.png` });
    }

    // The same guide from the pause menu, mid-run.
    await page.goto(`http://localhost:${port}/?lang=en&seed=3`);
    await page.getByRole('button', { name: 'Play', exact: true }).tap();
    await page.getByRole('button', { name: /The Sweep/ }).tap();
    await page.waitForTimeout(800);
    await page.locator('.iconbtn.pause').tap();
    await page.waitForSelector('.overlay');
    await page.screenshot({ path: `${dir}/pause.png` });
    await page.getByRole('button', { name: 'How to play' }).tap();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/pause-guide.png` });

    // The training ground: the dummies up, a drop on the floor, a dummy
    // broken and its post waiting, and the pause menu's way out.
    await page.goto(`http://localhost:${port}/?lang=en&seed=3`);
    await page.getByRole('button', { name: 'Training ground' }).tap();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/train-pick.png` });
    await page.getByRole('button', { name: /The Engineer/ }).tap();
    await page.waitForFunction(() => window.__sim && window.__sim.enemies.length >= 5 && window.__sim.drops.length >= 1, null, { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/train.png` });
    await page.evaluate(() => {
      const s = window.__sim;
      const e = s.enemies[0];
      e.burn = 1;
      e.burnDps = 1e6;
      const h = s.heroes[0];
      h.superCharge = 1;
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${dir}/train-broken.png` });
    await page.locator('.iconbtn.pause').tap();
    await page.waitForSelector('.overlay');
    await page.screenshot({ path: `${dir}/train-pause.png` });

    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
