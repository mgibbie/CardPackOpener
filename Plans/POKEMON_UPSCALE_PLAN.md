# Pokemon Upscale Plan — from "complete" to "great"

2026-09-02, from a three-agent audit (systems fidelity · progression arc · battle
engine/feel) run against current code, cross-checked by hand where a claim was
big enough to headline a batch. Predecessor: OVERWORLD_IMPROVEMENT_PLAN.md
(batches A-G, essentially done).

**Where the game actually stands.** The audits agree on a headline worth
believing: the *mechanics* are no longer the problem. The battle engine verified
deep (hazards, weather, terrain, screens, multi-turn, binding, Substitute,
Destiny Bond, priority brackets, crit/evasion stages, doubles redirection — all
present; the "23 dead moves" and both doubles bugs from older audits are FIXED).
Items, TMs, natures/IVs/EVs/shiny, breeding basics, trade-evo workarounds,
capture QoL — verified working. What remains splits cleanly into:

1. **One arc-breaking bug** (the postgame level-cap trap),
2. **Feel** — the AI picks moves naively, battles read slow and samey, there is
   NO MUSIC anywhere,
3. **Retention** — the game goes silent and rewardless exactly when the
   1751-dex / 87-legendary / Mt Silver endgame begins.

Run batches on command, PR-sized as usual. Impact 1-5 / effort S-M-L per item.

---

## Batch 1 — Correctness quickies (all S; do first) — DONE (PR #196)

1. **Fix the postgame cap-trap.** `levelCap()` returns early when
   `main < 100`, so the whole JohKanto ladder (120→255) is unreachable until
   `globalTier === 8` — but the Magnet Train opens on the JOHTO crown alone,
   which is achievable at tier 7 (Kanto/Hoenn on 7 badges). A player can clear
   all 8 JohKanto gyms and beat RED capped at Lv90, and the quest text
   actively sends them there ("A silent trainer is said to wait…").
   *Recommended fix:* let the JohKanto slice take over as soon as it exists —
   `return Math.max(mainPath, jkPath)` once `count('JOHKANTO') > 0` — no entry
   gate, no stranding, the open-world feel survives. (Alternative: gate the
   train on tier 8; rejected as it walls content that is already winnable.)
   Impact 5 · badges.js:305-317, quest.js:222, main.js:225-226. **[5/5 · S]**
2. **Status-cure items must work IN battle.** The battle bag lists Full Heal /
   Antidote / Awakening etc. as rank-1 medicine, and selecting one silently
   does nothing — `useItem` branches only on ball/ether/heal/revive. Reads as
   a broken game to anyone who tries it. One `cure` branch + consume + the
   foe's free move. battle.js:3947-3994 vs 3922. **[4/5 · S]**
3. **X-items act.** X Attack/Defend/Speed/Special/Accuracy, Dire Hit, Guard
   Spec are `kind:'misc'` "no mechanic" — shown in the bag, inert. The boost
   plumbing (`a.meBoosts`) already exists. bag.js:270-276. **[3/5 · S-M]**
4. **Catch EXP.** Catching ends the battle with zero exp; award participant
   exp on the `'caught'` branch like a KO. battle.js:3032-3035. **[2/5 · S]**
5. **Two inert held items.** Cleanse Tag (a ¥1000 buyable that does nothing —
   should cut wild rate while lead holds it) and Starf Berry (random sharp
   boost at low HP). bag.js:263, 250. **[1/5 · S]**
6. **Return/Frustration scale with friendship** instead of flat 102.
   battle.js:446. **[1/5 · S]**

## Batch 2 — Boss brains & battle pace (the "fights feel smart" batch) — DONE (PR #197)

7. **Damage-based AI with KO awareness.** The AI ranks moves by
   `basePower × STAB × effectiveness` — ignores Atk/SpA vs Def/SpD, stat
   stages, and current HP. Bosses pick resisted 120-power STAB over the
   neutral move that would win, and never finish a 5-HP target. Rank by
   estimated damage using the existing `statOf(mon, boosts, stat)`; add a
   strong preference for guaranteed KOs, priority-move sniping among lethal
   options. The single highest-leverage change in the whole plan.
   battle.js:2710-2748. **[5/5 · M]**
8. **Wire TEXT SPEED into battle.** Messages dwell a hard-coded 1.1 s each;
   the setting exists (`charsPerSec`) and battle.js never imports it. This is
   the grind tax on every single fight. battle.js:4076, settings.js:43.
   **[4/5 · S]**
