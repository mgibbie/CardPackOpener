// daily_gaps_test.mjs — what the daily-flags fix (PR #794) left with no daily step.
//
//   1. LILYCOVE LOTTERY (pokeemerald lottery_corner.c). The ticket came back each
//      day, but RetrieveLotteryNumber / PickLotteryCornerTicket / SetRandomLotteryNumber
//      were unported, so the clerk read a stale VAR_RESULT and VAR_0x8004 and no
//      ticket ever won. Now: the number is drawn by the once-a-day update (on
//      TRAVEL only, never a load), matched trailing digit by trailing digit against
//      the OT ID of every party and PC POKeMON (a mon with no recorded OT is the
//      player's own: the player's ID, read at ask time, nothing written), prizes
//      PP UP / EXP. SHARE / MAX REVIVE / MASTER BALL for 2 / 3 / 4 / 5 digits.
//   2. KURT AND THE GS BALL (pokecrystal KurtsHouse.asm). After the LURE BALL the
//      native apricorn counter answered every press, so Kurt1's .CanGiveGSBallToKurt
//      (take the ball, set the daily ENGINE_KURT_MAKING_BALLS, next day run to
//      ILEX FOREST) never ran. The counter now steps aside exactly when that branch
//      is due; otherwise it answers as before. And the chain is walked: the
//      Goldenrod POKeMON CENTER gives the GS BALL after the Hall of Fame (its
//      dropped setval/ifequal restored), Kurt takes it, a day later the forest is
//      restless, Azalea's scene hands it back, the ILEX shrine starts CELEBI.
//   3. EMERALD'S OTHER DAILY STEPS. The one the port has a feature for, the
//      BATTLE FRONTIER MANIAC's facility of the day (VAR_FRONTIER_MANIAC_FACILITY),
//      steps once per day passed. (TV shows, the Dewford trend, the weather cycle,
//      POKeRUS, Birch's location and the Frontier Gambler have no feature here:
//      time_events.js lists why.)
//
//   node overworld/tests/daily_gaps_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const OW = path.join(ROOT, 'overworld');
const CHROME = process.env.CHROME || [
	'/opt/chrome/chrome',
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9793;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);

const T = await import('../time_events.js');
const Story = await import('../events.js');
const has = f => typeof T[f] === 'function';

// a ticket that matches `id` in exactly `d` trailing digits (0-5)
function ticketFor(id, d) {
	if (d >= 5) return id;
	const p = 10 ** d, low = id % p, next = Math.floor(id / p) % 10;
	return low + ((next + 1) % 10) * p + Math.floor(id / (p * 10)) * p * 10;
}

