# Poketactica — permanent loss (plan)

Owner, 2026-11-23: "You lose everything including your figurines that died they are gone. This also needs to be true in
regular Poketactica. If something dies in battle it is gone."

Build order (owner): **this first**, then Tower Defense (`POKETACTICA_TOWER_DEFENSE_PLAN.md`), then Mystery Maze
(`POKETACTICA_MYSTERY_MAZE_PLAN.md`).

**Built 2026-11-23** (test `overworld/tests/poketactica_perma_test.mjs`). As planned, except: the "in danger" note on
a unit's panel was left for the UI / playability pass, and a restore from the memorial is a function
(`figcol.js restoreFallen`) an owner repair calls, with no button in the game.

## The rule (owner's answers)

| Question | Answer |
|---|---|
| Where | **Story** and **Dungeon** (and Mystery Maze when it exists). **Not** Training Grounds, **not** Versus. Tower Defense towers can't faint. |
| When | The moment a figurine faints. No revive, and winning the battle does not bring it back. |
| Held item | Lost with it. |
| MicaSurvivor unlock | Stays (that unlock is add-only). |
| No figurines left | The "pick three starters" screen again, free. Nobody is ever stuck. |

Anything that knocks it out counts: a foe, a wild foe, a Geo chain, lava, poison / burn, your own friendly fire, recoil.

## How it works

1. **Lost at once, not at the results.** The page removes the figurine from the collection when the engine reports its
   faint (the `faint` event of a player-side unit), not when the results screen shows. Closing the tab, "Give up", a
   reload or dropping the saved battle can't save it. The engine does not change: a knockout is the same event it is
   today, so replays, spectating and the lockstep rules are untouched.
2. **A battle says whether it is deadly.** `setup.perma = true` is set when a Story or Dungeon battle starts. Battles
   already in progress when this ships (the "Resume battle" save) were started under the old rule and finish under it.
   Training, Versus and replays never set it.
3. **Gone means gone on every device: tombstones.** Today two devices' collections are joined by figurine id, so a
   figurine deleted on the phone would come back from the laptop's copy. The collection gains `gone: [id, …]` (ids only,
   newest 2,000). `cleanFigs` drops any figurine whose id is in `gone`; the 3-way merge and the first-link merge take the
   **union** of both sides' `gone`. The server (`ptfig-put` in `server/pocket_collection.mjs`) keeps `gone` and refuses to
   store a figurine listed in it.
4. **Its held item** is removed from `items` with it (the `uid` join in `figcol.js`).
5. **Trades and bets.** A figurine held in escrow (an open trade offer, a bet stake) can't be fielded today; that stays,
   so an escrowed figurine can't die. A figurine received in a trade is a normal figurine and can.
6. **The memorial (the backup the save rule asks for).** Each loss is appended to `fallen` in the collection: the whole
   figurine record, where it fell (map / floor), when, and what did it; the newest 50 are kept, each for 30 days. It is a
   screen in the camp ("Fallen": a flavour list), and it is the rollback: if a bug ever kills a figurine wrongly, the
   record is there to restore from with the existing repair offer (`repair-send`, the player presses Z). Restoring also
   takes the id out of `gone`. Nothing else can bring one back.

## What the player sees

- **First time**: a one-off warning before the first Story or Dungeon battle after this ships ("A figurine knocked out
  here is gone for good"), and a line in How to play.
- **In battle**: the forecast already shows when a hit would knock a target out; when the cursor is on one of *your*
  figurines inside the enemy range overlay, its panel says "in danger". A fainting figurine gets a distinct sound and a
  "… is gone" banner and log line.
- **Results**: a "Fallen" list (species, level, held item lost) above the EXP list.
- **Team screen**: Story and Dungeon show a small skull tag on the Sortie button ("figurines can be lost here");
  Training and Versus show "safe".
- **Empty collection**: the starters screen, as for a new player.

## Knock-on effects to check while building

- **Dungeon bosses and story bosses** become real risks; Focus Sash / Focus Band (already "hang on with 1 HP") become the
  only protection. No balance changes are planned here; the balance simulator (still on the list) should follow.
- **Free starters could be farmed** (lose all three on purpose, pick three more, trade them away). They are Lv 5 and the
  Shop sells them for 200 ★, so the gain is small. If it is abused: re-picked starters can't be traded for a day.
- **Stars and EXP** of a battle are unchanged: survivors still get theirs.
- **Evolution, moves, held screens**: nothing changes; a lost figurine simply isn't in the list.
- **The Figurine book** counts what you own now, so a loss can lower the count. "Met" is unaffected.

## Tests (each bug-shaped check is shown failing with the change taken out)

- A player figurine knocked out in a Story battle is out of the collection **before** the results, and still out after a
  reload mid-battle and after "Give up".
- The same in Dungeon. **Not** in Training, **not** in Versus, **not** in a battle resumed from before the rule.
- Its held item is gone; a survivor's is not.
- Tombstones: a stale copy of the collection (the lost figurine still in it) merged in does not bring it back, in the
  3-way merge, the first-link merge and on the real server (`ptfig-put` / `ptfig-get`).
- The memorial holds the record; the repair path restores it and clears the tombstone.
- Losing the last figurine leads to the starters screen.
- Keyboard, controller and touch reach the new warning and the Fallen screen.

## Settled

1. The first-time warning takes one Z (it opens focused on "Not yet").
2. Dungeon is unchanged: a lost floor ends the run.
