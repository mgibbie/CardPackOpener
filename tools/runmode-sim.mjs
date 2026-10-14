// runmode-sim.mjs — AI-vs-AI balance simulator for the Lorequest run modes
// (Middle-earth, Sword Coast, Final Fantasy).
//
// Each fight is set up the way game.js boot<Mode>Encounter sets it up — the hero's deck vs the
// enemy's 30-card deck, the run's life for that fight, the enemy's opening Coin, stripped
// loadouts, colour-locked basics — and ai.js step() plays BOTH seats with game.js's turn loop
// and its stall watchdog. Every fight is seeded, so a run is reproducible. If boot<Mode>Encounter
// changes, change fight() here to match.
//
// Calibration (2026-10-13): on Middle-earth's pre-#680 cards the sim ranked the ENEMIES the
// same way the testers' replays did (Grishnákh / Chief Warg / Lotho hardest, Shagrat easiest),
// with the sim's heroes winning ~10 points more than the real player. Its HERO ranking did not
// match (Legolas 80% sim, 15% real) — use it for enemies. Noise: about ±6 points per enemy at
// 200 fights.
//
// Usage:
//   node tools/runmode-sim.mjs --mode=swordcoast [--rung=A] [--games=10] [--rounds=1,3]
//        [--enemies="Name|Name"] [--overrides=trial.json] [--out=results.json] [--workers=3]
//        [--root=<a battlecards dir, e.g. an older checkout, for calibration>]
//   --rung      A (fights 1-3, the hero's 10-card deck) or B / C / D: the hero's deck is grown
//               by the run's own rewards (a spoils card per win, then the alternating treasure
//               or 3-card class bucket, picked at random) to a win count in that rung's window,
//               at that fight's life (wins + 0-2 losses so far). --rounds only applies to A.
//   --games     fights per hero/enemy pair (per round for A)
//   --overrides try a change without editing cards.json:
//               { "<card name>|<deck>": { "cost": 1 },          cost DELTA on that deck's copy
//                 "<card name>": { "set": { "attack": 4 } },    any deck (limited by __decks)
//                 "__decks": ["Deck", ...],                     restrict name-only keys to these decks
//                 "__powers": { "<character>": { "cost": 1, "effects": [...] } } }
//               A card name matches "<name>" or "<Deck>'s <name>" / "<Deck>' <name>".
//
// Output: per-hero and per-enemy hero win rates. "unfinished" fights are either a turn-60
// stalemate (turns still advancing) or — at a LOW turn, or a "hang" — an AI loop; the Bill
// Ferny Coin loop (#690) was found that way. --out writes every fight's record as JSON.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Worker, isMainThread, parentPort } from 'worker_threads';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : true]; }));
const ROOT = pathToFileURL(path.resolve(args.root || path.join(HERE, '../battlecards'))).href;
const MODES = { swordcoast: ['swordcoast.js', 'scDeck'], middleearth: ['middleearth.js', 'meDeck'], finalfantasy: ['finalfantasy.js', 'ffDeck'] };
const mode = args.mode || 'swordcoast';
if (!MODES[mode]) { console.error(`--mode must be one of ${Object.keys(MODES).join(', ')}`); process.exit(2); }
const N = +(args.games || 10);
const RUNG = String(args.rung || 'A').toUpperCase();
const WINDOW = { A: [0, 2], B: [3, 6], C: [7, 10], D: [11, 11] }[RUNG];
if (!WINDOW) { console.error('--rung must be A, B, C or D'); process.exit(2); }
const ROUNDS = RUNG === 'A' ? String(args.rounds || '1,3').split(',').map(Number) : [1];

const E = await import(ROOT + '/engine.js');
const AI = await import(ROOT + '/ai.js');
const Duels = await import(ROOT + '/duels.js');
const { seededRng } = await import(ROOT + '/engine/rng.js');
const M = await import(ROOT + '/' + MODES[mode][0]);
const TAG = MODES[mode][1];
const raw = JSON.parse(fs.readFileSync(new URL(ROOT + '/cards.json')));
const classes = JSON.parse(fs.readFileSync(new URL(ROOT + '/classes.json'))).classes;
const byId = {}; for (const c of raw.cards) byId[c.id] = c;

