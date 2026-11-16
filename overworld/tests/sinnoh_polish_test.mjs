// sinnoh_polish_test.mjs — SINNOH, stage 5: what was still open after its story, way in and level ladder.
// The owner, 2026-11-16: "Do everything that is still open for Sinnoh".
//   * every object's script exists: the four story actors whose script has two names (Route 202's DAWN, Jubilife's
//     ROWAN, the school's and Route 203's BARRY) are no longer mute
//   * the items its scripts and balls hand over are items the bag knows; its two fossils revive
//   * music: each Sinnoh map with a track names a file that exists; its battle themes exist
//   * fly: each destination is a Sinnoh map, its landing tile inside the map and walkable
//   * in a browser: CYRUS's scene at Galactic HQ runs past the battle to its end (the defeat line named like a script
//     used to end it), a honey tree is slathered and gives a battle another day, a roamer is let loose, the Sinnoh
//     League turns away a trainer short of eight badges, the Name Rater answers in a shared room, the Town Map has a
//     SINNOH tab that fits, and the Trainer Card draws Sinnoh's badges
//   node overworld/tests/sinnoh_polish_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { BATTLE_THEMES } from '../bgm_themes.js';
import { FLY, REGION_ORDER, POS, GRID } from '../flydata.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9973;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(120); } return false; }
const J = f => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));
const has = f => fs.existsSync(path.join(D, f));

// ===== 1. the data =====
const index = J('map_index.json');
const stems = Object.entries(index).filter(([k]) => k.startsWith('MAP_SINNOH_')).map(([, v]) => v);
const scriptsOf = s => (has(`scripts/${s}.json`) ? J(`scripts/${s}.json`) : {});
for (const [stem, label] of [['SinnohRoute202', 'Route202_EventScript_Dawn'], ['SinnohJubilifeCity', 'JubilifeCity_EventScript_Rowan'], ['SinnohJubilifeCity_PokemonSchool', 'JubilifeCity_PokemonSchool_EventScript_Barry'], ['SinnohRoute203', 'Route203_EventScript_Barry']]) {
	const d = scriptsOf(stem), ops = d[label];
	A(Array.isArray(ops) && ops.length === 1 && ops[0].op === 'goto' && Array.isArray(d[ops[0].label]) && d[ops[0].label].length > 3, `${label} runs the scene it is the second name of`, ops);
}
{
	// text labels were never given a script of their own by that pass (they have lines; a second name has none)
	const d = scriptsOf('SinnohRoute202'), strings = J('strings/SinnohRoute202.json');
	const both = Object.keys(d).filter(k => strings[k] != null && Array.isArray(d[k]) && d[k].length === 1 && d[k][0].op === 'goto');
	A(both.length === 0, 'and no text label was turned into a script by it', both.slice(0, 4));
}
const { ITEMS } = await import('../bag.js');
const itemsNamed = new Set();
const norm = s => s.replace(/^ITEM_/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
for (const s of stems) {
	const m = J(`maps/${s}_map.json`);
	for (const o of m.object_events || []) if (o.script === 'Common_EventScript_FindItem' && /^ITEM_/.test(o.trainer_sight_or_berry_tree_id || '')) itemsNamed.add(o.trainer_sight_or_berry_tree_id);
}
A(['honey', 'skullfossil', 'armorfossil', 'oddkeystone', 'galactickey', 'workskey', 'suitekey', 'lunarwing', 'parcel', 'coupon1', 'coupon2', 'coupon3', 'oldcharm', 'gracidea', 'vsrecorder', 'pokeradar', 'journal', 'icicleplate', 'dowsingmachine'].every(id => ITEMS[id] && ITEMS[id].name),
	"the bag knows Sinnoh's own items (Honey, the fossils, its keys and keepsakes)");
{
	// a TM or HM is named by its move (tools/stage_sinnoh.py turns the source's numbers into names: its list is not
	// Gen 3's), and the game teaches by that name (ow_menukeys.js tmMoveId)
	const moves = J('moves_battle.json');
	const unknown = [...itemsNamed].filter(i => { const t = /^ITEM_(?:TM|HM)_(.+)$/.exec(i); return t ? !moves[norm(t[1])] : !ITEMS[norm(i)]; });
	A(![...itemsNamed].some(i => /^ITEM_(TM|HM)\d/.test(i)), 'no TM or HM is left as a bare number');
	A(itemsNamed.size > 150 && unknown.length === 0 && ITEMS.honey.price > 0, `its item balls name ${itemsNamed.size} kinds of item, and each is one the bag knows or a TM/HM of a move the game has; Honey has a price`, unknown.slice(0, 8));
}
const { FOSSIL_MONS } = await (async () => { const src = fs.readFileSync(path.join(ROOT, 'overworld/ow_places.js'), 'utf8'); const m = /export const FOSSIL_MONS = (\{[^}]+\});/.exec(src); return { FOSSIL_MONS: m ? (0, eval)('(' + m[1] + ')') : {} }; })();
A(FOSSIL_MONS.skullfossil === 'cranidos' && FOSSIL_MONS.armorfossil === 'shieldon' && FOSSIL_MONS.helixfossil === 'omanyte', 'the Skull and Armor Fossils revive as Cranidos and Shieldon (and Helix still as Omanyte)');

