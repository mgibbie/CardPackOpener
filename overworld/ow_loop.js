// ow_loop.js — the frame loop (tick: update + draw every frame, with the input and cutscene watchdogs) and the touch HUD.
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import { VIEW_H, VIEW_W } from './engine.js';
import { arcade, battle, blockers, cutscene, dialog, evolution, factorySpec, hud, items, npcs, player, portals, pvp, screen, sctx, services, trainers, world } from './ow_core.js';
import { decoMenu, drawBaseDeco, drawDecoMenu, drawRadio, drawSocial, radioMenu, socialMenu } from './ow_features.js';
import { drawWatchingBadge, frontier, frontierWatchers } from './ow_frontier.js';
import { drawAwakening, drawLegendary } from './ow_legendaries.js';
import { bagMenu, bpShopMenu, canvasMenuOpen, drawBpShopMenu, ferryMenu, menuBlocking, pcMenu, portalMenu, shopMenu } from './ow_menukeys.js';
import { drawBagMenu, drawCardsMenu, drawDaycare, drawDexMenu, drawFerryMenu, drawFriendsMenu, drawHalfParty, drawMoveShop, drawNameRater, drawOptions, drawPartyMenu, drawPcMenu, drawPortalMenu, drawQuest, drawRunMenu, drawShopMenu, drawStartMenu, drawStarterMenu, drawTownMap, drawTrainerCard } from './ow_menus.js';
import { drawSlots, slotsMenu } from './ow_minigames.js';
import { drawFriendGhosts, drawMailMenu } from './ow_pvp.js';
import { cameraPos, drawCaveDark, drawDayNightTint, drawStepFx, drawWeather, editView } from './ow_render.js';
import { drawDeckSelect, drawNpcTrade, drawPlayerMenu, drawTrade, friendsMenu, mailMenu } from './ow_screens.js';
import { S } from './ow_state.js';
import { checkIntroTrigger } from './ow_story.js';
import { blendMenu, contestMenu, drawBlend, drawContest, drawSlide, drawUnownDex, slideMenu, unownDex } from './ow_venues.js';
import { safeSaveStr } from './safestore.js';
import * as Settings from './settings.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { INPUT_TRACE, heldKeys, owlog, tickStats } from './ow_input.js';
import {
	FADE_SPEED, MOVE_STARVE_LIMIT, REJECT_STARVE_LIMIT, SCALE, bgmTick, cardsMenu,
	catchUpPostBattleScripts, ctx, daycareMenu, deckSelect, dexMenu, drawFollower, drawFossilSpots,
	drawGcMenu, drawMuseum, drawVfMenu, drawWaterAnim, fade, findLanding, fitCanvas, follower,
	frame, gateReport, gcMenu, halfParty, lastRejectAt, moveShop, nameRater, openCanvasMenus,
	optionsMenu, partyMenu, persistBattle, playerMenu, questMenu, refundPostBattleTry,
	rejectedMoves, runMenu, startMenu, starterMenu, townMap, trade, tradeMenu, trainerCard,
	updateFollower, vfMenu,
} from './main.js';

