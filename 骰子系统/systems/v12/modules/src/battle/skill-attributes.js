'use strict';

const { clone } = require('../util');

const NONE = new Set(['无', '无属性', '无属性武魂', 'none', 'neutral']);

/** 只读取武魂/魂兽的属性，不把空间等机制标签自动当成元素属性。 */
function attributeTags(source) {
  const soul = source && source.soul ? source.soul : source;
  if (!soul || typeof soul !== 'object') return ['无'];
  if (typeof soul.attribute_category === 'string' && NONE.has(soul.attribute_category.trim())) return ['无'];
  const raw = Array.isArray(soul.elements) && soul.elements.length ? soul.elements : [soul.attribute];
  const tags = raw.flatMap((value) => typeof value === 'string' ? value.replace(/^复合(?:属性)?[·：:]?/, '').split(/[／/、,，+＆&|\s]+/u) : [])
    .map((value) => value.trim()).filter((value) => value && !NONE.has(value));
  return [...new Set(tags)].length ? [...new Set(tags)] : ['无'];
}

/** 标签与伤害通道分开：物理/能量/精神仍用channel；复合属性不丢失。 */
function tagSkill(skill, source) {
  if (!skill || typeof skill !== 'object') throw new Error('魂技属性标签缺少技能');
  const tags = attributeTags(source);
  return { ...clone(skill), attribute: tags.join('／'), element: tags.join('／'), elements: tags.slice(), attributeTags: tags.slice(), attributeRulesVersion: 1 };
}

function tagUnitSkills(unit) {
  const next = clone(unit);
  next.skills = (next.skills || []).map((skill) => tagSkill(skill, next.soul || next));
  return next;
}

/** 旧档/武魂变化后的统一刷新入口。不触碰魂骨技与角色成长，不重抽技能。 */
function tagCharacterSkills(character, resolvedSoul = character && character.soul) {
  const next = clone(character);
  for (const ring of next.rings || []) ring.skills = (ring.skills || []).map((skill) => tagSkill(skill, resolvedSoul));
  for (const key of ['preStoredNinthRing', 'pendingNinthRing']) {
    if (next[key]) next[key].skills = (next[key].skills || []).map((skill) => tagSkill(skill, resolvedSoul));
  }
  if (Array.isArray(next.skills)) next.skills = next.skills.map((skill) => tagSkill(skill, resolvedSoul));
  return next;
}

module.exports = { attributeTags, tagSkill, tagUnitSkills, tagCharacterSkills };
