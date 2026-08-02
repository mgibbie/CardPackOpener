// duels_boot_test.mjs — the ?duels=1 run scaffolding (game.js data layer),
// new HS-Duels model: a 10-card arena draft, generated enemies at parity, and
// a win/loss run. Overlays are DOM-bound; the boot surgery + loot wiring are
// plain data, replicated here and exercised against a real game.
import fs from 'fs';
import * as E from '../../engine.js';
import * as Du from '../../duels.js';
import * as Heist from '../../heist.js';
import { validateGameState } from '../../engine/validate.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// each playable hero drafts a real 10-card deck (from its class(es)) and has powers
for (const hero of Du.HEROES) {
	const classes = Du.classesOf(hero);
	ok(`${hero.id}: draft pool has enough cards`, Du.draftPool(cardsById, classes).length >= 10);
	const deck = Du.autoDraftDeck(cardsById, classes, seededRng(hero.id.length + 3), 10);
	ok(`${hero.id}: drafts 10 valid cards`, deck.length === 10 && deck.every(id => cardsById[id]));
	const powers = classes.flatMap(cl => Du.HERO_POWERS[cl] || []);
	ok(`${hero.id}: class powers resolve to heropower cards`, powers.length >= 1
		&& powers.every(id => cardsById[id] && cardsById[id].type === 'heropower' && cardsById[id].power), powers.filter(id => !cardsById[id]));
}

// ---- replica of game.js bootDuelsEncounter (new model): player draft +
// generated enemy at parity, passives applied to both sides, equal footing
function bootDuelsRun(heroId, games, powerId, playerPassives, rng, classChoice) {
	let hero = Du.HEROES.find(h => h.id === heroId);
	// Drek'Thar / Vanndar: play as the chosen single class
	if (Du.classChoicesOf(hero) && classChoice) hero = { ...hero, heroClass: classChoice, classes: [classChoice] };
	const deck = Du.autoDraftDeck(cardsById, Du.classesOf(hero), rng, 10);
	const rival = Du.RIVALS[Math.floor(rng() * Du.RIVALS.length)];
	const rivalClasses = Du.classesOf(rival);
	const enemy = Du.generateEnemy(cardsById, rivalClasses, games, rng);
	// mirror genDuelsEnemy: the enemy also rolls a hero power (class default = null, or an alt)
	const altPowers = rivalClasses.flatMap(cl => Du.HERO_POWERS[cl] || []).filter(id => cardsById[id] && cardsById[id].power);
	const enemyPowerId = [null, ...altPowers][Math.floor(rng() * (altPowers.length + 1))];
	const playerCls = { id: hero.heroClass, name: hero.heroClass, power: null };
	const enemyCls = { id: rival.heroClass, name: rival.heroClass, power: null };
	const state = E.createGame(cardsById, rng, [...deck], 2, [playerCls, enemyCls]);
	if (powerId && cardsById[powerId]) {
		const pw = E.instantiate(cardsById[powerId], 0);
		pw.zone = 'heropower'; pw.usedThisTurn = false;
		state.players[0].heroPowers = [pw];
	}
	E.resetDeckAndHand(state, 1, [...enemy.deck]);
	E.drawCards(state, 1, 4);
	E.stripLoadouts(state);
	if (enemyPowerId && cardsById[enemyPowerId]) {
		const epw = E.instantiate(cardsById[enemyPowerId], 1);
		epw.zone = 'heropower'; epw.usedThisTurn = false;
		state.players[1].heroPowers = [epw];
	}
	for (const id of playerPassives) Du.applyPassive(state, 0, id);
	for (const id of enemy.passives) Du.applyPassive(state, 1, id);
	return { state, deck, enemy, enemyPowerId };
}

