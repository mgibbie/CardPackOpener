// tester_1015_test.mjs — three tester reports, 2026-10-14/15.
//
//   1. bug:1791997491955 (Instinct): DREAM EATER damaged and drained an AWAKE Zapdos
//      (a trainer's Noctowl, turn after turn). It needs the TARGET asleep (or
//      Comatose): on an awake target it does nothing, and the AI doesn't pick it.
//   2. bug:1792042280049 (Remy's bot): field CUT said "The tree was CUT down!" with
//      the tree still standing. The removal waited for the message's close
//      callback, and Dialog.open replaces onClose — any other dialog opened over
//      the message dropped it. Now the tree goes first, then the message.
//   3. bug:1792056549611 (Remy's bot): /pokemon/ and /pokemon/overworld/ rendered
//      the homepage (SPA fallback) and its relative links looped; _redirects now
//      sends /pokemon to the game at /overworld/.
//
//   node overworld/tests/tester_1015_test.mjs
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
const PORT = 9491;
const STATE = { username: 'tester1015', friendCode: 'T1015A', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
		localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: { JOHTO: { zephyr: true, hive: true } }, champion: {} }));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route116`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.world?.current?.name === 'Route116')).catch(() => false)); i++) await sleep(100);
	await sleep(1200);

	// ===== 3. _redirects: /pokemon goes to the game =====
	{
		const rd = fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
		A(rd.includes('/pokemon /overworld/ 301') && rd.includes('/pokemon/* /overworld/ 301'), '3. _redirects sends /pokemon and /pokemon/* to /overworld/', JSON.stringify(rd.filter(l => /pokemon/.test(l))));
	}

	// record every battle line; a sturdy lead
	await page.evaluate(async () => {
		const B = await import('./battle.js'), S = (await import('./ow_state.js')).S, O = window.__ow;
		S.party = [B.buildMon('swampert', 60, O.battle.data), B.buildMon('pelipper', 60, O.battle.data)];
		window.__msgs = [];
		const orig = O.battle.pushMsg.bind(O.battle);
		O.battle.pushMsg = (text, fn, ifAlive) => orig(text, text ? () => { window.__msgs.push(text); fn?.(); } : fn, ifAlive);
	});
	const mv = id => `({ id: '${id}', name: window.__ow.battle.data.moves['${id}']?.name || '${id}', pp: 40, maxPp: 40 })`;
	const start = (id, level) => page.evaluate(async (id, level) => {
		const P = await import('./ow_places.js');
		const B = await import('./battle.js'), S = (await import('./ow_state.js')).S, O = window.__ow;
		if (O.battle.active) { O.battle.finish('escaped'); for (let i = 0; i < 200 && O.battle.active; i++) { O.battle.update(0.1); await new Promise(r => setTimeout(r, 10)); } }
		S.party = [B.buildMon('swampert', 60, O.battle.data), B.buildMon('pelipper', 60, O.battle.data)];
		const realRandom = Math.random; Math.random = () => 0.5;
		try { P.startWildBattle({ id, level }, false); } finally { Math.random = realRandom; }
		for (let i = 0; i < 100 && !window.__ow.battle.active; i++) await new Promise(r => setTimeout(r, 50));
		return !!window.__ow.battle.active;
	}, id, level);
	const drain = () => page.evaluate(async () => {
		const b = window.__ow.battle;
		for (let i = 0; i < 600 && b.active && b.active.queue.length; i++) { b.update(0.1); await new Promise(r => setTimeout(r, 2)); }
	});
	const end = () => page.evaluate(async () => { const b = window.__ow.battle; if (!b.active) return; b.finish('escaped'); for (let i = 0; i < 200 && b.active; i++) { b.update(0.1); await new Promise(r => setTimeout(r, 10)); } });

	// ===== 1. Dream Eater =====
	// the foe's Dream Eater against my lead, awake then asleep
	for (const [label, asleep] of [['awake', false], ['asleep', true]]) {
		await start('noctowl', 60);
		await page.evaluate(new Function(`const b = window.__ow.battle, a = b.active;
			a.me.status = ${asleep ? "'slp'" : 'null'}; a.me.sleepTurns = ${asleep ? 5 : 0}; a.me.ability = 'static';
			a.foe.moves = [${mv('dreameater')}]; a.foe.stats.spe = 1; a.me.stats.spe = 999; a.foe.curHP = Math.max(1, a.foe.maxHP - 40);
			window.__hp0 = a.me.curHP; window.__fhp0 = a.foe.curHP; window.__msgs = [];
			const realRandom = Math.random; Math.random = () => 0.5;
			try { b.startQueue(() => b.resolveTurn(${mv('growl')})); } finally { Math.random = realRandom; }`));
		await drain();
		const o = await page.evaluate(() => ({ hp0: window.__hp0, hp: window.__ow.battle.active?.me.curHP, fhp0: window.__fhp0, fhp: window.__ow.battle.active?.foe.curHP, lines: window.__msgs.slice() }));
		if (!asleep) A(o.lines.some(l => /used Dream Eater/.test(l)) && o.lines.some(l => /wasn't affected/.test(l)) && o.hp === o.hp0 && o.fhp === o.fhp0,
			"1. foe Dream Eater on an AWAKE target: \"wasn't affected!\", no damage, no drain", JSON.stringify(o));
		else A(o.hp < o.hp0 && o.fhp > o.fhp0, '1. foe Dream Eater on a SLEEPING target still hits and drains', JSON.stringify(o));
		await end();
	}
	// my Dream Eater against an awake wild foe
	{
		await start('zigzagoon', 30);
		await page.evaluate(new Function(`const b = window.__ow.battle, a = b.active;
			a.foe.status = null; a.foe.moves = [${mv('growl')}]; a.me.stats.spe = 999; a.foe.stats.spe = 1;
			window.__fhp0 = a.foe.curHP; window.__msgs = [];
			const realRandom = Math.random; Math.random = () => 0.5;
			try { b.startQueue(() => b.resolveTurn(${mv('dreameater')})); } finally { Math.random = realRandom; }`));
		await drain();
		const o = await page.evaluate(() => ({ fhp0: window.__fhp0, fhp: window.__ow.battle.active?.foe.curHP, lines: window.__msgs.slice() }));
		A(o.fhp === o.fhp0 && o.lines.some(l => /wasn't affected/.test(l)), '1. my Dream Eater on an awake foe does nothing', JSON.stringify(o));
		await end();
	}
	// the trainer AI doesn't choose it against an awake target (but does against a sleeping one)
	{
		await start('noctowl', 60);
		const r = await page.evaluate(new Function(`const b = window.__ow.battle, a = b.active;
			const wasT = a.isTrainer, wasI = a.info; a.isTrainer = true; a.info = { ...(a.info || {}), boss: true };   // restored below, before the next draw
			a.foe.moves = [${mv('dreameater')}, ${mv('peck')}];
			const realRandom = Math.random; Math.random = () => 0.5;
			try {
				a.me.status = null; const awake = b.chooseFoeMove(a.foe, a.me).id;
				a.me.status = 'slp'; a.me.sleepTurns = 5; const asleep = b.chooseFoeMove(a.foe, a.me).id;
				return { awake, asleep };
			} finally { Math.random = realRandom; a.isTrainer = wasT; a.info = wasI; }`));
		A(r.awake !== 'dreameater' && r.asleep === 'dreameater', '1. the AI skips Dream Eater on an awake target, picks it on a sleeping one', JSON.stringify(r));
		await end();
	}

	// ===== 2. CUT: the tree goes even if another dialog opens over the message =====
	{
		await page.evaluate(() => window.__ow.moveToMap('IlexForest', 8, 26));
		for (let i = 0; i < 100 && (await page.evaluate(() => window.__ow.world.current?.name)) !== 'IlexForest'; i++) await sleep(100);
		await sleep(900);
		const r = await page.evaluate(async () => {
			const O = window.__ow, F = await import('./ow_fieldmoves.js'), B = await import('./battle.js'), S = (await import('./ow_state.js')).S;
			const d = B.buildMon('diglett', 25, O.battle.data); d.moves = [{ id: 'cut', name: 'Cut', pp: 30, maxPp: 30 }]; S.party = [d];
			const P = O.player; P.tx = 8; P.ty = 26; P.x = 8 * 16; P.y = 26 * 16; P.facing = 'up';
			const before = O.world.isPassable(8, 25);
			F.useFieldMove('cut', d);
			const said = JSON.stringify(O.dialog.pages || '');
			O.dialog.open('A message that replaces the CUT one.');   // e.g. a phone call or a toast
			for (let i = 0; i < 40 && O.dialog.blocking; i++) O.dialog.key('z');
			return { before, said, after: O.world.isPassable(8, 25), v: O.world.gridAt(8, 25), obj: !!O.items.fieldObjAt(8, 25) };
		});
		A(!r.before && /CUT down/.test(r.said) && r.after && !r.obj && r.v === 4, '2. CUT: the tree is gone and the path open, even when another dialog replaced the message', JSON.stringify(r));
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
