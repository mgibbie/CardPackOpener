// poketactica_perma_test.mjs — PERMANENT LOSS (owner, 2026-11-23: "If something dies in battle it is gone"). A figurine
// knocked out in a Story or Dungeon battle leaves the collection the moment it faints, with what it holds; Training and
// Versus are safe; a lost figurine never comes back from another device's copy (the `gone` list) or a page's write to the
// account; the memorial (`fallen`) keeps the record and is what a repair restores from; a player with none left picks
// starters again. Node (figcol.js, the real server handler), then the page by keyboard and touch.
//   node overworld/tests/poketactica_perma_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import * as FC from '../../poketactica/js/figcol.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { handlePkcol } from '../../server/pocket_collection.mjs';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8966;
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json') };
let n = 0;
const fig = (sp, lv, more = {}) => ({ ...makeFigurine(sp, lv, makeRng(sp + lv + n), data, { id: sp + '-p' + (n++), shinyRate: 0 }), ...more });

// ---------------------------------------------------------------- the collection (figcol.js)
{
	const a = fig('pikachu', 30, { held: 'leftovers' }), b = fig('eevee', 12), c = fig('onix', 20);
	const col = { v: 1, figs: { [a.id]: a, [b.id]: b, [c.id]: c }, starters: true };
	const lost = FC.loseFig(col, a.id, { at: 1000, where: 'Boulder Pass', by: 'onix' });
	A(!lost.figs[a.id] && lost.figs[b.id] && lost.gone.join() === a.id, 'a lost figurine is out of the collection, its id on the gone list');
	A(lost.fallen.length === 1 && lost.fallen[0].fig.id === a.id && lost.fallen[0].fig.held === 'leftovers' && lost.fallen[0].where === 'Boulder Pass' && lost.fallen[0].by === 'onix', 'the memorial keeps the whole figurine (what it held too), where and by what', lost.fallen);
	A(!JSON.stringify(lost.figs).includes('leftovers') && !lost.items, 'its held item goes with it (it is not handed back)');
	A(FC.loseFig(lost, a.id, { at: 2000 }) === lost && FC.loseFig(col, 'nope-000', {}) === col, 'losing one that isn\'t there changes nothing');
	// read defensively: a copy that still lists a lost figurine
	const forged = FC.cleanFigs({ ...lost, figs: { ...lost.figs, [a.id]: a } });
	A(!forged.figs[a.id] && forged.gone.includes(a.id), 'a collection that lists a figurine on its own gone list: it is dropped on reading');
	// another device's stale copy (the figurine still in it) never brings it back: 3-way, and with no agreed copy at all
	const stale = { v: 1, figs: { [a.id]: { ...a, exp: a.exp + 500 }, [b.id]: b, [c.id]: c }, starters: true };
	const m3 = FC.merge3Figs(col, stale, lost), m3r = FC.merge3Figs(col, lost, stale), link = FC.linkFigs(stale, lost), linkR = FC.linkFigs(lost, stale);
	A([m3, m3r, link, linkR].every((m) => !m.figs[a.id] && m.gone.includes(a.id) && m.figs[b.id] && m.figs[c.id]), 'a stale copy merged in (either way round, with or without an agreed copy) does not bring it back');
	A([m3, m3r, link, linkR].every((m) => (m.fallen || []).length === 1 && m.fallen[0].fig.id === a.id), 'the memorial survives the merges, once');
	// two devices each lost a different one
	const lostB = FC.loseFig(col, b.id, { at: 3000, where: 'Dungeon floor 4' });
	const both = FC.merge3Figs(col, lost, lostB);
	A(!both.figs[a.id] && !both.figs[b.id] && both.figs[c.id] && both.gone.length === 2 && both.fallen.length === 2, 'losses on two devices: both lost, both remembered', both.gone);
	A(!FC.sameFigs(col, lost) && FC.sameFigs(lost, JSON.parse(JSON.stringify(lost))), 'a loss is a change the sync sees');
	// the memorial: the newest FALLEN_MAX, and nothing older than FALLEN_DAYS
	let many = { v: 1, figs: {} };
	const day = 86400000;
	for (let i = 0; i < FC.FALLEN_MAX + 5; i++) { const f = fig('rattata', 3); many = FC.loseFig({ ...many, figs: { ...many.figs, [f.id]: f } }, f.id, { at: 100 * day + i }); }
	A(many.fallen.length === FC.FALLEN_MAX && many.gone.length === FC.FALLEN_MAX + 5, `the memorial keeps the newest ${FC.FALLEN_MAX}; the gone list keeps every id`, [many.fallen.length, many.gone.length]);
	{ const f = fig('pidgey', 3); const later = FC.loseFig({ ...many, figs: { [f.id]: f } }, f.id, { at: (100 + FC.FALLEN_DAYS + 1) * day }); A(later.fallen.length === 1 && later.fallen[0].fig.id === f.id && later.gone.length === FC.FALLEN_MAX + 6, `memorial entries older than ${FC.FALLEN_DAYS} days fall off (still gone)`, later.fallen.length); }
	// the repair: back from the memorial, off the gone list
	const back = FC.restoreFallen(lost, a.id);
	A(back && back.figs[a.id] && back.figs[a.id].held === 'leftovers' && !back.gone && !back.fallen && FC.cleanFigs(back).figs[a.id], 'a repair restores it from the memorial, whole, and takes it off the gone list');
	A(FC.restoreFallen(lost, b.id) === null, 'only what the memorial holds can be restored');
}

