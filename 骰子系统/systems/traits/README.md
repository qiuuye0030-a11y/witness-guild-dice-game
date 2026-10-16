# 魂性谱 v2 · 十档数值与自动适配

v11沿用10.08修订版武魂库与固定绑定。覆盖2447个可觉醒武魂与17个会员/会长武魂ID，共2464条。属性关键词和触发结构保留；名字由属性命名器统一更新，并附旧新名映射。

打开**魂性谱.html**可离线查询每个武魂的确切数字、限制和相近机制。详表见**分档数值与自动结算说明.md**；检查结果见**balance-verification.json**。

## 当前范围

- 按实际武魂潜力1—10档配置预算，变异升档只更新数字，不重抽特性。
- 移除手选特性分支。训练肉体，自动作用于这次肉体训练；训练敏捷，就作用于敏捷。战斗按本次实际魂技类别匹配。
- 提供触发状态、到期、叠层、自动结算、重复事件去重与存档恢复接口。
- 原成长类的成功机会改为有上限的成果补足，不直接修改剧情骰点、经验倍率或原骰序；能力增加仍可能间接影响后续判定。

**v11已由 systems/battle/traits.js 与 systems/campaign/traits.js 接入主游戏。此目录仍提供可复用的独立v2规格与预算端口；规格对象的runtimeEnabled:false表示对象自身不执行游戏，实际启用状态见WitnessTraitRuntime.enabled。配对验算另见v11数值报告。**

## 数值规则

收益矩阵已升级为3，详细分档和边界见《分档数值与自动结算说明.md》。基础效力6%—27%，按兑现方式与稀有条件补偿，攻击/护盾上限50%，减耗18%，读条缩短22%。

控制仍需正常精神对抗并遵守免控，单次额外时长上限0.5秒。强化/减益整次施法额外幅度上限5个百分点。多段、持续伤害和多项强化共享一次施法预算。

每场最多兑现8次，间隔至少4秒；即时12秒、储存20秒、叠层28秒、转化18秒，最多保留4次正常魂技选择。通常叠2层，稀有事件1层。

成长比例3%—13.5%，每阶段另受0.75—3.00点上限与最多2次兑现约束。只加B/S/C/D/A/P，不直接加XP、W、气运、魅力或额外资源。稳定型补足差额35%，领悟型最多0.06×潜力，均受相同比例和阶段上限限制。

状态结构保持v2兼容，`budgetVersion:3`标记新矩阵。导入旧档不补发过去收益、不扣既有成长。命名依据主属性、属性关键词和武魂ID，详见根目录《特性命名程序使用说明.md》。

## JavaScript接口

```js
const Traits = require('./index.js');
const registry = Traits.createRegistry(require('./traits.json'));
const trait = registry.getBySoulId('T08-08');
registry.getForCharacter({ soulId: 'T08-08', effectiveTier: 10 });
registry.list({ tier: 8, attribute: '冰', limit: 20 });
registry.audit();
registry.checkName('冰碧蝎·低温回响');
registry.suggestNames(trait, { replaceSoulId: trait.soulId });
registry.checkCandidate(candidate, { replaceSoulId: candidate.soulId });
```

浏览器依次加载骰子引擎、tables.js、balance.js、index.js、traits-data.js，调用WitnessTraits。

### 自动结算

```js
let state = registry.createState(trait.soulId, 'battle-unique-id');
// 实际事件发生后通知模块，type须匹配trait.spec.event。
state = registry.recordEvent(trait.soulId, state, {
  id: 'cast-123', type: trait.spec.event, time: 12,
  hasShield: true, hpFraction: 0.8, mpFraction: 0.7,
  actualContribution: 10, contributionReference: 10
}).state;
// 读取玩家下一次正常选择的魂技，amount是整次施法总量。
const result = registry.applyToChoice(trait.soulId, state, {
  id: 'cast-124', time: 13, category: '攻击', amount: 100,
  parts: [30, 30, 40]
});
state = result.state;
// 适配层将result.choice替代原本结算，不能两份都加。
```

成长传`{id, stage, trainingKey:'B', rewardKey:'B', amount:实际训练值, expectedAmount:正常预期值}`。rewardKey优先，防止训练上下文是B却把XP奖励加成。未提供则用trainingKey。多项奖励必须传各自真实奖励项，不能重复使用同一总成长基数。

减耗传category和cost；读条传category和castSeconds；成功控制传`category:'控制', amount:正常判定后的秒数, success:true, immune:false`。强化/减益的amount为小数幅度合计，parts可放各维度幅度。普攻事件可以触发积累，但普通攻击本身不消费付费魂技收益。

每次事件/结算需要稳定ID，同次施法的多段使用同一事件ID。不能同一事件同时生成和消费收益。特性派生事件传generatedByTrait:true，无效训练传valid:false或validTraining:false。

转化的actualContribution/contributionReference必须同量纲，例如本次实际支付魂力/正常魂力预算、实际吸收伤害/正常防护预算。缺少真实基数不触发，不接受任意奖励倍率。

接口不修改输入，必须保存返回的state。time/stage不能倒退，scopeId必须对应同一战斗或旅程。变异后传effectiveTier更新预算，但不会清空次数与总额。不能同场重建状态刷新次数。

## 本机HTTP接口

运行`node server.cjs`后访问http://127.0.0.1:18768；可传其他端口。只在本机监听，不写游戏存档。

|方法|接口|用途|
|---|---|---|
|GET|/|审阅页|
|GET|/api/health|端口版本、预算/命名版本及主游戏接入状态|
|GET|/api/traits/T08-08|按武魂ID查询|
|GET|/api/traits?tier=8&attribute=冰|按潜力、属性筛选|
|GET|/api/balance|十档预算|
|GET|/api/attributes|词库|
|GET|/api/audit|全库查重|
|GET|/api/check-name?name=名称|查重名|
|POST|/api/check|candidate及可选replaceSoulId|
|POST|/api/name|candidate及可选replaceSoulId|
|POST|/api/state|soulId、scopeId及可选effectiveTier|
|POST|/api/observe|soulId、state、event|
|POST|/api/evaluate|soulId、state、choice；返回自动适配结果|

POST使用JSON。状态由调用方保存，服务器不持久化游戏数据。

## 查重、升级和验证

查重排除ID、名字、属性文案、档位与数字，保留428组相近家族供审阅。零严格重复不等于全库玩法完全不同。

v1数据可调用Traits.upgrade(oldData)升级，移除routes/selectedRoute。扩库用Traits.generate(newCatalog,{existing:currentData})保留绑定。

```text
node build.cjs
node test.cjs
node test-balance.cjs
node test-http.cjs
python package.py
```

不改源武魂库、会员模板或主游戏成长与战斗公式。浏览器视觉检查曾受file协议限制未完成；本版只报告语法、数据与纯DOM替身交互检查，不冒充真实视觉验收。
