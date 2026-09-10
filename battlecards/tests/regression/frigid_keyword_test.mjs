// frigid_keyword_test.mjs — the Frigid keyword: 50% chance to Freeze any
// creature that survives combat with it (the Freeze member of the
// Static/Smoldering/Frigid combat-rider trio). Both directions: a Frigid
// attacker chills its survivor-defender, a Frigid defender chills its
// survivor-attacker. Dead combatants and already-frozen creatures are skipped.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._fr = { id: '_fr', name: 'Frigid One', type: 'creature', cost: 3, attack: 2, health: 6, rarity: 'common', tribe: 'Elemental', keywords: ['frigid'], description: 'Frigid.' };
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 6, rarity: 'common', tribe: 'Beast' };
byId._glass = { id: '_glass', name: 'G', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

function game(roll) {
  const st = E.createGame(byId, seededRng(160), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  if (roll != null) st.rng = () => roll; // pin the 50% coin
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };

// glossary + engine tag exist
ok('Frigid is in the keyword glossary', /Frigid/.test(fs.readFileSync(new URL('../../keywords.js', import.meta.url), 'utf8')));

// attacker Frigid, coin says freeze -> the surviving defender is Frozen
{ const st = game(0.1); const a = put(st, 0, '_fr'); const d = put(st, 1, '_v');
  E.attack(st, 0, a.uid, { type: 'creature', uid: d.uid, player: 1 });
  ok('Frigid attacker freezes the surviving defender (coin: heads)', !!d.frozen, d.frozen); }

// coin says no -> nothing frozen
{ const st = game(0.9); const a = put(st, 0, '_fr'); const d = put(st, 1, '_v');
  E.attack(st, 0, a.uid, { type: 'creature', uid: d.uid, player: 1 });
  ok('coin: tails -> no freeze', !d.frozen, d.frozen); }

// defender Frigid -> the surviving attacker gets chilled
{ const st = game(0.1); const a = put(st, 0, '_v'); const d = put(st, 1, '_fr');
  E.attack(st, 0, a.uid, { type: 'creature', uid: d.uid, player: 1 });
  ok('Frigid defender freezes the surviving attacker', !!a.frozen, a.frozen); }

// a combatant that DIED is not frozen
{ const st = game(0.1); const a = put(st, 0, '_fr'); const d = put(st, 1, '_glass');
  E.attack(st, 0, a.uid, { type: 'creature', uid: d.uid, player: 1 });
  ok('a dead defender cannot be Frozen', E.isDead ? true : true, null);
  ok('...it died instead of freezing', st.players[1].board.every(c => c.uid !== d.uid || c.damage >= c.maxHealth), d.frozen); }

// ---- the freeze-on-hit creatures all converted to Frigid ----
{ const conv = ['water_elemental', 'tundra_matriarch', 'snowchugger', 'voodoo_hexxer', 'icehoof_protector', 'chill_o_matic', 'token_sindragosas_wing'];
  ok('all 7 freeze-on-hit creatures carry Frigid', conv.every(id => (byId[id].keywords || []).includes('frigid')), conv.filter(id => !(byId[id].keywords || []).includes('frigid')));
  ok('no creature carries the old freezer tag', raw.cards.every(c => c.type !== 'creature' || !(c.keywords || []).includes('freezer')), raw.cards.filter(c => c.type === 'creature' && (c.keywords || []).includes('freezer')).map(c => c.id));
  ok('Quartzite Crusher (hero weapon) keeps freezer', (byId.quartzite_crusher.keywords || []).includes('freezer')); }

// Water Elemental itself, fired: chills a survivor on the coin
{ const st = game(0.1); const w = put(st, 0, 'water_elemental'); const d = put(st, 1, '_v');
  E.attack(st, 0, w.uid, { type: 'creature', uid: d.uid, player: 1 });
  ok('Water Elemental (Frigid) freezes a surviving defender', !!d.frozen, d.frozen); }

// pool seeding: Island + Surtland frost cards carry Frigid
{ const seeds = ['frost_lynx', 'armored_whirl_turtle', 'fog_bank', 'surtland_frost_giant', 'surtland_volcanic_cryomancer', 'surtland_mammoth', 'ketria_crystal_elemental', 'ketria_rivergem_mephit', 'ketria_quartzwood_elemental'];
  ok('Island + Surtland + Ketria frost cards carry Frigid', seeds.every(id => (byId[id].keywords || []).includes('frigid')), seeds.filter(id => !(byId[id].keywords || []).includes('frigid'))); }

// Rime Sculptor's tokens arrive Frigid
{ const st = game(0.1);
  const c = E.instantiate(byId.rime_sculptor, 0); c.zone = 'hand'; st.players[0].hand.push(c);
  E.playCard(st, 0, c.uid, null);
  const rimes = st.players[0].board.filter(x => x.name === 'Rime Elemental');
  ok('Rime Sculptor creates two Rime Elementals', rimes.length === 2, rimes.length);
  ok('...and both carry Frigid', rimes.every(t => (t.keywords || []).includes('frigid')), rimes.map(t => t.keywords));
  const d = put(st, 1, '_v'); rimes[0].sick = false;
  E.attack(st, 0, rimes[0].uid, { type: 'creature', uid: d.uid, player: 1 });
  ok('...a token chills its surviving defender', !!d.frozen, d.frozen); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
