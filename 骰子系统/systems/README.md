# 当前10.06源码入口

以本目录作为运行规则编辑源，保留10.05已完成的模块化结构。V14有效修正已迁入现有模块，Battle与Campaign均只在compose.js装配一次。没有新增运行时逐层覆盖原型的补丁链。

|文件/目录|职责|
|---|---|
|dice/engine.js|种子随机数、骰点与骰序|
|events/legacy-events.json|旧存档兼容事件；不能当作当前事件池|
|events/scenes.js|事件境遇说明；168事件与10任务链仍编辑顶层story-source-1003.json|
|campaign/core.js|人物、成长、猎魂、奖励、V13/V14读档和真实败局记录|
|campaign/quests.js|任务链、预留、连续篇章、终章奖励与兼容|
|campaign/journey.js|考核次数、模式、猎魂计月、日历和旅程快照|
|campaign/compose.js|唯一Campaign公开方法表|
|battle/rules.js、examiners.js|基础规则与14名会员最终资料|
|battle/core.js|角色、资源、行动、时钟与结算；构造器直接处理V14护盾初始化|
|battle/control.js、control-rules.js|控制规则、效果执行及兼容配置|
|battle/forecast.js|保留的公开行动序列辅助接口，不再承载旧AI评分策略|
|battle/status.js、attributes.js、permanent-effects.js|同源刷新、属性、闪避、持续状态、快照|
|battle/members.js|专属成员机制与共用行动逻辑|
|battle/shields.js|独立护盾通道、来源分层、外层优先、一次性消耗及自身强化合法目标|
|battle/projection.js|公开状态副本与真实结算预测，不读取未来随机数|
|battle/unified-decision.js|唯一正式AI候选、评分与决策；保留冻结V14的18秒策略|
|battle/compose.js|74个公开方法一次装配|

顶层achievements.js为成就档案与规则编辑源，campaign-creation.js记录初始潜力；campaign-ui.js、skill-text.js、battle-ui-v13.js及主题CSS为界面源。

顶层core.js、campaign.js、campaign-events.js、battle-engine-v13-player.js、battle-v13-browser.js和battle.js由构建生成，不手改。部分文件名及WitnessControlV9/WitnessV13Rules接口名为兼容保留；实际战斗规则为14。培养与战斗原有的派生公式差异保持。

旧decision.js和poison-ai.js已退出运行源，完整旧文件保存在“历史完整游戏/10.05模块化源码_10.06开发前.zip”。现有模块通过具名函数复用必要的基础行动，不捕获原型旧方法叠加补丁。

在“骰子系统”目录执行：

```text
python _full_package.py
node tools/check.cjs
node tools/verify-campaign-1006.cjs
python verify-package-1006.py
```

构建入口为_build_1006.py，先同步模块再输出两主题，不覆盖旧10.05成品。游戏10.06，完整存档格式9，战斗快照结构10，战斗规则14。

tools/check.cjs需要相邻的冻结V14参考目录；开发源码包包含所需参考。tools/migrate-1006.py、implement-1006-content.py等为一次性迁移记录，不是日常构建入口，不应重复运行。

output/1006-final保留1468场最终对照证据；output/1006-strategy保留未上线策略候选与反事实研究。改动AI后应使用新实验目录与标签，不能复用旧结果说明新代码。
