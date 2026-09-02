// animations_test.mjs — move-animation archetypes (the last half of upscale
// Batch 3, built on user order).
//
// Every attack used to play the same lunge-plus-sparks. Moves now classify
// into archetypes: BEAM pours across the field, SHOT lobs a projectile,
// SLASH rakes the target (with the contact lunge), other specials flash a
// BURST, and plain physical contact keeps the classic lunge (STRIKE).
// Status moves animate for the first time: BOOST/HEAL sparkles rise off the
// caster, DEBUFF motes sink onto the victim. All of it respects the BATTLE
// ANIM speed setting, and the overlays draw over the sprites via drawMoveFx.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/animations_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- static ----------
{
	const bt = fs.readFileSync(path.join(ROOT, 'overworld/battle.js'), 'utf8');
	A(/function animArchFor/.test(bt) && /ANIM_BEAM/.test(bt) && /ANIM_SLASH/.test(bt) && /ANIM_SHOT/.test(bt),
		'the archetype classifier exists');
	A(/this\.drawMoveFx\(ctx, a, W, H, u\);/.test(bt), 'the overlay renderer draws right after the sprites');
	A(/sArch === 'debuff'/.test(bt), 'status moves animate too');
	A(/dur: Math\.max\(0\.01, dur \* k\)/.test(bt), 'every archetype rides the BATTLE ANIM speed setting');
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
	const PORT = 8954;
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
			localStorage.removeItem('magepunk_story');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		await page.evaluate(() => {
			window.__until = async (fn, ms = 10000) => {
				const t = Date.now();
				while (Date.now() - t < ms) { if (fn()) return true; await new Promise(r => setTimeout(r, 60)); }
				return fn();
			};
		});

		// one battle probes every archetype: fire the move, snapshot the anims it
		// queued BEFORE they play, then let the queue drain
		const kinds = await page.evaluate(async () => {
			const ow = window.__ow; const b = ow.battle;
			const done = new Promise(res => b.start(ow.party, 'sentret', 5, r => res(r)));
			for (let i = 0; i < 300; i++) { const a = b.active; if (a && (a.phase === 'choose' || a.phase === 'menu')) break; await new Promise(r => setTimeout(r, 60)); }
			const a = b.active;
			a.foe.maxHP = 9000; a.foe.curHP = 9000; a.foeShownHP = 9000;
			const drained = () => window.__until(() => a.queue.length === 0 && !a.fx);
			const realRandom = Math.random;
			const out = {};
			const probe = async (id, name) => {
				Math.random = () => 0.0001;   // never miss; the foe outlives everything
				let snap;
				b.startQueue(() => {
					b.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, { id, name, pp: 30 }, false, {});
					snap = a.queue.filter(x => x.anim).map(x => x.anim.kind);
				});
				Math.random = realRandom;
				await drained();
				return snap;
			};
			out.tackle = await probe('tackle', 'Tackle');
			out.icebeam = await probe('icebeam', 'Ice Beam');
			// (not Shadow Ball: Ghost vs the Normal-type target is immune and bails first)
			out.shot = await probe('energyball', 'Energy Ball');
			out.slash = await probe('slash', 'Slash');
			out.psychic = await probe('psychic', 'Psychic');
			out.swordsdance = await probe('swordsdance', 'Swords Dance');
			out.growl = await probe('growl', 'Growl');
			out.recover = await probe('recover', 'Recover');
			// the speed setting bites: 'off' collapses durations to a hair
			ow.Settings.set('battleAnim', 'off');
			let offSnap;
			b.startQueue(() => {
				b.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, { id: 'icebeam', name: 'Ice Beam', pp: 30 }, false, {});
				offSnap = a.queue.filter(x => x.anim).map(x => x.anim.dur);
			});
			await drained();
			ow.Settings.set('battleAnim', 'full');
			out.offDurs = offSnap;
			b.finish('ran'); await done;
			return out;
		});
		A(JSON.stringify(kinds.tackle) === '["lunge","hit"]', 'TACKLE keeps the classic lunge + hit', JSON.stringify(kinds.tackle));
		A(JSON.stringify(kinds.icebeam) === '["beam","hit"]', 'ICE BEAM pours a beam — no lunge', JSON.stringify(kinds.icebeam));
		A(JSON.stringify(kinds.shot) === '["shot","hit"]', 'ENERGY BALL lobs a projectile', JSON.stringify(kinds.shot));
		A(JSON.stringify(kinds.slash) === '["lunge","slash","hit"]', 'SLASH lunges in and rakes', JSON.stringify(kinds.slash));
		A(JSON.stringify(kinds.psychic) === '["burst","hit"]', 'PSYCHIC flashes a burst', JSON.stringify(kinds.psychic));
		A(JSON.stringify(kinds.swordsdance) === '["boost"]', 'SWORDS DANCE sparkles rise off the caster', JSON.stringify(kinds.swordsdance));
		A(JSON.stringify(kinds.growl) === '["debuff"]', 'GROWL washes over the victim', JSON.stringify(kinds.growl));
		A(JSON.stringify(kinds.recover) === '["heal"]', 'RECOVER glows green on the caster', JSON.stringify(kinds.recover));
		A(kinds.offDurs.every(d => d <= 0.02), "BATTLE ANIM 'off' collapses every archetype to a blink", JSON.stringify(kinds.offDurs));

		A(errors.length === 0, 'no uncaught page errors while every archetype played', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
