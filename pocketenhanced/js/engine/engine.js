// engine.js — Pocket Enhanced's rules. Pure: no DOM, no clock, no Math.random.
//
// A game is its CONFIG (seed, players, decks, options) and the list of ACTIONS applied to it. Nothing else is state:
// `replay(config, actions)` rebuilds any position, which is what the save, the replay viewer, the spectator view and
// the server referee all use. Because a state is only ever rebuilt that way, it may hold live things (its random
// streams, a paused resolution waiting on a player's choice).
//
//   createGame(config) -> state            apply(state, action) -> state (mutated) or throws Refused
//   refusal(state, action) -> null | why   replay(config, actions, upTo?) -> state
//   view(state, seat|null) -> what that seat may see (null: a spectator: no hands, no decks)
//
// RULES. Pocket's, except where the owner's plan (Plans/POCKET_ENHANCED_PLAN.md) changes them; every call that plan
// leaves open is decided in RULES.md next to this file and marked "(RULES.md)" here.
import { seededRng, makeRand } from '../../../battlecards/engine/rng.js';
import { card, CARDS } from '../data/cards.js';
import { effectiveness, ENERGY_TYPES } from './types.js';

export const ENGINE_VERSION = 1;
// The rules revision a match is played under (its config's `rules`; a recipe without one is revision 1 and replays as it
// was played). 2: damage that is not aimed by an action (a Pokémon Checkup Ability, an Ability answering an Energy attached
// by an effect) asks its player to choose among the opposing Active Pokémon, where revision 1 took the first in turn order.
// 3: six attacks shared by unrelated Pokémon changed Combat Type (cards.js `typeWas` holds the type they had); a match of
// revision 1 or 2 is replayed with the old type. 4: Mega Steelix ex's -20. 5: four cards whose source record was wrong were
// corrected (cards.js `costWas`, `damageWas`, `toWas` hold what they had); a match of an earlier revision replays with those.
export const RULES = 6;   // (6: the Koraidon and Miraidon of Paldean Wonders are not Ancient and Future; they were, wrongly, for part of revision 5)
/** The Combat Type an attack has in this match. */
export const typeOf = (rules, attack) => (rules < 3 && attack.typeWas) || attack.combatType;
export const LIMITS = Object.freeze({ deck: 20, copies: 2, hand: 5, maxHand: 10, actives: 2, bench: 4, players: [2, 4], energyTypes: [1, 3] });
export class Refused extends Error { constructor(why) { super(why); this.refused = true; } }
const no = why => { throw new Refused(why); };

// ---------------------------------------------------------------------------------------------------- small helpers
const xmur3 = str => { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^ (h >>> 16)) >>> 0; };
const SLOT = ['A', 'B'];
const top = poke => card(poke.cards[poke.cards.length - 1]);
const toolFx = poke => (poke.tool ? card(poke.tool).fx : null);   // the Pokémon Tool attached to it (one at most)
const energyHp = poke => { const ab = abilityOf(poke); return ab && ab.fx.k === 'energyHp' ? ab.fx.n * poke.energy.filter(x => x === ab.fx.type).length : 0; };   // Reuniclus
let CUR = null;   // the match being worked on (set by every entry point): a Pokémon's HP can depend on what else its player has in play
function typeHp(poke) {
	const p = CUR && CUR.players.find(q => q.active.includes(poke) || q.bench.includes(poke)); if (!p) return 0;
	let n = 0; for (const m of [...p.active, ...p.bench]) if (m) { const ab = abilityOf(m); if (ab && ab.fx.k === 'typeHp' && isT(poke, ab.fx.type)) n += ab.fx.n; }
	{ const sh = stadiumFx('stadiumBasicHp'); if (sh && top(poke).stage === 0) n += sh.n; }
	return n;
}
const hpOf = poke => top(poke).hp + (toolFx(poke) && toolFx(poke).k === 'toolHp' && (!toolFx(poke).type || isT(poke, toolFx(poke).type)) && (!toolFx(poke).ancient || isAnc(poke)) && (toolFx(poke).stage == null || top(poke).stage === toolFx(poke).stage) ? toolFx(poke).n : 0) + typeHp(poke) + energyHp(poke);
const ed = p => (p.energyDiscard = p.energyDiscard || []);          // Energy discarded from a player's Pokémon (Volkner takes it back)
const blockHeal = S => S.players.some(p => inPlay(p).some(k => passive(k, 'healBlock')));
/** How much of `n` is healed from `dmg` damage (nothing while a Pokémon in play stops healing). */
const hl = (S, n, dmg) => (blockHeal(S) ? 0 : Math.min(n, dmg));
/** Unown: GUARD and POWER work while their player has an Unown in play with a different Ability. */
const unownOn = (p, k) => inPlay(p).some(m => m !== k && pokeName(m) === 'Unown' && top(m).ability && top(m).ability.name !== top(k).ability.name);
const apron = poke => { const t = toolFx(poke); return t && t.k === 'toolApron' && isT(poke, t.type) ? t : null; };
const TYPES8 = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal'];
let pingCredit = null;   // damage done by an Ability while Energy was being attached (Darkrai ex): uid -> seat, settled by the action under way
export const pokeName = poke => top(poke).name;
const isBasicCard = id => { const c = card(id); return !!c && (c.kind === 'pokemon' ? c.stage === 0 : !!c.fossil); };

/** Is a deck legal? -> null, or the reason it is not. */
export function deckError(deck, energy) {
	if (!Array.isArray(deck) || deck.length !== LIMITS.deck) return `a deck is ${LIMITS.deck} cards`;
	const byName = {};
	for (const id of deck) { const c = card(id); if (!c) return `unknown card ${id}`; byName[c.name] = (byName[c.name] || 0) + 1; if (byName[c.name] > LIMITS.copies) return `no more than ${LIMITS.copies} cards named ${c.name}`; }
	if (!deck.some(id => { const c = card(id); return c.kind === 'pokemon' && c.stage === 0; })) return 'a deck needs at least one Basic Pokémon';
	if (!Array.isArray(energy) || energy.length < LIMITS.energyTypes[0] || energy.length > LIMITS.energyTypes[1] || new Set(energy).size !== energy.length || energy.some(t => !ENERGY_TYPES.includes(t))) return 'choose 1 to 3 different Energy types';
	return null;
}

// ---------------------------------------------------------------------------------------------------------- create
export function createGame(config) {
	const n = (config.players || []).length;
	if (n < LIMITS.players[0] || n > LIMITS.players[1]) no('a match is 2 to 4 players');
	config.players.forEach((p, i) => { const e = deckError(p.deck, p.energy); if (e) no(`player ${i + 1}: ${e}`); });
	const seed = String(config.seed);
	const main = makeRand(seededRng(xmur3(seed + ':main')));
	const S = {
		v: ENGINE_VERSION, config, opts: { points: 3, ...(config.opts || {}) }, rand: main, uid: 0,
		players: config.players.map((p, seat) => ({
			seat, name: p.name || `Player ${seat + 1}`, ai: !!p.ai, energy: p.energy.slice(), erand: makeRand(seededRng(xmur3(seed + ':energy:' + seat))),
			deck: [], hand: [], discard: [], zone: { cur: null, next: null }, points: 0, active: [null, null], bench: [null, null, null, null],
			turns: 0, eliminated: false, setup: false, noSupporter: 0, flags: {}, seen: [],
		})),
		phase: 'setup', turn: 0, current: null, order: [], first: null, pending: null, over: null, log: [], actions: 0,
	};
	// the opening hand: one Basic Pokémon for certain (Pocket's guarantee), then four more off the shuffled deck
	for (const p of S.players) {
		const deck = config.players[p.seat].deck.slice();
		const basics = deck.map((id, i) => i).filter(i => { const c = card(deck[i]); return c.kind === 'pokemon' && c.stage === 0; });
		const g = deck.splice(basics[main.int(basics.length)], 1)[0];
		main.shuffle(deck);
		p.hand = [g, ...deck.splice(0, LIMITS.hand - 1)];
		p.deck = deck;
		p.zone.next = p.erand.pick(p.energy);
	}
	S.first = main.int(n);
	S.rules = config.rules >= 2 ? Math.min(RULES, config.rules | 0) : 1;
	S.order = Array.from({ length: n }, (_, i) => (S.first + i) % n);
	log(S, { k: 'start', msg: `The match begins: ${S.players.map(p => p.name).join(', ')}. ${S.players[S.first].name} goes first.` });
	return S;
}

// ------------------------------------------------------------------------------------------------------------- log
function log(S, e) { S.log.push({ n: S.log.length, turn: S.turn, ...e }); }
const who = (S, seat) => S.players[seat].name;
const at = (S, loc) => { const p = S.players[loc.seat]; return p ? (loc.zone === 'active' ? p.active[loc.idx] : p.bench[loc.idx]) || null : null; };
const where = loc => (loc.zone === 'active' ? `Active ${SLOT[loc.idx]}` : `Bench ${loc.idx + 1}`);
const label = (S, loc) => { const k = at(S, loc); return `${who(S, loc.seat)}'s ${k ? pokeName(k) : '(empty)'} (${where(loc)})`; };
export function locate(S, poke) {
	for (const p of S.players) { for (let i = 0; i < 2; i++) if (p.active[i] === poke) return { seat: p.seat, zone: 'active', idx: i }; for (let i = 0; i < 4; i++) if (p.bench[i] === poke) return { seat: p.seat, zone: 'bench', idx: i }; }
	return null;
}
const inPlay = p => [...p.active, ...p.bench].filter(Boolean);
const actives = p => p.active.filter(Boolean);
const benched = p => p.bench.filter(Boolean);
const opponents = (S, seat) => S.players.filter(p => p.seat !== seat && !p.eliminated);
const flip = (S, seat, why) => { const wp = S.players[seat], sure = !!(wp && wp.flags && wp.flags.will); if (sure) delete wp.flags.will; const heads = sure ? true : S.rand.chance(0.5);   // (Will: the first coin after it is heads)
	if (sure) why = (why ? why + '; ' : '') + 'Will'; log(S, { k: 'coin', seat, heads, msg: `${who(S, seat)} flips a coin${why ? ' (' + why + ')' : ''}: ${heads ? 'HEADS' : 'tails'}.` }); return heads; };

// ---------------------------------------------------------------------------------------------- Pokémon in play
export function makePoke(S, cardId) { return { uid: ++S.uid, cards: [cardId], dmg: 0, energy: [], status: {}, fx: [], turnPlayed: S.turn, turnEvolved: -1, abilityUsed: -1 }; }
function draw(S, p, n, quiet) {
	let got = 0;
	for (let i = 0; i < n; i++) { if (!p.deck.length || p.hand.length >= LIMITS.maxHand) break; p.hand.push(p.deck.shift()); got++; }
	if (!quiet) log(S, { k: 'draw', seat: p.seat, n: got, msg: `${p.name} draws ${got === 1 ? 'a card' : got + ' cards'}${got < n ? (p.deck.length ? ' (hand full)' : ' (deck empty)') : ''}.` });
	return got;
}
function clearOnLeaveActive(poke) { poke.status = {}; poke.fx = []; }   // conditions and attack effects end on the Bench
function discardPoke(S, p, poke) { p.discard.push(...poke.cards); if (poke.tool) { p.discard.push(poke.tool); poke.tool = null; } ed(p).push(...poke.energy); poke.energy = []; }
/** The Pokémon Tool on a Pokémon goes to its owner's discard pile. */
function dropTool(S, poke, why) { const loc = locate(S, poke); if (!poke.tool || !loc) return; const p = S.players[loc.seat], t = poke.tool; poke.tool = null; p.discard.push(t); log(S, { k: 'discard', msg: `${card(t).name} is discarded from ${p.name}'s ${pokeName(poke)}${why ? ' (' + why + ')' : ''}.` }); }
const hasNamed = (p, names) => inPlay(p).some(k => names.includes(pokeName(k)));
/** An Ability of this kind on the Pokémon, if the Pokémon it names is in play on its side (the "Link" Abilities). */
function link(S, poke, k) { const f = passive(poke, k), loc = f && locate(S, poke); return f && loc && hasNamed(S.players[loc.seat], f.names) ? f : null; }
/** What retreating this Pokémon costs before any Trainer's discount. */
export function retreatCost(S, poke) {
	if ((passive(poke, 'freeRetreat') && poke.energy.length) || link(S, poke, 'linkFreeRetreat')) return 0;
	const loc = locate(S, poke); let c = top(poke).retreat + poke.fx.filter(x => x.k === 'costMore').reduce((n, x) => n + (x.retreat || 0), 0);
	if (loc && passive(poke, 'firstTurnFreeRetreat') && S.players[loc.seat].turns === 0) return 0;
	if (loc && loc.zone === 'active' && inPlay(S.players[loc.seat]).some(m => passive(m, 'activeNoRetreat'))) return 0;
	if (S.stadium && passive(poke, 'stadiumFreeRetreat')) return 0;
	{ const bal = toolFx(poke); if (bal && bal.k === 'toolStageFreeRetreat' && top(poke).stage === bal.stage) return 0; }
	{ const pz = stadiumFx('stadiumTypeRetreat'); if (pz && isT(poke, pz.type)) c -= pz.n; }
	if (loc && loc.zone === 'active' && inPlay(S.players[loc.seat]).some(m => { const f = passive(m, 'freeRetreatNamed'); return f && f.names.includes(pokeName(poke)); })) return 0;
	if (loc && loc.zone === 'active') for (const b of benched(S.players[loc.seat])) { const f = passive(b, 'benchRetreatLess'); if (f && (f.type ? isT(poke, f.type) : top(poke).stage === 0)) c -= f.n; }
	if (loc && loc.zone === 'active') for (const q of opponents(S, loc.seat)) for (const m of inPlay(q)) { const f = passive(m, 'oppRetreatMore'); if (f) c += f.n; }   // Ariados
	{ const boat = toolFx(poke); if (boat && boat.k === 'toolRetreatLess' && isT(poke, boat.type)) c -= boat.n; }
	{ const sb = toolFx(poke); if (sb && sb.k === 'toolBasicRetreatLess' && top(poke).stage === 0) c -= sb.n; }
	return Math.max(0, c);
}
/** How many {C} an attack of this Pokémon costs less right now (Abomasnow beside Arceus; Barry this turn). */
export function costLess(S, poke) {
	const loc = locate(S, poke); if (!loc) return 0;
	const v = link(S, poke, 'linkCostLess');
	let more = 0; if (loc.zone === 'active') for (const q of opponents(S, loc.seat)) for (const m of actives(q)) { const f = passive(m, 'activeCostMore'); if (f) more += f.n; }
	const fut = isFut(poke) ? inPlay(S.players[loc.seat]).reduce((n, m) => { const f = passive(m, 'futureCostLess'); return n + (f ? f.n : 0); }, 0) : 0;   // Future System
	return fut + (v ? v.n : 0) + (S.players[loc.seat].flags.costLess || []).filter(c => c.names.includes(pokeName(poke))).reduce((n, c) => n + c.n, 0) - poke.fx.filter(x => x.k === 'costMore').reduce((n, x) => n + x.n, 0) - more;
}
/** A cost with `n` of its Colorless Energy taken off. */
export function lessCost(cost, n) { const out = cost.slice(); for (let i = out.length - 1; i >= 0 && n > 0; i--) if (out[i] === 'Colorless') { out.splice(i, 1); n--; } for (; n < 0; n++) out.push('Colorless'); return out; }
/** The cost an attack starts from (Boltund: 1 Energy while it has damage on it). Works on a Pokémon in play or one in a view. */
export const baseCost = (poke, attack, deck) => { const f = attack.fx.find(g => g.k === 'damagedCost'); if (f && poke.dmg > 0) return f.cost; const g2 = attack.fx.find(g => g.k === 'emptyDeckCost'); return g2 && deck === 0 ? g2.cost : (CUR && CUR.rules < 5 && attack.costWas) || attack.cost; };   // (deck: how many cards its player's deck holds: Veluza)
const costOf = (S, poke, attack) => { const loc = locate(S, poke); return lessCost(baseCost(poke, attack, loc ? S.players[loc.seat].deck.length : null), costLess(S, poke)); };
/** The attacks a Pokémon may use: its own, then (holding Memory Light) those of the cards under it, lowest first. */
/** May this Pokémon use the attacks of its previous Evolutions? (Memory Light on it, or its player's Celebi in play.) */
function recalls(poke) {
	const t = toolFx(poke); if (t && t.k === 'toolMemory') return true;
	if (poke.cards.length < 2 || !CUR) return false;
	const p = CUR.players.find(q => q.active.includes(poke) || q.bench.includes(poke));
	return !!p && [...p.active, ...p.bench].some(m => m && passive(m, 'timeRecall'));
}
export function attacksOf(poke) {
	const own = top(poke).attacks;
	return recalls(poke) ? [...own, ...poke.cards.slice(0, -1).flatMap(i => card(i).attacks || [])] : own;
}
function removeFromPlay(S, poke) { const loc = locate(S, poke); if (!loc) return; const p = S.players[loc.seat]; if (loc.zone === 'active') p.active[loc.idx] = null; else p.bench[loc.idx] = null; }
const hasFx = (poke, k) => poke.fx.some(f => f.k === k);
/** Alolan Muk: while one is in play, Basic Pokémon (every player's) have no Abilities. */
const mutedBasics = () => !!CUR && CUR.players.some(p => [...p.active, ...p.bench].some(m => { if (!m) return false; const ab = card(m.cards[m.cards.length - 1]).ability; return !!ab && ab.fx.k === 'noBasicAbilities'; }));
const abilityOf = poke => { const c = top(poke); return c.ability && !(c.stage === 0 && mutedBasics()) && !poke.fx.some(f => f.k === 'noAbility') ? c.ability : null; };   // (noAbility: Budew's Prickly Powder)
/** Is this Pokémon Ancient, or Future? (A match of rules revision 5 or earlier keeps the label two cards wrongly had.) */
const isAnc = poke => { const c = top(poke); return !!c.ancient || (!!c.ancientWas && !!CUR && CUR.rules < 6); };
const isFut = poke => { const c = top(poke); return !!c.future || (!!c.futureWas && !!CUR && CUR.rules < 6); };
/** Is this Pokémon of that card type? (Urshifu's Double Type makes it two.) */
const isT = (poke, type) => { const c = top(poke); if (c.cardType === type) return true; const ab = c.ability; return !!ab && ab.fx.k === 'doubleType' && ab.fx.types.includes(type) && !!abilityOf(poke); };
const typesOf = poke => { const c = top(poke), ab = c.ability; return ab && ab.fx.k === 'doubleType' && abilityOf(poke) ? [...new Set([c.cardType, ...ab.fx.types])] : [c.cardType]; };
const passive = (poke, k) => { const a = abilityOf(poke); return a && a.fx.k === k ? a.fx : null; };
/** The Stadium in play (one for the whole table), as its effect; null when there is none. */
const isMega = c => !!c.ex && /^Mega /.test(c.name);   // a Mega Evolution Pokémon ex
const stadiumFx = k => { const st = CUR && CUR.stadium ? card(CUR.stadium.id).fx : null; return st && st.k === k ? st : null; };
function dropStadium(S, why) { const st = S.stadium; if (!st) return; S.stadium = null; S.players[st.seat].discard.push(st.id); log(S, { k: 'discard', msg: `${why ? why + ': ' : ''}${card(st.id).name} is discarded.` }); }
/** Protective Poncho: on the Bench its holder takes no damage from opposing attacks and Abilities. */
const poncho = (S, poke) => { const t = toolFx(poke), loc = t && t.k === 'toolPoncho' ? locate(S, poke) : null; return !!loc && loc.zone === 'bench'; };
const canAct = poke => !poke.status.asleep && !poke.status.paralyzed;

/** Can these attached Energy pay this cost? Typed costs need their type; Colorless takes anything. */
export function canPay(energy, cost) {
	const pool = energy.slice();
	for (const c of cost.filter(c => c !== 'Colorless')) { const i = pool.indexOf(c); if (i < 0) return false; pool.splice(i, 1); }
	return pool.length >= cost.filter(c => c === 'Colorless').length;
}

/** What a Pokémon's attached Energy provides: itself, except that with a "provides 2" Ability on its side (it does not
 *  stack) each Energy of that type on a Pokémon of that type counts twice. Costs are paid with this. */
export function provided(S, poke) {
	// (Cherubi with a Pokémon Tool: "attacks cost 1 less {G}" is counted as one more {G} to pay with)
	const tc = passive(poke, 'toolCostLess'), out = providedBase(S, poke); if (tc && poke.tool) for (let i = 0; i < tc.n; i++) out.push(tc.type);
	return out;
}
function providedBase(S, poke) {
	const loc = locate(S, poke); if (!loc) return poke.energy.slice();
	const d = inPlay(S.players[loc.seat]).map(k => passive(k, 'doubleEnergy')).find(Boolean);
	if (!d || !isT(poke, d.type)) return poke.energy.slice();
	return poke.energy.flatMap(e => (e === d.type ? [e, e] : [e]));
}

/** How many Energy of `type` are attached beyond what the attack's cost uses (Colorless is paid with other types first). */
export function extraEnergy(energy, cost, type) {
	const pool = energy.slice();
	for (const c of cost.filter(c => c !== 'Colorless')) { const i = pool.indexOf(c); if (i >= 0) pool.splice(i, 1); }
	for (let n = cost.filter(c => c === 'Colorless').length; n > 0 && pool.length; n--) { const i = pool.findIndex(e => e !== type); pool.splice(i < 0 ? 0 : i, 1); }
	return pool.filter(e => e === type).length;
}

