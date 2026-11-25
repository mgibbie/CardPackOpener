# Maze Builder: improvement plan

Owner, 2026-11-24. One of four; see `POKETACTICA_IMPROVEMENT_PLAN.md`. What is built is in
`POKETACTICA_MAZE_BUILDER_PLAN.md`.

Status: the owner answered on 2026-11-24; items 1 to 10 are built (see the end). The rest is not. Sizes: S under a day, M a few days, L a week or more.

How it was made: by the session that built Maze Builder. Its balance was measured with the auto-builder
(`tools/poketactica/maze_auto.mjs`); nothing below was measured again for this plan, and no tester numbers were read.

## Where it stands
The loop works and looks good: block cards as a hand, five heroes with decks and passives, rewards after each wave,
scenery, big damage numbers, a corner HUD, the next wave shown in advance. Three maps, five heroes, 31 passives,
eight bonus blocks, four kinds of wave and a boss every tenth.

## The three biggest gaps
1. **Every wave is the same problem.** Enemies only walk the shortest way, in a line, a swarm, a few tanks or a mix.
   Nothing flies over blocks, splits, heals or shields, so one good maze answers every wave.
2. **The deck never becomes yours.** Rewards add cards; nothing removes, upgrades or changes one. A hero's deck at
   wave 20 is the deck at wave 1, plus more.
3. **Three maps and no reason to return.** A best wave per map is the only record. There is no daily run, no board to
   compare on, and no per-hero record.

## Plan

### Now: small things (S each)
| # | What | Why |
|---|---|---|
| 1 | **Drag a card onto the board** on a phone, as well as tap then tap | Laying a block is two taps and a third to confirm |
| 2 | **Show every tower's reach at once** (a toggle) | Reach shows one tower at a time |
| 3 | **A damage panel during the run**, not only on the results | The per-figurine damage count exists and shows in one line of text |
| 4 | **Best wave per hero**, on the hero screen | Heroes have no record of their own |
| 5 | **A switch that calls the next wave by itself** when nothing waits on a choice | Late in a run with a finished maze, every wave is still a button press |
| 6 | **Reroll a reward for gold** | A bad set of three has no answer |
| 7 | **Read the tester data**: waves reached by map and hero | The owner said to watch testers before touching enemy HP; nobody has looked yet |

### Next: waves that ask different questions (M each)
| # | What | Why |
|---|---|---|
| 8 | **Enemy kinds**: splitters, healers, shielded ones, fast runners. All walk the way; the owner ruled out flyers | The biggest gap. It makes tower choice and placement matter beyond path length |
| 9 | **Elite waves and boss tricks**: a boss that breaks a block, calls help or speeds its wave | Every boss is a big enemy that walks |
| 10 | **The next three waves, not one**, so a maze can be built for what is coming | The preview shows one wave |

### Next: a deck worth building (M each)
| # | What | Why |
|---|---|---|
| 11 | **Remove or upgrade a card** as a reward choice | Deck-building needs thinning |
| 12 | **New block kinds**: a slowing tile, spikes on the way, a pair of teleporters, a block that boosts its neighbours | Eight bonus blocks, all "stand here, be stronger" |
| 13 | **Passive rarity and pairs that work together** | 31 passives, mostly flat bonuses |

### Later: reasons to return (M to L)
| # | What | Why |
|---|---|---|
| 14 | **More maps** (three to six or more), each with a rule of its own: two bases, a moving gate, a flooded middle | Three maps |
| 15 | ~~A daily run with a best-wave table~~ **Dropped by the owner** | The run is already exact from its seed, and replays and spectating exist |
| 16 | **More heroes**, and something to earn with each (a second deck, a portrait frame) | Five heroes, all open by wave 25 |
| 17 | **Hero cards**: one or two cards only that hero can draw | Heroes differ by deck mix and passives only |

## Not to do
- No copy of Emberward's towers, relics, maps, names or art. The owner's rule from the first plan stands.
- No change to Road mode's replays: their fingerprints are pinned.

## The owner's answers (2026-11-24)
1. **New enemy kinds, but every enemy walks the way.** No flyers. Splitters, healers, shielded ones and fast runners.
2. **Cards can be removed and upgraded** as reward choices.
3. **No daily run.** Item 15 is dropped.
4. **Enemy HP: read the tester data, raise it if the numbers say so, and tell the owner what changed.**

## How to tell it worked
- The auto-builder's one plan no longer clears every wave kind: at least one kind needs different towers or placing.
- Testers play more than one hero and more than one map.
- Runs end at different waves for different reasons, not at the same wall.

## Built (2026-11-25): items 1 to 7
- **1 Drag a card onto the board** (a finger, a pen or the mouse): the ghost follows, letting go lays it. Tap, tap, tap still works.
- **2 Every tower's reach at once**: a switch in the menu, remembered on the device.
- **3 Damage dealt, tower by tower**: a panel in the menu, with each tower's share.
- **4 Each hero's best wave**: kept beside the maps' records, shown on the hero screen and on the results.
- **5 The next wave by itself**: a switch, off by default. On, the wave is called 4 seconds after the last order; never before
  the first wave, and never while a reward or a passive waits to be picked.
- **6 Change a set of rewards for gold**: 10, then 20 for the same wave; not once one of them is taken. A new order, so runs
  recorded before it replay as they were.
- **7 The tester data was read** (2026-11-25): two accounts have a Poketactica save, and neither has a Maze Builder record
  (the one Tower Defense record is the owner's Road wave 6). So there is nothing to raise enemy HP on, and it stays. Read it
  again when testers have played: `SELECT key, value FROM mp_store WHERE key LIKE 'ptfig:%'`, the `figs.td` map.
- Also fixed on the way: Maze Builder drew a figurine's "would reach" tiles on bare ground, where it cannot stand.

## Built (2026-11-25): items 8 to 10 (rules revision 14)
- **8 Enemy kinds**, all walking the way (the owner ruled out flyers), one kind a wave at most, on a share of it:
  **Runners** (from wave 3: 1.6 times as fast, 0.6 of the HP), **Splitters** (5: knocked out, two small ones with 35% of
  its HP stand where it fell), **Shielded** (7: 1.3 of the HP, and no hold, slow, turn-back or status sticks until it has
  lost 40% of it), **Healers** (9: every 2 seconds the others within 2 tiles get 4% of their HP back).
- **9 Elite waves** (5, 15, 25 ...): the whole wave is of its kind (healers: a third). **A boss from wave 20 has a trick**:
  it rallies its wave (everything walks 1.3 times as fast while it stands), calls help (a helper every 6 seconds, 6 at
  most) or is armoured (the shield, on a boss). "A boss that breaks a block" was left out: it would change the way mid-wave.
- **10 The next three waves**: the next one in full with its kind and what the kind does, then the two after it in a line.
- The kinds come from the seed on a stream of their own, so the wave list is the one it always was. The Road has no
  kinds. A run recorded under rules 13 replays as it was (three fingerprints pinned).
- Measured with the auto-builder (12 at Lv 18, 6 runs a map), waves cleared on average before / after: Open Field
  11.8 / 11.3, Pincer 10.3 / 9.5, Lakeside Ridge 12.0 / 12.2. About as hard as before, so enemy HP is untouched.
