(function(root){
  'use strict';
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  function hash(text){let n=2166136261;for(const ch of String(text)){n^=ch.codePointAt(0);n=Math.imul(n,16777619);}return n>>>0;}
  function admissionLevel(level){const rings=Math.floor(Math.max(0,level-1)/10);return Math.max(1,rings*10+1,level-5);}
  function skillCount(level){return Math.min(6,Math.floor(Math.max(0,level-1)/10));}
  function controlKind(args){return ['bind','interrupt'].includes(args.effectVariant)?args.effectVariant:hash('control-v9|'+[args.soul.id||args.soul.name,args.index,args.years,'控制',args.variant||0].join('|'))%2?'interrupt':'bind';}
  function decorateControl(skill,args){
    if(args.category!=='控制'||args.npcTemplate)return skill;
    const kind=controlKind(args),base=round((kind==='bind'?8:1)*skill.Q/2.8),s={...skill,effectVariant:kind,baseControl:base,effectRulesVersion:13};
    delete s.controlFloor;delete s.controlCap;
    s.name=args.soul.name+(kind==='bind'?'·禁锢·缚':'·震断·震');
    if(kind==='interrupt'){s.castFixed=.5;s.cast=.5;s.cooldown=10;}
    s.effect='基础控制'+base+'秒；按双方精神力比例结算，无固定时长上限。成功后打断读条，行动条压至最多40%，结束后4秒免控。';return s;
  }
  const api={version:13,admissionLevel,skillCount,decorateControl};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WitnessCombatV13=api;
})(typeof globalThis==='undefined'?this:globalThis);
