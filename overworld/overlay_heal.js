// overlay_heal.js — the story overlays (the restored script ops, multichoices,
// fall-through, phone scripts, …) must not silently go missing for a session.
//
// Each loader used to swallow a failed fetch with `.catch(() => null)` and run
// the whole session on the raw transpile. That is exactly what stalled Ilex
// Forest's FARFETCH'D at position 5 (bug:1791938269646, 2026-10-14): without
// crystal_scriptvar_data.json the bird still walked its path but no script ever
// wrote wFarfetchdPosition, so talking to it again replayed the same walk and the
// quest never ended. getJSON already retries a few times; this is the layer after
// that: a loader whose fetch failed is reported and re-run in the background
// until it lands, and then the current map's scripts are rebuilt with it.
const failed = new Map();   // loader -> its file
const BACKOFF_S = [2, 5, 10, 20, 40, 60];
let timer = null, tries = 0, onHealed = null;

const report = msg => { try { globalThis.reportErr && globalThis.reportErr(msg, 'overlay_heal'); } catch (e) {} };

// the getJSON a loader is given: a failure marks that loader for healing
export function trackedGetJSON(getJSON, loader) {
	return url => getJSON(url).catch(e => {
		if (!failed.has(loader)) report(`story data failed to load: ${url} (${e && e.message}) — retrying in the background`);
		failed.set(loader, url);
		schedule();
		throw e;
	});
}

export function pendingOverlays() { return [...failed.values()]; }

// called once the game is up: rebuild the current map's scripts when something heals
export function startOverlayHeal(getJSON, healed) { onHealed = healed; globalThis.__owOverlayGetJSON = getJSON; schedule(); }

function schedule() {
	if (timer || !failed.size || !globalThis.__owOverlayGetJSON) return;
	const s = BACKOFF_S[Math.min(tries, BACKOFF_S.length - 1)];
	timer = setTimeout(heal, s * 1000);
}

export async function heal() {
	timer = null; tries++;
	const getJSON = globalThis.__owOverlayGetJSON;
	let any = false;
	for (const [loader, url] of [...failed]) {
		// healed only when EVERY file the loader asks for arrived (a loader can read several)
		let ok = false, bad = false;
		try { await loader(u => getJSON(u).then(j => { ok = true; return j; }, e => { bad = true; throw e; })); } catch (e) { bad = true; }
		if (ok && !bad) { failed.delete(loader); any = true; report(`story data recovered: ${url}`); }
	}
	if (any && onHealed) { try { await onHealed(); } catch (e) {} }
	schedule();
	return failed.size;
}
