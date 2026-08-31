// sealedcontent_test.mjs — the last of the "built but unreachable" audit.
//
//   DUNGEONS  Sealed Chamber (the Braille chain that unseals the REGIs) and the
//             ABANDONED SHIP hidden floor (the Deep Sea Tooth/Scale rooms) both
//             shipped complete, wired to each other and to NOTHING else. The
//             S.S. Tidal was the same, and regionparity_test asserts Scott's
//             cameo is armed in its corridor — on a map nobody could stand on.
//   SPECIES   species_battle.json had no weight, which is why HEAVY METAL and
//             LIGHT METAL were inert AND why Heavy Slam, Heat Crash, Low Kick
//             and Grass Knot were flat: four moves and two abilities blocked on
//             one missing field. genders.json covered 628 species, 207 of them
//             forms this port does not have.
//   CELEBI    zero hits in the entire codebase — Johto's mascot shipped in the
//             species table and was placed nowhere. JohKanto had no legendaries
//             at all while Hoenn had 9.
//   QUEST     Badges.regionKey ACCEPTS 'JOHKANTO' but quest.js GYMS has no key
//             for it, so objective()/log() would throw. Latent, not reachable
//             today — a crash waiting for whoever wires that region.
//
// Standalone (needs headless Chrome/Edge + local overworld/data assets):
//   node overworld/tests/sealedcontent_test.mjs
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
const PORT = 8909;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
}];

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); }
	return false;
}

