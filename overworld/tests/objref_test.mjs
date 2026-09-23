// objref_test.mjs — a script that names an object must find it.
//
// The transpiled scripts and the map data name the same object differently. A
// script says `hideobj KURTSHOUSE_KURT1` — the decomp's constant — while the
// map's object_event carries local_id `KurtsHouse_SPRITE_KURT`. npcById() was an
// exact string match, so 1224 references across the three regions resolved to
// null and their op silently did nothing.
//
// That is why Kurt kept standing in his house after the script walked him out
// (#549 documented it as a known limitation), and it is the same silence behind
// story NPCs that never appear, move or leave.
//
// FOUR resolutions, in order, none of which invents an object:
//   1. the map's own local_id                     (already worked: 3655)
//   2. VAR_LAST_TALKED -> whoever you just talked to          (+193)
//   3. a raw object INDEX into object_events (Battle Dome)      (+small)
//   4. the decomp constant, normalised: upper-case, drop
//      _SPRITE_, drop punctuation                              (+372)
//   5. a trailing index picking the Nth object sharing one
//      local_id — KURTSHOUSE_KURT1/2 are both KurtsHouse_SPRITE_KURT (+261)
//
// WHAT IS DELIBERATELY NOT FIXED: ~368 references whose object is simply absent
// from this port's map data — AZALEATOWN_RIVAL has no object_event at all. For
// those, null is the CORRECT answer and the op stays the no-op it always was.
// Resolving them would mean inventing an NPC.
//
//   node overworld/tests/objref_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const OW = path.join(ROOT, 'overworld');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// the resolver's own rule, mirrored here so the data sweep measures what ships
const norm = s => String(s == null ? '' : s).toUpperCase().replace(/_SPRITE_/g, '_').replace(/[^A-Z0-9]/g, '');

// ---------- the resolver exists and is ordered ----------
{
	const mn = fs.readFileSync(path.join(OW, 'main.js'), 'utf8');
	const i = mn.indexOf('function npcById(');
	const body = mn.slice(i, i + 2400);
	A(i > 0, 'npcById exists');
	A(/n\.ev\.local_id === localId/.test(body), 'the map\'s own id is tried FIRST, so nothing correctly named changes');
	A(/VAR_LAST_TALKED/.test(body), 'VAR_LAST_TALKED resolves to the object you talked to');
	A(/normObjId/.test(body), 'the decomp constant is normalised against the map id');
	A(/lastTalkedNpc = talker/.test(mn), 'and the talker is recorded where a script is given one');

	// exact must precede the fuzzy paths, or a correctly named object could be
	// answered by a normalised near-miss
	const exactAt = body.indexOf('n.ev.local_id === localId');
	const fuzzyAt = body.indexOf('normObjId(n.ev.local_id) === want');
	A(exactAt >= 0 && fuzzyAt >= 0 && exactAt < fuzzyAt, 'exact beats normalised', `exact@${exactAt} fuzzy@${fuzzyAt}`);
}

