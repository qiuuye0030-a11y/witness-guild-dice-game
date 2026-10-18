'use strict';
const handlers={
 'tt-essence':(e,p)=>e.type==='maxMP'?p.maxMP:0,
 'tt-dragon':(e,p)=>e.type==='phasePower'&&e.lowHP?p.phasePower:0,
 'tt-thorn':(e,p)=>e.type==='stackDamage'?p.stackDamage*Math.min(p.stackCap,e.stacks||0):0,
 'tt-rune':(e,p)=>e.type==='skillDamage'?p.skillDamage:0,
 'tt-erosion':(e,p)=>e.type==='debuffAmp'?p.debuffAmp:0,
 'tt-frost':(e,p)=>e.type==='enemyAgilityStack'?p.enemyAgilityStack:0,
 'tt-shadow':(e,p)=>e.type==='enemyGauge'?p.enemyGauge:e.type==='enemyAccuracy'?p.enemyAccuracy:0,
 'tt-gap':(e,p)=>e.type==='shieldPierce'?p.shieldPierce:0,
 'tt-lamp':(e,p)=>e.type==='benefitDown'?p.benefitDown:0,
 'tt-shell':(e,p)=>e.type==='openingShield'?p.openingShield:0,
 'tt-ghost':(e,p)=>e.type==='manaGuard'?p.manaGuard:0,
 'tt-reserve':(e,p)=>e.type==='lifeReserve'?p.lifeReserve:0,
 'tt-spring':(e,p)=>e.type==='regen'?p.regen:0,
 'tt-armor':(e,p)=>e.type==='armorPierce'?p.armorPierce:0,
 'tt-sacrifice':(e,p)=>e.type==='extraCost'?p.extraCost:e.type==='wardPierce'?p.wardPierce:0,
 'tt-clarity':(e,p)=>e.type==='controlShorten'?p.controlShorten:0,
 'tt-iceward':(e,p)=>e.type==='iceResist'?p.iceResist:0,
 'tt-sight':(e,p)=>e.type==='hitAssist'?Math.min(p.hitBonusCap,Math.max(0,p.hitFloor-e.chance)):0,
 'tt-flow':(e,p)=>e.type==='mpRegen'?p.mpRegen:e.type==='costDiscount'?p.costDiscount:0,
 'tt-field':(e,p)=>e.type==='allyAgility'?p.allyAgility:e.type==='enemyAgility'?p.enemyAgility:e.type==='enemyAction'?p.enemyAction:0
};
const fs=require('node:fs'),path=require('node:path');
const definitions=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../data/soulbone/trait-pool.json'),'utf8')).traits;
const latest=new Map(definitions.map(t=>[t.id,t]));
const inheritedUpdates=new Map(JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../data/beast/library.json'),'utf8')).beasts.flatMap(b=>b.traits).filter(t=>['sky-full-of-miasma','blaze-armor-break'].includes(t.id)).map(t=>[t.id,t]));
function upgrade(trait){const revised=inheritedUpdates.get(trait?.traitId||trait?.id);if(revised)return {...trait,name:revised.name,effect:revised.effect,params:{...revised.inherit.params},inheritanceRulesVersion:120501};const d=latest.get(trait?.traitId||trait?.id);if(!d||!(trait.implementationVersion<2))return trait;return {...trait,name:d.name,effect:d.effect,params:{...d.params},implementationVersion:2,definitionVersion:3};}
function value(traits,type,context={}){let out=0;const seen=new Set();for(const raw of traits||[]){const t=upgrade(raw),id=t.handler;if(seen.has(id)||!handlers[id])continue;seen.add(id);out+=handlers[id]({...context,type},t.params||{});}return out;}
module.exports={handlers,value,upgrade};
