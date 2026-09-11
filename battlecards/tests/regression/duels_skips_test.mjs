// duels_skips_test.mjs — the Duels "deliberate skips" close-out: the Darius
// Crowley cannon subsystem (Cannon token, Fire! kit, signature creatures,
// Draconic Munition), Toki's Temporal Loop (snapshot turn-restart), the AV
// tactic families (cycling powers + Choose actives + HK passives), Journey to
// the East (quest -> Uber Diablo), Infinite Arcane, and Marvelous Mycelium.
import fs from 'fs';
import * as E from '../../engine.js';
import * as Duels from '../../duels.js';
import { seededRng } from '../../engine/rng.js';
import { effectiveCost } from '../../engine/cost.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'Dummy', type: 'creature', cost: 1, attack: 2, health: 8, rarity: 'common' };
byId._glass = { id: '_glass', name: 'Glass', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common' };
byId._cheap = { id: '_cheap', name: 'Cheap Neutral', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common' };
byId._classy = { id: '_classy', name: 'Classy Mage', type: 'creature', cost: 2, attack: 2, health: 4, rarity: 'common', cardClass: 'mage' };

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
const install = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'heropower'; c.usedThisTurn = false; st.players[pi].heroPowers.push(c); return c; };
const fire = (st, pi, id, target, choice) => { const hp = install(st, pi, id); E.useHeroPower(st, pi, hp.uid, target ?? null, choice ?? null); return hp; };

// ---- wiring ----
{
	const darius = Duels.HEROES.find(h => h.id === 'darius');
	ok('Darius Crowley is a playable Duels hero', !!darius && darius.heroClass === 'warrior');
	ok('Darius has his Fire! kit + opening Cannons', !!darius && darius.powerIds.length === 3 && darius.startSummon.length === 2);
	ok('every Darius powerId exists with a power block', darius.powerIds.every(id => byId[id] && byId[id].power));
	const rival = Duels.RIVALS.find(r => r.id === 'darius');
	ok('the Darius RIVAL carries the same kit', !!rival && rival.powerIds && rival.powerIds.length === 3 && rival.startSummon && rival.startSummon.length === 2);
	ok('Temporal Loop is in the mage power pool', Duels.HERO_POWERS.mage.includes('duelshp_temporal_loop'));
	const ids = ['duels_cannon', 'duels_grizzled_reinforcement', 'duels_tuskarr_raider', 'duels_seabreaker_goliath', 'duels_deck_swabbie',
		'duels_draconic_munition', 'duelshp_fire', 'duelshp_fire_away', 'duelshp_fire_at_thee', 'duelshp_temporal_loop',
		'duelshp_bolster_defenses', 'duelshp_gather_resources', 'duelshp_thunderclap', 'duelshp_take_the_bridge',
		'duelshp_summon_the_pack', 'duelshp_rush_the_keep', 'duels_frostwolf_cub', 'duels_choose_a_new_tactic',
		'duels_choose_a_new_command', 'duels_journey_to_the_east', 'duels_infinite_arcane', 'duels_marvelous_mycelium'];
	ok('all 22 skip-wave cards exist', ids.every(id => byId[id]), ids.filter(id => !byId[id]).join(','));
	ok('the tactic families cycle (base powers carry tacticFamily)',
		byId.duelshp_battle_tactics.power.tacticFamily.length === 4 && byId.duelshp_war_commands.power.tacticFamily.length === 4);
}

// ---- fireCannons: opposite slot, or the hero when it's empty ----
{
	const st = fresh();
	put(st, 0, 'duels_cannon'); put(st, 0, 'duels_cannon');
	const g = put(st, 1, '_glass'); // opposite the first cannon
	const kills = E.fireCannons(st, 0);
	ok('a cannon volley kills the glass creature opposite', E.isDead(g) && kills === 1, kills);
	ok('the unopposed cannon hits the enemy hero', st.players[1].life === 39, st.players[1].life);
	ok('the volley counts once toward cannonsFiredGame', st.players[0].cannonsFiredGame === 1);
	ok('no cannons -> no fire counted', E.fireCannons(st, 1) === 0 && !st.players[1].cannonsFiredGame);
}

// ---- Fire! refreshes on a kill; stays spent without one ----
{
	const st = fresh();
	put(st, 0, 'duels_cannon');
	put(st, 1, '_glass');
	const hp1 = fire(st, 0, 'duelshp_fire');
	ok('Fire!: a killing volley refreshes the power', hp1.usedThisTurn === false);
	const st2 = fresh();
	put(st2, 0, 'duels_cannon');
	put(st2, 1, '_v');
	const hp2 = fire(st2, 0, 'duelshp_fire');
	ok('Fire!: a non-lethal volley stays spent', hp2.usedThisTurn === true && st2.players[1].board[0].damage === 1);
}

// ---- Fire Away! / Fire at Thee! ----
{
	const st = fresh();
	const cn = put(st, 0, 'duels_cannon');
	const v = put(st, 1, '_v');
	fire(st, 0, 'duelshp_fire_away');
	ok('Fire Away!: volley + your creatures get +1 Attack', v.damage === 1 && cn.attack === 1, [v.damage, cn.attack].join('|'));
	const st2 = fresh();
	put(st2, 0, 'duels_cannon');
	const v2 = put(st2, 1, '_v');
	fire(st2, 0, 'duelshp_fire_at_thee');
	ok('Fire at Thee!: two volleys land', v2.damage === 2 && st2.players[0].cannonsFiredGame === 2, [v2.damage, st2.players[0].cannonsFiredGame].join('|'));
}

// ---- Draconic Munition: +1 cannon damage for the game ----
{
	const st = fresh();
	put(st, 0, 'duels_cannon');
	const v = put(st, 1, '_v');
	const c = give(st, 0, 'duels_draconic_munition');
	E.playCard(st, 0, c.uid, null, null);
	ok('Draconic Munition sets the bonus', st.players[0].cannonBonus === 1);
	E.fireCannons(st, 0);
	ok('boosted cannons deal 2', v.damage === 2, v.damage);
}

// ---- the signature creatures ----
{
	const st = fresh();
	const c = give(st, 0, 'duels_grizzled_reinforcement');
	E.playCard(st, 0, c.uid, null, null);
	ok('Grizzled Reinforcement summons an extra Cannon', st.players[0].board.some(x => x.cannon), st.players[0].board.map(x => x.id).join(','));
}
{
	const st = fresh();
	const tk = put(st, 0, 'duels_tuskarr_raider');
	put(st, 0, 'duels_cannon');
	const v = put(st, 1, '_v');
	E.resolveCombat(st, 0, tk.uid, { type: 'creature', uid: v.uid, player: 1 });
	ok('Tuskarr Raider fires the Cannons after it attacks', st.players[1].life === 39 && st.players[0].cannonsFiredGame === 1, st.players[1].life);
}
{
	const st = fresh();
	put(st, 0, 'duels_deck_swabbie');
	put(st, 0, 'duels_cannon');
	E.endTurn(st);
	ok('Deck Swabbie fires the Cannons at end of turn', st.players[1].life === 39, st.players[1].life);
}
{
	const st = fresh();
	const g = give(st, 0, 'duels_seabreaker_goliath');
	ok('Seabreaker Goliath starts at (10)', effectiveCost(st, 0, g) === 10);
	st.players[0].cannonsFiredGame = 4;
	ok('Goliath costs (1) less per cannon fire', effectiveCost(st, 0, g) === 6, effectiveCost(st, 0, g));
}

// ---- Temporal Loop: the turn restarts from its snapshot ----
{
	const st = fresh();
	const tl = install(st, 0, 'duelshp_temporal_loop');
	E.endTurn(st); // -> p1
	E.endTurn(st); // -> p0; the turn-start snapshot is captured here
	const handBefore = st.players[0].hand.length, manaBefore = st.players[0].mana.cur;
	E.drawCards(st, 0, 2);
	st.players[0].mana.cur -= 3;
	put(st, 0, '_cheap');
	const okUse = E.useHeroPower(st, 0, st.players[0].heroPowers[0].uid, null, null);
	ok('Temporal Loop fires', okUse === true);
	ok('the hand rewinds to the turn start', st.players[0].hand.length === handBefore, st.players[0].hand.length + ' vs ' + handBefore);
	ok('the mana rewinds too', st.players[0].mana.cur === manaBefore);
	ok('the board rewinds (the cheap creature is gone)', !st.players[0].board.some(c => c.id === '_cheap'));
	const tl2 = st.players[0].heroPowers.find(c => c.power && c.power.temporalLoop);
	ok('the power itself stays spent after the rewind', tl2 && tl2.usedThisTurn === true);
	ok('it cannot loop twice in one turn', E.useHeroPower(st, 0, tl2.uid, null, null) === false);
}

// ---- AV tactics: the family cycles each turn ----
{
	const st = fresh();
	const bt = install(st, 0, 'duelshp_battle_tactics');
	const uid = bt.uid;
	E.endTurn(st); E.endTurn(st); // p0's next turn start morphs the tactic
	const now = st.players[0].heroPowers[0];
	ok('the tactic morphed into another family member', now.uid === uid && now.id !== 'duelshp_battle_tactics'
		&& byId.duelshp_battle_tactics.power.tacticFamily.includes(now.id), now.id);
}

// ---- passive tactics: summon riders ----
{
	const st = fresh();
	install(st, 0, 'duelshp_bolster_defenses');
	E.execEffects(st, 0, [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Grunt' }], null, null);
	const g = st.players[0].board.find(c => c.name === 'Grunt');
	ok('Bolster Defenses: your Neutral summons get +1/+2', g && g.attack === 3 && g.maxHealth === 4, g && [g.attack, g.maxHealth].join('/'));
}
{
	const st = fresh();
	install(st, 0, 'duelshp_take_the_bridge');
	E.execEffects(st, 0, [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Runner' }], null, null);
	const g = st.players[0].board.find(c => c.name === 'Runner');
	ok('Take the Bridge!: +2 Attack & Rush on Neutral summons', g && g.attack === 4 && g.keywords.includes('rush'), g && g.attack);
}

// ---- passive tactics: exact-lethal ("Honorable") combat kills ----
{
	const st = fresh();
	install(st, 0, 'duelshp_gather_resources');
	const atk = put(st, 0, '_cheap');           // 2 Attack
	const def = put(st, 1, '_cheap');           // exactly 2 Health
	E.resolveCombat(st, 0, atk.uid, { type: 'creature', uid: def.uid, player: 1 });
	ok('Gather Resources: an exact-lethal kill adds a spell', st.players[0].hand.length === 1 && E.isSpellType(st.players[0].hand[0]), st.players[0].hand.map(c => c.id).join(','));
}
{
	const st = fresh();
	install(st, 0, 'duelshp_summon_the_pack');
	const atk = put(st, 0, '_cheap');
	const def = put(st, 1, '_cheap');
	E.resolveCombat(st, 0, atk.uid, { type: 'creature', uid: def.uid, player: 1 });
	ok('Summon the Pack: the kill summons a Frostwolf Cub', st.players[0].board.some(c => c.id === 'duels_frostwolf_cub'), st.players[0].board.map(c => c.id).join(','));
	const st2 = fresh();
	install(st2, 0, 'duelshp_summon_the_pack');
	const atk2 = put(st2, 0, '_v');             // 2 Attack into 8 Health: no kill
	const def2 = put(st2, 1, '_v');
	E.resolveCombat(st2, 0, atk2.uid, { type: 'creature', uid: def2.uid, player: 1 });
	ok('no cub without a kill', !st2.players[0].board.some(c => c.id === 'duels_frostwolf_cub'));
}

// ---- active tactics ----
{
	const st = fresh();
	put(st, 0, '_cheap');
	const v = put(st, 1, '_v');
	fire(st, 0, 'duelshp_thunderclap');
	ok('Thunderclap sweeps 1 damage & -1 Attack with an all-Neutral board', v.damage === 1 && v.attack === 1, [v.damage, v.attack].join('|'));
	const st2 = fresh();
	put(st2, 0, '_cheap'); put(st2, 0, '_classy');
	const v2 = put(st2, 1, '_v');
	fire(st2, 0, 'duelshp_thunderclap');
	ok('Thunderclap refuses with a class creature on board', v2.damage === 0 && v2.attack === 2);
}
{
	const st = fresh();
	const n = put(st, 0, '_cheap'), m = put(st, 0, '_classy');
	fire(st, 0, 'duelshp_rush_the_keep');
	ok('Rush the Keep: only Neutral creatures get +1 Attack', n.attack === 3 && m.attack === 2, [n.attack, m.attack].join('|'));
}

// ---- Choose a New Tactic / Command ----
{
	const st = fresh();
	const c = give(st, 0, 'duels_choose_a_new_command');
	E.playCard(st, 0, c.uid, null, null);
	ok('Choose a New Command queues the family pick', st.pickQueue.length === 1 && st.pickQueue[0].mode === 'choose-tactic' && st.pickQueue[0].ids.length === 4);
	E.resolvePick(st, 'duelshp_take_the_bridge');
	ok('the chosen tactic installs as your power', st.players[0].heroPowers.length === 1 && st.players[0].heroPowers[0].id === 'duelshp_take_the_bridge');
	const c2 = give(st, 0, 'duels_choose_a_new_tactic');
	E.playCard(st, 0, c2.uid, null, null);
	E.resolvePick(st, 'duelshp_thunderclap');
	ok('a later choice morphs the existing tactic in place', st.players[0].heroPowers.length === 1 && st.players[0].heroPowers[0].id === 'duelshp_thunderclap',
		st.players[0].heroPowers.map(c3 => c3.id).join(','));
}

// ---- Journey to the East: the quest and the Uber Diablo transform ----
{
	const st = fresh();
	const q = give(st, 0, 'duels_journey_to_the_east');
	E.playCard(st, 0, q.uid, null, null);
	ok('the quest installs', st.players[0].quests.length === 1);
	put(st, 1, '_glass');
	E.damageHero(st, 0, 10, null, true);
	ok('own-turn damage advances the quest', st.players[0].quests[0].progress === 10);
	st.current = 1;
	E.damageHero(st, 0, 10, null, true);
	ok("the opponent's turn does not", st.players[0].quests[0].progress === 10);
	st.current = 0;
	E.damageHero(st, 0, 15, null, true); // 25 total on own turns
	ok('the quest completes and Uber Diablo rises', st.players[0].uberDiablo === true && st.players[0].quests.length === 0);
	ok('reborn at full strength', st.players[0].life === 40, st.players[0].life);
	ok('6 damage hits ALL enemies', st.players[1].life === 34 && !st.players[1].board.some(c => !E.isDead(c)), st.players[1].life);
	ok('an Uber Apocalypse is in hand + 3 cards drawn', st.players[0].hand.some(c => c.id === 'duels_uber_apocalypse') && st.players[0].hand.length === 4,
		st.players[0].hand.map(c => c.id).join(','));
}

// ---- Infinite Arcane ----
{
	const st = fresh();
	const c = give(st, 0, 'duels_infinite_arcane');
	E.playCard(st, 0, c.uid, null, null);
	ok('the deck is destroyed', st.players[0].deck.length === 0 && st.players[0].destroyedDeck.length === 6);
	E.endTurn(st); // p1 draws normally
	E.endTurn(st); // p0's draw becomes the Discover
	const pend = st.pickQueue.find(pq => pq.mode === 'infinite-arcane');
	ok('the turn draw becomes a Discover from the destroyed deck', !!pend, st.pickQueue.map(pq => pq.mode).join(','));
	if (pend) {
		E.resolvePick(st, pend.ids[0]);
		const drawn = st.players[0].hand[st.players[0].hand.length - 1];
		ok('the pick is drawn at (2) less', drawn && drawn.id === '_v' && drawn.cost === 0, drawn && drawn.cost);
		ok('it leaves the destroyed pile', st.players[0].destroyedDeck.length === 5);
	}
}

// ---- Marvelous Mycelium ----
{
	const st = fresh();
	st.players[0].deck = [];
	const c = give(st, 0, 'duels_marvelous_mycelium');
	E.playCard(st, 0, c.uid, null, null);
	ok('three Choose One Discovers queue', st.pickQueue.length === 3 && st.pickQueue.every(pq => pq.mycelium), st.pickQueue.length);
	const picked = [];
	while (st.pickQueue.length) { picked.push(st.pickQueue[0].ids[0]); E.resolvePick(st, st.pickQueue[0].ids[0]); }
	ok('every pick has Choose One branches', picked.every(id => Array.isArray(byId[id].choices) && byId[id].choices.length >= 2), picked.join(','));
	ok('the picks shuffle into the deck', st.players[0].deck.length === 3, st.players[0].deck.length);
	E.drawCards(st, 0, 1);
	const drawn = st.players[0].hand[st.players[0].hand.length - 1];
	ok('a drawn pick carries both effects combined', drawn && drawn._chooseBoth === true, drawn && drawn.id);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
