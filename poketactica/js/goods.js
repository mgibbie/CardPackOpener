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
// NAMES (owner, 2026-11-24): these are figurines, not Pokémon, so nothing here is called what the main game calls it. The ids
// are still the overworld's (a save, a replay and the held payloads all go by id); only the name shown is the figurine's
// own: beads for berries, paints for stones, a model-maker's bits for the rest. poketactica_goods_test holds every name
// apart from the overworld's.
// Prices are in STARS (site/stars.js), the site's only currency. A campaign map pays 20-150; a pack costs 100.

const typeBoost = (type) => ({ typeBoost: type });
const H = (name, held, stars, text) => ({ name, held, stars, text });
export const HELD = Object.freeze({
	leftovers: H('Leftover Clay', { endHealFrac: 1 / 16 }, 120, 'Heals 1/16 of its HP at the end of each of its turns.'),
	blacksludge: H('Black Glue', { sludge: true }, 100, 'A Poison type heals 1/16 of its HP each turn; anyone else loses 1/8.'),
	oranberry: H('Oran Bead', { berryHeal: 10 }, 8, 'Once a battle: heals 10 HP when its HP falls to half.'),
	sitrusberry: H('Sitrus Bead', { berryHealFrac: 0.25 }, 20, 'Once a battle: heals 1/4 of its HP when its HP falls to half.'),
	lumberry: H('Lum Bead', { cure: 'any' }, 25, 'Once a battle: cures any status or confusion.'),
	cheriberry: H('Cheri Bead', { cure: 'par' }, 10, 'Once a battle: cures paralysis.'),
	chestoberry: H('Chesto Bead', { cure: 'slp' }, 10, 'Once a battle: wakes it up.'),
	pechaberry: H('Pecha Bead', { cure: 'psn' }, 10, 'Once a battle: cures poison.'),
	rawstberry: H('Rawst Bead', { cure: 'brn' }, 10, 'Once a battle: cures a burn.'),
	aspearberry: H('Aspear Bead', { cure: 'frz' }, 10, 'Once a battle: thaws it out.'),
	persimberry: H('Persim Bead', { cure: 'confusion' }, 10, 'Once a battle: snaps it out of confusion.'),
	leppaberry: H('Leppa Bead', { ppRestore: 10 }, 15, 'Once a battle: gives a move that runs out of PP 10 back.'),
	choiceband: H('Choice Ribbon', { choice: 'atk' }, 150, 'Physical moves hit 1.5× as hard, but it can only use the first move it uses in a battle.'),
	choicespecs: H('Choice Goggles', { choice: 'spa' }, 150, 'Special moves hit 1.5× as hard, but it can only use the first move it uses in a battle.'),
	choicescarf: H('Choice Bandana', { choice: 'spe' }, 150, '+1 Move and 1.5× Speed (dodging and landing hits), but it can only use the first move it uses in a battle.'),
	lifeorb: H('Life Marble', { lifeOrb: true }, 150, 'Moves hit 1.3× as hard; each attack that deals damage costs it 1/10 of its HP.'),
	expertbelt: H('Expert Strap', { expertBelt: true }, 90, 'Super-effective hits deal 1.2× damage.'),
	muscleband: H('Muscle Wrap', { catBoost: 'Physical' }, 60, 'Physical moves deal 1.1× damage.'),
	wiseglasses: H('Wise Monocle', { catBoost: 'Special' }, 60, 'Special moves deal 1.1× damage.'),
	focussash: H('Focus Thread', { sash: true }, 80, 'Once a battle: at full HP, a hit that would knock it out leaves it on 1 HP.'),
	focusband: H('Focus Knot', { focusBand: true }, 60, 'A 1-in-10 chance to hang on with 1 HP from a knockout hit.'),
	rockyhelmet: H('Rocky Cap', { helmet: true }, 90, 'A foe that hits it with a contact move loses 1/6 of its HP.'),
	shellbell: H('Shell Chime', { shellBell: true }, 70, 'Heals 1/8 of the damage its attacks deal.'),
	brightpowder: H('Bright Glitter', { evade: 0.9 }, 80, 'Moves aimed at it land 10% less often.'),
	widelens: H('Wide Loupe', { accBoost: 1.1 }, 60, 'Its moves land 10% more often.'),
	scopelens: H('Scope Sight', { critBoost: true }, 70, 'Critical hits are twice as likely.'),
	assaultvest: H('Assault Padding', { assaultVest: true }, 120, '1.5× Sp. Def, but it cannot use status moves.'),
	eviolite: H('Eviolite Chip', { eviolite: true }, 120, '1.5× Defense and Sp. Def while it can still evolve.'),
	weaknesspolicy: H('Weakness Warranty', { weakPolicy: true }, 80, 'Once a battle: a super-effective hit sharply raises its Attack and Sp. Atk (+2).'),
	whiteherb: H('White Moss', { whiteHerb: true }, 50, 'Once a battle: undoes its lowered stats.'),
	luckyegg: H('Lucky Capsule', { expBoost: 1.5 }, 150, 'It earns 1.5× EXP from the foes it knocks out.'),
	charcoal: H('Charcoal Stick', typeBoost('Fire'), 40, 'Fire moves deal 1.2× damage.'),
	mysticwater: H('Mystic Droplet', typeBoost('Water'), 40, 'Water moves deal 1.2× damage.'),
	magnet: H('Toy Magnet', typeBoost('Electric'), 40, 'Electric moves deal 1.2× damage.'),
	miracleseed: H('Miracle Bud', typeBoost('Grass'), 40, 'Grass moves deal 1.2× damage.'),
	nevermeltice: H('Never-Melt Resin', typeBoost('Ice'), 40, 'Ice moves deal 1.2× damage.'),
	blackbelt: H('Black Sash', typeBoost('Fighting'), 40, 'Fighting moves deal 1.2× damage.'),
	poisonbarb: H('Poison Pin', typeBoost('Poison'), 40, 'Poison moves deal 1.2× damage.'),
	softsand: H('Base Sand', typeBoost('Ground'), 40, 'Ground moves deal 1.2× damage.'),
	sharpbeak: H('Sharp Nib', typeBoost('Flying'), 40, 'Flying moves deal 1.2× damage.'),
	twistedspoon: H('Twisted Wire', typeBoost('Psychic'), 40, 'Psychic moves deal 1.2× damage.'),
	silverpowder: H('Silver Glitter', typeBoost('Bug'), 40, 'Bug moves deal 1.2× damage.'),
	hardstone: H('Hard Pebble', typeBoost('Rock'), 40, 'Rock moves deal 1.2× damage.'),
	spelltag: H('Spell Sticker', typeBoost('Ghost'), 40, 'Ghost moves deal 1.2× damage.'),
	dragonfang: H('Dragon Charm', typeBoost('Dragon'), 40, 'Dragon moves deal 1.2× damage.'),
	blackglasses: H('Black Visor', typeBoost('Dark'), 40, 'Dark moves deal 1.2× damage.'),
	metalcoat: H('Metal Lacquer', typeBoost('Steel'), 40, 'Steel moves deal 1.2× damage. (Also evolves Onix and Scyther.)'),
	silkscarf: H('Silk Ribbon', typeBoost('Normal'), 40, 'Normal moves deal 1.2× damage.'),
});

