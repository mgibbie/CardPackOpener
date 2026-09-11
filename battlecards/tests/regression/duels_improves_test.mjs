// duels_improves_test.mjs — the Duels upgrade-tier system: "(Improves during
// run.)" treasures carry 3 authored tiers mapped in by WINS at boot
// (Duels.applyImproves, thresholds 3/6/9), and the SCH "Upgrade this &
// shuffle it into your deck" chains climb link by link when played.
import fs from 'fs';
import * as E from '../../engine.js';
import * as Duels from '../../duels.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'Dummy', type: 'creature', cost: 1, attack: 2, health: 8, rarity: 'common' };
byId._dr = { id: '_dr', name: 'Rattler', type: 'creature', cost: 2, attack: 1, health: 2, rarity: 'common', keywords: ['deathrattle'], deathrattle: [{ type: 'draw', value: 1 }] };
byId._outcast3 = { id: '_outcast3', name: 'Outcast Probe 3', type: 'sorcery', cost: 3, rarity: 'common', keywords: ['outcast'], effects: [{ type: 'draw', value: 0 }] };

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(byId, seededRng(64), null, 2,
		[{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.secrets = []; p.heroPowers = []; p.mana = { cur: 30, max: 10, bonus: 0 }; }
	return st;
}
const give = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = give(st, pi, id); E.playCard(st, pi, c.uid, target ?? null, null); return c; };

const IMPROVERS = ['duels_demonizer', 'duels_awakened_ancient', 'duels_deathstrider', 'duels_favored_racer',
	'duels_herald_scaled_ones', 'duels_payload_totem_specialist', 'duels_scrapmetal_demolitionist',
	'duels_blade_of_quickening', 'duels_green_tortollan_shell', 'duels_scourge_strike'];

// ---- wiring ----
{
	const bad = IMPROVERS.filter(id => !(byId[id] && Array.isArray(byId[id].improves) && byId[id].improves.length === 3 && byId[id].improves.every(t => byId[t])));
	ok('all 10 improvers carry 3 existing tiers', bad.length === 0, bad.join(','));
	ok('base descriptions advertise the mechanic', IMPROVERS.every(id => /Improves during run/.test(byId[id].description)),
		IMPROVERS.filter(id => !/Improves during run/.test(byId[id].description)).join(','));
	const tiers = IMPROVERS.flatMap(id => byId[id].improves).map(t => byId[t]);
	ok('tier cards are hidden tokens (no treasure flag, non-collectible)', tiers.every(t => t.token && t.collectible === false && !t.treasure));
	ok('tiers keep the base name & cost', IMPROVERS.every(id => byId[id].improves.every(t => byId[t].name === byId[id].name && byId[t].cost === byId[id].cost)));
}

// ---- tierFor / applyImproves ----
{
	ok('tiers land at 3/6/9 wins and cap', [0, 2, 3, 5, 6, 8, 9, 12].map(Duels.tierFor).join(',') === '0,0,1,1,2,2,3,3');
	const deck = ['_v', 'duels_demonizer', 'duels_scourge_strike', '_v'];
	ok('0 wins: the deck is untouched', Duels.applyImproves(byId, deck, 0).join(',') === deck.join(','));
	ok('4 wins: bases become tier 1', Duels.applyImproves(byId, deck, 4).join(',') === '_v,duels_demonizer_s1,duels_scourge_strike_s1,_v');
	ok('7 wins: tier 2', Duels.applyImproves(byId, deck, 7)[1] === 'duels_demonizer_s2');
	ok('11 wins: tier 3 (final form)', Duels.applyImproves(byId, deck, 11)[1] === 'duels_demonizer_s3');
	ok('the input deck is not mutated', deck[1] === 'duels_demonizer');
}

