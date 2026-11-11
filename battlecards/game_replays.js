// game_replays.js — replays: record live games, rewatch recorded tapes (cut out of game.js, 2026-11).
// Cut and paste only: tools/extract_block.mjs wrote the import/export plumbing around it; the code is unchanged.
import * as E from './engine.js';
import { GS } from './game_state.js';
import * as Rec from './replayrec.js';
import * as RunRep from './runreplay.js';
import * as SFX from './sfx.js';
// game.js's own declarations (a safe cycle: only used inside functions)
import {
	$, MP_ON, activeRunIO, aiMatchId, arenaRunMode, banner, buildPanels, buildSlotMarkers, duel,
	duelsRunMode, dungeonOverlay, dungeonRunMode, finalfantasyRunMode, frameCamera, heistRunMode,
	logFull, logHistory, logLinks, lorequestRunMode, middleearthRunMode, multiverseRunMode, nameOf,
	overlayButton, pendingFx, renderLogFull, replayId, replayMode, rrunId, rshareId, runModeName,
	saveAsyncSnapshot, saveRunSnapshot, spectateMode, swordcoastRunMode, tombsRunMode, updateHud,
	wake, watchResultLine,
} from './game.js';

// ================= replays: record live games, rewatch recorded tapes =========
// Recording piggybacks on the settled-render tail (nextEvent's empty-queue branch)
// and the gameOver event; playback reuses the spectate ingest pattern
// (state = fromSnapshot; updateHud; the always-running animate() loop redraws the
// 3D board) with all input gated off by replayMode.
export let replayCards = null, replayTape = null, replayIdx = 0, replayView = 0;
let replayTimer = null, replaySpeed = 1, replayPanelsFor = 0, lastReplayId = null, lastReplayPromise = null;

function deriveReplayMeta() {
	const mode = dungeonRunMode ? 'dungeon' : heistRunMode ? 'heist' : tombsRunMode ? 'tombs'
		: duelsRunMode ? 'duels' : arenaRunMode ? 'arena' : lorequestRunMode ? 'lorequest' : middleearthRunMode ? 'middleearth' : swordcoastRunMode ? 'swordcoast' : finalfantasyRunMode ? 'finalfantasy' : multiverseRunMode ? 'multiverse' : duel.on ? 'multiplayer' : aiMatchId ? 'ai' : 'solo';
	const heroes = (GS.state && GS.state.players || []).map((p, i) => ({
		classId: (GS.state.classPicks && GS.state.classPicks[i] && GS.state.classPicks[i].id) || p.heroClass || null,
		name: nameOf(i),
	}));
	return { mode, players: (GS.state && GS.state.players || []).length, heroes };
}
// called from the settled-render tail — captures one frame per stable board state
export function maybeRecordFrame() {
	if (replayMode || spectateMode || !GS.state || !Array.isArray(GS.state.players)) return;
	if (!Rec.isRecording()) Rec.startRecording(deriveReplayMeta());
	Rec.capture(GS.state, (logHistory[logHistory.length - 1] || '').replace(/^[—\-\s]+|[—\-\s]+$/g, '').trim(), pendingFx.splice(0));
	saveRunSnapshot(); // persist the live fight into the active run so resume restores this exact board
	saveAsyncSnapshot(); // and the async mid-turn so a correspondence match resumes exactly too
}
export function finalizeReplay(winner, resultOverride) {
	if (replayMode || spectateMode || !Rec.isRecording()) return;
	maybeRecordFrame(); // capture the final board
	// resultOverride lets a conceder record a 'loss' before the eventual winner is known
	const result = resultOverride || (winner == null ? 'draw' : winner === GS.HUMAN ? 'win' : 'loss');
	// keep the promise so the post-game buttons can await the saved id (the overlay
	// is built synchronously in the same gameOver tick, before finish() resolves)
	lastReplayPromise = Rec.finish({ winner: winner == null ? null : winner, result }).then(id => { lastReplayId = id; return id; }).catch(() => null);
	stashRunFightReplay(result); // fire-and-forget: builds the run's "super replay" playlist as you go
}

