# Your own card pictures

Pocket Enhanced draws every card itself: the site's sprite for the Pokémon or Trainer, on a background painted in
code. If you have pictures you want on the cards instead, this is where they go.

1. Put one image per card in this folder, named by the card's id: `A1-036.webp`, `P-A-005.webp`, …
   The ids are the `id` of each card in `pocketenhanced/js/data/cards.js` (232 cards).
2. In `pocketenhanced/js/artconfig.js` set `base: '/pocketenhanced/art/'` (and `ext` if your files are not `.webp`).
3. Commit and merge: the folder deploys with the site.

A picture fills the card's art window (it is cropped to fit, so a landscape picture about 4:3 works best). The name,
HP, attacks and rules text are still drawn by the game. A card with no picture in the folder keeps its default art,
so the folder can be filled a few cards at a time.

To try a folder without changing the setting, a page can set `window.POCKET_ART = { base: '/pocketenhanced/art/', ext: 'webp' }`
before the game's script loads; the page test does exactly that with `example/`.

`example/P-A-001.png` is a plain test image (a flat colour block) the page test uses to check that a picture in the
folder is shown and that a card without one falls back. It is not used by the game.
