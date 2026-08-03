// browser_paths_smoke_test.mjs — headless replication of game.js's boot paths
// (PR 41). game.js itself is browser-only (THREE/DOM), so this suite replays
// its EXACT engine call sequences: dungeon-run boot with treasures (the PR 15
// setup-API conversions), duel host boot + guest-deck setup, host→wire→guest
// snapshot ingest (PR 6/7), and spectator ingest — then plays real turns on
// each. What it cannot cover: rendering, input handling, and the MPX network
// layer — those still need a human click-through.
import fs from 'fs';
import * as E from '../../engine.js';
import { validateGameState } from '../../engine/validate.js';
import { seededRng } from '../../engine/rng.js';
import { dispatch } from '../../engine/actionlog.js';
import * as Dungeon from '../../dungeon.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
const CLASSES = JSON.parse(fs.readFileSync(new URL('../../classes.json', import.meta.url))).classes;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// drive a game with simple legal actions (plays + attacks + hero powers + endTurn)
function autoplay(state, rng, actions) {
	for (let a = 0; a < actions && !state.over; a++) {
		state._fxCount = 0;
		const pi = state.current, p = state.players[pi];
		if (state.pickQueue.length) { dispatch(state, { k: 'pick', id: state.pickQueue[0].ids[Math.floor(rng() * state.pickQueue[0].ids.length)] }); continue; }
		if (state.askQueue.length) { dispatch(state, { k: 'ask', yes: rng() < 0.5 }); continue; }
		if (state.scryQueue.length) { dispatch(state, { k: 'scry', ids: [] }); continue; }
		if (state.dredgeQueue.length) { dispatch(state, { k: 'dredge', id: state.dredgeQueue[0].ids[0] }); continue; }
		if (state.discardQueue.length) { const q = state.discardQueue[0]; dispatch(state, { k: 'discard', uids: state.players[q.player].hand.slice(0, q.count).map(c => c.uid) }); continue; }
		if (state.sacQueue.length) { dispatch(state, { k: 'sac' }); continue; }
		if (state.priority != null) { dispatch(state, { k: 'pass', pi: state.priority }); continue; }
		const playable = p.hand.filter(c => E.canPlay(state, pi, c) && !E.targetSpec(state, pi, c)?.required && !c.choices);
		if (playable.length && rng() < 0.6) { dispatch(state, { k: 'play', pi, uid: playable[0].uid, target: null, choice: null }); continue; }
		const hp0 = p.heroPowers.find(h => E.canUseHeroPower(state, pi, h) && !E.heroPowerSpec(state, pi, h)?.required);
		if (hp0 && rng() < 0.5) { dispatch(state, { k: 'power', pi, uid: hp0.uid, target: null }); continue; }
		const att = E.attackersFor(state, pi)[0];
		if (att) { const ts = E.attackTargets(state, pi, att); if (ts.length) { dispatch(state, { k: 'attack', pi, uid: att.uid, target: ts[0] }); continue; } }
		dispatch(state, { k: 'endTurn' });
	}
	const v = validateGameState(state);
	return v.length ? v.join(' | ') : null;
}