// boot & play a couple of turns for every hero across early / mid / deep runs
const somePassives = ['band_of_bees', 'rhonins_scrying_orb'];
let enemyPowered = 0, enemyPoweredFired = 0;
for (const hero of Du.HEROES) {
	const altPower = (Du.HERO_POWERS[hero.heroClass] || [])[0] || null;
	const scenarios = [
		{ games: 0, powerId: null, passives: [] },
		{ games: 5, powerId: altPower, passives: somePassives },
		{ games: 11, powerId: altPower, passives: somePassives },
	];
	for (const sc of scenarios) {
		const rng = seededRng((hero.id.length + 1) * 31 + sc.games);
		try {
			const { state, deck, enemy, enemyPowerId } = bootDuelsRun(hero.id, sc.games, sc.powerId, sc.passives, rng);
			// parity: the enemy carries the same power budget the player has by now
			const loot = Du.enemyLoot(sc.games);
			if (enemy.deck.length !== 10 + 3 * loot.buckets + loot.treasures) {
				fail++; console.log('FAIL parity:', hero.id, sc.games, enemy.deck.length); continue;
			}
			if (sc.powerId && state.players[0].heroPowers[0]?.id !== sc.powerId) {
				fail++; console.log('FAIL power swap:', hero.id, sc.powerId); continue;
			}
			// parity: when the enemy rolled an alt hero power, it's equipped on player 1
			if (enemyPowerId) {
				enemyPowered++;
				if (state.players[1].heroPowers[0]?.id === enemyPowerId) enemyPoweredFired++;
			}
			// enemy fires its power, a couple of turns pass; state stays legal
			const pw = state.players[1].heroPowers[0];
			state.current = 1;
			if (pw) E.useHeroPower(state, 1, pw.uid, null);
			state.current = 0;
			E.endTurn(state); E.endTurn(state);
			const errs = validateGameState(state);
			if (errs.length) { fail++; console.log('FAIL validate:', hero.id, sc.games, errs.slice(0, 2)); continue; }
			pass++;
		} catch (err) { fail++; console.log('FAIL boot:', hero.id, sc.games, String(err).slice(0, 140)); }
	}
}
// the enemy-hero-power parity path is actually exercised, and every rolled power equipped & fired legally
ok('enemy hero-power parity: some enemies rolled an alt power', enemyPowered > 0, enemyPowered);
ok('enemy hero-power parity: every rolled power was equipped on the enemy', enemyPowered === enemyPoweredFired, [enemyPowered, enemyPoweredFired]);

// choose-your-class heroes boot & play as their chosen single class
for (const [heroId, cl] of [['drekthar', 'mage'], ['drekthar', 'warrior'], ['vanndar', 'rogue'], ['vanndar', 'priest']]) {
	const rng = seededRng(heroId.length * 7 + cl.length + 2);
	try {
		const { state, deck } = bootDuelsRun(heroId, 3, null, [], rng, cl);
		const errs = validateGameState(state);
		const playerClsId = state.classPicks?.[0]?.id ?? state.players[0]?.classId;
		ok(`${heroId} as ${cl}: boots a legal 10+ card game as the chosen class`,
			deck.length === 10 && !errs.length && (playerClsId === cl || playerClsId == null), [playerClsId, errs.slice(0, 1)]);
	} catch (err) { fail++; console.log('FAIL choose-class:', heroId, cl, String(err).slice(0, 120)); }
}

// optional anomaly modifier (shared with Heist) can be enabled on a Duels run
ok('anomaly picker offers the Heist anomaly set', Object.keys(Heist.ANOMALIES).length >= 8);
for (const anomId of ['growing', 'arcane', 'infused', 'gorged', 'rattling']) {
	const rng = seededRng(anomId.length * 5 + 1);
	try {
		const { state } = bootDuelsRun('mozaki', 3, null, ['band_of_bees'], rng);
		Heist.applyAnomaly(state, anomId); // game.js does this in bootDuelsEncounter
		const set = state.anomaly === anomId;
		state.current = 1; const pw = state.players[1].heroPowers[0]; if (pw) E.useHeroPower(state, 1, pw.uid, null);
		state.current = 0; E.endTurn(state); E.endTurn(state);
		const errs = validateGameState(state);
		ok(`anomaly ${anomId}: applied & the game stays legal`, set && !errs.length, errs.slice(0, 2));
	} catch (err) { fail++; console.log('FAIL anomaly:', anomId, String(err).slice(0, 120)); }
}

// the between-game treasure reward pool exists (active DUELS treasures)
const treasurePool = Object.values(cardsById).filter(d => d.treasure && d.set === 'DUELS');
ok('DUELS treasure reward pool is populated (>= 30)', treasurePool.length >= 30, treasurePool.length);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
