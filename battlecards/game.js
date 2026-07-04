// game.js — Magepunk Battlecards: Three.js table renderer + interaction.
// Rules live in engine.js; the AI in ai.js. This file only draws and routes input.
import * as THREE from 'three';
import * as E from './engine.js';
import * as AI from './ai.js';
import * as Col from './collection.js';
import { CARD_W, CARD_H, CARD_D, makeFaceTexture, makeBackTexture } from './cardart.js';

const HUMAN = 0, ENEMY = 1;

// ---------- scene ----------
const container = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0d0a14');
scene.fog = new THREE.Fog('#0d0a14', 18, 34);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 13.2, 12.2);
camera.lookAt(0, 0, -0.8);

scene.add(new THREE.AmbientLight(0xffffff, 0.75));
const key = new THREE.DirectionalLight(0xfff2e0, 1.5);
key.position.set(4, 10, 5);
scene.add(key);
const rim = new THREE.PointLight(0x8f6fff, 30, 40);
rim.position.set(-7, 4, -3);
scene.add(rim);

// table
{
	const tableCanvas = document.createElement('canvas');
	tableCanvas.width = tableCanvas.height = 512;
	const tc = tableCanvas.getContext('2d');
	const g = tc.createRadialGradient(256, 256, 60, 256, 256, 360);
	g.addColorStop(0, '#2a2038');
	g.addColorStop(1, '#171021');
	tc.fillStyle = g;
	tc.fillRect(0, 0, 512, 512);
	tc.strokeStyle = 'rgba(143,111,255,0.25)';
	tc.lineWidth = 3;
	tc.strokeRect(20, 20, 472, 472);
	tc.beginPath(); tc.moveTo(20, 256); tc.lineTo(492, 256); tc.stroke();
	const tex = new THREE.CanvasTexture(tableCanvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	const table = new THREE.Mesh(
		new THREE.PlaneGeometry(26, 15),
		new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })
	);
	table.rotation.x = -Math.PI / 2;
	table.position.y = -0.06;
	scene.add(table);
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
		card.type === 'creature' ? { attack: card.attack, hp: E.hp(card), maxHealth: card.maxHealth } : {}
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
		ent = { card, mesh, faceMat, target: { pos: new THREE.Vector3(), rot: new THREE.Euler(), scale: 1 }, ring: makeRing('#57e389') };
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
	const seen = new Set();
	for (const pi of [HUMAN, ENEMY]) {
		const p = state.players[pi];
		// hand
		const n = p.hand.length;
		p.hand.forEach((card, i) => {
			const ent = entityFor(card);
			seen.add(card.uid);
			const spread = Math.min(1.55, 10.5 / Math.max(n, 1));
			const x = (i - (n - 1) / 2) * spread;
			if (pi === HUMAN) {
				const hovered = hoverUid === card.uid || (pending?.card.uid === card.uid);
				ent.target.pos.set(x, 1.7 + (hovered ? 0.9 : 0) + i * 0.012, 6.9 - Math.abs(x) * 0.04 - (hovered ? 0.55 : 0));
				ent.target.rot = new THREE.Euler(-0.5, 0, -(i - (n - 1) / 2) * 0.03);
				ent.target.scale = hovered ? 1.0 : 0.68;
			} else {
				ent.target.pos.set(-x, 1.1 + i * 0.012, -7.1);
				ent.target.rot = new THREE.Euler(0.95 + Math.PI, 0, 0); // back to camera
				ent.target.scale = 0.58;
			}
		});
		// board
		const bn = p.board.length;
		p.board.forEach((card, i) => {
			const ent = entityFor(card);
			seen.add(card.uid);
			const x = (i - (bn - 1) / 2) * 2.35;
			const z = pi === HUMAN ? 2.0 : -2.0;
			ent.target.pos.set(x, 0.06, z);
			ent.target.rot = FLAT.clone();
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
	return new THREE.Vector3(0, 1.4, pi === HUMAN ? 4.8 : -4.8);
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

function updateHud() {
	if (!state) return;
	const me = state.players[HUMAN], foe = state.players[ENEMY];
	$('my-life').textContent = me.life;
	$('foe-life').textContent = foe.life;
	$('my-mana').textContent = `${E.availableMana(me)}/${me.mana.max}`;
	$('foe-mana').textContent = `${E.availableMana(foe)}/${foe.mana.max}`;
	$('my-deck').textContent = me.deck.length;
	$('foe-deck').textContent = foe.deck.length;
	$('foe-hand').textContent = foe.hand.length;
	$('coin-btn').style.display = (me.coins > 0 && state.current === HUMAN) ? '' : 'none';
	const myTurn = state.current === HUMAN && !state.over;
	$('end-turn').disabled = !myTurn;
	$('end-turn').textContent = myTurn ? 'End Turn' : 'Enemy Turn…';
	$('hint').textContent = pending
		? `Choose ${pending.spec.why} for ${pending.card.name} (right-click to cancel)`
		: (selectedAttacker ? 'Choose an attack target (right-click to cancel)' : '');
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
			banner(ev.player === HUMAN ? 'Your Turn' : 'Enemy Turn');
			log(`— Turn ${ev.turnNumber}: ${ev.player === HUMAN ? 'you' : 'enemy'} —`);
			delay = 500;
			break;
		case 'draw':
			delay = ev.player === HUMAN ? 180 : 90;
			break;
		case 'play':
			log(`${ev.player === HUMAN ? 'You' : 'Enemy'} played ${ev.card.name}`);
			delay = 420;
			break;
		case 'summon':
			log(`${ev.player === HUMAN ? 'You' : 'Enemy'} summoned ${ev.card.name}`);
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
				const panel = $(ev.player === HUMAN ? 'my-panel' : 'foe-panel');
				panel.classList.add('hit');
				setTimeout(() => panel.classList.remove('hit'), 350);
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
		case 'destroy':
		case 'death': {
			const ent = entities.get(ev.uid);
			if (ent) { ent.dying = performance.now(); }
			if (ev.name) log(`${ev.name} died`);
			delay = 330;
			break;
		}
		case 'coin': log('Enemy spent a coin (+1 mana)'); delay = 250; break;
		case 'reshuffle': log(`${ev.player === HUMAN ? 'Your' : 'Enemy'} graveyard was shuffled back in`); break;
		case 'discard': log(`${ev.player === HUMAN ? 'You' : 'Enemy'} discarded ${ev.card.name}`); break;
		case 'gameOver': {
			const won = ev.winner === HUMAN;
			banner(ev.winner == null ? 'Draw!' : won ? 'VICTORY!' : 'DEFEAT', 0);
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

// ---------- AI driver ----------
let aiTimer = null;
function maybeRunAI() {
	if (!state || state.over || state.current !== ENEMY || queue.length || queueBusy) return;
	clearTimeout(aiTimer);
	aiTimer = setTimeout(() => {
		if (!state || state.over || state.current !== ENEMY) return;
		const acted = AI.step(state);
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
	for (const pi of [0, 1]) {
		const c = state.players[pi].hand.find(c => c.uid === uid) || state.players[pi].board.find(c => c.uid === uid);
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
	if (selectedAttacker) {
		const attacker = cardOf(selectedAttacker);
		if (card && card.zone === 'board' && card.controller === ENEMY && attacker) {
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
for (const [pi, id] of [[HUMAN, 'my-panel'], [ENEMY, 'foe-panel']]) {
	$(id).addEventListener('pointerdown', () => {
		if (!state || state.over || state.current !== HUMAN) return;
		if (pending) {
			const t = pending.targets.find(t => t.type === 'hero' && t.player === pi);
			if (t) { E.playCard(state, HUMAN, pending.card.uid, t); clearModes(); pump(); }
			return;
		}
		if (selectedAttacker && pi === ENEMY) {
			const attacker = cardOf(selectedAttacker);
			if (!attacker) { clearModes(); return; }
			const t = E.attackTargets(state, HUMAN, attacker).find(t => t.type === 'hero');
			if (t) { E.attack(state, HUMAN, selectedAttacker, t); clearModes(); pump(); }
		}
	});
}

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
	if (selectedAttacker) {
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
		ent.faceMat.emissive?.set(color && c.zone === 'hand' ? 0x1c4a1c : 0x000000);
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
		const q = new THREE.Quaternion().setFromEuler(ent.target.rot);
		ent.mesh.quaternion.slerp(q, 1 - Math.pow(0.001, dt));
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
	logEl.innerHTML = '';
	const data = await (await fetch('cards.json')).json();
	const cardsById = {};
	for (const d of data.cards) cardsById[d.id] = d;
	// use the saved deck when it's complete and valid; otherwise the demo deck
	const collection = Col.getCollection(data.cards);
	const saved = Col.loadDeck();
	const deckOk = saved.length === Col.DECK_SIZE && !Col.validateDeck(saved, cardsById, collection);
	state = E.createGame(cardsById, Math.random, deckOk ? saved : null);
	log(deckOk ? 'Using your custom deck.' : 'Using the demo deck — build one in the deck builder!');
	pump();
	updateHud();
}
start();
