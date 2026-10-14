(function(root){
  'use strict';
  const R=typeof module!=='undefined'&&module.exports?require('./rules.js'):root.WitnessRules;
  const Creation=typeof module!=='undefined'&&module.exports?require('./campaign-creation.js'):root.WitnessCreation;
  const D=typeof module!=='undefined'&&module.exports?require('./core.js'):root.WitnessDice;
  const EventData=typeof module!=='undefined'&&module.exports?require('./campaign-events.js'):root.WitnessEvents;
  const Achievements=typeof module!=='undefined'&&module.exports?require('./achievements.js'):root.WitnessAchievements;
  const EVENTS=EventData.EVENTS;
  const copy=x=>JSON.parse(JSON.stringify(x));
  const TRAINING={B:'体能',S:'冥想',C:'操纵',D:'防护',A:'身法',P:'精神训练',W:'定心'};
  const LEGACY_EVENTS=[
    ['导师指点','一位路过的老师看过你的练习，愿意留下半日。',['请教精细运转','C',4],['加练修炼法','XP',30]],
    ['负重送货','家乡商贩托你把一批货送到邻镇。',['背负货物走远路','B',4],['学习稳定承力','D',3]],
    ['夜间守望','你接下了一次夜间看守，四周只有风声。',['专注分辨动静','P',3],['沿路练习步法','A',3]],
    ['学院旁听','地方学堂给了你一次旁听的机会。',['听魂力课','S',4],['补基础修炼课','XP',30]],
    ['雨中赶路','暴雨打断了原定行程，你需要另作安排。',['绕行湿滑小道','A',3],['搭棚遮风挡雨','D',3]],
    ['身法练习','同伴提出一场不使用魂技的身法练习。',['稳扎稳打','A',3],['挑战更快的节奏','CHANCE',4]],
    ['冥想受阻','连续几次冥想都难以进入状态。',['调整魂力运转','C',3],['先理清情绪','W',3]],
    ['工坊帮工','你在工坊帮忙，看见了力道和精度的差别。',['搬运与打磨','B',3],['完成精细作业','C',3]],
    ['药师照料','一位药师替你调理了训练留下的疲劳。',['休养身体','B',3],['学习集中精神','P',3]],
    ['同伴交流','你与同行的魂师交换了练习心得。',['整理修炼方法','XP',20],['练习配合与收力','C',3]],
    ['采集药草','这次委托只需寻找几株长在林边的药草。',['快速往返','A',3],['细辨植物特征','P',3]],
    ['小镇庆典','镇上的庆典热闹起来，你也被拉去帮忙。',['参加体力比赛','B',3],['维护秩序与防护','D',3]],
    ['武魂理解','一次练习让你发现武魂尚不熟悉的特性。',['巩固魂力强度','S',3],['反复练习显化','C',3]],
    ['图书馆旧册','你翻到一本记录普通猎魂经验的旧册。',['为下一环作准备','PREP',5],['学习修炼札记','XP',25]],
    ['森林向导','一名向导讲起了辨认危险和寻找魂兽的方法。',['训练感知','P',3],['准备下次猎魂','PREP',5]],
    ['师长委托','师长希望你独立完成一次递信。',['长途步行送达','A',3],['稳妥整理行程','XP',20]],
    ['家中急事','家人或旧友需要帮忙，你临时停下旅途。',['分担体力劳动','B',3],['安排事务与情绪','W',3]],
    ['轻微扭伤','一次训练让脚踝隐隐作痛，所幸没有大碍。',['认真休养','NONE',0],['改为低强度冥想','S',2]],
    ['瓶颈讨论','你与熟悉的魂师谈起下一次突破。',['复习基础','XP',25],['调整魂力操纵','C',3]],
    ['观摩斗魂','你旁观一场有裁判照看的切磋，没有亲自上台。',['观察如何防守','D',3],['观察释放节奏','A',3]],
    ['长途商队','一支商队正好与你同路，邀请你结伴。',['看守货物','D',3],['坚持随队步行','B',3]],
    ['精神疲劳','你终于意识到，持续紧绷并不等于保持专注。',['调整心境','W',3],['练习温和的精神训练','P',2]],
    ['训练进展','这一季的长期训练终于有了新的感悟。',['巩固当前训练方向','TRAIN',3],['记录修炼感悟','XP',30]],
    ['见证者来信','一封介绍晨曦城与见证者公会的信来到你手里。',['练习招式衔接','C',3],['让目标更加清晰','P',3]]
  ];
  class Campaign{
    constructor(catalog,{snapshot=null,seed='见证者',name='',gender='随机',tier=null,level=null,staged=true}={}){
      this.catalog=catalog;
      if(!Creation.allowedName(name))throw Error('这个姓名暂不能使用，请换一个。');
      if(snapshot){
        Campaign.validate(snapshot,catalog);this.state=copy(snapshot);Achievements.migrateIdentity(this.state);this.rng=new D.DiceEngine(this.state.seed,this.state.rngState);
        if(this.state.phase==='creation'){const draft=new Creation.Draft(catalog,{snapshot:this.state.draft});this.state.draft=draft.snapshot();this.rng=draft.rng;this.state.rngState=this.rng.state;this.state.hiddenRolls=copy(draft.state.hiddenRolls);this.state.version=8;}else this.upgrade();if(this.state.phase==='battle'&&(this.state.result?.winner===null||this.state.battleSnapshot?.result?.tieBreak&&this.state.battleSnapshot.drawRulesVersion!==2))this.state.resultHandled=false;this.refresh();return;
      }
      if(staged){const draft=new Creation.Draft(catalog,{seed,name,gender,tier,level});this.rng=draft.rng;this.state={version:8,seed:String(seed),rngState:this.rng.state,phase:'creation',draft:draft.snapshot(),character:null,rolls:[],hiddenRolls:copy(draft.state.hiddenRolls),journal:[],completed:0,xp:0,prep:0,lastEvent:null,pending:null,hunt:null,battleSnapshot:null,battleOptions:null,result:null,attempts:0,resultHandled:false,date:null,characterId:Achievements.newId(),source:level===null?'formal':'test'};return;}
      this.rng=new D.DiceEngine(seed);this.state={version:1,seed:String(seed),rngState:this.rng.state,phase:'review',rolls:[],journal:[],completed:0,xp:0,prep:0,lastEvent:null,pending:null,hunt:null,battleSnapshot:null,battleOptions:null,result:null,attempts:0,resultHandled:false};
      const s=this.state;s.characterId=Achievements.newId();s.source='test';
      const month=[1,4,7,10][this.draw(4,'入会季节')-1],age=this.draw(9,'入会年龄')+9,rawSpan=this.draw(6,'回忆跨度'),span=Math.min(rawSpan,age-6);
      const actualTier=tier===null?D.tierFor(this.draw(1000,'武魂档位')):Number(tier);
      if(!Number.isInteger(actualTier)||actualTier<1||actualTier>10)throw Error('武魂档位须为1—10');
      const soul=catalog.filter(c=>c.tier===actualTier)[this.draw(20,'武魂候选')-1];
      const styles=R.mainStyles(soul),release=soul.release_options[this.draw(soul.release_options.length,'释放方式')-1];
      const surname=['林','秦','夏','伊','许','沈','江','陆','明','苏','叶','白','韩','云','莫','唐','顾','温','陈','清'][this.draw(20,'姓氏')-1];
      const given=['青禾','照夜','星遥','予宁','知微','行舟','晓岚','承风','明溪','怀月','雨眠','落川','言初','晴空','书羽','暮云','清河','闻星','若棠','长安'][this.draw(20,'名字')-1];
      const genderOptions=['男','女','无性别'];
      const identity={gender:gender==='随机'?genderOptions[this.draw(3,'性别')-1]:String(gender),nationality:['星罗','天魂','斗灵邦联','其他国籍','无国籍'][this.draw(5,'国籍')-1],personality:['谨慎','直率','好奇','坚韧','内向','热情','好胜','随和'][this.draw(8,'性格')-1],family:['农户家庭','工匠家庭','商贩家庭','教师家庭','猎户家庭','地方小族','寄养家庭','独自成长'][this.draw(8,'家庭')-1],origin:['乡村','集镇','港口','林区','地方学院','工坊','商队','救济院'][this.draw(8,'出身')-1],appearance:['短发与朴素旅行装','长发与轻便外衣','利落束发与旧披风','柔软卷发与整洁衬衣','深色头发与贴身训练服','浅色头发与宽松长衣','微乱短发与随身背包','整齐长发与手工饰物'][this.draw(8,'外形')-1],motivation:['找到一个可以归属的地方','学习更成熟的修炼方法','帮助家乡的人','记录大陆上的所见所闻','靠自己的能力谋生','结识可以并肩同行的人'][this.draw(6,'入会动机')-1]};
      let initialLevel;
      if(level===null){const bucket=this.draw(100,'初始修为分段');const base=bucket<=10?0:bucket<=45?10:bucket<=80?20:30;initialLevel=base+this.draw(10,'初始魂力等级')-1;}
      else initialLevel=Number(level);
      if(!Number.isInteger(initialLevel)||initialLevel<0||initialLevel>99)throw Error('初始等级须为0—99');
      const time={month,age,span,rawSpan,birthYear:6102-age,startYear:6102-span,startAge:age-span,quarters:span*4};
      s.character={name:String(name).trim().slice(0,40)||surname+given,level:initialLevel,initialLevel,soulId:soul.id,style:styles[this.draw(styles.length,'战斗类别')-1],release,identity,time,deviations:R.KEYS.map(k=>this.draw(21,R.LABELS[k]+'偏差')-11),wDeviation:this.draw(21,'精神稳定偏差')-11,growth:Object.fromEntries([...R.KEYS,'W'].map(k=>[k,0])),rings:[]};
      s.date={year:time.startYear,month,age:time.startAge};this.upgrade();this.refresh();this.sync();
    }
    upgrade(){
      const s=this.state,c=s.character;if(!c)return;
      c.talent=copy(Creation.TALENTS[(c.talent?.rank||1)-1]);if(!c.identity.originRank)c.identity.originRank=3;
      if(!s.growthPlan){const remaining=Math.max(1,c.time.quarters-s.completed);s.growthPlan={target:41,baseXP:Math.ceil(Math.max(50,(Math.max(0,41-c.level)*100-s.xp)/remaining)*100)/100,createdAt:s.completed};}
      if(s.battleSnapshot&&(s.battleSnapshot.tacticsRulesVersion!==10||s.battleSnapshot.playerRulesVersion!==1||s.battleSnapshot.version!==9||s.battleSnapshot.combatRulesVersion!==12||s.battleSnapshot.soulControlVersion!==11)){s.legacyBattleReport=copy(s.battleSnapshot);s.battleSnapshot=null;s.battleOptions=null;if(s.phase==='battle'){s.result=null;s.resultHandled=false;s.phase='arrival';}}
      if(s.hunt&&!s.hunt.stage){const h=s.hunt;if(h.result){h.stage='result';h.plan=h.result.plan||'balanced';h.quality=h.result.quality||50;h.low=h.high=h.years=h.result.years;}else h.stage='plan';h.initial=false;}if(s.version<3&&s.hunt){const h=s.hunt;h.selectedCategory='random';h.location='forest';h.attempt=1;h.legacyFloor=true;h.absorbed=!!h.result;}if(s.version<4){if(s.pending)s.pending.legacyEvent=true;s.eventHistory={};s.failureStreak=0;}c.luck=c.luck||5;c.eventFlags=c.eventFlags||{};c.bones=c.bones||[];c.boneInventory=c.boneInventory||[];c.mutations=c.mutations||[];s.eventHistory=s.eventHistory||{};c.charm=c.charm||5;c.fatigue=c.fatigue||0;s.hiddenRolls=s.hiddenRolls||[];if(s.pending){s.pending.bias=s.pending.bias||10;s.pending.receipts=s.pending.receipts||[];}s.version=8;
    }
    creation(){if(this.state.phase!=='creation')throw Error('开局投骰已经完成');return new Creation.Draft(this.catalog,{snapshot:this.state.draft});}
    acknowledgeAwakening(){if(!this.state.awakeningPending)throw Error("武魂已揭晓");this.state.awakeningPending=false;this.sync();}
    rollCreation(){if(this.state.awakeningPending)throw Error("请先确认觉醒的武魂");const draft=this.creation(),wasAwake=!!draft.soul(),roll=draft.roll();if(!wasAwake&&draft.soul())this.state.awakeningPending=true;this.rng=draft.rng;this.state.draft=draft.snapshot();this.state.rolls=copy(draft.state.rolls);this.state.hiddenRolls=copy(draft.state.hiddenRolls);
      if(draft.done()){const c=draft.character();this.state.character=c;this.state.date={year:c.time.startYear,month:c.time.month,age:c.time.startAge};this.state.phase='review';this.upgrade();this.refresh();}this.sync();return roll;
    }
    soul(){const c=this.state.character,base=this.catalog.find(x=>x.id===c?.soulId);return base&&c?.effectiveTier?{...base,tier:c.effectiveTier,name:c.mutationName||base.name}:base;}
    growthRates(){const c=this.state.character;if(!c)return null;const weapon=1+.02*(this.soul().tier-1),talent=c.talent||Creation.TALENTS[0];return {base:this.state.growthPlan.baseXP,weapon:R.round2(weapon),talent:talent.xpMultiplier,xp:R.round2(this.state.growthPlan.baseXP*weapon*talent.xpMultiplier),attribute:talent.attributeMultiplier};}

    draw(sides,label){const face=sides===1?1:this.rng.die(sides);this.state.rolls.push({label,sides,face,quarter:this.state.completed});this.sync();return face;}
    dark(sides,label){const face=sides===1?1:this.rng.die(sides);this.state.hiddenRolls.push({sides,face,label,quarter:this.state.completed});this.sync();return face;}
    sync(){this.state.rngState=this.rng.state;}
    refresh(){
      const c=this.state.character,soul=this.soul();if(!c)return;c.stats=R.buildStats({...c,soul});
      for(const ring of c.rings)ring.skills=ring.skills.map((skill,i)=>({...R.makeSkill({soul,style:c.style,stats:c.stats,index:ring.index,years:ring.years,category:skill.category,variant:i,effects:skill.effects,effectSeed:skill.effectSeed||this.state.seed+'|'+ring.index+'|'+i}),name:skill.name}));
    }
    review({name,style,release=this.state.character.release}){
      if(this.state.phase!=='review')throw Error('人物已进入旅程');const c=this.state.character,soul=this.soul();
      if(!Creation.allowedName(name))throw Error('这个姓名暂不能使用，请换一个。');
      if(!R.mainStyles(soul).includes(style)||!soul.release_options.includes(release))throw Error('不符合该武魂的战斗方式');
      c.name=String(name).trim().slice(0,40)||c.name;c.style=style;c.release=release||c.release;this.refresh();
    }
    begin(){
      if(this.state.phase!=='review')throw Error('旅程已经开始');const s=this.state,c=s.character;
      s.journal.push({type:'origin',date:copy(s.date),title:'出发前',text:`${c.name}从${c.identity.origin}出发，${c.identity.family}的经历与${c.talent.label}一起成为起点。随身带着${c.identity.keepsake||'自己的记忆'}，想要${c.identity.motivation}。`,level:c.level});
      if(R.benchmark(c.level).rings>0){s.phase='initialHunt';s.hunt={index:1,prep:0,result:null,stage:'plan',initial:true};}else s.phase='prologue';this.sync();
    }
    startGrowth(){if(this.state.phase!=='prologue')throw Error('当前不能开始成长');this.state.phase='growth';}
    event(){return this.state.pending?.legacyEvent?LEGACY_EVENTS[this.state.pending.eventIndex]:EVENTS[this.state.pending?.eventIndex];}
    matchesEvent(event){
      const w=event.when,c=this.state.character,s=this.state,soul=this.soul(),flags=c.eventFlags;
      const minmax=(value,min,max)=>(min===undefined||value>=min)&&(max===undefined||value<=max);
      if(!minmax(c.identity.originRank,w.originMin,w.originMax)||!minmax(soul.tier,w.tierMin,w.tierMax)||!minmax(c.luck,w.luckMin,w.luckMax)||!minmax(c.level,w.levelMin,w.levelMax)||!minmax(c.charm,w.charmMin,w.charmMax))return false;
      if(w.compound&&Creation.soulAttributes(soul).length<2)return false;
      if(w.locations&&!w.locations.includes(c.identity.origin)||w.styles&&!w.styles.includes(c.style)||w.kind&&w.kind!==soul.main_kind)return false;
      if(w.elements&&!w.elements.some(x=>soul.elements.includes(x))||w.elementsAll&&!w.elementsAll.every(x=>soul.elements.includes(x)))return false;
      if(w.mechanisms&&!w.mechanisms.some(x=>soul.mechanisms.includes(x)))return false;
      if(w.plant&&!/植物|木|草|藤|树|花/.test(soul.name+soul.subkind+soul.attribute)||w.noElement&&soul.elements.length||w.mental&&!soul.spirit_specialist)return false;
      if(w.flag&&!flags[w.flag]||w.flagsAny&&!w.flagsAny.some(x=>flags[x])||w.bone&&!c.boneInventory.length||w.mutated&&!c.mutations.length)return false;
      if(w.prepMin&&s.prep<w.prepMin||w.late&&s.completed<c.time.quarters/2)return false;
      const value=k=>k==='W'?c.wDeviation:c.deviations[R.KEYS.indexOf(k)];
      if(w.aptitude&&!w.aptitude.keys.some(k=>value(k)>=w.aptitude.min)||w.aptitudeLow&&!w.aptitudeLow.keys.some(k=>value(k)<=w.aptitudeLow.max))return false;
      if(s.eventHistory[event.id]!==undefined||s.journal.some(j=>j.type==='quarter'&&j.title===event.title))return false;
      return true;
    }
    elapsedMonths(completed=this.state.completed){const t=this.state.character.time;return t.timelineMode==='stages'?Math.floor(completed*t.span*12/t.quarters):completed*3;}
    periodMonths(){return this.elapsedMonths(this.state.completed+1)-this.elapsedMonths();}
    startQuarter(training){
      const s=this.state;if(s.phase!=='growth'||!TRAINING[training])throw Error('请先选择当前季度的训练方向');
      let choices=EVENTS.map((event,index)=>({event,index})).filter(x=>!x.event.reserve&&this.matchesEvent(x.event)&&x.index!==s.lastEvent);
      if(!choices.length)choices=EVENTS.map((event,index)=>({event,index})).filter(x=>x.event.reserve&&this.matchesEvent(x.event));if(!choices.length)throw Error('本轮故事已全部经历，请保存旅程后更新事件库');
      if(s.failureStreak>=2){const gentle=choices.filter(x=>x.event.options[0].base>=83&&!x.event.options.some(o=>['family','mutation'].includes(o.special)));if(gentle.length)choices=gentle;}
      const weights=choices.map(x=>x.event.weight*(x.event.id==='E02'?1:1+(s.character.luck-5)*.025));
      const total=weights.reduce((a,b)=>a+b,0),face=this.draw(10000,'本季相遇'),point=(face-1)/10000*total;
      let sum=0,selected=choices.at(-1);for(let i=0;i<choices.length;i++){sum+=weights[i];if(point<sum){selected=choices[i];break;}}
      if(s.character.boneInventory.length){const resonance=choices.find(x=>x.event.id==='E02');if(resonance)selected=resonance;}
      if(s.trialFirstEvent){const trial=choices.find(x=>x.event.id===s.trialFirstEvent);if(trial)selected=trial;delete s.trialFirstEvent;}
      s.rolls.at(-1).text=selected.event.title;
      const index=selected.index;s.eventHistory[selected.event.id]=s.completed;
      s.pending={training,eventIndex:index,bias:this.dark(20,'境遇偏倚'),receipts:[],PStart:s.character.stats.stats.P,date:copy(s.date),before:copy(s.character.stats.stats),beforeLevel:s.character.level,beforeRating:R.rating(s.character.stats).label,triggerTags:this.eventConditions(selected.event),ringCount:s.character.rings.length,choice:null,reward:[],settled:false};s.lastEvent=index;s.phase='event';this.sync();
    }
    eventConditions(event=this.event()){
      if(!event||this.state.pending?.legacyEvent)return [];const w=event.when,c=this.state.character,flags=c.eventFlags,tags=[];
      const names={guide:'向导',mentor:'师承',friend:'同行',boneLead:'魂骨',prepared:'共鸣准备',exiled:'离家',reconcile:'家门往来'};
      if(w.flag)tags.push('线索·'+(names[w.flag]||w.flag));
      if(w.flagsAny)for(const f of w.flagsAny)if(flags[f])tags.push('线索·'+(names[f]||f));
      if(w.bone)tags.push('持有待融合魂骨');if(w.mutated)tags.push('经历武魂变异');if(w.prepMin)tags.push('猎魂准备≥'+w.prepMin);
      const range=(key,label)=>{if(w[key+'Min']!==undefined||w[key+'Max']!==undefined)tags.push(label+' '+(w[key+'Min']??1)+'—'+(w[key+'Max']??(key==='level'?99:10))+(key==='level'?'级':'档'));};
      for(const [key,label]of [['origin','出身'],['tier','武魂潜力'],['luck','气运'],['charm','魅力'],['level','魂力']])range(key,label);
      if(w.elements)tags.push('武魂属性·'+w.elements.filter(x=>this.soul().elements.includes(x)).join('/'));
      if(w.elementsAll)tags.push('武魂属性·'+w.elementsAll.join('/'));if(w.mechanisms)tags.push('武魂特性·'+w.mechanisms.filter(x=>this.soul().mechanisms.includes(x)).join('/'));
      if(w.kind)tags.push(w.kind+'武魂');if(w.compound)tags.push('复合属性');if(w.mental)tags.push('精神专长');if(w.plant)tags.push('植物武魂');if(w.noElement)tags.push('无元素武魂');
      if(w.locations)tags.push('成长地·'+c.identity.origin);if(w.styles)tags.push(c.style+'系');if(w.late)tags.push('旅途后半程');
      for(const [key,op]of [['aptitude','≥'],['aptitudeLow','≤']])if(w[key]){const a=w[key];for(const k of a.keys){const v=k==='W'?c.wDeviation:c.deviations[R.KEYS.indexOf(k)],n=a.min??a.max;if(op==='≥'?v>=n:v<=n)tags.push(R.LABELS[k]+'先天偏差'+op+n+(k==='W'?'点':'%'));}}
      return [...new Set(tags)];
    }
    ensurePromotionState(fromRating){
      const s=this.state,order=['纸级','并级','强级','凶级','狂级','神级'];
      if(s.promotionState?.version!==1){
        let highest=Math.max(0,order.indexOf(fromRating||R.rating(s.character.stats).label));
        for(const j of s.journal||[])for(const [stats,level]of [[j.before,j.beforeLevel],[j.after,j.afterLevel]]){
          if(stats&&Number.isInteger(level))highest=Math.max(highest,order.indexOf(R.rating({stats,level}).label));
        }
        for(const p of s.promotions||[])highest=Math.max(highest,order.indexOf(p.fromRating),order.indexOf(p.toRating));
        s.promotionState={version:1,highestRatingIndex:highest,acknowledged:{}};
      }
      const progress=s.promotionState,seen=new Set();
      s.promotions=(s.promotions||[]).filter(p=>{
        p.id=p.id||(p.ratingUp?'grade:'+order.indexOf(p.toRating):'level:'+p.toLevel);
        if(seen.has(p.id)||progress.acknowledged[p.id])return false;seen.add(p.id);return true;
      });
      return progress;
    }
    currentPromotion(){if(!this.state.character)return null;this.ensurePromotionState();return this.state.promotions[0]||null;}
    recordPromotion(fromLevel,fromRating){
      const s=this.state,c=s.character,order=['纸级','并级','强级','凶级','狂级','神级'],toRating=R.rating(c.stats).label;
      const progress=this.ensurePromotionState(fromRating),index=order.indexOf(toRating),highest=progress.highestRatingIndex;
      const ratingUp=index>highest;if(ratingUp)progress.highestRatingIndex=index;
      if(c.level<=fromLevel&&!ratingUp)return;
      const id=ratingUp?'grade:'+index:'level:'+c.level;
      if(progress.acknowledged[id]||s.promotions.some(p=>p.id===id))return;
      const previous=s.promotions.at(-1);
      if(!ratingUp&&previous&&!previous.ratingUp&&previous.toLevel===fromLevel){
        previous.toLevel=c.level;previous.toRating=toRating;previous.id=id;return;
      }
      s.promotions.push({id,fromLevel,toLevel:c.level,fromRating:ratingUp?order[highest]:fromRating,toRating,ratingUp});
    }
    acknowledgePromotion(id){
      const p=this.currentPromotion();if(!p||id!==undefined&&id!==p.id)return false;
      this.state.promotionState.acknowledged[p.id]=true;this.state.promotions.shift();return true;
    }
    fuseStoredBone(){const s=this.state;if(s.phase!=='growth'||!s.character.boneInventory.length)throw Error('当前没有可融合的魂骨');
      const oldLevel=s.character.level,oldRating=R.rating(s.character.stats).label,p={training:'C',receipts:[],reward:[],PStart:s.character.stats.stats.P};
      this.absorbBone(true,false,p);this.refresh();this.recordPromotion(oldLevel,oldRating);s.boneReport=p;this.sync();return {roll:s.rolls.at(-1)};
    }
    eventText(){const e=this.event();return this.state.pending?.legacyEvent?e[1]:e.text+(EventData.biasScene(e,this.state.pending.bias)?'\n\n'+EventData.biasScene(e,this.state.pending.bias):'');}
    eventChance(choice){
      const c=this.state.character,event=this.event(),option=event.options[choice],standard=R.benchmark(c.level);
      const keys=option.keys.filter(k=>k!=='H'),ratios=keys.map(k=>k==='W'?c.stats.stats.W/standard.stability:c.stats.stats[k]/standard.base);
      const ability=R.round2(Math.max(-15,Math.min(20,((ratios.length?ratios.reduce((a,b)=>a+b,0)/ratios.length:1)-1)*40)));
      const origin=event.when.originMin?Math.min(8,Math.max(0,c.identity.originRank-event.when.originMin)*2):0;
      const preparation=(c.eventFlags.mentor?3:0)+(c.eventFlags.prepared?5:0)+(option.special==='mutation'?Math.min(5,this.state.prep):0);
      const luck=R.round2((c.luck-5)*1.5),charm=option.keys.includes('H')?(c.charm-5)*3:0;
      const bias=this.state.pending.bias||10,scene=bias===1?-16:bias<=4?-10:bias<=8?-4:bias<=12?0:bias<=16?4:bias<=19?8:12;
      const condition=c.fatigue? -c.fatigue*3:0,chance=R.round2(Math.max(10,Math.min(95,option.base+ability+origin+preparation+luck+charm+scene+condition)));
      return {base:option.base,ability,origin,preparation,luck,charm,scene,condition,chance};
    }
    eventEstimate(choice){
      if(this.state.pending?.legacyEvent)return null;
      const sim=Object.create(Campaign.prototype);sim.catalog=this.catalog;sim.state=copy(this.state);
      let total=0;for(let bias=1;bias<=20;bias++){sim.state.pending.bias=bias;total+=sim.eventChance(choice).chance;}return Math.round(total/20);
    }
    receipt(p,kind,label,amount=null,from=null,to=null,unit='',key=label){
      if(!p.receipts)p.receipts=[];
      p.receipts.push({kind,label,key,amount,from,to,unit,context:p.rewardContext||'event'});
    }
    prepareEvent(choice){const p=this.state.pending;if(this.state.phase!=='event'||p.settled||![0,1].includes(choice))throw Error('本次选择无效');p.choice=choice;}
    reward(key,amount,p){
      const s=this.state,c=s.character;
      if(key==='XP'){const from=s.xp;s.xp=R.round2(s.xp+amount);this.receipt(p,'xp','修炼进度',R.round2(amount),from,s.xp,'点','XP');p.reward.push(`${amount}点修炼进度`);return;}
      if(key==='PREP'){if(c.level>=90){this.reward('P',2,p);return;}const before=s.prep;s.prep=Math.min(10,s.prep+Math.max(0,Math.round(amount)));this.receipt(p,'prep','猎魂准备',s.prep-before,before,s.prep,'点','PREP');p.reward.push(`猎魂准备 ${before}→${s.prep}`);return;}
      if(key==='CHARM'){const before=c.charm;c.charm=Math.min(10,c.charm+Math.max(0,Math.round(amount)));this.receipt(p,'charm','魅力',c.charm-before,before,c.charm,'档','CHARM');p.reward.push(`魅力 ${before}→${c.charm}档`);return;}
      if(key==='TRAIN'){this.reward(p.training,amount,p);return;}
      if(key==='CHANCE'){const roll=this.draw(100,'身法挑战');this.reward('A',roll<=70?4:1,p);p.reward.push(roll<=70?'挑战成功':'挑战未完成，但有所收获');return;}
      if(key==='NONE'){p.reward.push('本次认真休养，长期训练收益保留');return;}
      let actual=amount*(c.talent?.attributeMultiplier||1);if(key==='C')actual*=1+Math.min(1.5,p.PStart/200);if(key==='P'&&this.soul().spirit_specialist)actual*=1.25;
      const before=c.growth[key];c.growth[key]=R.round2(c.growth[key]+actual);this.receipt(p,'attribute',R.LABELS[key]+'训练',R.round2(actual),before,c.growth[key],'点',key);p.reward.push(`${R.LABELS[key]}训练积累 +${R.round2(actual)}`);
    }
    chooseEvent(choice=this.state.pending?.choice){
      const s=this.state,p=s.pending,c=s.character;
      if(s.phase!=='event'||!p||p.settled||![0,1].includes(choice))throw Error('本季度事件已经结算');
      p.choice=choice;p.settled=true;p.receipts=[];p.rewardContext='season';this.reward(p.training,2,p);this.reward('XP',this.growthRates().xp,p);p.rewardContext='event';
      const event=this.event();
      if(p.legacyEvent){const option=event[choice+2];this.reward(option[1],option[2],p);p.outcome={text:'原存档中的事件按原奖励完成结算。',success:true,roll:null};}
      else{
        const option=event.options[choice],chance=this.eventChance(choice),face=this.draw(100,'行动判定 · '+event.title),roll=s.rolls.at(-1);
        const success=face<=chance.chance,excellent=success&&face<=Math.max(5,chance.chance-35);
        p.outcome={text:success?option.success:option.failure,success,excellent,face,chance,roll};
        this.resolveEventBranch(option,success,excellent,p);
        roll.text=(success?(excellent?'出色成功':'成功'):'有所波折')+' · '+event.title;
        s.failureStreak=success?0:(s.failureStreak||0)+1;
      }
      this.refresh();this.recordPromotion(c.level,p.beforeRating||R.rating(c.stats).label);s.phase='eventResult';this.sync();return {roll:p.outcome.roll};
    }
    resolveEventBranch(option,success,excellent,p){
      const s=this.state,c=s.character;
        for(const [key,amount]of Object.entries(option.gain)){
          const actualKey=key==='WEAK'?R.KEYS[c.deviations.indexOf(Math.min(...c.deviations))]:key;
          const multiplier=p.bias>=17?1.6:p.bias>=13?1.2:p.bias<=4?1.3:1;
          this.reward(actualKey,success?R.round2(amount*multiplier):actualKey==='CHARM'?0:Math.max(1,Math.floor(amount*.25)),p);
        }
        if(option.special){
          const protectedGift=p.bias===20&&['family','bone'].includes(option.special);
          this.specialEvent(option.special,success||protectedGift,excellent,p);
          if(protectedGift&&!success)p.outcome.text='原本的行动没有完整做成，但对方认真看到了你的准备，仍愿意提供适配魂骨与后续护持。';
        }
        this.settleBias(success,p,option);
        p.outcome.text+=p.bias===1?(success?'你稳住了险情，并把一次危险转成了额外成长。':'险情让你暂时疲惫，但退路与既有成长仍被保留。'):p.bias===20?'这次相遇带来的培养资源与引荐已经兑现，成为一路上的重要转机。':'';
    }
    previewEvent(choice){
      const state=this.state,pending=state.pending,event=this.event();
      if(state.phase!=='event'||pending.settled||![0,1].includes(choice))throw Error('当前不能查看分支');
      // No constructor, live dice, storage or promotion hooks run in this sandbox.
      const simulate=(success,bias,excellent,mode)=>{
        const sim=Object.create(Campaign.prototype);sim.catalog=this.catalog;sim.state=copy(state);
        sim.rng=new D.DiceEngine(state.seed,state.rngState);
        sim.draw=(sides,label)=>{const face=mode==='max'?sides:mode==='miss'&&/变异/.test(label)?sides:1;sim.state.rolls.push({label,sides,face});return face;};
        const p=sim.state.pending;p.bias=bias;p.choice=choice;p.receipts=[];p.reward=[];p.outcome={text:'',success};p.rewardContext='season';
        sim.reward(p.training,2,p);sim.reward('XP',sim.growthRates().xp,p);p.rewardContext='event';
        if(p.legacyEvent){const o=event[choice+2];sim.reward(o[1],o[2],p);}else sim.resolveEventBranch(event.options[choice],success,excellent,p);
        const flags=sim.state.character.eventFlags;
        for(const [key,label]of Object.entries({mentor:'师承／师长引荐',guide:'向导',friend:'同行',boneLead:'魂骨线索',prepared:'共鸣准备',exiled:'离开家门',reconcile:'家门往来'}))if(flags[key]&&!state.character.eventFlags[key]&&!p.receipts.some(r=>r.kind==='relationship'&&(key==='mentor'?/师承|师长|引荐/.test(r.label):r.label===label)))sim.receipt(p,'relationship',label,null,null,null,'可能开启后续相遇',key);
        return {receipts:p.receipts,rawGain:p.legacyEvent?{}:event.options[choice].gain};
      };
      const summarize=runs=>{
        const numeric=new Map(),notes=new Map();
        const totals=runs.map(run=>{const total=new Map();for(const r of run.receipts){const id=r.context+':'+r.kind+':'+r.key;
          if(typeof r.amount==='number'){numeric.set(id,r);total.set(id,R.round2((total.get(id)||0)+r.amount));}
          else {const name=r.kind==='bone'?'适配魂骨':r.label;notes.set(r.context+':'+r.kind+':'+name,{...r,label:name});}}
          return total;});
        return {gains:[...numeric].map(([id,r])=>({...r,min:Math.min(...totals.map(t=>t.get(id)||0)),max:Math.max(...totals.map(t=>t.get(id)||0))})),notes:[...notes.values()]};
      };
      const common=summarize([simulate(true,10,false,'min')]).gains.filter(r=>r.context==='season');
      const branch=success=>{const runs=[];for(let bias=1;bias<=20;bias++)for(const excellent of success?[false,true]:[false])for(const mode of ['min','max','miss'])runs.push(simulate(success,bias,excellent,mode));const result=summarize(runs);result.gains=result.gains.filter(r=>r.context!=='season');result.notes=result.notes.filter(r=>r.context!=='season');return {...result,text:pending.legacyEvent?'原存档事件按原规则获得奖励。':event.options[choice][success?'success':'failure']};};
      return {common,success:branch(true),failure:branch(false),rawGain:pending.legacyEvent?{}:copy(event.options[choice].gain)};
    }
    settleBias(success,p,option){
      const c=this.state.character,bias=p.bias,key=option.keys.find(k=>k!=='H')||'P';p.rewardContext='opportunity';
      if(bias===20){this.reward('XP',150,p);this.reward(key,8,p);c.eventFlags.mentor=true;this.receipt(p,'relationship','重要师长引荐',null,null,null,'','mentor');p.reward.push('获得珍贵培养资源与重要引荐');if(option.special==='boneLead')this.grantBone(p);}
      else if(bias===1){
        if(success){this.reward('XP',60,p);this.reward(key,6,p);c.eventFlags.boneLead=true;this.receipt(p,'clue','克服险情后的线索');p.reward.push('克服险情，留下可继续追查的线索');}
        else{
          const from=this.state.prep;this.state.prep=Math.max(0,from-3);
          if(from!==this.state.prep)this.receipt(p,'loss','猎魂准备',this.state.prep-from,from,this.state.prep,'点');
          const bonus=p.receipts.filter(r=>r.key==='XP'&&r.context!=='season').reduce((n,r)=>n+Math.max(0,r.amount||0),0);
          const before=this.state.xp;this.state.xp=Math.max(0,R.round2(before-Math.min(20,bonus)));
          if(before!==this.state.xp)this.receipt(p,'loss','额外修炼调整',R.round2(this.state.xp-before),before,this.state.xp,'点');
          const beforeGrowth=c.growth[key],loss=Math.min(2,beforeGrowth);c.growth[key]=R.round2(beforeGrowth-loss);
          if(loss)this.receipt(p,'loss',R.LABELS[key]+'训练调整',-loss,beforeGrowth,c.growth[key],'点');
          c.fatigue=2;this.receipt(p,'risk','暂时疲惫',null,null,null,'下一季行动判定－3个百分点');
          p.reward.push('临时休整：部分准备与训练积累消耗，长期修炼基础及武魂保留');
        }
      }else if(bias>=17&&success)this.reward('XP',35,p);
      else if(bias>=13&&success)this.reward('XP',10,p);
      p.rewardContext='event';
    }
    specialEvent(type,success,excellent,p){
      const c=this.state.character,flags=c.eventFlags;
      if(type==='family'){
        if(success){flags.mentor=true;this.grantBone(p);}
        else if(p.choice===1){flags.exiled=true;p.reward.push('离开家门；保留历史出身与已有能力，仍有人愿意援助你');}
        else{flags.mentor=true;p.reward.push('获得独立求学的介绍，不失去已有成长');}
      }else if(type==='bone'){if(success)this.grantBone(p);else flags.boneLead=true;}
      else if(type==='mutation')this.absorbBone(success,excellent,p);
      else if(success){const known=!!flags[type];flags[type]=true;this.receipt(p,type==='boneLead'?'clue':'relationship',{mentor:'师承',guide:'向导',friend:'同行',boneLead:'魂骨线索',prepared:'共鸣准备',reconcile:'家门往来'}[type]||'后续线索',null,null,null,known?'关系加深':'新联系');p.reward.push({mentor:'师长关系建立',guide:'向导关系建立',friend:'同行关系建立',boneLead:'获得魂骨来源或适配线索',prepared:'共鸣引导准备完成',reconcile:'与家门建立新的往来'}[type]||'留下后续线索');}
    }
    grantBone(p){
      const c=this.state.character,slots=['头部','躯干','左臂','右臂','左腿','右腿'];
      const available=slots.filter(slot=>![...c.bones,...c.boneInventory].some(x=>x.slot===slot));
      if(!available.length){p.reward.push('常规魂骨部位已全部有所安排，赠礼改为修炼指导');this.reward('XP',25,p);return;}
      const slot=available[this.draw(available.length,'魂骨部位')-1],soul=this.soul();
      const affinity=soul.elements[0]||soul.mechanisms[0]||'通用';
      const bone={id:'bone-'+this.state.completed+'-'+slot,slot,name:affinity+'共鸣'+slot+'骨',affinity,years:1000,skills:[],source:this.event().title,absorbed:false};
      c.boneInventory.push(bone);this.receipt(p,'bone',bone.name,null,null,null,'待融合 · 魂骨技留空');p.reward.push('获得 '+bone.name+'（待融合；魂骨技留空）');
      // 季度故事整局只出现一次；之后的魂骨可从成长页独立融合。
    }
    absorbBone(success,excellent,p){
      const c=this.state.character,bone=c.boneInventory.shift();if(!bone)return;
      if(c.bones.some(x=>x.slot===bone.slot)){c.boneInventory.unshift(bone);p.reward.push('该部位已有魂骨，暂不融合');return;}
      bone.absorbed=true;c.bones.push(bone);this.receipt(p,'bone',bone.name,null,null,null,'已融合 · 魂骨技留空');p.reward.push('融合 '+bone.name+'；魂骨技留空');
      const tier=this.soul().tier,bases=[75,75,60,60,45,45,25,25,10,0];
      if(tier===10){p.reward.push('武魂已达潜力顶档，共鸣留下新的纹路，不再升档');return;}
      const chance=Math.max(5,Math.min(95,bases[tier-1]+(success?8:-10)+(excellent?5:0)+(c.luck-5)*1.5+(c.eventFlags.prepared?5:0)));
      const face=this.draw(100,'魂骨引发武魂变异'),changed=face<=chance;
      p.reward.push(`变异判定 D100=${face} / ${R.round2(chance)}%`);
      if(!changed){p.reward.push('本次未发生变异，魂骨融合与已有能力保留');return;}
      const range=tier<=2?[2,4]:tier<=4?[1,3]:tier<=6?[1,2]:tier<=8?[1,excellent?2:1]:[1,1];
      const gain=range[0]+this.draw(range[1]-range[0]+1,'武魂潜力提升幅度')-1,newTier=Math.min(10,tier+gain);
      this.state.rolls.at(-1).text=`提升＋${newTier-tier}档 · ${tier}→${newTier}档`;
      const base=this.catalog.find(x=>x.id===c.soulId);c.effectiveTier=newTier;c.mutationName=base.name+'·共鸣变异';
      this.receipt(p,'mutation','武魂潜力',newTier-tier,tier,newTier,'档','potential');
      c.mutations.push({before:tier,after:newTier,boneId:bone.id,quarter:this.state.completed+1});
      p.reward.push(`武魂潜力 ${tier}→${newTier}档！${c.mutationName}`);
    }
    finishEvent(){if(this.state.phase!=='eventResult'||!this.state.pending?.settled)throw Error('请先完成事件');this.continueProgress();this.sync();}
    continueProgress(){
      const s=this.state,c=s.character;
      while(s.xp>=99.995&&c.level<99){s.xp=Math.max(0,R.round2(s.xp-100));const oldLevel=c.level,oldRating=R.rating(c.stats).label;c.level++;this.refresh();this.recordPromotion(oldLevel,oldRating);
        if(c.level%10===1&&c.rings.length<R.benchmark(c.level).rings){s.hunt={index:c.rings.length+1,prep:s.prep,result:null,stage:'plan',initial:false};s.phase='hunt';return;}
      }
      if(c.level===99)s.xp=Math.min(s.xp,99.99);
      this.finishQuarter();
    }
    generateRing(index,plan='balanced',prep=0,targetCount=null){
      const c=this.state.character,soul=this.soul(),cap=R.CAPS[index-1];
      const quality=Math.max(1,Math.min(100,this.draw(100,'第'+index+'环年限质量')+prep));
      const {low,high}=R.ringRange(cap,quality);
      const years=low+this.draw(high-low+1,'第'+index+'环年限区间')-1;
      let category;
      if(index===7)category=this.draw(2,'武魂真身倾向')===1?'强化':'防御';
      else{
        let weights=[...R.WEIGHTS[c.style]];
        if(plan!=='balanced'){
          const at=plan==='offense'?(c.style==='辅助'?1:0):2,extra=15,old=weights[at],other=100-old;
          weights=weights.map((v,i)=>i===at?old+extra:Math.floor(v*(other-extra)/other));
          let delta=100-weights.reduce((a,b)=>a+b,0);for(let i=0;delta>0;i=(i+1)%weights.length)if(i!==at&&weights[i]>0){weights[i]++;delta--;}
        }
        const roll=this.draw(100,'第'+index+'环魂技类别');let total=0;category=R.CATEGORIES[weights.findIndex(w=>(total+=w)>=roll)];
      }
      let guarantee='';
      const needs=['强攻','敏攻'].includes(c.style)||(soul.spirit_specialist&&c.style==='控制');
      const has=c.rings.some(r=>r.skills.some(s=>['攻击','持续伤害'].includes(s.category)));
      const last=targetCount===null?index:Math.min(targetCount,6);
      if(index===last&&index!==7&&needs&&!has&&!['攻击','持续伤害'].includes(category)){category='攻击';guarantee='初次攻击魂技保底';}
      
      const skills=[R.makeSkill({soul,style:c.style,stats:c.stats,index,years,category,effectSeed:this.state.seed+'|'+index+'|0'})];
      if(years===100000){let second=R.pickCategory(c.style,this.draw(100,'十万年第二魂技'));if(second===category)second=R.CATEGORIES[(R.CATEGORIES.indexOf(second)+1)%8];skills.push(R.makeSkill({soul,style:c.style,stats:c.stats,index,years,category:second,variant:1,effectSeed:this.state.seed+'|'+index+'|1'}));guarantee+='；同环两技共享冷却';}
      return {index,years,cap,quality,plan,band:R.BANDS[R.band(years)],q:R.QS[R.band(years)],skills,guarantee,acquiredAt:copy(this.state.date)};
    }
    huntCategories(index=this.state.hunt?.index){return index===7?['强化','防御']:R.CATEGORIES;}
    huntPlan(plan='balanced',category='random',location='forest'){
      const s=this.state,h=s.hunt;
      if(!['hunt','initialHunt'].includes(s.phase)||!h||h.stage!=='plan'||!['balanced','offense','guard'].includes(plan)||!['forest','valley','wetland'].includes(location)||category!=='random'&&!this.huntCategories(h.index).includes(category))throw Error('请先选择魂技类别与猎魂路线');
      Object.assign(h,{plan,selectedCategory:category,location,attempt:h.attempt||1,absorbed:false});h.stage='quality';this.sync();
    }
    huntStep(){
      const s=this.state,h=s.hunt;
      if(!['hunt','initialHunt'].includes(s.phase)||!h||h.result||h.stage==='plan')throw Error('请先选择猎魂方向');
      const cap=R.CAPS[h.index-1];
      if(h.stage==='quality'){
        h.quality=Math.min(100,this.draw(100,'第'+h.index+'环年限质量')+(h.initial?0:s.prep));
        Object.assign(h,R.ringRange(cap,h.quality));h.legacyFloor=false;h.stage='years';
      }else if(h.stage==='years'){
        h.years=h.low+this.draw(h.high-h.low+1,'第'+h.index+'环具体年限')-1;
        h.stage='category';
        if(h.selectedCategory!=='random'){h.category=h.selectedCategory;if(h.years===100000)h.stage='second';else this.prepareHuntCandidate();}
      }else if(h.stage==='category'||h.stage==='second'){
        const categories=this.huntCategories(h.index),second=h.stage==='second';
        const available=second?categories.filter(x=>x!==h.category):categories;
        const category=available[this.draw(available.length,second?'十万年第二魂技':'第'+h.index+'环魂技类别')-1];
        if(second)h.secondCategory=category;else h.category=category;
        if(h.years===100000&&!second)h.stage='second';else this.prepareHuntCandidate();
      }else throw Error('猎魂步骤无效');
      this.sync();
    }
    chooseSecond(category){
      const h=this.state.hunt;
      if(!['hunt','initialHunt'].includes(this.state.phase)||!h||h.stage!=='second'||!this.huntCategories(h.index).includes(category)||category===h.category)throw Error('请选择不同的第二魂技类别');
      h.secondCategory=category;this.prepareHuntCandidate();this.sync();
    }
    prepareHuntCandidate(){
      const s=this.state,h=s.hunt,c=s.character,soul=this.soul();
      const previewStats=R.buildStats({...c,soul});
      const skills=[R.makeSkill({soul,style:c.style,stats:previewStats,index:h.index,years:h.years,category:h.category,effectSeed:s.seed+'|'+h.index+'|0'})];
      if(h.secondCategory)skills.push(R.makeSkill({soul,style:c.style,stats:previewStats,index:h.index,years:h.years,category:h.secondCategory,variant:1,effectSeed:s.seed+'|'+h.index+'|1'}));
      h.result={index:h.index,years:h.years,cap:R.CAPS[h.index-1],quality:h.quality,plan:h.plan,location:h.location,band:R.BANDS[R.band(h.years)],q:R.QS[R.band(h.years)],skills,guarantee:h.secondCategory?'同环两技共享冷却':'',acquiredAt:copy(s.date)};
      h.stage='result';h.absorbed=false;
    }
    abandonHunt(){
      const s=this.state,h=s.hunt;
      if(!['hunt','initialHunt'].includes(s.phase)||!h?.result||h.absorbed)throw Error('只能放弃尚未吸收的候选魂环');
      s.rolls.push({label:'放弃第'+h.index+'环候选',sides:1,face:1,text:h.years+'年 · '+h.result.skills.map(x=>x.category).join(' / '),quarter:s.completed});
      s.hunt={index:h.index,prep:h.prep,result:null,stage:'plan',initial:h.initial,attempt:(h.attempt||1)+1,selectedCategory:h.selectedCategory,location:h.location,absorbed:false};this.sync();
    }
    hunt(plan='balanced',category='random'){
      if(this.state.hunt.stage==='plan')this.huntPlan(plan,category);
      while(!this.state.hunt.result)this.huntStep();return this.state.hunt.result;
    }
    finishHunt(){
      const s=this.state,h=s.hunt;
      if(!['hunt','initialHunt'].includes(s.phase)||!h?.result)throw Error('先取得候选魂环');
      if(!h.absorbed){
        if(h.index!==s.character.rings.length+1)throw Error('魂环位置已经变化');
        s.character.rings.push(copy(h.result));h.absorbed=true;if(!h.initial)s.prep=0;this.refresh();
      }
      if(h.initial){if(s.character.rings.length<R.benchmark(s.character.level).rings)s.hunt={index:s.character.rings.length+1,prep:0,result:null,stage:'plan',initial:true};else{s.hunt=null;s.phase='prologue';}}
      else{s.hunt=null;this.continueProgress();}this.sync();
    }
    finishQuarter(){
      const s=this.state,p=s.pending,c=s.character;if(!p||!p.settled)throw Error('季度尚未结算');
      const event=this.event(),option=p.legacyEvent?event[p.choice+2]:event.options[p.choice];
      s.journal.push({type:'quarter',date:p.date,quarter:s.completed+1,eventId:p.legacyEvent?null:event.id,triggerTags:copy(p.triggerTags||[]),title:p.legacyEvent?event[0]:event.title,text:this.eventText(),training:TRAINING[p.training],choice:p.legacyEvent?option[0]:option.text,outcome:copy(p.outcome||null),receipts:copy(p.receipts||[]),rewards:p.reward,beforeLevel:p.beforeLevel,afterLevel:c.level,before:p.before,after:copy(c.stats.stats),newRings:c.rings.slice(p.ringCount).map(r=>({index:r.index,years:r.years}))});
      if(c.fatigue>0)c.fatigue--;
      s.completed++;const absolute=c.time.startYear*12+c.time.month-1+this.elapsedMonths();s.date={year:Math.floor(absolute/12),month:absolute%12+1,age:c.time.startAge+Math.floor(this.elapsedMonths()/12)};
      s.pending=null;s.phase=s.completed===c.time.quarters?'arrival':'growth';
      if(s.phase==='arrival'){s.journal.push({type:'arrival',date:copy(s.date),title:'晨曦城',text:`在6102年${c.time.month}月，${c.name}终于看见见证者公会的门。这里可能会成为新的家。`,level:c.level});}
    }
    battleOptions(enemyId,difficulty='admission',withSupport=false){
      const s=this.state;if(s.phase!=='arrival')throw Error('尚未抵达公会');
      if(s.character.level<41)throw Error('入会转正战需要至少41级；旧版低等级旅程可保留档案，或开始新版旅程');
      if(s.character.rings.length!==R.benchmark(s.character.level).rings)throw Error('魂环尚未齐全');
      this.refresh();s.phase='battle';s.result=null;s.resultHandled=false;s.attempts++;s.battleSnapshot=null;
      const options={character:copy(s.character),soul:copy(this.soul()),enemyId,difficulty,withSupport,seed:s.seed+'-转正战-'+enemyId+'-'+difficulty};
      s.battleOptions=copy(options);return options;
    }
    observeBattle(battle){
      const s=this.state;if(s.phase!=='battle')return false;s.battleSnapshot=battle.snapshot();
      if(battle.result&&!s.resultHandled){s.resultHandled=true;s.result=copy(battle.result);
        if(battle.result.winner===0){s.phase='ending';s.journal.push({type:'ending',date:copy(s.date),title:'见证者会徽',text:`转正战结束，${s.character.name}得到正式登记。会徽与终端递到手中：欢迎回家。`,level:s.character.level});return true;}
        return true;
      }return false;
    }
    returnArrival(){if(this.state.phase!=='battle'||!this.state.result)throw Error('当前战斗尚未结束');this.state.phase='arrival';this.state.battleSnapshot=null;this.state.result=null;this.state.resultHandled=false;}
    retry(){if(this.state.phase!=='battle')return;this.state.attempts++;this.state.result=null;this.state.resultHandled=false;this.state.battleSnapshot=null;}
    snapshot(){this.sync();return copy(this.state);}
    static validate(s,catalog){
      if(!s||![1,2,3,4,5,6,7,8].includes(s.version)||typeof s.seed!=='string'||s.seed.length>120||!['creation','review','initialHunt','prologue','growth','event','eventResult','hunt','arrival','battle','ending'].includes(s.phase))throw Error('不是可兼容的完整游戏存档');
      if(s.phase==='creation'){if(![2,3,4,5,6,7,8].includes(s.version)||!s.draft||s.character!==null||s.completed!==0)throw Error('开局状态无效');Creation.Draft.validate(s.draft,catalog);if(s.seed!==s.draft.seed||s.rngState!==s.draft.rngState)throw Error('开局骰序无效');return true;}
      const c=s.character;if(!c||typeof c.name!=='string'||c.name.length>40||!Creation.allowedName(c.name)||!Number.isInteger(c.level)||c.level<0||c.level>99)throw Error('人设数据无效');
      const soul=catalog.find(x=>x.id===c.soulId);if(!soul||!R.mainStyles(soul).includes(c.style)||!soul.release_options.includes(c.release))throw Error('武魂数据不兼容');
      if(!Number.isInteger(s.rngState)||!Number.isInteger(s.completed)||s.completed<0||!Number.isInteger(c.time?.quarters)||s.completed>c.time.quarters||c.time.quarters<4||c.time.quarters>24||c.time.age<10||c.time.age>40||c.time.startAge<6)throw Error('时间数据无效');
      if(c.time.timelineMode==='stages'&&(c.time.startAge!==6||c.time.age<16||c.time.age>40||c.time.span!==c.time.age-6||c.time.quarters!==24))throw Error('新旅程时间数据无效');
      if(!Array.isArray(s.rolls)||s.rolls.length>10000||!Array.isArray(s.journal)||s.journal.length>50||!Array.isArray(c.rings)||c.rings.length>9)throw Error('记录超出范围');
      if(!Number.isFinite(s.xp)||s.xp<0||s.xp>20000||!Number.isInteger(s.prep)||s.prep<0||s.prep>10)throw Error('成长数据无效');
      for(const key of [...R.KEYS,'W'])if(!Number.isFinite(c.growth?.[key])||c.growth[key]<0||c.growth[key]>5000)throw Error('能力积累无效');
      c.rings.forEach((r,i)=>{if(r.index!==i+1||!Number.isInteger(r.years)||r.years<10||r.years>R.CAPS[i]||!Array.isArray(r.skills)||r.skills.length<1||r.skills.length>2||r.skills.some(x=>!R.CATEGORIES.includes(x.category)))throw Error('魂环数据无效');});
      for(const ring of c.rings)for(const skill of ring.skills)if(skill.effects!==undefined){if(!['强化','减益'].includes(skill.category)||!Array.isArray(skill.effects)||skill.effects.length<1||skill.effects.length>3||new Set(skill.effects.map(e=>e.key)).size!==skill.effects.length||skill.effects.some(e=>!R.KEYS.includes(e.key)||!Number.isFinite(e.value)||e.value<=0||e.value>.5)||typeof skill.effectSeed!=='string'||skill.effectSeed.length>240)throw Error('多项魂技数据无效');}
      if(['event','eventResult'].includes(s.phase)&&(!s.pending||!Number.isInteger(s.pending.eventIndex)||s.pending.eventIndex<0||s.pending.eventIndex>=(s.version<4||s.pending.legacyEvent?24:EVENTS.length)||s.phase==='event'&&s.pending.settled||s.phase==='eventResult'&&!s.pending.settled||!TRAINING[s.pending.training]))throw Error('事件状态无效');
      if(s.phase==='initialHunt'&&(!s.hunt?.initial||s.completed!==0||s.pending))throw Error('初始魂环状态无效');
      if(s.phase==='hunt'&&(!s.hunt||!s.pending?.settled||!TRAINING[s.pending.training]))throw Error('猎魂状态无效');
      if(['hunt','initialHunt'].includes(s.phase)&&s.version>=2){const h=s.hunt,cap=R.CAPS[h.index-1];if(!Number.isInteger(h.index)||!cap||!['plan','quality','years','category','second','result'].includes(h.stage)||h.index!==((s.version===2&&h.result||s.version>=3&&h.absorbed)?c.rings.length:c.rings.length+1))throw Error('猎魂步骤无效');if(h.stage!=='plan'&&!['balanced','offense','guard'].includes(h.plan))throw Error('猎魂倾向无效');if(['years','category','second','result'].includes(h.stage)&&(!Number.isInteger(h.quality)||h.quality<1||h.quality>100||!Number.isInteger(h.low)||!Number.isInteger(h.high)||h.low<10||h.high>cap||h.low>h.high))throw Error('猎魂区间无效');if(['category','second','result'].includes(h.stage)&&(!Number.isInteger(h.years)||h.years<h.low||h.years>h.high))throw Error('猎魂年限无效');}
      if(['hunt','initialHunt'].includes(s.phase)&&s.version>=3){
        const h=s.hunt,allowed=h.index===7?['强化','防御']:R.CATEGORIES;
        if(h.selectedCategory!==undefined&&h.selectedCategory!=='random'&&!allowed.includes(h.selectedCategory)||h.location!==undefined&&!['forest','valley','wetland'].includes(h.location)||h.attempt!==undefined&&(!Number.isInteger(h.attempt)||h.attempt<1||h.attempt>10000))throw Error('猎魂选择无效');
        if(h.result){const r=h.result;if(r.index!==h.index||r.years!==h.years||!Array.isArray(r.skills)||r.skills.length!==(h.years===100000?2:1)||r.skills.some(x=>!allowed.includes(x.category))||r.skills[0].category!==h.category&&!h.absorbed)throw Error('候选魂环无效');}
        if(!h.legacyFloor&&h.years!==undefined&&h.years<R.ringFloor(R.CAPS[h.index-1]))throw Error('候选年限低于保底');
      }
      if(['arrival','battle','ending'].includes(s.phase)&&(s.completed!==c.time.quarters||s.date.year!==6102||s.date.month!==c.time.month||s.date.age!==c.time.age))throw Error('入会时间无效');
      if(c.talent&&(!Number.isInteger(c.talent.rank)||c.talent.rank<1||c.talent.rank>10||c.talent.xpMultiplier!==Creation.TALENTS[c.talent.rank-1].xpMultiplier||c.talent.attributeMultiplier!==Creation.TALENTS[c.talent.rank-1].attributeMultiplier))throw Error('天赋数据无效');
      if(s.growthPlan&&(!Number.isFinite(s.growthPlan.baseXP)||s.growthPlan.baseXP<0||s.growthPlan.baseXP>2000))throw Error('成长路线无效');
      if(s.version>=4){
        if(!Number.isInteger(c.luck)||c.luck<1||c.luck>10||!c.eventFlags||!Array.isArray(c.bones)||!Array.isArray(c.boneInventory)||c.bones.length+c.boneInventory.length>6||!Array.isArray(c.mutations)||c.mutations.length>20)throw Error('培养数据无效');
        if(c.effectiveTier!==undefined&&(!Number.isInteger(c.effectiveTier)||c.effectiveTier<soul.tier||c.effectiveTier>10))throw Error('变异潜力无效');
        const bones=[...c.bones,...c.boneInventory];if(new Set(bones.map(x=>x.slot)).size!==bones.length||bones.some(x=>!['头部','躯干','左臂','右臂','左腿','右腿'].includes(x.slot)||!Array.isArray(x.skills)||x.skills.length))throw Error('魂骨数据无效');
      }
      if(s.version>=5){
        if(!Number.isInteger(c.charm)||c.charm<1||c.charm>10||!Number.isInteger(c.fatigue)||c.fatigue<0||c.fatigue>2||!Array.isArray(s.hiddenRolls)||s.hiddenRolls.length>10000)throw Error('魅力或暗骰数据无效');
        if(s.pending&&(!Number.isInteger(s.pending.bias)||s.pending.bias<1||s.pending.bias>20||!Array.isArray(s.pending.receipts)))throw Error('事件境遇无效');
      }
      R.buildStats({...c,soul});
      if(s.battleSnapshot){const b=s.battleSnapshot;if(!Array.isArray(b.units)||b.units.length<2||b.units.length>4||!Number.isFinite(b.now)||b.now<0||b.now>180000||!Array.isArray(b.log)||b.log.length>1500)throw Error('战斗存档无效');for(const u of b.units){if(!u.model?.derived||!Array.isArray(u.skills)||u.skills.length>18||![0,1].includes(u.team))throw Error('战斗角色无效');for(const [v,max]of [['hp','HP'],['mp','MP'],['sh','SH']])if(!Number.isFinite(u[v])||u[v]<0||u[v]>u.model.derived[max])throw Error('战斗资源无效');}}
      return true;
    }
  }
  const api={Campaign,TRAINING,EVENTS,Creation};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WitnessCampaign=api;
})(typeof globalThis==='undefined'?this:globalThis);
