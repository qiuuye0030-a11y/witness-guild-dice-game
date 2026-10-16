# 见证者公会 · 互动式骰子文字游戏

当前源码：**v11（战斗规则V17、成长规则10081、特性预算矩阵3）**。单人离线养成与斗魂游戏，提供经典深靛、晨曦朝阳两种主题。

v11 以用户提供的 10.08.01 修订包为行为基线，合入其面板同步、战报历史、持续伤害与剑体修复，再叠加新版特性系统：移除旧通用被动，改用特性卡与固定武魂ID绑定（2447个可觉醒武魂＋17个会员/会长武魂，共2464条），收益矩阵升级为3，并提供可重跑的命名程序、独立查询页与本地HTTP端口。普通转正战只要任一方为辅助系即补齐搭档、进行对称2v2；挑战胜败后都能在结局页查看本场战报，保留最近30场。

## 游玩与构建

发布附件里的两个主题HTML全部资源内置，浏览器直接打开即可离线游玩。源码构建在仓库根目录：

```text
npm run build        # node systems/traits/build.cjs 重建特性数据，再 python _full_package.py 封装
```

需要 Node.js 22 与 Python 3.10+，只用标准库，无 npm 依赖。构建会在仓库根目录生成两份 `见证者公会_v11版_*.html` 与 `见证者公会_v11版_双前端分享包.zip`。

## 源码入口

- 战斗、成长、事件、骰子模块：`骰子系统/systems/`；主权威公式 `systems/battle/rules.js`，特性预算 `systems/traits/balance.js`，命名词库 `systems/traits/naming.js`。
- 特性系统说明：[骰子系统/systems/traits/README.md](骰子系统/systems/traits/README.md)；重建 `node systems/traits/build.cjs`，本地接口 `node systems/traits/test-http.cjs`。
- 冻结对照：`骰子系统/fixtures/`（`v11-before-matrix/`、`1006-reference/`、`1007-reference/`、`1008-before-rollback/`、`v13-baseline/`）。这些只用于对照，不进入游戏成品。
- 故事与事件：编辑 `骰子系统/story-source-1003.json`，再运行同目录 `_sync_story_data.py`。
- 旧版修订包参考：`修订包参考/`（仅修复说明与差异脚本）。

顶层 `core.js`、`campaign.js`、`campaign-events.js`、`systems/events/legacy-data.js` 与战斗引擎包由 `_sync_systems.py`、`_sync_v13.py` 生成，不要直接编辑，也不要追加 prototype 覆盖补丁。

## 验证

在仓库根目录：

```text
npm test             # node 骰子系统/tools/check-v11.cjs，12 套回归
npm run package      # python 骰子系统/tools/package-v11.py，核对分享包与生成物一致并打出两个发布ZIP
```

构建必须先于检查：检查读取生成后的引擎包与两个主题HTML。`npm run package` 还会读取 `骰子系统/output/v11/最终回归.json`，因此要先跑 `npm test`。

耗时较长的配对矩阵复测（`tools/balance-matrix3-v11.cjs`、`balance-growth-v11.cjs`、`balance-growth-coverage-v11.cjs`、`balance-members-v11.cjs`、`tools/report-v11.py`）不是日常必跑项，步骤与限制见[开发与复测说明](开发与复测说明.md)。真实浏览器视觉验收本轮未完成，只做了语法、数据与纯DOM替身检查，详见[数值与验收报告](v11版_数值与验收报告.md)。

GitHub 自动检查按“重建特性数据 → 封装两个主题 → 12套回归 → 封装核对”执行，远端结果以 Actions 为准。

## 项目管理

- [开发与提交约定](CONTRIBUTING.md)
- [后续任务板](docs/BACKLOG.md)
- [v11 开发与复测说明](开发与复测说明.md)
- [v11 数值与验收报告](v11版_数值与验收报告.md)
- [特性卡修订说明](v11版_特性卡修订说明.md)
- [特性命名程序使用说明](特性命名程序使用说明.md)
- GitHub 问题模板与 PR 检查清单在 `.github/`。

## 版本记录

- v11：以 10.08.01 修订包为基线，合入面板/战报/持续伤害/剑体修复；特性卡重做（移除旧通用被动、矩阵3、固定ID绑定与统一命名）；辅助系对称2v2；挑战战报保留最近30场并支持导出；成长回调曲线10081。
- 10.06 及更早版本通过标签与发布记录保留，其源码与验收文档见 `v10.06` 标签。

个人存档、聊天资料、小说原文、凭据与整套历史备份不进入仓库；离线HTML/ZIP 通过发布附件分发。
