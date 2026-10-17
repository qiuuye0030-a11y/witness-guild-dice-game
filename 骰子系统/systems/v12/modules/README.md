# 讨伐与魂骨 · 独立模块包

按《v12 重大更新交接文档》拆分出的**可独立运行、可拼接**的模块集合。

- **不是 v12 版本。** 本目录不产出任何游戏构建、HTML、分享包或版本号。
- **未接入主游戏。** 没有修改 `v11.01开发/骰子系统`、`友方npc` 或任何既有存档；所有改动只在本目录内。
- **只做“拆分 + 拼接准备”。** 交接文档第十八节列出的八个封装各自成模块，另有共用底座与校验器；拼接步骤见《拼接说明.md》，逐节核对见《核对报告.md》。
- **数值调用战斗侧代码。** 评级、派生值、魂技生成、控制结算、魂环分档都通过 `src/bridge/v1101.js` 调用 v11.01 的 `WitnessRules`（默认优先接 `v11.01武魂精简开发`，即已移除魂性谱随机特性的基线；拼接时也可直接注入活着的规则对象），本包不另写一套战斗数值。

当前修订：`0.2.0-beasts.1`。`node tools/check.cjs` → **188 项全部通过**。三例魂兽已正式编目，魂骨改为随机六部位，魂技统一继承武魂属性标签；见[本轮更新说明](三例魂兽与属性标签更新说明.md)和[三例魂兽目录](data/beast/十万年魂兽库_三例.md)。此前审查见[独立审查与修复报告](独立审查与修复报告.md)。

## 目录结构

```text
独立模块包/
├─ src/
│  ├─ versions.js                 各封装/池/实例的规则版本号
│  ├─ rng.js                      与游戏 DiceEngine 同算法的确定性投骰 + 投骰日志
│  ├─ text/hunt-texts.generated.js 从交接文档逐字生成的定稿文本（禁止手改）
│  ├─ hunt/                       讨伐事件控制器
│  │  ├─ conditions.js            80级 + 当前凶级以上的固定触发
│  │  ├─ allies.js                家境档位→人数→不放回抽人，一次落盘
│  │  ├─ ledger.js                任务账本与状态机
│  │  ├─ flow.js                  原普通流程恢复点
│  │  ├─ battle.js                1对1/2对1/3对1 队伍与胜负判定
│  │  ├─ texts.js                 定稿文本的安全节点取用
│  │  └─ controller.js            邀请→接受/拒绝→队友→到场→前进→战斗→结果→恢复
│  ├─ npc/
│  │  ├─ roster.js                友方NPC只读名录（稳定ID绑定）
│  │  ├─ combat.js                八技→引擎技能、operations→宿主原语、特性运行时
│  │  └─ traits/                  程良、徐太平、赛利亚的特性状态机
│  ├─ beast/library.js            十万年魂兽库（空库 + 校验 + 稳定选取 + 实例隔离）
│  ├─ soulbone/
│  │  ├─ drop.js                  万年掉骨 1d10000 线性曲线、唯一成果ID、一次成果一次结算
│  │  ├─ ten-thousand.js          万年骨一次装配：部位→实例→属性预算→特性池
│  │  ├─ trait-pool.js            魂骨特性池：筛选→权重抽取→待处理状态
│  │  ├─ handlers.js              特性处理器登记表（正式池为空）
│  │  ├─ instance.js              魂骨实例、属性预算、部位抽取、导出/导入
│  │  ├─ absorption.js            吸收、装备来源账本、运行时特性注册、部位冲突
│  │  └─ migrate.js               旧随机武魂特性清理 + 旧魂骨技能/旧E02迁移
│  ├─ reward/
│  │  ├─ ring.js                  十万年魂环两技共享冷却、90级预留/吸收
│  │  ├─ inheritance.js           一条/全部继承 25%/75%
│  │  ├─ transaction.js           九步奖励事务、幂等断点续结
│  │  └─ runner.js                把九步接到一起的首胜执行器
│  ├─ battle/
│  │  ├─ hooks.js                 受伤/护盾/控制/回魂/行动起止/战斗结束 统一事件
│  │  └─ equipment.js             装备来源修正只叠加一次，不写成长
│  ├─ bridge/v1101.js             调用 v11.01 规则与战斗代码的桥
│  └─ splice/compose.js           一次性装配入口
├─ data/
│  ├─ npc/                        三位友方NPC的只读快照 + sha256 清单
│  ├─ beast/library.json          空库（等待用户补充正式魂兽）
│  └─ soulbone/trait-pool.json    空池（等待用户编写魂骨特性）
├─ tools/
   ├─ check.cjs                   总校验入口
   ├─ check-text / numbers / npc / modules / engine / static / sync
   ├─ demo.cjs                    端到端演示（固定数据，不写正式库）
   ├─ extract-texts.cjs          从交接文档机械提取定稿文本
   ├─ sync-npc.cjs               同步友方NPC快照
   └─ lib/                       校验框架、文档解析、固定数据
```

