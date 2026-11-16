# Pocket Enhanced — the owner's plan (2026-11-16)

The owner's instructions with this plan:

> To build pocket enhanced I want you to lean on what we have already built for Battlecards. We need
> replays/spectation/controller support as well as mouse controls and WASD/arrow key Z/X as A/B controls.
> Wait til Sinnoh, Post Game, and Comprehensive Fly Map is done to start this & then you can work on this Pocket
> Enhanced plan all night long/until it is completed. Set … pocket enhanced to auto merge as well.

Everything below is the owner's specification, kept as written.

---

# PROJECT: Pokémon TCG Pocket — Multiplayer Battle Simulator

## 1. Project Overview

Develop a fully playable, turn-based Pokémon card battle simulator based on the rules and card mechanics of Pokémon
Trading Card Game Pocket.

Do not assume any prior knowledge of Pokémon TCG Pocket. This specification describes the core game systems,
required modifications, and intended architecture.

The initial card pool will consist of Pokémon TCG Pocket: Genetic Apex (A1), including cards from its Charizard,
Pikachu, and Mewtwo booster packs.

The simulator must support:

* 2, 3, or 4 players in a single match.
* Up to 2 Active Pokémon per player.
* Up to 4 Benched Pokémon per player.
* A custom dual-type system separating Card Type from Combat Type.
* A modified type-effectiveness system using flat +20 and -20 damage modifiers.
* Multiple opponents and selectable attack targets.
* A simultaneous attack-command system for each player's Active Pokémon.
* An extensible card-effect system that accommodates multiplayer battles.
* Human-controlled players and AI-controlled opponents.
* Deck construction and validation.
* An interactive graphical battle interface.

The simulator should be modular, data-driven, deterministic where possible, and designed to support future
expansions.

The primary goal is a mechanically complete, playable game rather than a visual prototype.

## 2. Understanding Pokémon TCG Pocket

Pokémon TCG Pocket is a digital card game in which players construct decks of Pokémon and Trainer cards, deploy
Pokémon to the battlefield, attach Energy, evolve Pokémon, and use attacks to knock out opposing Pokémon.

Unlike the traditional physical Pokémon TCG, Pocket uses smaller decks, automatically generated Energy, and a
point-based victory system.

### 2.1 Standard Pocket Rules

The original game uses:

* 20 cards per deck.
* 5 cards in the opening hand.
* 1 Active Pokémon.
* Up to 3 Benched Pokémon.
* A maximum of 2 copies of a card with the same name per deck.
* No Energy cards in the deck.
* An Energy Zone that generates Energy each turn.
* One normal Energy attachment per turn.
* One Supporter card per turn.
* A maximum hand size of 10 cards.
* A 3-point victory threshold.
* 1 point for knocking out an ordinary Pokémon.
* 2 points for knocking out a Pokémon ex.
* A turn-based battle structure.

This project modifies the battlefield size, player count, attack execution, and typing mechanics.

Unless explicitly overridden, preserve the original Pocket rules.

### 2.2 Card Categories

There are two primary card categories.

**Pokémon Cards** represent creatures that battle. Each Pokémon has: a name, a card type, HP, an evolution stage,
attacks, an optional Ability, an Energy retreat cost, a printed Weakness, a knockout point value.

Pokémon can be Basic, Stage 1, or Stage 2. Basic Pokémon can be played directly. Stage 1 Pokémon evolve from their
specified Basic Pokémon. Stage 2 Pokémon evolve from their specified Stage 1 Pokémon.

Pokémon generally cannot evolve on the turn they enter play or during a player's first turn.

Evolution preserves attached Energy and existing damage unless a card effect specifies otherwise. Evolution also
removes Special Conditions.

**Trainer Cards** provide support effects. The initial Genetic Apex card pool includes Item cards and Supporter
cards. Item cards generally have no per-turn play limit unless an effect restricts them. Only one Supporter may
normally be played per turn. Trainer effects can draw cards, heal Pokémon, manipulate Energy, switch Pokémon, search
decks, modify damage, or produce other effects.

## 3. Multiplayer Battle Structure

The simulator must support 2–4 players. Each player has their own: deck, hand, discard pile, Energy Zone, point
counter, Active Pokémon slots, Bench, turn state.