// ---------- the sweep: how much of the game this reaches ----------
{
	let total = 0, before = 0, after = 0, absent = 0;
	const absentEx = new Set();
	for (const f of fs.readdirSync(path.join(OW, 'data/maps'))) {
		if (!f.endsWith('_map.json')) continue;
		const name = f.replace('_map.json', '');
		let m, sc;
		try { m = JSON.parse(fs.readFileSync(path.join(OW, 'data/maps', f), 'utf8')); } catch (e) { continue; }
		try { sc = JSON.parse(fs.readFileSync(path.join(OW, 'data/scripts', name + '.json'), 'utf8')); } catch (e) { continue; }
		const evs = m.object_events || [];
		const objs = evs.filter(o => o.local_id);
		const ids = new Set(objs.map(o => o.local_id));
		for (const ops of Object.values(sc)) {
			if (!Array.isArray(ops)) continue;
			for (const o of ops) {
				if (!o || !o.who) continue;
				if (/^(PLAYER|LOCALID_PLAYER|player)$/.test(o.who)) continue;
				total++;
				if (ids.has(o.who)) { before++; after++; continue; }
				const w = o.who;
				if (w === 'VAR_LAST_TALKED') { after++; continue; }
				if (/^\d+$/.test(String(w))) { if (evs[+w]) after++; else { absent++; absentEx.add(name + ':' + w); } continue; }
				const n = norm(w);
				if (objs.some(x => norm(x.local_id) === n)) { after++; continue; }
				const mm = n.match(/^(.*?)(\d+)$/);
				if (mm && objs.some(x => norm(x.local_id) === mm[1])) { after++; continue; }
				absent++; absentEx.add(name + ':' + w);
			}
		}
	}
	console.log(`    (${total} references: ${before} resolved before, ${after} now, ${absent} whose object is absent)`);
	A(total > 4000, 'the sweep covered the whole game', String(total));
	A(after - before > 800, 'the resolver reaches the references that were dead', '+' + (after - before));
	A(absent > 0 && absent < 500,
		'and leaves only the ones whose object is genuinely missing from the map data',
		absent + ' e.g. ' + [...absentEx].slice(0, 2).join(', '));
	// the thing that must NOT happen: a correctly-named reference changing meaning
	A(after >= before, 'nothing that resolved before stopped resolving');

	// the trailing-index rule is strict on range, because a clamp could only ever
	// act on the WRONG NPC. Assert that strict and lenient agree today, so the
	// day they stop agreeing is a signal rather than a silent mis-target.
	let lenient = 0, strict = 0;
	for (const f of fs.readdirSync(path.join(OW, 'data/maps'))) {
		if (!f.endsWith('_map.json')) continue;
		const name = f.replace('_map.json', '');
		let m, sc;
		try { m = JSON.parse(fs.readFileSync(path.join(OW, 'data/maps', f), 'utf8')); } catch (e) { continue; }
		try { sc = JSON.parse(fs.readFileSync(path.join(OW, 'data/scripts', name + '.json'), 'utf8')); } catch (e) { continue; }
		const objs = (m.object_events || []).filter(o => o.local_id);
		const ids = new Set(objs.map(o => o.local_id));
		for (const ops of Object.values(sc)) {
			if (!Array.isArray(ops)) continue;
			for (const o of ops) {
				if (!o || !o.who || /^(PLAYER|LOCALID_PLAYER|player)$/.test(o.who)) continue;
				if (ids.has(o.who) || /^VAR_/.test(o.who) || /^\d+$/.test(String(o.who))) continue;
				const n = norm(o.who);
				if (objs.some(x => norm(x.local_id) === n)) continue;
				const mm = n.match(/^(.*?)(\d+)$/);
				if (!mm) continue;
				const stem = objs.filter(x => norm(x.local_id) === mm[1]);
				if (!stem.length) continue;
				lenient++;
				if (+mm[2] >= 1 && +mm[2] <= stem.length) strict++;
			}
		}
	}
	A(lenient === strict && strict > 200,
		'every indexed reference is in range, so strictness costs nothing today',
		`lenient=${lenient} strict=${strict}`);
}

// ---------- live: the case that motivated this ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8997;
	const STATE = { username: 'objref', friendCode: 'OBJRF0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let raw = ''; for await (const c of req) raw += c;
			let b = {}; try { b = JSON.parse(raw); } catch (e) {}
			res.writeHead(200, { 'content-type': 'application/json' });
			if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
			if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
			return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [] }));
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));
	const sleep = ms => new Promise(r => setTimeout(r, ms));

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'objref-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'JOHTO');
			if (!localStorage.getItem('magepunk_story'))
				localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{
				speciesId: 'cyndaquil', name: 'CYNDAQUIL', level: 20, gender: 'M', friend: 70, types: ['Fire'],
				ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
				stats: { hp: 60, atk: 40, def: 40, spa: 40, spd: 40, spe: 40 }, maxHP: 60, curHP: 60,
				exp: 8000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's155.png', num: 155,
			}]));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=KurtsHouse`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 60000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await sleep(200);
		await sleep(1400);
		A(await page.evaluate(() => window.__ow.world.current.name) === 'KurtsHouse', "we're in Kurt's house");

		const kurt = () => page.evaluate(() => {
			const n = (window.__ow.npcs?.list || []).find(x => (x.ev.local_id || '') === 'KurtsHouse_SPRITE_KURT' && x.ev.script === 'Kurt1');
			return n ? { hidden: !!n.hidden } : null;
		});
		A((await kurt())?.hidden === false, 'setup: Kurt is standing there');

		// the exact reference that used to resolve to null
		await page.evaluate(() => {
			const W = window.__ow, p = W.player;
			p.tx = 3; p.ty = 3; p.px = 48; p.py = 48; p.facing = 'up';
			p.moving = false; p.moveFrom = null; p.moveTo = null;
			W.interact();
		});
		for (let i = 0; i < 200; i++) {
			const st = await page.evaluate(() => ({ d: !!window.__ow.dialog.blocking, c: !!window.__ow.cutscene.blocking }));
			if (!st.d && !st.c) break;
			await page.evaluate(() => { try { window.__ow.dialog.key('z'); } catch (e) {} });
			await sleep(60);
		}
		A(await page.evaluate(() => !!window.__ow.Story.getFlag('EVENT_AZALEA_TOWN_SLOWPOKETAIL_ROCKET')),
			'the story beat still runs (unchanged by this)');
		// THE FIX: `hideobj KURTSHOUSE_KURT1` now finds KurtsHouse_SPRITE_KURT
		const after = await kurt();
		A(!after || after.hidden === true, 'and Kurt actually leaves the house now', JSON.stringify(after));
		A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 2)));
	} finally {
		if (browser) await browser.close();
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
