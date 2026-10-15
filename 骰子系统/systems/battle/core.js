// BattleCore: live V13 behavior; composed once by systems/battle/compose.js.
const BattleCore=(function(root){
'use strict';
const R=typeof module!=='undefined'&&module.exports?require('./rules.js'):root.WitnessRules;
const D=typeof module!=='undefined'&&module.exports?require('./core.js'):root.WitnessDice;
const templates=typeof module!=='undefined'&&module.exports?require('./校准模板.js'):root.WitnessTemplates;
const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
const copy=o=>JSON.parse(JSON.stringify(o));
function fxFor(soul){const el=soul.elements||[];if(soul.spirit_specialist)return 'mind';if(el.includes('雷'))return 'lightning';if(el.includes('冰'))return 'ice';if(el.includes('毒'))return 'poison';if(el.includes('火'))return 'fire';if(el.includes('木'))return 'petal';if(el.includes('风'))return 'wind';if(soul.main_kind==='器'&&soul.subkind==='战斗')return 'slash';return 'wave';}
function normalizeSkill(skill){if(skill.category==='持续伤害')skill={...skill,category:'攻击',damageMode:'periodic'};if(skill.category==='减益')skill={...skill,effect:String(skill.effect||'').replace(/持续\d+(?:\.\d+)?秒/g,'持续整场')};return {...copy(skill),damageNature:skill.damageNature||(skill.fx==='poison'||/毒/.test(skill.name+' '+(skill.description||''))?'poison':'residual'),id:skill.id||`${skill.ring}-${skill.name}`,fx:skill.fx||'wave'};}
function playerUnit(character,soul){soul=copy(soul);
    if(!character.stats)throw Error('先生成角色基础能力');
    const model=R.buildStats({...character,soul});
    const skills=(character.rings||[]).flatMap(r=>r.skills.map(s=>({...R.makeSkill({soul,style:character.style,stats:model,index:r.index,years:r.years,category:s.category,damageMode:s.damageMode||((s.category==='持续伤害'||s?.damageMode==='periodic')?'periodic':'direct'),effectVariant:s.effectVariant,effects:s.effects,effectSeed:s.effectSeed}),...(!['控制','减益'].includes(s.category)?{name:s.name}:{})}))).map(s=>normalizeSkill({...s,fx:fxFor(soul)}));
    return {id:'player',name:character.name||'你的见证者',team:0,soul:copy(soul),style:character.style,release:character.release,level:character.level,model,skills,portrait:null,source:'玩家人设'};
  }
function templateUnit(template,level,id,team){
    const soul={id:'npc-'+template.id,name:template.weapon,tier:7,main_kind:template.kind,subkind:template.subkind,style:template.style,attribute:template.attribute,elements:[],spirit_specialist:!!template.mental,combat_profile:{trait:template.trait,trait_name:'模板特征',description:''}};
    const release=template.kind==='兽'?'附体':'召出';
    const raw=R.buildStats({level,soul,style:template.style,release}),average=R.KEYS.reduce((n,k)=>n+raw.stats[k],0)/6;
    const growth=Object.fromEntries(R.KEYS.map(k=>[k,R.round2(raw.stats[k]*(1.28*raw.benchmark/average-1))]));
    const model=R.buildStats({level,soul,style:template.style,release,growth});
    const count=R.benchmark(level).rings;
    const skills=template.skills.slice(0,Math.min(6,R.benchmark(level).rings)).map((t,i)=>{
      const years=Math.max(10,Math.floor(R.CAPS[i]*.6));
      const base=R.makeSkill({soul,style:template.style,stats:model,index:i+1,years,category:t.category,npcTemplate:true});
      const skill=normalizeSkill({...base,...t,id:template.id+'-'+(i+1),effect:t.description});skill.cost=R.skillBudget(model,skill);skill.cooldown=skill.cd??skill.cooldown;delete skill.cd;return skill;
    });
    return {id,name:template.name,team,soul,style:template.style,release,level,model,skills,portrait:template.portrait,source:template.source,note:template.note,templateId:template.id};
  }
function runtime(unit){
    const u=copy(unit),m=u.model.derived;
    Object.assign(u,{progress:0,queuedAt:null,queueOrder:0,actions:0,hp:m.HP,mp:m.MP,sh:m.SH,cast:null,readyAt:0,cooldowns:{},uses:{},statuses:[],dots:[],shieldHP:0,shieldSH:0,shieldUntil:0,oneHit:false,guard:0,immuneUntil:0,rage:0,tuneUses:0,calmUses:0,manaGiftUses:0,firstHit:false,fallen:false});
    if(u.release==='召唤'){u.bodyHP=Math.round(m.HP*.45);u.petHP=m.HP-u.bodyHP;u.petMax=u.petHP;u.bodyMax=u.bodyHP;u.petAlive=true;}
    return u;
  }

  class Battle { constructor({character,soul,playerTemplateId=null,testLevel=41,duel=false,enemyId='qinyan',withSupport=false,seed='battle',snapshot=null,difficulty='standard'}){
      if(snapshot){if(snapshot.playerRulesVersion!==2||snapshot.soulControlVersion!==11||snapshot.combatRulesVersion!==13)throw Error('此战报使用旧版战斗规则，请保留人物并重新开战');if(snapshot.version!==10)throw Error('旧版即时战斗战报不能用于行动滚轴，请返回登记重开本场');Object.assign(this,copy(snapshot));this.rng=new D.DiceEngine(this.seed,this.rngState);this.events=[];if(this.result&&(this.result.winner===null||this.result.tieBreak&&snapshot.drawRulesVersion!==2))this.resolveDraw(this.result.reason.split(' · ')[0]);this.controlRules={...(snapshot.controlRules||root.WitnessControlV9.getConfig())};return;}
      const t=templates.find(t=>t.id===enemyId)||templates[0];
      if(playerTemplateId){const chosen=templates.find(t=>t.id===playerTemplateId);if(!chosen)throw Error('角色卡不存在');const l=Math.max(41,Math.min(99,Math.round(testLevel)));soul={name:chosen.weapon};character={level:l,style:chosen.style,rings:[]};}
      soul=copy(soul);character=copy(character);const level=Math.max(1,character.level),enemyLevel=difficulty==='admission'?Math.max(1,Math.floor(Math.max(0,level-1)/10)*10+1,level-5):level;character.level=level;if(!playerTemplateId)character.stats=R.buildStats({...character,soul});
      const count=R.benchmark(level).rings;
      // 玩家使用已经获得的全部魂环与魂技；考官按实际环数开放，最多六技。
      const units=[playerTemplateId?templateUnit(templates.find(t=>t.id===playerTemplateId),level,'player',0):playerUnit(character,soul),templateUnit(t,enemyLevel,'enemy',1)];
      const support=templates.find(t=>t.support),fighter=templates.find(t=>t.id==='yixing');
      if(character.style==='辅助'&&!duel)units.push(templateUnit(fighter,level,'ally',0),templateUnit(support,enemyLevel,'enemySupport',1));
      else if(withSupport)units.push(templateUnit(support,level,'ally',0),templateUnit(support,enemyLevel,'enemySupport',1));
      this.resourceConfig=R.getResourceConfig();this.activeId=null;this.queueSequence=0;this.units=units.map(runtime);this.difficulty=difficulty;this.seed=String(seed);this.rng=new D.DiceEngine(this.seed);this.now=0;this.result=null;this.log=[];this.events=[];this.turn=0;
      for(const u of this.units)u.tiePriority=this.rng.die(100000);
      this.addLog('斗魂台开启。对手按当前等级切磋；HP或精神护持归零即退场；魂力耗尽不自动失败。同速同时准备时按种子投骰决定顺序。');
      if(difficulty==='admission')this.addLog('入会考核：考官通常低5级但保留所在魂环阶段，伤害为标准的90%，双方行动后均回气0.3秒；按环数开放，最多六技。');
      this.addLog('行动滚轴：敏捷积累行动机会，完成后依次获得回合；实际等级参战，考核降级不会跨越魂环阶段。');
      this.scheduleAI();this.controlRules={...root.WitnessControlV9.getConfig()};
    } }
  root.WitnessBattle={Battle,templateUnit,playerUnit,fxFor,templates};


  const unit=function(id){return this.units.find(u=>u.id===id);};

  const alive=function(u){return !!u&&!u.fallen&&u.hp>0&&u.sh>0;};

  const status=function(u,type){return u.statuses.filter(s=>s.type===type&&s.until>this.now);};



  const trait=function(u){return u.soul.combat_profile?.trait||'focus';};

  const basicCost=function(u){return Math.max(1,Math.ceil(u.model.derived.baseMP*this.resourceConfig.basicFraction));};

  const refreshExhaustion=function(){};

  const cost=function(u,s){
      let cost=s.costPercent?Math.max(s.cost,Math.ceil(u.model.derived.baseMP*s.costPercent*(1-u.model.derived.costReduction/100))):s.cost;
      cost*=1+this.value(u,'costUp');
      const trait=this.trait(u);
      if(trait==='frugal'&&['强化','防御','治疗','回蓝'].includes(s.category))cost*=.88;
      if(trait==='focus'&&['控制','减益'].includes(s.category))cost*=.9;
      if(trait==='water'&&s.category==='减益')cost*=.92;
      if(trait==='fire'&&s.category==='攻击'&&s.channel==='能量')cost*=1.08;
      if(trait==='thunder'&&s.category==='攻击')cost*=1.05;
      return Math.max(1,Math.ceil(cost));
    };

  const castTime=function(u,s){
      let time=s.castFixed??(s.cast+(s.castExtra||0));
      if(this.trait(u)==='thunder'&&s.category==='攻击')time*=.9;
      time*=1+this.value(u,'slow');return Math.max(.5,time);
    };

  const targetOptions=function(u,action){
      const s=['attack','defend','defendSH','tune','calm'].includes(action)?null:u.skills.find(s=>s.id===action);
      const friendly=s&&['强化','防御','治疗','回蓝'].includes(s.category);
      if(['defend','defendSH','tune','calm','wait','armorOff','skipBonus'].includes(action))return [u];
      return this.units.filter(t=>this.alive(t)&&(friendly?t.team===u.team:t.team!==u.team)&&(s?.category!=='回蓝'||t.id!==u.id));
    };

  const canAct=function(u){return this.alive(u)&&this.activeId===u.id&&!u.cast&&u.readyAt<=this.now&&this.value(u,'control')===0;};

  const actionRate=function(u){return Math.max(.06,.20*Math.sqrt(Math.max(0,this.effective(u).A)/Math.max(20,u.model.benchmark))/(1+this.value(u,'slow')));};

  const advanceGauge=function(dt){for(const u of this.units){if(!this.alive(u)||u.id===this.activeId||u.cast||u.progress>=1||this.value(u,'control')||u.readyAt>this.now)continue;u.progress=Math.min(1,u.progress+dt/1000*this.actionRate(u));if(u.progress>=1-1e-9){u.progress=1;u.queuedAt=this.now+dt;u.queueOrder=++this.queueSequence;}}};

  const selectActor=function(){if(this.activeId){const a=this.unit(this.activeId);if(this.alive(a)&&(!this.value(a,'control')||a.cast))return;this.activeId=null;}const next=this.units.filter(u=>this.alive(u)&&!u.cast&&u.progress>=1&&!this.value(u,'control')&&u.readyAt<=this.now).sort((a,b)=>a.queuedAt-b.queuedAt||a.tiePriority-b.tiePriority||a.queueOrder-b.queueOrder)[0];if(next){this.activeId=next.id;this.addLog(next.name+'获得行动回合',{type:'turn',actor:next.id,target:next.id});}};

  const endTurn=function(u,completed=true){
      for(const s of u.statuses)if(completed&&s.actionsRemaining!==undefined)s.actionsRemaining--;
      const expired=u.statuses.filter(s=>s.actionsRemaining!==undefined&&s.actionsRemaining<=0);
      u.statuses=u.statuses.filter(s=>s.actionsRemaining===undefined||s.actionsRemaining>0);
      for(const s of expired.filter(s=>s.fatigue))this.setStatus(u,'fatigue',.1,6,{source:s.source,label:(s.label||'强化')+'后疲劳',from:s.from});
      u.progress=0;u.queuedAt=null;if(completed)u.actions++;u.readyAt=this.now+300;if(this.activeId===u.id)this.activeId=null;};

  const cooldownKey=function(u,s){return u.soul.name==='九心海棠'?'海棠治疗':s.years===100000?'ring-'+s.ring:s.id;};

  const cooldownUntil=function(u,s){return u.cooldowns[this.cooldownKey(u,s)]||0;};

  const actionReason=function(u,action){
      if(!this.alive(u))return '已退场';if(u.cast)return '正在读条';if(!this.canAct(u))return '等待敏捷行动回合';
      if(u.bonusAttack&&!['attack','skipBonus'].includes(action))return '自身增益后仅能补一发普攻或放弃';
      if(action==='skipBonus')return u.bonusAttack?'':'没有附赠普攻机会';
      if(action==='tune')return '战斗中不可调息回魂';
      if(action==='attack'&&u.mp<this.basicCost(u))return '魂力不足以普通攻击';
      if(action==='wait')return '';
      if(action==='armorOff')return this.value(u,'soulArmor')?'':'未开启逸仙剑体防护';
      if(action==='calm')return u.calmUses>=1?'安神次数已用尽':u.mp<Math.ceil(u.model.derived.baseMP*.08)?'魂力不足':'';
      if(['attack','defend','defendSH'].includes(action))return '';
      const s=u.skills.find(s=>s.id===action);if(!s)return '技能不存在';
      if(u.release==='召唤'&&!u.petAlive)return '召唤体已败退';
      if(this.cooldownUntil(u,s)>this.now)return '技能冷却中';if(u.mp<this.cost(u,s))return '魂力不足';
      if(s.category==='回蓝'&&(u.manaGiftUses||0)>=1)return '本战回蓝次数已用尽';
      if(s.maxUses&&(u.uses[s.id]||0)>=s.maxUses)return '本战次数已用尽';if(s.rageSpend&&u.rage<1)return '需要霸气';
      if(s.detonate&&!this.units.some(t=>t.team!==u.team&&t.dots.some(d=>d.source===u.id)))return '目标尚未中毒';
      return '';
    };

  const command=function(id,action,targetId){
      if(this.result)return '战斗已结束';const u=this.unit(id),reason=this.actionReason(u,action);if(reason)return reason;
      const targets=this.targetOptions(u,action),target=targets.find(t=>t.id===targetId)||targets[0];if(!target)return '没有合法目标';
      if(action==='skipBonus'){u.bonusAttack=false;this.endTurn(u);this.addLog(u.name+'放弃附赠普攻',{type:'bonusSkip',actor:u.id});return '';}
      if(action==='armorOff'){u.statuses=u.statuses.filter(s=>s.type!=='soulArmor');this.addLog(u.name+'关闭逸仙剑体防护');return '';}
      const bonus=action==='attack'&&!!u.bonusAttack;u.bonusAttack=false;
      let duration,skill=null;
      if(action==='wait')duration=.5;
      else if(action==='attack'){u.mp-=this.basicCost(u);duration=1.5;if(this.trait(u)==='heavy')duration+=.15;if(this.trait(u)==='swift')duration*=.88;}
      else if(['defend','defendSH'].includes(action))duration=.75;
      else if(action==='tune'){duration=3;u.tuneUses++;}
      else if(action==='calm'){duration=3;u.calmUses++;u.mp-=Math.ceil(u.model.derived.baseMP*.08);}
      else{
        skill=u.skills.find(s=>s.id===action);u.mp-=this.cost(u,skill);duration=this.castTime(u,skill)*(skill.castMultiplier||1);
        const cd=skill.cooldown;u.cooldowns[this.cooldownKey(u,skill)]=this.now+Math.round(cd*1000);u.uses[skill.id]=(u.uses[skill.id]||0)+1;if(skill.category==='回蓝')u.manaGiftUses=(u.manaGiftUses||0)+1;
      }
      if(action==='attack')duration*=1+this.value(u,'slow');
      u.cast={bonus,action,target:target.id,end:this.now+Math.round(duration*1000),start:this.now,skill:skill?copy(skill):null,rage:skill?.rageSpend?Math.min(3,u.rage):0};
      if(skill?.rageSpend)u.rage-=u.cast.rage;
      this.addLog(`${u.name}开始${skill?.name||{wait:'无力行动',attack:'普攻',defend:'防守',defendSH:'精神防守',tune:'调息',calm:'安神'}[action]}（${R.round2(duration)}秒）`,{type:'cast',bonus,actor:u.id,target:target.id,fx:skill?.fx||fxFor(u.soul)});
      u.progress=0;u.queuedAt=null;this.activeId=null; // Read bars may overlap; action gauge pauses while casting.
      return '';
    };

  const addLog=function(text,event={}){const line={time:this.now,text,...event};this.log.push(line);if(this.log.length>1500)this.log.shift();this.events.push(line);};



  const plan=function(u,cast,pre){
      const t=this.unit(cast.target),s=cast.skill,a=pre[u.id],p={u,t,cast,s,damage:0,heal:0,channel:'物理',effects:[]};
      if(cast.action==='wait')return p;
      if(!t||!this.alive(t))return p;
      if(['defend','defendSH'].includes(cast.action)){p.effects.push(()=>this.setStatus(u,cast.action==='defendSH'?'defendSH':'defendHP',1,3));return p;}
      if(cast.action==='tune'){p.effects.push(()=>{u.mp=Math.min(u.model.derived.MP,u.mp+Math.round(u.model.derived.baseMP*.08));this.addLog(u.name+'调息恢复魂力',{type:'restore',actor:u.id,target:u.id,fx:'restore'});});return p;}
      if(cast.action==='calm'){p.heal=Math.round(u.model.derived.SH*.08);p.channel='精神';return p;}
      const cat=s?.damageMode==='periodic'?'持续伤害':s?.category||'攻击',channel=s?.channel||(u.soul.spirit_specialist?'精神':'物理');p.channel=channel;
      const power=s?.mindPower?a.MA:channel==='精神'?a.MA:channel==='物理'?a.PA:a.SA+(s?.poisonScaling||0)*a.MA,Q=s?.Q||1;
      if(cat==='攻击'||cat==='持续伤害'){
        const hit=this.hit(u,t,channel);p.hit=hit;
        if(!hit.success){this.addLog(`${u.name}的${s?.name||'普攻'}未命中（d100=${hit.roll}，阈值${hit.chance}）`,{type:'miss',actor:u.id,target:t.id,fx:'miss'});return p;}
        let raw=s?(cat==='持续伤害'?1:1.2)*Q*power*(s.factor??1):.45*power;
        const trait=this.trait(u);if(!s&&trait==='heavy')raw*=1.12;if(!s&&trait==='swift')raw*=.96;if(!s&&['guard','ghost'].includes(trait))raw*=.94;
        if(s&&cat==='攻击'&&trait==='fire'&&channel==='能量')raw*=1.1;
        if(cat==='持续伤害'&&trait==='poison')raw*=1.14;if(cat==='攻击'&&trait==='poison')raw*=.95;
        if(cat==='持续伤害')raw*=1.4;
        if(cast.rage)raw*=1+.15*cast.rage;
        if(cat==='持续伤害'){
          const tick=this.damageValue(u,t,raw/3,channel,pre),key=u.id+'-'+s.id;
          p.effects.push(()=>{t.dots=t.dots.filter(d=>d.key!==key);t.dots.push({key,source:u.id,channel,baseDamage:tick,damage:Math.round(tick*(1+this.value(u,'dotBoost'))),next:this.now+3000,ticks:3,fx:s.fx,damageNature:this.dotNature(u,s)});this.addLog(t.name+'受到持续伤害状态',{type:'status',actor:u.id,target:t.id,fx:s.fx});});
        }else p.damage=this.damageValue(u,t,raw,channel,s?.penetration?{...pre,[t.id]:{...pre[t.id],DEF:pre[t.id].DEF*(1-s.penetration)}}:pre);
        p.extraDamage=[];
        if(s?.secondaryFactor)p.extraDamage.push({amount:this.damageValue(u,t,1.2*Q*power*s.secondaryFactor,s.secondaryChannel||channel,pre),channel:s.secondaryChannel||channel});
        const cold=this.value(u,'coldAura');
        if(cold){const hits=s?.secondaryFactor?2:1;p.extraDamage.push({amount:this.damageValue(u,t,a.SA*cold*hits,'能量',pre),channel:'能量'});}
        if(s?.detonate){const dots=t.dots.filter(d=>d.source===u.id);p.damage+=dots.reduce((sum,d)=>sum+d.damage*d.ticks,0);p.effects.push(()=>t.dots=t.dots.filter(d=>d.source!==u.id));}
        if(s?.rageGain)p.effects.push(()=>this.gainRage(u,s.rageGain));
        if(s?.slow)p.effects.push(()=>this.setStatus(t,'slow',s.slow,s.duration||2,{source:this.statusSource(u,s),label:s.name,from:u.name}));
        if(s?.manaDrain)p.effects.push(()=>{t.mp=Math.max(0,t.mp-Math.round(t.model.derived.baseMP*s.manaDrain));if(s.manaReturn&&(u.manaReturnUses||0)<2){u.manaReturnUses=(u.manaReturnUses||0)+1;u.mp=Math.min(u.model.derived.MP,u.mp+Math.round(u.model.derived.baseMP*Math.min(.02,s.manaReturn)));}});
        if(s?.costUp)p.effects.push(()=>this.setStatus(t,'costUp',s.costUp,s.duration||8,{source:this.statusSource(u,s),label:s.name,from:u.name}));
        if(s?.corrode)p.effects.push(()=>this.setStatus(t,'defDown',s.corrode,6,{source:this.statusSource(u,s),label:s.name,from:u.name}));
        if(s?.controlOnHit&&(s.controlAlways||cast.rage>=3))p.effects.push(()=>this.tryControl(u,t,s,s.controlAlways?s.controlOnHit:Math.min(3,s.controlOnHit*cast.rage)));
        return p;
      }
      if(cat==='强化'){
        if(s.evasion)p.effects.push(()=>this.setBuff(t,'evasion',s.evasion,s,{source:this.statusSource(u,s),label:s.name,from:u.name}));
        else if(s.dotBuff)p.effects.push(()=>{this.setBuff(t,'dotBoost',s.dotBuff,s,{source:this.statusSource(u,s),label:s.name,from:u.name});for(const target of this.units)for(const dot of target.dots)if(dot.source===t.id)dot.damage=this.dotDamage(dot);});
        else p.effects.push(()=>this.setBuff(t,'attackBoost',s.buff??.12*Q,s,{fatigue:!!s.fatigue,source:this.statusSource(u,s),label:s.name,from:u.name}));
        if(s.evasion&&s.buff)p.effects.push(()=>this.setBuff(t,'attackBoost',s.buff,s,{source:this.statusSource(u,s),label:s.name,from:u.name}));
        if(s.manaRestore)p.effects.push(()=>t.mp=Math.min(t.model.derived.MP,t.mp+Math.round(t.model.derived.baseMP*Math.min(.02,s.manaRestore))));
        if(s.controlWard)p.effects.push(()=>this.setBuff(t,'controlWard',1,s,{source:this.statusSource(u,s),label:s.name,from:u.name}));
        if(s.coldOnHit)p.effects.push(()=>this.setBuff(t,'coldAura',s.coldOnHit,s,{source:this.statusSource(u,s),label:s.name,from:u.name}));
        if(s.soulArmor)p.effects.push(()=>this.setBuff(t,'soulArmor',s.soulArmor,s,{source:this.statusSource(u,s),label:s.name,from:u.name}));
        if(s.agility)p.effects.push(()=>this.setBuff(t,'agility',s.agility,s,{source:this.statusSource(u,s),label:s.name,from:u.name}));
      }
      if(cat==='防御')p.effects.push(()=>{
        const mental=channel==='精神';let shield=s.guard?0:Math.round(.45*Q*(mental?a.MA:a.SA));
        if(this.trait(u)==='guard'&&!mental)shield=Math.round(shield*1.16);if(this.trait(u)==='water'&&!mental)shield=Math.round(shield*1.12);if(this.trait(u)==='ghost'&&mental)shield=Math.round(shield*1.16);
        if(mental)t.shieldSH=Math.max(t.shieldSH,shield);else t.shieldHP=Math.max(t.shieldHP,shield);
        t.shieldUntil=this.now+8000;t.oneHit=!!s.oneHit;t.guard=s.guard||0;t.rageOnBreak=!!s.rageOnBreak;
      });
      if(cat==='治疗'){p.channel=channel==='精神'?'精神':'生命';p.heal=Math.round(.4*Q*(p.channel==='精神'?a.MA:a.SA));if(this.trait(u)==='healing')p.heal=Math.round(p.heal*1.15);if(this.trait(u)==='life'&&p.channel!=='精神')p.heal=Math.round(p.heal*1.12);}
      if(cat==='回蓝')p.effects.push(()=>t.mp=Math.min(t.model.derived.MP,t.mp+Math.round(25+10*Q)));
      if(cat==='控制'&&s.chipFactor){p.damage=this.damageValue(u,t,1.2*Q*a.MA*s.chipFactor,channel,pre);}
      if(cat==='控制')p.effects.push(()=>{if(s.dispel)t.shieldHP=Math.round(t.shieldHP*(1-s.dispel));this.tryControl(u,t,s,s.baseControl);});
      if(s?.fieldEvasion)p.effects.push(()=>this.setStatus(u,'evasion',s.fieldEvasion,s.duration||9,{source:this.statusSource(u,s),label:s.name,from:u.name}));
      if(cat==='减益'&&s.slow)p.effects.push(()=>this.setStatus(t,'slow',s.slow,s.duration||8,{source:this.statusSource(u,s),label:s.name,from:u.name}));
      if(cat==='减益'&&s.costUp)p.effects.push(()=>this.setStatus(t,'costUp',s.costUp,s.duration||8,{source:this.statusSource(u,s),label:s.name,from:u.name}));
      if(cat==='减益')p.effects.push(()=>{const effect=R.controlEffect(Q,pre[u.id],pre[t.id]),roll=this.rng.die(100);if(roll<=Math.round(effect.chance))this.setStatus(t,channel==='精神'?'mindDown':'defDown',.1*Q,6,{source:this.statusSource(u,s),label:s.name,from:u.name});this.addLog(`${u.name}减益判定${roll} / ${effect.chance}%`,{type:'status',actor:u.id,target:t.id,fx:s.fx});});
      return p;
    };

  const tryControl=function(u,t,s,baseControl){
      if(!this.alive(t))return;if(t.immuneUntil>this.now||this.value(t,'controlWard')){this.addLog(t.name+'处于控制免疫期');return;}
      const effect=R.controlEffect(s.Q,this.effective(u),this.effective(t));
      if(baseControl!==undefined)effect.duration=R.round2(Math.max(.01,baseControl*effect.ratio));
      if(this.trait(u)==='binding')effect.duration=effect.duration+.2;
      if(this.trait(u)==='ice')effect.chance=Math.min(85,effect.chance+6);
      const roll=this.rng.die(100);
      if(roll>Math.round(effect.chance)){this.addLog(`${t.name}抵抗控制（d100=${roll}，阈值${effect.chance}%）`,{type:'resist',actor:u.id,target:t.id,fx:'mind'});return;}
      t.progress=Math.min(t.progress,.4);t.queuedAt=null;const ms=Math.round(effect.duration*1000);this.setStatus(t,'control',1,effect.duration);t.immuneUntil=this.now+ms+4000;
      if(t.cast){this.addLog(`${t.name}的读条被打断，已扣魂力不返还`);t.cast=null;this.endTurn(t,false);}t.readyAt=Math.max(t.readyAt,this.now+ms);
      this.addLog(`${t.name}受控${effect.duration}秒（精神力P ${u.model.stats.P} 对 ${t.model.stats.P}）`,{type:'control',actor:u.id,target:t.id,fx:s.fx});
    };

  const applyDamage=function(t,damage,channel,source,fx){
      if(!damage||!this.alive(t))return;
      const mind=channel==='精神',trait=source?this.trait(source):'';
      const shieldKey=mind?'shieldSH':'shieldHP';let incoming=damage;
      if(trait==='annihilation'&&t[shieldKey]>0)incoming=Math.round(incoming*1.3);
      if(!mind&&t.guard){incoming=Math.round(incoming*(1-t.guard));t.guard=0;}
      const blocked=Math.min(t[shieldKey],incoming);t[shieldKey]-=blocked;incoming-=blocked;
      const special=!mind&&this.value(t,'soulArmor')>0;
      const fraction=Math.min(.70,this.resourceConfig.absorb+(special?.15:0));
      const unitCost=this.resourceConfig.mpPerDamage*(special?.75:1);
      const absorbed=Math.min(Math.floor(incoming*fraction),Math.floor(t.mp/unitCost));
      const paid=Math.ceil(absorbed*unitCost);
      const beforeProtection=mind?t.sh:t.hp;
      if(paid){t.mp-=paid;incoming-=absorbed;}
      // Soul armor is a stronger variant of the universal guard, not a second shield.

      if(t.oneHit&&!mind){t.shieldHP=0;t.shieldSH=0;t.oneHit=false;if(t.rageOnBreak)this.gainRage(t,1);}
      if(mind)t.sh=Math.max(0,t.sh-incoming);
      else if(t.release==='召唤'){
        if(t.petAlive){t.petHP=Math.max(0,t.petHP-incoming);if(t.petHP===0){t.petAlive=false;t.cast=null;this.endTurn(t,false);t.readyAt=Math.max(t.readyAt,this.now+2000);this.addLog(t.name+'的召唤体败退，停顿2秒。');}}
        else t.bodyHP=Math.max(0,t.bodyHP-incoming);
        t.hp=t.bodyHP+t.petHP;
      }else t.hp=Math.max(0,t.hp-incoming);
      if(paid)this.addLog(t.name+'受击同时结算：'+(mind?'精神护持':'生命')+' −'+(beforeProtection-(mind?t.sh:t.hp))+'，魂力 −'+paid,{type:'armor',target:t.id,actor:source?.id,paid,absorbed,healthLost:beforeProtection-(mind?t.sh:t.hp),remainingDamage:incoming,channel});
      this.addLog(`${t.name}${mind?'精神护持':'生命'} −${incoming}${blocked?'（盾挡'+blocked+'）':''}`,{type:'damage',actor:source?.id,target:t.id,fx,amount:incoming,channel});
      if(!mind&&t.style==='辅助'&&!t.firstHit&&this.trait(t)==='life'&&t.hp>0){t.firstHit=true;this.heal(t,Math.round(t.model.derived.HP*.03),'生命');}
    };

  const heal=function(t,amount,channel){
      if(t.fallen)return;const mind=channel==='精神',max=mind?t.model.derived.SH:t.model.derived.HP;
      const before=mind?t.sh:t.hp;
      if(mind)t.sh=Math.min(max,t.sh+amount);
      else if(t.release==='召唤'){if(t.petAlive)t.petHP=Math.min(t.petMax,t.petHP+amount);else t.bodyHP=Math.min(t.bodyMax,t.bodyHP+amount);t.hp=t.petHP+t.bodyHP;}
      else t.hp=Math.min(max,t.hp+amount);
      this.addLog(`${t.name}${mind?'精神护持':'生命'} +${(mind?t.sh:t.hp)-before}`,{type:'heal',target:t.id,fx:'restore'});
    };

  const scheduleAI=function(autoPlayer=false){
      if(this.result)return;
      for(let i=0;i<this.units.length;i++){
        this.selectActor();const u=this.unit(this.activeId);
        if(!u||u.id==='player'&&!autoPlayer||!this.canAct(u))break;
        const choice=this.aiChoice(u);if(!choice)break;
        if(this.command(u.id,choice.action,choice.target))break;
      }
    };

  const aiChoice=function(u){
      const allies=this.units.filter(t=>t.team===u.team&&this.alive(t));
      const foes=this.units.filter(t=>t.team!==u.team&&this.alive(t));if(!foes.length)return null;
      if(u.bonusAttack){const target=foes.slice().sort((a,b)=>a.hp/a.model.derived.HP-b.hp/b.model.derived.HP||a.id.localeCompare(b.id))[0];return this.actionReason(u,'attack')?{action:'skipBonus',target:u.id}:{action:'attack',target:target.id};}
      const valid=u.skills.filter(s=>!s.aiDisabled&&!s.effects?.length&&!this.actionReason(u,s.id));
      const a=this.effective(u),choices=[];
      const add=(action,target,score)=>{score=this.compactActionScore?this.compactActionScore(u,target,action,score):score;choices.push({action,target:target.id,score:this.darkActionScore?this.darkActionScore(u,target,action,score):score});};
      const ratio=(t,channel)=>channel==='精神'?t.sh/t.model.derived.SH:t.hp/t.model.derived.HP;
      const damage=(s,t)=>{
        const channel=s?.channel||(u.soul.spirit_specialist?'精神':'物理');
        const power=s?.mindPower?a.MA:channel==='精神'?a.MA:channel==='物理'?a.PA:a.SA+(s?.poisonScaling||0)*a.MA;
        let raw=s?((s.category==='持续伤害'||s?.damageMode==='periodic')?1.4:1.2)*s.Q*power*(s.factor??1):.45*power;
        if(s?.secondaryFactor)raw+=1.2*s.Q*power*s.secondaryFactor;
        if(this.value(u,'coldAura'))raw+=a.SA*this.value(u,'coldAura')*(s?.secondaryFactor?2:1);
        if((s?.category==='持续伤害'||s?.damageMode==='periodic'))raw*=1+this.value(u,'dotBoost');
        if(s?.rageSpend)raw*=1+.15*Math.min(3,u.rage);
        if(s?.detonate)raw+=t.dots.filter(d=>d.source===u.id).reduce((n,d)=>n+d.damage*d.ticks,0)*(100+this.effective(t).DEF)/100;
        return this.damageValue(u,t,raw,channel,Object.fromEntries(this.units.map(x=>[x.id,this.effective(x)])));
      };
      const horizon=3; // Value over a few future actions, with a resource opportunity cost.
      if(!this.actionReason(u,'attack'))for(const t of foes)add('attack',t,damage(null,t)*.90/(u.model.derived.HP)*100-this.basicCost(u)/u.model.derived.baseMP*12+8*(1-ratio(t,'生命')));
      for(const s of valid){
        const friendly=['强化','防御','治疗','回蓝'].includes(s.category);
        for(const t of friendly?allies:foes){
          if(!this.targetOptions(u,s.id).some(x=>x.id===t.id))continue;
          const cost=this.cost(u,s)/u.model.derived.baseMP*12;
          let score=-Infinity;
          if(['攻击','持续伤害'].includes(s.category)){
            if(s.detonate&&!t.dots.some(d=>d.source===u.id))continue;
            if((s.category==='持续伤害'||s?.damageMode==='periodic')&&t.dots.some(d=>d.key===u.id+'-'+s.id))continue;
            score=damage(s,t)/u.model.derived.HP*100-cost;
            if(s.detonate)score+=12;
            if((s.category==='持续伤害'||s?.damageMode==='periodic'))score*=.85;
            if(damage(s,t)>=t[s.channel==='精神'?'sh':'hp']+(s.channel==='精神'?t.shieldSH:t.shieldHP))score+=60;
          }
          if(s.category==='强化'){
            const fields={attackBoost:s.buff??0,agility:s.agility||0,evasion:s.evasion||0,dotBoost:s.dotBuff||0,controlWard:s.controlWard?1:0,coldAura:s.coldOnHit||0};
            if(!s.evasion&&!s.dotBuff&&s.buff===undefined)fields.attackBoost=.12*s.Q;
            let improvement=0;
            for(const [type,v]of Object.entries(fields))improvement+=this.buffImprovement(t,type,v,s,u)*(type==='evasion'?100:type==='agility'?40:type==='controlWard'?5:60);
            if(!improvement)continue;
            if(s.dotBuff&&!foes.some(f=>f.dots.some(d=>d.source===u.id))&&!valid.some(x=>(x.category==='持续伤害'||x?.damageMode==='periodic')))continue;
            if(s.burstActions){improvement*=.55;if(s.evasion&&ratio(t,'生命')>.65)improvement*=.55;}
            score=improvement*(s.burstActions?1:horizon*.65)-cost;
            if(this.resourceConfig.selfBuffBonus&&t.id===u.id&&u.mp>=this.cost(u,s)+this.basicCost(u))score+=Math.max(...foes.map(f=>damage(null,f)))*.9/u.model.derived.HP*100-this.basicCost(u)/u.model.derived.baseMP*12;
            if(s.burstActions&&s.evasion&&ratio(t,'生命')<.65&&foes.some(f=>f.cast?.target===t.id||f.progress>.7))score+=40;
            // Poison activation when a poison is already present must precede another setup.
            if(s.dotBuff&&foes.some(f=>f.dots.some(d=>d.source===u.id)))score+=18;
          }
          if(s.category==='控制'&&(!s.effectVariant||this.controlRules?.ai==='legacy')){
            if(t.immuneUntil>this.now||this.value(t,'controlWard'))continue;
            const willInterrupt=t.cast&&t.cast.end>this.now+this.castTime(u,s)*(s.castMultiplier||1)*1000;
            const effect=R.controlEffect(s.Q,a,this.effective(t));
            const duration=Math.min(4,(s.baseControl||effect.duration)*effect.ratio);
            const enemyHit=t.skills.filter(x=>['攻击','持续伤害'].includes(x.category));
            const enemyPower=this.effective(t);
            const estimate=x=>this.damageValue(t,u,((x.category==='持续伤害'||x?.damageMode==='periodic')?1.4:1.2)*x.Q*(x.channel==='物理'?enemyPower.PA:x.mindPower?enemyPower.MA:enemyPower.SA)*(x.factor??1),x.channel,Object.fromEntries(this.units.map(x=>[x.id,this.effective(x)])));
            const blocked=willInterrupt&&t.cast.skill?estimate(t.cast.skill):0;
            const typical=enemyHit.length?Math.max(...enemyHit.map(estimate)):0;
            const window=(duration+t.progress/Math.max(.06,this.actionRate(t)))/(1/this.actionRate(t)+1.5);
            score=effect.chance/100*(blocked+typical*Math.min(.65,window))/u.model.derived.HP*100-cost;
            if(s.chipFactor)score+=s.chipFactor*s.Q*a.MA/u.model.derived.HP*100;
            if(s.dispel&&t.shieldHP)score+=20;
          }
          if(s.category==='减益'&&(!s.effectVariant||this.controlRules?.ai==='legacy')){
            const type=s.channel==='精神'?'mindDown':'defDown';
            const source=this.statusSource(u,s),defGain=this.statusGain(t,type,.1*s.Q,source),slowGain=this.statusGain(t,'slow',s.slow||0,source),costGain=this.statusGain(t,'costUp',s.costUp||0,source);
            if(!defGain&&!slowGain&&!costGain)continue;
            const remaining=Math.min(3,Math.max(0,t.hp/t.model.derived.HP*3));
            score=(slowGain*22+costGain*18+defGain*15)*remaining-cost;
            if(this.resourceConfig.domainAI&&s.fieldEvasion){
              const ownAttack=Math.max(0,...u.skills.filter(x=>['攻击','持续伤害'].includes(x.category)&&!x.detonate).map(x=>damage(x,t)));
              const ta=this.effective(t),pre=Object.fromEntries(this.units.map(x=>[x.id,this.effective(x)]));
              const enemyAttack=Math.max(0,...t.skills.filter(x=>['攻击','持续伤害'].includes(x.category)).map(x=>this.damageValue(t,u,((x.category==='持续伤害'||x?.damageMode==='periodic')?1.4:1.2)*x.Q*(x.channel==='物理'?ta.PA:x.mindPower?ta.MA:ta.SA)*(x.factor??1),x.channel,pre)));
              const horizon=Math.min(2,(s.duration||6)/(1/this.actionRate(u)+1.2));
              const defense=ta.DEF*130/Math.max(20,t.model.benchmark);
              const offenseGain=ownAttack*defGain*defense/(100+defense)*Math.min(1,horizon);
              const defenseGain=enemyAttack*((s.fieldEvasion||0)+(s.slow||0)*.5)*horizon;
              score=(offenseGain+defenseGain)/u.model.derived.HP*100-cost;
            }

          }
          if(s.effectVariant&&this.controlRules?.ai!=='legacy')score=this.scoreControlVariant(u,t,s);
          if(s.category==='防御'){
            if((s.channel==='精神'?t.shieldSH:t.shieldHP)>0||t.guard>0)continue;
            // A shield on the wrong damage channel has no immediate survival value.
            const threatened=foes.some(f=>f.skills.some(x=>['攻击','持续伤害'].includes(x.category)&&(x.channel==='精神')===(s.channel==='精神'))||(!f.soul.spirit_specialist&&s.channel!=='精神'));
            if(!threatened)continue;
            score=(ratio(t,s.channel)<.45?36:ratio(t,s.channel)<.8?18:5)-cost;
            if(t.cast)score+=4;
          }
          if(s.category==='治疗'){
            const missing=1-ratio(t,s.channel);if(missing<.12)continue;
            score=missing*65-cost;
          }
          if(s.category==='回蓝'&&t.mp<t.model.derived.MP*.3)score=20-cost;
          if(Number.isFinite(score))add(s.id,t,score);
        }
      }
      if(u.sh<u.model.derived.SH*.35&&u.calmUses<1&&u.mp>=Math.ceil(u.model.derived.baseMP*.08))add('calm',u,35);
      choices.sort((x,y)=>y.score-x.score||x.action.localeCompare(y.action)||x.target.localeCompare(y.target));
      return choices[0]||{action:'wait',target:u.id};
    };

  const nextTime=function(){
      this.refreshExhaustion();const times=[180000];
      for(const u of this.units)if(this.alive(u)&&u.exhaustTick>this.now)times.push(u.exhaustTick);
      for(const u of this.units){if(this.alive(u)&&!u.cast&&u.id!==this.activeId&&u.progress<1&&!this.value(u,'control')&&u.readyAt<=this.now)times.push(this.now+Math.max(1,Math.ceil((1-u.progress)/this.actionRate(u)*1000)));if(u.cast)times.push(u.cast.end);if(u.readyAt>this.now)times.push(u.readyAt);for(const s of u.statuses)if(s.until>this.now)times.push(s.until);for(const d of u.dots)if(d.next>this.now)times.push(d.next);if(u.shieldUntil>this.now)times.push(u.shieldUntil);}
      return Math.min(...times.filter(t=>t>this.now));
    };

  const tick=function(targetTime,autoPlayer=false){
      if(this.result)return;this.scheduleAI(autoPlayer);const until=Math.min(targetTime,180000);
      let safety=0;
      while(!this.result&&this.now<until&&safety++<5000){
        if(!autoPlayer&&this.canAct(this.unit('player')))break;
        const next=this.nextTime();if(next>until){this.advanceGauge(until-this.now);this.now=until;break;}this.advanceGauge(next-this.now);this.now=next;
        for(const u of this.units){
          for(const s of u.statuses)if(s.until<=this.now&&s.fatigue)this.setStatus(u,'fatigue',.1,6,{source:s.source,label:(s.label||'强化')+'后疲劳',from:s.from});
          u.statuses=u.statuses.filter(s=>s.until>this.now);
          if(u.shieldUntil&&u.shieldUntil<=this.now){u.shieldHP=0;u.shieldSH=0;u.guard=0;u.oneHit=false;u.shieldUntil=0;}
          for(const dot of u.dots)dot.damage=this.dotDamage(dot);
          for(const dot of u.dots)if(dot.next<=this.now&&dot.ticks>0){this.applyDotDamage(u,dot);dot.ticks--;dot.next+=3000;}
          u.dots=u.dots.filter(d=>d.ticks>0);
        }
        const completed=this.units.filter(u=>u.cast&&u.cast.end<=this.now&&this.alive(u)).map(u=>({u,cast:u.cast}));
        for(const {u}of completed)u.cast=null;
        const pre=Object.fromEntries(this.units.map(u=>[u.id,this.effective(u)])),plans=completed.map(({u,cast})=>this.plan(u,cast,pre));
        for(const {u,cast}of completed)this.endTurn(u,!(this.resourceConfig.selfBuffBonus&&cast.skill?.category==='强化'&&cast.target===u.id));
        // Damage sources remain distinct; all precomputed attacks resolve before the result check.
        for(const p of plans)if(p.damage&&p.t)this.applyDamage(p.t,p.damage,p.channel,p.u,p.s?.fx||fxFor(p.u.soul));
        for(const p of plans)for(const d of p.extraDamage||[])if(p.t)this.applyDamage(p.t,d.amount,d.channel,p.u,p.s?.fx||fxFor(p.u.soul));
        for(const p of plans)if(p.heal&&p.t)this.heal(p.t,p.heal,p.channel);
        for(const p of plans)for(const effect of p.effects)effect();
        for(const p of plans)if(p.s||p.cast.action==='attack')this.addLog(`${p.u.name}释放${p.s?.name||'普攻'}`,{type:'release',actor:p.u.id,target:p.t?.id,fx:p.s?.fx||fxFor(p.u.soul),label:p.s?.name||'普攻'});
        this.checkResult();
        if(!this.result&&this.resourceConfig.selfBuffBonus)for(const {u,cast}of completed){
          if(cast.skill?.category==='强化'&&cast.target===u.id&&this.alive(u)&&!this.value(u,'control')){
            u.bonusAttack=true;u.progress=1;u.readyAt=this.now;u.queuedAt=this.now;u.queueOrder=++this.queueSequence;
            this.addLog(u.name+'自身增益完成，可补一发耗魂普攻',{type:'bonusReady',actor:u.id});
          }
        }
        if(!this.result)this.scheduleAI(autoPlayer);
      }
      if(safety>=5000)throw Error('时间轴推进异常');
      if(!this.result&&this.now>=180000)this.finishByTime();
    };

  const hasOffense=function(u){
      return this.alive(u)&&(u.mp>=this.basicCost(u)||u.skills.some(s=>['攻击','持续伤害'].includes(s.category)&&u.mp>=this.cost(u,s)&&(!s.maxUses||(u.uses[s.id]||0)<s.maxUses)&&(!s.rageSpend||u.rage>=1)&&(!s.detonate||this.units.some(t=>t.team!==u.team&&t.dots.some(d=>d.source===u.id)))));
    };

  const resolveDraw=function(originalReason){
      const totals=[0,1].map(team=>this.units.filter(u=>u.team===team).reduce((total,u)=>{
        const maximum=Math.max(0,u.model.derived.HP);total.maxHP+=maximum;total.hp+=Math.max(0,Math.min(maximum,u.hp));return total;
      },{hp:0,maxHP:0}));
      const hp=totals.map(t=>t.hp),maxHP=totals.map(t=>t.maxHP),ratios=totals.map(t=>t.maxHP>0?t.hp/t.maxHP:0);
      const equal=Math.abs(ratios[0]-ratios[1])<1e-9,winner=equal?0:ratios[0]>ratios[1]?0:1;
      this.result={winner,reason:originalReason+' · '+(equal?'生命比例相同，主角胜':winner===0?'生命比例领先，主角胜':'生命比例落后，主角负'),time:this.now,tieBreak:{hp,maxHP,ratios,equal,rule:'remainingHPPercentage'}};
      this.addLog(`平局加判：我方剩余生命${(ratios[0]*100).toFixed(2)}%（${hp[0]}/${maxHP[0]}），对方${(ratios[1]*100).toFixed(2)}%（${hp[1]}/${maxHP[1]}）。`+(equal?'比例相同，判主角获胜。':winner===0?'我方比例更高，判主角获胜。':'对方比例更高，判主角落败，可原局重试。'));
    };

  const checkResult=function(){
      for(const u of this.units)if(!u.fallen&&(u.sh<=0||(u.release==='召唤'?u.bodyHP<=0:u.hp<=0))){u.fallen=true;u.cast=null;this.addLog(u.name+'失去战斗能力，保护阵接住了他／她。',{type:'fall',target:u.id,fx:'wave'});}
      if(this.units.filter(u=>this.alive(u)).length>=2&&!this.units.some(u=>this.hasOffense(u))&&!this.units.some(u=>u.dots.length||u.cast&&u.cast.action!=='wait')){
        this.doubleEmptySince??=this.now;
        if(this.now-this.doubleEmptySince>=5000){this.resolveDraw('双方无攻击资源');return;}
      }else this.doubleEmptySince=null;
      const a=this.units.some(u=>u.team===0&&this.alive(u)),b=this.units.some(u=>u.team===1&&this.alive(u));
      if(!a&&!b){this.resolveDraw('双方同时退场');return;}
      if(!a||!b){this.result={winner:a?0:b?1:null,reason:'退场',time:this.now};this.addLog(a?'转正战胜利。人事部为你登记，交付会徽与终端。':b?'本次切磋未通过，可以重试同一场转正战。':'双方同时退场，平局。');}
    };

  const finishByTime=function(){
      const teams=[0,1].map(team=>{const us=this.units.filter(u=>u.team===team&&this.alive(u));return {count:us.length,score:us.reduce((sum,u)=>sum+Math.min(u.hp/u.model.derived.HP,u.sh/u.model.derived.SH),0)};});
      const delta=teams[0].count-teams[1].count||teams[0].score-teams[1].score;
      if(Math.abs(delta)<1e-9){this.resolveDraw('180秒裁判');return;}
      this.result={winner:delta>0?0:1,reason:'180秒裁判',time:this.now};this.addLog('180秒结束，按存活人数与生命／精神剩余比例裁判。');
    };

  const surrender=function(){this.result={winner:1,reason:'认输',time:this.now};this.addLog('你选择结束这场切磋。');};

  return {methods:{unit,alive,status,trait,basicCost,refreshExhaustion,cost,castTime,targetOptions,canAct,actionRate,advanceGauge,selectActor,endTurn,cooldownKey,cooldownUntil,actionReason,command,addLog,plan,tryControl,applyDamage,heal,scheduleAI,aiChoice,nextTime,tick,hasOffense,resolveDraw,checkResult,finishByTime,surrender}};
})(globalThis);