### 3.1 Battlefield Layout

Each player has 2 Active Pokémon slots (Active Slot A, Active Slot B) and 4 Bench slots (Bench Slot 1–4).

A player can control a maximum of 6 Pokémon simultaneously. An Active slot can be empty if the player does not have
enough Pokémon to fill it. Each Active Pokémon operates independently for attacking, retreating, Energy, HP, and
status conditions.

### 3.2 Player Counts

Support 1v1 (2 players), 1v1v1 (3 players), 1v1v1v1 (4 players). Initially, all players are opponents. Do not
implement team battles unless added in a future development phase. Turn order proceeds clockwise or according to an
explicitly established player order. Every player takes a complete turn before the next round begins.

### 3.3 Starting a Match

1. Each player selects a valid 20-card deck.
2. Shuffle each deck.
3. Draw 5 cards per player.
4. Ensure each opening hand contains at least one Basic Pokémon using Pocket's opening-hand guarantee.
5. Each player selects a Basic Pokémon for Active Slot A.
6. Players may fill Active Slot B with another Basic Pokémon if available.
7. Players may place additional Basic Pokémon on their Bench.
8. Determine the turn order.
9. Begin the match.

A player does not need to start with two Active Pokémon. An empty Active slot may be filled by a legal game action
or by promoting a Benched Pokémon when the rules require it.

## 4. Dual-Type System

This is a fundamental customization. Every Pokémon has two independent typing properties: **Card Type** and
**Combat Type**. These must never be conflated.

### 4.1 Card Type

Card Type represents the Pokémon's original Pokémon TCG Pocket classification. Supported Card Types: Grass, Fire,
Water, Lightning, Psychic, Fighting, Darkness, Metal, Dragon, Colorless.

Card Type is used for: card classification, Energy-related interactions, Trainer card effects, Abilities that
reference a Pokémon's type, other original Pocket mechanics. Card Type does not determine type effectiveness in this
simulator.

The Energy Zone supports the eight standard Energy types: Grass, Fire, Water, Lightning, Psychic, Fighting,
Darkness, and Metal. Dragon and Colorless are card types but are not independently generated standard Energy types.

### 4.2 Combat Type

Combat Type represents the Pokémon's canonical typing from the mainline Pokémon video games. Support all 18 types:
Normal, Fire, Water, Electric, Grass, Ice, Fighting, Poison, Ground, Flying, Psychic, Bug, Rock, Ghost, Dragon,
Dark, Steel, Fairy. Every Pokémon must have one or two Combat Types.

| Pokémon | Card Type | Combat Type |
|---|---|---|
| Charizard ex | Fire | Fire / Flying |
| Venusaur ex | Grass | Grass / Poison |
| Blastoise ex | Water | Water |
| Pikachu ex | Lightning | Electric |
| Gengar ex | Psychic | Ghost / Poison |
| Dragonite | Dragon | Dragon / Flying |
| Gyarados | Water | Water / Flying |
| Pidgeot | Colorless | Normal / Flying |
| Machamp ex | Fighting | Fighting |

Use canonical species/form typing rather than deriving Combat Type from Card Type.

### 4.3 Attack Combat Types

Every damaging attack has its own Combat Type. An attack's Combat Type is independent of its Energy cost and the
attacking Pokémon's Card Type. Examples: Flamethrower: Fire; Thunderbolt: Electric; Hydro Pump: Water; Shadow Ball:
Ghost; Hyper Beam: Normal; Earthquake: Ground; Ice Beam: Ice.

Use the mainline Pokémon move type when a direct equivalent exists. For attacks exclusive to Pokémon TCG Pocket,
assign a Combat Type using an explicit, reviewable mapping. Do not silently invent uncertain assignments.

Non-damaging attacks may also have a Combat Type for consistency, but type effectiveness should only modify attack
damage, not the success of non-damaging effects.

## 5. Custom Type Effectiveness

Do not use the mainline Pokémon damage multipliers. There are no 2× or 4× multipliers. There are no type immunities.
Instead, use flat damage adjustments.

### 5.1 Effectiveness Rules

Use the canonical mainline Pokémon type chart to determine relationships, but translate them into: super effective
+20 damage; not very effective -20 damage; neutral no change; immune in the mainline games: treat as neutral.

