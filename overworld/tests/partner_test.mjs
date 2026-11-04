// partner_test.mjs — in-game partner battles (Plans/AI_PARTNER_PLAN.md), driven
// through the real Mossdeep Space Center script via interact():
//   * ChooseHalfPartyForBattle opens a pick-3 screen; cancel loops the prompt
//   * the battle is a double with STEVEN's METANG in the ally slot, fought by the
//     player's three picks only (the saved party is never cut down)
//   * the player is asked for ONE action a turn; the partner acts by itself
//   * EXP never goes to the partner's mons
//   * a reload mid-battle resumes the partner, and a win after it still runs the
//     "defeated Maxie + Tabitha" scene
//   * you lose when YOUR picks are down, whatever Steven has left; Steven running
//     out leaves you fighting alone
//
//   node overworld/tests/partner_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const puppeteer = (await import('puppeteer-core')).default;
const http = await import('http');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9109;
const STATE = { username: 'partner', friendCode: 'PARTN0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [] }));
	}
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
		res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mon = (speciesId, num, level = 60) => ({
	speciesId, name: speciesId.toUpperCase(), level, gender: 'M', friend: 70, types: ['Water'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 200, atk: 200, def: 200, spa: 200, spd: 200, spe: 200 }, maxHP: 200, curHP: 200,
	exp: 200000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: `s${num}.png`, num,
});

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party) => {
		localStorage.setItem('magepunk_mp_token_v1', 'partner-token');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'HOENN');
		if (!localStorage.getItem('magepunk_story'))
			localStorage.setItem('magepunk_story', JSON.stringify({
				flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, FLAG_INTERACTED_WITH_STEVEN_SPACE_CENTER: true },
				vars: {} }));
		if (!localStorage.getItem('magepunk_party_v1')) localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
	}, STATE, [mon('mudkip', 258), mon('lotad', 270), mon('seedot', 273), mon('wingull', 278)]);

	const boot = async (url) => {
		await page.goto(url, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 60000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await sleep(200);
		await sleep(1500);
		await page.evaluate(() => document.activeElement?.blur?.());
	};
	const key = k => page.evaluate(k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })), k);
	// answer boxes with Z until the picker opens, a battle starts, or all is quiet
	const settle = async (ms = 15000) => {
		const t = Date.now();
		while (Date.now() - t < ms) {
			const st = await page.evaluate(() => ({ d: !!window.__ow.dialog.blocking, c: !!window.__ow.cutscene.blocking, b: !!window.__ow.battle.active, p: !!window.__ow.halfParty.open }));
			if (st.b || st.p || (!st.d && !st.c)) return st;
			await page.evaluate(() => { try { window.__ow.dialog.revealed = 1e9; window.__ow.dialog.key('z'); } catch (e) {} });
			await sleep(80);
		}
		return null;
	};
	const talkSteven = async () => {
		await page.evaluate(() => { const W = window.__ow, p = W.player; p.tx = 2; p.ty = 8; p.px = 32; p.py = 128; p.facing = 'left'; p.moving = false; W.interact(); });
		await sleep(300);
		return settle();
	};
	// let the battle run to its menu (skipping message lines)
	const toMenu = async (ms = 20000) => {
		const t = Date.now();
		while (Date.now() - t < ms) {
			const ph = await page.evaluate(() => window.__ow.battle.active?.phase || null);
			if (!ph || ph === 'menu' || ph === 'done') return ph;
			await key('z'); await sleep(90);
		}
		return 'timeout';
	};

	const URL = `http://localhost:${PORT}/overworld/index.html?map=MossdeepCity_SpaceCenter_2F&x=2&y=8`;
	await boot(URL);

	// ===== the pick-3 screen; cancelling loops back to Steven's prompt =====
	let st = await talkSteven();
	A(st?.p, 'answering YES opens the pick-3 party screen', JSON.stringify(st));
	await key('x'); await sleep(300);
	st = await settle();
	A(st?.p, 'cancelling returns to the prompt, and YES opens the picker again', JSON.stringify(st));
	// pick slots 0, 2, 3 (skip LOTAD); the third pick hops the cursor to BATTLE
	await key('z'); await key('ArrowDown'); await key('ArrowDown'); await key('z'); await key('ArrowDown'); await key('z');
	const picked = await page.evaluate(() => ({ picked: window.__ow.halfParty.picked.slice(), idx: window.__ow.halfParty.idx }));
	A(JSON.stringify(picked.picked) === '[0,2,3]' && picked.idx === 4, 'three picks in order, cursor on BATTLE', JSON.stringify(picked));
	await key('z'); await sleep(500);
	st = await settle();
	const fight = await page.evaluate(() => {
		const a = window.__ow.battle.active;
		return a && {
			double: !!a.double, partner: a.partner?.name, ally: a.meAlly?.speciesId, me: a.me?.speciesId,
			side: a.party.map(m => m.speciesId), foes: [a.foe?.speciesId, a.foeAlly?.speciesId],
			saved: window.__ow.party.length,
		};
	});
	A(fight?.double && fight.partner === 'STEVEN' && fight.ally === 'metang', "it's a double with STEVEN's METANG in the ally slot", JSON.stringify(fight));
	A(fight && JSON.stringify(fight.side) === '["mudkip","seedot","wingull"]' && fight.saved === 4,
		'the player fights with exactly the three picks; the saved party stays whole', JSON.stringify(fight));
	A(fight && fight.foes[0] === 'mightyena' && fight.foes[1] === 'camerupt', "vs Maxie's and Tabitha's leads", JSON.stringify(fight));

	// ===== one action a turn; the partner acts by itself =====
	A(await toMenu() === 'menu', 'the battle reaches its menu');
	const ppBefore = await page.evaluate(() => window.__ow.battle.active.partner.party[0].moves.reduce((s, m) => s + m.pp, 0));
	await key('z'); await sleep(150);          // FIGHT
	await key('z'); await sleep(150);          // first move
	const tgt = await page.evaluate(() => window.__ow.battle.active.phase);
	if (tgt === 'target') { await key('z'); await sleep(150); }
	const asked = await page.evaluate(() => { const a = window.__ow.battle.active; return { phase: a.phase, actionFor: a.actionFor, msg: a.msg }; });
	A(asked.actionFor === 0 && !/METANG/.test(asked.msg || '') && !['menu', 'moves'].includes(asked.phase),
		'after the player picks, the turn runs — nobody asks what METANG will do', JSON.stringify(asked));
	await toMenu(30000);
	const ppAfter = await page.evaluate(() => { const a = window.__ow.battle.active; return a ? a.partner.party[0].moves.reduce((s, m) => s + m.pp, 0) : null; });
	A(ppAfter != null && ppAfter < ppBefore, 'METANG chose and used a move on its own', `${ppBefore} -> ${ppAfter}`);

	// ===== EXP is the player's only =====
	const exp = await page.evaluate(() => {
		const W = window.__ow, a = W.battle.active;
		const pal = a.meAlly, me = a.me;
		const b = { pal: pal.exp, me: me.exp };
		W.battle.awardBattleExp(a.foe);
		return { pal: pal.exp - b.pal, me: me.exp - b.me };
	});
	A(exp.me > 0 && exp.pal === 0, "a KO's EXP goes to the player's mon, never to Steven's", JSON.stringify(exp));
	await toMenu();

	// ===== reload mid-battle: the partner resumes, and the win still lands =====
	const pre = await page.evaluate(() => { const a = window.__ow.battle.active; return { ally: a.meAlly.speciesId, hp: a.meAlly.curHP, n: a.partner.party.length }; });
	await boot(URL);
	await sleep(1500);
	const post = await page.evaluate(() => { const a = window.__ow.battle.active; return a && { partner: a.partner?.name, ally: a.meAlly?.speciesId, hp: a.meAlly?.curHP, n: a.partner?.party.length, side: a.party.length }; });
	A(post && post.partner === 'STEVEN' && post.ally === pre.ally && post.hp === pre.hp && post.n === 3 && post.side === 3,
		'a reload resumes the battle with Steven, his mon and its HP intact', JSON.stringify({ pre, post }));
	await page.evaluate(() => window.__ow.battle.active && window.__ow.battle.finish('victory'));
	await sleep(1500); await settle(20000);
	const won = await page.evaluate(() => ({ sc: window.__ow.Story.getVar('VAR_MOSSDEEP_SPACE_CENTER_STATE'), city: window.__ow.Story.getVar('VAR_MOSSDEEP_CITY_STATE'), party: window.__ow.party.length }));
	A(won.sc === 3 && won.city === 3, 'winning the resumed battle still runs the "defeated Maxie + Tabitha" scene', JSON.stringify(won));
	A(won.party === 4, 'and the full party of four is still there', JSON.stringify(won));

	// ===== the loss rule =====
	const loss = await page.evaluate(async () => {
		const W = window.__ow, B = W.battle, data = B.data;
		const sleep = ms => new Promise(r => setTimeout(r, ms));
		const pmk = s => { const m = JSON.parse(JSON.stringify(W.party[0])); m.speciesId = s; m.name = s.toUpperCase(); m.curHP = m.maxHP; return m; };
		const run = async (killMine) => {
			const mine = [pmk('mudkip'), pmk('seedot')];
			const steven = [pmk('metang'), pmk('skarmory')];
			const foes = [pmk('mightyena'), pmk('camerupt'), pmk('golbat')];
			let res = null;
			await B.startTrainer(mine, foes, { displayName: 'TEST', double: true, partner: { name: 'STEVEN', party: steven }, money: 0 }, r => { res = r; });
			const a = B.active;
			a.queue.length = 0;
			for (const m of (killMine ? mine : steven)) m.curHP = 0;
			B.startQueue(() => B.checkFaintsD());
			const t = Date.now();
			while (Date.now() - t < 8000 && B.active && B.active.phase !== 'done' && B.active.phase !== 'menu') {
				window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z' })); await sleep(60);
			}
			const out = { phase: B.active?.phase, result: B.active?.result, ally: B.active?.meAlly?.speciesId || null };
			if (B.active) { B.finish('fled'); const t2 = Date.now(); while (Date.now() - t2 < 5000 && B.active) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z' })); await sleep(60); } }
			return out;
		};
		return { mineDown: await run(true), stevenDown: await run(false) };
	});
	A(loss.mineDown.phase === 'done' && loss.mineDown.result === 'defeat', "you lose when YOUR picks are down, even with Steven's mons standing", JSON.stringify(loss.mineDown));
	A(loss.stevenDown.phase === 'menu' && !loss.stevenDown.result && !loss.stevenDown.ally, 'Steven running out leaves you fighting alone', JSON.stringify(loss.stevenDown));

	A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 2)));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