// ---------------------------------------------------------------- the account (the real server handler)
{
	const rows = new Map();
	const store = { get: async (k) => (rows.has(k) ? JSON.parse(rows.get(k)) : null), setIfRev: async (k, v, expect) => { const cur = rows.has(k) ? JSON.parse(rows.get(k)) : null; if (((cur && cur.rev) || 0) !== expect) return false; rows.set(k, JSON.stringify(v)); return true; } };
	const server = (username, action, body = {}) => handlePkcol({ action, body, store, username, json: (o, status) => ({ ...o, status: status || 200 }), now: 1 });
	const a = fig('pikachu', 30), b = fig('eevee', 12);
	const col = { v: 1, figs: { [a.id]: a, [b.id]: b } };
	A((await server('ann', 'ptfig-put', { figs: col, rev: 0 })).ok, 'the account has two figurines');
	const lost = FC.loseFig(col, a.id, { at: 5000, where: 'First Steps' });
	A((await server('ann', 'ptfig-put', { figs: lost, rev: 1 })).ok, 'the loss reaches the account');
	let got = await server('ann', 'ptfig-get');
	A(!got.figs.figs[a.id] && got.figs.gone.includes(a.id) && got.figs.fallen[0].fig.id === a.id, 'the account: the figurine gone, its id and its memorial kept', got.figs.gone);
	// a page that never heard of the loss writes its old copy at the current rev (a forged or buggy client)
	const forged = await server('ann', 'ptfig-put', { figs: col, rev: got.rev });
	got = await server('ann', 'ptfig-get');
	A(forged.ok && !got.figs.figs[a.id] && got.figs.figs[b.id] && got.figs.gone.includes(a.id) && (got.figs.fallen || []).some((e) => e.fig.id === a.id), 'a page writing its old copy does not bring it back: the account never forgets a loss', got.figs);
}

// ---------------------------------------------------------------- the page
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u.startsWith('/api/')) { req.resume(); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":false}'); return; }
	let f = path.join(ROOT, u); if (u.endsWith('/')) f = path.join(f, 'index.html');
	fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));
