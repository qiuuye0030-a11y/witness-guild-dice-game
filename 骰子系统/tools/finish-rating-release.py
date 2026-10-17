from pathlib import Path
import json
p=Path(__file__).resolve().parents[1]; root=p.parent
f=p/'tools/check-v11.cjs'; s=f.read_text(encoding='utf-8')
if "'tools/verify-rating-curve.cjs'" not in s:s=s.replace("const tests=[", "const tests=['tools/verify-rating-curve.cjs',")
f.write_text(s,encoding='utf-8')
f=p/'tools/package-v11.py';s=f.read_text(encoding='utf-8')
if '评级曲线专项回归.json' not in s:s=s.replace('files={}', "selected.extend(['评级曲线专项回归.json','评级曲线_样本.json','评级曲线_独立验证.json'])\nfiles={}")
if "add(root/'v11.01版_评级曲线与验算报告.md')" not in s:s=s.replace("add(root/'神秘伤疤女_挑战说明.md')", "add(root/'神秘伤疤女_挑战说明.md')\nadd(root/'v11.01版_评级曲线与验算报告.md')")
f.write_text(s,encoding='utf-8')
f=p/'_build_v11.py';s=f.read_text(encoding='utf-8')
s=s.replace("'特性命名程序使用说明.md','神秘伤疤女_挑战说明.md']", "'特性命名程序使用说明.md','神秘伤疤女_挑战说明.md','v11.01版_评级曲线与验算报告.md']")
if "'ratingRulesVersion':2" not in s:s=s.replace("manifest.update({", "manifest.update({'ratingRulesVersion':2,'ratingCurveAmplitude':1.8,")
f.write_text(s,encoding='utf-8')
report=json.loads((p/'output/v11/评级曲线专项回归.json').read_text(encoding='utf-8'))
table='\n'.join(f"| {t['level']} | {t['rings']} | {t['crazy']:.4f} | {t['divine']:.4f} |" for t in report['thresholds'])
text=f'''# v11.01 评级曲线修订与验算

只调整玩家的狂级、神级门槛；六维原值、成长收益、经验、等级、魂环和战斗参数保持原样。纸、并、强、凶的下界不变。分数仍为六维均值除以同级标准值。

## 门槛

令 z=clamp((等级−1)/60,0,1)，门槛倍率=1+1.8×(1−3z²+2z³)。狂级下界=1.75×倍率，神级下界=2.10×倍率。判定使用未展示舍入前的分数与门槛；表格作阅读参考。

四环以下显著提高要求；四环（41—50级）逐级放缓门槛下降，五环（51—60级）趋近原标准，六环（61级起）完全恢复原标准。不能仅靠五环入场就瞬间降低评级要求。四环之前2.48一律为凶级。

| 等级 | 环数 | 狂级下界 | 神级下界 |
| --- | --- | --- | --- |
{table}

考官及独立挑战角色保留作者设定的档案评级与战斗数值；此曲线用于玩家培养成果的评级。神秘伤疤女仍维持既定定位。

## 样本与结果

先用560条旅程比较原规则与1.8、2.4、3.0三种幅度，再选最温和且已控制低环神级的1.8。随后使用300个独立种子复核；没有用独立验证结果反复调参。

调参样本包含400条潜力×天赋×培养策略分层旅程、100条自然开局、60条高资源压力旅程。独立验证包含200条自然开局及100条低天赋、高资源、偏科培养压力旅程。观察每阶段末与最终面板；不涵盖阶段内部每次加点的瞬时评级。

| 观察项 | 原门槛 | 新门槛 |
| --- | --- | --- |
| 560条调参旅程曾达神级 | 186 | 1 |
| 300条独立验证曾达神级 | 144 | 1 |
| 合计860条曾达神级 | 330 | 2 |
| 合计四环以下曾达神级 | 328 | 0 |
| 合计最终为神级 | 273 | 1 |
| 合计曾达狂级或神级 | 646 | 147 |

独立验证剩余的神级来自62级、天赋8、潜力7的自然开局（分数2.2013），已达六环，采用原标准。这表明保留了高环正常达到神级的通路。样本是刻意分层和压力测试，不能当成真实玩家比例，也不能保证任意未来路线都不会低环成神；在本次样本内未发现低环神级批量出现。

## 存档兼容与成长一致性

邵絮泓存档30级、分数2.48、所有属性和成长保持不变，由旧神级重评为凶级；新门槛狂级{next(t for t in report['thresholds'] if t['level']==30)['crazy']:.4f}，神级{next(t for t in report['thresholds'] if t['level']==30)['divine']:.4f}。原始JSON未写入，SHA256为`{report['save']['fileSHA256']}`。

旧存档导入会按每段历史的实际等级重算评级高水位，丢弃旧狂／神晋升待确认提示，避免旧标记在新规则下触发错误的成就发放。已有成就档案保留，不回收玩家过去所得。

专项验证覆盖0—99级门槛单调性、四环降幅放缓、六环精确恢复、860条样本与实际接口逐项匹配（{report['evaluations']}次评级）、原存档连续两次导入。另以8条完整旅程做新旧评级配对对照，等级、经验、六维、成长、魂环、随机状态与投骰数量全部一致。完整回归结果另见源码包中的“最终回归.json”。

源码入口：`骰子系统/systems/battle/rules.js` 的 `ratingThresholds`；今后可单独调整幅度1.8，不需修改成长系统。评级规则版本为2，游戏版本仍为v11.01。
'''
(root/'v11.01版_评级曲线与验算报告.md').write_text(text,encoding='utf-8')
f=root/'v11.01版_更新说明.md';s=f.read_text(encoding='utf-8')
if '评级曲线修订（规则版本2）' not in s:s+='\n\n## 评级曲线修订（规则版本2）\n\n只上调玩家低环狂／神门槛，四环缓降、五环回落、六环恢复旧标准。成长、经验、等级和战斗数值不变。旧存档按历史面板重算评级高水位；既得成就保留。角色侧栏可展开查看当前门槛。详见《v11.01版_评级曲线与验算报告.md》。\n'
f.write_text(s,encoding='utf-8')
print('评级验算报告及构建、回归入口已更新')
