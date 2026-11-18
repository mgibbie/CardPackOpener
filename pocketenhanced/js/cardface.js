// cardface.js — how a card is drawn: its face as markup, and fitting its text. Shared by the game (main.js) and by
// the design wiki's binder of every card (designwiki/app.js), so a card looks the same wherever it is shown.
// The styles are css/pocket.css: a face needs an ancestor with class "pe" (the colours) and a parent with class "pf".
import { CARDS, card } from './data/cards.js';
import { LOOKS, DEX, TINTS } from './data/looks.js';
import * as COLL from './collection.js';
import { cardArt, PEOPLE, ITEMS } from './artconfig.js';
import { drawnArt } from './art_drawn.js';
import { sceneHtml } from './scene8.js';
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export const ty = t => `<span class="ty" style="--c:var(--t-${t})">${t}</span>`;
// (this game's own drawings of the ten signs, in the card game's manner: a leaf, a flame, a drop, a bolt, an eye, a fist, a crescent, a nut, a star, a dragon's head)
export const EICON = {
	Grass: 'M12 2.5c-4.6 1.6-7.4 5.2-7.4 9.6 0 2 .7 3.8 1.9 5.2L4.4 20l1.6 1.5 2.2-2.6c1.2.7 2.5 1.1 3.8 1.1 4.6 0 7.6-3.8 7.6-8.6 0-3.6-2.6-7-7.6-8.900z',
	Fire: 'M12 21.6c-4.2 0-7-2.6-7-6.3 0-2.3 1.1-3.9 2.3-5.2.2 1.3.7 2.1 1.4 2.6-.3-3.2.9-6.2 3.6-9.1.1 2.6 1 4.1 2.2 5.6.5-.7.8-1.6.8-2.7 2.3 2.2 3.7 5.2 3.7 8.600 0 3.800-2.800 6.500-7 6.500zm.1-2.200c1.700 0 2.800-1.100 2.800-2.700 0-1.400-.9-2.500-1.900-3.700-.3 1.100-.8 1.800-1.500 2.200-.2-.9-.6-1.500-1.100-2-.7 1-1.200 2-1.200 3.300 0 1.700 1.200 2.900 2.900 2.900z',   // (a flame of several tongues, with a smaller one inside)
	Water: 'M12 2C9 6.600 5.500 10.200 5.500 14.600a6.500 6.500 0 0 0 13 0C18.500 10.200 15 6.600 12 2zM9.200 17.400a3.600 3.600 0 0 1-1.400-3.600l1.500.3a2.200 2.200 0 0 0 .9 2.100z',
	Lightning: 'M14.500 2L5 13.200h5.200L8.500 22 19 10.300h-5.400z',
	Psychic: 'M12 5C7.200 5 3.600 8 1.800 12c1.800 4 5.400 7 10.200 7s8.400-3 10.200-7C20.400 8 16.800 5 12 5zm0 2.600a4.400 4.400 0 1 1 0 8.800 4.400 4.400 0 0 1 0-8.800zm0 2.200a2.200 2.200 0 1 0 0 4.400 2.200 2.200 0 0 0 0-4.400z',
	Fighting: 'M4.800 5.200h3v4.500h-3zM8.600 4.200h3v5.500h-3zM12.400 4.200h3v5.500h-3zM16.200 5.200h3v4.500h-3zM4.800 10.600h14.400v3.400h-4.600l-1.500 1.900 1.900 1.500-1.300 2.400H7.400a2.600 2.600 0 0 1-2.600-2.600z',   // (a fist from the front: four knuckles over the folded thumb)
	Darkness: 'M13 3.200a8.200 8.200 0 1 0 0 16.400 8.200 8.200 0 0 0 0-16.400zm2.800 3.400a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',   // (a dark ball with a glint, leaving a crescent of the type's colour at its edge)
	Metal: 'M8 8.800h8l-4 7z',   // (a triangle pointing down, inside three corner pieces: ELINES_DARK draws those)
	Colorless: 'M12 1.800l2.400 6 6.400-.8-3.900 5 3.900 5-6.400-.8-2.400 6-2.400-6-6.400.8 3.900-5-3.900-5 6.400.8z',
	Dragon: 'M14.600 4.300A8.600 8.600 0 1 0 19.700 15.600z',   // (a dark disc with its upper right cut away on a slant: a head in profile. EFILL_LIGHT draws the fang in it)
};
// (lines drawn light on a sign: the veins of the leaf)
export const ELINES = { Grass: 'M12 6.200v11M12 10.200l-2.900-2.100M12 13.400l3.300-2.400M12 16.300l-2.500-1.800' };
// (shapes filled light on a sign: the Dragon sign's fang)
export const EFILL_LIGHT = { Dragon: 'M6.300 8.600c1.100-2 3.300-3.300 5.700-3.300l2.200 8.100c-2.400-1.900-5.400-3.100-7.900-4.800z' };
// (lines drawn dark: the three corner pieces round the Metal sign's triangle)
export const ELINES_DARK = { Metal: 'M4.600 11l2.800-5.200h3.200M19.400 11l-2.800-5.200h-3.200M8.800 17.400l1.100 2h4.200l1.100-2' };
export const en = (t, cls) => `<span class="en ${cls || ''}" style="--c:var(--e-${t})" title="${t}">${EICON[t] ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${EICON[t]}"/>${ELINES[t] ? `<path class="lt" d="${ELINES[t]}"/>` : ''}${ELINES_DARK[t] ? `<path class="dk" d="${ELINES_DARK[t]}"/>` : ''}${EFILL_LIGHT[t] ? `<path class="lf" d="${EFILL_LIGHT[t]}"/>` : ''}</svg>` : ''}</span>`;
export const ELETTER = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal', C: 'Colorless', N: 'Dragon' };
/** Card text for the page: escaped, with the card game's {R}-style Energy symbols drawn as pips. */
export const tx = s => esc(s || '').replace(/\{([A-Z])\}/g, (m, l) => (ELETTER[l] ? en(ELETTER[l]) : m)).replace(/\{ex\}/g, '<i class="exm">ex</i>');
export const sprite = c => (c.sprite ? `/overworld/data/pokemon/${c.sprite}` : c.dex ? `/overworld/data/pokemon/s${c.dex * 32}.png` : null);   // (a form has its own sprite)
// (your own picture for a card, if a folder is set in artconfig.js: it covers the default art, and steps aside if there is none)
export const ART = cardArt();
export const ownArt = c => (ART ? `<img class="own" src="${esc(ART.base + c.id + '.' + ART.ext)}" alt="" loading="lazy" onerror="this.remove()">` : '');
export const artHtml = c => ownArt(c) + baseArt(c);
export const baseArt = c => {
	if (c.kind !== 'pokemon' && PEOPLE[c.name]) return `<span class="person" style="background-image:url(/overworld/data/people/${PEOPLE[c.name][0]}.png);background-size:${PEOPLE[c.name][1] * 100}% 100%"></span>`;   // (the first frame of the walking sheet: facing us)
	if (c.kind !== 'pokemon' && ITEMS[c.name]) return `<img class="icon" src="/overworld/item_icons/${ITEMS[c.name]}.png" alt="" loading="lazy">`;
	const d = drawnArt(c); if (d) return d;   // (this game's own drawing, for a Trainer the site has no sprite or icon for)
	const s = c.kind === 'pokemon' && !c.fossil ? sprite(c) : null; return s ? `<img src="${s}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph',textContent:'?'}))">` : `<span class="ph">${c.fossil ? '🦴' : c.kind === 'item' ? '🎒' : c.kind === 'supporter' ? '🧑' : '?'}</span>`; };


// ---- card faces, drawn as Pocket's cards are (a card is 10em x 14em, everything on it sized in em):
//   a silver border; a slanted stage tab, the Pokémon it evolves from in a round portrait, the name, HP and the
//   Energy symbol across the top; the art in a thin metal bevel; a strip under it with the Pokédex number, the
//   species and its height and weight; an Ability under a red tab; attacks with their cost, name and damage; the
//   bottom line; Pocket's "ex rule" box; the rarity and the card's number.
// This game adds two things a Pocket card does not carry, and both sit where Pocket has something this game does not
// use: an attack's COMBAT TYPE is a small tab under its name, and the Pokémon's own Combat Types stand in the bottom
// line where Pocket prints Weakness (Weakness is not used here).
// A printing that is a full-art, rainbow, immersive, shiny or gold card (data/looks.js) is drawn as that kind: its
// art fills the card and it carries less (no rules text); the whole card is in the panel that opens on hover (cardTip)
// and in the inspect view.
/** Is this card of that Card Type? (Two of Dual Fusion's Pokémon are printed with two.) */
export const ofType = (c, t) => !!c && (c.cardType === t || c.cardType2 === t);
export const stageOf = c => (c.fossil ? 'Fossil' : c.stage === 0 ? 'Basic' : 'Stage ' + c.stage);
export const nameHtml = c => esc(c.name).replace(/ ex$/, '<i class="exm">ex</i>');
export const RAR_OF = { 'One Diamond': '1D', 'Two Diamond': '2D', 'Three Diamond': '3D', 'Four Diamond': '4D', 'One Star': '1S', 'Two Star': '2S', 'Three Star': '3S', Crown: 'CR', 'One Shiny': '1H', 'Two Shiny': '2H' };
export const BLEED = new Set(['art', 'full', 'rainbow', 'immersive', 'gold', 'shinyfull', 'anomaly']);   // (the kinds whose art fills the card)
export const LOOK_NAME = { art: 'Illustration', full: 'Full art', rainbow: 'Rainbow', immersive: 'Immersive', gold: 'Gold', shiny: 'Shiny', shinyfull: 'Shiny full art', anomaly: 'Anomaly', foil: 'Reverse holo' };
/** How a printing is drawn: one of LOOK_NAME's kinds, or null for the standard frame. */
export const lookOf = print => { if (!print) return null; if (LOOKS[print]) return LOOKS[print]; const p = COLL.printInfo(print); return p && /F$/.test(p.rarity) ? 'foil' : null; };   // (a Deluxe Pack's foil printing is a reverse holo: its kind is its rarity)
/** What shimmers on a card (sheen.js): a full-art kind all over, a rainbow in every colour, a gold in gold, a reverse
 *  holo across its body; and a holographic rare (three diamonds and up) in the background of its art. */
export const sheenOf = (c, look) => (look === 'rainbow' ? 'poly' : look === 'gold' ? 'gold' : look === 'foil' ? 'reverse' : BLEED.has(look) ? 'holo' : c.kind === 'pokemon' && /^(Three|Four) Diamond$/.test(c.rarity || '') ? 'holo-art' : look === 'shiny' ? 'holo-art' : null);
export const preDex = name => { const p = CARDS.find(x => x.kind === 'pokemon' && x.name === name && x.dex); return p ? p : null; };
/** The strip under the art, as Pocket prints it: number, species, height and weight. The species and figures are the
 *  default form's, so they are printed only on a card named as its species (not on a regional or Mega form). */
export function dexLine(c) {
	if (!c.dex) return '';
	const no = `<span>NO. ${String(c.dex).padStart(3, '0')}</span>`, d = DEX[c.dex];
	if (!d || c.name.replace(/ ex$/, '') !== d[0]) return no;
	const inches = Math.round(d[2] * 3.93701);
	return `${no}<span>${esc(d[1])}</span><span>HT: ${Math.floor(inches / 12)}'${inches % 12}"</span><span>WT: ${(d[3] * 0.220462).toFixed(1)} lbs.</span>`;
}
export const numLine = (c, print) => { const p = print ? COLL.printInfo(print) : null, id = p ? p.id : c.id, m = /^(.+)-(\d+)$/.exec(id); return `<div class="no"><span class="rr">${COLL.RARITY[p ? p.rarity : RAR_OF[c.rarity]] || ''}</span><span>${m ? m[1] + ' ' + m[2] : esc(id)}</span></div>`; };
export const TRAINER_RULE = { supporter: 'You may play only 1 Supporter card during your turn.', item: 'You may play any number of Item cards during your turn.' };
export const retreatHtml = c => (c.retreat ? en('Colorless').repeat(c.retreat) : '<i class="none">none</i>');
export function face(c, k, print) {
	const look = lookOf(print), bleed = BLEED.has(look), sh = sheenOf(c, look);
	const lk = (look ? ` lk lk-${look}${bleed ? ' bleed' : ''}${TINTS[print] ? ' an-' + TINTS[print] : ''}` : '') + (sh ? `" data-sheen="${sh}` : ''), rv = look === 'foil' ? '<i class="rv"></i>' : '';
	if (c.kind !== 'pokemon' && !k) {
		const kind = c.fossil ? 'Item · Fossil' : c.kind === 'tool' ? 'Pokémon Tool' : cap(c.kind);
		return `<div class="f tr ${c.kind}${lk}">${rv}${bleed ? `<div class="full">${artHtml(c)}</div>` : ''}<div class="hd"><span class="trn">TRAINER</span><span class="tag">${kind}</span></div><div class="n">${esc(c.name)}</div>` +
			(bleed ? '<div class="gap"></div>' : `<div class="art">${artHtml(c)}</div>`) + `<div class="tx">${tx(c.adapted || c.text)}</div>` +
			(TRAINER_RULE[c.kind] && !bleed ? `<div class="rule">${TRAINER_RULE[c.kind]}</div>` : '') + numLine(c, print) + '</div>';
	}
	const hp = k ? k.hp : c.hp, left = k ? Math.max(0, k.hp - k.dmg) : hp, pct = Math.round(100 * left / hp), pre = c.evolvesFrom ? preDex(c.evolvesFrom) : null;
	// (the rules text is on the card: what the Ability does, each attack's Combat Type and what it does, as it plays here. A card whose art fills it leaves the text to the hover panel.)
	const atks = (c.ability ? `<div class="atk ab"><span class="abt">Ability</span><span class="an">${esc(c.ability.name)}</span></div>${bleed ? '' : `<div class="fx">${tx(c.ability.adapted || c.ability.text)}</div>`}` : '') +
		(c.attacks || []).map(a => `<div class="atk"><span class="co">${a.cost.map(x => en(x)).join('')}</span><span class="anw"><span class="an">${esc(a.name)}</span><span class="tyl">${ty(a.combatType)}</span></span><span class="d">${a.damage || ''}${a.damageMode === 'x' ? '×' : a.damageMode || ''}</span></div>${!bleed && (a.adapted || a.text) ? `<div class="fx">${tx(a.adapted || a.text)}</div>` : ''}`).join('') +
		(c.fossil && !bleed ? `<div class="fx">${tx(c.adapted || c.text)}</div>` : '');
	const strip = dexLine(c);
	// (an illustration and an immersive card have a scene of their own: js/scene8.js. A picture of your own, if a folder is set, takes its place.)
	const scene = (look === 'art' || look === 'immersive') && !ART && !c.fossil && sprite(c) ? sceneHtml((c.cardType || 'Colorless') + (c.cardType2 ? '+' + c.cardType2 : ''), c.id, look === 'immersive', sprite(c)) : null;
	// (a Pokémon printed with two types: the card is split between their colours, and carries both symbols)
	const two = c.cardType2 ? `<i class="half bg-${c.cardType2}"></i>` : '';
	return `<div class="f pk${c.cardType2 ? ' dual' : ''}${lk}"${c.cardType2 ? ` style="--c2:var(--t-${c.cardType2})"` : ''}>${rv}${bleed ? (scene ? `<div class="full sc8">${scene}</div>` : `<div class="full bg-${c.cardType || 'Colorless'}">${two}${artHtml(c)}</div>`) : ''}` +
		`<div class="hd"><span class="tag">${stageOf(c)}</span>${pre && sprite(pre) ? `<span class="evo"><img src="${sprite(pre)}" alt="" loading="lazy" onerror="this.parentNode.remove()"></span>` : ''}<span class="nw"><span class="n">${nameHtml(c)}</span>${c.evolvesFrom ? `<span class="from">Evolves from ${esc(c.evolvesFrom)}</span>` : ''}</span><span class="h"><small>HP</small><span class="hpn">${left}</span></span>${c.cardType ? en(c.cardType) : ''}${c.cardType2 ? en(c.cardType2) : ''}</div>` +
		(k ? `<div class="hp ${pct <= 25 ? 'low' : pct <= 50 ? 'mid' : ''}"><i style="width:${pct}%"></i></div>` : '') +
		(bleed ? '<div class="gap"></div>' : `<div class="art bg-${c.cardType || 'Colorless'}">${two}${artHtml(c)}</div>${strip ? `<div class="strip">${strip}</div>` : ''}`) +
		`<div class="atks">${atks}</div>` +
		`<div class="ft"><span class="ct"><small>type</small>${(c.combatTypes || []).map(ty).join('')}</span><span class="rt"><small>retreat</small>${retreatHtml(c)}</span></div>` +
		(c.ex && !bleed ? `<div class="exr"><b>ex rule</b>When your Pokémon <i class="exm">ex</i> is Knocked Out, your opponent gets ${c.points || 2} points.</div>` : '') + numLine(c, print) + '</div>';
}

