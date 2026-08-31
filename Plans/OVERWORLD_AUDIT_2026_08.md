# Overworld RPG — audit, 2026-08-31

Four parallel audits (battle engine, progression/content, UX/QoL, data integrity)
against the current tree. The previous plan (`OVERWORLD_IMPROVEMENT_PLAN.md`) is
exhausted: batches A/B/C/E/G shipped, D was skipped by user call, and F's last
item (async Pokémon PvP) turns out to be live already — `async-create` with
`game: 'pokemon'` at `main.js:4615`. Ransei rift (`main.js:2645`) and dex
milestones (`pokedex.js:39`) also shipped.

Every claim below was verified at file:line. Findings the audits raised but that
turned out to be **healthy** are recorded at the bottom so they aren't re-audited.

The organising discovery: **this game's problem is not missing content, it is
built content the code cannot reach.** Nine of the top eleven items are a handful
of lines each and unlock things that already exist.

---

## Tier 0 — built but unreachable (small fixes, enormous unlock)

### 1. The KANTO and HOENN champions cannot be fought — the whole post-game is dead
Blue and Wallace carry `script: "0x0"` in their map JSON, so `Trainers.claims()`
(`trainers.js:144-146`) never spawns them — it needs a script with a roster.
Their battle lives only in an `onFrame` scene gated on `VAR_TEMP_1`, and
`main.js:2843` skips any `value: 0` entry whose var was never written:

```js
if (e.value === 0 && !Story.hasVar(e.var)) continue;
```

`VAR_TEMP_1` is in no `STORY_SEED`, and the only scripts that set it are the
champion's own `EnterRoom` and the Hall of Fame — a chicken-and-egg. Johto works
only because Lance's object carries a real script (`LancesRoomLanceScript`).

Everything champion-gated is therefore unreachable:
- the **entire Battle Frontier** — 7 facilities, `frontier.js`, `factoryspec.js`, 7 Brains (`main.js:1371`)
- **9 legendaries** — 3 Regis, Latios, Deoxys, Mew (`main.js:2408-2417`), Mewtwo
- **4 ferry islands** — Sevii, Southern, Birth, Faraway (`main.js:1367-1370`)
- the **Grand Champion finale** (`main.js:408`)

`postgame_test.mjs` misses it because it crowns the player directly with
`Badges.crown('HOENN')` (line 51) instead of engaging the champion in the world.
**A test that seeds the end state cannot detect an unreachable entrance.**

Fix: seed `VAR_TEMP_1: 0` per region, or whitelist the two `ChampionsRoom`
`EnterRoom` labels past the `hasVar` guard, or give Blue/Wallace real scripts. **XS.**

### 2. Every cave in the game is empty
`encounters.js:56` resolves `land` only via `world.isTallGrass()`, which is
strictly `behaviorAt === MB_TALL_GRASS` (`engine.js:375`). **222 maps have a
populated `land` table that can never fire** (216 reachable): Mt. Moon, Rock
Tunnel, Victory Road, Cerulean Cave, Ice Path, Granite Cave, Diglett's Cave, all
7 Tanoby chambers. Gen 3 fires land encounters on cave floor too.

Closing over evolutions this makes **25 species permanently uncatchable** —
aron/lairon/aggron, bagon/shelgon/salamence, trapinch/vibrava/flygon,
makuhita/hariyama, snorunt/glalie/froslass, cacnea/cacturne, baltoy/claydol,
absol, mawile, sableye, torkoal, tropius, spinda, wynaut.

Fix: widen the `kind` test to accept the cave/dirt behavior band. **S — one condition.**

### 3. Johto and JohKanto have zero water, fishing and rock-smash tables
| region | land | water | fishing | rock_smash |
|---|---|---|---|---|
| KANTO | 102 | 49 | 49 | 14 |
| HOENN | 87 | 56 | 54 | 5 |
| HOENN2 | 72 | 51 | 49 | 5 |
| **JOHTO** | 66 | **0** | **0** | **0** |
| **JOHKANTO** | 23 | **0** | **0** | **0** |

Surf has no payoff and all three rods are inert across half the game; every Johto
water species (Tentacool, Chinchou, Qwilfish, Remoraid, Corsola, Mantine) is
uncatchable. The day/night overlay can't cover for it — `DAYNIGHT` is land-only
across all 91 maps. **M — data generation.**

