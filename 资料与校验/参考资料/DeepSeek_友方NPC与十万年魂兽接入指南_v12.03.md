# 给 DeepSeek：在现有机制下扩充友方NPC与十万年魂兽

适用基线：见证者公会 **v12.03**。本文是后续开发交接，不是可执行指令。新增人物的正文、技能、被动和强度以用户后续提供的设定为准，不自行编造正式入库内容。

## 1. 先明确可以改什么

本次扩库允许添加角色资料、出场文字、技能组合、被动处理器、显示文案及其回归测试。处理器是把该角色的设定接入已有战斗事件，不是另写一套战斗系统。

必须继续使用现有评级、六维派生、技能预算、行动条、命中、控制、伤害、护盾、资源与结算接口。不得为了让新角色能赢而改全局公式、旧角色数值、成长、家境概率、奖励概率或失败判定；若用户给出的能力确实要求新机制，先明确列出缺口，不悄悄改成近似能力。

尤其保持：

- 80级且当前评级至少为凶时固定邀请；接受、拒绝及既有三位到场定稿不改。
- 家境1—5无援军，6／7按现有50%／75%，8—9一位，10两位；从有到场文本的名录中不放回抽取。加入新角色会自然扩大候选池，不另改到场概率。
- 援军按定义的实际等级与面板参战，不随玩家等级缩放；不因为辅助角色而补敌方考官。
- 讨伐每次固定邀请共3次战斗机会；已冻结的队友、魂兽不因重试或读档重抽。
- 讨伐无180秒上限，沿用现有十秒无人能行动的中止逻辑；普通考核和挑战采用原规则。
- 只有魂兽真实退场且友方有人存活才给环骨；胜利奖励只发一套。
- 十万年骨随机六部位，继承25%全部／75%等概率一条；环骨、换骨及预留九环走现有事务。
- 魂性谱随机武魂特性继续移除，不能借新内容恢复旧系统；普通万年骨池保持用户尚未补齐的状态。
- v12.03 开战时魂兽HP：独行×1.5，有援军×2。只乘HP，不乘精神；不要写进魂兽库原始面板，也不要在读档和每回合再乘。
- 霜蚋冰壳（v12.03.02 起）：战斗开始时一次性获得**自身生命值40%**的护盾，击破时反弹该护盾已吸收伤害的30%，不再每回合重结、也不再叠加第二层；因为按“自身生命值”计算，讨伐血量倍率会同时放大这项护盾。巨蛙封寒仍为**原始生命5%／上限50%**，继续复用 `baseHealth()`（原始面板生命），不随讨伐倍率放大。玩家继承时都按玩家自身最大生命计算。新增按生命比例生成护盾的特性必须写清是“自身生命值”还是“原始面板生命”，并同时更新魂兽输入、生成库与继承说明。
- 霜域（v12.03.02 起）：每个自身回合加深一档，最多三档；每档敌方敏捷−2%、行动条速度−4%，友方（含自身）敏捷＋4%。三档后不再加深，改为每次加深给友方2%生命上限寒冰护盾、对敌方造成2%生命上限伤害（不经防御衰减）。驱散技能压住一个自身回合，压住期间不加深。数值集中在 `systems/v12/battle.js` 的 `tuning`，运行时可从 `WitnessV12Tuning` 读取/覆盖，改动后请用 `node tools/verify-balance-v120302.cjs` 复跑三人讨伐。
- 新增的玩家“聚能”是讨伐专用动作，不是魂环技：0耗蓝、3秒读条、回复最大魂力10%，只有 `id==='player'` 且无 `npcId/beastId` 可用；不要把它接到NPC策略或魂技栏。
- 完整战报按 reportId 归档，主存档只保存摘要；新增战报字段时不要重新把完整日志塞回 `state.v12.reports`。

## 2. 路径与真正运行的入口

以下路径相对于 `v12.03开发/骰子系统/`；为方便命令，后文记作游戏根目录。`M` 指 `systems/v12/modules`，它只是文档缩写，不是程序变量。