// ----------------------------------------------------------------------------------------------------------- damage
// The one place attack damage is worked out, in this order (RULES.md "Damage order"):
//   base (with the attack's own additions) -> +Trainer boosts (into an opposing ACTIVE Pokémon only, as printed)
//   -> -the attacker's "attacks do -N" -> Combat Type effectiveness -> -the defender's reductions -> prevention -> floor 0
// An attack whose damage is 0 before effectiveness stays 0: effectiveness changes damage, it does not create it.
function attackDamage(S, ctx, target, base, note) {
	const atkP = S.players[ctx.seat], tLoc = locate(S, target);
	const parts = [`base ${base}`];
	let d = base;
	if (d > 0) {
		if (tLoc.seat !== ctx.seat) for (const b of atkP.flags.boost || [])  if ((b.any || tLoc.zone === 'active') && (!b.cardType || isT(ctx.poke, b.cardType)) && (!b.names || b.names.includes(pokeName(ctx.poke))) && (!b.ex || top(target).ex) && (!b.evo || top(ctx.poke).evolvesFrom === b.evo)) { d += b.n; parts.push(`+${b.n} ${b.from}`); }
		if (tLoc.zone === 'active' && tLoc.seat !== ctx.seat) for (const m of inPlay(atkP)) { const c = passive(m, 'coach'); if (c && isT(ctx.poke, c.type)) { d += c.n; parts.push(`+${c.n} ${top(m).ability.name}`); } }
		if (tLoc.zone === 'active' && tLoc.seat !== ctx.seat) {
			for (const b of benched(atkP)) { const f = passive(b, 'benchBoost'); if (f && top(ctx.poke).evolvesFrom === f.from) { d += f.n; parts.push(`+${f.n} ${top(b).ability.name}`); } }
			{ const tq = passive(ctx.poke, 'lowHpBoost'); if (tq && hpOf(ctx.poke) - ctx.poke.dmg <= tq.hp) { d += tq.n; parts.push(`+${tq.n} ${top(ctx.poke).ability.name}`); } }
			{ const tr = stadiumFx('stadiumStageBoost'); if (tr && top(ctx.poke).stage === tr.stage) { d += tr.n; parts.push(`+${tr.n} ${card(S.stadium.id).name}`); } }
			{ const ar = stadiumFx('stadiumTypeBoostEx'); if (ar && isT(ctx.poke, ar.type) && top(target).ex) { d += ar.n; parts.push(`+${ar.n} ${card(S.stadium.id).name}`); } }
			{ const bd = passive(ctx.poke, 'buddy'); if (bd && inPlay(atkP).some(m => m !== ctx.poke && pokeName(m) === bd.name)) { d += bd.plus; parts.push(`+${bd.plus} ${top(ctx.poke).ability.name}`); } }
			for (const m of inPlay(atkP)) { const f = passive(m, 'typesBoost'); if (f && f.types.some(ty => isT(ctx.poke, ty))) { d += f.n; parts.push(`+${f.n} ${top(m).ability.name}`); } }
			for (const m of inPlay(atkP)) { const f = passive(m, 'unownPower'); if (f && unownOn(atkP, m)) { d += f.n; parts.push(`+${f.n} ${top(m).ability.name}`); } }
		}
		const bt = toolFx(ctx.poke); if (bt && bt.k === 'toolPointBoost' && top(ctx.poke).ub && atkP.points > 0 && tLoc.zone === 'active' && tLoc.seat !== ctx.seat) { d += bt.n * atkP.points; parts.push(`+${bt.n * atkP.points} ${card(ctx.poke.tool).name}`); }
		if (bt && bt.k === 'toolFutureBoost' && isFut(ctx.poke) && tLoc.zone === 'active' && tLoc.seat !== ctx.seat) { d += bt.n; parts.push(`+${bt.n} ${card(ctx.poke.tool).name}`); }
		{ const al = locate(S, ctx.poke); if (al && al.zone === 'active') for (const q of opponents(S, ctx.seat)) for (const m of actives(q)) { const f = passive(m, 'activeAtkMinus'); if (f) { d -= f.n; parts.push(`-${f.n} ${top(m).ability.name}`); } } }
		const lb = link(S, ctx.poke, 'linkBoost'); if (lb && tLoc.zone === 'active' && tLoc.seat !== ctx.seat) { d += lb.n; parts.push(`+${lb.n} ${top(ctx.poke).ability.name}`); }
		for (const f of ctx.poke.fx) if (f.k === 'atkMinus') { d -= f.n; parts.push(`-${f.n} (weakened)`); }
		const aType = typeOf(S.rules, ctx.attack), eff = effectiveness(aType, top(target).combatTypes);
		for (const part of eff.parts) if (part.mod) parts.push(`${part.mod > 0 ? '+' : ''}${part.mod} ${aType} into ${part.type}`); else if (part.immune) parts.push(`0 ${aType} into ${part.type} (no immunity here)`);
		if (ctx.attack.fx.some(f => f.k === 'ignoreWeakness') || (hasFx(target, 'noWeakness') && !ctx.attack.fx.some(f => f.k === 'ignoreTargetEffects'))) { const up = eff.parts.reduce((n, part) => n + Math.max(0, part.mod || 0), 0); d += eff.total - up; if (up) parts.push('Weakness ignored'); }
		else { const bf = stadiumFx('stadiumWeaknessDouble'), up = eff.parts.reduce((n, part) => n + Math.max(0, part.mod || 0), 0);   // Bounded Field: the type bonus becomes ×2
			if (bf && up > 0 && tLoc.zone === 'active' && tLoc.seat !== ctx.seat && !isMega(top(ctx.poke))) { d = d * 2 + (eff.total - up); parts.push(`×2 in place of the bonus (${card(S.stadium.id).name})`); } else d += eff.total; }
		const ite = ctx.attack.fx.some(f => f.k === 'ignoreTargetEffects');   // Morgrem: effects on the Defending Pokémon do not change this damage
		const red = passive(target, 'reduce'); if (red) { d -= red.n; parts.push(`-${red.n} ${top(target).ability.name}`); }
		if (!ite) for (const f of target.fx) if (f.k === 'reduce') { d -= f.n; parts.push(`-${f.n} (guarding)`); } else if (f.k === 'vulnerable' && (f.only == null || (S.current === f.only && S.turn > f.made))) { d += f.n; parts.push(`+${f.n} (exposed)`); }
		const cover = S.players[tLoc.seat].guard; if (cover && tLoc.seat !== ctx.seat && (!cover.type || isT(target, cover.type)) && (!cover.ub || top(target).ub) && (!cover.names || cover.names.includes(pokeName(target))) && (!cover.fromEx || top(ctx.poke).ex)) { d -= cover.n; parts.push(`-${cover.n} ${cover.from}`); }
		if (tLoc.seat !== ctx.seat) {
			for (const m of inPlay(S.players[tLoc.seat])) { const f = passive(m, 'unownGuard'); if (f && unownOn(S.players[tLoc.seat], m)) { d -= f.n; parts.push(`-${f.n} ${top(m).ability.name}`); } }
			const ap = apron(target); if (ap) { d -= ap.n; parts.push(`-${ap.n} ${card(target.tool).name}`); }
			{ const bd = passive(target, 'buddy'); if (bd && inPlay(S.players[tLoc.seat]).some(m => m !== target && pokeName(m) === bd.name)) { d -= bd.minus; parts.push(`-${bd.minus} ${top(target).ability.name}`); } }
			{ const br = toolFx(target); if (br && br.k === 'toolBarrier' && isT(target, br.type)) { d -= br.n; parts.push(`-${br.n} ${card(target.tool).name}`); } }
			if (!ite && top(ctx.poke).ex) for (const f of target.fx) if (f.k === 'reduceEx') { d -= f.n; parts.push(`-${f.n} (guarding against Pokémon ex)`); }
			const ice = passive(target, 'fullHpReduce'); if (ice && !target.dmg) { d -= ice.n; parts.push(`-${ice.n} ${top(target).ability.name}`); }
			const hv = toolFx(target); if (hv && hv.k === 'toolHeavy' && retreatCost(S, target) >= hv.need) { d -= hv.n; parts.push(`-${hv.n} ${card(target.tool).name}`); }
		}
		const lr = link(S, target, 'linkReduce'); if (lr) { d -= lr.n; parts.push(`-${lr.n} ${top(target).ability.name}`); }
		const fat = passive(target, 'reduceFrom'); if (fat && fat.types.some(ty => isT(ctx.poke, ty))) { d -= fat.n; parts.push(`-${fat.n} ${top(target).ability.name}`); }
		const grill = passive(target, 'coinReduce'); if (grill && d > 0 && flip(S, tLoc.seat, top(target).ability.name)) { d -= grill.n; parts.push(`-${grill.n} ${top(target).ability.name}`); }
	}
	const ite2 = ctx.attack.fx.some(f => f.k === 'ignoreTargetEffects');
	if (tLoc.seat !== ctx.seat && d > 0 && poncho(S, target)) { d = 0; parts.push(`prevented by ${card(target.tool).name}`); }
	if (tLoc.seat !== ctx.seat && d > 0 && passive(target, 'disguise') && !target.disguised) { target.disguised = true; d = 0; parts.push(`prevented by ${top(target).ability.name}`); }
	if (passive(target, 'benchShield') && tLoc.zone === 'bench' && d > 0) { d = 0; parts.push(`prevented by ${top(target).ability.name}`); }
	if (!ite2 && (hasFx(target, 'prevent') || hasFx(target, 'preventDamage')) && tLoc.seat !== ctx.seat) { d = 0; parts.push('prevented'); }
	if (!ite2 && tLoc.seat !== ctx.seat && d > 0) { const ps = target.fx.find(f => f.k === 'preventSmall'); if ((ps && d <= ps.n) || (hasFx(target, 'preventFromBasic') && top(ctx.poke).stage === 0)) { d = 0; parts.push('prevented'); } }
	{ const cb = passive(target, 'coinPreventDamage'); if (cb && d > 0 && flip(S, tLoc.seat, top(target).ability.name)) { d = 0; parts.push(`prevented by ${top(target).ability.name}`); } }
	if (passive(target, 'preventFromEx') && top(ctx.poke).ex && tLoc.seat !== ctx.seat) { d = 0; parts.push(`prevented by ${top(target).ability.name}`); }
	d = Math.max(0, d);
	const endure = passive(target, 'endure');   // Guts: it would be Knocked Out; on heads it is left with a little HP
	if (endure && d > 0 && target.dmg + d >= hpOf(target) && flip(S, tLoc.seat, top(target).ability.name)) { d = Math.max(0, hpOf(target) - endure.hp - target.dmg); parts.push(`${top(target).ability.name}: left with ${endure.hp} HP`); }
	{ const ge = S.players[tLoc.seat].guardEndure;   // Hala: until its player's next turn, a named Pokémon is left with a little HP instead of being Knocked Out
		if (ge && tLoc.seat !== ctx.seat && ge.names.includes(pokeName(target)) && d > 0 && target.dmg + d >= hpOf(target)) { d = Math.max(0, hpOf(target) - ge.hp - target.dmg); parts.push(`${ge.from}: left with ${ge.hp} HP`); } }
	target.dmg += d;
	log(S, { k: 'damage', seat: ctx.seat, to: tLoc, n: d, type: typeOf(S.rules, ctx.attack), msg: `${note || ctx.attack.name} does ${d} damage to ${label(S, tLoc)} [${parts.join(', ')}]. (${Math.max(0, hpOf(target) - target.dmg)}/${hpOf(target)} HP)` });
	// Poliwrath's Counterattack: an Active one damaged by an opposing Pokémon's attack hits back (no effectiveness)
	const counter = passive(target, 'counter');
	if (d > 0 && counter && tLoc.zone === 'active' && tLoc.seat !== ctx.seat && locate(S, ctx.poke)) { ctx.poke.dmg += counter.n; log(S, { k: 'damage', seat: tLoc.seat, msg: `${top(target).ability.name}: ${pokeName(ctx.poke)} takes ${counter.n} damage.` }); ctx.credit.set(ctx.poke.uid, tLoc.seat); }
	if (d > 0 && tLoc.seat !== ctx.seat && locate(S, ctx.poke)) {
		for (const f of target.fx) if (f.k === 'thorns') { ctx.poke.dmg += f.n; log(S, { k: 'damage', seat: tLoc.seat, msg: `${pokeName(ctx.poke)} takes ${f.n} damage for attacking ${pokeName(target)}.` }); ctx.credit.set(ctx.poke.uid, tLoc.seat); }
		if (tLoc.zone === 'active') target.hitAt = S.players[tLoc.seat].turns;   // (Wobbuffet: "damaged by an attack during your opponent's last turn")
		{ const pd = toolFx(target); if (pd && pd.k === 'toolHandToDeck' && isT(target, pd.type) && tLoc.zone === 'active' && atkP.hand.length) { const got = atkP.hand.splice(S.rand.int(atkP.hand.length), 1)[0]; atkP.deck.push(got); S.rand.shuffle(atkP.deck); log(S, { k: 'note', msg: `${card(target.tool).name}: ${atkP.name} reveals ${card(got).name} from their hand and shuffles it into their deck.` }); } }
		if (passive(target, 'poisonAttacker') && tLoc.zone === 'active') { log(S, { k: 'note', msg: `${top(target).ability.name}:` }); setStatus(S, ctx.poke, 'poisoned', tLoc.seat); }
		{ const hb = passive(target, 'hitAttachBench'); if (hb && tLoc.zone === 'active') (ctx.after = ctx.after || []).push({ seat: tLoc.seat, type: hb.type, src: top(target).ability.name }); }   // (its Energy is attached when the attack is over: its player chooses where)
		const barb = toolFx(target); if (barb && barb.k === 'toolPoison' && tLoc.zone === 'active') { log(S, { k: 'note', msg: `${card(target.tool).name}:` }); setStatus(S, ctx.poke, 'poisoned', tLoc.seat); }
		const pb = passive(target, 'koCoinKO'); if (pb && tLoc.zone === 'active' && target.dmg >= hpOf(target) && flip(S, tLoc.seat, top(target).ability.name)) { ctx.poke.dmg = Math.max(ctx.poke.dmg, hpOf(ctx.poke)); ctx.credit.set(ctx.poke.uid, tLoc.seat); log(S, { k: 'damage', seat: tLoc.seat, msg: `${top(target).ability.name}: ${pokeName(ctx.poke)} is Knocked Out.` }); }
		{ const ks = passive(target, 'koSplash'); if (ks && tLoc.zone === 'active' && target.dmg >= hpOf(target)) { log(S, { k: 'note', msg: `${top(target).ability.name}:` }); for (const m of inPlay(atkP)) if (!poncho(S, m)) { m.dmg += ks.n; m.hitBy = tLoc.seat; ctx.credit.set(m.uid, tLoc.seat); log(S, { k: 'damage', seat: tLoc.seat, msg: `${pokeName(m)} takes ${ks.n} damage.` }); } } }
		const kc = passive(target, 'koCounter'); if (kc && tLoc.zone === 'active' && target.dmg >= hpOf(target)) { ctx.poke.dmg += kc.n; log(S, { k: 'damage', seat: tLoc.seat, msg: `${top(target).ability.name}: ${pokeName(ctx.poke)} takes ${kc.n} damage.` }); ctx.credit.set(ctx.poke.uid, tLoc.seat); }
	}
	const helmet = toolFx(target);
	if (d > 0 && helmet && helmet.k === 'toolCounter' && tLoc.zone === 'active' && tLoc.seat !== ctx.seat && locate(S, ctx.poke)) { ctx.poke.dmg += helmet.n; log(S, { k: 'damage', seat: tLoc.seat, msg: `${card(target.tool).name}: ${pokeName(ctx.poke)} takes ${helmet.n} damage.` }); ctx.credit.set(ctx.poke.uid, tLoc.seat); }
	if (d > 0) { ctx.credit.set(target.uid, ctx.seat); if (tLoc.seat !== ctx.seat) target.hitBy = ctx.seat; }
	return d;
}
function plainDamage(S, target, n, msg, creditSeat, ctx) {   // not an attack's damage: no effectiveness, no reductions
	target.dmg += n; log(S, { k: 'damage', n, msg });
	if (ctx && creditSeat != null) ctx.credit.set(target.uid, creditSeat);
}

/** Knock Outs, points, eliminations, the win. `credit`: uid -> the seat that gets the points for that Pokémon. */
function* settle(S, credit, fallbackSeat, byAttack) {
	let chain = null, lastTo = null;   // (a Pokémon that falls because another fell is scored by whoever scored that one)
	for (;;) {   // (again while anything falls: a Pokémon that leaves play can take other Pokémon's HP with it, as Lilligant's +20 does)
	const fell = [];
	for (const p of S.players) for (const k of inPlay(p)) if (k.dmg >= hpOf(k)) fell.push([p, k]);
	if (!fell.length) break;
	for (const [p, k] of fell) {
		let to = credit && credit.has(k.uid) ? credit.get(k.uid) : chain != null ? chain : fallbackSeat;
		// a Pokémon knocked out by its own side's doing gives its points to the player it was fighting (RULES.md)
		if (to === p.seat || to == null || S.players[to].eliminated) to = fallbackSeat != null && fallbackSeat !== p.seat ? fallbackSeat : null;
		if (to != null && passive(k, 'koNoPoints') && flip(S, p.seat, top(k).ability.name)) to = null;
		let pts = top(k).points;
		{ const kb = to != null && to !== p.seat ? S.players[to].flags.koBonus : null, kl0 = locate(S, k);   // Iris: one more point for an opposing Active Pokémon her Pokémon Knocked Out with an attack
			if (kb && byAttack && kb.names.includes(byAttack.name) && credit && credit.get(k.uid) === to && kl0 && kl0.zone === 'active') { pts += kb.n; log(S, { k: 'note', msg: `${kb.from}: ${kb.n} more point.` }); } }
		log(S, { k: 'ko', seat: p.seat, msg: `${p.name}'s ${pokeName(k)} is Knocked Out!` + (to != null ? ` ${who(S, to)} takes ${pts} point${pts > 1 ? 's' : ''}.` : ' No one takes points for it.') });
		if (to != null) { S.players[to].points += pts; lastTo = to; }
		p.fallen = (p.fallen || 0) + 1;   // (Kingambit counts them)
		if (byAttack && credit && credit.has(k.uid) && p.seat !== S.current) { p.koByAttack = true; p.koTypes = [...(p.koTypes || []), ...typesOf(k)]; }
		{ const egg = toolFx(k);   // Lucky Egg: its holder Knocked Out by an opposing attack: its player draws up to that many cards in hand
			if (egg && egg.k === 'toolKoDraw' && byAttack && credit && credit.has(k.uid) && credit.get(k.uid) !== p.seat && p.hand.length < egg.n) { log(S, { k: 'note', msg: `${card(k.tool).name}:` }); draw(S, p, egg.n - p.hand.length); } }
		{	// Electrical Cord: its holder Knocked Out in an Active slot by an opposing attack: Energy of its type goes, one each, to Benched Pokémon of its player's choice
			const cord = toolFx(k), kl = locate(S, k);
			if (cord && cord.k === 'toolKoEnergy' && isT(k, cord.type) && byAttack && credit && credit.has(k.uid) && credit.get(k.uid) !== p.seat && kl && kl.zone === 'active') {
				let left = p.bench.map((b, idx) => (b && b !== k ? { seat: p.seat, zone: 'bench', idx } : null)).filter(Boolean);
				for (let i = 0; i < cord.n && left.length && k.energy.includes(cord.type); i++) {
					const to = yield* chooseTarget(S, p.seat, left, `${card(k.tool).name}: choose a Benched Pokémon to take a ${cord.type} Energy (${i + 1} of ${cord.n}).`), tk = at(S, to);
					k.energy.splice(k.energy.indexOf(cord.type), 1); tk.energy.push(cord.type); left = left.filter(l => l.idx !== to.idx);
					log(S, { k: 'energy', seat: p.seat, msg: `${card(k.tool).name}: a ${cord.type} Energy moves to ${pokeName(tk)}.` });
				}
			}
		}
		{	// Offload Pass: Knocked Out in an Active slot by an opposing attack, its Energy of that type goes to a Benched Pokémon of its player's choice
			const pass = passive(k, 'koPassEnergy'), kl = locate(S, k), bl = p.bench.map((b, idx) => (b && b !== k ? { seat: p.seat, zone: 'bench', idx } : null)).filter(Boolean);
			if (pass && byAttack && credit && credit.has(k.uid) && credit.get(k.uid) !== p.seat && kl && kl.zone === 'active' && bl.length && k.energy.includes(pass.type)) {
				const to = yield* chooseTarget(S, p.seat, bl, `${top(k).ability.name}: choose the Benched Pokémon that takes ${pokeName(k)}'s ${pass.type} Energy.`), tk = at(S, to);
				const moved = k.energy.filter(e => e === pass.type); k.energy = k.energy.filter(e => e !== pass.type); tk.energy.push(...moved);
				log(S, { k: 'energy', seat: p.seat, msg: `${top(k).ability.name}: ${moved.length} ${pass.type} Energy moves to ${pokeName(tk)}.` });
			}
		}
		removeFromPlay(S, k);
		{ const sc = toolFx(k); if (sc && sc.k === 'toolRescue' && byAttack && credit && credit.has(k.uid) && credit.get(k.uid) !== p.seat) { const back = k.cards.slice(); k.cards = []; p.hand.push(...back); log(S, { k: 'note', seat: p.seat, msg: `${card(k.tool).name}: ${back.map(i => card(i).name).join(', ')} ${back.length > 1 ? 'go' : 'goes'} to ${p.name}'s hand.` }); } }
		discardPoke(S, p, k);
	}
	chain = lastTo;
	}
	if (checkOver(S)) return;
	// a player with no Active Pokémon must promote one from the Bench; with nothing left at all they are out
	for (const seat of S.order) {
		const p = S.players[seat];
		if (p.eliminated || !p.setup || actives(p).length) continue;
		if (!benched(p).length) { eliminate(S, p, 'has no Pokémon left'); if (checkOver(S)) return; continue; }
		const opts = p.bench.map((k, i) => (k ? i : -1)).filter(i => i >= 0);
		const pick = opts.length === 1 ? opts[0] : yield { seat, kind: 'promote', options: opts, msg: 'Choose a Benched Pokémon to become your Active Pokémon.' };
		const i = opts.includes(pick) ? pick : opts[0];
		p.active[0] = p.bench[i]; p.bench[i] = null; if (S.current === seat) p.active[0].movedUp = S.turn;
		log(S, { k: 'promote', seat, msg: `${p.name} sends ${pokeName(p.active[0])} to Active A.` });
	}
}
function eliminate(S, p, why) { p.eliminated = true; log(S, { k: 'out', seat: p.seat, msg: `${p.name} ${why} and is out of the match.` }); }
function checkOver(S) {
	if (S.over) return true;
	const live = S.players.filter(p => !p.eliminated);
	const done = S.players.filter(p => p.points >= S.opts.points);
	let winner = null, why = null;
	if (done.length) {
		// several at once: the most points; then the player whose turn it is; then the next in turn order (RULES.md)
		const best = Math.max(...done.map(p => p.points)), tied = done.filter(p => p.points === best);
		const from = Math.max(0, S.order.indexOf(S.current));
		winner = tied.length === 1 ? tied[0] : [...S.order.slice(from), ...S.order.slice(0, from)].map(s => S.players[s]).find(p => tied.includes(p));
		why = `${winner.points} points`;
	} else if (live.length <= 1) { winner = live[0] || null; why = 'the last player standing'; }
	if (!winner && !(done.length || live.length <= 1)) return false;
	S.over = { winner: winner ? winner.seat : null, why };
	S.pending = null;
	log(S, { k: 'win', seat: winner ? winner.seat : null, msg: winner ? `${winner.name} wins (${why})!` : 'The match ends with no winner.' });
	return true;
}

// ------------------------------------------------------------------------------------------------- switching, etc.
/** An opposing Active Pokémon is switched out: its OWNER picks the Benched Pokémon that takes its slot. */
function* switchOut(S, loc, by) {
	const p = S.players[loc.seat], k = p.active[loc.idx];
	const opts = p.bench.map((b, i) => (b ? i : -1)).filter(i => i >= 0);
	if (!k || !opts.length) { log(S, { k: 'note', msg: `${p.name} has no Benched Pokémon to switch in.` }); return; }
	const pick = opts.length === 1 ? opts[0] : yield { seat: p.seat, kind: 'switchIn', options: opts, slot: loc.idx, msg: `${by} forces a switch: choose the Benched Pokémon that replaces ${pokeName(k)} in Active ${SLOT[loc.idx]}.` };
	const i = opts.includes(pick) ? pick : opts[0];
	clearOnLeaveActive(k);
	p.active[loc.idx] = p.bench[i]; p.bench[i] = k;
	log(S, { k: 'switch', seat: p.seat, msg: `${p.name} switches ${pokeName(k)} out for ${pokeName(p.active[loc.idx])} (Active ${SLOT[loc.idx]}).` });
}
function* attachFromZone(S, p, poke, type, src) {
	const lz = locate(S, poke);
	if (p.noZoneActive > 0 && lz && lz.zone === 'active') { log(S, { k: 'note', msg: `${src}: ${p.name} can't attach Energy from the Energy Zone to an Active Pokémon this turn.` }); return; }
	poke.energy.push(type); log(S, { k: 'energy', seat: p.seat, msg: `${src}: ${p.name} attaches a ${type} Energy to ${pokeName(poke)}.` }); zoneSleep(S, poke); zoneEvolve(S, p, poke); yield* zonePing(S, p, poke, type, null); }
/** Porygon2: an Energy from the Energy Zone onto it puts a random card from the deck that evolves from it onto it. */
function zoneEvolve(S, p, poke) { if (passive(poke, 'zoneEvolve')) evolveFromDeck(S, p, poke, top(poke).ability.name); }
function evolveFromDeck(S, p, poke, an) {
	const from = pokeName(poke), idxs = p.deck.map((i, n) => (card(i).kind === 'pokemon' && card(i).evolvesFrom === from ? n : -1)).filter(n => n >= 0);
	if (!idxs.length) { log(S, { k: 'note', msg: `${an}: no card that evolves from ${from} is in ${p.name}'s deck.` }); return; }
	const id = p.deck.splice(S.rand.pick(idxs), 1)[0]; poke.cards.push(id); poke.turnEvolved = S.turn; poke.status = {}; poke.fx = []; S.rand.shuffle(p.deck);
	log(S, { k: 'evolve', seat: p.seat, msg: `${an}: ${p.name}'s ${from} evolves into ${card(id).name} from the deck.` });
}
/** Komala: an Energy from the Energy Zone onto it, in an Active slot, puts it to sleep. */
function zoneSleep(S, poke) {
	const loc = locate(S, poke); if (!loc) return;
	if (loc.zone === 'active' && (passive(poke, 'attachSleep') || hasFx(poke, 'attachSleep'))) setStatus(S, poke, 'asleep', loc.seat);
	for (const q of opponents(S, loc.seat)) for (const m of actives(q)) {   // Jolteon ex: an opponent's Energy from their Energy Zone hurts the Pokémon that takes it
		const f = passive(m, 'oppAttachPing'); if (!f) continue;
		if (poncho(S, poke)) continue;
		poke.dmg += f.n; poke.hitBy = q.seat; (pingCredit = pingCredit || new Map()).set(poke.uid, q.seat);
		log(S, { k: 'damage', seat: q.seat, msg: `${top(m).ability.name} does ${f.n} damage to ${S.players[loc.seat].name}'s ${pokeName(poke)}.` });
	}
}
/** Comfey: Pokémon of its side that hold the Energy recover from every Special Condition (kept true after every action). */
function sweepShield(S) {
	for (const p of S.players) for (const k of inPlay(p)) if (apron(k) && Object.keys(k.status).length) { k.status = {}; log(S, { k: 'status', msg: `${card(k.tool).name}: ${p.name}'s ${pokeName(k)} recovers from its Special Conditions.` }); }
	for (const p of S.players) { const sh = inPlay(p).map(m => passive(m, 'energyNoStatus')).find(Boolean); if (!sh) continue; for (const k of inPlay(p)) if ((sh.type ? k.energy.includes(sh.type) : k.energy.length) && Object.keys(k.status).length) { k.status = {}; log(S, { k: 'status', msg: `${p.name}'s ${pokeName(k)} recovers from its Special Conditions.` }); } }
}
/** Every opposing Active Pokémon, as locations, in turn order from the player after `seat`. */
function oppActives(S, seat) {
	const from = Math.max(0, S.order.indexOf(seat));
	return [...S.order.slice(from + 1), ...S.order.slice(0, from)].filter(x => !S.players[x].eliminated).flatMap(x => S.players[x].active.map((k, idx) => (k ? { seat: x, zone: 'active', idx } : null)).filter(Boolean));
}
/** Damage nobody aimed (a Checkup Ability; an Ability answering an Energy an effect attached): its player chooses among `locs`
 *  when there is more than one. The match waits for that choice, whoever's turn it is. (Rules revision 1: the first.) */
function* chooseTarget(S, seat, locs, msg) {
	if (locs.length <= 1 || S.rules < 2) return locs[0] || null;
	const pick = yield { seat, kind: 'pickTarget', options: locs.map((_, i) => i), locs: locs.map(l => ({ ...l })), msg };
	return locs[Number.isInteger(pick) && locs[pick] ? pick : 0];
}
/** "Whenever you attach a {D} Energy from your Energy Zone to this Pokémon, do N damage to an opposing Active Pokémon": the one
 *  sent with the attach action; otherwise (an Energy attached by an effect, or no choice sent) its player is asked. */
function* zonePing(S, p, poke, type, want) {
	const ap = passive(poke, 'attachPing'); if (!ap || ap.type !== type) return;
	const all = oppActives(S, p.seat);
	const ok = want && want.zone === 'active' && all.some(l => l.seat === want.seat && l.idx === want.idx);
	const loc = ok ? want : yield* chooseTarget(S, p.seat, all, `${top(poke).ability.name}: choose the opposing Active Pokémon that takes ${ap.n} damage.`);
	if (!loc) return;
	const t = at(S, loc); t.dmg += ap.n; t.hitBy = p.seat; (pingCredit = pingCredit || new Map()).set(t.uid, p.seat);
	log(S, { k: 'damage', seat: p.seat, msg: `${top(poke).ability.name} does ${ap.n} damage to ${label(S, loc)}.` });
}
function setStatus(S, poke, s, bySeat, n) {
	{ const loc = locate(S, poke), sh = loc && inPlay(S.players[loc.seat]).map(m => passive(m, 'energyNoStatus')).find(x => x && (x.type ? poke.energy.includes(x.type) : poke.energy.length)); if (sh) { log(S, { k: 'note', msg: `${pokeName(poke)} can't be affected by Special Conditions.` }); return; } }
	if (s === 'asleep' && passive(poke, 'noSleep')) { log(S, { k: 'note', msg: `${top(poke).ability.name}: ${pokeName(poke)} can't be Asleep.` }); return; }
	if (apron(poke)) { log(S, { k: 'note', msg: `${card(poke.tool).name}: ${pokeName(poke)} can't be affected by Special Conditions.` }); return; }
	if (passive(poke, 'noStatus')) { log(S, { k: 'note', msg: `${top(poke).ability.name}: ${pokeName(poke)} can't be affected by Special Conditions.` }); return; }
	if (s === 'poisoned' || s === 'burned') poke.status[s] = n ? { by: bySeat, n } : { by: bySeat };
	else { delete poke.status.asleep; delete poke.status.paralyzed; delete poke.status.confused; poke.status[s] = { by: bySeat, turn: S.turn }; }   // Asleep, Paralyzed and Confused replace each other
	log(S, { k: 'status', msg: `${pokeName(poke)} is now ${s[0].toUpperCase() + s.slice(1)}.` });
}

