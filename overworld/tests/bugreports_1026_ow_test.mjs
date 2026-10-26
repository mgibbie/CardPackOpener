// bugreports_1026_ow_test.mjs — tester bug-report list of 2026-10-26, overworld set.
//
//   bug:1792594036709  STEVEN (Granite Cave) drew as the generic man: his sprite
//     (people/steven.png) 404'd. He now ships with the other verbatim pokeemerald
//     art in overworld/people_extra/, which is asked for FIRST (no 404 on the way).
//   bug:1792701740150  the Ilex Forest gate's OFFICER / GRANNY 404'd the same way.
//     Crystal / Emerald ids whose person exists in the FireRed set under another
//     name now alias to it (trainers.js GFX_ALIAS: policeman.png, old_woman.png...).
//   bug:1792868498540 (+ follow-ups 1792868894435, 1792871104216)  Viridian Forest
//     listed its 5 trainers TWICE. Two overlapping loadForMap()s (the story-overlay
//     heal re-runs a map's setup on its own timer) both appended into the one fresh
//     list; every base then looked like a collision, keyOf() switched to the
//     coordinate-suffixed key, the save's plain keys stopped matching, and beaten
//     trainers fought again. Loads are generation-guarded now, and a collision means
//     two DIFFERENT source tiles sharing a base.
//   bug:1792972818943 (+ 1792975364031, 1792975798871)  "PHONE: KAREN is calling!"
//     stayed in the bar after the call: hanging up now restores the map name.
//   bug:1792692413544  NOT A BUG (asserted here so it stays faithful): after the
//     Farfetch'd is herded and HM01 handed over, pokecrystal's
//     IlexForestCharcoalMasterScript sets EVENT_ILEX_FOREST_FARFETCHD / _APPRENTICE /
//     _CHARCOAL_MASTER, and KURT / the LASS are hidden from InitializeEvents until the
//     GS BALL scene. The reporter's save has all of those (EVENT_HERDED_FARFETCHD,
//     EVENT_GOT_HM01_CUT), so only the HEADBUTT guy is an NPC; Wayne is a trainer and
//     the four balls are items. The north is reached with CUT at (8,25).
//   bug:1792723600759  Route 107 (4,10) "turns but never steps": NOT REPRODUCED from
//     the reporter's exact server save. Kept as a guard: that save, on that tile,
//     walks off land in both land directions and back across the Dewford connection.
//
//   node overworld/tests/bugreports_1026_ow_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const OW = path.join(ROOT, 'overworld');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9274;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const pngSize = f => { const b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

// ---------- data: sprite resolution (no browser) ----------
{
	const T = await import(pathToFileURL(path.join(OW, 'trainers.js')).href);
	const gfx = JSON.parse(fs.readFileSync(path.join(OW, 'data/gfx_map.json'), 'utf8'));
	A(typeof T.peopleFile === 'function' && T.peopleFile(gfx, 'OBJ_EVENT_GFX_STEVEN') === null && T.spritePath('OBJ_EVENT_GFX_STEVEN', false) === 'people_extra/steven.png',
		'[1792594036709] STEVEN resolves straight to people_extra/steven.png (no data/people probe to 404)', T.peopleFile && T.peopleFile(gfx, 'OBJ_EVENT_GFX_STEVEN'));
	const sv = path.join(OW, 'people_extra/steven.png');
	A(fs.existsSync(sv) && pngSize(sv).join('x') === '144x32', '...and that file is the 9-frame 16x32 sheet the engine draws', fs.existsSync(sv) && pngSize(sv));
	const officer = T.peopleFile && T.peopleFile(gfx, 'OBJ_EVENT_GFX_OFFICER'), granny = T.peopleFile && T.peopleFile(gfx, 'OBJ_EVENT_GFX_GRANNY');
	A(officer === 'policeman.png' && granny === 'old_woman.png', '[1792701740150] the gate OFFICER / GRANNY resolve to policeman.png / old_woman.png', JSON.stringify({ officer, granny }));
	const people = new Set(fs.readdirSync(path.join(OW, 'data/people')));
	const missing = Object.entries(T.GFX_ALIAS || {}).filter(([, f]) => !people.has(f));
	A(T.GFX_ALIAS && !missing.length, '...and every alias target is a real data/people file', JSON.stringify(missing));
	// none of the 21 OFFICER / 21 GRANNY objects across the maps asks for a file that is not there
	let asked = 0; const bad = new Set();
	for (const f of fs.readdirSync(path.join(OW, 'data/maps'))) {
		if (!f.endsWith('_map.json')) continue;
		let m; try { m = JSON.parse(fs.readFileSync(path.join(OW, 'data/maps', f), 'utf8')); } catch (e) { continue; }
		for (const ev of m.object_events || []) {
			if (!/GFX_(OFFICER|GRANNY|STEVEN)$/.test(ev.graphics_id || '')) continue;
			asked++;
			const file = T.peopleFile ? T.peopleFile(gfx, ev.graphics_id) : (gfx[ev.graphics_id] || ev.graphics_id.replace('OBJ_EVENT_GFX_', '').toLowerCase() + '.png');
			if (file ? !people.has(file) : !fs.existsSync(path.join(OW, T.spritePath(ev.graphics_id, false)))) bad.add(ev.graphics_id);
		}
	}
	A(asked > 40 && !bad.size, `...every OFFICER / GRANNY / STEVEN object on every map (${asked}) resolves to a file that exists`, JSON.stringify([...bad]));
}

