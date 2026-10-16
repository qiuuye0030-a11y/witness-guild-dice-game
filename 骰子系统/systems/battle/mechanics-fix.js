// Migrate only ongoing battles. Completed reports remain historical records.
const MechanicsFix=(function(root){
  function restore(b,snapshot){
    if(snapshot.mechanicsFixVersion===1||b.result)return;
    const B=root.WitnessBattle,targets=new Set(['yanan-3','yanan-4','yixiaobei-4']);
    let missingTiming=false;
    for(const u of b.units){
      const template=B.templates.find(t=>t.id===u.templateId);
      if(template&&u.skills.some(s=>targets.has(s.id))){
        const canonical=B.templateUnit(template,u.level,u.id,u.team).skills;
        u.skills=u.skills.map(s=>targets.has(s.id)?canonical.find(x=>x.id===s.id)||s:s);
        if(targets.has(u.cast?.skill?.id))u.cast.skill=JSON.parse(JSON.stringify(u.skills.find(s=>s.id===u.cast.skill.id)));
      }
      for(const s of u.skills.filter(s=>s.statusLifetime==='timed')){
        const source=b.statusSource(u,s);
        for(const target of b.units){
          target.statuses=target.statuses.filter(st=>!(st.source===source&&s.genericDefDown===false&&['defDown','mindDown'].includes(st.type)));
          for(const st of target.statuses.filter(st=>st.source===source)){
            const release=[...b.log].reverse().find(e=>{
              if(e.type!=='release'||e.actor!==u.id||e.label!==s.name||!(e.target===target.id||target.id===u.id&&st.type==='evasion'))return false;
              if(!['defDown','mindDown'].includes(st.type))return true;
              return b.log.some(check=>{const roll=String(check.text||'').match(/减益判定(\d+) \/ (\d+(?:\.\d+)?)%/);return check.time===e.time&&check.actor===u.id&&check.target===target.id&&roll&&Number(roll[1])<=Math.round(Number(roll[2]));});
            });
            if(release){st.until=release.time+s.duration*1000;st.appliedAt=release.time;}
            else {st.until=b.now;missingTiming=true;}
            delete st.hitsRemaining;delete st.actionsRemaining;
          }
          target.statuses=target.statuses.filter(st=>st.until>b.now);
        }
      }
      // Old saves recorded boosted baseDamage but not the first-strike flag.
      // Identify the surviving DOT from its release and the first attack after
      // the one-time blood domain activation, instead of guessing from defence.
      const releases=b.log.filter(e=>e.type==='release'&&e.actor===u.id);
      const domain=releases.findIndex(e=>u.skills.some(s=>s.name===e.label&&s.bloodDomain));
      const first=domain<0?null:releases.slice(domain+1).find(e=>e.label==='普攻'||u.skills.some(s=>s.name===e.label&&['攻击','持续伤害'].includes(s.category)));
      for(const target of b.units)for(const dot of target.dots.filter(d=>d.source===u.id&&d.damageMultiplier===undefined)){
        const skill=u.skills.find(s=>dot.key===u.id+'-'+s.id);
        const appliedAt=skill?dot.next-(skill.dotFirstMs||3000)-((skill.dotTicks||3)-dot.ticks)*3000:null;
        dot.damageMultiplier=first&&skill&&first.label===skill.name&&first.time===appliedAt?1.35:1;
      }
    }
    b.refreshDotDamage();b.mechanicsFixVersion=1;
    b.addLog('已同步持续伤害、短时状态与逸仙剑体修复规则。'+(missingTiming?'部分旧短时状态缺少释放时间记录，已解除。':''),{type:'rulesMigration',mechanicsFixVersion:1});
  }
  return {restore};
})(globalThis);
