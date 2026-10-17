'use strict';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requireInteger(value, label, min, max) {
  if (!Number.isInteger(value) || (min !== undefined && value < min) || (max !== undefined && value > max)) {
    throw new Error((label || '数值') + '须为' + (min === undefined ? '整数' : min + '—' + max + '的整数') + '，实际 ' + value);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.length) throw new Error((label || '字段') + '须为非空字符串');
  return value;
}

function uniqueIds(list, label) {
  const ids = list.map((x) => (typeof x === 'string' ? x : x && x.id));
  if (new Set(ids).size !== ids.length) throw new Error((label || '名录') + '存在重复ID：' + ids.join(','));
  return ids;
}

const RATING_ORDER = Object.freeze(['纸级', '并级', '强级', '凶级', '狂级', '神级']);
const RATING_MIN_FOR_HUNT = '凶级';

module.exports = { clone, deepFreeze, isPlainObject, requireInteger, requireString, uniqueIds, RATING_ORDER, RATING_MIN_FOR_HUNT };
