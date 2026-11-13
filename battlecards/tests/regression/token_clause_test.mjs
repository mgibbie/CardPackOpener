// token_clause_test.mjs — a token's rules must not be its NAME.
//
// Reported (instinctgauntlet, 2026-11-13, Lorequest Sword Coast):
//   bug:1794568450581  "BEEEES!!! skips target selection and forced attacks": no target step, four 1/1 tokens named
//                      "Bees that attack it", nothing attacks.
//   bug:1794570464191  "Al'ar egg never resurrects Al'ar on the next turn": a 0/3 token named "Ashes of Al'ar that
//                      resurrects this creature on your next turn" that never does.
//
// Both shipped as a plain `summon` with the whole clause in the token's name (the Emergency Surgery fault). So did
// TREEEES!!! and eight cards whose tokens "attack random enemies" / "a random enemy" / "the lowest Health enemy".
//
//   node battlecards/tests/regression/token_clause_test.mjs
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._wall = { id: '_wall', name: 'Wall', type: 'creature', cost: 2, attack: 0, health: 40, rarity: 'common' };
byId._thin = { id: '_thin', name: 'Thin', type: 'creature', cost: 1, attack: 0, health: 9, rarity: 'common' };
byId._brute = { id: '_brute', name: 'Brute', type: 'creature', cost: 5, attack: 9, health: 9, rarity: 'common' };

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l + (x != null ? '  ' + x : '')); } };

const ME = 0, FOE = 1;
function game(seed = 5) {
	const st = E.createGame(byId, seededRng(seed), null, 2,
		[{ id: 'mage', name: 'You', power: null }, { id: 'mage', name: 'Foe', power: null }]);
	st.current = ME; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana = { cur: 10, max: 10, bonus: 0 }; }
	return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); return c; };
const live = (st, pi, name) => st.players[pi].board.filter(c => c.name === name && !E.isDead(c));
const dealt = (st, walls, life0) => walls.reduce((a, w) => a + (w.maxHealth - E.hp(w)), 0) + (life0 - st.players[FOE].life);

// ---------- BEEEES!!! and TREEEES!!!: choose a creature, the tokens attack it ----------
for (const [id, name, n, atk] of [['beeees', 'Bee', 4, 1], ['treeees', 'Treant', 4, 2]]) {
	const st = game();
	const wall = put(st, FOE, '_wall');
	const spec = E.targetSpec(st, ME, E.instantiate(byId[id], ME));
	ok(`${id}: the spell asks you to choose a creature`, !!(spec && spec.required), JSON.stringify(spec));
	const life0 = st.players[FOE].life;
	E.execEffects(st, ME, byId[id].effects, { type: 'creature', uid: wall.uid, player: FOE }, null);
	const toks = live(st, ME, name);
	ok(`${id}: ${n} tokens named "${name}"`, toks.length === n, st.players[ME].board.map(c => c.name).join(','));
	ok(`${id}: they attacked the chosen creature (${n * atk} damage)`, E.hp(wall) === 40 - n * atk && st.players[FOE].life === life0, 'hp ' + E.hp(wall));
}