// ---------------- 1. the lottery, as lottery_corner.c ----------------
if (has('pickLotteryTicket') && has('matchingDigits')) {
	A(T.matchingDigits(12345, 12345) === 5 && T.matchingDigits(12345, 99345) === 3 && T.matchingDigits(12345, 12346) === 0 && T.matchingDigits(5, 105) === 2,
		'1. GetMatchingDigits: trailing digits, stopping at the first that differs');
	const ID = 31416;
	const own = { speciesId: 'swampert', name: 'SWAMPERT' };   // caught by the player: no otId recorded
	const want = [null, 'ITEM_PP_UP', 'ITEM_EXP_SHARE', 'ITEM_MAX_REVIVE', 'ITEM_MASTER_BALL'];
	for (let d = 0; d <= 5; d++) {
		const r = T.pickLotteryTicket(ticketFor(ID, d), [own], [], ID);
		const tier = d >= 2 ? d - 1 : 0;
		A(r.tier === tier && r.prize === (want[tier] || null) && (!tier || (r.inPC === 0 && r.mon === own)),
			`1. ${d} digit${d === 1 ? '' : 's'} matched: ${tier ? want[tier] + ' (VAR_0x8004 = ' + tier + ')' : 'no prize'}`, JSON.stringify({ t: ticketFor(ID, d), r: { ...r, mon: !!r.mon } }));
	}
	const before = JSON.stringify(own);
	T.pickLotteryTicket(ID, [own], [own], ID);
	A(JSON.stringify(own) === before && !('otId' in own), '1. a mon with no OT ID reads as the player\'s ID; nothing is written to it');
	// a traded mon carries ITS trainer's ID; the PC counts; a later mon needs MORE digits
	const traded = { speciesId: 'abra', name: 'ABRA', otName: 'BOB', otId: ticketFor(ID, 0) + 0 };
	const boxed = { speciesId: 'zigzagoon', name: 'ZIGZAGOON' };
	const r1 = T.pickLotteryTicket(ticketFor(ID, 3), [{ ...traded, otId: 77 }], [boxed], ID);
	A(r1.tier === 2 && r1.inPC === 1 && r1.mon === boxed, '1. a PC-boxed mon of the player\'s can win (VAR_0x8006 = 1)', JSON.stringify({ ...r1, mon: r1.mon?.name }));
	const r2 = T.pickLotteryTicket(4321, [{ ...traded, otId: 54321 }], [], ID);
	A(r2.tier === 3 && r2.mon.name === 'ABRA', '1. a traded mon matches on its own OT ID, not the player\'s');
	A(T.pickLotteryTicket(ID, [{ speciesId: 'x', name: 'EGG', isEgg: true }, { speciesId: 'y', name: 'Y', otName: 'FOE' }], [], ID).tier === 0,
		'1. eggs and a foreign OT with no number never match');
	const r3 = T.pickLotteryTicket(ticketFor(ID, 2), [own], [{ ...boxed }], ID);
	// GBA quirk, kept: it compares the digits with VAR_0x8004 (digits - 1), so a later
	// mon with the SAME digits takes over — a tie goes to the last one, the PC's
	A(r3.inPC === 1 && r3.tier === 1, '1. a tie goes to the later mon (the PC), as PickLotteryCornerTicket compares against VAR_0x8004');
	A(T.lottoTicketString(42) === '00042' && T.lottoTicketString(T.lotteryTicket(123456)) === '23456', '1. BufferLottoTicketNumber pads to five digits; the ticket is the number mod 100000');
} else A(false, '1. time_events.js exports the lottery (pickLotteryTicket, matchingDigits)');

// ---------------- 1/3. the daily step: one draw (and one MANIAC step) per day ----------------
if (has('getLotteryNumber') && has('updateFrontierManiac')) {
	const D = 30000;
	let k = 0; const rng = () => ((k++ * 0.6180339887) % 1);
	Story.setVar('VAR_DAYS', 0); Story.setVar('VAR_POKELOT_RND1', 0); Story.setVar('VAR_POKELOT_RND2', 0); Story.setVar('VAR_FRONTIER_MANIAC_FACILITY', 9);
	T.updatePerDay(D, rng);
	const seeded = T.getLotteryNumber();
	A(seeded !== 0 && Story.getVar('VAR_FRONTIER_MANIAC_FACILITY') === 9, '1. a save with no lottery number gets one on its first update (ResetLotteryCorner)', String(seeded));
	T.updatePerDay(D, rng);
	A(T.getLotteryNumber() === seeded && Story.getVar('VAR_FRONTIER_MANIAC_FACILITY') === 9, '1/3. the same day: the number and the MANIAC stay');
	T.updatePerDay(D + 1, rng);
	const next = T.getLotteryNumber();
	A(next !== seeded && Story.getVar('VAR_FRONTIER_MANIAC_FACILITY') === 0, '1/3. the next day: a new number; the MANIAC steps 9 -> 0 (mod 10)', `${seeded} -> ${next}`);
	T.updatePerDay(D + 1, rng);
	A(T.getLotteryNumber() === next && Story.getVar('VAR_FRONTIER_MANIAC_FACILITY') === 0, '1/3. ...and holds for the rest of that day');
	T.updatePerDay(D + 4, rng);
	A(Story.getVar('VAR_FRONTIER_MANIAC_FACILITY') === 3 && T.getLotteryNumber() !== next, '1/3. three days missed: the MANIAC steps 3, one new number');
	const held = T.getLotteryNumber();
	T.updatePerDay(D + 2, rng);
	A(T.getLotteryNumber() === held && Story.getVar('VAR_FRONTIER_MANIAC_FACILITY') === 3, '1/3. the clock set back: nothing');
	// SetRandomLotteryNumber: Random() stepped ISO_RANDOMIZE2 once per day passed
	T.setRandomLotteryNumber(2, () => 0.5);
	A(T.getLotteryNumber() === T.isoRandomize2(T.isoRandomize2(0x8000)), '1. SetRandomLotteryNumber(2) = ISO_RANDOMIZE2(ISO_RANDOMIZE2(Random()))');
} else A(false, '1/3. time_events.js has the lottery number and updateFrontierManiac');