For example: Fire attacking Grass +20; Fire attacking Water -20; Water attacking Fire +20; Electric attacking Water
+20; Normal attacking Ghost no change; Ground attacking Flying no change.

Immunity relationships must never prevent an attack from dealing damage.

### 5.2 Dual-Type Defenders

Evaluate the attack's Combat Type against both defending Combat Types. Each type contributes independently (super
effective +20, resistant -20, neutral 0, immune 0). Add the results together.

* Electric attacking Water / Flying: +20 +20 = +40.
* Fire attacking Grass / Poison: +20 + 0 = +20.
* Fighting attacking Normal / Flying: +20 - 20 = 0.
* Ground attacking Fire / Flying: +20 + 0 (immunities are neutralized) = +20.

These additive modifiers are intentional. There is no multiplier-based effectiveness.

### 5.3 Damage Rules

Final Damage = Base Attack Damage + Attack Modifiers + Combat Type Effectiveness + Other Applicable Modifiers.

Apply damage prevention and reduction effects according to an explicitly defined resolution order. Final damage
cannot be negative. An attack dealing 0 damage is permitted. Damage caused by poison, burn, or direct damage-counter
placement does not automatically receive Combat Type modifiers. Attacks targeting multiple Pokémon must calculate
effectiveness separately for each target. The original Pocket printed Weakness is ignored for damage calculations
but retained in card data for reference.

## 6. Two Active Pokémon and Attack Execution

Each player may control up to two Active Pokémon. Both Active Pokémon may attack during the same turn. However,
attacks are not executed immediately when selected. Instead, players select their commands first, then execute them
together through a dedicated interface.

### 6.1 Attack Selection

For each occupied Active slot, the player selects (1) an available attack and (2) a legal target. Once commands are
selected, the player presses **EXECUTE**. The button must be labeled exactly "Execute".

### 6.2 Execute Behavior

Pressing Execute commits the selected commands. The simulator must:

1. Validate both attacks.
2. Validate Energy requirements.
3. Validate targets.
4. Confirm the attacking Pokémon are still eligible to act.
5. Lock in the submitted commands.
6. Resolve the attacks in a deterministic order.
7. Apply damage and effects.
8. Resolve Knock Outs.
9. Award points.
10. Check victory conditions.
11. End the player's attack phase and turn.

Use Active Slot A followed by Active Slot B as the initial attack-resolution order. This order must be visible in
the battle log. The two attacks are submitted together but resolved sequentially.

If the first attack knocks out the second attack's selected target, do not automatically redirect the second attack
to a different Pokémon. Initially, the second attack fails if its selected target is no longer legal. If the second
attacking Pokémon becomes unable to attack during resolution, its queued attack fails.

### 6.3 Optional Attacks

A player may choose not to attack with either Active Pokémon. Provide a Pass option for each Active slot. If only
one Active Pokémon is present, the player may execute one attack. If both Active slots are empty, the player cannot
execute attacks.

### 6.4 Attack Restrictions

Track attack eligibility separately for each Pokémon (attack restrictions, insufficient Energy, temporary
restrictions with durations, "can't attack next turn" applying only to that Pokémon). Both Active Pokémon must not
share attack restrictions unless an effect explicitly applies to both.

## 7. Targeting System

### 7.1 Target Selection

A normal single-target attack can target one opposing Active Pokémon. In a four-player game, there may be up to six
opposing Active Pokémon. The player must be able to choose any legal opposing Active Pokémon as a target. Do not
automatically target the next player in turn order.

### 7.2 Target Categories

Implement reusable targeting categories: Self; one friendly Pokémon; one friendly Active Pokémon; one friendly
Benched Pokémon; all friendly Pokémon; one opposing Active Pokémon; one opposing Benched Pokémon; any opposing
Pokémon; all opposing Active Pokémon; all opposing Benched Pokémon; all opposing Pokémon; all Pokémon in play; one
opposing player; all opposing players. These should be available to attacks, Abilities, and Trainer effects.

### 7.3 Multi-Target Attacks

Some attacks affect multiple Pokémon (every opposing Active; every opposing Benched; all Pokémon controlled by a
selected opponent; every Pokémon in play). Each target must resolve damage and effects independently. Type
effectiveness must be calculated separately for each damaged Pokémon when applicable.

