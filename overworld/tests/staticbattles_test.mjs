// staticbattles_test.mjs — the four gen 1-3 species that were catchable nowhere.
//
// The coverage report found exactly 15 gen 1-3 misses. Ten are faithful (Emerald
// really has no Roselia/Surskit/Meditite/Zangoose/Lunatone in a wild table, and
// Feebas ships as six secret Route119 tiles in code) and Jirachi is event-only.
// The other four were BUGS, all of the same shape — content the transpiler
// dropped, leaving a script that plays out in full and does nothing:
//
//   SNORLAX    `setwildbattle SPECIES_SNORLAX, 30` + `dowildbattle` vanished, but
//              the `setflag FLAG_HIDE_ROUTE_12_SNORLAX` right after it survived.
//              So the POKe FLUTE woke the Snorlax, it disappeared, no battle.
//   SUDOWOODO  same drop in Emerald; in Crystal `loadwildmon` + `startbattle`
//              came through as `trainerbattle` with an EMPTY trainer id.
//   TOGEPI     `giveegg TOGEPI, EGG_LEVEL` dropped, so Elm's aide ran her whole
//              scene and handed over nothing. TOGETIC fell with it.
//   LATIAS     never in LEGENDARY_ENCOUNTERS; its script route is
//              `BattleSetup_StartLatiBattle`, one of the 427 specials with no
//              handler.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/staticbattles_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const DATA = path.join(ROOT, 'overworld/data');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8916;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 60, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 200, atk: 140, def: 140, spa: 140, spd: 140, spe: 140 }, maxHP: 200, curHP: 200,
	exp: 216000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
}];
async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); }
	return false;
}