| 职责 | 当前源码 |
|---|---|
| 主事件、编队、3次机会、HP系数与领奖 | `systems/campaign/v12.js` |
| 实时技能操作和特性钩子 | `systems/v12/battle.js` |
| 玩家装备属性与跨战斗特性进度 | `systems/v12/models.js` |
| 实际效果栏的只读视图 | `systems/v12/effect-view.js` |
| 事件、战报、骨与赞助入口UI | `systems/v12/ui.js` |
| 战报归档（IndexedDB／摘要） | `systems/v12/report-archive.js` |
| NPC快照与清单 | `M/data/npc/*.json`、`manifest.json` |
| NPC查询、到场文本与资料接口 | `M/src/npc/roster.js` |
| NPC转换、操作登记与独立状态机 | `M/src/npc/combat.js`、`M/src/npc/traits/` |
| 当前到场定稿的生成文件／提取器 | `M/src/text/hunt-texts.generated.js`、`M/tools/lib/doc-text.cjs`、`M/tools/extract-texts.cjs` |
| 魂兽编目输入／生成库 | `M/data/beast/catalog-source.json`、`library.json` |
| 魂兽生成器／库校验与选取 | `M/tools/build-beasts.cjs`、`M/src/beast/library.js` |
| 属性标签 | `M/src/battle/skill-attributes.js` |
| 魂骨实例、吸收、掉落与继承事务 | `M/src/soulbone/`、`M/src/reward/` |
| 离线模块、主引擎与HTML构建 | `_build_v12_modules.py`、`_sync_systems.py`、`_sync_v13.py`、`_build_v12.py` |

友方NPC的原始名录在游戏项目旁：`互动式骰子文字游戏/友方npc/characters/`。主游戏读取的是 **M/data/npc 的内置快照**，不会在浏览器里实时读取旁边的名录。

不要只编辑生成的 `campaign.js`、`battle-v13-browser.js`、`modules-bundle.js` 或最终HTML；下一次构建会覆盖它们。先修改 `systems/` 中的源码或生成器输入，再运行构建。

模块历史注释中的“未接入主游戏／spec-only”属于独立包时期的描述。现有三位友军、三只魂兽的实战由上面的主游戏适配代码承担；不能据一个JSON状态字段判断能力已经生效。

## 3. 新增友方NPC

### 3.1 建立完整资料，不缩成只含名字的表

从现有 `友方npc/characters/xutaiping.json` 等完整定义复制结构，保留现有角色文件。新角色使用新的稳定英文小写ID，例如 `new_ally`；武魂、技能也使用自己的ID。不要复用 `chengliang` 等ID冒充新角色，否则会执行旧人的专属钩子。

关键字段：

| 字段 | 要求 |
|---|---|
| `schemaVersion`、`id`、`name`、`nationality`、`aliases` | 沿用结构；ID、姓名和别名不能与已有记录冲突 |
| `level`、`stage`、`style`、`role`、`rating` | 按用户定位；当前81级魂斗罗模板有8个魂技 |
| `soul`、`release` | 完整武魂定义；属性、潜力、释放方式来自设定 |
| `model.stats`、`model.derived`、`benchmark`、`rings` | 使用现行 `WitnessRules` 同一次计算生成，不能手写另一套HP／MP／减伤公式 |
| `skills` | 当前转换器明确要求8个；不能擅自放宽成任意数量 |
| `traits` | 玩家显示只含名称和效果，不塞来源、分类和子级标题 |
| `implementation`、`permanentProgress` | 按已有规范声明，并实现真正需要的钩子与存档字段 |

强级、狂级按现行 `WitnessRules.rating(model)` 确认，不靠把显示文字写成“狂级”。技能费用用现有 `makeSkill`／`skillBudget`；额外体质加成如MP上限扩大，只计算一次。

### 3.2 魂技必须有可执行操作

每技保持 `id/name/ring/years/category/channel/target/Q/q/K/cost/cast/cooldown/effect/operations` 等现有结构。`operations` 是实际技能，`effect` 是说明，两者必须一致。

当前已有操作包括：

- 攻击：`direct_attack`、`partitioned_attack`、`channeled_partitioned_attack`、`budgeted_area_attack`、`periodic_attack`。
- 防护与恢复：`shield`、`heal`、`one_hit_damage_reduction`、`phase_avoid_once`。
- 控制与减益：`control_contest`、`conditional_control_contest`、`debuff_contest`、`numeric_debuff`、`delayed_three_lamps`。
- 强化与特殊组合：`battle_stat_up`、`temporary_stat_up`、`battle_attack_up`、`charged_attack_modifier`、`hp_cost`、`one_use_evasion`、储能、后续攻击强化等。

