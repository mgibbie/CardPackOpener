// gen_pocket_cards.mjs — Pocket Enhanced's card database, built from the ORIGINAL card data.
//
//   in   pocketenhanced/data/source/tcgdex_a1.json   Genetic Apex (A1-001..286) and the Promo-A starter Trainers,
//                                                    as published by TCGdex. Never edited.
//        overworld/data/species_battle.json          the mainline games' typing of every species (Combat Types)
//        overworld/data/moves_battle.json            the mainline games' move types (attack Combat Types)
//   out  pocketenhanced/js/data/cards.js             the game's card definitions (immutable)
//        pocketenhanced/data/ATTACK_TYPE_REVIEW.md   every attack's Combat Type and where it came from
//
// Nothing about a card is invented here: HP, costs, damage, stages, text are the source's. What this ADDS, per the
// owner's plan (Plans/POCKET_ENHANCED_PLAN.md):
//   * Combat Types — a species' mainline typing, by name; never derived from its Card Type.
//   * an attack's Combat Type — the mainline move of the same name where there is one ("move"); otherwise the
//     table below, each entry marked "named" (the name says its element, or it is plainly a known move's kin) or
//     "judgement" (a call that should be reviewed). The review file lists all of them.
//   * `fx`: the card's effect as structured data the engine runs, read off its ORIGINAL text by the patterns below.
//     A text no pattern reads stops the build: an effect is never dropped or guessed.
//   * `adapted`: the text as it plays with 2-4 players and two Active Pokémon, written from `fx`.
//   node tools/gen_pocket_cards.mjs            write
//   node tools/gen_pocket_cards.mjs --check    exit 1 if the committed files differ
//   node tools/gen_pocket_cards.mjs --survey   write nothing: list every text, species and attack the tables below do not cover yet (a new set)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check'), SURVEY = process.argv.includes('--survey'), gaps = [];
// the sets, in release order: Genetic Apex (with the Promo-A starter Trainers), Mythical Island, Space-Time Smackdown, Triumphant Light
const SOURCES = ['tcgdex_a1.json', 'tcgdex_a1a.json', 'tcgdex_a2.json', 'tcgdex_a2a.json'];
const SRC = SOURCES.flatMap(f => JSON.parse(fs.readFileSync(path.join(ROOT, 'pocketenhanced/data/source', f), 'utf8')).cards);
const setOf = id => id.slice(0, id.lastIndexOf('-'));
const SPECIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_battle.json'), 'utf8'));
const MOVES = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/moves_battle.json'), 'utf8'));
const norm = s => String(s).toLowerCase().replace(/♀/g, 'f').replace(/♂/g, 'm').replace(/é/g, 'e').replace(/[^a-z0-9]/g, '');
const SP_BY = {}; for (const [k, v] of Object.entries(SPECIES)) { SP_BY[norm(k)] = v; if (v.name) SP_BY[norm(v.name)] = v; }
const MV_BY = {}; for (const [k, v] of Object.entries(MOVES)) { MV_BY[norm(v.name || k)] = v; }

// ---- Pocket-only attacks: their Combat Type, and how sure it is -------------------------------------------------
const N = 'named', J = 'judgement';
const ATTACK_TYPE = {
	'Amass': ['Steel', J, 'Meltan gathers metal'], 'Ancient Whirlpool': ['Water', N], 'Aqua Edge': ['Water', N], 'Attach': ['Grass', J, "Cottonee's; no mainline move"],
	'Barrier Attack': ['Psychic', N, 'Barrier'], 'Blot': ['Grass', J, "Petilil's; no mainline move"], 'Bone Beatdown': ['Ground', N, 'the Bone moves'], 'Bother': ['Ghost', J, "Gengar's"],
	'Bubble Drain': ['Water', N], 'Call for Family': ['Normal', N, 'no damage'], 'Circle Circuit': ['Electric', N], 'Combustion': ['Fire', N], 'Continuous Lick': ['Ghost', N, 'Lick'],
	'Copy Anything': ['Normal', N, 'Transform; the copied attack keeps its own type'], 'Corner': ['Normal', J, 'a trapping move like Mean Look'], 'Crimson Storm': ['Fire', N], 'Do the Wave': ['Normal', J],
	'Double Horn': ['Bug', J, "Pinsir's horns"], 'Double Lariat': ['Fighting', J, "Golurk's punches"], 'Drool': ['Poison', J, "Gloom's"], 'Fight Back': ['Fighting', N, 'Revenge'], 'Find a Friend': ['Normal', N, 'no damage'],
	'Fire Claws': ['Fire', N], 'Fire Mane': ['Fire', N], 'Flap': ['Flying', N], 'Flare': ['Fire', N], 'Flop': ['Normal', N, 'Splash'], 'Gentle Slap': ['Normal', N], 'Giant Bloom': ['Grass', N], 'Glide': ['Flying', N],
	'Gnaw': ['Normal', J, 'Hyper Fang rather than Bite'], 'Head Bolt': ['Electric', N], 'Headache': ['Psychic', J, "Psyduck's"], 'Heat Blast': ['Fire', N], 'Heat Tackle': ['Fire', N], 'Heavy Impact': ['Steel', N, 'Heavy Slam'],
	'Horn Hazard': ['Normal', N, 'Horn Attack'], 'Hydro Bazooka': ['Water', N], 'Hydro Splash': ['Water', N], 'Ice Wing': ['Ice', N], 'Inferno Dance': ['Fire', N], 'Inferno Onrush': ['Fire', N], 'Jab': ['Fighting', N],
	'KO Crab': ['Water', N, 'Crabhammer'], 'Knock Back': ['Fighting', J, "Grapploct's"], 'Knuckle Punch': ['Fighting', N], 'Land Crush': ['Ground', N], 'Leaf Supply': ['Grass', N], 'Leek Slap': ['Normal', J, "Farfetch'd's leek"],
	'Lightning Ball': ['Electric', N], 'Lovestrike': ['Poison', J, "Nidoqueen's"], 'Magical Shot': ['Fairy', N, "Clefable's magic"], 'Magma Punch': ['Fire', N], 'Mist Slash': ['Water', J, "Greninja's"], 'Mumble': ['Psychic', J, "Drowzee's"],
	'Pierce': ['Steel', J, "Pawniard's blades"], 'Poison Horn': ['Poison', N], 'Poison Tentacles': ['Poison', N], 'Power Blast': ['Psychic', J, "Mewtwo's"], 'Primal Wingbeat': ['Flying', N], 'Psy Report': ['Psychic', N],
	'Psychic Sphere': ['Psychic', N], 'Psydrive': ['Psychic', N], 'Psypunch': ['Psychic', N], 'Psyshot': ['Psychic', N], 'Raging Thunder': ['Electric', N], 'Rain Splash': ['Water', N], 'Ram': ['Normal', N, 'Tackle'],
	'Razor Fin': ['Water', J, "Poliwag's"], 'Rolling Tackle': ['Normal', N], 'Second Strike': ['Water', J, "Bruxish's"], 'Sharp Scythe': ['Bug', J, "Scyther's"], 'Sharp Sting': ['Bug', J, "Beedrill's; could be Poison"],
	'Shell Attack': ['Rock', J, "Kabuto's shell; could be Water"], 'Slap': ['Normal', N], 'Sleepy Song': ['Normal', N, 'Sing'], 'Smack': ['Normal', N], 'Soothing Scent': ['Grass', J, "Vileplume's; Sweet Scent is Normal"],
	'Spinning Attack': ['Steel', J, "Magneton's; Gyro Ball"], 'Spiral Kick': ['Fighting', N], 'Spooky Shot': ['Ghost', N], 'Sting': ['Poison', J, "Weedle's; Poison Sting"], 'Stretch Kick': ['Fighting', N],
	'Suffocating Gas': ['Poison', N], 'Super Psy Bolt': ['Psychic', N], 'Surprise Attack': ['Dark', J, 'Feint Attack'], 'Tail Smack': ['Normal', N, 'Tail Slap'], 'Tail Whap': ['Normal', N], 'Thunder Spear': ['Electric', N],
	'Thundering Hurricane': ['Electric', N], 'Tiny Charge': ['Electric', J, "Tynamo's; Charge Beam rather than Tackle"], 'Tongue Slap': ['Normal', J, "Shellder's; Lick is Ghost"], 'Tropical Swing': ['Grass', J, "Exeggutor's"],
	'Water Arrow': ['Water', N], 'Water Drip': ['Water', N], 'Wave Splash': ['Water', N], 'Zap Kick': ['Electric', N],
	// Mythical Island (A1a)
	'Aqua Liner': ['Water', N], 'Bloomshine': ['Fairy', J, "Florges's"], 'Continuous Steps': ['Normal', J, "Eevee's"], 'Division': ['Poison', J, "Koffing's"], 'Energy Whip': ['Grass', J, "Dhelmise's; Power Whip"],
	'Fighting Tackle': ['Fighting', N], 'Flickering Spores': ['Grass', N, 'the Spore moves'], 'Focus Fist': ['Fighting', N, 'Focus Punch'], 'Genome Hacking': ['Normal', N, 'Transform; the copied attack keeps its own type'],
	'Gigashock': ['Electric', N], 'Growth Spurt': ['Grass', J, "Exeggcute's; Growth is Normal"], 'Guard Press': ['Rock', J, "Golem's"], 'Hypnotic Gaze': ['Psychic', N, 'Hypnosis'], 'Leaf Drain': ['Grass', N],
	'Leap Out': ['Normal', J, "Magikarp's; Splash"], 'Light Punch': ['Fighting', J, "Geodude's"], 'Lunge Out': ['Rock', J, "Graveler's"], 'Mind Jack': ['Psychic', N], 'Poison Claws': ['Poison', N],
	'Powerful Bloom': ['Grass', N], 'Punch': ['Fighting', J, "Primeape's"], 'Rampaging Whirlpool': ['Water', N], 'Rising Lunge': ['Fire', J, "Rapidash's"], 'Scattering Cyclone': ['Flying', N],
	'Spike Draw': ['Psychic', J, "Sigilyph's"], 'Volcanic Ash': ['Fire', N],
	// Space-Time Smackdown (A2)
	'Assault Laser': ['Electric', J, "Rotom's"], 'Balloon Strike': ['Flying', J, "Drifblim's"], 'Beam': ['Normal', J, "Porygon's"], 'Big Explosion': ['Normal', N, 'Explosion'], 'Boulder Crush': ['Rock', N],
	'Buggy Beam': ['Normal', J, "Porygon-Z's; not a Bug move"], 'Bursting Inferno': ['Fire', N], 'Clutch': ['Flying', J, "Staraptor's talons"], 'Dark Prism': ['Dark', N], 'Darkness Fang': ['Dark', N],
	'Devour Soul': ['Ghost', N], 'Dimensional Storm': ['Dragon', J, "Palkia's; Spacial Rend"], 'Double Scratch': ['Normal', N, 'Scratch'], 'Earthen Press': ['Ground', N], 'Electric Claws': ['Electric', N],
	'Elegant Swim': ['Water', N], 'Energized Blade': ['Fighting', J, "Gallade's"], 'Entrancing Melody': ['Normal', J, "Kricketune's; Sing"], 'Exciting Voltage': ['Electric', N], 'Expand': ['Normal', J, "Drifloon's; Stockpile"],
	'Fiery Punch': ['Fire', N, 'Fire Punch'], 'Flog': ['Grass', J, "Carnivine's vines"], 'Frost Smash': ['Ice', N], 'Frosty Flattening': ['Ice', N], 'Group Beatdown': ['Dark', N, 'Beat Up'],
	'Hammer In': ['Ground', J, "Piloswine's"], 'Headbang': ['Steel', J, "Bastiodon's; Headbutt is Normal"], 'Hide': ['Normal', J, "Shinx's"], 'Interrupt': ['Normal', J, "Purugly's"], 'Jet Screw': ['Water', N, 'Aqua Jet'],
	'Leaf Cutter': ['Grass', N], 'Leaf Step': ['Grass', N], 'Leafy Cyclone': ['Grass', N], 'Licking Fury': ['Normal', J, "Lickilicky's; Lick is Ghost"], 'Magical Delusion': ['Ghost', J, "Mismagius's"],
	'Metal Arms': ['Steel', N], 'Metallic Turbo': ['Steel', N], 'Mind Boost': ['Psychic', N], 'Moonlight Gain': ['Psychic', J, "Cresselia's; Moonlight is Fairy"], 'Mountain Swing': ['Rock', J, "Rhyperior's"],
	'Nap': ['Normal', J, "Piplup's; Rest is Psychic"], 'Oceanic Gift': ['Water', N], 'Overdrive Smash': ['Fairy', J, "Togekiss's"], 'Poisonous Whip': ['Poison', N], 'Pose': ['Normal', J, "Glameow's"],
	'Psychic Arrow': ['Psychic', N], 'Raging Hammer': ['Normal', J, "Regigigas's"], 'Rolling Attack': ['Normal', J, "Electrode's; Rollout is Rock"], 'Scratching Nails': ['Dark', J, "Weavile's claws"], 'Searing Flame': ['Fire', N],
	'Skill Dive': ['Flying', J, "Honchkrow's"], 'Sparking Gadget': ['Electric', N], 'Steel Tackle': ['Steel', N], 'Stoke': ['Fire', N], 'Submarine Blow': ['Fighting', J, "Lucario's"],
	'Supreme Blast': ['Psychic', J, "Mesprit's"], 'Swirling Disaster': ['Dark', J, "Spiritomb's"], 'Tail Jab': ['Normal', J, "Aipom's"], 'Thunder Blast': ['Electric', N], 'Triple Nose': ['Steel', J, "Probopass's"],
	'Volt Bolt': ['Electric', N], 'Wrack Down': ['Ground', J, "Rhydon's"], 'Energy Cutoff': ['Grass', J, "Mow Rotom's"], 'Heat Breath': ['Fire', N], 'Spin Storm': ['Flying', J, "Fan Rotom's"],
	// Triumphant Light (A2a)
	'Beat': ['Fighting', J, "Croagunk's"], 'Collapse': ['Normal', J, "Snorlax's"], 'Corkscrew Punch': ['Fighting', N], 'Crisis Dive': ['Ghost', J, "Giratina's; Shadow Force"], 'Dash Attack': ['Normal', J, "Rotom's"],
	'Defensive Unit': ['Steel', J, "Probopass's"], 'Fighting Headbutt': ['Fighting', N], 'Freezing Wind': ['Ice', N], 'Hypnoblast': ['Ghost', J, "Gengar's; Hypnosis is Psychic"], 'Icicle': ['Ice', N],
	'Iron Beam Breaker': ['Steel', N], 'Kick': ['Fighting', N], 'Kick Shot': ['Fighting', N], 'Linear Attack': ['Dragon', J, "Garchomp's"], 'Power Beam': ['Electric', J, "Magnezone's"],
	"Ragin' Mad Strike": ['Fire', J, "Heatran's"], 'Reckless Charge': ['Bug', J, "Vespiquen's"], 'Rolling Spin': ['Ground', J, "Donphan's; Rollout is Rock"], 'Silent Wing': ['Flying', N], 'Single-Horn Throw': ['Fighting', J, "Heracross's"],
	'Speed Attack': ['Normal', J, "Pupitar's"], 'Ultimate Force': ['Normal', J, "Arceus's; Judgment"], 'Time Mash': ['Dragon', J, "Origin Forme Dialga's; Roar of Time"], 'Zone Smash': ['Dragon', J, "Origin Forme Palkia's; Spacial Rend"],
};

