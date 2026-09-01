// crystal_branches_test.mjs — item gates and yes/no prompts work again.
//
// THE BUG. `checkitem` and `yesorno` sat in the transpiler's no-op list. They
// returned [] WITHOUT touching `pending`, so the iftrue/iffalse that followed
// read the PREVIOUS `checkevent`'s flag and emitted a branch on the wrong
// condition — byte-identical to the earlier one, and provably unreachable,
// because the first branch had already consumed that exact test:
//
//     op1  branch(EVENT_GOT_BICYCLE, true)  -> .GotBicycle
//     op3  branch(EVENT_GOT_BICYCLE, false) -> .Refused      <- was `yesorno`
//
// After op1 the flag is necessarily false, so op3 always fired and the `give`
// after it was dead code. Every item turn-in and every yes/no prompt in the
// Crystal half died that way.
//
// `sdefer` was dropped too, leaving every scene entry point that used one as a
// bare `end` — including the Cerulean Gym grunt cutscene, which is what arms
// Misty's date. The scene armed and played nothing.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/crystal_branches_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const script = f => JSON.parse(fs.readFileSync(path.join(D, 'scripts', f + '.json'), 'utf8'));

// ---------- the shape of the repair ----------
{
	// only Crystal scripts: FireRed/Emerald come from a different transpiler and
	// still carry 97 of these. That is a separate pass, not this one.
	const crystal = new Set();
	for (const f of fs.readdirSync(path.join(D, 'maps'))) {
		if (!f.endsWith('_map.json')) continue;
		const j = JSON.parse(fs.readFileSync(path.join(D, 'maps', f), 'utf8'));
		if (j._crystal_tileset) crystal.add(f.replace('_map.json', ''));
	}
	let item = 0, prompt = 0, dup = 0;
	const dupSample = [];
	for (const f of fs.readdirSync(path.join(D, 'scripts'))) {
		const stem = f.replace('.json', '');
		if (!crystal.has(stem)) continue;
		const j = JSON.parse(fs.readFileSync(path.join(D, 'scripts', f), 'utf8'));
		for (const [label, body] of Object.entries(j)) {
			if (!Array.isArray(body)) continue;
			for (let i = 0; i < body.length; i++) {
				const s = body[i];
				if (s?.op === 'prompt') prompt++;
				if (s?.op !== 'branch') continue;
				if (s.cond?.item != null) item++;
				if (s.cond?.flag == null) continue;
				// THE SIGNATURE OF THE BUG: an earlier branch already tested this exact
				// flag with the opposite state, and nothing wrote the flag in between —
				// so this one can never be reached.
				const firstIdx = body.findIndex((p, k) => k < i && p?.op === 'branch'
					&& p.cond?.flag === s.cond.flag && !!p.cond.state !== !!s.cond.state);
				if (firstIdx < 0) continue;
				const between = body.slice(firstIdx + 1, i);
				if (between.some(p => (p?.op === 'setflag' || p?.op === 'clearflag') && p.flag === s.cond.flag)) continue;
				dup++;
				if (dupSample.length < 4) dupSample.push(`${stem}:${label}`);
			}
		}
	}
	A(item >= 40, `${item} branches now test an ITEM (there were none — the op did not exist)`, String(item));
	A(prompt >= 70, `${prompt} yes/no prompts restored`, String(prompt));
	A(dup === 0, 'no unreachable duplicate-flag branch is left in any Crystal script', dupSample.join(', '));
}

// ---------- the farmable givers ----------
// `verbosegiveitem` reports whether the bag had room, and its `iffalse` used to
// pick up the last checkevent instead — a flag not set until the NEXT line. So
// the branch always fired, jumped past the setevent, and the reward could be
// taken again and again. Nine Gen-2 Kanto givers had this shape.
{
	const bugsy = script('AzaleaGym')['AzaleaGymBugsyScript.FightDone'];
	const giveAt = bugsy.findIndex(s => s.op === 'give');
	const setAt = bugsy.findIndex(s => s.op === 'setflag' && s.flag === 'EVENT_GOT_TM49_FURY_CUTTER');
	A(giveAt >= 0 && setAt > giveAt, "Bugsy's TM49 sets its got-it flag after handing the TM over", JSON.stringify({ giveAt, setAt }));
	A(!bugsy.some((s, i) => i > giveAt && s.op === 'branch' && s.cond?.flag === 'EVENT_GOT_TM49_FURY_CUTTER'),
		'...with no bogus branch in between, so it is not farmable any more');
}

