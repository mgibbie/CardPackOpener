// bag.js — money + item inventory, persisted in localStorage.
const MONEY_KEY = 'magepunk_money';
const BAG_KEY = 'magepunk_bag_v1';
const STARTING_MONEY = 3000;

export const ITEMS = {
	pokeball:    { name: 'POKe BALL',    price: 200,  kind: 'ball' },
	potion:      { name: 'POTION',       price: 300,  kind: 'heal', amount: 20 },
	superpotion: { name: 'SUPER POTION', price: 700,  kind: 'heal', amount: 50 },
	hyperpotion: { name: 'HYPER POTION', price: 1200, kind: 'heal', amount: 200 },
	revive:      { name: 'REVIVE',       price: 1500, kind: 'revive' },
};
export const SHOP_STOCK = ['pokeball', 'potion', 'superpotion', 'hyperpotion', 'revive'];

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
