# 魂骨特性池字段说明

本目录只放“用户后续编写”的魂骨特性池。当前 `trait-pool.json` 是空池。

## 为什么默认空

《v12重大更新交接文档》第十二节：魂骨特性来自用户后续编写的池；池为空或处理器缺失时，
魂骨保留实例与待装配标记，**不显示为“特性已生效”**，也不为凑数发放旧武魂特性。
所以本模块包不会自带任何“示例特性”进入正式抽取，避免把建议当成已定稿内容。

## 单条定义字段

```json
{
  "id": "stable-trait-id",
  "name": "显示名称",
  "effect": "效果说明（玩家只看到名称和这段说明）",
  "years": [10000, 100000],
  "slots": ["头部", "躯干", "左臂", "右臂", "左腿", "右腿"],
  "weight": 1,
  "stackGroup": "stack-group-id",
  "maxStacks": 1,
  "handler": "registered-handler-id",
  "params": {},
  "trigger": { "on": "damage-taken", "condition": "..." },
  "exit": { "on": "battle-end" },
  "save": { "schemaVersion": 1, "fields": ["stacks"] },
  "dependsOn": ["battle-hooks", "equipment-source"],
  "implementationVersion": 1,
  "provenance": "user"
}
```

- `years`：可用年限区间，必须落在万年或十万年；抽取前先按年限筛选。
- `slots`：允许部位；不在列表内的部位不进入候选。
- `weight`：池权重；缺省时等权。
- `stackGroup` / `maxStacks`：叠加组与上限；未声明时不默认叠乘。
- `handler`：必须能在 `src/soulbone/handlers.js` 注册表里找到实现；
  找不到时该条不进入候选，并在 `unavailable` 中报告原因，不能假装生效。
- `save`：该特性自身需要的存档结构；实例会保存 `traitId`、参数快照与装配版本。
- `dependsOn`：依赖的战斗事件钩子或装备来源机制。

## 空池与缺失处理器的对外状态

- `pool-empty`：整池为空。魂骨实例进入 `待处理`，不显示特性。
- `handler-missing`：定义存在但处理器未实现。该条不参与抽取，实例进入 `待处理`。
- `no-legal-trait`：筛选后无合法项。可从剩余合法集合无放回重选，用尽后进入 `待处理`，
  不无限重抽，也不偷偷折算成现金、经验或另一块骨。

## 与旧武魂特性的边界

本池只服务魂骨实例，绑定 `boneId` / `definitionId`，不使用武魂ID作为唯一键，
也不会重新启用魂性谱随机武魂特性。旧随机特性的清理见 `src/soulbone/migrate.js`。
