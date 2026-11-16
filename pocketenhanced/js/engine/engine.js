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
import { card } from '../data/cards.js';
import { effectiveness, ENERGY_TYPES } from './types.js';

export const ENGINE_VERSION = 1;
export const LIMITS = Object.freeze({ deck: 20, copies: 2, hand: 5, maxHand: 10, actives: 2, bench: 4, players: [2, 4], energyTypes: [1, 3] });
export class Refused extends Error { constructor(why) { super(why); this.refused = true; } }
const no = why => { throw new Refused(why); };

// ---------------------------------------------------------------------------------------------------- small helpers
const xmur3 = str => { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^ (h >>> 16)) >>> 0; };
const SLOT = ['A', 'B'];
const top = poke => card(poke.cards[poke.cards.length - 1]);
const hpOf = poke => top(poke).hp;
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
const flip = (S, seat, why) => { const heads = S.rand.chance(0.5); log(S, { k: 'coin', seat, heads, msg: `${who(S, seat)} flips a coin${why ? ' (' + why + ')' : ''}: ${heads ? 'HEADS' : 'tails'}.` }); return heads; };

// ---------------------------------------------------------------------------------------------- Pokémon in play
export function makePoke(S, cardId) { return { uid: ++S.uid, cards: [cardId], dmg: 0, energy: [], status: {}, fx: [], turnPlayed: S.turn, turnEvolved: -1, abilityUsed: -1 }; }
function draw(S, p, n, quiet) {
	let got = 0;
	for (let i = 0; i < n; i++) { if (!p.deck.length || p.hand.length >= LIMITS.maxHand) break; p.hand.push(p.deck.shift()); got++; }
	if (!quiet) log(S, { k: 'draw', seat: p.seat, n: got, msg: `${p.name} draws ${got === 1 ? 'a card' : got + ' cards'}${got < n ? (p.deck.length ? ' (hand full)' : ' (deck empty)') : ''}.` });
	return got;
}
function clearOnLeaveActive(poke) { poke.status = {}; poke.fx = []; }   // conditions and attack effects end on the Bench
function discardPoke(S, p, poke) { p.discard.push(...poke.cards); poke.energy = []; }
function removeFromPlay(S, poke) { const loc = locate(S, poke); if (!loc) return; const p = S.players[loc.seat]; if (loc.zone === 'active') p.active[loc.idx] = null; else p.bench[loc.idx] = null; }
const hasFx = (poke, k) => poke.fx.some(f => f.k === k);
const passive = (poke, k) => { const a = top(poke).ability; return a && a.fx.k === k ? a.fx : null; };
const canAct = poke => !poke.status.asleep && !poke.status.paralyzed;

/** Can these attached Energy pay this cost? Typed costs need their type; Colorless takes anything. */
export function canPay(energy, cost) {
	const pool = energy.slice();
	for (const c of cost.filter(c => c !== 'Colorless')) { const i = pool.indexOf(c); if (i < 0) return false; pool.splice(i, 1); }
	return pool.length >= cost.filter(c => c === 'Colorless').length;
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
		if (tLoc.zone === 'active' && tLoc.seat !== ctx.seat) for (const b of atkP.flags.boost || []) if (!b.names || b.names.includes(pokeName(ctx.poke))) { d += b.n; parts.push(`+${b.n} ${b.from}`); }
		for (const f of ctx.poke.fx) if (f.k === 'atkMinus') { d -= f.n; parts.push(`-${f.n} (weakened)`); }
		const eff = effectiveness(ctx.attack.combatType, top(target).combatTypes);
		for (const part of eff.parts) if (part.mod) parts.push(`${part.mod > 0 ? '+' : ''}${part.mod} ${ctx.attack.combatType} into ${part.type}`); else if (part.immune) parts.push(`0 ${ctx.attack.combatType} into ${part.type} (no immunity here)`);
		d += eff.total;
		const red = passive(target, 'reduce'); if (red) { d -= red.n; parts.push(`-${red.n} ${top(target).ability.name}`); }
		for (const f of target.fx) if (f.k === 'reduce') { d -= f.n; parts.push(`-${f.n} (guarding)`); }
	}
	if (hasFx(target, 'prevent') && tLoc.seat !== ctx.seat) { d = 0; parts.push('prevented'); }
	d = Math.max(0, d);
	target.dmg += d;
	log(S, { k: 'damage', seat: ctx.seat, to: tLoc, n: d, type: ctx.attack.combatType, msg: `${note || ctx.attack.name} does ${d} damage to ${label(S, tLoc)} [${parts.join(', ')}]. (${Math.max(0, hpOf(target) - target.dmg)}/${hpOf(target)} HP)` });
	// Poliwrath's Counterattack: an Active one damaged by an opposing Pokémon's attack hits back (no effectiveness)
	const counter = passive(target, 'counter');
	if (d > 0 && counter && tLoc.zone === 'active' && tLoc.seat !== ctx.seat && locate(S, ctx.poke)) { ctx.poke.dmg += counter.n; log(S, { k: 'damage', seat: tLoc.seat, msg: `${top(target).ability.name}: ${pokeName(ctx.poke)} takes ${counter.n} damage.` }); ctx.credit.set(ctx.poke.uid, tLoc.seat); }
	if (d > 0) ctx.credit.set(target.uid, ctx.seat);
	return d;
}
function plainDamage(S, target, n, msg, creditSeat, ctx) {   // not an attack's damage: no effectiveness, no reductions
	target.dmg += n; log(S, { k: 'damage', n, msg });
	if (ctx && creditSeat != null) ctx.credit.set(target.uid, creditSeat);
}

