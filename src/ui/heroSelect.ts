import type { Difficulty } from '../sim/core/types';
import type { HeroDef } from '../sim/heroes/types';
import { getHeroDef, hasHero } from '../sim/heroes/index';
import { BALANCE } from '../sim/data/balance';
import { HERO_ROSTER } from '../game/roster';
import { DIFFICULTY_NAMES } from '../ai/difficulty';
import { abilityNumbers, abilityTags, fmtNum, heroBaseLine, orderedAbilities, PRIMARY_COLORS, PRIMARY_NAMES, SLOT_LABELS } from './abilityText';
import { portraitCanvas } from './hud';
import { getAbilityIconCanvas } from '../render/abilityIcons';

export interface HeroSelectOpts {
  difficulty: Difficulty;
  /** 上次选的英雄（localStorage 'dota-lane.lastHero'）；不可选时退回第一个可选的英雄 */
  initialHero: string | null;
  /** 主渲染器是 3D 时用 webgl（独立的小 WebGL 画布实时预览模型），否则显示大头像 */
  preview: 'webgl' | '2d';
}

/** 选英雄界面：close() 移除界面并释放预览的 WebGL 上下文（开始 / 返回时自动调用） */
export type HeroSelectScreen = HTMLDivElement & { close(): void };

interface PreviewLike {
  show(id: string): void;
  resize(): void;
  dispose(): void;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const POSITION_LABELS = [
  '👑 1号位 · 优势核心',
  '⚔️ 2号位 · 中路霸主',
  '🛡️ 3号位 · 劣路先锋',
  '⚡ 4号位 · 游走辅助',
  '✨ 5号位 · 全职辅助',
];

function statsHtml(def: HeroDef): string {
  const b = heroBaseLine(def, BALANCE);
  const item = (icon: string, k: string, v: string) =>
    `<div class="hs-stat"><span class="stat-icon">${icon}</span><span class="k">${k}</span><span class="v">${v}</span></div>`;
  return [
    item('❤️', '生命', fmtNum(Math.round(b.hp))),
    item('💧', '魔法', fmtNum(Math.round(b.mana))),
    item('⚔️', '攻击', `${Math.round(b.damage[0])}–${Math.round(b.damage[1])}`),
    item('🛡️', '护甲', b.armor.toFixed(1)),
    item('👟', '移速', String(b.moveSpeed)),
    item('🎯', '射程', String(b.attackRange)),
  ].join('');
}

function abilitiesHtml(def: HeroDef): string {
  const abs = orderedAbilities(def)
    .map((a) => {
      const tags = abilityTags(a).map((t) => `<span class="tag">${t}</span>`).join('');
      const nums = abilityNumbers(a);
      const key = SLOT_LABELS[a.slot];
      return `<div class="hs-ab${a.slot === 'R' ? ' ult' : ''}">
        <div class="hs-ab-icon-wrap" data-ab-id="${a.id}"></div>
        <div class="hs-ab-body">
          <div class="hs-ab-head"><span class="key${a.slot === 'innate' ? ' innate' : ''}">${key}</span><span class="ab-name">${esc(a.name)}</span>${tags}</div>
          <div class="ab-desc">${esc(a.description)}</div>
          ${nums.length ? `<div class="ab-nums">${nums.join(' · ')}</div>` : ''}
        </div>
      </div>`;
    })
    .join('');
  const levels = BALANCE.hero.talentLevels;
  const talents = def.talents
    .map((pair, i) => `<div class="hs-tal"><span class="lv">${levels[i]}</span><span class="opt">${esc(pair[0].name)}</span><span class="opt">${esc(pair[1].name)}</span></div>`)
    .reverse()
    .join('');
  return `${abs}<div class="hs-sub">✦ 英雄天赋分支（10 / 15 / 20 / 25 级二选一）</div>${talents}`;
}

/**
 * 选英雄界面（横屏两栏）：左边 5 × 2 英雄卡片，右边选中英雄的预览、面板和技能说明；底部"随机英雄""开始对局"。
 * 还没实现的英雄显示"开发中"，不能选。
 */
export function showHeroSelect(
  parent: HTMLElement,
  o: HeroSelectOpts,
  onStart: (heroId: string, teamHeroes?: string[]) => void,
  onBack: () => void,
): HeroSelectScreen {
  const pickable = HERO_ROSTER.filter((e) => hasHero(e.id)).map((e) => e.id);
  const playerHero = o.initialHero && pickable.includes(o.initialHero) ? o.initialHero : pickable[0] ?? 'axe';
  const otherHeroes = pickable.filter((id) => id !== playerHero);
  let teamHeroes: string[] = [playerHero, ...otherHeroes.slice(0, 4)];
  while (teamHeroes.length < 5 && pickable.length > 0) {
    teamHeroes.push(pickable[teamHeroes.length % pickable.length]);
  }

  let activeSlot = 0;
  let selected = teamHeroes[activeSlot] ?? null;

  const s = document.createElement('div') as HeroSelectScreen;
  s.className = 'screen hero-select';
  s.innerHTML = `
    <div class="hs-top">
      <div class="hs-heading">⚔️ 天辉 vs 夜魇 · 三路 5v5 选人阶段<span class="hs-diff">难度：${DIFFICULTY_NAMES[o.difficulty]}</span></div>
      <div class="btn secondary hs-back">返回</div>
    </div>
    <div class="hs-lineup-bar">
      <div class="hs-lineup-title">天辉出战阵容：</div>
      <div class="hs-slots">
        ${teamHeroes.map((hid, idx) => `
          <div class="hs-slot${idx === activeSlot ? ' active' : ''}" data-slot="${idx}">
            <span class="hs-slot-tag">${POSITION_LABELS[idx]}</span>
            <div class="hs-slot-face"></div>
            <span class="hs-slot-name">${esc(getHeroDef(hid).name)}</span>
          </div>`).join('')}
      </div>
    </div>
    <div class="hs-body">
      <div class="hs-grid">
        ${HERO_ROSTER.map((e) => `
          <div class="hs-card${hasHero(e.id) ? '' : ' locked'}" data-id="${e.id}">
            <div class="hs-face"></div>
            <div class="hs-cname">${esc(e.name)}</div>
            <div class="hs-attr" style="background:${PRIMARY_COLORS[e.primary]}"></div>
            ${hasHero(e.id) ? '' : '<div class="hs-lock">开发中</div>'}
          </div>`).join('')}
      </div>
      <div class="hs-detail">
        <div class="hs-preview"><canvas class="hs-canvas"></canvas><div class="hs-portrait-big"></div><div class="hs-drag-hint">拖动旋转 3D 模型</div></div>
        <div class="hs-info">
          <div class="hs-name"></div>
          <div class="hs-tags"></div>
          <div class="hs-stats"></div>
          <div class="hs-abilities"></div>
        </div>
      </div>
    </div>
    <div class="hs-bottom">
      <div class="btn secondary hs-random">🎲 随机阵容</div>
      <div class="btn hs-start">进入战场</div>
    </div>`;
  parent.appendChild(s);
  const q = <T extends Element>(sel: string): T => s.querySelector(sel) as T;
  const cards = [...s.querySelectorAll<HTMLDivElement>('.hs-card')];
  for (const c of cards) {
    const id = c.dataset.id!;
    c.querySelector('.hs-face')!.appendChild(portraitCanvas(id, 64));
  }
  const canvas = q<HTMLCanvasElement>('.hs-canvas');
  const big = q<HTMLDivElement>('.hs-portrait-big');
  const previewBox = q<HTMLDivElement>('.hs-preview');
  let preview: PreviewLike | null = null;
  let closed = false;
  let ro: ResizeObserver | null = null;

  const use2d = () => {
    previewBox.classList.add('flat');
    canvas.style.display = 'none';
  };
  const render = () => {
    // 刷新 5 个槽位状态
    const slotEls = [...s.querySelectorAll<HTMLDivElement>('.hs-slot')];
    slotEls.forEach((el, idx) => {
      const hid = teamHeroes[idx];
      el.classList.toggle('active', idx === activeSlot);
      el.querySelector('.hs-slot-name')!.textContent = hid ? getHeroDef(hid).name : '未选';
      const face = el.querySelector('.hs-slot-face')!;
      face.innerHTML = '';
      if (hid) face.appendChild(portraitCanvas(hid, 36));
    });

    cards.forEach((c) => {
      const cid = c.dataset.id!;
      const inSlot = teamHeroes.indexOf(cid);
      c.classList.toggle('selected', cid === selected);
      let badge = c.querySelector<HTMLDivElement>('.hs-badge');
      if (inSlot >= 0) {
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'hs-badge';
          c.appendChild(badge);
        }
        badge.className = `hs-badge${inSlot === 0 ? ' is-player' : ''}`;
        badge.textContent = inSlot === 0 ? '👑 1号位' : `${inSlot + 1}号位`;
      } else if (badge) {
        badge.remove();
      }
    });

    q<HTMLDivElement>('.hs-start').classList.toggle('disabled', !selected);
    if (!selected) return;
    const def = getHeroDef(selected);
    q<HTMLDivElement>('.hs-name').innerHTML = `${esc(def.name)}<span class="hs-title">${esc(def.title)}</span>`;
    const range = def.projectileSpeed > 0 ? '远程' : '近战';
    // 定位里已经写了"远程 / 近战"（卓尔）时不再重复
    q<HTMLDivElement>('.hs-tags').innerHTML =
      `<span class="attr" style="background:${PRIMARY_COLORS[def.primary]}">${PRIMARY_NAMES[def.primary]}</span>` +
      `<span class="range">${range}</span>` +
      def.roles.filter((r) => r !== range).map((r) => `<span class="role">${esc(r)}</span>`).join('');
    q<HTMLDivElement>('.hs-stats').innerHTML = statsHtml(def);
    const list = q<HTMLDivElement>('.hs-abilities');
    list.innerHTML = abilitiesHtml(def);
    list.scrollTop = 0;
    // 渲染各个技能的程序化高清图标
    list.querySelectorAll<HTMLDivElement>('.hs-ab-icon-wrap').forEach((wrap) => {
      const abId = wrap.dataset.abId!;
      wrap.appendChild(getAbilityIconCanvas(abId, 48));
    });
    big.innerHTML = '';
    big.appendChild(portraitCanvas(selected, 150));
    preview?.show(selected);
  };

