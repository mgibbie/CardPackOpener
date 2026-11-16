# Pocket Enhanced — rules decisions

The owner's plan is `Plans/POCKET_ENHANCED_PLAN.md`. It fixes most of the rules. This file records every call the plan
leaves open, so each can be reviewed and changed in one place. The engine (`js/engine/engine.js`) marks these spots
"(RULES.md)".

## From the plan (not open)

* 2–4 players, everyone against everyone. Each has 2 Active slots (A, B) and 4 Bench slots.
* 20-card decks, 2 copies of a name at most, at least one Basic Pokémon, 1–3 Energy types. Opening hand of 5 with a
  Basic Pokémon guaranteed. Hand limit 10. One Energy attachment a turn (shared by both Active Pokémon), one
  Supporter a turn. 3 points to win; a Pokémon ex is 2 points, anything else 1.
* Card Type and Combat Type are separate. Effectiveness is flat: +20 super effective, −20 resisted, 0 otherwise, and
  a "mainline immunity" is 0. A two-type defender adds its two results. Printed Weakness is kept on the card and not
  used.
* Attacks are chosen for each Active Pokémon, then committed together with **Execute**, and resolved A then B. A
  queued attack is never redirected: if its user or its target is gone, or its user can no longer attack, it fails.
* The player who goes first cannot attach Energy or attack on their first turn. No evolving on your first turn or on
  the turn a Pokémon came into play.

## Decided here

**Damage order.** Base damage with the attack's own additions (coins, "for each…") → Trainer boosts (Giovanni,
Blaine), which apply only into an opposing *Active* Pokémon as printed → the attacker's "attacks do −N" → Combat Type
effectiveness → the defender's reductions (Shell Armor, Hard Coat, Barrier Attack) → prevention (Dig) → not below 0.
An attack that would do 0 before effectiveness stays 0: effectiveness changes damage, it does not create it.

**Effectiveness on every hit of an attack.** Damage an attack does to a Benched Pokémon (Blizzard's Bench damage,
Stretch Kick, Draco Meteor) gets effectiveness per Pokémon. Damage that is not an attack hitting an opposing Pokémon
gets none: Poison, recoil, an attack's damage to your own Bench, Abilities (Water Shuriken, Counterattack).

**Empty Active slots.** You may have one Active Pokémon, or none in a slot. On your turn you may move a Benched
Pokémon into an empty Active slot freely. You *must* promote only when you have no Active Pokémon at all; the new one
goes to Active A and its owner chooses it. A player with no Pokémon in play is eliminated.

**Retreat.** One retreat a turn in total, not one per Active Pokémon. The retreating Pokémon swaps with a Benched one
and keeps the same slot. A Pokémon that leaves an Active slot loses its Special Conditions and attack effects.

**Energy Zone.** One Energy is ready each turn and the next one is shown. An Energy you do not attach stays ready; a
new one is not added on top of it (Energy does not pile up).

**Special Conditions (Genetic Apex has three).** Poisoned: 10 damage at each Checkup. Asleep: cannot attack or
retreat; a coin at each Checkup, heads wakes it. Paralyzed: cannot attack or retreat; it ends at the end of its
owner's next turn. Asleep and Paralyzed replace each other; Poisoned stacks with either.

**Checkup in multiplayer.** In Pocket a Checkup follows every turn, so a condition is checked twice a round. With 3 or
4 players a Checkup after every turn would triple or quadruple Poison. Here a Pokémon's condition is checked at the
end of **its owner's turn** and at the end of the turn of **the player who caused it**: twice a round at any player
count.

**"During your opponent's next turn".** An effect on the Defending Pokémon (can't attack, can't retreat, attacks do
−20) lasts through **that Pokémon's owner's** next turn. An effect on the attacker itself (takes −20, Dig's
prevention) lasts until **the attacker's own** next turn starts, so it covers every opponent's turn in between. "Your
opponent can't use Supporter cards during their next turn" applies to the Defending Pokémon's owner.

**"Your opponent" with several opponents.** The opponent is the owner of the attack's target. Blizzard's Bench damage
hits that player's Bench only. Draco Meteor picks at random among that player's Pokémon. Trainer cards that say "your
opponent" (Hand Scope, Red Card) ask you to choose one. Gengar ex's Shadowy Spellbind is the one effect that reaches
*all* opponents: it is an aura, not an aimed effect.

**Switch-out effects (Sabrina, Drive Off, Knock Back).** You choose the opposing Active Pokémon; its owner chooses
which of their Benched Pokémon takes that slot. With no Benched Pokémon nothing happens (the card cannot be played).
Fragrance Trap (Victreebel): you choose the opponent, which of their Active Pokémon leaves, and which of their
Benched Basic Pokémon comes up.

**Who gets the points.** The player whose attack or Ability did the damage. Poison: the player who poisoned it.
Counterattack: Poliwrath's owner. A Pokémon knocked out by its own side (recoil, your own Bench damage) gives its
points to the owner of that attack's target; with no such player (a fossil discarded, Koga) nobody scores.

**Several players reaching the points at once.** The most points wins; then the player whose turn it is; then the
next player in turn order.

**Copy Anything (Ditto).** You choose an attack of any opposing Pokémon in play. It is used as Ditto's attack into
Ditto's target, with the copied attack's own Combat Type and effects. If Ditto's Energy cannot pay it, nothing
happens.

**Fossils.** Played as a 40-HP Basic Colorless Pokémon; Combat Type Rock (reviewable). Worth 1 point. Cannot attack,
retreat or take Energy; may be discarded from play on your turn.

**Deck out.** As in Pocket, an empty deck is not a loss; you simply do not draw.

**Starter Trainers.** Genetic Apex itself has only the three fossils and eight Supporters. Potion, X Speed, Hand
Scope, Pokédex, Poké Ball, Red Card and Professor's Research are from Promo-A; they are included (set `P-A`) so decks
play as they do in Pocket.

## Attack Combat Types

`data/ATTACK_TYPE_REVIEW.md` lists every attack's Combat Type and its basis. 137 come from the mainline move of the
same name; the Pocket-only ones are mapped by hand in `tools/gen_pocket_cards.mjs`, 30 of them marked for review.

## Online matches

A match between people is held by the server (`server/pocket_pvp.mjs`), which runs this same engine. A player is sent
their own seat's view only; an action is applied to the sender's seat, if the engine accepts it. Decided here:

* **Joining.** The host gets a 5-character code; anyone signed in can join with it. The host chooses 2–4 seats and how
  many are computer players, and may start with seats still open as long as there are two players.
* **A turn's clock.** 3 minutes without an action and the move is made for the player: the computer player's choice
  for a setup or a forced choice, otherwise Execute with both Active Pokémon passing. Nobody is removed for it.
* **Leaving.** A player whose page has not been heard from for 2 minutes concedes; so does one who presses Leave.
* **Replays.** The full record (every deck and action) is sent to the players only when the match is over.
* **Spectators** see what the table shows: no hand, not even the watched player's own.