// During a run, park every fight's SHAREABLE tape id on the run itself. It has to
// happen per fight, not at the end: the local replay store is a 10-deep ring buffer
// and a 12-win run is ~14 fights, so the opening fights would be evicted long before
// the run is cleared. Only the 8-char ids live on the run, so this costs it nothing.
// Best-effort throughout — a failed upload just leaves that fight out of the playlist.
async function stashRunFightReplay(result) {
	try {
		const io = activeRunIO();
		if (!io || replayMode || spectateMode || !MP_ON) return;
		const localId = await (lastReplayPromise || Promise.resolve(lastReplayId));
		if (!localId) return;
		const shareId = await Rec.uploadReplay(localId);
		if (!shareId) return;
		const run = io.load();
		if (!run || !run.active) return; // the run ended / was cleared while we uploaded
		const before = RunRep.playlistFights(run).length;
		run.fightReplays = RunRep.appendFightReplay(run.fightReplays, { id: shareId, result, label: RunRep.fightLabel(run, result) });
		if (run.fightReplays.length !== before) io.save(run);
	} catch (e) { /* a replay is a bonus — never let it disturb a run */ }
}

// A cleared run gets a SUPER REPLAY: every fight chained into one playlist with its
// own link. Call BEFORE the run is cleared — the ids live on the run object.
// Silently adds nothing when there is nothing to show (logged out, uploads failed).
export function addRunReplayButtons(el, run, mode) {
	if (!el || replayMode || spectateMode) return;
	if (!RunRep.canBuildPlaylist(run)) return; // one fight is just an ordinary replay
	const fights = RunRep.playlistFights(run);
	const meta = RunRep.playlistMeta(run, mode || runModeName());
	let idP = null; // one upload, shared by both buttons
	const playlistId = () => (idP = idP || Rec.putRunPlaylist(fights.map(f => f.id), meta));
	el.appendChild(overlayButton(`🎬 Watch the full run (${fights.length} fights)`, () => {
		const w = window.open('', '_blank'); // keep the click gesture
		playlistId().then(id => {
			if (id) { const url = 'index.html?rrun=' + encodeURIComponent(id); if (w) w.location = url; else location.href = url; }
			else { if (w) w.close(); banner('Could not build the full-run replay.'); }
		});
	}));
	el.appendChild(overlayButton('🔗 Copy full-run replay link', () => {
		playlistId().then(id => {
			if (id) copyText(location.origin + '/battlecards/index.html?rrun=' + encodeURIComponent(id), 'Copied the full-run replay link!');
			else banner('Could not build the full-run replay link.');
		});
	}));
}

// clipboard with a prompt fallback + a banner ack
async function copyText(text, okMsg) {
	try { await navigator.clipboard.writeText(text); banner(okMsg, 2200); }
	catch { prompt('Copy:', text); }
}
// "Watch replay" + "Copy replay link" for a finished game's overlay. The tape was
// just saved by finalizeReplay; Watch opens it locally, Copy link uploads it for a
// shareable ?rshare= URL (falls back to copying the paste-able code when logged out).
export function addReplayButtons(el) {
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
			copyText(location.origin + '/r/' + shareId, 'Replay link copied — anyone can watch it.');
		} else {
			const code = Rec.exportCode(id);
			if (code && code.length > 1_400_000) copyText(code, 'This replay is too large for a short link — copied the full replay code instead (import it via Replays → Import).');
			else if (code) copyText(code, 'Copied a replay CODE — share it via Replays → Import. (Log in for a short link.)');
			else banner('Could not prepare a share link.');
		}
	}));
}

// a run "super replay": { ids, meta, i } — the fights of one cleared run, chained
let runPlaylist = null;
// load fight #i of the playlist and show it from its first frame
async function playlistLoad(i, autoplay) {
	if (!runPlaylist || i < 0 || i >= runPlaylist.ids.length) return false;
	const tape = await Rec.fetchSharedReplay(runPlaylist.ids[i]);
	if (!tape || !Array.isArray(tape.frames) || !tape.frames.length) return false;
	runPlaylist.i = i;
	replayTape = tape;
	replayView = 0; replayPanelsFor = 0;
	renderReplayFrame(0);
	buildReplayBar();
	// the bar is built once, but each fight is a different length — retune the scrubber
	const scrub = $('rb-scrub');
	if (scrub) { scrub.max = String(replayTape.frames.length - 1); scrub.value = '0'; }
	updateReplayBar();
	updatePlaylistBar();
	if (autoplay) replayPlay();
	return true;
}