先查 `M/src/npc/combat.js` 的操作登记和 `systems/v12/battle.js` 的 `execute()`，不能仅因操作名存在，就假定它适用于任何新角色。有的操作与赛利亚充能、徐太平三灯等专属状态绑定；复用前需要给新角色接上对应状态机。

转换入口为 `npc.buildUnit()` → `toEngineSkill()` → `npcOperations` → 主游戏 `plan()/execute()`。沿用 `hit()`、`damageValue()`、`applyDamage()`、`tryControl()`、`heal()`、`addShieldLayer()` 结算。不得绕过护盾、控制判定或技能预算直接修改敌方血量来伪装技能实现。

魂技的 `channel` 是物理／能量／精神通道，属性标签来自武魂；无属性写“无”，复合属性全部保留。标签本身不引入属性克制表。

### 3.3 接被动：当前不是全自动插件架构

当前 `M/src/npc/combat.js` 的 `TRAITS`、`EXPECTED_TRAITS`、`createTraitRuntime().dispatch()` 明确登记了三位旧NPC；主游戏 `systems/v12/battle.js` 也有按 `npcId` 执行的初始化、回合、攻击、受创与退场分支。

因此，**只加JSON并改 `integrated:true` 不会让新被动生效**。新增完整NPC至少要：

1. 在 `M/src/npc/traits/` 增加该角色状态机，或明确复用已有实现函数；登记到 `combat.js` 并覆盖其实际事件分发。
2. 在主游戏已有钩子中接上该ID的初始化、个人回合开始／结束、付费、命中、实际伤害、恢复、退场等所需事件。可以小范围提取可复用处理函数，但不要重写行动条或改变旧角色分支含义。
3. 附赠普攻、连击分段、DOT跳数不能额外算正常个人回合；退场不能继续回血、触发场地或回魂。
4. 永久成长写入该NPC的 `permanentProgress`，由现有 `v12.npcProgress[npcId]` 保存；场内状态放在单位运行时，随战斗快照读回，不把临时增益写进训练成长。
5. 在 `effect-view.js` 给实际生效状态增加只读标签，标出幅度、层数、来源、有效期限和正负性质。不能为显示再注册一次增益。

现有 `assertCombatReady()` 主要检查独立适配器；还必须跑真实主游戏战斗，确认主适配层没有漏接。只看“ready:true”不算验收。

### 3.4 到场文字必须有源文件

`roster.list()` 依据 `TEXTS.arrivals[id]` 判断是否有到场文字；没有文字的新NPC会被援军候选池排除。当前提取器也只识别原三位定稿，不能仅增加名录就期待它自动生成第四位。

推荐后续扩展方式：**新增** `M/data/npc-arrivals.extra.json`，以稳定ID保存新人的定稿段落数组，再在 `roster.js` 合并查询。该文件目前不存在，属于待新增的内容扩展点；它只补新人的介绍，不覆盖原三人的生成文本。合并后 `list()`、`arrivalText()`、`arrivalParagraphs()` 必须读取同一份结果，并验证非空段落与ID一致。

也可以扩展已有提取器，但须同时保留原定稿的逐字测试和来源哈希。不要直接改 `hunt-texts.generated.js` 后留下一个会把新文字覆盖掉的生成器。

介绍沿用“等待段落＋人物自报”的格式；两位援军按已保存顺序完整展示。接受邀请后确定阵容，阅读文字不投额外骰。

### 3.5 同步快照

在游戏根目录运行：

```powershell
node systems/v12/modules/tools/sync-npc.cjs
```

该脚本扫描旁边 `友方npc/characters/` 的角色JSON，复制到 `M/data/npc/`，重写 `manifest.json` 的文件列表、字节数和SHA256。它要求每个角色8技、有特性、保留规范层 `implementation.integrated:false`；实战能力由适配代码验证。

