'use strict';

/**
 * 友方NPC名录（只读封装）。
 *
 * 交接文档第十八节：名录“负责角色定义、名称别名、定稿介绍文本、角色版本；
 * 不直接操作主线事件与玩家奖励”。本模块只读，返回深拷贝，改调用结果不会污染名录。
 * 绑定一律用稳定ID（chengliang / xutaiping / sailiya_fengzhi），显示名与别名只用于查询。
 */

const fs = require('node:fs');
const path = require('node:path');
const { clone, uniqueIds } = require('../util');
const TEXTS = require('../text/hunt-texts.generated');

const DEFAULT_DIR = path.resolve(__dirname, '..', '..', 'data', 'npc');
const REQUIRED_IDS = Object.freeze(['chengliang', 'xutaiping', 'sailiya_fengzhi']);

function createRoster(options = {}) {
  const dir = options.dir || DEFAULT_DIR;
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('名录快照缺少 manifest.json，请先运行 node tools/sync-npc.cjs');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.rosterVersion !== 1) throw new Error('不支持的名录快照版本：' + manifest.rosterVersion);

  const characters = manifest.files.map((entry) => {
    const full = path.join(dir, entry.file);
    if (!fs.existsSync(full)) throw new Error('名录快照缺少文件：' + full);
    const record = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (record.id !== entry.id) throw new Error('名录ID与清单不一致：' + entry.file);
    return record;
  });

  const ids = uniqueIds(characters, '友方NPC名录');
  for (const required of REQUIRED_IDS) {
    if (!ids.includes(required)) throw new Error('名录缺少交接文档列明的角色：' + required);
  }

  const records = new Map(characters.map((character) => [character.id, character]));
  const aliases = new Map();
  for (const character of characters) {
    for (const name of [character.name, ...(character.aliases || [])]) {
      if (aliases.has(name)) throw new Error('名录别名重复：' + name);
      aliases.set(name, character.id);
    }
  }

  function resolve(idOrName) {
    if (typeof idOrName !== 'string' || !idOrName) throw new Error('友方NPC查询须为稳定ID或名称');
    const id = aliases.get(idOrName) || idOrName;
    if (!records.has(id)) throw new Error('友方NPC不存在：' + idOrName);
    return id;
  }

  function get(idOrName) {
    return clone(records.get(resolve(idOrName)));
  }

  function list() {
    return characters.map((character) => ({
      id: character.id,
      name: character.name,
      aliases: [...(character.aliases || [])],
      nationality: character.nationality,
      level: character.level,
      rating: character.rating,
      soul: character.soul.name,
      role: character.role,
      integrated: character.implementation.integrated,
      arrivalTextAvailable: Array.isArray(TEXTS.arrivals[character.id])
    }));
  }

  function eventReference(idOrName) {
    const character = get(idOrName);
    return {
      registry: '友方npc',
      schemaVersion: character.schemaVersion,
      npcId: character.id,
      moduleVersion: manifest.rosterVersion
    };
  }

  function traitDisplay(idOrName) {
    // 交接文档：玩家显示只需要名称和效果，不显示来源、分类或子级标题。
    return get(idOrName).traits.map(({ name, effect }) => ({ name, effect }));
  }

  function arrivalText(idOrName) {
    const character = get(idOrName);
    const paragraphs = TEXTS.arrivals[character.id];
    if (!Array.isArray(paragraphs) || !paragraphs.length) throw new Error('角色缺少定稿到场正文：' + character.id);
    return paragraphs.slice();
  }

  /**
   * 按已保存的顺序拼接到场正文：
   *   0 位 → 无NPC段；1 位 → 该角色两段；2 位 → 依次两组，不合并、不改写、不省略。
   */
  function arrivalParagraphs(npcIds) {
    if (!Array.isArray(npcIds)) throw new Error('到场阵容须为稳定ID数组');
    if (npcIds.length < 0 || npcIds.length > 2) throw new Error('讨伐队伍最多两位友方NPC');
    const resolved = npcIds.map(resolve);
    if (new Set(resolved).size !== resolved.length) throw new Error('到场阵容出现重复角色，别名不构成第二位NPC');
    if (!resolved.length) return TEXTS.noNpc.slice();
    return resolved.flatMap((id) => arrivalText(id));
  }

  function combatSpec(idOrName) {
    const character = get(idOrName);
    return {
      id: character.id,
      name: character.name,
      aliases: character.aliases || [],
      level: character.level,
      rating: character.rating,
      ratingRatio: character.ratingRatio,
      style: character.style,
      role: character.role,
      soul: clone(character.soul),
      release: character.release,
      model: clone(character.model),
      stats: clone(character.model.stats),
      derived: clone(character.model.derived),
      permanentProgress: clone(character.permanentProgress || null),
      skills: clone(character.skills),
      traits: clone(character.traits),
      implementation: clone(character.implementation),
      source: { registry: '友方npc', npcId: character.id, schemaVersion: character.schemaVersion, snapshotVersion: manifest.rosterVersion }
    };
  }

  function aliasesOf(idOrName) {
    const character = get(idOrName);
    return [character.name, ...(character.aliases || [])];
  }

  function summary() {
    return {
      rosterVersion: manifest.rosterVersion,
      copiedFrom: manifest.copiedFrom,
      count: characters.length,
      ids: ids.slice(),
      characters: list()
    };
  }

  return Object.freeze({
    get,
    list,
    eventReference,
    traitDisplay,
    arrivalText,
    arrivalParagraphs,
    combatSpec,
    aliasesOf,
    resolve,
    summary,
    REQUIRED_IDS
  });
}

module.exports = { createRoster, DEFAULT_DIR, REQUIRED_IDS };