(async () => {
	// ---------- the ops are back in the scripts ----------
	const script = n => JSON.parse(fs.readFileSync(path.join(DATA, 'scripts', n + '.json'), 'utf8'));
	const opsIn = (doc, label) => (doc[label] || []);
	const findOp = (doc, kind) => Object.values(doc).flatMap(v => Array.isArray(v) ? v : []).filter(o => o && o.op === kind);

	for (const [name, label, species] of [
		['Route12', 'Route12_EventScript_Snorlax', 'snorlax'],
		['Route16', 'Route16_EventScript_Snorlax', 'snorlax'],
	]) {
		const doc = script(name);
		const ops = opsIn(doc, label);
		const bi = ops.findIndex(o => o.op === 'wildbattle');
		A(bi >= 0 && ops[bi].species === species, `${name}: the SNORLAX battle is in the script`, JSON.stringify(ops[bi]));
		// it has to be INSIDE the Poké Flute branch, not before it
		const flute = ops.findIndex(o => o.cond?.flag === 'FLAG_GOT_POKE_FLUTE');
		A(flute >= 0 && bi > flute, `${name}: ...and behind the POKe FLUTE check, not in front of it`, `flute@${flute} battle@${bi}`);
		// and before the script reads the outcome
		const outcome = ops.findIndex(o => o.op === 'special' && o.name === 'GetBattleOutcome');
		A(outcome >= 0 && bi < outcome, `${name}: ...and before the outcome is read`, `battle@${bi} outcome@${outcome}`);
	}

	A(findOp(script('JohKantoVermilionCity'), 'wildbattle').some(o => o.species === 'snorlax'),
		'JohKanto Vermilion City: the third SNORLAX fights too');
	for (const n of ['Route36', 'BattleFrontier_OutsideEast']) {
		A(findOp(script(n), 'wildbattle').some(o => o.species === 'sudowoodo'), `${n}: the SUDOWOODO fights`);
	}
	// Crystal's empty trainerbattle was REPLACED, not left beside the new op
	A(!JSON.stringify(script('Route36')).includes('"trainerbattle","args":[""]'),
		'Route36 no longer holds a trainer battle with no trainer');

	A(findOp(script('VioletPokecenter1F'), 'giveegg').some(o => o.species === 'togepi'),
		'Violet POKeMON CENTER: Elm\'s aide hands over the TOGEPI EGG');

	// legendaries keep their own mechanism — no second, script-driven copy
	for (const n of ['CeruleanCave_B1F', 'SeafoamIslands_B4F', 'TinTowerRoof', 'WhirlIslandLugiaChamber']) {
		A(findOp(script(n), 'wildbattle').length === 0,
			`${n}: no duplicate battle — LEGENDARY_ENCOUNTERS still owns it`);
	}

	// ---------- engine ----------
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			for await (const _ of req) {}
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null }));
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'KANTO');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data)), 40000);
		A(ready, 'the overworld boots');
		if (!ready) throw new Error('boot failed');

		// ---- B_OUTCOME_* resolve. 188 branches compared VAR_RESULT against these
		// symbols; every one was dead, because the symbol fell through to the raw
		// string and a number can never equal it.
		const outcomes = await page.evaluate(() => {
			const ow = window.__ow;
			ow.Story.setVar('VAR_RESULT', 1);
			const won = ow.cutsceneCtx ? true : true;
			// drive the interpreter's own comparison through a tiny program
			const prog = {
				T: [
					{ op: 'branch', kind: 'goto', cond: { var: 'VAR_RESULT', cmp: 'eq', value: 'B_OUTCOME_WON' }, label: 'HIT' },
					{ op: 'end' },
				],
				HIT: [{ op: 'setflag', flag: 'test_b_outcome_won' }, { op: 'end' }],
			};
			ow.cutscene.run(prog, 'T', ow.cutsceneCtx(), () => {});
			for (let i = 0; i < 40 && ow.cutscene.blocking; i++) ow.cutscene.step?.(1 / 60);
			return { won, hit: !!ow.Story.getFlag('test_b_outcome_won') };
		});
		A(outcomes.hit, 'B_OUTCOME_WON resolves to a number, so the post-battle branches fire');

		// ---- the wildbattle op actually starts a battle against the right species
		// battle.start is ASYNC — it awaits every sprite before it publishes
		// `active`, so reading the foe straight after the call finds null and the
		// assertion passes or fails for the wrong reason. Wait for the real thing.
		const fought = await page.evaluate(async () => {
			const ow = window.__ow;
			const r = ow.cutsceneCtx().wildBattle('snorlax', 30);
			const t0 = Date.now();
			while (!ow.battle.active && Date.now() - t0 < 15000) await new Promise(s => setTimeout(s, 50));
			return { r, blocking: !!ow.battle.blocking, foe: ow.battle.active?.foe?.speciesId || null,
				level: ow.battle.active?.foe?.level ?? null };
		});
		A(fought.r === 'wait', 'wildBattle blocks the script like a trainer battle does', JSON.stringify(fought));
		A(fought.blocking, 'and a battle is really running');
		A(fought.foe === 'snorlax', 'against SNORLAX', JSON.stringify(fought));
		A(fought.level === 30, '...at the level the decomp asks for', String(fought.level));

		// ---- LATIAS has a home
		const eon = await page.evaluate(() => {
			const L = window.__ow.LEGENDARY_ENCOUNTERS.MAP_SOUTHERN_ISLAND_INTERIOR;
			const list = Array.isArray(L) ? L : [L];
			return list.map(e => ({ s: e.species, x: e.x, y: e.y, flag: e.flag }));
		});
		A(eon.some(e => e.s === 'latias'), 'LATIAS is placed on Southern Island', JSON.stringify(eon));
		A(eon.some(e => e.s === 'latios'), '...alongside LATIOS');
		A(new Set(eon.map(e => e.flag)).size === eon.length, '...on separate flags, so it is one of each');
		A(new Set(eon.map(e => e.x + ',' + e.y)).size === eon.length, '...and separate tiles');

		// ---- the TOGEPI egg lands somewhere the player can get it
		const egg = await page.evaluate(() => {
			const ow = window.__ow;
			ow.cutsceneCtx().giveEgg('togepi', 5);
			const st = ow.Daycare?.get?.();
			return { species: st?.egg?.speciesId || null, ready: !!st?.egg?.ready, gift: !!st?.egg?.gift };
		});
		A(egg.species === 'togepi', 'the TOGEPI EGG is in the Day Care, incubating', JSON.stringify(egg));
		A(egg.ready === false, '...and has to be walked out, not collected instantly');

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
