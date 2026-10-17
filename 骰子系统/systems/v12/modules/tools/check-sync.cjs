'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { test, section } = require('./lib/harness.cjs');

const MODULE_ROOT = path.resolve(__dirname, '..');
const SNAPSHOT_DIR = path.join(MODULE_ROOT, 'data', 'npc');
const SOURCE_DIR = path.resolve(MODULE_ROOT, '..', '..', '友方npc', 'characters');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = function syncChecks(ctx) {
  section('名录快照同步');

  test('快照与《友方npc》来源一致（若来源不存在则跳过）', () => {
    if (!fs.existsSync(SOURCE_DIR)) {
      console.log('    （来源目录不存在，跳过漂移比对：' + SOURCE_DIR + '）');
      return;
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, 'manifest.json'), 'utf8'));
    for (const entry of manifest.files) {
      const source = path.join(SOURCE_DIR, entry.file);
      if (!fs.existsSync(source)) {
        ctx.assert.ok(true, '来源缺少 ' + entry.file + '，以快照为准');
        continue;
      }
      const actual = sha256(fs.readFileSync(source));
      ctx.assert.equal(entry.sha256, actual, '名录已改版：' + entry.id + '；请运行 node tools/sync-npc.cjs 后复核');
      const snapshot = sha256(fs.readFileSync(path.join(SNAPSHOT_DIR, entry.file)));
      ctx.assert.equal(snapshot, actual, '快照与来源不一致：' + entry.id);
    }
  });

  test('快照自己内部一致：ID、八技、特性、未接入状态', () => {
    for (const id of ['chengliang', 'xutaiping', 'sailiya_fengzhi']) {
      const record = ctx.roster.combatSpec(id);
      ctx.assert.equal(record.id, id);
      ctx.assert.equal(record.skills.length, 8);
      ctx.assert.ok(record.traits.length >= 2);
      ctx.assert.equal(record.implementation.integrated, false);
      ctx.assert.equal(record.source.npcId, id);
    }
  });
};
