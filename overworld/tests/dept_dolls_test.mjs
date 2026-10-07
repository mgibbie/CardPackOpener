// dept_dolls_test.mjs — the DOLL COUNTER in the Goldenrod Dept Store (dept_dolls.js).
//
// In pokecrystal MOM buys the CHARMANDER / CLEFAIRY / PIKACHU dolls and the BIG
// SNORLAX with your savings (data/items/mom_phone.asm). The port has no Bank of
// Mom, so a clerk at 4F's empty second counter spot sells them at Mom's prices:
//   1. the clerk is there (a service sprite, solid) and opens the counter menu
//   2. buying the PIKACHU DOLL with $10000 costs $8000 and sets EVENT_DECO_PIKACHU_DOLL
//   3. it is then SOLD OUT and can't be rebought
//   4. the BIG SNORLAX ($22800) is refused for want of money (flag stays unset)
//   5. the house PC's DECORATION menu now lists the PIKACHU DOLL under ORNAMENT
//
//   node overworld/tests/dept_dolls_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'/opt/chrome/chrome',
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9242;
const STATE = { username: 'hdoll', friendCode: 'HDOL01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'pidgeot', name: 'PIDGEOT', level: 40, types: ['Normal', 'Flying'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
	stats: { hp: 120, atk: 80, def: 75, spa: 70, spd: 70, spe: 101 }, maxHP: 120, curHP: 120, exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's18.png', num: 18 }];
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
		localStorage.setItem('magepunk_region', 'johto'); localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_name', 'KRIS');
		localStorage.setItem('magepunk_money', '10000');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, EVENT_DECO_BED_1: true, EVENT_DECO_POSTER_1: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	const W = f => page.evaluate(f);
	const MAP = 'GoldenrodDeptStore4F';
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${MAP}&x=12&y=6`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await W(() => !!(window.__ow?.battle?.data && window.__ow.world.current?.name === 'GoldenrodDeptStore4F')).catch(() => false)); i++) await sleep(100);
	await sleep(1500);

	const choice = () => page.evaluate(async () => { const { choiceMenu } = await import('./choice.js'); return choiceMenu.open ? { options: choiceMenu.options.slice(), prompt: choiceMenu.prompt } : null; });
	const dlg = () => W(() => window.__ow.dialog.blocking ? (window.__ow.dialog.pages || []).map(p => [].concat(p).join(' ')).join(' ') : null);
	// Z through text until a menu opens (or nothing is up); returns everything said
	const talk = async () => {
		let said = '';
		for (let i = 0; i < 20; i++) {
			if (await choice()) break;
			const d = await dlg();
			if (!d) break;
			said += d + ' ';
			await page.keyboard.press('z'); await sleep(150);
		}
		return said;
	};
	const pick = async re => {
		const c = await choice();
		const i = c ? c.options.findIndex(o => re.test(o)) : -1;
		if (i < 0) return false;
		await page.evaluate(async j => { (await import('./choice.js')).choiceMenu.idx = j; }, i);
		await page.keyboard.press('z'); await sleep(200);
		return true;
	};
	const flag = f => page.evaluate(async f => (await import('./events.js')).getFlag(f), f);
	const money = () => W(() => +localStorage.getItem('magepunk_money'));

	// ===== 1. the clerk =====
	const svc = await W(() => ({ kind: window.__ow.services.kindAt(13, 6), solid: window.__ow.services.blocks(13, 6), clerk: (window.__ow.services.spec?.sprites || []).some(s => s.img === 'clerk' && s.tx === 13 && s.ty === 6) }));
	A(svc.kind === 'dollcounter' && svc.solid && svc.clerk, '1. 4F has a solid clerk at the second counter spot (13,6)', JSON.stringify(svc));
	await page.evaluate(() => { const P = window.__ow.player; P.setTile(12, 6); P.facing = 'right'; });
	await page.keyboard.press('z'); await sleep(400);
	const hi = await talk();
	const menu = await choice();
	A(/DOLL COUNTER/.test(hi) && menu && menu.options.join('|') === 'CHARMANDER DOLL  $1800|CLEFAIRY DOLL  $4800|PIKACHU DOLL  $8000|BIG SNORLAX  $22800|CANCEL',
		"1. the counter offers MOM's four dolls at MOM's prices", JSON.stringify([hi, menu && menu.options]));

	// ===== 2. buy the PIKACHU DOLL =====
	await pick(/^PIKACHU DOLL/);
	const bought = await talk();
	A(/PIKACHU DOLL was sent to KRIS's room/.test(bought), "2. \"The PIKACHU DOLL was sent to KRIS's room!\"", bought);
	A(await money() === 2000, '2. the doll cost $8000 ($10000 -> $2000)', String(await money()));
	A(await flag('EVENT_DECO_PIKACHU_DOLL') === true, '2. EVENT_DECO_PIKACHU_DOLL is set (what MOM\'s purchase sets)');

	// ===== 3. SOLD OUT =====
	const after = await choice();
	A(after && after.options[2] === 'PIKACHU DOLL  SOLD OUT', '3. the PIKACHU DOLL now reads SOLD OUT', JSON.stringify(after && after.options));
	await pick(/^PIKACHU DOLL/);
	const again = await talk();
	A(/sold out/i.test(again) && await money() === 2000, "3. it can't be bought twice", again);

	// ===== 4. not enough money =====
	await pick(/^BIG SNORLAX/);
	const poor = await talk();
	A(/don't have enough money/.test(poor) && await money() === 2000 && await flag('EVENT_DECO_BIG_SNORLAX_DOLL') !== true,
		'4. the BIG SNORLAX ($22800) is refused with $2000; nothing changes', poor);
	await pick(/^CANCEL/);
	const bye = await talk();
	A(/come again/i.test(bye) && !(await choice()), '4. CANCEL closes the counter', bye);

	// ===== 5. the house PC lists it =====
	await page.evaluate(async () => { (await import('./decorations.js')).decorationMenu(() => {}); });
	await sleep(200);
	const cats = await choice();
	A(cats && cats.options.includes('ORNAMENT') && !cats.options.includes('BIG DOLL'), '5. DECORATION now has ORNAMENT (and no BIG DOLL, none bought)', JSON.stringify(cats && cats.options));
	await pick(/^ORNAMENT$/);
	await talk();
	const orn = await choice();
	A(orn && orn.options.includes('PIKACHU DOLL'), '5. ...listing the PIKACHU DOLL', JSON.stringify(orn && orn.options));

	A(!errors.length, 'no page errors', errors.join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
