// daily_flags_test.mjs — the once-a-day flags come back each real day.
//
// Emerald's ClearDailyFlags (event_data.c, run by clock.c UpdatePerDay) wipes the
// FLAG_DAILY_* block (0x920-0x95F); Crystal's CheckDailyResetTimer
// (engine/overworld/time.asm) zeroes wDailyFlags1/2, wSwarmFlags and the phone's
// rematch / gift / weekday-call flags. FireRed has no clock. The port cleared none
// of them, so every daily berry, the LOTTERY ticket, the Goldenrod TM27 lady, the
// move tutor, the CLEFAIRY dance, ... ran once per save, forever.
//
// Now time_events.js updateDailyFlags clears them on the first TRAVEL of a new
// real day (its own day marker, VAR_MP_DAILY_RESET_DAY), never on the boot load:
//   1. the lists are exactly the decomps' daily blocks (MAGEPUNK_REF)
//   2. every script in the port that sets one of those flags is covered
//   3. the rule: next day clears, same day keeps, many days missed = one wipe,
//      the clock going back does nothing, a save from before this is due
//   4. in the game: LOADING a save with stale daily flags writes nothing; the first
//      trip clears them; the BERRY MASTER (Emerald) gives berries again, the
//      same day he doesn't, and after several missed days he does
//   5. Crystal: the GOLDENROD DEPT STORE 5F receptionist's Sunday TM comes back
//      the next Sunday (ENGINE_GOLDENROD_DEPT_STORE_TM27_RETURN)
//
//   node overworld/tests/daily_flags_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const DATA = path.join(ROOT, 'overworld', 'data');
const REF = process.env.MAGEPUNK_REF || 'C:/Users/guide/Desktop/Magepunk66/Reference';
const CHROME = process.env.CHROME || [
	'/opt/chrome/chrome',
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9786;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);

const T = await import('../time_events.js');
const Story = await import('../events.js');
const DAILY = new Set(T.DAILY_FLAGS || []);

// ---------------- 1. the decomps' daily blocks ----------------
{
	const efl = path.join(REF, 'pokeemerald/include/constants/flags.h');
	if (fs.existsSync(efl)) {
		const src = fs.readFileSync(efl, 'utf8');
		const named = [...src.matchAll(/#define (FLAG_\w+)\s+\(DAILY_FLAGS_START \+ 0x[0-9A-F]+\)/g)].map(m => m[1]).filter(f => !/^FLAG_UNUSED_/.test(f));
		A(named.length >= 10 && named.every(f => DAILY.has(f)) && (T.EMERALD_DAILY_FLAGS || []).length === named.length,
			`1. Emerald: the ${named.length} named flags of DAILY_FLAGS_START..END are the list ClearDailyFlags wipes`, named.filter(f => !DAILY.has(f)).join(','));
	} else console.log('skip - Emerald flags.h not found (MAGEPUNK_REF)');
	const cfl = path.join(REF, 'pokecrystal/constants/engine_flags.asm');
	if (fs.existsSync(cfl)) {
		// the consts under each of the sections CheckDailyResetTimer zeroes
		const WIPED = new Set(['wDailyFlags1', 'wDailyFlags2', 'wSwarmFlags', 'wDailyRematchFlags', 'wDailyPhoneItemFlags', 'wDailyPhoneTimeOfDayFlags']);
		const want = []; let sec = null;
		for (const line of fs.readFileSync(cfl, 'utf8').split(/\r?\n/)) {
			const s = /^; (w\w+)/.exec(line); if (s) { sec = s[1]; continue; }
			const c = /^\s*const (ENGINE_\w+)/.exec(line); if (c && WIPED.has(sec)) want.push(c[1]);
		}
		const tm = fs.readFileSync(path.join(REF, 'pokecrystal/engine/overworld/time.asm'), 'utf8');
		const reset = /CheckDailyResetTimer::[\s\S]*?jr RestartDailyResetTimer/.exec(tm)?.[0] || '';
		A([...WIPED].every(w => reset.includes(w)), '1. Crystal: CheckDailyResetTimer zeroes those six flag blocks');
		A(want.length === 78 && want.every(f => DAILY.has(f)) && (T.CRYSTAL_DAILY_FLAGS || []).length === want.length,
			`1. Crystal: all ${want.length} engine flags in them are the list the port wipes`, want.filter(f => !DAILY.has(f)).join(','));
	} else console.log('skip - Crystal engine_flags.asm not found (MAGEPUNK_REF)');
	const ffl = path.join(REF, 'pokefirered/include/constants/flags.h');
	if (fs.existsSync(ffl)) {
		A(!/DAILY/.test(fs.readFileSync(ffl, 'utf8')) && /\/\/\s*DoTimeBasedEvents\(\)/.test(fs.readFileSync(path.join(REF, 'pokefirered/src/scrcmd.c'), 'utf8')),
			'1. FireRed/LeafGreen: no daily flags, no clock (DoTimeBasedEvents commented out): nothing to reset');
	}
}

// ---------------- 2. every daily flag a port script sets is wiped ----------------
{
	const DAILYISH = /^(FLAG_DAILY_|ENGINE_)/;
	const setters = new Map();   // flag -> [map:label]
	const walk = (o, where) => {
		if (Array.isArray(o)) { for (const x of o) walk(x, where); return; }
		if (!o || typeof o !== 'object') return;
		if (o.op === 'setflag' && typeof o.flag === 'string' && DAILYISH.test(o.flag)) (setters.get(o.flag) || setters.set(o.flag, []).get(o.flag)).push(where);
		for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, where);
	};
	const dir = path.join(DATA, 'scripts');
	for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
		const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
		for (const [l, ops] of Object.entries(j)) walk(ops, f.replace(/\.json$/, '') + ':' + l);
	}
	// the decomps' daily flags a port script sets (Crystal's ENGINE_ flags outside
	// the daily blocks — badges, fly points, the POKeGEAR cards — are for keeps)
	const daily = [...setters.keys()].filter(f => /^FLAG_DAILY_/.test(f) || DAILY.has(f)).sort();
	const emerald = daily.filter(f => /^FLAG_DAILY_/.test(f));
	A(emerald.length >= 9 && emerald.every(f => DAILY.has(f)), `2. Emerald: all ${emerald.length} FLAG_DAILY_* the scripts set are wiped`, emerald.filter(f => !DAILY.has(f)).join(','));
	const crystal = daily.filter(f => /^ENGINE_/.test(f));
	A(crystal.length >= 10, `2. Crystal: ${crystal.length} daily engine flags set by scripts, all wiped`, crystal.join(','));
	for (const f of daily) console.log(`      ${f}  <- ${[...new Set(setters.get(f).map(w => w.split(':')[0]))].join(', ')}`);
	// and the old one-off: ENGINE_GOT_SHUCKIE_TODAY is native (giveShuckle), also wiped
	A(DAILY.has('ENGINE_GOT_SHUCKIE_TODAY'), '2. ENGINE_GOT_SHUCKIE_TODAY (set natively by MANIA) is one of them');
}

