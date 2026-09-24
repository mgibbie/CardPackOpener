# AI partner battles: plan — 2026-09-23

**Goal:** doubles where the second slot on the player's side belongs to an
AI-controlled NPC trainer with their own party, as in pokeemerald's
`BATTLE_TYPE_INGAME_PARTNER` multi battles. The first consumer is Steven at the
Mossdeep Space Center. After that come any Frontier multi rooms we choose to
support.

## Where things stand

- `startSpaceCenterBattle()` (main.js, PR for the space-center fix) runs Maxie +
  Tabitha as an ordinary **double**. The player fields their own two leads and
  Steven does not fight. The story branch is correct (a win sets `VAR_RESULT = 1`,
  a loss blacks out), but the battle is not the one the game stages.
- battle.js doubles has no concept of a partner. The player's side is
  `a.me` and `a.meAlly`, both taken from `a.party`:
  - The player picks both actions: `pushPlan` flips `actionFor` 0→1.
  - `checkFaintsD` refills either slot from `a.party`.
  - `livingMine()` decides blackout.
- A doubles battle is detected from a regex on the trainer's display name
  (`/TWINS|COUPLE| & |SR\. AND JR/`, `_startTrainer`). The Space Center name
  contains " & " to trip it.

## Decomp reference

- `src/battle_tower.c` `sStevenMons`, all with fixed IVs of 31:
  - METANG Lv42, Brave: Light Screen / Psychic / Reflect / Metal Claw
  - SKARMORY Lv43, Impish: Toxic / Aerial Ace / Protect / Steel Wing
  - AGGRON Lv44, Adamant: Thunder / Protect / Solar Beam / Dragon Claw
  - The EV spreads are in the source; carry them over.
- `ReducePlayerPartyToSelectedMons` / `ChooseHalfPartyForBattle`: the player
  brings **3**, and the partner brings 3.
- `battle_controller_player_partner.c`: the partner's controller. It picks moves
  with the same battle AI as foes, and picks its target and its replacement
  itself.
- Before building, check the win/lose rule in `battle_main.c` and
  `battle_script_commands.c`. I believe the battle is lost only when **both** the
  player's and the partner's mons are down, but confirm it in the decomp.

## Design

### 1. Battle-start API: say "double" and "partner" outright

`battle.startTrainer(party, foeParty, info, cb)` takes new `info` fields:

- `info.double: true` forces doubles. It replaces the display-name regex, which
  stays only as a fallback for the old callers.
- `info.partner: { name, class, party: [mon...] }` gives the AI teammate.

With a partner:

- `a.me` comes from the player's party.
- `a.meAlly` comes from `partner.party[0]`.
- `a.partnerParty` holds the partner's party.

### 2. Who owns each mon

Add `a.ownerOf(mon)` → `'player' | 'partner' | 'foe'`. Everything that assumes
"my side = `a.party`" goes through it:

- **Faint refill (`checkFaintsD`):** the partner's slot refills from
  `partnerParty`, and the player's slot from `a.party`. A side whose owner has no
  mons left stays empty, and the other owner fights on alone.
- **Blackout:** decided by whatever rule the decomp check above finds, not by
  `livingMine()` alone.
- **EXP / EVs (`grantExp`, `awardEvs`):** only the player's mons earn them. The
  partner's mons earn nothing, and nothing of theirs is saved.
- **Switch menu / party screen:** lists only the player's mons.
- **Bag:** items target only the player's mons.
- **Catching:** blocked. Scripted trainer battles block it already.
- **Level-up, move-learn and evolution prompts:** never fire for partner mons.
- **Friendship, Pickup, Pokérus and other after-battle effects:** player's mons
  only.

### 3. The partner takes its own turn

- In `pushPlan`, when the ally slot is the partner's, skip `actionFor = 1` and do
  not ask the player.
