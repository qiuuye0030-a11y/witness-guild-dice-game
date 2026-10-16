(function(){
 const scenes = {
 start:{p:0,t:'卯初 · 05:06',place:'朝门渡口',who:'旁白',
  txt:'雾还没有散。渡船靠岸时，你只能看见对面城门楼的一道轮廓，和它背后刚刚亮起的一线金光。怀里那张请柬上写着：<span class="clue">日出之时，朝门自开</span>。',
  ch:[['沿着朝门大街走向钟鼓楼','street'],['向渡口的船夫打听','boat'],['揭开请柬背面的金漆封印','seal','risk','不可撤回'],['出示城防司腰牌',null,'lock','需要：腰牌']]},
 boat:{p:1,t:'卯初 · 05:24',place:'朝门渡口',who:'船夫 老岑',
  txt:'“晨曦城的规矩，外乡人要赶在<span class="clue">钟鼓楼第三声钟</span>之前进城。”老岑把篙往水里一点，水面上碎了一片金光，“过了时辰，城门要到明早才开。”',
  ch:[['道谢，立刻进城','street'],['追问城门为何只在日出时开','street','risk','他可能起疑']]},
 seal:{p:1,t:'卯初 · 05:20',place:'朝门渡口',who:'旁白',
  txt:'金漆剥落，露出一枚徽记：一轮被城墙托起的太阳。就在这时，城门楼后的光亮了一分，雾里隐约传来第一声钟响。',
  ch:[['收好徽记，走向朝门大街','street']]},
 street:{p:2,t:'卯正 · 06:02',place:'朝门大街',who:'旁白',
  txt:'太阳越过了门楼的重檐。整条大街的青瓦被镀上一层金边，雾退到了街角和屋檐下。钟鼓楼前站着一位穿青袍的人，手里托着一盏还没熄的灯。',
  ch:[['走上前去','end'],['在牌坊下先观察片刻','end','risk','可能错过时辰']]},
 end:{p:3,t:'卯正 · 06:30',place:'钟鼓楼',who:'青袍人',
  txt:'“你来得正是时候。”第三声钟响起，最后一缕雾从水面上散开，全城都亮了。“从今日起，你便是晨曦城的<span class="clue">司晨</span>。”（演示结束）',
  ch:[['从头开始','start']]}
};
 const root = document.querySelector('[data-cx-root]');
 const ui = ChenxiUI.create(root, {
  onChoice(detail) {go(detail.id);},
  onMenu(detail) {if(detail.action==='restart') go('start');else alert('这里是界面演示。'+({journal:'行记',inventory:'行囊',settings:'设置'}[detail.action])+'需要接入游戏原有功能。');},
  onClue(detail) {alert('线索：'+detail.text+'\n可在正式游戏中接入行记。');}
 });
 function go(id) {
  const scene=scenes[id];
  ui.render({phase:scene.p,time:scene.t,place:scene.place,speaker:scene.who,
   narrativeHTML:scene.txt.replaceAll('class="clue"','class="cx-clue"'),
   choices:scene.ch.map(([label,id,kind,tag])=>({id,label,risk:kind==='risk',disabled:kind==='lock',tag}))});
 }
 go('start');
})();