// ---------------- 3. the rule ----------------
if (typeof T.updateDailyFlags === 'function') {
	const F = 'FLAG_DAILY_ROUTE_114_RECEIVED_BERRY', C = 'ENGINE_DAILY_MOVE_TUTOR', V = T.DAILY_RESET_VAR;
	const D = 20000;
	Story.setFlag(F); Story.setFlag(C); Story.setFlag('FLAG_RECEIVED_HM_CUT');
	A(T.updateDailyFlags(D) === true && !Story.getFlag(F) && !Story.getFlag(C) && Story.getVar(V) === D,
		'3. a save from before this (no marker) is due: its stale daily flags clear, the day is stamped');
	A(Story.getFlag('FLAG_RECEIVED_HM_CUT'), '3. a flag that is not daily is untouched');
	Story.setFlag(F); Story.setFlag(C);
	A(T.updateDailyFlags(D) === false && Story.getFlag(F) && Story.getFlag(C), '3. the same day: set again, stays set (no double reset)');
	A(T.updateDailyFlags(D + 1) === true && !Story.getFlag(F) && !Story.getFlag(C) && Story.getVar(V) === D + 1, '3. the next day: cleared');
	Story.setFlag(F);
	A(T.updateDailyFlags(D + 1) === false && Story.getFlag(F), '3. ...and taken again that day, it holds');
	A(T.updateDailyFlags(D + 9) === true && !Story.getFlag(F) && Story.getVar(V) === D + 9, '3. eight days missed: one wipe, stamped with today');
	Story.setFlag(F);
	A(T.updateDailyFlags(D + 5) === false && Story.getFlag(F) && Story.getVar(V) === D + 9, '3. the clock set back: nothing (as UpdatePerDay)');
	Story.setVar('VAR_DAYS', D + 9);
	Story.setVar(V, D + 9);
	T.updatePerDay(D + 10);
	A(!Story.getFlag(F) && Story.getVar('VAR_DAYS') === D + 10, '3. updatePerDay (the travel hook) runs it with the rest of the day update');
} else A(false, '3. time_events.js has updateDailyFlags');

