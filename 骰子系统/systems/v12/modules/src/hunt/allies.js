'use strict';

/**
 * 家境判定友方NPC（交接文档第五节）。
 *
 * 已定：高于5档才有概率；8—9档必有1位；10档必有2位。
 * 6、7档的50%／75%是交接文档标注的“建议值”，实现里单独带 suggested:true，
 * 方便确认后只改一条表，不改抽取与落盘逻辑。
 *
 * 落盘规则：援助概率、人数和抽中的角色都在第一次接受时固定；
 * 刷新、返回、保存再读取、展开人物说明都不能重抽。
 */

const { clone, requireInteger, uniqueIds } = require('../util');
const { VERSIONS } = require('../versions');
const { drawIndex } = require('../rng');

const ALLY_RULES = Object.freeze({
  1: { count: 0, roll: null },
  2: { count: 0, roll: null },
  3: { count: 0, roll: null },
  4: { count: 0, roll: null },
  5: { count: 0, roll: null },
  6: { count: 1, roll: 50, threshold: 50, suggested: true },
  7: { count: 1, roll: 75, threshold: 75, suggested: true },
  8: { count: 1, roll: null },
  9: { count: 1, roll: null },
  10: { count: 2, roll: null }
});

function ruleFor(originRank) {
  requireInteger(originRank, '家境档位', 1, 10);
  return { originRank, rulesVersion: VERSIONS.allyRules, ...ALLY_RULES[originRank] };
}

/** 只取角色建立时的家境／出身档位；不得用武魂潜力、成长天赋、魅力或气运代替。 */
function resolveOriginRank(character) {
  const rank = character && character.identity && character.identity.originRank;
  if (!Number.isInteger(rank) || rank < 1 || rank > 10) {
    throw new Error('角色缺少建立时的家境／出身档位 identity.originRank；不得用武魂潜力、成长天赋、魅力或气运代替');
  }
  return rank;
}

function drawNpcIds(roster, count, rng) {  // 可出场集合：有定稿到场正文的角色；未来新增但未补正文的角色不进入抽取。
  const pool = roster.list().filter((character) => character.arrivalTextAvailable !== false).map((character) => character.id);
  if (count > pool.length) throw new Error('友方NPC可出场名录不足：需要' + count + '位，只有' + pool.length + '位');
  const picked = [];
  for (let i = 0; i < count; i++) {
    const draw = drawIndex(rng, pool.length, '友方NPC抽取·第' + (i + 1) + '位');
    picked.push(pool[draw.face - 1]);
    pool.splice(draw.face - 1, 1); // 不放回，别名不会构成第二位
  }
  uniqueIds(picked, '友方NPC抽签');
  return picked;
}

/**
 * 第一次接受时判定并落盘。existing 存在时原样返回，不重投任何骰。
 * @param {object} input { originRank, roster, rng, existing }
 */
function ensureAllies(input) {
  const { roster, rng, existing } = input;
  const originRank = requireInteger(input.originRank, '家境档位', 1, 10);
  if (existing !== undefined && existing !== null) return validateAllies(existing, roster, originRank);

  const rule = ruleFor(originRank);
  const rolls = [];
  let attended = rule.count;
  if (rule.roll !== null) {
    const face = rng.d100('家境' + originRank + '档援助概率');
    attended = face <= rule.threshold ? 1 : 0;
    rolls.push({ label: '援助概率', sides: 100, face, threshold: rule.threshold, success: attended === 1 });
  }
  const npcIds = attended ? drawNpcIds(roster, attended, rng) : [];
  return Object.freeze({
    rulesVersion: VERSIONS.allyRules,
    originRank,
    count: attended,
    npcIds,
    rolls,
    source: '家境判定',
    redrawable: false
  });
}

/**
 * 读档/刷新时的校验：不自作主张重抽，只核对版本、档位与阵容合法性。
 * 若旧存档里的规则版本不同，显式报错并要求迁移，而不是静默改队友。
 */
function validateAllies(allies, roster, originRank) {
  if (!allies || typeof allies !== 'object') throw new Error('友方阵容数据无效');
  if (allies.rulesVersion !== VERSIONS.allyRules) {
    throw new Error('友方阵容规则版本不一致：存档 ' + allies.rulesVersion + '，当前 ' + VERSIONS.allyRules + '；须显式迁移，不能重抽');
  }
  if (originRank !== undefined && allies.originRank !== originRank) throw new Error('友方阵容家境档位与当前存档不一致');
  if (!Array.isArray(allies.npcIds) || !Number.isInteger(allies.count) || allies.count !== allies.npcIds.length) {
    throw new Error('友方阵容人数与名单不一致');
  }
  if (allies.count < 0 || allies.count > 2) throw new Error('友方阵容人数须为0—2');
  if (allies.count === 2) {
    if (new Set(allies.npcIds).size !== 2) throw new Error('两位友方NPC不得重复（别名不算第二位）');
  }
  for (const id of allies.npcIds) {
    const record = roster.get(id);
    if (!record) throw new Error('友方NPC不存在：' + id);
  }
  const rule = ruleFor(allies.originRank);
  if (rule.roll === null && allies.count !== rule.count) throw new Error('必定到场的友方NPC人数不符合家境规则');
  if (allies.count > rule.count) throw new Error('家境' + allies.originRank + '档最多' + rule.count + '位友方NPC');
  if (allies.count === 1 && rule.count === 0) throw new Error('家境1—5档不应有友方NPC');
  if (allies.count === 2 && allies.originRank !== 10) throw new Error('只有家境10档必有两位友方NPC');
  return Object.freeze(clone(allies));
}

function describeAllies(allies, roster) {
  validateAllies(allies, roster);
  const names = allies.npcIds.map((id) => roster.get(id).name);
  if (!allies.count) return { text: '无友方NPC', names: [] };
  return { text: names.join('、') + '（' + allies.count + '位）', names };
}

module.exports = { ALLY_RULES, ruleFor, resolveOriginRank, ensureAllies, validateAllies, drawNpcIds, describeAllies };
