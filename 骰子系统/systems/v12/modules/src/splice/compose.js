'use strict';

/**
 * 拼接入口：把所有独立模块装成一个可直接调用的 API。
 *
 * 本文件不会修改主游戏、不会写主游戏存档、不会注册任何全局变量。
 * 主游戏接入方式见《拼接说明.md》：在现有 compose 一次性装配处创建本组合，
 * 把活着的 WitnessRules / 战斗引擎作为注入项传入即可。
 */

const { VERSIONS } = require('../versions');
const { createRng, RollLog, DiceEngine } = require('../rng');
const { createRoster } = require('../npc/roster');
const npcCombat = require('../npc/combat');
const huntConditions = require('../hunt/conditions');
const huntAllies = require('../hunt/allies');
const huntLedger = require('../hunt/ledger');
const huntBattle = require('../hunt/battle');
const huntTexts = require('../hunt/texts');
const huntFlow = require('../hunt/flow');
const { createHuntController } = require('../hunt/controller');
const { createBeastLibrary } = require('../beast/library');
const boneDrop = require('../soulbone/drop');
const { createTraitPool } = require('../soulbone/trait-pool');
const { createHandlerRegistry } = require('../soulbone/handlers');
const soulboneInstance = require('../soulbone/instance');
const soulboneAbsorption = require('../soulbone/absorption');
const soulboneMigrate = require('../soulbone/migrate');
const soulboneTenThousand = require('../soulbone/ten-thousand');
const inheritance = require('../reward/inheritance');
const rewardTransaction = require('../reward/transaction');
const { createHuntRewardRunner } = require('../reward/runner');
const battleHooks = require('../battle/hooks');
const battleEquipment = require('../battle/equipment');
const bridge = require('../bridge/v1101');
const skillAttributes = require('../battle/skill-attributes');

function createModules(options = {}) {
  const activeBridge = options.rules ? {
    rules: () => options.rules,
    baseline: () => ({ injected: true, rulesVersion: options.rules.calculationVersion, ratingRulesVersion: options.rules.ratingRulesVersion }),
    ...Object.fromEntries(['rating', 'derive', 'makeSkill', 'pickCategory', 'controlEffect', 'benchmark', 'band'].map((key) => [key, (...args) => {
      if (typeof options.rules[key] !== 'function') throw new Error('注入的战斗规则缺少 ' + key);
      const result = options.rules[key](...args);
      return key === 'makeSkill' ? skillAttributes.tagSkill(result, args[0].soul) : result;
    }]))
  } : bridge;
  const roster = options.roster || createRoster(options.rosterDir ? { dir: options.rosterDir } : undefined);
  const ratingFn = options.ratingFn || activeBridge.rating;
  const library = options.library || createBeastLibrary(options.libraryPath ? { dataPath: options.libraryPath } : undefined);
  const beastHandlers=Object.fromEntries(library.available().flatMap(b=>b.traits.map(t=>[t.inherit.handler,event=>{if(!event?.battle||!['effective','tryControl','applyDamage','onActionComplete'].includes(event.method)||typeof event.battle[event.method]!=='function')throw Error('继承特性须由已接入的战斗宿主分发');return event.battle[event.method](...(event.args||[]));}])));
  const registry = options.registry || createHandlerRegistry({ ...beastHandlers, ...require('../soulbone/trait-effects').handlers, ...(options.handlers || {}) });
  const traitPool = options.traitPool || createTraitPool({ dataPath: options.poolPath, registry });
  const controller = createHuntController({ roster, ratingFn, library, config: options.config });

  function makeRewardRunner(store) {
    return createHuntRewardRunner({ library, store });
  }

  function status() {
    return {
      versions: { ...VERSIONS },
      baseline: activeBridge.baseline(),
      roster: roster.summary(),
      library: library.status(),
      traitPool: traitPool.status(),
      npcCombat: {
        hostIntegrated: false,
        operationTypes: npcCombat.coverage().length,
        primitives: npcCombat.PRIMITIVES.length,
        readiness: ['chengliang', 'xutaiping', 'sailiya_fengzhi'].map((id) => ({ id, ...npcCombat.assertCombatReady(roster.combatSpec(id)) }))
      },
      emptyStates: { beastLibrary: library.status().empty, traitPool: traitPool.status().empty }
    };
  }

  return Object.freeze({
    versions: VERSIONS,
    rng: { createRng, RollLog, DiceEngine },
    roster,
    hunt: { conditions: huntConditions, allies: huntAllies, ledger: huntLedger, battle: huntBattle, texts: huntTexts, flow: huntFlow, controller },
    npc: npcCombat,
    beast: { library },
    soulbone: { registry, effects: require('../soulbone/trait-effects'), drop: boneDrop, instance: soulboneInstance, tenThousand: soulboneTenThousand, traitPool, absorption: soulboneAbsorption, migrate: soulboneMigrate },
    reward: { ring: require('../reward/ring'), inheritance, transaction: rewardTransaction, createRunner: makeRewardRunner },
    battle: { hooks: battleHooks, equipment: battleEquipment, skillAttributes },
    bridge: activeBridge,
    status
  });
}

module.exports = { createModules };
