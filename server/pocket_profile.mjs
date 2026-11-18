// POCKET ENHANCED PROFILES — a player's public card (owner's third improvement list, 2026-11-18, "yes to all": "Profile
// card. Tap any player's name (lobby, ranked board, tournament bracket) to see their emblems, rating, record, favourite deck
// and a showcase of 3 cards they choose", and "Emblems on the ranked board and in online lobbies").
//
// Row (an exact key, the player's own, written only by them):
//   pkprof:<user>  { emblem, emblems, showcase: [print ids], deck, at }
//     emblem    the emblem they show (emblems.js id) — only one their solo progress (pksolo:<user>) has earned
//     emblems   how many they have earned (counted from that progress when they last saved)
//     showcase  up to 3 printings — only ones their collection (pkcol:<user>) holds
//     deck      their favourite deck's name, as they call it (short, plain text)
// The rating and record come from the ranked row (pkrank:<user>, this season) when the card is asked for.
import { readProgress } from '../pocketenhanced/js/solo.js';
import { cleanCollection } from '../pocketenhanced/js/collection.js';
import { EMBLEMS } from '../pocketenhanced/js/emblems.js';

export const PROFILE = Object.freeze({ SHOWCASE: 3, DECK_CHARS: 30 });
const EMB = new Set(EMBLEMS.map(e => e.id));
/** A player's profile row, or null. */
export async function profileOf(store, name) { const p = name ? await store.get('pkprof:' + name) : null; return p && typeof p === 'object' ? p : null; }
/** The emblem a profile shows (a known id), or null. */
export const emblemOf = p => (p && EMB.has(p.emblem) ? p.emblem : null);
const plain = (x, n) => [...String(x || '')].filter(c => c.charCodeAt(0) >= 32 && c !== '<' && c !== '>').join('').trim().slice(0, n);

export async function handlePkprof({ action, body, store, username, json, now }) {
	if (!username) return json({ error: 'not logged in' }, 401);
	if (action === 'pkprof-set') {
		const soloRow = await store.get('pksolo:' + username), solo = soloRow ? readProgress(soloRow.solo) : null, earned = Object.keys((solo && solo.emblems) || {}).filter(k => EMB.has(k));
		const emblem = String(body.emblem || '');
		if (emblem && !earned.includes(emblem)) return json({ error: 'that emblem is not earned yet' }, 400);
		const shows = Array.isArray(body.showcase) ? body.showcase.map(String).slice(0, PROFILE.SHOWCASE) : [];
		if (shows.length) {
			const colRow = await store.get('pkcol:' + username), col = (colRow && cleanCollection(colRow.col)) || { prints: {} };
			const bad = shows.find(p => !((col.prints || {})[p] > 0)); if (bad) return json({ error: 'a showcase card must be in your collection' }, 400);
		}
		const row = { emblem: emblem || null, emblems: earned.length, showcase: [...new Set(shows)], deck: plain(body.deck, PROFILE.DECK_CHARS), at: now };
		await store.setJSON('pkprof:' + username, row);
		return json({ ok: true, profile: row });
	}
	if (action === 'pkprof-get') {
		const name = plain(body.name, 40); if (!name) return json({ error: 'whose?' }, 400);
		const [p, r] = await Promise.all([profileOf(store, name), store.get('pkrank:' + name)]);
		const season = new Date(now).toISOString().slice(0, 7), rk = r && r.season === season ? r : null;
		return json({ name, emblem: emblemOf(p), emblems: p ? p.emblems | 0 : 0, showcase: p && Array.isArray(p.showcase) ? p.showcase.slice(0, PROFILE.SHOWCASE) : [], deck: p ? p.deck || '' : '',
			rating: rk ? rk.rating : null, best: rk ? rk.best | 0 : null, games: rk ? rk.games | 0 : 0, wins: rk ? rk.wins | 0 : 0 });
	}
	return json({ error: 'unknown action' }, 400);
}
