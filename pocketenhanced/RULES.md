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

## Eevee Grove (A3b)

The eighth set: 107 printings, 69 new cards, one booster. These are the readings used here.

* **Eevee ex (Veevee 'volve)** takes any card that evolves from Eevee. The usual limits hold: not on your first turn, not the
  turn it is played.
* **Sylveon ex (Happy Ribbon):** when it is played from the hand to evolve, its player is asked whether to draw 2 cards, and the
  match waits. The offer comes once a turn, whether it is taken or not.
* **Sweets Relay.** "During your last turn" is your previous turn only: a Sweets Relay used earlier in the same turn (by your
  other Active Pokémon) does not count, and a turn without one breaks the chain. **Alcremie** counts every use of the match.
* **Penny** has two steps. You choose an opponent and are shown a random Supporter from their deck (not a Penny); the card
  stays in their deck. A button then lets you use that card's effect as Penny's, with its own choices. An effect you do not
  use is gone when your turn ends. Other players see what was copied only when it is used.
* **Eevee Bag:** you choose one of its two effects when you play it. **Hau** and the bag's bonus apply into any opponent's
  Active Pokémon.
* **Snorlax ex (Full-Mouth Manner)** and **Leftovers** heal at the end of their player's own turn, in either Active slot, before
  the Pokémon Checkup.
* **Flareon ex (Combust):** if its 20 damage knocks Flareon ex out, the points go to the opponent that last damaged it, or to
  the only opponent; with several opponents and no earlier damage, to no one.
* **Mimikyu (Try to Imitate)** flips first; on heads it uses an attack of an opposing Active Pokémon of your choice, without
  needing its Energy, against Mimikyu's own target.
* **Espeon (Energy Crush)** counts the Energy on every Pokémon of the Defending Pokémon's owner. **Tsareena (Kick Down)** takes
  a card from that player's hand. **Umbreon (Dark Binding)** stops a Basic Pokémon attacking on its owner's next turn.
* **Whiscash (Earthquake)** hurts its own player's Bench only; a Knock Out from it goes to the Defending Pokémon's owner.
* **Sylveon (Evoharmony)** counts Stage 1 and Stage 2 Pokémon on your Bench (not the other Active slot).
* **Packs:** the booster holds shiny printings and rolls on the shiny table.
* Matches, replays and saves from before this set still load: nothing about how existing cards play changed.

## Wisdom of Sea and Sky (A4)

The ninth set: 241 printings, 161 new cards, two boosters (Lugia and Ho-Oh). These are the readings used here.

* **Baby Pokémon** (Pichu, Cleffa, Magby, Smoochum, Elekid, Tyrogue) attack for no Energy, as printed.
* **Will:** the next coin its player flips that turn, for an attack, Ability or Trainer card, is heads; any further coins of the
  same effect are ordinary. Unused, it is gone before the Pokémon Checkup.
* **Silver** and **Hiker** ask their player to choose, and the match waits: Silver shows one opponent's hand (to its player only)
  and takes a Supporter of their choice; Hiker shows the top cards and they are put back one at a time, top first.
* **Rescue Scarf:** every card of the Knocked Out Pokémon (its whole evolution line) goes to the hand; its Energy and the scarf
  are discarded; the point is still scored. It works against an attack from any opponent.
* **Steel Apron** is kept true after every action, like Comfey's shield. **Dark Pendant** takes the card from the hand of the
  Attacking Pokémon's owner. Both do nothing on a Pokémon of another type.
* **Unown (GUARD, POWER):** each works while its player has an Unown with the other Ability in play. The source record drops
  the Ability's own name from the sentence; the card shows it restored. Two GUARD and one POWER give -20.
* **Porygon2 (Buggy Evolution)** evolves on any Energy from the Energy Zone, the turn's own or an effect's, even on the turn it
  was played. **Crawdaunt (Unruly Claw)** always uses its discard when an opposing Active Pokémon has Energy; its player chooses
  which one. **Togekiss (Celestial Blessing)** flips once for each attack that would damage it.
* **Jumpluff (Fluffy Flight)** covers both of its player's Active slots, from anywhere in play. **Politoed (Lordly Cheering)**
  works only from the Bench. **Cherubi (En-fruits-iastic)** pays 1 Grass of its attack's cost while it holds a Pokémon Tool.
* **Typhlosion, Espeon ex, Umbreon ex:** you choose the opposing Active Pokémon to Burn, the Pokémon to heal, and which of that
  opponent's Active Pokémon the damaged Benched one replaces.
* **Octillery (Octazooka)** lasts until the Defending Pokémon leaves its Active slot or evolves; its owner flips each time it
  tries to attack. **Wobbuffet (Reply Strongly)** counts an attack from any opponent since its player's last turn.
* **Tangrowth (Grass Knot)** counts the Retreat Cost its target has at that moment. **Xatu (Life Drain)** is not attack damage:
  nothing reduces it, and it does nothing to a Pokémon already at 10 HP or less.
* **Magcargo (Spurt Fire)** may hit any Pokémon in the match except itself, its player's own included.
* **Gyarados (Wild Swing):** the Benched Water Pokémon you discard go to the discard pile with all their cards; nobody scores.
* **Ho-Oh ex (Phoenix Turbo)** and the babies' Energy go only to Benched Basic Pokémon; you choose which.
* **Jasmine** lasts until your next turn, against every opponent. **Lyra** and **Elemental Switch** work with either Active slot.
* **Packs:** both boosters hold shiny printings and roll on the shiny table.
* Matches, replays and saves from before this set still load: nothing about how existing cards play changed.

## Secluded Springs (A4a)

The tenth set: 105 printings, 71 new cards, one booster. These are the readings used here.

* **Memory Light:** its holder may also use the attacks of the cards it evolved from; they are listed after its own. Its
  Energy must still pay for them. A Basic Pokémon gets nothing from it.
* **Celebi (Temporal Leaves):** the top Evolution card of an evolved target goes to its owner's hand. Damage, Energy, a Pokémon
  Tool and Special Conditions stay. If the damage on it is then at least the lower Stage's HP, it is Knocked Out and Celebi's
  player scores.
* **Mismagius (Cursed Prose):** the 90 damage lands at the end of the Defending Pokémon's owner's next turn, during the Pokémon
  Checkup. It is not attack damage (nothing reduces it), it is lost if the Pokémon leaves its Active slot or evolves first, and
  a Knock Out by it is scored by Mismagius's player.
* **Jumpluff ex (Breeze-By Attack):** "you may switch": it stays unless you choose a Benched Pokémon.
* **Slowking (Litter):** you choose which Pokémon Tool cards in your hand to discard, up to 2; none chosen is 0 damage.
* **Suicune ex (Crystal Waltz)** counts your Bench and the Bench of the Defending Pokémon's owner (not other opponents').
* **Boltund (Defiant Spark):** with damage on Boltund the attack's whole cost is 1 Lightning Energy.
* **Miltank (Rolling Frenzy):** each use adds 30 to the next ones until Miltank leaves its Active slot or evolves.
* **Legendary Pulse** (Entei ex, Suicune ex, Raikou ex) draws at the end of its player's turn, before the Pokémon Checkup, from
  either Active slot; two of them in the Active slots draw two cards.
* **Milotic (Healing Ripples):** its player chooses which damaged Water Pokémon is healed; the match waits. Like Crawdaunt, it
  is always used when there is something to heal.
* **Misdreavus (Infiltrating Inspection):** with several opponents its player chooses whose hand is shown, by pointing at one of
  that player's Active Pokémon. Only its player sees the hand. Not during setup, and not when played into an Active slot.
* **Zoroark (Illusive Trickery)** protects it until its player's next turn, against every opponent.
* **Galarian Cursola (Perish Body):** its owner flips; on heads the Attacking Pokémon is Knocked Out and Cursola's player
  scores for it.
