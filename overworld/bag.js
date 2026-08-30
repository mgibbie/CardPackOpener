// bag.js — money + item inventory, persisted in localStorage.
import { safeLoad, safeSave, safeSaveStr } from './safestore.js';
const MONEY_KEY = 'magepunk_money';
const BAG_KEY = 'magepunk_bag_v1';
const STARTING_MONEY = 3000;

export const ITEMS = {
	pokeball:    { name: 'POKe BALL',    price: 200,  kind: 'ball', mult: 1 },
	greatball:   { name: 'GREAT BALL',   price: 600,  kind: 'ball', mult: 1.5 },
	ultraball:   { name: 'ULTRA BALL',   price: 1200, kind: 'ball', mult: 2 },
	potion:      { name: 'POTION',       price: 300,  kind: 'heal', amount: 20 },
	superpotion: { name: 'SUPER POTION', price: 700,  kind: 'heal', amount: 50 },
	hyperpotion: { name: 'HYPER POTION', price: 1200, kind: 'heal', amount: 200 },
	ether:       { name: 'ETHER',        price: 1200, kind: 'ether', amount: 10 },
	revive:      { name: 'REVIVE',       price: 1500, kind: 'revive' },
	rarecandy:   { name: 'RARE CANDY',   price: 0,    kind: 'candy' },
	// held items: give one to a party member from the bag
	oranberry:   { name: 'ORAN BERRY',   price: 100,  kind: 'held', held: { berryHeal: 10 } },
	sitrusberry: { name: 'SITRUS BERRY', price: 400,  kind: 'held', held: { berryHealFrac: 0.25 } },
	lumberry:    { name: 'LUM BERRY',    price: 500,  kind: 'held', held: { cure: 'any' } },
	chestoberry: { name: 'CHESTO BERRY', price: 150,  kind: 'held', held: { cure: 'slp' } },
	pechaberry:  { name: 'PECHA BERRY',  price: 150,  kind: 'held', held: { cure: 'psn' } },
	cheriberry:  { name: 'CHERI BERRY',  price: 150,  kind: 'held', held: { cure: 'par' } },
	rawstberry:  { name: 'RAWST BERRY',  price: 150,  kind: 'held', held: { cure: 'brn' } },
	aspearberry: { name: 'ASPEAR BERRY', price: 150,  kind: 'held', held: { cure: 'frz' } },
	persimberry: { name: 'PERSIM BERRY', price: 150,  kind: 'held', held: { cure: 'confusion' } },
	leftovers:   { name: 'LEFTOVERS',    price: 3000, kind: 'held', held: { endHealFrac: 1 / 16 } },
	everstone:   { name: 'EVERSTONE',    price: 200,  kind: 'held', held: {} }, // breeding: the holder's nature passes to the egg
	destinyknot: { name: 'DESTINY KNOT', price: 3000, kind: 'held', held: {} }, // breeding: 5 IVs inherit instead of 3
	// nature mints (the five most-wanted) + the ability swapper
	adamantmint: { name: 'ADAMANT MINT', price: 4000, kind: 'mint', nature: 'adamant' },
	modestmint:  { name: 'MODEST MINT',  price: 4000, kind: 'mint', nature: 'modest' },
	jollymint:   { name: 'JOLLY MINT',   price: 4000, kind: 'mint', nature: 'jolly' },
	timidmint:   { name: 'TIMID MINT',   price: 4000, kind: 'mint', nature: 'timid' },
	carefulmint: { name: 'CAREFUL MINT', price: 4000, kind: 'mint', nature: 'careful' },
	abilitycapsule: { name: 'ABILITY CAPSULE', price: 5000, kind: 'capsule' },
	shinycharm:  { name: 'SHINY CHARM', price: 0, kind: 'charm' }, // dex milestone: triples wild shiny odds while owned
	blacksludge: { name: 'BLACK SLUDGE', price: 1500, kind: 'held', held: { sludge: true } },
	assaultvest: { name: 'ASSAULT VEST', price: 4000, kind: 'held', held: { assaultVest: true } },
	eviolite:    { name: 'EVIOLITE',     price: 4000, kind: 'held', held: { eviolite: true } },
	heavydutyboots: { name: 'HEAVY-DUTY BOOTS', price: 3000, kind: 'held', held: { bootsGuard: true } },
	weaknesspolicy: { name: 'WEAKNESS POLICY',  price: 3000, kind: 'held', held: { weakPolicy: true } },
	choiceband:  { name: 'CHOICE BAND',  price: 4800, kind: 'held', held: { choice: 'atk' } },
	choicespecs: { name: 'CHOICE SPECS', price: 4800, kind: 'held', held: { choice: 'spa' } },
	choicescarf: { name: 'CHOICE SCARF', price: 4800, kind: 'held', held: { choice: 'spe' } },
	lifeorb:     { name: 'LIFE ORB',     price: 4900, kind: 'held', held: { lifeOrb: true } },
	expertbelt:  { name: 'EXPERT BELT',  price: 3000, kind: 'held', held: { expertBelt: true } },
	muscleband:  { name: 'MUSCLE BAND',  price: 1500, kind: 'held', held: { catBoost: 'Physical' } },
	wiseglasses: { name: 'WISE GLASSES', price: 1500, kind: 'held', held: { catBoost: 'Special' } },
	focussash:   { name: 'FOCUS SASH',   price: 2000, kind: 'held', held: { sash: true } },
	quickclaw:   { name: 'QUICK CLAW',   price: 2000, kind: 'held', held: { quickClaw: true } },
	kingsrock:   { name: "KING'S ROCK",  price: 2000, kind: 'held', held: { flinch10: true } },
	rockyhelmet: { name: 'ROCKY HELMET', price: 2500, kind: 'held', held: { helmet: true } },
	shellbell:   { name: 'SHELL BELL',   price: 2000, kind: 'held', held: { shellBell: true } },
	brightpowder:{ name: 'BRIGHTPOWDER', price: 2500, kind: 'held', held: { evade: 0.9 } },
	widelens:    { name: 'WIDE LENS',    price: 1500, kind: 'held', held: { accBoost: 1.1 } },
	scopelens:   { name: 'SCOPE LENS',   price: 2000, kind: 'held', held: { critBoost: true } },
	lightclay:   { name: 'LIGHT CLAY',   price: 1500, kind: 'held', held: { screens8: true } },
	charcoal:    { name: 'CHARCOAL',     price: 1000, kind: 'held', held: { typeBoost: 'Fire' } },
	mysticwater: { name: 'MYSTIC WATER', price: 1000, kind: 'held', held: { typeBoost: 'Water' } },
	magnet:      { name: 'MAGNET',       price: 1000, kind: 'held', held: { typeBoost: 'Electric' } },
	miracleseed: { name: 'MIRACLE SEED', price: 1000, kind: 'held', held: { typeBoost: 'Grass' } },
	nevermeltice:{ name: 'NEVERMELTICE', price: 1000, kind: 'held', held: { typeBoost: 'Ice' } },
	blackbelt:   { name: 'BLACK BELT',   price: 1000, kind: 'held', held: { typeBoost: 'Fighting' } },
	poisonbarb:  { name: 'POISON BARB',  price: 1000, kind: 'held', held: { typeBoost: 'Poison' } },
	softsand:    { name: 'SOFT SAND',    price: 1000, kind: 'held', held: { typeBoost: 'Ground' } },
	sharpbeak:   { name: 'SHARP BEAK',   price: 1000, kind: 'held', held: { typeBoost: 'Flying' } },
	twistedspoon:{ name: 'TWISTEDSPOON', price: 1000, kind: 'held', held: { typeBoost: 'Psychic' } },
	silverpowder:{ name: 'SILVERPOWDER', price: 1000, kind: 'held', held: { typeBoost: 'Bug' } },
	hardstone:   { name: 'HARD STONE',   price: 1000, kind: 'held', held: { typeBoost: 'Rock' } },
	spelltag:    { name: 'SPELL TAG',    price: 1000, kind: 'held', held: { typeBoost: 'Ghost' } },
	dragonfang:  { name: 'DRAGON FANG',  price: 1000, kind: 'held', held: { typeBoost: 'Dragon' } },
	blackglasses:{ name: 'BLACKGLASSES', price: 1000, kind: 'held', held: { typeBoost: 'Dark' } },
	metalcoat:   { name: 'METAL COAT',   price: 1000, kind: 'held', held: { typeBoost: 'Steel' } },
	silkscarf:   { name: 'SILK SCARF',   price: 1000, kind: 'held', held: { typeBoost: 'Normal' } },
	// common overworld pickups that map onto shop items
	fullrestore: { name: 'FULL RESTORE', price: 0, kind: 'heal', amount: 999, cures: 'any' },
	maxpotion:   { name: 'MAX POTION',   price: 0, kind: 'heal', amount: 999 },
	maxrevive:   { name: 'MAX REVIVE',   price: 0, kind: 'revive' },

	// STATUS CURES. The port had none: a burn or a paralysis could only be slept
	// off at a POKeMON CENTER, and the Full Heals and Antidotes that events hand
	// out across all three regions landed in the bag as dead weight.
	fullheal:    { name: 'FULL HEAL',    price: 600, kind: 'cure', cures: 'any' },
	antidote:    { name: 'ANTIDOTE',     price: 100, kind: 'cure', cures: 'psn' },
	parlyzheal:  { name: 'PARLYZ HEAL',  price: 200, kind: 'cure', cures: 'par' },
	awakening:   { name: 'AWAKENING',    price: 250, kind: 'cure', cures: 'slp' },
	burnheal:    { name: 'BURN HEAL',    price: 250, kind: 'cure', cures: 'brn' },
	iceheal:     { name: 'ICE HEAL',     price: 250, kind: 'cure', cures: 'frz' },
	healpowder:  { name: 'HEAL POWDER',  price: 300, kind: 'cure', cures: 'any' },

	// PP restoratives (the existing 'ether' kind tops up every move)
	maxether:    { name: 'MAX ETHER',    price: 2000, kind: 'ether', amount: 999 },
	elixer:      { name: 'ELIXIR',       price: 3000, kind: 'ether', amount: 10 },
	maxelixer:   { name: 'MAX ELIXIR',   price: 4500, kind: 'ether', amount: 999 },

	// vending-machine drinks and the herbal remedies, all plain heals
	freshwater:  { name: 'FRESH WATER',  price: 200, kind: 'heal', amount: 50 },
	sodapop:     { name: 'SODA POP',     price: 300, kind: 'heal', amount: 60 },
	lemonade:    { name: 'LEMONADE',     price: 350, kind: 'heal', amount: 80 },
	moomoomilk:  { name: 'MOOMOO MILK',  price: 500, kind: 'heal', amount: 100 },
	berryjuice:  { name: 'BERRY JUICE',  price: 100, kind: 'heal', amount: 20 },
	energypowder:{ name: 'ENERGYPOWDER', price: 500, kind: 'heal', amount: 50 },
	energyroot:  { name: 'ENERGY ROOT',  price: 800, kind: 'heal', amount: 200 },
	revivalherb: { name: 'REVIVAL HERB', price: 2800, kind: 'revive' },

	masterball:  { name: 'MASTER BALL',  price: 0, kind: 'ball', mult: 255 },

	// held items events hand out
	expshare:    { name: 'EXP. SHARE',   price: 3000, kind: 'held', held: {} }, // party-wide exp is already the default here
	smokeball:   { name: 'SMOKE BALL',   price: 800,  kind: 'held', held: { fleeAlways: true } },
	luckyegg:    { name: 'LUCKY EGG',    price: 0,    kind: 'held', held: { expBoost: 1.5 } },
	amuletcoin:  { name: 'AMULET COIN',  price: 0,    kind: 'held', held: { moneyBoost: 2 } },
	focusband:   { name: 'FOCUS BAND',   price: 2000, kind: 'held', held: { focusBand: true } },
	goldberry:   { name: 'GOLD BERRY',   price: 300,  kind: 'held', held: { berryHeal: 30 } },
	berry:       { name: 'BERRY',        price: 100,  kind: 'held', held: { berryHeal: 10 } },
	pinkbow:     { name: 'PINK BOW',     price: 1000, kind: 'held', held: { typeBoost: 'Normal' } },
	polkadotbow: { name: 'POLKADOT BOW', price: 1000, kind: 'held', held: { typeBoost: 'Normal' } },

	// treasure: no use beyond selling, which is exactly what they are for
	nugget:      { name: 'NUGGET',       price: 10000, kind: 'sell' },
	bigpearl:    { name: 'BIG PEARL',    price: 7500,  kind: 'sell' },
	pearl:       { name: 'PEARL',        price: 2000,  kind: 'sell' },
	starpiece:   { name: 'STAR PIECE',   price: 9800,  kind: 'sell' },
	stardust:    { name: 'STARDUST',     price: 2000,  kind: 'sell' },
	bigmushroom: { name: 'BIG MUSHROOM', price: 5000,  kind: 'sell' },
	tinymushroom:{ name: 'TINYMUSHROOM', price: 1000,  kind: 'sell' },
	heartscale:  { name: 'HEART SCALE',  price: 100,   kind: 'sell' },
	shoalshell:  { name: 'SHOAL SHELL',  price: 200,   kind: 'sell' },
	shoalsalt:   { name: 'SHOAL SALT',   price: 200,   kind: 'sell' },
	slowpoketail:{ name: 'SLOWPOKETAIL', price: 9800,  kind: 'sell' },

	// KEY ITEMS. No effect to invoke — the port gates progression through badges
	// and blockers rather than inventory — but they must at least read as
	// themselves in the bag instead of as a squashed "SILPHSCOPE".
	itemfinder:  { name: 'ITEMFINDER',   price: 0, kind: 'key' },
	coincase:    { name: 'COIN CASE',    price: 0, kind: 'key' },
	townmap:     { name: 'TOWN MAP',     price: 0, kind: 'key' },
	escaperope:  { name: 'ESCAPE ROPE',  price: 0, kind: 'key' },
	machbike:    { name: 'MACH BIKE',    price: 0, kind: 'key' },
	acrobike:    { name: 'ACRO BIKE',    price: 0, kind: 'key' },
	bicycle:     { name: 'BICYCLE',      price: 0, kind: 'key' },
	gsball:      { name: 'GS BALL',      price: 0, kind: 'key' },
	tea:         { name: 'TEA',          price: 0, kind: 'key' },
	tripass:     { name: 'TRI-PASS',     price: 0, kind: 'key' },
	rainbowpass: { name: 'RAINBOW PASS', price: 0, kind: 'key' },
	ssticket:    { name: 'S.S. TICKET',  price: 0, kind: 'key' },
	bikevoucher: { name: 'BIKE VOUCHER', price: 0, kind: 'key' },
	cardkey:     { name: 'CARD KEY',     price: 0, kind: 'key' },
	liftkey:     { name: 'LIFT KEY',     price: 0, kind: 'key' },
	basementkey: { name: 'BASEMENT KEY', price: 0, kind: 'key' },
	secretkey:   { name: 'SECRET KEY',   price: 0, kind: 'key' },
	storagekey:  { name: 'STORAGE KEY',  price: 0, kind: 'key' },
	silphscope:  { name: 'SILPH SCOPE',  price: 0, kind: 'key' },
	squirtbottle:{ name: 'SQUIRTBOTTLE', price: 0, kind: 'key' },
	secretpotion:{ name: 'SECRETPOTION', price: 0, kind: 'key' },
	clearbell:   { name: 'CLEAR BELL',   price: 0, kind: 'key' },
	silverwing:  { name: 'SILVER WING',  price: 0, kind: 'key' },
	rainbowwing: { name: 'RAINBOW WING', price: 0, kind: 'key' },
	redscale:    { name: 'RED SCALE',    price: 0, kind: 'key' },
	mysteryegg:  { name: 'MYSTERY EGG',  price: 0, kind: 'key' },
	machinepart: { name: 'MACHINE PART', price: 0, kind: 'key' },
	lostitem:    { name: 'LOST ITEM',    price: 0, kind: 'key' },
	devongoods:  { name: 'DEVON GOODS',  price: 0, kind: 'key' },
	devonscope:  { name: 'DEVON SCOPE',  price: 0, kind: 'key' },
	gogoggles:   { name: 'GO-GOGGLES',   price: 0, kind: 'key' },
	wailmerpail: { name: 'WAILMER PAIL', price: 0, kind: 'key' },
	scanner:     { name: 'SCANNER',      price: 0, kind: 'key' },
	magmaemblem: { name: 'MAGMA EMBLEM', price: 0, kind: 'key' },
	meteorite:   { name: 'METEORITE',    price: 0, kind: 'key' },
	oldseamap:   { name: 'OLD SEA MAP',  price: 0, kind: 'key' },
	// fossils: revived at the museum in the source games, inert here
	rootfossil:  { name: 'ROOT FOSSIL',  price: 0, kind: 'key' },
	clawfossil:  { name: 'CLAW FOSSIL',  price: 0, kind: 'key' },
	domefossil:  { name: 'DOME FOSSIL',  price: 0, kind: 'key' },
	helixfossil: { name: 'HELIX FOSSIL', price: 0, kind: 'key' },
	oldamber:    { name: 'OLD AMBER',    price: 0, kind: 'key' },

	// ---- the long tail the three decomps hand out ----
	// specialty balls (catch rate follows the ball's usual role; the situational
	// ones settle on a flat bonus rather than faking a condition the port
	// doesn't track)
	premierball: { name: 'PREMIER BALL', price: 200,  kind: 'ball', mult: 1 },
	timerball:   { name: 'TIMER BALL',   price: 1000, kind: 'ball', mult: 1.5 },
	repeatball:  { name: 'REPEAT BALL',  price: 1000, kind: 'ball', mult: 1.5 },
	nestball:    { name: 'NEST BALL',    price: 1000, kind: 'ball', mult: 1.5 },
	netball:     { name: 'NET BALL',     price: 1000, kind: 'ball', mult: 1.5 },
	fastball:    { name: 'FAST BALL',    price: 1000, kind: 'ball', mult: 1.5 },
	friendball:  { name: 'FRIEND BALL',  price: 1000, kind: 'ball', mult: 1 },
	heavyball:   { name: 'HEAVY BALL',   price: 1000, kind: 'ball', mult: 1.5 },
	levelball:   { name: 'LEVEL BALL',   price: 1000, kind: 'ball', mult: 1.5 },
	loveball:    { name: 'LOVE BALL',    price: 1000, kind: 'ball', mult: 1.5 },
	lureball:    { name: 'LURE BALL',    price: 1000, kind: 'ball', mult: 1.5 },
	moonball:    { name: 'MOON BALL',    price: 1000, kind: 'ball', mult: 1.5 },

	elixir:      { name: 'ELIXIR',       price: 3000, kind: 'ether', amount: 10 }, // US spelling: both reach here
	lavacookie:  { name: 'LAVA COOKIE',  price: 200,  kind: 'heal', amount: 20, cures: 'any' },
	ragecandybar:{ name: 'RAGECANDYBAR', price: 300,  kind: 'heal', amount: 20 },

	// gen-2 cure berries + the flavour berries, all held
	psncureberry:{ name: 'PSNCUREBERRY', price: 150, kind: 'held', held: { cure: 'psn' } },
	przcureberry:{ name: 'PRZCUREBERRY', price: 150, kind: 'held', held: { cure: 'par' } },
	bitterberry: { name: 'BITTER BERRY', price: 150, kind: 'held', held: { cure: 'confusion' } },
	mysteryberry:{ name: 'MYSTERYBERRY', price: 150, kind: 'held', held: { cure: 'any' } },
	figyberry:   { name: 'FIGY BERRY',   price: 100, kind: 'held', held: { berryHealFrac: 0.125 } },
	iapapaberry: { name: 'IAPAPA BERRY', price: 100, kind: 'held', held: { berryHealFrac: 0.125 } },
	enigmaberry: { name: 'ENIGMA BERRY', price: 100, kind: 'held', held: { berryHealFrac: 0.25 } },
	lansatberry: { name: 'LANSAT BERRY', price: 200, kind: 'held', held: { critBoost: true } },
	starfberry:  { name: 'STARF BERRY',  price: 200, kind: 'held', held: {} },
	// berry-blender stock: nothing to do here but be sellable
	belueberry:  { name: 'BELUE BERRY',  price: 20, kind: 'sell' },
	durinberry:  { name: 'DURIN BERRY',  price: 20, kind: 'sell' },
	pamtreberry: { name: 'PAMTRE BERRY', price: 20, kind: 'sell' },
	razzberry:   { name: 'RAZZ BERRY',   price: 20, kind: 'sell' },
	spelonberry: { name: 'SPELON BERRY', price: 20, kind: 'sell' },
	watmelberry: { name: 'WATMEL BERRY', price: 20, kind: 'sell' },
	goldteeth:   { name: 'GOLD TEETH',   price: 0,  kind: 'key' },

	// held items
	whiteherb:   { name: 'WHITE HERB',   price: 1000, kind: 'held', held: { whiteHerb: true } },
	mentalherb:  { name: 'MENTAL HERB',  price: 1000, kind: 'held', held: { mentalHerb: true } },
	cleansetag:  { name: 'CLEANSE TAG',  price: 1000, kind: 'held', held: {} },
	machobrace:  { name: 'MACHO BRACE',  price: 3000, kind: 'held', held: {} },
	soothebell:  { name: 'SOOTHE BELL',  price: 1000, kind: 'held', held: { friendBoost: 2 } },
	blackbelti:  { name: 'BLACK BELT',   price: 1000, kind: 'held', held: { typeBoost: 'Fighting' } },

	// battle-only boosters and field consumables the port has no mechanic for.
	// Real items with real names, inert until there is something to hook them to.
	xattack:     { name: 'X ATTACK',   price: 500,  kind: 'misc' },
	xdefend:     { name: 'X DEFEND',   price: 550,  kind: 'misc' },
	xspeed:      { name: 'X SPEED',    price: 350,  kind: 'misc' },
	xspecial:    { name: 'X SPECIAL',  price: 350,  kind: 'misc' },
	xaccuracy:   { name: 'X ACCURACY', price: 950,  kind: 'misc' },
	direhit:     { name: 'DIRE HIT',   price: 650,  kind: 'misc' },
	guardspec:   { name: 'GUARD SPEC.', price: 700, kind: 'misc' },
	repel:       { name: 'REPEL',      price: 350,  kind: 'misc' },
	superrepel:  { name: 'SUPER REPEL', price: 500, kind: 'misc' },
	maxrepel:    { name: 'MAX REPEL',  price: 700,  kind: 'misc' },
	ppup:        { name: 'PP UP',      price: 0,    kind: 'misc' },
	ppmax:       { name: 'PP MAX',     price: 0,    kind: 'misc' },
	// contest scarves and mail: cosmetic in the source games too
	redscarf:    { name: 'RED SCARF',    price: 100, kind: 'misc' },
	bluescarf:   { name: 'BLUE SCARF',   price: 100, kind: 'misc' },
	greenscarf:  { name: 'GREEN SCARF',  price: 100, kind: 'misc' },
	pinkscarf:   { name: 'PINK SCARF',   price: 100, kind: 'misc' },
	yellowscarf: { name: 'YELLOW SCARF', price: 100, kind: 'misc' },
	eonmail:     { name: 'EON MAIL',     price: 50,  kind: 'misc' },
	harbormail:  { name: 'HARBOR MAIL',  price: 50,  kind: 'misc' },
	letter:      { name: 'LETTER',       price: 0,   kind: 'key' },

	// remaining key items
	oaksparcel:  { name: "OAK'S PARCEL", price: 0, kind: 'key' },
	pokeflute:   { name: 'POKe FLUTE',   price: 0, kind: 'key' },
	bluecard:    { name: 'BLUE CARD',    price: 0, kind: 'key' },
	contestpass: { name: 'CONTEST PASS', price: 0, kind: 'key' },
	famechecker: { name: 'FAME CHECKER', price: 0, kind: 'key' },
	teachytv:    { name: 'TEACHY TV',    price: 0, kind: 'key' },
	powderjar:   { name: 'POWDER JAR',   price: 0, kind: 'key' },
	sootsack:    { name: 'SOOT SACK',    price: 0, kind: 'key' },
	pass:        { name: 'PASS',         price: 0, kind: 'key' },
	ruby:        { name: 'RUBY',         price: 0, kind: 'key' },
	sapphire:    { name: 'SAPPHIRE',     price: 0, kind: 'key' },
	room1key:    { name: 'ROOM 1 KEY',   price: 0, kind: 'key' },
	room2key:    { name: 'ROOM 2 KEY',   price: 0, kind: 'key' },
	room4key:    { name: 'ROOM 4 KEY',   price: 0, kind: 'key' },
	room6key:    { name: 'ROOM 6 KEY',   price: 0, kind: 'key' },
	// fishing rods: use from the bag while facing water
	oldrod:      { name: 'OLD ROD',      price: 500,  kind: 'rod', tier: 1 },
	goodrod:     { name: 'GOOD ROD',     price: 2500, kind: 'rod', tier: 2 },
	superrod:    { name: 'SUPER ROD',    price: 8000, kind: 'rod', tier: 3 },
	// evolution stones + one-off evolution items (use on a party member whose
	// species evolves with it; species_extra evos carry the item ids)
	firestone:   { name: 'FIRE STONE',    price: 2100, kind: 'stone' },
	waterstone:  { name: 'WATER STONE',   price: 2100, kind: 'stone' },
	thunderstone:{ name: 'THUNDERSTONE',  price: 2100, kind: 'stone' },
	leafstone:   { name: 'LEAF STONE',    price: 2100, kind: 'stone' },
	moonstone:   { name: 'MOON STONE',    price: 2100, kind: 'stone' },
	sunstone:    { name: 'SUN STONE',     price: 2100, kind: 'stone' },
	shinystone:  { name: 'SHINY STONE',   price: 3000, kind: 'stone' },
	vsseeker:    { name: 'VS SEEKER',     price: 500,  kind: 'seeker' }, // reusable: re-arms this map's beaten trainers at badge-scaled levels
	duskstone:   { name: 'DUSK STONE',    price: 3000, kind: 'stone' },
	dawnstone:   { name: 'DAWN STONE',    price: 3000, kind: 'stone' },
	icestone:    { name: 'ICE STONE',     price: 3000, kind: 'stone' },
	linkingcord: { name: 'LINKING CORD',  price: 4000, kind: 'stone' },
	ovalstone:   { name: 'OVAL STONE',    price: 2100, kind: 'stone' },
	protector:   { name: 'PROTECTOR',     price: 3000, kind: 'stone' },
	dragonscale: { name: 'DRAGON SCALE',  price: 3000, kind: 'stone' },
	electirizer: { name: 'ELECTIRIZER',   price: 3000, kind: 'stone' },
	magmarizer:  { name: 'MAGMARIZER',    price: 3000, kind: 'stone' },
	upgrade:     { name: 'UP-GRADE',      price: 3000, kind: 'stone' },
	dubiousdisc: { name: 'DUBIOUS DISC',  price: 3000, kind: 'stone' },
	prismscale:  { name: 'PRISM SCALE',   price: 3000, kind: 'stone' },
	razorfang:   { name: 'RAZOR FANG',    price: 3000, kind: 'stone' },
	razorclaw:   { name: 'RAZOR CLAW',    price: 3000, kind: 'stone' },
	reapercloth: { name: 'REAPER CLOTH',  price: 3000, kind: 'stone' },
	deepseatooth:{ name: 'DEEPSEATOOTH',  price: 3000, kind: 'stone' },
	deepseascale:{ name: 'DEEPSEASCALE',  price: 3000, kind: 'stone' },
	whippeddream:{ name: 'WHIPPED DREAM', price: 3000, kind: 'stone' },
	sachet:      { name: 'SACHET',        price: 3000, kind: 'stone' },
	// HMs — reusable field-move discs (kind 'hm' so they're never consumed).
	// Teach one to a compatible POKeMON, then use the move from the party menu.
	hm1: { name: 'HM01 CUT',        price: 0, kind: 'hm' },
	hm2: { name: 'HM02 FLY',        price: 0, kind: 'hm' },
	hm3: { name: 'HM03 SURF',       price: 0, kind: 'hm' },
	hm4: { name: 'HM04 STRENGTH',   price: 0, kind: 'hm' },
	hm5: { name: 'HM05 FLASH',      price: 0, kind: 'hm' },
	hm6: { name: 'HM06 ROCK SMASH', price: 0, kind: 'hm' },
	hm7: { name: 'HM07 WATERFALL',  price: 0, kind: 'hm' },
	hm8: { name: 'HM08 DIVE',       price: 0, kind: 'hm' },

	// vitamins — +10 EVs in one stat (252/stat, 510 total; stats fold in on recalc)
	hpup:    { name: 'HP UP',    price: 4900, kind: 'vitamin', stat: 'hp' },
	protein: { name: 'PROTEIN',  price: 4900, kind: 'vitamin', stat: 'atk' },
	iron:    { name: 'IRON',     price: 4900, kind: 'vitamin', stat: 'def' },
	calcium: { name: 'CALCIUM',  price: 4900, kind: 'vitamin', stat: 'spa' },
	zinc:    { name: 'ZINC',     price: 4900, kind: 'vitamin', stat: 'spd' },
	carbos:  { name: 'CARBOS',   price: 4900, kind: 'vitamin', stat: 'spe' },

	// late-gen evolution items — 12 species were unevolvable because these were
	// never obtainable (the evo data referenced them; the bag never stocked them)
	galaricacuff:      { name: 'GALARICA CUFF',      price: 3000, kind: 'stone' },
	galaricawreath:    { name: 'GALARICA WREATH',    price: 3000, kind: 'stone' },
	tartapple:         { name: 'TART APPLE',         price: 3000, kind: 'stone' },
	sweetapple:        { name: 'SWEET APPLE',        price: 3000, kind: 'stone' },
	syrupyapple:       { name: 'SYRUPY APPLE',       price: 3000, kind: 'stone' },
	crackedpot:        { name: 'CRACKED POT',        price: 3000, kind: 'stone' },
	chippedpot:        { name: 'CHIPPED POT',        price: 3000, kind: 'stone' },
	auspiciousarmor:   { name: 'AUSPICIOUS ARMOR',   price: 3000, kind: 'stone' },
	maliciousarmor:    { name: 'MALICIOUS ARMOR',    price: 3000, kind: 'stone' },
	unremarkableteacup:{ name: 'UNREMARKABLE TEACUP', price: 3000, kind: 'stone' },
	masterpieceteacup: { name: 'MASTERPIECE TEACUP', price: 3000, kind: 'stone' },
	metalalloy:        { name: 'METAL ALLOY',        price: 3000, kind: 'stone' },

	// TMs — reusable move discs sold at marts (id = tm + move id; the teach flow
	// derives the move from the id and checks the machine-compat table)
	tmthunderbolt:   { name: 'TM THUNDERBOLT',    price: 3000, kind: 'tm' },
	tmflamethrower:  { name: 'TM FLAMETHROWER',   price: 3000, kind: 'tm' },
	tmicebeam:       { name: 'TM ICE BEAM',       price: 3000, kind: 'tm' },
	tmenergyball:    { name: 'TM ENERGY BALL',    price: 3000, kind: 'tm' },
	tmsludgebomb:    { name: 'TM SLUDGE BOMB',    price: 3000, kind: 'tm' },
	tmpsychic:       { name: 'TM PSYCHIC',        price: 3000, kind: 'tm' },
	tmshadowball:    { name: 'TM SHADOW BALL',    price: 3000, kind: 'tm' },
	tmdazzlinggleam: { name: 'TM DAZZLING GLEAM', price: 3000, kind: 'tm' },
	tmdragonclaw:    { name: 'TM DRAGON CLAW',    price: 3000, kind: 'tm' },
	tmearthquake:    { name: 'TM EARTHQUAKE',     price: 5000, kind: 'tm' },
	tmrockslide:     { name: 'TM ROCK SLIDE',     price: 2500, kind: 'tm' },
	tmbrickbreak:    { name: 'TM BRICK BREAK',    price: 2500, kind: 'tm' },
	tmxscissor:      { name: 'TM X-SCISSOR',      price: 2500, kind: 'tm' },
	tmaerialace:     { name: 'TM AERIAL ACE',     price: 2000, kind: 'tm' },
	tmflashcannon:   { name: 'TM FLASH CANNON',   price: 2500, kind: 'tm' },
	tmdarkpulse:     { name: 'TM DARK PULSE',     price: 2500, kind: 'tm' },
	tmwaterpulse:    { name: 'TM WATER PULSE',    price: 2000, kind: 'tm' },
	tmthunderwave:   { name: 'TM THUNDER WAVE',   price: 1500, kind: 'tm' },
	tmwillowisp:     { name: 'TM WILL-O-WISP',    price: 1500, kind: 'tm' },
	tmtoxic:         { name: 'TM TOXIC',          price: 1500, kind: 'tm' },
	tmprotect:       { name: 'TM PROTECT',        price: 1500, kind: 'tm' },
	tmsubstitute:    { name: 'TM SUBSTITUTE',     price: 2000, kind: 'tm' },
	tmswordsdance:   { name: 'TM SWORDS DANCE',   price: 2500, kind: 'tm' },
	tmcalmmind:      { name: 'TM CALM MIND',      price: 2500, kind: 'tm' },
	tmnastyplot:     { name: 'TM NASTY PLOT',     price: 2500, kind: 'tm' },
	tmbulkup:        { name: 'TM BULK UP',        price: 2500, kind: 'tm' },
	tmroost:         { name: 'TM ROOST',          price: 2000, kind: 'tm' },
	tmstealthrock:   { name: 'TM STEALTH ROCK',   price: 2500, kind: 'tm' },
};

