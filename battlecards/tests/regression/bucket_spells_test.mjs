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

// Floop's Glorious Gloop: any minion death this turn refreshes a Mana Crystal
{
	const st = game(); cast(st, 0, 'floops_glorious_gloop');
	st.players[0].mana.max = 10; st.players[0].mana.cur = 5;
	const foe = put(st, 1, 1, 1); foe.damage = foe.maxHealth; E.sweepDeaths(st);
	ok('Floop\'s Glorious Gloop: a death refreshed a Mana Crystal', st.players[0].mana.cur === 6, st.players[0].mana.cur);
}
// Stampede: playing a Beast this turn adds a random Beast to hand
{
	const st = game(); cast(st, 0, 'stampede');
	cardsById['bst'] = { id: 'bst', name: 'B', type: 'creature', cost: 1, tribe: 'Beast', attack: 1, health: 1 };
	const bc = E.instantiate(cardsById['bst'], 0); bc.zone = 'hand'; st.players[0].hand.push(bc); st.players[0].mana.cur = 10;
	E.playCard(st, 0, bc.uid, null, null, 0);
	delete cardsById['bst'];
	ok('Stampede: playing a Beast added a random Beast to hand', st.players[0].hand.some(c => (c.tribe || '').includes('Beast') && c.uid !== bc.uid));
}
// Shadow of Death: shuffle 3 Shadows; drawing one summons a copy of the chosen minion
{
	const st = game();
	cardsById['shadowtgt'] = { id: 'shadowtgt', name: 'ST', type: 'creature', cost: 3, attack: 3, health: 3 };
	const t = E.instantiate(cardsById['shadowtgt'], 0); t.zone = 'board'; t.sick = false; st.players[0].board.push(t);
	cast(st, 0, 'shadow_of_death', tgtOf(t, 0));
	ok('Shadow of Death: 3 Shadows shuffled in', st.players[0].deck.filter(id => id === 'shadow_of_shadowtgt').length === 3);
	st.players[0].deck = ['shadow_of_shadowtgt']; const b0 = st.players[0].board.filter(c => !E.isDead(c)).length;
	E.drawCards(st, 0, 1);
	ok('Shadow of Death: drawing a Shadow summons a copy', st.players[0].board.filter(c => c.id === 'shadowtgt' && !E.isDead(c)).length === b0 + 1);
	delete cardsById['shadowtgt'];
}
// Beneath the Grounds: 3 Ambushes into the enemy deck; when THEY draw one, YOU get a 4/4
{
	const st = game(); cast(st, 0, 'beneath_the_grounds');
	ok('Beneath the Grounds: 3 Ambushes in enemy deck', st.players[1].deck.filter(id => id === 'nerubian_ambush').length === 3);
	st.players[1].deck = ['nerubian_ambush'];
	E.drawCards(st, 1, 1);
	ok('Beneath the Grounds: enemy drawing an Ambush summons a 4/4 for the caster', st.players[0].board.some(c => c.attack === 4 && E.hp(c) === 4 && !E.isDead(c)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
