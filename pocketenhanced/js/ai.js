// ai.js — Pocket Enhanced's computer players.
//
// A computer player sees what a human in its seat sees: `view(state, seat)` (its own hand; nobody's deck; no one
// else's hand) and the card definitions. It plays through the same actions as a person and its attacks go through
// the same Execute. It is a set of plain rules, in the order a person would do things: fill the board, evolve,
// attach, play the Trainers that are plainly good now, use Abilities, then choose what both Active Pokémon do.
//
//   nextAction(view, banned) -> an action for view.you, or null when it is not this seat's move
// `banned`: actions the engine refused this turn (as JSON strings); the caller adds to it so a refused idea is not
// tried twice. The last resort is always legal: Execute with both Active Pokémon passing.
import { card, CARDS } from './data/cards.js';
import { effectiveness } from './engine/types.js';
import { baseCost, canPay, extraEnergy, lessCost, typeOf } from './engine/engine.js';

const defx = new Map();
/** A Pokémon's card. One holding Memory Light also has the attacks of the cards under it (the view lists them as `extra`). */
const def = k => {
	const c = card(k.id); if (!k.extra || !k.extra.length) return c;
	const key = k.id + '|' + k.extra.join(';'); if (!defx.has(key)) defx.set(key, { ...c, attacks: [...c.attacks, ...k.extra.map(([i, n]) => card(i).attacks[n])] });
	return defx.get(key);
};
const left = k => k.hp - k.dmg;
const coins = { coinsMul: f => f.per * f.coins / 2, coinsUntilTails: f => f.per, coinsAllBonus: f => f.bonus / 4, coinBonus: f => f.bonus / 2 };

/** What an attack should do to a target, on average, as this engine works it out. */
export function expectedDamage(v, me, poke, attack, target) {
	const meP = v.players[me];
	let base = attack.damage;
	for (const f of attack.fx) {
		if (f.k === 'coinsMul' || f.k === 'coinsUntilTails') base = coins[f.k](f);
		else if (coins[f.k]) base += coins[f.k](f);
		else if (f.k === 'coinNothing') base /= 2;
		else if (f.k === 'extraEnergyBonus') { if (extraEnergy(poke.provides || poke.energy, attack.cost, f.type) >= f.need) base += f.bonus; }
		else if (f.k === 'coinsPerEnergy') base = f.per * (poke.provides || poke.energy).filter(x => !f.type || x === f.type).length / 2;
		else if (f.k === 'perOwnBench') base += f.n * meP.bench.filter(Boolean).length;
		else if (f.k === 'perBenchNames') base += f.n * meP.bench.filter(b => b && f.names.includes(def(b).name)).length;
		else if (f.k === 'targetBasicBonus') { if (target && def(target).stage === 0) base += f.bonus; }
		else if (f.k === 'moreHpBonus') { if (target && left(target) > left(poke)) base += f.bonus; }
		else if (f.k === 'targetStatusBonus') { if (target && target.status.length) base += f.bonus; }
		else if (f.k === 'targetAbilityBonus') { if (target && def(target).ability) base += f.bonus; }
		else if (f.k === 'benchDamagedBonus') { if (meP.bench.some(b => b && b.dmg > 0)) base += f.bonus; }
		else if (f.k === 'snipePerEnergy') base = target ? f.n * target.energy.length : 0;
		else if (f.k === 'perOppBench') { const o = target && v.players.find(q => [...q.active, ...q.bench].some(k => k && k.uid === target.uid)); if (o) base += f.n * o.bench.filter(Boolean).length; }
		else if (f.k === 'revengeBonus') { if (meP.flags.revenge) base += f.bonus; }
		else if (f.k === 'perOwnPoint') base += f.n * (meP.points || 0);
		else if (f.k === 'targetExBonus') { if (target && def(target).ex) base += f.bonus; }
		else if (f.k === 'coinsBonusEach') base += f.bonus * f.coins / 2;
		else if (f.k === 'coinsUntilTailsBonus') base += f.bonus;
		else if (f.k === 'coinsPerPokemon') base = f.per * [...meP.active, ...meP.bench].filter(Boolean).length / 2;
		else if (f.k === 'targetTypeBonus') { if (target && def(target).cardType === f.type) base += f.bonus; }
		else if (f.k === 'selfToolBonus') { if (poke.tool) base += f.bonus; }
		else if (f.k === 'targetToolBonus') { if (target && target.tool) base += f.bonus; }
		else if (f.k === 'selfDamageBonus') base += poke.dmg;
		else if (f.k === 'allOppDamage') base = f.n;
		else if (f.k === 'halveTarget') { if (target) base = Math.ceil((target.hp - target.dmg) / 2); }
		else if (f.k === 'selfDamagedBonus') { if (poke.dmg > 0) base += f.bonus; }
		else if (f.k === 'targetDamagedBonus') { if (target && target.dmg > 0) base += f.bonus; }
		else if (f.k === 'targetPoisonedBonus') { if (target && target.status.includes('poisoned')) base += f.bonus; }
		else if (f.k === 'perTargetEnergy') { if (target) base += f.n * target.energy.length; }
		else if (f.k === 'perBench') base = f.n * meP.bench.filter(b => b && (!f.type || def(b).cardType === f.type)).length;
		else if (f.k === 'perBenchName') base += f.n * meP.bench.filter(b => b && def(b).name === f.name).length;
		else if (f.k === 'snipe') base = f.n;
		else if (f.k === 'randomHits') base = f.n * f.times / 3;
	}
	if (!target || base <= 0) return Math.max(0, base);
	let d = base + effectiveness(typeOf(v.rules || 1, attack), def(target).combatTypes).total;
	const ab = def(target).ability; if (ab && ab.fx.k === 'reduce') d -= ab.fx.n;
	for (const f of target.fx) if (f.k === 'reduce') d -= f.n; else if (f.k === 'prevent') d = 0;
	for (const f of poke.fx) if (f.k === 'atkMinus') d -= f.n;
	return Math.max(0, d);
}
const usable = (v, me, poke, a) => !(v.players[me].turns === 0 && me === v.first) && !def(poke).fossil && !poke.status.includes('asleep') && !poke.status.includes('paralyzed') && !poke.fx.some(f => f.k === 'cantAttack' || (f.k === 'cantUse' && f.name === a.name)) && canPay(poke.provides || poke.energy, lessCost(baseCost(poke, a, v.players[me].deck), poke.less || 0))
	&& a.fx.every(f => f.k !== 'needBench' || f.names.every(n => v.players[me].bench.some(b => b && def(b).name === n)));
