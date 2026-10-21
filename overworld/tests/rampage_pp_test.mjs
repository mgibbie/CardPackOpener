// rampage_pp_test.mjs — tester bug (Instinct, 2026-10-20/21, three reports):
// a lead locked into OUTRAGE / THRASH / PETAL DANCE whose locked move hit 0 PP
// could not act. moveUsable() checked pp<=0 BEFORE the lock, so every move was
// refused ("There's no PP left for Outrage!" / "can't be used right now!"), no
// turn resolved, the lock never counted down, and only switching out escaped.
//
// Gen 3 (pokeemerald battle_main.c): a STATUS2_MULTIPLETURNS battler skips
// action selection and uses gLockedMoves; ppreduce only takes PP when there is
// some, so the rampage runs on at 0 PP. Struggle is only for "no move has PP".
//
// Covered through the real key handler: singles + doubles, wild + trainer,
// the natural path (Outrage at 1 PP drops to 0 mid-lock) and the move menu.
//
//   node overworld/tests/rampage_pp_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9271;
const STATE = { username: 'rampage', friendCode: 'RAMPG1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(st => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'HOENN');
		localStorage.setItem('magepunk_bag_v1', JSON.stringify({ pokeball: 20 }));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route116`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.world?.current?.name === 'Route116')).catch(() => false)); i++) await sleep(100);
	await sleep(1200);

	await page.evaluate(() => {
		window.__msgs = [];
		const b = window.__ow.battle, orig = b.pushMsg.bind(b);
		b.pushMsg = (text, fn) => { if (text) window.__msgs.push(text); return orig(text, fn); };
		// run the queue until the battle waits on the player again (or ends)
		window.__settle = async () => {
			const bt = window.__ow.battle;
			for (let i = 0; i < 1500 && bt.active; i++) {
				const x = bt.active;
				x.foeShownHP = x.foe?.curHP ?? 0; x.meShownHP = x.me?.curHP ?? 0;
				x.foeAllyShownHP = x.foeAlly?.curHP ?? 0; x.meAllyShownHP = x.meAlly?.curHP ?? 0;
				x.msgT = 99;
				bt.update(0.1);
				if (!x.queue.length && x.phase !== 'msg') break;
				if (i % 20 === 0) await new Promise(r => setTimeout(r, 1));
			}
			return bt.active?.phase ?? 'gone';
		};
	});

	// start a battle: kind = wild|trainer, dbl = double. The player's lead knows
	// OUTRAGE (1 PP) + TACKLE; the foes only Splash and cannot be knocked out.
	const start = (kind, dbl) => page.evaluate(async (kind, dbl) => {
		const B = await import('./battle.js'), S = (await import('./ow_state.js')).S, O = window.__ow, b = O.battle, D = b.data;
		if (b.active) { b.finish('escaped'); for (let i = 0; i < 200 && b.active; i++) { b.update(0.1); await new Promise(r => setTimeout(r, 5)); } }
		const lead = B.buildMon('dragonite', 60, D);
		lead.moves = [{ id: 'outrage', name: 'Outrage', pp: 1, maxPp: 10 }, { id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }];
		const ally = B.buildMon('swampert', 60, D);
		ally.moves = [{ id: 'growl', name: 'Growl', pp: 40, maxPp: 40 }];
		S.party = [lead, ally];
		if (kind === 'wild') {
			const P = await import('./ow_places.js');
			const realRandom = Math.random; Math.random = () => 0.5;
			try { P.startWildBattle({ id: 'snorlax', level: 90 }, dbl); } finally { Math.random = realRandom; }
		} else {
			const foes = dbl ? ['snorlax', 'blissey', 'chansey'] : ['snorlax', 'blissey'];
			b.startTrainer(S.party, foes.map(id => B.buildMon(id, 90, D)),
				{ displayName: dbl ? 'TWINS AVA & GIA' : 'POKEMANIAC HECTOR', money: 10, defeatText: 'ok' }, () => {});
		}
		for (let i = 0; i < 150 && !b.active; i++) await new Promise(r => setTimeout(r, 50));
		const a = b.active;
		if (!a) return { error: 'no battle' };
		for (const m of [a.foe, a.foeAlly, ...(a.foes || [])]) if (m) { m.moves = [{ id: 'splash', name: 'Splash', pp: 40, maxPp: 40 }]; m.maxHP = m.curHP = 99999; }
		await window.__settle();
		return { phase: a.phase, double: !!a.double, isTrainer: !!a.isTrainer, lead: a.me?.speciesId };
	}, kind, dbl);

	// one player input through the real key handler, then let the turn play out
	const press = (setup) => page.evaluate(async (setup) => {
		const b = window.__ow.battle, a = b.active;
		window.__msgs = [];
		const t0 = a.turnCount || 0;
		const realRandom = Math.random; Math.random = () => 0.6;   // lockTurns = 1 + floor(0.6*2) = 2; hits
		try {
			for (const step of setup) {
				if (step.menuIdx != null) a.menuIdx = step.menuIdx;
				if (step.moveIdx != null) a.moveIdx = step.moveIdx;
				b.key(step.key || 'z');
				// doubles: after the lead's plan, the ally picks Growl, then resolve
				for (let i = 0; i < 4 && b.active?.phase === 'target'; i++) b.key('z');
			}
			// doubles: the ally's turn to pick (FIGHT -> Growl)
			if (b.active?.double && b.active.phase === 'menu' && b.active.actionFor === 1) {
				b.active.menuIdx = 0; b.key('z'); b.active.moveIdx = 0; b.key('z');
			}
			const phase = await window.__settle();
			const x = b.active;
			return {
				phase, t0, t1: x?.turnCount || 0, lines: window.__msgs.slice(),
				lock: x?.me?.lockMove ?? null, lockTurns: x?.me?.lockTurns ?? null,
				pp: x?.me?.moves?.find(m => m.id === 'outrage')?.pp,
				usableOutrage: x ? b.moveUsable(x.me, x.me.moves[0], 'me') : null,
				usableTackle: x ? b.moveUsable(x.me, x.me.moves[1], 'me') : null,
			};
		} finally { Math.random = realRandom; }
	}, setup);

	const FIGHT_OUTRAGE = [{ menuIdx: 0 }, { moveIdx: 0 }];   // FIGHT, then slot 0 (Outrage)
	for (const [kind, dbl] of [['wild', false], ['trainer', false], ['wild', true], ['trainer', true]]) {
		const tag = `${kind} ${dbl ? 'double' : 'single'}`;
		const s = await start(kind, dbl);
		A(!s.error && s.double === dbl && s.isTrainer === (kind === 'trainer') && s.lead === 'dragonite' && s.phase === 'menu',
			`${tag}: setup, the battle waits at the menu with DRAGONITE in front`, JSON.stringify(s));

		// turn 1: Outrage at 1 PP. It hits, PP drops to 0, and the rampage locks in.
		const t1 = await press(FIGHT_OUTRAGE);
		A(t1.lines.some(l => /DRAGONITE used Outrage/i.test(l)) && t1.pp === 0 && t1.lock === 'outrage' && t1.lockTurns > 0,
			`${tag}: turn 1 Outrage spends its last PP and the rampage locks in`, JSON.stringify(t1));
		A(t1.usableOutrage === true && t1.usableTackle === false,
			`${tag}: mid-rampage the locked move stays selectable at 0 PP; the others stay locked out`, JSON.stringify({ o: t1.usableOutrage, t: t1.usableTackle }));

		// turn 2: FIGHT must carry the rampage on (it used to dead-end in the move menu)
		const t2 = await press([{ menuIdx: 0 }]);
		A(t2.lines.some(l => /DRAGONITE used Outrage/i.test(l)) && !t2.lines.some(l => /no PP left|can't be used/i.test(l)),
			`${tag}: turn 2 FIGHT uses the locked Outrage at 0 PP (no "no PP left" dead end)`, JSON.stringify(t2.lines.slice(0, 6)));
		A(t2.t1 === t2.t0 + 1, `${tag}: ...and the turn resolves (turn counter advances)`, `${t2.t0} -> ${t2.t1}`);
		A(t2.lock === null && t2.pp === 0, `${tag}: ...the rampage then ends on schedule; PP stays at 0 (never negative)`, JSON.stringify({ lock: t2.lock, pp: t2.pp }));

		// turn 3: lock over, Outrage is empty again -> the menu refuses it as usual
		const t3 = await press(FIGHT_OUTRAGE);
		A(t3.lines.some(l => /no PP left for Outrage/i.test(l)) && t3.t1 === t3.t0,
			`${tag}: after the rampage, a 0-PP Outrage is refused normally`, JSON.stringify(t3.lines.slice(0, 4)));
	}

	// the move-menu path too: a locked lead at 0 PP picking Outrage from the menu
	{
		await start('wild', false);
		const r = await page.evaluate(async () => {
			const b = window.__ow.battle, a = b.active;
			a.me.moves[0].pp = 0; a.me.lockMove = 'outrage'; a.me.lockTurns = 2;
			window.__msgs = [];
			a.phase = 'moves'; a.moveIdx = 0; b.key('z');
			await window.__settle();
			return { lines: window.__msgs.slice() };
		});
		A(r.lines.some(l => /DRAGONITE used Outrage/i.test(l)) && !r.lines.some(l => /no PP left/i.test(l)),
			'move menu: choosing the locked 0-PP Outrage resolves it', JSON.stringify(r.lines.slice(0, 4)));
	}
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
