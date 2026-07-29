// tombs_run_test.mjs — the ?tombs=1 run scaffolding (game.js data layer). The
// overlays are DOM-bound, but the boss ladder, boot surgery, power swap, and
// passive/reward wiring are plain data — replicated here and exercised against
// a real game.
import fs from 'fs';
import * as E from '../../engine.js';
import * as T from '../../tombs.js';
import * as D from '../../dungeon.js';
import { validateGameState } from '../../engine/validate.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// ---- replica of game.js tombsBossFor (deterministic band roll, level 8 = final)
function tombsBossFor(chapterId, level, rng) {
	const chapter = T.CHAPTERS.find(c => c.id === chapterId);
	if (!chapter) return T.CHAPTERS[0].final;
	if (level >= 8) return chapter.final;
	const pool = [...chapter.pool].sort((a, b) => T.BOSSES[a].health - T.BOSSES[b].health);
	const start = Math.min(pool.length - 3, Math.floor((level - 1) / 7 * (pool.length - 3) + 0.5));
	const band = pool.slice(Math.max(0, start), Math.max(0, start) + 3);
	return band[Math.floor(rng() * band.length)];
}

// every chapter's ladder resolves to real bosses; fight 8 is the Plague Lord
const rng = seededRng(7);
for (const chapter of T.CHAPTERS) {
	let ladderOk = true, finalOk = true;
	for (let lvl = 1; lvl <= 8; lvl++) {
		const bid = tombsBossFor(chapter.id, lvl, rng);
		if (!T.BOSSES[bid]) ladderOk = false;
		if (lvl === 8 && !(bid === chapter.final && T.BOSSES[bid].plagueLord)) finalOk = false;
		if (lvl < 8 && bid === chapter.final) finalOk = false; // final never rolls early
	}
	ok(`${chapter.id}: every ladder fight resolves`, ladderOk);
	ok(`${chapter.id}: fight 8 is the Plague Lord, never earlier`, finalOk);
}

// each Explorer has a starter deck, bucket set, and 3 resolvable alt powers
for (const explorer of T.EXPLORERS) {
	ok(`${explorer.id}: starter deck present`, (D.STARTER_DECKS[explorer.heroClass] || []).length >= 10);
	ok(`${explorer.id}: bucket set present`, (D.BUCKETS[explorer.heroClass] || []).length >= 3);
	const powers = T.EXPLORER_POWERS[explorer.heroClass] || [];
	ok(`${explorer.id}: 3 alt powers, all heropower cards`, powers.length === 3
		&& powers.every(id => cardsById[id] && cardsById[id].type === 'heropower' && cardsById[id].power));
}

// ---- replica of game.js bootTombsEncounter: full boot for a real fight
function bootTombsRun(run) {
	const explorer = T.EXPLORERS.find(h => h.id === run.explorerId);
	const boss = T.BOSSES[run.bossId];
	const clsPick = { id: explorer.heroClass, name: explorer.heroClass, power: null };
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
	E.resetDeckAndHand(state, 1, T.buildBossDeck(cardsById, boss.theme));
	E.drawCards(state, 1, 4);
	E.stripLoadouts(state);
	for (const id of run.passives) T.applyPassive(state, 0, id);
	return { state, runHP, boss };
}

// boot & play a couple of turns for: fight 1 (fresh), a mid fight with a chosen
// alt power + passives, and the Plague Lord final — for every chapter+explorer pair
const CHOSEN_POWER = { mage: 'ulda_relicologist', druid: 'ulda_starseeker', hunter: 'ulda_dino_tracking', paladin: 'ulda_power_up' };
for (const chapter of T.CHAPTERS) {
	for (const explorer of T.EXPLORERS) {
		const passives = ['mummy_magic', 'band_of_scarabs'];
		const scenarios = [
			{ level: 1, bossId: tombsBossFor(chapter.id, 1, rng), powerId: null, passives: [] },
			{ level: 4, bossId: tombsBossFor(chapter.id, 4, rng), powerId: CHOSEN_POWER[explorer.heroClass], passives },
			{ level: 8, bossId: chapter.final, powerId: CHOSEN_POWER[explorer.heroClass], passives },
		];
		for (const sc of scenarios) {
			const run = { explorerId: explorer.id, chapter: chapter.id, deck: [...D.STARTER_DECKS[explorer.heroClass]], ...sc };
			try {
				const { state, runHP, boss } = bootTombsRun(run);
				// player scaling & boss surgery landed
				if (state.players[0].maxLife !== runHP || state.players[1].maxLife !== boss.health) {
					fail++; console.log('FAIL hp:', chapter.id, explorer.id, sc.level, state.players[0].maxLife, state.players[1].maxLife); continue;
				}
				// chosen alt power replaced the class slot
				if (sc.powerId && state.players[0].heroPowers[0]?.id !== sc.powerId) {
					fail++; console.log('FAIL power swap:', chapter.id, explorer.id, sc.powerId); continue;
				}
				const pw = state.players[1].heroPowers[0];
				state.current = 1;
				E.useHeroPower(state, 1, pw.uid, null);
				state.current = 0;
				E.endTurn(state); E.endTurn(state);
				const errs = validateGameState(state);
				if (errs.length) { fail++; console.log('FAIL validate:', chapter.id, explorer.id, sc.level, errs.slice(0, 2)); continue; }
				pass++;
			} catch (err) { fail++; console.log('FAIL boot:', chapter.id, explorer.id, sc.level, String(err).slice(0, 140)); }
		}
	}
}

// passive display cards & the treasure reward pool exist (the between-fight boons)
ok('all 16 passives have tomb_ display cards', Object.keys(T.PASSIVES).every(k => cardsById['tomb_' + k]));
const treasurePool = Object.values(cardsById).filter(d => d.treasure && d.set === 'TOMBS_OF_TERROR');
ok('treasure reward pool is populated (>= 40)', treasurePool.length >= 40, treasurePool.length);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
