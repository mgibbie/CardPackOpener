// mpmode.js — the account layer. The account system is now MANDATORY: whenever
// a login token exists, every battlecards page runs in "MP mode" (the server,
// not localStorage, owns the collection, decks, and packs) — no ?mp opt-in.
// The overworld and the battlecards 3D game additionally REQUIRE a login and
// bounce you to the /login door when you have none. Read-only pages
// (the gallery, deck browser) stay usable logged-out in local mode.
import { safeLoad, safeSave, safeSaveStr } from './safestore.js';
const TOKEN_KEY = 'magepunk_mp_token_v1';
const STATE_KEY = 'magepunk_mp_state_v1';
const API = '/api/mp';

export const hasToken = () => !!localStorage.getItem(TOKEN_KEY);

// ---- the account a page was loaded for (bug:1793284798179) ----
// The login token is ONE device-wide key, but a page's local game data is chosen
// once, at load, for the account signed in then (site/account_silo.js). Signing in
// as someone else in another tab swapped the token under a page that was still
// running (or still booting) on the first account's local game, and its next
// request went out as the NEW account: an overworld that loaded on
// instinctloretest0918's local save hydrated against instinctgauntlet's server
// copy, read its own (much higher) revision as "local ahead", merged the dex and
// pushed the whole wrong game up as instinctgauntlet's (rev 2739 -> 48836).
// So a page sends account requests only as the account it was loaded for. The
// principal is the username inside the token (what the server authenticates —
// `<user>.<exp>.<sig>`), or the raw token for anything not shaped like one.
export function principalOf(token) {
	if (!token) return null;
	const m = /^(.+)\.(\d+)\.([0-9a-f]{64})$/.exec(String(token));
	return m ? 'u:' + m[1].toLowerCase() : 't:' + token;
}
const livePrincipal = () => { try { return principalOf(localStorage.getItem(TOKEN_KEY)); } catch (e) { return null; } };
let pagePrincipal = livePrincipal();
let _reloading = false;
// true when the token now belongs to a DIFFERENT account than this page was loaded
// for. (Signed out at load and signed in since is not a switch: such a page holds
// no account's synced game — the overworld and the game pages require a login.)
export function accountSwitched() {
	const live = livePrincipal();
	return pagePrincipal != null && live !== pagePrincipal;
}
const AUTH_ACTIONS = { login: 1, register: 1 };
// account mode is on iff you're logged in (the old URL ?mp=1 opt-in is retired)
export const wantsMp = () => hasToken();

// battlecards pages call this once: true = server-owned account realm
export function mpMode() { return hasToken(); }

// pages that MUST have a login (the overworld + the battlecards game) call this;
// it sends you to the account door when no token is present.
export function requireLogin() {
	if (!hasToken()) { location.href = '/login/?next=' + encodeURIComponent(location.pathname + location.search); return false; }
	return true;
}

export async function call(action, payload = {}, opts = {}) {
	// hard 20s timeout: without one, a hung fetch wedges every caller that
	// awaits it (the PvP submit/poll loops most painfully — the player would sit
	// on "Waiting…" forever with no way out)
	// opts.keepalive: let a final save survive page unload (pagehide). keepalive
	// supports our auth header (unlike sendBeacon) but caps the body at ~64KB, so
	// callers must tolerate rejection for large payloads.
	if (!AUTH_ACTIONS[action] && accountSwitched()) {
		// never send this page's data as another account: reload, so the page comes
		// back with the right account's local data (or the login door)
		if (!_reloading && typeof location !== 'undefined' && location.reload) { _reloading = true; try { location.reload(); } catch (e) {} }
		return { error: 'signed in as another account elsewhere — reloading', accountChanged: true };
	}
	const sentToken = localStorage.getItem(TOKEN_KEY) || '';
	const res = await fetch(API, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: 'Bearer ' + sentToken,
		},
		body: JSON.stringify({ action, ...payload }),
		keepalive: !!opts.keepalive,
		signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined,
	});
	const data = await res.json().catch(() => ({ error: 'bad response' }));
	// the token changed while this request was in flight: its answer is about the
	// account that was signed in, not the one that is now — it must not sign anyone
	// out, nor write that account's name over the new login's (the silo reads the
	// cached state to decide whose local data a page uses)
	const stillSame = (localStorage.getItem(TOKEN_KEY) || '') === sentToken;
	if (res.status === 401 && !AUTH_ACTIONS[action]) {
		// a stale / forged login: forget it. (Only a browser that HAS one: a guest's refused call signs nobody out.)
		if (stillSame && sentToken) expire();
		return data;
	}
	if (data.state && stillSame) safeSave(STATE_KEY, data.state);
	return data;
}

export async function auth(action, username, password) {
	const data = await call(action, { username, password });
	if (data.token) {
		// whose is the local game data this browser already holds? Settled before the
		// new login is stored (site/account_silo.js; bug:1792610921028)
		try { globalThis.MagepunkSilo?.onAuth?.(action, data.state?.username || username); } catch (e) {}
		safeSaveStr(TOKEN_KEY, data.token);
		safeSave(STATE_KEY, data.state);
		pagePrincipal = principalOf(data.token);   // this page signed in: it is now that account's
	}
	return data;
}

/** The server no longer accepts this browser's login (it expired, or was ended from elsewhere). Forget it and load
 *  the page again. A page that needs a login then shows the door, with the way back to it; a page that is open to
 *  everyone (Pair of Pears, Micatro, MicaSurvivor …) comes back as a guest's and can be played. It used to send the
 *  player to the login page from wherever they were, open game or not (owner, 2026-11-11: "make sure pair of pears
 *  is playable by people who are not logged in"). A reload, not a quiet sign-out: whose local data a page reads
 *  is settled when it loads (site/account_silo.js), so the page must not go on as someone it no longer is. */
function expire() {
	localStorage.removeItem(TOKEN_KEY);
	localStorage.removeItem(STATE_KEY);
	if (_reloading || typeof location === 'undefined' || location.pathname.startsWith('/login')) return;
	_reloading = true;
	try { location.reload(); } catch (e) {}
}

export function logout() {
	localStorage.removeItem(TOKEN_KEY);
	localStorage.removeItem(STATE_KEY);
	if (!location.pathname.startsWith('/login')) location.href = '/login/';
}

// last known server state (refresh with call('state'))
export function cachedState() {
	return safeLoad(STATE_KEY, null);
}

export async function freshState() {
	const data = await call('state');
	return data.state || cachedState();
}
