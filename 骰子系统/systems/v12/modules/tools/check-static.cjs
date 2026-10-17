'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, section } = require('./lib/harness.cjs');

const SRC = path.resolve(__dirname, '..', 'src');

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.name.endsWith('.js')) files.push(full);
  }
  return files.sort();
}

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

module.exports = function staticChecks(ctx) {
  const files = walk(SRC);
  const bodies = files.map((file) => ({ file, rel: path.relative(SRC, file).split(path.sep).join('/'), code: stripComments(fs.readFileSync(file, 'utf8')) }));

  section('静态边界（不引时间/不引浏览器/不重开旧随机特性）');

  test('源码规模与目录完整', () => {
    ctx.assert.ok(files.length >= 30, '源码文件数 ' + files.length);
    for (const required of ['rng.js', 'hunt/controller.js', 'npc/combat.js', 'beast/library.js', 'soulbone/absorption.js', 'reward/transaction.js']) {
      ctx.assert.ok(files.some((file) => file.endsWith(path.normalize(required))), '缺少 ' + required);
    }
  });

  test('不读取浏览器时间、不用 Math.random、不依赖 DOM', () => {
    const banned = [/Math\.random/, /Date\.now/, /new Date\(/, /\bdocument\./, /\bwindow\./, /localStorage/, /sessionStorage/];
    for (const { rel, code } of bodies) {
      for (const pattern of banned) ctx.assert.ok(!pattern.test(code), rel + ' 命中 ' + pattern);
    }
  });

  test('不重新引用魂性谱随机特性运行时（只允许桥接层探测基线）', () => {
    for (const { rel, code } of bodies) {
      if (rel === 'bridge/v1101.js') continue;
      ctx.assert.ok(!/WitnessTrait/.test(code), rel + ' 引用了旧随机特性运行时');
    }
  });

  test('魂骨与奖励源码不出现武魂ID绑定键', () => {
    for (const { rel, code } of bodies) {
      if (!rel.startsWith('soulbone/') && !rel.startsWith('reward/')) continue;
      ctx.assert.ok(!/\bsoulId\b/.test(code), rel + ' 使用了 soulId');
    }
  });
};
