// heist_boss_powers_fire_test.mjs — tester bug (instinctgauntlet, 2026-11-12, blocker): in a Dalaran Heist, Ungan
// Oddkind's hero power "Summon Companion" threw (TypeError: reading 'toLowerCase' in the summon handler) and the boss's
// turn never ended. Its three options named cards by id (huffer / leokk / misha) that do not exist: the companions are
// inline tokens everywhere else. heist_bosses_test.mjs "fires" every boss's power, but with no mana, so nothing ran.
//   * Ungan's power, paid for, over many seeds: a Huffer, a Leokk or a Misha arrives each time, all three over the seeds,
//     with the companion's own numbers (Huffer 4/2 Charge, Leokk 2/4 and your others +1 Attack, Misha 4/4 Taunt)
//   * EVERY Heist and Tombs boss's power, paid for, resolves without throwing, on several seeds
//   * every summonId in the game's data names a real card; and a summon whose id is unknown and has no token to fall
//     back on does nothing rather than throw
//   * the second layer: an AI action that throws no longer strands its turn (game.js ends the turn and still reports
//     the error); after such a throw the engine can end the turn and the game is whole
import fs from 'fs';
import * as E from '../../engine.js';
import * as H from '../../heist.js';
import * as T from '../../tombs.js';
import { validateGameState } from '../../engine/validate.js';
import { seededRng } from '../../engine/rng.js';
import { gameSource } from '../helpers/gamesource.mjs';   // game.js + the modules split out of it

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l, extra ?? ''); } };

/** A game against a boss, the boss to act, with mana for its power. */
function boot(bid, boss, seed) {
	const picks = [{ id: 'mage', name: 'Mage', power: { name: 'Bolt', cost: 2, effects: [{ type: 'damage', value: 2, target: 'enemy-heroes' }], text: '' } }, { id: bid, name: boss.name, power: boss.power }];
	const state = E.createGame(cardsById, seededRng(seed), null, 2, picks);
	state.players[1].life = boss.health;
	state.players[1].mana = { ...state.players[1].mana, cur: 10, max: 10 };
	state.current = 1;
	return state;
}
const fire = (state) => { const pw = state.players[1].heroPowers[0]; return E.useHeroPower(state, 1, pw.uid, null); };

// ---- Ungan Oddkind
{
	const seen = {}, bad = [];
	for (let seed = 1; seed <= 40; seed++) {
		const state = boot('ungan_oddkind', H.BOSSES.ungan_oddkind, seed), n0 = state.players[1].board.length;
		let err = null; try { fire(state); } catch (e) { err = e; }
		const c = state.players[1].board[state.players[1].board.length - 1];
		if (err || state.players[1].board.length !== n0 + 1 || !c) { bad.push(`seed ${seed}: ${err ? String(err).slice(0, 90) : 'nothing arrived'}`); continue; }
		seen[c.name] = { attack: c.attack, health: c.maxHealth, kw: (c.keywords || []).join(), aura: !!c.aura };
		const errs = validateGameState(state); if (errs.length) bad.push(`seed ${seed}: ${errs[0]}`);
	}
	ok('Ungan Oddkind\'s Summon Companion, paid for: a companion arrives every time (40 seeds), and nothing throws', bad.length === 0, bad.slice(0, 3));
	ok('all three come up: Huffer, Leokk and Misha', Object.keys(seen).sort().join() === 'Huffer,Leokk,Misha', Object.keys(seen));
	ok('with their own numbers: Huffer 4/2 Charge, Leokk 2/4 (your others +1 Attack), Misha 4/4 Taunt',
		seen.Huffer && seen.Huffer.attack === 4 && seen.Huffer.health === 2 && /charge/.test(seen.Huffer.kw) && seen.Leokk && seen.Leokk.attack === 2 && seen.Leokk.health === 4 && seen.Leokk.aura && seen.Misha && seen.Misha.attack === 4 && seen.Misha.health === 4 && /taunt/.test(seen.Misha.kw), seen);
	// the boss's turn goes on afterwards
	const state = boot('ungan_oddkind', H.BOSSES.ungan_oddkind, 7); fire(state);
	let threw = null; try { E.endTurn(state); E.endTurn(state); } catch (e) { threw = e; }
	ok('…and the turn can end afterwards', !threw && validateGameState(state).length === 0, threw && String(threw));
}

