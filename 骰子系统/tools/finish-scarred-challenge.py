from pathlib import Path
p=Path(__file__).resolve().parents[1]
def edit(f,fn):
    f=p/f;f.write_text(fn(f.read_text(encoding='utf-8')),encoding='utf-8')
edit('tools/verify-scarred-challenge.cjs',lambda s:s.replace('assert.equal(b.basicCost(u),0);','assert.equal(b.basicCost(u),Math.max(1,Math.ceil(u.model.derived.baseMP*b.resourceConfig.basicFraction))*2);'))
edit('battle-ui-v13.js',lambda s:s.replace('生命归零时魂技和普攻免费','生命归零时魂技免费，普攻仍按两倍费用'))
edit('tools/check-v11.cjs',lambda s:s.replace('const tests=[',"const tests=['tools/verify-scarred-challenge.cjs',"))
edit('tools/package-v11.py',lambda s:s.replace("selected.extend(['特性卡与存储回归.json'","selected.extend(['神秘伤疤女专项回归.json','特性卡与存储回归.json'").replace("add(root/'v11.01版_特性卡修订说明.md')","add(root/'神秘伤疤女_挑战说明.md')"))
edit('_build_v11.py',lambda s:s.replace("'特性命名程序使用说明.md']","'特性命名程序使用说明.md','神秘伤疤女_挑战说明.md']").replace("'traitCardRevision':4","'scarredChallengeVersion':1,'traitCardRevision':4"))
f=p.parent/'v11.01版_更新说明.md';s=f.read_text(encoding='utf-8');s+='\n追加独立挑战“神秘伤疤女”：与玩家同级的神级角色，仅两项万年最高档魂技，具备事象洞穿、祥光、多识、幽行。入口在原结局后的挑战目录，沿用共用挑战机会与战报历史；不会成为随机考官，亦不绑定随机武魂特性。详见《神秘伤疤女_挑战说明》。\n';f.write_text(s,encoding='utf-8')
