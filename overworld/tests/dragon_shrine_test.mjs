// dragon_shrine_test.mjs — CLAIR -> the DRAGON SHRINE test -> the RISING BADGE ->
// Dragon's Den TM24 -> the elder's DRATINI, played on the real maps.
//
// bug:1794346972336 (2026-11-10, instinctgauntlet): beating Clair put the RISING
// BADGE in the ledger at once, while she says she'll recognise you only after the
// shrine test; entering the shrine never played the test (Crystal's scene-0 entry
// scenes are not in the transpiled onFrame tables), so the elder offered the
// Dratini straight away and no Clair / badge ceremony ever happened.
//
//   static: every non-trivial scene-0 entry scene in the shipped scripts has a
//           decision in crystal_entry_scenes.js (run, or skip with a reason)
//   live A (a fresh run): talk to Clair, win -> no badge yet, the objective points
//           at the shrine; enter -> the test plays (one wrong answer, a reload mid-
//           test restarts it from the door) -> Clair -> the badge exactly once;
//           reload -> no replay; Den B1F TM24 once; full party -> the elder refuses
//           and keeps the gift; room -> DRATINI without EXTREMESPEED; revisits
//           repeat nothing
//   live B (the tester's save): the badge already held from the old Clair award,
//           the scene var absent -> the test still plays, no second badge
//   live C: before Clair, the shrine plays nothing
//
//   node overworld/tests/dragon_shrine_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const DATA = path.join(ROOT, 'overworld', 'data');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- static: the scene-0 audit ----------
{
	globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem() {}, removeItem() {} };
	const { CRYSTAL_ENTRY_SCENES } = await import(pathToFileURL(path.join(ROOT, 'overworld', 'crystal_entry_scenes.js')).href);
	const undecided = [], runMissing = [];
	// a coord_event's script can be named ...Scene too (Route 32's cooltrainer): not an entry scene
	const coordScripts = new Set();
	for (const f of fs.readdirSync(path.join(DATA, 'maps'))) {
		if (!f.endsWith('_map.json')) continue;
		try { for (const c of JSON.parse(fs.readFileSync(path.join(DATA, 'maps', f), 'utf8')).coord_events || []) coordScripts.add(c.script); } catch (e) { /* not a map */ }
	}
	for (const f of fs.readdirSync(path.join(DATA, 'scripts'))) {
		if (!f.endsWith('.json')) continue;
		const S = JSON.parse(fs.readFileSync(path.join(DATA, 'scripts', f), 'utf8'));
		const onFrame = new Set(((S.__map__ && S.__map__.onFrame) || []).map(e => e.label));
		const sceneVar = ((S.__map__ && S.__map__.onFrame) || []).some(e => /^VAR_SCENE_/.test(e.var));
		if (!sceneVar) continue;   // not a Crystal map with scenes
		// ...and a label some op jumps to or calls is a subroutine (Route32CooltrainerMContinueScene)
		const targets = new Set(Object.values(S).filter(Array.isArray).flat().map(o => o && o.label).filter(Boolean));
		for (const [label, ops] of Object.entries(S)) {
			if (!/^[A-Z]\w*Scene$/.test(label) || onFrame.has(label) || coordScripts.has(label) || targets.has(label) || !Array.isArray(ops)) continue;
			if (ops.every(o => o && (o.op === 'end'))) continue;   // a noop scene
			if (!CRYSTAL_ENTRY_SCENES[label]) undecided.push(`${f}:${label}`);
		}
	}
	A(!undecided.length, 'every non-trivial Crystal scene-0 entry scene is decided in crystal_entry_scenes.js', undecided.join(', '));
	for (const [label, e] of Object.entries(CRYSTAL_ENTRY_SCENES)) {
		if (e.run && !JSON.parse(fs.readFileSync(path.join(DATA, 'scripts', e.map + '.json'), 'utf8'))[label]) runMissing.push(label);
		if (!e.run && !e.skip) runMissing.push(label + ' (no decision)');
	}
	A(!runMissing.length, 'every "run" entry scene exists in its map script', runMissing.join(', '));
	A(CRYSTAL_ENTRY_SCENES.DragonShrineTakeTestScene?.run, 'the Dragon Shrine test is an entry scene the port runs');
}

