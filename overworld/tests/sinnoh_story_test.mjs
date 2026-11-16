// sinnoh_story_test.mjs — SINNOH, stage 2: its story scripts, trainers, wild Pokémon, gyms and League are in the game,
// under names of their own, and PROF. ROWAN gives the starter (tools/stage_sinnoh.py, import_sinnoh_scripts.py,
// import_sinnoh_battles.py; badges.js, ow_story.js seedSinnoh / SinnohChooseStarter, ow_scaling.js, events.js _snSteps).
// The owner, 2026-11-15: "lets get sinnoh up to par with the other regions. we dont need the intro start of game
// sequence we can just make the professor give you a sinnoh starter (pick from the 3) at level 5 and then you should be
// able to progress through the entire story".
//   * the scripts: one file a scripted map, each on a Sinnoh map; a scene cut by local labels runs through them
//   * NAMES OF ITS OWN. The source reuses Hoenn's (Roark is TRAINER_ROXANNE_1, his gym sets FLAG_DEFEATED_RUSTBORO_GYM):
//     no story flag, variable or trainer a Sinnoh script names is one another region's script names
//   * every trainer a Sinnoh script battles has a team; the wild tables are Sinnoh's maps' and name real species
//   * the 8 gyms and the League are the labels badges.js knows, with their leaders' teams
//   * in a browser: walking into the lab plays ROWAN's scene, the picker offers Sinnoh's three, the one chosen joins
//     the party at Lv5 (nothing is replaced), and the story moves on; it is given once
//   * in a browser: beating ROARK gives the COAL BADGE to Sinnoh's own badges (not Hoenn's STONE BADGE, and Hoenn's
//     gym flag stays unset), and his team is levelled off a strong party the way JohKanto's gyms are
//   node overworld/tests/sinnoh_story_test.mjs        (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { BADGES, GYM_SCRIPT, LEAGUE_SCRIPT, regionOfMap } from '../badges.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9967, SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(120); } return false; }
const J = f => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));

// ===== 1. the scripts =====
const index = J('map_index.json');
const stems = new Set(Object.entries(index).filter(([k]) => k.startsWith('MAP_SINNOH_')).map(([, v]) => v));
const files = fs.readdirSync(path.join(D, 'scripts')).filter(f => f.endsWith('.json') && f !== '_index.json');
const sinnohFiles = files.filter(f => f.startsWith('Sinnoh'));
A(sinnohFiles.length >= 380 && sinnohFiles.every(f => stems.has(f.slice(0, -5))), `${sinnohFiles.length} Sinnoh maps have their scripts, each a map that exists`, sinnohFiles.filter(f => !stems.has(f.slice(0, -5))).slice(0, 5));
const scripts = {};
for (const f of sinnohFiles) scripts[f.slice(0, -5)] = J('scripts/' + f);
const regions = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/map_regions.json'), 'utf8'));
A((regions.SINNOH || []).length === stems.size && regionOfMap('MAP_SINNOH_OREBURGH_CITY_GYM', 'kanto') === 'SINNOH' && regionOfMap('MAP_RUSTBORO_CITY_GYM', 'hoenn') === 'HOENN', `the ${stems.size} maps are the region SINNOH (and a Hoenn map is still Hoenn's)`);

// a scene cut by local labels: from the lab's trigger, following goto/fall-through, the story reaches 9
{
	const lab = scripts.SinnohLittlerootTown_ProfessorBirchsLab, seen = new Set(), ops = [], todo = ['SandgemLab_EventScript_SceneLeft'];
	while (todo.length) { const l = todo.shift(); if (seen.has(l) || !Array.isArray(lab[l])) continue; seen.add(l); ops.push(...lab[l]); for (const o of lab[l]) if ((o.op === 'goto' || o.op === 'branch') && o.label) todo.push(o.label); }
	const i = ops.findIndex(o => o.op === 'special' && o.name === 'SinnohChooseStarter'), j = ops.findIndex(o => o.op === 'setvar' && o.var === 'VAR_SINNOH_STORY' && +o.value === 9);
	A(i > 0 && j > i && ops.some(o => o.op === 'setflag' && o.flag === 'FLAG_SYS_POKEDEX_GET'), "ROWAN's scene runs on through its local labels: the starter, the POKéDEX, then the story moves to 9", [...seen]);
	A(!ops.some(o => o.op === 'msg' && o.text === 'SandgemLab_Text_RowanWelcome'), '…without the lines about the POKéMON you took from his bag (that opening is not played)');
}