### 4. Doubles Protect is a softlock
`battle.js:1853` clears `protectedTurn` inside a `for (const mon of [a.me, a.foe])`
loop (line 1827), so allies never reset. `actorMons()` (`battle.js:688`) is the
doubles-aware iterator and is used elsewhere in the same function. Once a foe ally
Protects (line 1211), the check at line 1119 blocks every move aimed at it
**forever** — and you cannot flee a trainer battle. The same loop also starves
allies of Wrap chip, Yawn and Aqua Ring. **XS — swap the iterator.**

### 5. Six elevators are hard softlocks
`warpTo` (`main.js:2110`) `console.warn`s and leaves the player standing when
`fileFor` misses. Silph Co (11 inbound warps), Rocket Hideout (7), Trainer Tower
(9), Celadon and both Lilycove dept stores (5 each), Marine Cave (8) have no
connections and no `-1` back-warp. Fly is blocked indoors (`main.js:2286`) and
Escape Rope is `kind: 'key'` with no effect. Goldenrod's lift is fine — it uses
`dest_warp_id: -1` → `backWarp()`. Fix: fall through to `backWarp()`. **S.**

### 6. Every TM/HM item ball hands out a junk item
`items.js:16` does `camel.replace(/\d+$/, '')` — that suffix-strip exists for
`ItemRareCandy2`, but for `ItemTM37` the digits *are* the identity, so the id
becomes `"tm"` and `tmMoveId` (`main.js:1499`, needs `^tm(\d+)$`) returns null.
29 balls, including HM07 Waterfall in Icefall Cave. **XS — one regex guard.**

### 7. Five encounter tables are mis-keyed after the Kanto rename
No `MAP_KANTO_*` id has an entry in `encounters.json`. Kanto Victory Road and
Kanto Safari Zone North (228 grass tiles, the largest live grass area in the game)
have nothing to catch, while `MAP_VICTORY_ROAD_1F` — Emerald's map — is serving
FireRed's roster. **XS — re-key 5 entries.**

### 8. `nidoran-m` / `nidoran-f` typos can start a battle with zero Pokémon
`trainers.json` `classPools` uses hyphens; the species table uses `nidoranm` /
`nidoranf`. `buildMon` returns null with no retry (`trainers.js:269-278`), so a
Youngster or Lass can enter battle with an empty party. **XS — two characters.**

### 9. 42 dangling evolutions from a key-shape mismatch
`species_extra.json` carries `ho_oh` / `mr_mime` / `nidoran_m` / `raichualola`
where `species_battle.json` uses `hooh` / `mrmime` / `nidoranm` / `raichu_alola`.
33 of the 42 targets exist under the other spelling; 19 regional-form pre-evos
(`vulpix_alola`, `slowpoke_galar`, `zorua_hisui`…) have their `evos` stranded on
an orphan key and can never evolve. **S — one normalisation pass.**

### 10. Navel Rock — 40 finished maps with no way in
The complete FRLG Ho-Oh/Lugia island: `NavelRock_Entrance` through `_Summit`,
`_BasePath_B1F-B11F`, `_SummitPath_2F-5F`. All 40 unreachable, referenced by no
`.js`. One `FERRY_DESTS` row (`main.js:1362`) opens a large post-game dungeon.
**XS to open.** (Both mascots already live in Johto, so it wants a new draw.)

### 11. Three Battle Tents are enterable and inert
Slateport, Verdanturf and Fallarbor lobbies are all reachable, but their scripts
are hard-blocked (`main.js:2876`, `/_BattleTent/`) and `FACILITY_LOBBIES`
(`main.js:428`) lists only the seven Frontier lobbies. The player walks into three
buildings in three towns and nothing happens. `frontier.js:15` already has the
right shape — a tent is a `{rounds: 3, level: 'party', bpWin: 1}` config plus
three rows. **S — and unlike the Frontier this is NOT champion-gated, so it is
mid-game content.**

---

## Tier 1 — mobile is half-broken

`index.html:48` — `body.touch #bar { display: none }` hides `#hud` **and**
`#objective`. Everything the overworld tells a roaming player goes through
`hud.textContent`: map name on arrival, "party healed", "X was sent to the box",
"the Day Care egg is ready", the rift warning, stuck-load recovery — plus the
persistent `NEXT:` quest objective. A phone player sees **none of it**, and a
caught Pokémon silently vanishes into a box. Nothing draws overworld text to the
canvas as a fallback. The whole "where do I go next" system is built
(`quest.js:286`) and then hidden. **S — a canvas toast band fed by the same writes.**

