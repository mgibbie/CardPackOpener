// game.js — Magepunk Battlecards: Three.js table renderer + interaction.
// Rules live in engine.js; the AI in ai.js. This file only draws and routes input.
import * as THREE from 'three';
import * as E from './engine.js';
import * as AI from './ai.js';
import * as Col from './collection.js';
import { CARD_W, CARD_H, CARD_D, makeFaceTexture, makeBackTexture, hasRules, RULES_GEM, classNameOf, drawCardFace } from './cardart.js';

const HUMAN = 0;
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

// player count comes from ?players=N (2-8); the in-game selector rewrites it
let playerCount = Math.max(2, Math.min(E.MAX_PLAYERS,
	parseInt(new URLSearchParams(location.search).get('players'), 10) || 2));

const nameOf = pi => pi === HUMAN ? 'You' : `AI ${pi}`;
// each player's board is a pizza slice: rotate their zone layout around the
// table center; the human slice always faces the camera (angle 0 = bottom)
const angleOf = pi => (pi / playerCount) * TAU;
// radial push so 3+ slices don't overlap at the center
const sliceOff = () => playerCount <= 2 ? 0 : (playerCount - 2) * 0.9;
const toWorld = (x, y, z, pi) => new THREE.Vector3(x, y, z).applyAxisAngle(UP, angleOf(pi));
const sliceQuat = (localEuler, pi) => new THREE.Quaternion()
	.setFromAxisAngle(UP, angleOf(pi))
	.multiply(new THREE.Quaternion().setFromEuler(localEuler));

// ---------- scene ----------
const container = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0d0a14');
scene.fog = new THREE.Fog('#0d0a14', 18, 34);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 160);
function frameCamera() {
	const off = sliceOff();
	camera.position.set(0, 13.2 + off * 1.6, 12.2 + off * 1.25);
	camera.lookAt(0, 0, -0.8);
	// keep the far slices out of the fog on big tables
	scene.fog.near = 18 + off * 2.2;
	scene.fog.far = 34 + off * 3.6;
}
frameCamera();

scene.add(new THREE.AmbientLight(0xffffff, 0.75));
const key = new THREE.DirectionalLight(0xfff2e0, 1.5);
key.position.set(4, 10, 5);
scene.add(key);
const rim = new THREE.PointLight(0x8f6fff, 30, 40);
rim.position.set(-7, 4, -3);
scene.add(rim);

// round table cut into player slices; rebuilt whenever the player count changes
let tableMesh = null;
function buildTable() {
	if (tableMesh) {
		scene.remove(tableMesh);
		tableMesh.material.map?.dispose();
		tableMesh.geometry.dispose();
	}
	const S = 1024;
	const tableCanvas = document.createElement('canvas');
	tableCanvas.width = tableCanvas.height = S;
	const tc = tableCanvas.getContext('2d');
	const g = tc.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.5);
	g.addColorStop(0, '#2a2038');
	g.addColorStop(1, '#171021');
	tc.fillStyle = g;
	tc.beginPath(); tc.arc(S / 2, S / 2, S / 2 - 4, 0, TAU); tc.fill();
	tc.strokeStyle = 'rgba(143,111,255,0.3)';
	tc.lineWidth = 5;
	tc.beginPath(); tc.arc(S / 2, S / 2, S / 2 - 10, 0, TAU); tc.stroke();
	// slice dividers, halfway between adjacent players
	tc.strokeStyle = 'rgba(143,111,255,0.18)';
	tc.lineWidth = 4;
	for (let i = 0; i < playerCount; i++) {
		// canvas +y is world +z; player 0 sits at the bottom (world +z)
		const a = angleOf(i) + TAU / (playerCount * 2) + Math.PI / 2;
		tc.beginPath();
		tc.moveTo(S / 2, S / 2);
		tc.lineTo(S / 2 + Math.cos(a) * (S / 2 - 10), S / 2 + Math.sin(a) * (S / 2 - 10));
		tc.stroke();
	}
	const tex = new THREE.CanvasTexture(tableCanvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	const radius = 9.5 + sliceOff() * 1.35;
	tableMesh = new THREE.Mesh(
		new THREE.CircleGeometry(radius, 64),
		new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })
	);
	tableMesh.rotation.x = -Math.PI / 2;
	tableMesh.position.y = -0.06;
	scene.add(tableMesh);
}

const backTex = makeBackTexture();
const edgeMat = new THREE.MeshStandardMaterial({ color: '#241b38', roughness: 0.8 });
const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.5 });
const cardGeo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_D);

// iridescent rules-gem overlay: one shared additive material whose color
// slowly cycles the full hue wheel; each rules-card carries a small glow disc
const gemGlowTex = (() => {
	const c = document.createElement('canvas');
	c.width = c.height = 128;
	const g = c.getContext('2d');
	const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
	grad.addColorStop(0, 'rgba(255,255,255,0.7)');
	grad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
	grad.addColorStop(1, 'rgba(255,255,255,0)');
	g.fillStyle = grad;
	g.fillRect(0, 0, 128, 128);
	return new THREE.CanvasTexture(c);
})();
const gemMat = new THREE.MeshBasicMaterial({
	map: gemGlowTex, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending,
});
const gemGeo = new THREE.CircleGeometry(RULES_GEM.r * CARD_W * 0.9, 24);

// selection rings
const ringGeo = new THREE.RingGeometry(1.08, 1.26, 32);
function makeRing(color) {
	const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
	m.rotation.x = -Math.PI / 2;
	m.visible = false;
	scene.add(m);
	return m;
}

// ---------- entities ----------
// uid -> { card, mesh, faceMat, ring, target {pos,rot,scale}, lungeUntil, dying }
const entities = new Map();

function faceMaterialFor(card) {
	// disguised creatures render anonymously: neutral art seed, no identity
	const shown = card.disguised
		? { ...card, id: 'disguised', name: 'Disguised', description: '', cardClass: 'neutral' }
		: card;
	const tex = makeFaceTexture(
		{ ...shown, health: card.maxHealth },
		card.type === 'creature' ? { attack: card.attack, hp: E.hp(card), maxHealth: card.maxHealth }
			: card.type === 'weapon' ? { attack: card.attack, durability: card.durability }
			: card.type === 'quest' ? { progress: card.progress || 0, goal: card.quest?.goal?.count }
			: card.type === 'planeswalker' ? { loyalty: card.loyalty } : {}
	);
	return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.12 });
}

function entityFor(card) {
	let ent = entities.get(card.uid);
	if (!ent) {
		const faceMat = faceMaterialFor(card);
		const mesh = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, edgeMat, edgeMat, faceMat, backMat]);
		mesh.userData.uid = card.uid;
		mesh.position.set(card.controller === HUMAN ? 9 : -9, 0.3, card.controller === HUMAN ? 6.5 : -6.5);
		if (hasRules(card)) {
			const gem = new THREE.Mesh(gemGeo, gemMat);
			gem.position.set((RULES_GEM.x - 0.5) * CARD_W, (0.5 - RULES_GEM.y) * CARD_H, CARD_D / 2 + 0.004);
			gem.raycast = () => {}; // the glow never blocks card picking
			mesh.add(gem);
		}
		scene.add(mesh);
		ent = { card, mesh, faceMat, target: { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1 }, ring: makeRing('#57e389') };
		entities.set(card.uid, ent);
	}
	ent.card = card;
	return ent;
}

function refreshFace(ent) {
	ent.faceMat.map?.dispose();
	const nm = faceMaterialFor(ent.card);
	ent.faceMat.map = nm.map;
	ent.faceMat.needsUpdate = true;
}

function removeEntity(uid) {
	const ent = entities.get(uid);
	if (!ent) return;
	scene.remove(ent.mesh);
	scene.remove(ent.ring);
	ent.faceMat.map?.dispose();
	entities.delete(uid);
}

// ---------- layout ----------
const FLAT = new THREE.Euler(-Math.PI / 2, 0, 0);     // face up on the table
const FACEDOWN = new THREE.Euler(Math.PI / 2, 0, 0);  // back up (set traps)
const LAND_Z = 4.0, LAND_SPREAD = 1.15;               // slice-local land row
const TRAP_Z = 4.9, TRAP_X = 2.55, TRAP_SPREAD = 1.2; // slice-local trap row

// The land row is the only zone with furniture when empty: 5 slot outlines
// per player. Every other zone simply shows nothing until a card is in it.
let slotMarkers = [];
const slotTex = (() => {
	const c = document.createElement('canvas');
	c.width = 128; c.height = 172;
	const ctx = c.getContext('2d');
	ctx.strokeStyle = 'rgba(120,180,110,0.5)';
	ctx.lineWidth = 5;
	ctx.setLineDash([14, 10]);
	ctx.strokeRect(8, 8, 112, 156);
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
})();
const slotMat = new THREE.MeshBasicMaterial({ map: slotTex, transparent: true, depthWrite: false });
const slotGeo = new THREE.PlaneGeometry(1.12, 1.5);