/** Knock Outs, points, eliminations, the win. `credit`: uid -> the seat that gets the points for that Pokémon. */
function* settle(S, credit, fallbackSeat) {
	const fell = [];
	for (const p of S.players) for (const k of inPlay(p)) if (k.dmg >= hpOf(k)) fell.push([p, k]);
	for (const [p, k] of fell) {
		let to = credit && credit.has(k.uid) ? credit.get(k.uid) : fallbackSeat;
		// a Pokémon knocked out by its own side's doing gives its points to the player it was fighting (RULES.md)
		if (to === p.seat || to == null || S.players[to].eliminated) to = fallbackSeat != null && fallbackSeat !== p.seat ? fallbackSeat : null;
		const pts = top(k).points;
		log(S, { k: 'ko', seat: p.seat, msg: `${p.name}'s ${pokeName(k)} is Knocked Out!` + (to != null ? ` ${who(S, to)} takes ${pts} point${pts > 1 ? 's' : ''}.` : ' No one takes points for it.') });
		if (to != null) S.players[to].points += pts;
		removeFromPlay(S, k); discardPoke(S, p, k);
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
		p.active[0] = p.bench[i]; p.bench[i] = null;
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
function attachFromZone(S, p, poke, type, src) { poke.energy.push(type); log(S, { k: 'energy', seat: p.seat, msg: `${src}: ${p.name} attaches a ${type} Energy to ${pokeName(poke)}.` }); }
function setStatus(S, poke, s, bySeat) {
	if (s === 'poisoned') poke.status.poisoned = { by: bySeat };
	else { delete poke.status.asleep; delete poke.status.paralyzed; poke.status[s] = { by: bySeat, turn: S.turn }; }   // Asleep and Paralyzed replace each other
	log(S, { k: 'status', msg: `${pokeName(poke)} is now ${s[0].toUpperCase() + s.slice(1)}.` });
}

// ------------------------------------------------------------------------------------------------- one attack
// ctx: { seat, poke, attack, target (Pokémon or null), args, credit, slot }
function* runAttack(S, ctx) {
	const me = S.players[ctx.seat], a = ctx.attack, T = ctx.target, tLoc = T ? locate(S, T) : null, tOwner = tLoc ? S.players[tLoc.seat] : null;
	const fx = k => a.fx.find(f => f.k === k);
	let base = a.damage, nothing = false, selfDmg = 0;
	// --- what the damage is ---
	for (const f of a.fx) {
		if (f.k === 'coinNothing' && !flip(S, ctx.seat, a.name)) nothing = true;
		else if (f.k === 'coinsAllBonus') { let all = true; for (let i = 0; i < f.coins; i++) if (!flip(S, ctx.seat, a.name)) all = false; if (all) base += f.bonus; }
		else if (f.k === 'coinsMul') { let h = 0; for (let i = 0; i < f.coins; i++) if (flip(S, ctx.seat, a.name)) h++; base = f.per * h; }
		else if (f.k === 'coinsUntilTails') { let h = 0; while (flip(S, ctx.seat, a.name)) h++; base = f.per * h; }
		else if (f.k === 'coinBonus') { if (flip(S, ctx.seat, a.name)) base += f.bonus; else if (f.tailsSelf) selfDmg += f.tailsSelf; }
		else if (f.k === 'extraEnergyBonus') { if (extraEnergy(ctx.poke.energy, a.cost, f.type) >= f.need) base += f.bonus; }
		else if (f.k === 'selfDamagedBonus') { if (ctx.poke.dmg > 0) base += f.bonus; }
		else if (f.k === 'targetDamagedBonus') { if (T && T.dmg > 0) base += f.bonus; }
		else if (f.k === 'targetPoisonedBonus') { if (T && T.status.poisoned) base += f.bonus; }
		else if (f.k === 'perTargetEnergy') { if (T) base += f.n * T.energy.length; }
		else if (f.k === 'perBench') base = f.n * benched(me).filter(k => !f.type || top(k).cardType === f.type).length;
		else if (f.k === 'perBenchName') base += f.n * benched(me).filter(k => pokeName(k) === f.name).length;
		else if (f.k === 'selfDamage') selfDmg += f.n;
		else if (f.k === 'snipe') base = f.n;
	}
	if (nothing) { log(S, { k: 'note', msg: `${a.name} does nothing.` }); return; }
	// --- the copied attack (Ditto): the chosen attack, run as this Pokémon's, into this attack's target ---
	if (fx('copyAttack')) {
		const from = ctx.args.from && at(S, ctx.args.from), ca = from && top(from).attacks[ctx.args.attack | 0];
		if (!ca || !canPay(ctx.poke.energy, ca.cost) || ca.fx.some(f => f.k === 'copyAttack')) { log(S, { k: 'note', msg: `${a.name} does nothing.` }); return; }
		log(S, { k: 'note', msg: `${pokeName(ctx.poke)} copies ${pokeName(from)}'s ${ca.name}.` });
		yield* runAttack(S, { ...ctx, attack: ca, args: ctx.args.copyArgs || {} });
		return;
	}
	// --- the hits ---
	let dealt = 0;
	if (fx('randomHits')) {
		const f = fx('randomHits'), victim = tOwner;
		for (let i = 0; i < f.times; i++) { const pool = victim ? inPlay(victim) : []; if (!pool.length) break; attackDamage(S, ctx, S.rand.pick(pool), f.n); }
	} else if (T && (base > 0 || a.damage > 0 || a.damageMode)) dealt = attackDamage(S, ctx, T, base);
	const hitBlocked = T && hasFx(T, 'prevent') && tLoc.seat !== ctx.seat;   // Dig: effects of the attack are prevented too
	// --- everything else the attack does ---
	for (const f of a.fx) {
		if (f.k === 'benchSplash') { for (const k of benched(tOwner)) attackDamage(S, ctx, k, f.n, `${a.name} (Bench)`); }
		else if (f.k === 'ownBenchDamage') { const k = me.bench[ctx.args.bench] || benched(me)[0]; if (k) plainDamage(S, k, f.n, `${a.name} also does ${f.n} damage to ${me.name}'s own ${pokeName(k)}.`, tLoc ? tLoc.seat : null, ctx); }
		else if (f.k === 'discardSelfEnergy') {
			let n = f.n === 'all' ? ctx.poke.energy.length : f.n, gone = 0;
			while (n-- > 0) { const i = f.type ? ctx.poke.energy.indexOf(f.type) : 0; if (i < 0 || !ctx.poke.energy.length) break; ctx.poke.energy.splice(i, 1); gone++; }
			log(S, { k: 'energy', msg: `${pokeName(ctx.poke)} discards ${gone} Energy.` });
		} else if (f.k === 'draw') draw(S, me, f.n);
		else if (f.k === 'heal') { const h = Math.min(f.n, ctx.poke.dmg); ctx.poke.dmg -= h; log(S, { k: 'heal', msg: `${pokeName(ctx.poke)} heals ${h} damage.` }); }
		else if (f.k === 'healDealt') { const h = Math.min(dealt, ctx.poke.dmg); ctx.poke.dmg -= h; log(S, { k: 'heal', msg: `${pokeName(ctx.poke)} heals ${h} damage.` }); }
		else if (f.k === 'selfReduce') ctx.poke.fx.push({ k: 'reduce', n: f.n, until: { seat: ctx.seat, at: 'start' } });
		else if (f.k === 'coinPrevent') { if (flip(S, ctx.seat, a.name)) ctx.poke.fx.push({ k: 'prevent', until: { seat: ctx.seat, at: 'start' } }); }
		else if (f.k === 'benchFromDeck') {
			const free = me.bench.indexOf(null), idxs = me.deck.map((id, i) => (card(id).name === f.name ? i : -1)).filter(i => i >= 0);
			if (free < 0 || !idxs.length) log(S, { k: 'note', msg: `${a.name}: no ${f.name} could be put onto the Bench.` });
			else { const id = me.deck.splice(S.rand.pick(idxs), 1)[0]; me.bench[free] = makePoke(S, id); S.rand.shuffle(me.deck); log(S, { k: 'play', seat: ctx.seat, msg: `${me.name} puts ${f.name} from their deck onto the Bench.` }); }
		} else if (f.k === 'typeToHand') {
			const idxs = me.deck.map((id, i) => (card(id).kind === 'pokemon' && card(id).cardType === f.type ? i : -1)).filter(i => i >= 0);
			if (!idxs.length || me.hand.length >= LIMITS.maxHand) log(S, { k: 'note', msg: `${a.name}: nothing was found.` });
			else { const id = me.deck.splice(S.rand.pick(idxs), 1)[0]; me.hand.push(id); S.rand.shuffle(me.deck); log(S, { k: 'draw', seat: ctx.seat, msg: `${me.name} puts a ${f.type} Pokémon from their deck into their hand.`, privateTo: ctx.seat, privateMsg: `You put ${card(id).name} into your hand.` }); }
		} else if (f.k === 'attachZone') {
			const k = f.to === 'self' ? ctx.poke : (me.bench[ctx.args.bench] && top(me.bench[ctx.args.bench]).cardType === f.type ? me.bench[ctx.args.bench] : benched(me).find(b => top(b).cardType === f.type));
			if (k) attachFromZone(S, me, k, f.type, a.name); else log(S, { k: 'note', msg: `${a.name}: no Benched ${f.type} Pokémon to attach to.` });
		} else if (f.k === 'coinsAttachBench') {
			let h = 0; for (let i = 0; i < f.coins; i++) if (flip(S, ctx.seat, a.name)) h++;
			const fit = me.bench.map((b, i) => (b && top(b).cardType === f.type ? i : -1)).filter(i => i >= 0), want = Array.isArray(ctx.args.spread) ? ctx.args.spread.filter(i => fit.includes(i)) : [];
			for (let i = 0; i < h && fit.length; i++) attachFromZone(S, me, me.bench[want[i] ?? fit[i % fit.length]], f.type, a.name);
		} else if (f.k === 'switchSelf') {
			const loc = locate(S, ctx.poke), opts = me.bench.map((b, i) => (b ? i : -1)).filter(i => i >= 0);
			if (loc && loc.zone === 'active' && opts.length) { const i = opts.includes(ctx.args.bench) ? ctx.args.bench : opts[0]; clearOnLeaveActive(ctx.poke); me.active[loc.idx] = me.bench[i]; me.bench[i] = ctx.poke; log(S, { k: 'switch', seat: ctx.seat, msg: `${me.name} switches ${pokeName(ctx.poke)} with ${pokeName(me.active[loc.idx])}.` }); }
		}
		if (!T || !locate(S, T) || hitBlocked) continue;   // the rest are done TO the Defending Pokémon
		if (f.k === 'discardTargetEnergy') { if ((!f.coin || flip(S, ctx.seat, a.name)) && T.energy.length) { const e = T.energy.splice(S.rand.int(T.energy.length), 1)[0]; log(S, { k: 'energy', msg: `${pokeName(T)} loses a ${e} Energy.` }); } }
		else if (f.k === 'targetCantAttack') { if (!f.coin || flip(S, ctx.seat, a.name)) { T.fx.push({ k: 'cantAttack', until: { seat: tLoc.seat, at: 'end' } }); log(S, { k: 'status', msg: `${pokeName(T)} can't attack during ${tOwner.name}'s next turn.` }); } }
		else if (f.k === 'targetCantRetreat') { T.fx.push({ k: 'cantRetreat', until: { seat: tLoc.seat, at: 'end' } }); log(S, { k: 'status', msg: `${pokeName(T)} can't retreat during ${tOwner.name}'s next turn.` }); }
		else if (f.k === 'targetAttackMinus') { T.fx.push({ k: 'atkMinus', n: f.n, until: { seat: tLoc.seat, at: 'end' } }); log(S, { k: 'status', msg: `${pokeName(T)}'s attacks do -${f.n} damage during ${tOwner.name}'s next turn.` }); }
		else if (f.k === 'status') { if (!f.coin || flip(S, ctx.seat, a.name)) setStatus(S, T, f.s, ctx.seat); }
		else if (f.k === 'coinDiscardHand') { if (flip(S, ctx.seat, a.name) && tOwner.hand.length) { const id = tOwner.hand.splice(S.rand.int(tOwner.hand.length), 1)[0]; tOwner.discard.push(id); log(S, { k: 'discard', msg: `${tOwner.name} discards ${card(id).name} from their hand.` }); } }
		else if (f.k === 'noSupporter') { tOwner.noSupporter = 1; log(S, { k: 'status', msg: `${tOwner.name} can't use Supporter cards during their next turn.` }); }
		else if (f.k === 'revealHand') log(S, { k: 'reveal', msg: `${tOwner.name} reveals their hand to ${me.name}.`, privateTo: ctx.seat, privateMsg: `${tOwner.name}'s hand: ${tOwner.hand.map(id => card(id).name).join(', ') || '(empty)'}.` });
		else if (f.k === 'coinShuffleTarget') { if (flip(S, ctx.seat, a.name)) { removeFromPlay(S, T); tOwner.deck.push(...T.cards); S.rand.shuffle(tOwner.deck); log(S, { k: 'note', msg: `${tOwner.name}'s ${pokeName(T)} is shuffled into their deck.` }); } }
		else if (f.k === 'switchTarget') yield* switchOut(S, tLoc, a.name);
	}
	if (selfDmg && locate(S, ctx.poke)) plainDamage(S, ctx.poke, selfDmg, `${pokeName(ctx.poke)} does ${selfDmg} damage to itself.`, tLoc ? tLoc.seat : null, ctx);
}

// ----------------------------------------------------------------------------------------------------- the turn
function startTurn(S) {
	const p = S.players[S.current];
	S.turn++;
	p.flags = {};
	for (const k of inPlay(p)) k.fx = k.fx.filter(f => !(f.until && f.until.seat === p.seat && f.until.at === 'start'));
	log(S, { k: 'turn', seat: p.seat, msg: `— Turn ${S.turn}: ${p.name} —` });
	draw(S, p, 1);
	// the Energy Zone: one Energy is ready each turn; one that was not attached stays, it does not pile up (RULES.md).
	// The player who goes first gets none on their first turn.
	if (!(p.turns === 0 && p.seat === S.first)) { if (p.zone.cur == null) { p.zone.cur = p.zone.next; p.zone.next = p.erand.pick(p.energy); } }
	S.phase = 'main';
}
function* endTurn(S) {
	const p = S.players[S.current];
	// Pokémon Checkup: this player's Pokémon, and Pokémon whose condition this player caused (RULES.md "Checkup")
	const credit = new Map();
	for (const q of S.players) for (const k of inPlay(q)) {
		const st = k.status;
		if (st.poisoned && (q.seat === p.seat || st.poisoned.by === p.seat)) { k.dmg += 10; credit.set(k.uid, st.poisoned.by); log(S, { k: 'damage', msg: `${q.name}'s ${pokeName(k)} takes 10 damage from Poison.` }); }
		if (st.asleep && (q.seat === p.seat || st.asleep.by === p.seat)) { if (flip(S, q.seat, `${pokeName(k)} is Asleep`)) { delete st.asleep; log(S, { k: 'status', msg: `${pokeName(k)} wakes up.` }); } }
		if (st.paralyzed && q.seat === p.seat && st.paralyzed.turn !== S.turn) { delete st.paralyzed; log(S, { k: 'status', msg: `${pokeName(k)} is no longer Paralyzed.` }); }
		if (q.seat === p.seat) k.fx = k.fx.filter(f => !(f.until && f.until.seat === p.seat && f.until.at === 'end'));
	}
	yield* settle(S, credit, null);
	if (S.over) return;
	if (p.noSupporter > 0) p.noSupporter--;
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
	const p = S.players[seat];
	if (p.turns === 0 && seat === S.first) return 'the player who goes first cannot attack on their first turn';
	if (top(poke).fossil) return 'a fossil cannot attack';
	if (poke.status.asleep) return `${pokeName(poke)} is Asleep`;
	if (poke.status.paralyzed) return `${pokeName(poke)} is Paralyzed`;
	if (hasFx(poke, 'cantAttack')) return `${pokeName(poke)} can't attack this turn`;
	if (!canPay(poke.energy, attack.cost)) return `${pokeName(poke)} does not have the Energy for ${attack.name}`;
	return null;
}
function checkCommand(S, p, slot, c) {
	if (c == null) return null;
	const poke = p.active[slot]; if (!poke) no(`Active ${SLOT[slot]} is empty`);
	const a = top(poke).attacks[c.attack]; if (!a) no('no such attack');
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
		let zone = a.to && a.to.zone, idx = a.to && a.to.idx;
		if (zone === 'active') { if (!(idx === 0 || idx === 1) || p.active[idx]) no('that Active slot is not empty'); }
		else { zone = 'bench'; if (!(idx >= 0 && idx < 4) || p.bench[idx]) idx = p.bench.indexOf(null); if (idx < 0) no('your Bench is full'); }
		p.hand.splice(a.hand, 1);
		const k = makePoke(S, id); if (zone === 'active') p.active[idx] = k; else p.bench[idx] = k;
		log(S, { k: 'play', seat: p.seat, msg: `${p.name} plays ${card(id).name} to ${where({ zone, idx })}.` });
	},
	*evolve(S, a) {
		const p = needTurn(S, a), id = p.hand[a.hand], c = card(id); if (!c || c.kind !== 'pokemon' || c.stage === 0) no('choose an evolution card');
		const k = ownAt(S, p, a.at);
		if (pokeName(k) !== c.evolvesFrom) no(`${c.name} evolves from ${c.evolvesFrom}`);
		if (p.turns === 0) no('you cannot evolve on your first turn');
		if (k.turnPlayed === S.turn || k.turnEvolved === S.turn) no(`${pokeName(k)} cannot evolve the turn it was played`);
		p.hand.splice(a.hand, 1);
		const was = pokeName(k); k.cards.push(id); k.turnEvolved = S.turn; k.status = {}; k.fx = [];   // Energy and damage stay; conditions go
		log(S, { k: 'evolve', seat: p.seat, msg: `${p.name}'s ${was} evolves into ${c.name}.` });
	},
	*attach(S, a) {
		const p = needTurn(S, a);
		if (p.flags.attached) no('you have already attached Energy this turn');
		if (p.zone.cur == null) no('there is no Energy in your Energy Zone');
		const k = ownAt(S, p, a.at);
		if (top(k).fossil) no('Energy cannot be attached to a fossil');
		const e = p.zone.cur; p.zone.cur = null; p.flags.attached = true; k.energy.push(e);
		log(S, { k: 'energy', seat: p.seat, msg: `${p.name} attaches a ${e} Energy to ${pokeName(k)} (${where(a.at)}).` });
	},
	*retreat(S, a) {
		const p = needTurn(S, a);
		if (p.flags.retreated) no('you have already retreated this turn');
		const k = p.active[a.slot]; if (!k) no('that Active slot is empty');
		const b = p.bench[a.bench]; if (!b) no('choose a Benched Pokémon to switch in');
		if (top(k).fossil) no("a fossil can't retreat");
		if (!canAct(k)) no(`${pokeName(k)} can't retreat while ${k.status.asleep ? 'Asleep' : 'Paralyzed'}`);
		if (hasFx(k, 'cantRetreat')) no(`${pokeName(k)} can't retreat this turn`);
		const cost = Math.max(0, top(k).retreat - (p.flags.retreatLess || 0));
		if (k.energy.length < cost) no(`retreating costs ${cost} Energy`);
		const pay = Array.isArray(a.energy) && a.energy.length === cost && new Set(a.energy).size === cost && a.energy.every(i => i >= 0 && i < k.energy.length) ? a.energy : Array.from({ length: cost }, (_, i) => i);
		k.energy = k.energy.filter((_, i) => !pay.includes(i));
		clearOnLeaveActive(k); p.active[a.slot] = b; p.bench[a.bench] = k; p.flags.retreated = true;
		log(S, { k: 'switch', seat: p.seat, msg: `${p.name} retreats ${pokeName(k)} for ${pokeName(b)} (Active ${SLOT[a.slot]}), discarding ${cost} Energy.` });
	},
	// an empty Active slot may be filled from the Bench on your turn, freely (RULES.md "Empty Active slots")
	*promote(S, a) {
		const p = needTurn(S, a);
		if (!(a.slot === 0 || a.slot === 1) || p.active[a.slot]) no('that Active slot is not empty');
		const b = p.bench[a.bench]; if (!b) no('choose a Benched Pokémon');
		p.active[a.slot] = b; p.bench[a.bench] = null;
		log(S, { k: 'promote', seat: p.seat, msg: `${p.name} moves ${pokeName(b)} up to Active ${SLOT[a.slot]}.` });
	},
	*discardFossil(S, a) {
		const p = needTurn(S, a), k = ownAt(S, p, a.at); if (!top(k).fossil) no('only a fossil can be discarded from play');
		removeFromPlay(S, k); discardPoke(S, p, k);
		log(S, { k: 'discard', seat: p.seat, msg: `${p.name} discards ${pokeName(k)} from play.` });
		yield* settle(S, null, null);
	},
	*trainer(S, a) {
		const p = needTurn(S, a), id = p.hand[a.hand], c = card(id); if (!c || c.kind === 'pokemon') no('choose a Trainer card');
		if (c.fossil) no('play a fossil as a Basic Pokémon');
		const x = a.args || {}, f = c.fx;
		if (c.kind === 'supporter') {
			if (p.flags.supporter) no('you have already played a Supporter this turn');
			if (p.noSupporter > 0) no("you can't use Supporter cards this turn");
			if (opponents(S, p.seat).some(q => actives(q).some(k => passive(k, 'blockSupporters')))) no("an opposing Pokémon's Ability stops you using Supporter cards");
		}
		// everything is checked before anything changes
		let k = null, opp = null;
		const named = () => { const m = ownAt(S, p, x.at); if (f.names && !f.names.includes(pokeName(m))) no(`choose your ${f.names.join(' or ')}`); return m; };
		if (f.k === 'healOne') { k = ownAt(S, p, x.at); if (f.type && top(k).cardType !== f.type) no(`choose one of your ${f.type} Pokémon`); if (!k.dmg) no('that Pokémon has no damage'); }
		else if (f.k === 'flipAttach') { k = ownAt(S, p, x.at); if (top(k).cardType !== f.type) no(`choose one of your ${f.type} Pokémon`); }
		else if (f.k === 'returnActive') { k = named(); if (x.at.zone !== 'active') no('that Pokémon is not in an Active slot'); }
		else if (f.k === 'attachNamed') k = named();
		else if (f.k === 'gatherEnergy') { k = named(); if (x.at.zone !== 'active') no('that Pokémon is not in an Active slot'); }
		else if (f.k === 'driveOff') { k = oppAt(S, p, x.target, 'active'); if (!benched(S.players[x.target.seat]).length) no('that player has no Benched Pokémon'); }
		else if (f.k === 'revealHand' || f.k === 'redCard') { opp = S.players[x.opp]; if (!opp || opp.seat === p.seat || opp.eliminated) no('choose an opponent'); }
		else if (f.k === 'basicToHand' && p.hand.length - 1 >= LIMITS.maxHand) no('your hand is full');
		p.hand.splice(a.hand, 1); p.discard.push(id); if (c.kind === 'supporter') p.flags.supporter = true;
		log(S, { k: 'trainer', seat: p.seat, card: id, msg: `${p.name} plays ${c.name}.` });
		if (f.k === 'healOne') { const h = Math.min(f.n, k.dmg); k.dmg -= h; log(S, { k: 'heal', msg: `${pokeName(k)} heals ${h} damage.` }); }
		else if (f.k === 'flipAttach') { let h = 0; while (flip(S, p.seat, c.name)) h++; for (let i = 0; i < h; i++) attachFromZone(S, p, k, f.type, c.name); if (!h) log(S, { k: 'note', msg: 'No Energy is attached.' }); }
		else if (f.k === 'boost') (p.flags.boost = p.flags.boost || []).push({ n: f.n, names: f.names, from: c.name });
		else if (f.k === 'returnActive') { removeFromPlay(S, k); p.hand.push(...k.cards.filter(() => p.hand.length < 99)); log(S, { k: 'note', msg: `${pokeName(k)} returns to ${p.name}'s hand; its Energy is discarded.` }); yield* settle(S, null, null); }
		else if (f.k === 'attachNamed') attachFromZone(S, p, k, f.type, c.name);
		else if (f.k === 'gatherEnergy') { let n = 0; for (const b of benched(p)) { const keep = []; for (const e of b.energy) { if (e === f.type) { k.energy.push(e); n++; } else keep.push(e); } b.energy = keep; } log(S, { k: 'energy', msg: `${n} ${f.type} Energy moves to ${pokeName(k)}.` }); }
		else if (f.k === 'driveOff') yield* switchOut(S, x.target, c.name);
		else if (f.k === 'retreatLess') p.flags.retreatLess = (p.flags.retreatLess || 0) + f.n;
		else if (f.k === 'revealHand') log(S, { k: 'reveal', msg: `${opp.name} reveals their hand to ${p.name}.`, privateTo: p.seat, privateMsg: `${opp.name}'s hand: ${opp.hand.map(i => card(i).name).join(', ') || '(empty)'}.` });
		else if (f.k === 'peekTop') log(S, { k: 'reveal', msg: `${p.name} looks at the top ${f.n} card${f.n > 1 ? 's' : ''} of their deck.`, privateTo: p.seat, privateMsg: `Top of your deck: ${p.deck.slice(0, f.n).map(i => card(i).name).join(', ') || '(empty)'}.` });
		else if (f.k === 'basicToHand') { const idxs = p.deck.map((i, n) => (card(i).kind === 'pokemon' && card(i).stage === 0 ? n : -1)).filter(n => n >= 0); if (idxs.length) { const got = p.deck.splice(S.rand.pick(idxs), 1)[0]; p.hand.push(got); S.rand.shuffle(p.deck); log(S, { k: 'draw', msg: `${p.name} puts a Basic Pokémon into their hand.`, privateTo: p.seat, privateMsg: `You put ${card(got).name} into your hand.` }); } else log(S, { k: 'note', msg: 'There is no Basic Pokémon in the deck.' }); }
		else if (f.k === 'redCard') { opp.deck.push(...opp.hand); opp.hand = []; S.rand.shuffle(opp.deck); draw(S, opp, f.n); }
		else if (f.k === 'draw') draw(S, p, f.n);
	},
	*ability(S, a) {
		const p = needTurn(S, a), k = ownAt(S, p, a.at), ab = top(k).ability, x = a.args || {};
		if (!ab || ab.fx.passive) no('that Pokémon has no Ability to use');
		const f = ab.fx;
		if (k.abilityUsed === S.turn) no(`${ab.name} has already been used this turn`);
		if (f.active && a.at.zone !== 'active') no(`${pokeName(k)} must be in an Active slot`);
		let t = null;
		if (f.k === 'ping') t = oppAt(S, p, x.target, 'any');
		else if (f.k === 'coinSleep' || f.k === 'poisonActive') t = oppAt(S, p, x.target, 'active');
		else if (f.k === 'driveOff') { t = oppAt(S, p, x.target, 'active'); if (!benched(S.players[x.target.seat]).length) no('that player has no Benched Pokémon'); }
		else if (f.k === 'pullBenchBasic') { t = oppAt(S, p, x.target, 'active'); const b = S.players[x.target.seat].bench[x.bench]; if (!b || top(b).stage !== 0) no("choose one of that player's Benched Basic Pokémon"); }
		else if (f.k === 'attachZoneActiveType') { t = ownAt(S, p, x.at); if (x.at.zone !== 'active' || top(t).cardType !== f.type) no(`choose one of your ${f.type} Pokémon in an Active slot`); }
		else if (f.k === 'healAll' && !inPlay(p).some(m => m.dmg)) no('none of your Pokémon has damage');
		k.abilityUsed = S.turn;
		log(S, { k: 'ability', seat: p.seat, msg: `${p.name}'s ${pokeName(k)} uses ${ab.name}.` });
		const credit = new Map();
		if (f.k === 'healAll') { for (const m of inPlay(p)) { const h = Math.min(f.n, m.dmg); if (h) { m.dmg -= h; log(S, { k: 'heal', msg: `${pokeName(m)} heals ${h} damage.` }); } } }
		else if (f.k === 'ping') { t.dmg += f.n; credit.set(t.uid, p.seat); log(S, { k: 'damage', msg: `${ab.name} does ${f.n} damage to ${label(S, x.target)}.` }); }
		else if (f.k === 'attachZoneSelf') attachFromZone(S, p, k, f.type, ab.name);
		else if (f.k === 'attachZoneActiveType') attachFromZone(S, p, t, f.type, ab.name);
		else if (f.k === 'coinSleep') { if (flip(S, p.seat, ab.name)) setStatus(S, t, 'asleep', p.seat); }
		else if (f.k === 'poisonActive') setStatus(S, t, 'poisoned', p.seat);
		else if (f.k === 'driveOff') yield* switchOut(S, x.target, ab.name);
		else if (f.k === 'pullBenchBasic') { const q = S.players[x.target.seat], b = q.bench[x.bench]; clearOnLeaveActive(t); q.active[x.target.idx] = b; q.bench[x.bench] = t; log(S, { k: 'switch', msg: `${q.name}'s ${pokeName(b)} is pulled into Active ${SLOT[x.target.idx]}; ${pokeName(t)} goes to the Bench.` }); }
		else if (f.k === 'peekTop') log(S, { k: 'reveal', msg: `${p.name} looks at the top card of their deck.`, privateTo: p.seat, privateMsg: `Top of your deck: ${p.deck.slice(0, f.n).map(i => card(i).name).join(', ') || '(empty)'}.` });
		yield* settle(S, credit, p.seat);
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
			if (r.target) { const loc = locate(S, r.target), c = cmds[r.slot].target; if (!loc || loc.seat !== c.seat || loc.zone !== c.zone || loc.idx !== c.idx) { log(S, { k: 'fail', msg: `${tag}'s ${r.attack.name} fails: its target is no longer there.` }); continue; } }
			log(S, { k: 'attack', seat: p.seat, msg: `${tag}: ${p.name}'s ${pokeName(r.poke)} uses ${r.attack.name}${r.target ? ' on ' + label(S, cmds[r.slot].target) : ''}.` });
			const ctx = { seat: p.seat, poke: r.poke, attack: r.attack, target: r.target, args: r.args, credit: new Map(), slot: r.slot };
			yield* runAttack(S, ctx);
			yield* settle(S, ctx.credit, r.target ? cmds[r.slot].target.seat : null);
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
function drive(S, gen, sent) {
	const r = gen.next(sent);
	S.pending = r.done ? null : { ...r.value, gen };
}

export function apply(S, a) {
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
const pubPoke = k => (k ? { uid: k.uid, id: k.cards[k.cards.length - 1], cards: k.cards.slice(), dmg: k.dmg, hp: hpOf(k), energy: k.energy.slice(), status: Object.keys(k.status), fx: k.fx.map(f => ({ k: f.k, n: f.n })), turnPlayed: k.turnPlayed, turnEvolved: k.turnEvolved, abilityUsed: k.abilityUsed } : null);
/** What `seat` may see (null: a spectator). Hands and decks are never in it, except the seat's own hand. */
export function view(S, seat) {
	return {
		v: S.v, phase: S.phase, turn: S.turn, current: S.current, first: S.first, order: S.order.slice(), points: S.opts.points, over: S.over, you: seat,
		pending: S.pending ? { seat: S.pending.seat, kind: S.pending.kind, msg: S.pending.msg, slot: S.pending.slot, options: S.pending.seat === seat ? S.pending.options.slice() : null } : null,
		players: S.players.map(p => ({
			seat: p.seat, name: p.name, ai: p.ai, points: p.points, eliminated: p.eliminated, setup: p.setup, turns: p.turns, deck: p.deck.length, hand: p.seat === seat ? p.hand.slice() : null, handCount: p.hand.length,
			discard: p.discard.slice(), zone: { cur: p.zone.cur, next: p.zone.next }, energy: p.energy.slice(), active: p.active.map(pubPoke), bench: p.bench.map(pubPoke),
			flags: { attached: !!p.flags.attached, supporter: !!p.flags.supporter, retreated: !!p.flags.retreated, retreatLess: p.flags.retreatLess || 0, boost: (p.flags.boost || []).map(b => ({ n: b.n, names: b.names, from: b.from })) }, noSupporter: p.noSupporter > 0,
		})),
		// (`more`: what only this seat is told, e.g. the card it drew with Poké Ball; kept apart from the public line)
		log: S.log.map(e => ({ n: e.n, turn: e.turn, k: e.k, seat: e.seat ?? null, msg: e.msg, ...(e.privateTo != null && e.privateTo === seat ? { more: e.privateMsg } : {}) })),
	};
}
/** A short line for a friends list ("Turn 7 · 2–1–0"). */
export const labelOf = S => (S.over ? 'Match over' : S.phase === 'setup' ? 'Setting up' : `Turn ${S.turn} · ${S.players.map(p => p.points).join('–')}`);
/** A stable fingerprint of a position, for "did the replay end where the game did". */
export function digest(S) {
	const s = JSON.stringify([S.phase, S.turn, S.current, S.over, S.players.map(p => [p.points, p.eliminated, p.hand, p.deck, p.discard, p.zone, p.active.map(pubPoke), p.bench.map(pubPoke)])]);
	let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16);
}
