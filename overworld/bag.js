// bag.js — money + item inventory, persisted in localStorage.
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
	blacksludge: { name: 'BLACK SLUDGE', price: 1500, kind: 'held', held: { sludge: true } },
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
	fullrestore: { name: 'FULL RESTORE', price: 0, kind: 'heal', amount: 999 },
	maxpotion:   { name: 'MAX POTION',   price: 0, kind: 'heal', amount: 999 },
	maxrevive:   { name: 'MAX REVIVE',   price: 0, kind: 'revive' },
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
};

// display names for arbitrary picked-up item ids (TMs, berries, key items...)
const NAMES_KEY = 'magepunk_itemnames_v1';
export function registerName(id, name) {
	if (ITEMS[id]) return;
	try {
		const names = JSON.parse(localStorage.getItem(NAMES_KEY) || '{}');
		if (!names[id]) {
			names[id] = name;
			localStorage.setItem(NAMES_KEY, JSON.stringify(names));
		}
	} catch (e) {}
}
export function nameOf(id) {
	if (ITEMS[id]) return ITEMS[id].name;
	try {
		const names = JSON.parse(localStorage.getItem(NAMES_KEY) || '{}');
		if (names[id]) return names[id];
	} catch (e) {}
	return id.toUpperCase();
}
export const SHOP_STOCK = ['pokeball', 'greatball', 'ultraball', 'potion', 'superpotion',
	'hyperpotion', 'ether', 'revive', 'oldrod', 'goodrod', 'superrod',
	'firestone', 'waterstone', 'thunderstone', 'leafstone', 'moonstone', 'sunstone',
	'shinystone', 'duskstone', 'dawnstone', 'icestone', 'linkingcord',
	'oranberry', 'sitrusberry', 'lumberry', 'leftovers',
	'choiceband', 'choicespecs', 'choicescarf', 'lifeorb', 'focussash', 'quickclaw',
	'kingsrock', 'rockyhelmet', 'shellbell', 'scopelens', 'charcoal', 'mysticwater', 'magnet', 'miracleseed'];
// held items a wild mon might be carrying (15% roll)
export const WILD_HELD = ['oranberry', 'sitrusberry', 'lumberry', 'chestoberry', 'pechaberry',
	'cheriberry', 'persimberry', 'leftovers', 'quickclaw', 'kingsrock'];

export function getMoney() {
	const v = parseInt(localStorage.getItem(MONEY_KEY), 10);
	if (isNaN(v)) {
		localStorage.setItem(MONEY_KEY, String(STARTING_MONEY));
		return STARTING_MONEY;
	}
	return v;
}
export function earn(amount) {
	localStorage.setItem(MONEY_KEY, String(getMoney() + amount));
}
export function spend(amount) {
	const m = getMoney();
	if (m < amount) return false;
	localStorage.setItem(MONEY_KEY, String(m - amount));
	return true;
}

export function getBag() {
	try {
		const b = JSON.parse(localStorage.getItem(BAG_KEY));
		if (b && typeof b === 'object') return b;
	} catch (e) {}
	const fresh = { pokeball: 5, potion: 3 }; // starter kit
	localStorage.setItem(BAG_KEY, JSON.stringify(fresh));
	return fresh;
}
export function count(itemId) { return getBag()[itemId] || 0; }
export function addItem(itemId, n = 1) {
	const b = getBag();
	b[itemId] = (b[itemId] || 0) + n;
	localStorage.setItem(BAG_KEY, JSON.stringify(b));
}
export function consume(itemId) {
	const b = getBag();
	if (!b[itemId]) return false;
	b[itemId]--;
	if (b[itemId] <= 0) delete b[itemId];
	localStorage.setItem(BAG_KEY, JSON.stringify(b));
	return true;
}
export function buy(itemId) {
	const item = ITEMS[itemId];
	if (!item || !spend(item.price)) return false;
	addItem(itemId);
	return true;
}