function buildSlotMarkers() {
	for (const m of slotMarkers) scene.remove(m.mesh);
	slotMarkers = [];
	if (!state) return;
	const off = sliceOff();
	for (let pi = 0; pi < state.players.length; pi++) {
		for (let i = 0; i < E.MAX_LANDS; i++) {
			const mesh = new THREE.Mesh(slotGeo, slotMat);
			mesh.userData.landSlotPi = pi;
			mesh.position.copy(toWorld((i - 2) * LAND_SPREAD, 0.01, off + LAND_Z, pi));
			mesh.quaternion.copy(sliceQuat(FLAT, pi));
			scene.add(mesh);
			slotMarkers.push({ mesh, pi });
		}
	}
}

// clicking one of your empty land slots opens the land shop (3 mana a land)
function pickLandSlot(ev) {
	pointer.x = (ev.clientX / innerWidth) * 2 - 1;
	pointer.y = -(ev.clientY / innerHeight) * 2 + 1;
	raycaster.setFromCamera(pointer, camera);
	const hits = raycaster.intersectObjects(slotMarkers.map(m => m.mesh));
	return hits.length ? hits[0].object.userData.landSlotPi : null;
}

function openLandShop(ev) {
	const menu = $('walker-menu');
	menu.innerHTML = `<div class="wm-title">Develop a land — ${E.LAND_COST} mana (each opponent gets a coin)</div>`;
	for (const def of E.landPool(state)) {
		const btn = document.createElement('button');
		const firstTap = (def.taps?.[0]?.text) || (def.mana ? `Gain ${def.mana} mana.` : '');
		btn.innerHTML = `<span class="wm-cost">${E.LAND_COST}</span><b>${def.name}</b> — ${firstTap}`;
		btn.title = def.description || '';
		btn.disabled = !E.canBuyLand(state, HUMAN);
		btn.addEventListener('pointerdown', e => {
			e.stopPropagation();
			hideWalkerMenu();
			E.buyLand(state, HUMAN, def.id);
			pump();
		});
		menu.appendChild(btn);
	}
	menu.style.display = 'block';
	menu.style.left = `${Math.min(ev.clientX, innerWidth - 300)}px`;
	menu.style.top = `${Math.min(ev.clientY, innerHeight - 260)}px`;
}

// Choose One cards pick their branch before targeting
function openChoiceMenu(card, ev) {
	const menu = $('walker-menu');
	menu.innerHTML = `<div class="wm-title">${card.name} — choose one:</div>`;
	card.choices.forEach((ch, i) => {
		const btn = document.createElement('button');
		btn.textContent = ch.text;
		btn.addEventListener('pointerdown', e => {
			e.stopPropagation();
			hideWalkerMenu();
			const spec = E.targetSpec(state, HUMAN, card, i);
			if (spec) {
				const targets = E.legalTargets(state, HUMAN, spec);
				if (targets.length) { pending = { card, spec, targets, mode: 'play', choice: i }; updateHud(); return; }
				if (spec.required) return;
			}
			E.playCard(state, HUMAN, card.uid, null, i);
			pump();
		});
		menu.appendChild(btn);
	});
	menu.style.display = 'block';
	menu.style.left = `${Math.min(ev.clientX, innerWidth - 300)}px`;
	menu.style.top = `${Math.min(ev.clientY, innerHeight - 200)}px`;
}

// choose-one hero powers pick a branch before targeting
function openPowerChoiceMenu(card, ev) {
	const menu = $('walker-menu');
	menu.innerHTML = `<div class="wm-title">${card.name} — choose one:</div>`;
	card.power.choices.forEach((ch, i) => {
		const btn = document.createElement('button');
		btn.textContent = ch.text;
		btn.disabled = !E.canUseHeroPower(state, HUMAN, card, i);
		btn.addEventListener('pointerdown', e => {
			e.stopPropagation();
			hideWalkerMenu();
			const spec = E.heroPowerSpec(state, HUMAN, card, i);
			if (spec) {
				const targets = E.legalTargets(state, HUMAN, spec);
				if (targets.length) { pending = { card, spec, targets, mode: 'power', choice: i }; updateHud(); return; }
				if (spec.required) return;
			}
			E.useHeroPower(state, HUMAN, card.uid, null, i);
			pump();
		});
		menu.appendChild(btn);
	});
	menu.style.display = 'block';
	menu.style.left = `${Math.min(ev.clientX, innerWidth - 300)}px`;
	menu.style.top = `${Math.min(ev.clientY, innerHeight - 200)}px`;
}

// a disguised creature can attack as the 2/2 or unmask for its cost
function openUnmaskMenu(card, ev) {
	const menu = $('walker-menu');
	menu.innerHTML = `<div class="wm-title">Disguised: ${card.disguised.name}</div>`;
	const un = document.createElement('button');
	un.innerHTML = `<span class="wm-cost">${card.cost}</span>Unmask (${card.disguised.attack}/${card.disguised.maxHealth})`;
	un.addEventListener('pointerdown', e => {
		e.stopPropagation();
		hideWalkerMenu();
		E.unmask(state, HUMAN, card.uid);
		pump();
	});
	menu.appendChild(un);
	if (E.canAttackWith(state, HUMAN, card)) {
		const atk = document.createElement('button');
		atk.textContent = 'Attack as the 2/2';
		atk.addEventListener('pointerdown', e => {
			e.stopPropagation();
			hideWalkerMenu();
			selectedAttacker = card.uid;
			updateHud();
		});
		menu.appendChild(atk);
	}
	menu.style.display = 'block';
	menu.style.left = `${Math.min(ev.clientX, innerWidth - 300)}px`;
	menu.style.top = `${Math.min(ev.clientY, innerHeight - 160)}px`;
}

// scry / gaze: the modal shows the peeked cards; each goes top or bottom
function openScryModal() {
	const pend = state.scryQueue[0];
	if (!pend || pend.chooser !== HUMAN) return;
	const modal = $('scry-modal');
	const who = pend.deckOwner === HUMAN ? 'your deck' : `${nameOf(pend.deckOwner)}'s deck`;
	modal.innerHTML = `<div class="wm-title">${pend.deckOwner === HUMAN ? 'Scry' : 'Gaze'} — top of ${who} (first card is drawn first)</div><div class="scry-row"></div>`;
	const row = modal.querySelector('.scry-row');
	const picks = pend.ids.map(id => ({ id, bottom: false }));
	pend.ids.forEach((id, i) => {
		const def = state.cardsById[id];
		const cell = document.createElement('div');
		cell.className = 'scry-cell';
		const face = drawCardFace(def);
		face.style.width = '130px';
		cell.appendChild(face);
		const btn = document.createElement('button');
		btn.textContent = 'Top';
		btn.addEventListener('pointerdown', e => {
			e.stopPropagation();
			picks[i].bottom = !picks[i].bottom;
			btn.textContent = picks[i].bottom ? 'Bottom' : 'Top';
			btn.classList.toggle('bottom', picks[i].bottom);
		});
		cell.appendChild(btn);
		row.appendChild(cell);
	});
	const done = document.createElement('button');
	done.className = 'scry-done';
	done.textContent = 'Done';
	done.addEventListener('pointerdown', e => {
		e.stopPropagation();
		modal.style.display = 'none';
		E.resolveScry(state, picks);
		pump();
	});
	modal.appendChild(done);
	modal.style.display = 'block';
}

// clicking one of your untapped lands opens its tap abilities
function openTapMenu(card, ev) {
	const menu = $('walker-menu');
	menu.innerHTML = `<div class="wm-title">${card.name} — tap for:</div>`;
	E.landTaps(card).forEach((t, i) => {
		const btn = document.createElement('button');
		btn.innerHTML = `<span class="wm-cost">⟳</span>${t.text}`;
		btn.disabled = !E.canTapLand(state, HUMAN, card, i);
		btn.addEventListener('pointerdown', e => {
			e.stopPropagation();
			hideWalkerMenu();
			const spec = E.tapSpec(state, HUMAN, card, i);
			if (spec) {
				const targets = E.legalTargets(state, HUMAN, spec);
				if (targets.length) { pending = { card, spec, targets, mode: 'tap', tapIndex: i }; updateHud(); return; }
				if (spec.required) return;
			}
			E.tapLand(state, HUMAN, card.uid, i, null);
			pump();
		});
		menu.appendChild(btn);
	});
	menu.style.display = 'block';
	menu.style.left = `${Math.min(ev.clientX, innerWidth - 300)}px`;
	menu.style.top = `${Math.min(ev.clientY, innerHeight - 200)}px`;
}

