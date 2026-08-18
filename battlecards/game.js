// game.js — Magepunk Battlecards: Three.js table renderer + interaction.
// Rules live in engine.js; the AI in ai.js. This file only draws and routes input.
import * as THREE from 'three';
import * as E from './engine.js';
import * as AI from './ai.js';
import * as Col from './collection.js';
import * as Dungeon from './dungeon.js';
import * as Heist from './heist.js';
import * as Tombs from './tombs.js';
import * as Duels from './duels.js';
import * as MPX from './mpmode.js';
import * as Chat from './chat.js';
import { safeLoad, safeSave } from './safestore.js';
import { keywordsFor, keywordLabel, richHtml, runePipsHtml } from './keywords.js';

// small "what does this keyword do" lines shown beneath a card's rules text
function keywordLinesHtml(card) {
	return keywordsFor(card).map(k =>
		`<div class="tt-kw"><b>${k.label}</b> — ${k.text}</div>`).join('');
}

// "Modifiers": keywords / stat changes the creature has now but didn't start with
// (gained from buffs, auras, grants). Reads against the printed card definition.
function modifierLinesHtml(card) {
	if (!state || (card.type !== 'creature' && card.type !== 'weapon')) return '';
	const def = state.cardsById?.[card.id] || {};
	const base = new Set(def.keywords || []);
	const gainedKw = [...new Set((card.keywords || []).filter(k => !base.has(k)))];
	const bits = gainedKw.map(keywordLabel);
	// stat swing vs. the printed body (permanent buffs + counters, ignoring this-turn temp)
	if (card.type === 'creature') {
		const dA = (card.attack || 0) - (def.attack || 0) - (card.tempAttack || 0);
		const maxHp = card.maxHealth || 0, dH = maxHp - (def.health || 0);
		if (dA || dH) bits.unshift(`${dA >= 0 ? '+' : ''}${dA}/${dH >= 0 ? '+' : ''}${dH}`);
	}
	if (!bits.length) return '';
	return `<div class="tt-kw" style="color:#8fe39f"><b>Modifiers</b> — ${bits.join(', ')}</div>`;
}

// the battlecards 3D game requires a login — bounce to the account door
// without one. In account mode dungeon runs use the account's edited starter
// decks, and finishing a run — win or lose — earns a pack.
MPX.requireLogin();
const MP_ON = MPX.mpMode();
import { CARD_W, CARD_H, CARD_D, makeFaceTexture, makeBackTexture, classNameOf, classColorOf, drawCardFace, makeTokenTexture, TOKEN_W, TOKEN_H, drawHeroPortrait, drawPowerOrb, artListeners, generatedCardIds } from './cardart.js';
import * as Rec from './replayrec.js';
import { openProfile } from './profile.js';

// the player index this client controls. Solo/host = 0; a live-duel guest = 1.
// The board reorients so HUMAN always sits at the bottom facing the camera.
let HUMAN = 0;
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

// player count comes from ?players=N (2-8); the in-game selector rewrites it
let playerCount = Math.max(2, Math.min(E.MAX_PLAYERS,
	parseInt(new URLSearchParams(location.search).get('players'), 10) || 2));

// ?boss=<id> = a one-off encounter vs that boss; ?dungeon=1 = the full run
// (8 levels, bucket drafts + treasures between fights, state in localStorage)
const RUN_KEY = 'magepunk_dungeon_v1';
const dungeonRunMode = new URLSearchParams(location.search).has('dungeon');
const HEIST_KEY = 'magepunk_heist_v1';
const heistRunMode = !dungeonRunMode && new URLSearchParams(location.search).has('heist');
let heistBossName = null; // the current heist/tombs boss display name
const TOMBS_KEY = 'magepunk_tombs_v1';
const tombsRunMode = !dungeonRunMode && !heistRunMode && new URLSearchParams(location.search).has('tombs');
const DUELS_KEY = 'magepunk_duels_v1';
const duelsRunMode = !dungeonRunMode && !heistRunMode && !tombsRunMode && new URLSearchParams(location.search).has('duels');
const ARENA_KEY = 'magepunk_arena_v1';
const arenaRunMode = !dungeonRunMode && !heistRunMode && !tombsRunMode && !duelsRunMode && new URLSearchParams(location.search).has('arena');
let dungeonBossId = (id => Dungeon.BOSSES[id] ? id : null)(
	new URLSearchParams(location.search).get('boss'));
if (dungeonBossId || dungeonRunMode || heistRunMode || tombsRunMode || duelsRunMode || arenaRunMode) playerCount = 2;

// ?spectate=<friend> (MP only): render a friend's live dungeon-run/battle board
// read-only from the snapshots they publish — no input, no AI.
const spectateName = MP_ON ? new URLSearchParams(location.search).get('spectate') : null;
const spectateMode = !!spectateName;

// ?replay=<id>: rewatch a recorded game from the local tape (replayrec.js) —
// read-only, no AI, no network. Reuses the spectate input-gating below.
const replayId = new URLSearchParams(location.search).get('replay');
const rshareId = new URLSearchParams(location.search).get('rshare'); // a server-shared replay link
const replayMode = !!replayId || !!rshareId;

// ?cardpvp=<matchId> (MP only): a live host-authoritative card duel. The host
// runs the real engine as player 0; the guest is player 1, renders the host's
// published board, and relays action intents the host applies.
const cardPvpId = MP_ON ? new URLSearchParams(location.search).get('cardpvp') : null;
const duel = { on: !!cardPvpId, id: cardPvpId, role: null, seat: 0, size: 2, aiSeats: null, soloAi: false, seq: -1, relaySeq: 0, busy: false, config: null, modalSig: null };
// ?aimatch=<id> — a matchmaking AI game: a normal local game vs the AI, but the
// AI plays a specific decklist (a starter or a harvested real-player deck)
const aiMatchId = MP_ON ? new URLSearchParams(location.search).get('aimatch') : null;

// ---------- per-match stats (for the post-game summary) ----------
// Accumulated from the event stream; reset when turn 1 fires so a rematch on the
// same page starts fresh. 2-player attribution: damage to a hero is credited to
// the other seat. Resumed/spectated games (no turn 1) leave this null → the
// summary shows the result without a stat table.
let matchStats = null;
function resetMatchStats() { matchStats = { start: performance.now(), turns: 0, cards: [], summons: [], heroDmgTaken: [], elim: [] }; }
function statInc(arr, i, n = 1) { if (i == null || i < 0) return; arr[i] = (arr[i] || 0) + n; }

const loadRun = () => safeLoad(RUN_KEY, null);
const saveRun = run => safeSave(RUN_KEY, run);
const clearRun = () => localStorage.removeItem(RUN_KEY);
const loadHeist = () => safeLoad(HEIST_KEY, null);
const saveHeist = run => safeSave(HEIST_KEY, run);
const clearHeist = () => localStorage.removeItem(HEIST_KEY);
const loadTombs = () => safeLoad(TOMBS_KEY, null);
const saveTombs = run => safeSave(TOMBS_KEY, run);
const clearTombs = () => localStorage.removeItem(TOMBS_KEY);
const loadDuels = () => safeLoad(DUELS_KEY, null);
const saveDuels = run => safeSave(DUELS_KEY, run);
const clearDuels = () => localStorage.removeItem(DUELS_KEY);
const loadArena = () => safeLoad(ARENA_KEY, null);
const saveArena = run => safeSave(ARENA_KEY, run);
const clearArena = () => localStorage.removeItem(ARENA_KEY);

const nameOf = pi => pi === HUMAN ? 'You'
	: duel.on ? (pi === 0 ? (duel.config?.host || 'Host') : (duel.config?.guest || 'Guest'))
	: (dungeonBossId && pi === 1 ? Dungeon.BOSSES[dungeonBossId].name
	: heistBossName && pi === 1 ? heistBossName : `AI ${pi}`);
// each player's board is a pizza slice: rotate their zone layout around the
// table center; the local (HUMAN) slice always faces the camera (angle 0 =
// bottom). Angles are relative to HUMAN so a duel guest sees themselves up front.
const angleOf = pi => (((pi - HUMAN + playerCount) % playerCount) / playerCount) * TAU;
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
	// narrow (portrait/phone) screens crop the table sideways: pull back so
	// the full width still fits in the horizontal field of view
	const fit = Math.max(1, Math.sqrt(1.45 / Math.max(0.3, camera.aspect)));
	camera.position.set(0, (13.2 + off * 1.6) * fit, (12.2 + off * 1.25) * fit);
	camera.lookAt(0, 0, -0.8);
	// keep the far slices out of the fog on big tables
	scene.fog.near = (18 + off * 2.2) * fit;
	scene.fog.far = (34 + off * 3.6) * fit;
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
// uid -> { card, mesh, faceMat, form, ring, target {pos,rot,scale}, lungeUntil, dying }
const entities = new Map();

// board creatures shed their card frame and become HS-style minion ovals
const TOKEN_SCALE = 1.1;
const tokenGeo = new THREE.PlaneGeometry(CARD_W * TOKEN_SCALE, CARD_W * TOKEN_SCALE * (TOKEN_H / TOKEN_W));
function formFor(card) {
	return card.zone === 'board' && card.type === 'creature' ? 'token' : 'card';
}

function faceMaterialFor(card) {
	// enemy hand cards are hidden information: always show the card back, whatever
	// the camera angle or game mode (never the real face)
	if (card.zone === 'hand' && card.controller !== HUMAN) return new THREE.MeshStandardMaterial({ map: makeBackTexture(), roughness: 0.5 });
	// disguised creatures render anonymously: neutral art seed, no identity
	const shown = card.disguised
		? { ...card, id: 'disguised', name: 'Disguised', description: '', cardClass: 'neutral' }
		: card;
	if (formFor(card) === 'token') {
		const def = state?.cardsById?.[card.id];
		const tex = makeTokenTexture(shown, {
			attack: card.attack, hp: E.hp(card), maxHealth: card.maxHealth,
			baseAttack: card.disguised ? card.attack : def?.attack,
			baseHealth: card.disguised ? card.maxHealth : def?.health,
			taunt: card.keywords.includes('taunt'),
			shield: !!card.shield,
			stealthed: !!card.stealthed,
		});
		return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.1, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide });
	}
	const tex = makeFaceTexture(
		{ ...shown, health: card.maxHealth },
		card.type === 'creature' ? { attack: card.attack, hp: E.hp(card), maxHealth: card.maxHealth }
			: card.type === 'weapon' ? { attack: card.attack, durability: card.durability }
			: card.type === 'location' ? { durability: card.durability }
			: card.type === 'quest' ? { progress: card.progress || 0, goal: card.quest?.goal?.count }
			: card.type === 'planeswalker' ? { loyalty: card.loyalty } : {}
	);
	return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.12 });
}

// everything the rendered face shows, as a compact string — when it changes the
// cached texture must repaint. This is the guest's only stat-sync path: it ingests
// authoritative snapshots WITHOUT the event stream that normally drives refreshFace,
// so without this its board faces freeze at summon-time numbers (the 1/3-vs-6/2 bug).
function faceSig(card) {
	const s = card.type === 'creature' ? `${card.attack}/${E.hp(card)}/${card.maxHealth}/${card.shield ? 1 : 0}/${card.stealthed ? 1 : 0}/${card.disguised ? 1 : 0}/${(card.keywords || []).join('.')}`
		: card.type === 'weapon' ? `${card.attack}/${card.durability}`
		: card.type === 'location' ? `d${card.durability}`
		: card.type === 'quest' ? `p${card.progress || 0}`
		: card.type === 'planeswalker' ? `l${card.loyalty}`
		: '';
	return `${formFor(card)}|${card.cost}|${s}|${card.zone === 'hand' && card.controller !== HUMAN ? 'HID' : ''}`;
}

function buildBody(card, form, faceMat) {
	const mesh = form === 'token'
		? new THREE.Mesh(tokenGeo, faceMat)
		: new THREE.Mesh(cardGeo, [edgeMat, edgeMat, edgeMat, edgeMat, faceMat, backMat]);
	mesh.userData.uid = card.uid;
	return mesh;
}

function entityFor(card) {
	let ent = entities.get(card.uid);
	const form = formFor(card);
	if (ent && ent.form !== form) {
		// hand card became a board minion (or vice versa): swap the body
		const faceMat = faceMaterialFor(card);
		const mesh = buildBody(card, form, faceMat);
		mesh.position.copy(ent.mesh.position);
		mesh.quaternion.copy(ent.mesh.quaternion);
		mesh.scale.copy(ent.mesh.scale);
		scene.remove(ent.mesh);
		ent.faceMat.map?.dispose();
		scene.add(mesh);
		ent.mesh = mesh;
		ent.faceMat = faceMat;
		ent.form = form;
		ent.faceSig = faceSig(card); // face freshly built for the new form
	}
	if (!ent) {
		const faceMat = faceMaterialFor(card);
		const mesh = buildBody(card, form, faceMat);
		mesh.position.set(card.controller === HUMAN ? 9 : -9, 0.3, card.controller === HUMAN ? 6.5 : -6.5);
		scene.add(mesh);
		ent = { card, mesh, faceMat, form, faceSig: faceSig(card), target: { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1 }, ring: makeRing('#57e389') };
		entities.set(card.uid, ent);
	}
	ent.card = card;
	// repaint the cached face when the card's shown stats drift from what's on screen
	// (covers the guest's snapshot-only sync, and is a harmless safety net elsewhere)
	const sig = faceSig(card);
	if (ent.faceSig !== sig) { refreshFace(ent); ent.faceSig = sig; }
	return ent;
}

function refreshFace(ent) {
	ent.faceMat.map?.dispose();
	const nm = faceMaterialFor(ent.card);
	ent.faceMat.map = nm.map;
	ent.faceMat.needsUpdate = true;
	ent.faceSig = faceSig(ent.card); // keep the sync-check in step with event-driven repaints
}

// when a real art crop finishes loading, live faces using it repaint
artListeners.add(id => {
	for (const ent of entities.values()) {
		if ((id === '*' || ent.card.id === id) && !ent.card.disguised) refreshFace(ent);
	}
});

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
const LAND_Z = 3.05, LAND_SPREAD = 1.15;              // slice-local land row (kept above the hero panel)
const CREATURE_Z = 1.15;                              // creature row, pulled forward so it clears the land slots
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
	menu.style.maxHeight = '70vh';
	menu.style.overflowY = 'auto';
	// basics always; advanced lands unlock as your basics build a color identity
	for (const def of E.availableLands(state, HUMAN)) {
		const btn = document.createElement('button');
		const firstTap = (def.taps?.[0]?.text) || (def.mana ? `Gain ${def.mana} mana.` : '');
		btn.innerHTML = `<span class="wm-cost">${E.LAND_COST}</span><b>${def.name}</b> — ${firstTap}`;
		btn.title = def.description || '';
		btn.disabled = !E.canBuyLand(state, HUMAN);
		btn.addEventListener('pointerdown', e => {
			e.stopPropagation();
			hideWalkerMenu();
			actLand(def.id);
		});
		menu.appendChild(btn);
	}
	menu.style.display = 'block';
	menu.style.left = `${Math.min(ev.clientX, innerWidth - 300)}px`;
	menu.style.top = `${Math.min(ev.clientY, innerHeight - 260)}px`;
}

// Choose One cards pick their branch before targeting
// after modes are chosen, target if any chosen mode needs one (e.g. Cryptic's bounce), then play
function continueModalPlay(card, modes, position) {
	const spec = E.targetSpec(state, HUMAN, card, modes);
	if (spec) {
		const targets = E.legalTargets(state, HUMAN, spec);
		if (targets.length) { pending = { card, spec, targets, mode: 'play', position, choice: modes }; updateHud(); return; }
		if (spec.required) return;
	}
	actPlay(card.uid, null, modes, position);
}

// modal instant cast IN RESPONSE (Cryptic): after modes, target if needed, then submit the response
function continueModalRespond(card, modes) {
	const spec = E.targetSpec(state, HUMAN, card, modes);
	if (spec) {
		const targets = E.legalTargets(state, HUMAN, spec);
		if (targets.length) { pending = { card, spec, targets, mode: 'respond', action: { kind: 'spell', uid: card.uid, choice: modes } }; updateHud(); return; }
		if (spec.required) return;
	}
	submitRespond({ kind: 'spell', uid: card.uid, choice: modes, target: null });
}

// Choose two / choose one or more: toggle modes, then confirm. `commit(modes)` defaults to playing.
function openMultiChoiceMenu(card, ev, position, commit) {
	commit = commit || (modes => continueModalPlay(card, modes, position));
	const menu = $('walker-menu');
	const min = card.chooseCount || card.chooseMin || 1;
	const max = card.chooseCount || card.chooseMax || card.choices.length;
	const chosen = new Set();
	const render = () => {
		const label = min === max ? `${min}` : `${min}–${max}`;
		menu.innerHTML = `<div class="wm-title">${card.name} — choose ${label}:</div>`;
		card.choices.forEach((ch, i) => {
			const btn = document.createElement('button');
			btn.textContent = (chosen.has(i) ? '☑ ' : '☐ ') + ch.text;
			if (chosen.has(i)) btn.classList.add('bottom');
			btn.addEventListener('pointerdown', e => {
				e.stopPropagation();
				if (chosen.has(i)) chosen.delete(i);
				else if (chosen.size < max) chosen.add(i);
				render();
			});
			menu.appendChild(btn);
		});
		const done = document.createElement('button');
		done.className = 'scry-done';
		done.textContent = `Cast (${chosen.size})`;
		done.disabled = chosen.size < min || chosen.size > max;
		done.addEventListener('pointerdown', e => {
			e.stopPropagation();
			if (chosen.size < min || chosen.size > max) return;
			hideWalkerMenu();
			commit([...chosen]);
		});
		menu.appendChild(done);
	};
	render();
	showDecisionMenu();
}

function openChoiceMenu(card, ev, position) {
	if (card.chooseCount > 1 || card.chooseMax) { openMultiChoiceMenu(card, ev, position); return; }
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
				if (targets.length) { pending = { card, spec, targets, mode: 'play', choice: i, position }; updateHud(); return; }
				if (spec.required) return;
			}
			actPlay(card.uid, null, i, position);
		});
		menu.appendChild(btn);
	});
	showDecisionMenu();
}

// Tradeable cards offer Play or Trade (pay 1: shuffle back, draw a card)
function openTradeMenu(card, ev) {
	const menu = $('walker-menu');
	menu.innerHTML = `<div class="wm-title">${card.name}</div>`;
	const play = document.createElement('button');
	play.innerHTML = `<span class="wm-cost">${E.effectiveCost(state, HUMAN, card)}</span>Play`;
	play.disabled = !E.canPlay(state, HUMAN, card);
	play.addEventListener('pointerdown', e => {
		e.stopPropagation();
		hideWalkerMenu();
		playFromHand(card, ev);
	});
	menu.appendChild(play);
	if (card.tradeable) {
		const trade = document.createElement('button');
		trade.innerHTML = `<span class="wm-cost">1</span>Trade — shuffle into your deck, draw a card`;
		trade.disabled = !E.canTrade(state, HUMAN, card);
		trade.addEventListener('pointerdown', e => {
			e.stopPropagation();
			hideWalkerMenu();
			actTrade(card.uid);
		});
		menu.appendChild(trade);
	}
	if (card.prepare) {
		const prep = document.createElement('button');
		const spend = Math.max(0, Math.min(E.availableMana(state.players[HUMAN]), (card.cost || 0) - 1));
		prep.innerHTML = `<span class="wm-cost">${spend}</span>Prepare — costs (${spend + 1}) less, can't be played this turn`;
		prep.disabled = !E.canPrepare(state, HUMAN, card);
		prep.addEventListener('pointerdown', e => {
			e.stopPropagation();
			hideWalkerMenu();
			actPrepare(card.uid);
		});
		menu.appendChild(prep);
	}
	if (card.forge) {
		const forge = document.createElement('button');
		const fcost = card.forge.cost != null ? card.forge.cost : 2;
		forge.innerHTML = `<span class="wm-cost">${fcost}</span>Forge — upgrade this card`;
		forge.disabled = !E.canForge(state, HUMAN, card);
		forge.addEventListener('pointerdown', e => {
			e.stopPropagation();
			hideWalkerMenu();
			actForge(card.uid);
		});
		menu.appendChild(forge);
	}
	showDecisionMenu();
}

// alternative-cost cards you can afford BOTH ways offer a choice: mana or the alt cost
function openAltMenu(card, ev, position) {
	const menu = $('walker-menu');
	menu.innerHTML = `<div class="wm-title">${card.name} — how to pay?</div>`;
	const mk = (label, cost, useAlt) => {
		const btn = document.createElement('button');
		btn.innerHTML = cost != null ? `<span class="wm-cost">${cost}</span>${label}` : label;
		btn.addEventListener('pointerdown', e => { e.stopPropagation(); hideWalkerMenu(); continuePlay(card, position, useAlt); });
		menu.appendChild(btn);
	};
	mk('Pay normally', E.effectiveCost(state, HUMAN, card), false);
	mk(card.altCost.label || 'Alternative cost', null, true);
	showDecisionMenu();
}

// kicker cards you can afford base+kicker offer a "cast vs cast-kicked" choice
function openKickerMenu(card, ev, position) {
	const menu = $('walker-menu');
	menu.innerHTML = `<div class="wm-title">${card.name} — kicker?</div>`;
	const base = E.effectiveCost(state, HUMAN, card);
	const mk = (label, cost, kicked) => {
		const btn = document.createElement('button');
		btn.innerHTML = `<span class="wm-cost">${cost}</span>${label}`;
		btn.addEventListener('pointerdown', e => { e.stopPropagation(); hideWalkerMenu(); continuePlay(card, position, false, kicked); });
		menu.appendChild(btn);
	};
	mk('Cast', base, false);
	mk('Cast with kicker', base + card.kicker.cost, true);
	showDecisionMenu();
}

// having settled the cost, pick a target (if any) then play
function continuePlay(card, position, useAlt, kicked) {
	const spec = E.targetSpec(state, HUMAN, card);
	if (spec) {
		const targets = E.legalTargets(state, HUMAN, spec);
		if (targets.length) { pending = { card, spec, targets, mode: 'play', position, useAlt, kicked }; updateHud(); return; }
		if (spec.required) return;
	}
	actPlay(card.uid, null, undefined, position, useAlt, kicked);
}

function playFromHand(card, ev, position) {
	if (!E.canPlay(state, HUMAN, card)) return;
	if (card.choices) { openChoiceMenu(card, ev, position); return; }
	if (card.altCost && E.canPayAlt(state, HUMAN, card) && E.canPayMana(state, HUMAN, card)) { openAltMenu(card, ev, position); return; }
	if (card.kicker && E.canKick(state, HUMAN, card)) { openKickerMenu(card, ev, position); return; }
	// only one payment option available: pick it automatically
	const useAlt = !!(card.altCost && !E.canPayMana(state, HUMAN, card) && E.canPayAlt(state, HUMAN, card));
	continuePlay(card, position, useAlt, false);
}

// which of `targets` did the drop point land on (creature / walker / hero)?
function resolveDropTarget(ev, targets, excludeUid) {
	const c = cardOf(pick(ev, excludeUid));
	if (c) { const t = targets.find(t => t.uid === c.uid); if (t) return t; } // any permanent by uid
	const heroPi = heroPanelAt(ev.clientX, ev.clientY);
	if (heroPi != null) { const t = targets.find(t => t.type === 'hero' && t.player === heroPi); if (t) return t; }
	return null;
}

// a hand card dragged out onto the field: route by type. Creatures pick a board
// gap; a targeted spell casts on whatever it's dropped on, else arms the arrow.
function releasePlay(c, ev) {
	if (c.adventure && !c.adventureSpent
		&& (E.canPlay(state, HUMAN, c) || E.canPlayAdventure(state, HUMAN, c))) { openAdventureMenu(c, ev); return; }
	if (!E.canPlay(state, HUMAN, c)) {
		if ((c.tradeable && E.canTrade(state, HUMAN, c)) || (c.prepare && E.canPrepare(state, HUMAN, c)) || (c.forge && E.canForge(state, HUMAN, c))) openTradeMenu(c, ev);
		return;
	}
	if ((c.tradeable && E.canTrade(state, HUMAN, c)) || (c.prepare && E.canPrepare(state, HUMAN, c)) || (c.forge && E.canForge(state, HUMAN, c))) { openTradeMenu(c, ev); return; }
	if (c.type === 'creature' || c.type === 'location') {
		const pos = placementIndexAt(ev.clientX);
		if (c.choices) { openChoiceMenu(c, ev, pos); return; }
		const over = cardOf(pick(ev, c.uid));
		const magTribes = c.magnetizeTribes?.length ? c.magnetizeTribes : ['Mech'];
		if (c.magnetic && over && over.zone === 'board' && over.controller === HUMAN && magTribes.some(tr => (over.tribe || '').includes(tr))) {
			actPlay(c.uid, { type: 'creature', uid: over.uid, player: HUMAN });
		} else {
			playFromHand(c, ev, pos);
		}
		return;
	}
	if (c.choices) { openChoiceMenu(c, ev); return; }
	if (c.altCost && E.canPayAlt(state, HUMAN, c) && E.canPayMana(state, HUMAN, c)) { openAltMenu(c, ev); return; }
	if (c.kicker && E.canKick(state, HUMAN, c)) { openKickerMenu(c, ev); return; }
	const ua = !!(c.altCost && !E.canPayMana(state, HUMAN, c) && E.canPayAlt(state, HUMAN, c));
	const spec = E.targetSpec(state, HUMAN, c);
	if (spec) {
		const targets = E.legalTargets(state, HUMAN, spec);
		const t = resolveDropTarget(ev, targets, c.uid);
		if (t && !c.fight) { actPlay(c.uid, t, undefined, undefined, ua); return; } // dropped right on a legal target
		if (targets.length) { pending = { card: c, spec, targets, mode: 'play', useAlt: ua }; updateHud(); return; } // fight cards always take the two-step path
		if (spec.required) return;
	}
	actPlay(c.uid, null, undefined, undefined, ua);
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
			actPower(card.uid, null, i);
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
		actUnmask(card.uid);
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
		if (isGuest()) { guestApply(() => E.resolveScry(state, picks), { k: 'scry', picks }); return; }
		E.resolveScry(state, picks);
		pump();
		if (duel.on) publishDuel();
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
			actTapLand(card.uid, i, null); // relays the intent in a duel (guest)
		});
		menu.appendChild(btn);
	});
	if (card.zone === 'land') {
		// upgrade this slot into an advanced land that shares one of its current
		// colors and fits your color identity — 3 mana, each opponent gets a coin
		const canAfford = !state.over && state.current === HUMAN && E.availableMana(state.players[HUMAN]) >= E.LAND_COST;
		for (const def of E.availableUpgrades(state, HUMAN, card.uid)) {
			const up = document.createElement('button');
			up.innerHTML = `<span class="wm-cost">${E.LAND_COST}</span>Upgrade → <b>${def.name}</b>`;
			up.title = def.description || '';
			up.disabled = !canAfford;
			up.addEventListener('pointerdown', e => {
				e.stopPropagation();
				hideWalkerMenu();
				actUpgrade(card.uid, def.id);
			});
			menu.appendChild(up);
		}
	}
	if (card.zone === 'land') {
		// every land can be cashed in for a card
		const sac = document.createElement('button');
		sac.innerHTML = `<span class="wm-cost">💀</span>Sacrifice: draw a card`;
		sac.addEventListener('pointerdown', e => {
			e.stopPropagation();
			hideWalkerMenu();
			actSacLand(card.uid); // relays the intent in a duel (guest)
		});
		menu.appendChild(sac);
	}
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
				// a card being dragged out of the hand floats under the cursor
				if (placing && placing.dragging && card.uid === placing.card.uid) {
					const wp = screenToGround(mouseX, mouseY, 1.35);
					ent.target.pos.set(wp.x, 1.35, wp.z);
					ent.target.quat = sliceQuat(new THREE.Euler(-0.62, 0, 0), HUMAN);
					ent.target.scale = 0.9;
					return;
				}
				const spread = Math.min(1.55, 10.5 / Math.max(n, 1));
				const x = (i - (n - 1) / 2) * spread;
				const hovered = hoverUid === card.uid || (pending?.card.uid === card.uid);
				if (handMini && !hovered) {
					// tucked down below the hero panel so the panel reads clearly
					ent.target.pos.set(x, 1.32 + i * 0.012, off + 7.5 - Math.abs(x) * 0.03);
					ent.target.quat = sliceQuat(new THREE.Euler(-0.5, 0, -(i - (n - 1) / 2) * 0.03), HUMAN);
					ent.target.scale = 0.5;
				} else {
					// a hovered card lifts up AND pulls toward the camera (+z) so it sits
					// in FRONT of its neighbors — pushing it back (-z) let siblings, whose
					// forward-tilted bottom edges are nearer the camera, cover its lower half
					ent.target.pos.set(x, 1.7 + (hovered ? 0.9 : 0) + i * 0.012, off + 6.9 - Math.abs(x) * 0.04 + (hovered ? 0.45 : 0));
					ent.target.quat = sliceQuat(new THREE.Euler(-0.5, 0, -(i - (n - 1) / 2) * 0.03), HUMAN);
					ent.target.scale = hovered ? 1.0 : 0.68;
				}
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
		// hero powers mirror the trap row on the left; quests sit outside them.
		// The CLASS power (or a run-mode alt-power in slot 0) lives in the hero
		// panel as an orb, not on the table — for every player, so an opponent's
		// Duels/Heist/Tombs power doesn't render as a loose card on the field.
		const orbPow = classPowerOf(pi);
		p.heroPowers.filter(c => c !== orbPow && c.id !== (p.heroClass || '') + '_power').forEach((card, i) => {
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
			ent.target.quat = sliceQuat(card.tapped && card.tapAbility ? new THREE.Euler(-Math.PI / 2, 0, -Math.PI / 2) : FLAT, pi);
			ent.target.scale = 0.42;
		});
		// creature row (unlimited: compress spacing inside the slice arc).
		// Tokens always face the HUMAN so enemy stats read right-side-up.
		const bn = p.board.length;
		const rowWidth = playerCount <= 2 ? 10.5 : TAU * (off + CREATURE_Z) / playerCount * 0.9;
		p.board.forEach((card, i) => {
			const ent = entityFor(card);
			seen.add(card.uid);
			const spread = Math.min(2.35, rowWidth / Math.max(bn, 1));
			const x = (i - (bn - 1) / 2) * spread;
			ent.target.pos = toWorld(x, 0.06 + i * 0.002, off + CREATURE_Z, pi);
			// tapped locations turn sideways like tapped lands
			ent.target.quat = sliceQuat(card.type === 'location' && card.tapped
				? new THREE.Euler(-Math.PI / 2, 0, -Math.PI / 2) : FLAT, HUMAN);
			// tokens shrink to their spacing so neighbors never overlap
			ent.target.scale = Math.min(0.8, (spread * 0.97) / (CARD_W * TOKEN_SCALE));
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
// full match history (for the scrollable log drawer); the inline #log HUD keeps
// only the last few lines. Bounded so a very long game can't grow without limit.
const logHistory = [];
function log(msg) {
	logHistory.push(msg);
	if (logHistory.length > 500) logHistory.shift();
	const div = document.createElement('div');
	div.textContent = msg;
	logEl.appendChild(div);
	while (logEl.children.length > 7) logEl.removeChild(logEl.firstChild);
	if (logFull && logFull.classList.contains('open')) appendLogFullLine(msg);
}
const logFull = $('log-full');
const logFullBody = logFull && logFull.querySelector('.lf-body');
function appendLogFullLine(msg) {
	const d = document.createElement('div'); d.textContent = msg; logFullBody.appendChild(d);
	logFullBody.scrollTop = logFullBody.scrollHeight;
}
function renderLogFull() {
	logFullBody.innerHTML = '';
	for (const line of logHistory) { const d = document.createElement('div'); d.textContent = line; logFullBody.appendChild(d); }
	logFullBody.scrollTop = logFullBody.scrollHeight;
}
if (logFull) {
	$('log-btn').addEventListener('click', () => {
		logFull.classList.toggle('open');
		if (logFull.classList.contains('open')) renderLogFull();
	});
	logFull.querySelector('.lf-close').addEventListener('click', () => logFull.classList.remove('open'));
}

// one small projected panel per opponent, rebuilt on new game
const foePanelEls = new Map(); // pi -> element
function panelEl(pi) { return pi === HUMAN ? $('my-panel') : foePanelEls.get(pi); }

// clicking a power orb activates that player's CLASS hero power
function classPowerOf(pi) {
	const p = state.players[pi];
	return p.heroPowers.find(c => c.id === (p.heroClass || '') + '_power')
		|| ((heistRunMode || tombsRunMode || duelsRunMode || arenaRunMode) ? p.heroPowers[0] : null) || null; // heist/tombs/duels/arena alt powers live in slot 0 (for EVERY player — opponents included, so their orb renders instead of leaking onto the table)
}

function activateHeroPower(card, ev) {
	if (!E.canUseHeroPower(state, HUMAN, card)) return;
	if (card.power.choices) { openPowerChoiceMenu(card, ev); return; }
	const spec = E.heroPowerSpec(state, HUMAN, card);
	if (spec) {
		const targets = E.legalTargets(state, HUMAN, spec);
		if (targets.length) { pending = { card, spec, targets, mode: 'power' }; updateHud(); return; }
		if (spec.required) return;
	}
	actPower(card.uid, null);
}

// hero portrait + class power orb, sized per panel
function portraitBlock(pi, big) {
	const wrap = document.createElement('div');
	wrap.className = 'hero-id';
	const p = state.players[pi];
	const portrait = drawHeroPortrait(p.heroClass, big ? 128 : 84);
	portrait.className = 'portrait';
	portrait.style.width = portrait.style.height = big ? '64px' : '42px';
	portrait.title = `${nameOf(pi)} — ${classNameOf(p.heroClass) || 'Classless'}`;
	wrap.appendChild(portrait);
	const power = classPowerOf(pi);
	if (power) {
		const orb = drawPowerOrb(power.power.cost, big ? 96 : 64);
		orb.className = 'power-orb';
		orb.dataset.uid = power.uid;
		orb.style.width = orb.style.height = big ? '48px' : '32px';
		// hover (PC) / long-press (mobile) reveals what the power does
		attachTip(orb, { name: power.name, type: 'heropower', cost: power.power.cost, description: power.description });
		if (pi === HUMAN) {
			if (TOUCH) {
				// a quick tap activates; a hold shows the tooltip instead
				orb.addEventListener('pointerup', ev => {
					ev.stopPropagation();
					if (orb._tipFired) return;
					const card = classPowerOf(HUMAN);
					if (card) activateHeroPower(card, ev);
				});
			} else {
				orb.addEventListener('pointerdown', ev => {
					ev.stopPropagation();
					const card = classPowerOf(HUMAN);
					if (card) activateHeroPower(card, ev);
				});
			}
		}
		wrap.appendChild(orb);
	}
	return wrap;
}

function buildPanels() {
	const cont = $('foe-panels');
	cont.innerHTML = '';
	foePanelEls.clear();
	if (!state) return;
	for (let pi = 0; pi < state.players.length; pi++) {
		if (pi === HUMAN) continue; // HUMAN uses the fixed bottom panel
		const el = document.createElement('div');
		el.className = 'panel foe-sm';
		const cls = state?.classPicks?.[pi]?.name;
		el.innerHTML = `<div class="life"></div><div class="sub"><b>${nameOf(pi)}${cls ? ` (${cls})` : ''}</b> · Mana <span class="mana"></span><br>Hand <span class="hand"></span> · Deck <span class="deck"></span></div><div class="gear"></div>`;
		el.prepend(portraitBlock(pi, false));
		el.addEventListener('pointerdown', () => panelClick(pi));
		cont.appendChild(el);
		foePanelEls.set(pi, el);
	}
	// my panel: swap in a fresh portrait + orb for this game's class
	const mine = $('my-panel');
	mine.querySelector('.hero-id')?.remove();
	mine.prepend(portraitBlock(HUMAN, true));
	const myCls = classNameOf(state.players[HUMAN].heroClass);
	$('my-title').textContent = myCls ? `You — ${myCls}` : 'Your Hero';
	// normal play uses the 3D hero panel; spectators keep the DOM one
	document.body.classList.toggle('threed-hero', !spectateMode);
	if (!spectateMode) drawHeroPanel();
}

// ---------- 3D hero panel (your own hero, rendered in-scene so the hand cards
// depth-sort in front of it — a DOM overlay can't sit behind WebGL cards) ----------
const HP_W = 384, HP_H = 178;
const heroPanelCanvas = document.createElement('canvas');
heroPanelCanvas.width = HP_W; heroPanelCanvas.height = HP_H;
const heroPanelTex = new THREE.CanvasTexture(heroPanelCanvas);
heroPanelTex.colorSpace = THREE.SRGBColorSpace;
const heroPanelMat = new THREE.MeshBasicMaterial({ map: heroPanelTex, transparent: true, depthTest: true, depthWrite: true, alphaTest: 0.3, side: THREE.DoubleSide });
const heroPanelMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.0 * HP_H / HP_W), heroPanelMat);
heroPanelMesh.userData.uid = 'heropanel';
heroPanelMesh.renderOrder = 1;
heroPanelMesh.visible = false;
scene.add(heroPanelMesh);
let heroOrbUV = null; // { x0, x1, y0, y1 } orb rect in 0..1 UV (y from the bottom)

function hpRoundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

// is your own hero a legal target for the spell/attack currently being aimed?
function heroSelfTargetable() {
	if (!state) return false;
	if (pending) return pending.targets.some(t => t.type === 'hero' && t.player === HUMAN);
	if (selectedAttacker === 'HERO') return E.heroAttackTargets(state, HUMAN).some(t => t.type === 'hero' && t.player === HUMAN);
	if (selectedAttacker) { const a = cardOf(selectedAttacker); return !!a && E.attackTargets(state, HUMAN, a).some(t => t.type === 'hero' && t.player === HUMAN); }
	return false;
}

function drawHeroPanel() {
	if (!state) return;
	const me = state.players[HUMAN];
	const ctx = heroPanelCanvas.getContext('2d');
	ctx.clearRect(0, 0, HP_W, HP_H);
	ctx.globalAlpha = me.eliminated ? 0.4 : 1;
	// frame + state-coloured border (red targetable > green armed > gold your-turn)
	const armed = state.current === HUMAN && !state.over && !pending && E.canHeroAttack(state, HUMAN);
	const border = heroSelfTargetable() ? '#ff5f4f' : armed ? '#57e389'
		: (state.current === HUMAN && !state.over) ? '#ffd25f' : (classColorOf(me.heroClass) || '#4a3f6b');
	hpRoundRect(ctx, 6, 6, HP_W - 12, HP_H - 12, 20);
	ctx.fillStyle = 'rgba(30,22,48,0.97)';
	ctx.fill();
	ctx.lineWidth = 4;
	ctx.strokeStyle = border;
	ctx.stroke();
	// portrait + power orb sit in the TOP band of the panel — the hand cards cover
	// only the lower part, so keep the interactive orb up here where it's clickable
	const port = drawHeroPortrait(me.heroClass, 128);
	const pS = 74;
	ctx.drawImage(port, HP_W - pS - 14, 12, pS, pS);
	const power = classPowerOf(HUMAN);
	heroOrbUV = null;
	if (power) {
		const orb = drawPowerOrb(power.power.cost, 96);
		const oS = 58, ox = HP_W - pS - 14 - oS - 8, oy = 16;
		const usable = state.current === HUMAN && !state.over && E.canUseHeroPower(state, HUMAN, power);
		ctx.save();
		if (usable) { ctx.shadowColor = 'rgba(87,227,137,0.95)'; ctx.shadowBlur = 18; }
		ctx.globalAlpha = (me.eliminated ? 0.4 : 1) * (usable ? 1 : 0.5);
		ctx.drawImage(orb, ox, oy, oS, oS);
		ctx.restore();
		heroOrbUV = { x0: ox / HP_W, x1: (ox + oS) / HP_W, y0: 1 - (oy + oS) / HP_H, y1: 1 - oy / HP_H };
	}
	// text column
	ctx.textAlign = 'left';
	ctx.fillStyle = '#ff8a7a';
	ctx.font = 'bold 48px system-ui, sans-serif';
	ctx.fillText(me.life + (me.armor ? `+${me.armor}` : ''), 22, 62);
	ctx.fillStyle = '#e8e2f4';
	ctx.font = '19px system-ui, sans-serif';
	const myCls = classNameOf(me.heroClass);
	ctx.fillText(myCls ? `You — ${myCls}` : 'You', 22, 90);
	ctx.fillStyle = '#cbb8e8';
	ctx.font = '17px system-ui, sans-serif';
	ctx.fillText(`Mana ${E.availableMana(me)}/${me.mana.max}  ·  Deck ${me.deck.length}`, 22, 116);
	// gear line(s)
	const gear = [];
	if (me.weapon) gear.push(`⚔ ${me.weapon.attack}/${me.weapon.durability}`);
	if (me.secrets.length) gear.push(`❓ ${me.secrets.length}`);
	if (me.exile.length) gear.push(`⊘ ${me.exile.length}`);
	if (me.fatigue) gear.push(`☠ ${me.fatigue}`);
	if (me.corpses && me.heroClass === 'death_knight') gear.push(`⚰ ${me.corpses}`);
	if (me.heroTempAttack) gear.push(`⚔ +${me.heroTempAttack}`);
	ctx.fillStyle = '#ffd25f';
	ctx.font = '14px system-ui, sans-serif';
	if (gear.length) ctx.fillText(gear.slice(0, 4).join('   '), 22, 142);
	ctx.globalAlpha = 1;
	heroPanelTex.needsUpdate = true;
}

// keep the panel in sync with async hero-portrait art loads
artListeners.add(() => { if (state && !spectateMode && heroPanelMesh.visible) drawHeroPanel(); });

// raycast just the hero panel; returns the UV hit (for orb vs body) or null
function pickHeroPanelUV(ev) {
	if (!heroPanelMesh.visible) return null;
	pointer.x = (ev.clientX / innerWidth) * 2 - 1;
	pointer.y = -(ev.clientY / innerHeight) * 2 + 1;
	raycaster.setFromCamera(pointer, camera);
	const hit = raycaster.intersectObject(heroPanelMesh)[0];
	return hit ? hit.uv : null;
}
function heroPanelOrbHit(uv) {
	return !!(uv && heroOrbUV && uv.x >= heroOrbUV.x0 && uv.x <= heroOrbUV.x1 && uv.y >= heroOrbUV.y0 && uv.y <= heroOrbUV.y1);
}

// read-only HUD for a watcher: fill both sides' stats, mark whose turn it is,
// and never light up controls or "your turn" affordances
function updateHudSpectate() {
	const label = pi => pi === HUMAN ? spectateName
		: (state.classPicks?.[pi]?.name || `Opponent ${pi}`);
	const gearOf = p => {
		const g = [];
		if (p.weapon) g.push(`⚔ ${p.weapon.name || ''} ${p.weapon.attack}/${p.weapon.durability}`);
		if (p.secrets?.length) g.push(`❓ ${p.secrets.length}`);
		if (p.traps?.length) g.push(`⚠ ${p.traps.length}`);
		if (p.fatigue) g.push(`☠ ${p.fatigue}`);
		if (p.corpses && p.heroClass === 'death_knight') g.push(`⚰ ${p.corpses}`);
		return g;
	};
	const me = state.players[HUMAN];
	$('my-life').textContent = me.life + (me.armor ? `+${me.armor}` : '');
	$('my-mana').textContent = `${E.availableMana(me)}/${me.mana.max}`;
	$('my-deck').textContent = me.deck.length;
	updateManaHud(me);
	$('my-gear').innerHTML = gearOf(me).join('<br>');
	$('my-panel').classList.toggle('turn', state.current === HUMAN && !state.over);
	$('my-panel').classList.toggle('dead', me.eliminated);
	$('my-title').textContent = label(HUMAN);
	for (const [pi, el] of foePanelEls) {
		const p = state.players[pi];
		el.querySelector('.life').textContent = p.life + (p.armor ? `+${p.armor}` : '');
		el.querySelector('.mana').textContent = `${E.availableMana(p)}/${p.mana.max}`;
		el.querySelector('.hand').textContent = p.hand.length;
		el.querySelector('.deck').textContent = p.deck.length;
		el.querySelector('.gear').innerHTML = gearOf(p).join(' · ');
		el.classList.toggle('dead', p.eliminated);
		el.classList.toggle('turn', state.current === pi && !state.over);
	}
	$('end-turn').style.display = 'none';
	$('concede').style.display = 'none';
	$('coin-btn').style.display = 'none';
	$('hint').textContent = state.over
		? `${label(state.winner)} wins!`
		: `${label(state.current)} is playing…`;
}

// bottom-left mana readout — always in the clear, unlike the 3D hero panel's
function updateManaHud(me) {
	const el = $('mana-hud'); if (!el) return;
	const cur = E.availableMana(me), max = me.mana.max;
	$('mana-hud-val').textContent = `${cur}/${max}`;
	el.style.display = 'flex';
	el.classList.toggle('empty', cur === 0);
	el.classList.toggle('tapped', cur > 0 && cur < max);
}

function updateHud() {
	if (!state) return;
	if (spectateMode || replayMode) { updateHudSpectate(); return; }
	// the pinned inspect closes itself once its card leaves play entirely
	if (inspectUid != null && typeof inspectUid !== 'string' && !cardOf(inspectUid)) hideInspect(); // string uids = generated-card previews, not board cards
	const me = state.players[HUMAN];
	$('my-life').textContent = me.life + (me.armor ? `+${me.armor}` : '');
	$('my-mana').textContent = `${E.availableMana(me)}/${me.mana.max}`;
	$('my-deck').textContent = me.deck.length;
	updateManaHud(me);
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
	// class power orb: glow when usable, grey out when spent/unaffordable
	const myOrb = $('my-panel').querySelector('.power-orb');
	if (myOrb) {
		const power = classPowerOf(HUMAN);
		const usable = power && state.current === HUMAN && !state.over && E.canUseHeroPower(state, HUMAN, power);
		myOrb.classList.toggle('usable', !!usable);
		myOrb.classList.toggle('spent', !usable);
	}
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
	const pwOk = E.canPlaneswalk(state, HUMAN);
	$('planeswalk-btn').style.display = pwOk ? '' : 'none';
	if (pwOk) { const rc = E.planarRollCost(state, HUMAN); $('planeswalk-btn').textContent = rc > 0 ? `Planeswalk (${rc})` : 'Planeswalk'; }
	// concede is available in any active game you're playing (runs, Quick Match, AI,
	// duels) — but not while merely spectating someone else's match
	$('concede').style.display = state && !state.over && !spectateMode ? '' : 'none';
	const myTurn = state.current === HUMAN && !state.over;
	$('end-turn').disabled = !myTurn;
	$('end-turn').textContent = state.over ? 'Game Over'
		: myTurn ? 'End Turn'
		: state.current === HUMAN ? 'Your Turn…' : `${nameOf(state.current)}'s Turn…`;
	$('hint').textContent = pending
		? `Choose ${pending.spec.why} for ${pending.card.name} (right-click to cancel)`
		: (selectedAttacker === 'HERO' ? 'Choose a target for your hero attack (right-click to cancel)'
			: selectedAttacker ? 'Choose an attack target (right-click to cancel)' : '');
	if (!spectateMode) drawHeroPanel(); // repaint the in-scene hero panel texture
}

// projected screen positions + hero-target highlighting, refreshed per frame
function positionPanels() {
	if (!state) return;
	for (const [pi, el] of foePanelEls) {
		const v = heroPos(pi).project(camera);
		el.style.left = `${(v.x + 1) / 2 * innerWidth}px`;
		el.style.top = `${(1 - v.y) / 2 * innerHeight}px`;
	}
	// your own hero panel is a 3D object in the scene (billboarded to the camera),
	// sitting between your land row and hand so the hand cards depth-sort in front
	if (!spectateMode) {
		if (state.current === HUMAN && lastCurrent !== HUMAN) handMini = false; // a fresh turn raises your hand
		lastCurrent = state.current;
		heroPanelMesh.visible = true;
		heroPanelMesh.position.copy(toWorld(0, 0.92, sliceOff() + 5.15, HUMAN));
		heroPanelMesh.quaternion.copy(camera.quaternion);
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

// ---------- Hearthstone-style targeting arrow ----------
// a fullscreen 2D overlay: while an attacker or a targeted card is armed, a
// chevron arrow curves from the source to the cursor, redrawn every frame
const arrowCanvas = document.createElement('canvas');
arrowCanvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:45;';
document.body.appendChild(arrowCanvas);
let mouseX = innerWidth / 2, mouseY = innerHeight / 2;
let arrowDrawn = false;

function targetSourcePos() {
	if (selectedAttacker === 'HERO') return heroPos(HUMAN);
	if (selectedAttacker) return creaturePos(selectedAttacker);
	if (pending) {
		// hand cards / table cards have entities; the class power lives in the panel
		if (entities.has(pending.card.uid)) return creaturePos(pending.card.uid);
		return heroPos(HUMAN);
	}
	return null;
}

function drawTargetArrow() {
	const src = targetSourcePos();
	const ctx = arrowCanvas.getContext('2d');
	if (!src) {
		if (arrowDrawn) { ctx.clearRect(0, 0, arrowCanvas.width, arrowCanvas.height); arrowDrawn = false; }
		return;
	}
	if (arrowCanvas.width !== innerWidth || arrowCanvas.height !== innerHeight) {
		arrowCanvas.width = innerWidth;
		arrowCanvas.height = innerHeight;
	}
	ctx.clearRect(0, 0, arrowCanvas.width, arrowCanvas.height);
	arrowDrawn = true;
	const v = src.project(camera);
	const sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight;
	const dist = Math.hypot(mouseX - sx, mouseY - sy);
	if (dist < 30) return;
	// quadratic bezier arced toward the top of the screen
	const mx = (sx + mouseX) / 2, my = (sy + mouseY) / 2 - Math.min(160, dist * 0.35);
	const P = t => ({
		x: (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * mx + t * t * mouseX,
		y: (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * my + t * t * mouseY,
	});
	// resample to arc length so the chevrons stay evenly spaced
	const pts = [];
	let prev = P(0), acc = 0;
	pts.push({ x: prev.x, y: prev.y, d: 0 });
	for (let i = 1; i <= 60; i++) {
		const p = P(i / 60);
		acc += Math.hypot(p.x - prev.x, p.y - prev.y);
		pts.push({ x: p.x, y: p.y, d: acc });
		prev = p;
	}
	const total = acc;
	const at = d => {
		for (let i = 1; i < pts.length; i++) {
			if (pts[i].d >= d) {
				const a = pts[i - 1], b = pts[i];
				const t = (d - a.d) / Math.max(1e-6, b.d - a.d);
				return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
					ang: Math.atan2(b.y - a.y, b.x - a.x) };
			}
		}
		const a = pts[pts.length - 2], b = pts[pts.length - 1];
		return { x: b.x, y: b.y, ang: Math.atan2(b.y - a.y, b.x - a.x) };
	};
	ctx.shadowColor = 'rgba(255,60,40,0.55)';
	ctx.shadowBlur = 12;
	// marching chevron chain (the pulse makes them crawl toward the target)
	const headLen = 30, step = 34;
	const pulse = (performance.now() / 900) % 1;
	for (let d = 22 + pulse * step; d < total - headLen - 14; d += step) {
		const p = at(d);
		ctx.save();
		ctx.translate(p.x, p.y);
		ctx.rotate(p.ang);
		ctx.beginPath();
		ctx.moveTo(-9, -11);
		ctx.lineTo(5, 0);
		ctx.lineTo(-9, 11);
		ctx.lineTo(-3, 0);
		ctx.closePath();
		ctx.fillStyle = '#d83a2e';
		ctx.fill();
		ctx.strokeStyle = 'rgba(60,0,0,0.9)';
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.restore();
	}
	// arrowhead pinned to the cursor
	const h = at(total - 1);
	ctx.save();
	ctx.translate(h.x, h.y);
	ctx.rotate(h.ang);
	ctx.beginPath();
	ctx.moveTo(10, 0);
	ctx.lineTo(-headLen, -19);
	ctx.lineTo(-headLen * 0.55, 0);
	ctx.lineTo(-headLen, 19);
	ctx.closePath();
	ctx.fillStyle = '#e8483a';
	ctx.fill();
	ctx.strokeStyle = 'rgba(60,0,0,0.95)';
	ctx.lineWidth = 2.5;
	ctx.stroke();
	ctx.restore();
	// socket over the source
	ctx.beginPath();
	ctx.arc(sx, sy, 9, 0, Math.PI * 2);
	ctx.fillStyle = 'rgba(216,58,46,0.85)';
	ctx.fill();
	ctx.strokeStyle = 'rgba(60,0,0,0.9)';
	ctx.lineWidth = 2;
	ctx.stroke();
	ctx.shadowBlur = 0;
}

// ---------- event animation queue ----------
const queue = [];
let queueBusy = false;

// AI-owned scry/gaze decisions resolve immediately (Morbid can queue them
// off-turn); only human decisions wait for the modal
function resolveAIScries() {
	while (state.scryQueue.length && isAiSeat(state.scryQueue[0].chooser)) {
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
	resolveAIAsks();
	resolveAISacs();
	resolveAIDredges();
	resolveAIResponds();
	// FFA: if the just-applied action — or any AI queue-resolution above — left the
	// active player eliminated, hand the turn on now (before events flush / the AI
	// driver re-arms). A no-op in 1v1/solo, where a self-elimination ends the game.
	E.settleTurn(state);
	queue.push(...E.takeEvents(state));
	if (!queueBusy) nextEvent();
}

// AI discards: end-of-turn cleanup keeps the bombs and sheds chaff (AI.cleanupDiscardUids);
// loot/other discards dump the most expensive (least castable) card.
function resolveAIDiscards() {
	while (state.discardQueue.length && isAiSeat(state.discardQueue[0].player)) {
		const pend = state.discardQueue[0];
		const p = state.players[pend.player];
		const picks = pend.cleanup
			? AI.cleanupDiscardUids(p, pend.count)
			: [...p.hand].sort((a, b) => b.cost - a.cost).slice(0, pend.count).map(c => c.uid);
		E.resolveDiscard(state, picks);
	}
}

function resolveAISacs() {
	while (state.sacQueue.length && isAiSeat(state.sacQueue[0].player)) {
		const pend = state.sacQueue[0];
		const p = state.players[pend.player];
		// sacrifice the cheapest eligible permanent (prefer tokens/Treasures)
		const pool = pend.uids.map(u => p.board.find(c => c.uid === u) || p.artifacts.find(c => c.uid === u)).filter(Boolean);
		const pick = pool.sort((a, b) => (a.token ? -1 : 0) - (b.token ? -1 : 0) || (a.cost || 0) - (b.cost || 0))[0];
		E.resolveSac(state, pick ? pick.uid : (pend.uids[0]));
	}
}

// AI counters an impactful pending spell (cost >= 3) if it holds a Counter
function resolveAIResponds() {
	while (state.priority != null && isAiSeat(state.priority) && !state.players[state.priority].eliminated) {
		const pi = state.priority;
		E.resolveResponse(state, pi, aiChooseResponse(state, pi));
	}
}

// value-driven instant-speed decision: counter worthwhile spells, blow out an attack
// by killing the attacker, remove a real threat — always with the cheapest source.
function aiChooseResponse(state, pi) {
	const p = state.players[pi];
	const top = E.pendingSpellFor(state, pi);
	const crHp = c => c.maxHealth - (c.damage || 0);
	const dmgOf = fx => (fx || []).filter(e => e.type === 'damage' && (e.target === 'creature' || e.target === 'any')).reduce((a, e) => a + (e.value || 0), 0);

	// 1) counter a spell that is expensive, or aimed at us
	const counters = E.counterOptions(state, pi);
	if (counters.length && top && top.kind === 'spell') {
		const cost = top.card.cost || 0, t = top.target;
		if (cost >= 3 || (t && t.player === pi && cost >= 1)) return { kind: 'spell', uid: counters[0].uid };
	}

	// gather my instant-speed damage sources (instants + creature abilities), cheapest first
	const sources = [];
	for (const c of E.responseOptions(state, pi)) { const d = c.counterSpell ? 0 : dmgOf(c.effects); if (d > 0) sources.push({ act: { kind: 'spell', uid: c.uid }, dmg: d, cost: E.effectiveCost(state, pi, c) }); }
	for (const c of p.board) if (c.activated) c.activated.forEach((a, i) => { if (E.canActivate(state, pi, c, i)) { const d = dmgOf(a.effects); if (d > 0) sources.push({ act: { kind: 'ability', uid: c.uid, index: i }, dmg: d, cost: a.cost || 0 }); } });
	sources.sort((a, b) => a.cost - b.cost || a.dmg - b.dmg);
	const killer = need => sources.find(s => s.dmg >= need);

	// 2) defending an attack: kill the attacker to blow out the swing
	if (top && top.kind === 'attack') {
		let atkr = null;
		for (const o of state.players) if (o !== p) { const c = o.board.find(x => x.uid === top.attackerUid); if (c) atkr = c; }
		if (atkr) { const s = killer(crHp(atkr)); if (s) return { ...s.act, target: { type: 'creature', uid: atkr.uid } }; }
	}

	// 3) kill the biggest worthwhile enemy creature we can
	let best = null;
	for (const o of state.players) if (o !== p) for (const cr of o.board) {
		if (cr.type !== 'creature') continue;
		const worth = cr.attack + cr.maxHealth;
		if (worth < 5) continue;
		const s = killer(crHp(cr));
		if (s && (!best || worth > best.worth)) best = { act: s.act, uid: cr.uid, worth };
	}
	if (best) return { ...best.act, target: { type: 'creature', uid: best.uid } };
	return null; // hold priority
}

let autoPass = true;
let respondTimer = null;
let respondSig = null;

function clearRespondTimer() { if (respondTimer) { clearInterval(respondTimer); respondTimer = null; } }

function doRespondPass() {
	clearRespondTimer();
	respondSig = null;
	$('scry-modal').style.display = 'none';
	if (state.priority !== HUMAN) return;
	if (isGuest()) { guestApply(() => E.resolveResponse(state, HUMAN, null), { k: 'respond', action: null }); return; }
	E.resolveResponse(state, HUMAN, null); pump(); if (duel.on) publishDuel();
}

function submitRespond(action) {
	clearRespondTimer();
	respondSig = null;
	$('scry-modal').style.display = 'none';
	if (isGuest()) { guestApply(() => E.resolveResponse(state, HUMAN, action), { k: 'respond', action }); return; }
	E.resolveResponse(state, HUMAN, action); pump(); if (duel.on) publishDuel();
}

// the instant-speed responses the human could take right now
function respondOptions() {
	const me = state.players[HUMAN];
	const out = [];
	for (const c of E.responseOptions(state, HUMAN)) {
		const verb = c.counterSpell ? 'Counter' : 'Cast';
		if (c.altCost && E.canPayAlt(state, HUMAN, c)) {
			if (E.canPayMana(state, HUMAN, c)) out.push({ kind: 'spell', card: c, useAlt: false, label: `${verb} ${c.name} (${E.effectiveCost(state, HUMAN, c)})` });
			out.push({ kind: 'spell', card: c, useAlt: true, label: `${verb} ${c.name} — ${c.altCost.label}` });
		} else if (c.kicker && E.canKick(state, HUMAN, c)) {
			out.push({ kind: 'spell', card: c, kicked: false, label: `${verb} ${c.name} (${E.effectiveCost(state, HUMAN, c)})` });
			out.push({ kind: 'spell', card: c, kicked: true, label: `${verb} ${c.name} + kicker (${E.effectiveCost(state, HUMAN, c) + c.kicker.cost})` });
		} else {
			out.push({ kind: 'spell', card: c, useAlt: false, label: `${verb} ${c.name} (${E.effectiveCost(state, HUMAN, c)})` });
		}
	}
	for (const c of me.board) if (c.activated) c.activated.forEach((a, i) => { if (E.canActivate(state, HUMAN, c, i)) out.push({ kind: 'ability', card: c, index: i, label: `${c.name}: ${a.text || 'ability'}` }); });
	for (const l of [...me.lands, ...me.board.filter(x => x.type === 'location')]) E.landTaps(l).forEach((t, i) => { if (t.effects.some(e => e.type !== 'gain-mana') && E.canTapLand(state, HUMAN, l, i)) out.push({ kind: 'landtap', card: l, index: i, label: `${l.name}: ${t.text}` }); });
	return out;
}

function openRespondModal() {
	if (!state || state.priority !== HUMAN) return;
	const opts = respondOptions();
	if (autoPass || !opts.length) { doRespondPass(); return; }
	const top = state.stack[state.stack.length - 1];
	const sig = top ? top.uid + ':' + opts.length : null;
	if (sig === respondSig) return; // already showing this window
	respondSig = sig;
	const pend = E.pendingSpellFor(state, HUMAN);
	const modal = $('scry-modal');
	let secs = 4;
	const titleText = () => `${pend ? nameOf(pend.caster) + ' acts — respond?' : 'Respond?'} (${secs}s)`;
	modal.innerHTML = `<div class="wm-title" id="respond-title">${titleText()}</div><div class="scry-row" style="flex-wrap:wrap"></div>`;
	const row = modal.querySelector('.scry-row');
	const act = (o) => {
		// modal instant cast in response (Cryptic Command): pick modes, then target if needed
		if (o.kind === 'spell' && o.card.choices && (o.card.chooseCount > 1 || o.card.chooseMax)) {
			clearRespondTimer(); respondSig = null; modal.style.display = 'none';
			openMultiChoiceMenu(o.card, null, undefined, modes => continueModalRespond(o.card, modes));
			return;
		}
		const spec = o.kind === 'spell'
			? (o.card.counterSpell ? null : E.targetSpec(state, HUMAN, o.card))
			: o.kind === 'ability' ? E.abilitySpec(state, HUMAN, o.card, o.index)
			: E.tapSpec(state, HUMAN, o.card, o.index);
		if (spec) {
			const targets = E.legalTargets(state, HUMAN, spec);
			if (targets.length) { clearRespondTimer(); respondSig = null; modal.style.display = 'none'; pending = { card: o.card, spec, targets, mode: 'respond', action: { kind: o.kind, uid: o.card.uid, index: o.index, useAlt: o.useAlt, kicked: o.kicked } }; updateHud(); return; }
			if (spec.required) return;
		}
		submitRespond({ kind: o.kind, uid: o.card.uid, index: o.index, target: null, useAlt: o.useAlt, kicked: o.kicked });
	};
	opts.forEach(o => {
		const btn = document.createElement('button'); btn.className = 'scry-done'; btn.style.margin = '4px'; btn.textContent = o.label;
		btn.addEventListener('pointerdown', e => { e.stopPropagation(); act(o); });
		row.appendChild(btn);
	});
	const pass = document.createElement('button'); pass.className = 'scry-done'; pass.style.margin = '4px'; pass.style.background = '#555'; pass.textContent = 'Pass';
	pass.addEventListener('pointerdown', e => { e.stopPropagation(); doRespondPass(); });
	row.appendChild(pass);
	modal.style.display = 'block';
	clearRespondTimer();
	respondTimer = setInterval(() => { secs--; const t = document.getElementById('respond-title'); if (t) t.textContent = titleText(); if (secs <= 0) doRespondPass(); }, 1000);
}

// AI Discover/Draft picks: take the biggest card
function resolveAIPicks() {
	while (state.pickQueue.length && isAiSeat(state.pickQueue[0].player)) {
		const pend = state.pickQueue[0];
		if (pend.mode === 'adapt') { E.resolvePick(state, bestAdaptId(pend)); continue; }
		const best = [...pend.ids].sort((a, b) => (state.cardsById[b]?.cost || 0) - (state.cardsById[a]?.cost || 0))[0];
		E.resolvePick(state, best);
	}
}

// AI Adapt: value each rolled option and take the strongest
function bestAdaptId(pend) {
	const score = e => (e.attack || 0) + (e.health || 0) + (e.keyword ? 3 : 0) + (e.deathrattle ? 3 : 0);
	return [...pend.ids].sort((a, b) => score(E.ADAPT_TABLE[Number(b)]) - score(E.ADAPT_TABLE[Number(a)]))[0];
}

// AI optional "you may …" prompts: the AI takes the beneficial option (yes)
function resolveAIAsks() {
	while (state.askQueue.length && isAiSeat(state.askQueue[0].player)) {
		E.resolveAsk(state, true);
	}
}

// AI Dredge: put the biggest card from the bottom three onto the deck
function resolveAIDredges() {
	while (state.dredgeQueue.length && isAiSeat(state.dredgeQueue[0].player)) {
		const pend = state.dredgeQueue[0];
		const best = [...pend.ids].sort((a, b) => (state.cardsById[b]?.cost || 0) - (state.cardsById[a]?.cost || 0))[0];
		E.resolveDredge(state, best);
	}
}

function openDredgeModal() {
	const pend = state.dredgeQueue[0];
	if (!pend || pend.player !== HUMAN) return;
	const modal = $('scry-modal'); // reuse the scry chrome
	modal.innerHTML = `<div class="wm-title">Dredge — put one on top of your deck</div><div class="scry-row"></div>`;
	const row = modal.querySelector('.scry-row');
	pend.ids.forEach(id => {
		const def = state.cardsById[id];
		const cell = document.createElement('div');
		cell.className = 'scry-cell';
		const face = drawCardFace(def);
		face.style.width = '130px';
		cell.appendChild(face);
		const btn = document.createElement('button');
		btn.textContent = 'To top';
		btn.addEventListener('pointerdown', e => {
			e.stopPropagation();
			modal.style.display = 'none';
			if (isGuest()) { guestApply(() => E.resolveDredge(state, id), { k: 'dredge', id }); return; }
			E.resolveDredge(state, id);
			pump();
			if (duel.on) publishDuel();
		});
		cell.appendChild(btn);
		row.appendChild(cell);
	});
	modal.style.display = 'block';
}

function openPickModal() {
	const pend = state.pickQueue[0];
	if (!pend || pend.player !== HUMAN) return;
	const modal = $('scry-modal'); // reuse the scry chrome
	if (pend.mode === 'advance') {
		// Advance (Venture into the Dungeon): choose a dungeon to enter, or which branch room to take
		const title = pend.advance === 'enter' ? 'Advance — choose a dungeon' : 'Advance — choose the next room';
		modal.innerHTML = `<div class="wm-title">${title}</div><div class="scry-row"></div>`;
		const row = modal.querySelector('.scry-row');
		pend.ids.forEach(id => {
			let label;
			if (pend.advance === 'enter') { const d = E.DUNGEONS[id]; label = `<b>${(d && d.name) || id}</b>`; }
			else { const r = E.DUNGEONS[pend.dungeonId] && E.DUNGEONS[pend.dungeonId].rooms[id]; label = `<b>${(r && r.name) || id}</b><br><span style="font-size:.85em">${(r && r.text) || ''}</span>`; }
			const cell = document.createElement('div');
			cell.className = 'scry-cell';
			cell.innerHTML = `<div class="adapt-opt">${label}</div>`;
			const btn = document.createElement('button');
			btn.textContent = 'Choose';
			btn.addEventListener('pointerdown', e => {
				e.stopPropagation();
				modal.style.display = 'none';
				if (isGuest()) { guestApply(() => E.resolvePick(state, id), { k: 'pick', id }); return; }
				E.resolvePick(state, id);
				pump();
				if (duel.on) publishDuel();
			});
			cell.appendChild(btn);
			row.appendChild(cell);
		});
		modal.style.display = 'block';
		return;
	}
	if (pend.mode === 'adapt') {
		// Adapt: three rolled upgrades (labels, not cards) — choose one
		modal.innerHTML = `<div class="wm-title">Adapt — choose one</div><div class="scry-row"></div>`;
		const row = modal.querySelector('.scry-row');
		pend.ids.forEach(id => {
			const entry = E.ADAPT_TABLE[Number(id)];
			const cell = document.createElement('div');
			cell.className = 'scry-cell';
			cell.innerHTML = `<div class="adapt-opt">${entry ? entry.label : '?'}</div>`;
			const btn = document.createElement('button');
			btn.textContent = 'Choose';
			btn.addEventListener('pointerdown', e => {
				e.stopPropagation();
				modal.style.display = 'none';
				if (isGuest()) { guestApply(() => E.resolvePick(state, id), { k: 'pick', id }); return; }
				E.resolvePick(state, id);
				pump();
				if (duel.on) publishDuel();
			});
			cell.appendChild(btn);
			row.appendChild(cell);
		});
		modal.style.display = 'block';
		return;
	}
	modal.innerHTML = `<div class="wm-title">${pend.title || (pend.ids.length > 3 ? 'Draft' : 'Discover')} — take one</div><div class="scry-row"></div>`;
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
			if (isGuest()) { guestApply(() => E.resolvePick(state, id), { k: 'pick', id }); return; }
			E.resolvePick(state, id);
			pump();
			if (duel.on) publishDuel();
		});
		cell.appendChild(btn);
		row.appendChild(cell);
	});
	modal.style.display = 'block';
}