// Chapter bar for a run playlist: which fight of the run you're watching, with
// manual skip. Auto-advance happens in replayPlay's tail.
function buildPlaylistBar() {
	if (!runPlaylist || $('rp-bar')) return;
	const bar = document.createElement('div');
	bar.id = 'rp-bar';
	bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:60;display:flex;align-items:center;gap:10px;'
		+ 'padding:8px 14px;background:rgba(12,17,34,.92);border-bottom:1px solid #2a3350;color:#e8e0d0;'
		+ 'font:600 13px system-ui,sans-serif;backdrop-filter:blur(6px)';
	const m = runPlaylist.meta || {};
	const who = [m.hero, m.mode].filter(Boolean).join(' · ');
	bar.innerHTML = `<span style="color:#f8d84a;font-weight:800">🎬 FULL RUN</span>`
		+ `<span style="color:#b8aee0">${who ? who + ' — ' : ''}${(m.wins || 0)}W / ${(m.losses || 0)}L</span>`
		+ `<span id="rp-chapter" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>`
		+ `<button id="rp-prev" style="background:#2a2440;color:#e8e0d0;border:1px solid #6a5f8a;border-radius:7px;padding:4px 10px;cursor:pointer;font:inherit">◀ Prev</button>`
		+ `<button id="rp-next" style="background:#2a2440;color:#e8e0d0;border:1px solid #6a5f8a;border-radius:7px;padding:4px 10px;cursor:pointer;font:inherit">Next ▶</button>`;
	document.body.appendChild(bar);
	$('rp-prev').addEventListener('click', () => { replayPause(); playlistLoad(runPlaylist.i - 1, false); });
	$('rp-next').addEventListener('click', () => { replayPause(); playlistLoad(runPlaylist.i + 1, false); });
	updatePlaylistBar();
}
function updatePlaylistBar() {
	if (!runPlaylist || !$('rp-bar')) return;
	const n = runPlaylist.ids.length, i = runPlaylist.i;
	const label = (runPlaylist.meta && runPlaylist.meta.labels && runPlaylist.meta.labels[i]) || '';
	const chap = $('rp-chapter');
	if (chap) chap.textContent = `Fight ${i + 1} / ${n}${label ? ' — ' + label : ''}`;
	const prev = $('rp-prev'), next = $('rp-next');
	if (prev) prev.disabled = i <= 0;
	if (next) next.disabled = i >= n - 1;
}