// ---- energy symbols and card types -----------------------------------------------------------------------------
const ENERGY = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal', C: 'Colorless' };
const en = s => ENERGY[s] || s;
const names = s => s.replace(/^your /, '').split(/,\s*(?:or\s+)?|\s+or\s+/).map(x => x.trim()).filter(Boolean);

// ---- original text -> fx ---------------------------------------------------------------------------------------
// Each row: [pattern, m => fx]. The text is matched whole (after tidying its quotes and dashes).
const tidy = s => String(s || '').replace(/[’‘]/g, "'").replace(/[−–—]/g, '-').replace(/\s+/g, ' ').trim();
const num = { a: 1, an: 1, '1': 1, '2': 2, '3': 3, '4': 4 };
const ATTACK_FX = [
	[/^1 of your opponent's Pokémon is chosen at random (\d) times\. For each time a Pokémon was chosen, do (\d+) damage to it\.$/, m => [{ k: 'randomHits', times: +m[1], n: +m[2] }]],
	[/^Choose 1 of your opponent's Pokémon's attacks and use it as this attack\. If this Pokémon doesn't have the necessary Energy to use that attack, this attack does nothing\.$/, () => [{ k: 'copyAttack' }]],
	[/^Discard (a|1|2) \{(\w)\} Energy from this Pokémon\.$/, m => [{ k: 'discardSelfEnergy', type: en(m[2]), n: num[m[1]] }]],
	[/^Discard all Energy from this Pokémon\.$/, () => [{ k: 'discardSelfEnergy', type: null, n: 'all' }]],
	[/^Discard a random Energy from your opponent's Active Pokémon\.$/, () => [{ k: 'discardTargetEnergy' }]],
	[/^Flip a coin\. If heads, discard a random Energy from your opponent's Active Pokémon\.$/, () => [{ k: 'discardTargetEnergy', coin: true }]],
	[/^Draw a card\.$/, () => [{ k: 'draw', n: 1 }]],
	[/^During your opponent's next turn, the Defending Pokémon can't attack\.$/, () => [{ k: 'targetCantAttack' }]],
	[/^Flip a coin\. If heads, the Defending Pokémon can't attack during your opponent's next turn\.$/, () => [{ k: 'targetCantAttack', coin: true }]],
	[/^During your opponent's next turn, the Defending Pokémon can't retreat\.$/, () => [{ k: 'targetCantRetreat' }]],
	[/^During your opponent's next turn, this Pokémon takes -(\d+) damage from attacks\.$/, m => [{ k: 'selfReduce', n: +m[1] }]],
	[/^During your opponent's next turn, attacks used by the Defending Pokémon do -(\d+) damage\.$/, m => [{ k: 'targetAttackMinus', n: +m[1] }]],
	[/^Flip 2 coins\. If both of them are heads, this attack does (\d+) more damage\.$/, m => [{ k: 'coinsAllBonus', coins: 2, bonus: +m[1] }]],
	[/^Flip (\d) coins\. This attack does (\d+) damage for each heads\.$/, m => [{ k: 'coinsMul', coins: +m[1], per: +m[2] }]],
	[/^Flip a coin until you get tails\. This attack does (\d+) damage for each heads\.$/, m => [{ k: 'coinsUntilTails', per: +m[1] }]],
	[/^Flip 3 coins\. Take an amount of \{(\w)\} Energy from your Energy Zone equal to the number of heads and attach it to your Benched \{\w\} Pokémon in any way you like\.$/, m => [{ k: 'coinsAttachBench', coins: 3, type: en(m[1]) }]],
	[/^Flip a coin\. If heads, discard a random card from your opponent's hand\.$/, () => [{ k: 'coinDiscardHand' }]],
	[/^Flip a coin\. If heads, during your opponent's next turn, prevent all damage from-and effects of-attacks done to this Pokémon\.$/, () => [{ k: 'coinPrevent' }]],
	[/^Flip a coin\. If heads, this attack does (\d+) more damage\.$/, m => [{ k: 'coinBonus', bonus: +m[1] }]],
	[/^Flip a coin\. If heads, this attack does (\d+) more damage\. If tails, this Pokémon also does (\d+) damage to itself\.$/, m => [{ k: 'coinBonus', bonus: +m[1], tailsSelf: +m[2] }]],
	[/^Flip a coin\. If heads, your opponent shuffles their Active Pokémon into their deck\.$/, () => [{ k: 'coinShuffleTarget' }]],
	[/^Flip a coin\. If heads, your opponent's Active Pokémon is now Paralyzed\.$/, () => [{ k: 'status', s: 'paralyzed', coin: true }]],
	[/^Flip a coin\. If tails, this attack does nothing\.$/, () => [{ k: 'coinNothing' }]],
	[/^Heal (\d+) damage from this Pokémon\.$/, m => [{ k: 'heal', n: +m[1] }]],
	[/^Heal from this Pokémon the same amount of damage you did to your opponent's Active Pokémon\.$/, () => [{ k: 'healDealt' }]],
	[/^If this Pokémon has at least (\d) extra \{(\w)\} Energy attached, this attack does (\d+) more damage\.$/, m => [{ k: 'extraEnergyBonus', need: +m[1], type: en(m[2]), bonus: +m[3] }]],
	[/^If this Pokémon has damage on it, this attack does (\d+) more damage\.$/, m => [{ k: 'selfDamagedBonus', bonus: +m[1] }]],
	[/^If your opponent's Active Pokémon has damage on it, this attack does (\d+) more damage\.$/, m => [{ k: 'targetDamagedBonus', bonus: +m[1] }]],
	[/^If your opponent's Active Pokémon is Poisoned, this attack does (\d+) more damage\.$/, m => [{ k: 'targetPoisonedBonus', bonus: +m[1] }]],
	[/^Put 1 random (.+) from your deck onto your Bench\.$/, m => [{ k: 'benchFromDeck', name: m[1] }]],
	[/^Put 1 random \{(\w)\} Pokémon from your deck into your hand\.$/, m => [{ k: 'typeToHand', type: en(m[1]) }]],
	[/^Switch out your opponent's Active Pokémon to the Bench\. \(Your opponent chooses the new Active Pokémon\.\)$/, () => [{ k: 'switchTarget' }]],
	[/^Switch this Pokémon with 1 of your Benched Pokémon\.$/, () => [{ k: 'switchSelf' }]],
	[/^Take 1 \{(\w)\} Energy from your Energy Zone and attach it to this Pokémon\.$/, m => [{ k: 'attachZone', type: en(m[1]), to: 'self' }]],
	[/^Take a \{(\w)\} Energy from your Energy Zone and attach it to 1 of your Benched \{\w\} Pokémon\.$/, m => [{ k: 'attachZone', type: en(m[1]), to: 'benchType' }]],
	[/^This Pokémon also does (\d+) damage to itself\.$/, m => [{ k: 'selfDamage', n: +m[1] }]],
	[/^This attack also does (\d+) damage to each of your opponent's Benched Pokémon\.$/, m => [{ k: 'benchSplash', n: +m[1] }]],
	[/^This attack also does (\d+) damage to 1 of your Benched Pokémon\.$/, m => [{ k: 'ownBenchDamage', n: +m[1] }]],
	[/^This attack does (\d+) more damage for each Energy attached to your opponent's Active Pokémon\.$/, m => [{ k: 'perTargetEnergy', n: +m[1] }]],
	[/^This attack does (\d+) damage for each of your Benched Pokémon\.$/, m => [{ k: 'perBench', n: +m[1], type: null }]],
	[/^This attack does (\d+) damage for each of your Benched \{(\w)\} Pokémon\.$/, m => [{ k: 'perBench', n: +m[1], type: en(m[2]) }]],
	[/^This attack does (\d+) more damage for each of your Benched (\w+)\.$/, m => [{ k: 'perBenchName', n: +m[1], name: m[2] }]],
	[/^This attack does (\d+) damage to 1 of your opponent's Benched Pokémon\.$/, m => [{ k: 'snipe', n: +m[1], zone: 'bench' }]],
	[/^This attack does (\d+) damage to 1 of your opponent's Pokémon\.$/, m => [{ k: 'snipe', n: +m[1], zone: 'any' }]],
	[/^Your opponent can't use any Supporter cards from their hand during their next turn\.$/, () => [{ k: 'noSupporter' }]],
	[/^Your opponent's Active Pokémon is now (Asleep|Poisoned)\.$/, m => [{ k: 'status', s: m[1].toLowerCase() }]],
	[/^Your opponent reveals their hand\.$/, () => [{ k: 'revealHand' }]],
	// Mythical Island (A1a)
	[/^Take a \{(\w)\} Energy from your Energy Zone and attach it to this Pokémon\.$/, m => [{ k: 'attachZone', type: en(m[1]), to: 'self', a: true }]],
	[/^Flip a coin for each Energy attached to this Pokémon\. This attack does (\d+) damage for each heads\.$/, m => [{ k: 'coinsPerEnergy', per: +m[1] }]],
	[/^Discard (\d) \{(\w)\} Energy from this Pokémon\. This attack does (\d+) damage to 1 of your opponent's Pokémon\.$/, m => [{ k: 'discardSelfEnergy', type: en(m[2]), n: +m[1] }, { k: 'snipe', n: +m[3], zone: 'any' }]],
	[/^Discard a random Energy from among the Energy attached to all Pokémon \(both yours and your opponent's\)\.$/, () => [{ k: 'discardRandomAny' }]],
	[/^Choose 1 of your opponent's Active Pokémon's attacks and use it as this attack\.$/, () => [{ k: 'copyAttack', active: true, free: true }]],
	[/^This attack does (\d+) more damage for each of your opponent's Benched Pokémon\.$/, m => [{ k: 'perOppBench', n: +m[1] }]],
	[/^Heal (\d+) damage from each of your Pokémon\.$/, m => [{ k: 'healAllOwn', n: +m[1] }]],
	[/^If any of your Pokémon were Knocked Out by damage from an attack during your opponent's last turn, this attack does (\d+) more damage\.$/, m => [{ k: 'revengeBonus', bonus: +m[1] }]],
	[/^During your opponent's next turn, if the Defending Pokémon tries to use an attack, your opponent flips a coin\. If tails, that attack doesn't happen\.$/, () => [{ k: 'smokescreen' }]],
	[/^If your opponent's Active Pokémon is a Pokémon \{ex\}, this attack does (\d+) more damage\.$/, m => [{ k: 'targetExBonus', bonus: +m[1] }]],
	[/^Shuffle your hand into your deck\. Draw a card for each card in your opponent's hand\.$/, () => [{ k: 'mimicHand' }]],
	// Space-Time Smackdown (A2)
	[/^Your opponent's Active Pokémon is now (Confused|Burned)\.$/, m => [{ k: 'status', s: m[1].toLowerCase() }]],
	[/^Discard a random Energy from this Pokémon\.$/, () => [{ k: 'discardSelfRandom' }]],
	[/^Discard all \{(\w)\} Energy from this Pokémon\.$/, m => [{ k: 'discardSelfEnergy', type: en(m[1]), n: 'all' }]],
	[/^During your next turn, this Pokémon can't use (.+)\.$/, m => [{ k: 'selfCantUse', name: m[1] }]],
	[/^During your next turn, this Pokémon can't attack\.$/, () => [{ k: 'selfCantAttack' }]],
	[/^During your next turn, this Pokémon's (.+) attack does \+(\d+) damage\.$/, m => [{ k: 'selfNextBoost', name: m[1], n: +m[2] }]],
	[/^This attack also does (\d+) damage to 1 of your opponent's Benched Pokémon\.$/, m => [{ k: 'alsoBench', n: +m[1] }]],
	[/^If your opponent's Active Pokémon is a \{(\w)\} Pokémon, this attack does (\d+) more damage\.$/, m => [{ k: 'targetTypeBonus', type: en(m[1]), bonus: +m[2] }]],
	[/^Discard (\d) \{(\w)\} Energy from this Pokémon\. This attack also does (\d+) damage to each of your opponent's Benched Pokémon\.$/, m => [{ k: 'discardSelfEnergy', type: en(m[2]), n: +m[1] }, { k: 'benchSplash', n: +m[3] }]],
	[/^Choose 2 of your Benched Pokémon\. For each of those Pokémon, take a \{(\w)\} Energy from your Energy Zone and attach it to that Pokémon\.$/, m => [{ k: 'attachZoneEach', type: en(m[1]), n: 2 }]],
	[/^Discard all \{(\w)\} Energy from this Pokémon\. This attack does (\d+) damage to 1 of your opponent's Pokémon\.$/, m => [{ k: 'discardSelfEnergy', type: en(m[1]), n: 'all' }, { k: 'snipe', n: +m[2], zone: 'any' }]],
	[/^If this Pokémon has a Pokémon Tool attached, this attack does (\d+) more damage\.$/, m => [{ k: 'selfToolBonus', bonus: +m[1] }]],
	[/^If your opponent's Active Pokémon has a Pokémon Tool attached, this attack does (\d+) more damage\.$/, m => [{ k: 'targetToolBonus', bonus: +m[1] }]],
	[/^Take a \{(\w)\} Energy from your Energy Zone and attach it to (\w+) or (\w+)\.$/, m => [{ k: 'attachZoneNamed', type: en(m[1]), names: [m[2], m[3]] }]],
	[/^You can use this attack only if you have (\w+) and (\w+) on your Bench\. Discard all Energy from this Pokémon\.$/, m => [{ k: 'needBench', names: [m[1], m[2]] }, { k: 'discardSelfEnergy', type: null, n: 'all' }]],
	[/^Discard the top (\d) cards of your deck\.$/, m => [{ k: 'millSelf', n: +m[1] }]],
	[/^Flip (\d) coins\. This attack does (\d+) more damage for each heads\.$/, m => [{ k: 'coinsBonusEach', coins: +m[1], bonus: +m[2] }]],
	[/^Flip a coin until you get tails\. This attack does (\d+) more damage for each heads\.$/, m => [{ k: 'coinsUntilTailsBonus', bonus: +m[1] }]],
	[/^If your opponent's Pokémon is Knocked Out by damage from this attack, this Pokémon also does (\d+) damage to itself\.$/, m => [{ k: 'koRecoil', n: +m[1] }]],
	[/^This attack does (\d+) damage to each of your opponent's Pokémon\.$/, m => [{ k: 'allOppDamage', n: +m[1] }]],
	[/^Flip (\d) coins\. This attack does (\d+) damage for each heads\. If at least (\d) of them are heads, your opponent's Active Pokémon is now Poisoned\.$/, m => [{ k: 'coinsMul', coins: +m[1], per: +m[2] }, { k: 'headsStatus', need: +m[3], s: 'poisoned' }]],
	[/^Flip a coin for each Pokémon you have in play\. This attack does (\d+) damage for each heads\.$/, m => [{ k: 'coinsPerPokemon', per: +m[1] }]],
	[/^Take (\d) \{(\w)\} Energy from your Energy Zone and attach it to 1 of your Benched Pokémon\.$/, m => [{ k: 'attachZone', type: en(m[2]), to: 'bench', n: +m[1] }]],
	[/^Change the type of the next Energy that will be generated for your opponent to 1 of the following at random: \{G\}, \{R\}, \{W\}, \{L\}, \{P\}, \{F\}, \{D\}, or \{M\}\.$/, () => [{ k: 'randomNextEnergy' }]],
	[/^Before doing damage, discard all Pokémon Tools from your opponent's Active Pokémon\.$/, () => [{ k: 'discardTargetTools' }]],
	[/^Halve your opponent's Active Pokémon's remaining HP, rounded down\.$/, () => [{ k: 'halveTarget' }]],
	[/^Your opponent reveals their hand\. Choose a card you find there and shuffle it into your opponent's deck\.$/, () => [{ k: 'handToDeck' }]],
	[/^This attack does more damage equal to the damage this Pokémon has on it\.$/, () => [{ k: 'selfDamageBonus' }]],
	[/^Flip a coin\. If heads, put your opponent's Active Pokémon into their hand\.$/, () => [{ k: 'coinBounceTarget' }]],
	// Triumphant Light (A2a)
	[/^Flip a coin\. If heads, your opponent reveals a random card from their hand and shuffles it into their deck\.$/, () => [{ k: 'coinHandToDeck' }]],
	[/^Your opponent's Active Pokémon is now Poisoned\. Do (\d+) damage to this Pokémon instead of the usual amount for this Special Condition\.$/, m => [{ k: 'status', s: 'poisoned', n: +m[1] }]],
	[/^Discard (\d) random Energy from this Pokémon\.$/, m => [{ k: 'discardSelfRandom', n: +m[1] }]],
	[/^This Pokémon is now Asleep\.$/, () => [{ k: 'selfStatus', s: 'asleep' }]],
	[/^Flip a coin\. If tails, during your next turn, this Pokémon can't attack\.$/, () => [{ k: 'selfCantAttack', tails: true }]],
	[/^This attack does (\d+) more damage for each of your Benched Pokémon\.$/, m => [{ k: 'perOwnBench', n: +m[1] }]],
	[/^If your opponent's Active Pokémon is a Pokémon ex, this attack does (\d+) more damage\.$/, m => [{ k: 'targetExBonus', bonus: +m[1] }]],
];
const ABILITY_FX = [
	[/^Once during your turn, you may heal (\d+) damage from each of your Pokémon\.$/, m => ({ k: 'healAll', n: +m[1], once: true })],
	[/^If this Pokémon is in the Active Spot, once during your turn, you may switch in 1 of your opponent's Benched Basic Pokémon to the Active Spot\.$/, () => ({ k: 'pullBenchBasic', once: true, active: true })],
	[/^If this Pokémon is in the Active Spot and is damaged by an attack from your opponent's Pokémon, do (\d+) damage to the Attacking Pokémon\.$/, m => ({ k: 'counter', n: +m[1], passive: true })],
	[/^This Pokémon takes -(\d+) damage from attacks\.$/, m => ({ k: 'reduce', n: +m[1], passive: true })],
	[/^Once during your turn, you may do (\d+) damage to 1 of your opponent's Pokémon\.$/, m => ({ k: 'ping', n: +m[1], once: true })],
	[/^Once during your turn, you may take a \{(\w)\} Energy from your Energy Zone and attach it to this Pokémon\.$/, m => ({ k: 'attachZoneSelf', type: en(m[1]), once: true })],
	[/^As long as this Pokémon is in the Active Spot, your opponent can't use any Supporter cards from their hand\.$/, () => ({ k: 'blockSupporters', passive: true, active: true })],
	[/^Once during your turn, you may flip a coin\. If heads, your opponent's Active Pokémon is now Asleep\.$/, () => ({ k: 'coinSleep', once: true })],
	[/^Once during your turn, you may take 1 \{(\w)\} Energy from your Energy Zone and attach it to the \{\w\} Pokémon in the Active Spot\.$/, m => ({ k: 'attachZoneActiveType', type: en(m[1]), once: true })],
	[/^Once during your turn, if this Pokémon is in the Active Spot, you may make your opponent's Active Pokémon Poisoned\.$/, () => ({ k: 'poisonActive', once: true, active: true })],
	[/^Once during your turn, you may switch out your opponent's Active Pokémon to the Bench\. \(Your opponent chooses the new Active Pokémon\.\)$/, () => ({ k: 'driveOff', once: true })],
	[/^Once during your turn, you may look at the top card of your deck\.$/, () => ({ k: 'peekTop', n: 1, once: true })],
	// Mythical Island (A1a)
	[/^Each \{(\w)\} Energy attached to your \{\w\} Pokémon provides 2 \{\w\} Energy\. This effect doesn't stack\.$/, m => ({ k: 'doubleEnergy', type: en(m[1]), passive: true })],
	[/^As often as you like during your turn, you may move a \{(\w)\} Energy from 1 of your Benched \{\w\} Pokémon to your Active \{\w\} Pokémon\.$/, m => ({ k: 'moveEnergy', type: en(m[1]), repeat: true })],
	[/^Your opponent can't play any Pokémon from their hand to evolve their Active Pokémon\.$/, () => ({ k: 'blockEvolveActive', passive: true })],
	// Space-Time Smackdown (A2)
	[/^This Pokémon takes -(\d+) damage from attacks from \{(\w)\} or \{(\w)\} Pokémon\.$/, m => ({ k: 'reduceFrom', n: +m[1], types: [en(m[2]), en(m[3])], passive: true })],
	[/^Prevent all effects of attacks used by your opponent's Pokémon done to this Pokémon\.$/, () => ({ k: 'immuneEffects', passive: true })],
	[/^As often as you like during your turn, you may choose 1 of your Pokémon that has damage on it, and move all of its damage to this Pokémon\.$/, () => ({ k: 'takeDamage', repeat: true })],
	[/^If this Pokémon has any Energy attached, it has no Retreat Cost\.$/, () => ({ k: 'freeRetreat', passive: true })],
	[/^Attacks used by your \{(\w)\} Pokémon do \+(\d+) damage to your opponent's Active Pokémon\.$/, m => ({ k: 'coach', type: en(m[1]), n: +m[2], passive: true })],
	[/^Whenever you attach a \{(\w)\} Energy from your Energy Zone to this Pokémon, do (\d+) damage to your opponent's Active Pokémon\.$/, m => ({ k: 'attachPing', type: en(m[1]), n: +m[2], passive: true })],
	[/^If any damage is done to this Pokémon by attacks, flip a coin\. If heads, this Pokémon takes -(\d+) damage from that attack\.$/, m => ({ k: 'coinReduce', n: +m[1], passive: true })],
	[/^You must discard a card from your hand in order to use this Ability\. Once during your turn, you may draw a card\.$/, () => ({ k: 'discardDraw', once: true })],
	// Triumphant Light (A2a): the "Link" Abilities work while a named Pokémon is in play
	[/^If you have (.+) in play, attacks used by this Pokémon do \+(\d+) damage to your opponent's Active Pokémon\.$/, m => ({ k: 'linkBoost', n: +m[2], names: names(m[1]), passive: true })],
	[/^If you have (.+) in play, this Pokémon has no Retreat Cost\.$/, m => ({ k: 'linkFreeRetreat', names: names(m[1]), passive: true })],
	[/^If you have (.+) in play, attacks used by this Pokémon cost (\d) less \{C\} Energy\.$/, m => ({ k: 'linkCostLess', n: +m[2], names: names(m[1]), passive: true })],
	[/^If you have (.+) in play, this Pokémon takes -(\d+) damage from attacks\.$/, m => ({ k: 'linkReduce', n: +m[2], names: names(m[1]), passive: true })],
	[/^Once during your turn, if you have (.+) in play, you may do (\d+) damage to your opponent's Active Pokémon\.$/, m => ({ k: 'ping', n: +m[2], once: true, zone: 'active', need: names(m[1]) })],
	[/^Once during your turn, if this Pokémon is in the Active Spot, you may take a \{(\w)\} Energy from your Energy Zone and attach it to 1 of your \{\w\} Pokémon\.$/, m => ({ k: 'attachZoneAnyType', type: en(m[1]), once: true, active: true })],
	[/^During Pokémon Checkup, if this Pokémon is in the Active Spot, do (\d+) damage to your opponent's Active Pokémon\.$/, m => ({ k: 'checkupPing', n: +m[1], passive: true, active: true })],
	[/^Once during your turn, you may choose either player\. Look at the top card of that player's deck\.$/, () => ({ k: 'peekAny', once: true })],
	[/^As long as this Pokémon is on your Bench, your Active Basic Pokémon's Retreat Cost is (\d) less\.$/, m => ({ k: 'benchRetreatLess', n: +m[1], passive: true })],
	[/^This Pokémon can't be affected by any Special Conditions\.$/, () => ({ k: 'noStatus', passive: true })],
];
const TRAINER_FX = [
	[/^Play this card as if it were a (\d+)-HP Basic \{C\} Pokémon\. At any time during your turn, you may discard this card from play\. This card can't retreat\.$/, m => ({ k: 'fossil', hp: +m[1] })],
	[/^Heal (\d+) damage from 1 of your \{(\w)\} Pokémon\.$/, m => ({ k: 'healOne', n: +m[1], type: en(m[2]) })],
	[/^Heal (\d+) damage from 1 of your Pokémon\.$/, m => ({ k: 'healOne', n: +m[1], type: null })],
	[/^Choose 1 of your \{(\w)\} Pokémon, and flip a coin until you get tails\. For each heads, take a \{\w\} Energy from your Energy Zone and attach it to that Pokémon\.$/, m => ({ k: 'flipAttach', type: en(m[1]) })],
	[/^During this turn, attacks used by (your .+) do \+(\d+) damage to your opponent's Active Pokémon\.$/, m => (m[1] === 'your Pokémon' ? { k: 'boost', n: +m[2], names: null } : { k: 'boost', n: +m[2], names: names(m[1]) })],
	[/^Put (your .+) in the Active Spot into your hand\.$/, m => ({ k: 'returnActive', names: names(m[1]) })],
	[/^Take 1 \{(\w)\} Energy from your Energy Zone and attach it to (your .+)\.$/, m => ({ k: 'attachNamed', type: en(m[1]), names: names(m[2]) })],
	[/^Switch out your opponent's Active Pokémon to the Bench\. \(Your opponent chooses the new Active Pokémon\.\)$/, () => ({ k: 'driveOff' })],
	[/^Move all \{(\w)\} Energy from your Benched Pokémon to (your .+) in the Active Spot\.$/, m => ({ k: 'gatherEnergy', type: en(m[1]), names: names(m[2]) })],
	[/^During this turn, the Retreat Cost of your Active Pokémon is (\d) less\.$/, m => ({ k: 'retreatLess', n: +m[1] })],
	[/^Your opponent reveals their hand\.$/, () => ({ k: 'revealHand' })],
	[/^Look at the top (\d) cards of your deck\.$/, m => ({ k: 'peekTop', n: +m[1] })],
	[/^Put a random Basic Pokémon from your deck into your hand\.$/, () => ({ k: 'basicToHand' })],
	[/^Your opponent shuffles their hand into their deck and draws (\d) cards\.$/, m => ({ k: 'redCard', n: +m[1] })],
	[/^Draw (\d) cards\.$/, m => ({ k: 'draw', n: +m[1] })],
	// Mythical Island (A1a)
	[/^Put a Basic Pokémon from your opponent's discard pile onto their Bench\.$/, () => ({ k: 'fluteBench' })],
	[/^Look at the top card of your deck\. If that card is a \{(\w)\} Pokémon, put it into your hand\. If it is not a \{\w\} Pokémon, put it on the bottom of your deck\.$/, m => ({ k: 'slab', type: en(m[1]) })],
	[/^During your opponent's next turn, all of your Pokémon take -(\d+) damage from attacks from your opponent's Pokémon\.$/, m => ({ k: 'guard', n: +m[1] })],
	// Space-Time Smackdown (A2)
	[/^Choose a Pokémon in your hand and switch it with a random Pokémon in your deck\.$/, () => ({ k: 'swapPokemon' })],
	[/^The Pokémon this card is attached to gets \+(\d+) HP\.$/, m => ({ k: 'toolHp', n: +m[1] })],
	[/^If the Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent's Pokémon, do (\d+) damage to the Attacking Pokémon\.$/, m => ({ k: 'toolCounter', n: +m[1] })],
	[/^At the end of each turn, if the Pokémon this card is attached to is affected by any Special Conditions, it recovers from all of them, and discard this card\.$/, () => ({ k: 'toolCure' })],
	[/^Switch in 1 of your opponent's Benched Pokémon that has damage on it to the Active Spot\.$/, () => ({ k: 'pullDamaged' })],
	[/^Put 1 random (.+) from your deck into your hand\.$/, m => ({ k: 'namedToHand', names: m[1].split(/,\s*(?:or\s+)?|\s+or\s+/).map(x => x.trim()).filter(Boolean) })],
	[/^Choose 1 of (your .+)\. Attach (\d) \{(\w)\} Energy from your discard pile to that Pokémon\.$/, m => ({ k: 'attachDiscard', names: names(m[1]), n: +m[2], type: en(m[3]) })],
	[/^Move an Energy from 1 of your Benched Pokémon to your Active Pokémon\.$/, () => ({ k: 'moveEnergyAny' })],
	[/^Your opponent shuffles their hand into their deck and draws a card for each of their remaining points needed to win\.$/, () => ({ k: 'mars' })],
	// Triumphant Light (A2a)
	[/^Heal (\d+) damage from each of your Pokémon that has any \{(\w)\} Energy attached\.$/, m => ({ k: 'healWithEnergy', n: +m[1], type: en(m[2]) })],
	[/^Put 1 random Basic Pokémon from your discard pile into your hand\.$/, () => ({ k: 'basicFromDiscard' })],
	[/^During this turn, attacks used by (your .+) cost (\d) less \{C\} Energy\.$/, m => ({ k: 'costLess', n: +m[2], names: m[1].replace(/^your /, '').split(/,\s*(?:and\s+)?|\s+and\s+/).map(x => x.trim()).filter(Boolean) })],
	[/^During your opponent's next turn, all of your \{(\w)\} Pokémon take -(\d+) damage from attacks from your opponent's Pokémon\.$/, m => ({ k: 'guard', n: +m[2], type: en(m[1]) })],
];
const read = (rows, text, what) => { const t = tidy(text); for (const [re, f] of rows) { const m = re.exec(t); if (m) return f(m); } if (SURVEY) { gaps.push(`${what}: "${t}"`); return null; } throw new Error(`no pattern reads this ${what}: "${t}"`); };

// ---- fx -> the text as it plays here -----------------------------------------------------------------------------
const E = t => `{${Object.keys(ENERGY).find(k => ENERGY[k] === t) || '?'}}`;
const list = a => (a.length > 1 ? a.slice(0, -1).join(', ') + ' or ' + a[a.length - 1] : a[0]);
// ---- adaptation notes: WHY a card's wording differs from the print (the plan's §8.6; the rules are in RULES.md) ----
const N_DEF = '"Your opponent\'s Active Pokémon" is the Defending Pokémon: the one this attack targets, since there are several.';
const N_OWNER = '"Your opponent" is the owner of the Defending Pokémon; "their next turn" is that player\'s.';
const N_UNTIL = '"During your opponent\'s next turn" becomes "until your next turn", so it covers every opponent\'s turn.';
const N_CHOOSE = 'With several opponents, you choose which one (or which of their Pokémon) this affects.';
const N_SWITCH = 'You choose the opposing Active Pokémon; its owner still chooses the replacement, which takes the same slot.';
const N_SLOT = '"The Active Spot" is either of your two Active slots.';
const NOTES = {
	status: N_DEF, discardTargetEnergy: N_DEF, targetDamagedBonus: N_DEF, perTargetEnergy: N_DEF, healDealt: N_DEF, targetPoisonedBonus: N_DEF,
	targetCantAttack: N_OWNER, targetCantRetreat: N_OWNER, targetAttackMinus: N_OWNER, noSupporter: N_OWNER, coinDiscardHand: N_OWNER, revealHand: N_OWNER, coinShuffleTarget: N_OWNER,
	selfReduce: N_UNTIL, coinPrevent: N_UNTIL,
	snipe: N_CHOOSE, 'AB:ping': N_CHOOSE, 'AB:coinSleep': N_CHOOSE, 'AB:poisonActive': N_CHOOSE, 'TR:revealHand': N_CHOOSE, 'TR:redCard': N_CHOOSE,
	switchTarget: N_SWITCH, 'AB:driveOff': N_SWITCH, 'TR:driveOff': N_SWITCH,
	'AB:pullBenchBasic': 'You choose the opponent, which of their Active Pokémon leaves, and which Benched Basic Pokémon comes up.',
	'AB:counter': N_SLOT, 'AB:attachZoneActiveType': N_SLOT, 'TR:returnActive': N_SLOT, 'TR:gatherEnergy': N_SLOT,
	'AB:blockSupporters': 'It reaches every opponent while this Pokémon is in either Active slot.',
	benchSplash: 'The Bench damage goes to the Defending Pokémon\'s owner only, not to every opponent.',
	randomHits: 'The random Pokémon are chosen among one opponent\'s, the one you target.',
	copyAttack: 'Any opposing Pokémon in play may be copied; the copy is aimed at this attack\'s own target.',
	switchSelf: 'The Pokémon switched in takes the same Active slot.',
	'TR:boost': 'The bonus applies into any opponent\'s Active Pokémon.',
	// Mythical Island (A1a)
	targetExBonus: N_DEF, perOppBench: N_OWNER, smokescreen: N_OWNER, mimicHand: N_OWNER + ' You choose that player by targeting one of their Active Pokémon.',
	discardRandomAny: 'With several opponents, "all Pokémon" is every Pokémon in play, whoever owns it.',
	revengeBonus: '"During your opponent\'s last turn" becomes "since your last turn", so it covers every opponent\'s turn.',
	'AB:moveEnergy': N_SLOT, 'AB:blockEvolveActive': 'It reaches every opponent.',
	'TR:fluteBench': N_CHOOSE + ' You also choose which of their Basic Pokémon comes back.', 'TR:guard': N_UNTIL,
	// Space-Time Smackdown (A2)
	alsoBench: 'The second hit may go to a Benched Pokémon of any opponent.', targetTypeBonus: N_DEF, targetToolBonus: N_DEF, discardTargetTools: N_DEF, halveTarget: N_DEF, headsStatus: N_DEF, coinBounceTarget: N_OWNER,
	koRecoil: N_DEF, allOppDamage: 'It hits every Pokémon of one opponent: the owner of the Pokémon you target.', randomNextEnergy: N_OWNER, handToDeck: N_OWNER,
	selfCantUse: 'With two Active Pokémon, this holds only while the Pokémon stays in an Active slot, as in the card game.', selfCantAttack: 'With two Active Pokémon, this holds only while the Pokémon stays in an Active slot, as in the card game.',
	'AB:immuneEffects': 'It reaches the attacks of every opponent.', 'AB:coach': 'The bonus applies into any opponent\'s Active Pokémon.',
	'AB:attachPing': 'With several opposing Active Pokémon, you choose which one takes the damage when you attach the Energy.',
	'TR:pullDamaged': 'You choose the opponent, their damaged Benched Pokémon, and which of their Active Pokémon it trades places with.',
	'TR:moveEnergyAny': N_SLOT, 'TR:mars': N_CHOOSE, 'TR:toolCounter': N_SLOT,
	// Triumphant Light (A2a)
	coinHandToDeck: N_OWNER, 'AB:linkBoost': 'The bonus applies into any opponent\'s Active Pokémon.', 'AB:attachZoneAnyType': N_SLOT,
	'AB:checkupPing': 'A Pokémon Checkup cannot ask anyone to choose: it hits the first opposing Active Pokémon in turn order, at the end of every player\'s turn.',
	'AB:peekAny': 'Any player in the match may be chosen.', 'AB:benchRetreatLess': N_SLOT,
};
const same = (a, b) => String(a || '').replace(/[’]/g, "'").replace(/−/g, '-').replace(/\s+/g, ' ').trim() === String(b || '').replace(/\s+/g, ' ').trim();
/** The note for an adapted text: null when the wording is the print's (or differs only in punctuation). */
const noteFor = (keys, text, adapted) => {
	if (same(text, adapted)) return null;
	const n = [...new Set(keys.map(k => NOTES[k]).filter(Boolean))];
	return n.length ? n.join(' ') : null;
};

const ADAPT_ATTACK = {
	randomHits: f => `Choose an opponent (by targeting one of their Active Pokémon). One of that player's Pokémon is chosen at random ${f.times} times. For each time a Pokémon was chosen, do ${f.n} damage to it.`,
	copyAttack: f => (f.active ? "Choose an attack of any opposing Active Pokémon and use it as this attack, against this attack's target." : "Choose an attack of any opposing Pokémon in play and use it as this attack, against this attack's target.") + (f.free ? '' : " If this Pokémon doesn't have the necessary Energy to use that attack, this attack does nothing."),
	discardSelfEnergy: f => (f.n === 'all' ? `Discard all ${f.type ? E(f.type) + ' ' : ''}Energy from this Pokémon.` : `Discard ${f.n} ${E(f.type)} Energy from this Pokémon.`),
	discardTargetEnergy: f => (f.coin ? 'Flip a coin. If heads, discard' : 'Discard') + ' a random Energy from the Defending Pokémon.',
	draw: f => (f.n === 1 ? 'Draw a card.' : `Draw ${f.n} cards.`),
	targetCantAttack: f => (f.coin ? 'Flip a coin. If heads, the' : 'The') + " Defending Pokémon can't attack during its owner's next turn.",
	targetCantRetreat: () => "The Defending Pokémon can't retreat during its owner's next turn.",
	selfReduce: f => `Until your next turn, this Pokémon takes -${f.n} damage from attacks.`,
	targetAttackMinus: f => `During its owner's next turn, attacks used by the Defending Pokémon do -${f.n} damage.`,
	coinsAllBonus: f => `Flip ${f.coins} coins. If both of them are heads, this attack does ${f.bonus} more damage.`,
	coinsMul: f => `Flip ${f.coins} coins. This attack does ${f.per} damage for each heads.`,
	coinsUntilTails: f => `Flip a coin until you get tails. This attack does ${f.per} damage for each heads.`,
	coinsAttachBench: f => `Flip ${f.coins} coins. Take an amount of ${E(f.type)} Energy from your Energy Zone equal to the number of heads and attach it to your Benched ${E(f.type)} Pokémon in any way you like.`,
	coinDiscardHand: () => "Flip a coin. If heads, discard a random card from the hand of the Defending Pokémon's owner.",
	coinPrevent: () => 'Flip a coin. If heads, until your next turn, prevent all damage from—and effects of—attacks done to this Pokémon.',
	coinBonus: f => `Flip a coin. If heads, this attack does ${f.bonus} more damage.` + (f.tailsSelf ? ` If tails, this Pokémon also does ${f.tailsSelf} damage to itself.` : ''),
	coinShuffleTarget: () => 'Flip a coin. If heads, the Defending Pokémon and all cards attached to it are shuffled into its owner\'s deck.',
	status: f => (f.coin ? 'Flip a coin. If heads, the' : 'The') + ` Defending Pokémon is now ${f.s[0].toUpperCase() + f.s.slice(1)}.` + (f.n ? ` Do ${f.n} damage to it instead of the usual amount for this Special Condition.` : ''),
	coinNothing: () => 'Flip a coin. If tails, this attack does nothing.',
	heal: f => `Heal ${f.n} damage from this Pokémon.`,
	healDealt: () => 'Heal from this Pokémon the same amount of damage you did to the Defending Pokémon.',
	extraEnergyBonus: f => `If this Pokémon has at least ${f.need} extra ${E(f.type)} Energy attached, this attack does ${f.bonus} more damage.`,
	selfDamagedBonus: f => `If this Pokémon has damage on it, this attack does ${f.bonus} more damage.`,
	targetDamagedBonus: f => `If the Defending Pokémon has damage on it, this attack does ${f.bonus} more damage.`,
	targetPoisonedBonus: f => `If the Defending Pokémon is Poisoned, this attack does ${f.bonus} more damage.`,
	benchFromDeck: f => `Put 1 random ${f.name} from your deck onto your Bench.`,
	typeToHand: f => `Put 1 random ${E(f.type)} Pokémon from your deck into your hand.`,
	switchTarget: () => "The Defending Pokémon's owner switches it with one of their Benched Pokémon of their choice. It keeps the same Active slot.",
	switchSelf: () => 'Switch this Pokémon with 1 of your Benched Pokémon. It keeps the same Active slot.',
	attachZone: f => (f.to === 'bench' ? `Take ${f.n} ${E(f.type)} Energy from your Energy Zone and attach it to 1 of your Benched Pokémon.` : f.to === 'self' ? `Take ${f.a ? 'a' : '1'} ${E(f.type)} Energy from your Energy Zone and attach it to this Pokémon.` : `Take a ${E(f.type)} Energy from your Energy Zone and attach it to 1 of your Benched ${E(f.type)} Pokémon.`),
	selfDamage: f => `This Pokémon also does ${f.n} damage to itself.`,
	benchSplash: f => `This attack also does ${f.n} damage to each Benched Pokémon of the Defending Pokémon's owner.`,
	ownBenchDamage: f => `This attack also does ${f.n} damage to 1 of your Benched Pokémon.`,
	perTargetEnergy: f => `This attack does ${f.n} more damage for each Energy attached to the Defending Pokémon.`,
	perBench: f => `This attack does ${f.n} damage for each of your Benched ${f.type ? E(f.type) + ' ' : ''}Pokémon.`,
	perBenchName: f => `This attack does ${f.n} more damage for each of your Benched ${f.name}.`,
	snipe: f => (f.zone === 'bench' ? `This attack does ${f.n} damage to 1 Benched Pokémon of any opponent.` : `This attack does ${f.n} damage to 1 Pokémon of any opponent.`),
	revealHand: () => "The Defending Pokémon's owner reveals their hand to you.",
	noSupporter: () => "The Defending Pokémon's owner can't use any Supporter cards from their hand during their next turn.",
	// Mythical Island (A1a)
	coinsPerEnergy: f => `Flip a coin for each Energy attached to this Pokémon. This attack does ${f.per} damage for each heads.`,
	discardRandomAny: () => 'Discard a random Energy from among the Energy attached to all Pokémon in play (yours and every opponent\'s).',
	perOppBench: f => `This attack does ${f.n} more damage for each Benched Pokémon of the Defending Pokémon's owner.`,
	healAllOwn: f => `Heal ${f.n} damage from each of your Pokémon.`,
	revengeBonus: f => `If any of your Pokémon were Knocked Out by damage from an attack since your last turn, this attack does ${f.bonus} more damage.`,
	smokescreen: () => "During its owner's next turn, if the Defending Pokémon tries to use an attack, its owner flips a coin. If tails, that attack doesn't happen.",
	targetExBonus: f => `If the Defending Pokémon is a Pokémon {ex}, this attack does ${f.bonus} more damage.`,
	mimicHand: () => "Shuffle your hand into your deck. Draw a card for each card in the hand of the Defending Pokémon's owner.",
	// Space-Time Smackdown (A2)
	discardSelfRandom: f => (f.n ? `Discard ${f.n} random Energy from this Pokémon.` : 'Discard a random Energy from this Pokémon.'),
	selfCantUse: f => `During your next turn, this Pokémon can't use ${f.name}.`,
	selfCantAttack: f => (f.tails ? "Flip a coin. If tails, during your next turn, this Pokémon can't attack." : "During your next turn, this Pokémon can't attack."),
	selfNextBoost: f => `During your next turn, this Pokémon's ${f.name} attack does +${f.n} damage.`,
	alsoBench: f => `This attack also does ${f.n} damage to 1 Benched Pokémon of any opponent.`,
	targetTypeBonus: f => `If the Defending Pokémon is a ${E(f.type)} Pokémon, this attack does ${f.bonus} more damage.`,
	attachZoneEach: f => `Choose ${f.n} of your Benched Pokémon. For each of those Pokémon, take a ${E(f.type)} Energy from your Energy Zone and attach it to that Pokémon.`,
	selfToolBonus: f => `If this Pokémon has a Pokémon Tool attached, this attack does ${f.bonus} more damage.`,
	targetToolBonus: f => `If the Defending Pokémon has a Pokémon Tool attached, this attack does ${f.bonus} more damage.`,
	attachZoneNamed: f => `Take a ${E(f.type)} Energy from your Energy Zone and attach it to ${list(f.names)}.`,
	needBench: f => `You can use this attack only if you have ${f.names.join(' and ')} on your Bench.`,
	millSelf: f => `Discard the top ${f.n} cards of your deck.`,
	coinsBonusEach: f => `Flip ${f.coins} coins. This attack does ${f.bonus} more damage for each heads.`,
	coinsUntilTailsBonus: f => `Flip a coin until you get tails. This attack does ${f.bonus} more damage for each heads.`,
	koRecoil: f => `If the Defending Pokémon is Knocked Out by damage from this attack, this Pokémon also does ${f.n} damage to itself.`,
	allOppDamage: f => `Choose an opponent (by targeting one of their Active Pokémon). This attack does ${f.n} damage to each of that player's Pokémon.`,
	headsStatus: f => `If at least ${f.need} of them are heads, the Defending Pokémon is now ${f.s[0].toUpperCase() + f.s.slice(1)}.`,
	coinsPerPokemon: f => `Flip a coin for each Pokémon you have in play. This attack does ${f.per} damage for each heads.`,
	randomNextEnergy: () => "Change the type of the next Energy that will be generated for the Defending Pokémon's owner to 1 of the following at random: {G}, {R}, {W}, {L}, {P}, {F}, {D}, or {M}.",
	discardTargetTools: () => 'Before doing damage, discard all Pokémon Tools from the Defending Pokémon.',
	halveTarget: () => "Halve the Defending Pokémon's remaining HP, rounded down.",
	handToDeck: () => "The Defending Pokémon's owner reveals their hand to you. Choose a card you find there and shuffle it into that player's deck.",
	selfDamageBonus: () => 'This attack does more damage equal to the damage this Pokémon has on it.',
	coinBounceTarget: () => "Flip a coin. If heads, the Defending Pokémon is put into its owner's hand.",
	// Triumphant Light (A2a)
	coinHandToDeck: () => "Flip a coin. If heads, the Defending Pokémon's owner reveals a random card from their hand and shuffles it into their deck.",
	selfStatus: f => `This Pokémon is now ${f.s[0].toUpperCase() + f.s.slice(1)}.`,
	perOwnBench: f => `This attack does ${f.n} more damage for each of your Benched Pokémon.`,
};
const ADAPT_ABILITY = {
	healAll: f => `Once during your turn, you may heal ${f.n} damage from each of your Pokémon.`,
	pullBenchBasic: () => "If this Pokémon is in an Active slot, once during your turn, you may choose an opponent, one of their Active Pokémon and one of their Benched Basic Pokémon: those two switch places.",
	counter: f => `If this Pokémon is in an Active slot and is damaged by an attack from an opposing Pokémon, do ${f.n} damage to the Attacking Pokémon.`,
	reduce: f => `This Pokémon takes -${f.n} damage from attacks.`,
	ping: f => (f.need ? `Once during your turn, if you have ${list(f.need)} in play, you may do ${f.n} damage to an opposing Active Pokémon of your choice.` : `Once during your turn, you may do ${f.n} damage to 1 Pokémon of any opponent.`),
	attachZoneSelf: f => `Once during your turn, you may take a ${E(f.type)} Energy from your Energy Zone and attach it to this Pokémon.`,
	blockSupporters: () => "As long as this Pokémon is in an Active slot, your opponents can't use any Supporter cards from their hands.",
	coinSleep: () => 'Once during your turn, you may flip a coin. If heads, an opposing Active Pokémon of your choice is now Asleep.',
	attachZoneActiveType: f => `Once during your turn, you may take 1 ${E(f.type)} Energy from your Energy Zone and attach it to one of your ${E(f.type)} Pokémon in an Active slot.`,
	poisonActive: () => 'Once during your turn, if this Pokémon is in an Active slot, you may make an opposing Active Pokémon of your choice Poisoned.',
	driveOff: () => 'Once during your turn, you may choose an opposing Active Pokémon. Its owner switches it with one of their Benched Pokémon of their choice.',
	peekTop: () => 'Once during your turn, you may look at the top card of your deck.',
	// Mythical Island (A1a)
	doubleEnergy: f => `Each ${E(f.type)} Energy attached to your ${E(f.type)} Pokémon provides 2 ${E(f.type)} Energy. This effect doesn't stack.`,
	moveEnergy: f => `As often as you like during your turn, you may move a ${E(f.type)} Energy from 1 of your Benched ${E(f.type)} Pokémon to one of your ${E(f.type)} Pokémon in an Active slot.`,
	blockEvolveActive: () => "Your opponents can't play any Pokémon from their hands to evolve their Active Pokémon.",
	// Space-Time Smackdown (A2)
	reduceFrom: f => `This Pokémon takes -${f.n} damage from attacks from ${f.types.map(E).join(' or ')} Pokémon.`,
	immuneEffects: () => 'Prevent all effects of attacks used by opposing Pokémon done to this Pokémon.',
	takeDamage: () => 'As often as you like during your turn, you may choose 1 of your Pokémon that has damage on it, and move all of its damage to this Pokémon.',
	freeRetreat: () => 'If this Pokémon has any Energy attached, it has no Retreat Cost.',
	coach: f => `Attacks used by your ${E(f.type)} Pokémon do +${f.n} damage to opposing Active Pokémon.`,
	attachPing: f => `Whenever you attach a ${E(f.type)} Energy from your Energy Zone to this Pokémon, do ${f.n} damage to an opposing Active Pokémon of your choice.`,
	coinReduce: f => `If any damage is done to this Pokémon by attacks, flip a coin. If heads, this Pokémon takes -${f.n} damage from that attack.`,
	discardDraw: () => 'You must discard a card from your hand in order to use this Ability. Once during your turn, you may draw a card.',
	// Triumphant Light (A2a)
	linkBoost: f => `If you have ${list(f.names)} in play, attacks used by this Pokémon do +${f.n} damage to opposing Active Pokémon.`,
	linkFreeRetreat: f => `If you have ${list(f.names)} in play, this Pokémon has no Retreat Cost.`,
	linkCostLess: f => `If you have ${list(f.names)} in play, attacks used by this Pokémon cost ${f.n} less {C} Energy.`,
	linkReduce: f => `If you have ${list(f.names)} in play, this Pokémon takes -${f.n} damage from attacks.`,
	attachZoneAnyType: f => `Once during your turn, if this Pokémon is in an Active slot, you may take a ${E(f.type)} Energy from your Energy Zone and attach it to 1 of your ${E(f.type)} Pokémon.`,
	checkupPing: f => `During Pokémon Checkup, if this Pokémon is in an Active slot, do ${f.n} damage to the first opposing Active Pokémon in turn order.`,
	peekAny: () => "Once during your turn, you may choose any player. Look at the top card of that player's deck.",
	benchRetreatLess: f => `As long as this Pokémon is on your Bench, the Retreat Cost of your Basic Pokémon in an Active slot is ${f.n} less.`,
	noStatus: () => "This Pokémon can't be affected by any Special Conditions.",
};
const ADAPT_TRAINER = {
	fossil: f => `Play this card as if it were a ${f.hp}-HP Basic {C} Pokémon. At any time during your turn, you may discard this card from play. This card can't retreat.`,
	healOne: f => `Heal ${f.n} damage from 1 of your ${f.type ? E(f.type) + ' ' : ''}Pokémon.`,
	flipAttach: f => `Choose 1 of your ${E(f.type)} Pokémon, and flip a coin until you get tails. For each heads, take a ${E(f.type)} Energy from your Energy Zone and attach it to that Pokémon.`,
	boost: f => `During this turn, attacks used by your ${f.names ? list(f.names) : 'Pokémon'} do +${f.n} damage to opposing Active Pokémon.`,
	returnActive: f => `Put your ${list(f.names)} in an Active slot into your hand.`,
	attachNamed: f => `Take 1 ${E(f.type)} Energy from your Energy Zone and attach it to your ${list(f.names)}.`,
	driveOff: () => 'Choose an opposing Active Pokémon. Its owner switches it with one of their Benched Pokémon of their choice. It keeps the same Active slot.',
	gatherEnergy: f => `Move all ${E(f.type)} Energy from your Benched Pokémon to your ${list(f.names)} in an Active slot.`,
	retreatLess: f => `During this turn, the Retreat Cost of your Active Pokémon is ${f.n} less.`,
	revealHand: () => 'Choose an opponent. That player reveals their hand to you.',
	peekTop: f => `Look at the top ${f.n} cards of your deck.`,
	basicToHand: () => 'Put a random Basic Pokémon from your deck into your hand.',
	redCard: f => `Choose an opponent. That player shuffles their hand into their deck and draws ${f.n} cards.`,
	draw: f => `Draw ${f.n} cards.`,
	// Mythical Island (A1a)
	fluteBench: () => "Choose an opponent. Put a Basic Pokémon of your choice from that player's discard pile onto their Bench.",
	slab: f => `Look at the top card of your deck. If that card is a ${E(f.type)} Pokémon, put it into your hand. If it is not a ${E(f.type)} Pokémon, put it on the bottom of your deck.`,
	guard: f => `Until your next turn, all of your ${f.type ? E(f.type) + ' ' : ''}Pokémon take -${f.n} damage from attacks from opposing Pokémon.`,
	// Space-Time Smackdown (A2)
	swapPokemon: () => 'Choose a Pokémon in your hand and switch it with a random Pokémon in your deck.',
	toolHp: f => `The Pokémon this card is attached to gets +${f.n} HP.`,
	toolCounter: f => `If the Pokémon this card is attached to is in an Active slot and is damaged by an attack from an opposing Pokémon, do ${f.n} damage to the Attacking Pokémon.`,
	toolCure: () => 'At the end of each turn, if the Pokémon this card is attached to is affected by any Special Conditions, it recovers from all of them, and discard this card.',
	pullDamaged: () => "Choose an opponent, one of their Benched Pokémon that has damage on it, and one of their Active Pokémon: those two switch places.",
	namedToHand: f => `Put 1 random ${f.names.length > 2 ? f.names.slice(0, -1).join(', ') + ', or ' + f.names[f.names.length - 1] : list(f.names)} from your deck into your hand.`,
	attachDiscard: f => `Choose 1 of your ${list(f.names)}. Attach ${f.n} ${E(f.type)} Energy from your discard pile to that Pokémon.`,
	moveEnergyAny: () => 'Move an Energy from 1 of your Benched Pokémon to one of your Pokémon in an Active slot.',
	mars: () => 'Choose an opponent. That player shuffles their hand into their deck and draws a card for each of their remaining points needed to win.',
	// Triumphant Light (A2a)
	healWithEnergy: f => `Heal ${f.n} damage from each of your Pokémon that has any ${E(f.type)} Energy attached.`,
	basicFromDiscard: () => 'Put 1 random Basic Pokémon from your discard pile into your hand.',
	costLess: f => `During this turn, attacks used by your ${f.names.length > 2 ? f.names.slice(0, -1).join(', ') + ', and ' + f.names[f.names.length - 1] : f.names.join(' and ')} cost ${f.n} less {C} Energy.`,
};

// what an attack is aimed at: 'oppActive' (one opposing Active), 'oppBench', 'oppAny', or 'none' (nothing to aim)
const NEEDS_OPP = new Set(['randomHits', 'copyAttack', 'discardTargetEnergy', 'targetCantAttack', 'targetCantRetreat', 'targetAttackMinus', 'coinDiscardHand', 'coinShuffleTarget', 'status', 'healDealt', 'switchTarget', 'benchSplash', 'noSupporter', 'revealHand', 'smokescreen', 'mimicHand', 'perOppBench', 'targetExBonus', 'allOppDamage', 'halveTarget', 'randomNextEnergy', 'handToDeck', 'coinBounceTarget', 'discardTargetTools', 'headsStatus', 'targetTypeBonus', 'targetToolBonus', 'koRecoil', 'coinHandToDeck']);
const targetOf = (damage, fx) => {
	const sn = fx.find(f => f.k === 'snipe'); if (sn) return sn.zone === 'bench' ? 'oppBench' : 'oppAny';
	if (damage > 0 || fx.some(f => NEEDS_OPP.has(f.k) || /^coins?(Mul|UntilTails|AllBonus|Bonus|PerPokemon|PerEnergy)|perBench$|perTargetEnergy/.test(f.k))) return 'oppActive';
	return 'none';
};

// ---- build -------------------------------------------------------------------------------------------------------
const STAGE = { Basic: 0, Stage1: 1, Stage2: 2 };
// one name, several forms in the games: the card's own type says which (a Fighting-type Wormadam is the Sandy Cloak)
const FORM_BY_CARD_TYPE = { Wormadam: { Fighting: 'Wormadam-Sandy', Metal: 'Wormadam-Trash' } };
const review = [], cards = [], byKey = new Map();
for (const c of SRC) {
	let def;
	if (c.category === 'Pokemon') {
		const base = c.name.replace(/\s+ex$/, ''), sp = SP_BY[norm((FORM_BY_CARD_TYPE[base] || {})[c.types[0]] || '')] || SP_BY[norm(base)] || SP_BY[norm(base.replace(/^(\w+) Rotom$/, 'Rotom-$1'))] || SP_BY[norm(base.replace(/^Origin Forme (\w+)$/, '$1-Origin'))] || SP_BY[norm(base.replace(/^Origin Forme /, ''))];   // (this site has no Origin Forme Dialga or Palkia: the same types, the base sprite)   // (the card says "Wash Rotom", the games "Rotom-Wash")
		if (!sp) { if (SURVEY) { gaps.push('no mainline species for ' + c.name); continue; } throw new Error('no mainline species for ' + c.name); }
		let bad = false;
		const attacks = (c.attacks || []).map((a, i) => {
			const mv = MV_BY[norm(a.name)], ex = ATTACK_TYPE[a.name];
			if (!mv && !ex) { if (SURVEY) { gaps.push(`no Combat Type for the attack "${a.name}" (${c.name})`); bad = true; return null; } throw new Error(`no Combat Type for the attack "${a.name}" (${c.name}): add it to ATTACK_TYPE`); }
			const [combatType, basis, why] = mv ? [mv.type, 'move', `the mainline move ${mv.name}`] : [ex[0], ex[1], ex[2] || 'its name'];
			const dm = /^(\d+)([+×x]?)$/.exec(String(a.damage ?? '').trim()) || [null, '0', ''];
			const fx = a.effect ? read(ATTACK_FX, a.effect, `attack effect (${c.name}: ${a.name})`) : [];
			if (!fx) { bad = true; return null; }
			const damage = +dm[1];
			review.push([a.name, c.name, combatType, basis, why]);
			return { name: a.name, combatType, typeBasis: basis, cost: (a.cost || []).map(en), damage, damageMode: dm[2] === '+' ? '+' : dm[2] ? 'x' : '', fx, target: targetOf(damage, fx),
				text: a.effect || '', adapted: fx.map(f => ADAPT_ATTACK[f.k](f)).join(' '), note: noteFor(fx.map(f => f.k), a.effect, fx.map(f => ADAPT_ATTACK[f.k](f)).join(' ')) };
		});
		const ab = (c.abilities || [])[0];
		const afx = ab ? read(ABILITY_FX, ab.effect, `ability (${c.name}: ${ab.name})`) : null;
		if (bad || (ab && !afx)) continue;
		def = { name: c.name, kind: 'pokemon', cardType: c.types[0], combatTypes: sp.types.slice(0, 2), hp: c.hp, stage: STAGE[c.stage], evolvesFrom: c.evolveFrom || null, ex: /\sex$/.test(c.name),
			retreat: c.retreat || 0, weakness: (c.weaknesses || [])[0]?.type || null, points: /\sex$/.test(c.name) ? 2 : 1, attacks,
			ability: ab ? { name: ab.name, fx: afx, text: ab.effect, adapted: ADAPT_ABILITY[afx.k](afx), note: noteFor(['AB:' + afx.k], ab.effect, ADAPT_ABILITY[afx.k](afx)) } : null, dex: (c.dexId || [])[0] || null, ...(sp.sprite && (c.dexId || [])[0] && sp.sprite !== `s${(c.dexId || [])[0] * 32}.png` ? { sprite: sp.sprite } : {}) };   // (a form names its own sprite: Wash Rotom is not drawn as Rotom)
	} else {
		const fx = read(TRAINER_FX, c.effect, `Trainer (${c.name})`);
		if (!fx) continue;
		def = { name: c.name, kind: c.trainerType === 'Supporter' ? 'supporter' : c.trainerType === 'Tool' ? 'tool' : 'item', fx, text: c.effect, adapted: ADAPT_TRAINER[fx.k](fx), note: noteFor(['TR:' + fx.k], c.effect, ADAPT_TRAINER[fx.k](fx)) };
		// a fossil is played as a Pokémon: Colorless on the card; in combat it is Rock (a fossil; reviewable)
		if (fx.k === 'fossil') Object.assign(def, { cardType: 'Colorless', combatTypes: ['Rock'], hp: fx.hp, stage: 0, evolvesFrom: null, ex: false, retreat: 0, weakness: null, points: 1, attacks: [], ability: null, fossil: true });
	}
	// alternate art of the same gameplay card: one definition, its printings listed
	const key = JSON.stringify(def).replace(/\{ex\}/g, 'ex');   // (printings that differ only in how they write "ex" are one card)
	if (byKey.has(key)) { byKey.get(key).printings.push(c.id); continue; }
	const full = { id: c.id, set: setOf(c.id), rarity: c.rarity || null, ...def, printings: [c.id] };
	byKey.set(key, full); cards.push(full);
}
for (const c of cards) (c.attacks || []).forEach((a, i) => { a.id = c.id + ':' + (i + 1); });

const js = `// GENERATED by tools/gen_pocket_cards.mjs from pocketenhanced/data/source/tcgdex_a1.json — do not edit.
// Genetic Apex (A1) and the Promo-A starter Trainers. \`text\` is the card as printed; \`adapted\` is how it plays
// here (2-4 players, two Active Pokémon); \`fx\` is what the engine runs. Card definitions are frozen.
const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
export const CARDS = deepFreeze(${JSON.stringify(cards, null, '\t')});
export const CARD_BY_ID = Object.freeze(Object.fromEntries(CARDS.flatMap(c => c.printings.map(p => [p, c]))));
export const card = id => CARD_BY_ID[id] || null;
`;
const seenRev = new Set();
const rows = review.filter(r => { const k = r[0] + '|' + r[2]; if (seenRev.has(k)) return false; seenRev.add(k); return true; }).sort((a, b) => a[0].localeCompare(b[0]));
const md = `# Attack Combat Types — review list

GENERATED by \`tools/gen_pocket_cards.mjs\`. Every attack's Combat Type and where it comes from.

* **move** — a mainline Pokémon move has this name; its type is used.
* **named** — Pocket-only, but the name says its element or it is plainly a known move's kin.
* **judgement** — Pocket-only and a call was made. **Review these.** To change one, edit \`ATTACK_TYPE\` in the tool.

A fossil (Helix Fossil, Dome Fossil, Old Amber) is Colorless on the card and **Rock** in combat (judgement).

## To review (${rows.filter(r => r[3] === 'judgement').length})

| Attack | Used by | Combat Type | Why |
|---|---|---|---|
${rows.filter(r => r[3] === 'judgement').map(r => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[4]} |`).join('\n')}

## Named (${rows.filter(r => r[3] === 'named').length})

| Attack | Used by | Combat Type | Why |
|---|---|---|---|
${rows.filter(r => r[3] === 'named').map(r => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[4]} |`).join('\n')}

## From a mainline move (${rows.filter(r => r[3] === 'move').length})

| Attack | Used by | Combat Type |
|---|---|---|
${rows.filter(r => r[3] === 'move').map(r => `| ${r[0]} | ${r[1]} | ${r[2]} |`).join('\n')}
`;
// every printing, for the pack opener: which card it is, how rare, and which of the set's three boosters hold it
const BOOSTER = { Charizard: 'C', Mewtwo: 'M', Pikachu: 'P', Dialga: 'D', Palkia: 'K' };
const RARE = { 'One Diamond': '1D', 'Two Diamond': '2D', 'Three Diamond': '3D', 'Four Diamond': '4D', 'One Star': '1S', 'Two Star': '2S', 'Three Star': '3S', Crown: 'CR' };
// the source lists no rarity for these two printings (Wigglytuff ex, full art and rainbow). Their numbers sit inside the set's
// two-star run (A1-251 to A1-280), so they are two-star here. Remove a line when the source gains the field.
const RARITY_GAP = { 'A1-265': 'Two Star', 'A1-279': 'Two Star' };
const srcById = new Map(SRC.map(c => [c.id, c]));
const prints = cards.flatMap(c => c.printings.map(p => { const x = srcById.get(p); return [p, c.id, RARE[RARITY_GAP[p] || x.rarity] || 'N', setOf(p) === 'A1a' ? 'W' : setOf(p) === 'A2a' ? 'A' : (x.boosters || []).map(b => BOOSTER[b.name]).sort().join('')]; }));
const packsJs = `// GENERATED by tools/gen_pocket_cards.mjs from pocketenhanced/data/source/tcgdex_a1.json — do not edit.
// Every printing of Genetic Apex and Promo-A: [printing id, the card it plays as (cards.js), rarity, boosters].
// Rarity: 1D-4D diamonds, 1S-3S stars, CR crown, N none (promo). Boosters: C Charizard, M Mewtwo, P Pikachu (Genetic Apex),
// W Mew (Mythical Island: the set has one booster, so its source lists none per card); D Dialga, K Palkia (Space-Time
// Smackdown); A Arceus (Triumphant Light, one booster); '' = in no pack.
export const PRINTS = Object.freeze(${JSON.stringify(prints)}.map(Object.freeze));
`;
if (SURVEY) { console.log([...new Set(gaps)].join('\n')); console.log(`${new Set(gaps).size} gaps`); process.exit(0); }
const outs = [['pocketenhanced/js/data/cards.js', js], ['pocketenhanced/js/data/packs.js', packsJs], ['pocketenhanced/data/ATTACK_TYPE_REVIEW.md', md]];
let stale = false;
for (const [rel, text] of outs) {
	const p = path.join(ROOT, rel), have = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : null;
	if (have === text) continue;
	stale = true;
	if (!CHECK) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); }
}
const pk = cards.filter(c => c.kind === 'pokemon');
console.log(`pocket cards: ${cards.length} unique (${pk.length} Pokémon, ${cards.filter(c => c.kind === 'item').length} Items, ${cards.filter(c => c.kind === 'supporter').length} Supporters) from ${SRC.length} printings; ` +
	`attacks ${pk.reduce((a, c) => a + c.attacks.length, 0)} (${rows.filter(r => r[3] === 'judgement').length} Combat Types to review)`);
if (CHECK && stale) { console.log('the committed card files are out of date: node tools/gen_pocket_cards.mjs'); process.exit(1); }
