// save.js — what Pocket Enhanced keeps on this device. A match is its recipe: { v, config, actions } (engine.js: the
// seed, the players' decks, and every action taken). It is saved after every action, so a reload resumes on the exact
// step; a finished match is kept as a replay (the last 12) and can be shared as a link (?replay=<packed recipe>).
// Nothing here throws into the game: a broken or out-of-date save is simply not offered.
import { ENGINE_VERSION, replay as rebuild, deckError } from './engine/engine.js';

export const RUN_KEY = 'magepunk_pocket_run_v1';
export const REPLAYS_KEY = 'magepunk_pocket_replays_v1';
export const DECKS_KEY = 'magepunk_pocket_decks_v1';
export const PREFS_KEY = 'magepunk_pocket_prefs_v1';
const MAX_REPLAYS = 12, MAX_DECKS = 20, MAX_ACTIONS = 6000;

const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

/** A fresh random seed (the only randomness outside the engine: which match to play). */
export function randomSeed() {
	const a = new Uint32Array(2);
	try { crypto.getRandomValues(a); } catch (e) { a[0] = Date.now() >>> 0; a[1] = (Math.random() * 2 ** 32) >>> 0; }
	return (a[0].toString(36) + a[1].toString(36)).toUpperCase().slice(0, 10);
}

/** Is this a recipe this engine can play? -> the rebuilt state, or null. */
export function rebuildRecipe(r) {
	try {
		if (!r || r.v !== ENGINE_VERSION || !r.config || !Array.isArray(r.actions) || r.actions.length > MAX_ACTIONS) return null;
		return rebuild(r.config, r.actions);
	} catch (e) { return null; }
}
export const recipeOf = (config, actions, extra) => ({ v: ENGINE_VERSION, config, actions: actions.slice(), ...(extra || {}) });

export function saveRun(config, actions, you) { return write(RUN_KEY, recipeOf(config, actions, { you, at: Date.now() })); }
export function clearRun() { try { localStorage.removeItem(RUN_KEY); } catch (e) { /* nothing to clear */ } }
/** The match in progress on this device: { recipe, S } or null (a finished or unplayable one is not offered). */
export function loadRun() {
	const r = read(RUN_KEY), S = rebuildRecipe(r);
	return S && !S.over ? { recipe: r, S } : null;
}

export function listReplays() { const l = read(REPLAYS_KEY); return Array.isArray(l) ? l.filter(x => x && x.recipe) : []; }
export function addReplay(config, actions, summary) {
	const l = listReplays();
	l.unshift({ at: Date.now(), summary, recipe: recipeOf(config, actions) });
	while (l.length > MAX_REPLAYS) l.pop();
	while (l.length > 1 && !write(REPLAYS_KEY, l)) l.pop();   // storage full: keep fewer
	if (l.length === 1) write(REPLAYS_KEY, l);
}

/** The player's own decks: [{ name, deck: [card ids], energy: [types] }]. Only legal decks are kept. */
export function listDecks() { const l = read(DECKS_KEY); return Array.isArray(l) ? l.filter(d => d && typeof d.name === 'string' && Array.isArray(d.deck) && Array.isArray(d.energy) && !safeErr(d)) : []; }
const safeErr = d => { try { return deckError(d.deck, d.energy); } catch (e) { return 'unreadable'; } };
export function saveDeck(d) {
	const err = safeErr(d); if (err) return err;
	const name = String(d.name || 'My deck').slice(0, 24) || 'My deck';
	const l = listDecks().filter(x => x.name !== name);
	l.unshift({ name, deck: d.deck.slice(), energy: d.energy.slice() });
	return write(DECKS_KEY, l.slice(0, MAX_DECKS)) ? null : 'this device has no room to save it';
}
export function deleteDeck(name) { write(DECKS_KEY, listDecks().filter(x => x.name !== name)); }

export const prefs = () => read(PREFS_KEY) || {};
export const setPref = (k, v) => { const p = prefs(); p[k] = v; write(PREFS_KEY, p); };
