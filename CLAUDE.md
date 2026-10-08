# 中路风云（dota-lane）

横屏手机游戏：Dota 风格的 3v3 单路对战。TypeScript + Vite + Vitest，3D 用 Three.js（不支持 WebGL 2 时退回 Canvas 2D），界面是原生 DOM，用 Capacitor 打包安卓 APK。美术全部用代码生成，不使用任何外部素材。

## 先读这些
1. `docs/PROGRESS.md`：当前进度、所有已经做出的决定和偏离、已知问题、怎么运行。**做任何事之前先读。**
2. 当前阶段的实施计划：`docs/superpowers/plans/2026-10-08-p2-heroes.md`（P2 英雄，18 个任务，完成一个勾选一个）。
3. 设计文档：`docs/superpowers/specs/2026-09-29-dota-lane-design.md`。
4. 数值资料（Dota 2 7.41f）：`docs/research/dota2-heroes.md`、`docs/research/dota2-reference.md`。

## 现在做到哪里（2026-10-08 从云端会话交接，之后在本地继续）
- 分支 `claude/kind-ritchie-jz5131`，对应 PR kreviazuk/dota2#1（目标 `main`，还没合并）。
- P1 全部完成；3D 渲染器完成；P2 完成 Task 1–9（引擎扩展、渲染 / AI 框架、选英雄界面和天赋弹窗、斯温、莉娜）。可选英雄：斧王、斯温、莉娜。
- **下一步：P2 Task 10（水晶室女）**，然后按计划顺序做 Task 11–18（宙斯、卓尔游侠、幻影刺客、主宰、帕吉、影魔、混合阵容模拟、全面验证）。
- 参考英雄：斯温（近战，模型带武器）；莉娜（远程法师：`src/render3d/models/lina.ts` 的链式头发骨骼，`src/render3d/fx/lina.ts` 的弹道逐帧发射器 `emitter` 和区域效果双圈 `extra()`）。

## 每个任务的做法
每个任务都按同一个流程走（云端会话就是这么做的）：
1. 读计划里该任务的整节，以及计划开头的 Global Constraints / Decisions / File Structure；读 `docs/PROGRESS.md` 的"P2 英雄：进行中"一节。
2. 读这个任务要接入的真实代码。英雄任务以**最近做完的英雄（斯温、莉娜）**为参考：`src/sim/heroes/sven.ts`、`src/ai/usage/sven.ts`、`src/render3d/models/sven.ts`、`src/render3d/fx/sven.ts`、`tests/heroes/sven.test.ts`、`tests/heroAi.ts`。计划和代码不一致时按真实代码调整，保持计划想要的行为。
3. 实现该任务的每一步，包括测试。不要顺手做后面的任务。
4. 英雄任务包括：全部技能、先天技能和 8 个天赋（带测试），AI 使用规则、加点和天赋顺序，`src/game/roster.ts` 里设为可选，3D 模型、动作和特效，2D 后备外观和特效。
5. 验证（全部通过才算完成）：
   ```bash
   npm test && npm run typecheck && npm run build
   npm run sim -- --radiant <英雄>,axe,axe --dire <英雄>,sven,axe --games 4 --seed 1   # AI 混合阵容能正常打完，并统计每个主动技能都被放过
   ```
   渲染相关的改动要截图，**亲自看截图**，确认在手机尺寸下清楚、好看、和其他英雄区分得开，控制台 0 报错（见下面"截图"）。
6. 对照计划和数值资料，挑剔地复查自己的 diff，修掉问题。
7. 在计划里勾选该任务的步骤；在 `docs/PROGRESS.md` 的 P2 表格里标 ✅，把偏离计划的地方和新的决定追加进去（中文）。
8. 提交：代码一个提交（用计划里给的提交信息，格式 `feat(scope): ...`），文档一个提交 `docs: progress (P2 task N)`。推送到 `claude/kind-ritchie-jz5131` 后，GitHub Actions 会自动打 APK。

## 规则（摘自计划的 Global Constraints）
- `src/sim/**`、`src/ai/**`、`src/game/**` 不能用 DOM / `window` / `localStorage` / `performance` / `Math.random()`（`tests/purity.test.ts` 会检查）。随机数只能用 `world.rng`。
- 渲染层只读 World 状态、消费事件队列，不改模拟。
- 通用的可调参数放 `src/sim/data/balance.ts` 的 `BALANCE`；英雄数值写在各英雄的 `AbilityDef.values` 里，以研究资料为准。
- 界面文字用中文，代码标识符用英文。
- 每个任务结束时 `npm test`、`npm run typecheck`、`npm run build` 都必须通过，游戏必须能玩。
- 不要推送 `main`；合并 PR 由用户决定。
- 计划里写的 `/opt/...` 路径（Playwright、Chromium）和 `$SCRATCH` 目录是云端容器的，本地请用下面的方式。

## 截图（本地）
```bash
npm i --no-save playwright && npx playwright install chromium   # 只需一次
npm run dev                                                      # 另开一个终端
HERO=lina MODE=3d VIEW=phone node tools/screenshots/hero.cjs     # 截图在 .shots/（不提交）
```
- `MODE=2d` 检查 2D 后备，`VIEW=desktop` 是 1280×720，`VIEW=phone` 是 844×390、DPR 2、触屏。
- 新英雄要先在脚本的 `PLAN` 里加上该英雄每个主动技能的截图时刻。
- 开发服务器下有调试钩子 `window.__game`：`start({ hero, radiant, dire, difficulty })`、`debug.level / refresh / lineup / freezeAI / place / cast`、`sim.*`、`timeScale`。正式构建里没有这些钩子。

## 已知待处理（交接时记下的）
- 斯温开神之力量时，红色描边和自发光太强，模型几乎变成一团红色，看不清。在 `src/render3d/fx/sven.ts` 里调淡。
- 斯温偏强：3 斯温对 3 斧王 4 局全胜。留到 Task 17 的模拟和 P5 平衡阶段处理。
- 3D 只在软件 GPU 上测过，真机帧率还没有测。
