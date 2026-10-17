from pathlib import Path
p=Path(__file__).resolve().parents[1]
def edit(f,fn):
    f=p/f;f.write_text(fn(f.read_text(encoding='utf-8')),encoding='utf-8')
for name in ['systems/traits/test.cjs','systems/traits/test-balance.cjs','systems/traits/test-http.cjs']:
    edit(name,lambda s:s.replace('2464','2447'))
edit('systems/traits/test-http.cjs',lambda s:s.replace("for(const id of ['T08-08','npc-linshi'])","for(const id of ['T08-08'])").replace("get('/api/traits/not-found')","get('/api/traits/npc-linshi')"))
edit('tools/check-v11.cjs',lambda s:s.replace('const rows=[];',"fs.mkdirSync(path.join(root,'output/1008/数值回调验算'),{recursive:true});const rows=[];"))
edit('tools/package-v11.py',lambda s:s.replace('v11版','v11.01版').replace('见证者公会v11开发','见证者公会v11.01开发').replace('见证者公会v11/','见证者公会v11.01/').replace("'gameVersion':'v11'","'gameVersion':'v11.01'").replace("selected.append('特性卡与存储回归.json')","selected.extend(['特性卡与存储回归.json','v11.01专项回归.json'])"))
f=p.parent/'特性命名程序使用说明.md';f.write_text(f.read_text(encoding='utf-8').replace('2464','2447')+'\n本版已删除全部考官绑定，仅为可觉醒的玩家武魂分配特性。\n',encoding='utf-8')
print('Final v11.01 regression/package entrypoints prepared')
