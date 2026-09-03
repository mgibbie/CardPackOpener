// venues2_test.mjs — Upscale 3 Batch 2: museum paintings, ruins inscriptions,
// the fossil loop, and New Mauville.
//
//   * a MASTER rank contest win commissions the Lilycove portrait; older
//     master ribbons on party mons backfill; frames narrate empty vs hung
//   * the ruins word rooms read their inscription and pay a one-time find
//   * Mirage Tower's fossil CHOICE: one taken, the other sinks — and
//     resurfaces in the Desert Underpass; the Fossil Maniac revives any
//     fossil into its Pokémon
//   * New Mauville: the generator one-shot, and the three disguised-VOLTORB
//     "item balls" that the parser was minting as junk pickups now ambush
//
//   node overworld/tests/venues2_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- source ----------
{
	const it = fs.readFileSync(path.join(ROOT, 'overworld/items.js'), 'utf8');
	A(/EventScript_Voltorb\\d\+\$/.test(it) && /ambushAt/.test(it), 'the Voltorb balls ambush instead of parsing as junk');
	A(/!b\.ambush && b\.tx === tx/.test(it), 'pickups skip ambush balls');
	const mn = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/st\.rank === 3/.test(mn) && /paintings\[st\.category\]/.test(mn), 'a MASTER win commissions the portrait');
	A(/GFX_FOSSIL/.test(fs.readFileSync(path.join(ROOT, 'overworld/npcs.js'), 'utf8')), 'FOSSIL props never render as villagers');
	A(/'magepunk_events_v1'/.test(fs.readFileSync(path.join(ROOT, 'site/owreset.js'), 'utf8')), 'the one-shot events join the save inventory');
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
	const PORT = 8991;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'pikachu', name: 'STARLET', level: 30, gender: 'F', friend: 70, types: ['Electric'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 90, atk: 60, def: 50, spa: 60, spd: 50, spe: 90 }, maxHP: 90, curHP: 90,
		exp: 27000, moves: [{ id: 'thunderbolt', name: 'Thunderbolt', pp: 15, maxPp: 15 }], sprite: 's25.png', num: 25,
		ribbons: ['cool-master'],
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
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=LilycoveCity_LilycoveMuseum_2F&x=10&y=10`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the museum boots');
		const closeDialog = async (key = 'x') => {
			for (let i = 0; i < 8 && await page.evaluate(() => window.__ow.dialog.blocking); i++) { await page.keyboard.press(key); await new Promise(r => setTimeout(r, 130)); }
		};

		// --- the master ribbon backfills into a hung portrait ---
		const mus = await page.evaluate(() => {
			const ow = window.__ow;
			const p = ow.player;
			p.tx = 2; p.ty = 7; p.px = 2 * 16; p.py = 7 * 16; p.facing = 'up'; // face the COOL frame
			ow.interact();
			const o = { asked: ow.dialog.blocking };
			o.painting = ow.contestProgress().paintings?.cool;
			try { ow.drawMuseum(document.createElement('canvas').getContext('2d'), 0, 0); o.drew = true; } catch (e) { o.drew = e.message; }
			return o;
		});
		A(mus.asked, 'a frame narrates on sight');
		A(mus.painting?.species === 'pikachu' && mus.painting?.name === 'STARLET', "STARLET's old master ribbon backfilled into the gallery", JSON.stringify(mus.painting));
		A(mus.drew === true, 'the hung portrait draws', String(mus.drew));
		await closeDialog();
		const cur = await page.evaluate(() => {
			const ow = window.__ow, p = ow.player;
			p.tx = 10; p.ty = 9; p.px = 10 * 16; p.py = 9 * 16; p.facing = 'up';
			ow.interact();
			return ow.dialog.blocking;
		});
		A(cur, 'the curator counts the collection');
		await closeDialog();

		// --- ruins word room: inscription + the one-time find ---
		const word = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('RuinsOfAlphKabutoWordRoom', 9, 4);
			const p = ow.player;
			p.tx = 8; p.ty = 2; p.px = 8 * 16; p.py = 2 * 16; p.facing = 'up';
			const before = ow.Bag.count('starpiece');
			ow.interact();
			return { got: ow.Bag.count('starpiece') - before, dialog: ow.dialog.blocking };
		});
		A(word.got === 1 && word.dialog, 'the inscription reads and pays its one-time STAR PIECE');
		await closeDialog();
		const word2 = await page.evaluate(() => {
			const ow = window.__ow;
			const before = ow.Bag.count('starpiece');
			ow.interact();
			return ow.Bag.count('starpiece') - before;
		});
		A(word2 === 0, 'the find never pays twice');
		await closeDialog();

		// --- the fossil loop: tower choice -> underpass -> revival ---
		const fossil = await page.evaluate(async () => {
			const ow = window.__ow;
			const o = {};
			await ow.moveToMap('DesertUnderpass', 130, 10);
			ow.fossilUnderpassTalk();
			o.early = ow.dialog.blocking; // won't budge before the tower choice
			return o;
		});
		A(fossil.early, 'the underpass fossil refuses before the tower choice');
		await closeDialog();
		const fossil2 = await page.evaluate(async () => {
			const ow = window.__ow;
			const o = {};
			ow.fossilPick('root');
			o.root = ow.Bag.count('rootfossil');
			o.mirage = ow.miscEvents().mirage;
			return o;
		});
		A(fossil2.root === 1 && fossil2.mirage === 'root', 'taking the ROOT FOSSIL sinks the other', JSON.stringify(fossil2));
		await closeDialog();
		const fossil3 = await page.evaluate(() => {
			const ow = window.__ow;
			ow.fossilUnderpassTalk();
			return { claw: ow.Bag.count('clawfossil'), again: ow.miscEvents().underpass };
		});
		A(fossil3.claw === 1 && fossil3.again === true, 'the sunken CLAW FOSSIL resurfaces in the underpass');
		await closeDialog();
		const revive = await page.evaluate(() => {
			const ow = window.__ow;
			const before = ow.party.length;
			ow.fossilManiacTalk();
			return { asked: ow.dialog.blocking, before };
		});
		A(revive.asked, 'the Fossil Maniac offers the revival');
		await closeDialog('z');
		const revived = await page.evaluate(() => ({
			n: window.__ow.party.length + Object.values(JSON.parse(localStorage.getItem('magepunk_box_v1') || '{}')).flat().length,
			fossilLeft: window.__ow.Bag.count('rootfossil') + window.__ow.Bag.count('clawfossil'),
			journal: window.__ow.Journal.list()[0]?.text || '',
		}));
		A(revived.fossilLeft === 1 && /revived/.test(revived.journal), 'one fossil woke as its Pokémon', JSON.stringify(revived));

		// --- New Mauville: the generator + a real ambush ---
		const gen = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('NewMauville_Inside', 33, 6);
			const before = ow.Bag.count('thunderstone');
			ow.generatorTalk();
			return { asked: ow.dialog.blocking, before };
		});
		A(gen.asked, 'the generator asks for the switch');
		await closeDialog('z');
		const gen2 = await page.evaluate(() => ({
			stone: window.__ow.Bag.count('thunderstone'),
			done: window.__ow.miscEvents().newmauville,
		}));
		A(gen2.stone >= 1 && gen2.done === true, 'the switch pays the THUNDERSTONE once', JSON.stringify(gen2));
		const amb = await page.evaluate(() => {
			const ow = window.__ow;
			const ball = ow.items.ambushAt(25, 18);
			const junk = ow.items.interactAt(25, 18); // the pickup path must ignore it
			return { ball: !!ball, species: ball?.ambush, junk };
		});
		A(amb.ball && amb.species === 'voltorb' && amb.junk === null, 'a disguised VOLTORB waits — and is no longer a junk pickup', JSON.stringify(amb));
		const sprung = await page.evaluate(async () => {
			const ow = window.__ow, p = ow.player;
			p.tx = 25; p.ty = 19; p.px = 25 * 16; p.py = 19 * 16; p.facing = 'up';
			ow.interact();
			return ow.dialog.blocking;
		});
		A(sprung, 'facing it springs the ambush');
		await closeDialog('z');
		for (let i = 0; i < 40 && !(await page.evaluate(() => window.__ow.battle.blocking)); i++) await new Promise(r => setTimeout(r, 200));
		const battle = await page.evaluate(() => ({
			blocking: window.__ow.battle.blocking,
			foe: window.__ow.battle.active?.foe?.speciesId,
			ballGone: !window.__ow.items.ambushAt(25, 18),
		}));
		A(battle.blocking && battle.foe === 'voltorb' && battle.ballGone, 'VOLTORB attacks and the ball never respawns', JSON.stringify(battle));
		await page.evaluate(async () => {
			const b = window.__ow.battle;
			for (let i = 0; i < 100; i++) { const a = b.active; if (a && (a.phase === 'menu' || a.phase === 'choose')) break; await new Promise(r => setTimeout(r, 100)); }
			if (b.active) {
				b.startQueue(() => b.tryRun());
				for (let i = 0; i < 150 && b.active; i++) await new Promise(r => setTimeout(r, 100));
			}
		});

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
