// goods.js — the things a Poketactica player can own besides figurines (owner, 2026-11-21: held items, the camp shop,
// evolution). Pure data and look-ups: battle.js, figcol.js, the hub and the server all read it.
//
//   HELD    one per figurine, put on between battles. Each `held` payload is the overworld's own (overworld/bag.js ITEMS:
//           poketactica_goods_test holds them equal), read on the grid by engine/battle.js. Only the items that do
//           something on the grid are here (no flee, prize-money or breeding items). Berries, Focus Sash, Weakness Policy,
//           White Herb and Leppa work once per battle; the figurine keeps the item afterwards.
//   EVO     the items a species evolves with (species_extra.json `evos` of type 'item'): stones, and the overworld's trade
//           items (Linking Cord for Kadabra / Machoke / Graveler / Haunter ...). Used up by the evolution.
//   CANDY   Rare Candy: one level.
// Prices are in STARS (site/stars.js), the site's only currency. A campaign map pays 20-150; a pack costs 100.

const typeBoost = (type) => ({ typeBoost: type });
const H = (name, held, stars, text) => ({ name, held, stars, text });
export const HELD = Object.freeze({
	leftovers: H('Leftovers', { endHealFrac: 1 / 16 }, 120, 'Heals 1/16 of its HP at the end of each of its turns.'),
	blacksludge: H('Black Sludge', { sludge: true }, 100, 'A Poison type heals 1/16 of its HP each turn; anyone else loses 1/8.'),
	oranberry: H('Oran Berry', { berryHeal: 10 }, 8, 'Once a battle: heals 10 HP when its HP falls to half.'),
	sitrusberry: H('Sitrus Berry', { berryHealFrac: 0.25 }, 20, 'Once a battle: heals 1/4 of its HP when its HP falls to half.'),
	lumberry: H('Lum Berry', { cure: 'any' }, 25, 'Once a battle: cures any status or confusion.'),
	cheriberry: H('Cheri Berry', { cure: 'par' }, 10, 'Once a battle: cures paralysis.'),
	chestoberry: H('Chesto Berry', { cure: 'slp' }, 10, 'Once a battle: wakes it up.'),
	pechaberry: H('Pecha Berry', { cure: 'psn' }, 10, 'Once a battle: cures poison.'),
	rawstberry: H('Rawst Berry', { cure: 'brn' }, 10, 'Once a battle: cures a burn.'),
	aspearberry: H('Aspear Berry', { cure: 'frz' }, 10, 'Once a battle: thaws it out.'),
	persimberry: H('Persim Berry', { cure: 'confusion' }, 10, 'Once a battle: snaps it out of confusion.'),
	leppaberry: H('Leppa Berry', { ppRestore: 10 }, 15, 'Once a battle: gives a move that runs out of PP 10 back.'),
	choiceband: H('Choice Band', { choice: 'atk' }, 150, 'Physical moves hit 1.5× as hard, but it can only use the first move it uses in a battle.'),
	choicespecs: H('Choice Specs', { choice: 'spa' }, 150, 'Special moves hit 1.5× as hard, but it can only use the first move it uses in a battle.'),
	choicescarf: H('Choice Scarf', { choice: 'spe' }, 150, '+1 Move and 1.5× Speed (dodging and landing hits), but it can only use the first move it uses in a battle.'),
	lifeorb: H('Life Orb', { lifeOrb: true }, 150, 'Moves hit 1.3× as hard; each attack that deals damage costs it 1/10 of its HP.'),
	expertbelt: H('Expert Belt', { expertBelt: true }, 90, 'Super-effective hits deal 1.2× damage.'),
	muscleband: H('Muscle Band', { catBoost: 'Physical' }, 60, 'Physical moves deal 1.1× damage.'),
	wiseglasses: H('Wise Glasses', { catBoost: 'Special' }, 60, 'Special moves deal 1.1× damage.'),
	focussash: H('Focus Sash', { sash: true }, 80, 'Once a battle: at full HP, a hit that would knock it out leaves it on 1 HP.'),
	focusband: H('Focus Band', { focusBand: true }, 60, 'A 1-in-10 chance to hang on with 1 HP from a knockout hit.'),
	rockyhelmet: H('Rocky Helmet', { helmet: true }, 90, 'A foe that hits it with a contact move loses 1/6 of its HP.'),
	shellbell: H('Shell Bell', { shellBell: true }, 70, 'Heals 1/8 of the damage its attacks deal.'),
	brightpowder: H('BrightPowder', { evade: 0.9 }, 80, 'Moves aimed at it land 10% less often.'),
	widelens: H('Wide Lens', { accBoost: 1.1 }, 60, 'Its moves land 10% more often.'),
	scopelens: H('Scope Lens', { critBoost: true }, 70, 'Critical hits are twice as likely.'),
	assaultvest: H('Assault Vest', { assaultVest: true }, 120, '1.5× Sp. Def, but it cannot use status moves.'),
	eviolite: H('Eviolite', { eviolite: true }, 120, '1.5× Defense and Sp. Def while it can still evolve.'),
	weaknesspolicy: H('Weakness Policy', { weakPolicy: true }, 80, 'Once a battle: a super-effective hit sharply raises its Attack and Sp. Atk (+2).'),
	whiteherb: H('White Herb', { whiteHerb: true }, 50, 'Once a battle: undoes its lowered stats.'),
	luckyegg: H('Lucky Egg', { expBoost: 1.5 }, 150, 'It earns 1.5× EXP from the foes it knocks out.'),
	charcoal: H('Charcoal', typeBoost('Fire'), 40, 'Fire moves deal 1.2× damage.'),
	mysticwater: H('Mystic Water', typeBoost('Water'), 40, 'Water moves deal 1.2× damage.'),
	magnet: H('Magnet', typeBoost('Electric'), 40, 'Electric moves deal 1.2× damage.'),
	miracleseed: H('Miracle Seed', typeBoost('Grass'), 40, 'Grass moves deal 1.2× damage.'),
	nevermeltice: H('Never-Melt Ice', typeBoost('Ice'), 40, 'Ice moves deal 1.2× damage.'),
	blackbelt: H('Black Belt', typeBoost('Fighting'), 40, 'Fighting moves deal 1.2× damage.'),
	poisonbarb: H('Poison Barb', typeBoost('Poison'), 40, 'Poison moves deal 1.2× damage.'),
	softsand: H('Soft Sand', typeBoost('Ground'), 40, 'Ground moves deal 1.2× damage.'),
	sharpbeak: H('Sharp Beak', typeBoost('Flying'), 40, 'Flying moves deal 1.2× damage.'),
	twistedspoon: H('Twisted Spoon', typeBoost('Psychic'), 40, 'Psychic moves deal 1.2× damage.'),
	silverpowder: H('Silver Powder', typeBoost('Bug'), 40, 'Bug moves deal 1.2× damage.'),
	hardstone: H('Hard Stone', typeBoost('Rock'), 40, 'Rock moves deal 1.2× damage.'),
	spelltag: H('Spell Tag', typeBoost('Ghost'), 40, 'Ghost moves deal 1.2× damage.'),
	dragonfang: H('Dragon Fang', typeBoost('Dragon'), 40, 'Dragon moves deal 1.2× damage.'),
	blackglasses: H('Black Glasses', typeBoost('Dark'), 40, 'Dark moves deal 1.2× damage.'),
	metalcoat: H('Metal Coat', typeBoost('Steel'), 40, 'Steel moves deal 1.2× damage. (Also evolves Onix and Scyther.)'),
	silkscarf: H('Silk Scarf', typeBoost('Normal'), 40, 'Normal moves deal 1.2× damage.'),
});

