# 开发约定

游戏版本以VERSION为准，当前v11，战斗规则V17，成长规则10081，特性预算矩阵3。

修改前读“骰子系统/systems/README.md”与“骰子系统/systems/traits/README.md”。规则编辑`骰子系统/systems/`；故事编辑`story-source-1003.json`；特性词库与预算在`systems/traits/`。不要直接修改生成的引擎包（`battle-v13-browser.js`、`battle-engine-v13-player.js`、`battle.js`、`core.js`、`campaign.js`、`campaign-events.js`）或追加prototype覆盖补丁。

在仓库根目录运行`npm run build`（先重建特性数据，再封装两个主题），然后`npm test`（12套回归）与`npm run package`（封装核对）。构建必须早于检查，因为回归读取生成后的引擎包与主题HTML。纯数值与结构检查无npm依赖；Python只用标准库。改动`systems/traits/`后必须重跑`node systems/traits/build.cjs`，否则主题HTML内嵌的还是旧特性数据。

新功能或规则修改与纯重构分开提交。说明种子、模式、对照和预期差异；保持旧存档、已兑现次数与既有绑定。`fixtures/`下的冻结对照（`v11-before-matrix/`、`1006-reference/`、`1007-reference/`、`1008-before-rollback/`、`v13-baseline/`）不得改写来迁就候选代码，也不要用旧关闭特性基线充当当前对照：删除旧通用被动后必须用当前引擎重算开关两侧。

推荐在main上按待办编号单独开分支，完成后合并。提交说明描述结果，不把未完成实验写成已修复。只调整明确变化的版本断言，保留原业务断言。`output/v11/`与`output/1008/`中的证据文件是可复核记录，可随检查更新，但不要在提交里手工篡改结论。

不提交个人存档、账号凭据、小说原文、QQ资料、依赖目录、完整历史备份或验收副本；含剧透的隐藏成就条件与开发记录同样不进入仓库和发布包。离线HTML/ZIP通过发布附件分发，源码与测试数据归Git管理。历史标签保留，不强推覆盖。