// ---------- live ----------
const puppeteer = (await import('puppeteer-core')).default;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9467;
const STATE = { username: 'dshrine', friendCode: 'DSHRN0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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

const mon = (speciesId, num) => ({
	speciesId, name: speciesId.toUpperCase(), level: 60, gender: 'M', friend: 70, types: ['Water'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 200, atk: 200, def: 200, spa: 200, spd: 200, spe: 200 }, maxHP: 200, curHP: 200,
	exp: 200000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: `s${num}.png`, num,
});
const SIX = [['totodile', 158], ['pidgeotto', 17], ['geodude', 74], ['onix', 95], ['zubat', 41], ['abra', 63]].map(([s, n]) => mon(s, n));
const JOHTO7 = { zephyr: true, hive: true, plain: true, fog: true, storm: true, mineral: true, glacier: true };
const KANTO8 = { boulder: true, cascade: true, thunder: true, rainbow: true, soul: true, marsh: true, volcano: true, earth: true };
const HOENN7 = { stone: true, knuckle: true, dynamo: true, heat: true, balance: true, feather: true, mind: true };
const BASE_FLAGS = { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, EVENT_CLEARED_RADIO_TOWER: true };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(st => {
		localStorage.setItem('magepunk_mp_token_v1', 'dshrine-token');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
	}, STATE);
	const W = (f, ...a) => page.evaluate(f, ...a);

	// a save: story + badges + party written before the page boots
	const seed = async ({ flags = {}, vars = {}, badges, party }) => {
		// a same-origin page that is not the game, so nothing saves over the seed on unload
		await page.goto(`http://localhost:${PORT}/__seed`, { waitUntil: 'domcontentloaded' }).catch(() => {});
		await W((flags, vars, badges, party) => {
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 'dshrine-token');
			localStorage.setItem('magepunk_region', 'JOHTO');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags, vars }));
			localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges, champion: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		}, { ...BASE_FLAGS, ...flags }, vars, badges, party);
	};
	const boot = async (map, x, y) => {
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 60000 && !(await W(() => !!window.__ow?.battle?.data && !!window.__ow?.world?.current).catch(() => false))) await sleep(200);
		await sleep(1500);
		await W(() => document.activeElement?.blur?.());
	};
	// press through dialog until a choice menu opens, a battle opens, or all is still
	const drive = (ms = 30000) => W(async ms => {
		const C = await import('./choice.js'), O = window.__ow;
		const t0 = Date.now(); let calm = 0;
		while (Date.now() - t0 < ms) {
			if (C.choiceMenu.open) return { at: 'menu', options: C.choiceMenu.options.slice() };
			if (O.battle.active || O.battle.blocking) return { at: 'battle' };
			const d = O.dialog.blocking, c = O.cutscene.blocking;
			if (!d && !c) { if (++calm >= 10) return { at: 'idle' }; } else calm = 0;
			if (d) { (window.__said = window.__said || []).push(JSON.stringify(O.dialog.pages || '')); O.dialog.revealed = 1e9; O.dialog.key('z'); }
			await new Promise(r => setTimeout(r, 40));
		}
		return { at: 'timeout' };
	}, ms);
	const pick = idx => W(async idx => { const C = await import('./choice.js'); C.choiceMenu.idx = idx; C.choiceKey('z'); }, idx);
	const st = () => W(() => {
		const O = window.__ow, S = O.Story;
		return {
			map: O.world.current?.name, tx: O.player.tx, ty: O.player.ty,
			rising: O.Badges.has('JOHTO', 'rising'), johto: O.Badges.count('JOHTO'),
			engine: S.getStoredFlag('ENGINE_RISINGBADGE'), beat: S.getFlag('EVENT_BEAT_CLAIR'),
			shrine: S.hasVar('VAR_SCENE_DragonShrine') ? S.getVar('VAR_SCENE_DragonShrine') : null,
			den: S.hasVar('VAR_SCENE_DragonsDenB1F') ? S.getVar('VAR_SCENE_DragonsDenB1F') : null,
			wrong: S.getFlag('EVENT_ANSWERED_DRAGON_MASTER_QUIZ_WRONG'), gotDratini: S.getFlag('EVENT_GOT_DRATINI'),
			tm: S.getFlag('EVENT_GOT_TM24_DRAGONBREATH'),
			dratini: O.party.filter(m => m.speciesId === 'dratini').map(m => (m.moves || []).map(v => v.id)),
			party: O.party.length,
			journalRising: (JSON.parse(localStorage.getItem('magepunk_journal_v1') || '[]')).filter(e => /Rising Badge/i.test(e.text)).length,
			objective: O.Quest.objective('JOHTO'),
			label: window.__ow.cutscene?.runningLabels?.() || null,
		};
	});
	const said = () => W(() => (window.__said || []).join(' | '));
	const clearSaid = () => W(() => { window.__said = []; });
	const talk = async (x, y, facing) => {
		await W((x, y, f) => { const O = window.__ow, p = O.player; p.tx = x; p.ty = y; p.px = x * 16; p.py = y * 16; p.facing = f; p.moving = false; window.__said = []; O.interact(); }, x, y, facing);
		await sleep(200);
		return drive();
	};
	const enter = async (map, x, y) => {
		await W(async (m, x, y) => { window.__said = []; await window.__ow.moveToMap(m, x, y); }, map, x, y);
		await sleep(300);
	};
	// the five questions by their menu, and the right answer for each (0-based)
	const RIGHT = { Pal: 0, Strategy: 0, 'Weak person': 1, Love: 0, Tough: 1 };
	const WRONG = { Strategy: 2 };   // "Cheating"
	// answer the test from its first menu; `wrongOnce` answers Q2 wrong once
	const runTest = async ({ wrongOnce = false, reloadAfterQ1 = null } = {}) => {
		const seen = [];
		let r = await drive(), wrongDone = false;
		for (let guard = 0; guard < 12 && r.at === 'menu'; guard++) {
			const first = r.options[0];
			seen.push(first);
			let idx = RIGHT[first];
			if (wrongOnce && !wrongDone && WRONG[first] != null) { idx = WRONG[first]; wrongDone = true; }
			await pick(idx);
			if (reloadAfterQ1 && first === 'Pal' && seen.length === 1) { await reloadAfterQ1(); return { seen, reloaded: true }; }
			r = await drive();
		}
		return { seen, end: r.at };
	};

	// ===== C: before Clair, the shrine plays nothing =====
	await seed({ badges: { JOHTO: JOHTO7, KANTO: KANTO8, HOENN: HOENN7 }, party: SIX.slice(0, 5) });
	await boot('DragonsDenB1F', 19, 30);
	await enter('DragonShrine', 4, 9);
	let r = await drive(4000);
	let s = await st();
	A(r.at === 'idle' && s.shrine === null && s.tx === 4 && s.ty === 9, 'before CLAIR is beaten, entering the shrine plays no test', JSON.stringify({ r, s }));

	// ===== A: a fresh run from Clair =====
	await seed({ badges: { JOHTO: JOHTO7, KANTO: KANTO8, HOENN: HOENN7 }, party: SIX.slice(0, 5) });
	await boot('BlackthornGym1F', 5, 4);
	r = await talk(5, 4, 'up');
	A(r.at === 'battle', 'talking to CLAIR starts her battle', JSON.stringify(r));
	await W(() => { if (window.__ow.battle.active) window.__ow.battle.finish('victory'); });
	{
		const t0 = Date.now(); let calm = 0;
		while (Date.now() - t0 < 30000 && calm < 3) {
			const x = await W(() => { const O = window.__ow;
				if (O.battle.active || O.battle.blocking) { try { O.battle.key('z'); } catch (e) {} return 'b'; }
				if (O.dialog.blocking) { (window.__said = window.__said || []).push(JSON.stringify(O.dialog.pages || '')); O.dialog.revealed = 1e9; O.dialog.key('z'); return 'd'; }
				if (O.cutscene.blocking) return 'c';
				return 'idle'; });
			calm = x === 'idle' ? calm + 1 : 0;
			await sleep(x === 'idle' ? 200 : 50);
		}
	}
	s = await st();
	A(s.beat, 'beating CLAIR sets EVENT_BEAT_CLAIR', JSON.stringify(s));
	A(!s.rising && s.johto === 7 && !s.engine, "but the RISING BADGE is NOT in the ledger yet (she sends you to Dragon's Den)", JSON.stringify(s));
	A(/DRAGON SHRINE/.test(s.objective), 'the objective points at the DRAGON SHRINE', s.objective);

	// through Dragon's Den B1F into the shrine (the B1F warp at (19,29) lands on (4,9))
	await enter('DragonsDenB1F', 19, 30);
	A((await st()).den === null, 'Den B1F: the TM scene is not armed yet');
	await enter('DragonShrine', 4, 9);
	// reload mid-test (after the first answer): the next load restarts it from the door
	const t1 = await runTest({ reloadAfterQ1: async () => { await sleep(300); await boot('DragonShrine', 5, 3); } });
	A(t1.seen[0] === 'Pal', 'entering the shrine plays the test: the first question opens', JSON.stringify(t1));
	s = await st();
	A(s.shrine === null && !s.rising, 'a reload mid-test leaves the scene unfinished and no badge', JSON.stringify(s));
	const t2 = await runTest({ wrongOnce: true });
	A(t2.seen.join(',') === 'Pal,Strategy,Strategy,Weak person,Love,Tough', 'after the reload the test restarts and asks all five (a wrong answer repeats its question)', JSON.stringify(t2));
	const words = await said();
	A(/CLAIR/i.test(words) && /RISING ?BADGE/i.test(words), 'Clair arrives and the ceremony hands over the RISING BADGE', words.slice(-400));
	s = await st();
	A(s.rising && s.johto === 8 && s.engine, 'the RISING BADGE is in the ledger now (JOHTO 8)', JSON.stringify(s));
	A(s.journalRising === 1, 'earned exactly once (one journal entry)', JSON.stringify(s));
	A(s.shrine === 1 && s.den === 1, "the shrine scene closes and Dragon's Den's TM scene is armed", JSON.stringify(s));
	A(s.wrong, 'the wrong answer was remembered (EVENT_ANSWERED_DRAGON_MASTER_QUIZ_WRONG)');

	// reload in the shrine: no replay
	await boot('DragonShrine', 4, 9);
	r = await drive(4000);
	s = await st();
	A(r.at === 'idle' && s.rising && s.journalRising === 1, 'a reload after the ceremony replays nothing', JSON.stringify({ r, s }));

	// Den B1F: step off the shrine warp onto (19,30) -> Clair's TM24 scene, once
	await enter('DragonsDenB1F', 19, 29);
	await page.keyboard.down('ArrowDown'); await sleep(450); await page.keyboard.up('ArrowDown');
	await drive();
	s = await st();
	A(s.tm && s.den === 0, "Dragon's Den: Clair hands over TM24 and the scene closes", JSON.stringify(s));
	await enter('DragonsDenB1F', 19, 29);
	await page.keyboard.down('ArrowDown'); await sleep(450); await page.keyboard.up('ArrowDown');
	r = await drive(4000);
	A(!/TM24|DRAGONBREATH/i.test(await said()), 'stepping there again plays nothing', await said());

	// full party: the elder refuses and the gift stays available
	await W(party => { const O = window.__ow; O.party.length = 0; for (const m of party) O.party.push(m); localStorage.setItem('magepunk_party_v1', JSON.stringify(party)); }, SIX);
	await enter('DragonShrine', 4, 9);
	r = await drive(4000);
	A(r.at === 'idle', 'entering the shrine again plays no test');
	r = await talk(5, 2, 'up');
	s = await st();
	A(/no room|full/i.test(await said()) && !s.gotDratini && !s.dratini.length, 'with a full party the elder says so and keeps the DRATINI for later', JSON.stringify({ said: await said(), s }));
	// reload, room in the party: the DRATINI, without EXTREMESPEED (one answer was wrong)
	await W(party => localStorage.setItem('magepunk_party_v1', JSON.stringify(party)), SIX.slice(0, 5));
	await boot('DragonShrine', 5, 2);
	r = await drive(4000);
	A(r.at === 'idle', 'reloaded in the shrine: still no test');
	await talk(5, 2, 'up');
	s = await st();
	A(s.gotDratini && s.dratini.length === 1, 'with room the elder gives the DRATINI', JSON.stringify(s));
	A(s.dratini[0] && !s.dratini[0].includes('extremespeed'), 'a wrong answer means no EXTREMESPEED', JSON.stringify(s.dratini));
	await talk(5, 2, 'up');
	await enter('DragonsDenB1F', 19, 29);
	await enter('DragonShrine', 4, 9);
	r = await drive(4000);
	await talk(5, 2, 'up');
	s = await st();
	A(r.at === 'idle' && s.dratini.length === 1 && s.johto === 8 && s.journalRising === 1, 'revisits: no test, no second DRATINI, no second badge', JSON.stringify(s));

	// ===== B: the tester's save — badge already held from the old Clair award =====
	await seed({ flags: { EVENT_BEAT_CLAIR: true }, badges: { JOHTO: { ...JOHTO7, rising: true }, KANTO: KANTO8, HOENN: HOENN7 }, party: SIX });
	await boot('DragonsDenB1F', 19, 30);
	await enter('DragonShrine', 4, 9);
	const t3 = await runTest();
	s = await st();
	A(t3.seen.length === 5, "the tester's save (badge held, scene absent): the test still plays", JSON.stringify(t3));
	A(s.rising && s.johto === 8 && s.journalRising === 0, 'and the ceremony adds no second badge', JSON.stringify(s));
	A(s.shrine === 1 && s.den === 1 && s.engine, 'the shrine closes and the Den TM scene is armed', JSON.stringify(s));
	await enter('DragonsDenB1F', 19, 29);
	await enter('DragonShrine', 4, 9);
	await talk(5, 2, 'up');
	s = await st();
	A(!s.gotDratini && s.party === 6, 'full party: no DRATINI, eligibility kept', JSON.stringify(s));

	A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 3)));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
