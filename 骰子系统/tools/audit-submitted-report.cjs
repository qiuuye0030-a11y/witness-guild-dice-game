'use strict';
const fs=require('node:fs'),path=require('node:path'),x=require('./runtime-1008.cjs').load();
const file=process.argv[2]||path.join(__dirname,'fixtures/v1201/reported-frog.json'),r=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')).report,s=r.snapshot;
const frog=s.units.find(u=>u.beastId),cheng=s.units.find(u=>u.npcId==='chengliang'),sai=s.units.find(u=>u.npcId==='sailiya_fengzhi');
const mana=s.log.filter(l=>l.type==='mpRestore'&&l.target===sai.id),rune=s.log.filter(l=>l.type==='trait'&&l.actor===sai.id&&l.text.includes('符剑'));
const replay=new x.WitnessBattle.Battle(r.initial);for(let t=60000;t<=600000&&!replay.result;t+=60000)replay.tick(t,true);
const result={original:{seconds:s.now/1000,result:s.result,units:s.units.map(u=>({id:u.id,name:u.name,hp:u.hp,mp:u.mp,sh:u.sh,actions:u.actions})),mossStacks:frog.v12State.mossStacks,chengGrid:cheng.v12NPC.grid,thiefQi:cheng.v12NPC.regen.thiefQi,saiManaRestores:mana.length,saiManaRestored:mana.reduce((a,l)=>a+l.amount,0),runeActivations:rune.length,illegalAgilityDown:frog.statuses.filter(st=>st.type==='statDownA')},revisedReplay:{seconds:replay.now/1000,result:replay.result,chengManaRestores:replay.log.filter(l=>l.type==='mpRestore'&&l.target===cheng.id).length},note:'同一初始编队与种子在修订规则下的单场重放；不是胜率统计。'};
const out=path.join(__dirname,'../output/v12');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'来件战报核对.json'),JSON.stringify(result,null,2));
const md=`# v12.01 来件战报核对

原战报在180秒被旧规则判为失败。此时霜苔巨蛙仍有${frog.hp}生命、${frog.sh}精神，三名友方均在场，属于时限失败，不能据此判定队伍已败。

| 对象 | 可见的实际证据 | 结论 |
|---|---|---|
| 霜苔巨蛙 | 苔凝${frog.v12State.mossStacks}层 | 已生效：肉体＋60%、防御＋120%、额外固定减伤15%；原效果栏漏显 |
| 程良 | 据阵${cheng.v12NPC.grid.self}层、盗气${cheng.v12NPC.regen.thiefQi}层 | 伤害＋40%、肉体＋10%已进入运行时；原效果栏漏显 |
| 赛利亚 | 符剑附费${rune.length}次、回魂${mana.length}次，共${result.original.saiManaRestored}魂力 | 附剑付费、秘元周期恢复已有实际记录；凝元待结算为0并不等于周期回魂未生效 |

另有实际错误：巨蛙中了敏捷削弱${Math.round((result.original.illegalAgilityDown[0]?.value||0)*10000)/100}%，且旧阵法困阵也绕过“免疫全部减速、冻结、迟缓”。修订覆盖普通属性减益接口、阵法与场地减速，免疫成立时不再展示为有效减益。冰伤回吸在此战报里没有足够独立触发证据，另用定向回归检验，不凭被动名字宣称此场触发过。

新效果栏读取运行时层数、状态、护盾及来源，不通过显示代码重复添加倍率。详情同步显示幅度与剩余时间；读档与反复刷新不会多叠一层。新增程良每正常个人回合结束回魂5%，与原回血5%分别结算，附赠普攻不重复回魂。

同初始数据的新规则重放：${replay.result?replay.result.reason:'10分钟仍在战斗'}，时间${replay.now/1000}秒；程良回魂${result.revisedReplay.chengManaRestores}次。这是单场示例，不是胜率或整体平衡结论。原始战报及旧版本保持原样。
`;
fs.writeFileSync(path.join(__dirname,'../../v12.01_战报检视.md'),md);console.log(JSON.stringify(result.revisedReplay));
