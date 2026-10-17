"""Run actual regression processes and retain their individual exit codes."""
from pathlib import Path
import json,subprocess,time,sys
sys.stdout.reconfigure(encoding='utf-8')
p=Path(__file__).resolve().parent
out=p.parent/'output'/'v12';out.mkdir(parents=True,exist_ok=True)
for folder in ['v11','1008/数值回调验算']:(p.parent/'output'/folder).mkdir(parents=True,exist_ok=True)
scripts=['verify-v1201.cjs','verify-v12.cjs','verify-v12-ui.cjs','verify-merged-v11.cjs','verify-scarred-challenge.cjs','verify-cultivation-1008.cjs','verify-achievements-1008.cjs','verify-growth-1008.cjs','../systems/v12/modules/tools/check.cjs']
results=[]
for script in scripts:
    start=time.monotonic()
    run=subprocess.run(['node',str(p/script)],cwd=p.parent,capture_output=True,encoding='utf-8',errors='replace')
    (out/(Path(script).name+'.log')).write_text(run.stdout+run.stderr,encoding='utf-8')
    item={'script':script,'exitCode':run.returncode,'seconds':round(time.monotonic()-start,2),'lastLines':run.stdout.splitlines()[-3:]}
    results.append(item)
    print(json.dumps(item,ensure_ascii=False),flush=True)
report={'allPassed':all(r['exitCode']==0 for r in results),'visualReview':False,'checks':results}
(out/'发布回归汇总.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
sys.exit(0 if report['allPassed'] else 1)
