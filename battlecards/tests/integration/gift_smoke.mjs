// gift_smoke.mjs — owner-sent gifts.
//
// A player's bag lives in THEIR localStorage (magepunk_bag_v1 is not in
// OW_KEYS), so nothing server-side can write items into an account. A gift is
// therefore a promise the recipient's own client claims and applies. That makes
// the claim the dangerous part: it must be exactly-once, or a refresh loop
// would mint items forever. gift-claim marks the gift spent AND returns the
// payload in one call, and this asserts a second claim is refused.
//
// Boots the REAL dev server (mp-dev-server: real auth + the gift actions on
// sqlite) against a FRESH db.
//
// Standalone; NOT in run-all.mjs:
//   node battlecards/tests/integration/gift_smoke.mjs
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const PORT = 8893;
const BASE = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const api = (action, body = {}, token) => fetch(BASE + '/api/mp', {
	method: 'POST',
	headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
	body: JSON.stringify({ action, ...body }),
}).then(r => r.json());

async function tokenFor(username, password) {
	let r = await api('register', { username, password });
	if (!r.token) r = await api('login', { username, password });
	if (!r.token) throw new Error(username + ' auth failed: ' + JSON.stringify(r));
	return r.token;
}
async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) {
		try { if (await fn()) return true; } catch {}
		await new Promise(r => setTimeout(r, 150));
	}
	return false;
}

(async () => {
	const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gift-smoke-')), 'users.sqlite');
	const server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)],
		{ cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile } });
	try {
		A(await waitFor(() => fetch(BASE + '/').then(r => r.ok), 15000), 'dev server is up');

		const owner = await tokenFor('mgibbie', 'localdev1');
		const player = await tokenFor('giftee', 'localdev1');
		const other = await tokenFor('bystander', 'localdev1');

		// ---- who may send ----
		const notOwner = await api('gift-send', { to: 'giftee', items: { rarecandy: 5 } }, player);
		A(notOwner.error === 'owner only', 'a normal account cannot send gifts', JSON.stringify(notOwner));
		const noUser = await api('gift-send', { to: 'nobodyhere', items: { rarecandy: 5 } }, owner);
		A(noUser.error === 'no player with that username', 'sending to a missing account is refused', JSON.stringify(noUser));

		// ---- validation ----
		const badId = await api('gift-send', { to: 'giftee', items: { 'RARE CANDY': 5 } }, owner);
		A(/bad item id/.test(badId.error || ''), 'a malformed item id is refused', JSON.stringify(badId));
		const badCount = await api('gift-send', { to: 'giftee', items: { rarecandy: 0 } }, owner);
		A(/1-999/.test(badCount.error || ''), 'a zero count is refused', JSON.stringify(badCount));
		const tooMany = await api('gift-send', { to: 'giftee', items: { rarecandy: 1000 } }, owner);
		A(/1-999/.test(tooMany.error || ''), 'an absurd count is refused', JSON.stringify(tooMany));
		const noItems = await api('gift-send', { to: 'giftee', items: {} }, owner);
		A(/1 and 20/.test(noItems.error || ''), 'an empty gift is refused', JSON.stringify(noItems));

		// ---- send ----
		const sent = await api('gift-send', {
			to: 'giftee', title: 'Welcome!', body: 'Glad you are here.', items: { rarecandy: 100 },
		}, owner);
		A(sent.ok === true && sent.pending === 1, 'the owner can send a gift', JSON.stringify(sent));
		A(sent.gift?.items?.rarecandy === 100, 'it carries the items', JSON.stringify(sent.gift?.items));

		// ---- only the recipient sees it ----
		const mine = await api('gift-list', {}, player);
		A(mine.gifts?.length === 1, 'the recipient sees one pending gift', JSON.stringify(mine.gifts?.length));
		A(mine.gifts[0].title === 'Welcome!', 'with its message', mine.gifts[0].title);
		A(((await api('gift-list', {}, other)).gifts || []).length === 0,
			'a bystander sees nothing');
		A(((await api('gift-list', {}, owner)).gifts || []).length === 0,
			'and the sender is not gifting themselves');

		// ---- claim is exactly once ----
		const id = mine.gifts[0].id;
		const claim = await api('gift-claim', { id }, player);
		A(claim.ok === true && claim.gift?.items?.rarecandy === 100,
			'claiming returns the payload to apply', JSON.stringify(claim.gift?.items));
		const again = await api('gift-claim', { id }, player);
		A(again.error === 'already claimed', 'a SECOND claim pays out nothing', JSON.stringify(again));
		A(((await api('gift-list', {}, player)).gifts || []).length === 0,
			'and the gift no longer shows as pending');

		// a stranger cannot claim someone else's gift id
		const sent2 = await api('gift-send', { to: 'giftee', items: { potion: 3 } }, owner);
		const steal = await api('gift-claim', { id: sent2.gift.id }, other);
		A(steal.error === 'no such gift', 'another account cannot claim your gift', JSON.stringify(steal));
		A(((await api('gift-list', {}, player)).gifts || []).length === 1,
			'and it is still waiting for its owner');

		// ---- the client half exists and is wired ----
		const mainSrc = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
		A(/async function claimGifts\(\)/.test(mainSrc), 'the overworld has a claimGifts()');
		A(/claimGifts\(\);/.test(mainSrc), 'and calls it on boot');
		A(/Bag\.addItem\(id, n\)/.test(mainSrc), 'which puts the items in the bag');
		// scope the ordering check to claimGifts' own body — main.js has other
		// Bag.addItem(id, n) calls (a cutscene's giveItem) far earlier in the file
		const start = mainSrc.indexOf('async function claimGifts()');
		const body = mainSrc.slice(start, mainSrc.indexOf('\nasync function hydrateOw', start));
		A(body.indexOf('gift-claim') < body.indexOf('Bag.addItem(id, n)'),
			'inside claimGifts, the claim happens before the bag write, so a retry cannot double-pay',
			`claim@${body.indexOf('gift-claim')} add@${body.indexOf('Bag.addItem(id, n)')}`);
		// nothing may await between the claim and the bag write, or a crash in the
		// gap would spend the gift without paying it
		const gap = body.slice(body.indexOf('gift-claim'), body.indexOf('Bag.addItem(id, n)'));
		A(!/\bawait\b/.test(gap.slice(gap.indexOf('\n'))),
			'and nothing awaits in between, so a crash cannot spend it without paying',
			JSON.stringify(gap.slice(0, 120)));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		server.kill();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