// ---------------- 2. the generated script data the GS BALL chain needs ----------------
{
	const P = JSON.parse(fs.readFileSync(path.join(OW, 'crystal_scriptvar_data.json'), 'utf8')).patches || {};
	const gs = P.GoldenrodPokecenter1F?.GoldenrodPokecenter1F_GSBallSceneLeft || [];
	A(gs.some(o => o.op === 'setvar' && o.var === 'VAR_RESULT' && o.value === 11) && gs.some(o => o.op === 'branch' && o.cond?.value === 11 && /\.gsball$/.test(o.label)),
		'2. the Goldenrod POKeMON CENTER scene keeps its setval BATTLETOWERACTION_GSBALL + ifequal GS_BALL_AVAILABLE');
	const ce = P.IlexForest?.['IlexForestShrineScript.CelebiEvent'] || [];
	A(ce.some(o => o.op === 'wildbattle' && o.species === 'celebi') && !ce.some(o => o.op === 'trainerbattle'), '2. the ILEX shrine\'s CELEBI is a real battle (not an empty trainerbattle)');
}

// ---------------- in the game ----------------
const STATE = { username: 'dailygaps', friendCode: 'DGAPS1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const LEAD = { speciesId: 'swampert', name: 'SWAMPERT', level: 60, gender: 'M', friend: 70, types: ['Water'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 200, atk: 120, def: 110, spa: 100, spd: 100, spe: 110 }, maxHP: 200, curHP: 200,
	exp: 220000, moves: [{ id: 'surf', name: 'SURF', pp: 15, maxPp: 15 }], sprite: 's260.png', num: 260 };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		res.writeHead(200, { 'content-type': 'application/json' });
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));
let browser;
async function boot({ map, x, y, region, flags = {}, vars = {}, bag = null, party = [LEAD] }) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	const story = { flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, ...flags }, vars };
	await page.evaluateOnNewDocument((st, party, region, story, bag) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', region);
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify(story));
		if (bag) localStorage.setItem('magepunk_bag_v1', JSON.stringify(bag));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, party, region, story, bag);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
	await sleep(900);
	return { page, ctx, errors, story };
}
// press through dialogs (Z: the YES of a prompt) until idle; stops early when a battle opens
const settle = page => page.evaluate(async () => {
	const O = window.__ow;
	const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
	const t0 = Date.now(); let calm = 0;
	while (Date.now() - t0 < 15000) {
		if (O.battle.active) return 'battle';
		const d = O.dialog.blocking, c = O.cutscene.blocking, f = O.fade || { alpha: 0, target: 0 };
		if (!d && !c && f.alpha < 0.001 && f.target < 0.001 && !O.player.moving && !O.loading) { if (++calm >= 10) return 'idle'; } else calm = 0;
		if (d) press('z');
		await new Promise(r => setTimeout(r, 40));
	}
	return 'timeout';
});
const talk = async (page, px, py, facing) => {
	await page.evaluate((px, py, facing) => { const O = window.__ow; O.player.setTile(px, py); O.player.facing = facing; O.interact(); }, px, py, facing);
	return settle(page);
};
const travel = (page, map, x, y) => page.evaluate(async (map, x, y) => { await window.__ow.moveToMap(map, x, y); await new Promise(r => setTimeout(r, 500)); }, map, x, y);
const flag = (page, f) => page.evaluate(f => !!window.__ow.Story.getFlag(f), f);
const getVar = (page, v) => page.evaluate(v => window.__ow.Story.getVar(v), v);
const count = (page, id) => page.evaluate(id => window.__ow.Bag.count(id), id);
const PRIZE = ['', 'ppup', 'expshare', 'maxrevive', 'masterball'];

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--mute-audio', '--disable-gpu'] });
	const V = T.DAILY_RESET_VAR || 'VAR_MP_DAILY_RESET_DAY';

	// ---- 1. the LOTTERY CORNER clerk, at each prize tier ----
	{
		const { page, ctx, errors } = await boot({ map: 'LilycoveCity_DepartmentStore_1F', x: 10, y: 4, region: 'hoenn', vars: { VAR_DAYS: today(), [V]: today() } });
		const tid = await page.evaluate(() => window.__ow.playerTID());
		for (const d of [5, 4, 3, 2, 1, 0]) {
			const tier = d >= 2 ? d - 1 : 0;
			const n = ticketFor(tid, d);
			await page.evaluate(n => { const S = window.__ow.Story; S.setVar('VAR_POKELOT_RND1', n & 0xFFFF); S.setVar('VAR_POKELOT_RND2', n >>> 16); S.clearFlag('FLAG_DAILY_PICKED_LOTO_TICKET'); }, n);
			const before = tier ? await count(page, PRIZE[tier]) : 0;
			const total0 = await page.evaluate(() => Object.values(window.__ow.Bag.getBag()).reduce((a, b) => a + (+b || 0), 0));
			await talk(page, 10, 3, 'up');
			const total1 = await page.evaluate(() => Object.values(window.__ow.Bag.getBag()).reduce((a, b) => a + (+b || 0), 0));
			const picked = await flag(page, 'FLAG_DAILY_PICKED_LOTO_TICKET');
			if (tier) A(picked && await count(page, PRIZE[tier]) === before + 1 && total1 === total0 + 1, `1. the clerk: ID ${String(tid).padStart(5, '0')}, ticket ${String(n).padStart(5, '0')} (${d} digits): wins the ${PRIZE[tier].toUpperCase()}`, `${before} -> ${await count(page, PRIZE[tier])}`);
			else A(picked && total1 === total0, `1. the clerk: ticket ${String(n).padStart(5, '0')} (${d} digit${d === 1 ? '' : 's'}): no prize`, `${total0} -> ${total1}`);
		}
		const total0 = await page.evaluate(() => Object.values(window.__ow.Bag.getBag()).reduce((a, b) => a + (+b || 0), 0));
		await page.evaluate(tid => { const S = window.__ow.Story; S.setVar('VAR_POKELOT_RND1', tid & 0xFFFF); S.setVar('VAR_POKELOT_RND2', tid >>> 16); }, tid);
		await talk(page, 10, 3, 'up');
		A(await page.evaluate(() => Object.values(window.__ow.Bag.getBag()).reduce((a, b) => a + (+b || 0), 0)) === total0, '1. ...and once drawn, "come back tomorrow" the same day, even on a winning number');
		A(await page.evaluate(() => !('otId' in window.__ow.party[0])), '1. the party mon matched as the player\'s own, and got no otId written');
		A(!errors.length, '1. no page errors', errors.join(' | '));
		await ctx.close();
	}

	// ---- 1/3. the draw (and the MANIAC) change daily, on TRAVEL only ----
	{
		const { page, ctx, errors, story } = await boot({ map: 'LilycoveCity_DepartmentStore_1F', x: 10, y: 4, region: 'hoenn',
			vars: { VAR_DAYS: today() - 1, [V]: today() - 1, VAR_POKELOT_RND1: 12345, VAR_POKELOT_RND2: 1, VAR_FRONTIER_MANIAC_FACILITY: 9 } });
		const atLoad = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_story') || '{}').vars || {});
		A(atLoad.VAR_POKELOT_RND1 === 12345 && atLoad.VAR_POKELOT_RND2 === 1 && atLoad.VAR_FRONTIER_MANIAC_FACILITY === 9 && atLoad.VAR_DAYS === today() - 1,
			'1/3. loading a day-old save: the stored number, the MANIAC and VAR_DAYS are untouched', JSON.stringify({ r1: atLoad.VAR_POKELOT_RND1, r2: atLoad.VAR_POKELOT_RND2, m: atLoad.VAR_FRONTIER_MANIAC_FACILITY }));
		A(Object.keys(story.vars).every(k => atLoad[k] === story.vars[k]), '1/3. ...no seeded var changed at load');
		await travel(page, 'LilycoveCity_DepartmentStore_1F', 10, 4);
		const n1 = await page.evaluate(() => [window.__ow.Story.getVar('VAR_POKELOT_RND1'), window.__ow.Story.getVar('VAR_POKELOT_RND2')]);
		A(!(n1[0] === 12345 && n1[1] === 1) && await getVar(page, 'VAR_FRONTIER_MANIAC_FACILITY') === 0 && await getVar(page, 'VAR_DAYS') === today(),
			'1/3. the first trip of the day: a new lottery number, the MANIAC steps once (9 -> 0)', JSON.stringify(n1));
		await travel(page, 'LilycoveCity_DepartmentStore_1F', 10, 4);
		const n2 = await page.evaluate(() => [window.__ow.Story.getVar('VAR_POKELOT_RND1'), window.__ow.Story.getVar('VAR_POKELOT_RND2')]);
		A(n2[0] === n1[0] && n2[1] === n1[1] && await getVar(page, 'VAR_FRONTIER_MANIAC_FACILITY') === 0, '1/3. another trip the same day: no re-draw, no second step');
		A(!errors.length, '1/3. no page errors', errors.join(' | '));
		await ctx.close();
	}

	// ---- 2. KURT and the GS BALL chain (Crystal) ----
	{
		const flags = { EVENT_CLEARED_SLOWPOKE_WELL: true, EVENT_KURT_GAVE_YOU_LURE_BALL: true, EVENT_BEAT_ELITE_FOUR: true };
		const { page, ctx, errors } = await boot({ map: 'GoldenrodPokecenter1F', x: 3, y: 7, region: 'johto', flags, vars: { VAR_DAYS: today(), [V]: today() } });
		// the GS BALL: the doorway scene, once the Hall of Fame is behind you
		await page.evaluate(() => { const O = window.__ow; O.player.setTile(3, 7); O.checkCoordTrigger(); });
		await settle(page);
		A(await count(page, 'gsball') === 1 && await flag(page, 'EVENT_CAN_GIVE_GS_BALL_TO_KURT') && await flag(page, 'EVENT_GOT_GS_BALL_FROM_GOLDENROD_POKEMON_CENTER'),
			'2. the Goldenrod POKeMON CENTER receptionist gives the GS BALL after the Hall of Fame', String(await count(page, 'gsball')));
		await page.evaluate(() => { const O = window.__ow; O.player.setTile(3, 7); O.checkCoordTrigger(); });
		await settle(page);
		A(await count(page, 'gsball') === 1, '2. ...once');

		// KURT: the apricorn counter, unchanged while there is no GS BALL business
		await page.evaluate(() => { const S = window.__ow.Story; S.clearFlag('EVENT_CAN_GIVE_GS_BALL_TO_KURT'); window.__ow.Bag.addItem('redapricorn', 2); });
		await travel(page, 'KurtsHouse', 3, 3);
		const lv0 = await count(page, 'levelball');
		await talk(page, 3, 3, 'up');
		A(await count(page, 'levelball') === lv0 + 1 && await count(page, 'redapricorn') === 1 && !(await flag(page, 'EVENT_GAVE_GS_BALL_TO_KURT')) && !(await flag(page, 'ENGINE_KURT_MAKING_BALLS')),
			'2. no GS BALL business: KURT\'s apricorn counter crafts a LEVEL BALL at once, as before');
		// ...and with it: his script takes the ball
		await page.evaluate(() => { window.__ow.Story.setFlag('EVENT_CAN_GIVE_GS_BALL_TO_KURT'); if (!window.__ow.Bag.count('gsball')) window.__ow.Bag.addItem('gsball', 1); });
		await talk(page, 3, 3, 'up');
		A(await count(page, 'gsball') === 0 && await flag(page, 'EVENT_GAVE_GS_BALL_TO_KURT') && await flag(page, 'ENGINE_KURT_MAKING_BALLS') && await count(page, 'redapricorn') === 1,
			'2. KURT takes the GS BALL (his script, not the counter), sets the daily ENGINE_KURT_MAKING_BALLS');
		await talk(page, 3, 3, 'up');
		A(!(await flag(page, 'EVENT_FOREST_IS_RESTLESS')) && await flag(page, 'EVENT_GAVE_GS_BALL_TO_KURT'), '2. the same day he is still checking it');
		// the next day: the daily flag lapses on the first trip; the ball shakes
		await page.evaluate(V => window.__ow.Story.setVar(V, window.__ow.Story.getVar(V) - 1), V);
		await travel(page, 'KurtsHouse', 3, 3);
		A(!(await flag(page, 'ENGINE_KURT_MAKING_BALLS')), '2. a day later, on the trip in: ENGINE_KURT_MAKING_BALLS clears');
		await talk(page, 3, 3, 'up');
		A(await flag(page, 'EVENT_FOREST_IS_RESTLESS') && !(await flag(page, 'EVENT_CAN_GIVE_GS_BALL_TO_KURT')) && await getVar(page, 'VAR_SCENE_AzaleaTown') === 2,
			'2. KURT: "this BALL started to shake" — the forest is restless; Azalea\'s scene is set (SCENE_AZALEATOWN_KURT_RETURNS_GS_BALL)');
		// AZALEA: Kurt hands it back outside
		await travel(page, 'AzaleaTown', 9, 6);
		await page.evaluate(() => { const O = window.__ow; O.player.setTile(9, 6); O.checkCoordTrigger(); });
		await settle(page);
		A(await count(page, 'gsball') === 1 && await flag(page, 'ENGINE_FOREST_IS_RESTLESS') && await getVar(page, 'VAR_SCENE_AzaleaTown') === 0,
			'2. Azalea: KURT gives the GS BALL back (AzaleaTownCelebiScene)');
		// ILEX FOREST: the shrine (the Johto champion's tile CELEBI steps aside for it)
		await page.evaluate(() => window.__ow.Badges.crown('JOHTO'));
		await travel(page, 'IlexForest', 8, 23);
		A(!(await page.evaluate(() => !!window.__ow.battle.active)) && await page.evaluate(() => window.__ow.legendariesHere().length) === 0,
			'2. Ilex Forest: standing before the shrine with the GS BALL, the tile CELEBI does not take over');
		const st = await talk(page, 8, 23, 'up');
		const foe = await page.evaluate(() => window.__ow.battle.active?.foe?.speciesId || null);
		A(st === 'battle' && foe === 'celebi', '2. the shrine takes the GS BALL and CELEBI appears: a battle', `${st} ${foe}`);
		A(await count(page, 'gsball') === 0 && !(await flag(page, 'EVENT_FOREST_IS_RESTLESS')), '2. ...the GS BALL is spent, the forest calms');
		await page.evaluate(() => { const b = window.__ow.battle, a = b.active; if (a) { a.caughtMon = a.foe; b.finish('caught'); } });
		for (let i = 0; i < 100 && await page.evaluate(() => !!window.__ow.battle.active); i++) { await page.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true }))); await sleep(100); }
		await settle(page);
		const got = await page.evaluate(() => [...window.__ow.party].some(m => m?.speciesId === 'celebi') || JSON.parse(localStorage.getItem('magepunk_box_v1') || '[]').some(m => m?.speciesId === 'celebi'));
		A(got && await flag(page, 'legend_caught_celebi'), '2. CELEBI caught — and it is the one CELEBI of the save (the tile legendary\'s flag)');
		A(!errors.length, '2. no page errors', errors.join(' | '));
		await ctx.close();
	}
	// ---- 2. no Hall of Fame, no GS BALL ----
	{
		const { page, ctx, errors } = await boot({ map: 'GoldenrodPokecenter1F', x: 3, y: 7, region: 'johto', vars: { VAR_DAYS: today(), [V]: today() } });
		await page.evaluate(() => { const O = window.__ow; O.player.setTile(3, 7); O.checkCoordTrigger(); });
		await settle(page);
		A(await count(page, 'gsball') === 0 && !(await flag(page, 'EVENT_CAN_GIVE_GS_BALL_TO_KURT')), '2. before the Hall of Fame the receptionist stays put (BattleTowerAction answers 0)');
		A(!errors.length, '2. no page errors', errors.join(' | '));
		await ctx.close();
	}
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
