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
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const SRC = JSON.parse(fs.readFileSync(path.join(ROOT, 'pocketenhanced/data/source/tcgdex_a1.json'), 'utf8')).cards;
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
];
const read = (rows, text, what) => { const t = tidy(text); for (const [re, f] of rows) { const m = re.exec(t); if (m) return f(m); } throw new Error(`no pattern reads this ${what}: "${t}"`); };

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
	copyAttack: () => "Choose an attack of any opposing Pokémon in play and use it as this attack, against this attack's target. If this Pokémon doesn't have the necessary Energy to use that attack, this attack does nothing.",
	discardSelfEnergy: f => (f.n === 'all' ? 'Discard all Energy from this Pokémon.' : `Discard ${f.n} ${E(f.type)} Energy from this Pokémon.`),
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
	status: f => (f.coin ? 'Flip a coin. If heads, the' : 'The') + ` Defending Pokémon is now ${f.s[0].toUpperCase() + f.s.slice(1)}.`,
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
	attachZone: f => (f.to === 'self' ? `Take 1 ${E(f.type)} Energy from your Energy Zone and attach it to this Pokémon.` : `Take a ${E(f.type)} Energy from your Energy Zone and attach it to 1 of your Benched ${E(f.type)} Pokémon.`),
	selfDamage: f => `This Pokémon also does ${f.n} damage to itself.`,
	benchSplash: f => `This attack also does ${f.n} damage to each Benched Pokémon of the Defending Pokémon's owner.`,
	ownBenchDamage: f => `This attack also does ${f.n} damage to 1 of your Benched Pokémon.`,
	perTargetEnergy: f => `This attack does ${f.n} more damage for each Energy attached to the Defending Pokémon.`,
	perBench: f => `This attack does ${f.n} damage for each of your Benched ${f.type ? E(f.type) + ' ' : ''}Pokémon.`,
	perBenchName: f => `This attack does ${f.n} more damage for each of your Benched ${f.name}.`,
	snipe: f => (f.zone === 'bench' ? `This attack does ${f.n} damage to 1 Benched Pokémon of any opponent.` : `This attack does ${f.n} damage to 1 Pokémon of any opponent.`),
	revealHand: () => "The Defending Pokémon's owner reveals their hand to you.",
	noSupporter: () => "The Defending Pokémon's owner can't use any Supporter cards from their hand during their next turn.",
};
const ADAPT_ABILITY = {
	healAll: f => `Once during your turn, you may heal ${f.n} damage from each of your Pokémon.`,
	pullBenchBasic: () => "If this Pokémon is in an Active slot, once during your turn, you may choose an opponent, one of their Active Pokémon and one of their Benched Basic Pokémon: those two switch places.",
	counter: f => `If this Pokémon is in an Active slot and is damaged by an attack from an opposing Pokémon, do ${f.n} damage to the Attacking Pokémon.`,
	reduce: f => `This Pokémon takes -${f.n} damage from attacks.`,
	ping: f => `Once during your turn, you may do ${f.n} damage to 1 Pokémon of any opponent.`,
	attachZoneSelf: f => `Once during your turn, you may take a ${E(f.type)} Energy from your Energy Zone and attach it to this Pokémon.`,
	blockSupporters: () => "As long as this Pokémon is in an Active slot, your opponents can't use any Supporter cards from their hands.",
	coinSleep: () => 'Once during your turn, you may flip a coin. If heads, an opposing Active Pokémon of your choice is now Asleep.',
	attachZoneActiveType: f => `Once during your turn, you may take 1 ${E(f.type)} Energy from your Energy Zone and attach it to one of your ${E(f.type)} Pokémon in an Active slot.`,
	poisonActive: () => 'Once during your turn, if this Pokémon is in an Active slot, you may make an opposing Active Pokémon of your choice Poisoned.',
	driveOff: () => 'Once during your turn, you may choose an opposing Active Pokémon. Its owner switches it with one of their Benched Pokémon of their choice.',
	peekTop: () => 'Once during your turn, you may look at the top card of your deck.',
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
};

// what an attack is aimed at: 'oppActive' (one opposing Active), 'oppBench', 'oppAny', or 'none' (nothing to aim)
const NEEDS_OPP = new Set(['randomHits', 'copyAttack', 'discardTargetEnergy', 'targetCantAttack', 'targetCantRetreat', 'targetAttackMinus', 'coinDiscardHand', 'coinShuffleTarget', 'status', 'healDealt', 'switchTarget', 'benchSplash', 'noSupporter', 'revealHand']);
const targetOf = (damage, fx) => {
	const sn = fx.find(f => f.k === 'snipe'); if (sn) return sn.zone === 'bench' ? 'oppBench' : 'oppAny';
	if (damage > 0 || fx.some(f => NEEDS_OPP.has(f.k) || /^coins?(Mul|UntilTails|AllBonus|Bonus)|perBench$|perTargetEnergy/.test(f.k))) return 'oppActive';
	return 'none';
};