const E = (name, stars = 60) => ({ name, stars });
export const EVO = Object.freeze({
	firestone: E('Fire Stone'), waterstone: E('Water Stone'), thunderstone: E('Thunder Stone'), leafstone: E('Leaf Stone'), icestone: E('Ice Stone'),
	moonstone: E('Moon Stone'), sunstone: E('Sun Stone'), shinystone: E('Shiny Stone'), duskstone: E('Dusk Stone'), dawnstone: E('Dawn Stone'),
	ovalstone: E('Oval Stone'), linkingcord: E('Linking Cord', 80), kingsrock: E("King's Rock", 80), protector: E('Protector', 80), dragonscale: E('Dragon Scale', 80),
	electirizer: E('Electirizer', 80), magmarizer: E('Magmarizer', 80), upgrade: E('Up-Grade', 80), dubiousdisc: E('Dubious Disc', 80), razorfang: E('Razor Fang', 80),
	razorclaw: E('Razor Claw', 80), prismscale: E('Prism Scale', 80), reapercloth: E('Reaper Cloth', 80), deepseatooth: E('Deep Sea Tooth', 80), deepseascale: E('Deep Sea Scale', 80),
	sachet: E('Sachet', 80), whippeddream: E('Whipped Dream', 80), tartapple: E('Tart Apple', 80), sweetapple: E('Sweet Apple', 80), syrupyapple: E('Syrupy Apple', 80),
	crackedpot: E('Cracked Pot', 80), chippedpot: E('Chipped Pot', 80), galaricacuff: E('Galarica Cuff', 80), galaricawreath: E('Galarica Wreath', 80),
	auspiciousarmor: E('Auspicious Armor', 80), maliciousarmor: E('Malicious Armor', 80), unremarkableteacup: E('Unremarkable Teacup', 80), masterpieceteacup: E('Masterpiece Teacup', 80),
	metalalloy: E('Metal Alloy', 80),
});
// (Metal Coat is a held item AND an evolution item: owning one does both; evolving uses it up.)

