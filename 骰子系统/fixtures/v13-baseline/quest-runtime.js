(function(root){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  function install(Campaign,R,Data){
    const P=Campaign.prototype,chains=Data.CHAINS,events=Data.EVENTS,byId=new Map(events.map((e,i)=>[e.id,{event:e,index:i}])),chainMap=new Map(chains.map(c=>[c.id,c]));
    P.ensureStoryState=function(){const s=this.state;if(s.storyRulesVersion!==1001){if(s.pending&&!s.pending.legacyEvent){s.pending.eventSnapshot=copy(Data.ORIGINAL_EVENTS[s.pending.eventIndex]||events[s.pending.eventIndex]);s.pending.oldNarrative=true;s.pending.noQuestStart=true;}s.storyRulesVersion=1001;}s.quests ||= {version:1,active:null,records:{}};};
    P.questSeen=function(id){return this.state.eventHistory?.[id]!==undefined||this.state.journal.some(j=>j.eventId===id||['quarter','episode'].includes(j.type)&&j.title===byId.get(id)?.event.title);};
    P.questRequire=function(w={}){const c=this.state.character;return (!w.flag||!!c.eventFlags[w.flag])&&(!w.bone||c.boneInventory.length>0)&&(!w.mutated||c.mutations.length>0);};
    P.questFuture=function(chain,id){const seen=new Set();const visit=id=>{if(!id||seen.has(id))return;seen.add(id);const n=chain.nodes.find(n=>n.eventId===id);if(n?.next)visit(n.next);for(const route of n?.routes||[])if(route.next)visit(route.next);};visit(id);return [...seen];};
    P.questReserved=function(){const q=this.state.quests,record=q?.records[q.active];if(!record)return new Set();return new Set(this.questFuture(chainMap.get(q.active),record.nextEventId));};
    P.interruptQuest=function(reason){const s=this.state,q=s.quests,r=q?.records[q.active];if(!r)return;r.status='interrupted';r.reason=reason;r.nextEventId=null;q.active=null;s.journal.push({type:'quest',date:copy(s.date),title:chainMap.get(r.id).title+' · 暂告一段落',text:reason});};
    P.nextQuestEvent=function(){
      this.ensureStoryState();const q=this.state.quests,r=q.records[q.active];if(!r)return null;const found=byId.get(r.nextEventId);if(!found||this.questSeen(r.nextEventId)){this.interruptQuest('后续篇章已不可用，本次线索暂告一段落。');return null;}
      const w=found.event.when,c=this.state.character;
      const impossible=w.levelMax!==undefined&&c.level>w.levelMax||w.tierMax!==undefined&&this.soul().tier>w.tierMax||w.charmMax!==undefined&&c.charm>w.charmMax||w.luckMin!==undefined&&c.luck<w.luckMin||w.luckMax!==undefined&&c.luck>w.luckMax||w.originMin!==undefined&&c.identity.originRank<w.originMin||w.originMax!==undefined&&c.identity.originRank>w.originMax||w.locations&&!w.locations.includes(c.identity.origin)||w.styles&&!w.styles.includes(c.style);
      if(impossible){this.interruptQuest('当前人物已无法满足后续篇章的条件。');return null;}
      if(!this.matchesEvent(found.event)){r.status='waiting';return null;}r.status='active';return {...found,questId:q.active};
    };
    P.openStoryEvent=function(selected,training,{continuation=false}={}){
      const s=this.state,c=s.character,e=selected.event,record=selected.questId?s.quests.records[selected.questId]:null,chain=record?chainMap.get(record.id):null,node=chain?.nodes.find(n=>n.eventId===e.id),snapshot=copy(e);
      if(node?.text)snapshot.text=node.text;
      if(node?.outcomeAppend)for(const outcome of ['success','failure'])if(node.outcomeAppend[outcome])for(const option of snapshot.options)option[outcome]+='\n\n'+node.outcomeAppend[outcome];
      s.eventHistory[e.id]=s.completed;s.pending={training,eventIndex:selected.index,eventSnapshot:snapshot,questId:record?.id||null,noSeasonRewards:continuation,bias:this.dark(20,'境遇偏倚'),receipts:[],PStart:c.stats.stats.P,date:copy(s.date),before:copy(c.stats.stats),beforeLevel:c.level,beforeRating:R.rating(c.stats).label,triggerTags:this.eventConditions(e),ringCount:c.rings.length,choice:null,reward:[],settled:false};s.lastEvent=selected.index;s.phase='event';this.sync();
    };
    P.grantPeriodGrowth=function(p){p.rewardContext='season';if(!p.noSeasonRewards){this.reward(p.training,2,p);this.reward('XP',this.growthRates().xp,p);}p.rewardContext='event';};
    P.settleQuest=function(p){
      this.ensureStoryState();if(p.legacyEvent||p.noQuestStart||p.questProcessed||!p.outcome)return;p.questProcessed=true;
      const s=this.state,q=s.quests,e=this.event();let r=p.questId?q.records[p.questId]:null,chain=r?chainMap.get(r.id):null,entry=false;
      if(!r&&!q.active){chain=chains.slice().sort((a,b)=>b.priority-a.priority).find(c=>!q.records[c.id]&&c.start.eventId===e.id&&(c.start.optionIndex===undefined||c.start.optionIndex===p.choice)&&(c.start.outcome==='any'||(c.start.outcome==='success')===p.outcome.success)&&this.questRequire(c.start.require));
        if(chain){const future=new Set(chain.nodes.filter(n=>n.eventId!==e.id).map(n=>n.eventId));if([...future].some(id=>this.questSeen(id))){q.records[chain.id]={id:chain.id,status:'blocked',nextEventId:null,settledNodes:[],rewardClaimed:false,reason:'后续篇章已独立经历，保留入口独立结算。'};return;}
          r=q.records[chain.id]={id:chain.id,status:'active',nextEventId:null,settledNodes:[],rewardClaimed:false,startedAt:copy(s.date)};q.active=chain.id;p.questId=chain.id;entry=true;
          if(chain.cadence==='same_period_episode')s.episodePeriod={chainId:chain.id,completed:s.completed,training:p.training,date:copy(s.date)};
        }
      }
      if(!r||q.active!==r.id)return;
      const node=chain.nodes.find(n=>n.eventId===e.id);if(!node||r.settledNodes.some(n=>n.eventId===e.id))return;
      if(entry&&node.outcomeAppend?.[p.outcome.success?'success':'failure'])p.outcome.text+='\n\n'+node.outcomeAppend[p.outcome.success?'success':'failure'];
      r.settledNodes.push({eventId:e.id,choice:p.choice,success:!!p.outcome.success,date:copy(s.date),period:s.completed});
      const route=node.routes?.find(route=>this.questRequire(route.require));const next=route?route.next:node.next,ending=(route?route.terminal:node.terminal)||'complete';
      if(next){r.nextEventId=next;return;}this.awardQuest(chain,r,ending,p);
    };
    P.awardQuest=function(chain,record,ending,p){
      if(record.rewardClaimed)return;const alt=chain.alternateEndings?.[ending],complete=!alt||alt.useCompletionBonus===true,definition=complete?chain.completion:alt,nodes=record.settledNodes.slice(1),successes=nodes.filter(n=>n.success).length,multiplier=complete&&successes<nodes.length/2?.5:1,perfect=complete&&nodes.length>0&&successes===nodes.length;
      const previous=p.rewardContext;p.rewardContext='quest';const bonus={};for(const [k,v]of Object.entries(definition.bonus||{})){if(!['CHARM','LUCK'].includes(k))bonus[k]=R.round2(v*multiplier);};if(perfect)for(const [k,v]of Object.entries(chain.completion.perfectExtra||{}))if(!['CHARM','LUCK'].includes(k))bonus[k]=R.round2((bonus[k]||0)+v);
      for(const [key,amount]of Object.entries(bonus))if(amount>0)this.reward(key,amount,p);
      record.status=complete?'completed':(alt.status||'closed');record.ending=ending;record.rewardId='quest:'+chain.id+':'+ending;record.rewardClaimed=true;record.nextEventId=null;record.quality={successes,total:nodes.length,multiplier,perfect};record.completedAt=copy(this.state.date);
      const text=alt?.text||chain.completion.text,memo=complete?chain.completion.memo:null;p.outcome.text+='\n\n'+text;p.questEnding={id:record.rewardId,title:chain.title,status:record.status,ending,quality:copy(record.quality),memo};this.receipt(p,'quest',chain.title,null,null,null,(perfect?'全部后续章节成功 · 额外加持':multiplier===.5?'历经波折 · 终章基础加持减半':complete?'任务链已完成':'线索提前收束'),record.rewardId);if(memo)p.reward.push('纪念记录：'+memo+'（仅记入行记）');p.rewardContext=previous;this.state.quests.active=null;
    };
    const oldResolve=P.resolveEventBranch;
    P.resolveEventBranch=function(option,success,excellent,p){
      oldResolve.call(this,option,success,excellent,p);if(p.oldNarrative)return;
      p.outcome.text=success?option.success:option.failure;
      const gift=['bone','family'].includes(option.special)&&(success||p.bias===20);
      if(gift){const bone=p.receipts.find(r=>r.kind==='bone');p.outcome.text+='\n\n'+(bone?'实际登记赠礼：'+bone.label+'（待融合）。':'本次常规部位已安排，赠礼改为修炼指导，以收益凭证为准。');}
      if(p.bias===1)p.outcome.text+='\n\n'+(success?'你处理好了额外的波折，留下进一步成长的机会。':'这次波折带来短暂疲惫，具体消耗已记入凭证，已有成长仍被保留。');
      if(p.bias===20)p.outcome.text+='\n\n这份机缘带来的额外培养资源与师长引荐已记入凭证。';
    };
    const oldFinish=P.finishQuarter;
    P.finishQuarter=function(){
      const s=this.state,p=s.pending,episode=s.episodePeriod;
      if(episode&&s.quests.active===episode.chainId){const next=this.nextQuestEvent();if(next){const e=this.event(),option=e.options[p.choice];s.journal.push({type:'episode',date:copy(p.date),quarter:s.completed+1,eventId:e.id,questId:p.questId,title:e.title,text:this.eventText(),training:'本期连续章节',choice:option.text,outcome:copy(p.outcome),receipts:copy(p.receipts),rewards:copy(p.reward),beforeLevel:p.beforeLevel,afterLevel:s.character.level,before:p.before,after:copy(s.character.stats.stats),newRings:s.character.rings.slice(p.ringCount).map(r=>({index:r.index,years:r.years}))});this.openStoryEvent(next,episode.training,{continuation:true});return;}
        this.interruptQuest('本期故事的后续条件未能满足，已完成的行动与收益保留。');
      }
      s.episodePeriod=null;oldFinish.call(this);if(s.phase==='arrival'&&s.quests?.active)this.interruptQuest('旅程已抵达公会，这条尚未完成的线索暂告一段落。');
    };
    P.questSummary=function(){const q=this.state.quests;if(!q)return null;const r=q.records[q.active];if(!r)return null;const chain=chainMap.get(r.id);return {id:r.id,title:chain.title,status:r.status,finished:r.settledNodes.length,total:chain.nodes.length,cadence:chain.cadence};};
    P.questLog=function(){return Object.values(this.state.quests?.records||{}).filter(r=>r.status!=='blocked').map(r=>({id:r.id,title:chainMap.get(r.id).title,status:r.status,finished:r.settledNodes.length,memo:r.status==='completed'?chainMap.get(r.id).completion.memo:null,reason:r.reason||null}));};
    const oldSnapshot=P.snapshot;P.snapshot=function(){return {...oldSnapshot.call(this),version:9,gameVersion:'10.01'};};
    const oldValidate=Campaign.validate;
    Campaign.validate=function(s,catalog){oldValidate(s?.version===9?{...s,version:8}:s,catalog);if(s.quests){const q=s.quests;if(q.version!==1||!q.records||typeof q.records!=='object'||Object.keys(q.records).some(id=>!chainMap.has(id))||q.active!==null&&!chainMap.has(q.active))throw Error('任务链存档无效');for(const [id,r]of Object.entries(q.records)){const chain=chainMap.get(id);if(r.id!==id||!['active','waiting','completed','closed','interrupted','blocked'].includes(r.status)||!Array.isArray(r.settledNodes)||r.settledNodes.length>chain.nodes.length||new Set(r.settledNodes.map(n=>n.eventId)).size!==r.settledNodes.length||r.settledNodes.some(n=>!chain.nodes.some(x=>x.eventId===n.eventId)||typeof n.success!=='boolean'||![0,1].includes(n.choice))||typeof r.rewardClaimed!=='boolean'||r.nextEventId&&!chain.nodes.some(n=>n.eventId===r.nextEventId))throw Error('任务节点记录无效');}if(q.active&&(!q.records[q.active]||!['active','waiting'].includes(q.records[q.active].status)))throw Error('活动任务链无效');}
      if(s.pending?.eventSnapshot&&!s.pending.legacyEvent){const e=s.pending.eventSnapshot;if(e.id!==events[s.pending.eventIndex]?.id||typeof e.title!=='string'||typeof e.text!=='string'||e.text.length>20000||!e.when||!Array.isArray(e.options)||e.options.length!==2||e.options.some(o=>typeof o.text!=='string'||typeof o.success!=='string'||typeof o.failure!=='string'||!Array.isArray(o.keys)||!o.gain||!Number.isFinite(o.base)))throw Error('事件原文快照无效');}
      if(s.episodePeriod&&(!s.quests?.records[s.episodePeriod.chainId]||s.episodePeriod.completed!==s.completed||![...R.KEYS,'W'].includes(s.episodePeriod.training)))throw Error('连续章节状态无效');return true;
    };
  }
  const api={install};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WitnessQuestRuntime=api;
})(typeof globalThis==='undefined'?this:globalThis);