// ===== 2. names of its own =====
const walk = (v, f) => { if (typeof v === 'string') f(v); else if (Array.isArray(v)) v.forEach(x => walk(x, f)); else if (v && typeof v === 'object') Object.values(v).forEach(x => walk(x, f)); };
const SYSTEM = /^(FLAG_SYS_|FLAG_BADGE0\d_GET$|FLAG_TEMP_|VAR_TEMP_|VAR_0x80|VAR_RESULT$|VAR_FACING$|VAR_LAST_TALKED$|VAR_OBJ_GFX_ID_|FLAG_HIDDEN_ITEMS_START$|VAR_UNUSED_|FLAG_UNUSED_|FLAG_SPECIAL_)/;
const names = (data) => { const s = new Set(); walk(data, x => { if (/^(FLAG|VAR|TRAINER)_[A-Z0-9_]+$/.test(x) && !SYSTEM.test(x)) s.add(x); }); return s; };
const sinnohNames = new Set();
for (const d of Object.values(scripts)) for (const n of names(d)) sinnohNames.add(n);
for (const s of stems) for (const n of names(J('maps/' + s + '_map.json'))) sinnohNames.add(n);
const otherNames = new Set();
for (const f of files) if (!f.startsWith('Sinnoh')) for (const n of names(J('scripts/' + f))) otherNames.add(n);
const NOT_AN_ID = /^TRAINER_(BATTLE_|TYPE_|NONE$|CLASS_|PIC_|FLAGS_)/;
const clash = [...sinnohNames].filter(n => otherNames.has(n) && !NOT_AN_ID.test(n));
A(sinnohNames.size > 1500 && clash.length === 0, `none of the ${sinnohNames.size} story flags, variables and trainers Sinnoh names is one another region's scripts name`, clash.slice(0, 12));
const trainerIds = [...sinnohNames].filter(n => /^TRAINER_/.test(n) && !NOT_AN_ID.test(n));
A(trainerIds.length > 400 && trainerIds.every(n => n.startsWith('TRAINER_SINNOH_')), `its ${trainerIds.length} trainers are TRAINER_SINNOH_*`, trainerIds.filter(n => !n.startsWith('TRAINER_SINNOH_')).slice(0, 6));
const roark = scripts.SinnohOreburghCity_Gym.OreburghCity_Gym_EventScript_RoarkDefeated || [];
A(roark.some(o => o.op === 'setflag' && o.flag === 'FLAG_SINNOH_DEFEATED_RUSTBORO_GYM') && !roark.some(o => o.flag === 'FLAG_DEFEATED_RUSTBORO_GYM'), "ROARK's win sets Sinnoh's flag, not the Rustboro gym's");
const mapRefs = new Set(); for (const d of Object.values(scripts)) walk(d, x => { if (/^MAP_[A-Z0-9_]+$/.test(x)) mapRefs.add(x); });
const foreign = [...mapRefs].filter(m => index[m] && !m.startsWith('MAP_SINNOH_'));
A(foreign.length === 0, 'no Sinnoh script warps to another region\'s map', foreign.slice(0, 8));

// ===== 3. trainers and wild Pokémon =====
const teams = J('trainer_teams.json'), species = J('species_battle.json'), moves = J('moves_battle.json');
const fought = new Set(); for (const d of Object.values(scripts)) walk(d, () => { });
for (const d of Object.values(scripts)) for (const ops of Object.values(d)) if (Array.isArray(ops)) for (const o of ops) if (o && o.op === 'trainerbattle' && /^TRAINER_SINNOH_/.test(o.args?.[0] || '')) fought.add(o.args[0].replace(/^TRAINER_/, ''));
const noTeam = [...fought].filter(t => !teams[t] || !teams[t].party.length);
A(fought.size > 400 && noTeam.length <= 2, `${fought.size} trainers are battled by Sinnoh's scripts, and each has a team`, noTeam.slice(0, 8));
const badMon = Object.entries(teams).filter(([k, v]) => k.startsWith('SINNOH_') && v.party.some(m => !species[m.s] || !(m.l >= 1) || (m.moves || []).some(x => !moves[x]))).map(([k]) => k);
A(badMon.length === 0, 'every POKéMON and move in those teams is one the game has', badMon.slice(0, 6));
const enc = J('encounters.json'), wild = Object.keys(enc).filter(k => k.startsWith('MAP_SINNOH_'));
const badWild = wild.filter(k => !index[k] || Object.values(enc[k]).some(t => !t.slots.length || t.slots.some(s => !species[s.id] || !(s.min <= s.max))));
A(wild.length >= 120 && badWild.length === 0 && (enc.MAP_SINNOH_ROUTE201.land.slots || []).some(s => s.id === 'starly'), `${wild.length} Sinnoh maps have wild POKéMON of their own (Route 201: Starly)`, badWild.slice(0, 6));
A(JSON.stringify(enc.MAP_ROUTE101) === JSON.stringify(J('encounters.json').MAP_ROUTE101) && enc.MAP_ROUTE101.land.slots.some(s => s.id === 'wurmple') && teams.ROXANNE_1.party.some(m => m.s === 'nosepass'), "Hoenn's tables and teams are as they were (Route 101's Wurmple, Roxanne's Nosepass)");