export async function startReplay(cardsById) {
	replayCards = cardsById;
	if (rrunId) {
		runPlaylist = await Rec.fetchRunPlaylist(rrunId);
		if (runPlaylist) {
			runPlaylist.i = 0;
			injectReplayStyles();
			if (await playlistLoad(0, false)) { buildPlaylistBar(); return; }
		}
		const el = dungeonOverlay('RUN REPLAY NOT FOUND', 'That full-run replay has expired or the link is wrong.');
		el.appendChild(overlayButton('Back to replays', () => { location.href = 'replays.html'; }));
		return;
	}
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
	GS.telegraphs.length = 0; // a rendered frame consumes its telegraph beat (and scrubbing clears strays)
	replayTeleShown = false;
	const frames = replayTape.frames;
	replayIdx = Math.max(0, Math.min(frames.length - 1, i));
	const f = frames[replayIdx];
	GS.HUMAN = Math.min(replayView, ((f.snap.players && f.snap.players.length) || 1) - 1);
	GS.state = E.fromSnapshot(f.snap, replayCards);
	E.ensureUidsAbove(E.maxSnapshotUid(f.snap)); // process-global uid safety
	if (GS.state.players.length !== replayPanelsFor) {
		GS.playerCount = GS.state.players.length;
		frameCamera(); buildPanels(); buildSlotMarkers();
		replayPanelsFor = GS.state.players.length;
	}
	updateHud();
	updateReplayBar();
	syncReplayLog();
}
// A replay plays no events, so the 📜 Log drawer stayed EMPTY. Each frame carries its
// caption (the live log's line at that moment): the drawer shows them up to the frame
// on screen, ending with the result on the last one.
function syncReplayLog() {
	if (!replayTape) return;
	logHistory.length = 0; logLinks.length = 0;
	let prev = null;
	for (let k = 0; k <= replayIdx; k++) {
		const cap = replayTape.frames[k] && replayTape.frames[k].cap;
		if (cap && cap !== prev) { logHistory.push(cap); logLinks.push([]); }
		prev = cap;
	}
	if (GS.state && GS.state.over) { logHistory.push(watchResultLine()); logLinks.push([]); }
	if (logFull && logFull.classList.contains('open')) renderLogFull();
}
function replayGoto(i) { replayPause(); renderReplayFrame(i); }
function replayStep(d) { replayPause(); renderReplayFrame(replayIdx + d); }
function replayPause() { if (replayTimer) { clearInterval(replayTimer); replayTimer = null; } updateReplayBar(); }
let replayTeleShown = false;
function replayPlay() {
	if (replayTimer || !replayTape) return;
	if (replayIdx >= replayTape.frames.length - 1) renderReplayFrame(0); // restart from the top if at the end
	replayTimer = setInterval(() => {
		if (replayIdx >= replayTape.frames.length - 1) {
			// end of this fight — in a run playlist, roll straight into the next one
			if (runPlaylist && runPlaylist.i < runPlaylist.ids.length - 1) {
				replayPause();
				playlistLoad(runPlaylist.i + 1, true);
				return;
			}
			replayPause(); return;
		}
		// a frame that resolves attacks gets a telegraph beat first: hold on the
		// CURRENT board one tick and draw the red line(s) attacker → target, so
		// the watcher sees what's about to happen instead of decoding aftermath
		const nxt = replayTape.frames[replayIdx + 1];
		if (nxt.fx && nxt.fx.length && !replayTeleShown) {
			replayTeleShown = true;
			const until = performance.now() + Math.max(400, Math.round(900 / replaySpeed));
			for (const f of nxt.fx) {
				// a = attacking creature · h = hero swing · c(+p) = a targeted card
				// play / power / tap / walker ability (hero fallback if the card left)
				const from = f.a != null ? { uid: f.a } : f.h != null ? { hero: f.h } : { uid: f.c, hero: f.p };
				const to = f.t.type === 'hero' ? { hero: f.t.player } : { uid: f.t.uid };
				GS.telegraphs.push({ from, to, until, friendly: !!f.fr });
			}
			SFX.play('attack');
			wake();
			return;
		}
		replayTeleShown = false;
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
#replay-bar{position:fixed;left:0;right:0;bottom:0;z-index:9999;background:rgba(10,7,20,.92);border-top:1px solid #3a2f56;padding:8px 12px;color:#e8e2f4;backdrop-filter:blur(4px);transition:transform .25s ease}
#replay-bar.rb-min{transform:translateY(calc(100% - 26px))}
#replay-bar.rb-min #rb-cap{margin-bottom:0;cursor:pointer}
#replay-bar.rb-min #rb-cap:after{content:" ▴";color:#8a7db0}
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
	// the bar auto-tucks so it never covers your hand: only the caption strip
	// stays; hover (or tap) the strip to bring the controls back
	let rbHideT = null, rbScrubbing = false;
	const rbTuck = () => { if (!rbScrubbing) bar.classList.add('rb-min'); };
	const rbShow = () => { clearTimeout(rbHideT); bar.classList.remove('rb-min'); };
	bar.addEventListener('mouseenter', rbShow);
	bar.addEventListener('mouseleave', () => { clearTimeout(rbHideT); rbHideT = setTimeout(rbTuck, 500); });
	bar.addEventListener('pointerdown', () => {
		rbShow();
		// no hover (touch): tuck again after a few idle seconds
		if (matchMedia('(hover: none)').matches) rbHideT = setTimeout(rbTuck, 3500);
	});
	$('rb-scrub').addEventListener('pointerdown', () => { rbScrubbing = true; });
	addEventListener('pointerup', () => { rbScrubbing = false; });
	rbHideT = setTimeout(rbTuck, 2500); // an opening peek at the controls, then tuck
	// ← / → step the replay (Q / E too: padnav turns them into ← / →), so the
	// keyboard navigator leaves the real arrows to it here
	if (replayMode && window.__padnav) window.__padnav.own(['ArrowLeft', 'ArrowRight']);
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

