// Forge riders — the 7 bespoke-upgrade Forge cards (keyword / ongoing / summon
// buff+grant / discover discount / choose-one removal / miracle / corpses).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 43) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = []; st.players[0].life = 30; st.players[1].life = 30;
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const toHand = (st, pi, id, def) => { const c = E.instantiate(def || cardsById[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const forgeAndPlay = (st, id, target = null) => { const c = toHand(st, 0, id); st.players[0].mana.cur = 10; E.forgeCard(st, 0, c.uid); st.players[0].mana.cur = 10; E.playCard(st, 0, c.uid, target, null, 0); return c; };

// XB-488 Disposalbot: Forge → Gain Lifesteal
{
	const st = game();
	const bot = toHand(st, 0, 'xb_488_disposalbot');
	st.players[0].mana.cur = 5;
	E.forgeCard(st, 0, bot.uid);
	ok('XB-488 gained Lifesteal on Forge', (bot.keywords || []).includes('lifesteal'), bot.keywords);
}

// Eulogizer: base spends 3 Corpses; Forge → deal 3 AND gain 3 Corpses (no spend)
{
	const st = game();
	st.players[0].corpses = 0;
	forgeAndPlay(st, 'eulogizer', { type: 'hero', player: 1 });
	ok('forged Eulogizer dealt 3 to the enemy hero', st.players[1].life === 27, st.players[1].life);
	ok('forged Eulogizer GAINED 3 Corpses (instead of spending)', st.players[0].corpses === 3, st.players[0].corpses);
}

// Champion of Storms: Forge → the summoned 4/2 Elemental now has Rush
{
	const st = game();
	const champ = toHand(st, 0, 'champion_of_storms');
	st.players[0].mana.cur = 10; E.forgeCard(st, 0, champ.uid);
	E.playCard(st, 0, champ.uid, null, null, 0);
	// cast a Nature spell → the ongoing summons a 4/2 Elemental
	const nature = { id: 't_nat', name: 'Nat', type: 'sorcery', cost: 0, rarity: 'basic', tribe: 'Nature', effects: [{ type: 'armor', value: 0 }] };
	cardsById.t_nat = nature;
	const ns = E.instantiate(nature, 0); ns.zone = 'hand'; st.players[0].hand.push(ns);
	E.playCard(st, 0, ns.uid, null, null, 0);
	const elem = st.players[0].board.find(c => c.id === 'ttn_elemental_42');
	ok('a 4/2 Elemental was summoned', elem && elem.attack === 4, elem && elem.attack);
	ok('the forged Champion gives it Rush', elem && (elem.keywords || []).includes('rush'), elem && elem.keywords);
}

// Disciple of Sargeras: Forge → the two Imps get +2 Health and Taunt (3/2 → 3/4 Taunt)
{
	const st = game();
	const disc = toHand(st, 0, 'disciple_of_sargeras');
	// a spell to discard for the battlecry
	toHand(st, 0, 't_sp', { id: 't_sp', name: 'Sp', type: 'sorcery', cost: 1, rarity: 'basic', effects: [{ type: 'armor', value: 0 }] });
	st.players[0].mana.cur = 10; E.forgeCard(st, 0, disc.uid);
	E.playCard(st, 0, disc.uid, null, null, 0);
	const imps = st.players[0].board.filter(c => c.id === 'ttn_imp_32');
	ok('two Imps were summoned', imps.length === 2, imps.length);
	ok('each Imp is 3/4 with Taunt (forged)', imps.every(i => i.attack === 3 && E.hp(i) === 4 && (i.keywords || []).includes('taunt')), imps.map(i => [i.attack, E.hp(i), i.keywords]));
}

// Mechagnome Guide: Forge → the discovered spell costs (3) less
{
	const st = game();
	const mg = toHand(st, 0, 'mechagnome_guide');
	st.players[0].mana.cur = 10; E.forgeCard(st, 0, mg.uid);
	ok('forged battlecry discovers a spell at -3 Cost', mg.effects[0].type === 'discover' && mg.effects[0].costMod === -3, mg.effects);
	E.playCard(st, 0, mg.uid, null, null, 0);
	ok('playing it opened a Discover pick', (st.pickQueue || []).length >= 1 || (st.players[0].hand.length >= 1), st.pickQueue?.length);
}

// Gloomstone Guardian: Forge → "Do NEITHER" (no Choose One downside)
{
	const st = game();
	const gg = toHand(st, 0, 'gloomstone_guardian');
	st.players[0].hand.push(E.instantiate({ id: 'x1', name: 'x', type: 'sorcery', cost: 1, effects: [] }, 0));
	st.players[0].hand.push(E.instantiate({ id: 'x2', name: 'x', type: 'sorcery', cost: 1, effects: [] }, 0));
	st.players[0].mana.cur = 10; E.forgeCard(st, 0, gg.uid);
	ok('the Choose One is removed on Forge', gg.choices === null);
	const handBefore = st.players[0].hand.length - 1; // minus the guardian itself
	const maxManaBefore = st.players[0].mana.max;
	E.playCard(st, 0, gg.uid, null, null, 0);
	ok('no discard happened (hand intact besides the Guardian)', st.players[0].hand.length === handBefore, st.players[0].hand.length);
	ok('no Mana Crystal destroyed', st.players[0].mana.max === maxManaBefore, st.players[0].mana.max);
	ok('the 6/8 Taunt is on the board', st.players[0].board.some(c => c.id === 'gloomstone_guardian' && (c.keywords || []).includes('taunt')));
}

// Glowstone Gyreworm: Miracle deals 5; Forge → deals 10 (only when drawn this turn)
{
	const st = game();
	const gw = toHand(st, 0, 'glowstone_gyreworm'); gw.drawnThisTurn = true;
	E.playCard(st, 0, gw.uid, { type: 'hero', player: 1 }, null, 0);
	ok('base Miracle dealt 5 to the enemy hero', st.players[1].life === 25, st.players[1].life);
}
{
	const st = game();
	const gw = toHand(st, 0, 'glowstone_gyreworm'); gw.drawnThisTurn = true;
	st.players[0].mana.cur = 10; E.forgeCard(st, 0, gw.uid);
	E.playCard(st, 0, gw.uid, { type: 'hero', player: 1 }, null, 0);
	ok('forged Miracle deals 10 to the enemy hero', st.players[1].life === 20, st.players[1].life);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
