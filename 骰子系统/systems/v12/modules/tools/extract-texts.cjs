'use strict';

/**
 * 从《v12_重大更新交接文档.md》逐字提取定稿文本，生成 src/text/hunt-texts.generated.js。
 * 解析规则在 tools/lib/doc-text.cjs，校验器复用同一实现。
 */

const fs = require('node:fs');
const path = require('node:path');
const { extract } = require('./lib/doc-text.cjs');

const OUT_PATH = path.resolve(__dirname, '..', 'src', 'text', 'hunt-texts.generated.js');

function render(data) {
  return [
    "'use strict';",
    '',
    '// 本文件由 tools/extract-texts.cjs 从《v12_重大更新交接文档.md》自动生成，请勿手改。',
    '// 文本逐字来自交接文档，包含全角空格、引号与标点；校验见 tools/check-text.cjs。',
    'const TEXTS = ' + JSON.stringify(data, null, 2) + ';',
    '',
    '(function deepFreeze(value) {',
    '  if (value && typeof value === "object" && !Object.isFrozen(value)) {',
    '    Object.freeze(value);',
    '    for (const key of Object.keys(value)) deepFreeze(value[key]);',
    '  }',
    '})(TEXTS);',
    '',
    'module.exports = TEXTS;',
    ''
  ].join('\n');
}

const data = extract();
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, render(data), 'utf8');
console.log('已生成 ' + path.relative(process.cwd(), OUT_PATH));
console.log('文档 sha256 ' + data.source.sha256);
for (const [name, list] of Object.entries({ invitation: data.invitation.paragraphs, refusal: data.refusal, accepted: data.accepted, noNpc: data.noNpc, ...data.arrivals })) {
  console.log('  ' + name + '：' + list.length + ' 段，' + list.map((x) => x.length).join('/') + ' 字');
}
