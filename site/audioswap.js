// site/audioswap.js — the owner's AUDIO SWAPS, for every game on the site.
//
// The owner (the /audioswap/ page, mgibbie only) can say "where this plays, play that instead": a map's music, a battle
// theme, one sound effect, a whole track wherever it is used. The table is saved on the server (tuning-save, kind
// 'audio': owner only) and read by everybody (tuning-get: public), so a swap reaches every player without a deploy.
//
// A swap is one entry, "<kind>:<id>" -> "<replacement>":
//   ow.map:MAP_AZALEA_GYM       -> crystal_MUSIC_ROCKET_BATTLE     this map's music (overworld/ow_music.js)
//   ow.theme:emerald.gym        -> emerald_MUS_VS_CHAMPION         a battle/field theme, per soundtrack and role
//   ow.event:blender            -> emerald_MUS_SURF                the Berry Blender, the Contest stage
//   ow.bgm:firered_MUS_SURF     -> crystal_MUSIC_SURF              this track, wherever it would play (applied last)
//   ow.sfx:select               -> confirm                         an overworld sound effect (overworld/sound.js)
//   mt.sound:coin1              -> chips1                          a Micatro / Scoundrel / Pair of Pears sound
//   mt.music:base               -> /overworld/data/sounds/bgm/…    their music: a track key, or a file on this site
//   ms.music:forest, ms.sfx:hit -> another song / effect           MicaSurvivor (2D and 3D): made by a synthesizer
//   bc.sfx:damage               -> another effect                  Battlecards: made by a synthesizer
// The replacement "-" means silence.
//
// Each game asks through pick(kind, id, fallback): its own choice comes back when the owner has said nothing. The table
// is kept in localStorage so it is there at once on the next visit, and refreshed from the server at most every few
// minutes. Loaded as a module by the games that are modules, and by a <script type="module"> tag by those that are not
// (they read globalThis.AudioSwap).
const LS = 'audio_swaps_v1', LS_AT = 'audio_swaps_at', EVERY = 5 * 60 * 1000;
export const SWAPS = {};
export const SILENT = '-';

function fill(o) {
	for (const k of Object.keys(SWAPS)) delete SWAPS[k];
	if (o && typeof o === 'object' && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) if (typeof v === 'string' && v) SWAPS[k] = v;
}
const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };
try { const s = ls(); if (s) fill(JSON.parse(s.getItem(LS) || '{}')); } catch { /* none kept */ }

/** What plays for <kind>:<id>: the owner's replacement, or `fallback` (the game's own choice). "-" -> null (silence). */
export function pick(kind, id, fallback) {
	const r = SWAPS[kind + ':' + id];
	if (r == null) return fallback;
	return r === SILENT ? null : r;
}
/** Is there a swap for <kind>:<id>? */
export const has = (kind, id) => SWAPS[kind + ':' + id] != null;
/** Use this table from now on, and keep it for the next visit (the owner's page, after a save; the refresh below). */
export function setLocal(o) {
	fill(o);
	try { const s = ls(); if (s) { s.setItem(LS, JSON.stringify(SWAPS)); s.setItem(LS_AT, String(Date.now())); } } catch { /* full or private */ }
}
/** Ask the server for the table (unless asked a few minutes ago; force: ask anyway). Never throws. -> the table */
export async function refresh(force) {
	if (typeof location === 'undefined' || typeof fetch !== 'function' || !/^https?:$/.test(location.protocol)) return SWAPS;
	try {
		const s = ls(), at = +(s && s.getItem(LS_AT) || 0);
		if (!force && Date.now() - at < EVERY) return SWAPS;
		const r = await fetch('/api/mp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"action":"tuning-get"}' });
		if (!r.ok) return SWAPS;
		const j = await r.json();
		setLocal(j && j.audio || {});
	} catch { /* offline: what was kept stands */ }
	return SWAPS;
}
export const ready = refresh(false);
globalThis.AudioSwap = { SWAPS, SILENT, pick, has, setLocal, refresh, ready };