* **Morty** looks at one opponent's deck; that player does not see the cards or their new order. **Whitney** cures Asleep,
  Paralyzed and Confused, not Poisoned or Burned. **Inflatable Boat** does nothing on a Pokémon that is not Water.
* **Packs:** the booster holds shiny printings and rolls on the shiny table.
* Matches, replays and saves from before this set still load: nothing about how existing cards play changed.

## Mega Rising (B1)

The eleventh set: 331 printings, 224 new cards, three boosters (Mega Gyarados, Mega Blaziken, Mega Altaria). Deluxe Pack ex, released between Secluded Springs and this set, was added later from a second source (see "Deluxe Pack ex" below).

* **Mega Pokémon ex** are worth 3 points when Knocked Out. Each is played like any Pokémon of its Stage (Mega Absol ex and
  Mega Pinsir ex are Basic). This site has no Mega sprites: each uses its base species' picture, with the Combat Types the
  games give the Mega form (Mega Gyarados is Water and Dark, Mega Ampharos Electric and Dragon, Mega Altaria Dragon and
  Fairy, Mega Pinsir Bug and Flying).
* **Weakness** (Hitmonchan ex's Quick Straight) is the +20 of a Combat Type the Defending Pokémon is weak to; that attack
  drops it and keeps any -20. **Morgrem (False Surrender)** ignores effects placed on its target by attacks (a damage
  reduction or prevention that lasts a turn), not its Abilities or Pokémon Tools.
* **Lilligant (Toughness Aroma):** the +20 HP belongs to every Grass Pokémon of its player while Lilligant is in play, itself
  included, and two Lilligant give +40. When it leaves play, a Pokémon with more damage than its HP is Knocked Out at once; if
  Lilligant was Knocked Out, the same player scores for both.
* **Jolteon ex (Electromagnetic Wall)** answers every opponent's Energy from their Energy Zone, the turn's own or an effect's,
  from either Active slot; a Knock Out by it is scored by Jolteon ex's player. **Jellicent (Bouncy Body):** its player chooses
  the Benched Pokémon, and the match waits.
* **Dusknoir (Fade into Darkness):** its owner flips whenever it is Knocked Out, by anything; on heads nobody scores.
* **Rillaboom (Captivating Rhythm):** you choose the opponent's Benched Pokémon and the Active slot before the coin.
  **Klefki (Dismantling Keys)** needs a Pokémon Tool to discard; Klefki then goes to the discard pile and nobody scores.
* **Eevee (Boosted Evolution)** works only in an Active slot. **Delcatty (Search for Friends)** always takes a Supporter when
  the discard pile has one; its player chooses which.
* **Mega Absol ex and Absol:** their player is shown the hand of the Defending Pokémon's owner and chooses the Supporter.
* **Cofagrigus and Sableye:** you choose the cards to discard; with too few in hand the attack does nothing and may still be used.
* **Archeops (Wild Spin)** hits every Pokémon of one opponent (you pick them by a target); the +20 is for its next turn only.
* **Mega Ampharos ex and Ampharos** pick from the Bench of the Defending Pokémon's owner. **Honchkrow** counts that player's
  Pokémon with an Ability.
* **Prank Spinner** draws from every player's hand, yours included, and the card is shown to everyone. **Copycat** counts one
  opponent's hand. **May:** each Pokémon she finds is followed by a choice of a Pokémon in your hand to shuffle back.
* **Hala** lasts until your next turn, against every opponent. **Sitrus Berry** is checked at the end of every player's turn,
  before the Pokémon Checkup. **Heavy Helmet** reads the Retreat Cost its holder has at that moment.
* **Lucky Mittens** draws once for each opposing Pokémon its holder's attack knocks out.
* **Packs:** all three boosters hold shiny printings and roll on the shiny table.
* Matches, replays and saves from before this set still load: nothing about how existing cards play changed.

## Crimson Blaze (B1a)

The twelfth set: 103 printings, 69 new cards, one booster. These are the readings used here.

* **Five more Mega Pokémon ex** (Venusaur, Charizard Y, Blastoise, Lopunny, Steelix): 3 points each, base species' picture, the
  Mega form's Combat Types.
* **A gap in the source: Mega Steelix ex.** Its record reads "this Pokémon takes [ ] damage from attacks and has no Weakness":
  the number has been lost. The printed value is -20 (confirmed by the owner), and that is what is played. This is rules
  revision 4: a match recorded before it replays without the reduction, as it was played.
* **Blastoise.** The Genetic Apex Blastoise (Hydro Pump for Water + Colorless) and its Celestial Guardians printing (Water +
  Water + Colorless) differ in the source and are kept as two cards, as the owner decided.
* **"No Weakness"** (Steelix, Mega Steelix ex) removes the +20 of a Combat Type the Pokémon is weak to, until its player's next turn.
* **Reuniclus (Infinite Increase):** +30 HP for each Psychic Energy on it; losing the Energy can knock it out.
* **Wartortle (Shell Shield):** on the Bench it takes no damage from any attack. **Ariados (Trap Territory)** adds 1 to the
  Retreat Cost of every opponent's Active Pokémon, from anywhere in play; two of them add 2.
* **Charmeleon (Ignition):** its player chooses which of their Fire Pokémon in an Active slot takes the Energy; the match waits.
* **Blastoise and Mega Blastoise ex:** you choose the Benched Pokémon for the extra damage, from any opponent's Bench.
* **Ditto (Copy a Friend)** copies an attack of one of your own Benched Pokémon that is not a Pokémon ex, against Ditto's own
  target, and only if Ditto's Energy pays for it.
* **Liepard (Snatch and Flee):** every card of Liepard goes back into its player's deck; its Energy and Pokémon Tool are
  discarded; nobody scores; its player then promotes a Benched Pokémon as after a Knock Out.
* **Porygon-Z (Cyberjack)** counts the Trainer cards (Items, Pokémon Tools, Supporters, fossils) in the deck of the Defending
  Pokémon's owner.
* **Clemont's Backpack** adds its 20 into any opposing Pokémon, Benched ones too, as printed. **Quick-Grow Extract** may be
  used on a Pokémon that evolved this turn, but not on one played this turn. **Serena** finds only a Mega Pokémon ex.
* **Packs:** the booster holds shiny printings and rolls on the shiny table.
* Matches, replays and saves from before this set still load: nothing about how existing cards play changed.

## Fantastical Parade (B2)

The thirteenth set: 234 printings, 155 new cards, one booster. It brings a new kind of card: Stadiums.

* **Stadiums.** A Stadium is played to the table, not to a discard pile, and there is one for the whole table however many
  players there are. It stays until another Stadium replaces it (the old one goes to its owner's discard pile) or a card
  discards it. A player may play one Stadium a turn, as well as a Supporter, and not one with the same name as the Stadium
  in play. Its effect covers every player. It is shown on the mat; press it to read it.
* **Starting Plains** (+20 HP for Basic Pokémon): when it leaves play, a Basic Pokémon with more damage than its HP is Knocked
  Out and nobody scores for it. **Training Area**'s +10 is for a Stage 1 Pokémon's attack into an opposing Active Pokémon.
* **Alolan Muk (Power of Alchemy):** while it is in play no player's Basic Pokémon has an Ability: none applies and none can be
  used. Evolved Pokémon are not affected, Alolan Muk included.
* **Mimikyu ex (Disguise)** prevents the first damage an opposing attack would do to it, once for as long as it is in play.
* **Smeargle (Portrait)** works like Penny, from an Active slot: its player is shown a random Supporter in one opponent's hand
  (the card stays there) and may then use its effect that turn as a second step. It is not their Supporter for the turn.
* **Polteageist (Refreshing Tea):** its player is asked yes or no, then chooses the opponent; that player draws as many cards
  as the points they still need to win.
* **Teal Mask Ogerpon ex (Soothing Wind)** is kept true after every action, like Comfey's shield, for any Energy.
* **Falinks (Coordinated Unit)** needs another Falinks anywhere on its side. **Spiritomb (Final Scream)** hits the Pokémon of
  the attacker's owner only. **Meloetta (Strange Singing)** works from either Active slot, after the turn's draw.
* **Mega Kangaskhan ex (Double-Punching Family):** if the first hit knocks its target out, that Knock Out is settled at once
  (points, a promotion if the player has no Active Pokémon left) and the second hit lands on the Pokémon in that slot, or on
  that player's other Active Pokémon.
* **Guzzlord (Breakcore)** and **Liepard / Eldegoss** remove a Pokémon without a Knock Out: nobody scores. For Eldegoss its
  Pokémon Tool goes into the deck with it; Energy is not a card here and is discarded.
* **Galarian Stunfisk (Snapping Trap)** lasts until its player's next turn and answers a retreat by any opponent.
* **Oricorio (Inspiring Dance):** the +20 is for its player's next turn only, for all their Pokémon.
* **Mega Swampert ex** draws from every Pokémon in the match, its own side's too. **Delibird**'s tails heals its target.
* **Protective Poncho** stops opposing attacks and the Abilities that do damage; **Metal Core Barrier** is discarded at the end
  of the next turn any opponent takes.
* **Ogerpon's masks** use the one Ogerpon picture this site has, with each mask's types. Four more Mega Pokémon ex.
* **Two reprints matched.** A curly apostrophe in the source made two reprints look like new cards (a Tauros here, and the rare
  Cubone of Celestial Guardians). They are now printings of the cards they reprint; decks that named them still load.
* **Packs:** the booster holds shiny printings and rolls on the shiny table.
* Matches, replays and saves from before this set still load: nothing about how existing cards play changed.

## Paldean Wonders (B2a)

The fourteenth set: 131 printings, 93 new cards, one booster. It is the newest set the card source has.

* **How this set's records are written.** They spell types out ("a Fire Energy", "the Water Pokémon") where earlier sets use
  the symbol, and write "from and effects of" without its dashes. They are read as the usual wording; the printed text is kept.
* **Three gaps in the source, filled from the source itself.**
  - Its Pokémon ex have lost the " ex" from their names. Each record still says it in its `suffix`, so the name is restored
    (Meowscarada ex, Armarouge ex, Chien-Pao ex, Bellibolt ex, Gholdengo ex, and the reprinted Entei ex, Suicune ex, Raikou ex
    and Tinkaton ex). They are Pokémon ex in every way: 2 points.
  - Two reprints (a Maushold and Tinkaton ex) have no "evolves from"; they take it from the card's other printing.
  - A shiny Gholdengo and the crown Baxcalibur differ from their other printings in the source (Retreat Cost 1 not 2; 170 HP
    not 140). They are kept as the source gives them, as separate cards.
* **Mesagoza** is a Stadium with something to use: once in each player's own turn that player may flip a coin for a random
  Pokémon from their deck (press the Stadium, then Use). The rest of its printed text is the Stadium rule itself.
* **Meowscarada ex (Flower Trick):** you choose a spot by choosing the Pokémon standing in it now. The spot is marked for
  everyone to see. At the end of that player's next turn the Pokémon standing there takes 70, whichever Pokémon it is; an
  empty spot takes nothing. It is not attack damage, and a Knock Out by it is scored by Meowscarada ex's player.
* **Skeledirge (Passionate Voice)** and **Quaquaval (Torrent)** add their bonus into any opponent's Active Pokémon.
  **Arboliva (Extra Heal):** you choose the Pokémon ex. **Baxcalibur (Ice Maker)** works with either Active slot.
* **Veluza (Shedding Spiral):** with no cards in its player's deck the attack's whole cost is 1 Water Energy.
* **Gholdengo ex (Spending Rush)** picks from the Pokémon of the Defending Pokémon's owner. **Houndstone** counts the Psychic
  Pokémon cards in its player's discard pile. **Ting-Lu**'s attack does nothing at 60 HP or less, and may still be used.
* **Team Star Grunt** takes from one opponent of your choice; a Basic Pokémon silenced by Alolan Muk has no Ability to count.
* **Packs:** the booster holds shiny printings and rolls on the shiny table.
* Matches, replays and saves from before this set still load: nothing about how existing cards play changed.

## Deluxe Pack ex (A4b), and the second source

TCGdex, the source of every other set here, does not have Deluxe Pack ex (nor any set after Paldean Wonders). This set
comes from two other sources that are checked against each other by `tools/pocket_fetch_alt.mjs`:

* the **Limitless TCG Pocket card database** for names, stats, attacks, Abilities and rules text (its flavour text,
  illustrator credits and card pictures are not taken);
* the open dataset **pokemon-tcg-pocket-database** (MIT) for rarity, booster packs, pull rates, and the same stats again.

The fetch fails if the two disagree on a card's name, HP, Stage, type, Retreat Cost or Weakness. For Deluxe Pack ex they agree
on all 379 cards. Run on three sets TCGdex also has, the importer reproduces TCGdex's records except where TCGdex has a
mistake of its own, which is how the differences listed below were found.

* **A reprint set.** 379 printings, and 378 of them are printings of cards already in the game. The one new card is its
  **Pachirisu**: Plasma attaches a Lightning Energy to a Benched **Lightning** Pokémon. TCGdex's Shining Revelry record of the
  same card had lost the "{L}"; it was corrected in rules revision 5 (below). The two stay separate cards so that saved decks keep working.
* **Its pack is different.** Four cards on the published rates: a one-diamond card; a one- or two-diamond card; a third card
  from a table that includes **foil** versions of the one- to three-diamond cards (◇, about half the time) and the star, shiny
  and crown cards; and the fourth is always a four-diamond card, a Pokémon ex. One pack in 2,000 is a rare pack of four.
* **Foils** are separate printings in the collection (each one- to three-diamond card of the set has a plain and a foil
  printing); they are the same gameplay card.
* **Wording.** Where this source writes a reprint's text slightly differently (a line break for a space, a curly apostrophe,
  "or" for "and" in Wishiwashi ex's School Storm), the card is the same card and keeps the wording it already had.
* **What the second source says about older cards** (corrected in rules revision 5, below):
  the Genetic Apex Blastoise's Hydro Pump costs Water, Water, Colorless there (as its Celestial Guardians printing does),
  Seadra's Water Arrow costs three Water, and Pincurchin's Thunder Shock does 30.
* Matches, replays and saves from before this set still load: nothing about how existing cards play changed.

## Mega Shine (B2b)

The sixteenth set, and the first new one taken from the second source (see "Deluxe Pack ex" above): 117 printings, 69 new
cards, one booster (Mega Charizard X) that rolls on the shiny table. Five Mega Evolution Pokémon ex, worth 3 points each:
Mega Charizard X ex (Fire and Dragon in combat), Mega Slowbro ex, Mega Manectric ex, Mega Gengar ex and Mega Scizor ex.

What the set needed that the game did not have:

* **Miraculous Memory (Mew).** One attack is chosen at random from all the attacks of the Pokémon in the hand and deck of
  the Defending Pokémon's owner, and Mew uses it, aimed at Miraculous Memory's own target. A choice the chosen attack would
  ask for takes its default. An attack that itself copies an attack does nothing.
* **Labyrinth of Shadows (Mega Gengar ex).** The Defending Pokémon's owner can play no Trainer card on their next turn:
  no Item, Supporter, Pokémon Tool, Stadium or fossil.
* **Bad Dreams (Darkrai).** At the end of every turn, each opposing Active Pokémon that is Asleep takes 20, before it
  flips to wake up. Darkrai's owner scores a Knock Out it causes.
* **Raging Freeze (Lapras)** Paralyzes when one of its player's Pokémon was Knocked Out by an attack since their last turn.
* **Enormous Explosion (Forretress)** does 100 to itself and 50 to every Benched Pokémon of its player and of the
  Defending Pokémon's owner. **Laundry-Go-Round (Mega Slowbro ex)** flips 3 coins: 20 for each heads to each Benched
  Pokémon of the Defending Pokémon's owner.
* **Counting attacks.** Lightning Accelerator: +30 for each point its player has. Swaying Dance: +40 when the Defending
  Pokémon's owner holds exactly 2, 4 or 6 cards. Frenzied Blade: +20 for each Benched Pokémon of both players. Mental
  Crush: +40 into a Confused Pokémon.
* **Energy.** Sky's Blessing attaches a Water and a Lightning Energy from the Energy Zone (whatever the deck's Energy
  types); Dragon Wave discards one of each; Energizer Wheel moves 2 Darkness Energy to a Benched Pokémon its player
  chooses; Gaia Blast discards 2 random Energy from among all its player's Pokémon.
* **Nasty Notice.** You choose an opponent; that player chooses cards to discard until they hold 4.
* **Maintenance.** You choose 2 cards from your hand to shuffle into your deck, then draw 1. It cannot be played without
  2 other cards in hand.
* **Iris.** This turn, when your Haxorus Knocks Out an opposing Active Pokémon with an attack, you get 1 more point.
* **Calem.** Draw a card for each Mega Evolution Pokémon ex in play, every player's.
* **Hiking Trail (Stadium).** At the end of each player's turn, that player draws until they hold 3 cards.
* The set's packs are five cards on the same tables as the other shiny boosters. The published rates also have a rare
  six-card pack; the game does not model it.
* Matches, replays and saves from before this set still load: nothing about how existing cards play changed.

## Rules revision 5: four corrected cards

Four records from the first source were wrong. The second source has the printed card, and the owner confirmed each:

* **Blastoise** (Genetic Apex): Hydro Pump costs Water, Water, Colorless (it was Water, Colorless).
* **Seadra** (Genetic Apex): Water Arrow costs Water, Water, Water (it was Water, Water, Colorless).
* **Pincurchin** (Genetic Apex): Thunder Shock does 30 (it was 40).
* **Pachirisu** (Shining Revelry): Plasma attaches to a Benched Lightning Pokémon (it was any Benched Pokémon).

New matches are played under revision 5. A match recorded under an earlier revision replays with what the card had then,
so every old replay and every match in progress plays out as it was.

## Pulsing Aura (B3)

The seventeenth set, from the second source: 234 printings, 155 new cards, one booster (Mega Lucario) on the shiny table.
Four new Mega Evolution Pokémon ex (Mega Sceptile ex, Mega Camerupt ex, Mega Lucario ex, Mega Audino ex), and reprints of
Mega Blaziken ex, Mega Absol ex and Mega Steelix ex. Its record of Mega Steelix ex prints the -20 the owner confirmed.

What the set needed that the game did not have:

* **Victory Star (Victini).** After an attack of one of its player's Fire Pokémon has flipped coins, that player is shown
  the results and may ignore them: the match goes back to where it stood before the attack, and the attack is carried out
  again with new flips. Once a turn. What the first try wrote in the log stays written, with a line saying it was ignored.
* **Time Recall (Celebi).** Each evolved Pokémon of its player may use the attacks of its previous Evolutions (as Memory
  Light does for one Pokémon).
* **Double Type (the two Urshifu).** The card is of two types for everything that asks a Pokémon's type: Trainer cards,
  Abilities, Stadiums, Energy effects. Its types in combat are its own, as for every card.
* **Prickly Powder (Budew).** The Defending Pokémon has no Ability until it leaves its Active slot (or evolves).
* **Seal of Antiquity (Regigigas)** cannot attack without Regirock, Regice and Registeel on its player's Bench.
* **Sand Slammer (Flygon ex)**, in an Active slot: at the end of every turn, 10 to each Pokémon of every opponent.
* **Swift Shot (Drizzile, Inteleon).** When played from the hand to evolve, its player may do 20 (30) to an opposing
  Active Pokémon of their choice; once a turn for each of the two amounts.
* **Other Abilities.** Frozen Flow and Perplexing Ears work from an Active slot only. Accept Pain moves 30 damage from an
  Active Pokémon to Brambleghast on the Bench. Happiness Supplement removes one random Special Condition from an Active
  Pokémon. Villainous Delivery (on the Bench) takes 1 off an Active Darkness Pokémon's Retreat Cost.
* **Evolution Jammer (Malamar).** The Defending Pokémon's owner cannot evolve from their hand on their next turn (Rare
  Candy included).
