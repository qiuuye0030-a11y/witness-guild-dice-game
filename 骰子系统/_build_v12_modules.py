"""Bundle the reviewed local CommonJS modules for offline browser/VM use."""
from pathlib import Path
import json
p = Path(__file__).resolve().parent
base = p/'systems/v12/modules'
factories=[]
for f in sorted((base/'src').rglob('*.js')):
    key='/modules/'+f.relative_to(base).as_posix()
    factories.append(json.dumps(key)+':function(require,module,exports,__dirname){\n'+f.read_text(encoding='utf-8')+'\n}')
data={'/modules/'+f.relative_to(base).as_posix(): f.read_text(encoding='utf-8') for f in (base/'data').rglob('*.json')}
body='''const factories={FACTORIES},files=DATA,cache={};
function normalize(p){const out=[];for(const x of p.replace(/\\\\/g,'/').split('/')){if(x==='..')out.pop();else if(x&&x!=='.')out.push(x);}return '/'+out.join('/');}
const paths={resolve:(...p)=>normalize(p.join('/')),join:(...p)=>normalize(p.join('/'))};
const fs={existsSync:p=>Object.hasOwn(files,normalize(p)),readFileSync:p=>{const key=normalize(p);if(!Object.hasOwn(files,key))throw Error('内置资料不存在：'+key);return files[key];}};
function load(id){if(cache[id])return cache[id].exports;if(!factories[id])throw Error('内置模块不存在：'+id);const module={exports:{}};cache[id]=module;const dir=id.slice(0,id.lastIndexOf('/'));const req=name=>{if(name==='node:fs')return fs;if(name==='node:path')return paths;let key=normalize(dir+'/'+name);if(!key.endsWith('.js'))key+='.js';return load(key);};factories[id](req,module,module.exports,dir);return module.exports;}
root.WitnessV12Factory=load('/modules/src/splice/compose.js');
root.WitnessV12=root.WitnessV12Factory.createModules({rules:root.WitnessRules});
'''.replace('DATA',json.dumps(data,ensure_ascii=False)).replace('FACTORIES',','.join(factories))
(p/'systems/v12/modules-bundle.js').write_text('(function(root){\n'+body+'\n})(globalThis);\n',encoding='utf-8')
print('v12 offline modules bundled:',len(factories))
