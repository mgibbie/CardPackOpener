# Magepunk66 Design Wiki

Read-only reference site (Pokémon, moves, abilities, and per-region encounters &
trainers), served at **michaelgibalerio.com/designwiki**.

## Editing content (designers)

The site reads the JSON files in **`designwiki/data/`**. To change something,
edit the relevant file in this repo (via the GitHub web editor or a pull
request) and commit — the live site updates after GitHub Pages redeploys.

- `data/pokemon.json`  — `{ id: { num, name, types[], baseStats{}, abilities[], levelUpLearnset[], learnset[] } }`
- `data/moves.json`    — `{ id: { name, type, category, basePower, accuracy, pp, priority } }`
- `data/abilities.json`— `{ id: { name, description, pokemon[] } }`
- `data/regions.json`  — `{ region: { label, maps: { MAP_ID: { name, encounters[], trainers[] } } } }`

Keep the JSON valid (commas, quotes). IDs are lowercase (e.g. `pikachu`,
`tackle`, `static`); species/move references use those IDs so cross-links work.

## Regenerating from the game

This data is seeded from the Magepunk66 game project (`wiki/build.py` there).
Re-seeding overwrites edits, so only do it to pull a fresh snapshot from the game.

No build step — it's plain static HTML/CSS/JS.
