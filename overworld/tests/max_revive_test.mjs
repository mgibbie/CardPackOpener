// max_revive_test.mjs — the overworld BAG's revives honour MAX REVIVE's full HP.
//
// 2026-10-07, Instinct's bug report (bug:1791396638655): out of battle, MAX REVIVE
// brought Venomoth back at half HP. ow_menukeys.js's party-picker revive branch
// set curHP = maxHP / 2 for every kind:'revive' item and ignored `full: true`
// (MAX REVIVE, REVIVAL HERB). battle.js already honoured it.
//   1. MAX REVIVE -> full HP, status cleared, one consumed
//   2. REVIVAL HERB -> full HP
//   3. REVIVE -> half HP (unchanged)
//
//   node overworld/tests/max_revive_test.mjs
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
const PORT = 9276;
const STATE = { username: 'maxrevive', friendCode: 'MAXREV', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
}, {
	speciesId: 'venomoth', name: 'VENOMOTH', level: 40, gender: 'F', friend: 70, types: ['Bug', 'Poison'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 168, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 168, curHP: 0, status: 'psn',
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's49.png', num: 49,
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
		localStorage.setItem('magepunk_region', 'JOHTO');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	const boot = async map => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route29&x=10&y=8`, { waitUntil: 'domcontentloaded' });
	await boot('Route29');
	// use one revive item on the fainted VENOMOTH through the bag's party picker
	const use = id => page.evaluate(async id => {
		const O = window.__ow, MK = await import('./ow_menukeys.js');
		const mon = O.party[1];
		mon.curHP = 0; mon.status = 'psn';
		O.Bag.addItem(id, 1);
		const before = O.Bag.count(id);
		const bm = MK.bagMenu;
		bm.open = true; bm.flash = null;
		bm.pocket = MK.BAG_POCKETS.findIndex(p => p.test(O.Bag.ITEMS[id], id));
		bm.idx = MK.bagEntries().findIndex(([e]) => e === id);
		bm.picking = true; bm.pickIdx = 1;
		MK.pressKey('z');
		const r = { hp: mon.curHP, max: mon.maxHP, status: mon.status, used: before - O.Bag.count(id), pocket: bm.pocket };
		bm.open = false; bm.picking = false;
		return r;
	}, id);
	const mx = await use('maxrevive');
	A(mx.used === 1 && mx.hp === mx.max && mx.status == null, '1. MAX REVIVE revives to FULL HP and is consumed', JSON.stringify(mx));
	const herb = await use('revivalherb');
	A(herb.used === 1 && herb.hp === herb.max, '2. REVIVAL HERB revives to FULL HP', JSON.stringify(herb));
	const rv = await use('revive');
	A(rv.used === 1 && rv.hp === Math.floor(rv.max / 2), '3. REVIVE still revives to half HP', JSON.stringify(rv));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
