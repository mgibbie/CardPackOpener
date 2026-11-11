// The owner's new Pokermon jokers (2026-10-27): the 25 species of Desktop/Pokermon_Joker_Design_Guide.txt section 5, "25 DESIGN
// RECOMMENDATIONS" — species no mod (Pokermon / Nacho / Pokermon+) had a joker for (the design wiki's "not in the game yet" list).
// They are Micatro's own designs, not upstream Pokermon code: there is no Lua file behind this one, so every joker is defined in
// FULL here (static data + behaviour, like Repel / Jirachi's forms) and index.js registers it after the joker named by `poke_after`
// (Pokédex order). Text: DESIGN_LOC (merged into Pokermon's Joker descriptions); families: DESIGN_FAMILIES.
// Art: upstream's own. Pokermon 3.9.1's pokespriteload.lua already has a finished card for all 25 species (no joker uses them
// upstream) on the vendored 3.9.1 sheets, with Shiny twins and the Legendaries' floating souls — so, by the owner's art rule
// (a composed card only where upstream has none), each joker takes its 3.9.1 cell (`poke_sprite391`, read like data391.js
// sprites). PORTING.md "The owner's 25 new jokers".
//
// Lines: Shinx -> Luxio -> Luxray (Foresight money), Honedge -> Doublade -> Aegislash (held Steel; Stance Change), Spheal ->
// Sealeo -> Walrein (Rollout), Grookey -> Thwackey -> Rillaboom (the beat; Grass starter), Kubfu -> Urshifu (Single / Rapid Strike,
// chosen by its training), Tandemaus -> Maushold (Population Bomb), Darumaka -> Darmanitan (Hustle / Zen Mode), Scraggy -> Scrafty
// (Moxie), Mudbray -> Mudsdale (Stamina / Mud Spit); and Xerneas, Spiritomb, Tatsugiri on their own.
// Then the owner's wiki designs (CLAUDE.md "do the joker design list"): Sprigatito -> Floragato -> Meowscarada (Lucky cards grow like
// Hiker's: +Mult / +$, then X Mult; evolves by Lucky triggers, a Negative The Magician on each evolution; Grass starter; contentRev 20,
// reworked in 23) — upstream 3.9.1 draws them too (Natdex 10 / 12 / 14, 60);
// Whismur -> Loudred -> Exploud (each broken Glass card grows its Chips, then Mult, then X Mult, every form keeping the last's; a
// Negative Justice on each evolution; Colorless; contentRev 21) — upstream 3.9.1 draws them too (Natdex 14 / 16 / 18, 19).
// Gulpin -> Swalot (Stockpile: each end of round swallows a held Hazard, else a held Diamond; +Mult on scored Diamonds; Swalot's $ by
// rank and X Mult per card the deck has lost; Dark; contentRev 24) — upstream 3.9.1 draws them too (Natdex 0 / 2, 21).
// Trapinch -> Vibrava -> Flygon (Sand Pit: each card you discard banks +2 / +3 Chips on the joker, evolving after 40 then 60 more;
// Vibrava +1 discard; Flygon keeps the bank and gives X1 + 0.25 per discard used this round; Earth; contentRev 25) — upstream 3.9.1
// draws them too (Natdex 24 / 26 / 28, 21).
// Spoink -> Grumpig (Pearl: each end of round a held unsealed card gains a Pink Seal; Spoink X0.1 per Pink Seal trigger, evolving after 8;
// Grumpig makes Pink Seals trigger every hand, X0.15 per hand one triggers in, X0.3 on an overflow; Psychic; contentRev 26) — upstream
// 3.9.1 draws them too (Natdex 18 / 20, 21).
// Castform (Forecast: on the round's first deal, the suit held most picks Sunny / Rainy / Snowy, a tie Normal, its type following
// the weather for the round; Colorless; contentRev 27) — upstream 3.9.1 draws it (Natdex 10, 23) and its three weather forms
// (Gen 3 sheet 0 / 2 / 4, 0).
// Barboach -> Whiscash (Muddy Water: +12 / +20 Chips per Water or Earth Joker, itself included, a dual-type one once; Whiscash's
// Earthquake: with 2+ OTHER Water / Earth Jokers the round's first hand retriggers every scored card; Water; contentRev 28) — upstream
// 3.9.1 draws them too (Natdex 16 / 18, 22).
// Lunatone + Solrock, a pair like Plusle / Minun (day / night: each round's 1st, 3rd, 5th hands are day, 2nd and 4th night; Solrock
// +100 Chips on day hands, Lunatone X2 on night hands; Cosmic Power: with the other one, each covers the other half at half strength,
// +50 Chips / X1.5; Earth, Uncommon $6; contentRev 29) — upstream 3.9.1 draws them (Natdex 12 / 14, 22).
// The Regi trio: Regirock (Stone Body: Stone +100 Chips instead of +50, +10 permanent per score; Earth), Regice (Ice Body: Glass never
// shatters; Water), Registeel (Iron Body: held Steel X2 instead of X1.5; Metal), Legendary $20 each; each converts 1 + (other Regi species
// held) random deck cards to its enhancement when a Blind is selected; contentRev 31 — upstream 3.9.1 draws them with their souls
// (Natdex 2 / 4 / 6, 25).
// The Eon duo and the weather trio (contentRev 33), Legendary $20 each: Latias / Latios (Psychic: X0.15 per Tarot / per Planet used; Soul
// Dew, both held: either grows both), Kyogre (Water: +1 hand, scored Clubs retrigger and give X1.25), Groudon (Earth: +1 discard, scored
// Hearts / Diamonds X1.25), Rayquaza (Dragon: +1 hand / +1 discard; Dragon Ascent X0.2 per Straight / Flush) — plain since contentRev 111
// (before it: Castform Rainy / Sunny, the Primal Clash and Rayquaza's calm; SIMPLE_TRIO_REV) — upstream 3.9.1 draws them with
// their souls (Natdex 8-17, 25).
// Chatot (Vocabulary: +4 Mult for each different poker hand played this run; New Word: a hand's first play this run, while held,
// creates its Planet; Colorless) and Pachirisu (Quick Spark: X2 on each round's first hand, Nuzzle +X0.25 per other Lightning Joker;
// Cheek Pouch: $1 per Lightning Joker at end of round; Lightning), Rare $7 each — upstream 3.9.1 draws them (Natdex 10,29 / 22,27).
// Burmy -> Wormadam (Female) / Mothim (Male) (contentRev 37; 41 the three piles): Burmy's Cloak follows the full deck's biggest pile at each end of
// round (Stone Sandy / Earth +40 Chips, Steel Trash / Metal $1, every other card Plant / Grass +5 Mult; a tie keeps it), its type and card with
// it; its gender is rolled once when created; Wormadam keeps the cloak for good (unenhanced +3 Mult / Stone X1.5 / held Steel $1), Mothim
// X(1 + 0.25 per different enhancement in the deck) — upstream 3.9.1 draws all six cloak cards (Gen 4 sheet 0-10, 0) and Mothim (Natdex 16, 27).
// Combee -> Vespiquen (Honey Gather: at end of round the Jokers directly left and right gain +$1 / +$2 sell value; Vespiquen's Attack
// Order X(1 + 0.1 per $ of those two Jokers' sell value), max X3; Grass, Common $5 / Safari $8; contentRev 38) — upstream 3.9.1 draws
// them (Natdex 18 / 20, 27).
// The owner's Cherubi line (contentRev 39): Cherubi -> Cherrim (Grass; Sweet Seeds: a random unenhanced deck card becomes a Seed each
// Blind, +1 growth level; Cherubi evolves after 2 blooms; Cherrim's Flower Gift (3+ suits) and Sunshine Form (Flowers X2.5 instead of X2
// while sunny: a red first deal by Castform's forecast, or Groudon working)) — upstream 3.9.1 draws them (Natdex 28, 27; Gen 4 0 / 2, 1).
// Shellos -> Gastrodon (contentRev 40): a sea, West or East, rolled once per card; Tide Pool +40 Chips on the leftmost (West) / rightmost
// (East) scored card; Gastrodon's Tide retriggers it, Storm Drain X0.1 per Energy card used (X0.2 Water); Two Seas: both seas held, every one
// works on both ends; Water — upstream 3.9.1 draws both seas (Gen 4 sheet: East {4,1} / {8,1}, West {6,1} / {10,1}).
// Stunky -> Skuntank (contentRev 42): Poison Gas poisons the BLIND — after each hand you play (after its scoring and the win check, so it
// only helps later hands) the Blind's score requirement drops by 4% of its starting requirement (Skuntank's Toxic: n x 4% after the nth
// hand of the round); one shared record per Blind, at most -75% in all, never below 1 chip; reach the lowered requirement and the Blind
// is won right then; Dark — upstream 3.9.1 draws them (Natdex 26 / 28, 28).
// Gible -> Gabite -> Garchomp (contentRev 43): bite -> hoard -> cash in. Bite banks +1 Mult per scored card of a hand containing a Pair
// (evolves at +25); Gabite's Treasure Nest turns one scored card of a Full House Gold (evolves with 6 Gold cards in the full deck);
// Garchomp's Dragon Rush X(1 + 0.5 per Gold card held in hand) on top of the bank; Dragon — upstream 3.9.1 draws them (Natdex 14 / 16 /
// 18, 29).
// The last Gen 4 regulars (contentRev 44): Hippopotas -> Hippowdon (Sand Stream: scored Stone cards +30 / +60 extra Chips; Hippowdon turns
// 1 unenhanced card in hand Stone on each round's first deal), Skorupi -> Drapion (Sniper: scored cards 1 in 5 X1.25 / 1 in 3 X1.5 crits;
// Lucky cards always crit for Drapion), Carnivine (Flytrap: the round's first discarded card is devoured, +4 Mult banked), Finneon ->
// Lumineon (night hands: +40 Chips / +15 a scored card; Lumineon by day too with Lunatone) — upstream 3.9.1 draws them (Natdex 26-28, 29;
// 0-12, 30).
// The creation trio, Regigigas and Arceus (contentRev 45), Legendary $20 each: Dialga (Metal; Roar of Time: the round's first hand is scored
// twice, every scored card retriggering), Palkia (Water; Spacial Rend: +1 Joker slot, +1 hand size), Giratina (Psychic; Shadow Force: X0.25
// per destroyed playing card, X0.5 in its Origin Forme with Dialga / Palkia), Regigigas (Colorless; Slow Start: X4 once its 5-round wait,
// cut by each Regi, is over; awake with the trio, +1 Regi conversion each) and Arceus (Colorless; Multitype: every type for type checks,
// X0.25 per different type among your Jokers) — upstream 3.9.1 draws them with their souls (Gen 4 sheet; Regigigas Natdex 10, 32).
// The Lake trio, Cresselia, Manaphy and Phione (contentRev 46), Legendary $20 each: Uxie (+2 Foresight, X1.3 per Foreseen card), Mesprit (X1.5,
// X2.5 on a poker hand not yet played this round), Azelf (X2.5 on the final hand), each +X0.25 per other guardian held (Lake Guardians); Psychic.
// Cresselia (Lunar Blessing: playing cards can't be debuffed; X1.5; Psychic). Phione (+6 Mult per Water Joker) and Manaphy (X1.2 per Water
// Joker; Egg: 1 in 4 at the end of each shop, with a free slot, to create a Phione); Water — upstream 3.9.1 draws them with their souls
// (Natdex {28,31}, {0,32}, {2,32}, {14,32}, {16,32}, {18,32}).
// Gen 5, batch 4: the Gen 5 Legendaries (contentRev 55; the owner's "Build as pitched", 2026-10-29), Legendary $20 each: the Swords of
// Justice, Cobalion (Metal) / Terrakion (Earth) / Virizion (Grass) / Keldeo (Fighting): each scored Spade / Diamond / Club / Heart X1.25,
// +X0.1 per other sword held; Keldeo's Resolute Form (all three held, its own card) X2 a Heart instead. The Forces of Nature, formes live
// with the card: Tornadus (Colorless; +1 hand, Therian +3 Mult per hand left), Thundurus (Lightning; scored cards 1 in 4 $1, Therian 1 in
// 2 and X1.1), both Therian with Landorus; Landorus (Earth; held Stone +40 Chips, Therian scored Stone X1.5) Therian with both. The Tao
// trio: Reshiram (Fire) / Zekrom (Lightning) X1.25 per Fire / Lightning Joker, +0.25 together (Truth vs Ideals); Kyurem (Water; X1.5;
// White / Black Kyurem with Reshiram / Zekrom, the leftmost: the partner's boost a second time). Meloetta (Relic Song: Aria, Psychic, X2;
// Pirouette, Fighting, the first scored card retriggers 3 times; switching after every hand, Aria each round) and Genesect (Grass; X(1.5
// + 0.5 per Water, Lightning or Fire Joker)) — upstream 3.9.1 draws them all with their souls and form cells (Natdex {14..18,42}, Gen 5
// sheet {6,3}-{9,6}).
// Gen 6, batch 3: the Gen 6 Legendaries (contentRev 63; the owner's "Yes", 2026-11-02), Legendary $20 each, each complete alone: Yveltal
// (Dark; Oblivion Wing: each end of round destroys a random held card, +X0.25 banked), Zygarde (Dragon; Cells per scored card: 10% Forme
// X1.5, 50% at 50 Cells X2.5, Complete at 100 X4 and +1 hand size), Diancie (Fairy; Diamond Storm: scored Diamonds $1 and X1.2, a deck card
// becomes a Diamond each Blind), Hoopa (Psychic; Hyperspace Hole: a Tarot or Planet at the end of each shop, Unbound after 15 consumables
// used: a Spectral instead) and Volcanion (Fire; +1 discard; X2 + X0.25 per discard used this round) — upstream 3.9.1 draws them all with
// their souls and form cells (Natdex {22,47} / {26,47} / {0,48}; Gen 6 sheet {2,11}-{11,11}).
// Gen 7, batch 3: the Ultra Beasts (contentRev 66; the owner's "Yes", 2026-11-02), Rare $7 (Poipole C $5 -> Naganadel S $8), all with the
// `ultra_beast` attribute and (but Nihilego) Beast Boost (each Boss Blind beaten: +10% of the main number's unenergized base): Nihilego (Dark;
// copies the Joker to its left), Buzzwole (Fighting; X3, -1 hand size), Pheromosa (Grass; X3 on 2 hands, then debuffed for the round),
// Xurkitree (Lightning; held cards +4 Mult), Celesteela (Metal; +$1 sell value a round, X0.05 per $1), Kartana (Grass; a lone scoring card
// retriggers 3 times, X2 each), Guzzlord (Dragon; eats the leftmost consumable each Blind, +X0.2 banked), Poipole -> Naganadel (Dark ->
// Dragon; +2 Mult / X1.5 + X0.25 per Dragon Joker), Stakataka (Earth; held Stone cards X1.25), Blacephalon (Psychic; X3, $2 a hand) —
// upstream 3.9.1 draws them all with their souls (Natdex {24,52}-{21,53}).
// Gen 7, batch 4: the Gen 7 Legendaries (contentRev 67; the owner's "Yes build it", 2026-11-02), each complete alone: Type: Null ($10;
// banks X0.1 a round) -> Silvally (RKS System: X2 + X0.25 per other Joker of its type; any Energy used sets its type; Memory art per type),
// the Tapus (Koko every scored card X1.1; Lele a Planet per Tarot used; Bulu +2 hand size and X1.5; Fini +1 hand and $2 per unused hand),
// Cosmog ($10; +1 Mult a round) -> Cosmoem ($10; X0.25 a round, counts red vs black) -> Solgaleo (scored Hearts / Diamonds X1.25) or
// Lunala (Spades / Clubs X1.25), Necrozma (X0.1 per Planet used; Ultra Necrozma at X3: Dragon, +1 hand size), Magearna (scored Steel X1.5),
// Marshadow (X2, X4 during a Boss Blind) and Zeraora (scored face cards $1 and X1.25) — upstream 3.9.1 draws them all with their souls and
// form cells (Natdex {12,51}, {8..23,52}, {10,53}, {22,53}; Gen 7 sheet {6,1}-{4,3}, {6,4}, {0,5}, {2,5}, {4,5}).
// The Gen 8 starters (contentRev 49; the starters spec): Scorbunny -> Raboot -> Cinderace (Fire, +1 discard; +3 / +5 Mult per discard left,
// then Libero X(1 + 0.5 per discard left)) and Sobble -> Drizzile -> Inteleon (Water, +1 hand; +20 / +35 Chips per played card that doesn't
// score, then Snipe Shot X2 on the highest-ranked scored card) — upstream 3.9.1 draws them (Natdex 4-14, 54).
// The Gen 5 starters (contentRev 50), Pokermon's starter rules (the type's perk at every stage, Basic Uncommon $5 starter, Safari $8 / $10,
// 5 rounds then 5): Snivy -> Servine -> Serperior (Grass; Contrary: each debuffed card held gives +4 / +8 Mult; Serperior's debuffed scored
// cards score as if not, X1.25 each), Tepig -> Pignite -> Emboar (Fire; Flame Charge: +4 / +6 Mult, then X0.25, per hand in a row of the
// same poker hand this round), Oshawott -> Dewott -> Samurott (Water; Razor Shell: the first 1 / 2 / 3 scored cards retrigger; Samurott's
// scored Aces X1.5) — upstream 3.9.1 draws them (Natdex {28,32}, {0..14,33}).
// The owner's Gen 9 starters (contentRev 51): Fuecoco -> Crocalor -> Skeledirge (Fire starter, +1 discard; Torch Song: +1 / +2 Mult
// banked per hand played, then X0.05) and Quaxly -> Quaxwell -> Quaquaval (Water starter, +1 hand; Moxie: +4 / +6 Chips banked per unused
// hand when a Blind is beaten, then X0.2) — upstream 3.9.1 draws them (Natdex 16 / 18 / 20 / 22 / 24 / 26, 60).
// The Gen 6 starters (contentRev 52): Chespin -> Quilladin -> Chesnaught (Grass: +1 hand size; +40 / +80 / +150 Chips; Chesnaught's Spiky
// Shield X1.5 while 2+ hands are left), Fennekin -> Braixen -> Delphox (Fire: +1 discard, +1 Foresight; Braixen's first Foreseen-rank
// discard each round creates a Tarot; Delphox's Mystical Fire X0.2 per Tarot used), Froakie -> Frogadier -> Greninja (Water: +1 hand;
// +30 / +50 Chips per Water Joker; Greninja's Protean takes the most common type among your other Jokers each Blind, X(1.5 + 0.5 per
// other Joker of its type)) — upstream 3.9.1 draws them (Natdex 8-24, 43).
// Gen 5, batch 1 (contentRev 53; the owner's "Build it"): Patrat -> Watchog (Lookout: +1 / +2 Foresight, each Foreseen card +6 / +10 Mult),
// Lillipup -> Herdier -> Stoutland (Pickup: 1 in 4 / 3 / 2 at end of round a Tarot (or Planet), with room; Stoutland +3 Mult per consumable),
// Purrloin -> Liepard (Pickpocket: $2 / $4, the Joker to its right loses $1 of sell value), Pidove -> Tranquill -> Unfezant (Super Luck: Lucky
// odds +1; +5 Mult / X1.5 on a triggering Lucky card), Blitzle -> Zebstrika (Motor Drive: +4 Mult per hand before a discard / X1.5 with none),
// Woobat -> Swoobat (Heart Stamp: $1 / $1 and X1.1 per scored Heart), Timburr -> Gurdurr -> Conkeldurr (Stone cards +4 / +8 Mult / +8 and
// X1.5), Tympole -> Palpitoad -> Seismitoad (Swift Swim: +30 / +50 / +50 Chips doubled while raining; Seismitoad retriggers Clubs in rain),
// Throh and Sawk (the lowest X2 / the highest +30; Dojo Rivals X2.5 / +45) — upstream 3.9.1 draws them (Natdex 16-28, 33 / 16-24, 34 /
// 2-26, 35; Unfezant Gen05 {0,0}).
// Gen 5, batch 2 (contentRev 54; the owner's "Yes", 2026-10-28), 26 jokers #540-573: Sewaddle -> Swadloon -> Leavanny (Grass; the tailor: a
// random unenhanced deck card each Blind becomes Bonus / Bonus-or-Mult / Bonus-Mult-or-Lucky; Leavanny's scored enhanced cards +3 Mult),
// Venipede -> Whirlipede -> Scolipede (Dark; Poison Point: each discarded card permanently -2 / -3 Chips, floored at 0, and +3 / +5 Mult;
// Scolipede's unenhanced ones become Mult cards), Cottonee -> Whimsicott (Grass; +1 hand size and the round's first deal +1 card; +2 hand
// size), Petilil -> Lilligant (Grass; scored Flower cards $1 / $2; Flowers need 3+ suits), Basculin (Water; a Red or Blue stripe rolled
// once: +20 Chips per scored red / black suit card), Sandile -> Krokorok -> Krookodile (Dark; Moxie: +2 / +4 Mult, then X0.15, banked per
// Blind beaten), Maractus (Grass; +8 Mult per Hazard held), Dwebble -> Crustle (Earth; +5 / +10 Chips per Stone card in the deck), Sigilyph
// (Psychic; +2 Foresight, Pair Planets level twice), Yamask -> Cofagrigus (Psychic; X0.1 / X0.2 per Joker sold, the first 1 / 2 a round
// since contentRev 58; Mummy: the Ante's first Joker sold stays, Negative), Tirtouga -> Carracosta (Water; Ancient 9s), Archen -> Archeops (Earth; Ancient 10s, Defeatist) and Minccino ->
// Cinccino (Colorless; each discard draws 1 extra; Skill Link) — upstream 3.9.1 draws them all (Natdex {28,35}-{4,38}, Basculin Gen 5 {4,0}
// / {6,0}).
// Gen 5, batch 3 (contentRev 55; the owner's "Build batch 3", 2026-10-29), 30 jokers #580-637: Ducklett -> Swanna (Water; +40 Chips / X2 with
// a Flush), Deerling -> Sawsbuck (Grass; Seasons by Ante, Spring Hearts / Summer Diamonds / Autumn Clubs / Winter Spades: +3 Mult / X1.2 per
// scored card of the suit; a 3.9.1 card per season), Emolga (Lightning; scored faces $1 and +2 Mult), Karrablast + Shelmet (Grass; +6 Mult /
// +40 Chips; they evolve only together, 4 rounds held together: Escavalier X1.5 and held Steel X1.75, Accelgor +1 hand, +1 discard, +4 Mult
// per hand left), Foongus -> Amoonguss (Grass; a Poke Ball at the end of the shop, 1 in 4; Spore: the Boss Blind is off during the round's
// first hand, Blind.suspend), Alomomola (Water; the round's first destroyed card is copied back), Joltik -> Galvantula (Lightning; +3 Mult
// per other Lightning Joker; held Gold X1.2), Tynamo -> Eelektrik -> Eelektross (Lightning; Steel in the deck / held), Cubchoo -> Beartic
// (Water; scored Glass +20 Chips; Freeze: the leftmost held card stays in hand into the next round, X1.5 held), Stunfisk (Lightning; $1 a
// discard, $4 a round), Mienfoo -> Mienshao (Fighting; the top 1 / 2 ranked cards retrigger), Druddigon (Dragon; Kings X1.4), Bouffalant
// (Colorless; X0.5 per first-hand win, max X4), Rufflet -> Braviary (Colorless; +10 Mult / X2 on Boss Blinds), Heatmor (Fire) + Durant
// (Metal) (+4 Mult per discard used; held Steel X1.75; together Heatmor banks X0.1 a round), Larvesta -> Volcarona (Fire; +5 Mult doubled in
// the sun; always sunny, each Fire Joker X1.25) — upstream 3.9.1 draws them all (Natdex {18,38}-{12,42}; Deerling / Sawsbuck Gen 5 {2,1}-{4,2}).
// Gen 6, batch 2 (contentRev 62; the owner's "Yes", 2026-11-02), 22 jokers #682-715: Spritzee -> Aromatisse (Fairy; scored Lucky cards $1 / $2;
// Aroma Veil: Lucky odds +1, Pidove's Super Luck), Swirlix -> Slurpuff (Fairy; +1 / +2 Mult banked per Tarot used; +1 consumable slot), Inkay ->
// Malamar (Dark; scored 2-5 +4 Mult; Topsy-Turvy: every card scores its FLIPPED rank's Chips, the chip_bonus hook; r73 scored 2-5 X1.25), Binacle -> Barbaracle
// (Earth; scored 7s +20 Chips / and X1.3), Skrelp -> Dragalge (Dark; a deck card becomes a Hazard each Blind; +3 Mult per Hazard in the deck /
// held Hazards X1.2), Tyrunt -> Tyrantrum (Dragon; Ancient Kings) and Amaura -> Aurorus (Earth; Ancient Queens, the 2+ tier turns a Queen
// Glass), Hawlucha (Fighting; the first and last scored cards retrigger), Klefki (Metal; X0.25 per Voucher redeemed), Phantump -> Trevenant
// (Grass; +3 / +5 Mult banked per destroyed card; Seeds), Bergmite -> Avalugg (Water; +50 / +150 Chips, X1.5 on the final hand), Noibat ->
// Noivern (Dragon; Glass breaks 1 in 2; +2 Mult / X0.1 banked per break; a deck card turns Glass per break) — upstream 3.9.1 draws them all
// (Natdex {12,45}-{18,47}).
// Gen 7, batch 2 (contentRev 65; the owner's "Yes build it", 2026-11-02), 13 jokers #757-784: Salandit -> Salazzle (Fire; +1 discard; scored
// Queens +5 Mult / X1.5; the gender rolled when obtained, only a ♀ evolves), Stufful -> Bewear (Fighting; +40 Chips +4 Mult / X2.5 and Strong
// Hug: 1 in 4 at end of round to destroy the Joker to its right), Comfey (Fairy; Floral Gift: 1 in 3 at end of round, +1 Energy to another
// Pokémon Joker under its cap), Sandygast -> Palossand (Psychic; +10 Chips / X0.05 banked per scored Stone card), Pyukumuku (Water; +10 Chips
// banked a round; Innards Out: $1 per round held when sold or destroyed), Komala (Colorless; X1.5; Comatose: can't be debuffed, Jokers can't
// destroy it), Bruxish (Water; Strong Jaw: sealed scored cards retrigger) and Jangmo-o -> Hakamo-o -> Kommo-o (Dragon; +2 / +4 Mult banked per
// Full House, evolving at +16 / +40; Kommo-o X1 + X0.15 per Full House played this run) — upstream 3.9.1 draws them all (Natdex {12,50}-{6,52}).
// Gen 8, batch 1 (contentRev 70; the owner's "yes", 2026-11-02), 20 jokers #821-847: Rookidee -> Corvisquire -> Corviknight (Colorless ->
// Metal; Flying Taxi $1 / $2 / $2 at end of round; Corviknight X1.5 and +1 shop card slot), Blipbug -> Dottler -> Orbeetle (Grass -> Psychic;
// +1 / +2 / +3 Foresight, each Foreseen card +4 Mult / X1.15), Gossifleur -> Eldegoss (Grass; Cotton Down: scored Seeds +4 Mult; Eldegoss
// plants a Seed each Blind, +1 growth level), Wooloo -> Dubwool (Colorless; +50 / +100 Chips; Cotton Guard +1 hand during Boss Blinds),
// Chewtle -> Drednaw (Water; +3 Mult / X1 + X0.3 per Water Joker), Rolycoly -> Carkol -> Coalossal (Earth -> Fire; a deck card turns Stone
// each Blind; Stone +6 Mult / X1.3; Coalossal +1 discard), Silicobra -> Sandaconda (Earth; Sand Spit: discarded cards 1 in 4 Stone; the
// house SANDSTORM, is_sandstorm; Stone +20 Chips and X1.2; r73 Sand Spit too), Cramorant (Water; Gulp Missile: the first discard loads X2.5 for the next hand)
// and Arrokuda -> Barraskewda (Water; Propeller Tail: the first scored card +10 Mult / X2) — upstream 3.9.1 draws them all (Natdex
// {20,54}-{12,56}; Cramorant Gen 8 {0,0}, Gulping {2,0}).
// Gen 8, batch 3 (contentRev 72; the owner's "yes build it", 2026-11-02), 21 jokers #862-902: Milcery -> Alcremie (Fairy; Decorate: edition cards
// +5 Mult; Whipped Cream: a deck card Foil / Holo each Blind), Falinks (Fighting; Formation), Pincurchin (Lightning; Lightning Rod), Snom ->
// Frosmoth (Water; Glass), Eiscue (Water; Ice Face / Noice Face), Indeedee (Psychic; ♂ / ♀), Morpeko (Lightning; Hunger Switch), Cufant ->
// Copperajah (Metal; Steel), the Galar fossils (Ancient Jacks) and six NEW EVOLUTIONS of existing jokers, gated by rules rev 72: Linoone ->
// Obstagoon, Corsola -> Cursola, Mr. Mime -> Mr. Rime (an Energy of a set type), Farfetch'd -> Sirfetch'd (3 Lucky triggers in a round),
// Yamask -> Runerigus (10 Stones), Basculin -> Basculegion (25 stripe cards) — upstream 3.9.1 draws them all (Natdex {12,57}-{24,58}; Gen 8).
//
// SPLIT BY GENERATION (2026-11, tools/micatro/split_designs.mjs): the jokers and their helpers now live in ./designs/ —
//   common.js (helpers two or more generations share, and the hooks index.js calls), gen3.js … gen9.js (each generation's
//   jokers + the helpers only it uses) and text.js (DESIGN_FAMILIES, DESIGN_LOC). This file re-exports all of it, so every
//   importer is unchanged, and REGISTERS the jokers.
// Registration order is part of the rules: index.js walks the definitions in order and `poke_after` splices each joker in,
//   so it decides the Joker pool's order and seeded picks (recorded runs) with it. BATCHES is the old file's order, frozen.
//   A NEW joker needs no entry here: add it to its generation's JOKERS and it registers after these, in generation order.
import { defineJokers } from '../api.js';
import { JOKERS as GEN3 } from './designs/gen3.js';
import { JOKERS as GEN4 } from './designs/gen4.js';
import { JOKERS as GEN5 } from './designs/gen5.js';
import { JOKERS as GEN6 } from './designs/gen6.js';
import { JOKERS as GEN7 } from './designs/gen7.js';
import { JOKERS as GEN8 } from './designs/gen8.js';
import { JOKERS as GEN9 } from './designs/gen9.js';
// what this file has always exported, from wherever it lives now
export {
  drifblim_destroyed, CASTFORM_FORMS, forecast, recoil, regi_chip_bonus, regi_h_x_mult, galvanized, regi_enh_vars, BURMY_CLOAKS, PRIMAL_REV,
  PRIMAL_SIDES, SIMPLE_TRIO_REV, trio111, clash_count, primal_read, primal_on, castform_lock, cherrim_sunny, slot_cost_removed, THERIAN_AT, therian,
  pheromosa_rest, protean_set, ninja_others, contrary_lifts, swift_swim_raining, komala_destroy_immune, mummy_used, mummy_sell, steel_rule_x,
  spore_first_deal, spore_hand_scored, frozen_by, freeze_keep, freeze_thaw, flipped_chips, malamar_chip_bonus, hazards_in_deck, hazard_held_x,
  pyukumuku_destroyed, prank_reroll_cost, prank_reroll_shop, prank_shop_start, alcremie_cell, snow_warning, is_snowy, snow_read, snow_state,
  rime_final_deal, jokers_gone_count, glass_rule_x, glass_x_mult, pawmot_revive, opportunist_scaled, clodsire_poison, PARADOX_COLOUR,
} from './designs/common.js';
export {
  regi_others,
} from './designs/gen3.js';
export {
  cloak_of_deck, MOTHIM_ENHANCEMENTS, distinct_enhancements, SEAS, two_seas, slot_cost_add, slot_cost_remove, POISON_CAP, poison_state, poison_taken,
  gold_in_deck, gold_held, ORIGIN_AT, giga_deck, giga_wait, LAKE_CAP, lake_others,
} from './designs/gen4.js';
export {
  moxie, SWORDS, sword_others, RESOLUTE_AT, keldeo_resolute, deck_suits, suit_leads, sword_x, TAO, tao_x, kyurem_partner, kyurem_form, MELOETTA_FORMES,
  meloetta_form, techno_count, flame_charge, flame_streak, flame_main, razor_shell, TAILOR_CLOTHS, own_chips, poison_card, poison_point, STRIPES,
  stripe_of, BASCULEGION_CARDS, RUNERIGUS_STONES, ancient_tens_values, SEASONS, SEASON_ORDER, season_of_ante, season_now, TRADE_NEED, trade_pairs,
} from './designs/gen5.js';
export {
  ZYGARDE_HALF, ZYGARDE_COMPLETE, zygarde_form, ZYGARDE_FORMES, zygarde_give, diamond_storm, HOOPA_AT, hoopa_unbound, discards_scry, mystical_fire,
  protean_pick, VIVILLON_PATTERNS, FLOWERS, TRIMS, furfrou_trim, skrelp_poison, vouchers_redeemed,
} from './designs/gen6.js';
export {
  BEAST_BOOST, beast_value, PHEROMOSA_HANDS, rks_type_of, cosmo_branch, NECROZMA_ULTRA, necrozma_ultra, MULTI_HIT, MULTI_HIT_MAX, multi_hit_roll,
  stakeout_on, ORICORIO_STYLES, dance_pick, style_of, school_on, bosses_beaten, comfey_targets, full_houses_played,
} from './designs/gen7.js';
export {
  is_sandstorm, TOX_FORMS, tox_form, tea_form, ALCREMIE_SWEETS, ALCREMIE_CREAMS, CROWN_AT, crowned, ETERNAMAX_AT, ETERNAMAX_X, eternamax, eterna_x,
} from './designs/gen8.js';
export {
  PLUMAGES, toxic_debris, PARADOX_ERAS, PARADOX_BOOST, electric_terrain, is_electric_terrain, paradox_era, paradox_boosted, straights_played,
  bolt_hands, RUIN_PCT, OGERPON_MASKS, MASK_ORDER, mask_of_ante, mask_now,
} from './designs/gen9.js';
export {
  DESIGN_FAMILIES, GALAR_FAMILY_REV, DESIGN_LOC, GALAR_UPSTREAM_TEXT,
} from './designs/text.js';

