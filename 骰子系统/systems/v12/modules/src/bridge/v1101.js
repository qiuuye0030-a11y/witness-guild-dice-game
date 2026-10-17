'use strict';

/**
 * 与 v11.01 现有战斗/规则代码的连接桥。
 *
 * “战斗的数值可以调用战斗方面的代码”：评级、派生值、魂技生成、控制结算、
 * 魂环年限分档都直接调用 v11.01 的 WitnessRules，而不是在本包里再写一套。
 * 主游戏拼接时也可以不经过本桥，直接把活着的 WitnessRules 作为 ratingFn/rules 注入。
 */

const fs = require('node:fs');
const path = require('node:path');
const { tagSkill } = require('../battle/skill-attributes');

const GAME_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
// 交接文档指定的v12基线是“武魂精简版”（已移除魂性谱随机特性运行模块与数据）；
// 若不存在则退回v11.01开发。两者规则版本一致（计算11、评级2）。
const CANDIDATES = [
  path.resolve(__dirname, '..', '..', '..', '..', '..'),
  path.join(GAME_ROOT, 'v11.01武魂精简开发', '骰子系统'),
  path.join(GAME_ROOT, 'v11.01开发', '骰子系统')
];

let cached = null;

function resolveGameDir() {
  if (process.env.WITNESS_GAME_DIR) return process.env.WITNESS_GAME_DIR;
  const found = CANDIDATES.find((dir) => fs.existsSync(path.join(dir, 'v13-runtime.cjs')));
  return found || CANDIDATES[CANDIDATES.length - 1];
}

function loadRuntime() {
  if (cached) return cached;
  const dir = resolveGameDir();
  const entry = path.join(dir, 'v13-runtime.cjs');
  if (!fs.existsSync(entry)) {
    throw new Error('找不到 v11.01 战斗运行时：' + entry + '；可用 WITNESS_GAME_DIR 指定，或在拼接时直接注入 WitnessRules');
  }
  cached = require(entry);
  return cached;
}

function rules() {
  const runtime = loadRuntime();
  if (!runtime.WitnessRules) throw new Error('v11.01 运行时缺少 WitnessRules');
  return runtime.WitnessRules;
}

function rating(model) {
  return rules().rating(model);
}

function derive(stats) {
  return rules().derive(stats);
}

function makeSkill(args) {
  return tagSkill(rules().makeSkill(args), args.soul);
}

function pickCategory(style, roll) {
  return rules().pickCategory(style, roll);
}

function controlEffect(Q, attacker, defender) {
  return rules().controlEffect(Q, attacker, defender);
}

function benchmark(level) {
  return rules().benchmark(level);
}

function band(years) {
  return rules().band(years);
}

function constants() {
  const R = rules();
  return { CAPS: R.CAPS.slice(), BANDS: R.BANDS.slice(), QS: R.QS.slice(), CATEGORIES: R.CATEGORIES.slice() };
}

/**
 * 基线自检：确认接的是“已删除魂性谱随机特性”的精简版，而不是把旧随机特性带回游戏。
 * 同时保留会长/伤疤女等独立角色机制的入口（WitnessScarredChallenge）。
 */
function baseline() {
  const runtime = loadRuntime();
  return {
    dir: resolveGameDir(),
    rulesVersion: rules().calculationVersion,
    ratingRulesVersion: rules().ratingRulesVersion,
    hasRandomSoulTraitRuntime: !!(runtime.WitnessTraitRuntime || runtime.WitnessTraitData || runtime.WitnessTraits),
    hasBattle: !!runtime.WitnessBattle,
    hasRoleChallenge: !!runtime.WitnessScarredChallenge
  };
}

module.exports = { resolveGameDir, loadRuntime, rules, rating, derive, makeSkill, pickCategory, controlEffect, benchmark, band, constants, baseline };