### 7.4 Player-Targeted Effects

Effects that reference an opponent must explicitly determine which opponent they affect. "Your opponent discards a
card." becomes "Choose an opponent. That player discards a card." Effects that reference all opponents must affect
all opposing players only when the effect's adapted rules explicitly say so.

## 8. Adapting Original Card Wording

The Genetic Apex cards were designed for one opponent with one Active Pokémon. Many card effects must be adapted for
multiplayer battles. The simulator must preserve each card's original mechanical intention while supporting the
expanded battlefield. Do not merely replace text visually. Implement the corresponding gameplay behavior.

### 8.1 Card Text Adaptation Principles

| Original wording | Multiplayer interpretation |
|---|---|
| Your opponent's Active Pokémon | A selected opposing Active Pokémon |
| Your opponent's Benched Pokémon | A selected opposing Benched Pokémon, if the effect targets one |
| Your opponent's Pokémon | A legal Pokémon controlled by a selected opponent |
| Your opponent's hand | A selected opponent's hand |
| Your opponent's deck | A selected opponent's deck |
| Your opponent's Energy | Energy controlled by a selected opponent |
| Your Active Pokémon | One of your Active Pokémon, chosen where necessary |
| Your Benched Pokémon | Your Benched Pokémon |
| Your Pokémon | Your Pokémon across both Active slots and Bench |

These are default rules, not universal text substitutions. The intended effect determines the final targeting
behavior.

### 8.2 Effects Referencing Multiple Pokémon

"Deal 20 damage to each of your opponent's Benched Pokémon." becomes "Choose an opponent. Deal 20 damage to each of
that player's Benched Pokémon." Do not automatically damage every opponent's Bench unless that behavior is
explicitly specified.

### 8.3 Switching Effects

"Switch your opponent's Active Pokémon with one of their Benched Pokémon." becomes "Choose an opponent and one of
their Active Pokémon. That opponent switches the selected Active Pokémon with one of their Benched Pokémon." The
affected opponent chooses the replacement when the original card grants them that choice. Switching must preserve
the Active slot being replaced.

### 8.4 Effects Referencing the Defending Pokémon

"The Defending Pokémon" refers to the selected attack target. Effects such as Poisoned / cannot retreat / takes
additional damage apply only to the relevant target unless otherwise specified.

### 8.5 Effects Referencing the Opponent's Next Turn

In multiplayer, effects that persist until an opponent's next turn must have explicit duration rules. Track: the
player responsible for the effect; the Pokémon affected; the player whose turn determines expiration; the exact
expiration event. Do not assume the next global turn belongs to the affected player.

### 8.6 Effect Adaptation Database

Maintain separate fields for: original printed card text; adapted multiplayer card text; structured gameplay effect;
targeting rules; adaptation notes. The original card text must never be destroyed.

## 9. Energy System

Pokémon TCG Pocket does not include Energy cards in player decks. Instead, players receive Energy through an Energy
Zone.

### 9.1 Energy Generation

Each player has an independent Energy Zone. It generates Energy according to the player's configured Energy types,
displays the upcoming Energy, allows one standard Energy attachment per eligible turn, and supports additional
Energy generated by card effects. In decks using multiple Energy types, the Energy type generated may vary. Use
reproducible, seedable randomness.

### 9.2 Energy Costs

Attacks have Energy costs defined by the original Genetic Apex cards. Colorless Energy costs can be satisfied by any
attached Energy type. Combat Type has no effect on Energy requirements.

### 9.3 Two Active Pokémon

Both Active Pokémon share the player's normal Energy attachment allowance. The player normally attaches only one
Energy total per turn and chooses which Pokémon receives it. Additional attachments are allowed only through card
effects.

## 10. Turn Structure

* **Phase 1: Turn Start** — resolve beginning-of-turn effects; draw a card; update the Energy Zone; refresh eligible
  once-per-turn actions; process applicable status and duration rules.
* **Phase 2: Main Phase** — play Basic Pokémon; evolve; play Item cards; play one Supporter; use Abilities; attach
  Energy; retreat; switch through card effects; in any legal order.
* **Phase 3: Attack Planning** — choose an attack and target for each eligible Active Pokémon; each Active slot has
  an independent command; Pass is allowed.
