// signshadow_test.mjs — a signpost's text must never stand in for a script that
// was supposed to DO something.
//
// Reported: "Bill's Sea Cottage PC never runs the Cell Separator (S.S. Ticket
// unobtainable). Step 5 only ever shows 'TELEPORTER is displayed on the PC
// monitor.' There's no cell separator, animation or flag change."
//
// CAUSE. interact()'s bg_event loop checked sign_texts.json FIRST and returned:
//
//     if (signTexts[ev.script]) { dialog.open(...); return; }
//     // ...only after this: if (mapScripts[ev.script]) runScriptLabel(...)
//
// sign_texts.json is a TEXT DUMP — it holds the `msg` a script would have shown.
// For a plain signpost that is a faithful stand-in. For a script that branches,
// it serves a STATIC answer to a question the script was meant to decide. Here
// the dump had captured the script's own fallback line, the one it prints when
// Bill is NOT in the teleporter, so the PC cheerfully printed the failure case
// forever and FLAG_HELPED_BILL_IN_SEA_COTTAGE — the only source of the S.S.
// Ticket — could never be set. Cerulean's authentic pre-ticket exit block then
// stays up, closing the whole southern half of Kanto.
//
// The audit below counts 373 bg_events shadowed this way across the three
// regions: the Abandoned Ship door puzzles, the gym statues, Bill's PC.
//
// WHY THIS SURVIVED A HEADLESS VERIFICATION. I previously drove this exact chain
// through runScriptLabel() and watched it set every flag correctly — which
// proved the SCRIPT works, not that a player can reach it. runScriptLabel
// bypasses interact(), and interact() is the only door a player has. Every
// assertion below therefore goes through interact().
//
//   node overworld/tests/signshadow_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const OW = path.join(ROOT, 'overworld');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---------- data: how many scripted bg_events are shadowed ----------
const INERT = new Set(['lock', 'lockall', 'release', 'releaseall', 'faceplayer',
	'msg', 'waitmsg', 'closemsg', 'end', 'return', 'waitbutton', 'nop']);
const displayOnly = ops => !Array.isArray(ops) || ops.every(o => !o || !o.op || INERT.has(o.op));
{
	const signs = JSON.parse(fs.readFileSync(path.join(OW, 'data/sign_texts.json'), 'utf8'));
	let bothInert = 0; const shadowed = [];
	for (const f of fs.readdirSync(path.join(OW, 'data/maps'))) {
		if (!f.endsWith('_map.json')) continue;
		const mapName = f.replace('_map.json', '');
		let m, sc;
		try { m = JSON.parse(fs.readFileSync(path.join(OW, 'data/maps', f), 'utf8')); } catch (e) { continue; }
		try { sc = JSON.parse(fs.readFileSync(path.join(OW, 'data/scripts', mapName + '.json'), 'utf8')); } catch (e) { continue; }
		for (const ev of (m.bg_events || [])) {
			const lab = ev.script;
			if (!lab || lab === '0x0' || signs[lab] === undefined || !sc[lab]) continue;
			if (displayOnly(sc[lab])) bothInert++; else shadowed.push(`${mapName}::${lab}`);
		}
	}
	// this is the measurement the fix is sized against, not a pass/fail on its own
	console.log(`    (${shadowed.length} bg_events have a script that does real work; ${bothInert} are display-only)`);
	A(shadowed.length > 0, 'the audit finds scripted bg_events at all (the fixture is live)');
	A(shadowed.some(s => /Route25_SeaCottage_EventScript_Computer/.test(s)),
		"Bill's PC is one of them");

	// the routing rule must exist and must be checked BEFORE the sign text
	const mn = fs.readFileSync(path.join(OW, 'main.js'), 'utf8');
	A(/function scriptIsDisplayOnly/.test(mn), 'main.js classifies a script as display-only or not');
	const i = mn.indexOf('for (const ev of world.current.map.bg_events');
	const body = mn.slice(i, i + 2600);
	const gScript = body.indexOf('!scriptIsDisplayOnly(scr)');
	const gSign = body.indexOf('if (signTexts[lab])');
	A(gScript >= 0 && gSign >= 0 && gScript < gSign,
		'a working script is offered the A press BEFORE the sign text', `script@${gScript} sign@${gSign}`);
}