// ------------------------------------------------------------------------------------------------- one attack
// ctx: { seat, poke, attack, target (Pokémon or null), args, credit, slot }
function* runAttack(S, ctx) {
	const me = S.players[ctx.seat], a = ctx.attack, T = ctx.target, tLoc = T ? locate(S, T) : null, tOwner = tLoc ? S.players[tLoc.seat] : null;
	const fx = k => a.fx.find(f => f.k === k);
	let base = S.rules < 5 && a.damageWas != null ? a.damageWas : a.damage, nothing = false, selfDmg = 0, heads = 0;
	for (const g of ctx.poke.fx) if (g.k === 'atkPlus' && g.name === a.name) base += g.n;
	const shielded = T && passive(T, 'immuneEffects') && tLoc.seat !== ctx.seat;   // Regice: attacks still do damage to it, their effects do not reach it
	// --- what the damage is ---
	for (const f of a.fx) {
		if (f.k === 'coinNothing' && !flip(S, ctx.seat, a.name)) nothing = true;
		else if (f.k === 'coinsAllBonus') { let all = true; for (let i = 0; i < f.coins; i++) if (!flip(S, ctx.seat, a.name)) all = false; if (all) base += f.bonus; }
		else if (f.k === 'coinsMul') { let h = 0; for (let i = 0, n = f.tool && ctx.poke.tool && card(ctx.poke.tool).name === f.tool ? f.toolCoins : f.coins; i < n; i++) if (flip(S, ctx.seat, a.name)) h++; base = f.per * h; heads = h; }
		else if (f.k === 'coinsBonusEach') { for (let i = 0; i < f.coins; i++) if (flip(S, ctx.seat, a.name)) base += f.bonus; }
		else if (f.k === 'coinsUntilTailsBonus') { while (flip(S, ctx.seat, a.name)) base += f.bonus; }
		else if (f.k === 'coinsPerPokemon') { let h = 0; for (let i = inPlay(me).length; i > 0; i--) if (flip(S, ctx.seat, a.name)) h++; base = f.per * h; }
		else if (f.k === 'targetTypeBonus') { if (T && (f.types ? f.types.some(ty => isT(T, ty)) : isT(T, f.type))) base += f.bonus; }
		else if (f.k === 'perDiscardType') base += f.n * me.discard.filter(i => card(i).kind === 'pokemon' && (!f.type || card(i).cardType === f.type)).length;
		else if (f.k === 'lowHpNothing') { if (hpOf(ctx.poke) - ctx.poke.dmg <= f.hp) nothing = true; }
		else if (f.k === 'energyTypesInPlayBonus') { if (new Set(inPlay(me).flatMap(k => k.energy)).size >= f.need) base += f.bonus; }
		else if (f.k === 'selfToolBonus') { if (ctx.poke.tool) base += f.bonus; }
		else if (f.k === 'perOwnTools') base = f.per * inPlay(me).filter(k => k.tool).length;
		else if (f.k === 'perOwnEnergyAll') base += f.n * inPlay(me).reduce((n, k) => n + k.energy.filter(x => x === f.type).length, 0);
		else if (f.k === 'sharedEnergyBonus') { if (T && ctx.poke.energy.some(x => T.energy.includes(x))) base += f.bonus; }
		else if (f.k === 'needMovedUp') { if (ctx.poke.movedUp !== S.turn) nothing = true; }
		else if (f.k === 'targetToolBonus') { if (T && T.tool) base += f.bonus; }
		else if (f.k === 'selfDamageBonus') base += ctx.poke.dmg;
		else if (f.k === 'discardToolsBonus') {
			const want = [...new Set(Array.isArray(ctx.args.tools) ? ctx.args.tools : [])].filter(i => me.hand[i] != null && card(me.hand[i]).kind === 'tool').slice(0, f.max).sort((x, y) => y - x);
			for (const i of want) { const got = me.hand.splice(i, 1)[0]; me.discard.push(got); log(S, { k: 'discard', seat: ctx.seat, msg: `${me.name} discards ${card(got).name} from their hand.` }); }
			base = f.per * want.length;
		}
		else if (f.k === 'perAllBench') base = (f.more ? base : 0) + f.per * (benched(me).length + (tOwner && tOwner !== me ? benched(tOwner).length : 0));
		else if (f.k === 'millSelfBonus') { if (me.deck.length) { const got = me.deck.shift(); me.discard.push(got); log(S, { k: 'discard', seat: ctx.seat, msg: `${me.name} discards ${card(got).name} from the top of their deck.` }); if (card(got).kind === 'pokemon' && card(got).cardType === f.type) base += f.bonus; } }
		else if (f.k === 'oppPointsBonus') { if (tOwner && tOwner.points === f.points) base += f.bonus; }
		else if (f.k === 'energyInPlayBonus') { if (inPlay(me).reduce((n, k) => n + k.energy.filter(x => x === f.type).length, 0) >= f.need) base += f.bonus; }
		else if (f.k === 'perDiscardSupporter') base += f.n * me.discard.filter(i => card(i).kind === 'supporter').length;
		else if (f.k === 'fewerPokemonBonus') { if (tOwner && inPlay(me).length < inPlay(tOwner).length) base += f.bonus; }
		else if (f.k === 'moreEnergyBonus') { if (T && ctx.poke.energy.length > T.energy.length) base += f.bonus; }
		else if (f.k === 'bothEnergyBonus') { if (T && ctx.poke.energy.length + T.energy.length >= f.need) base += f.bonus; }
		else if (f.k === 'stadiumBonus') { if (S.stadium) base += f.bonus; }
		else if (f.k === 'coinsPerNamed') { let h = 0; for (let i = inPlay(me).filter(k => f.names.includes(pokeName(k))).length; i > 0; i--) if (flip(S, ctx.seat, a.name)) h++; base = f.per * h; }
		else if (f.k === 'coinDamageOrHeal') { if (flip(S, ctx.seat, a.name)) base = f.dmg; else { base = 0; ctx.healT = f.heal; } }
		else if (f.k === 'discardHasBonus') { if (me.discard.some(i => card(i).name === f.name)) base += f.bonus; }
		else if (f.k === 'minusSelfDamage') base = Math.max(0, base - ctx.poke.dmg);
		else if (f.k === 'perOppDeckTrainer') { if (tOwner) base += f.n * tOwner.deck.filter(i => card(i).kind !== 'pokemon').length; }
		else if (f.k === 'handCountBonus') { if (f.counts.includes(me.hand.length)) base += f.bonus; }
		else if (f.k === 'lowHpBonus') { if (hpOf(ctx.poke) - ctx.poke.dmg <= f.hp) base += f.bonus; }
		else if (f.k === 'perOppAbility') { if (tOwner) base += f.n * inPlay(tOwner).filter(k => top(k).ability).length; }
		else if (f.k === 'topRetreatMul') { const seen = me.deck.slice(0, f.n), hit = seen.filter(i => card(i).kind === 'pokemon' && (card(i).retreat || 0) >= f.need).length; base = f.per * hit; log(S, { k: 'reveal', seat: ctx.seat, msg: `${me.name} reveals ${seen.map(i => card(i).name).join(', ') || 'no cards'} from the top of their deck.` }); S.rand.shuffle(me.deck); }
		else if (f.k === 'coinsAllTailsNothing') { let h = 0; for (let i = 0; i < f.coins; i++) if (flip(S, ctx.seat, a.name)) h++; if (!h) nothing = true; }
		else if (f.k === 'coinsDiscardOrNothing') { let h = 0; for (let i = 0; i < f.coins; i++) if (flip(S, ctx.seat, a.name)) h++; if (!h && !f.soft) nothing = true; ctx.twist = h; }
		else if (f.k === 'discardHandCost') {
			if (me.hand.length < f.n) nothing = true;
			else { const want = [...new Set(Array.isArray(ctx.args.cards) ? ctx.args.cards : [])].filter(i => me.hand[i] != null).slice(0, f.n); for (let i = 0; want.length < f.n; i++) if (!want.includes(i)) want.push(i);
				for (const i of want.sort((x, y) => y - x)) { const got = me.hand.splice(i, 1)[0]; me.discard.push(got); log(S, { k: 'discard', seat: ctx.seat, msg: `${me.name} discards ${card(got).name} from their hand.` }); } }
		}
		else if (f.k === 'hasEnergyBonus') { if (ctx.poke.energy.includes(f.type)) base += f.bonus; }
		else if (f.k === 'targetNameBonus') { if (T && pokeName(T) === f.name) base += f.bonus; }
		else if (f.k === 'energyTypesBonus') { if (new Set(ctx.poke.energy).size >= f.need) base += f.bonus; }
		else if (f.k === 'discardTargetTools') { if (T && T.tool && !shielded) dropTool(S, T, a.name); }   // "before doing damage" 
		else if (f.k === 'coinsUntilTails') { let h = 0; while (flip(S, ctx.seat, a.name)) h++; base = f.per * h; }
		else if (f.k === 'coinBonus') { if (flip(S, ctx.seat, a.name)) base += f.bonus; else if (f.tailsSelf) selfDmg += f.tailsSelf; }
		else if (f.k === 'extraEnergyBonus') { if (extraEnergy(provided(S, ctx.poke), costOf(S, ctx.poke, a), f.type) >= f.need) base += f.bonus; }
		else if (f.k === 'coinsPerEnergy') { let h = 0; for (let i = provided(S, ctx.poke).filter(x => !f.type || x === f.type).length; i > 0; i--) if (flip(S, ctx.seat, a.name)) h++; base = (f.more ? base : 0) + f.per * h; }
		else if (f.k === 'perOppBench') { if (tOwner) base += f.n * benched(tOwner).length; }
		else if (f.k === 'perOwnBench') base += f.n * benched(me).length;
		else if (f.k === 'perBenchNames') base += f.n * benched(me).filter(k => f.names.includes(pokeName(k))).length;
		else if (f.k === 'coinTailsSelf') { if (!flip(S, ctx.seat, a.name)) selfDmg += f.n; }
		else if (f.k === 'targetBasicBonus') { if (T && top(T).stage === 0) base += f.bonus; }
		else if (f.k === 'moreHpBonus') { if (T && hpOf(T) - T.dmg > hpOf(ctx.poke) - ctx.poke.dmg) base += f.bonus; }
		else if (f.k === 'targetStatusBonus') { if (T && Object.keys(T.status).length) base += f.bonus; }
		else if (f.k === 'targetAbilityBonus') { if (T && top(T).ability) base += f.bonus; }
		else if (f.k === 'benchDamagedBonus') { if (benched(me).some(k => k.dmg > 0)) base += f.bonus; }
		else if (f.k === 'perSelfEnergyBonus') base += f.n * ctx.poke.energy.filter(x => !f.type || x === f.type).length;
		else if (f.k === 'perTargetRetreat') { if (T) base += f.n * retreatCost(S, T); }
		else if (f.k === 'selfUndamagedBonus') { if (!ctx.poke.dmg) base += f.bonus; }
		else if (f.k === 'targetBurnedBonus') { if (T && T.status.burned) base += f.bonus; }
		else if (f.k === 'targetEvolvedBonus') { if (T && top(T).stage > 0) base += f.bonus; }
		else if (f.k === 'wasHitBonus') { if (ctx.poke.hitAt != null && ctx.poke.hitAt === me.turns) base += f.bonus; }
		else if (f.k === 'discardBenchBonus') {
			for (const i of [...new Set(Array.isArray(ctx.args.discard) ? ctx.args.discard : [])]) { const b = me.bench[i]; if (!b || !isT(b, f.type)) continue; me.bench[i] = null; log(S, { k: 'discard', seat: ctx.seat, msg: `${a.name}: ${me.name} discards ${pokeName(b)} from the Bench.` }); discardPoke(S, me, b); base += f.bonus; }
		}
		else if (f.k === 'relayBonus') { if (me.relayTurn != null && me.relayTurn === me.turns - 1) base += f.bonus; ctx.relay = true; }
		else if (f.k === 'evolvedBonus') { if (ctx.poke.turnEvolved === S.turn && (!f.from || (ctx.poke.cards.length > 1 && card(ctx.poke.cards[ctx.poke.cards.length - 2]).name === f.from))) base += f.bonus; }
		else if (f.k === 'perOppEnergyAll') base = tOwner ? f.per * inPlay(tOwner).reduce((n, k) => n + k.energy.length, 0) : 0;
		else if (f.k === 'perBenchEvolved') base += f.n * benched(me).filter(k => top(k).stage > 0).length;
		else if (f.k === 'perRelay') base = f.per * (me.relays || 0);
		else if (f.k === 'benchHasBonus') { if (benched(me).some(k => pokeName(k) === f.name)) base += f.bonus; }
		else if (f.k === 'supporterBonus') { if (me.flags.supporter) base += f.bonus; }
		else if (f.k === 'movedUpBonus') { if (ctx.poke.movedUp === S.turn) base += f.bonus; }
		else if (f.k === 'snipePerEnergy') base = T ? f.n * T.energy.length : 0;
		else if (f.k === 'revengeBonus') { if (me.flags.revenge && (!f.type || (me.flags.revengeTypes || []).includes(f.type))) base += f.bonus; }
		else if (f.k === 'benchStageBonus') { if (benched(me).some(k => top(k).stage === f.stage)) base += f.bonus; }
		else if (f.k === 'coinsTable') { let h = 0; for (let i = 0; i < f.coins; i++) if (flip(S, ctx.seat, a.name)) h++; base += f.table[h]; }
		else if (f.k === 'firstUseBonus') { if (!ctx.poke.used) base += f.bonus; }
		else if (f.k === 'perOwnKO') base += f.n * (me.fallen || 0);
		else if (f.k === 'perEnergyType') base += f.n * new Set(ctx.poke.energy).size;
		else if (f.k === 'targetAsleepBonus') { if (T && T.status.asleep) base += f.bonus; }
		else if (f.k === 'oppHasTypeBonus') { if (tOwner && inPlay(tOwner).some(k => isT(k, f.type))) base += f.bonus; }
		else if (f.k === 'perAttackName') { const has = i => card(i).kind === 'pokemon' && (card(i).attacks || []).some(x => x.name === f.name), n = inPlay(me).filter(k => has(k.cards[k.cards.length - 1])).length + me.hand.filter(has).length; base = f.per * n; log(S, { k: 'reveal', seat: ctx.seat, msg: `${me.name} reveals ${n} Pokémon in play and in their hand that have ${f.name}.` }); }
		else if (f.k === 'coinsDiscardBonus') { let n = 0; for (let i = 0; i < f.coins; i++) if (flip(S, ctx.seat, a.name)) { const j = ctx.poke.energy.indexOf(f.type); if (j >= 0) { ed(me).push(ctx.poke.energy.splice(j, 1)[0]); n++; } } base += f.per * n; if (n) log(S, { k: 'energy', seat: ctx.seat, msg: `${pokeName(ctx.poke)} discards ${n} ${f.type} Energy.` }); }
		else if (f.k === 'targetConfusedBonus') { if (T && T.status.confused) base += f.bonus; }
		else if (f.k === 'perOwnPoint') base += f.n * me.points;
		else if (f.k === 'oppHandCountBonus') { if (tOwner && f.counts.includes(tOwner.hand.length)) base += f.bonus; }
		else if (f.k === 'targetExBonus') { if (T && top(T).ex) base += f.bonus; }
		else if (f.k === 'selfDamagedBonus') { if (ctx.poke.dmg > 0) base += f.bonus; }
		else if (f.k === 'targetDamagedBonus') { if (T && T.dmg > 0) base += f.bonus; }
		else if (f.k === 'targetPoisonedBonus') { if (T && T.status.poisoned) base += f.bonus; }
		else if (f.k === 'perTargetEnergy') { if (T) base = (f.only ? 0 : base) + f.n * T.energy.length; }
		else if (f.k === 'perBench') base = f.n * benched(me).filter(k => !f.type || isT(k, f.type)).length;
		else if (f.k === 'perBenchName') base += f.n * benched(me).filter(k => pokeName(k) === f.name).length;
		else if (f.k === 'selfDamage') selfDmg += f.n;
		else if (f.k === 'snipe') base = f.n;
	}
	if (ctx.relay) { me.relayNow = true; me.relays = (me.relays || 0) + 1; }   // Sweets Relay was used (it counts for next turn, and for the match)
	if (nothing) { log(S, { k: 'note', msg: `${a.name} does nothing.` }); return; }
	if (fx('copyAttack') && fx('copyAttack').coin && !flip(S, ctx.seat, a.name)) { log(S, { k: 'note', msg: `${a.name} does nothing.` }); return; }
	// --- an attack chosen at random from the Pokémon in the Defending Pokémon's owner's hand and deck (Mew's Miraculous Memory) ---
	if (fx('randomCopy')) {
		const pool = tOwner ? [...tOwner.hand, ...tOwner.deck].filter(i => card(i).kind === 'pokemon').flatMap(i => card(i).attacks.map(x => [i, x])) : [];
		if (!pool.length) { log(S, { k: 'note', msg: `${a.name} does nothing: there is no Pokémon in that hand and deck.` }); return; }
		const [ci, ca] = S.rand.pick(pool);
		log(S, { k: 'note', msg: `${a.name}: ${card(ci).name}'s ${ca.name} is chosen.` });
		if (ca.fx.some(f => f.k === 'copyAttack' || f.k === 'randomCopy')) { log(S, { k: 'note', msg: `${ca.name} does nothing.` }); return; }
		yield* runAttack(S, { ...ctx, attack: ca, args: {} });
		return;
	}
	// --- the copied attack (Ditto): the chosen attack, run as this Pokémon's, into this attack's target ---
	if (fx('copyAttack')) {
		const cf = fx('copyAttack'), fr = ctx.args.from, okFrom = fr && (cf.own ? fr.seat === ctx.seat && fr.zone === 'bench' && !!at(S, fr) && !top(at(S, fr)).ex : (!cf.active || (fr.zone === 'active' && fr.seat !== ctx.seat)));
		const from = okFrom && at(S, ctx.args.from), ca = from && top(from).attacks[ctx.args.attack | 0];
		if (!ca || (!cf.free && !canPay(provided(S, ctx.poke), costOf(S, ctx.poke, ca))) || ca.fx.some(f => f.k === 'copyAttack')) { log(S, { k: 'note', msg: `${a.name} does nothing.` }); return; }
		log(S, { k: 'note', msg: `${pokeName(ctx.poke)} copies ${pokeName(from)}'s ${ca.name}.` });
		yield* runAttack(S, { ...ctx, attack: ca, args: ctx.args.copyArgs || {} });
		return;
	}
	// --- the hits ---
	let dealt = 0;
	if (fx('randomHitsAny')) {
		const f = fx('randomHitsAny');
		for (let i = 0; i < f.times; i++) { const pool = S.players.filter(q => !q.eliminated).flatMap(q => inPlay(q)).filter(k => k !== ctx.poke); if (!pool.length) break; attackDamage(S, ctx, S.rand.pick(pool), f.n); }
	} else if (fx('randomHits')) {
		const f = fx('randomHits'), victim = tOwner;
		for (let i = 0, n = f.perEnergy ? ctx.poke.energy.filter(x => x === f.perEnergy).length : f.times; i < n; i++) { const pool = victim ? inPlay(victim) : []; if (!pool.length) break; attackDamage(S, ctx, S.rand.pick(pool), f.n); }
	} else if (fx('allOppDamage')) { const more = ctx.poke.fx.filter(g => g.k === 'atkPlus' && g.name === a.name).reduce((n, g) => n + g.n, 0); for (const k of tOwner ? inPlay(tOwner) : []) attackDamage(S, ctx, k, fx('allOppDamage').n + more); }
	else if (T && (base > 0 || a.damage > 0 || a.damageMode)) dealt = attackDamage(S, ctx, T, base);
	if (ctx.healT && T && locate(S, T)) { const h = hl(S, ctx.healT, T.dmg); T.dmg -= h; log(S, { k: 'heal', msg: `${a.name}: ${pokeName(T)} heals ${h} damage.` }); ctx.healT = 0; }
	if (fx('twice') && T) {   // Mega Kangaskhan ex: a second hit, on the Pokémon that stands in that slot once any Knock Out is settled
		let t2 = T;
		if (T.dmg >= hpOf(T)) { yield* settle(S, ctx.credit, ctx.seat, { name: ctx.name }); if (S.over) return; const q = S.players[tLoc.seat]; t2 = q.eliminated ? null : q.active[tLoc.idx] || actives(q)[0] || null; }
		if (t2 && locate(S, ctx.poke)) attackDamage(S, ctx, t2, fx('twice').n, `${a.name} (second attack)`);
	}
	const hitBlocked = T && (hasFx(T, 'prevent') || shielded) && tLoc.seat !== ctx.seat;   // Dig, Crystal Body: effects of the attack are prevented
	if (fx('koRecoil') && T && dealt > 0 && T.dmg >= hpOf(T)) selfDmg += fx('koRecoil').n;
	// --- everything else the attack does ---
	for (const f of a.fx) {
		if (f.k === 'nextTurnBoost') { (me.boostNext = me.boostNext || []).push({ n: f.n, names: null, from: a.name, ex: false, cardType: f.cardType || null }); log(S, { k: 'status', msg: `During ${me.name}'s next turn, their Pokémon's attacks do +${f.n} damage.` }); }
		else if (f.k === 'randomEnergyAll') { let gone = 0; for (let i = 0; i < f.n; i++) { const pool = S.players.filter(q => !q.eliminated).flatMap(q => inPlay(q).flatMap(k => k.energy.map((_, n) => [q, k, n]))); if (!pool.length) break; const [q, k, n] = S.rand.pick(pool); const en = k.energy.splice(n, 1)[0]; ed(q).push(en); gone++; log(S, { k: 'energy', msg: `${q.name}'s ${pokeName(k)} loses a ${en} Energy.` }); } if (!gone) log(S, { k: 'note', msg: 'No Energy is in play.' }); }
		else if (f.k === 'attachZoneSpread') {
			const fit = ['active', 'bench'].flatMap(z => me[z].map((m, idx) => (m && isT(m, f.type) ? { seat: ctx.seat, zone: z, idx } : null)).filter(Boolean)), want = Array.isArray(ctx.args.spreadLocs) ? ctx.args.spreadLocs : [];
			if (!fit.length) log(S, { k: 'note', msg: `${a.name}: no ${f.type} Pokémon to attach to.` });
			else for (let n = 0; n < f.n; n++) { const w = want[n], ok = w && fit.some(l => l.zone === w.zone && l.idx === w.idx), loc = ok ? { seat: ctx.seat, zone: w.zone, idx: w.idx } : fit[n % fit.length]; if (at(S, loc)) yield* attachFromZone(S, me, at(S, loc), f.type, a.name); }
		}
		else if (f.k === 'coinAttachBench') { if (flip(S, ctx.seat, a.name)) { const k = me.bench[ctx.args.bench] || benched(me)[0]; if (k) for (let i = 0; i < f.n; i++) yield* attachFromZone(S, me, k, f.type, a.name); else log(S, { k: 'note', msg: `${a.name}: no Benched Pokémon to attach to.` }); } }
		else if (f.k === 'discardStadium') { if (S.stadium) dropStadium(S, a.name); else log(S, { k: 'note', msg: 'No Stadium is in play.' }); }
		else if (f.k === 'retreatTrap') ctx.poke.fx.push({ k: 'retreatTrap', n: f.n, by: ctx.seat, from: a.name, until: { seat: ctx.seat, at: 'start' } });
		else if (f.k === 'selfReduceEx') ctx.poke.fx.push({ k: 'reduceEx', n: f.n, until: { seat: ctx.seat, at: 'start' } });
		else if (f.k === 'benchFromDeckNames') {
			let put = 0; for (let i = 0; i < f.n; i++) { const free = me.bench.indexOf(null), idxs = me.deck.map((d, n) => (f.names.includes(card(d).name) ? n : -1)).filter(n => n >= 0); if (free < 0 || !idxs.length) break; const id2 = me.deck.splice(S.rand.pick(idxs), 1)[0]; me.bench[free] = makePoke(S, id2); put++; log(S, { k: 'play', seat: ctx.seat, msg: `${me.name} puts ${card(id2).name} from their deck onto the Bench.` }); }
			S.rand.shuffle(me.deck); if (!put) log(S, { k: 'note', msg: `${a.name}: nothing could be put onto the Bench.` });
		}
		else if (f.k === 'extraEnergyAlsoBench') {
			if (extraEnergy(provided(S, ctx.poke), costOf(S, ctx.poke, a), f.type) >= f.need) {
				const all = opponents(S, ctx.seat).flatMap(q => benched(q)), want = (Array.isArray(ctx.args.alsoList) ? ctx.args.alsoList : []).map(l => (l && l.zone === 'bench' && l.seat !== ctx.seat && S.players[l.seat] ? at(S, l) : null)).filter(k => k && all.includes(k));
				const hit = [...new Set([...want, ...all])].slice(0, f.count); for (const k of hit) attackDamage(S, ctx, k, f.n, `${a.name} (Bench)`);
			}
		}
		else if (f.k === 'kindToHand') { const idxs = me.deck.map((i, n) => (card(i).kind === f.kind ? n : -1)).filter(n => n >= 0); if (idxs.length && me.hand.length < LIMITS.maxHand) { const got = me.deck.splice(S.rand.pick(idxs), 1)[0]; me.hand.push(got); S.rand.shuffle(me.deck); log(S, { k: 'draw', seat: ctx.seat, msg: `${me.name} puts a Supporter card from their deck into their hand.`, privateTo: ctx.seat, privateMsg: `You put ${card(got).name} into your hand.` }); } else log(S, { k: 'note', msg: `${a.name}: nothing was found.` }); }
		else if (f.k === 'healOwn') { const w = ctx.args.own && ctx.args.own.seat === ctx.seat ? at(S, ctx.args.own) : null, k = w || inPlay(me).slice().sort((x, y) => y.dmg - x.dmg)[0]; if (k) { const h = hl(S, f.n, k.dmg); k.dmg -= h; log(S, { k: 'heal', msg: `${pokeName(k)} heals ${h} damage.` }); } }
		else if (f.k === 'selfNoWeakness') { ctx.poke.fx.push({ k: 'noWeakness', until: { seat: ctx.seat, at: 'start' } }); if (f.reduce && S.rules >= 4) ctx.poke.fx.push({ k: 'reduce', n: f.reduce, until: { seat: ctx.seat, at: 'start' } }); }   // (Mega Steelix ex's -20: rules revision 4; matches recorded before it replay without it)
		else if (f.k === 'shuffleSelfIntoDeck' && f.may && !ctx.args.shuffle) { /* "you may": it stays */ }
		else if (f.k === 'shuffleSelfIntoDeck') { if (locate(S, ctx.poke)) { if (f.all && ctx.poke.tool) { me.deck.push(ctx.poke.tool); ctx.poke.tool = null; } const back = ctx.poke.cards.slice(); removeFromPlay(S, ctx.poke); me.deck.push(...back); if (ctx.poke.tool) { me.discard.push(ctx.poke.tool); ctx.poke.tool = null; } ed(me).push(...ctx.poke.energy); ctx.poke.energy = []; S.rand.shuffle(me.deck); log(S, { k: 'note', seat: ctx.seat, msg: `${me.name} shuffles ${back.map(i => card(i).name).join(', ')} into their deck.` }); } }
		else if (f.k === 'allOppDamage') { if (f.grow && locate(S, ctx.poke)) ctx.poke.fx.push({ k: 'atkPlus', name: a.name, n: f.grow, until: { seat: ctx.seat, at: 'end', skip: 1 } }); }
		else if (f.k === 'randomBench') { for (let i = 0; i < f.times; i++) { const pool = tOwner ? benched(tOwner) : []; if (!pool.length) break; attackDamage(S, ctx, S.rand.pick(pool), f.n, `${a.name} (Bench)`); } }
		else if (f.k === 'evolveSelfFromDeck') { if (locate(S, ctx.poke)) evolveFromDeck(S, me, ctx.poke, a.name); }
		else if (f.k === 'healBenchBasics') { for (const b of benched(me)) if (top(b).stage === 0) { const h = hl(S, f.n, b.dmg); if (h) { b.dmg -= h; log(S, { k: 'heal', msg: `${pokeName(b)} heals ${h} damage.` }); } } }
		else if (f.k === 'selfPreventSmall') ctx.poke.fx.push({ k: 'preventSmall', n: f.n, until: { seat: ctx.seat, at: 'start' } });
		else if (f.k === 'selfPreventFromBasic') ctx.poke.fx.push({ k: 'preventFromBasic', until: { seat: ctx.seat, at: 'start' } });
		else if (f.k === 'selfAtkPlusLasting') { if (locate(S, ctx.poke)) ctx.poke.fx.push({ k: 'atkPlus', name: a.name, n: f.n }); }   // (no end: it lasts until the Pokémon leaves its Active slot)
		else if (f.k === 'healBench') { const b = me.bench[ctx.args.bench] || benched(me).slice().sort((x, y) => y.dmg - x.dmg)[0]; if (b) { const h = hl(S, f.n, b.dmg); b.dmg -= h; log(S, { k: 'heal', msg: `${pokeName(b)} heals ${h} damage.` }); } }
		else if (f.k === 'millTarget') { if (tOwner) for (let i = 0; i < f.n && tOwner.deck.length; i++) { const got = tOwner.deck.shift(); tOwner.discard.push(got); log(S, { k: 'discard', msg: `${tOwner.name} discards ${card(got).name} from the top of their deck.` }); } }
		else if (f.k === 'coinTailsDiscardSelf') { if (!flip(S, ctx.seat, a.name)) { let gone = 0; for (let i = 0; i < f.n && ctx.poke.energy.length; i++) { ed(me).push(ctx.poke.energy.splice(S.rand.int(ctx.poke.energy.length), 1)[0]); gone++; } log(S, { k: 'energy', msg: `${pokeName(ctx.poke)} loses ${gone} Energy.` }); } }
		else if (f.k === 'attachZoneTypes') {
			const fit = me.bench.map((b, i) => (b && top(b).stage === 0 ? i : -1)).filter(i => i >= 0);
			if (!fit.length) log(S, { k: 'note', msg: `${a.name}: no Benched Basic Pokémon to attach to.` });
			else for (let n = 0; n < f.types.length; n++) { const want = Array.isArray(ctx.args.spread) ? ctx.args.spread[n] : null, i = fit.includes(want) ? want : fit[n % fit.length]; yield* attachFromZone(S, me, me.bench[i], f.types[n], a.name); }
		}
		else if (f.k === 'attachZone' && f.basic) { const ok = b => b && top(b).stage === 0, k = ok(me.bench[ctx.args.bench]) ? me.bench[ctx.args.bench] : benched(me).find(ok); if (k) yield* attachFromZone(S, me, k, f.type, a.name); else log(S, { k: 'note', msg: `${a.name}: no Benched Basic Pokémon to attach to.` }); }
		else if (f.k === 'moveAllEnergyToBench' && f.type) { const b = me.bench[ctx.args.bench] || benched(me)[0], mv = ctx.poke.energy.filter(x => x === f.type); if (b && mv.length) { b.energy.push(...mv); ctx.poke.energy = ctx.poke.energy.filter(x => x !== f.type); log(S, { k: 'energy', seat: ctx.seat, msg: `${mv.length} ${f.type} Energy moves from ${pokeName(ctx.poke)} to ${pokeName(b)}.` }); } }
		else if (f.k === 'moveAllEnergyToBench') { const b = me.bench[ctx.args.bench] || benched(me)[0]; if (b && ctx.poke.energy.length) { const n = ctx.poke.energy.length; b.energy.push(...ctx.poke.energy); ctx.poke.energy = []; log(S, { k: 'energy', seat: ctx.seat, msg: `${n} Energy moves from ${pokeName(ctx.poke)} to ${pokeName(b)}.` }); } }
		else if (f.k === 'drawToMatch') { const n = tOwner ? tOwner.hand.length - me.hand.length : 0; if (n > 0) draw(S, me, n); else log(S, { k: 'note', msg: `${me.name} draws no cards.` }); }
		else if (f.k === 'attachRandomType') { const b = me.bench[ctx.args.bench] || benched(me)[0]; if (b) yield* attachFromZone(S, me, b, S.rand.pick(f.types), a.name); else log(S, { k: 'note', msg: `${a.name}: no Benched Pokémon to attach to.` }); }
		else if (f.k === 'coinAttachSelf') { if (flip(S, ctx.seat, a.name)) for (let i = 0; i < f.n; i++) yield* attachFromZone(S, me, ctx.poke, f.type, a.name); }
		else if (f.k === 'moveRandomEnergyToBench') { const b = me.bench[ctx.args.bench] || benched(me)[0], moved = []; if (b) while (moved.length < f.n && ctx.poke.energy.length) { const en = ctx.poke.energy.splice(S.rand.int(ctx.poke.energy.length), 1)[0]; b.energy.push(en); moved.push(en); } if (moved.length) log(S, { k: 'energy', seat: ctx.seat, msg: `${moved.join(', ')} Energy moves from ${pokeName(ctx.poke)} to ${pokeName(b)}.` }); }
		else if (f.k === 'untilTailsMill') { let h = 0; while (flip(S, ctx.seat, a.name)) h++; if (tOwner) for (let i = 0; i < h && tOwner.deck.length; i++) { const got = tOwner.deck.shift(); tOwner.discard.push(got); log(S, { k: 'discard', msg: `${tOwner.name} discards ${card(got).name} from the top of their deck.` }); } }
		else if (f.k === 'stadiumHealSelf') { if (S.stadium && !blockHeal(S)) { const h = hl(S, f.n, ctx.poke.dmg); if (h) { ctx.poke.dmg -= h; log(S, { k: 'heal', msg: `${pokeName(ctx.poke)} heals ${h} damage.` }); } } }
		else if (f.k === 'coinsBenchSplash') { let h = 0; for (let i = 0; i < f.coins; i++) if (flip(S, ctx.seat, a.name)) h++; if (h && tOwner) for (const k of benched(tOwner)) attackDamage(S, ctx, k, f.n * h, `${a.name} (Bench)`); }
		else if (f.k === 'benchAllBoth') { for (const q of tOwner && tOwner !== me ? [me, tOwner] : [me]) for (const k of benched(q)) attackDamage(S, ctx, k, f.n, `${a.name} (Bench)`); }
		else if (f.k === 'discardOwnRandomEnergy') { for (let i = 0; i < f.n; i++) { const pool = inPlay(me).flatMap(m => m.energy.map((_, n) => [m, n])); if (!pool.length) break; const [m, n] = S.rand.pick(pool), en = m.energy.splice(n, 1)[0]; ed(me).push(en); log(S, { k: 'energy', msg: `${me.name}'s ${pokeName(m)} loses a ${en} Energy.` }); } }
		else if (f.k === 'moveEnergyToBench') { const b = me.bench[ctx.args.bench] || benched(me)[0]; let n = 0; if (b) while (n < f.n && ctx.poke.energy.includes(f.type)) { ctx.poke.energy.splice(ctx.poke.energy.indexOf(f.type), 1); b.energy.push(f.type); n++; } if (n) log(S, { k: 'energy', seat: ctx.seat, msg: `${n} ${f.type} Energy moves from ${pokeName(ctx.poke)} to ${pokeName(b)}.` }); }
		else if (f.k === 'attachSelfTypes') { for (const t of f.types) yield* attachFromZone(S, me, ctx.poke, t, a.name); }
		else if (f.k === 'discardSelfTypes') { for (const t of f.types) { const i = ctx.poke.energy.indexOf(t); if (i >= 0) ed(me).push(ctx.poke.energy.splice(i, 1)[0]); } log(S, { k: 'energy', msg: `${pokeName(ctx.poke)} discards ${f.types.join(', ')} Energy.` }); }
		else if (f.k === 'ownBenchAll') { for (const k of benched(me)) plainDamage(S, k, f.n, `${a.name} also does ${f.n} damage to ${me.name}'s own ${pokeName(k)}.`, tLoc ? tLoc.seat : null, ctx); }
		else if (f.k === 'benchSplash') { if (!f.need || benched(me).some(k => pokeName(k) === f.need)) for (const k of benched(tOwner)) if ((!f.withEnergy || k.energy.length) && (!f.damaged || k.dmg > 0)) attackDamage(S, ctx, k, f.n, `${a.name} (Bench)`); }
		else if (f.k === 'ownBenchDamage') { const k = me.bench[ctx.args.bench] || benched(me)[0]; if (k) plainDamage(S, k, f.n, `${a.name} also does ${f.n} damage to ${me.name}'s own ${pokeName(k)}.`, tLoc ? tLoc.seat : null, ctx); }
		else if (f.k === 'discardSelfEnergy') {
			let n = f.n === 'all' ? ctx.poke.energy.length : f.n, gone = 0;
			while (n-- > 0) { const i = f.type ? ctx.poke.energy.indexOf(f.type) : 0; if (i < 0 || !ctx.poke.energy.length) break; ed(me).push(ctx.poke.energy.splice(i, 1)[0]); gone++; }
			log(S, { k: 'energy', msg: `${pokeName(ctx.poke)} discards ${gone} Energy.` });
		} else if (f.k === 'draw') draw(S, me, f.n);
		else if (f.k === 'discardSelfRandom') { for (let i = f.n || 1; i > 0 && ctx.poke.energy.length; i--) { const e = ctx.poke.energy.splice(S.rand.int(ctx.poke.energy.length), 1)[0]; ed(me).push(e); log(S, { k: 'energy', msg: `${pokeName(ctx.poke)} discards a ${e} Energy.` }); } }
		else if (f.k === 'selfStatus') { if (locate(S, ctx.poke)) setStatus(S, ctx.poke, f.s, ctx.seat); }
		else if (f.k === 'selfVulnerable') ctx.poke.fx.push({ k: 'vulnerable', n: f.n, until: { seat: ctx.seat, at: 'start' } });
		else if (f.k === 'selfThorns') ctx.poke.fx.push({ k: 'thorns', n: f.n, until: { seat: ctx.seat, at: 'start' } });
		else if (f.k === 'ownAnyDamage') { const w = ctx.args.own && ctx.args.own.seat === ctx.seat ? at(S, ctx.args.own) : null, k = w || inPlay(me).find(m => m !== ctx.poke) || ctx.poke; plainDamage(S, k, f.n, `${a.name} also does ${f.n} damage to ${me.name}'s own ${pokeName(k)}.`, tLoc ? tLoc.seat : null, ctx); }
		else if (f.k === 'evolutionToHand') { const idxs = me.deck.map((i, n) => (card(i).evolvesFrom === f.name ? n : -1)).filter(n => n >= 0); if (idxs.length && me.hand.length < LIMITS.maxHand) { const got = me.deck.splice(S.rand.pick(idxs), 1)[0]; me.hand.push(got); S.rand.shuffle(me.deck); log(S, { k: 'draw', seat: ctx.seat, msg: `${me.name} puts a card that evolves from ${f.name} into their hand.`, privateTo: ctx.seat, privateMsg: `You put ${card(got).name} into your hand.` }); } else log(S, { k: 'note', msg: `${a.name}: nothing was found.` }); }
		else if (f.k === 'selfCantUse') ctx.poke.fx.push({ k: 'cantUse', name: f.name, until: { seat: ctx.seat, at: 'end', skip: 1 } });
		else if (f.k === 'selfCantAttack') { if (!f.tails || !flip(S, ctx.seat, a.name)) ctx.poke.fx.push({ k: 'cantAttack', until: { seat: ctx.seat, at: 'end', skip: 1 } }); }
		else if (f.k === 'selfNextBoost') ctx.poke.fx.push({ k: 'atkPlus', name: f.name, n: f.n, until: { seat: ctx.seat, at: 'end', skip: 1 } });
		else if (f.k === 'millSelf') { const gone = me.deck.splice(0, f.n); me.discard.push(...gone); log(S, { k: 'discard', seat: ctx.seat, msg: `${me.name} discards the top ${gone.length} card${gone.length === 1 ? '' : 's'} of their deck: ${gone.map(i => card(i).name).join(', ') || 'none'}.` }); }
		else if (f.k === 'alsoBench' && f.coin && !flip(S, ctx.seat, a.name)) { /* tails: nothing more */ }
		else if (f.k === 'alsoBench') {
			const w = ctx.args.also, ok = w && w.zone === 'bench' && w.seat !== ctx.seat && S.players[w.seat] && !S.players[w.seat].eliminated && at(S, w);
			const k = ok ? at(S, w) : (tOwner && benched(tOwner)[0]) || opponents(S, ctx.seat).flatMap(q => benched(q))[0];
			if (k) attackDamage(S, ctx, k, f.n, `${a.name} (Bench)`);
		} else if (f.k === 'attachZoneEach') {
			const fit = me.bench.map((b, i) => (b ? i : -1)).filter(i => i >= 0), want = [...new Set(Array.isArray(ctx.args.spread) ? ctx.args.spread.filter(i => fit.includes(i)) : [])];
			for (const i of [...want, ...fit.filter(i => !want.includes(i))].slice(0, f.n)) yield* attachFromZone(S, me, me.bench[i], f.type, a.name);
		} else if (f.k === 'attachZoneNamed') {
			const w = ctx.args.at && ctx.args.at.seat === ctx.seat ? at(S, ctx.args.at) : null, k = w && f.names.includes(pokeName(w)) ? w : inPlay(me).find(m => f.names.includes(pokeName(m)));
			if (k) yield* attachFromZone(S, me, k, f.type, a.name); else log(S, { k: 'note', msg: `${a.name}: there is no ${f.names.join(' or ')} to attach to.` });
		}
		else if (f.k === 'healAllOwn') { for (const m of inPlay(me)) { if (f.type && !isT(m, f.type)) continue; const h = hl(S, f.n, m.dmg); if (h) { m.dmg -= h; log(S, { k: 'heal', msg: `${pokeName(m)} heals ${h} damage.` }); } } }
		else if (f.k === 'discardRandomAny') {
			const pool = []; for (const q of S.players) for (const k of inPlay(q)) k.energy.forEach((e, i) => pool.push([q, k, i]));
			if (!pool.length) log(S, { k: 'note', msg: `${a.name}: there is no Energy in play to discard.` });
			else { const [q, k, i] = S.rand.pick(pool), e = k.energy.splice(i, 1)[0]; log(S, { k: 'energy', msg: `${a.name}: ${q.name}'s ${pokeName(k)} loses a ${e} Energy.` }); }
		} else if (f.k === 'heal') { const h = hl(S, f.n, ctx.poke.dmg); ctx.poke.dmg -= h; log(S, { k: 'heal', msg: `${pokeName(ctx.poke)} heals ${h} damage.` }); }
		else if (f.k === 'healDealt') { const h = hl(S, dealt, ctx.poke.dmg); ctx.poke.dmg -= h; log(S, { k: 'heal', msg: `${pokeName(ctx.poke)} heals ${h} damage.` }); }
		else if (f.k === 'selfReduce') { if (!f.coin || flip(S, ctx.seat, a.name)) ctx.poke.fx.push({ k: 'reduce', n: f.n, until: { seat: ctx.seat, at: 'start' } }); }
		else if (f.k === 'coinPrevent') { if (f.sure || flip(S, ctx.seat, a.name)) ctx.poke.fx.push({ k: f.damageOnly ? 'preventDamage' : 'prevent', until: { seat: ctx.seat, at: 'start' } }); }
		else if (f.k === 'benchFromDeck') {
			const free = me.bench.indexOf(null), idxs = me.deck.map((id, i) => (card(id).name === f.name ? i : -1)).filter(i => i >= 0);
			if (free < 0 || !idxs.length) log(S, { k: 'note', msg: `${a.name}: no ${f.name} could be put onto the Bench.` });
			else { const id = me.deck.splice(S.rand.pick(idxs), 1)[0]; me.bench[free] = makePoke(S, id); S.rand.shuffle(me.deck); log(S, { k: 'play', seat: ctx.seat, msg: `${me.name} puts ${f.name} from their deck onto the Bench.` }); }
		} else if (f.k === 'typeToHand') {
			const idxs = me.deck.map((id, i) => (card(id).kind === 'pokemon' && (!f.type || card(id).cardType === f.type) ? i : -1)).filter(i => i >= 0);
			if (!idxs.length || me.hand.length >= LIMITS.maxHand) log(S, { k: 'note', msg: `${a.name}: nothing was found.` });
			else { const id = me.deck.splice(S.rand.pick(idxs), 1)[0]; me.hand.push(id); S.rand.shuffle(me.deck); log(S, { k: 'draw', seat: ctx.seat, msg: `${me.name} puts a ${f.type ? f.type + ' ' : ''}Pokémon from their deck into their hand.`, privateTo: ctx.seat, privateMsg: `You put ${card(id).name} into your hand.` }); }
		} else if (f.k === 'attachZone') {
			const to = (S.rules < 5 && f.toWas) || f.to, k = to === 'self' ? ctx.poke : to === 'bench' ? (me.bench[ctx.args.bench] || benched(me)[0]) : (me.bench[ctx.args.bench] && isT(me.bench[ctx.args.bench], f.type) ? me.bench[ctx.args.bench] : benched(me).find(b => isT(b, f.type)));
			if (k) { for (let i = f.n || 1; i > 0; i--) yield* attachFromZone(S, me, k, f.type, a.name); } else log(S, { k: 'note', msg: `${a.name}: no Benched ${f.to === 'bench' ? '' : f.type + ' '}Pokémon to attach to.` });
		} else if (f.k === 'coinsAttachBench') {
			let h = 0; for (let i = 0; i < f.coins; i++) if (flip(S, ctx.seat, a.name)) h++;
			const fit = me.bench.map((b, i) => (b && isT(b, f.type) ? i : -1)).filter(i => i >= 0), want = Array.isArray(ctx.args.spread) ? ctx.args.spread.filter(i => fit.includes(i)) : [];
			for (let i = 0; i < h && fit.length; i++) yield* attachFromZone(S, me, me.bench[want[i] ?? fit[i % fit.length]], f.type, a.name);
		} else if (f.k === 'switchSelf') {
			const loc = locate(S, ctx.poke), opts = me.bench.map((b, i) => (b && (!f.type || isT(b, f.type)) ? i : -1)).filter(i => i >= 0);
			if (f.may && !opts.includes(ctx.args.bench)) continue;   // "you may": it stays unless a Benched Pokémon was chosen
			if (loc && loc.zone === 'active' && opts.length) { const i = opts.includes(ctx.args.bench) ? ctx.args.bench : opts[0]; clearOnLeaveActive(ctx.poke); me.active[loc.idx] = me.bench[i]; me.bench[i] = ctx.poke; me.active[loc.idx].movedUp = S.turn; log(S, { k: 'switch', seat: ctx.seat, msg: `${me.name} switches ${pokeName(ctx.poke)} with ${pokeName(me.active[loc.idx])}.` }); }
		}
		if (!T || !locate(S, T) || hitBlocked) continue;   // the rest are done TO the Defending Pokémon
		if (f.k === 'discardTargetEnergy') { if ((!f.coin || flip(S, ctx.seat, a.name)) && (f.type ? T.energy.includes(f.type) : T.energy.length)) { const e = T.energy.splice(f.type ? T.energy.indexOf(f.type) : S.rand.int(T.energy.length), 1)[0]; ed(tOwner).push(e); log(S, { k: 'energy', msg: `${pokeName(T)} loses a ${e} Energy.` }); } }
		else if (f.k === 'spotDoom') { (tOwner.spots = tOwner.spots || []).push({ zone: tLoc.zone, idx: tLoc.idx, n: f.n, by: ctx.seat, from: a.name }); log(S, { k: 'status', msg: `${a.name}: at the end of ${tOwner.name}'s next turn, the Pokémon in their ${tLoc.zone === 'active' ? 'Active ' + SLOT[tLoc.idx] : 'Bench ' + (tLoc.idx + 1)} takes ${f.n} damage.` }); }
		else if (f.k === 'coinDiscardTarget') { if ((f.coins ? Array.from({ length: f.coins }, () => flip(S, ctx.seat, a.name)).every(Boolean) : flip(S, ctx.seat, a.name)) && locate(S, T)) { removeFromPlay(S, T); log(S, { k: 'discard', msg: `${a.name}: ${tOwner.name}'s ${pokeName(T)} is discarded.` }); discardPoke(S, tOwner, T); } }
		else if (f.k === 'chooseStatus') setStatus(S, T, f.list.includes(ctx.args.status) ? ctx.args.status : f.list[0], ctx.seat);
		else if (f.k === 'targetAttachSleep') { T.fx.push({ k: 'attachSleep', until: { seat: tLoc.seat, at: 'end' } }); log(S, { k: 'status', msg: `During ${tOwner.name}'s next turn, an Energy from their Energy Zone will put ${pokeName(T)} to sleep.` }); }
		else if (f.k === 'coinsDiscardOrNothing') { let gone = 0; for (let i = 0; i < (ctx.twist || 0) && T.energy.length; i++) { ed(tOwner).push(T.energy.splice(S.rand.int(T.energy.length), 1)[0]); gone++; } log(S, { k: 'energy', msg: `${pokeName(T)} loses ${gone} Energy.` }); }
		else if (f.k === 'discardSupporterFromHand') {
			if (f.coin && !flip(S, ctx.seat, a.name)) continue;
			log(S, { k: 'reveal', msg: `${tOwner.name} reveals their hand to ${me.name}.`, privateTo: ctx.seat, privateMsg: `${tOwner.name}'s hand: ${tOwner.hand.map(i => card(i).name).join(', ') || '(empty)'}.` });
			const opts = tOwner.hand.map((i, n) => (card(i).kind === 'supporter' ? n : -1)).filter(n => n >= 0);
			if (!opts.length) { log(S, { k: 'note', msg: `${tOwner.name} has no Supporter card in hand.` }); continue; }
			const pick = opts.length === 1 ? opts[0] : yield { seat: ctx.seat, kind: 'handPick', options: opts, cards: tOwner.hand.slice(), msg: `${a.name}: choose a Supporter card from ${tOwner.name}'s hand to discard.` };
			const got = tOwner.hand.splice(opts.includes(pick) ? pick : opts[0], 1)[0]; tOwner.discard.push(got); log(S, { k: 'discard', msg: `${tOwner.name} discards ${card(got).name} from their hand.` });
		}
		else if (f.k === 'coinStatuses') { if (flip(S, ctx.seat, a.name)) for (const st of f.list) setStatus(S, T, st, ctx.seat); }
		else if (f.k === 'doom') { T.fx.push({ k: 'doom', n: f.n, by: ctx.seat, from: a.name, until: { seat: tLoc.seat, at: 'end' } }); log(S, { k: 'status', msg: `At the end of ${tOwner.name}'s next turn, ${pokeName(T)} will take ${f.n} damage.` }); }
		else if (f.k === 'devolveTarget') {
			if (T.cards.length > 1) { const got = T.cards.pop(); tOwner.hand.push(got); ctx.credit.set(T.uid, ctx.seat); log(S, { k: 'note', msg: `${a.name}: ${tOwner.name}'s ${card(got).name} devolves into ${pokeName(T)}; ${card(got).name} goes to their hand.` }); }
		}
		else if (f.k === 'coinStatus2') setStatus(S, T, flip(S, ctx.seat, a.name) ? f.heads : f.tails, ctx.seat);
		else if (f.k === 'coinSetHp') { if (flip(S, ctx.seat, a.name)) { const left = hpOf(T) - T.dmg; if (left > f.hp) { T.dmg = hpOf(T) - f.hp; T.hitBy = ctx.seat; } log(S, { k: 'damage', seat: ctx.seat, msg: `${a.name}: ${label(S, tLoc)} is left with ${Math.min(left, f.hp)} HP.` }); } }
		else if (f.k === 'recolorEnergy') { if (T.energy.length) { const i = S.rand.int(T.energy.length), t = S.rand.pick(TYPES8), was = T.energy[i]; T.energy[i] = t; log(S, { k: 'energy', msg: `${a.name}: a ${was} Energy on ${pokeName(T)} becomes ${t} Energy.` }); } }
		else if (f.k === 'targetCantAttack') { if (f.basic ? top(T).stage === 0 : (!f.coin || flip(S, ctx.seat, a.name))) { T.fx.push({ k: 'cantAttack', until: { seat: tLoc.seat, at: 'end' } }); log(S, { k: 'status', msg: `${pokeName(T)} can't attack during ${tOwner.name}'s next turn.` }); } }
		else if (f.k === 'targetCantRetreat') { T.fx.push({ k: 'cantRetreat', until: { seat: tLoc.seat, at: 'end' } }); log(S, { k: 'status', msg: `${pokeName(T)} can't retreat during ${tOwner.name}'s next turn.` }); }
		else if (f.k === 'targetAttackMinus') { T.fx.push({ k: 'atkMinus', n: f.n, until: { seat: tLoc.seat, at: 'end' } }); log(S, { k: 'status', msg: `${pokeName(T)}'s attacks do -${f.n} damage during ${tOwner.name}'s next turn.` }); }
		else if (f.k === 'status') { if (!f.coin || flip(S, ctx.seat, a.name)) setStatus(S, T, f.s, ctx.seat, f.n); }
		else if (f.k === 'revengeStatus') { if (me.flags.revenge) setStatus(S, T, f.s, ctx.seat); }
		else if (f.k === 'targetNoAbility') { if (locate(S, T) && locate(S, T).zone === 'active') { T.fx.push({ k: 'noAbility' }); log(S, { k: 'status', msg: `${pokeName(T)} loses all Abilities until it leaves its Active slot.` }); } }
		else if (f.k === 'noEvolve') { tOwner.noEvolve = 1; log(S, { k: 'status', msg: `${tOwner.name} can't evolve their Pokémon from their hand during their next turn.` }); }
		else if (f.k === 'stadiumStatus') { if (S.stadium) setStatus(S, T, f.s, ctx.seat); }
		else if (f.k === 'amnesia') { const list = attacksOf(T); if (list.length) { const pick = S.rand.pick(list); T.fx.push({ k: 'cantUse', name: pick.name, until: { seat: tLoc.seat, at: 'end' } }); log(S, { k: 'status', msg: `${pokeName(T)} can't use ${pick.name} during ${tOwner.name}'s next turn.` }); } }
		else if (f.k === 'firstUseStatus') { if (!ctx.poke.used) setStatus(S, T, f.s, ctx.seat); }
		else if (f.k === 'firstUseNoTrainers') { if (!ctx.poke.used) { tOwner.noTrainers = 1; log(S, { k: 'status', msg: `${tOwner.name} can't play Trainer cards during their next turn.` }); } }
		else if (f.k === 'targetVulnerableNext') { T.fx.push({ k: 'vulnerable', n: f.n, only: ctx.seat, made: S.turn, until: { seat: tLoc.seat, at: 'end', skip: 1 } }); log(S, { k: 'status', msg: `During ${me.name}'s next turn, ${pokeName(T)} takes +${f.n} damage from attacks.` }); }
		else if (f.k === 'evolvedDiscardTarget') { if (ctx.poke.turnEvolved === S.turn && ctx.poke.cards.length > 1 && card(ctx.poke.cards[ctx.poke.cards.length - 2]).name === f.from) for (let i = 0; i < f.n && T.energy.length; i++) { const en = T.energy.splice(S.rand.int(T.energy.length), 1)[0]; ed(tOwner).push(en); log(S, { k: 'energy', msg: `${pokeName(T)} loses a ${en} Energy.` }); } }
		else if (f.k === 'pullThenHit') {
			const l = locate(S, T), bi = l && tOwner.bench[ctx.args.pull] ? ctx.args.pull : tOwner.bench.findIndex(Boolean);
			if (l && l.zone === 'active' && bi >= 0) { const b = tOwner.bench[bi]; clearOnLeaveActive(T); tOwner.active[l.idx] = b; tOwner.bench[bi] = T; log(S, { k: 'switch', msg: `${a.name}: ${tOwner.name}'s ${pokeName(b)} is pulled into Active ${SLOT[l.idx]}; ${pokeName(T)} goes to the Bench.` }); attackDamage(S, ctx, b, f.n); }
			else log(S, { k: 'note', msg: `${a.name}: ${tOwner.name} has no Benched Pokémon.` });
		}
		else if (f.k === 'noTrainers') { tOwner.noTrainers = 1; log(S, { k: 'status', msg: `${tOwner.name} can't play Trainer cards during their next turn.` }); }
		else if (f.k === 'coinHandToDeck') { if ((f.sure || flip(S, ctx.seat, a.name)) && tOwner.hand.length) { const got = tOwner.hand.splice(S.rand.int(tOwner.hand.length), 1)[0]; tOwner.deck.push(got); S.rand.shuffle(tOwner.deck); log(S, { k: 'note', msg: `${tOwner.name} reveals ${card(got).name} from their hand and shuffles it into their deck.` }); } }
		else if (f.k === 'coinDiscardHand') { if ((f.sure || flip(S, ctx.seat, a.name)) && tOwner.hand.length) { const id = tOwner.hand.splice(S.rand.int(tOwner.hand.length), 1)[0]; tOwner.discard.push(id); log(S, { k: 'discard', msg: `${tOwner.name} discards ${card(id).name} from their hand.` }); } }
		else if (f.k === 'noSupporter') { tOwner.noSupporter = 1; log(S, { k: 'status', msg: `${tOwner.name} can't use Supporter cards during their next turn.` }); }
		else if (f.k === 'revealHand') log(S, { k: 'reveal', msg: `${tOwner.name} reveals their hand to ${me.name}.`, privateTo: ctx.seat, privateMsg: `${tOwner.name}'s hand: ${tOwner.hand.map(id => card(id).name).join(', ') || '(empty)'}.` });
		else if (f.k === 'coinShuffleTarget') { if (flip(S, ctx.seat, a.name)) { removeFromPlay(S, T); tOwner.deck.push(...T.cards); if (T.tool) { tOwner.deck.push(T.tool); T.tool = null; } ed(tOwner).push(...T.energy); T.energy = []; S.rand.shuffle(tOwner.deck); log(S, { k: 'note', msg: `${tOwner.name}'s ${pokeName(T)} is shuffled into their deck.` }); } }
		else if (f.k === 'switchTarget') yield* switchOut(S, tLoc, a.name);
		else if (f.k === 'headsStatus') { if (heads >= f.need) setStatus(S, T, f.s, ctx.seat); }
		else if (f.k === 'noItems') { tOwner.noItems = 1; log(S, { k: 'status', msg: `${tOwner.name} can't play Item cards during their next turn.` }); }
		else if (f.k === 'noZoneToActive') { tOwner.noZoneActive = 1; log(S, { k: 'status', msg: `${tOwner.name} can't attach Energy from their Energy Zone to their Active Pokémon during their next turn.` }); }
		else if (f.k === 'targetCostMore') { T.fx.push({ k: 'costMore', n: f.n, retreat: f.retreat, until: { seat: tLoc.seat, at: 'end' } }); log(S, { k: 'status', msg: `During ${tOwner.name}'s next turn, ${pokeName(T)}'s attacks${f.retreat ? ' and retreat' : ''} cost more.` }); }
		else if (f.k === 'coinsHandToDeck') { let h = 0; for (let i = 0; i < f.coins; i++) if (flip(S, ctx.seat, a.name)) h++; for (; h > 0 && tOwner.hand.length; h--) { const got = tOwner.hand.splice(S.rand.int(tOwner.hand.length), 1)[0]; tOwner.deck.push(got); log(S, { k: 'note', msg: `${tOwner.name} reveals ${card(got).name} from their hand and shuffles it into their deck.` }); } S.rand.shuffle(tOwner.deck); }
		else if (f.k === 'flipDiscardTargetEnergy') { let h = 0; while (flip(S, ctx.seat, a.name)) h++; let gone = 0; for (; h > 0 && T.energy.length; h--) { ed(tOwner).push(T.energy.splice(S.rand.int(T.energy.length), 1)[0]); gone++; } log(S, { k: 'energy', msg: `${pokeName(T)} loses ${gone} Energy.` }); }
		else if (f.k === 'coinsKO') { let all = true; for (let i = 0; i < f.coins; i++) if (!flip(S, ctx.seat, a.name)) all = false; if (all) { T.dmg = Math.max(T.dmg, hpOf(T)); T.hitBy = ctx.seat; ctx.credit.set(T.uid, ctx.seat); log(S, { k: 'damage', seat: ctx.seat, msg: `${a.name}: ${label(S, tLoc)} is Knocked Out.` }); } }
		else if (f.k === 'discardItemFromHand') { const idxs = tOwner.hand.map((i, n) => (card(i).kind === (f.kind || 'item') ? n : -1)).filter(n => n >= 0); if (idxs.length) { const got = tOwner.hand.splice(S.rand.pick(idxs), 1)[0]; tOwner.discard.push(got); log(S, { k: 'discard', msg: `${tOwner.name} discards ${card(got).name} from their hand.` }); } else log(S, { k: 'note', msg: `${tOwner.name} has no Item card in hand.` }); }
		else if (f.k === 'randomStatus') { const left = ['asleep', 'burned', 'confused', 'paralyzed', 'poisoned'].filter(x => !T.status[x]); if (left.length) setStatus(S, T, S.rand.pick(left), ctx.seat); }
		else if (f.k === 'halveTarget') { const left = Math.max(0, hpOf(T) - T.dmg), cut = left - Math.floor(left / 2); T.dmg += cut; T.hitBy = ctx.seat; ctx.credit.set(T.uid, ctx.seat); log(S, { k: 'damage', seat: ctx.seat, n: cut, msg: `${a.name} halves ${label(S, tLoc)}'s remaining HP: ${cut} damage. (${Math.max(0, hpOf(T) - T.dmg)}/${hpOf(T)} HP)` }); }
		else if (f.k === 'randomNextEnergy') { tOwner.zone.next = S.rand.pick(TYPES8); log(S, { k: 'energy', msg: `${a.name}: the next Energy generated for ${tOwner.name} will be ${tOwner.zone.next}.` }); }
		else if (f.k === 'coinBounceTarget') { if (flip(S, ctx.seat, a.name)) { removeFromPlay(S, T); tOwner.hand.push(...T.cards); if (T.tool) { tOwner.discard.push(T.tool); T.tool = null; } ed(tOwner).push(...T.energy); T.energy = []; log(S, { k: 'note', msg: `${tOwner.name}'s ${pokeName(T)} is put into their hand.` }); } }
		else if (f.k === 'handToDeck') {
			if (!tOwner.hand.length) { log(S, { k: 'note', msg: `${tOwner.name} has no cards in hand.` }); continue; }
			log(S, { k: 'reveal', msg: `${tOwner.name} reveals their hand to ${me.name}.`, privateTo: ctx.seat, privateMsg: `${tOwner.name}'s hand: ${tOwner.hand.map(i => card(i).name).join(', ')}.` });
			const opts = tOwner.hand.map((_, i) => i);
			const pick = opts.length === 1 ? 0 : yield { seat: ctx.seat, kind: 'handPick', options: opts, cards: tOwner.hand.slice(), msg: `${a.name}: choose a card from ${tOwner.name}'s hand to shuffle into their deck.` };
			const got = tOwner.hand.splice(opts.includes(pick) ? pick : 0, 1)[0]; tOwner.deck.push(got); S.rand.shuffle(tOwner.deck);
			log(S, { k: 'note', msg: `${me.name} shuffles ${card(got).name} from ${tOwner.name}'s hand into their deck.` });
		}
		else if (f.k === 'smokescreen' && f.lasting) { if (!hasFx(T, 'smokescreen')) T.fx.push({ k: 'smokescreen' }); log(S, { k: 'status', msg: `${pokeName(T)} may miss its attacks until it leaves its Active slot.` }); }
		else if (f.k === 'smokescreen') { T.fx.push({ k: 'smokescreen', until: { seat: tLoc.seat, at: 'end' } }); log(S, { k: 'status', msg: `${pokeName(T)} may miss its attack during ${tOwner.name}'s next turn.` }); }
		else if (f.k === 'mimicHand') { const n = tOwner.hand.length; me.deck.push(...me.hand); me.hand = []; S.rand.shuffle(me.deck); log(S, { k: 'note', msg: `${me.name} shuffles their hand into their deck and draws a card for each of ${tOwner.name}'s ${n}.` }); draw(S, me, n); }
	}
	{ const km = toolFx(ctx.poke); if (km && km.k === 'toolKoDraw' && locate(S, ctx.poke)) { const n = S.players.filter(q => q.seat !== ctx.seat).reduce((s, q) => s + inPlay(q).filter(k => k.dmg >= hpOf(k) && ctx.credit.get(k.uid) === ctx.seat && !(ctx.mitt && ctx.mitt.has(k.uid))).length, 0); if (n) { log(S, { k: 'note', msg: `${card(ctx.poke.tool).name}:` }); draw(S, me, n); } } }
	for (const b of ctx.after || []) {
		const q = S.players[b.seat], locs = q.bench.map((m, idx) => (m ? { seat: q.seat, zone: 'bench', idx } : null)).filter(Boolean); if (q.eliminated || !locs.length) continue;
		const loc = yield* chooseTarget(S, q.seat, locs, `${b.src}: choose the Benched Pokémon that takes a ${b.type} Energy.`); if (loc && at(S, loc)) yield* attachFromZone(S, q, at(S, loc), b.type, b.src);
	}
	ctx.after = [];
	if (passive(ctx.poke, 'koGuard') && locate(S, ctx.poke) && S.players.some(q => q.seat !== ctx.seat && inPlay(q).some(k => k.dmg >= hpOf(k) && ctx.credit.get(k.uid) === ctx.seat)) && !hasFx(ctx.poke, 'prevent')) { ctx.poke.fx.push({ k: 'prevent', until: { seat: ctx.seat, at: 'start' } }); log(S, { k: 'status', msg: `${top(ctx.poke).ability.name}: attacks do nothing to ${pokeName(ctx.poke)} until ${me.name}'s next turn.` }); }
	if (selfDmg && locate(S, ctx.poke)) plainDamage(S, ctx.poke, selfDmg, `${pokeName(ctx.poke)} does ${selfDmg} damage to itself.`, tLoc ? tLoc.seat : null, ctx);
}