// music
const mm = J('music_map.json');
const withTrack = Object.keys(index).filter(k => k.startsWith('MAP_SINNOH_') && mm[k]);
const noFile = [...new Set(withTrack.map(k => mm[k]))].filter(k => !has(`sounds/bgm/${k}.ogg`));
A(withTrack.length >= 430 && noFile.length === 0, `${withTrack.length} Sinnoh maps have a track, and every track's file exists`, noFile.slice(0, 6));
A(mm.MAP_SINNOH_TWINLEAF_TOWN === 'sinnoh_MUS_DPP_TWINLEAF' && mm.MAP_SINNOH_JUBILIFE_CITY === 'sinnoh_MUS_DPP_JUBILIFE' && mm.MAP_LITTLEROOT_TOWN === 'emerald_MUS_LITTLEROOT', "Twinleaf and Jubilife play their own (and Littleroot still plays Littleroot's)", [mm.MAP_SINNOH_TWINLEAF_TOWN, mm.MAP_LITTLEROOT_TOWN]);
const themeGone = Object.entries(BATTLE_THEMES.sinnoh || {}).filter(([, k]) => !has(`sounds/bgm/${k}.ogg`));
A(BATTLE_THEMES.sinnoh && Object.keys(BATTLE_THEMES.sinnoh).length >= 12 && themeGone.length === 0 && BATTLE_THEMES.sinnoh.champion === 'sinnoh_MUS_DPP_VS_CYNTHIA' && BATTLE_THEMES.sinnoh.evil === 'sinnoh_MUS_DPP_VS_GALACTIC', "Sinnoh has its battle themes: its own wild, Galactic, Cyrus, Cynthia and Dialga/Palkia, each a file that exists", themeGone);

// fly
const badFly = [];
for (const t of FLY.sinnoh || []) {
	if (!index[t.map]) { badFly.push(t.name + ': no map'); continue; }
	const m = J(`maps/${index[t.map]}_map.json`), L = J(`layouts/${m.layout}.json`);
	if (!(t.x >= 0 && t.y >= 0 && t.x < L.width && t.y < L.height)) { badFly.push(t.name + ': outside'); continue; }
	if ((L.map[t.y][t.x] >> 10) & 3) badFly.push(t.name + ': lands on a wall');
	if (!POS[t.map]) badFly.push(t.name + ': no dot');
}
A(REGION_ORDER.includes('sinnoh') && (FLY.sinnoh || []).length >= 17 && GRID.sinnoh && badFly.length === 0, `Sinnoh has ${(FLY.sinnoh || []).length} fly destinations, each landing on a walkable tile of its own map, with a dot on the Town Map`, badFly);

