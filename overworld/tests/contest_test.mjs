// contest_test.mjs — Batch A of the second upscale plan: Pokémon Contests.
//
// Unit half (direct import): the engine math — berry feeding (flavor -> its
// category, smoothness -> sheen, full sheen refuses), combos doubling, boring
// repetition halving, the GREAT_APPEAL lockout, jam shields, the crowd
// spectacle, and the judge's proportions.
//
// Live half (headless): the Lilycove reception counter opens the flow,
// category -> rank (locked ranks refuse) -> entrant -> five appeals ->
// results; a win lands the RIBBON on the mon, advances the rank, pays the
// purse, and writes the journal; the Berry Blender feeds a real bag berry.
//
//   node overworld/tests/contest_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Contest, CATS, RANKS, FLAVOR2CAT } from '../contest.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/contest.json'), 'utf8'));
Contest.init(DATA);

// ---------- data shape ----------
A(Object.keys(DATA.moves).length >= 300, 'the harvest carries 300+ contest moves', String(Object.keys(DATA.moves).length));
A(DATA.opponents.length === 96 && [0, 1, 2, 3].every(r => DATA.opponents.filter(o => o.rank === r).length === 24),
	'all 96 real opponents, 24 per rank');
A(DATA.moves.pound?.cat === 'tough' && DATA.moves.pound?.appeal === 40, 'POUND is the tough 40-appeal classic');
A(DATA.berries.cheriberry?.spicy === 10 && DATA.berries.przcureberry?.spicy === 10,
	'berry flavors harvested, gen-2 berries aliased to their closest flavor');

// ---------- feeding ----------
{
	const mon = { name: 'T', speciesId: 'rattata', moves: [] };
	const r = Contest.feed(mon, 'cheriberry');
	A(r && r.gains.cool === 10 && mon.contest.cool === 10, 'a CHERI berry (spicy) raises COOL by its flavor', JSON.stringify(r));
	A(mon.contest.sheen === Math.max(1, Math.round(DATA.berries.cheriberry.smooth / 2)), 'smoothness fills sheen', String(mon.contest.sheen));
	mon.contest.sheen = 255;
	A(Contest.feed(mon, 'cheriberry') === null, 'a full-sheen mon refuses to eat');
	mon.contest.sheen = 0; mon.contest.cool = 250;
	Contest.feed(mon, 'cheriberry');
	A(mon.contest.cool === 255, 'condition caps at 255');
	A(Contest.feed({ name: 'x', moves: [] }, 'potion') === null, 'a non-berry cannot be fed');
}

// ---------- opponents ----------
{
	const picks = Contest.pickOpponents('cool', 2, () => 0.4);
	A(picks.length === 3 && picks.every(o => o.rank === 2), 'three opponents, all of the asked rank');
	A(picks.every(o => o.pools.cool), 'the category pool is preferred when it has enough');
}