// ----------------------------------------------------------------------------------------------------- the turn
function startTurn(S) {
	const p = S.players[S.current];
	S.turn++;
	p.flags = {};
	if (p.koByAttack) { p.flags.revenge = true; p.flags.revengeTypes = p.koTypes || []; p.koByAttack = false; }
	if (p.koTypes) delete p.koTypes;   // one of theirs fell to an attack since their last turn
	if (p.boostNext) { p.flags.boost = p.boostNext; p.boostNext = null; }
	if (p.guardEndure) p.guardEndure = null;
	if (p.guard) p.guard = null;                                          // Blue's cover lasts until their next turn
	for (const k of inPlay(p)) k.fx = k.fx.filter(f => !(f.until && f.until.seat === p.seat && f.until.at === 'start'));
	log(S, { k: 'turn', seat: p.seat, msg: `— Turn ${S.turn}: ${p.name} —` });
	draw(S, p, 1);
	for (const k of actives(p)) { const f = passive(k, 'startTurnTypeToHand'); if (!f) continue; const idxs = p.deck.map((d, n) => (card(d).kind === 'pokemon' && card(d).cardType === f.type ? n : -1)).filter(n => n >= 0); if (idxs.length && p.hand.length < LIMITS.maxHand) { const got = p.deck.splice(S.rand.pick(idxs), 1)[0]; p.hand.push(got); S.rand.shuffle(p.deck); log(S, { k: 'draw', seat: p.seat, msg: `${top(k).ability.name}: ${p.name} puts a ${f.type} Pokémon from their deck into their hand.`, privateTo: p.seat, privateMsg: `You put ${card(got).name} into your hand.` }); } }
	// the Energy Zone: one Energy is ready each turn; one that was not attached stays, it does not pile up (RULES.md).
	// The player who goes first gets none on their first turn.
	if (!(p.turns === 0 && p.seat === S.first)) { if (p.zone.cur == null) { p.zone.cur = p.zone.next; p.zone.next = p.erand.pick(p.energy); } }
	S.phase = 'main';
}
function* endTurn(S) {
	const p = S.players[S.current];
	// Pokémon Checkup: this player's Pokémon, and Pokémon whose condition this player caused (RULES.md "Checkup")
	delete p.flags.will;
	for (const q of S.players) if (q.seat !== p.seat) for (const k of inPlay(q)) { const t = toolFx(k); if (t && t.k === 'toolBarrier') dropTool(S, k, 'the end of the turn'); }
	for (const q of S.players) for (const k of inPlay(q)) { const t = toolFx(k); if (t && t.k === 'toolBerry' && k.dmg > 0 && hpOf(k) - k.dmg <= hpOf(k) / 2 && !blockHeal(S)) { const h = hl(S, t.n, k.dmg); k.dmg -= h; log(S, { k: 'heal', msg: `${card(k.tool).name}: ${q.name}'s ${pokeName(k)} heals ${h} damage.` }); dropTool(S, k); } }
	for (const k of actives(p)) {   // "at the end of your turn, if ... is in the Active Spot, heal"
		const ab = passive(k, 'endTurnHeal'), tf = toolFx(k);
		for (const [f, from] of [[ab, ab && top(k).ability.name], [tf && tf.k === 'toolEndHeal' ? tf : null, k.tool && card(k.tool).name]]) { if (!f) continue; const h = hl(S, f.n, k.dmg); if (h) { k.dmg -= h; log(S, { k: 'heal', msg: `${from}: ${pokeName(k)} heals ${h} damage.` }); } }
	}
	for (const k of actives(p)) { const f = passive(k, 'endTurnDraw'); if (f) { log(S, { k: 'ability', seat: p.seat, msg: `${top(k).ability.name}:` }); draw(S, p, f.n); } }
	{ const ht = stadiumFx('stadiumEndDraw'); if (ht && p.hand.length < ht.n) { log(S, { k: 'note', msg: `${card(S.stadium.id).name}:` }); draw(S, p, ht.n - p.hand.length); } }   // Hiking Trail
	if (p.relayNow) { p.relayTurn = p.turns; delete p.relayNow; }
	if (p.turns === 0) for (const k of inPlay(p)) { const f = passive(k, 'firstTurnAttach'); if (f) yield* attachFromZone(S, p, k, f.type, top(k).ability.name); }   // "at the end of your first turn"
	const credit = new Map();
	if (pingCredit) { for (const [u, seat] of pingCredit) credit.set(u, seat); pingCredit = null; }
	for (const q of S.players) for (const k of inPlay(q)) { const t = toolFx(k); if (t && t.k === 'toolCure' && Object.keys(k.status).length) { k.status = {}; log(S, { k: 'status', msg: `${card(k.tool).name}: ${q.name}'s ${pokeName(k)} recovers from its Special Conditions.` }); dropTool(S, k); } }
	for (const q of S.players) for (const k of actives(q)) {   // Snowy Terrain: at every Checkup, an opposing Active Pokémon its player chooses
		const f = passive(k, 'checkupPing'); if (!f || q.eliminated) continue;
		const loc = yield* chooseTarget(S, q.seat, oppActives(S, q.seat), `${top(k).ability.name}: choose the opposing Active Pokémon that takes ${f.n} damage.`), t = loc ? at(S, loc) : null;
		if (t) { t.dmg += f.n; t.hitBy = q.seat; credit.set(t.uid, q.seat); log(S, { k: 'damage', seat: q.seat, msg: `${top(k).ability.name} does ${f.n} damage to ${label(S, locate(S, t))}.` }); }
	}
	for (const q of S.players) if (!q.eliminated) for (const k of actives(q)) {   // Sand Slammer: at every Checkup, each Pokémon of every opponent
		const f = passive(k, 'checkupPingAll'); if (!f) continue;
		for (const o of opponents(S, q.seat)) for (const t of inPlay(o)) { t.dmg += f.n; t.hitBy = q.seat; credit.set(t.uid, q.seat); }
		log(S, { k: 'damage', seat: q.seat, msg: `${top(k).ability.name} does ${f.n} damage to each opposing Pokémon.` });
	}
	for (const q of S.players) if (!q.eliminated && q.seat !== p.seat) for (const k of actives(q)) if (passive(k, 'oppTurnEvolve')) { log(S, { k: 'ability', seat: q.seat, msg: `${top(k).ability.name}:` }); evolveFromDeck(S, q, k, top(k).ability.name); }   // Quick Growth
	for (const q of S.players) if (!q.eliminated && !blockHeal(S)) for (const k of inPlay(q)) {   // Blessed Salt: at every Checkup, each of its player's Pokémon
		const f = passive(k, 'checkupHealAll'); if (!f) continue;
		for (const m of inPlay(q)) { const h = hl(S, f.n, m.dmg); if (h) { m.dmg -= h; log(S, { k: 'heal', msg: `${top(k).ability.name}: ${q.name}'s ${pokeName(m)} heals ${h} damage.` }); } }
	}
	for (const q of S.players) if (!q.eliminated) for (const k of inPlay(q)) {   // Bad Dreams: at the end of every turn, each opposing Active Pokémon that is Asleep
		const f = passive(k, 'sleepPing'); if (!f) continue;
		for (const o of opponents(S, q.seat)) for (const t of actives(o)) if (t.status.asleep) { t.dmg += f.n; t.hitBy = q.seat; credit.set(t.uid, q.seat); log(S, { k: 'damage', seat: q.seat, msg: `${top(k).ability.name} does ${f.n} damage to ${o.name}'s ${pokeName(t)}.` }); }
	}
	for (const q of S.players) for (const k of inPlay(q)) {
		const st = k.status;
		if (st.burned && (q.seat === p.seat || st.burned.by === p.seat)) { k.dmg += 20; credit.set(k.uid, st.burned.by); log(S, { k: 'damage', msg: `${q.name}'s ${pokeName(k)} takes 20 damage from its Burn.` }); if (flip(S, q.seat, `${pokeName(k)} is Burned`)) { delete st.burned; log(S, { k: 'status', msg: `${pokeName(k)} is no longer Burned.` }); } }
		if (st.poisoned && (q.seat === p.seat || st.poisoned.by === p.seat)) { const lk = locate(S, k); let pn = st.poisoned.n || 10; if (lk && lk.zone === 'active') for (const o of opponents(S, q.seat)) for (const m of inPlay(o)) { const mp = passive(m, 'morePoison'); if (mp) pn += mp.n; } k.dmg += pn; credit.set(k.uid, st.poisoned.by); log(S, { k: 'damage', msg: `${q.name}'s ${pokeName(k)} takes ${pn} damage from Poison.` }); }
		if (st.asleep && (q.seat === p.seat || st.asleep.by === p.seat)) { if (flip(S, q.seat, `${pokeName(k)} is Asleep`)) { delete st.asleep; log(S, { k: 'status', msg: `${pokeName(k)} wakes up.` }); } }
		if (st.paralyzed && q.seat === p.seat && st.paralyzed.turn !== S.turn) { delete st.paralyzed; log(S, { k: 'status', msg: `${pokeName(k)} is no longer Paralyzed.` }); }
		if (q.seat === p.seat && p.spots && p.spots.length) { const l2 = locate(S, k); for (const sp of p.spots) if (l2 && l2.zone === sp.zone && l2.idx === sp.idx && !poncho(S, k)) { k.dmg += sp.n; k.hitBy = sp.by; credit.set(k.uid, sp.by); log(S, { k: 'damage', seat: sp.by, msg: `${sp.from} does ${sp.n} damage to ${q.name}'s ${pokeName(k)}.` }); } }
		if (q.seat === p.seat) for (const f of k.fx) if (f.k === 'doom' && !(f.until && f.until.skip)) { k.dmg += f.n; k.hitBy = f.by; credit.set(k.uid, f.by); log(S, { k: 'damage', seat: f.by, msg: `${f.from} does ${f.n} damage to ${q.name}'s ${pokeName(k)}.` }); }
		if (q.seat === p.seat) k.fx = k.fx.filter(f => { if (!(f.until && f.until.seat === p.seat && f.until.at === 'end')) return true; if (f.until.skip) { f.until.skip--; return true; } return false; });   // (skip: it lasts through this player's NEXT turn)
	}
	if (p.spots) p.spots = null;
	yield* settle(S, credit, null);
	if (S.over) return;
	if (p.noSupporter > 0) p.noSupporter--;
	if (p.noItems > 0) p.noItems--;
	if (p.noTrainers > 0) p.noTrainers--;
	if (p.noEvolve > 0) p.noEvolve--;
	if (p.noZoneActive > 0) p.noZoneActive--;
	p.turns++;
	// the next player still in the match
	const i = S.order.indexOf(S.current);
	for (let step = 1; step <= S.order.length; step++) { const seat = S.order[(i + step) % S.order.length]; if (!S.players[seat].eliminated) { S.current = seat; break; } }
	startTurn(S);
}

