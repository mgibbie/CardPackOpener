// kurtstory_test.mjs — a service counter must not answer for a story NPC.
//
// Reported: "Kurt never starts the Slowpoke Well story. Pressing A on Kurt only
// ever shows the apricorn line; no flag changes and Kurt doesn't move. The
// Rocket is still guarding the well." Johto blocked at Azalea/Bugsy.
//
// Same class as the Bill Sea Cottage PC (#546): a static handler is consulted
// before the map script, so the story script never runs for a real player. The
// report even captured the stack — kurtTalk() reached straight from interact(),
// with runScriptLabel never called.
//
// CAUSE. services.js registers MAP_KURTS_HOUSE with an ungated 'kurt' zone whose
// tiles include (3,2), which is Kurt1's own tile, and kindAt() matches a tile
// with no NPC or flag check. So the native apricorn counter swallowed the press.
// Kurt1 is the beat that sets EVENT_AZALEA_TOWN_SLOWPOKETAIL_ROCKET and walks
// him out of the house; AzaleaTownRocket1Script hides the well guard only on
// that flag, so the guard never left.
//
// FIX, deliberately narrow. Kurt1 branches on EVENT_KURT_GAVE_YOU_LURE_BALL
// before anything else, so the counter is gated on that same flag and the script
// owns him until then. Checked per press, not at map load, so the counter works
// the moment he hands the ball over.
//
// WHY NOT THE STRUCTURAL FIX. Letting any NPC script win over its service zone
// would break the game: an audit of every zone found 93 sitting on an NPC with a
// real script, and all but Kurt are the port's own native implementations —
// nurses, marts, the contest lobby, the Trick House — where shadowing the script
// IS the implementation. Kurt is the only one whose script carries a story beat
// (setflag + move + hideobj). That audit is asserted below so the claim stays
// true rather than being a one-time observation.
//
//   node overworld/tests/kurtstory_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const OW = path.join(ROOT, 'overworld');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---------- the gate, and the audit that justifies its narrowness ----------
{
	const mn = fs.readFileSync(path.join(OW, 'main.js'), 'utf8');
	A(/svc === 'kurt' && Story\.getFlag\('EVENT_KURT_GAVE_YOU_LURE_BALL'\)/.test(mn),
		'the apricorn counter is gated on the story beat');

	// Kurt1 must still be the script that owns the beat
	const ks = JSON.parse(fs.readFileSync(path.join(OW, 'data/scripts/KurtsHouse.json'), 'utf8'));
	const ops = ks.Kurt1 || [];
	A(ops.some(o => o.op === 'setflag' && o.flag === 'EVENT_AZALEA_TOWN_SLOWPOKETAIL_ROCKET'),
		'Kurt1 is what sets the well-guard flag');
	A(ops.some(o => o.op === 'branch' && o.cond && o.cond.flag === 'EVENT_KURT_GAVE_YOU_LURE_BALL'),
		'and Kurt1 hands off at exactly the flag the gate uses');

	// every OTHER shadowed zone must be a native service, or this fix is too narrow
	let src = fs.readFileSync(path.join(OW, 'services.js'), 'utf8')
		.replace('function specFor(mapId) {', 'export function specFor(mapId) {');
	const tmp = path.join(OW, '_kurt_audit.mjs');
	fs.writeFileSync(tmp, src);
	try {
		const { specFor } = await import('../_kurt_audit.mjs?v=' + Date.now());
		const INERT = new Set(['lock', 'lockall', 'release', 'releaseall', 'faceplayer', 'msg', 'waitmsg', 'closemsg', 'end', 'return', 'waitbutton', 'nop']);
		// a STORY beat, as opposed to a service's own reward logic: the NPC leaves
		const storyish = [];
		let shadowed = 0;
		for (const f of fs.readdirSync(path.join(OW, 'data/maps'))) {
			if (!f.endsWith('_map.json')) continue;
			const name = f.replace('_map.json', '');
			let m, sc = null;
			try { m = JSON.parse(fs.readFileSync(path.join(OW, 'data/maps', f), 'utf8')); } catch (e) { continue; }
			let spec = null; try { spec = specFor(m.id); } catch (e) { continue; }
			if (!spec || !spec.zones || !spec.zones.length) continue;
			try { sc = JSON.parse(fs.readFileSync(path.join(OW, 'data/scripts', name + '.json'), 'utf8')); } catch (e) {}
			for (const ev of (m.object_events || [])) {
				const lab = ev.script;
				if (!lab || lab === '0x0') continue;
				const o = sc && sc[lab];
				if (!Array.isArray(o) || !o.some(x => x && x.op && !INERT.has(x.op))) continue;
				const onZone = spec.zones.some(z => z.tiles === 'any' || (Array.isArray(z.tiles) && z.tiles.some(([x, y]) => x === +ev.x && y === +ev.y)));
				if (!onZone) continue;
				shadowed++;
				// the signature of a story beat: the NPC walks off and disappears
				if (o.some(x => x.op === 'hideobj') && o.some(x => x.op === 'move') && o.some(x => x.op === 'setflag')) storyish.push(name + '::' + lab);
			}
		}
		A(shadowed > 50, 'the audit really ran across the whole game', shadowed + ' shadowed zones');
		// A tripwire, not a wish. Exactly two shadowed NPCs carry a story beat:
		//   KurtsHouse::Kurt1                       — the bug this test is about
		//   OlivinePort::...SailorAtGangwayScript   — INTENTIONAL: that is the S.S.
		//     Aqua boarding, which the port deliberately replaces with the native
		//     ferryMenu (the cross-region crossing runs through it, not the script).
		// If a third ever appears, it is a new instance of this bug and this fails.
		const KNOWN = ['KurtsHouse::Kurt1', 'OlivinePort::OlivinePortSailorAtGangwayScript'];
		A(storyish.length === KNOWN.length && KNOWN.every(k => storyish.includes(k)),
			'no NEW story NPC is shadowed by a service zone', JSON.stringify(storyish));
	} finally { try { fs.unlinkSync(tmp); } catch (e) {} }
}

