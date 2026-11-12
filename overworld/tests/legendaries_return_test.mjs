// legendaries_return_test.mjs — a legendary you knocked out comes back at the Hall of Fame.
//
// Tester report (instinctgauntlet, 2026-11-12, bug:1794422580440): ZAPDOS was gone from the Power Plant with its
// encounter flag set and the POKeDEX saying it was never caught. A placed legendary that faints sets the same flag a
// catch does, so one knock-out lost it for the whole save. Owner, 2026-11-12: it comes back after the Hall of Fame.
//   1. before: ZAPDOS knocked out (flag set, not caught) is not at the Power Plant; ARTICUNO caught is not at Seafoam
//   2. entering the Hall of Fame: ZAPDOS's encounter is back (the flag is cleared, the journal says so); ARTICUNO,
//      caught, stays gone; MOLTRES, never met, is untouched
//   3. at the Power Plant ZAPDOS is there to be met again; a second Hall of Fame changes nothing more
//   4. knocked out again, it is gone again until the next Hall of Fame
//
//   node overworld/tests/legendaries_return_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const DATA = path.join(ROOT, 'overworld', 'data');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9452;
const STATE = { username: 'legback', friendCode: 'LEGBAK', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 70, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 220, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 220, curHP: 220,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
}];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		res.writeHead(200, { 'content-type': 'application/json' });
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
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
	await page.evaluateOnNewDocument((st, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'KANTO');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: { KANTO: { boulder: true, cascade: true, thunder: true, rainbow: true, soul: true, marsh: true, volcano: true, earth: true } }, champion: {} }));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	const W = (f, ...a) => page.evaluate(f, ...a);
	const pos = () => W(() => ({ map: window.__ow.world.current && window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty, cut: !!window.__ow.cutscene.blocking, dlg: !!window.__ow.dialog.blocking }));
	const boot = async map => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const settle = async (ms = 8000) => { const t0 = Date.now(); let p; while (Date.now() - t0 < ms) { p = await pos(); if (p.dlg) await page.keyboard.press('z'); else if (!p.cut) { await sleep(400); p = await pos(); if (!p.cut && !p.dlg) return p; } await sleep(120); } return pos(); };
	const waitMap = async (m, ms = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await pos()).map === m) return true; await sleep(100); } return false; };
	const walk = async (k, ms = 260) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(450); };

	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PowerPlant&x=5&y=38`, { waitUntil: 'domcontentloaded' });
	await boot('PowerPlant');
	const here = () => W(() => window.__ow.legendariesHere().map((e) => e.species));
	const st = () => W(() => ({ zap: !!window.__ow.Story.getFlag('legend_caught_zapdos'), art: !!window.__ow.Story.getFlag('legend_caught_articuno'), mol: !!window.__ow.Story.getFlag('legend_caught_moltres'), dexZ: window.__ow.Dex.isCaught('zapdos'), dexA: window.__ow.Dex.isCaught('articuno') }));
	A((await here()).includes('zapdos'), '0. (setup) on a fresh save ZAPDOS is at the Power Plant', JSON.stringify(await here()));
	// ZAPDOS knocked out (the flag a KO sets, nothing in the POKeDEX); ARTICUNO caught
	await W(() => { const o = window.__ow; o.Story.setFlag('legend_caught_zapdos'); o.Story.setFlag('legend_caught_articuno'); o.Dex.markSeen('zapdos'); o.Dex.markCaught('articuno'); });
	let s = await st();
	A(s.zap && !s.dexZ && s.art && s.dexA && !s.mol && !(await here()).includes('zapdos'), '1. ZAPDOS knocked out: its encounter is spent and it is not in the POKeDEX as caught (the report); it is not at the Power Plant', JSON.stringify(s));
	// the Hall of Fame
	const back = await W(() => window.__ow.returnFaintedLegendaries());
	s = await st();
	A(back.join() === 'zapdos' && !s.zap && s.art && !s.mol, '2. entering the Hall of Fame: ZAPDOS is back; ARTICUNO, caught, stays gone; MOLTRES, never met, is untouched', JSON.stringify([back, s]));
	A(await W(() => JSON.stringify(window.__ow.Journal ? window.__ow.Journal.list ? window.__ow.Journal.list() : window.__ow.Journal.entries || [] : (localStorage.getItem('magepunk_journal') || '')).includes('ZAPDOS has been seen again')) || await W(() => JSON.stringify(Object.values(localStorage)).includes('ZAPDOS has been seen again')), '2. ...and the journal says so');
	A((await here()).includes('zapdos'), '3. at the Power Plant ZAPDOS is there to be met again', JSON.stringify(await here()));
	A((await W(() => window.__ow.returnFaintedLegendaries())).length === 0, '3. a second Hall of Fame brings back nothing more');
	// the real path: closeHallOfFame is what every League's Hall of Fame runs
	await W(() => { window.__ow.Story.setFlag('legend_caught_zapdos'); });
	A(!(await here()).includes('zapdos'), '4. knocked out again: gone again');
	await W(() => window.__ow.closeHallOfFame('KANTO', false));
	await sleep(1500);
	A(!(await W(() => !!window.__ow.Story.getFlag('legend_caught_zapdos'))), '4. ...until the next Hall of Fame (the game\'s own Hall of Fame step brings it back)');
	A(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
