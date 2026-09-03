// social_test.mjs — Batch E of the second upscale plan: the social layer.
//
// Server half runs the REAL handler (mp-dev-server → server/mp.mjs on local
// SQLite): two accounts trade a Pokémon end-to-end — offer, inbox, accept,
// the exactly-once delivery claim, the decline/return path, and the secret
// base save/get/dir round-trip.
//
// Client half (headless): every Emerald base spot works by metatile BEHAVIOR
// (no hand-placed zones) — claim one, step inside, decorate, remove; tree
// pairs normalize to one spot key; the friends menu grows the INBOX badge row.
//
//   node overworld/tests/social_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import os from 'os';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- server half: the real handler on SQLite ----------
{
	const PORT = 8985;
	const db = path.join(os.tmpdir(), `mp-social-test-${Date.now()}.sqlite`);
	const srv = spawn(process.execPath, ['mp-dev-server.mjs', String(PORT)], {
		cwd: ROOT, env: { ...process.env, MP_DEV_DB: db }, stdio: 'ignore',
	});
	const api = async (token, action, payload = {}) => {
		const r = await fetch(`http://localhost:${PORT}/api/mp`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
			body: JSON.stringify({ action, ...payload }),
		});
		return r.json();
	};
	try {
		let up = false;
		for (let i = 0; i < 60 && !up; i++) { try { await api(null, 'ping'); up = true; } catch (e) { await new Promise(r => setTimeout(r, 250)); } }
		A(up, 'the real handler boots on SQLite');

		const alice = await api(null, 'register', { username: 'alice', password: 'hunter22' });
		const bob = await api(null, 'register', { username: 'bob', password: 'hunter22' });
		A(!!alice.token && !!bob.token, 'two accounts register');
		await api(alice.token, 'add-friend', { code: bob.state.friendCode });
		await api(bob.token, 'add-friend', { code: alice.state.friendCode });

		const sparky = { speciesId: 'pikachu', name: 'SPARKY', level: 12, maxHP: 40, curHP: 40, moves: [{ id: 'thundershock', pp: 30, maxPp: 30 }] };
		const pidge = { speciesId: 'pidgey', name: 'PIDGE', level: 9, maxHP: 32, curHP: 32, moves: [{ id: 'tackle', pp: 35, maxPp: 35 }] };

		// offer -> inbox -> accept -> exactly-once delivery
		const off = await api(alice.token, 'trade-offer', { to: 'bob', mon: sparky });
		A(off.ok === true, 'alice offers SPARKY to bob', JSON.stringify(off));
		const inbox = await api(bob.token, 'trade-list');
		A(inbox.trades?.length === 1 && inbox.trades[0].from === 'alice' && inbox.trades[0].mon.name === 'SPARKY',
			"the offer sits in bob's inbox with the mon aboard", JSON.stringify(inbox));
		const acc = await api(bob.token, 'trade-accept', { id: inbox.trades[0].id, mon: pidge });
		A(acc.ok === true && acc.mon?.name === 'SPARKY', 'accepting hands bob SPARKY in the same response');
		const accAgain = await api(bob.token, 'trade-accept', { id: inbox.trades[0].id, mon: pidge });
		A(!!accAgain.error, 'a repeated accept refuses (no duplication)', JSON.stringify(accAgain));
		const dels = await api(alice.token, 'trade-deliveries');
		A(dels.deliveries?.length === 1 && dels.deliveries[0].mon.name === 'PIDGE' && dels.deliveries[0].returned === false,
			"PIDGE waits in alice's deliveries", JSON.stringify(dels));
		const claim = await api(alice.token, 'trade-claim', { id: dels.deliveries[0].id });
		A(claim.ok === true && claim.delivery?.mon?.name === 'PIDGE', 'the claim hands the mon over in one step');
		const claim2 = await api(alice.token, 'trade-claim', { id: dels.deliveries[0].id });
		A(!!claim2.error, 'a repeated claim refuses (gift semantics)');

		// decline path: the mon comes home
		const off2 = await api(bob.token, 'trade-offer', { to: 'alice', mon: pidge });
		A(off2.ok === true, 'bob offers PIDGE to alice');
		const aInbox = await api(alice.token, 'trade-list');
		const dec = await api(alice.token, 'trade-decline', { id: aInbox.trades[0].id });
		A(dec.ok === true, 'alice declines');
		const bDels = await api(bob.token, 'trade-deliveries');
		A(bDels.deliveries?.length === 1 && bDels.deliveries[0].returned === true, "the declined PIDGE heads home to bob");
		const bClaim = await api(bob.token, 'trade-claim', { id: bDels.deliveries[0].id });
		A(bClaim.ok === true && bClaim.delivery?.mon?.name === 'PIDGE', 'bob claims his returned mon');

		// guardrails
		A(!!(await api(alice.token, 'trade-offer', { to: 'alice', mon: sparky })).error, 'offering to yourself refuses');
		A(!!(await api(alice.token, 'trade-offer', { to: 'nobody_here', mon: sparky })).error, 'offering to a ghost refuses');

		// secret bases: save / read / directory across friends
		const bs = await api(alice.token, 'base-save', { spot: 'Route111:27,27', deco: [{ id: 'plant', x: 3, y: 4 }, { id: 'lamp', x: 5, y: 5 }] });
		A(bs.ok === true, "alice saves her base");
		const bg = await api(bob.token, 'base-get', { user: 'alice' });
		A(bg.base?.spot === 'Route111:27,27' && bg.base.deco.length === 2 && bg.base.deco[0].id === 'plant',
			"bob reads alice's base, decorations intact", JSON.stringify(bg.base));
		const dir = await api(bob.token, 'base-dir');
		A(dir.dir?.['Route111:27,27'] === 'alice', "the directory maps alice's spot to her name", JSON.stringify(dir.dir));
		const big = await api(alice.token, 'base-save', { spot: 'x', deco: Array.from({ length: 60 }, (_, i) => ({ id: 'plant', x: i, y: i })) });
		A(big.ok === true && (await api(alice.token, 'base-get')).base.deco.length <= 24, 'oversized decoration lists are clamped');
	} catch (e) {
		A(false, 'server half crashed: ' + e.message);
	} finally {
		srv.kill();
		try { fs.rmSync(db, { force: true }); } catch (e) {}
	}
}

