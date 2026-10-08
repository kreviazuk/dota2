// 英雄任务通用的截图脚本（先 `npm run dev` 启动开发服务器）：
//   HERO=<id> MODE=3d|2d VIEW=phone|desktop node tools/screenshots/hero.cjs
// 可选环境变量：SCRATCH=<输出目录>（默认 .shots/，已在 .gitignore）、URL=<开发服务器地址>（默认 http://localhost:5173/）、
//   CHROME_PATH=<浏览器可执行文件>（默认用 Playwright 自带的 Chromium，需要先 `npx playwright install chromium`）、
//   SWIFTSHADER=1（没有 GPU 的机器 / 云端容器用软件渲染 WebGL）、ONLY=select,<技能id>,...（只截其中几项）。
// 新英雄：在下面的 PLAN 里加上该英雄每个主动技能要截的时刻（弹道 id、fx 事件名和第几帧）。
// 1) 选人界面（选中该英雄，隔 1 秒两张）2) 兵线上的总览 3) 每个主动技能的前摇 / 生效 4) 被动（普攻几秒）
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const fs = require('fs');
const OUT = process.env.SCRATCH || '.shots';
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.URL || 'http://localhost:5173/';
const HERO = process.env.HERO || 'sven';
const MODE = process.env.MODE || '3d';
const VIEW = process.env.VIEW || 'phone';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const tag = `${HERO}-${MODE}-${VIEW}`;
/** 每个技能要截的时刻：弹道飞行、某个 fx 事件后第 N 帧 */
const PLAN = {
  sven_storm_hammer: { proj: 'sven_hammer', fx: [['sven_hammer_hit', 3, 'hit']], afterMs: 1500 },
  sven_warcry: { fx: [['sven_warcry', 3, 'release'], ['sven_warcry', 12, 'release2']] },
  sven_gods_strength: { fx: [['sven_gods_strength', 3, 'release'], ['sven_gods_strength', 14, 'release2']] },
  lina_dragon_slave: { proj: 'lina_dragon_slave', fx: [['lina_dragon_slave', 14, 'wave']] },
  lina_light_strike_array: { area: 'lina_lsa', fx: [['lina_lsa', 3, 'hit'], ['lina_lsa', 10, 'hit2']] },
  lina_laguna_blade: { fx: [['lina_laguna', 3, 'beam'], ['lina_laguna_hit', 3, 'hit']], afterMs: 2500 },
};
/** 普攻（被动）要截的时刻：分裂斩痕（fx）或普攻弹道（proj） */
const ATTACK = { sven: { fx: 'cleave' }, lina: { proj: 'hero:lina' } };

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage(
    VIEW === 'phone'
      ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
      : { viewport: { width: 1280, height: 720 } },
  );
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const shot = async (name) => { await page.screenshot({ path: `${OUT}/${tag}-${name}.png` }); console.log('shot', name); };
  const wait = (ms) => page.waitForTimeout(ms);
  const want = (k) => ONLY.length === 0 || ONLY.includes(k);
  await page.goto(`${BASE}${MODE === '2d' ? '?renderer=2d' : ''}`);
  await page.waitForFunction(() => window.__game && window.__game.session, null, { timeout: 90000 });

  if (want('select')) {
    await page.click('.btn.start');
    await page.waitForSelector('.hero-select');
    await page.click(`.hs-card[data-id="${HERO}"]`);
    await wait(2500);
    await shot('select-a');
    await wait(1000);
    await shot('select-b');
    // 预览循环里的技能动作（站立 2 + 跑 2 + 普攻 ×2 ≈ 5.9 秒之后）
    await wait(3600);
    await shot('select-c');
    await wait(900);
    await shot('select-d');
  }

  // 开局：玩家 + 队友 [HERO, axe]，敌人 [axe, sven, axe]
  await page.evaluate((hero) => window.__game.start({ hero, radiant: [hero, 'axe'], dire: ['axe', 'sven', 'axe'] }), HERO);
  await page.waitForFunction(() => window.__game.session && window.__game.session.match.world.time > 0.3, null, { timeout: 60000 });
  await page.evaluate(() => { window.__game.timeScale = 4; });
  // 等第一波兵刷出来
  await page.waitForFunction(() => window.__game.session.match.world.units.filter((u) => u.kind === 'creep').length >= 6, null, { timeout: 120000 });
  const setup = await page.evaluate(() => {
    const g = window.__game;
    const w = g.session.match.world;
    g.debug.freezeAI(true);
    for (const h of w.heroes()) g.debug.setHeroLevel(w, h, 25);
    g.debug.refresh(true);
    const me = w.getUnit(g.session.match.playerUnitId);
    const heroes = w.heroes();
    const allies = heroes.filter((h) => h.team === me.team && h.id !== me.id);
    const foes = heroes.filter((h) => h.team !== me.team);
    // 玩家在河道南侧，两个敌方英雄在前方 300–550，队友在身后两侧，其余英雄放远
    g.debug.place(me.id, 1500, 5420);
    me.facing = -Math.PI / 2;
    g.debug.place(foes[0].id, 1480, 5100);
    g.debug.place(foes[1].id, 1640, 4950);
    g.debug.place(foes[2].id, 2300, 3300);
    g.debug.place(allies[0].id, 1300, 5600);
    g.debug.place(allies[1].id, 1720, 5650);
    for (const h of heroes) { h.autoAttack = false; h.order = { kind: 'idle' }; }
    // 敌方小兵放到敌方英雄身边，己方小兵放远（不抢镜）
    const creeps = w.units.filter((u) => u.kind === 'creep');
    let i = 0;
    for (const c of creeps) {
      if (c.team !== me.team) {
        const a = (i++ / 3) * Math.PI * 2;
        g.debug.place(c.id, 1530 + Math.cos(a) * 140, 5030 + Math.sin(a) * 110);
        c.base.moveSpeed = 0;
        c.base.damageMin = 0; c.base.damageMax = 0;
      } else {
        g.debug.place(c.id, 900 + (i++ % 4) * 40, 8200);
      }
    }
    g.timeScale = 1;
    return { me: me.id, foes: foes.map((f) => f.id), allies: allies.map((a) => a.id), abilities: me.abilities.map((a) => [a.def.slot, a.def.id, a.level, a.def.targetType, !!a.def.instant]) };
  });
  console.log(JSON.stringify(setup));
  await wait(2500);
  if (want('lane')) await shot('lane');

  const meU = () => 'window.__game.session.match.world.getUnit(window.__game.session.match.playerUnitId)';
  // 记录渲染器收到的 fx 事件和渲染帧数，用来在特效出现后的第 N 帧冻结时间（timeScale = 0）再截图
  await page.evaluate(() => {
    const r = window.__game.renderer;
    const consume = r.consume.bind(r);
    const render = r.render.bind(r);
    window.__frame = 0;
    window.__fx = [];
    r.consume = (events, w, f) => { for (const e of events) if (e.type === 'fx') window.__fx.push({ kind: e.kind, frame: window.__frame }); consume(events, w, f); };
    r.render = (...a) => { window.__frame++; render(...a); };
  });
  let scale = 0.25;
  const run = (k) => page.evaluate((v) => { window.__game.timeScale = v; }, k);
  /** 等某个 fx 事件出现后再渲染 frames 帧，冻结时间截图，然后恢复 */
  const freezeOnFx = async (kind, frames, name) => {
    const ok = await page.waitForFunction(([k, n]) => {
      const e = window.__fx.find((x) => x.kind === k);
      if (e && window.__frame - e.frame >= n) { window.__game.timeScale = 0; return true; }
      return false;
    }, [kind, frames], { timeout: 15000, polling: 8 }).then(() => true).catch(() => false);
    await wait(400);
    await shot(name + (ok ? '' : '-nofx'));
    await run(scale);
  };
  /** 等页面里的条件成立，冻结时间截图 */
  const freezeWhen = async (cond, arg, name) => {
    const ok = await page.waitForFunction(([c, a]) => { if (eval(c)(a)) { window.__game.timeScale = 0; return true; } return false; }, [cond.toString(), arg], { timeout: 15000, polling: 8 }).then(() => true).catch(() => false);
    await wait(400);
    await shot(name + (ok ? '' : '-timeout'));
    await run(scale);
  };
  const actives = setup.abilities.filter(([slot, , lv, tt]) => lv > 0 && tt !== 'passive' && slot !== 'innate');
  for (const [slot, id, , tt, instant] of actives) {
    if (!want(slot)) continue;
    const plan = PLAN[id] ?? {};
    await page.evaluate(() => { window.__game.debug.refresh(true); window.__fx = []; });
    scale = 0.25;
    await run(scale);
    if (tt === 'toggle') {
      await page.evaluate((s) => window.__game.session.match.world.issue(window.__game.session.match.playerUnitId, { type: 'toggle', slot: s }), slot);
      await wait(1500);
      await shot(`${slot}-on`);
      continue;
    }
    // 单位技能打较远的那个敌方英雄（看得到弹道飞行）
    const target = tt === 'unit' ? { unitId: setup.foes[1] } : undefined;
    await page.evaluate(([s, t]) => window.__game.debug.cast(s, t), [slot, target]);
    if (!instant) {
      await freezeWhen((m) => { const u = eval(m); return !!u.cast && u.cast.phase === 'point' && u.cast.timer < 0.08; }, meU(), `${slot}-windup`);
    }
    if (plan.area) {
      // 区域效果（预警圈）进行到一半时
      await freezeWhen((v) => window.__game.session.match.world.effects.some((e) => e.visual === v && !e.done && e.elapsed > e.duration * 0.5), plan.area, `${slot}-area`);
    }
    if (plan.proj) {
      await freezeWhen((v) => window.__game.session.match.world.projectiles.some((p) => p.visual === v && p.pos && Math.hypot(p.pos.x - p.prevPos.x, p.pos.y - p.prevPos.y) > 0 && window.__frame % 1 === 0 && p.data !== undefined && (p.__seen = (p.__seen ?? 0) + 1) > 3), plan.proj, `${slot}-flight`);
    }
    for (const [kind, frames, name] of plan.fx ?? [[id, 3, 'release']]) await freezeOnFx(kind, frames, `${slot}-${name}`);
    await wait(plan.afterMs ?? 1500);
    await shot(`${slot}-after`);
  }

  if (want('attack')) {
    // 普攻（被动：分裂）：打正前方的敌方英雄（身后放两个小兵），在分裂斩痕出现后第 1 / 3 / 6 帧各冻结截一张
    await page.evaluate((foe) => {
      const g = window.__game;
      const w = g.session.match.world;
      const me = w.getUnit(g.session.match.playerUnitId);
      for (const m of me.modifiers.slice()) if (m.def.id === 'sven_gods_strength') m.duration = 0.01;
      g.debug.refresh(true);
      const t = w.getUnit(foe);
      g.debug.place(t.id, 1500, 5230);
      t.hp = t.stats.maxHp;
      let i = 0;
      for (const c of w.units.filter((u) => u.kind === 'creep' && u.team !== me.team && u.alive)) {
        g.debug.place(c.id, 1440 + (i++ % 3) * 60, 5040 - (i % 2) * 50);
        c.hp = c.stats.maxHp;
      }
      w.issue(me.id, { type: 'attack', mode: 'smart', targetId: t.id });
    }, setup.foes[0]);
    scale = 0.2;
    await run(scale);
    await freezeWhen((m) => { const u = eval(m); return u.attack.windup > 0 && u.attack.windup < 0.05; }, meU(), 'attack-windup');
    const atk = ATTACK[HERO] ?? {};
    if (atk.fx) {
      for (const n of [1, 3, 6]) {
        await page.evaluate(() => { window.__fx = []; });
        await freezeOnFx(atk.fx, n, `attack-${atk.fx}${n}`);
      }
    }
    if (atk.proj) {
      await freezeWhen((v) => window.__game.session.match.world.projectiles.some((p) => p.visual === v && (p.__seen = (p.__seen ?? 0) + 1) > 4), atk.proj, 'attack-flight');
      await wait(2500);
      await shot('attack-after');
    }
  }
  await page.evaluate(() => { window.__game.timeScale = 1; });
  console.log(JSON.stringify({ errors }));
  await browser.close();
})();
