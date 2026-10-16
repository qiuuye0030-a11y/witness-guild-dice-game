from pathlib import Path
import json,re,shutil
p=Path(__file__).resolve().parents[1]
backup=p/'output/特性卡修订前';backup.mkdir(exist_ok=True)
def edit(name,fn):
    f=p/name;b=backup/name;b.parent.mkdir(parents=True,exist_ok=True)
    if not b.exists():shutil.copyfile(f,b)
    s=f.read_text(encoding='utf-8');f.write_text(fn(s),encoding='utf-8')
def core(s):
    s=s.replace(",combat_profile:{trait:template.trait,trait_name:'模板特征',description:''}","")
    s=s.replace("  const trait=function(u){return u.soul.combat_profile?.trait||'focus';};",'')
    s=s.replace('status,trait,basicCost','status,basicCost')
    s=s.replace("duration=1.5;if(this.trait(u)==='heavy')duration+=.15;if(this.trait(u)==='swift')duration*=.88;","duration=1.5;")
    s=s.replace("const mind=channel==='精神',trait=source?this.trait(source):'';","const mind=channel==='精神';")
    s=s.replace("const trait=this.trait(u);",'')
    s=s.replace("if(trait==='guard'&&!mental)shield=Math.round(shield*1.16);if(trait==='water'&&!mental)shield=Math.round(shield*1.12);if(trait==='ghost'&&mental)shield=Math.round(shield*1.16);",'')
    s=s.replace("if(this.trait(u)==='healing')p.heal=Math.round(p.heal*1.15);if(this.trait(u)==='life'&&p.channel!=='精神')p.heal=Math.round(p.heal*1.12);",'')
    s=s.replace("if(!s&&trait==='heavy')raw*=1.12;if(!s&&trait==='swift')raw*=.96;if(!s&&['guard','ghost'].includes(trait))raw*=.94;",'')
    s=s.replace("if(!mind&&t.style==='辅助'&&!t.firstHit&&this.trait(t)==='life'&&t.hp>0){t.firstHit=true;this.heal(t,Math.round(t.model.derived.HP*.03),'生命');}",'')
    s='\n'.join(line for line in s.split('\n') if not any(x in line for x in ["if(trait===","&&trait===","if(this.trait("]))
    return s
edit('systems/battle/core.js',core)
edit('systems/battle/compose.js',lambda s:s.replace('    trait:BattleCore.methods.trait,\n',''))
for name in ['control.js','members.js','attributes.js','shields.js']:
    def transform(s):
        s=re.sub(r"    if \(source && this\.trait\(source\) === 'annihilation'.*?\n    }\n",'',s,flags=re.S)
        s=re.sub(r"    if \(!mind && target\.style === '辅助'.*?\n    }\n",'',s,flags=re.S)
        s=s.replace("if(!controlled){chance-=this.value(t,'evasion');if(this.trait(t)==='evasion')chance-=.08;}","if(!controlled){chance-=this.value(t,'evasion');}")
        s=s.replace("const target=pre[t.id],trait=this.trait(u);",'const target=pre[t.id];')
        s='\n'.join(line for line in s.split('\n') if not any(x in line for x in ['this.trait(',"if (trait ===", "if(trait==="]))
        return s
    edit('systems/battle/'+name,transform)
edit('systems/battle/examiners.js',lambda s:re.sub(r'^\s*"trait":\s*"[^"]+",?\n','',s,flags=re.M))
# Strip the obsolete data at its source; old external save fields are ignored.
catalog=p.parent/'武魂十档候选库.json'
items=json.loads(catalog.read_text(encoding='utf-8-sig'))
for item in items:item.pop('combat_profile',None)
catalog.write_text(json.dumps(items,ensure_ascii=False,indent=2),encoding='utf-8')
edit('catalog.js',lambda s:'window.WITNESS_CATALOG='+json.dumps(items,ensure_ascii=False,separators=(',',':'))+';\n')
edit('campaign-ui.js',lambda s:s.replace("    if(soul.combat_profile)paragraph(target,`${soul.combat_profile.trait_name}：${soul.combat_profile.description}`,'camp-trait');\n",'').replace("paragraph(reveal,soul.combat_profile?.description||'它的力量正等待你亲手培养。','camp-narrative');",''))
print('Removed legacy generic passives from canonical data and battle calculations.')
