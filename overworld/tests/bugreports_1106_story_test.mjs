// bugreports_1106_story_test.mjs — the 2026-11-06 overworld story / battle reports.
//
//   bug:1793639442140 (+ SUPPLEMENT 1793639523218, Instinct): after Maxie, Mt Chimney's
//     Magma/Aqua grunts and POOCHYENA stayed solid across Jagged Pass's only path (y39)
//     with FLAG_HIDE_MT_CHIMNEY_TEAM_* already set, until the map was re-entered. The
//     port read an object's hide flag on map load only; the GBA re-reads it whenever the
//     object scrolls back into view (ow_objsync.js). Trainers ignored `hidden` entirely.
//   bug:1793754263899 (Instinct): the Route 16 SNORLAX stayed (solid, fightable again)
//     after its battle — its removal lives in the map's ON_RESUME script, which the
//     port never ran on the return from a battle (ow_scaling runOnResumeAfterBattle).
//   bug:1793644531145 (Instinct): the Slateport Museum grunts said their DEFEAT line
//     before their battle — `trainerbattle_no_intro`'s one text is the defeat text.
//   bug:1793658630715 (Instinct): Norman stuck at VAR_PETALBURG_GYM_STATE 7 with no
//     Balance Badge — each prerequisite gym's `addvar` landed on top of the badge
//     derivation (counted twice). Plus the repair of a save already at 7.
//   bug:1794001056409 (Remytest): Roxanne beaten, badge held, FLAG_DEFEATED_RUSTBORO_GYM
//     never set — a scripted battle resumed after a reload dropped the rest of its
//     script. Now resumed for real; saves already like that catch it up in the gym.
//
//   node overworld/tests/bugreports_1106_story_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9731;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const J = rel => JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data', rel), 'utf8'));

