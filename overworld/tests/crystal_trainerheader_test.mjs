// crystal_trainerheader_test.mjs — Crystal trainer headers get their FIRST battle.
//
// Route 38 (instinctloretest0918, 2026-09-30): Beauty Olivia and Bird Keeper
// Toby, unbeaten, said their POST-battle line and never fought; Lass Dana asked
// for a phone number. pokecrystal points a trainer object at a `trainer`
// header (seen text -> battle -> beaten text -> EVENT_BEAT_*), and only a later
// talk runs its `.Script`. The transpile kept only `.Script`, under the
// header's label, and onEngage ran any loaded script as if it were the battle.
//
// Now the labels that are headers (tools/gen_crystal_trainer_headers.mjs, 333
// from pokecrystal) always get the ordinary first battle with their authentic
// seen/beaten texts and beat event; the loaded continuation runs on a later
// talk. Full scripts (Sage Li, Gym Leaders, the Weather Institute grunts) still
// run themselves.
//
//   node overworld/tests/crystal_trainerheader_test.mjs
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
].find(p => fs.existsSync(p));
const PORT = 9175;
const STATE = { username: 'route38', friendCode: 'RTE380', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = () => ({
	speciesId: 'typhlosion', name: 'TYPHLOSION', level: 100, gender: 'M', friend: 70, types: ['Fire'],
	ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
	stats: { hp: 999, atk: 999, def: 999, spa: 999, spd: 999, spe: 999 }, maxHP: 999, curHP: 999,
	exp: 1000000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's157.png', num: 157,
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		for await (const _ of req) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		return res.end(JSON.stringify({ ok: true, state: STATE, ow: null, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'JOHTO');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_money', '1000');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
	}, STATE, [mon()]);
	const boot = async (map) => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
		// every trainer battle: record the roster the game built, and make it a
		// 1-HP formality (the outcome path is what is under test, not the fight)
		await page.evaluate(() => {
			const W = window.__ow;
			if (W.battle.__wrapped) return;
			const orig = W.battle.startTrainer.bind(W.battle);
			W.battle.startTrainer = (party, foe, info, onEnd, ...rest) => {
				window.__lastFoe = { roster: foe.map(m => `${m.speciesId}:${m.level}`), info: { name: info.displayName, intro: info.introQuote || null, defeat: info.defeatText || null } };
				for (const m of foe) { m.curHP = 1; m.maxHP = 1; for (const k of Object.keys(m.stats || {})) m.stats[k] = 1; }
				return orig(party, foe, info, (r, ...x) => { window.__lastOutcome = r; return onEnd && onEnd(r, ...x); }, ...rest);
			};
			W.battle.__wrapped = true;
		});
	};
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route38&x=4&y=12`, { waitUntil: 'domcontentloaded' });
	await boot('Route38');

	const state = () => page.evaluate(() => {
		const W = window.__ow;
		return { dialog: W.dialog.blocking ? JSON.stringify(W.dialog.pages || '') : null, cut: W.cutscene.blocking, battle: W.battle.blocking,
			money: W.Bag.getMoney(), defeated: JSON.parse(localStorage.getItem('magepunk_defeated_v1') || '[]') };
	});
	// stand next to the trainer, face them, press Z
	const talk = (script) => page.evaluate(script => {
		const W = window.__ow, t = W.trainers.list.find(x => x.ev.script === script);
		if (!t) return { err: 'no trainer ' + script };
		for (const [dx, dy, facing] of [[-1, 0, 'right'], [1, 0, 'left'], [0, 1, 'up'], [0, -1, 'down']]) {
			const x = t.tx + dx, y = t.ty + dy;
			if (!W.world.isPassable(x, y) || W.npcs.list.some(n => n.tx === x && n.ty === y) || W.trainers.list.some(o => o.tx === x && o.ty === y)) continue;
			W.player.tx = x; W.player.ty = y; W.player.x = x * 16; W.player.y = y * 16; W.player.facing = facing;
			window.__lastFoe = null; window.__lastOutcome = null;
			W.interact();
			return { at: [x, y], key: W.trainers.keyOf(t), defeated: W.trainers.isDefeated(t), pages: W.dialog.blocking ? JSON.stringify(W.dialog.pages) : null, cut: W.cutscene.blocking };
		}
		return { err: 'no free side' };
	}, script);
	// advance dialogs / battle messages until everything is idle
	const settle = async (ms = 12000) => {
		const t0 = Date.now();
		while (Date.now() - t0 < ms) {
			const s = await page.evaluate(() => { const W = window.__ow;
				if (W.battle.blocking) { try { W.battle.key('z'); } catch (e) {} return 'battle'; }
				if (W.dialog.blocking) { W.dialog.key('z'); return 'dialog'; }
				if (W.cutscene.blocking) return 'cut';
				return 'idle'; });
			if (s === 'idle') { await sleep(250); if (await page.evaluate(() => { const W = window.__ow; return !W.battle.blocking && !W.dialog.blocking && !W.cutscene.blocking; })) return; }
			await sleep(40);
		}
	};
	const lastFoe = () => page.evaluate(() => ({ foe: window.__lastFoe, outcome: window.__lastOutcome, flags: JSON.parse(localStorage.getItem('magepunk_story')).flags }));

	// ===== the header trainers: first battle, then the continuation =====
	const HEADERS = [
		{ script: 'TrainerBeautyOlivia', key: 'MAP_ROUTE_38:Route38_SPRITE_BEAUTY@5,8', roster: ['corsola:19'], beat: 'EVENT_BEAT_BEAUTY_OLIVIA', seen: /beautiful/, after: /MOOMOO MILK is good/ },
		{ script: 'TrainerBirdKeeperToby', key: 'MAP_ROUTE_38:Route38_SPRITE_STANDING_YOUNGSTER@12,15', roster: ['doduo:15', 'doduo:16', 'doduo:17'], beat: 'EVENT_BEAT_BIRD_KEEPER_TOBY', after: /CIANWOOD/ },
		{ script: 'TrainerBeautyValerie', key: 'MAP_ROUTE_38:Route38_SPRITE_BEAUTY@19,9', roster: ['hoppip:17', 'skiploom:17'], beat: 'EVENT_BEAT_BEAUTY_VALERIE' },
		{ script: 'TrainerSailorHarry', key: 'MAP_ROUTE_38:Route38_SPRITE_SAILOR', roster: ['wooper:19'], beat: 'EVENT_BEAT_SAILOR_HARRY' },
		{ script: 'TrainerLassDana1', key: 'MAP_ROUTE_38:Route38_SPRITE_LASS', roster: ['flaaffy:18', 'psyduck:18'], beat: 'EVENT_BEAT_LASS_DANA', after: /MOOMOO FARM/, phone: 'EVENT_DANA_ASKED_FOR_PHONE_NUMBER' },
		{ script: 'TrainerSchoolboyChad1', key: 'MAP_ROUTE_38:Route38_SPRITE_STANDING_YOUNGSTER@4,1', beat: 'EVENT_BEAT_SCHOOLBOY_CHAD', phone: 'EVENT_CHAD_ASKED_FOR_PHONE_NUMBER' },
	];
	for (const h of HEADERS) {
		const before = await state();
		const t1 = await talk(h.script);
		A(!t1.err && !t1.defeated && !t1.cut, `[${h.script}] unbeaten, Z opens the FIRST battle path (not the continuation script)`, JSON.stringify(t1));
		if (h.seen) A(t1.pages && h.seen.test(t1.pages), `[${h.script}] ...with its authentic SEEN text`, t1.pages);
		if (h.after) A(!(t1.pages && h.after.test(t1.pages)), `[${h.script}] ...not its post-battle line`, t1.pages);
		await settle();
		const r = await lastFoe();
		const after = await state();
		A(r.foe && (!h.roster || JSON.stringify(r.foe.roster) === JSON.stringify(h.roster)), `[${h.script}] the battle uses its roster`, JSON.stringify(r.foe));
		A(r.outcome === 'victory', `[${h.script}] ...and is won`, String(r.outcome));
		A(r.foe && r.foe.info.defeat && !/was defeated!$/.test(r.foe.info.defeat), `[${h.script}] ...with its authentic BEATEN text`, JSON.stringify(r.foe && r.foe.info));
		const added = after.defeated.filter(k => !before.defeated.includes(k));
		A(added.length === 1 && added[0] === h.key, `[${h.script}] victory records exactly its collision-safe key`, JSON.stringify(added));
		A(r.flags[h.beat] === true, `[${h.script}] ...and its ${h.beat}`);
		A(after.money > before.money, `[${h.script}] ...and pays the prize`, `${before.money} -> ${after.money}`);
		// the later talk: the continuation, no battle, no second payout
		const t2 = await talk(h.script);
		if (h.after) A(t2.pages && h.after.test(t2.pages) || t2.cut, `[${h.script}] a later talk plays the post-battle continuation`, JSON.stringify(t2));
		await settle();
		const r2 = await lastFoe();
		const after2 = await state();
		A(!r2.foe && after2.money === after.money && after2.defeated.length === after.defeated.length, `[${h.script}] ...with no battle and no second reward`, JSON.stringify({ foe: r2.foe, money: [after.money, after2.money] }));
		if (h.phone) A(r2.flags[h.phone] === true, `[${h.script}] ...the phone-number continuation runs (${h.phone})`);
	}
	// the duplicate-key suffixes stayed intact for both pairs
	const keys = await page.evaluate(() => window.__ow.trainers.list.map(t => window.__ow.trainers.keyOf(t)));
	A(['@5,8', '@19,9'].every(s => keys.includes('MAP_ROUTE_38:Route38_SPRITE_BEAUTY' + s)) && ['@12,15', '@4,1'].every(s => keys.includes('MAP_ROUTE_38:Route38_SPRITE_STANDING_YOUNGSTER' + s)),
		'the Beauty and Youngster pairs keep their coordinate-suffixed keys', JSON.stringify(keys));

	// sight: an unbeaten header trainer that SPOTS you battles too
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=OlivineLighthouse2F&x=5&y=5`, { waitUntil: 'domcontentloaded' });
	await boot('OlivineLighthouse2F');
	{
		const t = await talk('TrainerGentlemanAlfred');
		await settle();
		const r = await lastFoe();
		A(!t.cut && r.foe && r.outcome === 'victory' && r.flags.EVENT_BEAT_GENTLEMAN_ALFRED, 'Olivine Lighthouse: Gentleman Alfred (a header) battles, and sets his beat event', JSON.stringify({ t, foe: r.foe, out: r.outcome }));
	}

	// ===== full scripts still run themselves =====
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=SproutTower3F&x=10&y=4`, { waitUntil: 'domcontentloaded' });
	await boot('SproutTower3F');
	{
		const t = await talk('SageLiScript');
		A(t.cut, 'Sprout Tower: SAGE LI (a full script, not a header) runs his own scene', JSON.stringify(t));
		await settle(20000);
		const r = await lastFoe();
		A(r.foe && r.outcome === 'victory', '...which starts his battle through the script', JSON.stringify(r.foe));
		const sageJin = await talk('TrainerSageJin');
		await settle();
		const rj = await lastFoe();
		A(!sageJin.cut && rj.foe && rj.outcome === 'victory', 'Sprout Tower: SAGE JIN (a header) gets his first battle', JSON.stringify({ sageJin, foe: rj.foe }));
	}
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route119_WeatherInstitute_1F&x=10&y=8`, { waitUntil: 'domcontentloaded' });
	await boot('Route119_WeatherInstitute_1F');
	{
		const t = await talk('Route119_WeatherInstitute_1F_EventScript_Grunt4');
		A(t.cut || (t.pages && !/was defeated/.test(t.pages)), 'Weather Institute (Emerald, not Crystal): the grunt runs his trainerbattle script', JSON.stringify(t));
		await settle();
		const r = await lastFoe();
		A(r.foe && r.outcome === 'victory', '...and the battle happens', JSON.stringify(r.foe));
	}
	A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
