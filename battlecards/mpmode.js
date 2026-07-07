// mpmode.js — the /magepunktest account layer. Battlecards pages run in
// "MP mode" when the URL carries ?mp=1 AND a login token exists; then the
// server (not localStorage) owns the collection, decks, and packs.
// Free play at /battlecards is untouched: different URL, different keys.
const TOKEN_KEY = 'magepunk_mp_token_v1';
const STATE_KEY = 'magepunk_mp_state_v1';
const API = '/api/mp';

export const hasToken = () => !!localStorage.getItem(TOKEN_KEY);
export const wantsMp = () => new URLSearchParams(location.search).has('mp');

// battlecards pages call this once: true = act as the test realm
export function mpMode() {
	if (!wantsMp()) return false;
	if (!hasToken()) { location.href = '/magepunktest/'; return false; }
	return true;
}

export async function call(action, payload = {}) {
	const res = await fetch(API, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: 'Bearer ' + (localStorage.getItem(TOKEN_KEY) || ''),
		},
		body: JSON.stringify({ action, ...payload }),
	});
	const data = await res.json().catch(() => ({ error: 'bad response' }));
	if (res.status === 401 && action !== 'login' && action !== 'register') {
		logout(); // stale/forged token: back to the door
		return data;
	}
	if (data.state) localStorage.setItem(STATE_KEY, JSON.stringify(data.state));
	return data;
}

export async function auth(action, username, password) {
	const data = await call(action, { username, password });
	if (data.token) {
		localStorage.setItem(TOKEN_KEY, data.token);
		localStorage.setItem(STATE_KEY, JSON.stringify(data.state));
	}
	return data;
}

export function logout() {
	localStorage.removeItem(TOKEN_KEY);
	localStorage.removeItem(STATE_KEY);
	if (!location.pathname.startsWith('/magepunktest')) location.href = '/magepunktest/';
}

// last known server state (refresh with call('state'))
export function cachedState() {
	try { return JSON.parse(localStorage.getItem(STATE_KEY)); } catch { return null; }
}

export async function freshState() {
	const data = await call('state');
	return data.state || cachedState();
}
