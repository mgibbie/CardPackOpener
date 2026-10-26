// account_silo.js — one browser, several accounts: each account's LOCAL game data
// stays its own (bug:1792610921028).
//
// THE BUG. Every game on the site keeps its local copy in plain, global
// localStorage keys (magepunk_lorequest_v1, magepunk_party_v1, micatro_run_v1...).
// Login, create-account and logout only ever swapped the auth token, so a new
// account on a shared browser was shown the previous account's Lorequest run as
// its own RESUME card, and opened the previous account's Overworld game — which
// the overworld's sync would then have pushed up as the NEW account's save.
//
// THE FIX: an owner tag, and nothing moved. The browser's existing un-namespaced
// data belongs to ONE account, recorded in magepunk_local_owner_v1. That account
// (and guests) keep reading and writing those keys exactly as before, so no
// existing save is migrated, copied or rewritten. Any OTHER signed-in account gets
// its own namespace: this script, loaded first and synchronously on every page,
// redirects that account's game-data keys to `acct@<user>/<key>` inside
// localStorage.getItem / setItem / removeItem. The owner's data is never read,
// written or deleted while someone else is signed in.
//
// WHO OWNS UNTAGGED DATA (every browser on the day this ships):
//   * a page load by a signed-in account: that account. Its session predates the
//     tag, so it is the account the data was being played as (the last signed-in
//     user) — every existing player keeps their game with no change at all.
//   * a guest page load: 'guest' if there is no game data yet (a signed-in load
//     later takes a 'guest' tag over, as signing up does); if there IS data
//     nobody can say whose it is, so it is marked '?legacy' (still the guest's to
//     use — guests stay guests).
//   * CREATE ACCOUNT on a browser holding 'guest' data: the new account takes it
//     (the guest who signs up keeps their progress, as today). On '?legacy' data:
//     NOT the new account's — a brand-new account owns nothing yet. That is the
//     reported case.
//   * LOG IN on 'guest' / '?legacy' data: that account claims it (the last
//     signed-in user) — unless it already has a namespace of its own here.
// A tag naming a real account is never changed by anyone else signing in.
//
// Device preferences (text speed, key bindings, pad layout, theme) and the login
// itself stay global. Keys a game ALREADY namespaces per user (micatro_progress_v1:
// <u>, micasurvivor_save.mp:<u>) are not touched — only the global game keys are.
//
// ?silolog=1 logs the decision (user names and key COUNTS only; never a token).
(function () {
	'use strict';
	var LS;
	try { LS = window.localStorage; } catch (e) { return; }
	if (!LS || window.MagepunkSilo) return;
	var P = Storage.prototype;
	var rawGet = P.getItem, rawSet = P.setItem, rawRemove = P.removeItem, rawKey = P.key;
	var TOKEN = 'magepunk_mp_token_v1', STATE = 'magepunk_mp_state_v1', OWNER = 'magepunk_local_owner_v1';
	var LOG = /[?&]silolog=1\b/.test(location.search);
	// never per account: the login, this tag, and device preferences
	var DEVICE = { magepunk_mp_token_v1: 1, magepunk_mp_state_v1: 1, magepunk_local_owner_v1: 1,
		magepunk_settings: 1, magepunk_keys_v1: 1, magepunk_pad_v1: 1, magepunk_owsync_log: 1 };
	// the global game keys of the games that are not on the magepunk_ prefix
	var OTHER = { micatro_run_v1: 1, micatro_run_backup_v1: 1, micatro_replays_v1: 1, micatro_decks_v1: 1,
		micatro_cdeck_sel: 1, micatro_run_meta_v1: 1, micatro_run_sync_v1: 1, micatro_run_owner_v1: 1,
		micasurvivor_replays_v1: 1 };
	var OTHER_PREFIX = ['micasurvivor_rk.best2.', 'micasurvivor_rk.rep.'];
	function isAccountKey(k) {
		k = String(k);
		if (DEVICE[k]) return false;
		if (k.indexOf('magepunk_') === 0) return true;
		if (OTHER[k]) return true;
		for (var i = 0; i < OTHER_PREFIX.length; i++) if (k.indexOf(OTHER_PREFIX[i]) === 0) return true;
		return false;
	}
	function g(k) { try { return rawGet.call(LS, k); } catch (e) { return null; } }
	function s(k, v) { try { rawSet.call(LS, k, v); return true; } catch (e) { return false; } }
	function signedInAs() {
		if (!g(TOKEN)) return null;
		try { var st = JSON.parse(g(STATE) || 'null'); var u = st && st.username; return u ? String(u).toLowerCase() : null; } catch (e) { return null; }
	}
	function readOwner() {
		try { var o = JSON.parse(g(OWNER) || 'null'); return o && o.user ? String(o.user) : null; } catch (e) { return null; }
	}
	function writeOwner(user, why) { s(OWNER, JSON.stringify({ user: user, at: new Date().toISOString(), why: why })); }
	// does the GLOBAL (un-namespaced) scope hold any game data?
	function globalGameKeys() {
		var n = 0;
		try { for (var i = 0; i < LS.length; i++) { var k = rawKey.call(LS, i); if (k && isAccountKey(k)) n++; } } catch (e) {}
		return n;
	}
	function log(event, detail) {
		if (!LOG) return;
		try { console.log('[account-silo] ' + event + ' ' + JSON.stringify(detail)); } catch (e) {}
	}

	// does this account already have a namespace of its own on this browser?
	function hasNamespace(u) {
		try { for (var i = 0; i < LS.length; i++) { var k = rawKey.call(LS, i); if (k && k.indexOf('acct@' + u + '/') === 0) return true; } } catch (e) {}
		return false;
	}

	var me = signedInAs();
	var owner = readOwner();
	if (!owner) {
		var have = globalGameKeys();
		if (me) { owner = me; writeOwner(me, 'signed-in page load claimed untagged data'); }
		else { owner = have ? '?legacy' : 'guest'; writeOwner(owner, have ? 'guest page load found untagged data' : 'guest page load, empty'); }
	} else if (me && owner === 'guest' && !hasNamespace(me)) {
		// a guest's game, now signed in (the login normally settles this in onAuth)
		owner = me; writeOwner(me, 'signed-in page load claimed guest data');
	}
	// null: this page uses the global keys (the owner, or a guest)
	var scope = me && me !== owner ? me : null;
	var PREFIX = scope ? 'acct@' + scope + '/' : '';
	var ns = function (k) { return scope && isAccountKey(k) ? PREFIX + k : k; };
	log('decision', { user: me || '(guest)', owner: owner, scope: scope ? 'account namespace' : 'global keys', globalGameKeys: globalGameKeys() });

	if (scope) {
		P.getItem = function (k) { return rawGet.call(this, this === LS ? ns(k) : k); };
		P.setItem = function (k, v) { return rawSet.call(this, this === LS ? ns(k) : k, v); };
		P.removeItem = function (k) { return rawRemove.call(this, this === LS ? ns(k) : k); };
		// another tab's write arrives with the stored (namespaced) name: hand listeners
		// the name they asked for, and drop the owner's / other accounts' game keys,
		// which this page does not read
		var rawAdd = window.addEventListener, rawDel = window.removeEventListener, wrapped = new WeakMap();
		var wrap = function (fn) {
			if (typeof fn !== 'function') return fn;
			if (!wrapped.has(fn)) wrapped.set(fn, function (e) {
				if (!e || e.storageArea !== LS || e.key == null) return fn.call(this, e);
				var k = String(e.key);
				if (k.indexOf(PREFIX) === 0) {
					var view = { key: k.slice(PREFIX.length), oldValue: e.oldValue, newValue: e.newValue, url: e.url, storageArea: e.storageArea, type: e.type };
					return fn.call(this, view);
				}
				if (isAccountKey(k) || /^acct@/.test(k)) return;
				return fn.call(this, e);
			});
			return wrapped.get(fn);
		};
		// (a bare addEventListener(...) call from strict code has this === undefined)
		window.addEventListener = function (type, fn, o) { var w = this == null || this === window; return rawAdd.call(w ? window : this, type, type === 'storage' && w ? wrap(fn) : fn, o); };
		window.removeEventListener = function (type, fn, o) { var w = this == null || this === window; return rawDel.call(w ? window : this, type, type === 'storage' && w && wrapped.has(fn) ? wrapped.get(fn) : fn, o); };
	}

	window.MagepunkSilo = {
		user: me, owner: owner, scope: scope, prefix: PREFIX,
		isAccountKey: isAccountKey, storedKey: ns,
		// login / create-account (battlecards/mpmode.js auth), BEFORE the new login is
		// stored: settle who the untagged / guest data belongs to. Takes effect on the
		// next page load (login always navigates away).
		onAuth: function (action, username) {
			var u = String(username || '').toLowerCase();
			if (!u) return;
			var o = readOwner();
			var next = o;
			// an account that already has its own namespace here keeps it: it never
			// trades it for data nobody can vouch for
			if (o === u || hasNamespace(u)) next = o;
			else if (!o) next = action === 'register' && globalGameKeys() ? '?legacy' : u;
			else if (o === 'guest') next = u;
			else if (o === '?legacy' && action !== 'register') next = u;
			if (next !== o) writeOwner(next, action + (next === u ? ' claimed ' + (o || 'untagged') + ' data' : ' left untagged data unclaimed'));
			log('auth', { action: action, user: u, ownerBefore: o, ownerAfter: next, globalGameKeys: globalGameKeys() });
		},
	};
})();
