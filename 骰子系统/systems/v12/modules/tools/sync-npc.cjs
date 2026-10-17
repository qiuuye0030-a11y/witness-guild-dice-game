'use strict';

/**
 * 把《友方npc》名录快照进本模块包，并记录来源与校验和。
 *
 * 交接文档要求“必须按稳定ID绑定，不能用显示姓名的字符串拼写决定角色机制”，
 * 也要求名录后续可能改版。这里保留一份只读快照，同时记录来源文件的 sha256：
 *   - 主游戏/名录改版后，运行本脚本刷新快照；
 *   - tools/check.cjs 会比对快照与来源，发现漂移就提示重新同步，而不是静默使用旧值。
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MODULE_ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.resolve(MODULE_ROOT, '..', '..', '..', '..', '..', '友方npc', 'characters');
const TARGET_DIR = path.join(MODULE_ROOT, 'data', 'npc');
const REQUIRED = ['chengliang', 'xutaiping', 'sailiya_fengzhi'];

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function main() {
  if (!fs.existsSync(SOURCE_DIR)) throw new Error('找不到友方npc名录目录：' + SOURCE_DIR);
  fs.mkdirSync(TARGET_DIR, { recursive: true });
  // 扫描名录目录下的全部角色JSON，新增角色不必改本脚本。
  const files = fs.readdirSync(SOURCE_DIR).filter((name) => name.endsWith('.json')).sort();
  const records = [];
  for (const file of files) {
    const from = path.join(SOURCE_DIR, file);
    const buffer = fs.readFileSync(from);
    const parsed = JSON.parse(buffer.toString('utf8'));
    if (typeof parsed.id !== 'string' || !parsed.id) throw new Error(file + ' 缺少稳定ID');
    if (!Array.isArray(parsed.skills) || parsed.skills.length !== 8) throw new Error(parsed.id + ' 的魂技数不为8');
    if (!Array.isArray(parsed.traits) || parsed.traits.length < 1) throw new Error(parsed.id + ' 缺少特性');
    if (!parsed.implementation || parsed.implementation.integrated !== false) throw new Error(parsed.id + ' 的接入状态不是 specification-only');
    const to = path.join(TARGET_DIR, file);
    fs.writeFileSync(to, buffer);
    records.push({
      id: parsed.id,
      name: parsed.name,
      file,
      sha256: sha256(buffer),
      bytes: buffer.length,
      level: parsed.level,
      rating: parsed.rating,
      traitCount: parsed.traits.length,
      skillCount: parsed.skills.length
    });
  }
  for (const id of REQUIRED) if (!records.some((record) => record.id === id)) throw new Error('名录缺少交接文档列明的角色：' + id);
  const manifest = {
    rosterVersion: 1,
    copiedFrom: path.relative(MODULE_ROOT, SOURCE_DIR).split(path.sep).join('/'),
    sourceNote: '友方npc 名录为独立规范，尚未接入主游戏战斗；本目录只保存只读快照。',
    files: records
  };
  fs.writeFileSync(path.join(TARGET_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('已同步 ' + records.length + ' 位友方NPC到 ' + path.relative(process.cwd(), TARGET_DIR));
  for (const record of records) console.log('  ' + record.id + ' · ' + record.name + ' · ' + record.rating + ' · ' + record.traitCount + '特性/' + record.skillCount + '技 · ' + record.sha256.slice(0, 12));
}

main();
