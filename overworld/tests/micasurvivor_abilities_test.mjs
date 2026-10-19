// micasurvivor_abilities_test.mjs — MicaSurvivor M5 batch 2 ("Abilities"): the 54 passive abilities of
// the Godot Android port by JayElDragon (poke-survivor: abilities.gd + its hooks in main.gd), one per
// Pokémon, driven headlessly in a real run (window.G is global; the run is paused and stepped by hand):
//   - data: 54 abilities, every one of the 1007 Pokémon (966 + batch B1's 17 + batch B1b's 24) has one (the port's per-dex table), every
//     `fx` key is handled, and every ability measurably changes something (no silent no-ops)
//   - each family with the port's numbers: Blaze/Torrent/Overgrow/Swarm +35 % below 40 % HP; flat
//     damage / speed / XP / coins / crit / magnet / cooldown / regen / damage taken; weather speed
//     (+30 % in its weather only); contact effects at their chance (Static 25 % paralysis, Flame
//     Body burn, Poison Point poison, Cute Charm confusion, Effect Spore 20 % sleep) through the
//     real contact loop; Rough Skin 12 + 3 x level; type halving (Thick Fat, Water/Volt Absorb...);
//     Solid Rock -25 % super effective; Multiscale half damage on the first hit every 25 s; Sturdy
//     survives a lethal hit once per 90 s; Defiant +15 % for 4 s; Moxie +2 % per 40 kills (max
//     +20 %); Tinted Lens +40 % not-very-effective; Mold Breaker +10 % bosses; Iron Fist / Mega
//     Launcher by move kind (also through real casts); Adaptability; Drought & co; Levitate vs map
//     traps; Sand Veil & co vs weather chip; Inner Focus / Limber status immunity (the hook)
//   - G.Abilities.set swaps an ability cleanly (what team mode will call)
//   - shown: HUD chip, Pokédex detail, the partner card, the personality result, the starter
//     choice and the pause screen; all in English
// Screenshots go to MICASURVIVOR_SHOTS=<dir> when set.
// Covers micasurvivor/js/systems/abilities.js, entities/player.js, systems/combat.js,
// systems/weather.js, systems/interact.js, ui/hud.js, ui/ui.js, ui/menu.js, ui/test.js, ui/run-ui.js,
// data/lang-en.js, css/style.css, index.html.
//   node overworld/tests/micasurvivor_abilities_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8828;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
	const visible = (id) => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
	const shot = async (name, clip) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name), ...(clip ? { clip } : {}) }); } };
	const E = (fn, ...a) => page.evaluate(fn, ...a);
	const text = sel => E(sel => { const el = document.querySelector(sel); return el ? el.innerText.replace(/\s+/g, ' ').trim() : null; }, sel);

	// ---------- boot -> guest -> personality test -> result (ability shown) -> starters (shown) -> menu
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden')), 30000), 'boots', errors.slice(0, 3).join(' | '));
	await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
	await waitFor(() => visible('scr-login'), 10000);
	await page.click('#btn-guest');
	await waitFor(() => visible('scr-test'), 8000);
	for (let i = 0; i < 40 && await visible('scr-test'); i++) { await E(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(100); }
	A(await waitFor(() => visible('scr-result'), 8000), 'personality result');
	{
		const want = await E(() => { const dex = G.DEX.find(m => m.name === document.getElementById('res-name').textContent).dex; const a = G.Abilities.def(G.Abilities.of(dex)); return { name: G.I18n.t(a.name), desc: G.I18n.t(a.desc) }; });
		const got = await text('#res-ability');
		A(got && got.includes('Ability: ' + want.name) && got.includes(want.desc), `the result screen shows the partner's ability ("${got}")`, JSON.stringify(want));
		await page.click('#res-other');
		await waitFor(() => visible('scr-starters'), 5000);
		await E(() => {
			const cells = [...document.querySelectorAll('#starter-grid .cell')];
			const i = G.STARTERS.findIndex(s => s.dex === 4);   // Charmander: Blaze
			cells[i].click();
		});
		await sleep(300);   // the English pass runs on the DOM change (MutationObserver)
		const r = { info: await text('#starter-info') };
		A(/Ability: Blaze/.test(r.info) && /Below 40% HP, your Fire moves deal \+35% damage\./.test(r.info), `the starter choice shows the ability (Charmander: "${r.info}")`);
		await shot('starters_ability.png');
		await page.click('#starter-ok');
	}
	A(await waitFor(() => visible('scr-menu'), 10000), 'main menu');
	await sleep(400);
	{
		const partner = await E(() => G.DB.save.partner);
		const got = await text('#menu-partner-info .ability');
		A(partner === 4 && got === 'Ability: Blaze', `the main-menu partner card shows the ability ("${got}")`, partner);
		const title = await E(() => document.querySelector('#menu-partner-info .ability').title);
		A(title === 'Below 40% HP, your Fire moves deal +35% damage.', 'its tooltip is the description, in English', title);
	}

	// ---------- Pokédex detail
	{
		await E(() => document.querySelector('#scr-menu [data-go=dex]').click());
		await waitFor(() => visible('scr-dex'), 5000);
		await sleep(500);
		const got = await text('#dex-detail .ability');
		A(got === 'Ability: Blaze Below 40% HP, your Fire moves deal +35% damage.', `the Pokédex detail shows the ability and what it does ("${got}")`);
		await shot('pokedex_ability.png');
		const el = await page.$('#dex-detail');
		if (SHOTS && el) await el.screenshot({ path: path.join(SHOTS, 'pokedex_detail.png') });
		await E(() => { const b = document.querySelector('#scr-dex [data-back]'); if (b) b.click(); });
		await sleep(300);
		if (!(await visible('scr-menu'))) await page.keyboard.press('Escape');
		await waitFor(() => visible('scr-menu'), 5000);
	}

	// ---------- run
	await page.click('#scr-menu [data-go=play]');
	A(await waitFor(() => E(() => G.Game.state === 'playing'), 15000), 'run starts');
	await sleep(1200);
	A(await E(() => G.Game.player.ability) === 'blaze', 'the run player has its Pokémon\'s ability (Charmander -> blaze)');
	{
		// HUD: the chip is drawn (record the canvas text) — screenshot of the panel
		const drawn = await E(async () => {
			const seen = [];
			const P = CanvasRenderingContext2D.prototype, f = P.fillText;
			P.fillText = function (t, ...a) { seen.push(String(t)); return f.call(this, t, ...a); };
			await new Promise(r => setTimeout(r, 400));
			P.fillText = f;
			return seen;
		});
		A(drawn.includes('Blaze') && drawn.includes('✦'), 'the HUD draws the ability chip ("✦ Blaze") next to the HP bar', JSON.stringify([...new Set(drawn)].slice(0, 30)));
		await shot('hud_ability.png');
		await shot('hud_ability_zoom.png', { x: 0, y: 0, width: 420, height: 120 });
	}

	// pause the run: from here the test steps the world by hand
	await E(() => {
		G.Game.togglePause();
		const pl = G.Game.player;
		G.EnemyMgr.clear(); G.Projectiles.clear(); G.Combat.clearFields();
		window.T = {
			mk(dex, dx, dy, o = {}) {
				const pl = G.Game.player;
				const def = { dex, name: 'T' + dex, hp: o.hp || 100000, spd: o.spd || 40, dmg: o.dmg || 10, xp: 1, behavior: o.behavior || 'chaser' };
				const e = new G.Enemy(def, pl.x + dx, pl.y + dy, { hp: 1, spd: 1, dmg: 1 }, !!o.boss);
				e.flying = true;
				G.EnemyMgr.add(e); G.EnemyMgr.rebuildGrid();
				return e;
			},
			reset() { G.EnemyMgr.clear(); G.Projectiles.clear(); G.Combat.clearFields(); G.EnemyMgr.rebuildGrid(); },
			only(id, lvl = 1) {
				const pl = G.Game.player;
				G.Projectiles.clearOrbs(pl);
				const m = G.Moves.instance(id, lvl);
				pl.moves = [m]; pl.slots = [[m]]; pl.active = 0;
				return m;
			},
			// a clean player: no defence, buffs, items, weather; big HP; a ranged move (melee takes 25 % less)
			clean() {
				const pl = G.Game.player;
				pl.dmgReduce = 0; for (const k in pl.buffs) pl.buffs[k].n = 0;
				if (pl.item) pl.equip(null);
				if (pl.power) { pl.power.def.off(pl); pl.power = null; }
				pl.slowT = 0; pl.inLiquid = false; pl.kills = 0;
				G.Weather.clear();
				T.only('ember');
				pl.dead = false; pl.maxHp = 100000; pl.hp = pl.maxHp; pl.invuln = 0;
				return pl;
			},
			ab(id) {
				const pl = T.clean();
				G.Abilities.set(pl, id);
				pl.abT = 1000; pl.abFirstT = -999; pl.abSturdyT = -999; pl.defiantT = 0;
				return pl;
			},
			hurt(amount, type = null, pure = false) { const pl = G.Game.player; pl.invuln = 0; const h = pl.hp; pl.hurt(amount, type, pure); return h - pl.hp; },
			withRandom(v, fn) { const R = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = R; } },
			weather(kind) { G.Weather.clear(); if (kind) { G.Weather.force(kind, 60); G.Weather.update(4, 0, null); } },
		};
	});
	A(await E(() => G.Game.state) === 'paused', 'run paused for stepping');

	// ================= 1. data: every Pokémon, every ability, nothing silent =================
	{
		const r = await E(() => {
			const A = G.Abilities;
			const ids = Object.keys(A.FX);
			const noAb = G.DEX.filter(m => !A.BY_DEX[m.dex] || !A.FX[A.BY_DEX[m.dex]]).map(m => m.dex);
			const keys = new Set(); for (const id of ids) for (const k in A.FX[id].fx) keys.add(k);
			const unhandled = [...keys].filter(k => !A.HANDLED.includes(k));
			const used = new Set(Object.values(A.BY_DEX));
			const sample = { 1: A.of(1), 4: A.of(4), 7: A.of(7), 25: A.of(25), 143: A.of(143), 292: A.of(292), 792: A.of(792), 800: A.of(800), 1024: A.of(1024) };
			return { n: ids.length, dex: G.DEX.length, noAb, unhandled, unused: ids.filter(i => !used.has(i)), sample };
		});
		A(r.n === 54, `54 abilities (${r.n})`);
		A(r.dex === 1007 && r.noAb.length === 0, `every one of the ${r.dex} Pokémon has a defined ability`, JSON.stringify(r.noAb.slice(0, 20)));
		A(r.unhandled.length === 0, 'every fx key of the port is handled', JSON.stringify(r.unhandled));
		A(JSON.stringify(r.sample) === JSON.stringify({ 1: 'overgrow', 4: 'blaze', 7: 'torrent', 25: 'static', 143: 'limber', 292: 'wonderguard', 792: 'multiscale', 800: 'solidrock', 1024: 'protean' }),
			'the port\'s per-dex table (Bulbasaur Overgrow, Pikachu Static, Snorlax Limber, Shedinja Wonder Guard, Lunala Multiscale, Necrozma Solid Rock...)', JSON.stringify(r.sample));

		// every ability changes something measurable vs a player with no ability at all
		const s = await E(() => {
			const TY = Object.keys(G.Types.CHART), KINDS = ['melee', 'projectile', 'beam', 'orbit', 'aura'];
			const sig = (id, bare) => {
				const pl = T.ab('protean');
				if (!bare) G.Abilities.set(pl, id);
				if (bare) pl.abFx = {};
				pl.abT = 1000; pl.abFirstT = -999; pl.abSturdyT = -999; pl.defiantT = 0;
				const fx = pl.abFx || {};
				const o = {};
				pl.kills = 400;
				o.atk = pl.atk; o.spd = pl.spd; o.red = pl.reduction; o.regen = pl.regen;
				o.cd = pl.cdMul; o.mag = pl.magnet; o.xp = pl.xpMul; o.coin = pl.coinMul; o.crit = pl.critChance;
				if (fx.wspd) { T.weather(fx.wspd); o.wspd = pl.spd; T.weather(null); }
				pl.hp = pl.maxHp * 0.3;
				o.out = [];
				for (const t of TY) for (const k of KINDS) for (const e of [{ boss: false, types: ['normal'] }, { boss: true, types: ['water'] }]) o.out.push(G.Abilities.outK(pl, e, t, k));
				o.in = [];
				for (const t of TY) for (const eff of [null, 'super']) { pl.abFirstT = -999; o.in.push(G.Abilities.inK(pl, t, eff)); }
				o.def = pl.defiantT;
				pl.hp = 0; o.sturdy = G.Abilities.sturdy(pl);
				pl.hp = pl.maxHp;
				const e = T.mk(19, 300, 0); const h0 = e.hp;
				T.withRandom(0, () => G.Abilities.contact(pl, e));
				o.contact = [h0 - e.hp, e.burn, e.poison, e.paraT, e.confT, e.sleepT, e.frozenT];
				o.imm = [G.Abilities.trapImmune(pl), G.Abilities.weatherImmune(pl), ...['sleep', 'conf', 'para', 'freeze'].map(k => G.Abilities.statusImmune(pl, k))];
				T.reset();
				return JSON.stringify(o);
			};
			const base = sig('protean', true);
			const same = Object.keys(G.Abilities.FX).filter(id => sig(id, false) === base);
			T.ab('blaze');
			return { same };
		});
		A(s.same.length === 0, 'all 54 abilities change something measurable (none is a silent no-op)', JSON.stringify(s.same));
	}

	// ================= 2. pinch: Blaze / Torrent / Overgrow / Swarm =================
	{
		const r = await E(() => {
			const pl = T.ab('blaze');
			const e = T.mk(19, 300, 0);   // Rattata (normal): neutral to fire
			const hit = (type) => G.Combat.land(e, 100, '#fff', 1, 0, 0, { type, kind: 'projectile' }, false, pl);
			const base = G.Combat.land(e, 100, '#fff', 1, 0, 0, { type: 'fire', kind: 'projectile' }, false, null);
			pl.hp = pl.maxHp * 0.39; const low = hit('fire'), lowWater = hit('water');
			pl.hp = pl.maxHp * 0.41; const high = hit('fire');
			const out = { low: low / base, lowWater: lowWater / base, high: high / base };
			for (const [id, t] of [['torrent', 'water'], ['overgrow', 'grass'], ['swarm', 'bug']]) {
				T.ab(id); pl.hp = pl.maxHp * 0.3;
				out[id] = [G.Abilities.outK(pl, { types: ['normal'] }, t, 'melee'), G.Abilities.outK(pl, { types: ['normal'] }, 'fire', 'melee')];
				pl.hp = pl.maxHp; out[id].push(G.Abilities.outK(pl, { types: ['normal'] }, t, 'melee'));
			}
			T.reset();
			return out;
		});
		A(near(r.low, 1.35, 1e-9) && near(r.high, 1, 1e-9) && near(r.lowWater, 1, 0.2) && r.lowWater < 1.01, `Blaze: fire hits x1.35 below 40% HP (x${r.low.toFixed(3)}), x1 at 41% (x${r.high.toFixed(3)}), other types unchanged`, JSON.stringify(r));
		for (const id of ['torrent', 'overgrow', 'swarm']) A(JSON.stringify(r[id]) === '[1.35,1,1]', `${id}: its type x1.35 below 40%, other types x1, x1 at full HP`, JSON.stringify(r[id]));
	}

	// ================= 3. flat stats =================
	{
		const r = await E(() => {
			const st = id => { const pl = T.ab(id); return { atk: pl.atk, spd: pl.spd, cd: pl.cdMul, mag: pl.magnet, xp: pl.xpMul, coin: pl.coinMul, crit: pl.critChance, red: pl.reduction, regen: pl.regen }; };
			const pl = T.ab('protean'); pl.abFx = {};
			const b = { atk: pl.atk, spd: pl.spd, regen: pl.regen };
			G.Abilities.set(pl, 'blaze');
			const p0 = st('blaze');
			const out = {};
			for (const id of ['hugepower', 'technician', 'guts', 'moldbreaker', 'protean', 'speedboost', 'runaway', 'earlybird', 'pickup', 'luck', 'compoundeyes', 'magnetpull',
				'prankster', 'intimidate', 'battlearmor', 'furcoat', 'wonderguard', 'regenerator']) {
				const s = st(id);
				out[id] = { atk: s.atk / b.atk, spd: s.spd / b.spd, cd: s.cd / p0.cd, mag: s.mag / p0.mag, xp: s.xp / p0.xp, coin: s.coin / p0.coin, crit: s.crit - p0.crit, red: s.red - p0.red, regen: (s.regen - b.regen) / 100000 };
			}
			// back to blaze: every static multiplier is undone exactly (team mode swaps abilities)
			const back = st('blaze');
			out.restored = ['cd', 'mag', 'xp', 'coin', 'crit'].every(k => Math.abs(back[k] - p0[k]) < 1e-12);
			// the player's damage reduction is capped at 80 %
			const pw = T.ab('wonderguard'); pw.dmgReduce = 0.7; out.cap = pw.reduction; pw.dmgReduce = 0;
			T.ab('blaze');
			return out;
		});
		const W = {
			hugepower: { atk: 1.25 }, technician: { atk: 1.1 }, guts: { atk: 1.12, red: 0.04 }, moldbreaker: { atk: 1.06 }, protean: { atk: 1.08, spd: 1.04 },
			speedboost: { spd: 1.12 }, runaway: { spd: 1.08, xp: 1.05 }, earlybird: { xp: 1.12 }, pickup: { coin: 1.2 }, luck: { crit: 0.08, coin: 1.1 },
			compoundeyes: { crit: 0.1 }, magnetpull: { mag: 1.4 }, prankster: { cd: 0.9 }, intimidate: { red: 0.1 }, battlearmor: { red: 0.08 },
			furcoat: { red: 0.12 }, wonderguard: { red: 0.35 }, regenerator: { regen: 0.01 },
		};
		const DEF = { atk: 1, spd: 1, cd: 1, mag: 1, xp: 1, coin: 1, crit: 0, red: 0, regen: 0 };
		for (const id in W) {
			const want = Object.assign({}, DEF, W[id]);
			const ok = Object.keys(want).every(k => near(r[id][k], want[k], 1e-9));
			A(ok, `${id}: ${Object.entries(W[id]).map(([k, v]) => k + (k === 'crit' || k === 'red' || k === 'regen' ? ' +' : ' x') + v).join(', ')}`, JSON.stringify(r[id]));
		}
		A(r.restored, 'swapping the ability back undoes cooldown / magnet / XP / coin / crit exactly (team-mode switch)');
		A(near(r.cap, 0.8), `damage reduction still caps at 80% (defence 70% + Wonder Guard 35% -> ${r.cap})`);
	}

	// ================= 4. weather speed + weather immunity =================
	{
		const r = await E(() => {
			const out = {};
			for (const [id, w] of [['swiftswim', 'rain'], ['chlorophyll', 'sun'], ['sandrush', 'sand'], ['slushrush', 'snow']]) {
				const pl = T.ab(id);
				const bare = () => { const fx = pl.abFx; pl.abFx = {}; const v = pl.spd; pl.abFx = fx; return v; };
				T.weather(w); const inW = pl.spd, bareIn = bare();
				T.weather(w === 'rain' ? 'sun' : 'rain'); const other = pl.spd, bareOther = bare();
				// fading in: intensity 0.5 or less doesn't count yet
				G.Weather.clear(); G.Weather.force(w, 60); G.Weather.update(1.4, 0, null); const fading = G.Abilities.wspd(pl);
				out[id] = { inW: inW / bareIn, other: other / bareOther, fading };
				T.weather(null);
			}
			// sandstorm chip: 1.2 % max HP every 2 s, not with Sand Veil / Sand Rush / Slush Rush / Sand Stream
			const chip = id => {
				const pl = T.ab(id);   // Charmander: fire, so the sandstorm hurts it
				T.weather('sand'); G.Weather.update(2.1, 0, pl); G.Weather.update(2.1, 0, pl);
				const lost = pl.maxHp - pl.hp; T.weather(null); return lost;
			};
			out.chip = { blaze: chip('blaze'), sandveil: chip('sandveil'), sandrush: chip('sandrush'), slushrush: chip('slushrush'), sandstream: chip('sandstream') };
			T.ab('blaze');
			return out;
		});
		for (const id of ['swiftswim', 'chlorophyll', 'sandrush', 'slushrush']) A(near(r[id].inW, 1.3, 1e-9) && near(r[id].other, 1, 1e-9) && r[id].fading === 0, `${id}: +30% speed in its weather only (x${r[id].inW.toFixed(3)}, other weather x${r[id].other.toFixed(3)}, not while it fades in)`, JSON.stringify(r[id]));
		A(r.chip.blaze >= 1199 && r.chip.blaze <= 2401, `sandstorm chips a fire type (${r.chip.blaze} of 100000 HP)`);
		A(r.chip.sandveil === 0 && r.chip.sandrush === 0 && r.chip.slushrush === 0 && r.chip.sandstream === 0, 'Sand Veil, Sand Rush, Slush Rush and Sand Stream: no weather damage', JSON.stringify(r.chip));
	}

	// ================= 5. contact: Static & co (real contact loop), Rough Skin =================
	{
		const r = await E(() => {
			const out = {};
			// the real contact loop in G.Combat.resolve: an enemy touching you
			const touch = (id, rnd) => {
				const pl = T.ab(id); T.reset();
				const e = T.mk(19, 0, 0); e.x = pl.x + 2; e.y = pl.y; e.touchCd = 0; G.EnemyMgr.rebuildGrid();
				const h0 = e.hp;
				T.withRandom(rnd, () => G.Combat.resolve(0.016, pl, performance.now() / 1000));
				const r = { para: e.paraT, burn: e.burn, poison: e.poison, conf: e.confT, sleep: e.sleepT, dmg: h0 - e.hp, touched: e.touchCd > 0 };
				T.reset();
				return r;
			};
			out.static24 = touch('static', 0.249); out.static25 = touch('static', 0.25);
			out.flame = touch('flamebody', 0.1); out.poison = touch('poisonpoint', 0.1); out.cute = touch('cutecharm', 0.1);
			out.spore19 = touch('effectspore', 0.199); out.spore20 = touch('effectspore', 0.2);
			out.rough = touch('roughskin', 0.5); out.level = G.Game.player.level;
			out.none = touch('blaze', 0);
			// the chance, statistically: 4000 touches
			const pl = T.ab('static');
			const e = T.mk(19, 300, 0); let n = 0;
			for (let i = 0; i < 4000; i++) { e.paraT = 0; G.Abilities.contact(pl, e); if (e.paraT > 0) n++; }
			const pl2 = T.ab('effectspore'); let s = 0;
			for (let i = 0; i < 4000; i++) { e.sleepT = 0; G.Abilities.contact(pl2, e); if (e.sleepT > 0) s++; }
			out.rate = n / 4000; out.sleepRate = s / 4000;
			T.reset(); T.ab('blaze');
			return out;
		});
		A(r.static24.touched && near(r.static24.para, 3) && r.static25.para === 0, 'Static: a touching enemy is paralysed (3 s) when the roll is under 25%, not at 25%', JSON.stringify([r.static24, r.static25]));
		A(r.rate > 0.22 && r.rate < 0.28, `Static paralyses ~25% of attackers (${(r.rate * 100).toFixed(1)}% of 4000)`);
		A(r.sleepRate > 0.17 && r.sleepRate < 0.23, `Effect Spore puts ~20% to sleep (${(r.sleepRate * 100).toFixed(1)}% of 4000)`);
		A(r.flame.burn === 1 && r.poison.poison === 1 && near(r.cute.conf, 3), 'Flame Body burns (1 stack), Poison Point poisons (1 stack), Cute Charm confuses (3 s)', JSON.stringify([r.flame, r.poison, r.cute]));
		A(near(r.spore19.sleep, 4) && r.spore20.sleep === 0, 'Effect Spore: sleep (4 s) under 20%, not at 20%', JSON.stringify([r.spore19, r.spore20]));
		A(near(r.rough.dmg, 12 + 3 * r.level, 0.01) && r.none.dmg === 0, `Rough Skin: the attacker takes 12 + 3 x level (${r.rough.dmg} at level ${r.level}); without it, nothing`, JSON.stringify([r.rough, r.none]));
		A(r.none.para === 0 && r.none.burn === 0 && r.none.sleep === 0, 'no ability: touching you does nothing to the enemy');
	}

	// ================= 6. damage taken: types, super effective, Multiscale, Sturdy, Defiant =================
	{
		const r = await E(() => {
			const out = {};
			const ratio = (id, type) => { T.ab('protean'); const b = T.hurt(1000, type); T.ab(id); return T.hurt(1000, type) / b; };
			out.thickfat = [ratio('thickfat', 'fire'), ratio('thickfat', 'ice'), ratio('thickfat', 'water')];
			out.waterabsorb = [ratio('waterabsorb', 'water'), ratio('waterabsorb', 'fire')];
			out.voltabsorb = [ratio('voltabsorb', 'electric'), ratio('voltabsorb', 'water')];
			out.flashfire = [ratio('flashfire', 'fire'), ratio('flashfire', 'grass')];
			out.sapsipper = [ratio('sapsipper', 'grass'), ratio('sapsipper', 'fire')];
			out.intimidate = ratio('intimidate', 'normal');
			// Solid Rock: Charmander is fire -> water is super effective, grass is not
			out.solidrock = [ratio('solidrock', 'water'), ratio('solidrock', 'grass'), ratio('solidrock', null)];
			// Multiscale: first hit halved, then full, again halved only after 25 s
			const pl = T.ab('multiscale'); const full = 1000;
			const h1 = T.hurt(full), h2 = T.hurt(full);
			pl.abT += 25; const h3 = T.hurt(full);
			pl.abT += 25.01; const h4 = T.hurt(full);
			out.multiscale = [h1, h2, h3, h4];
			// Sturdy: a lethal hit leaves 1 HP, once every 90 s
			const ps = T.ab('sturdy'); ps.hp = 50;
			T.hurt(5000); const s1 = { hp: ps.hp, dead: ps.dead, invuln: ps.invuln };
			ps.abT += 60; ps.hp = 50; T.hurt(5000); const s2 = { hp: ps.hp, dead: ps.dead };
			ps.dead = false; ps.abT += 30.01; ps.hp = 50; T.hurt(5000); const s3 = { hp: ps.hp, dead: ps.dead };
			const pn = T.ab('blaze'); pn.hp = 50; T.hurt(5000); const s0 = { hp: pn.hp, dead: pn.dead };
			out.sturdy = { s1, s2, s3, s0 };
			pn.dead = false;
			// Defiant: +15 % damage for 4 s after being hit
			const pd = T.ab('defiant'); const a0 = pd.atk; T.hurt(10); const a1 = pd.atk;
			G.Abilities.tick(pd, 3.9); const a2 = pd.atk; G.Abilities.tick(pd, 0.2); const a3 = pd.atk;
			out.defiant = [a1 / a0, a2 / a0, a3 / a0];
			T.ab('blaze');
			return out;
		});
		A(near(r.thickfat[0], 0.5, 0.002) && near(r.thickfat[1], 0.5, 0.002) && near(r.thickfat[2], 1, 1e-9), `Thick Fat: fire and ice x0.5, water x1 (${r.thickfat.map(x => x.toFixed(3))})`);
		for (const id of ['waterabsorb', 'voltabsorb', 'flashfire', 'sapsipper']) A(near(r[id][0], 0.5, 0.002) && near(r[id][1], 1, 1e-9), `${id}: its type x0.5, others x1 (${r[id].map(x => x.toFixed(3))})`);
		A(near(r.intimidate, 0.9, 0.002), `Intimidate: 10% less damage (x${r.intimidate.toFixed(3)})`);
		A(near(r.solidrock[0], 0.75, 0.002) && near(r.solidrock[1], 1, 1e-9) && near(r.solidrock[2], 1, 1e-9), `Solid Rock: super-effective hits x0.75, the rest x1 (${r.solidrock.map(x => x.toFixed(3))})`);
		A(r.multiscale[0] === 500 && r.multiscale[1] === 1000 && r.multiscale[2] === 1000 && r.multiscale[3] === 500, `Multiscale: first hit halved, then full; halved again only after 25 s (${r.multiscale})`);
		A(r.sturdy.s1.hp === 1 && !r.sturdy.s1.dead && near(r.sturdy.s1.invuln, 1.2), 'Sturdy: a lethal hit leaves you at 1 HP (1.2 s invulnerable)', JSON.stringify(r.sturdy.s1));
		A(r.sturdy.s2.dead && !r.sturdy.s3.dead && r.sturdy.s3.hp === 1, 'Sturdy: not again within 90 s (60 s later you fall), works again after 90 s', JSON.stringify(r.sturdy));
		A(r.sturdy.s0.dead, 'without Sturdy the same hit KOs');
		A(near(r.defiant[0], 1.15) && near(r.defiant[1], 1.15) && near(r.defiant[2], 1), `Defiant: +15% damage for 4 s after a hit (${r.defiant.map(x => x.toFixed(3))})`);
	}

	// ================= 7. your hits: Moxie, Tinted Lens, Mold Breaker, kinds, own type, Drought & co =================
	{
		const r = await E(() => {
			const out = {};
			const pl = T.ab('moxie'); const pb = (() => { const p = T.ab('protean'); p.abFx = {}; return p.atk; })();
			G.Abilities.set(pl, 'blaze'); G.Abilities.set(pl, 'moxie');
			out.moxie = [0, 39, 40, 80, 200, 400, 1000].map(k => { pl.kills = k; return +(pl.atk / pb).toFixed(6); });
			pl.kills = 0;
			const k = (id, e, t, kind) => { T.ab(id); return G.Abilities.outK(G.Game.player, e, t, kind); };
			const water = { types: ['water'] }, grass = { types: ['grass'] }, normal = { types: ['normal'] }, boss = { types: ['normal'], boss: true };
			out.tinted = [k('tintedlens', water, 'fire'), k('tintedlens', grass, 'fire'), k('tintedlens', normal, 'fire')];
			out.mold = [k('moldbreaker', boss, 'fire'), k('moldbreaker', normal, 'fire')];
			out.iron = [k('ironfist', normal, 'normal', 'melee'), k('ironfist', normal, 'normal', 'projectile')];
			out.mega = ['projectile', 'beam', 'boomerang', 'cone', 'chain', 'meteor', 'melee', 'aura', 'orbit'].map(kd => k('megalauncher', normal, 'normal', kd));
			out.adapt = [k('adaptability', normal, 'fire'), k('adaptability', normal, 'water')];   // Charmander: fire
			out.drought = [k('drought', normal, 'fire'), k('drought', normal, 'water')];
			out.drizzle = [k('drizzle', normal, 'water'), k('snowwarning', normal, 'ice'), k('sandstream', normal, 'rock'), k('sandstream', normal, 'ground'), k('sandstream', normal, 'steel')];
			// real casts carry the move's kind: Iron Fist on a real Tackle (melee) and Mega Launcher on a real Ember projectile
			const cast = (id, move) => {
				const p = T.ab(id); T.reset(); T.only(move);
				const e = T.mk(19, 18, 0, { spd: 0 }); p.aim = 0; p.target = e; p.activeMove().t = 0;
				const h0 = e.hp, d0 = p.dmgDealt;
				G.Combat.tick(0.016, p, performance.now() / 1000);
				const shots = G.Projectiles.all().filter(q => q.owner === p && q.friendly);
				for (let i = 0; i < 30 && e.hp === h0; i++) { G.Projectiles.update(0.016); G.Combat.resolve(0.016, p, performance.now() / 1000 + i); }
				const d = p.dmgDealt - d0; T.reset();
				return { d, kinds: shots.map(q => q.mkind) };
			};
			const tB = cast('protean', 'tackle'), tI = cast('ironfist', 'tackle');
			const eB = cast('protean', 'ember'), eM = cast('megalauncher', 'ember');
			// Protean's own +8 % damage is in pl.atk, so the reference is divided by it
			out.real = { tackle: tI.d / tB.d * 1.08, ember: eM.d / eB.d * 1.08, kinds: eM.kinds, d: [tB.d, tI.d, eB.d, eM.d] };
			// crits: Compound Eyes adds 10 % to the crit roll
			const c0 = T.ab('blaze').critChance; out.crit = T.ab('compoundeyes').critChance - c0;
			T.ab('blaze');
			return out;
		});
		A(JSON.stringify(r.moxie) === JSON.stringify([1, 1, 1.02, 1.04, 1.1, 1.2, 1.2]), `Moxie: +2% per 40 kills, max +20% (kills 0/39/40/80/200/400/1000 -> ${r.moxie})`);
		A(near(r.tinted[0], 1.4) && r.tinted[1] === 1 && r.tinted[2] === 1, `Tinted Lens: not-very-effective hits x1.4, others x1 (${r.tinted})`);
		A(near(r.mold[0], 1.1) && r.mold[1] === 1, `Mold Breaker: x1.1 against bosses (${r.mold}), plus +6% damage (above)`);
		A(near(r.iron[0], 1.2) && r.iron[1] === 1, `Iron Fist: melee x1.2, ranged x1 (${r.iron})`);
		A(r.mega.slice(0, 6).every(x => near(x, 1.2)) && r.mega.slice(6).every(x => x === 1), `Mega Launcher: projectile/beam/boomerang/cone/chain/meteor x1.2; melee/aura/orbit x1 (${r.mega})`);
		A(near(r.adapt[0], 1.2) && r.adapt[1] === 1, `Adaptability: moves of your own type x1.2 (${r.adapt})`);
		A(near(r.drought[0], 1.15) && r.drought[1] === 1 && r.drizzle.slice(0, 4).every(x => near(x, 1.15)) && r.drizzle[4] === 1, `Drought/Drizzle/Snow Warning/Sand Stream: +15% to their types (${r.drought}, ${r.drizzle})`);
		A(near(r.real.tackle, 1.2, 1e-6), `a real Tackle cast with Iron Fist hits x1.2 (x${r.real.tackle.toFixed(4)})`, JSON.stringify(r.real));
		A(near(r.real.ember, 1.2, 1e-6) && r.real.kinds.length > 0 && r.real.kinds.every(x => x === 'projectile'), `a real Ember with Mega Launcher: the projectile carries its kind and hits x1.2 (x${r.real.ember.toFixed(4)})`, JSON.stringify(r.real));
		A(near(r.crit, 0.1, 1e-9), `Compound Eyes adds 10% crit chance (+${r.crit})`);
	}

	// ================= 8. Levitate vs map traps; Inner Focus / Limber (the status hook) =================
	{
		const r = await E(() => {
			const trap = id => {
				const pl = T.ab(id);
				G.Interact.trapEffect({ x: pl.x, y: pl.y + 8, kind: 0 });   // poison trap: 10 % max HP
				const p1 = pl.maxHp - pl.hp; pl.hp = pl.maxHp;
				G.Interact.trapEffect({ x: pl.x, y: pl.y + 8, kind: 1 });   // sticky
				const sticky = pl.slowT; pl.slowT = 0;
				return { p1, sticky };
			};
			const out = { levitate: trap('levitate'), blaze: trap('blaze') };
			const im = id => { const pl = T.ab(id); return ['sleep', 'conf', 'para', 'freeze'].map(k => G.Abilities.statusImmune(pl, k)); };
			out.innerfocus = im('innerfocus'); out.limber = im('limber'); out.none = im('blaze');
			T.reset(); T.ab('blaze');
			return out;
		});
		A(r.blaze.p1 > 0 && r.blaze.sticky > 0, 'a map trap hurts / sticks a normal player', JSON.stringify(r.blaze));
		A(r.levitate.p1 === 0 && r.levitate.sticky === 0, 'Levitate: map traps don\'t affect you', JSON.stringify(r.levitate));
		A(JSON.stringify(r.innerfocus) === '[true,true,false,false]' && JSON.stringify(r.limber) === '[false,false,true,true]' && JSON.stringify(r.none) === '[false,false,false,false]',
			'Inner Focus: immune to sleep + confusion; Limber: paralysis + freeze (hook for the player-status traps still to come)', JSON.stringify(r));
	}

	// ================= 9. HUD state + pause screen =================
	{
		const r = await E(() => {
			const s = [];
			const pl = T.ab('sturdy'); s.push(G.Abilities.state(pl)); pl.hp = 10; T.hurt(5000); s.push(G.Abilities.state(pl));
			const pm = T.ab('moxie'); pm.kills = 120; s.push(G.Abilities.state(pm));
			const pb = T.ab('blaze'); pb.hp = pb.maxHp * 0.3; s.push(G.Abilities.state(pb));
			pb.hp = pb.maxHp; s.push(G.Abilities.state(pb));
			return s;
		});
		A(r[0].on && r[0].txt === '' && !r[1].on && r[1].txt === '90s', `HUD state: Sturdy ready, then its 90 s recharge (${JSON.stringify(r.slice(0, 2))})`);
		A(r[2].on && r[2].txt === '+6%', `HUD state: Moxie shows its bonus (${JSON.stringify(r[2])})`);
		A(r[3].on && !r[4].on, 'HUD state: Blaze lights up below 40% HP only');
		await E(() => G.RunUI.showPause(false));
		await sleep(300);
		const got = await text('#pause-ability');
		A(got === 'Ability: Blaze Below 40% HP, your Fire moves deal +35% damage.', `the pause screen shows the ability and what it does ("${got}")`);
		await shot('pause_ability.png');
		await E(() => G.UI.hide('scr-pause'));
	}

	// ================= 10. English =================
	{
		const tr = await E(() => ['Habilidad: Mar Llamas', '¡Robustez!', ...Object.values(G.Abilities.FX).flatMap(a => [a.name, a.desc])].map(s => [s, G.I18n.t(s)]));
		const bad = tr.filter(([es, en]) => es === en || /[¡¿ñáéíóú]/i.test(en.replace(/Poké/g, '')));
		A(bad.length === 0, `every ability string has English (${tr.length})`, JSON.stringify(bad));
		A(tr[0][1] === 'Ability: Blaze' && tr[1][1] === 'Sturdy!', 'the label is a pattern ("Ability: {x}")', JSON.stringify(tr.slice(0, 2)));
	}

	A(errors.length === 0, 'no console errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: exception ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