// ---------------------------------------------------------------------------------------------- legality (shared)
const mine = (S, a) => { const p = S.players[a.seat]; if (!p) no('no such player'); return p; };
function needTurn(S, a) { if (S.phase !== 'main') no('the match is not in a turn'); if (S.current !== a.seat) no('it is not your turn'); if (S.pending) no('waiting on a choice'); return S.players[a.seat]; }
function ownAt(S, p, loc, what) { if (!loc || loc.seat !== p.seat) no(`choose one of your ${what || 'Pokémon'}`); const k = at(S, loc); if (!k) no('there is no Pokémon there'); return k; }
function oppAt(S, p, loc, zone) {
	if (!loc || loc.seat === p.seat || !S.players[loc.seat] || S.players[loc.seat].eliminated) no('choose an opposing Pokémon');
	if (zone && zone !== 'any' && loc.zone !== zone) no(zone === 'active' ? 'choose an opposing Active Pokémon' : 'choose an opposing Benched Pokémon');
	const k = at(S, loc); if (!k) no('there is no Pokémon there'); return k;
}
/** The legal targets of an attack, as locations. */
export function attackTargets(S, seat, attack) {
	CUR = S;
	const hurt = attack.fx.some(f => f.k === 'snipe' && f.damaged);   // only a Pokémon that has damage on it
	if (hurt) { const all = attackTargets(S, seat, { ...attack, fx: attack.fx.map(f => (f.k === 'snipe' ? { ...f, damaged: false } : f)) }); return all.filter(l => at(S, l).dmg > 0); }
	const out = [];
	if (attack.target === 'none') return out;
	for (const q of opponents(S, seat)) {
		if (attack.target !== 'oppBench') q.active.forEach((k, idx) => { if (k) out.push({ seat: q.seat, zone: 'active', idx }); });
		if (attack.target !== 'oppActive') q.bench.forEach((k, idx) => { if (k) out.push({ seat: q.seat, zone: 'bench', idx }); });
	}
	return out;
}
/** Why this Pokémon cannot use this attack now, or null. (Energy, conditions, restrictions; not the target.) */
export function attackBlock(S, seat, poke, attack) {
	CUR = S;
	const p = S.players[seat];
	if (p.turns === 0 && seat === S.first) return 'the player who goes first cannot attack on their first turn';
	if (top(poke).fossil) return 'a fossil cannot attack';
	if (poke.status.asleep) return `${pokeName(poke)} is Asleep`;
	if (poke.status.paralyzed) return `${pokeName(poke)} is Paralyzed`;
	if (hasFx(poke, 'cantAttack')) return `${pokeName(poke)} can't attack this turn`;
	{ const sl = passive(poke, 'sealed'); if (sl && !sl.names.every(n => benched(p).some(k => pokeName(k) === n))) return `${top(poke).ability.name}: ${pokeName(poke)} can't attack without ${sl.names.join(', ')} on your Bench`; }
	if (poke.fx.some(f => f.k === 'cantUse' && f.name === attack.name)) return `${pokeName(poke)} can't use ${attack.name} this turn`;
	const nb = attack.fx.find(f => f.k === 'needBench'); if (nb && !nb.names.every(n => benched(p).some(k => pokeName(k) === n))) return `${attack.name} needs ${nb.names.join(' and ')} on your Bench`;
	if (!canPay(provided(S, poke), costOf(S, poke, attack))) return `${pokeName(poke)} does not have the Energy for ${attack.name}`;
	return null;
}
function checkCommand(S, p, slot, c) {
	if (c == null) return null;
	const poke = p.active[slot]; if (!poke) no(`Active ${SLOT[slot]} is empty`);
	const a = attacksOf(poke)[c.attack]; if (!a) no('no such attack');
	const why = attackBlock(S, p.seat, poke, a); if (why) no(why);
	let target = null;
	if (a.target !== 'none') {
		const legal = attackTargets(S, p.seat, a);
		if (!legal.length) no(`${a.name} has no legal target`);
		if (!c.target || !legal.some(l => l.seat === c.target.seat && l.zone === c.target.zone && l.idx === c.target.idx)) no(`choose a target for ${a.name}`);
		target = at(S, c.target);
	}
	return { slot, poke, attack: a, target, args: c.args || {} };
}