- Plan the partner's action inside `resolveDoubleTurn`, the same way the foes'
  actions are planned there. Reuse the foe AI (`matchupScore` + `chooseFoeMove`),
  aimed at `livingFoes()`.
- Add a small partner-only guard so Earthquake-type spread moves don't hit the
  player's mon. The code already knows which moves hit the partner (lines
  4737–4743).
- Keep the choice deterministic under the seeded battle RNG, so snapshots replay
  the same way.

### 4. Persistence and resume

`toSnapshot` / `restore` (battle.js ~1000–1045) record `meAllyIdx` against
`a.party`. Add:

- `partnerParty` (full mon objects; they are not in the save)
- `meAllyOwner`

Rules:

- A snapshot taken mid-partner-battle must resume frame-exact (owner rule, see
  memory *snapshot fidelity*).
- An older snapshot without these fields resumes as a plain double, as it does
  today.

### 5. UI

- The partner's mon uses the ally back-sprite slot and gets its own HP bar
  label, e.g. "STEVEN's METANG".
- Send-out line: "STEVEN sent out METANG!"
- The partner's own turn needs no menu. Show one message line when it moves:
  "METANG used PSYCHIC!"
- Portrait layout: check that the ally HP box has room for the owner prefix
  (`tools/perf-snap.cjs` portrait shots).

### 6. The Space Center, done properly

- `ChooseHalfPartyForBattle` opens a pick-3 party screen. The party menu already
  has a select mode for the Frontier; reuse it.
  - Cancelling sets `VAR_RESULT = 0`. The script then runs `LoadPlayerParty`
    and loops back to Steven's prompt, which is correct with a real picker.
- `SavePlayerParty` / `ReducePlayerPartyToSelectedMons` / `LoadPlayerParty`
  keep the unpicked mons aside and restore them afterwards. Battle damage stays
  on the mons that fought, as in the decomp.
  - The save must never be left holding only the reduced party. Snapshot the
    full party under a recovery key before reducing, and restore from that key
    at boot if a crash leaves it behind. Same rule as every other save path: no
    wipe.
- `startSpaceCenterBattle` passes
  `info.partner = { name: 'STEVEN', party: <sStevenMons built with fixed IVs/nature/EVs/moves> }`
  and `info.double = true`.
  - Steven's mons are built fresh for each battle.
  - The regex display name becomes plain "MAXIE & TABITHA".

### 7. Other consumers (after Steven)

- Battle Frontier / Battle Tower multi rooms, if the native frontier ever adds
  them. `frontier.js` has no multi mode today.
- Any hand-authored tag battle, such as a region-portal event or a rival team-up.
  The API in §1 makes this a data-only change.

## Tests (`overworld/tests/partner_test.mjs`)

All driven through `interact()`, with seeded RNG.

1. Talk to Steven, pick 3, and the battle starts:
   - `meAlly` is METANG and is owned by the partner.
   - The player is asked for only one action per turn.
2. Over a few turns the partner acts on its own and never targets its own side
   with a single-target move.
3. The player's 3 all faint: the battle continues or ends per the decomp rule,
   and the test asserts that rule.
4. Win:
   - `VAR_RESULT = 1` and the "defeated" branch runs.
   - The full 6-mon party is restored.
   - Only the player's mons gained EXP.
5. Snapshot mid-battle, reload, and the partner's slot and party resume exactly.
6. Kill the page between Reduce and Load, reboot, and the full party is back.
7. Regression: `doubles_test`, `battleresume_test`, `scriptedbattle_keys_test`
   and `giftspecials_test` all still pass.

## Order of work

1. §1 + §2 + §3 behind `info.partner`, where no current caller sets it. Run the
   unit tests plus the doubles regressions.
2. §4 (snapshots).
3. §5 (UI) and portrait perf-snap.
4. §6: Space Center pick-3 + Steven. Then run the full overworld gate
   (`node overworld/tests/run-all.mjs`) before merging.
