# Unhandled `special` triage — 2026-09-23

`main.js` `runSpecial()` handles ~36 specials; everything else is a silent no-op
(a store-writing query answers 0). Re-run the numbers with:

    node tools/triage_specials.mjs          # summary + HIGH detail
    node tools/triage_specials.mjs --all    # every name

**418 names, 1,841 call sites.** The tool tiers each by what its silence costs:
reachable from a player trigger (NPC / sign / step / map hook / post-battle
script, excluding labels main.js intercepts or blocks), cosmetic vs query vs
action, facility vs story, and whether the script goes on to set flags / warp /
give (stakes).

| tier | names | sites |
|---|---|---|
| HIGH | 67 | 327 |
| MED | 122 | 302 |
| LOW | 229 | 1,212 |

The tool over-reports: it cannot see native systems that replace a script
before it runs. The key question per HIGH item is **does its silence BLOCK
progress, or does the script carry on and only skip content?** Most action
specials sit in scripts that go on to set their own story flags, so a no-op
skips a scene or a battle rather than stranding the player.

## Verified blocker — fix next

- **`DoSpecialTrainerBattle` — Mossdeep Space Center, Steven multi battle
  (Hoenn main story).** No battle runs, `VAR_RESULT` never reads as a win, and
  the script falls through to `SetCB2WhiteOut` — the LOSS path — every time.
  The Space Center is what gates Steven's HM08 Dive and the road to Seafloor
  Cavern / Sootopolis. Needs a native multi battle (Steven + player vs Maxie +
  Tabitha), or at minimum a doubles battle whose outcome lands in VAR_RESULT.
  Companions in the same script: `ReducePlayerPartyToSelectedMons`,
  `LoadPlayerParty`, `SavePlayerParty`.

## Verified covered natively — not bugs

- **Legendaries.** `interact()` runs a native `LEGENDARY_ENCOUNTERS` battle
  before any NPC script. Every main-region legendary object sits on its native
  tile: Mewtwo, the birds, the Regis, Mew, Lugia (Bottom), Rayquaza. The only
  uncovered objects are the four **Hoenn2** copies (region not yet playable)
  and a Lugia object on `NavelRock_Base` (the native one is on Bottom).
- **NPC trades** — intercepted by label in `runScriptLabel` (`trades.js`).
- **Starters** (`ChooseStarter`) — the hand-authored Fork B intro grants them.
- **Kurt's apricorns** (`SelectApricornForKurt`) — native service after the
  Slowpoke Well.
- **Frontier / Trainer Hill / battle tents** — natively reimplemented and
  their scripts are plot-blocked.

## Content skipped, not blocking (lower priority)

The script continues and sets its own flags; the player only misses the beat:

- Hoenn: Wally's tutorial battle (`LoadWallyZigzagoon`, `StartWallyTutorialBattle`,
  `InitBirchState`), Mirage Tower collapse effects, Maxie's orb effect,
  national dex upgrade, cycling-road challenge, move relearner, Lilycove
  elevator animation.
- Kanto: old man's catching tutorial, Resort Gorgeous, Cinnabar Norma trade.
- Johto: gifts that silently give nothing — **Dratini** (Dragon Shrine),
  **Odd Egg** (day care), **Shuckle** (Mania) — plus the haircut brothers,
  Daisy's grooming, Buena's password, Kenji, the Celebi shrine event,
  `InitRoamMons` (Burned Tower beasts; check against the native roamers).

The Johto gifts are the most player-visible of these: the NPC's text says a
Pokémon was given and none arrives.

## Queries that default to 0 on reachable scripts (worth a pass)

`GetStarterSpecies` (Kanto Champion's team picks by starter), `NameRival`,
`IsGrassTypeInParty`, `IsEnigmaBerryValid`, `IsMirageIslandPresent`,
`GetPlayerAvatarBike`, `CheckRelicanthWailord` (Sealed Chamber). Each routes the
script down its "no" branch.
