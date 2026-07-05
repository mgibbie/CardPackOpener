// game.js — Magepunk Battlecards: Three.js table renderer + interaction.
// Rules live in engine.js; the AI in ai.js. This file only draws and routes input.
import * as THREE from 'three';
import * as E from './engine.js';
import * as AI from './ai.js';
import * as Col from './collection.js';
import { CARD_W, CARD_H, CARD_D, makeFaceTexture, makeBackTexture } from './cardart.js';

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
	const tex = makeFaceTexture(
		{ ...card, health: card.maxHealth },
		card.type === 'creature' ? { attack: card.attack, hp: E.hp(card), maxHealth: card.maxHealth }
			: card.type === 'weapon' ? { attack: card.attack, durability: card.durability } : {}
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
const FLAT = new THREE.Euler(-Math.PI / 2, 0, 0); // face up on the table

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
		el.innerHTML = `<div class="life"></div><div class="sub"><b>${nameOf(pi)}</b> · Mana <span class="mana"></span><br>Hand <span class="hand"></span> · Deck <span class="deck"></span></div><div class="gear"></div>`;
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

function pump() {
	if (!state) return;
	queue.push(...E.takeEvents(state));
	if (!queueBusy) nextEvent();
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
		case 'secretRevealed':
			banner(`Secret: ${ev.card.name}!`, 1600);
			log(`${ev.player === HUMAN ? 'Your' : `${nameOf(ev.player)}'s`} Secret revealed: ${ev.card.name}`);
			delay = 900;
			break;
		case 'countered': log(`${ev.name} was countered!`); delay = 400; break;
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
		const c = p.hand.find(c => c.uid === uid) || p.board.find(c => c.uid === uid);
		if (c) return c;
	}
	return null;
}

addEventListener('pointermove', ev => {
	hoverUid = pick(ev);
});

function clearModes() {
	pending = null;
	selectedAttacker = null;
	updateHud();
}

addEventListener('contextmenu', ev => { ev.preventDefault(); clearModes(); });

renderer.domElement.addEventListener('pointerdown', ev => {
	if (ev.button !== 0 || !state || state.over || state.current !== HUMAN) return;
	const uid = pick(ev);
	const card = cardOf(uid);

	// targeting mode: expect a creature click (hero clicks handled on the panels)
	if (pending) {
		if (card && card.zone === 'board') {
			const t = pending.targets.find(t => t.type === 'creature' && t.uid === card.uid);
			if (t) { E.playCard(state, HUMAN, pending.card.uid, t); clearModes(); pump(); return; }
		}
		clearModes();
		return;
	}
	if (selectedAttacker === 'HERO') {
		if (card && card.zone === 'board' && card.controller !== HUMAN) {
			const t = E.heroAttackTargets(state, HUMAN).find(t => t.type === 'creature' && t.uid === card.uid);
			if (t) { E.heroAttack(state, HUMAN, t); clearModes(); pump(); return; }
		}
		clearModes();
		return;
	}
	if (selectedAttacker) {
		const attacker = cardOf(selectedAttacker);
		if (card && card.zone === 'board' && card.controller !== HUMAN && attacker) {
			const t = E.attackTargets(state, HUMAN, attacker).find(t => t.type === 'creature' && t.uid === card.uid);
			if (t) { E.attack(state, HUMAN, selectedAttacker, t); clearModes(); pump(); return; }
		}
		clearModes();
		if (!card || card.controller !== HUMAN) return; // fall through to reselect own creature
	}

	if (!card) return;
	if (card.zone === 'hand' && card.controller === HUMAN) {
		if (!E.canPlay(state, HUMAN, card)) return;
		const spec = E.targetSpec(state, HUMAN, card);
		if (spec) {
			const targets = E.legalTargets(state, HUMAN, spec);
			if (targets.length) { pending = { card, spec, targets }; updateHud(); return; }
			if (spec.required) return;
		}
		E.playCard(state, HUMAN, card.uid, null);
		pump();
	} else if (card.zone === 'board' && card.controller === HUMAN) {
		if (E.canAttackWith(state, HUMAN, card)) { selectedAttacker = card.uid; updateHud(); }
	}
});

// hero panels as click targets (attacks + targeted spells at heroes)
function panelClick(pi) {
	if (!state || state.over || state.current !== HUMAN) return;
	if (pending) {
		const t = pending.targets.find(t => t.type === 'hero' && t.player === pi);
		if (t) { E.playCard(state, HUMAN, pending.card.uid, t); clearModes(); pump(); }
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
	if (pending) for (const t of pending.targets) if (t.type === 'creature') validCreatureTargets.add(t.uid);
	if (selectedAttacker === 'HERO') {
		for (const t of E.heroAttackTargets(state, HUMAN)) if (t.type === 'creature') validCreatureTargets.add(t.uid);
	} else if (selectedAttacker) {
		const attacker = cardOf(selectedAttacker);
		if (attacker) for (const t of E.attackTargets(state, HUMAN, attacker)) if (t.type === 'creature') validCreatureTargets.add(t.uid);
	}
	for (const ent of entities.values()) {
		const c = ent.card;
		let color = null;
		if (validCreatureTargets.has(c.uid)) color = '#ff5f4f';
		else if (selectedAttacker === c.uid || pending?.card.uid === c.uid) color = '#ffd25f';
		else if (!pending && !selectedAttacker && state.current === HUMAN && !state.over) {
			if (c.zone === 'board' && c.controller === HUMAN && E.canAttackWith(state, HUMAN, c)) color = '#57e389';
			else if (c.zone === 'hand' && c.controller === HUMAN && E.canPlay(state, HUMAN, c)) color = '#57e389';
		}
		if (color && c.zone === 'board') {
			ent.ring.visible = true;
			ent.ring.material.color.set(color);
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
	// use the saved deck when it's complete and valid; otherwise the demo deck
	const collection = Col.getCollection(data.cards);
	const saved = Col.loadDeck();
	const deckOk = saved.length === Col.DECK_SIZE && !Col.validateDeck(saved, cardsById, collection);
	state = E.createGame(cardsById, Math.random, deckOk ? saved : null, playerCount);
	buildPanels();
	log(deckOk ? 'Using your custom deck.' : 'Using the demo deck — build one in the deck builder!');
	if (playerCount > 2) log(`Free-for-all: ${playerCount} players, last hero standing wins.`);
	pump();
	updateHud();
}
start();
