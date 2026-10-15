from pathlib import Path
p=Path(__file__).resolve().parents[1]
f=p/'achievements.js';s=f.read_text(encoding='utf-8');s=s.replace('at:item.at};',"at:item.at,...(typeof item.evidence==='string'?{evidence:item.evidence.slice(0,240)}:{})};",1);f.write_text(s,encoding='utf-8')
f=p/'campaign-ui.js';s=f.read_text(encoding='utf-8');s=s.replace("paragraph(card,'达成人物 · '+item.name", "if(item.evidence)paragraph(card,item.evidence,'achievement-evidence');paragraph(card,'达成人物 · '+item.name");s=s.replace("paragraph(card,item.description);paragraph(card,item.name+", "paragraph(card,item.description);if(item.evidence)paragraph(card,item.evidence,'micro');paragraph(card,item.name+");f.write_text(s,encoding='utf-8')
