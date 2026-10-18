(function(root){
  'use strict';
  const R=typeof module!=='undefined'&&module.exports?require('./rules.js'):root.WitnessRules;
  const D=typeof module!=='undefined'&&module.exports?require('./core.js'):root.WitnessDice;
  const copy=x=>JSON.parse(JSON.stringify(x));
  const ORIGINS=['父母双亡的孤儿','贫寒农户家庭','城镇平民家庭','工匠或商户家庭','普通魂师家庭','地方魂师世家','宗门成员家庭','魂斗罗的门人或亲属','封号斗罗门下','封号斗罗亲属'];
  const TALENT_NAMES=['厚积之始','勤修可成','根基初显','稳健之资','良材可琢','出类拔萃!','非凡之资!!','惊才绝艳!!!','绝世之资!!!!','天纵之才!!!!!'];
  const CULTIVATION={version:10082,journeyXP:4800,eventMultiplier:.15,initialRetention:.25,talent:[.50,.53,.56,.59,1.15,1.22,1.28,1.32,1.35,1.56],weapon:[.875,.89,.90,.91,.92,.94,.96,.98,1,1.15]};
  const TALENTS=Array.from({length:10},(_,i)=>({rank:i+1,label:(i+1)+'档 · '+TALENT_NAMES[i],xpMultiplier:CULTIVATION.talent[i],attributeMultiplier:R.round2(1+.04*i)}));
  function cultivationRates({rank,tier,initialLevel=5,stages=24}){
    const count=Math.max(1,stages),base=CULTIVATION.journeyXP/count,weapon=CULTIVATION.weapon[tier-1],talent=CULTIVATION.talent[rank-1];
    // Keep a quarter of the innate-level advantage; avoid multiplying the old
    // catch-up-to-41 allowance by all growth bonuses.
    const initialOffset=(1-CULTIVATION.initialRetention)*(Math.max(1,Math.min(10,initialLevel))-5)*100/count;
    return {base:R.round2(base),weapon,talent,initialOffset:R.round2(initialOffset),xp:R.round2(Math.max(0,base*weapon*talent-initialOffset)),attribute:TALENTS[rank-1].attributeMultiplier,version:CULTIVATION.version};
  }
  function aptitude(v){return v<=-7?'尚待雕琢':v<=-3?'稍显薄弱':v<=2?'根基平稳':v<=5?'出类拔萃!':v<=7?'非凡之资!!':v<=9?'惊才绝艳!!!':'天纵之才!!!!';}
  function aptitudeSummary(v){if(v.every(x=>x===10))return '此等天资，竟然真的存在!!!!!';if(v.every(x=>x>=8))return '万中无一!!!!';if(v.every(x=>x>=5))return '六维俱佳!!!';if(v.filter(x=>x>=8).length>=2)return '双璧生辉!!';return '';}
  const CHARM_WORDS=['内敛含蓄','朴实无华','平易近人','清秀可亲','温润如玉','风姿出众','顾盼生辉','倾城之姿','绝代风华','举世无双'];
  const LUCK_WORDS=['逆风起步','时有波折','平中有变','渐入佳境','顺遂平稳','时来运转','福星高照','鸿运当头','天赐良机','天命所钟'];
  function fortuneDescription(key,rank){if(!Number.isInteger(rank)||rank<1||rank>10)return '';return (key==='charm'?CHARM_WORDS:LUCK_WORDS)[rank-1]+(rank>=6?'!'.repeat(rank-5):'');}
  const SURNAMES=['林','秦','夏','伊','许','沈','江','陆','明','苏','叶','白','韩','云','莫','唐','顾','温','陈','清','李','赵','周','吴','郑','王','冯','楚','卫','蒋','程','杨','朱','季','何','吕','梁','宋','谢','段','萧','洛','颜','柳','傅','杜','南宫','司徒','欧阳','慕容','孙','钱','张','曹','严','华','金','魏','陶','姜','邹','柏','章','潘','袁','鲁','马','侯','邵','崔'];
  const GIVEN_NAMES=['青禾','照夜','星遥','予宁','知微','行舟','晓岚','承风','明溪','怀月','雨眠','落川','言初','晴空','书羽','暮云','清河','闻星','若棠','长安','文昀','云舒','映雪','观澜','听雨','景行','疏影','望川','星澈','知远','临渊','锦年','怀瑾','予白','朝露','晚晴','墨言','霁月','栖迟','承煦','听澜','元衡','念慈','初霁','鹤鸣','昭宁','南絮','砚秋','怀璧','凌霄'];
  const GIVEN_CHARS=[...new Set(GIVEN_NAMES.join('')+'浩涵泽润泓沐浚淳澄源煜烨熙煊皓旭晨昕朗睿哲谦谨毅恒健博达卓轩辰逸嘉佑祺瑞瑶琬芷蕙')];
  const BLOCKED_NAME_CODES=new Set([0x5c11,0x7fcc]);
  function allowedName(name){return [...String(name)].every(c=>!BLOCKED_NAME_CODES.has(c.codePointAt(0)));}
  if([...SURNAMES,...GIVEN_NAMES].some(n=>!allowedName(n)))throw Error('姓名候选校验失败');
  const ATTRIBUTE_ORDER=['金','木','水','火','土','风','雷','冰','光','暗','毒','精神','滋养','音波','幽灵','星力','食物','力量','吞噬','鬼魅','血煞','复刻','镜像','坚固','战意','增幅','破魂','斩切','空间','再生','湮灭','秩序','极致力量','纯化','生命','因果','生命循环','幻象','普通'];
  function soulAttributes(soul){const parts=soul.attribute.replace(/^(复合|无属性)·/,'').split('/');return ATTRIBUTE_ORDER.filter(a=>parts.includes(a));}
  function attributeKey(soul){const a=soulAttributes(soul);return a.length?a.join(' / '):soul.attribute;}
  const CHOICES={gender:['男','女','无性别'],nationality:['星罗','天魂','斗灵邦联','其他国籍','无国籍'],region:['乡村','集镇','港口','林区','地方学院','工坊','商队','救济院'],personality:['谨慎','直率','好奇','坚韧','内向','热情','好胜','随和'],appearance:['短发与朴素旅行装','长发与轻便外衣','利落束发与旧披风','柔软卷发与整洁衬衣','深色头发与贴身训练服','浅色头发与宽松长衣','微乱短发与随身背包','整齐长发与手工饰物'],motivation:['找到一个可以归属的地方','学习更成熟的修炼方法','帮助家乡的人','记录大陆上的所见所闻','靠自己的能力谋生','结识可以并肩同行的人'],keepsake:['一页旧信','一枚旧铜扣','一本空白札记','一截木哨','一条手编绳','一张手绘路线图','一块磨平的石片','一袋家乡种子']};
  const STEPS=[['month','入会季节','时间'],['age','入会年龄','时间'],['span','旅程跨度','时间'],['originRank','出身','身世'],['charm','魅力','人物'],['luck','气运','身世'],['talent','修炼天赋与先天魂力','天赋'],['tier','武魂潜力','武魂'],['soulKind','武魂种类','武魂'],['soulAttribute','武魂属性','武魂'],['gender','性别','人物'],['nationality','国籍','人物'],['region','成长地点','人物'],['personality','性格','人物'],['appearance','外形','人物'],['motivation','入会动机','人物'],['keepsake','随身纪念物','人物'],['level','初始魂力等级','能力'],...R.KEYS.map(k=>[k,R.LABELS[k]+'偏差','能力']),['W','精神稳定偏差','能力']];
  const LEGACY_STEPS=['month','age','span','originRank','talent','tier','soulId','style','release','surname','given','gender','nationality','region','personality','appearance','motivation','keepsake','level',...R.KEYS,'W'];
  class Draft{
    constructor(catalog,{seed='见证者',name='',gender='随机',tier=null,level=null,snapshot=null}={}){
      this.catalog=catalog;
      if(snapshot){Draft.validate(snapshot,catalog);this.state=copy(snapshot);}
      else this.state={talentBindingVersion:1,version:2,attributeSchema:2,timeSchema:2,seed:String(seed),rngState:null,cursor:0,results:{},rolls:[],hiddenRolls:[],options:{name:String(name).trim().slice(0,40),gender,tier,level}};
      this.rng=new D.DiceEngine(this.state.seed,this.state.rngState??undefined);
      if(this.state.version===1){
        const v=this.state.results,soul=this.catalog.find(x=>x.id===v.soulId);
        if(!this.state.options.name&&v.surname&&v.given)this.state.generatedName=v.surname+v.given;
        this.state.hiddenRolls=[];this.state.results.charm=5;this.state.results.luck=v.luck||5;
        if(soul){v.soulKind=soul.main_kind;v.soulAttribute=attributeKey(soul);}
        this.state.cursor=0;this.state.version=2;
      }
      if(!this.state.generatedName){
        if(this.state.options.name)this.state.generatedName=this.state.options.name;
        else this.state.generatedName=this.generateName();
      }
      if(!allowedName(this.state.generatedName))throw Error('这个姓名暂不能使用，请换一个。');
      if(this.state.attributeSchema!==2){const soul=this.soul();if(soul)this.state.results.soulAttribute=attributeKey(soul);this.state.attributeSchema=2;}
      this.skipFixed();this.state.rngState=this.rng.state;
    }
    generateName(){
      const pick=(pool,label)=>pool[this.dark(pool.length,label)-1],surname=this.state.results.surname||pick(SURNAMES,'姓名 · 姓氏');
      if(this.state.results.given)return surname+this.state.results.given;
      const method=this.dark(100,'姓名 · 组合方式');
      if(method<=20){const pool=GIVEN_NAMES.filter(n=>!n.startsWith(surname.at(-1)));return surname+pick(pool,'姓名 · 固定名');}
      const firstPool=GIVEN_CHARS.filter(c=>c!==surname.at(-1)),first=pick(firstPool,'姓名 · 首字');
      if(method<=30)return surname+first;
      const secondPool=GIVEN_CHARS.filter(c=>c!==first&&c!==surname.at(-1)&&!['初霄','照照','怀怀','雨雨','夜夜'].includes(first+c));
      return surname+first+pick(secondPool,'姓名 · 次字');
    }
    dark(sides,label){const face=sides===1?1:this.rng.die(sides);this.state.hiddenRolls.push({label,sides,face});return face;}
    soul(){return this.catalog.find(x=>x.id===this.state.results.soulId);}
    pool(){const v=this.state.results;return this.catalog.filter(x=>x.tier===v.tier&&x.main_kind===v.soulKind&&(v.tier<=3||attributeKey(x)===v.soulAttribute));}
    awaken(){
      if(this.state.results.soulId)return;
      const pool=this.pool();if(!pool.length)throw Error('所投武魂条件没有候选，请检查武魂库');
      const soul=pool[this.dark(pool.length,'武魂觉醒')-1];
      this.state.results.soulId=soul.id;this.state.results.style='强攻';this.state.results.release=soul.release_options[0];
    }
    skipFixed(){
      while(this.state.cursor<STEPS.length){
        const key=STEPS[this.state.cursor][0],v=this.state.results,o=this.state.options;
        if(this.state.talentBindingVersion===1&&o.level===null&&v.talent!==undefined)v.level=v.talent;
        if(key==='span'&&this.state.timeSchema===2)v.span=v.age-6;
        if(key==='tier'&&o.tier!==null)v.tier=o.tier;
        if(key==='gender'&&o.gender!=='随机')v.gender=o.gender;
        if(key==='level'&&o.level!==null)v.level=o.level;
        if(key==='soulAttribute'&&v.tier<=3){this.awaken();this.state.cursor++;continue;}
        if(v.soulKind&&v.tier&&(v.tier<=3||v.soulAttribute))this.awaken();
        if(v[key]===undefined)break;this.state.cursor++;
      }
      this.state.rngState=this.rng.state;
    }
    current(){
      if(this.done())return null;const [key,label,group]=STEPS[this.state.cursor],v=this.state.results;let options=CHOICES[key]||null,sides=10,note='';
      if(key==='month'){options=[1,4,7,10];note='加入公会固定在6102年，投出登记月份。';}
      if(key==='age'){sides=this.state.timeSchema===2?25:9;note=this.state.timeSchema===2?'骰面＋15：6102年抵达公会时16—40岁。你从6岁觉醒起步，经历10—34年。':'骰面＋9：入会时10—18岁。';}
      if(key==='span'){sides=Math.min(6,v.age-6);note=`旅程1—${sides}年，启程年龄不低于6岁，每年4个季度。`;}
      if(key==='originRank'){options=ORIGINS;note='出身成为故事的起点，也影响与家门有关的机缘。';}
      if(key==='charm')note='魅力1—10档，影响交往、协商与被理解的机会，不替代你的能力。';
      if(key==='luck')note='气运1—10档，影响机缘；低气运也会遇到善意与突破。';
      if(key==='talent')note='一次1d10同时决定修炼天赋与先天魂力等级：几档天赋即几级先天魂力。修炼系数×0.50—1.56，能力训练×1.00—1.36。';
      if(key==='tier'){sides=1000;note='先决定武魂潜力，再决定种类。低潜力直接迎来觉醒，高潜力还将投取属性。';}
      if(key==='soulKind'){options=[...new Set(this.catalog.filter(x=>x.tier===v.tier).map(x=>x.main_kind))];note=v.tier<=3?'武魂种类落定后，将直接暗骰决定你的武魂。':'先落定种类，随后投取武魂属性，具体武魂由暗骰揭晓。';}
      if(key==='soulAttribute'){options=[...new Set(this.catalog.filter(x=>x.tier===v.tier&&x.main_kind===v.soulKind).map(attributeKey))];note='属性落定后，觉醒将自行完成。不提前展示具体武魂候选。';}
      if(key==='level'){sides=this.state.timeSchema===2?10:40;note=this.state.timeSchema===2?'6岁觉醒，投取1—10级先天魂力；随后通过成长与猎魂达到入会条件。':'骰面−1：初始0—39级，随后靠季度成长与猎魂，按日期抵达公会参加考核。';}
      if([...R.KEYS,'W'].includes(key)){sides=21;note=key==='W'?'骰面−11：稳定偏差−10至＋10点。':'骰面−11：该项先天偏差−10%至＋10%。';}
      if(options)sides=options.length;return {key,label,group,sides,note,options,number:this.state.cursor+1,total:STEPS.length-(this.state.talentBindingVersion===1&&this.state.options.level===null?1:0)};
    }
    roll(){
      const step=this.current();if(!step)throw Error('开局投骰已经完成');
      const face=step.sides===1?1:this.rng.die(step.sides);let value=step.options?step.options[face-1]:face;
      if(step.key==='age')value=face+(this.state.timeSchema===2?15:9);if(step.key==='tier')value=D.tierFor(face);if(step.key==='level')value=this.state.timeSchema===2?face:face-1;if([...R.KEYS,'W'].includes(step.key))value=face-11;
      this.state.results[step.key]=step.key==='originRank'?face:value;let text=String(value);
      if(step.key==='originRank')text=face+'档 · '+value;
      if(step.key==='talent'){text=TALENTS[face-1].label;if(this.state.talentBindingVersion===1&&this.state.options.level===null)text+=' · 先天魂力'+face+'级';}
      if(R.KEYS.includes(step.key))text=`${value>=0?'+':''}${value}% · ${aptitude(value)}`;
      if(step.key==='tier')text=value+'档';if(step.key==='month')text='6102年'+value+'月';if(step.key==='span')text=value+'年 · '+value*4+'季度';if(step.key==='age')text=value+'岁';
      if(step.key==='luck'||step.key==='charm')text=face+'档'+step.label+' · '+fortuneDescription(step.key,face);
      const result={key:step.key,label:step.label,sides:step.sides,face,value:this.state.results[step.key],text,quarter:0};this.state.rolls.push(result);this.state.cursor++;this.skipFixed();return result;
    }
    done(){return this.state.cursor>=STEPS.length;}
    character(){
      if(!this.done())throw Error('请完成开局投骰');const v=this.state.results;
      const time={month:v.month,age:v.age,span:v.span,rawSpan:v.span,birthYear:6102-v.age,startYear:6102-v.span,startAge:v.age-v.span,quarters:this.state.timeSchema===2?24:v.span*4,...(this.state.timeSchema===2?{timelineMode:'stages',awakeningAge:6}: {})};
      return {talentBindingVersion:this.state.talentBindingVersion||0,name:this.state.generatedName,level:v.level,initialLevel:v.level,initialPotential:v.tier,soulId:v.soulId,style:v.style,release:v.release,luck:v.luck,charm:v.charm,initialLuck:v.luck,initialCharm:v.charm,talent:copy(TALENTS[v.talent-1]),identity:{gender:v.gender,nationality:v.nationality,personality:v.personality,family:ORIGINS[v.originRank-1],originRank:v.originRank,origin:v.region,appearance:v.appearance,motivation:v.motivation,keepsake:v.keepsake},time,deviations:R.KEYS.map(k=>v[k]),wDeviation:v.W,growth:Object.fromEntries([...R.KEYS,'W'].map(k=>[k,0])),rings:[]};
    }
    snapshot(){this.state.rngState=this.rng.state;return copy(this.state);}
    static validate(s,catalog){
      const steps=s?.version===1?LEGACY_STEPS:STEPS.map(x=>x[0]);
      if(!s||![1,2].includes(s.version)||typeof s.seed!=='string'||s.seed.length>120||!Number.isInteger(s.cursor)||s.cursor<0||s.cursor>steps.length||!Number.isInteger(s.rngState)||!Array.isArray(s.rolls)||s.rolls.length>40||!s.options||!s.results)throw Error('开局存档无效');
      const o=s.options;if(typeof o.name!=='string'||o.name.length>40||!allowedName(o.name)||!['随机','男','女','无性别'].includes(o.gender)||o.tier!==null&&(!Number.isInteger(o.tier)||o.tier<1||o.tier>10)||o.level!==null&&(!Number.isInteger(o.level)||o.level<0||o.level>99))throw Error('自选开局数据无效');
      const v=s.results;for(const key of steps.slice(0,s.cursor)){if(['surname','given'].includes(key)&&o.name||key==='soulAttribute'&&v.tier<=3)continue;if(v[key]===undefined)throw Error('开局结果缺失：'+key);}
      for(const [key,min,max]of [['charm',1,10],['luck',1,10],['age',s.timeSchema===2?16:10,s.timeSchema===2?40:18],['month',1,10],['span',s.timeSchema===2?10:1,s.timeSchema===2?34:6],['originRank',1,10],['talent',1,10],['tier',1,10],['level',0,99],...R.KEYS.map(k=>[k,-10,10]),['W',-10,10]])if(v[key]!==undefined&&(!Number.isInteger(v[key])||v[key]<min||v[key]>max))throw Error('开局骰值无效：'+key);
      if(s.talentBindingVersion===1&&o.level===null&&v.talent!==undefined&&v.level!==undefined&&v.level!==v.talent)throw Error('绑定先天魂力与修炼天赋不一致');
      if(s.timeSchema===2&&v.span!==undefined&&v.span!==v.age-6)throw Error('觉醒时间数据无效');
      if(s.timeSchema===2&&o.level===null&&v.level!==undefined&&(v.level<1||v.level>10))throw Error('先天魂力无效');
      if(v.span!==undefined&&v.span>v.age-6)throw Error('启程年龄无效');
      if(s.version===2&&(typeof s.generatedName!=='string'||!s.generatedName.length||s.generatedName.length>40||!allowedName(s.generatedName)||!Array.isArray(s.hiddenRolls)||s.hiddenRolls.length>20))throw Error('暗骰姓名数据无效');
      if(v.soulId!==undefined){const soul=catalog.find(x=>x.id===v.soulId);if(!soul||soul.tier!==v.tier||v.soulKind&&v.soulKind!==soul.main_kind||s.attributeSchema===2&&v.tier>3&&v.soulAttribute&&attributeKey(soul)!==v.soulAttribute||v.style&&!R.mainStyles(soul).includes(v.style)||v.release&&!soul.release_options.includes(v.release))throw Error('开局武魂无效');}
      if(s.version===2&&v.soulKind!==undefined&&!catalog.some(x=>x.tier===v.tier&&x.main_kind===v.soulKind))throw Error('武魂种类无效');
      if(s.version===2&&s.attributeSchema===2&&v.soulAttribute!==undefined&&!catalog.some(x=>x.tier===v.tier&&x.main_kind===v.soulKind&&attributeKey(x)===v.soulAttribute))throw Error('武魂属性无效');
    }
  }
  const api={CULTIVATION,cultivationRates,CHARM_WORDS,LUCK_WORDS,fortuneDescription,Draft,ORIGINS,TALENTS,STEPS,SURNAMES,GIVEN_NAMES,GIVEN_CHARS,ATTRIBUTE_ORDER,soulAttributes,attributeKey,allowedName,aptitude,aptitudeSummary};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WitnessCreation=api;
})(typeof globalThis==='undefined'?this:globalThis);