export const CANDY = Object.freeze({ rarecandy: { name: 'Rare Candy', stars: 25, text: 'Raises a figurine one level.' } });
/** A starter figurine (any of figcol.js STARTERS) at its starting level, from the shop. */
export const SHOP_FIG_STARS = 200;

/** What kind of good an id is: 'held' (it may ALSO be an evolution item: Metal Coat), 'evo', 'candy' or null. */
export const kindOf = (id) => (HELD[id] ? 'held' : EVO[id] ? 'evo' : CANDY[id] ? 'candy' : null);
export const isGood = (id) => typeof id === 'string' && !!kindOf(id);
export const goodName = (id) => (HELD[id] || EVO[id] || CANDY[id] || {}).name || id;
export const goodStars = (id) => (HELD[id] || EVO[id] || CANDY[id] || {}).stars || 0;
export const heldOf = (id) => (id && HELD[id] ? HELD[id].held : null);
/**
 * The held items that do nothing on a Tower Defense tower: a tower has no HP, keeps no status and has its PP refilled each
 * wave, so what guards, heals or cures has nothing to do there (measured: tools/poketactica/sweep_items.mjs; poketactica_item_sweep_test
 * holds this list to the measurement).
 */
export const TD_IDLE = Object.freeze(['aspearberry', 'blacksludge', 'brightpowder', 'cheriberry', 'chestoberry', 'eviolite', 'focusband', 'focussash', 'leftovers', 'leppaberry', 'lumberry', 'oranberry', 'pechaberry', 'persimberry',
	'rawstberry', 'rockyhelmet', 'shellbell', 'sitrusberry', 'weaknesspolicy', 'whiteherb']);
/** What to tell the player about an item beyond its text, or ''. */
export const heldNote = (id) => (TD_IDLE.includes(id) ? 'Does nothing in Tower Defense: a tower takes no damage and keeps no status.' : '');