function targetsOf(v, me, a) {
	const out = [];
	if (a.target === 'none') return out;
	for (const q of v.players) {
		if (q.seat === me || q.eliminated) continue;
		if (a.target !== 'oppBench') q.active.forEach((k, idx) => { if (k) out.push({ seat: q.seat, zone: 'active', idx }); });
		if (a.target !== 'oppActive') q.bench.forEach((k, idx) => { if (k) out.push({ seat: q.seat, zone: 'bench', idx }); });
	}
	return a.fx.some(f => f.k === 'snipe' && f.damaged) ? out.filter(l => at(v, l).dmg > 0) : out;   // (an attack that takes only a Pokémon with damage on it)
}
const at = (v, loc) => (loc.zone === 'active' ? v.players[loc.seat].active[loc.idx] : v.players[loc.seat].bench[loc.idx]);

/** The best command for one Active Pokémon, given damage already aimed (uid -> damage) by the other one. */
function bestCommand(v, me, slot, aimed, only) {   // (only: the uid of the one target to consider)
	const poke = v.players[me].active[slot]; if (!poke) return null;
	let best = null;
	def(poke).attacks.forEach((a, i) => {
		if (!usable(v, me, poke, a)) return;
		const consider = (target, loc) => {
			if (only != null && (!target || target.uid !== only)) return;
			const d = expectedDamage(v, me, poke, a, target), q = loc ? v.players[loc.seat] : null;
			let score = d;
			if (target) {
				const before = left(target) - (aimed.get(target.uid) || 0);
				if (before <= 0) score = -1;   // the other attack already takes it: a queued attack is not redirected, so do not waste this one
				else if (d >= before) { const pts = def(target).points; score += 400 * pts + (q.points >= v.points - 1 ? 150 : 0) + (v.players[me].points + pts >= v.points ? 5000 : 0); }
				else score += d * 0.2 + (q.points > v.players[me].points ? 10 : 0);   // lean on whoever is ahead
			}
			if (a.fx.some(f => f.k === 'status' || f.k === 'targetCantAttack' || f.k === 'discardTargetEnergy')) score += 15;
			if (a.fx.some(f => f.k === 'selfDamage')) score -= 10;
			if (a.target === 'none') score = a.fx.some(f => f.k === 'attachZone' || f.k === 'coinsAttachBench' || f.k === 'benchFromDeck' || f.k === 'typeToHand' || f.k === 'draw' || f.k === 'attachZoneTypes') ? 25 : 5;
			const args = {};
			const myBench = v.players[me].bench.map((b, n) => (b ? n : -1)).filter(n => n >= 0);
			if (a.fx.some(f => f.k === 'ownBenchDamage')) { if (!myBench.length) score += 0; else args.bench = myBench.slice().sort((x, y) => left(v.players[me].bench[y]) - left(v.players[me].bench[x]))[0]; }
			if (a.fx.some(f => f.k === 'alsoBench')) { const b = v.players.filter(q => q.seat !== me && !q.eliminated).flatMap(q => q.bench.map((k, idx) => k && { k, loc: { seat: q.seat, zone: 'bench', idx } }).filter(Boolean)).sort((x, y) => left(x.k) - left(y.k))[0]; if (b) args.also = b.loc; }
			if (a.fx.some(f => f.k === 'selfCantAttack' || f.k === 'selfCantUse')) score -= 5;
			if (a.fx.some(f => f.k === 'switchSelf' && f.may)) { if (myBench.length && poke.dmg > poke.hp / 2) args.bench = myBench[0]; }   // "you may switch": it leaves once it is badly hurt
			else if (a.fx.some(f => f.k === 'switchSelf')) { if (!myBench.length) return; args.bench = myBench[0]; score = poke.dmg > poke.hp / 2 ? 30 : 1; }
			if (a.fx.some(f => f.k === 'discardToolsBonus')) { const f = a.fx.find(g => g.k === 'discardToolsBonus'); args.tools = v.players[me].hand.map((id, n) => (card(id).kind === 'tool' ? n : -1)).filter(n => n >= 0).slice(0, f.max); if (!args.tools.length) return; }
			if (a.fx.some(f => f.k === 'discardHandCost' && v.players[me].hand.length < f.n)) return;   // (it would do nothing)
			if (a.fx.some(f => f.k === 'healBench')) { const hb = myBench.filter(n => v.players[me].bench[n].dmg > 0).sort((x, y) => v.players[me].bench[y].dmg - v.players[me].bench[x].dmg)[0]; if (hb == null) return; args.bench = hb; score = 20; }
			if (a.fx.some(f => f.k === 'copyAttack')) {
				let c = null; const cf = a.fx.find(f => f.k === 'copyAttack');
				for (const q2 of v.players) if ((cf.own ? q2.seat === me : q2.seat !== me) && !q2.eliminated) for (const z of (cf.own ? ['bench'] : cf.active ? ['active'] : ['active', 'bench'])) q2[z].forEach((k, idx) => { if (k && !(cf.own && def(k).ex)) def(k).attacks.forEach((ca, n) => { if (ca.fx.some(f => f.k === 'copyAttack') || (!cf.free && !canPay(poke.provides || poke.energy, ca.cost))) return; const dd = expectedDamage(v, me, poke, ca, target); if (!c || dd > c.d) c = { d: dd, from: { seat: q2.seat, zone: z, idx }, attack: n }; }); });
				if (!c) return; args.from = c.from; args.attack = c.attack; score = c.d;
			}
			if (!best || score > best.score) best = { score, cmd: { attack: i, target: loc || null, args }, target, d };
		};
		if (a.target === 'none') consider(null, null); else for (const loc of targetsOf(v, me, a)) consider(at(v, loc), loc);
	});
	return best && best.score > 0 ? best : null;
}
export function planExecute(v, me) {
	const aimed = new Map(), cmds = [null, null];
	for (const slot of [0, 1]) { const b = bestCommand(v, me, slot, aimed); if (b) { cmds[slot] = b.cmd; if (b.target) aimed.set(b.target.uid, (aimed.get(b.target.uid) || 0) + b.d); } }
	return { t: 'execute', seat: me, commands: cmds };
}

/** How much this Pokémon wants the Energy that is ready (higher is hungrier). */
function hunger(v, me, k, loc, e) {
	const d = def(k); if (d.fossil || !d.attacks.length) return -1;
	let need = 0;
	for (const a of d.attacks) { if (canPay(k.provides || k.energy, a.cost)) continue; const typed = a.cost.filter(c => c !== 'Colorless'); const fits = typed.includes(e) || a.cost.length > k.energy.length; if (fits) need = Math.max(need, 10 + a.damage / 10 - (a.cost.length - k.energy.length)); }
	if (!need) need = 1;
	return need + (loc.zone === 'active' ? 6 : 0) + left(k) / 100;
}