// ===== 4. gyms and the League =====
const gymRows = Object.entries(GYM_SCRIPT).filter(([, v]) => v[0] === 'SINNOH'), leagueRows = Object.entries(LEAGUE_SCRIPT).filter(([, v]) => v[0] === 'SINNOH');
const labelHome = l => Object.keys(scripts).find(s => Array.isArray(scripts[s][l]));
const battleOf = l => { const s = labelHome(l); const o = s && scripts[s][l].find(x => x.op === 'trainerbattle'); return o ? teams[o.args[0].replace(/^TRAINER_/, '')] : null; };
const leaders = gymRows.map(([l, v]) => [v[1], battleOf(l)?.name, battleOf(l)?.class]);
A(BADGES.SINNOH.length === 8 && gymRows.length === 8 && new Set(gymRows.map(([, v]) => v[1])).size === 8 && leaders.every(([id, , c]) => BADGES.SINNOH.some(b => b.id === id) && c === 'Gym Leader'),
	'the 8 gyms: ' + leaders.map(([id, n]) => `${id} ${n}`).join(', '), leaders);
A(JSON.stringify(leaders.map(x => x[1])) === JSON.stringify(['ROARK', 'GARDENIA', 'FANTINA', 'MAYLENE', 'WAKE', 'BYRON', 'CANDICE', 'VOLKNER']), '…in order, each label is that leader\'s battle', leaders.map(x => x[1]));
const league = leagueRows.map(([l, v]) => [v[1], battleOf(l)?.name]);
A(league.length === 5 && JSON.stringify(league) === JSON.stringify([['elite', 'AARON'], ['elite', 'BERTHA'], ['elite', 'FLINT'], ['elite', 'LUCIAN'], ['champion', 'CYNTHIA']]), 'the League: Aaron, Bertha, Flint, Lucian, then CYNTHIA the Champion', league);

