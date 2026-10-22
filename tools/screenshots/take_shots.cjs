const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = '/Users/ubes/.gemini/antigravity/brain/c5374785-ef78-496c-90ef-224fae12039d';

(async () => {
  console.log('Launching Chromium...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });

  console.log('Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(() => window.__game && window.__game.session, null, { timeout: 30000 });

  // 1. Open hero select
  console.log('Opening hero select...');
  await page.click('.btn.start');
  await page.waitForSelector('.hero-select', { timeout: 10000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_select.png') });
  console.log('Saved screenshot_select.png');

  // 2. Start game with Drow Ranger (卓尔游侠) in 5v5
  console.log('Starting game with drow_ranger in 5v5...');
  // Click on drow ranger card
  const drowCard = await page.$('.hs-card[data-id="drow_ranger"]');
  if (drowCard) await drowCard.click();
  await page.waitForTimeout(500);

  await page.click('.btn.hs-start');
  await page.waitForFunction(() => window.__game.session && !window.__game.session.demo && window.__game.session.match.world.time > 0.5, null, { timeout: 30000 });
  await page.waitForTimeout(2000);

  // Position player in mid lane / river area (similar to user's screenshot at (5000, 5000))
  await page.evaluate(() => {
    const g = window.__game;
    const w = g.session.match.world;
    const me = w.getUnit(g.session.match.playerUnitId);
    if (me) {
      g.debug.setHeroLevel(w, me, 7);
      g.debug.refreshHero(w, me);
      g.debug.place(me.id, 5000, 5000);
      me.facing = -Math.PI / 4;
      g.renderer.snapTo(w, me.id);
    }
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_river.png') });
  console.log('Saved screenshot_river.png');

  // 3. Move player into Radiant Jungle near medium/small camp
  console.log('Moving player to Radiant Jungle near camp...');
  await page.evaluate(() => {
    const g = window.__game;
    const w = g.session.match.world;
    const me = w.getUnit(g.session.match.playerUnitId);
    if (me) {
      // Radiant small camp is at (3600, 7200) with wolves
      g.debug.place(me.id, 3500, 7150);
      me.facing = -Math.PI / 4;
      g.renderer.snapTo(w, me.id);
    }
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_jungle.png') });
  console.log('Saved screenshot_jungle.png');

  await browser.close();
  console.log('Done capturing screenshots!');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
