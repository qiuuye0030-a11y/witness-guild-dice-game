from pathlib import Path
import json
p=Path(__file__).resolve().parents[1];f=p/'output/v11/秦衍当前版本胜率.json'
d=json.loads(f.read_text(encoding='utf-8'));assert d['complete'],'测试尚未完成'
trait=next(t for t in json.loads((p/'systems/traits/traits.json').read_text(encoding='utf-8'))['items'] if t['soulId']=='npc-qinyan')
def cells(g):return f"{g['off']['wins']}/{g['off']['n']}（{g['off']['winRate']:.1%}）|{g['on']['wins']}/{g['on']['n']}（{g['on']['winRate']:.1%}）"
s='# 当前v11秦衍胜率复测\n\n'+d['method']+'\n\n只创建测试对局、输出报告，没有修改游戏数值、文案或分享包。\n\n'
s+='|等级|关闭新特性|双方开启新特性|\n|---|---|---|\n'
for level,g in d['byLevel'].items():s+=f'|{level}|{cells(g)}|\n'
s+=f"|合计|{cells(d['overall'])}|\n\n"
s+='|对战形式|关闭新特性|双方开启新特性|\n|---|---|---|\n'
for team,g in d['byTeam'].items():s+=f'|{team}v{team}|{cells(g)}|\n'
s+=f"\n配对反转：由负转胜{d['lossToWin']}组，由胜转负{d['winToLoss']}组。\n\n"
s+=f"秦衍绑定的是成长类特性“{trait['name']}”，此测试没有虚构过去训练收益，也没有把它作为战斗被动强行触发。我方组兑现次数若非零，来自辅助搭档；开关差异还可能来自对手特性改变出手时机、资源消耗和AI选择，不能解读成秦衍特性直接提升了对应胜率。\n\n"
s+='每个对手、等级只使用一个固定种子，各对阵等权。此为样本内胜率，不能代表所有种子、操作策略、培养状态下的总体胜率；未计入独立95级会长挑战。旧版31/45等数字对应另一引擎、种子或组队口径，本报告不直接将其相减归因为本次某项改动。\n\n'
s+='|对手|等级|形式|关闭|开启|开启时我方组兑现/敌方组兑现|\n|---|---|---|---|---|---|\n'
for r in d['rows']:
    outcome=lambda q:'胜' if q['winner']==0 else '负'
    s+=f"|{r['enemyName']}|{r['level']}|{r['teamSize']}v{r['teamSize']}|{outcome(r['off'])}|{outcome(r['on'])}|{r['on']['ownProcs']}/{r['on']['enemyProcs']}|\n"
s+='\n实测引擎SHA256：`'+d['engineSHA256']+'`。逐场种子、时间及判决理由见同目录JSON。\n'
(p/'output/v11/秦衍当前版本胜率.md').write_text(s,encoding='utf-8')
print(json.dumps({'overall':d['overall'],'byLevel':d['byLevel'],'byTeam':d['byTeam'],'lossToWin':d['lossToWin'],'winToLoss':d['winToLoss']},ensure_ascii=False))
