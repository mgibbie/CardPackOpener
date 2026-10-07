// battle_turns_test.mjs — four tester reports against the overworld battle engine
// (2026-10-06/07, Instinct + Remy), each driven through the real battle code.
//
//   1. FALSE SWIPE knocked out (Bugsy's Scyther, 4 KOs): it — and HOLD BACK —
//      must always leave the target at 1 HP, crits included.
//   2. A failed ball throw skipped the turn: no turn counter (TIMER BALL never
//      grew), no end-of-turn pass (screens never expired, burn never chipped).
//      Same for a failed run. A stale flinch (the second mover's Bite lands
//      after endOfTurn cleared flinches) used to cost the NEXT turn's move.
//   3. A double paid a fainted primary foe's EXP again at every end of turn
//      (endOfTurn queued the singles checkFaints, which has no faintCounted).
//   4. An evolution (Rare Candy) didn't register the new species in the dex
//      until a reload.
//
//   node overworld/tests/battle_turns_test.mjs
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
const PORT = 9265;
const STATE = { username: 'turns', friendCode: 'TURNS1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
		O.battle.pushMsg = (text, fn) => { if (text) window.__msgs.push(text); return orig(text, fn); };
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

	// ===== 1. FALSE SWIPE / HOLD BACK leave 1 HP =====
	for (const id of ['falseswipe', 'holdback']) {
		const s = await start('scyther', 90, false);
		A(s.foe === 'scyther' && !s.double, `${id}: setup, a wild Lv90 SCYTHER (single)`, JSON.stringify(s));
		const hp = [];
		for (let t = 0; t < 4; t++) {
			await page.evaluate(new Function(`const a = window.__ow.battle.active; a.foe.moves = [${mv(id)}]; a.me.curHP = ${t % 2 ? 1 : 3}; window.__msgs = [];
				window.__ow.battle.startQueue(() => window.__ow.battle.resolveTurn(${mv('growl')}));`));
			await drain();
			hp.push(await page.evaluate(() => ({ hp: window.__ow.battle.active?.me.curHP, used: window.__msgs.some(l => /used (False Swipe|Hold Back)/.test(l)), missed: window.__msgs.some(l => /missed|avoided/.test(l)), lines: window.__msgs.slice(-4) })));
		}
		A(hp.every(h => h.used), `${id}: the foe used it every turn`, JSON.stringify(hp));
		A(hp.every(h => h.hp === 1), `${id} never knocks out — the target is left at exactly 1 HP (from 3 HP and from 1 HP)`, JSON.stringify(hp));
		await end();
	}

	// ===== 2. a failed ball / a failed run spends a full turn =====
	{
		await start('zapdos', 70, false);
		const r = await page.evaluate(async () => {
			const b = window.__ow.battle, a = b.active;
			a.foe.moves = [{ id: 'splash', name: 'Splash', pp: 40, maxPp: 40 }];
			a.foe.status = 'brn';
			const t0 = a.turnCount || 0, hp0 = a.foe.curHP;
			window.__msgs = [];
			const realRandom = Math.random; Math.random = () => 0.999999;   // every shake fails
			try { b.useItem('pokeball'); } finally { Math.random = realRandom; }
			return { t0, hp0 };
		});
		await drain();
		const after = await page.evaluate(() => { const a = window.__ow.battle.active; return { t: a.turnCount || 0, hp: a.foe.curHP, lines: window.__msgs.slice() }; });
		A(after.lines.some(l => /broke free/.test(l)), 'ball: setup, the throw fails ("broke free")', JSON.stringify(after.lines));
		A(after.t === r.t0 + 1, 'a failed throw advances the turn counter (TIMER BALL grows, QUICK BALL is no longer "first turn")', `${r.t0} -> ${after.t}`);
		A(after.lines.some(l => /hurt by its burn/.test(l)) && after.hp < r.hp0, '...and runs the end-of-turn pass (the burned foe takes its chip)', JSON.stringify(after.lines));
		// a stale flinch from the previous turn never costs this turn's move
		await page.evaluate(new Function(`const a = window.__ow.battle.active; a.foe.status = null; a.foe.flinched = true; a.foe.moves = [${mv('growl')}]; window.__msgs = [];
			window.__ow.battle.startQueue(() => window.__ow.battle.resolveTurn(${mv('growl')}));`));
		await drain();
		const fl = await page.evaluate(() => window.__msgs.slice());
		A(!fl.some(l => /flinched/.test(l)) && fl.some(l => /ZAPDOS used Growl/.test(l)), 'a flinch left over from the previous turn is cleared when the next turn begins', JSON.stringify(fl));
		// a failed run, too
		const r2 = await page.evaluate(async () => {
			const b = window.__ow.battle, a = b.active;
			a.foe.status = 'brn'; a.me.stats.spe = 1; a.foe.stats.spe = 999;
			const t0 = a.turnCount || 0, hp0 = a.foe.curHP;
			window.__msgs = [];
			const realRandom = Math.random; Math.random = () => 0.999999;
			try { b.startQueue(() => b.tryRun()); } finally { Math.random = realRandom; }
			return { t0, hp0 };
		});
		await drain();
		const ra = await page.evaluate(() => { const a = window.__ow.battle.active; return { t: a?.turnCount || 0, hp: a?.foe.curHP, lines: window.__msgs.slice() }; });
		A(ra.lines.includes("Can't escape!") && ra.t === r2.t0 + 1 && ra.lines.some(l => /hurt by its burn/.test(l)),
			'a failed run spends a full turn too (counter + end-of-turn pass)', JSON.stringify(ra));
		await end();
	}

	// ===== 3. a double never re-pays a fainted primary foe's EXP =====
	{
		const s = await start('zigzagoon', 20, true);
		A(s.double, 'doubles: setup, a wild double', JSON.stringify(s));
		const r = await page.evaluate(async () => {
			const b = window.__ow.battle, a = b.active;
			let awards = [];
			const orig = b.awardExp.bind(b);
			b.awardExp = (mon, n) => { awards.push(n); return orig(mon, n); };
			a.foe.curHP = 0;               // the primary foe is down, its partner lives on
			b.startQueue(() => b.checkFaintsD());
			for (let i = 0; i < 400 && a.queue.length; i++) { b.update(0.1); await new Promise(r => setTimeout(r, 2)); }
			const first = awards.length;
			// three more ends of turn with the dead foe still in its slot
			for (let t = 0; t < 3; t++) {
				b.startQueue(() => b.endOfTurn());
				for (let i = 0; i < 400 && b.active && a.queue.length; i++) { b.update(0.1); await new Promise(r => setTimeout(r, 2)); }
			}
			return { first, total: awards.length, foeAlly: a.foeAlly?.curHP };
		});
		A(r.first > 0, 'doubles: the fainted foe pays its EXP once', JSON.stringify(r));
		A(r.total === r.first, '...and never again at later ends of turn (it used to pay every turn)', JSON.stringify(r));
		await end();
	}

	// ===== 4. an evolution registers the evolved species in the dex at once =====
	{
		const r = await page.evaluate(async () => {
			const B = await import('./battle.js'), S = (await import('./ow_state.js')).S, Dex = await import('./pokedex.js'), O = window.__ow;
			const mon = B.buildMon('venonat', 31, O.battle.data);
			S.party = [mon];
			const before = Dex.isCaught('venomoth');
			await O.evolution.check(S.party, O.battle.data);
			// next() awaits the sprites before the scene starts: pump until it has run its course
			for (let i = 0; i < 400 && (mon.speciesId !== 'venomoth' || O.evolution.blocking); i++) { O.evolution.update(0.1); await new Promise(r => setTimeout(r, 10)); }
			const stored = JSON.parse(localStorage.getItem('magepunk_dex_v1') || '{}');
			return { before, species: mon.speciesId, caught: Dex.isCaught('venomoth'), seen: Dex.isSeen('venomoth'), stored: (stored.caught || []).includes('venomoth') };
		});
		A(!r.before && r.species === 'venomoth', 'evolution: setup, a Lv31 VENONAT evolves into VENOMOTH', JSON.stringify(r));
		A(r.caught && r.seen, '...and VENOMOTH is seen + caught in the POKeDEX right away (no reload)', JSON.stringify(r));
		A(r.stored, '...and saved that way', JSON.stringify(r));
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
