// battlecards_token_art_sweep.mjs - the DYNAMIC half of the token-art sweep (bug:1794331480267).
//
// Runs every effect list of every card (and of the run-mode modules: hero powers, bosses,
// treasures) through the real engine, twice (an enemy target, then a friendly one), resolves
// any Discover, then kills everything to fire the deathrattles - and lists every card / token
// id that turned up anywhere (board, hand, deck, graveyard, events) whose art does not resolve
// (cardart.js artIdOf + ART_ALIASES against battlecards/art/index.json). Takes ~6 minutes.
// The static half runs in the gate: battlecards/tests/regression/lorequest_token_art_test.mjs.
//
//   node tools/battlecards_token_art_sweep.mjs [out.json]
//
// Fix what it lists: an entry in tools/data/token_art.json (art picked by eye, or an alias),
// python tools/lorequest_token_art.py, npm run deploy-art.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = p => path.join(ROOT, p);
const E = await import(pathToFileURL(at('battlecards/engine.js')).href);
const cards = JSON.parse(fs.readFileSync(at('battlecards/cards.json'), 'utf8')).cards;
const byId = Object.fromEntries(cards.map(c => [c.id, c]));
const idx = new Set(JSON.parse(fs.readFileSync(at('battlecards/art/index.json'), 'utf8')));
const m = fs.readFileSync(at('battlecards/cardart.js'), 'utf8').match(/export const ART_ALIASES = (\{[\s\S]*?\n\});/);
const AL = m ? new Function('return ' + m[1])() : {};
const artIdOf = c => c.artFrom || AL[c.id] || c.id;
const filler = cards.filter(c => c.type === 'creature' && !c.token && idx.has(c.id) && !(c.keywords || []).length && !c.effects && !c.deathrattle).slice(0, 3).map(c => c.id);
const seen = new Map(); // id -> { from, art, name }
let rngi = 0; const rng = () => { rngi = (rngi * 9301 + 49297) % 233280; return rngi / 233280; };
function collect(state, from) {
	const look = c => { if (!c || typeof c !== 'object' || !c.id) return; if (!seen.has(c.id)) seen.set(c.id, { from, art: artIdOf(c), name: c.name }); };
	for (const ev of state.events) { look(ev.card); look(ev.minion); }
	for (const p of state.players) for (const z of ['board', 'hand', 'graveyard', 'exile', 'emblems', 'enchantments']) for (const c of (p[z] || [])) look(c);
	// a deck holds ids: what instantiate would make of each
	for (const p of state.players) for (const id of p.deck || []) if (typeof id === 'string' && !seen.has(id)) { const d = state.cardsById[id]; if (d) look(E.instantiate(d, 0)); }
}
const walk = (v, out) => {
	if (Array.isArray(v)) { if (v.length && v.every(x => x && typeof x === 'object' && typeof x.type === 'string')) out.push(v); for (const x of v) walk(x, out); return; }
	if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x, out);
};
const jobs = [];
for (const c of cards) { const out = []; for (const [k, v] of Object.entries(c)) if (k !== 'id') walk(v, out); for (const a of out) jobs.push({ from: c.id, arr: a, src: c.id }); }
for (const mod of ['heist', 'tombs', 'duels', 'dungeon', 'lorequest', 'middleearth', 'swordcoast', 'finalfantasy', 'multiverse']) {
	try {
		const x = await import(pathToFileURL(at('battlecards/' + mod + '.js')).href);
		const out = []; walk(Object.fromEntries(Object.entries(x).filter(([k]) => /^[A-Z_]+$/.test(k))), out);
		for (const a of out) jobs.push({ from: mod, arr: a, src: null });
	} catch (e) { console.error('module', mod, e.message.slice(0, 100)); }
}
const log = console.log, warn = console.warn; console.log = console.warn = () => {};
let errs = 0, runs = 0, base = null, ji = 0;
for (const j of jobs) {
	if (++ji % 2000 === 0) process.stderr.write(`${ji}/${jobs.length} (${seen.size} ids)\n`);
	for (let rep = 0; rep < 2; rep++) {
		runs++;
		try {
			if (!base || runs % 150 === 0) base = E.createGame(byId, rng, null, 2); // createGame is ~30 ms: reuse one table
			const state = base;
			state.pickQueue = []; state.over = false; state.winner = null;
			for (const p of state.players) { p.hand = []; p.board = []; p.deck = [...filler, ...filler]; p.mana = { cur: 10, max: 10, bonus: 0 }; p.life = 40; p.eliminated = false; }
			const put = (pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; state.players[pi].board.push(c); return c; };
			for (const id of filler) { put(0, id); put(1, id); }
			const src = j.src && byId[j.src].type === 'creature' ? put(0, j.src) : (j.src ? E.instantiate(byId[j.src], 0) : null);
			const target = rep === 0 ? { type: 'creature', uid: state.players[1].board[0].uid, player: 1 } : { type: 'creature', uid: state.players[0].board[0].uid, player: 0 };
			state.events = [];
			E.execEffects(state, 0, JSON.parse(JSON.stringify(j.arr)), target, src);
			for (let k = 0; k < 3 && state.pickQueue?.length; k++) { try { E.resolvePick(state, state.pickQueue[0].ids?.[0]); } catch { break; } }
			collect(state, j.from);
			for (const p of state.players) for (const c of p.board) if (c.type === 'creature') c.damage = 999;
			try { E.sweepDeaths(state); } catch { }
			collect(state, j.from + ' (deaths)');
		} catch { errs++; }
	}
}
console.log = log; console.warn = warn;
const bad = [...seen].filter(([, s]) => !idx.has(s.art));
console.log(JSON.stringify({ runs, errs, ids: seen.size, withoutArt: bad.length }));
for (const [id, s] of bad) console.log(`${id} [${s.art}] ${s.name} <- ${s.from}`);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(bad.map(([id, s]) => ({ id, ...s })), null, 1));
process.exit(bad.length ? 1 : 0);
