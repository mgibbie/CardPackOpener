// hydrate_diag_test.mjs — when an adopted save can't be written, the report says
// WHICH key and WHY.
//
// 2026-10-03: the error rollup showed "hydrate could not reload (stuck=false,
// reloads=0)" from #648's fallback — some adopted key didn't land in storage,
// but nothing said which, or whether it was a full quota or a paused tab (whose
// writes the one-tab lock drops on purpose). The report now names the keys and
// the reason, and a paused tab isn't reported as an error at all.
//   1. a write that throws QuotaExceededError while adopting the server's save:
//      the page does NOT reload-loop, and the beacon names the key + the error
//
//   node overworld/tests/hydrate_diag_test.mjs
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
const PORT = 9219;
const STATE = { username: 'hydiag', friendCode: 'HYDG01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = name => ({ speciesId: name, name: name.toUpperCase(), level: 20, types: ['Normal'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
	stats: { hp: 60, atk: 30, def: 30, spa: 30, spd: 30, spe: 30 }, maxHP: 60, curHP: 60, exp: 8000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's16.png', num: 16 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// the server is AHEAD (rev 200) with a different party and more money
const REMOTE = { magepunk_region: 'kanto', magepunk_party_v1: JSON.stringify([mon('pidgeot')]), magepunk_money: '9999', magepunk_ow_rev: '200', magepunk_playtime: '5000',
	magepunk_story: JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }),
	magepunk_pos_v1: JSON.stringify({ map: 'PalletTown', x: 10, y: 10, back: null }) };
const errs = []; let loads = 0;
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		res.writeHead(200, { 'content-type': 'application/json' });
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		if (b.action === 'err') { errs.push(b.msg); return res.end('{"ok":true}'); }
		if (b.action === 'ow-load') { loads++; return res.end(JSON.stringify({ ow: { ow: REMOTE, updated_at: Date.now() } })); }
		if (b.action === 'ow-save') return res.end('{"ok":true}');
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
	const pageErrors = []; page.on('pageerror', e => pageErrors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party) => {
		if (!sessionStorage.getItem('seeded')) {
			sessionStorage.setItem('seeded', '1');
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto'); localStorage.setItem('magepunk_money', '100'); localStorage.setItem('magepunk_ow_rev', '100');
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		}
		// the party write fails as a full storage quota would
		const orig = Storage.prototype.setItem;
		Storage.prototype.setItem = function (k, v) {
			if (k === 'magepunk_party_v1' && v.includes('pidgeot')) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
			return orig.call(this, k, v);
		};
	}, STATE, [mon('rattata')]);
	await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 200 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false)); i++) await sleep(100);
	await sleep(3000);

	A(loads <= 3, '1. a write that can\'t land does not reload-loop the page', `ow-load calls: ${loads}`);
	const m = errs.find(x => /hydrate could not reload/.test(x));
	A(!!m, '1. the fallback reports itself', JSON.stringify(errs));
	A(m && /magepunk_party_v1/.test(m) && /QuotaExceededError/.test(m), '1. ...naming the key that failed and the reason (a full quota)', m);
	A(pageErrors.length === 0, 'no page errors', JSON.stringify(pageErrors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
