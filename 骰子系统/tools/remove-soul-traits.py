from pathlib import Path
import json,re,shutil
p=Path(__file__).resolve().parents[1];root=p.parent
def edit(file,fn):
 f=p/file;old=f.read_text(encoding='utf-8');new=fn(old);f.write_text(new,encoding='utf-8')
f=p/'systems/battle/manifest.json';m=json.loads(f.read_text(encoding='utf-8'));m['modules']=[s for s in m['modules'] if 'traits' not in s];m['modules'].insert(m['modules'].index('scarred-woman.js'),'actor-state.js');m['soulTraits']=False;f.write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
(p/'systems/battle/actor-state.js').write_text('''// Restore old snapshots without reviving retired soul passives.
const ActorState={initialize(){delete this.traitsEnabled;delete this.traitRulesVersion;for(const u of this.units){delete u.passive;delete u.soul.combat_profile;for(const k of Object.keys(u))if(k.startsWith('_trait'))delete u[k];if(u.soul.id.startsWith('npc-'))u.model.ratingProfile='npc';}}};
''',encoding='utf-8')
replacements={'onActionComplete':'ModernActions','addShieldLayer':'ShieldActions','castTime':'ModernActions','command':'ModernActions','setStatus':'AttributeActions','setBuff':'StatusActions','tryControl':'ModernActions'}
def compose(s):
 for k,owner in replacements.items():s=s.replace(f'{k}:SoulTraitActions.methods.{k}',f'{k}:{owner}.methods.{k}')
 return s.replace('initializeSoulTraits:SoulTraitActions.initialize','initializeActorState:ActorState.initialize').replace(',traitsEnabled:false','')
edit('systems/battle/compose.js',compose)
edit('systems/battle/core.js',lambda s:s.replace('this.initializeSoulTraits()','this.initializeActorState()'))
edit('systems/battle/projection.js',lambda s:s.replace('tryControl:SoulTraitActions.methods.tryControl','tryControl:ModernActions.methods.tryControl'))
edit('systems/battle/scarred-woman.js',lambda s:s.replace('...SoulTraitActions.methods','...ModernActions.methods,scheduleAI:BattleCore.methods.scheduleAI'))
edit('_sync_v13.py',lambda s:re.sub(r'^  host.WitnessTrait\w*=.*\n','',s,flags=re.M))
f=p/'systems/campaign/manifest.json';m=json.loads(f.read_text(encoding='utf-8'));m['modules'].remove('traits.js');m['soulTraits']=False;f.write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
def camp_compose(s):
 for k,owner in {'refresh':'CampaignModern','reward':'CampaignCore','chooseEvent':'CampaignCore','resolveEventBranch':'QuestActions','battleOptions':'CampaignModern'}.items():s=s.replace(f'{k}:CampaignTraits.methods.{k}',f'{k}:{owner}.methods.{k}')
 return s
edit('systems/campaign/compose.js',camp_compose)
edit('systems/campaign/modern.js',lambda s:re.sub(r'^  if\(s.soulTrait\).*\n','',s,flags=re.M))
def core(s):
 s=s.replace('Campaign.validate(snapshot,catalog);this.state=copy(snapshot);','snapshot=globalThis.WitnessCatalogRevision?.migrate(snapshot,catalog)||snapshot;Campaign.validate(snapshot,catalog);this.state=copy(snapshot);')
 s=s.replace("const soul=catalog.filter(c=>c.tier===actualTier)[this.draw(20,'武魂候选')-1];","const soulPool=catalog.filter(c=>c.tier===actualTier),soul=soulPool[this.draw(soulPool.length,'武魂候选')-1];")
 s=s.replace("return base&&c?.effectiveTier?{...base,tier:c.effectiveTier,name:c.mutationName||base.name}:base;", "const active=base?{...base,...(c.catalogSoulOverride||{}),id:base.id,name:base.name}:base;return active&&c?.effectiveTier?{...active,tier:c.effectiveTier,name:c.mutationName||active.name}:active;")
 s=s.replace('const soul=catalog.find(x=>x.id===c.soulId);if(!soul', 'const found=catalog.find(x=>x.id===c.soulId),soul=found?{...found,...(c.catalogSoulOverride||{})}:null;if(!soul')
 return s