// ===== 2. in the game =====
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'rattata', name: 'LEAD', level: 120, gender: 'M', friend: 70, types: ['Normal'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 400, atk: 300, def: 300, spa: 300, spd: 300, spe: 300 }, maxHP: 400, curHP: 400, exp: 1120000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19 }];
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req) { } res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'] });
	const open = async (map, extra) => {
		const page = await (await browser.createBrowserContext()).newPage(); page.errors = [];
		await page.setViewport({ width: 960, height: 640 });
		page.on('pageerror', e => page.errors.push(e.message));
		await page.evaluateOnNewDocument((st, party, extra) => {
			if (localStorage.getItem('magepunk_mp_token_v1')) return;
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party)); localStorage.setItem('magepunk_region', 'hoenn');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_started: true, intro_greeted: true, intro_done: true, story_seeded: true, newgame_flags_seeded: true, rival_tier0_done: true }, vars: {} }));
			for (const [k, v] of Object.entries(extra || {})) localStorage.setItem(k, JSON.stringify(v));
		}, STATE, PARTY, extra || null);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.world && window.__ow.world.current && window.__ow.battle && window.__ow.battle.data)), 60000);
		await sleep(2300);
		for (let i = 0; i < 40 && await page.evaluate(() => !!window.__ow.gateReport().blockedBy); i++) { await page.keyboard.press('KeyZ'); await sleep(220); }
		return page;
	};
	const gate = page => page.evaluate(() => { const g = window.__ow.gateReport(); return g.battleActive ? 'battle' : g.blockedBy; });
	const storyOf = page => page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_story') || '{}'));
	// run a script to its end, winning any battle; returns the battles' names and the lines shown
	const play = async (page, label) => {
		await page.evaluate(l => { window.__ow.runScriptLabel(l, null); }, label);
		const foes = [], lines = [];
		for (let i = 0, idle = 0; i < 260; i++) {
			const g = await gate(page);
			if (g === 'battle') { foes.push(await page.evaluate(() => { const a = window.__ow.battle.active; return a ? ((a.info && a.info.displayName) || 'wild') + ':' + (a.foes || [a.foe || a.enemy]).filter(Boolean).map(m => m.speciesId).join(',') : '?'; })); await sleep(700); await page.evaluate(() => window.__ow.battle.finish('victory')); await sleep(900); continue; }
			if (!g) { if (++idle > 10) break; await sleep(200); continue; }
			idle = 0;
			const t = await page.evaluate(() => { const d = window.__ow.dialog; return d && d.pages ? d.pages.flat().join(' ') : ''; }); if (t && lines[lines.length - 1] !== t) lines.push(t);
			await page.keyboard.press('KeyZ'); await sleep(230);
		}
		return { foes: [...new Set(foes)], lines };
	};

	// --- CYRUS at Galactic HQ: the scene runs past the battle ---
	{
		const page = await open('SinnohGalacticHQ_4F');
		const r = await play(page, 'GalacticHQ_4F_EventScript_SNCyrus'), s = await storyOf(page);
		const bag = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_bag_v1') || '{}'));
		A(r.foes.length === 1 && /CYRUS/.test(r.foes[0]), 'CYRUS battles you at Galactic HQ', r.foes);
		A(s.vars.VAR_SINNOH_STORY === 32 && s.flags.FLAG_SN_HIDE_HQ_CYRUS && (typeof bag === 'string' ? /masterball/.test(bag) : bag.masterball >= 1) && !(await gate(page)), 'and the scene goes on after it: his speech, the MASTER BALL, the story at 32, and you can walk', [s.vars.VAR_SINNOH_STORY, r.lines.length]);
		A(page.errors.length === 0, 'no page error at Galactic HQ', page.errors.slice(0, 3));
		await page.close();
	}

	// --- a honey tree, a roamer, the League's gate ---
	{
		const page = await open('SinnohEternaForest', { magepunk_bag_v1: { honey: 2 } });
		const r1 = await play(page, 'EternaForest_EventScript_SNHoneyTree'), s1 = await storyOf(page);
		const honey1 = await page.evaluate(async () => (await import('/overworld/bag.js')).count('honey'));
		A(s1.vars.VAR_SN_HONEY_TREE === 18 && honey1 === 1 && r1.foes.length === 0, 'slathering a honey tree uses one HONEY and marks the tree; nothing comes the same day', [s1.vars.VAR_SN_HONEY_TREE, honey1, r1.foes]);
		const r2 = await play(page, 'EternaForest_EventScript_SNHoneyTree');
		A(r2.foes.length === 0, 'looked at again that day, it is still only scented', r2.foes);
		await page.evaluate(() => { const S = window.__ow.Story; S.setVar('VAR_SN_HONEY_DAY', (S.getVar('VAR_DAYS') | 0) - 1); });
		const r3 = await play(page, 'EternaForest_EventScript_SNHoneyTree'), s3 = await storyOf(page);
		const HONEY = ['wurmple', 'silcoon', 'cascoon', 'burmy', 'combee', 'aipom', 'heracross', 'munchlax'];
		A(r3.foes.length === 1 && /^wild:/.test(r3.foes[0]) && HONEY.includes(r3.foes[0].split(':')[1]) && (s3.vars.VAR_SN_HONEY_TREE | 0) === 0, 'another day a wild POKéMON is on it (one of the honey-tree species), and the tree is fresh again', r3.foes);

		const roam = await page.evaluate(async () => { const m = await import('/overworld/ow_story.js'), F = await import('/overworld/ow_features.js'); const before = !!F.roamState().mesprit; m.runSpecial('SinnohAddRoamer__MESPRIT__50'); F.roamersOnMapChange(); const st = F.roamState(); return { before, map: st.mesprit && st.mesprit.map, others: ['cresselia', 'articuno'].some(k => st[k]) }; });
		A(!roam.before && /^SinnohRoute\d/.test(roam.map || '') && !roam.others, 'MESPRIT roams Sinnoh once its scene lets it loose (and the roamers not yet let loose do not)', roam);
		A(page.errors.length === 0, 'no page error in Eterna Forest', page.errors.slice(0, 3));
		await page.close();
	}
	{
		const page = await open('SinnohPokemonLeague_AaronRoom');
		const r = await play(page, 'PokemonLeague_AaronRoom_EventScript_Sidney');
		A(r.foes.length === 0 && r.lines.some(l => /all 8 badges/.test(l)) && !(await gate(page)), 'AARON will not battle a trainer short of eight Sinnoh badges', r);
		await page.evaluate(async () => { const B = await import('/overworld/badges.js'); for (const b of B.BADGES.SINNOH) B.earn('SINNOH', b.id); });
		const r2 = await play(page, 'PokemonLeague_AaronRoom_EventScript_Sidney');
		A(r2.foes.length === 1 && /AARON/.test(r2.foes[0]), 'with all eight he does', r2.foes);
		await page.close();
	}

	// --- the Name Rater in a shared flat, the Town Map tab, the Trainer Card row ---
	{
		const page = await open('SinnohEternaCity_Flat1_F1', { magepunk_badges_v1: { badges: { SINNOH: { coal: true, forest: true } }, champion: { KANTO: true, JOHTO: true, HOENN: true, JOHKANTO: true } } });
		const who = await page.evaluate(() => { const n = window.__ow.npcs.list.find(q => q.ev && /NameRater$/.test(q.ev.script || '')); return n ? [n.tx, n.ty] : null; });
		A(!!who, 'the Name Rater lives in an Eterna flat', who);
		if (who) {
			const spot = await page.evaluate(([x, y]) => { const ow = window.__ow; for (const [dx, dy, key] of [[0, 1, 'ArrowUp'], [0, -1, 'ArrowDown'], [1, 0, 'ArrowLeft'], [-1, 0, 'ArrowRight']]) if (ow.world.isPassable(x + dx, y + dy)) { ow.player.setTile(x + dx, y + dy); return key; } return null; }, who);
			await page.keyboard.down(spot); await sleep(200); await page.keyboard.up(spot); await sleep(250);
			await page.keyboard.press('KeyZ'); await sleep(500);
			const opened = await page.evaluate(async () => (await import('/overworld/ow_music.js')).nameRater.open);
			A(opened === true, 'talking to him opens the Name Rater', opened);
			await page.keyboard.press('KeyX'); await sleep(300); await page.keyboard.press('Escape'); await sleep(300);
		}
		const tm = await page.evaluate(async () => {
			const M = await import('/overworld/ow_music.js'), F = await import('/overworld/flydata.js'), ow = window.__ow;
			M.openTownMap(); await new Promise(r => setTimeout(r, 500));
			const tabs = (ow.menuUi || []).filter(b => /^townreg:/.test(b.id)), c = document.querySelector('canvas');
			const st = (await import('/overworld/ow_menustate.js')).townMap;
			st.region = F.REGION_ORDER.indexOf('sinnoh'); await new Promise(r => setTimeout(r, 400));
			const dots = (window.__ow.menuUi || []).filter(b => /^town:/.test(b.id));
			const out = { tabs: tabs.length, fit: tabs.every(b => b.x >= 0 && b.x + b.w <= c.width + 1), labels: tabs.map(b => b.label), dots: dots.length, inside: dots.every(b => b.x > 0 && b.y > 0 && b.x < c.width && b.y < c.height) };
			st.open = false; return out;
		});
		A(tm.tabs === 6 && tm.fit && tm.labels.includes('SINNOH') && tm.dots >= 17 && tm.inside, 'the Fly Map has its region tabs on screen, SINNOH among them, with its towns on the panel', tm);
		const card = await page.evaluate(async () => { const M = await import('/overworld/ow_menus.js'), c = document.querySelector('canvas'); let err = null; try { M.drawTrainerCard(c.width, c.height); } catch (e) { err = String(e); } const B = await import('/overworld/badges.js'); return { err, list: B.list('SINNOH').filter(b => b.earned).map(b => b.id), art: !!window.__ow.badgeSprite }; });
		A(card.err === null && JSON.stringify(card.list) === '["coal","forest"]', "the Trainer Card draws with Sinnoh's row (Coal and Forest earned)", card);
		A(page.errors.length === 0, 'no page error in the flat', page.errors.slice(0, 3));
		await page.close();
	}
} finally { if (browser) await browser.close(); server.close(); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