// ---------- live: press A the way a player does ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8987;
	const STATE = { username: 'sign', friendCode: 'SIGN00', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
		await page.setViewport({ width: 1100, height: 800 });
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'sign-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'KANTO');
			// seed ONCE. Re-seeding on every navigation silently resets the story blob,
			// which makes the "save already mid-flow" case below impossible to express.
			if (!localStorage.getItem('magepunk_story'))
				localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{
				speciesId: 'squirtle', name: 'SQUIRTLE', level: 20, gender: 'M', friend: 70, types: ['Water'],
				ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
				stats: { hp: 60, atk: 40, def: 40, spa: 40, spd: 40, spe: 40 }, maxHP: 60, curHP: 60,
				exp: 8000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's7.png', num: 7,
			}]));
		}, STATE);

		const boot = async map => {
			await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}`, { waitUntil: 'domcontentloaded' });
			const t0 = Date.now();
			while (Date.now() - t0 < 60000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await sleep(200);
			await sleep(1400);
		};
		// stand on (x,y) facing `dir` and press A — the ONLY door a player has
		const pressA = (x, y, dir) => page.evaluate((x, y, dir) => {
			const W = window.__ow, p = W.player;
			p.tx = x; p.ty = y; p.px = x * 16; p.py = y * 16;
			p.moving = false; p.moveFrom = null; p.moveTo = null; p.moveT = 0;
			p.facing = dir;
			W.interact();
		}, x, y, dir);
		const seen = () => page.evaluate(() => ({
			text: (window.__ow.dialog.pages || []).flat().join(' ').slice(0, 110),
			blocking: window.__ow.dialog.blocking,
		}));
		const flag = n => page.evaluate(n => !!window.__ow.Story.getFlag(n), n);
		// press through until nothing is blocking any more, rather than a fixed count:
		// the Cell Separator is a long camera + teleporter scene and a fixed count can
		// stop in the middle of it, which reads as "the script did not run"
		const settle = async (ms = 20000) => {
			const t0 = Date.now();
			while (Date.now() - t0 < ms) {
				const st = await page.evaluate(() => ({ d: !!window.__ow.dialog.blocking, c: !!window.__ow.cutscene.blocking }));
				if (!st.d && !st.c) return true;
				await page.evaluate(() => { try { window.__ow.dialog.key('z'); } catch (e) {} });
				await sleep(55);
			}
			return false;
		};
		const mash = settle;

		// ===== a plain signpost must still read as a sign (the other 1038) =====
		await boot('PalletTown');
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');
		await pressA(9, 12, 'up');   // PalletTown_EventScript_TownSign, bg_event at 9,11
		await sleep(300);
		const sign = await seen();
		A(/PALLET TOWN/i.test(sign.text), 'a display-only signpost still shows its sign text', JSON.stringify(sign));
		await settle();

		// ===== the reported bug, driven entirely through interact() =====
		await boot('Route25_SeaCottage');
		A(await flag('FLAG_GOT_SS_TICKET') === false, 'setup: no ticket yet');

		// talk to Clefairy-Bill at (10,6) from (10,7) facing up, answer YES
		await pressA(10, 7, 'up');
		await settle();
		A(await flag('BILL_IN_TELEPORTER'), 'Bill goes into the teleporter when you agree to help');

		// THE REPORTED STEP: press A on the PC (bg_event at 4,5) from (4,6) facing up
		await pressA(4, 6, 'up');
		await sleep(400);
		const pc = await seen();
		await settle();
		const helped = await flag('FLAG_HELPED_BILL_IN_SEA_COTTAGE');
		A(!/TELEPORTER is displayed/i.test(pc.text) || helped,
			'the PC no longer answers with the static fallback line', JSON.stringify(pc));
		A(helped, 'pressing A on the PC runs the Cell Separator');
		A(await flag('BILL_IN_TELEPORTER') === false, 'and clears BILL_IN_TELEPORTER');

		// talk to human Bill for the ticket
		const billAt = await page.evaluate(() => {
			const n = (window.__ow.npcs?.list || []).find(n => (n.ev.local_id || '') === 'LOCALID_BILL_HUMAN');
			return n ? { x: n.tx, y: n.ty } : null;
		});
		A(!!billAt, 'human Bill is on the map', JSON.stringify(billAt));
		if (billAt) {
			await pressA(billAt.x, billAt.y + 1, 'up');
			await settle();
		}
		A(await flag('FLAG_GOT_SS_TICKET'), 'and Bill hands over the S.S. TICKET');

		// ===== an existing save already mid-flow finishes without a migration =====
		// (reported: saves already sit at BILL_IN_TELEPORTER=true)
		await page.evaluate(() => {
			const S = window.__ow.Story;
			S.clearFlag('FLAG_GOT_SS_TICKET');
			S.clearFlag('FLAG_HELPED_BILL_IN_SEA_COTTAGE');
			S.setFlag('BILL_IN_TELEPORTER');
		});
		await boot('Route25_SeaCottage');
		await pressA(4, 6, 'up');
		await settle();
		A(await flag('FLAG_HELPED_BILL_IN_SEA_COTTAGE'),
			'a save stuck at BILL_IN_TELEPORTER finishes from the PC, no migration needed');
	} finally {
		if (browser) await browser.close();
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
