# 开发约定

游戏版本以VERSION为准，当前v12.05.01，战斗规则V17，成长规则10081。

修改前读“骰子系统/systems/v12/modules/README.md”（独立讨伐模块包）。主游戏规则编辑`骰子系统/systems/`，讨伐与魂骨规则编辑`骰子系统/systems/v12/`，模块包编辑`systems/v12/modules/src/`。不要直接修改生成的引擎包（`battle-v13-browser.js`、`battle-engine-v13-player.js`、`battle.js`、`core.js`、`campaign.js`、`campaign-events.js`、`systems/v12/modules-bundle.js`）或追加prototype覆盖补丁。

在仓库根目录运行`npm run build`（生成主题HTML与分享包），随后`npm test`（封装核对）与`npm run regression`（15组回归）。构建必须早于检查，因为两项检查都读取生成后的主题HTML与`v12.05.01版双前端分享/构建清单.json`。纯数值与结构检查无npm依赖；Python只用标准库。

改动`systems/v12/modules/data/`的魂兽或NPC数据后，先跑该包的`node tools/build-beasts.cjs`再跑`node tools/check.cjs`；改`systems/v12/`的界面、效果视图或魂骨说明样式后重跑整条回归链。

两条不可删的“文档即输入”：`systems/v12/modules/reference/v12_重大更新交接文档.md`（`tools/lib/doc-text.cjs` 按路径读取，用于定稿文本校验）与 `systems/v12/modules/reference/魂兽资料_*.txt`（魂兽编目来源）。清理中文文档时不要删除它们。

`tools/verify-v1204.cjs` 的两个基线来自 `fixtures/v12.02-reference/dawn.css` 与 `fixtures/v12.04-reference/trait-pool.json`（仓库已收入，原脚本读取同级开发目录）。更新这两个基线等于改验收口径，必须在提交说明里写清楚。

新功能或规则修改与纯重构分开提交。说明种子、模式、对照和预期差异；保持旧存档、已用讨伐次数、已获得等级与已装备魂骨。`fixtures/`下的冻结对照不得改写来迁就候选代码。提交说明描述结果，不把未完成实验写成已修复。

推荐在main上按待办编号单独开分支，完成后合并。只调整明确变化的版本断言，保留原业务断言。`output/v12/`、`output/v11/`、`output/1008/`中的证据文件是可复核记录，可随检查更新，但不要在提交里手工篡改结论；`output/*封装核对.json` 记录绝对构建路径，构建后会显示为已修改。

不提交个人存档、账号凭据、小说原文、QQ资料、依赖目录、完整历史备份或验收副本。离线HTML/ZIP通过发布附件分发，源码与测试数据归Git管理。历史标签保留，不强推覆盖。