/** Fit the faces under `root` that have not been fitted yet: a card whose rules text does not fit (a long text, or a
 *  device whose font runs wide) has its text set tighter, step by step, until it does; then long names are narrowed. */
export function fitCards(root) {
	const faces = [...root.querySelectorAll('.f.pk:not([data-fit])')].filter(f => f.clientHeight); if (!faces.length) return;
	for (let step = 1; step <= 4; step++) { const over = faces.filter(f => f.scrollHeight > f.clientHeight + 1); if (!over.length) break; for (const f of over) f.dataset.tight = step; }
	for (const f of faces) f.dataset.fit = '1';
	fitNames(faces);
}
/** A name too long for its line is set narrower (the card font has a width axis), then squeezed sideways, as a printed card does it. */
export function fitNames(faces) {
	// (all the measuring first, then all the changes: measuring after each change would lay the page out once per card)
	const over = [];
	for (const f of faces) { const n = f.querySelector('.hd .n'), box = n && n.parentNode; if (!n) continue; const room = box.clientWidth, w = n.scrollWidth; if (room && w > room + 0.5) over.push({ n, room, w }); }
	for (const o of over) o.n.style.fontStretch = Math.max(75, Math.floor(100 * o.room / o.w)) + '%';
	for (const o of over) o.w = o.n.scrollWidth;
	for (const o of over) if (o.w > o.room + 0.5) o.n.style.transform = `scaleX(${Math.max(0.34, o.room / o.w).toFixed(3)})`;
	// (the bottom line: two types beside a long Retreat Cost drop the words "type" and "retreat")
	const wide = faces.filter(f => { const ct = f.querySelector('.ft .ct'); return ct && ct.scrollWidth > ct.clientWidth + 0.5; });
	for (const f of wide) f.classList.add('ftx');
}
