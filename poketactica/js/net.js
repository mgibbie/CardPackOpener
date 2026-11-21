// net.js — Poketactica on the site's live channel and tape store (stage 8). Spectating reuses the generic single-player
// channel (Scoundrel / Pair of Pears / PokéChess), through Micatro's publisher / spectator loops (micatro/js/net.js):
//   publish-poketactica {snapshot?, label, seq, over, won, replay?, bet?} -> the battle's view (engine/battle.js view():
//                        no seed, so a spectator sees what the player sees and no more); presence 'poketactica:<label>'
//   poketactica-state   {username, seq}                                   -> a FRIEND reads it (cap 10)
// A finished battle's recipe (replay.js) goes to the generic tape store (replay-put, game 'poketactica'): the account's
// replay library lists it and the battle's spectators are offered it at the end (/poketactica/?replay=<id>).
// Nothing here throws into the game.
import * as MP from '/battlecards/mpmode.js';
import { startPublisher as micPublisher, startSpectate as micSpectate } from '../../micatro/js/net.js';
import { packRecipe, unpackRecipe, REPLAY_ID_RE } from './replay.js';

export const isLoggedIn = () => MP.hasToken();
export const myName = () => MP.cachedState()?.username || null;
export const call = (action, body) => MP.call(action, body);
export const startPublisher = (getSnapshot, getLabel, more = {}) => micPublisher(getSnapshot, getLabel, { ...more, action: 'publish-poketactica' });   // (more.bet: spectator bets)
export const startSpectate = (username, handlers) => micSpectate(username, { ...handlers, action: 'poketactica-state' });
export const replayUrl = (id) => location.origin + '/poketactica/?replay=' + encodeURIComponent(id);

/** A finished battle's recipe up to the account's tape store -> its id, or null (a guest, offline, too large). */
export async function uploadReplay(recipe) {
	if (!isLoggedIn()) return null;
	try {
		const code = await packRecipe(recipe);
		const d = await MP.call('replay-put', { code, game: 'poketactica', label: ('Poketactica · ' + (recipe.label || 'a battle')).slice(0, 64) });
		return d && REPLAY_ID_RE.test(String(d.id || '')) ? d.id : null;
	} catch { return null; }
}
/** -> { recipe } | { error } (replay-get is public: a link opens for a visitor who isn't signed in) */
export async function fetchReplay(id) {
	if (!REPLAY_ID_RE.test(String(id || ''))) return { error: 'bad replay link' };
	try {
		const d = await MP.call('replay-get', { id: String(id) });
		if (!d || !d.code) return { error: (d && d.error) || 'not found' };
		const recipe = await unpackRecipe(d.code);
		return recipe ? { recipe } : { error: 'this replay could not be read' };
	} catch { return { error: 'offline' }; }
}
