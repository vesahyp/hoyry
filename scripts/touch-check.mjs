// Taps through the overlays on an emulated phone, the way a thumb does.
// The game's touch handler blocks the default action of touches on the
// play field; a menu it does not exempt cannot be tapped at all, while a
// mouse click still works. That bug shipped once (the cog pick on the lift),
// so this checks it, and that the super button still fires where it sits.
// The same handler once blocked the drag that scrolls a menu, which left a
// landscape phone stuck in a pause menu taller than the screen, so the
// last part turns the phone sideways and scrolls with a finger.
// Run with `make touch-check`; needs `make shots-setup`.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';

const port = 5197;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices['iPhone 15'], hasTouch: true })).newPage();
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};
try {
  await page.goto(`http://localhost:${port}/?lang=en&seed=1`);
  await page.getByRole('button', { name: 'Play', exact: true }).tap();
  await page.getByRole('button', { name: /The Engineer/ }).tap();
  await page.waitForTimeout(500);

  await page.locator('.iconbtn.pause').tap();
  await page.waitForSelector('.overlay');
  await page.getByRole('button', { name: 'Resume' }).tap();
  await page.waitForTimeout(300);
  check((await page.locator('.overlay').count()) === 0, 'a tap on Resume closes the pause menu');

  await page.evaluate(() => (window.__sim.heroes[0].superCharge = 1));
  // The ready button pulses, so tap its centre rather than wait for it to hold still.
  const box = await page.locator('.superbtn').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  check((await page.evaluate(() => window.__sim.heroes[0].superCharge)) === 0, 'a tap on the super button fires the super');

  // A second gun: the swap button beside the super swaps on one tap, the
  // move stick still held, and a swap pressed mid-burst is not lost.
  check((await page.locator('.swapbtn').count()) === 0, 'no swap button with one gun');
  await page.evaluate(() => {
    const h = window.__sim.heroes[0];
    h.guns.push({ ...h.guns[0], gun: { ...h.guns[0].gun, id: -1 } });
  });
  await page.waitForTimeout(300);
  const sw = await page.locator('.swapbtn').boundingBox();
  check(sw && sw.width >= 56 && sw.height >= 56, 'the swap button is at least 56 px');
  const cdp = await page.context().newCDPSession(page);
  const pt = (id, x, y) => ({ x, y, id, radiusX: 10, radiusY: 10, force: 1 });
  const stick = pt(1, 60, 560);
  const btn = pt(2, sw.x + sw.width / 2, sw.y + sw.height / 2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...stick, x: 90 }] });
  await page.waitForTimeout(100);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...stick, x: 90 }, btn] });
  // CDP releases a touch by leaving it out of the next event's list.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...stick, x: 91 }] });
  await page.waitForTimeout(200);
  const st = await page.evaluate(() => ({ active: window.__sim.heroes[0].active, moving: window.__sim.heroes[0].moving }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check(st.active === 1 && st.moving, 'a tap on the swap button swaps while the left thumb walks');
  await page.evaluate(() => (window.__sim.heroes[0].guns[1].burstLeft = 99));
  await page.locator('.swapbtn').tap();
  await page.waitForTimeout(100);
  const mid = await page.evaluate(() => window.__sim.heroes[0].active);
  await page.evaluate(() => (window.__sim.heroes[0].guns[1].burstLeft = 0));
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => window.__sim.heroes[0].active);
  check(mid === 1 && after === 0, 'a swap pressed during a burst happens when the burst ends');

  // Skip the fight: clear the floor and stand the hero on the lift.
  await page.evaluate(() => {
    const s = window.__sim;
    s.enemies.length = 0;
    s.marks.length = 0;
    s.wavesLeft = 0;
    s.heroes[0].x = s.arena.liftX;
    s.heroes[0].y = s.arena.liftY;
  });
  await page.waitForSelector('.overlay .card', { timeout: 10000 });
  await page.locator('.overlay .card').first().tap();
  await page.waitForTimeout(300);
  const floor = await page.evaluate(() => window.__sim.floor);
  check(floor === 2 && (await page.locator('.overlay').count()) === 0, 'a tap on a cog card on the lift starts floor 2');

  // Landscape: every menu taller than the screen scrolls under a finger,
  // and its last button can then be reached and tapped.
  const land = await (await browser.newContext({ ...devices['iPhone 15 landscape'], hasTouch: true })).newPage();
  const lcdp = await land.context().newCDPSession(land);
  const swipeUp = async () => {
    await lcdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 420, y: 330 }] });
    for (let y = 310; y >= 30; y -= 20) await lcdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 420, y }] });
    await lcdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await land.waitForTimeout(400);
  };
  const inView = async (loc) => {
    const b = await loc.boundingBox();
    return !!b && b.y >= 0 && b.y + b.height <= land.viewportSize().height;
  };
  await land.goto(`http://localhost:${port}/?lang=en&seed=1`);
  await swipeUp();
  await land.getByRole('button', { name: 'Play', exact: true }).tap();
  await swipeUp();
  const pick = land.getByRole('button', { name: /The Engineer/ });
  check(await inView(land.locator('.hero').last()), 'landscape: hero select scrolls to the last hero');
  await pick.tap();
  await land.waitForTimeout(500);
  await land.evaluate(() => {
    const h = window.__sim.heroes[0];
    h.guns.push({ ...h.guns[0], gun: { ...h.guns[0].gun, id: -1 } });
  });
  await land.locator('.iconbtn.pause').tap();
  await land.waitForSelector('.overlay');
  await swipeUp();
  check(await inView(land.getByRole('button', { name: 'Quit' })), 'landscape: the pause menu with two guns scrolls to Quit');
  await land.getByRole('button', { name: 'Resume' }).tap();
  await land.waitForTimeout(300);
  check((await land.locator('.overlay').count()) === 0, 'landscape: Resume closes the pause menu');
  await land.evaluate(() => {
    const h = window.__sim.heroes[0];
    h.hp = 0;
    h.alive = false;
    window.__sim.gameOver = true;
  });
  await land.waitForSelector('.screen.death', { timeout: 10000 });
  await land.waitForTimeout(1500);
  await swipeUp();
  const last = land.locator('.screen.death button').last();
  check(await inView(last), 'landscape: the death screen scrolls to its last button');
} finally {
  await browser.close();
  server.kill();
}
process.exitCode = failed ? 1 : 0;
