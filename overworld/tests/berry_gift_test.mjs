// berry_gift_test.mjs — Route 114's daily berry man hands over a berry.
//
// 2026-10-05 (Instinct): "Too bad! The BAG is full..." and no berry, with three
// berries in the bag. His script is
//     random NUM_ROUTE_114_MAN_BERRIES
//     addvar VAR_RESULT, NUM_ROUTE_114_MAN_BERRIES_SKIPPED
//     addvar VAR_RESULT, FIRST_BERRY_INDEX
//     giveitem VAR_RESULT
// and none of the three symbols was in script_constants.js: `random` of a string
// gave 0, the addvars glued text onto VAR_RESULT, and `give` couldn't name the
// result, so VAR_RESULT came back FALSE -> "The BAG is full".
//   1. talking to him gives exactly one berry — one of his five (Razz/Bluk/Nanab/
//      Wepear/Pinap, items 148..152) — and sets FLAG_DAILY_ROUTE_114_RECEIVED_BERRY
//   2. talking again the same day gives nothing more
//   3. guard: no random/addvar/subvar operand that must be a number is newly
//      unresolved (tools/audit_unresolved_constants.mjs)
//
//   node overworld/tests/berry_gift_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9225;
const STATE = { username: 'berrygift', friendCode: 'BERY01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'pidgey', name: 'PIDGEY', level: 20, types: ['Normal', 'Flying'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
	stats: { hp: 60, atk: 30, def: 30, spa: 30, spd: 30, spe: 30 }, maxHP: 60, curHP: 60, exp: 8000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's16.png', num: 16 }];
// his five berries (pokeemerald items.h: FIRST/LAST_ROUTE_114_MAN_BERRY = RAZZ..PINAP)
const HIS_BERRIES = ['razzberry', 'blukberry', 'nanabberry', 'wepearberry', 'pinapberry'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ===== 3. the audit guard (static; runs first) =====
{
	const out = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'tools', 'audit_unresolved_constants.mjs'), '--json'], { cwd: ROOT }).toString());
	// the seven left are the Glass Workshop prices: its `subvar` was transpiled as
	// `addvar`, so resolving them would ADD ash instead of spending it
	A(out.numeric <= 7, `3. number-required operands that don't resolve: ${out.numeric} (allowed: the 7 Glass Workshop prices)`, JSON.stringify(out.numericSyms));
	A(!out.numericSyms.some(s => /ROUTE_114|BERRY_INDEX|BERRY_MASTER|KIRI/.test(s)), '3. the berry-gift constants all resolve');
}

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		res.writeHead(200, { 'content-type': 'application/json' });
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
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
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'hoenn'); localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		// Instinct's bag: three berries already in it (not full)
		localStorage.setItem('magepunk_bag_v1', JSON.stringify({ oranberry: 2, cheriberry: 1, potion: 3 }));
	}, STATE, PARTY);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route114&x=27&y=41`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.world.current?.name === 'Route114')).catch(() => false)); i++) await sleep(100);
	await sleep(1000);
	const bag = () => page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_bag_v1') || '{}'));
	const flag = () => page.evaluate(async () => (await import('./events.js')).getFlag('FLAG_DAILY_ROUTE_114_RECEIVED_BERRY'));
	// talk to him (27,42) from (27,41), then press Z through every message until the scene ends
	const talk = async () => {
		await page.evaluate(() => { const P = window.__ow.player; P.tx = 27; P.ty = 41; P.x = 27 * 16; P.y = 41 * 16; P.facing = 'down'; });
		await page.keyboard.press('z'); await sleep(150);
		return page.evaluate(async () => {
			const O = window.__ow, said = [];
			const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
			const t0 = Date.now(); let calm = 0;
			while (Date.now() - t0 < 15000) {
				const d = O.dialog.blocking, c = O.cutscene.blocking;
				if (!d && !c) { if (++calm >= 12) break; } else calm = 0;
				if (d) { said.push(JSON.stringify(O.dialog.pages || '')); press('z'); }
				await new Promise(r => setTimeout(r, 40));
			}
			return said.join(' | ');
		});
	};

	const before = await bag();
	const said1 = await talk();
	const after = await bag();
	const gained = Object.keys(after).filter(k => (after[k] || 0) > (before[k] || 0)).map(k => [k, after[k] - (before[k] || 0)]);
	A(/BERR/i.test(said1), 'setup: he talks about sharing a berry', said1.slice(0, 160));
	A(!/BAG is full/i.test(said1), '1. no false "The BAG is full"', said1.slice(0, 220));
	A(gained.length === 1 && gained[0][1] === 1 && HIS_BERRIES.includes(gained[0][0]), '1. exactly one berry, one of his five (Razz/Bluk/Nanab/Wepear/Pinap)', JSON.stringify(gained));
	A(await flag() === true, '1. ...and today\'s FLAG_DAILY_ROUTE_114_RECEIVED_BERRY is set');

	const said2 = await talk();
	const again = await bag();
	A(JSON.stringify(again) === JSON.stringify(after), '2. talking again the same day gives nothing more', JSON.stringify({ after, again, said2: said2.slice(0, 120) }));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