// ---------- opening-hand mulligan ----------
// Offered once, at the start of YOUR first turn, before you act. Tap cards to
// mark them for a swap, then confirm. Works for the host (seat 0), a guest (its
// own seat, relayed), and every AI seat (auto-resolved by the host).
let mulliganModalOpen = false;
let mulliganPicks = null;
// mulligan is a Quick Match / AI / duel feature; the PvE run modes keep their
// tuned openings (boss decks, treasures) untouched.
const mulliganEnabled = () => !dungeonRunMode && !heistRunMode && !tombsRunMode && !duelsRunMode && !arenaRunMode;
function maybeOfferMulligan() {
	if (!state || state.over || spectateMode || !mulliganEnabled()) return;
	if (duel.on && duel.role === 'guest') return;  // the guest surfaces it via openDuelModals
	if (mulliganModalOpen) return;
	if (queue.length || queueBusy) return;         // wait for the opening animation to settle
	const me = state.players[HUMAN];
	if (!me || me.mulliganed || me.eliminated) return;
	if (state.current !== HUMAN) return;           // only on your own turn (its start)
	if (pending) return;                            // not mid-targeting
	// resolve any pending decision (scry/loot/discover/counter) first
	if (state.scryQueue.length || state.pickQueue.length || state.discardQueue.length
		|| state.askQueue.length || state.sacQueue.length || state.dredgeQueue.length || state.priority != null) return;
	openMulliganModal();
}
function openMulliganModal() {
	const me = state.players[HUMAN];
	const cards = me.hand.filter(c => c.id !== 'coin'); // the Coin can't be mulliganed
	if (!cards.length) { doMulligan([]); return; } // nothing to swap — auto-keep (relays if guest)
	mulliganModalOpen = true;
	mulliganPicks = new Set();
	const modal = $('scry-modal');
	const render = () => {
		modal.innerHTML = `<div class="wm-title">Mulligan — tap cards to swap, then confirm</div><div class="scry-row mull-row"></div><div class="mull-actions"></div>`;
		const row = modal.querySelector('.scry-row');
		cards.forEach(c => {
			const def = state.cardsById[c.id] || c;
			const swap = mulliganPicks.has(c.uid);
			const cell = document.createElement('div');
			cell.className = 'scry-cell' + (swap ? ' mull-swap' : '');
			const face = drawCardFace(def);
			face.style.width = '104px';
			cell.appendChild(face);
			const tag = document.createElement('div');
			tag.className = 'mull-tag';
			tag.textContent = swap ? '↺ Swap' : 'Keep';
			cell.appendChild(tag);
			cell.addEventListener('pointerdown', e => { e.stopPropagation(); if (swap) mulliganPicks.delete(c.uid); else mulliganPicks.add(c.uid); render(); });
			row.appendChild(cell);
		});
		const actions = modal.querySelector('.mull-actions');
		const confirm = document.createElement('button');
		confirm.textContent = mulliganPicks.size ? `Mulligan ${mulliganPicks.size}` : 'Keep hand';
		confirm.addEventListener('pointerdown', e => { e.stopPropagation(); doMulligan([...mulliganPicks]); });
		actions.appendChild(confirm);
	};
	render();
	modal.style.display = 'block';
}
function doMulligan(uids) {
	$('scry-modal').style.display = 'none';
	mulliganModalOpen = false;
	if (isGuest()) return guestApply(() => E.mulligan(state, HUMAN, uids), { k: 'mulligan', uids });
	E.mulligan(state, HUMAN, uids); pump(); if (duel.on) publishDuel();
}
// AI mulligan heuristic: toss the clunky top of the curve (cost >= 5) so the
// bots keep a playable early hand; the Coin is never tossed (mulligan skips it).
function aiMulliganUids(pi) {
	const p = state.players[pi];
	return p.hand.filter(c => c.id !== 'coin' && (c.cost || 0) >= 5).map(c => c.uid);
}

// optional "you may …" prompt: a centered yes/no using the decision popup
function openAskModal() {
	const pend = state.askQueue[0];
	if (!pend || pend.player !== HUMAN) return;
	const menu = $('walker-menu');
	menu.innerHTML = `<div class="wm-title">${pend.prompt || 'Choose:'}</div>`;
	const mk = (label, yes) => {
		const btn = document.createElement('button');
		btn.textContent = label;
		btn.addEventListener('pointerdown', e => {
			e.stopPropagation();
			hideWalkerMenu();
			if (isGuest()) { guestApply(() => E.resolveAsk(state, yes), { k: 'ask', yes }); return; }
			E.resolveAsk(state, yes);
			pump();
			if (duel.on) publishDuel();
		});
		menu.appendChild(btn);
	};
	mk(pend.yes || 'Yes', true);
	mk(pend.no || 'No', false);
	showDecisionMenu();
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
		if (isGuest()) { const picks = [...chosen]; guestApply(() => E.resolveDiscard(state, picks), { k: 'discard', picks }); return; }
		E.resolveDiscard(state, [...chosen]);
		pump();
		if (duel.on) publishDuel();
	});
	modal.appendChild(done);
	sync();
	modal.style.display = 'block';
}

// sacrifice-as-cost: pick one of your permanents to sacrifice (Reckless Abandon, Deadly Dispute)
function openSacModal() {
	const pend = state.sacQueue[0];
	if (!pend || pend.player !== HUMAN) return;
	const me = state.players[HUMAN];
	const pool = pend.uids.map(u => me.board.find(c => c.uid === u) || me.artifacts.find(c => c.uid === u)).filter(Boolean);
	if (!pool.length) { E.resolveSac(state, pend.uids[0]); pump(); if (duel.on) publishDuel(); return; }
	const label = pend.kind === 'artifact-or-creature' ? 'a permanent' : (pend.kind === 'artifact' ? 'an artifact' : 'a creature');
	const modal = $('scry-modal');
	modal.innerHTML = `<div class="wm-title">Sacrifice ${label}</div><div class="scry-row"></div>`;
	const row = modal.querySelector('.scry-row');
	const commit = uid => {
		modal.style.display = 'none';
		if (isGuest()) { guestApply(() => E.resolveSac(state, uid), { k: 'sac', uid }); return; }
		E.resolveSac(state, uid); pump(); if (duel.on) publishDuel();
	};
	pool.forEach(card => {
		const cell = document.createElement('div');
		cell.className = 'scry-cell';
		const face = drawCardFace(card);
		face.style.width = '110px';
		cell.appendChild(face);
		const btn = document.createElement('button');
		btn.textContent = 'Sacrifice';
		btn.className = 'scry-done';
		btn.addEventListener('pointerdown', e => { e.stopPropagation(); commit(card.uid); });
		cell.appendChild(btn);
		row.appendChild(cell);
	});
	modal.style.display = 'block';
}

function nextEvent() {
	const ev = queue.shift();
	if (!ev) { queueBusy = false; updateHud(); if (!isGuest()) maybeRecordFrame(); if (state && state.priority === HUMAN) openRespondModal(); maybeOfferMulligan(); maybeRunAI(); return; } // a duel guest records authoritative snapshots on ingest, not its optimistic pumps
	queueBusy = true;
	let delay = 120;
	switch (ev.type) {
		case 'turnStart':
			if (ev.turnNumber === 1 || !matchStats) resetMatchStats(); // new match → fresh tally
			matchStats.turns = Math.max(matchStats.turns, ev.turnNumber || 0);
			banner(ev.player === HUMAN ? 'Your Turn' : `${nameOf(ev.player)}'s Turn`);
			log(`— Turn ${ev.turnNumber}: ${nameOf(ev.player)} —`);
			delay = 500;
			break;
		case 'draw':
			delay = ev.player === HUMAN ? 180 : 90;
			break;
		case 'joust': {
			const mine = ev.myName ? `${ev.myName} (${ev.myCost})` : 'nothing';
			const theirs = ev.enemyName ? `${ev.enemyName} (${ev.enemyCost})` : 'nothing';
			log(`${nameOf(ev.player)} Jousts: ${mine} vs ${theirs} — ${ev.win ? 'won!' : 'lost'}`);
			delay = 480;
			break;
		}
		case 'play':
			if (matchStats) statInc(matchStats.cards, ev.player);
			log(`${nameOf(ev.player)} played ${ev.card.name}`);
			delay = 420;
			break;
		case 'summon':
			if (matchStats) statInc(matchStats.summons, ev.player);
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
			if (matchStats && ev.targetType === 'hero') statInc(matchStats.heroDmgTaken, ev.player, ev.amount || 0);
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
		case 'paralyzed': floatText('⚡', '#c9a0ff', creaturePos(ev.uid)); log(`${ev.name} is Paralyzed!`); delay = 300; break;
		case 'attackFizzled': floatText('MISS', '#c9a0ff', creaturePos(ev.attackerUid)); log(`${ev.name}'s attack fizzled (Paralyzed)!`); delay = 320; break;
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
		case 'equipAttached':
			log(`${nameOf(ev.player)} equipped ${ev.name}`);
			delay = 200;
			break;
		case 'weaponEquip':
			log(`${nameOf(ev.player)} equipped ${ev.card.name} (${ev.card.attack}/${ev.card.durability})`);
			delay = 320;
			break;
		case 'weaponDurability': delay = 60; break;
		case 'locationDurability': {
			const ent = entities.get(ev.uid);
			if (ent) refreshFace(ent);
			delay = 120;
			break;
		}
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
		case 'locationPlayed':
			log(`${nameOf(ev.player)} opened ${ev.card.name}`);
			delay = 350;
			break;
		case 'manaGained': delay = 120; break;
		case 'coinGiven': log(`${nameOf(ev.player)} got The Coin`); delay = 120; break;
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
		case 'excavated': {
			const exTiers = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
			log(`${nameOf(ev.player)} excavated a ${exTiers[ev.tier] || ''} treasure`);
			delay = 300;
			break;
		}
		case 'planeshifted':
			log(`${nameOf(ev.player)} planeshifted the arena to ${ev.name}`);
			delay = 500;
			break;
		case 'planarRoll': {
			const face = ev.roll === 6 ? 'Planeswalker — new plane!' : ev.roll === 5 ? 'Chaos!' : 'nothing';
			log(`${nameOf(ev.player)} rolls the planar die: ${ev.roll} (${face})`);
			delay = 550;
			break;
		}
		case 'sparked':
			log(`${nameOf(ev.player)} Sparked — the planar die is unlocked`);
			delay = 300;
			break;
		case 'coinParity':
			log(`${nameOf(ev.player)} can't play ${ev.block}-cost cards this turn`);
			delay = 300;
			break;
		case 'lootStart':
			log(`${nameOf(ev.player)} loots (${ev.count})`);
			if (ev.player === HUMAN) openDiscardModal();
			delay = 300;
			break;
		case 'traded':
			log(`${nameOf(ev.player)} traded ${ev.player === HUMAN ? ev.card.name : 'a card'} back into their deck`);
			delay = 300;
			break;
		case 'abilityUsed':
			log(`${nameOf(ev.player)}'s ${ev.card.name}: ${ev.text}`);
			delay = 320;
			break;
		case 'pickStart':
			log(`${nameOf(ev.player)} ${ev.count > 3 ? 'drafts' : 'discovers'} (${ev.count} options)`);
			if (ev.player === HUMAN) openPickModal();
			delay = 300;
			break;
		case 'adaptOffer':
			log(`${nameOf(ev.player)} Adapts (3 options)`);
			if (ev.player === HUMAN) openPickModal();
			delay = 300;
			break;
		case 'askStart':
			if (ev.player === HUMAN) openAskModal();
			delay = 200;
			break;
		case 'sacStart':
			if (ev.player === HUMAN) openSacModal();
			delay = 200;
			break;
		case 'dredgeStart':
			log(`${nameOf(ev.player)} dredges (${ev.count})`);
			if (ev.player === HUMAN) openDredgeModal();
			delay = 300;
			break;
		case 'dredgeDone':
			if (ev.player === HUMAN) log(`You put ${state.cardsById[ev.id]?.name || 'a card'} on top of your deck`);
			delay = 250;
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
			// class powers live in the panel, not on the table
			floatText('✦', '#ffd25f', entities.has(ev.card.uid) ? creaturePos(ev.card.uid) : heroPos(ev.player));
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
		case 'stackPush':
			log(ev.kind === 'attack' ? `${nameOf(ev.player)} attacks — respond?`
				: ev.kind === 'ability' ? `${nameOf(ev.player)} uses ${ev.card ? ev.card.name : 'an ability'} — on the stack`
				: ev.kind === 'landtap' ? `${nameOf(ev.player)} taps ${ev.card ? ev.card.name : 'a land'} — on the stack`
				: ev.kind === 'heropower' ? `${nameOf(ev.player)} uses a Hero Power — on the stack`
				: `${nameOf(ev.player)} casts ${ev.card ? ev.card.name : 'a spell'} — on the stack`);
			if (state.priority === HUMAN) openRespondModal();
			delay = 300;
			break;
		case 'countered': log(`${ev.name} was countered!`); delay = 400; break;
		case 'overload': log(`${nameOf(ev.player)} overloaded: ${ev.amount} mana locked next turn`); delay = 250; break;
		case 'overloaded': log(`${nameOf(ev.player)} ${ev.player === HUMAN ? 'have' : 'has'} ${ev.amount} mana locked (overload)`); delay = 300; break;
		case 'armor': floatText(`+${ev.amount}`, '#c9c2da', heroPos(ev.player)); delay = 260; break;
		case 'bounce': log(`${ev.name} was returned to hand`); delay = 300; break;
		case 'coin': log(`${nameOf(ev.player)} played The Coin (+1 mana)`); delay = 250; break;
		case 'reshuffle': log(`${ev.player === HUMAN ? 'Your' : `${nameOf(ev.player)}'s`} graveyard was shuffled back in`); break;
		case 'discard': log(`${nameOf(ev.player)} discarded ${ev.card.name}`); break;
		case 'concede': log(`${ev.player === HUMAN ? 'You' : nameOf(ev.player)} conceded`); delay = 300; break;
		case 'mulligan': log(ev.count ? `${ev.player === HUMAN ? 'You' : nameOf(ev.player)} mulliganed ${ev.count} card${ev.count === 1 ? '' : 's'}` : `${ev.player === HUMAN ? 'You' : nameOf(ev.player)} kept the opening hand`); delay = 200; break;
		case 'eliminated':
			if (matchStats && !matchStats.elim.some(e => e.seat === ev.player)) matchStats.elim.push({ seat: ev.player, turn: matchStats.turns }); // elimination order → FFA placement
			banner(`${nameOf(ev.player)} ${ev.player === HUMAN ? 'are' : 'is'} eliminated!`, 1800);
			log(`${nameOf(ev.player)} eliminated`);
			delay = 900;
			break;
		case 'gameOver': {
			const won = ev.winner === HUMAN;
			if (won) questReport({ kind: 'win' }); // advance any "Win N matches" daily quest
			const mh = $('mana-hud'); if (mh) mh.style.display = 'none';
			banner(ev.winner == null ? 'Draw!' : won ? 'VICTORY!' : `DEFEAT — ${nameOf(ev.winner)} wins`, 0);
			const reward = ev.winner == null ? 50 : won ? 100 : 25;
			Col.earnGold(reward);
			log(`+${reward} gold (${Col.getGold()} total)`);
			finalizeReplay(ev.winner); // save the recorded tape for rewatching
			if (duel.on) {
				publishDuel(); // push the final board (over + winner) to the guest/spectators
				const el = dungeonOverlay(won ? 'YOU WIN!' : ev.winner == null ? 'DRAW' : 'DEFEAT',
					won ? 'You win the duel!' : ev.winner == null ? "It's a draw." : `${nameOf(ev.winner)} wins the duel.`);
				el.id = 'duel-over';
					appendMatchSummary(el); // same stat block as Quick Match
					mountDuelRematch(el); // rematch lobby (1v1 or FFA)
				addReplayButtons(el); // ▶ Watch replay + 🔗 Copy replay link (host's view)
				el.appendChild(overlayButton('Back to your world', () => { location.href = '/overworld/?mp=1'; }));
			} else if (dungeonRunMode) {
				const run = loadRun();
				if (run?.active) setTimeout(() => { (won ? dungeonVictory : dungeonDefeat)(run); addReplayButtons($('dungeon-overlay')); }, 1200);
			} else if (heistRunMode) {
				const run = loadHeist();
				if (run?.active) setTimeout(() => { (won ? heistVictory : heistDefeat)(run); addReplayButtons($('dungeon-overlay')); }, 1200);
			} else if (tombsRunMode) {
				const run = loadTombs();
				if (run?.active) setTimeout(() => { (won ? tombsVictory : tombsDefeat)(run); addReplayButtons($('dungeon-overlay')); }, 1200);
			} else if (duelsRunMode) {
				const run = loadDuels();
				if (run?.active) setTimeout(() => { (won ? duelsVictory : duelsDefeat)(run); addReplayButtons($('dungeon-overlay')); }, 1200);
			} else if (arenaRunMode) {
				const run = loadArena();
				if (run?.active) setTimeout(() => { (won ? arenaVictory : arenaDefeat)(run); addReplayButtons($('dungeon-overlay')); }, 1200);
			} else {
				showPostGameSummary(ev.winner); // Quick Match / AI: result + stats + next steps
			}
			delay = 200;
			break;
		}
	}
	updateHud();
	setTimeout(nextEvent, delay);
}

// ---------- AI driver (every seat with no live human behind it) ----------
// Local game: every non-HUMAN seat is auto-piloted. Online duel: ONLY the host
// simulates, and only seats the match assigned to AI (or a guest who dropped and
// was converted — duel.aiSeats). Guests never simulate. This single predicate
// replaces the old "=== HUMAN / !== HUMAN" binary everywhere the AI drives play.
function isAiSeat(seat) {
	if (!duel.on) return seat !== HUMAN;
	if (HUMAN !== 0) return false;              // a guest never runs the engine
	return !!(duel.aiSeats && duel.aiSeats.has(seat));
}
let aiTimer = null;
function maybeRunAI() {
	if (!state || state.over || queue.length || queueBusy) return;
	if (!isAiSeat(state.current)) return; // it's a human's turn (yours or a guest's) — wait
	// a human with a pending decision (any seat) must resolve it before the AI proceeds
	if (state.scryQueue.length && !isAiSeat(state.scryQueue[0].chooser)) return;
	if (state.discardQueue.length && !isAiSeat(state.discardQueue[0].player)) return;
	if (state.pickQueue.length && !isAiSeat(state.pickQueue[0].player)) return;
	if (state.dredgeQueue.length && !isAiSeat(state.dredgeQueue[0].player)) return;
	if (state.askQueue.length && !isAiSeat(state.askQueue[0].player)) return;
	if (state.sacQueue.length && !isAiSeat(state.sacQueue[0].player)) return;
	if (state.priority != null && !isAiSeat(state.priority)) return; // a human's counter window first
	clearTimeout(aiTimer);
	aiTimer = setTimeout(() => {
		if (!state || state.over || !isAiSeat(state.current)) return;
		const seat = state.current;
		// mulligan the AI's opening hand on its first turn, then act on the next tick
		if (mulliganEnabled() && !state.players[seat].mulliganed) { E.mulligan(state, seat, aiMulliganUids(seat)); pump(); if (duel.on) publishDuel(); return; }
		const acted = AI.step(state, seat);
		if (!acted) E.endTurn(state);
		pump();
		if (duel.on) publishDuel(); // host: broadcast the AI seat's move to the guests
	}, 650);
}

// ---------- interaction ----------
let state = null;
let hoverUid = null;
let pending = null;          // { card, spec, targets } — spell/battlecry targeting
let selectedAttacker = null; // uid
let heroPress = null;        // { power } — orb pressed; a quick release uses it, a hold previews
let handMini = false;        // true = hand tucked down so the hero panel reads clearly
let lastCurrent = -1;        // tracks turn changes to auto-raise the hand each turn

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function pick(ev, excludeUid = null) {
	pointer.x = (ev.clientX / innerWidth) * 2 - 1;
	pointer.y = -(ev.clientY / innerHeight) * 2 + 1;
	raycaster.setFromCamera(pointer, camera);
	// a card being dragged floats under the cursor; skip it so drops read the
	// creature/hero behind it, not the card in your hand
	const meshes = [];
	for (const e of entities.values()) if (e.mesh.userData.uid !== excludeUid) meshes.push(e.mesh);
	if (heroPanelMesh.visible && excludeUid !== 'heropanel') meshes.push(heroPanelMesh);
	const hits = raycaster.intersectObjects(meshes);
	return hits.length ? hits[0].object.userData.uid : null;
}

// project a screen point onto a horizontal world plane (for drag-follow)
const _dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _dragHit = new THREE.Vector3();
function screenToGround(clientX, clientY, planeY) {
	pointer.x = (clientX / innerWidth) * 2 - 1;
	pointer.y = -(clientY / innerHeight) * 2 + 1;
	raycaster.setFromCamera(pointer, camera);
	_dragPlane.constant = -planeY;
	const hit = raycaster.ray.intersectPlane(_dragPlane, _dragHit);
	return hit || new THREE.Vector3(0, planeY, 0);
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
	// the class-power orb on your own 3D panel has no card uid of its own —
	// resolve it to the power card so hovering the orb reads the power
	const card = cardOf(hoverUid)
		|| (hoverUid === 'heropanel' && state && heroPanelOrbHit(pickHeroPanelUV(ev)) ? classPowerOf(HUMAN) : null);
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
	const typeLine = card.type === 'heropower'
		? `HERO POWER · COSTS (${card.power?.cost ?? 0}) · ` + classNameOf(card.cardClass).toUpperCase()
		: `${card.cost ?? 0} MANA · ` + classNameOf(card.cardClass).toUpperCase() + ' · ' + (card.tribe ? card.tribe + ' ' : '') + card.type.toUpperCase()
			+ ' · ' + (card.rarity || 'common').toUpperCase();
	let extra = '';
	if (card.type === 'planeswalker') extra = `<div class="tt-sub">Loyalty ${card.loyalty}</div>`;
	if (card.type === 'quest' && card.quest) extra = `<div class="tt-sub">Progress ${card.progress || 0} / ${card.quest.goal.count}</div>`;
	if (card.quickdrawn) extra += `<div class="tt-sub">Quickdrawn — returns to your deck at end of turn</div>`;
	if (card.paralyzed) extra += `<div class="tt-sub">⚡ Paralyzed — its attacks fail 50% of the time</div>`;
	if (card.frozen) extra += `<div class="tt-sub">❄ Frozen — can't attack next turn</div>`;
	tip.innerHTML = `<div class="tt-name">${card.name}</div><div class="tt-type">${typeLine}</div>`
		+ `<div class="tt-desc">${runePipsHtml(card.runes)}${richHtml(card.description || '')}</div>` + extra
		+ modifierLinesHtml(card) + keywordLinesHtml(card);
	tip.style.display = 'block';
	tip.style.left = `${Math.min(ev.clientX + 18, innerWidth - 290)}px`;
	tip.style.top = `${Math.min(ev.clientY + 14, innerHeight - tip.offsetHeight - 12)}px`;
}

addEventListener('pointermove', ev => {
	mouseX = ev.clientX;
	mouseY = ev.clientY;
	if (placing) placing.dragging = Math.hypot(mouseX - lastDownX, mouseY - lastDownY) > 14;
	hoverUid = pick(ev, placing && placing.dragging ? placing.card.uid : null);
	// reaching down toward your hand pops it back up
	if (handMini && mouseY > innerHeight * 0.82) handMini = false;
	if (placing && placing.dragging) $('tooltip').style.display = 'none';
	else if (!TOUCH) updateTooltip(ev); // phones use long-press instead of hover
	renderer.domElement.style.cursor = (placing && placing.dragging) ? 'grabbing'
		: (hoverUid != null && cardOf(hoverUid)?.zone === 'hand' && cardOf(hoverUid)?.controller === HUMAN) ? 'grab' : '';
});

function clearModes() {
	pending = null;
	selectedAttacker = null;
	placing = null;
	heroPress = null;
	placeMarker.visible = false;
	hideWalkerMenu();
	hideInspect();
	updateHud();
}

// ---------- click-to-inspect (look closely at a hand card without playing it) ----------
let inspectUid = null, inspectPrev = null, inspectArtFn = null;

// mirror the stat opts the 3D faces use — without them a hand creature's health
// (which lives in maxHealth, not card.health) renders as 0
function inspectFaceOpts(card) {
	return card.type === 'creature' ? { attack: card.attack, hp: E.hp(card), maxHealth: card.maxHealth }
		: card.type === 'weapon' ? { attack: card.attack, durability: card.durability }
		: card.type === 'location' ? { durability: card.durability }
		: card.type === 'quest' ? { progress: card.progress || 0, goal: card.quest?.goal?.count }
		: card.type === 'planeswalker' ? { loyalty: card.loyalty } : {};
}

// (re)paint the card face into the panel, replacing any face already there
function renderInspectFace(card) {
	const box = $('inspect');
	const face = drawCardFace({ ...card, health: card.maxHealth }, inspectFaceOpts(card));
	const old = box.querySelector('canvas');
	if (old) box.replaceChild(face, old); else box.insertBefore(face, box.firstChild);
}

function showInspect(card) {
	if (!card) return;
	if (card.disguised && card.controller !== HUMAN) return; // don't reveal a face-down enemy
	inspectUid = card.uid;
	const box = $('inspect');
	box.innerHTML = '';
	box.appendChild(drawCardFace({ ...card, health: card.maxHealth }, inspectFaceOpts(card))); // art + rules + stats
	const kw = modifierLinesHtml(card) + keywordLinesHtml(card);
	if (kw) { const d = document.createElement('div'); d.className = 'ins-kw'; d.innerHTML = kw; box.appendChild(d); }
	// every specific card this one generates (tokens, corrupted forms, equips,
	// shuffled cards, ...) — tap one to inspect it
	const gen = state ? generatedCardIds(card, state.cardsById) : [];
	if (gen.length) {
		const d = document.createElement('div');
		d.className = 'ins-kw';
		const head = document.createElement('div'); head.className = 'tt-kw'; head.innerHTML = '<b>Creates</b>'; d.appendChild(head);
		for (const gid of gen) {
			const def = state.cardsById[gid];
			const line = document.createElement('div');
			line.className = 'tt-kw';
			const statBits = def.type === 'creature' ? ` ${def.attack ?? '?'}/${def.health ?? '?'}` : def.type === 'weapon' ? ` ${def.attack ?? '?'}/${def.durability ?? '?'}` : '';
			line.innerHTML = `<b>${def.name || gid}</b> — (${def.cost ?? 0})${statBits} ${def.type}`;
			line.style.cursor = 'pointer';
			line.addEventListener('pointerdown', e => {
				e.stopPropagation();
				showInspect({ ...def, uid: 'preview_' + gid, zone: 'preview', controller: card.controller, maxHealth: def.health, keywords: def.keywords || [], damage: 0 });
			});
			d.appendChild(line);
		}
		box.appendChild(d);
	}
	// action buttons — a choose-one / adventure / tradeable card can't be resolved by
	// dragging alone, so offer the decision here (drag still works for everything)
	const yourTurn = state && state.current === HUMAN && !state.over;
	const playable = yourTurn && E.canPlay(state, HUMAN, card);
	const inHand = card.zone === 'hand' && card.controller === HUMAN;
	const actions = document.createElement('div');
	actions.className = 'ins-actions';
	const mkBtn = (label, fn, cls) => {
		const btn = document.createElement('button');
		btn.textContent = label;
		if (cls) btn.className = cls;
		btn.addEventListener('pointerdown', e => { e.stopPropagation(); hideInspect(); fn(e); });
		actions.appendChild(btn);
	};
	if (inHand && yourTurn) {
		if (card.adventure && !card.adventureSpent) {
			if (E.canPlay(state, HUMAN, card)) mkBtn(`Summon ${card.name}`, e => playFromHand(card, e));
			if (E.canPlayAdventure(state, HUMAN, card)) mkBtn(`Cast “${card.adventure.name}”`, e => openAdventureMenu(card, e));
		} else if (card.choices && playable) {
			if (card.chooseCount > 1 || card.chooseMax) mkBtn('Choose modes…', e => { hideInspect(); openMultiChoiceMenu(card, e); });
			else card.choices.forEach((ch, i) => mkBtn(ch.text, e => playChoiceFromInspect(card, i, e)));
		} else if (playable) {
			mkBtn('Play', e => playFromHand(card, e));
			if (card.tradeable && E.canTrade(state, HUMAN, card)) mkBtn('Trade (pay 1)', () => actTrade(card.uid), 'trade');
			if (card.prepare && E.canPrepare(state, HUMAN, card)) mkBtn('Prepare (bank your mana)', () => actPrepare(card.uid), 'trade');
			if (card.forge && E.canForge(state, HUMAN, card)) mkBtn(`Forge (pay ${card.forge.cost != null ? card.forge.cost : 2})`, () => actForge(card.uid), 'trade');
		} else {
			if (card.tradeable && E.canTrade(state, HUMAN, card)) mkBtn('Trade (pay 1)', () => actTrade(card.uid), 'trade');
			if (card.prepare && E.canPrepare(state, HUMAN, card)) mkBtn('Prepare (bank your mana)', () => actPrepare(card.uid), 'trade');
			if (card.forge && E.canForge(state, HUMAN, card)) mkBtn(`Forge (pay ${card.forge.cost != null ? card.forge.cost : 2})`, () => actForge(card.uid), 'trade');
		}
	}
	// a held hero power gets a deliberate "Use" button, mirroring a hand card's Play
	if (card.zone === 'heropower' && card.controller === HUMAN && yourTurn && E.canUseHeroPower(state, HUMAN, card)) {
		mkBtn(`Use ${card.name}`, e => activateHeroPower(card, e));
	}
	if (actions.children.length) box.appendChild(actions);
	else if (inHand) {
		// a hand card you can't act on yet: explain why (field cards get no hint)
		const hint = document.createElement('div');
		hint.className = 'ins-hint no';
		hint.textContent = state && state.current !== HUMAN ? 'wait for your turn to play' : 'not enough mana yet';
		box.appendChild(hint);
	}
	box.style.display = 'block';
	// the face is drawn with a procedural fallback until its art image and the mana
	// font load; repaint in place when they arrive (same as the 3D cards' refreshFace)
	if (inspectArtFn) artListeners.delete(inspectArtFn);
	inspectArtFn = id => { if (inspectUid === card.uid && (id === '*' || id === card.id)) renderInspectFace(card); };
	artListeners.add(inspectArtFn);
}
// resolve a Choose-One from the inspect panel (mirrors openChoiceMenu's per-branch logic)
function playChoiceFromInspect(card, i) {
	if (!E.canPlay(state, HUMAN, card)) return;
	const spec = E.targetSpec(state, HUMAN, card, i);
	if (spec) {
		const targets = E.legalTargets(state, HUMAN, spec);
		if (targets.length) { pending = { card, spec, targets, mode: 'play', choice: i }; updateHud(); return; }
		if (spec.required) return;
	}
	actPlay(card.uid, null, i);
}

function hideInspect() {
	if (inspectUid == null) return;
	inspectUid = null;
	if (inspectArtFn) { artListeners.delete(inspectArtFn); inspectArtFn = null; }
	$('inspect').style.display = 'none';
}
function toggleInspect(card) { if (inspectPrev === card.uid) hideInspect(); else showInspect(card); }

// ---------- planeswalker ability menu ----------
function hideWalkerMenu() {
	const menu = $('walker-menu');
	menu.style.display = 'none';
	menu.classList.remove('decision');
	$('menu-backdrop').style.display = 'none';
}

// show the walker-menu as a centered, backdrop-dimmed decision popup — used for
// hand-play choices (choose one / adventure / trade) so it can't be missed or
// dismissed by a stray board click. Clicking the backdrop cancels.
function showDecisionMenu() {
	const menu = $('walker-menu');
	const bd = $('menu-backdrop');
	bd.style.display = 'block';
	bd.onpointerdown = e => { e.stopPropagation(); hideWalkerMenu(); };
	menu.classList.add('decision');
	menu.style.display = 'block';
}

// activated creature abilities: pick Attack or one of the card's abilities
function openAbilityMenu(card, ev) {
	const menu = $('walker-menu');
	// Titan: present the abilities as a Discover-style pick — already-used (and
	// this-turn-locked) abilities are removed from the list, not just disabled.
	menu.innerHTML = `<div class="wm-title">${card.name}${card.titan ? ' — choose a Titan ability' : ''}</div>`;
	if (E.canAttackWith(state, HUMAN, card)) {
		const atk = document.createElement('button');
		atk.innerHTML = `<span class="wm-cost">⚔</span>Attack`;
		atk.addEventListener('pointerdown', e => {
			e.stopPropagation();
			hideWalkerMenu();
			selectedAttacker = card.uid;
			updateHud();
		});
		menu.appendChild(atk);
	}
	card.activated.forEach((a, i) => {
		if (card.titan && !E.canActivate(state, HUMAN, card, i)) return; // Titan pick: drop used / this-turn-locked abilities
		const btn = document.createElement('button');
		btn.innerHTML = `<span class="wm-cost">${card.titan ? '✦' : (a.cost || 0)}${a.sacrifice ? ' 💀' : ''}</span>${a.name ? `<b>${a.name}</b> — ` : ''}${a.text}`;
		btn.disabled = !E.canActivate(state, HUMAN, card, i);
		btn.addEventListener('pointerdown', e => {
			e.stopPropagation();
			hideWalkerMenu();
			const spec = E.abilitySpec(state, HUMAN, card, i);
			if (spec) {
				const targets = E.legalTargets(state, HUMAN, spec);
				if (targets.length) { pending = { card, spec, targets, mode: 'activate', ability: i }; updateHud(); return; }
				if (spec.required) return;
			}
			actActivate(card.uid, i, null); // relays in a duel (guest)
		});
		menu.appendChild(btn);
	});
	menu.style.display = 'block';
	menu.style.left = `${Math.min(ev.clientX, innerWidth - 260)}px`;
	menu.style.top = `${Math.min(ev.clientY, innerHeight - 220)}px`;
}

// Adventure creature: pick the creature half or the spell ("adventure") half.
function openAdventureMenu(card, ev) {
	const menu = $('walker-menu');
	const adv = card.adventure;
	menu.innerHTML = `<div class="wm-title">${card.name}</div>`;
	// summon the creature
	const cbtn = document.createElement('button');
	cbtn.innerHTML = `<span class="wm-cost">${card.cost}</span>Summon ${card.name} (${card.attack}/${card.health})`;
	cbtn.disabled = !E.canPlay(state, HUMAN, card);
	cbtn.addEventListener('pointerdown', e => {
		e.stopPropagation();
		hideWalkerMenu();
		const spec = E.targetSpec(state, HUMAN, card);
		if (spec) {
			const targets = E.legalTargets(state, HUMAN, spec);
			if (targets.length) { pending = { card, spec, targets, mode: 'play' }; updateHud(); return; }
			if (spec.required) return;
		}
		actPlay(card.uid, null);
	});
	menu.appendChild(cbtn);
	// cast the adventure spell (creature returns to hand afterward)
	const abtn = document.createElement('button');
	abtn.innerHTML = `<span class="wm-cost">${adv.cost}</span>Cast &ldquo;${adv.name}&rdquo;`;
	abtn.disabled = !E.canPlayAdventure(state, HUMAN, card);
	abtn.addEventListener('pointerdown', e => {
		e.stopPropagation();
		hideWalkerMenu();
		const spec = E.adventureSpec(state, HUMAN, card);
		if (spec) {
			const targets = E.legalTargets(state, HUMAN, spec);
			if (targets.length) { pending = { card, spec, targets, mode: 'adventure' }; updateHud(); return; }
			if (spec.required) return;
		}
		actAdventure(card.uid, null);
	});
	menu.appendChild(abtn);
	showDecisionMenu();
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
			actWalker(card.uid, i, null); // relays in a duel (guest)
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
	if (spectateMode || replayMode || duel.busy) return;
	if (ev.button !== 0 || !state || state.over) return;
	const uid = pick(ev);
	const card = cardOf(uid);
	if (TOUCH) $('tooltip').style.display = 'none';
	// press-and-hold any card to open its full preview — and block the release
	// from casting, so you can read a card without risking a play (desktop + touch)
	startLongPress(uid, ev.clientX, ev.clientY);
	// starting any gesture dismisses the pinned inspect; a tap re-opens it on release
	inspectPrev = inspectUid;
	hideInspect();

	// your own 3D hero panel: the orb fires the class power, elsewhere acts as the
	// hero (arm an attack, or pick yourself as a spell/attack target via panelClick)
	if (uid === 'heropanel') {
		const power = classPowerOf(HUMAN);
		if (heroPanelOrbHit(pickHeroPanelUV(ev)) && !pending && !selectedAttacker && power) {
			// don't fire on press — arm it: a quick release uses the power (or, when
			// it can't be used right now, opens its reader so the orb is always
			// inspectable); a press-and-hold previews it instead (see startLongPress)
			heroPress = { power };
		} else {
			panelClick(HUMAN);
		}
		return;
	}

	// off your turn you can still read a card: pick up a hand card, or inspect a
	// card in play (yours or the opponent's)
	if (state.current !== HUMAN) {
		if (card && card.zone === 'hand' && card.controller === HUMAN) placing = { card, dragging: false };
		else if (card && (card.zone === 'board' || card.zone === 'planeswalker')) showInspect(card);
		return;
	}

	// targeting mode: click any legal permanent (hero clicks handled on the panels)
	if (pending) {
		if (card && card.uid != null) {
			const t = pending.targets.find(t => t.uid === card.uid);
			if (t) { commitPending(t); return; }
		}
		clearModes();
		return;
	}
	if (selectedAttacker === 'HERO') {
		if (card && (card.zone === 'board' || card.zone === 'planeswalker') && card.controller !== HUMAN) {
			const kind = card.zone === 'board' ? 'creature' : 'walker';
			const t = E.heroAttackTargets(state, HUMAN).find(t => t.type === kind && t.uid === card.uid);
			if (t) { actHeroAttack(t); return; } // relays in a duel (guest)
		}
		clearModes();
		return;
	}
	if (selectedAttacker) {
		const attacker = cardOf(selectedAttacker);
		if (card && (card.zone === 'board' || card.zone === 'planeswalker') && card.controller !== HUMAN && attacker) {
			const kind = card.zone === 'board' ? 'creature' : 'walker';
			const t = E.attackTargets(state, HUMAN, attacker).find(t => t.type === kind && t.uid === card.uid);
			if (t) { actAttack(selectedAttacker, t); return; }
		}
		clearModes();
		if (!card || card.controller !== HUMAN) return; // fall through to reselect own creature
	}

	// pressing anywhere on the field (not your hand) tucks the hand down so the
	// hero panel is unobstructed; pressing a hand card keeps the hand up
	handMini = !(card && card.zone === 'hand' && card.controller === HUMAN);

	if (!card) {
		// nothing card-like was hit: maybe an empty land slot of yours
		const slotPi = pickLandSlot(ev);
		if (slotPi === HUMAN && state.players[HUMAN].lands.length < E.MAX_LANDS) openLandShop(ev);
		return;
	}
	if (card.zone === 'hand' && card.controller === HUMAN) {
		// arm a drag; release decides — a click inspects, a drag up onto the field plays
		placing = { card, dragging: false };
		return;
	} else if (card.zone === 'board' && card.controller === HUMAN) {
		showInspect(card); // read it on the left; the click also does its normal action
		if (card.type === 'location') { if (E.canTapLand(state, HUMAN, card)) openTapMenu(card, ev); return; }
		if (card.disguised && E.canUnmask(state, HUMAN, card)) { openUnmaskMenu(card, ev); return; }
		// A Titan whose abilities are all spent (or all locked this turn) skips the
		// pick and falls through to attacking; other activated minions always show the menu.
		if (card.activated?.length && !(card.titan && !card.activated.some((a, i) => E.canActivate(state, HUMAN, card, i)))) { openAbilityMenu(card, ev); return; }
		if (E.canAttackWith(state, HUMAN, card)) { selectedAttacker = card.uid; updateHud(); }
	} else if (card.zone === 'heropower' && card.controller === HUMAN) {
		// click an installed hero power to activate it
		activateHeroPower(card, ev);
	} else if (card.zone === 'artifact' && card.controller === HUMAN && card.equip && E.canEquip(state, HUMAN, card.uid)) {
		// click an Equipment to attach/move it — then pick one of your creatures
		const targets = E.equipTargets(state, HUMAN, card.uid);
		if (targets.length) { pending = { card, targets, mode: 'equip' }; updateHud(); }
	} else if (card.zone === 'artifact' && card.controller === HUMAN && card.sac) {
		// click a field token (Blood/Treasure/Food) to sacrifice it
		if (E.canSacrifice(state, HUMAN, card)) {
			actSacToken(card.uid); // relays in a duel (guest)
		}
	} else if (card.zone === 'artifact' && card.controller === HUMAN && card.tapAbility) {
		// click an artifact with a {T} ability to tap it (targeted ones pick a target)
		if (E.canTapArtifact(state, HUMAN, card.uid)) {
			const spec = E.tapArtifactSpec(state, HUMAN, card.uid);
			if (spec && spec.required) {
				const targets = E.legalTargets(state, HUMAN, spec);
				if (targets.length) { pending = { card, spec, targets, mode: 'tapart' }; updateHud(); }
			} else { actTapArtifact(card.uid, null); } // relays in a duel (guest)
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
		actPlay(card.uid, null);
	} else if (card.zone === 'land' && card.controller === HUMAN) {
		// tap your land for one of its abilities
		if (E.canTapLand(state, HUMAN, card)) openTapMenu(card, ev);
	} else if (card.zone === 'board' || card.zone === 'planeswalker') {
		// any other in-play card (an opponent's creature/walker): just inspect it
		showInspect(card);
	}
});

// resolve a pending targeted action (play, hero power, walker, or land tap)
function commitPending(t) {
	// two-target fight (Prey Upon): first pick your fighter, then pick the creature it fights
	if (pending && pending.card && pending.card.fight && pending.mode === 'play') {
		if (pending.fightStep !== 2) {
			pending.fighter = t;
			pending.fightStep = 2;
			const spec2 = { targets: pending.card.fightTarget || 'enemy-creature', required: true, why: 'a creature to fight' };
			const targets = E.legalTargets(state, HUMAN, spec2);
			if (!targets.length) { clearModes(); return; }
			pending.spec = spec2; pending.targets = targets;
			updateHud();
			return;
		}
		// second pick made: fuse both into one target the fight effect reads
		t = { type: 'creature', uid: pending.fighter.uid, player: pending.fighter.player, fightTarget: t.uid, fightTargetPlayer: t.player };
	}
	if (isGuest()) {
		const p = pending;
		let localFn, intent;
		if (p.mode === 'power') { localFn = () => E.useHeroPower(state, HUMAN, p.card.uid, t, p.choice); intent = { k: 'power', uid: p.card.uid, target: t || null, choice: p.choice }; }
		else if (p.mode === 'activate') { localFn = () => E.activateAbility(state, HUMAN, p.card.uid, p.ability, t); intent = { k: 'activate', uid: p.card.uid, ability: p.ability, target: t || null }; }
		else if (p.mode === 'equip') { localFn = () => E.equip(state, HUMAN, p.card.uid, t.uid); intent = { k: 'equip', uid: p.card.uid, target: t.uid }; }
		else if (p.mode === 'walker') { localFn = () => E.useWalker(state, HUMAN, p.card.uid, p.ability, t); intent = { k: 'walker', uid: p.card.uid, ability: p.ability, target: t || null }; }
		else if (p.mode === 'tap') { localFn = () => E.tapLand(state, HUMAN, p.card.uid, p.tapIndex, t); intent = { k: 'tap', uid: p.card.uid, tapIndex: p.tapIndex, target: t || null }; }
		else if (p.mode === 'tapart') { localFn = () => E.tapArtifact(state, HUMAN, p.card.uid, t); intent = { k: 'tapart', uid: p.card.uid, target: t || null }; }
		else if (p.mode === 'respond') { const a = { ...p.action, target: t || null }; localFn = () => E.resolveResponse(state, HUMAN, a); intent = { k: 'respond', action: a }; }
		else if (p.mode === 'adventure') { localFn = () => E.playAdventure(state, HUMAN, p.card.uid, t, p.choice); intent = { k: 'adventure', uid: p.card.uid, target: t || null, choice: p.choice }; }
		else { localFn = () => E.playCard(state, HUMAN, p.card.uid, t, p.choice, p.position, p.useAlt, p.kicked); intent = { k: 'play', uid: p.card.uid, target: t || null, choice: p.choice, position: p.position, useAlt: p.useAlt, kicked: p.kicked }; }
		clearModes();
		guestApply(localFn, intent);
		return;
	}
	if (pending.mode === 'power') E.useHeroPower(state, HUMAN, pending.card.uid, t, pending.choice);
	else if (pending.mode === 'activate') E.activateAbility(state, HUMAN, pending.card.uid, pending.ability, t);
	else if (pending.mode === 'equip') E.equip(state, HUMAN, pending.card.uid, t.uid);
	else if (pending.mode === 'walker') E.useWalker(state, HUMAN, pending.card.uid, pending.ability, t);
	else if (pending.mode === 'tap') E.tapLand(state, HUMAN, pending.card.uid, pending.tapIndex, t);
	else if (pending.mode === 'tapart') E.tapArtifact(state, HUMAN, pending.card.uid, t);
	else if (pending.mode === 'respond') { E.resolveResponse(state, HUMAN, { ...pending.action, target: t || null }); }
	else if (pending.mode === 'adventure') E.playAdventure(state, HUMAN, pending.card.uid, t, pending.choice);
	else E.playCard(state, HUMAN, pending.card.uid, t, pending.choice, pending.position, pending.useAlt, pending.kicked);
	clearModes();
	pump();
	if (duel.on) publishDuel();
}

// ---------- drag-to-target (Hearthstone style) ----------
// press arms as before; releasing after a real drag commits the target under
// the cursor, releasing in place keeps click-then-click working
let lastDownX = 0, lastDownY = 0;
addEventListener('pointerdown', ev => {
	lastDownX = mouseX = ev.clientX;
	lastDownY = mouseY = ev.clientY;
}, true);

// ---------- touch input ----------
// no hover on phones: long-press inspects a card instead, and hand plays
// wait for the release so browsing your hand can't cast anything
const TOUCH = matchMedia('(pointer: coarse)').matches;
let longPressT = null, longPressFired = false, touchHandCard = null;

// ---------- creature placement (drag out of hand to pick a board gap) ----------
let placing = null; // { card } — pressed creature; slot chosen on release
const placeMarker = new THREE.Mesh(
	new THREE.BoxGeometry(0.14, 0.04, 1.9),
	new THREE.MeshBasicMaterial({ color: 0x57e389, transparent: true, opacity: 0.9 }));
placeMarker.visible = false;
scene.add(placeMarker);

function boardScreenXs() {
	return state.players[HUMAN].board
		.filter(c => entities.has(c.uid))
		.map(c => {
			const m = entities.get(c.uid).mesh;
			const v = m.position.clone().project(camera);
			return { x: (v.x + 1) / 2 * innerWidth, wx: m.position.x, wz: m.position.z };
		})
		.sort((a, b) => a.x - b.x);
}

function placementIndexAt(x) {
	return boardScreenXs().filter(e => e.x < x).length;
}

function updatePlaceMarker() {
	// releasing anywhere but back on your own hand counts as a play, so the drag
	// hint/marker follow the same rule instead of a fixed height cutoff
	const overOwnHand = placing && placing.dragging && (() => {
		const cc = cardOf(pick({ clientX: mouseX, clientY: mouseY }, placing.card.uid));
		return !!cc && cc.zone === 'hand' && cc.controller === HUMAN;
	})();
	// dragging a Magnetic creature over a valid friendly target? it will MERGE onto that
	// creature instead of taking a board slot — surface that so the play is discoverable
	const magTarget = (placing && placing.dragging && !longPressFired && state && state.current === HUMAN && (() => {
		const c = placing.card;
		if (!c.magnetic || c.type !== 'creature' || !E.canPlay(state, HUMAN, c)) return null;
		const over = cardOf(pick({ clientX: mouseX, clientY: mouseY }, c.uid));
		if (!over || over.zone !== 'board' || over.controller !== HUMAN) return null;
		const magTribes = c.magnetizeTribes?.length ? c.magnetizeTribes : ['Mech'];
		return magTribes.some(tr => (over.tribe || '').includes(tr)) ? over : null;
	})()) || null;
	// live hint while dragging a card out of the hand (suppressed once a press-and-
	// hold turns the gesture into a preview)
	if (placing && placing.dragging && !longPressFired && state) {
		const c = placing.card;
		const yours = state.current === HUMAN;
		const inPlay = !overOwnHand && mouseY < innerHeight * 0.94;
		$('hint').textContent = !inPlay ? 'drag onto the field to play · release on your hand to cancel'
			: !yours ? "can't play on your opponent's turn"
			: magTarget ? `release to Magnetize ${c.name} onto ${magTarget.name}`
			: E.canPlay(state, HUMAN, c) ? `release to play ${c.name}`
			: (c.tradeable && E.canTrade(state, HUMAN, c)) ? `release to trade ${c.name}`
			: `not enough mana for ${c.name}`;
	}
	const isCreature = placing && (placing.card.type === 'creature' || placing.card.type === 'location');
	// a Magnetic merge doesn't take a slot, so hide the between-minions gap marker for it
	const active = isCreature && placing.dragging && !longPressFired && state && state.current === HUMAN
		&& state.players[HUMAN].board.length
		&& E.canPlay(state, HUMAN, placing.card)
		&& !magTarget
		&& !overOwnHand && mouseY < innerHeight * 0.94;
	placeMarker.visible = !!active;
	if (!active) return;
	const xs = boardScreenXs();
	if (!xs.length) { placeMarker.visible = false; return; }
	const i = xs.filter(e => e.x < mouseX).length;
	const gap = xs.length > 1 ? (xs[xs.length - 1].wx - xs[0].wx) / (xs.length - 1) : 1.4;
	let wx;
	if (i === 0) wx = xs[0].wx - Math.max(0.7, gap / 2);
	else if (i >= xs.length) wx = xs[xs.length - 1].wx + Math.max(0.7, gap / 2);
	else wx = (xs[i - 1].wx + xs[i].wx) / 2;
	placeMarker.position.set(wx, 0.1, xs[0].wz);
	placeMarker.material.opacity = 0.65 + 0.3 * Math.sin(performance.now() / 160);
}

function startLongPress(uid, x, y) {
	clearTimeout(longPressT);
	longPressFired = false;
	if (!uid) return;
	longPressT = setTimeout(() => {
		if (Math.hypot(mouseX - x, mouseY - y) > 12) return; // moved: it's a drag, not a hold
		longPressFired = true;
		// hold the hero-power orb to read it (it has no card uid of its own)
		const c = cardOf(uid) || (uid === 'heropanel' ? classPowerOf(HUMAN) : null);
		if (c) {
			// full card reader (with a Play / Use button when it's a legal action), so
			// a held card/power is previewed, never triggered — release is suppressed below
			$('tooltip').style.display = 'none';
			hideInspect();
			showInspect(c);
		} else {
			hoverUid = uid;
			updateTooltip({ clientX: x, clientY: y });
		}
	}, 380);
}

function heroPanelAt(x, y) {
	// your own hero is the 3D panel mesh; opponents are DOM panels
	if (pickHeroPanelUV({ clientX: x, clientY: y })) return HUMAN;
	const el = document.elementFromPoint(x, y);
	if (!el) return null;
	for (const [pi, pel] of foePanelEls) if (pel.contains(el)) return pi;
	return null;
}

function tryCommitTargetAt(ev) {
	const uid = pick(ev);
	const card = cardOf(uid);
	const heroPi = heroPanelAt(ev.clientX, ev.clientY);
	if (pending) {
		if (card && card.uid != null) {
			const t = pending.targets.find(t => t.uid === card.uid);
			if (t) { commitPending(t); return true; }
		}
		if (heroPi != null) {
			const t = pending.targets.find(t => t.type === 'hero' && t.player === heroPi);
			if (t) { commitPending(t); return true; }
		}
		return false;
	}
	if (selectedAttacker === 'HERO') {
		const targets = E.heroAttackTargets(state, HUMAN);
		if (card && (card.zone === 'board' || card.zone === 'planeswalker') && card.controller !== HUMAN) {
			const kind = card.zone === 'board' ? 'creature' : 'walker';
			const t = targets.find(t => t.type === kind && t.uid === card.uid);
			if (t) { actHeroAttack(t); return true; } // relays in a duel (guest)
		}
		if (heroPi != null && heroPi !== HUMAN) {
			const t = targets.find(t => t.type === 'hero' && t.player === heroPi);
			if (t) { actHeroAttack(t); return true; } // relays in a duel (guest)
		}
		return false;
	}
	if (selectedAttacker) {
		const attacker = cardOf(selectedAttacker);
		if (!attacker) return false;
		const targets = E.attackTargets(state, HUMAN, attacker);
		if (card && (card.zone === 'board' || card.zone === 'planeswalker') && card.controller !== HUMAN) {
			const kind = card.zone === 'board' ? 'creature' : 'walker';
			const t = targets.find(t => t.type === kind && t.uid === card.uid);
			if (t) { actAttack(selectedAttacker, t); return true; }
		}
		if (heroPi != null && heroPi !== HUMAN) {
			const t = targets.find(t => t.type === 'hero' && t.player === heroPi);
			if (t) { actAttack(selectedAttacker, t); return true; }
		}
		return false;
	}
	return false;
}

addEventListener('pointerup', ev => {
	clearTimeout(longPressT);
	if (spectateMode || replayMode || duel.busy) return;
	// hero-power orb released: a quick click uses it; a press-and-hold only previewed
	if (heroPress) {
		const power = heroPress.power;
		heroPress = null;
		if (ev.button === 0 && !longPressFired && state) {
			const dist = Math.hypot(ev.clientX - lastDownX, ev.clientY - lastDownY);
			// deliberate tap → use; when it can't be used (off turn, no mana, spent)
			// the tap reads it instead; hold/drag → no-op (the hold already previewed)
			if (dist < 14) {
				if (!state.over && state.current === HUMAN && E.canUseHeroPower(state, HUMAN, power)) activateHeroPower(power, ev);
				else showInspect(power);
			}
		}
		return;
	}
	// hand card released: a click (in place) inspects; a drag up onto the field plays
	if (placing) {
		const c = placing.card;
		const dragged = placing.dragging;
		placing = null;
		touchHandCard = null;
		placeMarker.visible = false;
		renderer.domElement.style.cursor = '';
		if (ev.button === 0 && state && !state.over) {
			const dist = Math.hypot(ev.clientX - lastDownX, ev.clientY - lastDownY);
			// a drag plays wherever it lands EXCEPT back on your own hand — a fixed
			// height cutoff wrongly cancelled drops onto the hero panel between them
			const onHand = (() => { const cc = cardOf(pick(ev, c.uid)); return !!cc && cc.zone === 'hand' && cc.controller === HUMAN; })();
			if (dragged && dist >= 14 && !longPressFired && state.current === HUMAN && !onHand && ev.clientY < innerHeight * 0.94) {
				releasePlay(c, ev);                        // dragged onto the field: play it
			} else if (!dragged && !longPressFired) {
				toggleInspect(c);                          // a click/tap: look closely, never play
			}
			// else: long-pressed (previewing) or dropped back onto the hand → no-op, never casts
		}
		if (state) updateHud();                        // clear the drag hint
		return;
	}
	if (ev.button !== 0 || !state || state.over || state.current !== HUMAN) return;
	if (!pending && !selectedAttacker) return;
	// a release right where the press happened is a click, not a drag
	if (Math.hypot(ev.clientX - lastDownX, ev.clientY - lastDownY) < 14) return;
	if (longPressFired) return; // inspecting an armed creature shouldn't cancel it
	if (!tryCommitTargetAt(ev)) clearModes();
});

// hero panels as click targets (attacks + targeted spells at heroes)
function panelClick(pi) {
	if (spectateMode || duel.busy || !state || state.over || state.current !== HUMAN) return;
	if (pending) {
		const t = pending.targets.find(t => t.type === 'hero' && t.player === pi);
		if (t) commitPending(t);
		return;
	}
	if (selectedAttacker === 'HERO') {
		if (pi !== HUMAN) {
			const t = E.heroAttackTargets(state, HUMAN).find(t => t.type === 'hero' && t.player === pi);
			if (t) { actHeroAttack(t); } // relays in a duel (guest)
		} else {
			clearModes();
		}
		return;
	}
	if (selectedAttacker && pi !== HUMAN) {
		const attacker = cardOf(selectedAttacker);
		if (!attacker) { clearModes(); return; }
		const t = E.attackTargets(state, HUMAN, attacker).find(t => t.type === 'hero' && t.player === pi);
		if (t) { actAttack(selectedAttacker, t); }
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
	if (!state || state.over || state.current !== HUMAN || duel.busy) return;
	clearModes();
	actEndTurn();
});
$('coin-btn').addEventListener('click', () => {
	if (!state || duel.busy) return;
	actCoin();
});
function updateAutopassBtn() { const b = $('autopass-btn'); if (!b) return; b.textContent = 'Auto-pass: ' + (autoPass ? 'ON' : 'OFF'); b.classList.toggle('holding', !autoPass); }
$('autopass-btn').addEventListener('click', () => { autoPass = !autoPass; updateAutopassBtn(); if (!autoPass && state && state.priority === HUMAN) openRespondModal(); });
updateAutopassBtn();
$('planeswalk-btn').addEventListener('click', () => {
	if (!state || duel.busy) return;
	actPlaneswalk();
});
$('restart').addEventListener('click', () => start());

// conceding forfeits the run outright: no defeat payout, no pack
$('concede').addEventListener('click', () => {
	if (!state || state.over) return;
	// run modes keep their own copy (a conceded run clears the save + pays no pack)
	if (dungeonRunMode || heistRunMode || tombsRunMode || duelsRunMode || arenaRunMode) {
		const run = arenaRunMode ? loadArena() : duelsRunMode ? loadDuels() : tombsRunMode ? loadTombs() : heistRunMode ? loadHeist() : loadRun();
		const el = dungeonOverlay('CONCEDE?', 'Walking away ends the run. A conceded run never pays a pack.');
		el.appendChild(overlayButton('Concede the run', () => {
			if (arenaRunMode) clearArena(); else if (duelsRunMode) clearDuels(); else if (tombsRunMode) clearTombs(); else if (heistRunMode) clearHeist(); else clearRun();
			state.over = true; // freezes play without firing the defeat payout path
			const done = dungeonOverlay('RUN CONCEDED', `You walked away at level ${run?.level ?? 1}. No pack this time.`);
			done.appendChild(overlayButton('New Run', () => location.reload()));
			updateHud();
		}));
		el.appendChild(overlayButton('Keep fighting', () => hideDungeonOverlay()));
		return;
	}
	// Quick Match / AI / duel: forfeit
	const ffa = duel.on && (duel.size || 2) > 2;
	const el = dungeonOverlay('CONCEDE?', ffa ? 'Forfeit and drop out of the free-for-all?' : 'Forfeit this match? Your opponent takes the win.');
	el.appendChild(overlayButton('Concede', () => {
		hideDungeonOverlay();
		if (isGuest()) {
			// online guest: relay the forfeit — the host is authoritative
			guestApply(() => E.concede(state, HUMAN), { k: 'concede' });
			const o = dungeonOverlay('YOU CONCEDED', ffa ? "You've dropped out of the free-for-all." : 'You forfeited the match.');
			o.id = 'duel-over';
			finalizeReplay(null, 'loss'); // save the conceding guest's recorded view
			addReplayButtons(o); // ▶ Watch replay + 🔗 Copy replay link
			o.appendChild(overlayButton('Back to your world', () => { location.href = '/overworld/?mp=1'; }));
			return;
		}
		E.concede(state, HUMAN); // if you were the active player, pump()'s settleTurn hands the turn on
		if (!state.over && !duel.on) { // local FFA vs bots — end it rather than watch the bots
			state.over = true;
			const o = dungeonOverlay('YOU CONCEDED', 'You dropped out of the free-for-all.');
			o.appendChild(overlayButton('Play again', () => location.reload()));
			o.appendChild(overlayButton('Mode picker', () => { location.href = 'start.html'; }));
		} else if (duel.on && !state.over) {
			banner('You conceded — still hosting the table for the others.', 3000);
		}
		pump();
		if (duel.on) publishDuel();
	}));
	el.appendChild(overlayButton(ffa ? 'Keep playing' : 'Keep fighting', () => hideDungeonOverlay()));
});
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
	frameCamera();
});

