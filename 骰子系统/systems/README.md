# 当前10.05的源码入口

这里是运行规则的编辑源。顶层的core.js、campaign.js、campaign-events.js、battle-engine-v13-player.js等为构建产物，保留原有浏览器/Node接口，不手工修改。

|目录|职责|
|---|---|
|dice/engine.js|带种子的随机数、骰点、记录；保留原骰序与拒绝采样|
|events/legacy-events.json|旧存档兼容文本，不能当作当前事件池|
|events/scenes.js|按事件类型生成境遇说明；当前168事件和10任务链仍编辑story-source-1003.json|
|campaign/core.js|人物、成长、事件判定、奖励、猎魂的通用计算|
|campaign/quests.js|任务链选择、预留、节点推进、连续篇章、终章奖励与旧存档校验|
|campaign/journey.js|考核次数、四轮猎魂计月、入会日期、环节展示数据|
|campaign/compose.js|唯一的Campaign公开方法表和静态校验入口|
|battle/rules.js|战斗内派生属性、技能基础公式、魂力规则|
|battle/examiners.js|14名会员的最终资料和六技；不再经历历史模板逐轮覆盖|
|battle/core.js|角色/技能标准化、阵容、行动条、读条、资源与结算、通用AI候选评分|
|battle/control.js|控制/旧减益类型的执行和估值、兼容配置接口|
|battle/forecast.js|公开战场状态下的未来行动与资源收益估计|
|battle/status.js|同源刷新、异源叠加、整场增幅和持续伤害|
|battle/attributes.js|六维增减、有效属性、费用/读条、主动闪避、最终战斗快照|
|battle/permanent-effects.js|减益整场持续的统一处理|
|battle/members.js|血锢、血夜、分身、冰甲等会员机制，以及最终伤害计算|
|battle/decision.js|唯一AI决策入口，按专属行动、通用行动、多维收益依次选择|
|battle/compose.js|唯一Battle公开方法表，61个方法一次装配|

两个manifest.json明确列出构建顺序。模块通过具名函数协作，保留this表示当前战斗/旅程；不再通过截取prototype方法、覆写方法、再覆写来更新规则。通用行动规划、资源扣除等仍可被多个机制调用，这是复用，不是保留失效实现。

培养与战斗的派生属性公式在V13中原本存在差异。此次以行为不变为目标，分别保留，不能直接合并成一套公式。WitnessControlV9等旧接口名称为兼容外部入口而保留，不表示游戏降回旧规则。

## 修改与验证

```text
python _full_package.py
node tools/check.cjs
python verify-package-1005.py
```

以上命令在“骰子系统”目录运行。构建会先同步systems，再构建两个独立HTML。修改当前事件JSON后，先运行_sync_story_data.py。

对照代码在fixtures/v13-baseline，只供测试，不会进入游戏HTML。不要通过修改对照组让差异测试通过。新的玩法修改应另行说明预期差异；本轮游戏版本仍10.05、战斗V13、存档格式9。