9. **Level-up stat deltas.** Show the +HP +ATK… window instead of a silent
   recalc. battle.js:2979-2990. **[3/5 · S-M]**
10. **Floating stat/status feedback.** Reuse the existing `float()` to pop
    "ATK↑"/"BRN" on the sprite when stages/status change. battle.js:1553, 798.
    **[3/5 · S-M]**
11. **Boss polish pair.** Let bosses switch in doubles (currently singles-only)
    and make the AI potion a % heal instead of flat 120. battle.js:2756, 2836.
    **[2/5 · S]**

## Batch 3 — Sound & spectacle — SKIPPED (user call, 2026-09-02: "do the suggested order but skip 3")

12. **Music.** There is none — no overworld themes, no battle theme, no
    victory fanfare; sound.js is cries+sfx only. The single largest "feels
    like Pokemon" gap left. Needs: a bgm manager (loop + crossfade), a
    map→track table, battle/victory hooks, Settings volume.
    *Blocker to resolve first: track sourcing* — same class of question as
    the deferred 20 cries; decide the source before building the player.
    **[5/5 · L + assets]**
13. **Move animation variants.** Every move is lunge + type-tinted sparks.
    4-6 archetypes (beam sweep, physical slam + damage-scaled shake,
    projectile arc, self-buff glow, spread wave) break the monotony for a
    fraction of per-move work. battle.js:1955-1956, 4170-4176. **[4/5 · M]**

## Batch 4 — World depth (weather, abilities afield, utility moves) — DONE (PR #199)

14. **Map weather enters battle.** The in-battle weather engine is complete
    but `start()` takes no environmental value — Hoenn's sandstorm routes and
    rainstorms begin every fight in clear skies. Per-map weather table passed
    into `start`/`startTrainer`, seeded as endless. battle.js:643-689,
    main.js:2964. **[3/5 · M]**
15. **Overworld ability bundle.** Pickup (post-battle item roll), Flame
    Body/Magma Armor (halve egg steps), Synchronize (50% wild nature match) —
    all exist in battle, none afield. daycare.js:120, battle.js:567. **[3/5 · M]**
16. **Field-utility moves.** Sweet Scent (force encounter), Teleport (last
    Center), Dig (dungeon exit), Softboiled/Milk Drink (field heal transfer) —
    add to `HM_FIELD`. main.js:2465-2530. **[2/5 · M]**
17. **Per-species EV yields** (real yield table instead of +2-to-highest-stat)
    — makes targeted EV training possible. battle.js:2950-2961. **[2/5 · M]**

## Batch 5 — The postgame deserves players (guidance, rewards, legends) — DONE (PR #198)

18. **Region-aware objectives + a JOHKANTO quest arc.** Every objective
    surface keys off *starting* region, so the whole postgame is silent: on Mt
    Silver a Kanto starter reads "MEWTWO stirs in CERULEAN CAVE". Derive the
    displayed region from `Badges.regionOfMap` (exists), add JOHKANTO
    stage/objective/log (gym climb → RED → legendary hunt), JohKanto badge
    pips on the trainer card. quest.js:230-246, main.js:122, 4766-4785.
    **[4/5 · M]**
19. **Extend the reward ladder to the content that exists.** Dex milestones
    stop at 300 of 1751; nothing for all-87-legendaries, all-gold-symbols; RED
    — the hardest fight in the game — pays a flag and silence. Add 500/1000/
    1500/1751 milestones, a legends-complete reward, and a RED capstone
    (trophy + payload) mirroring `grantGrandChampionReward`. pokedex.js:35-46,
    main.js:424-432. **[4/5 · S-M]**
20. **Structure the legendary hunt.** 87 legendaries, zero UI: no
    caught/remaining counter anywhere, no hints — finding them means blind
    flood-crawling three regions' dungeons. An N/89 counter (card + dex
    header) plus a cheap per-region "rumor board" NPC naming the next
    un-caught lair. legendaries_postgame.js:25-29. **[3/5 · M]**
21. **A postgame money sink.** JohKanto trainers pay up to 255×8×2 and there
    is nothing to buy late. One premium vendor (rare candies, ability
    patches, bottle-cap-style IV items, held-item restock) — optionally
    daily-restocking, WHICH IS OPT-IN: the dailies batch was explicitly
    skipped once, so ship the vendor static and ask before adding the timer.
    bag.js:377-407. **[2/5 · M]**
