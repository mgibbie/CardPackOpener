// ow_follow.js — the READ-ONLY viewer for overworld exploration (owner, 2026-11-19: "a friend can watch you walk around
// live (camera follows you, read-only, with your battles and minigames shown as they happen). Each play session is also
// recorded as a position/scene tape you can scrub through later.").
//
//   /overworld/?follow=<friend>       live: polls world-state (friends only, both ways; SPEC_CAP watchers), loads the
//                                     friend's map and walks their figure along, the scene on their screen drawn over it
//   /overworld/?journey=local:<key>   a session tape kept on this device (START > REPLAYS)
//   /overworld/?journey=<id>          a session tape shared from an account (owreplay-get: anyone with the link)
//
// main.js runs this INSTEAD of the game's boot, so nothing of the viewer's own game starts: no save hydrate or push, no
// heartbeat, no tab lock (the viewer's game in another tab is not paused), no map scripts, encounters or trainers. The
// map is drawn from world.load alone. ow_readonly.js (imported first by main.js) is the second wall: on this page every
// write to the game's localStorage keys and every save/presence/publish call is dropped.
// Keys: X leaves (Esc too). A journey: Z (or START) plays / pauses, ◄ ► step a frame, ▲ ▼ change the speed, C jumps to
// the next scene (a battle, a conversation), L (or the 🔗 button) copies a link to this moment. Touch: a tap plays / pauses; the B button leaves. A controller does the same.
import * as MP from '../battlecards/mpmode.js';
import * as Chat from '../battlecards/chat.js';
import { unpackString } from '../battlecards/codec.js';
import { actionForKey, isTyping } from '../site/input.js';
import { startGamepad } from '../site/gamepad.js';
import { VIEW_W, VIEW_H, META } from './engine.js';
import { hud, npcs, screen, sctx, world } from './ow_core.js';
import { drawFriendGhosts, ghosts } from './ow_pvp.js';
import { drawScene } from './ow_scenes.js';
import { foldFrames, listJourneys } from './ow_worldcast.js';
import { refused } from './ow_readonly.js';
import { clipStart, copyClip, floatingClipButton } from '../site/clip.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { MP_ON, SCALE, ctx, frame } from './main.js';

export const followView = { active: null };
const POLL_MS = 1000;
const ID_RE = /^[a-f0-9]{8,20}$/;
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function startFollowView(p) {
	const v = followView.active = {
		mode: p.mode, who: p.who || '', id: p.id || '', name: p.mode === 'follow' ? p.who : 'you',
		map: null, loadingMap: null, state: null, scene: null, msg: 'Loading…', watchers: 0, seq: -1, stopped: false,
		tape: null, states: null, i: -1, clock: 0, playing: true, speed: 1,
	};
	document.body.classList.add('ow-follow');
	hud.textContent = p.mode === 'follow' ? `Watching ${p.who}` : 'Journey replay';
	installInput(v);
	requestAnimationFrame(t => loop(v, t));
	window.__owFollow = { get view() { return followView.active; }, refused, ghosts, world, key: k => key(v, k) };
	try { await world.init(); } catch (e) { v.msg = 'The map list could not be loaded. Reload to try again.'; return; }
	try { await npcs.init(); } catch (e) { /* the map still draws without its people */ }
	if (p.mode === 'follow') {
		if (!MP_ON) { v.msg = 'Sign in to watch a friend.'; return; }
		if (!p.who) { v.msg = 'Nobody to watch.'; return; }
		v.msg = `Finding ${p.who}…`;
		// the followed player's room: read it, chat with the other watchers (like the battle spectator)
		try { Chat.mount({ room: 'u:' + p.who, canPost: false, specRoom: 'spec:' + p.who }); } catch (e) { }
		pollLoop(v);
	} else await loadJourney(v);
}

// ---- live: one world-state poll a second
async function pollLoop(v) {
	while (followView.active === v && !v.stopped) {
		try {
			const r = await MP.call('world-state', { username: v.who, seq: v.seq });
			if (followView.active !== v) break;
			if (r && r.full) v.msg = `${v.who} already has ${r.max || 10} watchers. Try again later.`;
			else if (r && r.error) { v.msg = /friend/i.test(r.error) ? 'You can only watch a friend.' : String(r.error); if (/friend/i.test(r.error)) { v.stopped = true; break; } }
			else if (r && r.online === false) { v.msg = `${v.who} is not playing right now.`; v.scene = null; }
			else if (r) {
				v.watchers = r.watchers || 0;
				if (r.snapshot) { v.seq = r.seq; v.msg = ''; await ingest(v, r.snapshot); }
				else if (!r.unchanged && r.presence && r.presence.map) {
					// not streaming yet (they notice a new watcher within ~10 s): where their last heartbeat put them
					const pr = r.presence, st = String(pr.status || '');
					v.msg = st.startsWith('factory:') || st.startsWith('battling:') ? `${v.who} is in a battle…` : `Connecting to ${v.who}…`;
					await ingest(v, { map: pr.map, x: pr.x, y: pr.y, f: pr.facing, scene: null });
				}
			}
		} catch (e) { /* the next poll */ }
		await sleep(POLL_MS);
	}
}