// ---- the tiers actually fire ----
{
	const st = fresh();
	play(st, 0, 'duels_demonizer_s3');
	const demons = st.players[0].hand.filter(c => (byId[c.id].tribe || '').includes('Demon'));
	ok('Demonizer s3 adds 4 discounted Demons', demons.length === 4 && demons.every(c => c.cost === Math.max(0, (byId[c.id].cost || 0) - 2)), demons.length);
}
{
	const st = fresh();
	play(st, 0, 'duels_awakened_ancient_s3');
	ok('Awakened Ancient s3: draw 4 / ping 4 / armor 4', st.players[0].hand.length === 4 && (st.players[0].armor || 0) === 4 && st.players[1].life === 36,
		[st.players[0].hand.length, st.players[0].armor, st.players[1].life].join('|'));
}
{
	const st = fresh();
	play(st, 0, 'duels_scrapmetal_demolitionist_s3');
	ok('Scrapmetal s3 plants 4 Bombs', st.players[1].deck.filter(id => id === 'bomb').length === 4, st.players[1].deck.join(','));
}
{
	const st = fresh();
	for (let i = 0; i < 4; i++) put(st, 1, '_v');
	play(st, 0, 'duels_green_tortollan_shell_s3');
	ok('Tortollan Shell s3 bounces 4 enemies', st.players[1].board.length === 0 && st.players[1].hand.length === 4, st.players[1].hand.length);
}
{
	const st = fresh();
	st.players[0].deck = ['_v', '_v', '_v', '_v'];
	put(st, 0, '_dr');
	play(st, 0, 'duels_deathstrider_s2');
	ok('Deathstrider s2 fires 3 Deathrattles (3 draws)', st.players[0].hand.length === 3, st.players[0].hand.length);
}
{
	const st = fresh();
	put(st, 1, '_v'); put(st, 1, '_v');
	st.players[0].deck = ['_v', '_v', '_v'];
	play(st, 0, 'duels_scourge_strike_s1');
	ok('Scourge Strike s1: 2 Corpses, 2 kills, 2 draws', (st.players[0].corpses || 0) >= 2 && st.players[1].board.every(c => E.isDead(c)) && st.players[0].hand.length === 2,
		[st.players[0].corpses, st.players[0].hand.length].join('|'));
	const st2 = fresh();
	const v = put(st2, 1, '_v');
	st2.players[0].deck = ['_v'];
	play(st2, 0, 'duels_scourge_strike', { type: 'creature', uid: v.uid, player: 1 });
	ok('base Scourge Strike now banks its Corpse', (st2.players[0].corpses || 0) === 1 && E.isDead(v), st2.players[0].corpses);
}
{
	const st = fresh();
	st.players[0].deck = ['_outcast3', '_outcast3', '_v'];
	play(st, 0, 'duels_blade_of_quickening_s1');
	const got = st.players[0].hand.filter(c => c.id === '_outcast3');
	ok('Blade of Quickening s1 tutors 2 Outcast cards at (1) less', got.length === 2 && got.every(c => c.cost === 2), got.map(c => c.cost).join(','));
}

// ---- the SCH upgrade-shuffle chains ----
{
	const CHAINS = [
		['duels_creepy_curio', 'duels_haunted_curio', 'duels_cursed_curio'],
		['duels_coin_pouch', 'duels_sack_of_coins', 'duels_hefty_sack_of_coins'],
		['duels_old_militia_horn', 'duels_militia_horn', 'duels_veterans_militia_horn'],
		['duels_surly_mob', 'duels_angry_mob', 'duels_crazed_mob'],
	];
	for (const [a, b, c] of CHAINS) {
		ok(`${a} upgrades into ${b}`, JSON.stringify(byId[a].effects).includes(b), JSON.stringify(byId[a].effects));
		ok(`${b} upgrades into ${c}`, JSON.stringify(byId[b].effects).includes(c), JSON.stringify(byId[b].effects));
		ok(`${c} is the final form (no further upgrade)`, !JSON.stringify(byId[c].effects).includes('shuffle-ids-into-deck'));
	}
	const st = fresh();
	play(st, 0, 'duels_creepy_curio');
	ok('playing Creepy Curio buries a Haunted Curio', st.players[0].deck.includes('duels_haunted_curio'), st.players[0].deck.join(','));
	ok('...and raises its Ghosts', st.players[0].board.filter(x => x.name === 'Ghost').length === 3);
	const st2 = fresh();
	put(st2, 1, '_v'); put(st2, 1, '_dr');
	play(st2, 0, 'duels_crazed_mob');
	ok('Crazed Mob silences & wipes the enemy board', st2.players[1].board.every(x => E.isDead(x)) && st2.players[0].deck.length === 6);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
