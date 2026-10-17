from pathlib import Path
p=Path(__file__).resolve().parents[1]
f=p.parent/'见证者公会战斗试玩.html';s=f.read_text(encoding='utf-8')
old="box.append(node('small','武魂特性','camp-soul-trait-label'),node('strong',trait.name,'camp-soul-trait-name'),node('p',WitnessTraits.brief(trait),'camp-soul-trait-brief'));sheet.append(box);"
new="box.append(node('small','武魂特性','camp-soul-trait-label'),node('strong',trait.name,'camp-soul-trait-name'));const text=WitnessTraits.explain(trait);for(const [key,label]of [['trigger','触发'],['settlement','生效'],['effect','效果']])box.append(node('p',label+'：'+text[key],'camp-soul-trait-brief'));sheet.append(box);"
assert old in s or new in s;s=s.replace(old,new);f.write_text(s,encoding='utf-8')
f=p/'tools/verify-trait-card-v11.cjs';s=f.read_text(encoding='utf-8')
a=s.index("test('all2464 briefs");b=s.index("test('actual card",a)
s=s[:a]+"""test('all2447 explanations contain actual trigger, settlement and effect without numeric budgets',()=>{for(const t of registry.list({limit:5000}).items){const text=API.explain(t),brief=API.brief(t);for(const key of ['trigger','settlement','effect'])assert(typeof text[key]==='string'&&text[key].length>8);assert(brief.length>40&&brief.length<300);assert(!/[0-9%％]|undefined/.test(brief));if(t.kind==='growth')assert(/训练|成长/.test(text.effect));else assert(text.effect.includes({potency:'伤害或盾量',economy:'魂力消耗',preparation:'准备时间'}[t.spec.benefit]));}const fog=registry.list({limit:5000}).items.find(t=>t.soulName==='夜雾');assert(API.explain(fog).trigger.includes('生命低落'));assert(API.explain(fog).trigger.includes('攻击魂技'));assert(API.explain(fog).settlement.includes('不重复蓄存'));});
"""+s[b:]
s=s.replace("assert.equal(c.children[2].textContent,API.brief(t));assert.equal(c.children.length,3);","const text=API.explain(t);assert.equal(c.children[2].textContent,'触发：'+text.trigger);assert.equal(c.children[3].textContent,'生效：'+text.settlement);assert.equal(c.children[4].textContent,'效果：'+text.effect);assert.equal(c.children.length,5);")
f.write_text(s,encoding='utf-8')
f=p.parent/'v11.01版_更新说明.md';s=f.read_text(encoding='utf-8').replace('本次沿用既有特性短文案，上一轮展示的长说明案例仍未写入游戏。','界面修正：武魂特性框已改为“触发／生效／效果”三段说明，覆盖觉醒页、人物页、侧栏与战斗页。说明不再受20字限制，不显示精确预算，用小幅、较大幅度等表述收益；触发条件、自动耗用方式、失效条件与具体增幅方向均保留。');f.write_text(s,encoding='utf-8')
print('Trait explanation UI and renderer verification updated')
