// pocketenhanced_engine_test.mjs — Pocket Enhanced's rules engine (pocketenhanced/js/engine/), its card data and its
// computer player, against the owner's plan (Plans/POCKET_ENHANCED_PLAN.md §16) and pocketenhanced/RULES.md.
//   * the two type systems: 18 Combat Types, +20 / -20 / 0, no immunity, no multiplier, two types add
//   * damage through the engine: effectiveness, floors, Bench hits, reductions, boosts, prevention
//   * Execute: both commands validated first, resolved A then B, a pass, no redirect when the target is gone
//   * 2, 3 and 4 players: turn order, aiming at any opponent, points to the attacker, elimination, the win and ties
//   * the cards: evolution, retreat, Energy, Trainers, Abilities, Special Conditions, promotion, deck rules
//   * the data: every Genetic Apex card, its printed text kept, its Combat Types real, its file up to date
//   * a game is its seed and its actions: the same seed replays to the same position; a view never shows a hand
//   * computer players finish 2-, 3- and 4-player matches through the same actions, with every card accounted for
// Not covered: "the queued attacker is gone before its turn to resolve" has no card in Genetic Apex that can cause it
// (the engine's guard for it is the same one as for a missing target, which is tested).
//   node overworld/tests/pocketenhanced_engine_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import * as E from '../../pocketenhanced/js/engine/engine.js';
import * as T from '../../pocketenhanced/js/engine/types.js';
import { CARDS, card } from '../../pocketenhanced/js/data/cards.js';
import { nextAction, expectedDamage } from '../../pocketenhanced/js/ai.js';
import { STARTERS, starterDeck, starterErrors } from '../../pocketenhanced/js/decks.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const refused = (f) => { try { f(); return null; } catch (e) { if (e && e.refused) return e.message; throw e; } };
const id = name => { const c = CARDS.find(x => x.name === name); if (!c) throw new Error('no card ' + name); return c.id; };
const L = (seat, zone, idx) => ({ seat, zone, idx });

/** A match past its setup, at the first player's turn, with every player having taken a turn already (so nothing is
 *  blocked by "first turn"), and the boards empty for the test to fill. Seat 0 is to move. */
function arena(n = 2, seed = 'arena') {
	const S = E.createGame({ seed, players: Array.from({ length: n }, (_, i) => ({ name: 'P' + (i + 1), ...starterDeck(STARTERS[i].id) })) });
	for (const p of S.players) { const b = p.hand.findIndex(c => card(c).kind === 'pokemon' && card(c).stage === 0); E.apply(S, { t: 'setup', seat: p.seat, active: [b], bench: [] }); }
	for (const p of S.players) { p.turns = 1; p.active = [null, null]; p.bench = [null, null, null, null]; p.flags = {}; }
	S.order = S.players.map(p => p.seat); S.first = 0; S.current = 0; S.turn = 10;
	return S;
}
function put(S, seat, zone, idx, name, o = {}) { const k = E.makePoke(S, id(name)); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; }
const exec = (S, a, b) => E.apply(S, { t: 'execute', seat: S.current, commands: [a || null, b || null] });
const atk = (S, seat, slot, name) => card(S.players[seat].active[slot].cards.at(-1)).attacks.findIndex(x => x.name === name);
const logHas = (S, re) => S.log.some(e => re.test(e.msg));

// ===== 1. the type systems =====
A(T.COMBAT_TYPES.length === 18 && T.CARD_TYPES.length === 10 && T.ENERGY_TYPES.length === 8 && !T.ENERGY_TYPES.includes('Dragon') && !T.ENERGY_TYPES.includes('Colorless'), '18 Combat Types, 10 Card Types, 8 Energy types (no Dragon or Colorless Energy)');
{
	const vals = new Set(); for (const a of T.COMBAT_TYPES) for (const d of T.COMBAT_TYPES) vals.add(T.matchup(a, d));
	A([...vals].sort((x, y) => x - y).join() === '-20,0,20', 'every matchup is +20, -20 or 0: no multipliers');
	const ex = [['Fire', 'Grass', 20], ['Fire', 'Water', -20], ['Water', 'Fire', 20], ['Electric', 'Water', 20], ['Normal', 'Ghost', 0], ['Ground', 'Flying', 0], ['Fighting', 'Normal', 20], ['Ice', 'Dragon', 20], ['Dragon', 'Steel', -20], ['Fairy', 'Dragon', 20], ['Bug', 'Fairy', -20], ['Ghost', 'Ghost', 20]];
	A(ex.every(([a, d, v]) => T.matchup(a, d) === v), "the plan's examples and the mainline chart: Fire into Grass +20, into Water -20, Normal into Ghost 0, Ground into Flying 0…", ex.filter(([a, d, v]) => T.matchup(a, d) !== v));
	const imm = Object.entries(T.MAINLINE_IMMUNE).flatMap(([a, ds]) => ds.map(d => [a, d, T.matchup(a, d)]));
	A(imm.length === 8 && imm.every(x => x[2] === 0), 'all eight mainline immunities are neutral here (0), never a block', imm);
	// each type's count of super-effective and resisted targets, from the mainline chart
	const SE = { Normal: 0, Fire: 4, Water: 3, Electric: 2, Grass: 3, Ice: 4, Fighting: 5, Poison: 2, Ground: 5, Flying: 3, Psychic: 2, Bug: 3, Rock: 4, Ghost: 2, Dragon: 1, Dark: 2, Steel: 3, Fairy: 3 };
	const NV = { Normal: 2, Fire: 4, Water: 3, Electric: 3, Grass: 7, Ice: 4, Fighting: 5, Poison: 4, Ground: 2, Flying: 3, Psychic: 2, Bug: 7, Rock: 3, Ghost: 1, Dragon: 1, Dark: 3, Steel: 4, Fairy: 3 };
	const bad = T.COMBAT_TYPES.filter(a => T.COMBAT_TYPES.filter(d => T.matchup(a, d) === 20).length !== SE[a] || T.COMBAT_TYPES.filter(d => T.matchup(a, d) === -20).length !== NV[a]);
	A(bad.length === 0, 'all 18 attacking types have the mainline chart\'s number of strengths and resisted matchups', bad);
	const two = [['Electric', ['Water', 'Flying'], 40], ['Fire', ['Grass', 'Poison'], 20], ['Fighting', ['Normal', 'Flying'], 0], ['Ground', ['Fire', 'Flying'], 20], ['Grass', ['Fire', 'Flying'], -40]];
	A(two.every(([a, d, v]) => T.effectiveness(a, d).total === v), 'a two-type defender adds its two results: Electric into Water/Flying +40, Fighting into Normal/Flying 0, Ground into Fire/Flying +20', two.map(([a, d]) => T.effectiveness(a, d).total));
}