## 快速开始

```js
const { createModules } = require('./src/splice/compose');

const modules = createModules();          // 默认注入 v11.01 的 WitnessRules
modules.status();                         // 名录、空库、空池、NPC适配就绪情况
```

跑校验：

```powershell
node tools/check.cjs
```

看一遍端到端流程（使用 tools 下的固定数据，不碰正式库）：

```powershell
node tools/demo.cjs
```

校验器只读本包、交接文档与 v11.01 规则代码，不写主游戏文件。

## 运行环境与路径

- Node.js ≥ 18；不需要安装依赖。
- 默认从 `../../v11.01武魂精简开发/骰子系统` 加载 `v13-runtime.cjs` 取 `WitnessRules`（该版已移除魂性谱随机特性运行模块与数据）；不存在时退回 `../../v11.01开发/骰子系统`。目录不同可用环境变量 `WITNESS_GAME_DIR` 指定，或在拼接时直接注入活着的规则对象。
- `tools/sync-npc.cjs` 默认从 `../../友方npc/characters` 同步名录快照；`tools/check.cjs` 会用 sha256 比对来源，来源改版后提示重新同步。
- 把本目录整体移到别处时，文本提取（依赖交接文档）与规则桥（依赖 v11.01）需要相应调整路径；纯数据与纯规则模块（投骰、掉率、继承、魂骨实例、迁移）不依赖外部路径。

## 与交接文档的对应

| 交接文档 | 本包实现 | 说明 |
|---|---|---|
| 第三节 固定触发条件 | `src/hunt/conditions.js` | 等级≥80、当前≥凶级、未处理；不投触发骰、不进权重池 |
| 第四节 邀请/拒绝/接受 | `src/hunt/texts.js`、`controller.js`、`ledger.js` | 文本逐字来自文档；两个选项本身无收益 |
| 第五节 家境判定友方NPC | `src/hunt/allies.js` | 6/7档概率为文档“建议值”，单独标注 |
| 第六节 到场正文与前进 | `src/npc/roster.js`、`hunt/texts.js` | 指定顺序整段显示；必须点前进才狩猎 |
| 第七节 讨伐战模式 | `src/hunt/battle.js` | 1/2/3对1，不补敌方支援，不占挑战账本 |
| 第八节 十万年魂兽库 | `src/beast/library.js` | 空库停在待办；不造假目标、不空战 |
| 第九节 十万年来源限制 | `src/reward/ring.js` | 只记录合法入口，99999 与 100000 精确区分 |
| 第十节 万年掉骨骰 | `src/soulbone/drop.js` | 1d10000 曲线；唯一成果ID；一次成果一次结算 |
| 第十一节 魂骨实例 | `src/soulbone/instance.js` | 身份/来源/基础/数值/特性/骰序/状态 + 导出/导入校验 |
| 第十二节 特性装配 | `src/soulbone/ten-thousand.js`、`trait-pool.js` | 万年骨一次装配：部位→实例→预算→只抽一条；空池显式待处理 |
| 第十三节 十万年继承 | `src/reward/inheritance.js`、`ring.js` | 25%全部/75%一条；继承冻结；只有一块骨 |
| 第十四节 奖励事务 | `src/reward/transaction.js`、`runner.js` | 九步顺序、同一胜利唯一事务、幂等断点续结 |
| 第十五节 预存九环 | `src/reward/ring.js` | 不足90预留；吸收时按当前面板重算两技；缺环排队；已有九环不覆盖 |
| 第十六节 吸骨不占事件 | `src/soulbone/absorption.js` | 属性进装备账本、特性进运行时来源；冲突不丢骨 |
| 第十七节 旧档迁移 | `src/soulbone/migrate.js` | 只清随机武魂特性；保留角色/NPC/魂骨特性 |
| 第十八节 封装边界 | 上述全部 + `splice/compose.js` | 职责分离，不互相越界 |
| 第十九节 战斗特性适配 | `src/npc/combat.js`、`npc/traits/*` | 三位NPC特性状态机 + operations 执行器 |
| 第二十二节 验收清单 | `tools/check-*.cjs`、`验收清单.md` | 逐项标注覆盖程度 |

