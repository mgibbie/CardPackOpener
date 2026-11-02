// battle_encore_exp_theft_test.mjs — three tester reports against battle.js (2026-11-01):
//
//  1. bug:1793152303209 (Route 37 TWINS double). Encore read the SIDE-level last
//     move, so Clefairy's Encore on RATTATA locked it into its partner IVYSAUR's
//     Sleep Powder — a move Rattata doesn't know — and every move went dead. The
//     refusal message then drained the queue, which reset the chooser to the lead
//     while KEEPING the lead's plan: every retry stacked another plan, an item or a
//     switch didn't clear them, and they all ran later — some by a mon already
//     back in its ball.
//  2. bug:1793289675481. Singles paid EXP only to whoever stood there at the KO:
//     a lead that did the damage and was switched out got nothing.
//  3. bug:1793303311657. Trainer Nuzleaf's Pickpocket kept a Venusaur's AMULET
//     COIN after the battle. Items stolen in a TRAINER battle come back afterwards.
//
// Standalone (needs headless Chrome/Edge + local overworld/data assets):
//   node overworld/tests/battle_encore_exp_theft_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'/opt/chrome/chrome',
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9817;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (speciesId, name, sprite, num) => ({
	speciesId, name, level: 30, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 400, atk: 30, def: 60, spa: 30, spd: 60, spe: 40 }, maxHP: 400, curHP: 400,
	exp: 27000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite, num,
});
const PARTY = [mon('ivysaur', 'IVY', 's608.png', 2), mon('rattata', 'RAT', 's608.png', 19), mon('pidgey', 'BENCH', 's16.png', 16)];

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); }
	return false;
}