// ---- a journey (a session tape)
async function loadJourney(v) {
	let tape = null;
	if (v.id.startsWith('local:')) tape = listJourneys().find(t => t.key === v.id.slice(6)) || null;
	else if (ID_RE.test(v.id)) {
		try { const r = await MP.call('owreplay-get', { id: v.id }); if (r && r.code) { tape = JSON.parse(await unpackString(r.code)); if (r.by) v.name = r.by; } } catch (e) { tape = null; }
	}
	if (!tape || !Array.isArray(tape.frames) || !tape.frames.length) { v.msg = 'That journey could not be found.'; return; }
	v.tape = tape; v.states = foldFrames(tape.frames); v.msg = '';
	hud.textContent = tape.label || 'Journey';
	// CLIPS (owner, 2026-11-19): a shared journey's link can start at a frame (&t=<frame>, opened paused there); C or the 🔗
	// button copies a link to the frame on screen. A journey kept on this device alone (local:) has no link to share.
	const at = clipStart(tape.frames.length - 1);
	if (at) { v.playing = false; await tapeTo(v, at, true); } else await tapeTo(v, 0, true);
	if (!v.id.startsWith('local:')) floatingClipButton(() => Math.max(0, v.i), { id: 'ow-clip', getExtra: () => ({ journey: v.id }) });
}
async function tapeTo(v, i, jump) {
	const f = v.tape.frames; i = Math.max(0, Math.min(f.length - 1, i)); if (i === v.i) return;
	v.i = i; v.clock = f[i].t;
	if (i === f.length - 1) v.playing = false;
	await ingest(v, v.states[i], jump);
}
function nextScene(v) {
	const s = v.states; if (!s) return;
	for (let j = v.i + 1; j < s.length; j++) if (s[j].scene && !(s[j - 1] && s[j - 1].scene)) { v.playing = false; tapeTo(v, j, true); return; }
	v.msg = 'No more scenes in this journey.'; setTimeout(() => { if (v.msg === 'No more scenes in this journey.') v.msg = ''; }, 1500);
}

// ---- the map and the figure on it
function ghostOf(v) {
	let g = ghosts.get(v.name);
	if (!g) { g = { px: 0, py: 0, path: [], facing: 'down', facingReported: 'down', missed: 0 }; ghosts.set(v.name, g); }
	return g;
}
async function showMap(v, file) {
	if (v.map === file) return true;
	v.loadingMap = file;
	try {
		await world.load(file);
		if (v.loadingMap !== file) return false;   // (a newer map was asked for meanwhile)
		try { await npcs.loadForMap(); } catch (e) { npcs.list = []; }
		v.map = file;
		return true;
	} catch (e) { v.msg = 'That map could not be loaded.'; return false; } finally { if (v.loadingMap === file) v.loadingMap = null; }
}
async function ingest(v, st, jump) {
	if (!st || !st.map) return;
	v.state = st; v.scene = st.scene || null;
	const file = world.fileFor(st.map) || st.map;
	const g = ghostOf(v), x = +st.x || 0, y = +st.y || 0;
	g.facingReported = st.f || 'down';
	if (file !== v.map) {
		if (!(await showMap(v, file))) return;
		g.path = []; g.px = x * META; g.py = y * META;
		hud.textContent = (v.mode === 'follow' ? `Watching ${v.who} · ` : '') + (st.name || world.current?.map?.name || file);
		return;
	}
	const last = g.path.length ? g.path[g.path.length - 1] : { x: Math.round(g.px / META), y: Math.round(g.py / META) };
	if (jump || Math.abs(last.x - x) + Math.abs(last.y - y) > 8) { g.path = []; g.px = x * META; g.py = y * META; return; }
	if (last.x !== x || last.y !== y) { g.path.push({ x, y }); if (g.path.length > 6) g.path.splice(0, g.path.length - 6); }
}