// ---------- ring highlighting (computed per frame) ----------
function updateRings() {
	if (!state) return;
	const validCreatureTargets = new Set();
	const attackable = t => t.type === 'creature' || t.type === 'walker';
	// a pending spell can target ANY legal permanent (creature/artifact/enchantment/walker/location)
	if (pending) for (const t of pending.targets) if (t.uid != null) validCreatureTargets.add(t.uid);
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
			else if (c.zone === 'artifact' && c.controller === HUMAN && c.tapAbility && E.canTapArtifact(state, HUMAN, c.uid)) color = '#57e389';
		}
		if (color && (c.zone === 'board' || c.zone === 'heropower' || c.zone === 'planeswalker' || c.zone === 'companion' || c.zone === 'command' || c.zone === 'land' || c.zone === 'artifact')) {
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
		// frozen creatures glow ice-blue; paralyzed ones flicker violet
		if (c.frozen && c.zone === 'board') ent.faceMat.emissive?.set(0x1a3d55);
		else if (c.paralyzed && c.zone === 'board') ent.faceMat.emissive?.set(0x35225a);
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
	updateRings();
	positionPanels();
	drawTargetArrow();
	updatePlaceMarker();
	renderer.render(scene, camera);
}
animate();

// ---------- boot ----------
// headless test hook
window.__game = {
	get state() { return state; },
	get HUMAN() { return HUMAN; }, // spectate smoke: the view-switch flips this
	showArenaLeaderboard, // arena smoke: open the leaderboard overlay
	get foePanels() { return [...foePanelEls.keys()]; }, // spectate smoke: the foe-panel set must exclude HUMAN after a flip
	get recording() { return Rec.isRecording(); }, // replay smoke: recording fires during live play
	_replayButtonLabels() { const el = dungeonOverlay('TEST', ''); addReplayButtons(el); const out = [...el.querySelectorAll('button')].map(b => b.textContent); hideDungeonOverlay(); return out; }, // smoke: the Watch/Copy buttons render into a run/post-game overlay
	get duelDebug() { return duelDebug; }, // relay harness asserts desyncs === 0
	get duel() { return duel; },           // seat/size/aiSeats — the relay-fuzz harness reads these
	applyGuestIntent,                      // relay-fuzz harness feeds this adversarial guest intents
	E, AI,
	pump,
	screenPosOf(uid) {
		const ent = entities.get(uid);
		if (!ent) return null;
		const v = ent.mesh.position.clone().project(camera);
		return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
	},
	// test hooks for the targeting arrow
	armAttack(uid) { selectedAttacker = uid; updateHud(); },
	// 3D hero-panel test hooks: screen positions of the orb and the panel body
	orbScreenPos() {
		if (!heroPanelMesh.visible || !heroOrbUV) return null;
		const g = heroPanelMesh.geometry.parameters;
		const lx = ((heroOrbUV.x0 + heroOrbUV.x1) / 2 - 0.5) * g.width;
		const ly = ((heroOrbUV.y0 + heroOrbUV.y1) / 2 - 0.5) * g.height;
		const v = heroPanelMesh.localToWorld(new THREE.Vector3(lx, ly, 0)).project(camera);
		return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
	},
	panelScreenPos() {
		if (!heroPanelMesh.visible) return null;
		const g = heroPanelMesh.geometry.parameters;
		const v = heroPanelMesh.localToWorld(new THREE.Vector3(-g.width * 0.32, g.height * 0.28, 0)).project(camera);
		return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
	},
	get targeting() { return { pending: !!pending, attacker: selectedAttacker, drawn: arrowDrawn }; },
	// live-duel test hooks
	duel,
	get HUMAN() { return HUMAN; },
	actPlay: (...a) => actPlay(...a),
	actEndTurn: () => actEndTurn(),
	actAttack: (...a) => actAttack(...a),
	publishDuel: () => publishDuel(),
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

// ---------- multiplayer spectation ----------
// A player in a run/battle broadcasts a lean board snapshot (no card DB, no rng)
// every ~1.2s; friends poll it and render read-only. cardsById is re-attached
// locally on the watcher side since every client already has the full card DB.
// One authoritative snapshot shape for spectators and duels (engine/serialize.js,
// schemaVersion-stamped). Additive over the old allow-list: same fields plus the
// previously-dropped lazily-created state (forcedTurns, expanseEvents, dealt, …),
// so old ingesters keep working and resumed/spectated games stop losing state.
function snapshotState() {
	const s = E.toSnapshot(state);
	if (s) s.digest = E.stateDigest(state); // guests verify the wire round-trip against this
	return s;
}

let publishSeq = 0;
// a small floating "👁 N watching: name, name" pill — shown to the runner (from
// the publish response) and to a spectator (from the cardstate response). Lists up
// to 3 names inline (+K for the rest, full list on hover); hidden at zero.
function updateWatcherBadge(n, names) {
	n = +n || 0;
	names = (Array.isArray(names) ? names : []).filter(Boolean);
	let el = $('watchers');
	if (!el) {
		el = document.createElement('div');
		el.id = 'watchers';
		el.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:55;'
			+ 'max-width:min(80vw,520px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
			+ 'background:rgba(10,7,20,.82);color:#ffcf6b;border:1px solid #4a3f6a;border-radius:999px;'
			+ 'padding:4px 13px;font:600 13px/1.2 inherit;backdrop-filter:blur(3px);';
		document.body.appendChild(el);
	}
	const me = MPX.cachedState()?.username || '';
	el.textContent = `👁 ${n} watching`;
	if (names.length) {
		el.append(names.length ? ': ' : '');
		const show = names.slice(0, 3);
		show.forEach((name, i) => {
			const span = document.createElement('span');
			span.className = 'mpp-link';
			span.textContent = name === me ? 'you' : name; // show self as "you", but click opens the real profile
			span.addEventListener('click', () => openProfile(name));
			el.append(span);
			if (i < show.length - 1) el.append(', ');
		});
		const extra = names.length - show.length;
		if (extra > 0) el.append(` +${extra}`);
	}
	el.title = names.join(', '); // full list on hover
	el.style.display = n > 0 ? 'block' : 'none';
}

function startPublishLoop() {
	const uname = MPX.cachedState()?.username;
	if (uname && !Chat.active()) Chat.mount({ room: 'u:' + uname, canPost: true }); // hear spectators
	// the mode drives the friends-list "in a … run" label + the Watch button
	const mode = duel.on ? 'pvp'
		: dungeonRunMode ? 'dungeon' : heistRunMode ? 'heist' : tombsRunMode ? 'tombs'
			: duelsRunMode ? 'duels' : arenaRunMode ? 'arena' : 'battle';
	const label = () => {
		if (duel.on) return 'Card Duel';
		if (dungeonBossId) return `${Dungeon.BOSSES[dungeonBossId].name}${loadRun()?.level ? ' · Lv ' + loadRun().level : ''}`;
		if (heistRunMode) { const r = loadHeist(); return r ? `Fight ${r.level}/8` : 'Heist'; }
		if (tombsRunMode) { const r = loadTombs(); return r ? `Fight ${r.level}/8` : 'Tombs'; }
		if (duelsRunMode) { const r = loadDuels(); return r ? `${r.wins || 0}W / ${r.losses || 0}L` : 'Duels'; }
		if (arenaRunMode) { const r = loadArena(); return r ? `${r.wins || 0}W / ${r.losses || 0}L` : 'Arena'; }
		return 'Card Battle';
	};
	let publishedOver = false; // pushed the final (over) board once, then go quiet
	const tick = async () => {
		// once the game is over: publish the final board ONCE, then stop republishing so
		// cardstate goes stale (~20s) and spectators get their GAME OVER overlay. Keep the
		// interval alive (don't clearInterval) so a restart/rematch resumes broadcasting.
		if (state && state.over) { if (publishedOver) return; publishedOver = true; }
		else publishedOver = false;
		try {
			const r = await MPX.call('publish-cardstate', {
				snapshot: snapshotState(), mode, label: label(), seq: ++publishSeq,
				over: !!(state && state.over), winner: (state && state.winner) ?? null, // spectators see the result instantly
			});
			if (!duel.on) updateWatcherBadge(r && r.watchers, r && r.watcherNames); // in a duel the badge comes from publishDuel (host) / card-poll (guest)
		} catch (e) {}
	};
	tick();
	setInterval(tick, 1200);
}

let spectateSeq = -1, spectatePanelsFor = 0, spectateView = 0;
// a floating button that flips which player the spectator watches from (their
// slice sits at the camera-bottom, so you see that player's hand up close)
function mountSpectateViewButton() {
	if ($('spec-view')) return;
	const b = document.createElement('button');
	b.id = 'spec-view';
	b.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:56;'
		+ 'background:#2a2440;color:#e8e0d0;border:1px solid #6a5f8a;border-radius:999px;'
		+ 'padding:8px 16px;font:600 13px/1 inherit;cursor:pointer;';
	b.addEventListener('click', () => {
		const n = state?.players?.length || playerCount;
		spectateView = (spectateView + 1) % Math.max(1, n);
		HUMAN = Math.min(spectateView, n - 1);
		// the foe-panel set + 3D slot geometry are built RELATIVE to HUMAN (buildPanels
		// skips HUMAN, angleOf is HUMAN-relative), so a flip must rebuild them — not just
		// re-run updateHud, which would leave the old seat's panels/portraits in place
		frameCamera(); buildPanels(); buildSlotMarkers();
		updateHud();
		updateSpectateViewButton();
	});
	document.body.appendChild(b);
	updateSpectateViewButton();
}
function updateSpectateViewButton() {
	const b = $('spec-view'); if (!b) return;
	const n = state?.players?.length || playerCount;
	b.style.display = n > 1 ? 'block' : 'none';
	b.textContent = n > 2 ? `🔄 Viewing player ${HUMAN + 1} of ${n}` : '🔄 Flip view';
}
function startSpectate(cardsById) {
	banner(`Spectating ${spectateName}`);
	$('end-turn').style.display = 'none';
	$('concede').style.display = 'none';
	$('coin-btn').style.display = 'none';
	$('player-count').style.display = 'none';
	$('class-select').style.display = 'none';
	mountSpectateViewButton();
	log(`Watching ${spectateName}'s game…`);
	let specIdle = 0; // consecutive unchanged polls → adaptive backoff
	let specNull = 0; // consecutive no-board polls → detect a game that's already over on join
	// the publisher stamps over/winner on the final board, so a spectator sees the
	// result the instant it happens (not ~20s later via cardstate staleness)
	const showSpectateOver = (winner) => {
		if ($('over-note')) return;
		let msg;
		if (winner == null) msg = `${spectateName}'s game ended in a draw.`;
		else {
			const p = state && state.players && state.players[winner];
			const who = (state && state.classPicks && state.classPicks[winner] && state.classPicks[winner].name)
				|| (p && p.heroClass ? classNameOf(p.heroClass) : null) || `Player ${winner + 1}`;
			msg = `${spectateName}'s game is over — ${who} wins.`;
		}
		const el = dungeonOverlay('GAME OVER', msg);
		el.id = 'over-note';
		el.appendChild(overlayButton('Back to your world', () => { location.href = '/overworld/?mp=1'; }));
		if (Chat.active()) Chat.unmount();
	};
	const tick = async () => {
		let data;
		try { data = await MPX.call('cardstate', { username: spectateName, seq: spectateSeq }); } // send our seq so the server can skip an unchanged snapshot
		catch (e) { return; }
		if (data && data.error) return; // rate-limited or transient — skip this poll, keep going
		if (data && data.full) { // at the spectator cap — wait for a spot (a stale watcher frees one)
			if (!$("spec-full")) { const el = dungeonOverlay("SPECTATOR SLOTS FULL", spectateName + "’s game already has the maximum " + (data.max || 10) + " spectators. Waiting for a spot…"); el.id = "spec-full"; el.appendChild(overlayButton("Back to your world", () => { location.href = "/overworld/?mp=1"; })); }
			return;
		}
		if ($("spec-full")) $("spec-full").remove(); // a spot opened — drop the overlay and carry on
		if (data && data.unchanged) { updateWatcherBadge(Math.max(1, +data.watchers || 0), data.watcherNames); specIdle++; if (data.over) showSpectateOver(data.winner); return; } // board is the same — just refresh the watcher badge (+ instant game-over)
		if (!data || !data.snapshot) {
			// no board: either the game we were watching ENDED (we'd seen a board: spectateSeq>=0),
			// or we joined a game that's already gone / not started yet. For the latter, wait a few
			// polls before declaring it over so a just-starting game isn't false-flagged.
			specNull++;
			if (!$('over-note') && (spectateSeq >= 0 || specNull >= 4)) {
				const el = dungeonOverlay('GAME OVER', spectateSeq >= 0 ? `${spectateName}'s game has ended.` : `${spectateName} isn't in a live game right now.`);
				el.id = 'over-note';
				el.appendChild(overlayButton('Back to your world', () => { location.href = '/overworld/?mp=1'; }));
				if (Chat.active()) Chat.unmount(); // the watched game ended → stop the chat poll loop
			}
			return;
		}
		specNull = 0; // a live board arrived
		if (data.seq === spectateSeq) return; // nothing new
		spectateSeq = data.seq;
		specIdle = 0; // active again → poll fast
		const snap = data.snapshot;
		// migrate (v0 publishers still supported) + re-attach card DB/rng; unlike
		// the old spread-rebuild, this keeps every engine field the host sent
		state = E.fromSnapshot(snap, cardsById);
		E.ensureUidsAbove(E.maxSnapshotUid(snap)); // never mint uids that collide with ingested ones
		if (snap.playerCount !== spectatePanelsFor) {
			playerCount = snap.playerCount;
			frameCamera();
			buildPanels();
			buildSlotMarkers();
			spectatePanelsFor = snap.playerCount;
		}
		if (!Chat.active()) Chat.mount({ room: data.room || ('u:' + spectateName), canPost: false, specRoom: 'spec:' + spectateName });
		HUMAN = Math.min(spectateView, state.players.length - 1); // keep the chosen view across updates
		banner(`${spectateName}${data.label ? ' — ' + data.label : ''}`);
		updateHud();
		updateWatcherBadge(Math.max(1, +data.watchers || 0), data.watcherNames); // spectator counts self (>=1); badge shows self as "you" + clickable profiles
		updateSpectateViewButton();
		renderSpectatorChoice();
		if (data.over) showSpectateOver(data.winner); // final board rendered → show the result immediately
	};
	const schedule = () => { if ($('over-note')) return; setTimeout(() => tick().finally(schedule), specIdle >= 3 ? 2500 : 1000); }; // relax to 2.5s after idle; stop at game over
	tick().finally(schedule);
}

// read-only overlay: show a pending Discover/scry/loot decision so the watcher
// sees the options before the player commits. No buttons — a spectator can't act.
let specChoiceSig = null;
function renderSpectatorChoice() {
	if (!spectateMode || !state) return;
	const pq = state.pickQueue?.[0], sq = state.scryQueue?.[0], dq = state.discardQueue?.[0], dr = state.dredgeQueue?.[0];
	let sig = null, ids = null, whoIdx = null, kind = '';
	if (pq) { sig = 'pick:' + pq.player + ':' + pq.ids.join(','); ids = pq.ids; whoIdx = pq.player; kind = pq.title || (pq.ids.length > 3 ? 'Draft' : 'Discover'); }
	else if (sq) { sig = 'scry:' + sq.chooser + ':' + sq.ids.join(','); ids = sq.ids; whoIdx = sq.chooser; kind = sq.deckOwner === sq.chooser ? 'Scry' : 'Gaze'; }
	else if (dr) { sig = 'dredge:' + dr.player + ':' + dr.ids.join(','); ids = dr.ids; whoIdx = dr.player; kind = 'Dredge'; }
	else if (dq) { sig = 'discard:' + dq.player + ':' + dq.count; whoIdx = dq.player; kind = 'Loot'; }
	if (sig === specChoiceSig) return; // unchanged
	specChoiceSig = sig;
	const modal = $('scry-modal');
	if (!modal) return;
	if (!sig) { modal.style.display = 'none'; return; }
	const who = whoIdx === HUMAN ? spectateName : (state.classPicks?.[whoIdx]?.name || 'Opponent');
	if (ids) {
		modal.innerHTML = `<div class="wm-title">${who} is choosing — ${kind} (watching)</div><div class="scry-row"></div>`;
		const row = modal.querySelector('.scry-row');
		ids.forEach(id => {
			const def = state.cardsById[id];
			if (!def) return;
			const cell = document.createElement('div');
			cell.className = 'scry-cell';
			const face = drawCardFace(def);
			face.style.width = ids.length > 3 ? '105px' : '130px';
			cell.appendChild(face);
			row.appendChild(cell);
		});
	} else {
		modal.innerHTML = `<div class="wm-title">${who} is discarding ${dq.count} card${dq.count > 1 ? 's' : ''}… (watching)</div>`;
	}
	modal.style.display = 'block';
}

// ---------- live card duel (host-authoritative relay) ----------
function shuffleIds(ids) {
	for (let i = ids.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[ids[i], ids[j]] = [ids[j], ids[i]];
	}
	return ids;
}
function classPickFor(clsId) {
	return classRegistry.find(c => c.id === clsId) || (clsId ? { id: clsId, name: clsId, power: null } : null);
}

// matchmaking AI game: a local match where player 1 (the AI) plays a specific
// decklist handed down by the matchmaker (starter or harvested real-player deck)
async function startAiMatch(cardsById) {
	let cfg = null;
	try { const r = await MPX.call('ai-match', { id: aiMatchId }); cfg = r && r.match; } catch (e) {}
	if (!cfg) { // config expired — fall back to a normal quick match
		const picks = pickClasses();
		state = E.createGame(cardsById, Math.random, null, playerCount, picks);
		state.classPicks = picks;
	} else {
		const picks = [classPickFor(cfg.humanClass), classPickFor(cfg.aiClass)];
		const loadouts = [
			{ commander: cfg.humanCommander || null, companion: cfg.humanCompanion || null },
			{ commander: cfg.aiCommander || null, companion: cfg.aiCompanion || null },
		];
		state = E.createGame(cardsById, Math.random,
			cfg.humanDeck?.length ? [...cfg.humanDeck] : null, 2, picks, loadouts,
			cfg.aiDeck?.length ? [...cfg.aiDeck] : null); // player 1 gets the AI decklist
		state.classPicks = picks;
		log(`Matchmaking: playing ${cfg.aiName || 'a Challenger'} (AI).`);
		banner(`Matched vs ${cfg.aiName || 'a Challenger'}`, 1600);
	}
	frameCamera();
	buildPanels();
	buildSlotMarkers();
	pump();
	updateHud();
	if (MP_ON && !publishStarted) { publishStarted = true; startPublishLoop(); }
}

async function startDuel(cardsById) {
	const data = await MPX.call('card-match', { id: duel.id });
	if (data.error || !data.cardmatch) {
		banner('Duel not found');
		dungeonOverlay('DUEL ERROR', data.error || 'This card duel is no longer available.')
			.appendChild(overlayButton('Back to your world', () => { location.href = '/overworld/?mp=1'; }));
		return;
	}
	duel.config = data.cardmatch;
	duel.role = data.role; // 'host' | 'guest'
	duel.size = data.cardmatch.size || 2;
	duel.seat = data.seat ?? (data.role === 'host' ? 0 : 1); // my seat index (FFA: 0..N-1)
	startDebugOverlay();
	$('player-count').style.display = 'none';
	$('class-select').style.display = 'none';
	$('concede').style.display = 'none';
	if (duel.role === 'host') startDuelHost(cardsById);
	else startDuelGuest(cardsById);
}

// A deterministic uint32 seed from the (shared) match id, so a duel's randomness
// is reproducible and — crucially — the guest can reconstruct the host's stream.
// The host seeds its engine with this; every published snapshot carries the rng
// POSITION (serialize.js), so the guest's optimistic rolls (conjure, discover,
// random targets) match the host's exactly instead of flickering to a guess.
// (xmur3 string hash; never returns 0, which mulberry32 tolerates but we avoid.)
function duelSeed(id) {
	const s = String(id);
	let h = 1779033703 ^ s.length;
	for (let i = 0; i < s.length; i++) {
		h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	return (h >>> 0) || 1;
}

// the seat roster for a match — the N-player seats[] array, or a synthesized
// 2-seat roster for older/rematch matches that only carry host/guest fields
function duelSeats(cm) {
	if (cm.seats && cm.seats.length) return cm.seats;
	return [
		{ seat: 0, name: cm.host, ai: false, deck: cm.hostDeck, classId: cm.hostClass, commander: cm.hostCommander, companion: cm.hostCompanion },
		{ seat: 1, name: cm.guest || null, ai: !cm.guest, deck: cm.guestDeck, classId: cm.guestClass, commander: cm.guestCommander, companion: cm.guestCompanion },
	];
}
function seatLabel(cm, seat) {
	const s = duelSeats(cm)[seat];
	return s ? (s.ai ? (s.aiName || `AI ${seat}`) : s.name) : `Seat ${seat}`;
}

// the host owns the engine: seat 0 = host; seats 1..N-1 are human guests or AI
async function startDuelHost(cardsById) {
	HUMAN = 0;
	const cm = duel.config;
	const seats = duelSeats(cm);
	const N = seats.length;
	duel.size = N;
	duel.aiSeats = new Set(seats.filter(s => s.ai).map(s => s.seat)); // seats the host auto-pilots
	const humanGuests = seats.filter(s => !s.ai && s.seat !== 0).length;
	// a reconnecting host rehydrates the engine from its last published board
	// rather than dealing a fresh game (the snapshot is the complete state)
	let resumed = false;
	try {
		const prev = await MPX.call('card-poll', { id: duel.id });
		if (prev && prev.over) {
			const el = dungeonOverlay('DUEL ENDED', 'This duel already finished.');
			el.appendChild(overlayButton('Back to your world', () => { location.href = '/overworld/?mp=1'; }));
			return;
		}
		if (prev && prev.snapshot) {
			// migrate + reattach: the resumed host gets back every engine field it
			// published (the old spread-rebuild silently defaulted the lazily-created
			// ones — forcedTurns, expanseEvents, dealt, …)
			state = E.fromSnapshot(prev.snapshot, cardsById);
			E.ensureUidsAbove(E.maxSnapshotUid(prev.snapshot)); // resumed instances must not collide with new deals
			duelPubSeq = prev.seq || 0; // continue the sequence so the guest sees fresh
			resumed = true;
		}
	} catch (e) {}
	if (!resumed) {
		const picks = seats.map(s => classPickFor(s.classId));
		const loadouts = seats.map(s => ({ commander: s.commander || null, companion: s.companion || null }));
		state = E.createGame(cardsById, E.seededRng(duelSeed(duel.id)), seats[0].deck ? [...seats[0].deck] : null, N, picks, loadouts);
		state.classPicks = picks;
		// createGame only deals seat 0 the host deck; give every other seat its own
		// deck + a fresh opening hand and the coin (resetDeckAndHand clears the hand,
		// so the later addCoin leaves exactly one coin card)
		for (let s = 1; s < N; s++) {
			if (seats[s].deck?.length) {
				E.resetDeckAndHand(state, s, seats[s].deck);
				E.drawCards(state, s, 4);
				E.addCoin(state, s);
			}
		}
	}
	frameCamera();
	buildPanels();
	buildSlotMarkers();
	pump();
	updateHud();
	Chat.mount({ room: 'm:' + duel.id, canPost: true });
	log(resumed ? 'Rejoined your duel.'
		: N > 2 ? `Free-for-all: ${N} players (${humanGuests + 1} human), last hero standing wins.`
		: `Live duel: you vs ${seatLabel(cm, 1)}.`);
	// drain the guests' queued intents and apply them, then republish. A silent
	// human seat is converted to AI (FFA) or ends the duel (1v1 abandonment).
	const drainTick = async () => {
		if (state?.over) return;
		try {
			const d = await MPX.call('card-drain', { id: duel.id });
			for (const it of (d.intents || [])) { applyGuestIntent(it); }
			for (const s of (d.staleSeats || [])) {
				if (duel.aiSeats && !duel.aiSeats.has(s)) {
					duel.aiSeats.add(s); // that human dropped — the host auto-pilots the seat
					log(`${seatLabel(cm, s)} disconnected — the AI is taking over their seat.`);
					maybeRunAI();
				}
			}
			if (d.oppGone && state && !state.over) endDuelByAbandon(seatLabel(cm, 1)); // 1v1 guest left
		} catch (e) {}
	};
	// adaptive: drain fast while a human guest is acting (intents incoming), relax otherwise
	const drainLoop = () => drainTick().finally(() => {
		if (state?.over) return;
		const humanGuestTurn = state && state.current !== 0 && duel.aiSeats && !duel.aiSeats.has(state.current);
		setTimeout(drainLoop, humanGuestTurn ? 300 : 850);
	});
	drainLoop();
	startDuelPublish();
}

// the host ends the duel when the guest is gone: freeze the engine, tell
// spectators, and show the result
function endDuelByAbandon(whoLeft) {
	if (!state || state.over) return;
	state.over = true;
	state.winner = HUMAN;
	publishDuel();
	if (!$('duel-over')) {
		const el = dungeonOverlay('YOU WIN!', `${whoLeft} left the duel.`);
		el.id = 'duel-over';
		el.appendChild(overlayButton('Back to your world', () => { location.href = '/overworld/?mp=1'; }));
	}
}

// apply a relayed guest action to the authoritative engine. The seat is stamped
// by the server from the sender's identity (see card-act); each guest owns one
// seat 1..N-1. A seat converted to AI (dropped guest) ignores late relays.
function applyGuestIntent(it) {
	if (!state || state.over) return;
	const P = it.seat;
	if (P == null || P === 0 || !state.players[P]) return;   // seat 0 is the host; ignore junk
	if (duel.aiSeats && duel.aiSeats.has(P)) return;         // seat auto-piloted now — drop stale intents
	// queue/priority resolutions (scry, loot, discover, sac-cost, dredge, counter
	// response) can land on ANY player's turn; each self-guards inside the switch by
	// checking the front of its queue, so they bypass the turn gate below.
	const isResolve = it.k === 'scry' || it.k === 'discard' || it.k === 'pick' || it.k === 'ask' || it.k === 'sac' || it.k === 'dredge' || it.k === 'respond' || it.k === 'concede' || it.k === 'mulligan';
	if (!isResolve && state.current !== P) return; // turn actions apply only on that seat's turn
	try {
		switch (it.k) {
			case 'play': E.playCard(state, P, it.uid, it.target || null, it.choice, it.position, it.useAlt, it.kicked); break;
				case 'adventure': E.playAdventure(state, P, it.uid, it.target || null, it.choice); break;
			case 'power': E.useHeroPower(state, P, it.uid, it.target || null, it.choice); break;
			case 'planeswalk': E.planeswalk(state, P); break;
			case 'activate': E.activateAbility(state, P, it.uid, it.ability, it.target || null); break;
			case 'equip': E.equip(state, P, it.uid, it.target); break;
			case 'walker': E.useWalker(state, P, it.uid, it.ability, it.target || null); break;
			case 'tap': E.tapLand(state, P, it.uid, it.tapIndex, it.target || null); break;
				case 'sacland': E.sacrificeLand(state, P, it.uid); break;
				case 'tapart': E.tapArtifact(state, P, it.uid, it.target || null); break;
				case 'sactoken': E.sacrificeToken(state, P, it.uid); break;
				case 'heroattack': E.heroAttack(state, P, it.target); break;
			case 'attack': E.attack(state, P, it.attacker, it.target); break;
			case 'land': E.buyLand(state, P, it.defId); break;
				case 'upgrade': E.upgradeLand(state, P, it.uid, it.defId); break;
			case 'trade': E.tradeCard(state, P, it.uid); break;
			case 'prepare': E.prepareCard(state, P, it.uid); break;
			case 'forge': E.forgeCard(state, P, it.uid); break;
			case 'unmask': E.unmask(state, P, it.uid); break;
			case 'coin': E.useCoin(state, P); break;
			case 'endTurn': E.endTurn(state); break;
			case 'concede': E.concede(state, P); break; // pump()'s settleTurn hands the turn on if P was active
			case 'mulligan': E.mulligan(state, P, it.uids || []); break;
			case 'scry': if (state.scryQueue[0]?.chooser === P) E.resolveScry(state, it.picks || []); else return; break;
			case 'discard': if (state.discardQueue[0]?.player === P) E.resolveDiscard(state, it.picks || []); else return; break;
			case 'pick': if (state.pickQueue[0]?.player === P) E.resolvePick(state, it.id); else return; break;
			case 'ask': if (state.askQueue[0]?.player === P) E.resolveAsk(state, it.yes); else return; break;
			case 'sac': if (state.sacQueue[0]?.player === P) E.resolveSac(state, it.uid); else return; break;
			case 'dredge': if (state.dredgeQueue[0]?.player === P) E.resolveDredge(state, it.id); else return; break;
			case 'respond': if (state.priority === P) E.resolveResponse(state, P, it.action ?? null); else return; break;
			default: return;
		}
	} catch (e) { log('(guest action ignored)'); return; }
	pump();
	publishDuel();
}

// the guest renders the host's published board and relays intents; it never
// mutates its own copy — the next authoritative snapshot is the truth
function startDuelGuest(cardsById) {
	HUMAN = duel.seat; // my seat index in the FFA (was hardcoded 1 for 1v1)
	const cm = duel.config;
	const ffa = (duel.size || 2) > 2;
	banner(ffa ? `Free-for-all — ${duel.size} players` : `Duel vs ${cm.host}`);
	log(ffa ? `Live free-for-all: ${duel.size} players, last hero standing wins. Waiting for the board…`
		: `Live duel: you vs ${cm.host}. Waiting for the board…`);
	Chat.mount({ room: 'm:' + duel.id, canPost: true });
	// also broadcast the guest's view to cardstate so a friend of the GUEST (not just
	// the host) can spectate the duel — the host already mirrors via card-publish
	if (MP_ON && !publishStarted) { publishStarted = true; startPublishLoop(); }
	let panelsFor = 0;
	const t0 = performance.now();
	let lastPollNote = '';
	const tick = async () => {
		let data;
		try { data = await MPX.call('card-poll', { id: duel.id, seq: duel.seq }); } // send our seq → server can skip an unchanged snapshot
		catch (e) { duelDebug.pollErrors++; duelDebug.lastError = 'poll: ' + e.message; lastPollNote = 'network error'; return; }
		if (!data) return;
		if (typeof data.watchers === 'number') updateWatcherBadge(data.watchers, data.watcherNames); // guest sees who's watching the game (host's aggregated list)
		lastPollNote = data.error ? data.error : data.unchanged ? 'unchanged' : data.snapshot ? 'snapshot ok' : 'no board yet';
		duelDebug.lastPollAt = performance.now();
		// still waiting for the first board? tell the tester what's happening
		// instead of an eternal silent "Waiting…" (the bug report we can't act on)
		if (!state && performance.now() - t0 > 10000) {
			const secs = Math.round((performance.now() - t0) / 1000);
			$('hint').textContent = `Waiting for ${cm.host}'s board… ${secs}s (last poll: ${lastPollNote})`;
		}
		// while an optimistic action is in flight, don't ingest the host's stale
		// echo (it would revert our local move for a blink before catching up)
		if (data.snapshot && data.seq !== duel.seq && (!duel.hold || performance.now() > duel.hold)) {
			duel.seq = data.seq;
			duel.hold = 0;
			const snap = data.snapshot;
			try {
				// migrate + reattach: the guest's optimistic engine now simulates on the
				// COMPLETE host state (the old spread-rebuild dropped the lazily-created
				// fields, so guest-side predictions ran on a subtly different game)
				state = E.fromSnapshot(snap, cardsById);
				// Desync self-heal: fromSnapshot IS the authoritative rebuild, so play is
				// already corrected — but verify the wire round-trip actually reproduced the
				// host's state. A digest mismatch means a gameplay field silently dropped or
				// mangled in transit (the exact bug that used to desync guests unseen); report
				// it through the throttled beacon so it surfaces on /errors.html instead of
				// two clients quietly diverging.
				if (snap.digest && E.stateDigest(state) !== snap.digest) {
					duelDebug.desyncs++;
					window.reportErr?.(`duel desync: snapshot round-trip mismatch (v${snap.schemaVersion ?? 0}, ${state.players.length}p)`, 'game.js duel ingest');
					console.warn('duel desync: rebuilt state digest != host digest', snap.digest);
				}
				// the guest's own instantiate calls (optimistic plays) must never mint
				// uids that collide with host-minted ones on the ingested board
				E.ensureUidsAbove(E.maxSnapshotUid(snap));
				if (state.players.length !== panelsFor) {
					playerCount = state.players.length;
					frameCamera(); buildPanels(); buildSlotMarkers();
					panelsFor = state.players.length;
				}
				updateHud();
				maybeRecordFrame(); // record the guest's view of each authoritative board (deduped by digest)
				openDuelModals(); // surface any scry/loot/discover the guest must resolve
			} catch (e) {
				// an ingest exception used to die silently and leave "Waiting for the
				// board…" forever — surface it so testers can report something real
				duelDebug.ingestErrors++; duelDebug.lastError = 'ingest: ' + e.message;
				log(`(board update failed: ${e.message})`);
				console.error('duel ingest error', e);
			}
		}
		if (data.over && !$('duel-over')) {
			const won = data.winner === HUMAN;
			finalizeReplay(data.winner); // save the guest's recorded view of the duel
			let title, msg;
			if (data.abandoned && data.winner == null) {
				title = 'DUEL ENDED'; msg = 'The host disconnected — the game ended.'; // FFA: only the host runs the engine
			} else if (won) {
				title = 'YOU WIN!';
				msg = ffa ? 'Last hero standing — you win the free-for-all!'
					: data.abandoned ? `${cm.host} left the duel.` : `You beat ${cm.host}!`;
			} else {
				title = 'DEFEAT';
				const winnerName = data.winner != null ? seatLabel(cm, data.winner) : 'Someone';
				msg = data.abandoned ? 'You left the duel.'
					: ffa ? `${winnerName} wins the free-for-all.` : `${cm.host} wins the duel.`;
			}
			const el = dungeonOverlay(title, msg);
			el.id = 'duel-over';
			// the guest never ran the event stream, so adopt the host's published,
			// seat-indexed tally; appendMatchSummary renders it from this seat's view
			// (life comes from the guest's own ingested final board)
			if (data.stats) { matchStats = data.stats; appendMatchSummary(el); }
			if (!data.abandoned) mountDuelRematch(el); // rematch lobby (1v1 or FFA)
			addReplayButtons(el); // ▶ Watch replay + 🔗 Copy replay link (guest's view)
			el.appendChild(overlayButton('Back to your world', () => { location.href = '/overworld/?mp=1'; }));
		}
	};
	// adaptive: poll fast while the host is acting (updates streaming in),
	// relax while it's your turn to decide
	const loop = () => tick().finally(() => {
		if ($('duel-over')) return;
		setTimeout(loop, state && state.current !== HUMAN ? 300 : 850);
	});
	loop();
}

// the guest surfaces its own pending decision (scry / loot discard / discover)
// only when that decision is at the FRONT of the queue — resolving out of order
// would apply to the host's entry instead. A signature avoids reopening the same
// prompt on every poll.
function openDuelModals() {
	if (!isGuest() || !state) return;
	const sq = state.scryQueue[0], dq = state.discardQueue[0], pq = state.pickQueue[0], dr = state.dredgeQueue[0], aq = state.askQueue[0], scq = state.sacQueue[0];

	let sig = null, open = null;
	if (sq && sq.chooser === HUMAN) { sig = 'scry:' + sq.ids.join(','); open = openScryModal; }
	else if (dq && dq.player === HUMAN) { sig = 'discard:' + dq.count + ':' + state.players[HUMAN].hand.map(c => c.uid).join(','); open = openDiscardModal; }
	else if (pq && pq.player === HUMAN) { sig = 'pick:' + pq.ids.join(','); open = openPickModal; }
	else if (dr && dr.player === HUMAN) { sig = 'dredge:' + dr.ids.join(','); open = openDredgeModal; }
	else if (aq && aq.player === HUMAN) { sig = 'ask:' + (aq.prompt || '') + ':' + (aq.counterPay?.targetUid ?? aq.payOr?.amount ?? ''); open = openAskModal; }
	else if (scq && scq.player === HUMAN) { sig = 'sac:' + scq.uids.join(','); open = openSacModal; }
	else if (state.priority === HUMAN) { sig = 'respond:' + (state.stack[state.stack.length - 1] || {}).uid; open = openRespondModal; }
	// lowest priority: the once-per-game opening mulligan, at the start of your turn
	else if (state.current === HUMAN && state.players[HUMAN] && !state.players[HUMAN].mulliganed && !state.players[HUMAN].eliminated) { sig = 'mulligan'; open = openMulliganModal; }
	if (sig === duel.modalSig) return; // already showing (or already submitted) this one
	duel.modalSig = sig;
	const modal = $('scry-modal');
	if (!sig) { if (modal) modal.style.display = 'none'; return; }
	open();
}

// live counters for the ?debug=1 overlay + failure banners — the first friend
// test failed with "it never loaded" and zero data; never again
const duelDebug = { pubFails: 0, pubOk: 0, pollErrors: 0, ingestErrors: 0, desyncs: 0, lastError: '', lastPollAt: 0, lastPubAt: 0 };
function startDebugOverlay() {
	if (!new URLSearchParams(location.search).has('debug')) return;
	const el = document.createElement('div');
	el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;font:11px monospace;'
		+ 'color:#9fe39f;background:rgba(0,0,0,0.72);padding:6px 9px;border-radius:6px;pointer-events:none;white-space:pre';
	document.body.appendChild(el);
	setInterval(() => {
		const age = t => t ? Math.round((performance.now() - t) / 1000) + 's ago' : 'never';
		el.textContent = `duel ${duel.id || '-'} role=${duel.role || '-'} seq=${duel.seq}\n`
			+ (duel.role === 'host'
				? `publish ok=${duelDebug.pubOk} fail=${duelDebug.pubFails} last=${age(duelDebug.lastPubAt)}`
				: `poll last=${age(duelDebug.lastPollAt)} errs=${duelDebug.pollErrors} ingestErrs=${duelDebug.ingestErrors}`)
			+ `\nturn=${state?.current ?? '-'} over=${state?.over ?? '-'}`
			+ (duelDebug.lastError ? `\nlastError: ${duelDebug.lastError.slice(0, 60)}` : '');
	}, 1000);
}

let duelPubSeq = 0, duelPubStarted = false;
// Same authoritative snapshot as spectate (see snapshotState) — the two
// hand-maintained allow-lists this replaced had already drifted by construction.
function snapshotForDuel() {
	const s = E.toSnapshot(state);
	if (s) s.digest = E.stateDigest(state); // guests verify the wire round-trip against this
	return s;
}
// seat-indexed match stats for the guest's post-game summary. Duration is baked
// in (durS) because the guest can't read the host's performance.now() clock.
function duelStatsPayload() {
	if (!matchStats) return null;
	return { turns: matchStats.turns, cards: matchStats.cards, summons: matchStats.summons,
		heroDmgTaken: matchStats.heroDmgTaken, elim: matchStats.elim || [],
		durS: Math.max(1, Math.round((performance.now() - matchStats.start) / 1000)) };
}
function publishDuel() {
	const cm = duel.config;
	MPX.call('card-publish', {
		id: duel.id, snapshot: snapshotForDuel(), seq: ++duelPubSeq,
		label: `${cm.host} vs ${cm.guest}`,
		over: !!state?.over, winner: state?.winner ?? null,
		stats: duelStatsPayload(),
	}).then(r => {
		if (r?.error) throw new Error(r.error);
		updateWatcherBadge(r && r.watchers, r && r.watcherNames); // duel host: who's watching
		duelDebug.pubOk++; duelDebug.lastPubAt = performance.now();
		if (duelDebug.pubFails >= 3) log('(connection restored — your opponent can see the board again)');
		duelDebug.pubFails = 0;
	}).catch(e => {
		// a silently failing publish means the host plays on while the guest
		// stares at "Waiting for the board…" — make it loud after 3 in a row
		duelDebug.pubFails++; duelDebug.lastError = 'publish: ' + e.message;
		if (duelDebug.pubFails === 3) {
			banner('CONNECTION LOST', 2500);
			log(`(board updates aren't reaching ${cm.guest}: ${e.message} — retrying)`);
		}
	});
}
function startDuelPublish() {
	if (duelPubStarted) return;
	duelPubStarted = true;
	publishDuel();
	setInterval(() => { if (state) publishDuel(); }, 1000);
}

// action wrappers. On the guest they apply the action OPTIMISTICALLY to the
// local board for instant feedback, relay the intent, and briefly pause snapshot
// ingestion so the host's authoritative echo doesn't revert it mid-flight. On the
// host/solo client they run the engine directly and pump.
const isGuest = () => duel.on && duel.role === 'guest';
// apply locally (no event animations — the guest never animates), relay, and hold
function guestApply(localFn, intent) {
	try { localFn(); E.takeEvents(state); } catch (e) { log('(move rejected)'); return; }
	duel.hold = performance.now() + 1300; // don't ingest a stale echo before the host catches up
	updateHud();
	// a monotonic per-guest seq so the host applies our moves in order even if the
	// fire-and-forget relays arrive out of order (the server keys the row by it)
	MPX.call('card-act', { id: duel.id, intent, seq: duel.relaySeq++ }).catch(() => {});
}
// ---------- daily-quest reporting ----------
// Report the cards you play + your match wins so the account backend can advance
// your daily quests. Batched + fire-and-forget; wins flush immediately.
const questQueue = [];
let questFlushT = null;
function questFlush() {
	clearTimeout(questFlushT); questFlushT = null;
	if (!questQueue.length || !MPX.hasToken()) { questQueue.length = 0; return; }
	const events = questQueue.splice(0, questQueue.length);
	MPX.call('quest-event', { events }).catch(() => {});
}
function questReport(ev) {
	if (!MPX.hasToken() || isGuest()) return;
	questQueue.push(ev);
	if (ev.kind === 'win' || questQueue.length >= 12) return questFlush();
	clearTimeout(questFlushT);
	questFlushT = setTimeout(questFlush, 1500);
}
addEventListener('pagehide', questFlush); // don't lose a partial batch on exit

function actPlay(uid, target, choice, position, useAlt, kicked) {
	if (isGuest()) return guestApply(() => E.playCard(state, HUMAN, uid, target, choice, position, useAlt, kicked), { k: 'play', uid, target: target || null, choice, position, useAlt, kicked });
	const c = state.players[HUMAN]?.hand.find(x => x.uid === uid); // capture before it leaves hand
	E.playCard(state, HUMAN, uid, target, choice, position, useAlt, kicked); pump();
	if (c && !state.players[HUMAN].hand.some(x => x.uid === uid)) // it really got played
		questReport({ kind: 'play', cardClass: c.cardClass, cardType: c.type, cost: c.cost, keywords: c.keywords || [] });
	if (duel.on) publishDuel();
}
function actAdventure(uid, target, choice) {
	if (isGuest()) return guestApply(() => E.playAdventure(state, HUMAN, uid, target, choice), { k: 'adventure', uid, target: target || null, choice });
	E.playAdventure(state, HUMAN, uid, target, choice); pump();
	if (duel.on) publishDuel();
}
function actPower(uid, target, choice) {
	if (isGuest()) return guestApply(() => E.useHeroPower(state, HUMAN, uid, target, choice), { k: 'power', uid, target: target || null, choice });
	E.useHeroPower(state, HUMAN, uid, target, choice); pump();
	if (duel.on) publishDuel();
}
function actAttack(attacker, target) {
	if (isGuest()) return guestApply(() => { E.attack(state, HUMAN, attacker, target); clearModes(); }, { k: 'attack', attacker, target });
	E.attack(state, HUMAN, attacker, target); clearModes(); pump();
	if (duel.on) publishDuel();
}
function actLand(defId) {
	if (isGuest()) return guestApply(() => E.buyLand(state, HUMAN, defId), { k: 'land', defId });
	E.buyLand(state, HUMAN, defId); pump();
	if (duel.on) publishDuel();
}
function actUpgrade(uid, defId) {
	if (isGuest()) return guestApply(() => E.upgradeLand(state, HUMAN, uid, defId), { k: 'upgrade', uid, defId });
	E.upgradeLand(state, HUMAN, uid, defId); pump();
	if (duel.on) publishDuel();
}
// tapping a land for one of its abilities (e.g. Swamp → conjure a black card).
// The TARGETED path relays via commitPending; this is the no-target path, which
// previously ran the engine locally on the guest without relaying — so the host
// never tapped/conjured and its next snapshot reverted the optimistic result.
function actTapLand(uid, tapIndex, target) {
	if (isGuest()) return guestApply(() => E.tapLand(state, HUMAN, uid, tapIndex, target || null), { k: 'tap', uid, tapIndex, target: target || null });
	E.tapLand(state, HUMAN, uid, tapIndex, target || null); pump();
	if (duel.on) publishDuel();
}
// cashing a land in for a card (Sacrifice: draw). Same relay gap as the tap above.
function actSacLand(uid) {
	if (isGuest()) return guestApply(() => E.sacrificeLand(state, HUMAN, uid), { k: 'sacland', uid });
	E.sacrificeLand(state, HUMAN, uid); pump();
	if (duel.on) publishDuel();
}
// The following mirror the tap fix: the TARGETED forms already relay via
// commitPending, but the no-target menu paths ran the engine locally without
// relaying, so a duel guest's action was reverted by the host's next snapshot.
function actActivate(uid, ability, target) { // creature activated ability, no target
	if (isGuest()) return guestApply(() => E.activateAbility(state, HUMAN, uid, ability, target || null), { k: 'activate', uid, ability, target: target || null });
	E.activateAbility(state, HUMAN, uid, ability, target || null); pump();
	if (duel.on) publishDuel();
}
function actWalker(uid, ability, target) { // planeswalker loyalty ability, no target
	if (isGuest()) return guestApply(() => E.useWalker(state, HUMAN, uid, ability, target || null), { k: 'walker', uid, ability, target: target || null });
	E.useWalker(state, HUMAN, uid, ability, target || null); pump();
	if (duel.on) publishDuel();
}
function actTapArtifact(uid, target) { // {T} artifact ability (mana rocks etc.)
	if (isGuest()) return guestApply(() => E.tapArtifact(state, HUMAN, uid, target || null), { k: 'tapart', uid, target: target || null });
	E.tapArtifact(state, HUMAN, uid, target || null); pump();
	if (duel.on) publishDuel();
}
function actSacToken(uid) { // cash in a Treasure/Blood/Food token
	if (isGuest()) return guestApply(() => E.sacrificeToken(state, HUMAN, uid), { k: 'sactoken', uid });
	E.sacrificeToken(state, HUMAN, uid); pump();
	if (duel.on) publishDuel();
}
function actHeroAttack(target) { // your hero swings at a creature/walker/hero
	if (isGuest()) return guestApply(() => { E.heroAttack(state, HUMAN, target); clearModes(); }, { k: 'heroattack', target });
	E.heroAttack(state, HUMAN, target); clearModes(); pump();
	if (duel.on) publishDuel();
}
function actTrade(uid) {
	if (isGuest()) return guestApply(() => E.tradeCard(state, HUMAN, uid), { k: 'trade', uid });
	E.tradeCard(state, HUMAN, uid); pump();
	if (duel.on) publishDuel();
}
function actForge(uid) {
	if (isGuest()) return guestApply(() => E.forgeCard(state, HUMAN, uid), { k: 'forge', uid });
	E.forgeCard(state, HUMAN, uid); pump();
}
function actPrepare(uid) {
	if (isGuest()) return guestApply(() => E.prepareCard(state, HUMAN, uid), { k: 'prepare', uid });
	E.prepareCard(state, HUMAN, uid); pump();
	if (duel.on) publishDuel();
}
function actUnmask(uid) {
	if (isGuest()) return guestApply(() => E.unmask(state, HUMAN, uid), { k: 'unmask', uid });
	E.unmask(state, HUMAN, uid); pump();
	if (duel.on) publishDuel();
}
function actEndTurn() {
	if (isGuest()) return guestApply(() => E.endTurn(state), { k: 'endTurn' });
	E.endTurn(state); pump();
	if (duel.on) publishDuel();
}
function actCoin() {
	if (isGuest()) { guestApply(() => E.useCoin(state, HUMAN), { k: 'coin' }); return true; }
	const ok = E.useCoin(state, HUMAN); if (ok) { pump(); if (duel.on) publishDuel(); } return ok;
}

function actPlaneswalk() {
	if (isGuest()) { guestApply(() => E.planeswalk(state, HUMAN), { k: 'planeswalk' }); return true; }
	const ok = E.planeswalk(state, HUMAN); if (ok) { pump(); if (duel.on) publishDuel(); } return ok;
}

async function start() {
	for (const uid of [...entities.keys()]) removeEntity(uid);
	queue.length = 0;
	queueBusy = false;
	clearModes();
	Chat.clear(); // fresh game → fresh chat log (no-op if chat isn't mounted)
	$('restart').style.display = 'none';
	$('player-count').value = String(playerCount);
	logEl.innerHTML = '';
	logHistory.length = 0; // fresh match → fresh log history
	if (logFull) { logFull.classList.remove('open'); if (logFullBody) logFullBody.innerHTML = ''; }
	buildTable();
	frameCamera();
	const data = await (await fetch('cards.json')).json();
	const cardsById = {};
	for (const d of data.cards) cardsById[d.id] = d;
	Rec.cancel(); // a new game (or restart) discards any half-recorded tape
	if (replayMode) { await startReplay(cardsById); return; }
	if (spectateMode) { startSpectate(cardsById); return; }
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
	if (duel.on) { await startDuel(cardsById); return; }
	if (aiMatchId) { await startAiMatch(cardsById); return; }
	// bare visit = the landing menu; any mode param (battle/players/boss/
	// dungeon) boots straight in, so tests and deep links skip it
	if (!location.search && !menuChosen) {
		const mode = await mainMenu();
		if (mode === 'dungeon') { location.href = '?dungeon=1'; return; }
		if (mode === 'heist') { location.href = '?heist=1'; return; }
		if (mode === 'tombs') { location.href = '?tombs=1'; return; }
		if (mode === 'duels') { location.href = '?duels=1'; return; }
		menuChosen = true;
	}
	if (dungeonRunMode) {
		let run = loadRun();
		// a saved run offers resume-or-abandon; it never locks the class choice
		if (run && run.active && !(await resumeRunOverlay(run))) {
			clearRun();
			run = null;
		}
		if (!run || !run.active) {
			const clsId = await pickClassOverlay();
			run = {
				active: true, classId: clsId, level: 1,
				deck: [...(await dungeonStarterDeck(clsId))],
				passives: [], bossId: Dungeon.randomBoss(1),
			};
			saveRun(run);
		}
		bootEncounter(cardsById, run.bossId, run.classId, run.deck, run.passives, run.level);
	} else if (heistRunMode) {
		heistCardsById = cardsById; // pre-state overlays need the card defs
		let run = loadHeist();
		if (run && run.active && !(await resumeHeistOverlay(run))) {
			clearHeist();
			run = null;
		}
		if (!run || !run.active) {
			const wing = await pickWingOverlay();
			const heroId = await pickHeroOverlay();
			const hero = Heist.HEROES.find(h => h.id === heroId);
			const powerId = await pickPowerOverlay(hero);
			const anomaly = await pickAnomalyOverlay();
			run = {
				active: true, heroId, powerId, wing, level: 1, anomaly,
				deck: [...Dungeon.STARTER_DECKS[hero.heroClass]],
				passives: [], bossId: heistBossFor(wing, 1),
			};
			saveHeist(run);
		}
		bootHeistEncounter(cardsById, run);
	} else if (tombsRunMode) {
		tombsCardsById = cardsById; // pre-state overlays need the card defs
		let run = loadTombs();
		if (run && run.active && !(await resumeTombsOverlay(run))) {
			clearTombs();
			run = null;
		}
		if (!run || !run.active) {
			const chapter = await pickChapterOverlay();
			const explorerId = await pickExplorerOverlay();
			const explorer = Tombs.EXPLORERS.find(h => h.id === explorerId);
			const powerId = await pickTombsPowerOverlay(explorer);
			run = {
				active: true, explorerId, powerId, chapter, level: 1,
				deck: [...Dungeon.STARTER_DECKS[explorer.heroClass]],
				passives: [], bossId: tombsBossFor(chapter, 1),
			};
			saveTombs(run);
		}
		bootTombsEncounter(cardsById, run);
	} else if (duelsRunMode) {
		duelsCardsById = cardsById; // pre-state overlays need the card defs
		let run = loadDuels();
		if (run && run.active && !(await resumeDuelsOverlay(run))) {
			clearDuels();
			run = null;
		}
		if (!run || !run.active) {
			const heroId = await pickDuelsHeroOverlay();
			let hero = Duels.HEROES.find(h => h.id === heroId);
			// Drek'Thar / Vanndar: pick one of the general's classes, then play as it
			let classChoice = null;
			if (Duels.classChoicesOf(hero)) {
				classChoice = await pickDuelsClassOverlay(hero);
				hero = { ...hero, heroClass: classChoice, classes: [classChoice] };
			}
			const powerId = await pickDuelsPowerOverlay(hero);
			const anomaly = await pickAnomalyOverlay('The rules of the Duel bend. Take on a run-wide twist for an extra challenge, or duel clean.');
			const deck = await pickDuelsDraftOverlay(Duels.classesOf(hero));
			run = { active: true, heroId, classChoice, powerId, anomaly, deck, passives: [], wins: 0, losses: 0, enemy: genDuelsEnemy(cardsById, 0) };
			saveDuels(run);
		}
		bootDuelsEncounter(cardsById, run);
	} else if (arenaRunMode) {
		duelsCardsById = cardsById; // pre-state overlays reuse this stash
		let run = loadArena();
		if (run && run.active && !(await resumeArenaOverlay(run))) { clearArena(); run = null; }
		if (!run || !run.active) {
			const heroId = await pickDuelsHeroOverlay();
			let hero = Duels.HEROES.find(h => h.id === heroId);
			let classChoice = null;
			if (Duels.classChoicesOf(hero)) { classChoice = await pickDuelsClassOverlay(hero); hero = { ...hero, heroClass: classChoice, classes: [classChoice] }; }
			const powerId = await pickDuelsPowerOverlay(hero);
			const deck = await pickDuelsDraftOverlay(Duels.classesOf(hero), 30);
			run = { active: true, heroId, classChoice, powerId, anomaly: null, deck, wins: 0, losses: 0, enemy: genArenaEnemy(cardsById) };
			saveArena(run);
		}
		bootArenaEncounter(cardsById, run);
	} else if (dungeonBossId) {
		// one-off encounter: ?class= if it has a starter deck, else saved, else mage
		const wanted = new URLSearchParams(location.search).get('class');
		const clsId = Dungeon.STARTER_DECKS[wanted] ? wanted
			: (Dungeon.STARTER_DECKS[localStorage.getItem('magepunk_class_v1')]
				? localStorage.getItem('magepunk_class_v1') : 'mage');
		bootEncounter(cardsById, dungeonBossId, clsId, Dungeon.STARTER_DECKS[clsId], [], null);
	} else {
		const picks = pickClasses();
		// use the saved deck when it's complete and valid; otherwise the demo deck
		const collection = Col.getCollection(data.cards);
		const saved = Col.loadDeck();
		const deckOk = saved.length === Col.DECK_SIZE
			&& !Col.validateDeck(saved, cardsById, collection, picks[HUMAN]?.id);
		state = E.createGame(cardsById, Math.random, deckOk ? saved : null, playerCount, picks);
		state.classPicks = picks;
		log(deckOk ? 'Using your custom deck.' : 'Using the demo deck — build one in the deck builder!');
		if (picks[HUMAN]) log(`You are a ${picks[HUMAN].name}.`);
		if (playerCount > 2) log(`Free-for-all: ${playerCount} players, last hero standing wins.`);
	}
	buildPanels();
	buildSlotMarkers();
	pump();
	updateHud();
	// once in MP mode, broadcast the board so friends can spectate the run/battle
	if (MP_ON && !spectateMode && !publishStarted) { publishStarted = true; startPublishLoop(); }
}
let publishStarted = false;

function bootEncounter(cardsById, bossId, clsId, deckIds, passives, level) {
	dungeonBossId = bossId;
	const boss = Dungeon.BOSSES[bossId];
	const clsPick = classRegistry.find(c => c.id === clsId)
		|| { id: clsId, name: clsId, power: null };
	const bossPick = { id: bossId, name: boss.name, power: boss.power || null };
	const picks = [clsPick, bossPick];
	state = E.createGame(cardsById, Math.random, [...deckIds], 2, picks);
	state.classPicks = picks;
	// boss surgery: its recorded deck, no western corner zones. In a dungeon
	// run both heroes share a scaling life total (15 at level 1, +5 each level);
	// a one-off ?boss= fight keeps the boss's designed health.
	const bp = state.players[1];
	const runHP = level ? 15 + (level - 1) * 5 : null;
	const bossHP = runHP ?? boss.health;
	E.applyHeroMods(state, 1, { life: bossHP, maxLife: bossHP });
	if (runHP != null) E.applyHeroMods(state, HUMAN, { life: runHP, maxLife: runHP });
	E.resetDeckAndHand(state, 1, boss.deck);
	E.drawCards(state, 1, 4);
	if (boss.passive === 'battlecries-twice' || boss.passive === 'both-twice') E.applyHeroMods(state, 1, { battlecriesTwice: true });
	if (boss.passive === 'deathrattles-twice' || boss.passive === 'both-twice') E.applyHeroMods(state, 1, { deathrattlesTwice: true });
	E.stripLoadouts(state);
	applyTreasures(passives || []);
	log(`${level ? `Dungeon level ${level}` : 'Dungeon Run'} — ${boss.name} (${bp.life} HP): "${boss.flavor}"`);
	if (boss.power) log(`Boss power — ${boss.power.name} (${boss.power.cost}): ${boss.power.text}`);
	if (boss.passive) log(`Boss passive — ${boss.passive.replace(/-/g, ' ')}.`);
	log(`You are a ${clsPick.name} with a ${deckIds.length}-card dungeon deck.`);
	for (const t of passives || []) log(`Treasure — ${Dungeon.TREASURES[t].name}: ${Dungeon.TREASURES[t].text}`);
}

// run passives, applied at the start of every fight
function applyTreasures(ids) {
	const p = state.players[HUMAN]; // read-only here — writes go through E.* setup APIs
	const emblem = (id, fields) => E.grantEmblem(state, HUMAN, {
		id, name: Dungeon.TREASURES[id].name,
		description: Dungeon.TREASURES[id].text, ...fields,
	});
	for (const t of ids) {
		switch (t) {
			case 'potion_of_vitality': E.applyHeroMods(state, HUMAN, { life: p.life * 2, maxLife: p.life * 2 }); break;
			case 'crystal_gem': E.addManaCrystal(state, HUMAN); break;
			case 'small_backpacks': E.drawCards(state, HUMAN, 2); break;
			case 'captured_flag': emblem(t, { aura: { attack: 1, health: 1 } }); break;
			case 'khadgars_scrying_orb': emblem(t, { costMod: { cardType: 'spell', amount: -1, scope: 'own' } }); break;
			case 'grommashs_armguards': emblem(t, { costMod: { cardType: 'weapon', amount: -99, floor: 1, scope: 'own' } }); break;
			case 'scepter_of_summoning': emblem(t, { costMod: { cardType: 'creature', amount: -99, floor: 5, minCost: 5, scope: 'own' } }); break;
			case 'robe_of_the_magi': emblem(t, { static: { type: 'spell-damage', value: 3 } }); break;
			case 'glyph_of_warding': emblem(t, { costMod: { cardType: 'creature', amount: 1, scope: 'enemies' } }); break;
			case 'cloak_of_invisibility': emblem(t, { aura: { keywords: ['stealth'] } }); break;
			case 'mysterious_tome': {
				const secrets = Object.values(state.cardsById).filter(d => d.secret && !d.token);
				for (let i = 0; i < 3 && secrets.length; i++) {
					const d = secrets.splice(Math.floor(Math.random() * secrets.length), 1)[0];
					E.installSecret(state, HUMAN, d.id);
				}
				break;
			}
			case 'totem_of_the_dead': E.applyHeroMods(state, HUMAN, { deathrattlesTwice: true }); break;
			case 'battle_totem': E.applyHeroMods(state, HUMAN, { battlecriesTwice: true }); break;
			// caps every hero-power slot; at dungeon boot the human's only slot IS
			// the class power the old classPowerOf() targeted
			case 'justicars_ring': E.capHeroPowerCost(state, HUMAN, 1); break;
		}
	}
}

// ---------- dungeon run overlays ----------
// ---------- post-game summary ----------
// Append a compact stat block to an end-of-game overlay: match length + turns,
// and (in a 2-player game) a You-vs-opponent table. Damage-to-hero is credited
// to the other seat, so "damage to enemy hero" reads from the opponent's taken.
function appendMatchSummary(el) {
	if (!matchStats || !state || !state.players) return;
	const ms = matchStats, pc = state.players.length;
	// the guest renders from the host's published stats (durS baked in); the host
	// has a live `start` timestamp to measure against
	const durS = ms.durS != null ? ms.durS : Math.max(1, Math.round((performance.now() - ms.start) / 1000));
	const dur = `${Math.floor(durS / 60)}:${String(durS % 60).padStart(2, '0')}`;
	const box = document.createElement('div');
	box.style.cssText = 'margin:2px 0 14px;min-width:280px;max-width:520px;width:100%;font-size:14px;';
	if (pc === 2) {
		const opp = 1 - HUMAN;
		const life = p => Math.max(0, state.players[p]?.life ?? 0);
		const my = k => ms[k][HUMAN] || 0, op = k => ms[k][opp] || 0;
		const row = (lbl, a, b) => {
			const hiA = a > b ? 'color:#ffd25f;' : '', hiB = b > a ? 'color:#ffd25f;' : '';
			return `<tr><td style="text-align:left;padding:5px 10px;opacity:.85">${lbl}</td>`
				+ `<td style="text-align:right;padding:5px 10px;font-weight:700;${hiA}">${a}</td>`
				+ `<td style="text-align:right;padding:5px 10px;font-weight:700;${hiB}">${b}</td></tr>`;
		};
		box.innerHTML = `<table style="width:100%;border-collapse:collapse;margin:0 auto;">`
			+ `<tr style="opacity:.55;font-size:11px;letter-spacing:1px;text-transform:uppercase">`
			+ `<td style="text-align:left;padding:4px 10px">${dur} · ${ms.turns} turns</td>`
			+ `<td style="text-align:right;padding:4px 10px">You</td>`
			+ `<td style="text-align:right;padding:4px 10px">${esc2(nameOf(opp))}</td></tr>`
			+ row('Cards played', my('cards'), op('cards'))
			+ row('Creatures summoned', my('summons'), op('summons'))
			+ row('Damage to enemy hero', ms.heroDmgTaken[opp] || 0, ms.heroDmgTaken[HUMAN] || 0)
			+ row('Life remaining', life(HUMAN), life(opp))
			+ `</table>`;
	} else {
		// FFA (3–8 players): a standings table — 1st = the survivor, then the rest in
		// REVERSE elimination order (the last player knocked out places higher)
		const elim = ms.elim || [];
		const order = [];
		if (state.winner != null) order.push(state.winner);
		for (let i = elim.length - 1; i >= 0; i--) if (!order.includes(elim[i].seat)) order.push(elim[i].seat);
		for (let s = 0; s < pc; s++) if (!order.includes(s)) order.push(s); // safety: place anyone left (draw / missing data)
		const ordinal = n => { const t = n % 100, o = n % 10; return n + (t >= 11 && t <= 13 ? 'th' : o === 1 ? 'st' : o === 2 ? 'nd' : o === 3 ? 'rd' : 'th'); };
		const elimTurn = seat => { const e = elim.find(x => x.seat === seat); return e ? e.turn : null; };
		const rows = order.map((seat, i) => {
			const you = seat === HUMAN;
			const t = elimTurn(seat);
			const result = seat === state.winner ? 'Survived' : (t ? `KO’d · turn ${t}` : 'Eliminated');
			return `<tr style="${you ? 'background:rgba(143,111,255,.15);' : ''}">`
				+ `<td style="text-align:center;padding:5px 8px;font-weight:800;${i === 0 ? 'color:#ffd25f;' : ''}">${ordinal(i + 1)}</td>`
				+ `<td style="text-align:left;padding:5px 8px;font-weight:700;">${you ? 'You' : esc2(nameOf(seat))}</td>`
				+ `<td style="text-align:left;padding:5px 8px;opacity:.82;font-size:12px;">${result}</td>`
				+ `<td style="text-align:right;padding:5px 8px;">${ms.cards[seat] || 0}</td>`
				+ `<td style="text-align:right;padding:5px 8px;">${ms.summons[seat] || 0}</td></tr>`;
		}).join('');
		box.innerHTML = `<div style="opacity:.55;font-size:11px;letter-spacing:1px;text-transform:uppercase;padding:2px 8px 6px">`
			+ `Final standings · ${dur} · ${ms.turns} turns · ${pc} players</div>`
			+ `<table style="width:100%;border-collapse:collapse;margin:0 auto;">`
			+ `<tr style="opacity:.5;font-size:10.5px;letter-spacing:1px;text-transform:uppercase">`
			+ `<td style="padding:2px 8px">#</td><td style="padding:2px 8px">Player</td><td style="padding:2px 8px">Result</td>`
			+ `<td style="text-align:right;padding:2px 8px">Cards</td><td style="text-align:right;padding:2px 8px">Summ.</td></tr>`
			+ rows + `</table>`;
	}
	el.appendChild(box);
}
// tiny HTML escape for names injected into the summary table
function esc2(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
// full end screen for Quick Match / AI matches: result + stats + next-step buttons
function showPostGameSummary(winner) {
	const won = winner === HUMAN, drew = winner == null;
	const el = dungeonOverlay(won ? 'VICTORY!' : drew ? 'DRAW' : 'DEFEAT',
		drew ? "It's a draw." : won ? 'You won the match!' : `${esc2(nameOf(winner))} wins.`);
	el.id = 'postgame';
	appendMatchSummary(el);
	// Play again: a fresh Quick Match (dropping any aimatch param) or an in-place restart
	el.appendChild(overlayButton('Play again', () => { if (aiMatchId) location.href = 'index.html'; else { hideDungeonOverlay(); $('restart').style.display = 'none'; start(); } }));
	el.appendChild(overlayButton('Find Match', () => { location.href = 'start.html'; }));
	el.appendChild(overlayButton('Deck Builder', () => { location.href = 'deck.html'; }));
	addReplayButtons(el); // ▶ Watch replay + 🔗 Copy replay link
	el.appendChild(overlayButton('View final board', () => { hideDungeonOverlay(); $('restart').style.display = ''; }));
}
// Rematch lobby on a finished match's overlay (1v1 OR N-player FFA): tap Rematch
// to opt in; when enough of the table opts in (or a short grace passes) the server
// mints a fresh match reusing everyone's decks — AI-backfilling anyone who didn't
// return — and all opted-in players jump into it. Poll surfaces the live count and
// lets a late player join.
function mountDuelRematch(el) {
	if (!duel.on || !duel.id || !duel.config) return;
	const cm = duel.config;
	const seatsArr = duelSeats(cm);
	const humans = cm.humans || seatsArr.filter(s => s.name).map(s => s.name);
	const me = (seatsArr[HUMAN] && seatsArr[HUMAN].name) || (HUMAN === 0 ? cm.host : cm.guest);
	const ffa = humans.length > 2;
	const opp = () => humans.find(n => n !== me) || 'your opponent';
	const btn = overlayButton('Rematch', () => sendOffer());
	const note = document.createElement('div');
	note.style.cssText = 'opacity:.75;font-size:12px;min-height:15px;margin:2px 0 6px;';
	el.appendChild(btn); el.appendChild(note);
	let done = false, joinedSelf = false, iClicked = false, poll = null;
	const go = (mid) => { done = true; if (poll) clearInterval(poll); location.href = '/battlecards/?cardpvp=' + encodeURIComponent(mid) + '&mp=1'; };
	const status = (joined) => {
		joined = joined || [];
		if (joinedSelf) note.textContent = ffa ? `Rematch lobby — ${joined.length}/${humans.length} ready…` : `Waiting for ${opp()}…`;
		else if (joined.length) note.textContent = ffa ? `${joined.length} player${joined.length > 1 ? 's' : ''} want a rematch — join!` : `${opp()} wants a rematch!`;
		else note.textContent = '';
	};
	async function sendOffer() {
		iClicked = true; joinedSelf = true;
		btn.disabled = true; btn.textContent = ffa ? 'In the rematch lobby' : 'Rematch offered';
		try {
			const r = await MPX.call('duel-rematch', { id: duel.id, op: 'offer' });
			if (r && (r.matchId || r.rematchMatchId)) return go(r.matchId || r.rematchMatchId);
			status(r && r.joined);
		} catch (e) { note.textContent = 'Could not reach the table.'; btn.disabled = false; btn.textContent = 'Rematch'; iClicked = false; joinedSelf = false; }
	}
	poll = setInterval(async () => {
		if (done) return;
		let r; try { r = await MPX.call('duel-rematch', { id: duel.id, op: 'poll' }); } catch (e) { return; }
		if (!r) return;
		if (r.rematchMatchId) return go(r.rematchMatchId);
		const joined = r.joined || [];
		// self-heal: I opted in but a concurrent write dropped my join → re-send it
		if (iClicked && !joined.includes(me)) MPX.call('duel-rematch', { id: duel.id, op: 'offer' }).catch(() => {});
		joinedSelf = iClicked || joined.includes(me); // stay "in the lobby" once I've clicked
		// someone opted in but I'm not in yet → prompt me to join (the button stays live)
		if (!joinedSelf && joined.length) btn.textContent = ffa ? `Join rematch (${joined.length}/${humans.length})` : `Accept ${opp()}'s rematch`;
		status(joined);
	}, 1500);
}
function dungeonOverlay(title, sub) {
	let el = $('dungeon-overlay');
	if (!el) {
		el = document.createElement('div');
		el.id = 'dungeon-overlay';
		el.style.cssText = 'position:fixed;inset:0;z-index:60;background:rgba(8,6,14,0.92);'
			+ 'display:flex;flex-direction:column;align-items:center;justify-content:safe center;'
			+ 'font-family:inherit;color:#e8e0d0;text-align:center;padding:20px;overflow:auto;';
		document.body.appendChild(el);
	}
	el.innerHTML = `<h1 style="margin:0 0 6px;font-size:30px;letter-spacing:2px;">${title}</h1>`
		+ (sub ? `<div style="opacity:0.8;margin-bottom:18px;">${sub}</div>` : '');
	el.style.display = 'flex';
	return el;
}
function hideDungeonOverlay() {
	const el = $('dungeon-overlay');
	if (el) el.style.display = 'none';
	hideMiniTip();
}
function overlayButton(label, onClick) {
	const b = document.createElement('button');
	b.textContent = label;
	b.style.cssText = 'margin:8px;padding:10px 22px;font-size:15px;cursor:pointer;'
		+ 'background:#2a2440;color:#e8e0d0;border:1px solid #6a5f8a;border-radius:8px;';
	b.addEventListener('click', onClick);
	return b;
}
// overlay card tooltip: the mini faces are too small to read, so hovering
// (or tapping, on touch) shows the card's full rules text
let miniTip = null;
function showMiniTip(def, x, y) {
	if (!miniTip) {
		miniTip = document.createElement('div');
		miniTip.id = 'mini-tip';
		miniTip.style.cssText = 'position:fixed;z-index:70;max-width:250px;display:none;'
			+ 'background:rgba(16,12,28,0.96);border:1px solid #6a5a9a;border-radius:8px;'
			+ 'padding:10px 12px;color:#e8e2f4;font-size:13px;line-height:1.4;text-align:left;'
			+ 'pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,0.7);';
		document.body.appendChild(miniTip);
		// tapping anything that isn't a card face dismisses it (touch has no hover-out)
		addEventListener('pointerdown', ev => {
			if (!(ev.target instanceof HTMLCanvasElement)) hideMiniTip();
		}, true);
	}
	const stats = def.type === 'creature' ? ` · ${def.attack}/${def.health}`
		: def.type === 'weapon' ? ` · ${def.attack}/${def.durability}`
		: def.type === 'location' ? ` · ${def.durability} uses` : '';
	const typeLabel = def.type === 'heropower' ? 'Hero Power' : def.type;
	// hero-power descriptions often repeat "Hero Power (N):" — the header
	// already shows the cost and label, so strip that redundant prefix
	let desc = def.description
		? richHtml(def.type === 'heropower' ? def.description.replace(/^Hero Power\s*\(\d+\)\s*:\s*/i, '') : def.description)
		: '<i>No rules text.</i>';
	const kwLines = keywordsFor(def).map(k =>
		`<div style="margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.12);font-size:11.5px;line-height:1.3;"><b style="color:#9fd0ff;">${k.label}</b> <span style="opacity:0.85;">${k.text}</span></div>`).join('');
	miniTip.innerHTML = `<div style="font-weight:bold;color:#cbb8ff;margin-bottom:3px;">${def.name}</div>`
		+ `<div style="opacity:0.7;font-size:11px;margin-bottom:6px;">${def.cost ?? 0} mana · ${typeLabel}${stats}</div>`
		+ `<div>${desc}</div>` + kwLines;
	miniTip.style.display = 'block';
	miniTip.style.left = Math.max(6, Math.min(x + 14, innerWidth - 262)) + 'px';
	miniTip.style.top = Math.max(6, Math.min(y + 12, innerHeight - miniTip.offsetHeight - 10)) + 'px';
}
function hideMiniTip() { if (miniTip) miniTip.style.display = 'none'; }

// hover (PC) or long-press (mobile) on any DOM element to reveal a card's
// rules; `el._tipFired` records that a long-press showed the tip, so a
// tappable element can suppress its click when the gesture was a hold
function attachTip(el, def) {
	// Mouse/pen: hovering shows the tip. Gated on the event's pointerType (not the
	// global TOUCH flag) so a mouse still gets hover tips on hybrid / touch-primary
	// devices where (pointer: coarse) matches (e.g. touchscreen laptops).
	const hoverShow = ev => { if (ev.pointerType !== 'touch') showMiniTip(def, ev.clientX, ev.clientY); };
	el.addEventListener('pointerenter', hoverShow);
	el.addEventListener('pointermove', hoverShow);
	el.addEventListener('pointerleave', ev => { if (ev.pointerType !== 'touch') hideMiniTip(); });
	// Touch: a long-press reveals the tip (touch has no hover); _tipFired lets a
	// tappable element suppress its click when the gesture was a hold.
	let t = null;
	el.addEventListener('pointerdown', ev => {
		if (ev.pointerType !== 'touch') return;
		clearTimeout(t);
		el._tipFired = false;
		const x = ev.clientX, y = ev.clientY;
		t = setTimeout(() => { el._tipFired = true; showMiniTip(def, x, y); }, 350);
	});
	const cancel = () => clearTimeout(t);
	el.addEventListener('pointerup', cancel);
	el.addEventListener('pointercancel', cancel);
	el.addEventListener('pointerleave', cancel);
}

function miniFace(def, width = 96) {
	const c = drawCardFace(def, {});
	const height = Math.round(width * 134 / 96);
	c.style.cssText = `width:${width}px;height:${height}px;border-radius:6px;`;
	attachTip(c, def);
	// real art lazy-loads after the first paint — redraw once it has arrived
	const redraw = () => {
		const f = drawCardFace(def, {});
		const ctx = c.getContext('2d');
		ctx.clearRect(0, 0, c.width, c.height);
		ctx.drawImage(f, 0, 0);
	};
	setTimeout(redraw, 700);
	setTimeout(redraw, 2200);
	return c;
}

// landing menu: shown on a bare visit (no mode in the URL)
let menuChosen = false;
function mainMenu() {
	return new Promise(resolve => {
		const el = dungeonOverlay('MAGEPUNK BATTLECARDS', 'Choose your game.');
		const col = document.createElement('div');
		col.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:10px;';
		const big = (label, sub, fn) => {
			const b = document.createElement('button');
			b.innerHTML = `<div style="font-size:22px;letter-spacing:2px;">${label}</div>`
				+ `<div style="font-size:12px;opacity:0.75;margin-top:4px;">${sub}</div>`;
			b.style.cssText = 'width:340px;padding:18px 26px;cursor:pointer;border-radius:12px;'
				+ 'background:#2a2440;color:#e8e0d0;border:1px solid #6a5f8a;';
			b.addEventListener('mouseenter', () => { b.style.background = '#3a3258'; });
			b.addEventListener('mouseleave', () => { b.style.background = '#2a2440'; });
			b.addEventListener('click', fn);
			return b;
		};
		col.appendChild(big('TEST BATTLE', 'the battle table — 2 to 8 players, your deck or the demo deck',
			() => { hideDungeonOverlay(); resolve('battle'); }));
		col.appendChild(big('OG DUNGEON RUN', 'eight bosses, card buckets, and treasures — pick a class and descend',
			() => resolve('dungeon')));
		col.appendChild(big('DALARAN HEIST', 'nine heroes, five chapters — an eight-boss climb with anomalies & treasures',
			() => resolve('heist')));
		col.appendChild(big('TOMBS OF TERROR', 'four Explorers, four chapters — delve to a Plague Lord for treasures & passives',
			() => resolve('tombs')));
		col.appendChild(big('DUELS', 'eleven heroes — draft a deck, then run it to 12 wins or 3 losses against rivals at your power',
			() => resolve('duels')));
		el.appendChild(col);
	});
}

// returning mid-run: resolve true to resume the saved run, false to abandon
function resumeRunOverlay(run) {
	return new Promise(resolve => {
		const cls = classRegistry.find(c => c.id === run.classId);
		const el = dungeonOverlay('RUN IN PROGRESS',
			`You have a level ${run.level} run going as ${cls ? cls.name : run.classId} (${run.deck.length} cards).`);
		el.appendChild(overlayButton(`Continue level ${run.level}`, () => { hideDungeonOverlay(); resolve(true); }));
		el.appendChild(overlayButton('Abandon — new run, new class', () => { hideDungeonOverlay(); resolve(false); }));
	});
}

// the run's starting deck: always the stock 10-card dungeon deck. Dungeon runs
// are a separate mode from constructed PvP — the account's 40-card PvP decks
// (user.decks) are NOT used here, and dungeon decks can't be taken into PvP.
async function dungeonStarterDeck(clsId) {
	return Dungeon.STARTER_DECKS[clsId];
}

// a finished run pays out one pack, win or lose
// which run mode is this? (drives the per-mode achievement counters server-side)
const runModeName = () => arenaRunMode ? 'arena' : duelsRunMode ? 'duels' : tombsRunMode ? 'tombs'
	: heistRunMode ? 'heist' : (dungeonRunMode || dungeonBossId) ? 'dungeon' : 'other';
async function mpRunReward(el, result) {
	if (!MP_ON) return;
	const data = await MPX.call('run-reward', { result, mode: runModeName() });
	const note = document.createElement('div');
	note.style.cssText = 'margin:10px 0;font-size:15px;color:#ffd27a;';
	note.textContent = data.error ? data.error
		: `🎁 +1 pack earned (${data.state.packs} waiting) — open it from the Test Realm menu.`;
	el.appendChild(note);
}

function pickClassOverlay() {
	return new Promise(resolve => {
		const el = dungeonOverlay('DUNGEON RUN', 'Eight bosses stand between you and the treasure. Choose your class.');
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;max-width:720px;';
		for (const clsId of Object.keys(Dungeon.STARTER_DECKS)) {
			const cls = classRegistry.find(c => c.id === clsId);
			row.appendChild(overlayButton(cls ? cls.name : clsId, () => {
				hideDungeonOverlay();
				resolve(clsId);
			}));
		}
		el.appendChild(row);
	});
}

function dungeonVictory(run) {
	const nextLevel = run.level + 1;
	if (run.level >= 8) {
		const el = dungeonOverlay('RUN COMPLETE!', `${Dungeon.BOSSES[run.bossId].name} falls — the treasure hoard is yours. Cleared as ${run.classId} with ${run.deck.length} cards.`);
		Col.earnGold(500);
		mpRunReward(el, 'win');
		el.appendChild(overlayButton('New Run (+500 gold banked)', () => { clearRun(); location.reload(); }));
		clearRun();
		return;
	}
	// authentic Kobolds buckets: 3 distinct themes, 3 random cards from each
	const el = dungeonOverlay(`LEVEL ${run.level} CLEARED`, 'Choose a bucket — all three cards join your deck.');
	const buckets = [...(Dungeon.BUCKETS[run.classId] || [])];
	const offered = [];
	while (offered.length < 3 && buckets.length) {
		offered.push(buckets.splice(Math.floor(Math.random() * buckets.length), 1)[0]);
	}
	const cardsOf = bucket => {
		// the Unique pack draws from the class's whole card pool
		let ids = bucket.cards;
		if (ids === 'class-all') {
			ids = Object.values(state.cardsById).filter(d =>
				d.cardClass === run.classId && !d.token && !d.companion && !d.commander
				&& d.type !== 'land' && d.type !== 'heropower' && !(d.colors && d.colors.length))
				.map(d => d.id);
		}
		const picks = [];
		const pool = [...ids];
		while (picks.length < 3 && pool.length) {
			picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
		}
		return picks.map(id => state.cardsById[id]);
	};
	const row = document.createElement('div');
	row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
	for (const bucket of offered) {
		const picks = cardsOf(bucket);
		const box = document.createElement('div');
		box.style.cssText = 'background:#1c1830;border:1px solid #4a4066;border-radius:10px;padding:12px;max-width:330px;';
		box.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;letter-spacing:1px;">${bucket.name}</div>`;
		for (const d of picks) box.appendChild(miniFace(d));
		box.appendChild(document.createElement('br'));
		box.appendChild(overlayButton('Take these', () => {
			run.deck.push(...picks.map(d => d.id));
			afterBucket(run, nextLevel);
		}));
		row.appendChild(box);
	}
	el.appendChild(row);
}

function afterBucket(run, nextLevel) {
	// a treasure after every odd level, HS-style
	if (run.level % 2 === 1) {
		const el = dungeonOverlay('TREASURE!', 'Choose a boon for the rest of the run.');
		const options = Object.keys(Dungeon.TREASURES).filter(t => !run.passives.includes(t));
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		for (let i = 0; i < 3 && options.length; i++) {
			const t = options.splice(Math.floor(Math.random() * options.length), 1)[0];
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:16px;max-width:190px;';
			box.innerHTML = `<div style="font-weight:bold;margin-bottom:6px;">${Dungeon.TREASURES[t].name}</div>`
				+ `<div style="font-size:13px;opacity:0.85;margin-bottom:8px;">${Dungeon.TREASURES[t].text}</div>`;
			box.appendChild(overlayButton('Take it', () => {
				run.passives.push(t);
				advanceRun(run, nextLevel);
			}));
			row.appendChild(box);
		}
		el.appendChild(row);
	} else {
		advanceRun(run, nextLevel);
	}
}

function advanceRun(run, nextLevel) {
	run.level = nextLevel;
	run.bossId = Dungeon.randomBoss(nextLevel);
	saveRun(run);
	const boss = Dungeon.BOSSES[run.bossId];
	const el = dungeonOverlay(`LEVEL ${nextLevel}`, `Next: ${boss.name} (${boss.health} HP) — "${boss.flavor}"`);
	el.appendChild(overlayButton('Fight!', () => location.reload()));
}

function dungeonDefeat(run) {
	const el = dungeonOverlay('RUN OVER', `${Dungeon.BOSSES[run.bossId].name} ends your run at level ${run.level}.`);
	clearRun();
	mpRunReward(el, 'loss');
	el.appendChild(overlayButton('New Run', () => location.reload()));
}

// ---------- Dalaran Heist run ----------
function resumeHeistOverlay(run) {
	return new Promise(resolve => {
		const hero = Heist.HEROES.find(h => h.id === run.heroId);
		const wing = Heist.WINGS.find(w => w.id === run.wing);
		const anom = run.anomaly && Heist.ANOMALIES[run.anomaly] ? ` · Anomaly: ${Heist.ANOMALIES[run.anomaly].name}` : '';
		const el = dungeonOverlay('HEIST IN PROGRESS',
			`${hero?.name || run.heroId} is ${run.level}/8 deep into ${wing?.name || run.wing} (${run.deck.length} cards)${anom}.`);
		el.appendChild(overlayButton(`Continue fight ${run.level}`, () => { hideDungeonOverlay(); resolve(true); }));
		el.appendChild(overlayButton('Abandon — plan a new heist', () => { hideDungeonOverlay(); resolve(false); }));
	});
}

function pickWingOverlay() {
	return new Promise(resolve => {
		const el = dungeonOverlay('THE DALARAN HEIST', 'Five ways into the city of mages. Choose your chapter.');
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		for (const w of Heist.WINGS) {
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #4a4066;border-radius:10px;padding:14px;max-width:210px;';
			box.innerHTML = `<div style="font-weight:bold;margin-bottom:6px;">${w.name}</div>`
				+ `<div style="font-size:12.5px;opacity:0.8;margin-bottom:8px;">Final boss: ${Heist.BOSSES[w.final].name}</div>`;
			box.appendChild(overlayButton('Break in', () => { hideDungeonOverlay(); resolve(w.id); }));
			row.appendChild(box);
		}
		el.appendChild(row);
	});
}

function pickHeroOverlay() {
	return new Promise(resolve => {
		const el = dungeonOverlay('PICK YOUR GUILD MEMBER', 'Nine specialists, one per class.');
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:12px;max-width:820px;';
		for (const h of Heist.HEROES) {
			const cls = classRegistry.find(c => c.id === h.heroClass);
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #4a4066;border-radius:10px;padding:12px;max-width:180px;';
			box.innerHTML = `<div style="font-weight:bold;">${h.name}</div>`
				+ `<div style="font-size:12px;color:#9fd0ff;margin-bottom:4px;">${cls?.name || h.heroClass}</div>`
				+ `<div style="font-size:12px;opacity:0.8;margin-bottom:8px;">${h.flavor}</div>`;
			box.appendChild(overlayButton('Choose', () => { hideDungeonOverlay(); resolve(h.id); }));
			row.appendChild(box);
		}
		el.appendChild(row);
	});
}

// hero-power choice: the class default plus the two dala_ alternates
function pickPowerOverlay(hero) {
	return new Promise(resolve => {
		const el = dungeonOverlay('CHOOSE YOUR HERO POWER', `${hero.name} has three tricks available.`);
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		const cls = classRegistry.find(c => c.id === hero.heroClass);
		const options = [];
		if (cls?.power) options.push({ id: null, name: cls.power.name, cost: cls.power.cost, text: cls.power.text });
		for (const d of heistAltPowers(hero.heroClass)) options.push({ id: d.id, name: d.name, cost: d.power.cost, text: d.description.replace(/^Hero Power \(\d+\): /, '') });
		for (const o of options) {
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:14px;max-width:200px;';
			box.innerHTML = `<div style="font-weight:bold;margin-bottom:4px;">${o.name} (${o.cost})</div>`
				+ `<div style="font-size:12.5px;opacity:0.85;margin-bottom:8px;">${o.text}</div>`;
			box.appendChild(overlayButton('Take it', () => { hideDungeonOverlay(); resolve(o.id); }));
			row.appendChild(box);
		}
		el.appendChild(row);
	});
}
// optional run modifier: a symmetric anomaly that applies to every fight
function pickAnomalyOverlay(flavor) {
	return new Promise(resolve => {
		const el = dungeonOverlay('ANOMALY?', flavor || 'The magic of Dalaran is unstable. Take on a run-wide twist for an extra challenge, or run clean.');
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		const keys = Object.keys(Heist.ANOMALIES);
		const offered = [];
		while (offered.length < 3 && keys.length) offered.push(keys.splice(Math.floor(Math.random() * keys.length), 1)[0]);
		for (const key of offered) {
			const a = Heist.ANOMALIES[key];
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #6a4a9a;border-radius:10px;padding:14px;max-width:200px;';
			box.innerHTML = `<div style="font-weight:bold;margin-bottom:4px;">Anomaly · ${a.name}</div>`
				+ `<div style="font-size:12.5px;opacity:0.85;margin-bottom:8px;">${a.text}</div>`;
			box.appendChild(overlayButton('Embrace it', () => { hideDungeonOverlay(); resolve(key); }));
			row.appendChild(box);
		}
		el.appendChild(row);
		el.appendChild(document.createElement('br'));
		el.appendChild(overlayButton('No anomaly — standard run', () => { hideDungeonOverlay(); resolve(null); }));
	});
}
let heistCardsById = null; // set at boot so overlays can read card defs pre-state
function heistAltPowers(heroClass) {
	return Object.values(heistCardsById || {}).filter(d =>
		d.set === 'DALARAN_HEIST' && d.type === 'heropower' && d.cardClass === heroClass && d.power);
}

// fight N rolls a boss from the wing pool's difficulty band; fight 8 is fixed
function heistBossFor(wingId, level) {
	const wing = Heist.WINGS.find(w => w.id === wingId);
	if (!wing) return Heist.WINGS[0].final;
	if (level >= 8) return wing.final;
	const pool = [...wing.pool].sort((a, b) => Heist.BOSSES[a].health - Heist.BOSSES[b].health);
	const start = Math.min(pool.length - 3, Math.floor((level - 1) / 7 * (pool.length - 3) + 0.5));
	const band = pool.slice(Math.max(0, start), Math.max(0, start) + 3);
	return band[Math.floor(Math.random() * band.length)];
}

function bootHeistEncounter(cardsById, run) {
	heistCardsById = cardsById;
	const hero = Heist.HEROES.find(h => h.id === run.heroId);
	const boss = Heist.BOSSES[run.bossId];
	heistBossName = boss.name;
	const clsPick = classRegistry.find(c => c.id === hero.heroClass)
		|| { id: hero.heroClass, name: hero.name, power: null };
	const bossPick = { id: run.bossId, name: boss.name, power: boss.power };
	const picks = [clsPick, bossPick];
	state = E.createGame(cardsById, Math.random, [...run.deck], 2, picks);
	state.classPicks = picks;
	// chosen alternate hero power replaces the class slot
	if (run.powerId && cardsById[run.powerId]) {
		const pw = E.instantiate(cardsById[run.powerId], HUMAN);
		pw.zone = 'heropower'; pw.usedThisTurn = false;
		state.players[HUMAN].heroPowers = [pw];
	}
	// boss surgery: themed deck, boss HP; the player's life scales with depth
	// (+5 per Good Food tavern boon banked this run)
	const bp = state.players[1];
	const runHP = 15 + (run.level - 1) * 5 + (run.bonusHealth || 0);
	E.applyHeroMods(state, 1, { life: boss.health, maxLife: boss.health });
	E.applyHeroMods(state, HUMAN, { life: runHP, maxLife: runHP });
	E.resetDeckAndHand(state, 1, Heist.buildBossDeck(cardsById, boss.theme));
	E.drawCards(state, 1, 4);
	E.stripLoadouts(state);
	for (const id of run.passives) Heist.applyPassive(state, HUMAN, id);
	Heist.applyRunMods(state, HUMAN, run); // tavern deck edits (buffs, opening hand)
	if (run.anomaly && Heist.ANOMALIES[run.anomaly]) { Heist.applyAnomaly(state, run.anomaly); log(`Anomaly — ${Heist.ANOMALIES[run.anomaly].name}: ${Heist.ANOMALIES[run.anomaly].text}`); }
	log(`Heist fight ${run.level}/8 — ${boss.name} (${bp.life} HP).`);
	log(`Boss power — ${boss.power.name} (${boss.power.cost}): ${boss.power.text}`);
	log(`You are ${hero.name} with a ${run.deck.length}-card heist deck.`);
	for (const id of run.passives) log(`Passive — ${Heist.PASSIVES[id].name}: ${Heist.PASSIVES[id].text}`);
}

function heistVictory(run) {
	const hero = Heist.HEROES.find(h => h.id === run.heroId);
	const nextLevel = run.level + 1;
	if (run.level >= 8) {
		const wing = Heist.WINGS.find(w => w.id === run.wing);
		const el = dungeonOverlay('HEIST COMPLETE!', `${Heist.BOSSES[run.bossId].name} falls — ${wing.name} is cleaned out. Cleared as ${hero.name} with ${run.deck.length} cards.`);
		Col.earnGold(750);
		mpRunReward(el, 'win');
		el.appendChild(overlayButton('New Heist (+750 gold banked)', () => { clearHeist(); location.reload(); }));
		clearHeist();
		return;
	}
	// draft a bucket: 3 themes, 3 random cards each, all three join the deck
	const el = dungeonOverlay(`FIGHT ${run.level} WON`, 'Choose a bucket — all three cards join your deck.');
	const buckets = [...(Dungeon.BUCKETS[hero.heroClass] || [])];
	const offered = [];
	while (offered.length < 3 && buckets.length) {
		offered.push(buckets.splice(Math.floor(Math.random() * buckets.length), 1)[0]);
	}
	const cardsOf = bucket => {
		let ids = bucket.cards;
		if (ids === 'class-all') {
			ids = Object.values(state.cardsById).filter(d =>
				d.cardClass === hero.heroClass && !d.token && !d.companion && !d.commander
				&& d.type !== 'land' && d.type !== 'heropower' && !(d.colors && d.colors.length))
				.map(d => d.id);
		}
		const picks = [];
		const pool = [...ids];
		while (picks.length < 3 && pool.length) {
			picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
		}
		return picks.map(id => state.cardsById[id]);
	};
	const row = document.createElement('div');
	row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
	for (const bucket of offered) {
		const picks = cardsOf(bucket);
		const box = document.createElement('div');
		box.style.cssText = 'background:#1c1830;border:1px solid #4a4066;border-radius:10px;padding:12px;max-width:330px;';
		box.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;letter-spacing:1px;">${bucket.name}</div>`;
		for (const d of picks) box.appendChild(miniFace(d));
		box.appendChild(document.createElement('br'));
		box.appendChild(overlayButton('Take these', () => {
			run.deck.push(...picks.map(d => d.id));
			afterHeistBucket(run, nextLevel);
		}));
		row.appendChild(box);
	}
	el.appendChild(row);
}

// odd fights alternate the run's boons: passives after 1 & 5, an active
// treasure card into the deck after 3 & 7
function afterHeistBucket(run, nextLevel) {
	if (run.level === 1 || run.level === 5) {
		const el = dungeonOverlay('PASSIVE TREASURE!', 'Choose a boon for the rest of the heist.');
		const options = Object.keys(Heist.PASSIVES).filter(t => !run.passives.includes(t));
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		for (let i = 0; i < 3 && options.length; i++) {
			const t = options.splice(Math.floor(Math.random() * options.length), 1)[0];
			const def = state.cardsById['dala_' + t];
			const box = document.createElement('div');
			box.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;';
			if (def) box.appendChild(miniFace(def));
			else box.innerHTML = `<div style="font-weight:bold;">${Heist.PASSIVES[t].name}</div><div style="font-size:13px;opacity:0.85;max-width:190px;">${Heist.PASSIVES[t].text}</div>`;
			box.appendChild(overlayButton('Take it', () => {
				run.passives.push(t);
				advanceHeist(run, nextLevel);
			}));
			row.appendChild(box);
		}
		el.appendChild(row);
	} else if (run.level === 3 || run.level === 7) {
		const el = dungeonOverlay('TREASURE!', 'One of these joins your deck.');
		const options = Object.values(state.cardsById).filter(d => d.treasure && !run.deck.includes(d.id));
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		for (let i = 0; i < 3 && options.length; i++) {
			const d = options.splice(Math.floor(Math.random() * options.length), 1)[0];
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;';
			box.appendChild(miniFace(d));
			box.appendChild(document.createElement('br'));
			box.appendChild(overlayButton('Take it', () => {
				run.deck.push(d.id);
				advanceHeist(run, nextLevel);
			}));
			row.appendChild(box);
		}
		el.appendChild(row);
	} else {
		heistTavern(run, nextLevel); // fights 2, 4, 6: stop by the Bar
	}
}

// the Bar: 3 random tavern actions (or leave). Actions that target a card
// open a picker; the rest apply and advance.
function heistTavern(run, nextLevel) {
	const el = dungeonOverlay('THE BAR', 'The bartender slides you a few options. Take one, or move on.');
	const keys = Object.keys(Heist.TAVERN);
	const offered = [];
	while (offered.length < 3 && keys.length) {
		offered.push(keys.splice(Math.floor(Math.random() * keys.length), 1)[0]);
	}
	const row = document.createElement('div');
	row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
	for (const key of offered) {
		const act = Heist.TAVERN[key];
		const box = document.createElement('div');
		box.style.cssText = 'background:#1c1830;border:1px solid #6a5a9a;border-radius:10px;padding:16px;max-width:200px;';
		box.innerHTML = `<div style="font-weight:bold;margin-bottom:6px;">${act.name}</div>`
			+ `<div style="font-size:13px;opacity:0.85;margin-bottom:8px;">${act.text}</div>`;
		box.appendChild(overlayButton('Choose', () => {
			if (act.pick) heistTavernPick(run, key, nextLevel);
			else { act.apply(run); saveHeist(run); advanceHeist(run, nextLevel); }
		}));
		row.appendChild(box);
	}
	el.appendChild(row);
	el.appendChild(document.createElement('br'));
	el.appendChild(overlayButton('Leave the Bar', () => advanceHeist(run, nextLevel)));
}

// the card-picker for a tavern action that targets a minion
function heistTavernPick(run, key, nextLevel) {
	const act = Heist.TAVERN[key];
	let defs;
	if (act.pick === 'legendary') {
		const pool = Object.values(state.cardsById).filter(d => d.type === 'creature'
			&& d.rarity === 'legendary' && !d.token && d.collectible !== false
			&& !d.companion && !d.commander && !(d.colors && d.colors.length));
		defs = [];
		while (defs.length < 3 && pool.length) defs.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
	} else { // deck-creature: the distinct minions already in the run deck
		const seen = new Set();
		defs = run.deck.map(id => state.cardsById[id])
			.filter(d => d && d.type === 'creature' && !seen.has(d.id) && seen.add(d.id));
	}
	if (!defs.length) { act.apply(run, null); saveHeist(run); advanceHeist(run, nextLevel); return; }
	const el = dungeonOverlay(act.name.toUpperCase(), act.text);
	const row = document.createElement('div');
	row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:12px;max-height:70vh;overflow:auto;';
	for (const d of defs) {
		const box = document.createElement('div');
		box.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
		box.appendChild(miniFace(d));
		box.appendChild(overlayButton('Pick', () => {
			act.apply(run, d.id);
			saveHeist(run);
			advanceHeist(run, nextLevel);
		}));
		row.appendChild(box);
	}
	el.appendChild(row);
}

function advanceHeist(run, nextLevel) {
	run.level = nextLevel;
	run.bossId = heistBossFor(run.wing, nextLevel);
	saveHeist(run);
	const boss = Heist.BOSSES[run.bossId];
	const el = dungeonOverlay(`FIGHT ${nextLevel}/8`, `Next: ${boss.name} (${boss.health} HP)`);
	el.appendChild(overlayButton('Fight!', () => location.reload()));
}

function heistDefeat(run) {
	const el = dungeonOverlay('HEIST FOILED', `${Heist.BOSSES[run.bossId].name} stops the heist at fight ${run.level}.`);
	clearHeist();
	mpRunReward(el, 'loss');
	el.appendChild(overlayButton('New Heist', () => location.reload()));
}

// ---------- Tombs of Terror run (?tombs=1) ----------
// A close mirror of the Dalaran Heist run: pick a chapter, an Explorer & a
// hero power, then climb an 8-fight ladder (7 minibosses from the chapter pool
// + the chapter's Plague Lord final), drafting cards and collecting treasures.
let tombsCardsById = null; // set at boot so overlays can read card defs pre-state

function resumeTombsOverlay(run) {
	return new Promise(resolve => {
		const explorer = Tombs.EXPLORERS.find(h => h.id === run.explorerId);
		const chapter = Tombs.CHAPTERS.find(c => c.id === run.chapter);
		const el = dungeonOverlay('EXPEDITION IN PROGRESS',
			`${explorer?.name || run.explorerId} is ${run.level}/8 deep into ${chapter?.name || run.chapter} (${run.deck.length} cards).`);
		el.appendChild(overlayButton(`Continue fight ${run.level}`, () => { hideDungeonOverlay(); resolve(true); }));
		el.appendChild(overlayButton('Abandon — start a new expedition', () => { hideDungeonOverlay(); resolve(false); }));
	});
}

function pickChapterOverlay() {
	return new Promise(resolve => {
		const el = dungeonOverlay('TOMBS OF TERROR', 'The plague ravages Uldum. Choose a chapter to delve.');
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		for (const c of Tombs.CHAPTERS) {
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:14px;max-width:210px;';
			box.innerHTML = `<div style="font-weight:bold;margin-bottom:6px;">${c.name}</div>`
				+ `<div style="font-size:12.5px;opacity:0.8;margin-bottom:8px;">Plague Lord: ${Tombs.BOSSES[c.final].name}</div>`;
			box.appendChild(overlayButton('Delve in', () => { hideDungeonOverlay(); resolve(c.id); }));
			row.appendChild(box);
		}
		el.appendChild(row);
	});
}

function pickExplorerOverlay() {
	return new Promise(resolve => {
		const el = dungeonOverlay('PICK YOUR EXPLORER', 'The League of Explorers stands ready.');
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:12px;max-width:820px;';
		for (const h of Tombs.EXPLORERS) {
			const cls = classRegistry.find(c => c.id === h.heroClass);
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;max-width:180px;';
			box.innerHTML = `<div style="font-weight:bold;">${h.name}</div>`
				+ `<div style="font-size:12px;color:#e8c37a;margin-bottom:4px;">${cls?.name || h.heroClass}</div>`
				+ `<div style="font-size:12px;opacity:0.8;margin-bottom:8px;">${h.flavor}</div>`;
			box.appendChild(overlayButton('Choose', () => { hideDungeonOverlay(); resolve(h.id); }));
			row.appendChild(box);
		}
		el.appendChild(row);
	});
}

// hero-power choice: the class default plus the Explorer's three ulda_ alternates
function pickTombsPowerOverlay(explorer) {
	return new Promise(resolve => {
		const el = dungeonOverlay('CHOOSE YOUR HERO POWER', `${explorer.name} has three tricks available.`);
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		const cls = classRegistry.find(c => c.id === explorer.heroClass);
		const options = [];
		if (cls?.power) options.push({ id: null, name: cls.power.name, cost: cls.power.cost, text: cls.power.text });
		for (const id of Tombs.EXPLORER_POWERS[explorer.heroClass] || []) {
			const d = tombsCardsById[id];
			if (d && d.power) options.push({ id, name: d.name, cost: d.power.cost, text: (d.description || '').replace(/^Hero Power \(\d+\): /, '') });
		}
		for (const o of options) {
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:14px;max-width:200px;';
			box.innerHTML = `<div style="font-weight:bold;margin-bottom:4px;">${o.name} (${o.cost})</div>`
				+ `<div style="font-size:12.5px;opacity:0.85;margin-bottom:8px;">${o.text}</div>`;
			box.appendChild(overlayButton('Take it', () => { hideDungeonOverlay(); resolve(o.id); }));
			row.appendChild(box);
		}
		el.appendChild(row);
	});
}

// fight N rolls a boss from the chapter pool's difficulty band; fight 8 is the
// chapter's Plague Lord final
function tombsBossFor(chapterId, level) {
	const chapter = Tombs.CHAPTERS.find(c => c.id === chapterId);
	if (!chapter) return Tombs.CHAPTERS[0].final;
	if (level >= 8) return chapter.final;
	const pool = [...chapter.pool].sort((a, b) => Tombs.BOSSES[a].health - Tombs.BOSSES[b].health);
	const start = Math.min(pool.length - 3, Math.floor((level - 1) / 7 * (pool.length - 3) + 0.5));
	const band = pool.slice(Math.max(0, start), Math.max(0, start) + 3);
	return band[Math.floor(Math.random() * band.length)];
}

function bootTombsEncounter(cardsById, run) {
	tombsCardsById = cardsById;
	const explorer = Tombs.EXPLORERS.find(h => h.id === run.explorerId);
	const boss = Tombs.BOSSES[run.bossId];
	heistBossName = boss.name; // shared boss-name slot for nameOf()
	const clsPick = classRegistry.find(c => c.id === explorer.heroClass)
		|| { id: explorer.heroClass, name: explorer.name, power: null };
	const bossPick = { id: run.bossId, name: boss.name, power: boss.power };
	const picks = [clsPick, bossPick];
	state = E.createGame(cardsById, Math.random, [...run.deck], 2, picks);
	state.classPicks = picks;
	// chosen alternate hero power replaces the class slot
	if (run.powerId && cardsById[run.powerId]) {
		const pw = E.instantiate(cardsById[run.powerId], HUMAN);
		pw.zone = 'heropower'; pw.usedThisTurn = false;
		state.players[HUMAN].heroPowers = [pw];
	}
	// boss surgery: themed deck & the boss's designed HP; the player's life
	// scales with depth (15 at fight 1, +5 per fight)
	const bp = state.players[1];
	const runHP = 15 + (run.level - 1) * 5;
	E.applyHeroMods(state, 1, { life: boss.health, maxLife: boss.health });
	E.applyHeroMods(state, HUMAN, { life: runHP, maxLife: runHP });
	E.resetDeckAndHand(state, 1, Tombs.buildBossDeck(cardsById, boss.theme));
	E.drawCards(state, 1, 4);
	E.stripLoadouts(state);
	for (const id of run.passives) Tombs.applyPassive(state, HUMAN, id);
	log(`Tombs fight ${run.level}/8 — ${boss.name} (${bp.life} HP).`);
	log(`Boss power — ${boss.power.name} (${boss.power.cost}): ${boss.power.text}`);
	log(`You are ${explorer.name} with a ${run.deck.length}-card expedition deck.`);
	for (const id of run.passives) log(`Passive — ${Tombs.PASSIVES[id].name}: ${Tombs.PASSIVES[id].text}`);
}

function tombsVictory(run) {
	const explorer = Tombs.EXPLORERS.find(h => h.id === run.explorerId);
	const nextLevel = run.level + 1;
	if (run.level >= 8) {
		const chapter = Tombs.CHAPTERS.find(c => c.id === run.chapter);
		const el = dungeonOverlay('CHAPTER CLEARED!', `${Tombs.BOSSES[run.bossId].name} falls — ${chapter.name} is purged of the plague. Cleared as ${explorer.name} with ${run.deck.length} cards.`);
		Col.earnGold(750);
		mpRunReward(el, 'win');
		el.appendChild(overlayButton('New Expedition (+750 gold banked)', () => { clearTombs(); location.reload(); }));
		clearTombs();
		return;
	}
	// draft a bucket: 3 themes, 3 random cards each, all three join the deck
	const el = dungeonOverlay(`FIGHT ${run.level} WON`, 'Choose a bucket — all three cards join your deck.');
	const buckets = [...(Dungeon.BUCKETS[explorer.heroClass] || [])];
	const offered = [];
	while (offered.length < 3 && buckets.length) {
		offered.push(buckets.splice(Math.floor(Math.random() * buckets.length), 1)[0]);
	}
	const cardsOf = bucket => {
		let ids = bucket.cards;
		if (ids === 'class-all') {
			ids = Object.values(state.cardsById).filter(d =>
				d.cardClass === explorer.heroClass && !d.token && !d.companion && !d.commander
				&& d.type !== 'land' && d.type !== 'heropower' && !(d.colors && d.colors.length))
				.map(d => d.id);
		}
		const picks = [];
		const pool = [...ids];
		while (picks.length < 3 && pool.length) {
			picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
		}
		return picks.map(id => state.cardsById[id]);
	};
	const row = document.createElement('div');
	row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
	for (const bucket of offered) {
		const picks = cardsOf(bucket);
		const box = document.createElement('div');
		box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;max-width:330px;';
		box.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;letter-spacing:1px;">${bucket.name}</div>`;
		for (const d of picks) box.appendChild(miniFace(d));
		box.appendChild(document.createElement('br'));
		box.appendChild(overlayButton('Take these', () => {
			run.deck.push(...picks.map(d => d.id));
			afterTombsBucket(run, nextLevel);
		}));
		row.appendChild(box);
	}
	el.appendChild(row);
}

// odd fights alternate the run's boons: passive treasures after 1 & 5, an
// active treasure card into the deck after 3 & 7; even fights advance straight on
function afterTombsBucket(run, nextLevel) {
	if (run.level === 1 || run.level === 5) {
		const el = dungeonOverlay('PASSIVE TREASURE!', 'Choose a boon for the rest of the expedition.');
		const options = Object.keys(Tombs.PASSIVES).filter(t => !run.passives.includes(t));
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		for (let i = 0; i < 3 && options.length; i++) {
			const t = options.splice(Math.floor(Math.random() * options.length), 1)[0];
			const def = state.cardsById['tomb_' + t];
			const box = document.createElement('div');
			box.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;';
			if (def) box.appendChild(miniFace(def));
			else box.innerHTML = `<div style="font-weight:bold;">${Tombs.PASSIVES[t].name}</div><div style="font-size:13px;opacity:0.85;max-width:190px;">${Tombs.PASSIVES[t].text}</div>`;
			box.appendChild(overlayButton('Take it', () => {
				run.passives.push(t);
				advanceTombs(run, nextLevel);
			}));
			row.appendChild(box);
		}
		el.appendChild(row);
	} else if (run.level === 3 || run.level === 7) {
		const el = dungeonOverlay('TREASURE!', 'One of these joins your deck.');
		const options = Object.values(state.cardsById).filter(d => d.treasure && d.set === 'TOMBS_OF_TERROR' && !run.deck.includes(d.id));
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		for (let i = 0; i < 3 && options.length; i++) {
			const d = options.splice(Math.floor(Math.random() * options.length), 1)[0];
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;';
			box.appendChild(miniFace(d));
			box.appendChild(document.createElement('br'));
			box.appendChild(overlayButton('Take it', () => {
				run.deck.push(d.id);
				advanceTombs(run, nextLevel);
			}));
			row.appendChild(box);
		}
		el.appendChild(row);
	} else {
		advanceTombs(run, nextLevel); // fights 2, 4, 6: press on
	}
}

function advanceTombs(run, nextLevel) {
	run.level = nextLevel;
	run.bossId = tombsBossFor(run.chapter, nextLevel);
	saveTombs(run);
	const boss = Tombs.BOSSES[run.bossId];
	const el = dungeonOverlay(`FIGHT ${nextLevel}/8`, `Next: ${boss.name} (${boss.health} HP)${boss.plagueLord ? ' — the Plague Lord!' : ''}`);
	el.appendChild(overlayButton('Fight!', () => location.reload()));
}

function tombsDefeat(run) {
	const el = dungeonOverlay('EXPEDITION ENDED', `${Tombs.BOSSES[run.bossId].name} stops the expedition at fight ${run.level}.`);
	clearTombs();
	mpRunReward(el, 'loss');
	el.appendChild(overlayButton('New Expedition', () => location.reload()));
}

// ---------- Duels run ----------
// An arena-draft run: draft 10 cards, then play until 12 wins or 3 losses.
// Every game (win or loss) loots a bucket; games 1 & 5 & 9 grant a passive and
// 3 & 7 & 11 add an active DUELS treasure. Opponents aren't a fixed ladder —
// each is generated from a random rival at exactly the player's loot budget.
let duelsCardsById = null; // set at boot so overlays can read card defs pre-state

function resumeDuelsOverlay(run) {
	return new Promise(resolve => {
		const hero = duelsEffectiveHero(run);
		const clsLabel = run.classChoice ? ` (${(classRegistry.find(x => x.id === run.classChoice) || {}).name || run.classChoice})` : '';
		const anom = run.anomaly && Heist.ANOMALIES[run.anomaly] ? ` · Anomaly: ${Heist.ANOMALIES[run.anomaly].name}` : '';
		const el = dungeonOverlay('DUEL IN PROGRESS',
			`${hero?.name || run.heroId}${clsLabel} - ${run.wins || 0} wins / ${run.losses || 0} losses, ${run.deck.length} cards${anom}. Reach 12 wins before 3 losses.`);
		el.appendChild(overlayButton('Continue the run', () => { hideDungeonOverlay(); resolve(true); }));
		el.appendChild(overlayButton('Abandon - start a new run', () => { hideDungeonOverlay(); resolve(false); }));
	});
}

// resolve the run's hero, applying a Drek'Thar/Vanndar class choice when present
function duelsEffectiveHero(run) {
	const hero = Duels.HEROES.find(h => h.id === run.heroId);
	if (hero && Duels.classChoicesOf(hero) && run.classChoice) {
		return { ...hero, heroClass: run.classChoice, classes: [run.classChoice] };
	}
	return hero;
}

// Drek'Thar / Vanndar: choose one of the general's five classes to play as
function pickDuelsClassOverlay(hero) {
	return new Promise(resolve => {
		const el = dungeonOverlay('CHOOSE YOUR CLASS', `${hero.name} can lead any of these classes \u2014 pick one.`);
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:12px;max-width:720px;';
		for (const cl of Duels.classChoicesOf(hero)) {
			const c = classRegistry.find(x => x.id === cl);
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;max-width:150px;text-align:center;';
			box.innerHTML = `<div style="font-weight:bold;margin-bottom:6px;">${(c && c.name) || cl}</div>`;
			box.appendChild(overlayButton('Play this', () => { hideDungeonOverlay(); resolve(cl); }));
			row.appendChild(box);
		}
		el.appendChild(row);
	});
}

function pickDuelsHeroOverlay() {
	return new Promise(resolve => {
		const el = dungeonOverlay('PICK YOUR HERO', 'The Duels roster steps up.');
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:12px;max-width:840px;';
		for (const h of Duels.HEROES) {
			const clsLabel = Duels.classesOf(h).map(c => (classRegistry.find(x => x.id === c)?.name) || c).join(' / ');
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;max-width:180px;';
			box.innerHTML = `<div style="font-weight:bold;">${h.name}</div>`
				+ `<div style="font-size:12px;color:#e8c37a;margin-bottom:4px;">${clsLabel}</div>`
				+ `<div style="font-size:12px;opacity:0.8;margin-bottom:8px;">${h.flavor}</div>`;
			box.appendChild(overlayButton('Choose', () => { hideDungeonOverlay(); resolve(h.id); }));
			row.appendChild(box);
		}
		el.appendChild(row);
	});
}

// hero-power choice: the class default plus the hero's class Duels/ulda_ powers
function pickDuelsPowerOverlay(hero) {
	return new Promise(resolve => {
		const el = dungeonOverlay('CHOOSE YOUR HERO POWER', `${hero.name} lines up a few tricks.`);
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		const heroClasses = Duels.classesOf(hero);
		const options = [];
		const powSeen = new Set();
		const primaryCls = classRegistry.find(c => c.id === heroClasses[0]);
		if (primaryCls?.power) options.push({ id: null, name: primaryCls.power.name, cost: primaryCls.power.cost, text: primaryCls.power.text });
		for (const cl of heroClasses) for (const id of Duels.HERO_POWERS[cl] || []) {
			const d = duelsCardsById[id];
			if (d && d.power && !powSeen.has(id)) { powSeen.add(id); options.push({ id, name: d.name, cost: d.power.cost, text: (d.description || '').replace(/^Hero Power \(\d+\): /, '') }); }
		}
		for (const o of options) {
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:14px;max-width:200px;';
			box.innerHTML = `<div style="font-weight:bold;margin-bottom:4px;">${o.name} (${o.cost})</div>`
				+ `<div style="font-size:12.5px;opacity:0.85;margin-bottom:8px;">${o.text}</div>`;
			box.appendChild(overlayButton('Take it', () => { hideDungeonOverlay(); resolve(o.id); }));
			row.appendChild(box);
		}
		el.appendChild(row);
	});
}

// 10-card arena draft: ten sequential "pick 1 of 3" from your class + Neutral
function pickDuelsDraftOverlay(heroClass, size = 10) {
	return new Promise(resolve => {
		const pool = Duels.draftPool(duelsCardsById, heroClass);
		const deck = [];
		const step = () => {
			if (deck.length >= size || !pool.length) { hideDungeonOverlay(); resolve(deck); return; }
			const opts = Duels.draftOptions(pool, Math.random, 3);
			if (!opts.length) { hideDungeonOverlay(); resolve(deck); return; }
			const el = dungeonOverlay(`DRAFT YOUR DECK - ${deck.length + 1}/${size}`, `Pick a card. ${size} picks build your deck.`);
			const row = document.createElement('div');
			row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
			for (const d of opts) {
				const box = document.createElement('div');
				box.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;';
				box.appendChild(miniFace(d, 125));
				box.appendChild(overlayButton('Pick', () => { deck.push(d.id); step(); }));
				row.appendChild(box);
			}
			el.appendChild(row);
		};
		step();
	});
}

// roll a fresh opponent kept at exact power parity with the player: a random
// rival identity + a generated deck/passives scaled to games already played
function genDuelsEnemy(cardsById, games, avoidId) {
	let roster = Duels.RIVALS;
	if (avoidId && roster.length > 1) roster = roster.filter(r => r.id !== avoidId); // no back-to-back repeats
	const rival = roster[Math.floor(Math.random() * roster.length)];
	const classes = Duels.classesOf(rival);
	const gen = Duels.generateEnemy(cardsById, classes, games, Math.random);
	// parity: the enemy also carries a hero power - its class default (null) or a random alt from its Duels pool
	const altPowers = classes.flatMap(cl => Duels.HERO_POWERS[cl] || []).filter(id => cardsById[id] && cardsById[id].power);
	const powerChoices = [null, ...altPowers];
	const powerId = powerChoices[Math.floor(Math.random() * powerChoices.length)];
	return { id: rival.id, name: rival.name, heroClass: rival.heroClass, hsId: rival.hsId, deck: gen.deck, passives: gen.passives, powerId };
}

function bootDuelsEncounter(cardsById, run) {
	duelsCardsById = cardsById;
	const hero = duelsEffectiveHero(run);
	const enemy = run.enemy || (run.enemy = genDuelsEnemy(cardsById, (run.wins || 0) + (run.losses || 0)));
	heistBossName = enemy.name; // shared enemy-name slot for nameOf()
	const playerCls = classRegistry.find(c => c.id === hero.heroClass) || { id: hero.heroClass, name: hero.name, power: null };
	const enemyCls = classRegistry.find(c => c.id === enemy.heroClass) || { id: enemy.heroClass, name: enemy.name, power: null };
	const picks = [playerCls, enemyCls];
	state = E.createGame(cardsById, Math.random, [...run.deck], 2, picks);
	state.classPicks = picks;
	// chosen alternate hero power replaces the class slot
	if (run.powerId && cardsById[run.powerId]) {
		const pw = E.instantiate(cardsById[run.powerId], HUMAN);
		pw.zone = 'heropower'; pw.usedThisTurn = false;
		state.players[HUMAN].heroPowers = [pw];
	}
	// parity: the enemy fires its own hero power too - default class power, or a rolled alt
	if (enemy.powerId && cardsById[enemy.powerId]) {
		const epw = E.instantiate(cardsById[enemy.powerId], 1);
		epw.zone = 'heropower'; epw.usedThisTurn = false;
		state.players[1].heroPowers = [epw];
	}
	// both sides share the same generated-deck / loot budget - equal footing (no HP scaling)
	E.resetDeckAndHand(state, 1, [...enemy.deck]);
	E.drawCards(state, 1, 4);
	E.stripLoadouts(state);
	for (const id of run.passives) Duels.applyPassive(state, HUMAN, id);
	for (const id of enemy.passives || []) Duels.applyPassive(state, 1, id);
	// optional run modifier: a symmetric anomaly warps every game (shared with Heist)
	if (run.anomaly && Heist.ANOMALIES[run.anomaly]) { Heist.applyAnomaly(state, run.anomaly); log(`Anomaly - ${Heist.ANOMALIES[run.anomaly].name}: ${Heist.ANOMALIES[run.anomaly].text}`); }
	log(`Duels - ${run.wins || 0} wins / ${run.losses || 0} losses. Facing ${enemy.name} (${enemyCls.name || enemy.heroClass}).`);
	log(`You are ${hero.name} with a ${run.deck.length}-card deck; ${enemy.name} drafted ${enemy.deck.length}.`);
	for (const id of run.passives) log(`Your passive - ${Duels.PASSIVES[id].name}: ${Duels.PASSIVES[id].text}`);
}

function duelsVictory(run) { afterDuelsGame(run, true); }
function duelsDefeat(run) { afterDuelsGame(run, false); }

// one game resolved: bank the result, end the run at 12 wins / 3 losses, else loot
function afterDuelsGame(run, won) {
	if (won) run.wins = (run.wins || 0) + 1; else run.losses = (run.losses || 0) + 1;
	saveDuels(run);
	if (run.wins >= Duels.WINS_TO_CLEAR) { duelsRunComplete(run); return; }
	if (run.losses >= Duels.LOSSES_TO_END) { duelsRunOver(run); return; }
	duelsLoot(run, won);
}

// loot after every game: choose 1 of 3 HS-Duels buckets (3 cards each)
function duelsLoot(run, won) {
	const hero = duelsEffectiveHero(run);
	const el = dungeonOverlay(won ? `WIN - ${run.wins}/12` : `LOSS - ${run.losses}/3`, 'Choose a loot bucket - all 3 cards join your deck.');
	const offered = Duels.offerBuckets(duelsCardsById, Duels.classesOf(hero), Math.random, 3);
	const row = document.createElement('div');
	row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
	for (const bucket of offered) {
		const ids = Duels.rollBucket(duelsCardsById, Duels.classesOf(hero), bucket, Math.random, 3);
		const box = document.createElement('div');
		box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;max-width:330px;';
		box.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;letter-spacing:1px;">${bucket.name}</div>`;
		for (const id of ids) if (state.cardsById[id]) box.appendChild(miniFace(state.cardsById[id]));
		box.appendChild(document.createElement('br'));
		box.appendChild(overlayButton('Take these', () => { run.deck.push(...ids); afterDuelsLootBucket(run); }));
		row.appendChild(box);
	}
	el.appendChild(row);
}

// games 1/5/9 also grant a passive; 3/7/11 a treasure card; then the next fight
function afterDuelsLootBucket(run) {
	const games = (run.wins || 0) + (run.losses || 0);
	if (Duels.PASSIVE_GAMES.includes(games)) {
		const el = dungeonOverlay('PASSIVE TREASURE!', 'Choose a boon for the rest of the run.');
		const options = Object.keys(Duels.PASSIVES).filter(t => !run.passives.includes(t));
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		for (let i = 0; i < 3 && options.length; i++) {
			const t = options.splice(Math.floor(Math.random() * options.length), 1)[0];
			const box = document.createElement('div');
			box.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;max-width:200px;';
			box.innerHTML = `<div style="font-weight:bold;">${Duels.PASSIVES[t].name}</div><div style="font-size:13px;opacity:0.85;">${Duels.PASSIVES[t].text}</div>`;
			box.appendChild(overlayButton('Take it', () => { run.passives.push(t); advanceDuels(run); }));
			row.appendChild(box);
		}
		el.appendChild(row);
	} else if (Duels.TREASURE_GAMES.includes(games)) {
		const el = dungeonOverlay('TREASURE!', 'One of these joins your deck.');
		const options = Object.values(state.cardsById).filter(d => d.treasure && d.set === 'DUELS' && !run.deck.includes(d.id));
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		for (let i = 0; i < 3 && options.length; i++) {
			const d = options.splice(Math.floor(Math.random() * options.length), 1)[0];
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;';
			box.appendChild(miniFace(d));
			box.appendChild(document.createElement('br'));
			box.appendChild(overlayButton('Take it', () => { run.deck.push(d.id); advanceDuels(run); }));
			row.appendChild(box);
		}
		el.appendChild(row);
	} else advanceDuels(run);
}

function advanceDuels(run) {
	const games = (run.wins || 0) + (run.losses || 0);
	run.enemy = genDuelsEnemy(state.cardsById, games, run.enemy && run.enemy.id); // next opponent (avoid immediate repeat)
	saveDuels(run);
	const el = dungeonOverlay(`NEXT: ${run.enemy.name}`, `${run.wins || 0} wins / ${run.losses || 0} losses - your deck is ${run.deck.length} cards.`);
	el.appendChild(overlayButton('Fight!', () => location.reload()));
}

function duelsRunComplete(run) {
	const hero = Duels.HEROES.find(h => h.id === run.heroId);
	const el = dungeonOverlay('12 WINS - RUN CLEARED!', `${hero.name} takes 12 wins with a ${run.deck.length}-card deck.`);
	Col.earnGold(1000);
	mpRunReward(el, 'win');
	clearDuels();
	el.appendChild(overlayButton('New Run (+1000 gold banked)', () => location.reload()));
}

function duelsRunOver(run) {
	const hero = Duels.HEROES.find(h => h.id === run.heroId);
	const el = dungeonOverlay('3 LOSSES - RUN OVER', `${hero.name} bows out at ${run.wins || 0} wins.`);
	clearDuels();
	mpRunReward(el, 'loss');
	el.appendChild(overlayButton('New Run', () => location.reload()));
}

// ---------- Arena (draft) run ----------
// Draft a 30-card deck up front, then play it against fresh AI opponents until 3
// losses (12 wins = a flawless run). Reuses the Duels draft pool + rival roster;
// unlike Duels the deck is FIXED at the drafted 30 (no between-fight loot).
function resumeArenaOverlay(run) {
	return new Promise(resolve => {
		const hero = duelsEffectiveHero(run);
		const el = dungeonOverlay('ARENA RUN IN PROGRESS', `${hero?.name || run.heroId} - ${run.wins || 0} wins / ${run.losses || 0} losses with a ${run.deck.length}-card deck. Win as many as you can before 3 losses.`);
		el.appendChild(overlayButton('Continue the run', () => { hideDungeonOverlay(); resolve(true); }));
		el.appendChild(overlayButton('Abandon - draft a new deck', () => { hideDungeonOverlay(); resolve(false); }));
		el.appendChild(overlayButton('🏆 Leaderboard', () => showArenaLeaderboard()));
	});
}

// a fresh rival with a fair 30-card auto-drafted deck (no passives - matches the player)
function genArenaEnemy(cardsById, avoidId) {
	let roster = Duels.RIVALS;
	if (avoidId && roster.length > 1) roster = roster.filter(r => r.id !== avoidId);
	const rival = roster[Math.floor(Math.random() * roster.length)];
	const classes = Duels.classesOf(rival);
	const deck = Duels.autoDraftDeck(cardsById, classes, Math.random, 30);
	const altPowers = classes.flatMap(cl => Duels.HERO_POWERS[cl] || []).filter(id => cardsById[id] && cardsById[id].power);
	const powerChoices = [null, ...altPowers];
	const powerId = powerChoices[Math.floor(Math.random() * powerChoices.length)];
	return { id: rival.id, name: rival.name, heroClass: rival.heroClass, hsId: rival.hsId, deck, powerId };
}

function bootArenaEncounter(cardsById, run) {
	duelsCardsById = cardsById;
	const hero = duelsEffectiveHero(run);
	const enemy = run.enemy || (run.enemy = genArenaEnemy(cardsById));
	heistBossName = enemy.name; // shared enemy-name slot for nameOf()
	const playerCls = classRegistry.find(c => c.id === hero.heroClass) || { id: hero.heroClass, name: hero.name, power: null };
	const enemyCls = classRegistry.find(c => c.id === enemy.heroClass) || { id: enemy.heroClass, name: enemy.name, power: null };
	const picks = [playerCls, enemyCls];
	state = E.createGame(cardsById, Math.random, [...run.deck], 2, picks);
	state.classPicks = picks;
	if (run.powerId && cardsById[run.powerId]) { const pw = E.instantiate(cardsById[run.powerId], HUMAN); pw.zone = 'heropower'; pw.usedThisTurn = false; state.players[HUMAN].heroPowers = [pw]; }
	if (enemy.powerId && cardsById[enemy.powerId]) { const epw = E.instantiate(cardsById[enemy.powerId], 1); epw.zone = 'heropower'; epw.usedThisTurn = false; state.players[1].heroPowers = [epw]; }
	E.resetDeckAndHand(state, 1, [...enemy.deck]);
	E.drawCards(state, 1, 4);
	E.stripLoadouts(state);
	log(`Arena - ${run.wins || 0} wins / ${run.losses || 0} losses. Facing ${enemy.name} (${enemyCls.name || enemy.heroClass}).`);
	log(`You are ${hero.name} with your drafted ${run.deck.length}-card deck.`);
}

function arenaVictory(run) { afterArenaGame(run, true); }
function arenaDefeat(run) { afterArenaGame(run, false); }

// one game resolved: bank the result, end at 12 wins / 3 losses, else next fight
function afterArenaGame(run, won) {
	if (won) run.wins = (run.wins || 0) + 1; else run.losses = (run.losses || 0) + 1;
	saveArena(run);
	if (run.wins >= 12) { arenaRunComplete(run); return; }
	if (run.losses >= 3) { arenaRunOver(run); return; }
	advanceArena(run, won);
}

function advanceArena(run, won) {
	run.enemy = genArenaEnemy(state.cardsById, run.enemy && run.enemy.id); // next opponent (avoid immediate repeat)
	saveArena(run);
	const el = dungeonOverlay(won ? `WIN - ${run.wins} win${run.wins === 1 ? '' : 's'}` : `LOSS - ${run.losses}/3`, `Next up: ${run.enemy.name}. ${run.wins || 0} wins / ${run.losses || 0} losses - your drafted deck stands pat.`);
	el.appendChild(overlayButton('Fight!', () => location.reload()));
}

// reward scales with wins: 100 gold + 120 per win, plus the server pack
function arenaRunOver(run) {
	const hero = Duels.HEROES.find(h => h.id === run.heroId);
	const gold = 100 + (run.wins || 0) * 120;
	Col.earnGold(gold);
	const el = dungeonOverlay('3 LOSSES - RUN OVER', `${hero?.name || run.heroId} finishes ${run.wins || 0}-3. +${gold} gold banked.`);
	const sub = submitArenaScore(run);
	clearArena();
	mpRunReward(el, (run.wins || 0) >= 7 ? 'win' : 'loss');
	el.appendChild(overlayButton('🏆 Leaderboard', () => (sub || Promise.resolve()).finally(showArenaLeaderboard)));
	el.appendChild(overlayButton('New Arena Run', () => location.reload()));
}

function arenaRunComplete(run) {
	const hero = Duels.HEROES.find(h => h.id === run.heroId);
	Col.earnGold(1600);
	const el = dungeonOverlay('12 WINS - FLAWLESS ARENA!', `${hero?.name || run.heroId} runs the table 12-${run.losses || 0}. +1600 gold banked.`);
	const sub = submitArenaScore(run);
	mpRunReward(el, 'win');
	clearArena();
	el.appendChild(overlayButton('🏆 Leaderboard', () => (sub || Promise.resolve()).finally(showArenaLeaderboard)));
	el.appendChild(overlayButton('New Arena Run (+1600 gold)', () => location.reload()));
}

// submit a finished Arena run to the leaderboard (server keeps your BEST). Returns
// the call promise (or null when logged out) so the Leaderboard button can wait for it.
function submitArenaScore(run) {
	if (!MP_ON || !run) return null;
	const hero = Duels.HEROES.find(h => h.id === run.heroId);
	return MPX.call('arena-score', { wins: run.wins || 0, losses: run.losses || 0, hero: hero?.name || run.heroId || 'Hero' }).catch(() => null);
}

// a standalone overlay showing the top Arena runs + your rank
function injectArenaLbStyles() {
	if ($('arena-lb-style')) return;
	const st = document.createElement('style'); st.id = 'arena-lb-style';
	st.textContent = `
#arena-lb{position:fixed;inset:0;z-index:70;background:rgba(6,4,12,.9);display:flex;align-items:center;justify-content:center;padding:18px;font-family:inherit;}
#arena-lb .lb-card{width:min(460px,94vw);max-height:86vh;overflow:auto;background:#171126;color:#e8e0d0;border:1px solid #4a3f6a;border-radius:14px;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,.6);}
#arena-lb h2{margin:0 0 12px;font-size:20px;letter-spacing:1px;text-align:center;}
#arena-lb table{width:100%;border-collapse:collapse;font-size:14px;}
#arena-lb th,#arena-lb td{padding:6px 8px;text-align:left;border-bottom:1px solid #2c2440;}
#arena-lb th{color:#9a8fbf;font-size:11px;text-transform:uppercase;letter-spacing:.5px;}
#arena-lb td:first-child,#arena-lb th:first-child{width:34px;color:#ffcf6b;font-weight:800;}
#arena-lb tr.lb-me td{background:rgba(166,136,255,.14);color:#fff;font-weight:700;}
#arena-lb .lb-empty{text-align:center;color:#9a8fbf;padding:16px;}
#arena-lb .lb-you{margin-top:12px;text-align:center;color:#c9b8ff;font-size:14px;}
#arena-lb .lb-close{display:block;margin:16px auto 0;padding:9px 22px;background:#2a2440;color:#e8e0d0;border:1px solid #6a5f8a;border-radius:8px;font:inherit;cursor:pointer;}
#arena-lb .lb-close:hover{background:#372c56;}`;
	document.head.appendChild(st);
}
async function showArenaLeaderboard() {
	injectArenaLbStyles();
	$('arena-lb')?.remove();
	const ov = document.createElement('div'); ov.id = 'arena-lb';
	ov.innerHTML = '<div class="lb-card">Loading the leaderboard…</div>';
	ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
	document.body.appendChild(ov);
	let data; try { data = await MPX.call('arena-leaderboard'); } catch { data = null; }
	if (!document.body.contains(ov)) return; // closed while loading
	const top = (data && data.top) || [], you = data && data.you;
	const me = MPX.cachedState()?.username;
	const rows = top.map((e, i) => `<tr class="${e.name === me ? 'lb-me' : ''}"><td>${i + 1}</td><td>${esc2(e.name)}</td><td>${e.wins}–${e.losses}</td><td>${esc2(e.hero || '')}</td></tr>`).join('');
	const card = document.createElement('div'); card.className = 'lb-card';
	card.innerHTML = `<h2>🏆 Arena Leaderboard</h2>`
		+ `<table><thead><tr><th>#</th><th>Player</th><th>Best</th><th>Hero</th></tr></thead>`
		+ `<tbody>${rows || '<tr><td colspan="4" class="lb-empty">No runs recorded yet — be the first!</td></tr>'}</tbody></table>`
		+ (you ? `<div class="lb-you">Your best: <b>${you.wins}–${you.losses}</b>${you.rank ? ` · rank <b>#${you.rank}</b>` : ''}</div>`
			: `<div class="lb-you">Finish an Arena run to get on the board.</div>`);
	const close = document.createElement('button'); close.className = 'lb-close'; close.textContent = 'Close'; close.onclick = () => ov.remove();
	card.appendChild(close);
	ov.innerHTML = ''; ov.appendChild(card);
	window.__arenaLb = { count: top.length, youRank: you?.rank || null }; // test hook
}

// ================= replays: record live games, rewatch recorded tapes =========
// Recording piggybacks on the settled-render tail (nextEvent's empty-queue branch)
// and the gameOver event; playback reuses the spectate ingest pattern
// (state = fromSnapshot; updateHud; the always-running animate() loop redraws the
// 3D board) with all input gated off by replayMode.
let replayCards = null, replayTape = null, replayIdx = 0, replayView = 0;
let replayTimer = null, replaySpeed = 1, replayPanelsFor = 0, lastReplayId = null, lastReplayPromise = null;

function deriveReplayMeta() {
	const mode = dungeonRunMode ? 'dungeon' : heistRunMode ? 'heist' : tombsRunMode ? 'tombs'
		: duelsRunMode ? 'duels' : arenaRunMode ? 'arena' : duel.on ? 'multiplayer' : aiMatchId ? 'ai' : 'solo';
	const heroes = (state && state.players || []).map((p, i) => ({
		classId: (state.classPicks && state.classPicks[i] && state.classPicks[i].id) || p.heroClass || null,
		name: nameOf(i),
	}));
	return { mode, players: (state && state.players || []).length, heroes };
}
// called from the settled-render tail — captures one frame per stable board state
function maybeRecordFrame() {
	if (replayMode || spectateMode || !state || !Array.isArray(state.players)) return;
	if (!Rec.isRecording()) Rec.startRecording(deriveReplayMeta());
	Rec.capture(state, (logHistory[logHistory.length - 1] || '').replace(/^[—\-\s]+|[—\-\s]+$/g, '').trim());
}
function finalizeReplay(winner, resultOverride) {
	if (replayMode || spectateMode || !Rec.isRecording()) return;
	maybeRecordFrame(); // capture the final board
	// resultOverride lets a conceder record a 'loss' before the eventual winner is known
	const result = resultOverride || (winner == null ? 'draw' : winner === HUMAN ? 'win' : 'loss');
	// keep the promise so the post-game buttons can await the saved id (the overlay
	// is built synchronously in the same gameOver tick, before finish() resolves)
	lastReplayPromise = Rec.finish({ winner: winner == null ? null : winner, result }).then(id => { lastReplayId = id; return id; }).catch(() => null);
}

// clipboard with a prompt fallback + a banner ack
async function copyText(text, okMsg) {
	try { await navigator.clipboard.writeText(text); banner(okMsg, 2200); }
	catch { prompt('Copy:', text); }
}
// "Watch replay" + "Copy replay link" for a finished game's overlay. The tape was
// just saved by finalizeReplay; Watch opens it locally, Copy link uploads it for a
// shareable ?rshare= URL (falls back to copying the paste-able code when logged out).
function addReplayButtons(el) {
	if (!el || replayMode || spectateMode) return; // never offer a replay-of-a-replay
	const idOf = () => lastReplayPromise || Promise.resolve(lastReplayId);
	el.appendChild(overlayButton('▶ Watch replay', () => {
		// open in a NEW TAB (sync window.open keeps the click gesture) so watching a
		// replay never abandons a run's loot/progress screen; navigate it once the id resolves
		const w = window.open('', '_blank');
		idOf().then(id => {
			if (id) { const url = 'index.html?replay=' + encodeURIComponent(id); if (w) w.location = url; else location.href = url; }
			else { if (w) w.close(); banner('No replay was saved for this game.'); }
		});
	}));
	el.appendChild(overlayButton('🔗 Copy replay link', async () => {
		const id = await idOf();
		if (!id) { banner('No replay was saved for this game.'); return; }
		banner('Preparing share link…', 1500);
		const shareId = await Rec.uploadReplay(id);
		if (shareId) {
			const base = location.origin + location.pathname.replace(/[^/]*$/, '');
			copyText(base + 'index.html?rshare=' + shareId, 'Replay link copied — anyone can watch it.');
		} else {
			const code = Rec.exportCode(id);
			if (code) copyText(code, 'Copied a replay CODE — share it via Replays → Import. (Log in for a short link.)');
			else banner('Could not prepare a share link.');
		}
	}));
}

async function startReplay(cardsById) {
	replayCards = cardsById;
	replayTape = rshareId ? await Rec.fetchSharedReplay(rshareId) : await Rec.getReplay(replayId);
	if (!replayTape || !Array.isArray(replayTape.frames) || !replayTape.frames.length) {
		const el = dungeonOverlay('REPLAY NOT FOUND', rshareId
			? 'That shared replay has expired or the link is wrong.'
			: 'That replay is no longer saved on this device.');
		el.appendChild(overlayButton('Back to replays', () => { location.href = 'replays.html'; }));
		return;
	}
	replayView = 0; replayPanelsFor = 0;
	injectReplayStyles();
	renderReplayFrame(0);
	buildReplayBar();
}
function renderReplayFrame(i) {
	if (!replayTape) return;
	const frames = replayTape.frames;
	replayIdx = Math.max(0, Math.min(frames.length - 1, i));
	const f = frames[replayIdx];
	HUMAN = Math.min(replayView, ((f.snap.players && f.snap.players.length) || 1) - 1);
	state = E.fromSnapshot(f.snap, replayCards);
	E.ensureUidsAbove(E.maxSnapshotUid(f.snap)); // process-global uid safety
	if (state.players.length !== replayPanelsFor) {
		playerCount = state.players.length;
		frameCamera(); buildPanels(); buildSlotMarkers();
		replayPanelsFor = state.players.length;
	}
	updateHud();
	updateReplayBar();
}
function replayGoto(i) { replayPause(); renderReplayFrame(i); }
function replayStep(d) { replayPause(); renderReplayFrame(replayIdx + d); }
function replayPause() { if (replayTimer) { clearInterval(replayTimer); replayTimer = null; } updateReplayBar(); }
function replayPlay() {
	if (replayTimer || !replayTape) return;
	if (replayIdx >= replayTape.frames.length - 1) renderReplayFrame(0); // restart from the top if at the end
	replayTimer = setInterval(() => {
		if (replayIdx >= replayTape.frames.length - 1) { replayPause(); return; }
		renderReplayFrame(replayIdx + 1);
	}, Math.max(160, Math.round(900 / replaySpeed)));
	updateReplayBar();
}
function replayToggle() { replayTimer ? replayPause() : replayPlay(); }
function replayFlip() {
	const n = (replayTape.frames[replayIdx].snap.players && replayTape.frames[replayIdx].snap.players.length) || 2;
	replayView = (replayView + 1) % n;
	renderReplayFrame(replayIdx);
}
function replaySetSpeed(s) { replaySpeed = s; if (replayTimer) { replayPause(); replayPlay(); } updateReplayBar(); }

function injectReplayStyles() {
	if ($('replay-style')) return;
	const st = document.createElement('style');
	st.id = 'replay-style';
	st.textContent = `
#replay-bar{position:fixed;left:0;right:0;bottom:0;z-index:9999;background:rgba(10,7,20,.92);border-top:1px solid #3a2f56;padding:8px 12px;color:#e8e2f4;backdrop-filter:blur(4px)}
#rb-cap{font-size:13px;color:#cdbcff;text-align:center;min-height:16px;margin-bottom:6px;text-shadow:0 1px 2px #000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#rb-controls{display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap}
#rb-controls button{background:#2a2340;color:#cdbcff;border:1px solid #40356a;border-radius:7px;padding:6px 10px;font-size:13px;font-weight:700;cursor:pointer}
#rb-controls button:hover{background:#372c56;color:#fff}
#rb-scrub{flex:1;min-width:140px;max-width:420px;accent-color:#6b4fd4}
#rb-count{font-size:12px;color:#9a8fbf;min-width:64px;text-align:center}`;
	document.head.appendChild(st);
}
function buildReplayBar() {
	if ($('replay-bar')) return;
	const bar = document.createElement('div');
	bar.id = 'replay-bar';
	bar.innerHTML = '<div id="rb-cap"></div><div id="rb-controls">'
		+ '<button id="rb-first" title="First frame">⏮</button>'
		+ '<button id="rb-prev" title="Previous">◀</button>'
		+ '<button id="rb-play" title="Play / pause (space)">▶</button>'
		+ '<button id="rb-next" title="Next">▶▶</button>'
		+ '<button id="rb-last" title="Last frame">⏭</button>'
		+ `<input id="rb-scrub" type="range" min="0" max="${replayTape.frames.length - 1}" value="0">`
		+ '<span id="rb-count"></span>'
		+ '<button id="rb-speed" title="Playback speed">1×</button>'
		+ '<button id="rb-flip" title="Flip which side you watch from">⇅ View</button>'
		+ '<button id="rb-exit" title="Back to replays">✕</button></div>';
	document.body.appendChild(bar);
	$('rb-first').onclick = () => replayGoto(0);
	$('rb-prev').onclick = () => replayStep(-1);
	$('rb-next').onclick = () => replayStep(1);
	$('rb-last').onclick = () => replayGoto(replayTape.frames.length - 1);
	$('rb-play').onclick = () => replayToggle();
	$('rb-scrub').oninput = e => replayGoto(+e.target.value);
	$('rb-flip').onclick = () => replayFlip();
	$('rb-exit').onclick = () => { location.href = 'replays.html'; };
	const speeds = [1, 2, 4, 0.5];
	$('rb-speed').onclick = () => replaySetSpeed(speeds[(speeds.indexOf(replaySpeed) + 1) % speeds.length]);
	addEventListener('keydown', e => {
		if (!replayMode) return;
		if (e.key === 'ArrowRight') { e.preventDefault(); replayStep(1); }
		else if (e.key === 'ArrowLeft') { e.preventDefault(); replayStep(-1); }
		else if (e.key === ' ') { e.preventDefault(); replayToggle(); }
	});
	updateReplayBar();
}
function updateReplayBar() {
	if (!$('replay-bar') || !replayTape) return;
	const f = replayTape.frames[replayIdx];
	$('rb-cap').textContent = f.cap || `Turn ${f.turn || '?'}`;
	$('rb-count').textContent = `${replayIdx + 1} / ${replayTape.frames.length}`;
	$('rb-play').textContent = replayTimer ? '❚❚' : '▶';
	$('rb-speed').textContent = replaySpeed + '×';
	$('rb-scrub').value = String(replayIdx);
	// expose for the headless replay smoke test
	window.__replay = { idx: replayIdx, total: replayTape.frames.length, view: replayView, playing: !!replayTimer };
}

start();
