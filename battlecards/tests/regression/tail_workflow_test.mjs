// Final tail (workflow batch): 5 web-verified weapons/locations + 2 tokens.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (heroClass = 'priest', seed = 64) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: heroClass, name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].heroClass = heroClass; st.players[0].mana.max = 10; st.players[0].mana.cur = 10; st.players[0].life = 30; st.players[1].life = 30;
	return st;
};
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const dummy = (a, h, name) => ({ id: 'dm_' + name, name, type: 'creature', cost: 2, rarity: 'basic', attack: a, health: h });
const placeLoc = (st, id) => { const c = E.instantiate(cardsById[id], 0); c.zone = 'board'; c.sick = false; c.tapped = false; st.players[0].board.push(c); E.recomputeAuras(st); return c; };
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };

for (const id of ['ruby_sanctum', 'shrine_of_twilight', 'azsharan_trident', 'volley_maul', 'chamber_of_viscidus', 'tsc_sunken_trident', 'sunscreen'])
	ok(`${id} exists`, cardsById[id], id);
ok('Sunken Trident + Sunscreen are uncollectible tokens', cardsById.tsc_sunken_trident.collectible === false && cardsById.sunscreen.collectible === false);

// Ruby Sanctum: your next Healing this turn deals damage instead
{
	const st = game('priest');
	const loc = placeLoc(st, 'ruby_sanctum');
	E.tapLand(st, 0, loc.uid, 0, null);
	ok('Ruby Sanctum armed heal-to-harm this turn', st.players[0].healHarmThisTurn === true, st.players[0].healHarmThisTurn);
}
// Shrine of Twilight: Herald + draw a card
{
	const st = game('warlock'); st.players[0].deck = ['chillwind_yeti'];
	const loc = placeLoc(st, 'shrine_of_twilight');
	const h0 = st.players[0].hand.length; const b0 = st.players[0].board.filter(c => c.type !== 'location').length;
	E.tapLand(st, 0, loc.uid, 0, null);
	ok('Shrine of Twilight drew a card', st.players[0].hand.length === h0 + 1, st.players[0].hand.length - h0);
	ok('Shrine of Twilight summoned a Herald token', st.players[0].board.filter(c => c.type !== 'location').length === b0 + 1, st.players[0].board.length);
}
// Azsharan Trident: Deathrattle put a Sunken Trident on the bottom of your deck
{
	const st = game('warrior'); st.players[0].deck = ['chillwind_yeti'];
	equip(st, 'azsharan_trident'); E.breakWeapon(st, 0);
	ok('Azsharan Trident put Sunken Trident on the deck bottom', st.players[0].deck[0] === 'tsc_sunken_trident', st.players[0].deck);
}
// Volley Maul: after your hero attacks, get a Sunscreen
{
	const st = game('paladin'); const foe = put(st, 1, dummy(0, 5, 'Foe'));
	equip(st, 'volley_maul'); st.players[0].heroAttacksUsed = 0;
	E.heroAttack(st, 0, { type: 'creature', uid: foe.uid, player: 1 });
	ok('Volley Maul added a Sunscreen to hand', st.players[0].hand.some(c => c.id === 'sunscreen'), st.players[0].hand.map(c => c.id));
}
// Chamber of Viscidus: discard-pick + draw 2 (opens a pick or draws)
{
	const st = game('warlock');
	st.players[0].hand = [E.instantiate({ id: 'x1', name: 'x', type: 'sorcery', cost: 1, effects: [] }, 0), E.instantiate({ id: 'x2', name: 'x', type: 'sorcery', cost: 1, effects: [] }, 0)];
	st.players[0].deck = ['chillwind_yeti', 'chillwind_yeti', 'chillwind_yeti'];
	const loc = placeLoc(st, 'chamber_of_viscidus');
	let threw = null;
	try { E.tapLand(st, 0, loc.uid, 0, null); } catch (e) { threw = e.message; }
	ok('Chamber of Viscidus resolved without crashing', threw === null, threw);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
