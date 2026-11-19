// ow_readonly.js — the VIEWER page (/overworld/?follow=<friend>, /overworld/?journey=<id>) is read-only, by construction.
//
// The overworld save has a history of stale-write rollbacks (a cached copy written back over a newer one): a page that
// only WATCHES someone must never write the watcher's own save. ow_follow.js runs instead of the game's boot, so none of
// the game's save paths start (no hydrate, no autosave or heartbeat, no tab lock, no scripts). This is the second wall:
// main.js imports this module FIRST, so before any other overworld module runs, on a viewer page,
//   - every localStorage write or removal of a game key ('magepunk_*', except the account's own 'magepunk_mp_*') is
//     dropped, whoever makes it (safeSave, the story store, a raw setItem);
//   - every /api/mp call that writes the player's game or presence (ow-save, heartbeat, publish-*, run-*, ...) is
//     refused without leaving the page.
// What a viewer may still do: read (world-state, owreplay-get, state, friends), and chat with the other watchers.
export const VIEW_PARAMS = (() => {
	try {
		const q = new URLSearchParams(location.search);
		if (q.get('follow')) return { mode: 'follow', who: String(q.get('follow')).trim().toLowerCase().slice(0, 40) };
		if (q.get('journey')) return { mode: 'journey', id: String(q.get('journey')).slice(0, 60) };
	} catch (e) { /* no location: not a viewer */ }
	return null;
})();
export const VIEW_ONLY = !!VIEW_PARAMS;

/** What the guard turned away, for the tests: { keys: [...], actions: [...] }. */
export const refused = { keys: [], actions: [] };
const GAME_KEY = k => /^magepunk_/.test(k) && !/^magepunk_mp_/.test(k);
// the writes a watcher's page has no business sending (its own save, its presence, a broadcast of its own)
export const DENY_ACTIONS = /^(ow-(?!load$).*|heartbeat|publish-.*|run-(save|clear)|base-save|owreplay-put|async-.*|repair-.*|gift-.*|trade-.*|xtrade-.*|challenge|accept-challenge|mail-.*)$/;

if (VIEW_ONLY) {
	try {
		const proto = Object.getPrototypeOf(localStorage);
		const set = proto.setItem, rm = proto.removeItem, clear = proto.clear;
		proto.setItem = function (k, v) { if (this === localStorage && GAME_KEY(String(k))) { if (refused.keys.length < 200) refused.keys.push(String(k)); return; } return set.call(this, k, v); };
		proto.removeItem = function (k) { if (this === localStorage && GAME_KEY(String(k))) { if (refused.keys.length < 200) refused.keys.push(String(k)); return; } return rm.call(this, k); };
		proto.clear = function () { if (this === localStorage) return; return clear.call(this); };
	} catch (e) { /* no storage: nothing to protect */ }
	try {
		const f = window.fetch;
		window.fetch = function (input, init) {
			try {
				const url = typeof input === 'string' ? input : (input && input.url) || '';
				if (/\/api\/mp(\?|$)/.test(url) && init && typeof init.body === 'string') {
					const a = String(JSON.parse(init.body).action || '');
					if (DENY_ACTIONS.test(a)) {
						if (refused.actions.length < 200) refused.actions.push(a);
						return Promise.resolve(new Response(JSON.stringify({ error: 'a watching page changes nothing' }), { status: 403, headers: { 'content-type': 'application/json' } }));
					}
				}
			} catch (e) { /* not JSON: let it through */ }
			return f.apply(this, arguments);
		};
	} catch (e) { }
}