// ---------- loop ----------
let last = performance.now();
let playAccum = 0;
export function tick(now) {
	requestAnimationFrame(tick);
	tickStats.frames++;
	const dt = Math.min((now - last) / 1000, 0.05);
	last = now;
	// advance the warp fade before any `loading` bail so it keeps animating in the
	// loading=false windows on either side of a map swap (it sits at full black
	// during the load itself, when the loop bails and the screen is frozen anyway)
	if (fade.alpha !== fade.target) {
		const d = FADE_SPEED * dt;
		fade.alpha = fade.alpha < fade.target ? Math.min(fade.target, fade.alpha + d) : Math.max(fade.target, fade.alpha - d);
	}
	// battle/pvp on a portrait screen OR any touch screen: swap the canvas
	// between the GBA frame and full-screen (see fitCanvas); the touch d-pad
	// hides too — battles are entirely tap-driven. Landscape phones get the
	// full-width canvas + the scaled bar from battleui.layout (aspect > 1.7).
	const tallNow = (battle.blocking || pvp.blocking)
		&& (innerHeight > innerWidth || document.body.classList.contains('touch'));
	if (tallNow !== S.sceneTall) {
		S.sceneTall = tallNow;
		document.body.classList.toggle('scene-tall', S.sceneTall);
		fitCanvas();
	}
	// WATCHDOG 1 — a stuck load freezes everything (the loop bails on `loading`).
	// If a map load hangs (never resolves) or a handler after it wedged, recover.
	if (S.loading) {
		if (S.loadWatchStart == null) S.loadWatchStart = now;
		else if (now - S.loadWatchStart > 12000) { S.loadWatchStart = null; S.loading = false; if (cutscene.blocking) cutscene.stop(); hud.textContent = 'Recovered from a stuck load.'; }
	} else S.loadWatchStart = null;
	if (S.loading || !world.current) return;
	if (S.postBattleCatchUpArmed && !S.loading && !cutscene.blocking && !dialog.blocking && !battle.blocking
		&& openCanvasMenus().length === 0) {
		S.postBattleCatchUpArmed = false;
		try { catchUpPostBattleScripts(); } catch (e) { console.warn('[plot] post-battle catch-up failed', e); if (cutscene.blocking) cutscene.stop(); }
	}

	// WATCHDOG 2 — a plot cutscene that blocks with NO player-facing UI (no dialog,
	// battle, evolution, or menu) for a long stretch is genuinely wedged, not just
	// waiting on the player — force-stop it rather than freeze the map.
	// A CANVAS MENU IS PLAYER-FACING UI TOO. This listed starterMenu and nothing
	// else, so opening the TOWN MAP (or the bag, or the party) mid-scene looked
	// like a wedged cutscene: 30 seconds later the watchdog stopped it. That is
	// how the Slowpoke Well beat died halfway through Kurt's walk — reported from
	// production, with the fly prompt still on screen. openCanvasMenus() is the
	// same list gateReport uses, so this cannot drift from what actually blocks.
	if (cutscene.blocking && !dialog.blocking && !battle.blocking && !pvp.blocking && !evolution.blocking
		&& !starterMenu.open && openCanvasMenus().length === 0) {
		// MEASURE STALLS, IN GAME TIME. This used to be 30s of WALL-CLOCK time since
		// the scene went quiet — but the scene itself runs on game time, which the
		// tick caps at 50ms a frame. On a slow device (a playtest browser measured
		// 3.7 fps) game time runs at ~0.19x real time, so the silent part of the
		// Slowpoke Well beat — ~6s of Kurt walking — took ~30 real seconds and was
		// killed every single run, mid-walk, with "A scene timed out."
		//
		// Now the clock only runs while the scene makes NO progress (its cursor,
		// its current step and its timers all unchanged), and it counts game time.
		// A slow scene is never a wedged one; a genuinely wedged scene still dies.
		const c = cutscene.cur, sub = c && c.sub;
		const sig = c ? (c.frames || []).map(f => f.i).join(',') + '|' + (sub ? [sub.kind, sub.k, sub.from, Math.round((sub.t || 0) * 20), Math.round((sub.left || 0) * 20)].join(':') : '') : '';
		if (sig !== S.cutsceneWatchSig) { S.cutsceneWatchSig = sig; S.cutsceneStall = 0; }
		else S.cutsceneStall += dt;
		if (S.cutsceneStall > 20) {
			S.cutsceneStall = 0; S.cutsceneWatchSig = '';
			refundPostBattleTry();   // a watchdog kill is not the beat's fault
			cutscene.stop(); hud.textContent = 'A scene timed out.';
		}
	} else { S.cutsceneStall = 0; S.cutsceneWatchSig = ''; }

	// WATCHDOG 4 — THE PLAYER IS STANDING SOMEWHERE THEY CANNOT STAND.
	//
	// Two softlocks reported the same afternoon, by different routes:
	//   * the S.S. Anne departure walked the player 9 tiles south onto open ocean
	//     and the scene ended there, surfing=false, every direction bumping;
	//   * the Slateport Harbor exit landed them on the harbor roof at (32,22),
	//     walled on three sides with water north.
	// Neither reproduces from the map data — the harbor's exit warp resolves to
	// the correct door in both region copies, and the departure runs to completion
	// here. So rather than guess at two causes I cannot see, catch the CLASS: a
	// scripted walk ignores collision by design, so any script, warp or ferry can
	// leave the player on a tile the rules forbid, and today that is unrecoverable
	// without Fly.
	//
	// Deliberately conservative. It only acts when the player is on an illegal
	// tile AND genuinely cannot move AND nothing else owns the screen, for two
	// full seconds — so it can never argue with surfing, a cutscene that is mid-
	// walk, or a menu. findLanding is the same nearest-standable-tile search Fly
	// uses, so the rescue lands somewhere the player could have walked to.
	{
		const stuckTile = !S.loading && !cutscene.blocking && !dialog.blocking && !battle.blocking
			&& !pvp.blocking && !evolution.blocking && openCanvasMenus().length === 0
			&& !player.moving && !player.surfing
			&& (!world.isPassable(player.tx, player.ty) || world.isSurfable(player.tx, player.ty));
		if (stuckTile) {
			const boxed = [[1, 0], [-1, 0], [0, 1], [0, -1]]
				.every(([dx, dy]) => !world.isPassable(player.tx + dx, player.ty + dy) || world.isSurfable(player.tx + dx, player.ty + dy));
			if (boxed) {
				if (S.strandedSince == null) S.strandedSince = now;
				else if (now - S.strandedSince > 2000) {
					S.strandedSince = null;
					const [lx, ly] = findLanding(player.tx, player.ty);
					if (lx !== player.tx || ly !== player.ty) {
						console.warn('[stranded] player was boxed in at', player.tx, player.ty, '-> moved to', lx, ly);
						player.setTile(lx, ly);
						hud.textContent = 'You found your footing.';
					}
				}
			} else S.strandedSince = null;
		} else S.strandedSince = null;
	}

	// accumulate playtime (whole seconds, throttled writes) for the Trainer Card
	playAccum += dt;
	if (playAccum >= 5) {
		const s = (parseInt(localStorage.getItem('magepunk_playtime'), 10) || 0) + Math.floor(playAccum);
		safeSaveStr('magepunk_playtime', s);
		playAccum -= Math.floor(playAccum);
	}

	battle.update(dt);
	bgmTick();
	persistBattle();
	pvp.update(dt);
	factorySpec.update(dt);
	evolution.update(dt);
	dialog.update(dt);
	cutscene.update(dt);
	// the moment combat ends, drop any key still held from before it — otherwise
	// the player takes one stray step straight out of the battle
	const inBattleNow = battle.blocking || pvp.blocking;
	if (S.wasInBattle && !inBattleNow) { heldKeys.length = 0; if (INPUT_TRACE) owlog('BATTLE END — held keys flushed', JSON.stringify(gateReport())); }
	if (!S.wasInBattle && inBattleNow && INPUT_TRACE) owlog('BATTLE START', JSON.stringify(gateReport()));
	S.wasInBattle = inBattleNow;
	if (INPUT_TRACE) { const b = gateReport().blockedBy; if (b !== S.lastBlockedBy) { owlog('gate changed:', S.lastBlockedBy, '->', b); S.lastBlockedBy = b; } }
	if (!battle.blocking && !pvp.blocking && !factorySpec.blocking && !dialog.blocking && !evolution.blocking && !starterMenu.open && !cutscene.blocking) {
		// The starter hand-over is the one trigger that MUST NOT be missed — without
		// it you have no POKeMON and no way to get one. Every other trigger fires on
		// map entry only, which is fine for them, but it means walking into the lab
		// while ANY cutscene is still playing skipped this one for good: the guard
		// returned early and nothing ever re-asked. Retry it here instead. It is
		// four boolean checks and becomes a permanent no-op the moment you have a
		// party, so it costs nothing for the rest of the game.
		if (!S.party) { try { checkIntroTrigger(); } catch (e) { console.warn('[intro] retry failed', e); } }
		tickStats.reachedMoveBlock++;
		trainers.update(dt);
		player.run = S.runHeld || Settings.get('autoRun');
		// any open menu freezes the player even if a key was held as it opened
		const heldDir = heldKeys[0] || null;
		const moveDir = (menuBlocking() || editView.on) ? null : heldDir;
		if (!trainers.engaging) { tickStats.playerUpdates++; player.update(dt, moveDir); }
		// WATCHDOG 3 — input starvation. Two ways the player can be stuck:
		//
		// (a) a held direction the tick refuses to DELIVER, with menuBlocking() saying
		//     there is nothing on screen to explain it. Walking into a wall does not
		//     count: that reaches player.update and reports `bump`.
		// (b) the direction IS delivered and player.update still never starts a step.
		//     tryMove reports every refusal (bump/blocked/cracked/hop/moved); the one
		//     silent path is `busy` — moving stuck true, so no new step can begin.
		//     Reported from the field: after a lab-exit warp, moveT wedged just above
		//     1 and no step ever started. (a) alone could never see that.
		// A step that never completes is the silent one: while `moving` is true,
		// update() only interpolates and tryMove is not called AT ALL, so nothing
		// reports a refusal. A real step lasts ~0.13s, so `moving` held true for
		// seconds is definitive — and it freezes the player whether or not a key
		// is down, so this arm does not depend on heldDir.
		if (player.moving) S.moveStuckT += dt; else S.moveStuckT = 0;
		const wedged = S.moveStuckT > MOVE_STARVE_LIMIT;
		const delivered = moveDir === heldDir && !trainers.engaging;
		// starvation and wedging each carry their OWN dwell — requiring both would
		// mean waiting 2x MOVE_STARVE_LIMIT for a wedge that is already proven
		if (heldDir && !delivered && !menuBlocking()) S.moveStarveT += dt; else S.moveStarveT = 0;
		if (wedged || S.moveStarveT > MOVE_STARVE_LIMIT) {
			{
				S.moveStarveT = 0; S.moveStuckT = 0;
				const why = wedged ? 'player.moving stuck true for ' + MOVE_STARVE_LIMIT + 's (moveT ' + (Math.round(player.moveT * 100) / 100) + ')'
					: trainers.engaging ? 'trainers.engaging' : editView.on ? 'editView.on' : 'unknown';
				console.warn('[input-watchdog] movement starved for ' + MOVE_STARVE_LIMIT + 's — blocker:', why, gateReport());
				if (wedged) {
					// land the half-finished step on its own destination tile and let go —
					// never teleport, never drop the player somewhere they did not walk to
					if (player.moveTo) { player.px = player.moveTo[0]; player.py = player.moveTo[1]; }
					player.moving = false; player.jumping = false; player.moveT = 0;
					player.moveOutcome = 'recovered';
					hud.textContent = 'Recovered from a stuck step.';
				} else if (trainers.engaging) {
					trainers.engagement = null;
					hud.textContent = 'Recovered from a stuck trainer approach.';
				} else if (editView.on) {
					// deliberate (owner tool) — don't fight it, just stop being a mystery
					hud.textContent = 'MAP EDITOR is open — movement is frozen. Remove ?mapedit=1 from the URL to play.';
				} else {
					hud.textContent = 'Recovered from a stuck input lock.';
				}
			}
		}
		// ...and the case heldKeys can never express: the door itself is turning the
		// input away. Armed by rejections rather than held keys, so it stays visible
		// when menuBlocking() is the thing at fault. A dialog legitimately refuses
		// arrows, hence the longer fuse and the report-only response for gates that
		// own real UI — this names the blocker rather than fighting it.
		if (rejectedMoves > 0 && performance.now() - lastRejectAt < 2000) {
			S.rejectStarveT += dt;
			if (S.rejectStarveT > REJECT_STARVE_LIMIT) {
				S.rejectStarveT = 0;
				const g = gateReport();
				console.warn('[input-watchdog] movement input refused at the door for ' + REJECT_STARVE_LIMIT + 's — blocker:', g.blockedBy, g);
				if (g.blockedBy === 'trainers.engaging') { trainers.engagement = null; hud.textContent = 'Recovered from a stuck trainer approach.'; }
				else hud.textContent = 'Movement is blocked by: ' + (g.blockedBy || 'something invisible') + '. Reloading recovers it.';
			}
		} else S.rejectStarveT = 0;
		npcs.update(dt);
		updateFollower(dt);
	}

	// battle/pvp/factory screens repaint every pixel of the canvas themselves —
	// rendering the whole overworld underneath them was pure discarded work
	// (two map blits + every NPC/item/portal + a full-canvas upscale, per frame)
	const overlayOwnsFrame = battle.blocking || pvp.blocking || factorySpec.blocking;
	if (!overlayOwnsFrame) {
		const [camX, camY] = cameraPos();
		ctx.clearRect(0, 0, VIEW_W, VIEW_H);
		world.drawLayer(ctx, 'bottom', camX, camY);
		if (!editView.on) drawWaterAnim(ctx, camX, camY); // the sea moves (editor stays exact)
		if (!editView.on) drawStepFx(ctx, camX, camY, 'print'); // footprints lie on the ground
		services.draw(ctx, camX, camY);
		arcade.draw(ctx, camX, camY);
		items.draw(ctx, camX, camY);
		drawBaseDeco(ctx, camX, camY);
		drawMuseum(ctx, camX, camY);
		drawFossilSpots(ctx, camX, camY);
		drawLegendary(ctx, camX, camY);
		drawAwakening(ctx, camX, camY);
		portals.draw(ctx, camX, camY); // ground pads render under blockers/entities
		blockers.draw(ctx, camX, camY);
		// sprites in y order so overlaps stack correctly. In the editor the player
		// and follower are never drawn — you're looking at the map itself.
		const sprites = editView.on
			? (editView.entities ? [...npcs.list, ...trainers.list] : [])
			: [...npcs.list, ...trainers.list, player];
		if (!editView.on && follower && !player.surfing) sprites.push({ py: follower.py, draw: drawFollower });
		sprites.sort((a, b) => a.py - b.py);
		for (const s of sprites) s.draw(ctx, camX, camY);
		if (!editView.on) drawStepFx(ctx, camX, camY, 'rustle'); // grass springs up around the feet (owns fx cleanup)
		if (!editView.on) drawFriendGhosts(ctx, camX, camY);
		world.drawLayer(ctx, 'top', camX, camY);
		drawCaveDark(ctx, camX, camY);
		drawDayNightTint(ctx);
		drawWeather(ctx); // rain/sand/hail/ash over the world, under the day-night mood
		evolution.draw(ctx);

		sctx.drawImage(frame, 0, 0, VIEW_W * SCALE, VIEW_H * SCALE);
	}
	// battle, menus, and dialogs all render at full canvas resolution
	const SW = screen.width, SH = screen.height;
	// The full-res menus lay themselves out for the 3:2 frame (unit = H/480
	// with columns spanning ~720 units). On the tall portrait canvas that unit
	// would blow past the right edge, so menus get a 3:2 band across the top of
	// the canvas instead — identical geometry to the pre-tall portrait canvas;
	// the live world stays visible beneath. Dialogs keep the full height (they
	// bottom-anchor near the thumbs and are width-capped — dialog.drawHi).
	const MH = Math.min(SH, Math.round(SW / 1.5));
	if (battle.blocking) {
		battle.draw(sctx, SW, SH);
	} else if (pvp.blocking) {
		pvp.draw(sctx, SW, SH);
	} else if (factorySpec.blocking) {
		factorySpec.draw(sctx, SW, SH);
	} else {
		// extend the menus' dim backdrop over the world below the band, and hide
		// the side MENU/PARTY/BAG buttons that would overlap the band's corner
		document.body.classList.toggle('ow-menu', canvasMenuOpen());
		if (canvasMenuOpen() && SH > MH) {
			sctx.fillStyle = 'rgba(10,8,18,0.82)';
			sctx.fillRect(0, MH, SW, SH - MH);
		}
		if (partyMenu.open) drawPartyMenu(SW, MH);
		else if (shopMenu.open) drawShopMenu(SW, MH);
		else if (bagMenu.open) drawBagMenu(SW, MH);
		else if (pcMenu.open) drawPcMenu(SW, MH);
		else if (vfMenu.open) drawVfMenu(SW, MH);
		else if (gcMenu.open) drawGcMenu(SW, MH);
		else if (contestMenu.open) drawContest(SW, MH);
		else if (blendMenu.open) drawBlend(SW, MH);
		else if (slideMenu.open) drawSlide(SW, MH);
		else if (decoMenu.open) drawDecoMenu(SW, MH);
		else if (socialMenu.open) drawSocial(SW, MH);
		else if (slotsMenu.open) drawSlots(SW, MH);
		else if (dexMenu.open) drawDexMenu(SW, MH);
		else if (townMap.open) drawTownMap(SW, MH);
		else if (tradeMenu.open) drawNpcTrade(SW, MH);
		else if (daycareMenu.open) drawDaycare(SW, MH);
		else if (nameRater.open) drawNameRater(SW, MH);
		else if (halfParty.open) drawHalfParty(SW, MH);
		else if (moveShop.open) drawMoveShop(SW, MH);
		else if (optionsMenu.open) drawOptions(SW, MH);
		else if (questMenu.open) drawQuest(SW, MH);
		else if (trainerCard.open) drawTrainerCard(SW, MH);
		else if (starterMenu.open) drawStarterMenu(SW, MH);
		else if (ferryMenu.open) drawFerryMenu(SW, MH);
		else if (portalMenu.open) drawPortalMenu(SW, MH);
		else if (bpShopMenu.open) drawBpShopMenu(SW, MH);
		else if (trade.open) drawTrade(SW, MH);
		else if (playerMenu.open) drawPlayerMenu(SW, MH);
		else if (deckSelect.open) drawDeckSelect(SW, MH);
		else if (radioMenu.open) drawRadio(SW, MH);
		else if (unownDex.open) drawUnownDex(SW, MH);
		else if (startMenu.open) drawStartMenu(SW, MH);
		else if (cardsMenu.open) drawCardsMenu(SW, MH);
		else if (runMenu.open) drawRunMenu(SW, MH);
		else if (friendsMenu.open) drawFriendsMenu(SW, MH);
		else if (mailMenu.open) drawMailMenu(SW, MH);
		if (!evolution.blocking) dialog.drawHi(sctx, SW, SH);
	}
	// while your run is being spectated, show a live "N watching" badge on top
	if (frontier.active && frontierWatchers > 0) drawWatchingBadge(SW, SH);
	drawTouchHud(SW, SH);
	// warp fade sits ON TOP of everything (world, menus, HUD) so the whole screen
	// dips to black between maps
	if (fade.alpha > 0.001) {
		sctx.save();
		sctx.globalAlpha = Math.min(1, fade.alpha);
		sctx.fillStyle = '#000';
		sctx.fillRect(0, 0, SW, SH);
		sctx.restore();
	}
}

