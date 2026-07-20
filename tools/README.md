# tools

Design-wiki tooling for the web project. Self-contained — no dependency on the
(abandoned) Magepunk66 Love2D repo.

## gen_battlecards_design.py

Regenerates `designwiki/data/battlecards.json` (the "Design Work" backlog: undefined
keywords, pending paper/WUBRG cards, plane candidates, unimplemented HS cards, etc.).

```
python tools/gen_battlecards_design.py
```

Inputs:
- `../battlecards/cards.json` — the live card pool (what's already built).
- `tools/data/*` — bundled design sources (paper-card OCR, WUBRG assessment, the
  planned-card dex, class card lists). These are committed.
- `tools/data/hs_cards_full.json` — the full Hearthstone card dump, used only to
  list *unimported* HS cards. It is **gitignored** (large third-party data, not
  republished). Without it the four "Hearthstone — …" sections come out empty;
  everything else still generates. Drop the file in `tools/data/` to restore them.

To add plane backlog entries, edit the `PLANE_CANDIDATES` / `PLANE_REWORK` lists in
the script and drop a `plane_<slug>.jpg` into `battlecards/art/`.