edit('systems/campaign/core.js',core)
# Eliminate the UI and every reference to the retired registry.
def ui(s):
 s=re.sub(r'  function traitCard\(soulId\)\{.*?\n  \}\n','',s,flags=re.S)
 s=s.replace('    const passive=traitCard(c.soulId);if(passive)target.append(passive);\n','')
 s=s.replace('const trait=traitCard(soul.id);if(trait)card.append(trait);','')
 s=s.replace('魂性谱版','武魂精简版')
 return s
edit('campaign-ui.js',ui)
def battleui(s):
 s=s.replace('const trait=WitnessTraitRegistry.getBySoulId(u.soul.id);const passiveRows=[];','const passiveRows=[];')
 s=re.sub(r'^      const soulTrait=WitnessTraitRegistry.*\n','',s,flags=re.M)
 s=re.sub(r"      const passiveNodes=\[\];if\(trait\)\{.*?\}c.passives.lastElementChild.replaceChildren\(\.\.\.passiveNodes,",'      c.passives.hidden=passiveRows.length===0;c.passives.lastElementChild.replaceChildren(',s)
 s=s.replace("catalog.find(s=>type==='support'&&s.id==='T06-05')", "catalog.find(s=>s.tier===5&&s.elements?.includes(({strong:'火',speed:'雷',control:'木',tank:'土',mental:'光',support:'水'})[type]))")
 return s
edit('battle-ui-v13.js',battleui)
# Remove obsolete feature styles, but retain the paragraph class used by current rating notes.
edit('campaign.css',lambda s:re.sub(r'[^{}]*(?:\.camp-soul-trait(?:-name|-label)?)(?![-\w])[^{}]*\{[^{}]*\}','',s))
for relative in ['systems/traits','systems/campaign/traits.js','systems/battle/traits.js']:
 f=(p/relative).resolve();assert f.is_relative_to(p.resolve())
 if f.is_dir():shutil.rmtree(f)
 elif f.exists():f.unlink()
# The bundle only needs contemporary documentation and the current catalogue.
def build(s):
 s=s.replace("['v11.01版_更新说明.md','特性命名程序使用说明.md','神秘伤疤女_挑战说明.md','v11.01版_评级曲线与验算报告.md']", "['武魂精简版_更新说明.md','精简武魂阅读清单.md','精简武魂总表.csv','武魂删留映射.csv']")
 s=re.sub(r"^shutil.copyfile\(p/'systems/traits/.*\n",'',s,flags=re.M)
 s=s.replace("'traitBudgetVersion':3,'traitNamingVersion':2,", "'soulTraits':False,'catalogRulesVersion':1,")
 s=s.replace("manifest.update({'ratingRulesVersion':2,'ratingCurveAmplitude':1.8,'scarredChallengeVersion':1,'traitCardRevision':4,'traitExplanationVersion':1,'legacyGenericPassives':False,'characterTraitBindingVersion':2,'examinerTraits':False,'attackTriggerRevision':2})", "manifest.update({'ratingRulesVersion':2,'ratingCurveAmplitude':1.8,'scarredChallengeVersion':1,'soulTraits':False})")
 s=s.replace('见证者公会 v11.01版 · {label}','见证者公会 v11.01武魂精简版 · {label}').replace('见证者公会 · v11.01版（成长规则10081）','见证者公会 · v11.01武魂精简版（成长规则10081）')
 return s
edit('_build_v11.py',build)
print('已删除武魂特性模块、数据和显示；恢复基础成长与战斗接口。')
