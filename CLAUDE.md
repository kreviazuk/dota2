# 中路风云（dota-lane）

横屏手机游戏：Dota 风格的 3v3 单路对战。TypeScript + Vite + Vitest，3D 用 Three.js（不支持 WebGL 2 时退回 Canvas 2D），界面是原生 DOM，用 Capacitor 打包安卓 APK。美术全部用代码生成，不使用任何外部素材。

## 先读这些
1. `docs/PROGRESS.md`：当前进度、所有已经做出的决定和偏离、已知问题、怎么运行。**做任何事之前先读。**
2. 当前阶段的实施计划：`docs/superpowers/plans/2026-10-08-p2-heroes.md`（P2 英雄，18 个任务，完成一个勾选一个）。
3. 设计文档：`docs/superpowers/specs/2026-09-29-dota-lane-design.md`。
4. 数值资料（Dota 2 7.41f）：`docs/research/dota2-heroes.md`、`docs/research/dota2-reference.md`。

## 现在做到哪里（2026-10-08 从云端会话交接，之后在本地继续）
- 分支 `claude/kind-ritchie-jz5131`，对应 PR kreviazuk/dota2#1（目标 `main`，还没合并）。
- P1 全部完成；3D 渲染器完成；**P2 全部完成（Task 1–18）**：引擎扩展、渲染 / AI 框架、选英雄界面和天赋弹窗、10 名英雄、混合阵容批量模拟和 P2 基线、浏览器 / 手机全面验证。10 名英雄全部可选：斧王、斯温、帕吉、主宰、幻影刺客、卓尔游侠、影魔、莉娜、宙斯、水晶室女。
- **下一步：P3（物品与商店，含 10 名英雄的神杖 / 魔晶，新技能放 X2 键）。P3 的实施计划还没写**，先按设计文档 §14 / §6.4 写计划（`docs/superpowers/plans/`），再按下面的流程逐个任务做。
- 批量模拟：`npm run sim -- --games 100 --seed 1 --workers 4 --report out.md`（缺省每局随机阵容，`--radiant` / `--dire` 固定阵容，输出含各英雄胜率、场均施放次数、未使用的技能）；P2 基线在 `docs/balance/balance-log.md`。
- 参考英雄：10 名英雄都已完成，每个英雄的文件结构相同：`src/sim/heroes/<id>.ts`、`src/ai/usage/<id>.ts`、`src/render3d/models/<id>.ts`、`src/render3d/fx/<id>.ts`、`tests/heroes/<id>.test.ts`。各英雄的特殊做法（链式骨骼、召唤物、钩子铁链、隐身、充能等）和偏离见 `docs/PROGRESS.md` 里各个"P2 Task N"的决定列表。

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

## 已知待处理
- 平衡（P2 基线 100 局，留给 P4 / P5，不在 P2 调参）：影魔（含判定胜率 81%）、莉娜（71%）偏强，幻影刺客（22%）、卓尔游侠（31%）偏弱；斯温在随机阵容里 54%（3 斯温对 3 斧王仍然一边倒）；帕吉的腐肉堆积后期层数很高。13–22 分钟内结束 52%（目标 ≥ 80%）。详见 `docs/PROGRESS.md` 的"已知的小问题"。
- 性能：P2 的 6 英雄技能团战在 CPU 4 倍降速下每帧约 14 毫秒（P1 7.3），绘制调用 120–190 次 / 帧；不降速时 2.5 毫秒（P1 2.8）。只在 headless Chromium（软件光栅化）里测过，**没有在真机（手机浏览器 / APK）上测过**，中端安卓的帧率未知。
- 本机截图：`hero.cjs` 的前摇 / 弹道冻结截图在低帧率下偶尔超时（文件名带 `-timeout` / `-nofx`），需要时用"`__game.timeScale = 0` + 手动 `session.match.step([])`"的办法补截。触屏测试用 CDP 的 `Input.dispatchTouchEvent` 时每个事件只带变化的那个触点，等待按游戏时间算。
