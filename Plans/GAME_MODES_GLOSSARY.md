# Game modes glossary and guide

This is a repository guide to the games and their principal playable modes. It describes the code in this checkout, not a promise that every change is already deployed. Modes, player counts, difficulty settings and viewers are different things: a game variant can support several player counts without each being a separate mode. Where a feature has its own detailed rules, follow the linked source or plan.

## Battlecards

Entry: [Battlecards start screen](../battlecards/start.html). The card-game board requires an account. Run modes below are single-player climbs against generated or authored opponents; their progress is separate by mode. Live duels and correspondence are different multiplayer formats.

| Mode | What to expect | Source |
| --- | --- | --- |
| Dungeon Run | Eight levels of bosses; choose card buckets and treasures between fights. | [Dungeon data](../battlecards/dungeon.js) |
| Dalaran Heist | A multi-wing boss run with heroes, treasures, passives and anomalies. | [Heist data](../battlecards/heist.js) |
| Tombs of Terror | Choose an explorer, collect treasures and passives, and fight the bosses. | [Tombs data](../battlecards/tombs.js) |
| Duels | Start with a deck and improve it through card buckets and treasures; generated opponents scale with the run. | [Duels data](../battlecards/duels.js) |
| Arena | Draft a 30-card deck one choice at a time and play until three losses. | [Start screen](../battlecards/start.html) |
| Lorequest | Choose one of three planeswalker starter decks; climb to 12 wins or three losses. Foes match the run's wins and rewards. | [Lorequest](../battlecards/lorequest.js) |
| Lorequest: Middle-earth | A Free Peoples hero fights Sauron's forces. Static foes advance by rung; loot a defeated foe and gain rewards. Ends at 12 wins or three losses. | [Middle-earth](../battlecards/middleearth.js) |
| Lorequest: Sword Coast | A Companion faces D&D villains. Like Middle-earth, static rung-based foes and spoils distinguish it from win-parity runs. | [Sword Coast](../battlecards/swordcoast.js) |
| Lorequest: Final Fantasy | A Final Fantasy hero faces fixed, rung-based villain decks, taking spoils and rewards after wins. | [Final Fantasy](../battlecards/finalfantasy.js) |
| Lorequest: Multiverse | Marvel heroes versus villains; opponents match the player's wins and reward count. No spoils draft. | [Multiverse](../battlecards/multiverse.js) |
| Live match | Find a match against another player, with an AI challenger fallback when nobody is available. | [Start screen](../battlecards/start.html) |
| Play-by-mail | Take turns asynchronously. Countering cards are banned and there are no mid-turn responses. | [Start screen](../battlecards/start.html) |

**Bucket** means a group of cards offered as a run reward. **Treasure** is a special run reward or passive. **Win parity** means an opponent is generated with rewards matching the player's wins; it is not the same as the fixed, rung-based opponents in Middle-earth, Sword Coast and Final Fantasy. Replays, spectating, deck building and leaderboards are supporting features rather than additional run modes.

## Pokémon overworld and Battle Frontier

Entry: [overworld](../overworld/index.html). Explore, battle, collect Pokémon and advance through the regions. The postgame Battle Frontier shares a streak/Battle Point (BP) framework, but each facility has different settings. The repository implementation is defined by [frontier.js](../overworld/frontier.js); its rules should not be assumed to match every original Pokémon game mechanic.

| Facility | Run rules in this implementation |
| --- | --- |
| Battle Tower | Endless streak, own three-Pokémon party, full healing between battles. |
| Battle Dome | Five rounds, own party, healing between battles; completion bonus. |
| Battle Factory | Endless streak using a generated rental team at level 50. Also available as a [standalone entry](../overworld/index.html?factory=1). |
| Battle Palace | Endless endurance streak with the player's party; HP carries between battles. |
| Battle Arena | Three-round endurance run; HP carries over and completion awards a bonus. This is not Battlecards Arena. |
| Battle Pike | Endless healed streak with occasional lucky rooms. |
| Battle Pyramid | Endless endurance streak; opponents scale above the party and victories award extra BP. |

Slateport, Verdanturf and Fallarbor Battle Tents are three-round warm-ups, not the champion-gated Frontier itself. Fallarbor uses rentals; Verdanturf carries HP; Slateport heals. See [facility definitions](../overworld/frontier.js).

## Micatro

Entry: [Micatro](../micatro/index.html). A run combines a deck, a stake and optionally enabled mods, a sleeve, a custom deck or a challenge. These are run settings, not all separate game modes.

| Term | Meaning |
| --- | --- |
| Standard run | Play a deck through blinds and antes, building a scoring engine with cards and Jokers. |
| Stake | Difficulty and rules applied to a run; vanilla stakes run from White to Gold. Mods can add stakes, including Pokermon's Elite Stake. |
| Seeded run | A player-specified seed makes the run reproducible. Seeded wins do not earn normal deck/Joker win stickers. |
| Challenge | A predefined run with its own restrictions and starting conditions. The challenge screen includes vanilla challenges and enabled mods' challenges. |
| Daily challenge | A challenge that supplies a day-based seed; Pokermon's Mystery Dungeon uses a UTC date. |
| Nuzlocke / Monotype | Pokermon names used for challenge or run-badge rules; do not confuse a badge with the separately selected Nuzlocke challenge. |
| Replay / spectate | Read-only ways to watch a finished run or another player's live run, not playable variants. |