// ---------- client half ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8986;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [
		{ speciesId: 'rattata', name: 'LEAD', level: 15, gender: 'M', friend: 70, types: ['Normal'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 50, atk: 25, def: 25, spa: 25, spd: 25, spe: 25 }, maxHP: 50, curHP: 50, exp: 3375, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19 },
		{ speciesId: 'pidgey', name: 'BIRB', level: 12, gender: 'F', friend: 70, types: ['Normal', 'Flying'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 40, atk: 20, def: 20, spa: 20, spd: 20, spe: 22 }, maxHP: 40, curHP: 40, exp: 1728, moves: [{ id: 'gust', name: 'Gust', pp: 35, maxPp: 35 }], sprite: 's16.png', num: 16 },
	];
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
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route111&x=27&y=28`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'Route 111 boots');
		const closeDialog = async (key = 'x') => {
			for (let i = 0; i < 8 && await page.evaluate(() => window.__ow.dialog.blocking); i++) { await page.keyboard.press(key); await new Promise(r => setTimeout(r, 130)); }
		};

		// --- the spot is found by BEHAVIOR (Emerald's real Route 111 rock) ---
		const spot = await page.evaluate(() => {
			const ow = window.__ow;
			const b = ow.world.behaviorAt(27, 27);
			const p = ow.player;
			p.tx = 27; p.ty = 28; p.px = 27 * 16; p.py = 28 * 16; p.facing = 'up';
			ow.interact();
			return { behavior: b };
		});
		A(spot.behavior >= 0x90 && spot.behavior <= 0x9D, 'the Route 111 rock face carries its secret-base behavior', String(spot.behavior));
		// the claim dialog lands after the base directory resolves
		let asked = false;
		for (let i = 0; i < 20 && !asked; i++) { asked = await page.evaluate(() => window.__ow.dialog.blocking); if (!asked) await new Promise(r => setTimeout(r, 150)); }
		A(asked, 'interacting with the face offers the claim');
		await closeDialog('z'); // claim it -> enter
		await new Promise(r => setTimeout(r, 1500));
		const inside = await page.evaluate(() => ({
			map: window.__ow.world.current.name,
			mine: window.__ow.baseCtx?.mine,
			spot: JSON.parse(localStorage.getItem('magepunk_base_v1') || 'null')?.spot,
		}));
		A(/^SecretBase_/.test(inside.map || ''), 'claiming steps into the base room', inside.map);
		A(inside.mine === true && inside.spot === 'Route111:27,27', 'the claim persists with the spot key', JSON.stringify(inside));

		// --- decorate, then put it away ---
		const deco = await page.evaluate(() => {
			const ow = window.__ow;
			const p = ow.player;
			// stand somewhere open and face a floor tile
			const lay = ow.world.current.layout;
			let tx = 0, ty = 0;
			outer: for (let y = 2; y < lay.height - 1; y++) for (let x = 1; x < lay.width - 1; x++) {
				if (ow.world.isPassable(x, y) && ow.world.isPassable(x, y + 1) && !ow.world.warpAt(x, y) && !ow.world.warpAt(x, y + 1)) { tx = x; ty = y; break outer; }
			}
			p.tx = tx; p.ty = ty + 1; p.px = tx * 16; p.py = (ty + 1) * 16; p.facing = 'up';
			ow.interact();
			const o = { menu: ow.decoMenu.open, at: [tx, ty] };
			ow.decoKey('z'); // place the first catalog item
			o.placed = (ow.baseCtx?.deco || []).length;
			o.saved = (JSON.parse(localStorage.getItem('magepunk_base_v1')).deco || []).length;
			ow.drawBaseDeco(document.createElement('canvas').getContext('2d'), 0, 0);
			ow.interact(); // Z on the decoration offers removal
			o.removeAsk = ow.dialog.blocking;
			return o;
		});
		A(deco.menu, 'Z on open floor in your base opens the DECORATE menu');
		A(deco.placed === 1 && deco.saved === 1, 'a decoration lands and persists', JSON.stringify(deco));
		A(deco.removeAsk, 'Z on the decoration offers to put it away');
		await closeDialog('z');
		const gone = await page.evaluate(() => (JSON.parse(localStorage.getItem('magepunk_base_v1')).deco || []).length);
		A(gone === 0, 'putting it away empties the base again', String(gone));

		// --- tree pairs share one spot key ---
		const treeKey = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('Route110', 10, 10);
			return { left: ow.baseSpotKey(16, 25, 0x96), right: ow.baseSpotKey(17, 25, 0x9C) };
		});
		A(treeKey.left === treeKey.right && treeKey.left === 'Route110:16,25', 'both halves of a tree spot agree on the key', JSON.stringify(treeKey));

		// --- friends menu: the INBOX badge row + trade surfaces render ---
		const social = await page.evaluate(async () => {
			const ow = window.__ow;
			const o = { threw: null };
			try {
				await ow.refreshFriendBadges();
				o.badges = ow.friendsMenu.badges;
				ow.friendsMenu.open = true; ow.friendsMenu.idx = 1;
				ow.drawFriendsMenu(480, 320);
				ow.friendsMenu.open = false;
				ow.openTradeOffer({ username: 'bob' });
				o.offer = ow.socialMenu.open && ow.socialMenu.mode === 'offermon';
				ow.drawSocial(480, 320);
				ow.socialKey('z'); // confirm dialog
				o.confirm = ow.dialog.blocking;
				ow.socialMenu.open = false;
				ow.socialMenu.open = true; ow.socialMenu.mode = 'inbox'; ow.socialMenu.idx = 0;
				ow.socialMenu.trades = [{ id: 't1', from: 'bob', mon: { name: 'PIDGEY', level: 9 } }];
				ow.drawSocial(480, 320);
				ow.socialKey('z');
				o.inboxAsk = ow.dialog.blocking;
				ow.socialMenu.open = false;
			} catch (e) { o.threw = e.message; }
			return o;
		});
		A(social.threw === null, 'the social surfaces draw clean', social.threw);
		A(social.badges && social.badges.ch === 0 && social.badges.tr === 0, 'the inbox badges resolve', JSON.stringify(social.badges));
		A(social.offer && social.confirm, 'offering a trade asks before the mon leaves');
		await closeDialog();
		A(social.inboxAsk, 'an inbox offer asks accept-or-decline');
		await closeDialog();

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'client half crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
