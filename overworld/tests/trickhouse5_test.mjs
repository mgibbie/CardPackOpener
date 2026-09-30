// trickhouse5_test.mjs — Trick House Puzzle 5's Mechadoll quizzes get a real answer menu.
//
// Playtest (instinctloretest0918, 2026-09-30): a Mechadoll asked its quiz, then
// said "BZZZT. DISAPPOINTMENT. ERROR." with no choices shown. The transpile had
// dropped every `multichoice` (all 15 quiz variants here, ~250 across FireRed and
// Emerald), so the switch read a stale VAR_RESULT (0; Mechadoll1 Quiz1 wants 2).
// tools/gen_multichoice.mjs restores them; choice.js opens the menu and WAITS.
//
//   1. every one of the 15 variants shows its question and full option list
//   2. every selection writes its own index, and right/wrong take the original branches
//   3. no compare runs before a selection
//   4. a wrong answer finishes the scene and returns you to the puzzle start, no stuck menu
//   5. a full run with real keys: all five dolls, the scroll, the reward
//   6. reload + the server push keep the stage, the reward and the six-POKeMON party
//
// Split in two so each part fits the gate's 5-minute suite limit (30 of the 45
// answers are wrong, and each wrong one warps back to the start):
//   part A (this file):             dolls 1-3, checks 1-4
//   part B (trickhouse5b_test.mjs): dolls 4-5, checks 1-4, then 5 and 6
//
//   node overworld/tests/trickhouse5_test.mjs           (part A)
//   P5_PART=B node overworld/tests/trickhouse5_test.mjs  (part B)
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
const PART = process.env.P5_PART === 'B' ? 'B' : 'A';
const DOLLS = PART === 'A' ? [1, 2, 3] : [4, 5];
const PORT = PART === 'A' ? 9178 : 9179;
const MAP = 'Route110_TrickHousePuzzle5';
const STATE = { username: 'puzzle5', friendCode: 'PZL500', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (s, n) => ({
	speciesId: s, name: s.toUpperCase(), level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: n,
});
const PARTY = [mon('bulbasaur', 1), mon('charmander', 4), mon('squirtle', 7), mon('pikachu', 25), mon('eevee', 133), mon('snorlax', 143)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

let lastPush = null;
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		if (b.action === 'ow-save') { lastPush = b.ow; return res.end(JSON.stringify({ ok: true })); }
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

// the expected lists and right answers, from the restored data itself
const md = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld', 'multichoice_data.json'), 'utf8'));
const quizLabel = (d, q) => `${MAP}_EventScript_Mechadoll${d}Quiz${q}`;
const QUIZ = {};
for (let d = 1; d <= 5; d++) for (let q = 1; q <= 3; q++) {
	const ops = (md.patches[MAP] || {})[quizLabel(d, q)] || [];
	const i = ops.findIndex(o => o.op === 'multichoice');
	const mc = ops[i];
	const right = ops.slice(i + 1).find(o => o.op === 'branch' && /CorrectAnswer$/.test(o.label || ''));
	QUIZ[`${d}.${q}`] = { list: mc ? mc.list : null, options: mc ? mc.options : null, prompt: mc ? mc.prompt : null, correct: right ? +right.cond.value : null };
}

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'HOENN');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		localStorage.setItem('magepunk_trickhouse_v1', JSON.stringify({ stage: 4, scroll: false }));   // puzzles 1-4 cleared
	}, STATE, PARTY);
	const boot = async (map) => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${MAP}&x=0&y=21`, { waitUntil: 'domcontentloaded' });
	await boot(MAP);
	const key = k => page.keyboard.press(k === 'z' ? 'z' : k);
	const W = f => page.evaluate(f);
	const choiceOpen = () => page.evaluate(async () => (await import('./choice.js')).choiceMenu.open);
	const choiceState = () => page.evaluate(async () => { const c = (await import('./choice.js')).choiceMenu; return { open: c.open, list: c.list, options: c.options.slice(), prompt: c.prompt, idx: c.idx }; });
	// the dialog driver runs IN the page: one round trip per wait, not one per page,
	// pressing Z as real keydown events (the keyboard's own input path)
	const inPage = mode => page.evaluate(async mode => {
		const C = await import('./choice.js'), W2 = window.__ow;
		const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		const t0 = Date.now();
		let calm = 0;
		while (Date.now() - t0 < 20000) {
			if (C.choiceMenu.open) return 'menu';
			const d = W2.dialog.blocking, c = W2.cutscene.blocking;
			// idle = no dialog, no scene AND no screen fade (a warp fades out, loads,
			// fades in with the scene already over), held for ~half a second
			const f = W2.fade || { alpha: 0, target: 0 };
			const still = !d && !c && f.alpha < 0.001 && f.target < 0.001;
			if (still) { if (++calm >= 12) return 'idle'; }
			else calm = 0;
			if (d) { (window.__said = window.__said || []).push(JSON.stringify(W2.dialog.pages || '')); press('z'); }
			await new Promise(r => setTimeout(r, 40));
		}
		return 'timeout';
	}, mode);
	// press Z through dialog until the answer menu opens (or the scene ends)
	const toMenu = async () => (await inPage('toMenu')) === 'menu';
	const drain = () => inPage('drain');
	const logTail = () => W(() => (window.__owChoiceLog || []).slice(-2));

	// ===== 1-4: every variant, every option =====
	for (const d of DOLLS) for (let q = 1; q <= 3; q++) {
		const exp = QUIZ[`${d}.${q}`];
		A(exp.options && exp.options.length >= 2 && exp.correct != null, `[${d}.${q}] the restored quiz has its option list and a right answer`, JSON.stringify(exp));
		if (!exp.options) continue;
		for (let k = 0; k < exp.options.length; k++) {
			if (await W(() => window.__ow.world.current.name) !== 'Route110_TrickHousePuzzle5') { await page.evaluate(m => window.__ow.moveToMap(m, 0, 21), MAP); await boot(MAP); }
			await W(async () => { (await import('./events.js')).setVar('VAR_RESULT', 99); });   // a sentinel: nothing may read it early
			await W(() => { window.__said = []; const P = window.__ow.player; P.tx = 5; P.ty = 21; P.x = 80; P.y = 336; });   // not the start (0,21)
			await page.evaluate((lab, d) => { const W2 = window.__ow; (async () => { (await import('./events.js')).setVar('VAR_TEMP_8', 'LOCALID_MECHADOLL_' + d); })(); W2.runScriptLabel(lab); }, quizLabel(d, q), d);
			const opened = await toMenu();
			const st = await choiceState();
			const early = await W(async () => ({ v: (await import('./events.js')).getVar('VAR_RESULT'), compares: (window.__owChoiceLog || []).filter(r => r.compare && r.at > Date.now() - 2000).length }));
			if (k === 0) {
				A(opened && JSON.stringify(st.options) === JSON.stringify(exp.options), `[${d}.${q}] the quiz shows its full option list: ${exp.options.join(' / ')}`, JSON.stringify(st));
				A(st.prompt && st.prompt.length > 10, `[${d}.${q}] ...with the question above it`, JSON.stringify(st.prompt));
				A(early.v === 99, `[${d}.${q}] ...and nothing has read or written VAR_RESULT while the menu waits`, JSON.stringify(early));
			}
			if (!opened) continue;
			for (let i = 0; i < k; i++) { await key('ArrowDown'); await sleep(40); }
			await key('z');
			await sleep(150);
			const rec = (await logTail()).find(r => r.selected != null);
			const outcome = await drain();
			const after = await W(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty, said: null }));
			const rec2 = (await W(() => (window.__owChoiceLog || []).filter(r => r.selected != null).slice(-1)[0]));
			const right = k === exp.correct;
			A(rec2 && rec2.selected === k && rec2.varResult === k && rec2.compare && rec2.compare.varResult === k, `[${d}.${q}] choosing #${k} (${exp.options[k]}) writes ${k} to VAR_RESULT, and the compare reads ${k}`, JSON.stringify(rec2));
			const said = await W(() => (window.__said || []).join(' | '));
			if (right) A(outcome === 'idle' && after.x === 5 && /CORRECT/i.test(said) && !/DISAPPOINTMENT/.test(said), `[${d}.${q}] the RIGHT answer takes the correct branch (go through, no return to the start)`, JSON.stringify({ outcome, after, said: said.slice(0, 160) }));
			else A(outcome === 'idle' && after.x === 0 && after.y === 21 && /DISAPPOINTMENT/.test(said) && !(await choiceOpen()), `[${d}.${q}] a wrong answer: "DISAPPOINTMENT", the scene ends back at the puzzle start, no menu left open`, JSON.stringify({ outcome, after, said: said.slice(0, 160) }));
		}
	}

	// ===== 5: a full run with real keys (part B) =====
	if (PART === 'B') {
	await page.evaluate(m => window.__ow.moveToMap(m, 0, 21), MAP); await boot(MAP);
	const dolls = await W(() => window.__ow.npcs.list.filter(n => /MECHADOLL/.test(n.ev && n.ev.local_id || '')).map(n => ({ id: n.ev.local_id, x: n.tx, y: n.ty })));
	A(dolls.length === 5, 'setup: five Mechadolls on the map', JSON.stringify(dolls));
	let cleared = 0;
	for (const doll of dolls.sort((a, b) => a.id.localeCompare(b.id))) {
		const d = +doll.id.slice(-1);
		// stand beside it, face it, press Z (the ordinary talk)
		await page.evaluate(dl => {
			const W2 = window.__ow;
			for (const [dx, dy, f] of [[0, 1, 'up'], [-1, 0, 'right'], [1, 0, 'left'], [0, -1, 'down']]) {
				const x = dl.x + dx, y = dl.y + dy;
				if (!W2.world.isPassable(x, y) || W2.npcs.list.some(n => n.tx === x && n.ty === y)) continue;
				W2.player.tx = x; W2.player.ty = y; W2.player.x = x * 16; W2.player.y = y * 16; W2.player.facing = f; return;
			}
		}, doll);
		await key('z');
		if (!(await toMenu())) { A(false, `[doll ${d}] talking opens a quiz`); continue; }
		const st = await choiceState();
		// which of this doll's three quizzes is it? match the options
		const which = [1, 2, 3].map(q => QUIZ[`${d}.${q}`]).find(e => e.list === st.list);
		for (let i = 0; i < which.correct; i++) { await key('ArrowDown'); await sleep(40); }
		await key('z');
		await drain();
		if (await W(() => window.__ow.player.tx) !== 0 || await W(() => window.__ow.player.ty) !== 21) cleared++;
	}
	A(cleared === 5, 'all five Mechadolls answered correctly with real keys, none sent back', String(cleared));
	// the scroll, then the Trick Master
	await page.evaluate(() => { const W2 = window.__ow; W2.player.tx = 11; W2.player.ty = 22; W2.player.x = 176; W2.player.y = 352; W2.player.facing = 'up'; });
	await key('z'); await drain();
	A((await W(() => JSON.parse(localStorage.getItem('magepunk_trickhouse_v1')))).scroll === true, 'the scroll is found');
	await page.evaluate(() => window.__ow.moveToMap('Route110_TrickHouseEnd', 4, 6)); await boot('Route110_TrickHouseEnd');
	const before = await W(() => window.__ow.Bag.count('magnet'));
	await page.evaluate(() => { const W2 = window.__ow; W2.player.tx = 4; W2.player.ty = 6; W2.player.x = 64; W2.player.y = 96; W2.player.facing = 'up'; });
	await key('z'); await drain();
	const rew = await W(() => ({ magnet: window.__ow.Bag.count('magnet'), th: JSON.parse(localStorage.getItem('magepunk_trickhouse_v1')) }));
	A(rew.magnet === before + 1 && rew.th.stage === 5, 'the Trick Master pays the puzzle 5 prize (MAGNET) and the house moves on', JSON.stringify(rew));

	// ===== 6: reload + remote sync =====
	await page.evaluate(() => window.__ow.pushOwForTest()); await sleep(800);
	A(lastPush && JSON.parse(lastPush.magepunk_trickhouse_v1).stage === 5 && JSON.parse(lastPush.magepunk_party_v1).length === 6 && /magnet/.test(lastPush.magepunk_bag_v1 || ''), 'the server push carries the stage, the MAGNET and the six-POKeMON party');
	await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(1500);
	for (let i = 0; i < 300 && !(await W(() => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current)).catch(() => false)); i++) await sleep(100);
	await sleep(800);
	const rl = await W(() => ({ th: JSON.parse(localStorage.getItem('magepunk_trickhouse_v1')), party: window.__ow.party.length, magnet: window.__ow.Bag.count('magnet') }));
	A(rl.th.stage === 5 && rl.party === 6 && rl.magnet >= 1, 'after a reload: stage 5, the MAGNET, six POKeMON', JSON.stringify(rl));
	}
	A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
