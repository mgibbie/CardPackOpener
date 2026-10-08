// battle_faint_order_test.mjs — 2026-10-08 tester reports (Instinct) against the
// overworld battle engine: a fainted mon must never act, heal, or level back to life.
//
//   1. Dry Skin in rain revived a mon the second mover had just KO'd (0 -> 13 HP,
//      back to the menu): endOfTurn + checkFaints were queued BEFORE the second
//      move's damage (the queue only appends). Same for the foe's free move after
//      an item / ball / failed run.
//   2. Doubles: a foe KO'd by a faster attack still used its queued move (Clefairy
//      at 0 HP used Metronome) — every action was queued before any damage landed.
//   3. Simultaneous KO (Self-Destruct): the fainted lead was paid EXP and its
//      level-up added the max-HP growth to 0 HP — fainted, switched out, saved at 3 HP.
//   4. Snore (and Sleep Talk) worked while awake, including on the turn the user woke.
//   5. A caught Sudowoodo kept Mimic's copied move (and the mimicSlot marker).
//
// Lines are recorded when they are SHOWN (a dropped entry never shows).
//
//   node overworld/tests/battle_faint_order_test.mjs
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
const PORT = 9320;
const STATE = { username: 'faints', friendCode: 'FAINT1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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

	// record every battle line; a sturdy lead
	await page.evaluate(async () => {
		const B = await import('./battle.js'), S = (await import('./ow_state.js')).S, O = window.__ow;
		S.party = [B.buildMon('swampert', 60, O.battle.data), B.buildMon('pelipper', 60, O.battle.data)];
		window.__msgs = [];
		const orig = O.battle.pushMsg.bind(O.battle);
		O.battle.pushMsg = (text, fn, ifAlive) => orig(text, text ? () => { window.__msgs.push(text); fn?.(); } : fn, ifAlive);
	});
	const mv = id => `({ id: '${id}', name: window.__ow.battle.data.moves['${id}']?.name || '${id}', pp: 40, maxPp: 40 })`;
	const start = (id, level, dbl) => page.evaluate(async (id, level, dbl) => {
		const P = await import('./ow_places.js');
		// a fresh, healthy party for every section (a KO in one must not end the next)
		const B = await import('./battle.js'), S = (await import('./ow_state.js')).S, O = window.__ow;
		if (O.battle.active) { O.battle.finish('escaped'); for (let i = 0; i < 200 && O.battle.active; i++) { O.battle.update(0.1); await new Promise(r => setTimeout(r, 10)); } }
		S.party = [B.buildMon('swampert', 60, O.battle.data), B.buildMon('pelipper', 60, O.battle.data)];
		const realRandom = Math.random; Math.random = () => 0.5;   // no RANSEI rift roll
		try { P.startWildBattle({ id, level }, dbl); } finally { Math.random = realRandom; }
		for (let i = 0; i < 100 && !window.__ow.battle.active; i++) await new Promise(r => setTimeout(r, 50));
		const a = window.__ow.battle.active;
		return { foe: a?.foe?.speciesId, double: !!a?.double };
	}, id, level, dbl);
	const drain = () => page.evaluate(async () => {
		const b = window.__ow.battle;
		for (let i = 0; i < 600 && b.active && b.active.queue.length; i++) { b.update(0.1); await new Promise(r => setTimeout(r, 2)); }
		return !!b.active;
	});
	const end = () => page.evaluate(async () => { const b = window.__ow.battle; if (!b.active) return true; b.finish('escaped'); for (let i = 0; i < 200 && b.active; i++) { b.update(0.1); await new Promise(r => setTimeout(r, 10)); } return !b.active; });

	// ===== 1. Dry Skin in rain never lifts a mon the second hit KO'd =====
	for (const kind of ['turn', 'freeMove']) {
		await start('zigzagoon', 50, false);
		await page.evaluate(new Function(`const b = window.__ow.battle, a = b.active; window.__lead = a.me;
			a.me.ability = 'dryskin'; a.me.curHP = 3; a.me.stats.spe = 999; a.foe.stats.spe = 1;
			a.weather = { kind: 'rain', turns: 5 }; a.foe.moves = [${mv('psychic')}]; window.__msgs = [];
			const realRandom = Math.random; Math.random = () => 0.5;
			try { if ('${kind}' === 'turn') b.startQueue(() => b.resolveTurn(${mv('growl')})); else b.startQueue(() => b.foeFreeMove()); } finally { Math.random = realRandom; }`));
		await drain();
		const r = await page.evaluate(() => ({ hp: window.__lead.curHP, lines: window.__msgs.slice(), leadOut: window.__ow.battle.active?.me !== window.__lead }));
		A(r.lines.some(l => /used Psychic/.test(l)), `dry skin (${kind}): setup, the slower foe's Psychic lands on the 3-HP lead`, JSON.stringify(r.lines));
		A(r.hp === 0 && !r.lines.some(l => /Dry Skin drank the rain/.test(l)), `dry skin (${kind}): the KO'd lead stays at 0 HP — no rain healing after the lethal hit`, JSON.stringify(r));
		A(r.lines.some(l => /SWAMPERT fainted!/.test(l)) && r.leadOut, `dry skin (${kind}): ...it faints and is replaced`, JSON.stringify(r));
		await end();
	}

	// ===== 2. doubles: a foe KO'd before its turn loses its move =====
	{
		const s = await start('zigzagoon', 20, true);
		A(s.double, 'doubles: setup, a wild double', JSON.stringify(s));
		await page.evaluate(new Function(`const b = window.__ow.battle, a = b.active;
			a.foe.curHP = 1; a.foe.moves = [${mv('sandattack')}]; a.foe.stats.spe = 1;
			a.foeAlly.moves = [${mv('splash')}]; a.foeAlly.stats.spe = 2;
			a.me.stats.spe = 999; a.meAlly.stats.spe = 998; window.__msgs = [];
			a.plans = [{ user: a.me, boosts: b.boostsOf(a.me), move: ${mv('tackle')}, target: a.foe },
				{ user: a.meAlly, boosts: b.boostsOf(a.meAlly), move: ${mv('growl')}, target: a.foeAlly }];
			const realRandom = Math.random; Math.random = () => 0.5;
			try { b.startQueue(() => b.resolveDoubleTurn()); } finally { Math.random = realRandom; }`));
		await drain();
		const r = await page.evaluate(() => ({ lines: window.__msgs.slice() }));
		A(r.lines.some(l => /used Tackle/.test(l)) && r.lines.some(l => /fainted!/.test(l)), 'doubles: setup, the faster Tackle KOs the 1-HP foe', JSON.stringify(r.lines));
		A(!r.lines.some(l => /used Sand Attack/.test(l)), "doubles: the KO'd foe never uses its queued move", JSON.stringify(r.lines));
		A(r.lines.some(l => /used Splash/.test(l)), '...while its standing partner still acts', JSON.stringify(r.lines));
		await end();
	}

	// ===== 3. simultaneous KO: no EXP, no level-up HP for the fainted lead =====
	{
		await start('zigzagoon', 60, false);
		const r = await page.evaluate(async () => {
			const b = window.__ow.battle, a = b.active, lead = a.me;
			const exp0 = lead.exp ?? 0;
			lead.exp = exp0;
			a.me.curHP = 0; a.foe.curHP = 0; window.__msgs = [];
			b.startQueue(() => b.checkFaints());
			for (let i = 0; i < 800 && b.active && a.queue.length; i++) { b.update(0.1); await new Promise(r => setTimeout(r, 2)); }
			return { hp: lead.curHP, exp: lead.exp, exp0, lines: window.__msgs.slice() };
		});
		A(r.lines.some(l => /ZIGZAGOON fainted!/.test(l)), 'simultaneous KO: setup, both sides at 0 HP; the foe faints (a wild battle then ends)', JSON.stringify(r.lines));
		A(r.exp === r.exp0 && !r.lines.some(l => /SWAMPERT gained/.test(l)), 'simultaneous KO: the fainted lead earns no EXP', JSON.stringify(r));
		A(r.hp === 0, '...and stays at 0 HP (it used to level up back to 3 HP)', JSON.stringify(r));
		await end();
	}
	// the level-up itself never lifts a 0-HP mon
	{
		await start('zigzagoon', 10, false);
		const r = await page.evaluate(async () => {
			const b = window.__ow.battle, a = b.active;
			const B = await import('./battle.js');
			const mon = B.buildMon('wingull', 5, b.data);   // well under any level cap
			a.party.push(mon);
			mon.curHP = 0;
			const lv0 = mon.level;
			b.startQueue(() => b.awardExp(mon, 500));
			for (let i = 0; i < 800 && b.active && a.queue.length; i++) { b.update(0.1); await new Promise(r => setTimeout(r, 2)); }
			return { lv0, lv: mon.level, hp: mon.curHP };
		});
		A(r.lv > r.lv0 && r.hp === 0, 'a level-up adds max-HP growth only to a standing mon: 0 HP stays 0', JSON.stringify(r));
		await end();
	}

	// ===== 4. Snore / Sleep Talk only while asleep =====
	for (const [label, status, turns, expectFail] of [['awake', null, 0, true], ['wakes this turn', 'slp', 1, true], ['asleep', 'slp', 4, false]]) {
		await start('snorlax', 30, false);
		await page.evaluate(new Function(`const b = window.__ow.battle, a = b.active;
			a.foe.status = ${status ? "'" + status + "'" : 'null'}; a.foe.sleepTurns = ${turns}; a.foe.ability = 'gluttony';
			a.foe.moves = [${mv('snore')}]; a.foe.stats.spe = 1; a.me.stats.spe = 999;
			window.__hp0 = a.me.curHP; window.__msgs = [];
			const realRandom = Math.random; Math.random = () => 0.5;
			try { b.startQueue(() => b.resolveTurn(${mv('growl')})); } finally { Math.random = realRandom; }`));
		await drain();
		const o = await page.evaluate(() => ({ hp0: window.__hp0, hp: window.__ow.battle.active?.me.curHP, lines: window.__msgs.slice() }));
		if (expectFail) A(o.lines.some(l => /used Snore/.test(l)) && o.lines.includes('But it failed!') && o.hp === o.hp0, `snore (${label}): fails, no damage`, JSON.stringify(o));
		else A(o.hp < o.hp0, `snore (${label}): still works while the user sleeps`, JSON.stringify(o));
		await end();
	}
	{
		await start('snorlax', 30, false);
		await page.evaluate(new Function(`const b = window.__ow.battle, a = b.active;
			a.foe.status = null; a.foe.moves = [${mv('sleeptalk')}, ${mv('bodyslam')}]; a.foe.stats.spe = 1; a.me.stats.spe = 999;
			const st = a.foe.moves[0]; b.chooseFoeMove = () => st;   // it picks Sleep Talk
			window.__hp0 = a.me.curHP; window.__msgs = [];
			b.startQueue(() => b.resolveTurn(${mv('growl')}));`));
		await drain();
		const r = await page.evaluate(() => { const b = window.__ow.battle; delete b.chooseFoeMove; return { hp0: window.__hp0, hp: b.active?.me.curHP, lines: window.__msgs.slice() }; });
		A(r.lines.some(l => /used Sleep Talk/.test(l)) && r.lines.includes('But it failed!') && !r.lines.some(l => /Body Slam/.test(l)) && r.hp === r.hp0,
			'sleep talk awake: fails too (never calls the Body Slam it knows)', JSON.stringify(r));
		await end();
	}

	// ===== 5. a caught mon leaves battle without Mimic's copied move =====
	{
		await start('sudowoodo', 20, false);
		const r = await page.evaluate(async () => {
			const b = window.__ow.battle, a = b.active, foe = a.foe;
			const orig = foe.moves[0];
			foe.mimicSlot = { idx: 0, orig };
			foe.moves[0] = { id: 'sleeppowder', name: 'Sleep Powder', pp: 5, maxPp: 5 };
			a.caughtMon = foe;
			b.finish('caught');
			for (let i = 0; i < 200 && b.active; i++) { b.update(0.1); await new Promise(r => setTimeout(r, 10)); }
			const c = b.lastCaught;
			return { orig: orig.id, now: c?.moves[0]?.id, marker: !!c?.mimicSlot, same: c === foe };
		});
		A(r.same, 'mimic: setup, the battle hands the caught mon out as lastCaught', JSON.stringify(r));
		A(r.now === r.orig && !r.marker, "mimic: the caught mon's moveset is restored (Mimic back, no Sleep Powder, no mimicSlot)", JSON.stringify(r));
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
