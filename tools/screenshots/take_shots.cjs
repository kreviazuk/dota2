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

  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

  console.log('Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(() => window.__game && window.__game.session, null, { timeout: 30000 });
  await page.waitForTimeout(1000);

  // 1. Open hero select
  console.log('Opening hero select...');
  await page.evaluate(() => {
    const btn = document.querySelector('.btn.start');
    if (btn) btn.click();
  });
  await page.waitForSelector('.hero-select', { timeout: 10000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_select.png') });
  console.log('Saved screenshot_select.png');

  // 2. Select Drow Ranger and Start 5v5 game
  console.log('Starting game with drow_ranger in 5v5...');
  await page.evaluate(() => {
    const card = document.querySelector('.hs-card[data-id="drow_ranger"]');
    if (card) card.click();
  });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    const startBtn = document.querySelector('.btn.hs-start');
    if (startBtn) startBtn.click();
  });

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
  // Screenshot clean river view (NO roster clutter!)
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_river.png') });
  console.log('Saved screenshot_river.png');

  // 3. Open Scoreboard Modal (王者荣耀风格点开战况)
  console.log('Configuring rich battle stats and opening Scoreboard Modal...');
  await page.evaluate(() => {
    const g = window.__game;
    const w = g.session.match.world;
    // Team 0 = Radiant, Team 1 = Dire
    w.teams[0].kills = 9;
    w.teams[1].kills = 6;

    const me = w.getUnit(g.session.match.playerUnitId);
    if (me && me.hero) {
      me.hero.kills = 5;
      me.hero.deaths = 1;
      me.hero.assists = 3;
      me.hero.gold = 4280;
      me.hero.hasShard = true;
      g.debug.grantItem(w, me, 'power_treads');
      g.debug.grantItem(w, me, 'dragon_lance');
      g.debug.grantItem(w, me, 'yasha');
      g.debug.grantItem(w, me, 'shadow_blade');
    }

    const radHeroes = w.heroes(0);
    if (radHeroes[1]?.hero) {
      radHeroes[1].hero.kills = 2;
      radHeroes[1].hero.deaths = 2;
      radHeroes[1].hero.assists = 6;
      radHeroes[1].hero.gold = 2650;
      g.debug.grantItem(w, radHeroes[1], 'phase_boots');
      g.debug.grantItem(w, radHeroes[1], 'blink_dagger');
    }
    if (radHeroes[2]?.hero) {
      g.debug.grantItem(w, radHeroes[2], 'tranquil_boots');
      g.debug.grantItem(w, radHeroes[2], 'aether_lens');
    }

    const direHeroes = w.heroes(1);
    if (direHeroes[0]?.hero) {
      direHeroes[0].hero.kills = 4;
      direHeroes[0].hero.deaths = 3;
      direHeroes[0].hero.assists = 2;
      direHeroes[0].hero.gold = 3520;
      g.debug.grantItem(w, direHeroes[0], 'arcane_boots');
      g.debug.grantItem(w, direHeroes[0], 'kaya');
      g.debug.grantItem(w, direHeroes[0], 'aether_lens');
    }
    if (direHeroes[1]?.hero) {
      direHeroes[1].hero.kills = 1;
      direHeroes[1].hero.deaths = 4;
      direHeroes[1].hero.assists = 1;
      direHeroes[1].hero.gold = 1890;
      g.debug.grantItem(w, direHeroes[1], 'tranquil_boots');
      g.debug.grantItem(w, direHeroes[1], 'urn_of_shadows');
    }

    // Direct trigger scoreboard open
    const scoreBtn = document.querySelector('.score');
    if (scoreBtn) scoreBtn.click();
  });

  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_scoreboard.png') });
  console.log('Saved screenshot_scoreboard.png');

  // Dismiss scoreboard modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('.sb-close');
    if (closeBtn) closeBtn.click();
  });
  await page.waitForTimeout(500);

  // 4. Move player into Radiant Jungle near medium/small camp
  console.log('Moving player to Radiant Jungle near camp...');
  await page.evaluate(() => {
    const g = window.__game;
    const w = g.session.match.world;
    const me = w.getUnit(g.session.match.playerUnitId);
    if (me) {
      // Radiant small camp is at (3500, 7150) with wolves
      g.debug.place(me.id, 3500, 7150);
      me.facing = -Math.PI / 4;
      g.renderer.snapTo(w, me.id);
    }
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_jungle.png') });
  console.log('Saved screenshot_jungle.png');

  // 5. Open Shop Modal and select an iconic advanced item (Aghanim's Scepter / Daedalus)
  console.log('Opening Shop Modal...');
  await page.evaluate(() => {
    const shopBtn = document.querySelector('.btn-shop');
    if (shopBtn) shopBtn.click();
  });
  await page.waitForTimeout(800);

  await page.evaluate(() => {
    // Select Aghanim's Scepter to display full stats, active/passive info, recipes, and builds
    const card = document.querySelector('.shop-item-card[data-item-id="aghanims_scepter"]') ||
                 document.querySelector('.shop-item-card[data-item-id="black_king_bar"]') ||
                 document.querySelector('.shop-item-card[data-item-id="daedalus"]');
    if (card) {
      card.scrollIntoView({ block: 'center' });
      card.click();
    }
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_shop.png') });
  console.log('Saved screenshot_shop.png');

  // Dismiss shop modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('.shop-close');
    if (closeBtn) closeBtn.click();
  });
  await page.waitForTimeout(500);

  await browser.close();
  console.log('Done capturing screenshots!');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
