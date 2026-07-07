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
	// common overworld pickups that map onto shop items
	fullrestore: { name: 'FULL RESTORE', price: 0, kind: 'heal', amount: 999 },
	maxpotion:   { name: 'MAX POTION',   price: 0, kind: 'heal', amount: 999 },
	maxrevive:   { name: 'MAX REVIVE',   price: 0, kind: 'revive' },
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
export const SHOP_STOCK = ['pokeball', 'greatball', 'ultraball', 'potion', 'superpotion', 'hyperpotion', 'ether', 'revive'];

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
