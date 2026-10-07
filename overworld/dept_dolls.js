// dept_dolls.js — the DOLL COUNTER, Goldenrod Dept Store 4F (Johto).
//
// In pokecrystal MOM buys these four with the money she saves for you
// (data/items/mom_phone.asm: momitem ..., MOM_DOLL, DECO_*). The port has no
// Bank of Mom (by the owner's choice), so a clerk at the empty second counter
// spot on 4F — the place 2F's second clerk stands on the same layout — sells
// them at the prices Mom pays. Buying one sets its EVENT_DECO_* flag, exactly
// what Mom's purchase does, so the house PC's DECORATION menu lists it.
import * as Bag from './bag.js';
import * as Story from './events.js';
import { dialog } from './ow_core.js';
import { startChoice, MULTI_B_PRESSED } from './choice.js';
import { decoFlag, decoName, decoOwned } from './decorations.js';
import { sfx } from './sound.js';

export const DOLL_COUNTER_MAP = 'MAP_GOLDENROD_DEPT_STORE_4F';
// mom_phone.asm order + the cost Mom pays
export const DOLLS = [
	{ id: 'DECO_CHARMANDER_DOLL', price: 1800, name: 'CHARMANDER DOLL', flag: 'EVENT_DECO_CHARMANDER_DOLL' },
	{ id: 'DECO_CLEFAIRY_DOLL', price: 4800, name: 'CLEFAIRY DOLL', flag: 'EVENT_DECO_CLEFAIRY_DOLL' },
	{ id: 'DECO_PIKACHU_DOLL', price: 8000, name: 'PIKACHU DOLL', flag: 'EVENT_DECO_PIKACHU_DOLL' },
	{ id: 'DECO_BIG_SNORLAX_DOLL', price: 22800, name: 'BIG SNORLAX', flag: 'EVENT_DECO_BIG_SNORLAX_DOLL' },
];
const nameOf = d => decoName(d.id) || d.name;
const owned = d => decoOwned(d.id) || Story.getFlag(decoFlag(d.id) || d.flag);
const player = () => ((typeof localStorage !== 'undefined' && localStorage.getItem('magepunk_name')) || 'PLAYER').toUpperCase();

export function dollCounterTalk() {
	dialog.open('Welcome to the DOLL COUNTER!\n\nOur DOLLS are delivered right to your room.', () => menu(0));
}
function menu(cursor) {
	const opts = DOLLS.map(d => `${nameOf(d)}  ${owned(d) ? 'SOLD OUT' : '$' + d.price}`).concat('CANCEL');
	startChoice({
		options: opts, default: cursor, ignoreB: false, list: 'DOLL COUNTER',
		promptText: `Which DOLL would you like?  (Money: $${Bag.getMoney()})`,
		onPick: i => {
			if (i === MULTI_B_PRESSED || i >= DOLLS.length) { dialog.open('Please come again!'); return; }
			buy(DOLLS[i], i);
		},
	});
}
function buy(d, i) {
	if (owned(d)) { sfx('ui_denied'); dialog.open(`I'm sorry, the ${nameOf(d)} is sold out.`, () => menu(i)); return; }
	dialog.open(`The ${nameOf(d)}? That will be $${d.price}. OK?\n\nZ = Buy   X = No`, k => {
		if (k === 'x') { menu(i); return; }
		if (!Bag.spend(d.price)) { sfx('ui_denied'); dialog.open("You don't have enough money.", () => menu(i)); return; }
		Story.setFlag(decoFlag(d.id) || d.flag);
		sfx('money');
		dialog.open(`Here you are. Thank you!\n\nThe ${nameOf(d)} was sent to ${player()}'s room!`, () => menu(i));
	});
}
