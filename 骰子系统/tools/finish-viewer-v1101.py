from pathlib import Path
p=Path(__file__).resolve().parents[1]
f=p/'systems/traits/viewer.template.html';s=f.read_text(encoding='utf-8').replace('<option value="member">会员与会长</option>','');f.write_text(s,encoding='utf-8')
f=p/'systems/traits/test.cjs';s=f.read_text(encoding='utf-8').replace("assert.equal(vm.runInContext('filtered.length',sandbox),17)","assert.equal(vm.runInContext('filtered.length',sandbox),0)");f.write_text(s,encoding='utf-8')