// ---- trial overrides ----
const OV = args.overrides ? JSON.parse(fs.readFileSync(args.overrides, 'utf8')) : {};
const powerOv = OV.__powers || {};
const nameMatches = (c, name) => c.name === name || c.name.endsWith("'s " + name) || c.name.endsWith("' " + name);
for (const [k, v] of Object.entries(OV)) {
	if (k.startsWith('__')) continue;
	const [name, deck] = k.split('|');
	for (const c of raw.cards) {
		if (!c[TAG] || (deck && c[TAG] !== deck) || (OV.__decks && !OV.__decks.includes(c[TAG])) || !nameMatches(c, name)) continue;
		byId[c.id] = { ...c, ...(v.cost != null ? { cost: c.cost + v.cost } : {}), ...(v.set || {}) };
	}
}
const seat = ch => {
	const cls = M.classOf(ch);
	const def = classes.find(c => c.id === cls) || { id: cls, power: null };
	const s = { ...def, id: cls, name: ch, power: M.powerOf(ch) };
	const pv = powerOv[ch];
	if (pv && s.power) s.power = { ...s.power, cost: s.power.cost + (pv.cost || 0), ...(pv.effects ? { effects: pv.effects } : {}) };
	return s;
};
const runLife = round => 10 + 5 * (round - 1);   // game.js runLifeFor

// the hero's deck after w wins, grown by the mode's own reward rules (random picks)
function grownDeck(hero, w, rng) {
	const deck = M.deckOf(byId, hero); const cls = [M.classOf(hero)];
	let last = null;
	for (let i = 1; i <= w; i++) {
		const beaten = M.randomEnemy(i - 1, rng, last); last = beaten;
		const sp = M.spoilsChoices(byId, beaten, rng, 3); if (sp.length) deck.push(sp[Math.floor(rng() * sp.length)]);
		if (M.rewardForWin(i) === 'treasure') {
			const opts = M.treasurePool(byId).filter(d => !deck.includes(d.id));
			if (opts.length) deck.push(opts[Math.floor(rng() * opts.length)].id);
		} else {
			const offered = Duels.offerBuckets(byId, cls, rng, 3);
			if (offered.length) deck.push(...Duels.rollBucket(byId, cls, offered[Math.floor(rng() * offered.length)], rng, 3));
		}
	}
	return deck;
}

// game.js forceResolveFor: answer a forced decision the AI cannot
function forceResolve(st) {
	if (st.scryQueue.length) E.resolveScry(st, []);
	else if (st.discardQueue.length) E.resolveDiscard(st, st.players[st.discardQueue[0].player].hand.slice(0, st.discardQueue[0].count).map(c => c.uid));
	else if (st.pickQueue.length) E.resolvePick(st, st.pickQueue[0].ids[0]);
	else if (st.dredgeQueue.length) E.resolveDredge(st, []);
	else if (st.sacQueue.length) E.resolveSac(st, (st.sacQueue[0].uids || [])[0]);
	else if (st.askQueue.length) E.resolveAsk(st, false);
	else return false;
	return true;
}

function fight(hero, enemy, round, seed) {
	const rng = seededRng(seed);
	const saved = Math.random; Math.random = rng;   // engine/AI fallbacks that reach for Math.random stay seeded
	try {
		const picks = [seat(hero), seat(enemy)];
		const w = RUNG === 'A' ? 0 : WINDOW[0] + Math.floor(rng() * (WINDOW[1] - WINDOW[0] + 1));
		if (RUNG !== 'A') round = w + 1 + Math.floor(rng() * 3);   // w wins + 0-2 losses so far
		const st = E.createGame(byId, rng, RUNG === 'A' ? M.deckOf(byId, hero) : grownDeck(hero, w, rng), 2, picks);
		st.classPicks = picks;
		E.resetDeckAndHand(st, 1, M.deckOf(byId, enemy)); E.drawCards(st, 1, 4); E.addCoin(st, 1);
		E.stripLoadouts(st);
		for (const p of st.players) p.life = runLife(round);
		st.players[0].allowedBasics = Duels.allowedBasicsFor(byId, TAG, hero);
		st.players[1].allowedBasics = Duels.allowedBasicsFor(byId, TAG, enemy);
		let actions = 0, stall = 0;
		while (!st.over && st.turnNumber < 60 && actions < 4000) {
			// game.js resolveAIResponds: whoever holds priority answers it (respond or pass)
			// before the active seat acts. Without this a land's tap ability left priority
			// with the inactive seat and the fight sat still until turn 60.
			let guard = 0;
			while (st.priority != null && !st.over && guard++ < 50) E.resolveResponse(st, st.priority, AI.chooseResponse(st, st.priority));
			if (st.over) break;
			const s = st.current;
			const before = st.turnNumber + ':' + st.current;
			const acted = AI.step(st, s);
			if (!acted) E.endTurn(st);
			if (!acted && before === st.turnNumber + ':' + st.current) {
				if (++stall >= 3) { stall = 0; if (!forceResolve(st)) return { result: 'stuck', turn: st.turnNumber }; }
			} else stall = 0;
			actions++;
		}
		if (!st.over) return { result: 'timeout', turn: st.turnNumber };
		return { result: st.winner === 0 ? 'win' : 'loss', turn: st.turnNumber, deckSize: st.players[0].deck.length, life: st.players.map(p => p.life) };
	} catch (e) { return { result: 'error', err: String(e.message).slice(0, 120) }; }
	finally { Math.random = saved; }
}