// ---------- the appeal round ----------
const noShuffle = () => 0.5; // sort(() => 0) keeps entry order: me, then the three opponents
const types = () => null;
function mkState(moves, category = 'cool', rank = 0) {
	const mon = { name: 'HERO', speciesId: 'rattata', nickname: null, moves: moves.map(id => ({ id })), contest: { cool: 200, beauty: 0, cute: 0, smart: 0, tough: 0, sheen: 100 } };
	return Contest.start({ category, rank, mon, rng: noShuffle, battleTypes: types });
}
{
	const st = mkState(['pound', 'doubleslap']);
	A(st.cs.length === 4 && st.cs[0].me, 'a contest seats you and three opponents');
	Contest.playTurn(st, 'pound');
	const meLog = st.log.filter(e => e.me);
	A(meLog[0].hearts === 40, 'POUND appeals for its 40', String(meLog[0].hearts));
	Contest.playTurn(st, 'doubleslap');
	const e2 = st.log.filter(e => e.me)[1];
	A(e2.notes.includes('COMBO!') && e2.hearts >= 40, 'DOUBLE SLAP after POUND lands the combo (doubled)', JSON.stringify(e2));
}
{
	const st = mkState(['pound']);
	Contest.playTurn(st, 'pound');
	Contest.playTurn(st, 'pound');
	const e2 = st.log.filter(e => e.me)[1];
	A(e2.hearts === 20 && e2.notes.some(n => /repeated/.test(n)), 'repeating a move bores the judge (halved)', JSON.stringify(e2));
}
{
	const lockId = Object.keys(DATA.moves).find(id => DATA.moves[id].fx === 'GREAT_APPEAL_BUT_NO_MORE_MOVES');
	A(!!lockId, 'a GREAT_APPEAL move exists in the data', lockId);
	const st = mkState([lockId, 'pound']);
	Contest.playTurn(st, lockId);
	A(st.cs[0].lockout === true, `${lockId} locks the user out afterward`);
	Contest.playTurn(st, 'pound');
	const e2 = st.log.filter(e => e.me)[1];
	A(e2.move === null && e2.hearts === 0, 'a spent performer can only stand still', JSON.stringify(e2));
}
{
	// five on-category appeals: the fifth bursts the crowd (+30)
	const cools = Object.keys(DATA.moves).filter(id => DATA.moves[id].cat === 'cool' && DATA.moves[id].type === 'APPEAL').slice(0, 5);
	const st = mkState(cools);
	// neutralize the AI's crowd contributions: play against the state directly
	st.cs = [st.cs[0]]; // solo stage for the crowd check
	for (const id of cools) Contest.playTurn(st, id);
	const burst = st.log.filter(e => e.me).some(e => e.notes.some(n => /crowd went WILD/i.test(n)));
	A(burst, 'the fifth on-category appeal whips the crowd into a spectacle', JSON.stringify(st.log.map(l => l.notes)));
}
{
	const st = mkState(['pound']);
	st.turn = 4; // last appeal
	Contest.playTurn(st, 'pound');
	A(st.done && Array.isArray(st.placements) && st.placements.length === 4, 'after the fifth appeal the judge rules');
	const me = st.placements.find(p => p.me);
	A(me.score === me.cond.cool + Math.round(me.cond.sheen / 4) + me.total * 2,
		'the score = category condition + sheen shine + double appeals', JSON.stringify({ score: me.score, cond: me.cond.cool, total: me.total }));
}
{
	const mi = Contest.moveInfo('totally_custom_move', 'Fire');
	A(mi.cat === 'cool' && mi.appeal === 30, 'an unharvested custom move appeals by its battle type');
}

