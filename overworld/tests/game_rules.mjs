// game_rules.mjs — the HOUSE RULES every game on the site follows, and one row per game saying where it plugs into
// each shared system. game_rules_test.mjs reads the real registries and the game's own source and fails when a game
// in the Games switcher is missing from any of them. The rules themselves (what each one means, and how to meet it):
// Plans/NEW_GAME_RULES.md. A new game: copy Pair of Pears' row, change the names, and make the test pass.
//
// The rules (owner, 2026-11-20):
//   ui        the Balatro / Micatro look: the page loads the shared kit (site/ui/balatro.css, directly or through
//             micatro/css/micatro.css) and its buttons click with the kit's sounds (site/ui/sfx.js or Micatro's
//             sound.js). No music required.
//   controls  keyboard (arrows/WASD, Z=A X=B C=X V=Y), controller and touch, through site/input.js startInput(), and
//             the Games switcher (the top bar or site/switcher.js; switcher_games_lib.mjs PAGES boots it).
//   stars     stars are the site's one currency: the game pays (and, if it sells anything, charges) in site/stars.js.
//   watch     a friend can watch a run live (a publish-<x> action on the server, a kind in livewatch's watchHref and the
//             watch hub), a finished run can be replayed (site/replaylib.js) with clip links (site/clip.js), and
//             spectators can bet on it (server/bets.mjs MARK).
//   gate      a LANES row in select-changed.mjs so its own changes run its own suites.
//
// Row fields:
//   id        the switcher.js ENTRIES id
//   page      its page (repo-relative)
//   src       the folders / files that are the game's own code (searched for the imports and calls below); '!<path>' leaves one out
//   kind      its live kind (livewatch watchHref, watch/watch.js KIND_NAME)
//   publish   the server action that publishes a live run (server/mp.mjs)
//   replay    its replay library id (site/replaylib.js GAME_NAME + replayHref)
//   bets      its server/bets.mjs MARK key
//   lane      its select-changed.mjs LANES row
//   waive     { rule: 'why' } — ONLY the games that predate these rules. WAIVABLE (in game_rules_test.mjs) freezes the
//             list: a new game cannot be waived, and a waiver that is no longer needed fails the test until it is removed.
export const GAMES = [
	{ id: 'pairofpears', page: 'pairofpears/index.html', src: ['pairofpears/'], kind: 'pears', publish: 'publish-pears', replay: 'pears', bets: 'pears', lane: 'pairofpears' },   // THE REFERENCE: all rules, no waivers
	{ id: 'pocketenhanced', page: 'pocketenhanced/index.html', src: ['pocketenhanced/'], kind: 'pocket', publish: 'publish-pocket', replay: 'pocket', bets: 'pocket', lane: 'pocketenhanced' },
	{ id: 'scoundrel', page: 'scoundrel/index.html', src: ['scoundrel/js/', 'scoundrel/index.html'], kind: 'scoundrel', publish: 'publish-scoundrel', replay: 'scoundrel', bets: 'scoundrel', lane: 'scoundrel',
		waive: { stars: 'existing game, kept as it is (owner, 2026-11-20)' } },
	{ id: 'micatro', page: 'micatro/index.html', src: ['micatro/js/', 'micatro/index.html'], kind: 'micatro', publish: 'publish-micatro', replay: 'micatro', bets: 'micatro', lane: 'micatro',
		waive: { stars: 'existing game, kept as it is (owner, 2026-11-20)' } },
	{ id: 'micasurvivor', page: 'micasurvivor/index.html', src: ['micasurvivor/js/', 'micasurvivor/m3d/', 'micasurvivor/index.html'], kind: 'micasurvivor', publish: 'publish-micasurvivor', replay: 'micasurvivor', bets: 'micasurvivor', lane: 'micasurvivor',
		waive: { stars: 'existing game, kept as it is (owner, 2026-11-20)' } },
	{ id: 'pokechess', page: 'overworld/pokechess.html', src: ['overworld/pokechess/', 'overworld/pokechess.html'], kind: 'pokechess', publish: 'publish-pokechess', replay: 'pokechess', bets: 'pokechess', lane: 'overworld',
		waive: { stars: 'existing game, kept as it is (owner, 2026-11-20)' } },
	{ id: 'battlecards', page: 'battlecards/index.html', src: ['battlecards/'], kind: 'card', publish: 'publish-cardstate', replay: 'battlecards', bets: 'cards', lane: 'battlecards',
		waive: { stars: 'existing game: packs and dust, kept as it is (owner, 2026-11-20)' } },
	{ id: 'overworld', page: 'overworld/index.html', src: ['overworld/', '!overworld/pokechess/'], kind: 'world', publish: 'publish-world', replay: 'journey', bets: 'overworld', lane: 'overworld',
		waive: { stars: 'existing game: Pokémon money, kept as it is (owner, 2026-11-20)', controls: 'its own input door (ow_input.js + ow_gamepad.js), older than site/input.js' } },
	{ id: 'factory', page: 'overworld/index.html', src: ['overworld/', '!overworld/pokechess/'], kind: 'factory', publish: 'publish-factory', replay: 'overworld', bets: 'overworld', lane: 'overworld',
		waive: { stars: 'existing game: Battle Points, kept as it is (owner, 2026-11-20)', controls: 'the overworld\'s input door' } },
];
