// crystal_local_labels_test.mjs — pokecrystal's colon-less local labels are real labels.
//
// rgbasm takes a local label with no colon (`.refused` alone on its line).
// Magepunk66's transpile_crystal.py only read `Label:` lines, so such a label's
// commands were folded into the label above and every jump to it named a label
// the map never had: events.js ran past the jump. 28 branch targets on 17 Crystal
// maps dangled (2026-10-07). tools/gen_crystal_scriptvar.mjs now splits every one
// out (crystal_scriptvar_data.json), with rgbasm's fall-through between pieces.
//   1. the audit (tools/audit_crystal_local_labels.mjs): no colon-less target dangles
//   2. Mr. POKeMON's RED SCALE: answering NO keeps the scale (it used to run past
//      `iffalse .refused` into the EXP. SHARE trade); YES still trades
//   3. SUNNY (Route 37, Sundays): a boy's path `sjump .next` reaches the MAGNET
//      (it dangled, so only a girl ever got one)
//
//   node overworld/tests/crystal_local_labels_test.mjs
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
const PORT = 9284;
const STATE = { username: 'locallabels', friendCode: 'LOCLAB', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,

}];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ===== 1. the audit =====
{
	const { execFileSync } = await import('child_process');
	const r = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'tools', 'audit_crystal_local_labels.mjs'), '--json'], { cwd: ROOT, maxBuffer: 1 << 26 }).toString());
	const left = r.maps.filter(m => m.colonless.length).map(m => m.stem + ': ' + m.colonless.join(' '));
	A(r.colonless === 0, '1. no branch on a Crystal map targets a missing colon-less local label', left.slice(0, 6).join(' | '));
	const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld', 'crystal_scriptvar_data.json'), 'utf8')).patches;
	for (const [stem, label] of [['MrPokemonsHouse', 'MrPokemonsHouse_MrPokemonScript.refused'], ['Route37', 'SunnyScript.next'],
		['BurnedTower1F', 'BurnedTowerRivalBattleScript.totodile'], ['GoldenrodDeptStore5F', 'GoldenrodDeptStore5FClerkScript.headbutt']])
		A(Array.isArray(P[stem]?.[label]), `1. ${stem}:${label} is its own label`);
}

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
	await page.evaluateOnNewDocument(() => { Date.prototype.getDay = function () { return 0; }; });   // SUNDAY: Sunny's day
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
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
	await boot('NewBarkTown');
	// run a label to its end; `answer` closes each dialog page ('z' = YES, 'x' = NO)
	await page.evaluate(() => {
		window.__drive = (label, answer = 'z') => {
			const ow = window.__ow;
			ow.cutscene.stop();
			ow.dialog.pages = null;
			ow.runScriptLabel(label);
			for (let i = 0; i < 4000 && ow.cutscene.blocking; i++) {
				ow.cutscene.update(1 / 60);
				if (ow.dialog.blocking) { ow.dialog.revealed = 1e9; ow.dialog.key(answer); }
			}
			return !ow.cutscene.blocking;
		};
	});

	// ===== 2. Mr. POKeMON's RED SCALE =====
	const scale = await page.evaluate(async () => {
		const ow = window.__ow;
		await ow.moveToMap('MrPokemonsHouse');
		ow.Bag.addItem('redscale', 1);
		const done = window.__drive('MrPokemonsHouse_MrPokemonScript', 'x');
		const no = { scale: ow.Bag.count('redscale'), share: ow.Bag.count('expshare'), done };
		window.__drive('MrPokemonsHouse_MrPokemonScript', 'z');
		return { no, yes: { scale: ow.Bag.count('redscale'), share: ow.Bag.count('expshare') } };
	});
	A(scale.no.done && scale.no.scale === 1 && scale.no.share === 0, '2. NO to Mr. POKeMON keeps the RED SCALE and gives no EXP. SHARE', JSON.stringify(scale));
	A(scale.yes.scale === 0 && scale.yes.share === 1, '2. YES trades the RED SCALE for the EXP. SHARE', JSON.stringify(scale));

	// ===== 3. SUNNY's MAGNET (a boy's path) =====
	const sunny = await page.evaluate(async () => {
		const ow = window.__ow;
		await ow.moveToMap('Route37');
		ow.Story.clearFlag('EVENT_GOT_MAGNET_FROM_SUNNY');
		ow.Story.clearFlag('ENGINE_PLAYER_IS_FEMALE');
		const before = ow.Bag.count('magnet');
		window.__drive('SunnyScript');
		return { before, after: ow.Bag.count('magnet'), flag: ow.Story.getFlag('EVENT_GOT_MAGNET_FROM_SUNNY'), weekday: ow.Story.getVar('VAR_WEEKDAY') };
	});
	A(sunny.after === sunny.before + 1 && sunny.flag, "3. Sunny's `sjump .next` reaches the MAGNET on a boy's Sunday", JSON.stringify(sunny));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