// ------------------------------------------------------------------------------------------------------- actions
const HANDLERS = {
	// ---- before the first turn: each player puts down their opening Pokémon ----
	*setup(S, a) {
		if (S.phase !== 'setup') no('the match has started');
		const p = mine(S, a); if (p.setup) no('you have already set up');
		const act = (a.active || []).filter(i => i != null), ben = a.bench || [], all = [...act, ...ben];
		if (act.length < 1 || act.length > 2) no('put one or two Basic Pokémon in your Active slots');
		if (ben.length > 4) no('the Bench holds four');
		if (new Set(all).size !== all.length || all.some(i => !Number.isInteger(i) || i < 0 || i >= p.hand.length)) no('choose different cards from your hand');
		if (all.some(i => !isBasicCard(p.hand[i]))) no('only Basic Pokémon can be put down at the start');
		act.forEach((i, n) => { p.active[n] = makePoke(S, p.hand[i]); });
		ben.forEach((i, n) => { p.bench[n] = makePoke(S, p.hand[i]); });
		for (const k of inPlay(p)) k.turnPlayed = -1;
		p.hand = p.hand.filter((_, i) => !all.includes(i));
		p.setup = true;
		log(S, { k: 'setup', seat: p.seat, msg: `${p.name} is ready: ${actives(p).length} Active, ${benched(p).length} on the Bench.` });
		if (S.players.every(q => q.setup)) { S.current = S.first; startTurn(S); }
	},
	*playBasic(S, a) {
		const p = needTurn(S, a), id = p.hand[a.hand]; if (id == null) no('no such card in your hand');
		if (!isBasicCard(id)) no('only a Basic Pokémon can be played this way');
		if (card(id).kind === 'item' && p.noItems > 0) no("you can't play Item cards this turn");
		if (card(id).kind !== 'pokemon' && p.noTrainers > 0) no("you can't play Trainer cards this turn");
		let zone = a.to && a.to.zone, idx = a.to && a.to.idx;
		if (zone === 'active') { if (!(idx === 0 || idx === 1) || p.active[idx]) no('that Active slot is not empty'); }
		else { zone = 'bench'; if (!(idx >= 0 && idx < 4) || p.bench[idx]) idx = p.bench.indexOf(null); if (idx < 0) no('your Bench is full'); }
		p.hand.splice(a.hand, 1);
		const k = makePoke(S, id); if (zone === 'active') p.active[idx] = k; else p.bench[idx] = k;
		const spy = zone === 'bench' && passive(k, 'onBenchReveal') && !p.flags.spy && S.phase !== 'setup';
		log(S, { k: 'play', seat: p.seat, msg: `${p.name} plays ${card(id).name} to ${where({ zone, idx })}.` });
		if (spy) {   // Infiltrating Inspection: once a turn, an opponent of its player's choice shows them their hand
			p.flags.spy = true;
			const os = opponents(S, p.seat), locs = os.map(q => { const i = q.active.findIndex(Boolean); return i >= 0 ? { seat: q.seat, zone: 'active', idx: i } : null; }).filter(Boolean);
			const loc = os.length === 1 ? { seat: os[0].seat } : locs.length ? yield* chooseTarget(S, p.seat, locs, `${top(k).ability.name}: choose an opponent (by one of their Active Pokémon) to reveal their hand.`) : null;
			const q = loc ? S.players[loc.seat] : null;
			if (q) log(S, { k: 'reveal', seat: p.seat, msg: `${top(k).ability.name}: ${q.name} reveals their hand to ${p.name}.`, privateTo: p.seat, privateMsg: `${q.name}'s hand: ${q.hand.map(i => card(i).name).join(', ') || '(empty)'}.` });
		}
		if (zone === 'bench' && S.phase !== 'setup') {
			const dv = passive(k, 'onBenchDrive');   // Legendary Drive: once a turn, it takes an Active slot and all its player's Energy in play
			if (dv && !p.flags.drive && actives(p).length) {
				p.flags.drive = true;
				if (yield { seat: p.seat, kind: 'confirm', options: [0, 1], cards: [], msg: `${top(k).ability.name}: switch ${pokeName(k)} with one of your Active Pokémon, and move all of your Energy in play to it?` }) {
					const loc = yield* chooseTarget(S, p.seat, p.active.map((m, i) => (m ? { seat: p.seat, zone: 'active', idx: i } : null)).filter(Boolean), `${top(k).ability.name}: choose your Active Pokémon that ${pokeName(k)} takes the place of.`), out = loc ? at(S, loc) : null;
					if (out) { const bi = p.bench.indexOf(k); clearOnLeaveActive(out); p.active[loc.idx] = k; p.bench[bi] = out; k.movedUp = S.turn; let n = 0; for (const m of inPlay(p)) if (m !== k && m.energy.length) { n += m.energy.length; k.energy.push(...m.energy); m.energy = []; }
						log(S, { k: 'switch', seat: p.seat, msg: `${top(k).ability.name}: ${p.name} switches ${pokeName(out)} out for ${pokeName(k)} (Active ${SLOT[loc.idx]}); ${n} Energy moves to it.` }); yield* settle(S, null, null); }   // (a Pokémon whose HP came from its Energy may fall)
				}
			}
			const rr = passive(k, 'onBenchDriveOff');   // Ancient Roar: once a turn, an opposing Active Pokémon is switched out
			if (rr && !p.flags.roar) {
				const locs = oppActives(S, p.seat).filter(l => benched(S.players[l.seat]).length);
				if (locs.length) { p.flags.roar = true; if (yield { seat: p.seat, kind: 'confirm', options: [0, 1], cards: [], msg: `${top(k).ability.name}: switch out an opposing Active Pokémon?` }) { const loc = yield* chooseTarget(S, p.seat, locs, `${top(k).ability.name}: choose the opposing Active Pokémon that is switched out.`); if (loc) yield* switchOut(S, loc, top(k).ability.name); } }
			}
		}
	},
	*evolve(S, a) {
		const p = needTurn(S, a), id = p.hand[a.hand], c = card(id); if (!c || c.kind !== 'pokemon' || c.stage === 0) no('choose an evolution card');
		const k = ownAt(S, p, a.at);
		{ const as = passive(k, 'evolveAs'); if (pokeName(k) !== c.evolvesFrom && !(as && as.name === c.evolvesFrom)) no(`${c.name} evolves from ${c.evolvesFrom}`); }
		const fast = a.at.zone === 'active' && !!passive(k, 'fastEvolve');   // Boosted Evolution: in an Active slot it may evolve on a first turn, or the turn it is played
		if (p.turns === 0 && !fast) no('you cannot evolve on your first turn');
		if ((k.turnPlayed === S.turn && !fast) || k.turnEvolved === S.turn) no(`${pokeName(k)} cannot evolve the turn it was played`);
		if (p.noEvolve > 0) no("you can't evolve your Pokémon from your hand this turn");
		if (a.at.zone === 'active' && opponents(S, p.seat).some(q => inPlay(q).some(m => passive(m, 'blockEvolveActive')))) no("an opposing Pokémon's Ability stops your Active Pokémon evolving");
		p.hand.splice(a.hand, 1);
		const was = pokeName(k); k.cards.push(id); k.turnEvolved = S.turn; k.status = {}; k.fx = [];   // Energy and damage stay; conditions go
		log(S, { k: 'evolve', seat: p.seat, msg: `${p.name}'s ${was} evolves into ${c.name}.` });
		{ const sw = passive(k, 'onEvolvePing');   // Swift Shot: once a turn (for each amount), damage to an opposing Active Pokémon of its player's choice
			if (sw && !p.flags['swift' + sw.n] && oppActives(S, p.seat).length) {
				p.flags['swift' + sw.n] = true;
				const yes = yield { seat: p.seat, kind: 'confirm', options: [0, 1], cards: [], msg: `${c.ability.name}: do ${sw.n} damage to an opposing Active Pokémon?` };
				if (yes) { const loc = yield* chooseTarget(S, p.seat, oppActives(S, p.seat), `${c.ability.name}: choose the opposing Active Pokémon that takes ${sw.n} damage.`), t = loc ? at(S, loc) : null;
					if (t) { t.dmg += sw.n; t.hitBy = p.seat; (pingCredit = pingCredit || new Map()).set(t.uid, p.seat); log(S, { k: 'damage', seat: p.seat, msg: `${c.ability.name} does ${sw.n} damage to ${label(S, loc)}.` }); } }
			}
		}
		const rb = passive(k, 'onEvolveDraw');   // Happy Ribbon: once a turn, its player may draw
		if (rb && !p.flags.ribbon && p.deck.length) {
			p.flags.ribbon = true;
			const yes = yield { seat: p.seat, kind: 'confirm', options: [0, 1], cards: [], msg: `${c.ability.name}: draw ${rb.n} cards?` };
			if (yes) { log(S, { k: 'ability', seat: p.seat, msg: `${p.name}'s ${c.name} uses ${c.ability.name}.` }); draw(S, p, rb.n); }
		}
		{ const hr = passive(k, 'onEvolveHeal');   // Healing Ripples: once a turn, heal one of its player's Pokémon of that type
			if (hr && !p.flags.ripple && !blockHeal(S)) {
				const locs = ['active', 'bench'].flatMap(z => p[z].map((m, idx) => (m && m.dmg > 0 && isT(m, hr.type) ? { seat: p.seat, zone: z, idx } : null)).filter(Boolean));
				if (locs.length) { p.flags.ripple = true; const loc = yield* chooseTarget(S, p.seat, locs, `${c.ability.name}: choose one of your ${hr.type} Pokémon to heal ${hr.n} damage from.`), t = loc ? at(S, loc) : null; if (t) { const h = hl(S, hr.n, t.dmg); t.dmg -= h; log(S, { k: 'heal', seat: p.seat, msg: `${c.ability.name}: ${pokeName(t)} heals ${h} damage.` }); } }
			}
		}
		if (passive(k, 'onEvolveTools') && !p.flags.digup) { const f2 = passive(k, 'onEvolveTools'), got = []; for (let i = 0; i < f2.n && p.hand.length + got.length < LIMITS.maxHand; i++) { const idxs = p.discard.map((d, n) => (card(d).kind === 'tool' ? n : -1)).filter(n => n >= 0); if (!idxs.length) break; got.push(p.discard.splice(S.rand.pick(idxs), 1)[0]); } if (got.length) { p.flags.digup = true; p.hand.push(...got); log(S, { k: 'draw', seat: p.seat, msg: `${c.ability.name}: ${p.name} puts ${got.map(i => card(i).name).join(' and ')} from their discard pile into their hand.` }); } }
		if (passive(k, 'onEvolveRefresh') && !p.flags.tea) {   // Refreshing Tea: once a turn, its player may make one opponent swap their hand for as many cards as they still need points
			p.flags.tea = true;
			const yes = yield { seat: p.seat, kind: 'confirm', options: [0, 1], cards: [], msg: `${c.ability.name}: make an opponent shuffle their hand into their deck and draw a card for each point they still need?` };
			if (yes) {
				const os = opponents(S, p.seat), locs = os.map(q => { const i = q.active.findIndex(Boolean); return i >= 0 ? { seat: q.seat, zone: 'active', idx: i } : null; }).filter(Boolean);
				const loc = os.length === 1 ? { seat: os[0].seat } : locs.length ? yield* chooseTarget(S, p.seat, locs, `${c.ability.name}: choose the opponent (by one of their Active Pokémon).`) : null, q = loc ? S.players[loc.seat] : null;
				if (q) { q.deck.push(...q.hand); q.hand = []; S.rand.shuffle(q.deck); log(S, { k: 'note', msg: `${c.ability.name}: ${q.name} shuffles their hand into their deck.` }); draw(S, q, Math.max(0, S.opts.points - q.points)); }
			}
		}
		{ const ig = passive(k, 'onEvolveAttach');   // Ignition: once a turn, an Energy from the Energy Zone to one of its player's Active Pokémon of that type
			if (ig && !p.flags.ignite) { const locs = [0, 1].map(idx => (p.active[idx] && isT(p.active[idx], ig.type) ? { seat: p.seat, zone: 'active', idx } : null)).filter(Boolean);
				if (locs.length) { p.flags.ignite = true; const loc = yield* chooseTarget(S, p.seat, locs, `${c.ability.name}: choose your ${ig.type} Pokémon in an Active slot that takes a ${ig.type} Energy.`); if (loc && at(S, loc)) yield* attachFromZone(S, p, at(S, loc), ig.type, c.ability.name); if (pingCredit) { const pc = pingCredit; pingCredit = null; yield* settle(S, pc, p.seat); } } } }
		if (passive(k, 'onEvolveSupporter') && !p.flags.friend) {   // Search for Friends: once a turn, a Supporter card of its player's choice comes back from the discard pile
			const opts = p.discard.map((i, n) => (card(i).kind === 'supporter' ? n : -1)).filter(n => n >= 0);
			if (opts.length && p.hand.length < LIMITS.maxHand) {
				p.flags.friend = true;
				const pick = opts.length === 1 ? opts[0] : yield { seat: p.seat, kind: 'handPick', options: opts, cards: p.discard.slice(), msg: `${c.ability.name}: choose a Supporter card in your discard pile to put into your hand.` };
				const got = p.discard.splice(opts.includes(pick) ? pick : opts[0], 1)[0]; p.hand.push(got); log(S, { k: 'draw', seat: p.seat, msg: `${c.ability.name}: ${p.name} puts ${card(got).name} from their discard pile into their hand.` });
			}
		}
		if (passive(k, 'onEvolveDiscard') && !p.flags.claw) {   // Unruly Claw: once a turn, a random Energy off an opposing Active Pokémon of its player's choice
			const locs = oppActives(S, p.seat).filter(l => at(S, l).energy.length);
			if (locs.length) {
				p.flags.claw = true;
				const loc = yield* chooseTarget(S, p.seat, locs, `${c.ability.name}: choose the opposing Active Pokémon that loses a random Energy.`), t = loc ? at(S, loc) : null;
				if (t && t.energy.length) { const en = t.energy.splice(S.rand.int(t.energy.length), 1)[0]; ed(S.players[loc.seat]).push(en); log(S, { k: 'energy', seat: p.seat, msg: `${c.ability.name}: ${pokeName(t)} loses a ${en} Energy.` }); }
			}
		}
	},
	*attach(S, a) {
		const p = needTurn(S, a);
		if (p.flags.attached) no('you have already attached Energy this turn');
		if (p.zone.cur == null) no('there is no Energy in your Energy Zone');
		if (p.noZoneActive > 0 && a.at && a.at.zone === 'active') no("you can't attach Energy from your Energy Zone to your Active Pokémon this turn");
		const k = ownAt(S, p, a.at);
		if (top(k).fossil) no('Energy cannot be attached to a fossil');
		const e = p.zone.cur; p.zone.cur = null; p.flags.attached = true; k.energy.push(e);
		log(S, { k: 'energy', seat: p.seat, msg: `${p.name} attaches a ${e} Energy to ${pokeName(k)} (${where(a.at)}).` });
		zoneSleep(S, k); zoneEvolve(S, p, k);
		yield* zonePing(S, p, k, e, a.target);
		if (pingCredit) { const c = pingCredit; pingCredit = null; yield* settle(S, c, p.seat); }
	},
	*retreat(S, a) {
		const p = needTurn(S, a);
		if (p.flags.retreated) no('you have already retreated this turn');
		const k = p.active[a.slot]; if (!k) no('that Active slot is empty');
		const b = p.bench[a.bench]; if (!b) no('choose a Benched Pokémon to switch in');
		if (top(k).fossil) no("a fossil can't retreat");
		if (!canAct(k)) no(`${pokeName(k)} can't retreat while ${k.status.asleep ? 'Asleep' : 'Paralyzed'}`);
		if (hasFx(k, 'cantRetreat')) no(`${pokeName(k)} can't retreat this turn`);
		const cost = Math.max(0, retreatCost(S, k) - (p.flags.retreatLess || 0));
		const whole = provided(S, k);
		if (whole.length < cost) no(`retreating costs ${cost} Energy`);
		let pay = Array.isArray(a.energy) && a.energy.length === cost && new Set(a.energy).size === cost && a.energy.every(i => i >= 0 && i < k.energy.length) ? a.energy : Array.from({ length: cost }, (_, i) => i);
		if (whole.length !== k.energy.length) {   // some of its Energy provides 2: discard only as many as cover the cost
			const two = whole.length > k.energy.length ? passive(inPlay(p).find(m => passive(m, 'doubleEnergy')), 'doubleEnergy').type : null;
			pay = []; for (let i = 0, got = 0; i < k.energy.length && got < cost; i++) { pay.push(i); got += k.energy[i] === two ? 2 : 1; }
		}
		ed(p).push(...k.energy.filter((_, i) => pay.includes(i)));
		k.energy = k.energy.filter((_, i) => !pay.includes(i));
		clearOnLeaveActive(k); p.active[a.slot] = b; p.bench[a.bench] = k; p.flags.retreated = true; b.movedUp = S.turn;
		log(S, { k: 'switch', seat: p.seat, msg: `${p.name} retreats ${pokeName(k)} for ${pokeName(b)} (Active ${SLOT[a.slot]}), discarding ${pay.length} Energy.` });
		{ const trapC = new Map(); for (const q of opponents(S, p.seat)) for (const m of actives(q)) for (const f of m.fx) if (f.k === 'retreatTrap' && p.active[a.slot] && !poncho(S, p.active[a.slot])) { const nk = p.active[a.slot]; nk.dmg += f.n; nk.hitBy = q.seat; trapC.set(nk.uid, q.seat); log(S, { k: 'damage', seat: q.seat, msg: `${f.from} does ${f.n} damage to ${p.name}'s ${pokeName(nk)}.` }); }
			if (trapC.size) yield* settle(S, trapC, null); }
	},
	// an empty Active slot may be filled from the Bench on your turn, freely (RULES.md "Empty Active slots")
	*promote(S, a) {
		const p = needTurn(S, a);
		if (!(a.slot === 0 || a.slot === 1) || p.active[a.slot]) no('that Active slot is not empty');
		const b = p.bench[a.bench]; if (!b) no('choose a Benched Pokémon');
		p.active[a.slot] = b; p.bench[a.bench] = null; b.movedUp = S.turn;
		log(S, { k: 'promote', seat: p.seat, msg: `${p.name} moves ${pokeName(b)} up to Active ${SLOT[a.slot]}.` });
	},
	*discardFossil(S, a) {
		const p = needTurn(S, a), k = ownAt(S, p, a.at); if (!top(k).fossil) no('only a fossil can be discarded from play');
		removeFromPlay(S, k); discardPoke(S, p, k);
		log(S, { k: 'discard', seat: p.seat, msg: `${p.name} discards ${pokeName(k)} from play.` });
		yield* settle(S, null, null);
	},
	*trainer(S, a) {
		const p = needTurn(S, a), pen = a.penny ? p.flags.penny : null;   // (pen: the Supporter whose effect Penny is using; it is not in the hand)
		if (a.penny && !pen) no('there is no effect for Penny to use');
		const id = pen || p.hand[a.hand], c = id ? card(id) : null; if (!c || c.kind === 'pokemon') no('choose a Trainer card');
		if (c.fossil) no('play a fossil as a Basic Pokémon');
		if (c.kind === 'item' && p.noItems > 0) no("you can't play Item cards this turn");
		const x = a.args || {}, f = c.fx;
		if (!pen && p.noTrainers > 0) no("you can't play Trainer cards this turn");
		if (c.kind === 'supporter' && !pen) {
			if (p.flags.supporter) no('you have already played a Supporter this turn');
			if (p.noSupporter > 0) no("you can't use Supporter cards this turn");
			if (opponents(S, p.seat).some(q => actives(q).some(k => passive(k, 'blockSupporters')))) no("an opposing Pokémon's Ability stops you using Supporter cards");
		}
		// everything is checked before anything changes
		let k = null, opp = null;
		const named = () => { const m = ownAt(S, p, x.at); if (f.names && !f.names.includes(pokeName(m))) no(`choose your ${f.names.join(' or ')}`); return m; };
		if (f.k === 'healOne') { k = ownAt(S, p, x.at); if (f.names && !f.names.includes(pokeName(k))) no(`choose your ${f.names.join(' or ')}`); if (f.type && !isT(k, f.type)) no(`choose one of your ${f.type} Pokémon`); if (f.stage != null && top(k).stage !== f.stage) no(`choose one of your Stage ${f.stage} Pokémon`); if (!k.dmg && !(f.cure && Object.keys(k.status).length)) no(f.cure ? 'that Pokémon has no damage and no Special Condition' : 'that Pokémon has no damage'); }
		else if (f.k === 'healCureActive') { k = ownAt(S, p, x.at); if (x.at.zone !== 'active') no('choose one of your Pokémon in an Active slot'); if (!k.dmg && !Object.keys(k.status).length) no('that Pokémon has no damage and no Special Condition'); }
		else if (f.k === 'rareCandy') {
			if (p.noEvolve > 0) no("you can't evolve your Pokémon from your hand this turn");
			k = ownAt(S, p, x.at); const up = card(p.hand[x.pick]);
			if (p.turns === 0) no("you can't use this card during your first turn");
			if (k.cards.length !== 1 || top(k).stage !== 0) no('choose one of your Basic Pokémon');
			if (k.turnPlayed === S.turn) no(`${pokeName(k)} was put into play this turn`);
			if (x.pick === a.hand || !up || up.kind !== 'pokemon' || up.stage !== 2 || !CARDS.some(m => m.name === up.evolvesFrom && m.evolvesFrom === pokeName(k))) no(`choose a Stage 2 card in your hand that evolves from ${pokeName(k)}`);
			if (x.at.zone === 'active' && opponents(S, p.seat).some(q => inPlay(q).some(m => passive(m, 'blockEvolveActive')))) no("an opposing Pokémon's Ability stops your Active Pokémon evolving");
		}
		else if (f.k === 'moveDamage') { k = named(); if (!k.dmg) no('that Pokémon has no damage'); opp = oppAt(S, p, x.target, 'active'); }
		else if (f.k === 'shuffleFuture') { k = ownAt(S, p, x.at); if (!isFut(k)) no('choose one of your Future Pokémon'); }
		else if (f.k === 'attachDiscardAncient') { if (!inPlay(p).some(m => isAnc(m))) no('you have no Ancient Pokémon in play'); if (!ed(p).length) no('there is no Energy in your discard pile'); }
		else if (f.k === 'returnTyped') { k = ownAt(S, p, x.at); if (!isT(k, f.type) || top(k).ex) no(`choose one of your ${f.type} Pokémon that is not a Pokémon ex`); }
		else if (f.k === 'fieldBlower') { if (x.stadium) { if (!S.stadium) no('there is no Stadium in play'); } else { k = x.target && S.players[x.target.seat] && !S.players[x.target.seat].eliminated ? at(S, x.target) : null; if (!k || !k.tool) no('choose a Pokémon that has a Pokémon Tool, or the Stadium in play'); } }
		else if (f.k === 'returnDamaged') { k = ownAt(S, p, x.at); if (!isT(k, f.type)) no(`choose one of your ${f.type} Pokémon`); if (!k.dmg) no('that Pokémon has no damage'); }
		else if (f.k === 'healAllNamed') { k = named(); if (!k.dmg) no('that Pokémon has no damage'); }
		else if (f.k === 'flipDiscardEnergy') k = oppAt(S, p, x.target, 'active');
		else if (f.k === 'flipAttach') { k = ownAt(S, p, x.at); if (!isT(k, f.type)) no(`choose one of your ${f.type} Pokémon`); }
		else if (f.k === 'returnActive') { k = named(); if (x.at.zone !== 'active') no('that Pokémon is not in an Active slot'); }
		else if (f.k === 'attachNamed') k = named();
		else if (f.k === 'gatherEnergy') { k = named(); if (x.at.zone !== 'active') no('that Pokémon is not in an Active slot'); }
		else if (f.k === 'driveOff') { k = oppAt(S, p, x.target, 'active'); if (f.basic && top(k).stage !== 0) no('choose an opposing Active Basic Pokémon'); if (!benched(S.players[x.target.seat]).length) no('that player has no Benched Pokémon'); }
		else if (f.k === 'guard' && f.needNoPoints && opponents(S, p.seat).some(q => q.points > 0)) no('an opponent has already gotten points');
		else if (f.k === 'revealSupporters' || f.k === 'penny') { opp = S.players[x.opp]; if (!opp || opp.seat === p.seat || opp.eliminated) no('choose an opponent'); }
		else if (f.k === 'chooseOne' && x.pick !== 0 && x.pick !== 1) no('choose one of the two effects');
		else if (f.k === 'coinsDiscardEnergy') k = oppAt(S, p, x.target, 'active');
		else if (f.k === 'evolveFromDeckType') { k = ownAt(S, p, x.at); if (!isT(k, f.type)) no(`choose one of your ${f.type} Pokémon`); if (f.maxHp) { if (hpOf(k) > f.maxHp) no(`choose one of your ${f.type} Pokémon with a maximum HP of ${f.maxHp} or less`); } else { if (p.turns === 0) no("you can't use this card during your first turn"); if (k.turnPlayed === S.turn) no('that Pokémon was put into play this turn'); } }
		else if (f.k === 'attachDiscardActive') { k = ownAt(S, p, x.at); if (x.at.zone !== 'active' || !isT(k, f.type)) no(`choose one of your ${f.type} Pokémon in an Active slot`); if (!ed(p).includes(f.type)) no(`there is no ${f.type} Energy in your discard pile`); }
		else if (f.k === 'coinAttachBenchType') { if (!benched(p).some(m => isT(m, f.type))) no(`you have no Benched ${f.type} Pokémon`); }
		else if (f.k === 'silver' || f.k === 'copycat' || f.k === 'discardAbilityEnergy' || f.k === 'oppDiscardTo' || (f.k === 'peekOrder' && f.opp)) { opp = S.players[x.opp]; if (!opp || opp.seat === p.seat || opp.eliminated) no('choose an opponent'); }
		else if (f.k === 'healNamedCure') { k = named(); if (!k.dmg && !k.status.asleep && !k.status.paralyzed && !k.status.confused) no('that Pokémon has no damage and none of those Special Conditions'); }
		else if (f.k === 'moveEnergyTypes') { k = ownAt(S, p, x.at); if (x.at.zone !== 'active') no('choose one of your Pokémon in an Active slot'); const b = p.bench[x.bench]; if (!b || !f.types.includes(x.type) || !b.energy.includes(x.type)) no(`choose one of your Benched Pokémon and a ${f.types.join(', ')} Energy on it`); }
		else if (f.k === 'discardOppEnergy') { k = oppAt(S, p, x.target, 'active'); if (!k.energy.includes(f.type)) no(`that Pokémon has no ${f.type} Energy`); }
		else if (f.k === 'switchDamaged') { k = ownAt(S, p, x.at); if (x.at.zone !== 'active' || !k.dmg) no('choose one of your Pokémon in an Active slot that has damage on it'); if (!p.bench[x.bench]) no('choose one of your Benched Pokémon'); }
		else if (f.k === 'attachDiscard' && f.ub) { if (!opponents(S, p.seat).some(q => q.points > 0)) no('no opponent has gotten a point yet'); k = ownAt(S, p, x.at); if (!top(k).ub) no('choose one of your Ultra Beasts'); }
		else if (f.k === 'revealHand' || f.k === 'redCard') { opp = S.players[x.opp]; if (!opp || opp.seat === p.seat || opp.eliminated) no('choose an opponent'); }
		else if (f.k === 'basicToHand' && p.hand.length - 1 >= LIMITS.maxHand) no('your hand is full');
		else if (c.kind === 'tool') { k = ownAt(S, p, x.at); if (k.tool) no(`${pokeName(k)} already has a Pokémon Tool`); }
		else if (c.kind === 'stadium') { if (opponents(S, p.seat).some(q => actives(q).some(m => passive(m, 'blockStadiums')))) no("an opposing Pokémon's Ability stops you playing Stadium cards"); if (S.stadium && card(S.stadium.id).name === c.name) no('that Stadium is already in play'); if (p.flags.stadium) no('you have already played a Stadium this turn'); }
		else if (f.k === 'healActiveReturn') { k = ownAt(S, p, x.at); if (x.at.zone !== 'active') no('choose one of your Pokémon in an Active slot'); if (!k.dmg) no('that Pokémon has no damage'); }
		else if (f.k === 'healForEnergy') { k = ownAt(S, p, x.at); if (!isT(k, f.type) || k.energy.filter(en => en === f.type).length < f.need) no(`choose one of your ${f.type} Pokémon with ${f.need} or more ${f.type} Energy`); if (!k.dmg) no('that Pokémon has no damage'); }
		else if (f.k === 'juggler') { k = ownAt(S, p, x.at); if (x.at.zone !== 'active') no('choose one of your Pokémon in an Active slot'); if (new Set(inPlay(p).flatMap(m => m.energy)).size < f.need) no(`your Pokémon need ${f.need} or more different types of Energy attached`); }
		else if (f.k === 'discardOppRandomEnergy') { if (!hasNamed(p, f.need)) no(`you need ${f.need.join(' or ')} in play`); k = oppAt(S, p, x.target, 'active'); }
		else if (f.k === 'swapPokemon') {
			const give = card(p.hand[x.pick]); if (x.pick === a.hand || !give || give.kind !== 'pokemon') no('choose a Pokémon in your hand');
			if (!p.deck.some(i => card(i).kind === 'pokemon')) no('there is no Pokémon in your deck');
		}
		else if (f.k === 'pullDamaged') { if (f.need && !hasNamed(p, f.need)) no(`you need ${f.need.join(' or ')} in play`); k = oppAt(S, p, x.target, 'active'); const b = S.players[x.target.seat].bench[x.bench]; if (!b || (!f.any && !b.dmg)) no(f.any ? "choose one of that player's Benched Pokémon" : "choose one of that player's Benched Pokémon that has damage on it"); }
		else if (f.k === 'attachDiscard' && !f.ub) k = named();
		else if (f.k === 'moveEnergyAny') { k = ownAt(S, p, x.at); if (x.at.zone !== 'active') no('choose one of your Pokémon in an Active slot'); const b = p.bench[x.bench]; if (!b || !b.energy.length) no('choose one of your Benched Pokémon with Energy'); }
		else if (f.k === 'shuffleInDraw') { if (p.hand.length - 1 < f.n) no(`you need ${f.n} other cards in your hand`); }
		else if (f.k === 'mars') { opp = S.players[x.opp]; if (!opp || opp.seat === p.seat || opp.eliminated) no('choose an opponent'); }
		else if (f.k === 'fluteBench') {
			opp = S.players[x.opp]; if (!opp || opp.seat === p.seat || opp.eliminated) no('choose an opponent');
			const got = card(opp.discard[x.pick]); if (!got || got.kind !== 'pokemon' || got.stage !== 0) no("choose a Basic Pokémon in that player's discard pile");
			if (opp.bench.indexOf(null) < 0) no("that player's Bench is full");
		}
		const give = f.k === 'swapPokemon' || f.k === 'rareCandy' ? p.hand[x.pick] : null;
		if (pen) { delete p.flags.penny; }
		else if (c.kind === 'stadium') { p.hand.splice(a.hand, 1); if (S.stadium) dropStadium(S, null); S.stadium = { id, seat: p.seat }; p.flags.stadium = true; }
		else { p.hand.splice(a.hand, 1); if (c.kind === 'tool') k.tool = id; else p.discard.push(id); if (c.kind === 'supporter') p.flags.supporter = true; }
		log(S, { k: 'trainer', seat: p.seat, card: id, msg: pen ? `${p.flags.pennyBy || 'Penny'}: ${p.name} uses the effect of ${c.name}.` : c.kind === 'stadium' ? `${p.name} plays the Stadium ${c.name}.` : c.kind === 'tool' ? `${p.name} attaches ${c.name} to ${pokeName(k)} (${where(x.at)}).` : `${p.name} plays ${c.name}.` });
		if (c.kind === 'tool' || c.kind === 'stadium') { yield* settle(S, null, null); return; }   // (a tool or a Stadium is put into play; its effect is read where it applies)
		if (f.k === 'healOne') { const h = hl(S, f.n, k.dmg); k.dmg -= h; log(S, { k: 'heal', msg: `${pokeName(k)} heals ${h} damage.` }); if (f.cure && Object.keys(k.status).length) { k.status = {}; log(S, { k: 'status', msg: `${pokeName(k)} recovers from its Special Conditions.` }); } }
		else if (f.k === 'flipDiscardEnergy') { const q = S.players[x.target.seat]; let h = 0; while (flip(S, p.seat, c.name)) h++; let gone = 0; for (let i = 0; i < h && k.energy.length; i++) { ed(q).push(k.energy.splice(S.rand.int(k.energy.length), 1)[0]); gone++; } log(S, { k: 'energy', msg: `${q.name}'s ${pokeName(k)} loses ${gone} Energy.` }); }
		else if (f.k === 'iono') { for (const seat of S.order) { const q = S.players[seat]; if (q.eliminated) continue; const n = q.hand.length; q.deck.push(...q.hand); q.hand = []; S.rand.shuffle(q.deck); draw(S, q, n, true); } log(S, { k: 'note', msg: 'Every player shuffles their hand into their deck and draws as many cards.' }); }
		else if (f.k === 'flipAttach') { let h = 0; while (flip(S, p.seat, c.name)) h++; for (let i = 0; i < h; i++) yield* attachFromZone(S, p, k, f.type, c.name); if (!h) log(S, { k: 'note', msg: 'No Energy is attached.' }); }
		else if (f.k === 'boost') (p.flags.boost = p.flags.boost || []).push({ n: f.n, names: f.names, from: c.name, ex: !!f.ex, any: !!f.any, ...(f.cardType ? { cardType: f.cardType } : {}) });
		else if (f.k === 'healNamedCure') { const h = hl(S, f.n, k.dmg); k.dmg -= h; let cured = false; for (const st of ['asleep', 'paralyzed', 'confused']) if (k.status[st]) { delete k.status[st]; cured = true; } log(S, { k: 'heal', msg: `${pokeName(k)} heals ${h} damage${cured ? ' and recovers' : ''}.` }); }
		else if (f.k === 'healActiveReturn') { const h = hl(S, f.n, k.dmg); k.dmg -= h; log(S, { k: 'heal', msg: `${pokeName(k)} heals ${h} damage.` }); if (h && flip(S, p.seat, c.name)) { const i = p.discard.lastIndexOf(id); if (i >= 0) { p.discard.splice(i, 1); p.hand.push(id); log(S, { k: 'note', msg: `${c.name} returns to ${p.name}'s hand.` }); } } }
		else if (f.k === 'healForEnergy') { const h = hl(S, f.n, k.dmg); k.dmg -= h; log(S, { k: 'heal', msg: `${pokeName(k)} heals ${h} damage.` }); if (h) for (let i = 0; i < f.cost; i++) { const n = k.energy.indexOf(f.type); if (n < 0) break; ed(p).push(k.energy.splice(n, 1)[0]); } }
		else if (f.k === 'juggler') { let n = 0; for (const b of benched(p)) { n += b.energy.length; k.energy.push(...b.energy); b.energy = []; } log(S, { k: 'energy', seat: p.seat, msg: `${n} Energy moves from ${p.name}'s Bench to ${pokeName(k)}.` }); }
		else if (f.k === 'discardOppRandomEnergy') { const q = S.players[x.target.seat]; let gone = 0; for (let i = 0; i < f.n && k.energy.length; i++) { ed(q).push(k.energy.splice(S.rand.int(k.energy.length), 1)[0]); gone++; } log(S, { k: 'energy', msg: `${q.name}'s ${pokeName(k)} loses ${gone} Energy.` }); }
		else if (f.k === 'topTools') { const fits = i => (f.attack ? card(i).kind === 'pokemon' && (card(i).attacks || []).some(x => x.name === f.attack) : f.stage ? card(i).kind === 'pokemon' && card(i).stage === f.stage : card(i).kind === 'tool'), topN = p.deck.splice(0, f.n), got = topN.filter(fits); p.hand.push(...got); p.deck.push(...topN.filter(i => !fits(i))); S.rand.shuffle(p.deck); log(S, { k: 'draw', seat: p.seat, msg: `${p.name} looks at the top ${topN.length} cards of their deck and takes ${got.length ? got.map(i => card(i).name).join(', ') : 'nothing'}.` }); }
		else if (f.k === 'evolveFromDeckType') {
			const from = pokeName(k), idxs = p.deck.map((i, n) => (card(i).kind === 'pokemon' && card(i).evolvesFrom === from && card(i).cardType === f.type ? n : -1)).filter(n => n >= 0);
			if (!idxs.length) log(S, { k: 'note', msg: `No ${f.type} Pokémon that evolves from ${from} is in ${p.name}'s deck.` });
			else { const got = p.deck.splice(S.rand.pick(idxs), 1)[0]; k.cards.push(got); k.turnEvolved = S.turn; k.status = {}; k.fx = []; S.rand.shuffle(p.deck); log(S, { k: 'evolve', seat: p.seat, msg: `${c.name}: ${p.name}'s ${from} evolves into ${card(got).name} from the deck.` }); }
		}
		else if (f.k === 'namesToHand' || f.k === 'megaToHand' || f.k === 'stageToHand') {
			const fits = i => (f.k === 'stageToHand' ? card(i).kind === 'pokemon' && card(i).stage === f.stage : f.k === 'megaToHand' ? card(i).kind === 'pokemon' && /^Mega .+ ex$/.test(card(i).name) : f.names.includes(card(i).name)), got = [];
			for (let i = 0; i < (f.n || 1) && p.hand.length + got.length < LIMITS.maxHand; i++) { const idxs = p.deck.map((d, n) => (fits(d) ? n : -1)).filter(n => n >= 0); if (!idxs.length) break; got.push(p.deck.splice(S.rand.pick(idxs), 1)[0]); }
			p.hand.push(...got); S.rand.shuffle(p.deck); log(S, { k: 'draw', seat: p.seat, msg: `${p.name} puts ${got.length} card${got.length === 1 ? '' : 's'} from their deck into their hand.`, privateTo: p.seat, privateMsg: `You put ${got.map(i => card(i).name).join(' and ') || 'nothing'} into your hand.` });
		}
		else if (f.k === 'coinAttachBenchType') { if (flip(S, p.seat, c.name)) { const ok = b => b && isT(b, f.type), t2 = ok(p.bench[x.bench]) ? p.bench[x.bench] : benched(p).find(ok); if (t2) yield* attachFromZone(S, p, t2, f.type, c.name); } }
		else if (f.k === 'discardAbilityEnergy') { const pool = inPlay(opp).filter(m => abilityOf(m)).flatMap(m => m.energy.map((_, n) => [m, n])); if (!pool.length) log(S, { k: 'note', msg: `None of ${opp.name}'s Pokémon with an Ability has Energy.` }); else { const [m, n] = S.rand.pick(pool), en = m.energy.splice(n, 1)[0]; ed(opp).push(en); log(S, { k: 'energy', msg: `${opp.name}'s ${pokeName(m)} loses a ${en} Energy.` }); } }
		else if (f.k === 'coinItemOrTool') { const kind = flip(S, p.seat, c.name) ? 'item' : 'tool', idxs = p.deck.map((d, n) => (card(d).kind === kind && !card(d).fossil ? n : -1)).filter(n => n >= 0); if (idxs.length && p.hand.length < LIMITS.maxHand) { const got = p.deck.splice(S.rand.pick(idxs), 1)[0]; p.hand.push(got); S.rand.shuffle(p.deck); log(S, { k: 'draw', seat: p.seat, msg: `${p.name} puts ${kind === 'item' ? 'an Item' : 'a Pokémon Tool'} card from their deck into their hand.`, privateTo: p.seat, privateMsg: `You put ${card(got).name} into your hand.` }); } else log(S, { k: 'note', msg: 'Nothing was found.' }); }
		else if (f.k === 'prankSpinner') {
			const pool = S.players.filter(q => !q.eliminated).flatMap(q => q.hand.map((_, n) => [q, n]));
			if (!pool.length) log(S, { k: 'note', msg: 'No player has a card in hand.' });
			else { const [q, n] = S.rand.pick(pool), got = q.hand.splice(n, 1)[0]; q.deck.push(got); S.rand.shuffle(q.deck); log(S, { k: 'reveal', msg: `${c.name}: ${card(got).name} from ${q.name}'s hand is revealed and shuffled into their deck.` }); }
		}
		else if (f.k === 'coinsDiscardEnergy') { let all = true; for (let i = 0; i < f.coins; i++) if (!flip(S, p.seat, c.name)) all = false; if (all && k.energy.length) { const q = S.players[x.target.seat], en = k.energy.splice(S.rand.int(k.energy.length), 1)[0]; ed(q).push(en); log(S, { k: 'energy', msg: `${q.name}'s ${pokeName(k)} loses a ${en} Energy.` }); } }
		else if (f.k === 'attachDiscardActive') { ed(p).splice(ed(p).indexOf(f.type), 1); k.energy.push(f.type); log(S, { k: 'energy', seat: p.seat, msg: `A ${f.type} Energy from ${p.name}'s discard pile is attached to ${pokeName(k)}.` }); }
		else if (f.k === 'guardEndure') { p.guardEndure = { names: f.names, hp: f.hp, from: c.name }; log(S, { k: 'status', msg: `Until ${p.name}'s next turn, their ${f.names.join(' and ')} cannot be Knocked Out by an attack's damage.` }); }
		else if (f.k === 'may') {
			const got = []; for (let i = 0; i < f.n; i++) { const idxs = p.deck.map((d, n) => (card(d).kind === 'pokemon' ? n : -1)).filter(n => n >= 0); if (!idxs.length) break; got.push(p.deck.splice(S.rand.pick(idxs), 1)[0]); }
			p.hand.push(...got); S.rand.shuffle(p.deck);
			log(S, { k: 'draw', seat: p.seat, msg: `${p.name} puts ${got.length} Pokémon from their deck into their hand.`, privateTo: p.seat, privateMsg: `You put ${got.map(i => card(i).name).join(' and ') || 'nothing'} into your hand.` });
			for (let i = 0; i < got.length; i++) {
				const opts = p.hand.map((d, n) => (card(d).kind === 'pokemon' ? n : -1)).filter(n => n >= 0); if (!opts.length) break;
				const pick = opts.length === 1 ? opts[0] : yield { seat: p.seat, kind: 'handPick', options: opts, cards: p.hand.slice(), msg: `${c.name}: choose a Pokémon in your hand to shuffle into your deck (${i + 1} of ${got.length}).` };
				p.deck.push(p.hand.splice(opts.includes(pick) ? pick : opts[0], 1)[0]);
			}
			S.rand.shuffle(p.deck); if (got.length) log(S, { k: 'note', msg: `${p.name} shuffles ${got.length} Pokémon from their hand into their deck.` });
		}
		else if (f.k === 'attachZoneEachNamed') { let any = false; for (const m of inPlay(p)) if (f.names.includes(pokeName(m))) { any = true; yield* attachFromZone(S, p, m, f.type, c.name); } if (!any) log(S, { k: 'note', msg: `${p.name} has no ${f.names.join(' or ')} in play.` }); }
		else if (f.k === 'copycat') { p.deck.push(...p.hand); p.hand = []; S.rand.shuffle(p.deck); log(S, { k: 'note', msg: `${p.name} shuffles their hand into their deck.` }); draw(S, p, opp.hand.length); }
		else if (f.k === 'smallBasicsToHand') { const got = []; for (let i = 0; i < f.n && p.hand.length + got.length < LIMITS.maxHand; i++) { const idxs = p.deck.map((d, n) => (card(d).kind === 'pokemon' && card(d).stage === 0 && card(d).hp <= f.hp ? n : -1)).filter(n => n >= 0); if (!idxs.length) break; got.push(p.deck.splice(S.rand.pick(idxs), 1)[0]); } p.hand.push(...got); S.rand.shuffle(p.deck); log(S, { k: 'draw', seat: p.seat, msg: `${p.name} puts ${got.length} Basic Pokémon from their deck into their hand.`, privateTo: p.seat, privateMsg: `You put ${got.map(i => card(i).name).join(' and ') || 'nothing'} into your hand.` }); }
		else if (f.k === 'will') { p.flags.will = true; log(S, { k: 'note', msg: `The next coin ${p.name} flips this turn will be heads.` }); }
		else if (f.k === 'moveEnergyTypes') { const b = p.bench[x.bench]; b.energy.splice(b.energy.indexOf(x.type), 1); k.energy.push(x.type); log(S, { k: 'energy', seat: p.seat, msg: `A ${x.type} Energy moves from ${pokeName(b)} to ${pokeName(k)}.` }); }
		else if (f.k === 'discardOppEnergy') { const q = S.players[x.target.seat]; k.energy.splice(k.energy.indexOf(f.type), 1); ed(q).push(f.type); log(S, { k: 'energy', msg: `${q.name}'s ${pokeName(k)} loses a ${f.type} Energy.` }); }
		else if (f.k === 'switchDamaged') { const b = p.bench[x.bench]; clearOnLeaveActive(k); p.active[x.at.idx] = b; p.bench[x.bench] = k; b.movedUp = S.turn; log(S, { k: 'switch', seat: p.seat, msg: `${p.name} switches ${pokeName(k)} out for ${pokeName(b)} (Active ${SLOT[x.at.idx]}).` }); }
		else if (f.k === 'silver') {
			log(S, { k: 'reveal', seat: p.seat, msg: `${opp.name} reveals their hand to ${p.name}.`, privateTo: p.seat, privateMsg: `${opp.name}'s hand: ${opp.hand.map(i => card(i).name).join(', ') || '(empty)'}.` });
			const opts = opp.hand.map((i, n) => (card(i).kind === 'supporter' ? n : -1)).filter(n => n >= 0);
			if (!opts.length) log(S, { k: 'note', msg: `${opp.name} has no Supporter card in hand.` });
			else {
				const pick = opts.length === 1 ? opts[0] : yield { seat: p.seat, kind: 'handPick', options: opts, cards: opp.hand.slice(), msg: `${c.name}: choose a Supporter card from ${opp.name}'s hand to shuffle into their deck.` };
				const got = opp.hand.splice(opts.includes(pick) ? pick : opts[0], 1)[0]; opp.deck.push(got); S.rand.shuffle(opp.deck); log(S, { k: 'note', msg: `${p.name} shuffles ${card(got).name} from ${opp.name}'s hand into their deck.` });
			}
		}
		else if (f.k === 'coinsFromDiscard') {
			let h = 0; for (let i = 0; i < f.coins; i++) if (flip(S, p.seat, c.name)) h++;
			const got = []; for (; h > 0; h--) { const idxs = p.discard.map((i, n) => (card(i).kind === 'pokemon' && card(i).cardType === f.type ? n : -1)).filter(n => n >= 0); if (!idxs.length) break; got.push(p.discard.splice(S.rand.pick(idxs), 1)[0]); }
			p.hand.push(...got); log(S, { k: 'draw', seat: p.seat, msg: got.length ? `${p.name} puts ${got.map(i => card(i).name).join(', ')} from their discard pile into their hand.` : `${p.name} takes nothing from their discard pile.` });
		}
		else if (f.k === 'peekOrder') {
			const dk = f.opp ? opp.deck : p.deck, whose = f.opp ? `${opp.name}'s` : 'their';
			const n = Math.min(dk.length, inPlay(p).filter(m => isT(m, f.type)).length);
			if (!n) log(S, { k: 'note', msg: `${p.name} looks at no cards.` });
			else {
				let left = dk.slice(0, n); const order = [];
				log(S, { k: 'reveal', seat: p.seat, msg: `${p.name} looks at the top ${n} card${n > 1 ? 's' : ''} of ${whose} deck.`, privateTo: p.seat, privateMsg: `The top of ${f.opp ? whose : 'your'} deck: ${left.map(i => card(i).name).join(', ')}.` });
				while (left.length > 1) { const opts = left.map((_, i) => i), pick = yield { seat: p.seat, kind: 'handPick', options: opts, cards: left.slice(), msg: `${c.name}: choose the card that goes ${order.length ? 'next' : 'on top'} (${order.length + 1} of ${n}).` }; order.push(left.splice(opts.includes(pick) ? pick : 0, 1)[0]); }
				order.push(...left); dk.splice(0, n, ...order);
			}
		}
		else if (f.k === 'chooseOne' && x.pick === 0) (p.flags.boost = p.flags.boost || []).push({ n: f.boost, names: null, from: c.name, ex: false, evo: f.from });
		else if (f.k === 'chooseOne') { let any = false; for (const m of inPlay(p)) if (top(m).evolvesFrom === f.from) { const h = hl(S, f.heal, m.dmg); if (h) { m.dmg -= h; any = true; log(S, { k: 'heal', msg: `${pokeName(m)} heals ${h} damage.` }); } } if (!any) log(S, { k: 'note', msg: 'Nothing is healed.' }); }
		else if (f.k === 'penny') {
			const idxs = opp.deck.map((i, n) => (card(i).kind === 'supporter' && card(i).name !== c.name ? n : -1)).filter(n => n >= 0);
			if (!idxs.length) log(S, { k: 'note', msg: `${opp.name}'s deck has no other Supporter card.` });
			else { const got = opp.deck[S.rand.pick(idxs)]; S.rand.shuffle(opp.deck); p.flags.penny = got; log(S, { k: 'reveal', seat: p.seat, msg: `${p.name} looks at a random Supporter card from ${opp.name}'s deck.`, privateTo: p.seat, privateMsg: `It is ${card(got).name}. You may use its effect this turn.` }); }
		}
		else if (f.k === 'returnActive') { removeFromPlay(S, k); if (k.tool) { p.discard.push(k.tool); k.tool = null; } ed(p).push(...k.energy); k.energy = []; p.hand.push(...k.cards.filter(() => p.hand.length < 99)); log(S, { k: 'note', msg: `${pokeName(k)} returns to ${p.name}'s hand; its Energy is discarded.` }); yield* settle(S, null, null); }
		else if (f.k === 'attachNamed') { for (let i = f.n || 1; i > 0; i--) yield* attachFromZone(S, p, k, f.type, c.name); }
		else if (f.k === 'healCureActive') { const h = hl(S, f.n, k.dmg); k.dmg -= h; const st = Object.keys(k.status); if (st.length) { const gone = S.rand.pick(st); delete k.status[gone]; log(S, { k: 'status', msg: `${pokeName(k)} heals ${h} damage and is no longer ${gone[0].toUpperCase() + gone.slice(1)}.` }); } else log(S, { k: 'heal', msg: `${pokeName(k)} heals ${h} damage.` }); }
		else if (f.k === 'rareCandy') { const was = pokeName(k); p.hand.splice(p.hand.indexOf(give), 1); k.cards.push(give); k.turnEvolved = S.turn; k.status = {}; k.fx = []; log(S, { k: 'evolve', seat: p.seat, msg: `${p.name}'s ${was} evolves straight into ${card(give).name}.` }); }
		else if (f.k === 'peekShuffle') {
			if (!p.deck.length) log(S, { k: 'note', msg: `${p.name}'s deck is empty.` });
			else {
				log(S, { k: 'reveal', seat: p.seat, msg: `${p.name} looks at the top card of their deck.`, privateTo: p.seat, privateMsg: `Top of your deck: ${card(p.deck[0]).name}.` });
				const yes = yield { seat: p.seat, kind: 'confirm', options: [0, 1], cards: [p.deck[0]], msg: `${c.name}: the top card of your deck. Shuffle your deck?` };
				if (yes === 1) { S.rand.shuffle(p.deck); log(S, { k: 'note', msg: `${p.name} shuffles their deck.` }); }
			}
		}
		else if (f.k === 'moveDamage') { const n = Math.min(f.n, k.dmg); k.dmg -= n; opp.dmg += n; opp.hitBy = p.seat; (pingCredit = pingCredit || new Map()).set(opp.uid, p.seat); log(S, { k: 'damage', seat: p.seat, msg: `${n} damage moves from ${pokeName(k)} to ${label(S, x.target)}.` }); }
		else if (f.k === 'returnDamaged' || f.k === 'returnTyped') { removeFromPlay(S, k); if (k.tool) { p.discard.push(k.tool); k.tool = null; } ed(p).push(...k.energy); k.energy = []; p.hand.push(...k.cards); log(S, { k: 'note', msg: `${pokeName(k)} returns to ${p.name}'s hand; its Energy is discarded.` }); yield* settle(S, null, null); }
		else if (f.k === 'discardTools') { let n = 0; for (const q of opponents(S, p.seat)) for (const m of inPlay(q)) if (m.tool) { dropTool(S, m, c.name); n++; } if (!n) log(S, { k: 'note', msg: 'No Pokémon Tool is in play on the other side.' }); }
		else if (f.k === 'healAllNamed' && blockHeal(S)) log(S, { k: 'note', msg: "Pokémon can't be healed." });
		else if (f.k === 'healAllNamed') { const h = k.dmg; k.dmg = 0; ed(p).push(...k.energy); const gone = k.energy.length; k.energy = []; log(S, { k: 'heal', msg: `${pokeName(k)} heals ${h} damage and discards ${gone} Energy.` }); }
		else if (f.k === 'gatherEnergy') { let n = 0; for (const b of benched(p)) { const keep = []; for (const e of b.energy) { if (e === f.type) { k.energy.push(e); n++; } else keep.push(e); } b.energy = keep; } log(S, { k: 'energy', msg: `${n} ${f.type} Energy moves to ${pokeName(k)}.` }); }
		else if (f.k === 'driveOff') yield* switchOut(S, x.target, c.name);
		else if (f.k === 'retreatLess') p.flags.retreatLess = (p.flags.retreatLess || 0) + f.n;
		else if (f.k === 'revealHand') log(S, { k: 'reveal', msg: `${opp.name} reveals their hand to ${p.name}.`, privateTo: p.seat, privateMsg: `${opp.name}'s hand: ${opp.hand.map(i => card(i).name).join(', ') || '(empty)'}.` });
		else if (f.k === 'peekTop') log(S, { k: 'reveal', msg: `${p.name} looks at the top ${f.n} card${f.n > 1 ? 's' : ''} of their deck.`, privateTo: p.seat, privateMsg: `Top of your deck: ${p.deck.slice(0, f.n).map(i => card(i).name).join(', ') || '(empty)'}.` });
		else if (f.k === 'basicToHand') { const idxs = p.deck.map((i, n) => (card(i).kind === 'pokemon' && card(i).stage === 0 ? n : -1)).filter(n => n >= 0); if (idxs.length) { const got = p.deck.splice(S.rand.pick(idxs), 1)[0]; p.hand.push(got); S.rand.shuffle(p.deck); log(S, { k: 'draw', msg: `${p.name} puts a Basic Pokémon into their hand.`, privateTo: p.seat, privateMsg: `You put ${card(got).name} into your hand.` }); } else log(S, { k: 'note', msg: 'There is no Basic Pokémon in the deck.' }); }
		else if (f.k === 'redCard') { opp.deck.push(...opp.hand); opp.hand = []; S.rand.shuffle(opp.deck); draw(S, opp, f.n); }
		else if (f.k === 'draw') draw(S, p, f.n);
		else if (f.k === 'fieldBlower') { if (x.stadium) dropStadium(S, c.name); else dropTool(S, k, c.name); }
		else if (f.k === 'returnTools') { let n = 0; for (const q of S.players) if (!q.eliminated) for (const m of inPlay(q)) if (m.tool) { q.hand.push(m.tool); log(S, { k: 'note', msg: `${card(m.tool).name} returns from ${q.name}'s ${pokeName(m)} to their hand.` }); m.tool = null; n++; } if (!n) log(S, { k: 'note', msg: 'No Pokémon Tool is in play.' }); yield* settle(S, null, null); }
		else if (f.k === 'shuffleFuture') { const back = k.cards.slice(); removeFromPlay(S, k); p.deck.push(...back); if (k.tool) { p.discard.push(k.tool); k.tool = null; } ed(p).push(...k.energy); k.energy = []; S.rand.shuffle(p.deck); log(S, { k: 'note', seat: p.seat, msg: `${p.name} shuffles ${back.map(i => card(i).name).join(', ')} into their deck.` }); yield* settle(S, null, null); }
		else if (f.k === 'attachDiscardAncient') {
			let types = [...new Set(ed(p))].sort(); if (types.length > f.n) { S.rand.shuffle(types); types = types.slice(0, f.n); }
			for (const ty of types) { const locs = [...p.active.map((m, i) => (m && isAnc(m) ? { seat: p.seat, zone: 'active', idx: i } : null)), ...p.bench.map((m, i) => (m && isAnc(m) ? { seat: p.seat, zone: 'bench', idx: i } : null))].filter(Boolean); if (!locs.length) break;
				const loc = yield* chooseTarget(S, p.seat, locs, `${c.name}: choose your Ancient Pokémon that takes the ${ty} Energy.`), m = loc ? at(S, loc) : null; if (!m) break;
				ed(p).splice(ed(p).indexOf(ty), 1); m.energy.push(ty); log(S, { k: 'energy', seat: p.seat, msg: `A ${ty} Energy from ${p.name}'s discard pile is attached to ${pokeName(m)}.` }); }
		}
		else if (f.k === 'stadiumToHand') { const idxs = p.deck.map((d, n) => (card(d).kind === 'stadium' ? n : -1)).filter(n => n >= 0); if (idxs.length) { const got = p.deck.splice(S.rand.pick(idxs), 1)[0]; p.hand.push(got); S.rand.shuffle(p.deck); log(S, { k: 'draw', seat: p.seat, msg: `${p.name} puts ${card(got).name} from their deck into their hand.` }); } else { S.rand.shuffle(p.deck); log(S, { k: 'note', msg: `There is no Stadium card in ${p.name}'s deck.` }); } }
		else if (f.k === 'drawPerMega') { const n = S.players.filter(q => !q.eliminated).flatMap(q => inPlay(q)).filter(m => isMega(top(m))).length; if (n) draw(S, p, n); else log(S, { k: 'note', msg: 'There is no Mega Evolution Pokémon ex in play.' }); }
		else if (f.k === 'koBonusPoint') { p.flags.koBonus = { names: f.names, n: f.n, from: c.name }; log(S, { k: 'status', msg: `This turn, ${p.name} gets ${f.n} more point if their ${f.names.join(' or ')} Knocks Out an opposing Active Pokémon with an attack.` }); }
		else if (f.k === 'oppDiscardTo') {
			const gone = [];
			while (opp.hand.length > f.n) { const opts = opp.hand.map((_, n) => n), pick = yield { seat: opp.seat, kind: 'handPick', options: opts, cards: opp.hand.slice(), msg: `${c.name}: choose a card in your hand to discard (${opp.hand.length - f.n} to go).` }; gone.push(opp.hand.splice(opts.includes(pick) ? pick : 0, 1)[0]); }
			opp.discard.push(...gone); log(S, { k: 'note', msg: gone.length ? `${opp.name} discards ${gone.map(i => card(i).name).join(', ')}.` : `${opp.name} has ${f.n} or fewer cards in their hand already.` });
		}
		else if (f.k === 'shuffleInDraw') {
			for (let i = 0; i < f.n && p.hand.length; i++) { const opts = p.hand.map((_, n) => n), pick = yield { seat: p.seat, kind: 'handPick', options: opts, cards: p.hand.slice(), msg: `${c.name}: choose a card in your hand to shuffle into your deck (${i + 1} of ${f.n}).` }; p.deck.push(p.hand.splice(opts.includes(pick) ? pick : 0, 1)[0]); }
			S.rand.shuffle(p.deck); log(S, { k: 'note', msg: `${p.name} shuffles ${f.n} cards from their hand into their deck.` }); draw(S, p, f.draw);
		}
		else if (f.k === 'swapPokemon') {
			const idxs = p.deck.map((i, n) => (card(i).kind === 'pokemon' ? n : -1)).filter(n => n >= 0), got = p.deck.splice(S.rand.pick(idxs), 1)[0];
			p.hand.splice(p.hand.indexOf(give), 1); p.hand.push(got); p.deck.push(give); S.rand.shuffle(p.deck);
			log(S, { k: 'draw', seat: p.seat, msg: `${p.name} switches a Pokémon in their hand with a random Pokémon in their deck.`, privateTo: p.seat, privateMsg: `${card(give).name} went into your deck; you took ${card(got).name}.` });
		}
		else if (f.k === 'pullDamaged') { const q = S.players[x.target.seat], b = q.bench[x.bench]; clearOnLeaveActive(k); q.active[x.target.idx] = b; q.bench[x.bench] = k; log(S, { k: 'switch', msg: `${q.name}'s ${pokeName(b)} is pulled into Active ${SLOT[x.target.idx]}; ${pokeName(k)} goes to the Bench.` }); }
		else if (f.k === 'namedToHand') { const idxs = p.deck.map((i, n) => (f.names.includes(card(i).name) ? n : -1)).filter(n => n >= 0); if (idxs.length) { const got = p.deck.splice(S.rand.pick(idxs), 1)[0]; p.hand.push(got); S.rand.shuffle(p.deck); log(S, { k: 'draw', seat: p.seat, msg: `${p.name} puts a Pokémon from their deck into their hand.`, privateTo: p.seat, privateMsg: `You put ${card(got).name} into your hand.` }); } else log(S, { k: 'note', msg: `There is no ${f.names.join(', ')} in the deck.` }); }
		else if (f.k === 'attachDiscard' && f.ub) { let got = []; for (let i = 0; i < f.n && ed(p).length; i++) { const e2 = ed(p).splice(S.rand.int(ed(p).length), 1)[0]; k.energy.push(e2); got.push(e2); } log(S, { k: 'energy', seat: p.seat, msg: `${got.length ? got.join(' and ') : 'No'} Energy from ${p.name}'s discard pile is attached to ${pokeName(k)}.` }); }
		else if (f.k === 'revealSupporters') { const list = opp.deck.filter(i => card(i).kind === 'supporter').map(i => card(i).name).sort(); log(S, { k: 'reveal', seat: p.seat, msg: `${opp.name} reveals the Supporter cards in their deck to ${p.name}.`, privateTo: p.seat, privateMsg: `Supporters in ${opp.name}'s deck: ${list.join(', ') || 'none'}.` }); }
		else if (f.k === 'attachDiscard') { let n = 0; for (let i = 0; i < f.n; i++) { const j = ed(p).indexOf(f.type); if (j < 0) break; ed(p).splice(j, 1); k.energy.push(f.type); n++; } log(S, { k: 'energy', seat: p.seat, msg: `${n} ${f.type} Energy from ${p.name}'s discard pile is attached to ${pokeName(k)}.` }); }
		else if (f.k === 'moveEnergyAny') { const b = p.bench[x.bench], i = Number.isInteger(x.energy) && x.energy >= 0 && x.energy < b.energy.length ? x.energy : 0, e = b.energy.splice(i, 1)[0]; k.energy.push(e); log(S, { k: 'energy', seat: p.seat, msg: `A ${e} Energy moves from ${pokeName(b)} to ${pokeName(k)}.` }); }
		else if (f.k === 'mars') { const n = Math.max(0, S.opts.points - opp.points); opp.deck.push(...opp.hand); opp.hand = []; S.rand.shuffle(opp.deck); log(S, { k: 'note', msg: `${opp.name} shuffles their hand into their deck and draws ${n}.` }); draw(S, opp, n); }
		else if (f.k === 'healWithEnergy') { let any = false; for (const m of inPlay(p)) if (m.energy.includes(f.type) && m.dmg) { const h = hl(S, f.n, m.dmg); m.dmg -= h; any = true; log(S, { k: 'heal', msg: `${pokeName(m)} heals ${h} damage.` }); } if (!any) log(S, { k: 'note', msg: 'Nothing is healed.' }); }
		else if (f.k === 'basicFromDiscard') { const idxs = p.discard.map((i, n) => (card(i).kind === 'pokemon' && card(i).stage === 0 && (!f.type || card(i).cardType === f.type) ? n : -1)).filter(n => n >= 0); if (idxs.length) { const got = p.discard.splice(S.rand.pick(idxs), 1)[0]; p.hand.push(got); log(S, { k: 'draw', seat: p.seat, msg: `${p.name} puts ${card(got).name} from their discard pile into their hand.` }); } else log(S, { k: 'note', msg: 'There is no Basic Pokémon in the discard pile.' }); }
		else if (f.k === 'costLess') { (p.flags.costLess = p.flags.costLess || []).push({ n: f.n, names: f.names }); log(S, { k: 'status', msg: `This turn, attacks used by ${p.name}'s ${f.names.join(', ')} cost ${f.n} less Colorless Energy.` }); }
		else if (f.k === 'guard') { p.guard = { n: f.n, from: c.name, type: f.type || null, ub: !!f.ub, names: f.names || null, ...(f.fromEx ? { fromEx: true } : {}) }; log(S, { k: 'status', msg: `Until ${p.name}'s next turn, their Pokémon take -${f.n} damage from opposing attacks.` }); }
		else if (f.k === 'fluteBench') { const got = opp.discard.splice(x.pick, 1)[0]; opp.bench[opp.bench.indexOf(null)] = makePoke(S, got); log(S, { k: 'play', seat: p.seat, msg: `${card(got).name} goes from ${opp.name}'s discard pile onto their Bench.` }); }
		else if (f.k === 'slab') {
			const t0 = p.deck[0], tc = t0 != null ? card(t0) : null;
			if (!tc) log(S, { k: 'note', msg: `${p.name}'s deck is empty.` });
			else if (tc.kind === 'pokemon' && tc.cardType === f.type) { p.deck.shift(); p.hand.push(t0); log(S, { k: 'draw', seat: p.seat, msg: `${p.name} puts the top card of their deck, a ${f.type} Pokémon, into their hand.`, privateTo: p.seat, privateMsg: `You put ${tc.name} into your hand.` }); }
			else { p.deck.push(p.deck.shift()); log(S, { k: 'note', msg: `The top card of ${p.name}'s deck is not a ${f.type} Pokémon: it goes to the bottom.`, privateTo: p.seat, privateMsg: `It was ${tc.name}.` }); }
		}
		if (pingCredit) { const pc = pingCredit; pingCredit = null; yield* settle(S, pc, p.seat); }
		if (f.endsTurn && !S.over && S.current === p.seat && !S.pending) { log(S, { k: 'note', msg: `${c.name}: ${p.name}'s turn ends.` }); yield* endTurn(S); }
	},
	*stadium(S, a) {
		const p = needTurn(S, a), f = S.stadium ? card(S.stadium.id).fx : null;
		if (!f || (f.k !== 'stadiumCoinPokemon' && f.k !== 'stadiumBasicToHand' && f.k !== 'stadiumSwapBasic' && f.k !== 'stadiumSwapTool')) no('the Stadium in play has nothing to use');
		if (p.flags.stadiumUsed) no('you have already used the Stadium this turn');
		if (f.k === 'stadiumSwapTool') {   // Kid's Room: a card from the hand for a random Pokémon Tool from the deck
			const id = p.hand[a.hand]; if (id == null) no('choose a card in your hand');
			const idxs = p.deck.map((d, n) => (card(d).kind === 'tool' ? n : -1)).filter(n => n >= 0); if (!idxs.length) no('there is no Pokémon Tool card in your deck');
			p.flags.stadiumUsed = true; const got = p.deck.splice(S.rand.pick(idxs), 1)[0]; p.hand.splice(a.hand, 1); p.deck.push(id); p.hand.push(got); S.rand.shuffle(p.deck);
			log(S, { k: 'draw', seat: p.seat, msg: `${card(S.stadium.id).name}: ${p.name} switches a card in their hand with ${card(got).name} from their deck.` }); return;
		}
		if (f.k === 'stadiumSwapBasic') {   // Area Zero: a Basic Pokémon from the hand goes into the deck; draw a card
			const id = p.hand[a.hand], cd = id ? card(id) : null; if (!cd || cd.kind !== 'pokemon' || cd.stage !== 0) no('choose a Basic Pokémon in your hand');
			p.flags.stadiumUsed = true; p.hand.splice(a.hand, 1); p.deck.push(id); S.rand.shuffle(p.deck);
			log(S, { k: 'note', seat: p.seat, msg: `${card(S.stadium.id).name}: ${p.name} shuffles a Basic Pokémon from their hand into their deck.` }); draw(S, p, 1); return;
		}
		p.flags.stadiumUsed = true;
		const nm = card(S.stadium.id).name;
		if (f.k === 'stadiumBasicToHand' || flip(S, p.seat, nm)) { const idxs = p.deck.map((d, n) => (card(d).kind === 'pokemon' && (f.k !== 'stadiumBasicToHand' || (card(d).stage === 0 && card(d).cardType === f.type)) ? n : -1)).filter(n => n >= 0); if (idxs.length && p.hand.length < LIMITS.maxHand) { const got = p.deck.splice(S.rand.pick(idxs), 1)[0]; p.hand.push(got); S.rand.shuffle(p.deck); log(S, { k: 'draw', seat: p.seat, msg: `${nm}: ${p.name} puts a Pokémon from their deck into their hand.`, privateTo: p.seat, privateMsg: `You put ${card(got).name} into your hand.` }); } else log(S, { k: 'note', msg: `${nm}: nothing was found.` }); }
	},
	*ability(S, a) {
		const p = needTurn(S, a), k = ownAt(S, p, a.at), ab = top(k).ability, x = a.args || {};
		if (ab && !abilityOf(k)) no('an Ability in play stops Basic Pokémon using their Abilities');
		if (!ab || ab.fx.passive) no('that Pokémon has no Ability to use');
		const f = ab.fx;
		if (k.abilityUsed === S.turn && !f.repeat) no(`${ab.name} has already been used this turn`);
		if (f.active && a.at.zone !== 'active') no(`${pokeName(k)} must be in an Active slot`);
		let t = null;
		if (f.k === 'ping') { if (f.need && !hasNamed(p, f.need)) no(`${ab.name} needs ${f.need.join(' or ')} in play`); t = oppAt(S, p, x.target, f.zone || 'any'); }
		else if (f.k === 'attachZoneAnyType') { t = ownAt(S, p, x.at); if (!isT(t, f.type)) no(`choose one of your ${f.type} Pokémon`); }
		else if (f.k === 'peekAny') { if (!S.players[x.seat] || S.players[x.seat].eliminated) no('choose a player'); }
		else if (f.k === 'coinSleep' || f.k === 'poisonActive' || f.k === 'coinPoison') t = oppAt(S, p, x.target, 'active');
		else if (f.k === 'healActive') { t = ownAt(S, p, x.at); if (x.at.zone !== 'active') no('choose one of your Pokémon in an Active slot'); if (!t.dmg) no('that Pokémon has no damage'); }
		else if (f.k === 'driveOff') { t = oppAt(S, p, x.target, 'active'); if (f.basic && top(t).stage !== 0) no('choose an opposing Active Basic Pokémon'); if (!benched(S.players[x.target.seat]).length) no('that player has no Benched Pokémon'); }
		else if (f.k === 'portrait') { const q = S.players[x.opp]; if (!q || q.seat === p.seat || q.eliminated) no('choose an opponent'); }
		else if (f.k === 'pullBenchBasic') { t = oppAt(S, p, x.target, 'active'); const b = S.players[x.target.seat].bench[x.bench]; if (!b || top(b).stage !== 0) no("choose one of that player's Benched Basic Pokémon"); }
		else if (f.k === 'attachZoneActiveType') { t = ownAt(S, p, x.at); if (x.at.zone !== 'active' || !isT(t, f.type)) no(`choose one of your ${f.type} Pokémon in an Active slot`); }
		else if (f.k === 'healAll' && !inPlay(p).some(m => m.dmg && (!f.type || isT(m, f.type)))) no(`none of your ${f.type ? f.type + ' ' : ''}Pokémon has damage`);
		else if (f.k === 'attachDiscardSelf') { if (!ed(p).includes(f.type)) no(`there is no ${f.type} Energy in your discard pile`); }
		else if (f.k === 'statusActive') t = oppAt(S, p, x.target, 'active');
		else if (f.k === 'healExForEnergy') { t = ownAt(S, p, x.at); if (!top(t).ex || !t.energy.length) no('choose one of your Pokémon ex that has Energy attached'); if (!t.dmg) no('that Pokémon has no damage'); }
		else if (f.k === 'boostForEnergy') { if (!k.energy.includes(f.type)) no(`${pokeName(k)} has no ${f.type} Energy to discard`); }
		else if (f.k === 'coinPull') { t = oppAt(S, p, x.target, 'active'); if (!S.players[x.target.seat].bench[x.bench]) no("choose one of that player's Benched Pokémon"); }
		else if (f.k === 'millOpp') { const q = S.players[x.opp]; if (!q || q.seat === p.seat || q.eliminated) no('choose an opponent'); }
		else if (f.k === 'switchActiveType') { const out = p.active[x.slot]; if (!out || !isT(out, f.type)) no(`choose one of your ${f.type} Pokémon in an Active slot`); if (!p.bench[x.bench]) no('choose one of your Benched Pokémon'); }
		else if (f.k === 'toolsThenDiscardSelf') { if (a.at.zone !== 'bench') no(`${pokeName(k)} must be on your Bench`); t = oppAt(S, p, x.target, 'active'); if (!t.tool) no('that Pokémon has no Pokémon Tool'); }
		else if (f.k === 'healAny') { if (f.needTool && !k.tool) no(`${pokeName(k)} needs a Pokémon Tool attached`); t = ownAt(S, p, x.at); if (!t.dmg) no('that Pokémon has no damage'); }
		else if (f.k === 'pullDamaged') { t = oppAt(S, p, x.target, 'active'); const b = S.players[x.target.seat].bench[x.bench]; if (!b || !b.dmg) no("choose one of that player's Benched Pokémon that has damage on it"); }
		else if (f.k === 'gatherAll') { if (!inPlay(p).some(m => m !== k && m.energy.includes(f.type))) no(`none of your other Pokémon has ${f.type} Energy`); }
		else if (f.k === 'ubSwap') { const out = p.active[x.slot], b = p.bench[x.bench]; if (!out || !top(out).ub) no('choose one of your Ultra Beasts in an Active slot'); if (!b || !top(b).ub) no('choose one of your Benched Ultra Beasts'); }
		else if (f.k === 'gatherFrom') { t = ownAt(S, p, x.at); if (x.at.zone !== 'active') no('choose one of your Pokémon in an Active slot'); const b = p.bench[x.bench]; if (!b || !isT(b, f.type) || !b.energy.includes(f.type)) no(`choose one of your Benched ${f.type} Pokémon with ${f.type} Energy`); }
		else if (f.k === 'benchSwap') { if (a.at.zone !== 'bench') no(`${pokeName(k)} must be on your Bench`); if (!(x.slot === 0 || x.slot === 1) || !p.active[x.slot]) no('choose one of your Pokémon in an Active slot'); }
		else if (f.k === 'takeSome') { if (a.at.zone !== 'bench') no(`${pokeName(k)} must be on your Bench`); t = p.active[x.slot]; if (!t || !t.dmg) no('choose one of your Pokémon in an Active slot that has damage on it'); }
		else if (f.k === 'cureRandom') { t = p.active[x.slot]; if (!t || !Object.keys(t.status).length) no('choose one of your Pokémon in an Active slot that has a Special Condition'); }
		else if (f.k === 'takeDamage') { t = ownAt(S, p, x.from); if (t === k || !t.dmg) no('choose another of your Pokémon that has damage on it'); }
		else if (f.k === 'discardDraw') { if (p.hand[x.hand] == null) no('choose a card in your hand to discard'); }
		else if (f.k === 'moveEnergy') {
			t = ownAt(S, p, x.at); if (x.at.zone !== 'active' || !isT(t, f.type)) no(`choose one of your ${f.type} Pokémon in an Active slot`);
			const b = p.bench[x.bench]; if (!b || !isT(b, f.type) || !b.energy.includes(f.type)) no(`choose one of your Benched ${f.type} Pokémon with a ${f.type} Energy`);
		}
		if (!f.repeat) k.abilityUsed = S.turn;
		log(S, { k: 'ability', seat: p.seat, msg: `${p.name}'s ${pokeName(k)} uses ${ab.name}.` });
		const credit = new Map();
		if (f.k === 'healAll') { for (const m of inPlay(p)) { const h = !f.type || isT(m, f.type) ? hl(S, f.n, m.dmg) : 0; if (h) { m.dmg -= h; log(S, { k: 'heal', msg: `${pokeName(m)} heals ${h} damage.` }); } } }
		else if (f.k === 'portrait') { const q = S.players[x.opp], idxs = q.hand.map((d, n) => (card(d).kind === 'supporter' ? n : -1)).filter(n => n >= 0); if (!idxs.length) log(S, { k: 'note', msg: `${q.name} has no Supporter card in hand.` }); else { const got = q.hand[S.rand.pick(idxs)]; p.flags.penny = got; p.flags.pennyBy = ab.name; log(S, { k: 'reveal', seat: p.seat, msg: `${p.name} looks at a random Supporter card in ${q.name}'s hand.`, privateTo: p.seat, privateMsg: `It is ${card(got).name}. You may use its effect this turn.` }); } }
		else if (f.k === 'ping' && poncho(S, t)) log(S, { k: 'note', msg: `${card(t.tool).name} prevents the damage to ${pokeName(t)}.` });
		else if (f.k === 'ping') { t.dmg += f.n; credit.set(t.uid, p.seat); log(S, { k: 'damage', msg: `${ab.name} does ${f.n} damage to ${label(S, x.target)}.` }); }
		else if (f.k === 'attachZoneSelf') yield* attachFromZone(S, p, k, f.type, ab.name);
		else if (f.k === 'attachZoneActiveType' || f.k === 'attachZoneAnyType') yield* attachFromZone(S, p, t, f.type, ab.name);
		else if (f.k === 'peekAny') { const q = S.players[x.seat]; log(S, { k: 'reveal', msg: `${p.name} looks at the top card of ${q.seat === p.seat ? 'their own' : q.name + "'s"} deck.`, privateTo: p.seat, privateMsg: `Top of ${q.seat === p.seat ? 'your' : q.name + "'s"} deck: ${q.deck.length ? card(q.deck[0]).name : '(empty)'}.` }); }
		else if (f.k === 'coinSleep') { if (flip(S, p.seat, ab.name)) setStatus(S, t, 'asleep', p.seat); }
		else if (f.k === 'coinPoison') { if (flip(S, p.seat, ab.name)) setStatus(S, t, 'poisoned', p.seat); }
		else if (f.k === 'ubSwap') { const out = p.active[x.slot], b = p.bench[x.bench]; clearOnLeaveActive(out); p.active[x.slot] = b; p.bench[x.bench] = out; b.movedUp = S.turn; log(S, { k: 'switch', seat: p.seat, msg: `${p.name} switches ${pokeName(out)} with ${pokeName(b)} (Active ${SLOT[x.slot]}).` }); }
		else if (f.k === 'statusActive') setStatus(S, t, f.s, p.seat);
		else if (f.k === 'healExForEnergy') { const h = hl(S, f.n, t.dmg); t.dmg -= h; log(S, { k: 'heal', msg: `${pokeName(t)} heals ${h} damage.` }); if (h && t.energy.length) { const en = t.energy.splice(S.rand.int(t.energy.length), 1)[0]; ed(p).push(en); log(S, { k: 'energy', msg: `${pokeName(t)} loses a ${en} Energy.` }); } }
		else if (f.k === 'boostForEnergy') { k.energy.splice(k.energy.indexOf(f.type), 1); ed(p).push(f.type); (p.flags.boost = p.flags.boost || []).push({ n: f.n, names: null, from: ab.name, ex: false, cardType: f.type }); log(S, { k: 'status', msg: `During this turn, ${p.name}'s ${f.type} Pokémon's attacks do +${f.n} damage.` }); }
		else if (f.k === 'coinPull') { if (flip(S, p.seat, ab.name)) { const q = S.players[x.target.seat], b = q.bench[x.bench]; clearOnLeaveActive(t); q.active[x.target.idx] = b; q.bench[x.bench] = t; log(S, { k: 'switch', msg: `${q.name}'s ${pokeName(b)} is pulled into Active ${SLOT[x.target.idx]}; ${pokeName(t)} goes to the Bench.` }); } }
		else if (f.k === 'millOpp') { const q = S.players[x.opp]; for (let i = 0; i < f.n && q.deck.length; i++) { const got = q.deck.shift(); q.discard.push(got); log(S, { k: 'discard', msg: `${q.name} discards ${card(got).name} from the top of their deck.` }); } }
		else if (f.k === 'switchActiveType') { const out = p.active[x.slot], b = p.bench[x.bench]; clearOnLeaveActive(out); p.active[x.slot] = b; p.bench[x.bench] = out; b.movedUp = S.turn; log(S, { k: 'switch', seat: p.seat, msg: `${p.name} switches ${pokeName(out)} out for ${pokeName(b)} (Active ${SLOT[x.slot]}).` }); }
		else if (f.k === 'toolsThenDiscardSelf') { dropTool(S, t, ab.name); removeFromPlay(S, k); discardPoke(S, p, k); log(S, { k: 'discard', seat: p.seat, msg: `${p.name} discards ${pokeName(k)} from play.` }); }
		else if (f.k === 'attachZoneSelfDmg') { for (let i = 0; i < f.n; i++) yield* attachFromZone(S, p, k, f.type, ab.name); k.dmg += f.dmg; { const os = opponents(S, p.seat), to = k.hitBy != null ? k.hitBy : os.length === 1 ? os[0].seat : null; if (to != null) credit.set(k.uid, to); } log(S, { k: 'damage', seat: p.seat, msg: `${ab.name} does ${f.dmg} damage to ${pokeName(k)}.` }); }
		else if (f.k === 'healAny') { const h = hl(S, f.n, t.dmg); t.dmg -= h; log(S, { k: 'heal', msg: `${pokeName(t)} heals ${h} damage.` }); }
		else if (f.k === 'pullDamaged') { const q = S.players[x.target.seat], b = q.bench[x.bench]; clearOnLeaveActive(t); q.active[x.target.idx] = b; q.bench[x.bench] = t; log(S, { k: 'switch', msg: `${q.name}'s ${pokeName(b)} is pulled into Active ${SLOT[x.target.idx]}; ${pokeName(t)} goes to the Bench.` }); }
		else if (f.k === 'gatherAll') { let n = 0; for (const m of inPlay(p)) { if (m === k) continue; const mv = m.energy.filter(en => en === f.type); m.energy = m.energy.filter(en => en !== f.type); k.energy.push(...mv); n += mv.length; } log(S, { k: 'energy', seat: p.seat, msg: `${n} ${f.type} Energy moves to ${pokeName(k)}.` }); }
		else if (f.k === 'attachDiscardSelf') { ed(p).splice(ed(p).indexOf(f.type), 1); k.energy.push(f.type); k.dmg += f.n; { const os = opponents(S, p.seat), to = k.hitBy != null ? k.hitBy : os.length === 1 ? os[0].seat : null; if (to != null) credit.set(k.uid, to); } /* a Knock Out by its own Ability: the points go to the opponent that last damaged it, or to the only opponent */ log(S, { k: 'energy', seat: p.seat, msg: `A ${f.type} Energy from ${p.name}'s discard pile is attached to ${pokeName(k)}, which takes ${f.n} damage.` }); }
		else if (f.k === 'pokemonToHand') { const idxs = p.deck.map((i, n) => (card(i).kind === (f.kind || 'pokemon') ? n : -1)).filter(n => n >= 0); if (idxs.length && p.hand.length < LIMITS.maxHand) { const got = p.deck.splice(S.rand.pick(idxs), 1)[0]; p.hand.push(got); S.rand.shuffle(p.deck); log(S, { k: 'draw', seat: p.seat, msg: `${p.name} puts a ${f.kind === 'tool' ? 'Pokémon Tool card' : 'Pokémon'} from their deck into their hand.`, privateTo: p.seat, privateMsg: `You put ${card(got).name} into your hand.` }); } else log(S, { k: 'note', msg: 'Nothing was found.' }); }
		else if (f.k === 'gatherFrom') { const b = p.bench[x.bench], moved = b.energy.filter(e => e === f.type); b.energy = b.energy.filter(e => e !== f.type); t.energy.push(...moved); log(S, { k: 'energy', seat: p.seat, msg: `${moved.length} ${f.type} Energy moves from ${pokeName(b)} to ${pokeName(t)}.` }); }
		else if (f.k === 'benchSwap') { const out = p.active[x.slot]; clearOnLeaveActive(out); p.active[x.slot] = k; p.bench[a.at.idx] = out; k.movedUp = S.turn; log(S, { k: 'switch', seat: p.seat, msg: `${p.name} switches ${pokeName(k)} in for ${pokeName(out)} (Active ${SLOT[x.slot]}).` }); }
		else if (f.k === 'healActive') { const h = hl(S, f.n, t.dmg); t.dmg -= h; log(S, { k: 'heal', msg: `${pokeName(t)} heals ${h} damage.` }); }
		else if (f.k === 'poisonActive') setStatus(S, t, 'poisoned', p.seat);
		else if (f.k === 'driveOff') yield* switchOut(S, x.target, ab.name);
		else if (f.k === 'pullBenchBasic') { const q = S.players[x.target.seat], b = q.bench[x.bench]; clearOnLeaveActive(t); q.active[x.target.idx] = b; q.bench[x.bench] = t; log(S, { k: 'switch', msg: `${q.name}'s ${pokeName(b)} is pulled into Active ${SLOT[x.target.idx]}; ${pokeName(t)} goes to the Bench.` }); }
		else if (f.k === 'moveEnergy') { const b = p.bench[x.bench]; b.energy.splice(b.energy.indexOf(f.type), 1); t.energy.push(f.type); log(S, { k: 'energy', seat: p.seat, msg: `A ${f.type} Energy moves from ${pokeName(b)} to ${pokeName(t)}.` }); }
		else if (f.k === 'takeSome') { const n = Math.min(f.n, t.dmg); k.dmg += n; t.dmg -= n; if (t.hitBy != null) k.hitBy = t.hitBy; if (k.hitBy != null) credit.set(k.uid, k.hitBy); log(S, { k: 'damage', seat: p.seat, msg: `${n} damage moves from ${pokeName(t)} to ${pokeName(k)}.` }); }
		else if (f.k === 'cureRandom') { const st = S.rand.pick(Object.keys(t.status).sort()); delete t.status[st]; log(S, { k: 'status', msg: `${pokeName(t)} is no longer ${st[0].toUpperCase() + st.slice(1)}.` }); }
		else if (f.k === 'takeDamage') { const n = t.dmg; k.dmg += n; t.dmg = 0; if (t.hitBy != null) k.hitBy = t.hitBy; if (k.hitBy != null) credit.set(k.uid, k.hitBy); log(S, { k: 'damage', seat: p.seat, msg: `${n} damage moves from ${pokeName(t)} to ${pokeName(k)}.` }); }
		else if (f.k === 'discardDraw') { const gone = p.hand.splice(x.hand, 1)[0]; p.discard.push(gone); log(S, { k: 'discard', seat: p.seat, msg: `${p.name} discards ${card(gone).name} from their hand.` }); draw(S, p, 1); }
		else if (f.k === 'peekTop') log(S, { k: 'reveal', msg: `${p.name} looks at the top card of their deck.`, privateTo: p.seat, privateMsg: `Top of your deck: ${p.deck.slice(0, f.n).map(i => card(i).name).join(', ') || '(empty)'}.` });
		if (pingCredit) { for (const [u, seat] of pingCredit) credit.set(u, seat); pingCredit = null; }
		yield* settle(S, credit, p.seat);
		if (f.endsTurn && !S.over && S.current === p.seat) { log(S, { k: 'note', msg: `${ab.name}: ${p.name}'s turn ends.` }); yield* endTurn(S); }
	},
	// ---- EXECUTE: both Active Pokémon's commands, committed together, resolved A then B; then the turn ends ----
	*execute(S, a) {
		const p = needTurn(S, a);
		const cmds = [0, 1].map(i => (a.commands || [])[i] ?? null);
		const ready = cmds.map((c, i) => checkCommand(S, p, i, c));   // all of it is validated before anything resolves
		const line = (r, i) => `Active ${SLOT[i]}: ${p.active[i] ? pokeName(p.active[i]) : '(empty)'} → ${r ? r.attack.name + (r.target ? ' → ' + label(S, cmds[i].target) : '') : 'Pass'}`;
		log(S, { k: 'execute', seat: p.seat, msg: `${p.name} executes. ${line(ready[0], 0)}. ${line(ready[1], 1)}. (Resolved in order: A, then B.)` });
		for (const r of ready) {
			if (!r) continue;
			if (S.over) break;
			const tag = `Active ${SLOT[r.slot]}`;
			// a queued attack is not redirected: it fails if its user or its target is gone or no longer able
			if (p.active[r.slot] !== r.poke) { log(S, { k: 'fail', msg: `${tag}'s ${r.attack.name} fails: its user is no longer there.` }); continue; }
			const why = attackBlock(S, p.seat, r.poke, r.attack);
			if (why) { log(S, { k: 'fail', msg: `${tag}'s ${r.attack.name} fails: ${why}.` }); continue; }
			if (r.poke.status.confused && !flip(S, p.seat, `${pokeName(r.poke)} is Confused`)) { log(S, { k: 'fail', msg: `${tag}'s ${r.attack.name} doesn't happen: ${pokeName(r.poke)} is Confused.` }); continue; }
			if (hasFx(r.poke, 'smokescreen') && !flip(S, p.seat, `${pokeName(r.poke)} tries to attack`)) { log(S, { k: 'fail', msg: `${tag}'s ${r.attack.name} doesn't happen.` }); continue; }
			if (r.target) { const loc = locate(S, r.target), c = cmds[r.slot].target; if (!loc || loc.seat !== c.seat || loc.zone !== c.zone || loc.idx !== c.idx) { log(S, { k: 'fail', msg: `${tag}'s ${r.attack.name} fails: its target is no longer there.` }); continue; } }
			log(S, { k: 'attack', seat: p.seat, msg: `${tag}: ${p.name}'s ${pokeName(r.poke)} uses ${r.attack.name}${r.target ? ' on ' + label(S, cmds[r.slot].target) : ''}.` });
			const ctx = { seat: p.seat, poke: r.poke, attack: r.attack, target: r.target, args: r.args, credit: new Map(), slot: r.slot, name: pokeName(r.poke) };
			const star = p.flags.star ? null : inPlay(p).map(m => passive(m, 'victoryStar') && isT(r.poke, passive(m, 'victoryStar').type) ? top(m).ability.name : null).find(Boolean) || null;
			const before = star ? saveState(S) : null, mark = S.log.length;
			yield* runAttack(S, ctx);
			if (before && !S.over) {
				const flips = S.log.slice(mark).filter(e => e.k === 'coin').map(e => !!e.heads);
				if (flips.length && (yield { seat: p.seat, kind: 'confirm', options: [0, 1], cards: [], flips, msg: `${star}: ${r.attack.name}'s coins came up ${flips.map(h => (h ? 'heads' : 'tails')).join(', ')}. Ignore them and flip again?` })) {
					loadState(S, before); p.flags.star = true;
					const byUid = new Map(S.players.flatMap(q => inPlay(q)).map(m => [m.uid, m]));
					for (const r2 of ready) if (r2) { r2.poke = byUid.get(r2.poke.uid) || r2.poke; if (r2.target) r2.target = byUid.get(r2.target.uid) || r2.target; }
					log(S, { k: 'ability', seat: p.seat, msg: `${p.name} uses ${star}: those results are ignored, and ${r.attack.name}'s coins are flipped again.` });
					ctx.poke = r.poke; ctx.target = r.target; ctx.credit = new Map();
					yield* runAttack(S, ctx);
				}
			}
			r.poke.used = true;   // (it has used an attack since it came into play: Iron Bundle ex, Flutter Mane ex)
			if (pingCredit) { for (const [u, seat] of pingCredit) ctx.credit.set(u, seat); pingCredit = null; }
			yield* settle(S, ctx.credit, r.target ? cmds[r.slot].target.seat : null, { name: ctx.name });
		}
		if (!S.over) yield* endTurn(S);
	},
	*concede(S, a) {
		const p = mine(S, a); if (p.eliminated || S.over) no('the match is over for you');
		for (const k of inPlay(p)) { removeFromPlay(S, k); discardPoke(S, p, k); }
		eliminate(S, p, 'concedes');
		if (checkOver(S)) return;
		if (S.phase === 'setup') { if (S.players.every(q => q.setup || q.eliminated)) { S.current = S.order.find(s => !S.players[s].eliminated); startTurn(S); } return; }
		if (S.current === p.seat) { S.pending = null; yield* endTurn(S); }
	},
};