(async () => {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			for await (const _ of req) {}
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null }));
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'KANTO');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.party?.length >= 3)), 30000);
		A(ready, 'boot with a three-POKeMON party');
		if (!ready) throw new Error('boot failed');

		await page.evaluate(async () => {
			const { buildMon, makeMove } = await import('/overworld/battle.js');
			const b = window.__ow.battle, D = b.data;
			window.__h = {
				b, D, buildMon, makeMove,
				mv: id => makeMove(id, D),
				// settle the HP bars each tick so the queue keeps moving; stop at a menu
				drain() {
					for (let i = 0; i < 800 && b.active && b.active.phase !== 'done'; i++) {
						const x = b.active;
						x.foeShownHP = x.foe?.curHP ?? 0; x.meShownHP = x.me?.curHP ?? 0;
						x.foeAllyShownHP = x.foeAlly?.curHP ?? 0; x.meAllyShownHP = x.meAlly?.curHP ?? 0;
						x.msgT = 99; if (x.fx) x.fx.t = 99;
						b.update(0.05);
						if (x.queue.length === 0 && x.phase !== 'msg' && x.phase !== 'flash') break;
					}
				},
				async waitActive(pred) {
					const t0 = Date.now();
					while (!(b.active && pred(b.active)) && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 100));
					return b.active;
				},
				reset() {
					b.active = null;
					for (const m of window.__ow.party) {
						m.curHP = m.maxHP; m.status = null; m.ability = null; m.heldItem = null;
						m.level = 30; m.exp = 27000;
						for (const k of Object.keys(m)) if (/^(encore|disable|lastMoveUsed|_preTheftItem|taunt|torment|expBy)/.test(k)) delete m[k];
					}
					const P = window.__ow.party;
					P[0].moves = ['sleeppowder', 'razorleaf'].map(id => makeMove(id, D));
					P[1].moves = ['quickattack', 'tackle', 'tailwhip'].map(id => makeMove(id, D));
					P[2].moves = ['tackle'].map(id => makeMove(id, D));
				},
				foes(ids, lvl) {
					return ids.map(id => { const m = buildMon(id, lvl, D); m.ability = null; m.heldItem = null; return m; });
				},
			};
		});

		// =============== 1. doubles Encore + plan integrity ===============
		const enc = await page.evaluate(async () => {
			const h = window.__h, b = h.b, P = window.__ow.party;
			h.reset();
			const realRandom = Math.random;
			Math.random = () => 0.3;   // every roll hits, nothing crits
			try {
				b.startTrainer(P, h.foes(['jigglypuff', 'clefairy'], 16),
					{ displayName: 'TWINS ANN & ANNE', money: 100, defeatText: 'ok' }, () => {});
				const a = await h.waitActive(x => x.double);
				if (!a) return { error: 'trainer double did not form' };
				h.drain();
				const ivy = a.me, rat = a.meAlly;
				// turn: RATTATA Quick Attacks, then IVYSAUR Sleep Powders (the side's last move)
				b.startQueue(() => {
					b.useMove(rat, a.meAllyBoosts, a.foe, a.foeBoosts, rat.moves[0], false);
					b.useMove(ivy, a.meBoosts, a.foe, a.foeBoosts, ivy.moves[0], false);
				});
				h.drain();
				// CLEFAIRY encores RATTATA
				b.startQueue(() => b.useMove(a.foeAlly, a.foeAllyBoosts, rat, a.meAllyBoosts, h.mv('encore'), true));
				h.drain();
				const lock = { sideLast: a.lastMove.me, encoreMove: rat.encoreMove ?? null, turns: rat.encoreTurns ?? 0 };
				const usable = rat.moves.map(m => b.moveUsable(rat, m, 'me'));
				delete rat.encoreMove; delete rat.encoreTurns;
				// ENCORE on a mon that hasn't moved (IVYSAUR after a switch would be fresh)
				delete ivy.lastMoveUsed;
				b.startQueue(() => b.useMove(a.foeAlly, a.foeAllyBoosts, ivy, a.meBoosts, h.mv('encore'), true));
				h.drain();
				const freshEncore = ivy.encoreMove ?? null;
				delete ivy.encoreMove; delete ivy.encoreTurns;

				// ---- plan integrity through the REAL menu keys ----
				a.plans = []; a.actionFor = 0; a.phase = 'menu'; a.menuIdx = 0;
				for (const m of [...ivy.moves, ...rat.moves]) m.pp = m.maxPp;
				rat.disabledMove = 'tackle'; rat.disableTurns = 4;
				const ivyPP0 = ivy.moves[0].pp;
				b.key('z'); b.key('z');           // FIGHT -> IVYSAUR's Sleep Powder (status: no target)
				const afterLead = { actionFor: a.actionFor, plans: a.plans.length, phase: a.phase };
				const tries = [];
				for (let t = 0; t < 3; t++) {
					b.key('z');                    // FIGHT for RATTATA
					b.key('ArrowRight');           // TACKLE — disabled
					b.key('z');                    // refused: a message plays
					h.drain();
					tries.push({ actionFor: a.actionFor, plans: a.plans.length, phase: a.phase, chooser: b.chooser()?.name });
				}
				// now a legal pick: QUICK ATTACK (both foes up, so a target prompt)
				b.key('z'); b.key('z');
				if (a.phase === 'target') b.key('z');
				h.drain();
				const done = {
					plans: a.plans.length, phase: a.phase,
					ivyPPspent: ivyPP0 - ivy.moves[0].pp,
				};

				// ---- every move unusable but PP left: FIGHT gives Struggle, not a dead menu ----
				a.plans = []; a.actionFor = 0; a.phase = 'menu'; a.menuIdx = 0;
				delete rat.disabledMove;
				const savedIvyMoves = ivy.moves;
				ivy.moves = [h.mv('tackle')];
				ivy.disabledMove = 'tackle'; ivy.disableTurns = 4;
				b.key('z');
				const struggle = { phase: a.phase, plans: a.plans.length, actionFor: a.actionFor, planMove: a.plans[0]?.move?.id ?? null };
				ivy.moves = savedIvyMoves; delete ivy.disabledMove; delete ivy.disableTurns;

				// ---- a BENCHED actor's leftover plan never runs; an item/switch clears plans ----
				a.plans = []; a.actionFor = 0; a.phase = 'menu';
				const bench = P[2];
				const benchPP0 = bench.moves[0].pp;
				a.plans = [{ user: bench, boosts: {}, move: bench.moves[0], target: a.foe }];
				b.startQueue(() => b.resolveDoubleTurn());
				h.drain();
				const benchActed = benchPP0 - bench.moves[0].pp;
				// stale plan left over, then the lead SWITCHES: the switch is the turn
				a.plans = [{ user: ivy, boosts: a.meBoosts, move: ivy.moves[1], target: a.foe }];
				a.actionFor = 0; a.phase = 'menu';
				const ivyLeafPP0 = ivy.moves[1].pp;
				b.switchTo(bench);
				h.drain();
				const afterSwitch = { plans: a.plans.length, me: a.me?.name };
				// the next real turn must not run IVYSAUR (benched) from any leftover
				a.plans.push({ user: ivy, boosts: {}, move: ivy.moves[1], target: a.foe });
				a.plans.push({ user: a.me, boosts: a.meBoosts, move: a.me.moves[0], target: a.foe });
				b.startQueue(() => b.resolveDoubleTurn());
				h.drain();
				const ivyLeafSpent = ivyLeafPP0 - ivy.moves[1].pp;
				return { lock, usable, freshEncore, afterLead, tries, done, struggle, benchActed, afterSwitch, ivyLeafSpent };
			} finally { Math.random = realRandom; b.active = null; }
		});
		if (enc.error) A(false, enc.error);
		else {
			A(enc.lock.sideLast === 'sleeppowder', 'setup: the side-level last move is the PARTNER\'s Sleep Powder', JSON.stringify(enc.lock));
			A(enc.lock.encoreMove === 'quickattack', 'Encore locks RATTATA into ITS OWN last move (Quick Attack), not its partner\'s', JSON.stringify(enc.lock));
			A(enc.usable[0] === true && enc.usable[1] === false, 'the encored move stays usable, the others are blocked', JSON.stringify(enc.usable));
			A(enc.freshEncore === null, 'Encore on a mon with no last move of its own fails cleanly', String(enc.freshEncore));
			A(enc.afterLead.actionFor === 1 && enc.afterLead.plans === 1, 'setup: the lead\'s plan is in and the partner is choosing', JSON.stringify(enc.afterLead));
			A(enc.tries.every(t => t.plans === 1 && t.actionFor === 1 && t.phase === 'menu'),
				'a refused move keeps the partner choosing and never stacks plans', JSON.stringify(enc.tries));
			A(enc.done.plans === 0 && enc.done.phase === 'menu', 'a legal pick then resolves the turn and empties the plans', JSON.stringify(enc.done));
			A(enc.done.ivyPPspent === 1, 'the lead acted exactly once (one PP)', JSON.stringify(enc.done));
			A(enc.struggle.phase !== 'moves' && enc.struggle.planMove === 'struggle',
				'every move unusable with PP left: FIGHT plans Struggle instead of a dead menu', JSON.stringify(enc.struggle));
			A(enc.benchActed === 0, 'a benched POKeMON\'s leftover plan never executes', String(enc.benchActed));
			A(enc.afterSwitch.plans === 0 && enc.afterSwitch.me === 'BENCH', 'a switch spends the turn and clears every pending plan', JSON.stringify(enc.afterSwitch));
			A(enc.ivyLeafSpent === 0, 'the switched-out lead never acts from the bench', String(enc.ivyLeafSpent));
		}

		// =============== 2. singles EXP participation ===============
		const exp = await page.evaluate(async () => {
			const h = window.__h, b = h.b, P = window.__ow.party;
			const run = async (faintLead) => {
				h.reset();
				b.start(P, 'pikachu', 5, () => {});
				const a = await h.waitActive(x => x.phase === 'menu' || x.phase === 'msg');
				h.drain();
				const before = P.map(m => m.exp);
				b.beginTurn();               // IVY faces the foe for a turn
				b.switchTo(P[1]);            // then RAT comes in
				h.drain();
				if (faintLead) P[0].curHP = 0;
				a.foe.curHP = 0;
				b.startQueue(() => b.checkFaints());   // outside a running queue nothing would play
				h.drain();
				const out = { gained: P.map((m, i) => m.exp - before[i]), result: b.active?.result, me: a.me.name, phase: b.active?.phase, msg: b.active?.msg };
				b.active = null;
				return out;
			};
			return { normal: await run(false), fainted: await run(true) };
		});
		A(exp.normal.result === 'victory' && exp.normal.me === 'RAT', 'setup: RAT finished the foe after IVY switched out', JSON.stringify(exp.normal));
		A(exp.normal.gained[1] > 0, 'the finisher gains EXP', JSON.stringify(exp.normal.gained));
		A(exp.normal.gained[0] > 0, 'the switched-out participant ALSO gains EXP', JSON.stringify(exp.normal.gained));
		A(exp.normal.gained[0] === exp.normal.gained[1], 'each participant earns the full yield (as doubles already paid)', JSON.stringify(exp.normal.gained));
		A(exp.normal.gained[2] === 0, 'a POKeMON that never faced the foe gains nothing', JSON.stringify(exp.normal.gained));
		A(exp.fainted.gained[0] === 0 && exp.fainted.gained[1] > 0, 'a FAINTED participant earns nothing', JSON.stringify(exp.fainted.gained));

		// =============== 3. Pickpocket theft in a TRAINER battle is returned ===============
		const theft = await page.evaluate(async () => {
			const h = window.__h, b = h.b, P = window.__ow.party;
			const realRandom = Math.random;
			const run = async (trainer) => {
				h.reset();
				P[0].heldItem = 'amuletcoin';
				P[0].moves = [h.mv('tackle')];
				Math.random = () => 0.3;
				try {
					if (trainer) {
						b.startTrainer(P, h.foes(['nuzleaf'], 50), { displayName: 'CAMPER LARRY', money: 100, defeatText: 'ok' }, () => {});
					} else b.start(P, 'nuzleaf', 50, () => {});
					const a = await h.waitActive(x => x.phase === 'menu' || x.phase === 'msg');
					h.drain();
					a.foe.ability = 'pickpocket'; a.foe.heldItem = null; a.foe.curHP = a.foe.maxHP;
					b.startQueue(() => b.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, P[0].moves[0], false));
					h.drain();
					const mid = { mine: P[0].heldItem ?? null, foes: a.foe.heldItem ?? null };
					a.foe.curHP = 0;
					b.startQueue(() => b.checkFaints());   // outside a running queue nothing would play
					h.drain();
					const out = { mid, phase: b.active?.phase, msg: b.active?.msg, result: b.active?.result, after: P[0].heldItem ?? null, marker: '_preTheftItem' in P[0] };
					b.active = null;
					return out;
				} finally { Math.random = realRandom; }
			};
			return { trainer: await run(true), wild: await run(false) };
		});
		A(theft.trainer.mid.mine === null && theft.trainer.mid.foes === 'amuletcoin', 'setup: Pickpocket lifts the AMULET COIN mid-battle', JSON.stringify(theft.trainer));
		A(theft.trainer.result === 'victory' && theft.trainer.after === 'amuletcoin', 'after a TRAINER battle the stolen item is back', JSON.stringify(theft.trainer));
		A(!theft.trainer.marker, 'and no theft marker is left on the saved mon', JSON.stringify(theft.trainer));
		A(theft.wild.mid.mine === null && theft.wild.after === null && !theft.wild.marker,
			'a WILD thief keeps what it took (as in the games)', JSON.stringify(theft.wild));

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
