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
//     "decided" (the name does not settle it, so a call was made, by the rule written beside it). The review file lists all of them.
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
// the sets, in release order: Genetic Apex (with the Promo-A starter Trainers), Mythical Island, Space-Time Smackdown, Triumphant Light, Shining Revelry, Celestial Guardians, Extradimensional Crisis, Eevee Grove, Wisdom of Sea and Sky, Secluded Springs, Deluxe Pack ex (from the second source: tools/pocket_fetch_alt.mjs), Mega Rising, Crimson Blaze, Fantastical Parade, Paldean Wonders
const SOURCES = ['tcgdex_a1.json', 'tcgdex_a1a.json', 'tcgdex_a2.json', 'tcgdex_a2a.json', 'tcgdex_a2b.json', 'tcgdex_a3.json', 'tcgdex_a3a.json', 'tcgdex_a3b.json', 'tcgdex_a4.json', 'tcgdex_a4a.json', 'alt_a4b.json', 'tcgdex_b1.json', 'tcgdex_b1a.json', 'tcgdex_b2.json', 'tcgdex_b2a.json', 'alt_b2b.json', 'alt_b3.json', 'alt_b3a.json'];
const SRC = SOURCES.flatMap(f => JSON.parse(fs.readFileSync(path.join(ROOT, 'pocketenhanced/data/source', f), 'utf8')).cards);
const setOf = id => id.slice(0, id.lastIndexOf('-'));
// Two gaps in some records, filled from the record itself or from the card's other printings (never from outside the source):
//  - a Pokémon ex whose name has lost its " ex" still says so in its `suffix`;
//  - an evolved Pokémon with no `evolveFrom` evolves from what another printing of that same card names.
for (const c of SRC) if (c.suffix === 'EX' && c.category === 'Pokemon' && !/\sex$/.test(c.name)) c.name += ' ex';
//  - two attack texts the first source garbled are written as printed (the second source has them); nothing about how they play changes
for (const c of SRC) for (const a of c.attacks || []) {
	if (a.name === 'Mega Burning' && /^Discard Fire\{R\} Energy/.test(a.effect || '')) a.effect = a.effect.replace(/^Discard Fire\{R\} Energy/, 'Discard a {R} Energy');
	if (a.name === 'Adamantine Rolling' && /takes\s+damage from attacks/.test(a.effect || '')) a.effect = a.effect.replace(/takes\s+damage from attacks/, 'takes -20 damage from attacks');
}
// Four records the first source has wrong (the second source, checked against a third, has the printed card; the owner
// confirmed each). The card is corrected, and what it was is kept beside it (`costWas`, `damageWas`, `toWas`): a match
// recorded before rules revision 5 replays with the old value.
const CORRECT = {
	'A1-055': { attack: 'Hydro Pump', cost: ['Water', 'Water', 'Colorless'] },
	'A1-071': { attack: 'Water Arrow', cost: ['Water', 'Water', 'Water'] },
	'A1-112': { attack: 'Thunder Shock', damage: 30 },
	'A2b-025': { attack: 'Plasma', effect: 'Take a {L} Energy from your Energy Zone and attach it to 1 of your Benched {L} Pokémon.', toWas: 'bench' },
	'A2b-103': { attack: 'Plasma', effect: 'Take a {L} Energy from your Energy Zone and attach it to 1 of your Benched {L} Pokémon.', toWas: 'bench' },
};
for (const c of SRC) { const fix = CORRECT[c.id]; if (!fix) continue; const a = (c.attacks || []).find(x => x.name === fix.attack); if (!a) throw new Error('nothing to correct on ' + c.id);
	if (fix.cost) { a.costWas = a.cost; a.cost = fix.cost; } if (fix.damage != null) { a.damageWas = +a.damage; a.damage = fix.damage; } if (fix.effect) { a.effect = fix.effect; a.toWas = fix.toWas; } }
for (const c of SRC) if (c.category === 'Pokemon' && c.stage && c.stage !== 'Basic' && !c.evolveFrom) { const o = SRC.find(x => x !== c && x.name === c.name && x.stage === c.stage && x.evolveFrom); if (o) c.evolveFrom = o.evolveFrom; }
const SPECIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_battle.json'), 'utf8'));
const MOVES = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/moves_battle.json'), 'utf8'));
const norm = s => String(s).toLowerCase().replace(/♀/g, 'f').replace(/♂/g, 'm').replace(/é/g, 'e').replace(/[^a-z0-9]/g, '');
const SP_BY = {}; for (const [k, v] of Object.entries(SPECIES)) { SP_BY[norm(k)] = v; if (v.name) SP_BY[norm(v.name)] = v; }
const MV_BY = {}; for (const [k, v] of Object.entries(MOVES)) { MV_BY[norm(v.name || k)] = v; }

// ---- Pocket-only attacks: their Combat Type, and how sure it is -------------------------------------------------
const N = 'named', J = 'decided';
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
	// Shining Revelry (A2b)
	'Carefree Press': ['Normal', J, "Bibarel's"], 'Chaotic Impact': ['Ghost', J, "Giratina's"], 'Chest-ouflage': ['Ghost', J, "Gimmighoul's"], 'Crushing Spear': ['Bug', J, "Beedrill's"], 'Cry for Help': ['Normal', J, "Sprigatito's; no damage"],
	'Electric Punch': ['Electric', N, 'Thunder Punch'], 'Fighting Claws': ['Fighting', N], 'Guillotine Rush': ['Normal', N, 'Guillotine'], 'Hopping Shot': ['Normal', J, "Lopunny's"], 'Juggling': ['Psychic', J, "Mr. Mime's"],
	'Magnum Punch': ['Fighting', N, 'Mach Punch'], 'Multiply': ['Bug', J, "Weedle's; no damage"], 'Ocean Cyclone': ['Water', N], 'Overacceleration': ['Normal', J, "Cyclizar's"], 'Plasma': ['Electric', N],
	'Pop Out Throughout': ['Water', J, "Wugtrio's"], 'Power Press': ['Fighting', J, "Machamp's"], 'Psychic Suppression': ['Psychic', N], 'Pummel': ['Fighting', J, "Machoke's"], 'Scintillating Surfing': ['Steel', J, "Gholdengo's; Make It Rain"],
	'Smoke Bomb': ['Fire', J, "Magmortar's"], 'Spinning Drift': ['Steel', J, "Revavroom's"], 'Spring Out': ['Water', J, "Wiglett's"], 'Steam Artillery': ['Fire', J, "Charizard's"], 'Tenacious Hammer': ['Steel', J, "Tinkatuff's"],
	'Terrific Thumping': ['Steel', J, "Tinkaton's; Gigaton Hammer"], 'Tumbling Attack': ['Normal', J, "Electrode's"], 'Venomous Fang': ['Poison', N, 'Poison Fang'], 'Blaze Tackle': ['Fire', N],
	// Celestial Guardians (A3)
	'Barrier Shove': ['Psychic', N, 'Barrier'], 'Berserk': ['Dragon', J, "Drampa's own"], 'Blood Fang': ['Dark', J, "Lycanroc's; a bite, like Crunch"], 'Claw Slash': ['Ghost', J, "Trevenant's own; Shadow Claw"], 'Dangerous Claws': ['Bug', J, "Araquanid's own"],
	'Dazzle Dance': ['Psychic', J, "the Pa'u Style Oricorio's own"], 'Disconnect': ['Electric', J, "Vikavolt's own"], 'Double Spin': ['Normal', J, 'Rapid Spin'], 'Electrosmash': ['Electric', N], 'Energy Arrow': ['Psychic', J, "Tapu Lele's own"],
	'Energy Assist': ['Normal', J, "Delcatty's; Helping Hand"], 'Fire Wing': ['Fire', N], 'Flickering Light': ['Fairy', J, "Shiinotic's own; Dazzling Gleam"], 'Heated Poison': ['Poison', N], 'Hook': ['Normal', J, 'used by Phantump and Dewpider: a plain strike'],
	'Insatiable Striking': ['Fighting', J, "Crabominable's own; its punches"], 'Justified Press': ['Fighting', J, "Hawlucha's own; Flying Press is Fighting"], 'Kindle': ['Fire', N], 'Lunar Blast': ['Ghost', J, "Lunala's own; Moongeist Beam"], 'Moon Press': ['Psychic', J, "Lunatone's own"],
	'Night Bind': ['Ghost', J, "Banette's own"], 'Pierce the Pain': ['Ghost', J, "Decidueye's own; Spirit Shackle"], 'Pike': ['Steel', J, "Escavalier's own; its lances"], "Primate's Trap": ['Psychic', J, "Oranguru's own"], 'Psycharge': ['Psychic', N],
	'Push Out': ['Fighting', J, "Hariyama's own; Arm Thrust"], 'Razor Wing': ['Flying', N, 'Wing Attack'], 'Rear Kick': ['Fighting', J, 'used by Heliolisk and Mudbray: Double Kick'], 'Scar-Charged Smash': ['Dark', J, "Incineroar's own; Darkest Lariat"], 'School Storm': ['Water', J, "Wishiwashi's own"],
	'Shadow Hit': ['Ghost', N], 'Signs of Evolution': ['Normal', J, "Rockruff's; no damage"], 'Silver Cannon': ['Steel', N, 'Flash Cannon'], 'Slap Push': ['Fighting', J, "Makuhita's own; Arm Thrust"], 'Smash Kick': ['Fighting', J, 'a kick'],
	'Sol Breaker': ['Steel', J, "Solgaleo's own; Sunsteel Strike"], 'Spiral Drain': ['Water', J, "Tapu Fini's own"], 'Spiteful Dance': ['Ghost', J, "the Sensu Style Oricorio's own"], 'Sprinkle Water': ['Water', N], 'Stampede': ['Normal', J, 'used by Morelull and Bounsweet: Stomp'],
	'Star Drop': ['Rock', J, "Minior's own"], 'Steady Firebreathing': ['Fire', N], 'Stiffen': ['Normal', N, 'Harden'], 'Stuck-In Tackle': ['Grass', J, "Tapu Bulu's own; Horn Leech"], 'Super Poison Breath': ['Poison', N],
	'Tantrum': ['Normal', J, "Bewear's; Thrash"], 'Three Kick Combo': ['Fighting', N, 'Triple Kick'], 'Unlock': ['Steel', J, "Klefki's own"], 'Unseen Claw': ['Dark', J, "Absol's own; Night Slash"], 'Vibration': ['Ground', J, "Sandygast's own"],
	'Zzzap': ['Electric', N], 'Burning Bonemerang': ['Fire', N], 'Call Forth Cold': ['Ice', N], 'Chemical Panic': ['Poison', J, "Alolan Muk's own"], 'Scrounge-and-Scarf': ['Dark', J, "Alolan Raticate's own"], 'Sludge Toss': ['Poison', N, 'Sludge'],
	'Spike Armor': ['Steel', J, "Alolan Sandslash's own; its steel spikes"], 'Super Zap Cannon': ['Electric', N, 'Zap Cannon'], 'Tropical Hammer': ['Dragon', J, "Alolan Exeggutor's own; Dragon Hammer"],
	// Extradimensional Crisis (A3a)
	'2-Step': ['Poison', J, "Poipole's own"], 'Beat Punk': ['Fire', J, "Blacephalon's own"], 'Big Beat': ['Fighting', J, "Buzzwole's own"], 'Brass Rock': ['Rock', J, "Stakataka's own"], 'Brave Buddies': ['Normal', J, "Silvally's own; Multi-Attack is Normal"],
	'Electric Ball': ['Electric', N], 'Electro House': ['Dragon', J, "Naganadel's own"], 'Electronica': ['Electric', J, "Xurkitree's own"], 'Grindcore': ['Dark', J, "Guzzlord's own"], 'Happened to Headbutt': ['Normal', N, 'Headbutt'],
	'Jump Blues': ['Bug', J, "Pheromosa's own"], "Let's Throw": ['Fighting', J, "Passimian's own; Fling is Dark, but it throws like Seismic Toss"], 'Lightning Claw': ['Electric', N], 'Lycanfang': ['Rock', J, "Lycanroc's own"], 'Mach Bolt': ['Electric', N],
	'Meddle': ['Dark', J, "Alolan Meowth's own"], 'Moombahton': ['Steel', J, "Celesteela's own"], 'Moon Kick': ['Fairy', J, "Clefable's own; Moonblast"], 'New Wave': ['Poison', J, "Nihilego's own"], 'Plasma Hurricane': ['Electric', N],
	'Poaching Fangs': ['Dark', J, "Krookodile's own; Crunch"], 'Quick Blow': ['Normal', J, 'Quick Attack'], 'Sandy Shot': ['Ground', N], 'Sharp Fang': ['Normal', J, 'Hyper Fang'], 'Sniping Arrow': ['Ghost', J, "Decidueye's own; Spirit Shackle"],
	'Spike Sting': ['Steel', J, "Ferroseed's own; its iron spikes"], 'Static Shock': ['Electric', N], 'Superpowered Hug': ['Fighting', J, "Bewear's own"], 'Thrash Metal': ['Steel', J, "Kartana's own"], 'Trip Over': ['Fighting', J, "Meditite's own"],
	'Triplet Headbutt': ['Normal', N, 'Headbutt'], 'Tyrannical Hole': ['Dark', J, "Guzzlord's own"],
	// Eevee Grove (A3b)
	'Assisting Heater': ['Fire', N], 'Beginning Bolt': ['Electric', N], 'Bristling Spikes': ['Steel', J, "Togedemaru's own; its steel spines"], 'Collect': ['Normal', J, 'it draws a card; no element'], 'Cutting Wind': ['Flying', J, 'Air Cutter'],
	'Dark Binding': ['Dark', N], 'Electric Shock': ['Electric', N], 'Energy Crush': ['Psychic', J, "Espeon's own"], 'Enhanced Fang': ['Normal', J, 'Super Fang'], 'Evoharmony': ['Fairy', J, "Sylveon's own"], 'Flop-Down Punch': ['Normal', J, "Snorlax's own; it flops like Body Slam"],
	'Hard Roll': ['Rock', J, "Carbink's own; Rollout"], 'Hyper Whirlpool': ['Water', N, 'Whirlpool'], 'Ice Blade': ['Ice', N], 'Jolt': ['Electric', N], 'Kick Down': ['Fighting', J, 'a kick'], 'Leaf Blast': ['Grass', N],
	'Playful Knockdown': ['Dark', J, 'Knock Off'], 'Powerful Vise': ['Normal', J, 'Vise Grip'], 'Slashing Claw': ['Normal', J, 'Slash'], 'Sweets Overload': ['Fairy', J, "Alcremie's own; Decorate"], 'Sweets Relay': ['Fairy', J, 'shared by unrelated Pokémon; sweets are Fairy (Decorate, Sweet Kiss)'],
	'Tone-Deaf': ['Normal', J, "Chatot's own; a sound, like Hyper Voice"], 'Try to Imitate': ['Normal', J, 'Mimic'], 'Watering': ['Water', N],
	// Wisdom of Sea and Sky (A4)
	'Attract Smack': ['Normal', J, 'Attract'], 'Bind Down': ['Bug', J, "Ariados's own; it binds with its thread"], 'Buster Tail': ['Dark', J, "Tyranitar's own"], 'Continuous Headbutt': ['Normal', N, 'Headbutt'], 'Crackly Toss': ['Electric', J, "Pichu's own"],
	'Cross-Cut': ['Normal', J, 'Cut'], 'Cure Stream': ['Water', N], 'Dark Cutter': ['Dark', N], 'Destructive Whirlpool': ['Water', N, 'Whirlpool'], 'Diving Swipe': ['Dark', J, "Houndoom's own"], 'Dream Dance': ['Psychic', J, "Musharna's own"],
	'Dynamic Chop': ['Fighting', J, 'a chop, like Karate Chop'], 'Elemental Blast': ['Flying', J, "Lugia's own; Aeroblast"], 'Energy Blow': ['Normal', J, "Blissey's own"], 'Enhanced Horns': ['Normal', J, 'Horn Attack'], 'Feathery Cyclone': ['Flying', J, 'Hurricane'],
	'Flashing Signal': ['Electric', J, "Lanturn's own; its light"], 'Gale Thrust': ['Flying', J, 'a gale'], 'Gear Cutter': ['Steel', J, 'Gear Grind'], 'Gear Spinner': ['Steel', J, 'Gear Grind'], 'Gigantic Press': ['Ground', J, "Donphan's own"],
	'Headbutt Bounce': ['Normal', N, 'Headbutt'], 'Honey Snack': ['Normal', J, "Teddiursa's own"], 'Imitate': ['Normal', J, 'Mimic'], 'Leap Over': ['Dark', J, "Absol's own"], 'Life Drain': ['Psychic', J, "Xatu's own"], 'Live Coal': ['Fire', N],
	'Peck Bugs': ['Flying', N, 'Peck'], 'Phoenix Turbo': ['Fire', J, "Ho-Oh's own; Sacred Fire"], 'Piercing Spin': ['Fighting', J, "Hitmontop's own"], 'Reply Strongly': ['Fighting', J, 'Counter'], 'Roasting Heat': ['Fire', N], 'Scorching Breath': ['Fire', N],
	'Scrunch': ['Normal', J, "Chansey's own"], 'Shell Crash': ['Steel', J, "Forretress's own; its steel shell"], 'Shivery Wave': ['Ice', N], 'Single Lunge': ['Bug', N, 'Lunge'], 'Slappy Knuckle': ['Fighting', J, "Tyrogue's own"], 'Slowing Beam': ['Normal', J, "Porygon-Z's own"],
	'Speed Dive': ['Flying', J, 'a dive from the air'], 'Splashing Dodge': ['Water', J, "Magikarp's own"], 'Splatter Coating': ['Normal', J, "Smeargle's own"], 'Spurt Fire': ['Fire', N], 'Stormy Prison': ['Water', J, "Kingdra's own; a storm at sea"], 'Strong Flare': ['Fire', N],
	'Stumbling Draw': ['Normal', J, 'it draws cards; no element'], 'Sudden Flash': ['Normal', N, 'Flash'], 'Swing Around': ['Normal', J, "Ursaring's own"], 'Tail Smash': ['Normal', J, 'Tail Slap'], 'Toasty Toss': ['Fire', J, "Magby's own"], 'Triple Slap': ['Normal', J, 'Double Slap'],
	'Twinkly Call': ['Fairy', J, "Cleffa's own"], 'Venomous Slash': ['Poison', N], 'Wild Swing': ['Normal', J, 'Thrash'], 'Wild Tackle': ['Normal', N, 'Tackle'], 'Zappy Shot': ['Electric', J, "Elekid's own"],
	// Secluded Springs (A4a)
	'Blazing Beatdown': ['Fire', N], 'Breeze-By Attack': ['Flying', J, 'a breeze'], 'Cliff Crumbler': ['Ground', J, "Dugtrio's own"], 'Crossing Flights': ['Flying', J, 'a flight'], 'Crystal Waltz': ['Water', J, "Suicune's own"], 'Cursed Prose': ['Ghost', J, 'a curse'],
	'Defiant Spark': ['Electric', N, 'Spark'], 'Dragon Arcana': ['Dragon', N], 'Fateful Fang': ['Poison', J, "Seviper's own; Poison Fang"], 'Hydro Knuckle': ['Water', J, 'Hydro'], 'Leek Slam': ['Normal', J, 'Slam'], 'Litter': ['Psychic', J, "Slowking's own"],
	'Melt': ['Poison', J, "Skrelp's own; Acid"], 'Mental Surge': ['Psychic', J, "Malamar's own"], 'Mountain Munch': ['Bug', J, "Durant's own"], 'Rolling Frenzy': ['Rock', J, 'Rollout'], 'Sand Spray': ['Ground', N], 'Sleepy Lullaby': ['Normal', J, 'Sing'],
	'Splashy Toss': ['Water', J, "Mantyke's own"], 'Squishy Healing': ['Normal', J, "Azurill's own"], 'Stretch Tongue': ['Normal', J, "Lickitung's own"], 'Stun Poison': ['Poison', N], 'Temporal Leaves': ['Grass', N], 'Tiny Bolt': ['Electric', N], 'Voltaic Bullet': ['Electric', N],
	// Mega Rising (B1)
	'Ambush': ['Ghost', J, "Duskull's own; Shadow Sneak"], 'Attack the Wound': ['Electric', J, "Pachirisu's own"], 'Balloon Barrage': ['Ghost', J, "Drifblim's own"], 'Bite Together': ['Bug', J, 'Bug Bite'], 'Biting Fang': ['Normal', J, 'Super Fang'], 'Blessed Burn': ['Fire', N],
	'Blocking Shell': ['Rock', J, "Carracosta's own; its shell"], 'Booming Roar': ['Normal', J, 'Boomburst'], 'Boundless Power': ['Normal', J, "Dubwool's own"], 'Cat Kick': ['Fighting', J, 'a kick'], 'Chomp Chomp Bite': ['Dark', N, 'Bite'], 'Coal Drop': ['Rock', J, "Coalossal's own"],
	'Confounding Cologne': ['Fairy', J, "Aromatisse's own"], 'Continuous Tumble': ['Normal', J, "Wooloo's own"], 'Crashing Fangs': ['Ground', J, "Hippowdon's own"], 'Critical Scissors': ['Bug', J, 'X-Scissor'], 'Dangerous Bite': ['Dark', N, 'Bite'], 'Darkness Claw': ['Dark', N],
	'Darmani-Hands': ['Fire', J, "Darmanitan's own"], 'Dig Claws': ['Ground', N, 'Dig'], 'Dirty Throw': ['Dark', J, 'Fling'], 'Dizzying Headbutt': ['Normal', N, 'Headbutt'], 'Draconic Whip': ['Dragon', N], 'Drum Rush': ['Grass', J, 'Drum Beating'], 'Electric Nibbling': ['Electric', N],
	'Evil Admonition': ['Dark', J, 'evil'], 'Excited Tail': ['Normal', J, "Ambipom's own"], 'Flash Impact': ['Electric', J, "Luxray's own"], 'Frost Barrier': ['Ice', N], 'Giga Claw': ['Dragon', J, 'Dragon Claw'], 'Hammering Tail': ['Water', J, 'Aqua Tail'], 'Heavy Rocket': ['Ground', J, "Golurk's own"],
	'Hyper Ray': ['Dragon', J, "Hydreigon's own"], 'Iron Wings': ['Steel', N, 'Steel Wing'], 'Jet Headbutt': ['Normal', N, 'Headbutt'], 'Jingly Noise': ['Psychic', J, "Chingling's own"], 'Last-Chance Punch': ['Fighting', J, 'a punch'], 'Life Sucker': ['Ghost', J, "Palossand's own"],
	'Lightning Lancer': ['Electric', N], 'Mega Blaster': ['Water', J, "Mega Gyarados's own"], 'Mega Burning': ['Fire', N], 'Mega Harmony': ['Fairy', J, "Mega Altaria's own; a song, like Disarming Voice"], 'Nipping Cyclone': ['Flying', J, 'a cyclone'], 'Ominous Claw': ['Dark', J, "Absol's own"],
	'Paired Tackle': ['Normal', N, 'Tackle'], 'Quick Straight': ['Fighting', J, 'a punch'], 'Rhythmic Steps': ['Water', J, "Ludicolo's own"], 'Select Powder': ['Bug', J, "Dustox's own"], 'Shadow Cage': ['Dark', J, "Darkrai's own"], 'Slapping Knockdown': ['Fighting', J, 'Arm Thrust'],
	'Slicing Blade': ['Steel', J, "Aegislash's own"], 'Soul Shot': ['Ghost', J, 'a soul'], 'Speed Wing': ['Flying', N, 'Wing Attack'], 'Split Spiral Punch': ['Fighting', J, 'a punch'], 'Sprinting Flare': ['Fire', N], 'Stellar Cradle': ['Psychic', J, "Gothitelle's own"],
	'Tongue Whip': ['Fire', J, "Heatmor's own; Fire Lash"], 'Waterfall Evolution': ['Water', N, 'Waterfall'], 'Whale Pump': ['Water', J, 'Hydro Pump'], 'Wild Spin': ['Rock', J, "Archeops's own"], 'Wind Blast': ['Flying', J, 'Gust'], 'Zapping Bullet': ['Electric', N],
	// Crimson Blaze (B1a)
	'Adamantine Rolling': ['Steel', J, "Mega Steelix's own"], 'Aqua Shower': ['Water', N], 'Chop': ['Fighting', J, 'Karate Chop'], 'Copy a Friend': ['Normal', J, "Ditto's own; Transform"], 'Critical Bloom': ['Grass', J, "Mega Venusaur's own"], 'Cyberjack': ['Normal', J, "Porygon-Z's own"],
	'Double Splash': ['Water', N], 'Geoburst': ['Fairy', J, "Xerneas's own; Geomancy"], 'Hang Down': ['Bug', J, "Burmy's own"], 'Hurricane Wing': ['Flying', N, 'Hurricane'], 'Lead': ['Ghost', J, "Misdreavus's own"], 'Megaton Slap Push': ['Fighting', J, 'Arm Thrust'],
	'Metal Blast': ['Steel', N], 'Metal Defender': ['Steel', N], 'Perfume Blast': ['Fairy', J, "Aromatisse's own"], 'Quick-Grow Beam': ['Grass', J, 'Solar Beam'], 'Rapid Smashers': ['Fighting', J, "Mega Lopunny's own"], 'Snatch and Flee': ['Dark', N, 'Snatch'],
	'Surprise Strike': ['Water', J, "Basculin's own"], 'Triple Bombardment': ['Water', J, "Mega Blastoise's own"], 'Crimson Dive': ['Fire', J, "Mega Charizard Y's own; Flare Blitz"],
	// Fantastical Parade (B2)
	'Best Punch': ['Normal', J, 'Mega Punch'], 'Binding Snow': ['Ice', N], 'Blow Through': ['Flying', J, 'Gust'], 'Box of Surprises': ['Normal', J, 'Present'], 'Breakcore': ['Dark', J, "Guzzlord's own"], 'Buddy Spark': ['Electric', N, 'Spark'], 'Cavernous Chomp': ['Steel', J, "Mawile's own; its steel jaws"],
	'Chilly': ['Ice', N], 'Crush the Weak': ['Dark', J, "Scrafty's own"], 'Cut Up': ['Steel', J, "Honedge's own"], 'Damaging Spark': ['Electric', N, 'Spark'], 'Double-Punching Family': ['Normal', J, 'Parental Bond'], 'Dragon Dive': ['Dragon', N], 'Dual Blades': ['Steel', J, "Doublade's own"],
	'Electric Tail': ['Electric', N], 'Evil Crash': ['Dark', J, 'evil'], 'Family Beatdown': ['Normal', J, 'Population Bomb'], 'Fantasia Force': ['Fairy', J, "Mega Gardevoir's own"], 'Fasten Claws': ['Dark', J, "Liepard's own"], "Feelin' Fine": ['Normal', J, "Meowth's own"], 'Fiery Bone': ['Fire', N],
	'Fireball Shot': ['Fire', J, 'Pyro Ball'], 'Flip Over': ['Fighting', J, 'Counter'], 'Float Up': ['Grass', J, "Eldegoss's own"], 'Flock': ['Normal', J, "Tandemaus's own"], 'Frozen Lock': ['Ice', N], 'Ground Beat': ['Fighting', J, "Buzzwole's own"], 'Hail Prison': ['Ice', N, 'Hail'],
	'Heat-Up Crunch': ['Fire', J, 'Fire Fang'], 'Heavy Thunder': ['Electric', N, 'Thunder'], 'Icy Snow': ['Ice', N], 'Inspiring Dance': ['Normal', J, 'a dance, with no one style to take a type from'], 'Invade': ['Fighting', J, "Falinks's own"], 'Knocking Hammer': ['Fighting', J, "Machamp's own"],
	'Knuckle Sandwich': ['Normal', J, 'Mega Punch'], 'Large Whirlpool': ['Water', N, 'Whirlpool'], 'Megaton Cannon': ['Rock', J, "Gigalith's own"], 'Merciless Strike': ['Dark', J, "Galarian Obstagoon's own"], 'Needle Lariat': ['Grass', J, 'Needle Arm'], 'Past Friends': ['Ghost', J, "Chandelure's own"],
	'Petty Grudge': ['Ghost', N, 'Grudge'], 'Photon Laser': ['Psychic', J, 'Psybeam'], 'Poison Ring': ['Poison', N], 'Pop-Punk': ['Fire', J, "Blacephalon's own"], 'Psy Turbo': ['Psychic', N], 'Psykick': ['Psychic', J, 'Psy'], 'Shatter': ['Fighting', J, 'Brick Break'], 'Singe': ['Fire', J, 'Ember'],
	'Smokescreen Shot': ['Poison', J, "Skuntank's own"], 'Snapping Trap': ['Grass', N, 'Snap Trap'], 'Spike Rend': ['Grass', J, 'Needle Arm'], 'Spit-Out Shot': ['Water', J, "Cramorant's own"], 'Spray Fluid': ['Poison', J, "Stunky's own"], 'Steady Punch': ['Normal', J, 'Mega Punch'],
	'Strong-Armed Destroyer': ['Water', J, "Mega Swampert's own"], 'Superb Shield': ['Steel', J, "King's Shield"], 'Tail Rap': ['Normal', J, 'Tail Whip'], 'Teetering Steps': ['Normal', J, 'Teeter Dance'], 'Thunder Jolt': ['Electric', N], 'Triple Spin': ['Ice', J, "Galarian Mr. Rime's own"],
	'Tyrannical Fang': ['Rock', J, "Tyrantrum's own"], 'Vivid Powder': ['Bug', J, "Vivillon's own"], 'Whiny Voice': ['Dark', J, 'Fake Tears'], 'Zen Shard': ['Psychic', N],
	// Paldean Wonders (B2a)
	'Adrenaline Hammer': ['Rock', J, "Klawf's own"], 'Arrogant Impact': ['Dark', J, "Ting-Lu's own"], 'Ball Roll': ['Bug', J, "Rellor's own"], 'Binding Greed': ['Dark', J, "Wo-Chien's own"], 'Cheerful Singing': ['Normal', J, 'Sing'], 'Colorful Attack': ['Poison', J, "Grafaiai's own"],
	'Continuous Coin Toss': ['Ghost', J, "Gimmighoul's own"], 'Diving Icicles': ['Ice', N], 'Driving Buddy': ['Dragon', J, "Cyclizar's own"], 'Dynamite Punch': ['Fighting', J, 'Dynamic Punch'], 'Fighting Sword': ['Fighting', N], 'High-Voltage Cannon': ['Electric', J, 'high voltage'],
	'Hydro Kick': ['Water', J, 'Hydro'], 'Icicle Missile': ['Ice', N], 'Iron Supply': ['Steel', N], 'Leg Stomp': ['Normal', J, 'Stomp'], 'Lightning Laser': ['Electric', N], 'Megafire of Envy': ['Fire', N], 'Muddy Hammer': ['Ground', J, 'mud'], 'Playful Kick': ['Fighting', J, 'a kick'],
	'Rally Back': ['Dragon', J, "Tatsugiri's own"], 'Rampaging Fang': ['Fighting', J, "Koraidon's own"], 'Random Spark': ['Electric', N, 'Spark'], 'Red-Hot Headbutt': ['Fire', J, 'red-hot'], 'Rocket Jump': ['Bug', J, "Lokix's own"], 'Shedding Spiral': ['Water', J, "Veluza's own"],
	'Spending Rush': ['Steel', J, "Gholdengo's own; Make It Rain"], 'Splashing Turn': ['Water', N], 'Triple Gnawing': ['Normal', J, "Maushold's own"], 'Triple Whip': ['Water', J, "Wugtrio's own"],
	// Mega Shine (B2b)
	'Mental Crush': ['Psychic', J, 'a mental attack'], 'Rumble Stomp': ['Ground', J, 'a ground-shaking stomp'], 'Flame Tail': ['Fire', N], 'Raging Blaze': ['Fire', N], 'Thundering Volcano': ['Fire', J, 'a volcano'], 'Laundry-Go-Round': ['Water', J, "Mega Slowbro's own"],
	'Raging Freeze': ['Ice', N], 'Water Splash': ['Water', N], "Emperor's Strike": ['Steel', J, "Empoleon's own"], 'Aqua Turbo': ['Water', N], 'Incendiary Thunder': ['Electric', N, 'Thunder'], 'Lightning Accelerator': ['Electric', N], 'Miraculous Memory': ['Psychic', J, "Mew's own"],
	'Swaying Dance': ['Psychic', J, "Grumpig's own"], 'Slight Intrusion': ['Ground', J, "Diglett's own"], 'Gaia Blast': ['Ground', J, 'the earth'], 'Spin Turn': ['Ghost', J, "Haunter's own"], 'Labyrinth of Shadows': ['Ghost', J, 'shadows'], 'Dark Slumber': ['Dark', N],
	'Sludge Whirlpool': ['Poison', N, 'Sludge'], 'Energizer Wheel': ['Electric', J, 'Aura Wheel'], 'Enormous Explosion': ['Normal', J, 'Explosion'], 'Bullet Slugger': ['Steel', J, 'Bullet Punch'], 'Outta-Control Dash': ['Steel', J, 'Spin Out'], 'Tail Strike': ['Dragon', J, 'Dragon Tail'],
	"Sky's Blessing": ['Dragon', J, "Dragonair's own"], 'Dragon Wave': ['Dragon', N], 'Frenzied Blade': ['Dragon', J, "Haxorus's own"], 'Rout': ['Normal', J, "Miltank's own"], 'Spinning Draw': ['Flying', J, "Chatot's own"],
	// Pulsing Aura (B3)
	'Powerful Friends': ['Bug', J, "Heracross's own"], 'Slicing Snipe': ['Grass', J, 'Leaf Blade'], 'Terminating Tail': ['Dragon', J, 'Dragon Tail'], 'Firefighting': ['Water', J, 'it puts out Fire Energy'], 'Pre-Dawn Strike': ['Fighting', J, "Breloom's own"], 'Prickly Powder': ['Grass', J, 'a powder'],
	'Share': ['Grass', J, "Applin's own"], 'Sour Spit': ['Grass', J, 'Apple Acid'], 'Knock Away': ['Normal', J, 'a plain blow, shared by unrelated Pokémon'], 'Volcanic Kaboom': ['Fire', J, 'a volcano'], 'V-Flame': ['Fire', N], 'Flare Storm': ['Fire', N], 'Double Smash': ['Normal', J, 'a plain blow'],
	'Fire Arrow': ['Fire', N], 'Hit Twice': ['Normal', J, 'Double Slap'], 'Raid': ['Normal', J, 'a plain blow'], 'Muddy Headbutt': ['Ground', J, 'mud'], 'Sparkling Pearl': ['Water', J, "Clamperl's own"], 'Reflect Energy': ['Ice', J, "Regice's own"], 'Icicle Punch': ['Ice', N],
	'Magnetic Blast': ['Steel', J, 'Magnet Bomb'], 'Storm Blade': ['Electric', J, "Magnezone's own"], 'Single Shot Blast': ['Electric', J, "Voltorb's own"], 'Electroblast': ['Electric', N], 'Vengeful Shock': ['Electric', N, 'a shock'], 'Full Belly Bolt': ['Electric', N, 'a bolt'],
	'Pester the Dizzy': ['Psychic', J, "this Oricorio's own"], 'Mad Hammer': ['Rock', J, "Regirock's own"], 'Teary Attack': ['Dark', J, 'Fake Tears'], 'Fighting Fist': ['Fighting', N], 'Fighting Pulse': ['Fighting', N], 'Earthen Sword': ['Ground', J, 'earth'], 'Triple Smash': ['Fighting', J, "Bewear's own"],
	'Mountain Crush': ['Rock', J, 'a mountain'], 'Super Sand Attack': ['Ground', N, 'Sand Attack'], 'Training': ['Fighting', J, "Kubfu's own"], 'Gas Bomb': ['Poison', J, 'gas'], 'Spiny Rush': ['Poison', J, "Qwilfish's spines"], 'Ascension': ['Dark', J, "Zorua's own"], 'Brutal Bash': ['Dark', J, "Zoroark's own"],
	'Dangerous Spores': ['Grass', J, 'Spore'], 'Blindside': ['Dark', J, "Mandibuzz's own"], 'Evolution Jammer': ['Psychic', J, "Malamar's own"], 'Dark Vengeance': ['Dark', N], 'Protect Charge': ['Steel', J, "Registeel's own"], 'Psychic Resonance': ['Psychic', N], 'Windup Cannon': ['Steel', J, "Magearna's own"],
	'Air Crash': ['Flying', J, 'air'], 'Sand Wind': ['Ground', J, 'sand'], 'Bind Wound': ['Normal', J, "Chansey's own"], 'Jumping Kick': ['Fighting', J, 'Jump Kick'], "Bop 'n' Burrow": ['Ground', J, 'Dig'], 'Raging Claws': ['Normal', J, "Ursaring's own"], 'Giga Turbo': ['Normal', J, "Regigigas's own"],
	'Puppy Pile': ['Normal', J, "Lillipup's own"], 'Fighting Fangs': ['Fighting', N], 'Healing Light': ['Normal', J, "Audino's own"], 'Heartfelt Shine': ['Fairy', J, "Mega Audino's own"], 'Fluffy Tail': ['Normal', J, "Minccino's own"], 'Whimsy Tackle': ['Normal', N, 'Tackle'], 'Joust': ['Flying', J, "Corvisquire's own"],
	'Sunny Scorching': ['Fire', J, "Castform's Sunny Form"], 'Rainy Absorbing': ['Water', J, "Castform's Rainy Form"], 'Snowy Chilling': ['Ice', J, "Castform's Snowy Form"], 'Tornado Shot': ['Water', J, 'Surging Strikes'],
	// Paradox Drive (B3a)
	'Spirited Smack': ['Grass', J, "Brute Bonnet's own"], 'Wildly Writhe': ['Bug', J, "Slither Wing's own"], 'Thermal Gust': ['Fire', J, 'heat'], 'Impound': ['Water', J, "this Vaporeon's own"], 'Cold Start': ['Ice', N], 'Volt Wave': ['Electric', N], 'Successive Slapping': ['Fighting', J, 'Arm Thrust'],
	'Binary Thunder': ['Electric', N], 'Hadron Ray': ['Electric', J, 'Hadron Engine'], 'Psy Bolt': ['Psychic', N], 'Shooing Shout': ['Fairy', J, 'Disarming Voice'], 'Spellbinding Start': ['Ghost', J, "Flutter Mane's own"], 'Avenging Edge': ['Psychic', J, 'Psyblade'], 'Modular Axe': ['Rock', J, "Iron Boulder's own"],
	'Enumerating Blade': ['Steel', J, "Iron Crown's own"], 'Shaking Stomp': ['Ground', J, 'it shakes the ground'], 'Pull In and Pound': ['Ground', J, "Sandy Shocks's own"], 'World Wrecker': ['Fighting', J, 'Collision Course'], 'Jeweled Gift': ['Dark', J, "Sableye's own"], "Overlord's Blade": ['Dark', J, 'Kowtow Cleave'],
	'Venomous Hit': ['Poison', N], 'Blasting Wind': ['Flying', J, 'wind'], 'Wind of Darkness': ['Dark', N], 'Iron Swing': ['Steel', N], 'Roll and Release': ['Steel', J, "Iron Treads's own"], 'Sweeping Billow': ['Water', J, 'a billow'], 'Scorching Interruption': ['Fire', N],
	'Baneful Boom': ['Electric', J, 'Thunderclap'], 'Sudden Drilling': ['Ground', J, 'Drill Run'], 'Claw': ['Normal', J, 'Scratch'], 'Nosedive': ['Flying', J, 'a dive from the air'], 'Prism Impact': ['Normal', J, "Terapagos's own"],
	'Energized Leaves': ['Grass', N], 'Hearthflame Dance': ['Fire', J, 'Ivy Cudgel in the Hearthflame Mask'], 'Wellspring Dance': ['Water', J, 'Ivy Cudgel in the Wellspring Mask'], 'Cornerstone Dance': ['Rock', J, 'Ivy Cudgel in the Cornerstone Mask'],
};

