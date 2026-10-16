// Context text uses the same V13 event rules.
(function(root){
  function sceneFamily(event){
    const text=event.title+event.text;
    if(/魂骨|共鸣|残匣/.test(text))return 'bone';
    if(event.options.some(o=>o.keys.includes('H'))||/家门|名册|名帖|学院|介绍|邀请|信|同伴|老师|课堂/.test(text))return 'social';
    if(/路|林|雾|迁徙|猎魂|队伍|航线|渡口/.test(text))return 'travel';
    if(/药|图|册|鉴定|纹路|记录/.test(text))return 'research';
    return 'practice';
  }
  function biasScene(event,bias){
    const family=sceneFamily(event);
    const dangers={bone:'这份线索引起了不怀好意的注意。来源与护持都需要更认真地核实，贸然推进可能让你陷入险境。',social:'场面忽然紧绷。有人带着尖锐的质疑，试图让你承担并不清楚的责任；你需要稳住局面，也保护自己的边界。',travel:'原本可辨认的路线突然出现险情，退路和同伴的位置都需要再次确认。',research:'材料显出异常反应。继续之前，你需要确认它的来源和自己的承载边界。',practice:'力量的回应比平时剧烈，周围的防护也出现缺口。眼下需要先守住边界，再寻找可控的突破。'};
    const obstruction={bone:'记录中少了一处关键信息，赠礼者也希望先弄清适配。',social:'彼此的理解出现偏差，你需要让话语和实际安排对应起来。',travel:'天气和地形让原安排不再可靠，准备需要重新检查。',research:'几处细节与旧记录不符，你要先分清哪一处可以相信。',practice:'平日熟悉的节奏被打乱，动作需要重新调整。'};
    const opportunity={bone:'来源凭证与适配记录恰好齐全，一位熟悉引导的师长愿意留下协助。',social:'有人认真听过你的经历，愿意替你作一次可靠引荐。',travel:'一位熟悉此地的向导愿意带路，还留下经过核对的地图。',research:'关键记录恰好出现，你有机会把一直缺少的那一段补全。',practice:'一位老师看过你的练习，愿意把自己的独门诀窍讲得更清楚。'};
    if(bias===1)return dangers[family];
    if(bias<=4)return obstruction[family]+'处理得好，也可能把难处变成额外收获。';
    if(bias<=8)return obstruction[family];
    if(bias<=12)return '';
    if(bias<=16)return '这一次，有人愿意多留一点时间，帮你把事情做完整。';
    if(bias<=19)return opportunity[family];
    return opportunity[family]+'原本的小事连接到了一份珍贵的培养资源与重要引荐。这份机会会被正式记在你的经历里。';
  }

const Draft=typeof module!=='undefined'&&module.exports?require('./story-data.js'):root.WitnessEventDraft;
const original=typeof module!=='undefined'&&module.exports?require('./systems/events/legacy-data.js'):root.WitnessLegacyEvents;
const api={EVENTS:Draft.events,ORIGINAL_EVENTS:original,CHAINS:Draft.chains,biasScene,sceneFamily};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WitnessEvents=api;
})(typeof globalThis==='undefined'?this:globalThis);
