// owreset.js — owner tool: wipe the overworld save and start the intro again.
//
// Built for replaying the opening while hunting onboarding bugs, so it has to be
// exact about scope: the Pokemon world goes, Battlecards and the login do not.
//
// THREE THINGS THIS HAS TO GET RIGHT.
//
// 1. AN ALLOWLIST, NOT A PREFIX SWEEP. Both halves of the site use the
//    `magepunk_` prefix, and `magepunk_class_v1` is WRITTEN by the Battlecards
//    deck builder and only READ by the overworld — a sweep would delete a
//    Battlecards setting. So the keys are listed one by one, and KEEP is listed
//    too, so the next reader can see what was considered and spared.
//
// 2. THE SERVER COPY, CLEARED FIRST. The overworld save is mirrored to D1
//    (`ow:<user>`), and main.js's hydrateOw() treats the SERVER as authoritative
//    on boot — it overwrites localStorage from it. Clearing only the browser
//    would look like it worked and then quietly restore the old game on the next
//    load. `ow-save` replaces the stored blob outright, so an empty object wipes
//    it, and it is awaited before the redirect.
//
// 3. OWNERSHIP RE-VERIFIED SERVER-SIDE. The tile is revealed from the cached
//    username, which is a convenience only; this asks the server before touching
//    anything, the same way the map editor and sprite tuner do.
import * as MP from '../battlecards/mpmode.js';

// Everything the overworld owns. Ordered roughly as the game builds it up.
export const OW_RESET_KEYS = [
	// who and where you are
	'magepunk_region', 'magepunk_starter', 'magepunk_rival', 'magepunk_name', 'magepunk_pos_v1',
	// the story itself — flags, vars, fired one-shots
	'magepunk_story', 'magepunk_plot_fired',
	// your POKeMON
	'magepunk_party_v1', 'magepunk_box_v1', 'magepunk_daycare',
	// progression
	'magepunk_badges_v1', 'magepunk_hof', 'magepunk_defeated_v1', 'magepunk_rematch_v1',
	'magepunk_flypoints', 'magepunk_playtime',
	// pockets
	'magepunk_bag_v1', 'magepunk_money', 'magepunk_itemnames_v1', 'magepunk_repel_v1',
	// the Game Corner's COIN CASE and a live Safari Game
	'magepunk_coins_v1', 'magepunk_safari_v1',
	// what you have picked up off the ground, and what has regrown
	'magepunk_collected_v1', 'magepunk_berrytimes_v1',
	// the dex
	'magepunk_dex_v1', 'magepunk_dexclaims_v1',
	// Battle Frontier
	'magepunk_bp', 'magepunk_frontier_best', 'magepunk_frontier_symbols',
	// Contest rank progress (ribbons + condition live on the mons themselves)
	'magepunk_contest_v1',
	// the minigame venues: a running Bug-Catching Contest, Trick House stage,
	// and which Ruins of Alph puzzles are solved
	'magepunk_bugcontest_v1', 'magepunk_trickhouse_v1', 'magepunk_ruins_v1',
	// the adventure journal, the last repel used, and a battle left mid-fight
	// (the battle snapshot used to survive a reset — a fresh save would then try
	// to resume a fight belonging to the deleted game)
	'magepunk_journal_v1', 'magepunk_repellast', 'magepunk_battle_v1',
];

// Deliberately spared, and why. Kept as data so the test can assert it.
export const OW_KEEP_KEYS = {
	magepunk_mp_token_v1: 'your login — clearing it would sign you out',
	magepunk_mp_state_v1: 'the cached account state that goes with the token',
	magepunk_class_v1: 'BATTLECARDS: written by the deck builder, only read by the overworld',
	magepunk_settings: 'preferences (text speed, auto-run) — not progress, and annoying to lose on every run',
};

export function resetPlan() {
	const present = OW_RESET_KEYS.filter(k => { try { return localStorage.getItem(k) != null; } catch (e) { return false; } });
	return { keys: OW_RESET_KEYS, present };
}

// Wipe it. Returns { ok, cleared, server } or throws.
export async function resetOverworld() {
	// the SERVER first: hydrateOw() would otherwise restore the old save on boot
	let server = 'skipped';
	try {
		await MP.call('ow-save', { ow: {} });
		server = 'cleared';
	} catch (e) {
		// no network / logged out. The local wipe is still worth doing, but say so —
		// silently half-resetting is how you end up debugging a ghost.
		server = 'FAILED: ' + String(e?.message || e).slice(0, 80);
	}
	let cleared = 0;
	for (const k of OW_RESET_KEYS) {
		try { if (localStorage.getItem(k) != null) { localStorage.removeItem(k); cleared++; } } catch (e) {}
	}
	return { ok: true, cleared, server };
}

export function mount(anchorEl) {
	if (!anchorEl) return;
	anchorEl.addEventListener('click', async (ev) => {
		ev.preventDefault();
		let username = '';
		try { username = (await MP.call('state'))?.state?.username || ''; } catch (e) {}
		if (username !== 'mgibbie') { alert('Resetting the overworld is an owner tool.'); return; }

		const { present } = resetPlan();
		const kept = Object.entries(OW_KEEP_KEYS).map(([k, why]) => `  • ${k} — ${why}`).join('\n');
		const ok = confirm(
			`Reset your OVERWORLD game?\n\n`
			+ `This deletes your Pokemon world and starts the intro over:\n`
			+ `party and boxes, badges, bag and money, the Pokedex, story flags,\n`
			+ `region and starter, fly points, Battle Frontier records.\n`
			+ `${present.length} of ${OW_RESET_KEYS.length} saved items are currently set.\n\n`
			+ `It also clears the server copy, so it will not come back on the next load.\n\n`
			+ `NOT touched:\n${kept}\n\n`
			+ `Battlecards — decks, collection, gold, run modes — is untouched.\n\n`
			+ `This cannot be undone. Continue?`);
		if (!ok) return;

		const r = await resetOverworld();
		if (String(r.server).startsWith('FAILED')) {
			alert(`Cleared ${r.cleared} local items, but the SERVER copy could not be cleared:\n${r.server}\n\n`
				+ `Your old game may come back on the next load. Check you are online and try again.`);
			return;
		}
		location.href = '/overworld/';
	});
}