// ===== 2. the data =====
{
	const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'pocketenhanced/data/source/tcgdex_a1.json'), 'utf8')).cards;
	const a1 = CARDS.filter(c => c.set === 'A1'), pk = CARDS.filter(c => c.kind === 'pokemon');
	A(src.filter(c => c.id.startsWith('A1-')).length === 286 && a1.length === 225 && CARDS.length === 232 && src.every(c => card(c.id)), 'Genetic Apex: 286 printings are 225 different gameplay cards (alternate art shares one definition), plus 7 starter Trainers; every printing resolves', [a1.length, CARDS.length]);
	const badType = pk.filter(c => !T.CARD_TYPES.includes(c.cardType) || c.combatTypes.length < 1 || c.combatTypes.length > 2 || c.combatTypes.some(t => !T.COMBAT_TYPES.includes(t)));
	A(badType.length === 0, 'every Pokémon has a Card Type and one or two real Combat Types', badType.map(c => c.name).slice(0, 5));
	const ct = n => card(id(n));
	A(JSON.stringify([ct('Charizard ex').cardType, ct('Charizard ex').combatTypes, ct('Gengar ex').cardType, ct('Gengar ex').combatTypes, ct('Dragonite').cardType, ct('Dragonite').combatTypes, ct('Pidgeot').combatTypes, ct('Gyarados').combatTypes, ct('Pikachu ex').combatTypes])
		=== JSON.stringify(['Fire', ['Fire', 'Flying'], 'Psychic', ['Ghost', 'Poison'], 'Dragon', ['Dragon', 'Flying'], ['Normal', 'Flying'], ['Water', 'Flying'], ['Electric']]),
		"the plan's table: Charizard ex Fire card / Fire-Flying, Gengar ex Psychic card / Ghost-Poison, Dragonite Dragon card / Dragon-Flying, Pidgeot Normal-Flying…");
	const atks = pk.flatMap(c => c.attacks.map(a => [c, a]));
	A(atks.length > 200 && atks.every(([, a]) => T.COMBAT_TYPES.includes(a.combatType) && ['move', 'named', 'judgement'].includes(a.typeBasis)), `all ${atks.length} attacks have a Combat Type and say where it came from`);
	const byName = n => atks.find(([, a]) => a.name === n)[1];
	A(byName('Flamethrower').combatType === 'Fire' && byName('Thunderbolt').combatType === 'Electric' && byName('Hydro Pump').combatType === 'Water' && byName('Hyper Beam').combatType === 'Normal' && byName('Ice Beam').combatType === 'Ice' && byName('Vine Whip').typeBasis === 'move', 'an attack named for a mainline move has that move\'s type (Flamethrower Fire, Hyper Beam Normal, Ice Beam Ice)');
	const review = fs.readFileSync(path.join(ROOT, 'pocketenhanced/data/ATTACK_TYPE_REVIEW.md'), 'utf8');
	const judged = [...new Set(atks.filter(([, a]) => a.typeBasis === 'judgement').map(([, a]) => a.name))];
	A(judged.length >= 20 && judged.every(n => review.includes('| ' + n + ' |')), `the ${judged.length} judgement calls are all on the review list`);
	// the printed card is kept, and nothing about it differs from the source
	const diff = [];
	for (const s of src) {
		const c = card(s.id);
		if (s.category === 'Pokemon') {
			if (c.hp !== s.hp || c.retreat !== (s.retreat || 0) || c.evolvesFrom !== (s.evolveFrom || null) || c.cardType !== s.types[0] || c.weakness !== ((s.weaknesses || [])[0]?.type || null)) diff.push(s.id + ' stats');
			(s.attacks || []).forEach((a, i) => { const m = c.attacks[i]; if (!m || m.name !== a.name || m.text !== (a.effect || '') || m.cost.length !== (a.cost || []).length || String(a.damage ?? '').replace(/\D/g, '') !== (m.damage ? String(m.damage) : '')) diff.push(s.id + ' ' + a.name); });
			if ((s.abilities || [])[0] && c.ability.text !== s.abilities[0].effect) diff.push(s.id + ' ability');
		} else if (c.text !== s.effect) diff.push(s.id + ' text');
	}
	A(diff.length === 0, "every card's HP, costs, damage, evolution, Weakness and printed text are the source's, unchanged", diff.slice(0, 6));
	const noAdapt = [...atks.filter(([, a]) => a.text && (!a.adapted || !a.fx.length)).map(([c, a]) => c.name + ':' + a.name), ...CARDS.filter(c => (c.ability && !c.ability.adapted) || (c.kind !== 'pokemon' && !c.adapted)).map(c => c.name)];
	A(noAdapt.length === 0, 'every card with an effect has its structured effect and its adapted multiplayer text, beside the original', noAdapt.slice(0, 6));
	A(/Choose an opponent/.test(card(id('Red Card')).adapted) && /owner switches/.test(card(id('Sabrina')).adapted) && card(id('Sabrina')).text.startsWith("Switch out your opponent"), 'e.g. Red Card: "Choose an opponent…"; Sabrina: the owner chooses the replacement; the printed text is still there');
	let fresh = true; try { execFileSync(process.execPath, [path.join(ROOT, 'tools/gen_pocket_cards.mjs'), '--check'], { stdio: 'pipe' }); } catch { fresh = false; }
	A(fresh, 'the card file is what the generator makes from the source today');
	A(Object.isFrozen(CARDS[0]) && Object.isFrozen(CARDS[0].attacks || CARDS[0]) && starterErrors().length === 0 && STARTERS.length >= 8, 'card definitions are frozen; all 8 ready-made decks are legal', starterErrors());
}

