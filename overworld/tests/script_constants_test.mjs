// script_constants_test.mjs — the named constants the branches compare against.
//
// A transpiled branch keeps the decomp's SYMBOL as its value:
//     {"cond":{"var":"VAR_FACING","cmp":"eq","value":"DIR_EAST"}}
// and resolveValue knew only TRUE/FALSE/YES/NO and the battle outcomes. Everything
// else stayed a STRING, so `cmp(2, 'eq', 'DIR_EAST')` compared a number to text —
// false forever. 1,671 comparisons across 265 symbols could never be true, so
// every one of those branches took the same arm whatever the game state.
//
// Resolving the constants is only half of it. Three of the vars they are compared
// against were written by NOTHING:
//   VAR_FACING     122 scripts choreograph around it — which way an NPC walks to
//                  reach you, which side Eusine steps to
//   VAR_WEEKDAY    83 branches, all Crystal: the Day-of-Week siblings, the
//                  Goldenrod move tutor, the Dragon's Den rival, Sunday-only floors
//   VAR_PARTYCOUNT party-size gates
// And two ops that WRITE VAR_RESULT were dropped (`checkplayergender`, `random`),
// which only stayed harmless while the comparison could never be true anyway.
// Resolving the constants without those writes would be WORSE than leaving it
// broken: the branch would fire on whatever the last script left behind.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/script_constants_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const { SCRIPT_CONSTANTS: C } = await import('../script_constants.js');

// ---------- the table ----------
{
	A(Object.keys(C).length > 150, `${Object.keys(C).length} named constants resolved`);
	for (const [k, v] of [['MALE', 0], ['FEMALE', 1], ['SUNDAY', 0], ['SATURDAY', 6],
		['MON_GIVEN_TO_PARTY', 0], ['MON_GIVEN_TO_PC', 1], ['PARTY_LENGTH', 6]]) {
		A(C[k] === v, `${k} = ${v}`, String(C[k]));
	}
	// the decomps disagree on these, so they are left OUT rather than guessed
	for (const k of ['STAT_HP', 'STAT_ATK', 'CHALLENGE_STATUS_LOST']) {
		A(C[k] === undefined, `${k} is left unresolved — the decomps give it different values`);
	}
	// facing is ours: Crystal's UP is 1 and Emerald's DIR_SOUTH is also 1, so no
	// harvested number could serve both. It only has to agree with main.js.
	A(C.UP === C.DIR_NORTH && C.DOWN === C.DIR_SOUTH && C.LEFT === C.DIR_WEST && C.RIGHT === C.DIR_EAST,
		"the two decomps' facing spellings map to one encoding");
	const main = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	const m = /const FACING_VALUE = \{ down: (\d), up: (\d), left: (\d), right: (\d) \}/.exec(main);
	A(m && +m[1] === C.DIR_SOUTH && +m[2] === C.DIR_NORTH && +m[3] === C.DIR_WEST && +m[4] === C.DIR_EAST,
		'...and main.js writes VAR_FACING in exactly that encoding', m ? m[0] : 'FACING_VALUE not found');
}

// ---------- the dropped writes ----------
{
	const ev = fs.readFileSync(path.join(ROOT, 'overworld/events.js'), 'utf8');
	A(/case 'random'/.test(ev), "`random` writes VAR_RESULT instead of leaving the next branch on a stale var");
	A(/MON_GIVEN_TO_PC : MON_GIVEN_TO_PARTY/.test(ev), '`givemon` reports party-vs-box into VAR_RESULT');
	// checkplayergender is a transpiler-side fix: it must appear as a real write
	let genderWrites = 0, genderBranches = 0;
	const D = path.join(ROOT, 'overworld/data/scripts');
	for (const f of fs.readdirSync(D)) {
		if (f === '_index.json') continue;
		const j = JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));
		for (const body of Object.values(j)) {
			if (!Array.isArray(body)) continue;
			for (let i = 0; i < body.length; i++) {
				const s = body[i];
				if (s?.op !== 'branch' || (s.cond?.value !== 'MALE' && s.cond?.value !== 'FEMALE')) continue;
				genderBranches++;
				if (body.slice(0, i).some(p => p?.op === 'setvar' && p.var === 'VAR_RESULT')) genderWrites++;
			}
		}
	}
	A(genderBranches > 0 && genderWrites === genderBranches,
		`all ${genderBranches} MALE/FEMALE branches have a real VAR_RESULT write before them`, `${genderWrites}/${genderBranches}`);
}

// ---------- live ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8935;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 60, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 200, atk: 140, def: 140, spa: 140, spd: 140, spe: 140 }, maxHP: 200, curHP: 200,
		exp: 216000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
	}];
	const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
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
			res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));
	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'JOHTO');
			localStorage.removeItem('magepunk_story');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		// Drive the interpreter with a program built here, so the assertion covers the
		// WHOLE chain — var written, symbol resolved, comparison evaluated — without
		// depending on any one script's choreography.
		const probe = await page.evaluate(() => {
			const ow = window.__ow;
			const run = (value, varName) => {
				ow.Story.clearFlag('PROBE_HIT');
				ow.cutscene.stop();
				ow.cutscene.run({
					__probe: [{ op: 'branch', kind: 'goto', cond: { var: varName, cmp: 'eq', value }, label: '__hit' }, { op: 'end' }],
					__hit: [{ op: 'setflag', flag: 'PROBE_HIT' }, { op: 'end' }],
				}, '__probe', ow.cutsceneCtx(), () => {});
				for (let i = 0; i < 60 && ow.cutscene.blocking; i++) ow.cutscene.update(1 / 60);
				return ow.Story.getFlag('PROBE_HIT');
			};
			const out = {};
			// facing: syncScriptVars runs on runScriptLabel, so poke it via a real one
			ow.player.facing = 'up';
			ow.runScriptLabel('__nope__');            // no such label: only the var sync happens
			out.facingUp = ow.Story.getVar('VAR_FACING');
			out.northWhenUp = run('DIR_NORTH', 'VAR_FACING');
			out.southWhenUp = run('DIR_SOUTH', 'VAR_FACING');
			ow.player.facing = 'left';
			ow.runScriptLabel('__nope__');
			out.facingLeft = ow.Story.getVar('VAR_FACING');
			out.westWhenLeft = run('DIR_WEST', 'VAR_FACING');
			out.crystalUpWhenLeft = run('UP', 'VAR_FACING');
			out.weekday = ow.Story.getVar('VAR_WEEKDAY');
			out.partycount = ow.Story.getVar('VAR_PARTYCOUNT');
			return out;
		});
		A(probe.facingUp === 2 && probe.facingLeft === 3, 'VAR_FACING tracks the player (up=2, left=3)', JSON.stringify(probe));
		A(probe.northWhenUp === true, 'a branch on DIR_NORTH fires when the player faces up — it never could before');
		A(probe.southWhenUp === false, '...and does NOT fire on DIR_SOUTH, so it is a real comparison');
		A(probe.westWhenLeft === true && probe.crystalUpWhenLeft === false,
			"Crystal's UP and Emerald's DIR_* share the encoding without colliding", JSON.stringify(probe));
		A(probe.weekday === new Date().getDay(),
			`VAR_WEEKDAY is today (${probe.weekday}) — the Day-of-Week siblings can tell what day it is`, String(probe.weekday));
		A(probe.partycount === 1, 'VAR_PARTYCOUNT is the real party size', String(probe.partycount));

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
