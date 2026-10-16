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
  const witnessText={spark_clear:'最初只有一点微光，后来也照见了自己的名字。',spotless_clear:'掸去衣角的微尘，你从容接过了会徽。',intact_team:'会徽属于你，这场胜利也属于并肩的人。',persevering_clear:'失败留在前页，名字写在最后。',rating_crazy:'一路行来的脚印，终于抵达了新的境界。',rating_divine:'此后的行记，会记得今天的你。',all_styles_clear:'五条不同的道路，都留下了你的见证。',all_examiners_defeated:'每一次交锋，都成为了公会中的一段故事。'};
  const empty=()=>({format:'witness-achievements',version:1,unlocked:{},styles:[],examiners:{},participants:{},defeats:{}});
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
    constructor(storage=null){this.storage=storage;this.data=empty();this.queue=[];this.error=null;try{const raw=storage?.getItem(KEY);if(raw)this.merge(JSON.parse(raw),false);}catch(e){this.error=e;}}
    save(){try{if(this.storage)this.storage.setItem(KEY,JSON.stringify(this.data));this.error=this.storage?null:Error('本机存储不可用');}catch(e){this.error=e;}}
    merge(raw,persist=true){
      if(raw?.format!=='witness-achievements'||raw.version!==1||!Array.isArray(raw.styles)||!raw.examiners||!raw.unlocked)throw Error('不是有效的成就档案');
      const next=copy(this.data);
      for(const style of raw.styles)if(styles.includes(style)&&!next.styles.includes(style))next.styles.push(style);
      for(const [id,records]of Object.entries(raw.examiners)){if(!/^[a-z0-9_-]{1,80}$/i.test(id)||!Array.isArray(records))throw Error('考官记录无效');const ids=records.filter(x=>typeof x==='string'&&x.length<=160);next.examiners[id]=[...new Set([...(next.examiners[id]||[]),...ids])];}
      for(const id of Object.keys(definitions)){const item=raw.unlocked[id];if(!item)continue;if(typeof item.characterId!=='string'||typeof item.name!=='string'||!Number.isFinite(Date.parse(item.at)))throw Error('成就记录无效');if(!next.unlocked[id]||Date.parse(item.at)<Date.parse(next.unlocked[id].at))next.unlocked[id]={characterId:item.characterId,name:item.name.slice(0,40),at:item.at,...(typeof item.evidence==='string'?{evidence:item.evidence.slice(0,240)}:{})};}
      for(const [id,item]of Object.entries(raw.participants||{}))if(/^(character|legacy)-[a-z0-9-]+$/i.test(id)&&typeof item.name==='string'&&Number.isFinite(Date.parse(item.at)))next.participants[id]={name:item.name.slice(0,40),at:item.at};
      for(const [id,attempts]of Object.entries(raw.defeats||{})){
        if(!/^(character|legacy)-[a-z0-9-]+$/i.test(id)||!Array.isArray(attempts))throw Error('考核经历无效');
        const valid=attempts.filter(n=>Number.isInteger(n)&&n>=1&&n<=11);
        next.defeats[id]=[...new Set([...(next.defeats[id]||[]),...valid])];
      }
      this.data=next;if(persist)this.save();
    }
    unlock(id,s){
      if(this.data.unlocked[id])return;
      const player=s.battleSnapshot?.units?.find(u=>u.id==='player');
      const evidence=id==='spark_clear'?'开局潜力 · 1档':id==='spotless_clear'&&player?'结算生命 · '+player.hp+' / '+player.model.derived.HP+'（'+(player.hp/player.model.derived.HP*100).toFixed(1)+'%）':id==='intact_team'?'并肩成员 · '+s.battleSnapshot.units.filter(u=>u.team===0).map(u=>u.name||u.id).join('、'):id==='persevering_clear'?'经历失利 · '+(this.data.defeats[s.characterId]||[]).length+'次':'';
      this.data.unlocked[id]={characterId:s.characterId,name:s.character.name,at:new Date().toISOString(),...(evidence?{evidence}: {})};this.queue.push(id);
    }
    check(s,targets,currentRatingIndex=-1){
      if(!s?.character||s.source!=='formal')return;
      const defeats=(s.examDefeats||[]).filter(n=>Number.isInteger(n)&&n>=1&&n<=11);
      if(defeats.length)this.data.defeats[s.characterId]=[...new Set([...(this.data.defeats[s.characterId]||[]),...defeats])];
      const highest=Math.max(s.promotionState?.highestRatingIndex??-1,currentRatingIndex);
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
        const id=s.battleOptions?.enemyId;if(targets.includes(id)){const ids=this.data.examiners[id]||(this.data.examiners[id]=[]);if(!ids.includes(s.characterId))ids.push(s.characterId);}
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
    examinerProgress(templates){return templates.map(t=>{const ids=this.data.examiners[t.id]||[];return {id:t.id,name:t.name,style:t.style,weapon:t.weapon,defeated:ids.length>0,characters:ids.map(id=>this.data.participants[id]?.name||'旧旅程'),count:ids.length};});}
    entries(){return Object.entries(this.data.unlocked).map(([id,item])=>({id,title:definitions[id][0],description:definitions[id][1],witness:witnessText[id],...item}));}
  }
  const api={Archive,migrateIdentity,newId,definitions,KEY};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WitnessAchievements=api;
})(typeof globalThis==='undefined'?this:globalThis);