// ---------- the touch HUD ----------
// `body.touch #bar { display: none }` hides #hud AND #objective, and EVERY thing
// the overworld tells a roaming player goes through hud.textContent: the map name
// on arrival, "party healed", "X was sent to the BOX", the egg-ready notice, the
// rift warning, stuck-load recovery. On a phone all of it was invisible — a
// caught POKeMON silently vanished into storage. The quest objective was hidden
// too, so the "where do I go next" system existed and could not be read.
//
// Rather than touch the ~15 call sites, a MutationObserver mirrors those two DOM
// nodes onto the canvas. Anything that writes the bar keeps working unchanged.
export const touchHud = { msg: '', until: 0, objective: '' };
if (document.body.classList.contains('touch')) {
	const hudEl = document.getElementById('hud'), objEl = document.getElementById('objective');
	const obs = new MutationObserver(() => {
		const t = (hudEl.textContent || '').trim();
		if (t && t !== touchHud.msg) { touchHud.msg = t; touchHud.until = performance.now() + 4200; }
		touchHud.objective = (objEl.textContent || '').trim();
	});
	for (const el of [hudEl, objEl]) obs.observe(el, { childList: true, characterData: true, subtree: true });
	touchHud.objective = (objEl.textContent || '').trim();
}
function drawTouchHud(SW, SH) {
	if (!document.body.classList.contains('touch')) return;
	if (menuBlocking()) return;                       // never over a menu or a battle
	const now = performance.now();
	const rows = [];
	if (touchHud.objective) rows.push(['#9d8fd4', touchHud.objective]);
	if (touchHud.msg && now < touchHud.until) rows.push(['#ffffff', touchHud.msg]);
	if (!rows.length) return;
	const pad = Math.round(SW * 0.02), fs = Math.max(11, Math.round(SW / 34));
	sctx.save();
	sctx.font = `${fs}px system-ui, sans-serif`;
	sctx.textBaseline = 'top';
	const w = Math.min(SW - pad * 2, Math.max(...rows.map(r => sctx.measureText(r[1]).width)) + pad * 2);
	const h = rows.length * (fs + 4) + pad;
	// Sit UNDER the world frame when the canvas is taller than it (landscape
	// tablets), where the desktop bar would be. On a portrait phone the frame
	// fills the canvas, so it overlays the top-left instead — left-anchored and
	// width-capped so it never reaches the MENU/PARTY/BAG buttons on the right.
	const below = VIEW_H * SCALE + pad;
	const y = (below + h + pad <= SH) ? below : pad;
	sctx.fillStyle = 'rgba(10,8,18,0.78)';
	sctx.fillRect(pad, y, w, h);
	sctx.strokeStyle = 'rgba(157,143,212,0.5)';
	sctx.strokeRect(pad + 0.5, y + 0.5, w, h);
	rows.forEach((r, i) => {
		sctx.fillStyle = r[0];
		sctx.fillText(r[1], pad * 2, y + i * (fs + 4) + 4, w - pad * 2);
	});
	sctx.restore();
}