if (!isMainThread) {
	parentPort.on('message', j => parentPort.postMessage({ i: j.i, r: fight(j.hero, j.enemy, j.round, j.seed) }));
} else {
	const heroes = M.STARTERS ? [...M.STARTERS, ...(M.CORE_UNLOCK_ORDER || [])] : M.HEROES;
	const enemies = args.enemies ? String(args.enemies).split('|') : M.ENEMY_RUNGS[RUNG];
	const unknown = enemies.filter(e => !M.ENEMIES.includes(e));
	if (unknown.length) { console.error('unknown enemies:', unknown.join(', ')); process.exit(2); }
	const jobs = []; let seed = 1;
	for (const h of heroes) for (const e of enemies) for (const r of ROUNDS) for (let i = 0; i < N; i++) jobs.push({ i: jobs.length, hero: h, enemy: e, round: r, seed: 0x5eed0000 + (seed++) });

	// workers, each fight under a time limit: a fight can loop INSIDE one engine call, which
	// only killing its worker can stop (recorded as "hang")
	const results = new Array(jobs.length);
	const WORKERS = Math.max(1, +(args.workers || 3)), LIMIT = 8000;
	let next = 0, done = 0;
	await new Promise(resolve => {
		const finish = () => { if (done === jobs.length) resolve(); };
		const spawn = () => {
			const w = new Worker(new URL(import.meta.url), { argv: process.argv.slice(2) });
			let cur = null, timer = null;
			const give = () => {
				if (next >= jobs.length) { w.terminate(); finish(); return; }
				cur = jobs[next++];
				timer = setTimeout(() => { results[cur.i] = { ...cur, result: 'hang' }; done++; w.terminate(); spawn(); finish(); }, LIMIT);
				w.postMessage(cur);
			};
			w.on('message', m => {
				clearTimeout(timer); results[m.i] = { ...jobs[m.i], ...m.r }; done++;
				if (done % 200 === 0) process.stderr.write(`${done}/${jobs.length} done\n`);
				if (done === jobs.length) { w.terminate(); resolve(); } else give();
			});
			w.on('error', e => { clearTimeout(timer); if (cur && !results[cur.i]) { results[cur.i] = { ...cur, result: 'error', err: String(e.message).slice(0, 100) }; done++; } spawn(); finish(); });
			w.once('online', give);
		};
		for (let k = 0; k < Math.min(WORKERS, jobs.length); k++) spawn();
	});

	if (args.out) fs.writeFileSync(args.out, JSON.stringify(results));
	const tally = key => { const t = {}; for (const x of results) { const k = x[key]; t[k] ??= { w: 0, l: 0, o: 0, turns: 0 }; if (x.result === 'win') t[k].w++; else if (x.result === 'loss') t[k].l++; else t[k].o++; t[k].turns += x.turn || 0; } return t; };
	const rate = v => v.w / Math.max(1, v.w + v.l);
	const line = (k, v, w) => `  ${k.padEnd(w)} ${(Math.round(100 * rate(v)) + '%').padStart(4)}  ${v.w}-${v.l}${v.o ? `  (${v.o} unfinished)` : ''}  avg turns ${(v.turns / (v.w + v.l + v.o)).toFixed(1)}`;
	console.log(`${mode} rung ${RUNG}: ${results.length} fights; results ${JSON.stringify(results.reduce((o, x) => (o[x.result] = (o[x.result] || 0) + 1, o), {}))}`);
	const errs = results.filter(x => x.result === 'error' || x.result === 'stuck');
	if (errs.length) console.log('errors/stuck sample:', JSON.stringify(errs.slice(0, 3)));
	console.log(`\nHERO win % (vs rung ${RUNG}; rough — the sim ranks heroes poorly):`);
	for (const [k, v] of Object.entries(tally('hero')).sort((a, b) => rate(b[1]) - rate(a[1]))) console.log(line(k, v, 14));
	console.log('\nENEMY: hero win % against it:');
	for (const [k, v] of Object.entries(tally('enemy')).sort((a, b) => rate(a[1]) - rate(b[1]))) console.log(line(k, v, 36));
}
