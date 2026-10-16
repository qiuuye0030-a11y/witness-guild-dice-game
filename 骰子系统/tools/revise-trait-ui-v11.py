from pathlib import Path
p=Path(__file__).resolve().parents[1]
f=p/'battle-ui-v13.js';s=f.read_text(encoding='utf-8')
lines=[("      const trait=WitnessTraitRegistry.getBySoulId(u.soul.id);const passiveRows=trait?[trait.name+'：'+WitnessTraits.brief(trait)]:[];" if 'const passiveRows=[u.soul.combat_profile' in line else line) for line in s.splitlines()]
s='\n'.join(lines)+'\n';s=s.replace('能量转化：命中后抽离当前魂力的一半，转化次数 ','光缚：控制成功后附带有限吸蓝，已用次数 ');f.write_text(s,encoding='utf-8')
f=p.parent/'见证者公会战斗试玩.html';s=f.read_text(encoding='utf-8')
old=next((line for line in s.splitlines() if 'if(soul.combat_profile)sheet.append' in line),None)
if old:
    new="      const trait=WitnessTraitRegistry.getBySoulId(soul.id);if(trait){const box=node('aside',undefined,'camp-soul-trait');box.append(node('small','武魂特性','camp-soul-trait-label'),node('strong',trait.name,'camp-soul-trait-name'),node('p',WitnessTraits.brief(trait),'camp-soul-trait-brief'));sheet.append(box);}"
    s=s.replace(old,new);f.write_text(s,encoding='utf-8')
