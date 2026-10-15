见证者公会 V14 完整交接版

先打开：交接手册_从这里开始.html
换会话：提供整个ZIP及 给下一位AI_继续任务.txt
机器索引：handover-state.json
本交接版没有改变运行代码；后续任务、证据、复现与验收条件见手册。

见证者公会 10.05 · 战斗 V14 修正与测试

游玩：双击根目录的经典深靛版或晨曦朝阳版 HTML。两者内置全部资源，可离线使用。
阅读结果：打开《修正与测试说明.html》。具体完成范围、测试规模和剩余问题以该说明为准。

源码和测试无需 npm 安装或联网。请先安装 Node.js（建议 22 或更新版本）。
在解压后的根目录打开终端，依次执行：
  node v14_work/prepare-release.cjs
  node v14_work/tests/mechanics.cjs
  node v14_work/tests/projection.cjs
  node v14_work/tests/ai.cjs
  node v14_work/tests/integration.cjs
  node v14_work/tests/legacy-regression.cjs fixed

  node v14_work/tests/review-probes.cjs
  node v14_work/tests/review-ai-v2-regressions.cjs

可选独立复核：node v14_work/tests/review-probes.cjs

prepare-release.cjs 仅校验并复制两份成品 HTML 到测试所需的 dist 目录。
这些是模型、结算、AI、存档和脚本集成测试；实际浏览器验证情况见中文说明。

重算胜率：正式报告保留完整逐局 JSONL、计划、源文件哈希及汇总。
本包正式结果标签：release-final, holdout
机制隔离等附录标签：initial
原结果不可混入新代码或不同参数的续跑。若要重新测试，请选新的 --label。
轻量检查示例（12 局，不等于完整报告的样本规模）：
  node v14_work/tests/compare.cjs run --mode fixed --label my-check --limit 12
完整对照可依据对应 compare-<标签>-plan.json 和 manifest.json 重建相同参数；
对 baseline、mechanics、fixed 分别运行，再用 summarize 汇总。

重新构建两主题：另需 Python 3（只使用标准库）。执行：
  python v14_work/build_package.py
输出位于 v14_work/dist；guild 内原 10.05 HTML 保留不动。
根目录 HTML 是发布时的成品，重新构建不会自动覆盖它们。

文件说明：
  analysis_src：原基线的测试运行脚本（不含重复画像）。
  guild：原两主题 HTML，供完整重建与基线核对。
  v14_work/src：本次五个运行模块。
  v14_work/tests：可直接运行的测试与对照程序。
  v14_work/results、test-results：定向回归、逐局记录、汇总与验证证据。
  audit_results/mixed-characters.json：对照使用的人物样本。
  v14_review/package：旧回归脚本必需的少量源文件，保留原相对路径。
  release-manifest.json：每个文件的 SHA-256、大小及选用标签。

文件哈希可用 assemble_release.py verify 验证；程序会校验全部记录后在新目录解压测试。
本包不包含开发时的 smoke 对照记录、旧大 ZIP 或单独画像文件。
