from pathlib import Path
p=Path(__file__).resolve().parents[1]
f=p/'tools/curate-catalog.cjs';s=f.read_text(encoding='utf-8').replace('if(s.draft?.results?.soulId){','if(s.catalogRulesVersion!==1&&s.draft?.results?.soulId){');f.write_text(s,encoding='utf-8')
f=p/'systems/campaign/core.js';s=f.read_text(encoding='utf-8').replace('this.state={version:8,seed:','this.state={version:8,catalogRulesVersion:1,seed:').replace('this.state={version:1,seed:','this.state={version:1,catalogRulesVersion:1,seed:');f.write_text(s,encoding='utf-8')
f=p.parent/'见证者公会战斗试玩.html';s=f.read_text(encoding='utf-8').replace('soul:20,season:4','soul:catalog.filter(x=>x.tier===config.tier).length,season:4').replace("catalog.filter(x=>x.tier===tier)[draw(20,'武魂候选')-1]","catalog.filter(x=>x.tier===tier)[draw(catalog.filter(x=>x.tier===tier).length,'武魂候选')-1]");f.write_text(s,encoding='utf-8')
print('新档标记与旧版候选骰面已修正')