// ---------- the specific casualties ----------
{
	const mgr = script('JohKantoPowerPlant').PowerPlantManager;
	A(mgr.some(s => s.cond?.item === 'MACHINE_PART'),
		'the POWER PLANT manager tests for the MACHINE PART instead of a dead flag copy',
		JSON.stringify(mgr[2]));
	const bike = script('GoldenrodBikeShop').GoldenrodBikeShopClerkScript;
	A(bike.some(s => s.op === 'prompt') && bike.some(s => s.op === 'give' && /BICYCLE/.test(s.item)),
		'the bike shop asks, then actually hands over the BICYCLE');
	const rod = script('JohKantoRoute12SuperRodHouse');
	A(JSON.stringify(rod).includes('"op":"prompt"'), 'the SUPER ROD fisher asks a real question');
	const gramps = script('JohKantoBillsHouse');
	A(JSON.stringify(gramps).includes('"op":"prompt"'), "Bill's grandfather asks a real question");
	// sdefer: the scene entry point is a jump again, not a bare end
	const scene = script('JohKantoCeruleanGym').CeruleanGymGruntRunsOutScene;
	A(scene.some(s => s.op === 'goto' && s.label === 'CeruleanGymGruntRunsOutScript'),
		'the Cerulean Gym scene entry jumps to the grunt cutscene (sdefer, restored)', JSON.stringify(scene));
}

// ---------- the hand-injected battles must have survived the re-emit ----------
{
	for (const [f, label] of [['JohKantoVermilionCity', 'VermilionSnorlax.Awake'], ['LakeOfRage', 'RedGyarados'],
		['Route36', 'SudowoodoScript.Fight'], ['UnionCaveB2F', 'UnionCaveLapras'],
		['TeamRocketBaseB2F', 'RocketElectrode1']]) {
		const body = script(f)[label] || [];
		A(body.some(s => s.op === 'wildbattle'), `${label} still has its injected wildbattle`, JSON.stringify(body.slice(0, 2)));
	}
	const egg = script('VioletPokecenter1F')['VioletPokecenter1F_ElmsAideScript.AskTakeEgg'] || [];
	A(egg.some(s => s.op === 'giveegg'), 'and the TOGEPI EGG survived too', JSON.stringify(egg.slice(0, 3)));
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
	const PORT = 8932;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 70, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 250, atk: 180, def: 180, spa: 180, spd: 180, spe: 180 }, maxHP: 250, curHP: 250,
		exp: 343000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
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
			localStorage.removeItem('magepunk_bag_v1');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		// answer is the KEY the prompt closes with: 'z' = yes, 'x' = no
		await page.evaluate(() => {
			window.__drive = (label, answer = 'z') => {
				const ow = window.__ow;
				ow.cutscene.stop();
				ow.dialog.pages = null;
				ow.runScriptLabel(label);
				// update(dt), NOT step — `step?.()` silently no-ops and the script stalls
				for (let i = 0; i < 4000 && ow.cutscene.blocking; i++) {
					ow.cutscene.update(1 / 60);
					if (ow.dialog.blocking) { ow.dialog.revealed = 1e9; ow.dialog.key(answer); }
				}
				return !ow.cutscene.blocking;
			};
		});

		// --- the yes/no prompt actually branches both ways ---
		const bike = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('GoldenrodBikeShop');
			const declined = (() => { window.__drive('GoldenrodBikeShopClerkScript', 'x'); return ow.Bag.count('bicycle'); })();
			const accepted = (() => { window.__drive('GoldenrodBikeShopClerkScript', 'z'); return ow.Bag.count('bicycle'); })();
			return { declined, accepted, flag: ow.Story.getFlag('EVENT_GOT_BICYCLE') };
		});
		A(bike.declined === 0, 'answering NO to the bike shop declines it (the prompt is real, not assumed)', JSON.stringify(bike));
		A(bike.accepted > 0 && bike.flag, '...and answering YES hands over the BICYCLE, which was unobtainable before', JSON.stringify(bike));

		// --- the item gate: the MACHINE PART turn-in ---
		const mp = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('JohKantoPowerPlant');
			ow.Story.clearFlag('EVENT_RETURNED_MACHINE_PART');
			ow.Story.setFlag('EVENT_MET_MANAGER_AT_POWER_PLANT');
			// without the part in the bag the gate must NOT open
			window.__drive('PowerPlantManager');
			const withoutPart = ow.Story.getFlag('EVENT_RETURNED_MACHINE_PART');
			ow.Bag.addItem('machinepart', 1);
			window.__drive('PowerPlantManager');
			return { withoutPart, returned: ow.Story.getFlag('EVENT_RETURNED_MACHINE_PART'),
				power: ow.Story.getFlag('EVENT_RESTORED_POWER_TO_KANTO'), has: ow.Bag.count('machinepart') };
		});
		A(mp.withoutPart === false, 'the manager does NOT take a MACHINE PART you do not have', JSON.stringify(mp));
		A(mp.returned === true, '...and DOES take it once it is in the bag — the turn-in was unreachable before', JSON.stringify(mp));
		A(mp.power === true, '...restoring power to Kanto from the quest itself, not just from the Johto crown', JSON.stringify(mp));

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
