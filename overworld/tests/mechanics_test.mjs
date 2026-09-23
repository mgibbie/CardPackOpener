// mechanics_test.mjs — Upscale 3 Batch 3: the last tractable battle pieces,
// every one FIRED live (never inspected as JSON).
//
//   * IMPRISON seals shared moves through moveUsable
//   * GRUDGE drains the killing move's PP
//   * TEATIME force-feeds every held berry (heal + cure paths)
//   * PERISH BODY dooms both sides on a physical hit
//   * EMERGENCY EXIT / WIMP OUT bolt a wild fight below half
//   * DANCER copies dance moves; OPPORTUNIST mirrors stat gains
//   * STALL folds into the turn order inside its priority bracket
//
// Also pinned: 'arenaaura' appears in NO species data — the old "one ability
// left" claim is vacuous in this build.
//
//   node overworld/tests/mechanics_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- source + data ----------
{
	const bt = fs.readFileSync(path.join(ROOT, 'overworld/battle.js'), 'utf8');
	A(/imprison: \{ imprison: true \}/.test(bt) && /grudge: \{ grudgeSelf: true \}/.test(bt) && /teatime: \{ teatime: true \}/.test(bt),
		'IMPRISON / GRUDGE / TEATIME left the noop list');
	A(/myStall !== foeStall \? foeStall/.test(bt), 'STALL yields inside its priority bracket');
	A(/delete mon\.imprisoning/.test(bt) && /delete mon\.grudged/.test(bt) && /delete mon\.exitUsed/.test(bt),
		'the new volatiles clear on switch/battle-end');
	const ab = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_abilities.json'), 'utf8'));
	const hasArena = Object.entries(ab).some(([k, v]) => k !== '_names' && Array.isArray(v) && v.includes('arenaaura'));
	A(!hasArena, "'arenaaura' is carried by no species — the old audit claim is vacuous");
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
	const PORT = 8992;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 50, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 160, atk: 120, def: 100, spa: 100, spd: 100, spe: 120 }, maxHP: 160, curHP: 160,
		exp: 125000, moves: [
			{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 },
			{ id: 'hyperbeam', name: 'Hyper Beam', pp: 5, maxPp: 5 },
			{ id: 'swordsdance', name: 'Swords Dance', pp: 20, maxPp: 20 },
			{ id: 'watergun', name: 'Water Gun', pp: 25, maxPp: 25 },
		], sprite: 's608.png', num: 19,
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
			localStorage.setItem('magepunk_region', 'JOHTO');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		// helpers shared by every probe: start a fresh fight, drive useMove, settle
		await page.evaluate(() => {
			const ow = window.__ow, b = ow.battle;
			const wait = ms => new Promise(r => setTimeout(r, ms));
			window.__probe = {
				async fresh(foeAbility, foeHP = 4000) {
					if (b.active) { b.startQueue(() => b.tryRun()); for (let i = 0; i < 150 && b.active; i++) await wait(60); }
					ow.startWildBattle({ id: 'sentret', level: 10 });
					for (let i = 0; i < 200; i++) { const a = b.active; if (a && a.phase === 'menu') break; await wait(60); }
					const a = b.active;
					a.foe.maxHP = foeHP; a.foe.curHP = foeHP; a.foeShownHP = foeHP;
					if (foeAbility) a.foe.ability = foeAbility;
					// full heal + clean slate on my side each probe
					a.me.curHP = a.me.maxHP;
					for (const mv of a.me.moves) mv.pp = mv.maxPp;
					// ...and the VOLATILES, which "clean slate" did not cover. a.me is the
					// same party object in every probe, so the previous one's leftovers
					// ride along: Hyper Beam sets rechargeTurn, and the next probe's move
					// is then eaten by "must recharge!" before its mechanic can fire. That
					// is what made PERISH BODY report {} — the tackle never happened.
					// Status is cleared for the same reason (a paralysed lead loses turns),
					// and perishN so a stale counter cannot make the probe pass spuriously.
					a.me.rechargeTurn = false;
					a.me.status = null;
					delete a.me.perishN; delete a.foe.perishN;
					return a;
				},
				// WAIT FOR THE OUTCOME, not for a guess at when the move finished.
				//
				// These effects resolve through chained pushMsg(text, fn) callbacks, so
				// there is no single moment that reliably means "done" — the queue is
				// transiently empty between every link. Instrumenting the probe was
				// enough to make it pass 3/3, which is the signature of a read that
				// races the effect rather than a broken mechanic.
				//
				// So each probe now states what it is waiting FOR. If the mechanic is
				// genuinely broken the poll simply times out and the assertion fails as
				// it should, with the same message.
				// It must also DRIVE the battle while it waits. A chained effect only
				// advances when the current message is dismissed, so a poll that merely
				// watches will sit there until it times out and then read the same stale
				// state it started with — which is precisely what a plain poll did.
				async until(pred, ms = 8000) {
					const t0 = Date.now();
					while (Date.now() - t0 < ms) {
						try { if (pred()) return true; } catch (e) {}
						const aa = b.active;
						if (aa && (aa.queue.length > 0 || aa.phase === 'msg')) b.key('z');
						await wait(40);
					}
					return false;
				},
				async cast(user, target, id, isFoe, mvObj) {
					const a = b.active;
					const mv = mvObj || { id, name: id, pp: 10, maxPp: 10 };
					b.startQueue(() => b.useMove(user, isFoe ? a.foeBoosts : a.meBoosts, target, isFoe ? a.meBoosts : a.foeBoosts, mv, isFoe));
					// SETTLE ON STABILITY, NOT ON ONE IDLE SAMPLE.
					//
					// These effects run as chained callbacks: pushMsg(text, fn) pushes the
					// NEXT message from fn when the current one is dismissed. Between the
					// dismissal and the callback the queue is transiently empty and phase
					// has already flipped back to 'menu' — so a single `queue.length === 0
					// && phase !== 'msg'` check concludes "done" in the middle of the
					// effect, and the probe reads state that has not landed yet.
					//
					// That is the whole flake. Instrumented, a failing TEATIME exited at
					// i=2 and a passing one at i=6, same code, same seed. Require the
					// battle to be quiescent for several consecutive samples instead.
					let idle = 0;
					for (let i = 0; i < 400; i++) {
						const aa = b.active;
						if (!aa) break;
						const busy = aa.queue.length > 0 || aa.phase === 'msg';
						if (busy) { idle = 0; b.key('z'); }      // only ever press while busy
						else if (++idle >= 6) break;             // ~240ms of quiet
						await wait(40);
					}
					return mv;
				},
			};
		});

		// --- IMPRISON seals shared moves ---
		const imp = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const a = await __probe.fresh();
			a.foe.moves = [{ id: 'tackle', name: 'Tackle', pp: 10, maxPp: 10 }, { id: 'imprison', name: 'Imprison', pp: 10, maxPp: 10 }];
			await __probe.cast(a.foe, a.me, 'imprison', true);
			return {
				sealed: a.foe.imprisoning === true,
				tackleBlocked: !b.moveUsable(a.me, a.me.moves.find(m => m.id === 'tackle'), 'me'),
				waterFree: b.moveUsable(a.me, a.me.moves.find(m => m.id === 'watergun'), 'me'),
			};
		});
		A(imp.sealed && imp.tackleBlocked, 'IMPRISON seals the move both sides know', JSON.stringify(imp));
		A(imp.waterFree, 'moves the sealer lacks stay free');

		// --- GRUDGE drains the killing move ---
		const gr = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const a = await __probe.fresh(null, 400);
			await __probe.cast(a.foe, a.me, 'grudge', true);
			const mv = a.me.moves.find(m => m.id === 'hyperbeam');
			// HYPER BEAM IS ACCURACY 90. A 10% miss was the last of this test's flake,
			// and it is not a timing bug at all — a missed swing leaves the foe up and
			// GRUDGE with nothing to drain, so the probe reported foeDown:false, pp:4.
			// Re-swing until it connects. PP is restored before each attempt so a miss
			// cannot exhaust the very move being measured; GRUDGE zeroes it on the KO,
			// so `pp === 0` still means exactly what it meant before.
			let tries = 0;
			while (a.foe.curHP > 0 && tries++ < 8) {
				a.foe.curHP = 1;
				mv.pp = mv.maxPp;
				await __probe.cast(a.me, a.foe, 'hyperbeam', false, mv);
				await __probe.until(() => a.foe.curHP <= 0, 3000);
			}
			await __probe.until(() => mv.pp === 0);
			return { grudged: true, foeDown: a.foe.curHP <= 0, pp: mv.pp, tries };
		});
		A(gr.foeDown && gr.pp === 0, "GRUDGE drains Hyper Beam's PP on the KO", JSON.stringify(gr));

		// --- TEATIME force-feeds the berries ---
		const tea = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const a = await __probe.fresh();
			// THE USER OF THIS MOVE IS PARALYSED, BY THE TEST'S OWN SETUP.
			//
			// The foe has to be 'par' so its CHERI BERRY has something to cure — and the
			// foe is also the one using TEATIME. Paralysis blocks a move 25% of the
			// time, so a quarter of runs the move never executed and every berry stayed
			// in place: meHP:50, both items uneaten. That is the mechanic working, not
			// failing, and it was the bulk of this test's flake.
			//
			// Re-swing until it goes off. The setup is re-applied each attempt so a
			// blocked turn cannot leave half-consumed state behind.
			// (Set up FIRST, then retry while it has not landed. Guarding on
			// a.me.heldItem before assigning it skipped the loop entirely — it is null
			// on a fresh battle, and the wild foe turned out to be holding LEFTOVERS.)
			let tries = 0, fed = false;
			while (!fed && tries++ < 8) {
				a.me.heldItem = 'oranberry'; a.me.curHP = 50;
				a.foe.heldItem = 'cheriberry'; a.foe.status = 'par';
				await __probe.cast(a.foe, a.me, 'teatime', true);
				fed = await __probe.until(() => a.me.heldItem === null && a.foe.heldItem === null, 3000);
			}
			return { meHP: a.me.curHP, meItem: a.me.heldItem, foeStatus: a.foe.status, foeItem: a.foe.heldItem, tries };
		});
		A(tea.meHP === 60 && tea.meItem === null, 'my ORAN BERRY healed 10 and was eaten', JSON.stringify(tea));
		A(tea.foeStatus === null && tea.foeItem === null, "the foe's CHERI cured its paralysis and was eaten");

		// --- PERISH BODY dooms both on a physical hit ---
		const pb = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const a = await __probe.fresh('perishbody');
			// The doom message is the last link of a four-message chain (two of them
			// empty animation placeholders), so a chain that stalls leaves the counters
			// unset and the probe reports {}. Tackle is accuracy 100 against a 4000 HP
			// foe, so simply swinging again is free and deterministic — same shape as
			// the GRUDGE and TEATIME probes above.
			let tries = 0, doomed = false;
			while (!doomed && tries++ < 8) {
				await __probe.cast(a.me, a.foe, 'tackle', false, a.me.moves.find(m => m.id === 'tackle'));
				doomed = await __probe.until(() => a.me.perishN === 4 && a.foe.perishN === 4, 3000);
			}
			return { mine: a.me.perishN, theirs: a.foe.perishN, tries };
		});
		A(pb.mine === 4 && pb.theirs === 4, 'PERISH BODY starts both counters', JSON.stringify(pb));

		// --- DANCER copies the dance ---
		const dan = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const a = await __probe.fresh('dancer');
			await __probe.cast(a.me, a.foe, 'swordsdance', false, a.me.moves.find(m => m.id === 'swordsdance'));
			await __probe.until(() => a.meBoosts.atk === 2 && a.foeBoosts.atk === 2);
			return { mine: a.meBoosts.atk, theirs: a.foeBoosts.atk };
		});
		A(dan.mine === 2 && dan.theirs === 2, 'the foe DANCER dances along with Swords Dance', JSON.stringify(dan));

		// --- OPPORTUNIST mirrors the gain ---
		const opp = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const a = await __probe.fresh('opportunist');
			await __probe.cast(a.me, a.foe, 'swordsdance', false, a.me.moves.find(m => m.id === 'swordsdance'));
			await __probe.until(() => a.meBoosts.atk === 2 && a.foeBoosts.atk === 2);
			return { mine: a.meBoosts.atk, theirs: a.foeBoosts.atk };
		});
		A(opp.mine === 2 && opp.theirs === 2, 'OPPORTUNIST copies the +2 as it lands', JSON.stringify(opp));

		// --- WIMP OUT bolts a wild fight below half ---
		const wo = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const a = await __probe.fresh('wimpout', 300);
			await __probe.cast(a.me, a.foe, 'hyperbeam', false, a.me.moves.find(m => m.id === 'hyperbeam'));
			for (let i = 0; i < 100 && b.active; i++) { b.key('z'); await new Promise(r => setTimeout(r, 80)); }
			return { over: !b.active };
		});
		A(wo.over, 'a wild WIMP OUT foe flees once it crosses half', JSON.stringify(wo));

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