export function nextAction(v, banned = new Set()) {
	const me = v.you, P = v.players[me];
	if (v.over || me == null || !P || P.eliminated) return null;
	const ok = a => (banned.has(JSON.stringify(a)) ? null : a);
	const try1 = list => { for (const a of list) if (a && ok(a)) return a; return null; };
	// ---- the opening: the two sturdiest Basics in front, the rest on the Bench ----
	if (v.phase === 'setup') {
		if (P.setup) return null;
		const basics = P.hand.map((id, i) => ({ i, c: card(id) })).filter(x => x.c.kind === 'pokemon' ? x.c.stage === 0 : x.c.fossil).sort((a, b) => (a.c.fossil ? 1 : 0) - (b.c.fossil ? 1 : 0) || b.c.hp - a.c.hp);
		const na = P.active.length, nb = P.bench.length;   // (two and four; one and three in singles)
		return { t: 'setup', seat: me, active: basics.slice(0, na).map(x => x.i), bench: basics.slice(na, na + nb).map(x => x.i) };
	}
	// ---- a choice the game is waiting on: the healthiest Benched Pokémon comes up ----
	if (v.pending) {
		if (v.pending.seat !== me) return null;
		if (v.pending.kind === 'handPick') return { t: 'choose', seat: me, pick: v.pending.options[0] };
		if (v.pending.kind === 'confirm' && v.pending.flips) return { t: 'choose', seat: me, pick: v.pending.flips.filter(Boolean).length * 2 < v.pending.flips.length ? 1 : 0 };   // (Victory Star: flip again when most came up tails)
		if (v.pending.kind === 'confirm') return { t: 'choose', seat: me, pick: (v.pending.cards || []).length ? 0 : 1 };   // (a shown card: leave the deck as it is; a plain offer, such as drawing cards: take it)
		if (v.pending.kind === 'pickTarget') {   // the one closest to a Knock Out, a Pokémon ex first among equals
			const locs = v.pending.locs || [], k = l => v.players[l.seat].active[l.idx];
			const best = locs.map((l, i) => ({ i, k: k(l) })).filter(x => x.k).sort((x, y) => left(x.k) - left(y.k) || def(y.k).points - def(x.k).points)[0];
			return { t: 'choose', seat: me, pick: best ? best.i : v.pending.options[0] };
		}
		const opts = v.pending.options.slice().sort((a, b) => left(P.bench[b] || { hp: 0, dmg: 0 }) - left(P.bench[a] || { hp: 0, dmg: 0 }));
		return { t: 'choose', seat: me, pick: opts[0] };
	}
	if (v.phase !== 'main' || v.current !== me) return null;
	const mineAll = [...P.active.map((k, idx) => k && { k, loc: { seat: me, zone: 'active', idx } }), ...P.bench.map((k, idx) => k && { k, loc: { seat: me, zone: 'bench', idx } })].filter(Boolean);
	const opp = v.players.filter(q => q.seat !== me && !q.eliminated);
	const tries = [];
	// 1. an empty Active slot: move a Benched Pokémon up when there is one to spare (keep one back if we can)
	for (const slot of P.active.keys()) if (!P.active[slot]) { const b = P.bench.map((k, n) => (k ? n : -1)).filter(n => n >= 0).sort((x, y) => left(P.bench[y]) - left(P.bench[x])); if (b.length) tries.push({ t: 'promote', seat: me, slot, bench: b[0] }); }
	// 2. Basic Pokémon from the hand
	P.hand.forEach((id, i) => { const c = card(id); if (c.kind === 'pokemon' ? c.stage === 0 : c.fossil) { const slot = P.active.indexOf(null); if (slot >= 0) tries.push({ t: 'playBasic', seat: me, hand: i, to: { zone: 'active', idx: slot } }); else if (P.bench.indexOf(null) >= 0) tries.push({ t: 'playBasic', seat: me, hand: i, to: { zone: 'bench', idx: P.bench.indexOf(null) } }); } });
	// 3. evolutions
	P.hand.forEach((id, i) => { const c = card(id); if (c.kind === 'pokemon' && c.stage > 0) for (const m of mineAll) { const ab = def(m.k).ability; if (m.k.turnEvolved === v.turn || ((P.turns === 0 || m.k.turnPlayed === v.turn) && !(ab && ab.fx.k === 'fastEvolve' && m.loc.zone === 'active'))) continue;   // (it may not evolve yet: do not propose what the rules refuse)
		if (def(m.k).name === c.evolvesFrom || (ab && ab.fx.k === 'evolveAs' && ab.fx.name === c.evolvesFrom)) tries.push({ t: 'evolve', seat: me, hand: i, at: m.loc }); } });
	// (what several plays below ask: the most one of my Active Pokémon can do to a target now; a card in hand with no use yet;
	//  an Energy that, moved onto an Active Pokémon, lets it use an attack it cannot pay for)
	const bestHit = target => Math.max(0, ...P.active.filter(Boolean).flatMap(k => def(k).attacks.filter(a => usable(v, me, k, a)).map(a => expectedDamage(v, me, k, a, target))));
	const inHand = n => P.hand.some(h => card(h).name === n), inPlayName = n => mineAll.some(m => def(m.k).name === n);
	const deadCard = skip => P.hand.findIndex((h, n) => { const c = card(h); return n !== skip && c.kind === 'pokemon' && c.stage > 0 && !inPlayName(c.evolvesFrom) && !inHand(c.evolvesFrom); });
	const unlocks = (k, e) => def(k).attacks.some(a => !canPay(k.provides || k.energy, a.cost) && canPay([...(k.provides || k.energy), e], a.cost));
	// 4. Trainers that are plainly good now
	[...P.hand.map((id, i) => [id, i, false]), ...(P.flags.penny ? [[P.flags.penny, -1, true]] : [])].forEach(([id, i, pen]) => {   // (pen: the effect Penny found, used as hers)
		const c = card(id); if (c.kind === 'pokemon' || c.fossil) return;
		if (c.kind === 'supporter' && P.flags.supporter && !pen) return;
		const f = c.fx, T = args => tries.push(pen ? { t: 'trainer', seat: me, penny: true, args } : { t: 'trainer', seat: me, hand: i, args });
		const hurt = mineAll.filter(m => m.k.dmg >= 20 && (!f.type || def(m.k).cardType === f.type)).sort((a, b) => b.k.dmg - a.k.dmg)[0];
		if (f.k === 'draw' || f.k === 'basicToHand' || f.k === 'slab' || f.k === 'guard' || f.k === 'namedToHand' || f.k === 'prankSpinner' || f.k === 'may' || f.k === 'smallBasicsToHand' || f.k === 'namesToHand' || f.k === 'megaToHand') T({});
		else if (f.k === 'coinAttachBenchType') { const bi = P.bench.findIndex(b => b && def(b).cardType === f.type); if (bi >= 0) T({ bench: bi }); }
		else if (f.k === 'stadiumToHand' || f.k === 'stageToHand' || f.k === 'coinItem' || f.k === 'coinsNamedToHand' || f.k === 'topPick') T({});
		else if (f.k === 'moveAllToNamed') { const bi = P.bench.findIndex(b => b && def(b).cardType === f.type && b.energy.includes(f.type)); if (bi >= 0 && P.active.some(k => k && def(k).name === f.name)) T({ bench: bi }); }
		else if (f.k === 'healFlips') { if (hurt) T({ at: hurt.loc }); }
		else if (f.k === 'healForRandomEnergy') { const t = mineAll.filter(x => x.k.dmg >= f.n && x.k.energy.length > 2).sort((x, y) => y.k.dmg - x.k.dmg)[0]; if (t) T({ at: t.loc }); }
		else if (f.k === 'cureActive') { const sl = [0, 1].find(i => P.active[i] && P.active[i].status.length); if (sl != null) T({ slot: sl }); }
		else if (f.k === 'attachZoneNamedN') { const t = mineAll.find(x => f.names.includes(def(x.k).name)); if (t) T({ at: t.loc }); }
		else if (f.k === 'thievingMachine') { const q = opp.find(o => (o.discard || []).some(i => card(i).kind === 'item' && card(i).name !== f.except)); if (q) T({ opp: q.seat }); }
		else if (f.k === 'masterPlan') { const t = opp.flatMap(o => o.active.map((k, idx) => k && { k, loc: { seat: o.seat, zone: 'active', idx } }).filter(Boolean)).find(x => !x.k.status.includes(f.s)); if (t) T({ target: t.loc }); }
		else if (f.k === 'extraRandomHit') { if (P.active.some(k => k && def(k).attacks.some(q => q.name === f.attack && usable(v, me, k, q)))) T({}); }
		else if (f.k === 'attachZoneStage') { const t = mineAll.filter(x => def(x.k).stage === f.stage).sort((x, y) => (y.loc.zone === 'active') - (x.loc.zone === 'active'))[0]; if (t) T({ at: t.loc }); }
		else if (f.k === 'returnTools') { const tools = o => [...o.active, ...o.bench].filter(k => k && k.tool).length; if (opp.reduce((n, o) => n + tools(o), 0) > tools(P)) T({}); }
		else if (f.k === 'attachDiscardAncient') { if ((P.energyDiscard || []).length && mineAll.some(x => def(x.k).ancient)) T({}); }
		else if (f.k === 'fieldBlower') { const t = opp.flatMap(o => [...o.active.map((k, idx) => k && { k, loc: { seat: o.seat, zone: 'active', idx } }), ...o.bench.map((k, idx) => k && { k, loc: { seat: o.seat, zone: 'bench', idx } })]).filter(x => x && x.k.tool)[0]; if (t) T({ target: t.loc }); else if (v.stadium && v.stadium.seat !== me) T({ stadium: true }); }
		else if (f.k === 'oppDiscardTo') { const q = opp.slice().sort((x, y) => y.handCount - x.handCount)[0]; if (q && q.handCount >= f.n + 2) T({ opp: q.seat }); }
		else if (f.k === 'drawPerMega') { if ([P, ...opp].some(o => [...o.active, ...o.bench].some(k => k && def(k).ex && /^Mega /.test(def(k).name)))) T({}); }
		else if (f.k === 'koBonusPoint') { if (P.active.some(k => k && f.names.includes(def(k).name) && k.energy.length >= 2)) T({}); }
		else if (f.k === 'discardAbilityEnergy') { const q = opp.find(o => [...o.active, ...o.bench].some(k => k && def(k).ability && k.energy.length)); if (q) T({ opp: q.seat }); }
		else if (f.k === 'coinItemOrTool') T({});
		else if (c.kind === 'stadium') { if (!v.stadium || (v.stadium.seat !== me && card(v.stadium.id).name !== c.name)) T({}); }   // a Stadium of its own, unless its own is already up
		else if (f.k === 'healActiveReturn') { const t = mineAll.filter(x => x.loc.zone === 'active' && x.k.dmg >= f.n).sort((x, y) => y.k.dmg - x.k.dmg)[0]; if (t) T({ at: t.loc }); }
		else if (f.k === 'healForEnergy') { const t = mineAll.filter(x => def(x.k).cardType === f.type && x.k.dmg >= 40 && x.k.energy.filter(e2 => e2 === f.type).length >= f.need + 1).sort((x, y) => y.k.dmg - x.k.dmg)[0]; if (t) T({ at: t.loc }); }
		else if (f.k === 'juggler') { const t = mineAll.find(x => x.loc.zone === 'active' && !def(x.k).attacks.some(q => usable(v, me, x.k, q))); if (t && P.bench.some(b => b && b.energy.length) && new Set(mineAll.flatMap(x => x.k.energy)).size >= f.need) T({ at: t.loc }); }
		else if (f.k === 'discardOppRandomEnergy') { const t = opp.flatMap(o => o.active.map((k, idx) => k && { k, loc: { seat: o.seat, zone: 'active', idx } }).filter(Boolean)).filter(x => x.k.energy.length).sort((x, y) => y.k.energy.length - x.k.energy.length)[0]; if (t && mineAll.some(x => f.need.includes(def(x.k).name))) T({ target: t.loc }); }
		else if (f.k === 'evolveFromDeckType') { const t = mineAll.find(x => def(x.k).cardType === f.type && (f.maxHp ? x.k.hp <= f.maxHp : x.k.turnPlayed !== v.turn) && CARDS.some(d => d.evolvesFrom === def(x.k).name && d.cardType === f.type)); if (t && (f.maxHp || P.turns > 0)) T({ at: t.loc }); }
		else if (f.k === 'guardEndure' || f.k === 'attachZoneEachNamed') { if (mineAll.some(x => f.names.includes(def(x.k).name))) T({}); }
		else if (f.k === 'coinsDiscardEnergy') { const t = opp.flatMap(o => o.active.map((k, idx) => k && { k, loc: { seat: o.seat, zone: 'active', idx } }).filter(Boolean)).filter(x => x.k.energy.length).sort((x, y) => y.k.energy.length - x.k.energy.length)[0]; if (t) T({ target: t.loc }); }
		else if (f.k === 'attachDiscardActive') { const t = mineAll.find(x => x.loc.zone === 'active' && def(x.k).cardType === f.type); if (t && (P.energyDiscard || []).includes(f.type)) T({ at: t.loc }); }
		else if (f.k === 'copycat') { const q = opp.slice().sort((x, y) => y.handCount - x.handCount)[0]; if (q && q.handCount > P.hand.length) T({ opp: q.seat }); }
		else if (f.k === 'healOne' && f.names) { const t = mineAll.filter(x => f.names.includes(def(x.k).name) && x.k.dmg >= 30).sort((x, y) => y.k.dmg - x.k.dmg)[0]; if (t) T({ at: t.loc }); }
		else if (c.kind === 'tool') { const m = mineAll.filter(x => (!x.k.tool || (!x.k.tool2 && def(x.k).ability && def(x.k).ability.fx.k === 'dualTools')) && !def(x.k).fossil).sort((a, b) => (b.loc.zone === 'active') - (a.loc.zone === 'active') || def(b.k).hp - def(a.k).hp)[0]; if (m) T({ at: m.loc }); }
		else if (f.k === 'attachDiscard' && f.ub) { const m = mineAll.filter(x => def(x.k).ub).sort((a, b) => (b.loc.zone === 'active') - (a.loc.zone === 'active'))[0]; if (m && (P.energyDiscard || []).length && opp.some(o => o.points > 0)) T({ at: m.loc }); }
		else if (f.k === 'revealSupporters' || f.k === 'penny') { if (opp.length) T({ opp: opp[0].seat }); }
		else if (f.k === 'will') { if (P.active.some(k => k && def(k).attacks.some(q => usable(v, me, k, q) && q.fx.some(g => /^coin/.test(g.k))))) T({}); }   // a coin attack is about to be used
		else if (f.k === 'coinsFromDiscard') { if (P.discard.some(d => card(d).kind === 'pokemon' && card(d).cardType === f.type)) T({}); }
		else if (f.k === 'peekOrder') { if (mineAll.some(x => def(x.k).cardType === f.type)) T(f.opp ? { opp: opp[0].seat } : {}); }
		else if (f.k === 'topTools') T({});
		else if (f.k === 'healNamedCure') { const t = mineAll.filter(x => f.names.includes(def(x.k).name) && x.k.dmg >= 20).sort((x, y) => y.k.dmg - x.k.dmg)[0]; if (t) T({ at: t.loc }); }
		else if (f.k === 'silver') { const q = opp.slice().sort((x, y) => y.handCount - x.handCount)[0]; if (q && q.handCount >= 3) T({ opp: q.seat }); }
		else if (f.k === 'discardOppEnergy') { const t = opp.flatMap(o => o.active.map((k, idx) => k && { k, loc: { seat: o.seat, zone: 'active', idx } }).filter(Boolean)).filter(x => x.k.energy.includes(f.type)).sort((x, y) => x.k.energy.length - y.k.energy.length)[0]; if (t) T({ target: t.loc }); }
		else if (f.k === 'moveEnergyTypes') { for (const to of mineAll.filter(x => x.loc.zone === 'active')) for (const t of f.types) { const from = P.bench.findIndex(b => b && b.energy.includes(t)); if (from >= 0 && unlocks(to.k, t)) { T({ bench: from, type: t, at: to.loc }); return; } } }
		else if (f.k === 'switchDamaged') { const out = mineAll.filter(x => x.loc.zone === 'active' && x.k.dmg > 0 && left(x.k) <= x.k.hp / 2 && !def(x.k).attacks.some(q => usable(v, me, x.k, q)))[0], inn = P.bench.findIndex(b => b && def(b).attacks.some(q => canPay(b.provides || b.energy, lessCost(q.cost, b.less || 0)))); if (out && inn >= 0) T({ at: out.loc, bench: inn }); }
		// (the same step back, by the cards that ask for a Stage or for a spread of types)
		else if (f.k === 'switchActiveStage' || f.k === 'switchIfTypes') {
			const out = mineAll.filter(x => x.loc.zone === 'active' && (f.k !== 'switchActiveStage' || def(x.k).stage === f.stage) && x.k.dmg > 0 && left(x.k) <= x.k.hp / 2 && !def(x.k).attacks.some(q => usable(v, me, x.k, q)))[0], inn = P.bench.findIndex(b => b && def(b).attacks.some(q => canPay(b.provides || b.energy, lessCost(q.cost, b.less || 0))));
			if (out && inn >= 0 && (f.k !== 'switchIfTypes' || new Set(mineAll.map(m => def(m.k).cardType)).size >= f.need)) T({ slot: out.loc.idx, bench: inn });
		}
		// a badly hurt Pokémon goes back to the hand (its points are not given up), when another can take its place
		else if (f.k === 'returnActive') { const t = mineAll.filter(x => x.loc.zone === 'active' && f.names.includes(def(x.k).name) && x.k.dmg > 0 && left(x.k) <= x.k.hp * 0.4)[0]; if (t && P.bench.some(Boolean)) T({ at: t.loc }); }
		else if (f.k === 'returnDamaged' || f.k === 'returnTyped') { const t = mineAll.filter(x => def(x.k).cardType === f.type && !(f.k === 'returnTyped' && def(x.k).ex) && x.k.dmg > 0 && left(x.k) <= x.k.hp * 0.4 && (x.loc.zone === 'bench' || P.bench.some(Boolean))).sort((a, b) => left(a.k) - left(b.k))[0]; if (t) T({ at: t.loc }); }
		// X Speed, Leaf: when a hurt Active Pokémon wants to step back (7, below) and is short of Energy by no more than the card gives
		else if (f.k === 'retreatLess') {
			if (!P.flags.retreated && [0, 1].some(slot => { const k = P.active[slot]; if (!k || def(k).fossil || left(k) > k.hp * 0.35) return false; const cost = Math.max(0, (k.retreat ?? def(k).retreat) - P.flags.retreatLess), have = (k.provides || k.energy).length; return have < cost && have >= cost - f.n && P.bench.some(b => b && left(b) > left(k) && def(b).attacks.some(a => canPay(b.provides || b.energy, a.cost))); })) T({});
		}
		// Goo-zooka: on the opponent nearest to winning, whose Active Pokémon then cost more to pull back
		else if (f.k === 'gooRetreat') { const q = opp.slice().sort((a, b) => b.points - a.points)[0]; if (q && q.active.some(k => k && k.dmg > 0)) T({ opp: q.seat }); }
		else if (f.k === 'chooseOne') { const evo = mineAll.filter(x => def(x.k).evolvesFrom === f.from); if (evo.some(x => x.k.dmg >= f.heal)) T({ pick: 1 }); else if (evo.some(x => x.loc.zone === 'active' && def(x.k).attacks.some(q => q.damage > 0 && usable(v, me, x.k, q)))) T({ pick: 0 }); }
		else if (f.k === 'attachDiscard') { const m = mineAll.find(x => f.names.includes(def(x.k).name)); if (m && (P.energyDiscard || []).includes(f.type)) T({ at: m.loc }); }
		else if (f.k === 'healCureActive') { const m = mineAll.filter(x => x.loc.zone === 'active' && (x.k.status.length || x.k.dmg >= f.n)).sort((a, b) => b.k.status.length - a.k.status.length)[0]; if (m) T({ at: m.loc }); }
		else if (f.k === 'peekShuffle') T({});
		else if (f.k === 'discardTools') { if (opp.some(o => [...o.active, ...o.bench].some(k => k && k.tool))) T({}); }
		else if (f.k === 'healAllNamed') { const m = mineAll.filter(x => f.names.includes(def(x.k).name) && x.k.dmg >= 60).sort((a, b) => b.k.dmg - a.k.dmg)[0]; if (m) T({ at: m.loc }); }
		else if (f.k === 'moveDamage') { const m = mineAll.filter(x => f.names.includes(def(x.k).name) && x.k.dmg > 0).sort((a, b) => b.k.dmg - a.k.dmg)[0], t = opp.flatMap(o => o.active.map((k, idx) => k && { k, loc: { seat: o.seat, zone: 'active', idx } }).filter(Boolean)).sort((a, b) => left(a.k) - left(b.k))[0]; if (m && t) T({ at: m.loc, target: t.loc }); }
		else if (f.k === 'rareCandy') {   // straight to Stage 2 when the card is in hand
			for (const m of mineAll) { if (m.k.cards.length !== 1 || def(m.k).stage !== 0 || m.k.turnPlayed === v.turn) continue; const pick = P.hand.findIndex((h, n) => { const c2 = card(h); return n !== i && c2.kind === 'pokemon' && c2.stage === 2 && CARDS.some(x => x.name === c2.evolvesFrom && x.evolvesFrom === def(m.k).name); }); if (pick >= 0) { T({ at: m.loc, pick }); break; } }
		}
		else if (f.k === 'healWithEnergy') { if (mineAll.some(x => x.k.dmg >= 20 && x.k.energy.includes(f.type))) T({}); }   // Irida
		else if (f.k === 'basicFromDiscard') { if (P.discard.some(x => card(x).kind === 'pokemon' && card(x).stage === 0 && (!f.type || card(x).cardType === f.type))) T({}); }   // Celestic Town Elder
		else if (f.k === 'costLess') { if (P.active.some(k => k && f.names.includes(def(k).name) && def(k).attacks.some(a => !usable(v, me, k, a) && canPay(k.provides || k.energy, lessCost(a.cost, (k.less || 0) + f.n))))) T({}); }   // Barry: only when it lets one of them attack
		else if (f.k === 'pullDamaged') {   // Cyrus: bring up a damaged Benched Pokémon that an attack of mine can finish
			if (f.need && !mineAll.some(x => f.need.includes(def(x.k).name))) return;
			const prey = opp.flatMap(o => o.bench.map((k, idx) => k && (f.any || k.dmg > 0) && { o, k, idx }).filter(Boolean)).filter(x => bestHit(x.k) >= left(x.k)).sort((a, b) => def(b.k).points - def(a.k).points || left(a.k) - left(b.k))[0];
			if (prey) { const out = prey.o.active.map((k, idx) => k && { k, idx }).filter(Boolean).sort((a, b) => left(b.k) - left(a.k))[0]; if (out) T({ target: { seat: prey.o.seat, zone: 'active', idx: out.idx }, bench: prey.idx }); }
		}
		else if (f.k === 'moveEnergyAny') {   // Dawn: one Energy from the Bench that lets an Active Pokémon attack
			for (const m of mineAll.filter(x => x.loc.zone === 'active')) { const src = P.bench.map((b, n) => b && { b, n, e: b.energy.findIndex(e => unlocks(m.k, e)) }).filter(x => x && x.e >= 0)[0]; if (src) { T({ bench: src.n, at: m.loc, energy: src.e }); break; } }
		}
		else if (f.k === 'swapPokemon') { const d = deadCard(i); if (d >= 0) T({ pick: d }); }   // Pokémon Communication: trade away a Pokémon with nothing to evolve from
		else if (f.k === 'fluteBench') {   // Pokémon Flute: hand an opponent a weak Basic when one of my attacks reaches their Bench
			const reach = P.active.some(k => k && def(k).attacks.some(a => usable(v, me, k, a) && a.fx.some(g => g.k === 'snipe' || g.k === 'alsoBench' || g.k === 'benchSplash' || g.k === 'allOppDamage')));
			if (reach) for (const o of opp) { if (!o.bench.includes(null)) continue; const pick = o.discard.findIndex(x => { const c = card(x); return c.kind === 'pokemon' && c.stage === 0 && c.hp <= 60; }); if (pick >= 0) { T({ opp: o.seat, pick }); break; } }
		}
		else if (f.k === 'mars') { const q = opp.slice().sort((a, b) => b.handCount - a.handCount)[0]; if (q && q.handCount >= 5) T({ opp: q.seat }); }
		else if (f.k === 'healOne' && hurt && hurt.k.dmg >= Math.min(f.n, 30)) T({ at: hurt.loc });
		else if (f.k === 'iono') { if (P.hand.length <= 2 && opp.some(o => o.handCount >= 4)) T({}); }   // a thin hand of mine for a full one of theirs
		else if (f.k === 'flipDiscardEnergy') { const q = opp.flatMap(o => o.active.map((k, idx) => k && { k, loc: { seat: o.seat, zone: 'active', idx } }).filter(Boolean)).sort((a, b) => b.k.energy.length - a.k.energy.length)[0]; if (q && q.k.energy.length >= 2) T({ target: q.loc }); }
		else if (f.k === 'flipAttach') { const m = mineAll.filter(x => def(x.k).cardType === f.type).sort((a, b) => (b.loc.zone === 'active') - (a.loc.zone === 'active') || def(b.k).hp - def(a.k).hp)[0]; if (m) T({ at: m.loc }); }
		else if (f.k === 'attachNamed') { const m = mineAll.find(x => f.names.includes(def(x.k).name)); if (m && (!f.endsTurn || !planExecute(v, me).commands.some(Boolean))) T({ at: m.loc }); }
		else if (f.k === 'boost') { if ((!f.ex || opp.some(o => o.active.some(k => k && def(k).ex))) && P.active.some(k => k && (!f.names || f.names.includes(def(k).name)) && def(k).attacks.some(a => a.damage > 0 && usable(v, me, k, a)))) T({}); }
		else if (f.k === 'gatherEnergy') { const m = mineAll.find(x => x.loc.zone === 'active' && f.names.includes(def(x.k).name)); if (m && P.bench.some(b => b && b.energy.includes(f.type))) T({ at: m.loc }); }
		else if (f.k === 'redCard') { const q = opp.slice().sort((a, b) => b.handCount - a.handCount)[0]; if (q && q.handCount >= 5) T({ opp: q.seat }); }
		else if (f.k === 'driveOff') { const q = opp.filter(o => o.bench.some(Boolean)).flatMap(o => o.active.map((k, idx) => k && { k, loc: { seat: o.seat, zone: 'active', idx } }).filter(Boolean)).filter(x => !f.basic || def(x.k).stage === 0).sort((a, b) => b.k.energy.length - a.k.energy.length)[0]; if (q && q.k.energy.length >= 2) T({ target: q.loc }); }
	});
	// 5. this turn's Energy
	if (!P.flags.attached && P.zone.cur) { const m = mineAll.map(x => ({ ...x, h: hunger(v, me, x.k, x.loc, P.zone.cur) })).filter(x => x.h >= 0).sort((a, b) => b.h - a.h); for (const x of m.slice(0, 3)) tries.push({ t: 'attach', seat: me, at: x.loc }); }
	// (the Stadium's own action, once a turn: Mesagoza)
	if (v.stadium && ['stadiumCoinPokemon', 'stadiumBasicToHand', 'stadiumCoinsDraw', 'stadiumCoinDraw'].includes(card(v.stadium.id).fx.k) && !P.flags.stadiumUsed && P.hand.length < 10) tries.push({ t: 'stadium', seat: me });
	// 6. Abilities
	for (const m of mineAll) {
		const ab = def(m.k).ability; if (!ab || ab.fx.passive || m.k.abilityUsed === v.turn) continue;
		const f = ab.fx, A = args => tries.push({ t: 'ability', seat: me, at: m.loc, args });
		const foes = opp.flatMap(o => [...o.active.map((k, idx) => k && { k, loc: { seat: o.seat, zone: 'active', idx } }), ...o.bench.map((k, idx) => k && { k, loc: { seat: o.seat, zone: 'bench', idx } })].filter(Boolean));
		const fa = foes.filter(x => x.loc.zone === 'active');
		if (f.k === 'healAll') { if (mineAll.some(x => x.k.dmg >= 20 && (!f.type || def(x.k).cardType === f.type))) A({}); }
		else if (f.k === 'ping') { const t = (f.zone === 'active' ? fa : foes).slice().sort((a, b) => left(a.k) - left(b.k))[0]; if (t && (!f.need || mineAll.some(x => f.need.includes(def(x.k).name)))) A({ target: t.loc }); }
		else if (f.k === 'attachZoneAnyType') { const t = mineAll.filter(x => def(x.k).cardType === f.type).map(x => ({ ...x, h: hunger(v, me, x.k, x.loc, f.type) })).sort((a, b) => b.h - a.h)[0]; if (t) A({ at: t.loc }); }
		else if (f.k === 'peekAny') A({ seat: me });
		else if (f.k === 'attachZoneSelf') { if (!f.endsTurn || !planExecute(v, me).commands.some(Boolean)) A({}); }
		else if (f.k === 'attachZoneActiveType') { const t = mineAll.find(x => x.loc.zone === 'active' && def(x.k).cardType === f.type); if (t) A({ at: t.loc }); }
		else if (f.k === 'moveEnergy') {   // Vaporeon: Water Energy from the Bench that lets an Active Water Pokémon attack
			const to = mineAll.find(x => x.loc.zone === 'active' && def(x.k).cardType === f.type && unlocks(x.k, f.type)), from = P.bench.findIndex(b => b && def(b).cardType === f.type && b.energy.includes(f.type));
			if (to && from >= 0) A({ bench: from, at: to.loc });
		}
		else if (f.k === 'takeDamage') {   // Dusknoir: take the damage of an Active Pokémon that is about to fall, when Dusknoir can bear it
			const src = mineAll.filter(x => x.k.uid !== m.k.uid && x.loc.zone === 'active' && x.k.dmg > 0 && left(x.k) <= x.k.hp * 0.4 && left(m.k) - x.k.dmg >= 50).sort((a, b) => def(b.k).points - def(a.k).points || b.k.dmg - a.k.dmg)[0];
			if (src) A({ from: src.loc });
		}
		else if (f.k === 'discardDraw') { const d = deadCard(-1); if (d >= 0) A({ hand: d }); }   // Garchomp: a card with no use yet, for a new one
		else if (f.k === 'gatherFrom') { const to = mineAll.find(x => x.loc.zone === 'active' && unlocks(x.k, f.type)), from = P.bench.findIndex(b => b && def(b).cardType === f.type && b.energy.includes(f.type)); if (to && from >= 0) A({ bench: from, at: to.loc }); }
		else if (f.k === 'pokemonToHand') { if (P.hand.length < 10) A({}); }
		else if (f.k === 'coinPull') { const t = foes.filter(x => x.loc.zone === 'bench').sort((x, y) => left(x.k) - left(y.k))[0]; if (t) { const o = v.players[t.loc.seat], slot = [0, 1].find(sl => o.active[sl]); if (slot != null) A({ target: { seat: o.seat, zone: 'active', idx: slot }, bench: t.loc.idx }); } }
		else if (f.k === 'millOpp') { if (opp.length) A({ opp: opp[0].seat }); }
		else if (f.k === 'portrait') { const q = opp.slice().sort((x, y) => y.handCount - x.handCount)[0]; if (q && q.handCount > 0 && !P.flags.penny) A({ opp: q.seat }); }
		else if (f.k === 'switchActiveType') { const can = k => def(k).attacks.some(q => canPay(k.provides || k.energy, lessCost(q.cost, k.less || 0))); const out = [0, 1].find(sl => P.active[sl] && def(P.active[sl]).cardType === f.type && !can(P.active[sl])), inn = P.bench.findIndex(b => b && can(b)); if (out != null && inn >= 0) A({ slot: out, bench: inn }); }
		else if (f.k === 'toolsThenDiscardSelf') { const t = fa.find(x => x.k.tool); if (m.loc.zone === 'bench' && t) A({ target: t.loc }); }
		else if (f.k === 'attachZoneSelfDmg') { if (left(m.k) > f.dmg + 30 && hunger(v, me, m.k, m.loc, f.type) >= 0) A({}); }
		else if (f.k === 'healExForEnergy') { const t = mineAll.filter(x => def(x.k).ex && x.k.dmg >= 40 && x.k.energy.length >= 2).sort((x, y) => y.k.dmg - x.k.dmg)[0]; if (t) A({ at: t.loc }); }
		else if (f.k === 'boostForEnergy') { if (m.k.energy.filter(e2 => e2 === f.type).length >= 2 && P.active.some(k => k && def(k).cardType === f.type && def(k).attacks.some(q => q.damage > 0 && usable(v, me, k, q)))) A({}); }
		else if (f.k === 'statusActive') { const t = fa.filter(x => !x.k.status.includes(f.s)).sort((x, y) => left(y.k) - left(x.k))[0]; if (t) A({ target: t.loc }); }
		else if (f.k === 'rentalToHand') { if (P.hand.length < 8) A({}); }
		else if (f.k === 'drawActive') A({});
		else if (f.k === 'benchAttachDiscard') { const sl = [0, 1].find(i => P.active[i] && def(P.active[i]).cardType === f.type); if (m.loc.zone === 'bench' && sl != null && (P.energyDiscard || []).length) A({ slot: sl }); }
		else if (f.k === 'takeSome') { const t = m.loc.zone === 'bench' && left(m.k) > f.n ? mineAll.filter(x => x.loc.zone === 'active' && x.k.dmg >= f.n).sort((x, y) => y.k.dmg - x.k.dmg)[0] : null; if (t) A({ slot: t.loc.idx }); }
		else if (f.k === 'cureRandom') { const t = mineAll.find(x => x.loc.zone === 'active' && x.k.status.length); if (t) A({ slot: t.loc.idx }); }
		else if (f.k === 'healAny') { const t = mineAll.filter(x => x.k.dmg >= 20).sort((x, y) => y.k.dmg - x.k.dmg)[0]; if (t) A({ at: t.loc }); }
		else if (f.k === 'pullDamaged') { const t = foes.filter(x => x.loc.zone === 'bench' && x.k.dmg > 0).sort((x, y) => left(x.k) - left(y.k))[0]; if (t) { const o = v.players[t.loc.seat], slot = [0, 1].find(sl => o.active[sl]); if (slot != null) A({ target: { seat: o.seat, zone: 'active', idx: slot }, bench: t.loc.idx }); } }
		else if (f.k === 'gatherAll') { if (m.loc.zone === 'active' && mineAll.some(x => x.k.uid !== m.k.uid && x.loc.zone === 'bench' && x.k.energy.includes(f.type)) && def(m.k).attacks.some(q => !canPay(m.k.provides || m.k.energy, lessCost(q.cost, m.k.less || 0)))) A({}); }
		else if (f.k === 'attachDiscardSelf') { if ((P.energyDiscard || []).includes(f.type) && left(m.k) > f.n + 30 && hunger(v, me, m.k, m.loc, f.type) >= 0) A({}); }   // Flareon ex: Energy it can use, while it can afford the damage
		else if (f.k === 'ubSwap') {   // Celesteela: an Ultra Beast that can attack takes the place of one that cannot
			const can = k => def(k).attacks.some(x => canPay(k.provides || k.energy, lessCost(x.cost, k.less || 0)));
			const out = [0, 1].find(sl => P.active[sl] && def(P.active[sl]).ub && !can(P.active[sl])), inn = P.bench.findIndex(b => b && def(b).ub && can(b));
			if (out != null && inn >= 0) A({ slot: out, bench: inn });
		}
		else if (f.k === 'benchSwap') {   // Solgaleo ex steps up when it can attack and the Pokémon in front cannot
			if (m.loc.zone === 'bench' && def(m.k).attacks.some(a => canPay(m.k.provides || m.k.energy, lessCost(a.cost, m.k.less || 0)))) { const out = [0, 1].find(sl => P.active[sl] && !def(P.active[sl]).attacks.some(a => usable(v, me, P.active[sl], a))); if (out != null) A({ slot: out }); }
		}
		else if (f.k === 'healActive') { const t = mineAll.filter(x => x.loc.zone === 'active' && x.k.dmg >= f.n).sort((a, b) => b.k.dmg - a.k.dmg)[0]; if (t) A({ at: t.loc }); }
		else if (f.k === 'coinSleep' || f.k === 'poisonActive' || f.k === 'coinPoison') { const t = fa.filter(x => !x.k.status.includes(f.k === 'coinSleep' ? 'asleep' : 'poisoned')).sort((a, b) => left(b.k) - left(a.k))[0]; if (t) A({ target: t.loc }); }
	}
	// 7. a hurt Active Pokémon that cannot do much steps back for a Benched one that can
	if (!P.flags.retreated) for (const slot of [0, 1]) {
		const k = P.active[slot]; if (!k || def(k).fossil || left(k) > k.hp * 0.35) continue;
		const cost = Math.max(0, (k.retreat ?? def(k).retreat) - P.flags.retreatLess); if ((k.provides || k.energy).length < cost) continue;
		const b = P.bench.map((x, n) => (x ? n : -1)).filter(n => n >= 0 && left(P.bench[n]) > left(k) && def(P.bench[n]).attacks.some(a => canPay(P.bench[n].provides || P.bench[n].energy, a.cost)))[0];
		if (b != null) tries.push({ t: 'retreat', seat: me, slot, bench: b });
	}
	return try1(tries) || planExecute(v, me);
}

