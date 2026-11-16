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

## Collection, packs and decks

These are choices made for this game (the spec does not cover them). Change them in `js/collection.js`.

* **The collection is kept on your account** when you are signed in, so every device you sign in on has the same cards.
  Two devices never overwrite each other: what was opened or earned on each is added up. A device that signs in for the
  first time adds what was pulled on it to the account (its own new-player packs and starter Trainers are not given twice).
  A guest's collection stays on the device.
* **Your saved decks are kept on your account too**, the same way: a deck saved, changed or deleted on one device is
  saved, changed or deleted on the others. A device signing in for the first time keeps its own decks as well; one whose
  name is already taken by a different deck is kept under a new name ("My deck 2").
* **A new player** has 10 packs to open and two of each of the 7 Promo-A starter Trainers.
* **Earning packs.** A finished match pays 1 pack, a win pays 2 (against the computer from turn 3 on, and online). Each match pays once.
* **A pack** is a Charizard, Mewtwo or Pikachu booster of Genetic Apex: 5 cards. Cards 1-3 are one-diamond. Card 4 and card 5
  roll a rarity, then a printing of that rarity in that booster, each equally likely.
  Card 4: two-diamond 90%, three-diamond 5%, four-diamond 1.666%, one-star 2.572%, two-star 0.5%, three-star 0.222%, crown 0.04%.
  Card 5: two-diamond 60%, three-diamond 20%, four-diamond 6.664%, one-star 10.288%, two-star 2%, three-star 0.888%, crown 0.16%.
  (Pocket's published table for a regular pack, as recalled; there is no "rare pack".)
* **Printings.** A full art, rainbow, immersive or crown printing counts as a copy of its card for play; the Collection shows the rarest one owned.
  The source data lists no rarity for two printings (A1-265 and A1-279, Wigglytuff ex); they are treated as two-star, the run their numbers sit in.
* **Pack points.** Every pack opened gives 5. One copy of a card costs 35 / 70 / 150 / 500 points for a one- to four-diamond card.
* **Mew** is in no booster: it joins the collection of whoever owns every Pokémon numbered 1 to 150.
* **Decks.** The deck builder only takes cards you own (two copies need two owned). The eight starter decks can always be
  played as they are, by anyone, and decks saved before the collection existed stay playable.
* **Online** matches do not check ownership. The account holds the collection but trusts what the page sends (packs are rolled on the page).

## Mythical Island (A1a)

The second set: 86 printings, 66 new cards (its Old Amber is Genetic Apex's), one booster (Mew). Where its cards speak of
"your opponent", these are the readings used here; each card's own note says the same beside its text.

* **Serperior (Jungle Totem).** Each Grass Energy on your Grass Pokémon provides 2. Costs are paid with what Energy provides:
  attacks, "for each Energy attached" (Celebi ex flips twice per such Energy), "extra Energy", and Retreat Costs (a retreat
  discards only as many cards as cover the cost). Two Serperior do not stack. It does not double Energy of other types, or
  Grass Energy on a Pokémon that is not Grass.
* **Mew ex (Genome Hacking)** copies an attack of an opposing **Active** Pokémon and needs no Energy for it beyond its own cost.
  The copy is aimed at Genome Hacking's own target.
* **Gyarados ex (Rampaging Whirlpool)** discards one random Energy from among every Pokémon in play, whoever owns it.
* **Beheeyem, Pidgeot ex** count the Bench of the player whose Pokémon they hit. **Chatot (Mimic)** has no damage, so it is
  aimed at an opposing Active Pokémon to choose whose hand is counted.
* **Marshadow (Revenge):** "during your opponent's last turn" is "since your last turn": any opponent's attack counts. A
  Pokémon lost to Poison, or to its own attack's recoil, does not.
* **Weezing (Smokescreen):** the Defending Pokémon's owner flips when it tries to attack on their next turn; on tails that
  attack does not happen (its other queued attack is unaffected).
* **Aerodactyl ex (Primeval Law)** stops every opponent evolving their Active Pokémon, from anywhere in play. Benched Pokémon
  may still evolve.
* **Vaporeon (Wash Out)** may be used any number of times a turn, into either of your Active slots.
* **Blue** covers all your Pokémon until your next turn, against every opponent. **Pokémon Flute:** you choose the opponent
  and which Basic Pokémon in their discard pile comes back. **Mythical Slab:** only its player is told what the card was.
* **Packs:** the Mew booster uses the same slot odds as Genetic Apex's. Its cards cost the same pack points.
* **Mew (A1-283)** is still the reward for owning every Pokémon numbered 1 to 150; Mythical Island does not change that.
* Matches, replays and saves from before this set still load: nothing about existing cards changed.

## Space-Time Smackdown (A2)

The third set: 207 printings, 155 new cards, two boosters (Dialga and Palkia). It brings three things the game did not
have, and these are the readings used here.

* **Pokémon Tools** (Giant Cape, Rocky Helmet, Lum Berry). A Tool is played from the hand onto one of your Pokémon and stays
  there; a Pokémon holds one. It is discarded with its Pokémon (Knock Out, a return to the hand), goes into the deck with a
  Pokémon shuffled there, and stays through evolution. Any number may be played in a turn.
  * Giant Cape's +20 HP is lost with the cape: a Pokémon whose damage then reaches its own HP is Knocked Out.
  * Rocky Helmet works in either Active slot, against any opponent's attack; the point for a Knock Out by it goes to its holder's player.
  * Lum Berry acts at the end of **every** turn, **before** the Pokémon Checkup: a Poisoned holder recovers without taking that turn's Poison damage.
* **Burned and Confused.**
  * Burned: 20 damage at the Pokémon Checkup, then its owner flips; on heads it recovers. Like Poison it is checked at the end of its owner's
    turn and of the turn of the player who caused it, and it does not replace other conditions.
  * Confused: when the Pokémon attacks, its owner flips; on tails that attack does not happen (there is no damage to itself, as in Pocket).
    Asleep, Paralyzed and Confused replace one another. A Confused Pokémon may retreat.
* **Discarded Energy.** Energy discarded from your Pokémon (a Retreat Cost, an attack's cost, a Knock Out, a return to the hand) is
  kept in your discard pile, face up to everyone; Volkner attaches from it. Energy never attached is not there.
* **"During your next turn"** (Torterra, Leafeon, Togekiss) lasts through your next turn while the Pokémon stays in an Active slot;
  moving to the Bench ends it, as in the card game.
* **A second hit to a Benched Pokémon** (Empoleon, Gastrodon, Lopunny) may go to a Benched Pokémon of any opponent. **Spiritomb**
  hits every Pokémon of one opponent, the one you aim it at. **Palkia ex**'s Bench damage goes to the Defending Pokémon's owner only.
* **Darkrai ex (Nightmare Aura):** you choose the opposing Active Pokémon when you attach the Energy. When an effect attaches it
  (or no choice is sent), you are asked. Its damage is not an attack's: no effectiveness.
* **Dusknoir (Shadow Void):** if moving damage knocks Dusknoir out, the points go to the opponent whose attack last damaged the
  Pokémon the damage came from; if no opponent's attack did, nobody takes points.
* **Lucario (Fighting Coach)** stacks: two Lucario give +40. **Regice (Crystal Body)** stops attacks' effects (conditions, Energy
  discards, switches), never their damage. **Bastiodon (Guarded Grill):** its owner flips once per attack that damages it.
* **Purugly (Interrupt)** shows the hand to its player only, who then chooses; the match waits for that choice. **Bidoof (Super
  Fang)** halves remaining HP as an effect: no effectiveness, no reductions.
* **Cyrus:** you choose the opponent, their damaged Benched Pokémon, and which of their Active Pokémon it trades places with.
  **Mars:** the chosen opponent draws one card for each point they still need. **Dawn** moves any one Energy you choose.
* **Rotom's forms** take their Combat Types from the games' forms (Wash Rotom is Electric and Water) and show Rotom's sprite.
* **Packs:** the Dialga and Palkia boosters use the same slot odds as the earlier sets (an assumption).
* Matches, replays and saves from before this set still load: nothing about existing cards changed.

## Triumphant Light (A2a)

The fourth set: 96 printings, 75 new cards, one booster (Arceus). These are the readings used here.

* **The "Link" Abilities** (Power, Speed, Vigor, Resilience, Cunning Link) work while you have Arceus or Arceus ex anywhere in
  play, and stop the moment you do not. Two cards of a name each have their own.
* **Attack costs can change** (Abomasnow beside Arceus; Barry for the turn). Only Colorless Energy in a cost is taken off; an
  attack copied by Ditto or Mew ex is paid at the copier's cost. The card you read shows the printed cost; the game uses the reduced one.
* **Glaceon ex (Snowy Terrain).** At the end of every player's turn, while Glaceon ex is in an Active slot, its player chooses
  the opposing Active Pokémon that takes the damage; the match waits for that choice, whoever's turn it is. With one
  opposing Active Pokémon there is nothing to ask. Not an attack's damage: no effectiveness. A Knock Out by it scores for
  Glaceon ex's player. (See "Damage nobody aimed" below.)
* **Toxicroak (Toxic):** that Poison does 20 at each Checkup for as long as it lasts. A later ordinary Poison replaces it.
* **Arceus ex (Fabled Luster)** cannot be given any Special Condition, by anyone. **Snorlax (Collapse)** puts itself to sleep
  after its damage.
* **Origin Forme Dialga (Time Mash):** on tails it cannot attack on its player's next turn while it stays in an Active slot.
* **Leafeon ex (Forest Breath)** attaches to any of your Grass Pokémon, Benched included. **Shaymin (Sky Support)** helps a
  Basic Pokémon in either Active slot; two Shaymin on the Bench take off 2.
* **Unown (CHECK):** any player may be chosen, you included; only you are shown the card.
* **Crobat (Cunning Link)** is aimed at an opposing Active Pokémon of your choice. **Gastly (Astonish):** the card shuffled away
  is shown to everyone.
* **Adaman** covers only your Metal Pokémon, until your next turn. **Irida** heals every one of your Pokémon holding at least one
  Water Energy. **Barry** names Snorlax, Heracross and Staraptor, of any set.
* **Origin Forme Dialga and Palkia** have the base formes' types and sprite (this site has no Origin Forme of them).
* A full-art printing that writes "Pokémon {ex}" where the regular one writes "Pokémon ex" is the same card.
* **Packs:** the Arceus booster uses the same slot odds as the earlier sets (an assumption).
* Matches, replays and saves from before this set still load: nothing about existing cards changed.

## Damage nobody aimed

Some damage is not aimed by an action: an Ability at the Pokémon Checkup (Glaceon ex), or an Ability answering an Energy
that an effect attached (Darkrai ex). When it could go to more than one opposing Active Pokémon, the player it belongs to
chooses. The match waits for that choice, even on another player's turn; online, a player who does not answer in time has
the choice made for them like any other move. With a single possible target nothing is asked.

Matches are recorded with a **rules revision**. Revision 1 (matches recorded before this) gave such damage to the first
opposing Active Pokémon in turn order, and those matches replay exactly as they were played. New matches are revision 2.

## Shining Revelry (A2b)

The fifth set: 111 printings, 72 new cards, one booster. These are the readings used here.

* **Shiny printings.** The set adds two shiny rarities. Like full-art printings, a shiny printing counts as a copy of its card
  for play; the Collection shows the rarest printing owned. The set's crown Poké Ball is a printing of the promo Poké Ball.
* **Packs.** The Shining booster rolls the shiny rarities too. Card 4: two-diamond 89%, three-diamond 4.952%, four-diamond
  1.666%, one-star 2.572%, two-star 0.5%, three-star 0.222%, one-shiny 0.714%, two-shiny 0.333%, crown 0.041%. Card 5:
  two-diamond 56%, three-diamond 19.81%, four-diamond 6.664%, one-star 10.288%, two-star 2%, three-star 0.888%, one-shiny
  2.857%, two-shiny 1.333%, crown 0.16%. (Pocket's published table, as recalled; the crown's 0.041 is rounded so the row sums to 100.)
* **Giratina ex (Broken-Space Bellow)** ends its player's turn at once: no attack that turn, and the Pokémon Checkup follows.
* **Tatsugiri (Retreat Directive)** works from anywhere in play, for a Dondozo in either Active slot.
* **Grafaiai (Poison Coating)** and **Team Rocket Grunt** are aimed at an opposing Active Pokémon of your choice. **Wigglytuff
  (Comforting Song)** heals a Pokémon in either of your Active slots.
* **Iono** is for every player in the match, eliminated players aside. **Red**'s +20 applies only into a Pokémon ex in an
  opposing Active slot. **Pokémon Center Lady** may be played on a Pokémon with a Special Condition and no damage.
* **Wiglett and Wugtrio ex** choose at random among the Pokémon of one opponent, the one you aim at. **Alakazam** and **Dondozo**
  hit the Bench of the Defending Pokémon's owner only.
* **Gholdengo** flips for each Metal Energy it is provided (Serperior's doubling is for Grass Energy and does not apply).
* **Paldean Tauros** is the Blaze Breed (Fighting and Fire), **Paldean Wooper** and **Paldean Clodsire ex** their Paldean forms.
* The source gives two full-art printings of Paldean Clodsire ex a damage of "60" where the regular printing has "60+". All
  three have the same text, which adds damage, so they are one card with "60+".
* Matches, replays and saves from before this set still load: nothing about existing cards changed.

## Pack odds, checked

The slot tables were checked against published copies of the game's own offering rates (November 2026):

* **Sets without shiny cards** (Genetic Apex to Triumphant Light). Card 4: 90 / 5 / 1.666 / 2.572 / 0.5 / 0.222 / 0.04.
  Card 5: 60 / 20 / 6.664 / 10.288 / 2 / 0.888 / 0.16 (two- to four-diamond, one- to three-star, crown). Several
  independent guides print exactly these.
* **Sets with shiny cards** (Shining Revelry on). Card 4: 89 / 4.952 / 1.666 / 2.572 / 0.5 / 0.222 / 0.714 / 0.333 / 0.04,
  confirmed. Card 5: every value is confirmed except the two- and three-diamond pair, where two sources differ by a hair:
  56 / 19.81 (used here: it is the pair that makes the row sum to 100) against 56.756 / 19.041 (which sums to 99.987).
* **Rare packs.** One pack in 2,000 (0.05%) is a rare pack: all five cards are of one star or better. Without shiny cards:
  one-star 40%, two-star 50%, three-star 5%, crown 5%. With them: 38 / 47 / 5, one-shiny 5, two-shiny 2, crown 3. The 0.05%
  and the shiny table are confirmed; the 40 / 50 / 5 / 5 table is the one widely reported at launch.
* The Mew, Dialga, Palkia, Arceus and Shining boosters use these same tables: the game uses one table per kind of set.

## Attack Combat Types

Every Pocket-only attack's Combat Type is now settled (`data/ATTACK_TYPE_REVIEW.md` lists each with its reason). The rules:
a name with an element in it takes that element; a renamed mainline move takes that move's type; an attack that is one
Pokémon's own takes the type of that Pokémon it is plainly made of; an attack shared by Pokémon with nothing in common takes
the type of the plain mainline move it most resembles.

That last rule changed six attacks (rules revision 3): Pierce, Sharp Scythe and Spinning Attack are Normal (they were Steel, Bug
and Steel, after one of their users), Power Blast is Normal (it was Psychic, though Arceus uses it too), Guard Press is Fighting
(Body Press; it was Rock) and Hypnoblast is Psychic (Hypnosis; it was Ghost). A match recorded before this replays with the
types it was played with.

## Celestial Guardians (A3)

The sixth set: 239 printings, 157 new cards, two boosters (Solgaleo and Lunala). These are the readings used here.

* **Rare Candy** evolves a Basic Pokémon straight into a Stage 2 card of its own line (the Stage 1 between them need not be in
  your deck). Not on your first turn, not on a Pokémon played this turn, and it obeys whatever stops that Pokémon evolving.
  Energy, damage and a Pokémon Tool stay; Special Conditions and attack effects go, as with any evolution.
* **Abilities that answer a Knock Out** (Pyukumuku's Innards Out, Passimian ex's Offload Pass) need the Pokémon to be in an
  Active slot and Knocked Out by an opposing attack's damage. Pyukumuku's 50 scores for its player if it knocks the attacker
  out. For Offload Pass its player chooses the Benched Pokémon, and the match waits for that choice.
* **Conkeldurr (Guts):** its owner flips once per attack that would knock it out; on heads the attack leaves it with 10 HP.
* **Comfey (Flower Shield)** is kept true after every action: a Pokémon of its side holding Psychic Energy recovers at once and
  cannot be given a condition. **Oricorio (Safeguard)** stops the damage of every opponent's Pokémon ex, not their attacks' effects.
* **Komala (Comatose)** falls asleep whenever any Energy from the Energy Zone is attached to it in an Active slot, by the turn's
  attachment or by an effect. **Wimpod (Wimp Out)** is for its player's first turn of the match.
* **Golisopod (First Impression):** "moved from your Bench to the Active Spot this turn" is any move into an Active slot during
  your turn: a retreat, a promotion into an empty slot, a switch, or Solgaleo ex-style swap.
* **"During your opponent's next turn" locks** (Vikavolt: no Items; Banette: no Energy from the Energy Zone onto an Active Pokémon)
  bind the owner of the Defending Pokémon for their next turn. A fossil is an Item and is locked too; a Pokémon Tool is not.
* **Oranguru (Primate's Trap)** adds 1 Colorless to the Defending Pokémon's attack costs and Retreat Cost for its owner's next turn.
* **Kommo-o** and **Alolan Sandslash** carry their effect until their player's next turn, against every opponent.
* **Decidueye ex (Pierce the Pain)** may be aimed only at an opposing Pokémon that already has damage. **Tapu Lele** counts the
  Energy cards on its target (not what they provide).
* **Lunala ex (Psychic Connect)** and **Solgaleo ex (Rising Road)** work with either Active slot; you choose which.
* **Acerola** moves the damage to an opposing Active Pokémon of your choice. **Guzma** reaches every opponent. **Lana** takes any
  Benched Pokémon; you also choose which of that player's Active Pokémon it replaces. **Kiawe** ends your turn after its Energy.
* **Rotom Dex:** you see the card, then answer yes or no; the match waits. **Leaf Cape** may be attached to any Pokémon but gives
  its HP only to a Grass Pokémon. **Poison Barb** works in either Active slot.
* **Forms.** Alolan Pokémon have their Alolan types and sprites. The four Oricorio are the four styles (the two Psychic-type cards
  are told apart by their attack), and the two Lycanroc are Midday and Midnight.
* **Packs:** both boosters hold shiny printings and roll on the shiny table.
* Matches, replays and saves from before this set still load: nothing about existing cards changed.

## Extradimensional Crisis (A3a)

The seventh set: 103 printings, 69 new cards, one booster. These are the readings used here.

* **Ultra Beasts.** Several cards name "your Ultra Beasts". They are the eleven species the games give that name: Nihilego,
  Buzzwole, Pheromosa, Xurkitree, Celesteela, Kartana, Guzzlord, Poipole, Naganadel, Stakataka and Blacephalon (an ex counts).
* **Luxray (Intimidating Fang)** and **Stoutland (Guard Dog Visage)** work from either Active slot and reach every opponent's
  Active Pokémon: their attacks do 20 less, or cost 1 Colorless more. Two of them add up.
* **Claydol (Heal Block):** while it is in play nobody's Pokémon is healed, by anything. A card that heals may still be played;
  it heals nothing. (Mallow then does nothing at all: no healing, no Energy discarded.)
* **Nihilego (More Poison)** adds 10 to the poison damage of every opponent's Poisoned Active Pokémon, from an Active slot or
  the Bench. Two of them add up.
* **Zeraora (Thunderclap Flash)** takes its Energy at the end of its player's first turn of the match, wherever it is in play.
* **Celesteela (Ultra Thrusters):** you choose which Active Ultra Beast leaves and which Benched one comes up.
* **Bewear (Superpowered Hug):** the Knock Out is the attack's, so its player scores for it. **Krookodile** and **Guzzlord ex**
  flip for the owner of the Defending Pokémon's hand, and for the Defending Pokémon's Energy.
* **Passimian (Let's Throw)** counts a Passimian on the Bench only (one in the other Active slot does not count), and
  **Silvally (Brave Buddies)** counts a Supporter you played this turn.
* **Beast Wall** needs every opponent to have no points. **Lusamine** needs one opponent to have a point; her Energy is picked
  at random from your own discarded Energy. **Looker** shows you one opponent's Supporters; the other players are told only
  that it happened. **Repel** takes any opponent's Active Basic Pokémon, and its owner chooses what replaces it in that slot.
* **Electrical Cord:** its player chooses the two Benched Pokémon, one after the other, and the match waits for the choices.
  With one Benched Pokémon only one Energy moves. **Beastite** adds its bonus into any opponent's Active Pokémon.
* **Damage marks.** The source drops the printed "+" or "×" from some records. Where an attack's own text adds or multiplies
  damage, the card shows the mark. This changes what five older cards display, and nothing about how they play.
* **Packs:** the booster holds shiny printings and rolls on the shiny table.
* Matches, replays and saves from before this set still load: nothing about how existing cards play changed.
