// crystal_stds_test.mjs — Crystal's shared NPCs say something again.
//
// 237 objects and signs across Gen-2 Kanto and Johto did NOTHING when talked to.
// Not missing data: Crystal factors its common NPCs through `jumpstd <StdScript>`,
// a jump into a shared library, and the transpiler emits nothing for that op. A
// label whose entire body is one jumpstd transpiled to nothing and vanished from
// the script file, so runScriptLabel found no label and returned false.
//
// Every bookshelf, every POKeMON CENTER and MART sign, every trash can, the Game
// Corner coin vendor, the Team Rocket oath posters. 148 labels, 14 shared scripts.
//
// events.js already did exactly this for the OTHER decomp — COMMON_STUBS gives
// FireRed's Common_EventScript_* a body — so this is the Crystal half.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/crystal_stds_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const { STD_OF, STD_TEXT } = await import('../crystal_stds.js');
const { crystalStd } = await import('../events.js');
const regions = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/map_regions.json'), 'utf8'));

// ---------- the map ----------
A(Object.keys(STD_OF).length >= 140, `${Object.keys(STD_OF).length} dropped labels are mapped to a shared script`, String(Object.keys(STD_OF).length));
A(Object.keys(STD_TEXT).length >= 6, 'and the text-only ones carry Crystal\'s own words', Object.keys(STD_TEXT).join(','));
A(STD_TEXT.PokecenterSignScript?.includes('POKeMON CENTER'), 'the POKeMON CENTER sign reads right', JSON.stringify(STD_TEXT.PokecenterSignScript));
A(!/#MON/.test(JSON.stringify(STD_TEXT)), 'the decomp\'s #MON shorthand is expanded, not left raw');

// every dropped label our maps point at resolves to a body
let refs = 0, unresolved = [];
for (const rn of ['JOHKANTO', 'JOHTO']) {
	for (const m of regions[rn]) {
		const mp = path.join(D, 'maps', `${m.name}_map.json`);
		if (!fs.existsSync(mp)) continue;
		const map = JSON.parse(fs.readFileSync(mp, 'utf8'));
		const sp = path.join(D, 'scripts', `${m.name}.json`);
		const sc = fs.existsSync(sp) ? JSON.parse(fs.readFileSync(sp, 'utf8')) : null;
		for (const o of [...(map.object_events || []), ...(map.bg_events || [])]) {
			const s = o.script || '';
			if (!STD_OF[s] || (sc && sc[s])) continue;
			refs++;
			if (!crystalStd(s)) unresolved.push(`${m.name}:${s} (${STD_OF[s]})`);
		}
	}
}
A(refs >= 200, `${refs} objects and signs were relying on those labels`, String(refs));
// Strength boulders and Smash rocks are DELIBERATELY unresolved — items.js owns
// them as HM field obstacles off their graphics_id, and a talk script would put a
// message in front of the HM prompt.
const hmOnly = unresolved.filter(u => /StrengthBoulderScript|SmashRockScript/.test(u));
A(unresolved.length === hmOnly.length,
	'everything else resolves to a body', unresolved.filter(u => !hmOnly.includes(u)).slice(0, 4).join(' | '));
A(hmOnly.length > 0, 'the boulders and rocks are left to items.js on purpose', `${hmOnly.length} of them`);

// ---------- the HM obstacle spelling ----------
const itemsSrc = fs.readFileSync(path.join(ROOT, 'overworld/items.js'), 'utf8');
A(/_ROCK\$\/\.test\(g\)|\/_ROCK\$\//.test(itemsSrc), 'items.js knows Crystal\'s plain OBJ_EVENT_GFX_ROCK');
A(!/g\.includes\('ROCK'\)/.test(itemsSrc), '...anchored, so it cannot swallow OBJ_EVENT_GFX_ROCKET');

// ---------- live ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8928;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 60, gender: 'M', friend: 200, types: ['Normal'],
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
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		// RUN one. runScriptLabel used to return false for these; now it opens a box.
		const spoke = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('JohKantoCeladonGameCorner');
			const ran = ow.runScriptLabel('CeladonGameCornerClerkScript');
			// let the interpreter reach the msg op
			// dialog.open is a FUNCTION; `blocking` is the state and `pages` holds the
			// text. Reading `.open` as a flag is always truthy — this assertion passed
			// vacuously until that was noticed.
			for (let i = 0; i < 60 && ow.cutscene.blocking && !ow.dialog.blocking; i++) ow.cutscene.step?.(1 / 60);
			return { ran, showing: !!ow.dialog.blocking, text: (ow.dialog.pages || []).join(' ') };
		});
		A(spoke.ran === true, 'the Game Corner clerk\'s dropped label now runs', JSON.stringify(spoke));
		A(spoke.showing && /COINS/i.test(spoke.text), '...and puts its real message on screen', JSON.stringify(spoke));

		// a bookshelf, which is the commonest of the 237.
		// runScriptLabel bails while a cutscene is blocking, so clear the last one
		// first — otherwise this reads false for the wrong reason.
		const shelf = await page.evaluate(async () => {
			const ow = window.__ow;
			ow.cutscene.stop(); ow.dialog.close?.();
			await ow.moveToMap('JohKantoPewterCity');
			const ran = ow.runScriptLabel('AcademyBookshelf');
			return { ran, showing: !!ow.dialog.blocking };
		});
		A(shelf.ran === true, 'and so does a bookshelf on a map whose own script never had it', JSON.stringify(shelf));

		// Crystal's OBJ_EVENT_GFX_ROCK really becomes a smashable field obstacle.
		// Cianwood City has six of them; Rock Tunnel has none, which is why the first
		// version of this check passed on `>= 0` and proved nothing.
		const rock = await page.evaluate(async () => {
			const ow = window.__ow;
			ow.cutscene.stop(); ow.dialog.close?.();
			await ow.moveToMap('CianwoodCity');
			ow.items.loadForMap();
			return { rocks: ow.items.fieldObjs.filter(o => o.kind === 'rock').length };
		});
		A(rock.rocks === 6, 'Cianwood City\'s six Crystal rocks are smashable obstacles now', JSON.stringify(rock));

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 2).join(' | '));
	} catch (e) {
		A(false, 'browser harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
