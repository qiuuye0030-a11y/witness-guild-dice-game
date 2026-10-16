// Growth passives consume the existing choices and final gains; no extra dice or menu.
const CampaignTraits=(function(root){
 const runtime=typeof module!=='undefined'&&module.exports?require('./v13-runtime.cjs'):root;
 const B=runtime.WitnessTraitBalance,registry=runtime.WitnessTraitRegistry,copy=x=>JSON.parse(JSON.stringify(x));
 function remember(c){const s=c.state,soul=c.soul(),t=registry.getBySoulId(soul.id);if(!t){delete s.soulTrait;return null;}
  const previous=s.soulTrait?.definitionId===t.id?s.soulTrait:null;
  if(!previous||previous.version!==2||previous.soulId!==soul.id||Object.keys(previous).some(k=>!['version','soulId','definitionId','state','history','serial'].includes(k))){
   s.soulTrait={version:2,soulId:soul.id,definitionId:t.id,state:t.kind==='growth'?(previous?.state||B.createState(t,s.seed+':growth',{effectiveTier:soul.tier})):null};
   if(t.kind==='growth'){s.soulTrait.history=previous?.history||[];s.soulTrait.serial=previous?.serial||0;}
  }
  return {t,p:s.soulTrait};
 }
 function binding(c){const bound=remember(c);return bound?.t.kind==='growth'?bound:null;
 }
 function reward(key,amount,p){const c=this.state.character,before={...c.growth};CampaignCore.methods.reward.call(this,key,amount,p);
  if(this.state.features?.traitsEnabled===false||!CampaignCore.R.KEYS.includes(key))return;
  const bound=binding(this);if(!bound)return;const {t,p:g}=bound,actual=Math.max(0,c.growth[key]-before[key]);if(!actual)return;
  const expectedRaw=this._traitExpected?.[key];if(this._traitExpected)delete this._traitExpected[key];const expectedAmount=amount>0&&Number.isFinite(expectedRaw)?Math.max(actual,actual*expectedRaw/amount):actual;
  const result=B.applyToChoice(t,g.state,{id:'reward:'+(++g.serial),time:this.state.completed,stage:this.state.completed,trainingKey:p.training,rewardKey:key,method:p.training,amount:actual,expectedAmount,effectiveTier:this.soul().tier});g.state=result.state;
  if(result.applied){const bonus=CampaignCore.R.round2(result.delta);c.growth[key]=CampaignCore.R.round2(c.growth[key]+bonus);this.receipt(p,'trait',t.name+' · '+CampaignCore.R.LABELS[key],bonus,before[key]+actual,c.growth[key],'点',key);p.reward.push(t.name+'：'+CampaignCore.R.LABELS[key]+' +'+bonus);}
 }
 function resolveEventBranch(option,success,excellent,p){const prior=this._traitExpected,map={};for(const [key,value]of Object.entries(option.gain||{})){const actualKey=key==='TRAIN'?p.training:key==='WEAK'?CampaignCore.R.KEYS[this.state.character.deviations.indexOf(Math.min(...this.state.character.deviations))]:key;if(CampaignCore.R.KEYS.includes(actualKey))map[actualKey]=CampaignCore.R.round2(value*(p.bias>=17?1.6:p.bias>=13?1.2:p.bias<=4?1.3:1));}this._traitExpected=map;try{return QuestActions.methods.resolveEventBranch.call(this,option,success,excellent,p);}finally{this._traitExpected=prior;}}
 function chooseEvent(...args){const s=this.state,p=s.pending,result=CampaignCore.methods.chooseEvent.apply(this,args);if(s.features?.traitsEnabled===false)return result;
  const bound=binding(this);if(!bound)return result;const {t,p:g}=bound,history=g.history,prior=history.at(-1),key=p.training,stage=s.completed;
  const text=String(p.outcome?.text||'')+' '+String(this.event()?.options?.[p.choice]?.text||''),valid=p.receipts.some(r=>r.kind==='attribute'&&r.amount>0);
  const physical=k=>['B','D','A'].includes(k),review=p.outcome?.success===true&&/复盘|回顾|反思/.test(text),rest=p.outcome?.success===true&&/休整|休息|休养|恢复/.test(text),skill=/魂技|招式/.test(text),adapt=/适应|环境/.test(text);
  const flags={repeat_direction:prior?.key===key,repeat_method:prior?.key===key,repeat_skill:skill&&prior?.skill,alternate_direction:prior&&prior.key!==key,practice_review:review&&prior?.valid,skill_body_switch:prior&&physical(prior.key)!==physical(key),physical_load:physical(key),control_load:key==='C',environment_load:adapt&&text.includes(this.soul().attribute),valid_failure:p.outcome?.success===false,skill_obstacle:skill&&p.outcome?.success===false,adapt_obstacle:adapt&&p.outcome?.success===false,rest_after_training:rest&&prior?.valid,review_after_skill:review&&prior?.skill,restore_after_load:rest&&prior?.physical,training_milestone:(history.filter(h=>h.valid).length+1)%3===0,skill_milestone:skill&&(history.filter(h=>h.skill&&h.valid).length+1)%3===0,adapt_milestone:adapt&&p.outcome?.success===true};
  const currentStage=history.filter(h=>h.stage===stage),directions=[...new Set([key,...p.receipts.filter(r=>r.kind==='attribute'&&r.amount>0).map(r=>r.key)])],dirs=new Set([...currentStage.flatMap(h=>h.directions||[h.key]),...directions]),mains=new Set([...currentStage.map(h=>h.key),key]),environment=this.event()?.id;
  if(valid&&flags[t.spec.event]){const r=B.recordEvent(t,g.state,{id:'event:'+stage+':'+(p.eventIndex??'')+':'+g.serial,type:t.spec.event,time:stage,stage,effectiveTier:this.soul().tier,trainingKey:key,method:key,valid:true,focused:mains.size===1,dual:dirs.size>=2,rested:rest||currentStage.some(h=>h.rest),reviewed:review||currentStage.some(h=>h.review),firstMethod:!currentStage.some(h=>h.key===key),familiarMethod:history.some(h=>h.stage<stage&&h.key===key),adaptedEnvironment:adapt&&history.some(h=>h.adapt&&h.valid&&h.environment===environment),actualContribution:p.receipts.filter(r=>r.kind==='attribute').reduce((n,r)=>n+r.amount,0),contributionReference:10});g.state=r.state;}
  history.push({stage,key,directions,environment,valid,rest,review,skill,adapt,physical:physical(key)});if(history.length>200)history.shift();return result;
 }
 function battleOptions(...args){const options={...CampaignModern.methods.battleOptions.apply(this,args),traitsEnabled:this.state.features?.traitsEnabled!==false};this.state.battleOptions=copy(options);return options;}
 function refresh(){CampaignModern.methods.refresh.call(this);if(this.state.character)remember(this);}
 return {methods:{reward,chooseEvent,battleOptions,refresh,resolveEventBranch}};
})(globalThis);
