// evolution_branch_test.mjs — a species with more than one evolution takes the
// RIGHT one, not whichever species_extra happens to list first.
//
// 2026-11-03 forms audit: both evolution paths took the first matching entry
// (`evos.find`). species_extra lists raichu_alola before raichu, so Pikachu +
// THUNDERSTONE always became ALOLAN Raichu and Kanto Raichu was unreachable by
// stone. Same root, other casualties: Tyrogue was always Hitmonlee (never
// Hitmonchan / Hitmontop), Wurmple always Silcoon, Burmy always Wormadam (never
// Mothim), Lechonk always the male Oinkologne, Cosmoem always Solgaleo.
// overworld/evo_pick.js now breaks a tie the canonical way (species rule, else
// the base form beats a regional one). Players' already-evolved mons are not
// touched: this only decides what an evolution that has not happened yet becomes.
//   A. the BAG path (ow_menukeys.js): Pikachu/Exeggcute/Petilil + their stones
//   B. the LEVEL/friendship path (evolution.js check()): regional ties, Tyrogue,
//      Wurmple, Burmy, Lechonk, Cosmoem
//   C. a data sweep: EVERY species whose same-condition tie includes a regional
//      target and a base target evolves into the base one
//
//   node overworld/tests/evolution_branch_test.mjs
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
const PORT = 9293;
const STATE = { username: 'evobranch', friendCode: 'EVOBR1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
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
		localStorage.setItem('magepunk_region', 'JOHTO');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route29&x=10&y=8`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === 'Route29')).catch(() => false)); i++) await sleep(100);
	await sleep(900);

	// helpers live in the page: build a real mon, wait for the evolution scene to
	// pick its target, then cancel the scene so nothing is applied or saved
	await page.evaluate(async () => {
		const O = window.__ow;
		const B = await import('./battle.js');
		window.__mk = (id, level, over = {}) => {
			const m = B.buildMon(id, level, O.battle.data);
			Object.assign(m, over);
			return m;
		};
		window.__settle = async () => {
			for (let i = 0; i < 100 && !O.evolution.cur; i++) await new Promise(r => setTimeout(r, 30));
			const t = O.evolution.cur?.target || null;
			O.evolution.cur = null; O.evolution.queue = [];
			return t;
		};
		window.__level = async (mon, hour) => {
			if (hour != null) O.Clock.setHour(hour); else O.Clock.clearOverride();
			O.evolution.cur = null; O.evolution.queue = [];
			await O.evolution.check([mon], O.battle.data);
			const t = await window.__settle();
			O.Clock.clearOverride();
			return t;
		};
	});

	// ---------- A. the bag ----------
	const stone = (species, item) => page.evaluate(async (species, item) => {
		const O = window.__ow, MK = await import('./ow_menukeys.js');
		O.evolution.cur = null; O.evolution.queue = [];
		O.party.length = 1;
		O.party.push(window.__mk(species, 30));
		O.Bag.addItem(item, 1);
		const bm = MK.bagMenu;
		bm.open = true; bm.flash = null;
		bm.pocket = MK.BAG_POCKETS.findIndex(p => p.test(O.Bag.ITEMS[item], item));
		bm.idx = MK.bagEntries().findIndex(([e]) => e === item);
		bm.picking = true; bm.pickIdx = 1;
		MK.pressKey('z');
		const t = await window.__settle();
		bm.open = false; bm.picking = false;
		O.party.length = 1;
		return t;
	}, species, item);
	const pik = await stone('pikachu', 'thunderstone');
	A(pik === 'raichu', 'A1. Pikachu + THUNDERSTONE evolves into (Kanto) RAICHU, not Alolan Raichu', pik);
	const egg = await stone('exeggcute', 'leafstone');
	A(egg === 'exeggutor', 'A2. Exeggcute + LEAF STONE -> Exeggutor', egg);
	const pet = await stone('petilil', 'sunstone');
	A(pet === 'lilligant', 'A3. Petilil + SUN STONE -> Lilligant', pet);
	const glo = await stone('gloom', 'sunstone');
	A(glo === 'bellossom', 'A4. distinct stones still pick their own branch (Gloom + SUN STONE -> Bellossom)', glo);

	// ---------- B. level / friendship ----------
	const lv = (id, level, over, hour) => page.evaluate((id, level, over, hour) => window.__level(window.__mk(id, level, over), hour), id, level, over || {}, hour ?? null);
	for (const [id, level, want, hour] of [
		['koffing', 35, 'weezing'], ['quilava', 36, 'typhlosion'], ['dewott', 36, 'samurott'],
		['rufflet', 54, 'braviary'], ['goomy', 40, 'sliggoo'], ['bergmite', 37, 'avalugg'],
		['dartrix', 36, 'decidueye'], ['cubone', 28, 'marowak', 22],
	]) {
		const t = await lv(id, level, {}, hour);
		A(t === want, `B. ${id} at Lv${level}${hour != null ? ' (night)' : ''} -> ${want}`, t);
	}
	const st = (a, d) => ({ stats: { hp: 50, atk: a, def: d, spa: 30, spd: 30, spe: 30 } });
	A(await lv('tyrogue', 20, st(40, 30)) === 'hitmonlee', 'B. Tyrogue, Attack > Defense -> Hitmonlee');
	const chan = await lv('tyrogue', 20, st(30, 40));
	A(chan === 'hitmonchan', 'B. Tyrogue, Attack < Defense -> HITMONCHAN (was unreachable)', chan);
	const top = await lv('tyrogue', 20, st(35, 35));
	A(top === 'hitmontop', 'B. Tyrogue, Attack = Defense -> HITMONTOP (was unreachable)', top);
	// Wurmple: both cocoons reachable, and a given mon always goes the same way
	const wurm = [];
	for (let i = 0; i < 12; i++) {
		const iv = { hp: i, atk: i * 3 % 32, def: 7, spa: i * 5 % 32, spd: 2, spe: (i * 11) % 32 };
		wurm.push(await lv('wurmple', 7, { ivs: iv }));
	}
	A(wurm.includes('silcoon') && wurm.includes('cascoon'), 'B. Wurmple reaches BOTH Silcoon and Cascoon', wurm.join(','));
	const w1 = await lv('wurmple', 7, { ivs: { hp: 3, atk: 9, def: 7, spa: 15, spd: 2, spe: 1 } });
	const w2 = await lv('wurmple', 7, { ivs: { hp: 3, atk: 9, def: 7, spa: 15, spd: 2, spe: 1 } });
	A(w1 === w2, 'B. ... and the same Wurmple always picks the same one', `${w1}/${w2}`);
	const male = await lv('burmy', 20, { gender: 'M' });
	A(male === 'mothim', 'B. male Burmy -> MOTHIM (was unreachable)', male);
	A(await lv('burmy', 20, { gender: 'F' }) === 'wormadam', 'B. female Burmy -> Wormadam');
	const lf = await lv('lechonk', 18, { gender: 'F' });
	A(lf === 'oinkologne_f', 'B. female Lechonk -> female Oinkologne', lf);
	A(await lv('lechonk', 18, { gender: 'M' }) === 'oinkologne', 'B. male Lechonk -> Oinkologne');
	A(await lv('cosmoem', 53, {}, 13) === 'solgaleo', 'B. Cosmoem by day -> Solgaleo');
	const luna = await lv('cosmoem', 53, {}, 22);
	A(luna === 'lunala', 'B. Cosmoem at night -> LUNALA (was unreachable)', luna);
	// unchanged single-branch / distinct-condition cases still work
	A(await lv('rockruff', 25, {}, 13) === 'lycanroc', 'B. Rockruff by day -> Lycanroc (time branches untouched)');
	A(await lv('rockruff', 25, {}, 22) === 'lycanroc_midnight', 'B. Rockruff at night -> Lycanroc Midnight');
	A(await lv('charmander', 16) === 'charmeleon', 'B. a plain single evolution is unchanged');

	// ---------- C. every regional/base tie in the data ----------
	const ties = await page.evaluate(() => {
		const D = window.__ow.battle.data, out = [];
		const REG = /_(alola|galar|hisui|paldea)(_|$)/;
		for (const [id, ex] of Object.entries(D.extra)) {
			if (!D.species[id]) continue;
			const groups = {};
			for (const e of (ex.evos || []).filter(e => D.species[e.target])) (groups[e.type + ':' + e.param] ||= []).push(e);
			for (const g of Object.values(groups)) {
				const base = g.filter(e => !REG.test(e.target)), reg = g.filter(e => REG.test(e.target));
				if (base.length !== 1 || !reg.length) continue;
				out.push({ id, type: g[0].type, param: g[0].param, want: base[0].target,
					level: g[0].type === 'level' ? Math.max(...g.map(e => e.param)) : 50, night: g.some(e => e.time === 'night') });
			}
		}
		return out;
	});
	const sweep = { seen: ties.map(t => t.id), bad: [] };
	for (const t of ties) {
		// a 'move' evolution (Mime Jr.: level up knowing MIMIC, regional_forms.js) needs the move known
		const known = t.type === 'move' ? { moves: [{ id: t.param, pp: 10, maxPp: 10 }] } : {};
		const got = t.type === 'item' ? await stone(t.id, t.param) : await lv(t.id, t.level, { friend: 255, ...known }, t.night ? 22 : 13);
		if (got !== t.want) sweep.bad.push(`${t.id}${t.type === 'item' ? '+' + t.param : ''}->${got}`);
	}
	A(sweep.seen.length >= 10, `C. ${sweep.seen.length} species have a regional/base tie in the data`, sweep.seen.join(','));
	A(sweep.bad.length === 0, 'C. every one of them evolves into the BASE form', sweep.bad.join(' '));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
