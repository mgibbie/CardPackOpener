// deck.js — deck builder: collection grid -> 30-card deck, with a 3D preview.
import * as THREE from 'three';
import { CARD_W, CARD_H, CARD_D, makeFaceTexture, makeBackTexture } from './cardart.js';
import * as Col from './collection.js';

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
	if (deck.length >= Col.DECK_SIZE) { flash('Deck is full.'); return; }
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
	return localStorage.getItem('magepunk_class_v1') || '';
}

function render() {
	// collection grid: owned cards that fit your class (neutral + class + duals)
	grid.innerHTML = '';
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
	deckCount.textContent = `${deck.length} / ${Col.DECK_SIZE}`;
	deckCount.style.color = deck.length === Col.DECK_SIZE ? '#57e389' : '#e8e2f4';
}

document.getElementById('save').onclick = () => {
	const err = Col.validateDeck(deck, cardsById, collection, myClass());
	if (err) { flash(err); return; }
	Col.saveDeck(deck);
	flash('Deck saved! It will be used in your next match.');
};

// auto-fill helper: double-click the count to fill remaining slots with owned cards
deckCount.ondblclick = () => {
	for (const def of cards) {
		if (deck.length >= Col.DECK_SIZE) break;
		if (!Col.fitsClass(def, myClass())) continue;
		const can = Math.min(collection[def.id] || 0, limitOf(def.id)) - inDeck(def.id);
		for (let i = 0; i < can && deck.length < Col.DECK_SIZE; i++) deck.push(def.id);
	}
	render();
};

// class picker: same choice the game uses; off-class cards leave the grid
fetch('classes.json').then(r => r.json()).then(({ classes }) => {
	const sel = document.getElementById('class-select');
	sel.innerHTML = '<option value="">No class (all cards)</option>';
	for (const c of classes) {
		const opt = document.createElement('option');
		opt.value = c.id;
		opt.textContent = c.name;
		sel.appendChild(opt);
	}
	sel.value = myClass();
	sel.addEventListener('change', ev => {
		localStorage.setItem('magepunk_class_v1', ev.target.value);
		render();
	});
}).catch(() => {});

// ---------- boot ----------
fetch('cards.json').then(r => r.json()).then(data => {
	cards = data.cards;
	for (const d of cards) cardsById[d.id] = d;
	collection = Col.getCollection(cards);
	// load saved deck, dropping anything no longer valid
	deck = Col.loadDeck().filter(id => cardsById[id]);
	sizePreview();
	addEventListener('resize', sizePreview);
	render();
	if (cards.length) showPreview(cards[0]);
	window.__deck = { get deck() { return deck; }, addCard, removeCard, Col };
});