function layoutTargets() {
	if (!state) return;
	const off = sliceOff();
	const seen = new Set();
	for (let pi = 0; pi < state.players.length; pi++) {
		const p = state.players[pi];
		// hand
		const n = p.hand.length;
		p.hand.forEach((card, i) => {
			const ent = entityFor(card);
			seen.add(card.uid);
			if (pi === HUMAN) {
				const spread = Math.min(1.55, 10.5 / Math.max(n, 1));
				const x = (i - (n - 1) / 2) * spread;
				const hovered = hoverUid === card.uid || (pending?.card.uid === card.uid);
				ent.target.pos.set(x, 1.7 + (hovered ? 0.9 : 0) + i * 0.012, off + 6.9 - Math.abs(x) * 0.04 - (hovered ? 0.55 : 0));
				ent.target.quat = sliceQuat(new THREE.Euler(-0.5, 0, -(i - (n - 1) / 2) * 0.03), HUMAN);
				ent.target.scale = hovered ? 1.0 : 0.68;
			} else {
				const spread = Math.min(1.0, 6.5 / Math.max(n, 1));
				const x = (i - (n - 1) / 2) * spread;
				ent.target.pos = toWorld(x, 1.1 + i * 0.012, off + 7.1, pi);
				ent.target.quat = sliceQuat(new THREE.Euler(0.95 + Math.PI, 0, 0), pi); // back to the table
				ent.target.scale = 0.58;
			}
		});
		// lands fill their slots; traps sit face-down (you see your own face-up)
		p.lands.forEach((card, i) => {
			const ent = entityFor(card);
			seen.add(card.uid);
			ent.target.pos = toWorld((i - 2) * LAND_SPREAD, 0.05, off + LAND_Z, pi);
			// tapped lands turn sideways, MTG-style
			ent.target.quat = sliceQuat(card.tapped ? new THREE.Euler(-Math.PI / 2, 0, -Math.PI / 2) : FLAT, pi);
			ent.target.scale = 0.42;
		});
		p.traps.forEach((card, i) => {
			const ent = entityFor(card);
			seen.add(card.uid);
			ent.target.pos = toWorld(TRAP_X + (i - 1) * TRAP_SPREAD, 0.05, off + TRAP_Z, pi);
			ent.target.quat = sliceQuat(pi === HUMAN ? FLAT : FACEDOWN, pi);
			ent.target.scale = 0.42;
		});
		// hero powers mirror the trap row on the left; quests sit outside them
		p.heroPowers.forEach((card, i) => {
			const ent = entityFor(card);
			seen.add(card.uid);
			ent.target.pos = toWorld(-(TRAP_X + (i - 1) * TRAP_SPREAD), 0.05, off + TRAP_Z, pi);
			ent.target.quat = sliceQuat(FLAT, pi);
			ent.target.scale = 0.42;
		});
		p.quests.forEach((card, i) => {
			const ent = entityFor(card);
			seen.add(card.uid);
			ent.target.pos = toWorld(-(1.6 + i * 1.15), 0.05, off + 6.35, pi);
			ent.target.quat = sliceQuat(FLAT, pi);
			ent.target.scale = 0.42;
		});
		// planeswalkers: center row between the land slots and the hero
		const wn = p.planeswalkers.length;
		p.planeswalkers.forEach((card, i) => {
			const ent = entityFor(card);
			seen.add(card.uid);
			const x = (i - (wn - 1) / 2) * 1.45;
			ent.target.pos = toWorld(x, 0.07, off + 5.55, pi);
			ent.target.quat = sliceQuat(FLAT, pi);
			ent.target.scale = 0.5;
		});
		// right-outer corner: companion, command zone, then emblem markers
		if (p.companion) {
			const ent = entityFor(p.companion);
			seen.add(p.companion.uid);
			ent.target.pos = toWorld(1.6, 0.05, off + 6.35, pi);
			ent.target.quat = sliceQuat(FLAT, pi);
			ent.target.scale = 0.42;
		}
		p.command.forEach((card, i) => {
			const ent = entityFor(card);
			seen.add(card.uid);
			ent.target.pos = toWorld(2.8 + i * 1.2, 0.05, off + 6.35, pi);
			ent.target.quat = sliceQuat(FLAT, pi);
			ent.target.scale = 0.42;
		});
		p.emblems.forEach((card, i) => {
			const ent = entityFor(card);
			seen.add(card.uid);
			ent.target.pos = toWorld(4.0 + i * 0.95, 0.05, off + 6.35, pi);
			ent.target.quat = sliceQuat(FLAT, pi);
			ent.target.scale = 0.34;
		});
		// unlimited permanent rows: enchantments left, artifacts right
		const rowSpread = n2 => Math.min(1.1, 4.4 / Math.max(n2, 1));
		p.enchantments.forEach((card, i) => {
			const ent = entityFor(card);
			seen.add(card.uid);
			ent.target.pos = toWorld(-(3.55 + i * rowSpread(p.enchantments.length)), 0.05, off + 2.7, pi);
			ent.target.quat = sliceQuat(FLAT, pi);
			ent.target.scale = 0.42;
		});
		p.artifacts.forEach((card, i) => {
			const ent = entityFor(card);
			seen.add(card.uid);
			ent.target.pos = toWorld(3.55 + i * rowSpread(p.artifacts.length), 0.05, off + 2.7, pi);
			ent.target.quat = sliceQuat(FLAT, pi);
			ent.target.scale = 0.42;
		});
		// creature row (unlimited: compress spacing inside the slice arc)
		const bn = p.board.length;
		const rowWidth = playerCount <= 2 ? 10.5 : TAU * (off + 2.0) / playerCount * 0.9;
		p.board.forEach((card, i) => {
			const ent = entityFor(card);
			seen.add(card.uid);
			const spread = Math.min(2.35, rowWidth / Math.max(bn, 1));
			const x = (i - (bn - 1) / 2) * spread;
			ent.target.pos = toWorld(x, 0.06 + i * 0.002, off + 2.0, pi);
			ent.target.quat = sliceQuat(FLAT, pi);
			ent.target.scale = 0.8;
		});
	}
	// anything not in hand/board and not mid-death: drop it
	for (const uid of [...entities.keys()]) {
		const ent = entities.get(uid);
		if (!seen.has(uid) && !ent.dying) removeEntity(uid);
	}
}

// ---------- floating combat text ----------
const floaters = [];
function floatText(text, color, worldPos) {
	const c = document.createElement('canvas');
	c.width = 256; c.height = 128;
	const ctx = c.getContext('2d');
	ctx.font = 'bold 72px Georgia';
	ctx.textAlign = 'center';
	ctx.lineWidth = 10;
	ctx.strokeStyle = '#000';
	ctx.strokeText(text, 128, 84);
	ctx.fillStyle = color;
	ctx.fillText(text, 128, 84);
	const tex = new THREE.CanvasTexture(c);
	const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
	sp.scale.set(2.4, 1.2, 1);
	sp.position.copy(worldPos).add(new THREE.Vector3(0, 1.2, 0));
	scene.add(sp);
	floaters.push({ sp, life: 1 });
}

function creaturePos(uid) {
	const ent = entities.get(uid);
	return ent ? ent.mesh.position.clone() : new THREE.Vector3(0, 1, 0);
}
function heroPos(pi) {
	return toWorld(0, 1.4, sliceOff() + 4.8, pi);
}

// ---------- HUD ----------
const $ = id => document.getElementById(id);
const logEl = $('log');
function log(msg) {
	const div = document.createElement('div');
	div.textContent = msg;
	logEl.appendChild(div);
	while (logEl.children.length > 7) logEl.removeChild(logEl.firstChild);
}

// one small projected panel per opponent, rebuilt on new game
const foePanelEls = new Map(); // pi -> element
function panelEl(pi) { return pi === HUMAN ? $('my-panel') : foePanelEls.get(pi); }

function buildPanels() {
	const cont = $('foe-panels');
	cont.innerHTML = '';
	foePanelEls.clear();
	if (!state) return;
	for (let pi = 1; pi < state.players.length; pi++) {
		const el = document.createElement('div');
		el.className = 'panel foe-sm';
		const cls = state?.classPicks?.[pi]?.name;
		el.innerHTML = `<div class="life"></div><div class="sub"><b>${nameOf(pi)}${cls ? ` (${cls})` : ''}</b> · Mana <span class="mana"></span><br>Hand <span class="hand"></span> · Deck <span class="deck"></span></div><div class="gear"></div>`;
		el.addEventListener('pointerdown', () => panelClick(pi));
		cont.appendChild(el);
		foePanelEls.set(pi, el);
	}
}

