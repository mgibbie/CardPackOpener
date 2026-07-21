// deck.js — deck builder: pick a class, build a 40-card deck from your
// collection, save it into one of up to 40 deck slots. Class is the FIRST
// choice; the collection then filters to neutral + that class. In the test
// realm slots live on the account (server-validated); otherwise localStorage.
import * as THREE from 'three';
import { CARD_W, CARD_H, CARD_D, makeFaceTexture, makeBackTexture } from './cardart.js';
import * as Col from './collection.js';
import * as MPX from './mpmode.js';

const MP_ON = MPX.mpMode();
const SIZE = Col.DECK_SIZE;         // 40
const MAX_SLOTS = 40;
const SLOTS_KEY = 'magepunk_decks_v1';

let mpState = null;
let cards = [], cardsById = {};
let collection = {};

let slots = [];        // [{ id, name, classId, cards }]
let editingId = null;  // slot being edited, or null for a brand-new deck
let curClass = '';     // the working deck's class (class-first)
let deck = [];         // working card ids

const grid = document.getElementById('grid');
const deckList = document.getElementById('deck-list');
const deckCount = document.getElementById('deck-count');
const slotList = document.getElementById('slot-list');
const slotCount = document.getElementById('slot-count');
const nameInput = document.getElementById('deck-name');
const status = document.getElementById('status');
const delBtn = document.getElementById('delete-deck');

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
const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
keyLight.position.set(3, 5, 6);
scene.add(keyLight);
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

// ---------- slot storage ----------
const newId = () => 'd_' + Math.random().toString(36).slice(2, 10);
function loadSlots() {
	if (MP_ON) return Array.isArray(mpState?.decks) ? mpState.decks : [];
	// free-play: localStorage, migrating an old single-deck save into a slot
	let arr = [];
	try { const p = JSON.parse(localStorage.getItem(SLOTS_KEY)); if (Array.isArray(p)) arr = p; } catch (e) {}
	if (!arr.length) {
		const old = Col.loadDeck();
		if (old.length) arr = [{ id: newId(), name: 'My Deck', classId: localStorage.getItem('magepunk_class_v1') || '', cards: old }];
	}
	return arr;
}
function persistFree() { localStorage.setItem(SLOTS_KEY, JSON.stringify(slots)); }

// ---------- deck logic ----------
const inDeck = id => deck.filter(d => d === id).length;
const limitOf = id => cardsById[id]?.rarity === 'legendary' ? Col.MAX_LEGENDARY_COPIES : Col.MAX_COPIES;

function addCard(id) {
	if (deck.length >= SIZE) { flash('Deck is full (40).'); return; }
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
const myClass = () => curClass;

// switch to editing a saved slot
function editSlot(slot) {
	editingId = slot.id;
	curClass = slot.classId || '';
	deck = [...slot.cards].filter(id => cardsById[id]);
	nameInput.value = slot.name || '';
	document.getElementById('class-select').value = curClass;
	render();
}
// start a fresh deck (class-first)
function newDeck() {
	editingId = null;
	curClass = '';
	deck = [];
	nameInput.value = '';
	document.getElementById('class-select').value = '';
	render();
}

function renderSlots() {
	slotList.innerHTML = '';
	slotCount.textContent = `${slots.length} / ${MAX_SLOTS}`;
	for (const s of slots) {
		const valid = Array.isArray(s.cards) && s.cards.length === SIZE;
		const div = document.createElement('div');
		div.className = 'slot-row' + (s.id === editingId ? ' active' : '');
		div.innerHTML = `<span class="s-name">${s.name || s.classId || 'Deck'}</span>`
			+ `<span class="s-meta">${(s.classId || '?').replace(/_/g, ' ')} · ${(s.cards || []).length}/${SIZE}${valid ? '' : ' ⚠'}</span>`;
		div.onclick = () => editSlot(s);
		slotList.appendChild(div);
	}
	delBtn.style.display = editingId ? '' : 'none';
}

function render() {
	renderSlots();
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

// ---------- save / delete ----------
document.getElementById('save').onclick = async () => {
	if (!myClass()) { flash('Choose a class first.'); return; }
	if (deck.length !== SIZE) { flash(`Decks must be exactly ${SIZE} cards (has ${deck.length}).`); return; }
	const name = (nameInput.value || '').trim() || `${myClass()} deck`;
	if (MP_ON) {
		const data = await MPX.call('save-deck', { id: editingId || undefined, name, classId: myClass(), deck });
		if (data.error) { flash(data.error); return; }
		mpState = data.state;
		slots = loadSlots();
		// re-select the saved slot (new one is the last matching name/class)
		const match = slots.find(s => s.id === editingId) || slots[slots.length - 1];
		if (match) editingId = match.id;
		render();
		flash('Deck saved — take it into card battles.');
		return;
	}
	const err = Col.validateDeck(deck, cardsById, collection, myClass());
	if (err) { flash(err); return; }
	if (editingId) {
		const s = slots.find(x => x.id === editingId);
		if (s) { s.name = name; s.classId = myClass(); s.cards = [...deck]; }
	} else {
		if (slots.length >= MAX_SLOTS) { flash(`All ${MAX_SLOTS} deck slots are full — delete one first.`); return; }
		const s = { id: newId(), name, classId: myClass(), cards: [...deck] };
		slots.push(s); editingId = s.id;
	}
	persistFree();
	Col.saveDeck(deck); // keep the single-deck save in sync for legacy match code
	localStorage.setItem('magepunk_class_v1', myClass());
	render();
	flash('Deck saved!');
};

delBtn.onclick = async () => {
	if (!editingId) return;
	if (MP_ON) {
		const data = await MPX.call('delete-deck', { id: editingId });
		if (data.error) { flash(data.error); return; }
		mpState = data.state;
		slots = loadSlots();
	} else {
		slots = slots.filter(s => s.id !== editingId);
		persistFree();
	}
	newDeck();
	flash('Deck deleted.');
};

document.getElementById('new-deck').onclick = () => newDeck();

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

// ---------- class picker: the FIRST choice ----------
fetch('classes.json').then(r => r.json()).then(({ classes }) => {
	const sel = document.getElementById('class-select');
	sel.innerHTML = '<option value="">— choose class —</option>';
	for (const c of classes) {
		const opt = document.createElement('option');
		opt.value = c.id;
		opt.textContent = c.name;
		sel.appendChild(opt);
	}
	sel.value = curClass;
	sel.addEventListener('change', ev => {
		curClass = ev.target.value;
		// keep the working deck but prune cards that no longer fit the class
		deck = curClass ? deck.filter(id => Col.fitsClass(cardsById[id], curClass)) : [];
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
	} else {
		collection = Col.getCollection(cards);
	}
	slots = loadSlots();
	newDeck(); // class-first: start on a fresh deck; pick a slot to edit one
	sizePreview();
	addEventListener('resize', sizePreview);
	render();
	if (cards.length) showPreview(cards[0]);
	window.__deck = { get deck() { return deck; }, get slots() { return slots; }, addCard, removeCard, editSlot, newDeck, Col };
});
