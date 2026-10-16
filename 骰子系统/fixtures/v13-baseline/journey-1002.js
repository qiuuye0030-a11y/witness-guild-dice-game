(function(root){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  function install(Campaign,R,Data){
    const P=Campaign.prototype,chains=Data.CHAINS;
    P.ensure1002=function(){
      const s=this.state;
      if(!s.exam){s.exam={mode:'normal',starts:['battle','ending'].includes(s.phase)?1:0,opponent:s.battleOptions?.enemyId||null};}
      if(!Number.isInteger(s.huntDelayMonths))s.huntDelayMonths=0;
      if(s.hunt&&s.hunt.budgetStart===undefined)s.hunt.budgetStart=s.hunt.attempt||1;
      if(s.battleOptions){s.battleOptions.campaignExam=true;s.battleOptions.examAttempt=s.exam.starts;}
      s.journeyRulesVersion=1002;
    };
    P.setPlayMode=function(mode){this.ensure1002();if(!['normal','member'].includes(mode)||this.state.exam.starts>0)throw Error('本次旅程模式已确定');this.state.exam.mode=mode;};
    P.examStatus=function(){this.ensure1002();const e=this.state.exam,limit=e.mode==='member'?10:5;return {...e,limit,remaining:Math.max(0,limit+1-e.starts),maxStarts:limit+1};};
    P.assignExaminer=function(){this.ensure1002();const e=this.state.exam;if(e.mode==='member')return e.opponent; if(!e.opponent){const list=(typeof module!=='undefined'&&module.exports?require('./v13-runtime.cjs').WitnessTemplates:root.WitnessTemplates);e.opponent=list[this.dark(list.length,'转正考核 · 抽取会员')-1].id;this.sync();}return e.opponent;};
    const oldBattle=P.battleOptions;
    P.battleOptions=function(enemyId,difficulty='admission',support=false){
      this.ensure1002();const e=this.state.exam,st=this.examStatus();
      if(e.badEnding||st.remaining<=0)throw Error('本次考核机会已耗尽，请开启新旅程');
      if(e.mode==='normal'){enemyId=this.assignExaminer();difficulty='admission';support=false;}
      const options=oldBattle.call(this,enemyId,difficulty,support);e.starts++;e.opponent=enemyId;
      options.campaignExam=true;options.examAttempt=e.starts;this.state.battleOptions=copy(options);return options;
    };
    const oldObserve=P.observeBattle;
    P.observeBattle=function(b){
      this.ensure1002();const changed=oldObserve.call(this,b),s=this.state;
      if(changed&&s.result?.winner!==0&&this.examStatus().remaining===0){
        s.exam.badEnding=true;s.phase='ending';
        s.journal.push({type:'ending',date:copy(s.date),title:'未能扣上的会徽',text:'考核机会已用尽。这一次，会徽仍留在登记台上。遗憾会留下，下一段旅程也仍在等你。',level:s.character.level});
      }return changed;
    };
    P.retry=function(){
      const s=this.state;this.ensure1002();if(s.phase!=='battle'||s.exam.badEnding||this.examStatus().remaining<=0)throw Error('本次考核机会已耗尽');
      s.exam.starts++;s.attempts++;s.result=null;s.resultHandled=false;s.battleSnapshot=null;
      s.battleOptions.examAttempt=s.exam.starts;return copy(s.battleOptions);
    };
    const oldReturn=P.returnArrival;P.returnArrival=function(){if(this.examStatus().remaining<=0||this.state.exam.badEnding)throw Error('本次考核已结束');oldReturn.call(this);};
    const oldRefresh=P.refresh;
    P.refresh=function(){this.ensure1002();const c=this.state.character;if(c?.effectiveTier)c.mutationName=this.catalog.find(x=>x.id===c.soulId)?.name;oldRefresh.call(this);if(c)for(const ring of c.rings)ring.band=R.BANDS[R.band(ring.years)];};

    P.monthsToAdmission=function(){const s=this.state,t=s.character.time;return Math.max(0,6102*12+t.month-1-(s.date.year*12+s.date.month-1));};
    P.forceAdmission=function(reason){
      const s=this.state,c=s.character;if(s.phase==='arrival')return;
      s.skippedPeriods=Math.max(0,c.time.quarters-s.completed-(s.pending?.settled?1:0));
      if(s.pending?.settled){const p=s.pending,e=this.event();s.journal.push({type:'quarter',date:copy(p.date),quarter:s.completed+1,eventId:e.id,questId:p.questId,questStage:this.questStage(),castIntroductions:copy(p.castIntroductions||{}),title:e.title,text:this.eventText(),choice:e.options[p.choice]?.text,training:'考核到期',outcome:copy(p.outcome),receipts:copy(p.receipts||[]),rewards:copy(p.reward||[]),beforeLevel:p.beforeLevel,afterLevel:c.level});}
      if(s.quests?.active)this.interruptQuest('考核日期已到，未完成的线索暂告一段落。');
      s.completed=c.time.quarters;s.date={year:6102,month:c.time.month,age:c.time.age};s.pending=null;s.hunt=null;s.episodePeriod=null;s.phase='arrival';
      s.journal.push({type:'arrival',date:copy(s.date),title:'考核日期已到',text:reason||'余下时间已不足一个季度，你收起旅途中的安排，赶往见证者公会。魂环尚有空缺，也要按时登台。'});this.sync();
    };
    const oldElapsed=P.elapsedMonths;
    P.elapsedMonths=function(completed=this.state.completed){this.ensure1002();const t=this.state.character.time,total=t.span*12;return Math.min(total,oldElapsed.call(this,completed)+this.state.huntDelayMonths);};
    const oldQuarter=P.startQuarter;
    P.startQuarter=function(training){if(this.state.phase==='growth'&&this.monthsToAdmission()<3){this.forceAdmission();return;}return oldQuarter.call(this,training);};
    const oldFinish=P.finishQuarter;
    P.finishQuarter=function(){const p=this.state.pending,stage=this.questStage(),count=this.state.journal.length;oldFinish.call(this);for(const entry of this.state.journal.slice(count)){if(['quarter','episode'].includes(entry.type)){if(stage)entry.questStage=copy(stage);if(p?.castIntroductions)entry.castIntroductions=copy(p.castIntroductions);}}if(this.state.phase==='growth'&&this.monthsToAdmission()<3)this.forceAdmission();};
    // Complete an uninterrupted short story before spending months on a new ring.
    const oldContinue=P.continueProgress;
    P.continueProgress=function(){const s=this.state;if(s.episodePeriod&&s.quests?.active===s.episodePeriod.chainId&&this.nextQuestEvent()){this.finishQuarter();return;}return oldContinue.call(this);};
    P.huntRound=function(){this.ensure1002();const h=this.state.hunt;return h?((h.attempt||1)-h.budgetStart)%4+1:0;};
    const oldAbandon=P.abandonHunt;
    P.abandonHunt=function(){
      this.ensure1002();const s=this.state,h=s.hunt,round=this.huntRound(),budgetStart=h?.budgetStart;
      oldAbandon.call(this);s.hunt.budgetStart=budgetStart;
      if(round===4){
        s.huntDelayMonths++;const t=s.character.time,absolute=s.date.year*12+s.date.month;
        s.date={year:Math.floor(absolute/12),month:absolute%12+1,age:t.startAge+Math.floor((absolute-(t.startYear*12+t.month-1))/12)};
        // Merge repeated waits into one record; long hunts do not exhaust the journal limit.
        let entry=s.journal.at(-1);if(entry?.type!=='huntDelay'||entry.ring!==h.index){entry={type:'huntDelay',ring:h.index,date:copy(s.date),months:0,title:'猎魂的等待',text:''};s.journal.push(entry);}entry.months++;entry.text='四次搜寻仍未吸收魂环，本次猎魂累计耗时'+entry.months+'个月。';entry.date=copy(s.date);
        if(this.monthsToAdmission()===0)this.forceAdmission('你没有吸收最后的候选魂环，考核的日期却已经到了。向导收起路线图，你带着尚有空缺的魂环，按时赶往斗魂台。');
      }this.sync();
    };

    P.questStage=function(){
      const s=this.state,p=s.pending;if(!p?.questId)return null;const chain=chains.find(c=>c.id===p.questId),record=s.quests.records[p.questId];if(!chain||!record)return null;
      const done=record.settledNodes.findIndex(n=>n.eventId===this.event().id),number=done>=0?done+1:record.settledNodes.length+1;
      return {title:chain.title,number,nodeTitle:this.event().title,active:record.status==='active'||record.status==='waiting',status:record.status};
    };
    const oldOpen=P.openStoryEvent;
    P.openStoryEvent=function(selected,training,options){
      oldOpen.call(this,selected,training,options);const e=this.event(),node=chains.find(c=>c.id===selected.questId)?.nodes.find(n=>n.eventId===e.id);
      this.state.pending.castIntroductions={...(e.castIntroductions||{}),...(node?.castIntroductions||{})};
    };
    const oldSettle=P.settleQuest;
    P.settleQuest=function(p){const before=p.questId;oldSettle.call(this,p);if(p.questId){const chain=chains.find(c=>c.id===p.questId),node=chain?.nodes.find(n=>n.eventId===this.event().id);p.castIntroductions={...(p.castIntroductions||{}),...(node?.castIntroductions||{})};if(!before)p.questStarted=true;}};
    const oldSnapshot=P.snapshot;P.snapshot=function(){this.ensure1002();return {...oldSnapshot.call(this),gameVersion:'10.05'};};
    const oldValidate=Campaign.validate;
    Campaign.validate=function(s,catalog){oldValidate(s,catalog);if(s.exam){const e=s.exam,max=e.mode==='member'?11:6;if(!['normal','member'].includes(e.mode)||!Number.isInteger(e.starts)||e.starts<0||e.starts>max||e.opponent!==null&&typeof e.opponent!=='string'||e.badEnding&&(s.phase!=='ending'||e.starts!==max||s.result?.winner===0))throw Error('考核机会存档无效');}if(s.huntDelayMonths!==undefined&&(!Number.isInteger(s.huntDelayMonths)||s.huntDelayMonths<0||s.huntDelayMonths>1000))throw Error('猎魂月份无效');if(s.hunt?.budgetStart!==undefined&&(!Number.isInteger(s.hunt.budgetStart)||s.hunt.budgetStart<1||s.hunt.budgetStart>(s.hunt.attempt||1)))throw Error('猎魂回合无效');return true;};
  }
  const api={install};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WitnessJourney1002=api;
})(typeof globalThis==='undefined'?this:globalThis);
