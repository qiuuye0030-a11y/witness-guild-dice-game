from pathlib import Path
import json,shutil
p=Path(__file__).resolve().parents[1]
def edit(name,fn):
    f=p/name;dest=p/'output/神秘挑战追加前'/name;dest.parent.mkdir(parents=True,exist_ok=True)
    if not dest.exists():shutil.copyfile(f,dest)
    f.write_text(fn(f.read_text(encoding='utf-8')),encoding='utf-8')
f=p/'systems/battle/manifest.json';m=json.loads(f.read_text(encoding='utf-8'));m['modules'].insert(m['modules'].index('projection.js'),'scarred-woman.js');f.write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
edit('systems/battle/core.js',lambda s:s.replace('!!u&&!u.fallen&&u.hp>0&&u.sh>0','!!u&&!u.fallen&&(u.scarred?(u.hp>0||u.sh>0):(u.hp>0&&u.sh>0))').replace("if(!u.fallen&&(u.sh<=0||(u.release==='召唤'?u.bodyHP<=0:u.hp<=0)))","if(!u.fallen&&(u.scarred?(u.hp<=0&&u.sh<=0):(u.sh<=0||(u.release==='召唤'?u.bodyHP<=0:u.hp<=0))))"))
edit('systems/battle/modern.js',lambda s:s.replace("if(channel!=='精神'&&!this._periodic&&this.value(t,'phaseSwap'))","if(!source?.scarred&&channel!=='精神'&&!this._periodic&&this.value(t,'phaseSwap'))"))
def compose(s):
    mapping={'onResourceChange':'ModernActions','effective':'ModernActions','basicCost':'BattleCore','cost':'SoulTraitActions','previewProtection':'ShieldActions','actionReason':'ModernActions','damageValue':'ModernActions','plan':'SoulTraitActions','applyDamage':'SoulTraitActions','scheduleAI':'SoulTraitActions','aiChoice':'UnifiedDecision','nextTime':'BattleCore','hasOffense':'BattleCore','finishByTime':'BattleCore'}
    for method,source in mapping.items():s=s.replace(method+':'+source+'.methods.'+method,method+':ScarredActions.methods.'+method)
    return s
edit('systems/battle/compose.js',compose)
edit('systems/battle/projection.js',lambda s:s.replace('plan:SoulTraitActions.methods.plan','plan:ScarredActions.methods.plan').replace('applyDamage:SoulTraitActions.methods.applyDamage','applyDamage:ScarredActions.methods.applyDamage').replace('effective=ModernActions.methods.effective','effective=ScarredActions.methods.effective'))
edit('systems/battle/unified-decision.js',lambda s:s.replace('u.passive]', 'u.passive,u.scarred]'))
edit('systems/challenge/battle.js',lambda s:s.replace("function initialize(b,challengeId){","function initialize(b,challengeId){\n  if(challengeId==='mysterious_scarred_woman')return root.WitnessScarredChallenge.initialize(b);").replace('function restore(b){','function restore(b){\n  if(b.challengeId===\'mysterious_scarred_woman\')return root.WitnessScarredChallenge.validate(b);'))
def state(s):
    s=s.replace("['member','advanced','guildmaster']","['member','advanced','guildmaster','mysterious']")
    s=s.replace("if(mode!=='guildmaster'&&", "if(!['guildmaster','mysterious'].includes(mode)&&")
    s=s.replace("targetLevel=mode==='guildmaster'?95:","targetLevel=mode==='mysterious'?character.level:mode==='guildmaster'?95:")
    s=s.replace("enemyId:mode==='guildmaster'?'xuejidong':enemyId","enemyId:['guildmaster','mysterious'].includes(mode)?'xuejidong':enemyId")
    s=s.replace("challengeId:mode==='guildmaster'?'guildmaster_xuejidong':null","challengeId:mode==='mysterious'?'mysterious_scarred_woman':mode==='guildmaster'?'guildmaster_xuejidong':null")
    return s
edit('systems/challenge/state.js',state)
def ui(s):
    s=s.replace("['guildmaster','公会会长——雪寂冬 · 95级封号斗罗·凶级']","['guildmaster','公会会长——雪寂冬 · 95级封号斗罗·凶级'],['mysterious','神秘伤疤女 · 与你同级·神级']")
    s=s.replace("enemy.hidden=mode.value==='guildmaster'","enemy.hidden=['guildmaster','mysterious'].includes(mode.value)")
    s=s.replace("brief.textContent=mode.value==='guildmaster'?","brief.textContent=mode.value==='mysterious'?'神秘伤疤女：'+c.state.character.level+'级·神级，仅两项万年最高档魂技。事象洞穿、祥光、多识、幽行常驻；需在时限内清空生命与精神双槽。':mode.value==='guildmaster'?")
    s=s.replace("guildmaster:'会长挑战'","guildmaster:'会长挑战',mysterious:'神秘伤疤女'")
    return s
edit('systems/challenge/ui.js',ui)
edit('battle-ui-v13.js',lambda s:s.replace("      if(u.guildmaster)passiveRows.push(","      if(u.scarred)passiveRows.push('事象洞穿：攻击魂技与普攻费用为正常两倍，无视目标防御、护盾与魂力护体；命中仍正常判定。','祥光：登台时获得等于最大生命的持久生命护盾。','多识：生命与精神双槽互相承伤，仅双槽清空退场；生命归零时魂技和普攻免费，魂力容量为同数值角色三倍。','幽行：非精神伤害穿过护盾后，九成转为魂力消耗、一成扣生命；魂力不足部分继续扣生命，生命空时转扣精神。','剑光蛰伏 '+u.scarred.swords.length+' / 3道；虚影之纱'+(u.scarred.veil?'潜行蓄能中':'未生效')+'。');\n      if(u.guildmaster)passiveRows.push("))
print('Independent mystery challenge integrated')