不要只编辑快照后忘了原名录，否则再次同步会回退内容。不要把 `REQUIRED_IDS` 改成“只有新角色”；原三位仍须存在。生成HTML后，新角色资料和到场文本才真正进入离线游戏。

## 4. 新增十万年魂兽

### 4.1 保留原始面板，先编辑编目输入

在 `M/data/beast/catalog-source.json` 的 `beasts` 数组新增完整条目，保留原三只。参考现有条目的全部字段：新 `id/name/version`、战斗风格、`elements`、六维骰与 `statRatios`、血脉、物种、栖地、外貌、习性、开战／击败文本、四技与至少两条特性。

当前生成参数：`baselineLevel:91`，六维按 `WitnessRules.KEYS` 的 **B、S、C、D、A、P** 顺序，`skillYears:10000`，最低万年档 **Q2.8、K1**；血脉不修正六维。不因“十万年”把等级直接填成100。实际年龄如十二万年可以写入设定，但奖励定义仍是100000年。

不要在 `statRatios`、`panel.derived.HP` 或生成器中预乘1.5／2。倍率只由 `systems/campaign/v12.js/startBattle()` 在实例化讨伐单位时应用，库仍保存基础HP。

若新增原文来源，保存到模块 `reference/`，并明确更新合并资料的来源记录。原《魂兽资料_三例.txt》作为历史原文保留，不改原文来伪造新兽已经由用户提供。

### 4.2 恰好四技，至少一技为攻击

每兽 `skills` 有4项，至少1项 `category:'攻击'`。生成器支持攻击、防御、治疗、控制、强化、减益、持续伤害这七类模板。示例仅演示字段，不是正式新内容：

```json
{
  "name": "用户给定技名",
  "category": "攻击",
  "element": "水",
  "description": "用户确认的攻击方式与作用。"
}
```

`build-beasts.cjs` 调用现有 `makeSkill/skillBudget` 并生成 `operations`；主游戏将其转为 `v12Operations`。如果需要现有模板之外的组合，可以扩展内容编译或数据表达，但操作仍需已有执行器实际支持，不能只给一段描述。

注意现有强化／减益文案模板使用“敏捷”措辞；若为新兽指定其他 `buffField/debuffField`，生成后必须对照 `operations.values` 校正文案字段显示，不能让文字与实际修改对象不同。校正文案不应改变既定倍率。

全部技能标签通过 `tagSkill` 继承魂兽全部属性；伤害通道单独保留。不要把四个主动技复制成玩家魂环的四技奖励，十万年九环仍走既有双技生成。

### 4.3 每条被动同时实现魂兽端和魂骨继承端

每兽至少2个不同特性ID，每条有 `name/effect/params`，生成定义还要求 `inherit.handler`、`implementationVersion` 与存档字段。**这些声明只是契约，不会自动生成代码。**

当前原六条被动在 `systems/v12/battle.js` 按特性ID实现。若新兽使用同一能力，应在设定允许时复用已有特性ID／处理函数；不要仅换一个新ID后期待旧处理器自动识别。全新ID必须补齐实际钩子，而且作用对象应是“持有该特性的单位”，不能只用 `beastId` 限制给敌方，导致玩家继承后无效。

逐条确认：触发事件、实际伤害基数、命中与豁免、护盾顺序、资源费用、层数上限、同源刷新／叠加、退场停止、净化或封锁、永久或场内状态。引用用户未给出的细节时单独列待定项，不自行扩成无敌能力。

玩家继承特性从装备来源账本挂到 `unit.v12Traits`，带 `ownerBoneId`。若有跨战斗永久层数，需要扩展 `systems/v12/models.js` 的进度持久化以及对应初始化；仅写 `inherit.save.fields` 不能保存真实进度。换下魂骨后，其特性不得继续生效。

魂兽永久状态目前由 `systems/campaign/v12.js` 的 `beastProgress` 保存苔凝；新永久字段也要明确接入，不把同一兽重试当成清空永久成长。临时状态不跨重试保留。

`M/src/soulbone/handlers.js` 的登记表服务普通万年骨特性池；只在这里注册名字，并不能代替十万年兽和玩家继承的实时战斗钩子。两端都要实际验证，效果栏也要跟随真实状态。

### 4.4 奖励与入库

