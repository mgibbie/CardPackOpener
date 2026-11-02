// cerulean_slowbro_hint_test.mjs — Cerulean's east-road SLOWBRO says what moves it
// (bug:1793176613457, 2026-10-28, remytest).
//
// FireRed's CeruleanCity_OnTransition parks the trainee's SLOWBRO and the lass on
// (26,31)/(27,31) — the only corridor to ROUTE 9 — until FLAG_GOT_SS_TICKET (BILL,
// Route 25). That is the cartridge's own gate, kept. But talking to the SLOWBRO only
// gave its random flavour line ("SLOWBRO ignored orders…"), so a player who arrived
// by portal and never met BILL had no way to know what would clear the road.
//   a) no S.S. TICKET: the SLOWBRO stands on (26,31), the road is shut, and talking
//      to it names BILL and the S.S. TICKET
//   b) with the S.S. TICKET: the SLOWBRO is back by its trainer and (26,31) is open
//
//   node overworld/tests/cerulean_slowbro_hint_test.mjs
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
const PORT = 9819;
const STATE = { username: 'ceruslow', friendCode: 'CSLW01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'pidgey', name: 'PIDGEY', level: 30, types: ['Normal', 'Flying'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
	stats: { hp: 90, atk: 45, def: 45, spa: 45, spd: 45, spe: 45 }, maxHP: 90, curHP: 90, exp: 27000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's16.png', num: 16 }];
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
	const errors = [];
	const boot = async flags => {
		const page = await browser.newPage();
		page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, party, flags) => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto'); localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: { KANTO: { boulder: true, cascade: true } }, champion: {} }));
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, ...flags }, vars: {} }));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		}, STATE, PARTY, flags);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=CeruleanCity&x=26&y=30`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await page.evaluate(() => !!window.__ow?.battle?.data && window.__ow.world.current?.name === 'CeruleanCity' && !window.__ow.gateReport().loading).catch(() => false)); i++) await sleep(100);
		await sleep(1000);
		for (let i = 0; i < 15 && await page.evaluate(() => window.__ow.dialog.blocking); i++) { await page.keyboard.press('z'); await sleep(250); }
		return page;
	};
	const look = page => page.evaluate(() => {
		const W = window.__ow;
		const slowbro = W.npcs.list.find(n => n.ev.local_id === 'LOCALID_CERULEAN_SLOWBRO');
		return { slowbro: slowbro ? [slowbro.tx, slowbro.ty] : null, me: [W.player.tx, W.player.ty] };
	});
	const talkDown = async page => {
		await page.evaluate(() => { window.__ow.player.facing = 'down'; window.__ow.interact(); });
		const seen = [];
		for (let i = 0; i < 30; i++) {
			const s = await page.evaluate(() => ({ dlg: window.__ow.dialog.blocking, cut: window.__ow.cutscene.blocking, text: (window.__ow.dialog.pages || []).map(p => p.join(' ')).join(' ') }));
			if (s.dlg) { if (seen[seen.length - 1] !== s.text) seen.push(s.text); await page.keyboard.press('z'); }
			else if (!s.cut && i > 2) break;
			await sleep(150);
		}
		return seen.join(' | ').replace(/\s+/g, ' ');
	};

	// ===== a) no S.S. TICKET =====
	{
		const page = await boot({});
		const l = await look(page);
		A(l.slowbro && l.slowbro[0] === 26 && l.slowbro[1] === 31, 'a) without the S.S. TICKET the SLOWBRO blocks (26,31) (the cartridge gate is kept)', JSON.stringify(l));
		const said = await talkDown(page);
		A(/BILL/.test(said) && /S\.S\. TICKET/.test(said), 'a) talking to it names BILL and the S.S. TICKET', said);
		await page.keyboard.down('ArrowDown'); await sleep(350); await page.keyboard.up('ArrowDown'); await sleep(500);
		A((await look(page)).me[1] === 30, 'a) ...and the step onto it is still refused', JSON.stringify(await look(page)));
		await page.close();
	}
	// ===== b) with the S.S. TICKET =====
	{
		const page = await boot({ FLAG_GOT_SS_TICKET: true });
		const l = await look(page);
		A(l.slowbro && !(l.slowbro[0] === 26 && l.slowbro[1] === 31), 'b) with the S.S. TICKET the SLOWBRO is back with its trainer', JSON.stringify(l));
		await page.keyboard.down('ArrowDown'); await sleep(350); await page.keyboard.up('ArrowDown'); await sleep(500);
		A((await look(page)).me[1] === 31, 'b) ...and (26,31) is walkable', JSON.stringify(await look(page)));
		await page.close();
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
