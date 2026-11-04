// phone_test.mjs — the PHONE, in all three regions.
//
// One device everywhere. Every region's intro hands it over with the POKeDEX,
// and a save already past the intro gets it on load. Contacts: MOM, your
// region's professor, and trainers who give you their number:
//   JOHTO  Crystal's 28 phone trainers, through their own (restored) scripts:
//          the number ask, the rematch with their next team, the gift.
//   HOENN  Emerald's Match Call trainers: their script registers you after
//          the first battle; a call makes a rematch ready; the next tier fights.
//   KANTO  FireRed's VS SEEKER trainers offer their number after a win.
//
//   node overworld/tests/phone_test.mjs
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
const PORT = 9176;
const STATE = { username: 'phone', friendCode: 'PHONE0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
	// a save PAST the intro, with no phone: the load must hand one over
	const open = async (region, map, x, y) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, party, region) => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 't');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', region);
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_money', '1000');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
		}, STATE, [mon()], region);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
		await page.evaluate(() => {
			const W = window.__ow;
			const orig = W.battle.startTrainer.bind(W.battle);
			W.battle.startTrainer = (party, foe, info, onEnd, ...rest) => {
				window.__foe = foe.map(m => `${m.speciesId}:${m.level}`);
				for (const m of foe) { m.curHP = 1; m.maxHP = 1; for (const k of Object.keys(m.stats || {})) m.stats[k] = 1; }
				return orig(party, foe, info, (r, ...x) => { window.__outcome = r; return onEnd && onEnd(r, ...x); }, ...rest);
			};
		});
		const P = {
			page, errors, ctx,
			phone: () => page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_phone_v1') || '{}')),
			flags: () => page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_story')).flags),
			// stand beside the trainer, face them, press Z
			talk: script => page.evaluate(script => {
				const W = window.__ow, t = W.trainers.list.find(x => x.ev.script === script) || W.npcs.list.find(x => x.ev && x.ev.script === script);
				if (!t) return { err: 'no ' + script };
				for (const [dx, dy, facing] of [[0, 1, 'up'], [-1, 0, 'right'], [1, 0, 'left'], [0, -1, 'down']]) {
					const x = t.tx + dx, y = t.ty + dy;
					if (!W.world.isPassable(x, y) || W.npcs.list.some(n => n.tx === x && n.ty === y) || W.trainers.list.some(o => o.tx === x && o.ty === y)) continue;
					W.player.tx = x; W.player.ty = y; W.player.x = x * 16; W.player.y = y * 16; W.player.facing = facing;
					window.__foe = null; window.__outcome = null; window.__said = [];
					W.interact();
					return { ok: true, defeated: W.trainers.isDefeated && t.ev && W.trainers.list.includes(t) ? W.trainers.isDefeated(t) : null };
				}
				return { err: 'no side' };
			}, script),
			// advance everything; Z answers yes/no (yes), and every page is recorded
			settle: async (ms = 15000) => {
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
			},
			said: () => page.evaluate(() => (window.__said || []).join(' | ')),
			last: () => page.evaluate(() => ({ foe: window.__foe, outcome: window.__outcome })),
			// an incoming call from this contact, with the dice pinned (0 = the first branch: a rematch request)
			ring: (key, roll = 0) => page.evaluate(async (key, roll) => {
				const P2 = await import('./phone.js');
				const real = Math.random; Math.random = () => roll;
				try { return P2.ringFrom(P2.contactFor(key)); } finally { Math.random = real; }
			}, key, roll),
		};
		return P;
	};

	// ===== a NEW game in each region: the professor hands over the PHONE =====
	for (const [row, region, lab, prof] of [[0, 'KANTO', 'PalletTown_ProfessorOaksLab', 'OAK'], [1, 'JOHTO', 'ElmsLab', 'ELM'], [2, 'HOENN', 'LittlerootTown_ProfessorBirchsLab', 'BIRCH']]) {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument(st => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 't');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current)).catch(() => false)); i++) await sleep(100);
		await sleep(900);
		const key = k => page.evaluate(k => dispatchEvent(new KeyboardEvent('keydown', { key: k })), k);
		const noPhoneYet = await page.evaluate(() => !JSON.parse(localStorage.getItem('magepunk_phone_v1') || '{}').has);
		for (let i = 0; i < row; i++) { await key('ArrowDown'); await sleep(150); }
		await key('z'); await sleep(2500);
		for (let i = 0; i < 40 && await page.evaluate(() => window.__ow.dialog.blocking || window.__ow.cutscene.blocking); i++) { await key('z'); await sleep(200); }
		await page.evaluate(l => window.__ow.moveToMap(l), lab); await sleep(1500);
		for (let i = 0; i < 40 && !await page.evaluate(() => window.__ow.starterMenu.open); i++) { await key('z'); await sleep(220); }
		await key('z'); await sleep(500);
		const said = [];
		for (let i = 0; i < 300; i++) {
			const s = await page.evaluate(() => { const W = window.__ow;
				if (W.battle.active && W.battle.active.phase === 'menu') W.battle.finish('victory');
				return { d: W.dialog.blocking ? JSON.stringify(W.dialog.pages || '') : null, done: !!W.party && !W.dialog.blocking && !W.cutscene.blocking && !W.battle.blocking }; });
			if (s.d) said.push(s.d);
			if (s.done) break;
			await key('z'); await sleep(150);
		}
		const ph = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_phone_v1') || '{}'));
		const items = await page.evaluate(() => window.__ow.startItems());
		A(noPhoneYet && ph.has === true && items.includes('PHONE'), `[${region}] a new game: after the starter and the rival, the PHONE is yours (and in the START menu)`, JSON.stringify({ noPhoneYet, ph, items }));
		A(said.some(t => new RegExp(prof).test(t) && /PHONE/.test(t)), `[${region}] ...handed over by PROF. ${prof}`, said.filter(t => /PHONE/.test(t)).join(' ').slice(0, 200));
		A(errors.length === 0, `[${region}] no page error`, JSON.stringify(errors.slice(0, 2)));
		await ctx.close();
	}

	// ===== migration + the device itself =====
	{
		const P = await open('HOENN', 'LittlerootTown', 5, 8);
		const ph = await P.phone();
		A(ph.has === true, 'a save past the intro gets a PHONE on load (it never had one)', JSON.stringify(ph));
		A((await P.flags()).FLAG_HAS_MATCH_CALL === true, "...and Emerald's FLAG_HAS_MATCH_CALL, which its trainers' scripts check before registering you");
		const start = await P.page.evaluate(() => window.__ow.startItems());
		A(start.includes('PHONE'), 'the START menu has PHONE', JSON.stringify(start));
		const rows = await P.page.evaluate(async () => (await import('./phone.js')).phoneMenuRows());
		A(rows[0].startsWith('MOM') && /PROF\. BIRCH/.test(rows[1]), "contacts start with MOM and your region's professor (BIRCH in Hoenn)", JSON.stringify(rows));
		// the menu: opens, draws, and Z calls the selected contact
		const menu = await P.page.evaluate(async () => {
			const Ph = await import('./phone.js'), W = window.__ow;
			Ph.openPhoneMenu();
			await new Promise(r => setTimeout(r, 300));   // a frame draws it
			const drawn = (W.menuUi || []).filter(b => /^phone:/.test(b.id)).length;
			Ph.phoneKey('z');
			const called = W.dialog.blocking && /Calling MOM/.test(JSON.stringify(W.dialog.pages));
			return { drawn, called, closed: !Ph.phoneMenu.open };
		});
		A(menu.drawn >= 3 && menu.called && menu.closed, 'the PHONE menu draws its rows, and Z calls the selected contact (MOM)', JSON.stringify(menu));
		await P.settle();
		// incoming calls: never while busy; otherwise only after the cooldown, on a roll
		const sched = await P.page.evaluate(async () => {
			const Ph = await import('./phone.js');
			localStorage.setItem('magepunk_phone_v1', JSON.stringify({ has: true, contacts: ['HOENN:CALVIN'], ready: {}, gift: {}, tier: {}, steps: 500, lastCallAt: 0 }));
			Ph._resetForTest();
			const real = Math.random; Math.random = () => 0;
			try {
				const busy = Ph.phoneStep(true);
				const early = (() => { const s = JSON.parse(localStorage.getItem('magepunk_phone_v1')); return s; })();
				const rang = Ph.phoneStep(false);
				const again = Ph.phoneStep(false);   // just called: the cooldown holds
				return { busy, rang, again };
			} finally { Math.random = real; }
		});
		A(sched.busy === false && sched.rang === true && sched.again === false, 'incoming calls: never while busy, one when free and due, then a cooldown', JSON.stringify(sched));
		await P.settle();
		await P.page.evaluate(async () => { const Ph = await import('./phone.js'); Ph.callContact(Ph.phoneContacts()[1]); });
		await sleep(200);
		const call = await P.page.evaluate(() => JSON.stringify(window.__ow.dialog.pages || ''));
		A(/Calling PROF\. BIRCH/.test(call) && /POKeDEX/.test(call), 'calling the professor gets an answer (with your next goal)', call.slice(0, 200));
		await P.settle();
		A(P.errors.length === 0, 'no page error (device)', JSON.stringify(P.errors.slice(0, 2)));
		await P.ctx.close();
	}

	// ===== JOHTO: Lass Dana, through her own restored script =====
	{
		const P = await open('JOHTO', 'Route38', 15, 6);
		await P.talk('TrainerLassDana1'); await P.settle();
		A((await P.last()).outcome === 'victory', 'setup: Dana is beaten (her first battle)');
		await P.talk('TrainerLassDana1'); await P.settle();
		const asked = await P.said();
		A(/MOOMOO FARM/.test(asked) && /number/i.test(asked), 'talking again, Dana asks for your number (her own lines)', asked.slice(0, 300));
		A((await P.phone()).contacts.includes('JOHTO:DANA'), '...Z says yes: DANA is in the PHONE');
		A(/registered/.test(asked), "...and it says so (Crystal's 'registered DANA's number')");
		// she calls: 1/3 of calls are a rematch request (the dice pinned to that branch)
		await P.ring('JOHTO:DANA', 0); await sleep(150);
		const call = await P.page.evaluate(() => JSON.stringify(window.__ow.dialog.pages || ''));
		await P.settle();
		A(/DANA/.test(call) && /ROUTE 38/.test(call), "Dana calls: she's on ROUTE 38 and wants to battle (her own line)", call.slice(0, 200));
		A((await P.flags()).ENGINE_DANA_READY_FOR_REMATCH === true, "...which sets Crystal's own ENGINE_DANA_READY_FOR_REMATCH");
		await P.talk('TrainerLassDana1'); await P.settle();
		const re = await P.last();
		A(JSON.stringify(re.foe) === JSON.stringify(['flaaffy:18', 'psyduck:18']) && re.outcome === 'victory', 'the rematch uses her team for that point in the story (LASS_DANA1, no CIANWOOD flypoint yet)', JSON.stringify(re));
		const f2 = await P.flags();
		A(!f2.ENGINE_DANA_READY_FOR_REMATCH, '...and the rematch request is used up');
		// the gift: a call that finds a THUNDERSTONE (the dice on the gift branch)
		await P.page.evaluate(() => { const S = JSON.parse(localStorage.getItem('magepunk_story')); S.flags.ENGINE_DANA_HAS_THUNDERSTONE = true; localStorage.setItem('magepunk_story', JSON.stringify(S)); });
		await P.page.evaluate(async () => { (await import('./events.js')).setFlag('ENGINE_DANA_HAS_THUNDERSTONE'); });
		const before = await P.page.evaluate(() => window.__ow.Bag.count('thunderstone'));
		await P.talk('TrainerLassDana1'); await P.settle();
		A(await P.page.evaluate(() => window.__ow.Bag.count('thunderstone')) === before + 1 && !(await P.flags()).ENGINE_DANA_HAS_THUNDERSTONE, 'her present: talking to her hands over the THUNDERSTONE');
		A(P.errors.length === 0, 'no page error (Johto)', JSON.stringify(P.errors.slice(0, 2)));
		await P.ctx.close();
	}

	// ===== HOENN: Youngster Calvin, registered by his own (restored) script =====
	{
		const P = await open('HOENN', 'Route102', 33, 14);
		await P.talk('Route102_EventScript_Calvin'); await P.settle();
		A((await P.last()).outcome === 'victory', 'setup: Calvin is beaten (his first battle, through his script)', JSON.stringify(await P.last()));
		A((await P.phone()).contacts.includes('HOENN:CALVIN'), 'after the battle Calvin registers you (the dropped register_matchcall, restored)', await P.said());
		await P.ring('HOENN:CALVIN', 0); await P.settle();
		A((await P.phone()).ready['HOENN:CALVIN'] === 1, 'his call makes a rematch ready');
		await P.talk('Route102_EventScript_Calvin'); await P.settle();
		const re = await P.last();
		A(re.outcome === 'victory' && re.foe && re.foe.length >= 1 && re.foe[0].startsWith('poochyena') === false, 'talking to him starts the rematch with his NEXT team (CALVIN_2)', JSON.stringify(re));
		const ph = await P.phone();
		A(!ph.ready['HOENN:CALVIN'] && ph.tier['HOENN:CALVIN'] === 1, '...and afterwards the request is used up and he moves up a tier', JSON.stringify(ph));
		A(P.errors.length === 0, 'no page error (Hoenn)', JSON.stringify(P.errors.slice(0, 2)));
		await P.ctx.close();
	}

	// ===== KANTO: Youngster Ben (FireRed has no phone: the VS SEEKER's trainers) =====
	{
		const P = await open('KANTO', 'Route3', 10, 8);
		await P.talk('Route3_EventScript_Ben'); await P.settle();
		A((await P.last()).outcome === 'victory', 'setup: Ben is beaten', JSON.stringify(await P.last()));
		A((await P.phone()).contacts.includes('KANTO:YOUNGSTER_BEN'), 'after the win Ben offers his number, and he is in the PHONE', await P.said());
		await P.ring('KANTO:YOUNGSTER_BEN', 0); await P.settle();
		await P.talk('Route3_EventScript_Ben'); await P.settle();
		const re = await P.last();
		A(re.outcome === 'victory' && re.foe && re.foe.length >= 1, 'his call makes a rematch ready, and talking to him fights it', JSON.stringify(re));
		A(P.errors.length === 0, 'no page error (Kanto)', JSON.stringify(P.errors.slice(0, 2)));
		await P.ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
