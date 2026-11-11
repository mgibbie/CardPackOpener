// build_watch.js — tell a player whose tab predates the live deploy to reload.
//
// The code revalidates on every page load (_headers: max-age=0, must-revalidate), so
// a deploy reaches every player the next time the page loads. But a tab that is
// never reloaded keeps running the code it started with, for hours. 2026-11-10
// (bug:1794355764652, instinctgauntlet): the Sky Pillar fix (#1049) was live at
// 23:42Z and the player was told so, but their tab had loaded before it. At 00:09Z
// they walked the summit on the OLD code (two RAYQUAZA, no awakening) and reported
// the fix as broken; their 00:44Z save still held the cry var the new code would
// have re-armed on its first map load.
//
// No build step stamps a version (Pages copies the repo as-is), so the version IS
// the code: at start, read the ETag of every overworld module this page loaded;
// then, every CHECK_MS and whenever the tab comes back into view, read them again
// (HEAD, no body). A changed ETag means a newer deploy is live -> `onStale` once.
// Responses without an ETag (the local test servers) are ignored, so this is inert
// anywhere but the real site.
const CHECK_MS = 15 * 60 * 1000;
const VISIBLE_MIN_MS = 2 * 60 * 1000;   // a tab flicking in and out of view checks at most this often
const PARALLEL = 8;

try { performance.setResourceTimingBufferSize?.(2000); } catch (e) {}

let baseline = null;     // url -> etag at start
let lastCheck = 0, timer = null, notified = false, onStaleCb = null, checking = null;
export const buildWatchState = { stale: false, changed: [], checks: 0, watched: 0 };

const norm = t => (t ? String(t).replace(/^W\//, '') : null);

// the overworld's own code modules this page loaded (same origin)
export function watchedUrls() {
	let entries = [];
	try { entries = performance.getEntriesByType('resource'); } catch (e) { return []; }
	const out = new Set();
	for (const e of entries) {
		let u;
		try { u = new URL(e.name, location.href); } catch (err) { continue; }
		if (u.origin !== location.origin || !/^\/overworld\/[^/]+\.js$/.test(u.pathname)) continue;
		out.add(u.origin + u.pathname);
	}
	return [...out];
}

async function etags(urls) {
	const res = new Map();
	let i = 0;
	const worker = async () => {
		while (i < urls.length) {
			const u = urls[i++];
			try {
				const r = await fetch(u, { method: 'HEAD', cache: 'no-store' });
				const t = r.ok ? norm(r.headers.get('etag')) : null;
				if (t) res.set(u, t);
			} catch (e) { /* offline: no answer, no verdict */ }
		}
	};
	await Promise.all(Array.from({ length: Math.min(PARALLEL, urls.length) }, worker));
	return res;
}

export async function checkBuild() {
	if (checking) return checking;
	checking = (async () => {
		lastCheck = Date.now();
		if (!baseline) {
			baseline = await etags(watchedUrls());
			buildWatchState.watched = baseline.size;
			return false;
		}
		buildWatchState.checks++;
		const now = await etags([...baseline.keys()]);
		const changed = [...now].filter(([u, t]) => baseline.get(u) !== t).map(([u]) => u);
		if (!changed.length) return false;
		buildWatchState.stale = true;
		buildWatchState.changed = changed;
		if (!notified && onStaleCb) { notified = true; try { onStaleCb(changed); } catch (e) {} }
		return true;
	})();
	try { return await checking; } finally { checking = null; }
}

// onStale(changedUrls): called once, when a newer deploy is first seen
export function startBuildWatch({ onStale, intervalMs = CHECK_MS } = {}) {
	if (timer || typeof fetch !== 'function') return;
	onStaleCb = onStale || null;
	checkBuild();
	timer = setInterval(() => { if (!buildWatchState.stale) checkBuild(); }, intervalMs);
	try {
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible' && !buildWatchState.stale && Date.now() - lastCheck > VISIBLE_MIN_MS) checkBuild();
		});
	} catch (e) {}
}

export const STALE_BUILD_TEXT = 'A NEWER VERSION of the game is live — fixes this page has not loaded yet.\n\nReload the page (F5) to play it. Your progress is saved.';