// ---- input: this page's keys are the viewer's alone (the game's handlers never see them)
const PAD_KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', confirm: 'z', cancel: 'x', menu: 'Enter', secondary: 'c', context: 'c' };
const TOUCH_KEY = { 't-a': 'z', 't-b': 'x', 't-start': 'Enter' };
function installInput(v) {
	addEventListener('keydown', e => {
		if (followView.active !== v) return;
		if (isTyping()) return;   // (the chat box)
		e.stopImmediatePropagation();
		if (e.repeat && !/^Arrow/.test(e.key)) return;
		if (e.key === 'l' || e.key === 'L') { e.preventDefault(); key(v, 'l'); return; }   // (L: a link to this moment, CLIPS)
		const a = actionForKey(e);
		const k = e.key === 'Escape' ? 'x' : a ? PAD_KEY[a] : null;
		if (k) { e.preventDefault(); key(v, k); }
	}, true);
	addEventListener('keyup', e => { if (followView.active === v && !isTyping()) e.stopImmediatePropagation(); }, true);
	addEventListener('pointerdown', e => {
		if (followView.active !== v) return;
		const t = e.target && e.target.closest ? e.target.closest('[id]') : null, id = t && t.id;
		if (id && TOUCH_KEY[id]) { e.preventDefault(); e.stopImmediatePropagation(); key(v, TOUCH_KEY[id]); return; }
		if (id && /^t-|^dpad/.test(id)) { e.stopImmediatePropagation(); return; }
		if (e.target === screen) { e.preventDefault(); e.stopImmediatePropagation(); if (v.tape) key(v, 'z'); }
	}, true);
	try { startGamepad({ onPress: a => { const k = PAD_KEY[a]; if (k && followView.active === v) key(v, k); } }); } catch (e) { }
}
function key(v, k) {
	if (k === 'x') { leave(v); return; }
	if (!v.tape) return;
	if (k === 'z' || k === 'Enter') { if (v.i >= v.tape.frames.length - 1) { v.i = -1; tapeTo(v, 0, true); } v.playing = !v.playing; }
	else if (k === 'ArrowRight') { v.playing = false; tapeTo(v, v.i + 1); }
	else if (k === 'ArrowLeft') { v.playing = false; tapeTo(v, v.i - 1, true); }
	else if (k === 'ArrowUp') v.speed = Math.min(16, v.speed * 2);
	else if (k === 'ArrowDown') v.speed = Math.max(0.5, v.speed / 2);
	else if (k === 'c') nextScene(v);
	else if (k === 'l' && !v.id.startsWith('local:')) { copyClip(Math.max(0, v.i), { journey: v.id }); v.msg = 'Link to this moment copied.'; setTimeout(() => { if (v.msg === 'Link to this moment copied.') v.msg = ''; }, 1500); }
}
function leave(v) {
	followView.active = null; v.stopped = true;
	try { if (Chat.active()) Chat.unmount(); } catch (e) { }
	if (v.mode === 'follow' && window.history.length > 1) window.history.back();
	else location.href = '/overworld/';
}

// ---- the frame
let lastT = 0;
function loop(v, t) {
	if (followView.active !== v) return;
	requestAnimationFrame(t2 => loop(v, t2));
	const dt = lastT ? Math.min((t - lastT) / 1000, 0.1) : 0.016; lastT = t;
	if (v.tape && v.playing && v.states) {
		v.clock += dt * 1000 * v.speed;
		const f = v.tape.frames; let j = v.i;
		while (j + 1 < f.length && f[j + 1].t <= v.clock) j++;
		if (j !== v.i) tapeTo(v, j, j > v.i + 3);   // (a fast-forward that skips frames lands, rather than walks)
	}
	const SW = screen.width, SH = screen.height;
	if (world.current && v.map) {
		const g = ghostOf(v);
		const camX = Math.round(g.px + META / 2 - VIEW_W / 2), camY = Math.round(g.py + META / 2 - VIEW_H / 2 - 8);
		ctx.clearRect(0, 0, VIEW_W, VIEW_H);
		world.drawLayer(ctx, 'bottom', camX, camY);
		for (const n of [...(npcs.list || [])].sort((a, b) => a.py - b.py)) { try { n.draw(ctx, camX, camY); } catch (e) { } }
		drawFriendGhosts(ctx, camX, camY);
		world.drawLayer(ctx, 'top', camX, camY);
		sctx.drawImage(frame, 0, 0, VIEW_W * SCALE, VIEW_H * SCALE);
	} else { sctx.fillStyle = '#101018'; sctx.fillRect(0, 0, SW, SH); }
	if (v.scene) drawScene(sctx, SW, SH, v.scene);
	drawBar(v, SW, SH);
}
function drawBar(v, W, H) {
	const u = H / 480;
	sctx.save();
	sctx.fillStyle = 'rgba(10,8,24,0.78)'; sctx.fillRect(0, 0, W, 34 * u);
	sctx.textBaseline = 'middle'; sctx.textAlign = 'left';
	sctx.fillStyle = '#ffd25f'; sctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
	const where = (v.state && v.state.name) || '';
	const title = v.tape ? `▶ ${v.tape.label || 'Journey'}` : `\u{1F441} Watching ${v.who}${where ? '  ·  ' + where : ''}${v.watchers ? '  ·  ' + v.watchers + ' watching' : ''}`;
	sctx.fillText(title, 12 * u, 17 * u);
	sctx.textAlign = 'right'; sctx.fillStyle = '#cfc8ee'; sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
	sctx.fillText(v.tape ? `${v.playing ? 'Z pause' : 'Z play'} · ◄► step · ▲▼ ×${v.speed} · C next scene · ${v.i + 1}/${v.tape.frames.length} · X leave` : 'X = stop watching', W - 12 * u, 17 * u);
	if (v.msg) {
		sctx.textAlign = 'center'; sctx.font = `${Math.round(17 * u)}px m6x11plus, monospace`;
		const w = Math.min(W - 24 * u, sctx.measureText(v.msg).width + 40 * u);
		sctx.fillStyle = 'rgba(10,8,24,0.86)'; sctx.fillRect((W - w) / 2, H / 2 - 22 * u, w, 44 * u);
		sctx.fillStyle = '#fff'; sctx.fillText(v.msg, W / 2, H / 2);
	}
	sctx.restore();
}