// ---------- for the player that looks ahead (ai_search.js): the plays worth trying, not only the one that looks best ----------
/** Ways to queue this turn's attacks: the plan above, and each Active Pokémon's best attack at each target (or none). */
export function executePlans(v, me) {
	const out = new Map(), add = cmds => { const a = { t: 'execute', seat: me, commands: cmds }; out.set(JSON.stringify(a), a); };
	add(planExecute(v, me).commands);
	const targets = v.players.filter(q => q.seat !== me && !q.eliminated).flatMap(q => [...q.active, ...q.bench].filter(Boolean));
	const opts = slot => { const l = [null], seen = new Set(); for (const b of [bestCommand(v, me, slot, new Map()), ...targets.map(t => bestCommand(v, me, slot, new Map(), t.uid))]) if (b && !seen.has(JSON.stringify(b.cmd))) { seen.add(JSON.stringify(b.cmd)); l.push(b.cmd); } return l; };
	const A = opts(0), B = opts(1);
	for (const x of A) for (const y of B) if (x || y) add([x, y]);
	return [...out.values()];
}
/** Where this turn's Energy could go: the hungriest few. */
export function attachPlans(v, me) {
	const P = v.players[me]; if (P.flags.attached || !P.zone.cur) return [];
	const mine = [...P.active.map((k, idx) => k && { k, loc: { seat: me, zone: 'active', idx } }), ...P.bench.map((k, idx) => k && { k, loc: { seat: me, zone: 'bench', idx } })].filter(Boolean);
	return mine.map(x => ({ ...x, h: hunger(v, me, x.k, x.loc, P.zone.cur) })).filter(x => x.h >= 0).sort((x, y) => y.h - x.h).slice(0, 4).map(x => ({ t: 'attach', seat: me, at: x.loc }));
}
