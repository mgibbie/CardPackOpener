# Pokemon Upscale 2 — the world's dead venues, and the player's safety net

> **STATUS: FULLY COMPLETE (2026-09-03).** All seven batches shipped in the
> suggested order D→A→B→C→E→F→G as PRs #215–#221:
> **D** #215 (save export/import, D1 daily backups + UNDO, full-save sync,
> repel re-offer, adventure journal) · **A** #216 (contests on real
> pokeemerald data: 354 moves/96 opponents/berry flavors, berry blender,
> ribbons on the mon) · **B** #217 (Bug-Catching Contest, all 8 Trick House
> rooms — BFS proved rooms 2/3 shipped untraversable, doors opened in
> place — Ruins of Alph slide puzzles into the item rooms) · **C** #218
> (roaming legendaries w/ persistent wounds, Shoal Cave tides on the live
> Clock + Shell Bell hermit, apricorn trees restored + Kurt's balls) ·
> **E** #219 (secret bases on all ~70 authentic behavior-detected spots w/
> friend visits, escrowed async trades w/ exactly-once deliveries, the
> friends INBOX badge) · **F** #220 (Heal Block/Electrify/Ion Deluge
> implemented; follower fallbacks for the 855 sheet-less species; dead-move
> + doubles audits pinned by tests; NOTE: the shipped evo data has no trade
> evolutions, so there was nothing to fire) · **G** #221 (CONTROLS screen:
> every shortcut listed and rebindable; mobile film pass). Tests:
> savesafety 32 · contest 41 · venues 44 · livingworld 33 · social 34 ·
> stragglers 18 · inputs 14.

2026-09-02, after Upscale 1 closed completely (PRs #196–#213: caps, boss AI,
postgame retention, world depth, deep cuts, Safari, Game Corner, music/SFX/
animations, intro cleanup, battle resume, move swapping). This round comes
from a fresh gap audit of the shipped data versus the shipped code.

**The headline pattern this time: whole authentic VENUES exist as maps with
no engine behind them.** The transpile carried every building; the systems
inside them never came:

| venue | maps shipped | code |
|---|---|---|
| Pokémon Contest halls | 17 | none |
| Secret Bases | 24 | none |
| Trick House | 15 | none |
| Shoal Cave (tides) | 12 | none |
| National Park Bug-Catching Contest | 4 | none |

The music for most of these ALREADY plays (MUS_CONTEST, MUS_TRICK_HOUSE,
MUSIC_BUG_CATCHING_CONTEST shipped in the music pass) — walking into a
contest hall today sounds right and does nothing.

Run batches on command, PR-sized as usual. Impact 1–5 / effort S-M-L.

---

## Batch A — Pokémon Contests (the flagship) **[5/5 · L]**

Every Hoenn city has a hall; Lilycove has the master hall; all inert.
- Five categories (Cool/Beauty/Cute/Smart/Tough) × four ranks.
- Condition comes from BERRY FEEDING (a simplified Pokéblock: feeding a
  berry raises its flavor's category, sheen caps total feeds) — reuses the
  berry system that already grows on every route.
- The appeal round: 3 AI rivals, 5 turns, moves appeal by their contest
  category (harvest per-move contest data from pokeemerald), jam/combo
  lite. A canvas mini-scene in the battle-UI idiom.
- RIBBONS on the summary screen (contest ranks + champion + a few
  milestone ribbons retroactively) — visible, collectible payoff.

## Batch B — Minigame venues **[3/5 · M each]**

1. **Bug-Catching Contest** (National Park, Tue/Thu/Sat via the already-live
   VAR_WEEKDAY): 20 sport balls, keep ONE catch, timed, judged score
   (species rarity + level + stats), 1st/2nd/3rd prizes; winner keeps the mon.
2. **Trick House**: the 8 puzzle floors as light tile puzzles (find the
   scroll, reach the Trick Master) with escalating rewards — 15 maps of
   content behind one interaction layer.
3. **Ruins of Alph puzzles**: 4 slide-puzzle chambers (canvas mini-game);
   solving one opens that chamber's Unown letters into the wild pool.

## Batch C — Living-world systems **[3/5 · M]**

1. **Roaming legendaries**: Raikou + Entei (Johto), Latios/Latias (Hoenn)
   roam route-to-route (move when you change maps), flee-prone battles,
   dex/map hint of their current route once seen. Uses the legendary battle
   plumbing from Upscale 1.
2. **Shoal Cave tides**: high/low tide on a real 6-hour cycle (the Clock is
   already live), swapping the two layout variants; Shoal Salt/Shell →
   SHELL BELL from the hermit.
3. **Apricorns + Kurt**: apricorn trees on Johto routes (berry-tree
   machinery), Kurt turns them into the seven ball types next day.

## Batch D — Save safety & QoL **[4/5 · S-M]**

The battle-resume scare showed how precious the save is.
1. **Save export/import**: a Settings row that downloads the whole
   overworld save as a file and restores from one — the user-facing backup.
2. **Server save history**: keep the last N daily `ow:` snapshots in D1;
   an owner/self-service "restore yesterday's save" flow.
3. **Repel re-prompt** (gen-5 QoL): when a repel runs out, offer another.
4. **Adventure journal**: a small rolling log (badges, catches, evolutions,
   contest wins) on the trainer card.

## Batch E — Social (friends infra already live) **[4/5 · M-L]**

1. **Secret Bases**: claim one of the 24 base spots, decorate from a small
   catalog (D1-persisted), and FRIENDS' bases render in your world when
   visiting — the classic flex, powered by the existing friends/visit code.
2. **Async friend trades**: offer a mon to a friend mailbox-style (the
   async-PvP mail pattern), they counter-offer, both sides confirm —
   trade evolutions finally fire for real trades.
3. **Async-PvP discoverability** (the one leftover from the old overworld
   plan): surface challenges in the Friends menu with a badge.

## Batch F — Fakemon finish + move-engine stragglers **[2/5 · S-M]**

1. Audit the Ransei 389 for missing FOLLOW/overworld sprites (896 files
   exist; verify coverage, fill gaps from battle sprites).
2. The "12 custom moves missing" claim from the old battle-content audit:
   verify against today's engine (most power-0 moves are computed-power and
   fine); implement what's genuinely dead.
3. Interception-class noops that machinery now allows: HEAL BLOCK (gate the
   central heal paths) and ELECTRIFY/ION DELUGE (type rewrite at useMove).

## Batch G — Mobile & input polish **[3/5 · M]**

Still open from the August audit: touch-target sizing across the new menus
(Game Corner, safari bar, PC search), a landscape-phone pass on the new
overlays, and key REBINDING in Settings (the S/F/C/R single-key shortcuts
are un-discoverable and un-remappable today).

---

## Suggested order and why

**D → A → B → C → E → F → G.** D first because it's small and protects
everything else (the save is the game). A is the flagship — contests turn
17 dead buildings into the game's biggest new system and give berries a
second life. B and C are medium wins that make the world feel alive and
scheduled. E leans on multiplayer infra that already exists. F and G are
cleanup passes that can ride along anytime.

**Standing exclusions honored:** no dailies as a system (swarms/outbreaks
deliberately NOT proposed; the bug contest keys to weekdays, which the
user-approved VAR_WEEKDAY siblings already do), no link-play rooms, no
Battle Frontier decomp scripts, Hoenn2 stays the map-editor sandbox.
