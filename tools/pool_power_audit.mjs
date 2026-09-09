// pool_power_audit.mjs — measure every land pool's power level against its tier band.
// (See Plans/ADVANCED_POOL_POWER_PLAN.md for the design.)
//
// Metric per pool (avgEffPower): for each creature,
//   (attack+health) − (1.5·cost + 2)   ... stat delta vs the vanilla curve
//   + count of real mechanics          ... keywords (beyond battlecry/deathrattle) + effect fields
// averaged over the pool's creatures. A proxy, but it compares pools honestly.
//
//   node tools/pool_power_audit.mjs            print the full table
//   node tools/pool_power_audit.mjs --check    exit 1 if any ENFORCED pool is below its band
//
// ENFORCED grows batch by batch as pools are brought to band (Plan §5) — a pool is
// added here in the same PR that pushes it, so power can't silently regress after.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS = path.join(HERE, '../battlecards/cards.json');
const CHECK = process.argv.includes('--check');

const BASIC = new Set(['Forest', 'Island', 'Mountain', 'Plains', 'Swamp', 'Wastes']);
// tier bands (avgEffPower minimums) — Plan §3
export const BANDS = { basic: null /* owner-tuned, informational */, mono: 1.5, two: 2.0, three: 3.0 };
// pools brought to band so far (append per batch PR)
export const ENFORCED = new Set(['Bant', 'Esper', 'Grixis', 'Jund', 'Naya', 'Jeskai', 'Mardu', 'Sultai', 'Temur', 'Abzan', 'Brokers', 'Obscura', 'Maestros', 'Riveteers', 'Cabaretti', 'Indatha', 'Ketria', 'Raugrin', 'Savai', 'Zagoth']);

const cards = JSON.parse(fs.readFileSync(CARDS, 'utf8')).cards;
const pools = new Map();
for (const c of cards) {
  if (c.landSet && !c.token) {
    if (!pools.has(c.landSet)) pools.set(c.landSet, []);
    pools.get(c.landSet).push(c);
  }
}

const MECH = ['effects', 'ongoing', 'ongoings', 'aura', 'taps', 'tapAbility', 'deathrattle', 'static', 'statics', 'secret', 'trap', 'quest', 'choices', 'counterSpell', 'counter', 'selfScale', 'costMod', 'altCost', 'xSpell', 'adventure', 'kicker', 'activated', 'overkill', 'combo', 'miracle', 'loyalty', 'ward', 'medic', 'regen', 'condKeyword', 'attackTax', 'magnetic', 'dormant', 'selfCost'];
const mechCount = c => MECH.filter(f => c[f] != null && !(Array.isArray(c[f]) && c[f].length === 0)).length
  + (c.keywords || []).filter(k => k !== 'battlecry' && k !== 'deathrattle').length;

function tierOf(set, members) {
  if (BASIC.has(set)) return 'basic';
  const colors = new Set(members.flatMap(c => c.colors || []));
  return colors.size <= 1 ? 'mono' : colors.size === 2 ? 'two' : 'three';
}

const rows = [];
for (const [set, members] of pools) {
  const creatures = members.filter(c => c.type === 'creature' && typeof c.attack === 'number' && typeof c.health === 'number');
  if (!creatures.length) continue;
  const eff = creatures.reduce((a, c) => a + (c.attack + c.health) - (1.5 * c.cost + 2) + mechCount(c), 0) / creatures.length;
  const tier = tierOf(set, members);
  rows.push({ set, tier, n: members.length, eff: +eff.toFixed(2), band: BANDS[tier], enforced: ENFORCED.has(set) });
}
rows.sort((a, b) => a.tier.localeCompare(b.tier) || a.eff - b.eff);

let failed = 0;
for (const r of rows) {
  const below = r.band != null && r.eff < r.band;
  const mark = r.enforced ? (below ? 'FAIL' : 'ok') : below ? 'below' : '';
  if (r.enforced && below) failed++;
  if (!CHECK) console.log(`${r.tier.padEnd(6)} ${r.set.padEnd(12)} n=${String(r.n).padEnd(3)} eff=${String(r.eff).padEnd(6)} band=${r.band ?? '-'} ${mark}`);
}
if (CHECK) {
  const bad = rows.filter(r => r.enforced && r.band != null && r.eff < r.band);
  if (bad.length) {
    console.error('pool_power_audit: ' + bad.length + ' enforced pool(s) below band: ' + bad.map(r => `${r.set} ${r.eff}<${r.band}`).join(', '));
    process.exit(1);
  }
  console.log('pool_power_audit: all ' + ENFORCED.size + ' enforced pools at band.');
}
