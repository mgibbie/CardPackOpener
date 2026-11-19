// ow_cardrequest.js — people in Pokémon Centers who collect Pocket Enhanced cards (owner's fourth improvement list,
// 2026-11-19: "Some NPCs ask for a certain card and give an item for it, which links the two games").
//
// Talked to, someone on the list asks for one card by name. With a copy in the Pocket Enhanced collection on this device,
// they ask GIVE IT / TALK (TALK highlighted first: pressing A through a conversation must not give a card away). Given,
// one copy leaves the collection (the plainest printing owned, never a special one when a plain one is there) and their
// item goes in the BAG; a flag in the save says it is done, and from then on they talk as always. Without the card they
// say what they are after, then talk as always.
//
// The card is taken the way a catch gives one (ow_pocketcard.js): from Pocket Enhanced's collection on this device, which
// that game keeps on the account the next time it is opened (its sync carries the change over: collection.js merge3).
// Pocket's card list is only loaded when one of these people is talked to. Hoenn and Kanto Centers only (Hoenn2 is
// reserved).
import * as Bag from './bag.js';
import * as Story from './events.js';
import { Journal } from './journal.js';
import { dialog } from './ow_core.js';
import { startChoice } from './choice.js';

// script -> who they are, the card they want (by name: any printing), and what they give for it
export const CARD_REQUESTS = Object.freeze({
	OldaleTown_PokemonCenter_1F_EventScript_Boy: { who: 'Boy', card: 'Pikachu', item: 'superpotion', n: 3 },
	PetalburgCity_PokemonCenter_1F_EventScript_Youngster: { who: 'Youngster', card: 'Zigzagoon', item: 'ultraball', n: 3 },
	RustboroCity_PokemonCenter_1F_EventScript_Girl: { who: 'Girl', card: 'Eevee', item: 'ppup', n: 1 },
	SlateportCity_PokemonCenter_1F_EventScript_Sailor: { who: 'Sailor', card: 'Magikarp', item: 'bigpearl', n: 1 },
	MauvilleCity_PokemonCenter_1F_EventScript_Youngster: { who: 'Youngster', card: 'Magnemite', item: 'ultraball', n: 5 },
	LilycoveCity_PokemonCenter_1F_EventScript_Maniac: { who: 'Maniac', card: 'Ditto', item: 'rarecandy', n: 1 },
	FortreeCity_PokemonCenter_1F_EventScript_Gentleman: { who: 'Gentleman', card: 'Pidgeot', item: 'nugget', n: 1 },
	PewterCity_PokemonCenter_1F_EventScript_Gentleman: { who: 'Gentleman', card: 'Onix', item: 'starpiece', n: 1 },
	CeruleanCity_PokemonCenter_1F_EventScript_Lass: { who: 'Lass', card: 'Psyduck', item: 'pearl', n: 2 },
	CeladonCity_PokemonCenter_1F_EventScript_CooltrainerF: { who: 'Cooltrainer', card: 'Vileplume', item: 'leftovers', n: 1 },
	FuchsiaCity_PokemonCenter_1F_EventScript_Man: { who: 'Man', card: 'Slowpoke', item: 'rarecandy', n: 1 },
	VermilionCity_PokemonCenter_1F_EventScript_Hiker: { who: 'Hiker', card: 'Machop', item: 'maxrevive', n: 1 },
});
export const requestFlag = script => 'CARDREQ_' + script;
export const requestDone = script => !!Story.getFlag(requestFlag(script));
const itemName = r => { const it = Bag.ITEMS[r.item]; return `${r.n > 1 ? r.n + ' ' : ''}${it ? it.name : r.item.toUpperCase()}${r.n > 1 && it && !/S$/.test(it.name) ? 'S' : ''}`; };

let mods = null;
const load = async () => (mods = mods || await Promise.all([import('../pocketenhanced/js/collection.js'), import('../pocketenhanced/js/save.js'), import('../pocketenhanced/js/data/cards.js')]).then(([C, SV, D]) => ({ C, SV, D })));
/** The printings of a card name in a collection, plainest first: [[printId, copies]]. */
function ownedOf(m, col, name) {
	const rank = r => { const i = m.C.RARITY_ORDER.indexOf(r); return i < 0 ? 99 : i; };
	const out = [];
	for (const c of m.D.CARDS) if (c.name === name) for (const p of c.printings) if (col.prints[p] > 0) out.push([p, col.prints[p], rank((m.C.printInfo(p) || {}).rarity)]);
	return out.sort((a, b) => a[2] - b[2]).map(([p, n]) => [p, n]);
}
/** Give one copy of the request's card: -> the printing given, or null (none owned any more). Never throws. */
export async function giveCard(script) {
	const r = CARD_REQUESTS[script]; if (!r || requestDone(script)) return null;
	try {
		const m = await load(), col = m.SV.collection(), have = ownedOf(m, col, r.card); if (!have.length) return null;
		const [p] = have[0], prints = { ...col.prints }; prints[p] -= 1; if (!(prints[p] > 0)) delete prints[p];
		if (!m.SV.setCollection({ ...col, prints })) return null;   // (the card leaves first: if the bag write failed after, nothing was made)
		Bag.addItem(r.item, r.n); Story.setFlag(requestFlag(script));
		try { Journal.add(`Gave ${r.who} a Pocket Enhanced card (${r.card}) for ${itemName(r)}`); } catch (e) { /* the journal is optional */ }
		return p;
	} catch (e) { return null; }
}
let busy = false;
/** Someone who wants a card, talked to: put the question (or say what they want). -> true when this took the talk.
 *  `talk` runs what talking to them always did. */
export function offerCardRequest(npc, talk) {
	const script = npc && npc.ev && npc.ev.script, r = script && CARD_REQUESTS[script];
	if (!r || requestDone(script) || busy) return false;
	busy = true;
	load().then(m => {
		busy = false;
		const have = ownedOf(m, m.SV.collection(), r.card), copies = have.reduce((a, [, n]) => a + n, 0);
		if (!copies) { dialog.open(`I collect POCKET ENHANCED cards!\nIf you ever find a ${r.card.toUpperCase()} card, I'd give you ${itemName(r)} for it.`, () => talk()); return; }
		startChoice({ options: [`GIVE ${r.card.toUpperCase()}`, 'TALK'], default: 1, ignoreB: false, list: 'card_request',
			promptText: `I collect POCKET ENHANCED cards! Would you give me your ${r.card.toUpperCase()} card${copies === 1 ? ' (your only one)' : ''}? I'll give you ${itemName(r)}.`,
			onPick: async v => {
				if (v !== 0) { talk(); return; }
				const p = await giveCard(script);
				dialog.open(p ? `Thank you! It's perfect!\nYou handed over ${r.card.toUpperCase()} and received ${itemName(r)}.` : `Oh... you don't seem to have a ${r.card.toUpperCase()} card after all.`);
			} });
	}).catch(() => { busy = false; talk(); });
	return true;
}