Challenge and reward behavior: [main.js](../micatro/js/ui/main.js), [challenge engine](../micatro/js/engine/challenge.js), [Pokermon challenges](../micatro/mods/pokermon/challenges.js).

## MicaSurvivor

Entry: [MicaSurvivor](../micasurvivor/index.html). The newer Play flow separates **category**, **variant** and **players**. The legacy co-op mode ID remains for older saves and interfaces; the newer flow chooses local or online players separately. Availability and sign-in/controller requirements are checked in [play-ui.js](../micasurvivor/js/ui/play-ui.js).

### Survival variants

| Variant | Goal and distinguishing rules |
| --- | --- |
| Normal | Standard survival run, optionally with selected modifiers. |
| Daily Challenge | A daily Pokémon, rule and seeded setup; repeatable with a daily best and a 25% coin bonus. This checkout uses a **00:00 UTC** day boundary; older deployed code may still use local dates. |
| Boss Rush | Fight increasingly strong bosses and legendaries; record the number defeated. |
| Party Mode | Try any Pokémon, including unowned ones; the player cannot die and progress is not saved. |
| Floor Tower | Climb 30 boss floors with rests, pacts, relics and checkpoints. |
| Rift Time Attack | Eight-minute challenge focused on frequent rifts; record wins and gain a 25% coin bonus. |
| Type Survival | Enemies and bosses use a chosen type; survive ten minutes to mark that type complete. Coin bonus: 50%. |
| Team Mode | Switch between up to three owned Pokémon during a run; requires at least two. |

Modifiers include faster enemies, horde spawns, more enemy health, more enemy damage, half player health, and no healing. The daily supplies its own rule and Party does not use the usual progress system. Exact factors and reward calculations are in [modes.js](../micasurvivor/js/systems/modes.js).

### Expedition and Dive

| Variant / feature | Goal |
| --- | --- |
| Expedition: Classic | Clear an Expedition map through zones, altars and guardians, a portal and a shrine; winning opens subsequent maps. |
| Expedition: Survival | Survive on an Expedition map through timed milestones, pacts and sieges. |
| Dive | Descend route floors, rescue Pokémon, defeat alphas and legendary guardians, and decide whether to escape or risk unbanked rewards. |
| Weekly Dive | A shared weekly Dive configuration, selected as its own variant in the newer menu. |
| League HQ | Expedition roster, Lab, tasks and achievements hub; **not** a standalone run mode. |

Dive's loot is at stake until secured: alpha and guardian victories bank rewards, while an Escape Rope lets the player leave with their stake; fainting retains the bank and part of the stake. Details and exceptions are in [dive.js](../micasurvivor/js/expedition/dive.js) and the [Dive plan](MICASURVIVOR_DIVE_MODE_PLAN.md). Expedition has its own progress save but shares the base game's coin wallet; see [expedition.js](../micasurvivor/js/systems/expedition.js).

## Pair of Pears and Scoundrel

**Pair of Pears** ([pairofpears/](../pairofpears/index.html)) is the owner's memory-matching card game, rebuilt on Micatro's UI: a run of 13 levels of fruit pairs, Hearts lost on mismatches, a matched Pear pair wins a level outright, and a Level Shop between levels sells charms and fruit conditions for the run's Berries. The rules are [pear.js](../pairofpears/js/pear.js) (the page is [main.js](../pairofpears/js/main.js)); a run saves after every move and resumes on reload. Friends watch a live run at `/pairofpears/?spectate=<user>` (presence `pears:<label>`); the overworld's Pallet Town arcade box launches it. (The Love2D original's Meandering Meadow creature-catching shell was removed; its Meadows Theme is the card game's music.)

**Scoundrel** ([scoundrel/](../scoundrel/index.html)) is the owner's solo dungeon card game, rebuilt web-native on Micatro's UI. The rules are a port of the owner's Love2D game in [engine.js](../scoundrel/js/engine.js) (deterministic: a run is its seed + action string, so save/resume and replays are the recipe). A **run** is a chain of dungeons: each cleared dungeon starts the next with 1 less max HP (20, 19, ... 1), and the run ends at death or after dungeon 20. Score = dungeons cleared, then the last dungeon's standard Scoundrel score (leaderboard mode `scoundrel`). Friends watch a live run at `/scoundrel/?spectate=<user>` (presence `scoundrel:<label>`); `?replay=<seed>.<actions>` replays a finished run. The original love.js build stays at [scoundrel/classic/](../scoundrel/classic/index.html).

## Verification and maintenance

This guide is an inventory grounded in menu definitions, mode registries and implementation comments; it is **not** evidence that every mode, multiplayer combination, progression branch or save migration has been executed. Mode rules and availability can change independently of this document. When adding or changing a mode, update its row and source link, and add or update regression tests for the gameplay and menu path.

Useful test entry points: `npm run test-battlecards`, `npm run test-overworld`, or `npm test` for both; the [gate runner](../overworld/tests/run-all.mjs) also supports game lanes, changed-file selection and resuming. Tests require Chrome and the offloaded local assets described in [working notes](../CLAUDE.md).
