// Restore old snapshots without reviving retired soul passives.
const ActorState={initialize(){delete this.traitsEnabled;delete this.traitRulesVersion;for(const u of this.units){delete u.passive;delete u.soul.combat_profile;for(const k of Object.keys(u))if(k.startsWith('_trait'))delete u[k];if(u.soul.id.startsWith('npc-'))u.model.ratingProfile='npc';}}};