// ---- every boss's power, paid for
for (const [what, BOSSES] of [['Heist', H.BOSSES], ['Tombs', T.BOSSES || {}]]) {
	const bad = []; let n = 0;
	for (const [bid, boss] of Object.entries(BOSSES)) {
		if (!boss.power) continue;
		n++;
		for (const seed of [3, 11, 42]) {
			try { const state = boot(bid, boss, seed); fire(state); const errs = validateGameState(state); if (errs.length) bad.push(`${bid} (seed ${seed}): ${errs[0]}`); }
			catch (e) { bad.push(`${bid} (seed ${seed}): ${String(e).slice(0, 110)}`); }
		}
	}
	ok(`every ${what} boss's hero power (${n}), paid for, resolves without throwing (3 seeds each)`, n > 0 && bad.length === 0, bad.slice(0, 6));
}

// ---- the data: every summonId names a card
{
	const dir = new URL('../../', import.meta.url), dangling = [];
	for (const f of fs.readdirSync(dir).filter((x) => /\.(js|json)$/.test(x))) {
		const s = fs.readFileSync(new URL(f, dir), 'utf8'), re = /summonId["']?\s*:\s*["']([A-Za-z0-9_\-]+)["']/g; let m;
		while ((m = re.exec(s))) if (!cardsById[m[1]]) dangling.push(f + ': ' + m[1]);
	}
	ok('every summonId in the game\'s data names a real card', dangling.length === 0, [...new Set(dangling)]);
	// …and one that does not (a future typo) is a no-op, never a crash that strands a turn
	const state = boot('ungan_oddkind', { ...H.BOSSES.ungan_oddkind, power: { name: 'Typo', cost: 1, text: '', effects: [{ type: 'summon', count: 1, options: [{ summonId: 'no_such_card_id' }] }] } }, 5), n0 = state.players[1].board.length;
	let threw = null; try { fire(state); } catch (e) { threw = e; }
	ok('a summon whose id is unknown, with no token to fall back on, does nothing (no throw)', !threw && state.players[1].board.length === n0, threw && String(threw).slice(0, 120));
}

// ---- the second layer: a throw in an AI's action does not strand the turn
{
	const gm = gameSource();
	const has = (x) => gm.includes(x);
	ok('game.js catches an AI action that throws, ends that turn, and still throws the error on for the error report',
		has('try { acted = AI.step(GS.state, seat); }') && has('setTimeout(() => { throw err; }, 0); }') && gm.indexOf('if (!acted) E.endTurn(GS.state);') > gm.indexOf('try { acted = AI.step(GS.state, seat); }') && !has('const acted = AI.step(GS.state, seat);'));
	// the engine's side of it: a power whose effect throws half-way; afterwards the turn can end and the state is whole
	const boom = { name: 'Boom', cost: 1, text: '', effects: [{ type: 'summon', count: 1, options: [{ get name() { throw new Error('a handler bug'); } }] }] };
	const state = boot('ungan_oddkind', { ...H.BOSSES.ungan_oddkind, power: boom }, 9);
	let threw = null; try { fire(state); } catch (e) { threw = e; }
	let after = null; try { E.endTurn(state); } catch (e) { after = e; }
	ok('after an action that threw, the engine ends the turn (the other player is to act) and the state is whole', !!threw && !after && state.current === 0 && validateGameState(state).length === 0, [threw && String(threw), after && String(after), state.current, validateGameState(state).slice(0, 2)]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