// ---------- dungeon-run boot (game.js bootEncounter + applyTreasures) ----------
{
	const rng = seededRng(4242);
	const level = 3;
	const bossId = Dungeon.randomBoss(level, rng);
	const boss = Dungeon.BOSSES[bossId];
	const clsPick = CLASSES.find(c => c.id === 'mage') || CLASSES[0];
	const bossPick = { id: bossId, name: boss.name, power: boss.power || null };
	const deckIds = Dungeon.STARTER_DECKS[clsPick.id] || boss.deck;
	const state = E.createGame(byId, rng, [...deckIds], 2, [clsPick, bossPick]);
	state.classPicks = [clsPick, bossPick];
	// boss surgery, exactly as bootEncounter does it post-PR15
	const runHP = 15 + (level - 1) * 5;
	E.applyHeroMods(state, 1, { life: runHP, maxLife: runHP });
	E.applyHeroMods(state, 0, { life: runHP, maxLife: runHP });
	E.resetDeckAndHand(state, 1, boss.deck);
	E.drawCards(state, 1, 4);
	if (boss.passive === 'battlecries-twice' || boss.passive === 'both-twice') E.applyHeroMods(state, 1, { battlecriesTwice: true });
	if (boss.passive === 'deathrattles-twice' || boss.passive === 'both-twice') E.applyHeroMods(state, 1, { deathrattlesTwice: true });
	E.stripLoadouts(state);
	// applyTreasures, one of each kind the switch handles via the setup APIs
	const p = state.players[0];
	E.applyHeroMods(state, 0, { life: p.life * 2, maxLife: p.life * 2 }); // potion_of_vitality
	const manaBefore = p.mana.max; // createGame may seed a start-of-game mana ramp from the boss's random default deck — assert the delta, not a fixed total
	E.addManaCrystal(state, 0);                                          // crystal_gem
	E.drawCards(state, 0, 2);                                            // small_backpacks
	E.grantEmblem(state, 0, { id: 'captured_flag', name: Dungeon.TREASURES.captured_flag.name, description: Dungeon.TREASURES.captured_flag.text, aura: { attack: 1, health: 1 } });
	E.grantEmblem(state, 0, { id: 'robe_of_the_magi', name: Dungeon.TREASURES.robe_of_the_magi.name, description: Dungeon.TREASURES.robe_of_the_magi.text, static: { type: 'spell-damage', value: 3 } });
	E.applyHeroMods(state, 0, { deathrattlesTwice: true });              // totem_of_the_dead
	E.capHeroPowerCost(state, 0, 1);                                     // justicars_ring
	ok('dungeon boot: vitals + passives + treasures applied', state.players[1].life === runHP
		&& p.life === runHP * 2 && p.mana.max === manaBefore + 1 && p.emblems.length === 2
		&& p.heroPowers.every(h => h.power.cost <= 1) && p.deathrattlesTwice === true);
	ok('dungeon boot: validator clean', validateGameState(state).length === 0, validateGameState(state).join(' | '));
	ok('dungeon boot: spell-damage treasure counts', E.staticValue(p, 'spell-damage') === 3);
	const err = autoplay(state, rng, 120);
	ok('dungeon fight: 120 actions incl. hero powers play clean', err === null && !Number.isNaN(state.players[0].life), err);
}
// ---------- duel host boot + guest setup + host→wire→guest ingest ----------
{
	const rng = seededRng(777);
	const hostPicks = [CLASSES.find(c => c.id === 'warrior') || CLASSES[0], CLASSES.find(c => c.id === 'priest') || CLASSES[1]];
	const hostDeck = Object.values(byId).filter(d => d.type === 'creature' && !d.token && d.collectible !== false && !(d.colors && d.colors.length)).slice(0, 40).map(d => d.id);
	const guestDeck = Object.values(byId).filter(d => d.type === 'creature' && !d.token && d.collectible !== false && !(d.colors && d.colors.length)).slice(40, 80).map(d => d.id);
	const state = E.createGame(byId, rng, [...hostDeck], 2, hostPicks, [{ commander: null, companion: null }, { commander: null, companion: null }]);
	state.classPicks = hostPicks;
	// guest deck + opening hand + coin, exactly as startDuelHost does post-PR15
	E.resetDeckAndHand(state, 1, guestDeck);
	E.drawCards(state, 1, 4);
	E.addCoin(state, 1);
	ok('duel boot: guest fielded with own deck, 5 cards (incl. Coin)', state.players[1].deck.length === 36 && state.players[1].hand.length === 5);
	// host plays a few turns, publishing each tick like publishDuel does
	const err = autoplay(state, rng, 60);
	ok('duel: 60 host-side actions clean', err === null, err);
	// wire round-trip: snapshotForDuel → server JSON → guest ingest (PR 6/7 path)
	const wire = JSON.parse(JSON.stringify(E.toSnapshot(state)));
	const guest = E.fromSnapshot(wire, byId);
	E.ensureUidsAbove(E.maxSnapshotUid(wire));
	ok('guest ingest: validator clean', validateGameState(guest).length === 0, validateGameState(guest).join(' | '));
	// the guest simulates optimistically on the ingested state
	const err2 = autoplay(guest, seededRng(778), 40);
	ok('guest optimistic sim: 40 actions clean on ingested state', err2 === null, err2);
}
// ---------- spectator ingest (startSpectate tick) ----------
{
	const rng = seededRng(31337);
	const state = E.createGame(byId, rng, null, 2, [CLASSES[2] || CLASSES[0], CLASSES[3] || CLASSES[1]]);
	autoplay(state, rng, 50);
	const wire = JSON.parse(JSON.stringify(E.toSnapshot(state)));
	const watcher = E.fromSnapshot(wire, byId);
	E.ensureUidsAbove(E.maxSnapshotUid(wire));
	ok('spectator ingest: validator clean, pending decisions visible', validateGameState(watcher).length === 0
		&& Array.isArray(watcher.pickQueue) && wire.playerCount === 2);
	ok('spectator sees the same boards', JSON.stringify(watcher.players.map(p => p.board.map(c => c.uid)))
		=== JSON.stringify(state.players.map(p => p.board.map(c => c.uid))));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