  const slotEls = [...s.querySelectorAll<HTMLDivElement>('.hs-slot')];
  slotEls.forEach((el, idx) => {
    el.addEventListener('click', () => {
      activeSlot = idx;
      selected = teamHeroes[activeSlot];
      render();
    });
  });

  if (o.preview === 'webgl') {
    import('../render3d/heroPreview')
      .then(({ HeroPreview }) => {
        if (closed) return;
        preview = new HeroPreview(canvas);
        previewBox.classList.add('live');
        if (selected) preview.show(selected);
        ro = new ResizeObserver(() => preview?.resize());
        ro.observe(canvas);
      })
      .catch((e) => {
        console.info('选人预览不可用，改用头像：', e);
        use2d();
      });
  } else {
    use2d();
  }

  const close = () => {
    if (closed) return;
    closed = true;
    ro?.disconnect();
    preview?.dispose();
    preview = null;
    s.remove();
  };
  s.close = close;

  for (const c of cards) {
    c.addEventListener('click', () => {
      const id = c.dataset.id!;
      if (!pickable.includes(id)) return;
      const existingIdx = teamHeroes.indexOf(id);
      if (existingIdx >= 0) {
        if (existingIdx !== activeSlot) {
          const curHero = teamHeroes[activeSlot];
          teamHeroes[activeSlot] = id;
          teamHeroes[existingIdx] = curHero;
        }
      } else {
        teamHeroes[activeSlot] = id;
      }
      selected = id;
      render();
    });
  }
  q<HTMLDivElement>('.hs-random').addEventListener('click', () => {
    if (pickable.length < 5) return;
    const pool = pickable.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    teamHeroes = pool.slice(0, 5);
    selected = teamHeroes[activeSlot];
    render();
  });
  q<HTMLDivElement>('.hs-start').addEventListener('click', () => {
    if (!selected) return;
    close();
    onStart(teamHeroes[0], teamHeroes);
  });
  q<HTMLDivElement>('.hs-back').addEventListener('click', () => {
    close();
    onBack();
  });
  render();
  return s;
}