`toggleBike` has exactly one trigger in the codebase — the `c` key
(`main.js:1884`). There is no touch button, no START-menu entry, and bike items
are `kind: 'key'` which the bag doesn't handle. Cracked floors require
`player.biking` (`engine.js:506`), so **Sky Pillar is impossible on a phone**.

The d-pad calls `setPointerCapture` per button (`main.js:1913`), so a thumb
sliding from UP to LEFT keeps firing UP — every direction change needs a lift and
re-press, and diagonals are impossible. There is no tap-to-move.

---

## Tier 2 — systems built, then never wired up

The same "declared but read nowhere" pattern as the held items, at scale:

- **Repel / Super Repel / Max Repel** appear *only* at `bag.js:238-240`. `encounters.roll` has no hook, and `kind: 'misc'` isn't handled by bag use. Long caves have no mitigation. **S.**
- **142 of 318 abilities are inert** — 637 slots across 545 species (**31% of the dex**). `buildMon` rolls uniformly, so ~1 in 3 caught Pokémon has a no-op ability. Includes Stance Change (Aegislash), Illusion (Zoroark), Protean, Magic Bounce, the trapping trio, Gale Wings. `heavymetal`/`lightmetal` being inert also silently breaks Heavy Slam / Heat Crash / Low Kick / Grass Knot, which *are* implemented.
- **27 status moves are hard-wired to "But it failed!"** (`battle.js:299-311`) behind a comment reading *"no held items or no allies in this game"* — **both premises are now false.** 1678 TM/tutor entries teach one; Helping Hand alone is teachable to 597 species.
- **Rapid Spin doesn't clear hazards** (zero occurrences in `battle.js`) while the foe AI rates hazards at 95 in the opening turns. Removal is Defog-only.
- **No high-crit-ratio or always-crit moves exist at all** — 532 species learn one; Scope Lens is weaker than intended as a result.
- **Multi-turn moves are plain single hits** — Outrage/Thrash lock nothing (strictly-better 120 BP, no drawback), Rollout/Fury Cutter never ramp, Future Sight fires immediately.
- **Two-turn moves are never semi-invulnerable** — Fly/Dig/Dive give free hits; 7 more (Shadow Force, Phantom Force, Meteor Beam…) have no charge turn at all. Nothing in the game breaks Protect.
- **Hidden Power is Normal-type 60 BP** for all **845** species that can learn it. Same for Judgment, Techno Blast, Multi-Attack, Tera Blast.
- **Doubles turn order ignores Trick Room, Tailwind, Choice Scarf, Quick Claw and Unburden** (`battle.js:3120` sorts on raw speed; singles handles all five at `2196-2206`). Trick Room gives the *opposite* of its message.
- **Doubles foe AI picks uniformly at random** (`battle.js:3105`) with random targets — `chooseFoeMove()` is never called. The comment directly above says *"each foe picks its strongest move"*.
- `whiteHerb`, `mentalHerb`, `starfberry`, `cleansetag`, `machobrace` have inert or empty payloads. `cleansetag` is reachable — a ¥1000 pickup that does nothing.

---

## Tier 3 — content and feel

