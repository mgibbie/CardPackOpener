// import_stale_test.mjs — a repair file built from an OLD save is refused.
//
// The playtester repairs (a story restore, a junk-item cleanup) are save files
// built from the server copy at one revision. If the tester plays before
// importing, the file is stale: importing it would silently undo that play
// (2026-10-01: Instinct kept playing past two cleanup files). Such files now
// carry `baseRev`; importSave refuses when the server has moved past it.
//   1. server ahead of baseRev -> stage 'stale', NOTHING changed, nothing pushed
//   2. server at baseRev -> imports normally (and reads back)
//   3. opts.allowStale overrides the refusal
//   4. a file without baseRev (a normal export) imports exactly as before
//
//   node overworld/tests/import_stale_test.mjs
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
const PORT = 9200;
const STATE = { username: 'stale', friendCode: 'STALE1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

let DB = null, pushes = 0;
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: DB }));
		if (b.action === 'ow-save') { pushes++; DB = { ow: b.ow, updated_at: Date.now() }; return res.end('{"ok":true}'); }
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream' }); res.end(d);
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
		localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'KANTO'); localStorage.setItem('magepunk_money', '500');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'pikachu', name: 'PIKA', level: 5, types: ['Electric'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 }, stats: { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 }, maxHP: 20, curHP: 20, exp: 125, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's25.png', num: 25 }]));
		localStorage.setItem('magepunk_ow_rev', '100');
	}, STATE);
	const boot = async () => { for (let i = 0; i < 300 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false)); i++) await sleep(100); await sleep(1200); };
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
	await boot();
	// a repair file: the current game with money changed, built from rev 100
	const doc = await page.evaluate(async () => { const S = await import('./savefile.js'); const d = S.buildSave(); d.keys.magepunk_money = '9999'; d.keys.magepunk_ow_rev = '100'; d.baseRev = 100; return d; });
	await page.evaluate(() => window.__ow.pushOwForTest());
	await sleep(300);
	const pushed0 = pushes;

	// 1. the tester played on: the server is at 107
	DB = { ow: { ...DB.ow, magepunk_ow_rev: '107', magepunk_money: '750' }, updated_at: Date.now() };
	const r1 = await page.evaluate(d => window.__ow.importSave(d, { reload: false }), doc);
	A(r1.ok === false && r1.stage === 'stale' && r1.baseRev === 100 && r1.serverRevBefore === 107, 'a file built from rev 100 is refused when the save is at 107', JSON.stringify(r1));
	A(/moved on to 107/.test(r1.error || '') && /nothing was changed/i.test(r1.error || ''), '...with a message saying why and that nothing changed', r1.error);
	A(await page.evaluate(() => localStorage.getItem('magepunk_money')) === '500' && pushes === pushed0 && DB.ow.magepunk_money === '750', '...and nothing was applied locally or pushed', JSON.stringify({ money: await page.evaluate(() => localStorage.getItem('magepunk_money')), pushes: pushes - pushed0 }));

	// 3. allowStale overrides
	const r3 = await page.evaluate(d => window.__ow.importSave(d, { reload: false, allowStale: true }), doc);
	A(r3.ok === true && r3.appliedRev === 108, 'allowStale imports it anyway (above the server, rev 108)', JSON.stringify({ ok: r3.ok, stage: r3.stage, appliedRev: r3.appliedRev }));

	// 2. server at baseRev
	DB = { ow: { ...DB.ow, magepunk_ow_rev: '200' }, updated_at: Date.now() };
	const fresh = { ...doc, baseRev: 200, keys: { ...doc.keys, magepunk_ow_rev: '200', magepunk_money: '4242' } };
	const r2 = await page.evaluate(d => window.__ow.importSave(d, { reload: false }), fresh);
	A(r2.ok === true && r2.stage === 'done' && DB.ow.magepunk_money === '4242', 'a file built from the CURRENT revision imports and reads back', JSON.stringify({ ok: r2.ok, stage: r2.stage, err: r2.error }));

	// 5. basePlaytime: a newer revision WITHOUT real play (loading the game pushes a
	//    save) is not stale; the same with 10 minutes of play is
	DB = { ow: { ...DB.ow, magepunk_ow_rev: '301', magepunk_playtime: '5030' }, updated_at: Date.now() };
	const timed = { ...doc, baseRev: 300, basePlaytime: 5000, keys: { ...doc.keys, magepunk_ow_rev: '300', magepunk_money: '3030' } };
	const r5 = await page.evaluate(d => window.__ow.importSave(d, { reload: false }), timed);
	A(r5.ok === true, 'rev 300 -> 301 with 30 s more playtime (just loading the game): imports', JSON.stringify({ ok: r5.ok, stage: r5.stage, err: r5.error }));
	DB = { ow: { ...DB.ow, magepunk_ow_rev: '320', magepunk_playtime: '5600' }, updated_at: Date.now() };
	const r6 = await page.evaluate(d => window.__ow.importSave(d, { reload: false }), timed);
	A(r6.ok === false && r6.stage === 'stale', 'rev 300 -> 320 with 10 minutes more playtime: stale, refused', JSON.stringify({ ok: r6.ok, stage: r6.stage }));

	// 4. no baseRev: unchanged behaviour
	DB = { ow: { ...DB.ow, magepunk_ow_rev: '900' }, updated_at: Date.now() };
	const plain = { ...doc, keys: { ...doc.keys, magepunk_money: '1234' } }; delete plain.baseRev;
	const r4 = await page.evaluate(d => window.__ow.importSave(d, { reload: false }), plain);
	A(r4.ok === true && r4.appliedRev === 901, 'an ordinary export (no baseRev) imports exactly as before, above the server', JSON.stringify({ ok: r4.ok, appliedRev: r4.appliedRev }));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