// ---------- source wiring ----------
{
	const sv = fs.readFileSync(path.join(ROOT, 'overworld/services.js'), 'utf8');
	A(/MAP_LILYCOVE_CITY_CONTEST_LOBBY/.test(sv) && /'contest'/.test(sv) && /'berryblend'/.test(sv),
		'the Lilycove lobby counters carry contest + blender zones');
	const mn = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/emerald_MUS_CONTEST'/.test(mn), 'the stage theme takes over during the appeal round');
	A(/'magepunk_contest_v1'/.test(fs.readFileSync(path.join(ROOT, 'site/owreset.js'), 'utf8')),
		'contest progress joins the canonical save inventory');
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
	const PORT = 8974;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'STARLET', level: 20, gender: 'F', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 60, atk: 30, def: 30, spa: 30, spd: 30, spe: 30 }, maxHP: 60, curHP: 60,
		exp: 8000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
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
			localStorage.setItem('magepunk_region', 'HOENN');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=LilycoveCity_ContestLobby&x=14&y=5`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data && !!window.__ow?.Contest?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.Contest?.data), 'the lobby boots with contest data loaded');

		// the counter: face the receptionist and interact
		const opened = await page.evaluate(() => {
			const ow = window.__ow;
			const p = ow.player;
			p.tx = 14; p.ty = 3; p.px = 14 * 16; p.py = 3 * 16; p.facing = 'up';
			ow.interact();
			return ow.contestMenu.open;
		});
		A(opened, 'talking to the reception counter opens the contest flow');

		// locked ranks refuse
		const lock = await page.evaluate(() => {
			const ow = window.__ow, m = ow.contestMenu;
			m.idx = 0; ow.contestKey('z');          // COOL -> rank screen
			m.idx = 2; ow.contestKey('z');          // HYPER while nothing is cleared
			return { mode: m.mode, flash: m.flash };
		});
		A(lock.mode === 'rank' && /NORMAL RANK first/.test(lock.flash || ''), 'a locked rank names the rank still owed', JSON.stringify(lock));

		// gear the entrant for a sure win, then run the whole contest
		const run = await page.evaluate(() => {
			const ow = window.__ow, m = ow.contestMenu;
			// four distinct high-appeal COOL moves with no jam exposure
			const ids = Object.keys(ow.Contest.data.moves)
				.filter(id => ow.Contest.data.moves[id].cat === 'cool' && ow.Contest.data.moves[id].appeal >= 40 && ow.Contest.data.moves[id].jam === 0 && ow.Contest.data.moves[id].fx === 'HIGHLY_APPEALING')
				.slice(0, 4);
			const mon = ow.party[0];
			mon.moves = ids.map(id => ({ id, name: id, pp: 10, maxPp: 10 }));
			mon.contest = { cool: 255, beauty: 0, cute: 0, smart: 0, tough: 0, sheen: 255 };
			const moneyBefore = ow.Bag.getMoney();
			m.idx = 0; ow.contestKey('z');          // NORMAL rank
			m.idx = 0; ow.contestKey('z');          // the entrant
			const o = { scene: m.mode === 'scene', turns: [] };
			for (let t = 0; t < 5; t++) {
				m.idx = t % ids.length;              // rotate moves: no boring repeats
				ow.contestKey('z');                  // appeal
				o.turns.push(m.entries?.filter(e => e.me)[0]?.hearts ?? -1);
				ow.contestKey('z');                  // advance the log
			}
			o.mode = m.mode;
			o.win = m.st?.placements?.[0]?.me ?? null;
			o.ribbon = (mon.ribbons || [])[0] || null;
			o.rankAfter = ow.contestProgress().ranks.cool;
			o.paid = ow.Bag.getMoney() - moneyBefore;
			o.journal = ow.Journal.list()[0]?.text || '';
			ow.contestKey('z');                      // close the results
			o.closed = !m.open;
			o.saved = (JSON.parse(localStorage.getItem('magepunk_party_v1'))[0].ribbons || [])[0] || null;
			return o;
		});
		A(run.scene, 'category -> rank -> entrant reaches the appeal stage');
		A(run.turns.every(h => h >= 0), 'five appeals play out', JSON.stringify(run.turns));
		A(run.mode === 'results' && run.win === true, 'a conditioned, well-moved entrant wins the NORMAL rank', JSON.stringify({ mode: run.mode, win: run.win }));
		A(run.ribbon === 'cool-normal', 'the COOL NORMAL RIBBON lands on the mon', run.ribbon);
		A(run.rankAfter === 1, 'the SUPER rank unlocks for COOL', String(run.rankAfter));
		A(run.paid > 0, 'the win pays a purse', String(run.paid));
		A(/Contest/.test(run.journal), 'the journal remembers the win', run.journal);
		A(run.closed && run.saved === 'cool-normal', 'the ribbon persists on the saved party', run.saved);

		// the Berry Blender feeds a real bag berry into condition
		const blend = await page.evaluate(() => {
			const ow = window.__ow, b = ow.blendMenu;
			ow.Bag.addItem('cheriberry', 2);
			ow.party[0].contest = { cool: 0, beauty: 0, cute: 0, smart: 0, tough: 0, sheen: 0 };
			const p = ow.player;
			p.tx = 26; p.ty = 6; p.px = 26 * 16; p.py = 6 * 16; p.facing = 'up';
			ow.interact();
			const o = { opened: b.open };
			b.idx = 0; ow.blendKey('z');            // pick the mon
			o.feedMode = b.mode === 'feed';
			b.idx = 0; ow.blendKey('z');            // feed the CHERI
			o.cool = ow.party[0].contest.cool;
			o.left = ow.Bag.count('cheriberry');
			o.flash = b.flash;
			ow.drawBlend(480, 320);                  // the bars render
			b.open = false;
			return o;
		});
		A(blend.opened, 'the Blend Master corner opens the blender');
		A(blend.feedMode && blend.cool === 10 && blend.left === 1, 'feeding a CHERI raises COOL and spends the berry', JSON.stringify(blend));
		A(/COOL \+10/.test(blend.flash || ''), 'the flash narrates the gains', blend.flash);

		// every screen draws; the summary shows the ribbon case
		const draw = await page.evaluate(() => {
			const ow = window.__ow;
			try {
				const m = ow.contestMenu;
				m.open = true;
				for (const mode of ['category', 'rank', 'pickmon']) { m.mode = mode; m.category = m.category || 'cool'; ow.drawContest(480, 320); }
				m.open = false;
				ow.partyMenu.open = true; ow.partyMenu.summary = true; ow.partyMenu.idx = 0;
				return 'ok';
			} catch (e) { return 'threw: ' + e.message; }
		});
		await new Promise(r => setTimeout(r, 500)); // a few frames of the summary (ribbons line) render
		await page.evaluate(() => { window.__ow.partyMenu.open = false; window.__ow.partyMenu.summary = false; });
		A(draw === 'ok', 'every contest screen and the ribboned summary draw clean', draw);

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
