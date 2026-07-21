// deck.js — deck builder: collection grid -> 30-card deck, with a 3D preview.
import * as THREE from 'three';
import { CARD_W, CARD_H, CARD_D, makeFaceTexture, makeBackTexture } from './cardart.js';
import * as Col from './collection.js';
import * as MPX from './mpmode.js';
import { STARTER_DECKS } from './dungeon.js';

// The deck builder makes a 40-card constructed deck for PvP. You choose a class
// FIRST, then the collection filters to neutral + that class's cards. In the
// test realm the deck is stored per-class on the account (server-validated);
// dungeon runs are a separate mode and use their own stock decks.
const MP_ON = MPX.mpMode();
const SIZE = Col.DECK_SIZE;
let mpState = null;
let mpClass = ''; // no class chosen yet — class is the first choice

let cards = [], cardsById = {};
let collection = {};
let deck = [];

const grid = document.getElementById('grid');
const deckList = document.getElementById('deck-list');
const deckCount = document.getElementById('deck-count');
const status = document.getElementById('status');

// ---------- 3D preview ----------
const pv = document.getElementById('preview-canvas');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(devicePixelRatio);
function sizePreview() {
	renderer.setSize(pv.clientWidth, pv.clientHeight);
	camera.aspect = pv.clientWidth / pv.clientHeight;
	camera.updateProjectionMatrix();
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
camera.position.set(0, 0, 7.4);
scene.add(new THREE.AmbientLight(0xffffff, 0.95));
const key = new THREE.DirectionalLight(0xffffff, 1.5);
key.position.set(3, 5, 6);
scene.add(key);
const rim = new THREE.PointLight(0x8f6fff, 10, 25);
rim.position.set(-4, -2, 4);
scene.add(rim);
pv.appendChild(renderer.domElement);

const edgeMat = new THREE.MeshStandardMaterial({ color: '#241b38', roughness: 0.8 });
const backMat = new THREE.MeshStandardMaterial({ map: makeBackTexture(), roughness: 0.5 });
const geo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_D);
let previewMesh = null;
function showPreview(def) {
	if (previewMesh) {
		scene.remove(previewMesh);
		previewMesh.material[4].map?.dispose();
	}
	const face = new THREE.MeshStandardMaterial({ map: makeFaceTexture(def), roughness: 0.35, metalness: 0.15 });
	previewMesh = new THREE.Mesh(geo, [edgeMat, edgeMat, edgeMat, edgeMat, face, backMat]);
	scene.add(previewMesh);
}
const clock = new THREE.Clock();
(function animate() {
	requestAnimationFrame(animate);
	const t = clock.getElapsedTime();
	if (previewMesh) {
		previewMesh.rotation.y = Math.sin(t * 0.9) * 0.45;
		previewMesh.rotation.x = Math.sin(t * 0.6) * 0.12;
	}
	renderer.render(scene, camera);
})();

// ---------- deck logic ----------
const inDeck = id => deck.filter(d => d === id).length;
const limitOf = id => cardsById[id]?.rarity === 'legendary' ? Col.MAX_LEGENDARY_COPIES : Col.MAX_COPIES;

function addCard(id) {
	if (deck.length >= SIZE) { flash('Deck is full.'); return; }
	if (inDeck(id) >= limitOf(id)) { flash(`Max ${limitOf(id)} cop${limitOf(id) > 1 ? 'ies' : 'y'} of that card.`); return; }
	if (inDeck(id) >= (collection[id] || 0)) { flash("You don't own more copies."); return; }
	deck.push(id);
	render();
}
function removeCard(id) {
	const i = deck.indexOf(id);
	if (i >= 0) deck.splice(i, 1);
	render();
}
function flash(msg) {
	status.textContent = msg;
	clearTimeout(flash._t);
	flash._t = setTimeout(() => { if (status.textContent === msg) status.textContent = ''; }, 2500);
}

function myClass() {
	if (MP_ON) return mpClass;
	return localStorage.getItem('magepunk_class_v1') || '';
}

