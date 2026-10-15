const ShieldActions=(function(root){
  const copy = value => JSON.parse(JSON.stringify(value));
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const channelName = channel => channel === '精神' ? '精神' : '生命';
  const selfOnly = skill => !!(skill && (skill.phantomDance || skill.iceArmor));

  // V13 has no source information for shields. Preserve at most one legacy layer
  // per channel until its original deadline; never reimport an initialized unit.
  function legacyLayers(unit, now) {
    const until = number(unit.shieldUntil);
    if (until <= now) return [];
    const layers = [];
    const lifeAmount = Math.max(0, number(unit.shieldHP));
    const mindAmount = Math.max(0, number(unit.shieldSH));
    if (lifeAmount > 0 || number(unit.guard) > 0) layers.push({
      source: 'legacy:' + unit.id + ':life', casterId: null, skillId: null,
      label: '原战报生命防护', channel: '生命', amount: lifeAmount,
      guard: Math.max(0, number(unit.guard)), oneHit: !!unit.oneHit,
      until, rageOnBreak: !!unit.rageOnBreak, order: 0, legacy: true
    });
    if (mindAmount > 0) layers.push({
      source: 'legacy:' + unit.id + ':mental', casterId: null, skillId: null,
      label: '原战报精神防护', channel: '精神', amount: mindAmount,
      guard: 0, oneHit: false, until, rageOnBreak: false, order: 0, legacy: true
    });
    return layers;
  }
  function readLayers(unit, now) {
    const source = Array.isArray(unit.shieldLayers) ? unit.shieldLayers : legacyLayers(unit, now);
    return source.filter(layer => number(layer.until) > now &&
      (number(layer.amount) > 0 || number(layer.guard) > 0)).map(layer => ({
        ...layer, channel: channelName(layer.channel),
        amount: Math.max(0, number(layer.amount)), guard: Math.max(0, number(layer.guard)),
        order: number(layer.order), until: number(layer.until),
        oneHit: !!layer.oneHit, rageOnBreak: !!layer.rageOnBreak
      }));
  }
  function syncLegacy(unit, now) {
    const layers = unit.shieldLayers || [];
    const active = layers.filter(layer => layer.until > now);
    const life = active.filter(layer => layer.channel === '生命').sort((a, b) => b.order - a.order);
    const mental = active.filter(layer => layer.channel === '精神');
    unit.shieldHP = life.reduce((sum, layer) => sum + layer.amount, 0);
    unit.shieldSH = mental.reduce((sum, layer) => sum + layer.amount, 0);
    // The earliest deadline keeps the existing time scheduler correct. Layer-aware
    // UI can use shieldLayersFor() to display each independent expiration.
    unit.shieldUntil = active.length ? Math.min(...active.map(layer => layer.until)) : 0;
    unit.guard = Math.max(0, ...life.map(layer => layer.guard));
    unit.oneHit = !!life[0]?.oneHit;
    unit.rageOnBreak = !!life[0]?.rageOnBreak;
  }

  const shieldLayersFor = function (unit, channel) {
    return readLayers(unit, this.now).filter(layer => channel === undefined ||
      layer.channel === channelName(channel)).sort((a, b) => b.order - a.order);
  };
  const expireShields = function (unit) {
    for (const target of unit ? [unit] : this.units || []) {
      target.shieldLayers = readLayers(target, this.now);
      syncLegacy(target, this.now);
    }
  };
  const addShieldLayer = function (target, spec) {
    this.expireShields(target);
    const channel = channelName(spec.channel);
    const source = String(spec.source || ('system:' + channel));
    const highestOrder = Math.max(0, ...this.units.flatMap(unit =>
      (unit.shieldLayers || []).map(layer => number(layer.order))));
    this.shieldLayerSequence = Math.max(number(this.shieldLayerSequence), highestOrder) + 1;
    const layer = {
      source, casterId: spec.casterId || null, skillId: spec.skillId || null,
      label: spec.label || '防护', channel,
      amount: Math.max(0, Math.round(number(spec.amount))),
      guard: Math.max(0, Math.min(1, number(spec.guard))),
      oneHit: !!spec.oneHit, until: number(spec.until, this.now + 8000),
      rageOnBreak: !!spec.rageOnBreak, order: this.shieldLayerSequence
    };
    target.shieldLayers = target.shieldLayers.filter(old =>
      old.channel !== channel || old.source !== source);
    if (layer.until > this.now && (layer.amount > 0 || layer.guard > 0)) target.shieldLayers.push(layer);
    syncLegacy(target, this.now);
    return { ...layer };
  };

  // Pure preview: damage has already passed damageValue() (ordinary defense,
  // admission scaling and V13 ice-armour snapshot). Do not apply those twice.
  const previewShieldDamage = function (target, damage, channel, source) {
    const all = readLayers(target, this.now);
    const kind = channelName(channel);
    const layers = all.filter(layer => layer.channel === kind).sort((a, b) => b.order - a.order);
    let incoming = Math.max(0, number(damage));
    const reduction = source ? this.value(source, 'damageDown') : 0;
    if (reduction && incoming > 0) incoming = Math.max(1, Math.round(incoming * (1 - reduction)));
    if (source && this.trait(source) === 'annihilation' && layers.some(layer => layer.amount > 0)) {
      incoming = Math.round(incoming * 1.3);
    }
    const beforeShields = incoming;
    let blocked = 0, guardBlocked = 0, rageTriggers = 0;
    const consumed = new Set();
    const hits = [];
    for (const layer of layers) {
      if (incoming <= 0) break; // Untouched inner layers keep one-hit eligibility.
      const before = incoming;
      let guardAmount = 0;
      if (layer.guard > 0) {
        const reduced = Math.max(0, Math.round(incoming * (1 - layer.guard)));
        guardAmount = incoming - reduced;
        guardBlocked += guardAmount;
        incoming = reduced;
        layer.guard = 0;
      }
      const absorbed = Math.min(layer.amount, incoming);
      layer.amount -= absorbed;
      incoming -= absorbed;
      blocked += absorbed;
      const removed = layer.oneHit || (layer.amount <= 0 && layer.guard <= 0);
      if (removed) {
        consumed.add(layer);
        if (layer.rageOnBreak) rageTriggers++;
      }
      hits.push({ source: layer.source, label: layer.label, incoming: before,
        blocked: absorbed, guardBlocked: guardAmount, removed, remaining: removed ? 0 : layer.amount });
    }
    return {
      beforeShields, afterShields: incoming, blocked, guardBlocked, rageTriggers, hits,
      nextLayers: all.filter(layer => !consumed.has(layer) && (layer.amount > 0 || layer.guard > 0))
    };
  };
  const previewProtection = function (target, damage, channel, source) {
    const shield = this.previewShieldDamage(target, damage, channel, source);
    const special = channel !== '精神' && this.value(target, 'soulArmor') > 0;
    const fraction = Math.min(.70, this.resourceConfig.absorb + (special ? .15 : 0));
    const unitCost = this.resourceConfig.mpPerDamage * (special ? .75 : 1);
    const absorbed = Math.min(Math.floor(shield.afterShields * fraction),
      Math.floor(Math.max(0, target.mp) / unitCost));
    const mpCost = Math.ceil(absorbed * unitCost);
    return { ...shield, absorbed, mpCost, healthDamage: shield.afterShields - absorbed };
  };

  const dispelShieldLayers = function (target, fraction, channel = '生命') {
    this.expireShields(target);
    const selected = target.shieldLayers.filter(layer => layer.channel === channelName(channel))
      .sort((a, b) => b.order - a.order);
    const multiplier = 1 - Math.max(0, Math.min(1, number(fraction)));
    const before = selected.reduce((sum, layer) => sum + layer.amount, 0);
    const expected = Math.round(before * multiplier);
    let assigned = 0;
    for (const layer of selected) {
      layer._dispelFraction = layer.amount * multiplier - Math.floor(layer.amount * multiplier);
      layer.amount = Math.floor(layer.amount * multiplier);
      assigned += layer.amount;
    }
    // Preserve the old aggregate rounding exactly, with deterministic remainder
    // assignment to the largest fractional share (outer layer breaks ties).
    const remainderOrder = [...selected].sort((a, b) =>
      b._dispelFraction - a._dispelFraction || b.order - a.order);
    for (let i = 0; i < expected - assigned; i++) remainderOrder[i % remainderOrder.length].amount++;
    for (const layer of selected) delete layer._dispelFraction;
    target.shieldLayers = target.shieldLayers.filter(layer => layer.amount > 0 || layer.guard > 0);
    syncLegacy(target, this.now);
    return before - expected;
  };

  const oldTargets = MemberActions.methods.targetOptions;
  const targetOptions = function (unit, action) {
    const skill = unit?.skills.find(item => item.id === action);
    return selfOnly(skill) ? (this.alive(unit) ? [unit] : []) : oldTargets.call(this, unit, action);
  };
  const oldCommand = MemberActions.methods.command;
  const command = function (id, action, targetId) {
    const unit = this.unit(id), skill = unit?.skills.find(item => item.id === action);
    if (!this.result && selfOnly(skill) && targetId !== undefined && targetId !== null && targetId !== id) {
      return '该魂技仅能对自身施放';
    }
    return oldCommand.call(this, id, action, targetId);
  };
  const oldPlan = MemberActions.methods.plan;
  const plan = function (unit, cast, pre) {
    this.expireShields();
    const skill = cast.skill;
    // Restored V13 in-flight shape casts follow the now-explicit self target.
    if (selfOnly(skill) && cast.target !== unit.id) cast = { ...cast, target: unit.id };
    const target = this.unit(cast.target);
    if (skill?.category === '防御') {
      const result = { u: unit, t: target, cast, s: skill, damage: 0, heal: 0,
        channel: skill.channel, effects: [] };
      if (!target || !this.alive(target)) return result;
      const mental = skill.channel === '精神';
      let amount = skill.guard ? 0 : Math.round(.45 * (skill.Q || 1) *
        (mental ? pre[unit.id].MA : pre[unit.id].SA));
      const trait = this.trait(unit);
      if (trait === 'guard' && !mental) amount = Math.round(amount * 1.16);
      if (trait === 'water' && !mental) amount = Math.round(amount * 1.12);
      if (trait === 'ghost' && mental) amount = Math.round(amount * 1.16);
      result.effects.push(() => this.addShieldLayer(target, {
        source: this.statusSource(unit, skill), casterId: unit.id, skillId: skill.id,
        label: skill.name, channel: mental ? '精神' : '生命', amount,
        guard: skill.guard || 0, oneHit: !!skill.oneHit,
        rageOnBreak: !!skill.rageOnBreak, until: this.now + 8000
      }));
      return result;
    }
    if (skill?.category === '控制' && skill.dispel) {
      const safeCast = { ...cast, skill: { ...skill, dispel: 0 } };
      const result = oldPlan.call(this, unit, safeCast, pre);
      result.s = skill;
      result.cast = cast;
      if (target && this.alive(target)) result.effects.unshift(() => {
        const amount = this.dispelShieldLayers(target, skill.dispel, '生命');
        if (amount) this.addLog(target.name + '的生命护盾削减' + amount,
          { type: 'dispel', actor: unit.id, target: target.id, amount, fx: skill.fx });
      });
      return result;
    }
    return oldPlan.call(this, unit, cast, pre);
  };

  // Same V13 resource/health semantics, with only shield traversal replaced.
  // Keep damageDown, blood marks, life trait healing and resource event payloads.
  const applyDamage = function (target, damage, channel, source, fx) {
    if (!damage || !this.alive(target)) return;
    this.expireShields(target);
    const beforeHP = target.hp;
    const mind = channel === '精神';
    const beforeProtection = mind ? target.sh : target.hp;
    const outcome = this.previewProtection(target, damage, channel, source);
    target.shieldLayers = outcome.nextLayers;
    syncLegacy(target, this.now);
    for (let i = 0; i < outcome.rageTriggers; i++) this.gainRage(target, 1);
    target.mp -= outcome.mpCost;
    const incoming = outcome.healthDamage;
    if (mind) target.sh = Math.max(0, target.sh - incoming);
    else if (target.release === '召唤') {
      if (target.petAlive) {
        target.petHP = Math.max(0, target.petHP - incoming);
        if (target.petHP === 0) {
          target.petAlive = false;
          target.cast = null;
          this.endTurn(target, false);
          target.readyAt = Math.max(target.readyAt, this.now + 2000);
          this.addLog(target.name + '的召唤体败退，停顿2秒。');
        }
      } else target.bodyHP = Math.max(0, target.bodyHP - incoming);
      target.hp = target.bodyHP + target.petHP;
    } else target.hp = Math.max(0, target.hp - incoming);
    if (outcome.mpCost) this.addLog(target.name + '受击同时结算：' +
      (mind ? '精神护持' : '生命') + ' −' + (beforeProtection - (mind ? target.sh : target.hp)) +
      '，魂力 −' + outcome.mpCost, {
        type: 'armor', target: target.id, actor: source?.id,
        paid: outcome.mpCost, absorbed: outcome.absorbed,
        healthLost: beforeProtection - (mind ? target.sh : target.hp),
        remainingDamage: incoming, channel
      });
    this.addLog(target.name + (mind ? '精神护持' : '生命') + ' −' + incoming +
      (outcome.blocked ? '（盾挡' + outcome.blocked + '）' : ''), {
        type: 'damage', actor: source?.id, target: target.id, fx,
        amount: incoming, channel, shieldBlocked: outcome.blocked,
        guardBlocked: outcome.guardBlocked, shieldLayersHit: outcome.hits
      });
    if (!mind && target.style === '辅助' && !target.firstHit &&
        this.trait(target) === 'life' && target.hp > 0) {
      target.firstHit = true;
      this.heal(target, Math.round(target.model.derived.HP * .03), '生命');
    }
    if (source?.soul.name === '血君' && target.hp < beforeHP) {
      target.bloodMarks ||= [];
      if (!target.bloodMarks.includes(source.id)) target.bloodMarks.push(source.id);
    }
  };


  function initialize(battle) {
    battle.combatRulesVersion=14; battle.v14ShieldVersion=1;
    battle.expireShields();
    battle.shieldLayerSequence=Math.max(number(battle.shieldLayerSequence),0,...battle.units.flatMap(u=>u.shieldLayers.map(l=>number(l.order))));
    for(const unit of battle.units){
      if(selfOnly(unit.cast?.skill))unit.cast.target=unit.id;
      for(const skill of unit.skills)if(selfOnly(skill))skill.target='仅自身';
    }
  }
  root.WitnessMechanicsV14={version:14,shieldVersion:1,rules:'outer-first; same-caster-skill-refresh; independent-channels; legacy-layer-expires',channelName,selfOnly};
  root.WitnessBattle.mechanicsVersion=14;
return {initialize,methods:{shieldLayersFor,expireShields,addShieldLayer,previewShieldDamage,previewProtection,dispelShieldLayers,targetOptions,command,plan,applyDamage}};
})(globalThis);
