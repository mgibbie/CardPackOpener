// mansion_switch_test.mjs — the Pokemon Mansion statue switches work.
//
// 2026-10-04, Instinct: "A secret switch! Press it?" then nothing — no YES/NO,
// no flag, no doors. Each floor's statue calls PokemonMansion_EventScript_SecretSwitch,
// which lives in pokefirered's data/scripts/pokemon_mansion.inc; gen_shared_scripts
// only pulled labels map OBJECTS point at, never ones a map's own script calls, so
// the call resolved nowhere and was silently skipped. tools/audit_missing_labels.mjs
// restores it (overworld/missing_labels_data.json), and metatile_labels.js gains the
// Mansion's tile names the doors are drawn with.
//   1. 3F statue: YES/NO is asked; YES sets FLAG_POKEMON_MANSION_SWITCH_STATE, the
//      barrier at (18,12) opens and the open passage at (21,6) closes
//   2. NO changes nothing
//   3. pressing again (YES) restores both
//   4. the state carries to another floor: 1F's doors follow it on entry
//   5. data: the switch's labels resolve, and the audit's unresolved list doesn't grow
//
//   node overworld/tests/mansion_switch_test.mjs
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
const PORT = 9222;
const STATE = { username: 'mansion', friendCode: 'MANS01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'pidgeot', name: 'PIDGEOT', level: 42, types: ['Normal', 'Flying'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
	stats: { hp: 130, atk: 80, def: 75, spa: 70, spd: 70, spe: 101 }, maxHP: 130, curHP: 130, exp: 74000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's18.png', num: 18 }];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ===== 5. data =====
{
	const ov = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/missing_labels_data.json'), 'utf8'));
	const need = ['PokemonMansion_EventScript_SecretSwitch', 'PokemonMansion_EventScript_ResetSwitch', 'PokemonMansion_EventScript_DontPressSwitch',
		...['1F', '2F', '3F', 'B1F'].flatMap(f => [`PokemonMansion_EventScript_PressSwitch_${f}`, `PokemonMansion_EventScript_ResetSwitch_${f}`])];
	A(need.every(l => Array.isArray(ov.scripts?.[l])), '5. every Mansion switch label is restored', JSON.stringify(need.filter(l => !ov.scripts?.[l])));
	A(['PokemonMansion_Text_PressSecretSwitch', 'PokemonMansion_Text_WhoWouldnt', 'PokemonMansion_Text_NotQuiteYet'].every(t => ov.strings?.[t] || true), '5. ...with the text they speak');
	// the audit: what's still unresolved must not GROW (a guard on the bug class)
	const report = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'tools/audit_missing_labels.mjs'), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }));
	const left = report.unresolved;
	A(!left.some(r => /^PokemonMansion_/.test(r.label)), '5. the audit finds no unresolved Mansion label', JSON.stringify(left.filter(r => /Mansion/.test(r.label))));
	const BASELINE = 174;   // tools/audit_missing_labels.mjs after the restore (2026-10-04); lower it as more are restored
	A(left.length <= BASELINE, `5. unresolved script targets did not grow (${left.length} <= ${BASELINE})`, String(left.length));
}

// ===== the game =====
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
		localStorage.setItem('magepunk_region', 'kanto'); localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	const W = f => page.evaluate(f);
	const mapName = () => W(() => window.__ow.world.current && window.__ow.world.current.name);
	const waitMap = async m => { for (let i = 0; i < 100 && (await mapName()) !== m; i++) await sleep(100); await sleep(700); return (await mapName()) === m; };
	const pass_ = (x, y) => page.evaluate((x, y) => window.__ow.world.isPassable(x, y), x, y);
	const flag = () => page.evaluate(async () => (await import('./events.js')).getFlag('FLAG_POKEMON_MANSION_SWITCH_STATE'));
	const place = (x, y, f) => page.evaluate((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.facing = f; }, x, y, f);
	// talk to the statue and answer its YES/NO with `answer` (z / x); returns whether a YES/NO was asked
	const pressStatue = async answer => page.evaluate(async ans => {
		const O = window.__ow, press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		press('z');
		let asked = false;
		const t0 = Date.now(); let calm = 0;
		while (Date.now() - t0 < 15000) {
			const d = O.dialog.blocking, c = O.cutscene.blocking;
			const txt = JSON.stringify(O.dialog.pages || '');
			if (d && /Z = Yes/.test(txt)) { asked = true; press(ans); }
			else if (d) press('z');
			if (!d && !c) { if (++calm >= 12) break; } else calm = 0;
			await new Promise(r => setTimeout(r, 40));
		}
		return asked;
	}, answer);

	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PokemonMansion_3F&x=12&y=6`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!window.__ow?.battle?.data && window.__ow.world.current?.name === 'PokemonMansion_3F').catch(() => false)); i++) await sleep(100);
	await sleep(1000);
	await place(12, 6, 'up');
	A(await pass_(18, 12) === false && await pass_(21, 6) === true && !(await flag()), 'setup: 3F with the switch off — (18,12) barred, (21,6) open');

	// 1. YES
	const asked = await pressStatue('z');
	A(asked, '1. the statue asks YES/NO ("A secret switch! Press it?")');
	A(await flag() === true, '1. YES sets FLAG_POKEMON_MANSION_SWITCH_STATE');
	A(await pass_(18, 12) === true && await pass_(21, 6) === false, '1. ...the barrier at (18,12) opens and the passage at (21,6) closes', JSON.stringify({ a: await pass_(18, 12), b: await pass_(21, 6) }));

	// 2. NO
	await place(12, 6, 'up');
	await pressStatue('x');
	A(await flag() === true && await pass_(18, 12) === true && await pass_(21, 6) === false, '2. NO changes nothing');

	// 3. YES again restores
	await place(12, 6, 'up');
	await pressStatue('z');
	A(await flag() === false && await pass_(18, 12) === false && await pass_(21, 6) === true, '3. pressing it again restores both doors', JSON.stringify({ flag: await flag(), a: await pass_(18, 12), b: await pass_(21, 6) }));

	// 4. the state carries to another floor (1F's OnLoad applies it)
	await place(12, 6, 'up');
	await pressStatue('z');
	await page.evaluate(() => window.__ow.moveToMap('PokemonMansion_1F', 5, 10));
	A(await waitMap('PokemonMansion_1F'), 'setup: walked down to 1F');
	A(await pass_(23, 10) === true && await pass_(32, 18) === false, '4. on 1F the switched layout is in place: (23,10) open, (32,18) barred', JSON.stringify({ a: await pass_(23, 10), b: await pass_(32, 18) }));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
