// Generated from systems/. Edit the corresponding module, then run _sync_systems.py.
(function(){
// CampaignCore: definitive 10.05 behavior, no prototype replacement.
const CampaignCore=(function(root){
'use strict';
const R=typeof module!=='undefined'&&module.exports?require('./rules.js'):root.WitnessRules;
const Creation=typeof module!=='undefined'&&module.exports?require('./campaign-creation.js'):root.WitnessCreation;
const D=typeof module!=='undefined'&&module.exports?require('./core.js'):root.WitnessDice;
const EventData=typeof module!=='undefined'&&module.exports?require('./campaign-events.js'):root.WitnessEvents;
const Achievements=typeof module!=='undefined'&&module.exports?require('./achievements.js'):root.WitnessAchievements;
const CatalogRevision=typeof module!=='undefined'&&module.exports?require('./systems/catalog/revision.js'):root.WitnessCatalogRevision;
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

class Campaign {constructor(catalog,{snapshot=null,seed='见证者',name='',gender='随机',tier=null,level=null,staged=true}={}){
      this.catalog=catalog;
      if(!Creation.allowedName(name))throw Error('这个姓名暂不能使用，请换一个。');
      if(snapshot){
        snapshot=CatalogRevision?.migrate(snapshot,catalog,Creation)||snapshot;Campaign.validate(snapshot,catalog);this.state=copy(snapshot);Achievements.migrateIdentity(this.state);this.rng=new D.DiceEngine(this.state.seed,this.state.rngState);
        if(this.state.phase==='creation'){const draft=new Creation.Draft(catalog,{snapshot:this.state.draft});this.state.draft=draft.snapshot();this.rng=draft.rng;this.state.rngState=this.rng.state;this.state.hiddenRolls=copy(draft.state.hiddenRolls);this.state.version=8;}else this.upgrade();if(this.state.phase==='battle'&&(this.state.result?.winner===null||this.state.battleSnapshot?.result?.tieBreak&&this.state.battleSnapshot.drawRulesVersion!==2))this.state.resultHandled=false;this.refresh();return;
      }
      if(staged){const draft=new Creation.Draft(catalog,{seed,name,gender,tier,level});this.rng=draft.rng;this.state={version:8,catalogRulesVersion:1,seed:String(seed),rngState:this.rng.state,phase:'creation',draft:draft.snapshot(),character:null,rolls:[],hiddenRolls:copy(draft.state.hiddenRolls),journal:[],completed:0,xp:0,prep:0,lastEvent:null,pending:null,hunt:null,battleSnapshot:null,battleOptions:null,result:null,attempts:0,resultHandled:false,date:null,characterId:Achievements.newId(),source:level===null?'formal':'test'};return;}
      this.rng=new D.DiceEngine(seed);this.state={version:1,catalogRulesVersion:1,seed:String(seed),rngState:this.rng.state,phase:'review',rolls:[],journal:[],completed:0,xp:0,prep:0,lastEvent:null,pending:null,hunt:null,battleSnapshot:null,battleOptions:null,result:null,attempts:0,resultHandled:false};
      const s=this.state;s.characterId=Achievements.newId();s.source='test';
      const month=[1,4,7,10][this.draw(4,'入会季节')-1],age=this.draw(9,'入会年龄')+9,rawSpan=this.draw(6,'回忆跨度'),span=Math.min(rawSpan,age-6);
      const actualTier=tier===null?D.tierFor(this.draw(1000,'武魂档位')):Number(tier);
      if(!Number.isInteger(actualTier)||actualTier<1||actualTier>10)throw Error('武魂档位须为1—10');
      const soulPool=catalog.filter(c=>c.tier===actualTier),soul=soulPool[this.draw(soulPool.length,'武魂候选')-1];
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
    }}
const upgrade=function(){
      const s=this.state,c=s.character;if(!c)return;this.ensureStoryState();
      c.talent=copy(Creation.TALENTS[(c.talent?.rank||1)-1]);if(!c.identity.originRank)c.identity.originRank=3;
      if(!s.growthPlan){const remaining=Math.max(1,c.time.quarters-s.completed);s.growthPlan={target:41,baseXP:Math.ceil(Math.max(50,(Math.max(0,41-c.level)*100-s.xp)/remaining)*100)/100,createdAt:s.completed};}
      if(s.phase==='battle'&&s.battleSnapshot&&(![1005,1007].includes(s.battleSnapshot.tacticsRulesVersion)||s.battleSnapshot.playerRulesVersion!==2||s.battleSnapshot.version!==10||![13,14,15,16,17].includes(s.battleSnapshot.combatRulesVersion)||s.battleSnapshot.soulControlVersion!==11)){s.legacyBattleReport=copy(s.battleSnapshot);s.battleSnapshot=null;s.battleOptions=null;s.result=null;s.resultHandled=false;s.phase='arrival';}
      if(s.hunt&&!s.hunt.stage){const h=s.hunt;if(h.result){h.stage='result';h.plan=h.result.plan||'balanced';h.quality=h.result.quality||50;h.low=h.high=h.years=h.result.years;}else h.stage='plan';h.initial=false;}if(s.version<3&&s.hunt){const h=s.hunt;h.selectedCategory='random';h.location='forest';h.attempt=1;h.legacyFloor=true;h.absorbed=!!h.result;}if(s.version<4){if(s.pending)s.pending.legacyEvent=true;s.eventHistory={};s.failureStreak=0;}c.luck=c.luck||5;c.eventFlags=c.eventFlags||{};c.bones=c.bones||[];c.boneInventory=c.boneInventory||[];c.mutations=c.mutations||[];s.eventHistory=s.eventHistory||{};c.charm=c.charm||5;c.fatigue=c.fatigue||0;this.freezeFortune();s.hiddenRolls=s.hiddenRolls||[];if(s.pending){s.pending.bias=s.pending.bias||10;s.pending.receipts=s.pending.receipts||[];}s.version=8;
    };

const freezeFortune=function(){
      const s=this.state,c=s.character;if(!c)return;
      for(const [key,initial]of [['charm','initialCharm'],['luck','initialLuck']]){
        const recorded=s.rolls?.find(r=>r.key===key)?.value??s.draft?.results?.[key];
        if(!Number.isInteger(c[initial])||c[initial]<1||c[initial]>10)c[initial]=Number.isInteger(recorded)&&recorded>=1&&recorded<=10?recorded:c[key];
        c[key]=c[initial];
      }
      const clean=p=>{if(!p)return;if(p.receipts)p.receipts=p.receipts.filter(x=>!['CHARM','LUCK'].includes(x.key)&&!['charm','luck'].includes(x.kind));for(const field of ['reward','rewards'])if(Array.isArray(p[field]))p[field]=p[field].filter(x=>!/^魅力\s.*→|^气运\s.*→/.test(x));};
      clean(s.pending);for(const entry of s.journal||[])clean(entry);
      if(s.pending?.eventSnapshot?.options)for(const o of s.pending.eventSnapshot.options){delete o.gain?.CHARM;delete o.gain?.LUCK;}
    };

const creation=function(){if(this.state.phase!=='creation')throw Error('开局投骰已经完成');return new Creation.Draft(this.catalog,{snapshot:this.state.draft});};

const acknowledgeAwakening=function(){if(!this.state.awakeningPending)throw Error("武魂已揭晓");this.state.awakeningPending=false;this.sync();};

const rollCreation=function(){if(this.state.awakeningPending)throw Error("请先确认觉醒的武魂");const draft=this.creation(),wasAwake=!!draft.soul(),roll=draft.roll();if(!wasAwake&&draft.soul())this.state.awakeningPending=true;this.rng=draft.rng;this.state.draft=draft.snapshot();this.state.rolls=copy(draft.state.rolls);this.state.hiddenRolls=copy(draft.state.hiddenRolls);
      if(draft.done()){const c=draft.character();this.state.character=c;this.state.date={year:c.time.startYear,month:c.time.month,age:c.time.startAge};this.state.phase='review';this.upgrade();this.refresh();}this.sync();return roll;
    };

const soul=function(){const c=this.state.character,base=this.catalog.find(x=>x.id===c?.soulId);const active=base?{...base,...(c.catalogSoulOverride||{}),id:base.id,name:base.name}:base;return active&&c?.effectiveTier?{...active,tier:c.effectiveTier,name:c.mutationName||active.name}:active;};

const growthRates=function(){const c=this.state.character;if(!c)return null;return Creation.cultivationRates({rank:c.talent?.rank||1,tier:this.soul().tier,initialLevel:c.initialLevel,stages:c.time.quarters});};

const draw=function(sides,label){const face=sides===1?1:this.rng.die(sides);this.state.rolls.push({label,sides,face,quarter:this.state.completed});this.sync();return face;};

const dark=function(sides,label){const face=sides===1?1:this.rng.die(sides);this.state.hiddenRolls.push({sides,face,label,quarter:this.state.completed});this.sync();return face;};

const sync=function(){this.state.rngState=this.rng.state;};

const refresh=function(){
      const c=this.state.character,soul=this.soul();if(!c)return;this.freezeFortune();c.stats=R.buildStats({...c,soul});
      for(const ring of [...c.rings,...(this.state.hunt?.result&&!this.state.hunt.absorbed?[this.state.hunt.result]:[])])ring.skills=ring.skills.map((skill,i)=>({...R.makeSkill({soul,style:c.style,stats:c.stats,index:ring.index,years:ring.years,category:skill.category,effectVariant:skill.effectVariant,attackSubtype:skill.attackSubtype,generationVersion:skill.generationVersion,damageMode:skill.damageMode||(skill.category==='持续伤害'?'periodic':'direct'),variant:i,effects:skill.effects,effectSeed:skill.effectSeed||this.state.seed+'|'+ring.index+'|'+i}),name:skill.name}));
    };

const review=function({name,style,release=this.state.character.release}){
      if(this.state.phase!=='review')throw Error('人物已进入旅程');const c=this.state.character,soul=this.soul();
      if(!Creation.allowedName(name))throw Error('这个姓名暂不能使用，请换一个。');
      if(!R.mainStyles(soul).includes(style)||!soul.release_options.includes(release))throw Error('不符合该武魂的战斗方式');
      c.name=String(name).trim().slice(0,40)||c.name;c.style=style;c.release=release||c.release;this.refresh();
    };

const begin=function(){
      if(this.state.phase!=='review')throw Error('旅程已经开始');const s=this.state,c=s.character;
      s.journal.push({type:'origin',date:copy(s.date),title:'出发前',text:`${c.name}从${c.identity.origin}出发，${c.identity.family}的经历与${c.talent.label}一起成为起点。随身带着${c.identity.keepsake||'自己的记忆'}，想要${c.identity.motivation}。`,level:c.level});
      if(R.benchmark(c.level).rings>0){s.phase='initialHunt';s.hunt={index:1,prep:0,result:null,stage:'plan',initial:true};}else s.phase='prologue';this.sync();
    };

const startGrowth=function(){if(this.state.phase!=='prologue')throw Error('当前不能开始成长');this.state.phase='growth';};

const event=function(){return this.state.pending?.legacyEvent?LEGACY_EVENTS[this.state.pending.eventIndex]:(this.state.pending?.eventSnapshot||EVENTS[this.state.pending?.eventIndex]);};

const matchesEvent=function(event){
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
    };

const elapsedMonths=function(completed=this.state.completed){const t=this.state.character.time;return t.timelineMode==='stages'?Math.floor(completed*t.span*12/t.quarters):completed*3;};

const periodMonths=function(){return this.elapsedMonths(this.state.completed+1)-this.elapsedMonths();};

const startQuarter=function(training){
      const s=this.state;if(s.phase!=='growth'||!TRAINING[training])throw Error('请先选择当前季度的训练方向');
      const next=this.nextQuestEvent();
      if(next){this.draw(1,'任务续篇');s.rolls.at(-1).text=next.event.title;this.openStoryEvent(next,training);return;}
      const reserved=this.questReserved(),eligible=event=>event.id!=='E02'&&!event.chainOnly&&!reserved.has(event.id)&&this.matchesEvent(event);
      let choices=EVENTS.map((event,index)=>({event,index})).filter(x=>!x.event.reserve&&eligible(x.event)&&x.index!==s.lastEvent);
      if(!choices.length)choices=EVENTS.map((event,index)=>({event,index})).filter(x=>x.event.reserve&&eligible(x.event));if(!choices.length)throw Error('本轮故事已全部经历，请保存旅程后更新事件库');
      if(s.failureStreak>=2){const gentle=choices.filter(x=>x.event.options[0].base>=83&&!x.event.options.some(o=>['family','mutation'].includes(o.special)));if(gentle.length)choices=gentle;}
      const weights=choices.map(x=>x.event.weight*(x.event.id==='E02'?1:1+(s.character.luck-5)*.025));
      const total=weights.reduce((a,b)=>a+b,0),face=this.draw(10000,'本季相遇'),point=(face-1)/10000*total;
      let sum=0,selected=choices.at(-1);for(let i=0;i<choices.length;i++){sum+=weights[i];if(point<sum){selected=choices[i];break;}}
      // v12: bone absorption/replacement never reserves a cultivation event.
      if(s.trialFirstEvent&&s.source==='test'){const trial=choices.find(x=>x.event.id===s.trialFirstEvent);if(trial)selected=trial;delete s.trialFirstEvent;}
      s.rolls.at(-1).text=selected.event.title;this.openStoryEvent(selected,training);
    };

const eventConditions=function(event=this.event()){
      if(!event||this.state.pending?.legacyEvent)return [];const w=event.when,c=this.state.character,flags=c.eventFlags,tags=[];
      const names={guide:'向导',mentor:'师承',friend:'同行',boneLead:'魂骨',prepared:'共鸣准备',exiled:'离家',reconcile:'家门往来'};
      if(w.flag)tags.push('线索·'+(names[w.flag]||w.flag));
      if(w.flagsAny)for(const f of w.flagsAny)if(flags[f])tags.push('线索·'+(names[f]||f));
      if(w.bone)tags.push('持有待融合魂骨');if(w.mutated)tags.push('经历武魂变异');if(w.prepMin)tags.push('猎魂准备≥'+w.prepMin);
      const range=(key,label)=>{if(w[key+'Min']!==undefined||w[key+'Max']!==undefined)tags.push(label+' '+(w[key+'Min']??1)+'—'+(w[key+'Max']??(key==='level'?99:10))+(key==='level'?'级':'档'));};
      for(const [key,label]of [['origin','出身'],['tier','武魂潜力'],['luck','气运'],['charm','魅力'],['level','魂力']])range(key,label);
      if(w.elements)tags.push('武魂属性·'+w.elements.filter(x=>this.soul().elements.includes(x)).join('/'));
      if(w.elementsAll)tags.push('武魂属性·'+w.elementsAll.join('/'));if(w.mechanisms)tags.push('特殊属性·'+w.mechanisms.filter(x=>this.soul().mechanisms.includes(x)).join('/'));
      if(w.kind)tags.push(w.kind+'武魂');if(w.compound)tags.push('复合属性');if(w.mental)tags.push('精神专长');if(w.plant)tags.push('植物武魂');if(w.noElement)tags.push('无元素武魂');
      if(w.locations)tags.push('成长地·'+c.identity.origin);if(w.styles)tags.push(c.style+'系');if(w.late)tags.push('旅途后半程');
      for(const [key,op]of [['aptitude','≥'],['aptitudeLow','≤']])if(w[key]){const a=w[key];for(const k of a.keys){const v=k==='W'?c.wDeviation:c.deviations[R.KEYS.indexOf(k)],n=a.min??a.max;if(op==='≥'?v>=n:v<=n)tags.push(R.LABELS[k]+'先天偏差'+op+n+(k==='W'?'点':'%'));}}
      return [...new Set(tags)];
    };

const ensurePromotionState=function(fromRating){
      const s=this.state,order=['纸级','并级','强级','凶级','狂级','神级'];
      if(s.promotionState?.version!==1||s.promotionState.ratingRulesVersion!==R.ratingRulesVersion){
        const previous=s.promotionState;
        let highest=Math.max(0,order.indexOf(fromRating||R.rating(s.character.stats).label));
        for(const j of s.journal||[])for(const [stats,level]of [[j.before,j.beforeLevel],[j.after,j.afterLevel]]){
          if(stats&&Number.isInteger(level))highest=Math.max(highest,order.indexOf(R.rating({stats,level}).label));
        }
        const acknowledged=Object.fromEntries(Object.entries(previous?.acknowledged||{}).filter(([key])=>!key.startsWith('grade:')));
        if(previous){for(let i=1;i<=highest;i++)acknowledged['grade:'+i]=true;s.promotions=(s.promotions||[]).filter(p=>!p.ratingUp);s.ratingMigration={version:R.ratingRulesVersion,previousHighestIndex:previous.highestRatingIndex,recomputedHighestIndex:highest,atLevel:s.character.level};}
        s.promotionState={version:1,ratingRulesVersion:R.ratingRulesVersion,highestRatingIndex:highest,acknowledged};
      }
      const progress=s.promotionState,seen=new Set();
      s.promotions=(s.promotions||[]).filter(p=>{
        p.id=p.id||(p.ratingUp?'grade:'+order.indexOf(p.toRating):'level:'+p.toLevel);
        if(seen.has(p.id)||progress.acknowledged[p.id])return false;seen.add(p.id);return true;
      });
      return progress;
    };

const currentPromotion=function(){if(!this.state.character)return null;this.ensurePromotionState();return this.state.promotions[0]||null;};

const ratingSettled=function(){return !this.state.character||this.state.character.level>=99||this.state.xp<99.995;};

const recordPromotion=function(fromLevel,fromRating){
      const s=this.state,c=s.character,order=['纸级','并级','强级','凶级','狂级','神级'],toRating=this.ratingSettled()?R.rating(c.stats).label:fromRating||R.rating(c.stats).label;
      const progress=this.ensurePromotionState(fromRating),index=order.indexOf(toRating),highest=progress.highestRatingIndex;
      const ratingUp=this.ratingSettled()&&index>highest;if(ratingUp)progress.highestRatingIndex=index;
      if(c.level<=fromLevel&&!ratingUp)return;
      const id=ratingUp?'grade:'+index:'level:'+c.level;
      if(progress.acknowledged[id]||s.promotions.some(p=>p.id===id))return;
      const previous=s.promotions.at(-1);
      if(!ratingUp&&previous&&!previous.ratingUp&&previous.toLevel===fromLevel){
        previous.toLevel=c.level;previous.toRating=toRating;previous.id=id;return;
      }
      s.promotions.push({id,fromLevel,toLevel:c.level,fromRating:ratingUp?order[highest]:fromRating,toRating,ratingUp});
    };

const acknowledgePromotion=function(id){
      const p=this.currentPromotion();if(!p||id!==undefined&&id!==p.id)return false;
      this.state.promotionState.acknowledged[p.id]=true;this.state.promotions.shift();return true;
    };

const fuseStoredBone=function(){const s=this.state;if(s.phase!=='growth'||!s.character.boneInventory.some(b=>!b.awaitingRingAbsorption))throw Error('当前没有可融合的魂骨');
      const oldLevel=s.character.level,oldRating=R.rating(s.character.stats).label,p={training:'C',receipts:[],reward:[],PStart:s.character.stats.stats.P};
      this.absorbBone(true,false,p);this.refresh();this.recordPromotion(oldLevel,oldRating);s.boneReport=p;this.sync();return {roll:s.rolls.at(-1)};
    };

const eventText=function(){const e=this.event();if(this.state.pending?.legacyEvent)return e[1];if(!this.state.pending?.oldNarrative)return e.text;return e.text+(EventData.biasScene(e,this.state.pending.bias)?'\n\n'+EventData.biasScene(e,this.state.pending.bias):'');};

const eventChance=function(choice){
      const c=this.state.character,event=this.event(),option=event.options[choice],standard=R.benchmark(c.level);
      const keys=option.keys.filter(k=>k!=='H'),ratios=keys.map(k=>k==='W'?c.stats.stats.W/standard.stability:c.stats.stats[k]/standard.base);
      const ability=R.round2(Math.max(-15,Math.min(20,((ratios.length?ratios.reduce((a,b)=>a+b,0)/ratios.length:1)-1)*40)));
      const origin=event.when.originMin?Math.min(8,Math.max(0,c.identity.originRank-event.when.originMin)*2):0;
      const preparation=(c.eventFlags.mentor?3:0)+(c.eventFlags.prepared?5:0)+(option.special==='mutation'?Math.min(5,this.state.prep):0);
      const luck=R.round2((c.luck-5)*1.5),charm=option.keys.includes('H')?(c.charm-5)*3:0;
      const bias=this.state.pending.bias||10,scene=bias===1?-16:bias<=4?-10:bias<=8?-4:bias<=12?0:bias<=16?4:bias<=19?8:12;
      const condition=c.fatigue? -c.fatigue*3:0,chance=R.round2(Math.max(10,Math.min(95,option.base+ability+origin+preparation+luck+charm+scene+condition)));
      return {base:option.base,ability,origin,preparation,luck,charm,scene,condition,chance};
    };

const eventEstimate=function(choice){
      if(this.state.pending?.legacyEvent)return null;
      const sim=Object.create(Campaign.prototype);sim.catalog=this.catalog;sim.state=copy(this.state);
      let total=0;for(let bias=1;bias<=20;bias++){sim.state.pending.bias=bias;total+=sim.eventChance(choice).chance;}return Math.round(total/20);
    };

const receipt=function(p,kind,label,amount=null,from=null,to=null,unit='',key=label){
      if(!p.receipts)p.receipts=[];
      p.receipts.push({kind,label,key,amount,from,to,unit,context:p.rewardContext||'event'});
    };

const prepareEvent=function(choice){const p=this.state.pending;if(this.state.phase!=='event'||p.settled||![0,1].includes(choice))throw Error('本次选择无效');p.choice=choice;};

const reward=function(key,amount,p){
      const s=this.state,c=s.character;
      if(amount>0&&R.KEYS.includes(key))amount=R.round2(amount*3);
      if(amount>0&&R.KEYS.includes(key)&&p.rewardContext!=='season')amount=R.round2(amount*1.08);
      if(key==='XP'){if(p.rewardContext!=='season')amount=R.round2(amount*Creation.CULTIVATION.eventMultiplier);const from=s.xp;s.xp=R.round2(s.xp+amount);this.receipt(p,'xp','修炼进度',R.round2(amount),from,s.xp,'点','XP');p.reward.push(`${amount}点修炼进度`);return;}
      if(key==='PREP'){if(c.level>=90){this.reward('P',2,p);return;}const before=s.prep;s.prep=Math.min(10,s.prep+Math.max(0,Math.round(amount)));this.receipt(p,'prep','猎魂准备',s.prep-before,before,s.prep,'点','PREP');p.reward.push(`猎魂准备 ${before}→${s.prep}`);return;}
      if(key==='CHARM'||key==='LUCK'){this.freezeFortune();return;}
      if(key==='TRAIN'){this.reward(p.training,amount,p);return;}
      if(key==='CHANCE'){const roll=this.draw(100,'身法挑战');this.reward('A',roll<=70?4:1,p);p.reward.push(roll<=70?'挑战成功':'挑战未完成，但有所收获');return;}
      if(key==='NONE'){p.reward.push('本次认真休养，长期训练收益保留');return;}
      let actual=amount*(c.talent?.attributeMultiplier||1);if(key==='C')actual*=1+Math.min(1.5,p.PStart/200);if(key==='P'&&this.soul().spirit_specialist)actual*=1.25;
      const before=c.growth[key];c.growth[key]=R.round2(c.growth[key]+actual);this.receipt(p,'attribute',R.LABELS[key]+'训练',R.round2(actual),before,c.growth[key],'点',key);p.reward.push(`${R.LABELS[key]}训练积累 +${R.round2(actual)}`);
    };

const chooseEvent=function(choice=this.state.pending?.choice){
      const s=this.state,p=s.pending,c=s.character;
      if(s.phase!=='event'||!p||p.settled||![0,1].includes(choice))throw Error('本季度事件已经结算');
      p.choice=choice;p.settled=true;p.receipts=[];this.grantPeriodGrowth(p);
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
      this.settleQuest(p);this.refresh();this.recordPromotion(c.level,p.beforeRating||R.rating(c.stats).label);s.phase='eventResult';this.sync();return {roll:p.outcome.roll};
    };

const resolveEventBranch=function(option,success,excellent,p){
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
    };

const previewEvent=function(choice){
      const state=this.state,pending=state.pending,event=this.event();
      if(state.phase!=='event'||pending.settled||![0,1].includes(choice))throw Error('当前不能查看分支');
      // No constructor, live dice, storage or promotion hooks run in this sandbox.
      const simulate=(success,bias,excellent,mode)=>{
        const sim=Object.create(Campaign.prototype);sim.catalog=this.catalog;sim.state=copy(state);
        sim.rng=new D.DiceEngine(state.seed,state.rngState);
        sim.draw=(sides,label)=>{const face=mode==='max'?sides:mode==='miss'&&/变异/.test(label)?sides:1;sim.state.rolls.push({label,sides,face});return face;};
        const p=sim.state.pending;p.bias=bias;p.choice=choice;p.receipts=[];p.reward=[];p.outcome={text:'',success};sim.grantPeriodGrowth(p);
        if(p.legacyEvent){const o=event[choice+2];sim.reward(o[1],o[2],p);}else sim.resolveEventBranch(event.options[choice],success,excellent,p);sim.settleQuest(p);
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
    };

const settleBias=function(success,p,option){
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
    };

const specialEvent=function(type,success,excellent,p){
      const c=this.state.character,flags=c.eventFlags;
      if(type==='family'){
        if(success){flags.mentor=true;this.grantBone(p);}
        else if(p.choice===1){flags.exiled=true;p.reward.push('离开家门；保留历史出身与已有能力，仍有人愿意援助你');}
        else{flags.mentor=true;p.reward.push('获得独立求学的介绍，不失去已有成长');}
      }else if(type==='bone'){if(success)this.grantBone(p);else flags.boneLead=true;}
      else if(type==='mutation')this.absorbBone(success,excellent,p);
      else if(success){const known=!!flags[type];flags[type]=true;this.receipt(p,type==='boneLead'?'clue':'relationship',{mentor:'师承',guide:'向导',friend:'同行',boneLead:'魂骨线索',prepared:'共鸣准备',reconcile:'家门往来'}[type]||'后续线索',null,null,null,known?'关系加深':'新联系');p.reward.push({mentor:'师长关系建立',guide:'向导关系建立',friend:'同行关系建立',boneLead:'获得魂骨来源或适配线索',prepared:'共鸣引导准备完成',reconcile:'与家门建立新的往来'}[type]||'留下后续线索');}
    };

const grantBone=function(p){
      const c=this.state.character,slots=['头部','躯干','左臂','右臂','左腿','右腿'];
      const available=slots.filter(slot=>![...c.bones,...c.boneInventory].some(x=>x.slot===slot));
      if(!available.length){p.reward.push('常规魂骨部位已全部有所安排，赠礼改为修炼指导');this.reward('XP',25,p);return;}
      const slot=available[this.draw(available.length,'魂骨部位')-1],soul=this.soul();
      const affinity=soul.elements[0]||soul.mechanisms[0]||'通用';
      const bone={id:'bone-'+this.state.completed+'-'+slot,slot,name:affinity+'共鸣'+slot+'骨',affinity,years:1000,skills:[],source:this.event().title,absorbed:false};
      c.boneInventory.push(bone);this.receipt(p,'bone',bone.name,null,null,null,'待融合 · 魂骨技留空');p.reward.push('获得 '+bone.name+'（待融合；魂骨技留空）');
      // 季度故事整局只出现一次；之后的魂骨可从成长页独立融合。
    };

const absorbBone=function(success,excellent,p){
      const c=this.state.character,index=c.boneInventory.findIndex(b=>!b.awaitingRingAbsorption);if(index<0)return;const bone=c.boneInventory.splice(index,1)[0];
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
      const base=this.catalog.find(x=>x.id===c.soulId);c.effectiveTier=newTier;c.mutationName=base.name;
      this.receipt(p,'mutation','武魂潜力',newTier-tier,tier,newTier,'档','potential');
      c.mutations.push({before:tier,after:newTier,boneId:bone.id,quarter:this.state.completed+1});
      p.reward.push(`武魂潜力 ${tier}→${newTier}档！${c.mutationName}`);
    };

const finishEvent=function(){if(this.state.phase!=='eventResult'||!this.state.pending?.settled)throw Error('请先完成事件');this.continueProgress();this.sync();};

const continueProgress=function(){
      const s=this.state,c=s.character;
      while(s.xp>=99.995&&c.level<99){s.xp=Math.max(0,R.round2(s.xp-100));const oldLevel=c.level,oldRating=R.rating(c.stats).label;c.level++;this.refresh();this.recordPromotion(oldLevel,oldRating);
        if(c.level%10===1&&c.rings.length<R.benchmark(c.level).rings){s.hunt={index:c.rings.length+1,prep:s.prep,result:null,stage:'plan',initial:false};s.phase='hunt';return;}
      }
      if(c.level===99)s.xp=Math.min(s.xp,99.99);
      this.finishQuarter();
    };

const generateRing=function(index,plan='balanced',prep=0,targetCount=null){
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
        const roll=this.draw(weights.reduce((a,b)=>a+b,0),'第'+index+'环魂技类别');let total=0;category=R.CATEGORIES[weights.findIndex(w=>(total+=w)>=roll)];
      }
      if(category==='治疗')category='强化';
      let guarantee='';
      const needs=['强攻','敏攻'].includes(c.style)||(soul.spirit_specialist&&c.style==='控制');
      const has=c.rings.some(r=>r.skills.some(s=>['攻击','持续伤害'].includes(s.category)));
      const last=targetCount===null?index:Math.min(targetCount,6);
      if(index===last&&index!==7&&needs&&!has&&!['攻击','持续伤害'].includes(category)){category='攻击';guarantee='初次攻击魂技保底';}

      const serial=this.state.skillGenerationSerial=(this.state.skillGenerationSerial||0)+1;const skills=[R.makeSkill({soul,style:c.style,stats:c.stats,index,years,category,effectSeed:this.state.seed+'|'+index+'|'+serial+'|0'})];
      if(years===100000){let second=R.pickCategory(c.style,this.draw(100,'十万年第二魂技'));if(second==='治疗')second='强化';if(second===category)second=this.huntCategories(index).find(x=>x!==category);skills.push(R.makeSkill({soul,style:c.style,stats:c.stats,index,years,category:second,variant:1,effectSeed:this.state.seed+'|'+index+'|'+serial+'|1'}));guarantee+='；同环两技共享冷却';}
      return {index,years,cap,quality,plan,band:R.BANDS[R.band(years)],q:R.QS[R.band(years)],skills,guarantee,acquiredAt:copy(this.state.date)};
    };

const huntCategories=function(index=this.state.hunt?.index){return index===7?['强化','防御']:R.CATEGORIES.filter(x=>!['治疗','回蓝','持续伤害'].includes(x));};

const huntPlan=function(plan='balanced',category='random',location='forest'){
      const s=this.state,h=s.hunt;
      if(!['hunt','initialHunt'].includes(s.phase)||!h||h.stage!=='plan'||!['balanced','offense','guard'].includes(plan)||!['forest','valley','wetland'].includes(location)||category!=='random'&&!this.huntCategories(h.index).includes(category))throw Error('请先选择魂技类别与猎魂路线');
      Object.assign(h,{plan,selectedCategory:category,location,attempt:h.attempt||1,absorbed:false});h.stage='quality';this.sync();
    };

const huntStep=function(){
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
    };

const chooseSecond=function(category){
      const h=this.state.hunt;
      if(!['hunt','initialHunt'].includes(this.state.phase)||!h||h.stage!=='second'||!this.huntCategories(h.index).includes(category)||category===h.category)throw Error('请选择不同的第二魂技类别');
      h.secondCategory=category;this.prepareHuntCandidate();this.sync();
    };

const prepareHuntCandidate=function(){
      const s=this.state,h=s.hunt,c=s.character,soul=this.soul();
      const previewStats=R.buildStats({...c,soul});
      const skills=[R.makeSkill({soul,style:c.style,stats:previewStats,index:h.index,years:h.years,category:h.category,effectSeed:s.seed+'|hunt|'+h.index+'|'+(h.attempt||1)+'|0'})];
      if(h.secondCategory)skills.push(R.makeSkill({soul,style:c.style,stats:previewStats,index:h.index,years:h.years,category:h.secondCategory,variant:1,effectSeed:s.seed+'|hunt|'+h.index+'|'+(h.attempt||1)+'|1'}));
      h.category=skills[0].category;if(skills[1])h.secondCategory=skills[1].category;
      h.result={index:h.index,years:h.years,cap:R.CAPS[h.index-1],quality:h.quality,plan:h.plan,location:h.location,band:R.BANDS[R.band(h.years)],q:R.QS[R.band(h.years)],skills,guarantee:h.secondCategory?'同环两技共享冷却':'',acquiredAt:copy(s.date)};
      h.stage='result';h.absorbed=false;
    };

const abandonHunt=function(){
      const s=this.state,h=s.hunt;
      if(!['hunt','initialHunt'].includes(s.phase)||!h?.result||h.absorbed)throw Error('只能放弃尚未吸收的候选魂环');
      s.rolls.push({label:'放弃第'+h.index+'环候选',sides:1,face:1,text:h.years+'年 · '+h.result.skills.map(x=>x.category).join(' / '),quarter:s.completed});
      s.hunt={index:h.index,prep:h.prep,result:null,stage:'plan',initial:h.initial,attempt:(h.attempt||1)+1,selectedCategory:h.selectedCategory,location:h.location,absorbed:false};this.sync();
    };

const hunt=function(plan='balanced',category='random'){
      if(this.state.hunt.stage==='plan')this.huntPlan(plan,category);
      while(!this.state.hunt.result)this.huntStep();return this.state.hunt.result;
    };

const finishHunt=function(){
      const s=this.state,h=s.hunt;
      if(!['hunt','initialHunt'].includes(s.phase)||!h?.result)throw Error('先取得候选魂环');
      if(!h.absorbed){
        if(h.index!==s.character.rings.length+1)throw Error('魂环位置已经变化');
        s.character.rings.push(copy(h.result));h.absorbed=true;if(!h.initial)s.prep=0;this.refresh();
      }
      if(h.initial){if(s.character.rings.length<R.benchmark(s.character.level).rings)s.hunt={index:s.character.rings.length+1,prep:0,result:null,stage:'plan',initial:true};else{s.hunt=null;s.phase='prologue';}}
      else{s.hunt=null;this.continueProgress();}this.sync();
    };

const finishQuarter=function(){
      const s=this.state,p=s.pending,c=s.character;if(!p||!p.settled)throw Error('季度尚未结算');
      const event=this.event(),option=p.legacyEvent?event[p.choice+2]:event.options[p.choice];
      s.journal.push({type:'quarter',date:p.date,quarter:s.completed+1,eventId:p.legacyEvent?null:event.id,triggerTags:copy(p.triggerTags||[]),title:p.legacyEvent?event[0]:event.title,text:this.eventText(),training:TRAINING[p.training],choice:p.legacyEvent?option[0]:option.text,outcome:copy(p.outcome||null),receipts:copy(p.receipts||[]),rewards:p.reward,beforeLevel:p.beforeLevel,afterLevel:c.level,before:p.before,after:copy(c.stats.stats),newRings:c.rings.slice(p.ringCount).map(r=>({index:r.index,years:r.years}))});
      if(c.fatigue>0)c.fatigue--;
      s.completed++;const absolute=c.time.startYear*12+c.time.month-1+this.elapsedMonths();s.date={year:Math.floor(absolute/12),month:absolute%12+1,age:c.time.startAge+Math.floor(this.elapsedMonths()/12)};
      s.pending=null;s.phase=s.completed===c.time.quarters?'arrival':'growth';
      if(s.phase==='arrival'){s.journal.push({type:'arrival',date:copy(s.date),title:'晨曦城',text:`在6102年${c.time.month}月，${c.name}终于看见见证者公会的门。这里可能会成为新的家。`,level:c.level});}
    };

const battleOptions=function(enemyId,difficulty='admission',withSupport=false){
      const s=this.state;if(s.phase!=='arrival')throw Error('尚未抵达公会');
      // 考核到期须登台，保留玩家实际修为。
      // 到达考核日期即上场，魂环尚未齐全也可参加。
      this.refresh();s.phase='battle';s.result=null;s.resultHandled=false;s.attempts++;s.battleSnapshot=null;
      const options={character:copy(s.character),soul:copy(this.soul()),enemyId,difficulty,withSupport,seed:s.seed+'-转正战-'+enemyId+'-'+difficulty};
      s.battleOptions=copy(options);return options;
    };

const observeBattle=function(battle){
      const s=this.state;if(s.phase!=='battle')return false;s.battleSnapshot=battle.snapshot();
      if(battle.result&&!s.resultHandled){
        if(battle.result.winner!==0){s.examDefeats||=[];const attempt=s.battleOptions?.examAttempt||s.attempts;if(!s.examDefeats.includes(attempt))s.examDefeats.push(attempt);}
        s.resultHandled=true;s.result=copy(battle.result);
        if(battle.result.winner===0){s.phase='ending';s.journal.push({type:'ending',date:copy(s.date),title:'见证者会徽',text:`转正战结束，${s.character.name}得到正式登记。会徽与终端递到手中：欢迎回家。`,level:s.character.level});return true;}
        return true;
      }return false;
    };

const returnArrival=function(){if(this.state.phase!=='battle'||!this.state.result)throw Error('当前战斗尚未结束');this.state.phase='arrival';this.state.battleSnapshot=null;this.state.result=null;this.state.resultHandled=false;};

const static_validate=function(s,catalog){
      if(!s||![1,2,3,4,5,6,7,8].includes(s.version)||typeof s.seed!=='string'||s.seed.length>120||!['creation','review','initialHunt','prologue','growth','event','eventResult','hunt','arrival','battle','ending','v12Hunt'].includes(s.phase))throw Error('不是可兼容的完整游戏存档');
      if(s.phase==='creation'){if(![2,3,4,5,6,7,8].includes(s.version)||!s.draft||s.character!==null||s.completed!==0)throw Error('开局状态无效');Creation.Draft.validate(s.draft,catalog);if(s.seed!==s.draft.seed||s.rngState!==s.draft.rngState)throw Error('开局骰序无效');return true;}
      const c=s.character;if(!c||typeof c.name!=='string'||c.name.length>40||!Creation.allowedName(c.name)||!Number.isInteger(c.level)||c.level<0||c.level>99)throw Error('人设数据无效');
      const found=catalog.find(x=>x.id===c.soulId),soul=found?{...found,...(c.catalogSoulOverride||{})}:null;if(!soul||!R.mainStyles(soul).includes(c.style)||!soul.release_options.includes(c.release))throw Error('武魂数据不兼容');
      if(!Number.isInteger(s.rngState)||!Number.isInteger(s.completed)||s.completed<0||!Number.isInteger(c.time?.quarters)||s.completed>c.time.quarters||c.time.quarters<4||c.time.quarters>24||c.time.age<10||c.time.age>40||c.time.startAge<6)throw Error('时间数据无效');
      if(c.time.timelineMode==='stages'&&(c.time.startAge!==6||c.time.age<16||c.time.age>40||c.time.span!==c.time.age-6||c.time.quarters!==24))throw Error('新旅程时间数据无效');
      if(!Array.isArray(s.rolls)||s.rolls.length>10000||!Array.isArray(s.journal)||s.journal.length>160||!Array.isArray(c.rings)||c.rings.length>9)throw Error('记录超出范围');
      if(!Number.isFinite(s.xp)||s.xp<0||s.xp>20000||!Number.isInteger(s.prep)||s.prep<0||s.prep>10)throw Error('成长数据无效');
      for(const key of [...R.KEYS,'W'])if(!Number.isFinite(c.growth?.[key])||c.growth[key]<0||c.growth[key]>5000)throw Error('能力积累无效');
      c.rings.forEach((r,i)=>{if(r.index!==i+1||!Number.isInteger(r.years)||r.years<10||r.years>R.CAPS[i]||!Array.isArray(r.skills)||r.skills.length<1||r.skills.length>2||r.skills.some(x=>![...R.CATEGORIES,'回蓝'].includes(x.category)))throw Error('魂环数据无效');});
      for(const ring of c.rings)for(const skill of ring.skills)if(skill.effects!==undefined){if(!['强化','减益'].includes(skill.category)||!Array.isArray(skill.effects)||skill.effects.length<1||skill.effects.length>3||new Set(skill.effects.map(e=>e.key)).size!==skill.effects.length||skill.effects.some(e=>!R.KEYS.includes(e.key)||!Number.isFinite(e.value)||e.value<=0)||typeof skill.effectSeed!=='string'||skill.effectSeed.length>240)throw Error('多项魂技数据无效');}
      if(['event','eventResult'].includes(s.phase)&&(!s.pending||!Number.isInteger(s.pending.eventIndex)||s.pending.eventIndex<0||s.pending.eventIndex>=(s.version<4||s.pending.legacyEvent?24:EVENTS.length)||s.phase==='event'&&s.pending.settled||s.phase==='eventResult'&&!s.pending.settled||!TRAINING[s.pending.training]))throw Error('事件状态无效');
      if(s.phase==='initialHunt'&&(!s.hunt?.initial||s.completed!==0||s.pending))throw Error('初始魂环状态无效');
      if(s.phase==='hunt'&&(!s.hunt||!s.pending?.settled||!TRAINING[s.pending.training]))throw Error('猎魂状态无效');
      if(['hunt','initialHunt'].includes(s.phase)&&s.version>=2){const h=s.hunt,cap=R.CAPS[h.index-1];if(!Number.isInteger(h.index)||!cap||!['plan','quality','years','category','second','result'].includes(h.stage)||h.index!==((s.version===2&&h.result||s.version>=3&&h.absorbed)?c.rings.length:c.rings.length+1))throw Error('猎魂步骤无效');if(h.stage!=='plan'&&!['balanced','offense','guard'].includes(h.plan))throw Error('猎魂倾向无效');if(['years','category','second','result'].includes(h.stage)&&(!Number.isInteger(h.quality)||h.quality<1||h.quality>100||!Number.isInteger(h.low)||!Number.isInteger(h.high)||h.low<10||h.high>cap||h.low>h.high))throw Error('猎魂区间无效');if(['category','second','result'].includes(h.stage)&&(!Number.isInteger(h.years)||h.years<h.low||h.years>h.high))throw Error('猎魂年限无效');}
      if(['hunt','initialHunt'].includes(s.phase)&&s.version>=3){
        const h=s.hunt,allowed=h.index===7?['强化','防御']:[...R.CATEGORIES,'回蓝'];
        if(h.selectedCategory!==undefined&&h.selectedCategory!=='random'&&!allowed.includes(h.selectedCategory)||h.location!==undefined&&!['forest','valley','wetland'].includes(h.location)||h.attempt!==undefined&&(!Number.isInteger(h.attempt)||h.attempt<1||h.attempt>10000))throw Error('猎魂选择无效');
        if(h.result){const r=h.result;if(r.index!==h.index||r.years!==h.years||!Array.isArray(r.skills)||r.skills.length!==(h.years===100000?2:1)||r.skills.some(x=>!allowed.includes(x.category))||r.skills[0].category!==h.category&&!h.absorbed)throw Error('候选魂环无效');}
        if(!h.legacyFloor&&h.years!==undefined&&h.years<R.ringFloor(R.CAPS[h.index-1]))throw Error('候选年限低于保底');
      }
      if(['arrival','battle','ending'].includes(s.phase)&&(s.completed!==c.time.quarters||s.date.year!==6102||s.date.month!==c.time.month||s.date.age!==c.time.age))throw Error('入会时间无效');
      if(c.talent&&(!Number.isInteger(c.talent.rank)||c.talent.rank<1||c.talent.rank>10||![[.50,.53,.56,.59,1.12,1.17,1.21,1.24,1.27,1.53][c.talent.rank-1],Creation.TALENTS[c.talent.rank-1].xpMultiplier,R.round2(1+.06*(c.talent.rank-1)),R.round2(c.talent.rank<5?1+.06*(c.talent.rank-1):1.40+.16*(c.talent.rank-5))].includes(c.talent.xpMultiplier)||c.talent.attributeMultiplier!==Creation.TALENTS[c.talent.rank-1].attributeMultiplier))throw Error('天赋数据无效');
      if(s.growthPlan&&(!Number.isFinite(s.growthPlan.baseXP)||s.growthPlan.baseXP<0||s.growthPlan.baseXP>2000))throw Error('成长路线无效');
      if(s.version>=4){
        if(!Number.isInteger(c.luck)||c.luck<1||c.luck>10||!c.eventFlags||!Array.isArray(c.bones)||!Array.isArray(c.boneInventory)||c.bones.length>6||c.boneInventory.length>100||!Array.isArray(c.mutations)||c.mutations.length>20)throw Error('培养数据无效');
        if(c.effectiveTier!==undefined&&(!Number.isInteger(c.effectiveTier)||c.effectiveTier<soul.tier||c.effectiveTier>10))throw Error('变异潜力无效');
        const bones=[...c.bones,...c.boneInventory];if(new Set(c.bones.map(x=>x.slot)).size!==c.bones.length||bones.some(x=>!['头部','躯干','左臂','右臂','左腿','右腿'].includes(x.slot)||!Array.isArray(x.skills)||x.skills.length))throw Error('魂骨数据无效');
      }
      if(s.version>=5){
        if(!Number.isInteger(c.charm)||c.charm<1||c.charm>10||!Number.isInteger(c.fatigue)||c.fatigue<0||c.fatigue>2||!Array.isArray(s.hiddenRolls)||s.hiddenRolls.length>10000)throw Error('魅力或暗骰数据无效');
        if(s.pending&&(!Number.isInteger(s.pending.bias)||s.pending.bias<1||s.pending.bias>20||!Array.isArray(s.pending.receipts)))throw Error('事件境遇无效');
      }
      R.buildStats({...c,soul});
      if(s.battleSnapshot){const b=s.battleSnapshot;if(!Array.isArray(b.units)||b.units.length<2||b.units.length>4||!Number.isFinite(b.now)||b.now<0||b.now>180000||!Array.isArray(b.log)||b.log.length>1500)throw Error('战斗存档无效');for(const u of b.units){if(!u.model?.derived||!Array.isArray(u.skills)||u.skills.length>18||![0,1].includes(u.team))throw Error('战斗角色无效');for(const [v,max]of [['hp','HP'],['mp','MP'],['sh','SH']])if(!Number.isFinite(u[v])||u[v]<0||u[v]>u.model.derived[max])throw Error('战斗资源无效');}}
      return true;
    };
return {Campaign,R,EventData,Creation,TRAINING,EVENTS,methods:{upgrade,freezeFortune,creation,acknowledgeAwakening,rollCreation,soul,growthRates,draw,dark,sync,refresh,review,begin,startGrowth,event,matchesEvent,elapsedMonths,periodMonths,startQuarter,eventConditions,ensurePromotionState,currentPromotion,ratingSettled,recordPromotion,acknowledgePromotion,fuseStoredBone,eventText,eventChance,eventEstimate,receipt,prepareEvent,reward,chooseEvent,resolveEventBranch,previewEvent,settleBias,specialEvent,grantBone,absorbBone,finishEvent,continueProgress,generateRing,huntCategories,huntPlan,huntStep,chooseSecond,prepareHuntCandidate,abandonHunt,hunt,finishHunt,finishQuarter,battleOptions,observeBattle,returnArrival,static_validate}};
})(typeof globalThis==='undefined'?this:globalThis);

// QuestActions: definitive 10.05 behavior, no prototype replacement.
const QuestActions=(function(root){
const Campaign=CampaignCore.Campaign,R=CampaignCore.R,Data=CampaignCore.EventData;
const copy=x=>JSON.parse(JSON.stringify(x));
const chains=Data.CHAINS;
const events=Data.EVENTS;
const byId=new Map(events.map((e,i)=>[e.id,{event:e,index:i}]));
const chainMap=new Map(chains.map(c=>[c.id,c]));
const performresolveEventBranchCore=CampaignCore.methods.resolveEventBranch;
const performfinishQuarterCore=CampaignCore.methods.finishQuarter;
const performvalidateCore=CampaignCore.methods.static_validate;
const ensureStoryState=function(){const s=this.state;if(s.storyRulesVersion!==1001){if(s.pending&&!s.pending.legacyEvent){s.pending.eventSnapshot=copy(Data.ORIGINAL_EVENTS[s.pending.eventIndex]||events[s.pending.eventIndex]);s.pending.oldNarrative=true;s.pending.noQuestStart=true;}s.storyRulesVersion=1001;}s.quests ||= {version:1,active:null,records:{}};};

const questSeen=function(id){return this.state.eventHistory?.[id]!==undefined||this.state.journal.some(j=>j.eventId===id||['quarter','episode'].includes(j.type)&&j.title===byId.get(id)?.event.title);};

const questRequire=function(w={}){const c=this.state.character;return (!w.flag||!!c.eventFlags[w.flag])&&(!w.bone||c.boneInventory.length>0)&&(!w.mutated||c.mutations.length>0);};

const questFuture=function(chain,id){const seen=new Set();const visit=id=>{if(!id||seen.has(id))return;seen.add(id);const n=chain.nodes.find(n=>n.eventId===id);if(n?.next)visit(n.next);for(const route of n?.routes||[])if(route.next)visit(route.next);};visit(id);return [...seen];};

const questReserved=function(){const q=this.state.quests,record=q?.records[q.active];if(!record)return new Set();return new Set(this.questFuture(chainMap.get(q.active),record.nextEventId));};

const interruptQuest=function(reason){const s=this.state,q=s.quests,r=q?.records[q.active];if(!r)return;r.status='interrupted';r.reason=reason;r.nextEventId=null;q.active=null;s.journal.push({type:'quest',date:copy(s.date),title:chainMap.get(r.id).title+' · 暂告一段落',text:reason});};

const nextQuestEvent=function(){
      this.ensureStoryState();const q=this.state.quests,r=q.records[q.active];if(!r)return null;const found=byId.get(r.nextEventId);if(!found||this.questSeen(r.nextEventId)){this.interruptQuest('后续篇章已不可用，本次线索暂告一段落。');return null;}
      const w=found.event.when,c=this.state.character;
      const impossible=w.levelMax!==undefined&&c.level>w.levelMax||w.tierMax!==undefined&&this.soul().tier>w.tierMax||w.charmMax!==undefined&&c.charm>w.charmMax||w.luckMin!==undefined&&c.luck<w.luckMin||w.luckMax!==undefined&&c.luck>w.luckMax||w.originMin!==undefined&&c.identity.originRank<w.originMin||w.originMax!==undefined&&c.identity.originRank>w.originMax||w.locations&&!w.locations.includes(c.identity.origin)||w.styles&&!w.styles.includes(c.style);
      if(impossible){this.interruptQuest('当前人物已无法满足后续篇章的条件。');return null;}
      if(!this.matchesEvent(found.event)){r.status='waiting';return null;}r.status='active';return {...found,questId:q.active};
    };

const openStoryEvent=function(selected,training,{continuation=false}={}){
      const s=this.state,c=s.character,e=selected.event,record=selected.questId?s.quests.records[selected.questId]:null,chain=record?chainMap.get(record.id):null,node=chain?.nodes.find(n=>n.eventId===e.id),snapshot=copy(e);
      if(node?.text)snapshot.text=node.text;
      if(node?.outcomeAppend)for(const outcome of ['success','failure'])if(node.outcomeAppend[outcome])for(const option of snapshot.options)option[outcome]+='\n\n'+node.outcomeAppend[outcome];
      s.eventHistory[e.id]=s.completed;s.pending={training,eventIndex:selected.index,eventSnapshot:snapshot,questId:record?.id||null,noSeasonRewards:continuation,bias:this.dark(20,'境遇偏倚'),receipts:[],PStart:c.stats.stats.P,date:copy(s.date),before:copy(c.stats.stats),beforeLevel:c.level,beforeRating:R.rating(c.stats).label,triggerTags:this.eventConditions(e),ringCount:c.rings.length,choice:null,reward:[],settled:false};s.lastEvent=selected.index;s.phase='event';this.sync();
    };

const grantPeriodGrowth=function(p){p.rewardContext='season';if(!p.noSeasonRewards){this.reward(p.training,2,p);this.reward('XP',this.growthRates().xp,p);}p.rewardContext='event';};

const settleQuest=function(p){
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

const awardQuest=function(chain,record,ending,p){
      if(record.rewardClaimed)return;const alt=chain.alternateEndings?.[ending],complete=!alt||alt.useCompletionBonus===true,definition=complete?chain.completion:alt,nodes=record.settledNodes.slice(1),successes=nodes.filter(n=>n.success).length,multiplier=complete&&successes<nodes.length/2?.5:1,perfect=complete&&nodes.length>0&&successes===nodes.length;
      const previous=p.rewardContext;p.rewardContext='quest';const bonus={};for(const [k,v]of Object.entries(definition.bonus||{})){if(!['CHARM','LUCK'].includes(k))bonus[k]=R.round2(v*multiplier);};if(perfect)for(const [k,v]of Object.entries(chain.completion.perfectExtra||{}))if(!['CHARM','LUCK'].includes(k))bonus[k]=R.round2((bonus[k]||0)+v);
      for(const [key,amount]of Object.entries(bonus))if(amount>0)this.reward(key,amount,p);
      record.status=complete?'completed':(alt.status||'closed');record.ending=ending;record.rewardId='quest:'+chain.id+':'+ending;record.rewardClaimed=true;record.nextEventId=null;record.quality={successes,total:nodes.length,multiplier,perfect};record.completedAt=copy(this.state.date);
      const text=alt?.text||chain.completion.text,memo=complete?chain.completion.memo:null;p.outcome.text+='\n\n'+text;p.questEnding={id:record.rewardId,title:chain.title,status:record.status,ending,quality:copy(record.quality),memo};this.receipt(p,'quest',chain.title,null,null,null,(perfect?'全部后续章节成功 · 额外加持':multiplier===.5?'历经波折 · 终章基础加持减半':complete?'任务链已完成':'线索提前收束'),record.rewardId);if(memo)p.reward.push('纪念记录：'+memo+'（仅记入行记）');p.rewardContext=previous;this.state.quests.active=null;
    };

const resolveEventBranch=function(option,success,excellent,p){
      performresolveEventBranchCore.call(this,option,success,excellent,p);if(p.oldNarrative)return;
      p.outcome.text=success?option.success:option.failure;
      const gift=['bone','family'].includes(option.special)&&(success||p.bias===20);
      if(gift){const bone=p.receipts.find(r=>r.kind==='bone');p.outcome.text+='\n\n'+(bone?'实际登记赠礼：'+bone.label+'（待融合）。':'本次常规部位已安排，赠礼改为修炼指导，以收益凭证为准。');}
      if(p.bias===1)p.outcome.text+='\n\n'+(success?'你处理好了额外的波折，留下进一步成长的机会。':'这次波折带来短暂疲惫，具体消耗已记入凭证，已有成长仍被保留。');
      if(p.bias===20)p.outcome.text+='\n\n这份机缘带来的额外培养资源与师长引荐已记入凭证。';
    };

const finishQuarter=function(){
      const s=this.state,p=s.pending,episode=s.episodePeriod;
      if(episode&&s.quests.active===episode.chainId){const next=this.nextQuestEvent();if(next){const e=this.event(),option=e.options[p.choice];s.journal.push({type:'episode',date:copy(p.date),quarter:s.completed+1,eventId:e.id,questId:p.questId,title:e.title,text:this.eventText(),training:'本期连续章节',choice:option.text,outcome:copy(p.outcome),receipts:copy(p.receipts),rewards:copy(p.reward),beforeLevel:p.beforeLevel,afterLevel:s.character.level,before:p.before,after:copy(s.character.stats.stats),newRings:s.character.rings.slice(p.ringCount).map(r=>({index:r.index,years:r.years}))});this.openStoryEvent(next,episode.training,{continuation:true});return;}
        this.interruptQuest('本期故事的后续条件未能满足，已完成的行动与收益保留。');
      }
      s.episodePeriod=null;performfinishQuarterCore.call(this);if(s.phase==='arrival'&&s.quests?.active)this.interruptQuest('旅程已抵达公会，这条尚未完成的线索暂告一段落。');
    };

const questSummary=function(){const q=this.state.quests;if(!q)return null;const r=q.records[q.active];if(!r)return null;const chain=chainMap.get(r.id);return {id:r.id,title:chain.title,status:r.status,finished:r.settledNodes.length,total:chain.nodes.length,cadence:chain.cadence};};

const questLog=function(){return Object.values(this.state.quests?.records||{}).filter(r=>r.status!=='blocked').map(r=>({id:r.id,title:chainMap.get(r.id).title,status:r.status,finished:r.settledNodes.length,memo:r.status==='completed'?chainMap.get(r.id).completion.memo:null,reason:r.reason||null}));};

const static_validate=function(s,catalog){performvalidateCore(s?.version===9?{...s,version:8}:s,catalog);if(s.quests){const q=s.quests;if(q.version!==1||!q.records||typeof q.records!=='object'||Object.keys(q.records).some(id=>!chainMap.has(id))||q.active!==null&&!chainMap.has(q.active))throw Error('任务链存档无效');for(const [id,r]of Object.entries(q.records)){const chain=chainMap.get(id);if(r.id!==id||!['active','waiting','completed','closed','interrupted','blocked'].includes(r.status)||!Array.isArray(r.settledNodes)||r.settledNodes.length>chain.nodes.length||new Set(r.settledNodes.map(n=>n.eventId)).size!==r.settledNodes.length||r.settledNodes.some(n=>!chain.nodes.some(x=>x.eventId===n.eventId)||typeof n.success!=='boolean'||![0,1].includes(n.choice))||typeof r.rewardClaimed!=='boolean'||r.nextEventId&&!chain.nodes.some(n=>n.eventId===r.nextEventId))throw Error('任务节点记录无效');}if(q.active&&(!q.records[q.active]||!['active','waiting'].includes(q.records[q.active].status)))throw Error('活动任务链无效');}
      if(s.pending?.eventSnapshot&&!s.pending.legacyEvent){const e=s.pending.eventSnapshot;if(e.id!==events[s.pending.eventIndex]?.id||typeof e.title!=='string'||typeof e.text!=='string'||e.text.length>20000||!e.when||!Array.isArray(e.options)||e.options.length!==2||e.options.some(o=>typeof o.text!=='string'||typeof o.success!=='string'||typeof o.failure!=='string'||!Array.isArray(o.keys)||!o.gain||!Number.isFinite(o.base)))throw Error('事件原文快照无效');}
      if(s.episodePeriod&&(!s.quests?.records[s.episodePeriod.chainId]||s.episodePeriod.completed!==s.completed||![...R.KEYS,'W'].includes(s.episodePeriod.training)))throw Error('连续章节状态无效');return true;
    };
return {methods:{ensureStoryState,questSeen,questRequire,questFuture,questReserved,interruptQuest,nextQuestEvent,openStoryEvent,grantPeriodGrowth,settleQuest,awardQuest,resolveEventBranch,finishQuarter,questSummary,questLog,static_validate}};
})(typeof globalThis==='undefined'?this:globalThis);

// JourneyActions: definitive 10.05 behavior, no prototype replacement.
const JourneyActions=(function(root){
const Campaign=CampaignCore.Campaign,R=CampaignCore.R,Data=CampaignCore.EventData;
const copy=x=>JSON.parse(JSON.stringify(x));
const chains=Data.CHAINS;
const performbattleOptionsCore=CampaignCore.methods.battleOptions;
const performobserveBattleCore=CampaignCore.methods.observeBattle;
const performreturnArrivalCore=CampaignCore.methods.returnArrival;
const performrefreshCore=CampaignCore.methods.refresh;
const performelapsedMonthsCore=CampaignCore.methods.elapsedMonths;
const performstartQuarterCore=CampaignCore.methods.startQuarter;
const performfinishQuarterCore=QuestActions.methods.finishQuarter;
const performcontinueProgressCore=CampaignCore.methods.continueProgress;
const performabandonHuntCore=CampaignCore.methods.abandonHunt;
const performopenStoryEventCore=QuestActions.methods.openStoryEvent;
const performsettleQuestCore=QuestActions.methods.settleQuest;
const performvalidateCore=QuestActions.methods.static_validate;
const ensure1002=function(){
      const s=this.state;
      if(!s.exam){s.exam={mode:'normal',starts:['battle','ending'].includes(s.phase)?1:0,opponent:s.battleOptions?.enemyId||null};}
      if(!Number.isInteger(s.huntDelayMonths))s.huntDelayMonths=0;
      if(s.hunt&&s.hunt.budgetStart===undefined)s.hunt.budgetStart=s.hunt.attempt||1;
      if(s.battleOptions){s.battleOptions.campaignExam=true;s.battleOptions.examAttempt=s.exam.starts;}
      s.journeyRulesVersion=1002;
    };

const setPlayMode=function(mode){this.ensure1002();if(!['normal','member'].includes(mode)||this.state.exam.starts>0)throw Error('本次旅程模式已确定');this.state.exam.mode=mode;};

const examStatus=function(){this.ensure1002();const e=this.state.exam,limit=e.mode==='member'?10:5;return {...e,limit,remaining:Math.max(0,limit+1-e.starts),maxStarts:limit+1};};

const assignExaminer=function(){this.ensure1002();const e=this.state.exam;if(e.mode==='member')return e.opponent; if(!e.opponent){const list=(typeof module!=='undefined'&&module.exports?require('./v13-runtime.cjs').WitnessTemplates:root.WitnessTemplates);e.opponent=list[this.dark(list.length,'转正考核 · 抽取会员')-1].id;this.sync();}return e.opponent;};

const battleOptions=function(enemyId,difficulty='admission',support=false){
      this.ensure1002();const e=this.state.exam,st=this.examStatus();
      if(e.badEnding||st.remaining<=0)throw Error('本次考核机会已耗尽，请开启新旅程');
      if(e.mode==='normal'){enemyId=this.assignExaminer();difficulty='admission';support=false;}
      const options=performbattleOptionsCore.call(this,enemyId,difficulty,support);e.starts++;e.opponent=enemyId;
      options.campaignExam=true;options.examAttempt=e.starts;this.state.battleOptions=copy(options);return options;
    };

const observeBattle=function(b){
      this.ensure1002();const changed=performobserveBattleCore.call(this,b),s=this.state;
      if(changed&&s.result?.winner!==0&&this.examStatus().remaining===0){
        s.exam.badEnding=true;s.phase='ending';
        s.journal.push({type:'ending',date:copy(s.date),title:'未能扣上的会徽',text:'考核机会已用尽。这一次，会徽仍留在登记台上。遗憾会留下，下一段旅程也仍在等你。',level:s.character.level});
      }return changed;
    };

const retry=function(){
      const s=this.state;this.ensure1002();if(s.phase!=='battle'||s.exam.badEnding||this.examStatus().remaining<=0)throw Error('本次考核机会已耗尽');
      s.exam.starts++;s.attempts++;s.result=null;s.resultHandled=false;s.battleSnapshot=null;
      s.battleOptions.examAttempt=s.exam.starts;return copy(s.battleOptions);
    };

const returnArrival=function(){if(this.examStatus().remaining<=0||this.state.exam.badEnding)throw Error('本次考核已结束');performreturnArrivalCore.call(this);};

const refresh=function(){this.ensure1002();const c=this.state.character;if(c?.effectiveTier)c.mutationName=this.catalog.find(x=>x.id===c.soulId)?.name;performrefreshCore.call(this);if(c)for(const ring of c.rings)ring.band=R.BANDS[R.band(ring.years)];};

const monthsToAdmission=function(){const s=this.state,t=s.character.time;return Math.max(0,6102*12+t.month-1-(s.date.year*12+s.date.month-1));};

const forceAdmission=function(reason){
      const s=this.state,c=s.character;if(s.phase==='arrival')return;
      s.skippedPeriods=Math.max(0,c.time.quarters-s.completed-(s.pending?.settled?1:0));
      if(s.pending?.settled){const p=s.pending,e=this.event();s.journal.push({type:'quarter',date:copy(p.date),quarter:s.completed+1,eventId:e.id,questId:p.questId,questStage:this.questStage(),castIntroductions:copy(p.castIntroductions||{}),title:e.title,text:this.eventText(),choice:e.options[p.choice]?.text,training:'考核到期',outcome:copy(p.outcome),receipts:copy(p.receipts||[]),rewards:copy(p.reward||[]),beforeLevel:p.beforeLevel,afterLevel:c.level});}
      if(s.quests?.active)this.interruptQuest('考核日期已到，未完成的线索暂告一段落。');
      s.completed=c.time.quarters;s.date={year:6102,month:c.time.month,age:c.time.age};s.pending=null;s.hunt=null;s.episodePeriod=null;s.phase='arrival';
      s.journal.push({type:'arrival',date:copy(s.date),title:'考核日期已到',text:reason||'余下时间已不足一个季度，你收起旅途中的安排，赶往见证者公会。魂环尚有空缺，也要按时登台。'});this.sync();
    };

const elapsedMonths=function(completed=this.state.completed){this.ensure1002();const t=this.state.character.time,total=t.span*12;return Math.min(total,performelapsedMonthsCore.call(this,completed)+this.state.huntDelayMonths);};

const startQuarter=function(training){if(this.state.phase==='growth'&&this.monthsToAdmission()<3){this.forceAdmission();return;}return performstartQuarterCore.call(this,training);};

const finishQuarter=function(){const p=this.state.pending,stage=this.questStage(),count=this.state.journal.length;performfinishQuarterCore.call(this);for(const entry of this.state.journal.slice(count)){if(['quarter','episode'].includes(entry.type)){if(stage)entry.questStage=copy(stage);if(p?.castIntroductions)entry.castIntroductions=copy(p.castIntroductions);}}if(this.state.phase==='growth'&&this.monthsToAdmission()<3)this.forceAdmission();};

const continueProgress=function(){const s=this.state;if(s.episodePeriod&&s.quests?.active===s.episodePeriod.chainId&&this.nextQuestEvent()){this.finishQuarter();return;}return performcontinueProgressCore.call(this);};

const huntRound=function(){this.ensure1002();const h=this.state.hunt;return h?((h.attempt||1)-h.budgetStart)%4+1:0;};

const abandonHunt=function(){
      this.ensure1002();const s=this.state,h=s.hunt,round=this.huntRound(),budgetStart=h?.budgetStart;
      performabandonHuntCore.call(this);s.hunt.budgetStart=budgetStart;
      if(round===4){
        s.huntDelayMonths++;const t=s.character.time,absolute=s.date.year*12+s.date.month;
        s.date={year:Math.floor(absolute/12),month:absolute%12+1,age:t.startAge+Math.floor((absolute-(t.startYear*12+t.month-1))/12)};
        // Merge repeated waits into one record; long hunts do not exhaust the journal limit.
        let entry=s.journal.at(-1);if(entry?.type!=='huntDelay'||entry.ring!==h.index){entry={type:'huntDelay',ring:h.index,date:copy(s.date),months:0,title:'猎魂的等待',text:''};s.journal.push(entry);}entry.months++;entry.text='四次搜寻仍未吸收魂环，本次猎魂累计耗时'+entry.months+'个月。';entry.date=copy(s.date);
        if(this.monthsToAdmission()===0)this.forceAdmission('你没有吸收最后的候选魂环，考核的日期却已经到了。向导收起路线图，你带着尚有空缺的魂环，按时赶往斗魂台。');
      }this.sync();
    };

const questStage=function(){
      const s=this.state,p=s.pending;if(!p?.questId)return null;const chain=chains.find(c=>c.id===p.questId),record=s.quests.records[p.questId];if(!chain||!record)return null;
      const done=record.settledNodes.findIndex(n=>n.eventId===this.event().id),number=done>=0?done+1:record.settledNodes.length+1;
      return {title:chain.title,number,nodeTitle:this.event().title,active:record.status==='active'||record.status==='waiting',status:record.status};
    };

const openStoryEvent=function(selected,training,options){
      performopenStoryEventCore.call(this,selected,training,options);const e=this.event(),node=chains.find(c=>c.id===selected.questId)?.nodes.find(n=>n.eventId===e.id);
      this.state.pending.castIntroductions={...(e.castIntroductions||{}),...(node?.castIntroductions||{})};
    };

const settleQuest=function(p){const before=p.questId;performsettleQuestCore.call(this,p);if(p.questId){const chain=chains.find(c=>c.id===p.questId),node=chain?.nodes.find(n=>n.eventId===this.event().id);p.castIntroductions={...(p.castIntroductions||{}),...(node?.castIntroductions||{})};if(!before)p.questStarted=true;}};

const snapshot=function(){this.ensure1002();this.sync();return {...JSON.parse(JSON.stringify(this.state)),version:9,gameVersion:'v11.01'};};

const static_validate=function(s,catalog){performvalidateCore(s,catalog);if(s.exam){const e=s.exam,max=e.mode==='member'?11:6;if(!['normal','member'].includes(e.mode)||!Number.isInteger(e.starts)||e.starts<0||e.starts>max||e.opponent!==null&&typeof e.opponent!=='string'||e.badEnding&&(s.phase!=='ending'||e.starts!==max||s.result?.winner===0))throw Error('考核机会存档无效');}if(s.huntDelayMonths!==undefined&&(!Number.isInteger(s.huntDelayMonths)||s.huntDelayMonths<0||s.huntDelayMonths>1000))throw Error('猎魂月份无效');if(s.hunt?.budgetStart!==undefined&&(!Number.isInteger(s.hunt.budgetStart)||s.hunt.budgetStart<1||s.hunt.budgetStart>(s.hunt.attempt||1)))throw Error('猎魂回合无效');return true;};
return {methods:{ensure1002,setPlayMode,examStatus,assignExaminer,battleOptions,observeBattle,retry,returnArrival,refresh,monthsToAdmission,forceAdmission,elapsedMonths,startQuarter,finishQuarter,continueProgress,huntRound,abandonHunt,questStage,openStoryEvent,settleQuest,snapshot,static_validate}};
})(typeof globalThis==='undefined'?this:globalThis);

const CampaignModern=(function(){
'use strict';
const baseRefresh=JourneyActions.methods.refresh;
function refresh(){
  const s=this.state,c=s.character;
  if(c)for(const ring of [...(c.rings||[]),...(s.hunt?.result?[s.hunt.result]:[])])for(let i=0;i<ring.skills.length;i++){const sk=ring.skills[i];if(sk.attackSubtype==='pursuit'&&(c.style!=='敏攻'||this.soul().spirit_specialist)){s.skillMigrations||=[];s.skillMigrations.push({ring:ring.index,slot:i,old:sk.name,reason:'追势仅限敏攻系，转为普通攻击'});sk.attackSubtype='direct';sk.name=this.soul().name+'·击';}if(sk.category==='回蓝'){s.skillMigrations||=[];s.skillMigrations.push({ring:ring.index,slot:i,old:sk.name,reason:'回蓝类退场，确定性迁移为防御'});sk.category='防御';sk.name=this.soul().name+'·护';delete sk.attackSubtype;delete sk.effects;}}
  baseRefresh.call(this);if(!c)return;
  if(s.promotionState?.ratingRulesVersion!==CampaignCore.R.ratingRulesVersion)CampaignCore.methods.ensurePromotionState.call(this);
  if(s.growthPlan?.cultivationVersion!==CampaignCore.Creation.CULTIVATION.version){s.cultivationMigration={version:CampaignCore.Creation.CULTIVATION.version,atPeriod:s.completed,previousBaseXP:s.growthPlan?.baseXP??null,earnedLevel:c.level,earnedXP:s.xp};s.growthPlan={...(s.growthPlan||{}),baseXP:CampaignCore.R.round2(CampaignCore.Creation.CULTIVATION.journeyXP/Math.max(1,c.time.quarters)),cultivationVersion:CampaignCore.Creation.CULTIVATION.version};}

  for(const ring of c.rings||[])for(let i=0;i<ring.skills.length;i++){
    const skill=ring.skills[i];
    if(skill.category==='回蓝'){
      s.skillMigrations||=[];s.skillMigrations.push({ring:ring.index,slot:i,old:skill.name,reason:'回蓝类退场，确定性迁移为防御'});
      ring.skills[i]=CampaignCore.R.makeSkill({soul:this.soul(),style:c.style,stats:c.stats,index:ring.index,years:ring.years,category:'防御',effectSeed:s.seed+'|migration-1007|'+ring.index+'|'+i});
    }else if(skill.category==='攻击'&&!skill.attackSubtype){skill.attackSubtype=skill.damageMode==='periodic'?'periodic':'direct';skill.generationVersion=1006;}
  }
  if(s.hunt?.selectedCategory==='回蓝'){s.hunt.selectedCategory='random';if(s.hunt.result){s.hunt.result=null;s.hunt.stage='category';}s.hunt.category=undefined;}
  if(s.hunt?.category==='回蓝')s.hunt.category='防御';if(s.hunt?.secondCategory==='回蓝')s.hunt.secondCategory=s.hunt.category==='防御'?'强化':'防御';
  if(s.phase==='battle'&&s.battleSnapshot&&![1007,1008,1100].includes(s.battleSnapshot.modernVersion)){s.legacyBattleReport=s.battleSnapshot;s.battleSnapshot=null;s.result=null;s.resultHandled=false;s.modernBattleRestart=true;s.pendingExamResume=true;s.phase='arrival';}
  s.cultivationRulesVersion=10082;s.gameVersion='v11.01';
}
function static_validate(s,catalog){
  JourneyActions.methods.static_validate(s,catalog);const runtime=typeof module!=='undefined'&&module.exports?require('./v13-runtime.cjs'):globalThis;const challengeAPI=typeof module!=='undefined'&&module.exports?require('./systems/challenge/state.js'):globalThis.WitnessChallenge;challengeAPI?.validate(s.challenge);
  if(s.challenge){const q=s.challenge;if(q.version!==1||!Number.isInteger(q.failures)||q.failures<0||q.failures>5||!Array.isArray(q.completed)||q.completed.length>40||!Array.isArray(q.resolved)||q.resolved.length>200)throw Error('挑战进度无效');if(q.active&&(!q.options?.postGameChallenge||q.options.challengeSessionId!==q.active||typeof q.active!=='string'||q.active.length>160))throw Error('挑战场次无效');}
  for(const ring of s.character?.rings||[])for(const sk of ring.skills){if(sk.attackSubtype!==undefined&&!['direct','periodic','multi','pursuit'].includes(sk.attackSubtype))throw Error('攻击子类无效');}
  return true;
}
function battleOptions(...args){const s=this.state;if(s.pendingExamResume){if(s.phase!=='arrival'||s.exam?.badEnding)throw Error('旧战斗恢复资格无效');const options=JSON.parse(JSON.stringify(s.battleOptions));options.character=JSON.parse(JSON.stringify(s.character));options.soul=JSON.parse(JSON.stringify(this.soul()));s.phase='battle';s.pendingExamResume=false;s.battleSnapshot=null;s.result=null;s.resultHandled=false;return options;}return JourneyActions.methods.battleOptions.apply(this,args);}
function autoEventStep(){
 const s=this.state;if(s.phase==='growth')return this.startQuarter(s.quickTraining||'C');
 if(s.phase==='event'){
  const p=s.pending;if(p.choice===null||p.choice===undefined){
   const chances=p.legacyEvent?[50,50]:[this.eventEstimate(0),this.eventEstimate(1)];
   const choice=chances[1]>chances[0]?1:0;p.autoChoice={index:choice,policy:'公开估计成功率较高者；同率选前项',chances};
   if(p.legacyEvent)return this.chooseEvent(choice);this.prepareEvent(choice);return;
  }return this.chooseEvent();
 }
 if(s.phase==='eventResult')return this.finishEvent();
 throw Error('当前阶段需要本人确认');
}
return {methods:{refresh,static_validate,battleOptions,autoEventStep}};
})();

const CampaignV12=(function(root){
'use strict';
const A=typeof module!=='undefined'&&module.exports?require('./v13-runtime.cjs').WitnessV12:root.WitnessV12;
const RT=()=>typeof module!=='undefined'&&module.exports?require('./v13-runtime.cjs'):root;
const R=CampaignCore.R,copy=x=>JSON.parse(JSON.stringify(x));
const BUDGET={version:1,note:'v12初版可调装备预算；不改变成长与等级。',values:{1000:{B:3,S:3,C:3,D:3,A:3,P:3},10000:{B:15,S:15,C:15,D:15,A:15,P:15},100000:{B:45,S:45,C:45,D:45,A:45,P:45}}};
function ensure(){const s=this.state,c=s.character;if(!c)return null;s.v12||={version:1,hunt:A.hunt.ledger.createLedger(),equipment:A.soulbone.absorption.createEquipmentLedger(),drop:{},rewards:{},reports:[],npcProgress:{},attributeBudget:copy(BUDGET)};const v=s.v12;v.attributeBudget||=copy(BUDGET);if(v.attemptsUsed===undefined)v.attemptsUsed=Math.max(v.reports?.length||0,['battle','won','lost'].includes(v.hunt.status)?1:0);v.attemptLimit=3;if(!v.beastProgress){v.beastProgress={};const old=v.battleSnapshot?.units?.find(u=>u.beastId);if(old)v.beastProgress[old.beastId]={mossStacks:old.v12State?.mossStacks||0};}c.v12Equipment=v.equipment;c.boneInventory||=[];return v;}
function decorate(bone){if(!bone.base)return bone;return {...bone,id:bone.boneId,slot:bone.base.slot,years:bone.base.years,name:bone.base.name,skills:[]};}
function reportArchive(){const api=RT().WitnessV12Reports;return api&&typeof api.archiveReport==='function'?api:null;}
function archiveReport(report){const api=reportArchive();if(!api)return null;try{return api.archiveReport(report);}catch(error){return {ok:false,persisted:'none',error};}}
function reportBrief(report){if(!report)return null;const api=reportArchive();const summary=report.snapshot&&api&&api.summarize?api.summarize(report):report;return {id:summary.id||report.id,targetId:summary.targetId||report.targetId||null,targetName:summary.targetName||null,reason:summary.reason||report.reason||null,seconds:summary.seconds===undefined?null:summary.seconds,winner:summary.winner===undefined?null:summary.winner,logCount:summary.logCount===undefined?0:summary.logCount,units:copy(summary.units||[]).map(u=>({id:u.id,name:u.name,team:u.team,beastId:u.beastId||null})),date:summary.date||null};}
function absorb(item){const v=ensure.call(this),c=this.state.character;c.inventory=c.boneInventory;const out=A.soulbone.absorption.absorbBone({character:c,bone:decorate(item),ledger:v.equipment});c.boneInventory=c.inventory.map(decorate);delete c.inventory;c.bones=c.bones.map(decorate);if(out.status==='slot-conflict'){v.replacements||=[];if(!v.replacements.some(x=>x.incomingBoneId===out.session.incomingBoneId))v.replacements.push(out.session);}return out;}
function characterForRewards(c,soul){return {...copy(c),soul:copy(soul),inventory:copy(c.boneInventory||[])};}
function applyCharacter(s,c,ledger){c.boneInventory=(c.inventory||[]).map(decorate);delete c.inventory;delete c.soul;c.bones=c.bones.map(decorate);c.v12Equipment=ledger;s.character=c;s.v12.equipment=ledger;}
// Upgrade only actual unassembled ordinary drops. Event gifts/ten-thousand ancestors and already rolled traits remain unchanged.
function upgradeOrdinaryTraits(){const v=ensure.call(this),c=this.state.character,upgrade=A.soulbone.effects.upgrade;
 for(const key of ['bones','boneInventory'])for(const bone of c[key]||[])bone.traits=(bone.traits||[]).map(upgrade);
 for(const [key,t]of Object.entries(v.equipment.runtimeTraits))v.equipment.runtimeTraits[key]=upgrade(t);
 for(const bone of Object.values(v.drop.boneAssemblies||{}))bone.traits=(bone.traits||[]).map(upgrade);
 if(v.reward?.bone)v.reward.bone.traits=(v.reward.bone.traits||[]).map(upgrade);
}
function backfillOrdinaryBones(){const s=this.state,c=s.character,v=ensure.call(this);if(s.phase==='battle'||s.challenge?.active||s.phase==='v12Hunt'&&v.hunt.status==='battle')return;
 for(const key of ['bones','boneInventory'])for(let i=0;i<c[key].length;i++){
  const old=c[key][i];if(old.source?.type!=='ten-thousand-drop'||old.traits?.length||!(old.base?.years>=10000&&old.base.years<100000))continue;
  const acquisitionId=old.source.acquisitionId;if(!acquisitionId)continue;v.drop.boneAssemblies||={};v.drop.boneAssemblies[acquisitionId]||=copy(old);
  const excludes=[...Object.values(v.equipment.runtimeTraits),...c.boneInventory.flatMap(b=>b.traits||[])].map(t=>t.traitId);
  const out=A.soulbone.tenThousand.completePendingTenThousandBone(v.drop,{acquisitionId,pool:A.soulbone.traitPool,rng:A.rng.createRng(s.seed+'|v1204-backfill|'+old.boneId),budget:v.attributeBudget,excludeDefinitionIds:excludes});
  const bone=decorate(out.bone);if(old.absorbed){bone.absorbed=true;if(!bone.pendingReasons.length)bone.status='absorbed';A.soulbone.absorption.applySource(bone,v.equipment);}c[key][i]=bone;
 }
}
function refresh(){CampaignModern.methods.refresh.call(this);const s=this.state,c=s.character;if(!c)return;const v=ensure.call(this);upgradeOrdinaryTraits.call(this);backfillOrdinaryBones.call(this);if(!v.legacyBonesMigrated){v.legacyBonesMigrated=true;const pending=c.boneInventory.filter(b=>!b.boneId);c.boneInventory=c.boneInventory.filter(b=>b.boneId);for(const old of pending){const bone=A.soulbone.instance.createBoneInstance({boneId:old.id||'legacy:'+old.slot,definitionId:'legacy-gift',source:{type:'legacy'},base:{years:old.years,slot:old.slot,name:old.name,affinity:old.affinity},attributes:null,traits:[]});absorb.call(this,bone);}}const tags=A.battle.skillAttributes.tagCharacterSkills(c,this.soul());c.rings=tags.rings;
 if(c.preStoredNinthRing&&c.level>=90&&c.rings.length===8){const actor=characterForRewards(c,this.soul());const out=A.reward.transaction&&A.reward;const ring=A.reward.ring.handleNinthRing({character:actor,ring:c.preStoredNinthRing,level:c.level,makeSkill:R.makeSkill});if(ring.absorbed){c.rings=actor.rings;delete c.preStoredNinthRing;}}
 c.stats.rings=Math.max(c.stats.rings,c.rings.length);s.gameVersion='v12.05.01';
}
function check(){const s=this.state,c=s.character;if(!c||!['growth','eventResult','arrival','ending'].includes(s.phase))return false;const v=ensure.call(this);if(!['idle','pending'].includes(v.hunt.status))return false;
 const result=A.hunt.controller.consider({level:c.level,model:c.stats,ledger:v.hunt,flow:{phase:s.phase},safeNode:s.phase==='eventResult'?'growth-settled':'battle-settled',key:'v12:'+s.completed+':'+c.level});v.hunt=result.ledger;if(result.presentation){v.returnPhase=s.phase;s.phase='v12Hunt';return true;}return false;}
function choose(option){const v=ensure.call(this),rng=v.rng?A.rng.RollLog.restore(v.rng):A.rng.createRng(this.state.seed+'|hundred-thousand');const out=A.hunt.controller.choose({ledger:v.hunt,option,character:this.state.character,rng,at:copy(this.state.date)});v.hunt=out.ledger;v.rng=rng.snapshot();if(!out.accepted){v.message=out.texts.paragraphs.join('\n');this.state.phase=v.returnPhase;this.sync();}return out;}
function selectTarget(id){const v=ensure.call(this);if(this.state.phase!=='v12Hunt'||!['invitation','arrival','awaiting-library'].includes(v.hunt.status)||v.hunt.target||v.attemptsUsed>0||v.reward)throw Error('讨伐目标已锁定，不能更换');const def=A.beast.library.definition(id);if(!def.available)throw Error('该魂兽暂未开放');v.selectedTarget=def.id;this.sync();return def.id;}
function startBattle(){const v=ensure.call(this),s=this.state,c=s.character,rng=A.rng.RollLog.restore(v.rng);if(v.attemptsUsed>=3||v.reward)throw Error('本次讨伐挑战已结束');let ledger=v.hunt;
 if((v.selectedTarget||v.testTarget)&&!ledger.target){const def=A.beast.library.definition(v.selectedTarget||v.testTarget);ledger={...ledger,target:{id:def.id,version:def.version,snapshot:def}};}
 const player=RT().WitnessBattle.playerUnit(c,this.soul());player.v12Traits=Object.values(v.equipment.runtimeTraits).map(t=>({...t,id:t.traitId}));
 const allies=ledger.allies.npcIds.map(id=>{const def=A.roster.combatSpec(id);const unit=A.npc.buildUnit({definition:def,id:'ally:'+id,team:0,permanentProgress:v.npcProgress[id]});unit.displayRating=def.rating;unit.skills=unit.skills.map(x=>({...x,selfOnly:['自己'].includes(x.target),cost:x.cost,fx:RT().WitnessBattle.fxFor(unit.soul)}));return unit;});
 const out=A.hunt.controller.forward({ledger,playerUnit:player,allyUnits:allies,rng,seed:s.seed+'|hunt-battle'});v.rng=rng.snapshot();v.hunt=out.ledger;if(out.pending)return out;
 const beast=out.ledger.target.snapshot,enemy=out.battlePlan.teams.enemy[0];enemy.beastId=beast.id;enemy.v12InitialMossStacks=v.beastProgress[beast.id]?.mossStacks||0;enemy.v12Traits=copy(beast.traits);enemy.model=copy(beast.panel);enemy.huntHealth={version:1,baseHP:enemy.model.derived.HP,multiplier:allies.length?2:1.5};enemy.model.derived.HP=Math.round(enemy.huntHealth.baseHP*enemy.huntHealth.multiplier);enemy.source='十万年魂兽';enemy.release='本体';enemy.soul={id:'npc-beast-'+beast.id,name:beast.name,tier:1,main_kind:'兽',subkind:'魂兽',elements:copy(beast.elements),attribute:beast.elements.join('／'),spirit_specialist:false};enemy.skills=beast.skills.map(x=>({...copy(x),selfOnly:['自己'].includes(x.target),v12Operations:copy(x.operations),fx:RT().WitnessBattle.fxFor(enemy.soul)}));
 v.attemptsUsed++;const session=s.characterId+':hunt'+(v.attemptsUsed===1?'':':'+v.attemptsUsed);out.battlePlan.sessionId=session;out.battlePlan.seed+='|attempt:'+v.attemptsUsed;v.hunt=A.hunt.controller.startBattle(v.hunt,session);v.plan=copy(out.battlePlan);v.options={huntPlan:copy(out.battlePlan),seed:out.battlePlan.seed};v.battleSnapshot=null;v.result=null;this.sync();return v.options;
}
function retry(){const v=ensure.call(this);if(v.hunt.status!=='lost'||v.attemptsUsed>=3||v.reward)throw Error('没有剩余讨伐挑战机会');v.hunt=A.hunt.ledger.transition(v.hunt,'forwarded',{result:null,battleSessionId:null},'retry-same-target');this.state.phase='v12Hunt';return startBattle.call(this);}
function reopen(){const v=ensure.call(this);if(v.hunt.status!=='lost'||v.attemptsUsed>=3||v.reward)throw Error('没有待继续的讨伐');if(this.state.phase!=='v12Hunt'){v.returnPhase=this.state.phase;this.state.phase='v12Hunt';}this.sync();}
function observe(b){const s=this.state,v=ensure.call(this);if(!b.v12Battle||v.hunt.status!=='battle'||b.v12Session!==v.hunt.battleSessionId)return false;
 if(!b.result){v.battleSnapshot=b.snapshot();this.sync();return false;}
 const enemy=b.units.find(u=>u.beastId),survivors=b.units.filter(u=>u.team===0&&b.alive(u)).map(u=>u.id),outcome=b.result.huntOutcome||(b.result.reason==='认输'?'surrender':b.result.winner===0&&!b.alive(enemy)?'victory':'loss');
 const resolved=A.hunt.controller.resolve({ledger:v.hunt,outcome,enemy:{defeated:!b.alive(enemy)},survivors,plan:v.plan,traits:b.units.map(u=>({id:u.id,traits:u.v12Traits||u.traits||[]})),triggers:b.log.filter(x=>x.type==='trait')});v.hunt=resolved.ledger;v.result=copy(b.result);
 for(const u of b.units.filter(u=>u.beastId))v.beastProgress[u.beastId]={mossStacks:u.v12State?.mossStacks||0};
 for(const u of b.units.filter(u=>u.npcId))v.npcProgress[u.npcId]=copy(u.permanentProgress||{});
 RT().WitnessV12Live.persist(s.character,b);
 const report={...resolved.report,id:v.hunt.battleSessionId,snapshot:b.snapshot(),initial:copy(v.options),date:copy(s.date)};
 const archived=archiveReport(report);
 if(archived&&archived.ok&&archived.summary){v.reports.push(archived.summary);v.archiveWarning=archived.persisted==='archive'?null:'战报已暂存在本次会话，请先导出这份战报。';}
 else{v.reports.push(report);v.archiveWarning='战报未能写入本机归档，已并入主存档；请导出战报以保留完整日志。';}
 v.reports=v.reports.slice(-20);v.battleSnapshot=null;
 if(resolved.firstWin)this.v12Claim();
 this.refresh();this.sync();return true;
}
function recoverReport(id){const v=ensure.call(this),api=reportArchive(),full=api&&api.peek?api.peek(id):null;if(!full)return false;const index=v.reports.findIndex(r=>r.id===id);if(index<0)return false;v.reports[index]={...copy(full),archive:'embedded',archiveError:true};v.archiveWarning='战报归档写入失败，已暂存于主存档；请先导出这份战报。';this.sync();return true;}
function claim(){const s=this.state,v=ensure.call(this);if(v.reward)return false;
 const report=v.reports.find(r=>r.id===v.hunt.battleSessionId);
 const winner=v.result?.winner??report?.winner??report?.snapshot?.result?.winner;
 if(v.hunt.status!=='won'||!v.hunt.result?.loot||!report||winner!==0)throw Error('缺少真实讨伐首胜凭证');
 const rng=A.rng.createRng(s.seed+'|hunt-reward');const reward=A.reward.createRunner(v.rewards).run({transactionId:'reward:'+v.hunt.battleSessionId,sessionId:v.hunt.battleSessionId,firstWin:true,beastSnapshot:v.hunt.target.snapshot,character:characterForRewards(s.character,this.soul()),equipmentLedger:v.equipment,level:s.character.level,seed:s.seed+'|hunt-reward',rng,makeSkill:R.makeSkill,pickCategory:R.pickCategory,budget:v.attributeBudget,battleReport:reportBrief(report),at:copy(s.date)});
 if(reward.failedStep)throw Error('讨伐奖励暂未完成：'+reward.failedStep+' '+reward.error.message);
 applyCharacter(s,reward.character,reward.equipmentLedger);v.reward=copy(reward.result);if(reward.result.absorption.session){v.replacements||=[];if(!v.replacements.some(x=>x.incomingBoneId===reward.result.absorption.session.incomingBoneId))v.replacements.push(reward.result.absorption.session);}v.hunt.rewardTransactionId=reward.transaction.transactionId;
 this.refresh();this.sync();return true;
}
function resume(){const v=ensure.call(this);if(v.hunt.status==='battle')throw Error('请先完成讨伐战');if(v.hunt.status==='won'&&!v.reward)this.v12Claim();this.state.phase=v.returnPhase||'growth';v.plan=null;v.options=null;v.battleSnapshot=null;v.message=null;this.sync();}
function replacement(id,choice){const v=ensure.call(this),session=v.replacements?.find(x=>x.incomingBoneId===id);if(!session)throw Error('换骨会话已结束');const c=this.state.character;c.inventory=c.boneInventory;const result=A.soulbone.absorption.confirmReplacement({session,choice,character:c,ledger:v.equipment});c.boneInventory=c.inventory.map(decorate);delete c.inventory;c.bones=c.bones.map(decorate);v.replacements=v.replacements.filter(x=>x!==session);this.refresh();this.sync();return result;}
function availableBoneSlots(){const c=this.state.character,owned=new Set([...(c.bones||[]),...(c.boneInventory||[])].map(b=>b.base?.slot||b.slot));const free=A.soulbone.instance.SLOTS.filter(slot=>!owned.has(slot));return free.length?free:A.soulbone.instance.SLOTS.slice();}
function settleKilledCandidate(){const s=this.state,h=s.hunt;if(!h?.result||h.absorbed)return null;const v=ensure.call(this),c=s.character;if(h.dropChecked)return h.boneDrop||null;
 const rng=A.rng.createRng(s.seed+'|bone-drop|'+h.index+'|'+(h.attempt||1));const drop=A.soulbone.drop.settleConfirmedHunt({store:v.drop,ring:h.result,seed:s.seed,characterName:s.characterId,luck:c.luck,attempt:h.attempt||1,rng,at:copy(s.date)});
 h.dropChecked=true;h.boneDrop=copy(drop);
 if(drop.eligible&&!drop.duplicate)s.journal.push({type:'bone',title:'猎杀所得·掉骨判定',text:'气运'+c.luck+'：1d10000＝'+drop.face+'，阈值'+drop.threshold+'。'+(drop.dropped?'发现魂骨。':'未发现魂骨。'),date:copy(s.date)});
 if(drop.dropped){const record=A.soulbone.tenThousand.settleTenThousandBone(v.drop,{boneId:'bone:'+drop.acquisitionId,acquisitionId:drop.acquisitionId,years:h.result.years,affinity:this.soul().attribute,pool:A.soulbone.traitPool,rng,budget:v.attributeBudget,availableSlots:availableBoneSlots.call(this),excludeDefinitionIds:[...Object.values(v.equipment.runtimeTraits),...c.boneInventory.flatMap(b=>b.traits||[])].map(t=>t.traitId),drop});
  const bone=decorate(record.bone);if(!c.bones.some(b=>b.boneId===bone.boneId)&&!c.boneInventory.some(b=>b.boneId===bone.boneId))c.boneInventory.push({...bone,awaitingRingAbsorption:true,status:'in-inventory'});
  v.pendingHuntBones||=[];if(!v.pendingHuntBones.includes(bone.boneId))v.pendingHuntBones.push(bone.boneId);
  v.boneNotifications||=[];if(!v.boneNotifications.some(n=>n.boneId===bone.boneId))v.boneNotifications.push({boneId:bone.boneId,name:bone.base.name,slot:bone.base.slot,years:bone.base.years,read:false});
 }
 return drop;
}
function prepareHuntCandidate(){CampaignCore.methods.prepareHuntCandidate.call(this);settleKilledCandidate.call(this);}
function acknowledgeBone(id){const v=ensure.call(this),notice=v.boneNotifications?.find(n=>n.boneId===id);if(notice)notice.read=true;this.sync();}
function finishHunt(){settleKilledCandidate.call(this);const out=CampaignCore.methods.finishHunt.call(this),v=ensure.call(this),c=this.state.character;
 for(const id of v.pendingHuntBones||[]){const bone=c.boneInventory.find(b=>b.boneId===id);if(!bone)continue;delete bone.awaitingRingAbsorption;absorb.call(this,bone);}v.pendingHuntBones=[];this.refresh();this.v12Check();this.sync();return out;
}
function abandonHunt(){settleKilledCandidate.call(this);return JourneyActions.methods.abandonHunt.call(this);}
function grantBone(p){const v=ensure.call(this),rng=A.rng.createRng(this.state.seed+'|gift-bone|'+this.state.completed),slot=A.soulbone.instance.rollBoneSlot({rng}).slot;const bone=A.soulbone.instance.createBoneInstance({boneId:'gift:'+this.state.characterId+':'+this.state.completed,definitionId:'event-gift',source:{type:'event-gift',eventId:this.event()?.id},base:{years:1000,slot,name:this.soul().attribute+'共鸣'+slot+'骨',affinity:this.soul().attribute},budget:v.attributeBudget});const out=absorb.call(this,bone);p.reward.push('获得'+bone.base.name+'；'+(out.status==='slot-conflict'?'同部位新骨收入行囊':'已自动吸收，不占事件'));}
function validate(s,catalog){if(s.v12){if(!Number.isInteger(s.v12.attemptsUsed??0)||(s.v12.attemptsUsed??0)<0||(s.v12.attemptsUsed??0)>3)throw Error('讨伐挑战次数无效');A.soulbone.absorption.validateLedger(s.v12.equipment);A.hunt.ledger.validate(s.v12.hunt);if(!Array.isArray(s.v12.reports)||s.v12.reports.length>20)throw Error('讨伐战报无效');for(const bone of [...(s.character?.bones||[]),...(s.character?.boneInventory||[])])if(bone.boneId)A.soulbone.instance.validateBoneInstance(bone);}return CampaignModern.methods.static_validate(s,catalog);}
const safe=(fn)=>function(...args){const out=fn.apply(this,args);if(this.state.character){ensure.call(this);this.refresh();this.v12Check();}return out;};
function install(methods){Object.assign(methods,{refresh,v12Ensure:ensure,v12Check:check,v12Choose:choose,v12SelectTarget:selectTarget,v12StartBattle:startBattle,v12Retry:retry,v12Reopen:reopen,v12Observe:observe,v12Claim:claim,v12Resume:resume,v12Replace:replacement,v12RecoverReport:recoverReport,grantBone,finishHunt,prepareHuntCandidate,abandonHunt,v125SettleKill:settleKilledCandidate,v125AcknowledgeBone:acknowledgeBone,observeBattle(b){RT().WitnessV12Live.persist(this.state.character,b);return JourneyActions.methods.observeBattle.call(this,b);},snapshot(){const out=JourneyActions.methods.snapshot.call(this);out.gameVersion='v12.05.01';return out;},startGrowth:safe(CampaignCore.methods.startGrowth),finishQuarter:safe(JourneyActions.methods.finishQuarter),chooseEvent:safe(CampaignCore.methods.chooseEvent)});}
function testCharacter(catalog,{seed='讨伐测试',target='frost-moss-frog',originRank=10,level=81}={}){const C=RT().WitnessCampaign||CampaignCore;const c=new CampaignCore.Campaign(catalog,{seed,name:'讨伐试炼者',level,tier:8,staged:false});const s=c.state,p=s.character;p.identity.originRank=originRank;c.setPlayMode('member');p.time.age=Math.max(16,p.time.age);p.time.startAge=p.time.age-p.time.span;p.time.birthYear=6102-p.time.age;s.date.age=p.time.startAge;
 c.refresh();for(const key of R.KEYS)p.growth[key]+=Math.max(0,R.benchmark(level).base*1.9-p.stats.stats[key]);c.refresh();p.rings=[];for(let i=1;i<=R.benchmark(level).rings;i++)p.rings.push(c.generateRing(i,'balanced',0,R.benchmark(level).rings));s.phase='growth';c.refresh();const v=ensure.call(c);v.test=true;v.testTarget=target;c.v12Check();return c;}
return {install,validate,testCharacter,BUDGET};
})(typeof globalThis==='undefined'?this:globalThis);

// Single assembly point; public methods are installed once.
(function(root){
const {Campaign,TRAINING,EVENTS,Creation,EventData}=CampaignCore;
const methods={
upgrade:CampaignCore.methods.upgrade,
freezeFortune:CampaignCore.methods.freezeFortune,
creation:CampaignCore.methods.creation,
acknowledgeAwakening:CampaignCore.methods.acknowledgeAwakening,
rollCreation:CampaignCore.methods.rollCreation,
soul:CampaignCore.methods.soul,
growthRates:CampaignCore.methods.growthRates,
autoEventStep:CampaignModern.methods.autoEventStep,
draw:CampaignCore.methods.draw,
dark:CampaignCore.methods.dark,
sync:CampaignCore.methods.sync,
refresh:CampaignModern.methods.refresh,
review:CampaignCore.methods.review,
begin:CampaignCore.methods.begin,
startGrowth:CampaignCore.methods.startGrowth,
event:CampaignCore.methods.event,
matchesEvent:CampaignCore.methods.matchesEvent,
elapsedMonths:JourneyActions.methods.elapsedMonths,
periodMonths:CampaignCore.methods.periodMonths,
startQuarter:JourneyActions.methods.startQuarter,
eventConditions:CampaignCore.methods.eventConditions,
ensurePromotionState:CampaignCore.methods.ensurePromotionState,
currentPromotion:CampaignCore.methods.currentPromotion,
ratingSettled:CampaignCore.methods.ratingSettled,
recordPromotion:CampaignCore.methods.recordPromotion,
acknowledgePromotion:CampaignCore.methods.acknowledgePromotion,
fuseStoredBone:CampaignCore.methods.fuseStoredBone,
eventText:CampaignCore.methods.eventText,
eventChance:CampaignCore.methods.eventChance,
eventEstimate:CampaignCore.methods.eventEstimate,
receipt:CampaignCore.methods.receipt,
prepareEvent:CampaignCore.methods.prepareEvent,
reward:CampaignCore.methods.reward,
chooseEvent:CampaignCore.methods.chooseEvent,
resolveEventBranch:QuestActions.methods.resolveEventBranch,
previewEvent:CampaignCore.methods.previewEvent,
settleBias:CampaignCore.methods.settleBias,
specialEvent:CampaignCore.methods.specialEvent,
grantBone:CampaignCore.methods.grantBone,
absorbBone:CampaignCore.methods.absorbBone,
finishEvent:CampaignCore.methods.finishEvent,
continueProgress:JourneyActions.methods.continueProgress,
generateRing:CampaignCore.methods.generateRing,
huntCategories:CampaignCore.methods.huntCategories,
huntPlan:CampaignCore.methods.huntPlan,
huntStep:CampaignCore.methods.huntStep,
chooseSecond:CampaignCore.methods.chooseSecond,
prepareHuntCandidate:CampaignCore.methods.prepareHuntCandidate,
abandonHunt:JourneyActions.methods.abandonHunt,
hunt:CampaignCore.methods.hunt,
finishHunt:CampaignCore.methods.finishHunt,
finishQuarter:JourneyActions.methods.finishQuarter,
battleOptions:CampaignModern.methods.battleOptions,
observeBattle:JourneyActions.methods.observeBattle,
returnArrival:JourneyActions.methods.returnArrival,
retry:JourneyActions.methods.retry,
snapshot:JourneyActions.methods.snapshot,
ensureStoryState:QuestActions.methods.ensureStoryState,
questSeen:QuestActions.methods.questSeen,
questRequire:QuestActions.methods.questRequire,
questFuture:QuestActions.methods.questFuture,
questReserved:QuestActions.methods.questReserved,
interruptQuest:QuestActions.methods.interruptQuest,
nextQuestEvent:QuestActions.methods.nextQuestEvent,
openStoryEvent:JourneyActions.methods.openStoryEvent,
grantPeriodGrowth:QuestActions.methods.grantPeriodGrowth,
settleQuest:JourneyActions.methods.settleQuest,
awardQuest:QuestActions.methods.awardQuest,
questSummary:QuestActions.methods.questSummary,
questLog:QuestActions.methods.questLog,
ensure1002:JourneyActions.methods.ensure1002,
setPlayMode:JourneyActions.methods.setPlayMode,
examStatus:JourneyActions.methods.examStatus,
assignExaminer:JourneyActions.methods.assignExaminer,
monthsToAdmission:JourneyActions.methods.monthsToAdmission,
forceAdmission:JourneyActions.methods.forceAdmission,
huntRound:JourneyActions.methods.huntRound,
questStage:JourneyActions.methods.questStage
};
CampaignV12.install(methods);
Object.defineProperties(Campaign.prototype,Object.fromEntries(Object.entries(methods).map(([key,value])=>[key,{value,writable:true,configurable:true}])));
Campaign.validate=CampaignV12.validate;
const api={Campaign,TRAINING,EVENTS,Creation,V12:CampaignV12,CHAINS:EventData.CHAINS};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WitnessCampaign=api;
})(typeof globalThis==='undefined'?this:globalThis);

})();