const FILE = 'micatro/pokejokers_designs';   // (the label each definition carries: def.poke_file)
// every generation's jokers, in generation order then file order. A name in two files would silently drop one, and a
// joker in the wrong generation's file would be hard to find: both are refused when the mod loads.
const ALL = {};
for (const [gen, defs] of [[3, GEN3], [4, GEN4], [5, GEN5], [6, GEN6], [7, GEN7], [8, GEN8], [9, GEN9]]) {
  for (const [name, def] of Object.entries(defs)) {
    if (ALL[name]) throw new Error(`pokermon designs: '${name}' is defined in two generation files`);
    if (def.gen !== gen) throw new Error(`pokermon designs: '${name}' (gen ${def.gen}) is in designs/gen${gen}.js`);
    ALL[name] = def;
  }
}
const BATCHES = [
  [
    'shinx', 'luxio', 'luxray', 'honedge', 'doublade', 'aegislash', 'spheal', 'sealeo', 'walrein', 'grookey', 'thwackey', 'rillaboom', 'scorbunny',
    'raboot', 'cinderace', 'sobble', 'drizzile', 'inteleon', 'kubfu', 'urshifu_single', 'urshifu_rapid', 'xerneas', 'yveltal', 'zygarde', 'diancie',
    'hoopa', 'volcanion', 'nihilego', 'buzzwole', 'pheromosa', 'xurkitree', 'celesteela', 'kartana', 'guzzlord', 'poipole', 'naganadel', 'stakataka',
    'blacephalon', 'rowlet', 'dartrix', 'decidueye', 'litten', 'torracat', 'incineroar', 'popplio', 'brionne', 'primarina', 'tandemaus', 'maushold',
    'darumaka', 'darmanitan', 'scraggy', 'scrafty', 'spiritomb', 'tatsugiri', 'sprigatito', 'floragato', 'meowscarada', 'fuecoco', 'crocalor',
    'skeledirge', 'quaxly', 'quaxwell', 'quaquaval', 'whismur', 'loudred', 'exploud', 'gulpin', 'swalot', 'trapinch', 'vibrava', 'flygon', 'spoink',
    'grumpig', 'lunatone', 'solrock', 'barboach', 'whiscash', 'starly', 'staravia', 'staraptor', 'drifloon', 'drifblim', 'castform', 'mudbray',
    'mudsdale', 'regirock', 'regice', 'registeel', 'latias', 'latios', 'kyogre', 'groudon', 'rayquaza', 'primal_kyogre', 'primal_groudon', 'cherubi',
    'cherrim', 'shellos', 'gastrodon', 'chatot', 'burmy', 'wormadam', 'mothim', 'combee', 'vespiquen', 'pachirisu', 'glameow', 'purugly', 'stunky',
    'skuntank', 'gible', 'gabite', 'garchomp', 'hippopotas', 'hippowdon', 'skorupi', 'drapion', 'carnivine', 'finneon', 'lumineon', 'uxie', 'mesprit',
    'azelf', 'dialga', 'palkia', 'regigigas', 'giratina', 'arceus', 'cresselia', 'phione', 'manaphy', 'cobalion', 'terrakion', 'virizion', 'tornadus',
    'thundurus', 'reshiram', 'zekrom', 'landorus', 'kyurem', 'keldeo', 'meloetta', 'genesect', 'snivy', 'servine', 'serperior', 'tepig', 'pignite',
    'emboar', 'oshawott', 'dewott', 'samurott', 'chespin', 'quilladin', 'chesnaught', 'fennekin', 'braixen', 'delphox', 'froakie', 'frogadier',
    'greninja', 'patrat', 'watchog', 'lillipup', 'herdier', 'stoutland', 'purrloin', 'liepard', 'pidove', 'tranquill', 'unfezant', 'blitzle',
    'zebstrika', 'woobat', 'swoobat', 'timburr', 'gurdurr', 'conkeldurr', 'tympole', 'palpitoad', 'seismitoad', 'throh', 'sawk', 'sewaddle',
    'swadloon', 'leavanny', 'venipede', 'whirlipede', 'scolipede', 'cottonee', 'whimsicott', 'petilil', 'lilligant', 'basculin', 'sandile', 'krokorok',
    'krookodile', 'maractus', 'dwebble', 'crustle', 'sigilyph', 'yamask', 'cofagrigus', 'tirtouga', 'carracosta', 'archen', 'archeops', 'minccino',
    'cinccino', 'ducklett', 'swanna', 'deerling', 'sawsbuck', 'emolga', 'karrablast', 'escavalier', 'foongus', 'amoonguss', 'alomomola', 'joltik',
    'galvantula', 'tynamo', 'eelektrik', 'eelektross', 'cubchoo', 'beartic', 'shelmet', 'accelgor', 'stunfisk', 'mienfoo', 'mienshao', 'druddigon',
    'bouffalant', 'rufflet', 'braviary', 'heatmor', 'durant', 'larvesta', 'volcarona', 'fletchling', 'fletchinder', 'talonflame', 'scatterbug',
    'spewpa', 'vivillon', 'flabebe', 'floette', 'florges', 'skiddo', 'gogoat', 'pancham', 'pangoro', 'furfrou', 'espurr', 'meowstic', 'spritzee',
    'aromatisse', 'swirlix', 'slurpuff', 'inkay', 'malamar', 'binacle', 'barbaracle', 'skrelp', 'dragalge', 'tyrunt', 'tyrantrum', 'amaura', 'aurorus',
    'hawlucha', 'klefki', 'phantump', 'trevenant', 'bergmite', 'avalugg', 'noibat', 'noivern', 'pikipek', 'trumbeak', 'toucannon', 'yungoos',
    'gumshoos', 'crabrawler', 'crabominable', 'oricorio', 'cutiefly', 'ribombee', 'wishiwashi', 'mareanie', 'toxapex', 'dewpider', 'araquanid',
    'fomantis', 'lurantis', 'morelull', 'shiinotic',
  ],
  [
    'salandit', 'salazzle', 'stufful', 'bewear', 'comfey', 'sandygast', 'palossand', 'pyukumuku', 'komala', 'bruxish', 'jangmoo', 'hakamoo', 'kommoo',
    'typenull', 'silvally', 'tapu_koko', 'tapu_lele', 'tapu_bulu', 'tapu_fini', 'cosmog', 'cosmoem', 'solgaleo', 'lunala', 'necrozma', 'magearna',
    'marshadow', 'zeraora',
  ],
  [
    'rookidee', 'corvisquire', 'corviknight', 'blipbug', 'dottler', 'orbeetle', 'gossifleur', 'eldegoss', 'wooloo', 'dubwool', 'chewtle', 'drednaw',
    'rolycoly', 'carkol', 'coalossal', 'silicobra', 'sandaconda', 'cramorant', 'arrokuda', 'barraskewda',
  ],
  [
    'toxel', 'toxtricity', 'sizzlipede', 'centiskorch', 'clobbopus', 'grapploct', 'sinistea', 'polteageist', 'hatenna', 'hattrem', 'hatterene',
    'impidimp', 'morgrem', 'grimmsnarl',
  ],
  [
    'obstagoon', 'cursola', 'sirfetchd', 'mrrime', 'runerigus', 'milcery', 'alcremie', 'falinks', 'pincurchin', 'snom', 'frosmoth', 'eiscue',
    'indeedee', 'morpeko', 'cufant', 'copperajah', 'dracozolt', 'arctozolt', 'dracovish', 'arctovish', 'basculegion',
  ],
  [
    'zacian', 'zamazenta', 'eternatus', 'zarude', 'regieleki', 'regidrago', 'glastrier', 'spectrier', 'calyrex', 'enamorus',
  ],
  [
    'nymble', 'lokix', 'pawmi', 'pawmo', 'pawmot', 'squawkabilly', 'tadbulb', 'bellibolt', 'wattrel', 'kilowattrel', 'maschiff', 'mabosstiff',
    'toedscool', 'toedscruel', 'klawf',
  ],
  [
    'capsakid', 'scovillain', 'flittle', 'espathra', 'bombirdier', 'varoom', 'revavroom', 'cyclizar', 'orthworm', 'glimmet', 'glimmora', 'flamigo',
    'veluza', 'dondozo', 'clodsire', 'poltchageist', 'sinistcha',
  ],
  [
    'great_tusk', 'scream_tail', 'brute_bonnet', 'flutter_mane', 'slither_wing', 'sandy_shocks', 'iron_treads', 'iron_bundle', 'iron_hands',
    'iron_jugulis', 'iron_moth', 'iron_thorns', 'roaring_moon', 'iron_valiant', 'walking_wake', 'iron_leaves', 'gouging_fire', 'raging_bolt',
    'iron_boulder', 'iron_crown',
  ],
  [
    'wochien', 'chienpao', 'tinglu', 'chiyu', 'koraidon', 'miraidon', 'ogerpon',
  ],
];
const done = new Set();
for (const batch of BATCHES) {
  const defs = {};
  for (const name of batch) {
    if (!ALL[name]) throw new Error(`pokermon designs: '${name}' is in BATCHES but no generation file defines it`);
    defs[name] = ALL[name]; done.add(name);
  }
  defineJokers(defs, FILE);
}
// anything newer than the frozen list: after it, in generation order, then file order
const newer = Object.fromEntries(Object.entries(ALL).filter(([name]) => !done.has(name)));
if (Object.keys(newer).length) defineJokers(newer, FILE);
