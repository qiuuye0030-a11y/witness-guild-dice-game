from pathlib import Path
import json
p=Path(__file__).resolve().parents[1];root=p.parent
f=p/'tools/curate-catalog.cjs';s=f.read_text(encoding='utf-8')
s=s.replace("v.soulAttribute=t.attribute_category==='复合'?'复合':t.elements?.[0]||t.mechanisms?.[0]||'普通'", "v.soulAttribute=root.WitnessCreation.attributeKey(t)")
f.write_text(s,encoding='utf-8')
f=p/'systems/battle/core.js';s=f.read_text(encoding='utf-8').replace('this.traitsEnabled=traitsEnabled;','');f.write_text(s,encoding='utf-8')
f=p/'systems/battle/models.js';s=f.read_text(encoding='utf-8').replace(',traitsEnabled:false','');f.write_text(s,encoding='utf-8')
f=p/'tools/verify-scarred-challenge.cjs';s=f.read_text(encoding='utf-8').replace('assert.equal(x.WitnessTraitRegistry.getBySoulId(u.soul.id),null);','assert.equal(x.WitnessTraitRegistry,undefined);');f.write_text(s,encoding='utf-8')
audit=json.loads((p/'output/catalog/精简核对.json').read_text(encoding='utf-8'))
(root/'武魂精简版_更新说明.md').write_text('''# v11.01 武魂精简版

本次在独立目录修订，原v11.01评级曲线修订版保留。

玩家武魂库从2447种精简为555种：保留480种原ID，撤出1967种，另补75种低潜力候选。金、木、水、火、土、毒、风、雷、光、暗、冰在1—10每档各3种；其余该档原有特殊分支最多1种。撤销批量补足的复合组合，保留原有独立设定的复合武魂，同档同组合最多1种。没有将原本缺席低潜力档的全部特殊分支硬塞进低档。

所有随机武魂特性及其成长、战斗、取名、储存和显示代码已移除。武魂固有形态、属性与魂技仍保留。会长与神秘伤疤女的专属角色机制沿用上一版，不属于随机武魂特性。

按具体动物、植物、器物改名，补充犰狳、螽斯、水獭、鳐、箭毒蛙、琴鸟、乌贼、麝牛、角蝉等载体。优先保留原先独立命名的武魂；416条名称调整列入核对文件。低潜力新增项只表示物性或有限属性亲和，不因名称自动获得造物、神通或额外技能。

六维、等级、经验及评级公式没有调整。由于删除特性，后续不再获得特性奖励。旧档已有成长不追回；被撤出的武魂通过固定映射迁入当前ID，并在存档内保存其原数值参数以维持面板。旧特性状态在导入及战斗恢复时清除，不再触发。旧历史文字和已经结算的战报作为记录保留。

《精简武魂总表.csv》为当前抽取库，《武魂删留映射.csv》覆盖全部2447种旧ID，便于检查旧档去向。CSV带UTF-8 BOM，可用Excel打开。完整阅读清单按潜力分档。

完整回归、存档与删除验证见源码包中的output/catalog。本次游戏版本仍为v11.01，以“武魂精简版”区分发布。
''',encoding='utf-8')
print('精简版构建说明已就绪')
