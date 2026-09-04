// battlesparkle_test.mjs — Upscale 5 Batch 5: the small iconic battle beats.
// Player send-out ball throw + burst (mirrors the capture ball), the low-HP
// warning beep, the victory jingle, and the move-select speed-order + damage
// forecast hints. Boots the real battle engine and drives it, spying on the
// Audio constructor to prove the sounds fire.
// Standalone (headless Chrome + local overworld/data):
//   node overworld/tests/battlesparkle_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8881;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'sparkle', friendCode: 'SPSPSP', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await new Promise(r => setTimeout(r, 150)); } return false; }

(async () => {
	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	await new Promise(r => server.listen(PORT, r));
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	try {
		const page = await browser.newPage();
		await page.evaluateOnNewDocument(st => {
			// spy on every media playback (sound.js clones a cached Audio, so the
			// constructor only fires once per url — play() fires every time)
			window.__sfx = [];
			const proto = window.HTMLMediaElement.prototype;
			proto.play = function () { window.__sfx.push(this.src || this.currentSrc || ''); return Promise.resolve(); };
			localStorage.setItem('magepunk_mp_token_v1', 'sparkle');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'johto');
			localStorage.setItem('magepunk_name', 'GOLD');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'quilava', name: 'QUILAVA', level: 40, gender: 'M', ability: 'blaze', types: ['Fire'], ivs: { hp: 20, atk: 20, def: 20, spa: 20, spd: 20, spe: 20 }, stats: { hp: 120, atk: 80, def: 64, spa: 90, spd: 66, spe: 105 }, maxHP: 120, curHP: 120, exp: 64000, num: 156, sprite: 's4992.png', moves: [{ id: 'ember', name: 'Ember', pp: 25, maxPp: 25 }] }]));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.startWildBattle)), 30000);
		A(ready, 'overworld ready');
		if (!ready) throw new Error('no overworld');

		const out = await page.evaluate(async () => {
			const ow = window.__ow, B = ow.battle, o = {};
			const Bmod = await import('/overworld/battle.js');
			ow.party.length = 0;
			ow.party.push(Bmod.buildMon('jolteon', 40, B.data), Bmod.buildMon('snorlax', 40, B.data));

			// --- SEND-OUT ball throw: queued at battle open, mon hidden until burst ---
			ow.startWildBattle({ id: 'rattata', level: 8 });
			await new Promise(r => setTimeout(r, 500));
			const a = () => B.active;
			const kinds = a().queue.filter(e => e.anim).map(e => e.anim.kind);
			o.sendthrowQueued = kinds.includes('sendthrow') && kinds.includes('sendburst');
			o.hiddenAtStart = a().meHidden === true;
			// drain the whole opening (run fns + anim done callbacks)
			for (let i = 0; i < 200 && a() && a().phase !== 'menu'; i++) {
				const q = a().queue; if (q && q.length) { const e = q.shift(); e.fn?.(); e.anim?.done?.(); } await new Promise(r => setTimeout(r, 20));
			}
			o.revealedAfter = a().meHidden === false;

			// --- MOVE HINTS: damage forecast + speed order ---
			const me = a().me, foe = a().foe;
			me.stats = { ...me.stats, spe: 200 }; foe.stats = { ...foe.stats, spe: 20, hp: foe.maxHP, def: 40, spd: 40 };
			foe.maxHP = 60; foe.curHP = 60;
			const strong = { id: 'thunderbolt', name: 'Thunderbolt', pp: 15, maxPp: 15 };
			o.dmgHint = B.dmgHint(strong);               // expect a % or KO?
			o.speedFast = B.speedOrder(strong);          // me spe 200 vs 20 → FIRST
			o.speedPriority = B.speedOrder({ id: 'quickattack', name: 'Quick Attack', pp: 30, maxPp: 30 }); // priority → FIRST
			foe.stats.spe = 999;                          // now the foe outspeeds
			o.speedSlow = B.speedOrder(strong);          // → SECOND
			o.statusNoHint = B.dmgHint({ id: 'growl', name: 'Growl', pp: 40, maxPp: 40 }); // status → ''

			// --- LOW-HP beep: fires on a timer while the lead is in the red ---
			window.__sfx.length = 0;
			me.curHP = Math.floor(me.maxHP * 0.15);
			B.update(0.7); // dt > the 0.6 beep interval → one beep
			o.lowBeep1 = window.__sfx.some(s => /lowhp\.ogg/.test(s));
			B.update(0.7); // re-fires
			o.lowBeep2 = window.__sfx.filter(s => /lowhp\.ogg/.test(s)).length >= 2;
			// recovering silences it
			window.__sfx.length = 0;
			me.curHP = me.maxHP;
			B.update(0.7);
			o.noBeepWhenHealthy = !window.__sfx.some(s => /lowhp\.ogg/.test(s));

			// --- VICTORY jingle on a win ---
			window.__sfx.length = 0;
			B.finish('victory');
			o.victoryJingle = window.__sfx.some(s => /fanfare_victory\.ogg/.test(s));
			return o;
		});

		A(out.sendthrowQueued, 'the player send-out queues a ball throw + burst');
		A(out.hiddenAtStart, 'the player mon starts hidden (revealed by the throw)');
		A(out.revealedAfter, 'the mon is revealed once the send-out resolves');
		A(/KO\?|~\d+-\d+%/.test(out.dmgHint), 'the move menu shows a damage forecast', out.dmgHint);
		A(out.speedFast === 'FIRST', 'a faster mon is told it moves first', out.speedFast);
		A(out.speedPriority === 'FIRST', 'a priority move is told it moves first', out.speedPriority);
		A(out.speedSlow === 'SECOND', 'a slower mon is told the foe moves first', out.speedSlow);
		A(out.statusNoHint === '', 'a status move gets no damage forecast', JSON.stringify(out.statusNoHint));
		A(out.lowBeep1, 'the low-HP beep fires when the lead drops into the red');
		A(out.lowBeep2, 'the low-HP beep re-fires on its timer');
		A(out.noBeepWhenHealthy, 'the beep stops once the mon recovers');
		A(out.victoryJingle, 'a victory jingle plays on winning');
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
