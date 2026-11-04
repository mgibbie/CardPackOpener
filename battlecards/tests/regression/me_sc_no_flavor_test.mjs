// me_sc_no_flavor_test.mjs — no Middle-earth or Sword Coast card is flavour text only.
// 2026-10-13: 9 Middle-earth cards (one in each of nine enemy decks) and 21 Sword Coast cards
// (a vanilla weapon or creature in 8 hero decks, 4 shared enemy cards, Tiamat's White Dragon
// and a treasure) had text but no mechanic — the same gap fixed in Final Fantasy (#685).
// Each got an effect sized to its deck: the sim's easy decks and weak heroes got upside,
// already-hard decks got neutral ones (Goblin Assailant 2/1 -> 1/1 Rush; White Dragon +1 mana).
// Fires a sample of the new effects; the invariant guards every future card in both modes.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

function game() {
	const st = E.createGame(byId, seededRng(11), ['_v', '_v', '_v', '_v', '_v', '_v'], 2);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) p.mana = { cur: 10, max: 10, bonus: 0 };
	return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, target ?? null, null); return c; };
const coins = (st, pi) => st.players[pi].hand.filter(c => c.id === 'coin').length;
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const valid = (l, st) => { const v = validateGameState(st); ok(l + ' leaves state valid', !v || v.length === 0, v); };

// ───── invariant ─────
const pool = raw.cards.filter(c => c.meDeck || c.scDeck || c.meTreasure || c.scTreasure);
const MECH = ['effects', 'deathrattle', 'combo', 'overkill', 'ongoing', 'ongoings', 'taps', 'tapAbility', 'keywords', 'aura', 'auras'];
const bare = pool.filter(c => !MECH.some(k => c[k] && (!Array.isArray(c[k]) || c[k].length)));
ok('no Middle-earth / Sword Coast card is flavour text only', bare.length === 0, bare.map(c => `${c.id} ${c.name}`).slice(0, 10));
const need = { battlecry: 'effects', deathrattle: 'deathrattle', overkill: 'overkill', combo: 'combo' };
const hollow = pool.filter(c => (c.keywords || []).some(k => need[k] && !(c[need[k]] && c[need[k]].length)));
ok('no trigger keyword is hollow', hollow.length === 0, hollow.map(c => c.id));

// ───── fired ─────
{ const st = game(); const c0 = coins(st, 0); play(st, 0, 'me_bf_captain');
  ok('Captain of Umbar: Battlecry gains a Coin', coins(st, 0) === c0 + 1, [c0, coins(st, 0)]); }
{ const st = game(); const g = put(st, 0, 'me_lo_guest'); const c0 = coins(st, 0); kill(st, g);
  ok('Rapacious Guest: Deathrattle gains a Coin', coins(st, 0) === c0 + 1, [c0, coins(st, 0)]); }
{ const st = game(); const f = put(st, 0, 'me_gg_flunkies'); kill(st, f);
  ok('Goblin-town Flunkies: Deathrattle summons a 1/1 Goblin', st.players[0].board.some(c => c.name === 'Goblin-town Goblin'), st.players[0].board.map(c => c.name)); }
ok('Goblin Assailant is a 1/1 with Rush', byId.me_gr_assailant.attack === 1 && byId.me_gr_assailant.keywords?.includes('rush'));
{ const st = game(); const t = put(st, 1, '_v'); const life0 = st.players[1].life; play(st, 0, 'sc_e_gut_10');
  ok('Chaos Channeler: Battlecry deals 1 to a random enemy', E.hp(t) === 1 || st.players[1].life === life0 - 1, [E.hp(t), life0, st.players[1].life]);
  valid('Chaos Channeler', st); }
{ const st = game(); const t = put(st, 1, '_v'); play(st, 0, 'sc_e_tiamat_11', { type: 'creature', uid: t.uid, player: 1 });
  ok('White Dragon: Battlecry freezes an enemy creature', !!t.frozen, t.frozen);
  ok('White Dragon costs 7', byId.sc_e_tiamat_11.cost === 7, byId.sc_e_tiamat_11.cost); }
ok('+2 Mace swing gains 2 Armor', byId.sc_bruenor_8.ongoing?.on === 'hero-attacks' && byId.sc_bruenor_8.ongoing.effects[0].type === 'armor');
ok('Cloak of the Bat swing draws', byId.sc_volo_8.ongoing?.effects?.[0]?.type === 'draw');
ok('Saddle of the Cavalier swing buffs your creatures', byId.sc_jaheira_8.ongoing?.effects?.[0]?.target === 'friendly-creatures');
ok('Managorger Hydra has Trample', byId.sc_e_grumgully_3.keywords?.includes('trample'));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
