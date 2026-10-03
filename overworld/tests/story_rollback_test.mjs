// story_rollback_test.mjs — a reload must never roll earned story progress back.
//
// Incident (instinctloretest0918, 2026-10-01 12:08): after a normal browser-session
// replacement, the save came back with 21 earned flags missing (Fortree badge,
// Maxie/Groudon, Lilycove/Mossdeep, Slateport/Stern) and 13 vars changed, while
// party, bag, money and defeated trainers survived — and the damaged story was
// then PUSHED, so local and server "agreed" on it.
//
// Mechanism (reproduced here on a copied fixture — never the live save):
// events.js reads magepunk_story ONCE at import and every setFlag/setVar/clearFlag
// wrote that WHOLE cached object back. Any cache older than storage (another tab,
// a storage restore after import, the hydrate's "adopt the newer remote, then
// reload" window) silently replaced the newer story on its next write, without
// bumping the revision. The next boot then saw same-revision divergence, kept the
// (damaged) local copy and published it.
//
//   1. a stale import-time cache: storage is replaced underneath; the next write
//      rebases onto it instead of erasing it
//   2. another tab: progress made in tab B survives tab A's next write, and tab A
//      reads it
//   3. a write that changes nothing writes nothing (no revision jumps)
//   4. same revision, local story a strict regression of the server's: the server's
//      story is adopted, the local copy is preserved as the conflict, and the
//      repaired story is what gets pushed
//   5. newer remote: adopted whole; boot writes in the reload window can't undo it
//   6. intended clears stay cleared across reloads
//   7. repeated reloads are idempotent: same story, no revision movement
//
//   node overworld/tests/story_rollback_test.mjs
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
const PORT = 9185;
const REV = 'magepunk_ow_rev';
const STATE = { username: 'storyroll', friendCode: 'STORYR', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---------- the fixture: the report's exact before/after story difference ----------
const LOST_FLAGS = ['FLAG_HAS_MATCH_CALL', 'FLAG_HIDE_ROUTE_121_TEAM_AQUA_GRUNTS', 'tier_reward_5', 'FLAG_DEFEATED_FORTREE_GYM', 'FLAG_BADGE06_GET',
	'FLAG_RECEIVED_TM_AERIAL_ACE', 'FLAG_ENABLE_WINONA_MATCH_CALL', 'FLAG_SCOTT_CALL_FORTREE_GYM', 'rival_tier5_done', 'FLAG_VISITED_LILYCOVE_CITY',
	'FLAG_HIDE_LILYCOVE_CONTEST_HALL_REPORTER', 'FLAG_VISITED_MOSSDEEP_CITY', 'FLAG_TEAM_AQUA_ESCAPED_IN_SUBMARINE', 'FLAG_HIDE_LILYCOVE_CITY_AQUA_GRUNTS',
	'FLAG_HIDE_MAGMA_HIDEOUT_4F_GROUDON_ASLEEP', 'FLAG_HIDE_MAGMA_HIDEOUT_4F_GROUDON', 'FLAG_GROUDON_AWAKENED_MAGMA_HIDEOUT', 'FLAG_HIDE_MAGMA_HIDEOUT_GRUNTS',
	'FLAG_HIDE_SLATEPORT_CITY_GABBY_AND_TY', 'FLAG_HIDE_SLATEPORT_CITY_CAPTAIN_STERN', 'FLAG_HIDE_SLATEPORT_CITY_HARBOR_PATRONS'];
const LOST_VARS = { VAR_ROUTE121_STATE: 1, VAR_SCOTT_FORTREE_CALL_STEP_COUNTER: 0, VAR_0x8007: 5, VAR_SLATEPORT_CITY_STATE: 2, VAR_SLATEPORT_HARBOR_STATE: 1 };
const COMMON_FLAGS = { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, FLAG_BADGE01_GET: true, FLAG_BADGE05_GET: true, FLAG_DEFEATED_PETALBURG_GYM: true };
for (let i = 0; i < 290; i++) COMMON_FLAGS['FLAG_FIXTURE_' + i] = true;          // ~318 flags, like the save
const COMMON_VARS = { VAR_LITTLEROOT_INTRO_STATE: 7, VAR_PETALBURG_GYM_STATE: 6 };
for (let i = 0; i < 80; i++) COMMON_VARS['VAR_FIXTURE_' + i] = i;
let NEW_STORY = { flags: { ...COMMON_FLAGS, ...Object.fromEntries(LOST_FLAGS.map(f => [f, true])) }, vars: { ...COMMON_VARS, ...LOST_VARS } };
let OLD_STORY = { flags: { ...COMMON_FLAGS }, vars: { ...COMMON_VARS } };
const PARTY = [{ speciesId: 'blastoise', name: 'BLASTOISE', level: 70, gender: 'M', friend: 70, types: ['Water'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 200, atk: 150, def: 150, spa: 150, spd: 150, spe: 150 }, maxHP: 200, curHP: 200, exp: 343000, moves: [{ id: 'surf', name: 'Surf', pp: 15, maxPp: 15 }], sprite: 's9.png', num: 9 }];
const baseKeys = story => ({
	magepunk_region: 'HOENN', magepunk_party_v1: JSON.stringify(PARTY), magepunk_story: JSON.stringify(story),
	magepunk_pos_v1: JSON.stringify({ map: 'SlateportCity', x: 20, y: 20, back: null }),
	magepunk_settings: JSON.stringify({ textSpeed: 'instant' }),
});

// ---------- mock server: ow-save / ow-load with revisions ----------
const DB = new Map();
let SEED = null;              // localStorage the NEXT page load starts from
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/__seed') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(SEED)); SEED = null; return; }
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		const send = o => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		const key = 'ow:' + STATE.username;
		if (b.action === 'ow-load') return send({ ow: DB.get(key) || null });
		if (b.action === 'ow-save') { DB.set(key, { ow: b.ow, updated_at: Date.now() }); return send({ ok: true }); }
		return send({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [] });
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));
const srvStory = () => { const r = DB.get('ow:' + STATE.username); return r && JSON.parse(r.ow.magepunk_story || 'null'); };
const srvRev = () => { const r = DB.get('ow:' + STATE.username); return r ? parseInt(r.ow[REV], 10) || 0 : 0; };
const setServer = (story, rev) => DB.set('ow:' + STATE.username, { ow: { ...baseKeys(story), [REV]: String(rev) }, updated_at: Date.now() });
const missingFrom = s => LOST_FLAGS.filter(f => !(s && s.flags && s.flags[f]));
const varsMissing = s => Object.entries(LOST_VARS).filter(([k, v]) => !(s && s.vars && s.vars[k] === v)).map(([k]) => k);

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const ctx = await browser.createBrowserContext();
	const errors = [];
	const mkPage = async () => {
		const p = await ctx.newPage();
		p.on('pageerror', e => errors.push(String(e.message)));
		// a pending SEED replaces this origin's storage before any game script runs
		await p.evaluateOnNewDocument(st => {
			try {
				const x = new XMLHttpRequest(); x.open('GET', '/__seed', false); x.send();
				const seed = JSON.parse(x.responseText || 'null');
				if (seed) {
					localStorage.clear(); sessionStorage.clear();
					for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
				}
			} catch (e) {}
			localStorage.setItem('magepunk_mp_token_v1', 't');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		}, STATE);
		return p;
	};
	const boot = async p => {
		await p.goto(`http://localhost:${PORT}/overworld/index.html?synclog=1`, { waitUntil: 'domcontentloaded' });
		// a hydrate may reload once: wait until the game is up AND has stayed up
		let stable = 0;
		for (let i = 0; i < 400 && stable < 8; i++) {
			const up = await p.evaluate(() => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current)).catch(() => false);
			stable = up ? stable + 1 : 0;
			await sleep(150);
		}
		await sleep(1200);
	};
	const localStory = p => p.evaluate(() => JSON.parse(localStorage.getItem('magepunk_story') || 'null'));
	const localRev = p => p.evaluate(() => parseInt(localStorage.getItem('magepunk_ow_rev'), 10) || 0);
	const runtime = p => p.evaluate(async flags => { const S = await import('./events.js'); return flags.filter(f => !S.getStoredFlag(f)); }, LOST_FLAGS);   // what the in-memory STORE holds (badge flags read through the badges otherwise)

	// ===== 1. a stale import-time cache =====
	{
		SEED = { ...baseKeys(OLD_STORY), [REV]: '100' };
		setServer(OLD_STORY, 100);
		const p = await mkPage();
		await boot(p);
		// storage is replaced underneath the running page (a restore, another tab, a hydrate)
		await p.evaluate(s => localStorage.setItem('magepunk_story', s), JSON.stringify(NEW_STORY));
		await p.evaluate(async () => { const S = await import('./events.js'); S.setFlag('FLAG_AFTER_RESTORE'); });
		const st = await localStory(p);
		A(missingFrom(st).length === 0 && varsMissing(st).length === 0, '[stale cache] a write after storage was replaced keeps every newer flag and var', JSON.stringify({ lostFlags: missingFrom(st), lostVars: varsMissing(st) }));
		A(st && st.flags.FLAG_AFTER_RESTORE === true, '[stale cache] ...and still applies its own change');
		A((await runtime(p)).length === 0, '[stale cache] ...and the page now READS the newer story too', JSON.stringify(await runtime(p)));
		await p.close();
	}

	// ===== 2. two tabs =====
	{
		SEED = { ...baseKeys(OLD_STORY), [REV]: '200' };
		setServer(OLD_STORY, 200);
		const a = await mkPage(); await boot(a);
		const b = await mkPage(); await boot(b);
		// tab B earns progress
		await b.evaluate(async flags => { const S = await import('./events.js'); for (const f of flags) S.setFlag(f); S.setVar('VAR_SLATEPORT_CITY_STATE', 2); }, LOST_FLAGS);
		await sleep(300);
		A((await runtime(a)).length === 0, '[two tabs] tab A sees the progress tab B earned', JSON.stringify(await runtime(a)));
		// tab A, which loaded first, tries to write — since the one-active-tab lock
		// (tab_lock.js) the older tab is paused, so its write is dropped
		await a.evaluate(async () => { const S = await import('./events.js'); S.setVar('VAR_TAB_A', 1); S.clearFlag('FLAG_FIXTURE_0'); });
		const st = await localStory(a);
		A(missingFrom(st).length === 0 && st.vars.VAR_SLATEPORT_CITY_STATE === 2, '[two tabs] tab A\'s write does not erase tab B\'s progress', JSON.stringify(missingFrom(st)));
		A(st.vars.VAR_TAB_A === undefined && !!st.flags.FLAG_FIXTURE_0 && await a.evaluate(() => !!document.getElementById('tab-paused')), '[two tabs] ...tab A is paused: its write is dropped');
		// the active tab's own set and CLEAR both land (no blind union)
		await b.evaluate(async () => { const S = await import('./events.js'); S.setVar('VAR_TAB_B', 1); S.clearFlag('FLAG_FIXTURE_0'); });
		const st2 = await localStory(b);
		A(st2.vars.VAR_TAB_B === 1 && !st2.flags.FLAG_FIXTURE_0 && missingFrom(st2).length === 0, '[two tabs] ...and the active tab\'s own set and CLEAR both land (no blind union)', JSON.stringify({ v: st2.vars.VAR_TAB_B, f: st2.flags.FLAG_FIXTURE_0 }));
		await a.close(); await b.close();
	}

	// ===== 3. no-op writes write nothing =====
	{
		SEED = { ...baseKeys(NEW_STORY), [REV]: '300' };
		setServer(NEW_STORY, 300);
		const p = await mkPage(); await boot(p);
		const raw0 = await p.evaluate(() => localStorage.getItem('magepunk_story'));
		await p.evaluate(async () => { const S = await import('./events.js'); S.setFlag('FLAG_BADGE06_GET'); S.setVar('VAR_SLATEPORT_CITY_STATE', 2); S.clearFlag('FLAG_NEVER_SET'); });
		const raw1 = await p.evaluate(() => localStorage.getItem('magepunk_story'));
		A(raw0 === raw1, 'setting a flag/var to the value it already has does not rewrite the story');
		// from here on, the stories are what a BOOTED game holds (boot seeds a few
		// flags of its own; a real server copy was written by a booted game too)
		NEW_STORY = JSON.parse(raw1);
		OLD_STORY = JSON.parse(raw1);
		for (const f of LOST_FLAGS) delete OLD_STORY.flags[f];
		for (const k of Object.keys(LOST_VARS)) delete OLD_STORY.vars[k];
		await p.close();
	}

	// ===== 4. same revision, local story a strict regression (the incident) =====
	{
		SEED = { ...baseKeys(OLD_STORY), [REV]: '24603' };
		setServer(NEW_STORY, 24603);
		const p = await mkPage(); await boot(p);
		const st = await localStory(p);
		A(missingFrom(st).length === 0 && varsMissing(st).length === 0, '[same rev] the local story that lost earned progress is repaired from the server copy', JSON.stringify({ lostFlags: missingFrom(st), lostVars: varsMissing(st) }));
		A((await runtime(p)).length === 0, '[same rev] ...and the running game reads the repaired story', JSON.stringify(await runtime(p)));
		const c = await p.evaluate(() => JSON.parse(localStorage.getItem('magepunk_ow_conflict') || 'null'));
		A(c && c.ow && JSON.parse(c.ow.magepunk_story).flags.FLAG_BADGE06_GET, '[same rev] the server copy is preserved as the conflict record, as before', JSON.stringify(c && { reason: c.reason }));
		const sc = await p.evaluate(() => JSON.parse(localStorage.getItem('magepunk_ow_story_conflict') || 'null'));
		A(sc && JSON.parse(sc.story).flags.FLAG_FIXTURE_1 && !JSON.parse(sc.story).flags.FLAG_BADGE06_GET && sc.missing.length === LOST_FLAGS.length,
			'[same rev] ...and the local story it replaced is kept too (nothing discarded)', JSON.stringify(sc && { reason: sc.reason, missing: sc.missing.length }));
		await sleep(800);
		await p.evaluate(() => window.__ow.pushOwForTest());
		A(missingFrom(srvStory()).length === 0, '[same rev] what reaches the server keeps every earned flag', JSON.stringify(missingFrom(srvStory())));
		A(srvRev() > 24603, '[same rev] ...at a revision above the tie', String(srvRev()));
		// ===== 7. repeated reloads are idempotent =====
		const rev0 = await localRev(p), raw0 = await p.evaluate(() => localStorage.getItem('magepunk_story'));
		for (let i = 0; i < 3; i++) { await p.reload({ waitUntil: 'domcontentloaded' }); await boot(p); }
		const rev1 = await localRev(p), raw1 = await p.evaluate(() => localStorage.getItem('magepunk_story'));
		A(raw1 === raw0, '[reload x3] the story is byte-identical after three reloads');
		A(rev1 === rev0, '[reload x3] ...and the revision did not move', JSON.stringify({ rev0, rev1 }));
		// ===== 6. an intended clear survives a reload =====
		await p.evaluate(async () => { const S = await import('./events.js'); S.clearFlag('FLAG_HIDE_SLATEPORT_CITY_GABBY_AND_TY'); });
		await p.evaluate(() => window.__ow.pushOwForTest());
		await p.reload({ waitUntil: 'domcontentloaded' }); await boot(p);
		A(await p.evaluate(async () => { const S = await import('./events.js'); return S.getFlag('FLAG_HIDE_SLATEPORT_CITY_GABBY_AND_TY') === false; }),
			'an intentionally CLEARED flag stays cleared across a reload');
		await p.close();
	}

	// ===== 5. newer remote: adopted whole, and the reload window can't undo it =====
	{
		SEED = { ...baseKeys(OLD_STORY), [REV]: '500' };
		setServer(NEW_STORY, 501);
		const p = await mkPage(); await boot(p);
		const st = await localStory(p);
		A(missingFrom(st).length === 0 && varsMissing(st).length === 0, '[newer remote] the server\'s newer story is adopted whole', JSON.stringify({ lostFlags: missingFrom(st), lostVars: varsMissing(st) }));
		A((await runtime(p)).length === 0, '[newer remote] ...and the running game reads it');
		await p.evaluate(() => window.__ow.pushOwForTest());
		A(missingFrom(srvStory()).length === 0, '[newer remote] nothing older is pushed back over it', JSON.stringify(missingFrom(srvStory())));
		await p.close();
	}

	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