// ---------------- 4/5. in the game ----------------
const STATE = { username: 'daily', friendCode: 'DAILY1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const LEAD = { speciesId: 'swampert', name: 'SWAMPERT', level: 60, gender: 'M', friend: 70, types: ['Water'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 200, atk: 120, def: 110, spa: 100, spd: 100, spe: 110 }, maxHP: 200, curHP: 200,
	exp: 220000, moves: [{ id: 'surf', name: 'SURF', pp: 15, maxPp: 15 }], sprite: 's260.png', num: 260 };
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
async function boot({ map, x, y, region, flags = {}, vars = {}, weekday = null, party = [LEAD] }) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	const story = { flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, ...flags }, vars };
	await page.evaluateOnNewDocument((st, party, region, story, weekday) => {
		if (weekday != null) Date.prototype.getDay = function () { return weekday; };
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', region);
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify(story));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, party, region, story, weekday);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
	await sleep(900);
	return { page, ctx, errors, story };
}
const settle = page => page.evaluate(async () => {
	const O = window.__ow;
	const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
	const t0 = Date.now(); let calm = 0;
	while (Date.now() - t0 < 15000) {
		const d = O.dialog.blocking, c = O.cutscene.blocking, f = O.fade || { alpha: 0, target: 0 };
		if (!d && !c && f.alpha < 0.001 && f.target < 0.001 && !O.player.moving && !O.loading) { if (++calm >= 10) return 'idle'; } else calm = 0;
		if (d) press('z');
		await new Promise(r => setTimeout(r, 40));
	}
	return 'timeout';
});
const bagTotal = page => page.evaluate(() => Object.values(window.__ow.Bag.getBag()).reduce((a, b) => a + (+b || 0), 0));
// talk to the NPC at (nx, ny) from (px, py); returns how many items it gave
async function talk(page, px, py, facing) {
	const before = await bagTotal(page);
	await page.evaluate((px, py, facing) => { const O = window.__ow; O.player.setTile(px, py); O.player.facing = facing; O.interact(); }, px, py, facing);
	await settle(page);
	return (await bagTotal(page)) - before;
}
const travel = (page, map, x, y) => page.evaluate(async (map, x, y) => { await window.__ow.moveToMap(map, x, y); await new Promise(r => setTimeout(r, 400)); }, map, x, y);
const flag = (page, f) => page.evaluate(f => !!window.__ow.Story.getFlag(f), f);
const getVar = (page, v) => page.evaluate(v => window.__ow.Story.getVar(v), v);
const setVar = (page, v, n) => page.evaluate((v, n) => window.__ow.Story.setVar(v, n), v, n);

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--mute-audio', '--disable-gpu'] });
	const V = T.DAILY_RESET_VAR || 'VAR_MP_DAILY_RESET_DAY';

	// ---- 4. Emerald: the BERRY MASTER (Route 123), a save that took his berries days ago ----
	{
		const STALE = { FLAG_DAILY_BERRY_MASTER_RECEIVED_BERRY: true, FLAG_DAILY_BERRY_MASTERS_WIFE: true, FLAG_DAILY_PICKED_LOTO_TICKET: true, ENGINE_DAILY_MOVE_TUTOR: true };
		// a save from before the fix: no day marker at all
		const { page, ctx, errors, story } = await boot({ map: 'Route123_BerryMastersHouse', x: 4, y: 6, region: 'hoenn', flags: STALE, vars: { VAR_DAYS: today() } });
		const atLoad = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_story') || '{}'));
		const changed = [...new Set([...Object.keys(story.flags), ...Object.keys(atLoad.flags || {})])].filter(f => !!story.flags[f] !== !!(atLoad.flags || {})[f])
			.concat([...new Set([...Object.keys(story.vars), ...Object.keys(atLoad.vars || {})])].filter(v => story.vars[v] !== (atLoad.vars || {})[v]));
		A(Object.keys(STALE).every(f => atLoad.flags?.[f] === true) && !(V in (atLoad.vars || {})),
			'4. loading a save with stale daily flags clears nothing and stamps no day', JSON.stringify(atLoad.vars));
		A(!changed.some(k => DAILY.has(k) || k === V || k === 'VAR_DAYS'), '4. ...no daily flag, day stamp or VAR_DAYS changed at load', changed.filter(k => DAILY.has(k) || k === V || k === 'VAR_DAYS').join(','));
		A(await talk(page, 4, 5, 'up') === 0, '4. so until you travel, the BERRY MASTER still says "come back tomorrow"');
		await travel(page, 'Route123_BerryMastersHouse', 4, 6);
		A(!(await flag(page, 'FLAG_DAILY_BERRY_MASTER_RECEIVED_BERRY')) && !(await flag(page, 'FLAG_DAILY_PICKED_LOTO_TICKET')) && !(await flag(page, 'ENGINE_DAILY_MOVE_TUTOR')),
			'4. the first trip of the day clears them (the existing save catches up)');
		A(await getVar(page, V) === today(), '4. ...and stamps today', String(await getVar(page, V)));
		const got = await talk(page, 4, 5, 'up');
		A(got === 2 && await flag(page, 'FLAG_DAILY_BERRY_MASTER_RECEIVED_BERRY'), '4. the BERRY MASTER gives his two berries again', String(got));
		await travel(page, 'Route123_BerryMastersHouse', 4, 6);
		A(await flag(page, 'FLAG_DAILY_BERRY_MASTER_RECEIVED_BERRY') && await talk(page, 4, 5, 'up') === 0, '4. the same day, another trip: the flag holds, no berries');
		await setVar(page, V, today() - 1);
		await travel(page, 'Route123_BerryMastersHouse', 4, 6);
		A(await talk(page, 4, 5, 'up') === 2, '4. the next day: berries again');
		await setVar(page, V, today() - 5);
		await travel(page, 'Route123_BerryMastersHouse', 4, 6);
		A(!(await flag(page, 'FLAG_DAILY_BERRY_MASTER_RECEIVED_BERRY')) && await getVar(page, V) === today() && await talk(page, 4, 5, 'up') === 2,
			'4. five days missed: one catch-up, berries again');
		A(!errors.length, '4. no page errors', errors.join(' | '));
		await ctx.close();
	}
	// ---- 4. a load writes nothing: a played save (stamped yesterday, and one with no
	// stamp at all) with yesterday's daily flags, reloaded, stays byte-identical ----
	for (const stamp of [today() - 1, null]) {
		const { page, ctx, errors } = await boot({ map: 'Route123_BerryMastersHouse', x: 4, y: 6, region: 'hoenn', vars: { VAR_DAYS: today() - 1 } });
		await page.evaluate((V, stamp) => {
			const S = window.__ow.Story;
			S.setFlag('FLAG_DAILY_BERRY_MASTER_RECEIVED_BERRY'); S.setFlag('ENGINE_KURT_MAKING_BALLS');
			if (stamp != null) S.setVar(V, stamp);
		}, V, stamp);
		await sleep(300);
		const before = await page.evaluate(() => localStorage.getItem('magepunk_story'));
		await page.reload({ waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current)).catch(() => false)); i++) await sleep(100);
		await sleep(1500);
		const after = await page.evaluate(() => localStorage.getItem('magepunk_story'));
		A(before === after && JSON.parse(after).flags.FLAG_DAILY_BERRY_MASTER_RECEIVED_BERRY === true,
			`4. reloading a save ${stamp == null ? 'with no day stamp' : 'stamped yesterday'}: the story save is byte-identical, yesterday's flags still set`,
			before === after ? '' : `${before.length} -> ${after.length}`);
		A(!errors.length, '4. no page errors', errors.join(' | '));
		await ctx.close();
	}

	// ---- 5. Crystal: the GOLDENROD DEPT STORE 5F receptionist's Sunday TM ----
	{
		const { page, ctx, errors } = await boot({ map: 'GoldenrodDeptStore5F', x: 7, y: 7, region: 'johto', weekday: 0, party: [{ ...LEAD, friend: 255 }],
			flags: { ENGINE_GOLDENROD_DEPT_STORE_TM27_RETURN: true }, vars: { [V]: today() - 7 } });
		A(await flag(page, 'ENGINE_GOLDENROD_DEPT_STORE_TM27_RETURN'), '5. loading on Sunday: last Sunday\'s flag is untouched');
		A(await talk(page, 7, 6, 'up') === 0, '5. ...so she has nothing for you yet');
		await travel(page, 'GoldenrodDeptStore5F', 7, 7);
		A(!(await flag(page, 'ENGINE_GOLDENROD_DEPT_STORE_TM27_RETURN')), '5. a week later, on the first trip: ENGINE_GOLDENROD_DEPT_STORE_TM27_RETURN clears');
		const got = await talk(page, 7, 6, 'up');
		A(got === 1 && await flag(page, 'ENGINE_GOLDENROD_DEPT_STORE_TM27_RETURN'), '5. she gives her TM again', String(got));
		await travel(page, 'GoldenrodDeptStore5F', 7, 7);
		A(await talk(page, 7, 6, 'up') === 0, '5. the same day, another trip: no second TM');
		A(!errors.length, '5. no page errors', errors.join(' | '));
		await ctx.close();
	}
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
