// Bug review 2026-10-27 (c) — Battlecards tester reports (instinctgauntlet, Multiverse).
// All three were filed AFTER #826 (11:02Z) and #828 (12:31Z) went live: the sweeps missed them.
//   1 Germination         "Create a token that's a copy of a creature you control" paid 4 and made
//                          nothing. Replay d245a649 (Doctor Doom, turn 15): fired on the exact board it
//                          works on Pixie / Fiend Hunter / Skyrider but NOT on Thor's Wolf tokens — every
//                          copy handler looked the target up in cards.json, and a token has no entry.
//                          Same blind spot: Ini Stormcoil, Unsleeping Soul, Vivid Nightmare, Hallucination,
//                          Schism, Psyche Split, Reverberations, Criminal Lineup, Shattered Reflections,
//                          Wreck'em and Deck'em, Sensory Deprivation, Acquired Allies (bounce still happens).
//   2 Shadow Word: Void   "Destroy a creature & create 0/2 Voidfiends" had no target at all (a Duels
//                          treasure, so the collectible-only guard skipped it). Same: Holy Book.
//   3 Mysterio's Mirage   "freeze a random enemy creature" froze the whole row (enemy-creatures).
//                          Same: Kang's (mv_e_kang_9). The #828 singular-freeze check only read
//                          effects/tapAbility and never "a random" — an `ongoing` slipped past.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

