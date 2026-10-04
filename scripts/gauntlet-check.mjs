// The hard floors on an emulated iPhone, played by the human profile of
// the bot (a reaction time, a thumb, a tap rate, an aim a little off), from
// the build a run has by floor 6 (?floor=6, tools/build.ts), at real
// speed, on video. The check passes when the run clears floors 6, 7 and 8.
// The sim is deterministic for a seed, so the same seed clears every time
// it clears once; the statistical proof over many seeds and all four
// heroes is `npm run gauntlet`. Run with `make gauntlet-check` (part of
// `make check`); needs `make shots-setup`. The video lands in
// shots/gauntlet/floors-6-8.webm, a screenshot every ten seconds beside it.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, renameSync, rmSync } from 'node:fs';

const port = 5197;
const dir = 'shots/gauntlet';
const seed = Number(process.argv[2] ?? 2005);
const hero = process.argv[3] ?? 'The Smith';
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};

const phone = devices['iPhone 15'];
const ctx = await browser.newContext({ ...phone, hasTouch: true, recordVideo: { dir, size: phone.viewport } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
try {
  await page.goto(`http://localhost:${port}/?lang=en&bot=human&speed=1&seed=${seed}&floor=6`);
  await page.getByRole('button', { name: 'Play', exact: true }).tap();
  await page.getByRole('button', { name: new RegExp(hero) }).tap();
  await page.waitForFunction(() => window.__sim && window.__sim.floor === 6, null, { timeout: 15000 });
  const cleared = [];
  let shot = 0;
  let floor = 6;
  const t0 = Date.now();
  // Watch the run: a screenshot every ten seconds, the floors it clears. The
  // bot rides the lift inside one frame, so a cleared floor shows as the
  // floor number going up, never as the 'done' phase.
  while (Date.now() - t0 < 300000) {
    const st = await page.evaluate(() => ({ floor: window.__sim.floor, over: window.__sim.gameOver, time: window.__sim.time, hp: Math.round(window.__sim.heroes[0].hp) }));
    while (floor < st.floor) cleared.push(floor++);
    if (st.over || cleared.includes(8)) break;
    if (st.time >= shot * 10) {
      await page.screenshot({ path: `${dir}/floor-${st.floor}-${String(Math.round(st.time)).padStart(3, '0')}s.png` });
      shot++;
    }
    await page.waitForTimeout(250);
  }
  const end = await page.evaluate(() => ({ floor: window.__sim.floor, over: window.__sim.gameOver, time: Math.round(window.__sim.time), hp: Math.round(window.__sim.heroes[0].hp) }));
  for (const f of [6, 7, 8]) check(cleared.includes(f), `${hero}, seed ${seed}: clears floor ${f}${cleared.includes(f) ? '' : end.over ? ` (fell on floor ${end.floor} at ${end.time} s)` : ''}`);
  console.log(`run ended on floor ${end.floor} at ${end.time} s with ${end.hp} hp${end.over ? ', dead' : ''}`);
  if (errors.length) {
    console.log('page errors:\n' + errors.join('\n'));
    failed = true;
  }
} catch (err) {
  console.error(err);
  failed = true;
} finally {
  const video = page.video();
  await ctx.close();
  if (video) {
    const p = await video.path();
    renameSync(p, `${dir}/floors-6-8.webm`);
    console.log(`video: ${dir}/floors-6-8.webm`);
  }
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
