// Generated from systems/. Edit the corresponding module, then run _sync_systems.py.
(function(root) {
  'use strict';
  const TIERS = [138,304,469,607,717,800,892,954,985,1000];
  function hashSeed(seed) {
    let h=2166136261;
    for (const c of String(seed)) { h^=c.codePointAt(0); h=Math.imul(h,16777619); }
    return h>>>0;
  }
  class DiceEngine {
    constructor(seed, state) { this.seed=String(seed); this.state=state===undefined?hashSeed(seed):state>>>0; }
    nextUint() {
      this.state=(this.state+0x6D2B79F5)>>>0;
      let t=this.state;
      t=Math.imul(t^(t>>>15),t|1);
      t^=t+Math.imul(t^(t>>>7),t|61);
      return (t^(t>>>14))>>>0;
    }
    die(sides) {
      if (!Number.isInteger(sides)||sides<2||sides>100000) throw Error('骰子面数须为2—100000的整数');
      const limit=Math.floor(4294967296/sides)*sides;
      let u; do { u=this.nextUint(); } while(u>=limit);
      return u%sides+1;
    }
    roll(sides,count=1,modifier=0) {
      if(!Number.isInteger(count)||count<1||count>100) throw Error('同投数量须为1—100的整数');
      if(!Number.isInteger(modifier)||modifier< -999||modifier>999) throw Error('总修正须为−999到999的整数');
      const before=this.state;
      const faces=Array.from({length:count},()=>this.die(sides));
      return {sides,count,modifier,faces,subtotal:faces.reduce((a,b)=>a+b,0),total:faces.reduce((a,b)=>a+b,0)+modifier,before,after:this.state};
    }
  }
  function tierFor(value) {
    if(!Number.isInteger(value)||value<1||value>1000) throw Error('强度骰面超出范围');
    return TIERS.findIndex(n=>value<=n)+1;
  }
  const api={DiceEngine,hashSeed,tierFor,TIERS};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.WitnessDice=api;
})(typeof globalThis==='undefined'?this:globalThis);
