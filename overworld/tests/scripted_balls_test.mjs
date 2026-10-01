// scripted_balls_test.mjs — item balls that are NOT items run their own scripts.
//
// Playtest (instinctloretest0918, 2026-10-01 2:29pm): an Aqua Hideout "item ball"
// said "Found _EVENT SCRIPT_ELECTRODE2!" and put `eventscriptelectrode2` in the
// bag — no battle. items.js applied Crystal's <Map><Item> script-name guess to
// every map, so on Emerald/FireRed EVERY scripted ball became a junk pickup: the
// Aqua Hideout and Power Plant Electrodes, the Rocket Hideout SILPH SCOPE and LIFT
// KEY, the EEVEE / BELDUM / Dojo gift balls. (New Mauville's Voltorbs had a
// one-off hard-coded ambush.) Now a non-item ball on a non-Crystal map runs its
// authored script; Crystal's guess runs only on Crystal maps.
//   1. both Aqua Hideout Electrodes: ELECTRODE Lv30 encounter, never an item;
//      escape / defeat / CATCH each leave the ball gone, and it stays gone
//   2. New Mauville Voltorbs (Lv25) and Power Plant Electrodes (Lv34) the same way
//   3. the real items in those rooms are still pickups (Nugget, Master Ball, Max Elixir)
//   4. key-item balls give the item without a false "BAG is full" (giveitem's VAR_RESULT)
//   5. gift balls give the POKeMON (Eevee)
//   6. Crystal: a <Map><Item> ball is still a pickup; Elm's starter balls are not items
//   7. no ball anywhere tested mints an `eventscript…` junk item
//
//   node overworld/tests/scripted_balls_test.mjs
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
const PORT = 9186;
const STATE = { username: 'balls', friendCode: 'BALLS1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const mon = (s, n) => ({ speciesId: s, name: s.toUpperCase(), level: 60, types: ['Water'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 200, atk: 150, def: 150, spa: 150, spd: 150, spe: 150 }, maxHP: 200, curHP: 200, exp: 216000, moves: [{ id: 'surf', name: 'Surf', pp: 15, maxPp: 15 }], sprite: 's9.png', num: n });

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
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
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const errors = [];
	const open = async (region, map) => {
		const p = await browser.newPage();
		p.on('pageerror', e => errors.push(map + ': ' + e.message));
		await p.evaluateOnNewDocument((st, region, party) => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 't');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', region);
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
		}, STATE, region, [mon('blastoise', 9), mon('pidgeot', 18)]);
		await p.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await p.evaluate(m => window.__ow?.world?.current?.name === m && !!window.__ow.battle?.data, map).catch(() => false)); i++) await sleep(100);
		await sleep(1300);
		return p;
	};
	const ballsOf = p => p.evaluate(() => window.__ow.items.balls.filter(b => !b.hidden).map(b => ({ x: b.tx, y: b.ty, scripted: !!b.scripted, id: b.id || null, script: b.script || null })));
	// face the ball and press Z; resolve a battle with `outcome` (escaped | victory | caught)
	const talk = (p, ball, outcome = 'escaped') => p.evaluate(async (b, outcome) => {
		const O = window.__ow, P = O.player;
		const bag0 = JSON.parse(localStorage.getItem('magepunk_bag_v1') || '{}'), party0 = (O.party || []).length;
		for (const [dx, dy, f] of [[-1, 0, 'right'], [1, 0, 'left'], [0, 1, 'up'], [0, -1, 'down']]) {
			const x = b.x + dx, y = b.y + dy;
			if (O.world.isPassable(x, y) && !O.items.occupied(x, y) && !O.npcs.list.some(n => n.tx === x && n.ty === y)) { P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.facing = f; break; }
		}
		dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true }));
		const said = []; let battle = null; const t0 = Date.now();
		while (Date.now() - t0 < 15000) {
			const a = O.battle.active;
			if (a && !battle) {
				battle = { foe: a.foe.speciesId, lv: a.foe.level, double: !!a.double };
				if (outcome === 'caught') { a.caughtMon = a.foe; O.battle.finish('caught'); } else O.battle.finish(outcome);
			}
			if (O.dialog.blocking) { said.push(JSON.stringify(O.dialog.pages || '')); dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true })); }
			if (!O.cutscene.blocking && !O.dialog.blocking && !O.battle.blocking && Date.now() - t0 > 1500) break;
			await new Promise(r => setTimeout(r, 80));
		}
		await new Promise(r => setTimeout(r, 400));
		const bag1 = JSON.parse(localStorage.getItem('magepunk_bag_v1') || '{}');
		const ball = O.items.balls.find(x => x.tx === b.x && x.ty === b.y);
		return { battle, bagAdded: Object.keys(bag1).filter(k => (bag1[k] || 0) > (bag0[k] || 0)), partyDelta: (O.party || []).length - party0,
			gone: !ball || !!ball.hidden, said: said.join(' | ') };
	}, ball, outcome);
	const junk = p => p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('magepunk_bag_v1') || '{}')).filter(k => /^eventscript/.test(k)));

	// ===== 1. Aqua Hideout B1F =====
	{
		const p = await open('HOENN', 'AquaHideout_B1F');
		const balls = await ballsOf(p);
		const e1 = balls.find(b => /Electrode1$/.test(b.script || '')), e2 = balls.find(b => /Electrode2$/.test(b.script || ''));
		A(e1 && e2 && !e1.id && !e2.id, 'both Electrode balls are scripted objects, not item pickups', JSON.stringify(balls));
		A(['nugget', 'masterball', 'maxelixir'].every(id => balls.some(b => b.id === id)), '[3] the real items in the room are still pickups (Nugget, Master Ball, Max Elixir)', JSON.stringify(balls.map(b => b.id)));
		const r1 = await talk(p, e1, 'escaped');
		A(r1.battle && r1.battle.foe === 'electrode' && r1.battle.lv === 30 && !r1.battle.double, 'Electrode 1: ELECTRODE Lv30 single battle (its authored setwildbattle)', JSON.stringify(r1));
		A(r1.gone && !r1.bagAdded.some(k => /eventscript/.test(k)), 'Electrode 1: after escaping it is gone, and nothing junk was bagged', JSON.stringify(r1));
		const r2 = await talk(p, e2, 'caught');
		A(r2.battle && r2.battle.foe === 'electrode' && r2.battle.lv === 30, 'Electrode 2: ELECTRODE Lv30 battle (the reported "Found _EVENT SCRIPT_ELECTRODE2!" ball)', JSON.stringify(r2));
		A(r2.gone && r2.partyDelta === 1, 'Electrode 2: CAUGHT — it joins you and the ball is gone', JSON.stringify(r2));
		const flags = await p.evaluate(async () => { const S = await import('./events.js'); return ['FLAG_HIDE_AQUA_HIDEOUT_B1F_ELECTRODE_1', 'FLAG_HIDE_AQUA_HIDEOUT_B1F_ELECTRODE_2', 'FLAG_DEFEATED_ELECTRODE_1_AQUA_HIDEOUT', 'FLAG_DEFEATED_ELECTRODE_2_AQUA_HIDEOUT'].map(f => S.getFlag(f)); });
		A(flags[0] && flags[1], 'both hide flags are set (they stay gone)', JSON.stringify(flags));
		A(flags[2] || flags[3], '...and the script recorded its DEFEATED flag as the source does', JSON.stringify(flags));
		await p.evaluate(() => window.__ow.moveToMap('AquaHideout_B1F'));
		await sleep(1200);
		const again = await ballsOf(p);
		A(!again.some(b => /Electrode/.test(b.script || '')), 'after leaving and re-entering the map, neither Electrode is back', JSON.stringify(again));
		A((await junk(p)).length === 0, 'no eventscript… item in the bag', JSON.stringify(await junk(p)));
		await p.close();
	}

	// ===== 2. New Mauville + Power Plant =====
	for (const [region, map, species, lv] of [['HOENN', 'NewMauville_Inside', 'voltorb', 25], ['KANTO', 'PowerPlant', 'electrode', 34]]) {
		const p = await open(region, map);
		const balls = await ballsOf(p);
		const enc = balls.filter(b => b.scripted);
		A(enc.length >= 2, `[${map}] its disguised balls are scripted objects`, JSON.stringify(balls));
		const r = await talk(p, enc[0], 'victory');
		A(r.battle && r.battle.foe === species && r.battle.lv === lv, `[${map}] ${species.toUpperCase()} Lv${lv} battle`, JSON.stringify(r));
		A(r.gone, `[${map}] ...defeated, it is gone`, JSON.stringify(r));
		A(balls.some(b => b.id && !b.scripted), `[${map}] the room's real items are still pickups`, JSON.stringify(balls.map(b => b.id)));
		A((await junk(p)).length === 0, `[${map}] no junk item`, JSON.stringify(await junk(p)));
		await p.close();
	}

	// ===== 4. key items =====
	{
		const p = await open('KANTO', 'RocketHideout_B4F');
		const balls = await ballsOf(p);
		const scope = balls.find(b => /SilphScope$/.test(b.script || ''));
		const r = await talk(p, scope);
		A(r.bagAdded.includes('silphscope') && r.gone, 'the SILPH SCOPE ball gives the SILPH SCOPE and goes away', JSON.stringify(r));
		A(!/BAG is full/.test(r.said), '...without a false "Too bad! The BAG is full…" (giveitem answers TRUE)', r.said.slice(0, 160));
		// the LIFT KEY is story progression, not just an item (report addendum, 3:06pm):
		// its script sets FLAG_CAN_USE_ROCKET_HIDEOUT_LIFT, which the elevator reads
		const lift = balls.find(b => /LiftKey$/.test(b.script || ''));
		const rl = await talk(p, lift);
		A(rl.bagAdded.includes('liftkey') && rl.gone, 'the LIFT KEY ball gives the LIFT KEY and goes away', JSON.stringify(rl));
		const liftFlag = await p.evaluate(async () => (await import('./events.js')).getFlag('FLAG_CAN_USE_ROCKET_HIDEOUT_LIFT'));
		A(liftFlag === true, '...and runs the whole authored script: FLAG_CAN_USE_ROCKET_HIDEOUT_LIFT is set', String(liftFlag));
		// the elevator's floor select branches on that flag: it must not answer NeedKey
		const elev = await p.evaluate(async () => {
			const O = window.__ow;
			await O.moveToMap('RocketHideout_Elevator');
			const S = (await import('./ow_state.js')).S;
			const ops = S.mapScripts.RocketHideout_Elevator_EventScript_FloorSelect || [];
			const gate = ops.find(o => o.op === 'branch' && /NeedKey/.test(o.label || ''));
			return { hasGate: !!gate, cond: gate && gate.cond };
		});
		A(elev.hasGate && elev.cond && elev.cond.flag === 'FLAG_CAN_USE_ROCKET_HIDEOUT_LIFT' && elev.cond.state === false,
			'the elevator gates on exactly that flag (unset -> NeedKey), so the key now opens it', JSON.stringify(elev));
		A((await junk(p)).length === 0, 'no junk item', JSON.stringify(await junk(p)));
		await p.close();
	}

	// ===== 5. a gift ball =====
	{
		const p = await open('KANTO', 'CeladonCity_Condominiums_RoofRoom');
		const balls = await ballsOf(p);
		const r = await talk(p, balls.find(b => /EeveeBall$/.test(b.script || '')));
		A(r.partyDelta === 1 && r.gone && /EEVEE/.test(r.said), 'the EEVEE ball gives an EEVEE and goes away', JSON.stringify(r).slice(0, 200));
		A((await junk(p)).length === 0, 'no junk item', JSON.stringify(await junk(p)));
		await p.close();
	}

	// ===== 6. Crystal =====
	{
		const p = await open('JOHTO', 'Route29');
		const balls = await ballsOf(p);
		A(balls.some(b => b.id === 'potion' && !b.scripted), '[Crystal] Route 29\'s <Map><Item> ball (Route29Potion) is still a POTION pickup', JSON.stringify(balls));
		await p.close();
		const q = await open('JOHTO', 'ElmsLab');
		const lab = await ballsOf(q);
		A(!lab.some(b => b.id || b.scripted), '[Crystal] Elm\'s starter balls are neither items nor scripted balls here (the starter flow owns them)', JSON.stringify(lab));
		await q.close();
	}

	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
