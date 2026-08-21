// paper_wave33_test.mjs — Minn (Ponder -> a self-scaling Illusion token) and the Xixira
// retrofit (multi-static: Fire Spell Damage +2 AND Shadow spells have Lifesteal).
import fs from 'fs';
import * as E from '../../engine.js';
import { firePonder } from '../../engine/core.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 12, rarity: 'common', tribe: 'Beast' };
byId._fire = { id: '_fire', name: 'F', type: 'sorcery', cost: 2, tribe: 'Fire', rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 3, target: 'creature' }] };
byId._shadow = { id: '_shadow', name: 'S', type: 'sorcery', cost: 2, tribe: 'Shadow', rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 4, target: 'creature' }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

ok('minn exists', byId.minn_wily_illusionist && byId.minn_wily_illusionist.cardClass === 'neutral' && byId.minn_wily_illusionist.collectible !== false);
ok('illusion_token exists (self-scaling)', byId.illusion_token && byId.illusion_token.token && byId.illusion_token.selfScale && byId.illusion_token.selfScale.tribe === 'Illusion');
ok('Xixira now has two statics (Fire SD + Shadow Lifesteal)', Array.isArray(byId.xixira_mirror_realm_necroczar.statics) && byId.xixira_mirror_realm_necroczar.statics.some(s => s.type === 'spell-damage-Fire') && byId.xixira_mirror_realm_necroczar.statics.some(s => s.type === 'spell-lifesteal-Shadow'));

function game() {
  const st = E.createGame(byId, seededRng(33), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const cast = (st, pi, id, tgtUid, tgtPl) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, { type: 'creature', uid: tgtUid, player: tgtPl }); };

// Minn — Ponder (2nd draw) creates an Illusion; two Illusions each scale to 2/1
{ const st = game(); put(st, 0, 'minn_wily_illusionist'); st.players[0].drawsThisTurn = 2;
  firePonder(st, 0, {});
  ok('Minn Ponder creates a 1/1 Illusion', st.players[0].board.filter(c => c.id === 'illusion_token').length === 1, st.players[0].board.map(c => c.id));
  firePonder(st, 0, {}); E.recomputeAuras(st);
  const ills = st.players[0].board.filter(c => c.id === 'illusion_token');
  ok('two Illusions each get +1/+0 (2/1)', ills.length === 2 && ills.every(c => c.attack === 2 && E.hp(c) === 1), ills.map(c => [c.attack, E.hp(c)])); }

// Xixira — Fire Spell Damage +2 still works
{ const st = game(); put(st, 0, 'xixira_mirror_realm_necroczar'); const foe = put(st, 1, '_v');
  cast(st, 0, '_fire', foe.uid, 1);
  ok('Xixira: a Fire spell still deals +2 (3 -> 5)', foe.damage === 5, foe.damage); }
// Xixira — your Shadow spells have Lifesteal (the caster heals for the damage dealt)
{ const st = game(); put(st, 0, 'xixira_mirror_realm_necroczar'); const foe = put(st, 1, '_v'); st.players[0].life = 20;
  cast(st, 0, '_shadow', foe.uid, 1); // 4 damage; Fire SD doesn't apply to a Shadow spell
  ok('Xixira: a Shadow spell has Lifesteal (healed for its damage)', st.players[0].life === 24, st.players[0].life); }
// without Xixira, a Shadow spell has no lifesteal
{ const st = game(); const foe = put(st, 1, '_v'); st.players[0].life = 20;
  cast(st, 0, '_shadow', foe.uid, 1);
  ok('no Xixira -> a Shadow spell does not heal', st.players[0].life === 20, st.players[0].life); }

// play-without-throw + valid-state sweep
for (const id of ['minn_wily_illusionist', 'xixira_mirror_realm_necroczar']) {
  let threw = null; const st = game(); put(st, 1, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