## 已定 / 建议 / 待确认

包内把三类信息分开标注，避免把建议当成用户定稿：

- **用户已定**：等级≥80、当前≥凶级、凶/狂/神均满足；高于5档才有概率、8—9档必有1位、10档必有2位；胜利才得环与骨；魂骨自动吸收且不占事件；90级吸收预留九环；1—5档无援军。
- **文档建议值（可调）**：6档50%、7档75%；1d10000 线性掉骨曲线；25%全部/75%一条继承。
  这些集中在 `ALLY_RULES`、`thresholdForLuck`、`DEFAULT_CONFIG`，改一处即可，存档结构不变。
- **仍待用户确认（本包不擅自决定）**：魂骨六维预算；魂骨特性池内容；十万年魂兽正式定义；讨伐失败重试次数与时间代价；已有九环是否允许主动替换；旧骨潜力变异是否与新属性并存；第九环极端出目是否同时必得骨。

## 空库与空池的明确行为

| 状态 | 行为 |
|---|---|
| 魂兽库为空 | “前进”后任务停在 `awaiting-library`，保留接受与援军结果，可返回普通流程；不空战、不自动胜利、不发占位奖励 |
| 特性池为空 | 万年骨照常获得，但特性进入 `pending`，不显示“特性已生效”，不拿旧武魂特性凑数 |
| 处理器缺失 | 该特性不进入候选，`unavailable` 报告 `handler-missing`，界面不得展示为已生效 |
| 属性预算未定 | `attributes` 恒为 `null`，实例带 `attribute-budget-unset`；不照抄Boss面板、不编造六维 |
| 部位冲突 | 新骨进背包，返回独立换骨会话；未确认前不拆旧骨、不丢新骨 |
| 已有九环 | 新环保留为待处理，不覆盖、不生成第十环、不塞第三技能 |

## 如何补齐正式内容

**十万年魂兽**：已有霜苔巨蛙、霜蚋、沧渊帝螈。编辑 `data/beast/catalog-source.json` 后运行 `node tools/build-beasts.cjs`，重建 `library.json` 与阅读目录；不要只修改生成文件。每只四个主动技能、两条原被动，魂骨部位用 `random`。被动与继承处理器已存规范，尚待宿主实现。

**万年魂骨**：正式结算调用 `modules.soulbone.tenThousand.settleTenThousandBone(store, input)`，结果为 `{bone, duplicate}`。将该账本与角色一起存档，才能在重开、读档时避免重抽。`createTenThousandBone` 仅为底层构造器。池或预算后续补齐时，调用 `completePendingTenThousandBone`；已装备的实例再通过 `absorption.refreshAbsorbedBone` 同步来源。

**首胜奖励**：`runner.run` 新事务必须明确传入 `firstWin:true` 与唯一 `sessionId`。首胜标记来自控制器实际战斗判定，不能在接入层固定写死。奖励骰须支持 `snapshot()`，推荐使用本包 `RollLog`；事务保留骰序快照，失败后按原序列续结。角色、装备账本、奖励事务和装配账本必须作为同一存档整体提交。

**魂骨特性池**：按 `data/soulbone/README.md` 的字段写 `traits`，并在 `src/soulbone/handlers.js` 的登记表里实现对应 `handler`。没有处理器的定义不会进入抽取。

**新增友方NPC**：在 `友方npc/characters` 加 JSON，重跑 `node tools/sync-npc.cjs`。没有定稿到场正文的角色不会进入援助抽取；战斗适配也必须在 `src/npc/traits` 补对应状态机，否则 `assertCombatReady` 返回未就绪。

## 明确没做的部分

- 没有接任何游戏页面、存档、战斗循环；`拼接说明.md` 给出接入点，但接入后必须在主游戏里做完整旅程/读档/战斗回归。
- 没有 UI。邀请、到场、前进、换骨窗口、魂骨特性说明、战报导出都需要主游戏界面承接。
- 没有胜率、平均时长或“不会失衡”的结论。交接文档明确禁止在空库/空池阶段给虚构数值。
- 没有修改或删除 `友方npc` 原目录；`data/npc` 是带 sha256 的只读快照，来源改版时校验器会提示重新同步。
