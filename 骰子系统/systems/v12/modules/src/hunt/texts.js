'use strict';

/**
 * 定稿叙事文本查询。文本本体由 tools/extract-texts.cjs 从交接文档机械提取，
 * 本文件只负责按流程顺序取用，不改写、不合并、不省略。
 */

const TEXTS = require('../text/hunt-texts.generated');

const SAFE_NODES = Object.freeze(['growth-settled', 'hunt-settled', 'battle-settled']);
const UNSAFE_NODES = Object.freeze(['read-preview', 'panel-refresh', 'battle-animation', 'loading', 'battle']);
const ALL_SAFE = Object.freeze([...SAFE_NODES, ...UNSAFE_NODES]);

function assertSafeNode(node) {
  if (!ALL_SAFE.includes(node)) throw new Error('未知的剧情节点：' + node + '；不能把邀请塞进读档预览、面板刷新或战斗动画');
  if (!SAFE_NODES.includes(node)) throw new Error('当前节点不是安全节点：' + node + '；讨伐邀请只能在不可分割的结算完成之后展示');
  return node;
}

/** 邀请正文：标题单独给出（渲染为标题行），正文两段；正文下只给「接受」「拒绝」两个选项。 */
function invitationView() {
  return {
    eventId: TEXTS.eventId,
    title: TEXTS.title,
    paragraphs: TEXTS.invitation.paragraphs.slice(1),
    allParagraphs: TEXTS.invitation.paragraphs.slice(),
    options: TEXTS.invitation.options.slice(),
    noOptionRewards: true
  };
}

function refusalView() {
  return { paragraphs: TEXTS.refusal.slice(), options: [] };
}

function acceptedView() {
  return { paragraphs: TEXTS.accepted.slice() };
}

/** 到场正文。必须传入已保存的顺序；0位/1位/2位由名录决定。 */
function arrivalView(roster, npcIds) {
  if (!Array.isArray(npcIds) || npcIds.length > 3) throw new Error('到场阵容须为0—3位友方NPC');
  return {
    npcIds: npcIds.slice(),
    paragraphs: roster.arrivalParagraphs(npcIds),
    advanceOption: TEXTS.advance
  };
}

function advanceLabel() {
  return TEXTS.advance;
}

module.exports = { TEXTS, SAFE_NODES, UNSAFE_NODES, assertSafeNode, invitationView, refusalView, acceptedView, arrivalView, advanceLabel };