// display names for arbitrary picked-up item ids (TMs, berries, key items...)
const NAMES_KEY = 'magepunk_itemnames_v1';
export function registerName(id, name) {
	if (ITEMS[id]) return;
	const names = safeLoad(NAMES_KEY, {});
	if (names && typeof names === 'object' && !names[id]) {
		names[id] = name;
		safeSave(NAMES_KEY, names);
	}
}
// Ids arrive from the decomp already squashed (ITEM_ELIXER -> "elixer"), so the
// old uppercase fallback showed the long tail of un-defined pickups as one run-on
// word: "TMSTEELWING", "BIGMUSHROOM". Split the shapes we can recognise — TM/HM
// discs carry their move name, and a trailing known noun ("ball", "berry",
// "fossil"…) is worth breaking off — so an undefined item still reads.
const TAIL_WORDS = ['ball', 'berry', 'fossil', 'stone', 'scale', 'powder', 'root',
	'heal', 'potion', 'restore', 'candy', 'juice', 'milk', 'water', 'pearl', 'dust',
	'piece', 'mushroom', 'shell', 'salt', 'key', 'card', 'pass', 'ticket', 'bike',
	'flute', 'mail', 'wing', 'bell', 'scope', 'coat', 'band', 'claw', 'bow'];
// main.js hands us a move lookup once the battle data is in, so a TM can be
// named after the move it actually teaches ("TM STEEL WING") rather than the
// run-together id.
let moveNamer = null;
export function setMoveNamer(fn) { moveNamer = fn; }
function prettify(id) {
	let s = String(id);
	const tm = /^(tm|hm)(\d*)([a-z].*)?$/.exec(s);
	if (tm) {
		const move = moveNamer?.(s);
		return (tm[1] + (tm[2] || '') + ' ' + (move || tm[3] || '')).trim().toUpperCase();
	}
	for (const w of TAIL_WORDS) {
		if (s.length > w.length + 2 && s.endsWith(w)) { s = s.slice(0, -w.length) + ' ' + w; break; }
	}
	return s.toUpperCase();
}
export function nameOf(id) {
	if (ITEMS[id]) return ITEMS[id].name;
	const names = safeLoad(NAMES_KEY, {});
	if (names && names[id]) return names[id];
	return prettify(id);
}
export const SHOP_STOCK = ['pokeball', 'greatball', 'ultraball', 'potion', 'superpotion',
	'hyperpotion', 'ether', 'revive', 'oldrod', 'goodrod', 'superrod', 'vsseeker',
	'firestone', 'waterstone', 'thunderstone', 'leafstone', 'moonstone', 'sunstone',
	'shinystone', 'duskstone', 'dawnstone', 'icestone', 'linkingcord',
	'oranberry', 'sitrusberry', 'lumberry', 'leftovers', 'everstone', 'destinyknot',
	'choiceband', 'choicespecs', 'choicescarf', 'lifeorb', 'focussash', 'quickclaw',
	'kingsrock', 'rockyhelmet', 'shellbell', 'scopelens', 'charcoal', 'mysticwater', 'magnet', 'miracleseed',
	'assaultvest', 'eviolite', 'heavydutyboots', 'weaknesspolicy',
	'hpup', 'protein', 'iron', 'calcium', 'zinc', 'carbos',
	'adamantmint', 'modestmint', 'jollymint', 'timidmint', 'carefulmint', 'abilitycapsule',
	'galaricacuff', 'galaricawreath', 'tartapple', 'sweetapple', 'syrupyapple', 'crackedpot',
	'chippedpot', 'auspiciousarmor', 'maliciousarmor', 'unremarkableteacup', 'masterpieceteacup', 'metalalloy',
	// TMs (reusable — buy once, teach the whole party)
	'tmthunderbolt', 'tmflamethrower', 'tmicebeam', 'tmenergyball', 'tmsludgebomb', 'tmpsychic',
	'tmshadowball', 'tmdazzlinggleam', 'tmdragonclaw', 'tmearthquake', 'tmrockslide', 'tmbrickbreak',
	'tmxscissor', 'tmaerialace', 'tmflashcannon', 'tmdarkpulse', 'tmwaterpulse', 'tmthunderwave',
	'tmwillowisp', 'tmtoxic', 'tmprotect', 'tmsubstitute', 'tmswordsdance', 'tmcalmmind',
	'tmnastyplot', 'tmbulkup', 'tmroost', 'tmstealthrock'];
