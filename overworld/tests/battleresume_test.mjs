// battleresume_test.mjs — leaving the overworld mid-battle must not lose the
// fight (the user broke their progression by hitting the gear during the
// intro rival battle: the win's flags never landed).
//
//   * while a resumable battle runs, a serializable snapshot + endSpec tag is
//     written every ~1.5s (and on pagehide); it is consumed at boot and the
//     battle rebuilds through the normal start paths — same foe, same HP,
//     same boosts and field, like resuming a dungeon run
//   * the endSpec dispatcher reconstructs the right ENDING: a resumed intro-
//     rival victory still runs afterRival (intro_done and friends land)
//   * saves already stranded (party in hand, intro_done never set) self-heal
//     at boot
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/battleresume_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- the wirings, in source ----------
{
	const bt = fs.readFileSync(path.join(ROOT, 'overworld/battle.js'), 'utf8');
	A(/snapshot\(\) \{/.test(bt) && /applyRestore\(snap\) \{/.test(bt), 'battle.js grows snapshot/applyRestore');
	A(/turns === Infinity \? 'inf'/.test(bt) && /'inf' \? Infinity/.test(bt), "endless map weather survives JSON (the Infinity trap)");
	A(/this\.endSpec = null;   \/\/ main\.js/.test(bt), 'a finished battle clears its resume tag');
	const main = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	for (const kind of ['wild', 'trainer', 'strainer', 'legendary', 'villain', 'rivaltier', 'rivalintro']) {
		A(new RegExp(`kind: '${kind}'`).test(main), `the '${kind}' ending is tagged and reconstructable`);
	}
	A(/battle\.endSpec = null;   \/\/ frontier/.test(main), 'frontier battles are never snapshotted');
	A(/addEventListener\('pagehide', \(\) => \{ battleSaveAt = 0; persistBattle\(\); \}\)/.test(main),
		'leaving the page flushes the snapshot immediately');
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
	const PORT = 8968;
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
		// seed ONCE — reloads must keep storage (that is the whole point here)
		await page.evaluateOnNewDocument((st, party) => {
			if (localStorage.getItem('magepunk_mp_token_v1')) return;
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'JOHTO');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		}, STATE, PARTY);
		const boot = async () => {
			await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
			const t0 = Date.now();
			while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		};
		await boot();
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		// ---------- 1. a wild battle survives a reload mid-fight ----------
		const before = await page.evaluate(async () => {
			const ow = window.__ow; const b = ow.battle;
			ow.startWildBattle({ id: 'sentret', level: 5 });
			for (let i = 0; i < 300; i++) { const a = b.active; if (a && (a.phase === 'choose' || a.phase === 'menu')) break; await new Promise(r => setTimeout(r, 60)); }
			const a = b.active;
			a.foe.maxHP = 400; a.foe.curHP = 313; a.foeShownHP = 313;   // mid-fight damage
			a.meBoosts.atk = 2;                                        // and a live boost
			await new Promise(r => setTimeout(r, 2200));               // let the tick write
			const saved = JSON.parse(localStorage.getItem('magepunk_battle_v1') || 'null');
			return { savedKind: saved?.end?.kind, savedHP: saved?.snap?.foe?.curHP, savedAtk: saved?.snap?.boosts?.me?.atk };
		});
		A(before.savedKind === 'wild' && before.savedHP === 313 && before.savedAtk === 2,
			'the running battle snapshots itself (foe HP + boosts included)', JSON.stringify(before));

		await boot();   // the "hit the gear and come back" moment
		const resumed = await page.evaluate(async () => {
			const ow = window.__ow; const b = ow.battle;
			for (let i = 0; i < 300; i++) { const a = b.active; if (a && (a.phase === 'choose' || a.phase === 'menu')) break; await new Promise(r => setTimeout(r, 80)); }
			const a = b.active;
			return a ? { species: a.foe.speciesId, hp: a.foe.curHP, max: a.foe.maxHP, atk: a.meBoosts.atk, spec: b.endSpec?.kind } : null;
		});
		A(resumed && resumed.species === 'sentret' && resumed.hp === 313 && resumed.max === 400 && resumed.atk === 2,
			'after the reload the SAME battle resumes — foe, HP and boosts intact', JSON.stringify(resumed));
		const cleaned = await page.evaluate(async () => {
			const ow = window.__ow; const b = ow.battle;
			b.startQueue(() => b.tryRun());
			for (let i = 0; i < 300 && b.active; i++) await new Promise(r => setTimeout(r, 60));
			await new Promise(r => setTimeout(r, 400));
			ow.persistBattle();
			return localStorage.getItem('magepunk_battle_v1');
		});
		A(cleaned === null, 'a finished battle clears its snapshot', String(cleaned));

		// ---------- 2. a resumed INTRO-RIVAL victory still lands the flags ----------
		const rival = await page.evaluate(async () => {
			const ow = window.__ow; const b = ow.battle;
			const story = JSON.parse(localStorage.getItem('magepunk_story'));
			delete story.flags.intro_done;
			localStorage.setItem('magepunk_story', JSON.stringify(story));
			// stage a live trainer battle, snapshot it, and stamp it as the intro rival
			const foe = JSON.parse(JSON.stringify(ow.party[0]));
			foe.name = 'RIVALMON'; foe.curHP = 77;
			b.endSpec = { kind: 'rivalintro', region: 'JOHTO' };
			b.startTrainer(ow.party, [foe], { displayName: 'RIVAL SILVER', defeatText: '', money: 40, boss: true }, () => {});
			for (let i = 0; i < 300; i++) { const a = b.active; if (a && (a.phase === 'choose' || a.phase === 'menu')) break; await new Promise(r => setTimeout(r, 60)); }
			const snap = b.snapshot();
			localStorage.setItem('magepunk_battle_v1', JSON.stringify({ v: 1, snap, end: b.endSpec, map: ow.world.current.name }));
			return { snapped: !!snap, foeHP: snap?.foes?.[0]?.curHP };
		});
		A(rival.snapped && rival.foeHP === 77, 'a trainer battle snapshots with its party intact', JSON.stringify(rival));

		await boot();
		const rivalDone = await page.evaluate(async () => {
			const ow = window.__ow; const b = ow.battle;
			for (let i = 0; i < 300; i++) { const a = b.active; if (a && (a.phase === 'choose' || a.phase === 'menu')) break; await new Promise(r => setTimeout(r, 80)); }
			const a = b.active;
			const out = { resumed: !!a, isTrainer: a?.isTrainer, foeHP: a?.foe?.curHP, introBefore: ow.Story.getFlag('intro_done') };
			b.finish('victory');
			for (let i = 0; i < 200 && b.active; i++) await new Promise(r => setTimeout(r, 60));
			await new Promise(r => setTimeout(r, 500));
			out.introAfter = ow.Story.getFlag('intro_done');
			return out;
		});
		A(rivalDone.resumed && rivalDone.isTrainer && rivalDone.foeHP === 77 && !rivalDone.introBefore,
			'the intro-rival battle resumes as a trainer battle', JSON.stringify(rivalDone));
		A(rivalDone.introAfter, "...and winning it still runs afterRival — intro_done LANDS", JSON.stringify(rivalDone));

		// ---------- 3. an already-stranded save self-heals at boot ----------
		await page.evaluate(() => {
			const story = JSON.parse(localStorage.getItem('magepunk_story'));
			delete story.flags.intro_done;
			localStorage.setItem('magepunk_story', JSON.stringify(story));
			localStorage.removeItem('magepunk_battle_v1');
		});
		await boot();
		const healed = await page.evaluate(() => window.__ow.Story.getFlag('intro_done'));
		A(healed, 'a save stranded with a party but no intro_done heals itself at boot');

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