// ===== data: what the scripts themselves do =====
{
	const mc = J('scripts/MtChimney.json').MtChimney_EventScript_Maxie || [];
	const sets = mc.filter(o => o.op === 'setflag').map(o => o.flag);
	A(sets.includes('FLAG_HIDE_MT_CHIMNEY_TEAM_MAGMA') && sets.includes('FLAG_HIDE_MT_CHIMNEY_TEAM_AQUA'),
		'[1793639442140] Maxie\'s script hides the y39 crowd by FLAG only (no removeobject for the anonymous grunts)');
	const r16 = J('scripts/Route16.json');
	A(r16.__map__?.onResume === 'Route16_OnResume' && JSON.stringify(r16.Route16_EventScript_RemoveSnorlax || []).includes('hideobj'),
		'[1793754263899] Route 16 removes its SNORLAX in ON_RESUME (the return from the battle), not in the Snorlax script');
}

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		return res.end(JSON.stringify({ ok: true, state: { username: 'bug1106', friendCode: 'B1106', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } }, friends: [], challenges: [] }));
	}
	const f = path.join(ROOT, u);
	fs.readFile(f, (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
async function open(map, x, y, { region = 'HOENN', flags = {}, vars = {}, badges = { badges: {}, champion: {} }, defeated = [], party = 'mewtwo', bag = {} } = {}) {
	const page = await browser.newPage();
	page.on('pageerror', e => console.log('  (pageerror) ' + String(e.message).slice(0, 160)));
	await page.evaluateOnNewDocument((region, flags, vars, badges, defeated, bag) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'bug1106', friendCode: 'B1106', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } }));
		localStorage.setItem('magepunk_region', region);
		localStorage.setItem('magepunk_bag_v1', JSON.stringify({ pokeball: 20, ...bag }));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify(badges));
		localStorage.setItem('magepunk_defeated_v1', JSON.stringify(defeated));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, ...flags }, vars }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
		localStorage.setItem('magepunk_repel_v1', '99999');
	}, region, flags, vars, badges, defeated, bag);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
	await boot(page, map);
	await page.evaluate(async sp => {
		const B = await import('./battle.js'), S = (await import('./ow_state.js')).S, P = await import('./party.js');
		S.party = [B.buildMon(sp, 70, window.__ow.battle.data)]; P.saveParty(S.party);
	}, party);
	await page.evaluate(() => { const d = window.__ow.dialog, o = d.open.bind(d); window.__dlg = []; d.open = (t, cb) => { window.__dlg.push((window.__ow.battle.active ? '[B] ' : '') + String(t)); return o(t, cb); }; });
	return page;
}
const boot = async (page, map) => { for (let i = 0; i < 600 && !(await page.evaluate(m => !!(window.__ow?.battle?.data && window.__ow.world?.current?.name === m && window.__ow.player), map).catch(() => false)); i++) await sleep(100); await sleep(1200); };
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const tap = async (page, k, ms = 60) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(350); };
async function step(page, dir) {
	const at = await page.evaluate(() => [window.__ow.world.current.name, window.__ow.player.tx, window.__ow.player.ty]);
	await page.keyboard.down(KEY[dir]);
	for (let i = 0; i < 40; i++) {
		await sleep(25);
		const s = await page.evaluate(() => [window.__ow.world.current.name, window.__ow.player.tx, window.__ow.player.ty]);
		if (s[0] !== at[0] || s[1] !== at[1] || s[2] !== at[2]) break;
	}
	await page.keyboard.up(KEY[dir]);
	for (let i = 0; i < 40 && await page.evaluate(() => window.__ow.player.moving); i++) await sleep(25);
	await sleep(250);
}
const face = (page, dir) => page.evaluate(d => { window.__ow.player.facing = d; }, dir);
const where = page => page.evaluate(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty }));
// advance dialogs until a battle starts or everything is quiet
const drive = (page, ms = 20000) => page.evaluate(async ms => {
	const O = window.__ow;
	const t0 = Date.now(); let calm = 0;
	while (Date.now() - t0 < ms) {
		if (O.battle.active) return 'battle';
		const d = O.dialog.blocking, c = O.cutscene.blocking;
		if (!d && !c && !O.battle.blocking) { if (++calm >= 12) return 'idle'; } else calm = 0;
		if (d) O.dialog.key('z');
		await new Promise(r => setTimeout(r, 40));
	}
	return 'timeout';
}, ms);
async function endBattle(page, result = 'victory') {
	for (let i = 0; i < 100 && !(await page.evaluate(() => !!window.__ow.battle.active)); i++) await sleep(50);
	await page.evaluate(r => window.__ow.battle.finish(r), result);
	for (let i = 0; i < 200 && await page.evaluate(() => !!window.__ow.battle.active); i++) await sleep(50);
}
const story = (page, names) => page.evaluate(async names => {
	const St = await import('./events.js');
	return Object.fromEntries(names.map(n => [n, /^VAR_/.test(n) ? St.getVar(n) : St.getStoredFlag(n)]));
}, names);

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// ===== bug:1793639442140 / 1793639523218: Mt Chimney after Maxie =====
	{
		const page = await open('MtChimney', 13, 7, { region: 'HOENN' });
		const y39 = () => page.evaluate(() => {
			const O = window.__ow;
			return { blocks: [19, 20, 21, 22].map(x => O.npcs.npcBlocks(x, 39) || O.trainers.occupied(x, 39)),
				visible: O.npcs.list.filter(n => !n.hidden && +n.ev.y === 39).map(n => n.ev.script).sort() };
		});
		const before = await y39();
		A(before.blocks[1] && before.blocks[2] && before.visible.length >= 3,
			'[1793639442140] before Maxie the Aqua/Magma/POOCHYENA line blocks y39', JSON.stringify(before));
		// the real tail of Maxie's script, from just past his battle: removeobjects, the
		// two hide flags, Archie's walk-on and exit, the Lava Cookie lady's clearflag
		const ran = await page.evaluate(async () => {
			const O = window.__ow, S = (await import('./ow_state.js')).S;
			const ops = S.mapScripts.MtChimney_EventScript_Maxie;
			const i = ops.findIndex(o => o.op === 'trainerbattle');
			if (i < 0) return false;
			S.mapScripts.__maxieTail = ops.slice(i + 1);
			O.cutscene.run(S.mapScripts, '__maxieTail', O.cutsceneCtxForTest(), () => {});
			return true;
		});
		A(ran, 'Maxie\'s post-battle script runs');
		A(await drive(page) === 'idle', '...to the end, with no dialog left');
		const fl = await story(page, ['FLAG_HIDE_MT_CHIMNEY_TEAM_MAGMA', 'FLAG_HIDE_MT_CHIMNEY_TEAM_AQUA', 'FLAG_DEFEATED_EVIL_TEAM_MT_CHIMNEY']);
		A(Object.values(fl).every(Boolean), 'both hide flags + FLAG_DEFEATED_EVIL_TEAM_MT_CHIMNEY are set', JSON.stringify(fl));
		await sleep(300);
		const gone = await page.evaluate(() => {
			const O = window.__ow;
			const flagged = [...O.npcs.list, ...O.trainers.list].filter(o => /FLAG_HIDE_MT_CHIMNEY_TEAM_/.test(o.ev.flag || ''));
			return { left: flagged.filter(o => !o.hidden).map(o => `${o.ev.script}@${o.tx},${o.ty}`) };
		});
		A(gone.left.length === 0, '[1793639442140] every Magma/Aqua/POOCHYENA object left the map without a re-entry', JSON.stringify(gone.left));
		const after = await y39();
		A(!after.blocks[1] && !after.blocks[2] && !after.visible.some(s => /Busy|Poochyena/.test(s)),
			'[1793639442140] the y39 line no longer blocks or shows', JSON.stringify(after));
		// walk down to the line: the Lava Cookie lady (her flag was CLEARED by the same
		// script) comes into view, and (20,39) -> (20,41) is open
		await page.evaluate(() => { window.__ow.player.setTile(20, 37); });
		await sleep(600);
		const lady = await page.evaluate(() => window.__ow.npcs.list.filter(n => !n.hidden && n.ev.script === 'MtChimney_EventScript_LavaCookieLady').map(n => [n.tx, n.ty]));
		A(lady.length === 1, '[1793639442140] the Lava Cookie lady appears once, as the camera reaches her', JSON.stringify(lady));
		await step(page, 'down');
		await face(page, 'down'); await page.evaluate(() => { window.__dlg.length = 0; window.__ow.interact(); });
		await sleep(300);
		const talk = await page.evaluate(() => window.__dlg.slice());
		A(talk.length === 0, '[1793639442140] Z at (20,38) facing the old line: no POOCHYENA there any more', JSON.stringify(talk));
		await page.evaluate(() => { while (window.__ow.dialog.blocking) window.__ow.dialog.key('x'); });
		await step(page, 'down'); await step(page, 'down');
		const at = await where(page);
		A(at.map === 'JaggedPass' || at.y >= 40, '[1793639442140] the player walks south through y39 toward Jagged Pass', JSON.stringify(at));
		await page.close();
	}

	// ===== bug:1793754263899: the Route 16 SNORLAX leaves after its battle =====
	for (const result of ['victory', 'escaped']) {
		const page = await open('Route16', 32, 13, { region: 'KANTO', flags: { FLAG_GOT_POKE_FLUTE: true }, bag: { pokeflute: 1 } });
		const pre = await page.evaluate(() => { const n = window.__ow.npcs.list.find(o => o.ev.script === 'Route16_EventScript_Snorlax'); return { here: !!n && !n.hidden, blocks: window.__ow.npcs.npcBlocks(31, 13) }; });
		A(pre.here && pre.blocks, `[1793754263899] (${result}) SNORLAX lies across the road before the flute`, JSON.stringify(pre));
		await face(page, 'left');
		await page.evaluate(async () => { (await import('./events.js')).setVar('VAR_RESULT', 1); window.__ow.interact(); });
		A(await drive(page) === 'battle', `[1793754263899] (${result}) the POKe FLUTE wakes it and the battle starts`);
		await endBattle(page, result);
		A(await drive(page) === 'idle', `[1793754263899] (${result}) the post-battle line plays out`);
		const post = await page.evaluate(() => { const n = window.__ow.npcs.list.find(o => o.ev.script === 'Route16_EventScript_Snorlax'); return { shown: !!n && !n.hidden, blocks: window.__ow.npcs.npcBlocks(31, 13) }; });
		A(!post.shown && !post.blocks, `[1793754263899] (${result}) SNORLAX is gone from the map right away — no re-entry`, JSON.stringify(post));
		await face(page, 'left');
		await page.evaluate(() => window.__ow.interact());
		A(await drive(page, 3000) === 'idle', `[1793754263899] (${result}) and Z where it lay starts no second battle`);
		await step(page, 'left');
		A((await where(page)).x === 31, `[1793754263899] (${result}) the road west is open`, JSON.stringify(await where(page)));
		await page.close();
	}

	// ===== bug:1793644531145: the Museum grunts' defeat line comes AFTER their battle =====
	{
		const page = await open('SlateportCity_OceanicMuseum_2F', 13, 8, { region: 'HOENN' });
		const lines = async (args) => {
			await page.evaluate(async args => {
				const O = window.__ow;
				window.__dlg.length = 0;
				O.cutscene.run({ T: [{ op: 'trainerbattle', args }, { op: 'end' }] }, 'T', O.cutsceneCtxForTest(), () => {});
			}, args);
			const r1 = await drive(page);
			const pre = await page.evaluate(() => window.__dlg.slice());
			if (r1 === 'battle') await endBattle(page, 'victory');
			await drive(page);
			const all = await page.evaluate(() => window.__dlg.slice());
			return { r1, pre, post: all.slice(pre.length) };
		};
		const want = await page.evaluate(async () => {
			const S = (await import('./ow_state.js')).S, St = await import('./events.js');
			const t = l => St.normalizeText(S.mapStrings[l] || '', window.__ow.cutsceneCtxForTest());
			return { d1: t('SlateportCity_OceanicMuseum_2F_Text_Grunt1Defeat'), d2: t('SlateportCity_OceanicMuseum_2F_Text_Grunt2Defeat') };
		});
		const g1 = await lines(['TRAINER_GRUNT_MUSEUM_1', 'SlateportCity_OceanicMuseum_2F_Text_Grunt1Defeat']);
		A(g1.r1 === 'battle' && g1.pre.length === 0, '[1793644531145] grunt 1: nothing is said before the battle (the one text is the defeat line)', JSON.stringify(g1.pre));
		A(g1.post.some(l => l.includes(want.d1.slice(0, 12))), '[1793644531145] grunt 1: the defeat line comes after the win', JSON.stringify(g1.post));
		const g2 = await lines(['TRAINER_GRUNT_MUSEUM_2', 'SlateportCity_OceanicMuseum_2F_Text_Grunt2Defeat']);
		A(g2.r1 === 'battle' && g2.pre.length === 0 && g2.post.some(l => l.includes(want.d2.slice(0, 12))), '[1793644531145] grunt 2: the same', JSON.stringify(g2));
		// an ordinary single battle keeps its intro (intro, battle, defeat)
		const intro = await page.evaluate(async () => {
			const S = (await import('./ow_state.js')).S;
			S.mapStrings.Bug1106_Text_Intro = 'INTRO LINE'; S.mapStrings.Bug1106_Text_Defeat = 'DEFEAT LINE';
			return true;
		});
		const g3 = await lines(['TRAINER_GRUNT_MUSEUM_1', 'Bug1106_Text_Intro', 'Bug1106_Text_Defeat']);
		A(intro && g3.pre.some(l => /INTRO LINE/.test(l)) && !g3.pre.some(l => /DEFEAT LINE/.test(l)) && g3.post.some(l => /DEFEAT LINE/.test(l)),
			'an intro + defeat battle still opens with its intro and ends with its defeat line', JSON.stringify(g3));
		// a LOSS shows no defeat line
		await page.evaluate(() => { window.__dlg.length = 0; const O = window.__ow; O.cutscene.run({ T: [{ op: 'trainerbattle', args: ['TRAINER_GRUNT_MUSEUM_1', 'SlateportCity_OceanicMuseum_2F_Text_Grunt1Defeat'] }, { op: 'setflag', flag: 'test_after_tb' }, { op: 'end' }] }, 'T', O.cutsceneCtxForTest(), () => {}); });
		await drive(page);
		await endBattle(page, 'defeat');
		await drive(page);
		const lost = await page.evaluate(async () => ({ dlg: window.__dlg.filter(l => !/^\[B\]/.test(l)), after: (await import('./events.js')).getFlag('test_after_tb') }));
		A(!lost.dlg.some(l => l.includes(want.d1.slice(0, 12))) && !lost.after, '...and a loss shows no defeat line and stops the script', JSON.stringify(lost));
		await page.close();
	}

	// ===== bug:1793658630715: Norman's state counts each prerequisite badge ONCE =====
	{
		const page = await open('PetalburgCity_Gym', 4, 106, { region: 'HOENN', vars: { VAR_PETALBURG_GYM_STATE: 2 } });
		const LEADERS = [
			['RustboroCity_Gym', 'RustboroCity_Gym_EventScript_Roxanne'],
			['DewfordTown_Gym', 'DewfordTown_Gym_EventScript_Brawly'],
			['MauvilleCity_Gym', 'MauvilleCity_Gym_EventScript_Wattson'],
			['LavaridgeTown_Gym_1F', 'LavaridgeTown_Gym_1F_EventScript_Flannery'],
		];
		const states = [];
		for (const [stem, script] of LEADERS) {
			// the scripted win: the badge lands (onTrainerDefeated, as startScriptedBattle
			// records it), then the leader's own defeat label runs — with its addvar
			await page.evaluate(async (stem, script) => {
				const P = await import('./ow_progression.js'), St = await import('./events.js');
				P.onTrainerDefeated(script, { silent: true });
				const prog = await (await fetch(`/overworld/data/scripts/${stem}.json`)).json();
				const tb = prog[script].find(o => o.op === 'trainerbattle');
				const post = tb.args.find(a => /_EventScript_/.test(a));
				St.setVar('VAR_RESULT', 1);
				window.__ow.cutscene.run(prog, post, window.__ow.cutsceneCtxForTest(), () => {});
			}, stem, script);
			await drive(page);
			states.push((await story(page, ['VAR_PETALBURG_GYM_STATE'])).VAR_PETALBURG_GYM_STATE);
		}
		A(JSON.stringify(states) === '[3,4,5,6]', '[1793658630715] each prerequisite gym moves Norman\'s state up ONE: 3,4,5,6 — never 7 before he is beaten', JSON.stringify(states));
		const fl = await story(page, ['FLAG_DEFEATED_PETALBURG_GYM', 'FLAG_RECEIVED_TM_FACADE']);
		A(!fl.FLAG_DEFEATED_PETALBURG_GYM && !fl.FLAG_RECEIVED_TM_FACADE, '...no Norman victory, no TM42', JSON.stringify(fl));
		await page.close();
	}
	{
		// a save the bug already left at 7 (no Balance Badge, Norman never beaten)
		const four = { badges: { HOENN: { stone: true, knuckle: true, dynamo: true, heat: true } }, champion: {} };
		const page = await open('PetalburgCity_Gym', 4, 3, { region: 'HOENN', vars: { VAR_PETALBURG_GYM_STATE: 7 }, badges: four });
		await face(page, 'up');
		await page.evaluate(() => window.__ow.interact());
		const r = await drive(page);
		const st = await story(page, ['VAR_PETALBURG_GYM_STATE', 'FLAG_RECEIVED_TM_FACADE', 'FLAG_DEFEATED_PETALBURG_GYM']);
		A(r === 'battle' && st.VAR_PETALBURG_GYM_STATE === 6 && !st.FLAG_RECEIVED_TM_FACADE,
			'[1793658630715] a save stuck at 7 without a Norman win gets the battle on the next talk (state 6, no TM42 first)', JSON.stringify({ r, st }));
		if (r === 'battle') await endBattle(page, 'defeat');
		await page.close();
	}
	{
		// a GENUINE post-battle 7 stays 7
		const five = { badges: { HOENN: { stone: true, knuckle: true, dynamo: true, heat: true, balance: true } }, champion: {} };
		const page = await open('PetalburgCity_Gym', 4, 3, { region: 'HOENN', vars: { VAR_PETALBURG_GYM_STATE: 7 }, flags: { FLAG_DEFEATED_PETALBURG_GYM: true, FLAG_RECEIVED_TM_FACADE: true }, badges: five });
		await face(page, 'up');
		await page.evaluate(() => window.__ow.interact());
		const r = await drive(page);
		A(r === 'idle' && (await story(page, ['VAR_PETALBURG_GYM_STATE'])).VAR_PETALBURG_GYM_STATE === 7, 'a real Norman victory keeps state 7 (post-battle lines, no refight)', r);
		await page.close();
	}

	// ===== bug:1794001056409: a gym leader beaten across a reload =====
	{
		const page = await open('RustboroCity_Gym', 5, 3, { region: 'HOENN', vars: { VAR_PETALBURG_GYM_STATE: 2 } });
		await face(page, 'up');
		await page.evaluate(() => window.__ow.interact());
		A(await drive(page) === 'battle', '[1794001056409] Roxanne\'s battle starts from her script');
		await sleep(2200);   // the battle snapshot is written every ~1.5s
		const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_battle_v1') || 'null'));
		A(saved?.end?.kind === 'strainer' && Array.isArray(saved?.end?.rest) && saved.end.rest.some(o => o.op === 'goto'),
			'[1794001056409] the saved battle carries where her script goes on (defeat line + RoxanneDefeated)', JSON.stringify(saved?.end || null).slice(0, 300));
		await page.reload({ waitUntil: 'domcontentloaded' });
		await boot(page, 'RustboroCity_Gym');
		await page.evaluate(() => { const d = window.__ow.dialog, o = d.open.bind(d); window.__dlg = []; d.open = (t, cb) => { window.__dlg.push(String(t)); return o(t, cb); }; });
		A(await page.evaluate(() => !!window.__ow.battle.active), '[1794001056409] the reload resumes the battle');
		await endBattle(page, 'victory');
		await drive(page);
		const st = await story(page, ['FLAG_DEFEATED_RUSTBORO_GYM', 'VAR_RUSTBORO_CITY_STATE', 'FLAG_RECEIVED_TM_ROCK_TOMB', 'VAR_PETALBURG_GYM_STATE']);
		const badge = await page.evaluate(async () => (await import('./badges.js')).has('HOENN', 'stone'));
		A(badge && st.FLAG_DEFEATED_RUSTBORO_GYM && st.VAR_RUSTBORO_CITY_STATE === 1 && st.FLAG_RECEIVED_TM_ROCK_TOMB && st.VAR_PETALBURG_GYM_STATE === 3,
			'[1794001056409] the resumed win runs her defeat script: badge, FLAG_DEFEATED_RUSTBORO_GYM, VAR_RUSTBORO_CITY_STATE 1, the TM, Norman +1', JSON.stringify({ badge, st }));
		await page.close();
	}
	{
		// a save already in Remytest's shape: Roxanne beaten, badge held, her defeat script never ran
		const page = await open('RustboroCity_Gym', 5, 12, { region: 'HOENN', vars: { VAR_PETALBURG_GYM_STATE: 1 },
			badges: { badges: { HOENN: { stone: true } }, champion: {} },
			defeated: ['MAP_RUSTBORO_CITY_GYM:RustboroCity_Gym_EventScript_Roxanne'] });
		await drive(page, 8000);
		const st = await story(page, ['FLAG_DEFEATED_RUSTBORO_GYM', 'VAR_RUSTBORO_CITY_STATE', 'FLAG_RECEIVED_TM_ROCK_TOMB', 'VAR_PETALBURG_GYM_STATE']);
		A(st.FLAG_DEFEATED_RUSTBORO_GYM && st.VAR_RUSTBORO_CITY_STATE === 1 && st.FLAG_RECEIVED_TM_ROCK_TOMB,
			'[1794001056409] a save whose defeat script never ran catches it up on entering the gym (Devon Goods chain can start)', JSON.stringify(st));
		A(st.VAR_PETALBURG_GYM_STATE === 1, '...without inventing a Norman meeting (state 1 stays 1)', JSON.stringify(st));
		await page.reload({ waitUntil: 'domcontentloaded' });
		await boot(page, 'RustboroCity_Gym');
		A(await drive(page, 4000) === 'idle', '...and only once');
		await page.close();
	}
	{
		// a completed save is left alone
		const page = await open('RustboroCity_Gym', 5, 12, { region: 'HOENN', vars: { VAR_RUSTBORO_CITY_STATE: 8 },
			flags: { FLAG_DEFEATED_RUSTBORO_GYM: true, FLAG_RECEIVED_TM_ROCK_TOMB: true },
			badges: { badges: { HOENN: { stone: true } }, champion: {} },
			defeated: ['MAP_RUSTBORO_CITY_GYM:RustboroCity_Gym_EventScript_Roxanne'] });
		A(await drive(page, 4000) === 'idle' && (await story(page, ['VAR_RUSTBORO_CITY_STATE'])).VAR_RUSTBORO_CITY_STATE === 8,
			'a save whose defeat script did run is untouched (VAR_RUSTBORO_CITY_STATE stays 8)');
		await page.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