22. **Async PvP discoverability (XS).** It turns out play-by-mail battles are
    FULLY BUILT (server + client + UI) — the old plan's "item 25" is done.
    It's just buried under FRIENDS→MAIL with no your-turn signal. Surface an
    indicator; nothing else. main.js:5343-5366. **[2/5 · XS]**

## Batch 6 — Deep cuts (each optional, order freely) — ALL DONE (PRs #200-#203)

Shipped in PR #200: 23 (true egg moves via gen_egg_moves.mjs + egg_moves.json),
24 (side Wide/Quick Guard, typed Future Sight/Doom Desire, ALL_ADJACENT spread
hits the ally with Telepathy exempting — Gale Wings turned out ALREADY
implemented; the audit claim was stale), 27 (PC box search, F key + FIND button).
The "skips" followed on user order ("do the batch 6 skips"):
- 25 Safari Zone (PR #201): fee/balls/steps + catch-only BALL/BAIT/ROCK/RUN
  battles, both zones (Fuchsia + Route 121), sessions persist.
- 26 Game Corner (PR #202): Voltorb Flip (voltorbflip.js, HGSS rules), COIN
  CASE coins (cap 9,999), coin counter, prize desk — Celadon/Goldenrod/
  Mauville/JohKanto Celadon + both prize rooms.
- 28 Asset debt (PR #203, cries amended by #204): the 391 silent fakemon
  briefly borrowed donor cries — REVERTED by user call ("no mons borrow
  cries"); silent species stay mute until they get an ORIGINAL recording,
  and the design wiki's "Missing Cries" page (gen_missing_cries.mjs) is the
  chip-away worklist: 391 silent + 63 groups sharing one byte-identical
  file. Also in #203: COACHING/DRAGON CHEER/EMBARGO/
  MAGIC ROOM/WONDER ROOM/HAPPY HOUR/CELEBRATE/HOLD HANDS implemented (the
  rest of the noops genuinely need missing machinery — interception,
  re-ordering, type rewrites — and now say so); the "19 exp curves" were 19
  duplicated curve SITES, already deduplicated into badges.js, whose single
  split curve is a documented design decision (per-species curves would
  re-level every save) — pinned by assetdebt_test so it can't regress.

23. **True egg moves** — inheritance currently can't grant anything the baby
    couldn't already learn; needs a per-species egg-move table from the
    decomps. daycare.js:184-191. **[3/5 · L + data]**
24. **Doubles fidelity set** — spread moves hitting the ally (currently
    exempt by design, making Telepathy inert), real Wide/Quick Guard
    (side-wide, category-gated — today aliased to plain Protect), typed
    Future Sight, Gale Wings. battle.js:2828, 313-314, 2465, 985. **[2/5 · M]**
25. **Safari Zone mechanic** (balls/bait/rocks/steps) or bless the current
    normal-battles behaviour explicitly. **[2/5 · M]**
26. **Game Corner** — slots or Voltorb Flip + coin case + prize corner (the
    arcade.js pattern exists for embedding). **[2/5 · L]**
27. **Box search/filter** over 240 slots (sorts exist, search doesn't).
    main.js:1581. **[1/5 · S]**
28. **Asset-debt cluster** (carried from Batch E): ~385 cry files for
    alt-forms/fakemon, 19 exp curves, and the 21 deliberately-noop status
    moves (do Coaching + Dragon Cheer first if doubles get love). **[1/5 ·
    M-L + assets]**

---

## Suggested order and why

**1 → 2 → 5 → 4 → 3 → 6.** Batch 1 removes the one arc-breaking bug plus the
"this looks broken" items in an afternoon of small diffs. Batch 2 is the
biggest feel-per-effort jump (every fight, every player). Batch 5 next because
this session just finished building the postgame CONTENT — guidance and rewards
are what convert it into retention. Batch 4 deepens the world. Batch 3's
animations can ride along any time; its music item is the largest single win
in the plan but should wait for a sourcing decision, not for code. Batch 6 à la
carte.

**Explicitly out (standing user calls):** dailies as a system (skipped batch D;
only the opt-in vendor restock above), Battle Frontier decomp scripts (native
reimpl owns them), link-play rooms, Hoenn2 (map-editor sandbox).