// ===== 3. decks and the start of a match =====
{
	const d = starterDeck('charizard');
	A(E.deckError(d.deck, d.energy) === null && /20 cards/.test(E.deckError(d.deck.slice(1), d.energy)) && /no more than 2/.test(E.deckError([...d.deck.slice(1), d.deck[1]].map((x, i) => (i === 19 ? d.deck[0] : x)), d.energy) || E.deckError([d.deck[0], ...d.deck.slice(0, 19)], d.energy))
		&& /Basic/.test(E.deckError(Array(10).fill(0).flatMap((_, i) => [id(['Potion', 'Poké Ball', "Professor's Research", 'Giovanni', 'Sabrina', 'Erika', 'Misty', 'Blaine', 'Koga', 'Brock'][i]), id(['Potion', 'Poké Ball', "Professor's Research", 'Giovanni', 'Sabrina', 'Erika', 'Misty', 'Blaine', 'Koga', 'Brock'][i])]), ['Fire']))
		&& /Energy/.test(E.deckError(d.deck, [])) && /Energy/.test(E.deckError(d.deck, ['Dragon'])), 'deck rules: 20 cards, two of a name at most, at least one Basic Pokémon, 1-3 real Energy types');
	A(/2 to 4/.test(refused(() => E.createGame({ seed: 1, players: [{ ...d }] }))) && /2 to 4/.test(refused(() => E.createGame({ seed: 1, players: Array(5).fill({ ...d }) }))), 'a match is 2 to 4 players');
	let noBasic = 0;
	for (let s = 0; s < 40; s++) { const S = E.createGame({ seed: 's' + s, players: [starterDeck('mewtwo'), starterDeck('venusaur'), starterDeck('nidos')] }); for (const p of S.players) if (p.hand.length !== 5 || p.deck.length !== 15 || !p.hand.some(c => card(c).kind === 'pokemon' && card(c).stage === 0)) noBasic++; }
	A(noBasic === 0, 'every opening hand is 5 cards with a Basic Pokémon in it (40 seeds, 3 players)');
	const S = E.createGame({ seed: 'setup', players: [starterDeck('charizard'), starterDeck('pikachu')] });
	const p0 = S.players[0], basics = p0.hand.map((c, i) => i).filter(i => card(p0.hand[i]).kind === 'pokemon' && card(p0.hand[i]).stage === 0), non = p0.hand.findIndex(c => !(card(c).kind === 'pokemon' && card(c).stage === 0));
	A(/Basic/.test(refused(() => E.apply(S, { t: 'setup', seat: 0, active: [non], bench: [] })) || '') && /one or two/.test(refused(() => E.apply(S, { t: 'setup', seat: 0, active: [], bench: [] }))), 'setup: only Basic Pokémon, and at least one Active');
	A(/not in a turn/.test(refused(() => E.apply(S, { t: 'attach', seat: 0, at: L(0, 'active', 0) }))), 'nothing else can be done before everyone has set up');
	E.apply(S, { t: 'setup', seat: 0, active: basics.slice(0, 1), bench: basics.slice(1, 5) });
	A(S.phase === 'setup' && p0.active[0] && !p0.active[1], 'one Active Pokémon is enough to start (slot B may stay empty)');
	const p1 = S.players[1], b1 = p1.hand.map((c, i) => i).filter(i => card(p1.hand[i]).kind === 'pokemon' && card(p1.hand[i]).stage === 0);
	E.apply(S, { t: 'setup', seat: 1, active: b1.slice(0, 2), bench: b1.slice(2, 6) });
	const first = S.players[S.first];
	A(S.phase === 'main' && S.current === S.first && S.turn === 1 && first.hand.length >= 1 && first.zone.cur === null && first.zone.next, 'the match starts with the first player, who draws but has no Energy on their first turn');
	const fk = first.active.findIndex(Boolean), fa = card(first.active[fk].cards[0]).attacks[0];
	A(/first turn/.test(E.attackBlock(S, first.seat, first.active[fk], fa)) && /no Energy/.test(refused(() => E.apply(S, { t: 'attach', seat: first.seat, at: L(first.seat, 'active', fk) }))), '…and cannot attack or attach Energy on it');
	E.apply(S, { t: 'execute', seat: first.seat, commands: [null, null] });
	const second = S.players[S.current];
	A(second.seat !== first.seat && second.zone.cur && S.turn === 2, 'the second player gets an Energy on their first turn');
	E.apply(S, { t: 'attach', seat: second.seat, at: L(second.seat, 'active', second.active.findIndex(Boolean)) });
	A(/already attached/.test(refused(() => E.apply(S, { t: 'attach', seat: second.seat, at: L(second.seat, 'active', second.active.findIndex(Boolean)) }))) && second.zone.cur === null, 'one Energy attachment a turn, whichever Active Pokémon takes it');
}