(async () => {
	// ---------- species data ----------
	const bat = JSON.parse(fs.readFileSync(path.join(DATA, 'species_battle.json'), 'utf8'));
	const sp = Object.entries(bat).filter(([k, v]) => !k.startsWith('_') && v && typeof v === 'object');
	const withWeight = sp.filter(([, v]) => v.weightkg != null).length;
	A(withWeight > 1000, 'over a thousand species carry a weight now', `${withWeight}/${sp.length}`);
	A(bat.snorlax?.weightkg > bat.gastly?.weightkg,
		'and the weights are real — SNORLAX outweighs GASTLY',
		`${bat.snorlax?.weightkg} vs ${bat.gastly?.weightkg}`);

	const genders = JSON.parse(fs.readFileSync(path.join(DATA, 'genders.json'), 'utf8'));
	A(genders.magnemite === -1, 'MAGNEMITE is genderless, not a coin flip', String(genders.magnemite));
	A(genders.nidoranm === 1 && genders.nidoranf === 0, 'and the NIDORAN lines are single-gender',
		`${genders.nidoranm}/${genders.nidoranf}`);
	A(Object.keys(genders).every(k => bat[k]),
		'every gender entry names a species this port actually has — 207 did not',
		Object.keys(genders).filter(k => !bat[k]).slice(0, 3).join(','));

	// ---------- the sealed dungeons ----------
	const dive = fs.readFileSync(path.join(ROOT, 'overworld/divelinks.js'), 'utf8');
	for (const [stem, why] of [
		['Route134', 'the only sea route with no dive link — the SEALED CHAMBER hung off it'],
		['Underwater_SealedChamber', 'surfacing into the SEALED CHAMBER itself'],
		['AbandonedShip_Rooms_B1F', 'diving into the ABANDONED SHIP wreck'],
		['AbandonedShip_Underwater2', 'surfacing onto its hidden floor'],
	]) A(new RegExp(`\\b${stem}\\s*:`).test(dive), `divelinks now covers ${stem} — ${why}`);

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
			localStorage.setItem('magepunk_region', 'HOENN');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=LittlerootTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data)), 30000);
		A(ready, 'the overworld boots');
		if (!ready) throw new Error('boot failed');

		// S.S. Tidal is boardable
		const ferry = await page.evaluate(() => (window.__ow.FERRY_DESTS || []).find(d => /S\.S\. Tidal/.test(d.label)));
		A(ferry && ferry.file === 'SSTidalCorridor',
			'the S.S. TIDAL is boardable — three maps that reached nothing', JSON.stringify(ferry));

		// weight actually reaches the moves that need it
		const weight = await page.evaluate(() => {
			const ow = window.__ow, b = ow.battle;
			const mk = id => ({ speciesId: id, name: id, level: 50, types: ['Normal'], ability: null,
				stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, maxHP: 100, curHP: 100, moves: [] });
			const heavy = mk('snorlax'), light = mk('gastly');
			const out = { snorlax: b.weightOf(heavy), gastly: b.weightOf(light) };
			// LOW KICK reads weightOf: a heavier target must hit harder
			const mv = { id: 'lowkick', pp: 5 };
			out.lowKickVsHeavy = b.powerOf('lowkick', light, heavy, {}, {}, mv);
			out.lowKickVsLight = b.powerOf('lowkick', heavy, light, {}, {}, mv);
			// HEAVY METAL / LIGHT METAL bend the same number
			heavy.ability = 'lightmetal';
			out.snorlaxLight = b.weightOf(heavy);
			heavy.ability = 'heavymetal';
			out.snorlaxHeavy = b.weightOf(heavy);
			return out;
		});
		A(weight.snorlax > 100 && weight.gastly < 5, 'weightOf reads the real numbers', JSON.stringify(weight));
		A(weight.lowKickVsHeavy > weight.lowKickVsLight,
			'LOW KICK now scales with the target — it was flat for want of weight data',
			`${weight.lowKickVsLight} vs ${weight.lowKickVsHeavy}`);
		A(weight.snorlaxLight < weight.snorlax && weight.snorlaxHeavy > weight.snorlax,
			'and LIGHT METAL / HEAVY METAL bend it, which is all they ever needed',
			JSON.stringify([weight.snorlaxLight, weight.snorlax, weight.snorlaxHeavy]));

		// Celebi and the JohKanto bird
		const legends = await page.evaluate(() => {
			const L = window.__ow.LEGENDARY_ENCOUNTERS;
			const johto = L.MAP_TIN_TOWER_ROOF;
			return {
				celebi: L.MAP_ILEX_FOREST?.species,
				celebiGated: !!L.MAP_ILEX_FOREST?.requires,
				jkBird: L.MAP_JOHKANTO_POWER_PLANT?.species,
				sharesKantoFlag: L.MAP_JOHKANTO_POWER_PLANT?.flag === L.MAP_POWER_PLANT?.flag,
				johtoStillThere: johto?.species,
			};
		});
		A(legends.celebi === 'celebi' && legends.celebiGated,
			'CELEBI exists at last, at the Ilex Forest shrine, for the JOHTO champion', JSON.stringify(legends));
		A(legends.jkBird === 'zapdos', 'JohKanto has a legendary of its own — it had none', JSON.stringify(legends));
		A(legends.sharesKantoFlag,
			'sharing Kanto\'s catch flag, so it is a second route to the bird, not a second bird');
		A(legends.johtoStillThere === 'hooh', 'and Johto\'s own entries are untouched (control)');

		// the latent JohKanto crash
		const quest = await page.evaluate(() => {
			const Q = window.__ow.Quest;
			const out = {};
			out.noSpine = !Q.GYMS.JOHKANTO;               // the table genuinely has no key
			try { out.objective = String(Q.objective('JOHKANTO')).slice(0, 30); } catch (e) { out.objective = 'THREW: ' + e.message; }
			try { Q.log('JOHKANTO'); out.log = 'ok'; } catch (e) { out.log = 'THREW: ' + e.message; }
			return out;
		});
		A(quest.noSpine, 'quest.js genuinely has no JOHKANTO spine — so the guard is load-bearing');
		A(!/THREW/.test(quest.objective), 'Quest.objective(JOHKANTO) no longer throws', quest.objective);
		A(quest.log === 'ok', 'nor does Quest.log', quest.log);

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
