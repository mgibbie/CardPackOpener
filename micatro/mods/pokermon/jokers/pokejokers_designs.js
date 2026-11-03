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
// Dew, both held: either grows both), Kyogre (Water: +1 hand, scored Clubs retrigger, Castform Rainy), Groudon (Earth: +1 discard, scored
// Hearts / Diamonds X1.25, Castform Sunny) and their Primal Clash (both held, no Rayquaza: the suits held on the round's first deal pick one
// for the round), Rayquaza (Dragon: Delta Stream calms the clash; Dragon Ascent X0.2 per Straight / Flush) — upstream 3.9.1 draws them with
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
import {
  G, P_CENTERS, P_CENTER_POOLS, localize, card_eval_status_text, play_sound, pseudorandom, pseudoseed, pseudorandom_element, ease_hands_played,
  create_card, copy_card, playing_card_joker_effects, defineJokers, type_tooltip, level_evo, scaling_evo, item_evo,
  ease_poke_dollars, has_enhancement, has_no_rank, get_probability_vars, pseudorandom_probability, scale_card,
  find_pokemon_type, is_type, apply_type_sticker, remove_type_stickers, type_sticker_applied, get_type, multitype, wildcard_type, POKETYPES,
  add_card, detailed, energy_values, poke_remove_card, ease_dollars, ease_discard, juice_card_until, find_card, get_total_energy, POST_EVOLVE, can_evolve,
  poke_change_growth_level,
  poke_get_adjacent_jokers, emit, find_joker, poke_drain, level_up_hand, poke_evolve, increment_energy, can_increase_energy, smods_debuff_card, blueprint_compat_line,
  can_be_destroyed_by_joker, change_shop_size, faint_baby_poke, GEN9B2_REV,
} from '../api.js';
import { Tag, add_tag } from '../../../js/engine/tag.js';
import { blueprint_effect } from './pokejokers_08.js';
import * as BN from '../../../js/engine/bignum.js'; // the Blind's requirement (Poison Gas) may be a big number in modded runs
import { number_format, calculate_reroll_cost, get_next_tag_key } from '../../../js/engine/core.js';
import { rulesRev } from '../../../js/mods/pins.js';
import { odds_text } from '../../../js/engine/odds.js';

const FILE = 'micatro/pokejokers_designs';
/** contentRev 59, the owner's rule "legendaries must be complete alone": every partner clause of the Gen 3-5 Legendaries became a solo
 *  trigger (Rayquaza, the Lati twins, the Lake trio, the Regis, Regigigas, Giratina, the Swords of Justice, the Forces of Nature, the
 *  Tao trio). A move re-simulated from a run recorded before r59 (resume / replay; js/mods/pins.js RULES) keeps the old partner rules,
 *  so an old run re-plays exactly and nothing it banked shrinks; live play is always on the new ones. The progress counters (Giratina's
 *  destroyed cards, Keldeo's Hearts, the Therian rounds, Regigigas's rounds) are kept under both, so an old run carries them over. */
const solo59 = () => rulesRev('pokermon') >= 59;
const a_mult = (n) => localize({ type: 'variable', key: 'a_mult', vars: [n] });
const a_chips = (n) => localize({ type: 'variable', key: 'a_chips', vars: [n] });
const a_xmult = (n) => localize({ type: 'variable', key: 'a_xmult', vars: [n] });
/** The main end_of_round pass (not a held card's, not a repetition), as can_evolve reads it. */
const round_end = (context) => !!(context.end_of_round && !context.individual && !context.repetition);
const ordinal = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
/** A card on Pokermon 3.9.1's sheets (pokespriteload.lua PokemonSprites: the Natdex sheet, or a Gen sheet for `gen_atlas`). */
const sprite = (sheet, x, y, soul) => ({ atlas: 'AtlasJokersBasic' + sheet, pos: { x, y }, ...(soul ? { soul_pos: { x: soul[0], y: soul[1] } } : {}) });

// ------------------------------------------------------------ shared bodies
const scry = {
  add_to_deck(self, card) { G.GAME.scry_amount = (G.GAME.scry_amount || 0) + card.ability.extra.scry; },
  remove_from_deck(self, card) { G.GAME.scry_amount = Math.max(0, (G.GAME.scry_amount || 0) - card.ability.extra.scry); },
};
const hand_size = {
  add_to_deck(self, card) { G.hand.change_size(card.ability.extra.h_size); },
  remove_from_deck(self, card) { G.hand.change_size(-card.ability.extra.h_size); },
};
/** The Squirtle line's +hands pair (pokejokers_01). */
const hands = {
  add_to_deck(self, card, from_debuff) {
    G.GAME.round_resets.hands = G.GAME.round_resets.hands + card.ability.extra.hands;
    if (!from_debuff) ease_hands_played(card.ability.extra.hands);
  },
  remove_from_deck(self, card) {
    G.GAME.round_resets.hands = G.GAME.round_resets.hands - card.ability.extra.hands;
    const to_decrease = Math.min(G.GAME.current_round.hands_left - 1, card.ability.extra.hands);
    if (to_decrease > 0) ease_hands_played(-to_decrease);
  },
};
const scry_tip = (info_queue) => info_queue.push({ set: 'Other', key: 'scry_cards' });

/** Shinx line: a played card that shares a rank with a Foreseen card (G.scry_view, the top of the deck) pays and scores. */
const foreseen = (c) => !has_no_rank(c) && !!(G.scry_view && G.scry_view.cards && G.scry_view.cards.some((s) => !has_no_rank(s) && s.get_id() === c.get_id()));
function lux_calc(card, context, seed) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && foreseen(context.other_card)) {
    const ex = card.ability.extra;
    const dollars = ease_poke_dollars(card, seed, ex.money, true);
    // (Electrike: dollar_buffer holds money still being paid out, for jokers that read the total)
    G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + dollars;
    const r = { dollars, card, func() { G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; }); } };
    if (ex.mult) r.mult = ex.mult;
    if (ex.Xmult_multi) r.x_mult = ex.Xmult_multi;
    return r;
  }
  return undefined;
}

/** Honedge / Doublade: +mult_mod Mult per Steel card held when a hand is played. */
const held_steel = () => G.hand.cards.filter((c) => has_enhancement(c, 'm_steel'));
function blade_scale(card, context) {
  if (context.before && context.cardarea === G.jokers && !context.blueprint) {
    const n = held_steel().length;
    if (n > 0) scale_card(card, { ref_value: 'mult', scalar_value: 'mult_mod', scalar_factor: n, message_colour: 'MULT' });
  }
  if (context.joker_main && card.ability.extra.mult > 0) return { message: a_mult(card.ability.extra.mult), colour: 'MULT', mult_mod: card.ability.extra.mult };
  return undefined;
}
/** A held card's repetition only counts when it did something (Ferrothorn's card_effects guard). */
const held_effective = (context) => !!(context.card_effects && ((context.card_effects[0] && Object.keys(context.card_effects[0]).length) || context.card_effects.length > 1));

/** Spheal line, Rollout: a streak (0..max) of the same poker hand in a row this round; Chips = chips x 2^streak. */
function rollout(card, context) {
  const ex = card.ability.extra;
  if (context.before && context.cardarea === G.jokers && !context.blueprint) {
    ex.streak = ex.last_hand === context.scoring_name ? Math.min(ex.max_streak, ex.streak + 1) : 0;
    ex.last_hand = context.scoring_name;
  }
  if (round_end(context) && !context.blueprint) { ex.streak = 0; ex.last_hand = undefined; }
  return undefined;
}
const rollout_chips = (ex) => ex.chips * Math.pow(2, ex.streak || 0);
function rollout_main(card, context) {
  if (!context.joker_main) return undefined;
  const ex = card.ability.extra, chips = rollout_chips(ex);
  if (ex.Xmult && ex.streak >= ex.max_streak) return { message: 'Sheer Cold!', colour: 'XMULT', chip_mod: chips, Xmult_mod: ex.Xmult };
  return { message: a_chips(chips), colour: 'CHIPS', chip_mod: chips };
}

/** Grookey line, the beat: every `every`-th card scored this round is retriggered (the round's count; the hand's beats in beat_idx). */
function beat_calc(card, context) {
  const ex = card.ability.extra;
  if (context.before && context.cardarea === G.jokers && !context.blueprint) {
    ex.beat_idx = [];
    for (let i = 0; i < context.scoring_hand.length; i++) {
      ex.beat = ex.beat + 1;
      if (ex.beat % ex.every === 0) { ex.beat_idx.push(i); ex.beats = ex.beats + 1; }
    }
  }
  const on_beat = (c) => !!(context.scoring_hand && ex.beat_idx && ex.beat_idx.includes(context.scoring_hand.indexOf(c)));
  if (context.repetition && context.cardarea === G.play && !context.other_card.debuff && on_beat(context.other_card)) {
    return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
  }
  // Rillaboom's Drum Beating: a card on the beat gives +mult each time it scores
  if (ex.mult && context.individual && context.cardarea === G.play && !context.end_of_round && on_beat(context.other_card)) return { mult: ex.mult, card };
  if (context.after && context.cardarea === G.jokers && !context.blueprint) ex.beat_idx = [];
  if (round_end(context) && !context.blueprint) ex.beat = 0;
  return undefined;
}

/** The Gen 8 starters (contentRev 49). Scorbunny / Raboot, Libero's warm-up: +mult for each discard left when the hand scores (the
 *  Cyndaquil line's cynda_calc, read at joker_main: the joker's own +1 discard counts while unused; 0 left, nothing). */
function libero_mult(card, context) {
  if (!context.joker_main) return undefined;
  const dl = G.GAME.current_round.discards_left;
  if (!(dl > 0)) return undefined;
  const m = card.ability.extra.mult * dl;
  return { message: a_mult(r3(m)), colour: 'MULT', mult_mod: m };
}
/** Cinderace, Libero: X(1 + Xmult_mod per discard left) (Typhlosion's X half without its +Mult; 0 left, X1: nothing). */
const libero_x = (card) => 1 + card.ability.extra.Xmult_mod * Math.max(0, G.GAME.current_round.discards_left || 0);
/** Sobble / Drizzile: the played cards that are NOT in the scoring hand (a debuffed card outside it counts; a debuffed card inside the
 *  scoring hand is part of it and doesn't; with Splash every played card scores, so none count). */
const unscored_count = (context) => (context.full_hand && context.scoring_hand ? context.full_hand.filter((c) => !context.scoring_hand.includes(c)).length : 0);
function unscored_chips(card, context) {
  if (!context.joker_main) return undefined;
  const n = unscored_count(context);
  if (!n) return undefined;
  const c = card.ability.extra.chips * n;
  return { message: a_chips(r3(c)), colour: 'CHIPS', chip_mod: c };
}
/** Inteleon, Snipe Shot: the target is the highest-ranked scored card that can score (not debuffed, not rankless like Stone); on a tie
 *  the LEFTMOST of them (the first to score). Read from the scoring hand each time a card scores, so a retrigger hits again. */
function snipe_target(scoring_hand) {
  let best = null;
  for (const c of scoring_hand || []) {
    if (c.debuff || has_no_rank(c)) continue;
    if (!best || c.get_id() > best.get_id()) best = c;
  }
  return best;
}

/** The Sprigatito line: how many of this scored card's Lucky rolls hit (its 1 in 5 Mult and 1 in 15 money count 1 each: the engine's
 *  lucky_procs; at least 1 when only lucky_trigger is known — a mod's own Lucky roll), or 0 when it didn't trigger. */
const lucky_procs = (c) => (c.lucky_trigger ? Math.max(1, c.lucky_procs || 0) : 0);
const lucky_scored = (context) => !!(context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.lucky_trigger);
/** Sprigatito / Floragato (Hiker for Lucky cards): a scored card whose Lucky effect triggered permanently gains +mult_mod Mult and
 *  +$dollars when scored (Steamodded's perma_mult / perma_p_dollars; the value at the time, kept by the card) — once per scoring, even
 *  when both rolls hit. Every hit counts toward evolving (lucky_triggers; not Blueprint's copy). Blueprint copies the growth, as Hiker. */
function lucky_grow(card, context) {
  if (lucky_scored(context)) {
    const a = context.other_card.ability, ex = card.ability.extra;
    if (!context.blueprint) ex.lucky_triggers = (ex.lucky_triggers || 0) + lucky_procs(context.other_card);
    a.perma_mult = (a.perma_mult || 0) + ex.mult_mod;
    a.perma_p_dollars = (a.perma_p_dollars || 0) + ex.dollars;
    return { extra: { message: localize('k_upgrade_ex'), colour: 'MULT' }, colour: 'MULT', card };
  }
  return undefined;
}
/** Meowscarada: a scored card whose Lucky effect triggered permanently gains X(Xmult_mod) Mult (Steamodded's perma_x_mult: the engine
 *  scores x_mult * (1 + perma_x_mult) every time the card scores after — X1.5 after one trigger, X2 after two). Once per scoring. */
function lucky_xgrow(card, context) {
  if (lucky_scored(context)) {
    const a = context.other_card.ability;
    a.perma_x_mult = (a.perma_x_mult || 0) + card.ability.extra.Xmult_mod;
    return { extra: { message: localize('k_upgrade_ex'), colour: 'XMULT' }, colour: 'XMULT', card };
  }
  return undefined;
}
/** The Sprigatito line: an extra table from before contentRev 23 (a round counter, Meowscarada's held X) brought to the new shape —
 *  the Lucky-trigger count from 0 (rounds played don't map to triggers), Meowscarada's X gain from its base with the Energy it has. */
function lucky_legacy(self, card) {
  const ex = card.ability.extra, base = self.config.extra;
  if (!ex || typeof ex !== 'object') return;
  if (base.lucky_triggers !== undefined && typeof ex.lucky_triggers !== 'number') ex.lucky_triggers = 0;
  if (base.Xmult_mod !== undefined && typeof ex.Xmult_mod !== 'number') {
    ex.Xmult_mod = base.Xmult_mod * (1 + energy_values.Xmult_mod * ((ex.energy_count || 0) + (ex.c_energy_count || 0) / 2));
    delete ex.Xmult_multi;
  }
  if (base.rounds === undefined && ex.rounds !== undefined) delete ex.rounds;
}
const lucky_left = (self, card) => Math.max(0, self.config.evo_rqmt - (card.ability.extra.lucky_triggers || 0));
const r3 = (x) => Math.round(x * 1000) / 1000;

/** Whismur line: how many Glass cards broke (their 1 in 4 shatter; Glass Joker's count — remove_playing_cards, the `shattered`
 *  ones), each growing `ref` by its gain `mod` (Energy scales only the gain; the totals are in fields energize ignores, so a
 *  banked amount keeps what it was worth when earned). Not Blueprint (it scales, as Glass Joker). */
function glass_grow(card, context, ref, mod, message_key) {
  if (context.remove_playing_cards && !context.blueprint && context.removed) {
    const n = context.removed.filter((c) => c.shattered).length;
    if (n > 0) scale_card(card, { ref_value: ref, scalar_value: mod, scalar_factor: n, message_key, message_colour: message_key === 'a_chips' ? 'CHIPS' : message_key === 'a_mult' ? 'MULT' : 'XMULT' });
  }
  return undefined;
}
/** Whismur line: the Chips (Whismur's), the Mult (Loudred's) and the X Mult (Exploud's) this form has. */
function glass_main(card, context) {
  if (!context.joker_main) return undefined;
  const ex = card.ability.extra, r = {};
  if (ex.glass_chips) r.chip_mod = ex.glass_chips;
  if (ex.glass_mult) r.mult_mod = ex.glass_mult;
  if (ex.glass_Xmult && ex.glass_Xmult !== 1) r.Xmult_mod = ex.glass_Xmult;
  if (!Object.keys(r).length) return undefined;
  r.message = r.Xmult_mod ? a_xmult(r.Xmult_mod) : r.mult_mod ? a_mult(r.mult_mod) : a_chips(r.chip_mod);
  r.colour = r.Xmult_mod ? 'XMULT' : r.mult_mod ? 'MULT' : 'CHIPS';
  return r;
}
/** A Negative Tarot (`tarot`: Whismur's line c_justice, Sprigatito's c_magician) when this card evolved from `from` (the poke_evolved
 *  context, after the swap; Chingling's add_card). Negative: it needs no consumable slot. */
function evolved_tarot(card, context, from, tarot) {
  if (context.poke_evolved && context.card === card && context.from === 'j_poke_' + from && !context.blueprint) {
    G.E_MANAGER.add_event(() => { add_card({ set: 'Tarot', key: tarot, edition: 'e_negative' }); });
  }
  return undefined;
}
const glass_evolved = (card, context, from) => evolved_tarot(card, context, from, 'c_justice');
const lucky_tips = (info_queue, evolves) => {
  info_queue.push(P_CENTERS.m_lucky);
  if (evolves && detailed()) { info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } }); info_queue.push(P_CENTERS.c_magician); }
};
const glass_tips = (info_queue, evolves) => {
  info_queue.push(P_CENTERS.m_glass);
  if (evolves && detailed()) { info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } }); info_queue.push(P_CENTERS.c_justice); }
};

/** Gulpin / Swalot / Drifloon / Drifblim: max Stockpile (`stockpile_max`, the house energy field: base 3, +1 per Energy, +0.5 per
 *  mismatched Colorless — floored), plus a fixed `stockpile_bonus` (Drifblim's +2: its base 5, still +1 per Energy, since the energy
 *  field grows by a third of ITS base, 3). */
const stock_max = (ex) => Math.floor(ex.stockpile_max + 1e-9) + (ex.stockpile_bonus || 0);
const stock_mult = (ex) => ex.stockpile_mult * ex.stockpile;
/** Gulpin / Swalot: a scored Diamond card gives +stockpile_mult Mult per Stockpile (Blueprint copies it). */
function stockpile_mult(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && card.ability.extra.stockpile > 0 && context.other_card.is_suit('Diamonds')) {
    return { mult: stock_mult(card.ability.extra), card };
  }
  return undefined;
}
/** Swalot: X1 + Xmult_mod per card the full deck is below the run's starting size (Erosion's count), never below X1. */
const swalot_x = (ex) => {
  const below = G.GAME && G.playing_cards ? (G.GAME.starting_deck_size || 0) - G.playing_cards.length : 0;
  return Math.max(1, 1 + ex.Xmult_mod * Math.max(0, below));
};
const swallowable = (c) => !c.destroyed && !c.shattered && !c.removed && !c.poke_swallowed;
/** Gulpin / Swalot, end of round: swallow the leftmost held Hazard (else the leftmost held Diamond — a debuffed one isn't a Diamond,
 *  as is_suit) through Pokermon's poke_remove_card (dissolve, remove_playing_cards: Qwilfish / Spiritomb count it as any destroyed
 *  card); +1 Stockpile below max. At max, Gulpin leaves the Diamonds alone; Swalot still swallows one for its rank in $. The Hazard's
 *  own 1 in 3 roll later this pass skips it (`poke_swallowed`, enhancement1.js). Once per round: not Blueprint, not a joker retrigger. */
function swallow(card, context, swalot) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over) return;
  const ex = card.ability.extra, room = ex.stockpile < stock_max(ex);
  let target = G.hand.cards.find((c) => swallowable(c) && has_enhancement(c, 'm_poke_hazard'));
  let dollars = 0;
  if (!target && (room || swalot)) {
    target = G.hand.cards.find((c) => swallowable(c) && c.is_suit('Diamonds'));
    if (target && swalot && !has_no_rank(target)) dollars = target.get_id();
  }
  if (!target) return;
  target.poke_swallowed = true;
  poke_remove_card(target, card);
  if (room) ex.stockpile = ex.stockpile + 1;
  card_eval_status_text(card, 'extra', null, null, null, { message: room ? 'Stockpile!' : 'Swallow!', colour: 'MULT' });
  if (dollars > 0) { ease_dollars(dollars); card_eval_status_text(card, 'dollars', dollars); }
}

/** Drifloon / Drifblim, Stockpile: each PLAYER discard action (pre_discard of a real discard; `hook` = an effect's discard, as Sand Pit)
 *  gains 1 Stockpile below max — once per discard, however many cards. Not Blueprint, not a joker retrigger. */
function drift_charge(card, context) {
  if (!context.pre_discard || context.hook || context.blueprint || context.retrigger_joker) return;
  const ex = card.ability.extra;
  if (ex.stockpile >= stock_max(ex)) return;
  ex.stockpile = ex.stockpile + 1;
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Stockpile!', colour: 'XMULT' });
}
/** Spit Up's X: X1 + spit_Xmult (0.5, in no energy field) per Stockpile. */
const spit_x = (ex) => r3(1 + ex.spit_Xmult * ex.stockpile);
/** The round's final hand: no hands left after this one is played (Acrobat's check: hands_left is already spent while it scores). */
const final_hand = () => !!(G.GAME && G.GAME.current_round && G.GAME.current_round.hands_left === 0);
/** Drifloon / Drifblim, Spit Up: on the final hand, with 1+ Stockpile, X(1 + 0.5 per Stockpile) in joker_main (a Blueprint copies it,
 *  either side of the joker: the Stockpile is still there for it). The joker itself marks the Spit Up (`spitting`), and in `after` (once
 *  the whole hand has scored) resets the Stockpile to 0 and counts it (`spit_ups`, Drifloon's evolution) — once, never by a Blueprint or a
 *  joker retrigger. 0 Stockpile: nothing, and it doesn't count. */
function spit_up(card, context) {
  const ex = card.ability.extra;
  if (context.joker_main && final_hand() && ex.stockpile > 0) {
    if (!context.blueprint) ex.spitting = true;
    const x = spit_x(ex);
    return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
  }
  if (context.after && ex.spitting && !context.blueprint && !context.retrigger_joker) {
    ex.spitting = undefined;
    ex.stockpile = 0;
    if (ex.spit_ups !== undefined) ex.spit_ups = ex.spit_ups + 1;
    card_eval_status_text(card, 'extra', null, null, null, { message: 'Spit Up!', colour: 'XMULT' });
  }
  return undefined;
}
/** Drifblim, Aftermath: a Negative Spectral (random: create_card's seeded roll, key_append 'drifblim'; Negative, so it needs no free
 *  consumable slot). From selling_self (sold) and from the start_dissolve hook (destroyed: Ceremonial Dagger, Madness, Hex, Ankh, a
 *  Pokermon eater...; index.js hooks.start_dissolve -> drifblim_destroyed). Not on evolving or any transform (set_ability: no
 *  dissolve); not from a Blueprint; not while debuffed (a debuffed joker has no abilities). */
function aftermath(card) {
  G.E_MANAGER.add_event(() => { add_card({ set: 'Spectral', edition: 'e_negative', key_append: 'drifblim' }); });
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Aftermath!', colour: 'Spectral' });
}
/** index.js hooks.start_dissolve: an owned Drifblim being destroyed (a saved one — joker_type_destroyed's no_destroy — never gets here). */
export function drifblim_destroyed(card) {
  if (!card || card.debuff || card.removed || !G.jokers || card.area !== G.jokers) return;
  if (!card.config || !card.config.center || card.config.center.key !== 'j_poke_drifblim') return;
  aftermath(card);
}
const drift_vars = (ex, evo) => [ex.stockpile, stock_max(ex), r3(ex.spit_Xmult), spit_x(ex), ex.spit_ups || 0, evo];

/** Vibrava: +d_size discards each round while held (the Charmander line's pair, pokejokers_01): on gain, and off again when sold,
 *  destroyed or evolved (set_ability runs the old center's remove_from_deck across an evolution). */
const discards = {
  add_to_deck(self, card) { G.GAME.round_resets.discards = G.GAME.round_resets.discards + card.ability.extra.d_size; ease_discard(card.ability.extra.d_size); },
  remove_from_deck(self, card) { G.GAME.round_resets.discards = G.GAME.round_resets.discards - card.ability.extra.d_size; ease_discard(-card.ability.extra.d_size); },
};
/** Trapinch / Vibrava, Sand Pit: every card the PLAYER discards (the pre_discard context of a real discard: `hook` is set by every
 *  effect that discards for you — The Hook, Pokermon's seals, Bunco / MoreFluff blinds — and those don't count) banks +chip_mod Chips
 *  on the joker (`sand_chips`, in no energy_values: a banked Chip keeps what it was worth when earned) and counts toward evolution
 *  (`sand_cards`). A discard of N cards counts N. Not Blueprint (it scales). */
function sand_pit(card, context) {
  if (context.pre_discard && !context.hook && !context.blueprint && !context.retrigger_joker && context.full_hand && context.full_hand.length) {
    const ex = card.ability.extra, n = context.full_hand.length;
    let gained = 0;
    scale_card(card, {
      ref_value: 'sand_chips', scalar_value: 'chip_mod', scalar_factor: n, no_message: true,
      operation: (t, k, v, change) => { t[k] = r3(v + change); gained = change; },
    });
    ex.sand_cards = (ex.sand_cards || 0) + n;
    card_eval_status_text(card, 'extra', null, null, null, { message: a_chips(r3(gained)), colour: 'CHIPS' });
  }
  return undefined;
}
/** Trapinch / Vibrava / Flygon: the banked Chips, every hand (Blueprint copies them). */
function sand_main(card, context) {
  const ex = card.ability.extra;
  if (!context.joker_main) return undefined;
  const x = ex.Xmult_mod !== undefined ? sandstorm_x(ex) : 1;
  const r = {};
  if (ex.sand_chips > 0) r.chip_mod = ex.sand_chips;
  if (x > 1) r.Xmult_mod = x;
  if (!Object.keys(r).length) return undefined;
  r.message = r.Xmult_mod ? a_xmult(x) : a_chips(r.chip_mod);
  r.colour = r.Xmult_mod ? 'XMULT' : 'CHIPS';
  return r;
}
/** Flygon, Sandstorm: X(1 + Xmult_mod per discard used this round). A discard USE counts once however many cards it had; effect
 *  discards (hook) never raise discards_used; it is 0 again each round (run.js new round). */
const sandstorm_x = (ex) => r3(1 + ex.Xmult_mod * ((G.GAME && G.GAME.current_round && G.GAME.current_round.discards_used) || 0));

/** The Gen 9 starters' bank (Trapinch's sand_chips pattern): `ref` (a field in no energy_values: a banked gain keeps what it was
 *  worth when earned, Energy is never retroactive) grows by `mod` x `n` (the gain is the Energy field). r3-rounded; `xm` shows the
 *  new X total, else the gain. */
function bank(card, ref, mod, n, colour) {
  let gained = 0;
  scale_card(card, {
    ref_value: ref, scalar_value: mod, scalar_factor: n, no_message: true,
    operation: (t, k, v, change) => { t[k] = r3(v + change); gained = change; },
  });
  const ex = card.ability.extra;
  const message = colour === 'XMULT' ? a_xmult(ex[ref]) : colour === 'MULT' ? a_mult(r3(gained)) : a_chips(r3(gained));
  card_eval_status_text(card, 'extra', null, null, null, { message, colour });
}
/** Fuecoco / Crocalor / Skeledirge, Torch Song: every hand you play (its `before`: the hand being played counts itself) banks
 *  +mult_mod Mult (`torch_mult`; Skeledirge banks X Mult instead, +Xmult_mod on `torch_Xmult`). Not Blueprint, not a joker
 *  retrigger (it scales). */
function torch_song(card, context) {
  if (context.before && context.cardarea === G.jokers && !context.blueprint && !context.retrigger_joker) {
    const ex = card.ability.extra;
    if (ex.Xmult_mod !== undefined) bank(card, 'torch_Xmult', 'Xmult_mod', 1, 'XMULT');
    else bank(card, 'torch_mult', 'mult_mod', 1, 'MULT');
  }
  return undefined;
}
/** Quaxly / Quaxwell / Quaquaval, Moxie: when you beat a Blind (the main end_of_round pass, not a game over), banks +chip_mod
 *  Chips (`moxie_chips`; Quaquaval: +Xmult_mod X Mult on `moxie_Xmult`) for each unused hand — the hands left after the winning
 *  hand (G.GAME.current_round.hands_left, before the next round refills them). None left: nothing. Not Blueprint. */
const unused_hands = () => Math.max(0, (G.GAME && G.GAME.current_round && G.GAME.current_round.hands_left) || 0);
function moxie_bank(card, context) {
  if (round_end(context) && !context.blueprint && !context.retrigger_joker && !context.game_over) {
    const n = unused_hands(), ex = card.ability.extra;
    if (n > 0) {
      if (ex.Xmult_mod !== undefined) bank(card, 'moxie_Xmult', 'Xmult_mod', n, 'XMULT');
      else bank(card, 'moxie_chips', 'chip_mod', n, 'CHIPS');
    }
  }
  return undefined;
}
/** The Gen 9 starters: their banked Chips / Mult and X Mult, every hand (Blueprint copies them). */
function starter9_main(card, context) {
  if (!context.joker_main) return undefined;
  const ex = card.ability.extra, r = {};
  if (ex.moxie_chips > 0) r.chip_mod = ex.moxie_chips;
  if (ex.torch_mult > 0) r.mult_mod = ex.torch_mult;
  const x = ex.torch_Xmult !== undefined ? ex.torch_Xmult : ex.moxie_Xmult;
  if (x !== undefined && x > 1) r.Xmult_mod = x;
  if (!Object.keys(r).length) return undefined;
  r.message = r.Xmult_mod ? a_xmult(r.Xmult_mod) : r.mult_mod ? a_mult(r.mult_mod) : a_chips(r.chip_mod);
  r.colour = r.Xmult_mod ? 'XMULT' : r.mult_mod ? 'MULT' : 'CHIPS';
  return r;
}

/** Spoink / Grumpig, Pearl: at the end of the round, a random card held in hand with no seal gains a Pink Seal (the run's seeded RNG;
 *  none unsealed: nothing). Once per round: not Blueprint, not a joker retrigger, not on a game over. */
function pearl(card, context) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over) return;
  const bare = G.hand.cards.filter((c) => !c.seal && !c.destroyed && !c.shattered && !c.removed);
  if (!bare.length) return;
  const target = pseudorandom_element(bare, pseudoseed('poke_spoink_pearl'))[0];
  target.set_seal('poke_pink_seal');
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Pearl!', colour: 'pink' });
}
/** Spoink / Grumpig: the banked X Mult (`pink_Xmult`, in no energy field), every hand (Blueprint copies it). */
function pearl_main(card, context) {
  const x = card.ability.extra.pink_Xmult;
  if (context.joker_main && x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
  return undefined;
}
/** Grumpig's gain for the current hand: Xmult_mod for a hand with a Pink Seal trigger, twice that (Black Pearl) when one of them had no
 *  room for its Energy — once per hand, the overflow gain replacing the normal one (G.GAME.hands_played names the hand: it only goes up
 *  after the hand has scored). */
function grumpig_gain(card, overflow) {
  const ex = card.ability.extra, hand_no = G.GAME.hands_played || 0;
  if (ex.pink_hand !== hand_no) { ex.pink_hand = hand_no; ex.pink_gain = 0; }
  const want = overflow ? 2 * ex.Xmult_mod : ex.Xmult_mod;
  if (want <= (ex.pink_gain || 0) + 1e-12) return;
  const add = want - (ex.pink_gain || 0);
  ex.pink_gain = want;
  ex.pink_Xmult = r3(ex.pink_Xmult + add);
  card_eval_status_text(card, 'extra', null, null, null, { message: overflow ? 'Black Pearl!' : localize('k_upgrade_ex'), colour: 'XMULT' });
}
const pink_tip = (info_queue) => info_queue.push({ key: 'poke_pink_seal_seal', set: 'Other' });

/** Castform's forms: the weather, the Pokermon type it gives (Ice maps to Water) and its name (+ the poke_sun / poke_rain / poke_snow / Colorless colour of its pop-up). 'normal' is its own card. */
export const CASTFORM_FORMS = {
  normal: { ptype: 'Colorless', name: 'Normal', colour: '#c8c0f8' },
  sunny: { ptype: 'Fire', name: 'Sunny', colour: '#f48e62' },
  rainy: { ptype: 'Water', name: 'Rainy', colour: '#6169ff' },
  snowy: { ptype: 'Water', name: 'Snowy', colour: '#82c8e8' },
};
/** Forecast: the form the cards held in hand call for. Hearts and Diamonds count together ("red") against Clubs and against
 *  Spades; a Wild card counts once for each of the three; a debuffed card, a Stone card or a card with no suit (a Hazard) counts
 *  for none (the engine's is_suit). The single highest count wins; a tie for the top (or no suited card) is Normal. */
export function forecast(cards) {
  let red = 0, clubs = 0, spades = 0;
  for (const c of cards) {
    if (c.is_suit('Hearts') || c.is_suit('Diamonds')) red += 1;
    if (c.is_suit('Clubs')) clubs += 1;
    if (c.is_suit('Spades')) spades += 1;
  }
  const top = Math.max(red, clubs, spades);
  if (top === 0 || [red, clubs, spades].filter((n) => n === top).length > 1) return 'normal';
  return red === top ? 'sunny' : clubs === top ? 'rainy' : 'snowy';
}
/** Kecleon takes the type of the joker to its right: re-read it when Castform's type changes (its Lua update runs every frame). */
function sync_kecleons() {
  for (const c of G.jokers.cards.slice()) { const mc = c.config.center; if (mc.key === 'j_poke_kecleon' && mc.update) mc.update(mc, c); }
}
/** Castform takes a form: its own Pokermon type (ability.extra.ptype, which energy_matches, is_type and find_pokemon_type read)
 *  becomes the form's. A Tera sticker still overrides it, as on any joker. Its debuff is re-evaluated (as Kecleon's set_type). */
function castform_set_form(card, form) {
  const ex = card.ability.extra, f = CASTFORM_FORMS[form] || CASTFORM_FORMS.normal;
  const changed = ex.form !== form || ex.ptype !== f.ptype;
  ex.form = form;
  ex.ptype = f.ptype;
  if (!changed) return;
  card.set_debuff();
  sync_kecleons();
}
/** The round's FIRST deal (Steamodded hand_drawn while the first hand is dealt: nothing played or discarded yet, once a round):
 *  every card is in hand by then (the first_hand_drawn context runs before the deal's draw events land). */
const first_deal = (card, context, field = 'forecast_round') => !!(context.hand_drawn && !context.blueprint && G.STATE === G.STATES.DRAW_TO_HAND && G.GAME.current_round
  && G.GAME.current_round.hands_played === 0 && G.GAME.current_round.discards_used === 0 && card.ability.extra[field] !== G.GAME.round);
/** Rainy: the first Club among the scoring cards (a debuffed one isn't a Club: is_suit). */
const first_club = (context) => (context.scoring_hand || []).find((c) => c.is_suit('Clubs'));

/** Kubfu / Urshifu, training: X Mult grows on a hand of exactly 1 or exactly 5 scoring cards (Kubfu counts each school). */
function training(card, context) {
  const ex = card.ability.extra;
  if (context.before && context.cardarea === G.jokers && !context.blueprint && context.scoring_hand) {
    const n = context.scoring_hand.length;
    if (n === 1 || n === 5) {
      if (ex.single !== undefined) { if (n === 1) ex.single = ex.single + 1; else ex.rapid = ex.rapid + 1; ex.last = n === 1 ? 'single' : 'rapid'; }
      scale_card(card, { ref_value: 'Xmult', scalar_value: 'Xmult_mod', message_key: 'a_xmult', message_colour: 'XMULT' });
    }
  }
  if (context.joker_main && ex.Xmult > 1) return { message: a_xmult(ex.Xmult), colour: 'XMULT', Xmult_mod: ex.Xmult };
  return undefined;
}
const urshifu_tips = (info_queue) => info_queue.push({ set: 'Other', key: 'poke_design_unseen_fist' });

/** Tandemaus / Maushold: a scored card sharing its rank with another scored card gives +mult. */
function pair_mult(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && !has_no_rank(context.other_card)) {
    const id = context.other_card.get_id();
    if (context.scoring_hand.some((c) => c !== context.other_card && !has_no_rank(c) && c.get_id() === id)) return { mult: card.ability.extra.mult, card };
  }
  return undefined;
}

/** Scraggy / Scrafty, Moxie: grows at end of round when the Blind fell to the round's first hand. */
function moxie(card, context, step) {
  if (round_end(context) && !context.blueprint && !context.game_over && G.GAME.current_round.hands_played === 1) {
    scale_card(card, { ref_value: 'mult', scalar_table: { moxie: step() }, scalar_value: 'moxie', message_colour: 'MULT' });
  }
  return undefined;
}

/** Mudbray / Mudsdale, Stamina: +chip_mod Chips for each hand that isn't the round's first. */
function stamina(card, context) {
  if (context.before && context.cardarea === G.jokers && !context.blueprint && G.GAME.current_round.hands_played > 0) {
    scale_card(card, { ref_value: 'chips', scalar_value: 'chip_mod', message_colour: 'CHIPS' });
  }
  if (context.joker_main && card.ability.extra.chips > 0) return { message: a_chips(card.ability.extra.chips), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
  return undefined;
}

/** Darmanitan's Zen Mode type: a Psychic Tera sticker until end of round, then the type it had (its own, or a Tera it wore). */
function zen_on(self, card) {
  const ex = card.ability.extra;
  ex.zen_prev = type_sticker_applied(card) || false;
  apply_type_sticker(card, 'Psychic');
  ex.zen = true;
  ex.form = 'zen';
}
function zen_off(self, card) {
  const ex = card.ability.extra;
  if (ex.zen_prev) apply_type_sticker(card, ex.zen_prev);
  else { remove_type_stickers(card); ex.ptype = self.config.extra.ptype; }
  ex.zen = false;
  ex.zen_prev = undefined;
  ex.form = undefined;
}

/** Spiritomb: create The Soul once, at the goal, when a consumable slot is free. */
function spirit_soul(card) {
  const ex = card.ability.extra;
  if (ex.created || ex.spirits < ex.goal) return;
  if (G.consumeables.cards.length + (G.GAME.consumeable_buffer || 0) >= G.consumeables.config.card_limit) return;
  ex.created = true;
  G.GAME.consumeable_buffer = (G.GAME.consumeable_buffer || 0) + 1;
  G.E_MANAGER.add_event(() => {
    const soul = create_card('Spectral', G.consumeables, null, null, null, null, 'c_soul');
    soul.add_to_deck();
    G.consumeables.emplace(soul);
    G.GAME.consumeable_buffer = 0;
  });
  card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_plus_spectral'), colour: 'Spectral' });
}
const spirit_x = (ex) => 1 + ex.spirits * ex.Xmult_mod;

/** Tatsugiri: the leftmost Water Joker (never Tatsugiri itself) in the joker row. */
// Lunatone / Solrock: the round's day-night cycle. A hand is DAY when the round has played an even number of hands before it
// (the 1st, 3rd, 5th...), NIGHT otherwise; during scoring hands_played is still the count before this hand (run.js adds 1 after).
const is_day = () => (((G.GAME && G.GAME.current_round && G.GAME.current_round.hands_played) || 0) % 2) === 0;
/** For the tooltip: the NEXT hand — this round's next one, or (out of a round: the shop, the blind select) the next round's first, a day. */
const next_is_day = () => !(G.GAME && G.GAME.facing_blind) || is_day();
/** Cosmic Power: the partner is owned and not debuffed (find_card skips debuffed cards); a Blueprint copy isn't the partner. */
const cosmic = (card, partner) => !!(G.jokers && find_card(partner).length > 0);
/** The half-strength cross-coverage, derived so Energy keeps the ratio: half the Chips; X1 + (X - 1) / 2. */
const sun_half = (ex) => ex.chips / 2;
const moon_half = (ex) => 1 + (ex.Xmult - 1) / 2;
const commanded = (card) => G.jokers.cards.find((c) => c !== card && is_type(c, 'Water'));
const TATSU_FORMS = ['curly', 'droopy', 'stretchy'];

// The owner's Barboach line (Muddy Water / Earthquake): a joker counts when it is Water OR Earth by Pokermon's own is_type (its ptype,
// a Tera sticker, Castform's current form, an add-on's IS_TYPE_RULES), ONCE however many of the two it is, and only while it isn't
// debuffed (a debuffed joker does nothing this hand; NOTE Pelipper / Politoed / Corsola count through find_pokemon_type, which counts
// debuffed jokers too — this line deliberately doesn't). Itself always counts (+1), so the shop / collection card shows the number
// it would give once bought.
const muddy = (j) => !j.debuff && (is_type(j, 'Water') || is_type(j, 'Earth'));
const muddy_others = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && muddy(j)).length;
const muddy_count = (card) => muddy_others(card) + 1;
function muddy_main(card, context) {
  if (!context.joker_main) return undefined;
  const chips = r3(card.ability.extra.chips * muddy_count(card));
  return { message: a_chips(chips), colour: 'CHIPS', chip_mod: chips };
}
/** Whiscash, Earthquake: on the round's first hand, with quake_req+ OTHER Water / Earth Jokers, every scored card retriggers. */
const quake_on = (card) => muddy_others(card) >= card.ability.extra.quake_req;
function quake_state(card) {
  const ex = card.ability.extra, n = muddy_others(card);
  if (n < ex.quake_req) return 'Inactive: ' + n + '/' + ex.quake_req + ' others';
  if (G.GAME && G.GAME.facing_blind && G.GAME.current_round && G.GAME.current_round.hands_played > 0) return 'Used this round';
  return 'Active!';
}
// The owner's Starly line (Flock / Brave Bird): a Colorless team count, Barboach's shape with one type — a joker counts when
// is_type(j, 'Colorless') (its ptype, a Tera sticker, Castform while Normal, an add-on's IS_TYPE_RULES) and isn't debuffed; itself
// always counts (+1). NOTE Miltank counts through find_pokemon_type (debuffed jokers too); this line deliberately doesn't.
const flock = (j) => !j.debuff && is_type(j, 'Colorless');
const flock_count = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && flock(j)).length + 1;
const flock_mult = (card) => r3(card.ability.extra.mult * flock_count(card));
const brave_x = (card) => r3(1 + card.ability.extra.Xmult_mod * flock_count(card));
function flock_main(card, context) {
  if (!context.joker_main) return undefined;
  const mult = flock_mult(card);
  return { message: a_mult(mult), colour: 'MULT', mult_mod: mult };
}
/** Staraptor's Recoil: each hand played costs `recoil` dollars, never past the run's debt limit (bankrupt_at: $0, Credit Card -$20). */
function recoil(card, context) {
  if (!(context.before && context.cardarea === G.jokers) || context.blueprint) return;
  const lose = card.ability.extra.recoil, buffer = G.GAME.dollar_buffer || 0;
  if ((G.GAME.dollars || 0) + buffer - lose < (G.GAME.bankrupt_at || 0)) return;
  G.GAME.dollar_buffer = buffer - lose;
  G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
  ease_dollars(-lose);
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Recoil! -$' + lose, colour: 'MONEY' });
}

// The owner's Combee line (Honey Gather / Attack Order): joker-row ADJACENCY on sell value. Neighbours are poke_get_adjacent_jokers
// (Magneton's / Dolliv's: the Jokers directly left and right; none at a row edge). Honey is Dolliv's end-of-round sell-value growth
// without the self part, by a FIXED amount (`honey`, no energy field) and never from a Blueprint copy (main_eval + !blueprint: once a
// round, so a copied Combee / Vespiquen never feeds twice). A debuffed Combee / Vespiquen is never calculated, so it gives nothing.
/** The Jokers directly left and right of `card` in the joker row (0-2 of them). */
const hive = (card) => ((G.jokers && G.jokers.cards && G.jokers.cards.includes(card)) ? poke_get_adjacent_jokers(card) : []);
function honey_gather(card, context) {
  if (!(context.end_of_round && context.main_eval) || context.blueprint) return;
  for (const j of hive(card)) {
    j.ability.extra_value = (j.ability.extra_value || 0) + card.ability.extra.honey;
    j.set_cost();
    card_eval_status_text(j, 'extra', null, null, null, { message: localize('k_val_up'), colour: 'MONEY' });
  }
}
/** Vespiquen's Attack Order: the neighbours' current sell value ($, card.sell_cost) and X(1 + Xmult_mod per $), capped at Xmult_cap. */
const hive_value = (card) => hive(card).reduce((s, j) => s + (j.sell_cost || 0), 0);
const attack_order_x = (card) => r3(Math.min(card.ability.extra.Xmult_cap, 1 + card.ability.extra.Xmult_mod * hive_value(card)));

// ------------------------------------------------------------ the Regi trio (Regirock / Regice / Registeel)
const REGIS = ['j_poke_regirock', 'j_poke_regice', 'j_poke_registeel'];
/** Undebuffed owned jokers of this key (the rule hooks below read them: a debuffed Regi does nothing). */
const regis_held = (key) => ((G.jokers && G.jokers.cards) || []).filter((j) => !j.debuff && j.config.center.key === key);
/** Regi Trio: how many OTHER Regi species you have (undebuffed). Distinct species: two Regices (Showman) are one "other Regi" for
 *  a Regirock, and a Regice never counts its own twin. */
export function regi_others(card) {
  const own = card.config.center.key, seen = new Set();
  for (const j of (G.jokers && G.jokers.cards) || []) {
    const k = j.config.center.key;
    if (j !== card && !j.debuff && k !== own && REGIS.includes(k)) seen.add(k);
  }
  return seen.size;
}
/** A Regi's own base conversion (1; Regice's `glass_convert`, +1 per Energy, floored). */
const regi_base = (card) => Math.floor((card.ability.extra.glass_convert || 1) + 1e-9);
/** The Blind being selected / played is a Boss Blind. */
const boss_blind = () => !!(G.GAME && G.GAME.blind && G.GAME.blind.boss);
/** Cards this Regi converts when a Blind is selected: its base, +1 when that Blind is a BOSS Blind (Regi Trio, contentRev 59: solo).
 *  Before r59: + the other Regi species held (regi_others) + 1 with all three and an awake Regigigas (giga_trio_bonus). */
const regi_converts = (card, boss = boss_blind()) => regi_base(card) + (solo59() ? (boss ? 1 : 0) : regi_others(card) + giga_trio_bonus(card));
const unbroken = (c) => !c.destroyed && !c.shattered && !c.removed;
/** When a Blind is selected: `n` random cards of the FULL deck (G.playing_cards, the run's seeded pseudorandom_element) become `enh`.
 *  Unenhanced cards first; once none is left, any card that isn't already `enh` (overwriting its enhancement; seal and edition kept).
 *  Never a card that already is `enh`. Blueprint copies it (as Marble Joker). */
function regi_convert(card, context, enh, seed, word) {
  if (!context.setting_blind || card.getting_sliced || (context.blueprint_card && context.blueprint_card.getting_sliced)) return;
  const n = regi_converts(card);
  let done = 0;
  for (let i = 0; i < n; i++) {
    const live = (G.playing_cards || []).filter(unbroken);
    const plain = live.filter((c) => c.config.center.key === 'c_base');
    const pool = plain.length ? plain : live.filter((c) => c.config.center.key !== enh);
    if (!pool.length) break;
    const [pick] = pseudorandom_element(pool, pseudoseed(seed));
    pick.set_ability(P_CENTERS[enh], null, true);
    done++;
  }
  if (done) card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: '+' + done + ' ' + word, colour: 'CHIPS' });
}
/** Regirock (hook chip_bonus): a Stone card gives the best undebuffed Regirock's `chips1` (100) INSTEAD of its +50 (the card's
 *  perma_bonus stays on top). Only real Stone cards (the get_chip_bonus Stone branch), not while debuffed. */
export function regi_chip_bonus(v, card) {
  if (!v || card.debuff || card.ability.effect !== 'Stone Card' || !G.jokers) return undefined;
  const rocks = regis_held('j_poke_regirock');
  if (!rocks.length) return undefined;
  const best = Math.max(...rocks.map((j) => j.ability.extra.chips1));
  return v + best - ((P_CENTERS.m_stone.config && P_CENTERS.m_stone.config.bonus) || 50);
}
/** Registeel (hook chip_h_x_mult): a held Steel card's own X Mult becomes the best undebuffed Registeel's `Xmult_multi` (X2) instead of
 *  X1.5. It IS the Steel card's held effect (Card:get_chip_h_x_mult), so every retrigger (Mime, a Red Seal) gives it again; a
 *  multiplicative add-on bonus (Nacho's Dhelmise, Pokermon+'s perma_h_x_mult) scales with it whichever hook runs first. */
/** (Gen 5 batch 3: Escavalier's and Durant's "X1.75 instead of X1.5" are the same card-level rule: steel_rule_x takes the best undebuffed
 *  Registeel / Durant / Escavalier, so they never stack — Registeel's X2 wins over both, and two of them give X1.75 once.) */
export function regi_h_x_mult(v, card) {
  if (!v || card.debuff || !has_enhancement(card, 'm_steel') || !G.jokers) return undefined;
  const best = steel_rule_x();
  if (!best) return undefined;
  const base = card.ability.h_x_mult || 1.5;
  return v * best / base;
}
/** The Stone / Steel card's own tooltip (engine hook enh_loc_vars, describe.js enh_live_vars): the number the two hooks above will
 *  score, from those same functions — Stone +100 (+ its banked perma_bonus) with Regirock, held Steel X2 (energized X2.1 / X2.2 / X2.3)
 *  with Registeel. No undebuffed Regi: undefined (the card's own +50 / X1.5). */
export function regi_enh_vars(vars, card) {
  const ab = card.ability, f = ab.effect === 'Stone Card' ? regi_chip_bonus : ab.effect === 'Steel Card' ? regi_h_x_mult : ab.effect === 'Glass Card' ? glass_x_mult : null;
  const v = f ? f(vars[0], card) : undefined;
  return v === undefined ? undefined : [v, ...vars.slice(1)];
}
const regi_tips = (self, info_queue, card, enh) => { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS[enh]); };
/** Burmy's cloaks (the owner's design): the Pokermon type each one's card shows (Gen 4 sheet: Plant Grass, Sandy Earth, Trash Metal;
 *  pokermon_art_type reads all six Burmy / Wormadam cells so) and the colour of its pop-up. */
export const BURMY_CLOAKS = {
  plant: { ptype: 'Grass', name: 'Plant', colour: '#289830' },
  sandy: { ptype: 'Earth', name: 'Sandy', colour: '#e97333' },
  trash: { ptype: 'Metal', name: 'Trash', colour: '#888080' },
};
/** The cloak pile a card's enhancement (its center key) adds to: Stone Sandy, Steel Trash, unenhanced or any other enhancement Plant. */
const cloak_for = (k) => (k === 'm_stone' ? 'sandy' : k === 'm_steel' ? 'trash' : 'plant');
/** Cloak (the owner's ruling, contentRev 41): the full deck in three piles by each card's own enhancement (its center; quantum
 *  enhancements don't count): Sandy = Stone cards, Trash = Steel cards, Plant = every other card (unenhanced, Glass, Gold, Lucky,
 *  Bonus, Mult, Wild, Seed, Flower, Hazard, any mod's). The biggest pile is the cloak (22 Stone lose to 20 unenhanced + 10 Glass:
 *  Plant 30). A tie for the biggest keeps `current`; an empty deck keeps it too. */
export function cloak_of_deck(cards, current) {
  const n = { plant: 0, sandy: 0, trash: 0 };
  for (const c of cards || []) n[cloak_for((c.config && c.config.center && c.config.center.key) || 'c_base')]++;
  const top = Math.max(n.plant, n.sandy, n.trash);
  if (!top) return current;
  const best = Object.keys(n).filter((k) => n[k] === top);
  return best.length === 1 ? best[0] : current;
}
/** Burmy / Wormadam put a cloak on: its own Pokermon type (ability.extra.ptype) becomes the cloak's, as Castform's form does —
 *  unless a Tera sticker owns the type (the sticker still decides, as on any joker). The debuff and Kecleons are re-read. */
function set_cloak(card, cloak) {
  const ex = card.ability.extra, c = BURMY_CLOAKS[cloak] || BURMY_CLOAKS.plant;
  const ptype = type_sticker_applied(card) ? ex.ptype : c.ptype;
  const changed = ex.form !== cloak || ex.ptype !== ptype;
  ex.form = cloak;
  ex.ptype = ptype;
  if (!changed) return;
  card.set_debuff();
  sync_kecleons();
}
// A Burmy evolving into Wormadam keeps its cloak (ability.extra.form, one of the values every evolution keeps): the cloak's type
// lands on the new card once the kept values are restored (the POST_EVOLVE seam). A Mothim has no cloak.
POST_EVOLVE.push((card, from, to) => { if (from === 'j_poke_burmy' && to === 'j_poke_wormadam') set_cloak(card, card.ability.extra.form); });
/** Mothim's Free Flight counts these enhancements: the 8 vanilla ones and Pokermon's Seed and Flower (not Hazard: a cost, not
 *  an enhancement anyone builds toward; not the April Fools Ludicolo). */
export const MOTHIM_ENHANCEMENTS = ['m_bonus', 'm_mult', 'm_wild', 'm_glass', 'm_steel', 'm_stone', 'm_gold', 'm_lucky', 'm_poke_seed', 'm_poke_flower'];
/** The different enhancements (of MOTHIM_ENHANCEMENTS) the full deck holds, by each card's own enhancement. */
export const distinct_enhancements = (cards) => new Set((cards || []).map((c) => c.config && c.config.center && c.config.center.key).filter((k) => MOTHIM_ENHANCEMENTS.includes(k))).size;
const free_flight_x = (card) => r3(1 + card.ability.extra.Xmult_mod * distinct_enhancements(G.playing_cards));
// the gender signs (m6x11plus draws both since tools/micatro/add_gender_glyphs.py; before it, the text spelt Female / Male)
const gender_name = (g) => (g === 'male' ? '♂' : '♀');

// ------------------------------------------------------------ the weather trio (Kyogre / Groudon / Rayquaza) and the Eon duo (Latias / Latios)
/** Undebuffed owned jokers of this design (a debuffed one does nothing; a Blueprint copy has its own key, so it never counts). */
const legends = (name) => ((G.jokers && G.jokers.cards) || []).filter((j) => !j.debuff && j.config.center.key === 'j_poke_' + name);
/** Primal Clash's count of the cards held: Castform's Forecast rules (forecast above) for its two sides — Hearts + Diamonds ("red")
 *  vs Clubs; a Wild card counts for both; a debuffed card, a Stone card or a Hazard (no suit: is_suit) for neither. Spades don't count. */
export function clash_count(cards) {
  let red = 0, clubs = 0;
  for (const c of cards) {
    if (c.is_suit('Hearts') || c.is_suit('Diamonds')) red += 1;
    if (c.is_suit('Clubs')) clubs += 1;
  }
  return { red, clubs };
}
/** The round's weather, read ONCE on the round's first deal by whichever of Kyogre / Groudon / Castform reads first (their first_deal),
 *  so Castform sees the same weather wherever it sits: G.GAME.poke_primal = {round, kyogre, groudon, rayquaza, winner, tie, red, clubs}.
 *  Primal Clash: with an undebuffed Kyogre AND Groudon and no Rayquaza, the side with more cards held wins the whole round (Clubs:
 *  Kyogre; Hearts + Diamonds: Groudon); a tie goes to the one with more Energy (its best copy's), still tied Kyogre. The loser's own
 *  +1 hand / +1 discard is taken back for that round (primal_take_back). Delta Stream (Rayquaza held): no clash, winner null. */
export function primal_read() {
  const GM = G.GAME;
  if (GM.poke_primal && GM.poke_primal.round === GM.round) return GM.poke_primal;
  const ky = legends('kyogre'), gr = legends('groudon'), ray = legends('rayquaza').length > 0;
  const { red, clubs } = clash_count(G.hand.cards);
  let winner = null, tie = false;
  if (ky.length && gr.length && !ray) {
    if (clubs !== red) winner = clubs > red ? 'kyogre' : 'groudon';
    else {
      tie = true;
      const ek = Math.max(...ky.map(get_total_energy)), eg = Math.max(...gr.map(get_total_energy));
      winner = eg > ek ? 'groudon' : 'kyogre';
    }
  }
  GM.poke_primal = { round: GM.round, kyogre: ky.length > 0, groudon: gr.length > 0, rayquaza: ray, winner, tie, red, clubs };
  if (winner) {
    for (const j of winner === 'kyogre' ? gr : ky) primal_take_back(j);
    const w = (winner === 'kyogre' ? ky : gr)[0];
    card_eval_status_text(w, 'extra', null, null, null, { message: winner === 'kyogre' ? 'Primordial Sea!' : 'Desolate Land!', colour: winner === 'kyogre' ? '#6169ff' : '#f48e62' });
  }
  return GM.poke_primal;
}
/** Is this Kyogre / Groudon working right now? Only the round's clash loser isn't (out of a round — the shop — every one is). */
export function primal_on(card) {
  const GM = G.GAME, P = GM && GM.poke_primal;
  if (!P || !P.winner || !GM.facing_blind || P.round !== GM.round) return true;
  return 'j_poke_' + P.winner === card.config.center.key;
}
/** The clash loser's +1 hand (Kyogre) / +1 discard (Groudon) doesn't apply this round: take back what it gave (once a round; never below
 *  1 hand / 0 discards). primal_taken remembers how much, so selling it this round doesn't take it twice. */
function primal_take_back(j) {
  const ex = j.ability.extra, cr = G.GAME.current_round;
  if (ex.primal_off === G.GAME.round) return;
  ex.primal_off = G.GAME.round;
  const n = ex.hands ? Math.max(0, Math.min(cr.hands_left - 1, ex.hands)) : Math.max(0, Math.min(cr.discards_left, ex.d_size || 0));
  ex.primal_taken = n;
  if (n > 0) { if (ex.hands) ease_hands_played(-n); else ease_discard(-n); }
  card_eval_status_text(j, 'extra', null, null, null, { message: localize('k_nope_ex'), colour: 'inactive' });
}
/** Kyogre's +hands / Groudon's +d_size each round (the Squirtle / Charmander pairs), except while it is the round's clash loser:
 *  bought (or made) then, it gives nothing this round; sold then, it takes back only what is still given. */
const primal_bonus = (field) => {
  const give = (n) => (field === 'hands' ? ease_hands_played(n) : ease_discard(n));
  const reset = (n) => { if (field === 'hands') G.GAME.round_resets.hands += n; else G.GAME.round_resets.discards += n; };
  return {
    add_to_deck(self, card, from_debuff) {
      const ex = card.ability.extra, n = ex[field];
      reset(n);
      if (from_debuff) return;
      if (!primal_on(card)) { ex.primal_off = G.GAME.round; ex.primal_taken = n; return; }
      give(n);
    },
    remove_from_deck(self, card) {
      const ex = card.ability.extra, n = ex[field], cr = G.GAME.current_round;
      reset(-n);
      const still = ex.primal_off === G.GAME.round && G.GAME.facing_blind ? n - (ex.primal_taken || 0) : n;
      const dec = field === 'hands' ? Math.min(cr.hands_left - 1, still) : Math.min(cr.discards_left, still);
      if (dec > 0) give(-dec);
    },
  };
};
/** Castform's weather lock (its Forecast, first deal): Kyogre held -> Rainy, Groudon -> Sunny; both (the clash) -> the winner's.
 *  Rayquaza (Delta Stream, the weather calmed) -> no lock: Castform reads the normal forecast. null: no lock. */
export function castform_lock() {
  const P = primal_read();
  if (P.rayquaza) return null;
  if (P.winner) return P.winner === 'kyogre' ? 'rainy' : 'sunny';
  return P.kyogre ? 'rainy' : P.groudon ? 'sunny' : null;
}
/** The tooltip's clash line for Kyogre / Groudon. */
function clash_state(partner) {
  if (legends('rayquaza').length) return 'calmed by Rayquaza';
  if (!legends(partner).length) return 'no ' + partner[0].toUpperCase() + partner.slice(1);
  const GM = G.GAME, P = GM.poke_primal;
  if (!GM.facing_blind || !P || P.round !== GM.round || !P.winner) return 'read on the next first deal';
  return (P.winner === 'kyogre' ? 'Kyogre' : 'Groudon') + "'s round" + (P.tie ? ', a tie' : '') + ' (' + P.clubs + ' Clubs, ' + P.red + ' red)';
}
/** Rayquaza, Delta Stream (contentRev 59): +hands hand and +d_size discard each round (Kyogre's and Groudon's gifts together;
 *  Accelgor's hands_discards pair). `delta_on` remembers that this card gave them, so one obtained on the old rules (a resumed pre-r59
 *  run: it gave nothing) never takes back what it never gave; such a Rayquaza starts giving them when the next Blind is selected
 *  (delta_wake, live rules). Fixed numbers (energy-inert names). */
const delta_stream = {
  add_to_deck(self, card, from_debuff) {
    if (!solo59()) return;
    card.ability.extra.delta_on = true;
    hands_discards.add_to_deck(self, card, from_debuff);
  },
  remove_from_deck(self, card, from_debuff) {
    if (!card.ability.extra.delta_on) return;
    card.ability.extra.delta_on = false;
    hands_discards.remove_from_deck(self, card, from_debuff);
  },
};
function delta_wake(card, context) {
  if (context.setting_blind && !context.blueprint && solo59() && !card.ability.extra.delta_on) delta_stream.add_to_deck(null, card, false);
}
/** Rayquaza, Dragon Ascent: the played hand contains a Straight or a Flush (a Straight Flush is one hand: it grows once). */
const ascends = (context) => !!context.poker_hands && ((context.poker_hands.Straight || []).length > 0 || (context.poker_hands.Flush || []).length > 0);
/** Latias / Latios: the banked X (`eon_Xmult`, in no energy field: what is banked keeps its worth), each gain `Xmult_mod` (Energy +20%).
 *  Soul Dew (contentRev 59, solo): the OTHER kind (Latias: a Planet; Latios: a Tarot) grows it by half (0.5 x Xmult_mod, so one energy
 *  field scales both). Before r59: with the partner held (undebuffed; find_card) every Tarot OR Planet grew both by the full gain.
 *  Not Blueprint (it copies the X only). */
const soul_dew = (partner) => !!(G.jokers && find_card('j_poke_' + partner).length > 0);
const eon_half = (card) => r9(card.ability.extra.Xmult_mod / 2);
function eon(card, context, own, partner) {
  const ex = card.ability.extra;
  if (context.using_consumeable && !context.blueprint && context.consumeable) {
    const set = context.consumeable.ability.set, other = own === 'Tarot' ? 'Planet' : 'Tarot';
    const gain = set === own ? ex.Xmult_mod : set !== other ? 0 : solo59() ? eon_half(card) : soul_dew(partner) ? ex.Xmult_mod : 0;
    if (gain > 0) {
      ex.eon_Xmult = r3(ex.eon_Xmult + gain);
      card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'XMULT' });
    }
    return undefined;
  }
  if (context.joker_main && ex.eon_Xmult > 1) return { message: a_xmult(r3(ex.eon_Xmult)), colour: 'XMULT', Xmult_mod: ex.eon_Xmult };
  return undefined;
}

// ------------------------------------------------------------ the owner's Cherubi line (Cherubi -> Cherrim): Seeds and the sun
/** Sweet Seeds: when a Blind is selected, ONE random unenhanced card of the full deck (G.playing_cards, the run's seeded
 *  pseudorandom_element) becomes a Seed card; none unenhanced, nothing (it never overwrites). Blueprint copies it (as Marble Joker). */
function sweet_seeds(card, context) {
  if (!context.setting_blind || card.getting_sliced || (context.blueprint_card && context.blueprint_card.getting_sliced)) return;
  const plain = (G.playing_cards || []).filter((c) => unbroken(c) && c.config.center.key === 'c_base');
  if (!plain.length) return;
  const [pick] = pseudorandom_element(plain, pseudoseed('poke_cherubi_seeds'));
  pick.set_ability(P_CENTERS.m_poke_seed, null, true);
  G.E_MANAGER.add_event(() => { pick.juice_up(); });
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: '+1 Seed', colour: 'GREEN' });
}
/** ... and +1 growth level while owned (Shiftry's `growth`: G.GAME.poke_growth_level, read by the Seed card itself), so a scored Seed
 *  grows 2 a score and blooms in 3 scores instead of 5. Off while debuffed (SMODS removes / re-adds a debuffed joker), carried across
 *  the evolution (set_ability removes Cherubi's, adds Cherrim's). Copies stack, like Shiftry + Brambleghast. */
const sweet_growth = {
  add_to_deck(self, card) { poke_change_growth_level(card.ability.extra.growth); },
  remove_from_deck(self, card) { poke_change_growth_level(-card.ability.extra.growth); },
};
/** Is it sunny for Cherrim? (a) the round's FIRST deal read red: Castform's own forecast() (Hearts + Diamonds vs Clubs vs Spades,
 *  a tie is not sunny), remembered for the round (`sun_round`); or (b) Desolate Land: an undebuffed Groudon is held and working (not
 *  the loser of a Primal Clash this round: primal_on). Rayquaza's Delta Stream keeps Groudon working, so Groudon still means sun
 *  (Rayquaza only un-locks CASTFORM's weather). (b) is live: a Groudon gained or sold mid-round changes it at once. Out of a round
 *  (the shop) only (b) counts. (c) An undebuffed Volcarona held (Gen 5 batch 3: it is always sunny; live, in the shop too). */
const desolate_sun = () => legends('groudon').some((j) => primal_on(j));
export function cherrim_sunny(card) {
  const ex = card.ability.extra, GM = G.GAME;
  return !!((GM && GM.facing_blind && ex.sun_round === GM.round) || desolate_sun() || volcarona_sun());
}
const cherrim_form = (card) => (cherrim_sunny(card) ? 'sunshine' : 'overcast');
const seed_tips = (self, info_queue, card) => {
  type_tooltip(self, info_queue, card);
  info_queue.push(P_CENTERS.m_poke_seed);
  info_queue.push({ set: 'Other', key: 'growth_level' });
};
// ------------------------------------------------------------ Chatot (Vocabulary / New Word)
// The run's played-hand records: G.GAME.hands[h].played is the run's count for that poker hand (run.js evaluate_play adds 1 before
// the jokers' `before` pass; it never resets during a run), so it counts every hand type played this run, from before Chatot was
// bought too, secret hands (Five of a Kind, Flush House, Flush Five) and add-on hands included. The hand being played counts at once.
const vocabulary = () => Object.values((G.GAME && G.GAME.hands) || {}).filter((h) => h && h.played > 0).length;
const vocab_mult = (card) => r3(card.ability.extra.mult * vocabulary());
/** New Word: in `before`, a hand whose run count just became 1 (its first play this run) creates its Planet, with consumable room
 *  (the Blue Seal's buffer check). `new_words` (on the joker) names the hand types this Chatot already granted, so it never grants
 *  twice for one type (a joker retrigger re-running `before`, a mod resetting a count); a hand first played while no Chatot was held
 *  is never granted later (its count is past 1). Not Blueprint (Blueprint copies the Mult). A debuffed hand (The Psychic...) has no
 *  `before` pass, so its first play grants nothing. */
function new_word(card, context) {
  if (!(context.before && context.cardarea === G.jokers) || context.blueprint) return;
  const name = context.scoring_name, h = name && G.GAME.hands[name];
  const ex = card.ability.extra;
  ex.new_words = ex.new_words || {};
  if (!h || h.played !== 1 || ex.new_words[name]) return;
  const planet = (P_CENTER_POOLS.Planet || []).find((p) => p.config && p.config.hand_type === name);
  if (!planet || G.consumeables.cards.length + G.GAME.consumeable_buffer >= G.consumeables.config.card_limit) return;
  ex.new_words[name] = true;
  G.GAME.consumeable_buffer += 1;
  G.E_MANAGER.add_event(() => {
    const c = create_card('Planet', G.consumeables, null, null, null, null, planet.key, 'chatot');
    c.add_to_deck();
    G.consumeables.emplace(c);
    G.GAME.consumeable_buffer = 0;
  });
  card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_plus_planet'), colour: 'Planet' });
}

// ------------------------------------------------------------ Pachirisu (Quick Spark / Nuzzle / Cheek Pouch)
// A Lightning Joker: Pokermon's is_type (its ptype, a Tera sticker, an add-on's IS_TYPE_RULES), not debuffed (the Barboach / Starly
// count with one type).
const sparky = (j) => !j.debuff && is_type(j, 'Lightning');
const spark_others = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && sparky(j)).length;
const spark_x = (card) => r3(card.ability.extra.Xmult + card.ability.extra.Xmult_mod * spark_others(card));
const pouch_money = (card) => card.ability.extra.pouch * (spark_others(card) + 1);
/** Quick Spark: on the round's first hand (current_round.hands_played is 0 while it scores). The tooltip names its state. */
const spark_on = () => !!(G.GAME && G.GAME.current_round && G.GAME.current_round.hands_played === 0);
const spark_state = () => (G.GAME && G.GAME.facing_blind && !spark_on() ? 'Used this round' : 'Active!');
// The owner's Shellos line (Tide Pool / Tide / Storm Drain / Two Seas): each card's sea (ability.extra.form, 'west' or 'east') is rolled
// ONCE when the card is created (set_ability initial, the run's seeded RNG), so a save / resume — which rebuilds the run from its
// recipe — gives it back the same sea; `form` is one of the values every evolution keeps (systems/evolution.js NAMES_TO_KEEP).
export const SEAS = { west: { name: 'West Sea', end: 'leftmost' }, east: { name: 'East Sea', end: 'rightmost' } };
const SEA_LINE = ['j_poke_shellos', 'j_poke_gastrodon'];
const sea_of = (card) => (SEAS[card.ability.extra.form] ? card.ability.extra.form : 'east');
/** The seas held: every undebuffed Shellos / Gastrodon in the joker row (a Blueprint copying one is not one). */
const seas_held = () => new Set(((G.jokers && G.jokers.cards) || []).filter((j) => !j.debuff && SEA_LINE.includes(j.config.center.key)).map(sea_of));
/** Two Seas: a West AND an East Shellos / Gastrodon held (any mix, undebuffed). */
export const two_seas = () => { const s = seas_held(); return s.has('west') && s.has('east'); };
/** The seas this card works on: its own, or both under Two Seas. */
const seas_for = (card) => (two_seas() ? ['west', 'east'] : [sea_of(card)]);
/** The scored card this sea names: the leftmost (West) or the rightmost (East) of the scoring hand, by position (a debuffed one there
 *  scores nothing: the end never shifts inward). A 1-card hand's card is both ends, and still counts once. */
const sea_end = (context, sea) => { const s = context.scoring_hand || []; return s.length ? (sea === 'west' ? s[0] : s[s.length - 1]) : undefined; };
const at_sea_end = (card, context, c) => seas_for(card).some((sea) => sea_end(context, sea) === c);
const sea_ends_text = (card) => (two_seas_text(card) === 'active' ? 'leftmost and rightmost scored cards' : SEAS[sea_of(card)].end + ' scored card');
const two_seas_text = (card) => {
  const s = seas_held(); // (+ its own sea: a shop card says what it would be once bought)
  s.add(sea_of(card));
  if (s.has('west') && s.has('east')) return 'active';
  return s.has('west') ? 'needs an East Sea' : 'needs a West Sea';
};
/** Tide Pool / Tide: the sea's end card gives +chips each time it scores (Gastrodon's retrigger scores it again, so again). */
function tide_chips(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && at_sea_end(card, context, context.other_card)) return { chips: card.ability.extra.chips, card };
  return undefined;
}
/** Storm Drain: each Energy card used (the Energy set — the 12 type Energies and Bird Energy, the cards Porygon-Z counts — on any
 *  joker, or none) banks Xmult_mod, twice that for Water Energy (one energy field scales both, the ratio holds). Not Blueprint. */
const storm_gain = (ex, consumeable) => (consumeable.config.center.key === 'c_poke_water_energy' ? 2 : 1) * ex.Xmult_mod;


// ---------------------------------------------------------------- the owner's Glameow line: Fickle + Thick Fat
// Fickle: a favourite suit per joker, held on the ABILITY (card.ability.fav_suit, not in extra), so it survives the evolution's
// set_ability (Steamodded keeps the ability fields the new center doesn't set) with no keep-list. It is picked when the joker is first
// obtained (add_to_deck, when none is set yet: an evolving card keeps its own) and again at each end of round, Ancient Joker's pick
// (core.js reset_ancient_card): the run's seeded pseudorandom_element over the four suits minus the current favourite, seeded by the
// ante ('fickle' + ante). Never on creation (a shop / collection card would draw from the run's seed outside the recipe), so the shop
// card reads "(Favourite: picked when obtained)". Wild cards and Smeared Joker count through is_suit.
const FICKLE_SUITS = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
function fickle_pick(card) {
  const suits = FICKLE_SUITS.filter((s) => s !== card.ability.fav_suit);
  card.ability.fav_suit = pseudorandom_element(suits, pseudoseed('fickle' + G.GAME.round_resets.ante))[0];
  return card.ability.fav_suit;
}
const fav_scored = (card, context) => !!(card.ability.fav_suit && context.individual && context.cardarea === G.play && !context.end_of_round
  && context.other_card.is_suit(card.ability.fav_suit));
const fav_vars = (card) => (card.ability.fav_suit ? localize(card.ability.fav_suit, 'suits_plural') : 'picked when obtained');
const fav_colour = (card) => [card.ability.fav_suit || 'inactive'];
function fickle(card, context) {
  if (round_end(context) && !context.blueprint) {
    const s = fickle_pick(card);
    card_eval_status_text(card, 'extra', null, null, null, { message: localize(s, 'suits_plural') + '!', colour: 'FILTER' });
  }
}
// Thick Fat: -1 Joker slot while held (G.jokers.config.card_limit, as Banette's +1), paid in add_to_deck and refunded in
// remove_from_deck (sold, destroyed, or turned into another joker). Kept while DEBUFFED, as vanilla keeps a Negative's slot
// (queue_negative_removal): a debuff gives no slot back, so lifting it can never put the jokers over the limit; a debuffed Purugly
// that is sold / destroyed is refunded by the card_removed hook (index.js -> slot_cost_removed). A Negative Purugly nets 0 (its +1).
export function slot_cost_add(card, from_debuff) {
  if (!from_debuff) G.jokers.config.card_limit -= card.ability.extra.slot_cost;
  card.ability.poke_slot_queued = undefined;
}
export function slot_cost_remove(card, from_debuff) {
  if (from_debuff) { card.ability.poke_slot_queued = card.ability.extra.slot_cost; return; }
  G.jokers.config.card_limit += card.ability.extra.slot_cost;
}
/** index.js card_removed: a DEBUFFED Purugly leaving (its remove_from_deck already ran on the debuff) gives its slot back. */
export function slot_cost_removed(card) {
  if (card.ability && card.ability.poke_slot_queued && !card.added_to_deck && G.jokers) {
    G.jokers.config.card_limit += card.ability.poke_slot_queued;
    card.ability.poke_slot_queued = undefined;
  }
}
// The evolution waits for room: Purugly's -1 slot must not put the jokers over the limit (owner: never push a joker out). Room =
// a free slot now (cards + pending creations < limit), so after the -1 every joker still fits. A Glameow whose countdown ends without
// room stays at 0 rounds and evolves at the first end of round with a free slot. Committing reserves the slot in G.GAME.joker_buffer
// (as Riff-raff does) until the queued evolution has landed, so two Glameows ready in one round never both take the last slot.
const slot_room = () => G.jokers.cards.length + (G.GAME.joker_buffer || 0) < G.jokers.config.card_limit;
function glameow_evo(self, card, context) {
  const ex = card.ability.extra;
  if (!can_evolve(self, card, context, 'j_poke_purugly') || card.debuff || ex.rounds === undefined || ex.rounds > 1) return level_evo(self, card, context, 'j_poke_purugly');
  if (!slot_room()) {
    ex.rounds = 0;
    card_eval_status_text(card, 'extra', null, null, null, { message: 'Needs a slot!', colour: 'FILTER' });
    return undefined;
  }
  G.GAME.joker_buffer = (G.GAME.joker_buffer || 0) + 1;
  const r = level_evo(self, card, context, 'j_poke_purugly');
  G.E_MANAGER.add_event(() => { G.GAME.joker_buffer = Math.max(0, (G.GAME.joker_buffer || 0) - 1); });
  return r;
}

// ---------------------------------------------------------------- Poison Gas (the owner's Stunky line): poisoning the Blind
// One record per Blind, shared by every copy (G.GAME.poke_poison, keyed by G.GAME.round, so a new Blind starts clean): `base` the
// starting requirement, `cut` the chips taken off so far. It is captured on the round's first deal (after every setting_blind effect:
// The Wall's x4 / Violet Vessel's x6 base, a Chicot-disabled Wall's half), or lazily by the first drop (a Stunky that arrived mid-round).
// The state lives in G.GAME and the run is rebuilt from its recipe on resume / replay, so the lowered requirement comes back exactly.
export const POISON_CAP = 75; // % of the starting requirement: the most all copies together can take off one Blind
export function poison_state(create) {
  const s = G.GAME && G.GAME.poke_poison;
  if (s && s.round === G.GAME.round) return s;
  if (!create) return null;
  return (G.GAME.poke_poison = { round: G.GAME.round, base: G.GAME.blind.chips, cut: 0 });
}
/** The share (%) of this Blind's starting requirement taken off so far (0 outside a Blind). */
export function poison_taken() {
  const s = G.GAME && G.GAME.facing_blind ? poison_state(false) : null;
  return s && BN.gt(s.base, 0) ? r3(BN.toNumber(BN.div(BN.mul(s.cut, 100), s.base))) : 0;
}
/** The drop after the nth hand: Stunky n = 1 (a flat step), Skuntank n = the round's hand number (escalating). */
const poison_step = (card, n) => r3(card.ability.extra.poison_pct * n);
const poison_capture = (context) => { if (context.first_hand_drawn && !context.blueprint && G.GAME.facing_blind) poison_state(true); };
// After each hand (context.after, which Blueprint copies): queued, so it runs once this hand's chips have been added and the round's hand
// count has gone up, and before the engine's post-hand check (STATES.HAND_PLAYED). It first does that check itself: a hand that already
// beat the Blind, or the round's final hand (no later hand to help), gets nothing, so the drop never wins the hand that scored. Otherwise
// the requirement drops (capped at POISON_CAP% of the base in all, never below 1 chip), and if it is now at or below the chips already
// scored, the engine's check right after ends the Blind as won (the same check that ends a Blind Chicot / Luchador disables).
function poison_gas(card, context, escalating) {
  poison_capture(context);
  if (!context.after || context.cardarea !== G.jokers || context.retrigger_joker) return undefined;
  const by = context.blueprint_card || card;
  G.E_MANAGER.add_event(() => {
    const cr = G.GAME.current_round, b = G.GAME.blind;
    if (!G.GAME.facing_blind || !b || BN.beats(G.GAME.chips, b.chips) || cr.hands_left < 1) return;
    const s = poison_state(true);
    const pct = poison_step(card, escalating ? cr.hands_played : 1);
    const room = BN.sub(BN.floor(BN.div(BN.mul(s.base, POISON_CAP), 100)), s.cut);
    const drop = BN.min(BN.min(BN.floor(BN.div(BN.mul(s.base, pct), 100)), room), BN.sub(b.chips, 1));
    if (!BN.gt(drop, 0)) return;
    b.chips = BN.sub(b.chips, drop);
    b.chip_text = number_format(b.chips);
    s.cut = BN.add(s.cut, drop);
    emit('blind', { action: 'chips', key: b.config && b.config.blind && b.config.blind.key, chips: BN.toJSONValue(b.chips), chip_text: b.chip_text });
    card_eval_status_text(by, 'extra', null, null, null, { message: '-' + pct + '%', colour: 'PURPLE' });
  });
  return undefined;
}

// ---------------------------------------------------------------- Bite / Treasure Nest / Dragon Rush (the owner's Gible line)
// Bite -> hoard -> cash in. The bank is `bite_mult` (in no energy_values: a banked Mult keeps what it was worth when earned, so Energy is
// never retroactive; carried through both evolutions by poke_custom_values_to_keep); the gain per scored card is `mult_mod` (+20% of
// base per Energy: 1 -> 1.2 / 1.4 / 1.6). A hand "contains a Pair" when the engine's poker_hands['Pair'] is non-empty (Lua next()): Pair,
// Two Pair, Three of a Kind, Full House, Four of a Kind and the secret hands built on them. "Scored cards" are the scoring hand's cards
// that aren't debuffed (a debuffed card doesn't score). Not Blueprint (it scales); Blueprint copies the banked Mult.
const hand_has = (context, name) => !!(context.poker_hands && context.poker_hands[name] && context.poker_hands[name].length);
function bite(card, context) {
  const ex = card.ability.extra;
  if (context.before && context.cardarea === G.jokers && !context.blueprint && !context.retrigger_joker && hand_has(context, 'Pair')) {
    const n = (context.scoring_hand || []).filter((c) => !c.debuff).length;
    if (n > 0) {
      let gained = 0;
      scale_card(card, {
        ref_value: 'bite_mult', scalar_value: 'mult_mod', scalar_factor: n, no_message: true,
        operation: (t, k, v, change) => { t[k] = r3(v + change); gained = change; },
      });
      return { message: a_mult(r3(gained)), colour: 'MULT', card };
    }
  }
  if (context.joker_main && ex.bite_mult > 0) return { message: a_mult(r3(ex.bite_mult)), colour: 'MULT', mult_mod: ex.bite_mult };
  return undefined;
}
/** Gold cards in the FULL deck (G.playing_cards; any Gold card, not only the ones Gabite made; has_enhancement, so a quantum Gold counts). */
export const gold_in_deck = () => (G.playing_cards || []).filter((c) => has_enhancement(c, 'm_gold')).length;
/** Gold cards held in hand that aren't debuffed (a debuffed Gold card counts for nothing). */
export const gold_held = () => ((G.hand && G.hand.cards) || []).filter((c) => has_enhancement(c, 'm_gold') && !c.debuff).length;
/** Gabite, Treasure Nest: when a hand containing a Full House scores (poker_hands['Full House']: a Flush House too), ONE of its scored
 *  cards becomes a Gold card, in context.after (once the hand has scored, so the card scored as what it was; Midas Mask's set_ability
 *  call). The pick: the run's seeded pseudorandom_element ('gabite_nest') over the scored cards that aren't debuffed, already Gold, or
 *  being destroyed (a shattered Glass card); UNENHANCED ones first, and only when none is left any other non-Gold one (it overwrites that
 *  enhancement, keeping seal and edition, as the Regis' conversion does). None eligible: nothing. One card a hand, fixed (no Energy).
 *  Not Blueprint (Blueprint copies the bank only). */
function treasure_nest(card, context) {
  if (!context.after || context.cardarea !== G.jokers || context.blueprint || context.retrigger_joker || !hand_has(context, 'Full House')) return undefined;
  const pool = (context.scoring_hand || []).filter((c) => !c.debuff && !c.shattered && !c.destroyed && !has_enhancement(c, 'm_gold'));
  if (!pool.length) return undefined;
  const plain = pool.filter((c) => c.config.center === P_CENTERS.c_base);
  const [pick] = pseudorandom_element(plain.length ? plain : pool, pseudoseed('gabite_nest'));
  if (!pick) return undefined;
  pick.set_ability(P_CENTERS.m_gold, null, true);
  G.E_MANAGER.add_event(() => { pick.juice_up(); });
  card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_gold'), colour: 'MONEY' });
  return undefined;
}
/** Garchomp, Dragon Rush: X(1 + Xmult_mod per undebuffed Gold card held in hand). */
const dragon_rush_x = (card) => r3(1 + card.ability.extra.Xmult_mod * gold_held());

// ------------------------------------------------------------ the last Gen 4 regulars (contentRev 44)
/** Hippopotas / Hippowdon, Sand Stream: a scored Stone card gives +chips EXTRA (a joker effect on top of the Stone card's own +50, or
 *  Regirock's +100 instead: the two stack). Any card that counts as Stone (has_enhancement: quantum too); debuffed cards never score.
 *  Blueprint copies it; a Red Seal / Mime retrigger repeats it. */
function sand_stream(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && has_enhancement(context.other_card, 'm_stone')) {
    return { chips: card.ability.extra.chips, card };
  }
  return undefined;
}
/** Hippowdon, Sand Stream: on the round's FIRST deal (Castform's moment, first_deal: every card is in hand), 1 random UNENHANCED card
 *  held in hand becomes a Stone card (Midas Mask's set_ability; seal and edition kept). The run's seeded pseudorandom_element
 *  ('hippowdon_sand'); none unenhanced: nothing (it never overwrites another enhancement). Once a round (sand_round), fixed (no Energy
 *  field), not Blueprint. */
function sand_stone(card, context) {
  if (!first_deal(card, context, 'sand_round')) return;
  card.ability.extra.sand_round = G.GAME.round;
  const pool = G.hand.cards.filter((c) => c.config.center === P_CENTERS.c_base && !c.destroyed && !c.shattered && !c.removed);
  if (!pool.length) return;
  const [pick] = pseudorandom_element(pool, pseudoseed('hippowdon_sand'));
  pick.set_ability(P_CENTERS.m_stone, null, true);
  G.E_MANAGER.add_event(() => { pick.juice_up(); });
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Sand Stream!', colour: '#e1c019' });
}
/** Skorupi / Drapion, Sniper: each scored card rolls num in dem (Pokermon's probability helpers: Oops! / Venonat raise it, Absol fixes it
 *  at 0) to CRIT for X Xmult_multi; Drapion's Lucky cards (always_crit: any card counting as Lucky) crit with no roll, so Absol never
 *  stops them. Each retrigger rolls again. Blueprint copies it (its own roll). */
function sniper(card, context, seed) {
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round)) return undefined;
  const ex = card.ability.extra;
  const crit = (ex.always_crit && has_enhancement(context.other_card, 'm_lucky')) || pseudorandom_probability(card, seed, ex.num, ex.dem, seed);
  return crit ? { x_mult: ex.Xmult_multi, card } : undefined;
}
const sniper_vars = (card, seed) => { const ex = card.ability.extra; const [num, dem] = get_probability_vars(card, ex.num, ex.dem, seed); return [num, dem, r3(ex.Xmult_multi)]; };
/** Carnivine, Flytrap: the round's FIRST player discard (pre_discard, not an effect's `hook` discard, discards_used 0; once a round:
 *  devour_round) marks its leftmost card (the discard's own order: hand position); in that card's discard pass the joker returns
 *  { remove: true }, so the engine destroys it like Trading Card / Entei / Magmar do — dissolved (a Glass card shatters), and every
 *  joker's remove_playing_cards runs (Hydreigon, Cacnea, Kingambit, Spiritomb... count it as a destroyed card). Each devour banks +mult_mod
 *  Mult (`devour_mult`, no energy field: never retroactive). Not Blueprint, once even under a joker retrigger (the mark is cleared). */
function flytrap(card, context) {
  const ex = card.ability.extra;
  if (context.pre_discard && !context.hook && !context.blueprint && !context.retrigger_joker && context.full_hand && context.full_hand.length
    && G.GAME.current_round.discards_used === 0 && ex.devour_round !== G.GAME.round) {
    ex.devour_round = G.GAME.round;
    context.full_hand[0].poke_devoured_by = card;
    return undefined;
  }
  if (context.discard && !context.blueprint && context.other_card && context.other_card.poke_devoured_by === card) {
    context.other_card.poke_devoured_by = undefined;
    ex.devour_mult = r3(ex.devour_mult + ex.mult_mod);
    card_eval_status_text(card, 'extra', null, null, null, { message: 'Devoured!', colour: 'MULT' });
    return { remove: true };
  }
  return undefined;
}
const flytrap_state = (card) => (G.GAME && G.GAME.facing_blind && (G.GAME.current_round.discards_used > 0 || card.ability.extra.devour_round === G.GAME.round) ? 'fed this round' : 'hungry');
/** Lumineon, Luminous: night hands (Lunatone / Solrock's cycle, is_day above); with Lunatone (owned, undebuffed: cosmic) day hands too. */
const luminous = (card) => !is_day() || cosmic(card, 'j_poke_lunatone');
// ---------------------------------------------------------------- the creation trio, Regigigas and Arceus (the owner's Gen 4 Legendaries)
/** Dialga, Roar of Time: the round's first hand (hands_played === 0 while it scores; a discard before it doesn't use it up). */
const roar_on = () => !!(G.GAME && G.GAME.current_round && G.GAME.current_round.hands_played === 0);
/** Giratina's Origin Forme (contentRev 59, solo): for good once ORIGIN_AT (10) playing cards have been destroyed while it was held
 *  (`destroyed`, counted on the card under every rules rev). Before r59: while an undebuffed Dialga or Palkia was held (find_card). */
export const ORIGIN_AT = 10;
const origin_old = () => !!(G.jokers && (find_card('j_poke_dialga').length > 0 || find_card('j_poke_palkia').length > 0));
const origin_forme = (card) => (solo59() ? (card.ability.extra.destroyed || 0) >= ORIGIN_AT : origin_old());
/** Shadow Force's gain per destroyed playing card: Xmult_mod, doubled in the Origin Forme (one energy field scales both). */
const shadow_gain = (card) => r3(card.ability.extra.Xmult_mod * (origin_forme(card) ? 2 : 1));
/** The destroyed cards, one at a time: each gains at the forme it finds, then counts (so the 10th gains Altered, the 11th Origin). */
function shadow_force(card, n) {
  const ex = card.ability.extra;
  for (let i = 0; i < n; i++) {
    ex.shadow_Xmult = r3(ex.shadow_Xmult + shadow_gain(card));
    ex.destroyed = (ex.destroyed || 0) + 1;
  }
}
/** Palkia, Spacial Rend: +slots Joker slots and +h_size hand size while held AND undebuffed. Both are given in add_to_deck and taken
 *  in remove_from_deck, from_debuff included (Juggler's hand size; unlike a Negative's slot, which vanilla keeps through a debuff):
 *  a debuff takes both away and lifting it gives both back. Nobody is ever pushed out: a debuff on a full row leaves the row one
 *  over the limit until a Joker leaves (the shop and every effect that makes a Joker need a free slot, so none can join meanwhile).
 *  Sold or destroyed it takes its own slot with it, so the row is never over the limit; a debuffed Palkia leaving gives nothing
 *  back twice (remove_from_deck already ran on the debuff). A Negative Palkia gives +2 (its edition's +1 and Spacial Rend's). */
const spacial_rend = {
  add_to_deck(self, card) { const ex = card.ability.extra; G.jokers.config.card_limit += ex.slots; G.hand.change_size(ex.h_size); },
  remove_from_deck(self, card) { const ex = card.ability.extra; G.jokers.config.card_limit -= ex.slots; G.hand.change_size(-ex.h_size); },
};
/** Regigigas, Slow Start (contentRev 59, solo): it wakes at the end of round `giga_wait` (5 rounds, 1 sooner for every 5 Stone, Glass or
 *  Steel cards in the full deck by each card's own enhancement, at least 1) of the rounds it has been held (`giga_rounds`, counted on the
 *  card under every rules rev). Read live: a deck that grows mid-wait shortens it at once. Awake is for good (`slow_start` 0). */
const GIGA_ENH = ['m_stone', 'm_glass', 'm_steel'];
export const giga_deck = () => (G.playing_cards || []).filter((c) => unbroken(c) && GIGA_ENH.includes(c.config.center.key)).length;
export const giga_wait = () => Math.max(1, 5 - Math.floor(giga_deck() / 5));
/** Creator (contentRev 59): while awake, when a Blind is selected, 1 random card of the full deck (the run's seeded stream: unenhanced
 *  cards first, else any card that isn't Stone, Glass or Steel already; none, nothing) becomes Stone, Glass or Steel (seeded too).
 *  Blueprint copies it (as the Regis' conversion). */
function giga_create(card, context) {
  if (!context.setting_blind || !solo59() || !giga_awake(card) || card.getting_sliced || (context.blueprint_card && context.blueprint_card.getting_sliced)) return;
  const live = (G.playing_cards || []).filter(unbroken);
  const plain = live.filter((c) => c.config.center.key === 'c_base');
  const pool = plain.length ? plain : live.filter((c) => !GIGA_ENH.includes(c.config.center.key));
  if (!pool.length) return;
  const [pick] = pseudorandom_element(pool, pseudoseed('regigigas'));
  const [enh] = pseudorandom_element(GIGA_ENH, pseudoseed('regigigas_enh'));
  pick.set_ability(P_CENTERS[enh], null, true);
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: '+1 ' + { m_stone: 'Stone', m_glass: 'Glass', m_steel: 'Steel' }[enh], colour: 'CHIPS' });
}
/** Regigigas before r59: the distinct Regi species held (undebuffed; two Regices count once) — each cut a round off the wait,
 *  and all three woke it at the next end of round (giga_drop). */
const regis_distinct = () => new Set(((G.jokers && G.jokers.cards) || []).filter((j) => !j.debuff && REGIS.includes(j.config.center.key)).map((j) => j.config.center.key)).size;
const giga_awake = (card) => !((card.ability.extra.slow_start || 0) > 0);
/** One end of round's cut to the Slow Start countdown `left` with `n` distinct Regis held: 1 + n, or all of it with the full trio. */
const giga_drop = (left, n) => (n >= 3 ? left : 1 + n);
/** Regi Trio + Regigigas: with all three Regis held and an awake Regigigas (undebuffed), each Regi converts 1 more card per Blind
 *  (once, however many Regigigas). */
function giga_trio_bonus(regi) {
  if (regi_others(regi) < 2) return 0;
  return ((G.jokers && G.jokers.cards) || []).some((j) => !j.debuff && j.config.center.key === 'j_poke_regigigas' && giga_awake(j)) ? 1 : 0;
}
/** Arceus, Multitype: the different types among your Jokers. Each other undebuffed joker gives its shown type (get_type: a Tera
 *  sticker, else its ptype; one of the 12); a joker that counts as every type (another Arceus, a Stellar Tera) adds one type of
 *  its own (a missing one), never all twelve; Arceus itself counts as one. At most 12. */
function multitype_count(card) {
  const seen = new Set();
  let wild = 0;
  for (const j of (G.jokers && G.jokers.cards) || []) {
    if (j === card || j.debuff) continue;
    if (multitype(j) || wildcard_type(j)) { wild++; continue; }
    const t = get_type(j);
    if (POKETYPES.includes(t)) seen.add(t);
  }
  return Math.min(POKETYPES.length, seen.size + wild + 1);
}
const multitype_x = (card) => r3(1 + card.ability.extra.Xmult_mod * multitype_count(card));

// ---------------------------------------------------------------- the Lake trio (Uxie / Mesprit / Azelf), Cresselia, Manaphy / Phione
const LAKE = ['j_poke_uxie', 'j_poke_mesprit', 'j_poke_azelf'];
/** Lake Guardians: how many OTHER Lake guardian species you have (undebuffed) — the Regi Trio's count (regi_others): distinct species, so
 *  a twin of the same guardian (Showman) is never an "other guardian", and two Mesprits count once for an Uxie. 0, 1 or 2. */
export const LAKE_CAP = 2;
export function lake_others(card) {
  // contentRev 59 (solo): each OTHER Psychic Joker (is_type: Arceus and a Psychic Tera count, a debuffed one doesn't; a twin guardian
  // is a Psychic Joker too), at most LAKE_CAP (2), the same +X per other.
  if (solo59()) return Math.min(LAKE_CAP, ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && typed_joker(j, 'Psychic')).length);
  const own = card.config.center.key, seen = new Set();
  for (const j of (G.jokers && G.jokers.cards) || []) {
    const k = j.config.center.key;
    if (j !== card && !j.debuff && k !== own && LAKE.includes(k)) seen.add(k);
  }
  return seen.size;
}
/** A guardian's X: its own field (an energy field) + `lake_mod` (0.25, in no energy field) for each other guardian. */
const lake_x = (card, field) => r3(card.ability.extra[field] + card.ability.extra.lake_mod * lake_others(card));
/** Mesprit, Emotion: the hand's poker hand had not been played yet this round. run.js evaluate_play has already counted THIS play
 *  (played_this_round is 1 on its first play of the round) before the jokers score, as Abra's "already played" (> 1) reads it. */
const first_this_round = (context) => { const h = context.scoring_name && G.GAME.hands[context.scoring_name]; return !!h && (h.played_this_round || 0) <= 1; };
/** Cresselia, Lunar Blessing (systems/rules.js set_debuff: playing cards get 'prevent_debuff' while an undebuffed Cresselia is owned).
 *  Gaining or losing it re-runs the Blind's debuff pass over every playing card (Blind:disable's own pass), queued so it runs once the
 *  card has landed / left / been debuffed: a Cresselia gained mid-Blind lifts the Boss's debuffs at once, and one sold, destroyed or
 *  debuffed mid-Blind gives them back. Outside a Blind nothing is debuffed anyway. */
function lunar_refresh() {
  G.E_MANAGER.add_event(() => {
    if (G.GAME && G.GAME.facing_blind && G.GAME.blind && G.playing_cards) for (const c of G.playing_cards) G.GAME.blind.debuff_card(c);
  });
}
/** Manaphy / Phione: a Water Joker for "each Water Joker gives": is_type (a Tera sticker counts — it replaces the type), undebuffed. */
const sea_joker = (j) => !!(j && j.ability && j.ability.set === 'Joker' && !j.debuff && is_type(j, 'Water'));
/** Water Jokers for the tooltip, itself included (+1 while it is Water: a Tera of another type takes it out), so a shop card shows what it
 *  would give once bought. */
const sea_count = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && sea_joker(j)).length + (is_type(card, 'Water') ? 1 : 0);
/** Manaphy, Egg: at the end of each shop (not Blueprint), with a free Joker slot NOW (cards + pending creations < limit, Glameow's
 *  slot_room; no slot, no roll), a 1 in 4 chance (Pokermon's pseudorandom_probability: the run's seeded stream, seed 'manaphy_egg', so
 *  Oops! All 6s raises it and Absol fixes it) to create a Phione, appended at the right end of the row. Created at once (add_card), so a
 *  second Manaphy sees the slot taken. */
function manaphy_egg(card, context) {
  if (!context.ending_shop || context.blueprint || !slot_room()) return;
  const ex = card.ability.extra;
  if (!pseudorandom_probability(card, 'manaphy_egg', ex.num, ex.dem, 'manaphy_egg')) return;
  const egg = add_card({ set: 'Joker', key: 'j_poke_phione', key_append: 'manaphy' });
  card_eval_status_text(egg, 'extra', null, null, null, { message: 'Hatched!', colour: 'BLUE' });
  card.juice_up();
}

// ---------------------------------------------------------------- Gen 5, batch 4: the Gen 5 Legendaries (contentRev 55; 638-649)
/** Held, undebuffed (find_card skips debuffed cards; a Blueprint is never one): the formes, the Tao pair and Kyurem's partner read it. */
const legend_held = (name) => !!(G.jokers && find_card('j_poke_' + name).length > 0);
/** Exact sums for scoring (X1.4375 + 0.3 stays X1.7375; r3 is for the text): float noise off, nothing else rounded. */
const r9 = (x) => Math.round(x * 1e9) / 1e9;
/** The Swords of Justice (Keldeo counts as one) and each one's suit. */
export const SWORDS = { j_poke_cobalion: 'Spades', j_poke_terrakion: 'Diamonds', j_poke_virizion: 'Clubs', j_poke_keldeo: 'Hearts' };
/** Swords of Justice: how many OTHER sword species you have (undebuffed) — the Regi Trio's distinct count (regi_others): a twin of the
 *  same sword (Showman) is never an "other sword", and two Terrakions count once for a Cobalion. 0 to 3. */
export function sword_others(card) {
  const own = card.config.center.key, seen = new Set();
  for (const j of (G.jokers && G.jokers.cards) || []) {
    const k = j.config.center.key;
    if (j !== card && !j.debuff && k !== own && SWORDS[k]) seen.add(k);
  }
  return seen.size;
}
/** Keldeo's Resolute Form (contentRev 59, solo): for good once RESOLUTE_AT (25) Hearts have scored while it was held (`hearts`, counted
 *  on the card under every rules rev). Before r59: Cobalion, Terrakion AND Virizion all held, undebuffed. */
export const RESOLUTE_AT = 25;
export const keldeo_resolute = (card) => (solo59() ? !!card && (card.ability.extra.hearts || 0) >= RESOLUTE_AT : legend_held('cobalion') && legend_held('terrakion') && legend_held('virizion'));
/** The full deck's count of each suit (is_suit with the debuff bypassed: a Wild card counts for EVERY suit, a Stone card for none). */
export function deck_suits() {
  const n = { Spades: 0, Hearts: 0, Clubs: 0, Diamonds: 0 };
  for (const c of G.playing_cards || []) if (unbroken(c)) for (const s of Object.keys(n)) if (c.is_suit(s, true)) n[s]++;
  return n;
}
/** Swords of Justice (contentRev 59, solo): the sword's suit is the most common in the full deck (an empty count never). contentRev 60
 *  (the owner's follow-up): STRICTLY the most common, a tie doesn't count (a standard 52-card deck: every sword X1.25); a move recorded on
 *  r59 re-plays with ties counting (js/mods/pins.js RULES). */
const strict60 = () => rulesRev('pokermon') >= 60;
export function suit_leads(suit) {
  const n = deck_suits(), top = Math.max(...Object.values(n));
  if (!(top > 0 && n[suit] === top)) return false;
  return !strict60() || Object.keys(n).every((s) => s === suit || n[s] < top);
}
/** The Swords of Justice X: X1.5, i.e. the base `Xmult_multi` x 1.2 (one energy field scales both: 1.575 / 1.65 / 1.725). */
const justice_x = (card) => r9(card.ability.extra.Xmult_multi * 1.2);
/** A sword's per-card X. contentRev 59: Keldeo's Resolute `Xmult_multi2` (X2), else X1.5 while its suit leads the deck, else its base.
 *  Before r59: the base (Keldeo's Resolute X2) + `sword_mod` (0.1, fixed) per other sword. */
export function sword_x(card) {
  const ex = card.ability.extra, keldeo = card.config.center.key === 'j_poke_keldeo';
  if (solo59()) return keldeo && keldeo_resolute(card) ? ex.Xmult_multi2 : suit_leads(SWORDS[card.config.center.key]) ? justice_x(card) : ex.Xmult_multi;
  const base = keldeo && keldeo_resolute(card) ? ex.Xmult_multi2 : ex.Xmult_multi;
  return r9(base + ex.sword_mod * sword_others(card));
}
/** Each scored card of the sword's suit (is_suit: a Wild card counts; a debuffed card doesn't score) gives the sword's X. Keldeo counts
 *  each Heart that scores (a retrigger scores again, so counts again; not Blueprint) AFTER it pays: the 25th pays Ordinary, the 26th X2. */
function sacred_sword(card, context) {
  const suit = SWORDS[card.config.center.key];
  if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit(suit)) {
    const x = sword_x(card);
    if (card.config.center.key === 'j_poke_keldeo' && !context.blueprint) card.ability.extra.hearts = (card.ability.extra.hearts || 0) + 1;
    return { x_mult: x, card };
  }
  return undefined;
}
/** A sword's tooltip: [base X, Justice X, "<its suit's count>, top <the most common suit's count>" (contentRev 60: "<count>, tied for
 *  top" while it shares the top, which no longer counts), the X it gives now]. */
function sword_vars(self, info_queue, card) {
  type_tooltip(self, info_queue, card);
  const ex = card.ability.extra, suit = SWORDS[card.config.center.key], n = deck_suits(), top = Math.max(...Object.values(n));
  const tied = strict60() && top > 0 && n[suit] === top && Object.keys(n).some((s) => s !== suit && n[s] === top);
  return { vars: [r3(ex.Xmult_multi), r3(justice_x(card)), n[suit] + (tied ? ', tied for top' : ', top ' + top), r3(sword_x(card))] };
}
/** The Forces of Nature's formes: Tornadus and Thundurus are Therian while an undebuffed Landorus is held; Landorus while both Tornadus
 *  AND Thundurus are. Live (bought, sold or debuffed, it changes at once): the card's art follows it (poke_view_form). */
export const THERIAN_AT = 4;
export function therian(card) {
  // contentRev 59 (solo): for good after it has been held for THERIAN_AT (4) rounds (`therian_rounds`, counted on the card under every
  // rules rev: the main end_of_round pass, not Blueprint; a debuffed one isn't calculated, so that round doesn't count), a Reveal Glass.
  if (solo59()) return (card.ability.extra.therian_rounds || 0) >= THERIAN_AT;
  const k = card.config.center.key;
  if (k === 'j_poke_landorus') return legend_held('tornadus') && legend_held('thundurus');
  return legend_held('landorus');
}
/** The Therian clock: +1 round held at each end of round. */
function therian_tick(card, context) {
  if (!round_end(context) || context.blueprint) return false;
  const ex = card.ability.extra, was = therian(card);
  ex.therian_rounds = (ex.therian_rounds || 0) + 1;
  if (!was && therian(card)) card_eval_status_text(card, 'extra', null, null, null, { message: 'Therian Forme!', colour: 'FILTER' });
  return true;
}
const therian_left = (card) => Math.max(0, THERIAN_AT - (card.ability.extra.therian_rounds || 0));
const forme_name = (card) => (therian(card) ? 'Therian Forme' : 'Incarnate Forme');
/** The tooltip's forme line: "Therian Forme" / "Therian in k rounds". */
const forme_state = (card) => (therian(card) ? 'Therian Forme' : 'Therian in ' + therian_left(card) + (therian_left(card) === 1 ? ' round' : ' rounds'));
/** Tornadus's Therian Forme: +mult Mult per hand left, read when it scores (hands_left: the hand being scored is already taken, so the
 *  round's final hand counts 0). */
const tornadus_left = () => Math.max(0, (G.GAME && G.GAME.current_round && G.GAME.current_round.hands_left) || 0);
const tornadus_mult = (card) => r9(card.ability.extra.mult * tornadus_left());
/** Thundurus: each scored card rolls 1 in `dem` (Incarnate 4, Therian `dem2` 2; Pokermon's pseudorandom_probability, so Oops! All 6s raises
 *  it and Absol fixes it) to earn `storm_money` ($1); in the Therian Forme a card that pays also gives X`Xmult_multi`. Each retrigger
 *  rolls again; Blueprint rolls its own. */
function thunder_odds(card) { const ex = card.ability.extra; return get_probability_vars(card, ex.num, therian(card) ? ex.dem2 : ex.dem, 'thundurus'); }
function wild_charge(card, context) {
  if (therian_tick(card, context)) return undefined;
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round)) return undefined;
  const ex = card.ability.extra, t = therian(card);
  if (!pseudorandom_probability(card, 'thundurus', ex.num, t ? ex.dem2 : ex.dem, 'thundurus')) return undefined;
  G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + ex.storm_money;
  G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
  return t ? { dollars: ex.storm_money, x_mult: ex.Xmult_multi, card } : { dollars: ex.storm_money, card };
}
/** Landorus: Incarnate, each Stone card HELD in hand (undebuffed) gives +chips Chips; Therian, each SCORED Stone card gives X`Xmult_multi`
 *  instead (has_enhancement: quantum Stone too). */
function sand_force(card, context) {
  if (therian_tick(card, context)) return undefined;
  if (!context.individual || context.end_of_round || !has_enhancement(context.other_card, 'm_stone')) return undefined;
  const ex = card.ability.extra, t = therian(card);
  if (!t && context.cardarea === G.hand && !context.other_card.debuff) return { h_chips: ex.chips, card };
  if (t && context.cardarea === G.play) return { x_mult: ex.Xmult_multi, card };
  return undefined;
}
/** The Tao trio's types: Reshiram's Fire, Zekrom's Lightning. */
export const TAO = { j_poke_reshiram: { type: 'Fire', partner: 'zekrom' }, j_poke_zekrom: { type: 'Lightning', partner: 'reshiram' } };
/** A typed joker for "each Fire / Lightning Joker gives": is_type (Arceus counts, a Tera sticker counts and replaces), undebuffed. */
const typed_joker = (j, type) => !!(j && j.ability && j.ability.set === 'Joker' && !j.debuff && is_type(j, type));
/** Truth vs Ideals (before r59): Reshiram and Zekrom both held (undebuffed): each one's per-joker X was +tao_mod (0.25, fixed). */
const truth_ideals = (card) => legend_held(TAO[card.config.center.key].partner);
/** A Tao dragon's per-joker X: `Xmult_multi` (+5% per Energy) + its Fusion bank (`fusion_x`, contentRev 59). Before r59: + tao_mod with
 *  its partner. */
export const tao_x = (card) => r9(card.ability.extra.Xmult_multi + (solo59() ? card.ability.extra.fusion_x || 0 : truth_ideals(card) ? card.ability.extra.tao_mod : 0));
/** Fusion Flare / Fusion Bolt (contentRev 59): each Fire (Reshiram) / Lightning (Zekrom) Energy card used, on any joker or none, banks
 *  +fusion_mod (0.05, fixed) into `fusion_x` (no energy field: Energy never raises what is banked). Not Blueprint. */
const FUSION_ENERGY = { j_poke_reshiram: 'c_poke_fire_energy', j_poke_zekrom: 'c_poke_lightning_energy' };
function fusion_bank(card, context) {
  if (!context.using_consumeable || context.blueprint || !context.consumeable || !solo59()) return false;
  if (context.consumeable.config.center.key !== FUSION_ENERGY[card.config.center.key]) return false;
  const ex = card.ability.extra;
  ex.fusion_x = r9((ex.fusion_x || 0) + ex.fusion_mod);
  card_eval_status_text(card, 'extra', null, null, null, { message: card.config.center.key === 'j_poke_reshiram' ? 'Fusion Flare!' : 'Fusion Bolt!', colour: 'XMULT' });
  return true;
}
/** Jokers of this type (is_type, undebuffed), the card itself included when it is one: the tooltip's count (a shop card shows what it
 *  would give once bought). */
const typed_count = (card, type) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && typed_joker(j, type)).length + (is_type(card, type) ? 1 : 0);
/** Turboblaze / Teravolt: each Fire / Lightning Joker (itself included) gives the dragon's X, in the other_joker pass (Manaphy's shape). */
function tao_boost(card, context) {
  if (fusion_bank(card, context)) return undefined;
  const tao = TAO[card.config.center.key];
  if (!(context.other_joker && typed_joker(context.other_joker, tao.type))) return undefined;
  const x = tao_x(card);
  G.E_MANAGER.add_event(() => { context.other_joker.juice_up(0.5, 0.5); });
  return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
}
/** Kyurem's partner: the LEFTMOST undebuffed Reshiram or Zekrom in the row (both held: whichever sits further left), or none. White
 *  Kyurem borrows Reshiram's Turboblaze, Black Kyurem Zekrom's Teravolt. */
export function kyurem_partner() {
  return ((G.jokers && G.jokers.cards) || []).find((j) => !j.debuff && TAO[j.config.center.key]);
}
/** Kyurem's form. contentRev 59 (solo): White while you have more Fire Jokers than Lightning Jokers, Black while more Lightning than Fire
 *  (typed_joker: undebuffed; Arceus counts for both, so it never tips it; a Tera counts; Kyurem itself is left out); a tie keeps the form
 *  it had (`kyurem_form`, written by its own calculate on every context, so it is the same in live play, resume and replay), plain Kyurem
 *  until one side first leads. Before r59: the leftmost undebuffed Reshiram (White) / Zekrom (Black). */
const kyurem_count = (card, type) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && typed_joker(j, type)).length;
export const kyurem_form = (card) => {
  if (solo59()) {
    const f = kyurem_count(card, 'Fire'), l = kyurem_count(card, 'Lightning');
    return f > l ? 'white' : l > f ? 'black' : (card && card.ability.extra.kyurem_form) || 'base';
  }
  const p = kyurem_partner(); return !p ? 'base' : p.config.center.key === 'j_poke_reshiram' ? 'white' : 'black';
};
const KYUREM_TYPE = { white: 'Fire', black: 'Lightning' };
/** Kyurem's borrowed boost: each joker of the partner's type gives Kyurem the partner's OWN current per-joker X (its Energy and Truth vs
 *  Ideals included) a second time, on top of the partner's: a separate multiplier, so a Fire Joker with Reshiram and White Kyurem gives
 *  X1.25 x X1.25. Nothing is consumed; the partner works as usual. */
function kyurem_borrow(card, context) {
  if (solo59()) {
    const t = context.other_joker && KYUREM_TYPE[kyurem_form(card)];
    if (!t || context.other_joker === card || !typed_joker(context.other_joker, t)) return undefined;
    const x = r9(card.ability.extra.Xmult_multi);
    G.E_MANAGER.add_event(() => { context.other_joker.juice_up(0.5, 0.5); });
    return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
  }
  const p = context.other_joker && kyurem_partner();
  if (!p || !typed_joker(context.other_joker, TAO[p.config.center.key].type)) return undefined;
  const x = tao_x(p);
  G.E_MANAGER.add_event(() => { context.other_joker.juice_up(0.5, 0.5); });
  return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
}
/** Meloetta's formes: the Pokermon type each one's card shows (Aria Psychic; Pirouette Fighting: its 3.9.1 cell's icon). */
export const MELOETTA_FORMES = { aria: { ptype: 'Psychic', name: 'Aria Forme' }, pirouette: { ptype: 'Fighting', name: 'Pirouette Forme' } };
/** Meloetta's forme: Pirouette only if it switched to it THIS round (`form_round`); every round starts in Aria (a Meloetta debuffed through
 *  the end of round, whose reset never ran, still reads Aria in the next one). */
export const meloetta_form = (card) => { const ex = card.ability.extra; return ex.form === 'pirouette' && ex.form_round === (G.GAME && G.GAME.round) ? 'pirouette' : 'aria'; };
/** Meloetta takes a forme: its own Pokermon type (ability.extra.ptype) becomes the forme's, Castform's / Burmy's way — unless a Tera sticker
 *  owns the type. The debuff and Kecleons are re-read. */
function meloetta_set(card, form) {
  const ex = card.ability.extra, f = MELOETTA_FORMES[form] || MELOETTA_FORMES.aria;
  const ptype = type_sticker_applied(card) ? ex.ptype : f.ptype;
  const changed = ex.form !== form || ex.ptype !== ptype;
  ex.form = form;
  ex.form_round = form === 'pirouette' ? G.GAME.round : undefined;
  ex.ptype = ptype;
  if (!changed) return;
  card.set_debuff();
  sync_kecleons();
}
/** Relic Song: after EVERY hand played (the `after` pass, which a debuffed hand gets too; not Blueprint, not a joker retrigger) it switches
 *  Aria <-> Pirouette. Every round starts in Aria: reset in the main end_of_round pass (queued, so the round's other end-of-round effects
 *  still see its forme), and a stale Pirouette from an earlier round is put back first thing. */
function relic_song(card, context) {
  if (context.blueprint) return;
  const ex = card.ability.extra;
  if (ex.form === 'pirouette' && meloetta_form(card) === 'aria') meloetta_set(card, 'aria');
  if (context.after && !context.retrigger_joker) {
    const next = meloetta_form(card) === 'aria' ? 'pirouette' : 'aria';
    meloetta_set(card, next);
    card_eval_status_text(card, 'extra', null, null, null, { message: MELOETTA_FORMES[next].name + '!', colour: next === 'aria' ? 'PURPLE' : 'RED' });
  } else if (round_end(context)) {
    G.E_MANAGER.add_event(() => { meloetta_set(card, 'aria'); });
  }
}
/** Genesect, Techno Blast: the Water, Lightning or Fire Jokers you have — one test per joker (is_type for each of the three, so a joker of
 *  two of them, a Tera, or Arceus counts ONCE), undebuffed, Genesect itself included when it is one (a Tera sticker). */
const techno_joker = (j) => !j.debuff && (is_type(j, 'Water') || is_type(j, 'Lightning') || is_type(j, 'Fire'));
export const techno_count = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && techno_joker(j)).length + (techno_joker(card) ? 1 : 0);
const techno_x = (card) => r9(card.ability.extra.Xmult + card.ability.extra.Xmult_mod * techno_count(card));

// ---------------------------------------------------------------- Gen 6, batch 3: the Gen 6 Legendaries (contentRev 63; 717-721)
/** Yveltal, Oblivion Wing: at the end of each round (the main end_of_round pass; not Blueprint, not a joker retrigger, not on a game
 *  over) 1 random card HELD in hand (the run's seeded stream, seed 'yveltal'; a card already being destroyed this pass — Gulpin's
 *  swallow — is skipped) is destroyed through Pokermon's poke_remove_card (dissolved / shattered, and every joker's remove_playing_cards
 *  runs: Giratina, Spiritomb, Phantump... see it), then the bank `oblivion_Xmult` (from X1, no energy field: never retroactive) gains
 *  `Xmult_mod`. Nothing held, nothing destroyed and nothing gained. */
function oblivion_wing(card, context) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over) return false;
  const held = ((G.hand && G.hand.cards) || []).filter((c) => unbroken(c) && !c.poke_swallowed);
  if (!held.length) return true;
  const [target] = pseudorandom_element(held, pseudoseed('yveltal'));
  target.poke_swallowed = true;
  poke_remove_card(target, card);
  const ex = card.ability.extra;
  ex.oblivion_Xmult = r9(ex.oblivion_Xmult + ex.Xmult_mod);
  card_eval_status_text(card, 'extra', null, null, null, { message: a_xmult(r3(ex.oblivion_Xmult)), colour: 'XMULT' });
  return true;
}
/** Zygarde, Cells: the Formes by the Cells collected on the card (`cells`, at most ZYGARDE_COMPLETE). */
export const ZYGARDE_HALF = 50, ZYGARDE_COMPLETE = 100;
export const zygarde_form = (card) => { const n = card.ability.extra.cells || 0; return n >= ZYGARDE_COMPLETE ? 'complete' : n >= ZYGARDE_HALF ? 'half' : 'ten'; };
export const ZYGARDE_FORMES = { ten: { name: '10% Forme', field: 'Xmult' }, half: { name: '50% Forme', field: 'Xmult1' }, complete: { name: 'Complete Forme', field: 'Xmult2' } };
const zygarde_x = (card) => card.ability.extra[ZYGARDE_FORMES[zygarde_form(card)].field];
/** Complete Forme's +hand size (`complete_size`, fixed): given while a Complete Zygarde is held (undebuffed) — on reaching 100 Cells, or
 *  when a Complete one is gained / un-debuffed — and taken back when it leaves or is debuffed (Juggler's way; `complete_given` remembers
 *  that it was given, so it is never given or taken twice). */
function zygarde_give(card) {
  const ex = card.ability.extra;
  if (ex.complete_given || zygarde_form(card) !== 'complete') return;
  ex.complete_given = true;
  G.hand.change_size(ex.complete_size);
}
const zygarde_size = {
  add_to_deck(self, card) { card.ability.extra.complete_given = false; zygarde_give(card); },
  remove_from_deck(self, card) {
    const ex = card.ability.extra;
    if (!ex.complete_given) return;
    ex.complete_given = false;
    G.hand.change_size(-ex.complete_size);
  },
};
/** Cells: after each hand (the `after` pass, once: not Blueprint, not a joker retrigger, so a retriggered card adds 1 like any other),
 *  +1 Cell per card that scored (the scoring hand, a debuffed card left out: it didn't score), up to 100. Reaching 50 / 100 changes the
 *  Forme (from the next hand: the hand that collects them still scores at the old one) and the art; 100 also gives the +1 hand size. */
function zygarde_cells(card, context) {
  if (!context.after || context.blueprint || context.retrigger_joker) return false;
  const ex = card.ability.extra, was = zygarde_form(card);
  const n = ((context.scoring_hand) || []).filter((c) => !c.debuff).length;
  ex.cells = Math.min(ZYGARDE_COMPLETE, (ex.cells || 0) + n);
  const now = zygarde_form(card);
  if (now !== was) {
    zygarde_give(card);
    card_eval_status_text(card, 'extra', null, null, null, { message: ZYGARDE_FORMES[now].name + '!', colour: 'GREEN' });
  }
  return true;
}
/** Diancie, Diamond Storm: when a Blind is selected, 1 random card of the full deck that is not a Diamond (is_suit with the debuff
 *  bypassed: a Wild card already is one) and not a Stone card (no suit to change) becomes a Diamond (the run's seeded stream, seed
 *  'diancie'); its rank, enhancement, seal and edition stay. None left, nothing. Blueprint copies it (a second card). */
function diamond_storm(card, context) {
  if (!context.setting_blind || card.getting_sliced || (context.blueprint_card && context.blueprint_card.getting_sliced)) return false;
  const pool = (G.playing_cards || []).filter((c) => unbroken(c) && !has_enhancement(c, 'm_stone') && !c.is_suit('Diamonds', true));
  if (!pool.length) return true;
  const [pick] = pseudorandom_element(pool, pseudoseed('diancie'));
  pick.change_suit('Diamonds');
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: '+1 Diamond', colour: 'MONEY' });
  return true;
}
/** Hoopa, Hyperspace Hole: Unbound for good once HOOPA_AT (15) consumables have been used while it was held (`used`, on the card; any
 *  consumable, Energy included; not Blueprint). */
export const HOOPA_AT = 15;
export const hoopa_unbound = (card) => (card.ability.extra.used || 0) >= HOOPA_AT;
function hoopa_count(card, context) {
  if (!context.using_consumeable || context.blueprint || hoopa_unbound(card)) return false;
  const ex = card.ability.extra;
  ex.used = (ex.used || 0) + 1;
  if (hoopa_unbound(card)) card_eval_status_text(card, 'extra', null, null, null, { message: 'Unbound!', colour: 'PURPLE' });
  return true;
}
/** At the end of each shop (ending_shop), with a consumable slot free NOW (cards + pending creations < limit; none, nothing — no roll),
 *  creates a random Tarot or Planet (Confined: the set is seeded 'hoopa', the card from that set's own pool), or once Unbound a random
 *  Spectral card. Blueprint copies it (a second card, room permitting). */
function hyperspace_hole(card, context) {
  if (!context.ending_shop) return false;
  if (G.consumeables.cards.length + (G.GAME.consumeable_buffer || 0) >= G.consumeables.config.card_limit) return true;
  const set = hoopa_unbound(card) ? 'Spectral' : pseudorandom_element(['Tarot', 'Planet'], pseudoseed('hoopa'))[0];
  G.GAME.consumeable_buffer = (G.GAME.consumeable_buffer || 0) + 1;
  G.E_MANAGER.add_event(() => {
    const c = create_card(set, G.consumeables, null, null, null, null, null, 'hoopa');
    c.add_to_deck();
    G.consumeables.emplace(c);
    G.GAME.consumeable_buffer = 0;
  });
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize(set === 'Spectral' ? 'k_plus_spectral' : set === 'Tarot' ? 'k_plus_tarot' : 'k_plus_planet'), colour: set === 'Tarot' ? 'PURPLE' : set });
  return true;
}
/** Volcanion, Steam Eruption: X(`Xmult` + `Xmult_mod` per discard used this round), read when it scores (a discard before the hand counts). */
const steam_x = (card) => r9(card.ability.extra.Xmult + card.ability.extra.Xmult_mod * discards_used());

// ---------------------------------------------------------------- Gen 7, batch 3: the Ultra Beasts (contentRev 66; 793-799, 803-806)
/** Beast Boost (the Ultra Beasts' shared ability, solo): each Boss Blind beaten (the main end_of_round pass with beat_boss, not on a game over,
 *  not Blueprint, not a joker retrigger) adds 1 to the card's `beast_boosts` (a count, in no energy_values; it carries through evolution:
 *  poke_custom_values_to_keep). The joker's MAIN number is the field its center names (`poke_beast_boost`); its effective value is
 *    ex[field] (the energized value) + beast_boosts x BEAST_BOOST x center.config.extra[field] (the UNENERGIZED base)
 *  so a boost is always 10% of the base: Energy never scales a boost and a boost never scales an Energy (neither is retroactive on the
 *  other; the order they come in doesn't matter). Nihilego has no number of its own: no field, no count. */
export const BEAST_BOOST = 0.1;
const beast_step = (card) => { const f = card.config.center.poke_beast_boost; return f ? r9(BEAST_BOOST * ((card.config.center.config.extra || {})[f] || 0)) : 0; };
const beast_bonus = (card) => r9((card.ability.extra.beast_boosts || 0) * beast_step(card));
/** The effective main number: the field (as Energy left it) + the Beast Boosts. */
export const beast_value = (card, field = card.config.center.poke_beast_boost) => r9((card.ability.extra[field] || 0) + (field === card.config.center.poke_beast_boost ? beast_bonus(card) : 0));
function beast_boost(card, context) {
  if (!(round_end(context) && context.beat_boss && !context.game_over) || context.blueprint || context.retrigger_joker) return false;
  if (!card.config.center.poke_beast_boost) return false;
  const ex = card.ability.extra;
  ex.beast_boosts = (ex.beast_boosts || 0) + 1;
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Beast Boost!', colour: 'FILTER' });
  return true;
}
/** The tooltip's "(Beast Boost: +n)": the total the boosts add (n = boosts x step). */
const beast_vars = (card) => [r3(beast_step(card)), r3(beast_bonus(card))];
/** Nihilego, Parasite: the Joker directly to its LEFT (Blueprint mirrored; none at the row's left end). */
const nihilego_target = (card) => { const i = G.jokers && G.jokers.cards ? G.jokers.cards.indexOf(card) : -1; return i > 0 ? G.jokers.cards[i - 1] : undefined; };
/** Pheromosa: X on the round's first 2 hands (current_round.hands_played, the hands BEFORE this one, < pheromosa_hands); after the 2nd
 *  hand (or any later one) has scored it is debuffed (an SMODS debuff source, 'pheromosa', on the card) until the round ends. */
export const PHEROMOSA_HANDS = 2;
function pheromosa_tire(card, context) {
  if (!context.after || context.blueprint || context.retrigger_joker) return false;
  if ((G.GAME.current_round.hands_played || 0) < PHEROMOSA_HANDS - 1) return true;
  smods_debuff_card(card, true, 'pheromosa');
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Tired!', colour: 'RED' });
  return true;
}
/** The end of the round (run.js end_round's first step, before any joker's end_of_round — index.js hook end_round_start): every
 *  tired Pheromosa recovers (the source dropped; the card re-evaluated), so it is undebuffed for the round's end and its Beast Boost. */
export function pheromosa_rest() {
  for (const j of ((G.jokers && G.jokers.cards) || []).slice()) {
    if (j.ability && j.ability.debuff_sources && j.ability.debuff_sources.pheromosa) smods_debuff_card(j, null, 'pheromosa');
  }
}
/** Celesteela, Launch: X(1 + Xmult_mod per $1 of its current sell value). */
const launch_x = (card) => r9(1 + beast_value(card) * (card.sell_cost || 0));
/** Guzzlord, Gluttony: when a Blind is selected (not Blueprint), the LEFTMOST consumable (Shuckle's choice; one already being sliced is
 *  skipped) is destroyed and the bank `gluttony_Xmult` (from X1, no energy field) gains `Xmult_mod`. No consumable, nothing. */
function gluttony(card, context) {
  if (!context.setting_blind || context.blueprint || context.retrigger_joker || card.getting_sliced) return false;
  const meal = ((G.consumeables && G.consumeables.cards) || []).find((c) => !c.getting_sliced);
  if (!meal) return true;
  meal.getting_sliced = true;
  const ex = card.ability.extra;
  ex.gluttony_Xmult = r9(ex.gluttony_Xmult + ex.Xmult_mod);
  G.E_MANAGER.add_event(() => { meal.start_dissolve(); });
  card_eval_status_text(card, 'extra', null, null, null, { message: a_xmult(r3(beast_value(card))), colour: 'XMULT' });
  return true;
}
/** Poipole / Naganadel: undebuffed Dragon Jokers (is_type: a Tera sticker counts), the joker itself included when it is one. */
const dragon_count = () => ((G.jokers && G.jokers.cards) || []).filter((j) => !j.debuff && is_type(j, 'Dragon')).length;
const poipole_mult = (card) => r3(beast_value(card) * dragon_count());
const naganadel_x = (card) => r9(beast_value(card) + card.ability.extra.Xmult_mod * dragon_count());

// ---------------------------------------------------------------- Gen 7, batch 4: the Gen 7 Legendaries (contentRev 67; 772-807)
/** A banked X gain at the main end of round (not Blueprint, not a joker retrigger, not on a game over): `ref` += `mod` (bank outside
 *  energy_values, gain an energy field: never retroactive). Type: Null, Cosmog (Mult), Cosmoem. */
function round_bank(card, context, ref, mod, colour) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over) return;
  bank(card, ref, mod, 1, colour);
}
/** Silvally, RKS System: the Energy card's type (c_poke_<type>_energy; Darkness = Dark), or null (Bird Energy, a non-Energy). */
const ENERGY_TYPE = Object.fromEntries(POKETYPES.map((t) => ['c_poke_' + (t === 'Dark' ? 'darkness' : t.toLowerCase()) + '_energy', t]));
export const rks_type_of = (consumeable) => (consumeable && consumeable.ability && consumeable.ability.set === 'Energy' && ENERGY_TYPE[consumeable.config.center.key]) || null;
/** Using any Energy card (on any joker, while Silvally is held; not Blueprint) sets Silvally's own type (Greninja's protean_set: its ptype,
 *  a Tera sticker still overrides; set_debuff + Kecleon re-sync). The Energy's use() runs first, so an Energy put on Silvally itself
 *  energizes it before the type moves. */
function rks_system(card, context) {
  if (!context.using_consumeable || context.blueprint) return false;
  const t = rks_type_of(context.consumeable);
  if (!t) return false;
  if (protean_set(card, t)) card_eval_status_text(card, 'extra', null, null, null, { message: 'RKS: ' + t + '!', colour: 'BLUE' });
  return true;
}
/** Silvally's X: (Xmult + Xmult_mod per OTHER undebuffed joker of its current type: Greninja's count) x Type: Null's bank. */
const rks_x = (card) => r9((card.ability.extra.Xmult + card.ability.extra.Xmult_mod * ninja_others(card)) * (card.ability.extra.null_Xmult || 1));
/** Cosmoem: the scored cards' colours while it is held (once per hand in the `after` pass, Zygarde's count: a retrigger, a Blueprint or a
 *  debuffed card adds none). A Heart or Diamond is red, a Spade or Club black (is_suit: a Wild card is both, a Stone card neither). */
function cosmo_count(card, context) {
  if (!context.after || context.blueprint || context.retrigger_joker) return false;
  const ex = card.ability.extra;
  for (const c of (context.scoring_hand || [])) {
    if (c.debuff) continue;
    if (c.is_suit('Hearts') || c.is_suit('Diamonds')) ex.red = (ex.red || 0) + 1;
    if (c.is_suit('Spades') || c.is_suit('Clubs')) ex.black = (ex.black || 0) + 1;
  }
  return true;
}
/** Cosmoem's branch: more red than black scored -> Solgaleo, more black -> Lunala, a tie -> Solgaleo. */
export const cosmo_branch = (card) => ((card.ability.extra.black || 0) > (card.ability.extra.red || 0) ? 'j_poke_lunala' : 'j_poke_solgaleo');
/** The Cosmog line's banks, every hand: Cosmog's +Mult (`cosmo_mult`) and Cosmoem's X (`cosmo_Xmult`). Blueprint copies them. */
function cosmo_main(card, context) {
  if (!context.joker_main) return undefined;
  const ex = card.ability.extra, r = {};
  if (ex.cosmo_mult > 0) r.mult_mod = ex.cosmo_mult;
  if (ex.cosmo_Xmult > 1) r.Xmult_mod = ex.cosmo_Xmult;
  if (!Object.keys(r).length) return undefined;
  r.message = r.Xmult_mod ? a_xmult(r3(r.Xmult_mod)) : a_mult(r3(r.mult_mod));
  r.colour = r.Xmult_mod ? 'XMULT' : 'MULT';
  return r;
}
/** Solgaleo / Lunala: each scored card of their colour gives X Xmult_multi (Blueprint copies it). */
function cosmo_suit_x(card, context, suits) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && suits.some((s) => context.other_card.is_suit(s))) {
    return { x_mult: card.ability.extra.Xmult_multi, card };
  }
  return undefined;
}
/** Necrozma, Prism: Ultra Necrozma for good once the bank reaches NECROZMA_ULTRA (it never drops). */
export const NECROZMA_ULTRA = 3;
export const necrozma_ultra = (card) => (card.ability.extra.prism_Xmult || 1) >= NECROZMA_ULTRA - 1e-9;
/** Ultra Necrozma's +hand size (`ultra_size`, fixed): Zygarde's Complete Forme pair (given on becoming Ultra and in add_to_deck when
 *  already Ultra; taken in remove_from_deck: sold, destroyed, debuffed; `ultra_given` so never twice). */
function ultra_give(card) {
  const ex = card.ability.extra;
  if (ex.ultra_given || !necrozma_ultra(card)) return;
  ex.ultra_given = true;
  G.hand.change_size(ex.ultra_size);
}
const ultra_size = {
  add_to_deck(self, card) { card.ability.extra.ultra_given = false; ultra_give(card); },
  remove_from_deck(self, card) {
    const ex = card.ability.extra;
    if (!ex.ultra_given) return;
    ex.ultra_given = false;
    G.hand.change_size(-ex.ultra_size);
  },
};
/** Each Planet card used while it is held (by anyone; not Blueprint) banks +Xmult_mod in `prism_Xmult`. Reaching X3: Ultra Necrozma,
 *  its type the Ultra card's (Dragon: protean_set, so is_type / Energy follow; Monotype still accepts the Psychic it was gained as),
 *  +1 hand size. It keeps banking. */
function prism(card, context) {
  const c = context.consumeable;
  if (!context.using_consumeable || context.blueprint || !c || c.ability.set !== 'Planet') return false;
  const was = necrozma_ultra(card);
  bank(card, 'prism_Xmult', 'Xmult_mod', 1, 'XMULT');
  if (!was && necrozma_ultra(card)) {
    protean_set(card, 'Dragon');
    ultra_give(card);
    card_eval_status_text(card, 'extra', null, null, null, { message: 'Ultra Necrozma!', colour: 'GOLD' });
  }
  return true;
}

// ---------------------------------------------------------------- the Gen 7 starters (Rowlet / Litten / Popplio lines)
/** Rowlet line: the RIGHTMOST scored card (by position, as the Shellos line's East Sea: a debuffed card there gets nothing, the end
 *  never shifts inward; a 1-card hand's card is it). */
const rightmost_scored = (context) => { const s = context.scoring_hand || []; return s.length ? s[s.length - 1] : undefined; };
/** Rowlet / Dartrix / Decidueye: the rightmost scored card retriggers `retriggers` times (fixed); Decidueye's Spirit Shackle also gives
 *  X`Xmult_multi` each time it scores (so X1.3 three times with both retriggers). Rowlet / Dartrix carry the unused Xmult_multi so they
 *  can take Energy for Decidueye (the Combee pattern). */
function shackle_calc(card, context) {
  const ex = card.ability.extra;
  if (context.repetition && !context.end_of_round && context.cardarea === G.play && context.other_card === rightmost_scored(context) && !context.other_card.debuff) {
    return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
  }
  if (ex.shackle && context.individual && !context.end_of_round && context.cardarea === G.play && context.other_card === rightmost_scored(context)) {
    return { x_mult: r3(ex.Xmult_multi), card };
  }
  return undefined;
}
/** Litten line: the hands already played this round, BEFORE this one (current_round.hands_played is still the pre-hand count while a
 *  hand scores; run.js adds 1 after evaluate_play; reset each round). The round's first hand counts 0. */
const hands_before = () => (G.GAME && G.GAME.current_round && G.GAME.current_round.hands_played) || 0;
const litten_mult = (card) => r3(card.ability.extra.mult * hands_before());
const incineroar_x = (card) => r3(1 + card.ability.extra.Xmult_mod * hands_before());
/** Popplio line: scored Hearts (is_suit: Wild cards and Smeared Joker count) give +mult, Primarina's Sparkling Aria X`Xmult_multi`. */
function aria_calc(card, context) {
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit('Hearts'))) return undefined;
  const ex = card.ability.extra;
  if (ex.aria) return { x_mult: r3(ex.Xmult_multi), card };
  return { mult: r3(ex.mult), card };
}
// ------------------------------------------------------------ the Gen 6 starters (Chespin / Fennekin / Froakie lines)
/** Fennekin / Braixen / Delphox: +1 discard (the Charmander line's pair) AND +1 Foresight (the Shinx line's), in one add/remove pair
 *  (two spreads would overwrite each other's add_to_deck). */
const discards_scry = {
  add_to_deck(self, card, from_debuff) { discards.add_to_deck(self, card, from_debuff); scry.add_to_deck(self, card, from_debuff); },
  remove_from_deck(self, card, from_debuff) { discards.remove_from_deck(self, card, from_debuff); scry.remove_from_deck(self, card, from_debuff); },
};
/** Chesnaught, Spiky Shield: "2 or more hands left", counted BEFORE the hand is played (this hand included). run.js takes the hand
 *  (ease_hands_played(-1)) before the jokers score, so while it scores that is hands_left + 1 >= hands_req: every hand but a round's
 *  last (and every hand of a 1-hand round is the last). Out of a round (the shop) it shows the next round's first hand. */
const spiky_on = (card, scoring) => {
  const cr = G.GAME && G.GAME.current_round;
  if (!cr) return false;
  if (!scoring && !(G.GAME.facing_blind)) return (G.GAME.round_resets.hands || 0) >= card.ability.extra.hands_req;
  return (cr.hands_left || 0) + (scoring ? 1 : 0) >= card.ability.extra.hands_req;
};
/** Braixen: the first discard each round (a real one: not The Hook / a seal; pre_discard's `hook`) with a card that shares a rank with
 *  a Foreseen card (the Shinx line's `foreseen`: G.scry_view is the top of the deck before the discard draws) creates a random Tarot
 *  (the run's seeded stream, key_append 'braixen'). It needs room (cards + consumeable_buffer < limit); with no room nothing is made
 *  and the round's chance is NOT used up (a later Foreseen discard with room still makes it). Once made, not again this round
 *  (`tarot_round`). Not Blueprint (blueprint_compat false: its round flag is its own). */
const braixen_used = (card) => card.ability.extra.tarot_round === (G.GAME && G.GAME.round);
function braixen_tarot(card, context) {
  if (!context.pre_discard || context.hook || context.blueprint || context.retrigger_joker || !context.full_hand || braixen_used(card)) return;
  if (!context.full_hand.some((c) => !c.debuff && foreseen(c))) return;
  if (G.consumeables.cards.length + (G.GAME.consumeable_buffer || 0) >= G.consumeables.config.card_limit) return;
  card.ability.extra.tarot_round = G.GAME.round;
  G.GAME.consumeable_buffer = (G.GAME.consumeable_buffer || 0) + 1;
  G.E_MANAGER.add_event(() => {
    const t = create_card('Tarot', G.consumeables, null, null, null, null, undefined, 'braixen');
    t.add_to_deck();
    G.consumeables.emplace(t);
    G.GAME.consumeable_buffer = 0;
  });
  card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_plus_tarot'), colour: 'Tarot' });
}
const braixen_state = (card) => (G.GAME && G.GAME.facing_blind && braixen_used(card) ? 'Used this round' : 'Active!');
/** Delphox, Mystical Fire: every Tarot used (by anyone, while it is held) banks +Xmult_mod in `fire_Xmult` (no energy field: what is
 *  banked keeps its worth; Energy raises only later gains). Not Blueprint for the gain; Blueprint copies the X. Latias's shape. */
function mystical_fire(card, context) {
  const ex = card.ability.extra;
  if (context.using_consumeable && context.consumeable && context.consumeable.ability.set === 'Tarot') {
    if (context.blueprint) return undefined;
    ex.fire_Xmult = r3(ex.fire_Xmult + ex.Xmult_mod);
    card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'XMULT' });
    return undefined;
  }
  if (context.joker_main && ex.fire_Xmult > 1) return { message: a_xmult(r3(ex.fire_Xmult)), colour: 'XMULT', Xmult_mod: ex.fire_Xmult };
  return undefined;
}
/** Froakie / Frogadier: the Barboach line's count with one type — a Water Joker by is_type (ptype, a Tera sticker, Castform's form,
 *  Arceus, an add-on's IS_TYPE_RULES), undebuffed; itself always counts (+1), so the shop card shows what it gives once bought. */
const froak_count = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && !j.debuff && is_type(j, 'Water')).length + 1;
function froak_main(card, context) {
  if (!context.joker_main) return undefined;
  const chips = r3(card.ability.extra.chips * froak_count(card));
  return { message: a_chips(chips), colour: 'CHIPS', chip_mod: chips };
}
/** Greninja, Protean: the type most common among the OTHER jokers (undebuffed; each of the 12 types counted by is_type, so a dual-type
 *  joker (Arceus, a Stellar Tera) counts for each of its types). A tie for the most, or no typed joker, -> null (it keeps its type). */
export function protean_pick(card) {
  const n = {};
  for (const j of (G.jokers && G.jokers.cards) || []) {
    if (j === card || j.debuff) continue;
    for (const t of POKETYPES) if (is_type(j, t)) n[t] = (n[t] || 0) + 1;
  }
  const top = Math.max(0, ...Object.values(n));
  if (!top) return null;
  const best = POKETYPES.filter((t) => n[t] === top);
  return best.length === 1 ? best[0] : null;
}
/** Greninja's own type: its ptype (which is_type / find_pokemon_type / get_type / energy_matches read), as Castform's form; a Tera
 *  sticker still overrides it. Re-run its debuff and re-sync Kecleons when it changes. */
function protean_set(card, type) {
  const ex = card.ability.extra;
  if (ex.ptype === type) return false;
  ex.ptype = type;
  card.set_debuff();
  sync_kecleons();
  return true;
}
/** Greninja's X: Xmult + Xmult_mod for each OTHER undebuffed joker of its current type (get_type: a Tera sticker's type if it has one). */
const ninja_others = (card) => { const t = get_type(card); return t ? ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && !j.debuff && is_type(j, t)).length : 0; };
const ninja_x = (card) => r3(card.ability.extra.Xmult + card.ability.extra.Xmult_mod * ninja_others(card));

// ---------------------------------------------------------------- the Gen 5 starters: Snivy / Tepig / Oshawott lines (contentRev 50)
/** Snivy / Servine, Contrary: each DEBUFFED card held in hand gives +mult Mult (a held-in-hand effect, h_mult, Baron's shape: Mime and a
 *  held card's retriggers repeat it). Any debuff counts: a Boss Blind's (The Goad / Head / Club / Window / Plant / Pillar, Verdant Leaf), a
 *  mod's. Blueprint copies it. Cresselia (playing cards can't be debuffed) leaves nothing to count: anti-synergy. */
function contrary_held(card, context) {
  if (context.individual && context.cardarea === G.hand && !context.end_of_round && context.other_card.debuff) return { h_mult: card.ability.extra.mult, card };
  return undefined;
}
const debuffed_held = () => ((G.hand && G.hand.cards) || []).filter((c) => c.debuff).length;
/** Serperior, Contrary: while an undebuffed Serperior is owned (find_joker skips a debuffed one), a debuffed PLAYING card that scores is
 *  scored as if it weren't debuffed — the score_debuffed hook (index.js), which run.js score_played_card asks before giving up on a
 *  debuffed card: the debuff is lifted for that card's own scoring (its Chips, enhancement, seal, edition, retriggers and the jokers'
 *  per-card effects) with debuff_lifted set, and restored right after (still debuffed in hand, for the Glass break check, after the
 *  hand). One rule however many Serperiors (each copy gives its own X1.25). A lifted card doesn't trigger the Boss Blind (Matador). */
export const contrary_lifts = (c) => !!(c && c.ability && (c.ability.set === 'Default' || c.ability.set === 'Enhanced') && find_joker('serperior').length);
/** Tepig line, Flame Charge: the streak of hands in a row of the same poker hand this round, THIS hand included (1 on a new poker hand,
 *  2 on the second in a row...). Set when a hand is played (before), not by a Blueprint or a joker retrigger; a debuffed hand (The Eye,
 *  The Psychic: no `before` pass, so its debuffed_hand context) still continues or breaks it, and scores nothing. Kept for the round
 *  (streak_round: a new round starts at 0, even for a joker that missed the end-of-round pass while debuffed). Discards don't break it. */
function flame_charge(card, context) {
  const ex = card.ability.extra;
  if ((context.before || context.debuffed_hand) && context.cardarea === G.jokers && !context.blueprint && !context.retrigger_joker) {
    const same = ex.streak_round === G.GAME.round && ex.last_hand === context.scoring_name;
    ex.streak = same ? (ex.streak || 0) + 1 : 1;
    ex.last_hand = context.scoring_name;
    ex.streak_round = G.GAME.round;
  }
  if (round_end(context) && !context.blueprint) { ex.streak = 0; ex.last_hand = undefined; }
  return undefined;
}
/** The current streak (0 outside its round: the shop shows 0). */
const flame_streak = (ex) => (G.GAME && ex.streak_round === G.GAME.round ? ex.streak || 0 : 0);
function flame_vars(ex) {
  const n = flame_streak(ex);
  return [n, n && ex.last_hand ? localize(ex.last_hand, 'poker_hands') : localize('poke_none')];
}
/** Tepig / Pignite: +mult per streak hand; Emboar: X(1 + Xmult_mod per streak hand). */
function flame_main(card, context) {
  if (!context.joker_main) return undefined;
  const ex = card.ability.extra, n = flame_streak(ex);
  if (n <= 0) return undefined;
  // (the exact number scores; the message shows it rounded)
  if (ex.Xmult_mod) { const x = 1 + ex.Xmult_mod * n; return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
  const m = ex.mult * n;
  return { message: a_mult(r3(m)), colour: 'MULT', mult_mod: m };
}
/** Oshawott line, Razor Shell: the first `strikes` cards of the scoring hand (by position, Urshifu Rapid Strike's rule) retrigger
 *  `retriggers` time(s). A debuffed one there scores nothing and the count never moves past it (the next card isn't promoted). */
function razor_shell(card, context) {
  if (context.repetition && context.cardarea === G.play && context.scoring_hand) {
    const i = context.scoring_hand.indexOf(context.other_card), ex = card.ability.extra;
    if (i >= 0 && i < ex.strikes) return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
  }
  return undefined;
}
/** Samurott, Shell Blade: a scored Ace gives X(Xmult_multi) each time it scores (a retrigger repeats it). A Stone card has no rank. */
function shell_blade(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && !has_no_rank(context.other_card) && context.other_card.get_id() === 14) {
    return { x_mult: card.ability.extra.Xmult_multi, card };
  }
  return undefined;
}

// ---------------------------------------------------------------- Gen 5, batch 1 (contentRev 53): Patrat ... Sawk (504-539)
/** Patrat / Watchog, Lookout: each Foreseen card (the top of the deck, G.scry_view, scored like a held card: Uxie's moment) gives +mult
 *  Mult; a debuffed one gives nothing. The Foresight itself is the Shinx line's `scry` pair. */
function lookout(card, context) {
  if (context.individual && context.cardarea === G.scry_view && !context.end_of_round && !context.other_card.debuff) return { mult: card.ability.extra.mult, card };
  return undefined;
}
/** Consumable room (the Blue Seal's check: cards + pending creations < limit). */
const consumable_room = () => G.consumeables.cards.length + (G.GAME.consumeable_buffer || 0) < G.consumeables.config.card_limit;
/** Lillipup / Herdier / Stoutland, Pickup: in the main end_of_round pass (not Blueprint), WITH consumable room only — no room, no roll, so a
 *  full row never moves the seeded stream (Manaphy's "slot first, then the roll") — a num in dem chance (pseudorandom_probability, the
 *  joker's own seed: Oops! All 6s / Venonat raise it, Absol fixes it) to create a random Tarot (Lillipup) or a Tarot or Planet (Herdier /
 *  Stoutland: a seeded coin, `<seed>_set`). The card itself is the run's seeded create_card (key_append = the seed). */
function pickup(card, context, seed) {
  if (!round_end(context) || context.blueprint || !consumable_room()) return;
  const ex = card.ability.extra;
  if (!pseudorandom_probability(card, seed, ex.num, ex.dem, seed)) return;
  const set = ex.planets && pseudorandom(pseudoseed(seed + '_set')) < 0.5 ? 'Planet' : 'Tarot';
  G.GAME.consumeable_buffer = (G.GAME.consumeable_buffer || 0) + 1;
  G.E_MANAGER.add_event(() => {
    const c = create_card(set, G.consumeables, null, null, null, null, undefined, seed);
    c.add_to_deck();
    G.consumeables.emplace(c);
    G.GAME.consumeable_buffer = 0;
  });
  card_eval_status_text(card, 'extra', null, null, null, { message: localize(set === 'Tarot' ? 'k_plus_tarot' : 'k_plus_planet'), colour: set });
}
const pickup_vars = (card, seed) => { const ex = card.ability.extra; return get_probability_vars(card, ex.num, ex.dem, seed); };
/** Stoutland: +mult for each consumable held (G.consumeables.cards: Negative ones too). */
const held_consumables = () => ((G.consumeables && G.consumeables.cards) || []).length;
const stout_mult = (card) => r3(card.ability.extra.mult * held_consumables());
/** Purrloin / Liepard, Pickpocket: the Joker directly to the RIGHT in the row (none at the right end, or alone). */
const right_of = (card) => { const row = (G.jokers && G.jokers.cards) || []; const i = row.indexOf(card); return i >= 0 ? row[i + 1] : undefined; };
/** At end of round (the main pass, not Blueprint) the right neighbour loses `drain` of sell value — Pokermon's Drain (poke_drain, one way:
 *  nothing goes to the thief), which never takes a Joker below $1 of sell value (one at $1 loses nothing). No right neighbour: no loss.
 *  The money is earned either way, through calc_dollar_bonus (`steal`, a row of the cash-out list; Blueprint never copies it). A debuffed
 *  neighbour still loses it (sell value isn't an ability, the Combee rule). */
function pickpocket(card, context) {
  if (!round_end(context) || context.blueprint) return;
  const j = right_of(card);
  if (j) poke_drain(card, j, card.ability.extra.drain, true);
}
/** Pidove / Tranquill / Unfezant, Super Luck: +lucky_odds to the numerator of a Lucky card's two rolls (identifiers 'lucky_mult' 1 in 5 and
 *  'lucky_money' 1 in 15), the mod_probability pass Venonat uses for every roll: so it is added BEFORE Oops! All 6s doubles the numerator
 *  ((1 + 1) x 2 = 4 in 5), stacks with Venonat (+1 each) and with other copies, and Absol still fixes it at 0. Never Blueprint. */
const LUCKY_ROLLS = ['lucky_mult', 'lucky_money'];
function super_luck(card, context) {
  if (context.mod_probability && !context.blueprint && LUCKY_ROLLS.includes(context.identifier)) return { numerator: context.numerator + card.ability.extra.lucky_odds };
  return undefined;
}
/** The Lucky odds now ([Mult num, dem, money num, dem]); a card not held yet (the shop) counts its own +odds, so it shows what it would give. */
function lucky_odds_vars(card) {
  const own = G.jokers && G.jokers.cards.includes(card) ? 0 : card.ability.extra.lucky_odds;
  return [...get_probability_vars(card, 1 + own, 5, 'lucky_mult'), ...get_probability_vars(card, 1 + own, 15, 'lucky_money')].map(r3);
}
/** Blitzle / Zebstrika, Motor Drive: no player discard used this round yet (current_round.discards_used; The Hook's forced discards
 *  don't count it). Out of a round (the shop) the tooltip reads the next round's start: on. */
const motor_on = () => { const GM = G.GAME, cr = GM && GM.current_round; return !!cr && (!GM.facing_blind || !(cr.discards_used > 0)); };
/** Blitzle: +mult for each hand played this round before any discard, THIS hand included (hands_played is the pre-hand count while it
 *  scores: the round's 1st hand counts 1, the 2nd 2...); after a discard, 0 for the rest of the round. */
const motor_count = () => (motor_on() ? hands_before() + 1 : 0);
const motor_mult = (card) => r3(card.ability.extra.mult * motor_count());
/** Woobat / Swoobat, Heart Stamp: each scored Heart (is_suit: Wild cards count, a debuffed card doesn't) earns `stamp_money` (Rough Gem's
 *  shape and dollar_buffer), Swoobat also X(Xmult_multi). Money is fixed; Energy raises only the X. */
function heart_stamp(card, context, x) {
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit('Hearts'))) return undefined;
  const ex = card.ability.extra;
  G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + ex.stamp_money;
  G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
  const r = { dollars: ex.stamp_money, card };
  if (x) r.x_mult = ex.Xmult_multi;
  return r;
}
/** Timburr / Gurdurr / Conkeldurr: each scored Stone card (has_enhancement: quantum Stone too) gives +mult, Conkeldurr also X(Xmult_multi) —
 *  a joker effect on top of whatever the card gives itself, so it stacks with Regirock's "+100 instead of +50" and Hippowdon's extra Chips. */
function pillars(card, context, x) {
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round && has_enhancement(context.other_card, 'm_stone'))) return undefined;
  const ex = card.ability.extra;
  return x ? { mult: ex.mult, x_mult: ex.Xmult_multi, card } : { mult: ex.mult, card };
}
/** Tympole / Palpitoad / Seismitoad, Swift Swim: is it RAINING? (a) the round's FIRST deal read Clubs: Castform's own forecast() says Rainy
 *  (Clubs held more than Hearts + Diamonds and more than Spades; a tie is not), remembered for the round (`rain_round`); or (b) a working
 *  Kyogre: held, undebuffed and not the loser of this round's Primal Clash (primal_on) — so on Groudon's round of a clash it isn't raining
 *  (and the forecast can't be Rainy either: Groudon only wins with at least as many red cards as Clubs). Rayquaza's calm keeps Kyogre
 *  working. (b) is live. Groudon alone doesn't stop a Clubs forecast (Cherrim's sun the other way round). Out of a round only (b) counts. */
const kyogre_rain = () => legends('kyogre').some((j) => primal_on(j));
export function swift_swim_raining(card) {
  const ex = card.ability.extra, GM = G.GAME;
  return !!((GM && GM.facing_blind && ex.rain_round === GM.round) || kyogre_rain());
}
function rain_read(card, context) {
  if (!first_deal(card, context)) return false;
  const ex = card.ability.extra;
  ex.forecast_round = G.GAME.round;
  if (forecast(G.hand.cards) === 'rainy') ex.rain_round = G.GAME.round;
  if (swift_swim_raining(card)) card_eval_status_text(card, 'extra', null, null, null, { message: 'Swift Swim!', colour: CASTFORM_FORMS.rainy.colour });
  return true;
}
const rain_state = (card) => (swift_swim_raining(card) ? 'Raining!' : G.GAME && G.GAME.facing_blind && card.ability.extra.forecast_round === G.GAME.round ? 'Not raining' : 'Not raining yet');
function swift_swim(card, context) {
  if (rain_read(card, context) || !context.joker_main) return undefined;
  const c = card.ability.extra.chips * (swift_swim_raining(card) ? 2 : 1);
  return { message: a_chips(r3(c)), colour: 'CHIPS', chip_mod: c };
}
/** Throh, Seismic Toss: the LOWEST-ranked scored card that can score (not debuffed, not rankless like Stone; Aces high, so an Ace is the
 *  lowest only when every candidate is an Ace); a tie the LEFTMOST. Sawk's Karate Chop is Inteleon's snipe_target (the highest). */
function toss_target(scoring_hand) {
  let best = null;
  for (const c of scoring_hand || []) {
    if (c.debuff || has_no_rank(c)) continue;
    if (!best || c.get_id() < best.get_id()) best = c;
  }
  return best;
}
/** Dojo Rivals: the partner held, undebuffed (find_card; a Blueprint isn't the partner). The bonus is fixed (rival_x / rival_mult). */
const dojo = (partner) => !!(G.jokers && find_card(partner).length > 0);
const throh_x = (card) => r3(card.ability.extra.Xmult_multi + (dojo('j_poke_sawk') ? card.ability.extra.rival_x : 0));
const sawk_mult = (card) => r3(card.ability.extra.mult + (dojo('j_poke_throh') ? card.ability.extra.rival_mult : 0));
// ---------------------------------------------------------------- Gen 5, batch 2 (#540-573; the owner's "Yes", 2026-10-28)
/** The Sewaddle line, the tailor: when a Blind is selected, ONE random UNENHANCED card of the full deck (G.playing_cards, the run's
 *  seeded pseudorandom_element: Cherubi's sweet_seeds) becomes one of the stage's cloths — Sewaddle a Bonus card; Swadloon a Bonus or
 *  Mult card; Leavanny a Bonus, Mult or Lucky card (the cloth is a second seeded pick, 'poke_tailor_cloth', drawn only when there is a
 *  choice). None unenhanced: nothing (it never overwrites another enhancement). One card a Blind, fixed (no Energy field). Blueprint
 *  copies it (Marble Joker's moment), as Cherubi's. */
export const TAILOR_CLOTHS = { sewaddle: ['m_bonus'], swadloon: ['m_bonus', 'm_mult'], leavanny: ['m_bonus', 'm_mult', 'm_lucky'] };
const CLOTH_WORD = { m_bonus: 'Bonus', m_mult: 'Mult', m_lucky: 'Lucky', m_wild: 'Wild' };
/** (The Gen 6 Spewpa / Vivillon reuse it: one Wild card, their own seed.) */
function tailor(card, context, cloths, seed = 'poke_sewaddle_tailor') {
  if (!context.setting_blind || card.getting_sliced || (context.blueprint_card && context.blueprint_card.getting_sliced)) return;
  const plain = (G.playing_cards || []).filter((c) => unbroken(c) && c.config.center.key === 'c_base');
  if (!plain.length) return;
  const [pick] = pseudorandom_element(plain, pseudoseed(seed));
  const cloth = cloths.length > 1 ? pseudorandom_element(cloths, pseudoseed('poke_tailor_cloth'))[0] : cloths[0];
  pick.set_ability(P_CENTERS[cloth], null, true);
  G.E_MANAGER.add_event(() => { pick.juice_up(); });
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: '+1 ' + CLOTH_WORD[cloth], colour: 'GREEN' });
}
/** Leavanny: each scored ENHANCED card (its own enhancement: any center but the plain card; Stone and Hazard cards included) gives
 *  +mult Mult. A retrigger repeats it; Blueprint copies it. */
function leaf_blade(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.config.center.key !== 'c_base') return { mult: card.ability.extra.mult, card };
  return undefined;
}

/** The Venipede line, Poison Point (a spreading poison): every card the PLAYER discards (pre_discard without `hook`, Trapinch's rule:
 *  The Hook and seals don't count) is poisoned for good: -chip_loss Chips (perma_bonus) and +mult_mod Mult (Steamodded's perma_mult,
 *  which the engine scores every time the card scores). The Chips are FLOORED at the card's own: perma_bonus never goes below minus
 *  the Chips the card gives without it (rank + enhancement bonus; a Stone card's +50), so a card's Chips stop at 0 and the Mult keeps
 *  growing; a card already at 0 (a Hazard card) loses nothing. Scolipede also turns each poisoned UNENHANCED card into a Mult card
 *  (seal, edition and the perma values kept). Blueprint copies it (Hiker's growth: a second dose). */
export const own_chips = (c) => {
  const a = c.ability;
  if (a.effect === 'Stone Card' || c.config.center.replace_base_card) return a.bonus || 0;
  return (c.base.nominal - (a.nominal_drain || 0)) + (a.bonus || 0);
};
export function poison_card(c, loss, gain) {
  const a = c.ability, perma = a.perma_bonus || 0;
  a.perma_bonus = Math.min(perma, Math.max(perma - loss, -own_chips(c)));
  a.perma_mult = r3((a.perma_mult || 0) + gain);
}
function poison_point(card, context) {
  if (!(context.pre_discard && !context.hook && !context.retrigger_joker && context.full_hand && context.full_hand.length)) return undefined;
  const ex = card.ability.extra;
  for (const c of context.full_hand) {
    poison_card(c, ex.chip_loss, ex.mult_mod);
    if (ex.toxic && c.config.center.key === 'c_base' && unbroken(c)) c.set_ability(P_CENTERS.m_mult, null, true);
  }
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: 'Poisoned!', colour: 'PURPLE' });
  return undefined;
}

/** Cottonee, Prankster: +h_size hand size while held, and the round's FIRST hand drawn draws 1 extra card: when a Blind is selected
 *  (before the deal) +1 temporary hand size (`prank_draw`), taken back on that first deal (first_hand_drawn), so the hand starts one
 *  card over its size and the next draw refills only to the normal size. Not Blueprint (one extra card a round). Sold or evolved
 *  with the +1 still pending, it gives back both. Whimsicott: +2 hand size, nothing temporary. */
const prankster = {
  add_to_deck(self, card) { G.hand.change_size(card.ability.extra.h_size); },
  remove_from_deck(self, card) {
    const ex = card.ability.extra;
    G.hand.change_size(-(ex.h_size + (ex.prank_draw || 0)));
    ex.prank_draw = 0;
  },
};
function prank_draw(card, context) {
  const ex = card.ability.extra;
  if (context.setting_blind && !context.blueprint && !card.getting_sliced && !ex.prank_draw) {
    ex.prank_draw = 1;
    G.hand.change_size(1);
    card_eval_status_text(card, 'extra', null, null, null, { message: '+1 card', colour: 'FILTER' });
  }
  if (context.first_hand_drawn && !context.blueprint && ex.prank_draw) {
    G.hand.change_size(-ex.prank_draw);
    ex.prank_draw = 0;
  }
}

/** Petilil / Lilligant: each scored Flower card (any card counting as one) earns $flower_money (fixed: money never takes Energy).
 *  A retrigger pays again; Blueprint copies it. Lilligant's Flower rule is Cherrim's poke_flower_rule (3+ suits; the fewest asked wins). */
function flower_money(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && has_enhancement(context.other_card, 'm_poke_flower')) {
    const dollars = card.ability.extra.flower_money;
    G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + dollars;
    return { dollars, card, func() { G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; }); } };
  }
  return undefined;
}

/** Basculin's stripe (the Shellos line's rolled-once trait, with its own art): Red or Blue, rolled when the card is created
 *  (set_ability initial, seeded 'basculin_stripe'), kept on ability.extra.form; upstream 3.9.1 draws both on the Gen 5 sheet
 *  (Red {4,0}, its own card; Blue {6,0}: systems/anim.js BASCULIN_SPRITES). */
export const STRIPES = { red: { name: 'Red-Striped', suits: ['Hearts', 'Diamonds'] }, blue: { name: 'Blue-Striped', suits: ['Clubs', 'Spades'] } };
export const stripe_of = (card) => (STRIPES[card.ability.extra.form] ? card.ability.extra.form : 'red');
function stripe_chips(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && STRIPES[stripe_of(card)].suits.some((s) => context.other_card.is_suit(s))) {
    return { chips: card.ability.extra.chips, card };
  }
  return undefined;
}
/** The owner's Gen 8 batch 3 (Pokermon r72): Basculin -> Basculegion. Every scored card of its stripe's suits (counted once per hand in
 *  `before`, from the scoring hand: a debuffed card or a Stone card isn't of a suit, a Wild card is; retriggers don't count again; not a
 *  Blueprint's copy) adds 1 to `stripe_scored`; at the end of a round with BASCULEGION_CARDS (25) or more it evolves (scaling_evo). The
 *  count is kept on every rules rev, the evolution only on r72+ (an older recorded move replays as recorded). */
export const BASCULEGION_CARDS = 25;
function stripe_count(card, context) {
  if (!(context.before && context.scoring_hand && !context.blueprint && !context.retrigger_joker)) return;
  const suits = STRIPES[stripe_of(card)].suits;
  const n = context.scoring_hand.filter((c) => suits.some((s) => c.is_suit(s))).length;
  if (n) card.ability.extra.stripe_scored = (card.ability.extra.stripe_scored || 0) + n;
}
function basculegion_evo(self, card, context) {
  if (rulesRev('pokermon') < 72 || !context.end_of_round) return undefined;
  return scaling_evo(self, card, context, 'j_poke_basculegion', card.ability.extra.stripe_scored || 0, BASCULEGION_CARDS);
}

/** The Sandile line, Moxie: when you beat a Blind (the main end_of_round pass, not a game over; Quaxly's moment) it banks +mult_mod
 *  Mult (`moxie_mult`), Krookodile +Xmult_mod X Mult instead (`moxie_Xmult` from X1), in fields Energy never touches (Quaxly's bank:
 *  never retroactive; carried through both evolutions). Gain first, then the evolution countdown. Not Blueprint. */
function blind_moxie(card, context) {
  if (round_end(context) && !context.blueprint && !context.retrigger_joker && !context.game_over) {
    if (card.ability.extra.Xmult_mod !== undefined) bank(card, 'moxie_Xmult', 'Xmult_mod', 1, 'XMULT');
    else bank(card, 'moxie_mult', 'mult_mod', 1, 'MULT');
  }
}
function moxie_main(card, context) {
  if (!context.joker_main) return undefined;
  const ex = card.ability.extra, r = {};
  if (ex.moxie_mult > 0) r.mult_mod = ex.moxie_mult;
  if (ex.moxie_Xmult > 1) r.Xmult_mod = ex.moxie_Xmult;
  if (!Object.keys(r).length) return undefined;
  r.message = r.Xmult_mod ? a_xmult(r.Xmult_mod) : a_mult(r.mult_mod);
  r.colour = r.Xmult_mod ? 'XMULT' : 'MULT';
  return r;
}

/** Maractus, a Hazard-held payoff: each Hazard card HELD in hand (any card counting as one, not debuffed) gives +mult Mult when a hand
 *  scores (h_mult, Baron's shape: Mime and held retriggers repeat it). Pokermon's Hazard layer deals them; Maractus turns them from a
 *  cost into fuel. */
const hazards_held = () => ((G.hand && G.hand.cards) || []).filter((c) => !c.debuff && has_enhancement(c, 'm_poke_hazard')).length;
function hazard_held_mult(card, context) {
  if (context.individual && context.cardarea === G.hand && !context.end_of_round && !context.other_card.debuff && has_enhancement(context.other_card, 'm_poke_hazard')) {
    return { h_mult: card.ability.extra.mult, card };
  }
  return undefined;
}

/** Dwebble / Crustle: +chips Chips for each Stone card in the full deck (any card counting as one). */
const stones_in_deck = () => (G.playing_cards || []).filter((c) => has_enhancement(c, 'm_stone')).length;
function stone_shell(card, context) {
  if (!context.joker_main) return undefined;
  const n = stones_in_deck(), chips = r3(card.ability.extra.chips * n);
  return chips > 0 ? { message: a_chips(chips), colour: 'CHIPS', chip_mod: chips } : undefined;
}

/** Sigilyph: using a Planet card for Pair (Mercury, or any mod's Planet whose hand_type is Pair) levels Pair up `levels` more time(s),
 *  after the Planet's own level (the using_consumeable context runs once the Planet is used). Not Blueprint; fixed. */
function sigil_pair(card, context) {
  const c = context.consumeable;
  if (context.using_consumeable && !context.blueprint && c && c.ability.set === 'Planet' && c.ability.consumeable && c.ability.consumeable.hand_type === 'Pair') {
    level_up_hand(card, 'Pair', null, card.ability.extra.levels);
    card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_level_up_ex'), colour: 'Planet' });
  }
}

/** Yamask / Cofagrigus: the first GRUDGE_CAP OTHER Jokers you sell each round (Yamask 1, Cofagrigus 2; the round is G.GAME.round, from
 *  selecting a Blind to selecting the next, its shop included) each bank +Xmult_mod X Mult (`grudge_Xmult` from X1, no energy field:
 *  never retroactive; carried through the evolution). Not Blueprint. A Joker Cofagrigus mummifies counts as sold for this (mummy_sell
 *  below) and uses up one of the round's grudges like any sale. The count is kept per card: `grudge_round` (the round counted) and
 *  `grudge_count` (grudges banked in it), both carried through the evolution (poke_custom_values_to_keep), so a Yamask that banked its 1
 *  this round evolves into a Cofagrigus with 1 left (2 in all that round, never a fresh 2). Neither is an energy field.
 *  contentRev 58 (the owner's nerf: it was every sale, uncapped). A re-simulated move recorded before r58 (a resumed or replayed old run,
 *  js/mods/pins.js RULES) banks every sale as it did, so a bank already earned stays; it still counts, so a run that switches to r58
 *  mid-round has that round's grudges used up. */
const YAMASK_LINE = ['j_poke_yamask', 'j_poke_cofagrigus'];
const GRUDGE_CAP = { j_poke_yamask: 1, j_poke_cofagrigus: 2 };
const nerf58 = () => rulesRev('pokermon') >= 58;
/** Pokermon r68 (the Komala fix): Joker effects skip Komala when choosing what to destroy, as an Eternal (index.js hooks.joker_destroy_immune ->
 *  the engine's can_be_destroyed_by_joker). On r65-r67 they targeted it, it refused (no_destroy) and the destroyer still took its gain
 *  (Ceremonial Dagger's +2x sell value every Blind): a recorded run replays as recorded. */
export const komala_destroy_immune = (card) => (card && card.ability && card.ability.name === 'komala' && rulesRev('pokermon') >= 68 ? true : undefined);
const grudge_cap = (card) => GRUDGE_CAP[card.config.center.key] || 1;
const grudge_used = (card) => { const ex = card.ability.extra; return G.GAME && ex.grudge_round === G.GAME.round ? (ex.grudge_count || 0) : 0; };
const grudge_left = (card) => Math.max(0, grudge_cap(card) - grudge_used(card));
function grudge(card) {
  if (!G.GAME) return;
  const used = grudge_used(card);
  if (nerf58() && used >= grudge_cap(card)) return;
  const ex = card.ability.extra;
  ex.grudge_round = G.GAME.round;
  ex.grudge_count = used + 1;
  bank(card, 'grudge_Xmult', 'Xmult_mod', 1, 'XMULT');
}
function grudge_sell(card, context) {
  if (context.selling_card && !context.blueprint && !context.retrigger_joker && context.card !== card && context.card.ability.set === 'Joker') grudge(card);
}
/** The owner's Gen 8 batch 3 (Pokermon r72): Yamask evolves into Runerigus INSTEAD of Cofagrigus if RUNERIGUS_STONES (10) Stone cards
 *  have scored while it was held (counted once per hand in `before`, from the scoring hand; not a Blueprint's copy), read when its
 *  evolution fires. Counted on every rules rev; the branch only on r72+ (an older recorded move evolves into Cofagrigus as recorded). */
export const RUNERIGUS_STONES = 10;
function wandering_count(card, context) {
  if (!(context.before && context.scoring_hand && !context.blueprint && !context.retrigger_joker)) return;
  const n = context.scoring_hand.filter((c) => has_enhancement(c, 'm_stone')).length;
  if (n) card.ability.extra.stones_scored = (card.ability.extra.stones_scored || 0) + n;
}
const runerigus_ready = (card) => rulesRev('pokermon') >= 72 && (card.ability.extra.stones_scored || 0) >= RUNERIGUS_STONES;
function grudge_main(card, context) {
  const x = card.ability.extra.grudge_Xmult;
  if (context.joker_main && x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
  return undefined;
}
/** Cofagrigus, Mummy (the sell_instead hook, index.js; run.js asks it before a player's sale): the FIRST Joker you sell each ANTE
 *  (contentRev 58, was each round; keyed by G.GAME.round_resets.ante in G.GAME.poke_mummy_ante: it re-arms when the Ante goes up, i.e.
 *  when the Boss Blind is beaten, so the shop after a Boss is already the next Ante's; one for the whole row, however many Cofagrigus)
 *  is NOT sold while an undebuffed Cofagrigus other than that Joker is held (find_card: a Blueprint is not one, so it can't copy
 *  Mummy). The Joker stays and becomes Negative instead (its old edition replaced; the Negative's +1 Joker slot makes room for it), no
 *  money is paid, and the vanilla sell contexts (selling_self / selling_card) don't run: nothing was sold. It still counts as a sale for
 *  the Yamask line's X (every undebuffed Yamask / Cofagrigus but the mummified one, within its round's grudges). An already Negative
 *  Joker is sold as usual, and uses up the Ante's Mummy (it was that Ante's first sale). A consumable is never mummified. A move
 *  recorded before r58 (pins.js RULES) keeps the old once-a-round key, G.GAME.poke_mummy_round; a Mummy used under it this round reads
 *  as used for the rest of this Ante too (a run that switched rules mid-round). -> true to keep it. */
export const mummy_used = () => {
  if (!G.GAME) return false;
  if (G.GAME.poke_mummy_round !== undefined && G.GAME.poke_mummy_round === G.GAME.round) return true;
  return nerf58() && G.GAME.poke_mummy_ante !== undefined && G.GAME.poke_mummy_ante === G.GAME.round_resets.ante;
};
export function mummy_sell(sold) {
  if (!sold || !sold.ability || sold.ability.set !== 'Joker' || sold.area !== G.jokers || !G.GAME) return false;
  const coffins = find_card('j_poke_cofagrigus').filter((j) => j !== sold);
  if (!coffins.length || mummy_used()) return false;
  if (nerf58()) G.GAME.poke_mummy_ante = G.GAME.round_resets.ante;
  else G.GAME.poke_mummy_round = G.GAME.round;
  if (sold.edition && sold.edition.negative) return false;
  sold.set_edition({ negative: true });
  for (const j of G.jokers.cards) if (j !== sold && !j.debuff && YAMASK_LINE.includes(j.config.center.key)) grudge(j);
  card_eval_status_text(coffins[0], 'extra', null, null, null, { message: 'Mummy!', colour: 'DARK_EDITION' });
  emit('card_changed', { card: sold.sort_id });
  return true;
}
const mummy_state = () => (mummy_used() ? 'used this Ante' : 'ready');

/** The fossils' Ancient (Kabuto's / Omanyte's cumulative tiers, pokejokers_05): how many cards of rank `id` are in the SCORING hand, read
 *  live from context.scoring_hand (no state kept between contexts). A Stone card has no rank. */
const ancient_tip = (info_queue, rank) => info_queue.push({ set: 'Other', key: 'ancient', vars: [localize(rank, 'ranks')] });
const ancient_count = (context, id) => (context.scoring_hand || []).filter((c) => !has_no_rank(c) && c.get_id() === id).length;
/** The 3+ tier fired: counts toward evolving (`third_times`, "Trigger 3+ ability 5 times"), never from a Blueprint or a retrigger. */
const ancient_third = (card, context) => { if (!context.blueprint && !context.retrigger_joker) card.ability.extra.third_times = (card.ability.extra.third_times || 0) + 1; };
/** Tirtouga / Carracosta, Ancient 9s: 1+ +chips1 Chips; 2+ each scored 9 permanently gains +chips2 Chips (perma_bonus, Kabuto's); 3+
 *  +chips3 Chips; Carracosta 4+ retriggers every scored 9. */
function ancient_nines(card, context) {
  const ex = card.ability.extra;
  if (context.joker_main && context.scoring_hand) {
    const n = ancient_count(context, 9);
    let chips = 0;
    if (n >= 1) chips += ex.chips1;
    if (n >= 3) { chips += ex.chips3; ancient_third(card, context); }
    if (chips > 0) return { message: a_chips(r3(chips)), colour: 'CHIPS', chip_mod: chips };
    return undefined;
  }
  if (context.individual && context.cardarea === G.play && !context.end_of_round && context.scoring_hand && !has_no_rank(context.other_card)
    && context.other_card.get_id() === 9 && ancient_count(context, 9) >= 2) {
    const a = context.other_card.ability;
    a.perma_bonus = r3((a.perma_bonus || 0) + ex.chips2);
    return { extra: { message: localize('k_upgrade_ex'), colour: 'CHIPS' }, colour: 'CHIPS', card };
  }
  if (ex.retriggers && context.repetition && context.cardarea === G.play && context.scoring_hand && !has_no_rank(context.other_card)
    && context.other_card.get_id() === 9 && ancient_count(context, 9) >= 4) {
    return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
  }
  return undefined;
}
/** Archen / Archeops, Ancient 10s: 1+ +mult Mult; 2+ X(Xmult); 3+ earn $ancient_money (once a hand: joker_main); Archeops 4+ X(Xmult2)
 *  too. Archeops's Defeatist: on the round's final hand (hands_left 0 while it scores, Azelf's check) every one of its numbers is
 *  halved: Mult / 2, an X keeps half its bonus (1 + (X - 1) / 2: X2 -> X1.5, X1.25 -> X1.125), the money rounds down ($3 -> $1). */
const defeatist = (card) => !!(card.ability.extra.Xmult2 !== undefined && G.GAME && G.GAME.facing_blind && final_hand());
const half_x = (x) => r3(1 + (x - 1) / 2);
export function ancient_tens_values(card) {
  const ex = card.ability.extra, half = defeatist(card);
  return {
    mult: r3(half ? ex.mult / 2 : ex.mult), x1: half ? half_x(ex.Xmult) : r3(ex.Xmult),
    x2: ex.Xmult2 === undefined ? undefined : (half ? half_x(ex.Xmult2) : r3(ex.Xmult2)),
    money: half ? Math.floor(ex.ancient_money / 2) : ex.ancient_money, half,
  };
}
function ancient_tens(card, context) {
  if (!context.joker_main || !context.scoring_hand) return undefined;
  const n = ancient_count(context, 10), v = ancient_tens_values(card);
  if (n < 1) return undefined;
  const r = { mult_mod: v.mult };
  let x = 1;
  if (n >= 2) x *= v.x1;
  if (n >= 4 && v.x2 !== undefined) x *= v.x2;
  if (x !== 1) r.Xmult_mod = x;
  if (n >= 3) { ancient_third(card, context); if (v.money > 0) r.dollars = v.money; }
  r.message = r.Xmult_mod ? a_xmult(r.Xmult_mod) : a_mult(v.mult);
  r.colour = r.Xmult_mod ? 'XMULT' : 'MULT';
  return r;
}

/** Minccino, Tidy Up: each discard you make (a player discard, once per discard, not per card) gives +1 hand size until your next hand
 *  is played (`tidy_draws`, taken back on press_play; and at the end of the round, or when it leaves, if still pending), so that
 *  discard's refill draws 1 extra card. Not Blueprint. */
function tidy_up(card, context) {
  const ex = card.ability.extra;
  if (context.pre_discard && !context.hook && !context.blueprint && !context.retrigger_joker) {
    ex.tidy_draws = (ex.tidy_draws || 0) + 1;
    G.hand.change_size(1);
    card_eval_status_text(card, 'extra', null, null, null, { message: '+1 card', colour: 'FILTER' });
    return;
  }
  if ((context.press_play || round_end(context) || context.setting_blind) && !context.blueprint && ex.tidy_draws) {
    G.hand.change_size(-ex.tidy_draws);
    ex.tidy_draws = 0;
  }
}
const tidy = {
  remove_from_deck(self, card) { const ex = card.ability.extra; if (ex.tidy_draws) { G.hand.change_size(-ex.tidy_draws); ex.tidy_draws = 0; } },
};
/** Cinccino, Skill Link: the FIRST scored card (by position: a debuffed one there gets nothing, the next is never promoted) retriggers
 *  once per discard used this round (current_round.discards_used: a discard USE, whatever its size; effect discards never count),
 *  at most `link_cap` (5) times. Blueprint copies it. */
const skill_links = (card) => Math.min(card.ability.extra.link_cap, (G.GAME && G.GAME.current_round && G.GAME.current_round.discards_used) || 0);
function skill_link(card, context) {
  if (context.repetition && context.cardarea === G.play && context.scoring_hand && context.scoring_hand[0] === context.other_card) {
    const n = skill_links(card);
    if (n > 0) return { message: localize('k_again_ex'), repetitions: n, card };
  }
  return undefined;
}

// ---------------------------------------------------------------- Gen 5, batch 3 (#580-637; the owner's "Build batch 3", 2026-10-29)
/** Ducklett / Swanna: the poker hand CONTAINS a Flush (the engine's poker_hands.Flush: a Straight Flush, a Flush House and a Flush Five
 *  contain one too). */
const has_flush = (context) => !!(context.poker_hands && (context.poker_hands.Flush || []).length > 0);

/** Deerling / Sawsbuck, Seasons: the season follows the Ante, cycling Spring -> Summer -> Autumn -> Winter (Ante 1 Spring, 2 Summer, 3
 *  Autumn, 4 Winter, 5 Spring...): DETERMINISTIC, read from G.GAME.round_resets.ante, so there is nothing to roll or save and every
 *  Deerling / Sawsbuck agrees. It changes at the start of each Ante (the ante goes up when its Boss Blind is beaten, so the shop after the
 *  Boss is already the next season). An Ante below 1 (a Hieroglyph) keeps cycling backwards (Ante 0 is Winter). Each season has a suit:
 *  Spring Hearts, Summer Diamonds, Autumn Clubs, Winter Spades. */
export const SEASONS = {
  spring: { name: 'Spring', suit: 'Hearts', colour: '#f0a0c8' },
  summer: { name: 'Summer', suit: 'Diamonds', colour: '#4bc292' },
  autumn: { name: 'Autumn', suit: 'Clubs', colour: '#e97333' },
  winter: { name: 'Winter', suit: 'Spades', colour: '#82c8e8' },
};
export const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];
export const season_of_ante = (ante) => SEASON_ORDER[((((ante === undefined || ante === null ? 1 : ante) - 1) % 4) + 4) % 4];
export const season_now = () => season_of_ante(G.GAME && G.GAME.round_resets && G.GAME.round_resets.ante);
/** A scored card of the season's suit (is_suit: a Wild card counts, a debuffed card doesn't). */
const season_card = (context) => !!(context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit(SEASONS[season_now()].suit));
const season_vars = () => { const s = SEASONS[season_now()]; return { name: s.name, suit: localize(s.suit, 'suits_plural'), colour: s.suit }; };

/** Emolga, Static: each scored face card (is_face: a Jack, Queen or King — or any card with Pareidolia; a debuffed card is no face) earns
 *  $static_money (fixed) and gives +mult Mult. Heart Stamp's money (dollar_buffer). A retrigger pays and scores again. */
function static_face(card, context) {
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_face())) return undefined;
  const ex = card.ability.extra;
  G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + ex.static_money;
  G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
  return { dollars: ex.static_money, mult: ex.mult, card };
}

/** Karrablast + Shelmet, the trade pair: they evolve ONLY together. Pairing: the undebuffed Karrablasts and Shelmets in row order, the 1st
 *  Karrablast with the 1st Shelmet, the 2nd with the 2nd... (a Blueprint is neither); one left without a partner counts nothing. At each
 *  end of round (the main pass, once for the whole row: whichever of them is calculated first does it) every paired one counts a round
 *  held together (`together`, at most 4; a counter of its own, kept if the partner leaves: a new partner must catch up). When BOTH of a
 *  pair have 4, that end of round Karrablast becomes Escavalier and Shelmet becomes Accelgor at the same time. An Everstone stops the
 *  evolution, not the count. */
export const TRADE_NEED = 4;
const TRADE_INTO = { j_poke_karrablast: 'j_poke_escavalier', j_poke_shelmet: 'j_poke_accelgor' };
export function trade_pairs() {
  const row = (G.jokers && G.jokers.cards) || [];
  const k = row.filter((j) => !j.debuff && j.config.center.key === 'j_poke_karrablast');
  const s = row.filter((j) => !j.debuff && j.config.center.key === 'j_poke_shelmet');
  return k.slice(0, Math.min(k.length, s.length)).map((j, i) => [j, s[i]]);
}
const trade_partner = (card) => { for (const [k, s] of trade_pairs()) { if (k === card) return s; if (s === card) return k; } return null; };
function trade_round(self, card, context) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over || card.debuff) return;
  const GM = G.GAME;
  if (GM.poke_trade_round === GM.round) return;
  GM.poke_trade_round = GM.round;
  for (const pair of trade_pairs()) {
    for (const j of pair) j.ability.extra.together = Math.min(TRADE_NEED, (j.ability.extra.together || 0) + 1);
    const ready = pair.every((j) => j.ability.extra.together >= TRADE_NEED);
    if (ready && pair.every((j) => can_evolve(P_CENTERS[j.config.center.key], j, context, TRADE_INTO[j.config.center.key]))) {
      for (const j of pair) poke_evolve(j, TRADE_INTO[j.config.center.key]);
    } else {
      for (const j of pair) card_eval_status_text(j, 'extra', null, null, null, { message: 'Trade ' + j.ability.extra.together + '/' + TRADE_NEED, colour: 'FILTER' });
    }
  }
}
const trade_state = (card, partner) => {
  const p = G.jokers && G.jokers.cards.includes(card) ? trade_partner(card) : null;
  return p ? 'with ' + partner : 'needs ' + partner;
};

/** Escavalier / Durant (and the owner's Registeel): the value a held Steel card's X becomes, INSTEAD of X1.5 — a card-level rule
 *  (regi_h_x_mult below, the chip_h_x_mult hook), so the best one wins and they never stack: Registeel X2 (`Xmult_multi`), Durant X1.75
 *  (`Xmult_multi`, energized), Escavalier X1.75 (`steel_x`, fixed: its Energy goes to its own X1.5). Only undebuffed ones count. */
const STEEL_RULES = { j_poke_registeel: 'Xmult_multi', j_poke_durant: 'Xmult_multi', j_poke_escavalier: 'steel_x' };
export function steel_rule_x() {
  let best = 0;
  for (const j of (G.jokers && G.jokers.cards) || []) {
    const f = !j.debuff && STEEL_RULES[j.config.center.key];
    if (f && j.ability.extra[f] > best) best = j.ability.extra[f];
  }
  return best || undefined;
}

/** Accelgor: +hands hand and +d_size discard each round while held (Kyogre's / Vibrava's pairs in ONE add / remove, as discards_scry:
 *  two spread pairs would overwrite each other), and +mult Mult for each hand left (current_round.hands_left while it scores: the hand
 *  being scored is already used, so the round's last hand counts 0). */
const hands_discards = {
  add_to_deck(self, card, from_debuff) {
    const ex = card.ability.extra;
    G.GAME.round_resets.hands += ex.hands;
    if (!from_debuff) ease_hands_played(ex.hands);
    G.GAME.round_resets.discards += ex.d_size;
    ease_discard(ex.d_size);
  },
  remove_from_deck(self, card) {
    const ex = card.ability.extra;
    G.GAME.round_resets.hands -= ex.hands;
    const dec = Math.min(G.GAME.current_round.hands_left - 1, ex.hands);
    if (dec > 0) ease_hands_played(-dec);
    G.GAME.round_resets.discards -= ex.d_size;
    ease_discard(-ex.d_size);
  },
};
const hands_left_now = () => Math.max(0, (G.GAME && G.GAME.current_round && G.GAME.current_round.hands_left) || 0);

/** Foongus: at the end of each shop (Manaphy's Egg moment, not Blueprint), WITH consumable room only (no room, no roll: a full row never
 *  moves the seeded stream), a num in dem chance (Pokermon's pseudorandom_probability, seed 'foongus': Oops! All 6s raises it, Absol
 *  fixes it) to create a Poke Ball (Pokermon's Item c_poke_pokeball). Made at once, so a second Foongus sees the room taken. */
function foongus_ball(card, context) {
  if (!context.ending_shop || context.blueprint || !consumable_room()) return;
  const ex = card.ability.extra;
  if (!pseudorandom_probability(card, 'foongus', ex.num, ex.dem, 'foongus')) return;
  add_card({ set: 'Item', key: 'c_poke_pokeball', key_append: 'foongus' });
  card_eval_status_text(card, 'extra', null, null, null, { message: '+1 Poke Ball', colour: 'GREEN' });
}

/** Amoonguss, Spore: during the round's FIRST hand the Boss Blind's ability is off, and it comes back once that hand has scored. The engine's
 *  Blind.suspend (blind.js): from the round's first deal (index.js draw_from_deck_to_hand, before the dealt cards land, so The House / The
 *  Wheel / The Mark / The Fish don't flip them and Cerulean Bell forces nothing) to the end of the first hand's scoring (index.js
 *  hand_scored; discards before it are inside). Meanwhile the Blind is `off` for every rule it applies in play: its debuffed cards and
 *  jokers are lifted at once (The Goad / Head / Club / Window / Plant / Pillar, Verdant Leaf), hands aren't debuffed (The Psychic, The Eye,
 *  The Mouth, The Arm, The Ox: nor recorded, so The Eye / The Mouth start with the second hand), The Flint doesn't halve, The Hook / The
 *  Tooth do nothing on that play, and a mod blind's calculate sees itself disabled (Pokermon's six). Its set-up at selection stays (The
 *  Wall / Violet Vessel's size, The Water / The Needle / The Manacle's counts, Amber Acorn's shuffle, White Executive's debuffed cards).
 *  It is not Blind:disable: nothing is undone for good, so a Chicot or Luchador during the first hand still disables the Blind for good.
 *  Once per round, Boss Blinds only, with an undebuffed Amoonguss held at the first deal; sold or debuffed meanwhile (no other Amoonguss
 *  left), the Blind comes back at once. */
export function spore_first_deal() {
  const GM = G.GAME, b = GM && GM.blind, cr = GM && GM.current_round;
  if (!b || !GM.facing_blind || !b.boss || b.disabled || b.suspended || !cr || cr.hands_played !== 0 || cr.discards_used !== 0) return;
  if (G.STATE !== G.STATES.DRAW_TO_HAND || GM.poke_spore_round === GM.round) return;
  const spores = find_card('j_poke_amoonguss');
  if (!spores.length) return;
  GM.poke_spore_round = GM.round;
  b.suspend(true);
  card_eval_status_text(spores[0], 'extra', null, null, null, { message: 'Spore!', colour: 'GREEN' });
}
export function spore_hand_scored() {
  const b = G.GAME && G.GAME.blind;
  if (b && b.suspended) b.suspend(false);
}
const spore_state = () => {
  const GM = G.GAME, b = GM && GM.blind;
  if (!GM || !GM.facing_blind || !b || !b.boss) return 'next Boss Blind';
  if (b.suspended) return 'active this hand';
  return GM.poke_spore_round === GM.round ? 'used this round' : 'not this round';
};

/** Alomomola, Healing Heart: the FIRST playing card destroyed each round (any cause: the remove_playing_cards context every destroying
 *  path sends — Glass shattering, The Hanged Man, a devouring joker, a destroying discard) is copied back into your full deck: a new card
 *  of the same rank, suit, enhancement, seal and edition (copy_card, as Cryptid / DNA; its permanent bonuses too), shuffled into the
 *  draw pile (G.deck). The original is still destroyed, so every "a card is destroyed" payoff fires. Each Alomomola copies once a round
 *  (`heal_round`, from selecting a Blind to selecting the next, its shop included). Not Blueprint (one copy a round). */
function healing_heart(card, context) {
  if (!context.remove_playing_cards || context.blueprint || !(context.removed || []).length) return;
  const ex = card.ability.extra;
  if (ex.heal_round === G.GAME.round) return;
  const orig = context.removed.find((c) => c && c.config && c.base);
  if (!orig) return;
  ex.heal_round = G.GAME.round;
  G.playing_card = (G.playing_card || 0) + 1;
  const copy = copy_card(orig, undefined, undefined, G.playing_card);
  delete copy.ability.poke_frozen;
  copy.ability.discarded = undefined;
  copy.add_to_deck();
  G.deck.config.card_limit = G.deck.config.card_limit + 1;
  G.playing_cards.push(copy);
  G.deck.emplace(copy);
  if (G.GAME.blind && G.GAME.facing_blind) G.GAME.blind.debuff_card(copy); else copy.set_debuff(false);
  playing_card_joker_effects([copy]);
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Healing Heart!', colour: 'BLUE' });
}
const heal_state = (card) => (G.GAME && card.ability.extra.heal_round === G.GAME.round ? 'used this round' : 'ready');

/** Joltik: OTHER Lightning Jokers (is_type: a Tera sticker counts, it replaces the type; undebuffed), itself never. */
const other_lightning = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && !j.debuff && is_type(j, 'Lightning')).length;
/** Galvantula, Electroweb: each Gold card held in hand (not debuffed) gives X(Xmult_multi) when a hand scores (Baron's held shape: Mime and
 *  held retriggers repeat it). */
function electroweb(card, context) {
  if (context.individual && context.cardarea === G.hand && !context.end_of_round && !context.other_card.debuff && has_enhancement(context.other_card, 'm_gold')) {
    return { x_mult: card.ability.extra.Xmult_multi, card };
  }
  return undefined;
}
/** The Tynamo line: Steel cards in the full deck (any card counting as one) / held in hand (not debuffed). */
const steel_in_deck = () => (G.playing_cards || []).filter((c) => has_enhancement(c, 'm_steel')).length;
const steel_held_count = () => ((G.hand && G.hand.cards) || []).filter((c) => !c.debuff && has_enhancement(c, 'm_steel')).length;
const eelektross_x = (card) => r3(card.ability.extra.Xmult + card.ability.extra.Xmult_mod * steel_in_deck());

/** Cubchoo: each scored Glass card (any card counting as one) gives +chips Chips. */
function glass_chips(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && has_enhancement(context.other_card, 'm_glass')) return { chips: card.ability.extra.chips, card };
  return undefined;
}

/** Beartic, Freeze: at each end of round (the main pass, not Blueprint, not a game over) the LEFTMOST card held in hand is frozen
 *  (card.ability.poke_frozen = this Beartic's sort_id): it STAYS IN YOUR HAND into the next round (index.js keep_in_hand: run.js leaves it
 *  in the hand when the round's end empties it, and when a pack opened in the shop closes), and the next round's deal fills around it
 *  (the hand is dealt up to its size, the frozen card already counting). While frozen it gives X(Xmult_multi) when a hand scores (a held
 *  effect: Mime and held retriggers repeat it; Blueprint copies it). It thaws once it is played or discarded (index.js play_pressed /
 *  discard_card; an effect discard such as The Hook's too), or when it leaves the hand any other way. At most ONE card per Beartic: while
 *  its frozen card is still held at the end of a round it stays frozen and nothing else is (it is held one more round); once it has thawed,
 *  the next end of round freezes the leftmost held card again. A card another Beartic froze is skipped (two Beartics freeze two cards).
 *  A Beartic sold or destroyed leaves its card unfrozen: it goes back to the deck at the next end of round. A debuffed Beartic gives no X
 *  and freezes nothing new, but its frozen card stays. Nothing to save by hand: a resumed run is rebuilt from its recipe, so the same card
 *  is frozen again. */
export const frozen_by = (c) => {
  const id = c && c.ability && c.ability.poke_frozen;
  if (id === undefined || id === null) return null;
  return ((G.jokers && G.jokers.cards) || []).find((j) => j.sort_id === id && j.config.center.key === 'j_poke_beartic') || null;
};
export function freeze_keep(c) { return !!(c && c.area === G.hand && frozen_by(c)); }
export function freeze_thaw(cards) { for (const c of cards || []) if (c && c.ability && c.ability.poke_frozen !== undefined) { delete c.ability.poke_frozen; emit('card_changed', { card: c.sort_id }); } }
const frozen_card = (card) => ((G.hand && G.hand.cards) || []).find((c) => c.ability.poke_frozen === card.sort_id) || null;
function freeze(card, context) {
  if (round_end(context) && !context.blueprint && !context.retrigger_joker && !context.game_over) {
    const mine = frozen_card(card);
    for (const c of G.playing_cards || []) if (c !== mine && c.ability.poke_frozen === card.sort_id) delete c.ability.poke_frozen; // (it left the hand: thawed)
    if (mine) return undefined;
    const pick = G.hand.cards.find((c) => unbroken(c) && !frozen_by(c));
    if (!pick) return undefined;
    pick.ability.poke_frozen = card.sort_id;
    emit('card_changed', { card: pick.sort_id });
    G.E_MANAGER.add_event(() => { pick.juice_up(); });
    card_eval_status_text(card, 'extra', null, null, null, { message: 'Frozen!', colour: '#82c8e8' });
    return undefined;
  }
  if (context.individual && context.cardarea === G.hand && !context.end_of_round && context.other_card.ability.poke_frozen === card.sort_id && !context.other_card.debuff) {
    return { x_mult: card.ability.extra.Xmult_multi, card };
  }
  return undefined;
}
const card_name = (c) => (c ? (has_no_rank(c) ? localize({ type: 'name_text', set: 'Enhanced', key: c.config.center.key }) : localize(c.base.value, 'ranks') + ' of ' + localize(c.base.suit, 'suits_plural')) : 'none');

/** Stunfisk, Static: each player discard (pre_discard without `hook`: The Hook's and the seals' discards don't count) earns $static_money,
 *  at most $money_cap a round (`static_paid`, kept with its round). Money is fixed: Energy-inert. Not Blueprint (the cap is its own). */
function static_discard(card, context) {
  if (!context.pre_discard || context.hook || context.blueprint || context.retrigger_joker) return undefined;
  const ex = card.ability.extra;
  if (ex.static_round !== G.GAME.round) { ex.static_round = G.GAME.round; ex.static_paid = 0; }
  const pay = Math.min(ex.static_money, ex.money_cap - ex.static_paid);
  if (pay <= 0) return undefined;
  ex.static_paid += pay;
  ease_dollars(pay);
  card_eval_status_text(card, 'dollars', pay);
  return undefined;
}
const static_paid = (card) => { const ex = card.ability.extra; return G.GAME && ex.static_round === G.GAME.round ? ex.static_paid || 0 : 0; };

/** Mienfoo / Mienshao: the TOP n scored cards by rank (Aces high; a tie the leftmost; never a debuffed or rankless (Stone) card): Sawk's
 *  snipe_target taken n times. Read from the scoring hand at every repetition call, so the same cards are picked each time. */
function top_ranked(scoring_hand, n) {
  const live = (scoring_hand || []).filter((c) => !c.debuff && !has_no_rank(c));
  return live.map((c, i) => [c, i]).sort((a, b) => b[0].get_id() - a[0].get_id() || a[1] - b[1]).slice(0, n).map(([c]) => c);
}
function top_retrigger(card, context) {
  if (context.repetition && context.cardarea === G.play && !context.end_of_round && top_ranked(context.scoring_hand, card.ability.extra.targets).includes(context.other_card)) {
    return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
  }
  return undefined;
}

/** Bouffalant, Head Charge: beat a Blind with the round's FIRST hand (current_round.hands_played === 1 at the end of round, Scraggy's Moxie
 *  check; not a game over) and it banks +Xmult_mod X Mult (`charge_Xmult` from X1, no energy field: never retroactive), up to Xmult_cap
 *  (X4 in all, fixed). Not Blueprint (it copies the X). */
function head_charge(card, context) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over || G.GAME.current_round.hands_played !== 1) return;
  const ex = card.ability.extra;
  if (ex.charge_Xmult >= ex.Xmult_cap) return;
  ex.charge_Xmult = r3(Math.min(ex.Xmult_cap, ex.charge_Xmult + ex.Xmult_mod));
  card_eval_status_text(card, 'extra', null, null, null, { message: a_xmult(ex.charge_Xmult), colour: 'XMULT' });
}

/** Rufflet / Braviary: facing a Boss Blind (G.GAME.blind.boss while a Blind is faced; a disabled Boss is still a Boss). */
const boss_now = () => !!(G.GAME && G.GAME.facing_blind && G.GAME.blind && G.GAME.blind.boss);

/** Heatmor + Durant, the rivals. Heatmor: +mult Mult per discard used this round (current_round.discards_used: a discard USE; effect
 *  discards never count). Together (an undebuffed Durant held: find_card; a Blueprint isn't one) Heatmor banks +Xmult_mod X Mult at each
 *  end of round (`ant_Xmult` from X1, no energy field: Energy never raises what is banked), and Heatmor gives that X from then on, with or
 *  without Durant. Durant's own rule is the card-level Steel one (steel_rule_x). Not Blueprint for the bank. */
const rivals = () => !!(G.jokers && find_card('j_poke_durant').length > 0);
const discards_used = () => (G.GAME && G.GAME.current_round && G.GAME.current_round.discards_used) || 0;
function heatmor_calc(card, context) {
  const ex = card.ability.extra;
  if (round_end(context) && !context.blueprint && !context.retrigger_joker && !context.game_over && rivals()) {
    ex.ant_Xmult = r3(ex.ant_Xmult + ex.Xmult_mod);
    card_eval_status_text(card, 'extra', null, null, null, { message: a_xmult(ex.ant_Xmult), colour: 'XMULT' });
    return undefined;
  }
  if (!context.joker_main) return undefined;
  const m = r3(ex.mult * discards_used()), r = {};
  if (m > 0) r.mult_mod = m;
  if (ex.ant_Xmult > 1) r.Xmult_mod = ex.ant_Xmult;
  if (!Object.keys(r).length) return undefined;
  r.message = r.Xmult_mod ? a_xmult(r.Xmult_mod) : a_mult(m);
  r.colour = r.Xmult_mod ? 'XMULT' : 'MULT';
  return r;
}

/** Volcarona: while an undebuffed one is held it is ALWAYS SUNNY. It ADDS sun to the shared check (cherrim_sunny: Cherrim's Sunshine
 *  Form, Larvesta) and Castform turns Sunny on its first deal; it doesn't touch rain: Kyogre still rains (Swift Swim) and Kyogre's lock
 *  or Primal Clash win keeps Castform Rainy (Volcarona doesn't override Kyogre), and the Primal Clash itself is read as before (a held
 *  Volcarona is not a side). So with Kyogre and Volcarona it is both raining and sunny. Live: bought or sold mid-round, it changes the
 *  sun checks at once (not Castform's form, which holds for the round). */
const volcarona_sun = () => legends('volcarona').length > 0;
/** Larvesta: the round's FIRST deal reads the sun (Castform's forecast: Hearts + Diamonds held most), remembered for the round
 *  (`sun_round`, Cherrim's field), so cherrim_sunny answers for it as for Cherrim. */
function sun_read(card, context) {
  if (!first_deal(card, context, 'sunread_round')) return false;
  const ex = card.ability.extra;
  ex.sunread_round = G.GAME.round;
  if (forecast(G.hand.cards) === 'sunny') ex.sun_round = G.GAME.round;
  if (cherrim_sunny(card)) card_eval_status_text(card, 'extra', null, null, null, { message: 'Sunny!', colour: CASTFORM_FORMS.sunny.colour });
  return true;
}
const sun_state = (card) => (cherrim_sunny(card) ? 'Sunny!' : G.GAME && G.GAME.facing_blind && card.ability.extra.sunread_round === G.GAME.round ? 'Not sunny' : 'Not sunny yet');
/** Volcarona, Quiver Dance: each Fire Joker (is_type: a Tera counts; undebuffed; itself included) gives X(Xmult_multi), the other_joker
 *  context (Manaphy's "each Water Joker gives"). */
const fire_joker = (j) => !!(j && j.ability && j.ability.set === 'Joker' && !j.debuff && is_type(j, 'Fire'));
const fire_count = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && fire_joker(j)).length + (is_type(card, 'Fire') ? 1 : 0);

// ---------------------------------------------------------------- Gen 6, batch 1 (contentRev 61)
/** The Fletchling line, Gale Wings: the round's FIRST hand (Pachirisu's spark_on: current_round.hands_played === 0 while it scores; a discard
 *  before it doesn't use it up). Talonflame's first scored card (scoring_hand[0], by position: a debuffed one there scores nothing) retriggers
 *  on that hand. The tooltip's state is spark_state's ("Active!" / "Used this round"; the shop: the next round's first hand). */
function gale_retrigger(card, context) {
  if (context.repetition && context.cardarea === G.play && !context.end_of_round && spark_on() && (context.scoring_hand || [])[0] === context.other_card) {
    return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
  }
  return undefined;
}
/** The Scatterbug line: a scored Wild card (has_enhancement: a quantum Wild counts). */
const wild_scored = (context) => !!(context.individual && context.cardarea === G.play && !context.end_of_round && has_enhancement(context.other_card, 'm_wild'));
/** Vivillon's patterns: upstream 3.9.1 draws 20 on the Gen 6 sheet (pokespriteload.lua `vivillon` base.pos, unnamed there): one is rolled
 *  ONCE, when the card becomes a Vivillon (set_ability initial: created, or evolved from Spewpa — its own seed 'vivillon_pattern'), kept on
 *  ability.extra.form (1-20; 1 is the center's own card). systems/anim.js GEN6_FORM_SPRITES. */
export const VIVILLON_PATTERNS = 20;
/** The Flabébé line's flower colour: rolled once when a card of the line is created (set_ability initial, seed 'flabebe_flower'), kept through
 *  both evolutions (`form`, NAMES_TO_KEEP). Upstream 3.9.1 draws the five colours of each, in this order (the first the center's own card). */
export const FLOWERS = ['red', 'white', 'yellow', 'orange', 'blue'];
const FLOWER_NAME = { red: 'Red', white: 'White', yellow: 'Yellow', orange: 'Orange', blue: 'Blue' };
const flower_of = (card) => (FLOWERS.includes(card.ability.extra.form) ? card.ability.extra.form : 'red');
const queen_scored = (context, area) => !!(context.cardarea === G.play && !context.end_of_round && context.other_card && !has_no_rank(context.other_card)
  && context.other_card.get_id() === 12 && (area === 'repetition' ? context.repetition : context.individual));
/** The Skiddo line: OTHER Grass Jokers (Barboach / Starly's count: is_type, undebuffed; itself never). */
const grass_others = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && !j.debuff && is_type(j, 'Grass')).length;
const goat_chips = (card) => r3(card.ability.extra.chips + card.ability.extra.chips1 * grass_others(card));
/** Pancham: evolves after 5 rounds, but only at an end of round while you hold an undebuffed Dark Joker (another one: is_type, so a Dark
 *  Tera sticker counts); otherwise it waits at 0 rounds and evolves at the first end of round with one (Glameow's slot wait). */
const dark_held = (card) => ((G.jokers && G.jokers.cards) || []).some((j) => j !== card && !j.debuff && is_type(j, 'Dark'));
function pancham_evo(self, card, context) {
  const ex = card.ability.extra;
  if (!can_evolve(self, card, context, 'j_poke_pangoro') || card.debuff || ex.rounds === undefined || ex.rounds > 1) return level_evo(self, card, context, 'j_poke_pangoro');
  if (!dark_held(card)) {
    ex.rounds = 0;
    card_eval_status_text(card, 'extra', null, null, null, { message: 'Needs a Dark Joker!', colour: 'FILTER' });
    return undefined;
  }
  return level_evo(self, card, context, 'j_poke_pangoro');
}
const face_scored = (context) => !!(context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_face());
/** Furfrou's trims, one per Ante (Glameow's fickle pick: picked when obtained — add_to_deck, if none yet — and again at each Ante change, the
 *  run's seeded pseudorandom_element over the trims MINUS the current one, seeded 'furfrou_trim' + the new Ante; never on creation). Each trim
 *  keys a suit (the spec's: Heart Hearts, Diamond Diamonds, Star Spades, Debutante Clubs). Kept on ability.extra.form, so the view draws the
 *  trim's own 3.9.1 card (systems/anim.js GEN6_FORM_SPRITES); unset (a shop card) it is the Natural card. */
export const TRIMS = {
  heart: { name: 'Heart Trim', suit: 'Hearts' }, diamond: { name: 'Diamond Trim', suit: 'Diamonds' },
  star: { name: 'Star Trim', suit: 'Spades' }, debutante: { name: 'Debutante Trim', suit: 'Clubs' },
};
const TRIM_ORDER = ['heart', 'diamond', 'star', 'debutante'];
export function furfrou_trim(card) {
  const ex = card.ability.extra;
  const left = TRIM_ORDER.filter((t) => t !== ex.form);
  ex.form = pseudorandom_element(left, pseudoseed('furfrou_trim' + G.GAME.round_resets.ante))[0];
  emit('card_changed', { card: card.sort_id });
  return ex.form;
}
const trim_of = (card) => (TRIMS[card.ability.extra.form] ? card.ability.extra.form : null);
const trim_scored = (card, context) => { const t = trim_of(card); return !!(t && context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit(TRIMS[t].suit)); };
/** Meowstic: its gender is rolled when it becomes a Meowstic (set_ability initial: evolved from Espurr, or created; seed 'meowstic_gender'),
 *  kept on ability.extra.form ('male' / 'female'). A Male has no number: its Energy fields are dropped, so Energy can't be used on it (never a
 *  silent no-op). */
const tarots_held = () => ((G.consumeables && G.consumeables.cards) || []).filter((c) => c.ability.set === 'Tarot').length;
const meow_x = (card) => r3(card.ability.extra.Xmult + card.ability.extra.Xmult_mod * tarots_held());
const meow_female = (card) => card.ability.extra.form === 'female';
/** Male Meowstic, Prankster: at end of round (the main pass, not Blueprint), a random Tarot, with consumable room only (Pickup's check; no room,
 *  nothing). The card is the run's seeded create_card. */
function prankster_tarot(card, context) {
  if (!round_end(context) || context.blueprint || meow_female(card) || !consumable_room()) return;
  G.GAME.consumeable_buffer = (G.GAME.consumeable_buffer || 0) + 1;
  G.E_MANAGER.add_event(() => {
    const c = create_card('Tarot', G.consumeables, null, null, null, null, undefined, 'meowstic');
    c.add_to_deck();
    G.consumeables.emplace(c);
    G.GAME.consumeable_buffer = 0;
  });
  card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_plus_tarot'), colour: 'Tarot' });
}

// ------------------------------------------------------------ Gen 6, batch 2 (#682-715)
/** Spritzee / Aromatisse, Healing Aroma: each scored Lucky card (has_enhancement: a quantum Lucky too; a debuffed card never scores
 *  its effects) earns `aroma_money` (fixed: money takes no Energy), whether or not its own rolls hit (Heart Stamp's shape and
 *  dollar_buffer). Blueprint copies it. Aromatisse also has Super Luck (+1 to both Lucky rolls, super_luck above). */
function healing_aroma(card, context) {
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round && has_enhancement(context.other_card, 'm_lucky'))) return undefined;
  const money = card.ability.extra.aroma_money;
  G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + money;
  G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
  return { dollars: money, card };
}
/** Swirlix / Slurpuff, Sweet Veil: every Tarot used (by anyone, while it is held) banks +mult_mod Mult in `sweet_mult` (no energy field:
 *  what is banked keeps its worth; Energy raises only later gains; carried into Slurpuff), and it gives the bank in joker_main. Not
 *  Blueprint for the gain (Delphox's Mystical Fire shape); Blueprint copies the Mult. */
function sweet_veil(card, context) {
  const ex = card.ability.extra;
  if (context.using_consumeable && context.consumeable && context.consumeable.ability.set === 'Tarot') {
    if (context.blueprint) return undefined;
    ex.sweet_mult = r3(ex.sweet_mult + ex.mult_mod);
    card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'MULT' });
    return undefined;
  }
  if (context.joker_main && ex.sweet_mult > 0) return { message: a_mult(r3(ex.sweet_mult)), colour: 'MULT', mult_mod: ex.sweet_mult };
  return undefined;
}
/** Slurpuff: +card_limit consumable slots while held AND undebuffed (Alakazam's slot, given and taken at once; fixed). */
const sweet_slot = {
  add_to_deck(self, card) { G.consumeables.config.card_limit += card.ability.extra.card_limit; },
  remove_from_deck(self, card) { G.consumeables.config.card_limit -= card.ability.extra.card_limit; },
};
/** Inkay: each scored 2, 3, 4 or 5 (a rankless Stone card never) gives +mult Mult. */
const LOW_RANKS = [2, 3, 4, 5];
function inkay_low(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && !has_no_rank(context.other_card) && LOW_RANKS.includes(context.other_card.get_id())) {
    return { mult: card.ability.extra.mult, card };
  }
  return undefined;
}
/** Malamar, Topsy-Turvy (hook chip_bonus, a Card:get_chip_bonus wrap, Regirock's seam): while an undebuffed Malamar is held, every playing
 *  card's chip bonus uses the Chips of its FLIPPED rank instead of its own rank's (2 <-> Ace, 3 <-> King, 4 <-> Queen, 5 <-> Jack,
 *  6 <-> 10, 7 <-> 9, 8 stays 8): a 2 scores 11, an Ace 2, a King 3, a 6 10. Only the rank's part changes: the enhancement's bonus (a
 *  Bonus card's +30) and the card's own perma_bonus (Hiker's +5 a score, Tirtouga's +5) stay on top. A Stone card (no rank; it replaces
 *  the base card) and any rankless card are unaffected; a debuffed card scores 0 as usual; a rank outside 2-Ace (an add-on's) keeps its
 *  Chips. Two Malamars flip once (it is a rule, not a stacking bonus). Card level, so a retrigger (Hack, Hawlucha) scores the flipped
 *  Chips again, and every reader of a card's Chips sees them. */
const FLIP = { 2: 14, 3: 13, 4: 12, 5: 11, 6: 10, 7: 9, 8: 8, 9: 7, 10: 6, 11: 5, 12: 4, 13: 3, 14: 2 };
const rank_chips = (id) => (id === 14 ? 11 : id >= 11 ? 10 : id);
const malamar_on = () => ((G.jokers && G.jokers.cards) || []).some((j) => !j.debuff && j.config.center.key === 'j_poke_malamar');
/** The flipped rank's Chips for a card (undefined: no flip applies). Exported for the tests / tooltips. */
export function flipped_chips(card) {
  if (!card || !card.base || card.ability.set === 'Joker' || card.ability.effect === 'Stone Card' || card.config.center.replace_base_card || card.config.center.no_rank) return undefined;
  const f = FLIP[card.base.id];
  return f === undefined ? undefined : rank_chips(f);
}
export function malamar_chip_bonus(v, card) {
  if (!card || card.debuff || !G.jokers || !malamar_on()) return undefined;
  const f = flipped_chips(card);
  if (f === undefined || typeof card.base.nominal !== 'number') return undefined;
  return v - card.base.nominal + f;
}
/** Malamar r73 (the owner's buff, "malamar is so weak please fix"): each scored 2, 3, 4 or 5 (its real rank, not the flipped one; a Stone
 *  card never) ALSO gives X(Xmult_multi), on top of Topsy-Turvy. Card level, so a retrigger gives it again. A move recorded before r73 (a
 *  resumed / replayed run, js/mods/pins.js RULES) never sees it, and a Malamar made on those rules has no `Xmult_multi` at all (its
 *  set_ability deletes it), so an Energy still skips it exactly as before. One made on them and kept past a re-pin gives the base X1.25. */
const malamar_x73 = () => rulesRev('pokermon') >= 73;
function malamar_low_x(card, context) {
  if (!malamar_x73() || !(context.individual && context.cardarea === G.play && !context.end_of_round && !has_no_rank(context.other_card) && LOW_RANKS.includes(context.other_card.get_id()))) return undefined;
  const x = card.ability.extra.Xmult_multi;
  return { x_mult: typeof x === 'number' ? x : P_CENTERS.j_poke_malamar.config.extra.Xmult_multi, card };
}
/** Binacle / Barbaracle: each scored 7 gives +chips Chips (Barbaracle also X(Xmult_multi)). */
function seven_rocks(card, context, x) {
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round && !has_no_rank(context.other_card) && context.other_card.get_id() === 7)) return undefined;
  const ex = card.ability.extra;
  return x ? { chips: ex.chips, x_mult: ex.Xmult_multi, card } : { chips: ex.chips, card };
}
/** One random card of the FULL deck becomes `enh` (seeded): unenhanced cards first; once none is left, any card that isn't already
 *  `enh` (its enhancement replaced; seal and edition kept), never a card being destroyed nor one in `skip`. -> the card, or undefined. */
function deck_convert(enh, seed, skip) {
  const live = (G.playing_cards || []).filter((c) => unbroken(c) && !(skip && skip.includes(c)));
  const plain = live.filter((c) => c.config.center.key === 'c_base');
  const pool = plain.length ? plain : live.filter((c) => c.config.center.key !== enh);
  if (!pool.length) return undefined;
  const [pick] = pseudorandom_element(pool, pseudoseed(seed));
  pick.set_ability(P_CENTERS[enh], null, true);
  G.E_MANAGER.add_event(() => { pick.juice_up(); });
  return pick;
}
/** Skrelp / Dragalge, Poison Point: when a Blind is selected, 1 random card of the full deck becomes a Hazard card (unenhanced first:
 *  the Regis' rule, so a fully enhanced deck loses an enhancement). Blueprint copies it (as Marble Joker). */
function skrelp_poison(card, context) {
  if (!context.setting_blind || card.getting_sliced || (context.blueprint_card && context.blueprint_card.getting_sliced)) return;
  if (deck_convert('m_poke_hazard', 'poke_skrelp_hazard')) card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: '+1 Hazard', colour: 'PURPLE' });
}
/** Skrelp: +mult Mult per Hazard card in the full deck (any card counting as one). */
const hazards_in_deck = () => (G.playing_cards || []).filter((c) => unbroken(c) && has_enhancement(c, 'm_poke_hazard')).length;
/** Dragalge: each Hazard card HELD in hand (not debuffed) gives X(Xmult_multi) (Galvantula's held shape: Mime repeats it). */
function hazard_held_x(card, context) {
  if (context.individual && context.cardarea === G.hand && !context.end_of_round && !context.other_card.debuff && has_enhancement(context.other_card, 'm_poke_hazard')) {
    return { x_mult: card.ability.extra.Xmult_multi, card };
  }
  return undefined;
}
/** Tyrunt / Tyrantrum, Ancient Kings (ancient_tens' shape, read live): 1+ +mult Mult; 2+ X(Xmult); 3+ every scored King retriggers
 *  (`retriggers`, fixed); Tyrantrum 4+ X(Xmult2) too (the tiers multiply). The 3+ tier counts once a HAND (joker_main), never from a
 *  Blueprint or a joker retrigger. */
function ancient_kings(card, context) {
  const ex = card.ability.extra;
  if (context.repetition && context.cardarea === G.play && context.scoring_hand && !has_no_rank(context.other_card)
    && context.other_card.get_id() === 13 && ancient_count(context, 13) >= 3) {
    return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
  }
  if (!context.joker_main || !context.scoring_hand) return undefined;
  const n = ancient_count(context, 13);
  if (n < 1) return undefined;
  const r = { mult_mod: ex.mult };
  let x = 1;
  if (n >= 2) x *= ex.Xmult;
  if (n >= 4 && ex.Xmult2 !== undefined) x *= ex.Xmult2;
  if (x !== 1) r.Xmult_mod = r3(x);
  if (n >= 3) ancient_third(card, context);
  r.message = r.Xmult_mod ? a_xmult(r.Xmult_mod) : a_mult(r3(ex.mult));
  r.colour = r.Xmult_mod ? 'XMULT' : 'MULT';
  return r;
}
/** Amaura / Aurorus, Ancient Queens: 1+ +chips Chips; 2+ the LEFTMOST scored Queen that isn't Glass (nor debuffed) becomes Glass in
 *  `before` (Midas Mask's moment: it scores as Glass this hand), one a hand, never from a Blueprint; 3+ earn $ancient_money (once a
 *  hand, joker_main; fixed); Aurorus 4+ X(Xmult2). The 3+ tier counts once a hand toward evolving. */
const queen_to_glass = (context) => (context.scoring_hand || []).find((c) => !c.debuff && !has_no_rank(c) && c.get_id() === 12 && !has_enhancement(c, 'm_glass'));
function ancient_queens(card, context) {
  const ex = card.ability.extra;
  if (context.before && !context.blueprint && !context.retrigger_joker && context.scoring_hand && ancient_count(context, 12) >= 2) {
    const q = queen_to_glass(context);
    if (q) {
      q.set_ability(P_CENTERS.m_glass, null, true);
      G.E_MANAGER.add_event(() => { q.juice_up(); });
      card_eval_status_text(card, 'extra', null, null, null, { message: 'Glass!', colour: 'CHIPS' });
    }
    return undefined;
  }
  if (!context.joker_main || !context.scoring_hand) return undefined;
  const n = ancient_count(context, 12);
  if (n < 1) return undefined;
  const r = { chip_mod: ex.chips, message: a_chips(r3(ex.chips)), colour: 'CHIPS' };
  if (n >= 4 && ex.Xmult2 !== undefined) { r.Xmult_mod = ex.Xmult2; r.message = a_xmult(r3(ex.Xmult2)); r.colour = 'XMULT'; }
  if (n >= 3) { ancient_third(card, context); if (ex.ancient_money > 0) r.dollars = ex.ancient_money; }
  return r;
}
/** Hawlucha, Flying Press: the FIRST and the LAST scored card (by position in the scoring hand, Cinccino's / Shellos's rule: a debuffed
 *  card there gets nothing, the ends never shift inward) each retrigger `retriggers` time(s); a single scored card is both ends and
 *  retriggers once in all (not twice). Blueprint copies it. */
function flying_press(card, context) {
  if (!(context.repetition && context.cardarea === G.play && context.scoring_hand && context.scoring_hand.length)) return undefined;
  const sh = context.scoring_hand, c = context.other_card;
  if (c === sh[0] || c === sh[sh.length - 1]) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
  return undefined;
}
/** Klefki, Key Ring: the run's Voucher record (G.GAME.used_vouchers: every Voucher redeemed this run, read live, so one bought late
 *  counts all those before it; a deck's or challenge's starting Voucher is on that record too). */
export const vouchers_redeemed = () => Object.values((G.GAME && G.GAME.used_vouchers) || {}).filter(Boolean).length;
const key_ring_x = (card) => r3(1 + card.ability.extra.Xmult_mod * vouchers_redeemed());
/** Phantump / Trevenant, Forest's Curse: each playing card destroyed (remove_playing_cards, every destroying path: a Glass card
 *  shattering, Hanged Man, a Hazard's end-of-round roll, Gulpin's swallow...) banks +mult_mod Mult in `curse_mult` (no energy field:
 *  never retroactive; carried into Trevenant), given in joker_main. Trevenant also plants a Seed per destroyed card: a random
 *  UNENHANCED card of the full deck (not one being destroyed) becomes a Seed card; none unenhanced, no Seed (Cherubi's rule: it never
 *  overwrites). Not Blueprint for the gain or the Seeds; Blueprint copies the Mult. */
function forest_curse(card, context, seeds) {
  const ex = card.ability.extra;
  if (context.remove_playing_cards && !context.blueprint && (context.removed || []).length) {
    const n = context.removed.length;
    ex.curse_mult = r3(ex.curse_mult + ex.mult_mod * n);
    let planted = 0;
    if (seeds) {
      for (let i = 0; i < n; i++) {
        const plain = (G.playing_cards || []).filter((c) => unbroken(c) && !context.removed.includes(c) && c.config.center.key === 'c_base');
        if (!plain.length) break;
        const [pick] = pseudorandom_element(plain, pseudoseed('poke_trevenant_seed'));
        pick.set_ability(P_CENTERS.m_poke_seed, null, true);
        planted++;
      }
    }
    card_eval_status_text(card, 'extra', null, null, null, { message: planted ? '+' + planted + ' Seed' : a_mult(ex.curse_mult), colour: planted ? 'GREEN' : 'MULT' });
    return undefined;
  }
  if (context.joker_main && ex.curse_mult > 0) return { message: a_mult(r3(ex.curse_mult)), colour: 'MULT', mult_mod: ex.curse_mult };
  return undefined;
}
/** Noibat / Noivern, Supersonic: Glass cards break twice as often. r69 (the owner's "2 Noiverns still 1/2 to break glass", 2026-11-02):
 *  EACH undebuffed Noibat / Noivern doubles the Glass roll's NUMERATOR in the mod_probability pass (identifier 'glass': a Glass card's
 *  1 in 4, a quantum Glass's too), stacking the way Oops! All 6s does: one copy 2 in 4 (1 in 2), two 4 in 4 (always), and Oops! doubles
 *  it again afterwards; Regice's Ice Body (fix_probability, 0) still wins: with Regice no Glass breaks at all. A debuffed copy is not
 *  asked (calculate_joker skips it); a Tera'd one still is (a sticker changes its type, not its ability). r62-r68 halved the
 *  DENOMINATOR and copies never stacked (1 in 2 at best): a run recorded on those revs replays so (rulesRev). Not Blueprint. */
const glass_den = (t) => (t && t.ability && t.ability.name === 'Glass Card' && typeof t.ability.extra === 'number' ? t.ability.extra : (P_CENTERS.m_glass.config.extra || 4));
const glass_stack69 = () => rulesRev('pokermon') >= 69;
function supersonic(card, context) {
  if (context.mod_probability && !context.blueprint && context.identifier === 'glass') {
    if (glass_stack69()) return { numerator: context.numerator * 2 };
    return { denominator: Math.min(context.denominator, Math.max(1, glass_den(context.trigger_obj) / 2)) };
  }
  return undefined;
}
/** The odds a Glass card breaks now, as text ('1 in 2', 'always', 'never'): every Noibat / Noivern held counted; from the shop, this
 *  card's own doubling added on top (what it would be once bought). */
function glass_odds_vars(card) {
  const held = G.jokers && G.jokers.cards.includes(card);
  let [n, d] = get_probability_vars(card, 1, 4, 'glass');
  if (!held) n *= 2;
  return [odds_text(n, d)];
}
/** Noibat: each Glass card that shatters (remove_playing_cards, the `shattered` ones: Whismur's count) banks +mult_mod Mult in `bat_mult`;
 *  Noivern banks +Xmult_mod X Mult in `bat_Xmult` instead (Noibat's Mult carried and still given) and turns one random card of the
 *  full deck into Glass for each (unenhanced first, then any non-Glass card; never one being destroyed). Banks never retroactive (no
 *  energy field). Not Blueprint for the gains or the Glass; Blueprint copies the score. Every extra shatter also grows the Whismur line
 *  (its own remove_playing_cards count). */
function boomburst(card, context, x) {
  const ex = card.ability.extra;
  if (context.remove_playing_cards && !context.blueprint && context.removed) {
    const broken = context.removed.filter((c) => c.shattered);
    if (!broken.length) return undefined;
    if (x) {
      ex.bat_Xmult = r3(ex.bat_Xmult + ex.Xmult_mod * broken.length);
      let made = 0;
      for (let i = 0; i < broken.length; i++) if (deck_convert('m_glass', 'poke_noivern_glass', context.removed)) made++;
      card_eval_status_text(card, 'extra', null, null, null, { message: made ? '+' + made + ' Glass' : a_xmult(ex.bat_Xmult), colour: 'XMULT' });
    } else {
      ex.bat_mult = r3(ex.bat_mult + ex.mult_mod * broken.length);
      card_eval_status_text(card, 'extra', null, null, null, { message: a_mult(ex.bat_mult), colour: 'MULT' });
    }
    return undefined;
  }
  if (!context.joker_main) return undefined;
  const r = {};
  if (ex.bat_mult > 0) r.mult_mod = ex.bat_mult;
  if (ex.bat_Xmult && ex.bat_Xmult > 1) r.Xmult_mod = ex.bat_Xmult;
  if (!Object.keys(r).length) return undefined;
  r.message = r.Xmult_mod ? a_xmult(r3(r.Xmult_mod)) : a_mult(r3(r.mult_mod));
  r.colour = r.Xmult_mod ? 'XMULT' : 'MULT';
  return r;
}

// ------------------------------------------------------------ Gen 7, batch 1 (#731-756)
/** Pikipek / Trumbeak, Multi-hit: each hand hits 2-5 times, rolled ONCE a hand in `before` (not Blueprint, not a joker retrigger) on
 *  the run's seeded stream (seed 'poke_multi_hit'), at the main series' Gen 5+ odds: 2 or 3 hits 35% each, 4 or 5 hits 15% each
 *  (3.1 on average). The roll is kept on the joker (`hits`, for the tooltip and a Blueprint copy, which gives the same hits); joker_main
 *  gives +mult per hit. A debuffed hand (The Eye, The Psychic...) has no `before` pass: no roll, no Mult. Toucannon's Skill Link is always
 *  5 hits (MULTI_HIT_MAX). The hit count is fixed (never energized); Energy raises the per-hit number. */
export const MULTI_HIT = [[2, 0.35], [3, 0.35], [4, 0.15], [5, 0.15]];
export const MULTI_HIT_MAX = 5;
export function multi_hit_roll() {
  const r = pseudorandom(pseudoseed('poke_multi_hit'));
  let acc = 0;
  for (const [n, p] of MULTI_HIT) { acc += p; if (r < acc) return n; }
  return MULTI_HIT_MAX;
}
function multi_hit(card, context) {
  const ex = card.ability.extra;
  if (context.before && context.cardarea === G.jokers && !context.blueprint && !context.retrigger_joker) {
    ex.hits = multi_hit_roll();
    card_eval_status_text(card, 'extra', null, null, null, { message: ex.hits + ' hits!', colour: 'MULT' });
    return undefined;
  }
  if (context.joker_main && ex.hits > 0) { const m = r3(ex.mult * ex.hits); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
  return undefined;
}
/** Toucannon, Skill Link: always 5 hits, each X(Xmult_multi): one X of Xmult_multi^5 (X1.1 -> X1.61051) in joker_main. */
const skill_link_x = (card) => Math.pow(card.ability.extra.Xmult_multi, MULTI_HIT_MAX);
/** Yungoos / Gumshoos, Stakeout: the poker hand played differs from the LAST poker hand played this run. The run's record is Pokermon's
 *  own G.GAME.poke_last_hand (systems/rules.js calculate: set in the mod's `after` pass of every hand, a debuffed one too), so it is
 *  kept with or without a Yungoos and a late buy sees it; during scoring it still names the PREVIOUS hand. The run's first hand (no
 *  record yet) counts as different. */
export const stakeout_on = (context) => !!(context.scoring_name && context.scoring_name !== (G.GAME && G.GAME.poke_last_hand));
const last_hand_vars = () => { const h = G.GAME && G.GAME.poke_last_hand; return h ? localize(h, 'poker_hands') : 'none yet'; };
/** Crabrawler / Crabominable, Power-Up Punch: the FIRST scored card (scoring_hand[0], by position: a debuffed card there scores nothing,
 *  the first never shifts inward) permanently gains +mult_mod Mult (Crabominable: +mult_mod2), every other scored card +mult_mod
 *  (Crabominable only) — Steamodded's perma_mult (Hiker's way: the card keeps it and gives it each time it scores AFTER this; a
 *  retrigger of the card gains again, as Hiker). Never from a Blueprint (blueprint_compat false: the gain is the whole joker). */
function power_up_punch(card, context, all) {
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round && context.scoring_hand) || context.blueprint) return undefined;
  const ex = card.ability.extra, first = context.other_card === context.scoring_hand[0];
  const gain = first ? (all ? ex.mult_mod2 : ex.mult_mod) : all ? ex.mult_mod : 0;
  if (!gain) return undefined;
  const a = context.other_card.ability;
  a.perma_mult = r3((a.perma_mult || 0) + gain);
  return { extra: { message: localize('k_upgrade_ex'), colour: 'MULT' }, colour: 'MULT', card };
}
/** Oricorio's dance styles: the suit held most on the round's first deal picks one (Castform's moment and counting: is_suit, so a Wild
 *  card counts for all four suits and a debuffed / suitless card for none; but the four suits apart, no red pair). A tie for the most, or
 *  no suited card, keeps the current style. The style STAYS between rounds (ability.extra.form; no evolution). Its type follows the style
 *  (ability.extra.ptype, Castform's / Greninja's way: a Tera sticker still owns the type); the shop card is Baile (Fire). */
export const ORICORIO_STYLES = {
  baile: { name: 'Baile Style', suit: 'Hearts', ptype: 'Fire' },
  pompom: { name: 'Pom-Pom Style', suit: 'Diamonds', ptype: 'Lightning' },
  pau: { name: 'Pa\'u Style', suit: 'Spades', ptype: 'Psychic' },
  sensu: { name: 'Sensu Style', suit: 'Clubs', ptype: 'Psychic' },
};
const STYLE_OF_SUIT = { Hearts: 'baile', Diamonds: 'pompom', Spades: 'pau', Clubs: 'sensu' };
export function dance_pick(cards, current) {
  const n = { Hearts: 0, Diamonds: 0, Spades: 0, Clubs: 0 };
  for (const c of cards || []) for (const s of Object.keys(n)) if (c.is_suit(s)) n[s] += 1;
  const top = Math.max(...Object.values(n));
  const best = Object.keys(n).filter((s) => n[s] === top);
  return top > 0 && best.length === 1 ? STYLE_OF_SUIT[best[0]] : current;
}
export const style_of = (card) => (ORICORIO_STYLES[card.ability.extra.form] ? card.ability.extra.form : 'baile');
function oricorio_set(card, style) {
  const ex = card.ability.extra, t = ORICORIO_STYLES[style].ptype;
  const changed = ex.form !== style || ex.ptype !== t;
  ex.form = style;
  ex.ptype = t;
  if (!changed) return;
  card.set_debuff();
  sync_kecleons();
  emit('card_changed', { card: card.sort_id });
}
function revelation_dance(card, context) {
  if (first_deal(card, context, 'dance_round')) {
    card.ability.extra.dance_round = G.GAME.round;
    const s = dance_pick(G.hand.cards, style_of(card));
    oricorio_set(card, s);
    card_eval_status_text(card, 'extra', null, null, null, { message: ORICORIO_STYLES[s].name + '!', colour: 'FILTER' });
    return undefined;
  }
  if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit(ORICORIO_STYLES[style_of(card)].suit)) {
    return { x_mult: card.ability.extra.Xmult_multi, card };
  }
  return undefined;
}
/** Cutiefly / Ribombee, the first Fairy team count (Barboach / Starly's: is_type, so a Tera sticker counts and replaces; not debuffed;
 *  itself always included, +1, so the shop card shows what it gives once bought). */
const fairy_count = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && !j.debuff && is_type(j, 'Fairy')).length + 1;
/** Wishiwashi, Schooling: School Form while the hands left BEFORE this hand are at least half the round's hands, rounded up (4 hands: the
 *  1st-3rd hands; 5: the 1st-3rd; 3: the 1st-2nd). The round's hands = hands already played + hands left before this one, so a hand
 *  given at the round's start (Kyogre, Burglar) counts in both. While a hand scores run.js has already taken it (hands_left is one less):
 *  `scoring` adds it back. Out of a round (the shop) it is the next round's first hand: School. */
export function school_on(scoring) {
  const GM = G.GAME, cr = GM && GM.current_round;
  if (!cr || !GM.facing_blind) return true;
  const before = (cr.hands_left || 0) + (scoring ? 1 : 0);
  const total = (cr.hands_played || 0) + before;
  return before >= Math.ceil(total / 2);
}
/** Mareanie / Toxapex, Merciless: the Boss Blinds beaten this run, Pokermon's own run record G.GAME.poke_bosses_beaten (systems/rules.js
 *  calculate: +1 in the end-of-round pass of a won Boss Blind, with or without a Mareanie), so a late buy counts every one. */
export const bosses_beaten = () => (G.GAME && G.GAME.poke_bosses_beaten) || 0;
/** Dewpider / Araquanid, Water Bubble: scored Clubs (is_suit) +chips Chips, Araquanid also X(Xmult_multi); both DOUBLED while it's raining
 *  (Swift Swim's check, swift_swim_raining / rain_read: Clubs held most on the round's first deal, or a working Kyogre). Doubled X means
 *  its bonus doubles: X(1 + 2 x (X - 1)), X1.25 -> X1.5. */
function water_bubble(card, context, x) {
  if (rain_read(card, context)) return undefined;
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit('Clubs'))) return undefined;
  const ex = card.ability.extra, k = swift_swim_raining(card) ? 2 : 1;
  const r = { chips: r3(ex.chips * k), card };
  if (x) r.x_mult = r3(1 + k * (ex.Xmult_multi - 1));
  return r;
}
/** Fomantis / Lurantis, Solar Blade: the round's FINAL hand (final_hand: hands_left 0 while it scores, i.e. 1 before it is played). */
const final_vars = () => (G.GAME && G.GAME.facing_blind && G.GAME.current_round.hands_left <= 1 ? 'Active!' : 'Inactive');
/** Morelull / Shiinotic: Lucky cards in the full deck (has_enhancement: a quantum Lucky counts). */
const lucky_in_deck = () => (G.playing_cards || []).filter((c) => unbroken(c) && has_enhancement(c, 'm_lucky')).length;
const glow_mult = (card) => r3(card.ability.extra.mult * lucky_in_deck() + (card.ability.extra.glow_mult || 0));

defineJokers({
  // ---------------------------------------------------------------- LINE A: Shinx -> Luxio -> Luxray (Lightning, Gen 4)
  // Shinx 403: +1 Foresight; a played card sharing a rank with a Foreseen card earns $1 when scored. Evolves in 4 rounds.
  shinx: {
    name: 'shinx', poke_sprite391: sprite('Natdex', 24, 26),
    config: { extra: { scry: 1, money: 1, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Lightning', gen: 4, blueprint_compat: true,
    attributes: ['foresight', 'economy', 'round_evo'], poke_after: 'kricketune',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, ex.money, ex.rounds] }; },
    calculate(self, card, context) { return lux_calc(card, context, 'shinx') || level_evo(self, card, context, 'j_poke_luxio'); },
    ...scry,
  },
  // Luxio 404: +2 Foresight; matching cards give +6 Mult and earn $1. Evolves in 5 rounds.
  luxio: {
    name: 'luxio', poke_sprite391: sprite('Natdex', 26, 26),
    config: { extra: { scry: 2, mult: 6, money: 1, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Lightning', gen: 4, blueprint_compat: true,
    attributes: ['foresight', 'mult', 'economy', 'round_evo'], poke_after: 'shinx',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, ex.mult, ex.money, ex.rounds] }; },
    calculate(self, card, context) { return lux_calc(card, context, 'luxio') || level_evo(self, card, context, 'j_poke_luxray'); },
    ...scry,
  },
  // Luxray 405: +3 Foresight; matching cards give X1.4 Mult and earn $1.
  luxray: {
    name: 'luxray', poke_sprite391: sprite('Natdex', 28, 26),
    config: { extra: { scry: 3, Xmult_multi: 1.4, money: 1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Lightning', gen: 4, blueprint_compat: true,
    attributes: ['foresight', 'xmult', 'economy'], poke_after: 'luxio',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, ex.Xmult_multi, ex.money] }; },
    calculate(self, card, context) { return lux_calc(card, context, 'luxray'); },
    ...scry,
  },

  // ---------------------------------------------------------------- LINE B: Honedge -> Doublade -> Aegislash (Metal, Gen 6)
  // Honedge 679: gains +1 Mult per Steel card held when a hand is played; evolves at +20 Mult.
  honedge: {
    name: 'honedge', poke_sprite391: sprite('Natdex', 6, 45),
    config: { evo_rqmt: 20, extra: { mult: 0, mult_mod: 1 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Metal', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'enhancements', 'scaling_evo'], poke_after: 'pyroar',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); const ex = card.ability.extra; return { vars: [ex.mult_mod, ex.mult, self.config.evo_rqmt] }; },
    calculate(self, card, context) { return blade_scale(card, context) || scaling_evo(self, card, context, 'j_poke_doublade', card.ability.extra.mult, self.config.evo_rqmt); },
  },
  // Doublade 680: +2 Mult per held Steel card; the first 2 Steel cards held are retriggered. Evolves with a Dusk Stone.
  doublade: {
    name: 'doublade', poke_sprite391: sprite('Natdex', 8, 45),
    config: { extra: { mult: 0, mult_mod: 2, steel_retriggers: 2, retriggers: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Metal', gen: 6, blueprint_compat: true, item_req: 'duskstone',
    attributes: ['mult', 'scaling', 'enhancements', 'retrigger', 'item_evo'], poke_after: 'honedge',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push(P_CENTERS.m_steel);
      const ex = card.ability.extra;
      return { vars: [ex.mult_mod, ex.steel_retriggers, ex.mult] };
    },
    calculate(self, card, context) {
      const r = blade_scale(card, context);
      if (r) return r;
      // the first `steel_retriggers` Steel cards held (that score: not debuffed), left to right
      if (context.repetition && context.cardarea === G.hand && held_effective(context) && has_enhancement(context.other_card, 'm_steel')) {
        const first = held_steel().filter((c) => !c.debuff).slice(0, card.ability.extra.steel_retriggers);
        if (first.includes(context.other_card)) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return item_evo(self, card, context, 'j_poke_aegislash');
    },
  },
  // Aegislash 681: +20 Mult (kept from Doublade); Stance Change — Blade Forme X2.5 Mult, Shield Forme retriggers every held Steel
  // card. A played hand switches to Blade, a discard to Shield; each round starts in Shield.
  aegislash: {
    name: 'aegislash', poke_sprite391: sprite('Gen06', 6, 8),
    config: { extra: { mult: 20, Xmult: 2.5, retriggers: 1, form: 'shield' } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Metal', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'enhancements', 'retrigger', 'discard'], poke_after: 'doublade',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push(P_CENTERS.m_steel);
      const ex = card.ability.extra;
      return { vars: [ex.mult, ex.Xmult, ex.form === 'blade' ? 'Blade' : 'Shield'] };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.joker_main) {
        if (ex.form === 'blade') return { message: a_xmult(ex.Xmult), colour: 'XMULT', mult_mod: ex.mult, Xmult_mod: ex.Xmult };
        return { message: a_mult(ex.mult), colour: 'MULT', mult_mod: ex.mult };
      }
      if (context.repetition && context.cardarea === G.hand && ex.form !== 'blade' && held_effective(context) && has_enhancement(context.other_card, 'm_steel')) {
        return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
      }
      if (context.after && context.cardarea === G.jokers && !context.blueprint && ex.form !== 'blade') {
        ex.form = 'blade';
        return { message: 'Blade Forme', colour: 'XMULT' };
      }
      if (context.pre_discard && !context.blueprint && ex.form !== 'shield') {
        ex.form = 'shield';
        card_eval_status_text(card, 'extra', null, null, null, { message: 'Shield Forme', colour: 'FILTER' });
      }
      if (round_end(context) && !context.blueprint) ex.form = 'shield';
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE C: Spheal -> Sealeo -> Walrein (Water, Gen 3)
  // Spheal 363: Rollout +10 Chips, doubled for each consecutive hand of the same poker hand (max 4 doublings). Evolves in 5 rounds.
  spheal: {
    name: 'spheal', poke_sprite391: sprite('Natdex', 4, 24),
    config: { extra: { chips: 10, streak: 0, max_streak: 4, rounds: 5 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'hand_type', 'reset', 'round_evo'], poke_after: 'glalie',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.chips, ex.max_streak, rollout_chips(ex), ex.rounds] }; },
    calculate(self, card, context) { rollout(card, context); return rollout_main(card, context) || level_evo(self, card, context, 'j_poke_sealeo'); },
  },
  // Sealeo 364: +1 hand; Rollout +20 Chips. Evolves in 5 rounds.
  sealeo: {
    name: 'sealeo', poke_sprite391: sprite('Natdex', 6, 24),
    config: { extra: { hands: 1, chips: 20, streak: 0, max_streak: 4, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'hands', 'hand_type', 'reset', 'round_evo'], poke_after: 'spheal',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, ex.chips, ex.max_streak, ex.rounds, rollout_chips(ex)] }; },
    calculate(self, card, context) { rollout(card, context); return rollout_main(card, context) || level_evo(self, card, context, 'j_poke_walrein'); },
    ...hands,
  },
  // Walrein 365: +1 hand; Rollout +40 Chips; Sheer Cold X3 Mult while Rollout is at full power.
  walrein: {
    name: 'walrein', poke_sprite391: sprite('Natdex', 8, 24),
    config: { extra: { hands: 1, chips: 40, streak: 0, max_streak: 4, Xmult: 3 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'hands', 'hand_type', 'reset'], poke_after: 'sealeo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, ex.chips, ex.max_streak, ex.Xmult, rollout_chips(ex)] }; },
    calculate(self, card, context) { rollout(card, context); return rollout_main(card, context); },
    ...hands,
  },

  // ---------------------------------------------------------------- LINE D: Grookey -> Thwackey -> Rillaboom (Grass starter, Gen 8)
  // Grookey 810: +1 hand size; every 4th card scored this round is retriggered. Evolves after 12 beats.
  // (contentRev 21: on-beat cards also give +1 Mult — the lead-in to Rillaboom's Drum Beating; `mult` is its Energy field.)
  grookey: {
    name: 'grookey', poke_sprite391: sprite('Natdex', 28, 53),
    config: { evo_rqmt: 12, extra: { h_size: 1, every: 4, beat: 0, beats: 0, retriggers: 1, mult: 1 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 8, blueprint_compat: true, starter: true,
    attributes: ['starter', 'hand_size', 'retrigger', 'mult', 'trigger_evo'], poke_after: 'mega_drampa',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, ordinal(ex.every), ex.beat % ex.every, Math.max(0, self.config.evo_rqmt - ex.beats), ex.every, ex.mult] }; },
    calculate(self, card, context) { return beat_calc(card, context) || scaling_evo(self, card, context, 'j_poke_thwackey', card.ability.extra.beats, self.config.evo_rqmt); },
    ...hand_size,
  },
  // Thwackey 811: +1 hand size; every 3rd card scored this round is retriggered, and gives +2 Mult (contentRev 21: the lead-in to
  // Drum Beating, so Energy has a field to scale — `mult`, as Rillaboom's). Evolves after 16 beats.
  thwackey: {
    name: 'thwackey', poke_sprite391: sprite('Natdex', 0, 54),
    config: { evo_rqmt: 16, extra: { h_size: 1, every: 3, beat: 0, beats: 0, retriggers: 1, mult: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 8, blueprint_compat: true,
    attributes: ['starter', 'hand_size', 'retrigger', 'mult', 'trigger_evo'], poke_after: 'grookey',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, ordinal(ex.every), Math.max(0, self.config.evo_rqmt - ex.beats), ex.mult] }; },
    calculate(self, card, context) { return beat_calc(card, context) || scaling_evo(self, card, context, 'j_poke_rillaboom', card.ability.extra.beats, self.config.evo_rqmt); },
    ...hand_size,
  },
  // Rillaboom 812: +1 hand size; every 2nd card scored this round is retriggered; Drum Beating: those cards give +3 Mult.
  rillaboom: {
    name: 'rillaboom', poke_sprite391: sprite('Natdex', 2, 54),
    config: { extra: { h_size: 1, every: 2, beat: 0, beats: 0, retriggers: 1, mult: 3 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Grass', gen: 8, blueprint_compat: true,
    attributes: ['starter', 'hand_size', 'retrigger', 'mult'], poke_after: 'thwackey',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, ordinal(ex.every), ex.mult] }; },
    calculate(self, card, context) { return beat_calc(card, context); },
    ...hand_size,
  },

  // ---------------------------------------------------------------- Gen 8 starters (contentRev 49; the starters spec, 2026-10-28)
  // Pokermon's starter conventions: the type perk at every stage (Fire +1 discard: the `discards` pair; Water +1 hand: the `hands`
  // pair), Basic Uncommon $5 with the 'starter' attribute (the Starter Pack), Stage 1 Safari $8, Stage 2 Safari $10; evolution by
  // rounds, 5 then 5 (the Johto starters' timers: Cyndaquil / Quilava, Totodile / Croconaw). Energy: the line's main number only
  // (Scorbunny / Raboot `mult` +40%, Cinderace `Xmult_mod` +20%, Sobble / Drizzile `chips` +30%, Inteleon `Xmult_multi` +5%: a per-card
  // X); d_size, hands and rounds are fixed. Art: upstream 3.9.1's own (Natdex 4-14, 54), nothing to deploy. Neither Nacho nor
  // Pokermon+ has either line. After Rillaboom in Pokédex order (813-818, then Nickit 827).
  // Scorbunny 813 (Fire): +1 discard; +3 Mult for each discard left. Evolves after 5 rounds.
  scorbunny: {
    name: 'scorbunny', poke_sprite391: sprite('Natdex', 4, 54),
    config: { extra: { d_size: 1, mult: 3, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Fire', gen: 8, blueprint_compat: true, starter: true,
    attributes: ['starter', 'discard', 'passive', 'mult', 'round_evo'], poke_after: 'rillaboom',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.mult), r3(ex.mult * Math.max(0, G.GAME.current_round.discards_left || 0)), ex.rounds] }; },
    calculate(self, card, context) { return libero_mult(card, context) || level_evo(self, card, context, 'j_poke_raboot'); },
    ...discards,
  },
  // Raboot 814 (Fire): +1 discard; +5 Mult for each discard left. Evolves after 5 rounds.
  raboot: {
    name: 'raboot', poke_sprite391: sprite('Natdex', 6, 54),
    config: { extra: { d_size: 1, mult: 5, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 8, blueprint_compat: true,
    attributes: ['starter', 'discard', 'passive', 'mult', 'round_evo'], poke_after: 'scorbunny',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.mult), r3(ex.mult * Math.max(0, G.GAME.current_round.discards_left || 0)), ex.rounds] }; },
    calculate(self, card, context) { return libero_mult(card, context) || level_evo(self, card, context, 'j_poke_cinderace'); },
    ...discards,
  },
  // Cinderace 815 (Fire): +1 discard; Libero, X(1 + 0.5 for each discard left).
  cinderace: {
    name: 'cinderace', poke_sprite391: sprite('Natdex', 8, 54),
    config: { extra: { d_size: 1, Xmult_mod: 0.5 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fire', gen: 8, blueprint_compat: true,
    attributes: ['starter', 'discard', 'passive', 'xmult'], poke_after: 'raboot',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.Xmult_mod), r3(libero_x(card))] }; },
    calculate(self, card, context) {
      if (context.joker_main && G.GAME.current_round.discards_left > 0) { const x = libero_x(card); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
    ...discards,
  },
  // Sobble 816 (Water): +1 hand; each played card that doesn't score gives +20 Chips. Evolves after 5 rounds.
  sobble: {
    name: 'sobble', poke_sprite391: sprite('Natdex', 10, 54),
    config: { extra: { hands: 1, chips: 20, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Water', gen: 8, blueprint_compat: true, starter: true,
    attributes: ['starter', 'hands', 'passive', 'chips', 'round_evo'], poke_after: 'cinderace',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) { return unscored_chips(card, context) || level_evo(self, card, context, 'j_poke_drizzile'); },
    ...hands,
  },
  // Drizzile 817 (Water): +1 hand; each played card that doesn't score gives +35 Chips. Evolves after 5 rounds.
  drizzile: {
    name: 'drizzile', poke_sprite391: sprite('Natdex', 12, 54),
    config: { extra: { hands: 1, chips: 35, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['starter', 'hands', 'passive', 'chips', 'round_evo'], poke_after: 'sobble',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) { return unscored_chips(card, context) || level_evo(self, card, context, 'j_poke_inteleon'); },
    ...hands,
  },
  // Inteleon 818 (Water): +1 hand; Snipe Shot, the highest-ranked scored card gives X2 Mult (a tie: the leftmost; snipe_target).
  inteleon: {
    name: 'inteleon', poke_sprite391: sprite('Natdex', 14, 54),
    config: { extra: { hands: 1, Xmult_multi: 2 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['starter', 'hands', 'xmult', 'rank'], poke_after: 'drizzile',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card === snipe_target(context.scoring_hand)) {
        return { x_mult: card.ability.extra.Xmult_multi, card };
      }
      return undefined;
    },
    ...hands,
  },

  // ---------------------------------------------------------------- LINE E: Kubfu -> Urshifu (Legendary, Gen 8: Kubfu Fighting, Urshifu Dark / Water)
  // Kubfu 891: can't be debuffed (systems/rules.js set_debuff); gains X0.1 Mult on a hand of exactly 1 or 5 scoring cards. After 10
  // trainings it evolves into the school it trained more: 1-card hands Single Strike, 5-card hands Rapid Strike (a tie: the school
  // of its last training).
  kubfu: {
    name: 'kubfu', poke_sprite391: sprite('Natdex', 10, 59, [11, 59]),
    config: { evo_rqmt: 10, extra: { Xmult: 1, Xmult_mod: 0.1, single: 0, rapid: 0 } },
    rarity: 4, cost: 10, stage: 'Legendary', ptype: 'Fighting', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'debuff', 'scaling_evo'], poke_after: 'dreepy_dart',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [ex.Xmult_mod, ex.Xmult, self.config.evo_rqmt, ex.single, ex.rapid] };
    },
    calculate(self, card, context) {
      const r = training(card, context);
      if (r) return r;
      const ex = card.ability.extra;
      const school = ex.single > ex.rapid ? 'single' : ex.rapid > ex.single ? 'rapid' : (ex.last || 'single');
      return scaling_evo(self, card, context, 'j_poke_urshifu_' + school, ex.single + ex.rapid, self.config.evo_rqmt);
    },
  },
  // Urshifu (Single Strike Style) 892: X Mult (kept from Kubfu; keeps training); Unseen Fist: playing cards can't be debuffed
  // (rules.js); Wicked Blow: a 1-card hand's card also gives this Joker's X Mult when scored. Only through Kubfu (never in a pool).
  // Dark (contentRev 30): the type its upstream card draws (owner rule: the card's type wins; tools/micatro/pokermon_art_type.mjs).
  urshifu_single: {
    name: 'urshifu_single', poke_sprite391: sprite('Gen08', 2, 10, [3, 10]),
    config: { extra: { Xmult: 2, Xmult_mod: 0.1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Dark', gen: 8, blueprint_compat: true, custom_pool_func: true,
    attributes: ['xmult', 'scaling', 'debuff'], poke_after: 'kubfu',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); urshifu_tips(info_queue); const ex = card.ability.extra; return { vars: [ex.Xmult, ex.Xmult_mod] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && context.full_hand && context.full_hand.length === 1 && card.ability.extra.Xmult > 1) {
        return { x_mult: card.ability.extra.Xmult, card };
      }
      return training(card, context);
    },
    in_pool() { return false; },
  },
  // Urshifu (Rapid Strike Style) 892: X Mult (kept from Kubfu; keeps training); Surging Strikes: the first 3 scored cards are
  // retriggered. Only through Kubfu. Water (contentRev 30): the type its upstream card draws (owner rule: the card's type wins).
  urshifu_rapid: {
    name: 'urshifu_rapid', poke_sprite391: sprite('Gen08', 4, 10, [5, 10]),
    config: { extra: { Xmult: 2, Xmult_mod: 0.1, retriggers: 1, strikes: 3 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 8, blueprint_compat: true, custom_pool_func: true,
    attributes: ['xmult', 'scaling', 'retrigger', 'debuff'], poke_after: 'urshifu_single',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.Xmult, ex.Xmult_mod, ex.strikes] }; },
    calculate(self, card, context) {
      if (context.repetition && context.cardarea === G.play && context.scoring_hand && context.scoring_hand.indexOf(context.other_card) >= 0
        && context.scoring_hand.indexOf(context.other_card) < card.ability.extra.strikes) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return training(card, context);
    },
    in_pool() { return false; },
  },

  // ---------------------------------------------------------------- Xerneas 716 (Fairy Legendary, Gen 6)
  // Geomancy: after the round's first hand, played cards give X1.25 Mult when scored. The first playing card destroyed each round
  // comes back as a copy: to the hand during a Blind (outside one — the shop — into the deck).
  xerneas: {
    name: 'xerneas', poke_sprite391: sprite('Gen06', 8, 10, [9, 10]),
    config: { extra: { Xmult_multi: 1.25, revived: false } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fairy', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'destroy_card', 'playing_card'], poke_after: 'gourgeist',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const charged = !!(G.GAME && G.GAME.current_round && G.GAME.current_round.hands_played > 0);
      return { vars: [card.ability.extra.Xmult_multi, charged ? 'Active!' : 'Charging...'] };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.individual && context.cardarea === G.play && !context.end_of_round && G.GAME.current_round.hands_played > 0) {
        return { x_mult: ex.Xmult_multi, card };
      }
      if (context.remove_playing_cards && !context.blueprint && !ex.revived && context.removed && context.removed.length) {
        ex.revived = true;
        const src = context.removed[0];
        const to_hand = !!G.GAME.facing_blind;
        G.playing_card = (G.playing_card && G.playing_card + 1) || 1;
        const id = G.playing_card;
        G.E_MANAGER.add_event(() => {
          const copy = copy_card(src, null, null, id);
          copy.add_to_deck();
          G.deck.config.card_limit = G.deck.config.card_limit + 1;
          G.playing_cards.push(copy);
          (to_hand ? G.hand : G.deck).emplace(copy);
          copy.start_materialize();
          playing_card_joker_effects([copy]);
        });
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_copied_ex'), colour: 'pink' });
      }
      if (round_end(context) && !context.blueprint) ex.revived = false;
      return undefined;
    },
  },

  // ---------------------------------------------------------------- Gen 6, batch 3: the Gen 6 Legendaries, 717-721 (contentRev 63)
  // The owner's design ("Yes", 2026-11-02). Legendary $20 each (The Soul / the Legendary pool); each complete ALONE (the owner's solo
  // rule, contentRev 59: no partner clause). Types from the card art (pokermon_art_type.mjs; every form cell checked): Yveltal Dark,
  // Zygarde Dragon (10% / 50% / Complete cells all Dragon), Diancie Fairy, Hoopa Psychic (its Unbound cell Psychic too), Volcanion Fire.
  // Neither Nacho nor Pokermon+ has any. Art: upstream 3.9.1's own cells with their floating souls (Yveltal / Diancie / Volcanion the
  // Natdex sheet {22,47} / {26,47} / {0,48}; Zygarde 10% {2,11}, Hoopa {8,11} the Gen 6 sheet), the forms (Zygarde 50% {4,11} and
  // Complete {6,11}, Hoopa Unbound {10,11}) drawn live by ui.js ownFace (systems/anim.js GEN6_LEGEND_FORMS) from each center's
  // poke_view_form. After Xerneas (716) in Pokédex order.
  //
  // Yveltal 717 (Dark), Oblivion Wing: at the end of each round, destroys 1 random card held in hand (seeded; every joker's
  // remove_playing_cards sees it) and gains X0.25 Mult (`oblivion_Xmult` from X1, no energy field; the gain `Xmult_mod` +20%: 0.3 / 0.35
  // / 0.4, never retroactive). Nothing held, nothing. Blueprint copies the X, never the destroy or the gain.
  yveltal: {
    name: 'yveltal', poke_sprite391: sprite('Natdex', 22, 47, [23, 47]),
    config: { extra: { oblivion_Xmult: 1, Xmult_mod: 0.25 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Dark', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'destroy_card'], poke_after: 'xerneas',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.oblivion_Xmult), r3(ex.Xmult_mod)] }; },
    calculate(self, card, context) {
      if (oblivion_wing(card, context)) return undefined;
      const ex = card.ability.extra;
      if (context.joker_main && ex.oblivion_Xmult > 1) return { message: a_xmult(r3(ex.oblivion_Xmult)), colour: 'XMULT', Xmult_mod: ex.oblivion_Xmult };
      return undefined;
    },
  },
  // Zygarde 718 (Dragon), Cells: +1 Cell for each card that scores while it is held (counted once per hand, after it scores: a retrigger
  // doesn't add one, nor Blueprint; `cells` on the card, at most 100). 10% Forme X1.5 (`Xmult` +20%: 1.8 / 2.1 / 2.4); 50% Forme from 50
  // Cells X2.5 (`Xmult1`: 3 / 3.5 / 4); Complete Forme from 100 Cells X4 (`Xmult2`: 4.8 / 5.6 / 6.4) and +1 hand size (`complete_size`,
  // fixed: given on reaching it, taken back when sold, destroyed or debuffed). The Forme is for good (the Cells never drop) and its art
  // shows (poke_view_form). Blueprint copies the X.
  zygarde: {
    name: 'zygarde', poke_sprite391: sprite('Gen06', 2, 11, [3, 11]),
    config: { extra: { Xmult: 1.5, Xmult1: 2.5, Xmult2: 4, complete_size: 1, cells: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Dragon', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'hand_size'], poke_after: 'yveltal',
    poke_view_form(self, card) { return zygarde_form(card); },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [Math.min(ZYGARDE_COMPLETE, ex.cells || 0), r3(ex.Xmult), r3(ex.Xmult1), r3(ex.Xmult2), ex.complete_size, ZYGARDE_FORMES[zygarde_form(card)].name] };
    },
    calculate(self, card, context) {
      if (zygarde_cells(card, context)) return undefined;
      if (context.joker_main) { const x = zygarde_x(card); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
    ...zygarde_size,
  },
  // Diancie 719 (Fairy), Diamond Storm: each scored Diamond (is_suit: Wild cards count) earns $1 (`diamond_money`, fixed) and gives X1.2
  // Mult (`Xmult_multi` +5%: 1.26 / 1.32 / 1.38). When a Blind is selected, 1 random non-Diamond card of the full deck (seeded; never a
  // Stone card) becomes a Diamond, keeping its rank, enhancement, seal and edition. Blueprint copies both.
  diancie: {
    name: 'diancie', poke_sprite391: sprite('Natdex', 26, 47, [27, 47]),
    config: { extra: { Xmult_multi: 1.2, diamond_money: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fairy', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'money', 'suit', 'diamonds', 'playing_card'], poke_after: 'zygarde',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.diamond_money, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (diamond_storm(card, context)) return undefined;
      if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit('Diamonds')) {
        const ex = card.ability.extra;
        G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + ex.diamond_money;
        G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
        return { dollars: ex.diamond_money, x_mult: ex.Xmult_multi, card };
      }
      return undefined;
    },
  },
  // Hoopa 720 (Psychic), Hyperspace Hole: at the end of each shop, creates a random Tarot or Planet card (must have room). After 15
  // consumables used while it is held (`used`, on the card; any consumable; not Blueprint), Hoopa Unbound for good: its Unbound card shows
  // (Psychic too) and it creates a random Spectral card instead. No number: Energy-inert (poke_no_energy_field). Blueprint copies the creation.
  hoopa: {
    name: 'hoopa', poke_sprite391: sprite('Gen06', 8, 11, [9, 11]),
    config: { extra: { used: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 6, blueprint_compat: true,
    attributes: ['generation', 'tarot', 'planet', 'spectral'], poke_after: 'diancie',
    poke_no_energy_field: true,
    poke_view_form(self, card) { return hoopa_unbound(card) ? 'unbound' : 'confined'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [hoopa_unbound(card) ? 'Hoopa Unbound' : 'Used: ' + Math.min(HOOPA_AT, card.ability.extra.used || 0) + '/' + HOOPA_AT] };
    },
    calculate(self, card, context) {
      hoopa_count(card, context);
      hyperspace_hole(card, context);
      return undefined;
    },
  },
  // Volcanion 721 (Fire), Steam Eruption: +1 discard each round (`d_size`, fixed; the Charmander line's pair). X2 Mult, plus X0.25 for each
  // discard used this round (current_round.discards_used, read when it scores; it resets each round). `Xmult` +20% (2.4 / 2.8 / 3.2),
  // `Xmult_mod` +20% (0.3 / 0.35 / 0.4). Blueprint copies the X.
  volcanion: {
    name: 'volcanion', poke_sprite391: sprite('Natdex', 0, 48, [1, 48]),
    config: { extra: { d_size: 1, Xmult: 2, Xmult_mod: 0.25 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fire', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'discards'], poke_after: 'hoopa',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.Xmult), r3(ex.Xmult_mod), r3(steam_x(card))] }; },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const x = steam_x(card);
      return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
    },
    ...discards,
  },

  // ---------------------------------------------------------------- Gen 7, batch 3: the Ultra Beasts, 793-799 / 803-806 (contentRev 66)
  // The owner's design ("Yes build it and merge when the gate passes", 2026-11-02). Rare $7 single-stage Basics, but Poipole (Common $5)
  // -> Naganadel (Safari $8, after 5 rounds). Types from the card art (pokermon_art_type.mjs): Nihilego Dark, Buzzwole Fighting, Pheromosa
  // Grass, Xurkitree Lightning, Celesteela Metal, Kartana Grass, Guzzlord Dragon, Poipole Dark, Naganadel Dragon, Stakataka Earth,
  // Blacephalon Psychic. Every one carries the `ultra_beast` attribute (nothing reads it yet but the wiki). Neither Nacho nor Pokermon+
  // has any. Art: upstream 3.9.1's own Natdex cells with their floating souls ({24,52} ... {20,53}). After Kommo-o (784) in Pokédex order.
  // BEAST BOOST (shared, solo): each Boss Blind beaten permanently raises the joker's main number (`poke_beast_boost`) by 10% of its
  // UNENERGIZED base (`beast_boosts`, a count: beast_value above). Energy raises the main number at its standard rate, the rest is fixed.
  //
  // Nihilego 793 (Dark), Parasite: copies the ability of the Joker to its LEFT (Blueprint mirrored; the compatible / incompatible line).
  // No number of its own: Beast Boost has nothing to raise and it is Energy-inert (poke_no_energy_field).
  nihilego: {
    name: 'nihilego', poke_sprite391: sprite('Natdex', 24, 52, [25, 52]),
    config: { extra: {} },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Dark', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'copy'], poke_after: 'mega_drampa',
    poke_no_energy_field: true,
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const main_end = G.jokers && card.area === G.jokers ? blueprint_compat_line(nihilego_target(card)) : undefined;
      return { vars: [], main_end };
    },
    calculate(self, card, context) {
      const left = nihilego_target(card);
      if (!left) return undefined;
      const ret = blueprint_effect(card, left, context);
      if (ret) ret.colour = 'BLACK';
      return ret;
    },
    update(self, card) {
      if (G.jokers && card.area === G.jokers) {
        const left = nihilego_target(card);
        card.ability.blueprint_compat = (left && !left.debuff && left.config.center.blueprint_compat && 'compatible') || 'incompatible';
      }
    },
  },
  // Buzzwole 794 (Fighting), Muscle: X3 Mult (`Xmult` +20%: 3.6 / 4.2 / 4.8; Beast Boost +X0.3 each) and -1 hand size (fixed).
  buzzwole: {
    name: 'buzzwole', poke_sprite391: sprite('Natdex', 26, 52, [27, 52]),
    config: { extra: { Xmult: 3, h_size: -1, beast_boosts: 0 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Fighting', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'xmult', 'hand_size', 'scaling'], poke_after: 'nihilego', poke_beast_boost: 'Xmult',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(beast_value(card)), -card.ability.extra.h_size, ...beast_vars(card)] }; },
    calculate(self, card, context) {
      if (beast_boost(card, context)) return undefined;
      if (context.joker_main) { const x = beast_value(card); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
    ...hand_size,
  },
  // Pheromosa 795 (Grass), Glass Cannon: X3 Mult on the first 2 hands of each round (`Xmult` +20%: 3.6 / 4.2 / 4.8; Beast Boost +X0.3);
  // after the 2nd hand scores it is debuffed (source 'pheromosa') until the round ends, when it recovers (index.js end_round_start:
  // before any end_of_round, so it still takes its Beast Boost). Blueprint copies the X while Pheromosa is fresh.
  pheromosa: {
    name: 'pheromosa', poke_sprite391: sprite('Natdex', 28, 52, [29, 52]),
    config: { extra: { Xmult: 3, beast_boosts: 0 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Grass', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'xmult', 'scaling', 'debuff'], poke_after: 'buzzwole', poke_beast_boost: 'Xmult',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const tired = !!(card.ability.debuff_sources && card.ability.debuff_sources.pheromosa);
      const left = tired ? 0 : Math.max(0, PHEROMOSA_HANDS - ((G.GAME && G.GAME.facing_blind && G.GAME.current_round.hands_played) || 0));
      return { vars: [r3(beast_value(card)), PHEROMOSA_HANDS, ...beast_vars(card), tired ? 'Tired until the round ends' : left + '/' + PHEROMOSA_HANDS + ' hands left'] };
    },
    calculate(self, card, context) {
      if (pheromosa_tire(card, context) || beast_boost(card, context)) return undefined;
      if (context.joker_main && (G.GAME.current_round.hands_played || 0) < PHEROMOSA_HANDS) {
        const x = beast_value(card);
        return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
      }
      return undefined;
    },
  },
  // Xurkitree 796 (Lightning), Live Wire: each card held in hand (not debuffed) gives +4 Mult when a hand scores (Baron's held shape:
  // Mime retriggers it). `mult` +40%: 5.6 / 7.2 / 8.8; Beast Boost +0.4 each.
  xurkitree: {
    name: 'xurkitree', poke_sprite391: sprite('Natdex', 0, 53, [1, 53]),
    config: { extra: { mult: 4, beast_boosts: 0 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Lightning', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'mult', 'scaling'], poke_after: 'pheromosa', poke_beast_boost: 'mult',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(beast_value(card)), ...beast_vars(card)] }; },
    calculate(self, card, context) {
      if (beast_boost(card, context)) return undefined;
      if (context.individual && context.cardarea === G.hand && !context.end_of_round && !context.other_card.debuff) return { h_mult: beast_value(card), card };
      return undefined;
    },
  },
  // Celesteela 797 (Metal), Launch: its sell value rises by $1 at the end of each round (Egg's way: extra_value, `val_gain` fixed; not
  // Blueprint) and it gives X1 plus X0.05 per $1 of its CURRENT sell value (`Xmult_mod` +20%: 0.06 / 0.07 / 0.08; Beast Boost +X0.005
  // per $1 each). Blueprint copies the X.
  celesteela: {
    name: 'celesteela', poke_sprite391: sprite('Natdex', 2, 53, [3, 53]),
    config: { extra: { Xmult_mod: 0.05, val_gain: 1, beast_boosts: 0 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Metal', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'xmult', 'economy', 'scaling'], poke_after: 'xurkitree', poke_beast_boost: 'Xmult_mod',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(beast_value(card)), card.ability.extra.val_gain, ...beast_vars(card), r3(launch_x(card))] }; },
    calculate(self, card, context) {
      beast_boost(card, context);
      if (round_end(context) && !context.blueprint && !context.retrigger_joker) {
        card.ability.extra_value = (card.ability.extra_value || 0) + card.ability.extra.val_gain;
        card.set_cost();
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_val_up'), colour: 'MONEY' });
        return undefined;
      }
      if (context.joker_main) { const x = launch_x(card); if (x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Kartana 798 (Grass), Sacred Sword: when the played hand has exactly 1 scoring card, that card retriggers 3 times (`retriggers`, fixed)
  // and gives X2 each time it scores (`Xmult_multi` +5%: 2.1 / 2.2 / 2.3; Beast Boost +X0.2 each). Blueprint copies both.
  kartana: {
    name: 'kartana', poke_sprite391: sprite('Natdex', 4, 53, [5, 53]),
    config: { extra: { Xmult_multi: 2, retriggers: 3, beast_boosts: 0 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Grass', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'xmult', 'retrigger', 'scaling'], poke_after: 'celesteela', poke_beast_boost: 'Xmult_multi',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(beast_value(card)), card.ability.extra.retriggers, ...beast_vars(card)] }; },
    calculate(self, card, context) {
      if (beast_boost(card, context)) return undefined;
      const lone = context.cardarea === G.play && !context.end_of_round && context.scoring_hand && context.scoring_hand.length === 1 && context.other_card === context.scoring_hand[0];
      if (lone && context.repetition && !context.other_card.debuff) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      if (lone && context.individual) return { x_mult: r3(beast_value(card)), card };
      return undefined;
    },
  },
  // Guzzlord 799 (Dragon), Gluttony: when a Blind is selected, destroys your LEFTMOST consumable and gains X0.2 Mult (`gluttony_Xmult`
  // from X1, no energy field; the gain `Xmult_mod` +20%: 0.24 / 0.28 / 0.32, future meals only). Nothing held, nothing. Beast Boost +X0.1
  // each (10% of the X1 base). Not Blueprint for the meal; Blueprint copies the X.
  guzzlord: {
    name: 'guzzlord', poke_sprite391: sprite('Natdex', 6, 53, [7, 53]),
    config: { extra: { gluttony_Xmult: 1, Xmult_mod: 0.2, beast_boosts: 0 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Dragon', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'xmult', 'scaling', 'consumable'], poke_after: 'kartana', poke_beast_boost: 'gluttony_Xmult',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_mod), r3(beast_value(card)), ...beast_vars(card)] }; },
    calculate(self, card, context) {
      if (gluttony(card, context) || beast_boost(card, context)) return undefined;
      if (context.joker_main) { const x = beast_value(card); if (x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Poipole 803 (Dark, Common $5): +2 Mult for each Dragon Joker (undebuffed, is_type: a Tera sticker counts; Poipole itself isn't one).
  // `mult` +40%: 2.8 / 3.6 / 4.4; Beast Boost +0.2 each. Evolves after 5 rounds into Naganadel (its Beast Boosts and Energy carry over).
  poipole: {
    name: 'poipole', poke_sprite391: sprite('Natdex', 14, 53, [15, 53]),
    config: { extra: { mult: 2, rounds: 5, beast_boosts: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'mult', 'types', 'scaling', 'round_evo'], poke_after: 'guzzlord', poke_beast_boost: 'mult',
    poke_custom_values_to_keep: ['beast_boosts'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(beast_value(card)), dragon_count(), r3(poipole_mult(card)), ...beast_vars(card), ex.rounds] }; },
    calculate(self, card, context) {
      beast_boost(card, context);
      if (context.joker_main) { const m = poipole_mult(card); if (m > 0) return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_naganadel');
    },
  },
  // Naganadel 804 (Dragon, Safari $8), Dragon Pulse: X1.5 Mult plus X0.25 for each Dragon Joker, itself included (`Xmult` +20%: 1.8 / 2.1
  // / 2.4, `Xmult_mod` +20%: 0.3 / 0.35 / 0.4; Beast Boost +X0.15 each, on the X1.5).
  naganadel: {
    name: 'naganadel', poke_sprite391: sprite('Natdex', 16, 53, [17, 53]),
    config: { extra: { Xmult: 1.5, Xmult_mod: 0.25, beast_boosts: 0 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dragon', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'xmult', 'types', 'scaling'], poke_after: 'poipole', poke_beast_boost: 'Xmult',
    poke_custom_values_to_keep: ['beast_boosts'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(beast_value(card)), r3(card.ability.extra.Xmult_mod), r3(naganadel_x(card)), ...beast_vars(card)] }; },
    calculate(self, card, context) {
      if (beast_boost(card, context)) return undefined;
      if (context.joker_main) { const x = naganadel_x(card); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Stakataka 805 (Earth), Stone Wall: each Stone card held in hand (not debuffed) gives X1.25 Mult when a hand scores — the joker's own
  // held-card pass (Baron's shape: Mime retriggers it; a Stone card has no held effect of its own). `Xmult_multi` +5%: 1.3125 / 1.375 /
  // 1.4375; Beast Boost +X0.125 each.
  stakataka: {
    name: 'stakataka', poke_sprite391: sprite('Natdex', 18, 53, [19, 53]),
    config: { extra: { Xmult_multi: 1.25, beast_boosts: 0 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Earth', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'xmult', 'enhancements', 'scaling'], poke_after: 'naganadel', poke_beast_boost: 'Xmult_multi',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); return { vars: [r3(beast_value(card)), ...beast_vars(card)] }; },
    calculate(self, card, context) {
      if (beast_boost(card, context)) return undefined;
      if (context.individual && context.cardarea === G.hand && !context.end_of_round && !context.other_card.debuff && has_enhancement(context.other_card, 'm_stone')) {
        return { x_mult: r3(beast_value(card)), card };
      }
      return undefined;
    },
  },
  // Blacephalon 806 (Psychic), Mind Blown: X3 Mult (`Xmult` +20%: 3.6 / 4.2 / 4.8; Beast Boost +X0.3 each); each hand played costs $2
  // (`recoil`, fixed; Staraptor's Recoil: never past the debt limit). Blueprint copies the X only.
  blacephalon: {
    name: 'blacephalon', poke_sprite391: sprite('Natdex', 20, 53, [21, 53]),
    config: { extra: { Xmult: 3, recoil: 2, beast_boosts: 0 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Psychic', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'xmult', 'economy', 'scaling'], poke_after: 'stakataka', poke_beast_boost: 'Xmult',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(beast_value(card)), card.ability.extra.recoil, ...beast_vars(card)] }; },
    calculate(self, card, context) {
      recoil(card, context);
      if (beast_boost(card, context)) return undefined;
      if (context.joker_main) { const x = beast_value(card); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },

  // ---------------------------------------------------------------- the Gen 7 starters (contentRev 48)
  // The owner's "build" (2026-10-28, the Gen 5-9 starters spec). Pokermon's starter rules: the type perk at every stage (Grass +1 hand
  // size like Bulbasaur, Fire +1 discard like Charmander, Water +1 hand like Squirtle; fixed, never Energy), Basic Uncommon $5 with the
  // 'starter' attribute (`starter: true`: the Starter Pack's Grass / Fire / Water slot), Stage 1 Safari $8, Stage 2 Safari $10;
  // evolution by rounds, 5 then 5 (level_evo). Types are the cards' (upstream 3.9.1 draws all nine on the Natdex sheet, row 48: Rowlet
  // {2,48} ... Primarina {18,48}). No banked values: every number is read live. Neither Nacho nor Pokermon+ has these lines.
  // Rowlet 722: +1 hand size; the rightmost scored card retriggers once. Energy: carries Decidueye's per-card X (Xmult_multi, +5%).
  rowlet: {
    name: 'rowlet', poke_sprite391: sprite('Natdex', 2, 48),
    config: { extra: { h_size: 1, retriggers: 1, Xmult_multi: 1.3, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 7, blueprint_compat: true, starter: true,
    attributes: ['starter', 'hand_size', 'retrigger', 'position', 'round_evo'], poke_after: 'volcanion',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, ex.retriggers, ex.rounds, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) { return shackle_calc(card, context) || level_evo(self, card, context, 'j_poke_dartrix'); },
    ...hand_size,
  },
  // Dartrix 723: +1 hand size; the rightmost scored card retriggers twice.
  dartrix: {
    name: 'dartrix', poke_sprite391: sprite('Natdex', 4, 48),
    config: { extra: { h_size: 1, retriggers: 2, Xmult_multi: 1.3, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 7, blueprint_compat: true,
    attributes: ['starter', 'hand_size', 'retrigger', 'position', 'round_evo'], poke_after: 'rowlet',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, ex.retriggers, ex.rounds, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) { return shackle_calc(card, context) || level_evo(self, card, context, 'j_poke_decidueye'); },
    ...hand_size,
  },
  // Decidueye 724: +1 hand size; Spirit Shackle, the rightmost scored card retriggers twice and gives X1.3 Mult each time it scores.
  decidueye: {
    name: 'decidueye', poke_sprite391: sprite('Natdex', 6, 48),
    config: { extra: { h_size: 1, retriggers: 2, Xmult_multi: 1.3, shackle: true } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Grass', gen: 7, blueprint_compat: true,
    attributes: ['starter', 'hand_size', 'retrigger', 'position', 'xmult'], poke_after: 'dartrix',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, ex.retriggers, r3(ex.Xmult_multi), r3(Math.pow(ex.Xmult_multi, ex.retriggers + 1))] }; },
    calculate(self, card, context) { return shackle_calc(card, context); },
    ...hand_size,
  },
  // Litten 725: +1 discard; +2 Mult for each hand already played this round (the hands BEFORE this one: the round's first hand +0).
  // Energy: `mult` +40% (2 -> 2.8 / 3.6 / 4.4).
  litten: {
    name: 'litten', poke_sprite391: sprite('Natdex', 8, 48),
    config: { extra: { d_size: 1, mult: 2, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Fire', gen: 7, blueprint_compat: true, starter: true,
    attributes: ['starter', 'discard', 'mult', 'round_evo'], poke_after: 'decidueye',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.mult), litten_mult(card), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && hands_before() > 0) { const m = litten_mult(card); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_torracat');
    },
    ...discards,
  },
  // Torracat 726: +1 discard; +4 Mult for each hand already played this round. Energy: `mult` +40% (4 -> 5.6 / 7.2 / 8.8).
  torracat: {
    name: 'torracat', poke_sprite391: sprite('Natdex', 10, 48),
    config: { extra: { d_size: 1, mult: 4, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 7, blueprint_compat: true,
    attributes: ['starter', 'discard', 'mult', 'round_evo'], poke_after: 'litten',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.mult), litten_mult(card), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && hands_before() > 0) { const m = litten_mult(card); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_incineroar');
    },
    ...discards,
  },
  // Incineroar 727: +1 discard; X(1 + 0.25 per hand already played this round): X1 / X1.25 / X1.5 / X1.75 on hands 1-4.
  // Energy: `Xmult_mod` +20% (0.25 -> 0.3 / 0.35 / 0.4).
  incineroar: {
    name: 'incineroar', poke_sprite391: sprite('Natdex', 12, 48),
    config: { extra: { d_size: 1, Xmult_mod: 0.25 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fire', gen: 7, blueprint_compat: true,
    attributes: ['starter', 'discard', 'xmult'], poke_after: 'torracat',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.Xmult_mod), incineroar_x(card)] }; },
    calculate(self, card, context) {
      if (context.joker_main && hands_before() > 0) { const x = incineroar_x(card); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
    ...discards,
  },
  // Popplio 728: +1 hand; scored Hearts give +3 Mult. Energy: `mult` +40% (3 -> 4.2 / 5.4 / 6.6).
  popplio: {
    name: 'popplio', poke_sprite391: sprite('Natdex', 14, 48),
    config: { extra: { hands: 1, mult: 3, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Water', gen: 7, blueprint_compat: true, starter: true,
    attributes: ['starter', 'hands', 'mult', 'suit', 'hearts', 'round_evo'], poke_after: 'incineroar',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { return aria_calc(card, context) || level_evo(self, card, context, 'j_poke_brionne'); },
    ...hands,
  },
  // Brionne 729: +1 hand; scored Hearts give +5 Mult. Energy: `mult` +40% (5 -> 7 / 9 / 11).
  brionne: {
    name: 'brionne', poke_sprite391: sprite('Natdex', 16, 48),
    config: { extra: { hands: 1, mult: 5, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 7, blueprint_compat: true,
    attributes: ['starter', 'hands', 'mult', 'suit', 'hearts', 'round_evo'], poke_after: 'popplio',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { return aria_calc(card, context) || level_evo(self, card, context, 'j_poke_primarina'); },
    ...hands,
  },
  // Primarina 730: +1 hand; Sparkling Aria, scored Hearts give X1.2 Mult. Energy: `Xmult_multi` +5% (1.2 -> 1.26 / 1.32 / 1.38).
  primarina: {
    name: 'primarina', poke_sprite391: sprite('Natdex', 18, 48),
    config: { extra: { hands: 1, Xmult_multi: 1.2, aria: true } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Water', gen: 7, blueprint_compat: true,
    attributes: ['starter', 'hands', 'xmult', 'suit', 'hearts'], poke_after: 'brionne',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) { return aria_calc(card, context); },
    ...hands,
  },

  // ---------------------------------------------------------------- LINE F: Tandemaus -> Maushold (Colorless, Gen 9)
  // Tandemaus 924: scored cards that share a rank with another scored card give +3 Mult. Evolves in 5 rounds.
  tandemaus: {
    name: 'tandemaus', poke_sprite391: sprite('Natdex', 16, 61),
    config: { extra: { mult: 3, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Colorless', gen: 9, blueprint_compat: true,
    attributes: ['mult', 'rank', 'round_evo'], poke_after: 'spidops',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.mult, ex.rounds] }; },
    calculate(self, card, context) { return pair_mult(card, context) || level_evo(self, card, context, 'j_poke_maushold'); },
  },
  // Maushold 925: as Tandemaus; Population Bomb: the first scored card is retriggered, then 1 in 2 for each more retrigger, up to 4
  // (Family of Four). 1 in 100 is the Family of Three (rolled on creation): up to 3, and each retrigger earns $1.
  maushold: {
    name: 'maushold', poke_sprite391: sprite('Gen09', 6, 0),
    config: { extra: { mult: 3, num: 1, dem: 2, max: 4, max_three: 3, money: 1, form: 'four' } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 9, blueprint_compat: true,
    attributes: ['mult', 'rank', 'retrigger', 'chance', 'economy'], poke_after: 'tandemaus',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      const [num, dem] = get_probability_vars(card, ex.num, ex.dem, 'maushold');
      const three = ex.form === 'three';
      return { vars: [ex.mult, num, dem, three ? ex.max_three : ex.max, ex.money], key: three ? 'j_poke_maushold_three' : undefined };
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.form = pseudorandom('maushold_family') < 0.01 ? 'three' : 'four';
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.repetition && context.cardarea === G.play && context.scoring_hand && context.other_card === context.scoring_hand[0] && !context.other_card.debuff) {
        const max = ex.form === 'three' ? ex.max_three : ex.max;
        let reps = 1;
        while (reps < max && pseudorandom_probability(card, 'maushold', ex.num, ex.dem, 'maushold')) reps++;
        if (ex.form === 'three') {
          const earned = ease_poke_dollars(card, 'maushold', ex.money * reps);
          card_eval_status_text(card, 'dollars', earned);
        }
        return { message: localize('k_again_ex'), repetitions: reps, card };
      }
      return pair_mult(card, context);
    },
  },

  // ---------------------------------------------------------------- LINE G: Darumaka -> Darmanitan (Fire, Gen 5)
  // Darumaka 554: +15 Mult; Hustle: 1 in 4 to give nothing (probability jokers make it miss MORE). Evolves in 4 rounds.
  darumaka: {
    name: 'darumaka', poke_sprite391: sprite('Natdex', 26, 36),
    config: { extra: { mult: 15, num: 1, dem: 4, rounds: 4 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fire', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'chance', 'round_evo'], poke_after: 'excadrill',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      const [num, dem] = get_probability_vars(card, ex.num, ex.dem, 'darumaka');
      return { vars: [ex.mult, num, dem, ex.rounds] };
    },
    calculate(self, card, context) {
      if (context.joker_main) {
        const ex = card.ability.extra;
        if (pseudorandom_probability(card, 'darumaka', ex.num, ex.dem, 'darumaka')) return { message: localize('k_nope_ex'), colour: 'GREEN' };
        return { message: a_mult(ex.mult), colour: 'MULT', mult_mod: ex.mult };
      }
      return level_evo(self, card, context, 'j_poke_darmanitan');
    },
  },
  // Darmanitan 555: +30 Mult; Zen Mode: on the round's final hand, X3 Mult instead, and Psychic (a Tera sticker) until end of round.
  darmanitan: {
    name: 'darmanitan', poke_sprite391: sprite('Gen05', 10, 0),
    config: { extra: { mult: 30, Xmult: 3 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'types', 'hands'], poke_after: 'darumaka',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.mult, ex.Xmult] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.before && context.cardarea === G.jokers && !context.blueprint && G.GAME.current_round.hands_left === 0 && !ex.zen) {
        zen_on(self, card);
        card_eval_status_text(card, 'extra', null, null, null, { message: 'Zen Mode!', colour: 'Planet' });
      }
      if (context.joker_main) {
        if (G.GAME.current_round.hands_left === 0) return { message: a_xmult(ex.Xmult), colour: 'XMULT', Xmult_mod: ex.Xmult };
        return { message: a_mult(ex.mult), colour: 'MULT', mult_mod: ex.mult };
      }
      if (round_end(context) && !context.blueprint && ex.zen) zen_off(self, card);
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE H: Scraggy -> Scrafty (Dark, Gen 5)
  // Scraggy 559: +4 Mult; Moxie: +3 Mult when a Blind is defeated with the round's first hand. Evolves in 4 rounds.
  scraggy: {
    name: 'scraggy', poke_sprite391: sprite('Natdex', 6, 37),
    config: { extra: { mult: 4, mult_mod: 3, rounds: 4 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'round_evo'], poke_after: 'darmanitan',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.mult, ex.mult_mod, ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && card.ability.extra.mult > 0) return { message: a_mult(card.ability.extra.mult), colour: 'MULT', mult_mod: card.ability.extra.mult };
      moxie(card, context, () => card.ability.extra.mult_mod);
      return level_evo(self, card, context, 'j_poke_scrafty');
    },
  },
  // Scrafty 560: Moxie +3 Mult, +1 more per other Dark Joker; X1.5 Mult on the round's first hand.
  scrafty: {
    name: 'scrafty', poke_sprite391: sprite('Natdex', 8, 37),
    config: { extra: { mult: 4, mult_mod: 3, mult_scaling_mod: 1, Xmult: 1.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'scaling'], poke_after: 'scraggy',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.mult_mod, ex.mult_scaling_mod, ex.Xmult, ex.mult] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.joker_main) {
        if (G.GAME.current_round.hands_played === 0) return { message: a_xmult(ex.Xmult), colour: 'XMULT', mult_mod: ex.mult, Xmult_mod: ex.Xmult };
        if (ex.mult > 0) return { message: a_mult(ex.mult), colour: 'MULT', mult_mod: ex.mult };
      }
      moxie(card, context, () => ex.mult_mod + ex.mult_scaling_mod * find_pokemon_type('Dark', card).length);
      return undefined;
    },
  },

  // ---------------------------------------------------------------- Spiritomb 442 (Psychic: Ghost/Dark, Gen 4)
  // A spirit per playing card destroyed and per Joker sold; X0.02 Mult per spirit; at 108 spirits, The Soul (once; must have room).
  spiritomb: {
    name: 'spiritomb', poke_sprite391: sprite('Natdex', 12, 29),
    config: { extra: { spirits: 0, goal: 108, Xmult_mod: 0.02, created: false } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Psychic', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'destroy_card', 'on_sell', 'spectral'], poke_after: 'happiny',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Spectral', key: 'c_soul' });
      const ex = card.ability.extra;
      return { vars: [ex.Xmult_mod, ex.spirits, ex.goal, spirit_x(ex)] };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.joker_main && spirit_x(ex) > 1) return { message: a_xmult(spirit_x(ex)), colour: 'XMULT', Xmult_mod: spirit_x(ex) };
      let gained = 0;
      if (context.remove_playing_cards && !context.blueprint && context.removed) gained = context.removed.length;
      if (context.selling_card && !context.blueprint && context.card !== card && context.card.ability.set === 'Joker') gained = 1;
      if (gained > 0) {
        ex.spirits = ex.spirits + gained;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'XMULT' });
      }
      if ((gained > 0 || round_end(context)) && !context.blueprint) spirit_soul(card);
      return undefined;
    },
  },

  // ---------------------------------------------------------------- Tatsugiri 978 (Dragon, Gen 9)
  // Nature (rolled on creation): Curly, Droopy or Stretchy. Commander: the leftmost Water Joker gives X1.75 Mult / +100 Chips /
  // +20 Mult. Tatsugiri itself gives nothing.
  tatsugiri: {
    name: 'tatsugiri', poke_sprite391: sprite('Gen09', 0, 3),
    config: { extra: { Xmult_multi: 1.75, chips: 100, mult: 20 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Dragon', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'chips', 'mult', 'joker', 'types', 'nature', 'position'], poke_after: 'houndstone',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [ex.Xmult_multi, ex.chips, ex.mult], key: TATSU_FORMS.includes(ex.form) ? 'j_poke_tatsugiri_' + ex.form : undefined };
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.form = pseudorandom_element(TATSU_FORMS, pseudoseed('tatsugiri'))[0];
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.other_joker && TATSU_FORMS.includes(ex.form) && context.other_joker === commanded(card)) {
        const target = context.other_joker;
        G.E_MANAGER.add_event(() => { target.juice_up(0.5, 0.5); });
        if (ex.form === 'curly') return { message: a_xmult(ex.Xmult_multi), colour: 'XMULT', Xmult_mod: ex.Xmult_multi };
        if (ex.form === 'droopy') return { message: a_chips(ex.chips), colour: 'CHIPS', chip_mod: ex.chips };
        return { message: a_mult(ex.mult), colour: 'MULT', mult_mod: ex.mult };
      }
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE F2: Sprigatito -> Floragato -> Meowscarada (Grass starter, Gen 9)
  // The owner's design (2026-10-27, after the 25; reworked in contentRev 23): Hiker for Lucky cards. Sprigatito 906: when a Lucky card
  // triggers (its 1 in 5 Mult or 1 in 15 money), that card permanently gains +1 Mult and +$1 when scored (perma_mult / perma_p_dollars,
  // Hiker's perma_bonus route), every time it scores after. The Mult step is `mult_mod` (Energy: +20% of its base each), the money step
  // `dollars` (in no energy_values: fixed); a card keeps what it was given — later Energy doesn't re-grow it (Houndour's perma_mult).
  // Evolves after 8 Lucky triggers (scaling_evo on `lucky_triggers`, at end of round; a card hitting both rolls counts 2 but grows
  // once); each evolution creates a Negative The Magician (Whismur's Negative Justice).
  sprigatito: {
    name: 'sprigatito', poke_sprite391: sprite('Natdex', 10, 60),
    config: { evo_rqmt: 8, extra: { mult_mod: 1, dollars: 1, lucky_triggers: 0 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 9, blueprint_compat: true, starter: true,
    attributes: ['starter', 'mult', 'economy', 'enhancements', 'modify_card', 'tarot', 'trigger_evo'], poke_after: 'ursaluna',
    loc_vars(self, info_queue, card) {
      lucky_legacy(self, card);
      type_tooltip(self, info_queue, card); lucky_tips(info_queue, true);
      const ex = card.ability.extra;
      return { vars: [r3(ex.mult_mod), ex.dollars, lucky_left(self, card), ex.lucky_triggers || 0, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      lucky_legacy(self, card);
      return lucky_grow(card, context) || scaling_evo(self, card, context, 'j_poke_floragato', card.ability.extra.lucky_triggers || 0, self.config.evo_rqmt);
    },
  },
  // Floragato 907: the same, +2 Mult and +$2 per Lucky trigger. Evolves after 12 more Lucky triggers (the count starts over). A Negative
  // The Magician when it evolves in.
  floragato: {
    name: 'floragato', poke_sprite391: sprite('Natdex', 12, 60),
    config: { evo_rqmt: 12, extra: { mult_mod: 2, dollars: 2, lucky_triggers: 0 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 9, blueprint_compat: true,
    attributes: ['starter', 'mult', 'economy', 'enhancements', 'modify_card', 'tarot', 'trigger_evo'], poke_after: 'sprigatito',
    loc_vars(self, info_queue, card) {
      lucky_legacy(self, card);
      type_tooltip(self, info_queue, card); lucky_tips(info_queue, true);
      const ex = card.ability.extra;
      return { vars: [r3(ex.mult_mod), ex.dollars, lucky_left(self, card), ex.lucky_triggers || 0, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      lucky_legacy(self, card);
      evolved_tarot(card, context, 'sprigatito', 'c_magician');
      return lucky_grow(card, context) || scaling_evo(self, card, context, 'j_poke_meowscarada', card.ability.extra.lucky_triggers || 0, self.config.evo_rqmt);
    },
  },
  // Meowscarada 908: no more +Mult / +$ (the cards keep theirs); a Lucky card that triggers permanently gains X0.5 Mult (perma_x_mult:
  // X1.5 after one trigger, X2 after two, scored every time after). The gain is `Xmult_mod` (Energy +20% of its base each: X0.6 / X0.7 /
  // X0.8); a banked X stays what it was. A Negative The Magician when it evolves in.
  meowscarada: {
    name: 'meowscarada', poke_sprite391: sprite('Natdex', 14, 60),
    config: { extra: { Xmult_mod: 0.5 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Grass', gen: 9, blueprint_compat: true,
    attributes: ['starter', 'xmult', 'scaling', 'enhancements', 'modify_card'], poke_after: 'floragato',
    loc_vars(self, info_queue, card) { lucky_legacy(self, card); type_tooltip(self, info_queue, card); lucky_tips(info_queue, false); return { vars: [r3(card.ability.extra.Xmult_mod)] }; },
    calculate(self, card, context) {
      lucky_legacy(self, card);
      evolved_tarot(card, context, 'floragato', 'c_magician');
      return lucky_xgrow(card, context);
    },
  },

  // ---------------------------------------------------------------- LINE F2b: Fuecoco -> Crocalor -> Skeledirge (Fire starter, Gen 9)
  // The owner's Gen 9 starters (2026-10-28, contentRev 51). Torch Song: every hand played (counted in `before`, so the hand being
  // played counts itself) permanently banks Mult on the joker (`torch_mult`, in no energy_values: never retroactive; kept through
  // both evolutions). The gain is `mult_mod` (Energy +20% of its base each: Fuecoco 1 -> 1.2 / 1.4 / 1.6, Crocalor 2 -> 2.4 / 2.8 / 3.2).
  // Skeledirge banks X Mult instead (`torch_Xmult` from X1, gain `Xmult_mod` 0.05 -> 0.06 / 0.07 / 0.08) and still gives the banked
  // Mult. The Fire starter perk at every stage: +1 discard (`d_size`, fixed). Evolves after 5 rounds, then 5 (Cyndaquil's timers).
  // Fuecoco 909: Uncommon $5, a starter (the Starter Pack).
  fuecoco: {
    name: 'fuecoco', poke_sprite391: sprite('Natdex', 16, 60),
    config: { extra: { d_size: 1, torch_mult: 0, mult_mod: 1, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Fire', gen: 9, blueprint_compat: true, starter: true,
    attributes: ['starter', 'discard', 'passive', 'mult', 'scaling', 'round_evo'], poke_after: 'meowscarada',
    poke_custom_values_to_keep: ['torch_mult'],
    ...discards,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.mult_mod), r3(ex.torch_mult), ex.rounds] }; },
    calculate(self, card, context) { return torch_song(card, context) || starter9_main(card, context) || level_evo(self, card, context, 'j_poke_crocalor'); },
  },
  // Crocalor 910: Safari $8; Fuecoco's bank, +2 Mult per hand.
  crocalor: {
    name: 'crocalor', poke_sprite391: sprite('Natdex', 18, 60),
    config: { extra: { d_size: 1, torch_mult: 0, mult_mod: 2, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 9, blueprint_compat: true,
    attributes: ['starter', 'discard', 'passive', 'mult', 'scaling', 'round_evo'], poke_after: 'fuecoco',
    poke_custom_values_to_keep: ['torch_mult'],
    ...discards,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.mult_mod), r3(ex.torch_mult), ex.rounds] }; },
    calculate(self, card, context) { return torch_song(card, context) || starter9_main(card, context) || level_evo(self, card, context, 'j_poke_skeledirge'); },
  },
  // Skeledirge 911: Safari $10; gives the banked Mult (it banks no more) and banks X0.05 Mult per hand played.
  skeledirge: {
    name: 'skeledirge', poke_sprite391: sprite('Natdex', 20, 60),
    config: { extra: { d_size: 1, torch_mult: 0, torch_Xmult: 1, Xmult_mod: 0.05 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fire', gen: 9, blueprint_compat: true,
    attributes: ['starter', 'discard', 'passive', 'mult', 'xmult', 'scaling'], poke_after: 'crocalor',
    poke_custom_values_to_keep: ['torch_mult', 'torch_Xmult'],
    ...discards,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.torch_mult), r3(ex.Xmult_mod), r3(ex.torch_Xmult)] }; },
    calculate(self, card, context) { return torch_song(card, context) || starter9_main(card, context); },
  },

  // ---------------------------------------------------------------- LINE F2c: Quaxly -> Quaxwell -> Quaquaval (Water starter, Gen 9)
  // The owner's Gen 9 starters (2026-10-28, contentRev 51). Moxie: when you beat a Blind, permanently banks Chips for each unused hand
  // (the hands left after the winning one) on the joker (`moxie_chips`, in no energy_values: never retroactive; kept through both
  // evolutions). The gain is `chip_mod` (Energy +20% of its base each: Quaxly 4 -> 4.8 / 5.6 / 6.4, Quaxwell 6 -> 7.2 / 8.4 / 9.6).
  // Quaquaval banks X Mult instead (`moxie_Xmult` from X1, gain `Xmult_mod` 0.2 -> 0.24 / 0.28 / 0.32 per unused hand) and still gives
  // the banked Chips. The Water starter perk at every stage: +1 hand (`hands`, fixed: the Squirtle line's pair). 5 rounds, then 5.
  // Quaxly 912: Uncommon $5, a starter (the Starter Pack).
  quaxly: {
    name: 'quaxly', poke_sprite391: sprite('Natdex', 22, 60),
    config: { extra: { hands: 1, moxie_chips: 0, chip_mod: 4, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Water', gen: 9, blueprint_compat: true, starter: true,
    attributes: ['starter', 'hands', 'passive', 'chips', 'scaling', 'round_evo'], poke_after: 'skeledirge',
    poke_custom_values_to_keep: ['moxie_chips'],
    ...hands,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.chip_mod), r3(ex.moxie_chips), ex.rounds] }; },
    calculate(self, card, context) { moxie_bank(card, context); return starter9_main(card, context) || level_evo(self, card, context, 'j_poke_quaxwell'); },
  },
  // Quaxwell 913: Safari $8; Quaxly's bank, +6 Chips per unused hand.
  quaxwell: {
    name: 'quaxwell', poke_sprite391: sprite('Natdex', 24, 60),
    config: { extra: { hands: 1, moxie_chips: 0, chip_mod: 6, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 9, blueprint_compat: true,
    attributes: ['starter', 'hands', 'passive', 'chips', 'scaling', 'round_evo'], poke_after: 'quaxly',
    poke_custom_values_to_keep: ['moxie_chips'],
    ...hands,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.chip_mod), r3(ex.moxie_chips), ex.rounds] }; },
    calculate(self, card, context) { moxie_bank(card, context); return starter9_main(card, context) || level_evo(self, card, context, 'j_poke_quaquaval'); },
  },
  // Quaquaval 914: Safari $10; gives the banked Chips (it banks no more) and banks X0.2 Mult per unused hand when you beat a Blind.
  quaquaval: {
    name: 'quaquaval', poke_sprite391: sprite('Natdex', 26, 60),
    config: { extra: { hands: 1, moxie_chips: 0, moxie_Xmult: 1, Xmult_mod: 0.2 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Water', gen: 9, blueprint_compat: true,
    attributes: ['starter', 'hands', 'passive', 'chips', 'xmult', 'scaling'], poke_after: 'quaxwell',
    poke_custom_values_to_keep: ['moxie_chips', 'moxie_Xmult'],
    ...hands,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.moxie_chips), r3(ex.Xmult_mod), r3(ex.moxie_Xmult)] }; },
    calculate(self, card, context) { moxie_bank(card, context); return starter9_main(card, context); },
  },

  // ---------------------------------------------------------------- LINE F3: Whismur -> Loudred -> Exploud (Colorless, Gen 3)
  // The owner's design (2026-10-27): each Glass card that breaks (its 1 in 4 shatter, as Glass Joker counts) grows the joker, and
  // every form keeps what the last had. Starting / banked totals: glass_chips / glass_mult / glass_Xmult (in no energy_values:
  // Energy never scales them, so a banked gain keeps its worth); the gain per break: chip_mod / mult_mod / Xmult_mod (Energy +20%
  // of its base each: +4 / +0.6 / +X0.04). The totals carry over on evolution (poke_custom_values_to_keep); Energy too
  // (energy_count, re-applied to the new base gain). Each evolution makes a Negative Justice (Chingling's). 4 rounds, then 5.
  // Whismur 293: +30 Chips; +20 Chips per broken Glass card.
  whismur: {
    name: 'whismur', poke_sprite391: sprite('Natdex', 14, 19),
    config: { extra: { glass_chips: 30, chip_mod: 20, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Colorless', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'enhancements', 'tarot', 'round_evo'], poke_after: 'shedinja',
    poke_custom_values_to_keep: ['glass_chips'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); glass_tips(info_queue, true); const ex = card.ability.extra; return { vars: [ex.glass_chips, ex.chip_mod, ex.rounds] }; },
    calculate(self, card, context) {
      return glass_grow(card, context, 'glass_chips', 'chip_mod', 'a_chips') || glass_main(card, context) || level_evo(self, card, context, 'j_poke_loudred');
    },
  },
  // Loudred 294: Whismur's Chips (+30 fresh) and +4 Mult; +3 Mult per broken Glass card. A Negative Justice when it evolves in.
  loudred: {
    name: 'loudred', poke_sprite391: sprite('Natdex', 16, 19),
    config: { extra: { glass_chips: 30, glass_mult: 4, mult_mod: 3, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'mult', 'scaling', 'enhancements', 'tarot', 'round_evo'], poke_after: 'whismur',
    poke_custom_values_to_keep: ['glass_chips', 'glass_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); glass_tips(info_queue, true); const ex = card.ability.extra; return { vars: [ex.glass_chips, ex.glass_mult, ex.mult_mod, ex.rounds] }; },
    calculate(self, card, context) {
      glass_evolved(card, context, 'whismur');
      return glass_grow(card, context, 'glass_mult', 'mult_mod', 'a_mult') || glass_main(card, context) || level_evo(self, card, context, 'j_poke_exploud');
    },
  },
  // Exploud 295: the Chips and the Mult (+30 / +4 fresh) and X1.5 Mult; +X0.2 per broken Glass card. A Negative Justice when it
  // evolves in.
  exploud: {
    name: 'exploud', poke_sprite391: sprite('Natdex', 18, 19),
    config: { extra: { glass_chips: 30, glass_mult: 4, glass_Xmult: 1.5, Xmult_mod: 0.2 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Colorless', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'mult', 'xmult', 'scaling', 'enhancements'], poke_after: 'loudred',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); glass_tips(info_queue, false); const ex = card.ability.extra; return { vars: [ex.glass_chips, ex.glass_mult, ex.glass_Xmult, ex.Xmult_mod] }; },
    calculate(self, card, context) {
      glass_evolved(card, context, 'loudred');
      return glass_grow(card, context, 'glass_Xmult', 'Xmult_mod', 'a_xmult') || glass_main(card, context);
    },
  },

  // ---------------------------------------------------------------- LINE F4: Gulpin -> Swalot (Dark, Gen 3)
  // The owner's design (2026-10-27): Stockpile. At the end of each round it swallows (destroys, Pokermon's poke_remove_card — the
  // Hazard plumbing) 1 Hazard card held in hand, else 1 Diamond card held in hand, gaining 1 Stockpile up to its max (3; each
  // Energy +1: the house energy field `stockpile_max`, systems/energy.js). Scored Diamonds give +2 Mult per Stockpile
  // (`stockpile_mult`: not energized). Gulpin at max swallows only Hazards (a Diamond would be eaten for nothing); it evolves at
  // exactly 3 Stockpile (fixed: Energy never slows it), and the Stockpile carries into Swalot.
  // Gulpin 316: Uncommon $6.
  gulpin: {
    name: 'gulpin', poke_sprite391: sprite('Natdex', 0, 21),
    config: { extra: { stockpile: 0, stockpile_max: 3, stockpile_mult: 2, stockpile_evo: 3 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Dark', gen: 3, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'suit', 'diamonds', 'hazards', 'destroy_card', 'scaling_evo'], poke_after: 'roselia',
    poke_custom_values_to_keep: ['stockpile'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_hazard);
      const ex = card.ability.extra;
      return { vars: [ex.stockpile, stock_max(ex), ex.stockpile_mult, stock_mult(ex), ex.stockpile_evo] };
    },
    calculate(self, card, context) {
      const r = stockpile_mult(card, context);
      if (r) return r;
      swallow(card, context, false);
      return scaling_evo(self, card, context, 'j_poke_swalot', card.ability.extra.stockpile, card.ability.extra.stockpile_evo);
    },
  },
  // Swalot 317: Safari $8. Keeps the Stockpile and its Mult; a swallowed Diamond (when no Hazard is held) also pays its rank in $
  // (2-10, J 11, Q 12, K 13, A 14: get_id, as Balatro numbers ranks; fixed, not energized) — even at max. X0.1 Mult per card the
  // deck is below its starting size (Erosion's G.GAME.starting_deck_size; `Xmult_mod`, energized: +X0.02 per Energy), never below X1.
  swalot: {
    name: 'swalot', poke_sprite391: sprite('Natdex', 2, 21),
    config: { extra: { stockpile: 0, stockpile_max: 3, stockpile_mult: 2, Xmult_mod: 0.1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 3, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'scaling', 'economy', 'suit', 'diamonds', 'hazards', 'destroy_card', 'full_deck'], poke_after: 'gulpin',
    poke_custom_values_to_keep: ['stockpile'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_hazard);
      const ex = card.ability.extra;
      return { vars: [ex.stockpile, stock_max(ex), ex.stockpile_mult, stock_mult(ex), r3(ex.Xmult_mod), r3(swalot_x(ex))] };
    },
    calculate(self, card, context) {
      const r = stockpile_mult(card, context);
      if (r) return r;
      if (context.joker_main && swalot_x(card.ability.extra) > 1) {
        const x = swalot_x(card.ability.extra);
        return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
      }
      swallow(card, context, true);
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE F5: Trapinch -> Vibrava -> Flygon (Earth, Gen 3)
  // The owner's design (2026-10-27): Sand Pit. Every card you discard (a real discard: not one an effect makes — `hook`) permanently
  // banks Chips on the joker (`sand_chips`, in no energy_values, so a banked Chip keeps its worth and Energy is never retroactive),
  // which it gives every hand. The gain per card is `chip_mod` (Energy +20% of its base each: Trapinch +0.4, Vibrava +0.6). The bank
  // carries through both evolutions (poke_custom_values_to_keep); Energy too (energy_count, re-applied to the new base). Evolution by
  // cards discarded (`sand_cards`, at end of round): 40, then 60 more (the count starts over).
  // Trapinch 328: Uncommon $6; +2 Chips per discarded card.
  trapinch: {
    name: 'trapinch', poke_sprite391: sprite('Natdex', 24, 21),
    config: { evo_rqmt: 40, extra: { sand_chips: 0, chip_mod: 2, sand_cards: 0 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'discard', 'scaling_evo'], poke_after: 'spinda',
    poke_custom_values_to_keep: ['sand_chips'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.sand_chips), r3(ex.chip_mod), ex.sand_cards || 0, self.config.evo_rqmt] }; },
    calculate(self, card, context) {
      return sand_pit(card, context) || sand_main(card, context) || scaling_evo(self, card, context, 'j_poke_vibrava', card.ability.extra.sand_cards || 0, self.config.evo_rqmt);
    },
  },
  // Vibrava 329: Safari $8. Trapinch's bank, +3 Chips per discarded card; Supersonic: +1 discard each round while held (fixed: d_size
  // is never energized). Evolves after 60 more discarded cards.
  vibrava: {
    name: 'vibrava', poke_sprite391: sprite('Natdex', 26, 21),
    config: { evo_rqmt: 60, extra: { sand_chips: 0, chip_mod: 3, sand_cards: 0, d_size: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'discard', 'scaling_evo'], poke_after: 'trapinch',
    poke_custom_values_to_keep: ['sand_chips'],
    ...discards,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.sand_chips), r3(ex.chip_mod), ex.sand_cards || 0, self.config.evo_rqmt, ex.d_size] }; },
    calculate(self, card, context) {
      return sand_pit(card, context) || sand_main(card, context) || scaling_evo(self, card, context, 'j_poke_flygon', card.ability.extra.sand_cards || 0, self.config.evo_rqmt);
    },
  },
  // Flygon 330: Safari $10. Gives the whole bank (it banks no more: its power is the X Mult) and, Sandstorm, X(1 + 0.25 per discard
  // used this round): a discard use counts once however many cards; it resets each round. `Xmult_mod` (Energy +20% of its base each:
  // X0.3 / X0.35 / X0.4 per discard). No +1 discard (Vibrava's goes when it evolves).
  flygon: {
    name: 'flygon', poke_sprite391: sprite('Natdex', 28, 21),
    config: { extra: { sand_chips: 0, Xmult_mod: 0.25 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'discard', 'reset'], poke_after: 'vibrava',
    poke_custom_values_to_keep: ['sand_chips'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.sand_chips), r3(ex.Xmult_mod), sandstorm_x(ex)] }; },
    calculate(self, card, context) { return sand_main(card, context); },
  },

  // ---------------------------------------------------------------- LINE F6: Spoink -> Grumpig (Psychic, Gen 3)
  // The owner's design (2026-10-27): Pearl. At the end of each round a random card held in hand with no seal gains a Pink Seal
  // (pearl: seeded; none unsealed, nothing). Every Pink Seal trigger (its scoring effect firing, with or without room for the Energy:
  // seals1.js pink_triggered -> the center's poke_pink_trigger hook; Blueprint has none, so it copies the X Mult and never counts)
  // grows the banked X Mult (`pink_Xmult`, in no energy field: never retroactive; kept through evolution). The gains are `Xmult_mod`
  // (Energy +20% of its base each: Spoink X0.1 -> +0.02, Grumpig X0.15 -> +0.03, its Black Pearl twice that -> +0.06).
  // Spoink 325: Common $5; X0.1 per Pink Seal trigger; evolves after 8 triggers (`pink_triggers`, at end of round).
  spoink: {
    name: 'spoink', poke_sprite391: sprite('Natdex', 18, 21),
    config: { evo_rqmt: 8, extra: { pink_Xmult: 1, Xmult_mod: 0.1, pink_triggers: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Psychic', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'seals', 'energy', 'scaling_evo'], poke_after: 'torkoal',
    poke_custom_values_to_keep: ['pink_Xmult'],
    poke_pink_trigger(self, card) {
      const ex = card.ability.extra;
      ex.pink_triggers = (ex.pink_triggers || 0) + 1;
      ex.pink_Xmult = r3(ex.pink_Xmult + ex.Xmult_mod);
      card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'XMULT' });
    },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); pink_tip(info_queue);
      const ex = card.ability.extra;
      return { vars: [r3(ex.pink_Xmult), r3(ex.Xmult_mod), ex.pink_triggers || 0, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      pearl(card, context);
      return pearl_main(card, context) || scaling_evo(self, card, context, 'j_poke_grumpig', card.ability.extra.pink_triggers || 0, self.config.evo_rqmt);
    },
  },
  // Grumpig 326: Safari $8. Spoink's bank and Pearl; Spoink Dance: Pink Seals trigger on EVERY hand while it is held (seals1.js);
  // X0.15 for each hand in which a Pink Seal triggered (once per hand, not per seal); Black Pearl: X0.3 instead when one of that
  // hand's Pink Seals had no room for its Energy (the overflow gain replaces the normal one: still once per hand).
  grumpig: {
    name: 'grumpig', poke_sprite391: sprite('Natdex', 20, 21),
    config: { extra: { pink_Xmult: 1, Xmult_mod: 0.15 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'seals', 'energy'], poke_after: 'spoink',
    poke_custom_values_to_keep: ['pink_Xmult'],
    poke_pink_trigger(self, card, seal_card, overflow) { grumpig_gain(card, overflow); },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); pink_tip(info_queue);
      const ex = card.ability.extra;
      return { vars: [r3(ex.pink_Xmult), r3(ex.Xmult_mod), r3(2 * ex.Xmult_mod)] };
    },
    calculate(self, card, context) {
      pearl(card, context);
      return pearl_main(card, context);
    },
  },

  // ---------------------------------------------------------------- the pair: Lunatone + Solrock (Earth, Gen 3; like Plusle / Minun)
  // The owner's design (2026-10-28). Day and night: within each round the 1st, 3rd and 5th hands are DAY, the 2nd and 4th NIGHT
  // (G.GAME.current_round.hands_played before the hand: even = day). Solrock, Sunlight: +100 Chips on day hands (`chips`). Lunatone,
  // Moonlight: X2 Mult on night hands (`Xmult`). Cosmic Power: with the other one owned (not debuffed; find_card), each also covers
  // the other half of the cycle at half strength — Solrock +chips/2 on night hands, Lunatone X(1 + (Xmult - 1) / 2) on day hands — so
  // every hand gets both. Each copy acts on its own. Energy: chips +30% / Xmult +20% of base; the half values are DERIVED from them,
  // so they stay exactly half (one Energy: +130 / +65 Chips, X2.4 / X1.7). Uncommon $6: single-stage, priced below the usual Rare $7
  // because each alone works half the time. Not Blueprint-restricted. Art: upstream 3.9.1's own cells (Natdex 12 / 14, 22).
  lunatone: {
    name: 'lunatone', poke_sprite391: sprite('Natdex', 12, 22),
    config: { extra: { Xmult: 2 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'hands', 'pair'], poke_after: 'seviper',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult), r3(moon_half(ex)), next_is_day() ? 'Day' : 'Night', cosmic(card, 'j_poke_solrock') ? 'active' : 'needs Solrock'] };
    },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const ex = card.ability.extra;
      const x = !is_day() ? ex.Xmult : cosmic(card, 'j_poke_solrock') ? moon_half(ex) : 1;
      if (x === 1) return undefined;
      return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
    },
  },
  solrock: {
    name: 'solrock', poke_sprite391: sprite('Natdex', 14, 22),
    config: { extra: { chips: 100 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'hands', 'pair'], poke_after: 'lunatone',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.chips), r3(sun_half(ex)), next_is_day() ? 'Day' : 'Night', cosmic(card, 'j_poke_lunatone') ? 'active' : 'needs Lunatone'] };
    },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const ex = card.ability.extra;
      const c = is_day() ? ex.chips : cosmic(card, 'j_poke_lunatone') ? sun_half(ex) : 0;
      if (!c) return undefined;
      return { message: a_chips(r3(c)), colour: 'CHIPS', chip_mod: c };
    },
  },

  // ---------------------------------------------------------------- LINE F7: Barboach -> Whiscash (Water, Gen 3)
  // The owner's design (2026-10-28): a Water / Earth team. Muddy Water: +Chips for each Water or Earth Joker you have, itself included
  // (muddy_count above: a dual-type joker once; Tera stickers and Castform's form through is_type; debuffed jokers don't count). The
  // per-joker Chips is `chips` (Energy +30% of its base each: Barboach 12 -> 15.6 / 19.2 / 22.8, Whiscash 20 -> 26 / 32 / 38). Neither
  // Nacho nor Pokermon+ has the line. Art: upstream 3.9.1's own (Natdex 16 / 18, 22).
  // Barboach 339: Common $5; +12 Chips per Water / Earth Joker. Evolves after 5 rounds.
  barboach: {
    name: 'barboach', poke_sprite391: sprite('Natdex', 16, 22),
    config: { extra: { chips: 12, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'types', 'round_evo'], poke_after: 'solrock',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, n = muddy_count(card);
      return { vars: [r3(ex.chips), n, r3(ex.chips * n), ex.rounds] };
    },
    calculate(self, card, context) { return muddy_main(card, context) || level_evo(self, card, context, 'j_poke_whiscash'); },
  },
  // Whiscash 340: Safari $8; +20 Chips per Water / Earth Joker; Earthquake: with at least 2 OTHER Water / Earth Jokers, the first hand
  // of each round (hands_played === 0) retriggers every scored card once (`retriggers`, fixed: never energized; `quake_req` neither).
  // A Blueprint copying it adds its own retrigger, as on Remoraid / Octillery (the condition is read from Whiscash's row).
  whiscash: {
    name: 'whiscash', poke_sprite391: sprite('Natdex', 18, 22),
    config: { extra: { chips: 20, retriggers: 1, quake_req: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'types', 'retrigger'], poke_after: 'barboach',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, n = muddy_count(card);
      return { vars: [r3(ex.chips), n, r3(ex.chips * n), ex.quake_req, quake_state(card)] };
    },
    calculate(self, card, context) {
      if (context.first_hand_drawn && !context.blueprint && quake_on(card)) {
        juice_card_until(card, () => G.GAME.current_round.hands_played === 0 && !G.RESET_JIGGLES && quake_on(card), true);
      }
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && G.GAME.current_round.hands_played === 0 && quake_on(card)) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return muddy_main(card, context);
    },
  },

  // ---------------------------------------------------------------- LINE F8: Starly -> Staravia -> Staraptor (Colorless, Gen 4)
  // The owner's design (2026-10-28): a Colorless team (flock_count above: Tera stickers and Castform's Normal form through is_type;
  // debuffed jokers don't count; itself always does). Energy: Starly / Staravia's per-joker `mult` (+40% of base each: 2 -> 2.8 / 3.6
  // / 4.4, 4 -> 5.6 / 7.2 / 8.8), Staraptor's per-joker `Xmult_mod` (+20%: X0.5 -> X0.6 / X0.7 / X0.8); the $1 `recoil` is fixed (in
  // no energy field). Energy is re-applied to each new base on evolution. Neither Nacho nor Pokermon+ has the line. Art: upstream
  // 3.9.1's own (Natdex 10 / 12 / 14, 26). After Deoxys in Pokédex order (Pokermon has no joker for 387-395).
  // Starly 396: Uncommon $6; Flock, +2 Mult per Colorless Joker. Evolves after 4 rounds.
  starly: {
    name: 'starly', poke_sprite391: sprite('Natdex', 10, 26),
    config: { extra: { mult: 2, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Colorless', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'types', 'round_evo'], poke_after: 'deoxys',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), flock_count(card), flock_mult(card), ex.rounds] }; },
    calculate(self, card, context) { return flock_main(card, context) || level_evo(self, card, context, 'j_poke_staravia'); },
  },
  // Staravia 397: Safari $8; Flock, +4 Mult per Colorless Joker. Evolves after 5 rounds.
  staravia: {
    name: 'staravia', poke_sprite391: sprite('Natdex', 12, 26),
    config: { extra: { mult: 4, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'types', 'round_evo'], poke_after: 'starly',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), flock_count(card), flock_mult(card), ex.rounds] }; },
    calculate(self, card, context) { return flock_main(card, context) || level_evo(self, card, context, 'j_poke_staraptor'); },
  },
  // Staraptor 398: Safari $10; Brave Bird, X(1 + 0.5 per Colorless Joker); Recoil: each hand played loses $1 (recoil() above: only
  // while the money stays at or above the debt limit, as the shop's own check; not copied by Blueprint, which copies the X Mult).
  staraptor: {
    name: 'staraptor', poke_sprite391: sprite('Natdex', 14, 26),
    config: { extra: { Xmult_mod: 0.5, recoil: 1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Colorless', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'types', 'money'], poke_after: 'staravia',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), ex.recoil, flock_count(card), brave_x(card)] }; },
    calculate(self, card, context) {
      recoil(card, context);
      if (context.joker_main) { const x = brave_x(card); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE F9: Drifloon -> Drifblim (Psychic: Ghost/Flying, Gen 4)
  // The owner's design (2026-10-28): Stockpile (Gulpin's counter and its `stockpile_max` energy field, reused: stock_max) charged by
  // discards, released on the round's last hand. Each player DISCARD action gains 1 Stockpile up to max (once per discard, not per
  // card: drift_charge). Spit Up: on the FINAL hand of the round (hands_left 0, Acrobat's check) X(1 + 0.5 per Stockpile), then the
  // Stockpile resets to 0 (spit_up: the reset waits for `after`, so a Blueprint either side copies the X; it never adds or resets).
  // Energy: +1 max Stockpile each (Colorless +0.5, floored); the X0.5 per Stockpile (`spit_Xmult`) is never energized. Stockpile and
  // Energy carry into Drifblim. Art: upstream 3.9.1's own cells (Natdex 8 / 10, 28: the Psychic frame).
  // Drifloon 425: Common $5 (a 2-stage line's Basic); max 3; evolves after 4 Spit Ups (each with 1+ Stockpile; `spit_ups`, end of round).
  drifloon: {
    name: 'drifloon', poke_sprite391: sprite('Natdex', 8, 28),
    config: { evo_rqmt: 4, extra: { stockpile: 0, stockpile_max: 3, spit_Xmult: 0.5, spit_ups: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Psychic', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'discard', 'reset', 'scaling_evo'], poke_after: 'ambipom',
    poke_custom_values_to_keep: ['stockpile'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: drift_vars(card.ability.extra, self.config.evo_rqmt) }; },
    calculate(self, card, context) {
      drift_charge(card, context);
      return spit_up(card, context) || scaling_evo(self, card, context, 'j_poke_drifblim', card.ability.extra.spit_ups || 0, self.config.evo_rqmt);
    },
  },
  // Drifblim 426: Safari $8. The same Stockpile and Spit Up, max 5 (stockpile_max 3 — the energy field's base, so still +1 per Energy —
  // plus a fixed `stockpile_bonus` 2: 5 -> 8 with 3 Energy). Aftermath: when SOLD (selling_self) or DESTROYED (index.js
  // hooks.start_dissolve -> drifblim_destroyed), create a Negative Spectral card (aftermath). Not when it transforms; not a Blueprint.
  drifblim: {
    name: 'drifblim', poke_sprite391: sprite('Natdex', 10, 28),
    config: { extra: { stockpile: 0, stockpile_max: 3, stockpile_bonus: 2, spit_Xmult: 0.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'discard', 'reset', 'spectral', 'on_sell'], poke_after: 'drifloon',
    poke_custom_values_to_keep: ['stockpile'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed()) info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } });
      return { vars: drift_vars(card.ability.extra) };
    },
    calculate(self, card, context) {
      if (context.selling_self && !context.blueprint) { aftermath(card); return undefined; }
      drift_charge(card, context);
      return spit_up(card, context);
    },
  },

  // ---------------------------------------------------------------- Castform 351 (Colorless, Gen 3)
  // The owner's design (2026-10-27): Forecast. When the round's first hand is drawn, Castform reads the weather from the suit held
  // most (forecast: Hearts + Diamonds together vs Clubs vs Spades; Wild counts for all three; debuffed / suitless cards for none;
  // a tie is Normal) and takes that form for the whole round — its type too (Sunny Fire, Rainy Water, Snowy Water: Ice maps to
  // Water, Normal Colorless). After the round (the end_of_round pass, queued so the other jokers' end-of-round effects still see the
  // form) it is Normal again: in the shop it is Colorless. Effects: Sunny, scored Hearts / Diamonds +4 Mult (`mult1`); Rainy, scored
  // Clubs +30 Chips (`chips1`) and the first scored Club retriggers (fixed); Snowy, Spades held in hand X1.1 Mult each (`Xmult_multi`);
  // Normal, +10 Mult (`mult2`). Energy (energize, the usual shares of base): every form's number at once — mult1 / mult2 +40%, chips1
  // +30%, Xmult_multi +5%; Colorless Energy always matches (half strength unless it is Normal, as on any non-Colorless joker), its
  // current form's type matches while it is in that form. Its changing type never counts against a Monotype run (poke_mono_exempt:
  // systems/runbadges.js leaves it out of the check). Art: upstream 3.9.1's own cards — its Natdex card (Normal) and the three
  // weather forms on the Gen 3 sheet (ui.js, systems/anim.js CASTFORM_SPRITES).
  castform: {
    name: 'castform', poke_sprite391: sprite('Natdex', 10, 23),
    config: { extra: { mult1: 4, chips1: 30, retriggers: 1, Xmult_multi: 1.1, mult2: 10, form: 'normal' } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Colorless', gen: 3, blueprint_compat: true,
    attributes: ['mult', 'chips', 'xmult', 'retrigger', 'suits', 'types', 'hand_drawn'], poke_after: 'milotic',
    poke_mono_exempt: true,
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, form = CASTFORM_FORMS[ex.form] ? ex.form : 'normal';
      return { vars: [r3(ex.mult1), r3(ex.chips1), r3(ex.Xmult_multi), r3(ex.mult2), CASTFORM_FORMS[form].name], key: form === 'normal' ? undefined : 'j_poke_castform_' + form };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (first_deal(card, context)) {
        ex.forecast_round = G.GAME.round;
        // (Kyogre / Groudon lock the weather; Rayquaza calms it; Volcarona makes it Sunny, except where Kyogre locks it Rainy)
        const lock = castform_lock();
        const form = lock === 'rainy' ? lock : volcarona_sun() ? 'sunny' : lock || forecast(G.hand.cards);
        castform_set_form(card, form);
        card_eval_status_text(card, 'extra', null, null, null, { message: CASTFORM_FORMS[form].name + '!', colour: CASTFORM_FORMS[form].colour });
        return undefined;
      }
      if (round_end(context) && !context.blueprint) {
        G.E_MANAGER.add_event(() => { castform_set_form(card, 'normal'); });
        return undefined;
      }
      const form = ex.form;
      if (form === 'sunny' && context.individual && context.cardarea === G.play && !context.end_of_round
        && (context.other_card.is_suit('Hearts') || context.other_card.is_suit('Diamonds'))) return { mult: ex.mult1, card };
      if (form === 'rainy') {
        if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit('Clubs')) return { chips: ex.chips1, card };
        if (context.repetition && context.cardarea === G.play && context.other_card === first_club(context)) return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
      }
      if (form === 'snowy' && context.individual && context.cardarea === G.hand && !context.end_of_round && context.other_card.is_suit('Spades')) {
        return { x_mult: ex.Xmult_multi, card };
      }
      if (form === 'normal' && context.joker_main) return { message: a_mult(r3(ex.mult2)), colour: 'MULT', mult_mod: ex.mult2 };
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE I: Mudbray -> Mudsdale (Earth, Gen 7)
  // Mudbray 749: +20 Chips; Stamina: +6 Chips for each hand that isn't the round's first. Evolves in 5 rounds.
  mudbray: {
    name: 'mudbray', poke_sprite391: sprite('Natdex', 26, 49),
    config: { extra: { chips: 20, chip_mod: 6, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Earth', gen: 7, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'round_evo'], poke_after: 'lycanroc_dusk',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.chips, ex.chip_mod, ex.rounds] }; },
    calculate(self, card, context) { return stamina(card, context) || level_evo(self, card, context, 'j_poke_mudsdale'); },
  },
  // Mudsdale 750: Stamina +10 Chips; Mud Spit: the first unscored card of each played hand becomes a Stone card.
  mudsdale: {
    name: 'mudsdale', poke_sprite391: sprite('Natdex', 28, 49),
    config: { extra: { chips: 20, chip_mod: 10 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 7, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'modify_card', 'enhancements'], poke_after: 'mudbray',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [ex.chip_mod, ex.chips] }; },
    calculate(self, card, context) {
      if (context.before && context.cardarea === G.jokers && !context.blueprint && context.full_hand) {
        const target = context.full_hand.find((c) => !context.scoring_hand.includes(c));
        if (target) {
          target.set_ability(P_CENTERS.m_stone, null, true);
          G.E_MANAGER.add_event(() => { target.juice_up(); });
          card_eval_status_text(card, 'extra', null, null, null, { message: 'Mud Spit!', colour: 'CHIPS' });
        }
      }
      return stamina(card, context);
    },
  },

  // ---------------------------------------------------------------- The Regi trio: Regirock 377 / Regice 378 / Registeel 379 (Gen 3)
  // The owner's design (2026-10-28). Three Legendaries ($20; The Soul / the Legendary pool, like Pokermon's other Legendaries), each
  // with a "Body" rule for one enhancement and the same Regi Trio conversion: when a Blind is selected, 1 random card of your full deck
  // becomes that enhancement, 2 on a BOSS Blind (contentRev 59, the owner's solo rule; it was 1 + the OTHER Regi species held)
  // (regi_convert: unenhanced cards first, then any card not already it). Types from the card art: Regirock Earth, Regice Water (Ice), Registeel Metal. Neither Nacho nor
  // Pokermon+ has them. Art: upstream 3.9.1's own cells with their floating souls (Natdex 2-7, 25).
  // Regirock 377 (Earth), Stone Body: Stone cards give +100 Chips instead of +50 (hook chip_bonus: regi_chip_bonus; `chips1`, Energy
  // +30%: 130 / 160 / 190) and permanently gain +10 Chips each time they score (perma_bonus, as Rhyhorn / Hiker; `chip_mod`, Energy
  // +20%: 12 / 14 / 16; Blueprint copies it).
  regirock: {
    name: 'regirock', poke_sprite391: sprite('Natdex', 2, 25, [3, 25]),
    config: { extra: { chips1: 100, chip_mod: 10 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'enhancements', 'modify_card', 'full_deck'], poke_after: 'metagross',
    loc_vars(self, info_queue, card) { regi_tips(self, info_queue, card, 'm_stone'); const ex = card.ability.extra; return { vars: [r3(ex.chips1), r3(ex.chip_mod), regi_base(card)] }; },
    calculate(self, card, context) {
      regi_convert(card, context, 'm_stone', 'regirock', 'Stone');
      if (context.individual && context.cardarea === G.play && !context.end_of_round && !context.other_card.debuff && has_enhancement(context.other_card, 'm_stone')) {
        const c = context.other_card;
        c.ability.perma_bonus = (c.ability.perma_bonus || 0) + card.ability.extra.chip_mod;
        return { extra: { message: localize('k_upgrade_ex'), colour: 'CHIPS' }, colour: 'CHIPS', card };
      }
      return undefined;
    },
  },
  // Regice 378 (Water), Ice Body: Glass cards never shatter (their 1 in 4 break roll, identifier 'glass', is fixed to 0 — SMODS's
  // fix_probability, as Absol fixes every roll; nothing breaks, so Glass Joker / the Whismur line count nothing). Its conversion makes
  // Glass; `glass_convert` is its base 1 (the house energy field, systems/energy.js: +1 per Energy, +0.5 per mismatched Colorless,
  // floored), so each Energy converts 1 more Glass card per Blind.
  regice: {
    name: 'regice', poke_sprite391: sprite('Natdex', 4, 25, [5, 25]),
    config: { extra: { glass_convert: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'modify_card', 'full_deck', 'chance'], poke_after: 'regirock',
    loc_vars(self, info_queue, card) { regi_tips(self, info_queue, card, 'm_glass'); return { vars: [regi_base(card), Math.floor(card.ability.extra.glass_convert + 1e-9)] }; },
    calculate(self, card, context) {
      if (context.fix_probability && !context.blueprint && context.identifier === 'glass') return { numerator: 0 };
      regi_convert(card, context, 'm_glass', 'regice', 'Glass');
      return undefined;
    },
  },
  // Registeel 379 (Metal), Iron Body: Steel cards held in hand give X2 Mult instead of X1.5 (hook chip_h_x_mult: regi_h_x_mult — the
  // Steel card's own held effect, so Mime / a Red Seal retrigger it; `Xmult_multi`, the per-card X, Energy +5%: X2.1 / X2.2 / X2.3).
  registeel: {
    name: 'registeel', poke_sprite391: sprite('Natdex', 6, 25, [7, 25]),
    config: { extra: { Xmult_multi: 2 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Metal', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'modify_card', 'full_deck'], poke_after: 'regice',
    loc_vars(self, info_queue, card) { regi_tips(self, info_queue, card, 'm_steel'); return { vars: [r3(card.ability.extra.Xmult_multi), regi_base(card)] }; },
    calculate(self, card, context) { regi_convert(card, context, 'm_steel', 'registeel', 'Steel'); return undefined; },
  },

  // ---------------------------------------------------------------- The Eon duo: Latias 380 / Latios 381 (Psychic, Gen 3)
  // The owner's design (2026-10-28). Legendary $20 each (The Soul / the Legendary pool). Types from the card art: both Psychic (their
  // real Dragon type is the mapping's; the 3.9.1 card draws the Psychic icon). Latias, Mist Ball: permanently gains X0.15 Mult each time
  // you use a Tarot card. Latios, Luster Purge: the same for a Planet card. Soul Dew (contentRev 59, the owner's solo rule; it was "holding
  // BOTH, every Tarot or Planet grows both"): each also grows by HALF from the other kind (Latias X0.075 per Planet, Latios X0.075 per
  // Tarot), alone. A Blueprint copies the X, never the growth. Banked in `eon_Xmult` (no
  // energy field), the gain `Xmult_mod` (Energy +20% of base: 0.15 -> 0.18 / 0.21 / 0.24). Neither Nacho nor Pokermon+ has them. Art:
  // upstream 3.9.1's own cells with their floating souls (Natdex 8 / 10, 25).
  latias: {
    name: 'latias', poke_sprite391: sprite('Natdex', 8, 25, [9, 25]),
    config: { extra: { eon_Xmult: 1, Xmult_mod: 0.15 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'tarot', 'planet'], poke_after: 'registeel',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.eon_Xmult), r3(ex.Xmult_mod), r3(eon_half(card))] }; },
    calculate(self, card, context) { return eon(card, context, 'Tarot', 'latios'); },
  },
  latios: {
    name: 'latios', poke_sprite391: sprite('Natdex', 10, 25, [11, 25]),
    config: { extra: { eon_Xmult: 1, Xmult_mod: 0.15 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'tarot', 'planet'], poke_after: 'latias',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.eon_Xmult), r3(ex.Xmult_mod), r3(eon_half(card))] }; },
    calculate(self, card, context) { return eon(card, context, 'Planet', 'latias'); },
  },

  // ---------------------------------------------------------------- The weather trio: Kyogre 382 / Groudon 383 / Rayquaza 384 (Gen 3)
  // The owner's design (2026-10-28). Legendary $20 each. Types from the card art: Kyogre Water, Groudon Earth, Rayquaza Dragon.
  // Kyogre, Primordial Sea: +1 hand each round; every scored Club retriggers once; Castform is locked Rainy. Groudon, Desolate Land:
  // +1 discard each round; scored Hearts and Diamonds each give X1.25 Mult; Castform is locked Sunny. Primal Clash (both held, no
  // Rayquaza): on the round's first deal (Castform's weather read) the cards held decide — more Clubs: Kyogre's round, more Hearts +
  // Diamonds: Groudon's (Wild both, debuffed / Stone / Hazard neither); a tie: the one with more Energy, else Kyogre. The other one does
  // nothing that round, its +1 hand / discard included (primal_read). Rayquaza, Delta Stream: +1 hand AND +1 discard each round (Kyogre's
  // and Groudon's gifts together; contentRev 59, the owner's solo rule: it only calmed the other two before), and while held Kyogre and
  // Groudon both work every round (no clash; Castform reads its normal forecast, the weather calmed); Dragon Ascent: permanently gains X0.2 Mult each time a played hand
  // contains a Straight or a Flush (once for a Straight Flush). Energy: Groudon's per-card `Xmult_multi` +5% of base (X1.25 -> X1.3125
  // / X1.375 / X1.4375); Rayquaza's gain `Xmult_mod` +20% (0.2 -> 0.24 / 0.28 / 0.32; banked in `ascent_Xmult`, no energy field).
  // Kyogre has no number (+1 hand and the retrigger are fixed): Energy-inert by design (poke_no_energy_field). Neither Nacho nor
  // Pokermon+ has them. Art: upstream 3.9.1's own cells with their floating souls (Natdex 12 / 14 / 16, 25).
  kyogre: {
    name: 'kyogre', poke_sprite391: sprite('Natdex', 12, 25, [13, 25]),
    config: { extra: { hands: 1, retriggers: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['hands', 'retrigger', 'suit', 'clubs', 'types'], poke_after: 'latios',
    poke_no_energy_field: true,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, clash_state('groudon')] }; },
    calculate(self, card, context) {
      if (first_deal(card, context)) { card.ability.extra.forecast_round = G.GAME.round; primal_read(); return undefined; }
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && primal_on(card) && context.other_card.is_suit('Clubs')) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return undefined;
    },
    ...primal_bonus('hands'),
  },
  groudon: {
    name: 'groudon', poke_sprite391: sprite('Natdex', 14, 25, [15, 25]),
    config: { extra: { d_size: 1, Xmult_multi: 1.25 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['discard', 'xmult', 'suit', 'hearts', 'diamonds', 'types'], poke_after: 'kyogre',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.Xmult_multi), clash_state('kyogre')] }; },
    calculate(self, card, context) {
      if (first_deal(card, context)) { card.ability.extra.forecast_round = G.GAME.round; primal_read(); return undefined; }
      if (context.individual && context.cardarea === G.play && !context.end_of_round && primal_on(card)
        && (context.other_card.is_suit('Hearts') || context.other_card.is_suit('Diamonds'))) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
    ...primal_bonus('d_size'),
  },
  rayquaza: {
    name: 'rayquaza', poke_sprite391: sprite('Natdex', 16, 25, [17, 25]),
    config: { extra: { ascent_Xmult: 1, Xmult_mod: 0.2, hands: 1, d_size: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Dragon', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'hand_type', 'types', 'hands', 'discard'], poke_after: 'groudon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.ascent_Xmult), r3(ex.Xmult_mod), ex.hands, ex.d_size] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      delta_wake(card, context);
      if (context.before && context.cardarea === G.jokers && !context.blueprint && ascends(context)) {
        ex.ascent_Xmult = r3(ex.ascent_Xmult + ex.Xmult_mod);
        card_eval_status_text(card, 'extra', null, null, null, { message: 'Dragon Ascent!', colour: 'XMULT' });
        return undefined;
      }
      if (context.joker_main && ex.ascent_Xmult > 1) return { message: a_xmult(r3(ex.ascent_Xmult)), colour: 'XMULT', Xmult_mod: ex.ascent_Xmult };
      return undefined;
    },
    ...delta_stream,
  },

  // ---------------------------------------------------------------- LINE J: Cherubi -> Cherrim (Grass, Gen 4)
  // The owner's design (2026-10-28). Types from the card art: both Grass. Sweet Seeds (both): when a Blind is selected, 1 random
  // unenhanced card in the full deck becomes a Seed card (sweet_seeds), and +1 growth level while owned (sweet_growth: a scored Seed
  // grows 2, blooming in 3 scores instead of 5). Cherubi evolves after 2 of your Seeds bloom into Flowers while it is held (the Seed
  // card's bloom calls every owned joker's poke_seed_bloom hook, enhancements/enhancement1.js). Cherrim, Flower Gift: Flower cards need
  // only 3+ suits (as Roserade; with both still 3: a minimum, never stacking); Sunshine Form: while it's sunny (cherrim_sunny) Flower
  // cards give X2.5 instead of X2 (the Flower card asks every owned joker's poke_flower_rule; the best X wins, Shaymin's +1 still on
  // top: X3.5). Energy: the Sunshine X is `Xmult_multi` (the per-card X, +5% of base: X2.625 / X2.75 / X2.875); the conversion and
  // the growth are fixed. Cherubi carries the same field (it has no X of its own) so Energy used on it shows and carries to Cherrim.
  // Neither Nacho nor Pokermon+ has the line. Art: upstream 3.9.1's own cells — Cherubi Natdex {28,27}; Cherrim Overcast Gen 4 {0,1},
  // Sunshine Gen 4 {2,1} (unlisted in pokespriteload.lua, drawn by ui.js ownFace from the view's form, as Castform's weathers).
  // Cherubi 420: Common $5; evolves after 2 Seeds bloom (`seeds_bloomed`, checked at end of round).
  cherubi: {
    name: 'cherubi', poke_sprite391: sprite('Natdex', 28, 27),
    config: { evo_rqmt: 2, extra: { growth: 1, Xmult_multi: 2.5, seeds_bloomed: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 4, blueprint_compat: true,
    attributes: ['enhancements', 'modify_card', 'full_deck', 'scaling_evo'], poke_after: 'floatzel',
    poke_seed_bloom(self, card) {
      const ex = card.ability.extra;
      ex.seeds_bloomed = (ex.seeds_bloomed || 0) + 1;
      card_eval_status_text(card, 'extra', null, null, null, { message: 'Bloom ' + Math.min(ex.seeds_bloomed, self.config.evo_rqmt) + '/' + self.config.evo_rqmt, colour: 'GREEN' });
    },
    loc_vars(self, info_queue, card) {
      seed_tips(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [ex.growth, Math.min(ex.seeds_bloomed || 0, self.config.evo_rqmt), self.config.evo_rqmt, r3(ex.Xmult_multi)] };
    },
    calculate(self, card, context) {
      sweet_seeds(card, context);
      return scaling_evo(self, card, context, 'j_poke_cherrim', card.ability.extra.seeds_bloomed || 0, self.config.evo_rqmt);
    },
    ...sweet_growth,
  },
  // Cherrim 421: Safari $8; Sweet Seeds, Flower Gift, Sunshine Form (Overcast otherwise). Its form shows on the card (poke_view_form).
  cherrim: {
    name: 'cherrim', poke_sprite391: sprite('Gen04', 0, 1),
    config: { extra: { growth: 1, Xmult_multi: 2.5, suits: 3 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'modify_card', 'full_deck', 'suits', 'hand_drawn'], poke_after: 'cherubi',
    /** The Flower card's rule (enhancements/enhancement1.js flower): 3+ suits always; X2.5 (energized) instead of X2 while sunny. */
    poke_flower_rule(self, card) { const ex = card.ability.extra; return { suits: ex.suits, x: cherrim_sunny(card) ? ex.Xmult_multi : undefined }; },
    /** The view's form (systems/anim.js view_card): live, so a Groudon bought or sold redraws it at once. */
    poke_view_form(self, card) { return cherrim_form(card); },
    loc_vars(self, info_queue, card) {
      seed_tips(self, info_queue, card);
      info_queue.push(P_CENTERS.m_poke_flower);
      const ex = card.ability.extra, sun = cherrim_sunny(card);
      return { vars: [ex.growth, ex.suits, r3(ex.Xmult_multi)], key: sun ? 'j_poke_cherrim_sunshine' : undefined };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (first_deal(card, context)) {
        ex.forecast_round = G.GAME.round;
        if (forecast(G.hand.cards) === 'sunny') ex.sun_round = G.GAME.round;
        if (cherrim_sunny(card)) card_eval_status_text(card, 'extra', null, null, null, { message: 'Sunshine!', colour: CASTFORM_FORMS.sunny.colour });
        return undefined;
      }
      sweet_seeds(card, context);
      return undefined;
    },
    ...sweet_growth,
  },

  // ---------------------------------------------------------------- LINE F10: Shellos -> Gastrodon (Water, Gen 4)
  // The owner's design (2026-10-28). Each card has a SEA, West or East, rolled once when it is created (set_ability initial: the run's
  // seeded pseudorandom 'shellos_sea' / 'gastrodon_sea'), kept on ability.extra.form — so through save / resume and evolution — and
  // its card shows that sea: upstream 3.9.1 draws both on the Gen 4 sheet (Shellos East {4,1} blue / West {6,1} pink, Gastrodon East
  // {8,1} / West {10,1}, Shiny twins on the Shiny sheet; systems/anim.js SEA_SPRITES, ui.js ownFace). West works on the LEFTMOST
  // scored card, East on the RIGHTMOST (by position; a debuffed one there scores nothing). Two Seas: holding a West AND an East
  // Shellos / Gastrodon (any mix, undebuffed), every one of them works on BOTH ends; a 1-card hand's card is both ends, once.
  // Energy: the end card's Chips `chips` +30% of base (40 -> 52 / 64 / 76) and Storm Drain's gain `Xmult_mod` +20% (0.1 -> 0.12 /
  // 0.14 / 0.16, Water Energy twice that); the retrigger is fixed; carried through evolution (energy_count re-applied to the new
  // base), never retroactive (the bank `drain_Xmult` is in no energy field). Neither Nacho nor Pokermon+ has the line.
  // Shellos 422: Common $5; Tide Pool, the sea's end card +40 Chips when scored. Evolves after 5 rounds, keeping its sea.
  shellos: {
    name: 'shellos', poke_sprite391: sprite('Gen04', 4, 1),
    config: { extra: { chips: 40, form: 'east', rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 4, blueprint_compat: true,
    attributes: ['chips', 'position', 'round_evo'], poke_after: 'cherrim',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.chips), sea_ends_text(card), SEAS[sea_of(card)].name, two_seas_text(card), ex.rounds] };
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.form = pseudorandom(pseudoseed('shellos_sea')) < 0.5 ? 'west' : 'east';
    },
    calculate(self, card, context) { return tide_chips(card, context) || level_evo(self, card, context, 'j_poke_gastrodon'); },
  },
  // Gastrodon 423: Safari $8; Tide, the sea's end card retriggers once (`retriggers`, fixed) and gives +40 Chips each time it scores
  // (so +80 with the retrigger); Storm Drain, each Energy card used (on any joker) banks X0.1 Mult, X0.2 for Water Energy. Blueprint
  // copies the retrigger, the Chips and the X, never the growth.
  gastrodon: {
    name: 'gastrodon', poke_sprite391: sprite('Gen04', 8, 1),
    config: { extra: { chips: 40, retriggers: 1, Xmult_mod: 0.1, drain_Xmult: 1, form: 'east' } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 4, blueprint_compat: true,
    attributes: ['chips', 'retrigger', 'xmult', 'scaling', 'energy', 'position'], poke_after: 'shellos',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.chips), sea_ends_text(card), SEAS[sea_of(card)].name, two_seas_text(card), r3(ex.Xmult_mod), r3(2 * ex.Xmult_mod), r3(ex.drain_Xmult)] };
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.form = pseudorandom(pseudoseed('gastrodon_sea')) < 0.5 ? 'west' : 'east';
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.using_consumeable && !context.blueprint && context.consumeable && context.consumeable.ability.set === 'Energy') {
        ex.drain_Xmult = r3(ex.drain_Xmult + storm_gain(ex, context.consumeable));
        card_eval_status_text(card, 'extra', null, null, null, { message: 'Storm Drain!', colour: 'XMULT' });
        return undefined;
      }
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && at_sea_end(card, context, context.other_card)) {
        return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
      }
      if (context.joker_main && ex.drain_Xmult > 1) return { message: a_xmult(r3(ex.drain_Xmult)), colour: 'XMULT', Xmult_mod: ex.drain_Xmult };
      return tide_chips(card, context);
    },
  },

  // ---------------------------------------------------------------- Chatot 441 (Colorless, Gen 4)
  // The owner's design (2026-10-28). Rare $7, single-stage. Vocabulary: +4 Mult for each DIFFERENT poker hand type played this run
  // (vocabulary above: G.GAME.hands[h].played > 0, the run's own records, so a Chatot bought late sees the whole run; secret hands
  // count). New Word: the first time each poker hand type is played this run, WHILE Chatot is held, it creates that hand's Planet if
  // there is consumable room (new_word above; tracked per joker in `new_words`, granted once a type). Energy: the per-hand `mult`
  // (+40% of base: 4 -> 5.6 / 7.2 / 8.8); the Planets are fixed. Blueprint copies the Mult, not New Word. Neither Nacho nor Pokermon+
  // has it. Art: upstream 3.9.1's own cell (Natdex 10, 29: the Colorless frame).
  chatot: {
    name: 'chatot', poke_sprite391: sprite('Natdex', 10, 29),
    config: { extra: { mult: 4 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Colorless', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'hand_type', 'planet', 'generation'], poke_after: 'happiny',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [r3(card.ability.extra.mult), vocabulary(), vocab_mult(card)] };
    },
    calculate(self, card, context) {
      new_word(card, context);
      if (!context.joker_main) return undefined;
      const mult = vocab_mult(card);
      if (!mult) return undefined;
      return { message: a_mult(mult), colour: 'MULT', mult_mod: mult };
    },
  },

  // ---------------------------------------------------------------- The Burmy line: Burmy 412 -> Wormadam 413 (female) / Mothim 414 (male)
  // The owner's design (2026-10-28). Burmy (Basic, Common $5) wears a cloak, and its type and card follow it: Plant (Grass), Sandy
  // (Earth), Trash (Metal) — the types upstream 3.9.1's own cards show (the Gen 4 sheet, row 0: Burmy 0 / 2 / 4, Wormadam 6 / 8 /
  // 10; systems/anim.js BURMY_SPRITES). Cloak: at the end of each round (the main end_of_round pass, not Blueprint) it takes the
  // cloak of the biggest pile in the full deck (cloak_of_deck, the owner's ruling of contentRev 41: Stone cards Sandy, Steel cards
  // Trash, every other card — unenhanced or any other enhancement — Plant; a tie keeps the cloak). It starts as Plant. Plant +5 Mult (`mult1`), Sandy +40 Chips (`chips1`), Trash $1 at end of
  // round (calc_dollar_bonus; `trash_money`, fixed). Its gender is rolled once when the card is created (set_ability initial, the
  // run's seeded pseudorandom 'burmy_gender': Female or Male, kept on ability.extra and so through save / resume, which rebuild
  // the run from its recipe). After 4 rounds a Female becomes Wormadam wearing its cloak (locked: the type stays), a Male Mothim.
  // Monotype: Burmy's cloak type never counts (poke_mono_exempt, as Castform); Wormadam and Mothim are checked like any joker.
  burmy: {
    name: 'burmy', poke_sprite391: sprite('Gen04', 0, 0),
    config: { extra: { mult1: 5, chips1: 40, trash_money: 1, form: 'plant', gender: 'female', rounds: 4 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'chips', 'money', 'enhancements', 'full_deck', 'types', 'round_evo'], poke_after: 'roserade',
    poke_mono_exempt: true,
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, cloak = BURMY_CLOAKS[ex.form] ? ex.form : 'plant';
      return { vars: [r3(ex.mult1), r3(ex.chips1), ex.trash_money, BURMY_CLOAKS[cloak].name, gender_name(ex.gender), ex.rounds, ex.gender === 'male' ? 'Mothim' : 'Wormadam'] };
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.gender = pseudorandom(pseudoseed('burmy_gender')) < 0.5 ? 'female' : 'male';
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (round_end(context) && !context.blueprint) {
        const cloak = cloak_of_deck(G.playing_cards, BURMY_CLOAKS[ex.form] ? ex.form : 'plant');
        if (cloak !== ex.form) {
          set_cloak(card, cloak);
          card_eval_status_text(card, 'extra', null, null, null, { message: BURMY_CLOAKS[cloak].name + ' Cloak!', colour: BURMY_CLOAKS[cloak].colour });
        }
        return level_evo(self, card, context, ex.gender === 'male' ? 'j_poke_mothim' : 'j_poke_wormadam');
      }
      if (context.joker_main) {
        if (ex.form === 'plant') return { message: a_mult(r3(ex.mult1)), colour: 'MULT', mult_mod: ex.mult1 };
        if (ex.form === 'sandy') return { message: a_chips(r3(ex.chips1)), colour: 'CHIPS', chip_mod: ex.chips1 };
      }
      return undefined;
    },
    calc_dollar_bonus(self, card) {
      const ex = card.ability.extra;
      return ex.form === 'trash' ? ease_poke_dollars(card, 'burmy', ex.trash_money, true) : undefined;
    },
  },
  // Wormadam 413 (Stage 1, Safari $8), Cloaked: the cloak (and its type) Burmy wore when it evolved, for good. Plant: each scored
  // UNENHANCED card +3 Mult (`mult1`); Sandy: each scored Stone card X1.5 Mult (`Xmult_multi`, the per-card X); Trash: each Steel
  // card held in hand at end of round earns $1 (`steel_money`, fixed; Mime / a Red Seal repeat it, as a Gold card's).
  wormadam: {
    name: 'wormadam', poke_sprite391: sprite('Gen04', 6, 0),
    config: { extra: { mult1: 3, Xmult_multi: 1.5, steel_money: 1, form: 'plant' } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'money', 'enhancements', 'types'], poke_after: 'burmy',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, cloak = BURMY_CLOAKS[ex.form] ? ex.form : 'plant';
      if (cloak === 'sandy') info_queue.push(P_CENTERS.m_stone);
      if (cloak === 'trash') info_queue.push(P_CENTERS.m_steel);
      return { vars: [r3(ex.mult1), r3(ex.Xmult_multi), ex.steel_money], key: cloak === 'plant' ? undefined : 'j_poke_wormadam_' + cloak };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra, oc = context.other_card;
      if (context.individual && context.cardarea === G.play && !context.end_of_round && oc && !oc.debuff) {
        if (ex.form === 'plant' && oc.config.center.key === 'c_base') return { mult: ex.mult1, card };
        if (ex.form === 'sandy' && has_enhancement(oc, 'm_stone')) return { x_mult: ex.Xmult_multi, card };
      }
      if (ex.form === 'trash' && context.end_of_round && context.individual && context.cardarea === G.hand && oc && !oc.debuff && has_enhancement(oc, 'm_steel')) {
        G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + ex.steel_money;
        G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
        return { dollars: ease_poke_dollars(card, 'wormadam', ex.steel_money, true), card: oc };
      }
      return undefined;
    },
  },
  // Mothim 414 (Stage 1, Safari $8, Grass: its card's type), Free Flight: X(1 + 0.25 for each DIFFERENT enhancement in the full
  // deck), of MOTHIM_ENHANCEMENTS (the 8 vanilla ones + Seed + Flower: up to X3.5). `Xmult_mod` (+20% per Energy: 0.3 / 0.35 / 0.4).
  mothim: {
    name: 'mothim', poke_sprite391: sprite('Natdex', 16, 27),
    config: { extra: { Xmult_mod: 0.25 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'full_deck'], poke_after: 'wormadam',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const n = G.playing_cards ? distinct_enhancements(G.playing_cards) : 0;
      return { vars: [r3(card.ability.extra.Xmult_mod), n, r3(1 + card.ability.extra.Xmult_mod * n)] };
    },
    calculate(self, card, context) {
      if (context.joker_main) { const x = free_flight_x(card); if (x > 1) return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE F10: Combee -> Vespiquen (Grass, Gen 4)
  // The owner's design (2026-10-28): Honey Gather (honey_gather above) — at end of round the Jokers directly left and right gain a
  // FIXED +$1 / +$2 sell value (`honey`: no energy field; nothing on an empty side; a debuffed one gives nothing; Blueprint never feeds
  // it twice). Vespiquen's Attack Order: X(1 + 0.1 per $ of the two neighbours' current sell value, card.sell_cost), capped at X3
  // (`Xmult_cap`, fixed). Energy raises the per-$ `Xmult_mod` (+20% of base: 0.1 -> 0.12 / 0.14 / 0.16); Combee carries the same field
  // so it can take Energy, which evolution re-applies to Vespiquen's base (it adds nothing to Combee's own honey). Every Combee evolves
  // (the female-only lore rule is not used). Neither Nacho nor Pokermon+ has the line. Art: upstream 3.9.1's own (Natdex 18 / 20, 27:
  // the green Grass frame). After Mothim (414) in Pokédex order.
  // Combee 415: Common $5; Honey Gather +$1. Evolves after 5 rounds.
  combee: {
    name: 'combee', poke_sprite391: sprite('Natdex', 18, 27),
    config: { extra: { honey: 1, Xmult_mod: 0.1, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 4, blueprint_compat: false,
    attributes: ['sell_value', 'joker', 'economy', 'round_evo'], poke_after: 'mothim',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.honey, ex.rounds, r3(ex.Xmult_mod)] }; },
    calculate(self, card, context) { honey_gather(card, context); return level_evo(self, card, context, 'j_poke_vespiquen'); },
  },
  // Vespiquen 416: Safari $8; Honey Gather +$2; Attack Order X(1 + 0.1 per $ of the neighbours' sell value), max X3.
  vespiquen: {
    name: 'vespiquen', poke_sprite391: sprite('Natdex', 20, 27),
    config: { extra: { honey: 2, Xmult_mod: 0.1, Xmult_cap: 3 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 4, blueprint_compat: true,
    attributes: ['sell_value', 'joker', 'economy', 'xmult'], poke_after: 'combee',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [ex.honey, r3(ex.Xmult_mod), ex.Xmult_cap, hive_value(card), attack_order_x(card)] };
    },
    calculate(self, card, context) {
      honey_gather(card, context);
      if (context.joker_main) { const x = attack_order_x(card); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },

  // ---------------------------------------------------------------- Pachirisu 417 (Lightning, Gen 4)
  // The owner's design (2026-10-28). Rare $7, single-stage. Quick Spark: the first hand of each round (hands_played === 0) gives X2
  // Mult (`Xmult`); Nuzzle: plus X0.25 (`Xmult_mod`) for each OTHER Lightning Joker (spark_others above: is_type, so Tera stickers
  // count; debuffed ones don't). Cheek Pouch: at end of round earn $1 (`pouch`) for each Lightning Joker, itself included, through
  // calc_dollar_bonus (a row of the round's cash-out list, as Miltank). Energy: Xmult +20% (2 -> 2.4 / 2.8 / 3.2) and Xmult_mod +20%
  // (0.25 -> 0.3 / 0.35 / 0.4); the $ is fixed. Blueprint copies the first-hand X Mult (Blueprint is no Lightning joker, so it never
  // adds to the counts), never the Cheek Pouch (calc_dollar_bonus is not copied, as Golden Joker). Neither Nacho nor Pokermon+ has
  // it. Art: upstream 3.9.1's own cell (Natdex 22, 27: the Lightning frame). After Vespiquen (416) in Pokédex order.
  pachirisu: {
    name: 'pachirisu', poke_sprite391: sprite('Natdex', 22, 27),
    config: { extra: { Xmult: 2, Xmult_mod: 0.25, pouch: 1 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Lightning', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'economy', 'types', 'hands'], poke_after: 'vespiquen',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult), r3(ex.Xmult_mod), spark_x(card), spark_state(), ex.pouch, pouch_money(card)] };
    },
    calculate(self, card, context) {
      if (context.first_hand_drawn && !context.blueprint) juice_card_until(card, () => spark_on() && !G.RESET_JIGGLES, true);
      if (!context.joker_main || !spark_on()) return undefined;
      const x = spark_x(card);
      return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
    },
    calc_dollar_bonus(self, card) { return pouch_money(card); },
  },
  // ---------------------------------------------------------------- LINE: Glameow -> Purugly (Colorless, Gen 4)
  // The owner's design (2026-10-28): Fickle — a favourite suit, picked when first obtained and again each end of round (the run's
  // seeded RNG, Ancient Joker's pick: never the same suit twice running; fickle_pick above); scored cards of it give +5 Mult (Glameow)
  // / X1.25 Mult each (Purugly). Purugly's Thick Fat: -1 Joker slot while held (slot_cost_*). Glameow evolves after 5 rounds, but only
  // with a free Joker slot (glameow_evo: it waits, never pushing a joker out). Energy: Glameow's per-card `mult` (+40% of base: 5 -> 7 /
  // 9 / 11), Purugly's per-card `Xmult_multi` (+5%: X1.25 -> X1.3125 / X1.375 / X1.4375), re-applied on evolution; the slot cost is fixed
  // (`slot_cost`, no energy field). Neither Nacho nor Pokermon+ has the line. Art: upstream 3.9.1's own (Natdex 20 / 22, 28). After
  // Honchkrow (430) in Pokédex order.
  // Glameow 431: Common $5.
  glameow: {
    name: 'glameow', poke_sprite391: sprite('Natdex', 20, 28),
    config: { extra: { mult: 5, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Colorless', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'suit', 'round_evo'], poke_after: 'honchkrow',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), fav_vars(card), ex.rounds], colours: fav_colour(card) }; },
    add_to_deck(self, card) { if (!card.ability.fav_suit) fickle_pick(card); },
    calculate(self, card, context) {
      if (fav_scored(card, context)) return { mult: card.ability.extra.mult, card };
      fickle(card, context);
      return glameow_evo(self, card, context);
    },
  },
  // Purugly 432: Safari $8.
  purugly: {
    name: 'purugly', poke_sprite391: sprite('Natdex', 22, 28),
    config: { extra: { Xmult_multi: 1.25, slot_cost: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'suit', 'joker_slot'], poke_after: 'glameow',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_multi), ex.slot_cost, fav_vars(card)], colours: fav_colour(card) }; },
    add_to_deck(self, card, from_debuff) { if (!card.ability.fav_suit) fickle_pick(card); slot_cost_add(card, from_debuff); },
    remove_from_deck(self, card, from_debuff) { slot_cost_remove(card, from_debuff); },
    calculate(self, card, context) {
      if (fav_scored(card, context)) return { x_mult: card.ability.extra.Xmult_multi, card };
      fickle(card, context);
      return undefined;
    },
  },
  // ---------------------------------------------------------------- LINE: Stunky -> Skuntank (Dark, Gen 4)
  // The owner's design (2026-10-28): the Blind is poisoned (poison_gas above). Stunky's Poison Gas: after each hand you play, the Blind's
  // requirement drops by 4% of its starting requirement; Skuntank's Toxic: after the nth hand of the round, by n x 4% (4, 8, 12...: 40%
  // by the end of hand 4). Resets each Blind; all copies share one record and its cap (-75% of the start), never below 1 chip; copies
  // stack additively and Blueprint copies the drop (a copied ability, its own message). Never the hand that scored: it acts after the win
  // check, and not after the round's final hand. Reaching the lowered requirement wins the Blind right after that hand (no draw).
  // Energy: `poison_pct` +20% of base per Energy (energy.js: 4 -> 4.8 / 5.6 / 6.4%, Colorless half), re-applied on evolution; the
  // cap is fixed. Neither Nacho nor Pokermon+ has the line. Art: upstream 3.9.1's own (Natdex 26 / 28, 28). After Chingling (433).
  // Stunky 434: Common $5. Evolves after 5 rounds.
  stunky: {
    name: 'stunky', poke_sprite391: sprite('Natdex', 26, 28),
    config: { extra: { poison_pct: 4, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 4, blueprint_compat: true,
    attributes: ['blind', 'round_evo'], poke_after: 'chingling',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.poison_pct), POISON_CAP, poison_taken(), ex.rounds] }; },
    calculate(self, card, context) { return poison_gas(card, context, false) || level_evo(self, card, context, 'j_poke_skuntank'); },
  },
  // Skuntank 435: Safari $8.
  skuntank: {
    name: 'skuntank', poke_sprite391: sprite('Natdex', 28, 28),
    config: { extra: { poison_pct: 4 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 4, blueprint_compat: true,
    attributes: ['blind', 'scaling'], poke_after: 'stunky',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, next = ((G.GAME && G.GAME.facing_blind && G.GAME.current_round && G.GAME.current_round.hands_played) || 0) + 1;
      return { vars: [r3(ex.poison_pct), POISON_CAP, poison_taken(), poison_step(card, 2), poison_step(card, 3), poison_step(card, next)] };
    },
    calculate(self, card, context) { return poison_gas(card, context, true); },
  },
  // ---------------------------------------------------------------- LINE: Gible -> Gabite -> Garchomp (Dragon, Gen 4)
  // The owner's design (2026-10-28): bite -> hoard -> cash in (bite / treasure_nest / dragon_rush_x above). Gible's Bite banks +1 Mult per
  // scored card of every hand containing a Pair (bite_mult; Energy raises mult_mod, never the bank); Gabite keeps biting and its Treasure
  // Nest turns one scored card of a Full House Gold; Garchomp gives the bank and Dragon Rush, X(1 + 0.5 per Gold card held in hand).
  // Energy: mult_mod +20% (1 -> 1.2 / 1.4 / 1.6 a card), Garchomp's Xmult_mod +20% (0.5 -> 0.6 / 0.7 / 0.8 a Gold card); the conversion is
  // fixed; carried through evolution (re-applied to the new base). Blueprint copies the Mult / X, never the bank's growth or the Gold.
  // Neither Nacho nor Pokermon+ has the line. Art: upstream 3.9.1's own (Natdex 14 / 16 / 18, 29). After Spiritomb (442). No Mega here.
  // Gible 443: Uncommon $6. Evolves at +25 banked Mult (Dratini's scaling_evo).
  gible: {
    name: 'gible', poke_sprite391: sprite('Natdex', 14, 29),
    config: { evo_rqmt: 25, extra: { bite_mult: 0, mult_mod: 1 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Dragon', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'hand_type', 'scaling_evo'], poke_after: 'spiritomb',
    poke_custom_values_to_keep: ['bite_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.bite_mult), r3(ex.mult_mod), self.config.evo_rqmt] }; },
    calculate(self, card, context) {
      return bite(card, context) || scaling_evo(self, card, context, 'j_poke_gabite', card.ability.extra.bite_mult, self.config.evo_rqmt);
    },
  },
  // Gabite 444: Safari $8. Keeps biting (+1 a scored card); Treasure Nest. Evolves at end of round with 6 Gold cards in the full deck.
  gabite: {
    name: 'gabite', poke_sprite391: sprite('Natdex', 16, 29),
    config: { evo_rqmt: 6, extra: { bite_mult: 0, mult_mod: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dragon', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'hand_type', 'enhancements', 'modify_card', 'full_deck', 'scaling_evo'], poke_after: 'gible',
    poke_custom_values_to_keep: ['bite_mult'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_gold);
      const ex = card.ability.extra;
      return { vars: [r3(ex.bite_mult), r3(ex.mult_mod), self.config.evo_rqmt, gold_in_deck()] };
    },
    calculate(self, card, context) {
      return treasure_nest(card, context) || bite(card, context) || scaling_evo(self, card, context, 'j_poke_garchomp', gold_in_deck(), self.config.evo_rqmt);
    },
  },
  // Garchomp 445: Safari $10. The bank (it banks no more) and Dragon Rush.
  garchomp: {
    name: 'garchomp', poke_sprite391: sprite('Natdex', 18, 29),
    config: { extra: { bite_mult: 0, Xmult_mod: 0.5 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Dragon', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'enhancements'], poke_after: 'gabite',
    poke_custom_values_to_keep: ['bite_mult'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_gold);
      const ex = card.ability.extra;
      return { vars: [r3(ex.bite_mult), r3(ex.Xmult_mod), gold_held(), dragon_rush_x(card)] };
    },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const ex = card.ability.extra, x = dragon_rush_x(card), r = {};
      if (ex.bite_mult > 0) r.mult_mod = ex.bite_mult;
      if (x > 1) r.Xmult_mod = x;
      if (!Object.keys(r).length) return undefined;
      r.message = r.Xmult_mod ? a_xmult(x) : a_mult(r3(r.mult_mod));
      r.colour = r.Xmult_mod ? 'XMULT' : 'MULT';
      return r;
    },
  },
  // ---------------------------------------------------------------- the last Gen 4 regulars (contentRev 44): Hippopotas -> Hippowdon,
  // Skorupi -> Drapion, Carnivine, Finneon -> Lumineon. The owner's designs (2026-10-28). Neither Nacho nor Pokermon+ has any of them.
  // Art: upstream 3.9.1's own cells (Natdex {26,29} / {28,29}, {0,30} / {2,30}, {8,30}, {10,30} / {12,30}); nothing to deploy. After
  // Lucario's Mega (448), before Mantyke (458); Croagunk / Toxicroak (453 / 454) are Pokermon+'s.
  // Hippopotas 449: Common $5, Earth. Sand Stream: scored Stone cards give +30 extra Chips (`chips` +30%: 39 / 48 / 57). 5 rounds.
  hippopotas: {
    name: 'hippopotas', poke_sprite391: sprite('Natdex', 26, 29),
    config: { extra: { chips: 30, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Earth', gen: 4, blueprint_compat: true,
    attributes: ['chips', 'enhancements', 'round_evo'], poke_after: 'mega_lucario',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) { return sand_stream(card, context) || level_evo(self, card, context, 'j_poke_hippowdon'); },
  },
  // Hippowdon 450: Safari $8. +60 extra Chips per scored Stone card (78 / 96 / 114 energized); on each round's first deal, 1 random
  // unenhanced card held in hand becomes a Stone card (fixed: Energy never raises the conversion).
  hippowdon: {
    name: 'hippowdon', poke_sprite391: sprite('Natdex', 28, 29),
    config: { extra: { chips: 60 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 4, blueprint_compat: true,
    attributes: ['chips', 'enhancements', 'modify_card'], poke_after: 'hippopotas',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); return { vars: [r3(card.ability.extra.chips)] }; },
    calculate(self, card, context) { sand_stone(card, context); return sand_stream(card, context); },
  },
  // Skorupi 451: Common $5, Dark. Sniper: each scored card, 1 in 5 to crit for X1.25 (`Xmult_multi` +5%: X1.3125 / 1.375 / 1.4375; the odds
  // are num / dem, never energized). 5 rounds.
  skorupi: {
    name: 'skorupi', poke_sprite391: sprite('Natdex', 0, 30),
    config: { extra: { num: 1, dem: 5, Xmult_multi: 1.25, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'chance', 'round_evo'], poke_after: 'hippowdon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [...sniper_vars(card, 'skorupi'), card.ability.extra.rounds] }; },
    calculate(self, card, context) { return sniper(card, context, 'skorupi') || level_evo(self, card, context, 'j_poke_drapion'); },
  },
  // Drapion 452: Safari $8. 1 in 3 to crit for X1.5 (X1.575 / 1.65 / 1.725); Lucky cards always crit (no roll: Absol can't stop them).
  drapion: {
    name: 'drapion', poke_sprite391: sprite('Natdex', 2, 30),
    config: { extra: { num: 1, dem: 3, Xmult_multi: 1.5, always_crit: true } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'chance', 'enhancements'], poke_after: 'skorupi',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); return { vars: sniper_vars(card, 'drapion') }; },
    calculate(self, card, context) { return sniper(card, context, 'drapion'); },
  },
  // Carnivine 455: Rare $7, Grass, single-stage. Flytrap: the first card you discard each round is devoured (destroyed: the engine's
  // discard-destroy, so "card destroyed" payoffs fire) and banks +4 Mult for good (`mult_mod` +20%: 4.8 / 5.6 / 6.4 a devour; the bank
  // `devour_mult` is never retroactive). It gives the bank every hand (Blueprint copies the Mult, never the devour).
  carnivine: {
    name: 'carnivine', poke_sprite391: sprite('Natdex', 8, 30),
    config: { extra: { devour_mult: 0, mult_mod: 4 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Grass', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'discard', 'destroy_card'], poke_after: 'drapion',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.devour_mult), r3(ex.mult_mod), flytrap_state(card)] }; },
    calculate(self, card, context) {
      const r = flytrap(card, context);
      if (r) return r;
      const m = card.ability.extra.devour_mult;
      if (context.joker_main && m > 0) return { message: a_mult(r3(m)), colour: 'MULT', mult_mod: m };
      return undefined;
    },
  },
  // Finneon 456: Common $5, Water. +40 Chips on NIGHT hands (the 2nd and 4th of each round: Lunatone / Solrock's cycle; `chips` +30%:
  // 52 / 64 / 76). 5 rounds.
  finneon: {
    name: 'finneon', poke_sprite391: sprite('Natdex', 10, 30),
    config: { extra: { chips: 40, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 4, blueprint_compat: true,
    attributes: ['chips', 'hands', 'round_evo'], poke_after: 'carnivine',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), next_is_day() ? 'Day' : 'Night', ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && !is_day()) return { message: a_chips(r3(card.ability.extra.chips)), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      return level_evo(self, card, context, 'j_poke_lumineon');
    },
  },
  // Lumineon 457: Safari $8. On night hands each scored card gives +15 Chips (19.5 / 24 / 28.5); with Lunatone (owned, undebuffed) on
  // day hands too.
  lumineon: {
    name: 'lumineon', poke_sprite391: sprite('Natdex', 12, 30),
    config: { extra: { chips: 15 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 4, blueprint_compat: true,
    attributes: ['chips', 'hands'], poke_after: 'finneon',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [r3(card.ability.extra.chips), next_is_day() ? 'Day' : 'Night', cosmic(card, 'j_poke_lunatone') ? 'active' : 'needs Lunatone'] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && luminous(card)) return { chips: card.ability.extra.chips, card };
      return undefined;
    },
  },
  // ---------------------------------------------------------------- The Lake trio: Uxie 480 / Mesprit 481 / Azelf 482 (Psychic, Gen 4)
  // The owner's design (2026-10-28). Legendary $20 each (The Soul / the Legendary pool). Types from the card art: all three Psychic.
  // Uxie, Knowledge: +2 Foresight (the Shinx line's scry); each Foreseen card gives X1.3 Mult (the Foreseen cards are scored like held
  // cards, context.individual with cardarea G.scry_view, as Hoothoot's; a debuffed one gives nothing). Mesprit, Emotion: X1.5 Mult, or
  // X2.5 on a hand whose poker hand hasn't been played yet this round (first_this_round). Azelf, Willpower: X2.5 Mult on the final hand
  // of each round (final_hand, Drifloon's check). Lake Guardians: each one's X values get +X0.25 for each OTHER Psychic Joker held,
  // undebuffed, at most 2 (lake_others; contentRev 59, the owner's solo rule: it counted the other guardian species before) — with two:
  // Uxie X1.8 per Foreseen card, Mesprit X2 / X3, Azelf X3.
  // Energy: Uxie's per-card `Xmult_multi` +5% (1.3 -> 1.365 / 1.43 / 1.495), Mesprit's `Xmult` / `Xmult2` +20% (1.5 -> 1.8 / 2.1 / 2.4,
  // 2.5 -> 3 / 3.5 / 4), Azelf's `Xmult` +20% (2.5 -> 3 / 3.5 / 4); the +0.25 per guardian (`lake_mod`) and the Foresight are fixed.
  // Neither Nacho nor Pokermon+ has them. Art: upstream 3.9.1's own cells with their floating souls (Natdex {28,31}, {0,32}, {2,32}).
  uxie: {
    name: 'uxie', poke_sprite391: sprite('Natdex', 28, 31, [29, 31]),
    config: { extra: { scry: 2, Xmult_multi: 1.3, lake_mod: 0.25 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 4, blueprint_compat: true,
    attributes: ['foresight', 'xmult'], poke_after: 'rotomm',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); scry_tip(info_queue);
      const ex = card.ability.extra;
      return { vars: [ex.scry, r3(ex.Xmult_multi), r3(ex.lake_mod), lake_others(card), lake_x(card, 'Xmult_multi')] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.scry_view && !context.end_of_round && !context.other_card.debuff) {
        return { x_mult: lake_x(card, 'Xmult_multi'), card };
      }
      return undefined;
    },
    ...scry,
  },
  mesprit: {
    name: 'mesprit', poke_sprite391: sprite('Natdex', 0, 32, [1, 32]),
    config: { extra: { Xmult: 1.5, Xmult2: 2.5, lake_mod: 0.25 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'hand_type'], poke_after: 'uxie',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult), r3(ex.Xmult2), r3(ex.lake_mod), lake_others(card), lake_x(card, 'Xmult'), lake_x(card, 'Xmult2')] };
    },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const x = lake_x(card, first_this_round(context) ? 'Xmult2' : 'Xmult');
      return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
    },
  },
  azelf: {
    name: 'azelf', poke_sprite391: sprite('Natdex', 2, 32, [3, 32]),
    config: { extra: { Xmult: 2.5, lake_mod: 0.25 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 4, blueprint_compat: true,
    attributes: ['xmult'], poke_after: 'mesprit',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult), r3(ex.lake_mod), lake_others(card), lake_x(card, 'Xmult')] };
    },
    calculate(self, card, context) {
      if (!context.joker_main || !final_hand()) return undefined;
      const x = lake_x(card, 'Xmult');
      return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
    },
  },

  // ---------------------------------------------------------------- The creation trio: Dialga 483 / Palkia 484 / Giratina 487 (Gen 4)
  // The owner's design (2026-10-28). Legendary $20 each (The Soul / the Legendary pool). Types from the card art: Dialga Metal, Palkia
  // Water, Giratina Psychic (both its Altered and its Origin card show the Psychic icon). Neither Nacho nor Pokermon+ has them. Art:
  // upstream 3.9.1's own cells with their floating souls (Gen 4 sheet: Dialga {10,2}, Palkia {4,3}, Giratina {8,3}; the Origin Forme
  // {10,3} / soul {11,3}, drawn by ui.js ownFace from the view's live form, as Cherrim's Sunshine). After Rotom's forms (479) in Pokédex
  // order (Pokermon has no joker for 480-491 but Shaymin 492).
  // Dialga 483, Roar of Time: the FIRST hand of each round is scored twice — every scored card retriggers once (a repetition for each
  // card of G.play while hands_played === 0, Whiscash's Earthquake without its gate), so the cards' chips, mult, enhancements, seals
  // and every per-card joker effect happen twice while the jokers' own hand effects (joker_main, after) run once, as for one hand.
  // Fixed (no number): Energy-inert by design (poke_no_energy_field). Blueprint copies it like Whiscash / Remoraid (a second retrigger).
  dialga: {
    name: 'dialga', poke_sprite391: sprite('Gen04', 10, 2, [11, 2]),
    config: { extra: { retriggers: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Metal', gen: 4, blueprint_compat: true,
    attributes: ['retrigger', 'hands'], poke_after: 'azelf',
    poke_no_energy_field: true,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [spark_state()] }; },
    calculate(self, card, context) {
      if (context.first_hand_drawn && !context.blueprint) juice_card_until(card, () => roar_on() && !G.RESET_JIGGLES, true);
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && roar_on()) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return undefined;
    },
  },
  // Palkia 484, Spacial Rend: +1 Joker slot and +1 hand size while held (spacial_rend above: reverted when sold, destroyed or debuffed;
  // never pushing a Joker out). Fixed: Energy-inert by design (poke_no_energy_field). Nothing to copy (blueprint_compat false).
  palkia: {
    name: 'palkia', poke_sprite391: sprite('Gen04', 4, 3, [5, 3]),
    config: { extra: { slots: 1, h_size: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 4, blueprint_compat: false,
    attributes: ['joker_slot', 'hand_size'], poke_after: 'dialga',
    poke_no_energy_field: true,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.slots, ex.h_size] }; },
    ...spacial_rend,
  },
  // Regigigas 486, Slow Start (Colorless): asleep (it gives nothing) until it wakes, then X4 Mult for the rest of the run. contentRev 59
  // (the owner's solo rule; the Regis cut the wait before): it wakes at the end of the round that makes `giga_rounds` (rounds held: the
  // main end_of_round pass; not Blueprint; a debuffed Regigigas isn't calculated, so it waits) reach giga_wait: 5, 1 round sooner for every
  // 5 Stone, Glass or Steel cards in the full deck, at least 1 (read live). Creator: while awake, when a Blind is selected, 1 random card
  // in the deck (unenhanced first) becomes Stone, Glass or Steel (giga_create, seeded). Energy: `Xmult` +20% of base (X4 -> X4.8 / X5.6 /
  // X6.4); the wait is fixed (`slow_start`, no energy field). Blueprint copies the X (and Creator) only when awake.
  // After Palkia (Pokermon has no Heatran 485).
  regigigas: {
    name: 'regigigas', poke_sprite391: sprite('Natdex', 10, 32, [11, 32]),
    config: { extra: { Xmult: 4, slow_start: 5, giga_rounds: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Colorless', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'full_deck', 'modify_card'], poke_after: 'palkia',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push(P_CENTERS.m_stone); info_queue.push(P_CENTERS.m_glass); info_queue.push(P_CENTERS.m_steel);
      const ex = card.ability.extra, wait = giga_wait(), left = Math.max(0, wait - (ex.giga_rounds || 0));
      return { vars: [r3(ex.Xmult), giga_deck(), wait, giga_awake(card) ? 'Awake!' : left > 0 ? 'Asleep: ' + left + ' left' : 'Asleep: wakes at end of round'] };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      giga_create(card, context);
      if (round_end(context) && !context.blueprint) ex.giga_rounds = (ex.giga_rounds || 0) + 1;
      if (round_end(context) && !context.blueprint && !giga_awake(card)) {
        if (solo59()) ex.slow_start = ex.giga_rounds >= giga_wait() ? 0 : giga_wait() - ex.giga_rounds;
        else ex.slow_start = Math.max(0, ex.slow_start - giga_drop(ex.slow_start, regis_distinct()));
        card_eval_status_text(card, 'extra', null, null, null, giga_awake(card) ? { message: 'Awake!', colour: 'XMULT' } : { message: 'Slow Start: ' + ex.slow_start, colour: 'FILTER' });
        return undefined;
      }
      if (context.joker_main && giga_awake(card)) return { message: a_xmult(r3(ex.Xmult)), colour: 'XMULT', Xmult_mod: ex.Xmult };
      return undefined;
    },
  },
  // Giratina 487, Shadow Force (Psychic): permanently gains X0.25 Mult for each playing card destroyed, by any cause (the
  // remove_playing_cards context every destroying path sends: Glass shattering, Hanged Man, Gulpin's swallow, a discard eaten...),
  // banked in `shadow_Xmult` (no energy field; never retroactive). Origin Forme (contentRev 59, the owner's solo rule; it needed a
  // Dialga or Palkia before): for good once 10 playing cards have been destroyed while it is held (`destroyed`, on the card; the 10th
  // still gains Altered), its gain is doubled (X0.5) and it shows the Origin card (poke_view_form). Energy: the gain `Xmult_mod` +20% (0.25 -> 0.3 / 0.35 /
  // 0.4; Origin 0.6 / 0.7 / 0.8). Blueprint copies the X, never the growth. After Regigigas.
  giratina: {
    name: 'giratina', poke_sprite391: sprite('Gen04', 8, 3, [9, 3]),
    config: { extra: { shadow_Xmult: 1, Xmult_mod: 0.25, destroyed: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'destroy_card'], poke_after: 'regigigas',
    /** The view's form (systems/anim.js view_card): from the card's own count (before r59: live from a Dialga / Palkia). */
    poke_view_form(self, card) { return origin_forme(card) ? 'origin' : 'altered'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.shadow_Xmult), r3(ex.Xmult_mod), r3(2 * ex.Xmult_mod), origin_forme(card) ? 'Origin Forme' : 'Destroyed: ' + Math.min(ORIGIN_AT, ex.destroyed || 0) + '/' + ORIGIN_AT] };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.remove_playing_cards && !context.blueprint && (context.removed || []).length) {
        if (solo59()) shadow_force(card, context.removed.length);
        else { ex.shadow_Xmult = r3(ex.shadow_Xmult + shadow_gain(card) * context.removed.length); ex.destroyed = (ex.destroyed || 0) + context.removed.length; }
        card_eval_status_text(card, 'extra', null, null, null, { message: a_xmult(ex.shadow_Xmult), colour: 'XMULT' });
        return undefined;
      }
      if (context.joker_main && ex.shadow_Xmult > 1) return { message: a_xmult(r3(ex.shadow_Xmult)), colour: 'XMULT', Xmult_mod: ex.shadow_Xmult };
      return undefined;
    },
  },
  // Arceus 493, Multitype (Colorless): counts as EVERY Pokermon type for type checks and synergies (center.poke_multitype: systems/
  // types.js is_type / find_pokemon_type, energy.js energy_matches): Barboach's Water / Earth Jokers (once), Starly's Colorless flock,
  // Pachirisu's Lightning Jokers, Corsola / Pelipper's find_pokemon_type, and every type's Energy matches it at full strength. Its own
  // ptype stays Colorless (get_type, badge, Kecleon); a Tera sticker gives it that one type instead, as on any joker. Its type never
  // breaks Monotype (poke_mono_exempt, Castform's exemption: it would match any lock). Judgment: X(1 + 0.25 per different type among
  // your Jokers), itself counting as one type (multitype_count: at most 12, X4). Energy: `Xmult_mod` +20% (0.25 -> 0.3 / 0.35 / 0.4).
  // After Shaymin Sky (492).
  arceus: {
    name: 'arceus', poke_sprite391: sprite('Gen04', 4, 4, [5, 4]),
    config: { extra: { Xmult_mod: 0.25 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Colorless', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'types'], poke_after: 'shaymin_sky',
    poke_multitype: true, poke_mono_exempt: true,
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [r3(card.ability.extra.Xmult_mod), multitype_count(card), multitype_x(card)] };
    },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const x = multitype_x(card);
      return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
    },
  },

  // ---------------------------------------------------------------- Cresselia 488 (Psychic, Gen 4)
  // The owner's design (2026-10-28). Legendary $20. Lunar Blessing: while you have it (undebuffed), your playing cards can't be debuffed —
  // by a Boss Blind (The Goad / Head / Club / Window / Plant / Pillar / Verdant Leaf...) or anything else (a mod's debuff_card, an
  // SMODS.debuff_card source): systems/rules.js set_debuff answers 'prevent_debuff', which Card:set_debuff lets win outright, Urshifu's
  // Unseen Fist rule. Gaining / losing it re-runs the debuff pass at once (lunar_refresh). Jokers can still be debuffed (Crimson Heart),
  // Cresselia included. And X1.5 Mult (`Xmult`, Energy +20%: 1.8 / 2.1 / 2.4); the blessing is fixed.
  // Pokermon+'s Darkrai: no rule between them. Darkrai never debuffs playing cards (it brings a Nightmare and lends held Energy), so the
  // blessing has nothing to block; Darkrai's held-Energy energizing reaches Cresselia like any Psychic joker (a held Psychic Energy
  // raises its X1.5), and it can't raise the blessing. Neither Nacho nor Pokermon+ has Cresselia. Art: upstream 3.9.1 (Natdex {14,32}).
  cresselia: {
    name: 'cresselia', poke_sprite391: sprite('Natdex', 14, 32, [15, 32]),
    config: { extra: { Xmult: 1.5 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'debuff'], poke_after: 'giratina',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult)] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
    add_to_deck() { lunar_refresh(); },
    remove_from_deck() { lunar_refresh(); },
  },

  // ---------------------------------------------------------------- Phione 489 / Manaphy 490 (Water, Gen 4)
  // The owner's design (2026-10-28). Legendary $20 each. Phione: each Water Joker (itself included) gives +6 Mult (`mult`, Energy +40%:
  // 8.4 / 10.8 / 13.2). Manaphy, Sea Guardian: each Water Joker (itself included) gives X1.2 Mult (`Xmult_multi`, the per-joker X as
  // Blaziken's, Energy +5%: 1.26 / 1.32 / 1.38); Egg: at the end of each shop, with a free Joker slot, a 1 in 4 chance (seeded) to create
  // a Phione (manaphy_egg). Both use the other_joker context (Baseball Card's: each Water Joker shows its own bonus): is_type, so a Tera
  // sticker counts (and a Water joker with another Tera doesn't); a debuffed joker gives nothing. Not families: Phione never evolves.
  // Neither Nacho nor Pokermon+ has them. Art: upstream 3.9.1's own cells with their floating souls (Natdex {16,32} / {18,32}).
  phione: {
    name: 'phione', poke_sprite391: sprite('Natdex', 16, 32, [17, 32]),
    config: { extra: { mult: 6 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'types', 'joker'], poke_after: 'cresselia',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const n = sea_count(card); return { vars: [r3(card.ability.extra.mult), n, r3(card.ability.extra.mult * n)] }; },
    calculate(self, card, context) {
      if (context.other_joker && sea_joker(context.other_joker)) {
        const m = r3(card.ability.extra.mult);
        G.E_MANAGER.add_event(() => { context.other_joker.juice_up(0.5, 0.5); });
        return { message: a_mult(m), colour: 'MULT', mult_mod: m };
      }
      return undefined;
    },
  },
  manaphy: {
    name: 'manaphy', poke_sprite391: sprite('Natdex', 18, 32, [19, 32]),
    config: { extra: { Xmult_multi: 1.2, num: 1, dem: 4 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'types', 'joker', 'chance', 'generation'], poke_after: 'phione',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, [num, dem] = get_probability_vars(card, ex.num, ex.dem, 'manaphy_egg'), n = sea_count(card);
      return { vars: [r3(ex.Xmult_multi), num, dem, n, r3(Math.pow(ex.Xmult_multi, n))] };
    },
    calculate(self, card, context) {
      manaphy_egg(card, context);
      if (context.other_joker && sea_joker(context.other_joker)) {
        const x = r3(card.ability.extra.Xmult_multi);
        G.E_MANAGER.add_event(() => { context.other_joker.juice_up(0.5, 0.5); });
        return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
      }
      return undefined;
    },
  },

  // ---------------------------------------------------------------- Gen 5, batch 4: the Gen 5 Legendaries, 638-649 (contentRev 55)
  // The owner's design ("Build as pitched", 2026-10-29). Legendary $20 each (The Soul / the Legendary pool). Types from the card art
  // (pokermon_art_type.mjs; every form cell checked): Cobalion Metal, Terrakion Earth, Virizion Grass, Tornadus Colorless, Thundurus
  // Lightning, Reshiram Fire, Zekrom Lightning, Landorus Earth, Kyurem Water, Keldeo Fighting, Meloetta Psychic (its Pirouette cell
  // Fighting), Genesect Grass; the Therian, Black / White and Resolute cells show their base type. Neither Nacho nor Pokermon+ has
  // any. Art: upstream 3.9.1's own cells with their floating souls (Cobalion / Terrakion / Virizion Natdex {14..18,42}, the rest the
  // Gen 5 sheet), the forms drawn live by ui.js ownFace (systems/anim.js GEN5_LEGEND_FORMS) from each center's poke_view_form.
  // After Hydreigon (635) in Pokédex order (Pokermon has no Larvesta / Volcarona).
  //
  // The Swords of Justice, Cobalion 638 / Terrakion 639 / Virizion 640 (and Keldeo 647): each scored card of the sword's suit (Spades /
  // Diamonds / Clubs / Hearts; is_suit, so Wild cards count) gives X1.25 Mult (`Xmult_multi`, Energy +5%: 1.3125 / 1.375 / 1.4375).
  // Swords of Justice (contentRev 59, the owner's solo rule; it was +X0.1 per other sword): while its suit is the most common suit in
  // your full deck (suit_leads: contentRev 60, STRICTLY the most common, a tie doesn't count (r59 runs re-play with ties counting); Wild
  // cards count for every suit, Stone for none), X1.5 instead (Xmult_multi x 1.2: 1.575 / 1.65 / 1.725). Blueprint copies it.
  // (`sword_mod` stays for runs recorded before r59.)
  cobalion: {
    name: 'cobalion', poke_sprite391: sprite('Natdex', 14, 42, [15, 42]),
    config: { extra: { Xmult_multi: 1.25, sword_mod: 0.1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Metal', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'suit', 'spades'], poke_after: 'hydreigon',
    loc_vars(self, info_queue, card) { return sword_vars(self, info_queue, card); },
    calculate(self, card, context) { return sacred_sword(card, context); },
  },
  terrakion: {
    name: 'terrakion', poke_sprite391: sprite('Natdex', 16, 42, [17, 42]),
    config: { extra: { Xmult_multi: 1.25, sword_mod: 0.1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Earth', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'suit', 'diamonds'], poke_after: 'cobalion',
    loc_vars(self, info_queue, card) { return sword_vars(self, info_queue, card); },
    calculate(self, card, context) { return sacred_sword(card, context); },
  },
  virizion: {
    name: 'virizion', poke_sprite391: sprite('Natdex', 18, 42, [19, 42]),
    config: { extra: { Xmult_multi: 1.25, sword_mod: 0.1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'suit', 'clubs'], poke_after: 'terrakion',
    loc_vars(self, info_queue, card) { return sword_vars(self, info_queue, card); },
    calculate(self, card, context) { return sacred_sword(card, context); },
  },
  // The Forces of Nature, Tornadus 641 / Thundurus 642 / Landorus 645. Formes (therian; contentRev 59, the owner's solo rule; a partner
  // set it before): each one's Therian Forme comes for good after it has been held for 4 rounds (a Reveal Glass), the art with it. The forme only
  // changes the effect (the type stays). Tornadus (Colorless): +1 hand each round (the Squirtle line's pair, fixed); Therian, also +3
  // Mult per hand left when it scores (`mult`, Energy +40%: 4.2 / 5.4 / 6.6). Thundurus (Lightning): each scored card 1 in 4 to earn
  // $1; Therian 1 in 2 (`dem2`), and a card that pays also gives X1.1 (`Xmult_multi` +5%: 1.155 / 1.21 / 1.265); the odds and the $1
  // (`storm_money`) are fixed. Landorus (Earth): each Stone card held in hand +40 Chips (`chips` +30%: 52 / 64 / 76); Therian, each
  // scored Stone card X1.5 instead (`Xmult_multi` +5%: 1.575 / 1.65 / 1.725).
  tornadus: {
    name: 'tornadus', poke_sprite391: sprite('Gen05', 6, 3, [7, 3]),
    config: { extra: { hands: 1, mult: 3, therian_rounds: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Colorless', gen: 5, blueprint_compat: true,
    attributes: ['hands', 'mult'], poke_after: 'virizion',
    poke_view_form(self, card) { return therian(card) ? 'therian' : 'incarnate'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [ex.hands, r3(ex.mult), therian(card) ? 'Therian Forme: +' + r3(tornadus_mult(card)) + ' Mult' : forme_state(card)] };
    },
    calculate(self, card, context) {
      if (therian_tick(card, context)) return undefined;
      if (context.joker_main && therian(card)) { const m = tornadus_mult(card); if (m > 0) return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return undefined;
    },
    ...hands,
  },
  thundurus: {
    name: 'thundurus', poke_sprite391: sprite('Gen05', 10, 3, [11, 3]),
    config: { extra: { num: 1, dem: 4, dem2: 2, storm_money: 1, Xmult_multi: 1.1, therian_rounds: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Lightning', gen: 5, blueprint_compat: true,
    attributes: ['money', 'chance', 'xmult'], poke_after: 'tornadus',
    poke_view_form(self, card) { return therian(card) ? 'therian' : 'incarnate'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      const [n1, d1] = get_probability_vars(card, ex.num, ex.dem, 'thundurus'), [n2, d2] = get_probability_vars(card, ex.num, ex.dem2, 'thundurus');
      return { vars: [n1, d1, ex.storm_money, n2, d2, r3(ex.Xmult_multi), forme_state(card)] };
    },
    calculate(self, card, context) { return wild_charge(card, context); },
  },
  // The Tao trio, Reshiram 643 (Fire) / Zekrom 644 (Lightning) / Kyurem 646 (Water). Turboblaze / Teravolt: each Fire / Lightning Joker,
  // itself included, gives X1.25 Mult (the other_joker pass, Manaphy's shape: is_type, so Arceus and a Tera count; a debuffed joker
  // doesn't; `Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375). Fusion Flare / Fusion Bolt (contentRev 59, the owner's solo rule; it was Truth
  // vs Ideals, +0.25 each with both held): each Fire / Lightning Energy card used (on any joker) permanently adds +X0.05 to its per-joker
  // X (`fusion_x`, a bank in no energy field; `fusion_mod` fixed). Blueprint copies the X (a second X per joker, as Baseball Card),
  // never the bank. (`tao_mod` stays for runs recorded before r59.)
  reshiram: {
    name: 'reshiram', poke_sprite391: sprite('Gen05', 2, 4, [3, 4]),
    config: { extra: { Xmult_multi: 1.25, tao_mod: 0.25, fusion_x: 0, fusion_mod: 0.05 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fire', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'types', 'joker', 'energy', 'scaling'], poke_after: 'thundurus',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(tao_x(card)), typed_count(card, 'Fire'), r3(ex.fusion_mod), r3(ex.fusion_x || 0)] };
    },
    calculate(self, card, context) { return tao_boost(card, context); },
  },
  zekrom: {
    name: 'zekrom', poke_sprite391: sprite('Gen05', 6, 4, [7, 4]),
    config: { extra: { Xmult_multi: 1.25, tao_mod: 0.25, fusion_x: 0, fusion_mod: 0.05 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Lightning', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'types', 'joker', 'energy', 'scaling'], poke_after: 'reshiram',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(tao_x(card)), typed_count(card, 'Lightning'), r3(ex.fusion_mod), r3(ex.fusion_x || 0)] };
    },
    calculate(self, card, context) { return tao_boost(card, context); },
  },
  landorus: {
    name: 'landorus', poke_sprite391: sprite('Gen05', 10, 4, [11, 4]),
    config: { extra: { chips: 40, Xmult_multi: 1.5, therian_rounds: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Earth', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'enhancements'], poke_after: 'zekrom',
    poke_view_form(self, card) { return therian(card) ? 'therian' : 'incarnate'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone);
      const ex = card.ability.extra;
      return { vars: [r3(ex.chips), r3(ex.Xmult_multi), forme_state(card)] };
    },
    calculate(self, card, context) { return sand_force(card, context); },
  },
  // Kyurem 646 (Water): X1.5 Mult (`Xmult` +20%: 1.8 / 2.1 / 2.4). contentRev 59 (the owner's solo rule; it borrowed a held Reshiram's /
  // Zekrom's X before): White Kyurem while you have more Fire Jokers than Lightning Jokers, Black Kyurem while more Lightning than Fire
  // (itself left out; kyurem_form: a tie keeps its form, plain Kyurem until one side first leads), the art with it; then each Joker of
  // that type gives X1.25 Mult (`Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375). Blueprint copies the X and the per-type X.
  kyurem: {
    name: 'kyurem', poke_sprite391: sprite('Gen05', 2, 5, [3, 5]),
    config: { extra: { Xmult: 1.5, Xmult_multi: 1.25 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'types', 'joker'], poke_after: 'landorus',
    poke_view_form(self, card) { return kyurem_form(card); },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, f = kyurem_form(card), fire = kyurem_count(card, 'Fire'), bolt = kyurem_count(card, 'Lightning');
      const state = (f === 'white' ? 'White Kyurem' : f === 'black' ? 'Black Kyurem' : 'Kyurem') + ': ' + fire + ' Fire, ' + bolt + ' Lightning';
      return { vars: [r3(ex.Xmult), r3(ex.Xmult_multi), state] };
    },
    calculate(self, card, context) {
      if (!context.blueprint && solo59()) card.ability.extra.kyurem_form = kyurem_form(card);
      if (context.joker_main) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return kyurem_borrow(card, context);
    },
  },
  // Keldeo 647 (Fighting), the fourth sword: each scored Heart X1.25 (`Xmult_multi` +5%), X1.5 while Hearts lead the full deck (Swords of
  // Justice). Resolute Form (contentRev 59, the owner's solo rule; it needed the other three swords before): for good once 25 Hearts have
  // scored while it is held (`hearts`, on the card; retriggers count, the 25th still pays Ordinary), its Resolute card shows and its
  // per-Heart X is X2 (`Xmult_multi2` +5%: 2.1 / 2.2 / 2.3) instead of either.
  keldeo: {
    name: 'keldeo', poke_sprite391: sprite('Gen05', 0, 6, [1, 6]),
    config: { extra: { Xmult_multi: 1.25, Xmult_multi2: 2, sword_mod: 0.1, hearts: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fighting', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'suit', 'hearts'], poke_after: 'kyurem',
    poke_view_form(self, card) { return keldeo_resolute(card) ? 'resolute' : 'ordinary'; },
    loc_vars(self, info_queue, card) {
      const v = sword_vars(self, info_queue, card).vars, ex = card.ability.extra;
      return { vars: [...v, r3(ex.Xmult_multi2), keldeo_resolute(card) ? 'Resolute Form' : 'Hearts: ' + Math.min(RESOLUTE_AT, ex.hearts || 0) + '/' + RESOLUTE_AT] };
    },
    calculate(self, card, context) { return sacred_sword(card, context); },
  },
  // Meloetta 648, Relic Song: switches forme after EVERY hand played (relic_song: the `after` pass, a debuffed hand too; not Blueprint);
  // every round starts in Aria (it resets each round, never carries over). Aria (Psychic): X2 Mult (`Xmult` +20%: 2.4 / 2.8 / 3.2).
  // Pirouette (Fighting): the first scored card (by position, Cinccino's) retriggers 3 times (fixed). Its type follows the forme
  // (ability.extra.ptype, Castform's way; a Tera sticker still owns it), so the forme's Energy matches; its type never breaks Monotype
  // (poke_mono_exempt). Art: the Pirouette cell, live. Save / resume replay the hands, so the forme comes back exactly.
  meloetta: {
    name: 'meloetta', poke_sprite391: sprite('Gen05', 4, 6, [5, 6]),
    config: { extra: { Xmult: 2, retriggers: 3, form: 'aria' } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'retrigger', 'types'], poke_after: 'keldeo',
    poke_mono_exempt: true,
    poke_view_form(self, card) { return meloetta_form(card); },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult), ex.retriggers, MELOETTA_FORMES[meloetta_form(card)].name] };
    },
    calculate(self, card, context) {
      relic_song(card, context);
      const ex = card.ability.extra, f = meloetta_form(card);
      if (f === 'aria' && context.joker_main) return { message: a_xmult(r3(ex.Xmult)), colour: 'XMULT', Xmult_mod: ex.Xmult };
      if (f === 'pirouette' && context.repetition && context.cardarea === G.play && context.scoring_hand && context.scoring_hand[0] === context.other_card) {
        return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
      }
      return undefined;
    },
  },
  // Genesect 649 (Grass), Techno Blast: X(1.5 + 0.5 per Water, Lightning or Fire Joker you have) Mult (techno_count: one is_type test per
  // joker, so Arceus or a two-type joker counts once; undebuffed; Ice already maps to Water). `Xmult` and `Xmult_mod` +20% (1.8 / 2.1 /
  // 2.4 and 0.6 / 0.7 / 0.8).
  genesect: {
    name: 'genesect', poke_sprite391: sprite('Gen05', 8, 6, [9, 6]),
    config: { extra: { Xmult: 1.5, Xmult_mod: 0.5 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'types'], poke_after: 'meloetta',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult_mod), techno_count(card), r3(techno_x(card))] }; },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const x = techno_x(card);
      return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
    },
  },

  // ---------------------------------------------------------------- The Gen 5 starters (contentRev 50): Snivy 495 -> Servine 496 -> Serperior 497
  // (Grass), Tepig 498 -> Pignite 499 -> Emboar 500 (Fire), Oshawott 501 -> Dewott 502 -> Samurott 503 (Water). Pokermon's starter rules:
  // the type's perk at every stage (Grass +1 hand size, Bulbasaur's; Fire +1 discard, Charmander's; Water +1 hand, Squirtle's), Basic
  // Uncommon $5 with `starter` (the Starter Pack), Stage 1 Safari $8, Stage 2 Safari $10; evolution by rounds, 5 then 5 (Chikorita's /
  // Cyndaquil's / Totodile's timers). Types from their upstream cards (Grass / Fire / Fire / Water: Pignite and Emboar are Fire/Fighting,
  // their cards Fire). Nacho and Pokermon+ have none of the nine. Art: upstream 3.9.1 (Natdex {28,32}, then {0..14,33}).
  // Snivy (Contrary): each debuffed card held in hand gives +4 Mult (`mult`, Energy +40%: 5.6 / 7.2 / 8.8).
  snivy: {
    name: 'snivy', poke_sprite391: sprite('Natdex', 28, 32),
    config: { extra: { h_size: 1, mult: 4, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 5, blueprint_compat: true, starter: true,
    attributes: ['starter', 'hand_size', 'mult', 'debuff', 'round_evo'], poke_after: 'arceus',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = debuffed_held(); return { vars: [ex.h_size, r3(ex.mult), ex.rounds, n, r3(ex.mult * n)] }; },
    calculate(self, card, context) { return contrary_held(card, context) || level_evo(self, card, context, 'j_poke_servine'); },
    ...hand_size,
  },
  // Servine: +8 Mult per debuffed card held (Energy: 11.2 / 14.4 / 17.6).
  servine: {
    name: 'servine', poke_sprite391: sprite('Natdex', 0, 33),
    config: { extra: { h_size: 1, mult: 8, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['starter', 'hand_size', 'mult', 'debuff', 'round_evo'], poke_after: 'snivy',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = debuffed_held(); return { vars: [ex.h_size, r3(ex.mult), ex.rounds, n, r3(ex.mult * n)] }; },
    calculate(self, card, context) { return contrary_held(card, context) || level_evo(self, card, context, 'j_poke_serperior'); },
    ...hand_size,
  },
  // Serperior: debuffed scored cards score as if not debuffed (contrary_lifts, the score_debuffed hook), and each gives X1.25
  // (`Xmult_multi`, Energy +5%: 1.3125 / 1.375 / 1.4375). Its Contrary is the payoff the line was building to: the held +Mult is gone.
  serperior: {
    name: 'serperior', poke_sprite391: sprite('Natdex', 2, 33),
    config: { extra: { h_size: 1, Xmult_multi: 1.25 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['starter', 'hand_size', 'xmult', 'debuff'], poke_after: 'servine',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.debuff_lifted) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
    ...hand_size,
  },
  // Tepig (Flame Charge): +4 Mult per hand in a row of the same poker hand this round, this one included (`mult`, Energy +40%: 5.6 / 7.2 / 8.8).
  tepig: {
    name: 'tepig', poke_sprite391: sprite('Natdex', 4, 33),
    config: { extra: { d_size: 1, mult: 4, rounds: 5, streak: 0 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Fire', gen: 5, blueprint_compat: true, starter: true,
    attributes: ['starter', 'discard', 'mult', 'hand_type', 'reset', 'round_evo'], poke_after: 'serperior',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.mult), ex.rounds, ...flame_vars(ex)] }; },
    calculate(self, card, context) { flame_charge(card, context); return flame_main(card, context) || level_evo(self, card, context, 'j_poke_pignite'); },
    ...discards,
  },
  // Pignite: +6 Mult per streak hand (Energy: 8.4 / 10.8 / 13.2).
  pignite: {
    name: 'pignite', poke_sprite391: sprite('Natdex', 6, 33),
    config: { extra: { d_size: 1, mult: 6, rounds: 5, streak: 0 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 5, blueprint_compat: true,
    attributes: ['starter', 'discard', 'mult', 'hand_type', 'reset', 'round_evo'], poke_after: 'tepig',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.mult), ex.rounds, ...flame_vars(ex)] }; },
    calculate(self, card, context) { flame_charge(card, context); return flame_main(card, context) || level_evo(self, card, context, 'j_poke_emboar'); },
    ...discards,
  },
  // Emboar: X1 + X0.25 per streak hand (`Xmult_mod`, Energy +20%: 0.3 / 0.35 / 0.4).
  emboar: {
    name: 'emboar', poke_sprite391: sprite('Natdex', 8, 33),
    config: { extra: { d_size: 1, Xmult_mod: 0.25, streak: 0 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fire', gen: 5, blueprint_compat: true,
    attributes: ['starter', 'discard', 'xmult', 'hand_type', 'reset'], poke_after: 'pignite',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, [n, h] = flame_vars(ex);
      return { vars: [ex.d_size, r3(ex.Xmult_mod), n, h, r3(1 + ex.Xmult_mod * n)] };
    },
    calculate(self, card, context) { flame_charge(card, context); return flame_main(card, context); },
    ...discards,
  },
  // Oshawott (Razor Shell): the first scored card retriggers once. The retriggers are fixed; it carries Samurott's Ace X (`Xmult_multi` 1.5,
  // unused until then: Combee's "Energy for later"), so Energy can be used on it and is re-applied at each evolution.
  oshawott: {
    name: 'oshawott', poke_sprite391: sprite('Natdex', 10, 33),
    config: { extra: { hands: 1, strikes: 1, retriggers: 1, Xmult_multi: 1.5, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Water', gen: 5, blueprint_compat: true, starter: true,
    attributes: ['starter', 'hands', 'retrigger', 'position', 'round_evo'], poke_after: 'emboar',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, ex.strikes, ex.rounds] }; },
    calculate(self, card, context) { return razor_shell(card, context) || level_evo(self, card, context, 'j_poke_dewott'); },
    ...hands,
  },
  // Dewott: the first 2 scored cards retrigger.
  dewott: {
    name: 'dewott', poke_sprite391: sprite('Natdex', 12, 33),
    config: { extra: { hands: 1, strikes: 2, retriggers: 1, Xmult_multi: 1.5, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['starter', 'hands', 'retrigger', 'position', 'round_evo'], poke_after: 'oshawott',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, ex.strikes, ex.rounds] }; },
    calculate(self, card, context) { return razor_shell(card, context) || level_evo(self, card, context, 'j_poke_samurott'); },
    ...hands,
  },
  // Samurott: the first 3 scored cards retrigger; Shell Blade: scored Aces give X1.5 (Energy +5%: 1.575 / 1.65 / 1.725).
  samurott: {
    name: 'samurott', poke_sprite391: sprite('Natdex', 14, 33),
    config: { extra: { hands: 1, strikes: 3, retriggers: 1, Xmult_multi: 1.5 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['starter', 'hands', 'retrigger', 'position', 'xmult', 'rank'], poke_after: 'dewott',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, ex.strikes, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) { return razor_shell(card, context) || shell_blade(card, context); },
    ...hands,
  },
  // ---------------------------------------------------------------- The Gen 6 starters (2026-10-28, the owner's "build" of the missing
  // Gen 5-9 starters): Chespin / Fennekin / Froakie lines. Pokermon's starter conventions: a type perk at every stage (Grass +1 hand size,
  // Fire +1 discard, Water +1 hand: fixed, never energized); Basic Uncommon $5 with `starter` (the Starter Pack), Stage 1 Safari $8, Stage 2
  // Safari $10; 5 rounds then 5 (Chikorita / Cyndaquil / Totodile's timers). Types are the cards' (Grass / Fire / Water). Art: upstream
  // 3.9.1's own cells (Natdex 8-24, 43); nothing to deploy. Neither Nacho nor Pokermon+ has any of them. After Genesect (649; Hydreigon
  // 635 before the Gen 5 Legendaries, contentRev 55), before Bunnelby (659).
  // Chespin 650: +1 hand size; +40 Chips (`chips`, Energy +30%: 52 / 64 / 76). Evolves after 5 rounds.
  chespin: {
    name: 'chespin', poke_sprite391: sprite('Natdex', 8, 43),
    config: { extra: { h_size: 1, chips: 40, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 6, blueprint_compat: true, starter: true,
    attributes: ['starter', 'hand_size', 'chips', 'round_evo'], poke_after: 'genesect',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_chips(r3(card.ability.extra.chips)), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      return level_evo(self, card, context, 'j_poke_quilladin');
    },
    ...hand_size,
  },
  // Quilladin 651: +1 hand size; +80 Chips (104 / 128 / 152). Evolves after 5 rounds.
  quilladin: {
    name: 'quilladin', poke_sprite391: sprite('Natdex', 10, 43),
    config: { extra: { h_size: 1, chips: 80, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 6, blueprint_compat: true,
    attributes: ['starter', 'hand_size', 'chips', 'round_evo'], poke_after: 'chespin',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_chips(r3(card.ability.extra.chips)), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      return level_evo(self, card, context, 'j_poke_chesnaught');
    },
    ...hand_size,
  },
  // Chesnaught 652: +1 hand size; +150 Chips (195 / 240 / 285); Spiky Shield: X1.5 Mult (`Xmult`, Energy +20%: 1.8 / 2.1 / 2.4) while you
  // have 2 or more hands left, counted BEFORE the hand is played (this one included: every hand but the round's last; spiky_on). The 2
  // (`hands_req`) is fixed.
  chesnaught: {
    name: 'chesnaught', poke_sprite391: sprite('Natdex', 12, 43),
    config: { extra: { h_size: 1, chips: 150, Xmult: 1.5, hands_req: 2 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Grass', gen: 6, blueprint_compat: true,
    attributes: ['starter', 'hand_size', 'chips', 'xmult', 'hands'], poke_after: 'quilladin',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [ex.h_size, r3(ex.chips), r3(ex.Xmult), ex.hands_req, spiky_on(card, false) ? 'Active!' : 'Inactive'] };
    },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const ex = card.ability.extra;
      if (spiky_on(card, true)) return { message: 'Spiky Shield!', colour: 'XMULT', chip_mod: ex.chips, Xmult_mod: ex.Xmult };
      return { message: a_chips(r3(ex.chips)), colour: 'CHIPS', chip_mod: ex.chips };
    },
    ...hand_size,
  },
  // Fennekin 653: +1 discard; +1 Foresight (both fixed). No number of its own: it carries Delphox's Mystical Fire gain `Xmult_mod` 0.2
  // (unused until then; Combee's "Energy for later"), so Fire Energy taken now is re-applied on each evolution. Evolves after 5 rounds.
  fennekin: {
    name: 'fennekin', poke_sprite391: sprite('Natdex', 14, 43),
    config: { extra: { d_size: 1, scry: 1, rounds: 5, Xmult_mod: 0.2 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Fire', gen: 6, blueprint_compat: false, starter: true,
    attributes: ['starter', 'discard', 'foresight', 'round_evo'], poke_after: 'chesnaught',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.d_size, ex.scry, ex.rounds] }; },
    calculate(self, card, context) { return level_evo(self, card, context, 'j_poke_braixen'); },
    ...discards_scry,
  },
  // Braixen 654: +1 discard; +1 Foresight; the first time each round you discard a card that shares a rank with a Foreseen card, create a
  // Tarot (must have room; braixen_tarot). Carries `Xmult_mod` for Delphox. Evolves after 5 rounds.
  braixen: {
    name: 'braixen', poke_sprite391: sprite('Natdex', 16, 43),
    config: { extra: { d_size: 1, scry: 1, rounds: 5, Xmult_mod: 0.2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 6, blueprint_compat: false,
    attributes: ['starter', 'discard', 'foresight', 'tarot', 'generation', 'round_evo'], poke_after: 'fennekin',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.d_size, ex.scry, ex.rounds, braixen_state(card)] }; },
    calculate(self, card, context) { braixen_tarot(card, context); return level_evo(self, card, context, 'j_poke_delphox'); },
    ...discards_scry,
  },
  // Delphox 655: +1 discard; +1 Foresight; Mystical Fire: permanently gains X0.2 Mult for each Tarot card used (`Xmult_mod`, Energy +20%:
  // 0.24 / 0.28 / 0.32; banked in `fire_Xmult`, no energy field, never raised retroactively).
  delphox: {
    name: 'delphox', poke_sprite391: sprite('Natdex', 18, 43),
    config: { extra: { d_size: 1, scry: 1, Xmult_mod: 0.2, fire_Xmult: 1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fire', gen: 6, blueprint_compat: true,
    attributes: ['starter', 'discard', 'foresight', 'xmult', 'scaling', 'tarot'], poke_after: 'braixen',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.d_size, ex.scry, r3(ex.Xmult_mod), r3(ex.fire_Xmult)] }; },
    calculate(self, card, context) { return mystical_fire(card, context); },
    ...discards_scry,
  },
  // Froakie 656: +1 hand; +30 Chips for each Water Joker, itself included (`chips`, Energy +30%: 39 / 48 / 57; froak_count). Evolves after
  // 5 rounds.
  froakie: {
    name: 'froakie', poke_sprite391: sprite('Natdex', 20, 43),
    config: { extra: { hands: 1, chips: 30, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Water', gen: 6, blueprint_compat: true, starter: true,
    attributes: ['starter', 'hands', 'chips', 'types', 'round_evo'], poke_after: 'delphox',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = froak_count(card); return { vars: [ex.hands, r3(ex.chips), n, r3(ex.chips * n), ex.rounds] }; },
    calculate(self, card, context) { return froak_main(card, context) || level_evo(self, card, context, 'j_poke_frogadier'); },
    ...hands,
  },
  // Frogadier 657: +1 hand; +50 Chips for each Water Joker (65 / 80 / 95). Evolves after 5 rounds.
  frogadier: {
    name: 'frogadier', poke_sprite391: sprite('Natdex', 22, 43),
    config: { extra: { hands: 1, chips: 50, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 6, blueprint_compat: true,
    attributes: ['starter', 'hands', 'chips', 'types', 'round_evo'], poke_after: 'froakie',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = froak_count(card); return { vars: [ex.hands, r3(ex.chips), n, r3(ex.chips * n), ex.rounds] }; },
    calculate(self, card, context) { return froak_main(card, context) || level_evo(self, card, context, 'j_poke_greninja'); },
    ...hands,
  },
  // Greninja 658: +1 hand; Protean: when a Blind is selected (the start of each round; not Blueprint) it becomes the type most common
  // among your other undebuffed Jokers (protean_pick: a tie, or no typed joker, keeps its current type); it keeps that type until the next
  // Blind (through the shop). Water Shuriken: X(1.5 + 0.5 for each OTHER joker of its current type) (`Xmult` / `Xmult_mod`, Energy +20%
  // each: 1.8 / 2.1 / 2.4 and 0.6 / 0.7 / 0.8). Its changing type never breaks Monotype (poke_mono_exempt, Castform's exemption); its
  // current type's Energy matches (Castform's rule), Colorless at half strength unless it is Colorless.
  greninja: {
    name: 'greninja', poke_sprite391: sprite('Natdex', 24, 43),
    config: { extra: { hands: 1, Xmult: 1.5, Xmult_mod: 0.5 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Water', gen: 6, blueprint_compat: true,
    attributes: ['starter', 'hands', 'xmult', 'types'], poke_after: 'frogadier',
    poke_mono_exempt: true,
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [ex.hands, r3(ex.Xmult), r3(ex.Xmult_mod), get_type(card) || ex.ptype, ninja_others(card), ninja_x(card)] };
    },
    calculate(self, card, context) {
      if (context.setting_blind && !context.blueprint && !card.getting_sliced) {
        const t = protean_pick(card);
        if (t && protean_set(card, t)) card_eval_status_text(card, 'extra', null, null, null, { message: 'Protean: ' + t + '!', colour: 'BLUE' });
        return undefined;
      }
      if (context.joker_main) { const x = ninja_x(card); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
    ...hands,
  },
  // ---------------------------------------------------------------- Gen 5, batch 1 (the owner's "Build it", 2026-10-28; contentRev 53)
  // 22 jokers, #504-539. Prices by the DESIGN_GUIDE slots (3-stage U $6 / S $8 / S $10, 2-stage C $5 / S $8, single-stage R $7);
  // evolution by rounds (4 for an early evolver, else 5). Types = the cards'. Energy raises each joker's main number at the standard
  // share; odds, Foresight, money and retriggers are fixed; a stage with no number carries its evolution's field ("Energy carries to
  // ..."). Art: upstream 3.9.1's own cells (Natdex {16..28,33}, {16..24,34}, {2..26,35}; Unfezant Gen05 {0,0}); nothing to deploy.
  // Neither Nacho nor Pokermon+ has any of them.
  // Patrat 504: Common $5, Colorless. +1 Foresight; Lookout: each Foreseen card gives +6 Mult (`mult` +40%: 8.4 / 10.8 / 13.2). 4 rounds.
  patrat: {
    name: 'patrat', poke_sprite391: sprite('Natdex', 16, 33),
    config: { extra: { scry: 1, mult: 6, rounds: 4 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Colorless', gen: 5, blueprint_compat: true,
    attributes: ['foresight', 'mult', 'round_evo'], poke_after: 'samurott',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { return lookout(card, context) || level_evo(self, card, context, 'j_poke_watchog'); },
    ...scry,
  },
  // Watchog 505: Safari $8. +2 Foresight; each Foreseen card +10 Mult (14 / 18 / 22).
  watchog: {
    name: 'watchog', poke_sprite391: sprite('Natdex', 18, 33),
    config: { extra: { scry: 2, mult: 10 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 5, blueprint_compat: true,
    attributes: ['foresight', 'mult'], poke_after: 'patrat',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, r3(ex.mult)] }; },
    calculate(self, card, context) { return lookout(card, context); },
    ...scry,
  },
  // Lillipup 506: Uncommon $6, Colorless. Pickup: at end of round, 1 in 4 to create a random Tarot (with room; no room, no roll). Its odds are
  // fixed; it carries Stoutland's `mult` 3 ("Energy carries to Stoutland"). 4 rounds.
  lillipup: {
    name: 'lillipup', poke_sprite391: sprite('Natdex', 20, 33),
    config: { extra: { num: 1, dem: 4, mult: 3, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Colorless', gen: 5, blueprint_compat: false,
    attributes: ['tarot', 'chance', 'round_evo'], poke_after: 'watchog',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [...pickup_vars(card, 'lillipup'), card.ability.extra.rounds] }; },
    calculate(self, card, context) { pickup(card, context, 'lillipup'); return level_evo(self, card, context, 'j_poke_herdier'); },
  },
  // Herdier 507: Safari $8. 1 in 3: a Tarot or a Planet (a seeded coin). 5 rounds.
  herdier: {
    name: 'herdier', poke_sprite391: sprite('Natdex', 22, 33),
    config: { extra: { num: 1, dem: 3, planets: true, mult: 3, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 5, blueprint_compat: false,
    attributes: ['tarot', 'planet', 'chance', 'round_evo'], poke_after: 'lillipup',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [...pickup_vars(card, 'herdier'), card.ability.extra.rounds] }; },
    calculate(self, card, context) { pickup(card, context, 'herdier'); return level_evo(self, card, context, 'j_poke_stoutland'); },
  },
  // Stoutland 508: Safari $10. 1 in 2: a Tarot or a Planet; +3 Mult for each consumable held (`mult` +40%: 4.2 / 5.4 / 6.6).
  stoutland: {
    name: 'stoutland', poke_sprite391: sprite('Natdex', 24, 33),
    config: { extra: { num: 1, dem: 2, planets: true, mult: 3 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Colorless', gen: 5, blueprint_compat: true,
    attributes: ['tarot', 'planet', 'chance', 'mult'], poke_after: 'herdier',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [...pickup_vars(card, 'stoutland'), r3(card.ability.extra.mult), stout_mult(card)] }; },
    calculate(self, card, context) {
      pickup(card, context, 'stoutland');
      if (context.joker_main && held_consumables() > 0) { const m = stout_mult(card); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return undefined;
    },
  },
  // Purrloin 509: Common $5, Dark. Pickpocket: earn $2 at end of round (calc_dollar_bonus); the Joker directly to its right loses $1 of
  // sell value (never below $1; nothing on its right: no loss, the $2 still earned). Money and drain fixed: Energy-inert
  // (poke_no_energy_field). 4 rounds.
  purrloin: {
    name: 'purrloin', poke_sprite391: sprite('Natdex', 26, 33),
    config: { extra: { steal: 2, drain: 1, rounds: 4 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 5, blueprint_compat: false,
    attributes: ['economy', 'drain', 'round_evo'], poke_after: 'stoutland',
    poke_no_energy_field: true,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.steal, ex.drain, ex.rounds] }; },
    calculate(self, card, context) { pickpocket(card, context); return level_evo(self, card, context, 'j_poke_liepard'); },
    calc_dollar_bonus(self, card) { return card.ability.extra.steal; },
  },
  // Liepard 510: Safari $8. $4 at end of round; the right neighbour still loses $1.
  liepard: {
    name: 'liepard', poke_sprite391: sprite('Natdex', 28, 33),
    config: { extra: { steal: 4, drain: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 5, blueprint_compat: false,
    attributes: ['economy', 'drain'], poke_after: 'purrloin',
    poke_no_energy_field: true,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.steal, ex.drain] }; },
    calculate(self, card, context) { pickpocket(card, context); return undefined; },
    calc_dollar_bonus(self, card) { return card.ability.extra.steal; },
  },
  // Pidove 519: Uncommon $6, Colorless. Super Luck: Lucky cards' odds +1 (the numerator, before Oops! doubles it). The odds are fixed; it
  // carries Tranquill's `mult` 5 ("Energy carries to Tranquill"). Starly's flock counts all three (Colorless). 4 rounds.
  pidove: {
    name: 'pidove', poke_sprite391: sprite('Natdex', 16, 34),
    config: { extra: { lucky_odds: 1, mult: 5, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Colorless', gen: 5, blueprint_compat: false,
    attributes: ['chance', 'enhancements', 'round_evo'], poke_after: 'musharna',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); const ex = card.ability.extra; return { vars: [ex.lucky_odds, ...lucky_odds_vars(card), ex.rounds] }; },
    calculate(self, card, context) { return super_luck(card, context) || level_evo(self, card, context, 'j_poke_tranquill'); },
  },
  // Tranquill 520: Safari $8. Super Luck; a scored Lucky card that triggers also gives +5 Mult (`mult` +40%: 7 / 9 / 11). 5 rounds.
  tranquill: {
    name: 'tranquill', poke_sprite391: sprite('Natdex', 18, 34),
    config: { extra: { lucky_odds: 1, mult: 5, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 5, blueprint_compat: true,
    attributes: ['chance', 'enhancements', 'mult', 'round_evo'], poke_after: 'pidove',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); const ex = card.ability.extra; return { vars: [ex.lucky_odds, ...lucky_odds_vars(card), r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      const r = super_luck(card, context);
      if (r) return r;
      if (lucky_scored(context)) return { mult: card.ability.extra.mult, card };
      return level_evo(self, card, context, 'j_poke_unfezant');
    },
  },
  // Unfezant 521: Safari $10. Super Luck; a triggering Lucky card gives X1.5 instead (`Xmult_multi` +5%: X1.575 / 1.65 / 1.725).
  unfezant: {
    name: 'unfezant', poke_sprite391: sprite('Gen05', 0, 0),
    config: { extra: { lucky_odds: 1, Xmult_multi: 1.5 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Colorless', gen: 5, blueprint_compat: true,
    attributes: ['chance', 'enhancements', 'xmult'], poke_after: 'tranquill',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); const ex = card.ability.extra; return { vars: [ex.lucky_odds, ...lucky_odds_vars(card), r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) {
      const r = super_luck(card, context);
      if (r) return r;
      if (lucky_scored(context)) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Blitzle 522: Common $5, Lightning. Motor Drive: +4 Mult for each hand played this round before any discard, this one included (the 1st
  // hand +4, the 2nd +8...; once you discard, +0 for the rest of the round). `mult` +40%: 5.6 / 7.2 / 8.8 a hand. 5 rounds.
  blitzle: {
    name: 'blitzle', poke_sprite391: sprite('Natdex', 22, 34),
    config: { extra: { mult: 4, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Lightning', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'discard', 'hands', 'round_evo'], poke_after: 'unfezant',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), motor_mult(card), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = motor_mult(card); return m > 0 ? { message: a_mult(m), colour: 'MULT', mult_mod: m } : undefined; }
      return level_evo(self, card, context, 'j_poke_zebstrika');
    },
  },
  // Zebstrika 523: Safari $8. X1.5 Mult if you haven't discarded this round (`Xmult` +20%: 1.8 / 2.1 / 2.4).
  zebstrika: {
    name: 'zebstrika', poke_sprite391: sprite('Natdex', 24, 34),
    config: { extra: { Xmult: 1.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Lightning', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'discard'], poke_after: 'blitzle',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult), motor_on() ? 'Active!' : 'Inactive: you discarded'] }; },
    calculate(self, card, context) {
      if (context.joker_main && motor_on()) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Woobat 527: Common $5, Psychic. Heart Stamp: each scored Heart earns $1 (Rough Gem's, Wild cards count). The $ is fixed; it carries
  // Swoobat's `Xmult_multi` ("Energy carries to Swoobat"). 5 rounds.
  woobat: {
    name: 'woobat', poke_sprite391: sprite('Natdex', 2, 35),
    config: { extra: { stamp_money: 1, Xmult_multi: 1.1, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Psychic', gen: 5, blueprint_compat: true,
    attributes: ['economy', 'suit', 'hearts', 'round_evo'], poke_after: 'gigalith',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.stamp_money, ex.rounds] }; },
    calculate(self, card, context) { return heart_stamp(card, context, false) || level_evo(self, card, context, 'j_poke_swoobat'); },
  },
  // Swoobat 528: Safari $8. Each scored Heart earns $1 and gives X1.1 (`Xmult_multi` +5%: X1.155 / 1.21 / 1.265).
  swoobat: {
    name: 'swoobat', poke_sprite391: sprite('Natdex', 4, 35),
    config: { extra: { stamp_money: 1, Xmult_multi: 1.1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 5, blueprint_compat: true,
    attributes: ['economy', 'xmult', 'suit', 'hearts'], poke_after: 'woobat',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.stamp_money, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) { return heart_stamp(card, context, true); },
  },
  // Timburr 532: Uncommon $6, Fighting. Scored Stone cards each give +4 Mult (`mult` +40%: 5.6 / 7.2 / 8.8). 5 rounds.
  timburr: {
    name: 'timburr', poke_sprite391: sprite('Natdex', 12, 35),
    config: { extra: { mult: 4, rounds: 5 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Fighting', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'round_evo'], poke_after: 'excadrill',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { return pillars(card, context, false) || level_evo(self, card, context, 'j_poke_gurdurr'); },
  },
  // Gurdurr 533: Safari $8. +8 Mult per scored Stone card (11.2 / 14.4 / 17.6). 5 rounds.
  gurdurr: {
    name: 'gurdurr', poke_sprite391: sprite('Natdex', 14, 35),
    config: { extra: { mult: 8, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fighting', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'round_evo'], poke_after: 'timburr',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { return pillars(card, context, false) || level_evo(self, card, context, 'j_poke_conkeldurr'); },
  },
  // Conkeldurr 534: Safari $10. +8 Mult and X1.5 per scored Stone card (`mult` +40%: 11.2 / 14.4 / 17.6, kept from Gurdurr so its Energy
  // never shrinks on evolving; `Xmult_multi` +5%: X1.575 / 1.65 / 1.725).
  conkeldurr: {
    name: 'conkeldurr', poke_sprite391: sprite('Natdex', 16, 35),
    config: { extra: { mult: 8, Xmult_multi: 1.5 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fighting', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'enhancements'], poke_after: 'gurdurr',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.mult), r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) { return pillars(card, context, true); },
  },
  // Tympole 535: Uncommon $6, Water. Swift Swim: +30 Chips, doubled while it's raining (swift_swim_raining: a working Kyogre, or a Clubs
  // forecast on the round's first deal). `chips` +30%: 39 / 48 / 57. 5 rounds.
  tympole: {
    name: 'tympole', poke_sprite391: sprite('Natdex', 18, 35),
    config: { extra: { chips: 30, rounds: 5 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'suit', 'clubs', 'hand_drawn', 'round_evo'], poke_after: 'conkeldurr',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), rain_state(card), ex.rounds] }; },
    calculate(self, card, context) { return swift_swim(card, context) || level_evo(self, card, context, 'j_poke_palpitoad'); },
  },
  // Palpitoad 536: Safari $8. +50 Chips, doubled in rain (65 / 80 / 95). 5 rounds.
  palpitoad: {
    name: 'palpitoad', poke_sprite391: sprite('Natdex', 20, 35),
    config: { extra: { chips: 50, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'suit', 'clubs', 'hand_drawn', 'round_evo'], poke_after: 'tympole',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), rain_state(card), ex.rounds] }; },
    calculate(self, card, context) { return swift_swim(card, context) || level_evo(self, card, context, 'j_poke_seismitoad'); },
  },
  // Seismitoad 537: Safari $10. +50 Chips, doubled in rain; in rain every scored Club also retriggers once (fixed).
  seismitoad: {
    name: 'seismitoad', poke_sprite391: sprite('Natdex', 22, 35),
    config: { extra: { chips: 50, retriggers: 1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'retrigger', 'suit', 'clubs', 'hand_drawn'], poke_after: 'palpitoad',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), rain_state(card)] }; },
    calculate(self, card, context) {
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && context.other_card.is_suit('Clubs') && swift_swim_raining(card)) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return swift_swim(card, context);
    },
  },
  // Throh 538: Rare $7, Fighting. Seismic Toss: the lowest-ranked scored card gives X2 (`Xmult_multi` +5%: X2.1 / 2.2 / 2.3) each time it
  // scores (re-read per scoring, so its retriggers hit again); a tie the leftmost; never a Stone or debuffed card. Dojo Rivals: with Sawk
  // held (undebuffed) +X0.5 (`rival_x`, fixed): X2.5.
  throh: {
    name: 'throh', poke_sprite391: sprite('Natdex', 24, 35),
    config: { extra: { Xmult_multi: 2, rival_x: 0.5 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Fighting', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'rank', 'pair'], poke_after: 'seismitoad',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult_multi), r3(ex.rival_x), dojo('j_poke_sawk') ? 'active' : 'needs Sawk', throh_x(card)] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card === toss_target(context.scoring_hand)) return { x_mult: throh_x(card), card };
      return undefined;
    },
  },
  // Sawk 539: Rare $7, Fighting. Karate Chop: the highest-ranked scored card (Aces high; a tie the leftmost; Inteleon's snipe_target: never
  // a Stone or debuffed card) gives +30 Mult (`mult` +40%: 42 / 54 / 66). Dojo Rivals: with Throh, +15 (`rival_mult`, fixed): +45.
  sawk: {
    name: 'sawk', poke_sprite391: sprite('Natdex', 26, 35),
    config: { extra: { mult: 30, rival_mult: 15 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Fighting', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'rank', 'pair'], poke_after: 'throh',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.mult), r3(ex.rival_mult), dojo('j_poke_throh') ? 'active' : 'needs Throh', sawk_mult(card)] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card === snipe_target(context.scoring_hand)) return { mult: sawk_mult(card), card };
      return undefined;
    },
  },
  // ---------------------------------------------------------------- Gen 5, batch 2 (2026-10-28, the owner's "Yes"): 26 jokers, #540-573
  // Prices on the guide's slots (3-stage line U $6 / S $8 / S $10; 2-stage line C $5 / S $8; single-stage R $7); evolution by rounds (an
  // early evolver 4, else 5), the fossils by the Ancient convention (trigger the 3+ tier 5 times). Energy raises each line's main number at
  // the standard rate; counts, conversions, money, odds and retriggers are fixed; banks are never retroactive. Types from their upstream
  // cards (Venipede and Sandile lines Dark, Dwebble Earth: pokermon_art_type). Art: upstream 3.9.1's own cells (Natdex {28,35}..{4,38};
  // Basculin Gen 5 {4,0} / {6,0}); nothing to deploy. Neither Nacho nor Pokermon+ has any of them.
  // Sewaddle 540 (Grass, Uncommon $6): the tailor, 1 unenhanced deck card a Blind becomes a Bonus card. 4 rounds. Its own effect has no
  // number: it carries Leavanny's `mult` 3 (Combee's "Energy for later"), so Energy used on it lands on Leavanny's +Mult.
  sewaddle: {
    name: 'sewaddle', poke_sprite391: sprite('Natdex', 28, 35),
    config: { extra: { mult: 3, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['enhancements', 'modify_card', 'full_deck', 'round_evo'], poke_after: 'sawk',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_bonus); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { tailor(card, context, TAILOR_CLOTHS.sewaddle); return level_evo(self, card, context, 'j_poke_swadloon'); },
  },
  // Swadloon 541 (Safari $8): a Bonus or a Mult card (a seeded pick). 5 rounds.
  swadloon: {
    name: 'swadloon', poke_sprite391: sprite('Natdex', 0, 36),
    config: { extra: { mult: 3, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['enhancements', 'modify_card', 'full_deck', 'round_evo'], poke_after: 'sewaddle',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_bonus); info_queue.push(P_CENTERS.m_mult); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { tailor(card, context, TAILOR_CLOTHS.swadloon); return level_evo(self, card, context, 'j_poke_leavanny'); },
  },
  // Leavanny 542 (Safari $10): a Bonus, Mult or Lucky card; each scored enhanced card +3 Mult (`mult`, Energy +40%: 4.2 / 5.4 / 6.6).
  leavanny: {
    name: 'leavanny', poke_sprite391: sprite('Natdex', 2, 36),
    config: { extra: { mult: 3 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'modify_card', 'full_deck'], poke_after: 'swadloon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); return { vars: [r3(card.ability.extra.mult)] }; },
    calculate(self, card, context) { tailor(card, context, TAILOR_CLOTHS.leavanny); return leaf_blade(card, context); },
  },
  // Venipede 543 (Dark: its card; Uncommon $6): Poison Point, each card you discard permanently -2 Chips (floored at 0) and +3 Mult
  // (`mult_mod`, a per-card gain: Energy +20%, 3.6 / 4.2 / 4.8; the -2 `chip_loss` is fixed). 4 rounds.
  venipede: {
    name: 'venipede', poke_sprite391: sprite('Natdex', 4, 36),
    config: { extra: { chip_loss: 2, mult_mod: 3, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Dark', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'discard', 'modify_card', 'round_evo'], poke_after: 'leavanny',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.chip_loss, r3(ex.mult_mod), ex.rounds] }; },
    calculate(self, card, context) { poison_point(card, context); return level_evo(self, card, context, 'j_poke_whirlipede'); },
  },
  // Whirlipede 544 (Safari $8): -3 Chips and +5 Mult (Energy: 6 / 7 / 8). 5 rounds.
  whirlipede: {
    name: 'whirlipede', poke_sprite391: sprite('Natdex', 6, 36),
    config: { extra: { chip_loss: 3, mult_mod: 5, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'discard', 'modify_card', 'round_evo'], poke_after: 'venipede',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.chip_loss, r3(ex.mult_mod), ex.rounds] }; },
    calculate(self, card, context) { poison_point(card, context); return level_evo(self, card, context, 'j_poke_scolipede'); },
  },
  // Scolipede 545 (Safari $10): Whirlipede's poison, and each poisoned unenhanced card becomes a Mult card.
  scolipede: {
    name: 'scolipede', poke_sprite391: sprite('Natdex', 8, 36),
    config: { extra: { chip_loss: 3, mult_mod: 5, toxic: true } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Dark', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'discard', 'modify_card', 'enhancements'], poke_after: 'whirlipede',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_mult); const ex = card.ability.extra; return { vars: [ex.chip_loss, r3(ex.mult_mod)] }; },
    calculate(self, card, context) { poison_point(card, context); return undefined; },
  },
  // Cottonee 546 (Grass, Common $5): +1 hand size; Prankster, the round's first hand drawn draws 1 extra card (a +1 hand size for that
  // deal only). 5 rounds. No number: Energy-inert by design (poke_no_energy_field), as Whimsicott.
  cottonee: {
    name: 'cottonee', poke_sprite391: sprite('Natdex', 10, 36),
    config: { extra: { h_size: 1, prank_draw: 0, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 5, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['hand_size', 'round_evo'], poke_after: 'scolipede',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, ex.rounds] }; },
    calculate(self, card, context) { prank_draw(card, context); return level_evo(self, card, context, 'j_poke_whimsicott'); },
    ...prankster,
  },
  // Whimsicott 547 (Safari $8): +2 hand size, fixed (never energized: the guide's hand-size pitfall; a +2 that grew with Energy would
  // stack past every other Grass hand-size joker).
  whimsicott: {
    name: 'whimsicott', poke_sprite391: sprite('Natdex', 12, 36),
    config: { extra: { h_size: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 5, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['hand_size'], poke_after: 'cottonee',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.h_size] }; },
    ...hand_size,
  },
  // Petilil 548 (Grass, Common $5): each scored Flower card earns $1 (fixed: money takes no Energy, so the line is Energy-inert). 5 rounds.
  petilil: {
    name: 'petilil', poke_sprite391: sprite('Natdex', 14, 36),
    config: { extra: { flower_money: 1, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 5, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['money', 'economy', 'enhancements', 'round_evo'], poke_after: 'whimsicott',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_flower); const ex = card.ability.extra; return { vars: [ex.flower_money, ex.rounds] }; },
    calculate(self, card, context) { return flower_money(card, context) || level_evo(self, card, context, 'j_poke_lilligant'); },
  },
  // Lilligant 549 (Safari $8): Flower cards need only 3+ suits (Cherrim's / Roserade's rule: the fewest suits asked wins, never 2);
  // each scored Flower card earns $2.
  lilligant: {
    name: 'lilligant', poke_sprite391: sprite('Natdex', 16, 36),
    config: { extra: { flower_money: 2, suits: 3 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 5, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['money', 'economy', 'enhancements', 'suits'], poke_after: 'petilil',
    poke_flower_rule(self, card) { return { suits: card.ability.extra.suits }; },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_flower); const ex = card.ability.extra; return { vars: [ex.suits, ex.flower_money] }; },
    calculate(self, card, context) { return flower_money(card, context); },
  },
  // Basculin 550 (Water, Rare $7, single-stage): a stripe rolled once when created (Red or Blue, Shellos's sea); Red: scored Hearts and
  // Diamonds +20 Chips each, Blue: Clubs and Spades (`chips`, Energy +30%: 26 / 32 / 38). Each stripe draws its own 3.9.1 cell.
  basculin: {
    name: 'basculin', poke_sprite391: sprite('Gen05', 4, 0),
    config: { extra: { chips: 20, form: 'red' } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'suit'], poke_after: 'lilligant',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const s = STRIPES[stripe_of(card)];
      return { vars: [r3(card.ability.extra.chips), s.name, localize(s.suits[0], 'suits_plural'), localize(s.suits[1], 'suits_plural'), card.ability.extra.stripe_scored || 0, BASCULEGION_CARDS], colours: s.suits.slice() };
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.form = pseudorandom(pseudoseed('basculin_stripe')) < 0.5 ? 'red' : 'blue';
    },
    calculate(self, card, context) { stripe_count(card, context); return stripe_chips(card, context) || basculegion_evo(self, card, context); },
  },
  // Sandile 551 (Dark: its card; Uncommon $6): Moxie, +2 Mult banked each Blind beaten (`moxie_mult`; gain `mult_mod`, Energy +20%:
  // 2.4 / 2.8 / 3.2). 5 rounds.
  sandile: {
    name: 'sandile', poke_sprite391: sprite('Natdex', 20, 36),
    config: { extra: { moxie_mult: 0, mult_mod: 2, rounds: 5 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Dark', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'round_evo'], poke_after: 'basculin',
    poke_custom_values_to_keep: ['moxie_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.moxie_mult), ex.rounds] }; },
    calculate(self, card, context) { blind_moxie(card, context); return moxie_main(card, context) || level_evo(self, card, context, 'j_poke_krokorok'); },
  },
  // Krokorok 552 (Safari $8): +4 Mult a Blind (Energy: 4.8 / 5.6 / 6.4), on Sandile's bank. 5 rounds.
  krokorok: {
    name: 'krokorok', poke_sprite391: sprite('Natdex', 22, 36),
    config: { extra: { moxie_mult: 0, mult_mod: 4, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'round_evo'], poke_after: 'sandile',
    poke_custom_values_to_keep: ['moxie_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.moxie_mult), ex.rounds] }; },
    calculate(self, card, context) { blind_moxie(card, context); return moxie_main(card, context) || level_evo(self, card, context, 'j_poke_krookodile'); },
  },
  // Krookodile 553 (Safari $10): gives the banked Mult (it banks no more) and banks X0.15 a Blind instead (`Xmult_mod`, 0.18 / 0.21 / 0.24).
  krookodile: {
    name: 'krookodile', poke_sprite391: sprite('Natdex', 24, 36),
    config: { extra: { moxie_mult: 0, moxie_Xmult: 1, Xmult_mod: 0.15 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Dark', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'scaling'], poke_after: 'krokorok',
    poke_custom_values_to_keep: ['moxie_mult', 'moxie_Xmult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), r3(ex.moxie_mult), r3(ex.moxie_Xmult)] }; },
    calculate(self, card, context) { blind_moxie(card, context); return moxie_main(card, context); },
  },
  // Maractus 556 (Grass, Rare $7, single-stage): each Hazard card held in hand +8 Mult (`mult`, Energy +40%: 11.2 / 14.4 / 17.6).
  maractus: {
    name: 'maractus', poke_sprite391: sprite('Natdex', 0, 37),
    config: { extra: { mult: 8 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'hazards'], poke_after: 'darmanitan',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_hazard); const ex = card.ability.extra, n = hazards_held(); return { vars: [r3(ex.mult), n, r3(ex.mult * n)] }; },
    calculate(self, card, context) { return hazard_held_mult(card, context); },
  },
  // Dwebble 557 (Earth: its card; Common $5): +5 Chips per Stone card in the full deck (`chips`, Energy +30%: 6.5 / 8 / 9.5). 5 rounds.
  dwebble: {
    name: 'dwebble', poke_sprite391: sprite('Natdex', 2, 37),
    config: { extra: { chips: 5, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Earth', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'enhancements', 'full_deck', 'round_evo'], poke_after: 'maractus',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.chips * stones_in_deck()), ex.rounds] }; },
    calculate(self, card, context) { return stone_shell(card, context) || level_evo(self, card, context, 'j_poke_crustle'); },
  },
  // Crustle 558 (Safari $8): +10 Chips per Stone card (13 / 16 / 19).
  crustle: {
    name: 'crustle', poke_sprite391: sprite('Natdex', 4, 37),
    config: { extra: { chips: 10 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'enhancements', 'full_deck'], poke_after: 'dwebble',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.chips * stones_in_deck())] }; },
    calculate(self, card, context) { return stone_shell(card, context); },
  },
  // Sigilyph 561 (Psychic, Rare $7, single-stage): +2 Foresight; a Planet used for Pair (Mercury) levels it 1 extra time. Foresight and the
  // level are fixed: Energy-inert by design (poke_no_energy_field).
  sigilyph: {
    name: 'sigilyph', poke_sprite391: sprite('Natdex', 10, 37),
    config: { extra: { scry: 2, levels: 1 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Psychic', gen: 5, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['foresight', 'planet', 'hand_type'], poke_after: 'scrafty',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); info_queue.push(P_CENTERS.c_mercury); const ex = card.ability.extra; return { vars: [ex.scry, ex.levels] }; },
    calculate(self, card, context) { sigil_pair(card, context); return undefined; },
    ...scry,
  },
  // Yamask 562 (Psychic, Common $5): X0.1 banked per other Joker sold, the first 1 a round (`grudge_Xmult`; gain `Xmult_mod`, Energy
  // +20%: 0.12 / 0.14 / 0.16; the cap is fixed). 5 rounds.
  yamask: {
    name: 'yamask', poke_sprite391: sprite('Natdex', 12, 37),
    config: { extra: { grudge_Xmult: 1, Xmult_mod: 0.1, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Psychic', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'on_sell', 'round_evo'], poke_after: 'sigilyph',
    poke_custom_values_to_keep: ['grudge_Xmult', 'grudge_round', 'grudge_count'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult_mod), r3(ex.grudge_Xmult), ex.rounds, grudge_cap(card), grudge_left(card), Math.min(ex.stones_scored || 0, RUNERIGUS_STONES), RUNERIGUS_STONES] };
    },
    calculate(self, card, context) {
      grudge_sell(card, context); wandering_count(card, context);
      return grudge_main(card, context) || level_evo(self, card, context, runerigus_ready(card) ? 'j_poke_runerigus' : 'j_poke_cofagrigus');
    },
  },
  // Cofagrigus 563 (Safari $8): X0.2 per Joker sold, the first 2 a round (0.24 / 0.28 / 0.32), and Mummy (mummy_sell: the Ante's first
  // Joker sold stays, Negative, no money; it still counts for the X, one of the round's 2).
  cofagrigus: {
    name: 'cofagrigus', poke_sprite391: sprite('Natdex', 14, 37),
    config: { extra: { grudge_Xmult: 1, Xmult_mod: 0.2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'on_sell', 'joker_slot'], poke_after: 'yamask',
    poke_custom_values_to_keep: ['grudge_Xmult', 'grudge_round', 'grudge_count'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ key: 'e_negative', set: 'Edition', config: { extra: 1 } });
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult_mod), r3(ex.grudge_Xmult), mummy_state(), grudge_cap(card), grudge_left(card)] };
    },
    calculate(self, card, context) { grudge_sell(card, context); return grudge_main(card, context); },
  },
  // Tirtouga 564 (Water, Common $5), Ancient 9s: 1+ +30 Chips, 2+ scored 9s permanently +5 Chips, 3+ +50 Chips (`chips1` / `chips2` /
  // `chips3`, Energy +30% each: 39 / 48 / 57, 6.5 / 8 / 9.5, 65 / 80 / 95). Evolves after its 3+ tier fires 5 times.
  tirtouga: {
    name: 'tirtouga', poke_sprite391: sprite('Natdex', 16, 37),
    config: { evo_rqmt: 5, extra: { rank: '9', chips1: 30, chips2: 5, chips3: 50, third_times: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'ancient', 'rank', 'modify_card', 'trigger_evo'], poke_after: 'cofagrigus',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); ancient_tip(info_queue, card.ability.extra.rank);
      const ex = card.ability.extra;
      return { vars: [localize(ex.rank, 'ranks'), r3(ex.chips1), r3(ex.chips2), r3(ex.chips3), Math.max(0, self.config.evo_rqmt - (ex.third_times || 0))] };
    },
    calculate(self, card, context) {
      return ancient_nines(card, context) || scaling_evo(self, card, context, 'j_poke_carracosta', card.ability.extra.third_times || 0, self.config.evo_rqmt);
    },
  },
  // Carracosta 565 (Safari $8): Tirtouga's tiers, the same numbers, and 4+ retriggers every scored 9 (fixed).
  carracosta: {
    name: 'carracosta', poke_sprite391: sprite('Natdex', 18, 37),
    config: { extra: { rank: '9', chips1: 30, chips2: 5, chips3: 50, retriggers: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'ancient', 'rank', 'modify_card', 'retrigger'], poke_after: 'tirtouga',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); ancient_tip(info_queue, card.ability.extra.rank);
      const ex = card.ability.extra;
      return { vars: [localize(ex.rank, 'ranks'), r3(ex.chips1), r3(ex.chips2), r3(ex.chips3)] };
    },
    calculate(self, card, context) { return ancient_nines(card, context); },
  },
  // Archen 566 (Earth, Common $5), Ancient 10s: 1+ +4 Mult (`mult` +40%: 5.6 / 7.2 / 8.8), 2+ X1.25 (`Xmult` +20%: 1.5 / 1.75 / 2), 3+ earn
  // $3 (`ancient_money`, fixed). Evolves after its 3+ tier fires 5 times.
  archen: {
    name: 'archen', poke_sprite391: sprite('Natdex', 20, 37),
    config: { evo_rqmt: 5, extra: { rank: '10', mult: 4, Xmult: 1.25, ancient_money: 3, third_times: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Earth', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'money', 'ancient', 'rank', 'trigger_evo'], poke_after: 'carracosta',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); ancient_tip(info_queue, card.ability.extra.rank);
      const ex = card.ability.extra;
      return { vars: [localize(ex.rank, 'ranks'), r3(ex.mult), r3(ex.Xmult), ex.ancient_money, Math.max(0, self.config.evo_rqmt - (ex.third_times || 0))] };
    },
    calculate(self, card, context) {
      return ancient_tens(card, context) || scaling_evo(self, card, context, 'j_poke_archeops', card.ability.extra.third_times || 0, self.config.evo_rqmt);
    },
  },
  // Archeops 567 (Safari $8): Archen's tiers and 4+ X2 (`Xmult2` +20%: 2.4 / 2.8 / 3.2); Defeatist halves them all on the round's final hand.
  archeops: {
    name: 'archeops', poke_sprite391: sprite('Natdex', 22, 37),
    config: { extra: { rank: '10', mult: 4, Xmult: 1.25, ancient_money: 3, Xmult2: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'money', 'ancient', 'rank'], poke_after: 'archen',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); ancient_tip(info_queue, card.ability.extra.rank);
      const ex = card.ability.extra;
      return { vars: [localize(ex.rank, 'ranks'), r3(ex.mult), r3(ex.Xmult), ex.ancient_money, r3(ex.Xmult2), defeatist(card) ? 'halved' : 'full'] };
    },
    calculate(self, card, context) { return ancient_tens(card, context); },
  },
  // Minccino 572 (Colorless, Common $5): Tidy Up, each discard draws 1 extra card (+1 hand size until your next hand). 5 rounds. No number:
  // Energy-inert by design, as Cinccino (its retrigger count and cap are fixed).
  minccino: {
    name: 'minccino', poke_sprite391: sprite('Natdex', 2, 38),
    config: { extra: { tidy_draws: 0, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Colorless', gen: 5, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['discard', 'hand_size', 'round_evo'], poke_after: 'zoroark',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.rounds] }; },
    calculate(self, card, context) { tidy_up(card, context); return level_evo(self, card, context, 'j_poke_cinccino'); },
    ...tidy,
  },
  // Cinccino 573 (Safari $8): Skill Link, the first scored card retriggers once per discard used this round, at most 5.
  cinccino: {
    name: 'cinccino', poke_sprite391: sprite('Natdex', 4, 38),
    config: { extra: { link_cap: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 5, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['retrigger', 'discard', 'position'], poke_after: 'minccino',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.link_cap, skill_links(card)] }; },
    calculate(self, card, context) { return skill_link(card, context); },
  },
  // ---------------------------------------------------------------- Gen 5, batch 3 (2026-10-29, the owner's "Build batch 3"): 30 jokers, #580-637
  // The batch 1 / 2 rules: prices on the guide's slots (3-stage U $6 / S $8 / S $10; 2-stage C $5 / S $8; single-stage R $7), evolution by
  // rounds (5 each: none of these is an early evolver; Karrablast / Shelmet by 4 rounds held TOGETHER), types from their upstream cards
  // (Escavalier Grass, Durant Metal, Larvesta / Volcarona Fire, Joltik Lightning: pokermon_art_type). Energy raises each joker's main number
  // at the standard share; odds, counts, money, conversions and retriggers are fixed; banks are never retroactive. Art: upstream 3.9.1's own
  // cells (Natdex {18,38}..{12,42}; Deerling / Sawsbuck Gen 5, a cell per season); nothing to deploy. Neither Nacho nor Pokermon+ has any.
  // Ducklett 580 (Water, Common $5): +40 Chips if the hand contains a Flush (`chips` +30%: 52 / 64 / 76). 5 rounds.
  ducklett: {
    name: 'ducklett', poke_sprite391: sprite('Natdex', 18, 38),
    config: { extra: { chips: 40, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'hand_type', 'round_evo'], poke_after: 'gothitelle',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && has_flush(context)) return { message: a_chips(r3(card.ability.extra.chips)), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      return level_evo(self, card, context, 'j_poke_swanna');
    },
  },
  // Swanna 581 (Safari $8): X2 if the hand contains a Flush (`Xmult` +20%: 2.4 / 2.8 / 3.2).
  swanna: {
    name: 'swanna', poke_sprite391: sprite('Natdex', 20, 38),
    config: { extra: { Xmult: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'hand_type'], poke_after: 'ducklett',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult)] }; },
    calculate(self, card, context) {
      if (context.joker_main && has_flush(context)) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Deerling 585 (Grass, Common $5), Seasons: the season follows the Ante (Spring Hearts, Summer Diamonds, Autumn Clubs, Winter Spades); each
  // scored card of its suit +3 Mult (`mult` +40%: 4.2 / 5.4 / 6.6). Each season shows its own 3.9.1 card (Gen 5 sheet). 5 rounds.
  deerling: {
    name: 'deerling', poke_sprite391: sprite('Gen05', 2, 1),
    config: { extra: { mult: 3, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'suit', 'round_evo'], poke_after: 'vanilluxe',
    poke_view_form() { return season_now(); },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const s = season_vars(); return { vars: [r3(card.ability.extra.mult), s.name, s.suit, card.ability.extra.rounds], colours: [s.colour] }; },
    calculate(self, card, context) {
      if (season_card(context)) return { mult: card.ability.extra.mult, card };
      return level_evo(self, card, context, 'j_poke_sawsbuck');
    },
  },
  // Sawsbuck 586 (Safari $8): each scored card of the season's suit X1.2 (`Xmult_multi` +5%: 1.26 / 1.32 / 1.38).
  sawsbuck: {
    name: 'sawsbuck', poke_sprite391: sprite('Gen05', 10, 1),
    config: { extra: { Xmult_multi: 1.2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'suit'], poke_after: 'deerling',
    poke_view_form() { return season_now(); },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const s = season_vars(); return { vars: [r3(card.ability.extra.Xmult_multi), s.name, s.suit], colours: [s.colour] }; },
    calculate(self, card, context) {
      if (season_card(context)) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Emolga 587 (Lightning, Rare $7, single-stage), Static: each scored face card earns $1 (fixed) and gives +2 Mult (`mult` +40%: 2.8 / 3.6 /
  // 4.4).
  emolga: {
    name: 'emolga', poke_sprite391: sprite('Natdex', 2, 39),
    config: { extra: { static_money: 1, mult: 2 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Lightning', gen: 5, blueprint_compat: true,
    attributes: ['money', 'economy', 'mult', 'face'], poke_after: 'sawsbuck',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.static_money, r3(ex.mult)] }; },
    calculate(self, card, context) { return static_face(card, context); },
  },
  // Karrablast 588 (Grass, Common $5): +6 Mult (`mult` +40%: 8.4 / 10.8 / 13.2). The trade pair: evolves only TOGETHER with a Shelmet, after
  // both have been held together 4 rounds (trade_round).
  karrablast: {
    name: 'karrablast', poke_sprite391: sprite('Natdex', 4, 39),
    config: { extra: { mult: 6, together: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'joker', 'trigger_evo'], poke_after: 'emolga',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.together || 0, TRADE_NEED, trade_state(card, 'Shelmet')] }; },
    calculate(self, card, context) {
      trade_round(self, card, context);
      if (context.joker_main) return { message: a_mult(r3(card.ability.extra.mult)), colour: 'MULT', mult_mod: card.ability.extra.mult };
      return undefined;
    },
  },
  // Escavalier 589 (Safari $8): X1.5 (`Xmult` +20%: 1.8 / 2.1 / 2.4); Steel cards held in hand give X1.75 instead of X1.5 (`steel_x`, fixed;
  // the card-level rule: with Registeel / Durant the best one wins).
  escavalier: {
    name: 'escavalier', poke_sprite391: sprite('Natdex', 6, 39),
    config: { extra: { Xmult: 1.5, steel_x: 1.75 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'enhancements'], poke_after: 'karrablast',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.steel_x)] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Foongus 590 (Grass, Common $5): at the end of each shop, 1 in 4 to create a Poke Ball (with room). Odds fixed; Energy-inert, as Amoonguss
  // (neither has a number). 5 rounds.
  foongus: {
    name: 'foongus', poke_sprite391: sprite('Natdex', 8, 39),
    config: { extra: { num: 1, dem: 4, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 5, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['item', 'chance', 'round_evo'], poke_after: 'escavalier',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push({ set: 'Item', key: 'c_poke_pokeball', poke_add_desc: true });
      const ex = card.ability.extra; return { vars: [...get_probability_vars(card, ex.num, ex.dem, 'foongus'), ex.rounds] };
    },
    calculate(self, card, context) { foongus_ball(card, context); return level_evo(self, card, context, 'j_poke_amoonguss'); },
  },
  // Amoonguss 591 (Safari $8): Spore, the Boss Blind's ability is off during the round's first hand (Blind.suspend), back after it.
  amoonguss: {
    name: 'amoonguss', poke_sprite391: sprite('Natdex', 10, 39),
    config: { extra: {} },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 5, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['boss_blind', 'debuff'], poke_after: 'foongus',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [spore_state()] }; },
    remove_from_deck(self, card) {
      // sold, destroyed or debuffed during the suspended first hand, with no other Amoonguss: the Blind comes back at once
      const b = G.GAME && G.GAME.blind;
      // (Gen 8 batch 3: not while a Mr. Rime holds it off for the round's final hand — rime_final_deal)
      const rime = () => G.GAME.current_round.hands_left <= 1 && find_card('j_poke_mrrime').length > 0;
      if (b && b.suspended && !find_card('j_poke_amoonguss').some((j) => j !== card)) G.E_MANAGER.add_event(() => { if (b.suspended && !find_card('j_poke_amoonguss').length && !rime()) b.suspend(false); });
    },
  },
  // Alomomola 594 (Water, Rare $7, single-stage), Healing Heart: the first playing card destroyed each round is copied back into your deck.
  // No number: Energy-inert.
  alomomola: {
    name: 'alomomola', poke_sprite391: sprite('Natdex', 16, 39),
    config: { extra: {} },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 5, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['full_deck', 'destroy_card', 'playing_card', 'generation'], poke_after: 'jellicent',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [heal_state(card)] }; },
    calculate(self, card, context) { healing_heart(card, context); return undefined; },
  },
  // Joltik 595 (Lightning, Common $5): +3 Mult per OTHER Lightning Joker (`mult` +40%: 4.2 / 5.4 / 6.6). 5 rounds.
  joltik: {
    name: 'joltik', poke_sprite391: sprite('Natdex', 18, 39),
    config: { extra: { mult: 3, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Lightning', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'types', 'round_evo'], poke_after: 'alomomola',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = other_lightning(card); return { vars: [r3(ex.mult), n, r3(ex.mult * n), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = r3(card.ability.extra.mult * other_lightning(card)); if (m > 0) return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_galvantula');
    },
  },
  // Galvantula 596 (Safari $8), Electroweb: each Gold card held in hand X1.2 when a hand scores (`Xmult_multi` +5%: 1.26 / 1.32 / 1.38).
  galvantula: {
    name: 'galvantula', poke_sprite391: sprite('Natdex', 20, 39),
    config: { extra: { Xmult_multi: 1.2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Lightning', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'enhancements'], poke_after: 'joltik',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_gold); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) { return electroweb(card, context); },
  },
  // Tynamo 602 (Lightning, Uncommon $6): +1 Mult per Steel card in your full deck (`mult` +40%: 1.4 / 1.8 / 2.2). 5 rounds.
  tynamo: {
    name: 'tynamo', poke_sprite391: sprite('Natdex', 2, 40),
    config: { extra: { mult: 1, rounds: 5 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Lightning', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'full_deck', 'round_evo'], poke_after: 'klinklang',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); const ex = card.ability.extra; return { vars: [r3(ex.mult), r3(ex.mult * steel_in_deck()), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = r3(card.ability.extra.mult * steel_in_deck()); if (m > 0) return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_eelektrik');
    },
  },
  // Eelektrik 603 (Safari $8): each Steel card held in hand +3 Mult (h_mult; `mult` +40%: 4.2 / 5.4 / 6.6). 5 rounds.
  eelektrik: {
    name: 'eelektrik', poke_sprite391: sprite('Natdex', 4, 40),
    config: { extra: { mult: 3, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Lightning', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'round_evo'], poke_after: 'tynamo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); const ex = card.ability.extra; return { vars: [r3(ex.mult), r3(ex.mult * steel_held_count()), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.hand && !context.end_of_round && !context.other_card.debuff && has_enhancement(context.other_card, 'm_steel')) return { h_mult: card.ability.extra.mult, card };
      return level_evo(self, card, context, 'j_poke_eelektross');
    },
  },
  // Eelektross 604 (Safari $10): X1.5, plus X0.1 per Steel card in your full deck (`Xmult` / `Xmult_mod` +20%: 1.8 / 2.1 / 2.4, 0.12 / 0.14 /
  // 0.16).
  eelektross: {
    name: 'eelektross', poke_sprite391: sprite('Natdex', 6, 40),
    config: { extra: { Xmult: 1.5, Xmult_mod: 0.1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Lightning', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'full_deck'], poke_after: 'eelektrik',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult_mod), eelektross_x(card)] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const x = eelektross_x(card); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Cubchoo 613 (Water, Common $5): each scored Glass card +20 Chips (`chips` +30%: 26 / 32 / 38). 5 rounds.
  cubchoo: {
    name: 'cubchoo', poke_sprite391: sprite('Natdex', 24, 40),
    config: { extra: { chips: 20, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'enhancements', 'round_evo'], poke_after: 'haxorus',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_glass); const ex = card.ability.extra; return { vars: [r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) { return glass_chips(card, context) || level_evo(self, card, context, 'j_poke_beartic'); },
  },
  // Beartic 614 (Safari $8), Freeze: at the end of each round the leftmost card held in hand is frozen and stays in your hand into the next
  // round; while frozen it gives X1.5 held (`Xmult_multi` +5%: 1.575 / 1.65 / 1.725); played or discarded, it thaws.
  beartic: {
    name: 'beartic', poke_sprite391: sprite('Natdex', 26, 40),
    config: { extra: { Xmult_multi: 1.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'position', 'playing_card'], poke_after: 'cubchoo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push({ set: 'Other', key: 'poke_design_frozen' }); return { vars: [r3(card.ability.extra.Xmult_multi), card_name(frozen_card(card))] }; },
    calculate(self, card, context) { return freeze(card, context); },
  },
  // Shelmet 616 (Grass, Common $5): +40 Chips (`chips` +30%: 52 / 64 / 76). Evolves only together with a Karrablast (trade_round).
  shelmet: {
    name: 'shelmet', poke_sprite391: sprite('Natdex', 0, 41),
    config: { extra: { chips: 40, together: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'joker', 'trigger_evo'], poke_after: 'cryogonal',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), ex.together || 0, TRADE_NEED, trade_state(card, 'Karrablast')] }; },
    calculate(self, card, context) {
      trade_round(self, card, context);
      if (context.joker_main) return { message: a_chips(r3(card.ability.extra.chips)), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      return undefined;
    },
  },
  // Accelgor 617 (Safari $8): +1 hand and +1 discard each round (fixed), +4 Mult for each hand left (`mult` +40%: 5.6 / 7.2 / 8.8).
  accelgor: {
    name: 'accelgor', poke_sprite391: sprite('Natdex', 2, 41),
    config: { extra: { hands: 1, d_size: 1, mult: 4 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['hands', 'discard', 'mult'], poke_after: 'shelmet',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, ex.d_size, r3(ex.mult), r3(ex.mult * hands_left_now())] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = r3(card.ability.extra.mult * hands_left_now()); if (m > 0) return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return undefined;
    },
    ...hands_discards,
  },
  // Stunfisk 618 (Lightning: its card; Rare $7, single-stage): each discard earns $1, at most $4 a round. Money: Energy-inert.
  stunfisk: {
    name: 'stunfisk', poke_sprite391: sprite('Natdex', 4, 41),
    config: { extra: { static_money: 1, money_cap: 4, static_paid: 0 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Lightning', gen: 5, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['money', 'economy', 'discard'], poke_after: 'accelgor',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.static_money, ex.money_cap, static_paid(card)] }; },
    calculate(self, card, context) { return static_discard(card, context); },
  },
  // Mienfoo 619 (Fighting, Common $5): the highest-ranked scored card retriggers once. Mienshao 620 (Safari $8): the top 2. Retriggers are
  // fixed: Energy-inert. 5 rounds.
  mienfoo: {
    name: 'mienfoo', poke_sprite391: sprite('Natdex', 6, 41),
    config: { extra: { targets: 1, retriggers: 1, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fighting', gen: 5, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['retrigger', 'rank', 'round_evo'], poke_after: 'stunfisk',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.rounds] }; },
    calculate(self, card, context) { return top_retrigger(card, context) || level_evo(self, card, context, 'j_poke_mienshao'); },
  },
  mienshao: {
    name: 'mienshao', poke_sprite391: sprite('Natdex', 8, 41),
    config: { extra: { targets: 2, retriggers: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fighting', gen: 5, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['retrigger', 'rank'], poke_after: 'mienfoo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.targets] }; },
    calculate(self, card, context) { return top_retrigger(card, context); },
  },
  // Druddigon 621 (Dragon, Rare $7, single-stage): each scored King X1.4 (`Xmult_multi` +5%: 1.47 / 1.54 / 1.61).
  druddigon: {
    name: 'druddigon', poke_sprite391: sprite('Natdex', 10, 41),
    config: { extra: { Xmult_multi: 1.4 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Dragon', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'rank', 'face'], poke_after: 'mienshao',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && !has_no_rank(context.other_card) && context.other_card.get_id() === 13) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Bouffalant 626 (Colorless, Rare $7, single-stage), Head Charge: banks X0.5 each time a Blind falls to the round's first hand, up to X4
  // (`charge_Xmult`; gain `Xmult_mod` +20%: 0.6 / 0.7 / 0.8; the X4 cap fixed).
  bouffalant: {
    name: 'bouffalant', poke_sprite391: sprite('Natdex', 20, 41),
    config: { extra: { charge_Xmult: 1, Xmult_mod: 0.5, Xmult_cap: 4 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Colorless', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'scaling'], poke_after: 'bisharp',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), ex.Xmult_cap, r3(ex.charge_Xmult)] }; },
    calculate(self, card, context) {
      head_charge(card, context);
      const x = card.ability.extra.charge_Xmult;
      if (context.joker_main && x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
      return undefined;
    },
  },
  // Rufflet 627 (Colorless, Common $5): +10 Mult during Boss Blinds (`mult` +40%: 14 / 18 / 22). 5 rounds.
  rufflet: {
    name: 'rufflet', poke_sprite391: sprite('Natdex', 22, 41),
    config: { extra: { mult: 10, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Colorless', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'boss_blind', 'round_evo'], poke_after: 'bouffalant',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && boss_now()) return { message: a_mult(r3(card.ability.extra.mult)), colour: 'MULT', mult_mod: card.ability.extra.mult };
      return level_evo(self, card, context, 'j_poke_braviary');
    },
  },
  // Braviary 628 (Safari $8): X2 during Boss Blinds (`Xmult` +20%: 2.4 / 2.8 / 3.2).
  braviary: {
    name: 'braviary', poke_sprite391: sprite('Natdex', 24, 41),
    config: { extra: { Xmult: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'boss_blind'], poke_after: 'rufflet',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult)] }; },
    calculate(self, card, context) {
      if (context.joker_main && boss_now()) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Heatmor 631 (Fire, Rare $7, single-stage): +4 Mult per discard used this round (`mult` +40%: 5.6 / 7.2 / 8.8); with Durant, banks X0.1
  // each end of round (`ant_Xmult`; gain `Xmult_mod` +20%: 0.12 / 0.14 / 0.16), which it gives from then on.
  heatmor: {
    name: 'heatmor', poke_sprite391: sprite('Natdex', 0, 42),
    config: { extra: { mult: 4, ant_Xmult: 1, Xmult_mod: 0.1 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Fire', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'discard', 'scaling'], poke_after: 'braviary',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.mult), r3(ex.mult * discards_used()), r3(ex.Xmult_mod), r3(ex.ant_Xmult), rivals() ? 'active' : 'needs Durant'] };
    },
    calculate(self, card, context) { return heatmor_calc(card, context); },
  },
  // Durant 632 (Metal, Rare $7, single-stage): Steel cards held in hand give X1.75 instead of X1.5 (`Xmult_multi` +5%: 1.8375 / 1.925 /
  // 2.0125; the card-level rule, steel_rule_x: never stacking with Escavalier / Registeel, the best wins). With Heatmor, Heatmor grows.
  durant: {
    name: 'durant', poke_sprite391: sprite('Natdex', 2, 42),
    config: { extra: { Xmult_multi: 1.75 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Metal', gen: 5, blueprint_compat: false,
    attributes: ['xmult', 'enhancements'], poke_after: 'heatmor',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); return { vars: [r3(card.ability.extra.Xmult_multi), find_card('j_poke_heatmor').length ? 'active' : 'needs Heatmor'] }; },
  },
  // Larvesta 636 (Fire, Common $5): +5 Mult, doubled while it's sunny (`mult` +40%: 7 / 9 / 11, sunny 14 / 18 / 22). 5 rounds.
  larvesta: {
    name: 'larvesta', poke_sprite391: sprite('Natdex', 10, 42),
    config: { extra: { mult: 5, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fire', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'hand_drawn', 'round_evo'], poke_after: 'hydreigon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), sun_state(card), ex.rounds] }; },
    calculate(self, card, context) {
      if (sun_read(card, context)) return undefined;
      if (context.joker_main) { const m = r3(card.ability.extra.mult * (cherrim_sunny(card) ? 2 : 1)); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_volcarona');
    },
  },
  // Volcarona 637 (Safari $8): while held it's always sunny (cherrim_sunny, Castform's first deal); each Fire Joker, itself included, X1.25
  // (`Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375).
  volcarona: {
    name: 'volcarona', poke_sprite391: sprite('Natdex', 12, 42),
    config: { extra: { Xmult_multi: 1.25 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'types', 'joker', 'hand_drawn'], poke_after: 'larvesta',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = fire_count(card); return { vars: [r3(ex.Xmult_multi), n, r3(Math.pow(ex.Xmult_multi, n))] }; },
    calculate(self, card, context) {
      if (context.other_joker && fire_joker(context.other_joker)) {
        const x = r3(card.ability.extra.Xmult_multi);
        G.E_MANAGER.add_event(() => { context.other_joker.juice_up(0.5, 0.5); });
        return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
      }
      return undefined;
    },
  },
  // ---------------------------------------------------------------- Gen 6, batch 1 (the owner's "go ahead", 2026-11-02; contentRev 61)
  // 15 jokers, #661-678. Prices by the DESIGN_GUIDE slots (3-stage U $6 / S $8 / S $10, 2-stage C $5 / S $8, single-stage R $7); evolution by
  // rounds (4 for an early evolver, else 5). Types = the cards'. Energy raises each joker's main number at the standard share; retriggers,
  // hand size, Foresight and the conversions are fixed; a stage with no number carries its evolution's field ("Energy carries to ...").
  // Art: upstream 3.9.1's own cells (Natdex {0..8,44}, {22..28,44}, {2,45}; Gen 6 sheet: Vivillon's 20 patterns, the Flabébé line's five
  // colours, Furfrou's trims, Meowstic Male / Female); nothing to deploy. Neither Nacho nor Pokermon+ has any of them.
  // Fletchling 661 (Colorless, Uncommon $6), Gale Wings: +8 Mult on the round's first hand (`mult` +40%: 11.2 / 14.4 / 17.6). Colorless, so
  // Starly's flock counts it. 4 rounds.
  fletchling: {
    name: 'fletchling', poke_sprite391: sprite('Natdex', 0, 44),
    config: { extra: { mult: 8, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Colorless', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'round_evo'], poke_after: 'diggersby',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), spark_state(), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && spark_on()) return { message: a_mult(r3(card.ability.extra.mult)), colour: 'MULT', mult_mod: card.ability.extra.mult };
      return level_evo(self, card, context, 'j_poke_fletchinder');
    },
  },
  // Fletchinder 662 (Fire: its card; Safari $8): X1.5 on the round's first hand (`Xmult` +20%: 1.8 / 2.1 / 2.4). 5 rounds.
  fletchinder: {
    name: 'fletchinder', poke_sprite391: sprite('Natdex', 2, 44),
    config: { extra: { Xmult: 1.5, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'round_evo'], poke_after: 'fletchling',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), spark_state(), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && spark_on()) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return level_evo(self, card, context, 'j_poke_talonflame');
    },
  },
  // Talonflame 663 (Safari $10): X2.5 on the round's first hand (`Xmult` +20%: 3 / 3.5 / 4), and on that hand its first scored card retriggers
  // once (`retriggers`, fixed).
  talonflame: {
    name: 'talonflame', poke_sprite391: sprite('Natdex', 4, 44),
    config: { extra: { Xmult: 2.5, retriggers: 1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fire', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'retrigger'], poke_after: 'fletchinder',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult), spark_state()] }; },
    calculate(self, card, context) {
      const r = gale_retrigger(card, context);
      if (r) return r;
      if (context.joker_main && spark_on()) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Scatterbug 664 (Grass, Uncommon $6): each scored Wild card +4 Mult (`mult` +40%: 5.6 / 7.2 / 8.8). 4 rounds.
  scatterbug: {
    name: 'scatterbug', poke_sprite391: sprite('Natdex', 6, 44),
    config: { extra: { mult: 4, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Grass', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'round_evo'], poke_after: 'talonflame',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_wild); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (wild_scored(context)) return { mult: card.ability.extra.mult, card };
      return level_evo(self, card, context, 'j_poke_spewpa');
    },
  },
  // Spewpa 665 (Safari $8): when a Blind is selected, 1 random UNENHANCED card of the full deck becomes Wild (Sewaddle's tailor, its own seed;
  // none unenhanced: nothing; Blueprint copies it). Carries Vivillon's `Xmult_multi` ("Energy carries to Vivillon"). 4 rounds.
  spewpa: {
    name: 'spewpa', poke_sprite391: sprite('Natdex', 8, 44),
    config: { extra: { Xmult_multi: 1.3, rounds: 4 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 6, blueprint_compat: true,
    attributes: ['enhancements', 'modify_card', 'full_deck', 'round_evo'], poke_after: 'scatterbug',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_wild); return { vars: [card.ability.extra.rounds] }; },
    calculate(self, card, context) { tailor(card, context, ['m_wild'], 'poke_spewpa_wild'); return level_evo(self, card, context, 'j_poke_vivillon'); },
  },
  // Vivillon 666 (Safari $10): Spewpa's conversion, and each scored Wild card X1.3 (`Xmult_multi` +5%: 1.365 / 1.43 / 1.495). A pattern of 20,
  // rolled once (VIVILLON_PATTERNS), each its own 3.9.1 card.
  vivillon: {
    name: 'vivillon', poke_sprite391: sprite('Gen06', 2, 0),
    config: { extra: { Xmult_multi: 1.3 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Grass', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'modify_card', 'full_deck'], poke_after: 'spewpa',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_wild); return { vars: [r3(card.ability.extra.Xmult_multi), card.ability.extra.form || 1, VIVILLON_PATTERNS] }; },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.form = 1 + Math.floor(pseudorandom(pseudoseed('vivillon_pattern')) * VIVILLON_PATTERNS);
    },
    calculate(self, card, context) {
      tailor(card, context, ['m_wild'], 'poke_spewpa_wild');
      if (wild_scored(context)) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Flabébé 669 (Fairy, Uncommon $6), Garden Queen: each scored Queen +4 Mult (`mult` +40%: 5.6 / 7.2 / 8.8). A flower colour rolled once
  // (FLOWERS), kept through the line, each its own 3.9.1 card. 4 rounds.
  flabebe: {
    name: 'flabebe', poke_sprite391: sprite('Gen06', 10, 3),
    config: { extra: { mult: 4, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Fairy', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'rank', 'face', 'round_evo'], poke_after: 'pyroar',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), FLOWER_NAME[flower_of(card)], ex.rounds] }; },
    set_ability(self, card, initial) { if (initial) card.ability.extra.form = pseudorandom_element(FLOWERS, pseudoseed('flabebe_flower'))[0]; },
    calculate(self, card, context) {
      if (queen_scored(context)) return { mult: card.ability.extra.mult, card };
      return level_evo(self, card, context, 'j_poke_floette');
    },
  },
  // Floette 670 (Safari $8): scored Queens retrigger once (`retriggers`, fixed). Carries Florges' `Xmult_multi` ("Energy carries to Florges").
  // 5 rounds.
  floette: {
    name: 'floette', poke_sprite391: sprite('Gen06', 8, 4),
    config: { extra: { retriggers: 1, Xmult_multi: 1.25, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fairy', gen: 6, blueprint_compat: true,
    attributes: ['retrigger', 'rank', 'face', 'round_evo'], poke_after: 'flabebe',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [FLOWER_NAME[flower_of(card)], ex.rounds] }; },
    set_ability(self, card, initial) { if (initial) card.ability.extra.form = pseudorandom_element(FLOWERS, pseudoseed('flabebe_flower'))[0]; },
    calculate(self, card, context) {
      if (queen_scored(context, 'repetition')) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      return level_evo(self, card, context, 'j_poke_florges');
    },
  },
  // Florges 671 (Safari $10): scored Queens retrigger twice (`retriggers` 2, fixed), and each gives X1.25 (`Xmult_multi` +5%: 1.3125 / 1.375 /
  // 1.4375), every time it scores (X1.25 x3 a Queen).
  florges: {
    name: 'florges', poke_sprite391: sprite('Gen06', 8, 5),
    config: { extra: { retriggers: 2, Xmult_multi: 1.25 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fairy', gen: 6, blueprint_compat: true,
    attributes: ['retrigger', 'xmult', 'rank', 'face'], poke_after: 'floette',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.retriggers, r3(ex.Xmult_multi), FLOWER_NAME[flower_of(card)]] }; },
    set_ability(self, card, initial) { if (initial) card.ability.extra.form = pseudorandom_element(FLOWERS, pseudoseed('flabebe_flower'))[0]; },
    calculate(self, card, context) {
      if (queen_scored(context, 'repetition')) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      if (queen_scored(context)) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Skiddo 672 (Grass, Common $5): +30 Chips, plus +10 for each OTHER Grass Joker (`chips` / `chips1` +30%: 39 / 48 / 57 and 13 / 16 / 19). 5 rounds.
  skiddo: {
    name: 'skiddo', poke_sprite391: sprite('Natdex', 22, 44),
    config: { extra: { chips: 30, chips1: 10, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 6, blueprint_compat: true,
    attributes: ['chips', 'types', 'round_evo'], poke_after: 'florges',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.chips1), grass_others(card), goat_chips(card), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const c = goat_chips(card); return { message: a_chips(c), colour: 'CHIPS', chip_mod: c }; }
      return level_evo(self, card, context, 'j_poke_gogoat');
    },
  },
  // Gogoat 673 (Safari $8): +1 hand size (fixed; Bulbasaur's add / remove); +60 Chips, plus +20 for each other Grass Joker (78 / 96 / 114 and
  // 26 / 32 / 38).
  gogoat: {
    name: 'gogoat', poke_sprite391: sprite('Natdex', 24, 44),
    config: { extra: { h_size: 1, chips: 60, chips1: 20 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 6, blueprint_compat: true,
    attributes: ['chips', 'types', 'hand_size'], poke_after: 'skiddo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, r3(ex.chips), r3(ex.chips1), grass_others(card), goat_chips(card)] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const c = goat_chips(card); return { message: a_chips(c), colour: 'CHIPS', chip_mod: c }; }
      return undefined;
    },
    ...hand_size,
  },
  // Pancham 674 (Fighting, Common $5), Iron Fist: each scored face card +3 Mult (`mult` +40%: 4.2 / 5.4 / 6.6). Evolves after 5 rounds, but only
  // at an end of round while you hold an undebuffed Dark Joker (pancham_evo); otherwise it waits.
  pancham: {
    name: 'pancham', poke_sprite391: sprite('Natdex', 26, 44),
    config: { extra: { mult: 3, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fighting', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'face', 'round_evo', 'condition_evo'], poke_after: 'gogoat',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.mult), ex.rounds, dark_held(card) ? 'has a Dark Joker' : 'needs a Dark Joker'] };
    },
    calculate(self, card, context) {
      if (face_scored(context)) return { mult: card.ability.extra.mult, card };
      return pancham_evo(self, card, context);
    },
  },
  // Pangoro 675 (Fighting: its card; Safari $8): each scored face card X1.3 (`Xmult_multi` +5%: 1.365 / 1.43 / 1.495).
  pangoro: {
    name: 'pangoro', poke_sprite391: sprite('Natdex', 28, 44),
    config: { extra: { Xmult_multi: 1.3 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fighting', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'face'], poke_after: 'pancham',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (face_scored(context)) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Furfrou 676 (Colorless, Rare $7, single-stage), Trim: a new trim each Ante (TRIMS; never the same twice running), its suit's scored cards
  // +20 Chips and +4 Mult each (`chips` +30%: 26 / 32 / 38; `mult` +40%: 5.6 / 7.2 / 8.8). Each trim draws its own 3.9.1 card.
  furfrou: {
    name: 'furfrou', poke_sprite391: sprite('Gen06', 6, 6),
    config: { extra: { chips: 20, mult: 4 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Colorless', gen: 6, blueprint_compat: true,
    attributes: ['chips', 'mult', 'suit'], poke_after: 'pangoro',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, t = trim_of(card);
      return { vars: [r3(ex.chips), r3(ex.mult), t ? TRIMS[t].name : 'picked when obtained', t ? localize(TRIMS[t].suit, 'suits_plural') : ''], colours: [t ? TRIMS[t].suit : 'inactive'] };
    },
    add_to_deck(self, card) { if (!trim_of(card)) furfrou_trim(card); },
    calculate(self, card, context) {
      // (a new Ante: queued after ease_ante's own event, so the pick is seeded by the new Ante)
      if (context.ante_change && !context.blueprint) {
        G.E_MANAGER.add_event(() => {
          const t = furfrou_trim(card);
          card_eval_status_text(card, 'extra', null, null, null, { message: TRIMS[t].name + '!', colour: 'FILTER' });
        });
        return undefined;
      }
      if (trim_scored(card, context)) return { chips: card.ability.extra.chips, mult: card.ability.extra.mult, card };
      return undefined;
    },
  },
  // Espurr 677 (Psychic, Common $5): +1 Foresight (fixed). Carries Meowstic's `Xmult_mod` ("Energy carries to Meowstic": re-applied to both of
  // a Female's fields; not its `Xmult` too, which evolution would copy over AND re-energize, Fennekin's way). 5 rounds.
  espurr: {
    name: 'espurr', poke_sprite391: sprite('Natdex', 2, 45),
    config: { extra: { scry: 1, Xmult_mod: 0.25, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Psychic', gen: 6, blueprint_compat: false,
    attributes: ['foresight', 'round_evo'], poke_after: 'furfrou',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, ex.rounds] }; },
    calculate(self, card, context) { return level_evo(self, card, context, 'j_poke_meowstic'); },
    ...scry,
  },
  // Meowstic 678 (Safari $8): its gender rolled when it evolves (or is created), stored, its own 3.9.1 card. Male, Prankster: at end of round
  // a random Tarot (must have room; not Blueprint); no Energy. Female: X1.5, plus X0.25 for each Tarot held (`Xmult` / `Xmult_mod` +20%: 1.8 /
  // 2.1 / 2.4 and 0.3 / 0.35 / 0.4).
  meowstic: {
    name: 'meowstic', poke_sprite391: sprite('Gen06', 2, 8),
    config: { extra: { Xmult: 1.5, Xmult_mod: 0.25 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'tarot', 'generation'], poke_after: 'espurr',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      if (!meow_female(card)) return { vars: [], key: 'j_poke_meowstic' };
      return { vars: [r3(ex.Xmult), r3(ex.Xmult_mod), tarots_held(), meow_x(card)], key: 'j_poke_meowstic_female' };
    },
    set_ability(self, card, initial) {
      if (!initial) return;
      const ex = card.ability.extra;
      ex.form = pseudorandom(pseudoseed('meowstic_gender')) < 0.5 ? 'female' : 'male';
      if (ex.form === 'male') { delete ex.Xmult; delete ex.Xmult_mod; }
    },
    calculate(self, card, context) {
      prankster_tarot(card, context);
      if (context.joker_main && meow_female(card)) { const x = meow_x(card); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // ---------------------------------------------------------------- Gen 6, batch 2 (contentRev 62; the owner's "Yes", 2026-11-02), #682-715
  // Spritzee 682 (Fairy, Common $5), Healing Aroma: each scored Lucky card earns $1 (`aroma_money`, fixed: Energy-inert). 5 rounds.
  spritzee: {
    name: 'spritzee', poke_sprite391: sprite('Natdex', 12, 45),
    config: { extra: { aroma_money: 1, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fairy', gen: 6, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['money', 'economy', 'enhancements', 'round_evo'], poke_after: 'aegislash',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); const ex = card.ability.extra; return { vars: [ex.aroma_money, ex.rounds] }; },
    calculate(self, card, context) { return healing_aroma(card, context) || level_evo(self, card, context, 'j_poke_aromatisse'); },
  },
  // Aromatisse 683 (Safari $8): each scored Lucky card earns $2, and Aroma Veil: Lucky cards' odds +1 (Pidove's Super Luck: the numerator
  // of both rolls, before Oops! doubles it; stacks with Pidove's line and other copies, +1 each). Money and odds fixed: Energy-inert.
  aromatisse: {
    name: 'aromatisse', poke_sprite391: sprite('Natdex', 14, 45),
    config: { extra: { aroma_money: 2, lucky_odds: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fairy', gen: 6, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['money', 'economy', 'chance', 'enhancements'], poke_after: 'spritzee',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); const ex = card.ability.extra; return { vars: [ex.aroma_money, ex.lucky_odds, ...lucky_odds_vars(card)] }; },
    calculate(self, card, context) { return super_luck(card, context) || healing_aroma(card, context); },
  },
  // Swirlix 684 (Fairy, Common $5), Sweet Veil: permanently +1 Mult per Tarot used (`sweet_mult` banked; gain `mult_mod` +20%: 1.2 / 1.4 /
  // 1.6). 5 rounds; the bank carries into Slurpuff.
  swirlix: {
    name: 'swirlix', poke_sprite391: sprite('Natdex', 16, 45),
    config: { extra: { sweet_mult: 0, mult_mod: 1, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fairy', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'tarot', 'round_evo'], poke_after: 'aromatisse',
    poke_custom_values_to_keep: ['sweet_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.sweet_mult), ex.rounds] }; },
    calculate(self, card, context) { return sweet_veil(card, context) || level_evo(self, card, context, 'j_poke_slurpuff'); },
  },
  // Slurpuff 685 (Safari $8): +2 Mult per Tarot used (`mult_mod` +20%: 2.4 / 2.8 / 3.2) on Swirlix's bank, and +1 consumable slot (fixed).
  slurpuff: {
    name: 'slurpuff', poke_sprite391: sprite('Natdex', 18, 45),
    config: { extra: { sweet_mult: 0, mult_mod: 2, card_limit: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fairy', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'tarot', 'consumable_slot'], poke_after: 'swirlix',
    poke_custom_values_to_keep: ['sweet_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.card_limit, r3(ex.mult_mod), r3(ex.sweet_mult)] }; },
    calculate(self, card, context) { return sweet_veil(card, context); },
    ...sweet_slot,
  },
  // Inkay 686 (Dark, Common $5): each scored 2, 3, 4 or 5 gives +4 Mult (`mult` +40%: 5.6 / 7.2 / 8.8). 5 rounds.
  inkay: {
    name: 'inkay', poke_sprite391: sprite('Natdex', 20, 45),
    config: { extra: { mult: 4, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'rank', 'round_evo'], poke_after: 'slurpuff',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { return inkay_low(card, context) || level_evo(self, card, context, 'j_poke_malamar'); },
  },
  // Malamar 687 (Safari $8), Topsy-Turvy: every scored card gives the Chips of its flipped rank instead of its own (the chip_bonus hook,
  // malamar_chip_bonus). r73 (the owner's buff): each scored 2, 3, 4 or 5 also gives X1.25 (`Xmult_multi` +5%: 1.313 / 1.375 / 1.438;
  // malamar_low_x). r62-r72 it had no number (Energy-inert): on those rules set_ability deletes the field, so an Energy skips it as before.
  // Blueprint: the flip is a rule (nothing to copy), and it still copies nothing.
  malamar: {
    name: 'malamar', poke_sprite391: sprite('Natdex', 22, 45),
    config: { extra: { Xmult_multi: 1.25 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 6, blueprint_compat: false,
    attributes: ['chips', 'xmult', 'rank', 'modify_card'], poke_after: 'inkay',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const x = card.ability.extra.Xmult_multi; return { vars: [r3(typeof x === 'number' ? x : self.config.extra.Xmult_multi)] }; },
    set_ability(self, card) { if (!malamar_x73()) delete card.ability.extra.Xmult_multi; },
    calculate(self, card, context) { return malamar_low_x(card, context); },
  },
  // Binacle 688 (Earth, Common $5): each scored 7 gives +20 Chips (`chips` +30%: 26 / 32 / 38). 5 rounds.
  binacle: {
    name: 'binacle', poke_sprite391: sprite('Natdex', 24, 45),
    config: { extra: { chips: 20, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Earth', gen: 6, blueprint_compat: true,
    attributes: ['chips', 'rank', 'round_evo'], poke_after: 'malamar',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) { return seven_rocks(card, context, false) || level_evo(self, card, context, 'j_poke_barbaracle'); },
  },
  // Barbaracle 689 (Safari $8): each scored 7 gives +20 Chips and X1.3 (`chips` +30%: 26 / 32 / 38; `Xmult_multi` +5%: 1.365 / 1.43 / 1.495).
  barbaracle: {
    name: 'barbaracle', poke_sprite391: sprite('Natdex', 26, 45),
    config: { extra: { chips: 20, Xmult_multi: 1.3 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 6, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'rank'], poke_after: 'binacle',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) { return seven_rocks(card, context, true); },
  },
  // Skrelp 690 (Dark, Common $5), Poison Point: when a Blind is selected, 1 random deck card becomes a Hazard card (unenhanced first); +3
  // Mult per Hazard card in the full deck (`mult` +40%: 4.2 / 5.4 / 6.6). 5 rounds.
  skrelp: {
    name: 'skrelp', poke_sprite391: sprite('Natdex', 28, 45),
    config: { extra: { mult: 3, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'hazards', 'modify_card', 'full_deck', 'round_evo'], poke_after: 'barbaracle',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_hazard); const ex = card.ability.extra; return { vars: [r3(ex.mult), r3(ex.mult * hazards_in_deck()), ex.rounds] }; },
    calculate(self, card, context) {
      skrelp_poison(card, context);
      if (context.joker_main) { const m = r3(card.ability.extra.mult * hazards_in_deck()); return m > 0 ? { message: a_mult(m), colour: 'MULT', mult_mod: m } : undefined; }
      return level_evo(self, card, context, 'j_poke_dragalge');
    },
  },
  // Dragalge 691 (Safari $8): the same conversion; each Hazard card held in hand gives X1.2 (`Xmult_multi` +5%: 1.26 / 1.32 / 1.38). Its
  // Stage 1 swaps Skrelp's deck count for the held X (the spec's "the same conversion, and ...").
  dragalge: {
    name: 'dragalge', poke_sprite391: sprite('Natdex', 0, 46),
    config: { extra: { Xmult_multi: 1.2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'hazards', 'modify_card', 'full_deck'], poke_after: 'skrelp',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_hazard); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) { skrelp_poison(card, context); return hazard_held_x(card, context); },
  },
  // Tyrunt 696 (Dragon: its card; Common $5), Ancient Kings: 1+ +5 Mult (`mult` +40%: 7 / 9 / 11), 2+ X1.25 (`Xmult` +20%: 1.5 / 1.75 / 2),
  // 3+ every scored King retriggers once (fixed). Evolves after its 3+ tier fires 5 times.
  tyrunt: {
    name: 'tyrunt', poke_sprite391: sprite('Natdex', 10, 46),
    config: { evo_rqmt: 5, extra: { rank: 'King', mult: 5, Xmult: 1.25, retriggers: 1, third_times: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dragon', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'retrigger', 'ancient', 'rank', 'face', 'trigger_evo'], poke_after: 'dragalge',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); ancient_tip(info_queue, card.ability.extra.rank);
      const ex = card.ability.extra;
      return { vars: [localize(ex.rank, 'ranks'), r3(ex.mult), r3(ex.Xmult), Math.max(0, self.config.evo_rqmt - (ex.third_times || 0))] };
    },
    calculate(self, card, context) {
      return ancient_kings(card, context) || scaling_evo(self, card, context, 'j_poke_tyrantrum', card.ability.extra.third_times || 0, self.config.evo_rqmt);
    },
  },
  // Tyrantrum 697 (Safari $8): Tyrunt's tiers, the same numbers, and 4+ X2 (`Xmult2` +20%: 2.4 / 2.8 / 3.2).
  tyrantrum: {
    name: 'tyrantrum', poke_sprite391: sprite('Natdex', 12, 46),
    config: { extra: { rank: 'King', mult: 5, Xmult: 1.25, retriggers: 1, Xmult2: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dragon', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'retrigger', 'ancient', 'rank', 'face'], poke_after: 'tyrunt',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); ancient_tip(info_queue, card.ability.extra.rank);
      const ex = card.ability.extra;
      return { vars: [localize(ex.rank, 'ranks'), r3(ex.mult), r3(ex.Xmult), r3(ex.Xmult2)] };
    },
    calculate(self, card, context) { return ancient_kings(card, context); },
  },
  // Amaura 698 (Earth: its card; Common $5), Ancient Queens: 1+ +40 Chips (`chips` +30%: 52 / 64 / 76), 2+ the leftmost scored Queen that
  // isn't Glass becomes Glass (before scoring), 3+ earn $3 (`ancient_money`, fixed). Evolves after its 3+ tier fires 5 times.
  amaura: {
    name: 'amaura', poke_sprite391: sprite('Natdex', 14, 46),
    config: { evo_rqmt: 5, extra: { rank: 'Queen', chips: 40, ancient_money: 3, third_times: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Earth', gen: 6, blueprint_compat: true,
    attributes: ['chips', 'money', 'ancient', 'rank', 'face', 'modify_card', 'enhancements', 'trigger_evo'], poke_after: 'tyrantrum',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); ancient_tip(info_queue, card.ability.extra.rank); info_queue.push(P_CENTERS.m_glass);
      const ex = card.ability.extra;
      return { vars: [localize(ex.rank, 'ranks'), r3(ex.chips), ex.ancient_money, Math.max(0, self.config.evo_rqmt - (ex.third_times || 0))] };
    },
    calculate(self, card, context) {
      return ancient_queens(card, context) || scaling_evo(self, card, context, 'j_poke_aurorus', card.ability.extra.third_times || 0, self.config.evo_rqmt);
    },
  },
  // Aurorus 699 (Safari $8): Amaura's tiers, the same numbers, and 4+ X2 (`Xmult2` +20%: 2.4 / 2.8 / 3.2).
  aurorus: {
    name: 'aurorus', poke_sprite391: sprite('Natdex', 16, 46),
    config: { extra: { rank: 'Queen', chips: 40, ancient_money: 3, Xmult2: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 6, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'money', 'ancient', 'rank', 'face', 'modify_card', 'enhancements'], poke_after: 'amaura',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); ancient_tip(info_queue, card.ability.extra.rank); info_queue.push(P_CENTERS.m_glass);
      const ex = card.ability.extra;
      return { vars: [localize(ex.rank, 'ranks'), r3(ex.chips), ex.ancient_money, r3(ex.Xmult2)] };
    },
    calculate(self, card, context) { return ancient_queens(card, context); },
  },
  // Hawlucha 701 (Fighting, Rare $7, single-stage), Flying Press: the first and the last scored card each retrigger once (a lone scored card
  // once in all). Retriggers fixed: Energy-inert.
  hawlucha: {
    name: 'hawlucha', poke_sprite391: sprite('Natdex', 20, 46),
    config: { extra: { retriggers: 1 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Fighting', gen: 6, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['retrigger'], poke_after: 'sylveon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [] }; },
    calculate(self, card, context) { return flying_press(card, context); },
  },
  // Klefki 707 (Metal, Rare $7, single-stage), Key Ring: X1, plus X0.25 for each Voucher redeemed this run (`Xmult_mod` +20%: 0.3 / 0.35 /
  // 0.4; read from the run's record, so it is never banked: Energy raises every Voucher's share at once).
  klefki: {
    name: 'klefki', poke_sprite391: sprite('Natdex', 2, 47),
    config: { extra: { Xmult_mod: 0.25 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Metal', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'shop'], poke_after: 'hawlucha',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), vouchers_redeemed(), key_ring_x(card)] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const x = key_ring_x(card); return x > 1 ? { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x } : undefined; }
      return undefined;
    },
  },
  // Phantump 708 (Grass: its card; Common $5), Forest's Curse: permanently +3 Mult per playing card destroyed (`curse_mult` banked; gain
  // `mult_mod` +20%: 3.6 / 4.2 / 4.8). 5 rounds; the bank carries into Trevenant.
  phantump: {
    name: 'phantump', poke_sprite391: sprite('Natdex', 4, 47),
    config: { extra: { curse_mult: 0, mult_mod: 3, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'destroy_card', 'round_evo'], poke_after: 'klefki',
    poke_custom_values_to_keep: ['curse_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.curse_mult), ex.rounds] }; },
    calculate(self, card, context) { return forest_curse(card, context, false) || level_evo(self, card, context, 'j_poke_trevenant'); },
  },
  // Trevenant 709 (Safari $8): +5 Mult per card destroyed (`mult_mod` +20%: 6 / 7 / 8) on Phantump's bank; each destroyed card plants a Seed
  // (a random unenhanced deck card becomes a Seed card).
  trevenant: {
    name: 'trevenant', poke_sprite391: sprite('Natdex', 6, 47),
    config: { extra: { curse_mult: 0, mult_mod: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'destroy_card', 'modify_card', 'enhancements'], poke_after: 'phantump',
    poke_custom_values_to_keep: ['curse_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_seed); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.curse_mult)] }; },
    calculate(self, card, context) { return forest_curse(card, context, true); },
  },
  // Bergmite 712 (Water: its card; Common $5): +50 Chips (`chips` +30%: 65 / 80 / 95). 5 rounds.
  bergmite: {
    name: 'bergmite', poke_sprite391: sprite('Natdex', 12, 47),
    config: { extra: { chips: 50, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 6, blueprint_compat: true,
    attributes: ['chips', 'round_evo'], poke_after: 'gourgeist',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_chips(r3(card.ability.extra.chips)), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      return level_evo(self, card, context, 'j_poke_avalugg');
    },
  },
  // Avalugg 713 (Safari $8), Iceberg: +150 Chips (`chips` +30%: 195 / 240 / 285) and X1.5 on the round's final hand (`Xmult` +20%: 1.8 /
  // 2.1 / 2.4).
  avalugg: {
    name: 'avalugg', poke_sprite391: sprite('Natdex', 14, 47),
    config: { extra: { chips: 150, Xmult: 1.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 6, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'hands'], poke_after: 'bergmite',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.Xmult), G.GAME && G.GAME.facing_blind && G.GAME.current_round.hands_left <= 1 ? 'Active!' : 'Inactive'] }; },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const ex = card.ability.extra, r = { chip_mod: ex.chips, message: a_chips(r3(ex.chips)), colour: 'CHIPS' };
      if (G.GAME.facing_blind && final_hand()) { r.Xmult_mod = ex.Xmult; r.message = a_xmult(r3(ex.Xmult)); r.colour = 'XMULT'; }
      return r;
    },
  },
  // Noibat 714 (Dragon, Common $5), Supersonic: +1 hand size (fixed); Glass cards break twice as often (r69: each copy doubles the
  // numerator, stacking as Oops! does: 1 in 2, two copies always; fixed); each Glass card that breaks permanently gives it +2 Mult (`bat_mult` banked; gain `mult_mod` +20%: 2.4 / 2.8 / 3.2). 5 rounds.
  noibat: {
    name: 'noibat', poke_sprite391: sprite('Natdex', 16, 47),
    config: { extra: { h_size: 1, bat_mult: 0, mult_mod: 2, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dragon', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'hand_size', 'chance', 'enhancements', 'round_evo'], poke_after: 'avalugg',
    poke_custom_values_to_keep: ['bat_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_glass); const ex = card.ability.extra; return { vars: [ex.h_size, ...glass_odds_vars(card), r3(ex.mult_mod), r3(ex.bat_mult), ex.rounds] }; },
    calculate(self, card, context) { return supersonic(card, context) || boomburst(card, context, false) || level_evo(self, card, context, 'j_poke_noivern'); },
    ...hand_size,
  },
  // Noivern 715 (Safari $8), Boomburst: +2 hand size, Glass still doubled (stacking with every other Noibat / Noivern); each Glass card that breaks permanently gives it X0.1 (`bat_Xmult`
  // banked from X1; gain `Xmult_mod` +20%: 0.12 / 0.14 / 0.16; Noibat's Mult kept and still given), and turns a random deck card Glass.
  noivern: {
    name: 'noivern', poke_sprite391: sprite('Natdex', 18, 47),
    config: { extra: { h_size: 2, bat_mult: 0, bat_Xmult: 1, Xmult_mod: 0.1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dragon', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'scaling', 'hand_size', 'chance', 'enhancements', 'modify_card'], poke_after: 'noibat',
    poke_custom_values_to_keep: ['bat_mult', 'bat_Xmult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_glass); const ex = card.ability.extra; return { vars: [ex.h_size, ...glass_odds_vars(card), r3(ex.Xmult_mod), r3(ex.bat_Xmult), r3(ex.bat_mult)] }; },
    calculate(self, card, context) { return supersonic(card, context) || boomburst(card, context, true); },
    ...hand_size,
  },
  // ---------------------------------------------------------------- Gen 7, batch 1 (contentRev 64; the owner's "Yes build it", 2026-11-02), #731-756
  // Pikipek 731 (Colorless, Uncommon $6; 3-stage), Multi-hit: each hand hits 2-5 times (seeded, Gen 5+ odds 35/35/15/15%), +3 Mult per
  // hit (`mult` +40%: 4.2 / 5.4 / 6.6 a hit; the hit count fixed). 4 rounds (an early evolver).
  pikipek: {
    name: 'pikipek', poke_sprite391: sprite('Natdex', 20, 48),
    config: { extra: { mult: 3, hits: 0, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Colorless', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'chance', 'round_evo'], poke_after: 'primarina',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.hits || '-', ex.rounds] }; },
    calculate(self, card, context) { return multi_hit(card, context) || level_evo(self, card, context, 'j_poke_trumbeak'); },
  },
  // Trumbeak 732 (Safari $8): 2-5 hits, +5 Mult per hit (`mult` +40%: 7 / 9 / 11). 5 rounds.
  trumbeak: {
    name: 'trumbeak', poke_sprite391: sprite('Natdex', 22, 48),
    config: { extra: { mult: 5, hits: 0, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'chance', 'round_evo'], poke_after: 'pikipek',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.hits || '-', ex.rounds] }; },
    calculate(self, card, context) { return multi_hit(card, context) || level_evo(self, card, context, 'j_poke_toucannon'); },
  },
  // Toucannon 733 (Safari $10), Skill Link: always 5 hits, each X1.1 (`Xmult_multi` +5%, a per-hit X: 1.155 / 1.21 / 1.265 a hit), scored
  // as ONE X of the five: X1.611 (X2.061 / X2.594 / X3.236 energized).
  toucannon: {
    name: 'toucannon', poke_sprite391: sprite('Natdex', 24, 48),
    config: { extra: { Xmult_multi: 1.1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Colorless', gen: 7, blueprint_compat: true,
    attributes: ['xmult'], poke_after: 'trumbeak',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_multi), MULTI_HIT_MAX, r3(skill_link_x(card))] }; },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const x = skill_link_x(card);
      return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
    },
  },
  // Yungoos 734 (Colorless, Common $5), Stakeout: +15 Mult if the poker hand differs from the last poker hand played this run (the run's
  // first hand counts as different; `mult` +40%: 21 / 27 / 33). 4 rounds.
  yungoos: {
    name: 'yungoos', poke_sprite391: sprite('Natdex', 26, 48),
    config: { extra: { mult: 15, rounds: 4 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Colorless', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'hand_type', 'round_evo'], poke_after: 'toucannon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), last_hand_vars(), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && stakeout_on(context)) return { message: a_mult(r3(card.ability.extra.mult)), colour: 'MULT', mult_mod: card.ability.extra.mult };
      return level_evo(self, card, context, 'j_poke_gumshoos');
    },
  },
  // Gumshoos 735 (Safari $8): X2 under the same condition (`Xmult` +20%: 2.4 / 2.8 / 3.2).
  gumshoos: {
    name: 'gumshoos', poke_sprite391: sprite('Natdex', 28, 48),
    config: { extra: { Xmult: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'hand_type'], poke_after: 'yungoos',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult), last_hand_vars()] }; },
    calculate(self, card, context) {
      if (context.joker_main && stakeout_on(context)) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Crabrawler 739 (Fighting, Common $5), Power-Up Punch: the first scored card of each hand permanently gains +2 Mult (perma_mult; gain
  // `mult_mod` +20%: 2.4 / 2.8 / 3.2). Not Blueprint. 5 rounds.
  crabrawler: {
    name: 'crabrawler', poke_sprite391: sprite('Natdex', 6, 49),
    config: { extra: { mult_mod: 2, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fighting', gen: 7, blueprint_compat: false,
    attributes: ['mult', 'scaling', 'modify_card', 'round_evo'], poke_after: 'vikavolt',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), ex.rounds] }; },
    calculate(self, card, context) { return power_up_punch(card, context, false) || level_evo(self, card, context, 'j_poke_crabominable'); },
  },
  // Crabominable 740 (Water: its card; Safari $8): every scored card permanently gains +1 Mult (`mult_mod` +20%: 1.2 / 1.4 / 1.6), the first
  // +3 instead (`mult_mod2` +20%: 3.6 / 4.2 / 4.8). Not Blueprint.
  crabominable: {
    name: 'crabominable', poke_sprite391: sprite('Natdex', 8, 49),
    config: { extra: { mult_mod: 1, mult_mod2: 3 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 7, blueprint_compat: false,
    attributes: ['mult', 'scaling', 'modify_card'], poke_after: 'crabrawler',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.mult_mod2)] }; },
    calculate(self, card, context) { return power_up_punch(card, context, true); },
  },
  // Oricorio 741 (Fire: Baile, its own card; Rare $7, single-stage), Dance styles: on each round's first deal the suit held most picks its
  // style (Hearts Baile / Fire, Diamonds Pom-Pom / Lightning, Spades Pa'u / Psychic, Clubs Sensu / Psychic; a tie keeps the style; kept
  // between rounds); scored cards of its style's suit give X1.25 (`Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375). Its type follows the style
  // (Monotype-exempt, Castform's rule); art: the style's 3.9.1 card (the Gen 7 sheet, systems/anim.js GEN7_FORM_SPRITES).
  oricorio: {
    name: 'oricorio', poke_sprite391: sprite('Gen07', 0, 0),
    config: { extra: { Xmult_multi: 1.25, form: 'baile' } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Fire', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'suits', 'types', 'hand_drawn'], poke_after: 'crabominable',
    poke_mono_exempt: true,
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const st = ORICORIO_STYLES[style_of(card)];
      return { vars: [r3(card.ability.extra.Xmult_multi), st.name, localize(st.suit, 'suits_plural')], colours: [st.suit] };
    },
    calculate(self, card, context) { return revelation_dance(card, context); },
  },
  // Cutiefly 742 (Fairy, Common $5): +4 Mult for each Fairy Joker, itself included (`mult` +40%: 5.6 / 7.2 / 8.8). 5 rounds.
  cutiefly: {
    name: 'cutiefly', poke_sprite391: sprite('Natdex', 12, 49),
    config: { extra: { mult: 4, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fairy', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'types', 'round_evo'], poke_after: 'oricorio',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = fairy_count(card); return { vars: [r3(ex.mult), n, r3(ex.mult * n), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = r3(card.ability.extra.mult * fairy_count(card)); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_ribombee');
    },
  },
  // Ribombee 743 (Safari $8): X1, plus X0.25 for each Fairy Joker, itself included (`Xmult_mod` +20%: 0.3 / 0.35 / 0.4).
  ribombee: {
    name: 'ribombee', poke_sprite391: sprite('Natdex', 14, 49),
    config: { extra: { Xmult_mod: 0.25 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fairy', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'types'], poke_after: 'cutiefly',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = fairy_count(card); return { vars: [r3(ex.Xmult_mod), n, r3(1 + ex.Xmult_mod * n)] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const x = r3(1 + card.ability.extra.Xmult_mod * fairy_count(card)); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Wishiwashi 746 (Water, Rare $7, single-stage), Schooling: School Form X2.5 (`Xmult` +20%: 3 / 3.5 / 4) while the hands left before this
  // hand are at least half the round's hands (rounded up); Solo Form +5 Mult (`mult` +40%: 7 / 9 / 11) otherwise. The art follows the form
  // (its School card beside the Solo one on the Gen 7 sheet; poke_view_form, live).
  wishiwashi: {
    name: 'wishiwashi', poke_sprite391: sprite('Gen07', 2, 1),
    config: { extra: { Xmult: 2.5, mult: 5 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'mult', 'hands'], poke_after: 'lycanroc_dusk',
    poke_view_form(self, card) { return school_on(false) ? 'school' : 'solo'; },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.mult), school_on(false) ? 'School Form' : 'Solo Form'] }; },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const ex = card.ability.extra;
      if (school_on(true)) return { message: a_xmult(r3(ex.Xmult)), colour: 'XMULT', Xmult_mod: ex.Xmult };
      return { message: a_mult(r3(ex.mult)), colour: 'MULT', mult_mod: ex.mult };
    },
  },
  // Mareanie 747 (Dark, Common $5), Merciless: each scored card gives +1 Mult for each Boss Blind beaten this run (`mult` +40%: 1.4 / 1.8 /
  // 2.2; the run's record, so a late buy counts all). 5 rounds.
  mareanie: {
    name: 'mareanie', poke_sprite391: sprite('Natdex', 22, 49),
    config: { extra: { mult: 1, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'boss', 'round_evo'], poke_after: 'wishiwashi',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = bosses_beaten(); return { vars: [r3(ex.mult), n, r3(ex.mult * n), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && bosses_beaten() > 0) return { mult: r3(card.ability.extra.mult * bosses_beaten()), card };
      return level_evo(self, card, context, 'j_poke_toxapex');
    },
  },
  // Toxapex 748 (Safari $8): X1, plus X0.25 for each Boss Blind beaten this run (`Xmult_mod` +20%: 0.3 / 0.35 / 0.4).
  toxapex: {
    name: 'toxapex', poke_sprite391: sprite('Natdex', 24, 49),
    config: { extra: { Xmult_mod: 0.25 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'boss'], poke_after: 'mareanie',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = bosses_beaten(); return { vars: [r3(ex.Xmult_mod), n, r3(1 + ex.Xmult_mod * n)] }; },
    calculate(self, card, context) {
      if (context.joker_main && bosses_beaten() > 0) { const x = r3(1 + card.ability.extra.Xmult_mod * bosses_beaten()); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Dewpider 751 (Water, Common $5), Water Bubble: scored Clubs give +15 Chips (`chips` +30%: 19.5 / 24 / 28.5), doubled while it's raining
  // (Swift Swim's rain). 5 rounds.
  dewpider: {
    name: 'dewpider', poke_sprite391: sprite('Natdex', 0, 50),
    config: { extra: { chips: 15, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 7, blueprint_compat: true,
    attributes: ['chips', 'suit', 'clubs', 'hand_drawn', 'round_evo'], poke_after: 'mudsdale',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), rain_state(card), ex.rounds] }; },
    calculate(self, card, context) { return water_bubble(card, context, false) || level_evo(self, card, context, 'j_poke_araquanid'); },
  },
  // Araquanid 752 (Safari $8): scored Clubs give +15 Chips and X1.25 (`chips` +30%; `Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375), both doubled in
  // rain (+30 Chips and X1.5: the X's bonus doubles).
  araquanid: {
    name: 'araquanid', poke_sprite391: sprite('Natdex', 2, 50),
    config: { extra: { chips: 15, Xmult_multi: 1.25 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 7, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'suit', 'clubs', 'hand_drawn'], poke_after: 'dewpider',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.Xmult_multi), rain_state(card), r3(ex.chips * 2), r3(1 + 2 * (ex.Xmult_multi - 1))] }; },
    calculate(self, card, context) { return water_bubble(card, context, true); },
  },
  // Fomantis 753 (Grass, Common $5), Solar Blade: +10 Mult on the round's final hand (`mult` +40%: 14 / 18 / 22). 5 rounds.
  fomantis: {
    name: 'fomantis', poke_sprite391: sprite('Natdex', 4, 50),
    config: { extra: { mult: 10, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'hands', 'round_evo'], poke_after: 'araquanid',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), final_vars(), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && G.GAME.facing_blind && final_hand()) return { message: a_mult(r3(card.ability.extra.mult)), colour: 'MULT', mult_mod: card.ability.extra.mult };
      return level_evo(self, card, context, 'j_poke_lurantis');
    },
  },
  // Lurantis 754 (Safari $8): X2.5 on the final hand (`Xmult` +20%: 3 / 3.5 / 4), X3.5 instead while it's sunny (`Xmult2` +20%: 4.2 / 4.9 /
  // 5.6; the shared sun check: a red first deal, a working Groudon, Volcarona).
  lurantis: {
    name: 'lurantis', poke_sprite391: sprite('Natdex', 6, 50),
    config: { extra: { Xmult: 2.5, Xmult2: 3.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'hands', 'hand_drawn'], poke_after: 'fomantis',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult2), final_vars(), sun_state(card)] }; },
    calculate(self, card, context) {
      if (sun_read(card, context)) return undefined;
      if (!(context.joker_main && G.GAME.facing_blind && final_hand())) return undefined;
      const x = cherrim_sunny(card) ? card.ability.extra.Xmult2 : card.ability.extra.Xmult;
      return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
    },
  },
  // Morelull 755 (Fairy, Common $5): +3 Mult for each Lucky card in your full deck (`mult` +40%: 4.2 / 5.4 / 6.6). 5 rounds.
  morelull: {
    name: 'morelull', poke_sprite391: sprite('Natdex', 8, 50),
    config: { extra: { mult: 3, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fairy', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'full_deck', 'round_evo'], poke_after: 'lurantis',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); const ex = card.ability.extra; return { vars: [r3(ex.mult), r3(glow_mult(card)), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = glow_mult(card); return m > 0 ? { message: a_mult(m), colour: 'MULT', mult_mod: m } : undefined; }
      return level_evo(self, card, context, 'j_poke_shiinotic');
    },
  },
  // Shiinotic 756 (Safari $8): Morelull's +3 per Lucky card kept, and permanently +2 Mult each time a scored Lucky card triggers (its Mult or
  // its money roll; both at once count once: Tranquill's lucky_scored) — `glow_mult` banked (never energized), gain `mult_mod` +20%: 2.4 /
  // 2.8 / 3.2. Not Blueprint for the gain.
  shiinotic: {
    name: 'shiinotic', poke_sprite391: sprite('Natdex', 10, 50),
    config: { extra: { mult: 3, glow_mult: 0, mult_mod: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fairy', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'enhancements', 'full_deck', 'chance'], poke_after: 'morelull',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); const ex = card.ability.extra; return { vars: [r3(ex.mult), r3(ex.mult_mod), r3(ex.glow_mult), r3(glow_mult(card))] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (lucky_scored(context)) {
        if (context.blueprint) return undefined;
        ex.glow_mult = r3(ex.glow_mult + ex.mult_mod);
        return { extra: { message: localize('k_upgrade_ex'), colour: 'MULT' }, colour: 'MULT', card };
      }
      if (context.joker_main) { const m = glow_mult(card); return m > 0 ? { message: a_mult(m), colour: 'MULT', mult_mod: m } : undefined; }
      return undefined;
    },
  },
}, FILE);

// ---------------------------------------------------------------- Gen 7, batch 2 (contentRev 65; the owner's "Yes build it", 2026-11-02), #757-784
/** Salandit: its gender, rolled when it is OBTAINED (add_to_deck, if none yet: Glameow's / Furfrou's moment, never on creation, so a shop
 *  card has none), the run's seeded pseudorandom 'salandit_gender', 50/50; kept on ability.extra.gender (save / resume re-play it). Only a ♀
 *  evolves (5 rounds, level_evo); a ♂ never counts down (Everstone or not). */
const salandit_gender = (card) => (card.ability.extra.gender === 'male' || card.ability.extra.gender === 'female' ? card.ability.extra.gender : null);
const queen_scores = (context) => !!(context.individual && context.cardarea === G.play && !context.end_of_round && !has_no_rank(context.other_card) && context.other_card.get_id() === 12);
function salandit_state(card) {
  const g = salandit_gender(card);
  if (!g) return 'Gender rolled when obtained';
  return g === 'female' ? gender_name(g) : gender_name(g) + ': never evolves';
}
/** Bewear, Strong hug: at end of round (the main pass, not Blueprint), 1 in `dem` (pseudorandom_probability 'bewear': Oops! All 6s doubles the
 *  odds, as every Pokermon roll) to destroy the Joker directly to its RIGHT — Ceremonial Dagger's slice (getting_sliced + start_dissolve), so an
 *  Eternal one or one already being destroyed is skipped, a joker that refuses (Komala's Comatose, Nacho's Passimian) stays, and Drifblim /
 *  Pyukumuku still pay on leaving. Nothing to its right: no roll at all. */
function strong_hug(card, context) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over || card.getting_sliced) return undefined;
  const i = G.jokers.cards.indexOf(card), right = i >= 0 ? G.jokers.cards[i + 1] : undefined;
  if (!right || !can_be_destroyed_by_joker(right) || right.getting_sliced) return undefined;
  const ex = card.ability.extra;
  if (!pseudorandom_probability(card, 'bewear', ex.num, ex.dem, 'bewear')) return undefined;
  right.getting_sliced = true;
  G.E_MANAGER.add_event(() => {
    card.juice_up(0.8, 0.8);
    right.start_dissolve();
  });
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Strong Hug!', colour: 'MULT' });
  return undefined;
}
/** Comfey, Floral Gift: a joker that can take Energy now — a Pokémon Joker (a table `extra` with a ptype) with an Energy field
 *  (energy_values) that is under its cap (can_increase_energy: 3 + energy_plus + its own bonus, or unlimited). Never Comfey itself. */
const can_take_energy = (j) => !!(j && !j.removed && !j.getting_sliced && j.ability && j.ability.extra && typeof j.ability.extra === 'object' && j.ability.extra.ptype
  && Object.keys(energy_values).some((f) => typeof j.ability.extra[f] === 'number') && can_increase_energy(j));
export const comfey_targets = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && can_take_energy(j));
/** At end of round (the main pass, not Blueprint): 1 in `dem` (pseudorandom_probability 'comfey', Oops! doubles it) to give +1 Energy to a
 *  random eligible OTHER Pokémon Joker (the run's seeded pseudorandom_element 'comfey'); none eligible, no roll. The gift goes through
 *  increment_energy as a 'Trans' Energy (the Mystery Egg's): full strength on any type (as a matching Energy card), one energy_count, so the
 *  cap holds and it carries through evolution. It is not an Energy CARD: Porygon-Z / Gastrodon / Fusion Flare don't count it. */
function floral_gift(card, context) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over) return undefined;
  const pool = comfey_targets(card);
  if (!pool.length) return undefined;
  const ex = card.ability.extra;
  if (!pseudorandom_probability(card, 'comfey', ex.num, ex.dem, 'comfey')) return undefined;
  const [t] = pseudorandom_element(pool, pseudoseed('comfey'));
  increment_energy(t, 'Trans');
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Floral Gift!', colour: 'GREEN' });
  return undefined;
}
/** Sandygast / Palossand, Sand castle: each time a Stone card scores (has_enhancement: a quantum Stone too; each retrigger is another
 *  score), Sandygast banks +chip_mod Chips (`castle_chips`), Palossand +Xmult_mod X Mult (`castle_Xmult`, from X1) instead, still giving
 *  the Chips it carried. Banks in no energy field (never retroactive); not Blueprint for the gain (Blueprint copies the score). */
const stone_scored = (context) => !!(context.individual && context.cardarea === G.play && !context.end_of_round && has_enhancement(context.other_card, 'm_stone'));
function sand_castle(card, context) {
  const ex = card.ability.extra;
  if (stone_scored(context) && !context.blueprint && !context.retrigger_joker) {
    if (ex.Xmult_mod !== undefined) {
      ex.castle_Xmult = r3((ex.castle_Xmult || 1) + ex.Xmult_mod);
      card_eval_status_text(card, 'extra', null, null, null, { message: a_xmult(ex.castle_Xmult), colour: 'XMULT' });
    } else {
      ex.castle_chips = r3(ex.castle_chips + ex.chip_mod);
      card_eval_status_text(card, 'extra', null, null, null, { message: a_chips(ex.castle_chips), colour: 'CHIPS' });
    }
    return undefined;
  }
  if (!context.joker_main) return undefined;
  const r = {};
  if (ex.castle_chips > 0) r.chip_mod = ex.castle_chips;
  if (ex.castle_Xmult > 1) r.Xmult_mod = ex.castle_Xmult;
  if (!Object.keys(r).length) return undefined;
  r.message = r.Xmult_mod ? a_xmult(r3(r.Xmult_mod)) : a_chips(r3(r.chip_mod));
  r.colour = r.Xmult_mod ? 'XMULT' : 'CHIPS';
  return r;
}
/** Pyukumuku, Innards Out: the payout when it leaves — `innards_money` ($1, fixed) per round held (`held_rounds`). */
const innards_payout = (card) => (card.ability.extra.innards_money || 0) * (card.ability.extra.held_rounds || 0);
function innards_out(card) {
  const n = innards_payout(card);
  if (n <= 0) return;
  ease_dollars(n);
  card_eval_status_text(card, 'extra', null, null, null, { message: '$' + n, colour: 'MONEY' });
}
/** index.js hooks.start_dissolve (Drifblim's): an owned, undebuffed Pyukumuku being destroyed (Ceremonial Dagger, Madness, Bewear, Hex, Ankh,
 *  a Pokermon eater...) pays out; a saved one (no_destroy) never gets here; selling pays through selling_self. */
export function pyukumuku_destroyed(card) {
  if (!card || card.debuff || card.removed || !G.jokers || card.area !== G.jokers) return;
  if (!card.config || !card.config.center || card.config.center.key !== 'j_poke_pyukumuku') return;
  innards_out(card);
}
/** Jangmo-o / Hakamo-o, Clangorous Scales: each hand played whose poker hand IS a Full House (scoring_name: a Flush House is its own hand
 *  and doesn't count, Larvitar's rule) banks +mult_mod Mult (`clang_mult`, no energy field), in `before`, not Blueprint; given every hand. */
function clangorous(card, context) {
  const ex = card.ability.extra;
  if (context.before && context.scoring_name === 'Full House' && !context.blueprint && !context.retrigger_joker && ex.mult_mod !== undefined) {
    ex.clang_mult = r3(ex.clang_mult + ex.mult_mod);
    card_eval_status_text(card, 'extra', null, null, null, { message: a_mult(ex.clang_mult), colour: 'MULT' });
    return undefined;
  }
  if (!context.joker_main) return undefined;
  const r = {};
  if (ex.clang_mult > 0) r.mult_mod = ex.clang_mult;
  if (ex.Xmult_mod !== undefined) { const x = kommo_x(card); if (x > 1) r.Xmult_mod = x; }
  if (!Object.keys(r).length) return undefined;
  r.message = r.Xmult_mod ? a_xmult(r.Xmult_mod) : a_mult(r3(r.mult_mod));
  r.colour = r.Xmult_mod ? 'XMULT' : 'MULT';
  return r;
}
/** Kommo-o: the run's Full Houses (G.GAME.hands['Full House'].played: run.js counts the hand before the jokers score, never resets it in a run,
 *  so a Kommo-o bought late counts every one and the hand being played already counts). */
export const full_houses_played = () => (G.GAME && G.GAME.hands && G.GAME.hands['Full House'] && G.GAME.hands['Full House'].played) || 0;
const kommo_x = (card) => r3(1 + card.ability.extra.Xmult_mod * full_houses_played());

defineJokers({
  // Salandit 757 (Fire, Common $5), Queen: +1 discard each round (fixed); each scored Queen +5 Mult (`mult` +40%: 7 / 9 / 11). Its gender is
  // rolled when obtained: only a ♀ evolves (after 5 rounds), a ♂ never does.
  salandit: {
    name: 'salandit', poke_sprite391: sprite('Natdex', 12, 50),
    config: { extra: { d_size: 1, mult: 5, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fire', gen: 7, blueprint_compat: true,
    attributes: ['discard', 'mult', 'rank', 'face', 'round_evo', 'condition_evo'], poke_after: 'shiinotic',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.mult), salandit_state(card), ex.rounds] }; },
    add_to_deck(self, card) {
      discards.add_to_deck(self, card);
      if (!salandit_gender(card)) card.ability.extra.gender = pseudorandom(pseudoseed('salandit_gender')) < 0.5 ? 'female' : 'male';
    },
    remove_from_deck: discards.remove_from_deck,
    calculate(self, card, context) {
      if (queen_scores(context)) return { mult: card.ability.extra.mult, card };
      if (salandit_gender(card) === 'female') return level_evo(self, card, context, 'j_poke_salazzle');
      return undefined;
    },
  },
  // Salazzle 758 (Safari $8): +1 discard each round; each scored Queen X1.5 Mult (`Xmult_multi` +5%: 1.575 / 1.65 / 1.725).
  salazzle: {
    name: 'salazzle', poke_sprite391: sprite('Natdex', 14, 50),
    config: { extra: { d_size: 1, Xmult_multi: 1.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 7, blueprint_compat: true,
    attributes: ['discard', 'xmult', 'rank', 'face'], poke_after: 'salandit',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) { return queen_scores(context) ? { x_mult: card.ability.extra.Xmult_multi, card } : undefined; },
    ...discards,
  },
  // Stufful 759 (Fighting: its card; Common $5): +40 Chips (`chips` +30%: 52 / 64 / 76) and +4 Mult (`mult` +40%: 5.6 / 7.2 / 8.8). 5 rounds.
  stufful: {
    name: 'stufful', poke_sprite391: sprite('Natdex', 16, 50),
    config: { extra: { chips: 40, mult: 4, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fighting', gen: 7, blueprint_compat: true,
    attributes: ['chips', 'mult', 'round_evo'], poke_after: 'salazzle',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const ex = card.ability.extra; return { message: a_mult(r3(ex.mult)), colour: 'MULT', chip_mod: ex.chips, mult_mod: ex.mult }; }
      return level_evo(self, card, context, 'j_poke_bewear');
    },
  },
  // Bewear 760 (Safari $8), Strong hug: X2.5 Mult (`Xmult` +20%: 3 / 3.5 / 4). At end of round, 1 in 4 (fixed odds) to destroy the Joker
  // directly to its right (strong_hug; not Eternal; nothing if none). Not Blueprint (it copies the X only).
  bewear: {
    name: 'bewear', poke_sprite391: sprite('Natdex', 18, 50),
    config: { extra: { Xmult: 2.5, num: 1, dem: 4 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fighting', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'chance', 'joker', 'position'], poke_after: 'stufful',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, [n, d] = get_probability_vars(card, ex.num, ex.dem, 'bewear');
      const i = G.jokers ? G.jokers.cards.indexOf(card) : -1, right = i >= 0 ? G.jokers.cards[i + 1] : undefined;
      return { vars: [r3(ex.Xmult), n, d, right ? (right.ability.eternal ? 'Eternal: safe' : !can_be_destroyed_by_joker(right) ? 'Comatose: safe' : 'In its arms: ' + localize({ type: 'name_text', set: 'Joker', key: right.config.center.key })) : 'Nothing to its right'] };
    },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return strong_hug(card, context);
    },
  },
  // Comfey 764 (Fairy, Rare $7), Floral Gift: at end of round, 1 in 3 (fixed odds) to give +1 Energy to a random OTHER Pokémon Joker that can
  // still take one (floral_gift). Energy-inert itself (it has no number).
  comfey: {
    name: 'comfey', poke_sprite391: sprite('Natdex', 26, 50),
    config: { extra: { num: 1, dem: 3 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Fairy', gen: 7, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['energy', 'chance', 'joker'],
    poke_after: 'bewear',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, [n, d] = get_probability_vars(card, ex.num, ex.dem, 'comfey');
      const k = G.jokers && G.jokers.cards.includes(card) ? comfey_targets(card).length : null;
      return { vars: [n, d, k === null ? 'Picks among your Jokers' : k === 1 ? '1 Joker can take it' : k + ' Jokers can take it'] };
    },
    calculate(self, card, context) { return floral_gift(card, context); },
  },
  // Sandygast 769 (Psychic: its card; Common $5), Sand castle: permanently +10 Chips each time a Stone card scores (`castle_chips` banked; gain
  // `chip_mod` +20%: 12 / 14 / 16). 5 rounds; the bank carries into Palossand.
  sandygast: {
    name: 'sandygast', poke_sprite391: sprite('Natdex', 6, 51),
    config: { extra: { castle_chips: 0, chip_mod: 10, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Psychic', gen: 7, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'enhancements', 'round_evo'], poke_after: 'comfey',
    poke_custom_values_to_keep: ['castle_chips'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.chip_mod), r3(ex.castle_chips), ex.rounds] }; },
    calculate(self, card, context) { return sand_castle(card, context) || level_evo(self, card, context, 'j_poke_palossand'); },
  },
  // Palossand 770 (Safari $8): gains X0.05 per scored Stone card (`castle_Xmult` banked from X1; gain `Xmult_mod` +20%: 0.06 / 0.07 / 0.08),
  // and gives Sandygast's Chips (kept, no longer growing).
  palossand: {
    name: 'palossand', poke_sprite391: sprite('Natdex', 8, 51),
    config: { extra: { castle_chips: 0, castle_Xmult: 1, Xmult_mod: 0.05 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 7, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'scaling', 'enhancements'], poke_after: 'sandygast',
    poke_custom_values_to_keep: ['castle_chips', 'castle_Xmult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), r3(ex.castle_Xmult), r3(ex.castle_chips)] }; },
    calculate(self, card, context) { return sand_castle(card, context); },
  },
  // Pyukumuku 771 (Water, Rare $7), Innards Out: permanently +10 Chips at the end of each round held (`innards_chips` banked; gain `chip_mod`
  // +20%: 12 / 14 / 16); when sold or destroyed, earn $1 per round held (`innards_money` / `held_rounds`, fixed).
  pyukumuku: {
    name: 'pyukumuku', poke_sprite391: sprite('Natdex', 10, 51),
    config: { extra: { innards_chips: 0, chip_mod: 10, innards_money: 1, held_rounds: 0 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 7, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'money', 'on_sell', 'sell_value'], poke_after: 'palossand',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chip_mod), r3(ex.innards_chips), ex.innards_money, innards_payout(card)] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.selling_self && !context.blueprint) { innards_out(card); return undefined; }
      if (round_end(context) && !context.blueprint && !context.retrigger_joker && !context.game_over) {
        ex.innards_chips = r3(ex.innards_chips + ex.chip_mod);
        ex.held_rounds = (ex.held_rounds || 0) + 1;
        card_eval_status_text(card, 'extra', null, null, null, { message: a_chips(ex.innards_chips), colour: 'CHIPS' });
        return undefined;
      }
      if (context.joker_main && ex.innards_chips > 0) return { message: a_chips(r3(ex.innards_chips)), colour: 'CHIPS', chip_mod: ex.innards_chips };
      return undefined;
    },
  },
  // Komala 775 (Colorless, Rare $7), Comatose: X1.5 Mult (`Xmult` +20%: 1.8 / 2.1 / 2.4). Can't be debuffed (systems/rules.js set_debuff) and
  // can't be destroyed by a Joker: from r68 Jokers skip it when choosing what to destroy, as an Eternal (komala_destroy_immune, index.js
  // hooks.joker_destroy_immune -> the engine's can_be_destroyed_by_joker: Ceremonial Dagger, Madness, Bewear, Carvanha / Sharpedo, Scyther /
  // Scizor / Kleavor, Rotom Fan, Mega Mewtwo X, Nacli...), so the destroyer gains nothing. r65-r67 (and any path that still marks it
  // getting_sliced: a Boss Blind, another mod's joker) it refuses the destroy (joker_type_destroyed -> no_destroy). Hex and Ankh (Spectral
  // cards you choose) and selling still remove it.
  komala: {
    name: 'komala', poke_sprite391: sprite('Natdex', 18, 51),
    config: { extra: { Xmult: 1.5 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Colorless', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'debuff'], poke_after: 'pyukumuku',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult)] }; },
    calculate(self, card, context) {
      if (context.joker_type_destroyed && context.card === card && !context.blueprint) {
        card_eval_status_text(card, 'extra', null, null, null, { message: 'Comatose!', colour: 'FILTER' });
        return { no_destroy: true };
      }
      if (context.joker_main) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Bruxish 779 (Water, Rare $7), Strong Jaw: every scored card with a seal retriggers once (fixed: Energy-inert). Blueprint copies it.
  bruxish: {
    name: 'bruxish', poke_sprite391: sprite('Natdex', 26, 51),
    config: { extra: { retriggers: 1 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 7, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['retrigger', 'seals'], poke_after: 'mimikyu',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.retriggers] }; },
    calculate(self, card, context) {
      if (context.repetition && context.cardarea === G.play && context.scoring_hand && context.other_card && context.other_card.get_seal()) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return undefined;
    },
  },
  // Jangmo-o 782 (Dragon, Uncommon $6), Clangorous Scales: permanently +2 Mult each time you play a Full House (`clang_mult` banked; gain
  // `mult_mod` +20%: 2.4 / 2.8 / 3.2). Evolves at +16 Mult (scaling_evo).
  jangmoo: {
    name: 'jangmoo', poke_sprite391: sprite('Natdex', 2, 52),
    config: { evo_rqmt: 16, extra: { clang_mult: 0, mult_mod: 2 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Dragon', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'hand_type', 'scaling_evo'], poke_after: 'mega_drampa',
    poke_custom_values_to_keep: ['clang_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.clang_mult), self.config.evo_rqmt] }; },
    calculate(self, card, context) { return clangorous(card, context) || scaling_evo(self, card, context, 'j_poke_hakamoo', card.ability.extra.clang_mult, self.config.evo_rqmt); },
  },
  // Hakamo-o 783 (Safari $8): +4 Mult per Full House (`mult_mod` +20%: 4.8 / 5.6 / 6.4) on Jangmo-o's bank. Evolves at +40 Mult in all.
  hakamoo: {
    name: 'hakamoo', poke_sprite391: sprite('Natdex', 4, 52),
    config: { evo_rqmt: 40, extra: { clang_mult: 0, mult_mod: 4 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dragon', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'hand_type', 'scaling_evo'], poke_after: 'jangmoo',
    poke_custom_values_to_keep: ['clang_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.clang_mult), self.config.evo_rqmt] }; },
    calculate(self, card, context) { return clangorous(card, context) || scaling_evo(self, card, context, 'j_poke_kommoo', card.ability.extra.clang_mult, self.config.evo_rqmt); },
  },
  // Kommo-o 784 (Safari $10): gives the banked Mult (no longer growing) and X1 + X0.15 per Full House played this run (`Xmult_mod` +20%:
  // 0.18 / 0.21 / 0.24; G.GAME.hands['Full House'].played, so a late Kommo-o counts every one).
  kommoo: {
    name: 'kommoo', poke_sprite391: sprite('Natdex', 6, 52),
    config: { extra: { clang_mult: 0, Xmult_mod: 0.15 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Dragon', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'hand_type'], poke_after: 'hakamoo',
    poke_custom_values_to_keep: ['clang_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), full_houses_played(), kommo_x(card), r3(ex.clang_mult)] }; },
    calculate(self, card, context) { return clangorous(card, context); },
  },

  // ---------------------------------------------------------------- Gen 7, batch 4: the Gen 7 Legendaries, 772-807 (contentRev 67)
  // The owner's design ("Yes build it", 2026-11-02). Legendary (The Soul / the Legendary pool); each complete ALONE (the solo rule, r59:
  // no partner clause; line members only evolve into each other). $20, the pre-evolutions $10 (Kubfu's precedent): Type: Null, Cosmog,
  // Cosmoem. The evolved stages (Silvally, Cosmoem, Solgaleo, Lunala) come only through their line (never in a pool: Urshifu's way).
  // Types from the card art (pokermon_art_type.mjs; every form cell checked): Type: Null / Silvally Colorless (Silvally's 11 Memory cells
  // each their own type), Tapu Koko Lightning, Lele Psychic, Bulu Grass, Fini Water, Cosmog / Cosmoem Psychic, Solgaleo Metal, Lunala
  // Psychic, Necrozma Psychic (its Ultra cell Dragon), Magearna Metal, Marshadow Fighting (its Zenith cell too), Zeraora Lightning. Neither
  // Nacho nor Pokermon+ has any. Art: upstream 3.9.1's own cells with their souls; the forms (systems/anim.js GEN7_LEGEND_FORMS) drawn
  // live by ui.js ownFace from each center's poke_view_form. Defined here, at the end, so every poke_after is registered first. Pokédex
  // order: Type: Null / Silvally after Pyukumuku (771); the Tapus and the Cosmog line after Kommo-o (784); Necrozma / Magearna / Marshadow
  // after Guzzlord (799); Zeraora after Blacephalon (806).
  //
  // Type: Null 772 (Colorless, $10): permanently gains X0.1 Mult at the end of each round (`null_Xmult` from X1, no energy field; the gain
  // `Xmult_mod` +20%: 0.12 / 0.14 / 0.16, never retroactive). Evolves after 5 rounds into Silvally, the bank kept. Blueprint copies the X.
  typenull: {
    name: 'typenull', poke_sprite391: sprite('Natdex', 12, 51, [13, 51]),
    config: { extra: { null_Xmult: 1, Xmult_mod: 0.1, rounds: 5 } },
    rarity: 4, cost: 10, stage: 'Legendary', ptype: 'Colorless', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'round_evo'], poke_after: 'pyukumuku',
    poke_custom_values_to_keep: ['null_Xmult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), r3(ex.null_Xmult), ex.rounds] }; },
    calculate(self, card, context) {
      round_bank(card, context, 'null_Xmult', 'Xmult_mod', 'XMULT');
      const ex = card.ability.extra;
      if (context.joker_main && ex.null_Xmult > 1) return { message: a_xmult(r3(ex.null_Xmult)), colour: 'XMULT', Xmult_mod: ex.null_Xmult };
      return level_evo(self, card, context, 'j_poke_silvally');
    },
  },
  // Silvally 773 (Colorless; only through Type: Null), RKS System: X2 Mult plus X0.25 for each OTHER undebuffed Joker of its current type
  // (Greninja's count; `Xmult` / `Xmult_mod` +20%: 2.4 / 2.8 / 3.2 and 0.3 / 0.35 / 0.4), times Type: Null's bank (kept, no longer
  // growing). Using any Energy card (on any Joker, while held; not Blueprint) sets its type to that Energy's (Colorless Energy: Colorless;
  // Bird Energy, Double Rainbow and Berry Juice don't): its ptype, Castform's way (is_type / Energy / Kecleon follow; a Tera sticker still
  // overrides). Every type's Energy can go on it, full strength (poke_any_energy, so a lone Silvally can pick its type). Its Memory card
  // shows (the 12 cells on the Gen 7 sheet). Its type never breaks Monotype (poke_mono_exempt).
  silvally: {
    name: 'silvally', poke_sprite391: sprite('Gen07', 6, 1, [7, 1]),
    config: { extra: { Xmult: 2, Xmult_mod: 0.25, null_Xmult: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Colorless', gen: 7, blueprint_compat: true, custom_pool_func: true,
    attributes: ['xmult', 'types', 'energy'], poke_after: 'typenull',
    poke_mono_exempt: true, poke_any_energy: true,
    poke_view_form(self, card) { return card.ability.extra.ptype || 'Colorless'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult), r3(ex.Xmult_mod), r3(ex.null_Xmult || 1), get_type(card) || ex.ptype, ninja_others(card), r3(rks_x(card))] };
    },
    calculate(self, card, context) {
      if (rks_system(card, context)) return undefined;
      if (context.joker_main) { const x = rks_x(card); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
    in_pool() { return false; },
  },
  // Tapu Koko 785 (Lightning), Electric Surge: every scored card gives X1.1 Mult (`Xmult_multi` +5%: 1.155 / 1.21 / 1.265). Blueprint
  // copies it.
  tapu_koko: {
    name: 'tapu_koko', poke_sprite391: sprite('Natdex', 8, 52, [9, 52]),
    config: { extra: { Xmult_multi: 1.1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Lightning', gen: 7, blueprint_compat: true,
    attributes: ['xmult'], poke_after: 'kommoo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Tapu Lele 786 (Psychic), Psychic Surge: each Tarot card used (by anyone, while held) creates a random Planet card (must have room NOW:
  // no room, nothing). Blueprint copies it (Cartomancer-like: a second Planet, room permitting). No number: Energy-inert.
  tapu_lele: {
    name: 'tapu_lele', poke_sprite391: sprite('Natdex', 10, 52, [11, 52]),
    config: { extra: {} },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 7, blueprint_compat: true,
    attributes: ['generation', 'tarot', 'planet'], poke_after: 'tapu_koko',
    poke_no_energy_field: true,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [] }; },
    calculate(self, card, context) {
      const c = context.consumeable;
      if (!context.using_consumeable || !c || c.ability.set !== 'Tarot') return undefined;
      if (G.consumeables.cards.length + (G.GAME.consumeable_buffer || 0) >= G.consumeables.config.card_limit) return undefined;
      G.GAME.consumeable_buffer = (G.GAME.consumeable_buffer || 0) + 1;
      G.E_MANAGER.add_event(() => {
        const p = create_card('Planet', G.consumeables, null, null, null, null, null, 'tapu_lele');
        p.add_to_deck();
        G.consumeables.emplace(p);
        G.GAME.consumeable_buffer = 0;
      });
      card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize('k_plus_planet'), colour: 'Planet' });
      return undefined;
    },
  },
  // Tapu Bulu 787 (Grass), Grassy Surge: +2 hand size (`h_size`, fixed) and X1.5 Mult (`Xmult` +20%: 1.8 / 2.1 / 2.4). Blueprint copies
  // the X.
  tapu_bulu: {
    name: 'tapu_bulu', poke_sprite391: sprite('Natdex', 12, 52, [13, 52]),
    config: { extra: { h_size: 2, Xmult: 1.5 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Grass', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'hand_size'], poke_after: 'tapu_lele',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, r3(ex.Xmult)] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
    ...hand_size,
  },
  // Tapu Fini 788 (Water), Misty Surge: +1 hand each round (`hands`, fixed: the Squirtle pair); at the end of round (the cash-out,
  // calc_dollar_bonus) earns $2 for each unused hand (`mist_money`, fixed). No number Energy raises: Energy-inert. Nothing to copy.
  tapu_fini: {
    name: 'tapu_fini', poke_sprite391: sprite('Natdex', 14, 52, [15, 52]),
    config: { extra: { hands: 1, mist_money: 2 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 7, blueprint_compat: false,
    attributes: ['hands', 'money', 'economy'], poke_after: 'tapu_bulu',
    poke_no_energy_field: true,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, ex.mist_money] }; },
    calc_dollar_bonus(self, card) {
      const n = Math.max(0, (G.GAME.current_round && G.GAME.current_round.hands_left) || 0);
      return n > 0 ? n * card.ability.extra.mist_money : undefined;
    },
    ...hands,
  },
  // Cosmog 789 (Psychic, $10): permanently gains +1 Mult at the end of each round (`cosmo_mult` from 0, no energy field; the gain
  // `mult_mod` +20%: 1.2 / 1.4 / 1.6). Evolves after 3 rounds into Cosmoem, the bank kept (and still given). Blueprint copies the Mult.
  cosmog: {
    name: 'cosmog', poke_sprite391: sprite('Natdex', 16, 52, [17, 52]),
    config: { extra: { cosmo_mult: 0, mult_mod: 1, rounds: 3 } },
    rarity: 4, cost: 10, stage: 'Legendary', ptype: 'Psychic', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'round_evo'], poke_after: 'tapu_fini',
    poke_custom_values_to_keep: ['cosmo_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.cosmo_mult), ex.rounds] }; },
    calculate(self, card, context) {
      round_bank(card, context, 'cosmo_mult', 'mult_mod', 'MULT');
      return cosmo_main(card, context) || level_evo(self, card, context, 'j_poke_cosmoem');
    },
  },
  // Cosmoem 790 (Psychic, $10; only through Cosmog): permanently gains X0.25 Mult at the end of each round (`cosmo_Xmult` from X1, no
  // energy field; the gain `Xmult_mod` +20%: 0.3 / 0.35 / 0.4) and gives Cosmog's Mult too (kept, no longer growing). While held it counts
  // the scored cards' colours (cosmo_count: red Hearts / Diamonds, black Spades / Clubs; a Wild card both, a Stone card neither; once per
  // hand). After 3 rounds it evolves: more red -> Solgaleo, more black -> Lunala, a tie -> Solgaleo; both banks kept.
  cosmoem: {
    name: 'cosmoem', poke_sprite391: sprite('Natdex', 18, 52, [19, 52]),
    config: { extra: { cosmo_mult: 0, cosmo_Xmult: 1, Xmult_mod: 0.25, red: 0, black: 0, rounds: 3 } },
    rarity: 4, cost: 10, stage: 'Legendary', ptype: 'Psychic', gen: 7, blueprint_compat: true, custom_pool_func: true,
    attributes: ['mult', 'xmult', 'scaling', 'suits', 'round_evo'], poke_after: 'cosmog',
    poke_custom_values_to_keep: ['cosmo_mult', 'cosmo_Xmult'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult_mod), r3(ex.cosmo_mult), r3(ex.cosmo_Xmult), ex.red || 0, ex.black || 0, ex.rounds] };
    },
    calculate(self, card, context) {
      if (cosmo_count(card, context)) return undefined;
      round_bank(card, context, 'cosmo_Xmult', 'Xmult_mod', 'XMULT');
      return cosmo_main(card, context) || level_evo(self, card, context, cosmo_branch(card));
    },
    in_pool() { return false; },
  },
  // Solgaleo 791 (Metal; only through Cosmoem), Sunsteel Strike: each scored Heart or Diamond (is_suit: Wild counts) gives X1.25 Mult
  // (`Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375); plus the Cosmog line's banks (+Mult and X, kept, no longer growing). Blueprint copies all.
  solgaleo: {
    name: 'solgaleo', poke_sprite391: sprite('Natdex', 20, 52, [21, 52]),
    config: { extra: { Xmult_multi: 1.25, cosmo_mult: 0, cosmo_Xmult: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Metal', gen: 7, blueprint_compat: true, custom_pool_func: true,
    attributes: ['xmult', 'mult', 'suit', 'hearts', 'diamonds'], poke_after: 'cosmoem',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_multi), r3(ex.cosmo_mult), r3(ex.cosmo_Xmult)] }; },
    calculate(self, card, context) { return cosmo_suit_x(card, context, ['Hearts', 'Diamonds']) || cosmo_main(card, context); },
    in_pool() { return false; },
  },
  // Lunala 792 (Psychic; only through Cosmoem), Moongeist Beam: each scored Spade or Club gives X1.25 Mult (`Xmult_multi` +5%); plus the
  // Cosmog line's banks. Blueprint copies all.
  lunala: {
    name: 'lunala', poke_sprite391: sprite('Natdex', 22, 52, [23, 52]),
    config: { extra: { Xmult_multi: 1.25, cosmo_mult: 0, cosmo_Xmult: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 7, blueprint_compat: true, custom_pool_func: true,
    attributes: ['xmult', 'mult', 'suit', 'spades', 'clubs'], poke_after: 'solgaleo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_multi), r3(ex.cosmo_mult), r3(ex.cosmo_Xmult)] }; },
    calculate(self, card, context) { return cosmo_suit_x(card, context, ['Spades', 'Clubs']) || cosmo_main(card, context); },
    in_pool() { return false; },
  },
  // Necrozma 800 (Psychic), Prism: each Planet card used while held (by anyone; not Blueprint) banks +X0.1 Mult (`prism_Xmult` from X1,
  // no energy field; the gain `Xmult_mod` +20%: 0.12 / 0.14 / 0.16, never retroactive). At X3 it becomes Ultra Necrozma for good: its
  // Ultra card (Gen 7 {0,5}), its type the card's (Dragon; Monotype still accepts the Psychic it was gained as), +1 hand size
  // (`ultra_size`, fixed; Zygarde's pair). It keeps banking. Blueprint copies the X.
  necrozma: {
    name: 'necrozma', poke_sprite391: sprite('Gen07', 6, 4, [7, 4]),
    config: { extra: { prism_Xmult: 1, Xmult_mod: 0.1, ultra_size: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'planet', 'hand_size', 'types'], poke_after: 'guzzlord',
    poke_view_form(self, card) { return necrozma_ultra(card) ? 'ultra' : 'base'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult_mod), r3(ex.prism_Xmult), NECROZMA_ULTRA, ex.ultra_size, necrozma_ultra(card) ? 'Ultra Necrozma' : 'Necrozma'] };
    },
    calculate(self, card, context) {
      if (prism(card, context)) return undefined;
      const ex = card.ability.extra;
      if (context.joker_main && ex.prism_Xmult > 1) return { message: a_xmult(r3(ex.prism_Xmult)), colour: 'XMULT', Xmult_mod: ex.prism_Xmult };
      return undefined;
    },
    ...ultra_size,
  },
  // Magearna 801 (Metal), Soul-Heart: each scored Steel card gives X1.5 Mult (the joker's own per-card pass, so a retrigger repeats it and
  // Blueprint copies it; `Xmult_multi` +5%: 1.575 / 1.65 / 1.725). A Steel card held in hand keeps its own X1.5 as usual.
  magearna: {
    name: 'magearna', poke_sprite391: sprite('Natdex', 10, 53, [11, 53]),
    config: { extra: { Xmult_multi: 1.5 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Metal', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'enhancements'], poke_after: 'necrozma',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && has_enhancement(context.other_card, 'm_steel')) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Marshadow 802 (Fighting), Spectral Thief: X2 Mult (`Xmult` +20%: 2.4 / 2.8 / 3.2); X4 during a Boss Blind (`Xmult1` +20%: 4.8 / 5.6 /
  // 6.4; boss_now: a disabled Boss is still a Boss). During one its Zenith card shows (Gen 7 {4,5}, Fighting too). Blueprint copies it.
  marshadow: {
    name: 'marshadow', poke_sprite391: sprite('Gen07', 2, 5, [3, 5]),
    config: { extra: { Xmult: 2, Xmult1: 4 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fighting', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'boss_blind'], poke_after: 'magearna',
    poke_view_form(self, card) { return boss_now() ? 'zenith' : 'base'; },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult1), r3(boss_now() ? ex.Xmult1 : ex.Xmult)] }; },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const x = boss_now() ? card.ability.extra.Xmult1 : card.ability.extra.Xmult;
      return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
    },
  },
  // Zeraora 807 (Lightning), Plasma Fists: each scored face card (is_face: Pareidolia counts) earns $1 (`plasma_money`, fixed) and gives
  // X1.25 Mult (`Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375). Blueprint copies both.
  zeraora: {
    name: 'zeraora', poke_sprite391: sprite('Natdex', 22, 53, [23, 53]),
    config: { extra: { Xmult_multi: 1.25, plasma_money: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Lightning', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'money', 'face'], poke_after: 'blacephalon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.plasma_money, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_face()) {
        const ex = card.ability.extra;
        G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + ex.plasma_money;
        G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
        return { dollars: ex.plasma_money, x_mult: ex.Xmult_multi, card };
      }
      return undefined;
    },
  },
}, FILE);

// ---------------------------------------------------------------- Gen 8, batch 1 (contentRev 70; the owner's "yes", 2026-11-02), #821-847
/** Rookidee line, Flying Taxi: $taxi_money at end of round (calc_dollar_bonus: a row of the cash-out list, as Purrloin; fixed, no Energy; a
 *  Blueprint never copies it, as Golden Joker). */
const taxi_money = (card) => card.ability.extra.taxi_money;
/** Corviknight: +card_slots shop card slot while owned (Overstock's change_shop_size, Dudunsparce's add / remove pair: a debuffed one lends
 *  none). Taken back when it leaves, but never below 1 shop slot (the engine's own floor: a shop is never empty). */
const shop_slot = {
  add_to_deck(self, card) { change_shop_size(card.ability.extra.card_slots); },
  remove_from_deck(self, card) {
    const n = Math.min(card.ability.extra.card_slots, Math.max(0, ((G.GAME.shop && G.GAME.shop.joker_max) || 1) - 1));
    if (n > 0) change_shop_size(-n);
  },
};
/** Dottler / Orbeetle: each Foreseen card (G.scry_view, the top of the deck, scored like a held card: Patrat's / Uxie's moment) gives +mult
 *  (Dottler) or X Xmult_multi (Orbeetle); a debuffed one gives nothing. The Foresight itself is the Shinx line's `scry` pair. */
function foreseen_score(card, context, x) {
  if (!(context.individual && context.cardarea === G.scry_view && !context.end_of_round && !context.other_card.debuff)) return undefined;
  return x ? { x_mult: card.ability.extra.Xmult_multi, card } : { mult: card.ability.extra.mult, card };
}
/** Gossifleur / Eldegoss, Cotton Down: each scored card that is a Seed when the hand is played gives +mult. A Seed that blooms while it
 *  scores (Shiftry / Cherubi growth) still counts: the Seed card's growth runs before the jokers read it, so the hand's Seeds are marked in
 *  `before` (poke_seed_hand = this hand's number) — a Blueprint copy reads the same marks. */
const seed_scored = (c) => has_enhancement(c, 'm_poke_seed') || c.poke_seed_hand === G.GAME.hands_played;
function cotton_down(card, context) {
  if (context.before && context.scoring_hand) {
    for (const c of context.scoring_hand) if (has_enhancement(c, 'm_poke_seed')) c.poke_seed_hand = G.GAME.hands_played;
    return undefined;
  }
  if (context.individual && context.cardarea === G.play && !context.end_of_round && seed_scored(context.other_card)) return { mult: card.ability.extra.mult, card };
  return undefined;
}
/** When a Blind is selected, ONE random unenhanced card of the full deck (the run's seeded pseudorandom_element on `seed`) takes `enh` —
 *  Cherubi's sweet_seeds with its own stream, for Eldegoss (Seed) and the Rolycoly line (Stone, Marble Joker's shape on a deck card). None
 *  unenhanced: nothing (it never overwrites another enhancement). Blueprint copies it (a second card). */
function blind_convert(card, context, enh, seed, message) {
  if (!context.setting_blind || card.getting_sliced || (context.blueprint_card && context.blueprint_card.getting_sliced)) return;
  const plain = (G.playing_cards || []).filter((c) => unbroken(c) && c.config.center.key === 'c_base');
  if (!plain.length) return;
  const [pick] = pseudorandom_element(plain, pseudoseed(seed));
  pick.set_ability(P_CENTERS[enh], null, true);
  G.E_MANAGER.add_event(() => { pick.juice_up(); });
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message, colour: enh === 'm_stone' ? 'CHIPS' : 'GREEN' });
}
/** How many scores a fresh Seed needs to bloom now (5 growth, 1 + growth level a score). */
const bloom_scores = () => Math.ceil(5 / (1 + Math.max(0, (G.GAME && G.GAME.poke_growth_level) || 0)));
/** Dubwool, Cotton Guard: when a Boss Blind is selected, +hands hand for that round (ease_hands_played; once a round, `guard_round`; not
 *  Blueprint). At the main end of round an unused one is taken back before the cash-out counts hands (so it never pays $1 there); sold
 *  mid-round, it takes it back too (never the last hand). */
function cotton_guard(card, context) {
  const ex = card.ability.extra;
  if (context.setting_blind && !context.blueprint && !context.retrigger_joker && G.GAME.blind && G.GAME.blind.boss && ex.guard_round !== G.GAME.round) {
    ex.guard_round = G.GAME.round;
    ease_hands_played(ex.hands);
    card_eval_status_text(card, 'extra', null, null, null, { message: '+' + ex.hands + ' Hand', colour: 'CHIPS' });
  }
  if (round_end(context) && !context.blueprint && ex.guard_round === G.GAME.round) {
    ex.guard_round = -1;
    const back = Math.min(ex.hands, G.GAME.current_round.hands_left);
    if (back > 0) ease_hands_played(-back);
  }
}
const guard_on = (card) => !!(G.GAME && G.GAME.facing_blind && card.ability.extra.guard_round === G.GAME.round);
/** Chewtle / Drednaw: the Water Jokers, itself included (Barboach's / Cutiefly's count: is_type, undebuffed; a Water Tera counts). */
const water_count = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && !j.debuff && is_type(j, 'Water')).length + 1;
/** Silicobra, Sand Spit: each card the PLAYER discards (the pre_discard of a real discard: Trapinch's rule, `hook` set by every effect that
 *  discards for you) that is unenhanced has a num in dem chance (pseudorandom_probability on 'silicobra_spit': Oops! / Venonat raise it,
 *  Absol fixes it) to become a Stone card as it goes. Enhanced cards never roll (it never overwrites). Blueprint copies it (its own roll). */
let spit_hand = null;
function sand_spit(card, context) {
  if (context.pre_discard) { spit_hand = context.hook ? null : context.full_hand; return undefined; }
  if (!(context.discard && context.other_card && spit_hand && spit_hand.includes(context.other_card))) return undefined;
  const c = context.other_card;
  if (c.config.center.key !== 'c_base' || !unbroken(c)) return undefined;
  const ex = card.ability.extra;
  if (!pseudorandom_probability(card, 'silicobra_spit', ex.num, ex.dem, 'silicobra_spit')) return undefined;
  c.set_ability(P_CENTERS.m_stone, null, true);
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: 'Sand Spit!', colour: '#e1c019' });
  return undefined;
}
/** THE HOUSE SANDSTORM (Gen 8 batch 1): is it a sandstorm? While an undebuffed Sandaconda is held, every round is (live: bought or sold, it
 *  changes at once; in the shop too). The weather check future sand jokers read, beside the sun (cherrim_sunny) and the rain
 *  (swift_swim_raining). Castform has no sand form: the sandstorm never changes its forecast. Flygon's "Sandstorm" and the Hippopotas
 *  line's "Sand Stream" are move names; they neither make nor read it. */
export const is_sandstorm = () => legends('sandaconda').length > 0;
/** Sandaconda r73 (the owner's: it keeps Silicobra's Sand Spit, its own num / dem, the same roll). Moves recorded before r73 (js/mods/pins.js
 *  RULES) never roll it, so a run from then replays as recorded. */
const sand_spit73 = () => rulesRev('pokermon') >= 73;
/** Cramorant, Gulp Missile: the round's FIRST discard (a player's: pre_discard, not a hook, with no discard used yet; once a round,
 *  `load_round`) loads the missile; the next hand that scores fires it (joker_main: X Xmult, a Blueprint copy too; spent in `after`). A
 *  debuffed hand doesn't score, so it doesn't fire. Unfired at the end of the round: lost. Loaded, it shows its Gulping Form card. */
function gulp_missile(card, context) {
  const ex = card.ability.extra;
  if (context.pre_discard && !context.hook && !context.blueprint && !context.retrigger_joker && G.GAME.current_round.discards_used === 0 && ex.load_round !== G.GAME.round) {
    ex.load_round = G.GAME.round;
    ex.missile = true;
    card_eval_status_text(card, 'extra', null, null, null, { message: 'Gulp!', colour: 'XMULT' });
    return undefined;
  }
  if (context.joker_main && ex.missile) {
    if (!context.blueprint) ex.firing = true;
    return { message: a_xmult(r3(ex.Xmult)), colour: 'XMULT', Xmult_mod: ex.Xmult };
  }
  if (context.after && !context.blueprint && ex.firing) { ex.firing = false; ex.missile = false; return undefined; }
  if (round_end(context) && !context.blueprint) { ex.missile = false; ex.firing = false; }
  return undefined;
}
/** Arrokuda / Barraskewda, Propeller Tail: the FIRST scored card (scoring_hand[0] by position, Crabrawler's rule: a debuffed one there gives
 *  nothing and the next isn't promoted; a retrigger of it gives again). */
function propeller_tail(card, context, x) {
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round && context.scoring_hand && context.other_card === context.scoring_hand[0])) return undefined;
  return x ? { x_mult: card.ability.extra.Xmult_multi, card } : { mult: card.ability.extra.mult, card };
}

defineJokers({
  // The owner's Gen 8 batch 1 ("yes", 2026-11-02): 20 jokers, #821-847, on the guide's price slots (3-stage U $6 / S $8 / S $10, 2-stage C $5 /
  // S $8, single-stage R $7); evolution by rounds (4 for the 3-stage Basics, else 5). Types = the cards' (pokermon_art_type.mjs). Energy raises
  // the main number at the standard share; money, slots, hands / discards, Foresight, conversions and odds are fixed; a stage with no number
  // of its own carries its evolution's ("Energy carries to ..."). Art: upstream 3.9.1's own cells (Natdex {20,54}-{12,56}; Cramorant Gen 8
  // {0,0}, its Gulping Form {2,0} beside it, systems/anim.js GEN8_FORM_SPRITES); nothing to deploy. Neither Nacho nor Pokermon+ has any.
  // Pokédex order: Rookidee ... Orbeetle (821-826) after Inteleon, before Nickit; Gossifleur ... Drednaw (829-834) after Thievul, before
  // Yamper; Rolycoly ... Barraskewda (837-847) after Boltund, before Dreepy.
  //
  // Rookidee 821 (Colorless, Uncommon $6), Flying Taxi: earn $1 at end of round (`taxi_money`, fixed). Carries Corviknight's `Xmult` (1.5:
  // "Energy carries to Corviknight"). 4 rounds.
  rookidee: {
    name: 'rookidee', poke_sprite391: sprite('Natdex', 20, 54),
    config: { extra: { taxi_money: 1, Xmult: 1.5, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Colorless', gen: 8, blueprint_compat: false,
    attributes: ['money', 'economy', 'round_evo'], poke_after: 'inteleon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.taxi_money, ex.rounds, r3(ex.Xmult)] }; },
    calculate(self, card, context) { return level_evo(self, card, context, 'j_poke_corvisquire'); },
    calc_dollar_bonus(self, card) { return taxi_money(card); },
  },
  // Corvisquire 822 (Safari $8): $2 at end of round; carries Corviknight's `Xmult`. 5 rounds.
  corvisquire: {
    name: 'corvisquire', poke_sprite391: sprite('Natdex', 22, 54),
    config: { extra: { taxi_money: 2, Xmult: 1.5, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 8, blueprint_compat: false,
    attributes: ['money', 'economy', 'round_evo'], poke_after: 'rookidee',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.taxi_money, ex.rounds, r3(ex.Xmult)] }; },
    calculate(self, card, context) { return level_evo(self, card, context, 'j_poke_corviknight'); },
    calc_dollar_bonus(self, card) { return taxi_money(card); },
  },
  // Corviknight 823 (Metal: its card; Safari $10): $2 at end of round, X1.5 Mult (`Xmult` +20%: 1.8 / 2.1 / 2.4) and +1 shop card slot
  // (`card_slots`, fixed; shop_slot). Blueprint copies the X only.
  corviknight: {
    name: 'corviknight', poke_sprite391: sprite('Natdex', 24, 54),
    config: { extra: { taxi_money: 2, Xmult: 1.5, card_slots: 1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Metal', gen: 8, blueprint_compat: true,
    attributes: ['money', 'economy', 'xmult', 'shop'], poke_after: 'corvisquire',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.taxi_money, r3(ex.Xmult), ex.card_slots] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
    calc_dollar_bonus(self, card) { return taxi_money(card); },
    ...shop_slot,
  },
  // Blipbug 824 (Grass: its card; Uncommon $6): +1 Foresight (`scry`, fixed). Carries Dottler's `mult` (4: "Energy carries to Dottler").
  // 4 rounds.
  blipbug: {
    name: 'blipbug', poke_sprite391: sprite('Natdex', 26, 54),
    config: { extra: { scry: 1, mult: 4, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Grass', gen: 8, blueprint_compat: false,
    attributes: ['foresight', 'round_evo'], poke_after: 'corviknight',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, ex.rounds, r3(ex.mult)] }; },
    calculate(self, card, context) { return level_evo(self, card, context, 'j_poke_dottler'); },
    ...scry,
  },
  // Dottler 825 (Psychic: its card; Safari $8): +2 Foresight; each Foreseen card gives +4 Mult (`mult` +40%: 5.6 / 7.2 / 8.8). 5 rounds.
  dottler: {
    name: 'dottler', poke_sprite391: sprite('Natdex', 28, 54),
    config: { extra: { scry: 2, mult: 4, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['foresight', 'mult', 'round_evo'], poke_after: 'blipbug',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { return foreseen_score(card, context, false) || level_evo(self, card, context, 'j_poke_orbeetle'); },
    ...scry,
  },
  // Orbeetle 826 (Safari $10): +3 Foresight; each Foreseen card gives X1.15 (`Xmult_multi` +5%: 1.2075 / 1.265 / 1.3225).
  orbeetle: {
    name: 'orbeetle', poke_sprite391: sprite('Natdex', 0, 55),
    config: { extra: { scry: 3, Xmult_multi: 1.15 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['foresight', 'xmult'], poke_after: 'dottler',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) { return foreseen_score(card, context, true); },
    ...scry,
  },
  // Gossifleur 829 (Grass, Common $5), Cotton Down: each scored Seed card gives +4 Mult (`mult` +40%: 5.6 / 7.2 / 8.8). 5 rounds.
  gossifleur: {
    name: 'gossifleur', poke_sprite391: sprite('Natdex', 6, 55),
    config: { extra: { mult: 4, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'round_evo'], poke_after: 'thievul',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_seed); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { return cotton_down(card, context) || level_evo(self, card, context, 'j_poke_eldegoss'); },
  },
  // Eldegoss 830 (Safari $8): Cotton Down kept (`mult` +40%); Cotton Spore: when a Blind is selected a random unenhanced deck card becomes a
  // Seed (blind_convert, 'poke_eldegoss_seeds'); and +1 growth level while owned (Cherubi's sweet_growth: `growth`, fixed; it STACKS with
  // Cherubi / Cherrim / Shiftry / Brambleghast: +1 each, so a Seed blooms in 3 scores with one, 2 with two).
  eldegoss: {
    name: 'eldegoss', poke_sprite391: sprite('Natdex', 8, 55),
    config: { extra: { mult: 4, growth: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'modify_card', 'full_deck'], poke_after: 'gossifleur',
    loc_vars(self, info_queue, card) { seed_tips(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.growth, bloom_scores()] }; },
    calculate(self, card, context) { blind_convert(card, context, 'm_poke_seed', 'poke_eldegoss_seeds', '+1 Seed'); return cotton_down(card, context); },
    ...sweet_growth,
  },
  // Wooloo 831 (Colorless, Common $5): +50 Chips (`chips` +30%: 65 / 80 / 95). 5 rounds.
  wooloo: {
    name: 'wooloo', poke_sprite391: sprite('Natdex', 10, 55),
    config: { extra: { chips: 50, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Colorless', gen: 8, blueprint_compat: true,
    attributes: ['chips', 'round_evo'], poke_after: 'eldegoss',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_chips(r3(card.ability.extra.chips)), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      return level_evo(self, card, context, 'j_poke_dubwool');
    },
  },
  // Dubwool 832 (Safari $8): +100 Chips (`chips` +30%: 130 / 160 / 190); Cotton Guard: +1 hand during Boss Blinds (`hands`, fixed;
  // cotton_guard: given when the Boss Blind is selected, gone at the round's end). Blueprint copies the Chips only.
  dubwool: {
    name: 'dubwool', poke_sprite391: sprite('Natdex', 12, 55),
    config: { extra: { chips: 100, hands: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 8, blueprint_compat: true,
    attributes: ['chips', 'hands', 'boss_blind'], poke_after: 'wooloo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), ex.hands, guard_on(card) ? 'Active!' : 'Boss Blinds only'] }; },
    calculate(self, card, context) {
      cotton_guard(card, context);
      if (context.joker_main) return { message: a_chips(r3(card.ability.extra.chips)), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      return undefined;
    },
    remove_from_deck(self, card, from_debuff) {
      if (from_debuff || !guard_on(card)) return;
      card.ability.extra.guard_round = -1;
      const back = Math.min(card.ability.extra.hands, G.GAME.current_round.hands_left - 1);
      if (back > 0) ease_hands_played(-back);
    },
  },
  // Chewtle 833 (Water, Common $5): +3 Mult for each Water Joker, itself included (`mult` +40%: 4.2 / 5.4 / 6.6). 5 rounds.
  chewtle: {
    name: 'chewtle', poke_sprite391: sprite('Natdex', 14, 55),
    config: { extra: { mult: 3, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'types', 'round_evo'], poke_after: 'dubwool',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = water_count(card); return { vars: [r3(ex.mult), n, r3(ex.mult * n), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = r3(card.ability.extra.mult * water_count(card)); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_drednaw');
    },
  },
  // Drednaw 834 (Safari $8): X1, plus X0.3 for each Water Joker, itself included (`Xmult_mod` +20%: 0.36 / 0.42 / 0.48).
  drednaw: {
    name: 'drednaw', poke_sprite391: sprite('Natdex', 16, 55),
    config: { extra: { Xmult_mod: 0.3 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'types'], poke_after: 'chewtle',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = water_count(card); return { vars: [r3(ex.Xmult_mod), n, r3(1 + ex.Xmult_mod * n)] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const x = r9(1 + card.ability.extra.Xmult_mod * water_count(card)); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Rolycoly 837 (Earth, Uncommon $6), Coal: when a Blind is selected, a random unenhanced card in your deck becomes Stone (blind_convert,
  // 'poke_rolycoly_coal'; Blueprint copies it). Carries Carkol's `mult` (6: "Energy carries to Carkol"). 4 rounds.
  rolycoly: {
    name: 'rolycoly', poke_sprite391: sprite('Natdex', 22, 55),
    config: { extra: { mult: 6, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Earth', gen: 8, blueprint_compat: true,
    attributes: ['enhancements', 'modify_card', 'full_deck', 'round_evo'], poke_after: 'boltund',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [ex.rounds, r3(ex.mult)] }; },
    calculate(self, card, context) { blind_convert(card, context, 'm_stone', 'poke_rolycoly_coal', '+1 Stone'); return level_evo(self, card, context, 'j_poke_carkol'); },
  },
  // Carkol 838 (Fire: its card; Safari $8): the same conversion; scored Stone cards also give +6 Mult (`mult` +40%: 8.4 / 10.8 / 13.2). 5 rounds.
  carkol: {
    name: 'carkol', poke_sprite391: sprite('Natdex', 24, 55),
    config: { extra: { mult: 6, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'modify_card', 'full_deck', 'round_evo'], poke_after: 'rolycoly',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      blind_convert(card, context, 'm_stone', 'poke_rolycoly_coal', '+1 Stone');
      if (stone_scored(context)) return { mult: card.ability.extra.mult, card };
      return level_evo(self, card, context, 'j_poke_coalossal');
    },
  },
  // Coalossal 839 (Safari $10), Steam Engine: the same conversion; scored Stone cards give X1.3 (`Xmult_multi` +5%: 1.365 / 1.43 / 1.495);
  // +1 discard each round (`d_size`, fixed; the Charmander line's pair).
  coalossal: {
    name: 'coalossal', poke_sprite391: sprite('Natdex', 26, 55),
    config: { extra: { Xmult_multi: 1.3, d_size: 1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fire', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'discard', 'enhancements', 'modify_card', 'full_deck'], poke_after: 'carkol',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_multi), ex.d_size] }; },
    calculate(self, card, context) {
      blind_convert(card, context, 'm_stone', 'poke_rolycoly_coal', '+1 Stone');
      if (stone_scored(context)) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
    ...discards,
  },
  // Silicobra 843 (Earth, Common $5), Sand Spit: each card you discard (unenhanced) has a 1 in 4 chance to become Stone (sand_spit; odds
  // fixed). Carries Sandaconda's `chips` (20: "Energy carries to Sandaconda"). 5 rounds.
  silicobra: {
    name: 'silicobra', poke_sprite391: sprite('Natdex', 4, 56),
    config: { extra: { num: 1, dem: 4, chips: 20, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Earth', gen: 8, blueprint_compat: true,
    attributes: ['discard', 'enhancements', 'modify_card', 'chance', 'round_evo'], poke_after: 'coalossal',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone);
      const ex = card.ability.extra, [num, dem] = get_probability_vars(card, ex.num, ex.dem, 'silicobra_spit');
      return { vars: [num, dem, ex.rounds, r3(ex.chips)] };
    },
    calculate(self, card, context) { return sand_spit(card, context) || level_evo(self, card, context, 'j_poke_sandaconda'); },
  },
  // Sandaconda 844 (Safari $8), Sandstorm: while held (undebuffed) every round is a sandstorm (is_sandstorm, the house sandstorm); scored
  // Stone cards give +20 Chips (`chips` +30%: 26 / 32 / 38) and X1.2 (`Xmult_multi` +5%: 1.26 / 1.32 / 1.38). r73 (the owner's): it keeps
  // Silicobra's Sand Spit (each discarded unenhanced card 1 in 4 to become Stone; odds fixed; sand_spit73).
  sandaconda: {
    name: 'sandaconda', poke_sprite391: sprite('Natdex', 6, 56),
    config: { extra: { chips: 20, Xmult_multi: 1.2, num: 1, dem: 4 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 8, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'enhancements', 'discard', 'modify_card', 'chance'], poke_after: 'silicobra',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone);
      const ex = card.ability.extra, [num, dem] = get_probability_vars(card, ex.num, ex.dem, 'silicobra_spit');
      return { vars: [r3(ex.chips), r3(ex.Xmult_multi), is_sandstorm() ? 'Sandstorm!' : 'No sandstorm', num, dem] };
    },
    calculate(self, card, context) {
      if (stone_scored(context)) return { chips: card.ability.extra.chips, x_mult: card.ability.extra.Xmult_multi, card };
      if (sand_spit73()) return sand_spit(card, context);
      return undefined;
    },
  },
  // Cramorant 845 (Water, Rare $7, single-stage), Gulp Missile: the round's first discard loads a missile; the next scored hand fires it,
  // X2.5 (`Xmult` +20%: 3 / 3.5 / 4); unfired at the round's end, it's lost. Loaded, it shows its Gulping Form card (Gen 8 {2,0}; poke_view_form).
  cramorant: {
    name: 'cramorant', poke_sprite391: sprite('Gen08', 0, 0),
    config: { extra: { Xmult: 2.5 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'discard'], poke_after: 'sandaconda',
    poke_view_form(self, card) { return card.ability.extra.missile ? 'gulping' : 'normal'; },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), ex.missile ? 'Loaded!' : 'Empty'] }; },
    calculate(self, card, context) { return gulp_missile(card, context); },
  },
  // Arrokuda 846 (Water, Common $5), Propeller Tail: the first scored card gives +10 Mult (`mult` +40%: 14 / 18 / 22). 5 rounds.
  arrokuda: {
    name: 'arrokuda', poke_sprite391: sprite('Natdex', 10, 56),
    config: { extra: { mult: 10, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'position', 'round_evo'], poke_after: 'cramorant',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { return propeller_tail(card, context, false) || level_evo(self, card, context, 'j_poke_barraskewda'); },
  },
  // Barraskewda 847 (Safari $8): the first scored card gives X2 (`Xmult_multi` +5%, a per-card X: 2.1 / 2.2 / 2.3).
  barraskewda: {
    name: 'barraskewda', poke_sprite391: sprite('Natdex', 12, 56),
    config: { extra: { Xmult_multi: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'position'], poke_after: 'arrokuda',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) { return propeller_tail(card, context, true); },
  },
}, FILE);

// ---------------------------------------------------------------- Gen 8, batch 2 (contentRev 71; the owner's "go ahead with batch 2", 2026-11-02), #848-861
/** Toxtricity's form, Amped or Low Key: rolled when OBTAINED (Glameow's rule: in add_to_deck, never on creation, so a shop / collection card
 *  never moves the seeded stream), 50 / 50 on the run's seeded 'toxtricity_form'. Held on card.ability (not ability.extra): Steamodded's
 *  set_ability keeps ability fields the new center doesn't set, so it rides through copies, and a Toxel evolving into it rolls it right then
 *  (set_ability runs the new center's add_to_deck). The unobtained card says "(Form: rolled when obtained)". */
export const TOX_FORMS = ['amped', 'lowkey'];
export const tox_form = (card) => (TOX_FORMS.includes(card.ability.poke_tox_form) ? card.ability.poke_tox_form : null);
function tox_roll(card) {
  if (!tox_form(card)) card.ability.poke_tox_form = pseudorandom(pseudoseed('toxtricity_form')) < 0.5 ? 'amped' : 'lowkey';
}
/** Toxtricity: Amped (Punk Rock) X Xmult on a hand of exactly 5 PLAYED cards (full_hand: the kickers count, scoring doesn't matter); Low Key
 *  +chips for each card fewer than 5 played (1 card: 4 x). Both numbers are energy fields, so Energy raises the form it doesn't have too. */
function punk_rock(card, context) {
  if (!context.joker_main) return undefined;
  const n = (context.full_hand || G.play.cards).length, ex = card.ability.extra, f = tox_form(card);
  if (f === 'amped' && n === 5) return { message: a_xmult(r3(ex.Xmult)), colour: 'XMULT', Xmult_mod: ex.Xmult };
  if (f === 'lowkey' && n < 5) { const c = r3(ex.chips * (5 - n)); return { message: a_chips(c), colour: 'CHIPS', chip_mod: c }; }
  return undefined;
}
/** Sizzlipede / Centiskorch, Fire Spin: Carnivine's Flytrap (the round's FIRST player discard: pre_discard, no hook, discards_used 0, once a
 *  round, `burn_round`; its LEFTMOST card) destroyed in its own discard pass ({ remove: true }: dissolved, a Glass card shatters, every
 *  joker's remove_playing_cards runs). Its own mark list (poke_burned_by), so a Carnivine and a Sizzlipede (or two Sizzlipedes) on the same
 *  card each take it — the card is destroyed once, each joker banks. Sizzlipede banks +mult_mod Mult (`burn_mult`), Centiskorch X Xmult_mod
 *  (`burn_Xmult`, from X1) and keeps scoring the Mult it carried. Not Blueprint (the burn / gain); a Blueprint copies the score. */
function fire_spin(card, context, x) {
  const ex = card.ability.extra;
  if (context.pre_discard && !context.hook && !context.blueprint && !context.retrigger_joker && context.full_hand && context.full_hand.length
    && G.GAME.current_round.discards_used === 0 && ex.burn_round !== G.GAME.round) {
    ex.burn_round = G.GAME.round;
    const c = context.full_hand[0];
    c.poke_burned_by = (c.poke_burned_by || []).concat([card]);
    return undefined;
  }
  if (context.discard && !context.blueprint && context.other_card && context.other_card.poke_burned_by && context.other_card.poke_burned_by.includes(card)) {
    const c = context.other_card;
    c.poke_burned_by = c.poke_burned_by.filter((j) => j !== card);
    if (!c.poke_burned_by.length) c.poke_burned_by = undefined;
    if (x) ex.burn_Xmult = r3(ex.burn_Xmult + ex.Xmult_mod);
    else ex.burn_mult = r3(ex.burn_mult + ex.mult_mod);
    card_eval_status_text(card, 'extra', null, null, null, { message: 'Fire Spin!', colour: 'MULT' });
    return { remove: true };
  }
  return undefined;
}
const burn_state = (card) => (G.GAME && G.GAME.facing_blind && (G.GAME.current_round.discards_used > 0 || card.ability.extra.burn_round === G.GAME.round) ? 'burned this round' : 'ready');
/** Clobbopus / Grapploct, Octolock: the ranks of the hand's SCORED cards (the scoring hand's undebuffed ranked cards: a Stone card has none,
 *  a debuffed one doesn't score) and the cards HELD in hand that share one (undebuffed, ranked). */
const scored_ranks = (context) => new Set((context.scoring_hand || []).filter((c) => !c.debuff && !has_no_rank(c)).map((c) => c.get_id()));
const octo_held = (c, ranks) => !c.debuff && !has_no_rank(c) && ranks.has(c.get_id());
/** Sinistea / Polteageist, Phony or Antique: rolled when OBTAINED (Glameow's rule, as Toxtricity), Antique num in dem (1 in 10, FIXED: a trait,
 *  not a chance effect, so Oops! All 6s / Absol never touch it), the run's seeded 'sinistea_antique'; on card.ability, so it rides through
 *  evolution. Antique doubles the X (derived: one energy field, `Xmult`, scales both). */
export const tea_form = (card) => (card.ability.poke_tea === 'antique' || card.ability.poke_tea === 'phony' ? card.ability.poke_tea : null);
function tea_roll(card) {
  if (!tea_form(card)) card.ability.poke_tea = pseudorandom(pseudoseed('sinistea_antique')) < card.ability.extra.num / card.ability.extra.dem ? 'antique' : 'phony';
}
const tea_x = (card) => r3(card.ability.extra.Xmult * (tea_form(card) === 'antique' ? 2 : 1));
const tea_state = (card) => (tea_form(card) === 'antique' ? 'Antique!' : tea_form(card) === 'phony' ? 'Phony' : 'rolled when obtained');
/** The Hatenna line: the Psychic Jokers, itself included (Chewtle's count: is_type, undebuffed; a Psychic Tera and Arceus count). */
const psychic_count = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && !j.debuff && is_type(j, 'Psychic')).length + 1;
/** Hatterene, Magic Powder: when a Blind is selected (once a round), the Joker directly to its RIGHT gets a Psychic Tera sticker
 *  (apply_type_sticker: a non-Pokémon joker takes one too) unless it is already Psychic (is_type: its type, a Psychic Tera, Arceus). Nothing
 *  at the row's right end. Not Blueprint; a debuffed Hatterene isn't calculated, so it converts nothing. */
function magic_powder(card, context) {
  if (!context.setting_blind || context.blueprint || context.retrigger_joker || card.getting_sliced) return;
  const row = G.jokers.cards, right = row[row.indexOf(card) + 1];
  if (!right || right.getting_sliced || is_type(right, 'Psychic')) return;
  apply_type_sticker(right, 'Psychic');
  right.set_debuff && right.set_debuff();
  card_eval_status_text(right, 'extra', null, null, null, { message: localize('poke_tera_ex'), colour: 'Spectral' });
}
/** The Impidimp line, Prankster (the reroll_cost / reroll_shop / shop_start hooks, index.js):
 *  - Impidimp (and Morgrem, r73): a PAID reroll costs $reroll_discount less per undebuffed one (they stack), never below $1; a free one
 *    stays free.
 *  - Morgrem / Grimmsnarl: the FIRST reroll in each shop is free while an undebuffed one is held — one free reroll however many are held,
 *    and none on top of another free reroll (Chaos the Clown's, Bidoof's, a D6 Tag's $0): it is the shop's FIRST reroll, so whatever made
 *    that one free uses it up. Like Chaos's, it never raises the next reroll's price (it is spent as one of the engine's free rerolls).
 *  "Each shop" is counted from the shop opening (shop_start), so one bought mid-shop gives it only if nothing has been rerolled yet. */
const prank_held = (key) => ((G.jokers && G.jokers.cards) || []).filter((j) => !j.debuff && j.config.center.key === key);
const prank_free_held = () => prank_held('j_poke_morgrem').length + prank_held('j_poke_grimmsnarl').length > 0;
/** r73 (the owner's): Morgrem keeps Impidimp's discount (its own `reroll_discount`, stacking with Impidimps' as theirs do). Moves recorded
 *  before r73 (js/mods/pins.js RULES) price rerolls without it. Grimmsnarl does not keep it (the owner named Morgrem only). */
const prank_discount73 = () => rulesRev('pokermon') >= 73;
const prank_discounters = () => (prank_discount73() ? [...prank_held('j_poke_impidimp'), ...prank_held('j_poke_morgrem')] : prank_held('j_poke_impidimp'));
const shop_rerolls = () => (G.GAME && G.GAME.current_round && G.GAME.current_round.poke_shop_rerolls) || 0;
export function prank_reroll_cost(cost) {
  if (!G.GAME || !G.GAME.current_round || !G.jokers) return undefined;
  const cr = G.GAME.current_round;
  cr.poke_prank_free = false;
  let c = cost;
  if (c > 0) {
    const off = prank_discounters().reduce((s, j) => s + (j.ability.extra.reroll_discount || 0), 0);
    if (off) c = Math.max(1, c - off);
  }
  if (c > 0 && (cr.free_rerolls || 0) <= 0 && shop_rerolls() === 0 && prank_free_held()) { c = 0; cr.poke_prank_free = true; }
  return c === cost ? undefined : c;
}
/** reroll_shop hook (sync, before the reroll's queued event): a reroll Prankster made free is spent as one of the engine's free rerolls
 *  (the event then neither raises the price nor counts it as paid), and the shop's reroll count goes up. */
export function prank_reroll_shop() {
  const cr = G.GAME.current_round;
  if (cr.poke_prank_free) { cr.free_rerolls = (cr.free_rerolls || 0) + 1; cr.poke_prank_free = false; }
  cr.poke_shop_rerolls = shop_rerolls() + 1;
}
export function prank_shop_start() {
  G.GAME.current_round.poke_shop_rerolls = 0;
  calculate_reroll_cost(true);
}
const prank_recost = {
  add_to_deck() { G.E_MANAGER.add_event(() => { calculate_reroll_cost(true); }); },
  remove_from_deck() { G.E_MANAGER.add_event(() => { calculate_reroll_cost(true); }); },
};
const prank_state = () => (G.STATE === G.STATES.SHOP ? (shop_rerolls() === 0 ? 'free reroll ready' : 'used this shop') : 'ready next shop');

defineJokers({
  // The owner's Gen 8 batch 2 ("go ahead with batch 2", 2026-11-02): 14 jokers, #848-861, on the guide's price slots (3-stage U $6 / S $8 /
  // S $10, 2-stage C $5 / S $8; Toxel a Baby, U $4 as Elekid; Toxtricity after a Baby is a shop Basic, R $7 as Lucario / Electabuzz), types =
  // the cards' (pokermon_art_type.mjs). Evolution by rounds: Toxel 3 (the owner's; Babies are usually 2), the 3-stage Basics 4, the rest 5.
  // Energy raises each main number at the standard share; the reroll discount, the free reroll, the Antique odds and the Tera conversion are
  // fixed; a stage with no number carries its evolution's ("Energy carries to Grimmsnarl"). Art: upstream 3.9.1's own cells (Natdex
  // {14,56}-{10,57}; Toxtricity Gen 8 {6,0} Amped, {8,0} Low Key beside it, systems/anim.js GEN8_FORM_SPRITES; Sinistea / Polteageist have
  // no Antique cell upstream, so both use their one card); nothing to deploy. Neither Nacho nor Pokermon+ has any. Pokédex order: Toxel ...
  // Grimmsnarl (848-861) after Barraskewda, before Dreepy.
  //
  // Toxel 848 (Lightning, Baby, Uncommon $4): +4 Mult (`mult` +40%: 5.6 / 7.2 / 8.8). The Baby rule (faint_baby_poke: a non-Baby Joker to
  // its right debuffs it when a hand is played); its +4 replaces the Babies' usual X0.75 penalty (the owner's design). 3 rounds.
  toxel: {
    name: 'toxel', poke_sprite391: sprite('Natdex', 14, 56),
    config: { extra: { mult: 4, rounds: 3 } },
    rarity: 2, cost: 4, stage: 'Baby', ptype: 'Lightning', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'baby', 'round_evo'], poke_after: 'barraskewda',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push({ set: 'Other', key: 'baby' }); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) {
        faint_baby_poke(self, card, context);
        return { message: a_mult(r3(card.ability.extra.mult)), colour: 'MULT', mult_mod: card.ability.extra.mult };
      }
      return level_evo(self, card, context, 'j_poke_toxtricity');
    },
  },
  // Toxtricity 849 (Lightning, Rare $7, a shop Basic): its form is rolled when obtained (or on evolving from Toxel), 50 / 50, and kept.
  // Amped, Punk Rock: X2 Mult on a hand of exactly 5 played cards (`Xmult` +20%: 2.4 / 2.8 / 3.2). Low Key: +40 Chips for each card fewer
  // than 5 played (`chips` +30%: 52 / 64 / 76; 1 card +160). Art: Amped {6,0}, Low Key {8,0} (Gen 8 sheet; poke_view_form).
  toxtricity: {
    name: 'toxtricity', poke_sprite391: sprite('Gen08', 6, 0),
    config: { extra: { Xmult: 2, chips: 40 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Lightning', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'chips', 'nature'], poke_after: 'toxel',
    poke_view_form(self, card) { return tox_form(card) || 'amped'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, f = tox_form(card);
      return { vars: [r3(ex.Xmult), r3(ex.chips)], key: f ? 'j_poke_toxtricity_' + f : undefined };
    },
    add_to_deck(self, card) { tox_roll(card); },
    calculate(self, card, context) { return punk_rock(card, context); },
  },
  // Sizzlipede 850 (Fire, Common $5), Fire Spin: the first card you discard each round is destroyed and it permanently gains +2 Mult
  // (`burn_mult`, banked; gain `mult_mod` +20%: 2.4 / 2.8 / 3.2). 5 rounds.
  sizzlipede: {
    name: 'sizzlipede', poke_sprite391: sprite('Natdex', 18, 56),
    config: { extra: { burn_mult: 0, mult_mod: 2, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fire', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'discard', 'destroy_card', 'round_evo'], poke_after: 'toxtricity',
    poke_custom_values_to_keep: ['burn_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.burn_mult), burn_state(card), ex.rounds] }; },
    calculate(self, card, context) {
      const r = fire_spin(card, context, false);
      if (r) return r;
      const m = card.ability.extra.burn_mult;
      if (context.joker_main && m > 0) return { message: a_mult(r3(m)), colour: 'MULT', mult_mod: m };
      return level_evo(self, card, context, 'j_poke_centiskorch');
    },
  },
  // Centiskorch 851 (Safari $8): the same Fire Spin, gaining X0.1 (`burn_Xmult` from X1, banked; gain `Xmult_mod` +20%: 0.12 / 0.14 / 0.16);
  // Sizzlipede's Mult bank carries and keeps scoring.
  centiskorch: {
    name: 'centiskorch', poke_sprite391: sprite('Natdex', 20, 56),
    config: { extra: { burn_mult: 0, burn_Xmult: 1, Xmult_mod: 0.1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'scaling', 'discard', 'destroy_card'], poke_after: 'sizzlipede',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), r3(ex.burn_Xmult), r3(ex.burn_mult), burn_state(card)] }; },
    calculate(self, card, context) {
      const r = fire_spin(card, context, true);
      if (r) return r;
      const ex = card.ability.extra;
      if (context.joker_main && (ex.burn_mult > 0 || ex.burn_Xmult > 1)) return { mult_mod: ex.burn_mult || undefined, Xmult_mod: ex.burn_Xmult > 1 ? ex.burn_Xmult : undefined };
      return undefined;
    },
  },
  // Clobbopus 852 (Fighting, Common $5), Octolock: +2 Mult for each card held in hand that shares a rank with a scored card (`mult` +40%:
  // 2.8 / 3.6 / 4.4). 5 rounds.
  clobbopus: {
    name: 'clobbopus', poke_sprite391: sprite('Natdex', 22, 56),
    config: { extra: { mult: 2, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fighting', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'hand', 'rank', 'round_evo'], poke_after: 'centiskorch',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) {
        const ranks = scored_ranks(context), n = G.hand.cards.filter((c) => octo_held(c, ranks)).length;
        if (n > 0) { const m = r3(card.ability.extra.mult * n); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
        return undefined;
      }
      return level_evo(self, card, context, 'j_poke_grapploct');
    },
  },
  // Grapploct 853 (Safari $8), Octolock: each card held in hand that shares a rank with a scored card gives X1.25 (the held pass, Baron's
  // shape: Mime and held retriggers repeat it; `Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375).
  grapploct: {
    name: 'grapploct', poke_sprite391: sprite('Natdex', 24, 56),
    config: { extra: { Xmult_multi: 1.25 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fighting', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'hand', 'rank'], poke_after: 'clobbopus',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.hand && !context.end_of_round && octo_held(context.other_card, scored_ranks(context))) {
        return { x_mult: card.ability.extra.Xmult_multi, card };
      }
      return undefined;
    },
  },
  // Sinistea 854 (Psychic, Common $5): X1.5 Mult; Antique (1 in 10, rolled when obtained, fixed odds) X3 (`Xmult` +20%: 1.8 / 2.1 / 2.4, Antique
  // twice that). 5 rounds; the roll carries to Polteageist.
  sinistea: {
    name: 'sinistea', poke_sprite391: sprite('Natdex', 26, 56),
    config: { extra: { Xmult: 1.5, num: 1, dem: 10, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'nature', 'round_evo'], poke_after: 'grapploct',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult * 2), ex.num, ex.dem, tea_state(card), ex.rounds] }; },
    add_to_deck(self, card) { tea_roll(card); },
    calculate(self, card, context) {
      if (context.joker_main) { const x = tea_x(card); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return level_evo(self, card, context, 'j_poke_polteageist');
    },
  },
  // Polteageist 855 (Safari $8): X2 Mult; Antique X4 (`Xmult` +20%: 2.4 / 2.8 / 3.2, Antique twice that).
  polteageist: {
    name: 'polteageist', poke_sprite391: sprite('Natdex', 28, 56),
    config: { extra: { Xmult: 2, num: 1, dem: 10 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'nature'], poke_after: 'sinistea',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult * 2), ex.num, ex.dem, tea_state(card)] }; },
    add_to_deck(self, card) { tea_roll(card); },
    calculate(self, card, context) {
      if (context.joker_main) { const x = tea_x(card); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Hatenna 856 (Psychic, Uncommon $6): +4 Mult for each Psychic Joker, itself included (`mult` +40%: 5.6 / 7.2 / 8.8). 4 rounds.
  hatenna: {
    name: 'hatenna', poke_sprite391: sprite('Natdex', 0, 57),
    config: { extra: { mult: 4, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'types', 'round_evo'], poke_after: 'polteageist',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = psychic_count(card); return { vars: [r3(ex.mult), n, r3(ex.mult * n), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = r3(card.ability.extra.mult * psychic_count(card)); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_hattrem');
    },
  },
  // Hattrem 857 (Safari $8): +6 Mult for each Psychic Joker, itself included (`mult` +40%: 8.4 / 10.8 / 13.2). 5 rounds.
  hattrem: {
    name: 'hattrem', poke_sprite391: sprite('Natdex', 2, 57),
    config: { extra: { mult: 6, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'types', 'round_evo'], poke_after: 'hatenna',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = psychic_count(card); return { vars: [r3(ex.mult), n, r3(ex.mult * n), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = r3(card.ability.extra.mult * psychic_count(card)); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_hatterene');
    },
  },
  // Hatterene 858 (Safari $10): X1 plus X0.25 for each Psychic Joker, itself included (`Xmult_mod` +20%: 0.3 / 0.35 / 0.4); Magic Powder: when
  // a Blind is selected, the Joker to its right gets a Psychic Tera sticker unless it is Psychic already (fixed; not Blueprint).
  hatterene: {
    name: 'hatterene', poke_sprite391: sprite('Natdex', 4, 57),
    config: { extra: { Xmult_mod: 0.25 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'types', 'tera'], poke_after: 'hattrem',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, n = psychic_count(card);
      return { vars: [r3(ex.Xmult_mod), n, r3(1 + ex.Xmult_mod * n)] };
    },
    calculate(self, card, context) {
      magic_powder(card, context);
      if (context.joker_main) { const x = r9(1 + card.ability.extra.Xmult_mod * psychic_count(card)); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Impidimp 859 (Fairy, Uncommon $6), Prankster: shop rerolls cost $1 less (`reroll_discount`, fixed; each copy stacks; never below $1, a free
  // reroll stays free). Carries Grimmsnarl's `Xmult_mod` (0.1: "Energy carries to Grimmsnarl"). 4 rounds.
  impidimp: {
    name: 'impidimp', poke_sprite391: sprite('Natdex', 6, 57),
    config: { extra: { reroll_discount: 1, Xmult_mod: 0.1, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Fairy', gen: 8, blueprint_compat: false,
    attributes: ['economy', 'reroll', 'round_evo'], poke_after: 'hatterene',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.reroll_discount, ex.rounds, r3(ex.Xmult_mod)] }; },
    calculate(self, card, context) { return level_evo(self, card, context, 'j_poke_morgrem'); },
    ...prank_recost,
  },
  // Morgrem 860 (Safari $8), Prankster: your first reroll in each shop is free (one however many are held; none on top of Chaos the Clown's /
  // a D6 Tag's: whatever makes the shop's first reroll free uses it). r73 (the owner's): it keeps Impidimp's discount, shop rerolls $1 less
  // (`reroll_discount`, fixed; never below $1; prank_discount73). Carries Grimmsnarl's `Xmult_mod`. 5 rounds.
  morgrem: {
    name: 'morgrem', poke_sprite391: sprite('Natdex', 8, 57),
    config: { extra: { reroll_discount: 1, Xmult_mod: 0.1, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fairy', gen: 8, blueprint_compat: false,
    attributes: ['economy', 'reroll', 'round_evo'], poke_after: 'impidimp',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [prank_state(), ex.rounds, r3(ex.Xmult_mod), ex.reroll_discount] }; },
    calculate(self, card, context) { return level_evo(self, card, context, 'j_poke_grimmsnarl'); },
    ...prank_recost,
  },
  // Grimmsnarl 861 (Safari $10): Prankster (the first reroll in each shop free) and it permanently gains X0.1 for every shop reroll, free ones
  // included (`prank_Xmult` from X1, banked; gain `Xmult_mod` +20%: 0.12 / 0.14 / 0.16). Blueprint copies the X, never the gain.
  grimmsnarl: {
    name: 'grimmsnarl', poke_sprite391: sprite('Natdex', 10, 57),
    config: { extra: { prank_Xmult: 1, Xmult_mod: 0.1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fairy', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'economy', 'reroll'], poke_after: 'morgrem',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [prank_state(), r3(ex.Xmult_mod), r3(ex.prank_Xmult)] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.reroll_shop && !context.blueprint && !context.retrigger_joker) {
        ex.prank_Xmult = r3(ex.prank_Xmult + ex.Xmult_mod);
        card_eval_status_text(card, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_xmult', vars: [ex.prank_Xmult] }), colour: 'XMULT' });
        return undefined;
      }
      if (context.joker_main && ex.prank_Xmult > 1) return { message: a_xmult(r3(ex.prank_Xmult)), colour: 'XMULT', Xmult_mod: ex.prank_Xmult };
      return undefined;
    },
    ...prank_recost,
  },
}, FILE);

// ---------------------------------------------------------------- Gen 8, batch 3 (contentRev 72; the owner's "yes build it", 2026-11-02), #862-902
/** Alcremie's 63 forms (Sweet x Cream): upstream 3.9.1 draws every one on the Gen 8 sheet, UNLISTED beside its own card {10,0} (Strawberry
 *  Sweet, Vanilla Cream): sweet-major, nine creams each, in reading order ({10,0} {12,0} {14,0}, then rows 1-7 x 0-14, then row 8 x 0-6). */
export const ALCREMIE_SWEETS = ['Strawberry', 'Berry', 'Love', 'Star', 'Clover', 'Flower', 'Ribbon'];
export const ALCREMIE_CREAMS = ['Vanilla Cream', 'Ruby Cream', 'Matcha Cream', 'Mint Cream', 'Lemon Cream', 'Salted Cream', 'Ruby Swirl', 'Caramel Swirl', 'Rainbow Swirl'];
export const alcremie_cell = (i) => (i < 3 ? { x: 10 + 2 * i, y: 0 } : { x: ((i - 3) % 8) * 2, y: 1 + Math.floor((i - 3) / 8) });
const alcremie_form = (card) => { const f = card.ability.extra.form; return Number.isInteger(f) && f >= 0 && f < 63 ? f : 0; };
const alcremie_name = (card) => { const f = alcremie_form(card); return ALCREMIE_SWEETS[Math.floor(f / 9)] + ' Sweet, ' + ALCREMIE_CREAMS[f % 9]; };
/** Milcery / Alcremie, Decorate: each scored card with an edition (any: Foil, Holographic, Polychrome, a mod's) gives +mult. */
function decorate(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && !context.other_card.debuff && context.other_card.edition) return { mult: card.ability.extra.mult, card };
  return undefined;
}
/** Alcremie, Whipped Cream: when a Blind is selected, ONE random card of the full deck with no edition (the run's seeded pseudorandom_element,
 *  'poke_alcremie_cream') becomes Foil or Holographic (a seeded coin, 'poke_alcremie_topping'). None without an edition: nothing (it never
 *  overwrites one). Blueprint copies it (a second card), as blind_convert. */
function whipped_cream(card, context) {
  if (!context.setting_blind || card.getting_sliced || (context.blueprint_card && context.blueprint_card.getting_sliced)) return;
  const plain = (G.playing_cards || []).filter((c) => unbroken(c) && !c.edition);
  if (!plain.length) return;
  const [pick] = pseudorandom_element(plain, pseudoseed('poke_alcremie_cream'));
  const holo = pseudorandom(pseudoseed('poke_alcremie_topping')) < 0.5;
  pick.set_edition(holo ? { holo: true } : { foil: true }, true, true);
  G.E_MANAGER.add_event(() => { pick.juice_up(); });
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: holo ? 'Holographic!' : 'Foil!', colour: 'DARK_EDITION' });
}
/** Falinks, Formation: every scored card shares one suit (is_suit, its suit read through a debuff: a Wild card fits any, a Stone card has
 *  none and breaks it; Smeared Joker joins red / black as usual). */
const SUITS4 = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
const in_formation = (cards) => !!(cards && cards.length) && SUITS4.some((s) => cards.every((c) => c.is_suit(s, true)));
/** Pincurchin, Lightning Rod: Lightning Energy cards used this run (the engine's run-long consumeable_usage, from the run's start: a late
 *  buy counts every one; whatever it was used on, or nothing energized). */
const lightning_used = () => (((G.GAME && G.GAME.consumeable_usage) || {}).c_poke_lightning_energy || {}).count || 0;
const pincurchin_x = (card) => r9(1 + card.ability.extra.Xmult_mod * lightning_used());
/** Snom / Frosmoth: a Glass card. */
const glass_scored = (context) => !!(context.individual && context.cardarea === G.play && !context.end_of_round && !context.other_card.debuff && has_enhancement(context.other_card, 'm_glass'));
const glass_held = (context) => !!(context.individual && context.cardarea === G.hand && !context.end_of_round && !context.other_card.debuff && has_enhancement(context.other_card, 'm_glass'));
/** The round's weather as Castform reads it on the round's first deal (Kyogre / Groudon lock it, Volcarona brings the sun, else the suit held
 *  most: forecast). Read by Eiscue on that same first deal. */
const round_forecast = () => { const lock = castform_lock(); return lock === 'rainy' ? lock : volcarona_sun() ? 'sunny' : lock || forecast(G.hand.cards); };
/** Eiscue, Ice Face: X(Xmult) while its ice holds (form 'ice'); X(Xmult2) once broken (form 'noice', Noice Face's card). The ice breaks
 *  when the round's FIRST hand doesn't beat the Blind (in `after`, the hand's total added to the round's chips is still below the Blind's
 *  requirement: the round goes on); once a round at most, not a Blueprint's. It re-forms on the first deal of the next round whose
 *  forecast (round_forecast, Castform's) is Snowy. */
const eiscue_broken = (card) => card.ability.extra.form === 'noice';
function ice_face(card, context) {
  const ex = card.ability.extra;
  if (first_deal(card, context, 'snow_round')) {
    ex.snow_round = G.GAME.round;
    if (eiscue_broken(card) && round_forecast() === 'snowy') {
      ex.form = 'ice';
      card_eval_status_text(card, 'extra', null, null, null, { message: 'Ice Face!', colour: '#8fd8ff' });
    }
    return undefined;
  }
  if (context.joker_main) { const x = eiscue_broken(card) ? ex.Xmult2 : ex.Xmult; return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
  if (context.after && !context.blueprint && !context.retrigger_joker && !eiscue_broken(card) && G.GAME.facing_blind && G.GAME.current_round.hands_played === 0
    && BN.lt(BN.add(G.GAME.chips, G.GAME.last_hand_total || 0), G.GAME.blind.chips)) {
    ex.form = 'noice';
    card_eval_status_text(card, 'extra', null, null, null, { message: 'Noice Face!', colour: 'XMULT' });
  }
  return undefined;
}
/** Indeedee: its gender, rolled when it is OBTAINED (add_to_deck, if none yet: Salandit's moment, the run's seeded 'indeedee_gender', 50/50;
 *  kept on ability.extra.gender). ♂: X(Xmult) and +card_limit consumable slot (Slurpuff's pair: while held AND undebuffed). ♀: each Tarot
 *  used earns $tarot_money (fixed; its `Xmult` is dropped when it rolls ♀, so it takes no Energy). */
const indeedee_gender = (card) => (card.ability.extra.gender === 'male' || card.ability.extra.gender === 'female' ? card.ability.extra.gender : null);
/** Morpeko, Hunger Switch: Full Belly +mult / Hangry X(Xmult), switching after EVERY hand played (in `after`, a debuffed hand too; not a
 *  Blueprint's), carried across rounds (and through save / resume: ability.extra.form). A new Morpeko starts Full Belly. */
const morpeko_hangry = (card) => card.ability.extra.form === 'hangry';
/** Obstagoon, Blocking: a Boss Blind whose ability is on (not disabled, not suspended) while any of your playing cards (the full deck) or
 *  Jokers is debuffed. Read live when it scores. */
const boss_debuffing = () => {
  const GM = G.GAME, b = GM && GM.blind;
  if (!GM || !GM.facing_blind || !b || !b.boss || b.off) return false;
  return (G.playing_cards || []).some((c) => c.debuff) || ((G.jokers && G.jokers.cards) || []).some((j) => j.debuff);
};
/** Cursola, Perish Body: it crumbles (destroyed: start_dissolve, so "a Joker is destroyed" counts it) at the end of its `perish_rounds`th
 *  round held (counted from its evolution, the round it evolved in included; the main end_of_round pass, so a debuffed one doesn't count
 *  down; not a Blueprint's). An Eternal one never crumbles. */
function perish_body(card, context) {
  const ex = card.ability.extra;
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over) return;
  ex.perish_rounds = Math.max(0, ex.perish_rounds - 1);
  if (ex.perish_rounds > 0 || card.ability.eternal || card.getting_sliced) {
    if (ex.perish_rounds > 0) card_eval_status_text(card, 'extra', null, null, null, { message: ex.perish_rounds + ' left', colour: 'FILTER' });
    return;
  }
  card.getting_sliced = true;
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Crumbled!', colour: 'RED' });
  G.E_MANAGER.add_event(() => { play_sound('tarot1'); card.start_dissolve(); });
}
/** Sirfetch'd, Meteor Assault: the Lucky hits this round while it is held (Farfetch'd's count, jokers/pokejokers_03.js: a card hitting both
 *  rolls counts 2; not a Blueprint's copy); X(1 + Xmult_mod per hit) when it scores. */
const meteor_count = (card) => { const ex = card.ability.extra; return G.GAME && ex.lucky_round === G.GAME.round ? (ex.lucky_count || 0) : 0; };
function meteor_assault(card, context) {
  const ex = card.ability.extra;
  if (lucky_scored(context) && !context.blueprint) { const n = meteor_count(card); ex.lucky_round = G.GAME.round; ex.lucky_count = n + lucky_procs(context.other_card); return undefined; }
  if (context.joker_main && meteor_count(card) > 0) { const x = r9(1 + ex.Xmult_mod * meteor_count(card)); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
  return undefined;
}
/** Mr. Rime, Screen Cleaner: the Boss Blind's ability is off for your FINAL hand of the round (Amoonguss's Blind.suspend): from the draw that
 *  leaves exactly 1 hand to play (index.js draw_from_deck_to_hand -> rime_final_deal, before the drawn cards land) until that hand has
 *  scored (spore_hand_scored). A hand gained during it (+1 hand) makes the next one the final hand: off again then. Boss Blinds only, with
 *  an undebuffed Mr. Rime held at that draw; sold or debuffed meanwhile (no other one left), the Blind comes back at once. */
export function rime_final_deal() {
  const GM = G.GAME, b = GM && GM.blind, cr = GM && GM.current_round;
  if (!b || !GM.facing_blind || !b.boss || b.disabled || b.suspended || !cr || cr.hands_left !== 1) return;
  if (G.STATE !== G.STATES.DRAW_TO_HAND) return;
  const rimes = find_card('j_poke_mrrime');
  if (!rimes.length) return;
  b.suspend(true);
  card_eval_status_text(rimes[0], 'extra', null, null, null, { message: 'Screen Cleaner!', colour: 'BLUE' });
}
const rime_state = () => {
  const GM = G.GAME, b = GM && GM.blind;
  if (!GM || !GM.facing_blind || !b || !b.boss) return 'Boss Blinds only';
  if (b.suspended && GM.current_round.hands_left <= 1) return 'active this hand';
  return 'on your final hand';
};
/** Basculegion, Last Respects: Jokers sold or destroyed this RUN (G.GAME.poke_jokers_gone, counted from the run's start by index.js: every
 *  Joker sold from your row, and every one of yours destroyed — start_dissolve —; a transformation never; a late buy counts them all). */
export function jokers_gone_count(card) {
  if (!G.GAME || !card || !card.ability || card.ability.set !== 'Joker' || card.area !== G.jokers || card.removed) return;
  G.GAME.poke_jokers_gone = (G.GAME.poke_jokers_gone || 0) + 1;
}
const jokers_gone = () => (G.GAME && G.GAME.poke_jokers_gone) || 0;
/** The Galar fossils, Ancient Jacks (Kabuto's / Tirtouga's cumulative tiers by the Jacks in the scoring hand): one body each. */
const JACK = 11;
const jacks = (context) => ancient_count(context, JACK);
const is_jack = (c) => !!c && !has_no_rank(c) && c.get_id() === JACK;
const first_jack = (context) => (context.scoring_hand || []).find(is_jack);

defineJokers({
  // The owner's Gen 8 batch 3 ("yes build it", 2026-11-02): 21 jokers, #862-902, on the guide's price slots (2-stage C $5 / S $8,
  // single-stage R $7, a Stage 2 S $10); evolution by rounds (5). Types = the cards' (pokermon_art_type.mjs). Energy raises the main number
  // at the standard share; money, slots, odds, retriggers, counts and thresholds are fixed; banks never retroactive and carried. Six are NEW
  // EVOLUTIONS of existing jokers (an approved exception to "base Pokermon wins"; the upstream jokers otherwise unchanged; gated by rules rev
  // 72, so older runs replay as recorded): Linoone -> Obstagoon (a Dark Energy), Corsola -> Cursola (a Psychic Energy), Farfetch'd ->
  // Sirfetch'd (3 Lucky triggers in a round), Mr. Mime -> Mr. Rime (a Water Energy), Yamask -> Runerigus (10 Stones scored), Basculin ->
  // Basculegion (25 cards of its stripe). Art: upstream 3.9.1's own cells (Natdex {12,57}-{24,58}; Gen 8 Alcremie {10,0} + its 62 other
  // forms, Eiscue {8,8} / Noice {10,8}, Indeedee {12,8} / ♀ {14,8}, Morpeko {0,9} / Hangry {2,9}, Basculegion {2,11}); nothing to deploy.
  // Pokédex order: Obstagoon ... Arctovish (862-883) after Grimmsnarl, before Dreepy; Basculegion (902) after Ursaluna.
  //
  // Obstagoon 862 (Dark, Stage 2 Safari $10), Blocking: X2 Mult, X3 while the Boss Blind is debuffing any of your cards (`Xmult` /
  // `Xmult2` +20%: 2.4 / 2.8 / 3.2 and 3.6 / 4.2 / 4.8).
  obstagoon: {
    name: 'obstagoon', poke_sprite391: sprite('Natdex', 12, 57),
    config: { extra: { Xmult: 2, Xmult2: 3 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Dark', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'boss_blind', 'debuff'], poke_after: 'grimmsnarl',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult2), boss_debuffing() ? 'Blocking!' : 'no debuffing Boss'] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const ex = card.ability.extra, x = boss_debuffing() ? ex.Xmult2 : ex.Xmult; return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Cursola 864 (Psychic, Safari $8), Perish Body: X3 Mult (`Xmult` +20%: 3.6 / 4.2 / 4.8); crumbles at the end of its 4th round held
  // (`perish_rounds`, fixed).
  cursola: {
    name: 'cursola', poke_sprite391: sprite('Natdex', 16, 57),
    config: { extra: { Xmult: 3, perish_rounds: 4 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'self_destruct'], poke_after: 'obstagoon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), ex.perish_rounds] }; },
    calculate(self, card, context) {
      perish_body(card, context);
      if (context.joker_main) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Sirfetch'd 865 (Fighting, Safari $8), Meteor Assault: X1 + X0.5 per Lucky trigger this round (`Xmult_mod` +20%: 0.6 / 0.7 / 0.8).
  sirfetchd: {
    name: 'sirfetchd', poke_sprite391: sprite('Natdex', 18, 57),
    config: { extra: { Xmult_mod: 0.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fighting', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'chance'], poke_after: 'cursola',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); const ex = card.ability.extra, n = meteor_count(card); return { vars: [r3(ex.Xmult_mod), n, r3(1 + ex.Xmult_mod * n)] }; },
    calculate(self, card, context) { return meteor_assault(card, context); },
  },
  // Mr. Rime 866 (Water, Safari $8), Screen Cleaner: the Boss Blind's ability is off on your final hand (rime_final_deal). No number:
  // Energy-inert.
  mrrime: {
    name: 'mrrime', poke_sprite391: sprite('Natdex', 20, 57),
    config: { extra: {} },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 8, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['boss_blind', 'debuff'], poke_after: 'sirfetchd',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [rime_state()] }; },
    remove_from_deck(self, card) {
      // sold, destroyed or debuffed during the suspended final hand, with no other Mr. Rime (and not Amoonguss's first hand): back at once
      const GM = G.GAME, b = GM && GM.blind;
      if (!b || !b.suspended || GM.current_round.hands_left > 1) return;
      G.E_MANAGER.add_event(() => {
        const spore = GM.current_round.hands_played === 0 && find_card('j_poke_amoonguss').length > 0;
        if (b.suspended && !find_card('j_poke_mrrime').length && !spore) b.suspend(false);
      });
    },
  },
  // Runerigus 867 (Psychic, Safari $8), Wandering Spirit: each scored Stone card gives X1.25 (`Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375);
  // keeps giving Yamask's banked grudge X (`grudge_Xmult`; it banks no more).
  runerigus: {
    name: 'runerigus', poke_sprite391: sprite('Natdex', 22, 57),
    config: { extra: { grudge_Xmult: 1, Xmult_multi: 1.25 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'enhancements'], poke_after: 'mrrime',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_multi), r3(ex.grudge_Xmult)] }; },
    calculate(self, card, context) {
      if (stone_scored(context) && !context.other_card.debuff) return { x_mult: card.ability.extra.Xmult_multi, card };
      return grudge_main(card, context);
    },
  },
  // Milcery 868 (Fairy, Common $5), Decorate: each scored card with an edition gives +5 Mult (`mult` +40%: 7 / 9 / 11). 5 rounds.
  milcery: {
    name: 'milcery', poke_sprite391: sprite('Natdex', 24, 57),
    config: { extra: { mult: 5, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fairy', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'editions', 'round_evo'], poke_after: 'runerigus',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { return decorate(card, context) || level_evo(self, card, context, 'j_poke_alcremie'); },
  },
  // Alcremie 869 (Safari $8): Decorate kept (`mult` +40%); Whipped Cream: when a Blind is selected a random card in your deck with no edition
  // becomes Foil or Holographic (whipped_cream). Its Sweet x Cream form (63) is rolled when it becomes an Alcremie (seeded), art only.
  alcremie: {
    name: 'alcremie', poke_sprite391: sprite('Gen08', 10, 0),
    config: { extra: { mult: 5, form: 0 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fairy', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'editions', 'modify_card', 'full_deck'], poke_after: 'milcery',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.e_foil); info_queue.push(P_CENTERS.e_holo);
      return { vars: [r3(card.ability.extra.mult), alcremie_name(card)] };
    },
    set_ability(self, card, initial) { if (initial) card.ability.extra.form = Math.min(62, Math.floor(pseudorandom(pseudoseed('alcremie_form')) * 63)); },
    calculate(self, card, context) { whipped_cream(card, context); return decorate(card, context); },
  },
  // Falinks 870 (Fighting, Rare $7, single-stage), Formation: if every scored card shares a suit, each gives +6 Mult (`mult` +40%: 8.4 /
  // 10.8 / 13.2).
  falinks: {
    name: 'falinks', poke_sprite391: sprite('Natdex', 28, 57),
    config: { extra: { mult: 6 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Fighting', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'suits'], poke_after: 'alcremie',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.mult)] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && !context.other_card.debuff && in_formation(context.scoring_hand)) return { mult: card.ability.extra.mult, card };
      return undefined;
    },
  },
  // Pincurchin 871 (Lightning, Rare $7), Lightning Rod: X1 + X0.25 per Lightning Energy card used this run (`Xmult_mod` +20%: 0.3 / 0.35 / 0.4).
  pincurchin: {
    name: 'pincurchin', poke_sprite391: sprite('Natdex', 0, 58),
    config: { extra: { Xmult_mod: 0.25 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Lightning', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'energy'], poke_after: 'falinks',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_mod), lightning_used(), r3(pincurchin_x(card))] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const x = pincurchin_x(card); if (x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Snom 872 (Water, Common $5): each scored Glass card gives +6 Mult (`mult` +40%: 8.4 / 10.8 / 13.2). 5 rounds.
  snom: {
    name: 'snom', poke_sprite391: sprite('Natdex', 2, 58),
    config: { extra: { mult: 6, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'round_evo'], poke_after: 'pincurchin',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_glass); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { if (glass_scored(context)) return { mult: card.ability.extra.mult, card }; return level_evo(self, card, context, 'j_poke_frosmoth'); },
  },
  // Frosmoth 873 (Safari $8), Ice Scales: each Glass card held in hand gives X1.2 (`Xmult_multi` +5%: 1.26 / 1.32 / 1.38).
  frosmoth: {
    name: 'frosmoth', poke_sprite391: sprite('Natdex', 4, 58),
    config: { extra: { Xmult_multi: 1.2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'hand'], poke_after: 'snom',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_glass); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) { if (glass_held(context)) return { x_mult: card.ability.extra.Xmult_multi, card }; return undefined; },
  },
  // Eiscue 875 (Water, Rare $7), Ice Face: X2.5 (`Xmult` +20%: 3 / 3.5 / 4); broken by a round's first hand that doesn't beat the Blind,
  // Noice Face X1.25 (`Xmult2` +20%: 1.5 / 1.75 / 2) until a Snowy round re-forms it (ice_face). Each face its own 3.9.1 card.
  eiscue: {
    name: 'eiscue', poke_sprite391: sprite('Gen08', 8, 8),
    config: { extra: { Xmult: 2.5, Xmult2: 1.25, form: 'ice' } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'hand_drawn', 'suits'], poke_after: 'frosmoth',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult2)], key: eiscue_broken(card) ? 'j_poke_eiscue_noice' : undefined }; },
    calculate(self, card, context) { return ice_face(card, context); },
  },
  // Indeedee 876 (Psychic, Rare $7): its gender rolled when obtained. ♂: X1.5 Mult (`Xmult` +20%: 1.8 / 2.1 / 2.4) and +1 consumable slot
  // (fixed). ♀: each Tarot used earns $2 (fixed: Energy-inert). Each its own 3.9.1 card.
  indeedee: {
    name: 'indeedee', poke_sprite391: sprite('Gen08', 12, 8),
    config: { extra: { Xmult: 1.5, card_limit: 1, tarot_money: 2 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'consumable_slot', 'money', 'tarot'], poke_after: 'eiscue',
    poke_view_form(self, card) { return indeedee_gender(card) || 'male'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, g = indeedee_gender(card);
      return { vars: [r3(ex.Xmult === undefined ? self.config.extra.Xmult : ex.Xmult), ex.card_limit, ex.tarot_money], key: g ? 'j_poke_indeedee_' + g : undefined };
    },
    add_to_deck(self, card) {
      const ex = card.ability.extra;
      if (!indeedee_gender(card)) {
        ex.gender = pseudorandom(pseudoseed('indeedee_gender')) < 0.5 ? 'female' : 'male';
        if (ex.gender === 'female') delete ex.Xmult;
      }
      if (ex.gender === 'male') G.consumeables.config.card_limit += ex.card_limit;
    },
    remove_from_deck(self, card) { if (indeedee_gender(card) === 'male') G.consumeables.config.card_limit -= card.ability.extra.card_limit; },
    calculate(self, card, context) {
      const ex = card.ability.extra, g = indeedee_gender(card);
      if (g === 'male' && context.joker_main) return { message: a_xmult(r3(ex.Xmult)), colour: 'XMULT', Xmult_mod: ex.Xmult };
      if (g === 'female' && context.using_consumeable && context.consumeable && context.consumeable.ability.set === 'Tarot') {
        ease_dollars(ex.tarot_money);
        card_eval_status_text(context.blueprint_card || card, 'dollars', ex.tarot_money);
      }
      return undefined;
    },
  },
  // Morpeko 877 (Lightning, Rare $7), Hunger Switch: Full Belly +20 Mult / Hangry X2, switching after every hand played (`mult` +40%: 28 /
  // 36 / 44; `Xmult` +20%: 2.4 / 2.8 / 3.2). Each mode its own 3.9.1 card (its type stays Lightning).
  morpeko: {
    name: 'morpeko', poke_sprite391: sprite('Gen08', 0, 9),
    config: { extra: { mult: 20, Xmult: 2, form: 'full' } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Lightning', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'xmult'], poke_after: 'indeedee',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), r3(ex.Xmult), morpeko_hangry(card) ? 'Hangry' : 'Full Belly'] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.joker_main) return morpeko_hangry(card) ? { message: a_xmult(r3(ex.Xmult)), colour: 'XMULT', Xmult_mod: ex.Xmult } : { message: a_mult(r3(ex.mult)), colour: 'MULT', mult_mod: ex.mult };
      if (context.after && !context.blueprint && !context.retrigger_joker) {
        ex.form = morpeko_hangry(card) ? 'full' : 'hangry';
        card_eval_status_text(card, 'extra', null, null, null, { message: morpeko_hangry(card) ? 'Hangry!' : 'Full Belly!', colour: morpeko_hangry(card) ? 'XMULT' : 'MULT' });
      }
      return undefined;
    },
  },
  // Cufant 878 (Metal, Common $5): +10 Chips for each Steel card in your full deck (`chips` +30%: 13 / 16 / 19). 5 rounds.
  cufant: {
    name: 'cufant', poke_sprite391: sprite('Natdex', 14, 58),
    config: { extra: { chips: 10, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Metal', gen: 8, blueprint_compat: true,
    attributes: ['chips', 'enhancements', 'full_deck', 'round_evo'], poke_after: 'morpeko',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.chips * steel_in_deck()), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const c = r3(card.ability.extra.chips * steel_in_deck()); if (c > 0) return { message: a_chips(c), colour: 'CHIPS', chip_mod: c }; }
      return level_evo(self, card, context, 'j_poke_copperajah');
    },
  },
  // Copperajah 879 (Safari $8): each Steel card held in hand at end of round earns $1 (Gold card style; `steel_money`, fixed: Energy-inert).
  copperajah: {
    name: 'copperajah', poke_sprite391: sprite('Natdex', 16, 58),
    config: { extra: { steel_money: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Metal', gen: 8, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['money', 'economy', 'enhancements', 'hand'], poke_after: 'cufant',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); return { vars: [card.ability.extra.steel_money] }; },
    calculate(self, card, context) {
      const oc = context.other_card;
      if (context.end_of_round && context.individual && context.cardarea === G.hand && oc && !oc.debuff && has_enhancement(oc, 'm_steel')) {
        const n = card.ability.extra.steel_money;
        G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + n;
        G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
        return { dollars: n, card: oc };
      }
      return undefined;
    },
  },
  // Dracozolt 880 (Lightning, Rare $7), Ancient Jacks: 1+ +5 Mult (`mult` +40%: 7 / 9 / 11); 2+ X1.5 (`Xmult` +20%: 1.8 / 2.1 / 2.4); 3+ earn
  // $3 (`ancient_money`, fixed; once a hand).
  dracozolt: {
    name: 'dracozolt', poke_sprite391: sprite('Natdex', 18, 58),
    config: { extra: { rank: 'Jack', mult: 5, Xmult: 1.5, ancient_money: 3 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Lightning', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'money', 'ancient', 'rank', 'face'], poke_after: 'copperajah',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); ancient_tip(info_queue, 'Jack'); const ex = card.ability.extra; return { vars: [localize('Jack', 'ranks'), r3(ex.mult), r3(ex.Xmult), ex.ancient_money] }; },
    calculate(self, card, context) {
      if (!context.joker_main || !context.scoring_hand) return undefined;
      const n = jacks(context), ex = card.ability.extra;
      if (n < 1) return undefined;
      const r = { mult_mod: ex.mult, message: a_mult(r3(ex.mult)), colour: 'MULT' };
      if (n >= 2) { r.Xmult_mod = ex.Xmult; r.message = a_xmult(r3(ex.Xmult)); r.colour = 'XMULT'; }
      if (n >= 3) r.dollars = ex.ancient_money;
      return r;
    },
  },
  // Arctozolt 881 (Lightning, Rare $7), Ancient Jacks: 1+ +40 Chips (`chips` +30%: 52 / 64 / 76); 2+ scored Jacks retrigger once (fixed); 3+
  // X2 (`Xmult` +20%: 2.4 / 2.8 / 3.2).
  arctozolt: {
    name: 'arctozolt', poke_sprite391: sprite('Natdex', 20, 58),
    config: { extra: { rank: 'Jack', chips: 40, retriggers: 1, Xmult: 2 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Lightning', gen: 8, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'retrigger', 'ancient', 'rank', 'face'], poke_after: 'dracozolt',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); ancient_tip(info_queue, 'Jack'); const ex = card.ability.extra; return { vars: [localize('Jack', 'ranks'), r3(ex.chips), ex.retriggers, r3(ex.Xmult)] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.repetition && context.cardarea === G.play && context.scoring_hand && is_jack(context.other_card) && jacks(context) >= 2) return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
      if (!context.joker_main || !context.scoring_hand) return undefined;
      const n = jacks(context);
      if (n < 1) return undefined;
      const r = { chip_mod: ex.chips, message: a_chips(r3(ex.chips)), colour: 'CHIPS' };
      if (n >= 3) { r.Xmult_mod = ex.Xmult; r.message = a_xmult(r3(ex.Xmult)); r.colour = 'XMULT'; }
      return r;
    },
  },
  // Dracovish 882 (Water, Rare $7), Ancient Jacks: 1+ +5 Mult (`mult` +40%); 2+ the first scored Jack retriggers twice (fixed); 3+ X2 (`Xmult`
  // +20%: 2.4 / 2.8 / 3.2).
  dracovish: {
    name: 'dracovish', poke_sprite391: sprite('Natdex', 22, 58),
    config: { extra: { rank: 'Jack', mult: 5, retriggers: 2, Xmult: 2 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'retrigger', 'ancient', 'rank', 'face'], poke_after: 'arctozolt',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); ancient_tip(info_queue, 'Jack'); const ex = card.ability.extra; return { vars: [localize('Jack', 'ranks'), r3(ex.mult), ex.retriggers, r3(ex.Xmult)] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.repetition && context.cardarea === G.play && context.scoring_hand && context.other_card === first_jack(context) && jacks(context) >= 2) return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
      if (!context.joker_main || !context.scoring_hand) return undefined;
      const n = jacks(context);
      if (n < 1) return undefined;
      const r = { mult_mod: ex.mult, message: a_mult(r3(ex.mult)), colour: 'MULT' };
      if (n >= 3) { r.Xmult_mod = ex.Xmult; r.message = a_xmult(r3(ex.Xmult)); r.colour = 'XMULT'; }
      return r;
    },
  },
  // Arctovish 883 (Water, Rare $7), Ancient Jacks: 1+ +40 Chips (`chips` +30%); 2+ X1.5 (`Xmult` +20%: 1.8 / 2.1 / 2.4); 3+ +1 hand this
  // round (`hands`, fixed; once a round, `hand_round`; not Blueprint).
  arctovish: {
    name: 'arctovish', poke_sprite391: sprite('Natdex', 24, 58),
    config: { extra: { rank: 'Jack', chips: 40, Xmult: 1.5, hands: 1 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'hands', 'ancient', 'rank', 'face'], poke_after: 'dracovish',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); ancient_tip(info_queue, 'Jack'); const ex = card.ability.extra;
      return { vars: [localize('Jack', 'ranks'), r3(ex.chips), r3(ex.Xmult), ex.hands, G.GAME && ex.hand_round === G.GAME.round ? 'used this round' : 'ready'] };
    },
    calculate(self, card, context) {
      if (!context.joker_main || !context.scoring_hand) return undefined;
      const n = jacks(context), ex = card.ability.extra;
      if (n < 1) return undefined;
      if (n >= 3 && !context.blueprint && !context.retrigger_joker && ex.hand_round !== G.GAME.round) {
        ex.hand_round = G.GAME.round;
        ease_hands_played(ex.hands);
        card_eval_status_text(card, 'extra', null, null, null, { message: '+' + ex.hands + ' Hand', colour: 'CHIPS' });
      }
      const r = { chip_mod: ex.chips, message: a_chips(r3(ex.chips)), colour: 'CHIPS' };
      if (n >= 2) { r.Xmult_mod = ex.Xmult; r.message = a_xmult(r3(ex.Xmult)); r.colour = 'XMULT'; }
      return r;
    },
  },
  // Basculegion 902 (Psychic: its card; Safari $8), Last Respects: X1 + X0.1 for each Joker sold or destroyed this run (`Xmult_mod` +20%:
  // 0.12 / 0.14 / 0.16; jokers_gone).
  basculegion: {
    name: 'basculegion', poke_sprite391: sprite('Gen08', 2, 11),
    config: { extra: { Xmult_mod: 0.1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'on_sell'], poke_after: 'ursaluna',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = jokers_gone(); return { vars: [r3(ex.Xmult_mod), n, r3(1 + ex.Xmult_mod * n)] }; },
    calculate(self, card, context) {
      if (context.joker_main && jokers_gone() > 0) { const x = r9(1 + card.ability.extra.Xmult_mod * jokers_gone()); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
}, FILE);

// ---------------------------------------------------------------- Gen 8, batch 4: the Gen 8 Legendaries (contentRev 74; the owner's "Yes", 2026-11-03)
/** Zacian / Zamazenta / Eternatus count the Boss Blinds beaten while held (the main end_of_round pass with beat_boss, Beast Boost's moment:
 *  not on a game over, not a Blueprint's, not a joker retrigger; a debuffed one isn't calculated, so that Boss doesn't count). The count
 *  lives on the card (`crown_bosses`, capped at CROWN_AT; Eternatus's `bosses`), so save / resume / replay rebuild the forms from it. */
const boss_beaten = (context) => !!(round_end(context) && context.beat_boss && !context.game_over && !context.blueprint && !context.retrigger_joker);
export const CROWN_AT = 3;
export const crowned = (card) => (card.ability.extra.crown_bosses || 0) >= CROWN_AT;
const crown_state = (card, form) => (crowned(card) ? form : 'Boss Blinds: ' + (card.ability.extra.crown_bosses || 0) + '/' + CROWN_AT);
/** Zacian / Zamazenta: +1 to the count for each Boss Blind beaten, until crowned (the 3rd Boss crowns it: the next hand pays the crown).
 *  `on_crown` runs once, at that moment. Returns true on the end-of-round pass it counted on. */
function crown_tick(card, context, word, on_crown) {
  if (!boss_beaten(context) || crowned(card)) return false;
  const ex = card.ability.extra;
  ex.crown_bosses = (ex.crown_bosses || 0) + 1;
  if (crowned(card)) {
    if (on_crown) on_crown(card);
    card_eval_status_text(card, 'extra', null, null, null, { message: word + '!', colour: 'GOLD' });
  } else card_eval_status_text(card, 'extra', null, null, null, { message: ex.crown_bosses + '/' + CROWN_AT, colour: 'FILTER' });
  return true;
}
/** Zamazenta, Crowned Shield: its +hands become `crowned_hands` IN ALL (+2, not +1 +2): the difference is added to the round's hands now
 *  (round_resets: the next round has them) and `hands` is raised, so the +hands pair (Squirtle's) takes the full 2 back when it leaves. */
function shield_crown(card) {
  const ex = card.ability.extra, d = ex.crowned_hands - ex.hands;
  if (d <= 0) return;
  G.GAME.round_resets.hands = G.GAME.round_resets.hands + d;
  ex.hands = ex.crowned_hands;
}
/** Eternatus, Dynamax: each Boss Blind beaten banks +Xmult_mod on `eterna_Xmult` (from X1; never retroactive). Eternamax for good from the
 *  ETERNAMAX_AT-th Boss (counted in `bosses`): its X is the bank x ETERNAMAX_X (both fixed), and the bank keeps growing, so each later Boss
 *  adds twice the gain to what it scores. The Boss that makes it Eternamax banks first, then doubles. */
export const ETERNAMAX_AT = 5;
export const ETERNAMAX_X = 2;
export const eternamax = (card) => (card.ability.extra.bosses || 0) >= ETERNAMAX_AT;
export const eterna_x = (card) => r9((card.ability.extra.eterna_Xmult || 1) * (eternamax(card) ? ETERNAMAX_X : 1));
/** Zarude, Jungle Drain: when a Blind is selected (not a Blueprint's: a copy would drain twice), each OTHER Joker loses `drain` of sell
 *  value (Pokermon's Drain, Lampent's: poke_drain one way, never below $1; one already at $1 gives nothing); +Xmult_mod banked per $1
 *  actually drained (`jungle_Xmult` from X1). Debuffed Jokers are drained too, as Lampent's. */
function jungle_drain(card, context) {
  if (!context.setting_blind || context.blueprint || context.retrigger_joker || card.getting_sliced) return false;
  let n = 0;
  for (const j of G.jokers.cards.slice()) {
    if (j === card || j.getting_sliced || !(j.sell_cost > 1)) continue;
    const before = j.sell_cost;
    poke_drain(card, j, card.ability.extra.drain, true);
    n += Math.max(0, before - j.sell_cost);
  }
  if (n > 0) bank(card, 'jungle_Xmult', 'Xmult_mod', n, 'XMULT');
  return true;
}
/** Regidrago, Dragon Energy: X(Xmult) on the round's first hand, X`drago_step` less for each hand already played this round
 *  (current_round.hands_played while scoring: the hands before this one), never below X1. */
const drago_x = (card) => { const ex = card.ability.extra, hp = (G.GAME && G.GAME.current_round && G.GAME.current_round.hands_played) || 0; return Math.max(1, r9(ex.Xmult - ex.drago_step * hp)); };
/** Glastrier, Chilling Neigh (hook chip_x_mult): a Glass card's X Mult becomes the best undebuffed Glastrier's `Xmult_multi` (X2.5) INSTEAD of
 *  X2 — a card-level rule like Registeel's Steel (regi_h_x_mult): it IS the Glass card's own X (Card:get_chip_x_mult), so retriggers repeat
 *  the new value, a perma X on the card scales with it, and two Glastriers give it once (the best wins; GLASS_RULES takes any later Glass-X
 *  rule the same way). Only real Glass cards (ability.effect), never debuffed ones. */
const GLASS_RULES = { j_poke_glastrier: 'Xmult_multi' };
export function glass_rule_x() {
  let best = 0;
  for (const j of (G.jokers && G.jokers.cards) || []) {
    const f = !j.debuff && GLASS_RULES[j.config.center.key];
    if (f && j.ability.extra[f] > best) best = j.ability.extra[f];
  }
  return best || undefined;
}
export function glass_x_mult(v, card) {
  if (!v || card.debuff || card.ability.effect !== 'Glass Card' || !G.jokers) return undefined;
  const best = glass_rule_x();
  if (!best) return undefined;
  const base = card.ability.x_mult || 2;
  return v * best / base;
}
/** Calyrex, Bountiful Harvest: the Flower cards in the full deck (each card's own enhancement: bloomed Seeds). */
const flowers = () => (G.playing_cards || []).filter((c) => unbroken(c) && c.config.center.key === 'm_poke_flower').length;
const harvest_x = (card) => r9(1 + card.ability.extra.Xmult_mod * flowers());
/** ... and when a Blind is selected, ONE random unenhanced card of the full deck becomes a Seed (the Cherubi line's Sweet Seeds, its own
 *  seed 'poke_calyrex_seeds'; none unenhanced, nothing: it never overwrites). Blueprint copies it (as Marble Joker). */
function bountiful_harvest(card, context) {
  if (!context.setting_blind || card.getting_sliced || (context.blueprint_card && context.blueprint_card.getting_sliced)) return false;
  const plain = (G.playing_cards || []).filter((c) => unbroken(c) && c.config.center.key === 'c_base');
  if (!plain.length) return true;
  const [pick] = pseudorandom_element(plain, pseudoseed('poke_calyrex_seeds'));
  pick.set_ability(P_CENTERS.m_poke_seed, null, true);
  G.E_MANAGER.add_event(() => { pick.juice_up(); });
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: '+1 Seed', colour: 'GREEN' });
  return true;
}
/** Enamorus's Therian clock (the Forces of Nature's: THERIAN_AT rounds held, counted on the card in the main end_of_round pass; not a
 *  Blueprint's; a debuffed one isn't calculated, so that round doesn't count). Its own reader: a new joker never takes the pre-r59 partner rule. */
const enamorus_therian = (card) => (card.ability.extra.therian_rounds || 0) >= THERIAN_AT;
function enamorus_tick(card, context) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker) return false;
  const ex = card.ability.extra, was = enamorus_therian(card);
  ex.therian_rounds = (ex.therian_rounds || 0) + 1;
  if (!was && enamorus_therian(card)) card_eval_status_text(card, 'extra', null, null, null, { message: 'Therian Forme!', colour: 'FILTER' });
  return true;
}
const enamorus_state = (card) => { const k = Math.max(0, THERIAN_AT - (card.ability.extra.therian_rounds || 0)); return enamorus_therian(card) ? 'Therian Forme' : 'Therian in ' + k + (k === 1 ? ' round' : ' rounds'); };
const x_main = (x) => (x > 1 ? { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x } : undefined);

defineJokers({
  // The owner's Gen 8 batch 4 ("Yes", 2026-11-03): the 10 Gen 8 Legendaries still missing, each complete ALONE (the solo rule, r59), all
  // Legendary $20 (The Soul / the Legendary pool). Types = the cards' (pokermon_art_type.mjs; every form cell shows its base's type). Energy
  // raises the X / the gains at the standard share; hands, money, thresholds, counts and conversions are fixed; banks never retroactive.
  // Art: upstream 3.9.1's own cells, forms included (Crowned Sword / Shield, Eternamax, Therian Enamorus: card and soul, systems/anim.js
  // GEN8_LEGEND_FORMS); nothing to deploy. Pokédex order: Zacian, Zamazenta, Eternatus after Dreepy (Dart), before Kubfu; Zarude ... Calyrex
  // after Urshifu, before Wyrdeer; Enamorus after Basculegion.
  //
  // Zacian 888 (Fairy), Intrepid Sword: X2 Mult (`Xmult` +20%: 2.4 / 2.8 / 3.2). Crowned Sword for good once 3 Boss Blinds are beaten while
  // it is held (`crown_bosses` on the card): X3 instead (`Xmult2` +20%: 3.6 / 4.2 / 4.8; its own field, so Energy taken before is kept).
  zacian: {
    name: 'zacian', poke_sprite391: sprite('Gen08', 6, 9, [7, 9]),
    config: { extra: { Xmult: 2, Xmult2: 3, crown_bosses: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fairy', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'boss_blind', 'scaling'], poke_after: 'dreepy_dart',
    poke_view_form(self, card) { return crowned(card) ? 'crowned' : 'hero'; },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult2), crown_state(card, 'Crowned Sword')] }; },
    calculate(self, card, context) {
      if (crown_tick(card, context, 'Crowned Sword')) return undefined;
      if (context.joker_main) return x_main(crowned(card) ? card.ability.extra.Xmult2 : card.ability.extra.Xmult);
      return undefined;
    },
  },
  // Zamazenta 889 (Fighting), Dauntless Shield: +1 hand each round (the Squirtle line's pair, fixed). Crowned Shield for good once 3 Boss
  // Blinds are beaten while it is held: +2 hands in all (`crowned_hands`, fixed; not +3) and X1.5 Mult (`Xmult` +20%: 1.8 / 2.1 / 2.4; Energy
  // can go on before it is crowned and is kept). Blueprint copies the X, never the hands.
  zamazenta: {
    name: 'zamazenta', poke_sprite391: sprite('Gen08', 10, 9, [11, 9]),
    config: { extra: { hands: 1, crowned_hands: 2, Xmult: 1.5, crown_bosses: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fighting', gen: 8, blueprint_compat: true,
    attributes: ['hands', 'xmult', 'boss_blind', 'scaling'], poke_after: 'zacian',
    poke_view_form(self, card) { return crowned(card) ? 'crowned' : 'hero'; },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [self.config.extra.hands, ex.crowned_hands, r3(ex.Xmult), crown_state(card, 'Crowned Shield')] }; },
    calculate(self, card, context) {
      if (crown_tick(card, context, 'Crowned Shield', shield_crown)) return undefined;
      if (context.joker_main && crowned(card)) return x_main(card.ability.extra.Xmult);
      return undefined;
    },
    ...hands,
  },
  // Eternatus 890 (Dark), Dynamax: each Boss Blind beaten while held permanently adds X0.5 (`eterna_Xmult` from X1, a bank; the gain
  // `Xmult_mod` +20%: 0.6 / 0.7 / 0.8). Eternamax for good at the 5th Boss (`bosses`): its X is the bank x2 from then on, and the bank keeps
  // growing (5 Bosses: X3.5 x2 = X7; 6: X4 x2 = X8). The doubling and the 5 are fixed.
  eternatus: {
    name: 'eternatus', poke_sprite391: sprite('Natdex', 8, 59, [9, 59]),
    config: { extra: { eterna_Xmult: 1, Xmult_mod: 0.5, bosses: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Dark', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'boss_blind', 'scaling'], poke_after: 'zamazenta',
    poke_view_form(self, card) { return eternamax(card) ? 'eternamax' : 'base'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult_mod), r3(eterna_x(card)), eternamax(card) ? 'Eternamax: X' + r3(ex.eterna_Xmult) + ' doubled' : 'Boss Blinds: ' + (ex.bosses || 0) + '/' + ETERNAMAX_AT] };
    },
    calculate(self, card, context) {
      if (boss_beaten(context)) {
        const ex = card.ability.extra, was = eternamax(card);
        ex.bosses = (ex.bosses || 0) + 1;
        bank(card, 'eterna_Xmult', 'Xmult_mod', 1, 'XMULT');
        if (!was && eternamax(card)) card_eval_status_text(card, 'extra', null, null, null, { message: 'Eternamax!', colour: 'GOLD' });
        return undefined;
      }
      if (context.joker_main) return x_main(eterna_x(card));
      return undefined;
    },
  },
  // Zarude 893 (Grass), Jungle Drain: when a Blind is selected, drains $1 of sell value from each other Joker (`drain`, fixed; never below
  // $1) and banks +X0.05 per $1 drained (`jungle_Xmult` from X1; the gain `Xmult_mod` +20%: 0.06 / 0.07 / 0.08). Blueprint copies the X.
  zarude: {
    name: 'zarude', poke_sprite391: sprite('Gen08', 6, 10, [7, 10]),
    config: { extra: { drain: 1, Xmult_mod: 0.05, jungle_Xmult: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Grass', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'economy'], poke_after: 'urshifu_rapid',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed()) info_queue.push({ set: 'Other', key: 'poke_drain' });
      const ex = card.ability.extra; return { vars: [ex.drain, r3(ex.Xmult_mod), r3(ex.jungle_Xmult)] };
    },
    calculate(self, card, context) {
      if (jungle_drain(card, context)) return undefined;
      if (context.joker_main) return x_main(card.ability.extra.jungle_Xmult);
      return undefined;
    },
  },
  // Regieleki 894 (Lightning), Transistor: +1 hand each round (fixed); at end of round each unused hand permanently adds X0.1 (`eleki_Xmult`
  // from X1; the gain `Xmult_mod` +20%: 0.12 / 0.14 / 0.16; Quaquaval's Moxie count: the hands left after the winning hand).
  regieleki: {
    name: 'regieleki', poke_sprite391: sprite('Natdex', 16, 59, [17, 59]),
    config: { extra: { hands: 1, Xmult_mod: 0.1, eleki_Xmult: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Lightning', gen: 8, blueprint_compat: true,
    attributes: ['hands', 'xmult', 'scaling'], poke_after: 'zarude',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.Xmult_mod), r3(ex.eleki_Xmult)] }; },
    calculate(self, card, context) {
      if (round_end(context) && !context.blueprint && !context.retrigger_joker && !context.game_over) {
        const n = unused_hands();
        if (n > 0) bank(card, 'eleki_Xmult', 'Xmult_mod', n, 'XMULT');
        return undefined;
      }
      if (context.joker_main) return x_main(card.ability.extra.eleki_Xmult);
      return undefined;
    },
    ...hands,
  },
  // Regidrago 895 (Dragon), Dragon Energy: X3 Mult on the round's first hand (`Xmult` +20%: 3.6 / 4.2 / 4.8), X0.5 less for each hand already
  // played this round (`drago_step`, fixed), never below X1 (X3 / 2.5 / 2 / 1.5 / 1).
  regidrago: {
    name: 'regidrago', poke_sprite391: sprite('Natdex', 18, 59, [19, 59]),
    config: { extra: { Xmult: 3, drago_step: 0.5 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Dragon', gen: 8, blueprint_compat: true,
    attributes: ['xmult'], poke_after: 'regieleki',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.drago_step), r3(drago_x(card))] }; },
    calculate(self, card, context) { return context.joker_main ? x_main(drago_x(card)) : undefined; },
  },
  // Glastrier 896 (Water), Chilling Neigh: +80 Chips (`chips` +30%: 104 / 128 / 152); Glass cards give X2.5 instead of X2 (a card-level rule,
  // glass_x_mult through the chip_x_mult hook, Registeel's way: `Xmult_multi` +5%: 2.625 / 2.75 / 2.875; the best Glass-X rule wins; the
  // Glass card's own tooltip says it). Blueprint copies the Chips, never the rule.
  glastrier: {
    name: 'glastrier', poke_sprite391: sprite('Natdex', 20, 59, [21, 59]),
    config: { extra: { chips: 80, Xmult_multi: 2.5 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'enhancements'], poke_after: 'regidrago',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_glass); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_chips(r3(card.ability.extra.chips)), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      return undefined;
    },
  },
  // Spectrier 897 (Psychic), Grim Neigh: each Spectral card used while held (by anyone; not Blueprint) banks +X0.25 (`grim_Xmult` from X1;
  // the gain `Xmult_mod` +20%: 0.3 / 0.35 / 0.4).
  spectrier: {
    name: 'spectrier', poke_sprite391: sprite('Natdex', 22, 59, [23, 59]),
    config: { extra: { Xmult_mod: 0.25, grim_Xmult: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'spectral'], poke_after: 'glastrier',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), r3(ex.grim_Xmult)] }; },
    calculate(self, card, context) {
      const c = context.consumeable;
      if (context.using_consumeable && !context.blueprint && c && c.ability.set === 'Spectral') { bank(card, 'grim_Xmult', 'Xmult_mod', 1, 'XMULT'); return undefined; }
      if (context.joker_main) return x_main(card.ability.extra.grim_Xmult);
      return undefined;
    },
  },
  // Calyrex 898 (Psychic), King of Bountiful Harvest: when a Blind is selected, a random unenhanced card becomes a Seed (Sweet Seeds' rule;
  // Blueprint copies it); X1 + X0.1 for each Flower card in the full deck (bloomed Seeds; `Xmult_mod` +20%: 0.12 / 0.14 / 0.16; read live).
  calyrex: {
    name: 'calyrex', poke_sprite391: sprite('Gen08', 10, 10, [11, 10]),
    config: { extra: { Xmult_mod: 0.1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'enhancements'], poke_after: 'spectrier',
    loc_vars(self, info_queue, card) {
      seed_tips(self, info_queue, card);
      info_queue.push(P_CENTERS.m_poke_flower);
      const ex = card.ability.extra, n = flowers(); return { vars: [r3(ex.Xmult_mod), n, r3(harvest_x(card))] };
    },
    calculate(self, card, context) {
      if (bountiful_harvest(card, context)) return undefined;
      if (context.joker_main) return x_main(harvest_x(card));
      return undefined;
    },
  },
  // Enamorus 905 (Fairy), Springtide Storm: each scored Heart (is_suit: Wild counts) gives X1.25 Mult (`Xmult_multi` +5%: 1.3125 / 1.375 /
  // 1.4375). Therian Forme for good after it has been held for 4 rounds (the Forces of Nature's clock, `therian_rounds`): each scored Heart
  // also earns $1 (`heart_money`, fixed). Blueprint copies both.
  enamorus: {
    name: 'enamorus', poke_sprite391: sprite('Gen08', 6, 11, [7, 11]),
    config: { extra: { Xmult_multi: 1.25, heart_money: 1, therian_rounds: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fairy', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'money', 'suit'], poke_after: 'basculegion',
    poke_view_form(self, card) { return enamorus_therian(card) ? 'therian' : 'incarnate'; },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_multi), ex.heart_money, enamorus_state(card)] }; },
    calculate(self, card, context) {
      if (enamorus_tick(card, context)) return undefined;
      if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit('Hearts')) {
        const ex = card.ability.extra;
        if (!enamorus_therian(card)) return { x_mult: ex.Xmult_multi, card };
        G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + ex.heart_money;
        G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
        return { dollars: ex.heart_money, x_mult: ex.Xmult_multi, card };
      }
      return undefined;
    },
  },
}, FILE);

// ---------------------------------------------------------------- Gen 9, batch 2 (contentRev 75; the owner's "Yes", 2026-11-03), #951-1013
/** Flittle / Espathra, Opportunist: whenever ANOTHER Joker in your row permanently GROWS, every undebuffed Flittle banks +mult_mod Mult
 *  (`opp_mult`) and every Espathra banks +X(Xmult_mod) (`opp_Xmult`). "Grows" = one gain event of the shared scaling helper, the engine's
 *  SMODS.scale_card (js/engine/smods.js; its value went UP: a '-' or a lowering function is no growth), heard through the mod hook
 *  `card_scaled` (index.js): every house bank (bank / round_bank: the Gen 9 starters' Torch Song / Moxie, Yamask's grudge, Type: Null,
 *  Cosmog, Necrozma, the Gen 8 Legendaries...), every upstream 3.9.1 joker that scales through SMODS.scale_card, and the vanilla jokers
 *  Steamodded routes through it (js/engine/jokers.js vscale: Ride the Bus, Green Joker, Hologram, Campfire, ...; heard even when nothing
 *  else listens). One event = one gain, however big (a Moxie bank of 3 unused hands is 1). A Flittle / Espathra's own gain is never
 *  growth for another (no loop between two of them); a Blueprint never scales, so it never counts, and a Blueprint copying Flittle copies
 *  only the Mult it gives. Values that grow outside scale_card (a plain `+=` in a joker's own code) aren't heard. */
const OPPORTUNISTS = ['j_poke_flittle', 'j_poke_espathra'];
export function opportunist_scaled(card, grew) {
  if (!grew || !G.jokers || !card || !card.ability || card.ability.set !== 'Joker' || card.area !== G.jokers) return;
  if (OPPORTUNISTS.includes(card.config.center.key)) return;
  for (const j of G.jokers.cards.slice()) {
    if (j === card || j.debuff || j.getting_sliced || !OPPORTUNISTS.includes(j.config.center.key)) continue;
    if (j.config.center.key === 'j_poke_espathra') bank(j, 'opp_Xmult', 'Xmult_mod', 1, 'XMULT');
    else bank(j, 'opp_mult', 'mult_mod', 1, 'MULT');
  }
}
/** Flittle / Espathra: the banked Mult (and Espathra's banked X), every hand (Blueprint copies them). */
function opportunist_main(card, context) {
  if (!context.joker_main) return undefined;
  const ex = card.ability.extra, r = {};
  if (ex.opp_mult > 0) r.mult_mod = ex.opp_mult;
  if (ex.opp_Xmult > 1) r.Xmult_mod = ex.opp_Xmult;
  if (!r.mult_mod && !r.Xmult_mod) return undefined;
  r.message = r.Xmult_mod ? a_xmult(r3(r.Xmult_mod)) : a_mult(r3(r.mult_mod));
  r.colour = r.Xmult_mod ? 'XMULT' : 'MULT';
  return r;
}
/** Capsakid / Scovillain, Spicy: scored Clubs +chips; Scovillain's scored Hearts X(Xmult_multi) too (is_suit: a Wild card is both). */
function spicy(card, context, hearts) {
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round && !context.other_card.debuff)) return undefined;
  const ex = card.ability.extra, c = context.other_card, r = {};
  if (c.is_suit('Clubs')) r.chips = ex.chips;
  if (hearts && c.is_suit('Hearts')) r.x_mult = ex.Xmult_multi;
  if (r.chips === undefined && r.x_mult === undefined) return undefined;
  r.card = card;
  return r;
}
/** Bombirdier, Stork Delivery: at the end of each shop (ending_shop), num in dem (pseudorandom_probability on 'bombirdier': Oops! / Venonat
 *  raise it) to create a random Tag from the engine's tag pool (get_next_tag_key: the run's seeded Tag pool, as a Blind's skip Tag; an
 *  Orbital Tag names a random visible poker hand, seeded). Blueprint copies it (its own roll). */
function stork_delivery(card, context) {
  if (!context.ending_shop) return;
  const ex = card.ability.extra;
  if (!pseudorandom_probability(card, 'bombirdier', ex.num, ex.dem, 'bombirdier')) return;
  const tag = new Tag(get_next_tag_key('bombirdier'));
  if (tag.name === 'Orbital Tag') {
    const hs = Object.keys(G.GAME.hands).filter((k) => G.GAME.hands[k].visible);
    tag.ability.orbital_hand = pseudorandom_element(hs, pseudoseed('bombirdier_orbital'))[0];
  }
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: 'Delivery!', colour: 'FILTER' });
  G.E_MANAGER.add_event(() => { add_tag(tag); play_sound('generic1', 0.9, 0.8); play_sound('holo1', 1.2, 0.4); });
}
/** Varoom / Revavroom, Rev the Engine: hands played in a row without a discard (G.GAME.poke_rev_streak, run-wide: systems/rules.js
 *  calculate, +1 after every hand played, 0 on any discard you make, kept across rounds). While a hand scores it counts itself. */
const rev_streak = () => (G.GAME && G.GAME.poke_rev_streak) || 0;
/** Cyclizar, Ride: +hands each round and +h_size hand size, one add/remove pair (two spreads would overwrite each other's add_to_deck). */
const hands_hand_size = {
  add_to_deck(self, card, from_debuff) { hands.add_to_deck(self, card, from_debuff); hand_size.add_to_deck(self, card, from_debuff); },
  remove_from_deck(self, card, from_debuff) { hands.remove_from_deck(self, card, from_debuff); hand_size.remove_from_deck(self, card, from_debuff); },
};
/** Glimmora, Toxic Debris: each scored Stone card (undebuffed; a retrigger again) turns one random card of the full deck into a Hazard card
 *  (deck_convert: unenhanced first, then any card that isn't one; NEVER a Stone card — its own fuel — nor a card of the played hand, which is
 *  still scoring), at most `debris_cap` (3, fixed) a hand (G.GAME.hands_played names the hand). Not a Blueprint's (it modifies the deck). */
function toxic_debris(card, context) {
  if (!stone_scored(context) || context.other_card.debuff || context.blueprint || context.retrigger_joker) return;
  const ex = card.ability.extra, hand_id = G.GAME.hands_played;
  const n = ex.debris_hand === hand_id ? (ex.debris_count || 0) : 0;
  if (n >= ex.debris_cap) return;
  const skip = (G.playing_cards || []).filter((c) => has_enhancement(c, 'm_stone') || c.area === G.play);
  if (!deck_convert('m_poke_hazard', 'poke_glimmora_debris', skip)) return;
  ex.debris_hand = hand_id; ex.debris_count = n + 1;
  card_eval_status_text(card, 'extra', null, null, null, { message: '+1 Hazard', colour: 'PURPLE' });
}
/** Veluza, Fillet Away: at the end of each round (the main pass, not a Blueprint's) it loses $val_loss of its own sell value (extra_value,
 *  then set_cost: Celesteela's field, the other way) and banks +X(Xmult_mod) (`fillet_Xmult`). Pokermon's sell value never goes below $1
 *  (systems/rules.js set_cost, the drain floor), so at $1 it can lose no more and STOPS gaining (refill it — Poltchageist / Sinistcha,
 *  Combee, a Gift Card... — and it fillets again). */
function fillet_away(card, context) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over) return;
  const ex = card.ability.extra;
  if ((card.sell_cost || 0) - ex.val_loss < 1) return;
  card.ability.extra_value = (card.ability.extra_value || 0) - ex.val_loss;
  card.set_cost();
  bank(card, 'fillet_Xmult', 'Xmult_mod', 1, 'XMULT');
}
/** Dondozo, Commander: an undebuffed Tatsugiri directly to its LEFT. */
const dondozo_commanded = (card) => {
  const row = (G.jokers && G.jokers.cards) || [], i = row.indexOf(card), left = i > 0 ? row[i - 1] : null;
  return !!left && !left.debuff && left.config.center.key === 'j_poke_tatsugiri';
};
/** Clodsire, Poison Point: Silicobra's Sand Spit (each card the PLAYER discards that is unenhanced, num in dem on 'clodsire_poison', Oops!
 *  raises it), making a Hazard card instead of Stone. Blueprint copies it (its own roll). Shares Sand Spit's record of the discard. */
function clodsire_poison(card, context) {
  if (context.pre_discard) { spit_hand = context.hook ? null : context.full_hand; return undefined; }
  if (!(context.discard && context.other_card && spit_hand && spit_hand.includes(context.other_card))) return undefined;
  const c = context.other_card;
  if (c.config.center.key !== 'c_base' || !unbroken(c)) return undefined;
  const ex = card.ability.extra;
  if (!pseudorandom_probability(card, 'clodsire_poison', ex.num, ex.dem, 'clodsire_poison')) return undefined;
  c.set_ability(P_CENTERS.m_poke_hazard, null, true);
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: 'Poison Point!', colour: 'PURPLE' });
  return undefined;
}
const clodsire_x = (card) => r9(1 + card.ability.extra.Xmult_mod * hazards_in_deck());
/** Sinistcha: the sell value of ALL your Jokers (itself included; a debuffed one too: sell value isn't an ability). */
const row_value = () => ((G.jokers && G.jokers.cards) || []).reduce((s, j) => s + Math.max(0, j.sell_cost || 0), 0);
const sinistcha_x = (card) => r9(1 + card.ability.extra.Xmult_mod * row_value());

defineJokers({
  // The owner's Gen 9 batch 2 ("Yes", 2026-11-03): 17 jokers, #951-1013, on the guide's price slots (2-stage C $5 / S $8, single-stage R $7;
  // Clodsire a Stage 1 S $8); every 2-stage Basic evolves after 5 rounds. Types = the cards' (pokermon_art_type.mjs). Energy raises the main
  // number at the standard share; money, odds, slots, tags, conversions and caps are fixed; banks never retroactive and carried. One is a
  // NEW EVOLUTION of an existing joker (the Gen 8 Galarian exception, owner-approved): Wooper -> Clodsire by a Dark Energy used on it
  // (gated by rules rev 75, so older runs replay as recorded; Wooper -> Quagsire unchanged). Art: upstream 3.9.1's own cells (Natdex
  // {10,63}-{14,67}); nothing to deploy. Pokédex order: each after the Gen 9 joker before it (Capsakid after Brambleghast, Flittle after
  // Rabsca, Bombirdier ... Glimmora after Wugtrio, Flamigo / Veluza / Dondozo after Houndstone, Clodsire after Annihilape, Poltchageist /
  // Sinistcha after Gholdengo).
  //
  // Capsakid 951 (Grass, Common $5), Spicy: scored Clubs +20 Chips (`chips` +30%: 26 / 32 / 38). 5 rounds.
  capsakid: {
    name: 'capsakid', poke_sprite391: sprite('Natdex', 10, 63),
    config: { extra: { chips: 20, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 9, blueprint_compat: true,
    attributes: ['chips', 'suit', 'round_evo'], poke_after: 'brambleghast',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) { return spicy(card, context, false) || level_evo(self, card, context, 'j_poke_scovillain'); },
  },
  // Scovillain 952 (Fire, Safari $8): Spicy kept (`chips` +30%) and scored Hearts X1.2 (`Xmult_multi` +5%: 1.26 / 1.32 / 1.38); +1 discard
  // each round (`d_size`, fixed).
  scovillain: {
    name: 'scovillain', poke_sprite391: sprite('Natdex', 12, 63),
    config: { extra: { chips: 20, Xmult_multi: 1.2, d_size: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 9, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'suit', 'discard'], poke_after: 'capsakid',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.Xmult_multi), ex.d_size] }; },
    calculate(self, card, context) { return spicy(card, context, true); },
    ...discards,
  },
  // Flittle 955 (Psychic, Common $5), Opportunist: +1 Mult banked whenever another Joker permanently grows (`opp_mult`; gain `mult_mod`
  // +20%: 1.2 / 1.4 / 1.6). 5 rounds.
  flittle: {
    name: 'flittle', poke_sprite391: sprite('Natdex', 18, 63),
    config: { extra: { opp_mult: 0, mult_mod: 1, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Psychic', gen: 9, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'joker', 'round_evo'], poke_after: 'rabsca',
    poke_custom_values_to_keep: ['opp_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.opp_mult), ex.rounds] }; },
    calculate(self, card, context) { return opportunist_main(card, context) || level_evo(self, card, context, 'j_poke_espathra'); },
  },
  // Espathra 956 (Safari $8): gives Flittle's banked Mult (it banks no more Mult) and banks X0.05 per growth (`opp_Xmult` from X1; gain
  // `Xmult_mod` +20%: 0.06 / 0.07 / 0.08).
  espathra: {
    name: 'espathra', poke_sprite391: sprite('Natdex', 20, 63),
    config: { extra: { opp_mult: 0, opp_Xmult: 1, Xmult_mod: 0.05 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 9, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'scaling', 'joker'], poke_after: 'flittle',
    poke_custom_values_to_keep: ['opp_mult', 'opp_Xmult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), r3(ex.opp_Xmult), r3(ex.opp_mult)] }; },
    calculate(self, card, context) { return opportunist_main(card, context); },
  },
  // Bombirdier 962 (Dark, Rare $7), Stork Delivery: at the end of each shop, 1 in 2 to create a random Tag (odds fixed: Energy-inert).
  bombirdier: {
    name: 'bombirdier', poke_sprite391: sprite('Natdex', 2, 64),
    config: { extra: { num: 1, dem: 2 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Dark', gen: 9, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['tag', 'chance', 'economy'], poke_after: 'wugtrio',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, [num, dem] = get_probability_vars(card, ex.num, ex.dem, 'bombirdier'); return { vars: [num, dem] }; },
    calculate(self, card, context) { stork_delivery(card, context); return undefined; },
  },
  // Varoom 965 (Metal, Common $5), Rev the Engine: +2 Mult per hand in the streak, this hand included (`mult_mod` +20%: 2.4 / 2.8 / 3.2).
  // 5 rounds.
  varoom: {
    name: 'varoom', poke_sprite391: sprite('Natdex', 8, 64),
    config: { extra: { mult_mod: 2, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Metal', gen: 9, blueprint_compat: true,
    attributes: ['mult', 'discard', 'round_evo'], poke_after: 'bombirdier',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), rev_streak(), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = r3(card.ability.extra.mult_mod * (rev_streak() + 1)); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_revavroom');
    },
  },
  // Revavroom 966 (Safari $8): X1 + X0.1 per hand in the streak, this hand included (`Xmult_mod` +20%: 0.12 / 0.14 / 0.16).
  revavroom: {
    name: 'revavroom', poke_sprite391: sprite('Natdex', 10, 64),
    config: { extra: { Xmult_mod: 0.1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Metal', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'discard'], poke_after: 'varoom',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_mod), rev_streak()] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const x = r9(1 + card.ability.extra.Xmult_mod * (rev_streak() + 1)); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Cyclizar 967 (Dragon, Rare $7), Ride: +1 hand each round and +1 hand size (both fixed: Energy-inert).
  cyclizar: {
    name: 'cyclizar', poke_sprite391: sprite('Natdex', 12, 64),
    config: { extra: { hands: 1, h_size: 1 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Dragon', gen: 9, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['hands', 'hand_size', 'passive'], poke_after: 'revavroom',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, ex.h_size] }; },
    ...hands_hand_size,
  },
  // Orthworm 968 (Metal, Rare $7), Earth Eater: +15 Chips per Steel card in your full deck (`chips` +30%: 19.5 / 24 / 28.5).
  orthworm: {
    name: 'orthworm', poke_sprite391: sprite('Natdex', 14, 64),
    config: { extra: { chips: 15 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Metal', gen: 9, blueprint_compat: true,
    attributes: ['chips', 'enhancements', 'full_deck'], poke_after: 'cyclizar',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.chips * steel_in_deck())] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const c = r3(card.ability.extra.chips * steel_in_deck()); if (c > 0) return { message: a_chips(c), colour: 'CHIPS', chip_mod: c }; }
      return undefined;
    },
  },
  // Glimmet 969 (Earth, Common $5): scored Stone cards +6 Mult (`mult` +40%: 8.4 / 10.8 / 13.2). 5 rounds.
  glimmet: {
    name: 'glimmet', poke_sprite391: sprite('Natdex', 16, 64),
    config: { extra: { mult: 6, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Earth', gen: 9, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'round_evo'], poke_after: 'orthworm',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (stone_scored(context) && !context.other_card.debuff) return { mult: card.ability.extra.mult, card };
      return level_evo(self, card, context, 'j_poke_glimmora');
    },
  },
  // Glimmora 970 (Safari $8), Toxic Debris: each scored Stone card turns a random deck card into a Hazard card (up to 3 a hand, fixed);
  // each Hazard card held in hand X1.15 (`Xmult_multi` +5%: 1.2075 / 1.265 / 1.3225).
  glimmora: {
    name: 'glimmora', poke_sprite391: sprite('Natdex', 18, 64),
    config: { extra: { Xmult_multi: 1.15, debris_cap: 3 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'modify_card', 'full_deck', 'hand'], poke_after: 'glimmet',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); info_queue.push(P_CENTERS.m_poke_hazard);
      const ex = card.ability.extra; return { vars: [r3(ex.Xmult_multi), ex.debris_cap] };
    },
    calculate(self, card, context) { toxic_debris(card, context); return hazard_held_x(card, context); },
  },
  // Flamigo 973 (Fighting, Rare $7): X1.5 Mult, X2 if the played hand is a Pair (`Xmult` / `Xmult2` +20%: 1.8 / 2.1 / 2.4 and 2.4 / 2.8 / 3.2).
  flamigo: {
    name: 'flamigo', poke_sprite391: sprite('Natdex', 24, 64),
    config: { extra: { Xmult: 1.5, Xmult2: 2 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Fighting', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'pair'], poke_after: 'houndstone',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult2)] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const ex = card.ability.extra, x = context.scoring_name === 'Pair' ? ex.Xmult2 : ex.Xmult; return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Veluza 976 (Water, Rare $7), Fillet Away: at end of round loses $1 of sell value and banks +X0.25 (`fillet_Xmult` from X1; gain
  // `Xmult_mod` +20%: 0.3 / 0.35 / 0.4); at $1 (Pokermon's sell-value floor) it stops (`val_loss` fixed).
  veluza: {
    name: 'veluza', poke_sprite391: sprite('Natdex', 0, 65),
    config: { extra: { fillet_Xmult: 1, Xmult_mod: 0.25, val_loss: 1 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'sell_value'], poke_after: 'flamigo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), ex.val_loss, r3(ex.fillet_Xmult)] }; },
    calculate(self, card, context) {
      fillet_away(card, context);
      if (context.joker_main && card.ability.extra.fillet_Xmult > 1) { const x = card.ability.extra.fillet_Xmult; return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Dondozo 977 (Water, Rare $7), Commander: X2 Mult, X4 while an (undebuffed) Tatsugiri is directly to its left (`Xmult` / `Xmult2` +20%:
  // 2.4 / 2.8 / 3.2 and 4.8 / 5.6 / 6.4).
  dondozo: {
    name: 'dondozo', poke_sprite391: sprite('Natdex', 2, 65),
    config: { extra: { Xmult: 2, Xmult2: 4 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'joker', 'position'], poke_after: 'veluza',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult2), dondozo_commanded(card) ? 'Commanded!' : 'no Tatsugiri on its left'] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const ex = card.ability.extra, x = dondozo_commanded(card) ? ex.Xmult2 : ex.Xmult; return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Clodsire 980 (Dark, Stage 1 Safari $8; from Wooper by a Dark Energy, r75), Poison Point: each card you discard (unenhanced) 1 in 4 to
  // become a Hazard card (odds fixed); X1 + X0.05 per Hazard card in your full deck (`Xmult_mod` +20%: 0.06 / 0.07 / 0.08).
  clodsire: {
    name: 'clodsire', poke_sprite391: sprite('Natdex', 8, 65),
    config: { extra: { num: 1, dem: 4, Xmult_mod: 0.05 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'discard', 'enhancements', 'modify_card', 'full_deck', 'chance'], poke_after: 'annihilape',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_hazard);
      const ex = card.ability.extra, [num, dem] = get_probability_vars(card, ex.num, ex.dem, 'clodsire_poison');
      return { vars: [num, dem, r3(ex.Xmult_mod), hazards_in_deck(), r3(clodsire_x(card))] };
    },
    calculate(self, card, context) {
      clodsire_poison(card, context);
      if (context.joker_main) { const x = clodsire_x(card); if (x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Poltchageist 1012 (Grass, Common $5), Hospitality: at end of round the Jokers directly left and right gain $1 of sell value (Combee's
  // honey, `honey` fixed). Carries Sinistcha's `Xmult_mod` ("Energy carries to Sinistcha"). 5 rounds.
  poltchageist: {
    name: 'poltchageist', poke_sprite391: sprite('Natdex', 12, 67),
    config: { extra: { honey: 1, Xmult_mod: 0.05, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 9, blueprint_compat: false,
    attributes: ['sell_value', 'joker', 'economy', 'round_evo'], poke_after: 'gholdengo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.honey, ex.rounds] }; },
    calculate(self, card, context) { honey_gather(card, context); return level_evo(self, card, context, 'j_poke_sinistcha'); },
  },
  // Sinistcha 1013 (Safari $8): Hospitality kept ($1, fixed); X1 + X0.05 per $1 of sell value of ALL your Jokers, itself included
  // (`Xmult_mod` +20%: 0.06 / 0.07 / 0.08; no cap).
  sinistcha: {
    name: 'sinistcha', poke_sprite391: sprite('Natdex', 14, 67),
    config: { extra: { honey: 1, Xmult_mod: 0.05 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'sell_value', 'joker', 'economy'], poke_after: 'poltchageist',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.honey, r3(ex.Xmult_mod), row_value(), r3(sinistcha_x(card))] }; },
    calculate(self, card, context) {
      honey_gather(card, context);
      if (context.joker_main) { const x = sinistcha_x(card); if (x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
}, FILE);

/** The families (functions/pokefamily.lua style): index.js adds them with set_family. */
export const DESIGN_FAMILIES = [
  ['shinx', 'luxio', 'luxray'],
  ['honedge', 'doublade', 'aegislash'],
  ['spheal', 'sealeo', 'walrein'],
  ['grookey', 'thwackey', 'rillaboom'],
  ['scorbunny', 'raboot', 'cinderace'],
  ['sobble', 'drizzile', 'inteleon'],
  ['kubfu', 'urshifu_single', 'urshifu_rapid'],
  ['tandemaus', 'maushold'],
  ['darumaka', 'darmanitan'],
  ['scraggy', 'scrafty'],
  ['mudbray', 'mudsdale'],
  ['sprigatito', 'floragato', 'meowscarada'],
  ['fuecoco', 'crocalor', 'skeledirge'],
  ['quaxly', 'quaxwell', 'quaquaval'],
  ['whismur', 'loudred', 'exploud'],
  ['gulpin', 'swalot'],
  ['trapinch', 'vibrava', 'flygon'],
  ['spoink', 'grumpig'],
  ['barboach', 'whiscash'],
  ['starly', 'staravia', 'staraptor'],
  ['cherubi', 'cherrim'],
  ['burmy', 'wormadam', 'mothim'],
  ['glameow', 'purugly'],
  ['drifloon', 'drifblim'],
  ['combee', 'vespiquen'],
  ['shellos', 'gastrodon'],
  ['stunky', 'skuntank'],
  ['gible', 'gabite', 'garchomp'],
  ['hippopotas', 'hippowdon'],
  ['skorupi', 'drapion'],
  ['finneon', 'lumineon'],
  ['rowlet', 'dartrix', 'decidueye'],
  ['litten', 'torracat', 'incineroar'],
  ['popplio', 'brionne', 'primarina'],
  ['snivy', 'servine', 'serperior'],
  ['tepig', 'pignite', 'emboar'],
  ['oshawott', 'dewott', 'samurott'],
  ['sewaddle', 'swadloon', 'leavanny'],
  ['venipede', 'whirlipede', 'scolipede'],
  ['cottonee', 'whimsicott'],
  ['petilil', 'lilligant'],
  ['sandile', 'krokorok', 'krookodile'],
  ['dwebble', 'crustle'],
  ['yamask', 'cofagrigus', 'runerigus'], // (+ Runerigus: Gen 8 batch 3, r72)
  ['tirtouga', 'carracosta'],
  ['archen', 'archeops'],
  ['minccino', 'cinccino'],
  ['chespin', 'quilladin', 'chesnaught'],
  ['fennekin', 'braixen', 'delphox'],
  ['froakie', 'frogadier', 'greninja'],
  ['patrat', 'watchog'],
  ['lillipup', 'herdier', 'stoutland'],
  ['purrloin', 'liepard'],
  ['pidove', 'tranquill', 'unfezant'],
  ['blitzle', 'zebstrika'],
  ['woobat', 'swoobat'],
  ['timburr', 'gurdurr', 'conkeldurr'],
  ['tympole', 'palpitoad', 'seismitoad'],
  // Gen 5, batch 3
  ['ducklett', 'swanna'],
  ['deerling', 'sawsbuck'],
  ['karrablast', 'escavalier'],
  ['foongus', 'amoonguss'],
  ['joltik', 'galvantula'],
  ['tynamo', 'eelektrik', 'eelektross'],
  ['cubchoo', 'beartic'],
  ['shelmet', 'accelgor'],
  ['mienfoo', 'mienshao'],
  ['rufflet', 'braviary'],
  ['larvesta', 'volcarona'],
  // Gen 6, batch 1
  ['fletchling', 'fletchinder', 'talonflame'],
  ['scatterbug', 'spewpa', 'vivillon'],
  ['flabebe', 'floette', 'florges'],
  ['skiddo', 'gogoat'],
  ['pancham', 'pangoro'],
  ['espurr', 'meowstic'],
  // Gen 6, batch 2
  ['spritzee', 'aromatisse'],
  ['swirlix', 'slurpuff'],
  ['inkay', 'malamar'],
  ['binacle', 'barbaracle'],
  ['skrelp', 'dragalge'],
  ['tyrunt', 'tyrantrum'],
  ['amaura', 'aurorus'],
  ['phantump', 'trevenant'],
  ['bergmite', 'avalugg'],
  ['noibat', 'noivern'],
  // Gen 7, batch 1
  ['pikipek', 'trumbeak', 'toucannon'],
  ['yungoos', 'gumshoos'],
  ['crabrawler', 'crabominable'],
  ['cutiefly', 'ribombee'],
  ['mareanie', 'toxapex'],
  ['dewpider', 'araquanid'],
  ['fomantis', 'lurantis'],
  ['morelull', 'shiinotic'],
  // Gen 7, batch 2
  ['salandit', 'salazzle'],
  ['stufful', 'bewear'],
  ['sandygast', 'palossand'],
  ['jangmoo', 'hakamoo', 'kommoo'],
  // Gen 7, batch 3
  ['poipole', 'naganadel'],
  // Gen 7, batch 4
  ['typenull', 'silvally'],
  ['cosmog', 'cosmoem', 'solgaleo', 'lunala'],
  // Gen 8, batch 1
  ['rookidee', 'corvisquire', 'corviknight'],
  ['blipbug', 'dottler', 'orbeetle'],
  ['gossifleur', 'eldegoss'],
  ['wooloo', 'dubwool'],
  ['chewtle', 'drednaw'],
  ['rolycoly', 'carkol', 'coalossal'],
  ['silicobra', 'sandaconda'],
  ['arrokuda', 'barraskewda'],
  // Gen 8, batch 2
  ['toxel', 'toxtricity'],
  ['sizzlipede', 'centiskorch'],
  ['clobbopus', 'grapploct'],
  ['sinistea', 'polteageist'],
  ['hatenna', 'hattrem', 'hatterene'],
  ['impidimp', 'morgrem', 'grimmsnarl'],
  // Gen 8, batch 3: the Galarian / Hisuian evolutions join their lines (FAMILY_MEMBER_REV: seen from r72 on), and two new lines
  ['zigzagoon', 'linoone', 'obstagoon'],
  ['corsola', 'cursola'],
  ['farfetchd', 'sirfetchd'],
  ['mimejr', 'mrmime', 'mrrime'],
  ['basculin', 'basculegion'],
  ['milcery', 'alcremie'],
  ['snom', 'frosmoth'],
  ['cufant', 'copperajah'],
  // Gen 9, batch 2: Clodsire joins Wooper's line (FAMILY_MEMBER_REV: seen from r75 on), and five new lines
  ['wooper', 'quagsire', 'clodsire'],
  ['capsakid', 'scovillain'],
  ['flittle', 'espathra'],
  ['varoom', 'revavroom'],
  ['glimmet', 'glimmora'],
  ['poltchageist', 'sinistcha'],
];
/** Gen 8 batch 3 (r72): the new members of existing lines, for systems/evolution.js FAMILY_MEMBER_REV (index.js); Gen 9 batch 2 (r75):
 *  Clodsire (Wooper's line). */
export const GALAR_FAMILY_REV = { obstagoon: 72, cursola: 72, sirfetchd: 72, mrrime: 72, runerigus: 72, basculegion: 72, clodsire: GEN9B2_REV };

/** Their text (Pokermon loc style: #n# filled by loc_vars), from the design guide; index.js merges it into descriptions.Joker. */
const EVOLVES_ROUNDS = (n) => '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#' + n + '#{C:inactive,s:0.8} rounds)';
/** The Ultra Beasts' Beast Boost box (Gen 7 batch 3): `gain` names the step (#n-1#); #n# is what the boosts add up to so far. */
const BEAST_BOOST_BOX = (gain, n) => ['{C:attention}Beast Boost:{} each {C:attention}Boss Blind{}', 'defeated permanently adds', gain, '{C:inactive}(Beast Boost: +#' + n + '#)'];
const ROLLOUT = (c, m) => ['{C:attention}Rollout:{} {C:chips}+#' + c + '#{} Chips, doubled', 'for each consecutive hand of', 'the same poker hand {C:inactive}(max #' + m + '# doublings)'];
const PAIR = ['Played cards that share a rank', 'with another scored card give', '{C:mult}+#1#{} Mult when scored'];
const TRAIN = (x) => ['Gains {X:mult,C:white} X#' + x + '# {} Mult when a hand', 'with exactly {C:attention}1{} or exactly {C:attention}5{}', 'scoring cards is played', '{C:inactive}(Can\'t be debuffed)'];
const LUCKY_GROW = [
  ['When a {C:attention}Lucky{} card triggers,', 'it permanently gains {C:mult}+#1#{} Mult', 'and {C:money}$#2#{} when scored'],
  ['On evolution, create a', '{C:dark_edition}Negative{} {C:tarot}The Magician{}', '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#3#{C:inactive,s:0.8} Lucky triggers)', '{C:inactive,s:0.8}(Lucky triggers: #4#/#5#)'],
];
const GLASS_BREAKS = (gain) => [gain + ' each', 'time a {C:attention}Glass{} card breaks'];
const NEG_JUSTICE = ['On evolution, create a', '{C:dark_edition}Negative{} {C:tarot}Justice{}'];
const SWALLOW = (money) => ['At end of round, swallow (destroy)', 'a {C:attention}Hazard{} card held in hand', 'and gain {C:attention}1{} Stockpile; if none,', 'a {C:diamonds}Diamond{} card held in hand',
  ...(money ? ['and earn {C:money}${} equal to its rank', '{C:inactive,s:0.8}(J 11, Q 12, K 13, A 14)'] : []), '{C:inactive}(Currently {C:attention}#1#{C:inactive}/#2# Stockpile)'];
const STOCK_MULT = ['Scored {C:diamonds}Diamond{} cards give', '{C:mult}+#3#{} Mult per Stockpile', '{C:inactive}(Currently {C:mult}+#4#{C:inactive} Mult)'];
const STOCK_ENERGY = '{C:inactive,s:0.8}(Each Energy: +1 max Stockpile)';
const SAND_PIT = (name) => ['{C:attention}' + name + ':{} each card you', 'discard permanently adds', '{C:chips}+#2#{} Chips to this Joker', '{C:inactive}(Currently {C:chips}+#1#{C:inactive} Chips)'];
const SAND_EVO = ['{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#4#{C:inactive,s:0.8} discarded cards)', '{C:inactive,s:0.8}(Discarded: #3#/#4#)'];
const PEARL = ['{C:attention}Pearl:{} at end of round, a', 'random card held in hand', 'with no seal gains a {C:attention}Pink Seal{}'];
const FORECAST = ['{C:attention}Forecast:{} when a round\'s first', 'hand is drawn, takes the form', 'of the suit held most'];
const FORECAST_NOTE = ['{C:inactive,s:0.8}(Normal again after the round;', '{C:inactive,s:0.8}its type never breaks Monotype;', '{C:inactive,s:0.8}Kyogre / Groudon lock its weather;', '{C:inactive,s:0.8}Volcarona brings the sun)'];
const MUDDY = ['{C:attention}Muddy Water:{} {C:chips}+#1#{} Chips for', 'each {X:poke_water,C:white}Water{} or {X:poke_earth,C:white}Earth{} Joker', '{C:inactive}(Itself included)',
  '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {C:chips}+#3#{C:inactive} Chips)'];
const FLOCK = ['{C:attention}Flock:{} {C:mult}+#1#{} Mult for each', '{X:poke_colorless,C:white}Colorless{} Joker {C:inactive}(Itself included)',
  '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {C:mult}+#3#{C:inactive} Mult)'];
const DRIFT_CHARGE = ['{C:attention}Stockpile:{} each discard gains', '{C:attention}1{} Stockpile {C:inactive}(once per discard,', '{C:inactive}not per card; max #2#)',
  '{C:inactive}(Currently {C:attention}#1#{C:inactive}/#2# Stockpile)', STOCK_ENERGY];
const SPIT_UP = ['{C:attention}Spit Up:{} on the final hand of', 'the round, {X:mult,C:white} X1 {} Mult plus {X:mult,C:white} X#3# {}', 'per Stockpile, then the', 'Stockpile resets to {C:attention}0{}',
  '{C:inactive}(Currently {X:mult,C:white} X#4# {C:inactive} Mult)', '{C:inactive,s:0.8}(Nothing with 0 Stockpile)'];
const AFTERMATH = ['{C:attention}Aftermath:{} when this Joker is', 'sold or destroyed, create a', '{C:dark_edition}Negative{} {C:spectral}Spectral{} card', '{C:inactive}(Not when it transforms)'];
const HONEY = ['{C:attention}Honey Gather:{} at end of', 'round, the Jokers directly left', 'and right of this one each', 'gain {C:money}$#1#{} of sell value'];
const COMMANDER = ['{C:attention}Commander:{} the leftmost', '{X:poke_water,C:white}Water{} Joker gives'];
const CLASH = (n) => ['{C:attention}Primal Clash:{} with {C:attention}Kyogre{} and', '{C:attention}Groudon{} and no {C:attention}Rayquaza{}, the', "round's first deal picks one:", 'more {C:clubs}Clubs{} held, Kyogre; more', '{C:hearts}Hearts{} + {C:diamonds}Diamonds{}, Groudon', '{C:inactive}(a tie: more Energy, else Kyogre)', 'The other does nothing that round', '{C:inactive}(#' + n + '#)'];
// contentRev 59 (solo): the other kind grows it by half (#3#).
const EON = (other) => ['{C:attention}Soul Dew:{} also gains', '{X:mult,C:white} X#3# {} Mult each time', 'you use a ' + other + ' card'];
const CLOAKED = (name, c, type) => ['{C:attention}Cloaked:{} ' + name + ' Cloak, {X:poke_' + c + ',C:white}' + type + '{}', '{C:inactive}(kept from Burmy, for good)'];
const TWO_SEAS = (n) => ['{C:attention}Two Seas:{} with a {C:attention}West{} and an', '{C:attention}East{} Shellos or Gastrodon, each', 'works on both end cards', '{C:inactive}(Two Seas: #' + n + '#)'];
// contentRev 59 (solo): +1 card on a Boss Blind (it was +1 per other Regi).
const REGI_TRIO = (enh, n) => ['{C:attention}Regi Trio:{} when a {C:attention}Blind{} is', 'selected, {C:attention}#' + n + '#{} random card(s) in', 'your deck become {C:attention}' + enh + '{} cards',
  '{C:attention}1{} more on a {C:attention}Boss Blind{}'];
const SWEET_SEEDS = ['{C:attention}Sweet Seeds:{} when a {C:attention}Blind{}', 'is selected, a random unenhanced', 'card in your deck becomes a', '{C:attention}Seed{} card',
  '{C:attention}+#1#{} growth level {C:inactive}(Seeds bloom', '{C:inactive}in 3 scores instead of 5)'];
const FLOWER_GIFT = ['{C:attention}Flower Gift:{} {C:attention}Flower{} cards', 'need only {C:attention}#2#+{} suits'];
const SUNSHINE = ['{C:poke_sun}Sunshine Form:{} while sunny,', '{C:attention}Flower{} cards give {X:mult,C:white} X#3# {}', 'Mult instead of {X:mult,C:white} X2 {}',
  '{C:inactive}(Sunny: {C:hearts}Hearts{C:inactive}+{C:diamonds}Diamonds{C:inactive} held most', '{C:inactive}on the round\'s first deal,', '{C:inactive}or {C:attention}Groudon{C:inactive} / {C:attention}Volcarona{C:inactive} held)'];
const FICKLE = (gain, n) => ['{C:attention}Fickle:{} picks a new favourite', 'suit each round', 'Scored cards of its favourite', 'suit each give ' + gain, '{C:inactive}(Favourite: {V:1}#' + n + '#{C:inactive})'];
const POISON_GAS = (name, by, nth) => ['{C:attention}' + name + ':{} after ' + (nth ? 'your {C:attention}nth{}' : 'each'), (nth ? 'hand this round' : 'hand you play') + ', the Blind\'s', 'requirement drops by ' + by, 'of its starting requirement',
  '{C:inactive}(Never the hand that scored;', '{C:inactive}reach it and the Blind is won)', '{C:inactive}(Max -#2#% a Blind; this Blind: {C:attention}-#3#%{C:inactive})'];
const BITE = ['{C:attention}Bite:{} when a hand containing', 'a {C:attention}Pair{} scores, permanently', 'gains {C:mult}+#2#{} Mult for each', 'scored card', '{C:inactive}(Currently {C:mult}+#1#{C:inactive} Mult)'];
const SAND_STREAM = ['{C:poke_sand}Sand Stream:{} scored', '{C:attention}Stone{} cards give', '{C:chips}+#1#{} extra Chips'];
const SNIPER = ['{C:attention}Sniper:{} each scored card', 'has a {C:green}#1# in #2#{} chance to', 'crit for {X:mult,C:white} X#3# {} Mult'];
const CONTRARY_HELD = ['{C:attention}Contrary:{} each {C:attention}debuffed{}', 'card held in hand', 'gives {C:mult}+#2#{} Mult', '{C:inactive}(Currently {C:attention}#4#{C:inactive}: {C:mult}+#5#{C:inactive} Mult)'];
const FLAME_CHARGE = (gain) => ['{C:attention}Flame Charge:{} ' + gain + ' for', 'each hand in a row of the same', '{C:attention}poker hand{} this round', '{C:inactive}(This hand included; resets when', '{C:inactive}the poker hand changes)'];
const RAZOR_SHELL = (n) => ['{C:attention}Razor Shell:{} retrigger the', n];
// contentRev 59 (solo): each other Psychic Joker, at most 2 (it was each other Lake guardian).
const LAKE_GUARDIANS = (x, n) => ['{C:attention}Lake Guardians:{} plus {X:mult,C:white} X#' + x + '# {}', 'to its X Mult for each other', '{X:poke_psychic,C:white}Psychic{} Joker {C:inactive}(max 2)', '{C:inactive}(Currently #' + n + '#/2)'];
const SACRED_SWORD = (suit, move = 'Sacred Sword') => ['{C:attention}' + move + ':{} each scored', suit + ' gives {X:mult,C:white} X#1# {} Mult'];
// contentRev 59 (solo): X1.5 while its suit is the most common in the full deck (it was +X0.1 per other sword); contentRev 60: a tie
// doesn't count.
const SWORDS_OF_JUSTICE = (suit) => ['{C:attention}Swords of Justice:{} {X:mult,C:white} X#2# {}', 'instead while ' + suit + ' are the', 'most common suit in your', "full deck {C:inactive}(a tie doesn't count)",
  '{C:inactive,s:0.8}(Wild cards count for every suit)', '{C:inactive}(' + suit + ' #3#; now {X:mult,C:white} X#4# {C:inactive})'];
const TAO_BOOST = (move, type) => ['{C:attention}' + move + ':{} each', type + ' Joker gives {X:mult,C:white} X#1# {} Mult', '{C:inactive}(Itself included; currently {C:attention}#2#{C:inactive})'];
// contentRev 59 (solo): Fusion Flare / Fusion Bolt (it was Truth vs Ideals: +X0.25 each with the other dragon held).
const FUSION = (move, energy) => ['{C:attention}' + move + ':{} each ' + energy, 'card used permanently adds', '{X:mult,C:white} X#3# {} to that X Mult', '{C:inactive}(Banked: +#4#)'];
const LIBERO_MULT = ['{C:red}+#1#{} discard', '{C:mult}+#2#{} Mult for each', 'remaining {C:attention}discard{}', '{C:inactive}(Currently {C:mult}+#3#{C:inactive} Mult)'];
const UNSCORED_CHIPS = ['{C:chips}+#1#{} hand', 'Each played card that', 'doesn\'t score gives', '{C:chips}+#2#{} Chips'];
const TORCH_SONG = (gain) => ['{C:attention}Torch Song:{} permanently', 'gains ' + gain, 'for each hand played'];
const MOXIE9 = (gain) => ['{C:attention}Moxie:{} when you beat a', '{C:attention}Blind{}, permanently gains', gain + ' for each', 'unused hand'];
const LOOKOUT = ['{C:attention}Lookout:{} each {C:attention}Foreseen{}', 'card gives {C:mult}+#2#{} Mult', '{C:inactive}(scored like a held card)'];
const PICKUP = (what) => ['{C:attention}Pickup:{} at end of round,', '{C:green}#1# in #2#{} chance to create', what, '{C:inactive}(Must have room)'];
const PICKPOCKET = ['{C:attention}Pickpocket:{} earn {C:money}$#1#{} at', 'end of round; the Joker', 'directly to its {C:attention}right{} loses', '{C:money}$#2#{} of sell value', '{C:inactive}(Never below $1)'];
const SUPER_LUCK = ['{C:attention}Super Luck:{} {C:green}+#1#{} to the odds', 'of {C:attention}Lucky{} cards', '{C:inactive}(Currently {C:green}#2# in #3#{C:inactive} Mult,', '{C:green}#4# in #5#{C:inactive} money)'];
const HEART_STAMP = ['{C:attention}Heart Stamp:{} each scored', '{C:hearts}Heart{} card earns {C:money}$#1#{}'];
const PILLARS = (gain) => ['Scored {C:attention}Stone{} cards', 'each give ' + gain];
const SWIFT_SWIM = ['{C:attention}Swift Swim:{} {C:chips}+#1#{} Chips,', 'doubled while it\'s {C:poke_rain}raining{}', '{C:inactive}(#2#)'];
const RAIN_NOTE = ['{C:inactive,s:0.8}(Rain: a working Kyogre, or', '{C:inactive,s:0.8}Clubs held most on the', '{C:inactive,s:0.8}round\'s first deal)'];
const TAILOR = (cloth) => ['{C:attention}Tailor:{} when a {C:attention}Blind{} is', 'selected, a random unenhanced', 'card in your deck becomes', cloth];
const POISON_POINT = ['{C:attention}Poison Point:{} each card you', 'discard permanently gains', '{C:mult}+#2#{} Mult and {C:chips}-#1#{} Chips', '{C:inactive}(its Chips never go below 0)'];
const MOXIE_BLIND = (gain) => ['{C:attention}Moxie:{} when you beat a', '{C:attention}Blind{}, permanently gains', gain];
const STONE_SHELL = ['{C:chips}+#1#{} Chips for each', '{C:attention}Stone{} card in your', 'full deck', '{C:inactive}(Currently {C:chips}+#2#{C:inactive} Chips)'];
// contentRev 58: the first 1 (Yamask) / 2 (Cofagrigus) Jokers sold each round; #4# the cap, #5# what is left of it this round.
const GRUDGE = (n) => [
  ...(n === 1 ? ['Gains {X:mult,C:white} X#1# {} Mult for the', '{C:attention}first{} Joker you sell each round']
    : ['Gains {X:mult,C:white} X#1# {} Mult for each of', 'the first {C:attention}#4#{} Jokers you sell', 'each round']),
  '{C:inactive}(Currently {X:mult,C:white} X#2# {C:inactive} Mult)', '{C:inactive}(Grudges left this round: #5#/#4#)'];
const ANCIENT_NINES = ['{C:attention}Ancient #1#s{}', '{X:attention,C:white}1+{} : {C:chips}+#2#{} Chips', '{X:attention,C:white}2+{} : {}Scoring {C:attention}#1#s{} permanently gain {C:chips}+#3#{} Chips', '{X:attention,C:white}3+{} : {C:chips}+#4#{} Chips'];
const ANCIENT_TENS = ['{C:attention}Ancient #1#s{}', '{X:attention,C:white}1+{} : {C:mult}+#2#{} Mult', '{X:attention,C:white}2+{} : {X:mult,C:white} X#3# {} Mult', '{X:attention,C:white}3+{} : Earn {C:money}$#4#{}'];
const ANCIENT_EVO = (n) => '{C:inactive,s:0.8}(Trigger {X:attention,C:white,s:0.8}3+{C:inactive,s:0.8} ability {C:attention,s:0.8}#' + n + '#{C:inactive,s:0.8} times to evolve)';
const SEASONS_TEXT = (gain) => ['{C:attention}Seasons:{} each scored card', 'of the season\'s suit gives', gain, '{C:inactive}(Now {C:attention}#2#{C:inactive}: {V:1}#3#{C:inactive})'];
const SEASON_NOTE = ['{C:inactive,s:0.8}(A new season each Ante:', '{C:inactive,s:0.8}Spring Hearts, Summer Diamonds,', '{C:inactive,s:0.8}Autumn Clubs, Winter Spades)'];
const TRADE_TEXT = (p) => ['{C:attention}Trade:{} evolves only together', 'with a {C:attention}' + p + '{}, once both', 'have been held together', 'for {C:attention}#3#{} rounds', '{C:inactive}(Together: #2#/#3#; #4#)'];
const STEEL_TEXT = (n) => ['{C:attention}Steel{} cards held in hand', 'give {X:mult,C:white} X#' + n + '# {} Mult', 'instead of {X:mult,C:white} X1.5 {}', '{C:inactive,s:0.8}(Never stacks with Registeel,', '{C:inactive,s:0.8}Escavalier or Durant: the best wins)'];
const TOP_NOTE = ['{C:inactive}(Aces high; a tie: the leftmost;', '{C:inactive}never a Stone or debuffed card)'];
const SUN_NOTE = ['{C:inactive,s:0.8}(Sunny: Hearts + Diamonds held', '{C:inactive,s:0.8}most on the round\'s first deal,', '{C:inactive,s:0.8}a working Groudon, or Volcarona)'];
const MULTI_HIT_TEXT = ['{C:attention}Multi-hit:{} each hand hits', '{C:attention}2-5{} times {C:inactive}(rolled each hand)', '{C:mult}+#1#{} Mult per hit', '{C:inactive}(Last hand: {C:attention}#2#{C:inactive} hits)'];
const STAKEOUT = (gain) => ['{C:attention}Stakeout:{} ' + gain + ' if the', 'poker hand differs from the', 'last poker hand played this run', '{C:inactive}(Last: {C:attention}#2#{C:inactive})'];
const GALE_WINGS = (gain) => ['{C:attention}Gale Wings:{} the first hand', 'of each round gives ' + gain, '{C:inactive}(#2#)'];
const WILD_POWDER = ['When a {C:attention}Blind{} is selected,', 'a random unenhanced card', 'in your deck becomes', 'a {C:attention}Wild{} card'];
const GARDEN_QUEEN = (gain) => ['{C:attention}Garden Queen:{} each', 'scored {C:attention}Queen{} ' + gain];
const FLOWER_NOTE = (n) => '{C:inactive}(' + '#' + n + '# Flower; rolled once)';
const GRASS_TEAM = ['{C:chips}+#1#{} Chips, plus {C:chips}+#2#{}', 'for each other {X:poke_grass,C:white}Grass{} Joker', '{C:inactive}(Currently {C:attention}#3#{C:inactive}: {C:chips}+#4#{C:inactive} Chips)'];
const HEALING_AROMA = ['{C:attention}Healing Aroma:{} each scored', '{C:attention}Lucky{} card earns {C:money}$#1#{}'];
const SWEET_VEIL = (m, b) => ['{C:attention}Sweet Veil:{} permanently', 'gains {C:mult}+#' + m + '#{} Mult for each', '{C:tarot}Tarot{} card used', '{C:inactive}(Currently {C:mult}+#' + b + '#{C:inactive} Mult)'];
const HAZARD_POISON = ['{C:attention}Poison Point:{} when a {C:attention}Blind{}', 'is selected, a random card in', 'your deck becomes a {C:attention}Hazard{} card', '{C:inactive}(Unenhanced cards first)'];
const ANCIENT_KINGS = ['{C:attention}Ancient #1#s{}', '{X:attention,C:white}1+{} : {C:mult}+#2#{} Mult', '{X:attention,C:white}2+{} : {X:mult,C:white} X#3# {} Mult', '{X:attention,C:white}3+{} : {}Retrigger all scored {C:attention}#1#s{}'];
const ANCIENT_QUEENS = ['{C:attention}Ancient #1#s{}', '{X:attention,C:white}1+{} : {C:chips}+#2#{} Chips', '{X:attention,C:white}2+{} : {}The leftmost scored {C:attention}#1#{}', 'that isn\'t {C:attention}Glass{} becomes {C:attention}Glass{}', '{X:attention,C:white}3+{} : Earn {C:money}$#3#{}'];
const FOREST_CURSE = ['{C:attention}Forest\'s Curse:{} permanently', 'gains {C:mult}+#1#{} Mult each time', 'a playing card is {C:attention}destroyed{}', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)'];
const GLASS_ODDS = (first) => [first, 'Doubles the chance {C:attention}Glass{}', 'cards break {C:inactive}(each copy stacks)', '{C:inactive}(Now {C:green}#2#{C:inactive})'];
const FLYING_TAXI = ['{C:attention}Flying Taxi:{} earn {C:money}$#1#{}', 'at end of round'];
const ENERGY_TO = (name) => '{C:inactive,s:0.8}(Energy carries to ' + name + ')';
const FORESEEN = (gain) => ['Each {C:attention}Foreseen{} card', 'gives ' + gain, '{C:inactive}(scored like a held card)'];
const COTTON_DOWN = ['{C:attention}Cotton Down:{} each scored', '{C:attention}Seed{} card gives {C:mult}+#1#{} Mult'];
const COAL = ['When a {C:attention}Blind{} is selected,', 'a random unenhanced card', 'in your deck becomes', 'a {C:attention}Stone{} card'];
const PROPELLER = (gain) => ['{C:attention}Propeller Tail:{} the first', 'scored card gives ' + gain];
const FIRE_SPIN = (gain) => ['{C:attention}Fire Spin:{} the first card you', 'discard each round is', '{C:red}destroyed{} and this Joker', 'permanently gains ' + gain];
const TEA_TEXT = ['{X:mult,C:white} X#1# {} Mult', '{C:attention}Antique:{} {X:mult,C:white} X#2# {} instead', '{C:inactive}({C:green}#3# in #4#{C:inactive}, rolled when obtained)', '{C:inactive}(Currently: {C:attention}#5#{C:inactive})'];
const PSYCHIC_TEAM = ['{C:mult}+#1#{} Mult for each', '{X:poke_psychic,C:white}Psychic{} Joker {C:inactive}(Itself included)', '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {C:mult}+#3#{C:inactive} Mult)'];
const PRANKSTER_FREE = ['{C:attention}Prankster:{} your first', 'reroll in each shop is {C:green}free{}', '{C:inactive}(not on top of another free reroll)', '{C:inactive}(#1#)'];
const DECORATE = ['{C:attention}Decorate:{} each scored', 'card with an {C:dark_edition}edition{}', 'gives {C:mult}+#1#{} Mult'];
export const DESIGN_LOC = {
  Joker: {
    j_poke_shinx: { name: 'Shinx', text: ['{C:purple}+#1# Foresight', 'Played cards that share a rank', 'with a {C:attention}Foreseen{} card', 'earn {C:money}$#2#{} when scored', EVOLVES_ROUNDS(3)] },
    j_poke_luxio: { name: 'Luxio', text: ['{C:purple}+#1# Foresight', 'Played cards that share a rank', 'with a {C:attention}Foreseen{} card give', '{C:mult}+#2#{} Mult and earn {C:money}$#3#{} when scored', EVOLVES_ROUNDS(4)] },
    j_poke_luxray: { name: 'Luxray', text: ['{C:purple}+#1# Foresight', 'Played cards that share a rank', 'with a {C:attention}Foreseen{} card give', '{X:mult,C:white} X#2# {} Mult and earn {C:money}$#3#{}', 'when scored'] },
    j_poke_honedge: { name: 'Honedge', text: ['Gains {C:mult}+#1#{} Mult for each', '{C:attention}Steel{} card held in hand', 'when a hand is played', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)', '{C:inactive,s:0.8}(Evolves at {C:mult,s:0.8}+#2#{C:inactive,s:0.8} / +#3# Mult)'] },
    j_poke_doublade: { name: 'Doublade', text: [
      ['Gains {C:mult}+#1#{} Mult for each', '{C:attention}Steel{} card held in hand', 'when a hand is played'],
      ['Retrigger the first {C:attention}#2#{}', '{C:attention}Steel{} cards held in hand', '{C:inactive}(Currently {C:mult}+#3#{C:inactive} Mult)', '{C:inactive,s:0.8}(Evolves with a {C:attention,s:0.8}Dusk Stone{C:inactive,s:0.8})'],
    ] },
    j_poke_aegislash: { name: 'Aegislash', text: [
      ['{C:mult}+#1#{} Mult {C:inactive}(kept from Doublade)', '{C:attention}Stance Change:{}', '{C:attention}Blade Forme:{} {X:mult,C:white} X#2# {} Mult', '{C:attention}Shield Forme:{} retrigger all', '{C:attention}Steel{} cards held in hand'],
      ['Playing a hand switches to Blade Forme,', 'discarding switches to Shield Forme', '{C:inactive}(Starts each round in Shield Forme)', '{C:inactive}(Currently {C:attention}#3#{C:inactive} Forme)'],
    ] },
    j_poke_spheal: { name: 'Spheal', text: [...ROLLOUT(1, 2), '{C:inactive}(Resets when the hand changes', '{C:inactive}and at end of round)', '{C:inactive}(Currently {C:chips}+#3#{C:inactive} Chips)', EVOLVES_ROUNDS(4)] },
    j_poke_sealeo: { name: 'Sealeo', text: ['{C:chips}+#1#{} hand', ...ROLLOUT(2, 3), '{C:inactive}(Currently {C:chips}+#5#{C:inactive} Chips)', EVOLVES_ROUNDS(4)] },
    j_poke_walrein: { name: 'Walrein', text: [
      ['{C:chips}+#1#{} hand', ...ROLLOUT(2, 3), '{C:inactive}(Currently {C:chips}+#5#{C:inactive} Chips)'],
      ['{C:attention}Sheer Cold:{} {X:mult,C:white} X#4# {} Mult while', 'Rollout is at full power'],
    ] },
    j_poke_grookey: { name: 'Grookey', text: ['{C:attention}+#1#{} hand size', 'Every {C:attention}#2#{} card scored this', 'round is retriggered and', 'gives {C:mult}+#6#{} Mult', '{C:inactive}(Beat {C:attention}#3#{C:inactive}/#5#)', '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#4#{C:inactive,s:0.8} beats)'] },
    j_poke_thwackey: { name: 'Thwackey', text: ['{C:attention}+#1#{} hand size', 'Every {C:attention}#2#{} card scored this', 'round is retriggered and', 'gives {C:mult}+#4#{} Mult', '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#3#{C:inactive,s:0.8} beats)'] },
    j_poke_rillaboom: { name: 'Rillaboom', text: [
      ['{C:attention}+#1#{} hand size', 'Every {C:attention}#2#{} card scored this', 'round is retriggered'],
      ['{C:attention}Drum Beating:{} retriggered cards', 'give {C:mult}+#3#{} Mult'],
    ] },
    j_poke_scorbunny: { name: 'Scorbunny', text: [...LIBERO_MULT, EVOLVES_ROUNDS(4)] },
    j_poke_raboot: { name: 'Raboot', text: [...LIBERO_MULT, EVOLVES_ROUNDS(4)] },
    j_poke_cinderace: { name: 'Cinderace', text: ['{C:red}+#1#{} discard', '{C:attention}Libero:{} {X:mult,C:white} X1 {} Mult, plus', '{X:mult,C:white} X#2# {} for each', 'remaining {C:attention}discard{}', '{C:inactive}(Currently {X:mult,C:white} X#3# {C:inactive} Mult)'] },
    j_poke_sobble: { name: 'Sobble', text: [...UNSCORED_CHIPS, EVOLVES_ROUNDS(3)] },
    j_poke_drizzile: { name: 'Drizzile', text: [...UNSCORED_CHIPS, EVOLVES_ROUNDS(3)] },
    j_poke_inteleon: { name: 'Inteleon', text: ['{C:chips}+#1#{} hand', '{C:attention}Snipe Shot:{} the', 'highest-ranked scored card', 'gives {X:mult,C:white} X#2# {} Mult', '{C:inactive}(A tie: the leftmost)'] },
    j_poke_kubfu: { name: 'Kubfu', text: ['This Joker can\'t be debuffed', 'Gains {X:mult,C:white} X#1# {} Mult when a hand', 'with exactly {C:attention}1{} or exactly {C:attention}5{}', 'scoring cards is played', '{C:inactive}(Currently {X:mult,C:white} X#2# {C:inactive} Mult)',
      '{C:inactive,s:0.8}(Evolves after #3# trainings:', '{C:inactive,s:0.8}more 1-card hands: Single Strike,', '{C:inactive,s:0.8}more 5-card hands: Rapid Strike)', '{C:inactive,s:0.8}(Single {C:attention,s:0.8}#4#{C:inactive,s:0.8} / Rapid {C:attention,s:0.8}#5#{C:inactive,s:0.8})'] },
    j_poke_urshifu_single: { name: 'Urshifu', text: [
      ['{C:attention}Single Strike Style', '{X:mult,C:white} X#1# {} Mult {C:inactive}(kept from Kubfu)', '{C:attention}Unseen Fist:{} playing cards', 'can\'t be debuffed'],
      ['{C:attention}Wicked Blow:{} if played hand is', 'exactly {C:attention}1{} card, it also gives this', 'Joker\'s {X:mult,C:white}X{} Mult when scored'],
      TRAIN(2),
    ] },
    j_poke_urshifu_rapid: { name: 'Urshifu', text: [
      ['{C:attention}Rapid Strike Style', '{X:mult,C:white} X#1# {} Mult {C:inactive}(kept from Kubfu)', '{C:attention}Surging Strikes:{} retrigger', 'the first {C:attention}#3#{} scored cards'],
      TRAIN(2),
    ] },
    j_poke_xerneas: { name: 'Xerneas', text: [
      ['{C:attention}Geomancy:{} after the first hand', 'of each round, played cards give', '{X:mult,C:white} X#1# {} Mult when scored', '{C:inactive}(#2#)'],
      ['The first playing card destroyed', 'each round returns to your hand', 'as a copy'],
    ] },
    j_poke_yveltal: { name: 'Yveltal', text: [
      '{C:attention}Oblivion Wing:{} at the end of', 'each round, destroys a random', 'card held in hand and gains', '{X:mult,C:white} X#2# {} Mult',
      '{C:inactive}(Currently {X:mult,C:white} X#1# {C:inactive} Mult)'] },
    j_poke_zygarde: { name: 'Zygarde', text: [
      ['{C:attention}Cells:{} collects {C:attention}1{} Cell for', 'each scored card', '{C:inactive}(Cells: #1#/100)'],
      ['{C:attention}10% Forme:{} {X:mult,C:white} X#2# {} Mult', '{C:attention}50% Forme{} {C:inactive}(50 Cells){}: {X:mult,C:white} X#3# {} Mult', '{C:attention}Complete Forme{} {C:inactive}(100 Cells){}:',
        '{X:mult,C:white} X#4# {} Mult and {C:attention}+#5#{} hand size', '{C:inactive}(Currently #6#)'],
    ] },
    j_poke_diancie: { name: 'Diancie', text: [
      ['{C:attention}Diamond Storm:{} each scored', '{C:diamonds}Diamond{} earns {C:money}$#1#{} and', 'gives {X:mult,C:white} X#2# {} Mult'],
      ['When a {C:attention}Blind{} is selected,', 'a random non-{C:diamonds}Diamond{} card', 'in your deck becomes', 'a {C:diamonds}Diamond{}'],
    ] },
    j_poke_hoopa: { name: 'Hoopa', text: [
      ['{C:attention}Hyperspace Hole:{} at the end', 'of each shop, creates a random', '{C:tarot}Tarot{} or {C:planet}Planet{} card', '{C:inactive}(Must have room)'],
      ['After {C:attention}15{} consumables are used', 'while you have it, becomes', '{C:attention}Hoopa Unbound{} for good and', 'creates a {C:spectral}Spectral{} card instead', '{C:inactive}(#1#)'],
    ] },
    j_poke_volcanion: { name: 'Volcanion', text: [
      ['{C:red}+#1#{} discard each round'],
      ['{C:attention}Steam Eruption:{} {X:mult,C:white} X#2# {} Mult,', 'plus {X:mult,C:white} X#3# {} for each', 'discard used this round', '{C:inactive}(Currently {X:mult,C:white} X#4# {C:inactive} Mult)'],
    ] },
    j_poke_nihilego: { name: 'Nihilego', text: ['{C:attention}Parasite:{} copies the ability', 'of the {C:attention}Joker{} to its {C:attention}left{}', '{C:inactive,s:0.8}(Beast Boost: no number to raise)'] },
    j_poke_buzzwole: { name: 'Buzzwole', text: [['{C:attention}Muscle:{} {X:mult,C:white} X#1# {} Mult', '{C:red}-#2#{} hand size'], BEAST_BOOST_BOX('{X:mult,C:white} X#3# {} Mult', 4)] },
    j_poke_pheromosa: { name: 'Pheromosa', text: [
      ['{C:attention}Glass Cannon:{} {X:mult,C:white} X#1# {} Mult', 'on the first {C:attention}#2#{} hands of', 'each round; then {C:red}debuffed{}', 'until the round ends', '{C:inactive}(#5#)'],
      BEAST_BOOST_BOX('{X:mult,C:white} X#3# {} Mult', 4)] },
    j_poke_xurkitree: { name: 'Xurkitree', text: [['{C:attention}Live Wire:{} each card', 'held in hand gives', '{C:mult}+#1#{} Mult'], BEAST_BOOST_BOX('{C:mult}+#2#{} Mult', 3)] },
    j_poke_celesteela: { name: 'Celesteela', text: [
      ['{C:attention}Launch:{} gains {C:money}$#2#{} of', 'sell value at end of round', '{X:mult,C:white} X1 {} Mult, plus {X:mult,C:white} X#1# {}', 'for each {C:money}$1{} of its sell value', '{C:inactive}(Currently {X:mult,C:white} X#5# {C:inactive} Mult)'],
      BEAST_BOOST_BOX('{X:mult,C:white} X#3# {} per {C:money}$1{}', 4)] },
    j_poke_kartana: { name: 'Kartana', text: [
      ['{C:attention}Sacred Sword:{} if the played', 'hand has exactly {C:attention}1{} scoring', 'card, it retriggers {C:attention}#2#{} times', 'and gives {X:mult,C:white} X#1# {} Mult each time'],
      BEAST_BOOST_BOX('{X:mult,C:white} X#3# {} Mult', 4)] },
    j_poke_guzzlord: { name: 'Guzzlord', text: [
      ['{C:attention}Gluttony:{} when a {C:attention}Blind{} is', 'selected, destroys your', '{C:attention}leftmost{} consumable and', 'gains {X:mult,C:white} X#1# {} Mult', '{C:inactive}(Currently {X:mult,C:white} X#2# {C:inactive} Mult)'],
      BEAST_BOOST_BOX('{X:mult,C:white} X#3# {} Mult', 4)] },
    j_poke_poipole: { name: 'Poipole', text: [
      ['{C:mult}+#1#{} Mult for each', '{X:poke_dragon,C:white}Dragon{} Joker', '{C:inactive}(Currently {C:mult}+#3#{C:inactive} Mult)'],
      [...BEAST_BOOST_BOX('{C:mult}+#4#{} Mult', 5), EVOLVES_ROUNDS(6)]] },
    j_poke_naganadel: { name: 'Naganadel', text: [
      ['{C:attention}Dragon Pulse:{} {X:mult,C:white} X#1# {} Mult,', 'plus {X:mult,C:white} X#2# {} for each', '{X:poke_dragon,C:white}Dragon{} Joker', '{C:inactive}(Itself included)', '{C:inactive}(Currently {X:mult,C:white} X#3# {C:inactive} Mult)'],
      BEAST_BOOST_BOX('{X:mult,C:white} X#4# {} Mult', 5)] },
    j_poke_stakataka: { name: 'Stakataka', text: [['{C:attention}Stone Wall:{} each {C:attention}Stone{}', 'card held in hand gives', '{X:mult,C:white} X#1# {} Mult'], BEAST_BOOST_BOX('{X:mult,C:white} X#2# {} Mult', 3)] },
    j_poke_blacephalon: { name: 'Blacephalon', text: [
      ['{X:mult,C:white} X#1# {} Mult'],
      ['{C:attention}Mind Blown:{} lose {C:money}$#2#{} each', 'hand played', '{C:inactive,s:0.8}(Never past your debt limit)'],
      BEAST_BOOST_BOX('{X:mult,C:white} X#3# {} Mult', 4)] },
    j_poke_rowlet: { name: 'Rowlet', text: ['{C:attention}+#1#{} hand size', 'Retrigger the {C:attention}rightmost{}', 'scored card', '{C:inactive,s:0.8}(Energy carries to Decidueye)', EVOLVES_ROUNDS(3)] },
    j_poke_dartrix: { name: 'Dartrix', text: ['{C:attention}+#1#{} hand size', 'Retrigger the {C:attention}rightmost{}', 'scored card {C:attention}#2#{} times', '{C:inactive,s:0.8}(Energy carries to Decidueye)', EVOLVES_ROUNDS(3)] },
    j_poke_decidueye: { name: 'Decidueye', text: [
      ['{C:attention}+#1#{} hand size'],
      ['{C:attention}Spirit Shackle:{} retrigger the', '{C:attention}rightmost{} scored card {C:attention}#2#{} times;', 'it gives {X:mult,C:white} X#3# {} Mult', 'each time it scores', '{C:inactive}({X:mult,C:white} X#4# {C:inactive} in all)'],
    ] },
    j_poke_litten: { name: 'Litten', text: ['{C:red}+#1#{} discard each round', '{C:mult}+#2#{} Mult for each hand', 'already played this round', '{C:inactive}(Currently {C:mult}+#3#{C:inactive} Mult)', EVOLVES_ROUNDS(4)] },
    j_poke_torracat: { name: 'Torracat', text: ['{C:red}+#1#{} discard each round', '{C:mult}+#2#{} Mult for each hand', 'already played this round', '{C:inactive}(Currently {C:mult}+#3#{C:inactive} Mult)', EVOLVES_ROUNDS(4)] },
    j_poke_incineroar: { name: 'Incineroar', text: ['{C:red}+#1#{} discard each round', '{X:mult,C:white} X1 {} Mult, plus {X:mult,C:white} X#2# {} for', 'each hand already played', 'this round', '{C:inactive}(Currently {X:mult,C:white} X#3# {C:inactive} Mult)'] },
    j_poke_popplio: { name: 'Popplio', text: ['{C:chips}+#1#{} hand each round', 'Scored {C:hearts}Hearts{} give', '{C:mult}+#2#{} Mult', EVOLVES_ROUNDS(3)] },
    j_poke_brionne: { name: 'Brionne', text: ['{C:chips}+#1#{} hand each round', 'Scored {C:hearts}Hearts{} give', '{C:mult}+#2#{} Mult', EVOLVES_ROUNDS(3)] },
    j_poke_primarina: { name: 'Primarina', text: [
      ['{C:chips}+#1#{} hand each round'],
      ['{C:attention}Sparkling Aria:{} scored', '{C:hearts}Hearts{} give {X:mult,C:white} X#2# {} Mult'],
    ] },
    j_poke_tandemaus: { name: 'Tandemaus', text: [...PAIR, '{C:inactive}(The pair never separates)', EVOLVES_ROUNDS(2)] },
    j_poke_maushold: { name: 'Maushold', text: [PAIR,
      ['{C:attention}Population Bomb:{} retrigger the', 'first scored card, then {C:green}#2# in #3#{}', 'chance to retrigger it again,', 'up to {C:attention}#4#{} times {C:inactive}(Family of Four)']] },
    j_poke_maushold_three: { name: 'Maushold', text: [PAIR,
      ['{C:attention}Population Bomb:{} retrigger the', 'first scored card, then {C:green}#2# in #3#{}', 'chance to retrigger it again,', 'up to {C:attention}#4#{} times; each retrigger', 'earns {C:money}$#5#{} {C:inactive}(Family of Three)']] },
    j_poke_darumaka: { name: 'Darumaka', text: ['{C:mult}+#1#{} Mult', '{C:attention}Hustle:{} {C:green}#2# in #3#{} chance', 'to give nothing', EVOLVES_ROUNDS(4)] },
    j_poke_darmanitan: { name: 'Darmanitan', text: [['{C:mult}+#1#{} Mult'],
      ['{C:attention}Zen Mode:{} on the final hand of', 'the round, gives {X:mult,C:white} X#2# {} Mult instead', 'and becomes {X:poke_psychic,C:white}Psychic{} until', 'end of round']] },
    j_poke_scraggy: { name: 'Scraggy', text: ['{C:mult}+#1#{} Mult', '{C:attention}Moxie:{} gains {C:mult}+#2#{} Mult when a', 'Blind is defeated with the', 'first hand of the round', '{C:inactive}(Currently {C:mult}+#1#{C:inactive} Mult)', EVOLVES_ROUNDS(3)] },
    j_poke_scrafty: { name: 'Scrafty', text: [
      ['{C:attention}Moxie:{} gains {C:mult}+#1#{} Mult, plus {C:mult}+#2#{}', 'for each other {X:poke_dark,C:white}Dark{} Joker, when a', 'Blind is defeated with the first', 'hand of the round'],
      ['{X:mult,C:white} X#3# {} Mult on the first', 'hand of each round', '{C:inactive}(Currently {C:mult}+#4#{C:inactive} Mult)'],
    ] },
    j_poke_spiritomb: { name: 'Spiritomb', text: [
      ['Gains {C:attention}1{} spirit when a playing', 'card is destroyed or a Joker is sold', '{X:mult,C:white} X#1# {} Mult per spirit', '{C:inactive}(Currently {C:attention}#2#{C:inactive}/#3# spirits, {X:mult,C:white} X#4# {C:inactive})'],
      ['At {C:attention}#3#{} spirits, create {C:spectral}The Soul{}', '{C:inactive}(Once; must have room)'],
    ] },
    j_poke_tatsugiri: { name: 'Tatsugiri', text: ['{C:attention}Nature:{} Curly, Droopy or Stretchy', ...COMMANDER, '{C:inactive}Curly:{} {X:mult,C:white} X#1# {} Mult', '{C:inactive}Droopy:{} {C:chips}+#2#{} Chips', '{C:inactive}Stretchy:{} {C:mult}+#3#{} Mult'] },
    j_poke_tatsugiri_curly: { name: 'Tatsugiri', text: ['{C:attention}Nature:{} Curly', ...COMMANDER, '{X:mult,C:white} X#1# {} Mult'] },
    j_poke_tatsugiri_droopy: { name: 'Tatsugiri', text: ['{C:attention}Nature:{} Droopy', ...COMMANDER, '{C:chips}+#2#{} Chips'] },
    j_poke_tatsugiri_stretchy: { name: 'Tatsugiri', text: ['{C:attention}Nature:{} Stretchy', ...COMMANDER, '{C:mult}+#3#{} Mult'] },
    j_poke_sprigatito: { name: 'Sprigatito', text: LUCKY_GROW },
    j_poke_floragato: { name: 'Floragato', text: LUCKY_GROW },
    j_poke_meowscarada: { name: 'Meowscarada', text: ['When a {C:attention}Lucky{} card triggers,', 'it permanently gains', '{X:mult,C:white} X#1# {} Mult when scored'] },
    j_poke_fuecoco: { name: 'Fuecoco', text: ['{C:red}+#1#{} discard', ...TORCH_SONG('{C:mult}+#2#{} Mult'), '{C:inactive}(Currently {C:mult}+#3#{C:inactive} Mult)', EVOLVES_ROUNDS(4)] },
    j_poke_crocalor: { name: 'Crocalor', text: ['{C:red}+#1#{} discard', ...TORCH_SONG('{C:mult}+#2#{} Mult'), '{C:inactive}(Currently {C:mult}+#3#{C:inactive} Mult)', EVOLVES_ROUNDS(4)] },
    j_poke_skeledirge: { name: 'Skeledirge', text: [
      ['{C:red}+#1#{} discard', '{C:mult}+#2#{} Mult {C:inactive}(kept from Crocalor)'],
      [...TORCH_SONG('{X:mult,C:white} X#3# {} Mult'), '{C:inactive}(Currently {X:mult,C:white} X#4# {C:inactive} Mult)'],
    ] },
    j_poke_quaxly: { name: 'Quaxly', text: ['{C:blue}+#1#{} hand', ...MOXIE9('{C:chips}+#2#{} Chips'), '{C:inactive}(Currently {C:chips}+#3#{C:inactive} Chips)', EVOLVES_ROUNDS(4)] },
    j_poke_quaxwell: { name: 'Quaxwell', text: ['{C:blue}+#1#{} hand', ...MOXIE9('{C:chips}+#2#{} Chips'), '{C:inactive}(Currently {C:chips}+#3#{C:inactive} Chips)', EVOLVES_ROUNDS(4)] },
    j_poke_quaquaval: { name: 'Quaquaval', text: [
      ['{C:blue}+#1#{} hand', '{C:chips}+#2#{} Chips {C:inactive}(kept from Quaxwell)'],
      [...MOXIE9('{X:mult,C:white} X#3# {} Mult'), '{C:inactive}(Currently {X:mult,C:white} X#4# {C:inactive} Mult)'],
    ] },
    j_poke_whismur: { name: 'Whismur', text: [
      ['{C:chips}+#1#{} Chips', ...GLASS_BREAKS('Gains {C:chips}+#2#{} Chips')],
      [...NEG_JUSTICE, EVOLVES_ROUNDS(3)],
    ] },
    j_poke_loudred: { name: 'Loudred', text: [
      ['{C:chips}+#1#{} Chips, {C:mult}+#2#{} Mult', ...GLASS_BREAKS('Gains {C:mult}+#3#{} Mult')],
      [...NEG_JUSTICE, EVOLVES_ROUNDS(4)],
    ] },
    j_poke_exploud: { name: 'Exploud', text: [
      '{C:chips}+#1#{} Chips, {C:mult}+#2#{} Mult,', '{X:mult,C:white} X#3# {} Mult', ...GLASS_BREAKS('Gains {X:mult,C:white} X#4# {} Mult'),
    ] },
    j_poke_gulpin: { name: 'Gulpin', text: [
      [...SWALLOW(false), '{C:inactive}(At max, only Hazards)', STOCK_ENERGY],
      [...STOCK_MULT, '{C:inactive,s:0.8}(Evolves at {C:attention,s:0.8}#5#{C:inactive,s:0.8} Stockpile)'],
    ] },
    j_poke_swalot: { name: 'Swalot', text: [
      [...SWALLOW(true), STOCK_ENERGY],
      STOCK_MULT,
      ['{X:mult,C:white} X#5# {} Mult for each card', 'below your starting deck size', '{C:inactive}(Currently {X:mult,C:white} X#6# {C:inactive} Mult)'],
    ] },
    j_poke_trapinch: { name: 'Trapinch', text: [...SAND_PIT('Sand Pit'), ...SAND_EVO] },
    j_poke_vibrava: { name: 'Vibrava', text: [
      ['{C:red}+#5#{} discard each round'],
      [...SAND_PIT('Supersonic'), ...SAND_EVO],
    ] },
    j_poke_flygon: { name: 'Flygon', text: [
      ['{C:chips}+#1#{} Chips {C:inactive}(kept from Vibrava)'],
      ['{C:poke_sand}Sandstorm:{} {X:mult,C:white} X#2# {} Mult for', 'each discard used this round', '{C:inactive}(Currently {X:mult,C:white} X#3# {C:inactive} Mult)'],
    ] },
    j_poke_spoink: { name: 'Spoink', text: [
      PEARL,
      ['Gains {X:mult,C:white} X#2# {} Mult each', 'time a {C:attention}Pink Seal{} triggers', '{C:inactive}(Currently {X:mult,C:white} X#1# {C:inactive} Mult)',
        '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#4#{C:inactive,s:0.8} Pink Seal triggers)', '{C:inactive,s:0.8}(Pink Seal triggers: #3#/#4#)'],
    ] },
    j_poke_grumpig: { name: 'Grumpig', text: [
      PEARL,
      ['{C:attention}Spoink Dance:{} {C:attention}Pink Seals{}', 'trigger on every hand'],
      ['Gains {X:mult,C:white} X#2# {} Mult for each', 'hand a {C:attention}Pink Seal{} triggers in', '{C:attention}Black Pearl:{} {X:mult,C:white} X#3# {} instead if', 'one had no room for its Energy', '{C:inactive}(Currently {X:mult,C:white} X#1# {C:inactive} Mult)'],
    ] },
    j_poke_barboach: { name: 'Barboach', text: [...MUDDY, EVOLVES_ROUNDS(4)] },
    j_poke_whiscash: { name: 'Whiscash', text: [
      MUDDY,
      ['{C:attention}Earthquake:{} with at least {C:attention}#4#{}', 'other {X:poke_water,C:white}Water{} or {X:poke_earth,C:white}Earth{} Jokers,', 'the first hand of each round', 'retriggers every scored card', '{C:inactive}(#5#)'],
    ] },
    j_poke_starly: { name: 'Starly', text: [...FLOCK, EVOLVES_ROUNDS(4)] },
    j_poke_staravia: { name: 'Staravia', text: [...FLOCK, EVOLVES_ROUNDS(4)] },
    j_poke_staraptor: { name: 'Staraptor', text: [
      ['{C:attention}Brave Bird:{} {X:mult,C:white} X1 {} Mult, plus', '{X:mult,C:white} X#1# {} for each {X:poke_colorless,C:white}Colorless{} Joker', '{C:inactive}(Itself included)',
        '{C:inactive}(Currently {C:attention}#3#{C:inactive}: {X:mult,C:white} X#4# {C:inactive} Mult)'],
      ['{C:attention}Recoil:{} lose {C:money}$#2#{} each', 'hand played', '{C:inactive,s:0.8}(Never past your debt limit)'],
    ] },
    j_poke_drifloon: { name: 'Drifloon', text: [
      DRIFT_CHARGE,
      [...SPIT_UP, '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#6#{C:inactive,s:0.8} Spit Ups)', '{C:inactive,s:0.8}(Spit Ups: #5#/#6#)'],
    ] },
    j_poke_drifblim: { name: 'Drifblim', text: [DRIFT_CHARGE, SPIT_UP, AFTERMATH] },
    j_poke_combee: { name: 'Combee', text: [...HONEY, '{C:inactive,s:0.8}(Energy carries to Vespiquen)', EVOLVES_ROUNDS(2)] },
    j_poke_vespiquen: { name: 'Vespiquen', text: [
      HONEY,
      ['{C:attention}Attack Order:{} {X:mult,C:white} X1 {} Mult, plus', '{X:mult,C:white} X#2# {} for each {C:money}$1{} of sell', 'value of the Jokers directly', 'left and right of this one',
        '{C:inactive}(Max {X:mult,C:white} X#3# {C:inactive})', '{C:inactive}(Currently {C:money}$#4#{C:inactive}: {X:mult,C:white} X#5# {C:inactive} Mult)',
        '{C:inactive,s:0.8}(Blueprint copies only the X)'],
    ] },
    j_poke_shellos: { name: 'Shellos', text: [
      ['{C:attention}Tide Pool:{} {C:chips}+#1#{} Chips on the', '{C:attention}#2#{}', '{C:inactive}(#3#: rolled once when created)'],
      [...TWO_SEAS(4), EVOLVES_ROUNDS(5)],
    ] },
    j_poke_gastrodon: { name: 'Gastrodon', text: [
      ['{C:attention}Tide:{} retrigger the', '{C:attention}#2#{},', '{C:chips}+#1#{} Chips per trigger', '{C:inactive}(#3#, kept from Shellos)'],
      ['{C:attention}Storm Drain:{} gains {X:mult,C:white} X#5# {} Mult', 'each time you use an {C:poke_pink}Energy{}', 'card, {X:mult,C:white} X#6# {} for {X:poke_water,C:white}Water{} Energy', '{C:inactive}(Currently {X:mult,C:white} X#7# {C:inactive} Mult)'],
      TWO_SEAS(4),
    ] },
    j_poke_castform: { name: 'Castform', text: [
      FORECAST,
      ['{C:poke_sun}Sunny{} ({C:hearts}Hearts{}+{C:diamonds}Diamonds{}): {X:poke_fire,C:white}Fire{}', 'scored {C:hearts}Hearts{}/{C:diamonds}Diamonds{} {C:mult}+#1#{} Mult',
        '{C:poke_rain}Rainy{} ({C:clubs}Clubs{}): {X:poke_water,C:white}Water{}', 'scored {C:clubs}Clubs{} {C:chips}+#2#{} Chips,', 'retrigger the first scored {C:clubs}Club{}',
        '{C:poke_snow}Snowy{} ({C:spades}Spades{}): {X:poke_water,C:white}Water{}', '{C:spades}Spades{} held in hand {X:mult,C:white} X#3# {} Mult',
        'Normal (a tie): {X:poke_colorless,C:white}Colorless{}', '{C:mult}+#4#{} Mult'],
      ['{C:inactive}(Currently {C:attention}#5#{C:inactive})', ...FORECAST_NOTE],
    ] },
    j_poke_castform_sunny: { name: 'Castform', text: [
      FORECAST,
      ['{C:poke_sun}Sunny Form:{} {X:poke_fire,C:white}Fire{} this round', 'Scored {C:hearts}Hearts{} and {C:diamonds}Diamonds{}', 'give {C:mult}+#1#{} Mult', ...FORECAST_NOTE],
    ] },
    j_poke_castform_rainy: { name: 'Castform', text: [
      FORECAST,
      ['{C:poke_rain}Rainy Form:{} {X:poke_water,C:white}Water{} this round', 'Scored {C:clubs}Clubs{} give {C:chips}+#2#{} Chips', 'Retrigger the first scored {C:clubs}Club{}', ...FORECAST_NOTE],
    ] },
    j_poke_castform_snowy: { name: 'Castform', text: [
      FORECAST,
      ['{C:poke_snow}Snowy Form:{} {X:poke_water,C:white}Water{} this round', 'Each {C:spades}Spade{} held in hand', 'gives {X:mult,C:white} X#3# {} Mult', ...FORECAST_NOTE],
    ] },
    j_poke_lunatone: { name: 'Lunatone', text: [
      ['{C:attention}Moonlight:{} {X:mult,C:white} X#1# {} Mult', 'on {C:attention}night{} hands', '{C:inactive}(each round\'s 2nd and 4th hands)'],
      ['{C:attention}Cosmic Power:{} with {C:attention}Solrock{},', 'also {X:mult,C:white} X#2# {} Mult on {C:attention}day{} hands', '{C:inactive}(Next hand: {C:attention}#3#{C:inactive})', '{C:inactive}(Cosmic Power: {C:attention}#4#{C:inactive})'],
    ] },
    j_poke_solrock: { name: 'Solrock', text: [
      ['{C:attention}Sunlight:{} {C:chips}+#1#{} Chips', 'on {C:attention}day{} hands', '{C:inactive}(each round\'s 1st, 3rd and 5th hands)'],
      ['{C:attention}Cosmic Power:{} with {C:attention}Lunatone{},', 'also {C:chips}+#2#{} Chips on {C:attention}night{} hands', '{C:inactive}(Next hand: {C:attention}#3#{C:inactive})', '{C:inactive}(Cosmic Power: {C:attention}#4#{C:inactive})'],
    ] },
    j_poke_mudbray: { name: 'Mudbray', text:['{C:chips}+#1#{} Chips', '{C:attention}Stamina:{} gains {C:chips}+#2#{} Chips when', 'you play a hand that isn\'t the', 'first hand of the round', '{C:inactive}(Currently {C:chips}+#1#{C:inactive} Chips)', EVOLVES_ROUNDS(3)] },
    j_poke_mudsdale: { name: 'Mudsdale', text: [
      ['{C:attention}Stamina:{} gains {C:chips}+#1#{} Chips when', 'you play a hand that isn\'t the', 'first hand of the round'],
      ['{C:attention}Mud Spit:{} the first unscored', 'card in each played hand', 'becomes a {C:attention}Stone{} card', '{C:inactive}(Currently {C:chips}+#2#{C:inactive} Chips)'],
    ] },
    j_poke_regirock: { name: 'Regirock', text: [
      ['{C:attention}Stone Body:{} {C:attention}Stone{} cards give', '{C:chips}+#1#{} Chips instead of {C:chips}+50{}', 'and permanently gain', '{C:chips}+#2#{} Chips each time they score'],
      REGI_TRIO('Stone', 3),
    ] },
    j_poke_regice: { name: 'Regice', text: [
      ['{C:attention}Ice Body:{} {C:attention}Glass{} cards', 'never shatter'],
      [...REGI_TRIO('Glass', 1), '{C:inactive,s:0.8}(Each Energy: +1 card)'],
    ] },
    j_poke_registeel: { name: 'Registeel', text: [
      ['{C:attention}Iron Body:{} {C:attention}Steel{} cards held', 'in hand give {X:mult,C:white} X#1# {} Mult', 'instead of {X:mult,C:white} X1.5 {}'],
      REGI_TRIO('Steel', 2),
    ] },
    j_poke_latias: { name: 'Latias', text: [
      ['{C:attention}Mist Ball:{} gains {X:mult,C:white} X#2# {} Mult', 'each time you use a {C:tarot}Tarot{} card', '{C:inactive}(Currently {X:mult,C:white} X#1# {C:inactive} Mult)'],
      EON('{C:planet}Planet{}'),
    ] },
    j_poke_latios: { name: 'Latios', text: [
      ['{C:attention}Luster Purge:{} gains {X:mult,C:white} X#2# {} Mult', 'each time you use a {C:planet}Planet{} card', '{C:inactive}(Currently {X:mult,C:white} X#1# {C:inactive} Mult)'],
      EON('{C:tarot}Tarot{}'),
    ] },
    j_poke_kyogre: { name: 'Kyogre', text: [
      ['{C:attention}Primordial Sea:{} {C:chips}+#1#{} hand', 'each round', 'Every scored {C:clubs}Club{}', 'retriggers once', '{C:attention}Castform{} is always {C:poke_rain}Rainy{}'],
      CLASH(2),
    ] },
    j_poke_groudon: { name: 'Groudon', text: [
      ['{C:attention}Desolate Land:{} {C:red}+#1#{} discard', 'each round', 'Scored {C:hearts}Hearts{} and {C:diamonds}Diamonds{}', 'each give {X:mult,C:white} X#2# {} Mult', '{C:attention}Castform{} is always {C:poke_sun}Sunny{}'],
      CLASH(3),
    ] },
    j_poke_rayquaza: { name: 'Rayquaza', text: [
      ['{C:attention}Delta Stream:{} {C:chips}+#3#{} hand and', '{C:red}+#4#{} discard each round', '{C:inactive,s:0.8}(Also calms Kyogre and Groudon:', '{C:inactive,s:0.8}no Primal Clash)'],
      ['{C:attention}Dragon Ascent:{} gains {X:mult,C:white} X#2# {} Mult', 'when a played hand contains', 'a {C:attention}Straight{} or a {C:attention}Flush{}', '{C:inactive}(Currently {X:mult,C:white} X#1# {C:inactive} Mult)'],
    ] },
    j_poke_cherubi: { name: 'Cherubi', text: [
      SWEET_SEEDS,
      ['{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#3#{C:inactive,s:0.8} of your Seeds', '{C:inactive,s:0.8}bloom into Flowers)', '{C:inactive,s:0.8}(Bloomed: #2#/#3#)',
        '{C:inactive,s:0.8}(Energy also raises Cherrim\'s', '{C:inactive,s:0.8}Sunshine Flowers: X#4#)'],
    ] },
    j_poke_cherrim: { name: 'Cherrim', text: [SWEET_SEEDS, FLOWER_GIFT, [...SUNSHINE, '{C:inactive}(Currently {C:attention}Overcast{C:inactive})']] },
    j_poke_cherrim_sunshine: { name: 'Cherrim', text: [SWEET_SEEDS, FLOWER_GIFT, [...SUNSHINE, '{C:inactive}(Currently {C:poke_sun}Sunshine{C:inactive})']] },
    j_poke_chatot: { name: 'Chatot', text: [
      ['{C:attention}Vocabulary:{} {C:mult}+#1#{} Mult for each', 'different {C:attention}poker hand{} played', 'this run', '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {C:mult}+#3#{C:inactive} Mult)'],
      ['{C:attention}New Word:{} the first time each', '{C:attention}poker hand{} is played this run,', 'create its {C:planet}Planet{} card', '{C:inactive}(Must have room)'],
    ] },
    j_poke_pachirisu: { name: 'Pachirisu', text: [
      ['{C:attention}Quick Spark:{} the first hand', 'of each round gives {X:mult,C:white} X#1# {} Mult', '{C:attention}Nuzzle:{} plus {X:mult,C:white} X#2# {} for each', 'other {X:poke_lightning,C:black}Lightning{} Joker',
        '{C:inactive}(Currently {X:mult,C:white} X#3# {C:inactive}, #4#)'],
      ['{C:attention}Cheek Pouch:{} earn {C:money}$#5#{} for each', '{X:poke_lightning,C:black}Lightning{} Joker at end of round', '{C:inactive}(Itself included)', '{C:inactive}(Currently {C:money}$#6#{C:inactive})'],
    ] },
    j_poke_glameow: { name: 'Glameow', text: [...FICKLE('{C:mult}+#1#{} Mult', 2), EVOLVES_ROUNDS(3), '{C:inactive,s:0.8}(Needs a free Joker slot to evolve)'] },
    j_poke_purugly: { name: 'Purugly', text: [
      ['{C:attention}Thick Fat:{} {C:red}-#2#{} Joker slot'],
      FICKLE('{X:mult,C:white} X#1# {} Mult', 3),
    ] },
    j_poke_stunky: { name: 'Stunky', text: [...POISON_GAS('Poison Gas', '{C:attention}#1#%{}'), EVOLVES_ROUNDS(4)] },
    j_poke_skuntank: { name: 'Skuntank', text: [...POISON_GAS('Toxic', '{C:attention}n x #1#%{}', true), '{C:inactive}(#1#%, then #4#%, then #5#%...;', '{C:inactive}next hand: {C:attention}-#6#%{C:inactive})'] },
    j_poke_gible: { name: 'Gible', text: [...BITE, '{C:inactive}(Evolves at {C:mult}+#1#{C:inactive} / +#3# Mult)'] },
    j_poke_gabite: { name: 'Gabite', text: [
      BITE,
      ['{C:attention}Treasure Nest:{} when a hand', 'containing a {C:attention}Full House{} scores,', 'one of its scored cards', 'becomes a {C:attention}Gold{} card',
        '{C:inactive}(Unenhanced cards first)', '{C:inactive}(Evolves with {C:attention}#3#{C:inactive} Gold cards in deck)', '{C:inactive}(Gold cards: #4#/#3#)'],
    ] },
    j_poke_garchomp: { name: 'Garchomp', text: [
      ['{C:mult}+#1#{} Mult {C:inactive}(banked by Bite)'],
      ['{C:attention}Dragon Rush:{} {X:mult,C:white} X1 {} Mult, plus', '{X:mult,C:white} X#2# {} for each {C:attention}Gold{} card', 'held in hand',
        '{C:inactive}(Currently {C:attention}#3#{C:inactive}: {X:mult,C:white} X#4# {C:inactive} Mult)'],
    ] },
    j_poke_hippopotas: { name: 'Hippopotas', text: [...SAND_STREAM, EVOLVES_ROUNDS(2)] },
    j_poke_hippowdon: { name: 'Hippowdon', text: [
      SAND_STREAM,
      ["On each round's first deal, 1", 'random {C:attention}unenhanced{} card held', 'in hand becomes a {C:attention}Stone{} card'],
    ] },
    j_poke_skorupi: { name: 'Skorupi', text: [...SNIPER, EVOLVES_ROUNDS(4)] },
    j_poke_drapion: { name: 'Drapion', text: [...SNIPER, '{C:attention}Lucky{} cards always crit'] },
    j_poke_carnivine: { name: 'Carnivine', text: [
      '{C:attention}Flytrap:{} the first card you', 'discard each round is', 'devoured ({C:red}destroyed{}) and', 'permanently adds {C:mult}+#2#{} Mult',
      '{C:inactive}(Currently {C:mult}+#1#{C:inactive} Mult; #3#)',
    ] },
    j_poke_finneon: { name: 'Finneon', text: [
      '{C:chips}+#1#{} Chips on {C:attention}night{} hands', '{C:inactive}(each round\'s 2nd and 4th hands)', '{C:inactive}(Next hand: {C:attention}#2#{C:inactive})', EVOLVES_ROUNDS(3),
    ] },
    j_poke_lumineon: { name: 'Lumineon', text: [
      ['On {C:attention}night{} hands, each scored', 'card gives {C:chips}+#1#{} Chips', '{C:inactive}(each round\'s 2nd and 4th hands)'],
      ['With {C:attention}Lunatone{}, on {C:attention}day{} hands too', '{C:inactive}(Next hand: {C:attention}#2#{C:inactive})', '{C:inactive}(Lunatone: {C:attention}#3#{C:inactive})'],
    ] },
    j_poke_burmy: { name: 'Burmy', text: [
      ['{C:attention}Cloak:{} at end of round, takes', 'the cloak most common in your', 'full deck: {C:attention}Stone{} (Sandy), {C:attention}Steel{}', '(Trash), or everything else (Plant)', '{C:inactive}(A tie keeps the cloak)'],
      ['{C:attention}Plant{} {X:poke_grass,C:white}Grass{}: {C:mult}+#1#{} Mult', '{C:inactive}(any card not Stone or Steel)', '{C:attention}Sandy{} {X:poke_earth,C:white}Earth{}: {C:chips}+#2#{} Chips {C:inactive}(Stone)',
        '{C:attention}Trash{} {X:poke_metal,C:white}Metal{}: earn {C:money}$#3#{} at end', 'of round {C:inactive}(Steel)'],
      ['{C:inactive}(Currently {C:attention}#4#{C:inactive} Cloak, #5#)', '{C:inactive,s:0.8}(Its type never breaks Monotype)', '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#6#{C:inactive,s:0.8} rounds:', '{C:inactive,s:0.8}♀ into Wormadam, ♂ into Mothim)'],
    ] },
    j_poke_wormadam: { name: 'Wormadam', text: [CLOAKED('Plant', 'grass', 'Grass'), ['Each scored {C:attention}unenhanced{}', 'card gives {C:mult}+#1#{} Mult']] },
    j_poke_wormadam_sandy: { name: 'Wormadam', text: [CLOAKED('Sandy', 'earth', 'Earth'), ['Each scored {C:attention}Stone{} card', 'gives {X:mult,C:white} X#2# {} Mult']] },
    j_poke_wormadam_trash: { name: 'Wormadam', text: [CLOAKED('Trash', 'metal', 'Metal'), ['Each {C:attention}Steel{} card held in hand', 'at end of round earns {C:money}$#3#{}']] },
    j_poke_mothim: { name: 'Mothim', text: [
      '{C:attention}Free Flight:{} {X:mult,C:white} X1 {} Mult, plus', '{X:mult,C:white} X#1# {} for each different', 'enhancement in your full deck',
      '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {X:mult,C:white} X#3# {C:inactive} Mult)', '{C:inactive,s:0.8}(Bonus, Mult, Wild, Glass, Steel,', '{C:inactive,s:0.8}Stone, Gold, Lucky, Seed, Flower)',
    ] },
    j_poke_dialga: { name: 'Dialga', text: ['{C:attention}Roar of Time:{} the first hand', 'of each round is scored twice:', 'every scored card', 'retriggers once', '{C:inactive}(#1#)'] },
    j_poke_palkia: { name: 'Palkia', text: ['{C:attention}Spacial Rend:{} {C:dark_edition}+#1#{} Joker slot', 'and {C:attention}+#2#{} hand size'] },
    j_poke_regigigas: { name: 'Regigigas', text: [
      ['{C:attention}Slow Start:{} gives nothing for', 'its first {C:attention}5{} rounds, then', '{X:mult,C:white} X#1# {} Mult for the rest of the run', '{C:attention}1{} round sooner for every',
        '{C:attention}5{} {C:attention}Stone{}, {C:attention}Glass{} or {C:attention}Steel{} cards', 'in your full deck {C:inactive}(min 1)', '{C:inactive}(Currently #2#: wakes after #3#)', '{C:inactive}(#4#)'],
      ['{C:attention}Creator:{} while awake, when a', '{C:attention}Blind{} is selected, a random', 'card in your deck becomes', 'a {C:attention}Stone{}, {C:attention}Glass{} or {C:attention}Steel{} card', '{C:inactive,s:0.8}(Unenhanced cards first)'],
    ] },
    j_poke_giratina: { name: 'Giratina', text: [
      ['{C:attention}Shadow Force:{} gains {X:mult,C:white} X#2# {} Mult', 'each time a playing card', 'is destroyed', '{C:inactive}(Currently {X:mult,C:white} X#1# {C:inactive} Mult)'],
      ['{C:attention}Origin Forme:{} for good once', '{C:attention}10{} playing cards have been', 'destroyed while you have it,', 'gains {X:mult,C:white} X#3# {} instead', '{C:inactive}(#4#)'],
    ] },
    j_poke_arceus: { name: 'Arceus', text: [
      ['{C:attention}Multitype:{} counts as', 'every {C:attention}type{}', '{C:inactive,s:0.8}(Its type never breaks Monotype)'],
      ['{C:attention}Judgment:{} {X:mult,C:white} X1 {} Mult, plus', '{X:mult,C:white} X#1# {} for each different', '{C:attention}type{} among your Jokers', '{C:inactive}(Itself counts as one)',
        '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {X:mult,C:white} X#3# {C:inactive} Mult)'],
    ] },
    j_poke_uxie: { name: 'Uxie', text: [
      ['{C:purple}+#1# Foresight', '{C:attention}Knowledge:{} each {C:attention}Foreseen{}', 'card gives {X:mult,C:white} X#2# {} Mult', '{C:inactive}(scored like a held card)'],
      [...LAKE_GUARDIANS(3, 4), '{C:inactive}(Currently {X:mult,C:white} X#5# {C:inactive} a card)'],
    ] },
    j_poke_mesprit: { name: 'Mesprit', text: [
      ['{C:attention}Emotion:{} {X:mult,C:white} X#1# {} Mult, or', '{X:mult,C:white} X#2# {} if the {C:attention}poker hand{}', 'hasn\'t been played yet', 'this round'],
      [...LAKE_GUARDIANS(3, 4), '{C:inactive}(Currently {X:mult,C:white} X#5# {C:inactive} / {X:mult,C:white} X#6# {C:inactive})'],
    ] },
    j_poke_azelf: { name: 'Azelf', text: [
      ['{C:attention}Willpower:{} {X:mult,C:white} X#1# {} Mult on the', 'final hand of each round'],
      [...LAKE_GUARDIANS(2, 3), '{C:inactive}(Currently {X:mult,C:white} X#4# {C:inactive})'],
    ] },
    j_poke_cresselia: { name: 'Cresselia', text: [
      ['{C:attention}Lunar Blessing:{} while you', 'have this Joker, playing cards', 'can\'t be {C:attention}debuffed{}', '{C:inactive}(Boss Blinds or anything else)'],
      ['{X:mult,C:white} X#1# {} Mult'],
    ] },
    j_poke_phione: { name: 'Phione', text: ['Each {X:poke_water,C:white}Water{} Joker', 'gives {C:mult}+#1#{} Mult', '{C:inactive}(Itself included)', '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {C:mult}+#3#{C:inactive} Mult)'] },
    j_poke_manaphy: { name: 'Manaphy', text: [
      ['{C:attention}Sea Guardian:{} each', '{X:poke_water,C:white}Water{} Joker gives {X:mult,C:white} X#1# {} Mult', '{C:inactive}(Itself included)', '{C:inactive}(Currently {C:attention}#4#{C:inactive}: {X:mult,C:white} X#5# {C:inactive} Mult)'],
      ['{C:attention}Egg:{} at the end of the shop,', 'if you have a free Joker slot,', '{C:green}#2# in #3#{} chance to', 'create a {C:attention}Phione{}'],
    ] },
    j_poke_cobalion: { name: 'Cobalion', text: [SACRED_SWORD('{C:spades}Spade{}'), SWORDS_OF_JUSTICE('{C:spades}Spades{}')] },
    j_poke_terrakion: { name: 'Terrakion', text: [SACRED_SWORD('{C:diamonds}Diamond{}'), SWORDS_OF_JUSTICE('{C:diamonds}Diamonds{}')] },
    j_poke_virizion: { name: 'Virizion', text: [SACRED_SWORD('{C:clubs}Club{}'), SWORDS_OF_JUSTICE('{C:clubs}Clubs{}')] },
    j_poke_tornadus: { name: 'Tornadus', text: [
      ['{C:chips}+#1#{} hand each round'],
      ['{C:attention}Therian Forme:{} after you', 'have had it for {C:attention}4{} rounds,', 'also {C:mult}+#2#{} Mult for each', 'hand left when it scores', '{C:inactive}(#3#)'],
    ] },
    j_poke_thundurus: { name: 'Thundurus', text: [
      ['{C:attention}Incarnate Forme:{} each scored', 'card has a {C:green}#1# in #2#{} chance', 'to earn {C:money}$#3#{}'],
      ['{C:attention}Therian Forme:{} after you', 'have had it for {C:attention}4{} rounds,', '{C:green}#4# in #5#{} instead, and each', 'card that pays also gives', '{X:mult,C:white} X#6# {} Mult', '{C:inactive}(#7#)'],
    ] },
    j_poke_reshiram: { name: 'Reshiram', text: [TAO_BOOST('Turboblaze', '{X:poke_fire,C:white}Fire{}'), FUSION('Fusion Flare', '{X:poke_fire,C:white}Fire{} Energy')] },
    j_poke_zekrom: { name: 'Zekrom', text: [TAO_BOOST('Teravolt', '{X:poke_lightning,C:black}Lightning{}'), FUSION('Fusion Bolt', '{X:poke_lightning,C:black}Lightning{} Energy')] },
    j_poke_landorus: { name: 'Landorus', text: [
      ['{C:attention}Incarnate Forme:{} each', '{C:attention}Stone{} card held in hand', 'gives {C:chips}+#1#{} Chips'],
      ['{C:attention}Therian Forme:{} after you', 'have had it for {C:attention}4{} rounds, each', 'scored {C:attention}Stone{} card gives', '{X:mult,C:white} X#2# {} Mult instead', '{C:inactive}(#3#)'],
    ] },
    j_poke_kyurem: { name: 'Kyurem', text: [
      ['{X:mult,C:white} X#1# {} Mult'],
      ['{C:attention}White Kyurem:{} with more', '{X:poke_fire,C:white}Fire{} than {X:poke_lightning,C:black}Lightning{} Jokers, each', '{X:poke_fire,C:white}Fire{} Joker gives {X:mult,C:white} X#2# {} Mult', '{C:attention}Black Kyurem:{} with more',
        '{X:poke_lightning,C:black}Lightning{} than {X:poke_fire,C:white}Fire{}, the same', 'for {X:poke_lightning,C:black}Lightning{} Jokers', '{C:inactive,s:0.8}(Itself not counted; a tie', '{C:inactive,s:0.8}keeps its form)', '{C:inactive}(#3#)'],
    ] },
    j_poke_keldeo: { name: 'Keldeo', text: [
      SACRED_SWORD('{C:hearts}Heart{}', 'Secret Sword'),
      SWORDS_OF_JUSTICE('{C:hearts}Hearts{}'),
      ['{C:attention}Resolute Form:{} for good once', '{C:attention}25{} {C:hearts}Hearts{} have scored while', 'you have it, each scored', '{C:hearts}Heart{} gives {X:mult,C:white} X#5# {} instead', '{C:inactive}(#6#)'],
    ] },
    j_poke_meloetta: { name: 'Meloetta', text: [
      ['{C:attention}Relic Song:{} switches Forme', 'after every hand played', '{C:inactive}(Aria at the start of each round)'],
      ['{C:attention}Aria{} {X:poke_psychic,C:white}Psychic{}: {X:mult,C:white} X#1# {} Mult', '{C:attention}Pirouette{} {X:poke_fighting,C:white}Fighting{}: retrigger', 'the first scored card {C:attention}#2#{} times', '{C:inactive}(Currently {C:attention}#3#{C:inactive})',
        '{C:inactive,s:0.8}(Its type never breaks Monotype)'],
    ] },
    j_poke_genesect: { name: 'Genesect', text: ['{C:attention}Techno Blast:{} {X:mult,C:white} X#1# {} Mult, plus', '{X:mult,C:white} X#2# {} for each {X:poke_water,C:white}Water{},', '{X:poke_lightning,C:black}Lightning{} or {X:poke_fire,C:white}Fire{} Joker',
      '{C:inactive}(Currently {C:attention}#3#{C:inactive}: {X:mult,C:white} X#4# {C:inactive} Mult)'] },
    j_poke_snivy: { name: 'Snivy', text: ['{C:attention}+#1#{} hand size', ...CONTRARY_HELD, EVOLVES_ROUNDS(3)] },
    j_poke_servine: { name: 'Servine', text: ['{C:attention}+#1#{} hand size', ...CONTRARY_HELD, EVOLVES_ROUNDS(3)] },
    j_poke_serperior: { name: 'Serperior', text: [
      ['{C:attention}+#1#{} hand size'],
      ['{C:attention}Contrary:{} {C:attention}debuffed{} cards', 'score as if not debuffed,', 'and each gives {X:mult,C:white} X#2# {} Mult', '{C:inactive}(Not when held in hand)'],
    ] },
    j_poke_tepig: { name: 'Tepig', text: ['{C:red}+#1#{} discard', ...FLAME_CHARGE('{C:mult}+#2#{} Mult'), '{C:inactive}(Currently {C:attention}#4#{C:inactive} in a row: #5#)', EVOLVES_ROUNDS(3)] },
    j_poke_pignite: { name: 'Pignite', text: ['{C:red}+#1#{} discard', ...FLAME_CHARGE('{C:mult}+#2#{} Mult'), '{C:inactive}(Currently {C:attention}#4#{C:inactive} in a row: #5#)', EVOLVES_ROUNDS(3)] },
    j_poke_emboar: { name: 'Emboar', text: [
      ['{C:red}+#1#{} discard'],
      [...FLAME_CHARGE('{X:mult,C:white} X1 {} Mult, plus {X:mult,C:white} X#2# {}'), '{C:inactive}(Currently {C:attention}#3#{C:inactive} in a row: #4#,', '{C:inactive}{X:mult,C:white} X#5# {C:inactive} Mult)'],
    ] },
    j_poke_oshawott: { name: 'Oshawott', text: ['{C:blue}+#1#{} hand', ...RAZOR_SHELL('first scored card'), '{C:inactive,s:0.8}(Energy carries to Samurott)', EVOLVES_ROUNDS(3)] },
    j_poke_dewott: { name: 'Dewott', text: ['{C:blue}+#1#{} hand', ...RAZOR_SHELL('first {C:attention}#2#{} scored cards'), '{C:inactive,s:0.8}(Energy carries to Samurott)', EVOLVES_ROUNDS(3)] },
    j_poke_samurott: { name: 'Samurott', text: [
      ['{C:blue}+#1#{} hand', ...RAZOR_SHELL('first {C:attention}#2#{} scored cards')],
      ['{C:attention}Shell Blade:{} scored {C:attention}Aces{}', 'give {X:mult,C:white} X#3# {} Mult'],
    ] },
    j_poke_sewaddle: { name: 'Sewaddle', text: [...TAILOR('a {C:attention}Bonus{} card'), '{C:inactive,s:0.8}(Energy carries to Leavanny)', EVOLVES_ROUNDS(2)] },
    j_poke_swadloon: { name: 'Swadloon', text: [...TAILOR('a {C:attention}Bonus{} or {C:attention}Mult{} card'), '{C:inactive,s:0.8}(Energy carries to Leavanny)', EVOLVES_ROUNDS(2)] },
    j_poke_leavanny: { name: 'Leavanny', text: [
      TAILOR('a {C:attention}Bonus{}, {C:attention}Mult{} or {C:attention}Lucky{} card'),
      ['Each scored {C:attention}enhanced{} card', 'gives {C:mult}+#1#{} Mult'],
    ] },
    j_poke_venipede: { name: 'Venipede', text: [...POISON_POINT, EVOLVES_ROUNDS(3)] },
    j_poke_whirlipede: { name: 'Whirlipede', text: [...POISON_POINT, EVOLVES_ROUNDS(3)] },
    j_poke_scolipede: { name: 'Scolipede', text: [POISON_POINT, ['Each {C:attention}unenhanced{} card', 'you discard also becomes', 'a {C:attention}Mult{} card']] },
    j_poke_cottonee: { name: 'Cottonee', text: [
      '{C:attention}+#1#{} hand size', '{C:attention}Prankster:{} the first hand', 'drawn each round draws', '{C:attention}1{} extra card', EVOLVES_ROUNDS(2),
    ] },
    j_poke_whimsicott: { name: 'Whimsicott', text: ['{C:attention}+#1#{} hand size'] },
    j_poke_petilil: { name: 'Petilil', text: ['Each scored {C:attention}Flower{} card', 'earns {C:money}$#1#{}', EVOLVES_ROUNDS(2)] },
    j_poke_lilligant: { name: 'Lilligant', text: [
      ['{C:attention}Flower Dance:{} {C:attention}Flower{} cards', 'need only {C:attention}#1#+{} suits'],
      ['Each scored {C:attention}Flower{} card', 'earns {C:money}$#2#{}'],
    ] },
    j_poke_basculin: { name: 'Basculin', text: [
      '{C:attention}#2#:{} scored', '{V:1}#3#{} and {V:2}#4#{}', 'each give {C:chips}+#1#{} Chips', '{C:inactive}(Red or Blue: its stripe,', '{C:inactive}rolled when it is created)',
      '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#6#{C:inactive,s:0.8} cards of its', '{C:inactive,s:0.8}suits have scored: #5#/#6#)',
    ] },
    j_poke_sandile: { name: 'Sandile', text: [...MOXIE_BLIND('{C:mult}+#1#{} Mult'), '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)', EVOLVES_ROUNDS(3)] },
    j_poke_krokorok: { name: 'Krokorok', text: [...MOXIE_BLIND('{C:mult}+#1#{} Mult'), '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)', EVOLVES_ROUNDS(3)] },
    j_poke_krookodile: { name: 'Krookodile', text: [
      [...MOXIE_BLIND('{X:mult,C:white} X#1# {} Mult'), '{C:inactive}(Currently {X:mult,C:white} X#3# {C:inactive} Mult)'],
      ['{C:mult}+#2#{} Mult {C:inactive}(kept from Krokorok)'],
    ] },
    j_poke_maractus: { name: 'Maractus', text: [
      'Each {C:attention}Hazard{} card held', 'in hand gives {C:mult}+#1#{} Mult', '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {C:mult}+#3#{C:inactive} Mult)',
    ] },
    j_poke_dwebble: { name: 'Dwebble', text: [...STONE_SHELL, EVOLVES_ROUNDS(3)] },
    j_poke_crustle: { name: 'Crustle', text: STONE_SHELL },
    j_poke_sigilyph: { name: 'Sigilyph', text: [
      ['{C:purple}+#1# Foresight'],
      ['Using a {C:planet}Planet{} card for', '{C:attention}Pair{} levels it up', '{C:attention}#2#{} more time'],
    ] },
    j_poke_yamask: { name: 'Yamask', text: [...GRUDGE(1), EVOLVES_ROUNDS(3), '{C:inactive,s:0.8}(Into {C:attention,s:0.8}Runerigus{C:inactive,s:0.8} instead once {C:attention,s:0.8}#7#{C:inactive,s:0.8}', '{C:inactive,s:0.8}Stone cards have scored: #6#/#7#)'] },
    j_poke_cofagrigus: { name: 'Cofagrigus', text: [
      GRUDGE(2),
      ['{C:attention}Mummy:{} the first Joker you', 'sell each {C:attention}Ante{} is not sold:', 'it becomes {C:dark_edition}Negative{} and', 'stays {C:inactive}(no money; it still', '{C:inactive}counts as sold for the X)',
        '{C:inactive}(A Negative one sells as usual)', '{C:inactive}(Mummy: #3#)'],
    ] },
    j_poke_tirtouga: { name: 'Tirtouga', text: [...ANCIENT_NINES, ANCIENT_EVO(5)] },
    j_poke_carracosta: { name: 'Carracosta', text: [...ANCIENT_NINES, '{X:attention,C:white}4+{} : {}Retrigger all scored {C:attention}#1#s{}'] },
    j_poke_archen: { name: 'Archen', text: [...ANCIENT_TENS, ANCIENT_EVO(5)] },
    j_poke_archeops: { name: 'Archeops', text: [
      [...ANCIENT_TENS, '{X:attention,C:white}4+{} : {X:mult,C:white} X#5# {} Mult'],
      ['{C:attention}Defeatist:{} on the final hand', 'of the round, all of these', 'are halved {C:inactive}(an X keeps half', '{C:inactive}its bonus: X2 is X1.5;', '{C:inactive}money rounds down)', '{C:inactive}(This hand: {C:attention}#6#{C:inactive})'],
    ] },
    j_poke_minccino: { name: 'Minccino', text: [
      '{C:attention}Tidy Up:{} each discard', 'draws {C:attention}1{} extra card', '{C:inactive}(+1 hand size until your', '{C:inactive}next hand is played)', EVOLVES_ROUNDS(1),
    ] },
    j_poke_cinccino: { name: 'Cinccino', text: [
      '{C:attention}Skill Link:{} the first scored', 'card retriggers once for', 'each discard used this round', '{C:inactive}(Max {C:attention}#1#{C:inactive}; currently {C:attention}#2#{C:inactive})',
    ] },
    j_poke_chespin: { name: 'Chespin', text: ['{C:attention}+#1#{} hand size', '{C:chips}+#2#{} Chips', EVOLVES_ROUNDS(3)] },
    j_poke_quilladin: { name: 'Quilladin', text: ['{C:attention}+#1#{} hand size', '{C:chips}+#2#{} Chips', EVOLVES_ROUNDS(3)] },
    j_poke_chesnaught: { name: 'Chesnaught', text: [
      ['{C:attention}+#1#{} hand size', '{C:chips}+#2#{} Chips'],
      ['{C:attention}Spiky Shield:{} {X:mult,C:white} X#3# {} Mult while', 'you have {C:attention}#4#{} or more hands left', '{C:inactive}(counted before the hand is played)', '{C:inactive}(#5#)'],
    ] },
    j_poke_fennekin: { name: 'Fennekin', text: ['{C:red}+#1#{} discard each round', '{C:purple}+#2# Foresight', '{C:inactive,s:0.8}(Energy carries to Delphox)', EVOLVES_ROUNDS(3)] },
    j_poke_braixen: { name: 'Braixen', text: [
      ['{C:red}+#1#{} discard each round', '{C:purple}+#2# Foresight'],
      ['The first time each round you', 'discard a card that shares a', 'rank with a {C:attention}Foreseen{} card,', 'create a {C:tarot}Tarot{} card', '{C:inactive}(Must have room; #4#)',
        '{C:inactive,s:0.8}(Energy carries to Delphox)', EVOLVES_ROUNDS(3)],
    ] },
    j_poke_delphox: { name: 'Delphox', text: [
      ['{C:red}+#1#{} discard each round', '{C:purple}+#2# Foresight'],
      ['{C:attention}Mystical Fire:{} gains', '{X:mult,C:white} X#3# {} Mult for each', '{C:tarot}Tarot{} card used', '{C:inactive}(Currently {X:mult,C:white} X#4# {C:inactive} Mult)'],
    ] },
    j_poke_froakie: { name: 'Froakie', text: ['{C:chips}+#1#{} hand', '{C:chips}+#2#{} Chips for each', '{X:poke_water,C:white}Water{} Joker {C:inactive}(Itself included)',
      '{C:inactive}(Currently {C:attention}#3#{C:inactive}: {C:chips}+#4#{C:inactive} Chips)', EVOLVES_ROUNDS(5)] },
    j_poke_frogadier: { name: 'Frogadier', text: ['{C:chips}+#1#{} hand', '{C:chips}+#2#{} Chips for each', '{X:poke_water,C:white}Water{} Joker {C:inactive}(Itself included)',
      '{C:inactive}(Currently {C:attention}#3#{C:inactive}: {C:chips}+#4#{C:inactive} Chips)', EVOLVES_ROUNDS(5)] },
    j_poke_greninja: { name: 'Greninja', text: [
      ['{C:chips}+#1#{} hand', '{X:mult,C:white} X#2# {} Mult, plus {X:mult,C:white} X#3# {} for', 'each other Joker of its type', '{C:inactive}(Currently {C:attention}#4#{C:inactive}, #5# others:', '{X:mult,C:white} X#6# {C:inactive} Mult)'],
      ['{C:attention}Protean:{} when a {C:attention}Blind{} is', 'selected, becomes the type most', 'common among your other Jokers', '{C:inactive}(a tie: it keeps its type)', '{C:inactive,s:0.8}(Its type never breaks Monotype)'],
    ] },
    j_poke_patrat: { name: 'Patrat', text: ['{C:purple}+#1# Foresight', ...LOOKOUT, EVOLVES_ROUNDS(3)] },
    j_poke_watchog: { name: 'Watchog', text: ['{C:purple}+#1# Foresight', ...LOOKOUT] },
    j_poke_lillipup: { name: 'Lillipup', text: [...PICKUP('a random {C:tarot}Tarot{} card'), '{C:inactive,s:0.8}(Energy carries to Stoutland)', EVOLVES_ROUNDS(3)] },
    j_poke_herdier: { name: 'Herdier', text: [...PICKUP('a {C:tarot}Tarot{} or {C:planet}Planet{} card'), '{C:inactive,s:0.8}(Energy carries to Stoutland)', EVOLVES_ROUNDS(3)] },
    j_poke_stoutland: { name: 'Stoutland', text: [
      PICKUP('a {C:tarot}Tarot{} or {C:planet}Planet{} card'),
      ['{C:mult}+#3#{} Mult for each', 'consumable card you hold', '{C:inactive}(Currently {C:mult}+#4#{C:inactive} Mult)'],
    ] },
    j_poke_purrloin: { name: 'Purrloin', text: [...PICKPOCKET, EVOLVES_ROUNDS(3)] },
    j_poke_liepard: { name: 'Liepard', text: PICKPOCKET },
    j_poke_pidove: { name: 'Pidove', text: [...SUPER_LUCK, '{C:inactive,s:0.8}(Energy carries to Tranquill)', EVOLVES_ROUNDS(6)] },
    j_poke_tranquill: { name: 'Tranquill', text: [SUPER_LUCK, ['When a {C:attention}Lucky{} card', 'triggers, it also gives', '{C:mult}+#6#{} Mult', EVOLVES_ROUNDS(7)]] },
    j_poke_unfezant: { name: 'Unfezant', text: [SUPER_LUCK, ['When a {C:attention}Lucky{} card', 'triggers, it also gives', '{X:mult,C:white} X#6# {} Mult']] },
    j_poke_blitzle: { name: 'Blitzle', text: ['{C:attention}Motor Drive:{} {C:mult}+#1#{} Mult for', 'each hand played this round', 'before any discard', '{C:inactive}(This one included; none',
      '{C:inactive}once you discard this round)', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)', EVOLVES_ROUNDS(3)] },
    j_poke_zebstrika: { name: 'Zebstrika', text: ['{C:attention}Motor Drive:{} {X:mult,C:white} X#1# {} Mult', 'if you haven\'t discarded', 'this round', '{C:inactive}(#2#)'] },
    j_poke_woobat: { name: 'Woobat', text: [...HEART_STAMP, '{C:inactive,s:0.8}(Energy carries to Swoobat)', EVOLVES_ROUNDS(2)] },
    j_poke_swoobat: { name: 'Swoobat', text: [...HEART_STAMP, 'and gives {X:mult,C:white} X#2# {} Mult'] },
    j_poke_timburr: { name: 'Timburr', text: [...PILLARS('{C:mult}+#1#{} Mult'), EVOLVES_ROUNDS(2)] },
    j_poke_gurdurr: { name: 'Gurdurr', text: [...PILLARS('{C:mult}+#1#{} Mult'), EVOLVES_ROUNDS(2)] },
    j_poke_conkeldurr: { name: 'Conkeldurr', text: PILLARS('{C:mult}+#1#{} Mult and {X:mult,C:white} X#2# {} Mult') },
    j_poke_tympole: { name: 'Tympole', text: [...SWIFT_SWIM, ...RAIN_NOTE, EVOLVES_ROUNDS(3)] },
    j_poke_palpitoad: { name: 'Palpitoad', text: [...SWIFT_SWIM, ...RAIN_NOTE, EVOLVES_ROUNDS(3)] },
    j_poke_seismitoad: { name: 'Seismitoad', text: [SWIFT_SWIM, ['While it\'s {C:poke_rain}raining{}, every', 'scored {C:clubs}Club{} retriggers', ...RAIN_NOTE]] },
    j_poke_throh: { name: 'Throh', text: [
      ['{C:attention}Seismic Toss:{} the lowest', 'ranked scored card gives', '{X:mult,C:white} X#1# {} Mult', '{C:inactive}(A tie: the leftmost; never', '{C:inactive}a Stone or debuffed card)'],
      ['{C:attention}Dojo Rivals:{} with {C:attention}Sawk{},', '{X:mult,C:white} X#2# {} more', '{C:inactive}(#3#: {X:mult,C:white} X#4# {C:inactive})'],
    ] },
    j_poke_sawk: { name: 'Sawk', text: [
      ['{C:attention}Karate Chop:{} the highest', 'ranked scored card gives', '{C:mult}+#1#{} Mult', '{C:inactive}(Aces high; a tie: the leftmost;', '{C:inactive}never a Stone or debuffed card)'],
      ['{C:attention}Dojo Rivals:{} with {C:attention}Throh{},', '{C:mult}+#2#{} more Mult', '{C:inactive}(#3#: {C:mult}+#4#{C:inactive})'],
    ] },
    // Gen 5, batch 3 (the owner's "Build batch 3", 2026-10-29)
    j_poke_ducklett: { name: 'Ducklett', text: ['{C:chips}+#1#{} Chips if played', 'hand contains a {C:attention}Flush{}', EVOLVES_ROUNDS(2)] },
    j_poke_swanna: { name: 'Swanna', text: ['{X:mult,C:white} X#1# {} Mult if played', 'hand contains a {C:attention}Flush{}'] },
    j_poke_deerling: { name: 'Deerling', text: [...SEASONS_TEXT('{C:mult}+#1#{} Mult'), ...SEASON_NOTE, EVOLVES_ROUNDS(4)] },
    j_poke_sawsbuck: { name: 'Sawsbuck', text: [...SEASONS_TEXT('{X:mult,C:white} X#1# {} Mult'), ...SEASON_NOTE] },
    j_poke_emolga: { name: 'Emolga', text: ['{C:attention}Static:{} each scored', '{C:attention}face{} card earns {C:money}$#1#{}', 'and gives {C:mult}+#2#{} Mult'] },
    j_poke_karrablast: { name: 'Karrablast', text: [['{C:mult}+#1#{} Mult'], TRADE_TEXT('Shelmet')] },
    j_poke_escavalier: { name: 'Escavalier', text: [['{X:mult,C:white} X#1# {} Mult'], STEEL_TEXT(2)] },
    j_poke_foongus: { name: 'Foongus', text: ['At the end of the shop,', '{C:green}#1# in #2#{} chance to', 'create a {C:attention}Poke Ball{}', '{C:inactive}(Must have room)', EVOLVES_ROUNDS(3)] },
    j_poke_amoonguss: { name: 'Amoonguss', text: ['{C:attention}Spore:{} the {C:attention}Boss Blind{}\'s', 'ability is disabled during', 'the round\'s {C:attention}first{} hand', '{C:inactive}(It comes back after that hand)', '{C:inactive}(#1#)'] },
    j_poke_alomomola: { name: 'Alomomola', text: ['{C:attention}Healing Heart:{} the first', 'playing card destroyed each', 'round is copied back into', 'your deck {C:inactive}(same rank, suit,', '{C:inactive}enhancement, seal and edition)', '{C:inactive}(#1#)'] },
    j_poke_joltik: { name: 'Joltik', text: ['{C:mult}+#1#{} Mult for each other', '{X:poke_lightning,C:black}Lightning{} Joker', '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {C:mult}+#3#{C:inactive} Mult)', EVOLVES_ROUNDS(4)] },
    j_poke_galvantula: { name: 'Galvantula', text: ['{C:attention}Electroweb:{} each {C:attention}Gold{}', 'card held in hand gives', '{X:mult,C:white} X#1# {} Mult'] },
    j_poke_tynamo: { name: 'Tynamo', text: ['{C:mult}+#1#{} Mult for each', '{C:attention}Steel{} card in your full deck', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)', EVOLVES_ROUNDS(3)] },
    j_poke_eelektrik: { name: 'Eelektrik', text: ['Each {C:attention}Steel{} card held', 'in hand gives {C:mult}+#1#{} Mult', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)', EVOLVES_ROUNDS(3)] },
    j_poke_eelektross: { name: 'Eelektross', text: ['{X:mult,C:white} X#1# {} Mult, plus {X:mult,C:white} X#2# {}', 'for each {C:attention}Steel{} card', 'in your full deck', '{C:inactive}(Currently {X:mult,C:white} X#3# {C:inactive} Mult)'] },
    j_poke_cubchoo: { name: 'Cubchoo', text: ['Scored {C:attention}Glass{} cards', 'each give {C:chips}+#1#{} Chips', EVOLVES_ROUNDS(2)] },
    j_poke_beartic: { name: 'Beartic', text: ['{C:attention}Freeze:{} at end of round, the', '{C:attention}leftmost{} card held in hand is', '{C:attention}frozen{}: it stays in your hand', 'into the next round and gives', '{X:mult,C:white} X#1# {} Mult while held', '{C:inactive}(Thaws when played or', '{C:inactive}discarded; one at a time)', '{C:inactive}(Frozen: {C:attention}#2#{C:inactive})'] },
    j_poke_shelmet: { name: 'Shelmet', text: [['{C:chips}+#1#{} Chips'], TRADE_TEXT('Karrablast')] },
    j_poke_accelgor: { name: 'Accelgor', text: [
      ['{C:chips}+#1#{} hand and {C:red}+#2#{} discard', 'each round'],
      ['{C:mult}+#3#{} Mult for each', 'hand left {C:inactive}(counted when', '{C:inactive}the hand scores)', '{C:inactive}(Currently {C:mult}+#4#{C:inactive} Mult)'],
    ] },
    j_poke_stunfisk: { name: 'Stunfisk', text: ['{C:attention}Static:{} each discard', 'earns {C:money}$#1#{}', '{C:inactive}(Max {C:money}$#2#{C:inactive} a round;', '{C:inactive}this round {C:money}$#3#{C:inactive})'] },
    j_poke_mienfoo: { name: 'Mienfoo', text: ['Retrigger the {C:attention}highest{}', 'ranked scored card', ...TOP_NOTE, EVOLVES_ROUNDS(1)] },
    j_poke_mienshao: { name: 'Mienshao', text: ['Retrigger the {C:attention}#1#{} highest', 'ranked scored cards', ...TOP_NOTE] },
    j_poke_druddigon: { name: 'Druddigon', text: ['Each scored {C:attention}King{}', 'gives {X:mult,C:white} X#1# {} Mult'] },
    j_poke_bouffalant: { name: 'Bouffalant', text: ['{C:attention}Head Charge:{} gains {X:mult,C:white} X#1# {} Mult', 'each time you beat a {C:attention}Blind{}', 'with the round\'s {C:attention}first{} hand', '{C:inactive}(Max {X:mult,C:white} X#2# {C:inactive}; currently {X:mult,C:white} X#3# {C:inactive})'] },
    j_poke_rufflet: { name: 'Rufflet', text: ['{C:mult}+#1#{} Mult during', '{C:attention}Boss Blinds{}', EVOLVES_ROUNDS(2)] },
    j_poke_braviary: { name: 'Braviary', text: ['{X:mult,C:white} X#1# {} Mult during', '{C:attention}Boss Blinds{}'] },
    j_poke_heatmor: { name: 'Heatmor', text: [
      ['{C:mult}+#1#{} Mult for each', 'discard used this round', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)'],
      ['{C:attention}Rivals:{} with {C:attention}Durant{}, gains', '{X:mult,C:white} X#3# {} Mult at end of round', '{C:inactive}(Currently {X:mult,C:white} X#4# {C:inactive} Mult; #5#)'],
    ] },
    j_poke_durant: { name: 'Durant', text: [STEEL_TEXT(1), ['{C:attention}Rivals:{} with {C:attention}Heatmor{},', 'Heatmor gains X Mult', 'at end of round {C:inactive}(#2#)']] },
    j_poke_larvesta: { name: 'Larvesta', text: ['{C:mult}+#1#{} Mult, doubled', 'while it\'s {C:poke_sun}sunny{}', '{C:inactive}(#2#)', ...SUN_NOTE, EVOLVES_ROUNDS(3)] },
    j_poke_volcarona: { name: 'Volcarona', text: [
      ['{C:poke_sun}Sunny Day:{} while you have', 'this Joker it\'s always {C:poke_sun}sunny{}', '{C:inactive}(Castform Sunny unless Kyogre;', '{C:inactive}rain still falls)'],
      ['{C:attention}Quiver Dance:{} each {X:poke_fire,C:white}Fire{}', 'Joker gives {X:mult,C:white} X#1# {} Mult', '{C:inactive}(Itself included)', '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {X:mult,C:white} X#3# {C:inactive} Mult)'],
    ] },
    // Gen 6, batch 1 (the owner's "go ahead", 2026-11-02)
    j_poke_fletchling: { name: 'Fletchling', text: [...GALE_WINGS('{C:mult}+#1#{} Mult'), EVOLVES_ROUNDS(3)] },
    j_poke_fletchinder: { name: 'Fletchinder', text: [...GALE_WINGS('{X:mult,C:white} X#1# {} Mult'), EVOLVES_ROUNDS(3)] },
    j_poke_talonflame: { name: 'Talonflame', text: ['{C:attention}Gale Wings:{} the first hand', 'of each round gives {X:mult,C:white} X#1# {} Mult,', 'and its first scored card', 'retriggers', '{C:inactive}(#2#)'] },
    j_poke_scatterbug: { name: 'Scatterbug', text: ['Each scored {C:attention}Wild{} card', 'gives {C:mult}+#1#{} Mult', EVOLVES_ROUNDS(2)] },
    j_poke_spewpa: { name: 'Spewpa', text: [...WILD_POWDER, '{C:inactive,s:0.8}(Energy carries to Vivillon)', EVOLVES_ROUNDS(1)] },
    j_poke_vivillon: { name: 'Vivillon', text: [
      WILD_POWDER,
      ['Each scored {C:attention}Wild{} card', 'gives {X:mult,C:white} X#1# {} Mult', '{C:inactive}(Pattern #2# of #3#)'],
    ] },
    j_poke_flabebe: { name: 'Flabébé', text: [...GARDEN_QUEEN('gives {C:mult}+#1#{} Mult'), FLOWER_NOTE(2), EVOLVES_ROUNDS(3)] },
    j_poke_floette: { name: 'Floette', text: ['Retrigger each scored', '{C:attention}Queen{}', FLOWER_NOTE(1), '{C:inactive,s:0.8}(Energy carries to Florges)', EVOLVES_ROUNDS(2)] },
    j_poke_florges: { name: 'Florges', text: ['Retrigger each scored', '{C:attention}Queen{} {C:attention}#1#{} times', 'Each scored {C:attention}Queen{} gives', '{X:mult,C:white} X#2# {} Mult', FLOWER_NOTE(3)] },
    j_poke_skiddo: { name: 'Skiddo', text: [...GRASS_TEAM, EVOLVES_ROUNDS(5)] },
    j_poke_gogoat: { name: 'Gogoat', text: [['{C:attention}+#1#{} hand size'], GRASS_TEAM.map((l) => l.replace(/#(\d)#/g, (m, n) => '#' + (+n + 1) + '#'))] },
    j_poke_pancham: { name: 'Pancham', text: [
      '{C:attention}Iron Fist:{} each scored', '{C:attention}face{} card gives {C:mult}+#1#{} Mult', EVOLVES_ROUNDS(2),
      '{C:inactive,s:0.8}(Evolves only at an end of round', '{C:inactive,s:0.8}while you have a Dark Joker;', '{C:inactive,s:0.8}now: #3#)',
    ] },
    j_poke_pangoro: { name: 'Pangoro', text: ['{C:attention}Iron Fist:{} each scored', '{C:attention}face{} card gives', '{X:mult,C:white} X#1# {} Mult'] },
    j_poke_furfrou: { name: 'Furfrou', text: [
      '{C:attention}Trim:{} a new trim each {C:attention}Ante{}', 'Scored cards of its suit each', 'give {C:chips}+#1#{} Chips and {C:mult}+#2#{} Mult', '{C:inactive}(Now: #3#, {V:1}#4#{C:inactive})',
      '{C:inactive,s:0.8}(Heart Hearts, Diamond Diamonds,', '{C:inactive,s:0.8}Star Spades, Debutante Clubs;', '{C:inactive,s:0.8}never the same twice running)',
    ] },
    j_poke_espurr: { name: 'Espurr', text: ['{C:purple}+#1# Foresight', '{C:inactive,s:0.8}(Energy carries to Meowstic)', EVOLVES_ROUNDS(2)] },
    j_poke_meowstic: { name: 'Meowstic', text: [
      '{C:attention}Prankster:{} at end of round,', 'create a random {C:tarot}Tarot{} card', '{C:inactive}(Must have room)', '{C:inactive}(♂: its gender is rolled', '{C:inactive}when it evolves)',
    ] },
    j_poke_meowstic_female: { name: 'Meowstic', text: [
      '{X:mult,C:white} X#1# {} Mult, plus {X:mult,C:white} X#2# {}', 'for each {C:tarot}Tarot{} card', 'you hold', '{C:inactive}(Currently {C:attention}#3#{C:inactive}: {X:mult,C:white} X#4# {C:inactive} Mult)',
      '{C:inactive}(♀: its gender is rolled', '{C:inactive}when it evolves)',
    ] },
    // Gen 6, batch 2 (the owner's "Yes", 2026-11-02)
    j_poke_spritzee: { name: 'Spritzee', text: [...HEALING_AROMA, EVOLVES_ROUNDS(2)] },
    j_poke_aromatisse: { name: 'Aromatisse', text: [HEALING_AROMA, ['{C:attention}Aroma Veil:{} {C:green}+#2#{} to the odds', 'of {C:attention}Lucky{} cards', '{C:inactive}(Currently {C:green}#3# in #4#{C:inactive} Mult,', '{C:green}#5# in #6#{C:inactive} money)']] },
    j_poke_swirlix: { name: 'Swirlix', text: [...SWEET_VEIL(1, 2), EVOLVES_ROUNDS(3)] },
    j_poke_slurpuff: { name: 'Slurpuff', text: [['{C:attention}+#1#{} consumable slot'], SWEET_VEIL(2, 3)] },
    j_poke_inkay: { name: 'Inkay', text: ['Each scored {C:attention}2{}, {C:attention}3{},', '{C:attention}4{} or {C:attention}5{} gives {C:mult}+#1#{} Mult', EVOLVES_ROUNDS(2)] },
    j_poke_malamar: { name: 'Malamar', text: [
      ['{C:attention}Topsy-Turvy:{} each scored', 'card gives the Chips of its', '{C:attention}flipped{} rank instead of its own', '{C:inactive}(2-A, 3-K, 4-Q, 5-J, 6-10 and', '{C:inactive}7-9 swap; 8 stays 8)', '{C:inactive}(Bonus Chips on the card stay;', '{C:inactive}Stone cards are unchanged)'],
      ['Each scored {C:attention}2{}, {C:attention}3{}, {C:attention}4{} or {C:attention}5{}', 'also gives {X:mult,C:white} X#1# {} Mult'],
    ] },
    j_poke_binacle: { name: 'Binacle', text: ['Each scored {C:attention}7{}', 'gives {C:chips}+#1#{} Chips', EVOLVES_ROUNDS(2)] },
    j_poke_barbaracle: { name: 'Barbaracle', text: ['Each scored {C:attention}7{} gives', '{C:chips}+#1#{} Chips and {X:mult,C:white} X#2# {} Mult'] },
    j_poke_skrelp: { name: 'Skrelp', text: [HAZARD_POISON, ['{C:mult}+#1#{} Mult for each', '{C:attention}Hazard{} card in your full deck', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)', EVOLVES_ROUNDS(3)]] },
    j_poke_dragalge: { name: 'Dragalge', text: [HAZARD_POISON, ['Each {C:attention}Hazard{} card held', 'in hand gives {X:mult,C:white} X#1# {} Mult']] },
    j_poke_tyrunt: { name: 'Tyrunt', text: [...ANCIENT_KINGS, ANCIENT_EVO(4)] },
    j_poke_tyrantrum: { name: 'Tyrantrum', text: [...ANCIENT_KINGS, '{X:attention,C:white}4+{} : {X:mult,C:white} X#4# {} Mult'] },
    j_poke_amaura: { name: 'Amaura', text: [...ANCIENT_QUEENS, ANCIENT_EVO(4)] },
    j_poke_aurorus: { name: 'Aurorus', text: [...ANCIENT_QUEENS, '{X:attention,C:white}4+{} : {X:mult,C:white} X#4# {} Mult'] },
    j_poke_hawlucha: { name: 'Hawlucha', text: ['{C:attention}Flying Press:{} retrigger the', '{C:attention}first{} and the {C:attention}last{} scored card', '{C:inactive}(A lone scored card: once)'] },
    j_poke_klefki: { name: 'Klefki', text: ['{C:attention}Key Ring:{} {X:mult,C:white} X1 {} Mult, plus', '{X:mult,C:white} X#1# {} for each {C:attention}Voucher{}', 'redeemed this run', '{C:inactive}(Currently #2#: {X:mult,C:white} X#3# {C:inactive} Mult)'] },
    j_poke_phantump: { name: 'Phantump', text: [...FOREST_CURSE, EVOLVES_ROUNDS(3)] },
    j_poke_trevenant: { name: 'Trevenant', text: [FOREST_CURSE, ['Each destroyed card plants a', '{C:attention}Seed{}: a random unenhanced', 'card in your deck becomes', 'a {C:attention}Seed{} card']] },
    j_poke_bergmite: { name: 'Bergmite', text: ['{C:chips}+#1#{} Chips', EVOLVES_ROUNDS(2)] },
    j_poke_avalugg: { name: 'Avalugg', text: ['{C:chips}+#1#{} Chips', '{X:mult,C:white} X#2# {} Mult on the', 'final hand of the round', '{C:inactive}(#3#)'] },
    j_poke_noibat: { name: 'Noibat', text: [GLASS_ODDS('{C:attention}+#1#{} hand size'), [...GLASS_BREAKS('Gains {C:mult}+#3#{} Mult'), '{C:inactive}(Currently {C:mult}+#4#{C:inactive} Mult)', EVOLVES_ROUNDS(5)]] },
    j_poke_noivern: { name: 'Noivern', text: [GLASS_ODDS('{C:attention}+#1#{} hand size'), ['{C:attention}Boomburst:{} gains {X:mult,C:white} X#3# {} Mult', 'each time a {C:attention}Glass{} card', 'breaks, and a random card in', 'your deck becomes {C:attention}Glass{}', '{C:inactive}(Currently {X:mult,C:white} X#4# {C:inactive} Mult', '{C:inactive}and {C:mult}+#5#{C:inactive} Mult)']] },
    // Gen 7, batch 4: the Gen 7 Legendaries (contentRev 67)
    j_poke_typenull: { name: 'Type: Null', text: ['Permanently gains {X:mult,C:white} X#1# {} Mult', 'at the end of each round', '{C:inactive}(Currently {X:mult,C:white} X#2# {C:inactive} Mult)', EVOLVES_ROUNDS(3)] },
    j_poke_silvally: { name: 'Silvally', text: [
      ['{C:attention}RKS System:{} {X:mult,C:white} X#1# {} Mult, plus', '{X:mult,C:white} X#2# {} for each other', 'Joker of its type', '{C:inactive}(Currently {C:attention}#4#{C:inactive}, #5# others)'],
      ['{X:mult,C:white} X#3# {} Mult {C:inactive}(kept from Type: Null)', '{C:inactive}(In all {X:mult,C:white} X#6# {C:inactive} Mult)'],
      ['Using any {C:attention}Energy{} card sets', 'its type to that {C:attention}Energy{}\'s', 'Every type\'s {C:attention}Energy{} works on it', '{C:inactive,s:0.8}(Its type never breaks Monotype)'],
    ] },
    j_poke_tapu_koko: { name: 'Tapu Koko', text: ['{C:attention}Electric Surge:{} every', 'scored card gives', '{X:mult,C:white} X#1# {} Mult'] },
    j_poke_tapu_lele: { name: 'Tapu Lele', text: ['{C:attention}Psychic Surge:{} each', '{C:tarot}Tarot{} card used creates', 'a random {C:planet}Planet{} card', '{C:inactive}(Must have room)'] },
    j_poke_tapu_bulu: { name: 'Tapu Bulu', text: [['{C:attention}+#1#{} hand size'], ['{C:attention}Grassy Surge:{} {X:mult,C:white} X#2# {} Mult']] },
    j_poke_tapu_fini: { name: 'Tapu Fini', text: [['{C:chips}+#1#{} hand each round'], ['{C:attention}Misty Surge:{} earn {C:money}$#2#{}', 'for each unused hand', 'at end of round']] },
    j_poke_cosmog: { name: 'Cosmog', text: ['Permanently gains {C:mult}+#1#{} Mult', 'at the end of each round', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)', EVOLVES_ROUNDS(3)] },
    j_poke_cosmoem: { name: 'Cosmoem', text: [
      ['Permanently gains {X:mult,C:white} X#1# {} Mult', 'at the end of each round', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} and {X:mult,C:white} X#3# {C:inactive} Mult)'],
      ['Counts the scored {C:hearts}red{} and', '{C:spades}black{} cards {C:inactive}(Red #4# / Black #5#)', '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#6#{C:inactive,s:0.8} rounds: more red,', '{C:inactive,s:0.8}Solgaleo; more black, Lunala;', '{C:inactive,s:0.8}a tie, Solgaleo)'],
    ] },
    j_poke_solgaleo: { name: 'Solgaleo', text: [
      ['{C:attention}Sunsteel Strike:{} each scored', '{C:hearts}Heart{} or {C:diamonds}Diamond{} gives', '{X:mult,C:white} X#1# {} Mult'],
      ['{C:mult}+#2#{} and {X:mult,C:white} X#3# {} Mult', '{C:inactive}(kept from Cosmog and Cosmoem)'],
    ] },
    j_poke_lunala: { name: 'Lunala', text: [
      ['{C:attention}Moongeist Beam:{} each scored', '{C:spades}Spade{} or {C:clubs}Club{} gives', '{X:mult,C:white} X#1# {} Mult'],
      ['{C:mult}+#2#{} and {X:mult,C:white} X#3# {} Mult', '{C:inactive}(kept from Cosmog and Cosmoem)'],
    ] },
    j_poke_necrozma: { name: 'Necrozma', text: [
      ['{C:attention}Prism:{} gains {X:mult,C:white} X#1# {} Mult', 'for each {C:planet}Planet{} card used', '{C:inactive}(Currently {X:mult,C:white} X#2# {C:inactive} Mult)'],
      ['At {X:mult,C:white} X#3# {}, becomes {C:attention}Ultra Necrozma{}', 'for good: {C:attention}+#4#{} hand size and', 'its type becomes {X:poke_dragon,C:white}Dragon{}', '{C:inactive}(#5#)'],
    ] },
    j_poke_magearna: { name: 'Magearna', text: ['{C:attention}Soul-Heart:{} scored', '{C:attention}Steel{} cards give', '{X:mult,C:white} X#1# {} Mult'] },
    j_poke_marshadow: { name: 'Marshadow', text: ['{C:attention}Spectral Thief:{} {X:mult,C:white} X#1# {} Mult;', '{X:mult,C:white} X#2# {} Mult during', 'a {C:attention}Boss Blind', '{C:inactive}(Currently {X:mult,C:white} X#3# {C:inactive} Mult)'] },
    j_poke_zeraora: { name: 'Zeraora', text: ['{C:attention}Plasma Fists:{} each scored', '{C:attention}face{} card earns {C:money}$#1#{}', 'and gives {X:mult,C:white} X#2# {} Mult'] },
    // Gen 7, batch 1 (the owner's "Yes build it", 2026-11-02)
    j_poke_pikipek: { name: 'Pikipek', text: [...MULTI_HIT_TEXT, EVOLVES_ROUNDS(3)] },
    j_poke_trumbeak: { name: 'Trumbeak', text: [...MULTI_HIT_TEXT, EVOLVES_ROUNDS(3)] },
    j_poke_toucannon: { name: 'Toucannon', text: ['{C:attention}Skill Link:{} always hits', '{C:attention}#2#{} times, each hit', '{X:mult,C:white} X#1# {} Mult', '{C:inactive}(Total {X:mult,C:white} X#3# {C:inactive} Mult)'] },
    j_poke_yungoos: { name: 'Yungoos', text: [...STAKEOUT('{C:mult}+#1#{} Mult'), EVOLVES_ROUNDS(3)] },
    j_poke_gumshoos: { name: 'Gumshoos', text: STAKEOUT('{X:mult,C:white} X#1# {} Mult') },
    j_poke_crabrawler: { name: 'Crabrawler', text: ['{C:attention}Power-Up Punch:{} the first', 'scored card of each hand', 'permanently gains {C:mult}+#1#{} Mult', EVOLVES_ROUNDS(2)] },
    j_poke_crabominable: { name: 'Crabominable', text: ['{C:attention}Power-Up Punch:{} every', 'scored card permanently', 'gains {C:mult}+#1#{} Mult, the first', 'scored card {C:mult}+#2#{} instead'] },
    j_poke_oricorio: { name: 'Oricorio', text: [
      ['{C:attention}Dance:{} on the first deal of', 'each round, the suit held most', 'picks its style and type', '{C:inactive}({C:hearts}Hearts{C:inactive} Baile {X:poke_fire,C:white}Fire{C:inactive},', '{C:diamonds}Diamonds{C:inactive} Pom-Pom {X:poke_lightning,C:black}Lightning{C:inactive},',
        '{C:spades}Spades{C:inactive} Pa\'u {X:poke_psychic,C:white}Psychic{C:inactive},', '{C:clubs}Clubs{C:inactive} Sensu {X:poke_psychic,C:white}Psychic{C:inactive})', '{C:inactive,s:0.8}(A tie keeps its style;', '{C:inactive,s:0.8}its type never breaks Monotype)'],
      ['Scored cards of its style\'s', 'suit give {X:mult,C:white} X#1# {} Mult', '{C:inactive}(Currently #2#: {V:1}#3#{C:inactive})'],
    ] },
    j_poke_cutiefly: { name: 'Cutiefly', text: ['{C:mult}+#1#{} Mult for each', '{X:poke_fairy,C:white}Fairy{} Joker {C:inactive}(Itself included)', '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {C:mult}+#3#{C:inactive} Mult)', EVOLVES_ROUNDS(4)] },
    j_poke_ribombee: { name: 'Ribombee', text: ['{X:mult,C:white} X1 {} Mult, plus {X:mult,C:white} X#1# {}', 'for each {X:poke_fairy,C:white}Fairy{} Joker', '{C:inactive}(Itself included)', '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {X:mult,C:white} X#3# {C:inactive} Mult)'] },
    j_poke_wishiwashi: { name: 'Wishiwashi', text: ['{C:attention}Schooling:{}', '{C:attention}School Form:{} {X:mult,C:white} X#1# {} Mult while', 'you have at least half of', 'the round\'s hands left', '{C:attention}Solo Form:{} {C:mult}+#2#{} Mult', 'otherwise', '{C:inactive}(Next hand: #3#)'] },
    j_poke_mareanie: { name: 'Mareanie', text: ['{C:attention}Merciless:{} each scored', 'card gives {C:mult}+#1#{} Mult for each', '{C:attention}Boss Blind{} beaten this run', '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {C:mult}+#3#{C:inactive} Mult a card)', EVOLVES_ROUNDS(4)] },
    j_poke_toxapex: { name: 'Toxapex', text: ['{C:attention}Merciless:{} {X:mult,C:white} X1 {} Mult, plus', '{X:mult,C:white} X#1# {} for each {C:attention}Boss Blind{}', 'beaten this run', '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {X:mult,C:white} X#3# {C:inactive} Mult)'] },
    j_poke_dewpider: { name: 'Dewpider', text: ['{C:attention}Water Bubble:{} scored {C:clubs}Clubs{}', 'give {C:chips}+#1#{} Chips, doubled', 'while it\'s {C:poke_rain}raining{}', '{C:inactive}(#2#)', ...RAIN_NOTE, EVOLVES_ROUNDS(3)] },
    j_poke_araquanid: { name: 'Araquanid', text: ['{C:attention}Water Bubble:{} scored {C:clubs}Clubs{}', 'give {C:chips}+#1#{} Chips and {X:mult,C:white} X#2# {} Mult', 'While it\'s {C:poke_rain}raining{}: {C:chips}+#4#{}', 'Chips and {X:mult,C:white} X#5# {} Mult', '{C:inactive}(#3#)', ...RAIN_NOTE] },
    j_poke_fomantis: { name: 'Fomantis', text: ['{C:mult}+#1#{} Mult on the', 'final hand of the round', '{C:inactive}(#2#)', EVOLVES_ROUNDS(3)] },
    j_poke_lurantis: { name: 'Lurantis', text: ['{C:attention}Solar Blade:{} {X:mult,C:white} X#1# {} Mult on', 'the final hand of the round,', '{X:mult,C:white} X#2# {} while it\'s {C:poke_sun}sunny{}', '{C:inactive}(#3#; #4#)', ...SUN_NOTE] },
    j_poke_morelull: { name: 'Morelull', text: ['{C:mult}+#1#{} Mult for each {C:attention}Lucky{}', 'card in your full deck', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)', EVOLVES_ROUNDS(3)] },
    j_poke_shiinotic: { name: 'Shiinotic', text: [
      ['{C:mult}+#1#{} Mult for each {C:attention}Lucky{}', 'card in your full deck'],
      ['Gains {C:mult}+#2#{} Mult each time', 'a scored {C:attention}Lucky{} card triggers', '{C:inactive}(Banked: {C:mult}+#3#{C:inactive}; currently {C:mult}+#4#{C:inactive} Mult)'],
    ] },
    // Gen 7, batch 2 (contentRev 65)
    j_poke_salandit: { name: 'Salandit', text: ['{C:red}+#1#{} discard each round', 'Each scored {C:attention}Queen{}', 'gives {C:mult}+#2#{} Mult', '{C:inactive}(#3#)',
      '{C:inactive,s:0.8}(Only ♀ evolves, after {C:attention,s:0.8}#4#{C:inactive,s:0.8} rounds)'] },
    j_poke_salazzle: { name: 'Salazzle', text: ['{C:red}+#1#{} discard each round', 'Each scored {C:attention}Queen{}', 'gives {X:mult,C:white} X#2# {} Mult'] },
    j_poke_stufful: { name: 'Stufful', text: ['{C:chips}+#1#{} Chips and {C:mult}+#2#{} Mult', EVOLVES_ROUNDS(3)] },
    j_poke_bewear: { name: 'Bewear', text: [['{X:mult,C:white} X#1# {} Mult'], ['{C:attention}Strong Hug:{} at end of round,', '{C:green}#2# in #3#{} chance to destroy', 'the Joker directly to its {C:attention}right{}', '{C:inactive}(#4#)']] },
    j_poke_comfey: { name: 'Comfey', text: ['{C:attention}Floral Gift:{} at end of round,', '{C:green}#1# in #2#{} chance to give {C:attention}+1{}', '{C:poke_pink}Energy{} to a random other', 'Pokémon Joker that can take it', '{C:inactive}(#3#)'] },
    j_poke_sandygast: { name: 'Sandygast', text: ['Gains {C:chips}+#1#{} Chips each time', 'a {C:attention}Stone{} card scores', '{C:inactive}(Currently {C:chips}+#2#{C:inactive} Chips)', EVOLVES_ROUNDS(3)] },
    j_poke_palossand: { name: 'Palossand', text: ['Gains {X:mult,C:white} X#1# {} Mult each time', 'a {C:attention}Stone{} card scores', '{C:inactive}(Currently {X:mult,C:white} X#2# {C:inactive} Mult', '{C:inactive}and {C:chips}+#3#{C:inactive} Chips)'] },
    j_poke_pyukumuku: { name: 'Pyukumuku', text: [
      ['Gains {C:chips}+#1#{} Chips at', 'end of round', '{C:inactive}(Currently {C:chips}+#2#{C:inactive} Chips)'],
      ['{C:attention}Innards Out:{} when sold or', 'destroyed, earn {C:money}$#3#{} for', 'each round held', '{C:inactive}(Currently {C:money}$#4#{C:inactive})'],
    ] },
    j_poke_komala: { name: 'Komala', text: ['{X:mult,C:white} X#1# {} Mult', '{C:attention}Comatose:{} can\'t be {C:attention}debuffed{},', 'and Jokers can\'t destroy it', '{C:inactive}(Jokers skip it when choosing', '{C:inactive}what to destroy; selling,', '{C:inactive}Hex and Ankh still remove it)'] },
    j_poke_bruxish: { name: 'Bruxish', text: ['{C:attention}Strong Jaw:{} retrigger', 'each scored card', 'with a {C:attention}seal{}'] },
    j_poke_jangmoo: { name: 'Jangmo-o', text: ['Gains {C:mult}+#1#{} Mult each time', 'you play a {C:attention}Full House{}', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)', '{C:inactive,s:0.8}(Evolves at {C:mult,s:0.8}+#2#{C:inactive,s:0.8} / +#3# Mult)'] },
    j_poke_hakamoo: { name: 'Hakamo-o', text: ['Gains {C:mult}+#1#{} Mult each time', 'you play a {C:attention}Full House{}', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)', '{C:inactive,s:0.8}(Evolves at {C:mult,s:0.8}+#2#{C:inactive,s:0.8} / +#3# Mult)'] },
    j_poke_kommoo: { name: 'Kommo-o', text: [
      ['{C:mult}+#4#{} Mult {C:inactive}(kept from Hakamo-o)'],
      ['{C:attention}Clangorous Soul:{} {X:mult,C:white} X1 {} Mult,', 'plus {X:mult,C:white} X#1# {} for each', '{C:attention}Full House{} played this run', '{C:inactive}(Currently #2#: {X:mult,C:white} X#3# {C:inactive} Mult)'],
    ] },
    // Gen 8, batch 1 (contentRev 70)
    j_poke_rookidee: { name: 'Rookidee', text: [...FLYING_TAXI, ENERGY_TO('Corviknight'), EVOLVES_ROUNDS(2)] },
    j_poke_corvisquire: { name: 'Corvisquire', text: [...FLYING_TAXI, ENERGY_TO('Corviknight'), EVOLVES_ROUNDS(2)] },
    j_poke_corviknight: { name: 'Corviknight', text: [FLYING_TAXI, ['{X:mult,C:white} X#2# {} Mult', '{C:attention}+#3#{} card slot', 'available in shop']] },
    j_poke_blipbug: { name: 'Blipbug', text: ['{C:purple}+#1# Foresight', ENERGY_TO('Dottler'), EVOLVES_ROUNDS(2)] },
    j_poke_dottler: { name: 'Dottler', text: ['{C:purple}+#1# Foresight', ...FORESEEN('{C:mult}+#2#{} Mult'), EVOLVES_ROUNDS(3)] },
    j_poke_orbeetle: { name: 'Orbeetle', text: ['{C:purple}+#1# Foresight', ...FORESEEN('{X:mult,C:white} X#2# {} Mult')] },
    j_poke_gossifleur: { name: 'Gossifleur', text: [...COTTON_DOWN, EVOLVES_ROUNDS(2)] },
    j_poke_eldegoss: { name: 'Eldegoss', text: [
      COTTON_DOWN,
      ['{C:attention}Cotton Spore:{} when a {C:attention}Blind{}', 'is selected, a random unenhanced', 'card in your deck becomes a', '{C:attention}Seed{} card',
        '{C:attention}+#2#{} growth level {C:inactive}(stacks)', '{C:inactive}(Seeds now bloom in {C:attention}#3#{C:inactive} scores)'],
    ] },
    j_poke_wooloo: { name: 'Wooloo', text: ['{C:chips}+#1#{} Chips', EVOLVES_ROUNDS(2)] },
    j_poke_dubwool: { name: 'Dubwool', text: [['{C:chips}+#1#{} Chips'], ['{C:attention}Cotton Guard:{} {C:chips}+#2#{} hand', 'during {C:attention}Boss Blinds{}', '{C:inactive}(#3#)']] },
    j_poke_chewtle: { name: 'Chewtle', text: ['{C:mult}+#1#{} Mult for each', '{X:poke_water,C:white}Water{} Joker {C:inactive}(Itself included)', '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {C:mult}+#3#{C:inactive} Mult)', EVOLVES_ROUNDS(4)] },
    j_poke_drednaw: { name: 'Drednaw', text: ['{X:mult,C:white} X1 {} Mult, plus {X:mult,C:white} X#1# {}', 'for each {X:poke_water,C:white}Water{} Joker', '{C:inactive}(Itself included)', '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {X:mult,C:white} X#3# {C:inactive} Mult)'] },
    j_poke_rolycoly: { name: 'Rolycoly', text: [...COAL, ENERGY_TO('Carkol'), EVOLVES_ROUNDS(1)] },
    j_poke_carkol: { name: 'Carkol', text: [COAL, ['Scored {C:attention}Stone{} cards', 'give {C:mult}+#1#{} Mult', EVOLVES_ROUNDS(2)]] },
    j_poke_coalossal: { name: 'Coalossal', text: [['{C:red}+#2#{} discard each round'], COAL, ['{C:attention}Steam Engine:{} scored', '{C:attention}Stone{} cards give', '{X:mult,C:white} X#1# {} Mult']] },
    j_poke_silicobra: { name: 'Silicobra', text: ['{C:attention}Sand Spit:{} each card you', 'discard has a {C:green}#1# in #2#{}', 'chance to become a', '{C:attention}Stone{} card', '{C:inactive}(Unenhanced cards only)', ENERGY_TO('Sandaconda'), EVOLVES_ROUNDS(3)] },
    j_poke_sandaconda: { name: 'Sandaconda', text: [
      ['{C:poke_sand}Sandstorm:{} while you have', 'this Joker, every round', 'is a {C:poke_sand}sandstorm{}', '{C:inactive}(#3#)'],
      ['Scored {C:attention}Stone{} cards give', '{C:chips}+#1#{} Chips and {X:mult,C:white} X#2# {} Mult'],
      ['{C:attention}Sand Spit:{} each card you', 'discard has a {C:green}#4# in #5#{}', 'chance to become a', '{C:attention}Stone{} card', '{C:inactive}(Unenhanced cards only)'],
    ] },
    j_poke_cramorant: { name: 'Cramorant', text: ['{C:attention}Gulp Missile:{} your first', 'discard each round loads', 'a missile; your next scored', 'hand fires it for {X:mult,C:white} X#1# {} Mult', '{C:inactive}(Lost if the round ends unfired)', '{C:inactive}(Missile: #2#)'] },
    j_poke_arrokuda: { name: 'Arrokuda', text: [...PROPELLER('{C:mult}+#1#{} Mult'), EVOLVES_ROUNDS(2)] },
    j_poke_barraskewda: { name: 'Barraskewda', text: PROPELLER('{X:mult,C:white} X#1# {} Mult') },
    // Gen 8, batch 2 (contentRev 71)
    j_poke_toxel: { name: 'Toxel', text: ['{C:mult}+#1#{} Mult', EVOLVES_ROUNDS(2)] },
    j_poke_toxtricity: { name: 'Toxtricity', text: [
      ['{C:attention}Amped Form, Punk Rock:{}', '{X:mult,C:white} X#1# {} Mult if exactly', '{C:attention}5{} cards are played'],
      ['{C:attention}Low Key Form:{} {C:chips}+#2#{} Chips', 'for each card fewer than', '{C:attention}5{} played'],
      ['{C:inactive}(Form: rolled when obtained)'],
    ] },
    j_poke_toxtricity_amped: { name: 'Toxtricity', text: ['{C:attention}Punk Rock:{} {X:mult,C:white} X#1# {} Mult', 'if exactly {C:attention}5{} cards', 'are played', '{C:inactive}(Amped Form)'] },
    j_poke_toxtricity_lowkey: { name: 'Toxtricity', text: ['{C:chips}+#2#{} Chips for each card', 'fewer than {C:attention}5{} played', '{C:inactive}(Low Key Form)'] },
    j_poke_sizzlipede: { name: 'Sizzlipede', text: [...FIRE_SPIN('{C:mult}+#1#{} Mult'), '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult; #3#)', EVOLVES_ROUNDS(4)] },
    j_poke_centiskorch: { name: 'Centiskorch', text: [
      [...FIRE_SPIN('{X:mult,C:white} X#1# {} Mult'), '{C:inactive}(Currently {X:mult,C:white} X#2# {C:inactive} Mult; #4#)'],
      ['{C:mult}+#3#{} Mult {C:inactive}(kept from Sizzlipede)'],
    ] },
    j_poke_clobbopus: { name: 'Clobbopus', text: ['{C:attention}Octolock:{} {C:mult}+#1#{} Mult for', 'each card held in hand', 'that shares a rank with', 'a scored card', EVOLVES_ROUNDS(2)] },
    j_poke_grapploct: { name: 'Grapploct', text: ['{C:attention}Octolock:{} each card held', 'in hand that shares a rank', 'with a scored card gives', '{X:mult,C:white} X#1# {} Mult'] },
    j_poke_sinistea: { name: 'Sinistea', text: [...TEA_TEXT, EVOLVES_ROUNDS(6)] },
    j_poke_polteageist: { name: 'Polteageist', text: TEA_TEXT },
    j_poke_hatenna: { name: 'Hatenna', text: [...PSYCHIC_TEAM, EVOLVES_ROUNDS(4)] },
    j_poke_hattrem: { name: 'Hattrem', text: [...PSYCHIC_TEAM, EVOLVES_ROUNDS(4)] },
    j_poke_hatterene: { name: 'Hatterene', text: [
      ['{X:mult,C:white} X1 {} Mult, plus {X:mult,C:white} X#1# {}', 'for each {X:poke_psychic,C:white}Psychic{} Joker', '{C:inactive}(Itself included)', '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {X:mult,C:white} X#3# {C:inactive} Mult)'],
      ['{C:attention}Magic Powder:{} when a {C:attention}Blind{}', 'is selected, the Joker to its', '{C:attention}right{} gets a {X:poke_psychic,C:white}Psychic{} Tera sticker', '{C:inactive}(unless it is Psychic already)'],
    ] },
    j_poke_impidimp: { name: 'Impidimp', text: ['{C:attention}Prankster:{} shop rerolls', 'cost {C:money}$#1#{} less', '{C:inactive}(never below $1)', ENERGY_TO('Grimmsnarl'), EVOLVES_ROUNDS(2)] },
    j_poke_morgrem: { name: 'Morgrem', text: [
      PRANKSTER_FREE,
      ['Shop rerolls cost {C:money}$#4#{} less', '{C:inactive}(never below $1)', ENERGY_TO('Grimmsnarl'), EVOLVES_ROUNDS(2)],
    ] },
    j_poke_grimmsnarl: { name: 'Grimmsnarl', text: [
      PRANKSTER_FREE,
      ['Permanently gains {X:mult,C:white} X#2# {}', 'Mult for every shop reroll', '{C:inactive}(Currently {X:mult,C:white} X#3# {C:inactive} Mult)'],
    ] },
    // Gen 8, batch 3 (contentRev 72)
    j_poke_obstagoon: { name: 'Obstagoon', text: ['{X:mult,C:white} X#1# {} Mult', '{C:attention}Blocking:{} {X:mult,C:white} X#2# {} Mult instead', 'while the {C:attention}Boss Blind{} is', 'debuffing any of your cards', '{C:inactive}(Now: #3#)'] },
    j_poke_cursola: { name: 'Cursola', text: ['{X:mult,C:white} X#1# {} Mult', '{C:attention}Perish Body:{} crumbles', '(is destroyed) at the end', 'of its {C:attention}4th{} round held', '{C:inactive}(Rounds left: {C:attention}#2#{C:inactive})'] },
    j_poke_sirfetchd: { name: 'Sirfetch\'d', text: ['{C:attention}Meteor Assault:{} {X:mult,C:white} X1 {} Mult,', 'plus {X:mult,C:white} X#1# {} for each', '{C:attention}Lucky{} card trigger this round', '{C:inactive}(Currently #2#: {X:mult,C:white} X#3# {C:inactive} Mult)'] },
    j_poke_mrrime: { name: 'Mr. Rime', text: ['{C:attention}Screen Cleaner:{} the', '{C:attention}Boss Blind{}\'s ability is', 'disabled during your', '{C:attention}final{} hand of the round', '{C:inactive}(#1#)'] },
    j_poke_runerigus: { name: 'Runerigus', text: [
      ['{C:attention}Wandering Spirit:{} each', 'scored {C:attention}Stone{} card gives', '{X:mult,C:white} X#1# {} Mult'],
      ['{X:mult,C:white} X#2# {} Mult {C:inactive}(kept from Yamask)'],
    ] },
    j_poke_milcery: { name: 'Milcery', text: [...DECORATE, EVOLVES_ROUNDS(2)] },
    j_poke_alcremie: { name: 'Alcremie', text: [DECORATE, ['{C:attention}Whipped Cream:{} when a', '{C:attention}Blind{} is selected, a random', 'card in your deck with no', 'edition becomes {C:dark_edition}Foil{} or', '{C:dark_edition}Holographic{}', '{C:inactive}(#2#)']] },
    j_poke_falinks: { name: 'Falinks', text: ['{C:attention}Formation:{} if every', 'scored card shares a suit,', 'each gives {C:mult}+#1#{} Mult', '{C:inactive}(Wild cards fit any suit;', '{C:inactive}a Stone card breaks it)'] },
    j_poke_pincurchin: { name: 'Pincurchin', text: ['{C:attention}Lightning Rod:{} {X:mult,C:white} X1 {} Mult,', 'plus {X:mult,C:white} X#1# {} for each', '{X:poke_lightning,C:white}Lightning{} Energy card', 'used this run', '{C:inactive}(Currently #2#: {X:mult,C:white} X#3# {C:inactive} Mult)'] },
    j_poke_snom: { name: 'Snom', text: ['Each scored {C:attention}Glass{}', 'card gives {C:mult}+#1#{} Mult', EVOLVES_ROUNDS(2)] },
    j_poke_frosmoth: { name: 'Frosmoth', text: ['{C:attention}Ice Scales:{} each {C:attention}Glass{}', 'card {C:attention}held in hand{}', 'gives {X:mult,C:white} X#1# {} Mult'] },
    j_poke_eiscue: { name: 'Eiscue', text: [
      '{C:attention}Ice Face:{} {X:mult,C:white} X#1# {} Mult', 'If the round\'s first hand', 'doesn\'t beat the {C:attention}Blind{}, the', 'ice breaks: {X:mult,C:white} X#2# {} Mult',
      '{C:inactive,s:0.8}(It re-forms when a round\'s first', '{C:inactive,s:0.8}deal is {C:poke_snow,s:0.8}Snowy{C:inactive,s:0.8}: Spades held most)',
    ] },
    j_poke_eiscue_noice: { name: 'Eiscue', text: [
      '{C:attention}Noice Face:{} {X:mult,C:white} X#2# {} Mult', 'The ice re-forms ({X:mult,C:white} X#1# {})', 'when a round\'s first deal', 'is {C:poke_snow}Snowy{}',
      '{C:inactive,s:0.8}(Spades held most:', '{C:inactive,s:0.8}Castform\'s Forecast)',
    ] },
    j_poke_indeedee: { name: 'Indeedee', text: [
      '{C:inactive}(Its gender is rolled', '{C:inactive}when it is obtained)', '♂: {X:mult,C:white} X#1# {} Mult and', '{C:attention}+#2#{} consumable slot', '♀: each {C:tarot}Tarot{} card', 'used earns {C:money}$#3#{}',
    ] },
    j_poke_indeedee_male: { name: 'Indeedee', text: ['{X:mult,C:white} X#1# {} Mult', '{C:attention}+#2#{} consumable slot', '{C:inactive}(♂: its gender is rolled', '{C:inactive}when it is obtained)'] },
    j_poke_indeedee_female: { name: 'Indeedee', text: ['Each {C:tarot}Tarot{} card used', 'earns {C:money}$#3#{}', '{C:inactive}(♀: its gender is rolled', '{C:inactive}when it is obtained)'] },
    j_poke_morpeko: { name: 'Morpeko', text: ['{C:attention}Hunger Switch:{} switches', 'form after every hand played', '{C:attention}Full Belly:{} {C:mult}+#1#{} Mult', '{C:attention}Hangry:{} {X:mult,C:white} X#2# {} Mult', '{C:inactive}(Now: {C:attention}#3#{C:inactive})'] },
    j_poke_cufant: { name: 'Cufant', text: ['{C:chips}+#1#{} Chips for each', '{C:attention}Steel{} card in your', 'full deck', '{C:inactive}(Currently {C:chips}+#2#{C:inactive} Chips)', EVOLVES_ROUNDS(3)] },
    j_poke_copperajah: { name: 'Copperajah', text: ['Each {C:attention}Steel{} card', '{C:attention}held in hand{} at end', 'of round earns {C:money}$#1#{}'] },
    j_poke_dracozolt: { name: 'Dracozolt', text: ANCIENT_TENS },
    j_poke_arctozolt: { name: 'Arctozolt', text: ['{C:attention}Ancient #1#s{}', '{X:attention,C:white}1+{} : {C:chips}+#2#{} Chips', '{X:attention,C:white}2+{} : {}Retrigger all scored {C:attention}#1#s{}', '{X:attention,C:white}3+{} : {X:mult,C:white} X#4# {} Mult'] },
    j_poke_dracovish: { name: 'Dracovish', text: ['{C:attention}Ancient #1#s{}', '{X:attention,C:white}1+{} : {C:mult}+#2#{} Mult', '{X:attention,C:white}2+{} : {}The first scored {C:attention}#1#{}', 'retriggers {C:attention}#3#{} times', '{X:attention,C:white}3+{} : {X:mult,C:white} X#4# {} Mult'] },
    j_poke_arctovish: { name: 'Arctovish', text: ['{C:attention}Ancient #1#s{}', '{X:attention,C:white}1+{} : {C:chips}+#2#{} Chips', '{X:attention,C:white}2+{} : {X:mult,C:white} X#3# {} Mult', '{X:attention,C:white}3+{} : {C:chips}+#4#{} hand this round', '{C:inactive}(Once per round: #5#)'] },
    j_poke_basculegion: { name: 'Basculegion', text: ['{C:attention}Last Respects:{} {X:mult,C:white} X1 {} Mult,', 'plus {X:mult,C:white} X#1# {} for each', 'Joker sold or destroyed', 'this run', '{C:inactive}(Currently #2#: {X:mult,C:white} X#3# {C:inactive} Mult)'] },
    // Gen 8, batch 4: the Gen 8 Legendaries (the owner's "Yes", 2026-11-03)
    j_poke_zacian: { name: 'Zacian', text: [
      ['{C:attention}Intrepid Sword:{} {X:mult,C:white} X#1# {} Mult'],
      ['{C:attention}Crowned Sword:{} for good once', 'you beat {C:attention}3{} Boss Blinds while', 'you have it: {X:mult,C:white} X#2# {} Mult instead', '{C:inactive}(#3#)'],
    ] },
    j_poke_zamazenta: { name: 'Zamazenta', text: [
      ['{C:attention}Dauntless Shield:{} {C:chips}+#1#{} hand', 'each round'],
      ['{C:attention}Crowned Shield:{} for good once', 'you beat {C:attention}3{} Boss Blinds while', 'you have it: {C:chips}+#2#{} hands in all', 'and {X:mult,C:white} X#3# {} Mult', '{C:inactive}(#4#)'],
    ] },
    j_poke_eternatus: { name: 'Eternatus', text: [
      ['{C:attention}Dynamax:{} permanently gains', '{X:mult,C:white} X#1# {} Mult for each', '{C:attention}Boss Blind{} you beat', '{C:inactive}(Currently {X:mult,C:white} X#2# {C:inactive} Mult)'],
      ['{C:attention}Eternamax:{} for good after', '{C:attention}5{} Boss Blinds, its {X:mult,C:white}X{} Mult', 'is doubled', '{C:inactive}(#3#)'],
    ] },
    j_poke_zarude: { name: 'Zarude', text: ['{C:attention}Jungle Drain:{} when a {C:attention}Blind{}', 'is selected, drains {C:money}$#1#{} of', 'sell value from each other', 'Joker and gains {X:mult,C:white} X#2# {} Mult', 'for each {C:money}$1{} drained', '{C:inactive}(Currently {X:mult,C:white} X#3# {C:inactive} Mult)'] },
    j_poke_regieleki: { name: 'Regieleki', text: [
      ['{C:chips}+#1#{} hand each round'],
      ['{C:attention}Transistor:{} at end of round,', 'permanently gains {X:mult,C:white} X#2# {} Mult', 'for each unused hand', '{C:inactive}(Currently {X:mult,C:white} X#3# {C:inactive} Mult)'],
    ] },
    j_poke_regidrago: { name: 'Regidrago', text: ['{C:attention}Dragon Energy:{} {X:mult,C:white} X#1# {} Mult on', 'the first hand of the round,', '{X:mult,C:white} X#2# {} less for each hand', 'already played this round', '{C:inactive}(Never below X1)', '{C:inactive}(Currently {X:mult,C:white} X#3# {C:inactive} Mult)'] },
    j_poke_glastrier: { name: 'Glastrier', text: [
      ['{C:chips}+#1#{} Chips'],
      ['{C:attention}Chilling Neigh:{} {C:attention}Glass{} cards', 'give {X:mult,C:white} X#2# {} Mult', 'instead of {X:mult,C:white} X2 {}'],
    ] },
    j_poke_spectrier: { name: 'Spectrier', text: ['{C:attention}Grim Neigh:{} permanently', 'gains {X:mult,C:white} X#1# {} Mult for each', '{C:spectral}Spectral{} card used', '{C:inactive}(Currently {X:mult,C:white} X#2# {C:inactive} Mult)'] },
    j_poke_calyrex: { name: 'Calyrex', text: [
      ['{C:attention}Bountiful Harvest:{} when a', '{C:attention}Blind{} is selected, a random', 'unenhanced card in your deck', 'becomes a {C:attention}Seed{} card'],
      ['{X:mult,C:white} X1 {} Mult, plus {X:mult,C:white} X#1# {} for', 'each {C:attention}Flower{} card in your', 'full deck', '{C:inactive}(Currently #2#: {X:mult,C:white} X#3# {C:inactive} Mult)'],
    ] },
    j_poke_enamorus: { name: 'Enamorus', text: [
      ['{C:attention}Springtide Storm:{} each', 'scored {C:hearts}Heart{} gives', '{X:mult,C:white} X#1# {} Mult'],
      ['{C:attention}Therian Forme:{} after you', 'have had it for {C:attention}4{} rounds,', 'each scored {C:hearts}Heart{} also', 'earns {C:money}$#2#{}', '{C:inactive}(#3#)'],
    ] },
    // Gen 9, batch 2 (the owner's "Yes", 2026-11-03)
    j_poke_capsakid: { name: 'Capsakid', text: ['{C:attention}Spicy:{} each scored', '{C:clubs}Club{} gives {C:chips}+#1#{} Chips', EVOLVES_ROUNDS(2)] },
    j_poke_scovillain: { name: 'Scovillain', text: [
      ['{C:attention}Spicy:{} each scored', '{C:clubs}Club{} gives {C:chips}+#1#{} Chips;', 'each scored {C:hearts}Heart{} gives', '{X:mult,C:white} X#2# {} Mult'],
      ['{C:red}+#3#{} discard each round'],
    ] },
    j_poke_flittle: { name: 'Flittle', text: ['{C:attention}Opportunist:{} permanently', 'gains {C:mult}+#1#{} Mult whenever', 'another Joker permanently', 'grows', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)', EVOLVES_ROUNDS(3)] },
    j_poke_espathra: { name: 'Espathra', text: [
      ['{C:attention}Opportunist:{} permanently', 'gains {X:mult,C:white} X#1# {} Mult whenever', 'another Joker permanently', 'grows', '{C:inactive}(Currently {X:mult,C:white} X#2# {C:inactive} Mult)'],
      ['{C:mult}+#3#{} Mult {C:inactive}(kept from Flittle)'],
    ] },
    j_poke_bombirdier: { name: 'Bombirdier', text: ['{C:attention}Stork Delivery:{} at the', 'end of each shop, {C:green}#1# in #2#{}', 'chance to create a', 'random {C:attention}Tag{}'] },
    j_poke_varoom: { name: 'Varoom', text: ['{C:attention}Rev the Engine:{} {C:mult}+#1#{} Mult', 'for each hand played in a', 'row without a discard', '{C:inactive}(this hand included)', '{C:inactive}(Streak so far: #2#)', EVOLVES_ROUNDS(3)] },
    j_poke_revavroom: { name: 'Revavroom', text: ['{C:attention}Rev the Engine:{} {X:mult,C:white} X1 {} Mult,', 'plus {X:mult,C:white} X#1# {} for each hand', 'played in a row without', 'a discard {C:inactive}(this hand included)', '{C:inactive}(Streak so far: #2#)'] },
    j_poke_cyclizar: { name: 'Cyclizar', text: ['{C:attention}Ride:{} {C:blue}+#1#{} hand each', 'round and {C:attention}+#2#{} hand size'] },
    j_poke_orthworm: { name: 'Orthworm', text: ['{C:attention}Earth Eater:{} {C:chips}+#1#{} Chips', 'for each {C:attention}Steel{} card', 'in your full deck', '{C:inactive}(Currently {C:chips}+#2#{C:inactive} Chips)'] },
    j_poke_glimmet: { name: 'Glimmet', text: ['Each scored {C:attention}Stone{}', 'card gives {C:mult}+#1#{} Mult', EVOLVES_ROUNDS(2)] },
    j_poke_glimmora: { name: 'Glimmora', text: [
      ['{C:attention}Toxic Debris:{} each scored', '{C:attention}Stone{} card turns a random', 'card in your deck into a', '{C:attention}Hazard{} card', '{C:inactive}(Unenhanced first; never a', '{C:inactive}Stone card; up to #2# a hand)'],
      ['Each {C:attention}Hazard{} card', '{C:attention}held in hand{} gives', '{X:mult,C:white} X#1# {} Mult'],
    ] },
    j_poke_flamigo: { name: 'Flamigo', text: ['{X:mult,C:white} X#1# {} Mult', '{X:mult,C:white} X#2# {} Mult instead if', 'the played hand is', 'a {C:attention}Pair{}'] },
    j_poke_veluza: { name: 'Veluza', text: ['{C:attention}Fillet Away:{} at end of', 'round, loses {C:money}$#2#{} of sell', 'value and permanently', 'gains {X:mult,C:white} X#1# {} Mult', '{C:inactive}(Stops at {C:money}$1{C:inactive} sell value)', '{C:inactive}(Currently {X:mult,C:white} X#3# {C:inactive} Mult)'] },
    j_poke_dondozo: { name: 'Dondozo', text: ['{X:mult,C:white} X#1# {} Mult', '{C:attention}Commander:{} {X:mult,C:white} X#2# {} Mult', 'instead while {C:attention}Tatsugiri{}', 'is directly to its left', '{C:inactive}(Now: #3#)'] },
    j_poke_clodsire: { name: 'Clodsire', text: [
      ['{C:attention}Poison Point:{} each card', 'you discard has a {C:green}#1# in #2#{}', 'chance to become a', '{C:attention}Hazard{} card', '{C:inactive}(Unenhanced cards only)'],
      ['{X:mult,C:white} X1 {} Mult, plus {X:mult,C:white} X#3# {}', 'for each {C:attention}Hazard{} card', 'in your full deck', '{C:inactive}(Currently #4#: {X:mult,C:white} X#5# {C:inactive} Mult)'],
    ] },
    j_poke_poltchageist: { name: 'Poltchageist', text: ['{C:attention}Hospitality:{} at end of', 'round, the Jokers directly left', 'and right of this one each', 'gain {C:money}$#1#{} of sell value', ENERGY_TO('Sinistcha'), EVOLVES_ROUNDS(2)] },
    j_poke_sinistcha: { name: 'Sinistcha', text: [
      ['{C:attention}Hospitality:{} at end of', 'round, the Jokers directly left', 'and right of this one each', 'gain {C:money}$#1#{} of sell value'],
      ['{X:mult,C:white} X1 {} Mult, plus {X:mult,C:white} X#2# {}', 'for each {C:money}$1{} of sell value', 'of all your Jokers', '{C:inactive}(Currently {C:money}$#3#{C:inactive}: {X:mult,C:white} X#4# {C:inactive} Mult)'],
    ] },
    // The owner's rework of an upstream joker (Espeon 196, Future Sight, contentRev 57; jokers/pokejokers_07.js): its text replaces 3.9.1's.
    j_poke_espeon: { name: 'Espeon', text: [
      ['{C:purple}+#1# Foresight', 'Each played {V:1}#2#{}', 'retriggers and gives', '{X:mult,C:white} X#3# {} Mult when scored'],
      ['{C:attention}Future Sight:{} each', '{C:attention}Foreseen{} {V:1}#2#{}', 'gives {X:mult,C:white} X#4# {} Mult', '{C:inactive,s:0.7}Card changes every round{}'],
    ] },
  },
  Other: {
    poke_design_frozen: { name: 'Frozen', text: ['Stays in your hand at the', 'end of the round (the next', 'deal fills around it)', 'Thaws when played or discarded'] },
    poke_design_unseen_fist: { name: 'Unseen Fist', text: ['While you have this Joker,', 'no playing card is {C:attention}debuffed{}', '{C:inactive}(Boss Blind suits, faces...)'] },
  },
};

// Text boxes: a list of line lists is several boxes, written as SMODS's box break ({br:2} + filler, as Pokermon's en-us.lua) between them.
const BR = '{br:2}ERROR - CONTACT STEAK';
for (const set of Object.values(DESIGN_LOC)) {
  for (const e of Object.values(set)) if (e.text.some(Array.isArray)) e.text = e.text.flatMap((p, i) => (Array.isArray(p) ? (i ? [BR, ...p] : p) : [p]));
}
/** Gen 8 batch 3 (r72): the Galarian evolutions of upstream jokers, a box index.js APPENDS to their 3.9.1 text (which stays as it is). */
export const GALAR_UPSTREAM_TEXT = {
  j_poke_linoone: [BR, '{C:attention}Galarian form:{} a', '{X:poke_dark,C:white}Dark{} Energy used on it', 'evolves it into {C:attention}Obstagoon{}'],
  j_poke_corsola: [BR, '{C:attention}Galarian form:{} a', '{X:poke_psychic,C:white}Psychic{} Energy used on it', 'evolves it into {C:attention}Cursola{}'],
  j_poke_mrmime: [BR, '{C:attention}Galarian form:{} a', '{X:poke_water,C:white}Water{} Energy used on it', 'evolves it into {C:attention}Mr. Rime{}'],
  // Gen 9 batch 2 (r75): Wooper's Paldean form (its level_evo into Quagsire unchanged)
  j_poke_wooper: [BR, '{C:attention}Paldean form:{} a', '{X:poke_dark,C:white}Dark{} Energy used on it', 'evolves it into {C:attention}Clodsire{}'],
  j_poke_farfetchd: [BR, '{C:attention}Galarian form:{} evolves into', '{C:attention}Sirfetch\'d{} at end of round', 'after {C:attention}#5#{} {C:attention}Lucky{} card triggers', 'in that round', '{C:inactive}(This round: #4#/#5#)'],
};
