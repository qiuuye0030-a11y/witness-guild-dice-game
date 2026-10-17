'use strict';

/**
 * 与游戏 core.js 的 DiceEngine 同算法的确定性投骰。
 *
 * 交接文档要求：沿用游戏确定性种子与投骰日志，禁止读取浏览器当前时间另起随机数。
 * 因此这里不调用 Math.random，也不读 Date；种子由调用方传入，序列状态可存档续投。
 * 算法逐行对齐 v11.01 的 `骰子系统/core.js`：
 *   hashSeed = FNV-1a；nextUint = (state + 0x6D2B79F5) 再 xorshift-mix；die 用拒绝采样。
 */

function hashSeed(seed) {
  let h = 2166136261;
  for (const c of String(seed)) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

class DiceEngine {
  constructor(seed, state) {
    this.seed = String(seed);
    this.state = state === undefined ? hashSeed(seed) : state >>> 0;
  }

  nextUint() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  die(sides) {
    if (!Number.isInteger(sides) || sides < 2 || sides > 100000) {
      throw new Error('骰子面数须为2—100000的整数');
    }
    const limit = Math.floor(4294967296 / sides) * sides;
    let u;
    do {
      u = this.nextUint();
    } while (u >= limit);
    return (u % sides) + 1;
  }

  roll(sides, count = 1, modifier = 0) {
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      throw new Error('同投数量须为1—100的整数');
    }
    if (!Number.isInteger(modifier) || modifier < -999 || modifier > 999) {
      throw new Error('总修正须为−999到999的整数');
    }
    const before = this.state;
    const faces = Array.from({ length: count }, () => this.die(sides));
    const subtotal = faces.reduce((a, b) => a + b, 0);
    return { sides, count, modifier, faces, subtotal, total: subtotal + modifier, before, after: this.state };
  }
}

/**
 * 带日志的投骰器。日志条目结构与游戏 state.rolls 接近，至少含：
 * label / sides / face / seq / seed / stateAfter / version。
 * 调用方可把 entries 原样落入存档，读档后用 restore 继续，序列不回卷。
 */
class RollLog {
  constructor(seed, entries, state) {
    this.engine = new DiceEngine(seed, state === undefined ? undefined : state);
    this.seed = String(seed);
    this.entries = Array.isArray(entries) ? entries.map((e) => ({ ...e })) : [];
    this.seq = this.entries.reduce((n, e) => Math.max(n, e.seq || 0), 0);
  }

  die(sides, label, context) {
    const before = this.engine.state;
    const face = this.engine.die(sides);
    const entry = {
      seq: ++this.seq,
      label: String(label || '投骰'),
      sides,
      face,
      seed: this.seed,
      stateBefore: before,
      stateAfter: this.engine.state,
      ...(context === undefined ? {} : { context })
    };
    this.entries.push(entry);
    return face;
  }

  d100(label, context) {
    return this.die(100, label, context);
  }

  d10000(label, context) {
    return this.die(10000, label, context);
  }

  get state() {
    return this.engine.state;
  }

  snapshot() {
    return { seed: this.seed, state: this.engine.state, seq: this.seq, entries: this.entries.map((e) => ({ ...e })) };
  }

  static restore(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') throw new Error('投骰日志快照无效');
    if (typeof snapshot.seed !== 'string' && typeof snapshot.seed !== 'number') throw new Error('投骰日志缺少种子');
    return new RollLog(snapshot.seed, snapshot.entries, snapshot.state);
  }
}

/** 统一入口：种子 + 可选日志快照。 */
function createRng(seed, snapshot) {
  if (snapshot !== undefined) return RollLog.restore(snapshot);
  return new RollLog(seed);
}

/**
 * 从 count 个等概率选项中取一个。count 为 1 时只有一种结果，不消耗随机序列，
 * 但仍返回一个可审计的退化记录（游戏骰子要求面数≥2，不能 die(1)）。
 */
function drawIndex(rng, count, label, context) {
  if (!Number.isInteger(count) || count < 1) throw new Error('抽取项数须为≥1的整数');
  if (count === 1) return { face: 1, sides: 1, degenerate: true, label };
  return { face: rng.die(count, label, context), sides: count, degenerate: false, label };
}

/** 大权重池仍只调用宿主支持的≤100000面骰，使用拒绝采样保持等概率。 */
function drawWeightedFace(rng, total, label, context) {
  if (!Number.isSafeInteger(total) || total < 1 || total > 281474976710656) throw new Error('权重总和超出可投骰范围');
  if (total === 1) return 1;
  if (total <= 100000) return rng.die(total, label, context);
  const range = 281474976710656; // 2^48，三枚1d65536组合，无浮点精度损失
  const limit = Math.floor(range / total) * total;
  let value;
  do {
    value = 0;
    for (let i = 0; i < 3; i++) value = value * 65536 + rng.die(65536, label, context) - 1;
  } while (value >= limit);
  return value % total + 1;
}

module.exports = { DiceEngine, RollLog, hashSeed, createRng, drawIndex, drawWeightedFace };
