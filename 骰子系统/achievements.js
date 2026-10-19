(function(root){
  'use strict';
  const KEY='witness-achievements-v1',styles=['强攻','敏攻','控制','防御','辅助'];
  const definitions={rating_crazy:['狂境初临','正式旅程中达到狂级或更高评级。'],rating_divine:['神境留名','正式旅程中达到神级。'],all_styles_clear:['五系皆通','使用五种魂师系别取得会徽。'],all_examiners_defeated:['公会遍试','至少两位不同角色累计击败全部可选考官。']};
  Object.assign(definitions,{
    spark_clear:['微芒成炬','以初始武魂潜力为1的角色赢得转正考核，取得会徽。'],
    spotless_clear:['衣角微脏','转正考核获胜时，剩余生命达到最大生命的95%。'],
    intact_team:['并肩无缺','辅助角色赢得双人转正考核，己方两人全程未退场。'],
    persevering_clear:['百折成章','同一角色实际经历至少两次转正考核失利，最终取得会徽。']
  });
  definitions.guildmaster_clear=['银岭之巅','在结局后的会长挑战中，战胜95级凶级的公会会长——雪寂冬。'];
  Object.assign(definitions,{
    hunt_hundred_thousand:['讨伐十万年魂兽','在正式旅程中接受讨伐委托并获胜、结算战利品；赞助版事件测试不计。'],
    scarred_clear:['复归幽界','在正式旅程结局后的挑战中，击败神秘伤疤女。'],
    first_bone_trait:['骨蕴初醒','在正式旅程中，首次吸收具有特性的万年魂骨。'],
    six_bones:['六骸齐鸣','在正式旅程中，同时吸收头部、躯干、左右臂与左右腿六个部位的魂骨。']
  });
  const PLATINUM='platinum_all',prerequisites=Object.freeze(Object.keys(definitions));
  definitions[PLATINUM]=['万象皆证','解锁其余全部13项成就。'];
  const rewardNote='可以找作者实现一个愿望。';
  const advanced=new Set([PLATINUM,'guildmaster_clear','hunt_hundred_thousand','scarred_clear']);
  const witnessText={guildmaster_clear:'冰雪敛去，会长向你颔首。此刻，银岭也见证了你的名字。',spark_clear:'最初只有一点微光，后来也照见了自己的名字。',spotless_clear:'掸去衣角的微尘，你从容接过了会徽。',intact_team:'会徽属于你，这场胜利也属于并肩的人。',persevering_clear:'失败留在前页，名字写在最后。',rating_crazy:'一路行来的脚印，终于抵达了新的境界。',rating_divine:'此后的行记，会记得今天的你。',all_styles_clear:'五条不同的道路，都留下了你的见证。',all_examiners_defeated:'每一次交锋，都成为了公会中的一段故事。'};
  Object.assign(witnessText,{
    hunt_hundred_thousand:'林海重归寂静，赤色魂环缓缓升起。你握紧掌中的战利品，将这一战写入行记。',
    scarred_clear:'轻纱下的嘴角泛起涟漪，长剑在魂力激荡下消散，她比起一个大拇指，身形如烟尘般飘散，其意不言而明——恭喜你。',
    first_bone_trait:'骨中余韵融入血脉，未曾有过的力量，悄然回应了你的呼吸。',
    six_bones:'六处魂光沿着经络相连，百战所获，终于在此刻归于一身。',
    platinum_all:'行记翻至末页，所有见证在此相逢。公会为你镌下白金之名。'
  });
  const empty=()=>({format:'witness-achievements',version:1,unlocked:{},notified:{},styles:[],examiners:{},participants:{},defeats:{},challengeWins:{}});
  const copy=x=>JSON.parse(JSON.stringify(x));
  function migrateIdentity(s){
    if(!s.characterId){
      // 旧档的起点与开局骰序不随改名、原局重试或成长改变。
      const c=s.character,d=s.draft,origin=JSON.stringify([s.seed,c?.initialLevel??d?.options.level,c?.time??null,(s.rolls||[]).filter(r=>r.quarter===undefined||r.quarter===0).slice(0,20).map(r=>[r.label,r.sides,r.face])]);
      let a=2166136261,b=5381;for(const ch of origin){a=Math.imul(a^ch.charCodeAt(0),16777619);b=Math.imul(b,33)^ch.charCodeAt(0);}s.characterId='legacy-'+(a>>>0).toString(16)+'-'+(b>>>0).toString(16);
    }
    if(!s.source){
      const trialSeeds=['低潜力平民','高门共鸣','雨中热汤','炉火练习','识海练习','晨光天资','轻声介绍','新友来访'];
      const test=s.trialFirstEvent||trialSeeds.includes(s.seed)||s.draft?.options.level!=null||s.journal?.some(j=>/直接试玩|测试开局/.test(j.title));
      // 非分步开局的旧记录缺少正式来源证据，保守地排除。
      s.source=test||!s.draft?'test':'formal';
    }
  }
  function newId(){return 'character-'+(root.crypto?.randomUUID?root.crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));}
  class Archive{
    constructor(storage=null){this.storage=storage;this.data=empty();this.queue=[];this.error=null;try{const raw=storage?.getItem(KEY);if(raw)this.merge(JSON.parse(raw),false);}catch(e){this.error=e;}this.queue=this.pending();}
    save(){try{if(this.storage)this.storage.setItem(KEY,JSON.stringify(this.data));this.error=this.storage?null:Error('本机存储不可用');}catch(e){this.error=e;}}
    // 待弹出的见证：已解锁但尚未被确认阅读。会长见证优先，其余按解锁时间先后。
    pending(){
      const rank=id=>(id===PLATINUM?-1:advanced.has(id)?0:1),time=id=>Date.parse(this.data.unlocked[id]?.at||0)||0;
      return Object.keys(this.data.unlocked).filter(id=>!this.data.notified[id])
        .sort((a,b)=>rank(a)-rank(b)||time(a)-time(b)||a.localeCompare(b));
    }
    markNotified(id){if(!this.data.unlocked[id])return;this.data.notified[id]=new Date().toISOString();this.queue=this.pending();this.save();}
    merge(raw,persist=true){
      if(raw?.format!=='witness-achievements'||raw.version!==1||!Array.isArray(raw.styles)||!raw.examiners||!raw.unlocked)throw Error('不是有效的成就档案');
      const localUnlocked=new Set(Object.keys(this.data.unlocked));const next=copy(this.data);
      for(const style of raw.styles)if(styles.includes(style)&&!next.styles.includes(style))next.styles.push(style);
      for(const [id,records]of Object.entries(raw.examiners)){if(!/^[a-z0-9_-]{1,80}$/i.test(id)||!Array.isArray(records))throw Error('考官记录无效');const ids=records.filter(x=>typeof x==='string'&&x.length<=160);next.examiners[id]=[...new Set([...(next.examiners[id]||[]),...ids])];}
      for(const id of Object.keys(definitions)){const item=raw.unlocked[id];if(!item)continue;if(typeof item.characterId!=='string'||typeof item.name!=='string'||!Number.isFinite(Date.parse(item.at)))throw Error('成就记录无效');if(!next.unlocked[id]||Date.parse(item.at)<Date.parse(next.unlocked[id].at))next.unlocked[id]={characterId:item.characterId,name:item.name.slice(0,40),at:item.at,...(typeof item.evidence==='string'?{evidence:item.evidence.slice(0,240)}:{})};}
      if(persist){
        // 导入他人/旧设备的成就档案属于历史记录，不再逐条重放弹窗。
        if(!next.notified)next.notified={};
        for(const id of Object.keys(next.unlocked))if(!localUnlocked.has(id)&&!next.notified[id])next.notified[id]=next.unlocked[id].at;
      }else if(raw.notified===undefined){
        // v12.03.01 之前的本机档案没有已读标记：除会长见证外不补放历史弹窗，避免一次性弹出全部旧成就。
        if(!next.notified)next.notified={};
        for(const id of Object.keys(next.unlocked))if(id!=='guildmaster_clear'&&!next.notified[id])next.notified[id]=next.unlocked[id].at;
      }else for(const [id,at]of Object.entries(raw.notified||{}))if(next.unlocked[id]&&Number.isFinite(Date.parse(at))&&(!next.notified[id]||Date.parse(at)>Date.parse(next.notified[id])))next.notified[id]=at;
      for(const [id,item]of Object.entries(raw.participants||{}))if(/^(character|legacy)-[a-z0-9-]+$/i.test(id)&&typeof item.name==='string'&&Number.isFinite(Date.parse(item.at)))next.participants[id]={name:item.name.slice(0,40),at:item.at};
      for(const [key,ids]of Object.entries(raw.challengeWins||{})){
        if(!/^(admission|member|advanced|guildmaster|mysterious):[a-z0-9_-]+$/.test(key)||!Array.isArray(ids))throw Error('挑战完成记录无效');
        next.challengeWins[key]=[...new Set([...(next.challengeWins[key]||[]),...ids.filter(id=>typeof id==='string'&&id.length<=160)])];
      }
      for(const [id,attempts]of Object.entries(raw.defeats||{})){
        if(!/^(character|legacy)-[a-z0-9-]+$/i.test(id)||!Array.isArray(attempts))throw Error('考核经历无效');
        const valid=attempts.filter(n=>Number.isInteger(n)&&n>=1&&n<=11);
        next.defeats[id]=[...new Set([...(next.defeats[id]||[]),...valid])];
      }
      if(!prerequisites.every(id=>next.unlocked[id])){delete next.unlocked[PLATINUM];delete next.notified[PLATINUM];}
      this.data=next;const added=this.completeCollection();this.queue=this.pending();if(persist||added)this.save();
    }
    completeCollection(s){
      if(this.data.unlocked[PLATINUM]||!prerequisites.every(id=>this.data.unlocked[id]))return false;
      const latest=prerequisites.map(id=>this.data.unlocked[id]).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
      this.unlock(PLATINUM,s?.character?s:{characterId:latest.characterId,character:{name:latest.name}});return true;
    }
    unlock(id,s){
      if(this.data.unlocked[id]||id===PLATINUM&&!prerequisites.every(key=>this.data.unlocked[key]))return;
      const player=s.battleSnapshot?.units?.find(u=>u.id==='player');
      const evidence=id===PLATINUM?'全部成就 · 13 / 13':id==='hunt_hundred_thousand'?'正式讨伐 · '+(s.v12.hunt.target.snapshot.name||s.v12.hunt.target.id):id==='scarred_clear'?'神秘伤疤女 · 挑战胜利':id==='first_bone_trait'?'已吸收万年魂骨 · 特性生效':id==='six_bones'?'头部／躯干／左臂／右臂／左腿／右腿':id==='guildmaster_clear'?'会长挑战 · 95级凶级 · 雪寂冬':id==='spark_clear'?'开局潜力 · 1档':id==='spotless_clear'&&player?'结算生命 · '+player.hp+' / '+player.model.derived.HP+'（'+(player.hp/player.model.derived.HP*100).toFixed(1)+'%）':id==='intact_team'?'并肩成员 · '+s.battleSnapshot.units.filter(u=>u.team===0).map(u=>u.name||u.id).join('、'):id==='persevering_clear'?'经历失利 · '+(this.data.defeats[s.characterId]||[]).length+'次':'';
      this.data.unlocked[id]={characterId:s.characterId,name:s.character.name,at:new Date().toISOString(),...(evidence?{evidence}: {})};if(id!==PLATINUM)this.completeCollection(s);this.queue=this.pending();
    }
    captureChallenges(s,targets){
      if(!s?.character||!s.characterId)return;
      const add=(mode,id)=>{if(!['admission','member','advanced','guildmaster','mysterious'].includes(mode)||!id||!['guildmaster','mysterious'].includes(mode)&&!targets.includes(id))return;const key=mode+':'+id;this.data.challengeWins[key]=[...new Set([...(this.data.challengeWins[key]||[]),s.characterId])];};
      const primary=s.battleSnapshot?.units?.find(u=>u.id==='enemy'),examiner=primary?.templateId||s.battleOptions?.enemyId||s.exam?.opponent;
      if(s.phase==='ending'&&s.result?.winner===0&&s.journal?.some(j=>j.type==='ending'))add('admission',examiner);
      for(const key of s.challenge?.completed||[]){const [mode,id]=key.split(':');add(mode,id);}
      for(const report of [...(s.challenge?.reports||[]),...(s.challenge?.last?[s.challenge.last]:[])])if(report.result?.winner===0)add(report.mode,['guildmaster','mysterious'].includes(report.mode)?'xuejidong':report.snapshot?.units?.find(u=>u.id==='enemy')?.templateId||report.enemy);
    }
    check(s,targets,currentRatingIndex=-1){
      this.captureChallenges(s,targets);
      if(!s?.character||s.source!=='formal'){if(s?.character)this.save();return;}
      // 会长见证：优先读挑战完成列表；旧存档若只留下战报或最近一场记录，同样视为已战胜。
      const challenge=s.challenge,reports=Array.isArray(challenge?.reports)?challenge.reports:[];
      const guildmasterWon=!!challenge&&(challenge.completed?.includes('guildmaster:xuejidong')||reports.some(r=>r?.mode==='guildmaster'&&r?.result?.winner===0)||(challenge.last?.mode==='guildmaster'&&challenge.last?.result?.winner===0));
      if(s.phase==='ending'&&s.result?.winner===0&&guildmasterWon)this.unlock('guildmaster_clear',s);
      const scarredWon=!!challenge&&(challenge.completed?.includes('mysterious:xuejidong')||reports.some(r=>r?.mode==='mysterious'&&r?.result?.winner===0)||(challenge.last?.mode==='mysterious'&&challenge.last?.result?.winner===0));
      if(s.phase==='ending'&&s.result?.winner===0&&scarredWon)this.unlock('scarred_clear',s);
      const hunt=s.v12;if(hunt&&!hunt.test&&hunt.hunt?.status==='won'&&hunt.result?.winner===0&&hunt.reward?.bone?.source?.type==='hunt')this.unlock('hunt_hundred_thousand',s);
      const ledger=s.character.v12Equipment||hunt?.equipment,absorbed=ledger?.absorbedBones||{},runtime=Object.values(ledger?.runtimeTraits||{}),equipped=(s.character.bones||[]).filter(b=>b.absorbed||absorbed[b.boneId||b.id]);
      if(runtime.some(t=>absorbed[t.ownerBoneId]?.years>=10000&&absorbed[t.ownerBoneId]?.years<100000)||equipped.some(b=>{const years=b.base?.years??b.years;return years>=10000&&years<100000&&(b.traits||[]).some(t=>t.pending!==true&&(t.traitId||t.id)&&t.effect);} ))this.unlock('first_bone_trait',s);
      const required=['头部','躯干','左臂','右臂','左腿','右腿'],slots=new Set(equipped.map(b=>b.base?.slot||b.slot));
      if(required.every(slot=>slots.has(slot)))this.unlock('six_bones',s);
      const defeats=(s.examDefeats||[]).filter(n=>Number.isInteger(n)&&n>=1&&n<=11);
      if(defeats.length)this.data.defeats[s.characterId]=[...new Set([...(this.data.defeats[s.characterId]||[]),...defeats])];
      const revision=root.WitnessRules?.ratingRulesVersion||2;
      const highest=Math.max(s.promotionState?.ratingRulesVersion===revision?s.promotionState.highestRatingIndex:-1,currentRatingIndex);
      if(highest>=4)this.unlock('rating_crazy',s);if(highest>=5)this.unlock('rating_divine',s);
      if(s.phase==='ending'&&s.result?.winner===0&&s.journal.some(j=>j.type==='ending')){
        const initial=s.character.initialPotential??s.draft?.results?.tier;
        if(initial===1)this.unlock('spark_clear',s);
        const units=s.battleSnapshot?.units||[],player=units.find(u=>u.id==='player'),allies=units.filter(u=>u.team===0);
        if(player&&!player.fallen&&player.hp>0&&player.sh>0&&player.model?.derived?.HP>0&&player.hp>=player.model.derived.HP*.95)this.unlock('spotless_clear',s);
        if(s.character.style==='辅助'&&units.length===4&&allies.length===2&&allies.every(u=>!u.fallen&&u.hp>0&&u.sh>0))this.unlock('intact_team',s);
        if((this.data.defeats[s.characterId]||[]).length>=2)this.unlock('persevering_clear',s);
        this.data.participants[s.characterId] ||= {name:s.character.name,at:new Date().toISOString()};
        const style=s.character.style;if(styles.includes(style)&&!this.data.styles.includes(style))this.data.styles.push(style);
        const id=s.battleSnapshot?.units?.find(u=>u.id==='enemy')?.templateId||s.battleOptions?.enemyId||s.exam?.opponent;if(targets.includes(id)){const ids=this.data.examiners[id]||(this.data.examiners[id]=[]);if(!ids.includes(s.characterId))ids.push(s.characterId);}
      }
      if(styles.every(x=>this.data.styles.includes(x)))this.unlock('all_styles_clear',s);
      if(targets.length&&targets.every(id=>this.data.examiners[id]?.length)&&new Set(targets.flatMap(id=>this.data.examiners[id]||[])).size>=2)this.unlock('all_examiners_defeated',s);
      this.save();
    }
    reconcile(targets){
      const ids=Object.values(this.data.examiners).flat(),id=ids.findLast(x=>this.data.participants[x]);
      if(!id)return;const person=this.data.participants[id],s={characterId:id,character:{name:person.name}};
      if(styles.every(x=>this.data.styles.includes(x)))this.unlock('all_styles_clear',s);
      if(targets.length&&targets.every(x=>this.data.examiners[x]?.length)&&new Set(targets.flatMap(x=>this.data.examiners[x]||[])).size>=2)this.unlock('all_examiners_defeated',s);
      this.save();
    }
    challengeProgress(templates){
      const modes=[['admission','转正考核'],['member','会员切磋'],['advanced','进阶试炼']];const rows=[];
      for(const [mode,label]of modes)for(const t of templates){const ids=[...new Set([...(this.data.challengeWins[mode+':'+t.id]||[]),...(mode==='admission'?this.data.examiners[t.id]||[]:[])])];rows.push({id:t.id,mode,label,name:t.name,style:t.style,completed:ids.length>0,count:ids.length});}
      for(const [mode,name]of [['guildmaster','会长雪寂冬'],['mysterious','神秘伤疤女']]){const ids=this.data.challengeWins[mode+':xuejidong']||[];rows.push({id:'xuejidong',mode,label:'高难挑战',name,style:'高难',completed:ids.length>0,count:ids.length});}
      return rows.sort((a,b)=>Number(a.completed)-Number(b.completed));
    }
    examinerProgress(templates){return templates.map(t=>{const ids=this.data.examiners[t.id]||[];return {id:t.id,name:t.name,style:t.style,weapon:t.weapon,defeated:ids.length>0,characters:ids.map(id=>this.data.participants[id]?.name||'旧旅程'),count:ids.length};});}
    entries(){return Object.entries(this.data.unlocked).map(([id,item])=>({id,title:definitions[id][0],description:definitions[id][1],advanced:advanced.has(id),platinum:id===PLATINUM,rewardNote:id===PLATINUM?rewardNote:undefined,witness:witnessText[id],...item}));}
  }
  const api={Archive,migrateIdentity,newId,definitions,KEY};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WitnessAchievements=api;
})(typeof globalThis==='undefined'?this:globalThis);
