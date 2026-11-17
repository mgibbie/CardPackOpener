// solo.js — Pocket's solo battles and deck missions, as rules: what a battle task asks for, whether a finished match did
// it, and what a player has cleared. Pure: no page, no storage (save.js keeps the progress this file shapes).
//
// A task is the source's wording (js/data/solo_battles.js). parseTask reads it into { k, ... }; a wording it cannot read
// is refused by the generator, so every task in the data is tracked.
import { card } from './data/cards.js';

const TYPE = '(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Dragon|Colorless)';
const SET_CODE = { 'Genetic Apex': 'A1', 'Mythical Island': 'A1a', 'Space-Time Smackdown': 'A2', 'Triumphant Light': 'A2a', 'Shining Revelry': 'A2b', 'Celestial Guardians': 'A3', 'Extradimensional Crisis': 'A3a', 'Eevee Grove': 'A3b', 'Wisdom of Sea and Sky': 'A4', 'Secluded Springs': 'A4a', 'Deluxe Pack: ex': 'A4b', 'Mega Rising': 'B1', 'Crimson Blaze': 'B1a', 'Fantastical Parade': 'B2', 'Paldean Wonders': 'B2a', 'Mega Shine': 'B2b', 'Pulsing Aura': 'B3', 'Paradox Drive': 'B3a', 'Everyday Wonders': 'B3b', 'Ruler of the Skies': 'B4', "Team Rocket's Ambition": 'B4a', 'Deluxe Pack: Mega': 'B4b', 'Dual Fusion': 'C1' };
const num = s => +String(s).replace(/,/g, '');
const READ = [
	[/^Win this battle without your opponent getting any points$/i, () => ({ k: 'shutout', win: true })],
	[/^Win this battle by turn (\d+)$/i, m => ({ k: 'byTurn', n: +m[1], win: true })],
	[new RegExp(`^Knock out your opponent's Active Pokémon (\\d+) times? with an attack from an? ${TYPE}(?:-type)? Pokémon$`, 'i'), m => ({ k: 'koType', n: +m[1], type: m[2] })],
	[/^Put a Stage (\d) Pokémon into play$/i, m => ({ k: 'stage', stage: +m[1] })],
	[/^Do ([\d,]+) or more damage in total (?:to )?your opponent's Pokémon with one attack$/i, m => ({ k: 'oneAttack', n: num(m[1]) })],
	[/^Deal ([\d,]+) or more damage$/i, m => ({ k: 'damage', n: num(m[1]) })],
	[/^Put (\d+) Basic Pokémon into play$/i, m => ({ k: 'basics', n: +m[1] })],
	[/^Get (\d+) or more points$/i, m => ({ k: 'points', n: +m[1] })],
	[/^Make your opponent's Pokémon Poisoned (\d+) times?$/i, m => ({ k: 'poison', n: +m[1] })],
	[/^Win this battle without any Pokémon ex included in your deck$/i, () => ({ k: 'noEx', win: true })],
	[/^Win this battle with a deck where all the Pokémon cards are of ((?:\d-diamond(?:, | and\/or |, and\/or )?)+) rarity$/i, m => ({ k: 'rarity', n: Math.max(...m[1].match(/\d/g).map(Number)), win: true })],
	[new RegExp(`^Win this battle with a deck whose Pokémon are only ${TYPE}(?:[- ]type)?$`, 'i'), m => ({ k: 'mono', type: m[1], win: true })],
	[/^Win this battle with (\d+) or more Mega Evolution Pokémon ex included in your deck$/i, m => ({ k: 'megas', n: +m[1], win: true })],
	[/^Win this battle with?o?u?t any Stadium cards included in your deck$/i, () => ({ k: 'noStadium', win: true })],
	[/^Win this battle without any Trainer cards included in your deck$/i, () => ({ k: 'noTrainers', win: true })],
	[/^Win this battle with (\d+) or more (.+) cards included in your deck$/i, m => (SET_CODE[m[2]] ? { k: 'setCards', n: +m[1], set: SET_CODE[m[2]], win: true } : null)],
];
/** The source's wording -> what it asks for, or null if this game cannot read it. */
export function parseTask(text) {
	const t = String(text).replace(/’/g, "'").replace(/\s+/g, ' ').trim();
	for (const [re, f] of READ) { const m = re.exec(t); if (m) return f(m); }
	return null;
}
const DIAMONDS = { 'One Diamond': 1, 'Two Diamond': 2, 'Three Diamond': 3, 'Four Diamond': 4 };
/** What a task asks of the DECK alone (true for a task that asks nothing of it). */
export function deckFits(task, deck) {
	const cs = deck.map(card).filter(Boolean), pk = cs.filter(c => c.kind === 'pokemon');
	switch (task.k) {
		case 'noEx': return !pk.some(c => c.ex);
		case 'rarity': return pk.every(c => (DIAMONDS[c.rarity] || 9) <= task.n);
		case 'mono': return pk.length > 0 && pk.every(c => c.cardType === task.type && !c.cardType2);
		case 'megas': return pk.filter(c => c.ex && /^Mega /.test(c.name)).length >= task.n;
		case 'noStadium': return !cs.some(c => c.kind === 'stadium');
		case 'noTrainers': return !cs.some(c => c.kind !== 'pokemon');
		case 'setCards': return cs.filter(c => c.set === task.set).length >= task.n;
		default: return true;
	}
}
/** What seat `me` did in a match, read back from its log (engine.js writes who, where and how much on each entry). */
export function matchStats(S, me) {
	const st = { ko: {}, stages: {}, basics: 0, oneAttack: 0, damage: 0, poison: 0 }; let atk = null, sum = 0;
	for (const e of S.log) {
		if (e.k === 'attack') { atk = e.seat === me ? e : null; sum = 0; }
		else if (e.k === 'execute' || e.k === 'turn') atk = null;
		else if (e.k === 'damage' && e.n > 0 && e.to && e.to.seat !== me && e.seat === me) { st.damage += e.n; if (atk) { sum += e.n; st.oneAttack = Math.max(st.oneAttack, sum); } }
		else if (e.k === 'ko' && atk && e.atk && e.seat !== me && e.to === me && e.zone === 'active') { for (const t of atk.by || []) st.ko[t] = (st.ko[t] || 0) + 1; }
		else if (e.k === 'evolve' && e.seat === me && e.stage) st.stages[e.stage] = (st.stages[e.stage] || 0) + 1;
		else if (e.k === 'setup' && e.seat === me) st.basics += e.put || 0;
		else if (e.k === 'play' && e.seat === me) st.basics++;
		else if (e.k === 'status' && e.status === 'poisoned' && e.on != null && e.on !== me) st.poison++;
	}
	return st;
}
/** Which of a battle's tasks a finished match did: one true/false per task. */
export function tasksDone(S, me, deck, tasks) {
	const st = matchStats(S, me), won = !!S.over && S.over.winner === me, mine = S.players[me], others = S.players.filter(p => p.seat !== me);
	return tasks.map(text => {
		const t = parseTask(text); if (!t || (t.win && !won) || !deckFits(t, deck)) return false;
		switch (t.k) {
			case 'shutout': return others.every(p => p.points === 0);
			case 'byTurn': return S.turn <= t.n;
			case 'koType': return (st.ko[t.type] || 0) >= t.n;
			case 'stage': return (st.stages[t.stage] || 0) >= 1;
			case 'oneAttack': return st.oneAttack >= t.n;
			case 'damage': return st.damage >= t.n;
			case 'basics': return st.basics >= t.n;
			case 'points': return mine.points >= t.n;
			case 'poison': return st.poison >= t.n;
			default: return true;   // (a task about the deck: won with a deck that fits)
		}
	});
}

// ---------- progress: { v, cleared: { battleId: 1 }, tasks: { battleId: [0|1, ...] }, paid: { key: 1 }, missions: { deckId: bits } } ----------
export const SOLO_VERSION = 1;
export const PACK_FOR_CLEAR = 1, PACK_FOR_TASKS = 1, PACK_FOR_MISSION = 1;
export const newProgress = () => ({ v: SOLO_VERSION, cleared: {}, tasks: {}, paid: {}, missions: {} });
/** Read whatever was stored: a usable progress, or a fresh one. Never throws. */
export function cleanProgress(x) {
	const p = newProgress(); if (!x || typeof x !== 'object' || x.v !== SOLO_VERSION) return p;
	const ID = /^[\w:.\-]{1,80}$/;
	for (const [k, v] of Object.entries(x.cleared || {})) if (ID.test(k) && v) p.cleared[k] = 1;
	for (const [k, v] of Object.entries(x.tasks || {})) if (ID.test(k) && Array.isArray(v) && v.length <= 8) p.tasks[k] = v.map(b => (b ? 1 : 0));
	for (const [k, v] of Object.entries(x.paid || {})) if (ID.test(k) && v) p.paid[k] = 1;
	for (const [k, v] of Object.entries(x.missions || {})) if (ID.test(k) && Number.isInteger(v) && v > 0 && v < 4) p.missions[k] = v;
	return p;
}
/** A finished solo battle folded into the progress -> { progress, packs, firstClear, newTasks: [task numbers newly done], allTasks }. */
export function recordBattle(progress, battle, won, done) {
	const p = cleanProgress(progress), had = p.tasks[battle.id] || [], now = battle.tasks.map((_, i) => (had[i] || done[i] ? 1 : 0));
	const newTasks = now.map((b, i) => (b && !had[i] ? i : -1)).filter(i => i >= 0); let packs = 0;
	const firstClear = won && !p.cleared[battle.id]; if (won) p.cleared[battle.id] = 1;
	if (now.some(Boolean)) p.tasks[battle.id] = now;
	if (firstClear && !p.paid['c:' + battle.id]) { p.paid['c:' + battle.id] = 1; packs += PACK_FOR_CLEAR; }
	const allTasks = now.length > 0 && now.every(Boolean);
	if (allTasks && !p.paid['t:' + battle.id]) { p.paid['t:' + battle.id] = 1; packs += PACK_FOR_TASKS; }
	return { progress: p, packs, firstClear, newTasks, allTasks };
}
/** A theme deck's two missions against what the player owns (`ownedByName`: card id -> copies owned of that name):
 *  { have, need: 20, highlight: true/false/null (null: the source names no highlight card), all } */
export function missionState(deck, ownedByName) {
	const want = new Map(); for (const id of deck.cards) { const n = card(id).name; want.set(n, { id, n: (want.get(n) || { n: 0 }).n + 1 }); }
	let have = 0; for (const { id, n } of want.values()) have += Math.min(n, ownedByName(id));
	const hl = deck.highlight && deck.highlight.length ? deck.highlight.every(id => ownedByName(id) > 0) : null;
	return { have, need: deck.cards.length, highlight: hl, all: have >= deck.cards.length };
}
/** Claim what a deck's missions have earned and not yet paid -> { progress, packs }. (bit 1: the highlight card, bit 2: all 20) */
export function claimMissions(progress, deck, state) {
	const p = cleanProgress(progress), had = p.missions[deck.id] || 0, now = had | (state.highlight ? 1 : 0) | (state.all ? 2 : 0);
	let packs = 0; for (const bit of [1, 2]) if ((now & bit) && !(had & bit)) packs += PACK_FOR_MISSION;
	if (now) p.missions[deck.id] = now;
	return { progress: p, packs };
}

// ---- the progress on the account (colsync.js): it only ever grows, so two copies are joined, never chosen between
/** What was stored, or null if it is not a progress at all (the account refuses that; a device starts afresh). */
export function readProgress(x) {
	if (!x || typeof x !== 'object' || x.v !== SOLO_VERSION) return null;
	if (['cleared', 'tasks', 'paid', 'missions'].some(k => x[k] != null && (typeof x[k] !== 'object' || Object.keys(x[k]).length > 3000))) return null;
	return cleanProgress(x);
}
/** Everything either copy has: a battle cleared, a task done, a reward paid or a mission claimed on any device stays so. */
export function mergeProgress(a, b) {
	const x = cleanProgress(a), y = cleanProgress(b), p = newProgress();
	Object.assign(p.cleared, x.cleared, y.cleared); Object.assign(p.paid, x.paid, y.paid);
	for (const s of [x, y]) for (const [k, v] of Object.entries(s.tasks)) { const had = p.tasks[k] || []; p.tasks[k] = Array.from({ length: Math.max(had.length, v.length) }, (_, i) => (had[i] || v[i] ? 1 : 0)); }
	for (const s of [x, y]) for (const [k, v] of Object.entries(s.missions)) p.missions[k] = (p.missions[k] || 0) | v;
	return p;
}
const canon = p => { const c = cleanProgress(p); return JSON.stringify(['cleared', 'tasks', 'paid', 'missions'].map(k => Object.keys(c[k]).sort().map(id => [id, c[k][id]]))); };
export const sameProgress = (a, b) => canon(a) === canon(b);