* **Phase 4: Execute** — the player presses Execute; both commands are validated; attacks resolve in Active Slot A,
  then Active Slot B order; resolve damage, effects, Knock Outs, points, and victory checks.
* **Phase 5: Turn End** — resolve end-of-turn effects and Special Conditions at their appropriate timing; expire
  relevant temporary effects; advance to the next eligible player.

### 10.1 First-Turn Rules

Use Pocket's first-turn restrictions as the baseline. The first player cannot normally attach Energy from the Energy
Zone or attack on their first turn. Supporter cards are permitted. Other players follow the appropriate first-turn
rules. Ensure multiplayer turn order does not accidentally grant extra Energy attachments or attack opportunities.

## 11. Knock Outs and Victory

* **Knock Outs**: when HP reaches zero, mark it Knocked Out, resolve Knock Out effects, award points to the
  appropriate player, move the Pokémon and its attached cards to the correct discard area, resolve Active slot
  replacement if necessary.
* **Points**: ordinary Pokémon 1 point; Pokémon ex 2 points. The initial victory threshold is 3 points; make it
  configurable.
* **Multiplayer scoring**: the player responsible for the attack receives the points; multiple Knock Outs by one
  attack each award points; Knock Outs by status conditions or delayed effects retain their originating player where
  appropriate; implement explicit rules for effects without a clear originating player.
* **Eliminations**: a player is eliminated when they have no Pokémon remaining in play and cannot legally continue.
  Remove eliminated players from the turn order. The remaining players continue unless a victory condition is met.
* **Victory**: the first player to reach at least 3 points wins. If multiple players reach the threshold during the
  same effect resolution, resolve ties using an explicit, documented rule. If only one player remains, that player
  wins.

## 12. Genetic Apex Card Database

Implement the Genetic Apex (A1) expansion as the initial supported card set: all unique gameplay cards from the
Charizard, Pikachu and Mewtwo booster packs (Pokémon, Pokémon ex, Items, Supporters). Alternate artwork versions
should reuse gameplay definitions when mechanically identical.

### 12.1 Card Data

Each Pokémon card must store: card ID, name, set ID, rarity, Card Type, Combat Types, HP, evolution stage, evolution
prerequisite, retreat cost, printed Weakness, attacks, Abilities, Knock Out point value, original card text, adapted
multiplayer card text.

Each attack must store: attack ID, name, Combat Type, Energy cost, base damage, damage formula, effects, targeting
rules, original text, adapted text.

### 12.2 Data Accuracy

Use verified Genetic Apex card information. Do not invent card HP, Energy costs, attack damage, evolution
requirements, Abilities, or Trainer effects. Every attack must receive an explicit Combat Type assignment. Maintain
a review list for attacks whose mainline typing is ambiguous. Do not claim full Genetic Apex compatibility until
every unique gameplay card is implemented and tested.

## 13. Software Architecture

Use an object-oriented, modular architecture. Separate game logic from rendering and input handling. Suggested
systems: GameEngine, GameState, Player, PokemonInstance, CardDatabase, TypeSystem, DamageCalculator, EnergyManager,
AttackCommand, CommandQueue, EffectResolver, TargetingSystem, TurnManager, VictoryManager, DeckValidator, BattleAI,
BattleUI.

Do not hardcode individual card effects into the main GameEngine. Use reusable effect primitives and specialized
handlers where necessary.

## 14. User Interface

Create a graphical interface that supports up to four players. Each player area must display: player identity,
Active Slot A, Active Slot B, four Bench slots, point counter, deck count, discard pile, Energy Zone, attached
Energy, HP and damage, status conditions.

### 14.1 Attack Controls

Each Active Pokémon should have: attack selection, target selection, Pass option, Energy requirement display, Combat
Type indicator. The Execute button must be clearly visible. Before execution, visually display both queued commands,
for example:

    Active A: Charizard ex → Crimson Storm → Player 2 / Active A
    Active B: Pikachu ex → Circle Circuit → Player 3 / Active B
    [ Execute ]

Do not resolve attacks before Execute is pressed.

### 14.2 Card Inspection