/** Run a resolution until it finishes or needs a player's choice (then it waits in S.pending). */
// Victory Star: the match as it stood before an attack, so that its coins can be flipped again. Everything but the random
// streams (they move on, so the new flips are new), the log (what happened stays written) and the pending choice.
const saveState = S => JSON.stringify(S, (k, v) => (k === 'rand' || k === 'erand' || k === 'log' || k === 'pending' ? undefined : v));
function loadState(S, text) {
	const snap = JSON.parse(text);
	for (const k of Object.keys(S)) if (!(k in snap) && k !== 'rand' && k !== 'log' && k !== 'pending') delete S[k];
	for (const k of Object.keys(snap)) if (k !== 'players') S[k] = snap[k];
	snap.players.forEach((sp, i) => { const p = S.players[i]; for (const k of Object.keys(p)) if (k !== 'erand' && !(k in sp)) delete p[k]; Object.assign(p, sp); });
	pingCredit = null;
}
function drive(S, gen, sent) {
	const r = gen.next(sent);
	S.pending = r.done ? null : { ...r.value, gen };
}

export function apply(S, a) {
	CUR = S;
	if (S.over) no('the match is over');
	if (!a || typeof a !== 'object') no('not an action');
	if (a.t === 'choose') {
		const pd = S.pending; if (!pd) no('there is nothing to choose');
		if (pd.seat !== a.seat) no('that choice is not yours');
		if (!pd.options.includes(a.pick)) no('that is not one of the choices');
		drive(S, pd.gen, a.pick);
	} else {
		const h = HANDLERS[a.t]; if (!h) no(`unknown action ${a.t}`);
		if (S.pending && a.t !== 'concede') no('waiting on a choice');
		drive(S, h(S, a));
	}
	sweepShield(S);
	S.actions++;
	return S;
}
/** Would this action be refused? -> the reason, or null. Checked on a copy: nothing changes. */
export function refusal(S, a, history) {
	try { apply(replay(S.config, history), a); return null; } catch (e) { if (e && e.refused) return e.message; throw e; }
}
/** The state after the first `upTo` actions (all of them by default). A recorded action that is refused stops it. */
export function replay(config, actions, upTo) {
	const S = createGame(config), n = Math.min(upTo ?? actions.length, actions.length);
	for (let i = 0; i < n; i++) apply(S, actions[i]);
	return S;
}