// ---- calls made again, with one rule: an attack shared by Pokémon with nothing in common is not typed after one of them.
// It takes the type of the plain mainline move it most resembles. The old type is kept beside the new one (`typeWas`), and
// a match recorded under rules revision 1 or 2 is replayed with it, so no recording changes.
const RETYPED = { Pierce: 'Steel', 'Sharp Scythe': 'Bug', 'Spinning Attack': 'Steel', 'Guard Press': 'Rock', 'Power Blast': 'Psychic', Hypnoblast: 'Ghost' };
Object.assign(ATTACK_TYPE, {
	Pierce: ['Normal', J, 'used by Pawniard, Vespiquen, Gligar and Skorupi: a plain stab, like Horn Attack'],
	'Sharp Scythe': ['Normal', J, 'used by Scyther and Gabite: a cut, like Slash'],
	'Spinning Attack': ['Normal', J, 'used by Magneton and Hitmontop: Rapid Spin'],
	'Guard Press': ['Fighting', J, 'used by Golem and Bronzong: Body Press'],
	'Power Blast': ['Normal', J, 'used by Mewtwo and Arceus: a plain blast, like Hyper Beam'],
	Hypnoblast: ['Psychic', J, 'it puts its target to sleep: Hypnosis'],
});

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
	// Shining Revelry (A2b)
	[/^Take (\d) \{(\w)\} Energy from your Energy Zone and attach it to this Pokémon\.$/, m => [{ k: 'attachZone', type: en(m[2]), to: 'self', n: +m[1] }]],
	[/^1 of your opponent's Pokémon is chosen at random\. Do (\d+) damage to it\.$/, m => [{ k: 'randomHits', times: 1, n: +m[1] }]],
	[/^Take a \{(\w)\} Energy from your Energy Zone and attach it to 1 of your Benched Pokémon\.$/, m => [{ k: 'attachZone', type: en(m[1]), to: 'bench', n: 1, a: true }]],
	[/^This attack also does (\d+) damage to each of your opponent's Benched Pokémon that has any Energy attached\.$/, m => [{ k: 'benchSplash', n: +m[1], withEnergy: true }]],
	[/^Flip a coin\. If heads, your opponent's Active Pokémon is now (Confused|Asleep|Poisoned|Burned)\.$/, m => [{ k: 'status', s: m[1].toLowerCase(), coin: true }]],
	[/^Flip a coin for each \{(\w)\} Energy attached to this Pokémon\. This attack does (\d+) damage for each heads\.$/, m => [{ k: 'coinsPerEnergy', per: +m[2], type: en(m[1]) }]],
	// Celestial Guardians (A3)
	[/^This attack does (\d+) damage to 1 of your opponent's Pokémon that have damage on them\.$/, m => [{ k: 'snipe', n: +m[1], zone: 'any', damaged: true }]],
	[/^Flip a coin\. If tails, this Pokémon also does (\d+) damage to itself\.$/, m => [{ k: 'coinTailsSelf', n: +m[1] }]],
	[/^Discard a random Energy from both Active Pokémon\.$/, () => [{ k: 'discardSelfRandom' }, { k: 'discardTargetEnergy' }]],
	[/^Your opponent's Active Pokémon is now (\w+) and (\w+)\.$/, m => [{ k: 'status', s: m[1].toLowerCase() }, { k: 'status', s: m[2].toLowerCase() }]],
	[/^This attack does (\d+) more damage for each of your Benched (.+) (?:and|or) (.+)\.$/, m => [{ k: 'perBenchNames', n: +m[1], names: [m[2], m[3]] }]],
	[/^If your opponent's Active Pokémon is a Basic Pokémon, this attack does (\d+) more damage\.$/, m => [{ k: 'targetBasicBonus', bonus: +m[1] }]],
	[/^During your opponent's next turn, they can't play any Item cards from their hand\.$/, () => [{ k: 'noItems' }]],
	[/^Switch this Pokémon with 1 of your Benched \{(\w)\} Pokémon\.$/, m => [{ k: 'switchSelf', type: en(m[1]) }]],
	[/^During your opponent's next turn, they can't take any Energy from their Energy Zone to attach to their Active Pokémon\.$/, () => [{ k: 'noZoneToActive' }]],
	[/^This attack also does (\d+) damage to 1 of your Pokémon\.$/, m => [{ k: 'ownAnyDamage', n: +m[1] }]],
	[/^This attack does (\d+) damage to 1 of your opponent's Pokémon for each Energy attached to that Pokémon\.$/, m => [{ k: 'snipePerEnergy', n: +m[1] }]],
	[/^Put a random card that evolves from (.+) from your deck into your hand\.$/, m => [{ k: 'evolutionToHand', name: m[1] }]],
	[/^If your opponent's Active Pokémon has more remaining HP than this Pokémon, this attack does (\d+) more damage\.$/, m => [{ k: 'moreHpBonus', bonus: +m[1] }]],
	[/^If your opponent's Active Pokémon is affected by a Special Condition, this attack does (\d+) more damage\.$/, m => [{ k: 'targetStatusBonus', bonus: +m[1] }]],
	[/^If your opponent's Active Pokémon has an Ability, this attack does (\d+) more damage\.$/, m => [{ k: 'targetAbilityBonus', bonus: +m[1] }]],
	[/^If any of your Benched Pokémon have damage on them, this attack does (\d+) more damage\.$/, m => [{ k: 'benchDamagedBonus', bonus: +m[1] }]],
	[/^During your opponent's next turn, this Pokémon takes \+(\d+) damage from attacks\.$/, m => [{ k: 'selfVulnerable', n: +m[1] }]],
	[/^This Pokémon is now (Confused|Poisoned|Burned|Paralyzed)\.$/, m => [{ k: 'selfStatus', s: m[1].toLowerCase() }]],
	[/^During your opponent's next turn, attacks used by the Defending Pokémon cost (\d) \{C\} more\.$/, m => [{ k: 'targetCostMore', n: +m[1], retreat: 0 }]],
	[/^During your opponent's next turn, attacks used by the Defending Pokémon cost (\d) \{C\} more, and its Retreat Cost is (\d) \{C\} more\.$/, m => [{ k: 'targetCostMore', n: +m[1], retreat: +m[2] }]],
	[/^If this Pokémon moved from your Bench to the Active Spot this turn, this attack does (\d+) more damage\.$/, m => [{ k: 'movedUpBonus', bonus: +m[1] }]],
	[/^Flip (\d) coins\. This attack does (\d+) damage for each heads\. If at least (\d) of them is heads, your opponent's Active Pokémon is now (\w+)\.$/, m => [{ k: 'coinsMul', coins: +m[1], per: +m[2] }, { k: 'headsStatus', need: +m[3], s: m[4].toLowerCase() }]],
	[/^During your opponent's next turn, if this Pokémon is damaged by an attack, do (\d+) damage to the Attacking Pokémon\.$/, m => [{ k: 'selfThorns', n: +m[1] }]],
	[/^Discard a random Item card from your opponent's hand\.$/, () => [{ k: 'discardItemFromHand' }]],
	// Paradox Drive (B3a)
	[/^Flip 3 coins\. If 1 of them is heads, this attack does (\d+) more damage\. If 2 of them are heads, this attack does (\d+) more damage\. If all of them are heads, this attack does (\d+) more damage\.$/, m => [{ k: 'coinsTable', coins: 3, table: [0, +m[1], +m[2], +m[3]] }]],
	[/^If this is the first time this Pokémon has used an attack after coming into play, this attack does (\d+) more damage, and your opponent's Active Pokémon is now (\w+)\.$/, m => [{ k: 'firstUseBonus', bonus: +m[1] }, { k: 'firstUseStatus', s: m[2].toLowerCase() }]],
	[/^If this is the first time this Pokémon has used an attack after coming into play, during your opponent's next turn, they can't use any Trainer cards from their hand\.$/, () => [{ k: 'firstUseNoTrainers' }]],
	[/^During your next turn, the Defending Pokémon takes \+(\d+) damage from attacks\.$/, m => [{ k: 'targetVulnerableNext', n: +m[1] }]],
	[/^Flip (\d) coins\. If both of them are heads, discard your opponent's Active Pokémon\.$/, m => [{ k: 'coinDiscardTarget', coins: +m[1] }]],
	[/^Switch in 1 of your opponent's Benched Pokémon to the Active Spot\. If you do, this attack does (\d+) damage to the new Active Pokémon\.$/, m => [{ k: 'pullThenHit', n: +m[1] }]],
	[/^Take a random Energy from among \{G\}, \{R\}, \{W\}, \{L\}, \{P\}, \{F\}, \{D\}, and \{M\} Energy from your Energy Zone and attach it to 1 of your Benched Pokémon\.$/, () => [{ k: 'attachRandomType', types: ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal'] }]],
	[/^This attack does (\d+) more damage for each time your Pokémon have been Knocked Out during this game\.$/, m => [{ k: 'perOwnKO', n: +m[1] }]],
	[/^Discard an Energy from this Pokémon, and this attack also does (\d+) damage to each of your opponent's Benched Pokémon\.$/, m => [{ k: 'discardSelfEnergy', type: null, n: 1 }, { k: 'benchSplash', n: +m[1] }]],
	[/^Discard (\d) Energy from this Pokémon\. During your opponent's next turn, this Pokémon takes -(\d+) damage from attacks\.$/, m => [{ k: 'discardSelfEnergy', type: null, n: +m[1] }, { k: 'selfReduce', n: +m[2] }]],
	[/^Discard all Energy from this Pokémon\. Knock Out your opponent's Active Pokémon\.$/, () => [{ k: 'discardSelfEnergy', type: null, n: 'all' }, { k: 'coinsKO', coins: 0 }]],
	[/^If this Pokémon evolved from (\w+) during this turn, discard (\d) random Energy from your opponent's Active Pokémon\.$/, m => [{ k: 'evolvedDiscardTarget', from: m[1], n: +m[2] }]],
	[/^This attack does (\d+) more damage for each type of Energy attached to this Pokémon\.$/, m => [{ k: 'perEnergyType', n: +m[1] }]],
	// Pulsing Aura (B3)
	[/^Discard a \{(\w)\} Energy from this Pokémon, and this attack also does (\d+) damage to 1 of your opponent's Benched Pokémon\.$/, m => [{ k: 'discardSelfEnergy', type: en(m[1]), n: 1 }, { k: 'alsoBench', n: +m[2] }]],
	[/^If you have any Stage (\d) Pokémon on your Bench, this attack does (\d+) more damage\.$/, m => [{ k: 'benchStageBonus', stage: +m[1], bonus: +m[2] }]],
	[/^Discard a \{(\w)\} Energy from this Pokémon\. Your opponent's Active Pokémon is now (\w+)\.$/, m => [{ k: 'discardSelfEnergy', type: en(m[1]), n: 1 }, { k: 'status', s: m[2].toLowerCase() }]],
	[/^If your opponent's Active Pokémon is Asleep, this attack does (\d+) more damage\.$/, m => [{ k: 'targetAsleepBonus', bonus: +m[1] }]],
	[/^The Defending Pokémon loses all Abilities\. This effect lasts until the Defending Pokémon leaves the Active Spot\.$/, () => [{ k: 'targetNoAbility' }]],
	[/^Flip (\d) coins\. For each heads, discard a \{(\w)\} Energy from this Pokémon\. This attack does (\d+) more damage for each \{\w\} Energy you discarded in this way\.$/, m => [{ k: 'coinsDiscardBonus', coins: +m[1], type: en(m[2]), per: +m[3] }]],
	[/^Flip a coin\. If heads, take (\d) \{(\w)\} Energy from your Energy Zone and attach it to this Pokémon\.$/, m => [{ k: 'coinAttachSelf', n: +m[1], type: en(m[2]) }]],
	[/^Flip a coin for each \{(\w)\} Energy attached to this Pokémon\. This attack does (\d+) more damage for each heads\.$/, m => [{ k: 'coinsPerEnergy', per: +m[2], type: en(m[1]), more: true }]],
	[/^If this Pokémon evolved from (\w+) during this turn, this attack does (\d+) more damage\.$/, m => [{ k: 'evolvedBonus', bonus: +m[2], from: m[1] }]],
	[/^Move (\d) random Energy from this Pokémon to 1 of your Benched Pokémon\.$/, m => [{ k: 'moveRandomEnergyToBench', n: +m[1] }]],
	[/^If any of your Pokémon were Knocked Out by damage from an attack during your opponent's last turn, this attack does (\d+) more damage, and your opponent's Active Pokémon is now (\w+)\.$/, m => [{ k: 'revengeBonus', bonus: +m[1] }, { k: 'revengeStatus', s: m[2].toLowerCase() }]],
	[/^Heal (\d+) damage from each of your \{(\w)\} Pokémon\.$/, m => [{ k: 'healAllOwn', n: +m[1], type: en(m[2]) }]],
	[/^During your next turn, attacks used by your \{(\w)\} Pokémon do \+(\d+) damage to your opponent's Active Pokémon\.$/, m => [{ k: 'nextTurnBoost', n: +m[2], cardType: en(m[1]) }]],
	[/^Flip a coin until you get tails\. For each heads, discard the top card of your opponent's deck\.$/, () => [{ k: 'untilTailsMill' }]],
	[/^During your opponent's next turn, they can't play any Pokémon from their hand to evolve their Pokémon\.$/, () => [{ k: 'noEvolve' }]],
	[/^If any of your \{(\w)\} Pokémon were Knocked Out by damage from an attack during your opponent's last turn, this attack does (\d+) more damage\.$/, m => [{ k: 'revengeBonus', bonus: +m[2], type: en(m[1]) }]],
	[/^If your opponent has any \{(\w)\} Pokémon in play, this attack does (\d+) more damage\.$/, m => [{ k: 'oppHasTypeBonus', type: en(m[1]), bonus: +m[2] }]],
	[/^Discard the top card of your deck\.$/, () => [{ k: 'millSelf', n: 1 }]],
	[/^Reveal all of your Pokémon in play and in your hand that have the (.+) attack, and this attack does (\d+) damage for each Pokémon you revealed in this way\.$/, m => [{ k: 'perAttackName', name: m[1], per: +m[2] }]],
	[/^During your opponent's next turn, this Pokémon takes -(\d+) damage from attacks and has no Weakness\.$/, m => [{ k: 'selfNoWeakness', reduce: +m[1] }]],
	[/^If a Stadium is in play, your opponent's Active Pokémon is now (\w+)\.$/, m => [{ k: 'stadiumStatus', s: m[1].toLowerCase() }]],
	[/^If a Stadium is in play, heal (\d+) damage from this Pokémon\.$/, m => [{ k: 'stadiumHealSelf', n: +m[1] }]],
	// Mega Shine (B2b)
	[/^If your opponent's Active Pokémon is Confused, this attack does (\d+) more damage\.$/, m => [{ k: 'targetConfusedBonus', bonus: +m[1] }]],
	[/^Flip (\d) coins\. This attack also does (\d+) damage for each heads to each of your opponent's Benched Pokémon\.$/, m => [{ k: 'coinsBenchSplash', coins: +m[1], n: +m[2] }]],
	[/^If any of your Pokémon were Knocked Out by damage from an attack during your opponent's last turn, your opponent's Active Pokémon is now (\w+)\.$/, m => [{ k: 'revengeStatus', s: m[1].toLowerCase() }]],
	[/^This attack does (\d+) more damage for each point you have gotten\.$/, m => [{ k: 'perOwnPoint', n: +m[1] }]],
	[/^1 attack from among the Pokémon in your opponent's hand and deck is chosen at random, and you use the chosen attack as this attack\.$/, () => [{ k: 'randomCopy' }]],
	[/^If your opponent has exactly ([\d, or]+) cards in their hand, this attack does (\d+) more damage\.$/, m => [{ k: 'oppHandCountBonus', counts: m[1].match(/\d+/g).map(Number), bonus: +m[2] }]],
	[/^Discard (\d) random Energy from among the Energy attached to all of your Pokémon\.$/, m => [{ k: 'discardOwnRandomEnergy', n: +m[1] }]],
	[/^During your opponent's next turn, they can't play any Trainer cards from their hand\.$/, () => [{ k: 'noTrainers' }]],
	[/^Move (\d) \{(\w)\} Energy from this Pokémon to 1 of your Benched Pokémon\.$/, m => [{ k: 'moveEnergyToBench', n: +m[1], type: en(m[2]) }]],
	[/^This Pokémon also does (\d+) damage to itself and (\d+) damage to all Benched Pokémon \(both yours and your opponent's\)\.$/, m => [{ k: 'selfDamage', n: +m[1] }, { k: 'benchAllBoth', n: +m[2] }]],
	[/^Take a \{(\w)\} and a \{(\w)\} Energy from your Energy Zone and attach them to this Pokémon\.$/, m => [{ k: 'attachSelfTypes', types: [en(m[1]), en(m[2])] }]],
	[/^Discard a \{(\w)\} and a \{(\w)\} Energy from this Pokémon\.$/, m => [{ k: 'discardSelfTypes', types: [en(m[1]), en(m[2])] }]],
	[/^This attack does (\d+) more damage for each Benched Pokémon \(both yours and your opponent's\)\.$/, m => [{ k: 'perAllBench', per: +m[1], more: true }]],
	// Paldean Wonders (B2a)
	[/^Choose a spot from among your opponent's Active Spot and Bench\. At the end of your opponent's next turn, do (\d+) damage to the Pokémon in the spot you chose\.$/, m => [{ k: 'spotDoom', n: +m[1] }]],
	[/^If your opponent's Active Pokémon is a (?:\{(\w)\}|(\w+)) or \{(\w)\} Pokémon, this attack does (\d+) more damage\.$/, m => [{ k: 'targetTypeBonus', types: [m[1] ? en(m[1]) : m[2], en(m[3])], bonus: +m[4] }]],
	[/^During your opponent's next turn, attacks used by the Defending Pokémon cost \{C\}\{C\} more\.$/, () => [{ k: 'targetCostMore', n: 2, retreat: 0 }]],
	[/^If you have no cards in your deck, this attack can be used for 1 \{(\w)\} Energy\.$/, m => [{ k: 'emptyDeckCost', cost: [en(m[1])] }]],
	[/^This attack does (\d+) more damage for each \{(\w)\} Pokémon in your discard pile\.$/, m => [{ k: 'perDiscardType', n: +m[1], type: en(m[2]) }]],
	[/^If this Pokémon's remaining HP is (\d+) or less, this attack does nothing\.$/, m => [{ k: 'lowHpNothing', hp: +m[1] }]],
	[/^If your Pokémon in play have (\d) or more different types of Energy attached, this attack does (\d+) more damage\.$/, m => [{ k: 'energyTypesInPlayBonus', need: +m[1], bonus: +m[2] }]],
	[/^1 of your opponent's Pokémon is chosen at random for each \{(\w)\} Energy attached to this Pokémon\. For each time a Pokémon was chosen, do (\d+) damage to it\.$/, m => [{ k: 'randomHits', n: +m[2], perEnergy: en(m[1]) }]],
	[/^Flip (\d) coins\. For each heads, discard a random Energy from your opponent's Active Pokémon\.$/, m => [{ k: 'coinsDiscardOrNothing', coins: +m[1], soft: true }]],
	// Fantastical Parade (B2)
	[/^This attack's damage isn't affected by Weakness or by any effects on your opponent's Active Pokémon\.$/, () => [{ k: 'ignoreWeakness' }, { k: 'ignoreTargetEffects' }]],
	[/^Your opponent's Active Pokémon is now Poisoned\. During your opponent's next turn, that Pokémon can't retreat\.$/, () => [{ k: 'status', s: 'poisoned' }, { k: 'targetCantRetreat' }]],
	[/^If your opponent has gotten exactly (\d) points?, this attack does (\d+) more damage\.$/, m => [{ k: 'oppPointsBonus', points: +m[1], bonus: +m[2] }]],
	[/^You may shuffle this Pokémon and all attached cards into your deck\.$/, () => [{ k: 'shuffleSelfIntoDeck', may: true, all: true }]],
	[/^During your next turn, attacks used by your Pokémon do \+(\d+) damage to your opponent's Active Pokémon\.$/, m => [{ k: 'nextTurnBoost', n: +m[1] }]],
	[/^Discard (\d) \{(\w)\} Energy from this Pokémon\.$/, m => [{ k: 'discardSelfEnergy', type: en(m[2]), n: +m[1] }]],
	[/^Flip a coin\. If heads, this attack does (\d+) damage to your opponent's Active Pokémon\. If tails, heal (\d+) damage from your opponent's Active Pokémon\.$/, m => [{ k: 'coinDamageOrHeal', dmg: +m[1], heal: +m[2] }]],
	[/^Discard (\d) random Energy from among the Energy attached to all Pokémon \(both yours and your opponent's\)\.$/, m => [{ k: 'randomEnergyAll', n: +m[1] }]],
	[/^Discard (?:[A-Za-z]+)?(\d) \{(\w)\} Energy from this Pokémon\. Your opponent's Active Pokémon is now Paralyzed\.$/, m => [{ k: 'discardSelfEnergy', type: en(m[2]), n: +m[1] }, { k: 'status', s: 'paralyzed' }]],
	[/^1 other Pokémon \(either yours or your opponent's\) is chosen at random 1 time\. Do (\d+) damage to the chosen Pokémon\.$/, m => [{ k: 'randomHitsAny', times: 1, n: +m[1] }]],
	[/^If (\w+) is on your Bench, this attack also does (\d+) damage to each of your opponent's Benched Pokémon\.$/, m => [{ k: 'benchSplash', n: +m[2], need: m[1] }]],
	[/^This attack also does (\d+) damage to each of your opponent's Benched Pokémon that has damage on it\.$/, m => [{ k: 'benchSplash', n: +m[1], damaged: true }]],
	[/^If you have (\d) or more \{(\w)\} Energy in play, this attack does (\d+) more damage\.$/, m => [{ k: 'energyInPlayBonus', need: +m[1], type: en(m[2]), bonus: +m[3] }]],
	[/^Take (\d) \{(\w)\} Energy from your Energy Zone and attach it to 1 of your Benched \{\w\} Pokémon\.$/, m => [{ k: 'attachZone', type: en(m[2]), to: 'benchType', n: +m[1] }]],
	[/^Take (\d) \{(\w)\} Energy from your Energy Zone and attach it to your \{\w\} Pokémon in any way you like\.$/, m => [{ k: 'attachZoneSpread', type: en(m[2]), n: +m[1] }]],
	[/^This attack does (\d+) more damage for each Supporter card in your discard pile\.$/, m => [{ k: 'perDiscardSupporter', n: +m[1] }]],
	[/^Discard a Stadium in play\.$/, () => [{ k: 'discardStadium' }]],
	[/^If the amount of Energy attached to both Active Pokémon is (\d) or more, this attack does (\d+) more damage\.$/, m => [{ k: 'bothEnergyBonus', need: +m[1], bonus: +m[2] }]],
	[/^Flip a coin\. If heads, take (\d) \{(\w)\} Energy from your Energy Zone and attach it to 1 of your Benched Pokémon\.$/, m => [{ k: 'coinAttachBench', type: en(m[2]), n: +m[1] }]],
	[/^Flip a coin\. If heads, this attack also does (\d+) damage to 1 of your opponent's Benched Pokémon\.$/, m => [{ k: 'alsoBench', n: +m[1], coin: true }]],
	[/^Flip a coin\. If heads, during your opponent's next turn, this Pokémon takes -(\d+) damage from attacks\.$/, m => [{ k: 'selfReduce', n: +m[1], coin: true }]],
	[/^This attack does (\d+) damage to 1 of your opponent's Pokémon\. During your next turn, this Pokémon can't attack\.$/, m => [{ k: 'snipe', n: +m[1], zone: 'any' }, { k: 'selfCantAttack' }]],
	[/^If you have fewer Pokémon in play than your opponent, this attack does (\d+) more damage\.$/, m => [{ k: 'fewerPokemonBonus', bonus: +m[1] }]],
	[/^Flip a coin\. If heads, look at a random card from your opponent's hand and shuffle it into their deck\.$/, () => [{ k: 'coinHandToDeck', look: true }]],
	[/^If this Pokémon has more Energy attached than your opponent's Active Pokémon, this attack does (\d+) more damage\.$/, m => [{ k: 'moreEnergyBonus', bonus: +m[1] }]],
	[/^Flip a coin\. If heads, discard your opponent's Active Pokémon\.$/, () => [{ k: 'coinDiscardTarget' }]],
	[/^Until this Pokémon leaves the Active Spot, this Pokémon's [\w' -]+ attack does \+(\d+) damage\. This effect stacks\.$/, m => [{ k: 'selfAtkPlusLasting', n: +m[1] }]],
	[/^During your opponent's next turn, if this Pokémon is in the Active Spot when your opponent's Active Pokémon retreats, this attack does (\d+) damage to the new Active Pokémon\.$/, m => [{ k: 'retreatTrap', n: +m[1] }]],
	[/^During your opponent's next turn, this Pokémon takes -(\d+) damage from attacks from your opponent's Pokémon ex\.$/, m => [{ k: 'selfReduceEx', n: +m[1] }]],
	[/^This attack is used twice in a row\. The second attack does (\d+) damage\. \(If the first attack Knocks Out your opponent's Active Pokémon, the second attack is used after your opponent chooses a new Active Pokémon\.\)$/, m => [{ k: 'twice', n: +m[1] }]],
	[/^If a Stadium is in play, this attack does (\d+) more damage\.$/, m => [{ k: 'stadiumBonus', bonus: +m[1] }]],
	[/^Put (\d) random cards from among (\w+) and (\w+) from your deck onto your Bench\.$/, m => [{ k: 'benchFromDeckNames', n: +m[1], names: [m[2], m[3]] }]],
	[/^Flip a coin for each (\w+) and (\w+) you have in play\. This attack does (\d+) damage for each heads\.$/, m => [{ k: 'coinsPerNamed', names: [m[1], m[2]], per: +m[3] }]],
	// Crimson Blaze (B1a)
	[/^If ([\w' -]+) is in your discard pile, this attack does (\d+) more damage\.$/, m => [{ k: 'discardHasBonus', name: m[1], bonus: +m[2] }]],
	[/^If this Pokémon has at least (\d) extra \{(\w)\} Energy attached, this attack also does (\d+) damage to (\d) of your opponent's Benched Pokémon\.$/, m => [{ k: 'extraEnergyAlsoBench', need: +m[1], type: en(m[2]), n: +m[3], count: +m[4] }]],
	[/^Put a random Supporter card from your deck into your hand\.$/, () => [{ k: 'kindToHand', kind: 'supporter' }]],
	[/^Move all \{(\w)\} Energy from this Pokémon to 1 of your Benched Pokémon\.$/, m => [{ k: 'moveAllEnergyToBench', type: en(m[1]) }]],
	[/^Heal (\d+) damage from 1 of your Pokémon\.$/, m => [{ k: 'healOwn', n: +m[1] }]],
	[/^This attack's damage is reduced by the amount of damage this Pokémon has on it\.$/, () => [{ k: 'minusSelfDamage' }]],
	[/^Flip (\d) coins\. This attack does (\d+) damage for each heads\. Your opponent's Active Pokémon is now Confused\.$/, m => [{ k: 'coinsMul', coins: +m[1], per: +m[2] }, { k: 'status', s: 'confused' }]],
	[/^Your opponent reveals a random card from their hand and shuffles it into their deck\. Shuffle this Pokémon into your deck\.$/, () => [{ k: 'coinHandToDeck', sure: true }, { k: 'shuffleSelfIntoDeck' }]],
	[/^During your opponent's next turn, this Pokémon has no Weakness\.$/, () => [{ k: 'selfNoWeakness' }]],
	[/^During your opponent's next turn, this Pokémon takes damage from attacks and has no Weakness\.$/, () => [{ k: 'selfNoWeakness', reduce: 20 }]],   // (the source record has lost the number: -20 is the printed value, confirmed by the owner)
	[/^Choose 1 of your Benched Pokémon's attacks, except any Pokémon ex, and use it as this attack\. If this Pokémon doesn't have the necessary Energy to use that attack, this attack does nothing\.$/, () => [{ k: 'copyAttack', own: true }]],
	[/^This attack does (\d+) more damage for each Trainer card in your opponent's deck\.$/, m => [{ k: 'perOppDeckTrainer', n: +m[1] }]],
	// Mega Rising (B1)
	[/^During your opponent's next turn, prevent all damage done to this Pokémon by attacks if that damage is (\d+) or less\.$/, m => [{ k: 'selfPreventSmall', n: +m[1] }]],
	[/^Choose either (\w+) or (\w+)\. Your opponent's Active Pokémon is now affected by that Special Condition\.$/, m => [{ k: 'chooseStatus', list: [m[1].toLowerCase(), m[2].toLowerCase()] }]],
	[/^Heal (\d+) damage from each of your Benched Basic Pokémon\.$/, m => [{ k: 'healBenchBasics', n: +m[1] }]],
	[/^Discard (?:Fire)?\{(\w)\} Energy from this Pokémon\. Your opponent's Active Pokémon is now Burned\.$/, m => [{ k: 'discardSelfEnergy', type: en(m[1]), n: 1 }, { k: 'status', s: 'burned' }]],
	[/^Put a random card from your deck that evolves from this Pokémon onto this Pokémon to evolve it\.$/, () => [{ k: 'evolveSelfFromDeck' }]],
	[/^Discard the top (\d) cards of your opponent's deck\.$/, m => [{ k: 'millTarget', n: +m[1] }]],
	[/^If you have exactly ([\d, or]+) cards in your hand, this attack does (\d+) more damage\.$/, m => [{ k: 'handCountBonus', counts: m[1].match(/\d+/g).map(Number), bonus: +m[2] }]],
	[/^Prevent all damage done to this Pokémon by attacks from Basic Pokémon during your opponent's next turn\.$/, () => [{ k: 'selfPreventFromBasic' }]],
	[/^1 of your opponent's Benched Pokémon is chosen at random\. This attack also does (\d+) damage to it\.$/, m => [{ k: 'randomBench', times: 1, n: +m[1] }]],
	[/^1 of your opponent's Benched Pokémon is chosen at random (\d) times\. For each time a Pokémon was chosen, also do (\d+) damage to it\.$/, m => [{ k: 'randomBench', times: +m[1], n: +m[2] }]],
	[/^Discard a \{(\w)\} Energy from your opponent's Active Pokémon\.$/, m => [{ k: 'discardTargetEnergy', type: en(m[1]) }]],
	[/^Discard a card from your hand\. If you can't, this attack does nothing\.$/, () => [{ k: 'discardHandCost', n: 1 }]],
	[/^Discard (\d) cards from your hand\. If you can't discard \d cards, this attack does nothing\.$/, m => [{ k: 'discardHandCost', n: +m[1] }]],
	[/^During your opponent's next turn, if they attach Energy from their Energy Zone to the Defending Pokémon, that Pokémon will be Asleep\.$/, () => [{ k: 'targetAttachSleep' }]],
	[/^This attack's damage isn't affected by Weakness\.$/, () => [{ k: 'ignoreWeakness' }]],
	[/^This attack does (\d+) damage to each of your opponent's Pokémon\. During your next turn, this Pokémon's [\w ]+ attack does \+(\d+) damage to each of your opponent's Pokémon\.$/, m => [{ k: 'allOppDamage', n: +m[1], grow: +m[2] }]],
	[/^Reveal the top (\d) cards of your deck\. This attack does (\d+) damage for each Pokémon with a Retreat Cost of (\d) or more you find there\. Shuffle the revealed cards back into your deck\.$/, m => [{ k: 'topRetreatMul', n: +m[1], per: +m[2], need: +m[3] }]],
	[/^If this Pokémon's remaining HP is (\d+) or less, this attack does (\d+) more damage\.$/, m => [{ k: 'lowHpBonus', hp: +m[1], bonus: +m[2] }]],
	[/^This attack does (\d+) more damage for each of your opponent's Pokémon in play that has an Ability\.$/, m => [{ k: 'perOppAbility', n: +m[1] }]],
	[/^Flip a coin\. If heads, your opponent reveals their hand\. Choose a Supporter card you find there and discard it\.$/, () => [{ k: 'discardSupporterFromHand', coin: true }]],
	[/^Your opponent reveals their hand\. Choose a Supporter card you find there and discard it\.$/, () => [{ k: 'discardSupporterFromHand' }]],
	[/^This attack's damage isn't affected by any effects on your opponent's Active Pokémon\.$/, () => [{ k: 'ignoreTargetEffects' }]],
	[/^Discard (\d) \{(\w)\} Energy from this Pokémon\. During your opponent's next turn, this Pokémon takes -(\d+) damage from attacks\.$/, m => [{ k: 'discardSelfEnergy', type: en(m[2]), n: +m[1] }, { k: 'selfReduce', n: +m[3] }]],
	[/^Flip (\d) coins\. If both of them are tails, this attack does nothing\.$/, m => [{ k: 'coinsAllTailsNothing', coins: +m[1] }]],
	[/^Flip (\d) coins\. For each heads, discard a random Energy from your opponent's Active Pokémon\. If both of them are tails, this attack does nothing\.$/, m => [{ k: 'coinsDiscardOrNothing', coins: +m[1] }]],
	[/^Flip (\d) coins\. This attack does (\d+) damage for each heads\. If this Pokémon has ([\w ]+) attached, flip (\d) coins instead\.$/, m => [{ k: 'coinsMul', coins: +m[1], per: +m[2], tool: m[3], toolCoins: +m[4] }]],
	[/^Both Active Pokémon are now Confused\.$/, () => [{ k: 'status', s: 'confused' }, { k: 'selfStatus', s: 'confused' }]],
	// Secluded Springs (A4a)
	[/^You may switch this Pokémon with 1 of your Benched Pokémon\.$/, () => [{ k: 'switchSelf', may: true }]],
	[/^If your opponent's Active Pokémon is an evolved Pokémon, devolve it by putting the highest Stage Evolution card on it into your opponent's hand\.$/, () => [{ k: 'devolveTarget' }]],
	[/^Discard the top card of your opponent's deck\.$/, () => [{ k: 'millTarget', n: 1 }]],
	[/^Flip a coin\. If heads, your opponent's Active Pokémon is now (\w+) and (\w+)\.$/, m => [{ k: 'coinStatuses', list: [m[1].toLowerCase(), m[2].toLowerCase()] }]],
	[/^Discard up to (\d) Pokémon Tool cards from your hand\. This attack does (\d+) damage for each card you discarded in this way\.$/, m => [{ k: 'discardToolsBonus', max: +m[1], per: +m[2] }]],
	[/^This attack does (\d+) damage for each Benched Pokémon \(both yours and your opponent's\)\.$/, m => [{ k: 'perAllBench', per: +m[1] }]],
	[/^If this Pokémon has damage on it, this attack can be used for 1 \{(\w)\} Energy\.$/, m => [{ k: 'damagedCost', cost: [en(m[1])] }]],
	[/^At the end of your opponent's next turn, do (\d+) damage to the Defending Pokémon\.$/, m => [{ k: 'doom', n: +m[1] }]],
	[/^Discard the top card of your deck\. If that card is a \{(\w)\} Pokémon, this attack does (\d+) more damage\.$/, m => [{ k: 'millSelfBonus', type: en(m[1]), bonus: +m[2] }]],
	[/^If this Pokémon has any \{(\w)\} Energy attached, this attack does (\d+) more damage\.$/, m => [{ k: 'hasEnergyBonus', type: en(m[1]), bonus: +m[2] }]],
	[/^This attack does damage to your opponent's Active Pokémon equal to the damage this Pokémon has on it\.$/, () => [{ k: 'selfDamageBonus', eq: true }]],
	[/^If your opponent's Active Pokémon is (?!Burned|Poisoned|Asleep|Paralyzed|Confused)([A-Z]\w+), this attack does (\d+) more damage\.$/, m => [{ k: 'targetNameBonus', name: m[1], bonus: +m[2] }]],
	[/^If this Pokémon has (\d) or more different types of Energy attached, this attack does (\d+) more damage\.$/, m => [{ k: 'energyTypesBonus', need: +m[1], bonus: +m[2] }]],
	[/^Until this Pokémon leaves the Active Spot, this Pokémon's [\w ]+ attack does \+(\d+) damage\. This effect stacks\.$/, m => [{ k: 'selfAtkPlusLasting', n: +m[1] }]],
	[/^Heal (\d+) damage from 1 of your Benched Pokémon\.$/, m => [{ k: 'healBench', n: +m[1] }]],
	// Wisdom of Sea and Sky (A4)
	[/^Flip (\d) coins\. This attack does (\d+) damage for each heads\. This Pokémon is now Confused\.$/, m => [{ k: 'coinsMul', coins: +m[1], per: +m[2] }, { k: 'selfStatus', s: 'confused' }]],
	[/^This attack does (\d+) more damage for each Energy in your opponent's Active Pokémon's Retreat Cost\.$/, m => [{ k: 'perTargetRetreat', n: +m[1] }]],
	[/^If this Pokémon has no damage on it, this attack does (\d+) more damage\.$/, m => [{ k: 'selfUndamagedBonus', bonus: +m[1] }]],
	[/^1 other Pokémon \(either yours or your opponent's\) is chosen at random (\d) times\. For each time a Pokémon was chosen, do (\d+) damage to it\.$/, m => [{ k: 'randomHitsAny', times: +m[1], n: +m[2] }]],
	[/^Take a \{(\w)\} Energy from your Energy Zone and attach it to 1 of your Benched Basic Pokémon\.$/, m => [{ k: 'attachZone', type: en(m[1]), to: 'bench', n: 1, a: true, basic: true }]],
	[/^Flip a coin\. If tails, discard (\d) random Energy from this Pokémon\.$/, m => [{ k: 'coinTailsDiscardSelf', n: +m[1] }]],
	[/^Take a \{(\w)\}, \{(\w)\}, and \{(\w)\} Energy from your Energy Zone and attach them to your Benched Basic Pokémon in any way you like\.$/, m => [{ k: 'attachZoneTypes', types: [en(m[1]), en(m[2]), en(m[3])] }]],
	[/^If your opponent's Active Pokémon is Burned, this attack does (\d+) more damage\.$/, m => [{ k: 'targetBurnedBonus', bonus: +m[1] }]],
	[/^You may discard any number of your Benched \{(\w)\} Pokémon\. This attack does (\d+) more damage for each Benched Pokémon you discarded in this way\.$/, m => [{ k: 'discardBenchBonus', type: en(m[1]), bonus: +m[2] }]],
	[/^Put a random Pokémon from your deck into your hand\.$/, () => [{ k: 'typeToHand', type: null }]],
	[/^If the Defending Pokémon tries to use an attack, your opponent flips a coin\. If tails, that attack doesn't happen\. This effect lasts until the Defending Pokémon leaves the Active Spot, and it doesn't stack\.$/, () => [{ k: 'smokescreen', lasting: true }]],
	[/^Move all Energy from this Pokémon to 1 of your Benched Pokémon\.$/, () => [{ k: 'moveAllEnergyToBench' }]],
	[/^Flip a coin\. If heads, your opponent's Active Pokémon is now (\w+)\. If tails, your opponent's Active Pokémon is now (\w+)\.$/, m => [{ k: 'coinStatus2', heads: m[1].toLowerCase(), tails: m[2].toLowerCase() }]],
	[/^This Pokémon is now Asleep\. Heal (\d+) damage from it\.$/, m => [{ k: 'selfStatus', s: 'asleep' }, { k: 'heal', n: +m[1], it: true }]],
	[/^This attack does (\d+) damage for each Energy attached to your opponent's Active Pokémon\.$/, m => [{ k: 'perTargetEnergy', n: +m[1], only: true }]],
	[/^Flip a coin\. If heads, your opponent's Active Pokémon's remaining HP is now (\d+)\.$/, m => [{ k: 'coinSetHp', hp: +m[1] }]],
	[/^If this Pokémon was damaged by an attack during your opponent's last turn while it was in the Active Spot, this attack does (\d+) more damage\.$/, m => [{ k: 'wasHitBonus', bonus: +m[1] }]],
	[/^Both Active Pokémon are now Asleep\.$/, () => [{ k: 'status', s: 'asleep' }, { k: 'selfStatus', s: 'asleep' }]],
	[/^Discard a random card from your opponent's hand\.$/, () => [{ k: 'coinDiscardHand', sure: true }]],
	[/^Flip a coin\. If heads, during your opponent's next turn, prevent all damage done to this Pokémon by attacks\.$/, () => [{ k: 'coinPrevent', damageOnly: true }]],
	[/^This attack does (\d+) more damage for each Energy attached to this Pokémon\.$/, m => [{ k: 'perSelfEnergyBonus', n: +m[1], type: null }]],
	[/^If your opponent's Active Pokémon is an Evolution Pokémon, this attack does (\d+) more damage\.$/, m => [{ k: 'targetEvolvedBonus', bonus: +m[1] }]],
	[/^During your opponent's next turn, attacks used by the Defending Pokémon cost (\d) \{C\} more\.$/, m => [{ k: 'targetCostMore', n: +m[1], retreat: 0 }]],
	[/^Flip a coin\. If tails, this attack does nothing\. If heads, during your opponent's next turn, prevent all damage from-and effects of-attacks done to this Pokémon\.$/, () => [{ k: 'coinNothing' }, { k: 'coinPrevent', sure: true }]],
	[/^Draw cards until you have the same number of cards in your hand as your opponent\.$/, () => [{ k: 'drawToMatch' }]],
	[/^Change the type of a random Energy attached to your opponent's Active Pokémon to 1 of the following at random: \{G\}, \{R\}, \{W\}, \{L\}, \{P\}, \{F\}, \{D\}, or \{M\}\.$/, () => [{ k: 'recolorEnergy' }]],
	[/^Discard a \{(\w)\}, \{(\w)\}, and \{(\w)\} Energy from this Pokémon\.$/, m => [{ k: 'discardSelfTypes', types: [en(m[1]), en(m[2]), en(m[3])] }]],
	// Eevee Grove (A3b)
	[/^This attack does (\d+) more damage for each \{(\w)\} Energy attached to this Pokémon\.$/, m => [{ k: 'perSelfEnergyBonus', n: +m[1], type: en(m[2]) }]],
	[/^Your opponent reveals a random card from their hand and shuffles it into their deck\.$/, () => [{ k: 'coinHandToDeck', sure: true }]],
	[/^If 1 of your Pokémon used Sweets Relay during your last turn, this attack does (\d+) more damage\.$/, m => [{ k: 'relayBonus', bonus: +m[1] }]],
	[/^If this Pokémon evolved during this turn, this attack does (\d+) more damage\.$/, m => [{ k: 'evolvedBonus', bonus: +m[1] }]],
	[/^Discard all Energy attached to this Pokémon\. Your opponent's Active Pokémon is now Paralyzed\.$/, () => [{ k: 'discardSelfEnergy', type: null, n: 'all' }, { k: 'status', s: 'paralyzed' }]],
	[/^This attack does (\d+) damage for each Energy attached to all of your opponent's Pokémon\.$/, m => [{ k: 'perOppEnergyAll', per: +m[1] }]],
	[/^This attack does (\d+) more damage for each Evolution Pokémon on your Bench\.$/, m => [{ k: 'perBenchEvolved', n: +m[1] }]],
	[/^Flip a coin\. If heads, choose 1 of your opponent's Active Pokémon's attacks and use it as this attack\.$/, () => [{ k: 'copyAttack', active: true, free: true, coin: true }]],
	[/^This attack does (\d+) damage for each time your Pokémon used Sweets Relay during this game\.$/, m => [{ k: 'perRelay', per: +m[1] }]],
	[/^This attack also does (\d+) damage to each of your Benched Pokémon\.$/, m => [{ k: 'ownBenchAll', n: +m[1] }]],
	[/^If the Defending Pokémon is a Basic Pokémon, it can't attack during your opponent's next turn\.$/, () => [{ k: 'targetCantAttack', basic: true }]],
	[/^Discard all Pokémon Tools from your opponent's Active Pokémon\.$/, () => [{ k: 'discardTargetTools', plain: true }]],
	[/^Flip a coin\. If tails, this attack does nothing\. If heads, your opponent's Active Pokémon is now Paralyzed\.$/, () => [{ k: 'coinNothing' }, { k: 'status', s: 'paralyzed', ifHit: true }]],
	// Extradimensional Crisis (A3a)
	[/^If (\w+) is on your Bench, this attack does (\d+) more damage\.$/, m => [{ k: 'benchHasBonus', name: m[1], bonus: +m[2] }]],
	[/^Discard a random Pokémon Tool card from your opponent's hand\.$/, () => [{ k: 'discardItemFromHand', kind: 'tool' }]],
	[/^Flip (\d) coins\. For each heads, a card is chosen at random from your opponent's hand\. Your opponent reveals that card and shuffles it into their deck\.$/, m => [{ k: 'coinsHandToDeck', coins: +m[1] }]],
	[/^Flip a coin until you get tails\. For each heads, discard a random Energy from your opponent's Active Pokémon\.$/, () => [{ k: 'flipDiscardTargetEnergy' }]],
	[/^Flip (\d) coins\. If both of them are heads, your opponent's Active Pokémon is Knocked Out\.$/, m => [{ k: 'coinsKO', coins: +m[1] }]],
	[/^If you played a Supporter card from your hand during this turn, this attack does (\d+) more damage\.$/, m => [{ k: 'supporterBonus', bonus: +m[1] }]],
	[/^1 Special Condition from among Asleep, Burned, Confused, Paralyzed, and Poisoned is chosen at random, and your opponent's Active Pokémon is now affected by that Special Condition\. Any Special Conditions already affecting that Pokémon will not be chosen\.$/, () => [{ k: 'randomStatus' }]],
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
	[/^Once during your turn, you may take (?:1|a) \{(\w)\} Energy from your Energy Zone and attach it to the \{\w\} Pokémon in the Active Spot\.$/, m => ({ k: 'attachZoneActiveType', type: en(m[1]), once: true })],
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
	// Shining Revelry (A2b)
	[/^Your Active (\w+) has no Retreat Cost\.$/, m => ({ k: 'freeRetreatNamed', names: [m[1]], passive: true })],
	[/^Once during your turn, you may take a \{(\w)\} Energy from your Energy Zone and attach it to this Pokémon\. If you use this Ability, your turn ends\.$/, m => ({ k: 'attachZoneSelf', type: en(m[1]), once: true, endsTurn: true })],
	[/^Once during your turn, you may flip a coin\. If heads, your opponent's Active Pokémon is now Poisoned\.$/, () => ({ k: 'coinPoison', once: true })],
	[/^Once during your turn, you may heal (\d+) damage from your Active Pokémon\.$/, m => ({ k: 'healActive', n: +m[1], once: true })],
	// Celestial Guardians (A3)
	[/^During your first turn, this Pokémon has no Retreat Cost\.$/, () => ({ k: 'firstTurnFreeRetreat', passive: true })],
	[/^Once during your turn, you may heal (\d+) damage from each of your \{(\w)\} Pokémon\.$/, m => ({ k: 'healAll', n: +m[1], type: en(m[2]), once: true })],
	[/^If this Pokémon is in the Active Spot and is Knocked Out by damage from an attack from your opponent's Pokémon, do (\d+) damage to the Attacking Pokémon\.$/, m => ({ k: 'koCounter', n: +m[1], passive: true })],
	[/^Prevent all damage done to this Pokémon by attacks from your opponent's Pokémon ex\.$/, () => ({ k: 'preventFromEx', passive: true })],
	[/^Each of your Pokémon that has any \{(\w)\} Energy attached recovers from all Special Conditions and can't be affected by any Special Conditions\.$/, m => ({ k: 'energyNoStatus', type: en(m[1]), passive: true })],
	[/^Once during your turn, you may move all \{(\w)\} Energy from 1 of your Benched \{\w\} Pokémon to your Active Pokémon\.$/, m => ({ k: 'gatherFrom', type: en(m[1]), once: true })],
	[/^If this Pokémon would be Knocked Out by damage from an attack, flip a coin\. If heads, this Pokémon is not Knocked Out, and its remaining HP becomes (\d+)\.$/, m => ({ k: 'endure', hp: +m[1], passive: true })],
	[/^If this Pokémon is in the Active Spot and is Knocked Out by damage from an attack from your opponent's Pokémon, move all \{(\w)\} Energy from this Pokémon to 1 of your Benched Pokémon\.$/, m => ({ k: 'koPassEnergy', type: en(m[1]), passive: true })],
	[/^Once during your turn, if this Pokémon is on your Bench, you may switch it with your Active Pokémon\.$/, () => ({ k: 'benchSwap', once: true })],
	[/^As long as this Pokémon is in the Active Spot, whenever you attach an Energy from your Energy Zone to it, it is now Asleep\.$/, () => ({ k: 'attachSleep', passive: true })],
	// Paradox Drive (B3a)
	[/^Once during your turn, when you put this Pokémon from your hand onto your Bench, you may switch it with your Active Pokémon\. If you do, move all of your Energy in play to this Pokémon\.$/, () => ({ k: 'onBenchDrive', passive: true })],
	[/^Once during your turn, when you put this Pokémon from your hand onto your Bench, you may switch out your opponent's Active Pokémon to the Bench\. \(Your opponent chooses the new Active Pokémon\.\)$/, () => ({ k: 'onBenchDriveOff', passive: true })],
	[/^Attacks used by your Future Pokémon cost (\d) less \{C\} Energy\.$/, m => ({ k: 'futureCostLess', n: +m[1], passive: true })],
	[/^During Pokémon Checkup, heal (\d+) damage from each of your Pokémon\.$/, m => ({ k: 'checkupHealAll', n: +m[1], passive: true })],
	// Pulsing Aura (B3)
	[/^Each of your evolved Pokémon can use any attack from its previous Evolutions\. \(You still need the necessary Energy to use each attack\.\)$/, () => ({ k: 'timeRecall', passive: true })],
	[/^Once during your turn, after you flip any coins for an attack of 1 of your \{(\w)\} Pokémon, you may ignore all results of those coin flips and begin flipping those coins again\. You can't use more than 1 Victory Star Ability each turn\.$/, m => ({ k: 'victoryStar', type: en(m[1]), passive: true })],
	[/^Once during your turn, if this Pokémon is in the Active Spot, you may switch out your opponent's Active Pokémon to the Bench\. \(Your opponent chooses the new Active Pokémon\.\)$/, () => ({ k: 'driveOff', once: true, active: true })],
	[/^Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may do (\d+) damage to your opponent's Active Pokémon\.$/, m => ({ k: 'onEvolvePing', n: +m[1], passive: true })],
	[/^As long as this Pokémon is in play, it is \{(\w)\} and \{(\w)\} type\.$/, m => ({ k: 'doubleType', types: [en(m[1]), en(m[2])], passive: true })],
	[/^Once during your turn, if this Pokémon is in the Active Spot, you may make your opponent's Active Pokémon (\w+)\.$/, m => ({ k: 'statusActive', s: m[1].toLowerCase(), once: true, active: true })],
	[/^Once during your turn, if this Pokémon is on your Bench, you may move (\d+) damage that your Active Pokémon has on it to this Pokémon\.$/, m => ({ k: 'takeSome', n: +m[1], once: true })],
	[/^As long as this Pokémon is on your Bench, your Active \{(\w)\} Pokémon's Retreat Cost is (\d) less\.$/, m => ({ k: 'benchRetreatLess', n: +m[2], type: en(m[1]), passive: true })],
	[/^During Pokémon Checkup, if this Pokémon is in the Active Spot, do (\d+) damage to each of your opponent's Pokémon\.$/, m => ({ k: 'checkupPingAll', n: +m[1], passive: true })],
	[/^Once during your turn, you may remove a random Special Condition from your Active Pokémon\.$/, () => ({ k: 'cureRandom', once: true })],
	[/^If you don't have (\w+), (\w+), and (\w+) on your Bench, this Pokémon can't attack\.$/, m => ({ k: 'sealed', names: [m[1], m[2], m[3]], passive: true })],
	// Mega Shine (B2b)
	[/^At the end of each turn, if your opponent's Active Pokémon is Asleep, do (\d+) damage to that Pokémon\.$/, m => ({ k: 'sleepPing', n: +m[1], passive: true })],
	// Paldean Wonders (B2a)
	[/^Once during your turn, you may heal (\d+) damage from 1 of your Pokémon ex that has any Energy attached\. If you do, discard a random Energy from that Pokémon\.$/, m => ({ k: 'healExForEnergy', n: +m[1], once: true })],
	[/^Once during your turn, you may discard 1 \{(\w)\} Energy from this Pokémon in order to use this Ability\. During this turn, attacks used by your \{\w\} Pokémon do \+(\d+) damage to your opponent's Active Pokémon\.$/, m => ({ k: 'boostForEnergy', type: en(m[1]), n: +m[2], once: true })],
	[/^If this Pokémon's remaining HP is (\d+) or less, attacks used by this Pokémon do \+(\d+) damage to your opponent's Active Pokémon\.$/, m => ({ k: 'lowHpBoost', hp: +m[1], n: +m[2], passive: true })],
	// Fantastical Parade (B2)
	[/^Each of your Pokémon that has any Energy attached recovers from all Special Conditions and can't be affected by any Special Conditions\.$/, () => ({ k: 'energyNoStatus', type: null, passive: true })],
	[/^If a Stadium is in play, this Pokémon has no Retreat Cost\.$/, () => ({ k: 'stadiumFreeRetreat', passive: true })],
	[/^At the beginning of your turn, if this Pokémon is in the Active Spot, put a random \{(\w)\} Pokémon from your deck into your hand\.$/, m => ({ k: 'startTurnTypeToHand', type: en(m[1]), passive: true })],
	[/^When this Pokémon is first damaged by an attack after coming into play, prevent that damage\.$/, () => ({ k: 'disguise', passive: true })],
	[/^Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may have your opponent shuffle their hand into their deck\. For each remaining point that your opponent needs to win, they draw a card\.$/, () => ({ k: 'onEvolveRefresh', passive: true })],
	[/^If you have another (\w+) in play, this Pokémon's attacks do \+(\d+) damage to your opponent's Active Pokémon, and this Pokémon takes -(\d+) damage from attacks from your opponent's Pokémon\.$/, m => ({ k: 'buddy', name: m[1], plus: +m[2], minus: +m[3], passive: true })],
	[/^Basic Pokémon in play \(both yours and your opponent's\) have no Abilities\.$/, () => ({ k: 'noBasicAbilities', passive: true })],
	[/^If this Pokémon is in the Active Spot and is Knocked Out by damage from an attack from your opponent's Pokémon, do (\d+) damage to each of your opponent's Pokémon\.$/, m => ({ k: 'koSplash', n: +m[1], passive: true })],
	[/^Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may put (\d) random Pokémon Tool cards from your discard pile into your hand\.$/, m => ({ k: 'onEvolveTools', n: +m[1], passive: true })],
	[/^Once during your turn, if this Pokémon is in the Active Spot, you may look at a random Supporter card from your opponent's hand\. Use the effect of that card as the effect of this Ability\.$/, () => ({ k: 'portrait', once: true, active: true })],
	[/^Once during your turn, you may switch out your opponent's Active Basic Pokémon to the Bench\. \(Your opponent chooses the new Active Pokémon\.\)$/, () => ({ k: 'driveOff', basic: true, once: true })],
	// Crimson Blaze (B1a)
	[/^Your opponent's Active Pokémon's Retreat Cost is (\d) more\.$/, m => ({ k: 'oppRetreatMore', n: +m[1], passive: true })],
	[/^Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may take a \{(\w)\} Energy from your Energy Zone and attach it to your Active \{\w\} Pokémon\.$/, m => ({ k: 'onEvolveAttach', type: en(m[1]), passive: true })],
	[/^As long as this Pokémon is on your Bench, prevent all damage done to this Pokémon by attacks\.$/, () => ({ k: 'benchShield', passive: true })],
	[/^This Pokémon gets \+(\d+) HP for each \{(\w)\} Energy attached to it\.$/, m => ({ k: 'energyHp', n: +m[1], type: en(m[2]), passive: true })],
	// Mega Rising (B1)
	[/^Each of your \{(\w)\} Pokémon gets \+(\d+) HP\.$/, m => ({ k: 'typeHp', type: en(m[1]), n: +m[2], passive: true })],
	[/^Once during your turn, you may flip a coin\. If heads, switch in 1 of your opponent's Benched Pokémon to the Active Spot\.$/, () => ({ k: 'coinPull', once: true })],
	[/^Once during your turn, you may discard the top card of your opponent's deck\.$/, () => ({ k: 'millOpp', n: 1, once: true })],
	[/^If this Pokémon is in the Active Spot and is damaged by an attack from your opponent's Pokémon, take a \{(\w)\} Energy from your Energy Zone and attach it to 1 of your Benched Pokémon\.$/, m => ({ k: 'hitAttachBench', type: en(m[1]), passive: true })],
	[/^Once during your turn, you may switch your Active \{(\w)\} Pokémon with 1 of your Benched Pokémon\.$/, m => ({ k: 'switchActiveType', type: en(m[1]), once: true })],
	[/^If this Pokémon has full HP, it takes -(\d+) damage from attacks from your opponent's Pokémon\.$/, m => ({ k: 'fullHpReduce', n: +m[1], passive: true })],
	[/^As long as this Pokémon is in the Active Spot, whenever your opponent attaches an Energy from their Energy Zone to 1 of their Pokémon, do (\d+) damage to that Pokémon\.$/, m => ({ k: 'oppAttachPing', n: +m[1], passive: true })],
	[/^When this Pokémon is Knocked Out, flip a coin\. If heads, your opponent can't get any points for it\.$/, () => ({ k: 'koNoPoints', passive: true })],
	[/^Once during your turn, if this Pokémon is on your Bench, you may discard all Pokémon Tools from your opponent's Active Pokémon\. If you do, discard this Pokémon\.$/, () => ({ k: 'toolsThenDiscardSelf', once: true })],
	[/^Once during your turn, you may take (\d) \{(\w)\} Energy from your Energy Zone and attach it to this Pokémon\. If you do, do (\d+) damage to this Pokémon\.$/, m => ({ k: 'attachZoneSelfDmg', n: +m[1], type: en(m[2]), dmg: +m[3], once: true })],
	[/^If this Pokémon is in the Active Spot and is damaged by an attack from your opponent's Pokémon, the Attacking Pokémon is now Poisoned\.$/, () => ({ k: 'poisonAttacker', passive: true })],
	[/^Attacks used by your \{(\w)\} Pokémon and \{(\w)\} Pokémon do \+(\d+) damage to your opponent's Active Pokémon\.$/, m => ({ k: 'typesBoost', types: [en(m[1]), en(m[2])], n: +m[3], passive: true })],
	[/^As long as this Pokémon is in the Active Spot, it can evolve during your first turn or the turn you play it\.$/, () => ({ k: 'fastEvolve', passive: true })],
	[/^Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may put a Supporter card from your discard pile into your hand\.$/, () => ({ k: 'onEvolveSupporter', passive: true })],
	// Secluded Springs (A4a)
	[/^At the end of your turn, if this Pokémon is in the Active Spot, draw a card\.$/, () => ({ k: 'endTurnDraw', n: 1, passive: true })],
	[/^If this Pokémon is in the Active Spot and is Knocked Out by damage from an attack from your opponent's Pokémon, flip a coin\. If heads, the Attacking Pokémon is Knocked Out\.$/, () => ({ k: 'koCoinKO', passive: true })],
	[/^Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may heal (\d+) damage from 1 of your \{(\w)\} Pokémon\.$/, m => ({ k: 'onEvolveHeal', n: +m[1], type: en(m[2]), passive: true })],
	[/^Once during your turn, when you put this Pokémon from your hand onto your Bench, you may have your opponent reveal their hand\.$/, () => ({ k: 'onBenchReveal', passive: true })],
	[/^If your opponent's Pokémon is Knocked Out by damage from this Pokémon's attacks, during your opponent's next turn, prevent all damage from-and effects of-attacks done to this Pokémon\.$/, () => ({ k: 'koGuard', passive: true })],
	// Wisdom of Sea and Sky (A4)
	[/^Your Active Pokémon has no Retreat Cost\.$/, () => ({ k: 'activeNoRetreat', passive: true })],
	[/^If this Pokémon has a Pokémon Tool attached, attacks used by this Pokémon cost (\d) less \{(\w)\} Energy\.$/, m => ({ k: 'toolCostLess', n: +m[1], type: en(m[2]), passive: true })],
	[/^Once during your turn, you may make your opponent's Active Pokémon Burned\.$/, () => ({ k: 'statusActive', s: 'burned', once: true })],
	[/^As long as this Pokémon is on your Bench, attacks used by your Pokémon that evolve from (\w+) do \+(\d+) damage to your opponent's Active Pokémon\.$/, m => ({ k: 'benchBoost', from: m[1], n: +m[2], passive: true })],
	[/^Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may discard a random Energy from your opponent's Active Pokémon\.$/, () => ({ k: 'onEvolveDiscard', passive: true })],
	[/^If any damage is done to this Pokémon by attacks, flip a coin\. If heads, prevent that damage\.$/, () => ({ k: 'coinPreventDamage', passive: true })],
	[/^Once during your turn, if this Pokémon is in the Active Spot, you may heal (\d+) damage from 1 of your Pokémon\.$/, m => ({ k: 'healAny', n: +m[1], once: true, active: true })],
	[/^This Ability works if you have any Unown in play with an Ability other than \. All of your Pokémon take -(\d+) damage from attacks from your opponent's Pokémon\.$/, m => ({ k: 'unownGuard', n: +m[1], self: 'GUARD', passive: true })],
	[/^This Ability works if you have any Unown in play with an Ability other than \. Attacks used by your Pokémon do \+(\d+) damage to your opponent's Active Pokémon\.$/, m => ({ k: 'unownPower', n: +m[1], self: 'POWER', passive: true })],
	[/^Once during your turn, if this Pokémon is in the Active Spot, you may switch in 1 of your opponent's Benched Pokémon that has damage on it to the Active Spot\.$/, () => ({ k: 'pullDamaged', once: true, active: true })],
	[/^Once during your turn, you may move all \{(\w)\} Energy from each of your Pokémon to this Pokémon\.$/, m => ({ k: 'gatherAll', type: en(m[1]), once: true })],
	[/^Whenever you attach an Energy from your Energy Zone to this Pokémon, put a random card from your deck that evolves from this Pokémon onto this Pokémon to evolve it\.$/, () => ({ k: 'zoneEvolve', passive: true })],
	[/^This Pokémon can't be Asleep\.$/, () => ({ k: 'noSleep', passive: true })],
	// Eevee Grove (A3b)
	[/^Once during your turn, you may attach a \{(\w)\} Energy from your discard pile to this Pokémon\. If you do, do (\d+) damage to this Pokémon\.$/, m => ({ k: 'attachDiscardSelf', type: en(m[1]), n: +m[2], once: true })],
	[/^Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may draw (\d) cards\.$/, m => ({ k: 'onEvolveDraw', n: +m[1], passive: true })],
	[/^This Pokémon can evolve into any Pokémon that evolves from (\w+) if you play it from your hand onto this Pokémon\. \(This Pokémon can't evolve during your first turn or the turn you play it\.\)$/, m => ({ k: 'evolveAs', name: m[1], passive: true })],
	[/^At the end of your turn, if this Pokémon is in the Active Spot, heal (\d+) damage from it\.$/, m => ({ k: 'endTurnHeal', n: +m[1], passive: true })],
	[/^Once during your turn, you may put a random Pokémon Tool card from your deck into your hand\.$/, () => ({ k: 'pokemonToHand', kind: 'tool', once: true })],
	// Extradimensional Crisis (A3a)
	[/^As long as this Pokémon is in the Active Spot, attacks used by your opponent's Active Pokémon do -(\d+) damage\.$/, m => ({ k: 'activeAtkMinus', n: +m[1], passive: true, active: true })],
	[/^At the end of your first turn, take a \{(\w)\} Energy from your Energy Zone and attach it to this Pokémon\.$/, m => ({ k: 'firstTurnAttach', type: en(m[1]), passive: true })],
	[/^Once during your turn, you may put a random Pokémon from your deck into your hand\.$/, () => ({ k: 'pokemonToHand', once: true })],
	[/^Pokémon \(both yours and your opponent's\) can't be healed\.$/, () => ({ k: 'healBlock', passive: true })],
	[/^Your opponent's Active Pokémon takes \+(\d+) damage from being Poisoned\.$/, m => ({ k: 'morePoison', n: +m[1], passive: true })],
	[/^As long as this Pokémon is in the Active Spot, attacks used by your opponent's Active Pokémon cost (\d) \{C\} more\.$/, m => ({ k: 'activeCostMore', n: +m[1], passive: true, active: true })],
	[/^Once during your turn, you may switch your Active Ultra Beast with 1 of your Benched Ultra Beasts\.$/, () => ({ k: 'ubSwap', once: true })],
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
	// Shining Revelry (A2b)
	[/^Each player shuffles the cards in their hand into their deck, then draws that many cards\.$/, () => ({ k: 'iono' })],
	[/^Heal (\d+) damage from 1 of your Pokémon, and it recovers from all Special Conditions\.$/, m => ({ k: 'healOne', n: +m[1], type: null, cure: true })],
	[/^During this turn, attacks used by your Pokémon do \+(\d+) damage to your opponent's Active Pokémon ex\.$/, m => ({ k: 'boost', n: +m[1], names: null, ex: true })],
	[/^Flip a coin until you get tails\. For each heads, discard a random Energy from your opponent's Active Pokémon\.$/, () => ({ k: 'flipDiscardEnergy' })],
	// Celestial Guardians (A3)
	[/^Heal (\d+) damage and remove a random Special Condition from your Active Pokémon\.$/, m => ({ k: 'healCureActive', n: +m[1] })],
	[/^Put a random Basic \{(\w)\} Pokémon from your discard pile into your hand\.$/, m => ({ k: 'basicFromDiscard', type: en(m[1]) })],
	[/^Choose 1 of your Basic Pokémon in play\. If you have a Stage 2 card in your hand that evolves from that Pokémon, put that card onto the Basic Pokémon to evolve it, skipping the Stage 1\. You can't use this card during your first turn or on a Basic Pokémon that was put into play this turn\.$/, () => ({ k: 'rareCandy' })],
	[/^Look at the top card of your deck\. Then, you may shuffle your deck\.$/, () => ({ k: 'peekShuffle' })],
	[/^If the Pokémon this card is attached to is your Active Pokémon and is damaged by an attack from your opponent's Pokémon, the Attacking Pokémon is now Poisoned\.$/, () => ({ k: 'toolPoison' })],
	[/^The \{(\w)\} Pokémon this card is attached to gets \+(\d+) HP\.$/, m => ({ k: 'toolHp', n: +m[2], type: en(m[1]) })],
	[/^Choose 1 of (your .+) that has damage on it, and move (\d+) of its damage to your opponent's Active Pokémon\.$/, m => ({ k: 'moveDamage', n: +m[2], names: names(m[1]) })],
	[/^Put 1 of your \{(\w)\} Pokémon that has damage on it into your hand\.$/, m => ({ k: 'returnDamaged', type: en(m[1]) })],
	[/^Choose 1 of (your .+)\. Take (\d) \{(\w)\} Energy from your Energy Zone and attach it to that Pokémon\. Your turn ends\.$/, m => ({ k: 'attachNamed', type: en(m[3]), names: names(m[1]), n: +m[2], endsTurn: true })],
	[/^Discard all Pokémon Tool cards attached to each of your opponent's Pokémon\.$/, () => ({ k: 'discardTools' })],
	[/^You can use this card only if you have (.+) in play\. Switch in 1 of your opponent's Benched Pokémon to the Active Spot\.$/, m => ({ k: 'pullDamaged', any: true, need: [m[1]] })],
	[/^Heal all damage from 1 of (your .+)\. If you do, discard all Energy from that Pokémon\.$/, m => ({ k: 'healAllNamed', names: names(m[1]) })],
	[/^Heal (\d+) damage from 1 of your Stage 2 Pokémon\.$/, m => ({ k: 'healOne', n: +m[1], type: null, stage: 2 })],
	// Paradox Drive (B3a)
	[/^The Ancient Pokémon this card is attached to gets \+(\d+) HP\.$/, m => ({ k: 'toolHp', n: +m[1], ancient: true })],
	[/^Attacks used by the Future Pokémon this card is attached to do \+(\d+) damage to your opponent's Active Pokémon\.$/, m => ({ k: 'toolFutureBoost', n: +m[1] })],
	[/^Put a random Stage (\d) Pokémon from your deck into your hand\.$/, m => ({ k: 'stageToHand', stage: +m[1] })],
	[/^Attach (\d) different types of Energy from your discard pile to your Ancient Pokémon in any way you like\.$/, m => ({ k: 'attachDiscardAncient', n: +m[1] })],
	[/^Shuffle 1 of your Future Pokémon in play into your deck\.$/, () => ({ k: 'shuffleFuture' })],
	[/^Once during each player's turn, that player may shuffle a Basic Pokémon from their hand into their deck\. If they do, they draw a card\.$/, () => ({ k: 'stadiumSwapBasic' })],
	// Pulsing Aura (B3)
	[/^Discard a Pokémon Tool card from a Pokémon \(yours or your opponent's\), or discard a Stadium card in play\.$/, () => ({ k: 'fieldBlower' })],
	[/^If the Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent's Pokémon, draw cards until you have (\d) cards in your hand\.$/, m => ({ k: 'toolKoDraw', n: +m[1] })],
	[/^During this turn, attacks used by your \{(\w)\} Pokémon do \+(\d+) damage to your opponent's Active Pokémon ex\.$/, m => ({ k: 'boost', n: +m[2], cardType: en(m[1]), ex: true })],
	[/^Put a random Stadium card from your deck into your hand\.$/, () => ({ k: 'stadiumToHand' })],
	[/^During your opponent's next turn, all of your (\w+) and ([\w ]+) take -(\d+) damage from attacks from your opponent's Pokémon ex\.$/, m => ({ k: 'guard', n: +m[3], names: [m[1], m[2]], fromEx: true })],
	[/^Put 1 of your \{(\w)\} Pokémon in play, except any Pokémon ex, into your hand\.$/, m => ({ k: 'returnTyped', type: en(m[1]) })],
	[/^Once during each player's turn, that player may put a random Basic \{(\w)\} Pokémon from their deck into their hand\.$/, m => ({ k: 'stadiumBasicToHand', type: en(m[1]) })],
	[/^Attacks used by each \{(\w)\} Pokémon in play \(both yours and your opponent's\) do \+(\d+) damage to the opponent's Active Pokémon ex\.$/, m => ({ k: 'stadiumTypeBoostEx', type: en(m[1]), n: +m[2] })],
	[/^When applying the opponent's Active Pokémon's Weakness to damage from attacks used by Pokémon in play \(both yours and your opponent's\) that aren't Mega Evolution Pokémon ex, apply Weakness as ×2\.$/, () => ({ k: 'stadiumWeaknessDouble' })],
	// Mega Shine (B2b)
	[/^Your opponent discards cards from their hand until they have (\d) cards in their hand\.$/, m => ({ k: 'oppDiscardTo', n: +m[1] })],
	[/^Shuffle (\d) cards from your hand into your deck\. Draw a card\. If you can't shuffle in \d cards, you can't use this card\.$/, m => ({ k: 'shuffleInDraw', n: +m[1], draw: 1 })],
	[/^During this turn, if your opponent's Active Pokémon is Knocked Out by damage from an attack used by your (\w+), you get 1 more point\.$/, m => ({ k: 'koBonusPoint', names: [m[1]], n: 1 })],
	[/^Draw a card for each Mega Evolution Pokémon ex in play \(both yours and your opponent's\)\.$/, () => ({ k: 'drawPerMega' })],
	[/^At the end of each player's turn, that player draws cards until they have (\d) cards in their hand\.$/, m => ({ k: 'stadiumEndDraw', n: +m[1] })],
	// Paldean Wonders (B2a)
	[/^Flip a coin\. If heads, take a \{(\w)\} Energy from your Energy Zone and attach it to 1 of your Benched \{\w\} Pokémon\.$/, m => ({ k: 'coinAttachBenchType', type: en(m[1]) })],
	[/^The Stage (\d) Pokémon this card is attached to has no Retreat Cost\.$/, m => ({ k: 'toolStageFreeRetreat', stage: +m[1] })],
	[/^Discard a random Energy from among the Energy attached to all of your opponent's Pokémon that have an Ability\.$/, () => ({ k: 'discardAbilityEnergy' })],
	[/^During this turn, attacks used by your (\w+) do \+(\d+) damage to your opponent's Active Pokémon ex\.$/, m => ({ k: 'boost', n: +m[2], names: [m[1]], ex: true })],
	[/^Flip a coin\. If heads, put a random Item card from your deck into your hand\. If tails, put a random Pokémon Tool card from your deck into your hand\.$/, () => ({ k: 'coinItemOrTool' })],
	[/^Once during each player's turn, that player may flip a coin\. If heads, that player puts a random Pokémon from their deck into their hand\. You may play only 1 Stadium card during your turn\. Put it next to the Active Spot, and discard it if another Stadium comes into play\. A Stadium with the same name can't be played\.$/, () => ({ k: 'stadiumCoinPokemon' })],
	// Fantastical Parade (B2)
	[/^Heal (\d+) damage from your Active Pokémon\. If you healed any damage in this way, flip a coin\. If heads, put this [\w ]+ into your hand instead of the discard pile\.$/, m => ({ k: 'healActiveReturn', n: +m[1] })],
	[/^As long as the Pokémon this card is attached to is on your Bench, prevent all damage done to that Pokémon by your opponent's attacks and Abilities\.$/, () => ({ k: 'toolPoncho' })],
	[/^If this card is attached to 1 of your Pokémon, discard it at the end of your opponent's turn\. The \{(\w)\} Pokémon this card is attached to takes -(\d+) damage from attacks from your opponent's Pokémon\.$/, m => ({ k: 'toolBarrier', type: en(m[1]), n: +m[2] })],
	[/^Heal (\d+) damage from 1 of your \{(\w)\} Pokémon that has (\d) or more \{\w\} Energy attached\. If you healed any damage in this way, discard (\d) \{\w\} Energy from that Pokémon\.$/, m => ({ k: 'healForEnergy', n: +m[1], type: en(m[2]), need: +m[3], cost: +m[4] })],
	[/^Look at the top (\d) cards of your deck\. Put all Stage 1 Pokémon you find there into your hand\. Shuffle the other cards back into your deck\.$/, m => ({ k: 'topTools', n: +m[1], stage: 1 })],
	[/^You can use this card only if your Pokémon in play have (\d) or more different types of Energy attached\. Move all Energy from each of your Benched Pokémon to your Active Pokémon\.$/, m => ({ k: 'juggler', need: +m[1] })],
	[/^You can use this card only if you have ([\w ]+) in play\. Discard (\d) random Energy from your opponent's Active Pokémon\.$/, m => ({ k: 'discardOppRandomEnergy', need: [m[1]], n: +m[2] })],
	[/^Attacks used by Stage 1 Pokémon in play \(both yours and your opponent's\) do \+(\d+) damage to the opponent's Active Pokémon\.$/, m => ({ k: 'stadiumStageBoost', stage: 1, n: +m[1] })],
	[/^Each Basic Pokémon in play \(both yours and your opponent's\) gets \+(\d+) HP\.$/, m => ({ k: 'stadiumBasicHp', n: +m[1] })],
	[/^The Retreat Cost of each \{(\w)\} Pokémon in play \(both yours and your opponent's\) is (\d) less\.$/, m => ({ k: 'stadiumTypeRetreat', type: en(m[1]), n: +m[2] })],
	// Crimson Blaze (B1a)
	[/^During this turn, attacks used by your (\w+) or (\w+) do \+(\d+) damage to your opponent's Pokémon\.$/, m => ({ k: 'boost', n: +m[3], names: [m[1], m[2]], any: true })],
	[/^Choose 1 of your \{(\w)\} Pokémon in play\. Put a random \{\w\} Pokémon from your deck that evolves from that Pokémon onto that Pokémon to evolve it\. You can't use this card during your first turn or on a Pokémon that was put into play this turn\.$/, m => ({ k: 'evolveFromDeckType', type: en(m[1]) })],
	[/^Put (\d) random cards from among (\w+), (\w+), and ([\w' ]+) from your deck into your hand\.$/, m => ({ k: 'namesToHand', n: +m[1], names: [m[2], m[3], m[4]] })],
	[/^Put a random Mega Evolution Pokémon ex from your deck into your hand\.$/, () => ({ k: 'megaToHand' })],
	// Mega Rising (B1)
	[/^A card from among both player's hands is chosen at random, revealed to the other player, and shuffled into its owner's deck\.$/, () => ({ k: 'prankSpinner' })],
	[/^Flip (\d) coins\. If both of them are heads, discard a random Energy from your opponent's Active Pokémon\.$/, m => ({ k: 'coinsDiscardEnergy', coins: +m[1] })],
	[/^Attach a \{(\w)\} Energy from your discard pile to your Active \{\w\} Pokémon\.$/, m => ({ k: 'attachDiscardActive', type: en(m[1]) })],
	[/^At the end of each turn, if the Pokémon this card is attached to has half of its maximum HP or less remaining, heal (\d+) damage from it\. If you do, discard this card\.$/, m => ({ k: 'toolBerry', n: +m[1] })],
	[/^If the Pokémon this card is attached to has a Retreat Cost of (\d) or more, it takes -(\d+) damage from attacks from your opponent's Pokémon\.$/, m => ({ k: 'toolHeavy', need: +m[1], n: +m[2] })],
	[/^Whenever your opponent's Pokémon is Knocked Out by damage from an attack used by the Pokémon this card is attached to, draw a card\.$/, () => ({ k: 'toolKoDraw' })],
	[/^Heal (\d+) damage from 1 of your (\w+) or (\w+)\.$/, m => ({ k: 'healOne', n: +m[1], type: null, names: [m[2], m[3]] })],
	[/^During your opponent's next turn, if your (\w+) or (\w+) would be Knocked Out by damage from an attack, it is not Knocked Out and its remaining HP becomes (\d+)\.$/, m => ({ k: 'guardEndure', names: [m[1], m[2]], hp: +m[3] })],
	[/^Put (\d) random Pokémon from your deck into your hand\. For each Pokémon you put into your hand in this way, choose a Pokémon to shuffle from your hand into your deck\.$/, m => ({ k: 'may', n: +m[1] })],
	[/^Take a \{(\w)\} Energy from your Energy Zone and attach it to each of your (\w+) and (\w+)\.$/, m => ({ k: 'attachZoneEachNamed', type: en(m[1]), names: [m[2], m[3]] })],
	[/^Shuffle your hand into your deck\. Draw a card for each card in your opponent's hand\.$/, () => ({ k: 'copycat' })],
	[/^Put (\d) random Basic Pokémon with (\d+) HP or less from your deck into your hand\.$/, m => ({ k: 'smallBasicsToHand', n: +m[1], hp: +m[2] })],
	// Secluded Springs (A4a)
	[/^The Retreat Cost of the \{(\w)\} Pokémon this card is attached to is (\d) less\.$/, m => ({ k: 'toolRetreatLess', type: en(m[1]), n: +m[2] })],
	[/^The Pokémon this card is attached to can use any attack from its previous Evolutions\. \(You still need the necessary Energy to use each attack\.\)$/, () => ({ k: 'toolMemory' })],
	[/^Heal (\d+) damage from 1 of your (\w+), and it recovers from being Asleep, Paralyzed, and Confused\.$/, m => ({ k: 'healNamedCure', n: +m[1], names: [m[2]] })],
	[/^Look at the top (\d) cards of your deck\. Put all Pokémon Tool cards you find there into your hand\. Shuffle the other cards back into your deck\.$/, m => ({ k: 'topTools', n: +m[1] })],
	[/^For each of your \{(\w)\} Pokémon in play, look at that many cards from the top of your opponent's deck and put them back in any order\.$/, m => ({ k: 'peekOrder', type: en(m[1]), opp: true })],
	// Wisdom of Sea and Sky (A4)
	[/^Move a \{(\w)\}, \{(\w)\}, or \{(\w)\} Energy from 1 of your Benched Pokémon to your Active Pokémon\.$/, m => ({ k: 'moveEnergyTypes', types: [en(m[1]), en(m[2]), en(m[3])] })],
	[/^Discard a \{(\w)\} Energy from your opponent's Active Pokémon\.$/, m => ({ k: 'discardOppEnergy', type: en(m[1]) })],
	[/^The \{(\w)\} Pokémon this card is attached to takes -(\d+) damage from attacks from your opponent's Pokémon, recovers from all Special Conditions, and can't be affected by any Special Conditions\.$/, m => ({ k: 'toolApron', type: en(m[1]), n: +m[2] })],
	[/^If the \{(\w)\} Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent's Pokémon, your opponent reveals a random card from their hand and shuffles it into their deck\.$/, m => ({ k: 'toolHandToDeck', type: en(m[1]) })],
	[/^If the Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent's Pokémon, put it into your hand instead of the discard pile\.$/, () => ({ k: 'toolRescue' })],
	[/^The next time you flip any number of coins for the effect of an attack, Ability, or Trainer card after using this card on this turn, the first coin flip will definitely be heads\.$/, () => ({ k: 'will' })],
	[/^Switch your Active Pokémon that has damage on it with 1 of your Benched Pokémon\.$/, () => ({ k: 'switchDamaged' })],
	[/^Your opponent reveals their hand\. Choose a Supporter card you find there and shuffle it into your opponent's deck\.$/, () => ({ k: 'silver' })],
	[/^Flip (\d) coins\. For each heads, a \{(\w)\} Pokémon is chosen at random from your discard pile and put into your hand\.$/, m => ({ k: 'coinsFromDiscard', coins: +m[1], type: en(m[2]) })],
	[/^During your opponent's next turn, all of your (\w+) and ([\w ]+) take -(\d+) damage from attacks from your opponent's Pokémon\.$/, m => ({ k: 'guard', n: +m[3], names: [m[1], m[2]] })],
	[/^For each of your \{(\w)\} Pokémon in play, look at that many cards from the top of your deck and put them back in any order\.$/, m => ({ k: 'peekOrder', type: en(m[1]) })],
	// Eevee Grove (A3b)
	[/^Choose 1: During this turn, attacks used by your Pokémon that evolve from (\w+) do \+(\d+) damage to your opponent's Active Pokémon\. Heal (\d+) damage from each of your Pokémon that evolves from \w+\.$/, m => ({ k: 'chooseOne', from: m[1], boost: +m[2], heal: +m[3] })],
	[/^At the end of your turn, if the Pokémon this card is attached to is in the Active Spot, heal (\d+) damage from that Pokémon\.$/, m => ({ k: 'toolEndHeal', n: +m[1] })],
	[/^Look at a random Supporter card that's not Penny from your opponent's deck and shuffle it back into their deck\. Use the effect of that card as the effect of this card\.$/, () => ({ k: 'penny' })],
	// Extradimensional Crisis (A3a)
	[/^You can use this card only if your opponent hasn't gotten any points\. During your opponent's next turn, all of your Ultra Beasts take -(\d+) damage from attacks from your opponent's Pokémon\.$/, m => ({ k: 'guard', n: +m[1], ub: true, needNoPoints: true })],
	[/^Switch out your opponent's Active Basic Pokémon to the Bench\. \(Your opponent chooses the new Active Pokémon\.\)$/, () => ({ k: 'driveOff', basic: true })],
	[/^If the \{(\w)\} Pokémon this card is attached to is in the Active Spot and is Knocked Out by damage from an attack from your opponent's Pokémon, move (\d) \{\w\} Energy from that Pokémon and attach 1 Energy each to \d of your Benched Pokémon\.$/, m => ({ k: 'toolKoEnergy', type: en(m[1]), n: +m[2] })],
	[/^Attacks used by the Ultra Beast this card is attached to do \+(\d+) damage to your opponent's Active Pokémon for each point you have gotten\.$/, m => ({ k: 'toolPointBoost', n: +m[1] })],
	[/^Your opponent reveals all of the Supporter cards in their deck\.$/, () => ({ k: 'revealSupporters' })],
	[/^You can use this card only if your opponent has gotten at least 1 point\. Choose 1 of your Ultra Beasts\. Attach (\d) random Energy from your discard pile to that Pokémon\.$/, m => ({ k: 'attachDiscard', n: +m[1], type: null, ub: true, needOppPoint: true })],
];
const WORD = { Grass: 'G', Fire: 'R', Water: 'W', Lightning: 'L', Psychic: 'P', Fighting: 'F', Darkness: 'D', Metal: 'M' };
// (some records spell the types out: "a Fire Energy", "the Water Pokémon"; and write "from and effects of" without its dashes. They are read as the usual wording.)
const plain = t => t.replace(/\b(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal)(?= (?:Energy|Pokémon))/g, w => `{${WORD[w]}}`).replace(/damage from and effects of attacks/g, 'damage from-and effects of-attacks').replace(/^(Flip a coin\. If heads, )the Defending Pokémon is now/, "$1your opponent's Active Pokémon is now");
const read = (rows, text, what) => { const t = plain(tidy(text)); for (const [re, f] of rows) { const m = re.exec(t); if (m) return f(m); } if (SURVEY) { gaps.push(`${what}: "${t}"`); return null; } throw new Error(`no pattern reads this ${what}: "${t}"`); };

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
	spotDoom: N_OWNER + ' The spot is chosen by choosing the Pokémon that stands in it now.', emptyDeckCost: 'The printed cost is otherwise unchanged.',
	'AB:healExForEnergy': 'You choose the Pokémon ex.', 'AB:boostForEnergy': 'The bonus applies into any opponent\'s Active Pokémon.', 'AB:lowHpBoost': 'The bonus applies into any opponent\'s Active Pokémon.', 'TR:discardAbilityEnergy': N_CHOOSE,
	targetConfusedBonus: N_DEF, coinsBenchSplash: 'The Bench damage goes to the Defending Pokémon\'s owner only, not to every opponent.', revengeStatus: '"During your opponent\'s last turn" becomes "since your last turn", so it covers every opponent\'s turn. ' + N_DEF,
	randomCopy: N_OWNER + ' The chosen attack is aimed at this attack\'s own target; a choice it would ask for takes its default.', oppHandCountBonus: N_OWNER, noTrainers: N_OWNER, benchAllBoth: 'It reaches your Bench and the Bench of the Defending Pokémon\'s owner.',
	'AB:sleepPing': 'It reaches every opposing Active Pokémon that is Asleep.', 'TR:oppDiscardTo': N_CHOOSE + ' That player chooses the cards.', 'TR:koBonusPoint': 'It covers the Active Pokémon of any opponent.', 'TR:drawPerMega': 'It counts every player\'s.',
	benchStageBonus: null, targetAsleepBonus: N_DEF, targetNoAbility: N_SLOT, untilTailsMill: N_OWNER, noEvolve: N_OWNER, oppHasTypeBonus: N_OWNER, stadiumStatus: N_DEF,
	'AB:onEvolvePing': N_CHOOSE, 'AB:takeSome': N_SLOT, 'AB:checkupPingAll': '"Pokémon Checkup" is the end of each turn. It reaches every opponent. ' + N_SLOT, 'AB:cureRandom': N_SLOT,
	'TR:fieldBlower': 'It reaches the Pokémon of every player.', 'TR:toolKoDraw': 'It covers attacks from every opponent.', 'TR:stadiumTypeBoostEx': 'It serves every player.',
	'TR:stadiumWeaknessDouble': 'This game has no ×2 Weakness: its flat +20 type bonus stands in for Weakness, and it is that bonus this Stadium turns into ×2. A type penalty (-20) still applies.',
	firstUseStatus: N_DEF, firstUseNoTrainers: N_OWNER, targetVulnerableNext: N_DEF, pullThenHit: 'You choose the opposing Active Pokémon and which of its owner\'s Benched Pokémon takes its slot.', evolvedDiscardTarget: N_DEF,
	'AB:onBenchDrive': N_SLOT, 'AB:onBenchDriveOff': N_SWITCH, 'AB:checkupHealAll': '"Pokémon Checkup" is the end of each turn.', 'TR:toolFutureBoost': 'The bonus applies into any opponent\'s Active Pokémon.',
	'TR:attachDiscardAncient': 'If your discard pile holds fewer types, each of them is attached; if it holds more, they are taken at random. You choose the Ancient Pokémon for each.',
	'TR:stadiumCoinPokemon': 'It serves every player, each on their own turn. The rules reminder printed on the card is the Stadium rule itself (RULES.md).',
	oppPointsBonus: 'It reads the points of the Defending Pokémon\'s owner.', nextTurnBoost: 'The bonus applies into any opponent\'s Active Pokémon.', coinDamageOrHeal: N_DEF, randomEnergyAll: 'Every player\'s Pokémon are in the draw.', bothEnergyBonus: N_DEF,
	fewerPokemonBonus: 'It compares with the Defending Pokémon\'s owner.', moreEnergyBonus: N_DEF, coinDiscardTarget: N_DEF, retreatTrap: N_UNTIL + ' It answers any opponent\'s retreat.', selfReduceEx: N_UNTIL, twice: N_DEF, discardStadium: 'There is one Stadium for the whole table.', stadiumBonus: 'There is one Stadium for the whole table.',
	'AB:stadiumFreeRetreat': 'There is one Stadium for the whole table.', 'AB:startTurnTypeToHand': N_SLOT, 'AB:onEvolveRefresh': N_CHOOSE, 'AB:buddy': 'The bonus applies into any opponent\'s Active Pokémon, and the reduction covers attacks from every opponent.', 'AB:noBasicAbilities': 'It covers every player\'s Basic Pokémon.',
	'AB:koSplash': N_SLOT + ' It hits the Pokémon of the Attacking Pokémon\'s owner.', 'AB:portrait': N_SLOT + ' ' + N_CHOOSE + ' You are shown the card, then use its effect as a second step this turn.',
	'TR:healActiveReturn': N_SLOT, 'TR:toolPoncho': 'It covers every opponent.', 'TR:toolBarrier': 'It is discarded at the end of the next turn any opponent takes.', 'TR:juggler': N_SLOT, 'TR:discardOppRandomEnergy': N_CHOOSE,
	'TR:stadiumStageBoost': 'It covers every player; the bonus applies into any opposing Active Pokémon.', 'TR:stadiumBasicHp': 'It covers every player.', 'TR:stadiumTypeRetreat': 'It covers every player.',
	extraEnergyAlsoBench: 'The Benched Pokémon may belong to any opponent; you choose them.', selfNoWeakness: N_UNTIL, perOppDeckTrainer: 'It counts the deck of the Defending Pokémon\'s owner.',
	'AB:oppRetreatMore': 'It reaches the Active Pokémon of every opponent.', 'AB:onEvolveAttach': N_SLOT, 'TR:boost': 'The bonus applies into any opponent\'s Pokémon.',
	selfPreventSmall: N_UNTIL, selfPreventFromBasic: N_UNTIL, chooseStatus: N_DEF, randomBench: 'The Pokémon are chosen from the Bench of the Defending Pokémon\'s owner.', targetAttachSleep: N_OWNER, ignoreWeakness: 'Here "Weakness" is the +20 of a Combat Type that is strong against the Defending Pokémon.',
	perOppAbility: 'It counts the Pokémon of the Defending Pokémon\'s owner.', discardSupporterFromHand: N_OWNER, ignoreTargetEffects: N_DEF, coinsDiscardOrNothing: N_DEF, selfReduce: N_UNTIL,
	'AB:coinPull': 'You choose the opponent, their Benched Pokémon, and which of their Active Pokémon it trades places with, before the coin.', 'AB:millOpp': N_CHOOSE, 'AB:hitAttachBench': N_SLOT, 'AB:switchActiveType': N_SLOT, 'AB:fullHpReduce': 'It covers attacks from every opponent.',
	'AB:oppAttachPing': N_SLOT + ' It answers every opponent\'s Energy.', 'AB:koNoPoints': 'It answers a Knock Out by any opponent.', 'AB:toolsThenDiscardSelf': N_CHOOSE, 'AB:poisonAttacker': N_SLOT, 'AB:typesBoost': 'The bonus applies into any opponent\'s Active Pokémon.', 'AB:fastEvolve': N_SLOT,
	'TR:prankSpinner': 'Every player\'s hand is in the draw, and the card is shown to everyone.', 'TR:coinsDiscardEnergy': N_CHOOSE, 'TR:attachDiscardActive': N_SLOT, 'TR:toolHeavy': 'It covers attacks from every opponent.', 'TR:toolKoDraw': 'It answers the Knock Out of any opponent\'s Pokémon.',
	'TR:guardEndure': N_UNTIL, 'TR:copycat': N_CHOOSE,
	devolveTarget: N_OWNER, millTarget: N_OWNER, coinStatuses: N_DEF, perAllBench: 'It counts your Bench and the Bench of the Defending Pokémon\'s owner.', doom: N_OWNER, targetNameBonus: N_DEF,
	selfAtkPlusLasting: N_SLOT, 'AB:koCoinKO': N_SLOT, selfDamageBonus: N_DEF, 'AB:endTurnDraw': N_SLOT, 'AB:onBenchReveal': N_CHOOSE, 'AB:koGuard': N_UNTIL, 'TR:peekOrder': N_CHOOSE,
	perTargetRetreat: N_DEF, targetBurnedBonus: N_DEF, coinStatus2: N_DEF, coinSetHp: N_DEF, targetEvolvedBonus: N_DEF, recolorEnergy: N_DEF, drawToMatch: N_OWNER, coinDiscardHand: N_OWNER, perTargetEnergy: N_DEF,
	randomHitsAny: 'Any Pokémon in the match other than this one may be chosen.', wasHitBonus: 'With several opponents, "your opponent\'s last turn" is any opponent\'s turn since your own last turn.',
	'AB:activeNoRetreat': 'It covers both of your Active slots.', 'AB:statusActive': N_CHOOSE, 'AB:benchBoost': 'The bonus applies into any opponent\'s Active Pokémon.', 'AB:onEvolveDiscard': N_CHOOSE, 'AB:healAny': N_SLOT,
	'AB:unownGuard': 'The source record drops the Ability\'s own name from this sentence; it is restored here. The reduction covers attacks from every opponent.',
	'AB:unownPower': 'The source record drops the Ability\'s own name from this sentence; it is restored here. The bonus applies into any opponent\'s Active Pokémon.',
	'AB:pullDamaged': 'You choose the opponent, their damaged Benched Pokémon, and which of their Active Pokémon it trades places with.',
	'TR:moveEnergyTypes': N_SLOT, 'TR:discardOppEnergy': N_CHOOSE, 'TR:toolApron': 'It covers attacks from every opponent.', 'TR:toolHandToDeck': N_SLOT + ' The card comes from the hand of the Attacking Pokémon\'s owner.',
	'TR:toolRescue': 'It works against every opponent.', 'TR:switchDamaged': N_SLOT, 'TR:silver': N_CHOOSE,
	perOppEnergyAll: 'It counts the Energy on every Pokémon of the Defending Pokémon\'s owner.', 'AB:endTurnHeal': N_SLOT, 'TR:toolEndHeal': N_SLOT, 'TR:chooseOne': 'The bonus applies into any opponent\'s Active Pokémon.',
	'TR:penny': N_CHOOSE + ' You are shown the card, then use its effect as a second step this turn (it is lost if you do not).',
	coinsHandToDeck: N_OWNER, flipDiscardTargetEnergy: N_DEF, coinsKO: N_DEF, 'AB:activeAtkMinus': 'It weakens the attacks of every opponent\'s Active Pokémon while this Pokémon is in either Active slot.',
	'AB:activeCostMore': 'It reaches every opponent\'s Active Pokémon while this Pokémon is in either Active slot.', 'AB:healBlock': 'It holds for every player in the match.',
	'AB:morePoison': 'It reaches the Poisoned Active Pokémon of every opponent.', 'AB:ubSwap': N_SLOT, 'TR:revealSupporters': N_CHOOSE, 'TR:toolPointBoost': 'The bonus applies into any opponent\'s Active Pokémon.', 'TR:toolKoEnergy': N_SLOT,
	movedUpBonus: N_SLOT, targetBasicBonus: N_DEF, moreHpBonus: N_DEF, targetStatusBonus: N_DEF, targetAbilityBonus: N_DEF, randomStatus: N_DEF, noItems: N_OWNER, noZoneToActive: N_OWNER, targetCostMore: N_OWNER, discardItemFromHand: N_OWNER,
	selfVulnerable: N_UNTIL, selfThorns: N_UNTIL, snipePerEnergy: N_CHOOSE, 'AB:koCounter': N_SLOT, 'AB:koPassEnergy': N_SLOT + ' You choose the Benched Pokémon.', 'AB:gatherFrom': N_SLOT, 'AB:benchSwap': N_SLOT, 'AB:attachSleep': N_SLOT,
	'AB:preventFromEx': 'It reaches the Pokémon ex of every opponent.', 'TR:healCureActive': N_SLOT, 'TR:moveDamage': N_CHOOSE, 'TR:discardTools': 'It reaches every opponent.', 'TR:toolPoison': N_SLOT,
	'AB:coinPoison': N_CHOOSE, 'AB:healActive': N_SLOT, 'AB:freeRetreatNamed': N_SLOT, 'TR:flipDiscardEnergy': N_CHOOSE, 'TR:iono': 'Every player in the match does this.',
	coinHandToDeck: N_OWNER, 'AB:linkBoost': 'The bonus applies into any opponent\'s Active Pokémon.', 'AB:attachZoneAnyType': N_SLOT,
	'AB:checkupPing': 'With several opposing Active Pokémon, you choose which one takes the damage, at the end of every turn.',
	'TR:attachDiscard': 'With several opponents, one of them having a point is enough.',
	'AB:peekAny': 'Any player in the match may be chosen.', 'AB:benchRetreatLess': N_SLOT,
};
const same = (a, b) => { const p = String(a || '').replace(/[’]/g, "'").replace(/−/g, '-').replace(/\s+/g, ' ').trim(), q = String(b || '').replace(/\s+/g, ' ').trim(); return p === q || plain(p) === q; };   // (a record that spells the types out says the same thing)
/** The note for an adapted text: null when the wording is the print's (or differs only in punctuation). */
const noteFor = (keys, text, adapted) => {
	if (same(text, adapted)) return null;
	const n = [...new Set(keys.map(k => NOTES[k]).filter(Boolean))];
	return n.length ? n.join(' ') : null;
};

const ADAPT_ATTACK = {
	randomHits: f => (f.perEnergy ? `Choose an opponent (by targeting one of their Active Pokémon). One of that player's Pokémon is chosen at random for each ${E(f.perEnergy)} Energy attached to this Pokémon. For each time a Pokémon was chosen, do ${f.n} damage to it.` : f.times === 1 ? `Choose an opponent (by targeting one of their Active Pokémon). One of that player's Pokémon is chosen at random. Do ${f.n} damage to it.` : `Choose an opponent (by targeting one of their Active Pokémon). One of that player's Pokémon is chosen at random ${f.times} times. For each time a Pokémon was chosen, do ${f.n} damage to it.`),
	copyAttack: f => (f.own ? "Choose 1 of your Benched Pokémon's attacks, except any Pokémon ex, and use it as this attack. If this Pokémon doesn't have the necessary Energy to use that attack, this attack does nothing." : '') || (f.coin ? 'Flip a coin. If heads: ' : '') + (f.active ? "Choose an attack of any opposing Active Pokémon and use it as this attack, against this attack's target." : "Choose an attack of any opposing Pokémon in play and use it as this attack, against this attack's target.") + (f.free ? '' : " If this Pokémon doesn't have the necessary Energy to use that attack, this attack does nothing."),
	discardSelfEnergy: f => (f.n === 'all' ? `Discard all ${f.type ? E(f.type) + ' ' : ''}Energy from this Pokémon.` : `Discard ${f.n} ${E(f.type)} Energy from this Pokémon.`),
	discardTargetEnergy: f => (f.type ? `Discard a ${E(f.type)} Energy from the Defending Pokémon.` : (f.coin ? 'Flip a coin. If heads, discard' : 'Discard') + ' a random Energy from the Defending Pokémon.'),
	draw: f => (f.n === 1 ? 'Draw a card.' : `Draw ${f.n} cards.`),
	targetCantAttack: f => (f.basic ? 'If the Defending Pokémon is a Basic Pokémon, it' : (f.coin ? 'Flip a coin. If heads, the' : 'The') + ' Defending Pokémon') + " can't attack during its owner's next turn.",
	targetCantRetreat: () => "The Defending Pokémon can't retreat during its owner's next turn.",
	selfReduce: f => (f.coin ? 'Flip a coin. If heads, until' : 'Until') + ` your next turn, this Pokémon takes -${f.n} damage from attacks.`,
	targetAttackMinus: f => `During its owner's next turn, attacks used by the Defending Pokémon do -${f.n} damage.`,
	coinsAllBonus: f => `Flip ${f.coins} coins. If both of them are heads, this attack does ${f.bonus} more damage.`,
	coinsMul: f => `Flip ${f.coins} coins. This attack does ${f.per} damage for each heads.` + (f.tool ? ` If this Pokémon has ${f.tool} attached, flip ${f.toolCoins} coins instead.` : ''),
	coinsUntilTails: f => `Flip a coin until you get tails. This attack does ${f.per} damage for each heads.`,
	coinsAttachBench: f => `Flip ${f.coins} coins. Take an amount of ${E(f.type)} Energy from your Energy Zone equal to the number of heads and attach it to your Benched ${E(f.type)} Pokémon in any way you like.`,
	coinDiscardHand: f => (f.sure ? 'Discard' : 'Flip a coin. If heads, discard') + " a random card from the hand of the Defending Pokémon's owner.",
	coinPrevent: f => (f.sure ? 'If heads, until' : 'Flip a coin. If heads, until') + (f.damageOnly ? ' your next turn, prevent all damage done to this Pokémon by attacks.' : ' your next turn, prevent all damage from—and effects of—attacks done to this Pokémon.'),
	coinBonus: f => `Flip a coin. If heads, this attack does ${f.bonus} more damage.` + (f.tailsSelf ? ` If tails, this Pokémon also does ${f.tailsSelf} damage to itself.` : ''),
	coinShuffleTarget: () => 'Flip a coin. If heads, the Defending Pokémon and all cards attached to it are shuffled into its owner\'s deck.',
	status: f => (f.coin ? 'Flip a coin. If heads, the' : 'The') + ` Defending Pokémon is now ${f.s[0].toUpperCase() + f.s.slice(1)}.` + (f.n ? ` Do ${f.n} damage to it instead of the usual amount for this Special Condition.` : ''),
	coinNothing: () => 'Flip a coin. If tails, this attack does nothing.',
	heal: f => `Heal ${f.n} damage from ${f.it ? 'it' : 'this Pokémon'}.`,
	healDealt: () => 'Heal from this Pokémon the same amount of damage you did to the Defending Pokémon.',
	extraEnergyBonus: f => `If this Pokémon has at least ${f.need} extra ${E(f.type)} Energy attached, this attack does ${f.bonus} more damage.`,
	selfDamagedBonus: f => `If this Pokémon has damage on it, this attack does ${f.bonus} more damage.`,
	targetDamagedBonus: f => `If the Defending Pokémon has damage on it, this attack does ${f.bonus} more damage.`,
	targetPoisonedBonus: f => `If the Defending Pokémon is Poisoned, this attack does ${f.bonus} more damage.`,
	benchFromDeck: f => `Put 1 random ${f.name} from your deck onto your Bench.`,
	typeToHand: f => (f.type ? `Put 1 random ${E(f.type)} Pokémon from your deck into your hand.` : 'Put a random Pokémon from your deck into your hand.'),
	switchTarget: () => "The Defending Pokémon's owner switches it with one of their Benched Pokémon of their choice. It keeps the same Active slot.",
	switchSelf: f => `${f.may ? 'You may switch' : 'Switch'} this Pokémon with 1 of your Benched ${f.type ? E(f.type) + ' ' : ''}Pokémon. It keeps the same Active slot.`,
	attachZone: f => (f.to === 'bench' ? `Take ${f.a ? 'a' : f.n} ${E(f.type)} Energy from your Energy Zone and attach it to 1 of your Benched ${f.basic ? 'Basic ' : ''}Pokémon.` : f.to === 'self' ? `Take ${f.a ? 'a' : f.n || '1'} ${E(f.type)} Energy from your Energy Zone and attach it to this Pokémon.` : `Take ${f.n > 1 ? f.n : 'a'} ${E(f.type)} Energy from your Energy Zone and attach it to 1 of your Benched ${E(f.type)} Pokémon.`),
	selfDamage: f => `This Pokémon also does ${f.n} damage to itself.`,
	benchSplash: f => (f.need ? `If ${f.need} is on your Bench, this` : 'This') + ` attack also does ${f.n} damage to each Benched Pokémon of the Defending Pokémon's owner${f.withEnergy ? ' that has any Energy attached' : f.damaged ? ' that has damage on it' : ''}.`,
	ownBenchDamage: f => `This attack also does ${f.n} damage to 1 of your Benched Pokémon.`,
	perTargetEnergy: f => `This attack does ${f.n} ${f.only ? '' : 'more '}damage for each Energy attached to the Defending Pokémon.`,
	perBench: f => `This attack does ${f.n} damage for each of your Benched ${f.type ? E(f.type) + ' ' : ''}Pokémon.`,
	perBenchName: f => `This attack does ${f.n} more damage for each of your Benched ${f.name}.`,
	snipe: f => (f.zone === 'bench' ? `This attack does ${f.n} damage to 1 Benched Pokémon of any opponent.` : `This attack does ${f.n} damage to 1 Pokémon of any opponent${f.damaged ? ' that has damage on it' : ''}.`),
	revealHand: () => "The Defending Pokémon's owner reveals their hand to you.",
	noSupporter: () => "The Defending Pokémon's owner can't use any Supporter cards from their hand during their next turn.",
	// Mythical Island (A1a)
	coinsPerEnergy: f => `Flip a coin for each ${f.type ? E(f.type) + ' ' : ''}Energy attached to this Pokémon. This attack does ${f.per} ${f.more ? 'more ' : ''}damage for each heads.`,
	discardRandomAny: () => 'Discard a random Energy from among the Energy attached to all Pokémon in play (yours and every opponent\'s).',
	perOppBench: f => `This attack does ${f.n} more damage for each Benched Pokémon of the Defending Pokémon's owner.`,
	healAllOwn: f => `Heal ${f.n} damage from each of your ${f.type ? E(f.type) + ' ' : ''}Pokémon.`,
	revengeBonus: f => `If any of your Pokémon were Knocked Out by damage from an attack since your last turn, this attack does ${f.bonus} more damage.`,
	smokescreen: f => (f.lasting ? "If the Defending Pokémon tries to use an attack, its owner flips a coin. If tails, that attack doesn't happen. This effect lasts until the Defending Pokémon leaves its Active slot, and it doesn't stack." : "During its owner's next turn, if the Defending Pokémon tries to use an attack, its owner flips a coin. If tails, that attack doesn't happen."),
	targetExBonus: f => `If the Defending Pokémon is a Pokémon {ex}, this attack does ${f.bonus} more damage.`,
	mimicHand: () => "Shuffle your hand into your deck. Draw a card for each card in the hand of the Defending Pokémon's owner.",
	// Space-Time Smackdown (A2)
	discardSelfRandom: f => (f.n ? `Discard ${f.n} random Energy from this Pokémon.` : 'Discard a random Energy from this Pokémon.'),
	selfCantUse: f => `During your next turn, this Pokémon can't use ${f.name}.`,
	selfCantAttack: f => (f.tails ? "Flip a coin. If tails, during your next turn, this Pokémon can't attack." : "During your next turn, this Pokémon can't attack."),
	selfNextBoost: f => `During your next turn, this Pokémon's ${f.name} attack does +${f.n} damage.`,
	alsoBench: f => (f.coin ? 'Flip a coin. If heads, this' : 'This') + ` attack also does ${f.n} damage to 1 Benched Pokémon of any opponent.`,
	targetTypeBonus: f => `If the Defending Pokémon is a ${f.types ? f.types.map(E).join(' or ') : E(f.type)} Pokémon, this attack does ${f.bonus} more damage.`,
	attachZoneEach: f => `Choose ${f.n} of your Benched Pokémon. For each of those Pokémon, take a ${E(f.type)} Energy from your Energy Zone and attach it to that Pokémon.`,
	selfToolBonus: f => `If this Pokémon has a Pokémon Tool attached, this attack does ${f.bonus} more damage.`,
	targetToolBonus: f => `If the Defending Pokémon has a Pokémon Tool attached, this attack does ${f.bonus} more damage.`,
	attachZoneNamed: f => `Take a ${E(f.type)} Energy from your Energy Zone and attach it to ${list(f.names)}.`,
	needBench: f => `You can use this attack only if you have ${f.names.join(' and ')} on your Bench.`,
	millSelf: f => (f.n === 1 ? 'Discard the top card of your deck.' : `Discard the top ${f.n} cards of your deck.`),
	coinsBonusEach: f => `Flip ${f.coins} coins. This attack does ${f.bonus} more damage for each heads.`,
	coinsUntilTailsBonus: f => `Flip a coin until you get tails. This attack does ${f.bonus} more damage for each heads.`,
	koRecoil: f => `If the Defending Pokémon is Knocked Out by damage from this attack, this Pokémon also does ${f.n} damage to itself.`,
	allOppDamage: f => `Choose an opponent (by targeting one of their Active Pokémon). This attack does ${f.n} damage to each of that player's Pokémon.` + (f.grow ? ` During your next turn, this attack does +${f.grow} damage to each of them.` : ''),
	headsStatus: f => `If at least ${f.need} of them ${f.need === 1 ? 'is' : 'are'} heads, the Defending Pokémon is now ${f.s[0].toUpperCase() + f.s.slice(1)}.`,
	coinsPerPokemon: f => `Flip a coin for each Pokémon you have in play. This attack does ${f.per} damage for each heads.`,
	randomNextEnergy: () => "Change the type of the next Energy that will be generated for the Defending Pokémon's owner to 1 of the following at random: {G}, {R}, {W}, {L}, {P}, {F}, {D}, or {M}.",
	discardTargetTools: f => (f.plain ? 'Discard' : 'Before doing damage, discard') + ' all Pokémon Tools from the Defending Pokémon.',
	halveTarget: () => "Halve the Defending Pokémon's remaining HP, rounded down.",
	handToDeck: () => "The Defending Pokémon's owner reveals their hand to you. Choose a card you find there and shuffle it into that player's deck.",
	selfDamageBonus: f => (f.eq ? 'This attack does damage to the Defending Pokémon equal to the damage this Pokémon has on it.' : 'This attack does more damage equal to the damage this Pokémon has on it.'),
	coinBounceTarget: () => "Flip a coin. If heads, the Defending Pokémon is put into its owner's hand.",
	// Triumphant Light (A2a)
	coinHandToDeck: f => (f.look ? "Flip a coin. If heads, look at a random card from the hand of the Defending Pokémon's owner and shuffle it into their deck." : (f.sure ? 'The' : 'Flip a coin. If heads, the') + " Defending Pokémon's owner reveals a random card from their hand and shuffles it into their deck."),
	selfStatus: f => `This Pokémon is now ${f.s[0].toUpperCase() + f.s.slice(1)}.`,
	// Celestial Guardians (A3)
	coinTailsSelf: f => `Flip a coin. If tails, this Pokémon also does ${f.n} damage to itself.`,
	perBenchNames: f => `This attack does ${f.n} more damage for each of your Benched ${f.names.join(' and ')}.`,
	targetBasicBonus: f => `If the Defending Pokémon is a Basic Pokémon, this attack does ${f.bonus} more damage.`,
	noItems: () => "During its owner's next turn, the Defending Pokémon's owner can't play any Item cards from their hand.",
	noZoneToActive: () => "During its owner's next turn, the Defending Pokémon's owner can't take any Energy from their Energy Zone to attach to their Active Pokémon.",
	ownAnyDamage: f => `This attack also does ${f.n} damage to 1 of your Pokémon.`,
	snipePerEnergy: f => `This attack does ${f.n} damage to 1 Pokémon of any opponent for each Energy attached to that Pokémon.`,
	evolutionToHand: f => `Put a random card that evolves from ${f.name} from your deck into your hand.`,
	moreHpBonus: f => `If the Defending Pokémon has more remaining HP than this Pokémon, this attack does ${f.bonus} more damage.`,
	targetStatusBonus: f => `If the Defending Pokémon is affected by a Special Condition, this attack does ${f.bonus} more damage.`,
	targetAbilityBonus: f => `If the Defending Pokémon has an Ability, this attack does ${f.bonus} more damage.`,
	benchDamagedBonus: f => `If any of your Benched Pokémon have damage on them, this attack does ${f.bonus} more damage.`,
	selfVulnerable: f => `Until your next turn, this Pokémon takes +${f.n} damage from attacks.`,
	targetCostMore: f => `During its owner's next turn, attacks used by the Defending Pokémon cost ${f.n === 2 && !f.retreat ? '{C}{C}' : f.n + ' {C}'} more` + (f.retreat ? `, and its Retreat Cost is ${f.retreat} {C} more.` : '.'),
	movedUpBonus: f => `If this Pokémon moved from your Bench to an Active slot this turn, this attack does ${f.bonus} more damage.`,
	selfThorns: f => `Until your next turn, if this Pokémon is damaged by an attack, do ${f.n} damage to the Attacking Pokémon.`,
	discardItemFromHand: f => `Discard a random ${f.kind === 'tool' ? 'Pokémon Tool' : 'Item'} card from the hand of the Defending Pokémon's owner.`,
	// Paradox Drive (B3a)
	coinsTable: f => `Flip 3 coins. If 1 of them is heads, this attack does ${f.table[1]} more damage. If 2 of them are heads, this attack does ${f.table[2]} more damage. If all of them are heads, this attack does ${f.table[3]} more damage.`,
	firstUseBonus: f => `If this is the first time this Pokémon has used an attack after coming into play, this attack does ${f.bonus} more damage.`,
	firstUseStatus: f => `If it is, the Defending Pokémon is also now ${f.s[0].toUpperCase() + f.s.slice(1)}.`,
	firstUseNoTrainers: () => "If this is the first time this Pokémon has used an attack after coming into play, during its owner's next turn, the Defending Pokémon's owner can't play any Trainer cards from their hand.",
	targetVulnerableNext: f => `During your next turn, the Defending Pokémon takes +${f.n} damage from attacks.`,
	pullThenHit: f => `Switch in 1 Benched Pokémon of the Defending Pokémon's owner to the Defending Pokémon's Active slot. If you do, this attack does ${f.n} damage to the new Active Pokémon.`,
	attachRandomType: () => 'Take a random Energy from among {G}, {R}, {W}, {L}, {P}, {F}, {D}, and {M} Energy from your Energy Zone and attach it to 1 of your Benched Pokémon.',
	perOwnKO: f => `This attack does ${f.n} more damage for each time your Pokémon have been Knocked Out during this game.`,
	evolvedDiscardTarget: f => `If this Pokémon evolved from ${f.from} during this turn, discard ${f.n} random Energy from the Defending Pokémon.`,
	perEnergyType: f => `This attack does ${f.n} more damage for each type of Energy attached to this Pokémon.`,
	// Pulsing Aura (B3)
	benchStageBonus: f => `If you have any Stage ${f.stage} Pokémon on your Bench, this attack does ${f.bonus} more damage.`,
	targetAsleepBonus: f => `If the Defending Pokémon is Asleep, this attack does ${f.bonus} more damage.`,
	targetNoAbility: () => 'The Defending Pokémon loses all Abilities. This effect lasts until the Defending Pokémon leaves its Active slot.',
	coinsDiscardBonus: f => `Flip ${f.coins} coins. For each heads, discard a ${E(f.type)} Energy from this Pokémon. This attack does ${f.per} more damage for each ${E(f.type)} Energy you discarded in this way.`,
	coinAttachSelf: f => `Flip a coin. If heads, take ${f.n} ${E(f.type)} Energy from your Energy Zone and attach it to this Pokémon.`,
	moveRandomEnergyToBench: f => `Move ${f.n} random Energy from this Pokémon to 1 of your Benched Pokémon.`,
	untilTailsMill: () => "Flip a coin until you get tails. For each heads, discard the top card of the deck of the Defending Pokémon's owner.",
	noEvolve: () => "During its owner's next turn, the Defending Pokémon's owner can't play any Pokémon from their hand to evolve their Pokémon.",
	oppHasTypeBonus: f => `If the Defending Pokémon's owner has any ${E(f.type)} Pokémon in play, this attack does ${f.bonus} more damage.`,
	perAttackName: f => `Reveal all of your Pokémon in play and in your hand that have the ${f.name} attack, and this attack does ${f.per} damage for each Pokémon you revealed in this way.`,
	stadiumStatus: f => `If a Stadium is in play, the Defending Pokémon is now ${f.s[0].toUpperCase() + f.s.slice(1)}.`,
	stadiumHealSelf: f => `If a Stadium is in play, heal ${f.n} damage from this Pokémon.`,
	// Mega Shine (B2b)
	targetConfusedBonus: f => `If the Defending Pokémon is Confused, this attack does ${f.bonus} more damage.`,
	coinsBenchSplash: f => `Flip ${f.coins} coins. This attack also does ${f.n} damage for each heads to each Benched Pokémon of the Defending Pokémon's owner.`,
	revengeStatus: f => `If any of your Pokémon were Knocked Out by damage from an attack since your last turn, the Defending Pokémon is now ${f.s[0].toUpperCase() + f.s.slice(1)}.`,
	perOwnPoint: f => `This attack does ${f.n} more damage for each point you have gotten.`,
	randomCopy: () => "1 attack from among the Pokémon in the hand and deck of the Defending Pokémon's owner is chosen at random, and you use the chosen attack as this attack.",
	oppHandCountBonus: f => `If the Defending Pokémon's owner has exactly ${f.counts.slice(0, -1).join(', ')}, or ${f.counts.at(-1)} cards in their hand, this attack does ${f.bonus} more damage.`,
	discardOwnRandomEnergy: f => `Discard ${f.n} random Energy from among the Energy attached to all of your Pokémon.`,
	noTrainers: () => "During its owner's next turn, the Defending Pokémon's owner can't play any Trainer cards from their hand.",
	moveEnergyToBench: f => `Move ${f.n} ${E(f.type)} Energy from this Pokémon to 1 of your Benched Pokémon.`,
	benchAllBoth: f => `This attack also does ${f.n} damage to all Benched Pokémon (both yours and the Defending Pokémon's owner's).`,
	attachSelfTypes: f => `Take a ${E(f.types[0])} and a ${E(f.types[1])} Energy from your Energy Zone and attach them to this Pokémon.`,
	// Paldean Wonders (B2a)
	spotDoom: f => `Choose a Pokémon of any opponent: its spot is marked. At the end of that player's next turn, do ${f.n} damage to the Pokémon in that spot.`,
	emptyDeckCost: f => `If you have no cards in your deck, this attack can be used for 1 ${E(f.cost[0])} Energy.`,
	perDiscardType: f => `This attack does ${f.n} more damage for each ${E(f.type)} Pokémon in your discard pile.`,
	lowHpNothing: f => `If this Pokémon's remaining HP is ${f.hp} or less, this attack does nothing.`,
	energyTypesInPlayBonus: f => `If your Pokémon in play have ${f.need} or more different types of Energy attached, this attack does ${f.bonus} more damage.`,
	// Fantastical Parade (B2)
	oppPointsBonus: f => `If the Defending Pokémon's owner has gotten exactly ${f.points} point${f.points === 1 ? '' : 's'}, this attack does ${f.bonus} more damage.`,
	nextTurnBoost: f => `During your next turn, attacks used by your ${f.cardType ? E(f.cardType) + ' ' : ''}Pokémon do +${f.n} damage to opposing Active Pokémon.`,
	coinDamageOrHeal: f => `Flip a coin. If heads, this attack does ${f.dmg} damage to the Defending Pokémon. If tails, heal ${f.heal} damage from the Defending Pokémon.`,
	randomEnergyAll: f => `Discard ${f.n} random Energy from among the Energy attached to all Pokémon (yours and every opponent's).`,
	energyInPlayBonus: f => `If you have ${f.need} or more ${E(f.type)} Energy in play, this attack does ${f.bonus} more damage.`,
	attachZoneSpread: f => `Take ${f.n} ${E(f.type)} Energy from your Energy Zone and attach it to your ${E(f.type)} Pokémon in any way you like.`,
	perDiscardSupporter: f => `This attack does ${f.n} more damage for each Supporter card in your discard pile.`,
	discardStadium: () => 'Discard the Stadium in play.',
	bothEnergyBonus: f => `If the amount of Energy attached to this Pokémon and the Defending Pokémon is ${f.need} or more, this attack does ${f.bonus} more damage.`,
	coinAttachBench: f => `Flip a coin. If heads, take ${f.n} ${E(f.type)} Energy from your Energy Zone and attach it to 1 of your Benched Pokémon.`,
	fewerPokemonBonus: f => `If you have fewer Pokémon in play than the Defending Pokémon's owner, this attack does ${f.bonus} more damage.`,
	moreEnergyBonus: f => `If this Pokémon has more Energy attached than the Defending Pokémon, this attack does ${f.bonus} more damage.`,
	coinDiscardTarget: f => (f.coins ? `Flip ${f.coins} coins. If both of them are heads, discard the Defending Pokémon.` : 'Flip a coin. If heads, discard the Defending Pokémon.'),
	retreatTrap: f => `Until your next turn, if this Pokémon is in an Active slot when an opposing Active Pokémon retreats, this attack does ${f.n} damage to the new Active Pokémon.`,
	selfReduceEx: f => `Until your next turn, this Pokémon takes -${f.n} damage from attacks from opposing Pokémon ex.`,
	twice: f => `This attack is used twice in a row. The second attack does ${f.n} damage. (If the first attack Knocks Out the Defending Pokémon, the second attack is used on the Pokémon that takes its Active slot, or on that player's other Active Pokémon.)`,
	stadiumBonus: f => `If a Stadium is in play, this attack does ${f.bonus} more damage.`,
	benchFromDeckNames: f => `Put ${f.n} random cards from among ${f.names.join(' and ')} from your deck onto your Bench.`,
	coinsPerNamed: f => `Flip a coin for each ${f.names.join(' and ')} you have in play. This attack does ${f.per} damage for each heads.`,
	// Crimson Blaze (B1a)
	discardHasBonus: f => `If ${f.name} is in your discard pile, this attack does ${f.bonus} more damage.`,
	extraEnergyAlsoBench: f => `If this Pokémon has at least ${f.need} extra ${E(f.type)} Energy attached, this attack also does ${f.n} damage to ${f.count} opposing Benched Pokémon of your choice.`,
	kindToHand: () => 'Put a random Supporter card from your deck into your hand.',
	healOwn: f => `Heal ${f.n} damage from 1 of your Pokémon.`,
	minusSelfDamage: () => "This attack's damage is reduced by the amount of damage this Pokémon has on it.",
	shuffleSelfIntoDeck: f => (f.may ? 'You may shuffle this Pokémon and all attached cards into your deck.' : 'Shuffle this Pokémon into your deck.'),
	selfNoWeakness: f => (f.reduce ? `Until your next turn, this Pokémon takes -${f.reduce} damage from attacks and has no Weakness.` : 'Until your next turn, this Pokémon has no Weakness.'),
	perOppDeckTrainer: f => `This attack does ${f.n} more damage for each Trainer card in the deck of the Defending Pokémon's owner.`,
	// Mega Rising (B1)
	selfPreventSmall: f => `Until your next turn, prevent all damage done to this Pokémon by attacks if that damage is ${f.n} or less.`,
	chooseStatus: f => `Choose either ${f.list.map(s => s[0].toUpperCase() + s.slice(1)).join(' or ')}. The Defending Pokémon is now affected by that Special Condition.`,
	healBenchBasics: f => `Heal ${f.n} damage from each of your Benched Basic Pokémon.`,
	evolveSelfFromDeck: () => 'Put a random card from your deck that evolves from this Pokémon onto this Pokémon to evolve it.',
	handCountBonus: f => `If you have exactly ${f.counts.slice(0, -1).join(', ')}, or ${f.counts.at(-1)} cards in your hand, this attack does ${f.bonus} more damage.`,
	selfPreventFromBasic: () => 'Until your next turn, prevent all damage done to this Pokémon by attacks from Basic Pokémon.',
	randomBench: f => (f.times === 1 ? `1 Benched Pokémon of the Defending Pokémon's owner is chosen at random. This attack also does ${f.n} damage to it.` : `1 Benched Pokémon of the Defending Pokémon's owner is chosen at random ${f.times} times. For each time a Pokémon was chosen, also do ${f.n} damage to it.`),
	discardHandCost: f => (f.n === 1 ? "Discard a card from your hand. If you can't, this attack does nothing." : `Discard ${f.n} cards from your hand. If you can't discard ${f.n} cards, this attack does nothing.`),
	targetAttachSleep: () => "During its owner's next turn, if they attach Energy from their Energy Zone to the Defending Pokémon, that Pokémon will be Asleep.",
	ignoreWeakness: () => "This attack's damage isn't affected by Weakness.",
	topRetreatMul: f => `Reveal the top ${f.n} cards of your deck. This attack does ${f.per} damage for each Pokémon with a Retreat Cost of ${f.need} or more you find there. Shuffle the revealed cards back into your deck.`,
	lowHpBonus: f => `If this Pokémon's remaining HP is ${f.hp} or less, this attack does ${f.bonus} more damage.`,
	perOppAbility: f => `This attack does ${f.n} more damage for each Pokémon in play of the Defending Pokémon's owner that has an Ability.`,
	discardSupporterFromHand: f => (f.coin ? 'Flip a coin. If heads, the' : 'The') + " Defending Pokémon's owner reveals their hand. Choose a Supporter card you find there and discard it.",
	ignoreTargetEffects: () => "This attack's damage isn't affected by any effects on the Defending Pokémon.",
	coinsAllTailsNothing: f => `Flip ${f.coins} coins. If both of them are tails, this attack does nothing.`,
	coinsDiscardOrNothing: f => `Flip ${f.coins} coins. For each heads, discard a random Energy from the Defending Pokémon.` + (f.soft ? '' : ' If both of them are tails, this attack does nothing.'),
	// Secluded Springs (A4a)
	devolveTarget: () => "If the Defending Pokémon is an evolved Pokémon, devolve it by putting the highest Stage Evolution card on it into its owner's hand.",
	millTarget: f => (f.n > 1 ? `Discard the top ${f.n} cards of the deck of the Defending Pokémon's owner.` : "Discard the top card of the deck of the Defending Pokémon's owner."),
	coinStatuses: f => `Flip a coin. If heads, the Defending Pokémon is now ${f.list.map(s => s[0].toUpperCase() + s.slice(1)).join(' and ')}.`,
	discardToolsBonus: f => `Discard up to ${f.max} Pokémon Tool cards from your hand. This attack does ${f.per} damage for each card you discarded in this way.`,
	perAllBench: f => `This attack does ${f.per} ${f.more ? 'more ' : ''}damage for each Benched Pokémon (both yours and the Defending Pokémon's owner's).`,
	damagedCost: f => `If this Pokémon has damage on it, this attack can be used for 1 ${E(f.cost[0])} Energy.`,
	doom: f => `At the end of its owner's next turn, do ${f.n} damage to the Defending Pokémon.`,
	millSelfBonus: f => `Discard the top card of your deck. If that card is a ${E(f.type)} Pokémon, this attack does ${f.bonus} more damage.`,
	hasEnergyBonus: f => `If this Pokémon has any ${E(f.type)} Energy attached, this attack does ${f.bonus} more damage.`,
	targetNameBonus: f => `If the Defending Pokémon is ${f.name}, this attack does ${f.bonus} more damage.`,
	energyTypesBonus: f => `If this Pokémon has ${f.need} or more different types of Energy attached, this attack does ${f.bonus} more damage.`,
	selfAtkPlusLasting: f => `Until this Pokémon leaves its Active slot, this attack does +${f.n} damage. This effect stacks.`,
	healBench: f => `Heal ${f.n} damage from 1 of your Benched Pokémon.`,
	// Wisdom of Sea and Sky (A4)
	perTargetRetreat: f => `This attack does ${f.n} more damage for each Energy in the Defending Pokémon's Retreat Cost.`,
	selfUndamagedBonus: f => `If this Pokémon has no damage on it, this attack does ${f.bonus} more damage.`,
	randomHitsAny: f => `1 other Pokémon (yours or any opponent's) is chosen at random ${f.times} times. For each time a Pokémon was chosen, do ${f.n} damage to it.`,
	coinTailsDiscardSelf: f => `Flip a coin. If tails, discard ${f.n} random Energy from this Pokémon.`,
	attachZoneTypes: f => `Take a ${f.types.slice(0, -1).map(E).join(', ')}, and ${E(f.types.at(-1))} Energy from your Energy Zone and attach them to your Benched Basic Pokémon in any way you like.`,
	targetBurnedBonus: f => `If the Defending Pokémon is Burned, this attack does ${f.bonus} more damage.`,
	discardBenchBonus: f => `You may discard any number of your Benched ${E(f.type)} Pokémon. This attack does ${f.bonus} more damage for each Benched Pokémon you discarded in this way.`,
	moveAllEnergyToBench: f => `Move all ${f.type ? E(f.type) + ' ' : ''}Energy from this Pokémon to 1 of your Benched Pokémon.`,
	coinStatus2: f => `Flip a coin. If heads, the Defending Pokémon is now ${f.heads[0].toUpperCase() + f.heads.slice(1)}. If tails, the Defending Pokémon is now ${f.tails[0].toUpperCase() + f.tails.slice(1)}.`,
	coinSetHp: f => `Flip a coin. If heads, the Defending Pokémon's remaining HP is now ${f.hp}.`,
	wasHitBonus: f => `If this Pokémon was damaged by an attack during an opponent's turn since your last turn while it was in an Active slot, this attack does ${f.bonus} more damage.`,
	targetEvolvedBonus: f => `If the Defending Pokémon is an Evolution Pokémon, this attack does ${f.bonus} more damage.`,
	drawToMatch: () => "Draw cards until you have the same number of cards in your hand as the Defending Pokémon's owner.",
	recolorEnergy: () => 'Change the type of a random Energy attached to the Defending Pokémon to 1 of the following at random: {G}, {R}, {W}, {L}, {P}, {F}, {D}, or {M}.',
	discardSelfTypes: f => (f.types.length === 2 ? `Discard a ${E(f.types[0])} and a ${E(f.types[1])} Energy from this Pokémon.` : `Discard a ${f.types.slice(0, -1).map(E).join(', ')}, and ${E(f.types.at(-1))} Energy from this Pokémon.`),
	// Eevee Grove (A3b)
	perSelfEnergyBonus: f => `This attack does ${f.n} more damage for each ${f.type ? E(f.type) + ' ' : ''}Energy attached to this Pokémon.`,
	relayBonus: f => `If 1 of your Pokémon used Sweets Relay during your last turn, this attack does ${f.bonus} more damage.`,
	evolvedBonus: f => `If this Pokémon evolved ${f.from ? 'from ' + f.from + ' ' : ''}during this turn, this attack does ${f.bonus} more damage.`,
	perOppEnergyAll: f => `This attack does ${f.per} damage for each Energy attached to all of the Pokémon of the Defending Pokémon's owner.`,
	perBenchEvolved: f => `This attack does ${f.n} more damage for each Evolution Pokémon on your Bench.`,
	perRelay: f => `This attack does ${f.per} damage for each time your Pokémon used Sweets Relay during this game.`,
	ownBenchAll: f => `This attack also does ${f.n} damage to each of your Benched Pokémon.`,
	// Extradimensional Crisis (A3a)
	benchHasBonus: f => `If ${f.name} is on your Bench, this attack does ${f.bonus} more damage.`,
	coinsHandToDeck: f => `Flip ${f.coins} coins. For each heads, a card is chosen at random from the hand of the Defending Pokémon's owner. That player reveals that card and shuffles it into their deck.`,
	flipDiscardTargetEnergy: () => 'Flip a coin until you get tails. For each heads, discard a random Energy from the Defending Pokémon.',
	coinsKO: f => (f.coins ? `Flip ${f.coins} coins. If both of them are heads, the Defending Pokémon is Knocked Out.` : 'Knock Out the Defending Pokémon.'),
	supporterBonus: f => `If you played a Supporter card from your hand during this turn, this attack does ${f.bonus} more damage.`,
	randomStatus: () => '1 Special Condition from among Asleep, Burned, Confused, Paralyzed, and Poisoned is chosen at random, and the Defending Pokémon is now affected by that Special Condition. Any Special Conditions already affecting that Pokémon will not be chosen.',
	perOwnBench: f => `This attack does ${f.n} more damage for each of your Benched Pokémon.`,
};
const ADAPT_ABILITY = {
	healAll: f => `Once during your turn, you may heal ${f.n} damage from each of your ${f.type ? E(f.type) + ' ' : ''}Pokémon.`,
	// Celestial Guardians (A3)
	firstTurnFreeRetreat: () => 'During your first turn, this Pokémon has no Retreat Cost.',
	koCounter: f => `If this Pokémon is in an Active slot and is Knocked Out by damage from an attack from an opposing Pokémon, do ${f.n} damage to the Attacking Pokémon.`,
	preventFromEx: () => 'Prevent all damage done to this Pokémon by attacks from opposing Pokémon ex.',
	energyNoStatus: f => `Each of your Pokémon that has any ${f.type ? E(f.type) + ' ' : ''}Energy attached recovers from all Special Conditions and can't be affected by any Special Conditions.`,
	gatherFrom: f => `Once during your turn, you may move all ${E(f.type)} Energy from 1 of your Benched ${E(f.type)} Pokémon to one of your Pokémon in an Active slot.`,
	endure: f => `If this Pokémon would be Knocked Out by damage from an attack, flip a coin. If heads, this Pokémon is not Knocked Out, and its remaining HP becomes ${f.hp}.`,
	koPassEnergy: f => `If this Pokémon is in an Active slot and is Knocked Out by damage from an attack from an opposing Pokémon, move all ${E(f.type)} Energy from this Pokémon to 1 of your Benched Pokémon.`,
	benchSwap: () => 'Once during your turn, if this Pokémon is on your Bench, you may switch it with one of your Pokémon in an Active slot.',
	attachSleep: () => 'As long as this Pokémon is in an Active slot, whenever you attach an Energy from your Energy Zone to it, it is now Asleep.',
	// Extradimensional Crisis (A3a)
	activeAtkMinus: f => `As long as this Pokémon is in an Active slot, attacks used by opposing Active Pokémon do -${f.n} damage.`,
	firstTurnAttach: f => `At the end of your first turn, take a ${E(f.type)} Energy from your Energy Zone and attach it to this Pokémon.`,
	pokemonToHand: f => `Once during your turn, you may put a random ${f.kind === 'tool' ? 'Pokémon Tool card' : 'Pokémon'} from your deck into your hand.`,
	// Paradox Drive (B3a)
	onBenchDrive: () => 'Once during your turn, when you put this Pokémon from your hand onto your Bench, you may switch it with one of your Pokémon in an Active slot. If you do, move all of your Energy in play to this Pokémon.',
	onBenchDriveOff: () => 'Once during your turn, when you put this Pokémon from your hand onto your Bench, you may choose an opposing Active Pokémon. Its owner switches it with one of their Benched Pokémon of their choice.',
	futureCostLess: f => `Attacks used by your Future Pokémon cost ${f.n} less {C} Energy.`,
	checkupHealAll: f => `At the end of each turn, heal ${f.n} damage from each of your Pokémon.`,
	// Pulsing Aura (B3)
	timeRecall: () => 'Each of your evolved Pokémon can use any attack from its previous Evolutions. (You still need the necessary Energy to use each attack.)',
	victoryStar: f => `Once during your turn, after you flip any coins for an attack of 1 of your ${E(f.type)} Pokémon, you may ignore all results of those coin flips and begin flipping those coins again. You can't use more than 1 Victory Star Ability each turn.`,
	onEvolvePing: f => `Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may do ${f.n} damage to an opposing Active Pokémon of your choice.`,
	doubleType: f => `As long as this Pokémon is in play, it is ${E(f.types[0])} and ${E(f.types[1])} type.`,
	takeSome: f => `Once during your turn, if this Pokémon is on your Bench, you may move ${f.n} damage that one of your Pokémon in an Active slot has on it to this Pokémon.`,
	checkupPingAll: f => `At the end of each turn, if this Pokémon is in an Active slot, do ${f.n} damage to each Pokémon of every opponent.`,
	cureRandom: () => 'Once during your turn, you may remove a random Special Condition from one of your Pokémon in an Active slot.',
	sealed: f => `If you don't have ${f.names.slice(0, -1).join(', ')}, and ${f.names.at(-1)} on your Bench, this Pokémon can't attack.`,
	// Mega Shine (B2b)
	sleepPing: f => `At the end of each turn, do ${f.n} damage to each opposing Active Pokémon that is Asleep.`,
	// Paldean Wonders (B2a)
	healExForEnergy: f => `Once during your turn, you may heal ${f.n} damage from 1 of your Pokémon ex that has any Energy attached. If you do, discard a random Energy from that Pokémon.`,
	boostForEnergy: f => `Once during your turn, you may discard 1 ${E(f.type)} Energy from this Pokémon in order to use this Ability. During this turn, attacks used by your ${E(f.type)} Pokémon do +${f.n} damage to opposing Active Pokémon.`,
	lowHpBoost: f => `If this Pokémon's remaining HP is ${f.hp} or less, attacks used by this Pokémon do +${f.n} damage to opposing Active Pokémon.`,
	// Fantastical Parade (B2)
	stadiumFreeRetreat: () => 'If a Stadium is in play, this Pokémon has no Retreat Cost.',
	startTurnTypeToHand: f => `At the beginning of your turn, if this Pokémon is in an Active slot, put a random ${E(f.type)} Pokémon from your deck into your hand.`,
	disguise: () => 'When this Pokémon is first damaged by an attack after coming into play, prevent that damage.',
	onEvolveRefresh: () => 'Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may have an opponent of your choice shuffle their hand into their deck. For each remaining point that player needs to win, they draw a card.',
	buddy: f => `If you have another ${f.name} in play, this Pokémon's attacks do +${f.plus} damage to opposing Active Pokémon, and this Pokémon takes -${f.minus} damage from attacks from opposing Pokémon.`,
	noBasicAbilities: () => "Basic Pokémon in play (yours and every opponent's) have no Abilities.",
	koSplash: f => `If this Pokémon is in an Active slot and is Knocked Out by damage from an attack from an opposing Pokémon, do ${f.n} damage to each of the Attacking Pokémon's owner's Pokémon.`,
	onEvolveTools: f => `Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may put ${f.n} random Pokémon Tool cards from your discard pile into your hand.`,
	portrait: () => "Once during your turn, if this Pokémon is in an Active slot, you may look at a random Supporter card from an opponent's hand. Use the effect of that card as the effect of this Ability.",
	// Crimson Blaze (B1a)
	oppRetreatMore: f => `The Retreat Cost of opposing Active Pokémon is ${f.n} more.`,
	onEvolveAttach: f => `Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may take a ${E(f.type)} Energy from your Energy Zone and attach it to one of your ${E(f.type)} Pokémon in an Active slot.`,
	benchShield: () => 'As long as this Pokémon is on your Bench, prevent all damage done to this Pokémon by attacks.',
	energyHp: f => `This Pokémon gets +${f.n} HP for each ${E(f.type)} Energy attached to it.`,
	// Mega Rising (B1)
	typeHp: f => `Each of your ${E(f.type)} Pokémon gets +${f.n} HP.`,
	coinPull: () => "Once during your turn, you may flip a coin. If heads, choose an opponent, one of their Benched Pokémon, and one of their Active Pokémon: those two switch places.",
	millOpp: () => "Once during your turn, you may discard the top card of an opponent's deck.",
	hitAttachBench: f => `If this Pokémon is in an Active slot and is damaged by an attack from an opposing Pokémon, take a ${E(f.type)} Energy from your Energy Zone and attach it to 1 of your Benched Pokémon.`,
	switchActiveType: f => `Once during your turn, you may switch one of your ${E(f.type)} Pokémon in an Active slot with 1 of your Benched Pokémon.`,
	fullHpReduce: f => `If this Pokémon has full HP, it takes -${f.n} damage from attacks from opposing Pokémon.`,
	oppAttachPing: f => `As long as this Pokémon is in an Active slot, whenever an opponent attaches an Energy from their Energy Zone to 1 of their Pokémon, do ${f.n} damage to that Pokémon.`,
	koNoPoints: () => "When this Pokémon is Knocked Out, flip a coin. If heads, no opponent can get any points for it.",
	toolsThenDiscardSelf: () => 'Once during your turn, if this Pokémon is on your Bench, you may discard all Pokémon Tools from an opposing Active Pokémon of your choice. If you do, discard this Pokémon.',
	attachZoneSelfDmg: f => `Once during your turn, you may take ${f.n} ${E(f.type)} Energy from your Energy Zone and attach it to this Pokémon. If you do, do ${f.dmg} damage to this Pokémon.`,
	poisonAttacker: () => 'If this Pokémon is in an Active slot and is damaged by an attack from an opposing Pokémon, the Attacking Pokémon is now Poisoned.',
	typesBoost: f => `Attacks used by your ${E(f.types[0])} Pokémon and ${E(f.types[1])} Pokémon do +${f.n} damage to opposing Active Pokémon.`,
	fastEvolve: () => 'As long as this Pokémon is in an Active slot, it can evolve during your first turn or the turn you play it.',
	onEvolveSupporter: () => 'Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may put a Supporter card from your discard pile into your hand.',
	// Secluded Springs (A4a)
	endTurnDraw: () => 'At the end of your turn, if this Pokémon is in an Active slot, draw a card.',
	koCoinKO: () => 'If this Pokémon is in an Active slot and is Knocked Out by damage from an attack from an opposing Pokémon, flip a coin. If heads, the Attacking Pokémon is Knocked Out.',
	onEvolveHeal: f => `Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may heal ${f.n} damage from 1 of your ${E(f.type)} Pokémon.`,
	onBenchReveal: () => 'Once during your turn, when you put this Pokémon from your hand onto your Bench, you may have an opponent of your choice reveal their hand to you.',
	koGuard: () => "If an opposing Pokémon is Knocked Out by damage from this Pokémon's attacks, until your next turn, prevent all damage from—and effects of—attacks done to this Pokémon.",
	// Wisdom of Sea and Sky (A4)
	activeNoRetreat: () => 'Your Active Pokémon have no Retreat Cost.',
	toolCostLess: f => `If this Pokémon has a Pokémon Tool attached, attacks used by this Pokémon cost ${f.n} less ${E(f.type)} Energy.`,
	statusActive: f => `Once during your turn, ${f.active ? 'if this Pokémon is in an Active slot, ' : ''}you may make an opposing Active Pokémon of your choice ${f.s[0].toUpperCase() + f.s.slice(1)}.`,
	benchBoost: f => `As long as this Pokémon is on your Bench, attacks used by your Pokémon that evolve from ${f.from} do +${f.n} damage to opposing Active Pokémon.`,
	onEvolveDiscard: () => 'Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may discard a random Energy from an opposing Active Pokémon of your choice.',
	coinPreventDamage: () => 'If any damage is done to this Pokémon by attacks, flip a coin. If heads, prevent that damage.',
	healAny: f => `Once during your turn, if this Pokémon is in an Active slot, you may heal ${f.n} damage from 1 of your Pokémon.`,
	unownGuard: f => `This Ability works if you have any Unown in play with an Ability other than ${f.self}. All of your Pokémon take -${f.n} damage from attacks from opposing Pokémon.`,
	unownPower: f => `This Ability works if you have any Unown in play with an Ability other than ${f.self}. Attacks used by your Pokémon do +${f.n} damage to opposing Active Pokémon.`,
	pullDamaged: () => 'Once during your turn, if this Pokémon is in an Active slot, you may choose an opponent, one of their Benched Pokémon that has damage on it, and one of their Active Pokémon: those two switch places.',
	gatherAll: f => `Once during your turn, you may move all ${E(f.type)} Energy from each of your Pokémon to this Pokémon.`,
	zoneEvolve: () => 'Whenever you attach an Energy from your Energy Zone to this Pokémon, put a random card from your deck that evolves from this Pokémon onto this Pokémon to evolve it.',
	noSleep: () => "This Pokémon can't be Asleep.",
	// Eevee Grove (A3b)
	attachDiscardSelf: f => `Once during your turn, you may attach a ${E(f.type)} Energy from your discard pile to this Pokémon. If you do, do ${f.n} damage to this Pokémon.`,
	onEvolveDraw: f => `Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may draw ${f.n} cards.`,
	evolveAs: f => `This Pokémon can evolve into any Pokémon that evolves from ${f.name} if you play it from your hand onto this Pokémon. (This Pokémon can't evolve during your first turn or the turn you play it.)`,
	endTurnHeal: f => `At the end of your turn, if this Pokémon is in an Active slot, heal ${f.n} damage from it.`,
	healBlock: () => "Pokémon (yours and every opponent's) can't be healed.",
	morePoison: f => `Opposing Active Pokémon take +${f.n} damage from being Poisoned.`,
	activeCostMore: f => `As long as this Pokémon is in an Active slot, attacks used by opposing Active Pokémon cost ${f.n} {C} more.`,
	ubSwap: () => 'Once during your turn, you may switch one of your Ultra Beasts in an Active slot with 1 of your Benched Ultra Beasts.',
	pullBenchBasic: () => "If this Pokémon is in an Active slot, once during your turn, you may choose an opponent, one of their Active Pokémon and one of their Benched Basic Pokémon: those two switch places.",
	counter: f => `If this Pokémon is in an Active slot and is damaged by an attack from an opposing Pokémon, do ${f.n} damage to the Attacking Pokémon.`,
	reduce: f => `This Pokémon takes -${f.n} damage from attacks.`,
	ping: f => (f.need ? `Once during your turn, if you have ${list(f.need)} in play, you may do ${f.n} damage to an opposing Active Pokémon of your choice.` : `Once during your turn, you may do ${f.n} damage to 1 Pokémon of any opponent.`),
	attachZoneSelf: f => `Once during your turn, you may take a ${E(f.type)} Energy from your Energy Zone and attach it to this Pokémon.` + (f.endsTurn ? ' If you use this Ability, your turn ends.' : ''),
	freeRetreatNamed: f => `Your ${list(f.names)} in an Active slot has no Retreat Cost.`,
	coinPoison: () => 'Once during your turn, you may flip a coin. If heads, an opposing Active Pokémon of your choice is now Poisoned.',
	healActive: f => `Once during your turn, you may heal ${f.n} damage from one of your Pokémon in an Active slot.`,
	blockSupporters: () => "As long as this Pokémon is in an Active slot, your opponents can't use any Supporter cards from their hands.",
	coinSleep: () => 'Once during your turn, you may flip a coin. If heads, an opposing Active Pokémon of your choice is now Asleep.',
	attachZoneActiveType: f => `Once during your turn, you may take 1 ${E(f.type)} Energy from your Energy Zone and attach it to one of your ${E(f.type)} Pokémon in an Active slot.`,
	poisonActive: () => 'Once during your turn, if this Pokémon is in an Active slot, you may make an opposing Active Pokémon of your choice Poisoned.',
	driveOff: f => `Once during your turn, ${f.active ? 'if this Pokémon is in an Active slot, ' : ''}you may choose an opposing Active ${f.basic ? 'Basic ' : ''}Pokémon. Its owner switches it with one of their Benched Pokémon of their choice.`,
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
	checkupPing: f => `During Pokémon Checkup, if this Pokémon is in an Active slot, do ${f.n} damage to an opposing Active Pokémon of your choice.`,
	peekAny: () => "Once during your turn, you may choose any player. Look at the top card of that player's deck.",
	benchRetreatLess: f => `As long as this Pokémon is on your Bench, the Retreat Cost of your Basic Pokémon in an Active slot is ${f.n} less.`,
	noStatus: () => "This Pokémon can't be affected by any Special Conditions.",
};
const ADAPT_TRAINER = {
	fossil: f => `Play this card as if it were a ${f.hp}-HP Basic {C} Pokémon. At any time during your turn, you may discard this card from play. This card can't retreat.`,
	healOne: f => (f.names ? `Heal ${f.n} damage from 1 of your ${f.names.join(' or ')}.` : `Heal ${f.n} damage from 1 of your ${f.type ? E(f.type) + ' ' : ''}${f.stage ? 'Stage ' + f.stage + ' ' : ''}Pokémon${f.cure ? ', and it recovers from all Special Conditions' : ''}.`),
	// Celestial Guardians (A3)
	healCureActive: f => `Heal ${f.n} damage and remove a random Special Condition from one of your Pokémon in an Active slot.`,
	rareCandy: () => "Choose 1 of your Basic Pokémon in play. If you have a Stage 2 card in your hand that evolves from that Pokémon, put that card onto the Basic Pokémon to evolve it, skipping the Stage 1. You can't use this card during your first turn or on a Basic Pokémon that was put into play this turn.",
	peekShuffle: () => 'Look at the top card of your deck. Then, you may shuffle your deck.',
	// Paradox Drive (B3a)
	toolFutureBoost: f => `Attacks used by the Future Pokémon this card is attached to do +${f.n} damage to opposing Active Pokémon.`,
	stageToHand: f => `Put a random Stage ${f.stage} Pokémon from your deck into your hand.`,
	attachDiscardAncient: f => `Attach ${f.n} different types of Energy from your discard pile to your Ancient Pokémon in any way you like.`,
	shuffleFuture: () => 'Shuffle 1 of your Future Pokémon in play into your deck.',
	stadiumSwapBasic: () => 'Once during each player\'s turn, that player may shuffle a Basic Pokémon from their hand into their deck. If they do, they draw a card.',
	// Pulsing Aura (B3)
	fieldBlower: () => 'Discard a Pokémon Tool card from a Pokémon (any player\'s), or discard a Stadium card in play.',
	toolKoDraw: f => `If the Pokémon this card is attached to is Knocked Out by damage from an attack from an opposing Pokémon, draw cards until you have ${f.n} cards in your hand.`,
	stadiumToHand: () => 'Put a random Stadium card from your deck into your hand.',
	returnTyped: f => `Put 1 of your ${E(f.type)} Pokémon in play, except any Pokémon ex, into your hand.`,
	stadiumBasicToHand: f => `Once during each player's turn, that player may put a random Basic ${E(f.type)} Pokémon from their deck into their hand.`,
	stadiumTypeBoostEx: f => `Attacks used by each ${E(f.type)} Pokémon in play (every player's) do +${f.n} damage to an opposing Active Pokémon ex.`,
	stadiumWeaknessDouble: () => "When an attack used by a Pokémon that isn't a Mega Evolution Pokémon ex hits an opposing Active Pokémon for a type bonus (this game's Weakness), the damage is ×2 in place of the bonus.",
	// Mega Shine (B2b)
	oppDiscardTo: f => `Choose an opponent. That player discards cards from their hand until they have ${f.n} cards in their hand.`,
	shuffleInDraw: f => `Shuffle ${f.n} cards from your hand into your deck. Draw a card. If you can't shuffle in ${f.n} cards, you can't use this card.`,
	koBonusPoint: f => `During this turn, if an opposing Active Pokémon is Knocked Out by damage from an attack used by your ${f.names.join(' or ')}, you get ${f.n} more point.`,
	drawPerMega: () => "Draw a card for each Mega Evolution Pokémon ex in play (every player's).",
	stadiumEndDraw: f => `At the end of each player's turn, that player draws cards until they have ${f.n} cards in their hand.`,
	// Paldean Wonders (B2a)
	coinAttachBenchType: f => `Flip a coin. If heads, take a ${E(f.type)} Energy from your Energy Zone and attach it to 1 of your Benched ${E(f.type)} Pokémon.`,
	toolStageFreeRetreat: f => `The Stage ${f.stage} Pokémon this card is attached to has no Retreat Cost.`,
	discardAbilityEnergy: () => "Choose an opponent. Discard a random Energy from among the Energy attached to all of that player's Pokémon that have an Ability.",
	coinItemOrTool: () => 'Flip a coin. If heads, put a random Item card from your deck into your hand. If tails, put a random Pokémon Tool card from your deck into your hand.',
	stadiumCoinPokemon: () => 'Once during each player\'s turn, that player may flip a coin. If heads, that player puts a random Pokémon from their deck into their hand.',
	// Fantastical Parade (B2)
	healActiveReturn: f => `Heal ${f.n} damage from one of your Pokémon in an Active slot. If you healed any damage in this way, flip a coin. If heads, put this card into your hand instead of the discard pile.`,
	toolPoncho: () => "As long as the Pokémon this card is attached to is on your Bench, prevent all damage done to that Pokémon by opposing attacks and Abilities.",
	toolBarrier: f => `If this card is attached to 1 of your Pokémon, discard it at the end of an opponent's turn. The ${E(f.type)} Pokémon this card is attached to takes -${f.n} damage from attacks from opposing Pokémon.`,
	healForEnergy: f => `Heal ${f.n} damage from 1 of your ${E(f.type)} Pokémon that has ${f.need} or more ${E(f.type)} Energy attached. If you healed any damage in this way, discard ${f.cost} ${E(f.type)} Energy from that Pokémon.`,
	juggler: f => `You can use this card only if your Pokémon in play have ${f.need} or more different types of Energy attached. Move all Energy from each of your Benched Pokémon to one of your Pokémon in an Active slot.`,
	discardOppRandomEnergy: f => `You can use this card only if you have ${f.need.join(' or ')} in play. Discard ${f.n} random Energy from an opposing Active Pokémon of your choice.`,
	stadiumStageBoost: f => `Attacks used by Stage ${f.stage} Pokémon in play (every player's) do +${f.n} damage to opposing Active Pokémon.`,
	stadiumBasicHp: f => `Each Basic Pokémon in play (every player's) gets +${f.n} HP.`,
	stadiumTypeRetreat: f => `The Retreat Cost of each ${E(f.type)} Pokémon in play (every player's) is ${f.n} less.`,
	// Crimson Blaze (B1a)
	evolveFromDeckType: f => `Choose 1 of your ${E(f.type)} Pokémon in play. Put a random ${E(f.type)} Pokémon from your deck that evolves from that Pokémon onto that Pokémon to evolve it. You can't use this card during your first turn or on a Pokémon that was put into play this turn.`,
	namesToHand: f => `Put ${f.n} random cards from among ${f.names.slice(0, -1).join(', ')}, and ${f.names.at(-1)} from your deck into your hand.`,
	megaToHand: () => 'Put a random Mega Evolution Pokémon ex from your deck into your hand.',
	// Mega Rising (B1)
	prankSpinner: () => "A card from among every player's hands is chosen at random, revealed, and shuffled into its owner's deck.",
	coinsDiscardEnergy: f => `Flip ${f.coins} coins. If both of them are heads, discard a random Energy from an opposing Active Pokémon of your choice.`,
	attachDiscardActive: f => `Attach a ${E(f.type)} Energy from your discard pile to one of your ${E(f.type)} Pokémon in an Active slot.`,
	toolBerry: f => `At the end of each turn, if the Pokémon this card is attached to has half of its maximum HP or less remaining, heal ${f.n} damage from it. If you do, discard this card.`,
	toolHeavy: f => `If the Pokémon this card is attached to has a Retreat Cost of ${f.need} or more, it takes -${f.n} damage from attacks from opposing Pokémon.`,
	toolKoDraw: () => "Whenever an opposing Pokémon is Knocked Out by damage from an attack used by the Pokémon this card is attached to, draw a card.",
	guardEndure: f => `Until your next turn, if your ${f.names.join(' or ')} would be Knocked Out by damage from an attack, it is not Knocked Out and its remaining HP becomes ${f.hp}.`,
	may: f => `Put ${f.n} random Pokémon from your deck into your hand. For each Pokémon you put into your hand in this way, choose a Pokémon to shuffle from your hand into your deck.`,
	attachZoneEachNamed: f => `Take a ${E(f.type)} Energy from your Energy Zone and attach it to each of your ${f.names.join(' and ')}.`,
	copycat: () => "Choose an opponent. Shuffle your hand into your deck. Draw a card for each card in that player's hand.",
	smallBasicsToHand: f => `Put ${f.n} random Basic Pokémon with ${f.hp} HP or less from your deck into your hand.`,
	// Secluded Springs (A4a)
	toolRetreatLess: f => `The Retreat Cost of the ${E(f.type)} Pokémon this card is attached to is ${f.n} less.`,
	toolMemory: () => 'The Pokémon this card is attached to can use any attack from its previous Evolutions. (You still need the necessary Energy to use each attack.)',
	healNamedCure: f => `Heal ${f.n} damage from 1 of your ${f.names.join(' or ')}, and it recovers from being Asleep, Paralyzed, and Confused.`,
	topTools: f => `Look at the top ${f.n} cards of your deck. Put all ${f.stage ? 'Stage ' + f.stage + ' Pokémon' : 'Pokémon Tool cards'} you find there into your hand. Shuffle the other cards back into your deck.`,
	// Wisdom of Sea and Sky (A4)
	moveEnergyTypes: f => `Move a ${f.types.slice(0, -1).map(E).join(', ')}, or ${E(f.types.at(-1))} Energy from 1 of your Benched Pokémon to one of your Pokémon in an Active slot.`,
	discardOppEnergy: f => `Discard a ${E(f.type)} Energy from an opposing Active Pokémon of your choice.`,
	toolApron: f => `The ${E(f.type)} Pokémon this card is attached to takes -${f.n} damage from attacks from opposing Pokémon, recovers from all Special Conditions, and can't be affected by any Special Conditions.`,
	toolHandToDeck: f => `If the ${E(f.type)} Pokémon this card is attached to is in an Active slot and is damaged by an attack from an opposing Pokémon, the Attacking Pokémon's owner reveals a random card from their hand and shuffles it into their deck.`,
	toolRescue: () => 'If the Pokémon this card is attached to is Knocked Out by damage from an attack from an opposing Pokémon, put it into your hand instead of the discard pile.',
	will: () => 'The next time you flip any number of coins for the effect of an attack, Ability, or Trainer card after using this card on this turn, the first coin flip will definitely be heads.',
	switchDamaged: () => 'Switch one of your Pokémon in an Active slot that has damage on it with 1 of your Benched Pokémon.',
	silver: () => "Choose an opponent. That player reveals their hand to you. Choose a Supporter card you find there and shuffle it into that player's deck.",
	coinsFromDiscard: f => `Flip ${f.coins} coins. For each heads, a ${E(f.type)} Pokémon is chosen at random from your discard pile and put into your hand.`,
	peekOrder: f => (f.opp ? `Choose an opponent. For each of your ${E(f.type)} Pokémon in play, look at that many cards from the top of that player's deck and put them back in any order.` : `For each of your ${E(f.type)} Pokémon in play, look at that many cards from the top of your deck and put them back in any order.`),
	chooseOne: f => `Choose 1: During this turn, attacks used by your Pokémon that evolve from ${f.from} do +${f.boost} damage to opposing Active Pokémon. Heal ${f.heal} damage from each of your Pokémon that evolves from ${f.from}.`,
	toolEndHeal: f => `At the end of your turn, if the Pokémon this card is attached to is in an Active slot, heal ${f.n} damage from that Pokémon.`,
	penny: () => "Choose an opponent. Look at a random Supporter card that's not Penny from that player's deck and shuffle it back into their deck. Use the effect of that card as the effect of this card.",
	toolPoison: () => 'If the Pokémon this card is attached to is in an Active slot and is damaged by an attack from an opposing Pokémon, the Attacking Pokémon is now Poisoned.',
	moveDamage: f => `Choose 1 of your ${list(f.names)} that has damage on it, and move ${f.n} of its damage to an opposing Active Pokémon of your choice.`,
	returnDamaged: f => `Put 1 of your ${E(f.type)} Pokémon that has damage on it into your hand.`,
	discardTools: () => "Discard all Pokémon Tool cards attached to each of your opponents' Pokémon.",
	healAllNamed: f => `Heal all damage from 1 of your ${list(f.names)}. If you do, discard all Energy from that Pokémon.`,
	iono: () => 'Each player shuffles the cards in their hand into their deck, then draws that many cards.',
	flipDiscardEnergy: () => 'Choose an opposing Active Pokémon. Flip a coin until you get tails. For each heads, discard a random Energy from it.',
	flipAttach: f => `Choose 1 of your ${E(f.type)} Pokémon, and flip a coin until you get tails. For each heads, take a ${E(f.type)} Energy from your Energy Zone and attach it to that Pokémon.`,
	boost: f => `During this turn, attacks used by your ${f.names ? list(f.names) : 'Pokémon'} do +${f.n} damage to opposing Active Pokémon${f.ex ? ' ex' : ''}.`,
	returnActive: f => `Put your ${list(f.names)} in an Active slot into your hand.`,
	attachNamed: f => (f.n > 1 ? `Choose 1 of your ${list(f.names)}. Take ${f.n} ${E(f.type)} Energy from your Energy Zone and attach it to that Pokémon.` : `Take 1 ${E(f.type)} Energy from your Energy Zone and attach it to your ${list(f.names)}.`) + (f.endsTurn ? ' Your turn ends.' : ''),
	driveOff: f => `Choose an opposing Active ${f.basic ? 'Basic ' : ''}Pokémon. Its owner switches it with one of their Benched Pokémon of their choice. It keeps the same Active slot.`,
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
	guard: f => (f.needNoPoints ? "You can use this card only if no opponent has gotten any points. " : '') + `Until your next turn, all of your ${f.names ? f.names.join(' and ') : f.ub ? 'Ultra Beasts' : (f.type ? E(f.type) + ' ' : '') + 'Pokémon'} take -${f.n} damage from attacks from opposing Pokémon.`,
	toolKoEnergy: f => `If the ${E(f.type)} Pokémon this card is attached to is in an Active slot and is Knocked Out by damage from an attack from an opposing Pokémon, move ${f.n} ${E(f.type)} Energy from that Pokémon and attach 1 Energy each to ${f.n} of your Benched Pokémon.`,
	toolPointBoost: f => `Attacks used by the Ultra Beast this card is attached to do +${f.n} damage to opposing Active Pokémon for each point you have gotten.`,
	revealSupporters: () => 'Choose an opponent. That player reveals all of the Supporter cards in their deck to you.',
	// Space-Time Smackdown (A2)
	swapPokemon: () => 'Choose a Pokémon in your hand and switch it with a random Pokémon in your deck.',
	toolHp: f => `The ${f.ancient ? 'Ancient ' : f.type ? E(f.type) + ' ' : ''}Pokémon this card is attached to gets +${f.n} HP.`,
	toolCounter: f => `If the Pokémon this card is attached to is in an Active slot and is damaged by an attack from an opposing Pokémon, do ${f.n} damage to the Attacking Pokémon.`,
	toolCure: () => 'At the end of each turn, if the Pokémon this card is attached to is affected by any Special Conditions, it recovers from all of them, and discard this card.',
	pullDamaged: f => (f.need ? `You can use this card only if you have ${list(f.need)} in play. ` : '') + (f.any ? "Choose an opponent, one of their Benched Pokémon, and one of their Active Pokémon: those two switch places." : "Choose an opponent, one of their Benched Pokémon that has damage on it, and one of their Active Pokémon: those two switch places."),
	namedToHand: f => `Put 1 random ${f.names.length > 2 ? f.names.slice(0, -1).join(', ') + ', or ' + f.names[f.names.length - 1] : list(f.names)} from your deck into your hand.`,
	attachDiscard: f => (f.ub ? `You can use this card only if an opponent has gotten at least 1 point. Choose 1 of your Ultra Beasts. Attach ${f.n} random Energy from your discard pile to that Pokémon.` : `Choose 1 of your ${list(f.names)}. Attach ${f.n} ${E(f.type)} Energy from your discard pile to that Pokémon.`),
	moveEnergyAny: () => 'Move an Energy from 1 of your Benched Pokémon to one of your Pokémon in an Active slot.',
	mars: () => 'Choose an opponent. That player shuffles their hand into their deck and draws a card for each of their remaining points needed to win.',
	// Triumphant Light (A2a)
	healWithEnergy: f => `Heal ${f.n} damage from each of your Pokémon that has any ${E(f.type)} Energy attached.`,
	basicFromDiscard: f => (f.type ? `Put a random Basic ${E(f.type)} Pokémon from your discard pile into your hand.` : 'Put 1 random Basic Pokémon from your discard pile into your hand.'),
	costLess: f => `During this turn, attacks used by your ${f.names.length > 2 ? f.names.slice(0, -1).join(', ') + ', and ' + f.names[f.names.length - 1] : f.names.join(' and ')} cost ${f.n} less {C} Energy.`,
};

// what an attack is aimed at: 'oppActive' (one opposing Active), 'oppBench', 'oppAny', or 'none' (nothing to aim)
const NEEDS_OPP = new Set(['randomHits', 'copyAttack', 'discardTargetEnergy', 'targetCantAttack', 'targetCantRetreat', 'targetAttackMinus', 'coinDiscardHand', 'coinShuffleTarget', 'status', 'healDealt', 'switchTarget', 'benchSplash', 'noSupporter', 'revealHand', 'smokescreen', 'mimicHand', 'perOppBench', 'targetExBonus', 'allOppDamage', 'halveTarget', 'randomNextEnergy', 'handToDeck', 'coinBounceTarget', 'discardTargetTools', 'headsStatus', 'targetTypeBonus', 'targetToolBonus', 'koRecoil', 'coinHandToDeck', 'targetBasicBonus', 'noItems', 'noZoneToActive', 'moreHpBonus', 'targetStatusBonus', 'targetAbilityBonus', 'targetCostMore', 'discardItemFromHand', 'randomStatus', 'coinsHandToDeck', 'flipDiscardTargetEnergy', 'coinsKO', 'perOppEnergyAll', 'discardTargetTools', 'coinHandToDeck', 'perTargetRetreat', 'targetBurnedBonus', 'coinStatus2', 'coinSetHp', 'targetEvolvedBonus', 'drawToMatch', 'recolorEnergy', 'perTargetEnergy', 'devolveTarget', 'millTarget', 'coinStatuses', 'perAllBench', 'doom', 'targetNameBonus', 'selfDamageBonus', 'chooseStatus', 'randomBench', 'targetAttachSleep', 'perOppAbility', 'discardSupporterFromHand', 'coinsDiscardOrNothing', 'oppPointsBonus', 'coinDamageOrHeal', 'fewerPokemonBonus', 'moreEnergyBonus', 'coinDiscardTarget', 'twice', 'bothEnergyBonus', 'targetConfusedBonus', 'coinsBenchSplash', 'revengeStatus', 'randomCopy', 'oppHandCountBonus', 'noTrainers', 'targetAsleepBonus', 'targetNoAbility', 'untilTailsMill', 'noEvolve', 'oppHasTypeBonus', 'stadiumStatus', 'firstUseStatus', 'firstUseNoTrainers', 'targetVulnerableNext', 'pullThenHit', 'evolvedDiscardTarget']);
const targetOf = (damage, fx) => {
	const sn = fx.find(f => f.k === 'snipe'); if (sn) return sn.zone === 'bench' ? 'oppBench' : 'oppAny';
	if (fx.some(f => f.k === 'snipePerEnergy' || f.k === 'spotDoom')) return 'oppAny';
	if (damage > 0 || fx.some(f => NEEDS_OPP.has(f.k) || /^coins?(Mul|UntilTails|AllBonus|Bonus|PerPokemon|PerEnergy)|perBench$|perTargetEnergy/.test(f.k))) return 'oppActive';
	return 'none';
};

// ---- build -------------------------------------------------------------------------------------------------------
const STAGE = { Basic: 0, Stage1: 1, Stage2: 2 };
// a card's National Dex number: the record's own, or (the second source has none) the species table's
const dexOf = (c, sp) => (c.dexId || [])[0] || (sp && sp.num > 0 ? sp.num : null);
// Mega Evolutions: this site's species table has none, so each uses its base species' sprite and the types the games give the Mega form
const MEGA_TYPES = { 'Mega Pinsir': ['Bug', 'Flying'], 'Mega Blaziken': ['Fire', 'Fighting'], 'Mega Gyarados': ['Water', 'Dark'], 'Mega Ampharos': ['Electric', 'Dragon'], 'Mega Altaria': ['Dragon', 'Fairy'], 'Mega Absol': ['Dark'],
	'Mega Venusaur': ['Grass', 'Poison'], 'Mega Charizard Y': ['Fire', 'Flying'], 'Mega Blastoise': ['Water'], 'Mega Lopunny': ['Normal', 'Fighting'], 'Mega Steelix': ['Steel', 'Ground'],
	'Mega Swampert': ['Water', 'Ground'], 'Mega Gardevoir': ['Psychic', 'Fairy'], 'Mega Mawile': ['Steel', 'Fairy'], 'Mega Kangaskhan': ['Normal'], 'Mega Sceptile': ['Grass', 'Dragon'], 'Mega Camerupt': ['Fire', 'Ground'], 'Mega Lucario': ['Fighting', 'Steel'], 'Mega Audino': ['Normal', 'Fairy'], 'Mega Charizard X': ['Fire', 'Dragon'], 'Mega Slowbro': ['Water', 'Psychic'], 'Mega Manectric': ['Electric'], 'Mega Gengar': ['Ghost', 'Poison'], 'Mega Scizor': ['Bug', 'Steel'],
	// Ogerpon's masks (this site has the one Ogerpon): the types the games give each mask
	'Teal Mask Ogerpon': ['Grass'], 'Hearthflame Mask Ogerpon': ['Grass', 'Fire'], 'Wellspring Mask Ogerpon': ['Grass', 'Water'], 'Cornerstone Mask Ogerpon': ['Grass', 'Rock'] };
// the Ultra Beasts (cards say "your Ultra Beasts"): the eleven species the games give that name
// Ancient and Future Pokémon: the cards print the label, and neither source carries it. The label is given by species: the
// Paradox Pokémon of the past and of the future (reviewable).
const ANCIENT = new Set(['Great Tusk', 'Scream Tail', 'Brute Bonnet', 'Flutter Mane', 'Slither Wing', 'Sandy Shocks', 'Roaring Moon', 'Koraidon', 'Walking Wake', 'Gouging Fire', 'Raging Bolt']);
const FUTURE = new Set(['Iron Treads', 'Iron Bundle', 'Iron Hands', 'Iron Jugulis', 'Iron Moth', 'Iron Thorns', 'Iron Valiant', 'Miraidon', 'Iron Leaves', 'Iron Boulder', 'Iron Crown']);
const ULTRA_BEASTS = new Set(['Nihilego', 'Buzzwole', 'Pheromosa', 'Xurkitree', 'Celesteela', 'Kartana', 'Guzzlord', 'Poipole', 'Naganadel', 'Stakataka', 'Blacephalon']);
// one name, several forms in the games: the card's own type says which (a Fighting-type Wormadam is the Sandy Cloak)
// the source gives these two full-art printings' damage as "60" where the regular printing has "60+" (the effect text of
// all three adds damage, so the "+" is right): without this they would be a second, different card of the same name
const DAMAGE_GAP = { 'A2b-085': { Venoshock: '60+' }, 'A2b-093': { Venoshock: '60+' } };
const FORM_BY_CARD_TYPE = { Wormadam: { Fighting: 'Wormadam-Sandy', Metal: 'Wormadam-Trash' }, 'Paldean Tauros': { Fire: 'Tauros-Paldea-Blaze', Water: 'Tauros-Paldea-Aqua', Fighting: 'Tauros-Paldea-Combat' },
	Oricorio: { Lightning: 'Oricorio-Pompom' } };
// ...or its attack does, where two forms share a card type (both Psychic-type Oricorio)
const FORM_BY_ATTACK = { Oricorio: { 'Spiteful Dance': 'Oricorio-Sensu', 'Dazzle Dance': 'Oricorio-Pau' }, Lycanroc: { 'Blood Fang': 'Lycanroc-Midnight' } };
const review = [], cards = [], byKey = new Map();
for (const c of SRC) {
	let def;
	if (c.category === 'Pokemon') {
		const base = c.name.replace(/\s+ex$/, ''), sp = SP_BY[norm((c.attacks || []).map(x => (FORM_BY_ATTACK[base] || {})[x.name]).find(Boolean) || '')] || SP_BY[norm((FORM_BY_CARD_TYPE[base] || {})[c.types[0]] || '')] || SP_BY[norm(base)] || SP_BY[norm(base.replace(/^(\w+) Rotom$/, 'Rotom-$1'))] || SP_BY[norm(base.replace(/^Origin Forme (\w+)$/, '$1-Origin'))] || SP_BY[norm(base.replace(/^Origin Forme /, ''))] || SP_BY[norm(base.replace(/^Paldean (.+)$/, '$1-Paldea'))] || SP_BY[norm(base.replace(/^Paldean /, ''))] || SP_BY[norm(base.replace(/^Alolan (.+)$/, '$1-Alola'))] || SP_BY[norm(base.replace(/^Galarian (.+)$/, '$1-Galar'))] || SP_BY[norm(base.replace(/^Galarian /, ''))] || SP_BY[norm(base.replace(/^Mega (.+)$/, '$1-Mega'))] || SP_BY[norm(base.replace(/^Mega (.+?)(?: [XY])?$/, '$1'))] || SP_BY[norm(base.replace(/^\w+ Mask (Ogerpon)$/, '$1'))] || SP_BY[norm(base.replace(/^Castform (\w+) Form$/, 'Castform-$1'))] || SP_BY[norm(base.replace(/^Rapid Strike Urshifu$/, 'Urshifu-Rapid-Strike'))] || SP_BY[norm(base.replace(/^Single Strike Urshifu$/, 'Urshifu'))];   // (this site has no Origin Forme Dialga or Palkia: the same types, the base sprite)   // (the card says "Wash Rotom", the games "Rotom-Wash")
		if (!sp) { if (SURVEY) { gaps.push('no mainline species for ' + c.name); continue; } throw new Error('no mainline species for ' + c.name); }
		let bad = false;
		const attacks = (c.attacks || []).map((a, i) => {
			const mv = MV_BY[norm(a.name)], ex = ATTACK_TYPE[a.name];
			if (!mv && !ex) { if (SURVEY) { gaps.push(`no Combat Type for the attack "${a.name}" (${c.name})`); bad = true; return null; } throw new Error(`no Combat Type for the attack "${a.name}" (${c.name}): add it to ATTACK_TYPE`); }
			const [combatType, basis, why] = mv ? [mv.type, 'move', `the mainline move ${mv.name}`] : [ex[0], ex[1], ex[2] || 'its name'];
			const dm = /^(\d+)([+×x]?)$/.exec(String((DAMAGE_GAP[c.id] || {})[a.name] ?? a.damage ?? '').trim()) || [null, '0', ''];
			// the source drops the printed "+" / "×" from some records (the same card has it in another printing): the attack's own text says which it is
			if (!dm[2] && +dm[1] > 0 && a.effect) dm[2] = /more damage/.test(a.effect) ? '+' : /does \d+ damage for each/.test(a.effect) ? '×' : '';
			const fx0 = a.effect ? read(ATTACK_FX, a.effect, `attack effect (${c.name}: ${a.name})`) : [], fx = fx0 && a.toWas ? fx0.map(f => (f.k === 'attachZone' ? { ...f, toWas: a.toWas } : f)) : fx0;
			if (!fx) { bad = true; return null; }
			const damage = +dm[1];
			review.push([a.name, c.name, combatType, basis, why]);
			return { name: a.name, combatType, ...(RETYPED[a.name] && RETYPED[a.name] !== combatType ? { typeWas: RETYPED[a.name] } : {}), typeBasis: basis, cost: (a.cost || []).map(en), ...(a.costWas ? { costWas: a.costWas.map(en) } : {}), damage, ...(a.damageWas != null ? { damageWas: a.damageWas } : {}), damageMode: dm[2] === '+' ? '+' : dm[2] ? 'x' : '', fx, target: targetOf(damage, fx),
				text: a.effect || '', adapted: fx.map(f => ADAPT_ATTACK[f.k](f)).join(' '), note: noteFor(fx.map(f => f.k), a.effect, fx.map(f => ADAPT_ATTACK[f.k](f)).join(' ')) };
		});
		const ab = (c.abilities || [])[0];
		const afx = ab ? read(ABILITY_FX, ab.effect, `ability (${c.name}: ${ab.name})`) : null;
		if (bad || (ab && !afx)) continue;
		def = { name: c.name, kind: 'pokemon', cardType: c.types[0], combatTypes: (MEGA_TYPES[base] || sp.types).slice(0, 2), hp: c.hp, stage: STAGE[c.stage], evolvesFrom: c.evolveFrom || null, ex: /\sex$/.test(c.name),
			retreat: c.retreat || 0, weakness: (c.weaknesses || [])[0]?.type || null, points: /^Mega .+\sex$/.test(c.name) ? 3 : /\sex$/.test(c.name) ? 2 : 1, ...(ULTRA_BEASTS.has(base) ? { ub: true } : {}), ...(ANCIENT.has(base) ? { ancient: true } : FUTURE.has(base) ? { future: true } : {}), attacks,
			ability: ab ? { name: ab.name, fx: afx, text: ab.effect, adapted: ADAPT_ABILITY[afx.k](afx), note: noteFor(['AB:' + afx.k], ab.effect, ADAPT_ABILITY[afx.k](afx)) } : null, dex: dexOf(c, sp) || null, ...(sp.sprite && dexOf(c, sp) && sp.sprite !== `s${dexOf(c, sp) * 32}.png` ? { sprite: sp.sprite } : {}) };   // (a form names its own sprite: Wash Rotom is not drawn as Rotom)
	} else {
		const fx = read(TRAINER_FX, c.effect, `Trainer (${c.name})`);
		if (!fx) continue;
		def = { name: c.name, kind: c.trainerType === 'Supporter' ? 'supporter' : c.trainerType === 'Tool' ? 'tool' : c.trainerType === 'Stadium' ? 'stadium' : 'item', fx, text: c.effect, adapted: ADAPT_TRAINER[fx.k](fx), note: noteFor(['TR:' + fx.k], c.effect, ADAPT_TRAINER[fx.k](fx)) };
		// a fossil is played as a Pokémon: Colorless on the card; in combat it is Rock (a fossil; reviewable)
		if (fx.k === 'fossil') Object.assign(def, { cardType: 'Colorless', combatTypes: ['Rock'], hp: fx.hp, stage: 0, evolvesFrom: null, ex: false, retreat: 0, weakness: null, points: 1, attacks: [], ability: null, fossil: true });
	}
	// alternate art of the same gameplay card: one definition, its printings listed
	const key = plain(JSON.stringify(def).replace(/ +"/g, '"')).replace(/\{ex\}/g, 'ex').replace(/take 1 \{/g, 'take a {').replace(/’/g, "'").replace(/(?:\\n)+/g, ' ').replace(/−/g, '-').replace(/ {2,}/g, ' ').replace(/Benched (\w+) or \1 ex/g, 'Benched $1 and $1 ex');   // (printings that differ only in how they write "ex", "take 1 Energy" for "take a Energy", a curly apostrophe or a minus sign for the plain ones, a line break for a space, or "or" for "and" between a Pokémon and its ex, are one card)
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
* **decided** — Pocket-only, and the name does not settle it: a call was made, with its reason beside it. To change one, edit \`ATTACK_TYPE\` in the tool
  (and list its old type in \`RETYPED\`, so matches already recorded replay as they were played).

The rules the calls follow: a name with an element in it takes that element; a renamed mainline move takes that move's type; an
attack that is one Pokémon's own takes the type of that Pokémon it is plainly made of; an attack shared by Pokémon with nothing in
common takes the type of the plain mainline move it most resembles (usually Normal).

A fossil (Helix Fossil, Dome Fossil, Old Amber) is Colorless on the card and **Rock** in combat (decided).

## Decided (${rows.filter(r => r[3] === 'decided').length})

| Attack | Used by | Combat Type | Why |
|---|---|---|---|
${rows.filter(r => r[3] === 'decided').map(r => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[4]} |`).join('\n')}

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
const BOOSTER = { Charizard: 'C', Mewtwo: 'M', Pikachu: 'P', Dialga: 'D', Palkia: 'K', Solgaleo: 'O', Lunala: 'U', Lugia: 'L', 'Ho-Oh': 'H', 'Mega Gyarados': 'Y', 'Mega Blaziken': 'B', 'Mega Altaria': 'T' };
const FOIL = { '1D': '1F', '2D': '2F', '3D': '3F' };   // (the foil version of a diamond card, found only in the Deluxe Packs)
const RARE = { 'One Diamond': '1D', 'Two Diamond': '2D', 'Three Diamond': '3D', 'Four Diamond': '4D', 'One Star': '1S', 'Two Star': '2S', 'Three Star': '3S', Crown: 'CR', 'One Shiny': '1H', 'Two Shiny': '2H' };
// the source lists no rarity for these two printings (Wigglytuff ex, full art and rainbow). Their numbers sit inside the set's
// two-star run (A1-251 to A1-280), so they are two-star here. Remove a line when the source gains the field.
const RARITY_GAP = { 'A1-265': 'Two Star', 'A1-279': 'Two Star' };
const srcById = new Map(SRC.map(c => [c.id, c]));
const prints = cards.flatMap(c => c.printings.map(p => { const x = srcById.get(p); return [p, c.id, (x.foil ? FOIL[RARE[x.rarity]] : null) || RARE[RARITY_GAP[p] || x.rarity] || 'N', setOf(p) === 'A1a' ? 'W' : setOf(p) === 'A2a' ? 'A' : setOf(p) === 'A2b' ? 'S' : setOf(p) === 'A3a' ? 'X' : setOf(p) === 'A3b' ? 'E' : setOf(p) === 'A4a' ? 'G' : setOf(p) === 'A4b' ? 'Q' : setOf(p) === 'B2b' ? 'I' : setOf(p) === 'B3' ? 'V' : setOf(p) === 'B3a' ? 'Z' : setOf(p) === 'B1a' ? 'R' : setOf(p) === 'B2' ? 'F' : setOf(p) === 'B2a' ? 'N' : (x.boosters || []).map(b => BOOSTER[b.name]).sort().join('')]; }));
const packsJs = `// GENERATED by tools/gen_pocket_cards.mjs from pocketenhanced/data/source/tcgdex_a1.json — do not edit.
// Every printing of Genetic Apex and Promo-A: [printing id, the card it plays as (cards.js), rarity, boosters].
// Rarity: 1D-4D diamonds, 1S-3S stars, CR crown, N none (promo). Boosters: C Charizard, M Mewtwo, P Pikachu (Genetic Apex),
// W Mew (Mythical Island: the set has one booster, so its source lists none per card); D Dialga, K Palkia (Space-Time
// Smackdown); A Arceus (Triumphant Light, one booster); S Shining Revelry's one booster (it adds the shiny rarities 1H, 2H);
// '' = in no pack.
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
	`attacks ${pk.reduce((a, c) => a + c.attacks.length, 0)} (${rows.filter(r => r[3] === 'decided').length} Combat Types decided by a call)`);
if (CHECK && stale) { console.log('the committed card files are out of date: node tools/gen_pocket_cards.mjs'); process.exit(1); }