When inspecting a Pokémon card, display: Card Type; Combat Type or dual Combat Types; attacks and their Combat
Types; Energy requirements; adapted multiplayer text; original card text in an optional details view.

### 14.3 Battle Log

Record: turn changes, Energy attachments, evolutions, Trainer effects, selected attacks, attack targets, damage
calculations, type-effectiveness modifiers, status conditions, Knock Outs, points awarded, eliminations, victory.
The log should make it possible to reconstruct why an action produced a particular outcome.

## 15. AI Opponents

AI players must obey the same rules as human players. Initially implement heuristic AI capable of: playing Basic
Pokémon; evolving; attaching Energy; playing useful Trainer cards; selecting attacks; selecting legal targets;
coordinating attacks from two Active Pokémon; retreating when appropriate; prioritizing potential Knock Outs;
considering type effectiveness; considering opponents' point totals.

AI must submit attack commands through the same CommandQueue and Execute pipeline. Do not give AI players direct
access to hidden opponent hands or deck order.

## 16. Automated Testing

* **Combat**: all 18 Combat Types; single-type effectiveness; dual-type additive effectiveness; no immunity; no
  multipliers; +20 and -20 adjustments; damage floors; multiple targets; damage modifiers; Special Conditions.
* **Multiplayer**: 2-, 3- and 4-player matches; two Active Pokémon; four Bench slots; cross-player targeting; player
  elimination; turn order after elimination; multiplayer scoring; simultaneous victory conditions.
* **Execute system**: two valid queued attacks; one attack and one Pass; two Pass commands; insufficient Energy;
  invalid targets; target knocked out by first attack; attacker disabled before its queued attack; sequential
  resolution; Knock Outs during execution.
* **Card mechanics**: evolution; retreating; Trainer cards; Abilities; Energy generation; Energy attachment; deck
  validation; card draw; status conditions; Knock Out replacement; original and adapted card effects.

All randomness should be seedable so test scenarios can be reproduced.

## 17. Development Phases

1. **Foundation** — inspect the repository; identify the stack; establish the architecture; define the data
   schemas; implement the two type systems; implement custom effectiveness; implement player and battlefield state.
2. **Core Multiplayer Engine** — 2–4 players; two Active slots; four Bench slots; turn order; Energy; evolution;
   legal actions; Knock Outs and scoring.
3. **Attack Command System** — attack selection; target selection; command validation; the Execute button;
   sequential attack resolution; multiplayer targeting.
4. **Genetic Apex** — import the complete verified card database; assign Combat Types; assign attack Combat Types;
   adapt multiplayer card wording; implement all card effects.
5. **User Interface** — the multiplayer battlefield; card inspection; attack planning controls; battle animations
   and feedback; deck selection and deck building.
6. **AI and Validation** — AI opponents; automated battles; all player counts; validate all Genetic Apex cards; fix
   rules inconsistencies; improve usability.

## 18. Engineering Standards

Object-oriented where appropriate; modular and maintainable; meaningful comments; robust error handling; immutable
card definitions and separate mutable battle instances; validate all player actions; game logic independent of the
UI; deterministic test execution; avoid unnecessary server dependencies; design for future expansion sets; avoid
duplicated logic; preserve original card data; document all rule adaptations; never silently invent missing card
information.

## 19. Instructions to the Development Agent

Begin by inspecting the repository and identifying the existing technology stack. Do not assume knowledge of Pokémon
TCG Pocket beyond this specification. Research and verify the original Genetic Apex card data and any Pocket
mechanics not fully described here. When a mechanic is ambiguous, document the ambiguity and propose a consistent
rule rather than silently guessing. Prioritize a working battle engine over cosmetic improvements. Implement the
project incrementally, testing each major system before proceeding.

The most important requirements are:

1. Two independent type systems: Card Type and Combat Type.
2. Flat additive effectiveness modifiers of +20 and -20, with no immunities or multipliers.
3. Support for 2–4 players.
4. Two Active Pokémon and four Bench slots per player.
5. Independent attack and target selection for each Active Pokémon.
6. A single Execute button that resolves queued attacks.
7. Multiplayer-aware targeting and card-effect adaptations.
8. Complete Genetic Apex support.
9. Strict separation between game logic and presentation.
10. A playable simulator with functioning AI opponents.

Build a complete game, not a mockup.
