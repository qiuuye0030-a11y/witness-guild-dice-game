'use strict';

const { test, section } = require('./lib/harness.cjs');

module.exports = function textChecks(ctx) {
  section('文本逐字');

  test('生成文本与交接文档逐字一致（含全角空格、引号、标点）', () => {
    const fromDoc = ctx.doc.extract();
    const TEXTS = ctx.TEXTS;
    ctx.assert.deepEqual(TEXTS.eventId, fromDoc.eventId);
    ctx.assert.deepEqual(TEXTS.title, fromDoc.title);
    ctx.assert.deepEqual(TEXTS.invitation, fromDoc.invitation);
    ctx.assert.deepEqual(TEXTS.refusal, fromDoc.refusal);
    ctx.assert.deepEqual(TEXTS.accepted, fromDoc.accepted);
    ctx.assert.deepEqual(TEXTS.noNpc, fromDoc.noNpc);
    ctx.assert.deepEqual(TEXTS.arrivals, fromDoc.arrivals);
    ctx.assert.deepEqual(TEXTS.advance, fromDoc.advance);
  });

  test('生成文件记录的文档 sha256 与当前交接文档一致', () => {
    const fromDoc = ctx.doc.extract();
    ctx.assert.equal(ctx.TEXTS.source.sha256, fromDoc.source.sha256, '交接文档已改动，请重跑 node tools/extract-texts.cjs');
  });

  test('邀请正文：标题+两段正文，正文下只有「接受」「拒绝」', () => {
    const view = ctx.texts.invitationView();
    ctx.assert.equal(view.title, '讨伐之战。');
    ctx.assert.equal(view.paragraphs.length, 2);
    ctx.assert.equal(view.allParagraphs.length, 3);
    ctx.assert.deepEqual(view.allParagraphs, ctx.TEXTS.invitation.paragraphs);
    ctx.assert.deepEqual(view.options, ['接受', '拒绝']);
    ctx.assert.equal(view.noOptionRewards, true);
  });

  test('拒绝正文、接受后共同正文、无NPC正文各 1 段', () => {
    ctx.assert.equal(ctx.texts.refusalView().paragraphs.length, 1);
    ctx.assert.equal(ctx.texts.acceptedView().paragraphs.length, 1);
    ctx.assert.equal(ctx.TEXTS.noNpc.length, 1);
  });

  test('三位NPC到场正文各两段，且两段都以「你立于聚落前沿，踱步等待」起笔也不得合并', () => {
    for (const id of ['chengliang', 'xutaiping', 'sailiya_fengzhi']) {
      const paragraphs = ctx.TEXTS.arrivals[id];
      ctx.assert.equal(paragraphs.length, 2, id + ' 到场正文段数');
      ctx.assert.ok(paragraphs[0].startsWith('\u3000\u3000你立于聚落前沿，踱步等待'), id + ' 第一段起笔');
    }
  });

  test('按已保存顺序拼接：0位→无NPC段；1位→2段；2位→4段且顺序不换', () => {
    const roster = ctx.roster;
    ctx.assert.deepEqual(roster.arrivalParagraphs([]), ctx.TEXTS.noNpc);
    const one = roster.arrivalParagraphs(['xutaiping']);
    ctx.assert.equal(one.length, 2);
    ctx.assert.deepEqual(one, ctx.TEXTS.arrivals.xutaiping);
    const two = roster.arrivalParagraphs(['sailiya_fengzhi', 'chengliang']);
    ctx.assert.equal(two.length, 4);
    ctx.assert.deepEqual(two.slice(0, 2), ctx.TEXTS.arrivals.sailiya_fengzhi);
    ctx.assert.deepEqual(two.slice(2), ctx.TEXTS.arrivals.chengliang);
  });

  test('同一角色用别名也不能凑成第二位友方NPC', () => {
    ctx.assert.throws(() => ctx.roster.arrivalParagraphs(['xutaiping', '徐太平']), /重复角色/);
  });

  test('前进入口文字来自文档加粗项', () => {
    ctx.assert.equal(ctx.texts.advanceLabel(), '前进');
  });

  test('邀请只能在安全节点展示，读档预览/面板刷新/战斗动画不得弹出', () => {
    ctx.assert.throws(() => ctx.texts.assertSafeNode('read-preview'), /安全节点/);
    ctx.assert.throws(() => ctx.texts.assertSafeNode('panel-refresh'), /安全节点/);
    ctx.assert.throws(() => ctx.texts.assertSafeNode('battle-animation'), /安全节点/);
    for (const node of ['growth-settled', 'hunt-settled', 'battle-settled']) ctx.assert.equal(ctx.texts.assertSafeNode(node), node);
  });

  test('文本数据只读', () => {
    ctx.assert.ok(Object.isFrozen(ctx.TEXTS));
    ctx.assert.ok(Object.isFrozen(ctx.TEXTS.invitation.paragraphs));
  });
};
