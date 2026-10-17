'use strict';

/**
 * 独立模块包总校验入口。
 * 运行：node tools/check.cjs
 * 只读本包与交接文档、v11.01 规则代码；不写主游戏文件。
 */

const path = require('node:path');
const { section, report } = require('./lib/harness.cjs');

const MODULE_ROOT = path.resolve(__dirname, '..');

async function main() {
  const doc = require('./lib/doc-text.cjs');
  const TEXTS = require('../src/text/hunt-texts.generated');
  const bridge = require('../src/bridge/v1101');
  const { createModules } = require('../src/splice/compose');

  const modules = createModules({ ratingFn: bridge.rating });
  const ctx = {
    assert: require('node:assert/strict'),
    doc,
    TEXTS,
    bridge,
    modules,
    roster: modules.roster,
    texts: modules.hunt.texts
  };

  section('模块包状态');
  const status = modules.status();
  console.log('  版本：' + JSON.stringify(status.versions));
  console.log('  名录：' + status.roster.count + ' 位 · ' + status.roster.ids.join('/'));
  console.log('  魂兽库：' + (status.library.empty ? '空库（等待用户补充）' : status.library.count + ' 条'));
  console.log('  魂骨特性池：' + (status.traitPool.empty ? '空池（等待用户编写）' : status.traitPool.count + ' 条'));
  console.log('  NPC操作类型：' + status.npcCombat.operationTypes + ' · 宿主原语：' + status.npcCombat.primitives + ' · 就绪：' + status.npcCombat.readiness.every((item) => item.ready));

  require('./check-text.cjs')(ctx);
  require('./check-numbers.cjs')(ctx);
  require('./check-npc.cjs')(ctx);
  require('./check-modules.cjs')(ctx);
  require('./check-engine.cjs')(ctx);
  require('./check-static.cjs')(ctx);
  require('./check-sync.cjs')(ctx);
  require('./check-regressions.cjs')(ctx);
  require('./check-beasts.cjs')(ctx);
  require('./check-skill-attributes.cjs')(ctx);

  const ok = report();
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error('校验器自身异常：' + (error && error.stack ? error.stack : error));
  process.exitCode = 1;
});