function updateHud() {
	if (!state) return;
	const me = state.players[HUMAN];
	$('my-life').textContent = me.life + (me.armor ? `+${me.armor}` : '');
	$('my-mana').textContent = `${E.availableMana(me)}/${me.mana.max}`;
	$('my-deck').textContent = me.deck.length;
	const myGear = [];
	if (me.weapon) myGear.push(`⚔ ${me.weapon.name} ${me.weapon.attack}/${me.weapon.durability}`);
	if (me.secrets.length) myGear.push('❓ ' + me.secrets.map(s => s.name).join(', '));
	if (me.exile.length) myGear.push(`⊘ ${me.exile.length} exiled`);
	if (me.fatigue) myGear.push(`☠ fatigue ${me.fatigue}`);
	// only Death Knights get a corpse indicator; others track corpses hidden
	if (me.corpses && me.heroClass === 'death_knight') myGear.push(`⚰ ${me.corpses} corpses`);
	if (me.heroTempAttack) myGear.push(`⚔ +${me.heroTempAttack} this turn`);
	$('my-gear').innerHTML = myGear.join('<br>');
	$('my-panel').classList.toggle('armed',
		state.current === HUMAN && !state.over && !pending && E.canHeroAttack(state, HUMAN));
	$('my-panel').classList.toggle('dead', me.eliminated);
	for (const [pi, el] of foePanelEls) {
		const p = state.players[pi];
		el.querySelector('.life').textContent = p.life + (p.armor ? `+${p.armor}` : '');
		el.querySelector('.mana').textContent = `${E.availableMana(p)}/${p.mana.max}`;
		el.querySelector('.hand').textContent = p.hand.length;
		el.querySelector('.deck').textContent = p.deck.length;
		const gear = [];
		if (p.weapon) gear.push(`⚔ ${p.weapon.attack}/${p.weapon.durability}`);
		if (p.secrets.length) gear.push(`❓ ${p.secrets.length}`);
		if (p.traps.length) gear.push(`⚠ ${p.traps.length}`);
		if (p.exile.length) gear.push(`⊘ ${p.exile.length}`);
		if (p.fatigue) gear.push(`☠ ${p.fatigue}`);
		if (p.corpses && p.heroClass === 'death_knight') gear.push(`⚰ ${p.corpses}`);
		el.querySelector('.gear').innerHTML = gear.join(' · ');
		el.classList.toggle('dead', p.eliminated);
		el.classList.toggle('turn', state.current === pi && !state.over);
	}
	$('coin-btn').style.display = (me.coins > 0 && state.current === HUMAN) ? '' : 'none';
	const myTurn = state.current === HUMAN && !state.over;
	$('end-turn').disabled = !myTurn;
	$('end-turn').textContent = myTurn ? 'End Turn' : `${nameOf(state.current)}'s Turn…`;
	$('hint').textContent = pending
		? `Choose ${pending.spec.why} for ${pending.card.name} (right-click to cancel)`
		: (selectedAttacker === 'HERO' ? 'Choose a target for your hero attack (right-click to cancel)'
			: selectedAttacker ? 'Choose an attack target (right-click to cancel)' : '');
}

// projected screen positions + hero-target highlighting, refreshed per frame
function positionPanels() {
	if (!state) return;
	for (const [pi, el] of foePanelEls) {
		const v = heroPos(pi).project(camera);
		el.style.left = `${(v.x + 1) / 2 * innerWidth}px`;
		el.style.top = `${(1 - v.y) / 2 * innerHeight}px`;
	}
	const heroTargets = new Set();
	if (pending) {
		for (const t of pending.targets) if (t.type === 'hero') heroTargets.add(t.player);
	} else if (selectedAttacker === 'HERO') {
		for (const t of E.heroAttackTargets(state, HUMAN)) if (t.type === 'hero') heroTargets.add(t.player);
	} else if (selectedAttacker) {
		const a = cardOf(selectedAttacker);
		if (a) for (const t of E.attackTargets(state, HUMAN, a)) if (t.type === 'hero') heroTargets.add(t.player);
	}
	$('my-panel').classList.toggle('targetable', heroTargets.has(HUMAN));
	for (const [pi, el] of foePanelEls) el.classList.toggle('targetable', heroTargets.has(pi));
	// eliminated slices lose their land-slot furniture too
	for (const m of slotMarkers) m.mesh.visible = !state.players[m.pi].eliminated;
}

function banner(text, ms = 1400) {
	const b = $('banner');
	b.textContent = text;
	b.style.opacity = 1;
	clearTimeout(banner._t);
	if (ms) banner._t = setTimeout(() => { b.style.opacity = 0; }, ms);
}

// ---------- event animation queue ----------
const queue = [];
let queueBusy = false;

// AI-owned scry/gaze decisions resolve immediately (Morbid can queue them
// off-turn); only human decisions wait for the modal
function resolveAIScries() {
	while (state.scryQueue.length && state.scryQueue[0].chooser !== HUMAN) {
		const pend = state.scryQueue[0];
		const picks = pend.ids.map(id => {
			const cost = state.cardsById[id]?.cost || 0;
			const own = pend.deckOwner === pend.chooser;
			return { id, bottom: own ? cost > state.players[pend.chooser].mana.max + 2 : cost >= 4 };
		});
		E.resolveScry(state, picks);
	}
}

function pump() {
	if (!state) return;
	resolveAIScries();
	resolveAIDiscards();
	resolveAIPicks();
	queue.push(...E.takeEvents(state));
	if (!queueBusy) nextEvent();
}

// AI loot discards: dump the most expensive card
function resolveAIDiscards() {
	while (state.discardQueue.length && state.discardQueue[0].player !== HUMAN) {
		const pend = state.discardQueue[0];
		const p = state.players[pend.player];
		const picks = [...p.hand].sort((a, b) => b.cost - a.cost).slice(0, pend.count).map(c => c.uid);
		E.resolveDiscard(state, picks);
	}
}

// AI Discover/Draft picks: take the biggest card
function resolveAIPicks() {
	while (state.pickQueue.length && state.pickQueue[0].player !== HUMAN) {
		const pend = state.pickQueue[0];
		const best = [...pend.ids].sort((a, b) => (state.cardsById[b]?.cost || 0) - (state.cardsById[a]?.cost || 0))[0];
		E.resolvePick(state, best);
	}
}

function openPickModal() {
	const pend = state.pickQueue[0];
	if (!pend || pend.player !== HUMAN) return;
	const modal = $('scry-modal'); // reuse the scry chrome
	modal.innerHTML = `<div class="wm-title">${pend.ids.length > 3 ? 'Draft' : 'Discover'} — take one</div><div class="scry-row"></div>`;
	const row = modal.querySelector('.scry-row');
	pend.ids.forEach(id => {
		const def = state.cardsById[id];
		const cell = document.createElement('div');
		cell.className = 'scry-cell';
		const face = drawCardFace(def);
		face.style.width = pend.ids.length > 3 ? '105px' : '130px';
		cell.appendChild(face);
		const btn = document.createElement('button');
		btn.textContent = 'Take';
		btn.addEventListener('pointerdown', e => {
			e.stopPropagation();
			modal.style.display = 'none';
			E.resolvePick(state, id);
			pump();
		});
		cell.appendChild(btn);
		row.appendChild(cell);
	});
	modal.style.display = 'block';
}

function openDiscardModal() {
	const pend = state.discardQueue[0];
	if (!pend || pend.player !== HUMAN) return;
	const me = state.players[HUMAN];
	const need = Math.min(pend.count, me.hand.length);
	const modal = $('scry-modal'); // reuse the scry chrome
	modal.innerHTML = `<div class="wm-title">Loot — choose ${need} card${need > 1 ? 's' : ''} to discard</div><div class="scry-row"></div>`;
	const row = modal.querySelector('.scry-row');
	const chosen = new Set();
	const done = document.createElement('button');
	const sync = () => {
		done.disabled = chosen.size !== need;
		done.textContent = `Discard (${chosen.size}/${need})`;
	};
	me.hand.forEach(card => {
		const cell = document.createElement('div');
		cell.className = 'scry-cell';
		const face = drawCardFace(card);
		face.style.width = '110px';
		cell.appendChild(face);
		const btn = document.createElement('button');
		btn.textContent = 'Keep';
		btn.addEventListener('pointerdown', e => {
			e.stopPropagation();
			if (chosen.has(card.uid)) chosen.delete(card.uid);
			else if (chosen.size < need) chosen.add(card.uid);
			btn.textContent = chosen.has(card.uid) ? 'Discard' : 'Keep';
			btn.classList.toggle('bottom', chosen.has(card.uid));
			sync();
		});
		cell.appendChild(btn);
		row.appendChild(cell);
	});
	done.className = 'scry-done';
	done.addEventListener('pointerdown', e => {
		e.stopPropagation();
		if (chosen.size !== need) return;
		modal.style.display = 'none';
		E.resolveDiscard(state, [...chosen]);
		pump();
	});
	modal.appendChild(done);
	sync();
	modal.style.display = 'block';
}