const E = (name, stars = 60) => ({ name, stars });
export const EVO = Object.freeze({
	firestone: E('Fire Paint'), waterstone: E('Water Paint'), thunderstone: E('Thunder Paint'), leafstone: E('Leaf Paint'), icestone: E('Ice Paint'),
	moonstone: E('Moon Paint'), sunstone: E('Sun Paint'), shinystone: E('Shiny Paint'), duskstone: E('Dusk Paint'), dawnstone: E('Dawn Paint'),
	ovalstone: E('Oval Mould'), linkingcord: E('Linking String', 80), kingsrock: E("King's Base", 80), protector: E('Protector Shell', 80), dragonscale: E('Dragon Decal', 80),
	electirizer: E('Electric Kit', 80), magmarizer: E('Magma Kit', 80), upgrade: E('Upgrade Kit', 80), dubiousdisc: E('Dubious Kit', 80), razorfang: E('Razor Fang Part', 80),
	razorclaw: E('Razor Claw Part', 80), prismscale: E('Prism Decal', 80), reapercloth: E('Reaper Felt', 80), deepseatooth: E('Deep Sea Tooth Part', 80), deepseascale: E('Deep Sea Decal', 80),
	sachet: E('Sachet Charm', 80), whippeddream: E('Whipped Putty', 80), tartapple: E('Tart Apple Charm', 80), sweetapple: E('Sweet Apple Charm', 80), syrupyapple: E('Syrupy Apple Charm', 80),
	crackedpot: E('Cracked Mini Pot', 80), chippedpot: E('Chipped Mini Pot', 80), galaricacuff: E('Galarica Bangle', 80), galaricawreath: E('Galarica Garland', 80),
	auspiciousarmor: E('Auspicious Plating', 80), maliciousarmor: E('Malicious Plating', 80), unremarkableteacup: E('Unremarkable Mini Cup', 80), masterpieceteacup: E('Masterpiece Mini Cup', 80),
	metalalloy: E('Metal Ingot', 80),
});
// (Metal Coat is a held item AND an evolution item: owning one does both; evolving uses it up.)

export const CANDY = Object.freeze({ rarecandy: { name: 'Rare Polish', stars: 25, text: 'Raises a figurine one level. A higher level takes more of it: one more for every ten levels.' } });
/** How many Rare Polish a figurine of this level takes to gain one (a level's EXP grows with the level; a flat price did not). */
export const polishNeed = (level) => 1 + Math.floor(Math.max(1, Math.floor(+level) || 1) / 10);
// (owner, 2026-11-24; gear.js) what joins two plush gemstones of one stat into a stronger one. Found in the Item World; not sold.
// (pullcord: the Item World's way out. Owner, 2026-11-24: "Escape Rope style item definitely"; a name of its own, as every Poketactica item has.)
export const KIT = Object.freeze({ pullcord: { name: 'Pull Cord', stars: 200, text: 'Used inside an item\'s world: you leave at once and keep the floors cleared so far (the item\'s levels and the gemstones found; the Stitching Kit stays at the exit). Used up.' }, stitchingkit: { name: 'Stitching Kit', stars: 500, text: 'Joins two plush gemstones of the same stat into one: their levels added together (100 at most). Used up.' } });
/** A starter figurine (any of figcol.js STARTERS) at its starting level, from the shop. */
export const SHOP_FIG_STARS = 200;

/** What kind of good an id is: 'held' (it may ALSO be an evolution item: Metal Coat), 'evo', 'candy' or null. */
export const kindOf = (id) => (HELD[id] ? 'held' : EVO[id] ? 'evo' : CANDY[id] ? 'candy' : KIT[id] ? 'kit' : null);
export const isGood = (id) => typeof id === 'string' && !!kindOf(id);
export const goodName = (id) => (HELD[id] || EVO[id] || CANDY[id] || KIT[id] || {}).name || id;
export const goodStars = (id) => (HELD[id] || EVO[id] || CANDY[id] || KIT[id] || {}).stars || 0;
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
