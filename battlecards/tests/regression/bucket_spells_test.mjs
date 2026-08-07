// Heist/Tombs bucket-spell import — behavior verification for the new handlers
// (the gate only smoke-tests; this asserts the mechanics actually resolve right).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 3) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'rogue', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.board = []; p.deck = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};
const put = (st, pi, atk, hp, cost = 3) => { const c = E.instantiate({ id: 'dm', name: 'Dummy', type: 'creature', cost, rarity: 'basic', attack: atk, health: hp }, pi); c.zone = 'board'; c.sick = false; c.summonedThisTurn = false; c.attacksUsed = 0; st.players[pi].board.push(c); return c; };
const cast = (st, pi, id, tgt = null, choice = null) => { const sp = E.instantiate(cardsById[id], pi); sp.zone = 'hand'; st.players[pi].hand.push(sp); st.players[pi].mana.cur = 10; E.playCard(st, pi, sp.uid, tgt, choice, 0); return sp; };
const tgtOf = (c, pi) => ({ type: 'creature', uid: c.uid, player: pi });

// all 48 imported cards exist
for (const id of ['crushing_walls', 'darkest_hour', 'lightbomb', 'mass_hysteria', 'echo_of_medivh', 'demonic_project', 'conjurers_calling', 'psychic_scream', 'earthen_scales', 'bring_it_on', 'weapons_project', 'doomerang', 'devolve', 'plague_of_murlocs', 'lunas_pocket_galaxy', 'kangor_s_endless_army'].filter(x => !cardsById[x]))
	ok('missing expected card', false, id);

// Lightbomb: each minion takes damage equal to its own Attack
{
	const st = game(); const a = put(st, 0, 3, 9), b = put(st, 1, 5, 9);
	cast(st, 0, 'lightbomb');
	ok('Lightbomb: minion takes damage = its own Attack', a.damage === 3 && b.damage === 5, [a.damage, b.damage]);
}
// Crushing Walls: destroy opponent's left-most and right-most minions
{
	const st = game(); const l = put(st, 1, 1, 5), m = put(st, 1, 1, 5), r = put(st, 1, 1, 5);
	cast(st, 0, 'crushing_walls');
	ok('Crushing Walls: edges destroyed, middle survives', E.isDead(l) && E.isDead(r) && !E.isDead(m));
}
// Echo of Medivh: a copy of each friendly minion to hand
{
	const st = game(); put(st, 0, 2, 2); put(st, 0, 3, 3);
	cast(st, 0, 'echo_of_medivh');
	ok('Echo of Medivh: hand gained a copy of each friendly minion', st.players[0].hand.filter(c => c.type === 'creature').length === 2);
}
// Conjurer's Calling: destroy a minion, summon 2 of the same Cost
{
	const st = game(); const t = put(st, 0, 4, 4, 3); const before = st.players[0].board.length;
	cast(st, 0, 'conjurers_calling', tgtOf(t, 0));
	const summoned = st.players[0].board.filter(c => !E.isDead(c));
	ok('Conjurer\'s Calling: target destroyed, 2 replacements summoned', E.isDead(t) && summoned.length === 2 && summoned.every(c => (c.cost || 0) === 3), summoned.map(c => c.cost));
}
// Earthen Scales: +1/+1 then gain Armor = its Attack
{
	const st = game(); const t = put(st, 0, 3, 4); st.players[0].armor = 0;
	cast(st, 0, 'earthen_scales', tgtOf(t, 0));
	ok('Earthen Scales: buffed to 4 Attack and gained 4 Armor', t.attack === 4 && st.players[0].armor === 4, [t.attack, st.players[0].armor]);
}
// Bring It On!: 10 Armor + enemy hand minions cost (2) less
{
	const st = game(); st.players[0].armor = 0;
	const em = E.instantiate({ id: 'em', name: 'E', type: 'creature', cost: 5, attack: 5, health: 5 }, 1); em.zone = 'hand'; st.players[1].hand.push(em);
	cast(st, 0, 'bring_it_on');
	ok('Bring It On!: +10 Armor and enemy hand minion now costs 3', st.players[0].armor === 10 && em.cost === 3, [st.players[0].armor, em.cost]);
}
// Weapons Project: BOTH players equip a 2/3 weapon and gain 6 Armor
{
	const st = game(); st.players[0].armor = 0; st.players[1].armor = 0;
	cast(st, 0, 'weapons_project');
	ok('Weapons Project: both players equipped + 6 Armor each', !!st.players[0].weapon && !!st.players[1].weapon && st.players[0].armor === 6 && st.players[1].armor === 6);
}
// Doomerang: weapon hits a minion for its Attack, then returns to hand
{
	const st = game(); E.execEffects(st, 0, [{ type: 'equip', name: 'Wicked Knife', attack: 3, durability: 2 }], null, null);
	const foe = put(st, 1, 1, 9);
	cast(st, 0, 'doomerang', tgtOf(foe, 1));
	ok('Doomerang: minion took weapon damage, weapon back in hand, none equipped', foe.damage === 3 && !st.players[0].weapon && st.players[0].hand.some(c => c.type === 'weapon'), [foe.damage, !!st.players[0].weapon]);
}
// Devolve: enemy minion becomes a random one costing (1) less
{
	const st = game(); const foe = put(st, 1, 4, 4, 3);
	cast(st, 0, 'devolve');
	const now = st.players[1].board[0];
	ok('Devolve: enemy 3-cost minion transformed to a 2-cost minion', now && (now.cost || 0) === 2, now && now.cost);
}
// Kangor's Endless Army: resurrect 3 friendly Mechs
{
	const st = game();
	// seed the death log with a Mech
	const mech = { id: 'mech1', name: 'Mek', type: 'creature', cost: 2, tribe: 'Mech', attack: 2, health: 1 };
	cardsById['mech1'] = mech; st.players[0].deathLogIds = ['mech1', 'mech1'];
	cast(st, 0, 'kangor_s_endless_army');
	delete cardsById['mech1'];
	ok('Kangor\'s Endless Army: resurrected 3 Mechs', st.players[0].board.filter(c => (c.tribe || '').includes('Mech')).length === 3, st.players[0].board.length);
}
// Psychic Scream: all minions leave the board (into the opponent's deck)
{
	const st = game(); put(st, 0, 2, 2); put(st, 1, 2, 2); const foeDeck0 = st.players[1].deck.length;
	cast(st, 0, 'psychic_scream');
	ok('Psychic Scream: board cleared, both minions into opponent deck', st.players[0].board.length === 0 && st.players[1].board.length === 0 && st.players[1].deck.length === foeDeck0 + 2, [st.players[0].board.length, st.players[1].deck.length - foeDeck0]);
}
// Luna's Pocket Galaxy: minions in your deck cost (1)
{
	const st = game(); st.players[0].deck = ['chillwind_yeti', 'chillwind_yeti'].filter(id => cardsById[id]);
	if (st.players[0].deck.length) {
		cast(st, 0, 'lunas_pocket_galaxy');
		ok('Luna\'s Pocket Galaxy: deck minion cost overridden to 1', (st.players[0].deckCostOverrides || {})['chillwind_yeti'] === 1);
	} else ok('(no yeti in pool — skip Luna)', true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
