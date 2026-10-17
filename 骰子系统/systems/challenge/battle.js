// Isolated challenge registry and mechanics. Never added to WitnessTemplates.
const ChallengeBattle=(function(root){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
const id='guildmaster_xuejidong';
function initialize(b,challengeId){
  if(challengeId==='mysterious_scarred_woman')return root.WitnessScarredChallenge.initialize(b);
  if(challengeId!==id)throw Error('未知的独立挑战');
  const original=root.WitnessTemplates.find(t=>t.id==='xuejidong');
  const data=copy(original);
  Object.assign(data,{id,name:'公会会长——雪寂冬',skillLimit:9,statRatio:1.60,registeredLevel:97});
  data.skills.push(
    {name:'武魂真身',category:'强化',autoOnly:true,aiDisabled:true,description:'银岭遗御耗尽，或生命严格低于60%时自动进入真身；不改变生命上限。'},
    {name:'寒龙撕天爪',category:'攻击',channel:'物理',factor:1.20,penetration:.35,fleshFrost:true,castFixed:1.8,cd:14,hitKind:'slash',fx:'ice',description:'冰爪重击，穿透35%防御；直接伤及生命时附加冻伤。'},
    {name:'绝对零度吐息',category:'攻击',channel:'能量',factor:1.50,controlOnHit:2,controlAlways:true,castFixed:2.5,cd:20,fx:'ice',description:'压缩冰雪吐息，命中后按正常判定尝试冻结；并非必中或即死。'});
  const unit=root.WitnessBattle.templateUnit(data,95,'enemy',1),boss=b.unit('enemy');
  Object.assign(boss,unit,{hp:unit.model.derived.HP,mp:unit.model.derived.MP,sh:unit.model.derived.SH});
  boss.skills.push({id:id+'-headbone',name:'头部魂骨·冰棘王冠',sourceKind:'soulbone',ring:0,category:'强化',channel:'生命',selfOnly:true,modernEffect:'iceCrown',cost:Math.ceil(boss.model.derived.baseMP*.10),cast:1,cooldown:25,maxUses:2,fx:'ice',effect:'冰棘王冠唤来暴风雪，冰属性魂技威力提高10%，持续10秒；当前模型不单独计算范围。'});
  boss.guildmaster={version:1,legendaryRemaining:2,transformed:false,processed:[],blocked:[],armor:{B:1.15,D:1.20,A:1.10},dragon:{PA:1.30,SA:1.30,A:1.30},castSlow:.10};
  b.units=b.units.filter(u=>u.id!=='enemySupport');b.challengeId=id;
  b.addLog('独立会长挑战：95级封号斗罗·凶级，九魂技与头部魂骨；原设97级独立保留。',{type:'challengeStart'});
}
function restore(b){
  if(b.challengeId==='mysterious_scarred_woman')return root.WitnessScarredChallenge.validate(b);
  if(!b.challengeId)return;
  if(b.challengeId!==id)throw Error('未知挑战快照');
  const u=b.unit('enemy'),p=u?.guildmaster;
  if(!p||!Number.isInteger(p.legendaryRemaining)||p.legendaryRemaining<0||p.legendaryRemaining>2||!Array.isArray(p.processed)||!Array.isArray(p.blocked)||p.processed.length>2000||p.blocked.length>2000)throw Error('会长被动快照无效');
}
function effective(b,u,out){
  const p=u.guildmaster;if(!p)return out;
  const R=root.WitnessRules,before=R.derive(out),next={...out};
  for(const [k,f]of Object.entries(p.armor))next[k]*=f;
  const after=R.derive(next);
  for(const k of ['PA','SA','MA','DEF','MDEF'])next[k]=out[k]*after[k]/before[k];
  if(p.transformed)for(const [k,f]of Object.entries(p.dragon))next[k]*=f;
  next.HP=out.HP;next.MP=out.MP;next.SH=out.SH;return next;
}
function resourceChange(b,u){
  const p=u.guildmaster;if(!p||p.transformed||!b.alive(u))return;
  if(p.legendaryRemaining===0||u.hp/u.model.derived.HP<.60){p.transformed=true;b.addLog(u.name+'启动双重龙化·真身，攻击与敏捷进入额外30%乘区；生命不变。',{type:'transform',actor:u.id,hp:u.hp,maxHP:u.model.derived.HP});}
}
function blockControl(b,u,t,s,key){
  const p=t?.guildmaster;if(!p||!b.alive(t))return false;
  if(p.blocked.includes(key))return true;
  if(p.legendaryRemaining<=0)return false;
  p.blocked.push(key);p.legendaryRemaining--;
  b.addLog(t.name+'发动银岭遗御：'+s.name+'固定失败，不进行控制判定；剩余'+p.legendaryRemaining+'次。',{type:'resist',actor:u.id,target:t.id,legendary:true,remaining:p.legendaryRemaining});resourceChange(b,t);return true;
}
function completed(b,u,cast){
  const p=u.guildmaster;if(!p||!b.alive(u)||(!cast.skill&&!['attack','defend','defendSH','dodge','calm'].includes(cast.action)))return;
  const key=cast.eventId;if(!key||p.processed.includes(key))return;p.processed.push(key);
  for(const t of b.units.filter(v=>v.team!==u.team&&b.alive(v))){
    const source=u.id+':frostThorns',old=b.status(t,'statDownA').find(s=>s.source===source),stacks=(old?.stacks||0)+1;
    b.setStatus(t,'statDownA',stacks*.10,180.001,{source,label:'霜棘',from:u.name,stacks,unavoidable:true});
    b.setStatus(t,'frostCastSlow',p.castSlow,180.001,{source:u.id+':frostCast',label:'冰结',from:u.name,unavoidable:true});
    const max=t.release==='召唤'?t.bodyMax:t.model.derived.HP,nominal=Math.max(1,Math.round(max*.05)),before=t.release==='召唤'?t.bodyHP:t.hp;
    if(t.release==='召唤'){t.bodyHP=Math.max(0,t.bodyHP-nominal);t.hp=t.bodyHP+t.petHP;}else t.hp=Math.max(0,t.hp-nominal);
    b.addLog('霜棘'+stacks+'层：'+t.name+'敏捷累计降低'+stacks*10+'%；冰结越盾扣除生命'+(before-(t.release==='召唤'?t.bodyHP:t.hp))+'，上限不变。',{type:'frostPassive',actor:u.id,target:t.id,actionId:key,stacks,amount:nominal,bypassShield:true});
  }
}
return {id,initialize,restore,effective,resourceChange,blockControl,completed};
})(globalThis);