// held items a wild mon might be carrying (15% roll)
export const WILD_HELD = ['oranberry', 'sitrusberry', 'lumberry', 'chestoberry', 'pechaberry',
	'cheriberry', 'persimberry', 'leftovers', 'quickclaw', 'kingsrock'];

export function getMoney() {
	const v = parseInt(localStorage.getItem(MONEY_KEY), 10);
	if (isNaN(v)) {
		safeSaveStr(MONEY_KEY, STARTING_MONEY);
		return STARTING_MONEY;
	}
	return v;
}
export function earn(amount) {
	safeSaveStr(MONEY_KEY, getMoney() + amount);
}
export function spend(amount) {
	const m = getMoney();
	if (m < amount) return false;
	safeSaveStr(MONEY_KEY, m - amount);
	return true;
}

export function getBag() {
	const b = safeLoad(BAG_KEY, null);
	if (b && typeof b === 'object' && !Array.isArray(b)) return b;
	const fresh = { pokeball: 5, potion: 3 }; // starter kit
	safeSave(BAG_KEY, fresh);
	return fresh;
}
export function count(itemId) { return getBag()[itemId] || 0; }
export function addItem(itemId, n = 1) {
	const b = getBag();
	b[itemId] = (b[itemId] || 0) + n;
	safeSave(BAG_KEY, b);
}
export function consume(itemId) {
	const b = getBag();
	if (!b[itemId]) return false;
	b[itemId]--;
	if (b[itemId] <= 0) delete b[itemId];
	safeSave(BAG_KEY, b);
	return true;
}
export function buy(itemId) {
	const item = ITEMS[itemId];
	if (!item || !spend(item.price)) return false;
	addItem(itemId);
	return true;
}