// ---------- browser ----------
const SERVED = [];
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
		return res.end(JSON.stringify({ ok: true, state: { username: 'bug1026', friendCode: 'B1026', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } }, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		SERVED.push([u, e ? 404 : 200]);
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
// `save`: whole localStorage entries to seed (a real save's key/value map)
async function open(map, x, y, { flags = {}, vars = {}, badges = { badges: {}, champion: {} }, region = 'KANTO', save = null, phone = null } = {}) {
	const page = await browser.newPage();
	page.on('pageerror', e => console.log('  (pageerror) ' + String(e.message).slice(0, 160)));
	await page.evaluateOnNewDocument((flags, vars, badges, region, save, phone) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'bug1026', friendCode: 'B1026', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
		if (save) { for (const [k, v] of Object.entries(save)) localStorage.setItem(k, v); return; }
		localStorage.setItem('magepunk_region', region);
		localStorage.setItem('magepunk_bag_v1', JSON.stringify({ pokeball: 20 }));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify(badges));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, ...flags }, vars }));
		if (phone) localStorage.setItem('magepunk_phone_v1', JSON.stringify(phone));
	}, flags, vars, badges, region, save, phone);
	const q = map ? `?map=${map}&x=${x}&y=${y}` : '';
	await page.goto(`http://localhost:${PORT}/overworld/index.html${q}`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow?.battle?.data && window.__ow.world?.current && (!m || window.__ow.world.current.name === m) && !window.__ow.S?.loading), map).catch(() => false)); i++) await sleep(100);
	await sleep(1200);
	if (!save) await page.evaluate(async () => { const B = await import('./battle.js'), S = (await import('./ow_state.js')).S; S.party = [B.buildMon('mewtwo', 70, window.__ow.battle.data)]; });
	return page;
}
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const where = page => page.evaluate(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty }));
async function step(page, dir) {
	const at = await where(page);
	await page.keyboard.down(KEY[dir]);
	for (let i = 0; i < 60; i++) {
		await sleep(25);
		const s = await where(page);
		if (s.map !== at.map || s.x !== at.x || s.y !== at.y) break;
	}
	await page.keyboard.up(KEY[dir]);
	for (let i = 0; i < 40 && await page.evaluate(() => window.__ow.player.moving); i++) await sleep(25);
	await sleep(200);
	return where(page);
}
const press = (page, k) => page.evaluate(k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })), k);

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'] });

	// ===== STEVEN (bug:1792594036709) =====
	{
		SERVED.length = 0;
		const page = await open('GraniteCave_StevensRoom', 7, 10, { region: 'HOENN' });
		const s = await page.evaluate(() => { const n = window.__ow.npcs.list.find(n => /GFX_STEVEN$/.test(n.ev?.graphics_id || '')); return n ? { src: n.img?.dataset?.src || n.img?.src || '', w: n.img?.width } : null; });
		A(s && /people_extra\/steven\.png$/.test(s.src), '[1792594036709] STEVEN in his Granite Cave room draws his own sprite, not the generic man', JSON.stringify(s));
		const nf = SERVED.filter(([u, c]) => c === 404 && /\/people\//.test(u)).map(([u]) => u);
		A(!nf.some(u => /steven/.test(u)), '...and nothing 404s on the way to it', JSON.stringify(nf));
		await page.close();
	}
	// ===== the Ilex Forest gate (bug:1792701740150) =====
	{
		SERVED.length = 0;
		const page = await open('IlexForestAzaleaGate', 4, 5, { region: 'JOHTO' });
		const s = await page.evaluate(() => window.__ow.npcs.list.map(n => [n.ev.graphics_id.replace('OBJ_EVENT_GFX_', ''), (n.img?.dataset?.src || n.img?.src || '').replace(/^.*\//, '')]));
		const by = Object.fromEntries(s);
		A(by.OFFICER === 'policeman.png' && by.GRANNY === 'old_woman.png', '[1792701740150] the gate OFFICER and GRANNY draw as the FireRed policeman / old woman', JSON.stringify(s));
		const nf = SERVED.filter(([u, c]) => c === 404 && /\/people\//.test(u)).map(([u]) => u);
		A(!nf.length, '...and no person sprite 404s in the gate', JSON.stringify(nf));
		await page.close();
	}

	// ===== Viridian Forest: one runtime trainer per source event (bug:1792868498540) =====
	{
		const page = await open('ViridianForest', 3, 13, { region: 'KANTO' });
		await page.evaluate(() => localStorage.setItem('magepunk_defeated_v1', JSON.stringify(['MAP_VIRIDIAN_FOREST:ViridianForest_EventScript_Rick', 'MAP_VIRIDIAN_FOREST:ViridianForest_EventScript_Sammy', 'MAP_VIRIDIAN_FOREST:ViridianForest_EventScript_Doug', 'MAP_VIRIDIAN_FOREST:ViridianForest_EventScript_Charlie'])));
		const r = await page.evaluate(async () => {
			const O = window.__ow, T = O.trainers, N = O.npcs;
			T.reloadDefeated();
			const src = (O.world.current.map.object_events || []).filter(ev => T.claims(ev)).length;
			const one = T.list.length;
			// the overlap the tester's timeline produced: a second load starts while the
			// first is still awaiting its sprites (and a third, for good measure)
			await Promise.all([T.loadForMap(), T.loadForMap(), N.loadForMap(), N.loadForMap(), T.loadForMap()]);
			const nNpc = N.list.length, nNpcEv = new Set(N.list.map(n => n.ev)).size;
			const keys = T.list.map(t => [t.ev.script.replace('ViridianForest_EventScript_', ''), T.keyOf(t), T.isDefeated(t)]);
			return { src, one, after: T.list.length, dup: [...(T._dupBases || [])], keys, nNpc, nNpcEv };
		});
		A(r.src === 5 && r.one === 5, '[1792868498540] Viridian Forest has 5 trainer events and loads 5 runtime trainers', JSON.stringify(r));
		A(r.after === 5 && r.dup.length === 0, '...and still exactly 5 (no false collisions) after overlapping loads', JSON.stringify({ after: r.after, dup: r.dup }));
		A(r.nNpc === r.nNpcEv, '...and the NPC list never holds one event twice either', JSON.stringify({ nNpc: r.nNpc, nNpcEv: r.nNpcEv }));
		const want = { Rick: true, Doug: true, Sammy: true, Charlie: true, Anthony: false };
		A(r.keys.every(([n, k, d]) => !/@/.test(k) && d === want[n]), '...so the save\'s plain keys still count: Rick, Doug, Sammy, Charlie beaten; Anthony not', JSON.stringify(r.keys));
		// a REAL same-base collision still gets per-tile keys (Violet Gym's Abe and Rod)
		const real = await page.evaluate(() => {
			const T = window.__ow.trainers, ev = T.list[0].ev;
			const twin = { ...ev, x: ev.x + 1 };
			const saved = T.list; T.list = [...saved, { ev: twin }];
			const dup = [...T.recomputeDupBases()];
			const k = [T.keyOf(saved[0]), T.keyOf({ ev: twin })];
			T.list = saved; T.recomputeDupBases();
			return { dup, k };
		});
		A(real.dup.length === 1 && real.k[0] !== real.k[1] && real.k.every(k => /@\d+,\d+$/.test(k)), '...while two different objects sharing a base still get their own coordinate keys', JSON.stringify(real));
		await page.close();
	}

	// ===== the PHONE banner (bug:1792972818943) =====
	{
		const page = await open('RustboroCity', 16, 20, { region: 'HOENN', phone: { has: true, contacts: ['HOENN:KAREN'], ready: {}, gift: {}, tier: {}, steps: 0, lastCallAt: 0 } });
		const r = await page.evaluate(async () => {
			const P = await import('./phone.js'), O = window.__ow, hud = document.getElementById('hud');
			const c = P.contactFor('HOENN:KAREN');
			if (!c) return { err: 'no contact' };
			P.ringFrom(c);
			const during = hud.textContent;
			const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
			for (let i = 0; i < 40 && O.dialog.blocking; i++) { press('z'); await new Promise(r => setTimeout(r, 60)); }
			return { during, after: hud.textContent, open: O.dialog.blocking, map: O.world.current.map.name };
		});
		A(/PHONE: KAREN is calling!/.test(r.during || ''), '[1792972818943] a call shows "PHONE: KAREN is calling!" while it rings', JSON.stringify(r));
		A(!r.open && !/is calling/.test(r.after || '') && r.after === r.map, '...and hanging up puts the bar back to the map name, with no reload or map change', JSON.stringify(r));
		await page.close();
	}

	// ===== Ilex Forest: who is out, before and after the Farfetch'd (bug:1792692413544, not a bug) =====
	{
		// the reporter's story (ow:remytest): Slowpoke Well cleared, Farfetch'd herded, HM01 received
		const done = { crystal_events_seeded: true, EVENT_CLEARED_SLOWPOKE_WELL: true, EVENT_HERDED_FARFETCHD: true, EVENT_GOT_HM01_CUT: true,
			EVENT_ILEX_FOREST_FARFETCHD: true, EVENT_ILEX_FOREST_APPRENTICE: true, EVENT_ILEX_FOREST_CHARCOAL_MASTER: true,
			EVENT_ILEX_FOREST_KURT: true, EVENT_ILEX_FOREST_LASS: true };
		const page = await open('IlexForest', 3, 30, { region: 'JOHTO', flags: done });
		const s = await page.evaluate(() => ({ npcs: window.__ow.npcs.list.map(n => n.ev.script), trainers: window.__ow.trainers.list.map(t => t.ev.script) }));
		A(s.npcs.length === 1 && s.npcs[0] === 'IlexForestHeadbuttGuyScript' && s.trainers.includes('TrainerBugCatcherWayne'),
			'[1792692413544] after the Charcoal master hands over CUT, only the HEADBUTT guy is an NPC (Wayne is a trainer), as in pokecrystal', JSON.stringify(s));
		await page.close();
		// before the herding (the Well cleared clears the bird + apprentice): they are out
		const p2 = await open('IlexForest', 3, 30, { region: 'JOHTO', flags: { crystal_events_seeded: true, EVENT_CLEARED_SLOWPOKE_WELL: true, EVENT_ILEX_FOREST_CHARCOAL_MASTER: true, EVENT_ILEX_FOREST_KURT: true, EVENT_ILEX_FOREST_LASS: true } });
		const s2 = await p2.evaluate(() => window.__ow.npcs.list.map(n => n.ev.script));
		A(s2.includes('IlexForestFarfetchdScript') && s2.includes('IlexForestCharcoalApprenticeScript'),
			'...and before it, the FARFETCH\'D and the apprentice are there to herd', JSON.stringify(s2));
		await p2.close();
	}

	// ===== Route 107 (4,10) (bug:1792723600759, not reproduced: a guard) =====
	{
		// the shape of the reporter's save on that tile: Hoenn, arrived from Dewford
		const save = {
			magepunk_region: 'hoenn', magepunk_starter: 'bulbasaur', magepunk_rival: 'GARY',
			magepunk_pos_v1: JSON.stringify({ map: 'Route107', x: 4, y: 10, back: null, dyn: null }),
			magepunk_story: JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, FLAG_ADVENTURE_STARTED: true }, vars: {} }),
			magepunk_party_v1: JSON.stringify([{ speciesId: 'pidgeotto', name: 'PIDGEOTTO', level: 33, gender: 'M', friend: 255, types: ['Normal', 'Flying'], ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, stats: { hp: 99, atk: 60, def: 60, spa: 60, spd: 60, spe: 80 }, maxHP: 99, curHP: 99, exp: 30000, moves: [{ id: 'gust', name: 'Gust', pp: 35, maxPp: 35 }], sprite: 's17.png', num: 17 }]),
			magepunk_badges_v1: JSON.stringify({ badges: { HOENN: { stone: true, knuckle: true } }, champion: {} }),
			magepunk_phone_v1: JSON.stringify({ has: true, contacts: ['HOENN:KAREN'], ready: { 'HOENN:KAREN': 1 }, gift: {}, tier: {}, steps: 0, lastCallAt: Date.now() }),
		};
		const page = await open(null, 0, 0, { save });
		const at = await where(page);
		const l = await step(page, 'left');
		const back = await step(page, 'right');
		const d = await step(page, 'down');
		const g = await page.evaluate(() => window.__ow.gateReport().blockedBy);
		A(at.map === 'Route107' && at.x === 4 && at.y === 10 && l.x === 3 && back.x === 4 && d.y === 11 && !g,
			'[1792723600759] (guard) a save on Route107 (4,10) steps west, back, and south off the sand', JSON.stringify({ at, l, back, d, g }));
		await page.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
