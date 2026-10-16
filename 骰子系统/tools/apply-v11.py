"""一次性源码改造；只在隔离v11目录内运行。"""
from pathlib import Path
import json,re
P=Path(__file__).resolve().parents[1]
def replace(name,old,new,count=1):
 p=P/name;s=p.read_text(encoding='utf-8');n=s.count(old)
 if n!=count: raise RuntimeError(f'{name}: expected {count}, got {n}: {old[:70]}')
 p.write_text(s.replace(old,new),encoding='utf-8')

# 以当前战斗公式为唯一基准，补齐养成接口。
outer=(P/'rules.js').read_text(encoding='utf-8')
rating=outer[outer.index('  function rating(model)'):outer.index('  const api=',outer.index('  function rating(model)'))]
ring=outer[outer.index('  function ringFloor'):outer.index('  function isMental')]
path=P/'systems/battle/rules.js';s=path.read_text(encoding='utf-8')
s=s.replace("  'use strict';","  'use strict';\n  if(root.WitnessRules?.calculationVersion===11)return;",1)
s=re.sub(r'  function mainStyles\(soul\)\{[^\n]*\}',"  function mainStyles(soul){return Object.keys(STYLE);}",s)
s=s.replace('  function isMental',ring+'  function isMental',1)
start=s.index('  function rating(model)');end=s.index('  const api=',start);s=s[:start]+rating+s[end:]
s=s.replace('const api={soulControl,','const api={calculationVersion:11,ringFloor,ringRange,soulControl,')
path.write_text(s,encoding='utf-8')
replace('_sync_systems.py',"print('Dice, event catalog and campaign entry files synchronized.')", """# Campaign and battle share the same calculation object in the browser.
rules=(p/'systems/battle/rules.js').read_text(encoding='utf-8')
(p/'rules.js').write_text("if(typeof module==='object'&&module.exports){module.exports=require('./v13-runtime.cjs').WitnessRules;}else{\\n"+rules+"\\n}\\n",encoding='utf-8')
print('Dice, events, campaign and unified calculation entry synchronized.')""")
replace('_sync_v13.py','  const globalThis={};', '  const globalThis={WitnessRules:host.WitnessRules};')
replace('_sync_v13.py','  host.WitnessBattle=globalThis.WitnessBattle;', '  host.WitnessRules=globalThis.WitnessRules;\n  host.WitnessTraits=globalThis.WitnessTraits;\n  host.WitnessTraitBalance=globalThis.WitnessTraitBalance;\n  host.WitnessTraitRegistry=globalThis.WitnessTraitRegistry;\n  host.WitnessBattle=globalThis.WitnessBattle;')

