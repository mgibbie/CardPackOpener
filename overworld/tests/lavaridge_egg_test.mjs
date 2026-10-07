// lavaridge_egg_test.mjs — the Lavaridge egg woman hands over her WYNAUT EGG.
//
// pokeemerald's LavaridgeTown_EventScript_EggWoman runs `getpartysize` (refuse a
// full party) and `giveegg SPECIES_WYNAUT`; the transpile dropped both, so she set
// FLAG_RECEIVED_LAVARIDGE_EGG and gave nothing, and a full party was never turned
// away. tools/gen_multichoice.mjs now restores getpartysize + giveegg (also FRLG's
// Five Island Water Labyrinth TOGEPI egg, and the getpartysize checks of the Safari
// Zone gates, the Celadon prize counter and the Route 5 Day Care).
//   0. data: both restored, in the decomp's order
//   1. a full party: "There's no room for this EGG...", no flag, no egg
//   2. room in the party: YES -> the WYNAUT EGG arrives, the flag is set
//
//   node overworld/tests/lavaridge_egg_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9280;
const STATE = { username: 'lavaegg', friendCode: 'LAVEGG', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (id, name) => ({
	speciesId: id, name, level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
});
const PARTY = [mon('rattata', 'A')];
const BASE_FLAGS = { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ===== 0. data =====
{
	const mc = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld', 'multichoice_data.json'), 'utf8')).patches;
	const ops = (mc.LavaridgeTown?.LavaridgeTown_EventScript_EggWoman || []).map(o => o.op);
	const gp = ops.indexOf('getpartysize'), br = ops.indexOf('branch', gp), ge = ops.indexOf('giveegg');
	A(gp > 0 && br === gp + 1 && ge > br, '0. the egg woman gets getpartysize (right before her PARTY_SIZE check) and giveegg back', ops.join(','));
	const egg = (mc.LavaridgeTown?.LavaridgeTown_EventScript_EggWoman || []).find(o => o.op === 'giveegg');
	A(egg && egg.species === 'SPECIES_WYNAUT', '0. ...a WYNAUT egg', JSON.stringify(egg));
	const togepi = (mc.FiveIsland_WaterLabyrinth?.FiveIsland_WaterLabyrinth_EventScript_TryGiveEgg || []).map(o => o.op + (o.species ? ':' + o.species : ''));
	A(togepi[0] === 'getpartysize' && togepi.includes('giveegg:SPECIES_TOGEPI'), "0. FRLG Five Island's TOGEPI egg is restored the same way", togepi.join(','));
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
	await page.evaluateOnNewDocument(() => {
		const s = sessionStorage.getItem('stage');
		if (!s) return;
		sessionStorage.removeItem('stage');
		localStorage.clear();
		for (const [k, v] of Object.entries(JSON.parse(s))) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
	});
	const W = (f, ...a) => page.evaluate(f, ...a);
	const boot = async map => {
		for (let i = 0; i < 300 && !(await W(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const scene = async (map, x, y, f, { flags = {}, bag = { pokeball: 5 }, region = 'JOHTO', party = PARTY } = {}) => {
		const stage = {
			magepunk_mp_token_v1: 't', magepunk_mp_state_v1: STATE, magepunk_region: region, magepunk_name: 'KRIS',
			magepunk_party_v1: party, magepunk_bag_v1: bag,
			magepunk_story: { flags: { ...BASE_FLAGS, ...flags }, vars: {} },
			magepunk_settings: { textSpeed: 'instant', battleAnim: 'off' },
		};
		await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
		await W(s => sessionStorage.setItem('stage', s), JSON.stringify(stage));
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
		await boot(map);
		await W((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.px = x * 16; P.py = y * 16; P.facing = f; }, x, y, f);
	};
	const talk = () => W(async () => {
		const O = window.__ow, C = await import('./choice.js');
		const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		const seen = [];
		O.interact();
		const t0 = Date.now(); let calm = 0;
		while (Date.now() - t0 < 15000) {
			const d = O.dialog.blocking, c = O.cutscene.blocking;
			if (d && O.dialog.pages) { const p = O.dialog.pages.flat().join(' '); if (seen[seen.length - 1] !== p) seen.push(p); }
			if (C.choiceMenu.open || d) press('z');
			if (!d && !c && !C.choiceMenu.open) { if (++calm >= 15) break; } else calm = 0;
			await new Promise(r => setTimeout(r, 40));
		}
		return seen;
	});
	const egg = () => W(() => ({ egg: JSON.parse(localStorage.getItem('magepunk_daycare') || 'null')?.egg || null, flag: !!JSON.parse(localStorage.getItem('magepunk_story') || '{}').flags?.FLAG_RECEIVED_LAVARIDGE_EGG, party: window.__ow.party.length }));

	// ===== 1. a full party =====
	await scene('LavaridgeTown', 4, 8, 'up', { region: 'HOENN', party: Array.from({ length: 6 }, (_, i) => mon('rattata', 'R' + i)) });
	const full = await talk();
	const s1 = await egg();
	A(full.some(p => /no room for this EGG/i.test(p)), `1. a full party: "There's no room for this EGG..."`, JSON.stringify(full));
	A(!s1.flag && !s1.egg, '1. ...no flag, no egg', JSON.stringify(s1));

	// ===== 2. room in the party =====
	await scene('LavaridgeTown', 4, 8, 'up', { region: 'HOENN' });
	const got = await talk();
	const s2 = await egg();
	A(got.some(p => /received the EGG/i.test(p)), '2. "...received the EGG."', JSON.stringify(got));
	A(s2.flag && s2.egg && s2.egg.speciesId === 'wynaut', '2. the WYNAUT EGG arrives and FLAG_RECEIVED_LAVARIDGE_EGG is set', JSON.stringify(s2));

	A(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