// ---------- live: press A on Kurt the way a player does ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8995;
	const STATE = { username: 'kurt', friendCode: 'KURT00', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'kurt-token');
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

		// stand at (3,3) facing up — Kurt1 is at (3,2). The ONLY door a player has.
		const pressA = () => page.evaluate(() => {
			const W = window.__ow, p = W.player;
			p.tx = 3; p.ty = 3; p.px = 3 * 16; p.py = 3 * 16;
			p.moving = false; p.moveFrom = null; p.moveTo = null; p.moveT = 0;
			p.facing = 'up';
			W.interact();
		});
		const settle = async (ms = 15000) => {
			const t = Date.now();
			while (Date.now() - t < ms) {
				const st = await page.evaluate(() => ({ d: !!window.__ow.dialog.blocking, c: !!window.__ow.cutscene.blocking }));
				if (!st.d && !st.c) return;
				await page.evaluate(() => { try { window.__ow.dialog.key('z'); } catch (e) {} });
				await sleep(60);
			}
		};
		const flag = n => page.evaluate(n => !!window.__ow.Story.getFlag(n), n);

		A(await flag('EVENT_AZALEA_TOWN_SLOWPOKETAIL_ROCKET') === false, 'setup: the well guard is still posted');
		// pin that Kurt is actually STANDING there first, or "he left" passes for a
		// Kurt who was never loaded — which it did, against the broken version
		// the map's own id for him. NOTE this is NOT the id his script uses — see the
		// known limitation at the end of this test.
		const kurtAt = () => page.evaluate(() => {
			const n = (window.__ow.npcs?.list || []).find(x => (x.ev.local_id || '') === 'KurtsHouse_SPRITE_KURT' && x.ev.script === 'Kurt1');
			return n ? { at: [n.tx, n.ty], hidden: !!n.hidden } : null;
		});
		const before = await kurtAt();
		A(!!before && !before.hidden, 'setup: Kurt is in the house to be talked to', JSON.stringify(before));

		await pressA();
		await sleep(350);
		const said = await page.evaluate(() => (window.__ow.dialog.pages || []).flat().join(' ').slice(0, 120));
		A(!/APRICORNS into POKe BALLS/i.test(said) || await flag('EVENT_AZALEA_TOWN_SLOWPOKETAIL_ROCKET'),
			'Kurt no longer answers with the apricorn counter line', JSON.stringify(said));
		await settle();

		A(await flag('EVENT_AZALEA_TOWN_SLOWPOKETAIL_ROCKET'),
			'pressing A on Kurt sets the flag that clears the well guard');
		// He walks out and disappears, which is the whole of Kurt1's tail.
		//
		// This assertion used to read the other way. Kurt1 ends with
		// `hideobj KURTSHOUSE_KURT1` while this map's object carries local_id
		// `KurtsHouse_SPRITE_KURT`, and npcById() was an exact match — so the hide
		// resolved to null and he stayed standing there. It was shipped as a KNOWN
		// limitation with a deliberate tripwire assertion, so that fixing the
		// underlying naming mismatch would fail here rather than pass silently.
		// It did exactly that (see objref_test.mjs), and this is the updated truth.
		//
		// He was provably standing there a moment ago, so this cannot pass for a
		// Kurt who simply never loaded.
		const after = await kurtAt();
		A(!after || after.hidden, 'and Kurt walks out and is gone', JSON.stringify(after));

		// ...and once he has given the Lure Ball, the counter takes over again
		await page.evaluate(() => window.__ow.Story.setFlag('EVENT_KURT_GAVE_YOU_LURE_BALL'));
		await page.evaluate(() => { try { window.__ow.dialog.close?.(); } catch (e) {} });
		await pressA();
		await sleep(350);
		const later = await page.evaluate(() => (window.__ow.dialog.pages || []).flat().join(' ').slice(0, 120));
		A(/APRICORN/i.test(later), 'after the Lure Ball, the apricorn counter answers again', JSON.stringify(later));
	} finally {
		if (browser) await browser.close();
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