function nextEvent() {
	const ev = queue.shift();
	if (!ev) { queueBusy = false; updateHud(); maybeRunAI(); return; }
	queueBusy = true;
	let delay = 120;
	switch (ev.type) {
		case 'turnStart':
			banner(ev.player === HUMAN ? 'Your Turn' : `${nameOf(ev.player)}'s Turn`);
			log(`— Turn ${ev.turnNumber}: ${nameOf(ev.player)} —`);
			delay = 500;
			break;
		case 'draw':
			delay = ev.player === HUMAN ? 180 : 90;
			break;
		case 'play':
			log(`${nameOf(ev.player)} played ${ev.card.name}`);
			delay = 420;
			break;
		case 'summon':
			log(`${nameOf(ev.player)} summoned ${ev.card.name}`);
			delay = 260;
			break;
		case 'attack': {
			const ent = entities.get(ev.attackerUid);
			if (ent) {
				const to = ev.target.type === 'hero' ? heroPos(ev.target.player) : creaturePos(ev.target.uid);
				ent.lunge = { from: ent.mesh.position.clone(), to, start: performance.now() };
			}
			delay = 460;
			break;
		}
		case 'damage': {
			const pos = ev.targetType === 'hero' ? heroPos(ev.player) : creaturePos(ev.uid);
			floatText(`-${ev.amount}`, '#ff5f4f', pos);
			if (ev.targetType === 'creature') {
				const ent = entities.get(ev.uid);
				if (ent) refreshFace(ent);
			} else {
				const panel = panelEl(ev.player);
				if (panel) {
					panel.classList.add('hit');
					setTimeout(() => panel.classList.remove('hit'), 350);
				}
			}
			delay = 330;
			break;
		}
		case 'heal': {
			const pos = ev.targetType === 'hero' ? heroPos(ev.player) : creaturePos(ev.uid);
			floatText(`+${ev.amount}`, '#57e389', pos);
			if (ev.targetType === 'creature') { const ent = entities.get(ev.uid); if (ent) refreshFace(ent); }
			delay = 300;
			break;
		}
		case 'buff': {
			const ent = entities.get(ev.uid);
			if (ent) { refreshFace(ent); floatText('▲', '#57e389', ent.mesh.position); }
			delay = 240;
			break;
		}
		case 'shieldPop': {
			floatText('◈', '#ffd25f', creaturePos(ev.uid));
			delay = 260;
			break;
		}
		case 'marked': floatText('☠', '#ffd25f', creaturePos(ev.uid)); delay = 220; break;
		case 'freeze': floatText('❄', '#7fd8ff', creaturePos(ev.uid)); delay = 260; break;
		case 'thaw': floatText('❄', '#4a6a7a', creaturePos(ev.uid)); delay = 140; break;
		case 'silenced': {
			floatText('✕', '#9b93b3', creaturePos(ev.uid));
			const ent = entities.get(ev.uid);
			if (ent) refreshFace(ent);
			delay = 260;
			break;
		}
		case 'destroy':
		case 'death': {
			const ent = entities.get(ev.uid);
			if (ent) { ent.dying = performance.now(); }
			if (ev.name) log(`${ev.name} died`);
			delay = 330;
			break;
		}
		case 'heroAttack': {
			log(ev.player === HUMAN ? 'Your hero attacks' : `${nameOf(ev.player)}'s hero attacks`);
			const panel = panelEl(ev.player);
			if (panel) {
				panel.classList.add('hit');
				setTimeout(() => panel.classList.remove('hit'), 250);
			}
			delay = 420;
			break;
		}
		case 'weaponEquip':
			log(`${nameOf(ev.player)} equipped ${ev.card.name} (${ev.card.attack}/${ev.card.durability})`);
			delay = 320;
			break;
		case 'weaponDurability': delay = 60; break;
		case 'weaponBreak':
			log(`${ev.player === HUMAN ? 'Your' : `${nameOf(ev.player)}'s`} ${ev.name} ${ev.destroyed ? 'was destroyed' : 'broke'}`);
			floatText('⚔', '#9b93b3', heroPos(ev.player));
			delay = 300;
			break;
		case 'secretPlayed':
			log(ev.player === HUMAN ? `You set a Secret: ${ev.card.name}` : `${nameOf(ev.player)} set a Secret`);
			floatText('❓', '#c9b8ff', heroPos(ev.player));
			delay = 350;
			break;
		case 'trapSet':
			log(ev.player === HUMAN ? `You set a Trap: ${ev.card.name}` : `${nameOf(ev.player)} set a Trap`);
			delay = 350;
			break;
		case 'trapSprung':
			banner(`Trap: ${ev.card.name}!`, 1600);
			log(`${ev.player === HUMAN ? 'Your' : `${nameOf(ev.player)}'s`} Trap sprung: ${ev.card.name}`);
			delay = 900;
			break;
		case 'landPlayed':
			log(`${nameOf(ev.player)} developed ${ev.card.name}`);
			delay = 320;
			break;
		case 'landTapped':
			log(`${nameOf(ev.player)} tapped ${ev.card.name}: ${ev.text}`);
			delay = 300;
			break;
		case 'manaGained': delay = 120; break;
		case 'coinGiven': delay = 80; break;
		case 'conjure':
			log(ev.player === HUMAN ? `You conjured ${ev.card.name}` : `${nameOf(ev.player)} conjured a card`);
			delay = 350;
			break;
		case 'boosted': {
			const ent = entities.get(ev.uid);
			if (ent) { refreshFace(ent); floatText('✸', '#ffd25f', ent.mesh.position); }
			log(`${ev.color === 'adapt' ? 'Adapt' : `Boost (${ev.color})`} rolled ${ev.roll}: ${ev.label}`);
			delay = 380;
			break;
		}
		case 'defenderRedirect': {
			const ent = entities.get(ev.uid);
			if (ent) floatText('🛡', '#57e389', ent.mesh.position);
			log('A Defender intercepted the attack!');
			delay = 400;
			break;
		}
		case 'defenderMiss': delay = 150; break;
		case 'reborn': {
			const ent = entities.get(ev.uid);
			if (ent) { refreshFace(ent); floatText('☥', '#ffd25f', ent.mesh.position); }
			log(`${ev.name} was reborn at 1 health`);
			delay = 420;
			break;
		}
		case 'corpses': delay = 120; break;
		case 'heroBuffed':
			log(`${nameOf(ev.player)} hero +${ev.amount} Attack this turn`);
			floatText(`+${ev.amount}`, '#ffd25f', heroPos(ev.player));
			delay = 280;
			break;
		case 'mill':
			log(`${nameOf(ev.player)} milled ${ev.card.name}`);
			delay = 220;
			break;
		case 'plunder':
			log(`${nameOf(ev.player)} plundered ${ev.card.name} from ${nameOf(ev.victim)}'s deck`);
			delay = 320;
			break;
		case 'quickdrawReturn':
			log(`${nameOf(ev.player)} shuffled ${ev.count} Quickdrawn card${ev.count > 1 ? 's' : ''} back`);
			delay = 280;
			break;
		case 'disguised': {
			const ent = entities.get(ev.uid);
			if (ent) { refreshFace(ent); floatText('🎭', '#c9b8ff', ent.mesh.position); }
			log(`${nameOf(ev.player)} disguised a creature`);
			delay = 350;
			break;
		}
		case 'unmasked': {
			const ent = entities.get(ev.uid);
			if (ent) { refreshFace(ent); floatText('✨', '#ffd25f', ent.mesh.position); }
			log(`${nameOf(ev.player)} unmasked ${ev.name}!`);
			delay = 450;
			break;
		}
		case 'scryStart':
			log(`${nameOf(ev.chooser)} ${ev.chooser === ev.deckOwner ? 'scries' : `gazes at ${nameOf(ev.deckOwner)}'s deck`} (${ev.count})`);
			if (ev.chooser === HUMAN) openScryModal();
			delay = 400;
			break;
		case 'scryDone':
			if (ev.bottomed) log(`${nameOf(ev.chooser)} sent ${ev.bottomed} card${ev.bottomed > 1 ? 's' : ''} to the bottom`);
			delay = 250;
			break;
		case 'lootStart':
			log(`${nameOf(ev.player)} loots (${ev.count})`);
			if (ev.player === HUMAN) openDiscardModal();
			delay = 300;
			break;
		case 'pickStart':
			log(`${nameOf(ev.player)} ${ev.count > 3 ? 'drafts' : 'discovers'} (${ev.count} options)`);
			if (ev.player === HUMAN) openPickModal();
			delay = 300;
			break;
		case 'tokenGained':
			log(`${nameOf(ev.player)} gained a ${ev.card.name}`);
			delay = 250;
			break;
		case 'tokenSacrificed':
			log(`${nameOf(ev.player)} sacrificed a ${ev.card.name}`);
			delay = 300;
			break;
		case 'heroPowerInstalled': delay = 260; break; // ditto
		case 'questStarted': delay = 260; break;      // ditto
		case 'heroPowerUsed':
			log(`${nameOf(ev.player)} used ${ev.card.name}`);
			floatText('✦', '#ffd25f', creaturePos(ev.card.uid));
			delay = 420;
			break;
		case 'questProgress': {
			const ent = entities.get(ev.card.uid);
			if (ent) { ent.card.progress = ev.progress; refreshFace(ent); }
			delay = 140;
			break;
		}
		case 'questComplete':
			banner(`Quest complete: ${ev.card.name}!`, 1700);
			log(`${ev.player === HUMAN ? 'Your' : `${nameOf(ev.player)}'s`} quest complete: ${ev.card.name}`);
			delay = 950;
			break;
		case 'ongoingTriggered':
			floatText('✦', '#c9b8ff', creaturePos(ev.card.uid));
			delay = 240;
			break;
		case 'walkerArrived': delay = 300; break; // the generic play event already logs it
		case 'walkerAbility': {
			log(`${nameOf(ev.player)}'s ${ev.card.name}: ${ev.text}`);
			const ent = entities.get(ev.card.uid);
			if (ent) { ent.card.loyalty = ev.loyalty; refreshFace(ent); floatText('✧', '#c9b8ff', ent.mesh.position); }
			delay = 480;
			break;
		}
		case 'walkerDamage': {
			floatText(`-${ev.amount}`, '#ff5f4f', creaturePos(ev.uid));
			const ent = entities.get(ev.uid);
			if (ent) { ent.card.loyalty = ev.loyalty; refreshFace(ent); }
			delay = 330;
			break;
		}
		case 'walkerDestroyed': {
			const ent = entities.get(ev.uid);
			if (ent) ent.dying = performance.now();
			log(`${ev.name} was destroyed`);
			delay = 400;
			break;
		}
		case 'fatigue':
			floatText(`-${ev.amount}`, '#b46cff', heroPos(ev.player));
			log(`${nameOf(ev.player)} ${ev.player === HUMAN ? 'are' : 'is'} out of cards: ${ev.amount} fatigue`);
			delay = 300;
			break;
		case 'commanderReturned':
			log(`${ev.card.name} retreats to the command zone (now costs ${ev.card.cost})`);
			delay = 420;
			break;
		case 'emblemGained':
			banner(`Emblem: ${ev.card.name}!`, 1600);
			log(`${nameOf(ev.player)} gained an emblem: ${ev.card.name}`);
			delay = 800;
			break;
		case 'exiled': {
			const ent = entities.get(ev.uid);
			if (ent) { ent.dying = performance.now(); floatText('⊘', '#b46cff', ent.mesh.position); }
			log(`${ev.name} was exiled`);
			delay = 420;
			break;
		}
		case 'bounce': {
			const ent = entities.get(ev.uid);
			if (ent) { ent.dying = performance.now(); floatText('↩', '#6cc4ff', ent.mesh.position); }
			log(`${ev.name} was returned to ${nameOf(ev.player)}'s hand`);
			delay = 380;
			break;
		}
		case 'mindControl': {
			log(`${nameOf(ev.player)} took control of ${ev.name}`);
			delay = 500;
			break;
		}
		case 'transformed': {
			const ent = entities.get(ev.uid);
			if (ent) { ent.dying = performance.now(); floatText('✦', '#d78cff', ent.mesh.position); }
			log(`${ev.from} was transformed into ${ev.card.name}`);
			delay = 450;
			break;
		}
		case 'freeSpells':
			log(`${nameOf(ev.player)} made enemy spells free next turn`);
			delay = 300;
			break;
		case 'honorableKill':
			log(`${nameOf(ev.player)} scored an Honorable Kill!`);
			delay = 350;
			break;
		case 'secretRevealed':
			banner(`Secret: ${ev.card.name}!`, 1600);
			log(`${ev.player === HUMAN ? 'Your' : `${nameOf(ev.player)}'s`} Secret revealed: ${ev.card.name}`);
			delay = 900;
			break;
		case 'countered': log(`${ev.name} was countered!`); delay = 400; break;
		case 'overload': log(`${nameOf(ev.player)} overloaded: ${ev.amount} mana locked next turn`); delay = 250; break;
		case 'overloaded': log(`${nameOf(ev.player)} ${ev.player === HUMAN ? 'have' : 'has'} ${ev.amount} mana locked (overload)`); delay = 300; break;
		case 'armor': floatText(`+${ev.amount}`, '#c9c2da', heroPos(ev.player)); delay = 260; break;
		case 'bounce': log(`${ev.name} was returned to hand`); delay = 300; break;
		case 'coin': log(`${nameOf(ev.player)} spent a coin (+1 mana)`); delay = 250; break;
		case 'reshuffle': log(`${ev.player === HUMAN ? 'Your' : `${nameOf(ev.player)}'s`} graveyard was shuffled back in`); break;
		case 'discard': log(`${nameOf(ev.player)} discarded ${ev.card.name}`); break;
		case 'eliminated':
			banner(`${nameOf(ev.player)} ${ev.player === HUMAN ? 'are' : 'is'} eliminated!`, 1800);
			log(`${nameOf(ev.player)} eliminated`);
			delay = 900;
			break;
		case 'gameOver': {
			const won = ev.winner === HUMAN;
			banner(ev.winner == null ? 'Draw!' : won ? 'VICTORY!' : `DEFEAT — ${nameOf(ev.winner)} wins`, 0);
			const reward = ev.winner == null ? 50 : won ? 100 : 25;
			Col.earnGold(reward);
			log(`+${reward} gold (${Col.getGold()} total)`);
			$('restart').style.display = '';
			delay = 200;
			break;
		}
	}
	updateHud();
	setTimeout(nextEvent, delay);
}

// ---------- AI driver (every non-human seat) ----------
let aiTimer = null;
function maybeRunAI() {
	if (!state || state.over || state.current === HUMAN || queue.length || queueBusy) return;
	if (state.scryQueue.length && state.scryQueue[0].chooser === HUMAN) return; // your call first
	if (state.discardQueue.length && state.discardQueue[0].player === HUMAN) return; // loot pick first
	if (state.pickQueue.length && state.pickQueue[0].player === HUMAN) return; // discover pick first
	clearTimeout(aiTimer);
	aiTimer = setTimeout(() => {
		if (!state || state.over || state.current === HUMAN) return;
		const acted = AI.step(state, state.current);
		if (!acted) E.endTurn(state);
		pump();
	}, 650);
}

// ---------- interaction ----------
let state = null;
let hoverUid = null;
let pending = null;          // { card, spec, targets } — spell/battlecry targeting
let selectedAttacker = null; // uid

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function pick(ev) {
	pointer.x = (ev.clientX / innerWidth) * 2 - 1;
	pointer.y = -(ev.clientY / innerHeight) * 2 + 1;
	raycaster.setFromCamera(pointer, camera);
	const hits = raycaster.intersectObjects([...entities.values()].map(e => e.mesh));
	return hits.length ? hits[0].object.userData.uid : null;
}

function cardOf(uid) {
	if (!state || uid == null) return null;
	for (const p of state.players) {
		const zones = [p.hand, p.board, p.heroPowers, p.planeswalkers, p.traps, p.lands, p.quests,
			p.enchantments, p.artifacts, p.command, p.emblems, p.companion ? [p.companion] : []];
		for (const zone of zones) {
			const c = zone.find(c => c.uid === uid);
			if (c) return c;
		}
	}
	return null;
}

// hover tooltip: rules text lives here now, not on the card face
function updateTooltip(ev) {
	const tip = $('tooltip');
	const card = cardOf(hoverUid);
	// never reveal hidden information: enemy hands and face-down traps stay secret
	const hidden = card && card.controller !== HUMAN && (card.zone === 'hand' || card.zone === 'trap');
	if (!card || hidden) { tip.style.display = 'none'; return; }
	// disguised creatures reveal nothing to opponents, everything to their owner
	if (card.disguised) {
		const mine = card.controller === HUMAN;
		tip.innerHTML = `<div class="tt-name">Disguised Creature</div><div class="tt-type">FACE-DOWN · 2/2</div>`
			+ (mine ? `<div class="tt-desc">Actually: <b>${card.disguised.name}</b> (${card.disguised.attack}/${card.disguised.maxHealth})</div>`
				+ `<div class="tt-sub">Click to unmask for ${card.cost} mana</div>`
				: `<div class="tt-desc">Nobody knows what lurks beneath.</div>`);
		tip.style.display = 'block';
		tip.style.left = `${Math.min(ev.clientX + 18, innerWidth - 290)}px`;
		tip.style.top = `${Math.min(ev.clientY + 14, innerHeight - tip.offsetHeight - 12)}px`;
		return;
	}
	const typeLine = classNameOf(card.cardClass).toUpperCase() + ' · ' + (card.tribe ? card.tribe + ' ' : '') + card.type.toUpperCase()
		+ ' · ' + (card.rarity || 'common').toUpperCase();
	let extra = '';
	if (card.type === 'planeswalker') extra = `<div class="tt-sub">Loyalty ${card.loyalty}</div>`;
	if (card.type === 'quest' && card.quest) extra = `<div class="tt-sub">Progress ${card.progress || 0} / ${card.quest.goal.count}</div>`;
	if (card.quickdrawn) extra += `<div class="tt-sub">Quickdrawn — returns to your deck at end of turn</div>`;
	tip.innerHTML = `<div class="tt-name">${card.name}</div><div class="tt-type">${typeLine}</div>`
		+ `<div class="tt-desc">${card.description || ''}</div>` + extra;
	tip.style.display = 'block';
	tip.style.left = `${Math.min(ev.clientX + 18, innerWidth - 290)}px`;
	tip.style.top = `${Math.min(ev.clientY + 14, innerHeight - tip.offsetHeight - 12)}px`;
}

addEventListener('pointermove', ev => {
	hoverUid = pick(ev);
	updateTooltip(ev);
});

function clearModes() {
	pending = null;
	selectedAttacker = null;
	hideWalkerMenu();
	updateHud();
}

// ---------- planeswalker ability menu ----------
function hideWalkerMenu() {
	$('walker-menu').style.display = 'none';
}

function openWalkerMenu(card, ev) {
	const menu = $('walker-menu');
	menu.innerHTML = `<div class="wm-title">${card.name} — loyalty ${card.loyalty}</div>`;
	card.abilities.forEach((a, i) => {
		const btn = document.createElement('button');
		btn.innerHTML = `<span class="wm-cost">${a.cost >= 0 ? '+' : ''}${a.cost}</span>${a.text}`;
		btn.disabled = !E.canUseWalker(state, HUMAN, card, i);
		btn.addEventListener('pointerdown', e => {
			e.stopPropagation();
			hideWalkerMenu();
			const spec = E.walkerSpec(state, HUMAN, card, i);
			if (spec) {
				const targets = E.legalTargets(state, HUMAN, spec);
				if (targets.length) { pending = { card, spec, targets, mode: 'walker', ability: i }; updateHud(); return; }
				if (spec.required) return;
			}
			E.useWalker(state, HUMAN, card.uid, i, null);
			pump();
		});
		menu.appendChild(btn);
	});
	menu.style.display = 'block';
	menu.style.left = `${Math.min(ev.clientX, innerWidth - 260)}px`;
	menu.style.top = `${Math.min(ev.clientY, innerHeight - 140)}px`;
}

addEventListener('contextmenu', ev => { ev.preventDefault(); clearModes(); });

renderer.domElement.addEventListener('pointerdown', ev => {
	hideWalkerMenu();
	if (ev.button !== 0 || !state || state.over || state.current !== HUMAN) return;
	const uid = pick(ev);
	const card = cardOf(uid);

	// targeting mode: expect a creature click (hero clicks handled on the panels)
	if (pending) {
		if (card && card.zone === 'board') {
			const t = pending.targets.find(t => t.type === 'creature' && t.uid === card.uid);
			if (t) { commitPending(t); return; }
		}
		clearModes();
		return;
	}
	if (selectedAttacker === 'HERO') {
		if (card && (card.zone === 'board' || card.zone === 'planeswalker') && card.controller !== HUMAN) {
			const kind = card.zone === 'board' ? 'creature' : 'walker';
			const t = E.heroAttackTargets(state, HUMAN).find(t => t.type === kind && t.uid === card.uid);
			if (t) { E.heroAttack(state, HUMAN, t); clearModes(); pump(); return; }
		}
		clearModes();
		return;
	}
	if (selectedAttacker) {
		const attacker = cardOf(selectedAttacker);
		if (card && (card.zone === 'board' || card.zone === 'planeswalker') && card.controller !== HUMAN && attacker) {
			const kind = card.zone === 'board' ? 'creature' : 'walker';
			const t = E.attackTargets(state, HUMAN, attacker).find(t => t.type === kind && t.uid === card.uid);
			if (t) { E.attack(state, HUMAN, selectedAttacker, t); clearModes(); pump(); return; }
		}
		clearModes();
		if (!card || card.controller !== HUMAN) return; // fall through to reselect own creature
	}

	if (!card) {
		// nothing card-like was hit: maybe an empty land slot of yours
		const slotPi = pickLandSlot(ev);
		if (slotPi === HUMAN && state.players[HUMAN].lands.length < E.MAX_LANDS) openLandShop(ev);
		return;
	}
	if (card.zone === 'hand' && card.controller === HUMAN) {
		if (!E.canPlay(state, HUMAN, card)) return;
		if (card.choices) { openChoiceMenu(card, ev); return; }
		const spec = E.targetSpec(state, HUMAN, card);
		if (spec) {
			const targets = E.legalTargets(state, HUMAN, spec);
			if (targets.length) { pending = { card, spec, targets, mode: 'play' }; updateHud(); return; }
			if (spec.required) return;
		}
		E.playCard(state, HUMAN, card.uid, null);
		pump();
	} else if (card.zone === 'board' && card.controller === HUMAN) {
		if (card.disguised && E.canUnmask(state, HUMAN, card)) { openUnmaskMenu(card, ev); return; }
		if (E.canAttackWith(state, HUMAN, card)) { selectedAttacker = card.uid; updateHud(); }
	} else if (card.zone === 'heropower' && card.controller === HUMAN) {
		// click an installed hero power to activate it
		if (!E.canUseHeroPower(state, HUMAN, card)) return;
		if (card.power.choices) { openPowerChoiceMenu(card, ev); return; }
		const spec = E.heroPowerSpec(state, HUMAN, card);
		if (spec) {
			const targets = E.legalTargets(state, HUMAN, spec);
			if (targets.length) { pending = { card, spec, targets, mode: 'power' }; updateHud(); return; }
			if (spec.required) return;
		}
		E.useHeroPower(state, HUMAN, card.uid, null);
		pump();
	} else if (card.zone === 'artifact' && card.controller === HUMAN && card.sac) {
		// click a field token (Blood/Treasure/Food) to sacrifice it
		if (E.canSacrifice(state, HUMAN, card)) {
			E.sacrificeToken(state, HUMAN, card.uid);
			pump();
		}
	} else if (card.zone === 'planeswalker' && card.controller === HUMAN) {
		// click your planeswalker to pick an ability
		if (E.canUseWalker(state, HUMAN, card)) openWalkerMenu(card, ev);
	} else if ((card.zone === 'companion' || card.zone === 'command') && card.controller === HUMAN) {
		// companion / commander play straight from their zones
		if (!E.canPlay(state, HUMAN, card)) return;
		const spec = E.targetSpec(state, HUMAN, card);
		if (spec) {
			const targets = E.legalTargets(state, HUMAN, spec);
			if (targets.length) { pending = { card, spec, targets, mode: 'play' }; updateHud(); return; }
			if (spec.required) return;
		}
		E.playCard(state, HUMAN, card.uid, null);
		pump();
	} else if (card.zone === 'land' && card.controller === HUMAN) {
		// tap your land for one of its abilities
		if (E.canTapLand(state, HUMAN, card)) openTapMenu(card, ev);
	}
});

// resolve a pending targeted action (play, hero power, walker, or land tap)
function commitPending(t) {
	if (pending.mode === 'power') E.useHeroPower(state, HUMAN, pending.card.uid, t, pending.choice);
	else if (pending.mode === 'walker') E.useWalker(state, HUMAN, pending.card.uid, pending.ability, t);
	else if (pending.mode === 'tap') E.tapLand(state, HUMAN, pending.card.uid, pending.tapIndex, t);
	else E.playCard(state, HUMAN, pending.card.uid, t, pending.choice);
	clearModes();
	pump();
}

// hero panels as click targets (attacks + targeted spells at heroes)
function panelClick(pi) {
	if (!state || state.over || state.current !== HUMAN) return;
	if (pending) {
		const t = pending.targets.find(t => t.type === 'hero' && t.player === pi);
		if (t) commitPending(t);
		return;
	}
	if (selectedAttacker === 'HERO') {
		if (pi !== HUMAN) {
			const t = E.heroAttackTargets(state, HUMAN).find(t => t.type === 'hero' && t.player === pi);
			if (t) { E.heroAttack(state, HUMAN, t); clearModes(); pump(); }
		} else {
			clearModes();
		}
		return;
	}
	if (selectedAttacker && pi !== HUMAN) {
		const attacker = cardOf(selectedAttacker);
		if (!attacker) { clearModes(); return; }
		const t = E.attackTargets(state, HUMAN, attacker).find(t => t.type === 'hero' && t.player === pi);
		if (t) { E.attack(state, HUMAN, selectedAttacker, t); clearModes(); pump(); }
		return;
	}
	// clicking your own panel arms a hero attack when you hold a weapon
	if (pi === HUMAN && !selectedAttacker && E.canHeroAttack(state, HUMAN)) {
		selectedAttacker = 'HERO';
		updateHud();
	}
}
$('my-panel').addEventListener('pointerdown', () => panelClick(HUMAN));

$('end-turn').addEventListener('click', () => {
	if (!state || state.over || state.current !== HUMAN) return;
	clearModes();
	E.endTurn(state);
	pump();
});
$('coin-btn').addEventListener('click', () => {
	if (!state) return;
	if (E.useCoin(state, HUMAN)) pump();
});
$('restart').addEventListener('click', () => start());
$('player-count').addEventListener('change', ev => {
	playerCount = Math.max(2, Math.min(E.MAX_PLAYERS, parseInt(ev.target.value, 10) || 2));
	const url = new URL(location.href);
	url.searchParams.set('players', playerCount);
	history.replaceState(null, '', url);
	start();
});

addEventListener('keydown', ev => { if (ev.key === 'Escape') clearModes(); });
addEventListener('resize', () => {
	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(innerWidth, innerHeight);
});

// ---------- ring highlighting (computed per frame) ----------
function updateRings() {
	if (!state) return;
	const validCreatureTargets = new Set();
	const attackable = t => t.type === 'creature' || t.type === 'walker';
	if (pending) for (const t of pending.targets) if (attackable(t)) validCreatureTargets.add(t.uid);
	if (selectedAttacker === 'HERO') {
		for (const t of E.heroAttackTargets(state, HUMAN)) if (attackable(t)) validCreatureTargets.add(t.uid);
	} else if (selectedAttacker) {
		const attacker = cardOf(selectedAttacker);
		if (attacker) for (const t of E.attackTargets(state, HUMAN, attacker)) if (attackable(t)) validCreatureTargets.add(t.uid);
	}
	for (const ent of entities.values()) {
		const c = ent.card;
		let color = null;
		if (validCreatureTargets.has(c.uid)) color = '#ff5f4f';
		else if (selectedAttacker === c.uid || pending?.card.uid === c.uid) color = '#ffd25f';
		else if (!pending && !selectedAttacker && state.current === HUMAN && !state.over) {
			if (c.zone === 'board' && c.controller === HUMAN && E.canAttackWith(state, HUMAN, c)) color = '#57e389';
			else if (c.zone === 'hand' && c.controller === HUMAN && E.canPlay(state, HUMAN, c)) color = '#57e389';
			else if (c.zone === 'heropower' && c.controller === HUMAN && E.canUseHeroPower(state, HUMAN, c)) color = '#57e389';
			else if (c.zone === 'planeswalker' && c.controller === HUMAN && E.canUseWalker(state, HUMAN, c)) color = '#57e389';
			else if ((c.zone === 'companion' || c.zone === 'command') && c.controller === HUMAN && E.canPlay(state, HUMAN, c)) color = '#57e389';
			else if (c.zone === 'land' && c.controller === HUMAN && E.canTapLand(state, HUMAN, c)) color = '#57e389';
		}
		if (color && (c.zone === 'board' || c.zone === 'heropower' || c.zone === 'planeswalker' || c.zone === 'companion' || c.zone === 'command' || c.zone === 'land')) {
			ent.ring.visible = true;
			ent.ring.material.color.set(color);
			ent.ring.scale.setScalar(c.zone === 'board' ? 1 : c.zone === 'planeswalker' ? 0.72 : 0.62);
			ent.ring.position.set(ent.mesh.position.x, 0.02, ent.mesh.position.z);
		} else if (color && c.zone === 'hand') {
			ent.ring.visible = false;
			ent.mesh.material[4]?.emissive?.set(0x123a12);
			continue;
		} else {
			ent.ring.visible = false;
		}
		// frozen creatures glow ice-blue
		if (c.frozen && c.zone === 'board') ent.faceMat.emissive?.set(0x1a3d55);
		else ent.faceMat.emissive?.set(color && c.zone === 'hand' ? 0x1c4a1c : 0x000000);
	}
}

// ---------- main loop ----------
const clock = new THREE.Clock();
function animate() {
	requestAnimationFrame(animate);
	const dt = Math.min(clock.getDelta(), 0.05);
	const now = performance.now();
	layoutTargets();
	for (const [uid, ent] of entities) {
		// death animation
		if (ent.dying) {
			const t = (now - ent.dying) / 450;
			if (t >= 1) { removeEntity(uid); continue; }
			ent.mesh.scale.setScalar(Math.max(0.01, 1 - t));
			ent.mesh.position.y += dt * 1.5;
			continue;
		}
		// attack lunge
		if (ent.lunge) {
			const t = (now - ent.lunge.start) / 420;
			if (t >= 1) { ent.lunge = null; }
			else {
				const k = t < 0.5 ? t * 2 : (1 - t) * 2;
				ent.mesh.position.lerpVectors(ent.lunge.from, ent.lunge.to, k * 0.85);
				ent.mesh.position.y += k * 0.8;
				continue;
			}
		}
		ent.mesh.position.lerp(ent.target.pos, 1 - Math.pow(0.001, dt));
		ent.mesh.quaternion.slerp(ent.target.quat, 1 - Math.pow(0.001, dt));
		const s = ent.mesh.scale.x + (ent.target.scale - ent.mesh.scale.x) * (1 - Math.pow(0.001, dt));
		ent.mesh.scale.setScalar(s);
	}
	for (let i = floaters.length - 1; i >= 0; i--) {
		const f = floaters[i];
		f.life -= dt * 0.9;
		f.sp.position.y += dt * 1.4;
		f.sp.material.opacity = Math.max(0, f.life);
		if (f.life <= 0) { scene.remove(f.sp); f.sp.material.map.dispose(); floaters.splice(i, 1); }
	}
	// the rules gems slowly wander the hue wheel together (~25s per lap)
	gemMat.color.setHSL((now * 0.00004) % 1, 0.85, 0.62);
	updateRings();
	positionPanels();
	renderer.render(scene, camera);
}
animate();

// ---------- boot ----------
// headless test hook
window.__game = {
	get state() { return state; },
	E, AI,
	pump,
	screenPosOf(uid) {
		const ent = entities.get(uid);
		if (!ent) return null;
		const v = ent.mesh.position.clone().project(camera);
		return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
	},
};

let classRegistry = [];

function pickClasses() {
	const savedId = localStorage.getItem('magepunk_class_v1');
	const picks = [];
	const playable = classRegistry.filter(c => c.power);
	for (let i = 0; i < playerCount; i++) {
		if (i === HUMAN) {
			picks.push(classRegistry.find(c => c.id === savedId) || null);
		} else {
			picks.push(playable.length ? playable[Math.floor(Math.random() * playable.length)] : null);
		}
	}
	return picks;
}

async function start() {
	for (const uid of [...entities.keys()]) removeEntity(uid);
	queue.length = 0;
	queueBusy = false;
	clearModes();
	$('restart').style.display = 'none';
	$('player-count').value = String(playerCount);
	logEl.innerHTML = '';
	buildTable();
	frameCamera();
	const data = await (await fetch('cards.json')).json();
	const cardsById = {};
	for (const d of data.cards) cardsById[d.id] = d;
	if (!classRegistry.length) {
		try {
			classRegistry = (await (await fetch('classes.json')).json()).classes;
			const sel = $('class-select');
			sel.innerHTML = '<option value="">No class</option>';
			for (const c of classRegistry) {
				const opt = document.createElement('option');
				opt.value = c.id;
				opt.textContent = c.name + (c.power ? '' : ' (no power yet)');
				sel.appendChild(opt);
			}
			sel.value = localStorage.getItem('magepunk_class_v1') || '';
			sel.addEventListener('change', ev => {
				localStorage.setItem('magepunk_class_v1', ev.target.value);
				start();
			});
		} catch (e) { classRegistry = []; }
	}
	const picks = pickClasses();
	// use the saved deck when it's complete and valid; otherwise the demo deck
	const collection = Col.getCollection(data.cards);
	const saved = Col.loadDeck();
	const deckOk = saved.length === Col.DECK_SIZE
		&& !Col.validateDeck(saved, cardsById, collection, picks[HUMAN]?.id);
	state = E.createGame(cardsById, Math.random, deckOk ? saved : null, playerCount, picks);
	state.classPicks = picks;
	buildPanels();
	buildSlotMarkers();
	log(deckOk ? 'Using your custom deck.' : 'Using the demo deck — build one in the deck builder!');
	if (picks[HUMAN]) log(`You are a ${picks[HUMAN].name}.`);
	if (playerCount > 2) log(`Free-for-all: ${playerCount} players, last hero standing wins.`);
	pump();
	updateHud();
}
start();