// --------------------------------------------------------------------------------------------------------- view
const pubPoke = (k, S) => (k ? { extra: recalls(k) ? k.cards.slice(0, -1).flatMap(i => (card(i).attacks || []).map((_, n) => [i, n])) : [], provides: provided(S, k), tool: k.tool || null, retreat: retreatCost(S, k), less: costLess(S, k), uid: k.uid, id: k.cards[k.cards.length - 1], cards: k.cards.slice(), dmg: k.dmg, hp: hpOf(k), energy: k.energy.slice(), status: Object.keys(k.status), fx: k.fx.map(f => ({ k: f.k, n: f.n, name: f.name })), turnPlayed: k.turnPlayed, turnEvolved: k.turnEvolved, abilityUsed: k.abilityUsed } : null);
/** What `seat` may see (null: a spectator). Hands and decks are never in it, except the seat's own hand. */
export function view(S, seat) {
	CUR = S;
	return {
		stadium: S.stadium ? { id: S.stadium.id, seat: S.stadium.seat } : null, spots: S.players.flatMap(p => (p.spots || []).map(sp => ({ seat: p.seat, zone: sp.zone, idx: sp.idx, n: sp.n }))),
		v: S.v, rules: S.rules, phase: S.phase, turn: S.turn, current: S.current, first: S.first, order: S.order.slice(), points: S.opts.points, over: S.over, you: seat,
		pending: S.pending ? { seat: S.pending.seat, kind: S.pending.kind, ...(S.pending.flips && S.pending.seat === seat ? { flips: S.pending.flips.slice() } : {}), msg: S.pending.msg, slot: S.pending.slot, options: S.pending.seat === seat ? S.pending.options.slice() : null, cards: S.pending.seat === seat && S.pending.cards ? S.pending.cards.slice() : null, locs: S.pending.locs ? S.pending.locs.map(l => ({ ...l })) : null } : null,
		players: S.players.map(p => ({
			seat: p.seat, name: p.name, ai: p.ai, points: p.points, eliminated: p.eliminated, setup: p.setup, turns: p.turns, deck: p.deck.length, hand: p.seat === seat ? p.hand.slice() : null, handCount: p.hand.length,
			discard: p.discard.slice(), zone: { cur: p.zone.cur, next: p.zone.next }, energy: p.energy.slice(), active: p.active.map(k => pubPoke(k, S)), bench: p.bench.map(k => pubPoke(k, S)), guard: p.guard ? p.guard.n : 0, energyDiscard: (p.energyDiscard || []).slice(),
			flags: { attached: !!p.flags.attached, supporter: !!p.flags.supporter, retreated: !!p.flags.retreated, retreatLess: p.flags.retreatLess || 0, revenge: !!p.flags.revenge, boost: (p.flags.boost || []).map(b => ({ n: b.n, names: b.names, from: b.from, evo: b.evo || null, any: !!b.any })), stadiumUsed: !!p.flags.stadiumUsed, penny: p.seat === seat ? p.flags.penny || null : null, pennyBy: p.seat === seat ? p.flags.pennyBy || null : null }, noSupporter: p.noSupporter > 0, noItems: p.noItems > 0, noZoneActive: p.noZoneActive > 0,
		})),
		// (`more`: what only this seat is told, e.g. the card it drew with Poké Ball; kept apart from the public line)
		log: S.log.map(e => ({ n: e.n, turn: e.turn, k: e.k, seat: e.seat ?? null, msg: e.msg, ...(e.privateTo != null && e.privateTo === seat ? { more: e.privateMsg } : {}) })),
	};
}
/** A short line for a friends list ("Turn 7 · 2–1–0"). */
export const labelOf = S => (S.over ? 'Match over' : S.phase === 'setup' ? 'Setting up' : `Turn ${S.turn} · ${S.players.map(p => p.points).join('–')}`);
/** A stable fingerprint of a position, for "did the replay end where the game did". */
export function digest(S) {
	CUR = S;
	const s = JSON.stringify([S.phase, S.turn, S.current, S.over, S.players.map(p => [p.points, p.eliminated, p.hand, p.deck, p.discard, p.zone, p.active.map(k => pubPoke(k, S)), p.bench.map(k => pubPoke(k, S))]), ...(S.stadium ? [S.stadium] : [])]);   // (a match with no Stadium has the digest it always had)
	let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16);
}