// ---- build -------------------------------------------------------------------------------------------------------
const STAGE = { Basic: 0, Stage1: 1, Stage2: 2 };
const review = [], cards = [], byKey = new Map();
for (const c of SRC) {
	let def;
	if (c.category === 'Pokemon') {
		const base = c.name.replace(/\s+ex$/, ''), sp = SP_BY[norm(base)];
		if (!sp) throw new Error('no mainline species for ' + c.name);
		const attacks = (c.attacks || []).map((a, i) => {
			const mv = MV_BY[norm(a.name)], ex = ATTACK_TYPE[a.name];
			if (!mv && !ex) throw new Error(`no Combat Type for the attack "${a.name}" (${c.name}): add it to ATTACK_TYPE`);
			const [combatType, basis, why] = mv ? [mv.type, 'move', `the mainline move ${mv.name}`] : [ex[0], ex[1], ex[2] || 'its name'];
			const dm = /^(\d+)([+×x]?)$/.exec(String(a.damage ?? '').trim()) || [null, '0', ''];
			const fx = a.effect ? read(ATTACK_FX, a.effect, `attack effect (${c.name}: ${a.name})`) : [];
			const damage = +dm[1];
			review.push([a.name, c.name, combatType, basis, why]);
			return { name: a.name, combatType, typeBasis: basis, cost: (a.cost || []).map(en), damage, damageMode: dm[2] === '+' ? '+' : dm[2] ? 'x' : '', fx, target: targetOf(damage, fx),
				text: a.effect || '', adapted: fx.map(f => ADAPT_ATTACK[f.k](f)).join(' '), note: noteFor(fx.map(f => f.k), a.effect, fx.map(f => ADAPT_ATTACK[f.k](f)).join(' ')) };
		});
		const ab = (c.abilities || [])[0];
		const afx = ab ? read(ABILITY_FX, ab.effect, `ability (${c.name}: ${ab.name})`) : null;
		def = { name: c.name, kind: 'pokemon', cardType: c.types[0], combatTypes: sp.types.slice(0, 2), hp: c.hp, stage: STAGE[c.stage], evolvesFrom: c.evolveFrom || null, ex: /\sex$/.test(c.name),
			retreat: c.retreat || 0, weakness: (c.weaknesses || [])[0]?.type || null, points: /\sex$/.test(c.name) ? 2 : 1, attacks,
			ability: ab ? { name: ab.name, fx: afx, text: ab.effect, adapted: ADAPT_ABILITY[afx.k](afx), note: noteFor(['AB:' + afx.k], ab.effect, ADAPT_ABILITY[afx.k](afx)) } : null, dex: (c.dexId || [])[0] || null };
	} else {
		const fx = read(TRAINER_FX, c.effect, `Trainer (${c.name})`);
		def = { name: c.name, kind: c.trainerType === 'Supporter' ? 'supporter' : 'item', fx, text: c.effect, adapted: ADAPT_TRAINER[fx.k](fx), note: noteFor(['TR:' + fx.k], c.effect, ADAPT_TRAINER[fx.k](fx)) };
		// a fossil is played as a Pokémon: Colorless on the card; in combat it is Rock (a fossil; reviewable)
		if (fx.k === 'fossil') Object.assign(def, { cardType: 'Colorless', combatTypes: ['Rock'], hp: fx.hp, stage: 0, evolvesFrom: null, ex: false, retreat: 0, weakness: null, points: 1, attacks: [], ability: null, fossil: true });
	}
	// alternate art of the same gameplay card: one definition, its printings listed
	const key = JSON.stringify(def);
	if (byKey.has(key)) { byKey.get(key).printings.push(c.id); continue; }
	const full = { id: c.id, set: c.id.startsWith('A1-') ? 'A1' : 'P-A', rarity: c.rarity || null, ...def, printings: [c.id] };
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
const RARE = { 'One Diamond': '1D', 'Two Diamond': '2D', 'Three Diamond': '3D', 'Four Diamond': '4D', 'One Star': '1S', 'Two Star': '2S', 'Three Star': '3S', Crown: 'CR' };
// the source lists no rarity for these two printings (Wigglytuff ex, full art and rainbow). Their numbers sit inside the set's
// two-star run (A1-251 to A1-280), so they are two-star here. Remove a line when the source gains the field.
const RARITY_GAP = { 'A1-265': 'Two Star', 'A1-279': 'Two Star' };
const srcById = new Map(SRC.map(c => [c.id, c]));
const prints = cards.flatMap(c => c.printings.map(p => { const x = srcById.get(p); return [p, c.id, RARE[RARITY_GAP[p] || x.rarity] || 'N', (x.boosters || []).map(b => b.name[0]).sort().join('')]; }));
const packsJs = `// GENERATED by tools/gen_pocket_cards.mjs from pocketenhanced/data/source/tcgdex_a1.json — do not edit.
// Every printing of Genetic Apex and Promo-A: [printing id, the card it plays as (cards.js), rarity, boosters].
// Rarity: 1D-4D diamonds, 1S-3S stars, CR crown, N none (promo). Boosters: C Charizard, M Mewtwo, P Pikachu ('' = in no pack).
export const PRINTS = Object.freeze(${JSON.stringify(prints)}.map(Object.freeze));
`;
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
