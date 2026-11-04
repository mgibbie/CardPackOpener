// species_basestats_map.mjs — how an overworld species id names its Pokémon
// Showdown entry, and the species whose stats are deliberately NOT Showdown's.
// Shared by species_basestats_test.mjs and tools/gen_showdown_basestats.mjs.

// our ids are Showdown's with an underscore before a form (zorua_hisui ->
// zoruahisui); the cosmetic letters share Unown's stats, and Minior's Core form
// is Showdown's plain `minior` (its Meteor form is `miniormeteor`)
export function showdownIdFor(id) {
	if (/^unown_/.test(id)) return 'unown';
	if (id === 'minior_core') return 'minior';
	return id.replace(/_/g, '');
}

// id -> why it intentionally differs. Empty: every canonical species and form
// matches Showdown. Add an entry ONLY for a deliberate design change.
export const EXCEPTIONS = {};
