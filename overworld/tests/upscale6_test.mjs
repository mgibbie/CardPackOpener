// upscale6_test.mjs — Upscale Batch 6: deep cuts (the tractable subset).
//
//   * TRUE EGG MOVES: inheritance only passed moves the baby could learn ANYWAY
//     (canLearn gated everything), so breeding-exclusive moves were impossible.
//     gen_egg_moves.mjs harvests pokeemerald's egg_moves.h; applyInheritance
//     lets a listed move bypass the canLearn gate.
//   * WIDE/QUICK GUARD were personal-Protect aliases. They are SIDE guards now:
//     Quick Guard walls priority moves, Wide Guard walls spread moves, one turn,
//     whole side, cleared at the top of every turn.
//   * FUTURE SIGHT / DOOM DESIRE dealt a flat 35% of max HP — typeless. Typed
//     now (Psychic/Steel) off the caster's snapshotted SpA: Dark shrugs off a
//     foreseen Psychic hit, Fighting takes it double.
//   * EARTHQUAKE's family (ALL_ADJACENT) hits the user's own partner in doubles
//     — and TELEPATHY finally has a job: the partner sidesteps the blast.
//   * PC BOX SEARCH (F / the FIND button): query by name, species, exact type,
//     or "shiny", across ALL boxes; withdraw/release act on the real mon.
//
// Consciously skipped (recorded in the plan): Safari zone mechanic, Game
// Corner, cries/exp-curve asset cluster, and all of Batch 3 (user call).
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/upscale6_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- static ----------
{
	const eggs = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/egg_moves.json'), 'utf8'));
	A(Object.keys(eggs).length > 150, `${Object.keys(eggs).length} species carry true egg-move lists`);
	A(eggs.charmander?.includes('dragondance'), 'Charmander can hatch with DRAGON DANCE', JSON.stringify(eggs.charmander));
	A(eggs.squirtle?.includes('mirrorcoat'), 'Squirtle can hatch with MIRROR COAT', JSON.stringify(eggs.squirtle));

	const bt = fs.readFileSync(path.join(ROOT, 'overworld/battle.js'), 'utf8');
	A((bt.match(/a\.meSide\.quickGuard = a\.meSide\.wideGuard = a\.foeSide\.quickGuard = a\.foeSide\.wideGuard = false;/g) || []).length === 2,
		'both turn resolvers clear the side guards each turn — the handler comment is a kept promise');
	A(/ALL_ADJACENT/.test(bt) && /victims\.push\(partner\)/.test(bt) && /'telepathy'\) victims\.push|!== 'telepathy'\) victims\.push/.test(bt),
		"EARTHQUAKE's family hits the user's partner in doubles — unless the partner has TELEPATHY");
	A(/doomdesire' \? 'Steel' : 'Psychic'/.test(bt), 'DOOM DESIRE arrives as Steel, FUTURE SIGHT as Psychic');

	const main = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/function pcMatches/.test(main) && /pcnav:find/.test(main) && /if \(k === 'f'\) \{ pcPromptSearch\(\)/.test(main),
		'the PC storage grows a search (F key + FIND button)');
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
	const PORT = 8944;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 120, atk: 90, def: 90, spa: 90, spd: 90, spe: 90 }, maxHP: 120, curHP: 120,
		exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
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

		await page.evaluate(() => {
			window.__waitIdle = async () => {
				const b = window.__ow.battle;
				for (let i = 0; i < 300; i++) {
					const a = b.active;
					if (a && a.phase === 'choose') return true;
					await new Promise(r => setTimeout(r, 60));
				}
				return false;
			};
			// the battle queue self-plays; poll a condition until it lands
			window.__until = async (fn, ms = 8000) => {
				const t = Date.now();
				while (Date.now() - t < ms) { if (fn()) return true; await new Promise(r => setTimeout(r, 60)); }
				return fn();
			};
		});

		// ---------- the side guards, in one battle ----------
		const guard = await page.evaluate(async () => {
			const ow = window.__ow; const b = ow.battle;
			const done = new Promise(res => b.start(ow.party, 'sentret', 5, r => res(r)));
			await window.__waitIdle();
			const a = b.active;
			const out = {};
			// fatten the foe FIRST: a lv-40 tackle one-shots a lv-5 sentret, and a
			// mid-test KO drops the battle into faint handling and stalls the queue.
			// shownHP jumps with it so the settled gate never waits on a bar crawl.
			a.foe.maxHP = 500; a.foe.curHP = 500; a.foeShownHP = 500; a.foe.stats.spd = 100;
			const drained = () => window.__until(() => a.queue.length === 0 && !a.fx);
			// the foe casts QUICK GUARD — its SIDE flag raises (no protectedTurn)
			b.startQueue(() => b.useMove(a.foe, a.foeBoosts, a.foe, a.foeBoosts, { id: 'quickguard', name: 'Quick Guard', pp: 15 }, true, {}));
			out.flagUp = await window.__until(() => a.foeSide.quickGuard === true);
			out.notPersonal = !a.foe.protectedTurn;
			await drained();
			// a PRIORITY move breaks on the guard...
			b.startQueue(() => b.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, { id: 'quickattack', name: 'Quick Attack', pp: 30 }, false, {}));
			await drained();
			out.priorityBlocked = a.foe.curHP === 500;
			// ...but a normal move walks straight through the same guard
			b.startQueue(() => b.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, { id: 'tackle', name: 'Tackle', pp: 35 }, false, {}));
			out.normalLands = await window.__until(() => a.foe.curHP < 500);
			await drained();
			// WIDE GUARD on my side walls a SPREAD hit, not a single-target one
			a.meSide.wideGuard = true;
			const meHP = a.me.curHP;
			b.startQueue(() => b.useMove(a.foe, a.foeBoosts, a.me, a.meBoosts, { id: 'tackle', name: 'Tackle', pp: 35 }, true, { spread: true }));
			await drained();
			out.spreadBlocked = a.me.curHP === meHP;
			b.startQueue(() => b.useMove(a.foe, a.foeBoosts, a.me, a.meBoosts, { id: 'tackle', name: 'Tackle', pp: 35 }, true, { spread: false }));
			out.singleLands = await window.__until(() => a.me.curHP < meHP);
			await drained();
			// ---------- FUTURE SIGHT arrives typed, same battle ----------
			// a DARK foe shrugs the foreseen Psychic hit off entirely
			const snap = () => ({ move: 'futuresight', name: 'FUTURE SIGHT', turns: 1, user: { stats: { spa: 200 }, types: ['Psychic'] }, level: 50 });
			a.foe.types = ['Dark'];
			a.foe.curHP = 500; a.foeShownHP = 500;
			a.foeFuture = snap();
			b.startQueue(() => b.endOfTurn());
			// the fail path has no HP callback: once the countdown consumed the
			// snapshot (synchronously inside endOfTurn), HP can no longer move
			await window.__until(() => a.foeFuture === null);
			await drained();
			out.darkUntouched = a.foe.curHP === 500;
			// a FIGHTING foe takes the full snapshot-computed STAB'd double hit
			a.foe.types = ['Fighting'];
			a.foe.curHP = 500; a.foeShownHP = 500;
			a.foeFuture = snap();
			b.startQueue(() => b.endOfTurn());
			await window.__until(() => a.foe.curHP < 500);
			// expected: floor(floor(floor(22*120*200/100)/50)+2) = 107 base, *1.5 STAB *2 eff = 321
			out.hitFor = 500 - a.foe.curHP;
			await drained();
			b.finish('ran'); await done;
			return out;
		});
		A(guard.flagUp && guard.notPersonal, "QUICK GUARD raises a SIDE flag, not the caster's personal Protect", JSON.stringify(guard));
		A(guard.priorityBlocked, '...and a priority move breaks on it', JSON.stringify(guard));
		A(guard.normalLands, '...while a normal-priority move walks through', JSON.stringify(guard));
		A(guard.spreadBlocked, 'WIDE GUARD walls a spread hit', JSON.stringify(guard));
		A(guard.singleLands, '...but not a single-target one', JSON.stringify(guard));
		A(guard.darkUntouched, 'a DARK foe is immune to the foreseen Psychic FUTURE SIGHT', JSON.stringify(guard));
		A(guard.hitFor === 321, 'a FIGHTING foe takes the snapshot-computed 321 (STAB + double)', JSON.stringify(guard));

		// ---------- true egg moves cross the canLearn gate ----------
		const egg = await page.evaluate(async () => {
			const ow = window.__ow;
			const DC = await import('./daycare.js');
			const data = ow.battle.data;
			const baby = { speciesId: 'charmander', level: 5, gender: 'M', nature: 'adamant', types: ['Fire'],
				ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
				moves: [{ id: 'scratch', name: 'Scratch', pp: 35, maxPp: 35 }] };
			// canLearn says NO to everything: only the true egg list can let a move in
			DC.applyInheritance(baby, { ivs: { atk: 31 }, nature: null, fatherMoves: ['dragondance', 'hyperbeam'], shinyBoost: 2 }, data, () => false);
			return { moves: baby.moves.map(m => m.id), loaded: !!data.eggMoves?.charmander?.includes('dragondance'), atk: baby.ivs.atk, hasStats: !!baby.stats };
		});
		A(egg.loaded, 'battle.init serves the egg-move lists to the daycare');
		A(egg.moves.includes('dragondance'), 'DRAGON DANCE crosses into a Charmander egg though canLearn says no', JSON.stringify(egg.moves));
		A(!egg.moves.includes('hyperbeam'), 'a non-egg, non-learnable move still cannot cross', JSON.stringify(egg.moves));
		A(egg.atk === 31 && egg.hasStats, 'IVs fold in and stats recompute as before', JSON.stringify(egg));

		// ---------- PC box search finds the needle and pulls the RIGHT mon ----------
		const pc = await page.evaluate(async () => {
			const ow = window.__ow;
			const mk = (speciesId, name, num, types) => ({ speciesId, name, num, level: 5, types,
				ivs: {}, stats: { hp: 20 }, maxHP: 20, curHP: 20, moves: [] });
			const box = [];
			for (let i = 0; i < 40; i++) box.push(mk('rattata', 'RATTATA', 19, ['Normal']));
			box.push(mk('dratini', 'DRATINI', 147, ['Dragon']));   // buried in box 2
			localStorage.setItem('magepunk_box_v1', JSON.stringify(box));
			const pm = ow.pcMenu;
			pm.open = true; pm.side = 1; pm.idx = 0; pm.box = 0; pm.filter = null; pm.confirm = null;
			window.prompt = () => 'dratini';
			dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
			const filtered = pm.filter;
			const partyBefore = ow.party.length;
			dispatchEvent(new KeyboardEvent('keydown', { key: 'z' }));   // withdraw the single hit
			const got = ow.party[ow.party.length - 1]?.speciesId;
			const left = JSON.parse(localStorage.getItem('magepunk_box_v1')).length;
			const grew = ow.party.length === partyBefore + 1;
			pm.open = false; pm.filter = null;
			localStorage.removeItem('magepunk_box_v1');
			return { filtered, got, left, grew };
		});
		A(pc.filtered === 'dratini', 'F opens the search prompt and sets the filter', JSON.stringify(pc));
		A(pc.grew && pc.got === 'dratini' && pc.left === 40,
			'withdrawing the hit pulls the REAL DRATINI from box 2, not slot 0 of box 1', JSON.stringify(pc));

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