- **No music of any kind.** `data/sounds/` holds cries plus exactly five SFX. `sound.js` (29 lines) already has lazy-load, volume and autoplay handling; `settings.js:9` already exposes SOUND. A Pokémon game with no music is missing its most recognisable sense.
- **JohKanto is mute** — 0 of 135 maps has a script file, so 283 NPC/coord events are inert. Walkable but socially dead. Re-run `clone_region.mjs` including scripts+strings.
- **381 silent signs** across 84 maps (`main.js:726` has no `runScriptLabel` fallback), including every dept-store elevator button and every Game Corner slot machine.
- **200 pickup refs resolve to items not in `bag.js`** — they enter the bag named but with no `kind` and no price, unusable and unsellable. Includes a phantom `soilberry` ×16 from `BERRY_TREE_..._SOIL_2` being parsed as a berry named "soil".
- **81 item balls never render** (`parseBallScript` returns null, `loadForMap` skips).
- **Hoenn has no Town Map art** — `flydata.js:99` has `hoenn: null`, so the largest region with 16 fly destinations renders as a bare dot grid.
- **Celebi does not exist anywhere** (0 hits); JohKanto has no legendaries at all.
- **Orphaned dungeons**: Sealed Chamber + the Braille Regi chain, Shoal Cave high tide (no warp anywhere targets `*_HIGH_TIDE_*`), Abandoned Ship hidden floor (the Deep Sea Tooth/Scale line), S.S. Tidal (3 maps, no inbound warp — yet `regionparity_test.mjs:56` asserts Scott's scene there "is armed", on a map nobody can stand on).
- **Bag is one flat 305-item list** with no pockets and no sort — 7 rows in the overworld, **2 rows in a portrait battle**, arrow-key navigation only. `ITEMS[id].kind` already exists to key tabs off.
- No nickname prompt on capture; no "use another ball" and no last-ball memory; PC only openable at a Center counter despite 240 storage slots; party SWITCH only promotes to lead; summary shows a verbal IV judge but no numeric IVs, no EVs at all, and no move power/accuracy.
- No battle-animation speed toggle (durations are hardcoded literals).

---

## Hoenn2 — its own project (L)

`grep -rni hoenn2 --include=*.js overworld/` returns **nothing**. It has 321 maps,
247 layouts, 305 script files, 28 Centers, and **98 encounter tables** (better
wild coverage than live Johto), and all 432 trainer events resolve to real
rosters. What it has is zero presence in every runtime registry: `badges.js`,
`quest.js`, `portals.js`, `flydata.js`, `trainers.js`, `main.js` — 0 each.

Three blockers beyond the wiring:
1. **Sootopolis City and gym 8 do not exist** (7 of 8 gyms cloned), so `Badges.count('HOENN2')` can never reach 8 and the League gate can never open. Cave of Origin, Seafloor Cavern (the villain climax crawl), Safari Zone and S.S. Tidal are also uncloned.
2. **It reuses Hoenn's exact script names**, so beating Hoenn2's Roxanne awards the *Hoenn* Stone Badge, and `events.js:12`'s single global story store means a Hoenn-completed save enters Hoenn2 with its plot pre-resolved. `main.js:231` already has the precedent fix — JohKanto is disambiguated by sniffing the map id.
3. **Zero inbound edges** — BFS from PalletTown reaches 1168/1638 maps and none of Hoenn2's 321. JohKanto has 15 inbound edges by comparison.

---

## Verified healthy — do not re-audit

- **No flags are read-but-never-set** anywhere in code or ported scripts (full scan, 0 results).
- Species/move/trainer/trade **reference** integrity is essentially perfect: 0 encounter species missing (6656 slots), 0 trainer species missing (3782 mons), 0 learnset/TM/moveset moves missing, 0 missing species sprites (1751), 0 broken map connections, 0 out-of-bounds fly destinations, 0 missing layouts.
- All 93 `MOVE_FX` payload fields are read — the inert-payload bug did **not** recur in the move layer.
- Core battle machinery is sound: Struggle, PP + charge-turn refund, confusion self-hit, infatuation, freeze/sleep, Toxic ramp, Leech Seed, weather chip, screen/terrain/field timers, hazards on both sides, accuracy/evasion stages, Prankster priority, singles Trick Room.
- Only 5 of 271 status moves lack a table entry, and 1 species learns any of them — `deadmoves_test.mjs` really did close that hole.
- Gym-leader rematches work via the VS Seeker with badge-scaled levels.
- Autosave is genuinely automatic; the manual SAVE entry is redundant, not missing.
- Text speed, auto-run, move relearner, type-effectiveness hints, HP colour thresholds, status badges, EXP bar with tap-to-skip, PC boxes with release/sort, 46 fly destinations, quest log, touch d-pad + safe-area insets, portal tutorial — all present and test-covered.

---

## Suggested order

**Batch 1 — Tier 0.** Eleven independent small fixes; every one is a confirmed
bug, not a judgement call. Together they restore the entire post-game, 216
dungeons, 25 species, Surf/fishing across two regions, and remove four softlocks.
This is more player-visible value than any feature could buy.

**Batch 2 — mobile.** Canvas toast band, a bike route for touch, d-pad slide.
Small, and #1 also fixes mobile navigation confusion for free.

**Batch 3 — doubles.** The Protect softlock ships in batch 1; turn order, AI and
ally-support moves are a coherent follow-up in one file.

**Batch 4 — the inert-systems sweep.** Repel, the ability triage (~20-25 of the
142), the ally-support status moves, Rapid Spin, crit tiers, Hidden Power.

**Batch 5+ — music, JohKanto scripts, Hoenn2.** Each its own project.

Test gates: every batch lands with a headless suite in `overworld/tests/`; run in
chunks, the full set exceeds the 10-minute shell cap. Note the lesson from
finding 1 — **assert the entrance, not just the end state.**