# 修改当前模板，保存修订前数据用于同条件对照。
path=P/'systems/battle/examiners.js';s=path.read_text(encoding='utf-8');start=s.index('const templates=')+len('const templates=');raw=s[start:];space=len(raw)-len(raw.lstrip());a,end=json.JSONDecoder().raw_decode(raw.lstrip());(P/'fixtures/v11-original-templates.json').write_text(json.dumps(a,ensure_ascii=False,indent=2),encoding='utf-8')
for t in a:
 if t['id']=='qinyan':
  q=t['skills'];q[0].update(castFixed=.5,description='极速：肉体强度提高35%、敏捷30%，最多四个动作或24秒；普通形态结束后轻度疲劳，半能量形态无身体负荷。')
  q[2].update(factor=1.35,castFixed=.8,cd=7,description='冲击雷矢直接爆炸；倍率1.35、读条0.8秒，与操控雷矢共用冷却。')
  q[2]['subActions'][0].update(factor=1.15,castFixed=.8,cd=7,dotFirstMs=1200,description='操控雷矢命中部署，1.2秒后爆炸；与冲击型共用冷却。')
  q[3].update(factor=2.05,castFixed=1.35,cd=8,costMultiplier=.9,description='电磁动能重炮，倍率2.05、读条1.35秒；普通形态单臂过热6秒，过热时不能置换；半能量形态无新增过热。')
  q[4].update(costPercent=.08,castFixed=.75,cd=24,description='支付6%最大精神护持，半能量化12秒；肉体强度提高25%，刺斩减伤20%，其他技费用降低22%；极速无负荷，重炮无新增过热。结束后仍需精神蓄养。')
  q[5].update(factor=1.65,castFixed=1.3,description='三段极光贯流共用命中，总倍率1.65；半能量形态读条0.9秒，不附送必中或永久破甲。')
 if t['id']=='hash':
  q=t['skills'];q[0].update(evasion=.22,description='无攻击幻像干扰瞄准，闪避提高22个百分点，持续整场；精神攻击仍按精神通道命中。')
  q[1].update(evasion=.35,buff=.28,burstActions=4,castFixed=.5,costPercent=.10,description='隐匿准备0.5秒，攻击提高28%、闪避提高35个百分点，持续随后四个完成动作（含附赠普攻）。幻像不独立攻击。')
  q[2].update(baseControl=2,chipFactor=.55,costPercent=.08,cd=10,castFixed=.5,energyWardRate=.4,energyWardDuration=6,description='实体铭符爆裂，精神驱动能量伤害，削去60%生命盾，并按正常精神对抗控制与打断；获得下一次能量攻击40%免伤，最多6秒。')
  q[3].update(factor=2.75,budgetFactor=2.2,costMultiplier=.72,castFixed=.65,cd=7,description='实体铭符以精神力驱动能量刻印，倍率2.75、读条0.65秒，沿用2.2倍率费用预算后减耗28%；幻像不攻击。')
  q[4].update(shieldMultiplier=1.25,shieldDuration=10,costMultiplier=.9,description='实体铭符折叠防护，盾量提高25%，持续10秒；不回复生命。')
  q[5]['effects']=[{'key':'C','value':.24},{'key':'A','value':.18}];q[5]['description']='晦光扰流：魂力操纵降低24%、敏捷降低18%；共享一次精神判定，持续整场，同源不叠加。'
 if t['id']=='linshi':
  q=t['skills'][2];q.pop('factor',None);q.update(name='能量之源·光缚',category='控制',baseControl=1.5,castFixed=.8,cd=16,costPercent=.08,description='控制为主：正常精神判定成功后束缚并打断；附带抽离目标当前魂力8%，单次不超过目标基础魂力6%，整场最多两次。仅将实际抽离量25%转为自身魂力，单次不超过自身基础魂力1.5%。免控或抵抗时不吸蓝，无额外攻击伤害。')
new=json.dumps(a,ensure_ascii=False,indent=2);path.write_text(s[:start]+new+s[start+space+end:],encoding='utf-8')

replace('systems/battle/modern.js','q.B*=1.15','q.B*=1.25')
replace('systems/battle/modern.js',"n*=.85;return Math.max", "n*=.78;return Math.max")
replace('systems/battle/modern.js',"t=1.3;return t*", "t=.9;return t*")
replace('systems/battle/modern.js',"[['B',.25],['A',.20]]","[['B',.35],['A',.30]]")
replace('systems/battle/modern.js',"this.value(u,'qinyanForm')?8:18", "this.value(u,'qinyanForm')?12:24")
replace('systems/battle/modern.js','actionsRemaining:3,fatigue:', 'actionsRemaining:4,fatigue:')
replace('systems/battle/modern.js',"'qinyanForm',1,8", "'qinyanForm',1,12")
replace('systems/battle/modern.js',"'mentalRecovery',1,28", "'mentalRecovery',1,24")
replace('systems/battle/modern.js','进入8秒半能量形态','进入12秒半能量形态')
replace('systems/battle/modern.js','肉体强度提高25%、敏捷提高20%。','肉体强度提高35%、敏捷提高30%。')
replace('systems/battle/modern.js','heat[arm]=this.now+10000','heat[arm]=this.now+6000')
replace('systems/battle/modern.js','臂重炮过热10秒。','臂重炮过热6秒。')
replace('systems/battle/modern.js',"'preDR',.30,4,{source:u.id+':energyWard'", "'preDR',s.energyWardRate||.30,s.energyWardDuration||4,{source:u.id+':energyWard'")
path=P/'systems/battle/modern.js';s=path.read_text(encoding='utf-8');start=s.index("  if(s?.modernEffect==='linEnergy'&&");end=s.index('\n',start)
s=s[:start]+"""  if(s?.modernEffect==='linEnergy')p.effects.push(()=>{
    const controlled=this.events.some(e=>e.time===this.now&&e.type==='control'&&e.actor===u.id&&e.target===t.id);
    if(!controlled||(state(u).lightConversions||0)>=2)return;
    const drain=Math.min(t.mp,Math.floor(t.mp*.08),Math.floor(t.model.derived.baseMP*.06));if(drain<=0)return;
    t.mp-=drain;state(u).lightConversions=(state(u).lightConversions||0)+1;
    const converted=Math.max(0,Math.min(Math.floor(drain*.25),Math.floor(u.model.derived.baseMP*.015),u.model.derived.MP-u.mp));u.mp+=converted;
    this.addLog(u.name+'光缚成功：抽离魂力'+drain+'，有限转化'+converted+'。',{type:'lightConversion',actor:u.id,target:t.id,drain,converted});
  });"""+s[end:];path.write_text(s,encoding='utf-8')
