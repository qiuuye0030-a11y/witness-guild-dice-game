from pathlib import Path
p=Path(__file__).resolve().parents[1];root=p.parent
warning='> 特性卡修订提示：本报告中的战斗胜率是删除旧通用被动之前的历史结果，不能用于评价当前版本；本次须重算双方基线。修改与验收范围见《v11版_特性卡修订说明》。\n\n'
f=root/'v11版_数值与验收报告.md';s=f.read_text(encoding='utf-8')
if not s.startswith('> 特性卡修订提示'):f.write_text(warning+s,encoding='utf-8')
f=p/'tools/report-v11.py';s=f.read_text(encoding='utf-8');line="(root/'v11版_数值与验收报告.md').write_text(text,encoding='utf-8')"
if '特性卡修订提示' not in s:s=s.replace(line,'text='+repr(warning)+'+text\n'+line)
f.write_text(s,encoding='utf-8')
f=root/'v11版_更新说明.md';s=f.read_text(encoding='utf-8');note='本次追加特性卡修订：已删除旧通用被动及实际加成；新特性独立框选，作用短句不超过20字且无数值；角色按ID保存绑定与动态状态。先阅读《v11版_特性卡修订说明》，原战斗胜率仅作历史记录。\n\n'
if note not in s:s=s.replace('# 见证者公会 v11\n\n','# 见证者公会 v11\n\n'+note)
f.write_text(s,encoding='utf-8')
f=root/'开发与复测说明.md';s=f.read_text(encoding='utf-8');note='当前已移除旧通用被动。`balance-matrix3-v11.cjs` 是保留旧通用被动时的历史矩阵脚本，不适用于本次版本；不能复用其关闭侧数据。后续需从当前引擎重新生成全部关闭/开启对局；保留文件仅便于审计历史实验。会员对比的历史缓存同样不可当作当前未改动的基线。\n\n'
if note not in s:s=s.replace('# v11 开发与复测\n\n','# v11 开发与复测\n\n'+note)
f.write_text(s,encoding='utf-8')
# Refuse to silently reuse a now-incompatible frozen battle baseline.
f=p/'tools/balance-matrix3-v11.cjs';s=f.read_text(encoding='utf-8');guard="if(!load().WITNESS_CATALOG.some(s=>s.combat_profile))throw Error('旧矩阵复测脚本只适用于保留通用被动的历史版本；当前已删除旧被动，请重新计算关闭和开启双方基线。');\n"
if guard not in s:s=s.replace("const out=",guard+"const out=",1)
f.write_text(s,encoding='utf-8')