function render() {
	// class is the first choice: nothing to build until one is picked
	grid.innerHTML = '';
	if (!myClass()) {
		grid.innerHTML = '<div style="padding:16px;color:#9b93b3;font-size:13px;line-height:1.6">'
			+ 'Choose your <b style="color:#c9b8ff">class</b> above to start.<br>'
			+ 'Your collection will filter to neutral cards plus that class\'s cards.</div>';
		deckList.innerHTML = '';
		deckCount.textContent = `0 / ${SIZE}`;
		deckCount.style.color = '#9b93b3';
		return;
	}
	// collection grid: owned cards that fit your class (neutral + class + duals)
	const rarityOrder = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
	const owned = cards.filter(d => (collection[d.id] || 0) > 0 && Col.fitsClass(d, myClass()))
		.sort((a, b) => (rarityOrder[a.rarity ?? 'common'] - rarityOrder[b.rarity ?? 'common'])
			|| (a.cost || 0) - (b.cost || 0) || a.name.localeCompare(b.name));
	for (const def of owned) {
		const have = collection[def.id] || 0;
		const used = inDeck(def.id);
		const div = document.createElement('div');
		div.className = `card-row r-${def.rarity || 'common'}` + (used >= Math.min(have, limitOf(def.id)) ? ' depleted' : '');
		div.title = def.description || '';
		div.innerHTML = `<div class="name">${def.name}</div>
			<div class="meta">${def.cost ?? 0} mana · ${def.type}${def.attack != null ? ` · ${def.attack}/${def.health}` : ''}</div>
			<div class="meta">own ${have} · in deck ${used}</div>`;
		div.onclick = () => addCard(def.id);
		div.onmouseenter = () => showPreview(def);
		grid.appendChild(div);
	}
	// deck list (grouped)
	deckList.innerHTML = '';
	const counts = {};
	for (const id of deck) counts[id] = (counts[id] || 0) + 1;
	const ids = Object.keys(counts).sort((a, b) => (cardsById[a].cost || 0) - (cardsById[b].cost || 0));
	for (const id of ids) {
		const def = cardsById[id];
		const row = document.createElement('div');
		row.className = 'deck-row';
		row.innerHTML = `<span>${def.cost ?? 0}· ${def.name}</span><span>x${counts[id]}</span>`;
		row.onclick = () => removeCard(id);
		row.onmouseenter = () => showPreview(def);
		deckList.appendChild(row);
	}
	deckCount.textContent = `${deck.length} / ${SIZE}`;
	deckCount.style.color = deck.length === SIZE ? '#57e389' : '#e8e2f4';
}

document.getElementById('save').onclick = async () => {
	if (!myClass()) { flash('Choose a class first.'); return; }
	if (MP_ON) {
		if (deck.length !== SIZE) { flash(`Decks must be exactly ${SIZE} cards (has ${deck.length}).`); return; }
		const data = await MPX.call('save-deck', { classId: mpClass, deck });
		if (data.error) { flash(data.error); return; }
		mpState = data.state;
		flash(`${mpClass} deck saved — take it into card battles against other players.`);
		return;
	}
	const err = Col.validateDeck(deck, cardsById, collection, myClass());
	if (err) { flash(err); return; }
	Col.saveDeck(deck);
	flash('Deck saved! It will be used in your next match.');
};

// auto-fill helper: double-click the count to fill remaining slots with owned cards
deckCount.ondblclick = () => {
	if (!myClass()) { flash('Choose a class first.'); return; }
	for (const def of cards) {
		if (deck.length >= SIZE) break;
		if (!Col.fitsClass(def, myClass())) continue;
		const can = Math.min(collection[def.id] || 0, limitOf(def.id)) - inDeck(def.id);
		for (let i = 0; i < can && deck.length < SIZE; i++) deck.push(def.id);
	}
	render();
};

// class picker: the FIRST choice. Picking a class filters the collection to
// neutral + that class and loads any deck already saved for it. Switching class
// prunes off-class cards from the working deck (neutrals + new class survive).
fetch('classes.json').then(r => r.json()).then(({ classes }) => {
	const sel = document.getElementById('class-select');
	sel.innerHTML = '<option value="">— choose class —</option>';
	// PvP decks can be any class; the test realm exposes the classes with a card pool
	const list = MP_ON ? classes.filter(c => STARTER_DECKS[c.id]) : classes;
	for (const c of list) {
		const opt = document.createElement('option');
		opt.value = c.id;
		opt.textContent = c.name;
		sel.appendChild(opt);
	}
	sel.value = myClass();
	sel.addEventListener('change', ev => {
		const c = ev.target.value;
		if (MP_ON) {
			mpClass = c;
			// load the saved PvP deck for this class (dropping anything now illegal)
			deck = c ? [...(mpState?.decks?.[c] || [])].filter(id => cardsById[id] && Col.fitsClass(cardsById[id], c)) : [];
		} else {
			localStorage.setItem('magepunk_class_v1', c);
			// keep the working deck but prune cards that don't fit the new class
			deck = c ? deck.filter(id => Col.fitsClass(cardsById[id], c)) : [];
		}
		render();
	});
}).catch(() => {});

// ---------- boot ----------
fetch('cards.json').then(r => r.json()).then(async data => {
	cards = data.cards;
	for (const d of cards) cardsById[d.id] = d;
	if (MP_ON) {
		mpState = await MPX.freshState();
		collection = mpState?.collection || {};
		// class-first: start with no class picked and an empty working deck
		deck = [];
	} else {
		collection = Col.getCollection(cards);
		// class-first: load the saved deck only if a class is already chosen
		deck = myClass() ? Col.loadDeck().filter(id => cardsById[id] && Col.fitsClass(cardsById[id], myClass())) : [];
	}
	sizePreview();
	addEventListener('resize', sizePreview);
	render();
	if (cards.length) showPreview(cards[0]);
	window.__deck = { get deck() { return deck; }, addCard, removeCard, Col };
});
