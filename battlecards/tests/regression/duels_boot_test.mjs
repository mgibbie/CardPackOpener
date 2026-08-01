// duels_boot_test.mjs — the ?duels=1 run scaffolding (game.js data layer),
// new HS-Duels model: a 10-card arena draft, generated enemies at parity, and
// a win/loss run. Overlays are DOM-bound; the boot surgery + loot wiring are
// plain data, replicated here and exercised against a real game.
import fs from 'fs';
import * as E from '../../engine.js';
import * as Du from '../../duels.js';
import { validateGameState } from '../../engine/validate.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// each playable hero drafts a real 10-card deck and has resolvable class powers
for (const hero of Du.HEROES) {
	ok(`${hero.id}: draft pool has enough cards`, Du.draftPool(cardsById, hero.heroClass).length >= 10);
	const deck = Du.autoDraftDeck(cardsById, hero.heroClass, seededRng(hero.id.length + 3), 10);
	ok(`${hero.id}: drafts 10 valid cards`, deck.length === 10 && deck.every(id => cardsById[id]));
	const powers = Du.HERO_POWERS[hero.heroClass] || [];
	ok(`${hero.id}: class powers resolve to heropower cards`, powers.length >= 1
		&& powers.every(id => cardsById[id] && cardsById[id].type === 'heropower' && cardsById[id].power), powers.filter(id => !cardsById[id]));
}

// ---- replica of game.js bootDuelsEncounter (new model): player draft +
// generated enemy at parity, passives applied to both sides, equal footing
function bootDuelsRun(heroId, games, powerId, playerPassives, rng) {
	const hero = Du.HEROES.find(h => h.id === heroId);
	const deck = Du.autoDraftDeck(cardsById, hero.heroClass, rng, 10);
	const rival = Du.RIVALS[Math.floor(rng() * Du.RIVALS.length)];
	const enemy = Du.generateEnemy(cardsById, rival.heroClass, games, rng);
	const playerCls = { id: hero.heroClass, name: hero.heroClass, power: null };
	const enemyCls = { id: enemy.heroClass, name: enemy.heroClass, power: null };
	const state = E.createGame(cardsById, rng, [...deck], 2, [playerCls, enemyCls]);
	if (powerId && cardsById[powerId]) {
		const pw = E.instantiate(cardsById[powerId], 0);
		pw.zone = 'heropower'; pw.usedThisTurn = false;
		state.players[0].heroPowers = [pw];
	}
	E.resetDeckAndHand(state, 1, [...enemy.deck]);
	E.drawCards(state, 1, 4);
	E.stripLoadouts(state);
	for (const id of playerPassives) Du.applyPassive(state, 0, id);
	for (const id of enemy.passives) Du.applyPassive(state, 1, id);
	return { state, deck, enemy };
}

// boot & play a couple of turns for every hero across early / mid / deep runs
const somePassives = ['band_of_bees', 'rhonins_scrying_orb'];
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
			const { state, deck, enemy } = bootDuelsRun(hero.id, sc.games, sc.powerId, sc.passives, rng);
			// parity: the enemy carries the same power budget the player has by now
			const loot = Du.enemyLoot(sc.games);
			if (enemy.deck.length !== 10 + 3 * loot.buckets + loot.treasures) {
				fail++; console.log('FAIL parity:', hero.id, sc.games, enemy.deck.length); continue;
			}
			if (sc.powerId && state.players[0].heroPowers[0]?.id !== sc.powerId) {
				fail++; console.log('FAIL power swap:', hero.id, sc.powerId); continue;
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

// the between-game treasure reward pool exists (active DUELS treasures)
const treasurePool = Object.values(cardsById).filter(d => d.treasure && d.set === 'DUELS');
ok('DUELS treasure reward pool is populated (>= 30)', treasurePool.length >= 30, treasurePool.length);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
