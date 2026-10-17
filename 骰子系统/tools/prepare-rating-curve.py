from pathlib import Path
p=Path(__file__).resolve().parents[1]
f=p/'tools/calibrate-rating-curve.cjs';s=f.read_text(encoding='utf-8').replace('function run(config){','function run(config,runtime=x){const x=runtime;')
a=s.index('for(const config of configs){');b=s.index('\nfunction summarize',a);s=s[:a]+'if(require.main===module){\n'+s[a:b]+'\n}'+s[b:]
a=s.index('const candidates=');b=s.index('\nmodule.exports=',a);s=s[:a]+'if(require.main===module){\n'+s[a:b]+'\n}'+s[b:];f.write_text(s,encoding='utf-8')
