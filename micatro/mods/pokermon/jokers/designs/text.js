// designs/text.js — the owner's Pokermon jokers' families and text (DESIGN_FAMILIES, DESIGN_LOC, …), cut out of
// pokejokers_designs.js by tools/micatro/split_designs.mjs (2026-11); every statement is unchanged.
import { GEN9B2_REV } from '../../api.js';


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
  // Gen 9, batch 1
  ['nymble', 'lokix'],
  ['pawmi', 'pawmo', 'pawmot'],
  ['tadbulb', 'bellibolt'],
  ['wattrel', 'kilowattrel'],
  ['maschiff', 'mabosstiff'],
  ['toedscool', 'toedscruel'],
  // Gen 9, batch 2: Clodsire joins Wooper's line (FAMILY_MEMBER_REV: seen from r77 on), and five new lines
  ['wooper', 'quagsire', 'clodsire'],
  ['capsakid', 'scovillain'],
  ['flittle', 'espathra'],
  ['varoom', 'revavroom'],
  ['glimmet', 'glimmora'],
  ['poltchageist', 'sinistcha'],
];
/** Gen 8 batch 3 (r72): the new members of existing lines, for systems/evolution.js FAMILY_MEMBER_REV (index.js); Gen 9 batch 2 (r77):
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
const FORECAST_NOTE = ['{C:inactive,s:0.8}(Normal again after the round;', '{C:inactive,s:0.8}its type never breaks Monotype;', '{C:inactive,s:0.8}Volcarona brings the sun)'];
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
  '{C:inactive}(Sunny: {C:hearts}Hearts{C:inactive}+{C:diamonds}Diamonds{C:inactive} held most', '{C:inactive}on the round\'s first deal,', '{C:inactive}or {C:attention}Volcarona{C:inactive} / {C:attention}Koraidon{C:inactive} held)'];
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
const RAIN_NOTE = ['{C:inactive,s:0.8}(Rain: Clubs held most on', '{C:inactive,s:0.8}the round\'s first deal)'];
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
const SUN_NOTE = ['{C:inactive,s:0.8}(Sunny: Hearts + Diamonds held', '{C:inactive,s:0.8}most on the round\'s first deal,', '{C:inactive,s:0.8}Volcarona or Koraidon)'];
/** The Paradox Pokémon's boost boxes (Gen 9 batch 3): Protosynthesis (Ancient: while it's sunny) and Quark Drive (Future: on Electric Terrain). */
const PROTO = (v, n) => ['{C:poke_sun}Protosynthesis:{} while it\'s', '{C:poke_sun}sunny{}, ' + v + ' instead', '{C:inactive}(#' + n + '#)', ...SUN_NOTE];
const TERRAIN_NOTE = ['{C:inactive,s:0.8}(Electric Terrain: more Diamonds', '{C:inactive,s:0.8}held than any other suit on', '{C:inactive,s:0.8}the round\'s first deal,', '{C:inactive,s:0.8}or Miraidon held)'];
const QUARK = (v, n) => ['{C:attention}Quark Drive:{} on', '{X:poke_lightning,C:black}Electric Terrain{}, ' + v, 'instead', '{C:inactive}(#' + n + '#)', ...TERRAIN_NOTE];
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
    // contentRev 111 (the owner's simplification): plain texts, no weather, no Castform, no reference to each other.
    j_poke_kyogre: { name: 'Kyogre', text: [
      '{C:chips}+#1#{} hand each round', 'Scored {C:clubs}Clubs{} retrigger', 'once and give {X:mult,C:white} X#2# {} Mult',
    ] },
    j_poke_groudon: { name: 'Groudon', text: [
      '{C:red}+#1#{} discard each round', 'Scored {C:hearts}Hearts{} and {C:diamonds}Diamonds{}', 'give {X:mult,C:white} X#2# {} Mult',
    ] },
    j_poke_primal_kyogre: { name: 'Primal Kyogre', text: [
      '{C:chips}+#1#{} hands each round', 'Scored {C:clubs}Clubs{} retrigger', 'twice and give {X:mult,C:white} X#2# {} Mult',
    ] },
    j_poke_primal_groudon: { name: 'Primal Groudon', text: [
      '{C:red}+#1#{} discards each round', 'Scored {C:hearts}Hearts{} and {C:diamonds}Diamonds{}', 'give {X:mult,C:white} X#2# {} Mult',
    ] },
    j_poke_rayquaza: { name: 'Rayquaza', text: [
      '{C:chips}+#3#{} hand and {C:red}+#4#{} discard', 'each round', 'Gains {X:mult,C:white} X#2# {} Mult whenever', 'a played hand contains', 'a {C:attention}Straight{} or a {C:attention}Flush{}', '{C:inactive}(Currently {X:mult,C:white} X#1# {C:inactive} Mult)',
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
      ['{C:poke_sun}Sunny Day:{} while you have', 'this Joker it\'s always {C:poke_sun}sunny{}', '{C:inactive}(Castform turns Sunny;', '{C:inactive}rain still falls)'],
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
      ['Shop rerolls cost {C:money}$#4#{} less', '{C:inactive}(never below $1)'],
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
      '{C:inactive,s:0.8}(It re-forms when a round\'s first', '{C:inactive,s:0.8}deal is {C:poke_snow,s:0.8}Snowy{C:inactive,s:0.8}: Spades held most,', '{C:inactive,s:0.8}or an Alolan Ninetales held)',
    ] },
    j_poke_eiscue_noice: { name: 'Eiscue', text: [
      '{C:attention}Noice Face:{} {X:mult,C:white} X#2# {} Mult', 'The ice re-forms ({X:mult,C:white} X#1# {})', 'when a round\'s first deal', 'is {C:poke_snow}Snowy{}',
      '{C:inactive,s:0.8}(Spades held most:', '{C:inactive,s:0.8}Castform\'s Forecast;', '{C:inactive,s:0.8}or an Alolan Ninetales held)',
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
    // Gen 9, batch 1 (the owner's "Yes", 2026-11-03; contentRev 76)
    j_poke_nymble: { name: 'Nymble', text: ['{C:attention}Lunge:{} {C:mult}+#1#{} Mult if the', 'played hand has {C:attention}3{}', 'or fewer cards', EVOLVES_ROUNDS(2)] },
    j_poke_lokix: { name: 'Lokix', text: ['{C:attention}Lunge:{} {X:mult,C:white} X#1# {} Mult if the', 'played hand has {C:attention}3{}', 'or fewer cards'] },
    j_poke_pawmi: { name: 'Pawmi', text: ['{C:mult}+#1#{} Mult for each', '{X:poke_lightning,C:white}Lightning{} Joker {C:inactive}(Itself included)', '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {C:mult}+#3#{C:inactive} Mult)', EVOLVES_ROUNDS(4)] },
    j_poke_pawmo: { name: 'Pawmo', text: ['Each scored {C:attention}face{} card', 'earns {C:money}$#1#{}', ENERGY_TO('Pawmot'), EVOLVES_ROUNDS(2)] },
    j_poke_pawmot: { name: 'Pawmot', text: [
      ['{X:mult,C:white} X#1# {} Mult'],
      ['{C:attention}Revival Blessing:{} once per', 'Ante, when another of your', 'Jokers is {C:attention}destroyed{}, it comes', 'back in the same place', '{C:inactive}(Not when sold; it keeps its', '{C:inactive}edition, stickers and values)', '{C:inactive}(Revival Blessing: #2#)'],
    ] },
    j_poke_squawkabilly: { name: 'Squawkabilly', text: ['{C:attention}Parrot:{} each {C:planet}Planet{} card', 'used has a {C:green}#1# in #2#{} chance', 'to level up that hand', '{C:attention}once more{}', '{C:inactive}(#3#)'] },
    j_poke_tadbulb: { name: 'Tadbulb', text: ['{C:mult}+#1#{} Mult for each', 'discard used this round', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)', EVOLVES_ROUNDS(3)] },
    j_poke_bellibolt: { name: 'Bellibolt', text: ['{C:attention}Electromorphosis:{} each', 'discard used adds {X:mult,C:white} X#1# {}', 'to a charge; your next', 'scoring hand fires it', '{C:inactive}(Lost at end of round)', '{C:inactive}(Charge: {X:mult,C:white} X#2# {C:inactive})'] },
    j_poke_wattrel: { name: 'Wattrel', text: ['{C:attention}Wind Power:{} earn {C:money}$#1#{}', 'at end of round for', 'each discard left', '{C:inactive}(Currently {C:money}$#2#{C:inactive})', EVOLVES_ROUNDS(3)] },
    j_poke_kilowattrel: { name: 'Kilowattrel', text: ['{C:attention}Wind Power:{} earn {C:money}$#1#{}', 'at end of round for', 'each discard left', '{C:inactive}(Currently {C:money}$#2#{C:inactive})'] },
    j_poke_maschiff: { name: 'Maschiff', text: ['{C:mult}+#1#{} Mult during', '{C:attention}Boss Blinds{}', EVOLVES_ROUNDS(2)] },
    j_poke_mabosstiff: { name: 'Mabosstiff', text: [
      ['{X:mult,C:white} X#1# {} Mult during', '{C:attention}Boss Blinds{}'],
      ['{C:attention}Guard Dog:{} your Jokers', 'can\'t be {C:attention}debuffed{}', '{C:inactive}(Itself included; a Perishable', '{C:inactive}still expires, a Baby still faints)'],
    ] },
    j_poke_toedscool: { name: 'Toedscool', text: ['{C:attention}Mycelium:{} {C:chips}+#1#{} Chips for', 'each card in your full', 'deck above {C:attention}52{}', '{C:inactive}(Currently #2#: {C:chips}+#3#{C:inactive} Chips)', EVOLVES_ROUNDS(4)] },
    j_poke_toedscruel: { name: 'Toedscruel', text: ['{C:attention}Mycelium:{} {X:mult,C:white} X1 {} Mult, plus', '{X:mult,C:white} X#1# {} for each card in', 'your full deck above {C:attention}40{}', '{C:inactive}(Currently #2#: {X:mult,C:white} X#3# {C:inactive} Mult)'] },
    j_poke_klawf: { name: 'Klawf', text: ['{C:attention}Anger Shell:{} {X:mult,C:white} X1 {} Mult,', 'plus {X:mult,C:white} X#1# {} for each hand', 'already played this round', '{C:inactive}(each one didn\'t beat the Blind)', '{C:inactive}(Currently {X:mult,C:white} X#2# {C:inactive} Mult)'] },
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
    // Gen 9, batch 3: the Paradox Pokémon (the owner's "yes", 2026-11-03)
    j_poke_great_tusk: { name: 'Great Tusk', text: [['Each scored {C:attention}Stone{} card', 'gives {X:mult,C:white} X#1# {} Mult'], PROTO('{X:mult,C:white} X#2# {}', 3)] },
    j_poke_scream_tail: { name: 'Scream Tail', text: [['Each scored {C:spades}Spade{} gives', '{C:mult}+#1#{} Mult'], PROTO('{C:mult}+#2#{} Mult', 3)] },
    j_poke_brute_bonnet: { name: 'Brute Bonnet', text: [['{C:mult}+#1#{} Mult'], PROTO('{C:mult}+#2#{} Mult', 3)] },
    j_poke_flutter_mane: { name: 'Flutter Mane', text: [['{X:mult,C:white} X#1# {} Mult'], PROTO('{X:mult,C:white} X#2# {}', 3)] },
    j_poke_slither_wing: { name: 'Slither Wing', text: [['Each scored {C:hearts}Heart{} gives', '{X:mult,C:white} X#1# {} Mult'], PROTO('{X:mult,C:white} X#2# {}', 3)] },
    j_poke_sandy_shocks: { name: 'Sandy Shocks', text: [['{C:chips}+#1#{} Chips for each', '{C:attention}Steel{} card in your', 'full deck', '{C:inactive}(Currently {C:chips}+#4#{C:inactive} Chips)'], PROTO('{C:chips}+#2#{} each', 3)] },
    j_poke_iron_treads: { name: 'Iron Treads', text: [['{C:chips}+#1#{} Chips'], QUARK('{C:chips}+#2#{} Chips', 3)] },
    j_poke_iron_bundle: { name: 'Iron Bundle', text: ['At end of round, creates', 'a random {C:tarot}Tarot{} or', '{C:planet}Planet{} card', '{C:inactive}(Must have room)'] },
    j_poke_iron_hands: { name: 'Iron Hands', text: [['Each scored {C:attention}face{} card', 'gives {X:mult,C:white} X#1# {} Mult'], QUARK('{X:mult,C:white} X#2# {}', 3)] },
    j_poke_iron_jugulis: { name: 'Iron Jugulis', text: [['{X:mult,C:white} X#1# {} Mult'], QUARK('{X:mult,C:white} X#2# {}', 3)] },
    j_poke_iron_moth: { name: 'Iron Moth', text: [['Each scored {C:diamonds}Diamond{} gives', '{X:mult,C:white} X#1# {} Mult'], QUARK('{X:mult,C:white} X#2# {}', 3)] },
    j_poke_iron_thorns: { name: 'Iron Thorns', text: [['Each scored {C:attention}Stone{} card', 'gives {C:chips}+#1#{} Chips'], QUARK('{C:chips}+#2#{} Chips', 3)] },
    j_poke_roaring_moon: { name: 'Roaring Moon', text: [['{C:mult}+#1#{} Mult for each', '{C:attention}Straight{} played this run', '{C:inactive}(Straight Flush counts)', '{C:inactive}(Currently #4#: {C:mult}+#5#{C:inactive} Mult)'], PROTO('{C:mult}+#2#{} each', 3)] },
    j_poke_iron_valiant: { name: 'Iron Valiant', text: [['Each scored {C:attention}Queen{}', 'or {C:attention}King{} gives', '{X:mult,C:white} X#1# {} Mult'], QUARK('{X:mult,C:white} X#2# {}', 3)] },
    j_poke_walking_wake: { name: 'Walking Wake', text: [['Each scored {C:clubs}Club{} gives', '{X:mult,C:white} X#1# {} Mult'], PROTO('{X:mult,C:white} X#2# {}', 3)] },
    j_poke_iron_leaves: { name: 'Iron Leaves', text: [['Each scored {C:clubs}Club{} gives', '{X:mult,C:white} X#1# {} Mult'], QUARK('{X:mult,C:white} X#2# {}', 3)] },
    j_poke_gouging_fire: { name: 'Gouging Fire', text: [['{C:red}+#1#{} discard each round', '{X:mult,C:white} X#2# {} Mult'], PROTO('{X:mult,C:white} X#3# {}', 4)] },
    j_poke_raging_bolt: { name: 'Raging Bolt', text: [['{X:mult,C:white} X1 {} Mult, plus {X:mult,C:white} X#1# {}', 'for each hand left,', 'this one included', '{C:inactive}(Currently {X:mult,C:white} X#4# {C:inactive} Mult)'], PROTO('{X:mult,C:white} X#2# {} each', 3)] },
    j_poke_iron_boulder: { name: 'Iron Boulder', text: [['The first scored card', 'gives {X:mult,C:white} X#1# {} Mult'], QUARK('{X:mult,C:white} X#2# {}', 3)] },
    j_poke_iron_crown: { name: 'Iron Crown', text: [['Each scored {C:spades}Spade{} gives', '{X:mult,C:white} X#1# {} Mult'], QUARK('{X:mult,C:white} X#2# {}', 3)] },
    // Gen 9, batch 4: the Gen 9 Legendaries (the owner's "yes", 2026-11-03)
    j_poke_wochien: { name: 'Wo-Chien', text: ['{C:attention}Tablets of Ruin:{} every', '{C:attention}Blind{}\'s score requirement', 'is {C:attention}#1#%{} lower', '{C:inactive}(Copies don\'t stack)', '{C:inactive}(#2#)'] },
    j_poke_chienpao: { name: 'Chien-Pao', text: ['{C:attention}Sword of Ruin:{} every', 'scored card gives', '{X:mult,C:white} X#1# {} Mult'] },
    j_poke_tinglu: { name: 'Ting-Lu', text: ['{C:attention}Vessel of Ruin:{} {C:chips}+#1#{} hands', 'during {C:attention}Boss Blinds{}', '{C:inactive}(#2#)'] },
    j_poke_chiyu: { name: 'Chi-Yu', text: ['{C:attention}Beads of Ruin:{} disables', 'the effect of every', '{C:attention}Boss Blind{}', '{C:inactive}(#1#)'] },
    j_poke_koraidon: { name: 'Koraidon', text: [
      ['{C:poke_sun}Orichalcum Pulse:{} while you', 'have this Joker it\'s always', '{C:poke_sun}sunny{}', '{C:inactive}(Castform turns Sunny;', '{C:inactive}rain still falls)'],
      ['{X:mult,C:white} X#1# {} Mult, plus {X:mult,C:white} X#2# {}', 'for each {C:attention}Ancient{} Paradox', 'Joker', '{C:inactive}(Currently #3#: {X:mult,C:white} X#4# {C:inactive} Mult)'],
    ] },
    j_poke_miraidon: { name: 'Miraidon', text: [
      ['{C:attention}Hadron Engine:{} while you', 'have this Joker it\'s always', '{X:poke_lightning,C:white}Electric Terrain{}'],
      ['{X:mult,C:white} X#1# {} Mult, plus {X:mult,C:white} X#2# {}', 'for each {C:attention}Future{} Paradox', 'Joker', '{C:inactive}(Currently #3#: {X:mult,C:white} X#4# {C:inactive} Mult)'],
    ] },
    j_poke_ogerpon: { name: 'Ogerpon', text: [
      ['{C:attention}Masks:{} wears a new mask', 'each {C:attention}Ante{}; its type', 'follows the mask', '{C:inactive}(Now: {V:1}#6#{C:inactive}#7#)', '{C:inactive}(Its type never breaks Monotype)'],
      ['{X:poke_grass,C:white}Teal{}: {C:mult}+#1#{} Mult', '{X:poke_water,C:white}Wellspring{}: {C:chips}+#2#{} hand', 'each round and {X:mult,C:white} X#3# {} Mult', '{X:poke_fire,C:white}Hearthflame{}: {X:mult,C:white} X#4# {} Mult',
        '{X:poke_earth,C:white}Cornerstone{}: {C:chips}+#5#{} Chips', '{C:inactive}(Teal, Wellspring, Hearthflame,', '{C:inactive}Cornerstone, then again)'],
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
  // Gen 9 batch 2 (r77): Wooper's Paldean form (its level_evo into Quagsire unchanged)
  j_poke_wooper: [BR, '{C:attention}Paldean form:{} a', '{X:poke_dark,C:white}Dark{} Energy used on it', 'evolves it into {C:attention}Clodsire{}'],
  j_poke_farfetchd: [BR, '{C:attention}Galarian form:{} evolves into', '{C:attention}Sirfetch\'d{} at end of round', 'after {C:attention}#5#{} {C:attention}Lucky{} card triggers', 'in that round', '{C:inactive}(This round: #4#/#5#)'],
};
