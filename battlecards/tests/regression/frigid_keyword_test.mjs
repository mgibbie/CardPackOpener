// frigid_keyword_test.mjs — the Frigid keyword: Freeze ANY character that
// survives combat with it (creature, planeswalker, or player), 100% of the time
// (owner ruling 2026-09-14; it used to be a 50% creature-only coin flip). Both
// directions in creature combat, plus Frigid weapons. Dead/already-frozen
// combatants are skipped.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._fr = { id: '_fr', name: 'Frigid One', type: 'creature', cost: 3, attack: 2, health: 6, rarity: 'common', tribe: 'Elemental', keywords: ['frigid'], description: 'Frigid.' };
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 6, rarity: 'common', tribe: 'Beast' };
byId._glass = { id: '_glass', name: 'G', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Beast' };
byId._pw = { id: '_pw', name: 'PW', type: 'planeswalker', cost: 4, loyalty: 6, rarity: 'common', abilities: [{ cost: 1, text: '+1: Draw', effects: [{ type: 'draw', value: 1 }] }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

function game(seed = 160, n = 2) {
  const st = E.createGame(byId, seededRng(seed), null, n, Array.from({ length: n }, (_, i) => ({ id: 'mage', name: 'P' + i, power: null })));
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };

// glossary + engine tag exist
ok('Frigid is in the keyword glossary', /Frigid/.test(fs.readFileSync(new URL('../../keywords.js', import.meta.url), 'utf8')));

// ---- 100%: a Frigid attacker freezes its surviving defender EVERY time ----
{ let all = true; for (let s = 0; s < 20; s++) { const st = game(s); const a = put(st, 0, '_fr'); const d = put(st, 1, '_v'); E.attack(st, 0, a.uid, { type: 'creature', uid: d.uid, player: 1 }); if (!d.frozen) all = false; }
  ok('Frigid freezes a surviving defender 100% of the time (20/20)', all); }

// defender Frigid -> the surviving attacker gets chilled
{ const st = game(); const a = put(st, 0, '_v'); const d = put(st, 1, '_fr');
  E.attack(st, 0, a.uid, { type: 'creature', uid: d.uid, player: 1 });
  ok('Frigid defender freezes the surviving attacker', !!a.frozen, a.frozen); }

// a combatant that DIED is not frozen (it's gone)
{ const st = game(); const a = put(st, 0, '_fr'); const d = put(st, 1, '_glass');
  E.attack(st, 0, a.uid, { type: 'creature', uid: d.uid, player: 1 });
  ok('a dead defender is gone, not Frozen', !st.players[1].board.some(c => c.uid === d.uid), st.players[1].board.map(c => c.uid)); }

// ---- Frigid freezes PLAYERS ----
{ const st = game(); const a = put(st, 0, '_fr'); E.attack(st, 0, a.uid, { type: 'hero', player: 1 });
  ok('a Frigid creature freezes the struck player', !!st.players[1].frozen, st.players[1].frozen);
  st.current = 1; st.players[1].weapon = E.instantiate({ id: 'axe', name: 'Axe', type: 'weapon', cost: 1, attack: 3, durability: 2 }, 1); st.players[1].heroAttacksUsed = 0;
  ok('a Frozen player cannot attack', E.canHeroAttack(st, 1) === false); }

// ---- Frigid freezes PLANESWALKERS ----
{ const st = game(); const a = put(st, 0, '_fr'); const w = E.instantiate(byId._pw, 1); w.zone = 'board'; st.players[1].planeswalkers.push(w);
  E.attack(st, 0, a.uid, { type: 'walker', uid: w.uid, player: 1 });
  ok('a Frigid creature freezes the struck planeswalker', !!w.frozen, w.frozen);
  st.current = 1; ok('a Frozen planeswalker cannot use a loyalty ability', E.canUseWalker(st, 1, w, 0) === false); }

// ---- Frigid WEAPON freezes creature / player it strikes ----
{ const st = game(); st.players[0].weapon = E.instantiate({ id: 'fw', name: 'FW', type: 'weapon', cost: 2, attack: 2, durability: 9, keywords: ['frigid'] }, 0); st.players[0].heroAttacksUsed = 0;
  const d = put(st, 1, '_v'); E.heroAttack(st, 0, { type: 'creature', uid: d.uid, player: 1 });
  ok('a Frigid weapon freezes the struck creature', !!d.frozen, d.frozen);
  st.players[0].heroAttacksUsed = 0; E.heroAttack(st, 0, { type: 'hero', player: 1 });
  ok('a Frigid weapon freezes the struck player', !!st.players[1].frozen, st.players[1].frozen); }

// ---- thaw: a frozen player un-freezes at the end of its own turn ----
{ const st = game(); const a = put(st, 0, '_fr'); E.attack(st, 0, a.uid, { type: 'hero', player: 1 });
  ok('player frozen', !!st.players[1].frozen);
  E.endTurn(st); E.endTurn(st); // p0 ends -> p1 turn -> p1 ends (thaw)
  ok('player thaws after its own turn passes', !st.players[1].frozen); }

// ---- the freeze-on-hit creatures all converted to Frigid ----
{ const conv = ['water_elemental', 'tundra_matriarch', 'snowchugger', 'voodoo_hexxer', 'icehoof_protector', 'chill_o_matic', 'token_sindragosas_wing'];
  ok('all 7 freeze-on-hit creatures carry Frigid', conv.every(id => (byId[id].keywords || []).includes('frigid')), conv.filter(id => !(byId[id].keywords || []).includes('frigid')));
  ok('no creature carries the old freezer tag', raw.cards.every(c => c.type !== 'creature' || !(c.keywords || []).includes('freezer')), raw.cards.filter(c => c.type === 'creature' && (c.keywords || []).includes('freezer')).map(c => c.id));
  ok('Quartzite Crusher (hero weapon) keeps freezer', (byId.quartzite_crusher.keywords || []).includes('freezer')); }

// Water Elemental itself, fired: chills a survivor
{ const st = game(); const w = put(st, 0, 'water_elemental'); const d = put(st, 1, '_v');
  E.attack(st, 0, w.uid, { type: 'creature', uid: d.uid, player: 1 });
  ok('Water Elemental (Frigid) freezes a surviving defender', !!d.frozen, d.frozen); }

// pool seeding: Island + Surtland frost cards carry Frigid
{ const seeds = ['frost_lynx', 'armored_whirl_turtle', 'fog_bank', 'surtland_frost_giant', 'surtland_volcanic_cryomancer', 'surtland_mammoth', 'ketria_crystal_elemental', 'ketria_rivergem_mephit', 'ketria_quartzwood_elemental'];
  ok('Island + Surtland + Ketria frost cards carry Frigid', seeds.every(id => (byId[id].keywords || []).includes('frigid')), seeds.filter(id => !(byId[id].keywords || []).includes('frigid'))); }

// Rime Sculptor's tokens arrive Frigid
{ const st = game();
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