replace('systems/battle/core.js',"const release=template.kind==='兽'?'附体':'召出';", "if(template.id==='hash'){soul.basicChannel='能量';soul.basicMindPower=true;}\n    const release=template.kind==='兽'?'附体':'召出';")
replace('systems/battle/core.js',"s?.channel||(u.soul.spirit_specialist?'精神':'物理')", "s?.channel||u.soul.basicChannel||(u.soul.spirit_specialist?'精神':'物理')")
replace('systems/battle/core.js',"s?.mindPower?a.MA:","(s?.mindPower||!s&&u.soul.basicMindPower)?a.MA:")
replace('systems/battle/shields.js',"result.effects.push(() => this.addShieldLayer(target, {", "amount=Math.round(amount*(skill.shieldMultiplier||1));\n      result.effects.push(() => this.addShieldLayer(target, {")
replace('systems/battle/shields.js','until: this.now + 8000','until: this.now + (skill.shieldDuration||8)*1000')

# 双方任一辅助系都必须2v2，不复制辅助本人与其同队。
replace('systems/battle/core.js',"if(character.style==='辅助'&&!duel)units.push(templateUnit(fighter,level,'ally',0),templateUnit(support,enemyLevel,'enemySupport',1));\n      else if(withSupport)units.push(templateUnit(support,level,'ally',0),templateUnit(support,enemyLevel,'enemySupport',1));", """if(!duel&&(character.style==='辅助'||t.style==='辅助'||withSupport)){
        const allyTemplate=character.style==='辅助'?fighter:support;
        const enemyPartner=t.style==='辅助'?fighter:support;
        units.push(templateUnit(allyTemplate,level,'ally',0),templateUnit(enemyPartner,enemyLevel,'enemySupport',1));
      }""")

# 特性数据在同一个引擎作用域加载，浏览器与Node均可复现。
path=P/'systems/battle/manifest.json';m=json.loads(path.read_text(encoding='utf-8'));m['version']='v11';m['combatRulesVersion']=17
m['modules'][1:1]=['../traits/tables.js','../traits/balance.js','../traits/index.js','../traits/traits-data.js']
m['modules'].insert(m['modules'].index('projection.js'),'traits.js');m['modules'].append('models.js');path.write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
path=P/'systems/campaign/manifest.json';m=json.loads(path.read_text(encoding='utf-8'));m['version']='v11';m['modules'].insert(m['modules'].index('compose.js'),'traits.js');path.write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')

# 新快照保留旧兼容入口；旧进行中战斗仍由现有迁移恢复。
replace('systems/battle/core.js','withSupport=false,seed=', 'withSupport=false,traitsEnabled=true,seed=')
replace('systems/battle/core.js','this.resourceConfig=R.getResourceConfig();', 'this.traitsEnabled=traitsEnabled;this.resourceConfig=R.getResourceConfig();')
replace('systems/battle/core.js','this.scheduleAI();this.controlRules', 'this.initializeSoulTraits();this.scheduleAI();this.controlRules')
replace('systems/battle/core.js','ShieldActions.initialize(this);ChallengeBattle.restore(this);return;', 'ShieldActions.initialize(this);ChallengeBattle.restore(this);this.initializeSoulTraits();return;')
replace('systems/battle/core.js','[13,14,15,16].includes(snapshot.combatRulesVersion)', '[13,14,15,16,17].includes(snapshot.combatRulesVersion)',2)
replace('systems/battle/attributes.js','combatRulesVersion:16,modernVersion:1008,','combatRulesVersion:17,modernVersion:1100,traitsEnabled:this.traitsEnabled!==false,')
replace('systems/campaign/modern.js','[1007,1008].includes(s.battleSnapshot.modernVersion)', '[1007,1008,1100].includes(s.battleSnapshot.modernVersion)')
replace('systems/campaign/modern.js',"s.gameVersion='10.08'", "s.gameVersion='v11'")
replace('systems/campaign/journey.js',"gameVersion:'10.08'", "gameVersion:'v11'")
replace('campaign-ui.js',"gameVersion:'10.08'", "gameVersion:'v11'",2)

print('v11 canonical source transformation completed')
