from pathlib import Path
import json
p=Path(__file__).parent
source=p/'story-source-1003.json'
data=json.loads(source.read_text(encoding='utf-8'))
literal=json.dumps(data,ensure_ascii=False,indent=2,allow_nan=False).replace('</','<\\/').replace('\u2028','\\u2028').replace('\u2029','\\u2029')
script="/* 10.03运行数据，编辑源为story-source-1003.json；只导出数据。 */\n(function(root){\n'use strict';\nconst data="+literal+";\nif(typeof module!=='undefined'&&module.exports)module.exports=data;else root.WitnessEventDraft=data;\n})(typeof globalThis==='undefined'?this:globalThis);\n"
(p/'story-data.js').write_text(script,encoding='utf-8')
