// Automated 2-client card-duel repro: mp-dev-server + two headless Edge pages.
//
//   node tools/mp-duel-repro.cjs [--visible]
//
// Registers two accounts, friends them, sends/accepts a card challenge via the
// API (the same calls the overworld UI makes), then loads the duel page in two
// separate browser contexts (host + guest) and waits for BOTH to render a board
// (window.state.players populated). Dumps both consoles and all page errors on
// failure — this is the harness for the "guest never loaded" bug.
const puppeteer = require('puppeteer-core');
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const fs = require('node:fs');

const EDGE = [
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const ROOT = join(__dirname, '..');
const PORT = 8797;
// --prod runs the exact same flow against the live site (real Netlify
// Functions + Blobs) — the environment the bug was observed in
const PROD = process.argv.includes('--prod');
const BASE = PROD ? 'https://michaelgibalerio.com' : `http://localhost:${PORT}`;
const VISIBLE = process.argv.includes('--visible');

const api = async (body, tok) => {
	const r = await fetch(`${BASE}/api/mp`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) },
		body: JSON.stringify(body),
	});
	return r.json();
};

async function main() {
	// ---- dev server (skipped in --prod) ----
	let server = null;
	const storePath = join(ROOT, '_repro-store.json');
	if (!PROD) {
		fs.rmSync(storePath, { force: true });
		server = spawn(process.execPath, ['mp-dev-server.mjs', String(PORT)], {
			cwd: ROOT, env: { ...process.env, MP_DEV_STORE: storePath }, stdio: ['ignore', 'pipe', 'pipe'],
		});
		await new Promise((res, rej) => {
			const t = setTimeout(() => rej(new Error('dev server did not boot')), 20000);
			server.stdout.on('data', d => { if (String(d).includes('dev server:')) { clearTimeout(t); res(); } });
			server.stderr.on('data', d => process.stderr.write('[server] ' + d));
		});
		console.log('dev server up on', PORT);
	} else console.log('PROD mode: running against', BASE);

	// ---- accounts + friendship + challenge (exactly the client's API calls) ----
	// register, falling back to login when the account already exists (prod reruns)
	const auth = async (u) => {
		let r = await api({ action: 'register', username: u, password: 'pw123456' });
		if (!r.token) r = await api({ action: 'login', username: u, password: 'pw123456' });
		return r;
	};
	const host = await auth('reprohost');
	const guest = await auth('reproguest');
	if (!host.token || !guest.token) throw new Error('register failed: ' + JSON.stringify({ host, guest }));
	await api({ action: 'add-friend', code: guest.state.friendCode }, host.token);

	const deckFor = (st) => {
		const cls = Object.keys(st.decks).find(k => (st.decks[k] || []).length >= 10);
		return { deck: st.decks[cls], classId: cls };
	};
	await api({ action: 'challenge', to: 'reproguest', battleType: 'card', party: deckFor(host.state) }, host.token);
	const acc = await api({ action: 'accept-challenge', from: 'reprohost', battleType: 'card', party: deckFor(guest.state) }, guest.token);
	if (!acc.matchId) throw new Error('accept failed: ' + JSON.stringify(acc));
	const mm = await api({ action: 'my-match' }, host.token);
	console.log('match created:', acc.matchId, '| host my-match:', mm.matchId);

	// ---- two isolated browser contexts ----
	const browser = await puppeteer.launch({
		executablePath: EDGE, headless: VISIBLE ? false : 'new',
		args: ['--enable-unsafe-swiftshader', '--no-first-run'],
		defaultViewport: { width: 1100, height: 800 },
	});
	const mkPage = async (label, token, state) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		const logs = [];
		page.on('console', m => logs.push(`[${label}:${m.type()}] ${m.text()}`));
		page.on('pageerror', e => logs.push(`[${label}:PAGEERROR] ${e.message}`));
		page.on('requestfailed', r => logs.push(`[${label}:REQFAIL] ${r.url()} ${r.failure()?.errorText}`));
		// seed the login token before any script runs
		await page.evaluateOnNewDocument((tok, st) => {
			localStorage.setItem('magepunk_mp_token_v1', tok);
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		}, token, state);
		return { page, logs };
	};
	const H = await mkPage('HOST', host.token, host.state);
	const G = await mkPage('GUEST', guest.token, guest.state);

	const duelUrl = `${BASE}/battlecards/?cardpvp=${acc.matchId}&mp=1`;
	// guest arrives FIRST (like the real flow: accepter redirects immediately,
	// challenger discovers via a 2s poll)
	await G.page.goto(duelUrl, { waitUntil: 'domcontentloaded' });
	await new Promise(r => setTimeout(r, 2000));
	await H.page.goto(duelUrl, { waitUntil: 'domcontentloaded' });

	const boardUp = (pg) => pg.evaluate(() =>
		!!(window.__game?.state?.players?.length >= 2)).catch(() => false);

	// wait up to 45s for both boards
	let hostUp = false, guestUp = false;
	const t0 = Date.now();
	while (Date.now() - t0 < 45000 && !(hostUp && guestUp)) {
		await new Promise(r => setTimeout(r, 1500));
		if (!hostUp) hostUp = await boardUp(H.page);
		if (!guestUp) guestUp = await boardUp(G.page);
		console.log(`t+${Math.round((Date.now() - t0) / 1000)}s  host board: ${hostUp}  guest board: ${guestUp}`);
	}

	console.log('\n================ RESULT ================');
	console.log('HOST board rendered:', hostUp);
	console.log('GUEST board rendered:', guestUp);
	if (!hostUp || !guestUp) {
		console.log('\n---- console + errors (both pages) ----');
		for (const l of [...H.logs, ...G.logs]) console.log(l);
	} else {
		// bonus: host ends turn, guest should see current flip to them
		await H.page.evaluate(() => document.getElementById('end-turn')?.click());
		await new Promise(r => setTimeout(r, 4000));
		const guestTurn = await G.page.evaluate(() => window.__game?.state?.current).catch(() => null);
		console.log('after host end-turn, guest sees current =', guestTurn, guestTurn === 1 ? '(their turn — relay works)' : '(NOT their turn)');
		const errs = [...H.logs, ...G.logs].filter(l => /PAGEERROR|error/i.test(l)).slice(0, 20);
		if (errs.length) { console.log('---- errors seen ----'); errs.forEach(e => console.log(e)); }
	}

	await browser.close();
	if (server) { server.kill(); fs.rmSync(storePath, { force: true }); }
	process.exit(hostUp && guestUp ? 0 : 1);
}

main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