* **Dark Vengeance (Zarude)** asks which type of Pokémon fell: the game now records it.
* **Attacks that read the board.** Powerful Friends (a Stage 2 on the Bench), Psychic Resonance (a Psychic Pokémon on the
  other side), Puppy Pile (Pokémon with that attack in play and in hand), Raid (evolved from Poliwhirl this turn), and
  the Castform forms (a Stadium in play).
* **Coins.** Eruption discards a Fire Energy and adds 30 for each heads of 3. Flare Storm flips for each Fire Energy.
  Mountain Crush flips until tails and discards from the top of the other deck. Stoke attaches 2 on heads.
* **Field Blower** discards a Pokémon Tool from any player's Pokémon, or the Stadium in play. **Lucky Egg**: its holder
  Knocked Out by an opposing attack, its player draws up to 5 cards in hand. **Cabbie** fetches a Stadium. **Korrina**:
  +30 from Fighting Pokémon into a Pokémon ex. **Cheren**: Watchog and Stoutland take 100 less from Pokémon ex.
  **Parasol Lady** returns a Water Pokémon that is not a Pokémon ex to the hand (its Energy is discarded).
* **Stadiums.** Fragrant Forest: once a turn each player may take a random Basic Grass Pokémon from their deck (the
  Stadium's Use button, no coin). Arena of Antiquity: Fighting Pokémon do +20 into a Pokémon ex.
* **Bounded Field and Weakness.** This game has no ×2 Weakness: the flat +20 type bonus stands in for it. Under Bounded
  Field, where that bonus would apply to an opposing Active Pokémon, the damage is ×2 in its place, unless the attacker
  is a Mega Evolution Pokémon ex. A type penalty (-20) still applies.
* **Two garbled texts corrected** (no change to play): Mega Blaziken ex's Mega Burning and Mega Steelix ex's Adamantine
  Rolling now read as printed.
* Matches, replays and saves from before this set still load: nothing about how existing cards play changed.

## Paradox Drive (B3a)

The eighteenth set, from the second source: 109 printings, 75 new cards, one booster (Koraidon) on the shiny table.

* **Ancient and Future Pokémon.** The cards print the label; neither source carries it. Here it is given by species, the
  Paradox Pokémon of the past and of the future. Ancient: Great Tusk, Scream Tail, Brute Bonnet, Flutter Mane, Slither
  Wing, Sandy Shocks, Roaring Moon, Koraidon, Walking Wake, Gouging Fire, Raging Bolt. Future: Iron Treads, Iron Bundle,
  Iron Hands, Iron Jugulis, Iron Moth, Iron Thorns, Iron Valiant, Miraidon, Iron Leaves, Iron Boulder, Iron Crown.
  Checked against two published lists of Ancient and Future cards (Serebii, Dittobase): they have every card of those
  species from Paradox Drive on, and not the Koraidon and Miraidon of Paldean Wonders, which were printed before the
  label existed. Those two carried it here at first, by mistake; rules revision 6 took it off (below).
* **Legendary Drive (Koraidon ex, Miraidon ex).** Put onto the Bench from the hand, it may take the place of one of its
  player's Active Pokémon; if it does, all that player's Energy in play moves to it. Once a turn (the two share it).
* **Ancient Roar (Roaring Moon).** Put onto the Bench from the hand, it may switch an opposing Active Pokémon out.
* **Future System (Iron Valiant).** Attacks of its player's Future Pokémon cost 1 less Colorless Energy; two Iron Valiant
  take off 2.
* **Blessed Salt (Garganacl).** At the end of every turn, each of its player's Pokémon heals 10.
* **Cold Start, Spellbinding Start.** "The first time this Pokémon has used an attack after coming into play": the game
  now remembers that a Pokémon in play has attacked. Evolving it or moving it to the Bench does not reset it.
* **Lumina Crash (Espathra).** The Defending Pokémon takes +50 from attacks during Espathra's player's next turn only.
* **Shooing Shout (Scream Tail).** On two heads the Defending Pokémon is discarded with everything attached: no points.
* **Pull In and Pound (Sandy Shocks).** Its player chooses an opposing Active Pokémon and which of that player's Benched
  Pokémon takes its slot; the new Active Pokémon takes 50.
* **Baneful Boom (Raging Bolt)** discards all its Energy and Knocks Out the Defending Pokémon.
* **Overlord's Blade (Kingambit)** counts every Knock Out of its player's Pokémon this game, whatever caused it.
* **Other attacks.** Thermal Gust (3 coins: +20, +50 or +120), Jeweled Gift (an Energy of a random one of eight types,
  whatever the deck's Energy types), Prism Impact (+20 for each type of Energy attached), Sudden Drilling.
* **Professor Sada.** One Energy of each type in the discard pile, up to 3 types, goes to her player's Ancient Pokémon,
  each to the one they choose. With more than 3 types there, 3 are taken at random.
* **Professor Turo** shuffles a Future Pokémon in play into the deck (its Energy and Tool are discarded). **Juliana**
  fetches a Stage 2 Pokémon. The two Booster Energy Capsules give an Ancient Pokémon +40 HP and a Future Pokémon +20 damage.
* **Area Zero (Stadium).** Once a turn each player may shuffle a Basic Pokémon from their hand into their deck and draw a
  card (the Stadium's Use button).
* Matches, replays and saves from before this set still load: nothing about how existing cards play changed.

## Everyday Wonders (B3b)

The nineteenth set, from the second source: 106 printings, 69 new cards, one booster (Mega Diancie) on the shiny table.
Two Mega Evolution Pokémon ex (Mega Diancie ex, Mega Sableye ex). The Hisuian forms fight as their own types (Hisuian
Goodra is Steel and Dragon, Hisuian Zoroark ex Normal and Ghost). Its Flutter Mane is Ancient and its Iron Bundle Future.

* **Quick Growth (Caterpie).** At the end of each opponent's turn, a Caterpie in an Active slot evolves from its
  player's deck (a random card that evolves from it).
* **Massive Body (Snorlax).** While it is in an Active slot, its opponents cannot play Stadium cards.
* **Soothing Ribbon (Sylveon)** heals 30 from one of its player's Pokémon, once a turn, while Sylveon holds a Pokémon Tool.
* **Amnesia (Quagsire).** One of the Defending Pokémon's attacks, chosen at random, cannot be used on its owner's next turn.
* **Hexing Flight (Flutter Mane)** does nothing unless Flutter Mane moved up from the Bench this turn.
* **Counting attacks.** Windup Thunder and Dede-Circuit (Pokémon Tools on its player's Pokémon), Brilliant Storm
  (Psychic Energy on all of them), Spiteful Illusion (Pokémon in the discard pile), Smitten Strike (a type of Energy
  shared with the Defending Pokémon).
* **Puppy Pile** is on five more Pokémon here (Growlithe, Yamper, Fidough, Rockruff, with Pulsing Aura's Lillipup), and
  **Puppy-Loving Girl** takes the ones among the top 4 cards of the deck.
* **Small Balloon** takes 1 off a Basic Pokémon's Retreat Cost; **Elegant Cape** gives a Stage 1 Pokémon +30 HP.
* **Elesa** returns every Pokémon Tool in play, every player's, to its owner's hand. A Pokémon that only its Tool's HP
  kept standing is Knocked Out, and no one takes points for it unless an opponent had damaged it.
* **Wallace** evolves a Water Pokémon with a maximum HP of 50 or less from the deck. Unlike the earlier card of this kind
  he may be used on a first turn and on a Pokémon played this turn: his text has no such limit.
* **Kid's Room (Stadium).** Once a turn each player may switch a card in their hand with a random Pokémon Tool from their
  deck (the Stadium's Use button). It cannot be used with no Pokémon Tool in the deck.
* Matches, replays and saves from before this set still load: nothing about how existing cards play changed.

## Rules revision 6: Paldean Wonders' Koraidon and Miraidon

When Paradox Drive was added, the Ancient and Future labels were given by species, and so also to the Koraidon and
Miraidon of Paldean Wonders. The published lists of Ancient and Future cards do not have those two: the label starts
with Paradox Drive. New matches are played under revision 6, where they have no label (no +40 HP from the Ancient
Booster Energy Capsule, no Professor Sada, no Future System, no Professor Turo, no Future Booster bonus). A match
recorded under revision 5 replays as it was played.

## Ruler of the Skies (B4)

The twentieth set, from the second source: 233 printings, 155 new cards, one booster (Mega Rayquaza) on the shiny table.
Four new Mega Evolution Pokémon ex (Mega Sharpedo ex, Mega Gallade ex, Mega Metagross ex, Mega Rayquaza ex). Hoopa ex,
on its Darkness card, fights as Hoopa Unbound (Psychic and Dark).

* **Two Pokémon Tools (Revavroom's Dual Customization).** A Pokémon with this Ability may hold two Pokémon Tools, and each
  works on its own (two that give HP both count). Everything that asks about "its Pokémon Tool" now asks about either.
  An effect that discards or returns a Pokémon's Tools takes both; Field Blower, which discards one, lets its player
  choose which. A Tool that discards itself (a Berry, a Barrier) leaves the other attached.
* **Clear Veil (Tool).** The effects of opposing attacks do not reach its holder (conditions, "can't retreat", lost
  Energy, lost Tools, switches); their damage does.
* **Deceptive Needle (Tool).** At the end of its player's turn, 10 to an opposing Active Pokémon of their choice when its
  holder is an Active Darkness Pokémon.
* **Abyssal Drop (Armaldo).** A spot is marked, as Flower Trick marks one; at the end of that player's next turn the
  Pokémon standing there is Knocked Out, and Armaldo's player scores it.
* **Energy Blender (Delcatty).** Its player moves any Energy among their own Pokémon: on the page, press an Energy, then
  the Pokémon it goes to, and Done when finished.
* **Dragon's Blessing (Dragonair)**, from the Bench: an Energy from the discard pile, of its player's choice, to an
  Active Dragon Pokémon. "{N}" on a card is the Dragon type.
* **Abilities that answer being played.** Hospitality (Poltchageist, onto the Bench: heal 20 from an Active Grass
  Pokémon); Stance (Samurott, evolving: nothing an opposing attack does reaches it until its player's next turn);
  Evoshock (Raichu, evolving: a coin, heads Paralyzes); Treasure Collecting (Raticate, evolving: the Items among the top
  4 cards). Each once a turn.
* **Variety Powder (Dustox)**: one of Burned, Confused and Poisoned that does not already affect the Pokémon, at random.
  **Conductive Body (Beldum)**: 2 less to retreat with another Beldum in play.
* **Attacks.** Chase Order (discard one Benched Basic Grass Pokémon for +70), Deck and Cover, Ogre's Whip (damage equal
  to its remaining HP), Tidal Blast, Mega Burst, Mischievous Ring (every Tool of the other side into their deck), and
  attacks that count points, Items in the discard pile, Energy, or cards in hand.
* **Trainers.** Order Pad; Psychic (needs an Active Pokémon with the Psychic attack); Drayden (Draco Meteor chooses once
  more); Skyla; Wally (a Colorless Energy to a Stage 2 Pokémon).
* **Stadiums.** Soothing Shore: at the end of a player's turn, each of their Pokémon with a Water Energy heals 20.
  Rainbow Cave: once a turn a player may discard the Energy in their Energy Zone; the next one comes up (its Use button).
* Matches, replays and saves from before this set still load: nothing about how existing cards play changed.

## Team Rocket's Ambition (B4a)

The twenty-first set, from the second source: 110 printings, 72 new cards, one booster (Team Rocket) on the shiny table.
A "Team Rocket's" Pokémon is its species for art and Combat Types, and evolves only from the "Team Rocket's" card it names.

* **Luxury Coin (Gholdengo).** Once a turn, after one of its player's Trainer cards has flipped coins (an Item or
  Supporter they play, or the Use of a Stadium they played), they are shown the results and may ignore them: the match
  goes back to before the card, and the card is carried out again with new flips. It works as Victory Star does.
* **Team Rocket's Boss.** Its player chooses an opponent and sees their hand; each Basic Pokémon there may be put onto
  that player's Bench, one at a time, until its player says Done or the Bench is full.
* **Team Rocket's Thieving Machine** takes a random Item (not another Thieving Machine) from an opponent's discard pile:
  the card changes owner for the rest of the match.
* **Team Rocket's Goo-zooka.** Until the end of the chosen opponent's next turn, their Active Pokémon (whichever stand
  there) retreat for 1 more.
* **Team Rocket's Researcher** flips until tails and takes a Pokémon with "Team Rocket" in its name for each heads.
  **Team Rocket's Master Plan** Confuses an opposing Active Pokémon; on tails one of its player's too.
* **Arcade (Stadium).** Once a turn a player may flip 3 coins; three heads draws up to 7 cards in hand (its Use button).
* **Soul Counter (Hisuian Basculegion)** counts the points its target's owner got during their own last turn: the game
  now records that for each player.
* **Draconic Slam (Regidrago)** is printed "140−": 140, less 100 when Regidrago has damage on it.
* **Abilities.** Evil Inspiration (in an Active slot, draw a card); Boiler Smog and Thieving Incisors (on evolving from
  the hand); Spy Ops (a random card of an opponent's hand, shown to its player only).
* **Attacks.** Derisive Roasting (+50 for each Special Condition on its target), Heat Charged, Thunderclaw (a damaged
  Benched Pokémon), Scavenge, Hand Kinesis, Punish (+70 into a "Team Rocket" Pokémon), Poison Absorption.
* Matches, replays and saves from before this set still load: nothing about how existing cards play changed.

## Deluxe Pack: Mega (B4b)

The twenty-second set, from the second source: 429 printings, and every one is a printing of a card already in the game.

* **Its pack** has Deluxe Pack ex's shape, on its own published rates: four cards; the third from a table with foil
  versions of the one- to three-diamond cards; the fourth almost always a four-diamond Pokémon ex, now and then a star
  card. One pack in 2,000 is a rare pack, whose fourth card has a table of its own. About 1 pack in 60 holds a fifth
  card, a shiny one.
* **Three slips of the first source put right** (none changes how a card plays), which is what let this set's printings
  be the same cards:
  * 18 cards had a printed Weakness of "Colorless". There is no such Weakness: those cards have none. (The printed
    Weakness is shown on a card and not used in play.)
  * Gholdengo ex's Spending Rush showed 40 as the attack's damage. The card prints none: the 40 is what each random hit
    does, and that is unchanged.
  * Mesagoza, which the second source writes without the Stadium rule's reminder, keeps its full text.

## Dual Fusion (C1)

The twenty-third set, from the second source: 217 printings, 131 new cards, two boosters (Mega Mewtwo X, Pikachu) on the
shiny table. Five Mega Evolution Pokémon ex (Mega Greninja ex, Mega Mewtwo X ex, Mega Tyranitar ex, Mega Skarmory ex,
Mega Dragonite ex). The open dataset has no pull rates for this set yet, so its packs use the usual shiny tables. Three
of its printings are in no pack (the one-star Sweet Honey and the three-star Pikachu ex and Mega Mewtwo X ex): both
sources list no booster for them, only an exchange, so they cannot be pulled here.

* **A Pokémon of two types.** Mega Greninja ex is printed Water and Darkness, Mega Mewtwo X ex Psychic and Fighting. The
  card counts as both types for everything that asks a Pokémon's type. (This is the card's type, apart from the Combat
  Types every Pokémon here has.)
* **Rental cards (Ribombee's Honey Gather).** Once a turn its player gets a Sweet Honey that was in no deck: a new card
  in the match, which goes to the discard pile like any other once played. The second source's page has lost the card's
  name from this text; it is taken from Serebii's page for the card.
* **Soothing Lullaby (Jigglypuff).** This sleep is harder to end: its owner flips 2 coins at each Checkup, and the
  Pokémon wakes only on two heads.
* **Jumping Coach (Raboot).** Rabbit Jumping, an attack shared by five Pokémon of the set, flips 3 more coins for each
  Raboot its player has in play.
* **Sudden Duplication (Frogadier).** Evolving into Frogadier from the hand may put a random Frogadier from the deck
  straight onto the Bench.
* **Metal Scrum (Melmetal).** Its player's Metal Pokémon take 20 less from opposing attacks; two Melmetal still take
  off 20.
* **Attacks.** Honey Rush (50 for each Sweet Honey in hand), Dual Blizzard (60 to two Pokémon of one player, as chosen),
  Spacial Rend (discards another player's Stadium), Psycho Boost (50 less next turn), Wings of the Moone (each Energy to
  a Benched Pokémon of its player's choice), Astonish.
* **Trainers.** Sweet Honey (flip until tails: heal 20 for each heads); Super Potion; Max Repel (switches out a Stage 2
  Pokémon); Full Heal; Eviolite (a Basic Pokémon takes 20 less); Light Ball (+30 from Pikachu ex); Lorelei; Serena's
  Choice (the top 3 cards: one to the hand); Rika; Poké Mart Guy; Rising Star (needs 3 different Pokémon types in play;
  a Pokémon of two types counts as both).
* **Abandoned Station (Stadium).** Once a turn a player may flip a coin; heads draws a card (its Use button).
* Matches, replays and saves from before this set still load: nothing about how existing cards play changed.

## Special Pack: First Partners (SP1) and the promo series (P-A, P-B, P-C)

With these the game holds every card the three sources list: 4,577 printings, set by set the same count as the open
dataset's, and the same sets as the Limitless card pages and Serebii's set list.

* **Special Pack: First Partners**: 30 star printings, the first partner Pokémon of nine regions and three Mew: 24 new
  cards (four of the partners are Dual Fusion's cards, and the three Mew are one card). The Limitless card pages do not
  have this set; its text comes from Serebii's card pages, checked against the open dataset
  (`tools/pocket_fetch_serebii.mjs`). Its pack is one star card.
* **The promo series**: Promo-A (117 printings), Promo-B (103) and Promo-C (13). 67 new cards; the rest are printings of
  set cards. The seven starter Trainers of Promo-A are still what a new player is given.
* **Promo boosters.** In Pocket a promo card comes from an event or a one-card promo pack of a numbered volume. Here each
  series has one booster whose pack is one card, any printing of the series as likely as another. (This is this game's
  own arrangement: the sources do not give promo pack odds.)
* **A disagreement settled.** The promo Jigglypuff has 50 HP in the dataset and on Serebii, 60 on the Limitless page: 50
  is used.
* **Not added.** Serebii has a page for a Shining Revelry "#112 Poké Ball" that its own set list, the dataset and the
  Limitless pages do not have (each lists 111).
* **New effects**: Lunar Plumage (Cresselia ex heals 20 when a Psychic Energy is attached from the Energy Zone),
  Defensive Whirlwind, Luring Glow, Happy Punch, Giant Twister, Chakra Fist, Rocket Frenzy, Shoegaze (5 cards off the top
  of every player's deck), and Genome Converter Y. The three Necrozma forms fight as their own types.
* Matches, replays and saves from before these still load: nothing about how existing cards play changed.

## Pocket's own decks

The decks Pokémon TCG Pocket itself hands out (its theme decks, lent in the app as rental decks) can be picked for a
match, offline or online, under **Pocket's own decks** (they open by set), and loaded into the deck builder.

* **197 decks**, from Genetic Apex to Dual Fusion, with the Deluxe Pack decks, three Elite Decks and the three decks
  tied to no set. Each is the game's 20 cards by set and number, from Bulbapedia's deck pages
  (`tools/pocket_fetch_theme_decks.mjs`, kept in `data/source/theme_decks.json`; `tools/gen_pocket_theme_decks.mjs`
  builds `js/data/theme_decks.js`).
* **Checked.** Serebii's Theme Decks page has the 99 A-series decks: 87 agree card for card. Where a 20-card list
  differs, Bulbapedia's is used (Serebii's Lt. Surge page, for one, links a Frosmoth where the deck has Raichu). Three
  decks Bulbapedia has short or long (Wigglytuff ex, Skarmory ex & Scizor, Suicune ex) use Serebii's 20.
* **Left out, not filled in.** Five decks no source here gives whole: Charizard ex & Moltres ex (Deluxe Pack: ex; 21
  cards listed), Mega Gardevoir ex & Mimikyu ex (Deluxe Pack: Mega; 19), Mega Greninja ex and Mega Mewtwo X ex (Dual
  Fusion; 18 each) and the Mega Lucario ex Elite Deck (18).
* **Energy.** The source names the types a deck is built around. For 166 decks those are its Energy types. For 31 it
  names Colorless or Dragon, which have no Energy, or more than three types: those are dropped and what the deck's own
  cards ask for is added, most wanted first, up to three (this game's reading, kept in the data as `energyFrom`).
* Every deck is legal under this game's deck rules. Matches, replays and saves are unchanged.

## Solo battles, deck missions, and the computer players' decks

* **Solo battles.** Pokémon TCG Pocket's own solo battles, set by set and tier by tier (Beginner, Intermediate,
  Advanced, Expert): **495 battles in 23 sets**, each a 2-player match against the deck Pocket uses there, played by the
  computer player. From Bulbapedia's "List of <set> solo battles" pages (`tools/pocket_fetch_solo.mjs`, kept in
  `data/source/solo_battles.json`). 14 battles whose deck the source has short or long are left out, not filled in.
* Every battle is open from the start (Pocket unlocks them in order; this game does not).
* **Battle tasks** are Pocket's, in its wording, and all 117 different ones are tracked: Knock Outs of an opposing
  Active Pokémon by an attack from a Pokémon of a type (its Card Type), a Stage 1 or 2 put into play, Basics put into
  play, damage with one attack, total damage, points, Poison, winning by a turn or without the opponent scoring, and the
  tasks about your deck (no Pokémon ex, one type, low rarity, Mega ex, a set's cards, no Trainers, no Stadium).
  A task done stays done, whether or not the battle was won, unless its wording begins "Win this battle".
* **Rewards are this game's own** (Pocket pays hourglasses, shinedust and shop tickets, which this game does not have):
  a pack for a battle's first clear and a pack once all of its tasks are done, each paid once, on top of a match's usual
  packs.
* **Deck missions.** Each of Pocket's decks has the two missions it has in Pocket: own its highlight card (186 of the
  197 decks have one named), and own all 20 of its cards, counted by name. Here each earns a pack, once, and a deck you
  own whole can be added to your decks. Pocket's decks stay free to play without owning them.
* Solo and mission progress is kept on this device (it is not on the account yet).
* **Computer players' decks.** Offline and online, a computer player's deck is now any ready-made deck or any of
  Pocket's 197.
* The engine's log entries carry a few more plain fields (who attacked, where a Pokémon fell, how much damage) so tasks
  can be read back from a match. No rule changed: matches, replays and saves play as before.

## The computer player, an audit by play, and the deck builder

* **The computer player** now plays cards it used to leave in its hand: X Speed and Leaf (when a hurt Active Pokémon is
  short of its Retreat Cost by no more than the card gives), Skyla and Rising Star, Koga and Budding Expeditioner, Ilima
  and Parasol Lady, and Team Rocket's Goo-zooka. It no longer offers plays the engine always refused (a Basic to a full
  Bench, a second Supporter): over all of Pocket's decks, refused plays fell by about 97%.
* **Measured, not assumed.** New against old over 788 matches (every one of Pocket's decks from both seats): 394 wins
  each. The new player wastes far fewer plays; it is not stronger at winning. Three changes to how it spends Energy, one
  to which Pokémon it opens with and one to when it retreats were tried the same way and were no better (one was
  clearly worse), so they were not kept.
* **Audit by play** (`tools/pocket_audit_attacks.mjs`, run by the gate as `pocketenhanced_audit_test.mjs`): every
  different attack of every Pokémon card (2,333) is used on a plain table, three seeds each. The engine never fails, no
  card is gained or lost, an attack with no effect does its printed damage, and every number in a card's rules text
  (attacks, Abilities, Trainers) is in its structured effect. Four attacks need a table of their own and are listed by
  name. The audit found nothing to correct.
* **Deck builder**: search cards by name, list one set's cards, and pass a deck on as a short code (`PE1:Fire:A1-037x2,…`:
  Copy deck code, Paste deck code). Pocket's decks can be searched by a deck's or a card's name.

## Every deck found, and a computer player that looks ahead

* **Pocket's own decks: all 202.** The five that were missing are in. Two were never missing from the source: Bulbapedia
  writes a card of two types (Mega Mewtwo X ex, Mega Greninja ex) as a plain table row, which the reader skipped. Three
  are settled by a third source, PokéWiki's "Leihdecks" pages (German; every set's rental decks by set code and number):
  Charizard ex & Moltres ex, Mega Gardevoir ex & Mimikyu ex and the Mega Lucario ex Elite Deck.
* **Checked three ways.** PokéWiki has 199 of the decks and names the same 20 cards for 176; Serebii has the 99 A-series
  decks and agrees on 87. One deck changes because two sources agree against the third: the Arceus ex & Heatran Deck has
  a Potion where Bulbapedia has an X Speed. Where only one other source differs and each list is 20 cards, Bulbapedia's
  stays.
* **Solo battles: 509 of 509.** Serebii's solo battle pages (one for each set and tier) fill ten decks Bulbapedia has
  short or long, and name the same 20 cards for 431 of the 461 battles both list. One list is corrected by a
  third source: the Golem & Brock Deck (Mythical Island, Advanced) is 21 cards on Bulbapedia (Brock twice) and 22 on
  Serebii; Game8's list is Bulbapedia's with Brock once, which makes the 20 a deck must be. The correction is stated in
  the generator (`CORRECT`), and the kept source is left as fetched.
* **The computer player looks ahead** (`js/ai_search.js`). For the two decisions that decide matches (where the turn's
  Energy goes, and which attacks are queued at which targets) it tries up to ten candidates on four copies of the match
  each, plays those copies on by its rules of thumb for every seat until its own next turn has been played, and keeps the
  candidate that ends best (points first, then what is left on the table).
* **It does not cheat.** A copy (`fork` in the engine) deals again everything that seat cannot see (the other players'
  hands, every deck's order) and flips its own coins. The match itself is never touched.
* **Measured:** against the rule-of-thumb player over 404 matches (decks from both seats) it wins 68% (±4.5). A play
  takes about 6 ms on average here; on a slow device candidates not yet tried after 0.4 s are left untried.
* **Where it plays:** offline matches, and a solo battle's Advanced and Expert tiers. Beginner and Intermediate solo
  battles keep the rule-of-thumb player, so the tiers differ in more than their decks. Online matches' computer players
  are unchanged for now (the server has a strict time allowance for each request).
* Six smaller ideas (both attackers planning one Knock Out together, removing the Pokémon that threatens a Knock Out,
  stepping back from one, moving up a Pokémon that can attack, not feeding Energy to a Pokémon about to fall) were each
  measured the same way first: none moved the result beyond chance, and none is in.

## Singles or Doubles, and the mat

* **A battle is Singles or Doubles**, chosen where it starts (New match, a solo battle, an online lobby by its host); the
  choice is remembered. Until one is made a battle is Doubles, as every battle was before.
* **Singles** is Pokémon TCG Pocket's own table: **one Active Pokémon and a Bench of three** for each player. Execute
  commands the one Active Pokémon. Everything else is as in Doubles: 3 points to win, the same cards in this game's
  adapted wording (a card that speaks of "one of your Pokémon in an Active slot" has one to speak of).
* **Singles has a turn limit**, because one Active Pokémon each can reach a table where neither can attack: after turn
  30 the match is a draw (Pocket's versus limit); a solo battle in Singles has 50 (the limit Pocket's solo battles
  state). Doubles has none, as before.
* **Doubles** is this game's table, unchanged: two Active Pokémon, a Bench of four, both attack each turn.
* It is an option of the match (`config.opts.singles`), not a rules revision: nothing about a Doubles match, its
  replays or saves changes. The computer players, the look-ahead, replays, resuming and spectating all follow the mode.
* **The mat** is drawn in Pocket's manner: a pale mat with a ring and a band across its middle, each slot an outline,
  the hand held as a fan, the Energy Zone an orb, the decks beside the Active Pokémon (Singles on a phone), and the
  table's prompt as a speech bubble ("Please put a Basic Pokémon in your Active slot.", "You are going first"). It is
  this game's own drawing; none of Pocket's artwork is used (the card back is this game's).

## The pictures on Trainer cards

* Every Trainer card has a picture, from one of three places: the site's own walking sprite of that person, the site's
  own item icon, or **this game's own drawing** (`js/art_drawn.js`): an icon for an Item, Tool or Fossil, a small
  landscape for a Stadium, a pixel figure for a Supporter the site has no sprite of. A test keeps it so: a new Trainer
  card with no picture fails it.
* The drawings are made in code for this game. None of Pokémon TCG Pocket's card artwork is used. A person's figure is
  a likeness in a few colours (hair, clothes), not a copy of any illustration. A folder of your own pictures
  (`js/artconfig.js`) still covers any of them.

## Progress on the account, the mat's animations, the turn limit shown

* **Solo progress is kept on the account** of a signed-in player (battles cleared, tasks done, rewards paid, missions
  claimed), as the collection and the saved decks are: row `pksolo:<user>`, the same sync (`js/colsync.js`). Progress only
  grows, so two copies are joined, never chosen between: a new phone gets everything, and an old copy takes nothing
  away. A guest's progress stays on the device and is added to the account on signing in. One known limit: a reward
  for the same battle claimed on two devices before either has synced is paid on both.
* **The mat shows what just happened, once**: a banner for whose turn it is, the attacker lunging, a KO burst where a
  Pokémon was Knocked Out, a flash on an evolution, a glow where Energy arrived. They read the log's own public fields
  (an attack's slot, a Knock Out's place), are not replayed on a redraw, and are off when playing fast, in a replay, and
  for a player who asks for reduced motion.
* **A match with a turn limit says where it stands**: "Turn 7 of 30" beside the commands, and the turn banner counts
  down the last five turns. The limits are Pocket's as guides report them: 30 turns in a versus battle (then a draw),
  50 in a solo battle.
* **The setup prompt covers no card**: on a wide screen it sits on the player's own name bar, on a phone over their own
  empty Active slot, and it goes once an Active Pokémon is chosen.
* **Supporter figures** carry what tells one from another (hair clips, a scarf, a bag, glasses pushed up, a beard), and
  Copycat, Juggler, Sightseer and Budding Expeditioner have figures of their own.
* **Online computer players look ahead too** (owner, 2026-11-17: the site is on Cloudflare's paid plan). The server's
  computer seats use the same look-ahead player as a match on the device (`js/ai_search.js`), about 22 ms of processor
  time a turn. One request lets at most 24 of its decisions look ahead (`BOT_LOOKS`); any beyond that are made by rule
  of thumb. The move made for a person who ran out of time is unchanged.

## A guided first match, Easy or Hard, Wonder Pick

* **Learn to play** (the menu's first button until it has been used, "Guided match" after): a doubles match against one
  Easy computer player with the Charizard deck, and a guide beside the commands that says what to do next. The guide
  reads the table as it stands (setting up, the Energy Zone, choosing attacks, Execute); nothing is scripted, and the
  match is a real one (`config.tutorial`).
* **Computer players are Easy or Hard**, chosen where a match with them starts (New match; an online lobby with
  computer seats, by its host). Hard looks ahead (`js/ai_search.js`) and is what a match has unless Easy is chosen;
  Easy plays by rule of thumb alone (`config.bots: 'easy'`, a lobby's `easy`). Solo battles keep their own tiers.
* **Wonder Pick** (from Open packs): four packs a day, the same for everyone (rolled from the date, so reloading
  changes nothing), each shown face up. One pack buys one of a pack's five cards: they are turned over and shuffled,
  the player presses one, and the card they get is decided then by chance, one in five each. It gives no pack points.
  Each of the day's packs can be picked from once on a device. This is this game's version: Pocket's own draws on
  packs other players opened and costs Wonder Stamina.
* **A reward claimed on two devices** before either had synced is no longer kept twice: the device that syncs second
  is told and gives its packs back (as many as it still has unopened).
* **"Going first" covers no card**: in singles it sits between the two Benches on a wide screen, and beside the
  opponent's Active Pokémon on a phone.
* **Sounds** for what the mat shows: an attack, a Knock Out, an evolution, Energy arriving, a new turn (one sound for
  each kind, from the sounds the site already has).
* Shining Revelry is whole: it has 111 cards and its last, A2b-111, is the Poké Ball one source numbers 112.

## Free packs with time, tasks on the table, quick messages

* **Free packs arrive with time**, as Battlecards' pack inbox does (`js/packtimer.js`, the same numbers): one every 12
  hours into an inbox that holds 120; while it is full the timer is paused, and collecting it starts the timer again.
  The inbox is at the top of Open packs, with a Collect button and the wait to the next pack. A signed-in player's is
  on the account (`pkinbox:<user>`; a claim names itself, so one asked twice is paid once). A guest's is on the device,
  by the device's clock.
* **A solo battle's tasks are beside the commands while it is played**: done so far, done in an earlier try, and those
  that can only be settled at the end.
* **Quick messages in an online match** (the Say button): eight listed phrases, sent by number, never text of a
  player's own; one every 2.5 seconds. They are shown for a few seconds to everyone at the table.
* **Today's Wonder Picks are kept with the collection**, so they follow the account: a pack picked from on one device is
  done for the day on every device.
* **The Energy signs are redrawn** in the card game's manner (a white sign on its type's orb). They are this game's own
  drawings, not the game's image files.
* **A stalled online match is reported**: four server calls in a row with no answer, while the device is online, are
  said once to the site's error log (where a server that ran out of time would show).
* Loading was measured, not changed: 0.59 MB compressed in all (the card data is 2.1 MB raw, 140 KB compressed), ready
  in about 2 seconds on a mid phone on 4G and about 5 on a slow phone, first visit, nothing cached.
* Card trading is built and tested on the server (`server/pocket_trade.mjs`, `js/trade.js`) but not offered yet: it
  becomes the Pocket side of one trading system for the whole site.