// ---------- Al'ar: the egg brings it back at the start of your next turn ----------
{
	const st = game();
	const alar = put(st, ME, 'al_ar');
	const brute = put(st, FOE, '_brute');
	E.resolveCombat(st, ME, alar.uid, { type: 'creature', uid: brute.uid, player: FOE });
	E.sweepDeaths(st);
	const egg = live(st, ME, "Ashes of Al'ar")[0];
	ok("Al'ar dies and leaves a 0/3 named \"Ashes of Al'ar\"", !!egg && egg.attack === 0 && egg.maxHealth === 3 && live(st, ME, "Al'ar").length === 0, st.players[ME].board.map(c => c.name).join(' | '));
	ok('the egg says what it does', /start of your turn/i.test((egg || {}).description || ''), (egg || {}).description);
	E.endTurn(st);                                   // my turn ends: the foe's turn starts
	ok("not on the opponent's turn", st.current === FOE && live(st, ME, "Al'ar").length === 0 && live(st, ME, "Ashes of Al'ar").length === 1, 'current ' + st.current);
	E.endTurn(st);                                   // my next turn starts
	const back = live(st, ME, "Al'ar")[0];
	ok("at the start of your next turn the egg becomes Al'ar (7/3)", st.current === ME && !!back && back.attack === 7 && E.hp(back) === 3 && live(st, ME, "Ashes of Al'ar").length === 0, st.players[ME].board.map(c => c.name).join(' | '));
	ok("and it is Al'ar in full: it will leave an egg again", !!back && E.has(back, 'deathrattle') && back.id === 'al_ar', back && back.id);
}
{	// the egg destroyed first: no Al'ar
	const st = game();
	const alar = put(st, ME, 'al_ar');
	const brute = put(st, FOE, '_brute');
	E.resolveCombat(st, ME, alar.uid, { type: 'creature', uid: brute.uid, player: FOE });
	E.sweepDeaths(st);
	const egg = live(st, ME, "Ashes of Al'ar")[0];
	if (egg) { egg.damage = 99; E.sweepDeaths(st); }
	E.endTurn(st); E.endTurn(st);
	ok("an egg that was destroyed brings nothing back", live(st, ME, "Al'ar").length === 0 && live(st, ME, "Ashes of Al'ar").length === 0, st.players[ME].board.map(c => c.name).join(' | '));
}

// ---------- "... tokens that attack random enemies" ----------
const effOf = (id) => { const c = byId[id]; return c.effects || c.deathrattle || (c.ongoing && c.ongoing.effects); };
for (const [id, name, n, atk] of [['nagrand_slam', 'Clefthoof', 4, 3], ['ghouls_night', 'Ghoul', 5, 1], ['carrier', 'Interceptor', 4, 4], ['troublemaker', 'Ruffian', 2, 3],
	['temporal_traveler', 'Shadow', 1, 4], ['watercannon', 'Pirate', 1, 1], ['infiltrator_lilian', 'Forsaken Lilian', 1, 4]]) {
	const st = game();
	const walls = [put(st, FOE, '_wall'), put(st, FOE, '_wall')];
	const life0 = st.players[FOE].life;
	E.execEffects(st, ME, effOf(id), null, null);
	const toks = live(st, ME, name);
	ok(`${id}: ${n} "${name}", and each attacked an enemy (${n * atk} damage)`, toks.length === n && dealt(st, walls, life0) === n * atk, `${st.players[ME].board.map(c => c.name).join(',')} dealt ${dealt(st, walls, life0)}`);
}
{	// Extraterrestrial Egg: the lowest Health enemy, every time
	let all = true;
	for (let seed = 1; seed <= 12; seed++) {
		const st = game(seed);
		put(st, FOE, '_wall'); const thin = put(st, FOE, '_thin'); put(st, FOE, '_wall');
		E.execEffects(st, ME, effOf('extraterrestrial_egg'), null, null);
		if (E.hp(thin) !== 9 - 3 || live(st, ME, 'Beast').length !== 1) all = false;
	}
	ok('extraterrestrial_egg: its 3/5 Beast attacks the enemy with the least Health (12 seeds)', all);
}
{	// a full board: no throw, no attack from a token that never arrived
	const st = game();
	for (let i = 0; i < 12; i++) put(st, ME, '_wall');
	const before = st.players[ME].board.length;
	const w = put(st, FOE, '_wall');
	let threw = null; try { E.execEffects(st, ME, effOf('ghouls_night'), null, null); } catch (e) { threw = e; }
	ok('a full board: nothing breaks', !threw && E.hp(w) >= 40 - 5 && st.players[ME].board.length >= before, threw && threw.message);
}

// ---------- and no card is left with a clause for a token's name ----------
{
	const bad = [];
	const walk = (o, c) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) { o.forEach(x => walk(x, c)); return; } if (typeof o.type === 'string' && /^summon/.test(o.type) && typeof o.name === 'string' && / that (attacks?|resurrects?) /i.test(o.name)) bad.push(c.id + ': ' + o.name); for (const k in o) walk(o[k], c); };
	for (const c of raw.cards) walk(c, c);
	ok('no token is named "... that attack(s) ..." or "... that resurrects ..."', bad.length === 0, bad.join(' ; '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
