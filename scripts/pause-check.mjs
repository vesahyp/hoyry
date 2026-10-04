// The pause menu with a full build, on a phone in portrait and landscape.
// A touch swipe (a real touch gesture through CDP, not the mouse wheel) must
// scroll it when it is taller than the screen, and Resume, Restart and Quit
// must stay on screen. Run `make pause-check`; needs `make shots-setup`.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const port = 5196;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
mkdirSync('shots/pause', { recursive: true });
const browser = await chromium.launch();
let failed = 0;
const fail = (m) => { failed++; console.log('FAIL', m); };

try {
  for (const [name, size] of [['portrait', { width: 393, height: 659 }], ['landscape', { width: 659, height: 393 }]]) {
    const ctx = await browser.newContext({ ...devices['iPhone 15'], viewport: size, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${port}/?lang=en&seed=1`);
    await page.getByRole('button', { name: 'Play', exact: true }).tap();
    await page.getByRole('button', { name: /The Engineer/ }).tap();
    await page.waitForFunction(() => window.__sim);
    // A long build: a second gun and every cog.
    await page.evaluate(async () => {
      const mod = await import('/src/game/content/cogs.ts');
      const list = mod.COGS;
      const h = window.__sim.heroes[0];
      h.guns.push({ ...h.guns[0], gun: { ...h.guns[0].gun, id: -1 } });
      for (const c of list) h.cogs[c.id] = 3;
    });
    await page.locator('.iconbtn.pause').tap();
    await page.waitForSelector('.overlay h2');
    await page.waitForTimeout(400);
    const info = () => page.locator('.overlay').evaluate((el) => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
    const buttonsVisible = () => page.evaluate(() => {
      const h = window.innerHeight;
      return [...document.querySelectorAll('.overlay .row .btn')].map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent, ok: r.top >= 0 && r.bottom <= h }; });
    });
    const before = await info();
    await page.screenshot({ path: `shots/pause/${name}-top.png` });
    let bv = await buttonsVisible();
    if (bv.some((b) => !b.ok)) fail(`${name}: buttons off screen at the top: ${JSON.stringify(bv)}`);
    if (before.max > 0) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Input.synthesizeScrollGesture', { x: size.width / 2, y: size.height * 0.6, yDistance: -6000, gestureSourceType: 'touch', speed: 800 });
      await page.waitForTimeout(600);
      const end = await info();
      if (end.top < end.max - 2) fail(`${name}: touch swipe cannot reach the end (${end.top} of ${end.max})`);
      bv = await buttonsVisible();
      if (bv.some((b) => !b.ok)) fail(`${name}: buttons off screen at the end: ${JSON.stringify(bv)}`);
    }
    await page.screenshot({ path: `shots/pause/${name}-end.png` });
    console.log(`${name}: scrollable ${before.max}px`);
    // Quit and Restart ask first: one tap arms, only the second ends the run.
    for (const [label, sure] of [['Quit', 'Really quit?'], ['Restart', 'Really restart?']]) {
      await page.getByRole('button', { name: label, exact: true }).tap();
      await page.waitForTimeout(300);
      if (!(await page.locator('.overlay h2').count()) || !(await page.getByRole('button', { name: sure }).count())) fail(`${name}: one tap on ${label} did not stop at the confirm`);
      if (!(await page.evaluate(() => !!window.__sim && !window.__sim.gameOver))) fail(`${name}: one tap on ${label} ended the run`);
      await page.waitForTimeout(4400);
      if (!(await page.getByRole('button', { name: label, exact: true }).count())) fail(`${name}: ${label} confirm did not time out`);
    }
    // A fixed ?seed keeps the Game key, so the confirmed Restart is checked on a run with a random seed.
    await page.goto(`http://localhost:${port}/?lang=en`);
    await page.getByRole('button', { name: 'Play', exact: true }).tap();
    await page.getByRole('button', { name: /The Engineer/ }).tap();
    await page.waitForFunction(() => window.__sim);
    const seed0 = await page.evaluate(() => window.__sim.seed);
    await page.locator('.iconbtn.pause').tap();
    await page.waitForSelector('.overlay h2');
    await page.getByRole('button', { name: 'Restart', exact: true }).tap();
    await page.getByRole('button', { name: 'Really restart?' }).tap();
    await page.waitForTimeout(600);
    if (await page.locator('.overlay').count() || (await page.evaluate(() => window.__sim.seed)) === seed0) fail(`${name}: confirmed Restart did not start a new run`);
    await page.locator('.iconbtn.pause').tap();
    await page.waitForSelector('.overlay h2');
    await page.getByRole('button', { name: 'Quit', exact: true }).tap();
    await page.getByRole('button', { name: 'Really quit?' }).tap();
    await page.waitForTimeout(600);
    if (!(await page.getByRole('button', { name: /The Engineer/ }).count())) fail(`${name}: confirmed Quit did not leave the run`);
    await page.getByRole('button', { name: /The Engineer/ }).tap();
    await page.waitForFunction(() => window.__sim);
    await page.locator('.iconbtn.pause').tap();
    await page.waitForSelector('.overlay h2');
    await page.getByRole('button', { name: 'Resume' }).tap();
    await page.waitForTimeout(300);
    if (await page.locator('.overlay').count()) fail(`${name}: Resume did not close the pause menu`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(failed ? `${failed} failure(s)` : 'pause-check ok');
process.exit(failed ? 1 : 0);
