# 中路风云（dota-lane）

一个正在开发的 Dota 风格单路 3v3 MOBA 游戏，可在桌面浏览器和横屏手机浏览器中游玩。玩家控制一名英雄，与两名 AI 队友对抗三名 AI 英雄，摧毁敌方遗迹即可获胜。

本项目是独立的学习与开发作品，**并非 Valve 或 Dota 2 的官方项目**。游戏画面由代码生成，不使用 Dota 2 的游戏素材。

## 当前功能

- 10 名可选英雄，包含各自的技能、天赋、AI 行为、3D 模型与特效。
- 兵线、建筑、经验、经济、伤害、状态效果及胜负判定等对局系统。
- Three.js 3D 画面；在不支持 WebGL 2 的环境中使用 Canvas 2D 后备渲染。
- 手机横屏触控与桌面键鼠操作，支持三档难度。
- 可复现的 AI 对 AI 批量模拟，用于观察胜率、技能使用情况和平衡表现。
- 使用 Capacitor 构建 Android 测试 APK。

项目仍在开发中。物品与商店系统正在实现；玩法平衡和移动设备性能还需要继续验证。开发进度与已知问题见 [docs/PROGRESS.md](docs/PROGRESS.md)。

## 本地运行

需要 Node.js 24 和 npm。克隆仓库后运行：

```bash
npm ci
npm run dev
```

打开终端显示的本地地址（通常是 `http://localhost:5173`）。手机试玩时，让手机与电脑连接同一局域网，再打开终端显示的 Network 地址并横屏使用。

## 操作

进入游戏后选择难度和英雄。手机使用左侧摇杆移动、右侧按钮攻击或施放技能；轻点技能可智能施法，拖动可手动瞄准。桌面可用方向键或 A/S/D 移动、Q/W/E/R 施放技能、空格攻击、Esc 暂停。完整操作说明见 [开发进度文档](docs/PROGRESS.md#如何运行--试玩)。

## 开发与验证

```bash
npm test             # 运行自动化测试
npm run typecheck    # TypeScript 类型检查
npm run build        # 类型检查并构建网页版本
npm run sim -- --games 20 --seed 1 --difficulty normal --workers 4
```

模拟工具还支持固定阵容、指定英雄池和输出 Markdown 报告；参数示例见 [开发进度文档](docs/PROGRESS.md#常用命令)。Android 调试版 APK 可由仓库的 GitHub Actions 工作流构建；本地构建可运行 `npm run apk`，需要先安装 Android SDK。

## 项目结构

- `src/sim/`：不依赖浏览器的对局逻辑。
- `src/ai/`：英雄 AI 与行为规则。
- `src/render3d/`：Three.js 场景、模型和特效。
- `src/render/`：Canvas 2D 后备渲染。
- `src/game/`：游戏流程、输入和界面连接。
- `tests/`：自动化测试。
- `tools/simulate.ts`：批量对局与平衡分析工具。
- `docs/`：设计、数值资料、进度和平衡记录。

## 授权

本项目代码采用 [MIT 许可证](LICENSE)，版权所有者为 Lawrence。Dota 2 及相关名称属于各自权利人；本项目与 Valve 无关联。