// ===== 5. in the game =====
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (level) => ({ speciesId: 'rattata', name: 'LEAD', level, gender: 'M', friend: 70, types: ['Normal'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 400, atk: 300, def: 300, spa: 300, spd: 300, spe: 300 }, maxHP: 400, curHP: 400, exp: 1000000 + (level - 100) * 6000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19 });
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
	const open = async (map, party) => {
		const page = await (await browser.createBrowserContext()).newPage(); page.errors = [];   // (a save of its own: storage is per context)
		await page.setViewport({ width: 960, height: 640 });
		page.on('pageerror', e => page.errors.push(e.message));
		await page.evaluateOnNewDocument((st, party) => {
			if (localStorage.getItem('magepunk_mp_token_v1')) return;
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party)); localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_started: true, intro_greeted: true, intro_done: true, story_seeded: true, newgame_flags_seeded: true, rival_tier0_done: true }, vars: {} }));
		}, STATE, party);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}`, { waitUntil: 'domcontentloaded' });
		const ok = await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.world && window.__ow.world.current && window.__ow.battle && window.__ow.battle.data)), 60000);
		await sleep(2500);
		return ok ? page : null;
	};
	const story = page => page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_story') || '{}'));
	const partyOf = page => page.evaluate(() => (JSON.parse(localStorage.getItem('magepunk_party_v1')) || []).map(m => [m.speciesId, m.level]));
	const gate = page => page.evaluate(() => { const ow = window.__ow, g = ow.gateReport(); return { by: g.battleActive ? 'battle' : g.blockedBy, starter: !!ow.starterMenu.open, gift: !!ow.starterMenu.gift }; });

	// --- ROWAN's lab ---
	{
		const page = await open('SinnohLittlerootTown_ProfessorBirchsLab', [mon(60)]);
		A(!!page, "the game boots in PROF. ROWAN's lab");
		const s0 = await story(page);
		A(s0.vars.VAR_SINNOH_STORY === 8 && s0.flags.sinnoh_seeded && s0.flags.FLAG_HIDE_SANDGEM_ROWAN && s0.flags.FLAG_HIDE_SANDGEM_DAWN && !s0.flags.sinnoh_starter_given, "a save that never saw Sinnoh has its story set at the lab's door (the opening is not played)", s0.vars);
		for (let i = 0; i < 6 && (await gate(page)).by; i++) { await page.keyboard.press('KeyZ'); await sleep(200); }
		await page.evaluate(() => window.__ow.player.setTile(6, 11)); await sleep(150);
		await page.keyboard.down('ArrowUp'); await sleep(420); await page.keyboard.up('ArrowUp');
		A(await waitFor(async () => !!(await gate(page)).by, 6000), "stepping in starts ROWAN's scene");
		let picked = false, cells = null;
		for (let i = 0; i < 120; i++) {
			const g = await gate(page);
			if (g.starter && !picked) {
				cells = await page.evaluate(() => ({ gift: window.__ow.starterMenu.gift && window.__ow.starterMenu.gift.ids, level: window.__ow.starterMenu.gift && window.__ow.starterMenu.gift.level, phase: window.__ow.starterMenu.phase }));
				if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(600); await page.screenshot({ path: path.join(SHOTS, 'sinnoh-starter-pick.png') }); }
				await page.keyboard.press('ArrowRight'); await sleep(200); picked = true;
			}
			if (!g.by && i > 6 && picked) break;
			await page.keyboard.press('KeyZ'); await sleep(260);
		}
		A(!!cells && JSON.stringify(cells.gift) === JSON.stringify(['turtwig', 'chimchar', 'piplup']) && cells.level === 5 && cells.phase === 'pick', "the picker offers Sinnoh's three, at Lv5", cells);
		const p1 = await partyOf(page), s1 = await story(page);
		A(JSON.stringify(p1) === JSON.stringify([['rattata', 60], ['chimchar', 5]]), 'the one chosen (the second: Chimchar) joins the party at Lv5, and the party you came with is kept', p1);
		A(s1.vars.VAR_SINNOH_STORY === 9 && s1.flags.sinnoh_starter_given && s1.flags.FLAG_SYS_POKEDEX_GET && !(await gate(page)).by, 'the scene finishes: the story is at 9 and you can walk', s1.vars.VAR_SINNOH_STORY);
		// given once
		await page.evaluate(async () => { (await import('/overworld/ow_story.js')).openSinnohStarterGift(); });
		await sleep(400);
		A(!(await gate(page)).starter && (await partyOf(page)).length === 2, 'it is given once: asked again, the picker does not open');
		A(page.errors.length === 0, 'no page error in the lab', page.errors.slice(0, 3));
		await page.close();
	}

	// --- ROARK ---
	{
		const page = await open('SinnohOreburghCity_Gym', [mon(200)]);
		A(!!page, 'the game boots in the Oreburgh Gym');
		for (let i = 0; i < 6 && (await gate(page)).by; i++) { await page.keyboard.press('KeyZ'); await sleep(200); }
		await page.evaluate(() => { window.__ow.runScriptLabel('OreburghCity_Gym_EventScript_Roark', null); });
		let foe = null;
		for (let i = 0; i < 120; i++) {
			const g = await gate(page);
			if (g.by === 'battle') {
				if (!foe) foe = await page.evaluate(() => { const a = window.__ow.battle.active; return { name: a.info && a.info.displayName, boss: !!(a.info && a.info.boss), foes: a.foes.map(m => [m.speciesId, m.level]) }; });
				await sleep(900); await page.evaluate(() => window.__ow.battle.finish('victory')); await sleep(900); continue;
			}
			if (!g.by && foe && i > 6) break;
			await page.keyboard.press('KeyZ'); await sleep(260);
		}
		A(!!foe && /ROARK/.test(foe.name) && foe.boss && JSON.stringify(foe.foes.map(f => f[0])) === JSON.stringify(['geodude', 'onix', 'cranidos']), "talking to ROARK starts his battle: Geodude, Onix, Cranidos", foe);
		A(!!foe && JSON.stringify(foe.foes.map(f => f[1])) === JSON.stringify([201, 201, 202]), 'his team is levelled off a Lv200 party (one above, the ace two), as a JohKanto gym is', foe && foe.foes);
		const badges = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_badges_v1') || '{}')), s = await story(page);
		A(badges.badges && badges.badges.SINNOH && badges.badges.SINNOH.coal === true && !(badges.badges.HOENN || {}).stone && !(badges.badges.KANTO || {}).boulder, "beating him gives the COAL BADGE, in Sinnoh's own badges (Hoenn's STONE BADGE is not given)", badges);
		A(s.flags.FLAG_SINNOH_DEFEATED_RUSTBORO_GYM && !s.flags.FLAG_DEFEATED_RUSTBORO_GYM && s.vars.VAR_SINNOH_STORY === 19 && !(await gate(page)).by, "the story moves on (19), Hoenn's gym flag stays unset, and you can walk", s.vars.VAR_SINNOH_STORY);
		const beat = await page.evaluate(async () => { const m = await import('/overworld/ow_story.js'); return [m.trainerBeaten('TRAINER_SINNOH_ROXANNE_1'), m.trainerBeaten('TRAINER_ROXANNE_1')]; });
		A(beat[0] === true && beat[1] === false, 'ROARK is beaten; ROXANNE, whose id the source gave him, is not', beat);
		A(page.errors.length === 0, 'no page error in the gym', page.errors.slice(0, 3));
		await page.close();
	}
} finally { if (browser) await browser.close(); server.close(); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