// ===== 4. damage through the engine =====
{
	let S = arena(); put(S, 0, 'active', 0, 'Charmander', { energy: ['Fire'] }); const bulba = put(S, 1, 'active', 0, 'Bulbasaur'), squirtle = put(S, 1, 'active', 1, 'Squirtle');
	exec(S, { attack: atk(S, 0, 0, 'Ember'), target: L(1, 'active', 0) });
	A(bulba.dmg === 50 && logHas(S, /\+20 Fire into Grass/), 'Ember (30, Fire) into Bulbasaur (Grass/Poison) does 50, and the log says why', bulba.dmg);
	S = arena(); put(S, 0, 'active', 0, 'Charmander', { energy: ['Fire'] }); put(S, 1, 'active', 0, 'Bulbasaur'); const sq = put(S, 1, 'active', 1, 'Squirtle');
	exec(S, { attack: 0, target: L(1, 'active', 1) });
	A(sq.dmg === 10, 'into Squirtle (Water) it does 10', sq.dmg);
	S = arena(); put(S, 0, 'active', 0, 'Bulbasaur', { energy: ['Grass', 'Grass'] }); const zard = put(S, 1, 'active', 0, 'Charizard ex');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(zard.dmg === 0 && logHas(S, /does 0 damage/), 'Vine Whip (40, Grass) into Charizard ex (Fire/Flying, -40) does 0: damage is never negative, and 0 is allowed', zard.dmg);
	S = arena(); put(S, 0, 'active', 0, 'Rattata', { energy: ['Fire'] }); const gastly = put(S, 1, 'active', 0, 'Gastly');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(gastly.dmg === card(id('Rattata')).attacks[0].damage && logHas(S, /no immunity here/), 'a Normal attack into a Ghost does its full damage: no immunity', gastly.dmg);
	// several targets, each worked out on its own
	S = arena(); put(S, 0, 'active', 0, 'Articuno ex', { energy: ['Water', 'Water', 'Water'] }); const tA = put(S, 1, 'active', 0, 'Charmander', { dmg: 0 }), b1 = put(S, 1, 'bench', 0, 'Bulbasaur'), b2 = put(S, 1, 'bench', 1, 'Squirtle'), b3 = put(S, 1, 'bench', 2, 'Dratini');
	const hp0 = card(id('Charmander')).hp;
	exec(S, { attack: atk(S, 0, 0, 'Blizzard'), target: L(1, 'active', 0) });
	A(b1.dmg === 30 && b2.dmg === 0 && b3.dmg === 30, 'Blizzard\'s 10 to each Benched Pokémon is worked out per Pokémon: 30 to Grass, 0 to Water (resisted), 30 to Dragon', [b1.dmg, b2.dmg, b3.dmg]);
	A(S.players[1].active[0] === null && S.players[0].points === 1 && hp0 <= 80, 'and its 80 knocks out the Active Charmander for a point');
	// reductions, boosts, prevention
	S = arena(); put(S, 0, 'active', 0, 'Rattata', { energy: ['Fire'] }); const cloy = put(S, 1, 'active', 0, 'Cloyster');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(cloy.dmg === card(id('Rattata')).attacks[0].damage - 10 && logHas(S, /-10 Shell Armor/), "Cloyster's Shell Armor takes 10 off an attack", cloy.dmg);
	S = arena(); const p = S.players[0]; p.hand = [id('Giovanni')]; put(S, 0, 'active', 0, 'Rattata', { energy: ['Fire'] }); const t1 = put(S, 1, 'active', 0, 'Snorlax'), t2 = put(S, 1, 'bench', 0, 'Snorlax');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(t1.dmg === card(id('Rattata')).attacks[0].damage + 10 && logHas(S, /\+10 Giovanni/), 'Giovanni adds 10 to an attack into an opposing Active Pokémon', t1.dmg);
	S = arena(); put(S, 0, 'active', 0, 'Dugtrio', { energy: ['Fighting'] }); put(S, 1, 'active', 0, 'Kangaskhan', { energy: ['Fire'] });
	let dug = null;
	for (let s = 0; s < 30 && !dug; s++) { const X = arena(2, 'dig' + s); const d = put(X, 0, 'active', 0, 'Dugtrio', { energy: ['Fighting'] }); put(X, 1, 'active', 0, 'Kangaskhan', { energy: ['Fire'] }); exec(X, { attack: 0, target: L(1, 'active', 0) }); if (d.fx.some(f => f.k === 'prevent')) dug = X; }
	const dk = dug.players[0].active[0]; exec(dug, { attack: 0, target: L(0, 'active', 0) });
	A(dk.dmg === 0 && logHas(dug, /prevented/) && dug.current === 0 && !dk.fx.some(f => f.k === 'prevent'), "Dig (heads): the next attack into Dugtrio is prevented, and the protection ends when its owner's turn comes round", [dk.dmg, dk.fx]);
}

