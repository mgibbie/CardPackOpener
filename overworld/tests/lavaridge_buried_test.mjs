// lavaridge_buried_test.mjs — Lavaridge Gym's buried trainers battle once, as themselves.
//
// Playtest (instinctloretest0918, 2026-09-30), Lavaridge Gym B1F: Kindler Jeff
// battled a fallback team (two Spearow ~Lv11) instead of his two Lv22 Slugma,
// the win recorded nothing, and talking to him again started a fresh battle.
//   * `trainerbattle TRAINER_BATTLE_CONTINUE_SCRIPT, TRAINER_JEFF, LOCALID_JEFF,
//     ...` leads with the battle FORM; the expansion passed that as the trainer.
//   * TRAINER_TYPE_BURIED was not a trainer type, so the ash trainers were plain
//     NPCs: no defeated key, ever.
//   * Emerald keeps B1F's lines in the Gym 1F text file; B1F never loaded them
//     (the intro read "...").
// Also: a beaten trainer now says their own post-battle line (the decomp's
// trainerbattle skips to it), and a CONTINUE_SCRIPT battle whose post label
// is not loaded ends instead of falling into that line early.
//
//   node overworld/tests/lavaridge_buried_test.mjs
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
const PORT = 9177;
const STATE = { username: 'lava', friendCode: 'LAVA00', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = () => ({
	speciesId: 'swampert', name: 'SWAMPERT', level: 100, gender: 'M', friend: 70, types: ['Water', 'Ground'],
	ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
	stats: { hp: 999, atk: 999, def: 999, spa: 999, spd: 999, spe: 999 }, maxHP: 999, curHP: 999,
	exp: 1000000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's260.png', num: 260,
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
		localStorage.setItem('magepunk_region', 'HOENN');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
	}, STATE, [mon()]);
	const boot = async map => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
		await page.evaluate(() => {
			const W = window.__ow;
			if (W.battle.__wrapped) return;
			const orig = W.battle.startTrainer.bind(W.battle);
			W.battle.startTrainer = (party, foe, info, onEnd, ...rest) => {
				window.__foe = foe.map(m => `${m.speciesId}:${m.level}`);
				for (const m of foe) { m.curHP = 1; m.maxHP = 1; for (const k of Object.keys(m.stats || {})) m.stats[k] = 1; }
				return orig(party, foe, info, (r, ...x) => { window.__outcome = r; return onEnd && onEnd(r, ...x); }, ...rest);
			};
			W.battle.__wrapped = true;
		});
	};
	const go = async (map, x, y) => { await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' }); await boot(map); };
	const defeated = () => page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_defeated_v1') || '[]'));
	const talk = script => page.evaluate(script => {
		const W = window.__ow, t = W.trainers.list.find(x => x.ev.script === script);
		if (!t) return { err: 'not a trainer: ' + script };
		for (const [dx, dy, facing] of [[0, 1, 'up'], [-1, 0, 'right'], [1, 0, 'left'], [0, -1, 'down']]) {
			const x = t.tx + dx, y = t.ty + dy;
			if (!W.world.isPassable(x, y) || W.npcs.list.some(n => n.tx === x && n.ty === y) || W.trainers.list.some(o => o.tx === x && o.ty === y)) continue;
			W.player.tx = x; W.player.ty = y; W.player.x = x * 16; W.player.y = y * 16; W.player.facing = facing;
			window.__foe = null; window.__outcome = null; window.__said = [];
			W.interact();
			return { ok: true, key: W.trainers.keyOf(t), pages: W.dialog.blocking ? JSON.stringify(W.dialog.pages) : null };
		}
		return { err: 'no side' };
	}, script);
	const settle = async (ms = 15000) => {
		const t0 = Date.now();
		while (Date.now() - t0 < ms) {
			const s = await page.evaluate(() => { const W = window.__ow;
				if (W.battle.blocking) { try { W.battle.key('z'); } catch (e) {} return 'b'; }
				if (W.dialog.blocking) { (window.__said = window.__said || []).push(JSON.stringify(W.dialog.pages || '')); W.dialog.key('z'); return 'd'; }
				if (W.cutscene.blocking) return 'c';
				return 'idle'; });
			if (s === 'idle') { await sleep(300); if (await page.evaluate(() => { const W = window.__ow; return !W.battle.blocking && !W.dialog.blocking && !W.cutscene.blocking; })) return; }
			await sleep(40);
		}
	};
	const last = () => page.evaluate(() => ({ foe: window.__foe, outcome: window.__outcome, said: (window.__said || []).join(' | ') }));

	const B1F = 'LavaridgeTown_Gym_B1F', F1 = 'LavaridgeTown_Gym_1F';
	const TRAINERS = [
		{ map: B1F, script: `${B1F}_EventScript_Jeff`, key: `MAP_LAVARIDGE_TOWN_GYM_B1F:LOCALID_JEFF`, roster: ['slugma:22', 'slugma:22'] },
		{ map: B1F, script: `${B1F}_EventScript_Jace`, key: `MAP_LAVARIDGE_TOWN_GYM_B1F:LOCALID_JACE`, roster: ['slugma:23'] },
		{ map: B1F, script: `${B1F}_EventScript_Keegan`, key: `MAP_LAVARIDGE_TOWN_GYM_B1F:LOCALID_KEEGAN`, roster: ['slugma:23'] },
		{ map: B1F, script: `${B1F}_EventScript_Eli`, key: `MAP_LAVARIDGE_TOWN_GYM_B1F:LOCALID_ELI`, roster: ['numel:23'] },
		{ map: F1, script: `${F1}_EventScript_Cole`, key: `MAP_LAVARIDGE_TOWN_GYM_1F:LOCALID_COLE`, roster: ['numel:23'] },
		{ map: F1, script: `${F1}_EventScript_Gerald`, key: `MAP_LAVARIDGE_TOWN_GYM_1F:LOCALID_GERALD`, roster: ['kecleon:23'] },
		{ map: F1, script: `${F1}_EventScript_Axle`, key: `MAP_LAVARIDGE_TOWN_GYM_1F:LOCALID_AXLE`, roster: ['numel:23'] },
		{ map: F1, script: `${F1}_EventScript_Danielle`, key: `MAP_LAVARIDGE_TOWN_GYM_1F:LOCALID_DANIELLE`, roster: ['meditite:23'] },
	];
	let cur = null;
	for (const t of TRAINERS) {
		if (cur !== t.map) { await go(t.map, 10, 10); cur = t.map; }
		const name = t.script.replace(/^.*_EventScript_/, '');
		const before = await defeated();
		const t1 = await talk(t.script);
		A(t1.ok, `[${name}] a buried trainer is a trainer (it used to be a plain NPC)`, JSON.stringify(t1));
		await settle();
		const r = await last();
		A(JSON.stringify(r.foe) === JSON.stringify(t.roster) && r.outcome === 'victory', `[${name}] battles with their own team ${t.roster.join(', ')}`, JSON.stringify(r.foe));
		if (name === 'Jeff') A(/flames blaze wildly/.test(r.said), '[Jeff] his intro is his own line (kept in the Gym 1F text), not "..."', r.said.slice(0, 200));
		const added = (await defeated()).filter(k => !before.includes(k));
		A(added.length === 1 && added[0] === t.key, `[${name}] the win records one durable key (${t.key})`, JSON.stringify(added));
		// a later talk: no fresh battle
		await talk(t.script); await settle();
		const r2 = await last();
		A(!r2.foe && (await defeated()).length === before.length + 1, `[${name}] talking again starts no battle`, JSON.stringify(r2));
		if (name === 'Jeff') A(/walk on hot coals/.test(r2.said), "[Jeff] ...he says his own post-battle line", r2.said.slice(0, 200));
		if (name === 'Jeff') A(!/walk on hot coals/.test(r.said), '[Jeff] ...which is NOT shown straight after the first battle (the CONTINUE_SCRIPT form ends there)', r.said.slice(0, 200));
	}
	// ...and after a reload
	await go(B1F, 10, 10); cur = B1F;
	await talk(`${B1F}_EventScript_Jeff`); await settle();
	const rl = await last();
	A(!rl.foe && (await defeated()).includes('MAP_LAVARIDGE_TOWN_GYM_B1F:LOCALID_JEFF'), 'after a reload Jeff is still beaten (no fresh battle, key kept)', JSON.stringify(rl));

	// ordinary layouts are untouched: an Emerald single (trainer id first) and a paired trainer
	await go('Route102', 33, 14);
	{
		const before = await defeated();
		await talk('Route102_EventScript_Calvin'); await settle();
		const r = await last();
		const added = (await defeated()).filter(k => !before.includes(k));
		A(r.outcome === 'victory' && r.foe && r.foe.length && added.length === 1, 'an ordinary trainerbattle_single (Route 102 Calvin) still battles and records its key', JSON.stringify({ foe: r.foe, added }));
	}
	await go('Route104', 20, 30);
	{
		const twins = await page.evaluate(() => window.__ow.trainers.list.filter(t => /Gina|Mia|GinaAndMia/i.test(t.ev.script)).map(t => t.ev.script));
		if (twins.length) {
			const before = await defeated();
			await talk(twins[0]); await settle();
			const r = await last();
			const added = (await defeated()).filter(k => !before.includes(k));
			A(r.outcome === 'victory' && r.foe && r.foe.length >= 2 && added.length >= 1, 'a paired trainer (Route 104 twins) battles both and records them', JSON.stringify({ foe: r.foe, added }));
		} else A(true, '(no Route 104 twins on this build)');
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
