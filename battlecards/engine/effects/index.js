// engine/effects/index.js — the effect system facade (docs/05, PR 40).
// Re-exports the registry API and loads every themed handler file for its
// registration side effects. core.js imports from here.
export * from './registry.js';
import './handlers-triggers.js';
import './handlers-removal.js';
import './handlers-summon.js';
import './handlers-buffs.js';
import './handlers-deck.js';
import './handlers-cost.js';
import './handlers-copy.js';
import './handlers-hero.js';
import './handlers-misc.js';
import './handlers-heist.js';