const mk = (sp, lv, id, more = {}) => ({ v: 1, id, species: sp, level: lv, exp: 0, ability: null, shiny: false, pool: [{ id: 'tackle', lv: 1, xp: 0 }], equipped: ['tackle'], ...more });
const FIGS = JSON.stringify({ v: 1, starters: true, figs: { 'rattata-weak': mk('rattata', 1, 'rattata-weak', { held: 'leftovers' }), 'pidgey-weak': mk('pidgey', 1, 'pidgey-weak'), 'mewtwo-keep': mk('mewtwo', 90, 'mewtwo-keep') } });
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
	const open = async (vp, seed = {}) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = []; page.on('pageerror', (e) => errors.push(e.message));
		await page.evaluateOnNewDocument((figs, seed) => {
			try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('magepunk_poketactica_coach_v1', 'done'); if (!sessionStorage.getItem('seeded')) { localStorage.setItem('magepunk_poketactica_figs_v1', figs); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } } catch { /* */ }
		}, FIGS, seed);
		const t = { page, errors };
		t.load = async () => { await page.goto(`http://localhost:${PORT}/poketactica/`, { waitUntil: 'domcontentloaded' }); const t0 = Date.now(); while (Date.now() - t0 < 45000 && !(await page.evaluate(() => !!(window.__poketactica && window.__poketactica.ready)).catch(() => false))) await sleep(200); await sleep(500); };
		await t.load();
		t.key = async (k, ms = 200) => { await page.keyboard.press(k); await sleep(ms); };
		t.E = (fn, ...a) => page.evaluate(fn, ...a);
		t.col = () => t.E(() => JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1')));
		t.screen = () => t.E(() => ({ hub: window.__poketactica.hub.H.screen, page: window.__poketactica.P.screen }));
		t.labels = () => t.E(() => window.__poketactica.hub.labels());
		t.focus = () => t.E(() => window.__poketactica.hub.focusLabel());
		t.keyTo = async (re) => { for (let i = 0; i < 30; i++) { const f = await t.focus(); if (f && re.test(f)) { await t.key('KeyZ', 500); return true; } await t.key(i < 15 ? 'ArrowDown' : 'ArrowUp', 70); } return false; };
		// a battle on a target with these figurines, each deployed in turn and left to the foes, until `id` is knocked out
		t.fightUntilLost = async (target, ids, id) => t.E(async (target, ids, id) => {
			const T = window.__poketactica, wait = (ms) => new Promise((r) => setTimeout(r, ms));
			T.start(target, ids.map((i) => T.P.col.figs[i]));
			await wait(300);
			const settle = async () => { T.P.skip = true; for (let i = 0; i < 100 && T.P.busy; i++) await wait(30); };
			for (let k = 0; k < 40 && !T.P.S.over; k++) {
				const mine = T.P.S.units.find((u) => u.side === 'p' && u.hp > 0 && u.x == null);
				if (mine) { T.act({ t: 'deploy', uid: mine.uid }); await settle(); }
				// (walk it at the foes, so the story's sleepy ones wake)
				const out = T.P.S.units.find((u) => u.side === 'p' && u.hp > 0 && u.x != null), foe = T.P.S.units.find((u) => u.side === 'e' && u.hp > 0 && u.x != null);
				if (out && foe) { const tiles = [...T.B.moveTiles(T.P.S, out).values()].filter((q) => q.d > 0).sort((a, b) => (Math.abs(a.x - foe.x) + Math.abs(a.y - foe.y)) - (Math.abs(b.x - foe.x) + Math.abs(b.y - foe.y))); if (tiles[0]) { T.act({ t: 'move', uid: out.uid, x: tiles[0].x, y: tiles[0].y }); await settle(); } }
				T.act({ t: 'end' }); await settle();
				if (!JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1')).figs[id]) return { lost: true, over: T.P.S.over, turn: T.P.S.turn };
			}
			return { lost: false, over: T.P.S.over, turn: T.P.S.turn };
		}, target, ids, id);
		return t;
	};

	// ---------- Story: knocked out = gone at once, through a reload and "Give up"; Training is safe
	{
		const t = await open({ width: 1280, height: 800 }, { magepunk_poketactica_perma_v1: '1' });
		// Training first: the Lv 1 Rattata falls there and nothing is lost
		const tr = await t.E(async () => {
			const T = window.__poketactica, wait = (ms) => new Promise((r) => setTimeout(r, ms));
			T.start({ kind: 'training' }, [T.P.col.figs['rattata-weak']]);
			await wait(300);
			const u = T.P.S.units.find((x) => x.side === 'p');
			T.act({ t: 'deploy', uid: u.uid });
			for (let k = 0; k < 30 && !T.P.S.over; k++) { T.P.skip = true; for (let i = 0; i < 100 && T.P.busy; i++) await wait(30); const foe = T.P.S.units.find((x) => x.side === 'e' && x.hp > 0), me = T.P.S.units.find((x) => x.side === 'p' && x.hp > 0 && x.x != null); if (me && foe) { const tiles = [...T.B.moveTiles(T.P.S, me).values()].filter((q) => q.d > 0).sort((a, b) => (Math.abs(a.x - foe.x) + Math.abs(a.y - foe.y)) - (Math.abs(b.x - foe.x) + Math.abs(b.y - foe.y))); if (tiles[0]) { T.act({ t: 'move', uid: me.uid, x: tiles[0].x, y: tiles[0].y }); T.P.skip = true; for (let i = 0; i < 100 && T.P.busy; i++) await wait(30); } } T.act({ t: 'end' }); }
			T.P.skip = true; for (let i = 0; i < 100 && T.P.busy; i++) await wait(30);
			return { perma: !!T.P.setup.perma, over: T.P.S.over, koMine: T.P.S.units.some((x) => x.side === 'p' && x.hp <= 0) };
		});
		let c = await t.col();
		A(!tr.perma && tr.koMine && c.figs['rattata-weak'] && !c.gone, 'Training Grounds: a figurine knocked out there is NOT lost (safe)', [tr, Object.keys(c.figs)]);
		await t.E(() => { const T = window.__poketactica; T.hub.home(); });
		await t.load();
		// the Story: a Lv 1 Rattata and Pidgey into a late map, with the strong one kept at home
		const r = await t.fightUntilLost({ kind: 'map', id: 'c2-3' }, ['rattata-weak', 'pidgey-weak'], 'rattata-weak');
		c = await t.col();
		A(r.lost && !c.figs['rattata-weak'] && c.gone.includes('rattata-weak') && c.figs['mewtwo-keep'], 'Story: knocked out -> out of the collection at once, before any results (the one at home untouched)', [r, Object.keys(c.figs), c.gone]);
		A(c.fallen.some((e) => e.fig.id === 'rattata-weak' && e.fig.held === 'leftovers' && e.where && e.at > 0) && !c.items, 'the memorial has it, with the Leftover Clay it held (lost too, not handed back)', c.fallen);
		A(await t.E(() => !!window.__poketactica.P.setup.perma), 'a Story battle is marked deadly');
		// a reload mid-battle (the battle resumes): still gone
		if (!r.over) {
			await t.load();
			A(await t.E(() => !!window.__poketactica.hub.H && /Resume battle/.test(window.__poketactica.hub.labels()[0] || '')), 'after a reload the camp offers Resume battle');
			await t.E(() => window.__poketactica.hub.H.acts[0].go());
			await sleep(600);
			c = await t.col();
			A(!c.figs['rattata-weak'] && c.gone.includes('rattata-weak'), 'resumed after a reload: still gone', Object.keys(c.figs));
			// Give up: the fallen stay gone
			await t.key('Enter', 400);
			const menu = await t.E(() => [...document.querySelectorAll('#menu-items .bal-btn')].map((b) => b.textContent.trim()));
			A(menu.some((l) => /Give up/.test(l)), 'the field menu has Give up', menu);
			await t.E(() => [...document.querySelectorAll('#menu-items .bal-btn')].find((b) => /Give up/.test(b.textContent)).click());
			await sleep(300);
			const ask = await t.E(() => document.getElementById('menu').textContent);
			A(/fallen stay gone/i.test(ask), 'Give up says the fallen stay gone', ask.slice(0, 160));
			await t.E(() => [...document.querySelectorAll('#menu-items .bal-btn')].find((b) => /^Give up/.test(b.textContent.trim())).click());
			await sleep(600);
			c = await t.col();
			A(!c.figs['rattata-weak'] && (await t.screen()).hub === 'home', 'after Give up: back in the camp, and it is still gone', Object.keys(c.figs));
		}
		// the camp: the Fallen list
		const home = await t.labels();
		A(home.some((l) => /Fallen/.test(l) && /lost for good/.test(l)), 'the camp lists Fallen', home.slice(-3));
		A(await t.keyTo(/Fallen/), 'Z on Fallen');
		const fl = await t.E(() => ({ screen: window.__poketactica.hub.H.screen, cards: [...document.querySelectorAll('#hub .ph-card')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()), det: (document.querySelector('#hub .ph-detail') || {}).textContent }));
		A(fl.screen === 'fallen' && fl.cards.some((x) => /Rattata/.test(x)) && /Leftover Clay/.test(fl.det) && /Lost at/.test(fl.det), 'the Fallen screen: who, where, and what went with it', fl);
		await t.key('KeyX', 300);
		A((await t.screen()).hub === 'home', 'X: back to the camp');
		A(!t.errors.length, 'no page errors (story)', t.errors.slice(0, 3));
	}

	// ---------- a lost battle: the results list the fallen; nobody left -> the starters again
	{
		const t = await open({ width: 1280, height: 800 }, { magepunk_poketactica_perma_v1: '1', magepunk_poketactica_figs_v1: JSON.stringify({ v: 1, starters: true, figs: { 'rattata-only': mk('rattata', 1, 'rattata-only') } }) });
		await t.E(() => localStorage.setItem('magepunk_poketactica_figs_v1', JSON.stringify({ v: 1, starters: true, figs: { 'rattata-only': { v: 1, id: 'rattata-only', species: 'rattata', level: 1, exp: 0, ability: null, shiny: false, pool: [{ id: 'tackle', lv: 1, xp: 0 }], equipped: ['tackle'] } } })));
		await t.load();
		const r = await t.fightUntilLost({ kind: 'dungeon', run: { seed: 'permatest', floor: 40 } }, ['rattata-only'], 'rattata-only');
		await sleep(1500);
		const res = await t.E(() => ({ shown: !document.getElementById('result').hidden, title: document.getElementById('r-title').textContent, body: document.getElementById('r-body').textContent.replace(/\s+/g, ' '), over: window.__poketactica.P.S.over }));
		A(r.lost && res.shown && /Defeat/.test(res.title) && /Fallen/.test(res.body) && /Rattata/.test(res.body) && !/they keep/.test(res.body), 'Dungeon: the defeat results list the fallen (and no longer say "what they learned, they keep")', [r, res]);
		await t.key('KeyX', 800);
		const sc = await t.screen();
		const c = await t.col();
		A(sc.hub === 'starters' && !Object.keys(c.figs).length && c.gone.includes('rattata-only'), 'the last figurine lost: the camp offers three starters again', [sc, c.gone]);
		A(!t.errors.length, 'no page errors (dungeon)', t.errors.slice(0, 3));
	}

	// ---------- IN DANGER, and WITHDRAW (improvement plan item 14; the permanent-loss plan had deferred both)
	{
		const t = await open({ width: 1280, height: 800 }, { magepunk_poketactica_perma_v1: '1' });
		// a Lv 1 Rattata and the Lv 90 Mewtwo into a late Story map: the Rattata is walked at the foes until one can reach it
		const seen = await t.E(async () => {
			const T = window.__poketactica, wait = (ms) => new Promise((r) => setTimeout(r, ms));
			const settle = async () => { T.P.skip = true; for (let i = 0; i < 100 && T.P.busy; i++) await wait(30); };
			T.start({ kind: 'map', id: 'c2-3' }, [T.P.col.figs['mewtwo-keep'], T.P.col.figs['rattata-weak']]);
			await wait(300);
			const S = () => T.P.S, me = (sp) => S().units.find((u) => u.side === 'p' && u.species === sp);
			T.act({ t: 'deploy', uid: me('mewtwo').uid }); await settle();
			{ const tiles = [...T.B.moveTiles(S(), me('mewtwo')).values()].filter((q) => q.d === 1); T.act({ t: 'move', uid: me('mewtwo').uid, x: tiles[0].x, y: tiles[0].y }); await settle(); }
			T.act({ t: 'deploy', uid: me('rattata').uid }); await settle();
			const panel = () => { const r = me('rattata'); T.cursorTo(r.x, r.y); return { side: document.getElementById('u-side').textContent, cls: document.getElementById('u-side').className, title: document.getElementById('u-side').title, hp: r.hp }; };
			const first = panel();
			let found = null;
			for (let k = 0; k < 12 && !S().over && !found; k++) {
				const r = me('rattata'); if (!r || r.hp <= 0 || r.x == null) break;
				const foe = S().units.filter((u) => u.side === 'e' && u.hp > 0 && u.x != null).sort((a, b) => (Math.abs(a.x - r.x) + Math.abs(a.y - r.y)) - (Math.abs(b.x - r.x) + Math.abs(b.y - r.y)))[0];
				const tiles = [...T.B.moveTiles(S(), r).values()].filter((q) => q.d > 0).sort((a, b) => (Math.abs(a.x - foe.x) + Math.abs(a.y - foe.y)) - (Math.abs(b.x - foe.x) + Math.abs(b.y - foe.y)));
				if (tiles[0] && !r.moved) { T.act({ t: 'move', uid: r.uid, x: tiles[0].x, y: tiles[0].y }); await settle(); }
				const p = panel();
				if (/In danger|Will fall/.test(p.side)) { found = { ...p, turn: S().turn, alive: me('rattata').hp > 0 }; break; }
				T.act({ t: 'end' }); await settle();
			}
			const m = me('mewtwo'); T.cursorTo(m.x, m.y);
			return { first, found, strong: document.getElementById('u-side').textContent, strongCls: document.getElementById('u-side').className };
		});
		A(seen.first && typeof seen.first.side === 'string', '(the Rattata\'s panel is read from the moment it comes out)', seen.first);
		A(seen.found && /^☠ (In danger|Will fall) · /.test(seen.found.side) && /bal-red/.test(seen.found.cls) && /foes? can reach it next phase, for up to \d+ damage \(it has \d+ HP\)/.test(seen.found.title), 'walked into reach, the Lv 1 Rattata\'s panel says it is in danger (and why)', seen);
		A(!/In danger|Will fall/.test(seen.strong) && !/bal-red/.test(seen.strongCls), 'the Lv 90 Mewtwo beside it is not: the foes cannot take its HP', [seen.strong, seen.strongCls]);
		// Withdraw: a figurine on the base tile, from the turn after it came out
		{
			const E = (fn, ...a) => t.E(fn, ...a);
			const settle = () => E(async () => { const T = window.__poketactica; T.P.skip = true; for (let i = 0; i < 100 && T.P.busy; i++) await new Promise((r) => setTimeout(r, 30)); });
			const items = () => E(() => [...document.querySelectorAll('#menu-items .bal-btn')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
			const onPidgey = () => E(() => { const T = window.__poketactica, p = T.P.S.units.find((u) => u.side === 'p' && u.species === 'pidgey'); if (p && p.x != null) T.cursorTo(p.x, p.y); return p ? { x: p.x, hp: p.hp, uid: p.uid } : null; });
			await E(async () => { const T = window.__poketactica; T.start({ kind: 'training' }, [T.P.col.figs['mewtwo-keep'], T.P.col.figs['pidgey-weak']]); await new Promise((r) => setTimeout(r, 300)); const S = T.P.S, m = S.units.find((u) => u.side === 'p' && u.species === 'mewtwo'); T.act({ t: 'deploy', uid: m.uid }); });
			await settle();
			await E(() => { const T = window.__poketactica, S = T.P.S, m = S.units.find((u) => u.side === 'p' && u.species === 'mewtwo'), q = [...T.B.moveTiles(S, m).values()].filter((v) => v.d === 1)[0]; T.act({ t: 'move', uid: m.uid, x: q.x, y: q.y }); });
			await settle();
			await E(() => { const T = window.__poketactica, p = T.P.S.units.find((u) => u.side === 'p' && u.species === 'pidgey'); T.act({ t: 'deploy', uid: p.uid }); });
			await settle();
			await onPidgey(); await t.key('KeyZ', 350);
			const turn1 = await items();
			A(turn1.some((x) => /^Wait/.test(x)) && !turn1.some((x) => /^Withdraw/.test(x)), 'the turn a figurine comes out its commands have no Withdraw', turn1);
			await t.key('KeyX', 250);
			await E(() => { const T = window.__poketactica; if (T.P.menu) return; const p = T.P.S.units.find((u) => u.side === 'p' && u.species === 'pidgey'); T.act({ t: 'wait', uid: p.uid }); });
			await E(() => { const T = window.__poketactica; const p = T.P.S.units.find((u) => u.side === 'p' && u.species === 'pidgey'); if (!p.acted) T.act({ t: 'wait', uid: p.uid }); });
			await settle(); await sleep(200);
			await E(() => { window.__poketactica.act({ t: 'end' }); });   // (its own step: an order given while the last one still plays is dropped)
			await settle(); await sleep(300);
			await E(async () => { const T = window.__poketactica; for (let i = 0; i < 200 && (T.P.busy || T.P.S.phase !== 'player' || T.P.S.turn < 2) && !T.P.S.over; i++) { T.P.skip = true; await new Promise((r) => setTimeout(r, 50)); } });   // (the enemy phase is over: turn 2 is ours)
			await sleep(300);
			const p2 = await onPidgey();
			if (p2 && p2.x != null && p2.hp > 0) {
				await t.key('KeyZ', 350);
				const turn2 = await items();
				A(turn2.some((x) => /^Withdraw back to the reserve/.test(x)), 'from the next turn, on the base tile, they do', [turn2, await E(() => { const T = window.__poketactica, S = T.P.S, p = S.units.find((u) => u.side === 'p' && u.species === 'pidgey'); return { turn: S.turn, phase: S.phase, acted: p.acted, moved: p.moved, status: p.status, cameIn: p.cameIn, at: [p.x, p.y], base: S.map.base, rev: S.rev, mode: T.P.mode, busy: T.P.busy, over: S.over }; })]);
				await E(() => { const b = [...document.querySelectorAll('#menu-items .bal-btn')].find((x) => /^Withdraw/.test(x.textContent.trim())); if (b) b.click(); });
				await sleep(500);
				const after = await E(() => { const T = window.__poketactica, S = T.P.S, p = S.units.find((u) => u.side === 'p' && u.species === 'pidgey'); return { x: p.x, hp: p.hp, onMap: S.units.filter((u) => u.side === 'p' && u.hp > 0 && u.x != null).length, shown: T.P.disp && T.P.disp.units[p.uid] ? T.P.disp.units[p.uid].alive : null, acts: T.P.actions.filter((a) => a.t === 'withdraw').length }; });
				A(after.x == null && after.hp > 0 && after.onMap === 1 && after.acts === 1, 'Withdraw: it is back in the reserve, off the board, and the battle\'s record has the action', after);
			} else A(true, '(the Pidgey fell before it could withdraw: the rule itself is in poketactica_withdraw_test)');
		}
		A(!t.errors.length, 'no page errors (in danger, withdraw)', t.errors.slice(0, 3));
	}

	// ---------- the improvement plan's small fixes (2026-11-25)
	{
		// the warning before the first deadly battle says that Give up is a free retreat
		const t = await open({ width: 1280, height: 800 }, {});
		await t.E(() => { const T = window.__poketactica; T.hub.team({ kind: 'map', id: 'c1-1' }); });
		await sleep(300);
		await t.E(() => [...document.querySelectorAll('#hub [data-nav]')].find((b) => /Sortie/.test(b.textContent)).click());
		await sleep(400);
		const warn = await t.E(() => ({ screen: window.__poketactica.hub.H.screen, text: document.getElementById('hub').textContent.replace(/\s+/g, ' ') }));
		A(warn.screen === 'perma' && /Give up is a free retreat/.test(warn.text) && /every figurine still standing comes home/.test(warn.text), 'the permanent-loss warning says Give up is a free retreat', warn);
		await t.E(() => localStorage.setItem('magepunk_poketactica_perma_v1', '1'));
		// a Story wipe: the whole team is gone, so the results offer "Pick a new team" (not a "Try again" that did nothing)
		const r = await t.fightUntilLost({ kind: 'map', id: 'c2-3' }, ['rattata-weak'], 'rattata-weak');
		await sleep(1500);
		const res = await t.E(() => ({ over: window.__poketactica.P.S.over, shown: !document.getElementById('result').hidden, btns: [...document.querySelectorAll('#result .bal-modal-acts .bal-btn')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()) }));
		A(r.lost && res.over === 'lost' && res.shown && !res.btns.some((b) => /Try again/.test(b)) && res.btns.some((b) => /Pick a new team/.test(b)), 'a Story wipe: no "Try again" with nobody left; "Pick a new team" instead', [r, res]);
		await t.key('KeyZ', 700);
		const sc = await t.screen(), hid = await t.E(() => document.getElementById('result').hidden);
		A(sc.hub === 'team' && hid && (await t.labels()).some((l) => /Mewtwo/.test(l)), 'Z: the team screen for that map, with who is left', [sc, await t.labels()]);
		// the Fallen texts name every deadly mode
		await t.E(() => window.__poketactica.hub.home());
		await sleep(300);
		A(await t.keyTo(/Fallen/), 'Z on Fallen (after the wipe)');
		const ft = await t.E(() => document.getElementById('hub').textContent.replace(/\s+/g, ' '));
		A(/the Story, the Dungeon, the Item World and Mystery Maze/.test(ft), 'the Fallen screen names every deadly mode', ft.slice(0, 200));
		A(!t.errors.length, 'no page errors (the wipe)', t.errors.slice(0, 3));
	}
	{
		// End turn asks first while a figurine can still act; Training's gauge pays half, in words
		const t = await open({ width: 1280, height: 800 }, { magepunk_poketactica_perma_v1: '1' });
		// ---- SETTINGS (improvement plan, 2026-11-25): every mode's switches in one place, from the camp
		{
			const click = (re) => t.E((src) => { const b = [...document.querySelectorAll('#hub [data-nav]')].find((x) => new RegExp(src).test(x.textContent.replace(/\s+/g, ' ').trim())); if (b) b.click(); return !!b; }, re.source);
			const ls = (k) => t.E((k) => localStorage.getItem(k), k);
			A(await click(/Settings/) && (await sleep(300), (await t.screen()).hub === 'settings'), 'the camp: Settings');
			let rows = await t.labels();
			A(rows.length === 9 && /^Animation speed ?Battles ?normal/.test(rows[6]) && /^Enemy phase ?Battles ?normal speed/.test(rows[0]) && /^Effects ?Tower Defense ?full/.test(rows[1]) && /^Speed a run starts at ?Tower Defense ?1×/.test(rows[2]) && /^Reach shown ?Tower Defense ?the tower under the cursor/.test(rows[3]) && /^Next wave ?Maze Builder ?when you call it/.test(rows[4]) && /^The bar ?Mystery Maze ?whole/.test(rows[5]) && /coaches/.test(rows[7]) && /permanent-loss warning/.test(rows[8]), 'seven switches (battles, Tower Defense, Maze Builder, Mystery Maze, and the animation speed: plan item A7), the coaches and the warning', rows);
			await click(/^Enemy phase/); await sleep(250);
			rows = await t.labels();
			A(/fast/.test(rows[0]) && await ls('magepunk_poketactica_fast_v1') === '1' && await t.E(() => window.__poketactica.P.fast === true) && /^Enemy phase/.test(await t.focus()), 'Enemy phase: fast. The battle reads it at once, and the row keeps the focus', rows[0]);
			await click(/^Enemy phase/); await sleep(250);
			A(await ls('magepunk_poketactica_fast_v1') === null && await t.E(() => window.__poketactica.P.fast === false), 'and back to normal speed');
			await click(/^Speed a run starts at/); await sleep(200); await click(/^Speed a run starts at/); await sleep(200);
			A(await ls('magepunk_poketactica_tdspeed_v1') === '3' && /3×/.test((await t.labels())[2]), 'a switch with three positions steps through them (1×, 2×, 3×)');
			await click(/^Speed a run starts at/); await sleep(200);
			A(await ls('magepunk_poketactica_tdspeed_v1') === null, 'and round to the first');
			await click(/^Reach shown/); await sleep(200); await click(/^Next wave/); await sleep(200); await click(/^The bar/); await sleep(200); await click(/^Effects/); await sleep(200);
			A(await ls('magepunk_poketactica_tdreach_v1') === '1' && await ls('magepunk_poketactica_mzauto_v1') === '1' && await ls('magepunk_poketactica_mmbar_v1') === 'small' && await ls('magepunk_poketactica_tdfx_v1') === 'calm', 'the others write the very keys their modes read');
			A(await t.E(() => { const T = window.__poketactica; T.td.T.calm = false; T.td.T.allReach = false; T.td.T.auto = false; T.mm.M.small = false; return true; }) && await click(/^Reach shown/) && (await sleep(200), await t.E(() => { const T = window.__poketactica; return T.td.T.calm === null && T.td.T.allReach === null && T.td.T.auto === null && T.mm.M.small === null; })), 'a change makes each mode read its switch again');
			for (const k of ['magepunk_poketactica_tdreach_v1', 'magepunk_poketactica_mzauto_v1', 'magepunk_poketactica_mmbar_v1', 'magepunk_poketactica_tdfx_v1']) await t.E((k) => localStorage.removeItem(k), k);
			// the coaches and the warning
			A(await ls('magepunk_poketactica_coach_v1') === 'done' && await ls('magepunk_poketactica_perma_v1') === '1', '(this device has finished the first coach and seen the warning)');
			await click(/^Show the coaches again/); await sleep(250);
			A(await ls('magepunk_poketactica_coach_v1') === null && /none finished yet/.test((await t.labels())[7]), 'Show the coaches again: they will lead again');
			await click(/^Show the permanent-loss warning again/); await sleep(250);
			A(await ls('magepunk_poketactica_perma_v1') === null && /not seen yet/.test((await t.labels())[8]), 'Show the permanent-loss warning again: it comes before the next deadly battle');
			await t.key('KeyX', 300);
			A((await t.screen()).hub === 'home' && /Settings/.test(await t.focus()), 'X: back to the camp, on Settings');
			await t.E(() => { localStorage.setItem('magepunk_poketactica_coach_v1', 'done'); localStorage.setItem('magepunk_poketactica_perma_v1', '1'); });
		}
		await t.E(async () => { const T = window.__poketactica; T.start({ kind: 'training' }, [T.P.col.figs['mewtwo-keep']]); await new Promise((r) => setTimeout(r, 300)); T.act({ t: 'deploy', uid: T.P.S.units.find((u) => u.side === 'p').uid }); T.P.skip = true; });
		await sleep(600);
		const menuOf = () => t.E(() => ({ title: document.getElementById('menu').textContent.replace(/\s+/g, ' '), items: [...document.querySelectorAll('#menu-items .bal-btn')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()), turn: window.__poketactica.P.S.turn, phase: window.__poketactica.P.S.phase }));
		const click = (re) => t.E((src) => { const b = [...document.querySelectorAll('#menu-items .bal-btn')].find((x) => new RegExp(src).test(x.textContent.trim())); if (b) b.click(); return !!b; }, re.source);
		await t.key('Enter', 400);
		let m = await menuOf();
		A(m.items.some((l) => /^End turn/.test(l) && /1 can still act/.test(l)), 'the field menu: End turn says a figurine can still act', m.items);
		await click(/^End turn/); await sleep(300);
		m = await menuOf();
		A(m.turn === 1 && /End the turn\? 1 figurine can still act/.test(m.title) && m.items.length === 2, 'End turn with a figurine still to act: it asks first', m);
		await click(/^Keep playing/); await sleep(300);
		m = await menuOf();
		A(m.turn === 1 && m.phase === 'player', '"Keep playing": the turn goes on', m);
		await t.key('Enter', 400); await click(/^End turn/); await sleep(300); await click(/^End turn/);
		await t.E(async () => { const T = window.__poketactica; T.P.skip = true; for (let i = 0; i < 200 && (T.P.busy || T.P.S.turn < 2) && !T.P.S.over; i++) { T.P.skip = true; await new Promise((r) => setTimeout(r, 30)); } });
		m = await menuOf();
		A(m.turn >= 2, 'confirmed: the turn ends', m);
		// (the win is forced: this is about what the results pay and say)
		const pay = await t.E(async () => {
			const T = window.__poketactica, S = T.P.S;
			S.bonus.level = Math.max(...S.bonus.rewards.map((r) => r.level));
			for (const u of S.units) if (u.side === 'e') { u.hp = 0; u.x = null; u.y = null; }
			S.over = 'won';
			const full = T.B.results(S).bonus;
			T.cursorTo(T.P.cursor.x, T.P.cursor.y);
			await new Promise((r) => setTimeout(r, 900));
			return { full, stars: T.P.report && T.P.report.stars, shown: !document.getElementById('result').hidden, body: document.getElementById('r-body').textContent.replace(/\s+/g, ' ') };
		});
		// (which rewards a gauge holds is the seed's: every one with a number must show half of it)
		const word = { stars: ' ★', exp: ' EXP', moveXp: ' move XP' }, nums = pay.full.filter((b) => b.n), fullStars = nums.filter((b) => b.kind === 'stars').reduce((a, b) => a + b.n, 0), halfStars = nums.filter((b) => b.kind === 'stars').reduce((a, b) => a + Math.ceil(b.n / 2), 0);
		A(pay.shown && nums.length > 0 && nums.every((b) => b.n > 1 && pay.body.includes('Lv ' + b.level + ': ' + Math.ceil(b.n / 2) + word[b.kind]) && !pay.body.includes('Lv ' + b.level + ': ' + b.n + word[b.kind])) && pay.stars === halfStars, 'Training: every numbered gauge reward pays half (' + nums.map((b) => b.kind + ' ' + b.n + ' -> ' + Math.ceil(b.n / 2)).join(', ') + '; ' + halfStars + ' of ' + fullStars + ' stars banked)', [pay.stars, nums, pay.body.slice(0, 300)]);
		A(/Training is safe, so its stars and EXP pay half/.test(pay.body) && !/moveXp|: stars|: exp /.test(pay.body) && (!pay.full.some((b) => b.kind === 'moveXp') || /move XP, shared by the team/.test(pay.body)), 'the gauge list is in words ("move XP", not "moveXp") and says Training pays half', pay.body.slice(0, 400));
		A(!t.errors.length, 'no page errors (End turn, Training)', t.errors.slice(0, 3));
	}

	// ---------- a battle saved before the rule (no `perma` on it) finishes under the old one
	{
		const t = await open({ width: 1280, height: 800 }, { magepunk_poketactica_perma_v1: '1' });
		const r = await t.E(async () => {
			const T = window.__poketactica, wait = (ms) => new Promise((r) => setTimeout(r, ms));
			T.start({ kind: 'map', id: 'c2-3' }, [T.P.col.figs['pidgey-weak']]);
			await wait(300);
			delete T.P.setup.perma;   // (as a battle started before the rule shipped)
			const u = T.P.S.units.find((x) => x.side === 'p');
			T.act({ t: 'deploy', uid: u.uid });
			for (let k = 0; k < 30 && !T.P.S.over; k++) { T.P.skip = true; for (let i = 0; i < 100 && T.P.busy; i++) await wait(30); const foe = T.P.S.units.find((x) => x.side === 'e' && x.hp > 0), me = T.P.S.units.find((x) => x.side === 'p' && x.hp > 0 && x.x != null); if (me && foe) { const tiles = [...T.B.moveTiles(T.P.S, me).values()].filter((q) => q.d > 0).sort((a, b) => (Math.abs(a.x - foe.x) + Math.abs(a.y - foe.y)) - (Math.abs(b.x - foe.x) + Math.abs(b.y - foe.y))); if (tiles[0]) { T.act({ t: 'move', uid: me.uid, x: tiles[0].x, y: tiles[0].y }); T.P.skip = true; for (let i = 0; i < 100 && T.P.busy; i++) await wait(30); } } T.act({ t: 'end' }); }
			return { over: T.P.S.over, ko: T.P.S.units.some((x) => x.side === 'p' && x.hp <= 0) };
		});
		const c = await t.col();
		A(r.ko && c.figs['pidgey-weak'] && !c.gone, 'a battle from before the rule: its knockouts are not losses', [r, Object.keys(c.figs)]);
	}

	// ---------- the first deadly battle on a device: the warning (keyboard), and the team screen's tags; touch on a phone
	{
		const t = await open({ width: 1280, height: 800 });
		await t.E(() => window.__poketactica.hub.team({ kind: 'map', id: 'c1-1' }));
		await sleep(300);
		A(/gone for good/.test(await t.E(() => document.querySelector('#hub .ph-sub').textContent)), 'the Story team screen says a knocked-out figurine is gone for good');
		await t.key('KeyZ', 500);   // (the focus starts on Sortie!)
		let sc = await t.screen();
		const txt = await t.E(() => document.getElementById('hub').textContent);
		A(sc.hub === 'perma' && /gone for good/.test(txt) && /Training Grounds and Versus are safe/.test(txt) && /Not yet/.test(await t.focus()), 'the first deadly Sortie: the warning, focused on "Not yet"', [sc, await t.focus()]);
		await t.key('KeyX', 400);
		A((await t.screen()).hub === 'team', 'X: back to the team (no battle started)');
		await t.key('KeyZ', 500);
		A(await t.keyTo(/I understand/), 'Z on "I understand: Sortie!"');
		sc = await t.screen();
		A(sc.page === 'battle' && await t.E(() => localStorage.getItem('magepunk_poketactica_perma_v1')) === '1', 'the battle starts, and this device won\'t ask again', sc);
		await t.E(() => { const T = window.__poketactica; T.hub.team({ kind: 'training' }); });
		await sleep(300);
		A(/safe: nothing is lost here/.test(await t.E(() => document.querySelector('#hub .ph-sub').textContent)), 'the Training team screen says it is safe');
		A(!t.errors.length, 'no page errors (warning)', t.errors.slice(0, 3));
	}
	{
		const t = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
		await t.E(() => window.__poketactica.hub.team({ kind: 'dungeon', run: { seed: 'permatouch', floor: 1 } }));
		await sleep(300);
		const tap = async (re) => { const r = await t.E((src) => { const re = new RegExp(src); const el = [...document.querySelectorAll('#hub [data-nav]')].find((b) => re.test(b.textContent)); if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, re.source); if (r) { await t.page.touchscreen.tap(r[0], r[1]); await sleep(500); } return r; };
		A(await tap(/Sortie!/), 'a tap on Sortie! (a Dungeon floor)');
		A((await t.screen()).hub === 'perma', 'the warning shows on a phone');
		A(!(await t.E(() => document.documentElement.scrollWidth > innerWidth + 1)), 'no sideways scroll');
		A(await tap(/I understand/), 'a tap on "I understand: Sortie!"');
		A((await t.screen()).page === 'battle', 'the battle starts');
		A(!t.errors.length, 'no page errors (phone)', t.errors.slice(0, 3));
	}
} catch (e) { A(false, 'the run threw', e && e.stack); } finally { if (browser) await browser.close(); server.close(); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
