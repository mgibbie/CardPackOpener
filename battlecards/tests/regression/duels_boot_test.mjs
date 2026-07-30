// duels_boot_test.mjs — the ?duels=1 run scaffolding (game.js data layer). The
// overlays are DOM-bound, but the boss ladder, boot surgery, power swap, and
// passive/reward wiring are plain data — replicated here and exercised against
// a real game (mirrors tombs_run_test.mjs).
import fs from 'fs';
import * as E from '../../engine.js';
import * as Du from '../../duels.js';
import * as D from '../../dungeon.js';
import { validateGameState } from '../../engine/validate.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// ---- replica of game.js duelsBossFor (6 = Diablo, 12 = Uber Diablo, else pool)
function duelsBossFor(level, rng) {
	if (level >= 12) return 'uber_diablo';
	if (level === 6) return 'diablo';
	const pool = level < 6 ? Du.ROUNDS[0].pool : Du.ROUNDS[1].pool;
	return pool[Math.floor(rng() * pool.length)];
}

// the 12-fight ladder resolves to real bosses; finals land only at 6 and 12
{
	const rng = seededRng(7);
	let ladderOk = true, finalsOk = true;
	for (let lvl = 1; lvl <= 12; lvl++) {
		const bid = duelsBossFor(lvl, rng);
		if (!Du.BOSSES[bid]) ladderOk = false;
		if (lvl === 6 && bid !== 'diablo') finalsOk = false;
		if (lvl === 12 && !(bid === 'uber_diablo' && Du.BOSSES[bid].final)) finalsOk = false;
		if (lvl !== 6 && lvl !== 12 && (bid === 'diablo' || bid === 'uber_diablo')) finalsOk = false;
	}
	ok('12-fight ladder: every fight resolves to a real boss', ladderOk);
	ok('finals land only at fight 6 (Diablo) & 12 (Uber Diablo)', finalsOk);
}

// each hero has a starter deck, bucket set, and resolvable class hero powers
for (const hero of Du.HEROES) {
	ok(`${hero.id}: starter deck present`, (D.STARTER_DECKS[hero.heroClass] || []).length >= 10);
	ok(`${hero.id}: bucket set present`, (D.BUCKETS[hero.heroClass] || []).length >= 3);
	const powers = Du.HERO_POWERS[hero.heroClass] || [];
	ok(`${hero.id}: class powers all resolve to heropower cards`, powers.length >= 1
		&& powers.every(id => cardsById[id] && cardsById[id].type === 'heropower' && cardsById[id].power), powers.filter(id => !cardsById[id]));
}

// ---- replica of game.js bootDuelsEncounter: full boot for a real fight
function bootDuelsRun(run) {
	const hero = Du.HEROES.find(h => h.id === run.heroId);
	const boss = Du.BOSSES[run.bossId];
	const clsPick = { id: hero.heroClass, name: hero.heroClass, power: null };
	const bossPick = { id: run.bossId, name: boss.name, power: boss.power };
	const state = E.createGame(cardsById, seededRng(run.level * 13 + 1), [...run.deck], 2, [clsPick, bossPick]);
	if (run.powerId && cardsById[run.powerId]) {
		const pw = E.instantiate(cardsById[run.powerId], 0);
		pw.zone = 'heropower'; pw.usedThisTurn = false;
		state.players[0].heroPowers = [pw];
	}
	const runHP = 15 + (run.level - 1) * 5;
	E.applyHeroMods(state, 1, { life: boss.health, maxLife: boss.health });
	E.applyHeroMods(state, 0, { life: runHP, maxLife: runHP });
	E.resetDeckAndHand(state, 1, Du.buildBossDeck(cardsById, boss.theme));
	E.drawCards(state, 1, 4);
	E.stripLoadouts(state);
	for (const id of run.passives) Du.applyPassive(state, 0, id);
	return { state, runHP, boss };
}

// boot & play a couple of turns for every hero across: fight 1 (fresh), a mid
// fight with a chosen alt power + passives, and the Uber Diablo final
const rng = seededRng(11);
const somePassives = ['band_of_bees', 'rhonins_scrying_orb'];
for (const hero of Du.HEROES) {
	const altPower = (Du.HERO_POWERS[hero.heroClass] || [])[0] || null;
	const scenarios = [
		{ level: 1, bossId: duelsBossFor(1, rng), powerId: null, passives: [] },
		{ level: 5, bossId: duelsBossFor(5, rng), powerId: altPower, passives: somePassives },
		{ level: 12, bossId: 'uber_diablo', powerId: altPower, passives: somePassives },
	];
	for (const sc of scenarios) {
		const run = { heroId: hero.id, deck: [...D.STARTER_DECKS[hero.heroClass]], ...sc };
		try {
			const { state, runHP, boss } = bootDuelsRun(run);
			if (state.players[0].maxLife !== runHP || state.players[1].maxLife !== boss.health) {
				fail++; console.log('FAIL hp:', hero.id, sc.level, state.players[0].maxLife, state.players[1].maxLife); continue;
			}
			if (sc.powerId && state.players[0].heroPowers[0]?.id !== sc.powerId) {
				fail++; console.log('FAIL power swap:', hero.id, sc.powerId); continue;
			}
			// the boss fires its power, then a couple of turns pass; state stays legal
			const pw = state.players[1].heroPowers[0];
			state.current = 1;
			if (pw) E.useHeroPower(state, 1, pw.uid, null);
			state.current = 0;
			E.endTurn(state); E.endTurn(state);
			const errs = validateGameState(state);
			if (errs.length) { fail++; console.log('FAIL validate:', hero.id, sc.level, errs.slice(0, 2)); continue; }
			pass++;
		} catch (err) { fail++; console.log('FAIL boot:', hero.id, sc.level, String(err).slice(0, 140)); }
	}
}

// the between-fight treasure reward pool exists (active DUELS treasures)
const treasurePool = Object.values(cardsById).filter(d => d.treasure && d.set === 'DUELS');
ok('DUELS treasure reward pool is populated (>= 30)', treasurePool.length >= 30, treasurePool.length);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