// ===== 5. Execute =====
{
	let S = arena(); put(S, 0, 'active', 0, 'Charmander', { energy: ['Fire'] }); put(S, 0, 'active', 1, 'Pikachu', { energy: ['Lightning'] });
	const x = put(S, 1, 'active', 0, 'Snorlax'), y = put(S, 1, 'active', 1, 'Snorlax');
	const n0 = S.log.length;
	exec(S, { attack: 0, target: L(1, 'active', 0) }, { attack: 0, target: L(1, 'active', 1) });
	const order = S.log.slice(n0).filter(e => e.k === 'attack').map(e => e.msg);
	A(x.dmg > 0 && y.dmg > 0 && /^Active A/.test(order[0]) && /^Active B/.test(order[1]) && S.log.slice(n0).some(e => e.k === 'execute' && /Resolved in order: A, then B/.test(e.msg)) && S.current === 1, 'two queued attacks resolve A then B, the log shows the order, and the turn ends', order);
	S = arena(); put(S, 0, 'active', 0, 'Charmander', { energy: ['Fire'] }); put(S, 0, 'active', 1, 'Pikachu', { energy: ['Lightning'] }); const z = put(S, 1, 'active', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) }, null);
	A(z.dmg === 30 && S.current === 1 && logHas(S, /Active B: Pikachu → Pass/), 'one attack and one Pass');
	S = arena(); put(S, 0, 'active', 0, 'Charmander'); put(S, 1, 'active', 0, 'Snorlax');
	exec(S, null, null);
	A(S.current === 1 && S.players[1].active[0].dmg === 0, 'two Passes end the turn with nothing done');
	S = arena(); put(S, 0, 'active', 0, 'Charmander'); put(S, 0, 'active', 1, 'Pikachu', { energy: ['Lightning'] }); const w = put(S, 1, 'active', 0, 'Snorlax');
	const why = refused(() => exec(S, { attack: 0, target: L(1, 'active', 0) }, { attack: 0, target: L(1, 'active', 0) }));
	A(/Energy/.test(why) && w.dmg === 0 && S.current === 0, 'if either command is not legal (no Energy), nothing resolves: both are validated first', why);
	A(/target/.test(refused(() => exec(S, null, { attack: 0, target: L(1, 'active', 1) }))) && /target/.test(refused(() => exec(S, null, { attack: 0, target: L(0, 'active', 0) }))) && /target/.test(refused(() => exec(S, null, { attack: 0 }))) && /empty/.test(refused(() => { const X = arena(); put(X, 1, 'active', 0, 'Snorlax'); exec(X, { attack: 0, target: L(1, 'active', 0) }); })), 'an empty slot, your own Pokémon, or no target at all is refused; so is a command for an empty Active slot');
	// the first attack knocks out the second one's target: no redirect
	S = arena(); put(S, 0, 'active', 0, 'Charizard ex', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); put(S, 0, 'active', 1, 'Pikachu', { energy: ['Lightning'] });
	put(S, 1, 'active', 0, 'Rattata'); const other = put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) }, { attack: 0, target: L(1, 'active', 0) });
	A(other.dmg === 0 && logHas(S, /Active B's .* fails: its target is no longer there/) && S.players[0].points === 1, "when A knocks out B's target, B's attack fails: it is not redirected to the other Active Pokémon", other.dmg);
	// restrictions are each Pokémon's own
	S = arena(); const a1 = put(S, 0, 'active', 0, 'Charmander', { energy: ['Fire'] }); a1.fx.push({ k: 'cantAttack', until: { seat: 0, at: 'end' } }); put(S, 0, 'active', 1, 'Pikachu', { energy: ['Lightning'] }); const v2 = put(S, 1, 'active', 0, 'Snorlax');
	A(/can't attack/.test(refused(() => exec(S, { attack: 0, target: L(1, 'active', 0) }))), "a Pokémon that can't attack this turn cannot be given a command");
	exec(S, null, { attack: 0, target: L(1, 'active', 0) });
	A(v2.dmg > 0, '…and the other Active Pokémon is not affected by it');
	A(/not your turn/.test(refused(() => E.apply(S, { t: 'execute', seat: 0, commands: [null, null] }))), 'only the player whose turn it is can Execute');
}

// ===== 6. several players =====
{
	for (const n of [2, 3, 4]) {
		const S = arena(n); for (const p of S.players) put(S, p.seat, 'active', 0, 'Snorlax');
		const seen = []; for (let i = 0; i < n * 2; i++) { seen.push(S.current); exec(S, null, null); }
		A(seen.join() === [...Array(n).keys(), ...Array(n).keys()].join(), `${n} players: each takes a whole turn before the round comes back`, seen);
	}
	let S = arena(4); put(S, 0, 'active', 0, 'Charmander', { energy: ['Fire'] }); put(S, 0, 'active', 1, 'Pikachu', { energy: ['Lightning'] });
	for (const s of [1, 2, 3]) { put(S, s, 'active', 0, 'Snorlax'); put(S, s, 'active', 1, 'Snorlax'); }
	A(E.attackTargets(S, 0, card(id('Charmander')).attacks[0]).length === 6, 'with four players there are six opposing Active Pokémon to aim at');
	exec(S, { attack: 0, target: L(3, 'active', 1) }, { attack: 0, target: L(2, 'active', 0) });
	A(S.players[3].active[1].dmg === 30 && S.players[2].active[0].dmg > 0 && S.players[1].active[0].dmg === 0 && S.current === 1, 'the two Active Pokémon may aim at different opponents, and the next player in order is not targeted by default');
	// points go to the attacker; a player with nothing left is out; the order skips them
	S = arena(3); put(S, 0, 'active', 0, 'Charizard ex', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); put(S, 1, 'active', 0, 'Rattata'); put(S, 2, 'active', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(S.players[0].points === 1 && S.players[1].eliminated && S.current === 2 && !S.over && logHas(S, /P2 has no Pokémon left and is out/), 'a knock out gives the attacker the point; a player with no Pokémon left is out, and the turn passes over them', [S.players.map(p => p.points), S.current]);
	exec(S, null, null);
	A(S.current === 0, '…the order is now P3, P1, P3, P1');
	// promotion: with a Bench, the owner chooses who comes up
	S = arena(2); put(S, 0, 'active', 0, 'Charizard ex', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); put(S, 1, 'active', 0, 'Rattata'); put(S, 1, 'bench', 0, 'Pikachu'); put(S, 1, 'bench', 2, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(S.pending && S.pending.seat === 1 && S.pending.kind === 'promote' && S.pending.options.join() === '0,2' && S.current === 0, 'a player left with no Active Pokémon must choose one from their Bench before play goes on', S.pending && S.pending.options);
	A(/not yours/.test(refused(() => E.apply(S, { t: 'choose', seat: 0, pick: 0 }))) && /not one of/.test(refused(() => E.apply(S, { t: 'choose', seat: 1, pick: 1 }))) && /waiting/.test(refused(() => E.apply(S, { t: 'execute', seat: 0, commands: [null, null] }))), 'only that player can choose, and only one of the choices');
	E.apply(S, { t: 'choose', seat: 1, pick: 2 });
	A(card(S.players[1].active[0].cards[0]).name === 'Snorlax' && S.players[1].bench[2] === null && S.current === 1 && !S.pending, 'the one chosen goes to Active A, and the turn then passes');
	// a Pokémon ex is 2 points; 3 points win
	S = arena(2); put(S, 0, 'active', 0, 'Charizard ex', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); put(S, 1, 'active', 0, 'Pikachu ex', { dmg: 100 }); put(S, 1, 'bench', 0, 'Snorlax'); S.players[0].points = 1;
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(S.over && S.over.winner === 0 && S.players[0].points === 3 && /over/.test(refused(() => E.apply(S, { t: 'execute', seat: 1, commands: [null, null] }))), 'knocking out a Pokémon ex is 2 points; reaching 3 wins at once and the match is over');
	// last one standing; conceding
	S = arena(3); for (const p of S.players) put(S, p.seat, 'active', 0, 'Snorlax');
	E.apply(S, { t: 'concede', seat: 1 });
	A(S.players[1].eliminated && !S.over && S.current === 0, 'a player may concede out of turn; the other two play on');
	E.apply(S, { t: 'concede', seat: 0 });
	A(S.over && S.over.winner === 2 && /last player standing/.test(S.over.why), 'the last player standing wins');
	// two players reach 3 at once: the most points, then the player whose turn it is
	S = arena(3); S.players[0].points = 2; S.players[1].points = 2; put(S, 0, 'active', 0, 'Arcanine', { energy: ['Fire', 'Fire', 'Fire'], dmg: 120 }); put(S, 1, 'active', 0, 'Rattata'); put(S, 1, 'bench', 0, 'Snorlax'); put(S, 2, 'active', 0, 'Snorlax');
	exec(S, { attack: atk(S, 0, 0, 'Heat Tackle'), target: L(1, 'active', 0) });
	A(S.over && S.players[0].points === 3 && S.players[1].points === 3 && S.over.winner === 0, "Heat Tackle knocks out its target and, by recoil, its user: both players reach 3; the tie goes to the player whose turn it is (and the recoil's point went to the target's owner)", [S.players.map(p => p.points), S.over]);
}

// ===== 7. the cards =====
{
	// evolution
	let S = arena(); const p = S.players[0]; const ch = put(S, 0, 'active', 0, 'Charmander', { energy: ['Fire'], dmg: 20 }); ch.status.poisoned = { by: 1 }; p.hand = [id('Charmeleon'), id('Charizard ex'), id('Wartortle')];
	A(/evolves from Charmeleon/.test(refused(() => E.apply(S, { t: 'evolve', seat: 0, hand: 1, at: L(0, 'active', 0) }))) && /evolves from Squirtle/.test(refused(() => E.apply(S, { t: 'evolve', seat: 0, hand: 2, at: L(0, 'active', 0) }))), 'a Stage 2 does not skip its Stage 1, and a Pokémon evolves only from the one it names');
	E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) });
	A(card(ch.cards.at(-1)).name === 'Charmeleon' && ch.dmg === 20 && ch.energy.length === 1 && !ch.status.poisoned, 'evolving keeps Energy and damage and removes Special Conditions');
	A(/the turn it was played/.test(refused(() => E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) }))), 'a Pokémon does not evolve twice in a turn');
	S = arena(); S.players[0].hand = [id('Charmander'), id('Charmeleon')];
	E.apply(S, { t: 'playBasic', seat: 0, hand: 0, to: { zone: 'active', idx: 1 } });
	A(S.players[0].active[1] && /the turn it was played/.test(refused(() => E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 1) }))), 'a Basic may be played straight into an empty Active slot, and cannot evolve that turn');
	S = arena(); S.players[0].turns = 0; S.first = 1; put(S, 0, 'active', 0, 'Charmander'); S.players[0].hand = [id('Charmeleon')];
	A(/first turn/.test(refused(() => E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) }))), 'nor on its owner\'s first turn');
	// the Bench holds four; six Pokémon at most
	S = arena(); for (let i = 0; i < 4; i++) put(S, 0, 'bench', i, 'Rattata'); put(S, 0, 'active', 0, 'Rattata'); put(S, 0, 'active', 1, 'Rattata'); S.players[0].hand = [id('Charmander')];
	A(/Bench is full/.test(refused(() => E.apply(S, { t: 'playBasic', seat: 0, hand: 0 }))), 'two Active and four Benched Pokémon is the most a player has');
	// retreat
	S = arena(); const r = put(S, 0, 'active', 0, 'Charmander', { energy: ['Fire', 'Fire'] }); r.status.asleep = { by: 1 }; const bb = put(S, 0, 'bench', 1, 'Pikachu');
	A(/Asleep/.test(refused(() => E.apply(S, { t: 'retreat', seat: 0, slot: 0, bench: 1 }))), 'an Asleep Pokémon cannot retreat');
	r.status = {}; r.fx.push({ k: 'atkMinus', n: 20, until: { seat: 0, at: 'end' } });
	E.apply(S, { t: 'retreat', seat: 0, slot: 0, bench: 1 });
	A(S.players[0].active[0] === bb && S.players[0].bench[1] === r && r.energy.length === 2 - card(id('Charmander')).retreat && r.fx.length === 0, 'retreating pays its Energy cost, swaps with the Benched Pokémon in the same slot, and ends the effects on it');
	put(S, 0, 'active', 1, 'Rattata', { energy: ['Fire', 'Fire'] });
	A(/already retreated/.test(refused(() => E.apply(S, { t: 'retreat', seat: 0, slot: 1, bench: 1 }))), 'one retreat a turn, not one for each Active Pokémon');
	S = arena(); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 0, 'active', 1, 'Rattata');
	E.apply(S, { t: 'promote', seat: 0, slot: 0, bench: 0 });
	A(card(S.players[0].active[0].cards[0]).name === 'Snorlax', 'an empty Active slot can be filled from the Bench on your turn');
	// Trainers
	S = arena(); const tp = S.players[0]; tp.hand = [id("Professor's Research"), id("Professor's Research"), id('Potion'), id('Poké Ball')]; const hurt = put(S, 0, 'active', 0, 'Snorlax', { dmg: 50 }); put(S, 1, 'active', 0, 'Snorlax');
	const deck0 = tp.deck.length;
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(tp.hand.length === 5 && tp.deck.length === deck0 - 2 && /already played a Supporter/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }))), "Professor's Research draws 2; one Supporter a turn");
	E.apply(S, { t: 'trainer', seat: 0, hand: tp.hand.indexOf(id('Potion')), args: { at: L(0, 'active', 0) } });
	E.apply(S, { t: 'trainer', seat: 0, hand: tp.hand.indexOf(id('Poké Ball')), args: {} });
	A(hurt.dmg === 30 && tp.hand.some(c => card(c).kind === 'pokemon' && card(c).stage === 0) && tp.discard.length === 3, 'Potion heals 20; Poké Ball finds a Basic Pokémon; Items have no limit');
	S = arena(3); S.players[0].hand = [id('Sabrina')]; put(S, 0, 'active', 0, 'Snorlax'); const out = put(S, 2, 'active', 1, 'Pikachu', { energy: ['Lightning'] }); put(S, 2, 'active', 0, 'Rattata'); put(S, 2, 'bench', 0, 'Snorlax'); put(S, 2, 'bench', 3, 'Rattata'); put(S, 1, 'active', 0, 'Snorlax');
	A(/no Benched/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { target: L(1, 'active', 0) } }))), 'Sabrina cannot be played on a player with no Bench');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { target: L(2, 'active', 1) } });
	A(S.pending && S.pending.seat === 2 && S.pending.kind === 'switchIn' && S.pending.options.join() === '0,3', 'Sabrina: you choose the opposing Active Pokémon; its OWNER chooses the replacement');
	E.apply(S, { t: 'choose', seat: 2, pick: 3 });
	A(card(S.players[2].active[1].cards[0]).name === 'Rattata' && S.players[2].bench[3] === out && S.current === 0, 'the replacement takes the same Active slot, and it is still your turn');
	S = arena(); S.players[0].hand = [id('Misty')]; const wtr = put(S, 0, 'active', 0, 'Squirtle'); put(S, 0, 'active', 1, 'Charmander');
	A(/Water Pokémon/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 1) } }))), 'Misty needs one of your Water Pokémon (its CARD type)');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } });
	const heads = S.log.filter(e => e.k === 'coin' && e.heads).length;
	A(wtr.energy.length === heads && wtr.energy.every(e => e === 'Water'), `Misty attaches a Water Energy for each heads before the first tails (${heads} here)`);
	S = arena(3); S.players[0].hand = [id('Red Card'), id('Hand Scope')]; put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); put(S, 2, 'active', 0, 'Snorlax'); S.players[2].hand = [id('Potion'), id('Potion'), id('Giovanni'), id('Sabrina'), id('Pikachu')];
	A(/choose an opponent/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }))), '"your opponent" Trainers ask which opponent');
	E.apply(S, { t: 'trainer', seat: 0, hand: 1, args: { opp: 2 } });
	const full = e => e.msg + ' ' + (e.more || ''), mine = full(E.view(S, 0).log.at(-1)), theirs = full(E.view(S, 1).log.at(-1));
	A(/Potion, Potion, Giovanni, Sabrina, Pikachu/.test(mine) && !/Potion/.test(theirs), 'Hand Scope shows that hand to the player who played it, and to nobody else', [mine, theirs]);
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 2 } });
	A(S.players[2].hand.length === 3 && S.players[1].hand.length !== 3, 'Red Card: the chosen opponent shuffles their hand away and draws 3');
	// fossils
	S = arena(); S.players[0].hand = [id('Helix Fossil'), id('Omanyte')]; put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	E.apply(S, { t: 'playBasic', seat: 0, hand: 0, to: { zone: 'bench', idx: 0 } });
	const fos = S.players[0].bench[0]; S.players[0].zone.cur = 'Fire';
	A(fos && card(fos.cards[0]).hp === 40 && /fossil/.test(refused(() => E.apply(S, { t: 'attach', seat: 0, at: L(0, 'bench', 0) })) || '') && /fossil/.test(E.attackBlock(S, 0, fos, { cost: [], name: 'x' })), 'a fossil is played as a 40-HP Basic Pokémon that cannot take Energy or attack');
	fos.turnPlayed = -1; E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'bench', 0) });
	A(card(fos.cards.at(-1)).name === 'Omanyte' && fos.cards.length === 2, 'Omanyte evolves from Helix Fossil');
	// Abilities
	S = arena(3); const gren = put(S, 0, 'bench', 0, 'Greninja'); put(S, 0, 'active', 0, 'Snorlax'); const far = put(S, 2, 'bench', 1, 'Rattata', { dmg: 20 }); put(S, 2, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { target: L(2, 'bench', 1) } });
	A(S.players[2].bench[1] === null && S.players[0].points === 1 && /already been used/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { target: L(1, 'active', 0) } }))), "Greninja's Water Shuriken does 20 to any opposing Pokémon (a Benched one here: a knock out, a point), once a turn");
	S = arena(3); put(S, 0, 'active', 0, 'Gengar ex'); for (const s of [1, 2]) { put(S, s, 'active', 0, 'Snorlax'); S.players[s].hand = [id("Professor's Research")]; }
	exec(S, null, null);
	A(/Ability stops/.test(refused(() => E.apply(S, { t: 'trainer', seat: 1, hand: 0, args: {} }))), "Gengar ex in an Active slot stops every opponent's Supporters");
	S = arena(); const poli = put(S, 1, 'active', 0, 'Poliwrath'); const hitter = put(S, 0, 'active', 0, 'Rattata', { energy: ['Fire'] });
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(poli.dmg > 0 && hitter.dmg === 20, "Poliwrath's Counterattack does 20 back to a Pokémon that damages it");
	S = arena(); const bf = put(S, 0, 'bench', 0, 'Butterfree'); const d1 = put(S, 0, 'active', 0, 'Snorlax', { dmg: 50 }), d2 = put(S, 0, 'bench', 1, 'Rattata', { dmg: 10 }); put(S, 1, 'active', 0, 'Snorlax');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: {} });
	A(d1.dmg === 30 && d2.dmg === 0, "Butterfree's Powder Heal heals 20 from each of your Pokémon (both Active slots and the Bench)");
	// Special Conditions and the Checkup
	S = arena(3); const ven = put(S, 0, 'active', 0, 'Weezing'); const vic = put(S, 1, 'active', 0, 'Snorlax'); put(S, 2, 'active', 0, 'Snorlax');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { target: L(1, 'active', 0) } });
	exec(S, null, null);
	const afterMine = vic.dmg; exec(S, null, null); const afterOwn = vic.dmg; exec(S, null, null); const afterThird = vic.dmg;
	A(afterMine === 10 && afterOwn === 20 && afterThird === 20, 'Poison is checked at the end of the turn of the player who caused it and at the end of its owner\'s turn: twice a round with three players, not three times', [afterMine, afterOwn, afterThird]);
	S = arena(); const sl = put(S, 1, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); sl.status.paralyzed = { by: 0, turn: S.turn }; put(S, 0, 'active', 0, 'Snorlax');
	exec(S, null, null);
	A(/Paralyzed/.test(E.attackBlock(S, 1, sl, card(id('Snorlax')).attacks[0])) && sl.status.paralyzed, 'a Paralyzed Pokémon cannot attack on its owner\'s next turn');
	exec(S, null, null);
	A(!sl.status.paralyzed, '…and recovers at the end of that turn');
	// the Energy Zone
	S = arena(); const ez = S.players[0]; ez.zone = { cur: 'Fire', next: 'Fire' }; put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	exec(S, null, null); exec(S, null, null);
	A(ez.zone.cur === 'Fire' && ez.zone.next === 'Fire', 'an Energy that was not attached stays ready: Energy does not pile up');
	const dr = E.createGame({ seed: 'dr', players: [starterDeck('dragonite'), starterDeck('dragonite')] });
	const seq = []; for (let i = 0; i < 60; i++) seq.push(dr.players[0].erand.pick(dr.players[0].energy));
	A(seq.includes('Water') && seq.includes('Lightning') && seq.every(e => ['Water', 'Lightning'].includes(e)), 'a two-type deck\'s Energy Zone makes both of its types and nothing else');
	// the hand limit
	S = arena(); S.players[0].hand = Array(10).fill(id('Potion')); put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); const dn = S.players[0].deck.length;
	exec(S, null, null); exec(S, null, null);
	A(S.players[0].hand.length === 10 && S.players[0].deck.length === dn, 'a hand of 10 does not draw');
	// Copy Anything
	S = arena(); put(S, 0, 'active', 0, 'Ditto', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); const cz = put(S, 1, 'active', 0, 'Charizard ex'); put(S, 1, 'bench', 0, 'Squirtle');
	exec(S, { attack: 0, target: L(1, 'active', 0), args: { from: L(1, 'active', 0), attack: 0 } });
	A(cz.dmg === 60 && logHas(S, /Ditto copies Charizard ex's Slash/), "Ditto copies an opposing Pokémon's attack and uses it with that attack's own type (Slash: Normal, 60 into Fire/Flying)", cz.dmg);
}

// ===== 8. a game is its seed and its actions =====
function playOut(cfg, limit = 4000) {
	const S = E.createGame(cfg), acts = []; let guard = 0, refusals = 0;
	while (!S.over && guard++ < limit) {
		const seat = S.pending ? S.pending.seat : S.phase === 'setup' ? S.players.find(p => !p.setup && !p.eliminated).seat : S.current;
		const banned = new Set(); let done = false;
		for (let t = 0; t < 60 && !done; t++) {
			const a = nextAction(E.view(S, seat), banned) || { t: 'execute', seat, commands: [null, null] };
			try { E.apply(S, a); acts.push(a); done = true; } catch (e) { if (!e.refused) throw e; refusals++; banned.add(JSON.stringify(a)); }
		}
		if (!done) throw new Error('the computer player found nothing legal to do');
	}
	return { S, acts, refusals };
}
{
	const cfg = { seed: 'replay-1', players: [{ name: 'A', ai: true, ...starterDeck('blastoise') }, { name: 'B', ai: true, ...starterDeck('pikachu') }, { name: 'C', ai: true, ...starterDeck('mewtwo') }] };
	const one = playOut(cfg), two = playOut(JSON.parse(JSON.stringify(cfg)));
	A(one.S.over && JSON.stringify(one.acts) === JSON.stringify(two.acts) && E.digest(one.S) === E.digest(two.S), 'the same seed and the same players play the same match, action for action');
	const R = E.replay(cfg, one.acts), half = E.replay(cfg, one.acts, one.acts.length >> 1);
	A(E.digest(R) === E.digest(one.S) && half.actions === one.acts.length >> 1 && !half.over, 'replaying its actions rebuilds the final position, or any position on the way');
	A(E.digest(playOut({ ...cfg, seed: 'replay-2' }).S) !== E.digest(one.S), 'another seed is another match');
	const mid = E.replay(cfg, one.acts, 6), v0 = E.view(mid, 0), vs = E.view(mid, null), txt = JSON.stringify(vs);
	A(v0.players[0].hand.length === mid.players[0].hand.length && v0.players[1].hand === null && v0.players[1].handCount === mid.players[1].hand.length && vs.players.every(p => p.hand === null) && !('deck' in vs.players[0] && Array.isArray(vs.players[0].deck)) && !/"erand"|"rand"/.test(txt),
		"a player's view has their own hand and only the size of everyone else's; a spectator's has no hand at all; no view has a deck's order");
	A(E.refusal(mid, { t: 'execute', seat: (mid.current + 1) % 3, commands: [null, null] }, one.acts.slice(0, 6)) !== null && mid.actions === 6, 'asking whether an action would be refused does not change the game');
}
{
	const res = { n: 0, over: 0, turns: [], bad: [] };
	for (let g = 0; g < 45; g++) {
		const n = 2 + (g % 3), players = Array.from({ length: n }, (_, i) => ({ name: 'P' + (i + 1), ai: true, ...starterDeck(STARTERS[(g * 7 + i * 3) % STARTERS.length].id) }));
		const cfg = { seed: 'fuzz' + g, players };
		try {
			const { S, acts } = playOut(cfg); res.n++;
			if (S.over) { res.over++; res.turns.push(S.turn); }
			if (E.digest(E.replay(cfg, acts)) !== E.digest(S)) res.bad.push(g + ': replay differs');
			for (const p of S.players) { const total = p.deck.length + p.hand.length + p.discard.length + [...p.active, ...p.bench].filter(Boolean).reduce((a, k) => a + k.cards.length, 0); if (total !== 20) res.bad.push(`${g}: P${p.seat + 1} has ${total} cards`); }
			if (S.over && S.over.winner != null && !(S.players[S.over.winner].points >= 3 || S.players.filter(p => !p.eliminated).length === 1)) res.bad.push(g + ': winner without a reason');
			if (S.players.some(p => [...p.active, ...p.bench].filter(Boolean).some(k => k.dmg >= card(k.cards.at(-1)).hp))) res.bad.push(g + ': a knocked out Pokémon is still in play');
		} catch (e) { res.bad.push(g + ': ' + e.message); }
	}
	A(res.n === 45 && res.over === 45 && res.bad.length === 0, `computer players finish 45 matches (15 each of 2, 3 and 4 players) through the same actions as a person: every replay matches, every card is accounted for, every winner has 3 points or is the last one in (turns ${Math.min(...res.turns)}-${Math.max(...res.turns)})`, res.bad.slice(0, 5));
	// the computer player's estimate is the engine's arithmetic
	const S = arena(); const me = put(S, 0, 'active', 0, 'Charmander', { energy: ['Fire'] }), foe = put(S, 1, 'active', 0, 'Bulbasaur'); const v = E.view(S, 0);
	A(expectedDamage(v, 0, v.players[0].active[0], card(id('Charmander')).attacks[0], v.players[1].active[0]) === 50, 'the computer player weighs type effectiveness the way the engine applies it (Ember into Bulbasaur: 50)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
