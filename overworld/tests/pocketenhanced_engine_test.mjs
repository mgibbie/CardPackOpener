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
	const S = E.createGame({ seed, rules: E.RULES, players: Array.from({ length: n }, (_, i) => ({ name: 'P' + (i + 1), ...starterDeck(STARTERS[i].id) })) });   // (the rules revision new matches are played under)
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
	const src = ['tcgdex_a1.json', 'tcgdex_a1a.json', 'tcgdex_a2.json', 'tcgdex_a2a.json', 'tcgdex_a2b.json', 'tcgdex_a3.json', 'tcgdex_a3a.json', 'tcgdex_a3b.json', 'tcgdex_a4.json', 'tcgdex_a4a.json', 'alt_a4b.json', 'tcgdex_b1.json', 'tcgdex_b1a.json', 'tcgdex_b2.json', 'tcgdex_b2a.json', 'alt_b2b.json', 'alt_b3.json', 'alt_b3a.json', 'alt_b3b.json', 'alt_b4.json', 'alt_b4a.json', 'alt_b4b.json'].flatMap(f => JSON.parse(fs.readFileSync(path.join(ROOT, 'pocketenhanced/data/source', f), 'utf8')).cards);
	const a1 = CARDS.filter(c => c.set === 'A1'), pk = CARDS.filter(c => c.kind === 'pokemon');
	const a1a = CARDS.filter(c => c.set === 'A1a');
	A(src.filter(c => c.id.startsWith('A1-')).length === 286 && a1.length === 225 && src.every(c => card(c.id)), 'Genetic Apex: 286 printings are 225 different gameplay cards (alternate art shares one definition), plus 7 starter Trainers; every printing resolves', [a1.length, CARDS.length]);
	A(src.filter(c => c.id.startsWith('A1a-')).length === 86 && a1a.length === 66 && card('A1a-063') === card('A1-218'), 'Mythical Island: 86 printings add 66 gameplay cards (its Old Amber is the Genetic Apex card, one definition)', [a1a.length, CARDS.length]);
	const a2 = CARDS.filter(c => c.set === 'A2');
	A(src.filter(c => c.id.startsWith('A2-')).length === 207 && a2.length === 155 && a2.filter(c => c.kind === 'tool').length === 3, 'Space-Time Smackdown: 207 printings add 155 gameplay cards, three of them Pokémon Tools', [a2.length, CARDS.length]);
	const a2a = CARDS.filter(c => c.set === 'A2a');
	A(src.filter(c => c.id.startsWith('A2a-')).length === 96 && a2a.length === 75 && card('A2a-079') === card('A2a-036'), 'Triumphant Light: 96 printings add 75 gameplay cards (a printing that writes "ex" another way is the same card)', [a2a.length, CARDS.length]);
	const a2b = CARDS.filter(c => c.set === 'A2b');
	A(src.filter(c => c.id.startsWith('A2b-')).length === 111 && a2b.length === 72 && card('A2b-111') === card('P-A-005'), 'Shining Revelry: 111 printings add 72 gameplay cards (its crown Poké Ball is the promo card)', [a2b.length, CARDS.length]);
	const a3 = CARDS.filter(c => c.set === 'A3');
	A(src.filter(c => c.id.startsWith('A3-')).length === 239 && a3.length === 156 && card('A3-226') === card('A1-151') && a3.filter(c => c.kind === 'tool').length === 2, 'Celestial Guardians: 239 printings add 156 gameplay cards (its rare Cubone is the Genetic Apex card, written with a curly apostrophe)', [a3.length, CARDS.length]);
	const a3a = CARDS.filter(c => c.set === 'A3a');
	A(src.filter(c => c.id.startsWith('A3a-')).length === 103 && a3a.length === 69 && card('A3a-099') === card('A1a-003') && card('A3a-102') === card('A1a-059') && a3a.filter(c => c.ub).length === 11, 'Extradimensional Crisis: 103 printings add 69 gameplay cards (its Celebi ex and Pidgeot ex are the cards already in the game)', [a3a.length, CARDS.length, a3a.filter(c => c.ub).length]);
	const a3b = CARDS.filter(c => c.set === 'A3b');
	A(src.filter(c => c.id.startsWith('A3b-')).length === 107 && a3b.length === 69 && card('A3b-099') === card('A1-132'), 'Eevee Grove: 107 printings add 69 gameplay cards (its Gardevoir is the card already in the game)', [a3b.length, CARDS.length]);
	const a4 = CARDS.filter(c => c.set === 'A4');
	A(src.filter(c => c.id.startsWith('A4-')).length === 241 && a4.length === 161 && a4.filter(c => c.kind === 'tool').length === 3, 'Wisdom of Sea and Sky: 241 printings add 161 gameplay cards', [a4.length, CARDS.length]);
	const a4a = CARDS.filter(c => c.set === 'A4a');
	A(src.filter(c => c.id.startsWith('A4a-')).length === 105 && a4a.length === 71 && card(a4a.find(c => c.name === 'Galarian Corsola').id).combatTypes.join() === 'Ghost', 'Secluded Springs: 105 printings add 71 gameplay cards', [a4a.length, CARDS.length]);
	const b1 = CARDS.filter(c => c.set === 'B1');
	A(src.filter(c => c.id.startsWith('B1-')).length === 331 && b1.length === 224 && b1.filter(c => c.points === 3).map(c => c.name).sort().join() === 'Mega Absol ex,Mega Altaria ex,Mega Ampharos ex,Mega Blaziken ex,Mega Gyarados ex,Mega Pinsir ex' && b1.find(c => c.name === 'Mega Gyarados ex').combatTypes.join() === 'Water,Dark', 'Mega Rising: 331 printings add 224 gameplay cards; its six Mega Pokémon ex are worth 3 points and have their Mega types', [b1.length, CARDS.length]);
	const b1a = CARDS.filter(c => c.set === 'B1a');
	A(src.filter(c => c.id.startsWith('B1a-')).length === 103 && b1a.length === 69 && b1a.filter(c => c.points === 3).map(c => c.name).sort().join() === 'Mega Blastoise ex,Mega Charizard Y ex,Mega Lopunny ex,Mega Steelix ex,Mega Venusaur ex' && b1a.find(c => c.name === 'Mega Charizard Y ex').combatTypes.join() === 'Fire,Flying' && b1a.find(c => c.name === 'Mega Charizard Y ex').dex === 6, 'Crimson Blaze: 103 printings add 69 gameplay cards, five of them Mega Pokémon ex', [b1a.length, CARDS.length]);
	const b2 = CARDS.filter(c => c.set === 'B2');
	A(src.filter(c => c.id.startsWith('B2-')).length === 234 && b2.length === 155 && card('B2-224') === card('A1a-060') && b2.filter(c => c.kind === 'stadium').map(c => c.name).sort().join() === 'Peculiar Plaza,Starting Plains,Training Area' && b2.find(c => c.name === 'Hearthflame Mask Ogerpon').combatTypes.join() === 'Grass,Fire' && b2.filter(c => c.points === 3).length === 4, 'Fantastical Parade: 234 printings add 155 gameplay cards: three Stadiums, four Mega Pokémon ex, Ogerpon\'s four masks', [b2.length, CARDS.length]);
	// Deluxe Pack ex comes from a second source (tools/pocket_fetch_alt.mjs): a reprint set
	{ const a4b = CARDS.filter(c => c.set === 'A4b'), recs = src.filter(c => c.id.startsWith('A4b-'));
		A(recs.length === 379 && a4b.length === 1 && a4b[0].name === 'Pachirisu' && a4b[0].attacks[0].fx[0].to === 'benchType' && card('A4b-001') === card('A1-001') && card('A4b-124') === card('A3-051') && card('A4b-308') === card('A3b-066') && card('A4b-194') === card('A1-151') && recs.filter(c => c.foil).length === 139 && recs.every(c => !c.description && !c.illustrator && !c.image),
			'Deluxe Pack ex: 379 printings from the second source, 378 of them printings of cards already in the game (wording that differs only in spacing or punctuation is the same card); the one new card is the Pachirisu whose text TCGdex had lost part of', a4b.map(c => c.id + ' ' + c.name)); }
	// Deluxe Pack: Mega is all reprints; three of them matched their cards only once the first source's slips were put right
	{ const recs = src.filter(c => c.id.startsWith('B4b-'));
		A(recs.length === 429 && !CARDS.some(c => c.set === 'B4b') && card('B4b-109') === card('B1-109') && card('B1-109').weakness === null && card('B4b-168') === card('B2a-078') && !card('B2a-078').attacks[0].damage && card('B2a-078').attacks[0].fx[0].n === 40 && card('B4b-231') === card('B2a-093') && !CARDS.some(c => c.weakness === 'Colorless') && recs.every(c => !c.description && !c.illustrator && !c.image),
			'Deluxe Pack: Mega: 429 printings, every one a printing of a card already in the game (no card has a "Colorless" Weakness; Gholdengo ex\'s Spending Rush has no printed damage of its own; Mesagoza keeps its full text)'); }
	const b2a = CARDS.filter(c => c.set === 'B2a');
	A(src.filter(c => c.id.startsWith('B2a-')).length === 131 && b2a.length === 93 && CARDS.length === 2263 && b2a.filter(c => c.ex).every(c => / ex$/.test(c.name) && c.points === 2) && b2a.filter(c => c.ex).length === 5 && card('B2a-126') === card('A4a-010') && card('B2a-129') === card('A2b-054') && card('B2a-099') === card('B2a-082') && card('B2a-082').evolvesFrom === 'Tandemaus', 'Paldean Wonders: 131 printings add 93 gameplay cards (2263 in all with the sets added since); its Pokémon ex have their "ex" back (the source dropped it from the names) and are worth 2 points, and reprints with no "evolves from" are matched to their cards', [b2a.length, CARDS.length]);
	const badType = pk.filter(c => !T.CARD_TYPES.includes(c.cardType) || c.combatTypes.length < 1 || c.combatTypes.length > 2 || c.combatTypes.some(t => !T.COMBAT_TYPES.includes(t)));
	A(badType.length === 0, 'every Pokémon has a Card Type and one or two real Combat Types', badType.map(c => c.name).slice(0, 5));
	const ct = n => card(id(n));
	A(JSON.stringify([ct('Charizard ex').cardType, ct('Charizard ex').combatTypes, ct('Gengar ex').cardType, ct('Gengar ex').combatTypes, ct('Dragonite').cardType, ct('Dragonite').combatTypes, ct('Pidgeot').combatTypes, ct('Gyarados').combatTypes, ct('Pikachu ex').combatTypes])
		=== JSON.stringify(['Fire', ['Fire', 'Flying'], 'Psychic', ['Ghost', 'Poison'], 'Dragon', ['Dragon', 'Flying'], ['Normal', 'Flying'], ['Water', 'Flying'], ['Electric']]),
		"the plan's table: Charizard ex Fire card / Fire-Flying, Gengar ex Psychic card / Ghost-Poison, Dragonite Dragon card / Dragon-Flying, Pidgeot Normal-Flying…");
	const atks = pk.flatMap(c => c.attacks.map(a => [c, a]));
	A(atks.length > 200 && atks.every(([, a]) => T.COMBAT_TYPES.includes(a.combatType) && ['move', 'named', 'decided'].includes(a.typeBasis)), `all ${atks.length} attacks have a Combat Type and say where it came from`);
	const byName = n => atks.find(([, a]) => a.name === n)[1];
	A(byName('Flamethrower').combatType === 'Fire' && byName('Thunderbolt').combatType === 'Electric' && byName('Hydro Pump').combatType === 'Water' && byName('Hyper Beam').combatType === 'Normal' && byName('Ice Beam').combatType === 'Ice' && byName('Vine Whip').typeBasis === 'move', 'an attack named for a mainline move has that move\'s type (Flamethrower Fire, Hyper Beam Normal, Ice Beam Ice)');
	const review = fs.readFileSync(path.join(ROOT, 'pocketenhanced/data/ATTACK_TYPE_REVIEW.md'), 'utf8');
	const judged = [...new Set(atks.filter(([, a]) => a.typeBasis === 'decided').map(([, a]) => a.name))];
	A(judged.length >= 20 && judged.every(n => review.includes('| ' + n + ' |')), `the ${judged.length} Combat Types decided by a call are all on the list, each with its reason`);
	{	// six attacks shared by unrelated Pokémon were given the type of the plain move they resemble; recordings keep the old one
		const re = [...new Map(atks.filter(([, a]) => a.typeWas).map(([, a]) => [a.name, a.typeWas + '>' + a.combatType])).entries()].map(x => x.join(':')).sort().join(' ');
		A(re === 'Guard Press:Rock>Fighting Hypnoblast:Ghost>Psychic Pierce:Steel>Normal Power Blast:Psychic>Normal Sharp Scythe:Bug>Normal Spinning Attack:Steel>Normal', 'the retyped attacks carry the type they had', re);
		const hit = rules => { const S = arena(2); S.rules = rules; put(S, 0, 'active', 0, 'Scyther', { energy: ['Grass', 'Grass'] }); put(S, 1, 'active', 0, 'Bulbasaur'); exec(S, { attack: 0, target: L(1, 'active', 0) }); return S.log.filter(e => e.k === 'damage')[0]; };
		const now = hit(E.RULES), was = hit(2);
		A(E.RULES >= 3 && now.type === 'Normal' && !/into/.test(now.msg) && was.type === 'Bug' && /\+20 Bug into Grass/.test(was.msg) && E.typeOf(1, card(id('Scyther')).attacks[0]) === 'Bug', 'Sharp Scythe is Normal in a new match (no bonus into Grass), and still Bug in a match recorded before the change', [now.msg, was.msg]);
	}
	// the printed card is kept, and nothing about it differs from the source
	const diff = [], ex = t => t.replace(/\{ex\}/g, 'ex').replace(/’/g, "'").replace(/−/g, '-').replace(/\s+/g, ' ').replace(/Benched (\w+) or \1 ex/g, 'Benched $1 and $1 ex').replace(/\b(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal) (Energy|Pokémon)/g, (m0, t, w) => '{' + ({ Fire: 'R', Darkness: 'D', Metal: 'M' }[t] || t[0]) + '} ' + w).replace(/ You may play only 1 Stadium card during your turn\..*?can't be played\./, '').replace(/^Discard Fire\{R\} Energy/, 'Discard a {R} Energy').replace(/takes damage from attacks and has no Weakness/, 'takes -20 damage from attacks and has no Weakness').trim();   // (and: a minus sign, a line break for a space, "or" for "and" between a Pokémon and its ex)   // (two printings of one card may write "ex" and "{ex}", or a curly apostrophe and a straight one)
	const FIXED = new Set(['A1-055', 'A1-071', 'A1-112', 'A2b-025', 'A2b-103']);   // (four cards the first source has wrong, corrected under rules revision 5: section 26)
	for (const s of src) {
		const c = card(s.id);
		if (FIXED.has(s.id)) continue;
		if (s.category === 'Pokemon') {
			if (c.hp !== s.hp || c.retreat !== (s.retreat || 0) || (s.evolveFrom ? c.evolvesFrom !== s.evolveFrom : c.stage === 0 ? c.evolvesFrom !== null : !c.evolvesFrom) || c.cardType !== s.types[0] || c.weakness !== (w0 => (w0 === 'Colorless' ? null : w0))((s.weaknesses || [])[0]?.type || null)) diff.push(s.id + ' stats');
			(s.attacks || []).forEach((a, i) => { const m = c.attacks[i]; if (!m || m.name !== a.name || ex(m.text) !== ex(a.effect || '') || m.cost.length !== (a.cost || []).length || (a.name === 'Spending Rush' ? '' : String(a.damage ?? '').replace(/\D/g, '')) !== (m.damage ? String(m.damage) : '')) diff.push(s.id + ' ' + a.name); });
			if ((s.abilities || [])[0] && ex(c.ability.text) !== ex(s.abilities[0].effect) && c.ability.text !== s.abilities[0].effect.replace('take a {', 'take 1 {')) diff.push(s.id + ' ability');   // (one reprint words "take 1 Energy" as "take a Energy": the same card)
		} else if (ex(c.text) !== ex(s.effect)) diff.push(s.id + ' text');
	}
	A(diff.length === 0, "every card's HP, costs, damage, evolution, Weakness and printed text are the source's, unchanged", diff.slice(0, 6));
	const noAdapt = [...atks.filter(([, a]) => a.text && (!a.adapted || !a.fx.length)).map(([c, a]) => c.name + ':' + a.name), ...CARDS.filter(c => (c.ability && !c.ability.adapted) || (c.kind !== 'pokemon' && !c.adapted)).map(c => c.name)];
	A(noAdapt.length === 0, 'every card with an effect has its structured effect and its adapted multiplayer text, beside the original', noAdapt.slice(0, 6));
	A(/Choose an opponent/.test(card(id('Red Card')).adapted) && /owner switches/.test(card(id('Sabrina')).adapted) && card(id('Sabrina')).text.startsWith("Switch out your opponent"), 'e.g. Red Card: "Choose an opponent…"; Sabrina: the owner chooses the replacement; the printed text is still there');
	{
		// why a wording differs is recorded beside it (the plan's "adaptation notes")
		const texts = [...atks.filter(([, a]) => a.text).map(([c, a]) => [c.name + ':' + a.name, a]), ...CARDS.filter(c => c.ability).map(c => [c.name, c.ability]), ...CARDS.filter(c => c.kind !== 'pokemon' && !c.fossil).map(c => [c.name, c])];
		const flat = s => String(s || '').replace(/\s+/g, ' ').trim();
		// (Paldean Wonders' records spell the types out, "a Fire Energy", and write "from and effects of" without its dashes: the same words)
		const W = { Grass: 'G', Fire: 'R', Water: 'W', Lightning: 'L', Psychic: 'P', Fighting: 'F', Darkness: 'D', Metal: 'M' }, spelled = s => s.replace(/\b(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal)(?= (?:Energy|Pokémon))/g, w => `{${W[w]}}`).replace(/damage from and effects of attacks/g, 'damage from-and effects of-attacks');
		const unexplained = texts.filter(([, x]) => flat(x.text) !== flat(x.adapted) && !x.note && !/^Discard a /.test(x.text) && flat(x.text).replace(/[’]/g, "'").replace(/[−–]/g, '-') !== flat(x.adapted) && spelled(flat(x.text)) !== flat(x.adapted)).map(([n]) => n);
		const noted = texts.filter(([, x]) => x.note).length;
		A(unexplained.length === 0 && noted >= 40 && texts.every(([, x]) => !x.note || flat(x.text) !== flat(x.adapted)), `every adapted wording that differs from the print says why (${noted} notes); an unchanged one has no note`, unexplained.slice(0, 5));
		A(/owner still chooses the replacement/.test(card(id('Sabrina')).note) && /you choose which one/.test(card(id('Red Card')).note) && card(id('Potion')).note === null, 'e.g. Sabrina: "its owner still chooses the replacement"; Red Card: "you choose which one"; Potion: unchanged, no note');
	}
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
			for (const p of S.players) { const total = p.deck.length + p.hand.length + p.discard.length + [...p.active, ...p.bench].filter(Boolean).reduce((a, k) => a + k.cards.length + (k.tool ? 1 : 0), 0) + (S.stadium && S.stadium.seat === p.seat ? 1 : 0); if (total !== 20) res.bad.push(`${g}: P${p.seat + 1} has ${total} cards`); }   // (a Stadium in play is on the table, not in a pile)
			if (S.over && S.over.winner != null && !(S.players[S.over.winner].points >= 3 || S.players.filter(p => !p.eliminated).length === 1)) res.bad.push(g + ': winner without a reason');
			if (E.view(S, 0).players.some(p => [...p.active, ...p.bench].filter(Boolean).some(k => k.dmg >= k.hp)))   // (the engine's own HP: tools, Abilities and Stadiums can raise it)
				 res.bad.push(g + ': a knocked out Pokémon is still in play');
		} catch (e) { res.bad.push(g + ': ' + e.message); }
	}
	A(res.n === 45 && res.over === 45 && res.bad.length === 0, `computer players finish 45 matches (15 each of 2, 3 and 4 players) through the same actions as a person: every replay matches, every card is accounted for, every winner has 3 points or is the last one in (turns ${Math.min(...res.turns)}-${Math.max(...res.turns)})`, res.bad.slice(0, 5));
	// the computer player's estimate is the engine's arithmetic
	const S = arena(); const me = put(S, 0, 'active', 0, 'Charmander', { energy: ['Fire'] }), foe = put(S, 1, 'active', 0, 'Bulbasaur'); const v = E.view(S, 0);
	A(expectedDamage(v, 0, v.players[0].active[0], card(id('Charmander')).attacks[0], v.players[1].active[0]) === 50, 'the computer player weighs type effectiveness the way the engine applies it (Ember into Bulbasaur: 50)');
}

// ===== 11. Mythical Island (A1a): each of its new effects, played =====
{
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const coins = S => S.log.filter(e => e.k === 'coin').length;
	const dmgLine = S => S.log.filter(e => e.k === 'damage').map(e => e.msg).join(' | ');
	// --- Serperior: each Grass Energy on your Grass Pokémon provides 2 (it does not stack) ---
	let S = arena(2); const cel = putId(S, 0, 'active', 0, 'A1a-003', { energy: ['Grass', 'Grass', 'Fire'] }); const cha = put(S, 0, 'active', 1, 'Charmander', { energy: ['Grass', 'Fire'] }); put(S, 1, 'active', 0, 'Snorlax');
	A(E.provided(S, cel).length === 3, 'without Serperior, three Energy provide three');
	putId(S, 0, 'bench', 0, 'A1a-006'); putId(S, 0, 'bench', 1, 'A1a-006');
	A(E.provided(S, cel).join() === 'Grass,Grass,Grass,Grass,Fire' && E.provided(S, cha).length === 2 && E.view(S, 0).players[0].active[0].provides.length === 5, 'with Serperior (even two of them), each Grass Energy on a Grass Pokémon provides 2: not other Energy, not other Pokémon; the view says so');
	const c0 = coins(S); exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(coins(S) - c0 === 5 && /does (0|50|100|150|200|250) damage/.test(dmgLine(S)), 'Celebi ex flips a coin for each Energy it is provided (5 here), 50 for each heads', coins(S) - c0);
	S = arena(2); const ser = putId(S, 0, 'active', 0, 'A1a-006', { energy: ['Grass', 'Grass'] }); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	A(E.attackBlock(S, 0, ser, card('A1a-006').attacks[0]) === null, 'two Grass Energy pay a four-Energy cost on a Grass Pokémon beside Serperior');
	E.apply(S, { t: 'retreat', seat: 0, slot: 0, bench: 0 });
	A(ser.energy.length === 1 && S.players[0].bench[0] === ser, 'its retreat cost of 2 is paid by discarding one such Energy');
	S = arena(2); const lone = putId(S, 0, 'active', 0, 'A1a-003', { energy: ['Grass'] }); put(S, 1, 'active', 0, 'Snorlax');
	A(/does not have the Energy/.test(E.attackBlock(S, 0, lone, card('A1a-003').attacks[0]) || ''), 'and without Serperior one Grass Energy does not pay for a two-Energy attack');
	// --- Volcarona: discard 2 Fire Energy, 80 to any one opposing Pokémon ---
	S = arena(2); const vol = putId(S, 0, 'active', 0, 'A1a-014', { energy: ['Fire', 'Fire', 'Water'] }); put(S, 1, 'active', 0, 'Snorlax'); const benchT = put(S, 1, 'bench', 1, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'bench', 1) });
	A(benchT.dmg === 80 && vol.energy.join() === 'Water', 'Volcanic Ash does 80 to a Benched Pokémon of choice and discards 2 Fire Energy', [benchT.dmg, vol.energy]);
	// --- Gyarados ex: a random Energy from among ALL Pokémon in play is discarded ---
	S = arena(3); putId(S, 0, 'active', 0, 'A1a-018', { energy: ['Water', 'Water', 'Water', 'Fire'] }); put(S, 1, 'active', 0, 'Snorlax', { energy: ['Fire'] }); put(S, 2, 'active', 0, 'Snorlax', { energy: ['Grass', 'Grass'] });
	const total = () => S.players.reduce((n, p) => n + [...p.active, ...p.bench].filter(Boolean).reduce((m, k) => m + k.energy.length, 0), 0), t0 = total();
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(total() === t0 - 1 && logHas(S, /loses a \w+ Energy/), 'Rampaging Whirlpool discards exactly one Energy from among every Pokémon in play (three players here)');
	// --- Vaporeon: move Water Energy from a Benched Water Pokémon to an Active one, as often as you like ---
	S = arena(2); const vap = putId(S, 0, 'active', 0, 'A1a-019'); const sq = put(S, 0, 'bench', 0, 'Squirtle', { energy: ['Water', 'Water', 'Fire'] }); put(S, 0, 'bench', 1, 'Charmander', { energy: ['Water'] }); put(S, 0, 'active', 1, 'Charmander'); put(S, 1, 'active', 0, 'Snorlax');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { bench: 0, at: L(0, 'active', 0) } });
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { bench: 0, at: L(0, 'active', 0) } });
	A(vap.energy.join() === 'Water,Water' && sq.energy.join() === 'Fire', 'Wash Out moves a Water Energy from a Benched Water Pokémon to an Active Water Pokémon, twice in one turn');
	A(/Benched Water Pokémon with a Water Energy/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { bench: 0, at: L(0, 'active', 0) } }))) && /Benched Water Pokémon/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { bench: 1, at: L(0, 'active', 0) } }))) && /Water Pokémon in an Active slot/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { bench: 0, at: L(0, 'active', 1) } }))), 'not from a Pokémon with no Water Energy left, not from a Benched Pokémon that is not Water, not to an Active Pokémon that is not Water');
	// --- Mew ex: copies an attack of an opposing ACTIVE Pokémon, whatever Energy that attack needs ---
	S = arena(2); putId(S, 0, 'active', 0, 'A1a-032', { energy: ['Psychic', 'Psychic', 'Psychic'] }); const foe = put(S, 1, 'active', 0, 'Charizard ex'); put(S, 1, 'bench', 0, 'Snorlax');
	const big = card(id('Charizard ex')).attacks.findIndex(a => a.name === 'Crimson Storm');
	exec(S, { attack: 1, target: L(1, 'active', 0), args: { from: L(1, 'active', 0), attack: big } });
	A(foe.dmg >= 180 && logHas(S, /copies Charizard ex's Crimson Storm/), 'Genome Hacking uses Crimson Storm with three Psychic Energy (no Energy check), as Mew ex\'s own attack', foe.dmg);
	S = arena(2); putId(S, 0, 'active', 0, 'A1a-032', { energy: ['Psychic', 'Psychic', 'Psychic'] }); const foe2 = put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Charizard ex');
	exec(S, { attack: 1, target: L(1, 'active', 0), args: { from: L(1, 'bench', 0), attack: big } });
	A(foe2.dmg === 0 && logHas(S, /Genome Hacking does nothing/), 'but not an attack of a Benched Pokémon');
	// --- Beheeyem: +20 for each Benched Pokémon of the Defending Pokémon's owner ---
	S = arena(3); putId(S, 0, 'active', 0, 'A1a-035', { energy: ['Psychic'] }); const mj = put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Rattata'); put(S, 1, 'bench', 3, 'Rattata'); put(S, 2, 'active', 0, 'Snorlax'); for (let i = 0; i < 4; i++) put(S, 2, 'bench', i, 'Rattata');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/base 50\b/.test(dmgLine(S)) && mj.dmg > 0, 'Mind Jack counts the Bench of the player it hits (2 there: 10 + 40), not another opponent\'s (4)', dmgLine(S));
	// --- Florges: heal 20 from each of your Pokémon ---
	S = arena(2); const fl = putId(S, 0, 'active', 0, 'A1a-038', { energy: ['Psychic', 'Psychic'], dmg: 30 }); const fb = put(S, 0, 'bench', 0, 'Snorlax', { dmg: 10 }); const fo = put(S, 1, 'active', 0, 'Snorlax', { dmg: 0 });
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(fl.dmg === 10 && fb.dmg === 0 && fo.dmg > 0, 'Bloomshine heals 20 from each of your own Pokémon (never below zero)', [fl.dmg, fb.dmg]);
	// --- Aerodactyl ex: opponents cannot evolve their ACTIVE Pokémon ---
	S = arena(2); put(S, 0, 'active', 0, 'Charmander'); put(S, 0, 'bench', 0, 'Charmander'); S.players[0].hand = [id('Charmeleon'), id('Charmeleon')]; putId(S, 1, 'bench', 0, 'A1a-046'); put(S, 1, 'active', 0, 'Snorlax');
	A(/stops your Active Pokémon evolving/.test(refused(() => E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) }))), 'with an opposing Aerodactyl ex in play, an Active Pokémon cannot evolve');
	E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'bench', 0) });
	A(card(S.players[0].bench[0].cards.at(-1)).name === 'Charmeleon', 'a Benched one still can');
	// --- Marshadow: +60 if one of yours was knocked out by an attack since your last turn ---
	S = arena(2); const rv = putId(S, 0, 'active', 0, 'A1a-047', { energy: ['Fighting', 'Fighting'] }); put(S, 0, 'active', 1, 'Rattata', { dmg: 30 }); put(S, 0, 'bench', 0, 'Snorlax'); const rt = put(S, 1, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] });
	exec(S);   // P1 passes; P2's Snorlax then knocks out the Rattata
	const sl = card(id('Snorlax')).attacks.length - 1; exec(S, { attack: sl, target: L(0, 'active', 1) });
	A(S.current === 0 && S.players[0].active[1] === null && S.players[0].flags.revenge === true && E.view(S, 0).players[0].flags.revenge === true, 'a Pokémon knocked out by an attack on the opponent\'s turn is remembered at its owner\'s next turn');
	const before = rt.dmg; exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/base 100\b/.test(S.log.filter(e => e.k === 'damage').at(-1).msg) && rt.dmg > before && rv.dmg === 0, 'Revenge then does 40 + 60', S.log.filter(e => e.k === 'damage').at(-1).msg);
	S = arena(2); putId(S, 0, 'active', 0, 'A1a-047', { energy: ['Fighting', 'Fighting'] }); put(S, 1, 'active', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/base 40\b/.test(dmgLine(S)), 'with no such Knock Out it does 40');
	// --- Weezing: the Defending Pokémon's next attack happens only on heads ---
	{
		let happened = 0, stopped = 0;
		for (let g = 0; g < 12; g++) {
			const T = arena(2, 'smoke' + g); putId(T, 0, 'active', 0, 'A1a-050', { energy: ['Darkness', 'Darkness'] }); const d = put(T, 1, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] });
			exec(T, { attack: 0, target: L(1, 'active', 0) });
			if (!d.fx.some(f => f.k === 'smokescreen')) { stopped = -99; break; }
			const n0 = T.log.length; exec(T, { attack: card(id('Snorlax')).attacks.length - 1, target: L(0, 'active', 0) });
			const after = T.log.slice(n0);
			if (after.some(e => /doesn't happen/.test(e.msg))) stopped++; else if (after.some(e => e.k === 'damage')) happened++;
			if (!after.some(e => e.k === 'coin' && /tries to attack/.test(e.msg))) stopped = -99;
			if (d.fx.some(f => f.k === 'smokescreen')) stopped = -99;   // it lasts that one turn
		}
		A(happened > 0 && stopped > 0 && happened + stopped === 12, 'Smokescreen: its owner flips when the Defending Pokémon attacks; on tails the attack does not happen (both seen over 12 matches), and it is over after that turn', [happened, stopped]);
	}
	// --- Tauros: +80 into a Pokémon ex ---
	S = arena(2); putId(S, 0, 'active', 0, 'A1a-060', { energy: ['Fire', 'Fire', 'Fire'] }); putId(S, 0, 'active', 1, 'A1a-060', { energy: ['Fire', 'Fire', 'Fire'] }); put(S, 1, 'active', 0, 'Charizard ex'); put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) }, { attack: 0, target: L(1, 'active', 1) });
	A(/base 120\b/.test(S.log.filter(e => e.k === 'damage')[0].msg) && /base 40\b/.test(S.log.filter(e => e.k === 'damage')[1].msg), 'Fighting Tackle does 40 + 80 into a Pokémon ex, and 40 into any other');
	// --- Chatot: shuffle your hand into your deck, draw as many cards as the Defending player holds ---
	S = arena(3); putId(S, 0, 'active', 0, 'A1a-062', { energy: ['Fire'] }); put(S, 1, 'active', 0, 'Snorlax'); put(S, 2, 'active', 0, 'Snorlax');
	S.players[0].hand = [id('Potion')]; S.players[1].hand = [id('Potion'), id('Potion'), id('Potion')]; S.players[2].hand = [id('Potion'), id('Potion'), id('Potion'), id('Potion'), id('Potion')];
	const deckN = S.players[0].deck.length; exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(S.players[0].hand.length === 3 && S.players[0].deck.length === deckN + 1 - 3, 'Mimic draws a card for each card in the hand of the player it is aimed at (3), not another opponent\'s (5)', S.players[0].hand.length);
	// --- Pokémon Flute: a Basic Pokémon from an opponent's discard pile onto their Bench ---
	S = arena(3); put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); put(S, 2, 'active', 0, 'Snorlax'); S.players[0].hand = ['A1a-064', 'A1a-064'];
	S.players[2].discard = [id('Potion'), id('Charmeleon'), id('Rattata')];
	A(/Basic Pokémon/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 2, pick: 1 } }))) && /Basic Pokémon/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 2, pick: 0 } }))) && /choose an opponent/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 0, pick: 2 } }))), 'Pokémon Flute takes only a Basic Pokémon, from an opponent\'s discard pile');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 2, pick: 2 } });
	A(S.players[2].bench[0] && card(S.players[2].bench[0].cards[0]).name === 'Rattata' && S.players[2].discard.length === 2 && S.players[0].hand.length === 1, 'the chosen one goes onto that player\'s Bench');
	for (let i = 0; i < 4; i++) put(S, 2, 'bench', i, 'Rattata'); S.players[2].discard.push(id('Rattata'));
	A(/Bench is full/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 2, pick: 2 } }))), 'not onto a full Bench');
	// --- Mythical Slab: the top card, if a Psychic Pokémon, to hand; otherwise to the bottom ---
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = ['A1a-065', 'A1a-065']; S.players[0].deck = [id('Mewtwo ex'), id('Charmander'), id('Potion')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.players[0].hand.includes(id('Mewtwo ex')) && S.players[0].deck.join() === [id('Charmander'), id('Potion')].join(), 'Mythical Slab: a Psychic Pokémon on top goes to the hand');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.players[0].deck.join() === [id('Potion'), id('Charmander')].join() && !S.players[0].hand.includes(id('Charmander')), 'anything else goes to the bottom of the deck');
	A(E.view(S, 1).log.every(e => !/Mewtwo ex|Charmander/.test(e.msg + (e.more || ''))) && E.view(S, 0).log.some(e => /Mewtwo ex/.test(e.more || '')), 'only its player is told which card it was');
	// --- Blue: until your next turn, your Pokémon take -10 from opposing attacks ---
	S = arena(2); const mine = put(S, 0, 'active', 0, 'Snorlax'); const theirs = put(S, 1, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); S.players[0].hand = ['A1a-067'];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(E.view(S, 1).players[0].guard === 10, 'Blue: everyone can see the cover on that player');
	exec(S); exec(S, { attack: sl, target: L(0, 'active', 0) });
	const hit = S.log.filter(e => e.k === 'damage').at(-1).msg;
	A(/-10 Blue/.test(hit) && mine.dmg === card(id('Snorlax')).attacks[sl].damage - 10 && !S.players[0].guard && theirs.dmg === 0, 'the opponent\'s attack does 10 less, and the cover ends at Blue\'s player\'s next turn', hit);
	// --- the computer player plays whole matches with the new cards ---
	{
		const decks = [{ deck: ['A1a-004', 'A1a-004', 'A1a-005', 'A1a-005', 'A1a-006', 'A1a-006', 'A1a-003', 'A1a-003', 'A1a-009', 'A1a-009', id('Erika'), id('Erika'), id('Poké Ball'), id('Poké Ball'), id("Professor's Research"), id("Professor's Research"), 'A1a-068', 'A1a-068', 'A1a-067', 'A1a-067'], energy: ['Grass'] },
			{ deck: ['A1a-032', 'A1a-032', 'A1a-033', 'A1a-033', 'A1a-034', 'A1a-034', 'A1a-035', 'A1a-035', 'A1a-036', 'A1a-036', 'A1a-037', 'A1a-037', 'A1a-038', 'A1a-038', 'A1a-065', 'A1a-065', 'A1a-066', 'A1a-066', id('Poké Ball'), id('Poké Ball')], energy: ['Psychic'] },
			{ deck: ['A1a-017', 'A1a-017', 'A1a-018', 'A1a-018', 'A1a-061', 'A1a-061', 'A1a-019', 'A1a-019', 'A1a-047', 'A1a-047', 'A1a-050', 'A1a-050', 'A1a-049', 'A1a-049', 'A1a-060', 'A1a-060', 'A1a-062', 'A1a-062', 'A1a-064', 'A1a-064'], energy: ['Water', 'Fighting', 'Darkness'] }];
		const bad = []; let over = 0;
		A(decks.every(d => E.deckError(d.deck, d.energy) === null), 'three Mythical Island decks are legal', decks.map(d => E.deckError(d.deck, d.energy)));
		for (let g = 0; g < 12; g++) {
			const config = { seed: 'isle' + g, players: [0, 1, 2].slice(0, 2 + (g % 2)).map(i => ({ name: 'P' + i, ai: true, ...decks[(i + g) % 3] })) }, S2 = E.createGame(config), actions = [];
			try {
				for (let step = 0; step < 3000 && !S2.over; step++) {
					const seat = S2.pending ? S2.pending.seat : S2.phase === 'setup' ? S2.players.find(p => !p.setup).seat : S2.current, banned = new Set();
					let done = false;
					for (let t = 0; t < 40 && !done; t++) { const a = nextAction(E.view(S2, seat), banned) || { t: 'execute', seat, commands: [null, null] }; try { E.apply(S2, a); actions.push(a); done = true; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); } }
					if (!done) { bad.push(g + ': stuck'); break; }
				}
				if (S2.over) over++;
				if (E.digest(E.replay(config, actions)) !== E.digest(S2)) bad.push(g + ': replay differs');
			} catch (e) { bad.push(g + ': ' + e.message); }
		}
		A(over === 12 && bad.length === 0, 'computer players finish 12 matches with Mythical Island decks (2 and 3 players), and every replay matches', { over, bad: bad.slice(0, 4) });
	}
}

// ===== 12. Space-Time Smackdown (A2): Pokémon Tools, Burned and Confused, discarded Energy, and each new effect, played =====
{
	const a2 = name => { const c = CARDS.find(x => x.set === 'A2' && x.name === name); if (!c) throw new Error('no A2 card ' + name); return c.id; };
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const P2 = (S, seat, zone, idx, name, o) => putId(S, seat, zone, idx, a2(name), o);
	const coins = S => S.log.filter(e => e.k === 'coin').length;
	const lastDmg = S => S.log.filter(e => e.k === 'damage').at(-1).msg;
	const allDmg = S => S.log.filter(e => e.k === 'damage').map(e => e.msg).join(' | ');
	const SN = () => card(id('Snorlax')).attacks.length - 1, snorlaxHit = () => card(id('Snorlax')).attacks[SN()].damage;
	let S, x, y, z;

	// --- Pokémon Tools ---
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [a2('Giant Cape'), a2('Rocky Helmet')];
	const hp0 = card(id('Snorlax')).hp;
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } });
	A(x.tool === a2('Giant Cape') && E.view(S, 1).players[0].active[0].hp === hp0 + 20 && E.view(S, 1).players[0].active[0].tool === a2('Giant Cape') && !S.players[0].discard.includes(a2('Giant Cape')), 'Giant Cape is attached to a Pokémon (not discarded) and it has +20 HP; everyone sees the tool');
	A(/already has a Pokémon Tool/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } }))), 'a Pokémon holds one Pokémon Tool');
	x.dmg = hp0 + 10; exec(S);
	A(S.players[0].active[0] === x && x.dmg === hp0 + 10, 'with Giant Cape it survives damage that would have knocked it out');
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax', { tool: a2('Giant Cape'), dmg: hp0 + 10 }); put(S, 0, 'bench', 0, 'Snorlax'); P2(S, 1, 'active', 0, 'Starly', { energy: ['Fire'] }); S.current = 1;
	exec(S, { attack: 0, target: L(0, 'active', 0) });
	A(S.players[0].active[0] !== x && S.players[0].discard.includes(a2('Giant Cape')) && logHas(S, /Giant Cape is discarded/), 'Pluck discards the Pokémon Tool before its damage: the Pokémon then has its own HP again');
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax', { tool: a2('Rocky Helmet') }); y = put(S, 1, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); S.current = 1;
	exec(S, { attack: SN(), target: L(0, 'active', 0) });
	A(y.dmg === 20 && x.dmg === snorlaxHit(), 'Rocky Helmet: an attacker that damages its holder in an Active slot takes 20');
	S = arena(2); x = put(S, 0, 'bench', 0, 'Snorlax', { tool: a2('Rocky Helmet') }); put(S, 0, 'active', 0, 'Snorlax'); y = P2(S, 1, 'active', 0, 'Azelf', { energy: ['Psychic'] }); S.current = 1;
	exec(S, { attack: 0, target: L(0, 'bench', 0) });
	A(x.dmg > 0 && y.dmg === 0, 'not when its holder is on the Bench');
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax', { tool: a2('Lum Berry') }); x.status.poisoned = { by: 1 }; x.status.asleep = { by: 1, turn: 9 }; put(S, 1, 'active', 0, 'Snorlax');
	exec(S);
	A(Object.keys(x.status).length === 0 && x.tool === null && x.dmg === 0 && S.players[0].discard.includes(a2('Lum Berry')), 'Lum Berry: at the end of the turn its holder recovers from every Special Condition (before Poison bites) and the berry is discarded');
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax', { tool: a2('Giant Cape'), energy: ['Fire', 'Fire'] }); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [id('Koga')];
	x = putId(S, 0, 'active', 0, id('Muk'), { tool: a2('Giant Cape'), energy: ['Darkness', 'Darkness'] });
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } });
	A(S.players[0].discard.includes(a2('Giant Cape')) && E.view(S, 0).players[0].energyDiscard.join() === 'Darkness,Darkness' && S.players[0].hand.includes(id('Muk')), 'a Pokémon returned to the hand leaves its tool in the discard pile and its Energy with the discarded Energy');
	S = arena(2); x = P2(S, 0, 'active', 0, 'Pachirisu ex', { energy: ['Lightning', 'Lightning'] }); y = P2(S, 0, 'active', 1, 'Rotom', { energy: ['Fire'] }); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'active', 1, 'Snorlax', { tool: a2('Giant Cape') });
	exec(S, { attack: 0, target: L(1, 'active', 0) }, { attack: 0, target: L(1, 'active', 1) });
	A(/base 40\b/.test(S.log.filter(e => e.k === 'damage')[0].msg) && /base 50\b/.test(S.log.filter(e => e.k === 'damage')[1].msg), 'Sparking Gadget without a tool does 40; Assault Laser into a Pokémon with a tool does 20 + 30');
	S = arena(2); P2(S, 0, 'active', 0, 'Pachirisu ex', { energy: ['Lightning', 'Lightning'], tool: a2('Giant Cape') }); put(S, 1, 'active', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/base 80\b/.test(lastDmg(S)), 'with a tool attached, Sparking Gadget does 40 + 40');

	// --- Burned and Confused ---
	S = arena(2); P2(S, 0, 'active', 0, 'Magmortar', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); x = put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	const afterHit = card(a2('Magmortar')).attacks[0].damage;
	A(x.dmg >= afterHit + 20 && logHas(S, /takes 20 damage from its Burn/) && S.log.some(e => e.k === 'coin' && /is Burned/.test(e.msg)) && (x.status.burned ? !logHas(S, /no longer Burned/) : logHas(S, /no longer Burned/)), 'Burned: 20 damage at the Pokémon Checkup, then a coin: heads and it recovers', [x.dmg, Object.keys(x.status)]);
	{
		let went = 0, failed = 0;
		for (let g = 0; g < 12; g++) {
			const T = arena(2, 'conf' + g); P2(T, 0, 'active', 0, 'Kricketune', { energy: ['Grass', 'Grass'] }); const d = put(T, 1, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); put(T, 1, 'bench', 0, 'Snorlax');
			exec(T, { attack: 0, target: L(1, 'active', 0) });
			if (!d.status.confused) { failed = -99; break; }
			const n0 = T.log.length; exec(T, { attack: SN(), target: L(0, 'active', 0) });
			const after = T.log.slice(n0);
			if (after.some(e => /is Confused\.$/.test(e.msg) && e.k === 'fail')) failed++; else if (after.some(e => e.k === 'damage')) went++;
		}
		A(went > 0 && failed > 0 && went + failed === 12, 'Confused: its owner flips when it attacks; on tails the attack does not happen (both seen over 12 matches)', [went, failed]);
	}
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax'); x.status.asleep = { by: 1, turn: 1 }; P2(S, 1, 'active', 0, 'Kricketune', { energy: ['Grass', 'Grass'] }); S.current = 1;
	exec(S, { attack: 0, target: L(0, 'active', 0) });
	A(x.status.confused && !x.status.asleep, 'Confused replaces Asleep (as Asleep and Paralyzed replace each other)');

	// --- "during your next turn" ---
	S = arena(2); x = P2(S, 0, 'active', 0, 'Torterra', { energy: ['Grass', 'Grass', 'Grass', 'Grass'] }); put(S, 1, 'active', 0, 'Snorlax', { tool: a2('Giant Cape') }); put(S, 1, 'bench', 0, 'Snorlax'); put(S, 1, 'bench', 1, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) }); exec(S);
	A(S.current === 0 && /can't use Frenzy Plant/.test(E.attackBlock(S, 0, x, card(a2('Torterra')).attacks[0]) || ''), 'Frenzy Plant cannot be used on its user\'s next turn');
	exec(S); exec(S);
	A(S.current === 0 && E.attackBlock(S, 0, x, card(a2('Torterra')).attacks[0]) === null, 'and can again the turn after');
	S = arena(2); x = P2(S, 0, 'active', 0, 'Leafeon', { energy: ['Grass', 'Grass'] }); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax'); put(S, 1, 'bench', 1, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) }); exec(S);
	A(/can't attack/.test(E.attackBlock(S, 0, x, card(a2('Leafeon')).attacks[0]) || ''), 'Leafy Cyclone: its user cannot attack on its next turn');
	S = arena(2); x = P2(S, 0, 'active', 0, 'Togekiss', { energy: ['Psychic', 'Psychic'] }); y = put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) }); exec(S); exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/base 120\b/.test(lastDmg(S)), 'Overdrive Smash does 60, and 60 + 60 on its user\'s next turn', lastDmg(S));

	// --- attacks ---
	S = arena(3); P2(S, 0, 'active', 0, 'Empoleon', { energy: ['Water', 'Water', 'Water'] }); put(S, 1, 'active', 0, 'Snorlax'); x = put(S, 1, 'bench', 0, 'Snorlax'); put(S, 2, 'active', 0, 'Snorlax'); y = put(S, 2, 'bench', 2, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0), args: { also: L(2, 'bench', 2) } });
	A(y.dmg > 0 && x.dmg === 0, 'Aqua Jet\'s second hit goes to the chosen Benched Pokémon, of any opponent');
	S = arena(2); P2(S, 0, 'active', 0, 'Snover', { energy: ['Water'] }); P2(S, 0, 'active', 1, 'Snover', { energy: ['Water'] }); put(S, 1, 'active', 0, 'Machop'); put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) }, { attack: 0, target: L(1, 'active', 1) });
	A(/base 40\b/.test(S.log.filter(e => e.k === 'damage')[0].msg) && /base 10\b/.test(S.log.filter(e => e.k === 'damage')[1].msg), 'Ice Shard does 10 + 30 into a Fighting-type card, 10 into another');
	S = arena(2); x = P2(S, 0, 'active', 0, 'Palkia ex', { energy: ['Water', 'Water', 'Water', 'Fire'] }); put(S, 1, 'active', 0, 'Snorlax'); y = put(S, 1, 'bench', 0, 'Snorlax'); z = put(S, 1, 'bench', 3, 'Snorlax');
	exec(S, { attack: 1, target: L(1, 'active', 0) });
	A(x.energy.join() === 'Fire' && y.dmg > 0 && z.dmg > 0 && E.view(S, 0).players[0].energyDiscard.join() === 'Water,Water,Water', 'Dimensional Storm discards 3 Water Energy (they are kept as discarded Energy) and hits each Benched Pokémon');
	S = arena(2); P2(S, 0, 'active', 0, 'Manaphy', { energy: ['Water'] }); x = put(S, 0, 'bench', 0, 'Snorlax'); y = put(S, 0, 'bench', 1, 'Snorlax'); z = put(S, 0, 'bench', 3, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	exec(S, { attack: 0, args: { spread: [3, 0] } });
	A(z.energy.join() === 'Water' && x.energy.join() === 'Water' && y.energy.length === 0, 'Oceanic Gift attaches a Water Energy to each of the two Benched Pokémon chosen');
	S = arena(2); x = P2(S, 0, 'active', 0, 'Luxray', { energy: ['Lightning', 'Lightning', 'Lightning', 'Fire'] }); put(S, 1, 'active', 0, 'Snorlax'); y = put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'bench', 0) });
	A(y.dmg === 120 && x.energy.join() === 'Fire', 'Volt Bolt discards all Lightning Energy and does 120 to any one opposing Pokémon');
	S = arena(2); P2(S, 0, 'active', 0, 'Uxie', { energy: ['Psychic'] }); x = P2(S, 0, 'bench', 0, 'Mesprit'); y = P2(S, 0, 'bench', 1, 'Azelf'); put(S, 1, 'active', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0), args: { at: L(0, 'bench', 1) } });
	A(y.energy.join() === 'Psychic' && x.energy.length === 0, 'Mind Boost attaches a Psychic Energy to the chosen Mesprit or Azelf');
	S = arena(2); x = P2(S, 0, 'active', 0, 'Mesprit', { energy: ['Psychic', 'Psychic', 'Psychic'] }); P2(S, 0, 'bench', 0, 'Uxie'); put(S, 1, 'active', 0, 'Snorlax');
	A(/needs Uxie and Azelf/.test(E.attackBlock(S, 0, x, card(a2('Mesprit')).attacks[0]) || ''), 'Supreme Blast needs both Uxie and Azelf on the Bench');
	P2(S, 0, 'bench', 1, 'Azelf'); exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(x.energy.length === 0 && /base 160\b/.test(lastDmg(S)), 'with them it does 160 and discards all its Energy');
	S = arena(2); P2(S, 0, 'active', 0, 'Rhyperior', { energy: ['Fighting', 'Fighting', 'Fighting', 'Fire'] }); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax');
	const dn = S.players[0].deck.length, ds = S.players[0].discard.length; exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(S.players[0].deck.length === dn - 3 - 0 && S.players[0].discard.length === ds + 3, 'Mountain Swing discards the top 3 cards of its user\'s deck');
	S = arena(2); P2(S, 0, 'active', 0, 'Gliscor', { energy: ['Fighting'] }); P2(S, 0, 'active', 1, 'Croagunk', { energy: ['Darkness', 'Darkness'] }); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax', { dmg: 0 }); put(S, 1, 'active', 1, 'Snorlax');
	const cn = coins(S); exec(S, { attack: 0, target: L(1, 'active', 0) }, { attack: 0, target: L(1, 'active', 1) });
	A(coins(S) - cn === 2 + 3 && /base (20|40|60)\b/.test(S.log.filter(e => e.k === 'damage')[0].msg), 'Acrobatics flips 2 coins (+20 each); Group Beatdown flips one for each Pokémon its player has in play (3)', coins(S) - cn);
	S = arena(2); x = P2(S, 0, 'active', 0, 'Rampardos', { energy: ['Fighting'] }); put(S, 1, 'active', 0, 'Rattata'); put(S, 1, 'bench', 0, 'Snorlax'); y = put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(x.dmg === 50 && S.players[0].points === 1, 'Head Smash knocks out its target and its user takes 50');
	S = arena(2); x = P2(S, 0, 'active', 0, 'Rampardos', { energy: ['Fighting'] }); put(S, 1, 'active', 0, 'Snorlax', { tool: a2('Giant Cape') });
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(x.dmg === 0, 'no recoil when the target survives');
	S = arena(3); P2(S, 0, 'active', 0, 'Spiritomb', { energy: ['Fire'] }); x = put(S, 1, 'active', 0, 'Snorlax'); y = put(S, 1, 'bench', 2, 'Snorlax'); z = put(S, 2, 'active', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(x.dmg > 0 && y.dmg > 0 && z.dmg === 0, 'Swirling Disaster hits every Pokémon of the opponent it is aimed at, and nobody else');
	S = arena(2); x = P2(S, 0, 'active', 0, 'Dialga ex', { energy: ['Metal', 'Metal'] }); y = put(S, 0, 'bench', 1, 'Snorlax'); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0), args: { bench: 1 } });
	A(y.energy.join() === 'Metal,Metal', 'Metallic Turbo attaches 2 Metal Energy to the chosen Benched Pokémon');
	S = arena(2); P2(S, 0, 'active', 0, 'Porygon-Z', { energy: ['Fire', 'Fire', 'Fire'] }); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax'); S.players[1].zone.next = 'Nope';
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal'].includes(S.players[1].zone.cur || S.players[1].zone.next) && logHas(S, /next Energy generated for P2 will be/), 'Buggy Beam changes the next Energy generated for the Defending Pokémon\'s owner to one of the eight types');
	S = arena(2); P2(S, 0, 'active', 0, 'Bidoof', { energy: ['Fire', 'Fire'] }); x = put(S, 1, 'active', 0, 'Snorlax', { dmg: 30 });
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	const left0 = hp0 - 30;
	A(hp0 - x.dmg === Math.floor(left0 / 2), 'Super Fang halves the remaining HP, rounded down', [hp0, x.dmg]);
	S = arena(2); x = P2(S, 0, 'active', 0, 'Regigigas', { energy: ['Fire', 'Fire', 'Fire', 'Fire'], dmg: 70 }); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/base 120\b/.test(lastDmg(S)), 'Raging Hammer does 50 plus the damage on its user (70)');
	S = arena(2); x = P2(S, 0, 'active', 0, 'Yanmega ex', { energy: ['Fire', 'Water', 'Grass'] }); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(x.energy.length === 2 && E.view(S, 0).players[0].energyDiscard.length === 1, 'Air Slash discards one random Energy from its user');
	{
		let back = 0, stay = 0;
		for (let g = 0; g < 12; g++) { const T = arena(2, 'fan' + g); P2(T, 0, 'active', 0, 'Fan Rotom', { energy: ['Fire', 'Fire'] }); put(T, 1, 'active', 0, 'Snorlax', { energy: ['Fire'], tool: a2('Giant Cape') }); put(T, 1, 'bench', 0, 'Snorlax'); const h0 = T.players[1].hand.length;
			exec(T, { attack: 0, target: L(1, 'active', 0) });
			if (T.players[1].hand.length === h0 + 1 + 1 && T.players[1].discard.includes(a2('Giant Cape')) && T.players[1].energyDiscard.join() === 'Fire') back++; else if (T.players[1].active[0] && T.players[1].active[0].tool) stay++; }
		A(back > 0 && stay > 0 && back + stay === 12, 'Spin Storm: on heads the Defending Pokémon goes to its owner\'s hand (its tool and Energy are discarded); on tails nothing', [back, stay]);
	}
	// Interrupt: the attacker is shown the hand and chooses a card; nobody else sees it
	S = arena(2); P2(S, 0, 'active', 0, 'Purugly', { energy: ['Fire', 'Fire', 'Fire'] }); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax'); S.players[1].hand = [id('Potion'), id('Charmander'), id('Giovanni')];
	const deck1 = S.players[1].deck.length; exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(S.pending && S.pending.kind === 'handPick' && S.pending.seat === 0 && E.view(S, 0).pending.cards.join() === S.players[1].hand.join() && E.view(S, 1).pending.cards === null && E.view(S, null).pending.cards === null, 'Interrupt waits for its user to choose from the revealed hand; only its user is sent the cards');
	A(/not yours/.test(refused(() => E.apply(S, { t: 'choose', seat: 1, pick: 0 }))), 'the other player cannot answer for them');
	E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(S.players[1].hand.slice(0, 2).join() === [id('Potion'), id('Giovanni')].join() && S.players[1].deck.length === deck1 && logHas(S, /shuffles Charmander from P2's hand into their deck/) && S.current === 1 && !S.pending, 'the chosen card is shuffled into its owner\'s deck, and the turn then passes');

	// --- Abilities ---
	S = arena(2); x = P2(S, 0, 'active', 0, 'Piloswine'); y = P2(S, 0, 'active', 1, 'Piloswine'); put(S, 1, 'active', 0, 'Charmander', { energy: ['Fire'] }); put(S, 1, 'active', 1, 'Rattata', { energy: ['Fire'] }); S.current = 1;
	exec(S, { attack: 0, target: L(0, 'active', 0) }, { attack: 0, target: L(0, 'active', 1) });
	A(/-20 Thick Fat/.test(S.log.filter(e => e.k === 'damage')[0].msg) && !/Thick Fat/.test(S.log.filter(e => e.k === 'damage')[1].msg), 'Thick Fat takes 20 off an attack from a Fire-type card, nothing off a Colorless one');
	S = arena(2); x = P2(S, 0, 'active', 0, 'Regice'); P2(S, 1, 'active', 0, 'Magmortar', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); S.current = 1;
	exec(S, { attack: 0, target: L(0, 'active', 0) });
	A(x.dmg > 0 && !x.status.burned, 'Crystal Body: the attack\'s damage lands, its effect (Burned) does not');
	S = arena(2); x = P2(S, 0, 'bench', 0, 'Dusknoir'); y = put(S, 0, 'active', 0, 'Snorlax', { dmg: 60, hitBy: 1 }); z = put(S, 0, 'active', 1, 'Snorlax', { dmg: 60 }); put(S, 1, 'active', 0, 'Snorlax');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { from: L(0, 'active', 0) } });
	A(x.dmg === 60 && y.dmg === 0 && S.players[0].bench[0] === x, 'Shadow Void moves all the damage of one of your Pokémon to Dusknoir');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { from: L(0, 'active', 1) } });
	A(S.players[0].bench[0] === x && x.dmg === 120, 'again in the same turn (as often as you like)');
	S = arena(2); x = P2(S, 0, 'bench', 0, 'Dusknoir', { dmg: 100 }); y = put(S, 0, 'active', 0, 'Snorlax', { dmg: 60, hitBy: 1 }); put(S, 1, 'active', 0, 'Snorlax');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { from: L(0, 'active', 0) } });
	A(S.players[0].bench[0] === null && S.players[1].points === 1, 'if that knocks Dusknoir out, the point goes to the opponent whose attack did that damage');
	S = arena(2); x = P2(S, 0, 'active', 0, 'Giratina', { energy: ['Psychic'] }); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	A(E.view(S, 0).players[0].active[0].retreat === 0 && card(a2('Giratina')).retreat > 0, 'Levitate: with Energy attached it has no Retreat Cost (the view says so)');
	E.apply(S, { t: 'retreat', seat: 0, slot: 0, bench: 0 });
	A(x.energy.length === 1 && S.players[0].bench[0] === x, 'it retreats without discarding Energy');
	S = arena(2); x = P2(S, 0, 'active', 0, 'Giratina'); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	A(/retreating costs/.test(refused(() => E.apply(S, { t: 'retreat', seat: 0, slot: 0, bench: 0 }))), 'with no Energy it has its Retreat Cost');
	S = arena(2); P2(S, 0, 'active', 0, 'Riolu', { energy: ['Fighting'] }); P2(S, 0, 'bench', 0, 'Lucario'); P2(S, 0, 'bench', 1, 'Lucario'); put(S, 0, 'active', 1, 'Rattata', { energy: ['Fire'] }); put(S, 1, 'active', 0, 'Snorlax', { dmg: 0 }); y = put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) }, { attack: 0, target: L(1, 'active', 0) });
	A((S.log.filter(e => e.k === 'damage')[0].msg.match(/\+20 Fighting Coach/g) || []).length === 2 && !/Fighting Coach/.test(S.log.filter(e => e.k === 'damage')[1].msg), 'Fighting Coach: +20 for each Lucario to a Fighting-type card\'s attack, nothing for another type\'s');
	S = arena(3); x = P2(S, 0, 'active', 0, 'Darkrai ex'); y = put(S, 1, 'active', 0, 'Snorlax'); z = put(S, 2, 'active', 1, 'Snorlax'); put(S, 2, 'active', 0, 'Snorlax'); S.players[0].zone.cur = 'Darkness';
	E.apply(S, { t: 'attach', seat: 0, at: L(0, 'active', 0), target: L(2, 'active', 1) });
	A(z.dmg === 20 && y.dmg === 0 && logHas(S, /Nightmare Aura does 20 damage/), 'Nightmare Aura: attaching a Darkness Energy from the Energy Zone does 20 to the opposing Active Pokémon chosen');
	S = arena(3); P2(S, 0, 'active', 0, 'Darkrai ex'); y = put(S, 1, 'active', 0, 'Rattata', { dmg: card(id('Rattata')).hp - 10 }); put(S, 1, 'bench', 0, 'Snorlax'); put(S, 2, 'active', 0, 'Snorlax'); S.players[0].zone.cur = 'Darkness';
	E.apply(S, { t: 'attach', seat: 0, at: L(0, 'active', 0) });
	A(S.pending && S.pending.kind === 'pickTarget' && S.pending.seat === 0 && S.pending.locs.length === 2 && y.dmg === card(id('Rattata')).hp - 10, 'with no choice sent and more than one opposing Active Pokémon, its player is asked');
	E.apply(S, { t: 'choose', seat: 0, pick: 0 });
	A(S.players[1].active[0] !== y && S.players[0].points === 1 && !S.pending, 'the one chosen takes the 20, and a Knock Out by it is scored');
	S = arena(2); P2(S, 0, 'active', 0, 'Darkrai ex'); y = put(S, 1, 'active', 0, 'Snorlax'); S.players[0].zone.cur = 'Fire';
	E.apply(S, { t: 'attach', seat: 0, at: L(0, 'active', 0) });
	A(y.dmg === 0, 'not for an Energy of another type');
	{
		let cut = 0, full = 0;
		for (let g = 0; g < 12; g++) { const T = arena(2, 'grill' + g); const b = P2(T, 0, 'active', 0, 'Bastiodon'); put(T, 1, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); T.current = 1; exec(T, { attack: SN(), target: L(0, 'active', 0) }); if (/-100 Guarded Grill/.test(lastDmg(T)) && b.dmg === 0) cut++; else if (b.dmg > 0) full++; }
		A(cut > 0 && full > 0 && cut + full === 12, 'Guarded Grill: its owner flips when it is damaged by an attack; heads takes 100 off (both seen over 12 matches)', [cut, full]);
	}
	S = arena(2); P2(S, 0, 'active', 0, 'Garchomp'); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [id('Potion'), id('Giovanni')];
	const g0 = S.players[0].deck.length; E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { hand: 0 } });
	A(S.players[0].discard.includes(id('Potion')) && S.players[0].hand.length === 2 && S.players[0].deck.length === g0 - 1 && /already been used/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { hand: 0 } }))), 'Reckless Shearing: discard a card to draw a card, once a turn');

	// --- Trainers ---
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [a2('Pokémon Communication'), id('Charmander'), id('Potion')]; S.players[0].deck = [id('Giovanni'), id('Squirtle'), id('Potion')];
	A(/Pokémon in your hand/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { pick: 2 } }))) && /Pokémon in your hand/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { pick: 0 } }))), 'Pokémon Communication needs a Pokémon from the hand');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { pick: 1 } });
	A(S.players[0].hand.includes(id('Squirtle')) && !S.players[0].hand.includes(id('Charmander')) && S.players[0].deck.includes(id('Charmander')) && S.players[0].deck.length === 3, 'it trades that Pokémon for a random Pokémon in the deck');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); x = put(S, 1, 'active', 0, 'Snorlax'); y = put(S, 1, 'active', 1, 'Rattata'); z = put(S, 1, 'bench', 2, 'Snorlax', { dmg: 10 }); put(S, 1, 'bench', 0, 'Snorlax'); S.players[0].hand = [a2('Cyrus')];
	A(/has damage on it/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { target: L(1, 'active', 1), bench: 0 } }))), 'Cyrus takes only a Benched Pokémon that has damage on it');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { target: L(1, 'active', 1), bench: 2 } });
	A(S.players[1].active[1] === z && S.players[1].bench[2] === y && S.players[1].active[0] === x, 'it trades places with the Active Pokémon chosen');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [a2('Team Galactic Grunt')]; S.players[0].deck = [id('Potion'), a2('Croagunk'), id('Charmander')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.players[0].hand.includes(a2('Croagunk')) && S.players[0].deck.length === 2, 'Team Galactic Grunt fetches a Glameow, Stunky or Croagunk from the deck');
	S = arena(2); x = P2(S, 0, 'active', 0, 'Luxray', { energy: ['Lightning', 'Lightning', 'Lightning'] }); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax'); put(S, 1, 'bench', 1, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'bench', 0) }); exec(S); S.players[0].hand = [a2('Volkner')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } });
	A(x.energy.join() === 'Lightning,Lightning' && S.players[0].energyDiscard.join() === 'Lightning', 'Volkner attaches 2 of the Lightning Energy Luxray discarded back onto it (the third stays discarded)');
	S = arena(2); x = put(S, 0, 'active', 1, 'Snorlax'); y = put(S, 0, 'bench', 1, 'Snorlax', { energy: ['Fire', 'Water'] }); put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [a2('Dawn')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { bench: 1, at: L(0, 'active', 1), energy: 1 } });
	A(x.energy.join() === 'Water' && y.energy.join() === 'Fire', 'Dawn moves the chosen Energy from a Benched Pokémon to the chosen Active Pokémon');
	S = arena(3); put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); put(S, 2, 'active', 0, 'Snorlax'); S.players[0].hand = [a2('Mars')]; S.players[2].points = 2; S.players[2].hand = [id('Potion'), id('Potion'), id('Potion'), id('Potion')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 2 } });
	A(S.players[2].hand.length === 1, 'Mars: the chosen opponent shuffles their hand away and draws one card for each point they still need (1 of 3)');

	// --- the computer player plays whole matches with the set ---
	{
		const N = n => a2(n), two = l => l.flatMap(v => [v, v]);
		const decks = [{ deck: two([N('Dialga ex'), N('Skarmory'), N('Shieldon'), N('Bastiodon'), a2('Armor Fossil'), N('Heatran'), N('Giant Cape'), N('Rocky Helmet'), N('Dawn'), id("Professor's Research")]), energy: ['Metal'] },
			{ deck: two([N('Palkia ex'), N('Manaphy'), N('Piplup'), N('Prinplup'), N('Empoleon'), N('Regice'), N('Lum Berry'), N('Cyrus'), N('Mars'), N('Pokémon Communication')]), energy: ['Water'] },
			{ deck: two([N('Darkrai ex'), N('Croagunk'), N('Toxicroak'), N('Spiritomb'), N('Glameow'), N('Purugly'), N('Starly'), N('Team Galactic Grunt'), N('Giant Cape'), id('Poké Ball')]), energy: ['Darkness'] },
			{ deck: two([N('Shinx'), N('Luxio'), N('Luxray'), N('Pachirisu ex'), N('Rotom'), N('Togepi'), N('Togetic'), N('Togekiss'), N('Volkner'), N('Rocky Helmet')]), energy: ['Lightning', 'Psychic'] }];
		A(decks.every(d => E.deckError(d.deck, d.energy) === null), 'four Space-Time Smackdown decks are legal', decks.map(d => E.deckError(d.deck, d.energy)));
		const bad = []; let over = 0, tools = 0, burns = 0;
		for (let g = 0; g < 16; g++) {
			const config = { seed: 'smack' + g, rules: E.RULES, players: [0, 1, 2, 3].slice(0, 2 + (g % 3)).map(i => ({ name: 'P' + i, ai: true, ...decks[(i + g) % 4] })) }, S2 = E.createGame(config), actions = [];
			try {
				for (let step = 0; step < 4000 && !S2.over; step++) {
					const seat = S2.pending ? S2.pending.seat : S2.phase === 'setup' ? S2.players.find(p => !p.setup).seat : S2.current, banned = new Set();
					let done = false;
					for (let t = 0; t < 40 && !done; t++) { const a = nextAction(E.view(S2, seat), banned) || { t: 'execute', seat, commands: [null, null] }; try { E.apply(S2, a); actions.push(a); done = true; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); } }
					if (!done) { bad.push(g + ': stuck'); break; }
					if (S2.players.some(p => [...p.active, ...p.bench].filter(Boolean).some(k => k.tool))) tools++;
				}
				if (S2.over) over++;
				if (E.digest(E.replay(config, actions)) !== E.digest(S2)) bad.push(g + ': replay differs');
				if (E.view(S2, 0).players.some(p => [...p.active, ...p.bench].filter(Boolean).some(k => k.dmg >= k.hp))) bad.push(g + ': a knocked out Pokémon is still in play');
			} catch (e) { bad.push(g + ': ' + e.message); }
		}
		A(over === 16 && bad.length === 0 && tools > 0, 'computer players finish 16 matches with Space-Time Smackdown decks (2, 3 and 4 players), attaching Pokémon Tools, and every replay matches', { over, tools, bad: bad.slice(0, 4) });
	}
}

// ===== 13. forms, and the plays the computer player used to leave in its hand =====
{
	const a2 = name => CARDS.find(x => x.set === 'A2' && x.name === name).id;
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	// a card that is a form in the games has that form's types and names that form's sprite
	const forms = CARDS.filter(c => /Rotom$/.test(c.name) && c.name !== 'Rotom');
	A(forms.length === 5 && forms.every(c => c.sprite && c.sprite !== `s${c.dex * 32}.png` && fs.existsSync(path.join(ROOT, 'overworld/data/pokemon', c.sprite))) && new Set(forms.map(c => c.sprite)).size === 5 && !card(a2('Rotom')).sprite && card(a2('Wash Rotom')).combatTypes.join() === 'Electric,Water',
		'the five Rotom forms each have their own sprite on this site (plain Rotom keeps its own) and their form\'s types', forms.map(c => c.name + ':' + c.sprite));
	const worm = CARDS.filter(c => c.name === 'Wormadam').map(c => c.cardType + ':' + c.combatTypes.join('+') + ':' + (c.sprite ? 'own' : 'base')).sort().join(' ');
	A(worm === 'Fighting:Bug+Ground:own Grass:Bug+Grass:base Metal:Bug+Steel:own', 'the three Wormadam are the three cloaks: the Fighting-type card is Bug and Ground, the Metal-type card Bug and Steel', worm);
	// the computer player's turn: each of these is the first thing it does, and the engine accepts it
	// (as the game drives it: a move the engine refuses is set aside and the next one asked for)
	const move = S => { const banned = new Set(); for (let t = 0; t < 12; t++) { const a = nextAction(E.view(S, 0), banned); if (!a) return null; try { E.apply(S, a); return a; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); } } return null; };
	const peek = S => nextAction(E.view(S, 0), new Set());   // (the first move it would make)
	const plays = (S, want, msg) => { const a = move(S); A(!!a && want(a), msg, a); return a; };
	const quiet = S => { S.players[0].zone.cur = null; S.players[0].flags.attached = true; };
	let S = arena(2); quiet(S); put(S, 0, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'active', 1, 'Snorlax', { dmg: 20 }); put(S, 1, 'bench', 0, 'Snorlax', { dmg: 10 }); const prey = put(S, 1, 'bench', 2, 'Rattata', { dmg: 10 }); S.players[0].hand = [a2('Cyrus')];
	plays(S, a => a.t === 'trainer' && a.args.bench === 2 && a.args.target.seat === 1 && a.args.target.idx === 0, 'Cyrus: it brings up the damaged Benched Pokémon its attack can knock out, in place of the healthier Active Pokémon');
	A(S.players[1].active[0] === prey, 'and that Pokémon is now in front of it');
	S = arena(2); quiet(S); put(S, 0, 'active', 0, 'Charmander'); put(S, 0, 'active', 1, 'Snorlax'); put(S, 0, 'bench', 1, 'Snorlax', { energy: ['Water', 'Fire'] }); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [a2('Dawn')];
	plays(S, a => a.t === 'trainer' && a.args.bench === 1 && a.args.energy === 1 && a.args.at.zone === 'active', 'Dawn: it moves the Energy (the Fire one) that lets its Active Pokémon attack');
	S = arena(2); quiet(S); put(S, 0, 'active', 0, 'Charmander', { energy: ['Fire'] }); put(S, 0, 'active', 1, 'Rattata', { energy: ['Fire'] }); put(S, 0, 'bench', 1, 'Snorlax', { energy: ['Water'] }); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [a2('Dawn')];
	A((peek(S) || {}).t !== 'trainer', 'it keeps Dawn when no Energy on the Bench would unlock an attack');
	S = arena(2); quiet(S); put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [a2('Pokémon Communication'), id('Charmander'), id('Charizard ex')]; S.players[0].deck = [id('Squirtle'), id('Potion')];
	S.players[0].active[1] = E.makePoke(S, id('Snorlax')); for (let i = 0; i < 4; i++) put(S, 0, 'bench', i, 'Snorlax');   // (no room to play the Charmander first)
	plays(S, a => a.t === 'trainer' && a.args.pick === 2, 'Pokémon Communication: it trades away the Stage 2 it has nothing to evolve from');
	S = arena(2); quiet(S); putId(S, 0, 'active', 0, a2('Azelf'), { energy: ['Psychic'] }); put(S, 1, 'active', 0, 'Snorlax'); S.players[1].discard = [id('Potion'), id('Rattata')]; S.players[0].hand = ['A1a-064'];
	plays(S, a => a.t === 'trainer' && a.args.opp === 1 && a.args.pick === 1, 'Pokémon Flute: with an attack that reaches the Bench, it puts a weak Basic Pokémon back onto an opponent\'s Bench');
	S = arena(2); quiet(S); put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); S.players[1].discard = [id('Rattata')]; S.players[0].hand = ['A1a-064'];
	A((peek(S) || {}).t !== 'trainer', 'without such an attack it keeps the Flute');
	S = arena(2); quiet(S); S.players[0].hand = []; const vap = putId(S, 0, 'active', 0, 'A1a-019', { energy: ['Water', 'Fire'] }); put(S, 0, 'active', 1, 'Rattata', { energy: ['Fire'] }); put(S, 0, 'bench', 0, 'Squirtle', { energy: ['Water', 'Water'] }); put(S, 1, 'active', 0, 'Snorlax');
	plays(S, a => a.t === 'ability' && a.args.bench === 0 && a.args.at.zone === 'active', 'Vaporeon: it moves a Water Energy up from the Bench when that pays for an attack');
	A(vap.energy.length === 3 && (peek(S) || {}).t !== 'ability', 'and stops once the attack is paid for');
	S = arena(2); quiet(S); S.players[0].hand = []; const hurt = put(S, 0, 'active', 0, 'Charmander', { dmg: 40 }); put(S, 0, 'active', 1, 'Rattata', { energy: ['Fire'] }); const dusk = putId(S, 0, 'bench', 0, a2('Dusknoir')); put(S, 1, 'active', 0, 'Snorlax');
	plays(S, a => a.t === 'ability' && a.at.zone === 'bench' && a.args.from.zone === 'active', 'Dusknoir: it takes the damage of an Active Pokémon that is about to fall');
	A(hurt.dmg === 0 && dusk.dmg === 40 && (peek(S) || {}).t !== 'ability', 'once, not back and forth');
	S = arena(2); quiet(S); putId(S, 0, 'active', 0, a2('Garchomp')); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [id('Potion'), id('Charizard ex')];
	plays(S, a => a.t === 'ability' && a.args.hand === 1, 'Garchomp: it discards a card it cannot use yet to draw another');
}

// ===== 14. Triumphant Light (A2a): the Link Abilities, attack costs that change, and each new effect, played =====
{
	const of = set => name => { const c = CARDS.find(x => x.set === set && x.name === name); if (!c) throw new Error(`no ${set} card ${name}`); return c.id; };
	const tl = of('A2a'), a2 = of('A2');
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const T = (S, seat, zone, idx, name, o) => putId(S, seat, zone, idx, tl(name), o);
	const dmgs = S => S.log.filter(e => e.k === 'damage').map(e => e.msg);
	const SN = () => card(id('Snorlax')).attacks.length - 1;
	let S, x, y, z;

	// --- "If you have Arceus or Arceus ex in play…" ---
	S = arena(2); T(S, 0, 'active', 0, 'Carnivine', { energy: ['Grass'] }); T(S, 0, 'active', 1, 'Carnivine', { energy: ['Grass'] }); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(!/Power Link/.test(dmgs(S)[0]), 'Power Link does nothing without Arceus in play');
	S = arena(2); T(S, 0, 'active', 0, 'Carnivine', { energy: ['Grass'] }); T(S, 0, 'bench', 0, 'Arceus'); put(S, 1, 'active', 0, 'Snorlax'); y = put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/\+30 Power Link/.test(dmgs(S)[0]), 'with Arceus (or Arceus ex) in play its attacks do +30 into an opposing Active Pokémon');
	S = arena(2); x = T(S, 0, 'active', 0, 'Heatran'); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	A(E.view(S, 0).players[0].active[0].retreat === card(tl('Heatran')).retreat && /retreating costs/.test(refused(() => E.apply(S, { t: 'retreat', seat: 0, slot: 0, bench: 0 }))), 'Speed Link: without Arceus, Heatran has its Retreat Cost');
	T(S, 0, 'bench', 1, 'Arceus ex');
	A(E.view(S, 0).players[0].active[0].retreat === 0, 'with Arceus ex in play it has none');
	E.apply(S, { t: 'retreat', seat: 0, slot: 0, bench: 0 });
	A(S.players[0].bench[0] === x, 'and retreats for nothing');
	S = arena(2); x = T(S, 0, 'active', 0, 'Abomasnow', { energy: ['Water', 'Water'] }); put(S, 1, 'active', 0, 'Snorlax');
	const mp = card(tl('Abomasnow')).attacks[0];
	A(/does not have the Energy/.test(E.attackBlock(S, 0, x, mp) || '') && E.view(S, 0).players[0].active[0].less === 0, 'Vigor Link: without Arceus, a three-Energy attack needs three');
	T(S, 0, 'bench', 0, 'Arceus');
	A(E.attackBlock(S, 0, x, mp) === null && E.view(S, 0).players[0].active[0].less === 1 && E.lessCost(mp.cost, 1).join() === 'Water,Water', 'with Arceus in play its attacks cost 1 less Colorless Energy (the view says so)');
	S = arena(2); x = T(S, 0, 'active', 0, 'Raichu'); T(S, 0, 'bench', 0, 'Arceus'); y = T(S, 0, 'active', 1, 'Raichu'); put(S, 1, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); S.current = 1;
	exec(S, { attack: SN(), target: L(0, 'active', 0) });
	A(/-30 Resilience Link/.test(dmgs(S)[0]), 'Resilience Link takes 30 off an attack while Arceus is in play');
	S = arena(2); T(S, 0, 'bench', 0, 'Crobat'); put(S, 0, 'active', 0, 'Snorlax'); x = put(S, 1, 'active', 0, 'Snorlax'); y = put(S, 1, 'bench', 0, 'Snorlax');
	A(/needs Arceus or Arceus ex/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { target: L(1, 'active', 0) } }))), 'Cunning Link cannot be used without Arceus in play');
	T(S, 0, 'bench', 1, 'Arceus');
	A(/opposing Active Pokémon/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { target: L(1, 'bench', 0) } }))), 'nor aimed at a Benched Pokémon');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { target: L(1, 'active', 0) } });
	A(x.dmg === 30 && /already been used/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { target: L(1, 'active', 0) } }))), 'with Arceus in play it does 30 to an opposing Active Pokémon, once a turn');

	// --- other Abilities ---
	S = arena(2); T(S, 0, 'active', 0, 'Leafeon ex'); x = put(S, 0, 'bench', 0, 'Bulbasaur'); y = put(S, 0, 'bench', 1, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	A(/Grass Pokémon/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { at: L(0, 'bench', 1) } }))), 'Forest Breath attaches only to a Grass Pokémon');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { at: L(0, 'bench', 0) } });
	A(x.energy.join() === 'Grass', 'to any one of them, Benched included');
	S = arena(2); T(S, 0, 'bench', 0, 'Leafeon ex'); put(S, 0, 'active', 0, 'Bulbasaur'); put(S, 1, 'active', 0, 'Snorlax');
	A(/must be in an Active slot/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { at: L(0, 'active', 0) } }))), 'only while Leafeon ex is in an Active slot');
	S = arena(3); T(S, 0, 'active', 0, 'Glaceon ex'); x = put(S, 1, 'active', 1, 'Snorlax'); y = put(S, 2, 'active', 0, 'Snorlax');
	exec(S);
	A(S.pending && S.pending.kind === 'pickTarget' && S.pending.seat === 0 && S.current === 0 && E.view(S, 0).pending.locs.length === 2 && E.view(S, 0).pending.options.join() === '0,1' && E.view(S, 1).pending.options === null && /waiting on a choice/.test(refused(() => E.apply(S, { t: 'execute', seat: 0, commands: [null, null] }))),
		'Snowy Terrain: with more than one opposing Active Pokémon, its player is asked at the Pokémon Checkup which one takes the 10 (the match waits)');
	A(/not yours/.test(refused(() => E.apply(S, { t: 'choose', seat: 1, pick: 0 }))) && /not one of/.test(refused(() => E.apply(S, { t: 'choose', seat: 0, pick: 2 }))), 'only that player answers, and only with one of the choices');
	E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(y.dmg === 10 && x.dmg === 0 && S.current === 1 && !S.pending && logHas(S, /Snowy Terrain does 10 damage/), 'the one chosen takes it, and the turn then passes');
	exec(S);
	A(S.pending && S.pending.seat === 0 && S.current === 1, 'it is asked again at the end of another player\'s turn (the choice is its player\'s, whoever\'s turn it is)');
	{ const a = nextAction(E.view(S, 0), new Set()); A(a && a.t === 'choose' && a.pick === 1, 'the computer player answers with the one closest to a Knock Out', a); }
	E.apply(S, { t: 'choose', seat: 0, pick: 0 });
	A(x.dmg === 10 && y.dmg === 10 && S.current === 2, 'and play goes on');
	S = arena(3); S.rules = 1; T(S, 0, 'active', 0, 'Glaceon ex'); x = put(S, 1, 'active', 1, 'Snorlax'); y = put(S, 2, 'active', 0, 'Snorlax');
	exec(S);
	A(!S.pending && x.dmg === 10 && y.dmg === 0 && S.current === 1, 'a match recorded under the first rules revision plays as it did: no question, the first opposing Active Pokémon in turn order');
	S = arena(2); T(S, 0, 'active', 0, 'Glaceon ex'); x = put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S);
	A(!S.pending && x.dmg === 10 && S.current === 1, 'with one opposing Active Pokémon there is nothing to ask');
	S = arena(2); T(S, 0, 'bench', 0, 'Glaceon ex'); put(S, 0, 'active', 0, 'Snorlax'); x = put(S, 1, 'active', 0, 'Snorlax');
	exec(S);
	A(x.dmg === 0, 'not from the Bench');
	S = arena(3); T(S, 0, 'active', 0, 'Unown'); put(S, 1, 'active', 0, 'Snorlax'); put(S, 2, 'active', 0, 'Snorlax'); S.players[2].deck = [id('Mewtwo ex'), id('Potion')];
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { seat: 2 } });
	A(E.view(S, 0).log.some(e => /Top of P3's deck: Mewtwo ex/.test(e.more || '')) && E.view(S, 1).log.every(e => !/Mewtwo ex/.test(e.msg + (e.more || ''))) && E.view(S, 2).log.every(e => !/Mewtwo ex/.test(e.msg + (e.more || ''))), 'CHECK: its player (alone) is shown the top card of the deck of the player chosen');
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax'); y = put(S, 0, 'active', 1, 'Charmeleon'); T(S, 0, 'bench', 0, 'Shaymin'); put(S, 1, 'active', 0, 'Snorlax');
	const vS = E.view(S, 0).players[0];
	A(vS.active[0].retreat === card(id('Snorlax')).retreat - 1 && vS.active[1].retreat === card(id('Charmeleon')).retreat && vS.bench[0].retreat === card(tl('Shaymin')).retreat, 'Sky Support: with Shaymin on the Bench, a Basic Pokémon in an Active slot retreats for 1 less; an evolved one does not');
	S = arena(2); x = T(S, 0, 'active', 0, 'Arceus ex', { energy: ['Fire', 'Fire', 'Fire'] }); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 0, 'bench', 2, 'Snorlax'); putId(S, 1, 'active', 0, a2('Kricketune'), { energy: ['Grass', 'Grass'] }); put(S, 1, 'bench', 0, 'Snorlax'); S.current = 1;
	exec(S, { attack: 0, target: L(0, 'active', 0) });
	A(Object.keys(x.status).length === 0 && x.dmg > 0 && logHas(S, /Fabled Luster/), 'Fabled Luster: Arceus ex takes the damage but cannot be Confused');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/base 110\b/.test(dmgs(S).at(-1)), 'Ultimate Force does 70 + 20 for each of its player\'s Benched Pokémon (2)', dmgs(S).at(-1));

	// --- attacks ---
	{
		let lost = 0, kept = 0;
		for (let g = 0; g < 12; g++) { const G = arena(2, 'ast' + g); T(G, 0, 'active', 0, 'Gastly', { energy: ['Fire'] }); put(G, 1, 'active', 0, 'Snorlax'); G.players[1].hand = [id('Potion'), id('Giovanni')]; const d0 = G.players[1].deck.length;
			exec(G, { attack: 0, target: L(1, 'active', 0) });
			if (G.log.some(e => /reveals \w+ from their hand and shuffles it/.test(e.msg)) && G.players[1].deck.length === d0 + 1 - 1) lost++; else if (!G.log.some(e => /shuffles it/.test(e.msg))) kept++; }
		A(lost > 0 && kept > 0 && lost + kept === 12, 'Astonish: on heads a random card of the Defending player\'s hand is shown and shuffled into their deck', [lost, kept]);
	}
	S = arena(2); T(S, 0, 'active', 0, 'Toxicroak', { energy: ['Darkness'] }); x = put(S, 1, 'active', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(x.dmg === 20 && logHas(S, /takes 20 damage from Poison/), 'Toxic: this Poison does 20 at the Pokémon Checkup, not 10');
	exec(S);
	A(x.dmg === 40, 'each time');
	S = arena(2); x = T(S, 0, 'active', 0, 'Giratina', { energy: ['Grass', 'Psychic', 'Fire', 'Water'] }); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(x.energy.length === 2 && S.players[0].energyDiscard.length === 2, 'Crisis Dive discards 2 random Energy from its user');
	S = arena(2); x = T(S, 0, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(logHas(S, /Snorlax is now Asleep/), 'Collapse puts its own user to sleep');
	{
		let stuck = 0, free = 0;
		for (let g = 0; g < 12; g++) { const G = arena(2, 'tm' + g); const d = T(G, 0, 'active', 0, 'Origin Forme Dialga', { energy: ['Metal', 'Metal', 'Fire'] }); put(G, 1, 'active', 0, 'Snorlax', { tool: a2('Giant Cape') }); put(G, 1, 'bench', 0, 'Snorlax');
			exec(G, { attack: 0, target: L(1, 'active', 0) }); exec(G);
			if (/can't attack/.test(E.attackBlock(G, 0, d, card(tl('Origin Forme Dialga')).attacks[0]) || '')) stuck++; else free++; }
		A(stuck > 0 && free > 0, 'Time Mash: on tails its user cannot attack on its next turn; on heads it can', [stuck, free]);
	}
	S = arena(2); T(S, 0, 'active', 0, 'Sudowoodo', { energy: ['Fighting'] }); putId(S, 0, 'active', 1, 'A2a-079', { energy: ['Fighting'] }); put(S, 1, 'active', 0, 'Charizard ex'); put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) }, { attack: 0, target: L(1, 'active', 1) });
	A(/base 50\b/.test(dmgs(S)[0]) && /base 20\b/.test(dmgs(S)[1]), 'Fighting Headbutt does 20 + 30 into a Pokémon ex (both printings are the one card)');

	// --- Trainers ---
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax', { dmg: 60, energy: ['Water'] }); y = put(S, 0, 'bench', 0, 'Snorlax', { dmg: 60, energy: ['Fire'] }); z = put(S, 0, 'bench', 1, 'Snorlax', { dmg: 30, energy: ['Fire', 'Water'] }); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [tl('Irida')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(x.dmg === 20 && y.dmg === 60 && z.dmg === 0, 'Irida heals 40 from each of your Pokémon that has a Water Energy attached, and no other');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [tl('Celestic Town Elder')]; S.players[0].discard = [id('Potion'), id('Charmeleon'), id('Squirtle')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.players[0].hand.join() === id('Squirtle') && !S.players[0].discard.includes(id('Squirtle')), 'Celestic Town Elder returns a Basic Pokémon from the discard pile to the hand');
	S = arena(2); x = T(S, 0, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire'] }); y = put(S, 0, 'active', 1, 'Snorlax', { energy: ['Fire', 'Fire'] }); z = put(S, 1, 'active', 0, 'Charmander'); put(S, 1, 'bench', 0, 'Snorlax'); S.players[0].hand = [tl('Barry')];
	A(/does not have the Energy/.test(E.attackBlock(S, 0, x, card(tl('Snorlax')).attacks[0]) || ''), 'a four-Energy attack with two Energy attached cannot be used');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(E.attackBlock(S, 0, x, card(tl('Snorlax')).attacks[0]) === null && E.view(S, 0).players[0].active[0].less === 2, 'Barry: this turn Snorlax\'s attacks cost 2 less Colorless Energy');
	exec(S, { attack: 0, target: L(1, 'active', 0) }); exec(S);
	A(S.current === 0 && E.view(S, 0).players[0].active.every(k => !k || k.less === 0), 'only for that turn');
	S = arena(2); x = T(S, 0, 'active', 0, 'Mawile'); y = put(S, 0, 'active', 1, 'Rattata'); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Rattata', { energy: ['Fire'] }); put(S, 1, 'active', 1, 'Rattata', { energy: ['Fire'] }); S.players[0].hand = [tl('Adaman')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }); exec(S);
	exec(S, { attack: 0, target: L(0, 'active', 0) }, { attack: 0, target: L(0, 'active', 1) });
	A(/-20 Adaman/.test(dmgs(S)[0]) && !/Adaman/.test(dmgs(S)[1]), 'Adaman takes 20 off attacks into your Metal Pokémon until your next turn, and nothing off attacks into the others', dmgs(S));

	// --- the computer player ---
	S = arena(2); S.players[0].zone.cur = null; S.players[0].flags.attached = true; S.players[0].hand = [tl('Barry')]; T(S, 0, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire'] }); put(S, 0, 'active', 1, 'Rattata', { energy: ['Fire'] }); put(S, 1, 'active', 0, 'Snorlax');
	{ const a = nextAction(E.view(S, 0), new Set()); A(a && a.t === 'trainer', 'the computer player plays Barry when that lets Snorlax attack', a); E.apply(S, a); const b = nextAction(E.view(S, 0), new Set()); A(b && b.t === 'execute' && b.commands[0] && b.commands[0].attack === 0, 'and then attacks with it', b); }
	{
		const N = n => tl(n), two = l => l.flatMap(v => [v, v]);
		const decks = [{ deck: two([N('Arceus ex'), N('Larvitar'), N('Pupitar'), N('Tyranitar'), N('Carnivine'), 'A2a-035', N('Shaymin'), N('Crobat') === '' ? '' : N('Zubat'), N('Golbat'), N('Crobat')]), energy: ['Fighting', 'Darkness'] },
			{ deck: two(['A1a-061', N('Leafeon ex'), N('Glaceon ex'), N('Cherubi'), 'A2a-008', N('Phione'), N('Irida'), a2('Rocky Helmet'), N('Unown'), N('Celestic Town Elder')]), energy: ['Grass', 'Water'] },
			{ deck: two([N('Snorlax'), N('Heracross'), N('Starly'), N('Staravia'), N('Staraptor'), N('Barry'), N('Arceus'), N('Heatran'), N('Adaman'), N('Mawile')]), energy: ['Fire', 'Metal'] }];
		A(decks.every(d => E.deckError(d.deck, d.energy) === null), 'three Triumphant Light decks are legal', decks.map(d => E.deckError(d.deck, d.energy)));
		const bad = []; let over = 0;
		for (let g = 0; g < 12; g++) {
			const config = { seed: 'light' + g, rules: E.RULES, players: [0, 1, 2].slice(0, 2 + (g % 2)).map(i => ({ name: 'P' + i, ai: true, ...decks[(i + g) % 3] })) }, S2 = E.createGame(config), actions = [];
			try {
				for (let step = 0; step < 4000 && !S2.over; step++) {
					const seat = S2.pending ? S2.pending.seat : S2.phase === 'setup' ? S2.players.find(p => !p.setup).seat : S2.current, banned = new Set();
					let done = false;
					for (let t = 0; t < 40 && !done; t++) { const a = nextAction(E.view(S2, seat), banned) || { t: 'execute', seat, commands: [null, null] }; try { E.apply(S2, a); actions.push(a); done = true; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); } }
					if (!done) { bad.push(g + ': stuck'); break; }
				}
				if (S2.over) over++;
				if (E.digest(E.replay(config, actions)) !== E.digest(S2)) bad.push(g + ': replay differs');
			} catch (e) { bad.push(g + ': ' + e.message); }
		}
		A(over === 12 && bad.length === 0, 'computer players finish 12 matches with Triumphant Light decks (2 and 3 players), and every replay matches', { over, bad: bad.slice(0, 4) });
	}
}

// ===== 15. Shining Revelry (A2b): each new effect, played =====
{
	const of = set => name => { const c = CARDS.find(x => x.set === set && x.name === name); if (!c) throw new Error(`no ${set} card ${name}`); return c.id; };
	const sr = of('A2b');
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const R = (S, seat, zone, idx, name, o) => putId(S, seat, zone, idx, sr(name), o);
	const dmgs = S => S.log.filter(e => e.k === 'damage').map(e => e.msg);
	const coins = S => S.log.filter(e => e.k === 'coin').length;
	let S, x, y, z;
	// the data: forms, and a printing whose source damage lacks its "+"
	A(card(sr('Paldean Tauros')).combatTypes.join() === 'Fighting,Fire' && card(sr('Paldean Wooper')).combatTypes.join() === 'Poison,Ground' && !!card(sr('Paldean Wooper')).sprite && card('A2b-085') === card('A2b-048') && card('A2b-093') === card('A2b-048') && card('A2b-048').attacks[0].damageMode === '+',
		'Paldean Tauros and Paldean Wooper are their Paldean forms; the three printings of Paldean Clodsire ex are one card');
	// --- attacks ---
	S = arena(2); x = R(S, 0, 'active', 0, 'Charizard ex', { energy: ['Fire'] }); put(S, 1, 'active', 0, 'Snorlax');
	exec(S, { attack: 0 });
	A(x.energy.join() === 'Fire,Fire,Fire,Fire', 'Stoke attaches 3 Fire Energy from the Energy Zone to its user');
	S = arena(3); R(S, 0, 'active', 0, 'Wiglett', { energy: ['Water'] }); x = put(S, 1, 'active', 0, 'Snorlax'); y = put(S, 1, 'bench', 0, 'Snorlax'); z = put(S, 2, 'active', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(x.dmg + y.dmg > 0 && z.dmg === 0 && dmgs(S).length === 1, 'Spring Out does its damage to one random Pokémon of the opponent it is aimed at');
	S = arena(2); R(S, 0, 'active', 0, 'Pachirisu', { energy: ['Lightning'] }); x = put(S, 0, 'bench', 0, 'Pikachu'); y = put(S, 0, 'bench', 2, 'Pikachu'); put(S, 1, 'active', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0), args: { bench: 2 } });
	A(y.energy.join() === 'Lightning' && x.energy.length === 0, 'Plasma attaches a Lightning Energy to the chosen Benched Lightning Pokémon');
	S = arena(2); R(S, 0, 'active', 0, 'Alakazam', { energy: ['Psychic', 'Psychic'] }); put(S, 1, 'active', 0, 'Snorlax'); x = put(S, 1, 'bench', 0, 'Snorlax', { energy: ['Fire'] }); y = put(S, 1, 'bench', 1, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(x.dmg > 0 && y.dmg === 0, 'Psychic Suppression also hits each Benched Pokémon that has Energy attached, and no other');
	{
		let conf = 0, none = 0;
		for (let g = 0; g < 12; g++) { const G = arena(2, 'cr' + g); R(G, 0, 'active', 0, 'Spiritomb', { energy: ['Darkness'] }); const d = put(G, 1, 'active', 0, 'Snorlax'); exec(G, { attack: 0, target: L(1, 'active', 0) }); if (d.status.confused) conf++; else none++; }
		A(conf > 0 && none > 0, 'Confuse Ray: on heads the Defending Pokémon is Confused', [conf, none]);
	}
	S = arena(2); R(S, 0, 'active', 0, 'Gholdengo', { energy: ['Metal', 'Metal', 'Fire', 'Fire'] }); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax');
	const c0 = coins(S); exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(coins(S) - c0 === 2, 'Scintillating Surfing flips a coin for each Metal Energy attached (2 of its 4 Energy)', coins(S) - c0);
	// --- Abilities ---
	S = arena(2); x = R(S, 0, 'active', 0, 'Dondozo'); y = R(S, 0, 'active', 1, 'Tatsugiri'); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	A(E.view(S, 0).players[0].active[0].retreat === 0 && E.view(S, 0).players[0].active[1].retreat === card(sr('Tatsugiri')).retreat, 'Retreat Directive: with Tatsugiri in play, Dondozo in an Active slot has no Retreat Cost (Tatsugiri keeps its own)');
	E.apply(S, { t: 'retreat', seat: 0, slot: 0, bench: 0 });
	A(S.players[0].bench[0] === x, 'and retreats for nothing');
	S = arena(2); R(S, 0, 'active', 0, 'Dondozo'); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	A(E.view(S, 0).players[0].active[0].retreat === card(sr('Dondozo')).retreat, 'without Tatsugiri it has its Retreat Cost');
	S = arena(2); x = R(S, 0, 'active', 0, 'Giratina ex'); put(S, 1, 'active', 0, 'Snorlax');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: {} });
	A(x.energy.join() === 'Psychic' && S.current === 1 && logHas(S, /Broken-Space Bellow: P1's turn ends/), 'Broken-Space Bellow attaches a Psychic Energy to Giratina ex and ends its player\'s turn');
	{
		let hit = 0, miss = 0;
		for (let g = 0; g < 12; g++) { const G = arena(2, 'pc' + g); R(G, 0, 'bench', 0, 'Grafaiai'); put(G, 0, 'active', 0, 'Snorlax'); const d = put(G, 1, 'active', 1, 'Snorlax'); put(G, 1, 'active', 0, 'Snorlax'); E.apply(G, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { target: L(1, 'active', 1) } }); if (d.status.poisoned) hit++; else miss++; }
		A(hit > 0 && miss > 0, 'Poison Coating: once a turn, on heads the opposing Active Pokémon chosen is Poisoned', [hit, miss]);
	}
	S = arena(2); R(S, 0, 'bench', 0, 'Wigglytuff'); x = put(S, 0, 'active', 1, 'Snorlax', { dmg: 50 }); y = put(S, 0, 'bench', 1, 'Snorlax', { dmg: 50 }); put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	A(/Active slot/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { at: L(0, 'bench', 1) } }))) && /no damage/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { at: L(0, 'active', 0) } }))), 'Comforting Song heals only a damaged Pokémon in an Active slot');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { at: L(0, 'active', 1) } });
	A(x.dmg === 30 && y.dmg === 50, 'it heals 20 from the one chosen, in either Active slot');
	// --- Trainers ---
	S = arena(3); put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); put(S, 2, 'active', 0, 'Snorlax'); S.players[0].hand = [sr('Iono'), id('Potion'), id('Potion')]; S.players[1].hand = [id('Potion')]; S.players[2].hand = [id('Potion'), id('Potion'), id('Potion'), id('Potion')];
	const decks0 = S.players.map(p => p.deck.length);
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.players.map(p => p.hand.length).join() === '2,1,4' && S.players.map(p => p.deck.length).join() === decks0.join(), 'Iono: every player shuffles their hand into their deck and draws as many cards as they had');
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax', { dmg: 50 }); x.status.poisoned = { by: 1 }; x.status.asleep = { by: 1, turn: 1 }; y = put(S, 0, 'bench', 0, 'Snorlax'); y.status.poisoned = { by: 1 }; put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [sr('Pokémon Center Lady'), sr('Pokémon Center Lady'), sr('Pokémon Center Lady')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } });
	A(x.dmg === 20 && Object.keys(x.status).length === 0, 'Pokémon Center Lady heals 30 and the Pokémon recovers from every Special Condition');
	S.players[0].flags.supporter = false; E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'bench', 0) } });
	A(Object.keys(y.status).length === 0, 'she may be used on an undamaged Pokémon that has a Special Condition');
	S.players[0].flags.supporter = false;
	A(/no damage and no Special Condition/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'bench', 0) } }))), 'not on one with neither');
	S = arena(2); put(S, 0, 'active', 0, 'Rattata', { energy: ['Fire'] }); put(S, 0, 'active', 1, 'Rattata', { energy: ['Fire'] }); put(S, 1, 'active', 0, 'Charizard ex'); put(S, 1, 'active', 1, 'Snorlax'); S.players[0].hand = [sr('Red')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	exec(S, { attack: 0, target: L(1, 'active', 0) }, { attack: 0, target: L(1, 'active', 1) });
	A(/\+20 Red/.test(dmgs(S)[0]) && !/Red/.test(dmgs(S)[1]), 'Red: this turn attacks do +20 into an opposing Active Pokémon ex, and nothing extra into another');
	{
		let some = 0, zero = 0;
		for (let g = 0; g < 12; g++) { const G = arena(3, 'trg' + g); put(G, 0, 'active', 0, 'Snorlax'); put(G, 1, 'active', 0, 'Snorlax'); const d = put(G, 2, 'active', 1, 'Snorlax', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); G.players[0].hand = [sr('Team Rocket Grunt')];
			const c1 = G.log.filter(e => e.k === 'coin').length; E.apply(G, { t: 'trainer', seat: 0, hand: 0, args: { target: L(2, 'active', 1) } });
			const heads = G.log.filter(e => e.k === 'coin').length - c1 - 1;
			if (4 - d.energy.length !== Math.min(4, heads) || (G.players[2].energyDiscard || []).length !== 4 - d.energy.length) { some = -99; break; }
			if (heads > 0) some++; else zero++; }
		A(some > 0 && zero > 0, 'Team Rocket Grunt: a random Energy is discarded from the opposing Active Pokémon chosen for each heads before the first tails', [some, zero]);
	}
	// --- the computer player ---
	S = arena(2); S.players[0].zone.cur = null; S.players[0].flags.attached = true; S.players[0].hand = []; x = R(S, 0, 'active', 0, 'Giratina ex'); put(S, 0, 'active', 1, 'Rattata'); put(S, 1, 'active', 0, 'Snorlax');
	{ const a = nextAction(E.view(S, 0), new Set()); A(a && a.t === 'ability', 'with no attack to make, the computer player uses Broken-Space Bellow (which ends its turn)', a); }
	S = arena(2); S.players[0].zone.cur = null; S.players[0].flags.attached = true; S.players[0].hand = []; R(S, 0, 'active', 0, 'Giratina ex'); put(S, 0, 'active', 1, 'Rattata', { energy: ['Fire'] }); put(S, 1, 'active', 0, 'Snorlax');
	{ const a = nextAction(E.view(S, 0), new Set()); A(a && a.t === 'execute' && a.commands[1], 'with an attack to make, it attacks instead of ending its turn', a); }
	{
		const N = n => sr(n), two = l => l.flatMap(v => [v, v]);
		const decks = [{ deck: two([N('Giratina ex'), N('Abra'), N('Kadabra'), N('Alakazam'), N('Mr. Mime'), N('Gimmighoul'), N('Pokémon Center Lady'), N('Red'), N('Spiritomb'), N('Iono')]), energy: ['Psychic', 'Darkness'] },
			{ deck: two([N('Tinkatink'), N('Tinkatuff'), N('Tinkaton ex'), N('Varoom'), N('Revavroom'), N('Gholdengo'), N('Team Rocket Grunt'), N('Wigglytuff'), N('Jigglypuff'), N('Cyclizar')]), energy: ['Metal'] },
			{ deck: two([N('Dondozo'), N('Tatsugiri'), N('Wiglett'), N('Wugtrio ex'), N('Buizel'), N('Floatzel'), N('Paldean Wooper'), N('Paldean Clodsire ex'), N('Grafaiai'), N('Shroodle')]), energy: ['Water', 'Darkness'] }];
		A(decks.every(d => E.deckError(d.deck, d.energy) === null), 'three Shining Revelry decks are legal', decks.map(d => E.deckError(d.deck, d.energy)));
		const bad = []; let over = 0;
		for (let g = 0; g < 12; g++) {
			const config = { seed: 'shine' + g, rules: E.RULES, players: [0, 1, 2].slice(0, 2 + (g % 2)).map(i => ({ name: 'P' + i, ai: true, ...decks[(i + g) % 3] })) }, S2 = E.createGame(config), actions = [];
			try {
				for (let step = 0; step < 4000 && !S2.over; step++) {
					const seat = S2.pending ? S2.pending.seat : S2.phase === 'setup' ? S2.players.find(p => !p.setup).seat : S2.current, banned = new Set();
					let done = false;
					for (let t = 0; t < 40 && !done; t++) { const a = nextAction(E.view(S2, seat), banned) || { t: 'execute', seat, commands: [null, null] }; try { E.apply(S2, a); actions.push(a); done = true; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); } }
					if (!done) { bad.push(g + ': stuck'); break; }
				}
				if (S2.over) over++;
				if (E.digest(E.replay(config, actions)) !== E.digest(S2)) bad.push(g + ': replay differs');
			} catch (e) { bad.push(g + ': ' + e.message); }
		}
		A(over === 12 && bad.length === 0, 'computer players finish 12 matches with Shining Revelry decks (2 and 3 players), and every replay matches', { over, bad: bad.slice(0, 4) });
	}
}

// ===== 16. Celestial Guardians (A3): each new effect, played =====
{
	const of = set => name => { const c = CARDS.find(x => x.set === set && x.name === name); if (!c) throw new Error(`no ${set} card ${name}`); return c.id; };
	const cg = of('A3'), a2 = of('A2');
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const G = (S, seat, zone, idx, name, o) => putId(S, seat, zone, idx, cg(name), o);
	const dmgs = S => S.log.filter(e => e.k === 'damage').map(e => e.msg);
	const SN = () => card(id('Snorlax')).attacks.length - 1, hp0 = card(id('Snorlax')).hp;
	const seeds = (n, f) => { const out = {}; for (let g = 0; g < n; g++) { const r = f('s' + g); out[r] = (out[r] || 0) + 1; } return out; };
	let S, x, y, z;

	// --- the data: Alolan forms, Oricorio's four styles, two Lycanroc ---
	A(card(cg('Alolan Vulpix')).combatTypes.join() === 'Ice' && card(cg('Alolan Marowak')).combatTypes.join() === 'Fire,Ghost' && !!card(cg('Alolan Raichu ex')).sprite
		&& CARDS.filter(c => c.set === 'A3' && c.name === 'Oricorio').map(c => c.cardType + ':' + c.combatTypes.join('+')).sort().join(' ') === 'Fire:Fire+Flying Lightning:Electric+Flying Psychic:Ghost+Flying Psychic:Psychic+Flying',
		'Alolan Pokémon have their Alolan types and sprites; the four Oricorio are the four styles');

	// --- attacks ---
	S = arena(2); G(S, 0, 'active', 0, 'Decidueye ex', { energy: ['Fire', 'Fire'] }); put(S, 1, 'active', 0, 'Snorlax'); x = put(S, 1, 'bench', 1, 'Snorlax', { dmg: 10 });
	A(E.attackTargets(S, 0, card(cg('Decidueye ex')).attacks[0]).map(l => l.zone + l.idx).join() === 'bench1' && /choose a target/.test(refused(() => exec(S, { attack: 0, target: L(1, 'active', 0) }))), 'Pierce the Pain may be aimed only at a Pokémon that has damage on it');
	exec(S, { attack: 0, target: L(1, 'bench', 1) });
	A(x.dmg === 110, 'and does 100 to it');
	{ const r = seeds(12, sd => { const T = arena(2, sd); const b = G(T, 0, 'active', 0, 'Tapu Bulu', { energy: ['Grass', 'Grass', 'Fire'] }); put(T, 1, 'active', 0, 'Snorlax'); put(T, 1, 'bench', 0, 'Snorlax'); exec(T, { attack: 0, target: L(1, 'active', 0) }); return b.dmg === 20 ? 'self' : b.dmg === 0 ? 'none' : 'bad'; });
		A(r.self > 0 && r.none > 0 && !r.bad, 'Stuck-In Tackle: on tails its user takes 20', r); }
	S = arena(2); x = putId(S, 0, 'active', 0, 'A3-034', { energy: ['Fire', 'Fire'] }); y = put(S, 1, 'active', 0, 'Snorlax', { energy: ['Water'] });
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(x.energy.length === 1 && y.energy.length === 0, 'Kindle discards a random Energy from its user and from the Defending Pokémon');
	S = arena(2); G(S, 0, 'active', 0, 'Salazzle', { energy: ['Fire', 'Fire'] }); x = put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(logHas(S, /Snorlax is now Poisoned/) && logHas(S, /Snorlax is now Burned/), 'Heated Poison leaves its target Poisoned and Burned');
	S = arena(2); G(S, 0, 'active', 0, 'Wishiwashi ex', { energy: ['Water', 'Water', 'Water'] }); G(S, 0, 'bench', 0, 'Wishiwashi'); G(S, 0, 'bench', 1, 'Wishiwashi ex'); put(S, 0, 'bench', 2, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/base 110\b/.test(dmgs(S)[0]), 'School Storm does 30 + 40 for each Benched Wishiwashi and Wishiwashi ex (2)');
	S = arena(2); G(S, 0, 'active', 0, 'Araquanid', { energy: ['Water', 'Water', 'Fire'] }); G(S, 0, 'active', 1, 'Araquanid', { energy: ['Water', 'Water', 'Fire'] }); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'active', 1, 'Charmeleon'); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) }, { attack: 0, target: L(1, 'active', 1) });
	A(/base 120\b/.test(dmgs(S)[0]) && /base 60\b/.test(dmgs(S)[1]), 'Dangerous Claws does 60 + 60 into a Basic Pokémon, 60 into an evolved one');
	S = arena(2); G(S, 0, 'active', 0, 'Vikavolt', { energy: ['Lightning', 'Lightning'] }); put(S, 1, 'active', 0, 'Snorlax'); S.players[1].hand = [id('Potion'), id('Giovanni'), id('Helix Fossil'), a2('Giant Cape')];
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(S.current === 1 && E.view(S, 1).players[1].noItems && /can't play Item cards/.test(refused(() => E.apply(S, { t: 'trainer', seat: 1, hand: 0, args: { at: L(1, 'active', 0) } }))) && /can't play Item cards/.test(refused(() => E.apply(S, { t: 'playBasic', seat: 1, hand: 2 }))), 'Disconnect: its target\'s owner cannot play Item cards on their next turn (a fossil is an Item)');
	E.apply(S, { t: 'trainer', seat: 1, hand: 3, args: { at: L(1, 'active', 0) } }); E.apply(S, { t: 'trainer', seat: 1, hand: 1, args: {} });
	A(S.players[1].active[0].tool === a2('Giant Cape') && S.players[1].discard.includes(id('Giovanni')), 'a Pokémon Tool and a Supporter may still be played');
	exec(S); exec(S);
	A(S.current === 1 && !E.view(S, 1).players[1].noItems, 'and Items again the turn after');
	S = arena(2); x = G(S, 0, 'active', 0, 'Tapu Koko', { energy: ['Lightning', 'Lightning', 'Lightning'] }); put(S, 0, 'bench', 0, 'Snorlax'); y = put(S, 0, 'bench', 1, 'Pikachu'); put(S, 1, 'active', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0), args: { bench: 0 } });
	A(S.players[0].active[0] === y && S.players[0].bench[1] === x, 'Volt Switch trades places only with a Benched Lightning Pokémon (a choice of another is not taken)');
	S = arena(2); G(S, 0, 'active', 0, 'Banette', { energy: ['Psychic'] }); x = put(S, 1, 'active', 0, 'Snorlax'); y = put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) }); S.players[1].zone.cur = 'Fire';
	A(/can't attach Energy from your Energy Zone to your Active/.test(refused(() => E.apply(S, { t: 'attach', seat: 1, at: L(1, 'active', 0) }))), 'Night Bind: its target\'s owner cannot attach their Energy to an Active Pokémon next turn');
	E.apply(S, { t: 'attach', seat: 1, at: L(1, 'bench', 0) });
	A(y.energy.join() === 'Fire', 'a Benched Pokémon may still take it');
	S = arena(2); G(S, 0, 'active', 0, 'Mimikyu', { energy: ['Psychic', 'Fire'] }); x = put(S, 0, 'bench', 2, 'Snorlax'); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0), args: { own: L(0, 'bench', 2) } });
	A(x.dmg === 20, 'Shadow Hit also does 20 to the one of your own Pokémon you choose');
	S = arena(2); G(S, 0, 'active', 0, 'Tapu Lele', { energy: ['Psychic'] }); put(S, 1, 'active', 0, 'Snorlax'); x = put(S, 1, 'bench', 0, 'Snorlax', { energy: ['Fire', 'Fire', 'Fire'] });
	exec(S, { attack: 0, target: L(1, 'bench', 0) });
	A(/base 60\b/.test(dmgs(S)[0]) && x.dmg > 0, 'Energy Arrow does 20 for each Energy on the Pokémon it is aimed at (3)');
	S = arena(2); putId(S, 0, 'active', 0, 'A3-098', { energy: ['Fighting'] }); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = []; S.players[0].deck = [id('Potion'), 'A3-101', id('Charmander')];
	exec(S, { attack: 0 });
	A(S.players[0].hand.includes('A3-101'), 'Signs of Evolution fetches a card that evolves from Rockruff');
	S = arena(2); putId(S, 0, 'active', 0, 'A3-101', { energy: ['Fighting', 'Fighting'] }); putId(S, 0, 'active', 1, 'A3-101', { energy: ['Fighting', 'Fighting'], dmg: 0 }); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'active', 1, 'Rattata'); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) }, { attack: 0, target: L(1, 'active', 1) });
	A(/base 100\b/.test(dmgs(S)[0]) && /base 50\b/.test(dmgs(S)[1]), 'Blood Fang does 50 + 50 into a Pokémon with more remaining HP than its user');
	S = arena(2); G(S, 0, 'active', 0, 'Absol', { energy: ['Darkness', 'Fire'] }); G(S, 0, 'active', 1, 'Magearna', { energy: ['Metal', 'Metal'] }); x = put(S, 1, 'active', 0, 'Snorlax'); x.status.poisoned = { by: 0 }; putId(S, 1, 'active', 1, cg('Komala'));
	exec(S, { attack: 0, target: L(1, 'active', 0) }, { attack: 0, target: L(1, 'active', 1) });
	A(/base 80\b/.test(dmgs(S)[0]) && /base 80\b/.test(dmgs(S)[1]), 'Unseen Claw does +60 into a Pokémon with a Special Condition; Silver Cannon +40 into one with an Ability');
	S = arena(2); G(S, 0, 'active', 0, 'Drampa', { energy: ['Fire', 'Fire'] }); put(S, 0, 'bench', 0, 'Snorlax', { dmg: 10 }); put(S, 1, 'active', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/base 70\b/.test(dmgs(S)[0]), 'Berserk does 20 + 50 when one of its player\'s Benched Pokémon has damage');
	S = arena(2); x = G(S, 0, 'active', 0, 'Kommo-o', { energy: ['Lightning', 'Fighting'] }); put(S, 1, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire', 'Fire', 'Fire'], tool: a2('Giant Cape') });
	exec(S, { attack: 0, target: L(1, 'active', 0) }); exec(S, { attack: SN(), target: L(0, 'active', 0) });
	A(/\+30 \(exposed\)/.test(dmgs(S).at(-1)) && !x.fx.some(f => f.k === 'vulnerable'), 'Clanging Scales: until its next turn its user takes +30 from attacks');
	S = arena(2); x = G(S, 0, 'active', 0, 'Bewear', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); put(S, 1, 'active', 0, 'Snorlax', { tool: a2('Giant Cape') });
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(x.status.confused, 'Tantrum leaves its own user Confused');
	S = arena(2); G(S, 0, 'active', 0, 'Oranguru', { energy: ['Fire', 'Fire'] }); x = put(S, 1, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	const vx = E.view(S, 1).players[1].active[0];
	A(vx.less === -1 && vx.retreat === card(id('Snorlax')).retreat + 1 && /does not have the Energy/.test(E.attackBlock(S, 1, x, card(id('Snorlax')).attacks[SN()]) || ''), 'Primate\'s Trap: on its owner\'s next turn the Defending Pokémon\'s attacks cost 1 more and so does its retreat');
	exec(S); exec(S);
	A(E.view(S, 1).players[1].active[0].less === 0, 'for that turn only');
	S = arena(2); x = G(S, 0, 'bench', 0, 'Golisopod', { energy: ['Grass', 'Grass', 'Grass'] }); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax'); put(S, 0, 'active', 1, 'Snorlax');
	E.apply(S, { t: 'promote', seat: 0, slot: 0, bench: 0 }); exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/base 120\b/.test(dmgs(S)[0]), 'First Impression does 60 + 60 the turn its user moved up from the Bench');
	exec(S); exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/base 60\b/.test(dmgs(S).at(-1)), 'and 60 on a later turn');
	{ const r = seeds(12, sd => { const T = arena(2, sd); G(T, 0, 'active', 0, 'Alolan Marowak', { energy: ['Fire', 'Fire', 'Fire'] }); const d = put(T, 1, 'active', 0, 'Snorlax', { tool: a2('Giant Cape') }); put(T, 1, 'bench', 0, 'Snorlax'); exec(T, { attack: 0, target: L(1, 'active', 0) }); const heads = T.log.filter(e => e.k === 'coin' && /Bonemerang/.test(e.msg) && e.heads).length; return (heads > 0) === T.log.some(e => /Snorlax is now Burned/.test(e.msg)) ? (heads ? 'burn' : 'none') : 'bad'; });
		A(r.burn > 0 && !r.bad, 'Burning Bonemerang: 70 for each heads of two coins, and Burned if at least one was heads', r); }
	S = arena(2); x = G(S, 0, 'active', 0, 'Alolan Sandslash', { energy: ['Water'] }); y = put(S, 1, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] });
	exec(S, { attack: 0, target: L(1, 'active', 0) }); const yd = y.dmg; exec(S, { attack: SN(), target: L(0, 'active', 0) });
	A(y.dmg === yd + 40, 'Spike Armor: until its next turn, an attacker that damages its user takes 40');
	S = arena(2); G(S, 0, 'active', 0, 'Alolan Raticate', { energy: ['Darkness', 'Darkness'] }); put(S, 1, 'active', 0, 'Snorlax'); S.players[1].hand = [id('Giovanni'), id('Potion'), id('Charmander')];
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(S.players[1].discard.includes(id('Potion')) && !S.players[1].hand.slice(0, 2).includes(id('Potion')), 'Scrounge-and-Scarf discards an Item card (and only an Item) from its target\'s owner\'s hand');
	S = arena(2); G(S, 0, 'active', 0, 'Alolan Muk ex', { energy: ['Darkness', 'Darkness', 'Fire'] }); x = put(S, 1, 'active', 0, 'Snorlax', { tool: a2('Giant Cape') }); for (const st of ['asleep', 'burned', 'confused', 'poisoned']) x.status[st] = { by: 0, turn: 1 }; put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(logHas(S, /Snorlax is now Paralyzed/), 'Chemical Panic gives a random Special Condition the Pokémon does not already have (only Paralyzed was left)');

	// --- Abilities ---
	S = arena(2); x = G(S, 0, 'active', 0, 'Wimpod'); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	A(E.view(S, 0).players[0].active[0].retreat === card(cg('Wimpod')).retreat, 'Wimp Out is for its player\'s first turn only');
	S.players[0].turns = 0; S.first = 1;
	A(E.view(S, 0).players[0].active[0].retreat === 0, 'on that first turn Wimpod has no Retreat Cost');
	S = arena(2); x = G(S, 0, 'bench', 0, 'Primarina'); y = put(S, 0, 'active', 0, 'Squirtle', { dmg: 40 }); z = put(S, 0, 'active', 1, 'Snorlax', { dmg: 40 }); put(S, 1, 'active', 0, 'Snorlax');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: {} });
	A(y.dmg === 10 && z.dmg === 40, 'Melodious Healing heals 30 from each of your Water Pokémon, and no other');
	S = arena(2); x = G(S, 0, 'active', 0, 'Pyukumuku', { dmg: 50 }); put(S, 0, 'bench', 0, 'Snorlax'); y = put(S, 1, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); S.current = 1;
	exec(S, { attack: SN(), target: L(0, 'active', 0) });
	A(y.dmg === 50 && S.players[1].points === 1, 'Innards Out: Knocked Out in an Active slot by an attack, it does 50 to the attacker');
	S = arena(2); x = putId(S, 0, 'active', 0, 'A3-066'); put(S, 1, 'active', 0, 'Charizard ex', { energy: ['Fire', 'Fire', 'Fire'] }); put(S, 1, 'active', 1, 'Rattata', { energy: ['Fire'] }); S.current = 1;
	exec(S, { attack: 0, target: L(0, 'active', 0) }, { attack: 0, target: L(0, 'active', 0) });
	A(/prevented by Safeguard/.test(dmgs(S)[0]) && !/Safeguard/.test(dmgs(S)[1]) && x.dmg === card(id('Rattata')).attacks[0].damage, 'Safeguard prevents all damage from a Pokémon ex\'s attack, and none from another Pokémon\'s');
	S = arena(2); G(S, 0, 'bench', 0, 'Comfey'); x = put(S, 0, 'active', 0, 'Snorlax', { energy: ['Psychic'] }); y = put(S, 0, 'active', 1, 'Snorlax'); putId(S, 1, 'active', 0, cg('Salazzle'), { energy: ['Fire', 'Fire'] }); putId(S, 1, 'active', 1, cg('Salazzle'), { energy: ['Fire', 'Fire'] }); S.current = 1;
	exec(S, { attack: 0, target: L(0, 'active', 0) }, { attack: 0, target: L(0, 'active', 1) });
	A(Object.keys(x.status).length === 0 && x.dmg > 0 && (y.status.poisoned || y.status.burned), 'Flower Shield: a Pokémon of its side holding Psychic Energy cannot be given a Special Condition; one without can');
	S.players[0].zone.cur = 'Psychic'; E.apply(S, { t: 'attach', seat: 0, at: L(0, 'active', 1) });
	A(Object.keys(y.status).length === 0, 'and it recovers from them as soon as it holds one');
	S = arena(2); x = G(S, 0, 'active', 1, 'Lunala ex'); y = G(S, 0, 'bench', 0, 'Cosmog', { energy: ['Psychic', 'Psychic', 'Fire'] }); z = put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 1), args: { bench: 0, at: L(0, 'active', 0) } });
	A(z.energy.join() === 'Psychic,Psychic' && y.energy.join() === 'Fire' && /already been used/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 1), args: { bench: 0, at: L(0, 'active', 0) } }))), 'Psychic Connect moves all the Psychic Energy of a Benched Psychic Pokémon to the Active Pokémon chosen, once a turn');
	{ const r = seeds(12, sd => { const T = arena(2, sd); const c = G(T, 0, 'active', 0, 'Conkeldurr', { dmg: 100 }); put(T, 0, 'bench', 0, 'Snorlax'); put(T, 1, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); T.current = 1; exec(T, { attack: SN(), target: L(0, 'active', 0) }); return T.players[0].active[0] === c ? (card(cg('Conkeldurr')).hp - c.dmg === 10 ? 'stays' : 'bad') : 'falls'; });
		A(r.stays > 0 && r.falls > 0 && !r.bad, 'Guts: an attack that would knock it out leaves it with 10 HP on heads', r); }
	S = arena(2); x = G(S, 0, 'active', 0, 'Passimian ex', { energy: ['Fighting', 'Fighting', 'Fire'], dmg: 100 }); y = put(S, 0, 'bench', 0, 'Snorlax'); z = put(S, 0, 'bench', 2, 'Snorlax'); put(S, 0, 'active', 1, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); S.current = 1;
	exec(S, { attack: SN(), target: L(0, 'active', 0) });
	A(S.pending && S.pending.kind === 'pickTarget' && S.pending.seat === 0 && S.pending.locs.map(l => l.zone + l.idx).join() === 'bench0,bench2', 'Offload Pass: Knocked Out by an attack, its player is asked which Benched Pokémon takes its Fighting Energy');
	E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(z.energy.join() === 'Fighting,Fighting' && y.energy.length === 0 && S.players[0].energyDiscard.join() === 'Fire' && S.players[1].points === 2, 'the one chosen takes it; the rest is discarded with the Pokémon');
	S = arena(2); x = G(S, 0, 'bench', 1, 'Solgaleo ex'); y = put(S, 0, 'active', 0, 'Snorlax'); z = put(S, 0, 'active', 1, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 1), args: { slot: 1 } });
	A(S.players[0].active[1] === x && S.players[0].bench[1] === z && x.movedUp === S.turn, 'Rising Road: from the Bench, Solgaleo ex trades places with the Active Pokémon chosen');
	A(/must be on your Bench/.test(refused(() => { const T = arena(2); G(T, 0, 'active', 0, 'Solgaleo ex'); put(T, 0, 'active', 1, 'Snorlax'); put(T, 1, 'active', 0, 'Snorlax'); E.apply(T, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { slot: 1 } }); })), 'not when it is already in an Active slot');
	S = arena(2); x = G(S, 0, 'active', 0, 'Komala'); y = G(S, 0, 'bench', 0, 'Komala'); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].zone.cur = 'Fire';
	E.apply(S, { t: 'attach', seat: 0, at: L(0, 'active', 0) });
	A(x.status.asleep && x.energy.length === 1, 'Comatose: an Energy from the Energy Zone onto Komala in an Active slot puts it to sleep');

	// --- Pokémon Tools ---
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax', { tool: cg('Poison Barb') }); y = put(S, 1, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); put(S, 0, 'bench', 0, 'Snorlax'); S.current = 1;
	exec(S, { attack: SN(), target: L(0, 'active', 0) });
	A(y.status.poisoned || logHas(S, /Snorlax is now Poisoned/), 'Poison Barb: an attacker that damages its holder in an Active slot is Poisoned');
	S = arena(2); x = put(S, 0, 'active', 0, 'Bulbasaur', { tool: cg('Leaf Cape') }); y = put(S, 0, 'active', 1, 'Snorlax', { tool: cg('Leaf Cape') }); put(S, 1, 'active', 0, 'Snorlax');
	A(E.view(S, 0).players[0].active[0].hp === card(id('Bulbasaur')).hp + 30 && E.view(S, 0).players[0].active[1].hp === hp0, 'Leaf Cape gives +30 HP to a Grass Pokémon, and nothing to another');

	// --- Trainers ---
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax', { dmg: 30 }); x.status.poisoned = { by: 1 }; put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [cg('Big Malasada')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } });
	A(x.dmg === 20 && Object.keys(x.status).length === 0, 'Big Malasada heals 10 and removes a Special Condition');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [cg('Fishing Net')]; S.players[0].discard = [id('Charmander'), id('Wartortle'), id('Squirtle')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.players[0].hand.join() === id('Squirtle'), 'Fishing Net returns a Basic Water Pokémon from the discard pile, not another');
	S = arena(2); x = put(S, 0, 'active', 0, 'Charmander', { energy: ['Fire'], dmg: 10 }); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [cg('Rare Candy'), id('Charizard ex'), id('Blastoise ex')];
	A(/evolves from Charmander/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0), pick: 2 } }))), 'Rare Candy needs a Stage 2 card of that Pokémon\'s own line');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0), pick: 1 } });
	A(card(x.cards.at(-1)).name === 'Charizard ex' && x.cards.length === 2 && x.dmg === 10 && x.energy.length === 1 && S.players[0].hand.join() === id('Blastoise ex'), 'it evolves the Basic Pokémon straight into the Stage 2 card (Energy and damage stay)');
	S = arena(2); S.players[0].hand = [cg('Rare Candy'), id('Charmander'), id('Charizard ex')]; put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	E.apply(S, { t: 'playBasic', seat: 0, hand: 1, to: { zone: 'active', idx: 1 } });
	A(/put into play this turn/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 1), pick: 1 } }))), 'not on a Basic Pokémon played this turn');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [cg('Rotom Dex'), cg('Rotom Dex')]; S.players[0].deck = [id('Mewtwo ex'), id('Potion'), id('Charmander'), id('Squirtle')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.pending && S.pending.kind === 'confirm' && E.view(S, 0).pending.cards.join() === id('Mewtwo ex') && E.view(S, 1).pending.cards === null, 'Rotom Dex shows its player the top card, then asks whether to shuffle (nobody else sees the card)');
	E.apply(S, { t: 'choose', seat: 0, pick: 0 });
	A(S.players[0].deck[0] === id('Mewtwo ex') && !S.pending, 'No leaves the deck as it is');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }); E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(logHas(S, /shuffles their deck/) && S.players[0].deck.length === 4, 'Yes shuffles it');
	S = arena(3); G(S, 0, 'active', 0, 'Mimikyu', { dmg: 60 }); x = put(S, 1, 'active', 0, 'Snorlax'); y = put(S, 2, 'active', 1, 'Rattata', { dmg: 10 }); put(S, 2, 'active', 0, 'Snorlax'); S.players[0].hand = [cg('Acerola')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0), target: L(2, 'active', 1) } });
	A(S.players[0].active[0].dmg === 20 && S.players[2].active[1] !== y && S.players[0].points === 1, 'Acerola moves 40 of Mimikyu\'s damage to the opposing Active Pokémon chosen, and a Knock Out by it is scored');
	S = arena(2); x = put(S, 0, 'bench', 0, 'Snorlax', { dmg: 50, energy: ['Fire'], tool: a2('Giant Cape') }); put(S, 0, 'active', 0, 'Charmander', { dmg: 10 }); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [cg('Ilima')];
	A(/Colorless Pokémon/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } }))), 'Ilima takes only a Colorless Pokémon');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'bench', 0) } });
	A(S.players[0].hand.includes(id('Snorlax')) && S.players[0].bench[0] === null && S.players[0].discard.includes(a2('Giant Cape')) && S.players[0].energyDiscard.join() === 'Fire', 'it returns a damaged one to the hand (its tool and Energy are discarded)');
	S = arena(2); x = G(S, 0, 'bench', 0, 'Turtonator'); put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [cg('Kiawe')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'bench', 0) } });
	A(x.energy.join() === 'Fire,Fire' && S.current === 1 && logHas(S, /Kiawe: P1's turn ends/), 'Kiawe attaches 2 Fire Energy to Turtonator and ends its player\'s turn');
	S = arena(3); put(S, 0, 'active', 0, 'Snorlax'); x = put(S, 1, 'active', 0, 'Snorlax', { tool: a2('Giant Cape') }); y = put(S, 2, 'bench', 0, 'Snorlax', { tool: a2('Rocky Helmet') }); put(S, 2, 'active', 0, 'Snorlax'); z = put(S, 0, 'bench', 0, 'Snorlax', { tool: a2('Giant Cape') }); S.players[0].hand = [cg('Guzma')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(!x.tool && !y.tool && z.tool && S.players[1].discard.includes(a2('Giant Cape')), 'Guzma discards every Pokémon Tool on every opponent\'s Pokémon, and none of your own');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); x = put(S, 1, 'active', 0, 'Snorlax'); y = put(S, 1, 'bench', 1, 'Rattata'); S.players[0].hand = [cg('Lana')];
	A(/need Araquanid in play/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { target: L(1, 'active', 0), bench: 1 } }))), 'Lana needs Araquanid in play');
	G(S, 0, 'bench', 0, 'Araquanid'); E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { target: L(1, 'active', 0), bench: 1 } });
	A(S.players[1].active[0] === y && S.players[1].bench[1] === x, 'with it, she brings up any Benched Pokémon of an opponent (damaged or not)');
	S = arena(2); x = G(S, 0, 'active', 0, 'Tsareena', { dmg: 90, energy: ['Grass', 'Grass'] }); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [cg('Mallow')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } });
	A(x.dmg === 0 && x.energy.length === 0 && S.players[0].energyDiscard.length === 2, 'Mallow heals all damage from Tsareena and discards all its Energy');
	S = arena(2); x = put(S, 0, 'active', 0, 'Charizard ex', { dmg: 100 }); y = put(S, 0, 'active', 1, 'Charmeleon', { dmg: 50 }); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [cg('Lillie')];
	A(/Stage 2 Pokémon/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 1) } }))), 'Lillie heals only a Stage 2 Pokémon');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } });
	A(x.dmg === 40, 'by 60');

	// --- the computer player ---
	S = arena(2); S.players[0].zone.cur = null; S.players[0].flags.attached = true; put(S, 0, 'active', 0, 'Charmander'); put(S, 0, 'active', 1, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [cg('Rare Candy'), id('Charizard ex')];
	{ const a = nextAction(E.view(S, 0), new Set()); A(a && a.t === 'trainer' && a.args.pick === 1 && a.args.at.idx === 0, 'the computer player uses Rare Candy to evolve straight to the Stage 2 in its hand', a); E.apply(S, a); A(card(S.players[0].active[0].cards.at(-1)).name === 'Charizard ex', 'and the engine takes it'); }
	S = arena(2); S.players[0].zone.cur = null; S.players[0].flags.attached = true; S.players[0].hand = [cg('Rotom Dex')]; put(S, 0, 'active', 0, 'Snorlax'); put(S, 0, 'active', 1, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	{ const a = nextAction(E.view(S, 0), new Set()); E.apply(S, a); const b = nextAction(E.view(S, 0), new Set()); A(a.t === 'trainer' && b && b.t === 'choose', 'it answers a yes/no question the game asks it', [a, b]); E.apply(S, b); }
	{
		const N = n => cg(n), two = l => l.flatMap(v => [v, v]);
		const decks = [{ deck: two([N('Cosmog'), N('Cosmoem'), N('Solgaleo ex'), N('Magearna'), N('Alolan Diglett'), N('Alolan Dugtrio'), N('Rare Candy'), N('Lillie'), N('Poison Barb'), N('Rotom Dex')]), energy: ['Metal', 'Psychic'] },
			{ deck: two([N('Cosmog'), N('Cosmoem'), N('Lunala ex'), N('Mimikyu'), N('Comfey'), N('Tapu Lele'), N('Acerola'), N('Rare Candy'), N('Big Malasada'), 'A3-077']), energy: ['Psychic'] },
			{ deck: two(['A3-009', N('Dartrix'), N('Decidueye ex'), N('Wimpod'), N('Golisopod'), N('Bounsweet'), N('Steenee'), N('Tsareena'), N('Mallow'), N('Leaf Cape')]), energy: ['Grass'] },
			{ deck: two([N('Passimian ex'), N('Oranguru'), N('Komala'), N('Bewear'), N('Stufful'), N('Drampa'), N('Ilima'), N('Guzma'), N('Alolan Rattata'), N('Alolan Raticate')]), energy: ['Fighting', 'Darkness'] }];
		A(decks.every(d => E.deckError(d.deck, d.energy) === null), 'four Celestial Guardians decks are legal', decks.map(d => E.deckError(d.deck, d.energy)));
		const bad = []; let over = 0;
		for (let g = 0; g < 16; g++) {
			const config = { seed: 'alola' + g, rules: E.RULES, players: [0, 1, 2, 3].slice(0, 2 + (g % 3)).map(i => ({ name: 'P' + i, ai: true, ...decks[(i + g) % 4] })) }, S2 = E.createGame(config), actions = [];
			try {
				for (let step = 0; step < 4000 && !S2.over; step++) {
					const seat = S2.pending ? S2.pending.seat : S2.phase === 'setup' ? S2.players.find(p => !p.setup).seat : S2.current, banned = new Set();
					let done = false;
					for (let t = 0; t < 40 && !done; t++) { const a = nextAction(E.view(S2, seat), banned) || { t: 'execute', seat, commands: [null, null] }; try { E.apply(S2, a); actions.push(a); done = true; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); } }
					if (!done) { bad.push(g + ': stuck'); break; }
				}
				if (S2.over) over++;
				if (E.digest(E.replay(config, actions)) !== E.digest(S2)) bad.push(g + ': replay differs');
				for (const p of S2.players) { const total = p.deck.length + p.hand.length + p.discard.length + [...p.active, ...p.bench].filter(Boolean).reduce((a, k) => a + k.cards.length + (k.tool ? 1 : 0), 0); if (total !== 20) bad.push(`${g}: ${p.name} has ${total} cards`); }
			} catch (e) { bad.push(g + ': ' + e.message); }
		}
		A(over === 16 && bad.length === 0, 'computer players finish 16 matches with Celestial Guardians decks (2, 3 and 4 players): every replay matches and every card is accounted for', { over, bad: bad.slice(0, 4) });
	}
}

// ===== 17. Extradimensional Crisis (A3a): each new effect, played =====
{
	const of = set => name => { const c = CARDS.find(x => x.set === set && x.name === name); if (!c) throw new Error(`no ${set} card ${name}`); return c.id; };
	const xc = of('A3a'), a2 = of('A2');
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const G = (S, seat, zone, idx, name, o) => putId(S, seat, zone, idx, xc(name), o);
	const dmgs = S => S.log.filter(e => e.k === 'damage').map(e => e.msg);
	const SN = () => card(id('Snorlax')).attacks.length - 1;
	const seeds = (n, f) => { const out = {}; for (let g = 0; g < n; g++) { const r = f('x' + g); out[r] = (out[r] || 0) + 1; } return out; };
	const FOUR = ['Fire', 'Fire', 'Fire', 'Fire'];
	let S, x, y, z;

	// --- the data ---
	A(CARDS.filter(c => c.ub).map(c => c.name.replace(/ ex$/, '')).filter((n, i, l) => l.indexOf(n) === i).sort().join() === 'Blacephalon,Buzzwole,Celesteela,Guzzlord,Kartana,Naganadel,Nihilego,Pheromosa,Poipole,Stakataka,Xurkitree' && !card(xc('Tapu Koko ex')).ub,
		'the eleven Ultra Beasts are marked as Ultra Beasts, and no other Pokémon is');
	A(card('A2-126').attacks.find(a => a.name === 'Quick Attack').damageMode === '+' && card('A1a-061').attacks[0].damageMode === 'x' && card(id('Snorlax')).attacks[0].damageMode === '',
		'an attack whose text adds or multiplies damage shows its "+" or "×" even where the source record dropped it');

	// --- attacks ---
	S = arena(2); G(S, 0, 'active', 0, 'Passimian', { energy: ['Fighting', 'Fighting'] }); G(S, 0, 'active', 1, 'Passimian', { energy: ['Fighting', 'Fighting'] }); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/base 40\b/.test(dmgs(S)[0]), "Let's Throw does 40 with no Passimian on the Bench (one in the other Active slot does not count)");
	S = arena(2); G(S, 0, 'active', 0, 'Passimian', { energy: ['Fighting', 'Fighting'] }); G(S, 0, 'bench', 0, 'Passimian'); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/base 80\b/.test(dmgs(S)[0]), 'and 40 + 40 with one there');
	S = arena(2); G(S, 0, 'active', 0, 'Alolan Meowth', { energy: ['Darkness'] }); put(S, 1, 'active', 0, 'Snorlax'); S.players[1].hand = [id('Potion'), a2('Giant Cape'), id('Giovanni')];
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(S.players[1].discard.join() === a2('Giant Cape') && S.players[1].hand.includes(id('Potion')) && S.players[1].hand.includes(id('Giovanni')), 'Meddle discards a Pokémon Tool card (and only that) from its target\'s owner\'s hand');
	{ const r = seeds(12, sd => { const T = arena(2, sd); G(T, 0, 'active', 0, 'Krookodile', { energy: ['Darkness', 'Darkness', 'Fire'] }); put(T, 1, 'active', 0, 'Snorlax'); put(T, 1, 'bench', 0, 'Snorlax'); T.players[1].hand = [id('Potion'), id('Giovanni')]; const dk = T.players[1].deck.length;
			exec(T, { attack: 0, target: L(1, 'active', 0) }); const heads = T.log.filter(e => e.k === 'coin' && /Poaching Fangs/.test(e.msg) && e.heads).length, moved = Math.min(heads, 2);
			return T.players[1].hand.length === 3 - moved && T.players[1].deck.length === dk + moved - 1 ? 'h' + heads : 'bad'; });   // (then that player draws for their turn)
		A(!r.bad && Object.keys(r).length > 1, 'Poaching Fangs: for each heads of three coins, a random card of that hand is shuffled into its owner\'s deck', r); }
	{ const r = seeds(12, sd => { const T = arena(2, sd); G(T, 0, 'active', 0, 'Guzzlord ex', { energy: ['Fire', 'Fire'] }); const d = put(T, 1, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire'] }); put(T, 1, 'bench', 0, 'Snorlax');
			exec(T, { attack: 0, target: L(1, 'active', 0) }); const heads = T.log.filter(e => e.k === 'coin' && /Grindcore/.test(e.msg) && e.heads).length;
			return d.energy.length === 2 - Math.min(heads, 2) ? 'h' + Math.min(heads, 2) : 'bad'; });
		A(!r.bad && r.h0 > 0 && Object.keys(r).length > 1, 'Grindcore flips until tails and discards a random Energy from its target for each heads', r); }
	{ const r = seeds(16, sd => { const T = arena(2, sd); G(T, 0, 'active', 0, 'Bewear', { energy: ['Fire', 'Fire', 'Fire'] }); const d = put(T, 1, 'active', 0, 'Snorlax'); put(T, 1, 'bench', 0, 'Snorlax');
			exec(T, { attack: 0, target: L(1, 'active', 0) }); const heads = T.log.filter(e => e.k === 'coin' && /Superpowered Hug/.test(e.msg) && e.heads).length;
			if (T.pending) E.apply(T, { t: 'choose', seat: T.pending.seat, pick: 0 });
			const ko = T.players[0].points === 1 && !T.players[1].bench[0]; return heads === 2 ? (ko ? 'ko' : 'bad') : (d.dmg === 0 && T.players[0].points === 0 ? 'none' : 'bad'); });
		A(!r.bad && r.ko > 0 && r.none > 0, 'Superpowered Hug knocks its target out on two heads (a point is scored), and does nothing otherwise', r); }
	S = arena(2); G(S, 0, 'active', 0, 'Silvally', { energy: ['Fire', 'Fire'] }); G(S, 0, 'active', 1, 'Silvally', { energy: ['Fire', 'Fire'] }); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'active', 1, 'Snorlax'); S.players[0].hand = [xc('Looker')];
	S.players[1].deck = [id('Giovanni'), id('Potion'), id('Sabrina'), id('Charmander')];
	A(/choose an opponent/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 0 } }))), 'Looker needs an opponent');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 1 } });
	{ const e = S.log.find(e2 => e2.k === 'reveal'), seen = E.view(S, 1).log.concat(E.view(S, null).log).map(e2 => e2.msg + (e2.more || '')).join(' ');
		A(e && e.privateTo === 0 && /Giovanni, Sabrina\.$/.test(e.privateMsg) && !/Sabrina/.test(seen) && E.view(S, 0).log.some(e2 => /Giovanni, Sabrina/.test(e2.more || '')), 'Looker shows its player (and nobody else) the Supporter cards in that opponent\'s deck'); }
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/base 100\b/.test(dmgs(S)[0]), 'Brave Buddies does 50 + 50 on a turn its player played a Supporter');
	exec(S); exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/base 50\b/.test(dmgs(S).at(-1)), 'and 50 on a turn without one');

	// --- Abilities ---
	S = arena(2); G(S, 0, 'active', 0, 'Luxray'); x = put(S, 0, 'active', 1, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax', { energy: FOUR }); y = put(S, 1, 'bench', 0, 'Snorlax', { energy: FOUR }); S.current = 1;
	exec(S, { attack: SN(), target: L(0, 'active', 1) });
	A(/-20 Intimidating Fang/.test(dmgs(S)[0]), 'Intimidating Fang: with Luxray in an Active slot, an opposing Active Pokémon\'s attack does 20 less');
	S = arena(2); G(S, 0, 'bench', 0, 'Luxray'); put(S, 0, 'active', 1, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax', { energy: FOUR }); S.current = 1;
	exec(S, { attack: SN(), target: L(0, 'active', 1) });
	A(!/Intimidating Fang/.test(dmgs(S)[0]), 'not with Luxray on the Bench');
	S = arena(2); x = G(S, 0, 'bench', 0, 'Zeraora'); put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].turns = 0;
	exec(S);
	A(x.energy.join() === 'Lightning' && S.players[0].turns === 1, 'Thunderclap Flash: at the end of its player\'s first turn Zeraora takes a Lightning Energy from the Energy Zone');
	exec(S); exec(S);
	A(x.energy.length === 1, 'and not at the end of a later turn');
	S = arena(2); G(S, 0, 'bench', 0, 'Shiinotic'); put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = []; S.players[0].deck = [id('Potion'), id('Giovanni'), id('Squirtle'), id('Potion')];
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: {} });
	A(S.players[0].hand.join() === id('Squirtle') && S.players[0].deck.length === 3 && /already been used/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: {} }))), 'Illuminate puts a random Pokémon (never another card) from the deck into the hand, once a turn');
	S = arena(2); G(S, 0, 'bench', 0, 'Claydol'); x = put(S, 0, 'active', 0, 'Snorlax', { dmg: 50 }); y = put(S, 1, 'active', 0, 'Snorlax', { dmg: 50 }); S.players[0].hand = [id('Potion')]; S.players[1].hand = [id('Potion')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } }); exec(S); E.apply(S, { t: 'trainer', seat: 1, hand: 0, args: { at: L(1, 'active', 0) } });
	A(x.dmg === 50 && y.dmg === 50, 'Heal Block: with Claydol in play, no Pokémon of any player is healed');
	S.players[0].bench[0] = null; S.players[1].hand = [id('Potion')]; E.apply(S, { t: 'trainer', seat: 1, hand: 0, args: { at: L(1, 'active', 0) } });
	A(y.dmg === 30, 'and healing works again once it is gone');
	S = arena(2); G(S, 0, 'bench', 0, 'Nihilego'); put(S, 0, 'active', 0, 'Snorlax'); x = put(S, 1, 'active', 0, 'Snorlax'); x.status.poisoned = { by: 0 }; y = put(S, 1, 'active', 1, 'Snorlax');
	exec(S);
	A(x.dmg === 20 && y.dmg === 0, 'More Poison: an opposing Active Pokémon that is Poisoned takes 10 more from it');
	S = arena(2); G(S, 0, 'active', 0, 'Stoutland'); x = put(S, 1, 'active', 0, 'Snorlax', { energy: FOUR }); y = put(S, 1, 'bench', 0, 'Snorlax');
	A(E.view(S, 1).players[1].active[0].less === -1 && E.view(S, 1).players[1].bench[0].less === 0 && /does not have the Energy/.test(E.attackBlock(S, 1, x, card(id('Snorlax')).attacks[SN()]) || ''), 'Guard Dog Visage: with Stoutland in an Active slot, opposing Active Pokémon\'s attacks cost 1 more');
	x.energy.push('Fire');
	A(!E.attackBlock(S, 1, x, card(id('Snorlax')).attacks[SN()]), 'one more Energy pays for it');
	S = arena(2); x = G(S, 0, 'active', 0, 'Celesteela'); y = G(S, 0, 'bench', 1, 'Kartana'); z = put(S, 0, 'active', 1, 'Snorlax'); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	A(/Ultra Beasts in an Active slot/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { slot: 1, bench: 1 } }))) && /Benched Ultra Beasts/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { slot: 0, bench: 0 } }))), 'Ultra Thrusters moves only Ultra Beasts');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { slot: 0, bench: 1 } });
	A(S.players[0].active[0] === y && S.players[0].bench[1] === x && y.movedUp === S.turn, 'it switches an Active Ultra Beast with a Benched one');

	// --- Trainers and Pokémon Tools ---
	S = arena(2); x = G(S, 0, 'active', 0, 'Kartana'); y = put(S, 0, 'active', 1, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax', { energy: FOUR }); put(S, 1, 'active', 1, 'Snorlax', { energy: FOUR }); S.players[0].hand = [xc('Beast Wall'), xc('Beast Wall')];
	S.players[1].points = 1;
	A(/already gotten points/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }))), 'Beast Wall cannot be played once an opponent has a point');
	S.players[1].points = 0; E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }); exec(S);
	exec(S, { attack: SN(), target: L(0, 'active', 0) }, { attack: SN(), target: L(0, 'active', 1) });
	A(/-20 Beast Wall/.test(dmgs(S)[0]) && !/Beast Wall/.test(dmgs(S)[1]), 'played before that, your Ultra Beasts (and no other Pokémon) take 20 less from attacks until your next turn');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); x = put(S, 1, 'active', 0, 'Charmeleon'); y = put(S, 1, 'active', 1, 'Snorlax'); put(S, 1, 'bench', 0, 'Rattata'); z = put(S, 1, 'bench', 2, 'Pikachu'); S.players[0].hand = [xc('Repel')];
	A(/Basic Pokémon/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { target: L(1, 'active', 0) } }))), 'Repel takes only an Active Basic Pokémon');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { target: L(1, 'active', 1) } });
	A(S.pending && S.pending.seat === 1 && S.pending.kind === 'switchIn', 'its owner chooses the Pokémon that comes up');
	E.apply(S, { t: 'choose', seat: 1, pick: 2 });
	A(S.players[1].active[1] === z && S.players[1].bench[2] === y, 'and the two trade places');
	S = arena(2); x = put(S, 0, 'active', 0, 'Pikachu', { energy: ['Lightning', 'Lightning', 'Fire'], tool: xc('Electrical Cord'), dmg: 50 }); put(S, 0, 'active', 1, 'Snorlax'); y = put(S, 0, 'bench', 0, 'Snorlax'); z = put(S, 0, 'bench', 3, 'Snorlax'); const mid = put(S, 0, 'bench', 1, 'Snorlax');
	put(S, 1, 'active', 0, 'Snorlax', { energy: FOUR }); S.current = 1;
	exec(S, { attack: SN(), target: L(0, 'active', 0) });
	A(S.pending && S.pending.kind === 'pickTarget' && S.pending.seat === 0 && S.pending.locs.length === 3, 'Electrical Cord: its Lightning holder Knocked Out in an Active slot by an attack, its player chooses a Benched Pokémon for a Lightning Energy');
	E.apply(S, { t: 'choose', seat: 0, pick: 2 });
	A(S.pending && S.pending.locs.length === 2, 'then another Benched Pokémon for the second');
	E.apply(S, { t: 'choose', seat: 0, pick: 0 });
	A(z.energy.join() === 'Lightning' && y.energy.join() === 'Lightning' && mid.energy.length === 0 && S.players[0].energyDiscard.join() === 'Fire' && S.players[0].discard.includes(xc('Electrical Cord')), 'one Energy each to the two chosen; the rest is discarded with the Pokémon and the card');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax', { energy: ['Lightning', 'Lightning'], tool: xc('Electrical Cord'), dmg: 140 }); y = put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax', { energy: FOUR }); S.current = 1;
	exec(S, { attack: SN(), target: L(0, 'active', 0) });
	A(y.energy.length === 0 && (!S.pending || S.pending.kind !== 'pickTarget'), 'on a Pokémon that is not Lightning it does nothing');
	S = arena(2); G(S, 0, 'active', 0, 'Kartana', { energy: ['Grass'], tool: xc('Beastite') }); put(S, 0, 'active', 1, 'Rattata', { energy: ['Fire'], tool: xc('Beastite') }); put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax'); S.players[0].points = 2;
	exec(S, { attack: 0, target: L(1, 'active', 0) }, { attack: 0, target: L(1, 'active', 0) });
	A(/\+20 Beastite/.test(dmgs(S)[0]) && !/Beastite/.test(dmgs(S)[1]), 'Beastite: an Ultra Beast\'s attacks do +10 for each point its player has (2); on another Pokémon it does nothing');
	S = arena(2); x = G(S, 0, 'active', 0, 'Kartana'); y = put(S, 0, 'active', 1, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); S.players[0].hand = [xc('Lusamine')]; S.players[0].energyDiscard = ['Grass', 'Fire', 'Water'];
	A(/no opponent has gotten a point/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } }))), 'Lusamine cannot be played before an opponent has a point');
	S.players[1].points = 1;
	A(/Ultra Beasts/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 1) } }))), 'nor on a Pokémon that is not an Ultra Beast');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } });
	A(x.energy.length === 2 && S.players[0].energyDiscard.length === 1 && [...x.energy, ...S.players[0].energyDiscard].sort().join() === 'Fire,Grass,Water', 'after that, she attaches 2 random Energy from the discard pile to an Ultra Beast');

	// --- the computer player ---
	S = arena(2); S.players[0].zone.cur = null; S.players[0].flags.attached = true; S.players[0].hand = []; G(S, 0, 'active', 0, 'Celesteela'); G(S, 0, 'bench', 0, 'Kartana', { energy: ['Grass'] }); put(S, 0, 'active', 1, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	{ const a = nextAction(E.view(S, 0), new Set()); A(a && a.t === 'ability' && a.args.slot === 0 && a.args.bench === 0, 'the computer player uses Ultra Thrusters to bring up an Ultra Beast that can attack', a); }
	S = arena(2); S.players[0].zone.cur = null; S.players[0].flags.attached = true; S.players[0].hand = [xc('Lusamine')]; S.players[0].energyDiscard = ['Grass', 'Grass']; S.players[1].points = 1; G(S, 0, 'active', 0, 'Kartana'); put(S, 0, 'active', 1, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax');
	{ const a = nextAction(E.view(S, 0), new Set()); A(a && a.t === 'trainer' && a.args.at && a.args.at.idx === 0, 'and plays Lusamine on an Ultra Beast when it may', a); }
	{
		const N = n => xc(n), two = l => l.flatMap(v => [v, v]);
		const decks = [{ deck: two([N('Buzzwole ex'), N('Pheromosa'), N('Kartana'), N('Nihilego'), N('Poipole'), N('Naganadel'), N('Celesteela'), N('Beastite'), N('Lusamine'), N('Beast Wall')]), energy: ['Grass', 'Darkness'] },
			{ deck: two([N('Tapu Koko ex'), N('Zeraora'), N('Shinx'), N('Luxio'), N('Luxray'), N('Xurkitree'), N('Electrical Cord'), N('Repel'), N('Emolga'), N('Looker')]), energy: ['Lightning'] },
			{ deck: two([N('Guzzlord ex'), N('Alolan Meowth'), N('Alolan Persian'), N('Sandile'), N('Krokorok'), N('Krookodile'), N('Type: Null'), N('Silvally'), N('Gladion'), N('Stakataka')]), energy: ['Darkness', 'Metal'] },
			{ deck: two([N('Lillipup'), N('Herdier'), N('Stoutland'), N('Stufful'), N('Bewear'), N('Baltoy'), N('Claydol'), N('Morelull'), N('Shiinotic'), N('Blacephalon')]), energy: ['Fighting', 'Fire'] }];
		A(decks.every(d => E.deckError(d.deck, d.energy) === null), 'four Extradimensional Crisis decks are legal', decks.map(d => E.deckError(d.deck, d.energy)));
		const bad = []; let over = 0;
		for (let g = 0; g < 16; g++) {
			const config = { seed: 'ultra' + g, rules: E.RULES, players: [0, 1, 2, 3].slice(0, 2 + (g % 3)).map(i => ({ name: 'P' + i, ai: true, ...decks[(i + g) % 4] })) }, S2 = E.createGame(config), actions = [];
			try {
				for (let step = 0; step < 4000 && !S2.over; step++) {
					const seat = S2.pending ? S2.pending.seat : S2.phase === 'setup' ? S2.players.find(p => !p.setup).seat : S2.current, banned = new Set();
					let done = false;
					for (let t = 0; t < 40 && !done; t++) { const a = nextAction(E.view(S2, seat), banned) || { t: 'execute', seat, commands: [null, null] }; try { E.apply(S2, a); actions.push(a); done = true; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); } }
					if (!done) { bad.push(g + ': stuck'); break; }
				}
				if (S2.over) over++;
				if (E.digest(E.replay(config, actions)) !== E.digest(S2)) bad.push(g + ': replay differs');
				for (const p of S2.players) { const total = p.deck.length + p.hand.length + p.discard.length + [...p.active, ...p.bench].filter(Boolean).reduce((a, k) => a + k.cards.length + (k.tool ? 1 : 0), 0); if (total !== 20) bad.push(`${g}: ${p.name} has ${total} cards`); }
			} catch (e) { bad.push(g + ': ' + e.message); }
		}
		A(over === 16 && bad.length === 0, 'computer players finish 16 matches with Extradimensional Crisis decks (2, 3 and 4 players): every replay matches and every card is accounted for', { over, bad: bad.slice(0, 4) });
	}
}

//// ===== 18. Eevee Grove (A3b): each new effect, played =====
{
	const of = set => name => { const c = CARDS.find(x => x.set === set && x.name === name); if (!c) throw new Error(`no ${set} card ${name}`); return c.id; };
	const eg = of('A3b'), a2 = of('A2'), a3 = of('A3');
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const G = (S, seat, zone, idx, name, o) => putId(S, seat, zone, idx, eg(name), o);
	const dmgs = S => S.log.filter(e => e.k === 'damage').map(e => e.msg);
	const SN = () => card(id('Snorlax')).attacks.length - 1;
	const seeds = (n, f) => { const out = {}; for (let g = 0; g < n; g++) { const r = f('e' + g); out[r] = (out[r] || 0) + 1; } return out; };
	const FOUR = ['Fire', 'Fire', 'Fire', 'Fire'];
	const foe = S => { put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax'); };
	let S, x, y, z;

	// --- attacks ---
	S = arena(2); G(S, 0, 'active', 0, 'Leafeon', { energy: ['Grass', 'Grass', 'Fire'] }); foe(S);
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/base 50\b/.test(dmgs(S)[0]), 'Leaf Blast does 10 + 20 for each Grass Energy on its user (2), and not for other Energy');
	S = arena(2); G(S, 0, 'active', 0, 'Tsareena', { energy: ['Grass'] }); foe(S); S.players[1].hand = [id('Potion')]; x = S.players[1].deck.length;
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(S.players[1].deck.length === x && !S.log.some(e => e.k === 'coin') && logHas(S, /reveals Potion from their hand and shuffles it into their deck/), 'Kick Down sends a random card of its target\'s owner\'s hand into their deck, with no coin');
	S = arena(2); G(S, 0, 'active', 0, 'Milcery', { energy: ['Fire'] }); G(S, 0, 'active', 1, 'Slurpuff', { energy: ['Fire', 'Fire'] }); x = G(S, 0, 'bench', 0, 'Alcremie', { energy: ['Fire'] }); put(S, 1, 'active', 0, 'Snorlax', { tool: a2('Giant Cape') }); put(S, 1, 'active', 1, 'Snorlax', { tool: a2('Giant Cape') }); put(S, 1, 'bench', 0, 'Snorlax'); put(S, 1, 'bench', 1, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) }, { attack: 0, target: L(1, 'active', 1) });
	A(/base 10\b/.test(dmgs(S)[0]) && /base 30\b/.test(dmgs(S)[1]), 'Sweets Relay has no bonus the first time, and one used earlier in the same turn does not count');
	exec(S); exec(S, { attack: 0, target: L(1, 'active', 0) }, { attack: 0, target: L(1, 'active', 1) });
	A(/base 30\b/.test(dmgs(S)[2]) && /base 90\b/.test(dmgs(S)[3]), 'the turn after one was used, each does its bonus (10 + 20, 30 + 60)');
	exec(S); exec(S); exec(S); exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/base 10\b/.test(dmgs(S).at(-1)) && S.players[0].relays === 5, 'a turn without it breaks the chain; the match still counts every use (5)');
	exec(S); S.players[0].active[0] = x; S.players[0].bench[0] = null; S.players[1].active[0].dmg = 0;
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/base 200\b/.test(dmgs(S).at(-1)), 'Sweets Overload does 40 for each time Sweets Relay was used this match (5)');
	S = arena(2); x = G(S, 0, 'active', 0, 'Eevee', { energy: ['Lightning'] }); G(S, 0, 'active', 1, 'Jolteon', { energy: ['Lightning'] }); foe(S); put(S, 1, 'active', 1, 'Snorlax'); S.players[0].hand = [eg('Jolteon')];
	E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) }); exec(S, { attack: 0, target: L(1, 'active', 0) }, { attack: 0, target: L(1, 'active', 1) });
	A(/base 60\b/.test(dmgs(S)[0]) && /base 40\b/.test(dmgs(S)[1]), 'Beginning Bolt does 40 + 20 the turn its user evolved, and 40 otherwise');
	S = arena(2); x = G(S, 0, 'active', 0, 'Galvantula', { energy: ['Lightning', 'Lightning', 'Fire'] }); foe(S);
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(x.energy.length === 0 && logHas(S, /Snorlax is now Paralyzed/), 'Electric Shock discards all its user\'s Energy and Paralyzes its target');
	S = arena(2); G(S, 0, 'active', 0, 'Espeon', { energy: ['Psychic'] }); put(S, 1, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire'] }); put(S, 1, 'bench', 0, 'Snorlax', { energy: ['Water'] }); put(S, 1, 'bench', 3, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/base 60\b/.test(dmgs(S)[0]), 'Energy Crush does 20 for each Energy on all the Pokémon of its target\'s owner (3)');
	S = arena(2); G(S, 0, 'active', 0, 'Sylveon', { energy: ['Psychic', 'Fire'] }); G(S, 0, 'active', 1, 'Leafeon'); G(S, 0, 'bench', 0, 'Leafeon'); put(S, 0, 'bench', 1, 'Charizard ex'); put(S, 0, 'bench', 2, 'Snorlax'); foe(S);
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/base 100\b/.test(dmgs(S)[0]), 'Evoharmony does 40 + 30 for each Evolution Pokémon on its player\'s Bench (2: not Basic ones, not the other Active)');
	{ const r = seeds(12, sd => { const T = arena(2, sd); G(T, 0, 'active', 0, 'Mimikyu', { energy: ['Psychic', 'Psychic'] }); const d = put(T, 1, 'active', 0, 'Snorlax'); put(T, 1, 'active', 1, 'Charizard ex'); put(T, 1, 'bench', 0, 'Snorlax');
			exec(T, { attack: 0, target: L(1, 'active', 0), args: { from: L(1, 'active', 1), attack: 0 } }); const heads = T.log.some(e => e.k === 'coin' && e.heads), copied = T.log.some(e => /copies Charizard ex's/.test(e.msg));
			return heads === copied && (heads ? d.dmg > 0 : d.dmg === 0) ? (heads ? 'copy' : 'none') : 'bad'; });
		A(!r.bad && r.copy > 0 && r.none > 0, 'Try to Imitate: on heads it uses the chosen attack of an opposing Active Pokémon; on tails it does nothing', r); }
	S = arena(2); G(S, 0, 'active', 0, 'Whiscash', { energy: ['Fighting', 'Fire', 'Fire', 'Fire'] }); x = put(S, 0, 'bench', 0, 'Snorlax'); y = put(S, 0, 'bench', 3, 'Snorlax'); z = put(S, 0, 'active', 1, 'Snorlax'); foe(S);
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(x.dmg === 10 && y.dmg === 10 && z.dmg === 0 && S.players[1].bench[0].dmg === 0, 'Earthquake also does 10 to each of its own player\'s Benched Pokémon (and to no other)');
	S = arena(2); G(S, 0, 'active', 0, 'Umbreon', { energy: ['Darkness'] }); G(S, 0, 'active', 1, 'Umbreon', { energy: ['Darkness'] }); x = put(S, 1, 'active', 0, 'Snorlax', { energy: FOUR }); y = put(S, 1, 'active', 1, 'Charmeleon', { energy: FOUR }); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) }, { attack: 0, target: L(1, 'active', 1) });
	A(x.fx.some(f => f.k === 'cantAttack') && !y.fx.some(f => f.k === 'cantAttack') && /can't attack/.test(E.attackBlock(S, 1, x, card(id('Snorlax')).attacks[SN()]) || ''), 'Dark Binding: a Basic Pokémon it hits cannot attack on its owner\'s next turn; an evolved one can');
	S = arena(2); G(S, 0, 'active', 0, 'Purrloin', { energy: ['Darkness'] }); x = put(S, 1, 'active', 0, 'Snorlax', { tool: a2('Giant Cape') }); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(!x.tool && x.dmg === 0 && S.players[1].discard.includes(a2('Giant Cape')), 'Playful Knockdown discards the Pokémon Tool of its target and does no damage');
	{ const r = seeds(12, sd => { const T = arena(2, sd); G(T, 0, 'active', 0, 'Drampa', { energy: ['Fire', 'Fire'] }); const d = put(T, 1, 'active', 0, 'Snorlax'); put(T, 1, 'bench', 0, 'Snorlax');
			exec(T, { attack: 0, target: L(1, 'active', 0) }); const heads = T.log.some(e => e.k === 'coin' && e.heads), par = T.log.some(e => /Snorlax is now Paralyzed/.test(e.msg));
			return heads ? (par && d.dmg > 0 ? 'hit' : 'bad') : (!par && d.dmg === 0 ? 'none' : 'bad'); });
		A(!r.bad && r.hit > 0 && r.none > 0, 'Dragon Breath: on tails nothing; on heads its damage and Paralyzed', r); }

	// --- Abilities ---
	S = arena(2); x = G(S, 0, 'active', 0, 'Flareon ex'); foe(S);
	A(/no Fire Energy in your discard pile/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: {} }))), 'Combust needs a Fire Energy in the discard pile');
	S.players[0].energyDiscard = ['Water', 'Fire', 'Fire']; E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: {} });
	A(x.energy.join() === 'Fire' && x.dmg === 20 && S.players[0].energyDiscard.join() === 'Water,Fire' && /already been used/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: {} }))), 'it attaches one to Flareon ex and does 20 damage to it, once a turn');
	S = arena(2); x = G(S, 0, 'bench', 0, 'Flareon ex', { dmg: card(eg('Flareon ex')).hp - 20 }); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].energyDiscard = ['Fire'];
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: {} });
	A(S.players[0].bench[0] === null && S.players[1].points === 2, 'a Flareon ex that knocks itself out with it gives its points to the opponent');
	S = arena(2); x = G(S, 0, 'active', 0, 'Eevee'); y = G(S, 0, 'active', 1, 'Eevee'); foe(S); S.players[0].hand = [eg('Sylveon ex'), eg('Sylveon ex')]; S.players[0].deck = [id('Potion'), id('Giovanni'), id('Charmander'), id('Squirtle')];
	E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) });
	A(S.pending && S.pending.kind === 'confirm' && S.pending.seat === 0, 'Happy Ribbon: played from the hand to evolve, Sylveon ex offers its player 2 cards');
	E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(S.players[0].hand.length === 3 && S.players[0].deck.length === 2, 'Yes draws them');
	E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 1) });
	A(!S.pending && S.players[0].hand.length === 2 && card(y.cards.at(-1)).name === 'Sylveon ex', 'once a turn: a second Sylveon ex that turn evolves without the offer');
	S = arena(2); x = G(S, 0, 'active', 0, 'Eevee'); foe(S); S.players[0].hand = [eg('Sylveon ex')]; S.players[0].deck = [id('Potion'), id('Giovanni')];
	E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) }); E.apply(S, { t: 'choose', seat: 0, pick: 0 });
	A(S.players[0].hand.length === 0 && S.players[0].deck.length === 2, 'No draws nothing');
	S = arena(2); x = G(S, 0, 'active', 0, 'Eevee ex'); y = put(S, 0, 'active', 1, 'Snorlax'); foe(S); S.players[0].hand = [id('Charmeleon'), eg('Flareon')];
	A(/evolves from Charmander/.test(refused(() => E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) }))) && /evolves from Eevee/.test(refused(() => E.apply(S, { t: 'evolve', seat: 0, hand: 1, at: L(0, 'active', 1) }))), 'Veevee \'volve: Eevee ex takes only a card that evolves from Eevee (and no other Pokémon takes one)');
	x.turnPlayed = S.turn;
	A(/the turn it was played/.test(refused(() => E.apply(S, { t: 'evolve', seat: 0, hand: 1, at: L(0, 'active', 0) }))), 'not on the turn it is played');
	x.turnPlayed = -1; E.apply(S, { t: 'evolve', seat: 0, hand: 1, at: L(0, 'active', 0) });
	A(card(x.cards.at(-1)).name === 'Flareon' && x.cards.length === 2, 'and then it evolves into it');
	S = arena(2); x = G(S, 0, 'active', 0, 'Snorlax ex', { dmg: 50 }); y = G(S, 0, 'bench', 0, 'Snorlax ex', { dmg: 50 }); z = put(S, 0, 'active', 1, 'Snorlax', { dmg: 50, tool: eg('Leftovers') }); const lb = put(S, 0, 'bench', 1, 'Snorlax', { dmg: 50, tool: eg('Leftovers') }); foe(S);
	exec(S);
	A(x.dmg === 30 && y.dmg === 50 && z.dmg === 40 && lb.dmg === 50, 'at the end of its player\'s turn Full-Mouth Manner heals 20 and Leftovers heals 10, in an Active slot only');
	exec(S);
	A(x.dmg === 30 && z.dmg === 40, 'and not at the end of an opponent\'s turn');
	S = arena(2); G(S, 0, 'bench', 0, 'Ambipom'); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = []; S.players[0].deck = [id('Potion'), id('Squirtle'), eg('Leftovers'), id('Giovanni')];
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: {} });
	A(S.players[0].hand.join() === eg('Leftovers') && S.players[0].deck.length === 3, 'Catching Tail puts a random Pokémon Tool card (never another card) from the deck into the hand');

	// --- Trainers ---
	S = arena(2); G(S, 0, 'active', 0, 'Leafeon', { energy: ['Fire'], dmg: 30 }); put(S, 0, 'active', 1, 'Rattata', { energy: ['Fire'], dmg: 20 }); x = G(S, 0, 'bench', 0, 'Flareon', { dmg: 10 }); foe(S); put(S, 1, 'active', 1, 'Snorlax'); S.players[0].hand = [eg('Eevee Bag'), eg('Eevee Bag')];
	A(/choose one of the two effects/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }))), 'Eevee Bag needs one of its two effects chosen');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { pick: 1 } });
	A(S.players[0].active[0].dmg === 10 && S.players[0].active[1].dmg === 20 && x.dmg === 0, 'the second heals 20 from each of your Pokémon that evolves from Eevee (and from no other)');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { pick: 0 } }); exec(S, { attack: 0, target: L(1, 'active', 0) }, { attack: 0, target: L(1, 'active', 1) });
	A(/\+10 Eevee Bag/.test(dmgs(S)[0]) && !/Eevee Bag/.test(dmgs(S)[1]), 'the first gives their attacks +10 this turn (and no other Pokémon\'s)');
	S = arena(2); putId(S, 0, 'active', 0, a3('Decidueye ex'), { energy: ['Fire', 'Fire'] }); put(S, 0, 'active', 1, 'Rattata', { energy: ['Fire'] }); put(S, 1, 'active', 0, 'Snorlax', { dmg: 10 }); put(S, 1, 'active', 1, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax'); S.players[0].hand = [eg('Hau')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }); exec(S, { attack: 0, target: L(1, 'active', 0) }, { attack: 0, target: L(1, 'active', 1) });
	A(/\+30 Hau/.test(dmgs(S)[0]) && !/Hau/.test(dmgs(S)[1]), 'Hau gives Decidueye ex +30 this turn, and no other Pokémon');
	S = arena(2); put(S, 0, 'active', 0, 'Rattata', { energy: ['Fire'] }); foe(S); S.players[0].hand = [eg('Penny'), id('Sabrina')]; S.players[1].deck = [eg('Penny'), id('Potion'), id('Giovanni'), id('Charmander')];
	A(/no effect for Penny/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, penny: true, args: {} }))) && /choose an opponent/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }))), 'Penny needs an opponent, and has no effect to use before she is played');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 1 } });
	A(E.view(S, 0).players[0].flags.penny === id('Giovanni') && E.view(S, 1).players[0].flags.penny === null && E.view(S, null).players[0].flags.penny === null && S.players[1].deck.length === 4 && E.view(S, 0).log.some(e => /It is Giovanni/.test(e.more || '')) && !E.view(S, 1).log.some(e => /Giovanni/.test(e.msg + (e.more || ''))),
		'Penny finds a random Supporter that is not Penny in that opponent\'s deck (which keeps it); only her player is shown which');
	A(/already played a Supporter/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { target: L(1, 'active', 0) } }))), 'she was this turn\'s Supporter');
	E.apply(S, { t: 'trainer', seat: 0, penny: true, args: {} });
	A(S.players[0].flags.boost.length === 1 && logHas(S, /Penny: P1 uses the effect of Giovanni/) && S.players[0].discard.join() === eg('Penny') && /no effect for Penny/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, penny: true, args: {} }))), 'her player then uses that card\'s effect as hers, once (the card itself stays where it was)');
	exec(S, { attack: 0, target: L(1, 'active', 0) });
	A(/\+10 Giovanni/.test(dmgs(S)[0]), 'and it works as the card would');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [eg('Penny')]; S.players[1].deck = [id('Giovanni')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 1 } }); exec(S); exec(S);
	A(!S.players[0].flags.penny, 'an effect she found and her player did not use is gone when the turn ends');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [eg('Penny')]; S.players[1].deck = [eg('Penny'), id('Potion')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 1 } });
	A(!S.players[0].flags.penny && logHas(S, /has no other Supporter card/), 'with no other Supporter in that deck she finds nothing');

	// --- the computer player ---
	S = arena(2); S.players[0].zone.cur = null; S.players[0].flags.attached = true; S.players[0].hand = [eg('Flareon')]; G(S, 0, 'active', 0, 'Eevee ex'); put(S, 0, 'active', 1, 'Snorlax'); foe(S);
	{ const a = nextAction(E.view(S, 0), new Set()); A(a && a.t === 'evolve' && a.at.idx === 0, 'the computer player evolves Eevee ex into an Eevee evolution it holds', a); }
	S = arena(2); S.players[0].zone.cur = null; S.players[0].flags.attached = true; S.players[0].hand = [eg('Sylveon ex')]; S.players[0].deck = [id('Potion'), id('Potion'), id('Potion')]; G(S, 0, 'active', 0, 'Eevee'); put(S, 0, 'active', 1, 'Snorlax'); foe(S);
	{ const a = nextAction(E.view(S, 0), new Set()); E.apply(S, a); const b = nextAction(E.view(S, 0), new Set()); A(a.t === 'evolve' && b && b.t === 'choose' && b.pick === 1, 'it takes Happy Ribbon\'s two cards', [a, b]); E.apply(S, b); }
	S = arena(2); S.players[0].zone.cur = null; S.players[0].flags.attached = true; S.players[0].hand = [eg('Penny')]; S.players[1].deck = [id('Giovanni')]; put(S, 0, 'active', 0, 'Rattata', { energy: ['Fire'] }); put(S, 0, 'active', 1, 'Snorlax'); foe(S);
	{ const a = nextAction(E.view(S, 0), new Set()); E.apply(S, a); const b = nextAction(E.view(S, 0), new Set()); A(a.t === 'trainer' && b && b.t === 'trainer' && b.penny === true, 'it plays Penny, then uses the effect she found', [a, b]); E.apply(S, b); A(S.players[0].flags.boost.length === 1, 'and the engine takes it'); }
	{
		const N = n => eg(n), two = l => l.flatMap(v => [v, v]);
		const decks = [{ deck: two([N('Eevee ex'), 'A3b-055', N('Flareon ex'), N('Sylveon ex'), N('Espeon'), N('Umbreon'), N('Jolteon'), N('Eevee Bag'), N('Leftovers'), N('Penny')]), energy: ['Fire', 'Psychic'] },
			{ deck: two([N('Milcery'), N('Alcremie'), N('Swirlix'), N('Slurpuff'), 'A3b-018', 'A3b-019', N('Snorlax ex'), N('Leftovers'), N('Mimikyu'), N('Penny')]), energy: ['Psychic', 'Water'] },
			{ deck: two([N('Joltik'), N('Galvantula'), N('Aipom'), N('Ambipom'), N('Skwovet'), N('Greedent'), N('Drampa'), N('Chatot'), N('Leftovers'), N('Audino')]), energy: ['Lightning'] },
			{ deck: two([N('Barboach'), N('Whiscash'), N('Purrloin'), N('Liepard'), N('Carbink'), N('Mienfoo'), N('Mienshao'), N('Togedemaru'), N('Mawile'), N('Hau')]), energy: ['Fighting', 'Darkness', 'Metal'] }];
		A(decks.every(d => E.deckError(d.deck, d.energy) === null), 'four Eevee Grove decks are legal', decks.map(d => E.deckError(d.deck, d.energy)));
		const bad = []; let over = 0;
		for (let g = 0; g < 16; g++) {
			const config = { seed: 'grove' + g, rules: E.RULES, players: [0, 1, 2, 3].slice(0, 2 + (g % 3)).map(i => ({ name: 'P' + i, ai: true, ...decks[(i + g) % 4] })) }, S2 = E.createGame(config), actions = [];
			try {
				for (let step = 0; step < 4000 && !S2.over; step++) {
					const seat = S2.pending ? S2.pending.seat : S2.phase === 'setup' ? S2.players.find(p => !p.setup).seat : S2.current, banned = new Set();
					let done = false;
					for (let t = 0; t < 40 && !done; t++) { const a = nextAction(E.view(S2, seat), banned) || { t: 'execute', seat, commands: [null, null] }; try { E.apply(S2, a); actions.push(a); done = true; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); } }
					if (!done) { bad.push(g + ': stuck'); break; }
				}
				if (S2.over) over++;
				if (E.digest(E.replay(config, actions)) !== E.digest(S2)) bad.push(g + ': replay differs');
				for (const p of S2.players) { const total = p.deck.length + p.hand.length + p.discard.length + [...p.active, ...p.bench].filter(Boolean).reduce((a, k) => a + k.cards.length + (k.tool ? 1 : 0), 0); if (total !== 20) bad.push(`${g}: ${p.name} has ${total} cards`); }
			} catch (e) { bad.push(g + ': ' + e.message); }
		}
		A(over === 16 && bad.length === 0, 'computer players finish 16 matches with Eevee Grove decks (2, 3 and 4 players): every replay matches and every card is accounted for', { over, bad: bad.slice(0, 4) });
	}
}

//// ===== 19. Wisdom of Sea and Sky (A4): each new effect, played =====
{
	const of = set => name => { const c = CARDS.find(x => x.set === set && x.name === name); if (!c) throw new Error(`no ${set} card ${name}`); return c.id; };
	const sk = of('A4'), a2 = of('A2');
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const G = (S, seat, zone, idx, name, o) => putId(S, seat, zone, idx, sk(name), o);
	const dmgs = S => S.log.filter(e => e.k === 'damage').map(e => e.msg);
	const SN = () => card(id('Snorlax')).attacks.length - 1;
	const seeds = (n, f) => { const out = {}; for (let g = 0; g < n; g++) { const r = f('w' + g); out[r] = (out[r] || 0) + 1; } return out; };
	const FOUR = ['Fire', 'Fire', 'Fire', 'Fire'], ANY = ['Fire', 'Water', 'Lightning', 'Grass', 'Psychic', 'Fighting', 'Darkness', 'Metal'];
	const foe = S => { const k = put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax'); return k; };
	const coin = (S, re) => S.log.filter(e => e.k === 'coin' && re.test(e.msg));
	const T0 = { target: L(1, 'active', 0) };
	let S, x, y, z;

	// --- attacks ---
	S = arena(2); x = G(S, 0, 'active', 0, 'Bellossom', { energy: ['Grass', 'Grass'] }); foe(S);
	exec(S, { attack: 0, ...T0 });
	A(x.status.confused && coin(S, /Petal Dance/).length === 3, 'Petal Dance flips 3 coins and leaves its user Confused');
	S = arena(2); G(S, 0, 'active', 0, 'Tangrowth', { energy: ['Grass', 'Grass', 'Fire'] }); foe(S);
	exec(S, { attack: 0, ...T0 });
	A(new RegExp(`base ${10 + 40 * card(id('Snorlax')).retreat}\\b`).test(dmgs(S)[0]), 'Grass Knot does 10 + 40 for each Energy in its target\'s Retreat Cost');
	S = arena(2); G(S, 0, 'active', 0, 'Heracross', { energy: ['Grass', 'Grass'] }); G(S, 0, 'active', 1, 'Heracross', { energy: ['Grass', 'Grass'], dmg: 10 }); foe(S); put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) });
	A(/base 80\b/.test(dmgs(S)[0]) && /base 40\b/.test(dmgs(S)[1]), 'Single Lunge does 40 + 40 with no damage on its user, and 40 with some');
	{ const r = seeds(10, sd => { const T = arena(2, sd); const m = G(T, 0, 'active', 0, 'Magcargo', { energy: ['Fire', 'Fire'] }); const own = put(T, 0, 'bench', 0, 'Snorlax', { tool: a2('Giant Cape') }); const f1 = put(T, 1, 'active', 0, 'Snorlax', { tool: a2('Giant Cape') }), f2 = put(T, 1, 'bench', 0, 'Snorlax', { tool: a2('Giant Cape') });
			exec(T, { attack: 0 }); const hits = T.log.filter(e => e.k === 'damage' && /Spurt Fire does/.test(e.msg)).length;
			return hits === 3 && m.dmg === 0 ? (own.dmg > 0 ? 'own' : 'theirs') : 'bad'; });
		A(!r.bad && r.own > 0 && r.theirs > 0, 'Spurt Fire hits a random other Pokémon three times: an opponent\'s or its own player\'s, never itself', r); }
	S = arena(2); G(S, 0, 'active', 0, 'Magby'); x = put(S, 0, 'bench', 0, 'Charmeleon'); y = put(S, 0, 'bench', 2, 'Charmander'); foe(S);
	exec(S, { attack: 0, args: { bench: 0 } });
	A(y.energy.join() === 'Fire' && x.energy.length === 0, 'Toasty Toss (no Energy needed) attaches a Fire Energy to a Benched Basic Pokémon only');
	{ const r = seeds(12, sd => { const T = arena(2, sd); const en = G(T, 0, 'active', 0, 'Entei', { energy: FOUR.slice() }); foe(T); exec(T, { attack: 0, ...T0 }); const heads = coin(T, /Strong Flare/)[0].heads; return en.energy.length === (heads ? 4 : 2) ? (heads ? 'h' : 't') : 'bad'; });
		A(!r.bad && r.h > 0 && r.t > 0, 'Strong Flare discards 2 random Energy from its user on tails', r); }
	S = arena(2); G(S, 0, 'active', 0, 'Ho-Oh ex', { energy: ['Fire', 'Fire', 'Fire'] }); x = put(S, 0, 'bench', 0, 'Charmander'); y = put(S, 0, 'bench', 1, 'Squirtle'); z = put(S, 0, 'bench', 2, 'Charmeleon'); foe(S);
	exec(S, { attack: 0, ...T0, args: { spread: [1, 1, 2] } });
	A(y.energy.join() === 'Fire,Water' && x.energy.join() === 'Lightning' && z.energy.length === 0, 'Phoenix Turbo attaches a Fire, a Water and a Lightning Energy to Benched Basic Pokémon as its player chooses (an evolved one is not a choice)');
	S = arena(2); G(S, 0, 'active', 0, 'Heatmor', { energy: ['Fire', 'Fire'] }); x = foe(S); x.status.burned = { by: 0 };
	exec(S, { attack: 0, ...T0 });
	A(/base 90\b/.test(dmgs(S)[0]), 'Roasting Heat does 30 + 60 into a Burned Pokémon');
	S = arena(2); G(S, 0, 'active', 0, 'Gyarados', { energy: ['Water', 'Water'] }); put(S, 0, 'bench', 0, 'Squirtle', { energy: ['Water'] }); put(S, 0, 'bench', 1, 'Squirtle'); x = put(S, 0, 'bench', 2, 'Snorlax'); y = put(S, 0, 'bench', 3, 'Squirtle'); foe(S);
	exec(S, { attack: 0, ...T0, args: { discard: [0, 1, 2] } });
	A(/base 100\b/.test(dmgs(S)[0]) && !S.players[0].bench[0] && !S.players[0].bench[1] && S.players[0].bench[2] === x && S.players[0].bench[3] === y && S.players[0].discard.filter(i => i === id('Squirtle')).length === 2 && S.players[0].energyDiscard.join() === 'Water' && S.players[1].points === 0,
		'Wild Swing discards the Benched Water Pokémon its player chooses (2 of 3; another type is not taken) for +40 each, and nobody scores for them');
	S = arena(2); G(S, 0, 'active', 0, 'Corsola', { energy: ['Fire'] }); foe(S); S.players[0].hand = []; S.players[0].deck = [id('Potion'), id('Squirtle'), id('Giovanni')];
	exec(S, { attack: 0 });
	A(S.players[0].hand.join() === id('Squirtle'), 'Find a Friend puts a random Pokémon from the deck into the hand');
	S = arena(2); G(S, 0, 'active', 0, 'Octillery', { energy: ['Water', 'Water'] }); x = foe(S); x.tool = a2('Giant Cape');
	exec(S, { attack: 0, ...T0 }); exec(S); exec(S, { attack: 0, ...T0 }); exec(S); exec(S);
	A(x.fx.filter(f => f.k === 'smokescreen').length === 1, 'Octazooka: the Defending Pokémon may miss its attacks for as long as it stays in its Active slot, and a second one does not stack');
	E.apply(S, { t: 'trainer', seat: 1, hand: S.players[1].hand.push(sk('Lyra')) - 1, args: { at: L(1, 'active', 0), bench: 0 } });
	A(x.fx.length === 0 && S.players[1].bench[0] === x, 'it ends when that Pokémon leaves the slot (Lyra switches a damaged Active Pokémon with a Benched one)');
	S = arena(2); x = G(S, 0, 'active', 0, 'Swanna', { energy: ['Water', 'Fire'] }); put(S, 0, 'bench', 0, 'Snorlax'); y = put(S, 0, 'bench', 1, 'Snorlax'); foe(S);
	exec(S, { attack: 0, ...T0, args: { bench: 1 } });
	A(x.energy.length === 0 && y.energy.join() === 'Water,Fire', 'Feathery Cyclone moves all its user\'s Energy to the Benched Pokémon chosen');
	{ const r = seeds(12, sd => { const T = arena(2, sd); G(T, 0, 'active', 0, 'Lanturn ex', { energy: ['Lightning', 'Fire', 'Fire'] }); const d = foe(T); d.tool = a2('Giant Cape'); exec(T, { attack: 0, ...T0 }); const heads = coin(T, /Flashing Signal/)[0].heads; return T.log.some(e => new RegExp(`Snorlax is now ${heads ? 'Paralyzed' : 'Confused'}`).test(e.msg)) ? (heads ? 'par' : 'conf') : 'bad'; });
		A(!r.bad && r.par > 0 && r.conf > 0, 'Flashing Signal: Paralyzed on heads, Confused on tails', r); }
	S = arena(2); x = G(S, 0, 'active', 0, 'Slowpoke', { energy: ['Fire'], dmg: 50 }); foe(S);
	exec(S, { attack: 0 });
	A(x.dmg === 20 && logHas(S, /Slowpoke is now Asleep/), 'Rest: its user falls Asleep and heals 30');
	S = arena(2); G(S, 0, 'active', 0, 'Smoochum'); x = foe(S); x.energy = ['Fire', 'Fire', 'Water'];
	exec(S, { attack: 0, ...T0 });
	A(/base 60\b/.test(dmgs(S)[0]), 'Shivery Wave does 20 for each Energy on its target (3)');
	{ const r = seeds(12, sd => { const T = arena(2, sd); G(T, 0, 'active', 0, 'Xatu', { energy: ['Psychic', 'Psychic'] }); const d = foe(T); exec(T, { attack: 0, ...T0 }); const heads = coin(T, /Life Drain/)[0].heads; return heads ? (card(id('Snorlax')).hp - d.dmg === 10 ? 'ten' : 'bad') : (d.dmg === 0 ? 'none' : 'bad'); });
		A(!r.bad && r.ten > 0 && r.none > 0, 'Life Drain: on heads its target is left with 10 HP', r); }
	S = arena(2); x = G(S, 0, 'active', 0, 'Wobbuffet', { energy: ['Psychic', 'Fire'] }); put(S, 0, 'bench', 0, 'Snorlax'); y = put(S, 1, 'active', 0, 'Rattata', { energy: ['Fire'] }); put(S, 1, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 1, 'Snorlax', { tool: a2('Giant Cape') });
	exec(S, { attack: 0, target: L(1, 'active', 1) });
	A(/base 30\b/.test(dmgs(S)[0]), 'Reply Strongly does 30 when its user was not attacked');
	exec(S, { attack: 0, target: L(0, 'active', 0) }); exec(S, { attack: 0, target: L(1, 'active', 1) });
	A(/base 80\b/.test(dmgs(S).at(-1)), 'and 30 + 50 after an attack damaged it in an Active slot on an opponent\'s turn');
	exec(S); exec(S, { attack: 0, target: L(1, 'active', 1) });
	A(/base 30\b/.test(dmgs(S).at(-1)), 'that turn only');
	S = arena(2); x = G(S, 0, 'active', 0, 'Musharna', { energy: ['Psychic', 'Fire'] }); y = foe(S);
	exec(S, { attack: 0, ...T0 });
	A(logHas(S, /Snorlax is now Asleep/) && logHas(S, /Musharna is now Asleep/), 'Dream Dance puts both its target and its user to sleep');
	S = arena(2); G(S, 0, 'active', 0, 'Houndoom', { energy: ['Darkness', 'Darkness', 'Darkness'] }); foe(S); S.players[1].hand = [id('Potion')];
	exec(S, { attack: 0, ...T0 });
	A(S.players[1].discard.includes(id('Potion')) && !S.log.some(e => e.k === 'coin'), 'Diving Swipe discards a random card from its target\'s owner\'s hand, with no coin');
	{ const r = seeds(12, sd => { const T = arena(2, sd); const c = G(T, 0, 'active', 0, 'Chansey', { energy: ['Fire', 'Fire'] }); put(T, 0, 'bench', 0, 'Snorlax'); const f = foe(T); f.energy = FOUR.slice();
			exec(T, { attack: 0, ...T0 }); const heads = coin(T, /Scrunch/)[0].heads; exec(T, { attack: SN(), target: L(0, 'active', 0) });
			return heads ? (c.dmg === 0 && /prevented/.test(dmgs(T).at(-1)) ? 'safe' : 'bad') : (c.dmg > 0 ? 'hit' : 'bad'); });
		A(!r.bad && r.safe > 0 && r.hit > 0, 'Scrunch: on heads, attacks do no damage to its user until its player\'s next turn', r); }
	S = arena(2); G(S, 0, 'active', 0, 'Blissey', { energy: FOUR.slice() }); foe(S);
	exec(S, { attack: 0, ...T0 });
	A(/base 100\b/.test(dmgs(S)[0]), 'Energy Blow does 20 + 20 for each Energy on its user (4)');
	S = arena(2); G(S, 0, 'active', 0, 'Kangaskhan', { energy: ['Fire'] }); G(S, 0, 'active', 1, 'Kangaskhan', { energy: ['Fire'] }); foe(S); put(S, 1, 'active', 1, 'Charmeleon');
	exec(S, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) });
	A(/base 20\b/.test(dmgs(S)[0]) && /base 60\b/.test(dmgs(S)[1]), 'Cross-Cut does 20, and 20 + 40 into an Evolution Pokémon');
	S = arena(2); G(S, 0, 'active', 0, 'Porygon-Z', { energy: ['Fire', 'Fire'] }); x = foe(S); x.tool = a2('Giant Cape');
	exec(S, { attack: 0, ...T0 });
	{ const vx = E.view(S, 1).players[1].active[0]; A(vx.less === -1 && vx.retreat === card(id('Snorlax')).retreat, 'Slowing Beam: its target\'s attacks cost 1 more on its owner\'s next turn; its Retreat Cost does not change'); }
	{ const r = seeds(12, sd => { const T = arena(2, sd); const n = G(T, 0, 'active', 0, 'Noctowl', { energy: ['Fire', 'Fire', 'Fire'] }); const d = foe(T); d.tool = a2('Giant Cape'); exec(T, { attack: 0, ...T0 }); const heads = coin(T, /Fly/)[0].heads; return heads ? (d.dmg > 0 && n.fx.some(f => f.k === 'prevent') ? 'fly' : 'bad') : (d.dmg === 0 && !n.fx.length ? 'none' : 'bad'); });
		A(!r.bad && r.fly > 0 && r.none > 0, 'Fly: tails does nothing; heads does its damage and protects its user until its player\'s next turn', r); }
	S = arena(2); G(S, 0, 'active', 0, 'Aipom', { energy: ['Fire'] }); foe(S); S.players[0].hand = [id('Potion')]; S.players[1].hand = [id('Potion'), id('Potion'), id('Giovanni'), id('Sabrina')];
	exec(S, { attack: 0, ...T0 });
	A(S.players[0].hand.length === 4, 'Imitate draws until its player holds as many cards as its target\'s owner (4)');
	{ const r = seeds(12, sd => { const T = arena(2, sd); G(T, 0, 'active', 0, 'Smeargle', { energy: ['Fire', 'Fire'] }); const d = foe(T); d.energy = ['Fire', 'Fire', 'Fire']; d.tool = a2('Giant Cape'); exec(T, { attack: 0, ...T0 }); const other = d.energy.filter(e2 => e2 !== 'Fire'); return d.energy.length === 3 && other.length <= 1 && T.log.some(e => /becomes \w+ Energy/.test(e.msg)) ? (other.length ? 'changed' : 'same') : 'bad'; });
		A(!r.bad && r.changed > 0, 'Splatter Coating changes the type of one random Energy on its target to a random type', r); }
	S = arena(2); x = G(S, 0, 'active', 0, 'Lugia ex', { energy: ['Fire', 'Water', 'Lightning', 'Grass'] }); foe(S);
	exec(S, { attack: 0, ...T0 });
	A(x.energy.join() === 'Grass' && S.players[0].energyDiscard.slice().sort().join() === 'Fire,Lightning,Water', 'Elemental Blast discards a Fire, a Water and a Lightning Energy from its user');

	// --- Abilities ---
	S = arena(2); G(S, 0, 'bench', 0, 'Jumpluff'); put(S, 0, 'active', 0, 'Snorlax'); put(S, 0, 'bench', 1, 'Snorlax'); foe(S);
	A(E.view(S, 0).players[0].active[0].retreat === 0 && E.view(S, 0).players[0].bench[1].retreat === card(id('Snorlax')).retreat && E.view(S, 1).players[1].active[0].retreat > 0, 'Fluffy Flight: its player\'s Active Pokémon have no Retreat Cost');
	S = arena(2); x = G(S, 0, 'active', 0, 'Cherubi'); foe(S);
	A(/does not have the Energy/.test(E.attackBlock(S, 0, x, card(sk('Cherubi')).attacks[0]) || ''), 'En-fruits-iastic does nothing without a Pokémon Tool');
	x.tool = a2('Giant Cape');
	A(!E.attackBlock(S, 0, x, card(sk('Cherubi')).attacks[0]) && E.view(S, 0).players[0].active[0].energy.length === 0, 'with one attached, Cherubi\'s attack costs 1 Grass less (here: nothing)');
	S = arena(2); G(S, 0, 'bench', 0, 'Typhlosion'); put(S, 0, 'active', 0, 'Snorlax'); x = foe(S);
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: T0 });
	A(x.status.burned && /already been used/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: T0 }))), 'Fire Breath Burns an opposing Active Pokémon, once a turn');
	S = arena(2); G(S, 0, 'bench', 0, 'Politoed'); G(S, 0, 'active', 0, 'Politoed', { energy: ['Water', 'Fire'] }); put(S, 0, 'active', 1, 'Rattata', { energy: ['Fire'] }); foe(S); put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) });
	A(/\+40 Lordly Cheering/.test(dmgs(S)[0]) && !/Lordly/.test(dmgs(S)[1]), 'Lordly Cheering: from the Bench, Politoed gives +40 to the attacks of Pokémon that evolve from Poliwhirl (and to no other)');
	S = arena(2); G(S, 0, 'active', 1, 'Politoed'); G(S, 0, 'active', 0, 'Politoed', { energy: ['Water', 'Fire'] }); foe(S);
	exec(S, { attack: 0, ...T0 });
	A(!/Lordly/.test(dmgs(S)[0]), 'not from an Active slot');
	S = arena(2); x = G(S, 0, 'active', 0, 'Corphish'); put(S, 1, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire'] }); y = put(S, 1, 'active', 1, 'Snorlax', { energy: ['Water'] }); put(S, 1, 'bench', 0, 'Snorlax'); S.players[0].hand = [sk('Crawdaunt')];
	E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) });
	A(S.pending && S.pending.kind === 'pickTarget' && S.pending.locs.length === 2, 'Unruly Claw: played to evolve, Crawdaunt asks its player which opposing Active Pokémon loses a random Energy');
	E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(y.energy.length === 0 && S.players[1].energyDiscard.join() === 'Water', 'and it loses one');
	{ const r = seeds(12, sd => { const T = arena(2, sd); const tk = G(T, 0, 'active', 0, 'Togekiss'); put(T, 0, 'bench', 0, 'Snorlax'); const f = foe(T); f.energy = FOUR.slice(); T.current = 1; exec(T, { attack: SN(), target: L(0, 'active', 0) }); const heads = coin(T, /Celestial Blessing/)[0].heads; return heads ? (tk.dmg === 0 && /prevented by Celestial Blessing/.test(dmgs(T)[0]) ? 'safe' : 'bad') : (tk.dmg > 0 ? 'hit' : 'bad'); });
		A(!r.bad && r.safe > 0 && r.hit > 0, 'Celestial Blessing: a coin for each attack that would damage Togekiss; heads prevents it', r); }
	S = arena(2); G(S, 0, 'active', 0, 'Espeon ex'); x = put(S, 0, 'bench', 0, 'Snorlax', { dmg: 50 }); foe(S);
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { at: L(0, 'bench', 0) } });
	A(x.dmg === 20, 'Psychic Healing, from an Active slot, heals 30 from any one of its player\'s Pokémon');
	A(/must be in an Active slot/.test(refused(() => { const T = arena(2); G(T, 0, 'bench', 0, 'Espeon ex'); put(T, 0, 'active', 0, 'Snorlax', { dmg: 50 }); foe(T); E.apply(T, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { at: L(0, 'active', 0) } }); })), 'not from the Bench');
	S = arena(2); putId(S, 0, 'bench', 0, 'A4-084'); x = put(S, 0, 'active', 0, 'Rattata', { energy: ['Fire'] }); y = foe(S); y.energy = FOUR.slice(); y.tool = a2('Giant Cape');
	exec(S, { attack: 0, ...T0 }); exec(S, { attack: SN(), target: L(0, 'active', 0) });
	A(!/GUARD|POWER/.test(dmgs(S).join(' ')), 'an Unown\'s Ability does nothing alone');
	S = arena(2); putId(S, 0, 'bench', 0, 'A4-084'); putId(S, 0, 'bench', 1, 'A4-085'); x = put(S, 0, 'active', 0, 'Snorlax', { energy: FOUR.slice() }); y = foe(S); y.energy = FOUR.slice(); y.tool = a2('Giant Cape');
	exec(S, { attack: SN(), ...T0 }); exec(S, { attack: SN(), target: L(0, 'active', 0) });
	A(/\+10 POWER/.test(dmgs(S)[0]) && /-10 GUARD/.test(dmgs(S)[1]), 'with the other Unown in play, POWER adds 10 to its player\'s attacks and GUARD takes 10 off attacks against its player\'s Pokémon');
	S = arena(2); G(S, 0, 'active', 0, 'Umbreon ex'); x = put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax'); y = put(S, 1, 'bench', 2, 'Rattata', { dmg: 10 });
	A(/has damage on it/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { target: L(1, 'active', 0), bench: 0 } }))), 'Dark Chase takes only a Benched Pokémon that has damage on it');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { target: L(1, 'active', 0), bench: 2 } });
	A(S.players[1].active[0] === y && S.players[1].bench[2] === x, 'and brings it into the Active slot chosen');
	S = arena(2); x = G(S, 0, 'bench', 0, 'Tyranitar', { energy: ['Fire'] }); y = put(S, 0, 'active', 0, 'Snorlax', { energy: ['Darkness', 'Fire', 'Darkness'] }); z = put(S, 0, 'bench', 1, 'Snorlax', { energy: ['Darkness'] }); foe(S);
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: {} });
	A(x.energy.filter(e => e === 'Darkness').length === 3 && y.energy.join() === 'Fire' && z.energy.length === 0, 'Energy Plunder moves all the Darkness Energy of its player\'s other Pokémon to Tyranitar');
	S = arena(2); x = G(S, 0, 'active', 0, 'Porygon2'); foe(S); S.players[0].zone.cur = 'Fire'; S.players[0].deck = [id('Potion'), sk('Porygon-Z'), id('Giovanni')];
	E.apply(S, { t: 'attach', seat: 0, at: L(0, 'active', 0) });
	A(card(x.cards.at(-1)).name === 'Porygon-Z' && x.cards.length === 2 && x.energy.length === 1 && S.players[0].deck.length === 2, 'Buggy Evolution: an Energy from the Energy Zone onto Porygon2 evolves it into a Porygon-Z from the deck');
	S = arena(2); x = G(S, 0, 'active', 0, 'Porygon2'); foe(S); S.players[0].zone.cur = 'Fire'; S.players[0].deck = [id('Potion')];
	E.apply(S, { t: 'attach', seat: 0, at: L(0, 'active', 0) });
	A(x.cards.length === 1 && x.energy.length === 1, 'with none in the deck it stays Porygon2');
	S = arena(2); putId(S, 0, 'active', 0, sk('Tangela'), { energy: ['Grass', 'Fire'] }); putId(S, 0, 'active', 1, sk('Tangela'), { energy: ['Grass', 'Fire'] }); x = G(S, 1, 'active', 0, 'Hoothoot'); y = put(S, 1, 'active', 1, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) });
	A(!x.status.asleep && logHas(S, /Insomnia: Hoothoot can't be Asleep/) && logHas(S, /Snorlax is now Asleep/), 'Insomnia: Hoothoot cannot be put to sleep');

	// --- Trainers and Pokémon Tools ---
	S = arena(2); x = put(S, 0, 'active', 1, 'Snorlax'); y = put(S, 0, 'bench', 0, 'Snorlax', { energy: ['Grass', 'Water'] }); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [sk('Elemental Switch')];
	A(/Energy on it/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { bench: 0, type: 'Grass', at: L(0, 'active', 1) } }))), 'Elemental Switch moves only a Fire, Water or Lightning Energy');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { bench: 0, type: 'Water', at: L(0, 'active', 1) } });
	A(x.energy.join() === 'Water' && y.energy.join() === 'Grass', 'from a Benched Pokémon to the Active Pokémon chosen');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); x = foe(S); x.energy = ['Water', 'Fire']; S.players[0].hand = [sk('Squirt Bottle'), sk('Squirt Bottle')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: T0 });
	A(x.energy.join() === 'Water' && /no Fire Energy/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: T0 }))), 'Squirt Bottle discards a Fire Energy from an opposing Active Pokémon that has one');
	S = arena(2); x = G(S, 0, 'active', 0, 'Skarmory ex', { tool: sk('Steel Apron') }); x.status.poisoned = { by: 1 }; y = put(S, 0, 'active', 1, 'Snorlax', { tool: sk('Steel Apron') }); put(S, 0, 'bench', 0, 'Snorlax'); z = foe(S); z.energy = FOUR.slice(); put(S, 1, 'active', 1, 'Snorlax', { energy: FOUR.slice() });
	S.players[0].zone.cur = 'Metal'; E.apply(S, { t: 'attach', seat: 0, at: L(0, 'bench', 0) });
	A(Object.keys(x.status).length === 0, 'Steel Apron: its Metal holder recovers from Special Conditions');
	exec(S); exec(S, { attack: SN(), target: L(0, 'active', 0) }, { attack: SN(), target: L(0, 'active', 1) });
	A(/-10 Steel Apron/.test(dmgs(S)[0]) && !/Steel Apron/.test(dmgs(S)[1]), 'and takes 10 less from attacks (a Pokémon that is not Metal gets nothing from it)');
	S = arena(2); putId(S, 0, 'active', 0, sk('Tangela'), { energy: ['Grass', 'Fire'] }); x = G(S, 1, 'active', 0, 'Skarmory ex', { tool: sk('Steel Apron') }); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, ...T0 });
	A(Object.keys(x.status).length === 0 && logHas(S, /Steel Apron: Skarmory ex can't be affected/), 'and cannot be given one');
	S = arena(2); x = G(S, 0, 'active', 0, 'Houndoom', { tool: sk('Dark Pendant') }); put(S, 0, 'bench', 0, 'Snorlax'); y = foe(S); y.energy = FOUR.slice(); S.players[1].hand = [id('Potion')]; S.current = 1; z = S.players[1].deck.length;
	exec(S, { attack: SN(), target: L(0, 'active', 0) });
	A(S.players[1].hand.length === 0 && S.players[1].deck.length === z + 1 && logHas(S, /Dark Pendant: P2 reveals Potion/), 'Dark Pendant: an attacker that damages its Darkness holder in an Active slot loses a random card from its owner\'s hand to their deck');
	S = arena(2); x = put(S, 0, 'active', 0, 'Charmander', { tool: sk('Rescue Scarf'), energy: ['Fire'] }); x.cards.push(id('Charmeleon')); x.dmg = card(id('Charmeleon')).hp - 10; put(S, 0, 'bench', 0, 'Snorlax'); y = foe(S); y.energy = FOUR.slice(); S.players[0].hand = []; S.current = 1;
	exec(S, { attack: SN(), target: L(0, 'active', 0) });
	A(S.players[0].hand.includes(id('Charmander')) && S.players[0].hand.includes(id('Charmeleon')) && logHas(S, /Rescue Scarf: Charmander, Charmeleon go to P1's hand/) && S.players[0].discard.join() === sk('Rescue Scarf') && S.players[0].energyDiscard.join() === 'Fire' && S.players[1].points === 1,
		'Rescue Scarf: Knocked Out by an attack, its holder\'s cards go to their player\'s hand (the point is still scored; the scarf and Energy are discarded)');
	{ const r = seeds(8, sd => { const T = arena(2, sd); G(T, 0, 'active', 0, 'Furret', { energy: ['Fire'] }); G(T, 0, 'active', 1, 'Furret', { energy: ['Fire'] }); const d = foe(T); d.tool = a2('Giant Cape'); put(T, 1, 'active', 1, 'Snorlax', { tool: a2('Giant Cape') }); T.players[0].hand = [sk('Will')];
			E.apply(T, { t: 'trainer', seat: 0, hand: 0, args: {} }); exec(T, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) }); const c = coin(T, /Tail Smash/);
			return c[0].heads && /Will/.test(c[0].msg) && d.dmg > 0 && !/Will/.test(c[1].msg) ? (c[1].heads ? 'hh' : 'ht') : 'bad'; });
		A(!r.bad && r.hh > 0 && r.ht > 0, 'Will: the next coin its player flips that turn is heads; the one after is an ordinary coin', r); }
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [sk('Will')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }); exec(S);
	A(!S.players[0].flags.will, 'unused, it is gone when the turn ends');
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax'); y = put(S, 0, 'active', 1, 'Snorlax', { dmg: 10 }); z = put(S, 0, 'bench', 1, 'Rattata'); foe(S); S.players[0].hand = [sk('Lyra')];
	A(/has damage on it/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0), bench: 1 } }))), 'Lyra takes only an Active Pokémon that has damage on it');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 1), bench: 1 } });
	A(S.players[0].active[1] === z && S.players[0].bench[1] === y && z.movedUp === S.turn, 'and switches it with the Benched Pokémon chosen');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [sk('Silver')]; S.players[1].hand = [id('Potion'), id('Giovanni'), id('Sabrina')]; x = S.players[1].deck.length;
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 1 } });
	A(S.pending && S.pending.kind === 'handPick' && S.pending.options.join() === '1,2' && E.view(S, 0).pending.cards.length === 3 && E.view(S, 1).pending.cards === null && /not one of the choices/.test(refused(() => E.apply(S, { t: 'choose', seat: 0, pick: 0 }))), 'Silver shows its player that opponent\'s hand and asks which Supporter card (only a Supporter) to take');
	E.apply(S, { t: 'choose', seat: 0, pick: 2 });
	A(S.players[1].hand.join() === [id('Potion'), id('Giovanni')].join() && S.players[1].deck.length === x + 1, 'and shuffles it into their deck');
	{ const r = seeds(12, sd => { const T = arena(2, sd); put(T, 0, 'active', 0, 'Snorlax'); foe(T); T.players[0].hand = [sk('Fisher')]; T.players[0].discard = [id('Squirtle'), id('Charmander'), id('Squirtle'), id('Potion')];
			E.apply(T, { t: 'trainer', seat: 0, hand: 0, args: {} }); const heads = coin(T, /Fisher/).filter(e => e.heads).length, got = T.players[0].hand;
			return coin(T, /Fisher/).length === 3 && got.length === Math.min(heads, 2) && got.every(i => i === id('Squirtle')) && T.players[0].discard.includes(id('Charmander')) ? 'n' + got.length : 'bad'; });
		A(!r.bad && Object.keys(r).length > 1, 'Fisher: for each heads of three coins, a random Water Pokémon (never another card) comes back from the discard pile', r); }
	S = arena(2); x = G(S, 0, 'active', 0, 'Skarmory ex'); y = put(S, 0, 'active', 1, 'Snorlax'); put(S, 0, 'bench', 0, 'Snorlax'); z = foe(S); z.energy = FOUR.slice(); put(S, 1, 'active', 1, 'Snorlax', { energy: FOUR.slice() }); S.players[0].hand = [sk('Jasmine')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }); exec(S); exec(S, { attack: SN(), target: L(0, 'active', 0) }, { attack: SN(), target: L(0, 'active', 1) });
	A(/-50 Jasmine/.test(dmgs(S)[0]) && !/Jasmine/.test(dmgs(S)[1]), 'Jasmine: until your next turn your Steelix and Skarmory ex (and no other Pokémon) take 50 less from attacks');
	S = arena(2); putId(S, 0, 'active', 0, 'A4-092'); putId(S, 0, 'bench', 0, 'A4-092'); put(S, 0, 'active', 1, 'Snorlax'); foe(S); S.players[0].hand = [sk('Hiker')]; S.players[0].deck = [id('Potion'), id('Giovanni'), id('Sabrina')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.pending && S.pending.kind === 'handPick' && E.view(S, 0).pending.cards.join() === [id('Potion'), id('Giovanni')].join() && E.view(S, 1).pending.cards === null, 'Hiker shows its player (only) as many top cards as they have Fighting Pokémon in play (2)');
	E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(!S.pending && S.players[0].deck.join() === [id('Giovanni'), id('Potion'), id('Sabrina')].join(), 'and they go back in the order chosen');

	// --- the computer player ---
	{
		const N = n => sk(n), two = l => l.flatMap(v => [v, v]);
		const decks = [{ deck: two([N('Ho-Oh ex'), N('Lugia ex'), N('Magby'), N('Pichu'), N('Entei'), N('Suicune'), N('Raikou'), N('Elemental Switch'), N('Will'), N('Smoochum')]), energy: ['Fire', 'Water', 'Lightning'] },
			{ deck: two([N('Zubat'), N('Golbat'), N('Crobat ex'), N('Umbreon ex'), N('Eevee'), N('Houndour'), N('Houndoom'), N('Dark Pendant'), N('Silver'), N('Espeon ex')]), energy: ['Darkness', 'Psychic'] },
			{ deck: two([N('Porygon'), N('Porygon2'), N('Porygon-Z'), N('Chansey'), N('Blissey'), N('Hoothoot'), N('Noctowl'), N('Rescue Scarf'), N('Lyra'), N('Smeargle')]), energy: ['Psychic'] },
			{ deck: two([N('Skarmory ex'), 'A4-092', N('Steelix'), N('Phanpy'), N('Donphan ex'), N('Steel Apron'), N('Jasmine'), N('Hiker'), N('Tyrogue'), N('Hitmontop')]), energy: ['Metal', 'Fighting'] },
			{ deck: two([N('Poliwag'), N('Poliwhirl'), N('Politoed'), N('Magikarp'), N('Gyarados'), N('Corphish'), N('Crawdaunt'), N('Fisher'), N('Squirt Bottle'), 'A4-084']), energy: ['Water'] }];
		A(decks.every(d => E.deckError(d.deck, d.energy) === null), 'five Wisdom of Sea and Sky decks are legal', decks.map(d => E.deckError(d.deck, d.energy)));
		const bad = []; let over = 0;
		for (let g = 0; g < 20; g++) {
			const config = { seed: 'johto' + g, rules: E.RULES, players: [0, 1, 2, 3].slice(0, 2 + (g % 3)).map(i => ({ name: 'P' + i, ai: true, ...decks[(i + g) % 5] })) }, S2 = E.createGame(config), actions = [];
			try {
				for (let step = 0; step < 4000 && !S2.over; step++) {
					const seat = S2.pending ? S2.pending.seat : S2.phase === 'setup' ? S2.players.find(p => !p.setup).seat : S2.current, banned = new Set();
					let done = false;
					for (let t = 0; t < 40 && !done; t++) { const a = nextAction(E.view(S2, seat), banned) || { t: 'execute', seat, commands: [null, null] }; try { E.apply(S2, a); actions.push(a); done = true; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); } }
					if (!done) { bad.push(g + ': stuck'); break; }
				}
				if (S2.over) over++;
				if (E.digest(E.replay(config, actions)) !== E.digest(S2)) bad.push(g + ': replay differs');
				for (const p of S2.players) { const total = p.deck.length + p.hand.length + p.discard.length + [...p.active, ...p.bench].filter(Boolean).reduce((a, k) => a + k.cards.length + (k.tool ? 1 : 0), 0); if (total !== 20) bad.push(`${g}: ${p.name} has ${total} cards`); }
			} catch (e) { bad.push(g + ': ' + e.message); }
		}
		A(over === 20 && bad.length === 0, 'computer players finish 20 matches with Wisdom of Sea and Sky decks (2, 3 and 4 players): every replay matches and every card is accounted for', { over, bad: bad.slice(0, 4) });
	}
}

/// ===== 20. Secluded Springs (A4a): each new effect, played =====
{
	const of = set => name => { const c = CARDS.find(x => x.set === set && x.name === name); if (!c) throw new Error(`no ${set} card ${name}`); return c.id; };
	const ss = of('A4a'), a2 = of('A2'), a4 = of('A4');
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const G = (S, seat, zone, idx, name, o) => putId(S, seat, zone, idx, ss(name), o);
	const dmgs = S => S.log.filter(e => e.k === 'damage').map(e => e.msg);
	const SN = () => card(id('Snorlax')).attacks.length - 1;
	const seeds = (n, f) => { const out = {}; for (let g = 0; g < n; g++) { const r = f('s' + g); out[r] = (out[r] || 0) + 1; } return out; };
	const FOUR = () => ['Fire', 'Fire', 'Fire', 'Fire'];
	const foe = S => { const k = put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax'); return k; };
	const coin = (S, re) => S.log.filter(e => e.k === 'coin' && re.test(e.msg));
	const T0 = { target: L(1, 'active', 0) };
	let S, x, y, z;

	// --- attacks ---
	S = arena(2); x = G(S, 0, 'active', 0, 'Jumpluff ex', { energy: ['Fire'] }); y = put(S, 0, 'bench', 1, 'Snorlax'); foe(S);
	exec(S, { attack: 0, ...T0 });
	A(S.players[0].active[0] === x, 'Breeze-By Attack: "you may switch" — with no choice made, Jumpluff ex stays');
	exec(S); exec(S, { attack: 0, ...T0, args: { bench: 1 } });
	A(S.players[0].active[0] === y && S.players[0].bench[1] === x, 'with a Benched Pokémon chosen, they trade places');
	S = arena(2); G(S, 0, 'active', 0, 'Celebi', { energy: ['Grass', 'Grass'] }); x = put(S, 1, 'active', 0, 'Charmander', { energy: ['Fire'], tool: a2('Giant Cape') }); x.cards.push(id('Charmeleon')); put(S, 1, 'bench', 0, 'Snorlax'); S.players[1].hand = [];
	exec(S, { attack: 0, ...T0 });
	A(x.cards.length === 1 && card(x.cards.at(-1)).name === 'Charmander' && S.players[1].hand.includes(id('Charmeleon')) && x.energy.length === 1 && x.dmg > 0, 'Temporal Leaves devolves an evolved target: its top Evolution card goes to its owner\'s hand (damage and Energy stay)');
	S = arena(2); G(S, 0, 'active', 0, 'Celebi', { energy: ['Grass', 'Grass'] }); x = put(S, 1, 'active', 0, 'Charmander', { dmg: card(id('Charmander')).hp - 10 }); x.cards.push(id('Charmeleon')); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, ...T0 });
	A(S.players[0].points === 1 && S.players[1].active[0] !== x, 'a Pokémon left with more damage than its lower Stage has HP is Knocked Out, and the attacker scores');
	S = arena(2); G(S, 0, 'active', 0, 'Durant', { energy: ['Grass', 'Grass'] }); foe(S); S.players[1].deck = [id('Giovanni'), id('Potion'), id('Sabrina')];
	exec(S, { attack: 0, ...T0 });
	A(S.players[1].discard.includes(id('Giovanni')) && S.players[1].deck.length === 1, 'Mountain Munch discards the top card of its target\'s owner\'s deck (they then draw for their turn)');
	{ const r = seeds(12, sd => { const T = arena(2, sd); G(T, 0, 'active', 0, 'Tentacruel', { energy: ['Water', 'Water', 'Fire'] }); const d = foe(T); d.tool = a2('Giant Cape'); exec(T, { attack: 0, ...T0 }); const heads = coin(T, /Stun Poison/)[0].heads, both = T.log.some(e => /Snorlax is now Poisoned/.test(e.msg)) && T.log.some(e => /Snorlax is now Paralyzed/.test(e.msg)), none = !T.log.some(e => /Snorlax is now/.test(e.msg)); return heads ? (both ? 'both' : 'bad') : (none ? 'none' : 'bad'); });
		A(!r.bad && r.both > 0 && r.none > 0, 'Stun Poison: one coin; heads leaves its target Poisoned and Paralyzed', r); }
	S = arena(2); G(S, 0, 'active', 0, 'Slowking', { energy: ['Water'] }); foe(S); S.players[0].hand = [a2('Giant Cape'), id('Potion'), a2('Rocky Helmet'), a2('Giant Cape')];
	exec(S, { attack: 0, ...T0, args: { tools: [0, 1, 2, 3] } });
	A(/base 100\b/.test(dmgs(S)[0]) && S.players[0].hand.length === 2 && S.players[0].hand.includes(id('Potion')) && S.players[0].discard.length === 2, 'Litter discards up to 2 Pokémon Tool cards from the hand (never another card) and does 50 for each');
	S = arena(2); G(S, 0, 'active', 0, 'Slowking', { energy: ['Water'] }); x = foe(S); S.players[0].hand = [a2('Giant Cape')];
	exec(S, { attack: 0, ...T0 });
	A(x.dmg === 0 && S.players[0].hand.length === 1, 'with none chosen it does nothing');
	S = arena(2); G(S, 0, 'active', 0, 'Suicune ex', { energy: ['Water', 'Water'] }); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 0, 'bench', 3, 'Snorlax'); put(S, 0, 'active', 1, 'Snorlax'); foe(S); put(S, 1, 'bench', 2, 'Snorlax');
	exec(S, { attack: 0, ...T0 });
	A(/base 80\b/.test(dmgs(S)[0]), 'Crystal Waltz does 20 for each Benched Pokémon of its player and of its target\'s owner (2 + 2)');
	S = arena(2); x = G(S, 0, 'active', 0, 'Boltund', { energy: ['Lightning'] }); foe(S);
	A(/does not have the Energy/.test(E.attackBlock(S, 0, x, card(ss('Boltund')).attacks[0]) || ''), 'Defiant Spark costs its full price on an undamaged Boltund');
	x.dmg = 10;
	A(!E.attackBlock(S, 0, x, card(ss('Boltund')).attacks[0]), 'with damage on it, 1 Lightning Energy is enough');
	exec(S, { attack: 0, ...T0 });
	A(/base 70\b/.test(dmgs(S)[0]), 'and it is used');
	S = arena(2); G(S, 0, 'active', 0, 'Mismagius', { energy: ['Psychic'] }); G(S, 0, 'active', 1, 'Mismagius', { energy: ['Psychic'] }); x = put(S, 1, 'active', 0, 'Snorlax'); y = put(S, 1, 'active', 1, 'Snorlax'); z = put(S, 1, 'bench', 0, 'Snorlax'); S.players[1].hand = [a4('Lyra')];
	exec(S, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) });
	A(x.dmg === 0 && y.dmg === 0 && x.fx.some(f => f.k === 'doom'), 'Cursed Prose does nothing at once');
	y.dmg = 10; E.apply(S, { t: 'trainer', seat: 1, hand: 0, args: { at: L(1, 'active', 1), bench: 0 } }); exec(S);
	A(x.dmg === 90 && y.dmg === 10 && z.dmg === 0 && S.current === 0, 'at the end of its owner\'s next turn the Defending Pokémon takes 90 (one that left its Active slot does not)');
	exec(S); exec(S);
	A(x.dmg === 90, 'once');
	S = arena(2); G(S, 0, 'active', 0, 'Mismagius', { energy: ['Psychic'] }); x = put(S, 1, 'active', 0, 'Rattata'); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, ...T0 }); exec(S);
	A(S.players[0].points === 1, 'a Knock Out by it is scored by Mismagius\'s player');
	S = arena(2); G(S, 0, 'active', 0, 'Dugtrio', { energy: ['Fighting'] }); G(S, 0, 'active', 1, 'Dugtrio', { energy: ['Fighting'] }); foe(S); put(S, 1, 'active', 1, 'Snorlax'); S.players[0].deck = [id('Potion'), a4('Phanpy'), id('Giovanni')];
	exec(S, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) });
	A(/base 40\b/.test(dmgs(S)[0]) && /base 100\b/.test(dmgs(S)[1]) && S.players[0].discard.length === 2, 'Cliff Crumbler discards the top card of its player\'s deck: 40, or 40 + 60 when that card is a Fighting Pokémon');
	S = arena(2); G(S, 0, 'active', 0, 'Poliwrath ex', { energy: ['Fighting', 'Fire', 'Fire'] }); G(S, 0, 'active', 1, 'Poliwrath ex', { energy: ['Fighting', 'Fire', 'Water'] }); foe(S); put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) });
	A(/base 100\b/.test(dmgs(S)[0]) && /base 140\b/.test(dmgs(S)[1]), 'Hydro Knuckle does 100, and 100 + 40 with any Water Energy attached');
	S = arena(2); G(S, 0, 'active', 0, 'Phanpy', { energy: ['Fighting'], dmg: 50 }); foe(S);
	exec(S, { attack: 0, ...T0 });
	A(/base 50\b/.test(dmgs(S)[0]), 'Flail does damage equal to the damage on its user (50)');
	S = arena(2); G(S, 0, 'active', 0, 'Seviper', { energy: ['Darkness', 'Fire'] }); G(S, 0, 'active', 1, 'Seviper', { energy: ['Darkness', 'Fire'] }); G(S, 1, 'active', 0, 'Zangoose'); put(S, 1, 'active', 1, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) });
	A(/base 80\b/.test(dmgs(S).find(m => /Zangoose/.test(m))) && /base 40\b/.test(dmgs(S).find(m => /Snorlax/.test(m))), 'Fateful Fang does 40 + 40 into Zangoose, and 40 into any other Pokémon');
	S = arena(2); G(S, 0, 'active', 0, 'Altaria', { energy: ['Fire', 'Fire'] }); G(S, 0, 'active', 1, 'Altaria', { energy: ['Fire', 'Water'] }); foe(S); put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) });
	A(/base 40\b/.test(dmgs(S)[0]) && /base 100\b/.test(dmgs(S)[1]), 'Dragon Arcana does 40, and 40 + 60 with two different types of Energy attached');
	S = arena(2); x = G(S, 0, 'active', 0, 'Miltank', { energy: ['Fire'] }); put(S, 0, 'bench', 0, 'Snorlax'); y = foe(S); y.tool = a2('Giant Cape');
	exec(S, { attack: 0, ...T0 }); exec(S); exec(S, { attack: 0, ...T0 }); exec(S); exec(S, { attack: 0, ...T0 });
	A(/base 10\b/.test(dmgs(S)[0]) && /base 40\b/.test(dmgs(S)[1]) && /base 70\b/.test(dmgs(S)[2]), 'Rolling Frenzy does 10, then +30 more each time it is used (10, 40, 70)');
	exec(S); S.players[0].hand = [a4('Lyra')]; x.dmg = 10; E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0), bench: 0 } });
	A(x.fx.length === 0 && S.players[0].bench[0] === x, 'until it leaves its Active slot');
	S = arena(2); G(S, 0, 'active', 0, 'Azurill'); x = put(S, 0, 'bench', 0, 'Snorlax', { dmg: 20 }); y = put(S, 0, 'bench', 2, 'Snorlax', { dmg: 80 }); foe(S);
	exec(S, { attack: 0, args: { bench: 0 } });
	A(x.dmg === 0 && y.dmg === 80, 'Squishy Healing (no Energy needed) heals 50 from the Benched Pokémon chosen');

	// --- Abilities ---
	S = arena(2); G(S, 0, 'active', 0, 'Suicune ex'); G(S, 0, 'bench', 0, 'Entei ex'); foe(S); S.players[0].hand = []; S.players[0].deck = [id('Potion'), id('Giovanni'), id('Sabrina')];
	exec(S);
	A(S.players[0].hand.length === 1 && logHas(S, /Legendary Pulse/), 'Legendary Pulse: at the end of its player\'s turn, one in an Active slot draws a card (one on the Bench does not)');
	S = arena(2); x = G(S, 0, 'active', 0, 'Feebas'); y = put(S, 0, 'active', 1, 'Squirtle', { dmg: 40 }); z = put(S, 0, 'bench', 0, 'Squirtle', { dmg: 30 }); put(S, 0, 'bench', 1, 'Snorlax', { dmg: 30 }); foe(S); S.players[0].hand = [ss('Milotic')];
	E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) });
	A(S.pending && S.pending.kind === 'pickTarget' && S.pending.seat === 0 && S.pending.locs.length === 2, 'Healing Ripples: played to evolve, Milotic asks its player which of their damaged Water Pokémon to heal');
	E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(z.dmg === 0 && y.dmg === 40, 'and heals 60 from it');
	S = arena(3); put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); put(S, 2, 'active', 1, 'Snorlax'); S.players[0].hand = [ss('Misdreavus'), ss('Misdreavus')]; S.players[2].hand = [id('Potion'), id('Giovanni')];
	E.apply(S, { t: 'playBasic', seat: 0, hand: 0, to: { zone: 'bench', idx: 0 } });
	A(S.pending && S.pending.kind === 'pickTarget' && S.pending.locs.length === 2, 'Infiltrating Inspection: put onto the Bench from the hand, Misdreavus asks its player which opponent reveals their hand');
	E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(E.view(S, 0).log.some(e => /P3's hand: Potion, Giovanni/.test(e.more || '')) && !E.view(S, 1).log.some(e => /Giovanni/.test(e.msg + (e.more || ''))), 'that hand is shown to its player only');
	E.apply(S, { t: 'playBasic', seat: 0, hand: 0, to: { zone: 'bench', idx: 1 } });
	A(!S.pending, 'once a turn');
	S = arena(2); S.players[0].hand = [ss('Misdreavus')]; put(S, 0, 'active', 0, 'Snorlax'); foe(S);
	E.apply(S, { t: 'playBasic', seat: 0, hand: 0, to: { zone: 'active', idx: 1 } });
	A(!S.log.some(e => e.k === 'reveal'), 'not when it is played into an Active slot');
	S = arena(2); x = G(S, 0, 'active', 0, 'Zoroark', { energy: ['Darkness', 'Darkness'] }); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Rattata'); y = put(S, 1, 'active', 1, 'Snorlax', { energy: FOUR() }); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, ...T0 }); exec(S, null, { attack: SN(), target: L(0, 'active', 0) });
	A(S.players[0].points === 1 && x.dmg === 0 && /prevented/.test(dmgs(S).at(-1)), 'Illusive Trickery: after a Knock Out by its attack, attacks do nothing to Zoroark until its player\'s next turn');
	exec(S); exec(S, null, { attack: SN(), target: L(0, 'active', 0) });
	A(x.dmg > 0, 'that turn only');
	{ const r = seeds(12, sd => { const T = arena(2, sd); G(T, 0, 'active', 0, 'Galarian Cursola', { dmg: 70 }); put(T, 0, 'bench', 0, 'Snorlax'); const f = foe(T); f.energy = FOUR(); T.current = 1; exec(T, { attack: SN(), target: L(0, 'active', 0) }); const heads = coin(T, /Perish Body/)[0].heads; return heads ? (T.players[0].points === 1 && T.players[1].points === 1 && T.players[1].active[0] !== f ? 'both' : 'bad') : (T.players[1].active[0] === f && T.players[0].points === 0 ? 'one' : 'bad'); });
		A(!r.bad && r.both > 0 && r.one > 0, 'Perish Body: Knocked Out in an Active slot by an attack, a coin; heads knocks the attacker out too (and scores for it)', r); }

	// --- Trainers and Pokémon Tools ---
	S = arena(2); put(S, 0, 'active', 0, 'Squirtle', { tool: ss('Inflatable Boat') }); put(S, 0, 'active', 1, 'Charmander', { tool: ss('Inflatable Boat') }); foe(S);
	A(E.view(S, 0).players[0].active[0].retreat === card(id('Squirtle')).retreat - 1 && E.view(S, 0).players[0].active[1].retreat === card(id('Charmander')).retreat, 'Inflatable Boat takes 1 off the Retreat Cost of a Water Pokémon, and nothing off another\'s');
	S = arena(2); x = put(S, 0, 'active', 0, 'Charmander', { energy: ['Fire', 'Fire'] }); x.cards.push(id('Charmeleon')); foe(S);
	const own = card(id('Charmeleon')).attacks.length, low = card(id('Charmander')).attacks;
	A(E.view(S, 0).players[0].active[0].extra.length === 0 && /no such attack/.test(refused(() => exec(S, { attack: own, ...T0 }))), 'a Pokémon uses its own attacks only');
	x.tool = ss('Memory Light');
	A(E.view(S, 0).players[0].active[0].extra.join(';') === low.map((_, n) => id('Charmander') + ',' + n).join(';'), 'holding Memory Light, it may also use the attacks of the cards it evolved from');
	exec(S, { attack: own, ...T0 });
	A(logHas(S, new RegExp(`Charmeleon uses ${low[0].name}`)), 'and uses one (its Energy must still pay for it)');
	S = arena(2); x = G(S, 0, 'active', 0, 'Miltank', { dmg: 80 }); x.status.confused = { by: 1, turn: 1 }; x.status.poisoned = { by: 1 }; y = put(S, 0, 'active', 1, 'Snorlax', { dmg: 80 }); foe(S); S.players[0].hand = [ss('Whitney')];
	A(/choose your Miltank/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 1) } }))), 'Whitney is for Miltank only');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } });
	A(x.dmg === 20 && !x.status.confused && !!x.status.poisoned, 'she heals 60 and cures Asleep, Paralyzed and Confused (not Poisoned)');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [ss('Traveling Merchant')]; S.players[0].deck = [a2('Giant Cape'), id('Potion'), ss('Memory Light'), id('Giovanni'), a2('Rocky Helmet'), id('Sabrina')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.players[0].hand.slice().sort().join() === [a2('Giant Cape'), ss('Memory Light')].sort().join() && S.players[0].deck.length === 4 && S.players[0].deck.includes(a2('Rocky Helmet')), 'Traveling Merchant takes the Pokémon Tool cards among the top 4 cards (not one further down) and shuffles the rest back');
	S = arena(2); G(S, 0, 'active', 0, 'Mismagius'); G(S, 0, 'bench', 0, 'Misdreavus'); put(S, 0, 'active', 1, 'Snorlax'); foe(S); S.players[0].hand = [ss('Morty')]; S.players[1].deck = [id('Potion'), id('Giovanni'), id('Sabrina')];
	A(/choose an opponent/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }))), 'Morty needs an opponent');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 1 } });
	A(S.pending && S.pending.kind === 'handPick' && S.pending.seat === 0 && E.view(S, 0).pending.cards.join() === [id('Potion'), id('Giovanni')].join() && E.view(S, 1).pending.cards === null, 'he shows his player the top cards of that opponent\'s deck, one for each of his player\'s Psychic Pokémon (2); the deck\'s owner does not see them');
	E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(S.players[1].deck.join() === [id('Giovanni'), id('Potion'), id('Sabrina')].join(), 'and they go back in the order chosen');

	// --- the computer player ---
	S = arena(2); S.players[0].zone.cur = null; S.players[0].flags.attached = true; S.players[0].hand = []; x = put(S, 0, 'active', 0, 'Charmander', { energy: ['Fire'], tool: ss('Memory Light') }); x.cards.push(id('Charizard ex')); put(S, 0, 'active', 1, 'Snorlax'); foe(S);
	{ const a = nextAction(E.view(S, 0), new Set()); A(a && a.t === 'execute' && a.commands[0] && a.commands[0].attack >= card(id('Charizard ex')).attacks.length, 'the computer player uses an earlier form\'s attack through Memory Light when that is all its Energy pays for', a && a.commands); E.apply(S, a); }
	{
		const N = n => ss(n), two = l => l.flatMap(v => [v, v]);
		const decks = [{ deck: two([N('Suicune ex'), N('Feebas'), N('Milotic'), N('Mantyke'), 'A4a-015', N('Tentacruel'), N('Slowpoke'), N('Slowking'), N('Inflatable Boat'), N('Traveling Merchant')]), energy: ['Water'] },
			{ deck: two([N('Misdreavus'), N('Mismagius'), N('Galarian Corsola'), N('Galarian Cursola'), N('Latias'), N('Latios'), N('Morty'), N('Memory Light'), N('Frillish'), N('Jellicent')]), energy: ['Psychic'] },
			{ deck: two([N('Raikou ex'), N('Yamper'), N('Boltund'), N('Tynamo'), N('Eelektrik'), N('Eelektross'), N('Miltank'), N('Whitney'), N('Azurill'), N('Igglybuff')]), energy: ['Lightning'] },
			{ deck: two([N('Hoppip'), N('Skiploom'), N('Jumpluff ex'), N('Celebi'), N('Durant'), N('Zorua'), N('Zoroark'), N('Seviper'), N('Zangoose'), N('Entei ex')]), energy: ['Grass', 'Darkness'] }];
		A(decks.every(d => E.deckError(d.deck, d.energy) === null), 'four Secluded Springs decks are legal', decks.map(d => E.deckError(d.deck, d.energy)));
		const bad = []; let over = 0;
		for (let g = 0; g < 16; g++) {
			const config = { seed: 'spring' + g, rules: E.RULES, players: [0, 1, 2, 3].slice(0, 2 + (g % 3)).map(i => ({ name: 'P' + i, ai: true, ...decks[(i + g) % 4] })) }, S2 = E.createGame(config), actions = [];
			try {
				for (let step = 0; step < 4000 && !S2.over; step++) {
					const seat = S2.pending ? S2.pending.seat : S2.phase === 'setup' ? S2.players.find(p => !p.setup).seat : S2.current, banned = new Set();
					let done = false;
					for (let t = 0; t < 40 && !done; t++) { const a = nextAction(E.view(S2, seat), banned) || { t: 'execute', seat, commands: [null, null] }; try { E.apply(S2, a); actions.push(a); done = true; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); } }
					if (!done) { bad.push(g + ': stuck'); break; }
				}
				if (S2.over) over++;
				if (E.digest(E.replay(config, actions)) !== E.digest(S2)) bad.push(g + ': replay differs');
				for (const p of S2.players) { const total = p.deck.length + p.hand.length + p.discard.length + [...p.active, ...p.bench].filter(Boolean).reduce((a, k) => a + k.cards.length + (k.tool ? 1 : 0), 0); if (total !== 20) bad.push(`${g}: ${p.name} has ${total} cards`); }
			} catch (e) { bad.push(g + ': ' + e.message); }
		}
		A(over === 16 && bad.length === 0, 'computer players finish 16 matches with Secluded Springs decks (2, 3 and 4 players): every replay matches and every card is accounted for', { over, bad: bad.slice(0, 4) });
	}
}

//// ===== 21. Mega Rising (B1): each new effect, played =====
{
	const of = set => name => { const c = CARDS.find(x => x.set === set && x.name === name); if (!c) throw new Error(`no ${set} card ${name}`); return c.id; };
	const mr = of('B1'), a2 = of('A2'), a4 = of('A4');
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const G = (S, seat, zone, idx, name, o) => putId(S, seat, zone, idx, mr(name), o);
	const dmgs = S => S.log.filter(e => e.k === 'damage').map(e => e.msg);
	const SN = () => card(id('Snorlax')).attacks.length - 1, SHP = card(id('Snorlax')).hp;
	const seeds = (n, f) => { const out = {}; for (let g = 0; g < n; g++) { const r = f('m' + g); out[r] = (out[r] || 0) + 1; } return out; };
	const FOUR = () => ['Fire', 'Fire', 'Fire', 'Fire'];
	const foe = S => { const k = put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax'); return k; };
	const coin = (S, re) => S.log.filter(e => e.k === 'coin' && re.test(e.msg));
	const T0 = { target: L(1, 'active', 0) };
	let S, x, y, z;

	// --- Mega Pokémon ex ---
	S = arena(2); x = G(S, 0, 'active', 0, 'Mega Absol ex', { dmg: card(mr('Mega Absol ex')).hp - 10 }); put(S, 0, 'bench', 0, 'Snorlax'); y = foe(S); y.energy = FOUR(); S.current = 1;
	exec(S, { attack: SN(), target: L(0, 'active', 0) });
	A(S.players[1].points === 3 && S.over, 'a Mega Pokémon ex is worth 3 points when it is Knocked Out (here: the match)');

	// --- attacks ---
	S = arena(2); x = G(S, 0, 'active', 0, 'Silcoon', { energy: ['Grass'] }); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Rattata', { energy: ['Fire'] }); y = put(S, 1, 'active', 1, 'Snorlax', { energy: FOUR() }); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0 }); exec(S, { attack: 0, target: L(0, 'active', 0) }, { attack: SN(), target: L(0, 'active', 0) });
	A(/prevented/.test(dmgs(S)[0]) && !/prevented/.test(dmgs(S)[1]) && x.dmg > 40, 'Harden: until its player\'s next turn, an attack that would do 40 or less does nothing; a bigger one does its damage');
	S = arena(2); G(S, 0, 'active', 0, 'Dustox', { energy: ['Grass'] }); G(S, 0, 'active', 1, 'Dustox', { energy: ['Grass'] }); foe(S); put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, ...T0, args: { status: 'confused' } }, { attack: 0, target: L(1, 'active', 1) });
	A(logHas(S, /Snorlax is now Confused/) && logHas(S, /Snorlax is now Poisoned/), 'Select Powder gives the Special Condition its player chooses (Poisoned when none is)');
	S = arena(2); G(S, 0, 'active', 0, 'Ho-Oh', { energy: FOUR() }); x = put(S, 0, 'bench', 0, 'Charmander', { dmg: 40 }); y = put(S, 0, 'bench', 1, 'Charmeleon', { dmg: 40 }); z = put(S, 0, 'active', 1, 'Charmander', { dmg: 40 }); foe(S);
	exec(S, { attack: 0, ...T0 });
	A(x.dmg === 10 && y.dmg === 40 && z.dmg === 40, 'Blessed Burn heals 30 from each Benched Basic Pokémon (not an evolved one, not an Active one)');
	S = arena(2); x = G(S, 0, 'active', 0, 'Mega Blaziken ex', { energy: ['Fire', 'Fire'] }); y = foe(S);
	exec(S, { attack: 0, ...T0 });
	A(x.energy.length === 1 && logHas(S, /Snorlax is now Burned/), 'Mega Burning discards a Fire Energy from its user and Burns its target');
	S = arena(2); x = G(S, 0, 'active', 0, 'Magikarp', { energy: ['Water', 'Water', 'Fire'] }); foe(S); S.players[0].deck = [id('Potion'), mr('Mega Gyarados ex'), id('Giovanni')];
	exec(S, { attack: 0 });
	A(card(x.cards.at(-1)).name === 'Mega Gyarados ex' && x.cards.length === 2 && S.players[0].deck.length === 2, 'Waterfall Evolution evolves its user with a random card from the deck that evolves from it');
	S = arena(2); G(S, 0, 'active', 0, 'Mega Gyarados ex', { energy: ['Water', 'Water', 'Water', 'Fire'] }); foe(S); S.players[1].deck = [id('Potion'), id('Giovanni'), id('Sabrina'), id('Charmander'), id('Squirtle')];
	exec(S, { attack: 0, ...T0 });
	A(S.players[1].discard.length === 3 && S.players[1].deck.length === 1, 'Mega Blaster discards the top 3 cards of its target\'s owner\'s deck');
	S = arena(2); G(S, 0, 'active', 0, 'Ludicolo', { energy: ['Water', 'Water'] }); G(S, 0, 'active', 1, 'Luvdisc', { energy: ['Water', 'Water'] }); foe(S); put(S, 1, 'active', 1, 'Snorlax'); S.players[0].hand = [id('Potion'), id('Potion'), id('Giovanni')];
	exec(S, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) });
	A(/base 120\b/.test(dmgs(S)[0]) && /base 30\b/.test(dmgs(S)[1]), 'Rhythmic Steps has its bonus with 1, 3 or 5 cards in hand; Paired Tackle with 2, 4 or 6 (3 cards here)');
	S = arena(2); x = G(S, 0, 'active', 0, 'Carracosta', { energy: ['Water', 'Water', 'Fire'] }); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax', { energy: FOUR() }); put(S, 1, 'active', 1, 'Charmeleon', { energy: FOUR() }); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, ...T0 }); exec(S, { attack: SN(), target: L(0, 'active', 0) }, { attack: 0, target: L(0, 'active', 0) });
	A(/prevented/.test(dmgs(S)[1]) && !/prevented/.test(dmgs(S)[2]), 'Blocking Shell: until its player\'s next turn, attacks from Basic Pokémon do no damage to it (an evolved one\'s still do)');
	S = arena(2); G(S, 0, 'active', 0, 'Mega Ampharos ex', { energy: ['Lightning', 'Lightning', 'Fire'] }); x = foe(S); x.tool = a2('Giant Cape'); put(S, 1, 'bench', 2, 'Snorlax');
	exec(S, { attack: 0, ...T0 });
	A(dmgs(S).filter(m => /\(Bench\)/.test(m)).length === 3 && S.players[1].active[0].dmg > 0, 'Lightning Lancer also hits a random Benched Pokémon of that player three times');
	S = arena(2); G(S, 0, 'active', 0, 'Dedenne', { energy: ['Fire'] }); x = foe(S); x.energy = ['Fire', 'Lightning', 'Fire'];
	exec(S, { attack: 0, ...T0 });
	A(x.energy.join() === 'Fire,Fire', 'Electric Nibbling discards a Lightning Energy (not another) from its target');
	S = arena(2); G(S, 0, 'active', 0, 'Cofagrigus', { energy: ['Psychic', 'Psychic'] }); x = foe(S); S.players[0].hand = [id('Potion')];
	exec(S, { attack: 0, ...T0 });
	A(x.dmg === 0 && S.players[0].hand.length === 1, 'Soul Shot does nothing when its player cannot discard 2 cards');
	exec(S); S.players[0].hand = [id('Potion'), id('Giovanni'), id('Sabrina')]; exec(S, { attack: 0, ...T0, args: { cards: [0, 2] } });
	A(x.dmg > 0 && S.players[0].hand.join() === id('Giovanni'), 'with 2 to discard, the two its player chooses go and it does its damage');
	S = arena(2); G(S, 0, 'active', 0, 'Gothitelle', { energy: ['Psychic', 'Psychic'] }); x = foe(S);
	exec(S, { attack: 0, ...T0 }); S.players[1].zone.cur = 'Fire'; E.apply(S, { t: 'attach', seat: 1, at: L(1, 'active', 0) });
	A(!!x.status.asleep, 'Stellar Cradle: an Energy from the Energy Zone onto the Defending Pokémon on its owner\'s next turn puts it to sleep');
	S = arena(2); G(S, 0, 'active', 0, 'Hitmonchan ex', { energy: ['Fighting'] }); put(S, 0, 'active', 1, 'Machop', { energy: ['Fighting'] }); foe(S); put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) });
	A(/Weakness ignored/.test(dmgs(S)[0]) && !/\+20/.test(dmgs(S)[0].replace(/\[.*Weakness ignored/, '')) && S.players[1].active[0].dmg === 50 && /\+20 Fighting into Normal/.test(dmgs(S)[1]), 'Quick Straight ignores Weakness: a Combat Type its target is weak to adds nothing (another Fighting attack gets +20)');
	S = arena(2); G(S, 0, 'active', 0, 'Archeops', { energy: ['Fighting'] }); x = foe(S); x.tool = a2('Giant Cape'); y = S.players[1].bench[0];
	exec(S, { attack: 0, ...T0 }); const d1 = y.dmg; exec(S); exec(S, { attack: 0, ...T0 });
	A(d1 > 0 && y.dmg === d1 * 2 + 20, 'Wild Spin hits each of that player\'s Pokémon, and for 20 more each on its player\'s next turn', [d1, y.dmg]);
	S = arena(2); G(S, 0, 'active', 0, 'Golurk', { energy: ['Fighting', 'Fighting'] }); foe(S); S.players[0].deck = [id('Snorlax'), id('Potion'), id('Snorlax'), id('Snorlax')];
	exec(S, { attack: 0, ...T0 });
	A(/base 120\b/.test(dmgs(S)[0]) && S.players[0].deck.length === 4, 'Heavy Rocket does 60 for each Pokémon with a Retreat Cost of 3 or more among the top 3 cards (2), and they are shuffled back');
	S = arena(2); G(S, 0, 'active', 0, 'Crabominable', { energy: ['Fighting'], dmg: card(mr('Crabominable')).hp - 30 }); G(S, 0, 'active', 1, 'Crabominable', { energy: ['Fighting'] }); foe(S); put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) });
	A(/base 90\b/.test(dmgs(S)[0]) && /base 30\b/.test(dmgs(S)[1]), 'Last-Chance Punch does 30 + 60 with 30 HP or less left');
	S = arena(2); G(S, 0, 'active', 0, 'Honchkrow', { energy: ['Fire', 'Fire'] }); foe(S); putId(S, 1, 'bench', 1, mr('Eiscue')); putId(S, 1, 'active', 1, mr('Klefki'));
	exec(S, { attack: 0, ...T0 });
	A(/base 120\b/.test(dmgs(S)[0]), 'Evil Admonition does 40 + 40 for each Pokémon of that player that has an Ability (2)');
	S = arena(2); G(S, 0, 'active', 0, 'Mega Absol ex', { energy: ['Darkness', 'Darkness'] }); foe(S); S.players[1].hand = [id('Potion'), id('Giovanni'), id('Sabrina')];
	exec(S, { attack: 0, ...T0 });
	A(S.pending && S.pending.kind === 'handPick' && S.pending.seat === 0 && S.pending.options.join() === '1,2', 'Darkness Claw shows its player that hand and asks which Supporter card to discard');
	E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(S.players[1].discard.includes(id('Giovanni')) && S.players[1].hand.includes(id('Sabrina')), 'and it is discarded');
	S = arena(2); G(S, 0, 'active', 0, 'Morgrem', { energy: ['Darkness', 'Darkness'] }); put(S, 0, 'active', 1, 'Snorlax', { energy: FOUR() }); x = G(S, 1, 'active', 0, 'Carracosta', { energy: ['Water', 'Water', 'Fire'], tool: a2('Giant Cape') }); put(S, 1, 'bench', 0, 'Snorlax'); S.current = 1;
	exec(S, { attack: 0, target: L(0, 'active', 1) }); exec(S, { attack: 0, ...T0 }, { attack: SN(), ...T0 });
	A(!/prevented/.test(dmgs(S).at(-2)) && /prevented/.test(dmgs(S).at(-1)), 'False Surrender\'s damage ignores the effects on its target (Blocking Shell stops the other Basic Pokémon\'s attack, not this one)');
	S = arena(2); x = G(S, 0, 'active', 0, 'Corviknight', { energy: ['Metal', 'Metal', 'Fire'] }); put(S, 0, 'bench', 0, 'Snorlax'); y = foe(S); y.energy = FOUR();
	exec(S, { attack: 0, ...T0 }); exec(S, { attack: SN(), target: L(0, 'active', 0) });
	A(x.energy.join() === 'Fire' && /-50 \(guarding\)/.test(dmgs(S).at(-1)), 'Iron Wings discards 2 Metal Energy and takes 50 less from attacks until its player\'s next turn');
	{ const r = seeds(14, sd => { const T = arena(2, sd); G(T, 0, 'active', 0, 'Druddigon', { energy: ['Fire', 'Water', 'Fire', 'Fire'] }); const d = foe(T); d.tool = a2('Giant Cape'); exec(T, { attack: 0, ...T0 }); const h = coin(T, /Giga Claw/).filter(e => e.heads).length; return h ? (d.dmg > 0 ? 'hit' : 'bad') : (d.dmg === 0 ? 'none' : 'bad'); });
		A(!r.bad && r.hit > 0 && r.none > 0, 'Giga Claw does nothing only when both coins are tails', r); }
	{ const r = seeds(14, sd => { const T = arena(2, sd); G(T, 0, 'active', 0, 'Pidgeot', { energy: ['Fire', 'Fire'] }); const d = foe(T); d.tool = a2('Giant Cape'); d.energy = ['Fire', 'Fire', 'Fire']; exec(T, { attack: 0, ...T0 }); const h = coin(T, /Twister/).filter(e => e.heads).length; return h ? (d.dmg > 0 && d.energy.length === 3 - h ? 'h' + h : 'bad') : (d.dmg === 0 && d.energy.length === 3 ? 'none' : 'bad'); });
		A(!r.bad && r.none > 0 && Object.keys(r).length > 2, 'Twister: two coins; a random Energy off its target for each heads; nothing at all on two tails', r); }
	S = arena(2); G(S, 0, 'active', 0, 'Ambipom', { energy: ['Fire'] }); G(S, 0, 'active', 1, 'Ambipom', { energy: ['Fire'], tool: mr('Lucky Mittens') }); foe(S); put(S, 1, 'active', 1, 'Snorlax', { tool: a2('Giant Cape') });
	exec(S, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) });
	A(coin(S, /Excited Tail/).length === 6, 'Excited Tail flips 2 coins, or 4 when its user holds Lucky Mittens');
	S = arena(2); x = G(S, 0, 'active', 0, 'Spinda', { energy: ['Fire'] }); foe(S);
	exec(S, { attack: 0, ...T0 });
	A(logHas(S, /Snorlax is now Confused/) && logHas(S, /Spinda is now Confused/), 'Dizzying Headbutt confuses both its target and its user');

	// --- Abilities ---
	S = arena(2); G(S, 0, 'bench', 0, 'Lilligant'); x = put(S, 0, 'active', 0, 'Bulbasaur'); y = put(S, 0, 'active', 1, 'Snorlax'); foe(S);
	A(E.view(S, 0).players[0].active[0].hp === card(id('Bulbasaur')).hp + 20 && E.view(S, 0).players[0].active[1].hp === SHP && E.view(S, 0).players[0].bench[0].hp === card(mr('Lilligant')).hp + 20, 'Toughness Aroma: each of its player\'s Grass Pokémon (itself too) has +20 HP; no other Pokémon does');
	x.dmg = card(id('Bulbasaur')).hp + 10; z = S.players[0].bench[0]; z.dmg = card(mr('Lilligant')).hp + 10; S.players[0].active[1] = z; S.players[0].bench[0] = y; S.players[1].active[0].energy = FOUR(); S.current = 1;
	exec(S, { attack: SN(), target: L(0, 'active', 1) });
	A(S.players[0].active[0] !== x && S.players[0].active[1] !== z && S.players[1].points === 2, 'when Lilligant is Knocked Out, a Pokémon kept up only by that HP falls with it (and is scored by the same player)', S.players[1].points);
	{ const r = seeds(12, sd => { const T = arena(2, sd); G(T, 0, 'bench', 0, 'Rillaboom'); put(T, 0, 'active', 0, 'Snorlax'); const a0 = put(T, 1, 'active', 0, 'Snorlax'); const b = put(T, 1, 'bench', 2, 'Rattata'); E.apply(T, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { target: L(1, 'active', 0), bench: 2 } }); const heads = coin(T, /Captivating Rhythm/)[0].heads; return heads ? (T.players[1].active[0] === b && T.players[1].bench[2] === a0 ? 'pull' : 'bad') : (T.players[1].active[0] === a0 ? 'stay' : 'bad'); });
		A(!r.bad && r.pull > 0 && r.stay > 0, 'Captivating Rhythm: a coin; heads brings up the opponent\'s Benched Pokémon its player chose', r); }
	S = arena(2); G(S, 0, 'bench', 0, 'Chandelure'); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[1].deck = [id('Giovanni'), id('Potion')];
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { opp: 1 } });
	A(S.players[1].discard.join() === id('Giovanni') && /choose an opponent/.test(refused(() => { const T = arena(2); G(T, 0, 'bench', 0, 'Chandelure'); put(T, 0, 'active', 0, 'Snorlax'); foe(T); E.apply(T, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: {} }); })), 'Slow Sear discards the top card of an opponent\'s deck, once a turn');
	S = arena(2); x = G(S, 0, 'active', 0, 'Jellicent'); y = put(S, 0, 'bench', 0, 'Snorlax'); z = put(S, 0, 'bench', 2, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax', { energy: FOUR() }); put(S, 1, 'bench', 0, 'Snorlax'); S.current = 1;
	exec(S, { attack: SN(), target: L(0, 'active', 0) });
	A(S.pending && S.pending.kind === 'pickTarget' && S.pending.seat === 0 && S.pending.locs.length === 2, 'Bouncy Body: damaged in an Active slot by an attack, Jellicent\'s player is asked which Benched Pokémon takes a Water Energy');
	E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(z.energy.join() === 'Water' && y.energy.length === 0, 'and it is attached from the Energy Zone');
	S = arena(2); G(S, 0, 'bench', 0, 'Greninja ex'); x = put(S, 0, 'active', 0, 'Squirtle'); y = put(S, 0, 'active', 1, 'Charmander'); z = put(S, 0, 'bench', 1, 'Snorlax'); foe(S);
	A(/Water Pokémon in an Active slot/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { slot: 1, bench: 1 } }))), 'Shifting Stream moves only a Water Pokémon out of an Active slot');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { slot: 0, bench: 1 } });
	A(S.players[0].active[0] === z && S.players[0].bench[1] === x, 'and switches it with the Benched Pokémon chosen');
	S = arena(2); x = G(S, 0, 'active', 0, 'Eiscue'); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax', { energy: FOUR() }); put(S, 1, 'active', 1, 'Snorlax', { energy: FOUR() }); put(S, 1, 'bench', 0, 'Snorlax'); S.current = 1; x.tool = a2('Giant Cape');
	exec(S, { attack: SN(), target: L(0, 'active', 0) }, { attack: SN(), target: L(0, 'active', 0) });
	A(/-40 Ice Face/.test(dmgs(S)[0]) && !/Ice Face/.test(dmgs(S)[1]), 'Ice Face takes 40 off an attack while Eiscue has full HP, and nothing after');
	S = arena(2); G(S, 0, 'active', 0, 'Jolteon ex'); x = foe(S); y = S.players[1].bench[0]; S.current = 1; S.players[1].zone.cur = 'Fire';
	E.apply(S, { t: 'attach', seat: 1, at: L(1, 'bench', 0) });
	A(y.dmg === 20 && y.energy.length === 1, 'Electromagnetic Wall: with Jolteon ex in an Active slot, an opponent\'s Pokémon that takes Energy from their Energy Zone takes 20 damage');
	S = arena(2); G(S, 0, 'active', 0, 'Jolteon ex'); x = put(S, 1, 'active', 0, 'Rattata', { dmg: card(id('Rattata')).hp - 20 }); put(S, 1, 'bench', 0, 'Snorlax'); S.current = 1; S.players[1].zone.cur = 'Fire';
	E.apply(S, { t: 'attach', seat: 1, at: L(1, 'active', 0) });
	A(S.players[0].points === 1 && S.players[1].active[0] !== x, 'a Knock Out by it is scored by Jolteon ex\'s player');
	{ const r = seeds(12, sd => { const T = arena(2, sd); G(T, 0, 'active', 0, 'Dusknoir', { dmg: card(mr('Dusknoir')).hp - 10 }); put(T, 0, 'bench', 0, 'Snorlax'); const f = foe(T); f.energy = FOUR(); T.current = 1; exec(T, { attack: SN(), target: L(0, 'active', 0) }); const heads = coin(T, /Fade into Darkness/)[0].heads; return T.players[1].points === (heads ? 0 : 1) ? (heads ? 'none' : 'point') : 'bad'; });
		A(!r.bad && r.none > 0 && r.point > 0, 'Fade into Darkness: Knocked Out, a coin; on heads nobody gets points for Dusknoir', r); }
	S = arena(2); x = G(S, 0, 'bench', 0, 'Klefki'); put(S, 0, 'active', 0, 'Snorlax'); y = foe(S); y.tool = a2('Giant Cape');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: T0 });
	A(!y.tool && S.players[0].bench[0] === null && S.players[0].discard.includes(mr('Klefki')) && S.players[1].points === 0, 'Dismantling Keys: from the Bench, Klefki discards an opposing Active Pokémon\'s Pokémon Tools and is then discarded itself (no points)');
	A(/has no Pokémon Tool/.test(refused(() => { const T = arena(2); G(T, 0, 'bench', 0, 'Klefki'); put(T, 0, 'active', 0, 'Snorlax'); foe(T); E.apply(T, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: T0 }); })), 'not when there is no tool to discard');
	S = arena(2); x = G(S, 0, 'active', 0, 'Hydreigon'); foe(S);
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: {} });
	A(x.energy.join() === 'Darkness,Darkness' && x.dmg === 30, 'Roar in Unison attaches 2 Darkness Energy from the Energy Zone to Hydreigon and does 30 damage to it');
	S = arena(2); G(S, 0, 'active', 0, 'Dragalge ex'); put(S, 0, 'bench', 0, 'Snorlax'); y = foe(S); y.energy = FOUR(); S.current = 1;
	exec(S, { attack: SN(), target: L(0, 'active', 0) });
	A(logHas(S, /Poison Point:/) && logHas(S, /Snorlax is now Poisoned/), 'Poison Point: an attacker that damages Dragalge ex in an Active slot is Poisoned');
	S = arena(2); G(S, 0, 'bench', 0, 'Aegislash'); putId(S, 0, 'active', 0, a4('Skarmory ex'), { energy: ['Metal', 'Metal'] }); put(S, 0, 'active', 1, 'Rattata', { energy: ['Fire'] }); foe(S); put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) });
	A(/\+30 Cursed Metal/.test(dmgs(S)[0]) && !/Cursed Metal/.test(dmgs(S)[1]), 'Cursed Metal gives +30 to the attacks of its player\'s Psychic and Metal Pokémon (not another type\'s)');
	S = arena(2); x = G(S, 0, 'active', 0, 'Eevee'); y = G(S, 0, 'bench', 0, 'Eevee'); foe(S); S.players[0].hand = [mr('Jolteon ex'), mr('Jolteon ex')]; x.turnPlayed = S.turn; y.turnPlayed = S.turn; S.players[0].turns = 0;
	A(/first turn/.test(refused(() => E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'bench', 0) }))), 'Boosted Evolution does nothing on the Bench');
	E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) });
	A(card(x.cards.at(-1)).name === 'Jolteon ex', 'in an Active slot this Eevee may evolve on its player\'s first turn, and on the turn it was played');
	S = arena(2); x = G(S, 0, 'active', 0, 'Skitty'); foe(S); S.players[0].hand = [mr('Delcatty')]; S.players[0].discard = [id('Potion'), id('Giovanni'), id('Sabrina')];
	E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) });
	A(S.pending && S.pending.kind === 'handPick' && S.pending.options.join() === '1,2', 'Search for Friends: played to evolve, Delcatty asks which Supporter card comes back from the discard pile');
	E.apply(S, { t: 'choose', seat: 0, pick: 2 });
	A(S.players[0].hand.join() === id('Sabrina') && S.players[0].discard.length === 2, 'and it goes to the hand');

	// --- Trainers and Pokémon Tools ---
	S = arena(3); put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); put(S, 2, 'active', 0, 'Snorlax'); S.players[0].hand = [mr('Prank Spinner')]; S.players[1].hand = [id('Potion')]; S.players[2].hand = [];
	x = S.players[1].deck.length; E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.players[1].hand.length === 0 && S.players[1].deck.length === x + 1 && logHas(S, /Potion from P2's hand is revealed/), 'Prank Spinner sends a random card from among every player\'s hands into its owner\'s deck (the only card held, here)');
	{ const r = seeds(14, sd => { const T = arena(2, sd); put(T, 0, 'active', 0, 'Snorlax'); const d = foe(T); d.energy = ['Fire', 'Fire']; T.players[0].hand = [mr('Hitting Hammer')]; E.apply(T, { t: 'trainer', seat: 0, hand: 0, args: T0 }); const h = coin(T, /Hitting Hammer/).filter(e => e.heads).length; return d.energy.length === (h === 2 ? 1 : 2) ? (h === 2 ? 'hit' : 'miss') : 'bad'; });
		A(!r.bad && r.hit > 0 && r.miss > 0, 'Hitting Hammer discards a random Energy only on two heads', r); }
	S = arena(2); x = put(S, 0, 'active', 0, 'Charmander'); y = put(S, 0, 'active', 1, 'Snorlax'); foe(S); S.players[0].hand = [mr('Flame Patch')]; S.players[0].energyDiscard = ['Water', 'Fire'];
	A(/Fire Pokémon in an Active slot/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 1) } }))), 'Flame Patch is for a Fire Pokémon in an Active slot');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } });
	A(x.energy.join() === 'Fire' && S.players[0].energyDiscard.join() === 'Water', 'it attaches a Fire Energy from the discard pile');
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax', { dmg: SHP / 2 - 10, tool: mr('Sitrus Berry') }); y = put(S, 0, 'bench', 0, 'Snorlax', { dmg: SHP / 2 + 10, tool: mr('Sitrus Berry') }); foe(S);
	exec(S);
	A(x.dmg === SHP / 2 - 10 && x.tool && y.dmg === SHP / 2 - 20 && !y.tool && S.players[0].discard.includes(mr('Sitrus Berry')), 'Sitrus Berry: at the end of a turn a holder at half its HP or less heals 30 and the berry is discarded; one above half keeps it');
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax', { tool: mr('Heavy Helmet') }); y = put(S, 0, 'active', 1, 'Rattata', { tool: mr('Heavy Helmet') }); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax', { energy: FOUR() }); put(S, 1, 'active', 1, 'Snorlax', { energy: FOUR() }); put(S, 1, 'bench', 0, 'Snorlax'); S.current = 1;
	exec(S, { attack: SN(), target: L(0, 'active', 0) }, { attack: SN(), target: L(0, 'active', 1) });
	A((card(id('Snorlax')).retreat >= 3) === /-20 Heavy Helmet/.test(dmgs(S)[0]) && !/Heavy Helmet/.test(dmgs(S)[1]), 'Heavy Helmet takes 20 off attacks against a holder whose Retreat Cost is 3 or more, and nothing otherwise');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax', { energy: FOUR(), tool: mr('Lucky Mittens') }); put(S, 1, 'active', 0, 'Rattata', { dmg: 20 }); put(S, 1, 'bench', 0, 'Snorlax'); S.players[0].hand = []; x = S.players[0].deck.length;
	exec(S, { attack: SN(), ...T0 });
	A(S.players[0].hand.length === 1 && S.players[0].deck.length === x - 1 && logHas(S, /Lucky Mittens:/), 'Lucky Mittens: its holder\'s attack knocks an opposing Pokémon out, and its player draws a card');
	S = arena(2); x = G(S, 0, 'active', 0, 'Jellicent', { dmg: 90 }); y = put(S, 0, 'active', 1, 'Snorlax', { dmg: 90 }); foe(S); S.players[0].hand = [mr('Marlon')];
	A(/Carracosta or Jellicent/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 1) } }))), 'Marlon heals only Carracosta or Jellicent');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } });
	A(x.dmg === 20, 'by 70');
	S = arena(2); x = G(S, 0, 'active', 0, 'Crabominable', { dmg: 100 }); y = put(S, 0, 'active', 1, 'Rattata', { dmg: 10 }); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax', { energy: FOUR() }); put(S, 1, 'active', 1, 'Snorlax', { energy: FOUR() }); put(S, 1, 'bench', 0, 'Snorlax'); S.players[0].hand = [mr('Hala')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }); exec(S); exec(S, { attack: SN(), target: L(0, 'active', 0) }, { attack: SN(), target: L(0, 'active', 1) });
	A(card(mr('Crabominable')).hp - x.dmg === 10 && S.players[0].active[0] === x && S.players[0].active[1] !== y && /Hala: left with 10 HP/.test(dmgs(S)[0]), 'Hala: until your next turn an attack that would knock out your Hariyama or Crabominable leaves it with 10 HP (another Pokémon is Knocked Out as usual)');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [mr('May'), id('Potion'), id('Snorlax')]; S.players[0].deck = [id('Giovanni'), id('Charmander'), id('Sabrina'), id('Squirtle')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.pending && S.pending.kind === 'handPick' && S.pending.options.join() === '1,2,3' && S.players[0].hand.length === 4, 'May puts 2 random Pokémon from the deck into the hand, then asks which Pokémon in hand goes back (a Trainer card is not a choice)');
	E.apply(S, { t: 'choose', seat: 0, pick: 1 }); E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(!S.pending && S.players[0].hand.length === 2 && S.players[0].hand.includes(id('Potion')) && S.players[0].deck.length === 4, 'once for each Pokémon she found');
	S = arena(2); x = putId(S, 0, 'active', 0, mr('Drifblim')); y = putId(S, 0, 'bench', 0, of('A4a')('Mismagius')); z = put(S, 0, 'active', 1, 'Snorlax'); foe(S); S.players[0].hand = [mr('Fantina')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(x.energy.join() === 'Psychic' && y.energy.join() === 'Psychic' && z.energy.length === 0, 'Fantina attaches a Psychic Energy from the Energy Zone to each of your Drifblim and Mismagius');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [mr('Copycat'), id('Potion')]; S.players[1].hand = [id('Potion'), id('Potion'), id('Potion'), id('Giovanni')]; x = S.players[0].deck.length;
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 1 } });
	A(S.players[0].hand.length === 4 && S.players[0].deck.length === x + 1 - 4, 'Copycat shuffles your hand into your deck and draws a card for each card in that opponent\'s hand (4)');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [mr('Lisia')]; S.players[0].deck = [id('Snorlax'), id('Rattata'), id('Potion'), id('Charmeleon'), mr('Chingling')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.players[0].hand.slice().sort().join() === [id('Rattata'), mr('Chingling')].sort().join() && card(id('Rattata')).hp <= 50, 'Lisia puts 2 random Basic Pokémon with 50 HP or less from the deck into the hand (no bigger or evolved one)');

	// --- the computer player ---
	{
		const N = n => mr(n), two = l => l.flatMap(v => [v, v]);
		const decks = [{ deck: two([N('Torchic'), N('Combusken'), N('Mega Blaziken ex'), N('Ho-Oh'), N('Heatmor'), N('Flame Patch'), N('Sitrus Berry'), N('Litwick'), N('Lampent'), N('Chandelure')]), energy: ['Fire'] },
			{ deck: two([N('Magikarp'), N('Gyarados'), N('Mega Gyarados ex'), N('Froakie'), N('Frogadier'), N('Greninja ex'), N('Eiscue'), N('Heavy Helmet'), N('Luvdisc'), N('Copycat')]), energy: ['Water'] },
			{ deck: two([N('Swablu'), N('Mega Altaria ex'), N('Indeedee ex'), N('Jirachi'), N('Sableye'), N('Klefki'), N('Lisia'), N('Lucky Mittens'), N('Chingling'), N('May')]), energy: ['Psychic'] },
			{ deck: two([N('Mega Absol ex'), N('Absol'), N('Deino'), N('Zweilous'), N('Hydreigon'), N('Skrelp'), N('Dragalge ex'), N('Hitting Hammer'), N('Prank Spinner'), N('Murkrow')]), energy: ['Darkness'] },
			{ deck: two([N('Mareep'), N('Flaaffy'), N('Mega Ampharos ex'), N('Eevee'), N('Jolteon ex'), N('Dedenne'), N('Pachirisu'), N('Skitty'), N('Delcatty'), N('Aipom')]), energy: ['Lightning'] }];
		A(decks.every(d => E.deckError(d.deck, d.energy) === null), 'five Mega Rising decks are legal', decks.map(d => E.deckError(d.deck, d.energy)));
		const bad = []; let over = 0;
		for (let g = 0; g < 20; g++) {
			const config = { seed: 'mega' + g, rules: E.RULES, players: [0, 1, 2, 3].slice(0, 2 + (g % 3)).map(i => ({ name: 'P' + i, ai: true, ...decks[(i + g) % 5] })) }, S2 = E.createGame(config), actions = [];
			try {
				for (let step = 0; step < 4000 && !S2.over; step++) {
					const seat = S2.pending ? S2.pending.seat : S2.phase === 'setup' ? S2.players.find(p => !p.setup).seat : S2.current, banned = new Set();
					let done = false;
					for (let t = 0; t < 40 && !done; t++) { const a = nextAction(E.view(S2, seat), banned) || { t: 'execute', seat, commands: [null, null] }; try { E.apply(S2, a); actions.push(a); done = true; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); } }
					if (!done) { bad.push(g + ': stuck'); break; }
				}
				if (S2.over) over++;
				if (E.digest(E.replay(config, actions)) !== E.digest(S2)) bad.push(g + ': replay differs');
				for (const p of S2.players) { const total = p.deck.length + p.hand.length + p.discard.length + [...p.active, ...p.bench].filter(Boolean).reduce((a, k) => a + k.cards.length + (k.tool ? 1 : 0), 0); if (total !== 20) bad.push(`${g}: ${p.name} has ${total} cards`); }
			} catch (e) { bad.push(g + ': ' + e.message); }
		}
		A(over === 20 && bad.length === 0, 'computer players finish 20 matches with Mega Rising decks (2, 3 and 4 players): every replay matches and every card is accounted for', { over, bad: bad.slice(0, 4) });
	}
}

///// ===== 22. Crimson Blaze (B1a): each new effect, played =====
{
	const of = set => name => { const c = CARDS.find(x => x.set === set && x.name === name); if (!c) throw new Error(`no ${set} card ${name}`); return c.id; };
	const cb = of('B1a'), a2 = of('A2'), a4 = of('A4');
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const G = (S, seat, zone, idx, name, o) => putId(S, seat, zone, idx, cb(name), o);
	const dmgs = S => S.log.filter(e => e.k === 'damage').map(e => e.msg);
	const SN = () => card(id('Snorlax')).attacks.length - 1, SHP = card(id('Snorlax')).hp;
	const FOUR = () => ['Fire', 'Fire', 'Fire', 'Fire'];
	const foe = S => { const k = put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax'); return k; };
	const T0 = { target: L(1, 'active', 0) };
	let S, x, y, z;

	// --- attacks ---
	S = arena(2); G(S, 0, 'active', 0, 'Sunflora', { energy: ['Grass'] }); G(S, 0, 'active', 1, 'Sunflora', { energy: ['Grass'] }); foe(S); put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, ...T0 }); exec(S); S.players[0].discard.push(cb('Quick-Grow Extract')); exec(S, null, { attack: 0, target: L(1, 'active', 1) });
	A(/base 30\b/.test(dmgs(S)[0]) && /base 60\b/.test(dmgs(S).at(-1)), 'Quick-Grow Beam does 30, and 30 + 30 with Quick-Grow Extract in its player\'s discard pile');
	S = arena(2); G(S, 0, 'active', 0, 'Mega Blastoise ex', { energy: ['Water', 'Water', 'Fire'] }); x = foe(S); x.tool = a2('Giant Cape'); y = S.players[1].bench[0]; z = put(S, 1, 'bench', 2, 'Snorlax'); put(S, 1, 'bench', 3, 'Snorlax');
	exec(S, { attack: 0, ...T0 });
	A(y.dmg === 0 && z.dmg === 0, 'Triple Bombardment hits only its target without 3 extra Water Energy');
	S = arena(2); G(S, 0, 'active', 0, 'Mega Blastoise ex', { energy: ['Water', 'Water', 'Fire', 'Water', 'Water', 'Water'] }); x = foe(S); x.tool = a2('Giant Cape'); y = S.players[1].bench[0]; z = put(S, 1, 'bench', 2, 'Snorlax'); const w3 = put(S, 1, 'bench', 3, 'Snorlax');
	exec(S, { attack: 0, ...T0, args: { alsoList: [L(1, 'bench', 3), L(1, 'bench', 2)] } });
	A(y.dmg === 0 && z.dmg > 0 && w3.dmg > 0 && x.dmg > 0, 'with them, it also does 50 to the 2 Benched Pokémon its player chooses');
	S = arena(2); G(S, 0, 'active', 0, 'Misdreavus', { energy: ['Psychic'] }); foe(S); S.players[0].hand = []; S.players[0].deck = [id('Potion'), id('Giovanni'), id('Charmander')];
	exec(S, { attack: 0 });
	A(S.players[0].hand.join() === id('Giovanni'), 'Lead puts a random Supporter card from the deck into the hand');
	S = arena(2); x = G(S, 0, 'active', 0, 'Mismagius', { energy: ['Psychic', 'Psychic', 'Fire'] }); put(S, 0, 'bench', 0, 'Snorlax'); y = put(S, 0, 'bench', 1, 'Snorlax'); foe(S);
	exec(S, { attack: 0, ...T0, args: { bench: 1 } });
	A(x.energy.join() === 'Fire' && y.energy.join() === 'Psychic,Psychic', 'Stored Power moves all its Psychic Energy (and no other) to the Benched Pokémon chosen');
	S = arena(2); G(S, 0, 'active', 0, 'Spritzee', { energy: ['Psychic'] }); x = put(S, 0, 'bench', 0, 'Snorlax', { dmg: 50 }); y = put(S, 0, 'active', 1, 'Snorlax', { dmg: 90 }); foe(S);
	exec(S, { attack: 0, args: { own: L(0, 'bench', 0) } });
	A(x.dmg === 30 && y.dmg === 90, 'Sweet Scent heals 20 from the one of your Pokémon you choose');
	S = arena(2); G(S, 0, 'active', 0, 'Xerneas', { energy: ['Psychic', 'Psychic', 'Fire'], dmg: 50 }); foe(S);
	exec(S, { attack: 0, ...T0 });
	A(/base 70\b/.test(dmgs(S)[0]), 'Geoburst does 120 less the damage on its user (50)');
	S = arena(2); x = G(S, 0, 'active', 0, 'Liepard', { energy: ['Darkness'], tool: a2('Giant Cape') }); x.cards.unshift(cb('Purrloin')); put(S, 0, 'bench', 0, 'Snorlax'); foe(S); S.players[1].hand = [id('Potion')]; y = S.players[0].deck.length;
	exec(S, { attack: 0, ...T0 });
	A(S.players[0].active[0] !== x && S.players[0].deck.length === y + 2 && S.players[0].deck.includes(cb('Liepard')) && S.players[0].discard.includes(a2('Giant Cape')) && S.players[0].energyDiscard.join() === 'Darkness' && S.players[1].points === 0 && logHas(S, /reveals Potion from their hand/),
		'Snatch and Flee sends a card of that hand into its owner\'s deck, then shuffles Liepard (both its cards) into its player\'s deck; its Energy and tool are discarded and nobody scores');
	S = arena(2); x = G(S, 0, 'active', 0, 'Steelix', { energy: ['Metal', 'Metal', 'Fire', 'Fire'] }); put(S, 0, 'bench', 0, 'Snorlax'); y = put(S, 1, 'active', 0, 'Charizard ex', { energy: FOUR() }); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, ...T0 }); exec(S, { attack: 1, target: L(0, 'active', 0) });
	A(/Weakness ignored/.test(dmgs(S).find(m => /Steelix/.test(m) && /Crimson Storm/.test(m)) || ''), 'Metal Defender: until its player\'s next turn Steelix has no Weakness (a Fire attack gets no +20 into it)');
	// Mega Steelix ex: the source record lost its number; the printed -20 (confirmed by the owner) is played from rules revision 4
	for (const rules of [4, 3]) {
		S = arena(2); S.rules = rules; x = G(S, 0, 'active', 0, 'Mega Steelix ex', { energy: ['Metal', 'Metal', 'Fire', 'Fire'] }); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Charizard ex', { energy: FOUR() }); put(S, 1, 'bench', 0, 'Snorlax');
		exec(S, { attack: 0, ...T0 }); exec(S, { attack: 1, target: L(0, 'active', 0) });
		const m = dmgs(S).find(t => /Mega Steelix ex/.test(t) && /Crimson Storm/.test(t)) || '';
		A(/Weakness ignored/.test(m) && /-20 \(guarding\)/.test(m) === (rules >= 4), rules >= 4 ? 'Adamantine Rolling: until its player\'s next turn Mega Steelix ex takes 20 less from attacks and has no Weakness' : 'a match recorded under rules revision 3 replays as it was played: no Weakness, and no reduction', m);
	}
	A(E.RULES >= 4 && card(cb('Mega Steelix ex')).attacks[0].fx[0].reduce === 20 && /takes -20 damage from attacks and has no Weakness/.test(card(cb('Mega Steelix ex')).attacks[0].adapted), 'from rules revision 4 on, and the card says -20');
	S = arena(2); x = G(S, 0, 'active', 0, 'Ditto', { energy: ['Fire'] }); put(S, 0, 'bench', 0, 'Charizard ex'); put(S, 0, 'bench', 1, 'Rattata'); y = foe(S);
	exec(S, { attack: 0, ...T0, args: { from: L(0, 'bench', 0), attack: 0 } });
	A(y.dmg === 0 && logHas(S, /Copy a Friend does nothing/), 'Copy a Friend cannot copy a Pokémon ex');
	exec(S); exec(S, { attack: 0, ...T0, args: { from: L(0, 'bench', 1), attack: 0 } });
	A(y.dmg > 0 && logHas(S, /Ditto copies Rattata's/), 'it uses the attack of one of its player\'s other Benched Pokémon, when Ditto\'s Energy pays for it');
	S = arena(2); G(S, 0, 'active', 0, 'Porygon-Z', { energy: ['Fire', 'Fire', 'Fire'] }); foe(S); S.players[1].deck = [id('Potion'), id('Giovanni'), id('Charmander'), a2('Giant Cape')];
	exec(S, { attack: 0, ...T0 });
	A(/base 80\b/.test(dmgs(S)[0]), 'Cyberjack does 20 + 20 for each Trainer card in its target\'s owner\'s deck (3)');
	S = arena(2); G(S, 0, 'active', 0, 'Mega Lopunny ex', { energy: ['Fighting', 'Fighting'] }); x = foe(S); x.tool = a2('Giant Cape');
	exec(S, { attack: 0, ...T0 });
	A(S.log.filter(e => e.k === 'coin').length === 2 && logHas(S, /Snorlax is now Confused/), 'Rapid Smashers flips 2 coins for its damage and Confuses its target');

	// --- Abilities ---
	S = arena(2); G(S, 0, 'bench', 0, 'Ariados'); put(S, 0, 'active', 0, 'Snorlax'); foe(S);
	A(E.view(S, 1).players[1].active[0].retreat === card(id('Snorlax')).retreat + 1 && E.view(S, 1).players[1].bench[0].retreat === card(id('Snorlax')).retreat && E.view(S, 0).players[0].active[0].retreat === card(id('Snorlax')).retreat, 'Trap Territory: opposing Active Pokémon (only) have 1 more Retreat Cost');
	S = arena(2); x = put(S, 0, 'active', 0, 'Charmander'); y = put(S, 0, 'active', 1, 'Charmander'); foe(S); S.players[0].hand = [cb('Charmeleon')];
	E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) });
	A(S.pending && S.pending.kind === 'pickTarget' && S.pending.locs.length === 2, 'Ignition: played to evolve, Charmeleon asks which of its player\'s Fire Pokémon in an Active slot takes a Fire Energy');
	E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(y.energy.join() === 'Fire' && x.energy.length === 0, 'and it is attached from the Energy Zone');
	S = arena(2); x = G(S, 0, 'bench', 0, 'Wartortle'); y = G(S, 0, 'active', 0, 'Wartortle'); putId(S, 1, 'active', 0, cb('Magneton'), { energy: ['Lightning'] }); put(S, 1, 'bench', 0, 'Snorlax'); S.current = 1;
	exec(S, { attack: 0, target: L(0, 'active', 0), args: { also: L(0, 'bench', 0) } });
	A(x.dmg === 0 && y.dmg > 0 && dmgs(S).some(m => /Bench/.test(m) && /prevented by Shell Shield/.test(m)) && !dmgs(S).some(m => /Active A/.test(m) && /Shell Shield/.test(m)), 'Shell Shield: on the Bench, attacks do no damage to Wartortle; in an Active slot they do');
	S = arena(2); x = G(S, 0, 'active', 0, 'Reuniclus', { energy: ['Psychic', 'Fire', 'Psychic'] }); foe(S);
	A(E.view(S, 0).players[0].active[0].hp === card(cb('Reuniclus')).hp + 60, 'Infinite Increase: +30 HP for each Psychic Energy on Reuniclus (2)');

	// --- Trainers ---
	S = arena(2); G(S, 0, 'active', 0, 'Magneton', { energy: ['Lightning'] }); put(S, 0, 'active', 1, 'Rattata', { energy: ['Fire'] }); x = foe(S); S.players[0].hand = [cb('Clemont\'s Backpack')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }); exec(S, { attack: 0, ...T0, args: { also: L(1, 'bench', 0) } }, { attack: 0, ...T0 });
	A(dmgs(S).filter(m => /\+20 Clemont's Backpack/.test(m)).length === 2 && !/Backpack/.test(dmgs(S).at(-1)), 'Clemont\'s Backpack gives Magneton +20 into every Pokémon it hits, a Benched one too (and nothing to another Pokémon)');
	S = arena(2); x = put(S, 0, 'active', 0, 'Bulbasaur'); y = put(S, 0, 'active', 1, 'Snorlax'); foe(S); S.players[0].hand = [cb('Quick-Grow Extract'), cb('Quick-Grow Extract')]; S.players[0].deck = [id('Potion'), cb('Ivysaur'), id('Charmeleon')];
	A(/Grass Pokémon/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 1) } }))), 'Quick-Grow Extract is for a Grass Pokémon');
	x.turnPlayed = S.turn;
	A(/put into play this turn/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } }))), 'not one put into play this turn');
	x.turnPlayed = -1; E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } });
	A(card(x.cards.at(-1)).name === 'Ivysaur' && S.players[0].deck.length === 2, 'it evolves that Pokémon with a random Grass Pokémon from the deck that evolves from it');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [cb('Clemont')]; S.players[0].deck = [id('Potion'), cb('Magneton'), cb('Clemont\'s Backpack'), cb('Heliolisk'), id('Giovanni')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.players[0].hand.length === 2 && S.players[0].hand.every(i => ['Magneton', 'Heliolisk', 'Clemont\'s Backpack'].includes(card(i).name)) && S.players[0].deck.length === 3, 'Clemont puts 2 random cards from among Magneton, Heliolisk and Clemont\'s Backpack into the hand');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [cb('Serena')]; S.players[0].deck = [id('Charizard ex'), id('Potion'), cb('Mega Steelix ex')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.players[0].hand.join() === cb('Mega Steelix ex'), 'Serena puts a random Mega Evolution Pokémon ex (not another Pokémon ex) from the deck into the hand');

	// --- the computer player ---
	{
		const N = n => cb(n), two = l => l.flatMap(v => [v, v]);
		const decks = [{ deck: two([N('Charmander'), N('Charmeleon'), N('Mega Charizard Y ex'), N('Charizard'), N('Houndour'), N('Houndoom'), N('Serena'), a4('Magby'), N('Bouffalant'), N('Furfrou')]), energy: ['Fire'] },
			{ deck: two([N('Squirtle'), N('Wartortle'), N('Mega Blastoise ex'), N('Blastoise'), N('Clauncher'), N('Clawitzer'), N('Basculin'), N('Ditto'), N('Porygon'), N('Serena')]), energy: ['Water'] },
			{ deck: two([N('Bulbasaur'), N('Ivysaur'), N('Mega Venusaur ex'), N('Sunkern'), N('Sunflora'), N('Spinarak'), N('Ariados'), N('Quick-Grow Extract'), N('Starly'), N('Staravia')]), energy: ['Grass'] },
			{ deck: two([N('Onix'), N('Mega Steelix ex'), N('Steelix'), N('Magnemite'), N('Magneton'), N('Helioptile'), N('Heliolisk'), N('Clemont'), N('Clemont\'s Backpack'), N('Genesect')]), energy: ['Metal', 'Lightning'] },
			{ deck: two([N('Buneary'), N('Mega Lopunny ex'), N('Misdreavus'), N('Mismagius'), N('Solosis'), N('Duosion'), N('Reuniclus'), N('Spritzee'), N('Aromatisse'), N('Xerneas')]), energy: ['Psychic', 'Fighting'] }];
		A(decks.every(d => E.deckError(d.deck, d.energy) === null), 'five Crimson Blaze decks are legal', decks.map(d => E.deckError(d.deck, d.energy)));
		const bad = []; let over = 0;
		for (let g = 0; g < 20; g++) {
			const config = { seed: 'blaze' + g, rules: E.RULES, players: [0, 1, 2, 3].slice(0, 2 + (g % 3)).map(i => ({ name: 'P' + i, ai: true, ...decks[(i + g) % 5] })) }, S2 = E.createGame(config), actions = [];
			try {
				for (let step = 0; step < 4000 && !S2.over; step++) {
					const seat = S2.pending ? S2.pending.seat : S2.phase === 'setup' ? S2.players.find(p => !p.setup).seat : S2.current, banned = new Set();
					let done = false;
					for (let t = 0; t < 40 && !done; t++) { const a = nextAction(E.view(S2, seat), banned) || { t: 'execute', seat, commands: [null, null] }; try { E.apply(S2, a); actions.push(a); done = true; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); } }
					if (!done) { bad.push(g + ': stuck'); break; }
				}
				if (S2.over) over++;
				if (E.digest(E.replay(config, actions)) !== E.digest(S2)) bad.push(g + ': replay differs');
				for (const p of S2.players) { const total = p.deck.length + p.hand.length + p.discard.length + [...p.active, ...p.bench].filter(Boolean).reduce((a, k) => a + k.cards.length + (k.tool ? 1 : 0), 0); if (total !== 20) bad.push(`${g}: ${p.name} has ${total} cards`); }
			} catch (e) { bad.push(g + ': ' + e.message); }
		}
		A(over === 20 && bad.length === 0, 'computer players finish 20 matches with Crimson Blaze decks (2, 3 and 4 players): every replay matches and every card is accounted for', { over, bad: bad.slice(0, 4) });
	}
}

///// ===== 23. Fantastical Parade (B2): Stadiums and each new effect, played =====
{
	const of = set => name => { const c = CARDS.find(x => x.set === set && x.name === name); if (!c) throw new Error(`no ${set} card ${name}`); return c.id; };
	const fp = of('B2'), a2 = of('A2'), a4 = of('A4'), b1 = of('B1');
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const G = (S, seat, zone, idx, name, o) => putId(S, seat, zone, idx, fp(name), o);
	const dmgs = S => S.log.filter(e => e.k === 'damage').map(e => e.msg);
	const SN = () => card(id('Snorlax')).attacks.length - 1, SHP = card(id('Snorlax')).hp;
	const seeds = (n, f) => { const out = {}; for (let g = 0; g < n; g++) { const r = f('p' + g); out[r] = (out[r] || 0) + 1; } return out; };
	const FOUR = () => ['Fire', 'Fire', 'Fire', 'Fire'];
	const foe = S => { const k = put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax'); return k; };
	const coin = (S, re) => S.log.filter(e => e.k === 'coin' && re.test(e.msg));
	const T0 = { target: L(1, 'active', 0) };
	let S, x, y, z;

	// --- Stadiums: one for the whole table ---
	S = arena(2); x = put(S, 0, 'active', 0, 'Rattata'); y = put(S, 0, 'active', 1, 'Charmeleon'); z = foe(S); S.players[0].hand = [fp('Starting Plains'), fp('Starting Plains'), fp('Training Area'), id('Giovanni')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.stadium && S.stadium.id === fp('Starting Plains') && S.stadium.seat === 0 && !S.players[0].discard.length && E.view(S, 1).stadium.id === fp('Starting Plains'), 'a Stadium is played to the table, where every player sees it (it is not discarded)');
	A(E.view(S, 0).players[0].active[0].hp === card(id('Rattata')).hp + 20 && E.view(S, 1).players[1].active[0].hp === SHP + 20 && E.view(S, 0).players[0].active[1].hp === card(id('Charmeleon')).hp, 'Starting Plains: every player\'s Basic Pokémon have +20 HP; an evolved Pokémon does not');
	A(/already in play/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }))) && /already played a Stadium/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 1, args: {} }))), 'a Stadium with the same name cannot be played over it, and a player plays one Stadium a turn');
	E.apply(S, { t: 'trainer', seat: 0, hand: 2, args: {} });
	A(S.players[0].flags.supporter && S.stadium.id === fp('Starting Plains'), 'a Stadium is not a Supporter: one of each may be played in a turn');
	exec(S); S.players[1].hand = [fp('Training Area')]; z.dmg = SHP + 10; E.apply(S, { t: 'trainer', seat: 1, hand: 0, args: {} });
	A(S.stadium.id === fp('Training Area') && S.stadium.seat === 1 && S.players[0].discard.includes(fp('Starting Plains')) && S.players[1].active[0] !== z && S.players[0].points === 0, 'a new Stadium replaces the old one, which goes to its owner\'s discard pile; a Pokémon that only its HP kept up is Knocked Out (nobody scores)');
	S = arena(2); G(S, 0, 'active', 0, 'Ledian', { energy: ['Fire'] }); put(S, 0, 'active', 1, 'Rattata', { energy: ['Fire'] }); x = foe(S); x.tool = a2('Giant Cape'); S.players[0].hand = [fp('Training Area')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }); exec(S, { attack: 0, ...T0 }, { attack: 0, ...T0 });
	A(/\+10 Training Area/.test(dmgs(S)[0]) && !/Training Area/.test(dmgs(S)[1]), 'Training Area: a Stage 1 Pokémon\'s attacks do +10 into an opposing Active Pokémon (a Basic Pokémon\'s do not)');
	S = arena(2); putId(S, 0, 'active', 0, a4('Wobbuffet')); put(S, 0, 'active', 1, 'Snorlax'); foe(S); S.stadium = { id: fp('Peculiar Plaza'), seat: 1 };
	A(E.view(S, 0).players[0].active[0].retreat === Math.max(0, card(a4('Wobbuffet')).retreat - 2) && E.view(S, 0).players[0].active[1].retreat === card(id('Snorlax')).retreat, 'Peculiar Plaza: Psychic Pokémon (every player\'s) retreat for 2 less');
	S = arena(2); x = G(S, 0, 'active', 0, 'Alolan Raichu'); G(S, 0, 'active', 1, 'Tornadus', { energy: ['Fire', 'Fire'] }); G(S, 0, 'bench', 0, 'Machop', { energy: ['Fire'] }); foe(S);
	A(E.view(S, 0).players[0].active[0].retreat === card(fp('Alolan Raichu')).retreat, 'Surge Surfer does nothing with no Stadium in play');
	S.stadium = { id: fp('Training Area'), seat: 1 }; exec(S, null, { attack: 0, ...T0 });
	A(E.view(S, 0).players[0].active[0].retreat === 0 && /base 80\b/.test(dmgs(S)[0]), 'with one in play Alolan Raichu has no Retreat Cost, and Tornadus\'s Blow Through does 40 more');
	exec(S); S.players[0].active[1] = S.players[0].bench[0]; S.players[0].bench[0] = null; exec(S, null, { attack: 0, ...T0 });
	A(!S.stadium && S.players[1].discard.includes(fp('Training Area')), 'Machop\'s Shatter discards the Stadium in play (to its owner\'s discard pile)');

	// --- attacks ---
	S = arena(2); G(S, 0, 'active', 0, 'Ledian', { energy: ['Fire'] }); put(S, 0, 'bench', 0, 'Snorlax'); x = putId(S, 1, 'active', 0, a4('Chansey'), { energy: ['Fire', 'Fire'] }); put(S, 1, 'bench', 0, 'Snorlax'); x.fx.push({ k: 'preventDamage', until: { seat: 1, at: 'start' } });
	exec(S, { attack: 0, ...T0 });
	A(x.dmg === 40 && !/prevented/.test(dmgs(S)[0]), 'Swift ignores Weakness and the effects on its target (a Pokémon protected for the turn is still hit)');
	S = arena(2); G(S, 0, 'active', 0, 'Buzzwole', { energy: ['Grass', 'Grass'] }); foe(S); S.players[1].points = 1;
	exec(S, { attack: 0, ...T0 });
	A(/base 80\b/.test(dmgs(S)[0]), 'Ground Beat does 40 + 40 when its target\'s owner has exactly 1 point');
	S = arena(2); x = G(S, 0, 'active', 0, 'Eldegoss', { energy: ['Grass'], tool: a2('Giant Cape') }); x.cards.unshift(fp('Gossifleur')); put(S, 0, 'bench', 0, 'Snorlax'); foe(S); y = S.players[0].deck.length;
	exec(S, { attack: 0, ...T0 });
	A(S.players[0].active[0] === x, 'Float Up: "you may shuffle" — with no choice made Eldegoss stays');
	exec(S); exec(S, { attack: 0, ...T0, args: { shuffle: true } });
	A(S.players[0].active[0] !== x && S.players[0].deck.includes(fp('Eldegoss')) && S.players[0].deck.includes(a2('Giant Cape')) && S.players[0].energyDiscard.join() === 'Grass' && S.players[1].points === 0, 'chosen, Eldegoss and the cards attached to it (its Pokémon Tool too) go into the deck; its Energy is discarded; nobody scores');
	S = arena(2); G(S, 0, 'active', 0, 'Oricorio', { energy: ['Fire'] }); put(S, 0, 'active', 1, 'Rattata', { energy: ['Fire'] }); x = foe(S); x.tool = a2('Giant Cape');
	exec(S, { attack: 0, ...T0 }, { attack: 0, ...T0 }); exec(S); exec(S, null, { attack: 0, ...T0 });
	A(!/Inspiring Dance/.test(dmgs(S)[1]) && /\+20 Inspiring Dance/.test(dmgs(S).at(-1)), 'Inspiring Dance: on its player\'s NEXT turn (not this one) their Pokémon\'s attacks do +20');
	exec(S); exec(S, null, { attack: 0, ...T0 });
	A(!/Inspiring Dance/.test(dmgs(S).at(-1)), 'that turn only');
	{ const r = seeds(12, sd => { const T = arena(2, sd); G(T, 0, 'active', 0, 'Delibird', { energy: ['Fire', 'Fire'] }); const d = foe(T); d.dmg = 50; d.tool = a2('Giant Cape'); exec(T, { attack: 0, ...T0 }); const heads = coin(T, /Box of Surprises/)[0].heads; return heads ? (d.dmg > 50 ? 'hit' : 'bad') : (d.dmg === 20 ? 'heal' : 'bad'); });
		A(!r.bad && r.hit > 0 && r.heal > 0, 'Box of Surprises: heads does 70 damage; tails heals 30 from its target', r); }
	S = arena(2); G(S, 0, 'active', 0, 'Mega Swampert ex', { energy: ['Water', 'Water', 'Water'] }); x = foe(S); x.energy = ['Fire']; x.tool = a2('Giant Cape');
	exec(S, { attack: 0, ...T0 });
	A(S.players[0].active[0].energy.length + x.energy.length === 2 && (S.players[0].energyDiscard || []).length + (S.players[1].energyDiscard || []).length === 2, 'Strong-Armed Destroyer discards 2 random Energy from among every Pokémon in play, its own side\'s included');
	S = arena(2); G(S, 0, 'active', 0, 'Minun', { energy: ['Lightning', 'Fire'] }); G(S, 0, 'active', 1, 'Minun', { energy: ['Lightning', 'Fire'] }); x = foe(S); y = S.players[1].bench[0];
	exec(S, { attack: 0, ...T0 });
	A(y.dmg === 0, 'Buddy Spark hits the Bench only with Plusle on its player\'s Bench');
	G(S, 0, 'bench', 0, 'Plusle'); exec(S); exec(S, { attack: 0, ...T0 });
	A(y.dmg > 0, 'with it, each of that player\'s Benched Pokémon takes 10');
	S = arena(2); G(S, 0, 'active', 0, 'Toxtricity ex', { energy: ['Lightning', 'Lightning', 'Fire', 'Fire'] }); x = foe(S); x.tool = a2('Giant Cape'); y = S.players[1].bench[0]; z = put(S, 1, 'bench', 2, 'Snorlax', { dmg: 10 });
	exec(S, { attack: 0, ...T0 });
	A(y.dmg === 0 && z.dmg > 10, 'Damaging Spark also hits each Benched Pokémon that already has damage (and no undamaged one)');
	S = arena(2); G(S, 0, 'active', 0, 'Galarian Rapidash', { energy: ['Psychic', 'Psychic'] }); put(S, 0, 'bench', 0, 'Snorlax', { energy: ['Psychic', 'Psychic', 'Psychic'] }); foe(S);
	exec(S, { attack: 0, ...T0 });
	A(/base 100\b/.test(dmgs(S)[0]), 'Photon Laser does 40 + 60 with 5 or more Psychic Energy on its player\'s Pokémon');
	S = arena(2); x = G(S, 0, 'active', 0, 'Mega Gardevoir ex', { energy: ['Psychic', 'Psychic'] }); y = putId(S, 0, 'bench', 0, a4('Wobbuffet')); z = put(S, 0, 'bench', 1, 'Snorlax'); foe(S);
	exec(S, { attack: 0, ...T0, args: { spreadLocs: [L(0, 'bench', 0), L(0, 'bench', 0), L(0, 'bench', 1)] } });
	A(y.energy.join() === 'Psychic,Psychic' && z.energy.length === 0 && x.energy.length === 3, 'Fantasia Force attaches 3 Psychic Energy to its player\'s Psychic Pokémon as they choose (a choice of another type goes to a Psychic one instead)');
	S = arena(2); G(S, 0, 'active', 0, 'Chandelure', { energy: ['Psychic', 'Psychic'] }); foe(S); S.players[0].discard = [id('Giovanni'), id('Potion'), id('Sabrina')];
	exec(S, { attack: 0, ...T0 });
	A(/base 100\b/.test(dmgs(S)[0]), 'Past Friends does 60 + 20 for each Supporter card in its player\'s discard pile (2)');
	S = arena(2); G(S, 0, 'active', 0, 'Tyrantrum', { energy: ['Fighting', 'Fighting', 'Fighting'] }); foe(S);
	exec(S, { attack: 0, ...T0 });
	A(/base 180\b/.test(dmgs(S)[0]), 'Tyrannical Fang does 100 + 80 with fewer Pokémon in play than its target\'s owner');
	S = arena(2); G(S, 0, 'active', 0, 'Scrafty', { energy: ['Darkness', 'Darkness'] }); G(S, 0, 'active', 1, 'Scrafty', { energy: ['Darkness', 'Darkness'] }); x = foe(S); x.energy = ['Fire']; put(S, 1, 'active', 1, 'Snorlax', { energy: ['Fire', 'Fire'] });
	exec(S, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) });
	A(/base 100\b/.test(dmgs(S)[0]) && /base 50\b/.test(dmgs(S)[1]), 'Crush the Weak does 50 + 50 into a Pokémon with less Energy than its user');
	{ const r = seeds(12, sd => { const T = arena(2, sd); G(T, 0, 'active', 0, 'Guzzlord', { energy: ['Darkness', 'Darkness', 'Darkness', 'Fire'] }); const d = put(T, 1, 'active', 0, 'Snorlax', { energy: ['Fire'], tool: a2('Giant Cape') }); put(T, 1, 'active', 1, 'Snorlax'); exec(T, { attack: 0, ...T0 }); const heads = coin(T, /Breakcore/)[0].heads;
			return heads ? (T.players[1].active[0] === null && T.players[1].discard.includes(id('Snorlax')) && T.players[0].points === 0 ? 'gone' : 'bad') : (T.players[1].active[0] === d ? 'stay' : 'bad'); });
		A(!r.bad && r.gone > 0 && r.stay > 0, 'Breakcore: on heads the Defending Pokémon is discarded (its cards, tool and Energy), and nobody scores', r); }
	S = arena(2); x = G(S, 0, 'active', 0, 'Galarian Stunfisk', { energy: ['Metal', 'Fire'] }); put(S, 0, 'bench', 0, 'Snorlax'); y = put(S, 1, 'active', 0, 'Snorlax', { energy: FOUR() }); z = put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, ...T0 }); E.apply(S, { t: 'retreat', seat: 1, slot: 0, bench: 0 });
	A(z.dmg === 40 && S.players[1].active[0] === z, 'Snapping Trap: when an opposing Active Pokémon retreats on that turn, the Pokémon that comes up takes 40');
	S = arena(2); x = G(S, 0, 'active', 0, 'Aegislash', { energy: ['Metal', 'Metal', 'Metal'] }); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Charizard ex', { energy: FOUR() }); put(S, 1, 'active', 1, 'Snorlax', { energy: FOUR() }); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, ...T0 }); exec(S, { attack: 0, target: L(0, 'active', 0) }, { attack: SN(), target: L(0, 'active', 0) });
	A(/-80 \(guarding against Pokémon ex\)/.test(dmgs(S).at(-2)) && !/guarding/.test(dmgs(S).at(-1)), 'Superb Shield takes 80 off attacks from Pokémon ex until its player\'s next turn (not off another Pokémon\'s)');
	S = arena(2); G(S, 0, 'active', 0, 'Mega Kangaskhan ex', { energy: FOUR() }); x = foe(S); x.tool = a2('Giant Cape');
	exec(S, { attack: 0, ...T0 });
	A(dmgs(S).length === 2 && /base 80\b/.test(dmgs(S)[0]) && /second attack/.test(dmgs(S)[1]) && /base 40\b/.test(dmgs(S)[1]), 'Double-Punching Family is used twice: 80, then 40');
	S = arena(2); G(S, 0, 'active', 0, 'Mega Kangaskhan ex', { energy: FOUR() }); put(S, 1, 'active', 0, 'Rattata'); y = put(S, 1, 'bench', 0, 'Snorlax', { tool: a2('Giant Cape') });
	exec(S, { attack: 0, ...T0 });
	A(S.players[0].points === 1 && y.dmg > 0 && S.players[1].active[0] === y, 'when the first knocks its target out, the second lands on the Pokémon that takes its place');
	S = arena(2); G(S, 0, 'active', 0, 'Tandemaus', { energy: ['Fire'] }); foe(S); S.players[0].deck = [fp('Maushold'), id('Potion'), fp('Tandemaus'), fp('Tandemaus'), fp('Maushold')];
	exec(S, { attack: 0 });
	A(S.players[0].bench.filter(Boolean).length === 3 && S.players[0].bench.filter(Boolean).every(k => ['Tandemaus', 'Maushold'].includes(card(k.cards[0]).name)) && S.players[0].deck.length === 2, 'Flock puts 3 random Tandemaus and Maushold from the deck onto the Bench');
	exec(S); S.players[0].active[0] = S.players[0].bench.find(k => k && card(k.cards[0]).name === 'Maushold') || G(S, 0, 'active', 0, 'Maushold'); S.players[0].active[0].energy = ['Fire']; S.players[0].active[0].turnPlayed = -1; S.players[0].bench = S.players[0].bench.map(k => (k === S.players[0].active[0] ? null : k));
	x = S.log.length; exec(S, { attack: 0, ...T0 });
	A(S.log.slice(x).filter(e => e.k === 'coin').length === 3, 'Family Beatdown flips a coin for each Tandemaus and Maushold its player has in play (3)');
	S = arena(2); G(S, 0, 'active', 0, 'Teal Mask Ogerpon ex', { energy: ['Grass', 'Grass'] }); x = foe(S); x.energy = ['Fire', 'Fire', 'Fire'];
	exec(S, { attack: 0, ...T0 });
	A(/base 120\b/.test(dmgs(S)[0]), 'Energized Leaves does 60 + 60 when its user and its target hold 5 or more Energy between them');

	// --- Abilities ---
	S = arena(2); G(S, 0, 'bench', 0, 'Teal Mask Ogerpon ex'); x = put(S, 0, 'active', 0, 'Snorlax', { energy: ['Fire'] }); y = put(S, 0, 'active', 1, 'Snorlax'); x.status.poisoned = { by: 1 }; y.status.poisoned = { by: 1 }; foe(S); S.players[0].zone.cur = 'Grass';
	E.apply(S, { t: 'attach', seat: 0, at: L(0, 'bench', 0) });
	A(Object.keys(x.status).length === 0 && !!y.status.poisoned, 'Soothing Wind: each of its player\'s Pokémon that holds any Energy recovers from Special Conditions (one with none does not)');
	S = arena(2); G(S, 0, 'active', 0, 'Meloetta'); foe(S); S.players[0].deck = [id('Potion'), a4('Wobbuffet'), id('Charmander'), id('Potion')]; S.players[0].hand = [];
	exec(S); exec(S);
	A(S.players[0].hand.includes(a4('Wobbuffet')) && S.players[0].hand.length === 2, 'Strange Singing: at the start of its player\'s turn, from an Active slot, a random Psychic Pokémon comes from the deck to the hand (as well as the turn\'s card)');
	S = arena(2); x = G(S, 0, 'active', 0, 'Mimikyu ex'); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax', { energy: FOUR() }); put(S, 1, 'active', 1, 'Snorlax', { energy: FOUR() }); put(S, 1, 'bench', 0, 'Snorlax'); S.current = 1;
	exec(S, { attack: SN(), target: L(0, 'active', 0) }, { attack: SN(), target: L(0, 'active', 0) });
	A(/prevented by Disguise/.test(dmgs(S)[0]) && !/Disguise/.test(dmgs(S)[1]) && x.dmg > 0, 'Disguise prevents the first attack damage Mimikyu ex would take, once');
	S = arena(2); x = G(S, 0, 'active', 0, 'Sinistea'); foe(S); S.players[0].hand = [fp('Polteageist')]; S.players[1].hand = [id('Potion'), id('Potion'), id('Potion'), id('Potion'), id('Potion')]; S.players[1].points = 1; y = S.players[1].deck.length;
	E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) });
	A(S.pending && S.pending.kind === 'confirm', 'Refreshing Tea: played to evolve, Polteageist asks its player whether to use it');
	E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(S.players[1].hand.length === S.opts.points - 1 && S.players[1].deck.length === y + 5 - (S.opts.points - 1), 'Yes: the opponent shuffles their hand into their deck and draws a card for each point they still need');
	S = arena(2); G(S, 0, 'active', 0, 'Falinks', { energy: ['Fighting'] }); foe(S).tool = a2('Giant Cape');
	exec(S, { attack: 0, ...T0 });
	A(!/Coordinated Unit/.test(dmgs(S)[0]), 'Coordinated Unit does nothing for a lone Falinks');
	S = arena(2); x = G(S, 0, 'active', 0, 'Falinks', { energy: ['Fighting'] }); G(S, 0, 'bench', 0, 'Falinks'); y = foe(S); y.tool = a2('Giant Cape'); y.energy = FOUR();
	exec(S, { attack: 0, ...T0 }); exec(S, { attack: SN(), target: L(0, 'active', 0) });
	A(/\+20 Coordinated Unit/.test(dmgs(S)[0]) && /-20 Coordinated Unit/.test(dmgs(S)[1]), 'with another Falinks in play its attacks do +20 and it takes 20 less');
	S = arena(2); G(S, 0, 'bench', 0, 'Alolan Muk'); x = putId(S, 1, 'active', 0, a4('Hoothoot')); putId(S, 1, 'bench', 0, a4('Typhlosion')); y = putId(S, 1, 'bench', 1, b1('Eiscue')); putId(S, 0, 'active', 0, a4('Tangela'), { energy: ['Grass', 'Fire'] });
	exec(S, { attack: 0, ...T0 });
	A(!!x.status.asleep, 'Power of Alchemy: a Basic Pokémon has no Ability while Alolan Muk is in play (Hoothoot\'s Insomnia does not stop sleep)');
	A(E.view(S, 1).players[1].bench[0] && /stops Basic Pokémon/.test(refused(() => { const T = arena(2); G(T, 0, 'bench', 0, 'Alolan Muk'); put(T, 0, 'active', 0, 'Snorlax'); putId(T, 1, 'active', 0, b1('Klefki')); putId(T, 1, 'bench', 0, b1('Klefki')); T.current = 1; put(T, 0, 'active', 1, 'Snorlax', { tool: a2('Giant Cape') }); E.apply(T, { t: 'ability', seat: 1, at: L(1, 'bench', 0), args: { target: L(0, 'active', 1) } }); })), 'and cannot use one; an evolved Pokémon\'s Ability (Alolan Muk\'s own) still works');
	S = arena(2); G(S, 0, 'active', 0, 'Spiritomb', { dmg: 60 }); put(S, 0, 'bench', 0, 'Snorlax'); x = foe(S); x.energy = FOUR(); y = S.players[1].bench[0]; z = put(S, 1, 'bench', 1, 'Snorlax', { tool: fp('Protective Poncho') }); S.current = 1;
	exec(S, { attack: SN(), target: L(0, 'active', 0) });
	A(x.dmg === 10 && y.dmg === 10 && z.dmg === 0 && S.players[1].points === 1, 'Final Scream: Knocked Out in an Active slot by an attack, Spiritomb does 10 to each of the attacker\'s owner\'s Pokémon (Protective Poncho keeps a Benched one safe)');
	S = arena(2); x = G(S, 0, 'active', 0, 'Galarian Meowth'); foe(S); S.players[0].hand = [fp('Galarian Perrserker')]; S.players[0].discard = [a2('Giant Cape'), id('Potion'), a2('Rocky Helmet'), a2('Giant Cape')];
	E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) });
	A(S.players[0].hand.length === 2 && S.players[0].hand.every(i => card(i).kind === 'tool') && S.players[0].discard.length === 2, 'Dig Up: played to evolve, Galarian Perrserker brings 2 random Pokémon Tool cards back from the discard pile');
	S = arena(2); G(S, 0, 'active', 0, 'Smeargle'); put(S, 0, 'active', 1, 'Rattata', { energy: ['Fire'] }); x = foe(S); x.tool = a2('Giant Cape'); S.players[1].hand = [id('Potion'), id('Giovanni')]; S.players[0].hand = [id('Sabrina')];
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { opp: 1 } });
	A(E.view(S, 0).players[0].flags.penny === id('Giovanni') && E.view(S, 0).players[0].flags.pennyBy === 'Portrait' && S.players[1].hand.length === 2, 'Portrait: from an Active slot Smeargle looks at a random Supporter in an opponent\'s hand (the card stays there)');
	E.apply(S, { t: 'trainer', seat: 0, penny: true, args: {} });
	A(logHas(S, /Portrait: P1 uses the effect of Giovanni/) && S.players[0].flags.boost.length === 1 && !S.players[0].flags.supporter, 'its player then uses that card\'s effect as the Ability\'s; it is not their Supporter for the turn');
	S = arena(2); G(S, 0, 'bench', 0, 'Swellow'); put(S, 0, 'active', 0, 'Snorlax'); x = put(S, 1, 'active', 0, 'Charmeleon'); y = put(S, 1, 'active', 1, 'Rattata'); z = put(S, 1, 'bench', 0, 'Snorlax');
	A(/Basic Pokémon/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { target: L(1, 'active', 0) } }))), 'Repelling Wind sends away only a Basic Pokémon');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { target: L(1, 'active', 1) } });
	A(S.players[1].active[1] === z && S.players[1].bench[0] === y, 'its owner brings up a Benched Pokémon in its place');

	// --- Trainers and Pokémon Tools ---
	{ const r = seeds(12, sd => { const T = arena(2, sd); const k = put(T, 0, 'active', 0, 'Snorlax', { dmg: 50 }); foe(T); T.players[0].hand = [fp('Lucky Ice Pop')]; E.apply(T, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } }); const heads = coin(T, /Lucky Ice Pop/)[0].heads; return k.dmg === 30 && (heads ? T.players[0].hand.join() === fp('Lucky Ice Pop') && !T.players[0].discard.length : T.players[0].discard.join() === fp('Lucky Ice Pop') && !T.players[0].hand.length) ? (heads ? 'back' : 'gone') : 'bad'; });
		A(!r.bad && r.back > 0 && r.gone > 0, 'Lucky Ice Pop heals 20 from an Active Pokémon; on heads it returns to the hand', r); }
	S = arena(2); x = put(S, 0, 'bench', 0, 'Snorlax', { tool: fp('Protective Poncho') }); put(S, 0, 'active', 0, 'Snorlax'); putId(S, 1, 'active', 0, a4('Absol'), { energy: ['Darkness'] }); put(S, 1, 'bench', 0, 'Snorlax'); S.current = 1;
	exec(S, { attack: 0, target: L(0, 'bench', 0) });
	A(x.dmg === 0 && /prevented by Protective Poncho/.test(dmgs(S)[0]), 'Protective Poncho: on the Bench its holder takes no damage from an opposing attack');
	S = arena(2); x = putId(S, 0, 'active', 0, a4('Skarmory ex')); put(S, 0, 'bench', 0, 'Snorlax'); y = foe(S); y.energy = FOUR(); S.players[0].hand = [fp('Metal Core Barrier')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } }); exec(S); exec(S, { attack: SN(), target: L(0, 'active', 0) });
	A(/-50 Metal Core Barrier/.test(dmgs(S)[0]) && !x.tool && S.players[0].discard.includes(fp('Metal Core Barrier')), 'Metal Core Barrier takes 50 off attacks against its Metal holder, and is discarded at the end of the opponent\'s turn');
	S = arena(2); x = putId(S, 0, 'active', 0, a4('Wobbuffet'), { dmg: 80, energy: ['Psychic', 'Psychic', 'Fire'] }); y = putId(S, 0, 'active', 1, a4('Wobbuffet'), { dmg: 80, energy: ['Psychic'] }); foe(S); S.players[0].hand = [fp('Diantha')];
	A(/2 or more Psychic Energy/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 1) } }))), 'Diantha needs a Psychic Pokémon with 2 or more Psychic Energy');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } });
	A(x.dmg === 0 && x.energy.join() === 'Fire', 'she heals 90 from it and discards 2 of its Psychic Energy');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [fp('Sightseer')]; S.players[0].deck = [id('Charmeleon'), id('Charmander'), id('Potion'), id('Wartortle'), id('Ivysaur')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.players[0].hand.slice().sort().join() === [id('Charmeleon'), id('Wartortle')].sort().join() && S.players[0].deck.length === 3, 'Sightseer takes the Stage 1 Pokémon among the top 4 cards and shuffles the rest back');
	S = arena(2); x = put(S, 0, 'active', 1, 'Snorlax', { energy: ['Fire'] }); put(S, 0, 'active', 0, 'Snorlax'); y = put(S, 0, 'bench', 0, 'Snorlax', { energy: ['Water', 'Water'] }); z = put(S, 0, 'bench', 1, 'Snorlax', { energy: ['Water'] }); foe(S); S.players[0].hand = [fp('Juggler')];
	A(/3 or more different types/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 1) } }))), 'Juggler needs 3 or more different types of Energy among its player\'s Pokémon');
	z.energy = ['Grass']; E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 1) } });
	A(x.energy.length === 4 && y.energy.length === 0 && z.energy.length === 0, 'with them, all the Energy on the Bench moves to the Active Pokémon chosen');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); x = foe(S); x.energy = ['Fire', 'Fire', 'Fire']; S.players[0].hand = [fp('Piers')];
	A(/Galarian Obstagoon/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: T0 }))), 'Piers needs Galarian Obstagoon in play');
	G(S, 0, 'bench', 0, 'Galarian Obstagoon'); E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: T0 });
	A(x.energy.length === 1, 'he discards 2 random Energy from an opposing Active Pokémon');

	// --- the computer player ---
	S = arena(2); S.players[0].zone.cur = null; S.players[0].flags.attached = true; S.players[0].hand = [fp('Starting Plains')]; put(S, 0, 'active', 0, 'Snorlax'); put(S, 0, 'active', 1, 'Snorlax'); foe(S);
	{ const a = nextAction(E.view(S, 0), new Set()); A(a && a.t === 'trainer' && a.hand === 0, 'the computer player plays a Stadium when none of its own is up', a); E.apply(S, a); A(!!S.stadium, 'and the engine takes it'); }
	{
		const N = n => fp(n), two = l => l.flatMap(v => [v, v]);
		const decks = [{ deck: two([N('Ralts'), N('Kirlia'), N('Mega Gardevoir ex'), N('Meloetta'), N('Mimikyu ex'), N('Peculiar Plaza'), N('Diantha'), N('Sinistea'), N('Polteageist'), N('Galarian Ponyta')]), energy: ['Psychic'] },
			{ deck: two([N('Teal Mask Ogerpon ex'), N('Hearthflame Mask Ogerpon'), N('Wellspring Mask Ogerpon'), N('Cornerstone Mask Ogerpon'), N('Ledyba'), N('Ledian'), N('Starting Plains'), N('Lucky Ice Pop'), N('Buzzwole'), N('Juggler')]), energy: ['Grass', 'Fire', 'Water'] },
			{ deck: two([N('Mega Kangaskhan ex'), N('Tandemaus'), N('Maushold'), N('Smeargle'), N('Taillow'), N('Swellow'), N('Tornadus'), N('Training Area'), N('Sightseer'), N('Protective Poncho')]), energy: ['Lightning'] },
			{ deck: two([N('Mega Mawile ex'), N('Galarian Meowth'), N('Galarian Perrserker'), N('Galarian Stunfisk'), N('Honedge'), N('Doublade'), N('Aegislash'), N('Metal Core Barrier'), N('Machop'), N('Falinks')]), energy: ['Metal', 'Fighting'] },
			{ deck: two([N('Alolan Grimer'), N('Alolan Muk'), N('Spiritomb'), N('Guzzlord'), N('Scraggy'), N('Scrafty'), N('Galarian Zigzagoon'), N('Galarian Linoone'), N('Galarian Obstagoon'), N('Piers')]), energy: ['Darkness'] }];
		A(decks.every(d => E.deckError(d.deck, d.energy) === null), 'five Fantastical Parade decks are legal', decks.map(d => E.deckError(d.deck, d.energy)));
		const bad = []; let over = 0, stadiums = 0;
		for (let g = 0; g < 20; g++) {
			const config = { seed: 'parade' + g, rules: E.RULES, players: [0, 1, 2, 3].slice(0, 2 + (g % 3)).map(i => ({ name: 'P' + i, ai: true, ...decks[(i + g) % 5] })) }, S2 = E.createGame(config), actions = [];
			try {
				for (let step = 0; step < 4000 && !S2.over; step++) {
					const seat = S2.pending ? S2.pending.seat : S2.phase === 'setup' ? S2.players.find(p => !p.setup).seat : S2.current, banned = new Set();
					let done = false;
					for (let t = 0; t < 40 && !done; t++) { const a = nextAction(E.view(S2, seat), banned) || { t: 'execute', seat, commands: [null, null] }; try { E.apply(S2, a); actions.push(a); done = true; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); } }
					if (!done) { bad.push(g + ': stuck'); break; }
				}
				if (S2.over) over++;
				if (S2.log.some(e => /plays the Stadium/.test(e.msg))) stadiums++;
				if (E.digest(E.replay(config, actions)) !== E.digest(S2)) bad.push(g + ': replay differs');
				for (const p of S2.players) { const total = p.deck.length + p.hand.length + p.discard.length + [...p.active, ...p.bench].filter(Boolean).reduce((a, k) => a + k.cards.length + (k.tool ? 1 : 0), 0) + (S2.stadium && S2.stadium.seat === p.seat ? 1 : 0); if (total !== 20) bad.push(`${g}: ${p.name} has ${total} cards`); }
			} catch (e) { bad.push(g + ': ' + e.message); }
		}
		A(over === 20 && bad.length === 0 && stadiums > 0, 'computer players finish 20 matches with Fantastical Parade decks (2, 3 and 4 players; Stadiums played): every replay matches and every card is accounted for', { over, stadiums, bad: bad.slice(0, 4) });
	}
}

/// ===== 24. Paldean Wonders (B2a): each new effect, played =====
{
	const of = set => name => { const c = CARDS.find(x => x.set === set && x.name === name); if (!c) throw new Error(`no ${set} card ${name}`); return c.id; };
	const pw = of('B2a'), a2 = of('A2'), a4 = of('A4'), b1 = of('B1');
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const G = (S, seat, zone, idx, name, o) => putId(S, seat, zone, idx, pw(name), o);
	const dmgs = S => S.log.filter(e => e.k === 'damage').map(e => e.msg);
	const SN = () => card(id('Snorlax')).attacks.length - 1, SHP = card(id('Snorlax')).hp;
	const seeds = (n, f) => { const out = {}; for (let g = 0; g < n; g++) { const r = f('q' + g); out[r] = (out[r] || 0) + 1; } return out; };
	const FOUR = () => ['Fire', 'Fire', 'Fire', 'Fire'];
	const foe = S => { const k = put(S, 1, 'active', 0, 'Snorlax'); put(S, 1, 'bench', 0, 'Snorlax'); return k; };
	const coin = (S, re) => S.log.filter(e => e.k === 'coin' && re.test(e.msg));
	const T0 = { target: L(1, 'active', 0) };
	let S, x, y, z;

	// --- the data: records that spell types out, and names that lost their "ex" ---
	A(card(pw('Pawmot')).attacks[0].fx[0].k === 'discardSelfEnergy' && card(pw('Pawmot')).attacks[0].fx[0].type === 'Lightning' && /Lightning Energy/.test(card(pw('Pawmot')).attacks[0].text) && !card(pw('Pawmot')).attacks[0].note, 'a record that spells a type out ("a Lightning Energy") is read like any other, and its printed text is kept');

	// --- attacks ---
	S = arena(2); G(S, 0, 'active', 0, 'Meowscarada ex', { energy: ['Grass'] }); x = foe(S); y = S.players[1].bench[0]; S.players[1].hand = [a4('Lyra')];
	A(E.attackTargets(S, 0, card(pw('Meowscarada ex')).attacks[0]).length === 2, 'Flower Trick may be aimed at any spot an opponent\'s Pokémon stands in');
	exec(S, { attack: 0, ...T0 });
	A(x.dmg === 0 && E.view(S, 0).spots.length === 1 && E.view(S, 0).spots[0].zone === 'active', 'it does nothing at once: the spot is marked (every player can see it)');
	x.dmg = 10; E.apply(S, { t: 'trainer', seat: 1, hand: 0, args: { at: L(1, 'active', 0), bench: 0 } }); exec(S);
	A(y.dmg === 70 && x.dmg === 10 && E.view(S, 0).spots.length === 0, 'at the end of that player\'s next turn the Pokémon standing in that spot takes 70, whichever it is');
	S = arena(2); G(S, 0, 'active', 0, 'Scovillain', { energy: ['Grass', 'Fire'] }); G(S, 0, 'active', 1, 'Scovillain', { energy: ['Grass', 'Fire'] }); foe(S); put(S, 1, 'active', 1, 'Bulbasaur', { tool: a2('Giant Cape') });
	exec(S, { attack: 0, target: L(1, 'active', 1) }, { attack: 0, ...T0 });
	A(/base 100\b/.test(dmgs(S)[0]) && /base 60\b/.test(dmgs(S)[1]), 'Red-Hot Headbutt does 60 + 40 into a Grass or Metal Pokémon');
	S = arena(2); G(S, 0, 'active', 0, 'Wo-Chien', { energy: ['Grass', 'Grass', 'Grass', 'Fire'] }); x = foe(S); x.tool = a2('Giant Cape');
	exec(S, { attack: 0, ...T0 });
	A(E.view(S, 1).players[1].active[0].less === -2 && E.view(S, 1).players[1].active[0].retreat === card(id('Snorlax')).retreat, 'Binding Greed: its target\'s attacks cost 2 more on its owner\'s next turn');
	S = arena(2); x = G(S, 0, 'active', 0, 'Veluza', { energy: ['Water'] }); foe(S);
	A(/does not have the Energy/.test(E.attackBlock(S, 0, x, card(pw('Veluza')).attacks[0]) || ''), 'Shedding Spiral costs its full price while its player has cards in their deck');
	S.players[0].deck = [];
	A(!E.attackBlock(S, 0, x, card(pw('Veluza')).attacks[0]), 'with an empty deck, 1 Water Energy is enough');
	S = arena(2); G(S, 0, 'active', 0, 'Houndstone', { energy: ['Psychic', 'Fire'] }); foe(S); S.players[0].discard = [a4('Wobbuffet'), id('Potion'), a4('Wobbuffet'), id('Charmander')];
	exec(S, { attack: 0, ...T0 });
	A(/base 90\b/.test(dmgs(S)[0]), 'Last Respects does 50 + 20 for each Psychic Pokémon in its player\'s discard pile (2)');
	S = arena(2); G(S, 0, 'active', 0, 'Ting-Lu', { energy: ['Fighting', 'Fighting', 'Fighting'], dmg: 60 }); G(S, 0, 'active', 1, 'Ting-Lu', { energy: ['Fighting', 'Fighting', 'Fighting'] }); x = foe(S); x.tool = a2('Giant Cape'); put(S, 1, 'active', 1, 'Snorlax', { tool: a2('Giant Cape') });
	exec(S, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) });
	A(x.dmg === 0 && logHas(S, /Arrogant Impact does nothing/) && S.players[1].active[1].dmg > 0, 'Arrogant Impact does nothing once its user has 60 HP or less left');
	S = arena(2); G(S, 0, 'active', 0, 'Grafaiai', { energy: ['Fire'] }); put(S, 0, 'bench', 0, 'Snorlax', { energy: ['Water', 'Grass'] }); foe(S);
	exec(S, { attack: 0, ...T0 });
	A(/base 90\b/.test(dmgs(S)[0]), 'Colorful Attack does 30 + 60 with 3 or more different types of Energy among its player\'s Pokémon');
	S = arena(2); G(S, 0, 'active', 0, 'Gholdengo ex', { energy: ['Metal', 'Metal', 'Metal', 'Fire'] }); x = foe(S); x.tool = a2('Giant Cape');
	exec(S, { attack: 0, ...T0 });
	A(dmgs(S).length === 3 && dmgs(S).every(m => /base 40\b/.test(m)), 'Spending Rush hits a random Pokémon of that player once for each Metal Energy on its user (3)');
	{ const r = seeds(12, sd => { const T = arena(2, sd); G(T, 0, 'active', 0, 'Maushold', { energy: ['Fire', 'Fire'] }); const d = foe(T); d.energy = ['Fire', 'Fire', 'Fire', 'Fire']; d.tool = a2('Giant Cape'); exec(T, { attack: 0, ...T0 }); const h = coin(T, /Triple Gnawing/).filter(e => e.heads).length; return coin(T, /Triple Gnawing/).length === 3 && d.dmg > 0 && d.energy.length === 4 - h ? 'h' + h : 'bad'; });
		A(!r.bad && Object.keys(r).length > 1, 'Triple Gnawing always does its damage, and discards a random Energy for each heads of three coins', r); }

	// --- Abilities ---
	S = arena(2); G(S, 0, 'bench', 0, 'Arboliva'); x = put(S, 0, 'active', 0, 'Charizard ex', { dmg: 100, energy: ['Fire', 'Fire'] }); y = put(S, 0, 'active', 1, 'Snorlax', { dmg: 100, energy: ['Fire'] }); foe(S);
	A(/Pokémon ex that has Energy/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { at: L(0, 'active', 1) } }))), 'Extra Heal is for a Pokémon ex that has Energy');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { at: L(0, 'active', 0) } });
	A(x.dmg === 40 && x.energy.length === 1, 'it heals 60 from it and discards a random Energy from it');
	S = arena(2); x = G(S, 0, 'bench', 0, 'Skeledirge', { energy: ['Fire', 'Water'] }); put(S, 0, 'active', 0, 'Charmander', { energy: FOUR() }); put(S, 0, 'active', 1, 'Rattata', { energy: ['Fire'] }); y = foe(S); y.tool = a2('Giant Cape');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: {} }); exec(S, { attack: 0, ...T0 }, { attack: 0, ...T0 });
	A(x.energy.join() === 'Water' && /\+50 Passionate Voice/.test(dmgs(S)[0]) && !/Passionate Voice/.test(dmgs(S)[1]), 'Passionate Voice: Skeledirge discards a Fire Energy, and its player\'s Fire Pokémon (only) do +50 this turn');
	A(/no Fire Energy to discard/.test(refused(() => { const T = arena(2); G(T, 0, 'bench', 0, 'Skeledirge', { energy: ['Water'] }); put(T, 0, 'active', 0, 'Snorlax'); foe(T); E.apply(T, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: {} }); })), 'it needs a Fire Energy to discard');
	S = arena(2); G(S, 0, 'active', 0, 'Quaquaval', { energy: ['Water', 'Water', 'Fire'], dmg: card(pw('Quaquaval')).hp - 50 }); G(S, 0, 'active', 1, 'Quaquaval', { energy: ['Water', 'Water', 'Fire'] }); x = foe(S); x.tool = a2('Giant Cape'); put(S, 1, 'active', 1, 'Snorlax', { tool: a2('Giant Cape') });
	exec(S, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) });
	A(/\+60 Torrent/.test(dmgs(S)[0]) && !/Torrent/.test(dmgs(S)[1]), 'Torrent: with 50 HP or less left, Quaquaval\'s attacks do +60');
	S = arena(2); G(S, 0, 'bench', 0, 'Baxcalibur'); x = put(S, 0, 'active', 0, 'Squirtle'); foe(S);
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { at: L(0, 'active', 0) } });
	A(x.energy.join() === 'Water', 'Ice Maker attaches a Water Energy from the Energy Zone to a Water Pokémon in an Active slot (the record spells the type out)');

	// --- Trainers, a Pokémon Tool, and a Stadium with something to use ---
	{ const r = seeds(12, sd => { const T = arena(2, sd); put(T, 0, 'active', 0, 'Snorlax'); const b = put(T, 0, 'bench', 1, 'Pikachu'); put(T, 0, 'bench', 0, 'Snorlax'); foe(T); T.players[0].hand = [pw('Electric Generator')]; E.apply(T, { t: 'trainer', seat: 0, hand: 0, args: { bench: 0 } }); const heads = coin(T, /Electric Generator/)[0].heads; return b.energy.length === (heads ? 1 : 0) && T.players[0].bench[0].energy.length === 0 ? (heads ? 'h' : 't') : 'bad'; });
		A(!r.bad && r.h > 0 && r.t > 0, 'Electric Generator: on heads a Lightning Energy goes to a Benched Lightning Pokémon (a choice of another type is not taken)', r); }
	S = arena(2); put(S, 0, 'active', 0, 'Charizard ex', { tool: pw('Big Air Balloon') }); put(S, 0, 'active', 1, 'Snorlax', { tool: pw('Big Air Balloon') }); foe(S);
	A(E.view(S, 0).players[0].active[0].retreat === 0 && E.view(S, 0).players[0].active[1].retreat === card(id('Snorlax')).retreat, 'Big Air Balloon: a Stage 2 Pokémon holding it has no Retreat Cost; another Pokémon gets nothing');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); x = putId(S, 1, 'active', 0, b1('Eiscue'), { energy: ['Water'] }); y = put(S, 1, 'bench', 0, 'Snorlax', { energy: ['Fire', 'Fire'] }); S.players[0].hand = [pw('Team Star Grunt')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 1 } });
	A(x.energy.length === 0 && y.energy.length === 2, 'Team Star Grunt discards a random Energy from among an opponent\'s Pokémon that have an Ability (not from one without)');
	S = arena(2); G(S, 0, 'active', 0, 'Pawmot', { energy: ['Lightning', 'Lightning'] }); put(S, 1, 'active', 0, 'Charizard ex'); put(S, 1, 'bench', 0, 'Snorlax'); S.players[0].hand = [pw('Nemona')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }); exec(S, { attack: 0, ...T0 });
	A(/\+80 Nemona/.test(dmgs(S)[0]), 'Nemona gives Pawmot +80 into an opposing Active Pokémon ex');
	{ const r = seeds(12, sd => { const T = arena(2, sd); put(T, 0, 'active', 0, 'Snorlax'); foe(T); T.players[0].hand = [pw('Arven')]; T.players[0].deck = [id('Potion'), a2('Giant Cape'), id('Giovanni'), id('Charmander')]; E.apply(T, { t: 'trainer', seat: 0, hand: 0, args: {} }); const heads = coin(T, /Arven/)[0].heads; return T.players[0].hand.join() === (heads ? id('Potion') : a2('Giant Cape')) ? (heads ? 'item' : 'tool') : 'bad'; });
		A(!r.bad && r.item > 0 && r.tool > 0, 'Arven: heads finds an Item card, tails a Pokémon Tool card', r); }
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [pw('Mesagoza')]; S.players[0].deck = [id('Potion'), id('Charmander'), id('Giovanni'), id('Potion'), id('Squirtle')];
	A(/nothing to use/.test(refused(() => E.apply(S, { t: 'stadium', seat: 0 }))), 'a Stadium can be used only when the one in play has something to use');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }); E.apply(S, { t: 'stadium', seat: 0 });
	A(coin(S, /Mesagoza/).length === 1 && S.players[0].hand.length === (coin(S, /Mesagoza/)[0].heads ? 1 : 0) && S.players[0].hand.every(i => card(i).kind === 'pokemon') && /already used the Stadium/.test(refused(() => E.apply(S, { t: 'stadium', seat: 0 }))) && E.view(S, 0).players[0].flags.stadiumUsed, 'Mesagoza: once in a turn its player may flip; heads puts a random Pokémon from their deck into their hand');
	exec(S); E.apply(S, { t: 'stadium', seat: 1 });
	A(coin(S, /Mesagoza/).length === 2, 'and each other player may use it on their own turn');

	// --- the computer player ---
	S = arena(2); S.players[0].zone.cur = null; S.players[0].flags.attached = true; S.players[0].hand = []; S.stadium = { id: pw('Mesagoza'), seat: 1 }; put(S, 0, 'active', 0, 'Snorlax'); put(S, 0, 'active', 1, 'Snorlax'); foe(S);
	{ const a = nextAction(E.view(S, 0), new Set()); A(a && a.t === 'stadium', 'the computer player uses the Stadium\'s action', a); }
	{
		const N = n => pw(n), two = l => l.flatMap(v => [v, v]);
		const decks = [{ deck: two([N('Sprigatito'), N('Floragato'), N('Meowscarada ex'), N('Smoliv'), N('Dolliv'), N('Arboliva'), N('Capsakid'), N('Scovillain'), N('Mesagoza'), N('Arven')]), energy: ['Grass'] },
			{ deck: two([N('Fuecoco'), N('Crocalor'), N('Skeledirge'), N('Charcadet'), N('Armarouge ex'), N('Quaxly'), N('Quaxwell'), N('Quaquaval'), N('Big Air Balloon'), N('Team Star Grunt')]), energy: ['Fire', 'Water'] },
			{ deck: two([N('Pawmi'), N('Pawmo'), N('Pawmot'), N('Tadbulb'), N('Bellibolt ex'), N('Miraidon'), N('Electric Generator'), N('Nemona'), N('Tandemaus'), N('Maushold')]), energy: ['Lightning'] },
			{ deck: two([N('Frigibax'), N('Arctibax'), N('Baxcalibur'), N('Chien-Pao ex'), N('Veluza'), N('Cetoddle'), N('Cetitan'), N('Greavard'), N('Houndstone'), N('Wo-Chien')]), energy: ['Water', 'Psychic'] },
			{ deck: two([N('Gimmighoul'), N('Gholdengo ex'), N('Shroodle'), N('Grafaiai'), N('Ting-Lu'), N('Koraidon'), N('Mesagoza'), N('Arven'), N('Big Air Balloon'), N('Electric Generator')]), energy: ['Metal', 'Fighting'] }];
		A(decks.every(d => E.deckError(d.deck, d.energy) === null), 'five Paldean Wonders decks are legal', decks.map(d => E.deckError(d.deck, d.energy)));
		const bad = []; let over = 0, used = 0;
		for (let g = 0; g < 20; g++) {
			const config = { seed: 'paldea' + g, rules: E.RULES, players: [0, 1, 2, 3].slice(0, 2 + (g % 3)).map(i => ({ name: 'P' + i, ai: true, ...decks[(i + g) % 5] })) }, S2 = E.createGame(config), actions = [];
			try {
				for (let step = 0; step < 4000 && !S2.over; step++) {
					const seat = S2.pending ? S2.pending.seat : S2.phase === 'setup' ? S2.players.find(p => !p.setup).seat : S2.current, banned = new Set();
					let done = false;
					for (let t = 0; t < 40 && !done; t++) { const a = nextAction(E.view(S2, seat), banned) || { t: 'execute', seat, commands: [null, null] }; try { E.apply(S2, a); actions.push(a); done = true; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); } }
					if (!done) { bad.push(g + ': stuck'); break; }
				}
				if (S2.over) over++;
				if (actions.some(a => a.t === 'stadium')) used++;
				if (E.digest(E.replay(config, actions)) !== E.digest(S2)) bad.push(g + ': replay differs');
				for (const p of S2.players) { const total = p.deck.length + p.hand.length + p.discard.length + [...p.active, ...p.bench].filter(Boolean).reduce((a, k) => a + k.cards.length + (k.tool ? 1 : 0), 0) + (S2.stadium && S2.stadium.seat === p.seat ? 1 : 0); if (total !== 20) bad.push(`${g}: ${p.name} has ${total} cards`); }
			} catch (e) { bad.push(g + ': ' + e.message); }
		}
		A(over === 20 && bad.length === 0 && used > 0, 'computer players finish 20 matches with Paldean Wonders decks (2, 3 and 4 players; Mesagoza used): every replay matches and every card is accounted for', { over, used, bad: bad.slice(0, 4) });
	}
}

//// ===== 25. Mega Shine (B2b): each new effect, played =====
{
	const ms = name => { const c = CARDS.find(x => x.set === 'B2b' && x.name === name) || CARDS.find(x => x.name === name); if (!c) throw new Error('no card ' + name); return c.id; };
	const cape = CARDS.find(x => x.name === 'Giant Cape').id;
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const G = (S, seat, zone, idx, name, o) => putId(S, seat, zone, idx, ms(name), o);
	const dmgs = S => S.log.filter(e => e.k === 'damage').map(e => e.msg);
	const foe = S => { const k = put(S, 1, 'active', 0, 'Snorlax', { tool: cape }); put(S, 1, 'bench', 0, 'Snorlax'); return k; };
	const coin = (S, re) => S.log.filter(e => e.k === 'coin' && re.test(e.msg));
	const T0 = { target: L(1, 'active', 0) }, T1 = { target: L(1, 'active', 1) };
	let S, x, y, z;

	// --- the data ---
	{ const recs = JSON.parse(fs.readFileSync(path.join(ROOT, 'pocketenhanced/data/source/alt_b2b.json'), 'utf8')).cards, mine = CARDS.filter(c => c.set === 'B2b');
		A(recs.length === 117 && mine.length === 69 && mine.filter(c => c.points === 3).map(c => c.name).sort().join() === 'Mega Charizard X ex,Mega Gengar ex,Mega Manectric ex,Mega Scizor ex,Mega Slowbro ex' && card(ms('Mega Charizard X ex')).combatTypes.join() === 'Fire,Dragon' && card(ms('Hiking Trail')).kind === 'stadium' && recs.every(c => !c.description && !c.illustrator && !c.image),
			'Mega Shine: 117 printings from the second source add 69 gameplay cards; its five Mega Evolution Pokémon ex are worth 3 points', [recs.length, mine.length]); }

	// --- attacks ---
	S = arena(2); G(S, 0, 'active', 0, 'Illumise', { energy: ['Grass'] }); G(S, 0, 'active', 1, 'Illumise', { energy: ['Grass'] }); x = foe(S); x.status = { confused: { by: 0, turn: 0 } }; put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, ...T0 }, { attack: 0, ...T1 });
	A(/base 60\b/.test(dmgs(S)[0]) && /base 20\b/.test(dmgs(S)[1]), 'Mental Crush does 20 + 40 into a Confused Pokémon');
	S = arena(2); G(S, 0, 'active', 0, 'Mega Slowbro ex', { energy: ['Water', 'Water', 'Water'] }); x = foe(S); y = S.players[1].bench[0]; z = put(S, 1, 'bench', 1, 'Snorlax');
	exec(S, { attack: 0, ...T0 });
	{ const h = coin(S, /Laundry-Go-Round/).filter(e => e.heads).length; A(coin(S, /Laundry-Go-Round/).length === 3 && y.dmg === 20 * h && z.dmg === 20 * h && x.dmg === 90, 'Laundry-Go-Round flips 3 coins: 20 for each heads to each Benched Pokémon of its target\'s owner', [h, y.dmg]); }
	S = arena(2); G(S, 0, 'active', 0, 'Lapras', { energy: ['Water', 'Water', 'Water'] }); G(S, 0, 'active', 1, 'Lapras', { energy: ['Water', 'Water', 'Water'] }); x = foe(S);
	exec(S, { attack: 0, ...T0 });
	A(!x.status.paralyzed, 'Raging Freeze does not Paralyze when none of its player\'s Pokémon fell to an attack');
	S = arena(2); G(S, 0, 'active', 0, 'Lapras', { energy: ['Water', 'Water', 'Water'] }); x = foe(S); S.players[0].flags.revenge = true;
	exec(S, { attack: 0, ...T0 });
	A(!!x.status.paralyzed, 'it Paralyzes its target when one of them was Knocked Out by an attack since its player\'s last turn');
	S = arena(2); G(S, 0, 'active', 0, 'Mega Manectric ex', { energy: ['Lightning', 'Lightning'] }); foe(S); S.players[0].points = 2;
	exec(S, { attack: 0, ...T0 });
	A(/base 140\b/.test(dmgs(S)[0]), 'Lightning Accelerator does 80 + 30 for each point its player has gotten (2)');
	S = arena(2); G(S, 0, 'active', 0, 'Mew', { energy: ['Psychic', 'Psychic'] }); x = foe(S); S.players[1].hand = [ms('Pineco')]; S.players[1].deck = [id('Potion')];
	exec(S, { attack: 0, ...T0 });
	A(S.log.some(e => /Pineco's Hang Down is chosen/.test(e.msg)) && /base 10\b/.test(dmgs(S)[0]) && x.dmg === 10, 'Miraculous Memory uses an attack chosen at random from the Pokémon in its target\'s owner\'s hand and deck');
	S = arena(2); G(S, 0, 'active', 0, 'Mew', { energy: ['Psychic', 'Psychic'] }); x = foe(S); S.players[1].hand = [id('Potion')]; S.players[1].deck = [];
	exec(S, { attack: 0, ...T0 });
	A(x.dmg === 0 && S.log.some(e => /Miraculous Memory does nothing/.test(e.msg)), 'with no Pokémon there, it does nothing');
	S = arena(2); G(S, 0, 'active', 0, 'Grumpig', { energy: ['Psychic'] }); G(S, 0, 'active', 1, 'Grumpig', { energy: ['Psychic'] }); foe(S); put(S, 1, 'active', 1, 'Snorlax'); S.players[1].hand = [id('Potion'), id('Potion'), id('Potion'), id('Potion')];
	exec(S, { attack: 0, ...T0 }, { attack: 0, ...T1 });
	A(/base 80\b/.test(dmgs(S)[0]) && /base 80\b/.test(dmgs(S)[1]), 'Swaying Dance does 40 + 40 when its target\'s owner has exactly 2, 4 or 6 cards in their hand');
	S = arena(2); G(S, 0, 'active', 0, 'Grumpig', { energy: ['Psychic'] }); foe(S); S.players[1].hand = [id('Potion'), id('Potion'), id('Potion')];
	exec(S, { attack: 0, ...T0 });
	A(/base 40\b/.test(dmgs(S)[0]), 'and 40 with 3 cards');
	S = arena(2); x = G(S, 0, 'active', 0, 'Groudon', { energy: ['Fighting', 'Fighting', 'Fighting', 'Fighting'] }); y = put(S, 0, 'bench', 0, 'Snorlax', { energy: ['Fire', 'Fire'] }); foe(S);
	exec(S, { attack: 0, ...T0 });
	A(x.energy.length + y.energy.length === 4 && S.players[0].energyDiscard !== null, 'Gaia Blast discards 2 random Energy from among all its player\'s Pokémon', [x.energy.length, y.energy.length]);
	S = arena(2); G(S, 0, 'active', 0, 'Mega Gengar ex', { energy: ['Darkness', 'Darkness', 'Darkness', 'Darkness'] }); x = foe(S); x.tool = null; S.players[1].hand = [id('Potion'), cape];
	exec(S, { attack: 0, ...T0 });
	A(/Trainer cards/.test(refused(() => E.apply(S, { t: 'trainer', seat: 1, hand: 0, args: { at: L(1, 'active', 0) } })) || '') && /Trainer cards/.test(refused(() => E.apply(S, { t: 'trainer', seat: 1, hand: 1, args: { at: L(1, 'active', 0) } })) || ''), 'Labyrinth of Shadows: its target\'s owner can play no Trainer card (an Item, a Pokémon Tool) on their next turn');
	exec(S); exec(S);
	A(refused(() => E.apply(S, { t: 'trainer', seat: 1, hand: 0, args: { at: L(1, 'active', 0) } })) === null, 'and may again on the turn after');
	S = arena(2); x = G(S, 0, 'active', 0, 'Morpeko', { energy: ['Darkness', 'Darkness', 'Darkness'] }); put(S, 0, 'bench', 0, 'Snorlax'); y = put(S, 0, 'bench', 1, 'Snorlax'); foe(S);
	exec(S, { attack: 0, ...T0, args: { bench: 1 } });
	A(x.energy.length === 1 && y.energy.join() === 'Darkness,Darkness', 'Energizer Wheel moves 2 Darkness Energy to the Benched Pokémon its player chose');
	S = arena(2); x = G(S, 0, 'active', 0, 'Forretress', { energy: ['Metal', 'Metal', 'Metal'], tool: cape }); y = put(S, 0, 'bench', 0, 'Snorlax'); z = foe(S);
	exec(S, { attack: 0, ...T0 });
	A(x.dmg === 100 && y.dmg === 50 && S.players[1].bench[0].dmg === 50 && z.dmg >= 100, 'Enormous Explosion: 100 to itself, and 50 to every Benched Pokémon of both players', [x.dmg, y.dmg, S.players[1].bench[0].dmg, z.dmg]);
	S = arena(2); x = G(S, 0, 'active', 0, 'Dragonair', { energy: ['Fire'] }); foe(S);
	exec(S, { attack: 0, ...T0 });
	A(x.energy.slice().sort().join() === 'Fire,Lightning,Water', 'Sky\'s Blessing attaches a Water and a Lightning Energy from the Energy Zone to Dragonair');
	S = arena(2); x = G(S, 0, 'active', 0, 'Dragonite', { energy: ['Water', 'Lightning', 'Fire'] }); y = foe(S); y.tool = null; y.dmg = 0; put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, ...T1 });
	A(x.energy.join() === 'Fire' && /base 150\b/.test(dmgs(S)[0]), 'Dragon Wave does 150 and discards a Water and a Lightning Energy from Dragonite');
	S = arena(2); G(S, 0, 'active', 0, 'Haxorus', { energy: ['Fighting', 'Metal', 'Fire'] }); put(S, 0, 'bench', 0, 'Snorlax'); put(S, 0, 'bench', 1, 'Snorlax'); foe(S);
	exec(S, { attack: 0, ...T0 });
	A(/base 110\b/.test(dmgs(S)[0]), 'Frenzied Blade does 50 + 20 for each Benched Pokémon of both players (3)');

	// --- the Ability ---
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); G(S, 0, 'bench', 0, 'Darkrai'); x = foe(S); x.status = { asleep: { by: 0, turn: 0 } }; y = put(S, 1, 'active', 1, 'Snorlax');
	exec(S);
	A(x.dmg === 20 && y.dmg === 0 && S.log.some(e => /Bad Dreams does 20 damage/.test(e.msg)), 'Bad Dreams: at the end of a turn, an opposing Active Pokémon that is Asleep takes 20 (one that is awake takes none)');
	{ const still = !!x.status.asleep; exec(S); A(x.dmg === 20 + (still ? 20 : 0), 'and again at the end of the next turn if it is still Asleep', [still, x.dmg]); }

	// --- Trainers ---
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [ms('Nasty Notice')]; S.players[1].hand = [id('Potion'), id('Charmander'), id('Giovanni'), id('Squirtle'), id('Bulbasaur'), id('Sabrina')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 1 } });
	A(S.pending && S.pending.seat === 1 && S.pending.kind === 'handPick', 'Nasty Notice: the chosen opponent picks the cards they discard');
	E.apply(S, { t: 'choose', seat: 1, pick: 0 }); E.apply(S, { t: 'choose', seat: 1, pick: 0 });
	A(!S.pending && S.players[1].hand.length === 4 && S.players[1].hand[0] === id('Giovanni') && S.players[1].discard.includes(id('Potion')) && S.players[1].discard.includes(id('Charmander')), 'until they have 4 cards in their hand');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [ms('Nasty Notice')]; S.players[1].hand = [id('Potion')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 1 } });
	A(!S.pending && S.players[1].hand.length === 1, 'a player with 4 or fewer cards discards nothing');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [ms('Maintenance'), id('Potion')];
	A(/2 other cards/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} })) || ''), 'Maintenance cannot be played without 2 other cards in hand');
	S.players[0].hand = [ms('Maintenance'), id('Potion'), id('Charmander'), id('Giovanni')]; S.players[0].deck = [id('Squirtle')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }); E.apply(S, { t: 'choose', seat: 0, pick: 0 }); E.apply(S, { t: 'choose', seat: 0, pick: 0 });
	A(!S.pending && S.players[0].hand.length === 2 && S.players[0].hand[0] === id('Giovanni') && S.players[0].deck.length === 2, 'it shuffles 2 chosen cards from the hand into the deck, then draws a card', S.players[0].hand);
	for (const iris of [true, false]) {
		S = arena(2); G(S, 0, 'active', 0, 'Haxorus', { energy: ['Fighting', 'Metal', 'Fire'] }); put(S, 1, 'active', 0, 'Bulbasaur', { dmg: 40 }); put(S, 1, 'active', 1, 'Snorlax'); S.players[0].hand = [ms('Iris')];
		if (iris) E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
		exec(S, { attack: 0, ...T0 });
		A(S.players[0].points === (iris ? 2 : 1), iris ? 'Iris: Haxorus Knocking Out an opposing Active Pokémon with an attack gets 1 more point' : 'without Iris it gets the usual 1', S.players[0].points);
	}
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax', { energy: ['Fire', 'Fire', 'Fire', 'Fire'] }); put(S, 1, 'active', 0, 'Bulbasaur', { dmg: 60 }); put(S, 1, 'active', 1, 'Snorlax'); S.players[0].hand = [ms('Iris')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }); exec(S, { attack: card(id('Snorlax')).attacks.length - 1, ...T0 });
	A(S.players[0].points === 1, 'a Knock Out by another Pokémon gets no more');
	S = arena(2); G(S, 0, 'active', 0, 'Mega Gengar ex'); put(S, 0, 'active', 1, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax'); G(S, 1, 'bench', 0, 'Mega Scizor ex'); S.players[0].hand = [ms('Calem')]; S.players[0].deck = [id('Potion'), id('Potion'), id('Potion')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.players[0].hand.length === 2, 'Calem draws a card for each Mega Evolution Pokémon ex in play, every player\'s (2)');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [ms('Hiking Trail')]; S.players[0].deck = [id('Potion'), id('Potion'), id('Potion'), id('Potion'), id('Potion')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }); exec(S);
	A(S.stadium && S.players[0].hand.length === 3, 'Hiking Trail: at the end of their turn a player draws until they have 3 cards in their hand');
	S.players[1].hand = [id('Potion'), id('Potion'), id('Potion'), id('Potion')]; S.players[1].deck = [id('Potion'), id('Potion')]; exec(S);
	A(S.players[1].hand.length === 4, 'a player with 3 or more draws nothing');

	// --- the computer player ---
	{
		const N = n => ms(n), two = l => l.flatMap(v => [v, v]);
		const decks = [{ deck: two([N('Charmander'), N('Charmeleon'), N('Mega Charizard X ex'), N('Ponyta'), N('Rapidash'), N('Magmar'), N('Magmortar'), N('Paldean Tauros'), N('Calem'), N('Hiking Trail')]), energy: ['Fire'] },
			{ deck: two([N('Slowpoke'), N('Mega Slowbro ex'), N('Piplup'), N('Prinplup'), N('Empoleon'), N('Phione'), N('Lapras'), N('Nasty Notice'), N('Maintenance'), N('Chatot')]), energy: ['Water'] },
			{ deck: two([N('Electrike'), N('Mega Manectric ex'), N('Electabuzz'), N('Electivire'), N('Pikachu'), N('Raichu'), N('Mew'), N('Grumpig'), N('Spoink'), N('Calem')]), energy: ['Lightning', 'Psychic'] },
			{ deck: two([N('Gastly'), N('Haunter'), N('Mega Gengar ex'), N('Darkrai'), N('Drowzee'), N('Hypno'), N('Zorua'), N('Zoroark'), N('Morpeko'), N('Nasty Notice')]), energy: ['Darkness', 'Psychic'] },
			{ deck: two([N('Axew'), N('Fraxure'), N('Haxorus'), N('Iris'), N('Scyther'), N('Mega Scizor ex'), N('Pineco'), N('Forretress'), N('Groudon'), N('Hiking Trail')]), energy: ['Fighting', 'Metal'] },
			{ deck: two([N('Dratini'), N('Dragonair'), N('Dragonite'), N('Diglett'), N('Dugtrio'), N('Illumise'), N('Volbeat'), N('Miltank'), N('Maintenance'), N('Iris')]), energy: ['Water', 'Lightning'] }];
		A(decks.every(d => E.deckError(d.deck, d.energy) === null), 'six Mega Shine decks are legal', decks.map(d => E.deckError(d.deck, d.energy)));
		const bad = []; let over = 0; const played = new Set();
		for (let g = 0; g < 24; g++) {
			const config = { seed: 'megashine' + g, rules: E.RULES, players: [0, 1, 2, 3].slice(0, 2 + (g % 3)).map(i => ({ name: 'P' + i, ai: true, ...decks[(i + g) % 6] })) }, S2 = E.createGame(config), actions = [];
			try {
				for (let step = 0; step < 4000 && !S2.over; step++) {
					const seat = S2.pending ? S2.pending.seat : S2.phase === 'setup' ? S2.players.find(p => !p.setup).seat : S2.current, banned = new Set();
					let done = false;
					for (let t = 0; t < 40 && !done; t++) { const a = nextAction(E.view(S2, seat), banned) || { t: 'execute', seat, commands: [null, null] }; try { if (a.t === 'trainer') played.add(card(S2.players[seat].hand[a.hand]).name); E.apply(S2, a); actions.push(a); done = true; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); } }
					if (!done) { bad.push(g + ': stuck'); break; }
				}
				if (S2.over) over++;
				if (E.digest(E.replay(config, actions)) !== E.digest(S2)) bad.push(g + ': replay differs');
				for (const p of S2.players) { const total = p.deck.length + p.hand.length + p.discard.length + [...p.active, ...p.bench].filter(Boolean).reduce((a, k) => a + k.cards.length + (k.tool ? 1 : 0), 0) + (S2.stadium && S2.stadium.seat === p.seat ? 1 : 0); if (total !== 20) bad.push(`${g}: ${p.name} has ${total} cards`); }
			} catch (e) { bad.push(g + ': ' + e.message); }
		}
		A(over === 24 && bad.length === 0 && played.has('Hiking Trail') && played.has('Nasty Notice') && played.has('Calem'), 'computer players finish 24 matches with Mega Shine decks (2, 3 and 4 players): every replay matches and every card is accounted for', { over, played: [...played].join(), bad: bad.slice(0, 4) });
	}
}

/// ===== 26. Rules revision 5: four cards whose source record was wrong, corrected =====
{
	const dmgs = S => S.log.filter(e => e.k === 'damage').map(e => e.msg);
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const T0 = { target: L(1, 'active', 0) };
	const a = cid => card(cid).attacks[0];
	A(E.RULES >= 5 && a('A1-055').cost.join() === 'Water,Water,Colorless' && a('A1-055').costWas.join() === 'Water,Colorless' && a('A1-071').cost.join() === 'Water,Water,Water' && a('A1-071').costWas.join() === 'Water,Water,Colorless' && a('A1-112').damage === 30 && a('A1-112').damageWas === 40 && a('A2b-025').fx[0].to === 'benchType' && a('A2b-025').fx[0].toWas === 'bench' && /Benched \{L\} Pokémon/.test(a('A2b-025').text) && card('A2b-103') === card('A2b-025') && card('A4b-143') !== card('A2b-025'),
		'new matches are played under rules revision 5: Blastoise\'s Hydro Pump costs Water, Water, Colorless; Seadra\'s Water Arrow costs three Water; Pincurchin\'s Thunder Shock does 30; Pachirisu\'s Plasma attaches to a Benched Lightning Pokémon (each card keeps what it had)');
	for (const rules of [5, 4]) {
		let S = arena(2); S.rules = rules; let x = putId(S, 0, 'active', 0, 'A1-055', { energy: ['Water', 'Fire'] }); put(S, 1, 'active', 0, 'Snorlax');
		A(!!E.attackBlock(S, 0, x, a('A1-055')) === (rules >= 5), rules >= 5 ? 'Blastoise cannot use Hydro Pump with a Water and one other Energy' : 'in a match recorded under revision 4 it still can', E.attackBlock(S, 0, x, a('A1-055')));
		S = arena(2); S.rules = rules; x = putId(S, 0, 'active', 0, 'A1-071', { energy: ['Water', 'Water', 'Fire'] }); put(S, 1, 'active', 0, 'Snorlax');
		A(!!E.attackBlock(S, 0, x, a('A1-071')) === (rules >= 5), rules >= 5 ? 'Seadra cannot use Water Arrow with two Water and one other Energy' : 'in a match recorded under revision 4 it still can');
		S = arena(2); S.rules = rules; putId(S, 0, 'active', 0, 'A1-112', { energy: ['Lightning', 'Lightning'] }); put(S, 1, 'active', 0, 'Snorlax');
		exec(S, { attack: 0, ...T0 });
		A(new RegExp('base ' + (rules >= 5 ? 30 : 40) + '\\b').test(dmgs(S)[0]), rules >= 5 ? 'Thunder Shock does 30' : 'in a match recorded under revision 4 it still does 40', dmgs(S)[0]);
		S = arena(2); S.rules = rules; putId(S, 0, 'active', 0, 'A2b-025', { energy: ['Lightning'] }); x = put(S, 0, 'bench', 0, 'Snorlax'); const y = put(S, 0, 'bench', 1, 'Pikachu'); put(S, 1, 'active', 0, 'Snorlax');
		exec(S, { attack: 0, ...T0, args: { bench: 0 } });
		A(rules >= 5 ? x.energy.length === 0 && y.energy.join() === 'Lightning' : x.energy.join() === 'Lightning' && y.energy.length === 0, rules >= 5 ? 'Plasma attaches only to a Benched Lightning Pokémon (a Benched Snorlax that was chosen gets nothing)' : 'in a match recorded under revision 4 it still goes to the Benched Pokémon chosen', [x.energy, y.energy]);
	}
}

///// ===== 27. Pulsing Aura (B3): each new effect, played =====
{
	const pa = name => { const c = CARDS.find(x => x.set === 'B3' && x.name === name) || CARDS.find(x => x.name === name); if (!c) throw new Error('no card ' + name); return c.id; };
	const cape = CARDS.find(x => x.name === 'Giant Cape').id;
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const G = (S, seat, zone, idx, name, o) => putId(S, seat, zone, idx, pa(name), o);
	const dmgs = S => S.log.filter(e => e.k === 'damage').map(e => e.msg);
	const foe = S => { const k = put(S, 1, 'active', 0, 'Snorlax', { tool: cape }); put(S, 1, 'bench', 0, 'Snorlax'); return k; };
	const coin = (S, re) => S.log.filter(e => e.k === 'coin' && re.test(e.msg));
	const T0 = { target: L(1, 'active', 0) }, T1 = { target: L(1, 'active', 1) };
	const base = (S, n, i = 0) => new RegExp('base ' + n + '\\b').test(dmgs(S)[i] || '');
	const F = n => Array(n).fill('Fire'), W = n => Array(n).fill('Water'), FT = n => Array(n).fill('Fighting'), DK = n => Array(n).fill('Darkness');
	let S, x, y, z;

	// --- the data ---
	{ const recs = JSON.parse(fs.readFileSync(path.join(ROOT, 'pocketenhanced/data/source/alt_b3.json'), 'utf8')).cards, mine = CARDS.filter(c => c.set === 'B3');
		A(recs.length === 234 && mine.length === 155 && mine.filter(c => c.points === 3).map(c => c.name).sort().join() === 'Mega Audino ex,Mega Camerupt ex,Mega Lucario ex,Mega Sceptile ex' && card('B3-226') === card('B1-036') && card('B3-232') === card('B1a-052') && /takes -20 damage/.test(card('B1a-052').attacks[0].text) && /^Discard a \{R\} Energy/.test(card('B1-036').attacks[0].text) && card(pa('Castform Sunny Form')).combatTypes.join() === 'Fire' && card(pa('Rapid Strike Urshifu')).ability.fx.types.join() === 'Water,Fighting' && recs.every(c => !c.description && !c.illustrator && !c.image),
			'Pulsing Aura: 234 printings add 155 gameplay cards; four new Mega Evolution Pokémon ex; its reprints of Mega Blaziken ex and Mega Steelix ex are those cards, whose garbled text is now as printed', [recs.length, mine.length]); }

	// --- attacks ---
	S = arena(2); G(S, 0, 'active', 0, 'Heracross', { energy: F(2) }); G(S, 0, 'active', 1, 'Heracross', { energy: F(2) }); foe(S); put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, ...T0 }); A(base(S, 30), 'Powerful Friends does 30 with no Stage 2 Pokémon on the Bench');
	S = arena(2); G(S, 0, 'active', 0, 'Heracross', { energy: F(2) }); put(S, 0, 'bench', 0, 'Venusaur'); foe(S);
	exec(S, { attack: 0, ...T0 }); A(base(S, 80), 'and 30 + 50 with one');
	S = arena(2); x = G(S, 0, 'active', 0, 'Mega Sceptile ex', { energy: ['Grass', 'Grass'] }); y = foe(S);
	exec(S, { attack: 0, ...T0 }); A(x.energy.length === 1 && !!y.status.poisoned && base(S, 130), 'Terminating Tail discards a Grass Energy and Poisons its target');
	S = arena(2); G(S, 0, 'active', 0, 'Breloom', { energy: ['Grass'] }); x = foe(S); x.status = { asleep: { by: 0, turn: 0 } };
	exec(S, { attack: 0, ...T0 }); A(base(S, 90), 'Pre-Dawn Strike does 30 + 60 into a Pokémon that is Asleep');
	S = arena(2); G(S, 0, 'active', 0, 'Budew'); G(S, 0, 'active', 1, 'Carnivine', { energy: ['Grass'] }); x = G(S, 1, 'active', 0, 'Furfrou', { energy: ['Fire'] }); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, ...T0 }, { attack: 0, ...T0 });
	A(x.dmg === 30 && /-20 Fur Coat/.test(dmgs(S)[0]) && !/Fur Coat/.test(dmgs(S)[1]) && E.view(S, 0).players[1].active[0].fx.some(f => f.k === 'noAbility'), 'Prickly Powder: its target loses its Abilities (Fur Coat no longer takes 20 off the next attack)', dmgs(S));
	E.apply(S, { t: 'retreat', seat: 1, slot: 0, bench: 0 });
	A(!S.players[1].bench[0].fx.length, 'until it leaves its Active slot');
	S = arena(2); x = G(S, 0, 'active', 0, 'Camerupt', { energy: F(3) }); foe(S);
	exec(S, { attack: 0, ...T0 });
	{ const h = coin(S, /Eruption/).filter(e => e.heads).length; A(coin(S, /Eruption/).length === 3 && x.energy.length === 3 - h && base(S, 60 + 30 * h), 'Eruption flips 3 coins: a Fire Energy discarded and 30 more for each heads', [h, x.energy.length]); }
	S = arena(2); x = G(S, 0, 'active', 0, 'Tepig', { energy: F(1) }); foe(S);
	exec(S, { attack: 0, ...T0 });
	A(x.energy.length === (coin(S, /Stoke/)[0].heads ? 3 : 1), 'Stoke: on heads, 2 Fire Energy from the Energy Zone to Tepig');
	S = arena(2); G(S, 0, 'active', 0, 'Emboar', { energy: F(3) }); foe(S);
	exec(S, { attack: 0, ...T0 });
	A(coin(S, /Flare Storm/).length === 3 && base(S, 70 + 30 * coin(S, /Flare Storm/).filter(e => e.heads).length), 'Flare Storm flips a coin for each Fire Energy attached: 70 + 30 for each heads');
	for (const ev of [true, false]) {
		S = arena(2); x = G(S, 0, 'active', 0, 'Politoed', { energy: W(1) }); x.cards = [pa('Poliwhirl'), pa('Politoed')]; x.turnEvolved = ev ? S.turn : -1; foe(S);
		exec(S, { attack: 0, ...T0 }); A(base(S, ev ? 100 : 50), ev ? 'Raid does 50 + 50 on the turn Politoed evolved from Poliwhirl' : 'and 50 on a later turn');
	}
	S = arena(2); x = G(S, 0, 'active', 0, 'Regice', { energy: ['Water', 'Fire', 'Grass'] }); put(S, 0, 'bench', 0, 'Snorlax'); y = put(S, 0, 'bench', 1, 'Snorlax'); foe(S);
	exec(S, { attack: 0, ...T0, args: { bench: 1 } });
	A(x.energy.length === 1 && y.energy.length === 2, 'Reflect Energy moves 2 random Energy to the Benched Pokémon its player chose');
	S = arena(2); G(S, 0, 'active', 0, 'Toxtricity', { energy: ['Lightning', 'Lightning'] }); x = foe(S); S.players[0].flags.revenge = true;
	exec(S, { attack: 0, ...T0 }); A(base(S, 100) && !!x.status.paralyzed, 'Vengeful Shock: 40 + 60 and Paralysis after one of its player\'s Pokémon fell to an attack');
	S = arena(2); G(S, 0, 'active', 0, 'Diancie', { energy: ['Psychic', 'Psychic'] }); x = G(S, 0, 'bench', 0, 'Diancie', { dmg: 30 }); y = put(S, 0, 'bench', 1, 'Snorlax', { dmg: 30 }); foe(S);
	exec(S, { attack: 0, ...T0 }); A(x.dmg === 10 && y.dmg === 30, 'Diamond Storm heals 20 from each of its player\'s Psychic Pokémon only');
	S = arena(2); G(S, 0, 'active', 0, 'Meloetta', { energy: FT(2) }); put(S, 0, 'active', 1, 'Snorlax', { energy: F(4) }); foe(S); put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, ...T0 }); exec(S); exec(S, { attack: 0, ...T0 }, { attack: card(id('Snorlax')).attacks.length - 1, ...T1 });
	A(/\+30 Inspiring Dance/.test(dmgs(S)[1]) && !/Inspiring Dance/.test(dmgs(S)[2]), 'Inspiring Dance: on its player\'s next turn their Fighting Pokémon do +30 (other types do not)', dmgs(S).slice(1));
	S = arena(2); G(S, 0, 'active', 0, 'Coalossal', { energy: FT(3) }); foe(S); S.players[1].deck = [id('Potion'), id('Potion'), id('Potion'), id('Potion'), id('Potion'), id('Potion'), id('Potion'), id('Potion')]; S.players[1].discard = [];
	exec(S, { attack: 0, ...T0 });
	{ const h = coin(S, /Mountain Crush/).filter(e => e.heads).length; A(coin(S, /Mountain Crush/).length === h + 1 && S.players[1].discard.length === h, 'Mountain Crush flips until tails: one card off the top of the opponent\'s deck for each heads', h); }
	S = arena(2); G(S, 0, 'active', 0, 'Malamar', { energy: DK(2) }); x = put(S, 1, 'active', 0, 'Bulbasaur', { tool: cape }); put(S, 1, 'bench', 0, 'Snorlax'); S.players[1].hand = [id('Ivysaur')];
	exec(S, { attack: 0, ...T0 });
	A(/can't evolve/.test(refused(() => E.apply(S, { t: 'evolve', seat: 1, hand: 0, at: L(1, 'active', 0) })) || ''), 'Evolution Jammer: its target\'s owner cannot evolve from their hand on their next turn');
	exec(S); exec(S); A(refused(() => E.apply(S, { t: 'evolve', seat: 1, hand: 0, at: L(1, 'active', 0) })) === null, 'and can on the turn after');
	for (const t of ['Darkness', 'Fire']) {
		S = arena(2); G(S, 0, 'active', 0, 'Zarude', { energy: DK(2) }); foe(S); S.players[0].flags.revenge = true; S.players[0].flags.revengeTypes = [t];
		exec(S, { attack: 0, ...T0 }); A(base(S, t === 'Darkness' ? 120 : 40), t === 'Darkness' ? 'Dark Vengeance does 40 + 80 after a Darkness Pokémon of its player fell to an attack' : 'and 40 when the Pokémon that fell was of another type');
	}
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); G(S, 0, 'bench', 0, 'Zarude'); put(S, 1, 'active', 0, 'Snorlax', { energy: F(4) }); x = put(S, 0, 'active', 1, 'Bulbasaur', { dmg: 60 });
	exec(S); exec(S, { attack: card(id('Snorlax')).attacks.length - 1, target: L(0, 'active', 1) });
	A(S.players[0].flags.revenge && S.players[0].flags.revengeTypes.join() === 'Grass', 'a Knock Out by an attack records the type of the Pokémon that fell', S.players[0].flags);
	S = arena(2); G(S, 0, 'active', 0, 'Bronzong', { energy: ['Metal', 'Metal'] }); foe(S); G(S, 1, 'bench', 1, 'Diancie');
	exec(S, { attack: 0, ...T0 }); A(base(S, 100), 'Psychic Resonance does 50 + 50 when its target\'s owner has a Psychic Pokémon in play');
	S = arena(2); G(S, 0, 'active', 0, 'Flygon ex', { energy: ['Grass', 'Fighting', 'Fire'] }); foe(S); S.players[0].deck = [id('Potion'), id('Giovanni')]; S.players[0].discard = [];
	exec(S, { attack: 0, ...T0 }); A(S.players[0].discard.join() === id('Potion'), 'Dragon Pulse discards the top card of its player\'s deck');
	S = arena(2); G(S, 0, 'active', 0, 'Lillipup', { energy: F(2) }); G(S, 0, 'bench', 0, 'Lillipup'); foe(S); S.players[0].hand = [pa('Lillipup'), id('Potion')];
	exec(S, { attack: 0, ...T0 }); A(base(S, 60), 'Puppy Pile does 20 for each Pokémon with Puppy Pile in play and in hand (3)');
	for (const st of [true, false]) {
		S = arena(2); G(S, 0, 'active', 0, 'Castform Sunny Form', { energy: F(1) }); y = G(S, 0, 'active', 1, 'Castform Rainy Form', { energy: W(1), dmg: 30 }); x = foe(S); z = put(S, 1, 'active', 1, 'Snorlax'); if (st) S.stadium = { id: pa('Hiking Trail'), seat: 0 };
		exec(S, { attack: 0, ...T0 }, { attack: 0, ...T1 });
		A(!!x.status.burned === st && y.dmg === (st ? 10 : 30), st ? 'with a Stadium in play, Sunny Scorching Burns and Rainy Absorbing heals 20' : 'with no Stadium in play they do neither');
	}
	S = arena(2); G(S, 0, 'active', 0, 'Castform Snowy Form', { energy: W(2) }); x = foe(S); S.stadium = { id: pa('Hiking Trail'), seat: 1 };
	exec(S, { attack: 0, ...T0 }); A(!!x.status.asleep || coin(S, /Asleep/).length === 1, 'Snowy Chilling puts its target to sleep when a Stadium is in play');
	S = arena(2); x = G(S, 0, 'active', 0, 'Rapid Strike Urshifu', { energy: ['Water', 'Fire'] }); foe(S); y = put(S, 1, 'bench', 1, 'Snorlax');
	exec(S, { attack: 0, ...T0, args: { also: L(1, 'bench', 1) } });
	A(x.energy.join() === 'Fire' && y.dmg === 40, 'Tornado Shot discards a Water Energy and also does 40 to a Benched Pokémon its player chose');

	// --- Abilities ---
	S = arena(2); x = G(S, 0, 'active', 0, 'Sceptile', { energy: ['Grass'] }); x.cards = [pa('Treecko'), pa('Grovyle'), pa('Sceptile')]; y = foe(S);
	A(E.view(S, 0).players[0].active[0].extra.length === 0, 'with no Celebi, an evolved Pokémon has only its own attacks');
	G(S, 0, 'bench', 0, 'Celebi');
	A(E.view(S, 0).players[0].active[0].extra.length === 2 && E.view(S, 0).players[1].active[0].extra.length === 0, 'Time Recall: each evolved Pokémon of Celebi\'s player may use the attacks of its previous Evolutions');
	exec(S, { attack: 1, ...T0 }); A(base(S, 20) && /Pound/.test(dmgs(S)[0]), 'Sceptile uses Treecko\'s Pound', dmgs(S));
	S = arena(2); G(S, 0, 'active', 0, 'Darmanitan', { energy: F(1) }); G(S, 0, 'active', 1, 'Darmanitan', { energy: F(1) }); G(S, 0, 'bench', 0, 'Victini'); x = foe(S); y = put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, ...T0 }, { attack: 0, ...T1 });
	A(S.pending && S.pending.kind === 'confirm' && S.pending.seat === 0 && E.view(S, 0).pending.flips.length === 2 && !E.view(S, 1).pending.flips, 'Victory Star: after a Fire Pokémon\'s attack flips coins, its player is asked whether to flip them again');
	{ const first = coin(S, /Double Smash/).slice(0, 2).filter(e => e.heads).length; E.apply(S, { t: 'choose', seat: 0, pick: 1 });
		const all = coin(S, /Double Smash/), again = all.slice(2, 4).filter(e => e.heads).length, last = all.slice(4).filter(e => e.heads).length;
		A(!S.pending && all.length === 6 && S.players[1].active[0].dmg === 40 * again && S.players[1].active[1].dmg === 40 * last && S.log.some(e => /uses Victory Star/.test(e.msg)), 'saying yes ignores those results (the first ' + first + ' heads count for nothing) and flips again; it is offered once a turn, so the second attack\'s coins stand', [first, again, last, S.players[1].active[0].dmg, S.players[1].active[1].dmg]); }
	S = arena(2); G(S, 0, 'active', 0, 'Darmanitan', { energy: F(1) }); G(S, 0, 'bench', 0, 'Victini'); x = foe(S);
	exec(S, { attack: 0, ...T0 }); { const h = coin(S, /Double Smash/).filter(e => e.heads).length; E.apply(S, { t: 'choose', seat: 0, pick: 0 }); A(coin(S, /Double Smash/).length === 2 && x.dmg === 40 * h, 'saying no keeps the results'); }
	S = arena(2); G(S, 0, 'active', 0, 'Poliwhirl', { energy: W(1) }); G(S, 0, 'bench', 0, 'Victini'); foe(S);
	exec(S, { attack: 0, ...T0 }); A(!S.pending && coin(S, /Hit Twice/).length === 2, 'a Pokémon of another type is not offered it');
	S = arena(2); G(S, 0, 'active', 0, 'Vaporeon ex'); x = foe(S); y = S.players[1].bench[0];
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { target: L(1, 'active', 0) } });
	A(S.players[1].active[0] === y && S.players[1].bench.includes(x), 'Frozen Flow (from an Active slot) switches an opposing Active Pokémon out');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); G(S, 0, 'bench', 0, 'Vaporeon ex'); foe(S);
	A(/Active slot/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { target: L(1, 'active', 0) } })) || ''), 'and cannot be used from the Bench');
	S = arena(2); G(S, 0, 'active', 0, 'Sobble'); x = foe(S); S.players[0].hand = [pa('Drizzile')];
	E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) });
	A(S.pending && S.pending.kind === 'confirm', 'Swift Shot: evolving into Drizzile from the hand offers its damage'); E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(!S.pending && x.dmg === 20, 'it does 20 to an opposing Active Pokémon');
	S = arena(2); G(S, 0, 'active', 0, 'Meowstic'); x = foe(S);
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { target: L(1, 'active', 0) } }); A(!!x.status.confused, 'Perplexing Ears makes an opposing Active Pokémon Confused');
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax', { dmg: 50 }); y = G(S, 0, 'bench', 0, 'Brambleghast'); foe(S);
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { slot: 0 } }); A(x.dmg === 20 && y.dmg === 30, 'Accept Pain moves 30 damage from an Active Pokémon to Brambleghast on the Bench');
	S = arena(2); G(S, 0, 'active', 0, 'Zarude'); put(S, 0, 'active', 1, 'Snorlax'); foe(S);
	{ const r0 = E.view(S, 0).players[0].active.map(k => k.retreat); G(S, 0, 'bench', 0, 'Bombirdier'); const r1 = E.view(S, 0).players[0].active.map(k => k.retreat);
		A(r1[0] === r0[0] - 1 && r1[1] === r0[1], 'Villainous Delivery (on the Bench): an Active Darkness Pokémon retreats for 1 less, others do not', [r0, r1]); }
	S = arena(2); G(S, 0, 'active', 0, 'Flygon ex'); x = foe(S); y = S.players[1].bench[0]; z = put(S, 0, 'bench', 0, 'Snorlax');
	exec(S); A(x.dmg === 10 && y.dmg === 10 && z.dmg === 0, 'Sand Slammer (in an Active slot): at the end of a turn, 10 to each Pokémon of every opponent');
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax', { status: { poisoned: { by: 1 } } }); G(S, 0, 'bench', 0, 'Blissey'); foe(S);
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { slot: 0 } }); A(!Object.keys(x.status).length, 'Happiness Supplement removes a Special Condition from an Active Pokémon');
	S = arena(2); x = G(S, 0, 'active', 0, 'Regigigas', { energy: F(3) }); G(S, 0, 'bench', 0, 'Regirock'); G(S, 0, 'bench', 1, 'Regice'); foe(S);
	A(/Seal of Antiquity/.test(E.attackBlock(S, 0, x, card(pa('Regigigas')).attacks[0]) || ''), 'Seal of Antiquity: Regigigas cannot attack without Regirock, Regice and Registeel on the Bench');
	G(S, 0, 'bench', 2, 'Registeel'); A(!E.attackBlock(S, 0, x, card(pa('Regigigas')).attacks[0]), 'and can with all three');
	S = arena(2); G(S, 0, 'active', 0, 'Rapid Strike Urshifu', { energy: ['Water', 'Fire'] }); put(S, 0, 'active', 1, 'Snorlax', { energy: F(4) }); put(S, 1, 'active', 0, 'Charizard ex'); put(S, 1, 'bench', 0, 'Snorlax'); put(S, 1, 'active', 1, 'Charizard ex'); S.players[0].hand = [pa('Korrina')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }); exec(S, { attack: 0, ...T0, args: { also: L(1, 'bench', 0) } }, { attack: card(id('Snorlax')).attacks.length - 1, ...T1 });
	A(/\+30 Korrina/.test(dmgs(S)[0]) && !/Korrina/.test(dmgs(S).find(m => /Rollout|Collapse/.test(m)) || ''), 'Double Type: Rapid Strike Urshifu (a Water card) is also Fighting, so Korrina\'s +30 into a Pokémon ex applies to it, and not to a Colorless Pokémon', dmgs(S));

	// --- Trainers ---
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); x = foe(S); S.players[0].hand = [pa('Field Blower'), pa('Field Blower')]; S.stadium = { id: pa('Hiking Trail'), seat: 1 };
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { target: L(1, 'active', 0) } });
	A(!x.tool && S.players[1].discard.includes(cape) && S.stadium, 'Field Blower discards a Pokémon Tool from any Pokémon');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { stadium: true } });
	A(!S.stadium && S.players[1].discard.includes(pa('Hiking Trail')), 'or the Stadium in play');
	S.players[0].hand = [pa('Field Blower')]; A(/Pokémon Tool/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { target: L(1, 'active', 0) } })) || ''), 'and cannot be played at nothing');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); put(S, 1, 'active', 0, 'Snorlax', { energy: F(4) }); x = put(S, 0, 'active', 1, 'Bulbasaur', { dmg: 60, tool: pa('Lucky Egg') }); S.players[0].hand = []; S.players[0].deck = Array(8).fill(id('Potion'));
	exec(S); exec(S, { attack: card(id('Snorlax')).attacks.length - 1, target: L(0, 'active', 1) });
	A(S.players[0].hand.length >= 5 && S.log.some(e => /Lucky Egg/.test(e.msg)), 'Lucky Egg: its holder Knocked Out by an opposing attack, its player draws until they have 5 cards', S.players[0].hand.length);
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [pa('Cabbie')]; S.players[0].deck = [id('Potion'), pa('Bounded Field'), id('Giovanni')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }); A(S.players[0].hand.join() === pa('Bounded Field'), 'Cabbie puts a random Stadium card from the deck into the hand');
	S = arena(2); x = G(S, 0, 'active', 0, 'Watchog'); y = G(S, 0, 'active', 1, 'Watchog'); put(S, 1, 'active', 0, 'Charizard ex', { energy: F(3) }); put(S, 1, 'active', 1, 'Snorlax', { energy: F(4) }); S.players[0].hand = [pa('Cheren')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }); exec(S); exec(S, { attack: 0, target: L(0, 'active', 0) }, { attack: card(id('Snorlax')).attacks.length - 1, target: L(0, 'active', 1) });
	A(x.dmg === 0 && /-100 Cheren/.test(dmgs(S)[0]) && y.dmg > 0 && !/Cheren/.test(dmgs(S)[1]), 'Cheren: Watchog takes 100 less from the attack of a Pokémon ex, and the usual amount from another Pokémon', dmgs(S));
	S = arena(2); x = G(S, 0, 'active', 0, 'Poliwag', { energy: W(1), dmg: 30 }); G(S, 0, 'active', 1, 'Vaporeon ex'); put(S, 0, 'bench', 0, 'Snorlax'); foe(S); S.players[0].hand = [pa('Parasol Lady'), pa('Parasol Lady')];
	A(/not a Pokémon ex/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 1) } })) || '') && /not a Pokémon ex/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'bench', 0) } })) || ''), 'Parasol Lady takes neither a Pokémon ex nor a Pokémon of another type');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } });
	A(S.players[0].hand.includes(pa('Poliwag')) && !S.players[0].active.includes(x), 'it puts a Water Pokémon in play into its player\'s hand');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [pa('Fragrant Forest')]; S.players[0].deck = [id('Potion'), id('Ivysaur'), id('Charmander'), id('Bulbasaur'), id('Giovanni')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }); E.apply(S, { t: 'stadium', seat: 0 });
	A(S.players[0].hand.join() === id('Bulbasaur') && coin(S, /Fragrant/).length === 0 && /already used/.test(refused(() => E.apply(S, { t: 'stadium', seat: 0 })) || ''), 'Fragrant Forest: once a turn, its player puts a random Basic Grass Pokémon from their deck into their hand (no coin)');
	for (const st of [true, false]) {
		S = arena(2); G(S, 0, 'active', 0, 'Riolu', { energy: FT(1) }); put(S, 1, 'active', 0, 'Charizard ex'); if (st) S.stadium = { id: pa('Arena of Antiquity'), seat: 1 };
		exec(S, { attack: 0, ...T0 }); A(/\+20 Arena of Antiquity/.test(dmgs(S)[0]) === st, st ? 'Arena of Antiquity: a Fighting Pokémon\'s attack does +20 into an opposing Active Pokémon ex' : 'without it, no bonus');
	}
	{ const hit = st => { S = arena(2); G(S, 0, 'active', 0, 'Castform Sunny Form', { energy: F(1) }); x = put(S, 1, 'active', 0, 'Bulbasaur', { tool: cape }); put(S, 1, 'active', 1, 'Snorlax'); if (st) S.stadium = { id: pa('Bounded Field'), seat: 0 }; exec(S, { attack: 0, ...T0 }); return [dmgs(S)[0].match(/does (\d+) damage/)[1] | 0, 30, dmgs(S)[0]]; };
		const [d0, b0] = hit(false), [d1, b1, m1] = hit(true);
		A(d0 === b0 + 20 && d1 === b1 * 2 && /×2 in place of the bonus/.test(m1), 'Bounded Field: where the +20 type bonus (this game\'s Weakness) would apply, the damage is ×2 in its place', [d0, b0, d1, b1, m1]); }
	S = arena(2); G(S, 0, 'active', 0, 'Mega Camerupt ex', { energy: F(4) }); x = put(S, 1, 'active', 0, 'Bulbasaur', { tool: cape }); S.stadium = { id: pa('Bounded Field'), seat: 0 };
	exec(S, { attack: 0, ...T0 }); A(!/×2/.test(dmgs(S)[0]), 'a Mega Evolution Pokémon ex gets the usual bonus, not ×2', dmgs(S)[0]);

	// --- the computer player ---
	{
		const N = n => pa(n), two = l => l.flatMap(v => [v, v]);
		const decks = [{ deck: two([N('Treecko'), N('Grovyle'), N('Mega Sceptile ex'), N('Celebi'), N('Shroomish'), N('Breloom'), N('Budew'), N('Heracross'), N('Fragrant Forest'), N('Cabbie')]), energy: ['Grass'] },
			{ deck: two([N('Numel'), N('Mega Camerupt ex'), N('Camerupt'), N('Victini'), N('Tepig'), N('Pignite'), N('Emboar'), N('Darumaka'), N('Darmanitan'), N('Castform Sunny Form')]), energy: ['Fire'] },
			{ deck: two([N('Sobble'), N('Drizzile'), N('Inteleon'), N('Poliwag'), N('Poliwhirl'), N('Politoed'), N('Regice'), N('Parasol Lady'), N('Castform Rainy Form'), N('Field Blower')]), energy: ['Water'] },
			{ deck: two([N('Riolu'), N('Mega Lucario ex'), N('Kubfu'), N('Rapid Strike Urshifu'), N('Meloetta'), N('Regirock'), N('Sawk'), N('Korrina'), N('Arena of Antiquity'), N('Lucky Egg')]), energy: ['Fighting', 'Water'] },
			{ deck: two([N('Zorua'), N('Zoroark ex'), N('Zarude'), N('Bombirdier'), N('Inkay'), N('Malamar'), N('Kubfu'), N('Single Strike Urshifu'), N('Bounded Field'), N('Field Blower')]), energy: ['Darkness'] },
			{ deck: two([N('Patrat'), N('Watchog'), N('Lillipup'), N('Herdier'), N('Stoutland'), N('Chansey'), N('Blissey'), N('Mega Audino ex'), N('Cheren'), N('Cabbie')]), energy: ['Psychic'] },
			{ deck: two([N('Espurr'), N('Meowstic'), N('Bramblin'), N('Brambleghast'), N('Hatenna'), N('Hattrem'), N('Hatterene'), N('Diancie'), N('Oricorio'), N('Lucky Egg')]), energy: ['Psychic'] }];
		A(decks.every(d => E.deckError(d.deck, d.energy) === null), 'seven Pulsing Aura decks are legal', decks.map(d => E.deckError(d.deck, d.energy)));
		const bad = []; let over = 0, stars = 0; const played = new Set();
		for (let g = 0; g < 28; g++) {
			const config = { seed: 'aura' + g, rules: E.RULES, players: [0, 1, 2, 3].slice(0, 2 + (g % 3)).map(i => ({ name: 'P' + i, ai: true, ...decks[(i + g) % 7] })) }, S2 = E.createGame(config), actions = [];
			try {
				for (let step = 0; step < 5000 && !S2.over; step++) {
					const seat = S2.pending ? S2.pending.seat : S2.phase === 'setup' ? S2.players.find(p => !p.setup).seat : S2.current, banned = new Set();
					let done = false;
					for (let t = 0; t < 40 && !done; t++) { const a = nextAction(E.view(S2, seat), banned) || { t: 'execute', seat, commands: [null, null] }; try { if (a.t === 'trainer') played.add(card(S2.players[seat].hand[a.hand]).name); E.apply(S2, a); actions.push(a); done = true; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); } }
					if (!done) { bad.push(g + ': stuck'); break; }
				}
				if (S2.over) over++;
				stars += S2.log.filter(e => /uses Victory Star/.test(e.msg)).length;
				if (E.digest(E.replay(config, actions)) !== E.digest(S2)) bad.push(g + ': replay differs');
				for (const p of S2.players) { const total = p.deck.length + p.hand.length + p.discard.length + [...p.active, ...p.bench].filter(Boolean).reduce((a, k) => a + k.cards.length + (k.tool ? 1 : 0), 0) + (S2.stadium && S2.stadium.seat === p.seat ? 1 : 0); if (total !== 20) bad.push(`${g}: ${p.name} has ${total} cards`); }
			} catch (e) { bad.push(g + ': ' + e.message); }
		}
		A(over === 28 && bad.length === 0 && stars > 0 && played.has('Field Blower') && played.has('Fragrant Forest') && played.has('Korrina'), 'computer players finish 28 matches with Pulsing Aura decks (2, 3 and 4 players; Victory Star used ' + stars + ' times): every replay matches and every card is accounted for', { over, stars, played: [...played].join(), bad: bad.slice(0, 4) });
	}
}

/// ===== 28. Paradox Drive (B3a): each new effect, played =====
{
	const pd = name => { const c = CARDS.find(x => x.set === 'B3a' && x.name === name) || CARDS.find(x => x.name === name); if (!c) throw new Error('no card ' + name); return c.id; };
	const cape = CARDS.find(x => x.name === 'Giant Cape').id;
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const G = (S, seat, zone, idx, name, o) => putId(S, seat, zone, idx, pd(name), o);
	const dmgs = S => S.log.filter(e => e.k === 'damage').map(e => e.msg);
	const foe = S => { const k = put(S, 1, 'active', 0, 'Snorlax', { tool: cape }); put(S, 1, 'bench', 0, 'Snorlax'); return k; };
	const coin = (S, re) => S.log.filter(e => e.k === 'coin' && re.test(e.msg));
	const T0 = { target: L(1, 'active', 0) };
	const base = (S, n, i = 0) => new RegExp('base ' + n + '\\b').test(dmgs(S)[i] || '');
	const N = (t, n) => Array(n).fill(t);
	let S, x, y, z;

	// --- the data ---
	{ const recs = JSON.parse(fs.readFileSync(path.join(ROOT, 'pocketenhanced/data/source/alt_b3a.json'), 'utf8')).cards, mine = CARDS.filter(c => c.set === 'B3a');
		A(recs.length === 109 && mine.length === 75 && CARDS.filter(c => c.ancient).map(c => c.name).sort().join() === 'Brute Bonnet,Flutter Mane,Flutter Mane ex,Gouging Fire,Great Tusk,Koraidon ex,Raging Bolt,Roaring Moon,Sandy Shocks,Scream Tail,Slither Wing,Walking Wake' && CARDS.filter(c => c.future).map(c => c.name).sort().join() === 'Iron Boulder,Iron Bundle,Iron Bundle ex,Iron Crown,Iron Hands,Iron Jugulis,Iron Leaves,Iron Moth,Iron Thorns,Iron Treads,Iron Valiant,Miraidon ex' && recs.every(c => !c.description && !c.illustrator && !c.image),
			'Paradox Drive: 109 printings add 75 gameplay cards; the Paradox Pokémon are labelled Ancient or Future by species (from Paradox Drive on: the Koraidon and Miraidon of Paldean Wonders are not)', [recs.length, mine.length, CARDS.filter(c => c.ancient).length, CARDS.filter(c => c.future).length]); }

	// --- attacks ---
	S = arena(2); G(S, 0, 'active', 0, 'Iron Moth', { energy: N('Fire', 2) }); foe(S);
	exec(S, { attack: 0, ...T0 });
	{ const h = coin(S, /Thermal Gust/).filter(e => e.heads).length; A(coin(S, /Thermal Gust/).length === 3 && base(S, 10 + [0, 20, 50, 120][h]), 'Thermal Gust flips 3 coins: +20 for one heads, +50 for two, +120 for three', h); }
	S = arena(2); x = G(S, 0, 'active', 0, 'Iron Bundle ex', { energy: N('Water', 3) }); y = foe(S);
	exec(S, { attack: 0, ...T0 });
	A(base(S, 80) && !!y.status.paralyzed && x.used === true, 'Cold Start: the first attack Iron Bundle ex uses after coming into play does 60 + 20 and Paralyzes');
	exec(S); exec(S, { attack: 0, ...T0 });
	A(base(S, 60, 1) && !y.status.paralyzed, 'its later attacks do 60 and do not');
	S = arena(2); G(S, 0, 'active', 0, 'Flutter Mane ex', { energy: N('Psychic', 2) }); x = foe(S); x.tool = null; S.players[1].hand = [id('Potion')];
	exec(S, { attack: 0, ...T0 });
	A(/Trainer cards/.test(refused(() => E.apply(S, { t: 'trainer', seat: 1, hand: 0, args: { at: L(1, 'active', 0) } })) || ''), 'Spellbinding Start: after Flutter Mane ex\'s first attack, its target\'s owner can play no Trainer card on their next turn');
	exec(S); exec(S, { attack: 0, ...T0 });
	A(refused(() => E.apply(S, { t: 'trainer', seat: 1, hand: 0, args: { at: L(1, 'active', 0) } })) === null, 'its later attacks do not stop them');
	S = arena(2); G(S, 0, 'active', 0, 'Espathra', { energy: N('Psychic', 2) }); put(S, 1, 'active', 0, 'Snorlax', { tool: cape }); put(S, 0, 'active', 1, 'Snorlax'); put(S, 1, 'active', 1, 'Snorlax', { energy: N('Fire', 4) });
	exec(S, { attack: 0, ...T0 }); exec(S, null, { attack: card(id('Snorlax')).attacks.length - 1, target: L(0, 'active', 1) }); exec(S, { attack: 0, ...T0 });
	A(!/exposed/.test(dmgs(S)[0]) && /\+50 \(exposed\)/.test(dmgs(S)[2]), 'Lumina Crash: on its player\'s next turn the Defending Pokémon takes +50 from attacks', dmgs(S));
	S = arena(2); G(S, 0, 'active', 0, 'Scream Tail', { energy: N('Psychic', 2) }); x = foe(S); x.tool = null;
	exec(S, { attack: 0, ...T0 });
	{ const both = coin(S, /Shooing Shout/).every(e => e.heads); A(coin(S, /Shooing Shout/).length === 2 && S.players[1].discard.includes(id('Snorlax')) === both && S.players[0].points === 0, 'Shooing Shout flips 2 coins: on two heads its target is discarded (no points are taken)', both); }
	S = arena(2); G(S, 0, 'active', 0, 'Sandy Shocks', { energy: N('Fighting', 3) }); x = foe(S); y = put(S, 1, 'bench', 1, 'Bulbasaur', { tool: cape });
	exec(S, { attack: 0, ...T0, args: { pull: 1 } });
	A(S.players[1].active[0] === y && S.players[1].bench[1] === x && y.dmg > 0 && x.dmg === 0 && /base 50\b/.test(dmgs(S)[0]), 'Pull In and Pound pulls the chosen Benched Pokémon into its target\'s slot and does 50 to it', dmgs(S));
	S = arena(2); G(S, 0, 'active', 0, 'Sableye', { energy: ['Fire'] }); put(S, 0, 'bench', 0, 'Snorlax'); x = put(S, 0, 'bench', 1, 'Snorlax'); foe(S);
	exec(S, { attack: 0, ...T0, args: { bench: 1 } });
	A(x.energy.length === 1 && ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal'].includes(x.energy[0]), 'Jeweled Gift attaches an Energy of a random type to the Benched Pokémon its player chose', x.energy);
	S = arena(2); G(S, 0, 'active', 0, 'Kingambit', { energy: N('Darkness', 2) }); foe(S); S.players[0].fallen = 2;
	exec(S, { attack: 0, ...T0 }); A(base(S, 140), 'Overlord\'s Blade does 60 + 40 for each of its player\'s Pokémon Knocked Out this game (2)');
	S = arena(2); x = G(S, 0, 'active', 0, 'Walking Wake', { energy: ['Fire', 'Water'] }); foe(S);
	exec(S, { attack: 0, ...T0 }); A(x.energy.length === 1 && S.players[1].bench[0].dmg === 20, 'Sweeping Billow discards an Energy and also does 20 to each Benched Pokémon of its target\'s owner');
	S = arena(2); x = G(S, 0, 'active', 0, 'Gouging Fire', { energy: ['Fire', 'Lightning', 'Water'] }); foe(S);
	exec(S, { attack: 0, ...T0 }); A(x.energy.length === 1 && E.view(S, 0).players[0].active[0].fx.some(f => f.k === 'reduce' && f.n === 30), 'Scorching Interruption discards 2 Energy; until its player\'s next turn it takes 30 less');
	S = arena(2); x = G(S, 0, 'active', 0, 'Raging Bolt', { energy: ['Water', 'Water', 'Lightning', 'Lightning', 'Fire'] }); foe(S);
	exec(S, { attack: 0, ...T0 });
	A(x.energy.length === 0 && S.players[0].points === 1 && S.players[1].fallen === 1, 'Baneful Boom discards all its Energy and Knocks Out its target (the Knock Out is counted for its owner)');
	S = arena(2); x = G(S, 0, 'active', 0, 'Dudunsparce', { energy: N('Fire', 2) }); x.cards = [pd('Dunsparce'), pd('Dudunsparce')]; x.turnEvolved = S.turn; y = foe(S); y.energy = N('Fire', 3);
	exec(S, { attack: 0, ...T0 }); A(y.energy.length === 1, 'Sudden Drilling, on the turn Dudunsparce evolved from Dunsparce, discards 2 random Energy from its target');
	S = arena(2); G(S, 0, 'active', 0, 'Terapagos ex', { energy: ['Fire', 'Water', 'Grass'] }); foe(S);
	exec(S, { attack: 0, ...T0 }); A(base(S, 140), 'Prism Impact does 80 + 20 for each type of Energy attached (3)');

	// --- Abilities ---
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax', { energy: N('Fire', 2) }); y = put(S, 0, 'bench', 0, 'Pikachu', { energy: ['Lightning'] }); foe(S); S.players[0].hand = [pd('Miraidon ex')];
	E.apply(S, { t: 'playBasic', seat: 0, hand: 0, to: { zone: 'bench', idx: 1 } });
	A(S.pending && S.pending.kind === 'confirm', 'Legendary Drive: put onto the Bench from the hand, Miraidon ex offers to take an Active slot'); E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	z = S.players[0].active[0];
	A(!S.pending && card(z.cards[z.cards.length - 1]).name === 'Miraidon ex' && z.energy.length === 3 && S.players[0].bench[1] === x && x.energy.length === 0 && y.energy.length === 0, 'it switches with the Active Pokémon, and all its player\'s Energy in play moves to it', z.energy);
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); x = foe(S); y = S.players[1].bench[0]; S.players[0].hand = [pd('Roaring Moon')];
	E.apply(S, { t: 'playBasic', seat: 0, hand: 0, to: { zone: 'bench', idx: 0 } }); E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(!S.pending && S.players[1].active[0] === y && S.players[1].bench.includes(x), 'Ancient Roar: put onto the Bench from the hand, Roaring Moon may switch an opposing Active Pokémon out');
	S = arena(2); G(S, 0, 'active', 0, 'Iron Hands'); put(S, 0, 'active', 1, 'Snorlax'); foe(S);
	{ const l0 = E.view(S, 0).players[0].active.map(k => k.less); G(S, 0, 'bench', 0, 'Iron Valiant'); const l1 = E.view(S, 0).players[0].active.map(k => k.less);
		A(l1[0] === l0[0] + 1 && l1[1] === l0[1], 'Future System: attacks of its player\'s Future Pokémon cost 1 less Colorless Energy (other Pokémon\'s do not)', [l0, l1]); }
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax', { dmg: 30 }); G(S, 0, 'bench', 0, 'Garganacl', { dmg: 5 }); y = foe(S); y.dmg = 30;
	exec(S); A(x.dmg === 20 && S.players[0].bench[0].dmg === 0 && y.dmg === 30, 'Blessed Salt: at the end of a turn, each of its player\'s Pokémon heals 10');

	// --- Trainers ---
	S = arena(2); G(S, 0, 'active', 0, 'Great Tusk', { tool: pd('Ancient Booster Energy Capsule') }); put(S, 0, 'active', 1, 'Snorlax', { tool: pd('Ancient Booster Energy Capsule') }); foe(S);
	{ const hp = E.view(S, 0).players[0].active.map(k => k.hp); A(hp[0] === card(pd('Great Tusk')).hp + 40 && hp[1] === card(id('Snorlax')).hp, 'Ancient Booster Energy Capsule: +40 HP on an Ancient Pokémon, nothing on another', hp); }
	S = arena(2); G(S, 0, 'active', 0, 'Iron Thorns', { energy: N('Lightning', 2), tool: pd('Future Booster Energy Capsule') }); put(S, 0, 'active', 1, 'Snorlax', { energy: N('Fire', 4), tool: pd('Future Booster Energy Capsule') }); foe(S); put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, ...T0 }, { attack: card(id('Snorlax')).attacks.length - 1, target: L(1, 'active', 1) });
	A(/\+20 Future Booster Energy Capsule/.test(dmgs(S)[0]) && !/Capsule/.test(dmgs(S)[1]), 'Future Booster Energy Capsule: +20 from the Future Pokémon it is attached to, nothing from another');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [pd('Juliana')]; S.players[0].deck = [id('Potion'), id('Venusaur'), id('Ivysaur'), id('Bulbasaur')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }); A(S.players[0].hand.join() === id('Venusaur'), 'Juliana puts a random Stage 2 Pokémon from the deck into the hand');
	S = arena(2); x = G(S, 0, 'active', 0, 'Great Tusk'); put(S, 0, 'bench', 0, 'Snorlax'); foe(S); S.players[0].hand = [pd('Professor Sada')]; S.players[0].energyDiscard = ['Fire', 'Water', 'Fire'];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(!S.pending && x.energy.slice().sort().join() === 'Fire,Water' && S.players[0].energyDiscard.join() === 'Fire', 'Professor Sada attaches one Energy of each type in the discard pile (up to 3 types) to her player\'s Ancient Pokémon', x.energy);
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [pd('Professor Sada')]; S.players[0].energyDiscard = ['Fire'];
	A(/no Ancient/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} })) || ''), 'and cannot be played with no Ancient Pokémon in play');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); x = G(S, 0, 'bench', 0, 'Iron Hands', { energy: ['Lightning'] }); foe(S); S.players[0].hand = [pd('Professor Turo'), pd('Professor Turo')]; S.players[0].deck = [];
	A(/Future/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } })) || ''), 'Professor Turo takes only a Future Pokémon');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'bench', 0) } });
	A(S.players[0].deck.join() === pd('Iron Hands') && !S.players[0].bench[0], 'he shuffles it from play into the deck');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.stadium = { id: pd('Area Zero'), seat: 1 }; S.players[0].hand = [id('Potion'), id('Bulbasaur')]; S.players[0].deck = [id('Giovanni')];
	A(/Basic Pokémon/.test(refused(() => E.apply(S, { t: 'stadium', seat: 0, hand: 0 })) || ''), 'Area Zero asks for a Basic Pokémon from the hand');
	E.apply(S, { t: 'stadium', seat: 0, hand: 1 });
	A(S.players[0].hand.length === 2 && S.players[0].deck.length === 1 && /already used/.test(refused(() => E.apply(S, { t: 'stadium', seat: 0, hand: 0 })) || ''), 'it goes into the deck and its player draws a card, once a turn');

	// --- the computer player ---
	{
		const Nn = n => pd(n), two = l => l.flatMap(v => [v, v]);
		const decks = [{ deck: two([Nn('Great Tusk'), Nn('Sandy Shocks'), Nn('Koraidon ex'), Nn('Roaring Moon'), Nn('Nacli'), Nn('Naclstack'), Nn('Garganacl'), Nn('Ancient Booster Energy Capsule'), Nn('Professor Sada'), Nn('Area Zero')]), energy: ['Fighting', 'Darkness'] },
			{ deck: two([Nn('Iron Hands'), Nn('Iron Thorns'), Nn('Miraidon ex'), Nn('Iron Valiant'), Nn('Iron Leaves'), Nn('Iron Crown'), Nn('Iron Boulder'), Nn('Future Booster Energy Capsule'), Nn('Professor Turo'), Nn('Area Zero')]), energy: ['Lightning', 'Psychic'] },
			{ deck: two([Nn('Iron Bundle ex'), Nn('Psyduck'), Nn('Golduck'), Nn('Snom'), Nn('Frosmoth'), Nn('Scream Tail'), Nn('Flutter Mane ex'), Nn('Flittle'), Nn('Espathra'), Nn('Juliana')]), energy: ['Water', 'Psychic'] },
			{ deck: two([Nn('Sneasel'), Nn('Weavile'), Nn('Sableye'), Nn('Pawniard'), Nn('Bisharp'), Nn('Kingambit'), Nn('Glimmet'), Nn('Glimmora'), Nn('Iron Jugulis'), Nn('Juliana')]), energy: ['Darkness'] },
			{ deck: two([Nn('Walking Wake'), Nn('Gouging Fire'), Nn('Terapagos ex'), Nn('Dunsparce'), Nn('Dudunsparce'), Nn('Rufflet'), Nn('Braviary'), Nn('Iron Moth'), Nn('Brute Bonnet'), Nn('Professor Sada')]), energy: ['Fire', 'Water'] }];
		A(decks.every(d => E.deckError(d.deck, d.energy) === null), 'five Paradox Drive decks are legal', decks.map(d => E.deckError(d.deck, d.energy)));
		const bad = []; let over = 0, drives = 0; const played = new Set();
		for (let g = 0; g < 25; g++) {
			const config = { seed: 'paradox' + g, rules: E.RULES, players: [0, 1, 2, 3].slice(0, 2 + (g % 3)).map(i => ({ name: 'P' + i, ai: true, ...decks[(i + g) % 5] })) }, S2 = E.createGame(config), actions = [];
			try {
				for (let step = 0; step < 5000 && !S2.over; step++) {
					const seat = S2.pending ? S2.pending.seat : S2.phase === 'setup' ? S2.players.find(p => !p.setup).seat : S2.current, banned = new Set();
					let done = false;
					for (let t = 0; t < 40 && !done; t++) { const a = nextAction(E.view(S2, seat), banned) || { t: 'execute', seat, commands: [null, null] }; try { if (a.t === 'trainer') played.add(card(S2.players[seat].hand[a.hand]).name); E.apply(S2, a); actions.push(a); done = true; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); } }
					if (!done) { bad.push(g + ': stuck'); break; }
				}
				if (S2.over) over++;
				drives += S2.log.filter(e => /Legendary Drive: /.test(e.msg)).length;
				if (E.digest(E.replay(config, actions)) !== E.digest(S2)) bad.push(g + ': replay differs');
				for (const p of S2.players) { const total = p.deck.length + p.hand.length + p.discard.length + [...p.active, ...p.bench].filter(Boolean).reduce((a, k) => a + k.cards.length + (k.tool ? 1 : 0), 0) + (S2.stadium && S2.stadium.seat === p.seat ? 1 : 0); if (total !== 20) bad.push(`${g}: ${p.name} has ${total} cards`); }
			} catch (e) { bad.push(g + ': ' + e.message); }
		}
		A(over === 25 && bad.length === 0 && drives > 0 && played.has('Professor Sada') && played.has('Juliana') && played.has('Area Zero'), 'computer players finish 25 matches with Paradox Drive decks (2, 3 and 4 players; Legendary Drive used ' + drives + ' times): every replay matches and every card is accounted for', { over, drives, played: [...played].join(), bad: bad.slice(0, 4) });
	}
}

//// ===== 29. Everyday Wonders (B3b): each new effect, played =====
{
	const ew = name => { const c = CARDS.find(x => x.set === 'B3b' && x.name === name) || CARDS.find(x => x.name === name); if (!c) throw new Error('no card ' + name); return c.id; };
	const cape = CARDS.find(x => x.name === 'Giant Cape').id;
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const G = (S, seat, zone, idx, name, o) => putId(S, seat, zone, idx, ew(name), o);
	const dmgs = S => S.log.filter(e => e.k === 'damage').map(e => e.msg);
	const foe = S => { const k = put(S, 1, 'active', 0, 'Snorlax', { tool: cape }); put(S, 1, 'bench', 0, 'Snorlax'); return k; };
	const T0 = { target: L(1, 'active', 0) };
	const base = (S, n, i = 0) => new RegExp('base ' + n + '\\b').test(dmgs(S)[i] || '');
	const N = (t, n) => Array(n).fill(t);
	let S, x, y, z;

	// --- the data ---
	{ const recs = JSON.parse(fs.readFileSync(path.join(ROOT, 'pocketenhanced/data/source/alt_b3b.json'), 'utf8')).cards, mine = CARDS.filter(c => c.set === 'B3b');
		A(recs.length === 106 && mine.length === 69 && mine.filter(c => c.points === 3).map(c => c.name).sort().join() === 'Mega Diancie ex,Mega Sableye ex' && card(ew('Hisuian Goodra')).combatTypes.join() === 'Steel,Dragon' && card(ew('Hisuian Zoroark ex')).combatTypes.join() === 'Normal,Ghost' && card(ew('Flutter Mane')).ancient && card(ew('Iron Bundle')).future && recs.every(c => !c.description && !c.illustrator && !c.image),
			'Everyday Wonders: 106 printings add 69 gameplay cards; two Mega Evolution Pokémon ex; the Hisuian forms fight as their own types', [recs.length, mine.length]); }

	// --- attacks ---
	S = arena(2); G(S, 0, 'active', 0, 'Emolga', { energy: N('Lightning', 2), tool: cape }); put(S, 0, 'bench', 0, 'Snorlax', { tool: cape }); put(S, 0, 'bench', 1, 'Snorlax'); foe(S);
	exec(S, { attack: 0, ...T0 }); A(base(S, 60), 'Windup Thunder does 30 for each Pokémon Tool attached to its player\'s Pokémon (2)');
	S = arena(2); G(S, 0, 'active', 0, 'Mega Diancie ex', { energy: ['Psychic', 'Psychic', 'Fire'] }); put(S, 0, 'bench', 0, 'Snorlax', { energy: ['Psychic', 'Water'] }); foe(S);
	exec(S, { attack: 0, ...T0 }); A(base(S, 100), 'Brilliant Storm does 40 + 20 for each Psychic Energy attached to all its player\'s Pokémon (3)');
	for (const same of [true, false]) {
		S = arena(2); G(S, 0, 'active', 0, 'Enamorus', { energy: ['Psychic', 'Fire', 'Fire'] }); x = foe(S); x.energy = [same ? 'Fire' : 'Water'];
		exec(S, { attack: 0, ...T0 }); A(base(S, same ? 120 : 60), same ? 'Smitten Strike does 60 + 60 when it and its target share a type of Energy' : 'and 60 when they share none');
	}
	for (const up of [true, false]) {
		S = arena(2); x = G(S, 0, 'active', 0, 'Flutter Mane', { energy: ['Psychic', 'Fire'] }); if (up) x.movedUp = S.turn; y = foe(S);
		exec(S, { attack: 0, ...T0 }); A(up ? base(S, 90) : y.dmg === 0 && S.log.some(e => /Hexing Flight does nothing/.test(e.msg)), up ? 'Hexing Flight does 90 on the turn Flutter Mane moved up from the Bench' : 'and nothing otherwise');
	}
	S = arena(2); G(S, 0, 'active', 0, 'Quagsire', { energy: N('Fighting', 3) }); x = put(S, 1, 'active', 0, 'Charizard ex', { energy: N('Fire', 4) }); put(S, 1, 'bench', 0, 'Snorlax');
	exec(S, { attack: 0, ...T0 });
	{ const fxs = x.fx.filter(f => f.k === 'cantUse'), atks = card(id('Charizard ex')).attacks, blocked = atks.filter(a => E.attackBlock(S, 1, x, a));
		A(fxs.length === 1 && blocked.length === 1 && blocked[0].name === fxs[0].name, 'Amnesia: one of its target\'s attacks, chosen at random, cannot be used on its owner\'s next turn (the other can)', fxs); }
	exec(S); exec(S); A(card(id('Charizard ex')).attacks.every(a => !E.attackBlock(S, 1, x, a)), 'and can again on the turn after');
	S = arena(2); G(S, 0, 'active', 0, 'Hisuian Zoroark ex', { energy: N('Fire', 3) }); foe(S); S.players[0].discard = [id('Bulbasaur'), id('Potion'), id('Charmander')];
	exec(S, { attack: 0, ...T0 }); A(base(S, 120), 'Spiteful Illusion does 80 + 20 for each Pokémon in its player\'s discard pile (2)');

	// --- Abilities ---
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); x = G(S, 1, 'active', 0, 'Caterpie'); y = G(S, 1, 'bench', 0, 'Caterpie'); S.players[1].deck = [id('Potion'), ew('Metapod'), ew('Metapod')];
	exec(S);
	A(card(x.cards[x.cards.length - 1]).name === 'Metapod' && y.cards.length === 1, 'Quick Growth: at the end of an opponent\'s turn, Caterpie in an Active slot evolves from its player\'s deck (one on the Bench does not)');
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax', { dmg: 50 }); y = G(S, 0, 'bench', 0, 'Sylveon'); foe(S);
	A(/Pokémon Tool/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { at: L(0, 'active', 0) } })) || ''), 'Soothing Ribbon needs a Pokémon Tool on Sylveon');
	y.tool = cape; E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { at: L(0, 'active', 0) } }); A(x.dmg === 20, 'with one, it heals 30 from one of its player\'s Pokémon');
	S = arena(2); G(S, 0, 'active', 0, 'Snorlax'); foe(S); exec(S); S.players[1].hand = [CARDS.find(c => c.name === 'Hiking Trail').id];
	A(/Stadium/.test(refused(() => E.apply(S, { t: 'trainer', seat: 1, hand: 0, args: {} })) || ''), 'Massive Body: while this Snorlax is in an Active slot, opponents cannot play Stadium cards');

	// --- Trainers ---
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); G(S, 0, 'active', 1, 'Raichu'); foe(S);
	{ const r0 = E.view(S, 0).players[0].active.map(k => k.retreat); S.players[0].active.forEach(k => { k.tool = ew('Small Balloon'); }); const r1 = E.view(S, 0).players[0].active.map(k => k.retreat);
		A(r1[0] === r0[0] - 1 && r1[1] === r0[1], 'Small Balloon: a Basic Pokémon retreats for 1 less; a Stage 1 does not', [r0, r1]); }
	{ const h0 = E.view(S, 0).players[0].active.map(k => k.hp); S.players[0].active.forEach(k => { k.tool = ew('Elegant Cape'); }); const h1 = E.view(S, 0).players[0].active.map(k => k.hp);
		A(h1[0] === h0[0] && h1[1] === h0[1] + 30, 'Elegant Cape: +30 HP on a Stage 1 Pokémon, nothing on a Basic', [h0, h1]); }
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax', { tool: cape }); x = foe(S); x.dmg = card(id('Snorlax')).hp + 10; S.players[0].hand = [ew('Elesa')]; S.players[1].hand = [];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.players[0].hand.join() === cape && S.players[1].hand.join() === cape && !S.players[0].active[0].tool && !S.players[1].active.includes(x), 'Elesa returns every Pokémon Tool in play to its owner\'s hand (a Pokémon that only its Giant Cape kept standing falls)');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [ew('Puppy-Loving Girl')]; S.players[0].deck = [ew('Growlithe'), id('Potion'), 'B3-137', id('Bulbasaur'), ew('Yamper')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.players[0].hand.slice().sort().join() === [ew('Growlithe'), 'B3-137'].sort().join() && S.players[0].deck.length === 3, 'Puppy-Loving Girl takes the Pokémon with Puppy Pile among the top 4 cards of the deck');
	S = arena(2); x = G(S, 0, 'active', 0, 'Feebas'); x.turnPlayed = S.turn; y = G(S, 0, 'bench', 0, 'Piplup'); foe(S); S.players[0].hand = [ew('Wallace'), ew('Wallace')]; S.players[0].deck = [id('Potion'), ew('Milotic ex')];
	A(/maximum HP of 50/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'bench', 0) } })) || ''), 'Wallace takes only a Water Pokémon with a maximum HP of 50 or less');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } });
	A(card(x.cards[x.cards.length - 1]).name === 'Milotic ex', 'he evolves it from the deck, even on the turn it was played');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.stadium = { id: ew("Kid's Room"), seat: 1 }; S.players[0].hand = [id('Potion')]; S.players[0].deck = [id('Bulbasaur'), cape, id('Giovanni')];
	E.apply(S, { t: 'stadium', seat: 0, hand: 0 });
	A(S.players[0].hand.join() === cape && S.players[0].deck.includes(id('Potion')) && S.players[0].deck.length === 3 && /already used/.test(refused(() => E.apply(S, { t: 'stadium', seat: 0, hand: 0 })) || ''), 'Kid\'s Room: once a turn, a card from the hand is switched with a random Pokémon Tool from the deck');

	// --- the computer player ---
	{
		const Nn = n => ew(n), two = l => l.flatMap(v => [v, v]);
		const decks = [{ deck: two([Nn('Caterpie'), Nn('Metapod'), Nn('Butterfree'), Nn('Petilil'), Nn('Hisuian Lilligant'), Nn('Tropius'), Nn('Cacnea'), Nn('Small Balloon'), Nn('Elegant Cape'), Nn("Kid's Room")]), energy: ['Grass'] },
			{ deck: two([Nn('Growlithe'), Nn('Yamper'), Nn('Fidough'), Nn('Rockruff'), 'B3-137', Nn('Vulpix'), Nn('Ninetales'), Nn('Puppy-Loving Girl'), Nn('Munchlax'), Nn('Snorlax')]), energy: ['Fire'] },
			{ deck: two([Nn('Feebas'), Nn('Milotic ex'), Nn('Goldeen'), Nn('Seaking'), Nn('Snorunt'), Nn('Froslass'), Nn('Psyduck'), Nn('Wallace'), Nn('Luvdisc'), Nn('Iron Bundle')]), energy: ['Water'] },
			{ deck: two([Nn('Pikachu'), Nn('Raichu'), Nn('Emolga'), Nn('Dedenne ex'), Nn('Small Balloon'), Nn('Elegant Cape'), Nn('Elesa'), Nn("Kid's Room"), Nn('Mareep'), Nn('Flaaffy')]), energy: ['Lightning'] },
			{ deck: two([Nn('Carbink'), Nn('Mega Diancie ex'), Nn('Enamorus'), Nn('Flutter Mane'), Nn('Slowpoke'), Nn('Slowbro'), Nn('Munna'), Nn('Musharna'), Nn('Eevee'), Nn('Sylveon')]), energy: ['Psychic'] },
			{ deck: two([Nn('Mega Sableye ex'), Nn('Cacnea'), Nn('Cacturne'), Nn('Spiritomb'), Nn('Mareanie'), Nn('Toxapex'), Nn('Scraggy'), Nn('Scrafty'), Nn('Hisuian Zorua'), Nn('Hisuian Zoroark ex')]), energy: ['Darkness'] },
			{ deck: two([Nn('Goomy'), Nn('Hisuian Sliggoo'), Nn('Hisuian Goodra'), Nn('Teddiursa'), Nn('Ursaring'), Nn('Ursaluna'), Nn('Wooper'), Nn('Quagsire'), Nn('Furfrou'), Nn('Elesa')]), energy: ['Water', 'Metal', 'Fighting'] }];
		A(decks.every(d => E.deckError(d.deck, d.energy) === null), 'seven Everyday Wonders decks are legal', decks.map(d => E.deckError(d.deck, d.energy)));
		const bad = []; let over = 0, grew = 0; const played = new Set();
		for (let g = 0; g < 28; g++) {
			const config = { seed: 'everyday' + g, rules: E.RULES, players: [0, 1, 2, 3].slice(0, 2 + (g % 3)).map(i => ({ name: 'P' + i, ai: true, ...decks[(i + g) % 7] })) }, S2 = E.createGame(config), actions = [];
			try {
				for (let step = 0; step < 5000 && !S2.over; step++) {
					const seat = S2.pending ? S2.pending.seat : S2.phase === 'setup' ? S2.players.find(p => !p.setup).seat : S2.current, banned = new Set();
					let done = false;
					for (let t = 0; t < 40 && !done; t++) { const a = nextAction(E.view(S2, seat), banned) || { t: 'execute', seat, commands: [null, null] }; try { if (a.t === 'trainer') played.add(card(S2.players[seat].hand[a.hand]).name); E.apply(S2, a); actions.push(a); done = true; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); } }
					if (!done) { bad.push(g + ': stuck'); break; }
				}
				if (S2.over) over++;
				grew += S2.log.filter(e => /^Quick Growth: .* evolves/.test(e.msg)).length;
				if (E.digest(E.replay(config, actions)) !== E.digest(S2)) bad.push(g + ': replay differs');
				if (E.view(S2, 0).players.some(p => [...p.active, ...p.bench].filter(Boolean).some(k => k.dmg >= k.hp))) bad.push(g + ': a knocked out Pokémon is still in play');
				for (const p of S2.players) { const total = p.deck.length + p.hand.length + p.discard.length + [...p.active, ...p.bench].filter(Boolean).reduce((a, k) => a + k.cards.length + (k.tool ? 1 : 0), 0) + (S2.stadium && S2.stadium.seat === p.seat ? 1 : 0); if (total !== 20) bad.push(`${g}: ${p.name} has ${total} cards`); }
			} catch (e) { bad.push(g + ': ' + e.message); }
		}
		A(over === 28 && bad.length === 0 && grew > 0 && played.has('Elesa') && played.has('Wallace') && played.has('Puppy-Loving Girl') && played.has("Kid's Room"), 'computer players finish 28 matches with Everyday Wonders decks (2, 3 and 4 players; Quick Growth evolved ' + grew + ' Caterpie): every replay matches and every card is accounted for', { over, grew, played: [...played].join(), bad: bad.slice(0, 4) });
	}
}

/// ===== 30. Rules revision 6: the Koraidon and Miraidon of Paldean Wonders are not Ancient and Future =====
{
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const byName = n => CARDS.find(c => c.name === n).id;
	A(E.RULES === 6 && !card('B2a-063').ancient && card('B2a-063').ancientWas && !card('B2a-045').future && card('B2a-045').futureWas && card(CARDS.find(c => c.set === 'B3a' && c.name === 'Koraidon ex').id).ancient && card(CARDS.find(c => c.set === 'B3a' && c.name === 'Miraidon ex').id).future,
		'new matches are played under rules revision 6: Paldean Wonders\' Koraidon and Miraidon carry no label (Paradox Drive\'s Koraidon ex and Miraidon ex do)');
	for (const rules of [6, 5]) {
		let S = arena(2); S.rules = rules; putId(S, 0, 'active', 0, 'B2a-063', { tool: byName('Ancient Booster Energy Capsule') }); putId(S, 0, 'active', 1, 'B2a-045'); putId(S, 0, 'bench', 0, CARDS.find(c => c.name === 'Iron Valiant').id); put(S, 1, 'active', 0, 'Snorlax');
		const v = E.view(S, 0).players[0].active;
		A(v[0].hp === card('B2a-063').hp + (rules >= 6 ? 0 : 40) && v[1].less === (rules >= 6 ? 0 : 1), rules >= 6 ? 'that Koraidon gets no HP from the Ancient Booster Energy Capsule, and that Miraidon no cost reduction from Future System' : 'a match recorded under revision 5 replays with the labels they had then', [v[0].hp, v[1].less]);
		S.players[0].hand = [byName('Professor Turo')];
		A((refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 1) } })) === null) === (rules < 6), rules >= 6 ? 'Professor Turo does not take that Miraidon' : 'and under revision 5 Professor Turo still takes it');
	}
}

//// ===== 31. Ruler of the Skies (B4): each new effect, played =====
{
	const rs = name => { const c = CARDS.find(x => x.set === 'B4' && x.name === name) || CARDS.find(x => x.name === name); if (!c) throw new Error('no card ' + name); return c.id; };
	const cape = CARDS.find(x => x.name === 'Giant Cape').id, ecape = CARDS.find(x => x.name === 'Elegant Cape').id;
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const G = (S, seat, zone, idx, name, o) => putId(S, seat, zone, idx, rs(name), o);
	const dmgs = S => S.log.filter(e => e.k === 'damage').map(e => e.msg);
	const foe = S => { const k = put(S, 1, 'active', 0, 'Snorlax', { tool: cape }); put(S, 1, 'bench', 0, 'Snorlax'); return k; };
	const coin = (S, re) => S.log.filter(e => e.k === 'coin' && re.test(e.msg));
	const T0 = { target: L(1, 'active', 0) };
	const base = (S, n, i = 0) => new RegExp('base ' + n + '\\b').test(dmgs(S)[i] || '');
	const N = (t, n) => Array(n).fill(t);
	const nm = k => card(k.cards[k.cards.length - 1]).name;
	let S, x, y, z;

	// --- the data ---
	{ const recs = JSON.parse(fs.readFileSync(path.join(ROOT, 'pocketenhanced/data/source/alt_b4.json'), 'utf8')).cards, mine = CARDS.filter(c => c.set === 'B4');
		A(recs.length === 233 && mine.length === 155 && mine.filter(c => c.points === 3).map(c => c.name).sort().join() === 'Mega Gallade ex,Mega Metagross ex,Mega Rayquaza ex,Mega Sharpedo ex' && card(rs('Hoopa ex')).combatTypes.join() === 'Psychic,Dark' && card(rs('Hoopa')).combatTypes.join() === 'Psychic,Ghost' && card(rs('Dragonair')).ability.fx.type === 'Dragon' && recs.every(c => !c.description && !c.illustrator && !c.image),
			'Ruler of the Skies: 233 printings add 155 gameplay cards; four new Mega Evolution Pokémon ex; Hoopa ex on its Darkness card fights as Hoopa Unbound', [recs.length, mine.length]); }

	// --- attacks ---
	S = arena(2); x = G(S, 0, 'active', 0, 'Cradily', { energy: N('Grass', 2), dmg: 50 }); y = foe(S);
	exec(S, { attack: 0, ...T0 }); A(x.dmg === 20 && y.fx.some(f => f.k === 'cantRetreat'), 'Stick and Absorb heals 30 from Cradily, and its target cannot retreat on its owner\'s next turn');
	S = arena(2); G(S, 0, 'active', 0, 'Vespiquen ex', { energy: N('Grass', 2) }); G(S, 0, 'bench', 0, 'Kricketune'); G(S, 0, 'bench', 1, 'Combee'); G(S, 0, 'bench', 2, 'Combee'); foe(S); S.players[0].discard = [];
	exec(S, { attack: 0, ...T0, args: { discard: [0, 1, 2] } });
	A(base(S, 140) && S.players[0].bench[0] && !S.players[0].bench[1] && S.players[0].bench[2] && S.players[0].discard.join() === rs('Combee'), 'Chase Order: discarding 1 Benched Basic Grass Pokémon adds 70 (one only; a Stage 1 is not taken)');
	S = arena(2); x = G(S, 0, 'active', 0, 'Accelgor', { energy: N('Fire', 2), tool: cape }); put(S, 0, 'bench', 0, 'Snorlax'); y = foe(S); S.players[0].deck = [];
	exec(S, { attack: 0, ...T0 });
	A(!!y.status.poisoned && !!y.status.paralyzed && S.players[0].deck.includes(rs('Accelgor')) && S.players[0].deck.includes(cape) && !S.players[0].active.includes(x), 'Deck and Cover Poisons and Paralyzes its target, then Accelgor and all its cards are shuffled into the deck');
	for (const pts of [0, 1]) { S = arena(2); G(S, 0, 'active', 0, 'Pheromosa', { energy: N('Grass', 2) }); foe(S); S.players[0].points = pts; exec(S, { attack: 0, ...T0 }); A(base(S, pts ? 30 : 90), pts ? 'and 30 once they have a point' : 'Prelude does 30 + 60 while its player has no points'); }
	S = arena(2); G(S, 0, 'active', 0, 'Teal Mask Ogerpon', { energy: N('Grass', 3), dmg: 20 }); foe(S);
	exec(S, { attack: 0, ...T0 }); A(base(S, card(rs('Teal Mask Ogerpon')).hp - 20), 'Ogre\'s Whip does damage equal to Ogerpon\'s remaining HP');
	S = arena(2); x = G(S, 0, 'active', 0, 'Psyduck', { energy: ['Fire'] }); y = foe(S);
	exec(S, { attack: 0, ...T0 }); { const h = coin(S, /Migraine/)[0].heads; A(!!y.status.confused === h && !!x.status.confused === !h, 'Migraine: heads Confuses its target, tails Confuses Psyduck', h); }
	S = arena(2); x = G(S, 0, 'active', 0, 'Wailord ex', { energy: N('Water', 4), status: { poisoned: { by: 1 }, burned: { by: 1 } } }); foe(S);
	exec(S, { attack: 0, ...T0 }); A(!Object.keys(x.status).length && x.dmg === 0, 'Wondrous Waves: Wailord ex recovers from all Special Conditions', x.status);
	S = arena(2); x = G(S, 0, 'active', 0, 'Kyogre', { energy: N('Water', 4) }); y = foe(S);
	exec(S, { attack: 0, ...T0 }); A(x.energy.length === 1 && y.dmg === 50 && S.players[1].bench[0].dmg === 50, 'Tidal Blast discards 3 Water Energy and does 50 to each of its target\'s owner\'s Pokémon');
	S = arena(2); G(S, 0, 'active', 0, 'Alomomola', { energy: N('Water', 2), dmg: 30 }); x = put(S, 0, 'bench', 0, 'Snorlax', { dmg: 30 }); foe(S);
	exec(S, { attack: 0, ...T0 }); A(x.dmg === 20 && S.players[0].active[0].dmg === 30, 'Mineral Pump heals 10 from each of its player\'s Benched Pokémon');
	S = arena(2); G(S, 0, 'active', 0, 'Luxray', { energy: N('Lightning', 3) }); foe(S); S.players[1].points = 1;
	exec(S, { attack: 0, ...T0 }); A(base(S, 130), 'Revenge Blast does 80 + 50 for each point its target\'s owner has gotten');
	S = arena(2); G(S, 0, 'active', 0, 'Pachirisu', { energy: ['Lightning'] }); foe(S); S.players[0].deck = [id('Potion'), id('Bulbasaur')];
	exec(S, { attack: 0, ...T0 }); A(base(S, 50) && S.players[0].discard.includes(id('Potion')), 'Crackling Snap discards the top card of the deck: 30 + 20 when it is an Item');
	S = arena(2); G(S, 0, 'active', 0, 'Rotom ex', { energy: N('Lightning', 2) }); foe(S); S.players[0].discard = [id('Potion'), id('Potion'), id('Giovanni'), id('Bulbasaur'), id('Poké Ball')];
	exec(S, { attack: 0, ...T0 }); A(base(S, 60), 'Junk Spark does 30 + 10 for each Item card in its player\'s discard pile (3)');
	S = arena(2); G(S, 0, 'active', 0, 'Eelektross', { energy: N('Lightning', 2) }); x = foe(S); x.energy = N('Fire', 2); S.players[1].bench[0].energy = ['Fire'];
	exec(S, { attack: 0, ...T0 }); A(base(S, 110), 'Energy Crush does 50 + 20 for each Energy on all its target\'s owner\'s Pokémon (3)');
	S = arena(2); G(S, 0, 'active', 0, 'Mr. Mime', { energy: ['Psychic', 'Fire'] }); x = foe(S); x.energy = N('Fire', 2);
	exec(S, { attack: 0, ...T0 }); A(base(S, 80), 'Synchro Dance does 40 + 40 when it and its target have the same amount of Energy');
	S = arena(2); G(S, 0, 'active', 0, 'Chimecho', { energy: ['Psychic', 'Fire'] }); foe(S); S.players[0].hand = [id('Potion'), id('Potion')]; S.players[1].hand = [id('Potion'), id('Potion')];
	exec(S, { attack: 0, ...T0 }); A(base(S, 80), 'Extrasensory does 40 + 40 when both players hold the same number of cards');
	S = arena(2); G(S, 0, 'active', 0, 'Hoopa', { energy: ['Fire'] }); x = foe(S); S.players[1].bench[0].tool = ecape; S.players[1].deck = [];
	exec(S, { attack: 0, ...T0 }); A(!x.tool && !S.players[1].bench[0].tool && [...S.players[1].deck, ...S.players[1].hand].filter(i => i === cape || i === ecape).length === 2 && !S.players[1].discard.includes(cape), 'Mischievous Ring shuffles every Pokémon Tool of its target\'s owner\'s Pokémon into their deck, before its damage');
	S = arena(2); x = G(S, 0, 'active', 0, 'Armaldo', { energy: ['Fighting', 'Fire', 'Fire'] }); y = foe(S);
	exec(S, { attack: 0, ...T0 }); A(x.energy.length === 0 && y.dmg === 0 && E.view(S, 0).spots.length === 1, 'Abyssal Drop discards all Armaldo\'s Energy and marks a spot');
	exec(S); A(S.players[0].points === 1 && !S.players[1].active.includes(y), 'at the end of that player\'s next turn the Pokémon in that spot is Knocked Out');
	S = arena(2); G(S, 0, 'active', 0, 'Poochyena', { energy: ['Darkness'] }); G(S, 0, 'bench', 0, 'Poochyena'); foe(S); S.players[0].hand = []; S.players[0].deck = N(id('Potion'), 5);
	exec(S, { attack: 0, ...T0 }); A(S.players[0].hand.length === 2, 'Team Hunt draws a card for each Poochyena its player has in play (2)');
	S = arena(2); G(S, 0, 'active', 0, 'Swalot', { energy: ['Darkness', 'Fire'] }); put(S, 1, 'active', 0, 'Bulbasaur', { tool: cape }); put(S, 1, 'active', 1, 'Snorlax'); G(S, 0, 'active', 1, 'Swalot', { energy: ['Darkness', 'Fire'], dmg: 100 });
	exec(S, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) }); A(base(S, 110) && base(S, 30, 1), 'Swallow Up does 30 + 80 into a Pokémon with less remaining HP than Swalot, and 30 otherwise', dmgs(S));
	S = arena(2); x = G(S, 0, 'active', 0, 'Mega Rayquaza ex', { energy: ['Fire', 'Lightning', 'Fire', 'Water'] }); foe(S);
	exec(S, { attack: 0, ...T0 }); A(base(S, 150) && x.energy.join() === 'Water', 'Mega Burst discards all its Fire and Lightning Energy: 50 for each (3)');
	S = arena(2); x = G(S, 0, 'active', 0, 'Delcatty', { energy: N('Fire', 2) }); y = put(S, 0, 'bench', 0, 'Snorlax', { energy: ['Water', 'Grass'] }); foe(S);
	exec(S, { attack: 0, ...T0, args: { moves: [[L(0, 'bench', 0), 'Water', L(0, 'active', 0)], [L(0, 'active', 0), 'Fire', L(0, 'bench', 0)], [L(1, 'active', 0), 'Fire', L(0, 'bench', 0)], [L(0, 'bench', 0), 'Metal', L(0, 'active', 0)]] } });
	A(x.energy.slice().sort().join() === 'Fire,Water' && y.energy.slice().sort().join() === 'Fire,Grass', 'Energy Blender moves Energy among its player\'s Pokémon as they chose (a move that is not theirs to make is skipped)', [x.energy, y.energy]);

	// --- Abilities ---
	S = arena(2); G(S, 0, 'active', 0, 'Dustox'); x = foe(S); x.status = { poisoned: { by: 0 } };
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { target: L(1, 'active', 0) } });
	A(!!x.status.poisoned && (!!x.status.burned || !!x.status.confused), 'Variety Powder: one of Burned, Confused and Poisoned that does not already affect it, at random', Object.keys(x.status));
	S = arena(2); x = G(S, 0, 'active', 0, 'Cradily', { dmg: 30 }); foe(S); S.players[0].hand = [rs('Poltchageist')];
	E.apply(S, { t: 'playBasic', seat: 0, hand: 0, to: { zone: 'bench', idx: 0 } }); E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(!S.pending && x.dmg === 10, 'Hospitality: put onto the Bench from the hand, Poltchageist heals 20 from an Active Grass Pokémon');
	S = arena(2); x = G(S, 0, 'active', 0, 'Dewott'); put(S, 1, 'active', 0, 'Snorlax', { energy: N('Fire', 4) }); S.players[0].hand = [rs('Samurott')];
	E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) }); E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	exec(S); exec(S, { attack: card(id('Snorlax')).attacks.length - 1, target: L(0, 'active', 0) });
	A(x.dmg === 0 && /prevented/.test(dmgs(S)[0]), 'Stance: evolved from the hand, Samurott takes nothing from opposing attacks until its player\'s next turn', dmgs(S));
	exec(S); exec(S, { attack: card(id('Snorlax')).attacks.length - 1, target: L(0, 'active', 0) }); A(x.dmg > 0, 'and takes damage again after that');
	S = arena(2); G(S, 0, 'active', 0, 'Pikachu'); x = foe(S); S.players[0].hand = [rs('Raichu')];
	E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) }); E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(coin(S, /Evoshock/).length === 1 && !!x.status.paralyzed === coin(S, /Evoshock/)[0].heads, 'Evoshock: evolved from the hand, Raichu flips a coin; heads Paralyzes an opposing Active Pokémon');
	S = arena(2); G(S, 0, 'active', 0, 'Beldum'); foe(S);
	{ const r0 = E.view(S, 0).players[0].active[0].retreat; G(S, 0, 'bench', 0, 'Beldum'); const r1 = E.view(S, 0).players[0].active[0].retreat; A(r0 === 2 && r1 === 0, 'Conductive Body: with another Beldum in play, Beldum retreats for 2 less', [r0, r1]); }
	S = arena(2); x = G(S, 0, 'active', 0, 'Revavroom'); y = put(S, 0, 'bench', 0, 'Snorlax'); z = foe(S); S.players[0].hand = [cape, ecape, cape, cape, rs('Field Blower') === undefined ? cape : cape];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } }); E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } });
	A(x.tool === cape && x.tool2 === ecape && E.view(S, 0).players[0].active[0].hp === card(rs('Revavroom')).hp + 50 && E.view(S, 1).players[0].active[0].tool2 === ecape, 'Dual Customization: Revavroom holds two Pokémon Tools, and both work (Giant Cape +20 HP, Elegant Cape +30 HP)', [x.tool, x.tool2]);
	A(/already has 2/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } })) || ''), 'a third is refused');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'bench', 0) } });
	A(/already has a Pokémon Tool/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'bench', 0) } })) || ''), 'another Pokémon still holds one only');
	S.players[0].hand = [CARDS.find(c => c.name === 'Field Blower').id, CARDS.find(c => c.name === 'Elesa').id]; x.dmg = card(rs('Revavroom')).hp + 10;
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { target: L(0, 'active', 0), which: 1 } });
	A(x.tool === cape && !x.tool2 && S.players[0].discard.includes(ecape) && S.players[0].active[0] === x, 'Field Blower discards the one chosen (the other stays, and its HP still holds Revavroom up)');
	x.tool2 = ecape; x.dmg = 0; E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(!x.tool && !x.tool2 && S.players[0].hand.filter(i => i === cape || i === ecape).length === 3, 'Elesa returns both of them to the hand');
	S = arena(2); x = G(S, 0, 'active', 0, 'Rayquaza'); put(S, 0, 'active', 1, 'Snorlax'); G(S, 0, 'bench', 0, 'Dragonair'); foe(S); S.players[0].energyDiscard = ['Fire', 'Water'];
	A(/Dragon/.test(refused(() => E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { slot: 1, type: 'Water' } })) || ''), 'Dragon\'s Blessing gives only to an Active Dragon Pokémon');
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'bench', 0), args: { slot: 0, type: 'Water' } });
	A(x.energy.join() === 'Water' && S.players[0].energyDiscard.join() === 'Fire', 'from the Bench, Dragonair attaches the chosen Energy from the discard pile to it');
	S = arena(2); G(S, 0, 'active', 0, 'Rattata'); foe(S); S.players[0].hand = [rs('Raticate')]; S.players[0].deck = [id('Potion'), id('Bulbasaur'), id('Poké Ball'), id('Giovanni'), id('Potion')];
	E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) }); E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(S.players[0].hand.slice().sort().join() === [id('Potion'), id('Poké Ball')].sort().join() && S.players[0].deck.length === 3, 'Treasure Collecting: evolved from the hand, Raticate takes the Item cards among the top 4 cards of the deck');

	// --- Trainers ---
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [rs('Order Pad')]; S.players[0].deck = [id('Bulbasaur'), id('Potion'), id('Giovanni')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.players[0].hand.length === (coin(S, /Order Pad/)[0].heads ? 1 : 0) && S.players[0].hand.every(i => i === id('Potion')), 'Order Pad: heads puts a random Item card from the deck into the hand');
	S = arena(2); G(S, 0, 'active', 0, 'Poochyena', { tool: rs('Deceptive Needle') }); put(S, 0, 'active', 1, 'Snorlax', { tool: rs('Deceptive Needle') }); x = foe(S);
	exec(S); A(x.dmg === 10, 'Deceptive Needle: at the end of its player\'s turn, 10 to an opposing Active Pokémon when its holder is an Active Darkness Pokémon (not from another type\'s)');
	S = arena(2); G(S, 0, 'active', 0, 'Swoobat', { energy: ['Psychic'] }); G(S, 0, 'active', 1, 'Swoobat', { energy: ['Psychic'] }); x = put(S, 1, 'active', 0, 'Snorlax', { tool: rs('Clear Veil') }); y = put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) });
	A(x.dmg === 40 && !x.status.confused && !!y.status.confused, 'Clear Veil: an opposing attack\'s effects do not reach its holder (its damage does)');
	S = arena(2); G(S, 0, 'active', 0, 'Mewtwo'); x = foe(S); y = S.players[1].bench[0]; y.energy = ['Fire']; S.players[0].hand = [rs('Psychic')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { target: L(1, 'active', 0), bench: 0 } });
	A(x.energy.join() === 'Fire' && y.energy.length === 0, 'Psychic (the Supporter): with a Pokémon that has the Psychic attack in an Active slot, a random Energy moves from an opponent\'s Benched Pokémon to their Active Pokémon');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[1].bench[0].energy = ['Fire']; S.players[0].hand = [rs('Psychic')];
	A(/Psychic attack/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { target: L(1, 'active', 0), bench: 0 } })) || ''), 'and cannot be played without one');
	for (const dray of [true, false]) {
		S = arena(2); G(S, 0, 'active', 0, 'Noivern', { energy: ['Psychic', 'Darkness', 'Darkness'] }); x = put(S, 1, 'active', 0, 'Snorlax', { tool: cape }); x.dmg = 0; S.players[1].active[0] = putId(S, 1, 'active', 0, id('Snorlax'), { tool: cape }); S.players[0].hand = [rs('Drayden')];
		S.players[1].active[0].dmg = -600;   // (it stands through every hit, so each one is counted)
		if (dray) E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
		exec(S, { attack: 0, ...T0 }); A(dmgs(S).length === (dray ? 4 : 3), dray ? 'Drayden: Draco Meteor chooses 1 more time this turn (4)' : 'without him it chooses 3 times');
	}
	S = arena(2); x = G(S, 0, 'active', 0, 'Raichu'); put(S, 0, 'active', 1, 'Snorlax'); y = put(S, 0, 'bench', 0, 'Snorlax'); foe(S); S.players[0].hand = [rs('Skyla'), rs('Skyla')];
	A(/Stage 1/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { slot: 1, bench: 0 } })) || ''), 'Skyla switches only a Stage 1 Pokémon out');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { slot: 0, bench: 0 } }); A(S.players[0].active[0] === y && S.players[0].bench[0] === x, 'she switches it with a Benched Pokémon');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); x = G(S, 0, 'bench', 0, 'Luxray'); foe(S); S.players[0].hand = [rs('Wally'), rs('Wally')];
	A(/Stage 2/.test(refused(() => E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'active', 0) } })) || ''), 'Wally gives only to a Stage 2 Pokémon');
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { at: L(0, 'bench', 0) } }); A(x.energy.join() === 'Colorless', 'he attaches a Colorless Energy from the Energy Zone to it');
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax', { dmg: 50, energy: ['Water'] }); y = put(S, 0, 'bench', 0, 'Snorlax', { dmg: 50, energy: ['Fire'] }); z = foe(S); z.dmg = 50; z.energy = ['Water']; S.stadium = { id: rs('Soothing Shore'), seat: 1 };
	exec(S); A(x.dmg === 30 && y.dmg === 50 && z.dmg === 50, 'Soothing Shore: at the end of a player\'s turn, each of their Pokémon with a Water Energy heals 20');
	exec(S); A(z.dmg === 30, 'and the other player\'s at the end of theirs');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.stadium = { id: rs('Rainbow Cave'), seat: 1 }; S.players[0].zone = { cur: 'Fire', next: 'Water' };
	E.apply(S, { t: 'stadium', seat: 0 });
	A(S.players[0].zone.cur === 'Water' && S.players[0].zone.next != null && /already used/.test(refused(() => E.apply(S, { t: 'stadium', seat: 0 })) || ''), 'Rainbow Cave: once a turn, the Energy in the Energy Zone is discarded and the next one is produced');

	// --- the computer player ---
	{
		const Nn = n => rs(n), two = l => l.flatMap(v => [v, v]);
		const decks = [{ deck: two([Nn('Wurmple'), Nn('Silcoon'), Nn('Beautifly'), Nn('Cascoon'), Nn('Dustox'), Nn('Combee'), Nn('Vespiquen ex'), Nn('Poltchageist'), Nn('Sinistcha'), Nn('Pheromosa')]), energy: ['Grass'] },
			{ deck: two([Nn('Carvanha'), Nn('Mega Sharpedo ex'), Nn('Oshawott'), Nn('Dewott'), Nn('Samurott'), Nn('Kyogre'), Nn('Alomomola'), Nn('Psyduck'), Nn('Soothing Shore'), Nn('Wally')]), energy: ['Water'] },
			{ deck: two([Nn('Pikachu'), Nn('Raichu'), Nn('Shinx'), Nn('Luxio'), Nn('Luxray'), Nn('Rotom ex'), Nn('Pachirisu'), Nn('Order Pad'), Nn('Rainbow Cave'), Nn('Wally')]), energy: ['Lightning'] },
			{ deck: two([Nn('Mewtwo'), Nn('Drowzee'), Nn('Hypno'), Nn('Mr. Mime'), Nn('Chimecho'), Nn('Hoopa'), Nn('Swoobat'), Nn('Woobat'), Nn('Psychic'), Nn('Clear Veil')]), energy: ['Psychic'] },
			{ deck: two([Nn('Poochyena'), Nn('Mightyena'), Nn('Gulpin'), Nn('Swalot'), Nn('Hoopa ex'), Nn('Absol'), Nn('Vullaby'), Nn('Mandibuzz'), Nn('Deceptive Needle'), Nn('Skyla')]), energy: ['Darkness'] },
			{ deck: two([Nn('Beldum'), Nn('Metang'), Nn('Mega Metagross ex'), Nn('Varoom'), Nn('Revavroom'), Nn('Genesect'), Nn('Mawile'), 'A2-147', Nn('Clear Veil'), Nn('Deceptive Needle')]), energy: ['Metal'] },
			{ deck: two([Nn('Dratini'), Nn('Dragonair'), Nn('Dragonite'), Nn('Mega Rayquaza ex'), Nn('Noibat'), Nn('Noivern'), Nn('Drayden'), Nn('Rattata'), Nn('Raticate'), Nn('Delcatty') ]), energy: ['Fire', 'Lightning', 'Water'] }];
		decks[5].deck = decks[5].deck.map(i => (i === 'A2-147' ? cape : i)); decks[6].deck[decks[6].deck.indexOf(Nn('Delcatty'))] = Nn('Skitty');
		A(decks.every(d => E.deckError(d.deck, d.energy) === null), 'seven Ruler of the Skies decks are legal', decks.map(d => E.deckError(d.deck, d.energy)));
		const bad = []; let over = 0, two2 = 0; const played = new Set();
		for (let g = 0; g < 28; g++) {
			const config = { seed: 'skies' + g, rules: E.RULES, players: [0, 1, 2, 3].slice(0, 2 + (g % 3)).map(i => ({ name: 'P' + i, ai: true, ...decks[(i + g) % 7] })) }, S2 = E.createGame(config), actions = [];
			try {
				for (let step = 0; step < 5000 && !S2.over; step++) {
					const seat = S2.pending ? S2.pending.seat : S2.phase === 'setup' ? S2.players.find(p => !p.setup).seat : S2.current, banned = new Set();
					let done = false;
					for (let t = 0; t < 40 && !done; t++) { const a = nextAction(E.view(S2, seat), banned) || { t: 'execute', seat, commands: [null, null] }; try { if (a.t === 'trainer') played.add(card(S2.players[seat].hand[a.hand]).name); E.apply(S2, a); actions.push(a); done = true; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); } }
					if (!done) { bad.push(g + ': stuck'); break; }
					if (S2.players.some(p => [...p.active, ...p.bench].some(k => k && k.tool2))) two2++;
				}
				if (S2.over) over++;
				if (E.digest(E.replay(config, actions)) !== E.digest(S2)) bad.push(g + ': replay differs');
				if (E.view(S2, 0).players.some(p => [...p.active, ...p.bench].filter(Boolean).some(k => k.dmg >= k.hp))) bad.push(g + ': a knocked out Pokémon is still in play');
				for (const p of S2.players) { const total = p.deck.length + p.hand.length + p.discard.length + [...p.active, ...p.bench].filter(Boolean).reduce((a, k) => a + k.cards.length + (k.tool ? 1 : 0) + (k.tool2 ? 1 : 0), 0) + (S2.stadium && S2.stadium.seat === p.seat ? 1 : 0); if (total !== 20) bad.push(`${g}: ${p.name} has ${total} cards`); }
			} catch (e) { bad.push(g + ': ' + e.message); }
		}
		A(over === 28 && bad.length === 0 && two2 > 0 && played.has('Wally') && played.has('Order Pad') && played.has('Soothing Shore'), 'computer players finish 28 matches with Ruler of the Skies decks (2, 3 and 4 players; a Revavroom held two Tools): every replay matches and every card is accounted for', { over, two2, played: [...played].join(), bad: bad.slice(0, 4) });
	}
}

////// ===== 32. Team Rocket's Ambition (B4a): each new effect, played =====
{
	const tr = name => { const c = CARDS.find(x => x.set === 'B4a' && x.name === name) || CARDS.find(x => x.name === name); if (!c) throw new Error('no card ' + name); return c.id; };
	const cape = CARDS.find(x => x.name === 'Giant Cape').id;
	const putId = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
	const G = (S, seat, zone, idx, name, o) => putId(S, seat, zone, idx, tr(name), o);
	const dmgs = S => S.log.filter(e => e.k === 'damage').map(e => e.msg);
	const foe = S => { const k = put(S, 1, 'active', 0, 'Snorlax', { tool: cape }); put(S, 1, 'bench', 0, 'Snorlax'); return k; };
	const coin = (S, re) => S.log.filter(e => e.k === 'coin' && re.test(e.msg));
	const T0 = { target: L(1, 'active', 0) };
	const base = (S, n, i = 0) => new RegExp('base ' + n + '\\b').test(dmgs(S)[i] || '');
	const N = (t, n) => Array(n).fill(t);
	const R = "Team Rocket's ";
	let S, x, y, z;

	// --- the data ---
	{ const recs = JSON.parse(fs.readFileSync(path.join(ROOT, 'pocketenhanced/data/source/alt_b4a.json'), 'utf8')).cards, mine = CARDS.filter(c => c.set === 'B4a');
		A(recs.length === 110 && mine.length === 72 && card(tr(R + 'Moltres ex')).combatTypes.join() === 'Fire,Flying' && card(tr(R + 'Moltres ex')).dex === 146 && card(tr('Hisuian Basculegion')).combatTypes.join() === 'Water,Ghost' && card(tr('Regidrago')).attacks[0].damage === 140 && card(tr('Regidrago')).attacks[0].damageMode === '-' && recs.every(c => !c.description && !c.illustrator && !c.image),
			'Team Rocket\'s Ambition: 110 printings add 72 gameplay cards; a "Team Rocket\'s" Pokémon is its species; Draconic Slam\'s "140-" is read as 140 with an effect that takes damage off', [recs.length, mine.length]); }

	// --- attacks ---
	S = arena(2); G(S, 0, 'active', 0, R + 'Magmar', { energy: ['Fire'] }); x = foe(S); x.status = { poisoned: { by: 0 }, burned: { by: 0 } };
	exec(S, { attack: 0, ...T0 }); A(base(S, 110), 'Derisive Roasting does 10 + 50 for each Special Condition on its target (2)');
	S = arena(2); x = G(S, 0, 'active', 0, R + 'Moltres ex', { energy: ['Fire'] }); foe(S);
	exec(S, { attack: 0, ...T0 }); A(coin(S, /Heat Charged/).length === 3 && x.energy.length === 1 + coin(S, /Heat Charged/).filter(e => e.heads).length, 'Heat Charged flips 3 coins: a Fire Energy from the Energy Zone for each heads');
	S = arena(2); G(S, 0, 'active', 0, R + 'Zapdos ex', { energy: N('Lightning', 3) }); foe(S); S.players[1].bench[0].dmg = 0; y = put(S, 1, 'bench', 1, 'Snorlax', { dmg: 10 });
	exec(S, { attack: 1, ...T0, args: { also: L(1, 'bench', 0) } }); A(y.dmg === 60 && S.players[1].bench[0].dmg === 0, 'Thunderclaw also does 50 to a Benched Pokémon that has damage on it (an undamaged one that was chosen is not hit)');
	S = arena(2); G(S, 0, 'active', 0, R + 'Slowpoke', { energy: ['Psychic'] }); foe(S); S.players[0].hand = []; S.players[0].discard = [id('Bulbasaur'), id('Potion'), id('Giovanni')];
	exec(S, { attack: 0, ...T0 }); A(S.players[0].hand.join() === id('Potion'), 'Scavenge puts a random Item card from its player\'s discard pile into their hand');
	S = arena(2); G(S, 0, 'active', 0, R + 'Slowking ex', { energy: ['Psychic', 'Fire'] }); foe(S); S.players[0].hand = N(id('Potion'), 4);
	exec(S, { attack: 0, ...T0 }); A(base(S, 80), 'Hand Kinesis does 20 for each card in its player\'s hand (4)');
	S = arena(2); G(S, 0, 'active', 0, 'Marowak', { energy: ['Fighting', 'Fire'] }); G(S, 0, 'active', 1, 'Marowak', { energy: ['Fighting', 'Fire'] }); G(S, 1, 'active', 0, R + 'Lapras', { tool: cape }); put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: 0, ...T0 }, { attack: 0, target: L(1, 'active', 1) }); A(base(S, 120) && base(S, 50, 1), 'Punish does 50 + 70 into a Pokémon with "Team Rocket" in its name');
	S = arena(2); x = G(S, 0, 'active', 0, R + 'Muk', { energy: N('Darkness', 3), dmg: 70 }); y = foe(S); y.status = { poisoned: { by: 0 } };
	exec(S, { attack: 0, ...T0 }); A(x.dmg === 10, 'Poison Absorption heals 60 from Muk when its target is Poisoned');
	for (const hurt of [false, true]) { S = arena(2); G(S, 0, 'active', 0, 'Regidrago', { energy: ['Grass', 'Fire', 'Fire'], dmg: hurt ? 10 : 0 }); foe(S); exec(S, { attack: 0, ...T0 }); A(base(S, hurt ? 40 : 140), hurt ? 'and 140 - 100 with damage on it' : 'Draconic Slam does 140 while Regidrago has no damage on it'); }
	S = arena(2); G(S, 0, 'active', 0, 'Hisuian Basculegion', { energy: N('Water', 2) }); foe(S); S.players[1].lastTurnPts = 2;
	exec(S, { attack: 0, ...T0 }); A(base(S, 150), 'Soul Counter does 50 + 50 for each point its target\'s owner got during their last turn (2)');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax', { energy: N('Fire', 4) }); put(S, 1, 'active', 0, 'Bulbasaur', { dmg: 60 }); put(S, 1, 'active', 1, 'Snorlax');
	exec(S, { attack: card(id('Snorlax')).attacks.length - 1, ...T0 }); A(S.players[0].lastTurnPts === 1, 'a point taken during a player\'s own turn is counted for it');
	exec(S); exec(S); A(S.players[0].lastTurnPts === 0, 'and a turn with no point counts none');
	S = arena(2); G(S, 0, 'active', 0, R + 'Hypno', { energy: N('Psychic', 2) }); x = foe(S); y = S.players[1].bench[0];
	exec(S, { attack: 0, ...T0 }); A(S.players[1].active[0] === y && y.dmg > 0, 'Entrap pulls a Benched Pokémon into its target\'s slot and does 50 to it');

	// --- Abilities ---
	S = arena(2); G(S, 0, 'active', 0, R + 'Slowking ex'); foe(S); S.players[0].hand = []; S.players[0].deck = N(id('Potion'), 3);
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: {} }); A(S.players[0].hand.length === 1, 'Evil Inspiration (in an Active slot) draws a card');
	S = arena(2); G(S, 0, 'active', 0, R + 'Koffing'); x = foe(S); S.players[0].hand = [tr(R + 'Weezing ex')];
	E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) }); E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(!!x.status.poisoned && !!x.status.burned, 'Boiler Smog: evolved from the hand, Weezing ex may make an opposing Active Pokémon Poisoned and Burned');
	S = arena(2); x = G(S, 0, 'active', 0, R + 'Rattata'); y = foe(S); y.energy = ['Fire']; S.players[0].hand = [tr(R + 'Raticate ex')];
	E.apply(S, { t: 'evolve', seat: 0, hand: 0, at: L(0, 'active', 0) }); E.apply(S, { t: 'choose', seat: 0, pick: 1 });
	A(x.energy.join() === 'Fire' && y.energy.length === 0, 'Thieving Incisors: evolved from the hand, Raticate ex may take a random Energy from an opposing Active Pokémon');
	S = arena(2); G(S, 0, 'active', 0, R + 'Kecleon'); foe(S); S.players[1].hand = [id('Giovanni')];
	E.apply(S, { t: 'ability', seat: 0, at: L(0, 'active', 0), args: { opp: 1 } });
	A(S.log.some(e => e.privateTo === 0 && /holds Giovanni/.test(e.privateMsg || '')) && !E.view(S, 1).log.some(e => /holds Giovanni/.test(e.msg)), 'Spy Ops shows its player (only) a random card from an opponent\'s hand');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); G(S, 0, 'bench', 0, 'Gholdengo'); foe(S); S.players[0].hand = [tr(R + 'Researcher'), tr(R + 'Researcher')]; S.players[0].deck = [tr(R + 'Meowth'), tr(R + 'Rattata'), tr(R + 'Ekans'), id('Potion'), id('Bulbasaur'), tr(R + 'Lapras')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} });
	A(S.pending && S.pending.kind === 'confirm' && E.view(S, 0).pending.flips.length >= 1, 'Luxury Coin: after a Trainer card of its player flips coins, they are asked whether to flip again');
	{ const n1 = coin(S, /Researcher/).length; E.apply(S, { t: 'choose', seat: 0, pick: 1 }); const all = coin(S, /Researcher/), second = all.slice(n1), h2 = second.filter(e => e.heads).length;
		A(!S.pending && S.log.some(e => /uses Luxury Coin/.test(e.msg)) && second.length === h2 + 1 && S.players[0].hand.filter(i => card(i).name.includes('Team Rocket') && card(i).kind === 'pokemon').length === Math.min(h2, 4) && S.players[0].hand.filter(i => i === tr(R + 'Researcher')).length === 1, 'saying yes ignores those results and flips again: Team Rocket\'s Researcher takes a "Team Rocket" Pokémon for each heads of the new flips', [n1, h2, S.players[0].hand.length]);
		S.players[0].hand = [tr('Order Pad')]; S.players[0].deck.push(id('Potion')); E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: {} }); A(!S.pending && coin(S, /Order Pad/).length === 1, 'it is offered once a turn: the coin of a second card stands'); }

	// --- Trainers ---
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [tr(R + 'Thieving Machine')]; S.players[1].discard = [id('Bulbasaur'), tr(R + 'Thieving Machine'), id('Potion')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 1 } });
	A(S.players[0].hand.join() === id('Potion') && S.players[1].discard.length === 2, 'Team Rocket\'s Thieving Machine takes a random Item (not another Thieving Machine) from an opponent\'s discard pile');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [tr(R + 'Goo-zooka')];
	{ const r0 = E.view(S, 0).players[1].active[0].retreat; E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 1 } }); const r1 = E.view(S, 0).players[1].active[0].retreat, rb = E.view(S, 0).players[1].bench[0].retreat; exec(S); const r2 = E.view(S, 0).players[1].active[0].retreat; exec(S); const r3 = E.view(S, 0).players[1].active[0].retreat;
		A(r1 === r0 + 1 && r2 === r0 + 1 && r3 === r0 && rb === r0, 'Team Rocket\'s Goo-zooka: that player\'s Active Pokémon retreat for 1 more until the end of their next turn', [r0, r1, r2, r3]); }
	S = arena(2); x = put(S, 0, 'active', 0, 'Snorlax'); y = foe(S); S.players[0].hand = [tr(R + 'Master Plan')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { target: L(1, 'active', 0) } });
	A(!!y.status.confused && !!x.status.confused === !coin(S, /Master Plan/)[0].heads, 'Team Rocket\'s Master Plan Confuses an opposing Active Pokémon; on tails one of its player\'s too');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.players[0].hand = [tr(R + 'Boss')]; S.players[1].hand = [id('Potion'), id('Bulbasaur'), id('Ivysaur'), id('Charmander'), id('Squirtle')];
	E.apply(S, { t: 'trainer', seat: 0, hand: 0, args: { opp: 1 } });
	A(S.pending && S.pending.seat === 0 && S.pending.kind === 'handPick' && S.pending.options.join() === '1,3,4,-1', 'Team Rocket\'s Boss shows its player that hand: the Basic Pokémon in it may be chosen, or Done');
	E.apply(S, { t: 'choose', seat: 0, pick: 1 }); E.apply(S, { t: 'choose', seat: 0, pick: -1 });
	A(!S.pending && S.players[1].hand.length === 4 && S.players[1].bench.filter(Boolean).length === 2 && card(S.players[1].bench[1].cards[0]).name === 'Bulbasaur', 'each one chosen goes onto that player\'s Bench, as many as its player likes');
	S = arena(2); put(S, 0, 'active', 0, 'Snorlax'); foe(S); S.stadium = { id: tr('Arcade'), seat: 1 }; S.players[0].hand = []; S.players[0].deck = N(id('Potion'), 9);
	E.apply(S, { t: 'stadium', seat: 0 });
	A(coin(S, /Arcade/).length === 3 && S.players[0].hand.length === (coin(S, /Arcade/).every(e => e.heads) ? 7 : 0) && /already used/.test(refused(() => E.apply(S, { t: 'stadium', seat: 0 })) || ''), 'Arcade: once a turn a player may flip 3 coins; three heads draws up to 7 cards in hand');

	// --- the computer player ---
	{
		const Nn = n => tr(n), two = l => l.flatMap(v => [v, v]);
		const decks = [{ deck: two([Nn(R + 'Moltres ex'), Nn(R + 'Magmar'), Nn(R + 'Houndour'), Nn(R + 'Houndoom'), Nn('Fennekin'), Nn('Braixen'), Nn('Delphox'), Nn(R + 'Researcher'), Nn('Arcade'), Nn(R + 'Master Plan')]), energy: ['Fire'] },
			{ deck: two([Nn(R + 'Articuno ex'), Nn(R + 'Lapras'), Nn('Hisuian Basculin'), Nn('Hisuian Basculegion'), Nn('Wingull'), Nn('Pelipper'), Nn(R + 'Goo-zooka'), Nn(R + 'Thieving Machine'), Nn(R + 'Boss'), Nn('Arcade')]), energy: ['Water'] },
			{ deck: two([Nn(R + 'Slowpoke'), Nn(R + 'Slowking ex'), Nn(R + 'Drowzee'), Nn(R + 'Hypno'), Nn(R + 'Mewtwo'), Nn('Gimmighoul'), Nn('Gholdengo'), Nn('Oranguru'), Nn(R + 'Researcher'), Nn('Arcade')]), energy: ['Psychic'] },
			{ deck: two([Nn(R + 'Koffing'), Nn(R + 'Weezing ex'), Nn(R + 'Grimer'), Nn(R + 'Muk'), Nn(R + 'Ekans'), Nn(R + 'Arbok'), Nn(R + 'Sneasel'), Nn(R + 'Rattata'), Nn(R + 'Raticate ex'), Nn(R + 'Master Plan')]), energy: ['Darkness'] },
			{ deck: two([Nn(R + 'Zapdos ex'), Nn(R + 'Voltorb'), Nn(R + 'Electrode'), Nn(R + 'Pincurchin'), Nn(R + 'Meowth'), Nn(R + 'Persian'), Nn(R + 'Kecleon'), Nn('Happiny'), Nn(R + 'Thieving Machine'), Nn(R + 'Boss')]), energy: ['Lightning'] },
			{ deck: two([Nn('Gible'), Nn('Gabite'), Nn('Garchomp'), Nn('Regidrago'), Nn('Cubone'), Nn('Marowak'), Nn('Landorus'), Nn('Lechonk'), Nn('Oinkologne'), Nn(R + 'Goo-zooka')]), energy: ['Water', 'Fighting', 'Grass'] }];
		A(decks.every(d => E.deckError(d.deck, d.energy) === null), 'six Team Rocket\'s Ambition decks are legal', decks.map(d => E.deckError(d.deck, d.energy)));
		const bad = []; let over = 0, lux = 0; const played = new Set();
		for (let g = 0; g < 24; g++) {
			const config = { seed: 'rocket' + g, rules: E.RULES, players: [0, 1, 2, 3].slice(0, 2 + (g % 3)).map(i => ({ name: 'P' + i, ai: true, ...decks[(i + g) % 6] })) }, S2 = E.createGame(config), actions = [];
			try {
				for (let step = 0; step < 5000 && !S2.over; step++) {
					const seat = S2.pending ? S2.pending.seat : S2.phase === 'setup' ? S2.players.find(p => !p.setup).seat : S2.current, banned = new Set();
					let done = false;
					for (let t = 0; t < 40 && !done; t++) { const a = nextAction(E.view(S2, seat), banned) || { t: 'execute', seat, commands: [null, null] }; try { if (a.t === 'trainer') played.add(card(S2.players[seat].hand[a.hand]).name); E.apply(S2, a); actions.push(a); done = true; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); } }
					if (!done) { bad.push(g + ': stuck'); break; }
				}
				if (S2.over) over++;
				lux += S2.log.filter(e => /uses Luxury Coin/.test(e.msg)).length;
				if (E.digest(E.replay(config, actions)) !== E.digest(S2)) bad.push(g + ': replay differs');
				if (E.view(S2, 0).players.some(p => [...p.active, ...p.bench].filter(Boolean).some(k => k.dmg >= k.hp))) bad.push(g + ': a knocked out Pokémon is still in play');
				{ const total = S2.players.reduce((n, p) => n + p.deck.length + p.hand.length + p.discard.length + [...p.active, ...p.bench].filter(Boolean).reduce((a, k) => a + k.cards.length + (k.tool ? 1 : 0) + (k.tool2 ? 1 : 0), 0), 0) + (S2.stadium ? 1 : 0); if (total !== 20 * S2.players.length) bad.push(`${g}: ${total} cards in all`); }   // (Thieving Machine moves a card between players: the match's cards are counted together)
			} catch (e) { bad.push(g + ': ' + e.message); }
		}
		A(over === 24 && bad.length === 0 && lux > 0 && played.has(R + 'Researcher') && played.has(R + 'Master Plan') && played.has('Arcade'), 'computer players finish 24 matches with Team Rocket\'s Ambition decks (2, 3 and 4 players; Luxury Coin used ' + lux + ' times): every replay matches and every card is accounted for', { over, lux, played: [...played].join(), bad: bad.slice(0, 4) });
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