生成库需满足现有 `validateBeast()`：稳定ID、版本、`years:100000`、`available`、`battleTags:['hunt']`、合法 `lifeType`、面板、技能、特性、`traitInheritanceVersion`、红环奖励、随机六部位魂骨、战斗／击败文本和 `exitRule:'hp-or-spirit-zero'`。

生命类型使用当前枚举；有生命的普通魂兽现值为 **`生活`**（现有代码枚举），不是自行改写成“生命”。元素、灵体、构装、亡灵等按真实设定填写，关系到六库仙贼等判定。当前生成器默认 `lifeType:'生活'`，若新增非生命目标，需把用户指定值贯穿到生成定义和战斗实例，不能只写在描述里。

在游戏根目录运行：

```powershell
node systems/v12/modules/tools/build-beasts.cjs
```

检查生成的 `M/data/beast/library.json`，然后完整构建。`library.list()/available()/definition()` 和赞助页魂兽下拉框读取该库，正常情况下无需硬编码添加一个选项。`available:true` 应只用于已经完成技能、被动与继承验收的目标；现有校验不能自动发现所有“写了说明、未执行”的能力。

当前生成器将 `available` 固定写为 `true`。未完成的草稿不要加入正式发布输入；若需保留草稿，应让编译器读取条目的布尔值、旧条目默认沿用 `true`，而不是临时手改生成库后任由下次构建覆盖。

不要改 `reward/runner.js` 去为新兽直发装备，也不要在 `battleText` 或UI按钮里额外送奖励。既有胜利事务负责随机部位、继承、吸收冲突、90级预留九环和幂等领取。

## 5. 验收、构建和交付

建议以新增ID为对象增加测试，保持老内容测试。旧脚本中“恰好三只／三位”的数量断言需要在扩库时改为“原有三者仍存在且新增定义合法”，不要删除旧角色能力用例或跳过失败来制造通过。

必须覆盖：

1. 新NPC能被列出、查到、抽到，到场全文按保存顺序显示；已有定稿不变。
2. 新NPC的8技／新兽的4技都通过真实行动条释放，费用、读条、冷却、目标正确；没有未知操作或未初始化状态。
3. 每条特性至少一个正例和一个反例：命中／未命中、受创／护盾或DOT、活体／非生命、封锁／未封锁等按具体能力选。
4. 画面标签与真实数值一致，重复刷新不叠加；退场、驱散、过期后消失，短期效果在180秒之后仍正常计时。
5. 1对1、2对1、3对1人数正确；新兽实际HP分别原始×1.5／×2／×2，读档与重试不再乘；普通考官血量不变。
6. 保存进行中战斗再恢复，资源、骰序、层数、目标、援军和已用次数一致；三次用尽不再开第四次。
7. 失利、中止、认输均无环骨；团队胜利只给玩家一套，NPC最后一击同样有效；换骨不留旧特性。
8. 新兽的继承能力在玩家普通考核／挑战中实际生效；没有讨伐HP系数泄漏到玩家身上。

从游戏根目录执行现有发布流程：

```powershell
python _build_v12.py
python tools/verify-v12-release.py
node tools/verify-v12-package.cjs
```

最后一次测试完成后再运行一次构建，将最新验证汇总装入分享包，再检查最终HTML与ZIP。新增独立测试记得接入 `verify-v12-release.py`。还应进行真实浏览器手动验收；若环境不允许，明确写未目视验收，不能把脚本编译或组件测试称为完整UI验收。

交付双主题HTML、分享ZIP、变更说明和验证结果，并列出新增ID及接入位置。既有版本与用户原稿保留。若仍有未实现处理器或待确认数值，具体说明，不把只编目数据包装为已完成可玩角色。

## 6. 给执行模型的简短任务模板

> 基于 v12.03，为我随后提供的NPC／魂兽扩库。只增加内容定义和调用现有规则所必需的适配，不修改旧角色、全局公式、事件流程、3次机会、无时限规则、奖励概率或讨伐HP系数。先检查稳定ID、技能操作、被动钩子、继承和显示的缺口；再完成名录、文本、处理器、持久化、真实战斗测试与离线构建。未实现项明确列出，不能靠改说明或状态标记伪装完成。