console.warn = () => {};

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._bear = { id: '_bear', name: 'Bear', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common' };
byId._mech = { id: '_mech', name: 'Bot', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Mech' };
byId._six = { id: '_six', name: 'Chieftain', type: 'creature', cost: 6, attack: 6, health: 6, rarity: 'common' };
byId._wall = { id: '_wall', name: 'Wall', type: 'creature', cost: 9, attack: 0, health: 60, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', l, x ?? ''); } };
const block = (name, fn) => { try { fn(); } catch (e) { fail++; console.log('FAIL', name, 'threw:', e.message); } };

function fresh(seed = 1027) {
	const st = E.createGame(byId, seededRng(seed), null, 2, [{ id: 'shaman', name: 'Thor', power: null }, { id: 'mage', name: 'Mysterio', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.board = []; p.artifacts = []; p.enchantments = []; p.secrets = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; p.life = 30; p.armor = 0; p.corpses = 10; p.deck = Array(30).fill('_bear'); }
	return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
// a TOKEN made the way the game makes one (Thor's "Summon two 3/3 Wolves"): no cards.json entry
const wolf = (st, pi) => { const c = E.summon(st, pi, { id: 'token_wolf', name: 'Wolf', type: 'creature', cost: 0, rarity: 'common', token: true, attack: 3, health: 3, description: 'A 3/3 Wolf.' }); c.sick = false; return c; };
const give = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const tc = c => ({ type: 'creature', uid: c.uid, player: c.controller });
const live = (st, pi) => st.players[pi].board.filter(c => !E.isDead(c));
const cast = (st, pi, id, t) => {
	const c = give(st, pi, id);
	const spec = E.targetSpec(st, pi, c);
	const legal = spec ? E.legalTargets(st, pi, spec) : [];
	const mana = st.players[pi].mana.cur;
	const r = E.playCard(st, pi, c.uid, t ? tc(t) : null, null, null);
	E.sweepDeaths(st);
	return { spec, legal, r, paid: mana - st.players[pi].mana.cur };
};

// ---------- 1) Germination copies a creature you control — a token included ----------
block('Germination', () => {
	ok('cards.json still prints Germination as a 4-mana sorcery', byId.germination.cost === 4 && byId.germination.type === 'sorcery');
	// the reported board: Daydreaming Pixie, Fiend Hunter, two Wolf tokens, Valkyrior Skyrider
	const st = fresh();
	const pixie = put(st, 0, 'daydreaming_pixie'), fh = put(st, 0, 'fiend_hunter'), w1 = wolf(st, 0), w2 = wolf(st, 0), sky = put(st, 0, 'mv_thor_2');
	const g = give(st, 0, 'germination');
	const spec = E.targetSpec(st, 0, g);
	const legal = spec ? E.legalTargets(st, 0, spec).map(t => t.uid) : [];
	ok('Germination asks for a friendly creature, the Wolf tokens included', spec && spec.required && [pixie, fh, w1, w2, sky].every(c => legal.includes(c.uid)), legal);
	E.playCard(st, 0, g.uid, tc(w1), null, null);
	const copies = live(st, 0).filter(c => c.name === 'Wolf' && c !== w1 && c !== w2);
	ok('...on a Wolf token: a 3/3 Wolf copy appears (report: 4 mana, no copy)', copies.length === 1 && copies[0].attack === 3 && copies[0].maxHealth === 3, live(st, 0).map(c => c.name));
	ok('...the copy has Taunt and is itself a token', copies[0] && copies[0].keywords.includes('taunt') && copies[0].token === true, copies[0] && copies[0].keywords);
	ok('...the original Wolf is untouched (no Taunt leaks onto it)', !w1.keywords.includes('taunt'));
	const st2 = fresh(); const s2 = put(st2, 0, 'mv_thor_2');
	cast(st2, 0, 'germination', s2);
	ok('...on a real card (Valkyrior Skyrider): a Taunt copy too', live(st2, 0).filter(c => c.id === 'mv_thor_2').length === 2 && live(st2, 0).some(c => c !== s2 && c.keywords.includes('taunt')));
	const st3 = fresh(); const g3 = give(st3, 0, 'germination');
	ok('...with no creature of yours it cannot be played (never a silent 4-mana fizzle)', !E.canPlay(st3, 0, g3));
});

// ---------- 1b) the rest of the "copy of it" class on a token ----------
block('copy of a token', () => {
	const spells = [
		['ini_stormcoil', '_mech', 1], ['unsleeping_soul', null, 1], ['vivid_nightmare', null, 1], ['hallucination', null, 1],
		['schism', null, 1], ['psyche_split', null, 1], ['reverberations', null, 1], ['lesser_sapphire_spellstone', null, 1],
		['azsharan_ritual', null, 1], ['criminal_lineup', null, 3], ['shattered_reflections', null, 1],
	];
	for (const [id, , n] of spells) {
		const st = fresh(); const w = wolf(st, 0);
		if (id === 'ini_stormcoil') { w.tribe = 'Mech'; }
		const before = live(st, 0).filter(c => c.name === 'Wolf').length;
		const c = give(st, 0, id);
		E.playCard(st, 0, c.uid, tc(w), null, null); E.sweepDeaths(st);
		const after = live(st, 0).filter(c => c.name === 'Wolf').length;
		ok(`${byId[id].name}: copies a Wolf token onto the battlefield`, after - before >= n, `${before} -> ${after}`);
	}
	{ // Shattered Reflections: the hand copy too (a deck holds card ids, so a token has none to shuffle in)
		const st = fresh(); const w = wolf(st, 0);
		cast(st, 0, 'shattered_reflections', w);
		ok('Shattered Reflections: the hand copy of a token arrives too', st.players[0].hand.some(c => c.name === 'Wolf'));
	}
	{ // Wreck'em and Deck'em: a copy of a Mech token attacks
		const st = fresh(); const m = wolf(st, 0); m.tribe = 'Mech'; const foe = put(st, 1, '_wall');
		cast(st, 0, 'wreckem_and_deckem', m);
		ok("Wreck'em and Deck'em: a Mech token's copy attacks a random enemy", foe.damage === 3 || st.players[1].life === 27, `${foe.damage} ${st.players[1].life}`);
	}
	{ // Acquired Allies: the token still bounces (and simply has no card to shuffle in)
		const st = fresh(); const w = wolf(st, 1);
		cast(st, 0, 'duels_acquired_allies', w);
		ok('Acquired Allies: a token target still leaves the battlefield', !live(st, 1).includes(w));
	}
});

// ---------- 2) Shadow Word: Void / Holy Book ask for their creature ----------
block('Shadow Word: Void', () => {
	const st = fresh(); st.current = 0;
	const big = put(st, 1, '_six'), small = put(st, 1, 'wisp');
	const { spec, legal, paid } = cast(st, 0, 'duels_shadow_word_void', big);
	ok('Shadow Word: Void asks for a creature (report: no prompt, 4 mana gone)', !!spec && spec.required && legal.some(t => t.uid === big.uid) && legal.some(t => t.uid === small.uid), JSON.stringify(spec));
	ok('...destroys it', E.isDead(big) || !st.players[1].board.includes(big));
	const fiends = live(st, 0).filter(c => c.name === 'Voidfiend');
	ok('...and creates Voidfiends equal to half its Health, rounded up (6 -> 3), each 0/2', fiends.length === 3 && fiends.every(c => c.attack === 0 && c.maxHealth === 2), fiends.map(c => `${c.attack}/${c.maxHealth}`));
	ok('...for its 4 mana', paid === 4, paid);
	const st2 = fresh(); const odd = put(st2, 1, 'mv_thor_2'); // 4/3: half of 3 rounds up to 2
	cast(st2, 0, 'duels_shadow_word_void', odd);
	ok('...a 3-Health creature: 2 Voidfiends', live(st2, 0).filter(c => c.name === 'Voidfiend').length === 2);
	const st3 = fresh(); const sv = give(st3, 0, 'duels_shadow_word_void');
	ok('...with no creature anywhere it cannot be played', !E.canPlay(st3, 0, sv));
});
block('Holy Book', () => {
	const st = fresh(); const t = put(st, 1, '_six');
	const { spec } = cast(st, 0, 'duels_holy_book', t);
	ok('Holy Book asks for a creature (same untargeted blind spot)', !!spec && spec.required, JSON.stringify(spec));
	ok('...destroys it and creates a 10/10 copy for you', !live(st, 1).includes(t) && live(st, 0).some(c => c.id === '_six' && c.attack === 10 && c.maxHealth === 10), live(st, 0).map(c => `${c.id} ${c.attack}/${c.maxHealth}`));
});

// ---------- 3) "At the start of your turn, freeze a random enemy creature" freezes ONE ----------
for (const id of ['mv_e_mysterio_9', 'mv_e_kang_9']) block(id, () => {
	const st = fresh(); st.current = 0;
	const ench = E.instantiate(byId[id], 1); ench.zone = 'enchantment'; st.players[1].enchantments.push(ench);
	const mine = [put(st, 0, 'mv_thor_2'), put(st, 0, '_wall'), put(st, 0, '_bear')];
	E.endTurn(st); // the enchantment's controller's turn starts
	ok(`${byId[id].name}: its controller's turn has started`, st.current === 1, st.current);
	const frozen = mine.filter(c => c.frozen);
	ok(`${byId[id].name}: freezes exactly ONE enemy creature (report: the whole board)`, frozen.length === 1, mine.map(c => c.frozen));
	E.endTurn(st); E.endTurn(st);
	ok(`${byId[id].name}: next trigger, still one more at most`, mine.filter(c => c.frozen && c.frozen >= st.turnNumber - 1).length <= 1, mine.map(c => c.frozen));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
