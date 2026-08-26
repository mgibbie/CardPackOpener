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

export async function call(action, payload = {}) {
	// hard 20s timeout: without one, a hung fetch wedges every caller that
	// awaits it (the PvP submit/poll loops most painfully — the player would sit
	// on "Waiting…" forever with no way out)
	const res = await fetch(API, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: 'Bearer ' + (localStorage.getItem(TOKEN_KEY) || ''),
		},
		body: JSON.stringify({ action, ...payload }),
		signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined,
	});
	const data = await res.json().catch(() => ({ error: 'bad response' }));
	if (res.status === 401 && action !== 'login' && action !== 'register') {
		logout(); // stale/forged token: back to the door
		return data;
	}
	if (data.state) safeSave(STATE_KEY, data.state);
	return data;
}

export async function auth(action, username, password) {
	const data = await call(action, { username, password });
	if (data.token) {
		safeSaveStr(TOKEN_KEY, data.token);
		safeSave(STATE_KEY, data.state);
	}
	return data;
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
