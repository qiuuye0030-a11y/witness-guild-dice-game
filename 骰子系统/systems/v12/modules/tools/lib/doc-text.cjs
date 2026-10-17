'use strict';

/**
 * 交接文档文本抽取的共用实现：生成器与校验器都调用这里，避免两套解析规则漂移。
 * 只做机械提取，不重写任何一句话。
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MODULE_ROOT = path.resolve(__dirname, '..', '..');
const DOC_PATH = path.resolve(MODULE_ROOT, 'reference', 'v12_重大更新交接文档.md');

function fail(message) {
  throw new Error('文本提取失败：' + message);
}

function readDoc() {
  if (!fs.existsSync(DOC_PATH)) fail('找不到交接文档：' + DOC_PATH);
  return fs.readFileSync(DOC_PATH, 'utf8');
}

function sectionBody(lines, title) {
  const heading = '### ' + title;
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) fail('找不到小节「' + title + '」');
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^###\s/.test(line) || /^##\s/.test(line)) break;
    body.push(line);
  }
  return body;
}

function blockquoteParagraphs(body) {
  const paragraphs = [];
  let current = null;
  for (const line of body) {
    if (!line.startsWith('>')) {
      if (current) {
        paragraphs.push(current.join(''));
        current = null;
      }
      continue;
    }
    let content = line.slice(1);
    if (content.startsWith(' ')) content = content.slice(1);
    if (content.trim() === '') {
      if (current) {
        paragraphs.push(current.join(''));
        current = null;
      }
      continue;
    }
    if (!current) current = [];
    current.push(content);
  }
  if (current) paragraphs.push(current.join(''));
  return paragraphs;
}

function boldMatches(text) {
  return [...text.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]);
}

function assertLength(name, list, expected) {
  if (list.length !== expected) fail(name + '应有 ' + expected + ' 段，实际 ' + list.length + ' 段：' + JSON.stringify(list));
  for (const paragraph of list) if (typeof paragraph !== 'string' || !paragraph.length) fail(name + '存在空段落');
}

function extractFrom(raw) {
  if (!raw.includes('讨伐之战')) fail('文档内容与预期不符，可能不是交接文档');
  const lines = raw.split(/\r?\n/);

  const invitation = blockquoteParagraphs(sectionBody(lines, '4.1 邀请正文'));
  const refusal = blockquoteParagraphs(sectionBody(lines, '4.2 拒绝正文'));
  const accepted = blockquoteParagraphs(sectionBody(lines, '4.3 接受后的共同正文'));
  const noNpc = blockquoteParagraphs(sectionBody(lines, '6.1 无NPC'));
  const chengliang = blockquoteParagraphs(sectionBody(lines, '6.2 程良'));
  const xutaiping = blockquoteParagraphs(sectionBody(lines, '6.3 徐太平'));
  const sailiya = blockquoteParagraphs(sectionBody(lines, '6.4 赛利亚·风织'));

  assertLength('邀请正文', invitation, 3);
  assertLength('拒绝正文', refusal, 1);
  assertLength('接受后共同正文', accepted, 1);
  assertLength('无NPC正文', noNpc, 1);
  assertLength('程良到场正文', chengliang, 2);
  assertLength('徐太平到场正文', xutaiping, 2);
  assertLength('赛利亚到场正文', sailiya, 2);

  const optionMatch = raw.match(/正文下只给两个选项：\*\*(.+?)\*\*、\*\*(.+?)\*\*/);
  if (!optionMatch) fail('找不到“正文下只给两个选项”');
  const options = [optionMatch[1], optionMatch[2]];
  if (options[0] !== '接受' || options[1] !== '拒绝') fail('邀请正文下的两个选项不是「接受」「拒绝」：' + JSON.stringify(options));

  const advanceMatches = [...raw.matchAll(/\*\*(前进)\*\*/g)].map((m) => m[1]);
  if (!advanceMatches.length) fail('文档中找不到加粗的「前进」入口');

  const idMatch = raw.match(/事件ID建议：`([^`]+)`/);
  if (!idMatch) fail('文档中找不到事件ID建议');
  const eventId = idMatch[1];

  const titleMatch = raw.match(/显示标题固定为：\*\*(.+?)\*\*/);
  if (!titleMatch) fail('文档中找不到固定显示标题');
  if (titleMatch[1] !== invitation[0]) fail('固定显示标题与邀请正文首段不一致：' + titleMatch[1] + ' / ' + invitation[0]);

  const indented = [invitation[1], invitation[2], refusal[0], accepted[0], noNpc[0], ...chengliang, ...xutaiping, ...sailiya];
  for (const paragraph of indented) {
    if (!paragraph.startsWith('\u3000\u3000')) fail('段落未以两个全角空格起首：' + JSON.stringify(paragraph.slice(0, 8)));
  }

  return {
    source: {
      file: path.basename(DOC_PATH),
      sha256: crypto.createHash('sha256').update(raw, 'utf8').digest('hex'),
      docDate: '2026-10-17',
      note: '由 tools/extract-texts.cjs 机械提取，禁止手改；校验见 tools/check-text.cjs。'
    },
    textsVersion: 1,
    eventId,
    title: invitation[0],
    invitation: { paragraphs: invitation, options },
    refusal,
    accepted,
    noNpc,
    arrivals: { chengliang, xutaiping, sailiya_fengzhi: sailiya },
    advance: advanceMatches[0]
  };
}

function extract() {
  return extractFrom(readDoc());
}

module.exports = { DOC_PATH, readDoc, extractFrom, extract, blockquoteParagraphs, sectionBody, assertLength };
