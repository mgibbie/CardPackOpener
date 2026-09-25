// ow_menus.js — full-resolution canvas menus: party, bag, PC, dex, shops, options, town map...
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
// The menus' STATE objects and key handlers still live in main.js; this is the drawing + tap layer.
import { badgeGhost, badgeSprite } from './badgeart.js';
import * as Badges from './badges.js';
import * as Bag from './bag.js';
import * as BUI from './battleui.js';
import * as Clock from './clock.js';
import { CATS } from './contest.js';
import * as Daycare from './daycare.js';
import { getImage } from './engine.js';
import * as Story from './events.js';
import * as Fly from './flydata.js';
import * as Frontier from './frontier.js';
import { drawCategoryIcon, itemIconFile } from './itemicon.js';
import { Journal } from './journal.js';
import { battle, sctx, world } from './ow_core.js';
import { S } from './ow_state.js';
import { saveParty } from './party.js';
import * as Dex from './pokedex.js';
import { PORTAL_TOWNS } from './portals.js';
import * as Quest from './quest.js';
import * as Settings from './settings.js';
import { sfx, syncBgmVolume } from './sound.js';
import { shopStockNow } from './ow_pvp.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { restoreBackup, runSaveAction } from './ow_saves.js';
import { BAG_POCKETS, FERRY_DESTS, PC_BOXES, PC_BOX_CAP, bagEntries, bagMenu, bpShopMenu, ferryMenu, getBox, pcMatches, pcMenu, portalMenu, pressKey, sellList, sellPrice, shinyOwnedCount, shopMenu } from './ow_menukeys.js';
import { blendKey, blendMenu, contestKey, contestMenu } from './ow_venues.js';
import { NEW_GAME_INTRO } from './ow_story.js';
import { ROAMERS, decoKey, decoMenu, roamState, socialKey, socialMenu, tidStr } from './ow_features.js';
import { DEX_GRID_COLS, cardsItems, dexFilterLabel, dexList, friendsChallenge, friendsMenu, mailMenu, runModeItems, startItems } from './ow_screens.js';
import {
	KEY_ACTIONS, OPTION_ACTIONS, OPTION_KEYS, STARTERS, THINGS_TO_DO, cardsMenu, daycareMenu,
	daycareOptions, deckSelect, dexMenu, gcMenu, halfParty, halfPartyNeed, hasFlyPoint, keyBinds,
	legendStats, levelCapNow, moveShop, nameRater, optionsKey, optionsMenu, partyMenu, playerMenu,
	playerRegion, postgameLog, postgameObjective, questMenu, runMenu, startMenu, starterMenu,
	todoRows, townMap, trade, tradeMenu, trainerCard, vfMenu,
} from './main.js';

// ---------- full-resolution menus (battleui components + pixel font) ----------
S.menuUi = [];   // tappable rects rebuilt each draw: {id, x, y, w, h}
S.menuHover = null;
const iconCache = new Map();
function iconOf(mon) {
	if (!mon.sprite) return null;
	if (!iconCache.has(mon.sprite)) {
		iconCache.set(mon.sprite, null);
		getImage(`data/pokemon/${mon.sprite}`).then(img => iconCache.set(mon.sprite, img)).catch(() => {});
	}
	return iconCache.get(mon.sprite);
}

// lazily-loaded town-map region art (keyed by file path)
const townImgCache = new Map();
function townImg(file) {
	if (!file) return null;
	if (!townImgCache.has(file)) {
		townImgCache.set(file, null);
		getImage(`data/${file}`).then(img => townImgCache.set(file, img)).catch(() => {});
	}
	return townImgCache.get(file);
}

export function menuChrome(W, H, u, title, sub, closable = true) {
	S.menuUi = [];
	sctx.fillStyle = 'rgba(10,8,18,0.82)';
	sctx.fillRect(0, 0, W, H);
	sctx.fillStyle = BUI.C.text;
	sctx.font = `${Math.round(24 * u)}px m6x11plus, monospace`;
	sctx.fillText(title, 24 * u, 40 * u);
	if (sub) {
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
		sctx.fillText(sub, 24 * u, 60 * u);
	}
	if (!closable) return;
	const close = { id: 'close', x: W - 106 * u, y: 16 * u, w: 90 * u, h: 36 * u, label: 'CLOSE', center: true };
	S.menuUi.push(close);
	BUI.button(sctx, close, S.menuHover === 'close', u);
}

// a tappable mon row: sprite icon, name, level, status, HP bar + numbers
export function monRow(id, x, y, w, h, mon, selected, u, note) {
	const b = { id, x, y, w, h };
	S.menuUi.push(b);
	sctx.fillStyle = selected || S.menuHover === id ? BUI.C.btnHover : BUI.C.btn;
	BUI.rr(sctx, x, y, w, h, 8 * u); sctx.fill();
	sctx.strokeStyle = selected ? BUI.C.accent : BUI.C.panelBorder;
	sctx.lineWidth = selected ? 3 : 2;
	BUI.rr(sctx, x + 1, y + 1, w - 2, h - 2, 8 * u); sctx.stroke();
	const img = iconOf(mon);
	if (img) {
		sctx.imageSmoothingEnabled = false;
		const s = (h - 8 * u) / img.height;
		sctx.drawImage(img, x + 8 * u, y + 4 * u, img.width * s, img.height * s);
	}
	sctx.fillStyle = mon.curHP > 0 ? BUI.C.text : BUI.C.faint;
	sctx.font = `${Math.round(17 * u)}px m6x11plus, monospace`;
	sctx.fillText(mon.name, x + h + 6 * u, y + 22 * u);
	if (mon.shiny) { // gold star on the party row
		sctx.fillStyle = '#e8b84a';
		sctx.fillText('★', x + h + 8 * u + sctx.measureText(mon.name).width, y + 22 * u);
		sctx.fillStyle = mon.curHP > 0 ? BUI.C.text : BUI.C.faint;
	}
	sctx.fillStyle = BUI.C.dim;
	sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
	sctx.fillText(`Lv${mon.level}`, x + h + 6 * u, y + h - 10 * u);
	if (mon.status) {
		BUI.badge(sctx, x + h + 52 * u, y + h - 24 * u, 34 * u, 16 * u,
			BUI.STATUS_BADGE[mon.status] || '#999', mon.status.toUpperCase(),
			`${Math.round(11 * u)}px m6x11plus, monospace`);
	}
	const barW = w * 0.34;
	const frac = Math.max(0, mon.curHP / mon.maxHP);
	BUI.bar(sctx, x + w - barW - 84 * u, y + h / 2 - 5 * u, barW, 10 * u, frac, BUI.hpColor(frac), 4 * u);
	sctx.fillStyle = BUI.C.text;
	sctx.textAlign = 'right';
	sctx.fillText(`${mon.curHP}/${mon.maxHP}`, x + w - 12 * u, y + h / 2 + 5 * u);
	sctx.textAlign = 'left';
	if (note) {
		sctx.fillStyle = BUI.C.accent;
		sctx.textAlign = 'right';
		sctx.font = `${Math.round(11 * u)}px m6x11plus, monospace`;
		sctx.fillText(note, x + w - 12 * u, y + 16 * u);
		sctx.textAlign = 'left';
	}
}

export function drawPartyMenu(W, H) {
	const u = H / 480;
	if (partyMenu.summary) { drawSummary(W, H, u); return; }
	const act = partyMenu.action;
	menuChrome(W, H, u, 'PARTY', partyMenu.swapFrom != null
		? `Swapping ${S.party[partyMenu.swapFrom]?.name || ''} — pick the slot to swap it with (X cancels).`
		: act ? `Choose an action for ${act.mon.name}.` : 'Choose a POKEMON, then an action (field moves it knows, SUMMARY, SWITCH).');
	S.party.forEach((m, i) => {
		const note = (i === 0 ? 'LEAD ' : '') + (m.heldItem ? Bag.ITEMS[m.heldItem]?.name || m.heldItem : '');
		monRow('party:' + i, 24 * u, (76 + i * 62) * u, W - 48 * u - (m.heldItem && !act ? 74 * u : 0), 56 * u, m,
			(act ? act.monIdx : partyMenu.idx) === i, u, note.trim());
		if (m.heldItem && !act) {
			const b = { id: 'take:' + i, x: W - 24 * u - 68 * u, y: (76 + i * 62) * u, w: 68 * u, h: 56 * u,
				label: 'TAKE', center: true };
			S.menuUi.push(b);
			BUI.button(sctx, b, S.menuHover === b.id, u);
		}
	});
	if (act) {
		const bw = 168 * u, bh = 40 * u, gap = 8 * u, x = W - bw - 28 * u;
		let y = (76 + act.monIdx * 62) * u;
		const total = act.options.length * (bh + gap);
		if (y + total > H - 12 * u) y = Math.max(70 * u, H - 12 * u - total);
		act.options.forEach((opt, i) => {
			const b = { id: 'pact:' + i, x, y: y + i * (bh + gap), w: bw, h: bh, label: opt.label, center: true };
			S.menuUi.push(b);
			BUI.button(sctx, b, act.idx === i || S.menuHover === b.id, u);
		});
	}
}

const STAT_LABEL = { hp: 'HP', atk: 'ATTACK', def: 'DEFENSE', spa: 'SP. ATK', spd: 'SP. DEF', spe: 'SPEED' };

// full-page summary for one party member: portrait, stats, moves
function drawSummary(W, H, u) {
	const m = S.party[partyMenu.idx];
	if (!m) { partyMenu.summary = false; return; }
	menuChrome(W, H, u, m.name, `Lv${m.level}   ${m.gender === 'M' ? '♂' : m.gender === 'F' ? '♀' : ''}   #${String(Math.abs(m.num || 0)).padStart(3, '0')}`);
	// portrait + types on the left
	const img = iconOf(m);
	if (img) {
		sctx.imageSmoothingEnabled = false;
		const s = Math.min(160 * u / img.width, 160 * u / img.height);
		sctx.drawImage(img, 40 * u, 90 * u, img.width * s, img.height * s);
	}
	sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
	m.types.forEach((t, i) => {
		const bw = 74 * u;
		BUI.badge(sctx, 40 * u + i * (bw + 8 * u), 258 * u, bw, 22 * u,
			BUI.TYPE_COLORS[t] || '#888', t.toUpperCase(), `${Math.round(12 * u)}px m6x11plus, monospace`);
	});
	sctx.fillStyle = BUI.C.dim;
	sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
	sctx.fillText(`ABILITY: ${(m.ability || '—').toUpperCase()}`, 40 * u, 302 * u);
	sctx.fillText(`ITEM: ${m.heldItem ? (Bag.ITEMS[m.heldItem]?.name || m.heldItem) : '—'}`, 40 * u, 322 * u);
	sctx.fillText(`NATURE: ${(m.nature || '—').toUpperCase()}   FRIEND: ${m.friend ?? 70}`, 40 * u, 342 * u);
	// contest life: the ribbon case + condition, once either exists
	if (m.ribbons?.length) {
		sctx.fillStyle = '#ffd27a';
		sctx.fillText(`RIBBONS (${m.ribbons.length}): ${m.ribbons.slice(0, 3).join(', ').toUpperCase()}${m.ribbons.length > 3 ? '…' : ''}`, 40 * u, 382 * u);
		sctx.fillStyle = BUI.C.dim;
	}
	if (m.contest && (m.contest.sheen || CATS.some(c => m.contest[c]))) {
		sctx.fillText(`CONTEST: CO ${m.contest.cool} BE ${m.contest.beauty} CU ${m.contest.cute} SM ${m.contest.smart} TO ${m.contest.tough}  SHEEN ${m.contest.sheen}`,
			40 * u, m.ribbons?.length ? 402 * u : 382 * u);
	}
	// the stat judge: IV potential in words (shiny star rides the name line)
	{
		const ivs = m.ivs || {};
		const keys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
		const tot = keys.reduce((s, k) => s + (ivs[k] || 0), 0);
		const best = keys.reduce((a, k) => (ivs[k] || 0) > (ivs[a] || 0) ? k : a, 'hp');
		const overall = tot >= 151 ? 'OUTSTANDING' : tot >= 121 ? 'SUPERIOR' : tot >= 91 ? 'ABOVE AVERAGE' : 'DECENT';
		const bv = ivs[best] || 0;
		const bestWord = bv >= 31 ? "CAN'T BE BEAT" : bv >= 26 ? 'FANTASTIC' : bv >= 16 ? 'PRETTY GOOD' : 'SO-SO';
		sctx.fillText(`JUDGE: ${overall} — best ${STAT_LABEL[best]} (${bestWord})`, 40 * u, 362 * u);
	}
	// stat bars on the right
	const sx = W * 0.42, sw = W * 0.5;
	sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
	['hp', 'atk', 'def', 'spa', 'spd', 'spe'].forEach((st, i) => {
		const y = (96 + i * 34) * u;
		sctx.fillStyle = BUI.C.dim;
		sctx.fillText(STAT_LABEL[st], sx, y);
		const v = st === 'hp' ? m.maxHP : m.stats[st];
		sctx.fillStyle = BUI.C.text;
		sctx.textAlign = 'right';
		sctx.fillText(String(v), sx + 96 * u, y);
		sctx.textAlign = 'left';
		// raw IV / EV. The screen showed a verbal "judge" and nothing else, and EVs
		// — which the game does award — appeared literally nowhere.
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(10 * u)}px m6x11plus, monospace`;
		sctx.fillText(`IV ${m.ivs?.[st] ?? '?'}  EV ${m.evs?.[st] ?? 0}`, sx + 104 * u, y - 12 * u);
		sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
		const frac = Math.max(0.05, Math.min(1, v / 200));
		BUI.bar(sctx, sx + 108 * u, y - 11 * u, sw - 108 * u, 12 * u, frac, BUI.C.accent, 4 * u);
	});
	// moves along the bottom — tappable: tap one slot, then another, to reorder.
	// This is the out-of-battle home of the same swap battle's S/SWAP button does
	// (the battle flow was the ONLY way to reorder, which touch players out of
	// battle couldn't reach at all).
	const my = 320 * u;
	sctx.fillStyle = BUI.C.dim;
	sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
	sctx.fillText('MOVES', sx, my - 8 * u);
	if (m.moves.length > 1) {
		sctx.fillText(partyMenu.moveSwap != null ? '— tap the other slot (same slot cancels)' : '— tap a move to swap its slot',
			sx + 58 * u, my - 8 * u);
	}
	m.moves.forEach((mv, i) => {
		const info = battle.data.moves[mv.id] || {};
		const bw = (sw) / 2 - 8 * u;
		const bx = sx + (i % 2) * (bw + 12 * u);
		const yy = my + Math.floor(i / 2) * 34 * u;
		sctx.fillStyle = BUI.C.btn;
		BUI.rr(sctx, bx, yy, bw, 28 * u, 6 * u); sctx.fill();
		const tc = BUI.TYPE_COLORS[info.type] || '#888';
		sctx.fillStyle = tc;
		sctx.fillRect(bx, yy, 4 * u, 28 * u);
		sctx.fillStyle = BUI.C.text;
		sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
		sctx.fillText((partyMenu.moveSwap === i ? '⇄ ' : '') + mv.name, bx + 12 * u, yy + 13 * u);
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(11 * u)}px m6x11plus, monospace`;
		const pw = info.power ? `${info.power}` : '—';
		const ac = (info.acc == null || info.acc === true) ? '—' : `${info.acc}`;
		sctx.fillText(`${(info.type || '').toUpperCase()}  PW ${pw}  AC ${ac}  PP ${mv.pp}/${mv.maxPp}`, bx + 12 * u, yy + 25 * u);
		const zid = 'summary-move:' + i;
		if (partyMenu.moveSwap === i || S.menuHover === zid) {
			sctx.strokeStyle = partyMenu.moveSwap === i ? '#ffd27a' : BUI.C.accent;
			sctx.lineWidth = 2;
			BUI.rr(sctx, bx + 1, yy + 1, bw - 2, 28 * u - 2, 6 * u); sctx.stroke();
		}
		// hit zone slightly taller than the drawn row for thumb forgiveness
		S.menuUi.push({ id: zid, x: bx, y: yy - 2 * u, w: bw, h: 32 * u });
	});
	// nav hint / lead button
	const lead = { id: 'summary-lead', x: 40 * u, y: H - 52 * u, w: 200 * u, h: 40 * u,
		label: partyMenu.idx === 0 ? 'IS LEAD' : 'MAKE LEAD', center: true };
	S.menuUi.push(lead);
	BUI.button(sctx, lead, S.menuHover === lead.id, u);
}

// LIVING DEX — the completion wall: the whole (filtered) roster as an icon grid,
// owned bright, seen dim, missing a silhouette. A visual sibling of the list.
function drawDexGrid(W, H, u, list) {
	const c = Dex.counts();
	const filtered = !!(dexMenu.typeI || dexMenu.regionI || dexMenu.caughtI);
	menuChrome(W, H, u, 'LIVING DEX', filtered
		? `${dexFilterLabel()} · ${list.length} shown   —   G list, T/R/F filter`
		: `${c.caught} owned · ${c.seen} seen   —   G list, T/R/F filter, Z details`);
	if (!list.length) {
		sctx.fillStyle = BUI.C.faint;
		sctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
		sctx.fillText('No POKeMON match this filter.', 40 * u, 140 * u);
		return;
	}
	const cols = DEX_GRID_COLS;
	const marginX = 24 * u, top = 74 * u;
	const cell = Math.floor((W - marginX * 2) / cols);
	const visRows = Math.max(1, Math.floor((H - top - 16 * u) / cell));
	const totalRows = Math.ceil(list.length / cols);
	const curRow = Math.floor(dexMenu.idx / cols);
	const startRow = Math.max(0, Math.min(curRow - Math.floor(visRows / 2), totalRows - visRows));
	const startI = Math.max(0, startRow * cols);
	for (let i = startI; i < Math.min(list.length, startI + visRows * cols); i++) {
		const e = list[i];
		const gx = marginX + (i % cols) * cell, gy = top + (Math.floor(i / cols) - startRow) * cell;
		const seen = Dex.isSeen(e.id), caught = Dex.isCaught(e.id);
		const sel = dexMenu.idx === i, bid = 'dex:' + i;
		S.menuUi.push({ id: bid, x: gx, y: gy, w: cell, h: cell }); // tap → menuTap sets idx + opens detail
		sctx.fillStyle = sel || S.menuHover === bid ? BUI.C.btnHover : 'rgba(255,255,255,0.04)';
		BUI.rr(sctx, gx + 1 * u, gy + 1 * u, cell - 2 * u, cell - 2 * u, 4 * u); sctx.fill();
		if (sel) { sctx.strokeStyle = BUI.C.accent; sctx.lineWidth = 2; BUI.rr(sctx, gx + 1 * u, gy + 1 * u, cell - 2 * u, cell - 2 * u, 4 * u); sctx.stroke(); }
		if (seen) {
			const img = iconOf({ sprite: battle.data.species[e.id]?.sprite });
			if (img) {
				sctx.imageSmoothingEnabled = false;
				sctx.globalAlpha = caught ? 1 : 0.4; // seen-not-owned dims
				const s = Math.min((cell - 6 * u) / img.width, (cell - 6 * u) / img.height);
				sctx.drawImage(img, gx + (cell - img.width * s) / 2, gy + (cell - img.height * s) / 2, img.width * s, img.height * s);
				sctx.globalAlpha = 1;
			}
			if (caught) { sctx.fillStyle = BUI.C.accent; sctx.beginPath(); sctx.arc(gx + cell - 8 * u, gy + 8 * u, 3 * u, 0, Math.PI * 2); sctx.fill(); }
		} else {
			sctx.fillStyle = 'rgba(255,255,255,0.16)';
			sctx.font = `${Math.round(cell * 0.42)}px m6x11plus, monospace`;
			sctx.textAlign = 'center';
			sctx.fillText('?', gx + cell / 2, gy + cell * 0.66);
			sctx.textAlign = 'left';
		}
	}
}
export function drawDexMenu(W, H) {
	const u = H / 480;
	const list = dexList();
	const c = Dex.counts();
	if (dexMenu.detail) { drawDexDetail(W, H, u, list[dexMenu.idx]); return; }
	if (dexMenu.grid) { drawDexGrid(W, H, u, list); return; }
	const filtered = !!(dexMenu.typeI || dexMenu.regionI || dexMenu.caughtI);
	menuChrome(W, H, u, 'POKeDEX', filtered
		? `${dexFilterLabel()} · ${list.length} shown   —   T/R/F filter, G grid`
		: `Seen ${c.seen}   Caught ${c.caught}   —   T/R/F filter, G grid, Z details`);
	if (!list.length) {
		sctx.fillStyle = BUI.C.faint;
		sctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
		sctx.fillText('No POKeMON match this filter.', 40 * u, 140 * u);
		return;
	}
	const rows = 9;
	const start = Math.max(0, Math.min(dexMenu.idx - 4, list.length - rows));
	list.slice(start, start + rows).forEach((e, i) => {
		const idx = start + i;
		const seen = Dex.isSeen(e.id), caught = Dex.isCaught(e.id);
		const bid = 'dex:' + idx;
		const b = { id: bid, x: 24 * u, y: (76 + i * 40) * u, w: W - 48 * u, h: 34 * u };
		S.menuUi.push(b);
		sctx.fillStyle = dexMenu.idx === idx || S.menuHover === bid ? BUI.C.btnHover : BUI.C.btn;
		BUI.rr(sctx, b.x, b.y, b.w, b.h, 6 * u); sctx.fill();
		sctx.strokeStyle = dexMenu.idx === idx ? BUI.C.accent : BUI.C.panelBorder;
		sctx.lineWidth = dexMenu.idx === idx ? 3 : 1;
		BUI.rr(sctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, 6 * u); sctx.stroke();
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
		sctx.fillText(`#${String(Math.abs(e.num)).padStart(3, '0')}`, b.x + 12 * u, b.y + 22 * u);
		sctx.fillStyle = seen ? BUI.C.text : BUI.C.faint;
		sctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
		sctx.fillText(seen ? e.name.toUpperCase() : '----------', b.x + 70 * u, b.y + 22 * u);
		if (caught) {
			sctx.fillStyle = BUI.C.accent;
			sctx.textAlign = 'right';
			sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
			sctx.fillText('● OWNED', b.x + b.w - 14 * u, b.y + 22 * u);
			sctx.textAlign = 'left';
		}
	});
}

function drawDexDetail(W, H, u, e) {
	if (!e) { dexMenu.detail = false; return; }
	const sp = battle.data.species[e.id];
	const caught = Dex.isCaught(e.id);
	menuChrome(W, H, u, sp.name.toUpperCase(), `#${String(Math.abs(e.num)).padStart(3, '0')}   ${caught ? 'OWNED' : 'SEEN'}`);
	const img = iconOf({ sprite: sp.sprite });
	if (img) {
		sctx.imageSmoothingEnabled = false;
		const s = Math.min(180 * u / img.width, 180 * u / img.height);
		sctx.drawImage(img, 50 * u, 100 * u, img.width * s, img.height * s);
	}
	sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
	(sp.types || []).forEach((t, i) => {
		const bw = 76 * u;
		BUI.badge(sctx, 50 * u + i * (bw + 8 * u), 290 * u, bw, 22 * u,
			BUI.TYPE_COLORS[t] || '#888', t.toUpperCase(), `${Math.round(12 * u)}px m6x11plus, monospace`);
	});
	const sx = W * 0.5, sw = W * 0.42;
	sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
	['hp', 'atk', 'def', 'spa', 'spd', 'spe'].forEach((st, i) => {
		const y = (110 + i * 36) * u;
		sctx.fillStyle = BUI.C.dim;
		sctx.fillText(STAT_LABEL[st], sx, y);
		const v = sp.baseStats[st] || 0;
		sctx.fillStyle = BUI.C.text;
		sctx.textAlign = 'right';
		sctx.fillText(String(v), sx + 96 * u, y);
		sctx.textAlign = 'left';
		BUI.bar(sctx, sx + 108 * u, y - 11 * u, sw - 40 * u, 12 * u, Math.min(1, v / 200), BUI.C.accent, 4 * u);
	});
	sctx.fillStyle = BUI.C.dim;
	sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
	sctx.fillText('Z: hear its cry   ▲▼: browse   X: back', 40 * u, H - 16 * u);
}

// simple playtime accumulator (seconds), persisted; region stored on starter pick
function playtimeStr() {
	const s = parseInt(localStorage.getItem('magepunk_playtime'), 10) || 0;
	const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
	return `${h}:${String(m).padStart(2, '0')}`;
}
export function drawTownMap(W, H) {
	const u = H / 480;
	const region = Fly.REGION_ORDER[townMap.region];
	const towns = Fly.FLY[region];
	const sel = towns[townMap.idx];
	menuChrome(W, H, u, 'TOWN MAP', 'Arrows: ◄► region  ▲▼ town   Z: fly   X: close');
	// region tabs
	Fly.REGION_ORDER.forEach((r, i) => {
		const bid = 'townreg:' + i;
		const b = { id: bid, x: (24 + i * 150) * u, y: 62 * u, w: 142 * u, h: 30 * u,
			label: Fly.REGION_LABEL[r], center: true };
		S.menuUi.push(b);
		BUI.button(sctx, b, S.menuHover === bid || townMap.region === i, u);
	});
	// map panel: dots at normalized grid positions
	const grid = Fly.GRID[region];
	const px = 40 * u, py = 108 * u, pw = W - 320 * u, ph = H - 168 * u;
	sctx.fillStyle = 'rgba(24,40,60,0.9)';
	BUI.rr(sctx, px, py, pw, ph, 10 * u); sctx.fill();
	sctx.strokeStyle = BUI.C.panelBorder; sctx.lineWidth = 2;
	BUI.rr(sctx, px + 1, py + 1, pw - 2, ph - 2, 10 * u); sctx.stroke();
	const pad = 22 * u;
	// draw the region art (Kanto/Johto) letterboxed inside the panel; dots then
	// sit on the image's baked city markers. Hoenn has no art -> grid dot map.
	const meta = Fly.IMG[region];
	const art = meta && townImg(meta.file);
	let imgRect = null;
	if (art) {
		const scale = Math.min((pw - pad) / meta.w, (ph - pad) / meta.h);
		const dw = meta.w * scale, dh = meta.h * scale;
		const ix = px + (pw - dw) / 2, iy = py + (ph - dh) / 2;
		sctx.imageSmoothingEnabled = false;
		sctx.drawImage(art, ix, iy, dw, dh);
		imgRect = { ix, iy, dw, dh };
	}
	const dotAt = t => {
		if (imgRect) {
			const mp = Fly.markerPx(region, t.map);
			if (mp) return [imgRect.ix + (mp[0] / meta.w) * imgRect.dw, imgRect.iy + (mp[1] / meta.h) * imgRect.dh];
		}
		const g = Fly.POS[t.map] || [grid.w / 2, grid.h / 2];
		return [px + pad + (g[0] + 0.5) / grid.w * (pw - pad * 2),
			py + pad + (g[1] + 0.5) / grid.h * (ph - pad * 2)];
	};
	towns.forEach((t, i) => {
		const [dx, dy] = dotAt(t);
		const visited = hasFlyPoint(t.map);
		const isSel = townMap.idx === i;
		const bid = 'town:' + i;
		S.menuUi.push({ id: bid, x: dx - 12 * u, y: dy - 12 * u, w: 24 * u, h: 24 * u });
		if (isSel) {
			sctx.strokeStyle = BUI.C.accent; sctx.lineWidth = 2;
			sctx.beginPath(); sctx.arc(dx, dy, 9 * u, 0, Math.PI * 2); sctx.stroke();
		}
		sctx.fillStyle = visited ? (isSel ? BUI.C.accent : '#e0554d') : 'rgba(217,230,242,0.35)';
		sctx.beginPath(); sctx.arc(dx, dy, 4.5 * u, 0, Math.PI * 2); sctx.fill();
	});
	// selected town name + fly status on the right rail
	const rx = W - 258 * u, ry = 108 * u;
	sctx.fillStyle = 'rgba(24,40,60,0.9)';
	BUI.rr(sctx, rx, ry, 234 * u, ph, 10 * u); sctx.fill();
	sctx.strokeStyle = BUI.C.panelBorder; sctx.lineWidth = 2;
	BUI.rr(sctx, rx + 1, ry + 1, 232 * u, ph - 2, 10 * u); sctx.stroke();
	const visited = hasFlyPoint(sel.map);
	sctx.fillStyle = BUI.C.text;
	sctx.font = `${Math.round(18 * u)}px m6x11plus, monospace`;
	sctx.fillText(sel.name, rx + 18 * u, ry + 36 * u);
	sctx.fillStyle = visited ? BUI.C.accent : BUI.C.dim;
	sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
	sctx.fillText(visited ? 'Visited — Z to fly' : 'Not yet visited', rx + 18 * u, ry + 62 * u);
	// cross-region progress: the shared world tier, this region's gyms, and whether it still
	// owes the current tier's gym; plus a GYM tag if the selected town is a gym town.
	const rkey = { kanto: 'KANTO', johto: 'JOHTO', hoenn: 'HOENN' }[region];
	let ty = ry + 100 * u;
	sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
	sctx.fillStyle = BUI.C.dim;
	sctx.fillText(`WORLD GYM TIER ${Quest.globalTier()}/8`, rx + 18 * u, ty); ty += 22 * u;
	if (rkey) {
		const owes = Quest.laggingRegions().includes(rkey);
		sctx.fillStyle = BUI.C.text;
		sctx.fillText(`${Fly.REGION_LABEL[region]}: ${Badges.count(rkey)}/8 gyms`, rx + 18 * u, ty); ty += 20 * u;
		if (owes && Quest.globalTier() < 8) {
			sctx.fillStyle = '#ffd27a';
			sctx.fillText(`Owes GYM ${Quest.globalTier() + 1} here`, rx + 18 * u, ty); ty += 20 * u;
		}
	} else {
		sctx.fillStyle = BUI.C.dim;
		sctx.fillText('(post-game region)', rx + 18 * u, ty); ty += 20 * u;
	}
	const gt = PORTAL_TOWNS[sel.map];
	if (gt) {
		sctx.fillStyle = BUI.C.dim;
		sctx.fillText(`GYM ${gt.tier + 1}: ${Quest.GYMS[gt.region][gt.tier].leader}`, rx + 18 * u, ty);
	}
	if (visited) {
		const b = { id: 'townfly', x: rx + 18 * u, y: ry + ph - 56 * u, w: 198 * u, h: 40 * u, label: 'FLY HERE', center: true };
		S.menuUi.push(b);
		BUI.button(sctx, b, S.menuHover === 'townfly', u);
	}
	// roamer tracker: once you've MET a roamer, the map tracks its current route
	{
		const st = roamState();
		const lines = Object.entries(ROAMERS)
			.filter(([k, cfg]) => st[k] && !st[k].down && st[k].seen)
			.map(([k, cfg]) => `${(battle.data.species[k]?.name || k).toUpperCase()} roams ${st[k].map.replace(/^Route/, 'ROUTE ')} (${cfg.region})`);
		if (lines.length) {
			sctx.fillStyle = '#ffd27a';
			sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
			lines.slice(0, 2).forEach((t, i) => sctx.fillText(t, 40 * u, H - (40 + i * 18) * u));
		}
	}
	if (townMap.flash) {
		sctx.fillStyle = BUI.C.accent;
		sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
		sctx.fillText(townMap.flash, 40 * u, H - 20 * u);
	}
}

export function drawTrainerCard(W, H) {
	const u = H / 480;
	// page 1 — the ADVENTURE JOURNAL: the newest entries of the rolling log
	if (trainerCard.page === 1) {
		menuChrome(W, H, u, 'ADVENTURE JOURNAL', '◄ ► card   X: close');
		const list = Journal.list();
		const cardX = 60 * u, cardY = 84 * u, cardW = W - 120 * u, cardH = H - 170 * u;
		sctx.fillStyle = 'rgba(30,54,92,0.9)';
		BUI.rr(sctx, cardX, cardY, cardW, cardH, 16 * u); sctx.fill();
		sctx.strokeStyle = BUI.C.accent; sctx.lineWidth = 3;
		BUI.rr(sctx, cardX + 1, cardY + 1, cardW - 2, cardH - 2, 16 * u); sctx.stroke();
		if (!list.length) {
			sctx.fillStyle = BUI.C.dim;
			sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
			sctx.fillText('Nothing yet — badges, catches, and evolutions land here.', cardX + 24 * u, cardY + 40 * u);
		}
		const rows = Math.floor((cardH - 40 * u) / (26 * u));
		list.slice(0, rows).forEach((e, i) => {
			const y = cardY + (30 + i * 26) * u;
			sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
			sctx.fillStyle = BUI.C.dim;
			sctx.fillText(Journal.when(e), cardX + 20 * u, y);
			sctx.fillStyle = BUI.C.text;
			sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
			sctx.fillText(e.text, cardX + 92 * u, y);
		});
		return;
	}
	menuChrome(W, H, u, 'TRAINER CARD', 'Your journey so far.   ◄ ► journal   ·   S share');
	const c = Dex.counts();
	const name = localStorage.getItem('magepunk_name') || 'PLAYER';
	const region = localStorage.getItem('magepunk_region') || '—';
	const money = Bag.getMoney();
	const cardX = 60 * u, cardY = 90 * u, cardW = W - 120 * u, cardH = H - 190 * u;
	sctx.fillStyle = 'rgba(30,54,92,0.9)';
	BUI.rr(sctx, cardX, cardY, cardW, cardH, 16 * u); sctx.fill();
	sctx.strokeStyle = BUI.C.accent; sctx.lineWidth = 3;
	BUI.rr(sctx, cardX + 1, cardY + 1, cardW - 2, cardH - 2, 16 * u); sctx.stroke();
	const rk = Badges.regionKey(region);
	const gTier = Quest.globalTier();
	const laggers = Quest.laggingRegions();
	const allChamp = Quest.SHARED.every(r => Badges.isChampion(r));
	// LEFT COLUMN — stats (values right-align to the column split)
		// shiny count (party + PC boxes) + Battle Frontier progress (Batch 6c)
		const shinyCount = shinyOwnedCount();
		const frBP = Frontier.getBP(), frSym = Object.keys(Frontier.getSymbols()).length;
	const lines = [
		['NAME', name],
		['ID No.', tidStr()],
		['REGION', region],
		['GYM TIER', allChamp ? `${gTier}/8  GRAND CHAMP` : `${gTier}/8`],
		['LEVEL CAP', gTier >= 8 ? 'NONE' : `Lv${levelCapNow()}`],
		['OBJECTIVE', Quest.shortObjective(rk)],
		['MONEY', `$${money}`],
		['TIME', `${Clock.label()} (${Clock.phaseLabel()})`],
		['POKeDEX', `${c.seen} seen / ${c.caught} own`],
		['SHINIES', `${shinyCount} ★`],
		['FRONTIER', `${frBP} BP · ${frSym} sym`],
		['PARTY', `${S.party.length}/6`],
		['PLAYTIME', playtimeStr()],
	];
	const midX = cardX + cardW * 0.54;
	sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
	lines.forEach(([k, v], i) => {
		const y = cardY + (34 + i * 26) * u;
		sctx.fillStyle = BUI.C.dim;
		sctx.fillText(k, cardX + 28 * u, y);
		sctx.fillStyle = (k === 'GYM TIER' && gTier > 0) || k === 'LEVEL CAP' ? BUI.C.accent : BUI.C.text;
		sctx.textAlign = 'right';
		sctx.fillText(v, midX, y);
		sctx.textAlign = 'left';
	});
	// RIGHT COLUMN — the cross-region TIER tracker: one row of 8 pips per shared region
	// (fill = earned). The current tier's pip is ringed on the regions that still OWE this
	// tier's gym, so you can see at a glance who's holding the world back.
	const rX = cardX + cardW * 0.57;
	sctx.fillStyle = BUI.C.accent;
	sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
	sctx.fillText(`GYM TIER ${gTier}/8`, rX, cardY + 30 * u);
	sctx.fillStyle = BUI.C.dim;
	sctx.font = `${Math.round(11 * u)}px m6x11plus, monospace`;
	// the tier tracker and the level cap are the same fact seen twice, so spell
	// out what clearing this row buys you
	sctx.fillText(gTier >= 8 ? 'all cleared — no level cap' : `beat each in all 3 regions  ->  Lv${Badges.nextLevelCap(gTier)} cap`,
		rX, cardY + 46 * u);
	const rowLbl = { KANTO: 'KAN', JOHTO: 'JOH', HOENN: 'HOE' };
	const pipAreaX = rX + 44 * u, pipAreaW = (cardX + cardW - 24 * u) - pipAreaX, pgap = pipAreaW / 8, pipR = 6 * u;
	Quest.SHARED.forEach((r, ri) => {
		const ry = cardY + (72 + ri * 26) * u;
		const owes = laggers.includes(r), champ = Badges.isChampion(r), list = Badges.list(r);
		sctx.fillStyle = owes ? BUI.C.text : BUI.C.dim;
		sctx.font = `${Math.round(12 * u)}px m6x11plus, monospace`;
		sctx.fillText(rowLbl[r] + (champ ? '*' : ''), rX, ry + 4 * u);
		for (let i = 0; i < 8; i++) {
			const px = pipAreaX + pgap * i + pgap / 2;
			// real badge art (fx/badges/): full color when earned, dark silhouette
			// when not; the old pip covers the first frames while the art loads
			const art = list[i].earned ? badgeSprite(r, list[i].id) : badgeGhost(r, list[i].id);
			if (art) {
				const bs = 18 * u;
				sctx.drawImage(art, px - bs / 2, ry - bs / 2, bs, bs);
			} else {
				sctx.beginPath();
				sctx.arc(px, ry, pipR, 0, Math.PI * 2);
				sctx.fillStyle = list[i].earned ? BUI.C.accent : 'rgba(255,255,255,0.12)';
				sctx.fill();
			}
			if (i === gTier && owes && gTier < 8) { sctx.beginPath(); sctx.arc(px, ry, 11 * u, 0, Math.PI * 2); sctx.strokeStyle = '#ffd27a'; sctx.lineWidth = 2; sctx.stroke(); } // the tier they owe
		}
	});
	// THE POSTGAME ROW — JohKanto's own eight, plus RED and the legend count.
	// The card tracked the three shared regions and stopped; the sixteen-badge
	// climb and the hunt had no progress surface at all.
	if (Badges.isChampion('JOHTO')) {
		const ry = cardY + (72 + 3 * 26) * u;
		const jkList = Badges.list('JOHKANTO');
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(12 * u)}px m6x11plus, monospace`;
		sctx.fillText('OLD' + (Story.getFlag('beat_red') ? '*' : ''), rX, ry + 4 * u);
		for (let i = 0; i < 8; i++) {
			const px = pipAreaX + pgap * i + pgap / 2;
			// same badges as KANTO's row — the art module maps JOHKANTO to kanto_*
			const art = jkList[i].earned ? badgeSprite('JOHKANTO', jkList[i].id) : badgeGhost('JOHKANTO', jkList[i].id);
			if (art) {
				const bs = 18 * u;
				sctx.drawImage(art, px - bs / 2, ry - bs / 2, bs, bs);
			} else {
				sctx.beginPath();
				sctx.arc(px, ry, pipR, 0, Math.PI * 2);
				sctx.fillStyle = jkList[i].earned ? '#c9a24a' : 'rgba(255,255,255,0.12)';
				sctx.fill();
			}
		}
		const { caught, total } = legendStats();
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(11 * u)}px m6x11plus, monospace`;
		sctx.fillText(`LEGENDS ${caught}/${total}`, rX, ry + 20 * u);
	}
	// FRONTIER SYMBOLS — a compact row of diamonds (gold/silver) under the tier tracker
	const symbols = Frontier.getSymbols();
	const facOrder = [['tower', 'TO'], ['dome', 'DO'], ['factory', 'FA'], ['palace', 'PA'], ['arena', 'AR'], ['pike', 'PI'], ['pyramid', 'PY']];
	if (facOrder.some(([id]) => symbols[id])) {
		const symY = cardY + 172 * u, r = 8 * u, rW = (cardX + cardW - 24 * u) - rX;
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(11 * u)}px m6x11plus, monospace`;
		sctx.fillText('FRONTIER SYMBOLS', rX, symY - 14 * u);
		const sgap = rW / 7;
		facOrder.forEach(([id, code], i) => {
			const sx = rX + sgap * i + sgap / 2, tier = symbols[id];
			sctx.beginPath();
			sctx.moveTo(sx, symY - r); sctx.lineTo(sx + r, symY); sctx.lineTo(sx, symY + r); sctx.lineTo(sx - r, symY); sctx.closePath();
			sctx.fillStyle = tier === 'gold' ? '#f5c542' : tier === 'silver' ? '#c9d2dc' : 'rgba(255,255,255,0.12)';
			sctx.fill();
			if (tier) { sctx.strokeStyle = '#fff'; sctx.lineWidth = 1.2; sctx.stroke(); }
			sctx.fillStyle = tier ? '#16273f' : BUI.C.dim;
			sctx.font = `${Math.round(9 * u)}px m6x11plus, monospace`;
			sctx.textAlign = 'center';
			sctx.fillText(code, sx, symY + 3 * u);
			sctx.textAlign = 'left';
		});
	}
}

// a simple scrollable option-list menu (label rows + optional flash)
export function optionList(W, H, u, title, sub, rows, sel, idPrefix, flash) {
	menuChrome(W, H, u, title, sub);
	const start = Math.max(0, Math.min(sel - 3, rows.length - 8));
	rows.slice(start, start + 8).forEach((label, i) => {
		const idx = start + i;
		const bid = idPrefix + idx;
		const b = { id: bid, x: 24 * u, y: (84 + i * 50) * u, w: W - 48 * u, h: 44 * u, label, center: false };
		S.menuUi.push(b);
		BUI.button(sctx, b, S.menuHover === bid || sel === idx, u);
	});
	if (flash) {
		sctx.fillStyle = BUI.C.accent;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText(flash, 24 * u, H - 18 * u);
	}
}

export function drawDaycare(W, H) {
	const u = H / 480;
	const st = Daycare.get();
	if (daycareMenu.mode === 'deposit') {
		menuChrome(W, H, u, 'DAY CARE', 'Which POKeMON should we look after?');
		S.party.forEach((m, i) => monRow('dcdep:' + i, 24 * u, (76 + i * 62) * u, W - 48 * u, 56 * u, m, daycareMenu.idx === i, u));
		if (daycareMenu.flash) { sctx.fillStyle = BUI.C.accent; sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`; sctx.fillText(daycareMenu.flash, 24 * u, H - 18 * u); }
		return;
	}
	const inCare = st.slots.filter(Boolean).map(m => `${m.name} Lv${m.level}`).join(', ') || 'nobody right now';
	const eggLine = Daycare.hasReadyEgg() ? '  •  An EGG is ready!' : (Daycare.eggPending() ? '  •  An EGG is on the way…' : '');
	const opts = daycareOptions();
	optionList(W, H, u, 'DAY CARE', `Looking after: ${inCare}${eggLine}`, opts.map(o => o.label), daycareMenu.idx, 'dc:', daycareMenu.flash);
}

export function drawNameRater(W, H) {
	const u = H / 480;
	menuChrome(W, H, u, 'NAME RATER', 'Whose nickname shall I judge?');
	S.party.forEach((m, i) => monRow('nr:' + i, 24 * u, (76 + i * 62) * u, W - 48 * u, 56 * u, m, nameRater.idx === i, u));
}

export function drawHalfParty(W, H) {
	const u = H / 480;
	menuChrome(W, H, u, 'MULTI BATTLE', `Choose ${halfPartyNeed()} POKeMON to battle beside STEVEN.`);
	const ORD = ['1st', '2nd', '3rd'];
	S.party.forEach((m, i) => {
		const at = halfParty.picked.indexOf(i);
		monRow('hp3:' + i, 24 * u, (76 + i * 62) * u, W - 48 * u, 56 * u, m, halfParty.idx === i || at >= 0, u, at >= 0 ? ORD[at] : '');
	});
	const go = { id: 'hp3go', x: W - 226 * u, y: 16 * u, w: 110 * u, h: 36 * u, label: 'BATTLE', center: true };
	S.menuUi.push(go);
	BUI.button(sctx, go, S.menuHover === 'hp3go' || halfParty.idx === S.party.length, u);
	if (halfParty.flash) { sctx.fillStyle = BUI.C.accent; sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`; sctx.fillText(halfParty.flash, 24 * u, H - 18 * u); }
}

export function drawOptions(W, H) {
	const u = H / 480;
	if (optionsMenu.mode === 'controls') {
		const rows = KEY_ACTIONS.map(a => {
			const cur = keyBinds[a.id];
			const shown = (cur || a.def) === ' ' ? 'SPACE' : (cur || a.def).toUpperCase();
			return optionsMenu.capture === a.id ? `${a.label}   >>> PRESS A KEY (Esc cancels)` : `${a.label}   —   ${shown}${cur ? '' : '  (default)'}`;
		}).concat(['RESET ALL TO DEFAULTS', 'Back']);
		optionList(W, H, u, 'CONTROLS', 'Every shortcut, rebindable. Arrows + WASD always move.', rows, optionsMenu.idx, 'ctl:', optionsMenu.flash);
		return;
	}
	if (optionsMenu.mode === 'backups') {
		const list = optionsMenu.list;
		const rows = list == null ? ['(loading…)'] : [
			...list.map(b => (b.slot === 'undo' ? 'UNDO — before the last restore' : b.slot)
				+ `   (${Math.max(1, Math.round((b.bytes || 0) / 1024))} KB)`),
			'BACK',
		];
		optionList(W, H, u, 'SERVER BACKUPS', 'One automatic save kept per day, plus UNDO.  Z: restore', rows, optionsMenu.idx, 'bkp:', optionsMenu.flash);
		return;
	}
	menuChrome(W, H, u, 'OPTIONS', 'Arrows: ▲▼ pick   ◄► change   X: close');
	OPTION_KEYS.forEach((key, i) => {
		const o = Settings.OPTIONS[key];
		const sel = optionsMenu.idx === i;
		const bid = 'opt:' + i;
		const b = { id: bid, x: 40 * u, y: (84 + i * 46) * u, w: W - 80 * u, h: 40 * u };
		S.menuUi.push(b);
		sctx.fillStyle = sel || S.menuHover === bid ? BUI.C.btnHover : BUI.C.btn;
		BUI.rr(sctx, b.x, b.y, b.w, b.h, 8 * u); sctx.fill();
		sctx.strokeStyle = sel ? BUI.C.accent : BUI.C.panelBorder;
		sctx.lineWidth = sel ? 3 : 1;
		BUI.rr(sctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, 8 * u); sctx.stroke();
		sctx.fillStyle = BUI.C.text;
		sctx.font = `${Math.round(18 * u)}px m6x11plus, monospace`;
		sctx.fillText(o.label, b.x + 20 * u, b.y + 27 * u);
		// value with ◄ ► chevrons
		const val = Settings.displayValue(key);
		sctx.textAlign = 'right';
		sctx.fillStyle = BUI.C.accent;
		sctx.fillText(val, b.x + b.w - 44 * u, b.y + 27 * u);
		sctx.fillStyle = sel ? BUI.C.text : BUI.C.dim;
		sctx.fillText('◄', b.x + b.w - 132 * u, b.y + 27 * u);
		sctx.fillText('►', b.x + b.w - 20 * u, b.y + 27 * u);
		sctx.textAlign = 'left';
	});
	// SAVE DATA + CONTROLS — four action buttons in one row under the settings
	const actY = (84 + OPTION_KEYS.length * 46 + 8) * u;
	OPTION_ACTIONS.forEach((a, i) => {
		const idx = OPTION_KEYS.length + i;
		const bw = (W - 80 * u - 24 * u) / 4;
		const bid = 'optact:' + i;
		const b = { id: bid, x: 40 * u + i * (bw + 8 * u), y: actY, w: bw, h: 44 * u, label: a.label, center: true };
		S.menuUi.push(b);
		BUI.button(sctx, b, S.menuHover === bid || optionsMenu.idx === idx, u);
	});
	// hint for the selected action (or a flash from the last one), else the default footer
	const act = OPTION_ACTIONS[optionsMenu.idx - OPTION_KEYS.length];
	sctx.fillStyle = optionsMenu.flash ? BUI.C.accent : BUI.C.dim;
	sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
	sctx.fillText(optionsMenu.flash || (act ? act.hint + '.' : 'Changes save automatically.'), 40 * u, H - 12 * u);
}

export function drawMoveShop(W, H) {
	const u = H / 480;
	const m = moveShop;
	if (m.mode === 'main') {
		optionList(W, H, u, 'MOVE SERVICES', 'I can make a POKeMON forget or recall a move.',
			['Forget a move', 'Recall a move'], m.idx, 'ms:', m.flash);
		return;
	}
	if (m.mode === 'pick-delete' || m.mode === 'pick-relearn') {
		menuChrome(W, H, u, 'MOVE SERVICES', m.mode === 'pick-delete' ? 'Which POKeMON forgets a move?' : 'Which POKeMON recalls a move?');
		S.party.forEach((mo, i) => monRow('mspick:' + i, 24 * u, (76 + i * 62) * u, W - 48 * u, 56 * u, mo, m.idx === i, u));
		if (m.flash) { sctx.fillStyle = BUI.C.accent; sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`; sctx.fillText(m.flash, 24 * u, H - 18 * u); }
		return;
	}
	if (m.mode === 'delete-move') {
		const labels = m.mon.moves.map(mv => { const info = battle.data.moves[mv.id] || {}; return `${mv.name}  [${(info.type || '').toUpperCase()}]`; });
		optionList(W, H, u, `${m.mon.name} — forget which move?`, 'It needs to keep at least one move.', labels, m.idx, 'msdel:', m.flash);
		return;
	}
	if (m.mode === 'relearn-move') {
		const list = m.list || [];
		const labels = list.length ? list.map(id => { const info = battle.data.moves[id] || {}; return `${info.name}  [${(info.type || '').toUpperCase()}]`; }) : ['(no moves to recall)'];
		optionList(W, H, u, `${m.mon.name} — recall which move?`, 'Level-up moves it has learned before.', labels, m.idx, 'msrel:', m.flash);
		return;
	}
}

// draw one starter tile (sprite + name in a rounded, type-tinted frame)
function drawStarterCell(id, x, y, cw, ch, sel, bid, u) {
	const sp = battle.data.species[id];
	const tc = BUI.TYPE_COLORS[sp?.types?.[0]] || '#888';
	sctx.fillStyle = sel || S.menuHover === bid ? BUI.C.btnHover : BUI.C.btn;
	BUI.rr(sctx, x, y, cw, ch, 10 * u); sctx.fill();
	sctx.strokeStyle = sel || S.menuHover === bid ? tc : BUI.C.panelBorder;
	sctx.lineWidth = sel ? 4 : 2;
	BUI.rr(sctx, x + 1, y + 1, cw - 2, ch - 2, 10 * u); sctx.stroke();
	const img = starterMenu.sprites[id];
	if (img) {
		sctx.imageSmoothingEnabled = false;
		const s = Math.min((cw - 30 * u) / img.width, (ch - 44 * u) / img.height);
		sctx.drawImage(img, x + (cw - img.width * s) / 2, y + 6 * u, img.width * s, img.height * s);
	}
	sctx.fillStyle = sel ? tc : BUI.C.text;
	sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
	sctx.textAlign = 'center';
	sctx.fillText((sp?.name || id).toUpperCase(), x + cw / 2, y + ch - 10 * u);
	sctx.textAlign = 'left';
}
export function drawStarterMenu(W, H) {
	const u = H / 480;
	if (starterMenu.phase === 'pick') {
		const region = starterMenu.region || STARTERS[starterMenu.row]?.region || 'KANTO';
		const row = STARTERS.find(r => r.region === region) || STARTERS[0];
		menuChrome(W, H, u, 'CHOOSE YOUR FIRST POKEMON', `${region} — use ◄ ► then A to choose your partner.`, false);
		const cw = 150 * u, ch = 150 * u, y = 150 * u;
		row.ids.forEach((id, c) => {
			const x = (70 + c * 165) * u;
			const bid = `starterpick:${c}`;
			S.menuUi.push({ id: bid, x, y, w: cw, h: ch });
			drawStarterCell(id, x, y, cw, ch, starterMenu.col === c, bid, u);
		});
		return;
	}
	// phase 'region': REGION cards only. The old screen was a 3x3 grid of the
	// nine starters, which read as "pick your starter" — but the starter is
	// chosen later, on-screen in the professor's lab, so showing them here
	// promised a choice this screen doesn't make.
	menuChrome(W, H, u, 'CHOOSE YOUR REGION', 'Pick where your journey begins. Your first POKeMON waits in the lab.', false);
	STARTERS.forEach((row, r) => {
		const y = (84 + r * 128) * u, ch = 112 * u;
		const rowSel = starterMenu.row === r;
		const bid = `region:${r}`;
		const b = { id: bid, x: 30 * u, y, w: W - 60 * u, h: ch };
		S.menuUi.push(b);
		sctx.fillStyle = rowSel || S.menuHover === bid ? BUI.C.btnHover : BUI.C.btn;
		BUI.rr(sctx, b.x, b.y, b.w, b.h, 10 * u); sctx.fill();
		if (rowSel) { sctx.strokeStyle = BUI.C.accent; sctx.lineWidth = 2.5 * u; BUI.rr(sctx, b.x, b.y, b.w, b.h, 10 * u); sctx.stroke(); }
		const cfg = NEW_GAME_INTRO[row.region] || {};
		sctx.fillStyle = rowSel ? BUI.C.accent : BUI.C.text;
		sctx.font = `${Math.round(30 * u)}px m6x11plus, monospace`;
		sctx.fillText(row.region, b.x + 26 * u, y + 46 * u);
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText(`${cfg.prof || ''} awaits in ${(cfg.home || '').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase()}`, b.x + 26 * u, y + 74 * u);
		sctx.fillText({ KANTO: 'The classic journey — FireRed', JOHTO: 'The golden road — Crystal', HOENN: 'Land and sea — Emerald' }[row.region] || '', b.x + 26 * u, y + 96 * u);
	});
}

export function drawShopMenu(W, H) {
	const u = H / 480;
	const selling = shopMenu.mode === 'sell';
	menuChrome(W, H, u, 'POKE MART', `Money: $${Bag.getMoney()} — ${selling ? 'tap to sell (half price)' : 'tap to buy'}`);
	// BUY / SELL tabs
	['buy', 'sell'].forEach((m, i) => {
		const bid = 'shopmode:' + m;
		const b = { id: bid, x: (24 + i * 130) * u, y: 62 * u, w: 120 * u, h: 30 * u, label: m.toUpperCase(), center: true };
		S.menuUi.push(b);
		BUI.button(sctx, b, S.menuHover === bid || shopMenu.mode === m, u);
	});
	const rows = selling ? sellList() : shopStockNow().map(id => ({ id }));
	if (!rows.length) {
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
		sctx.fillText('Nothing to sell.', 24 * u, 140 * u);
	}
	const start = Math.max(0, Math.min(shopMenu.idx - 3, rows.length - 7));
	rows.slice(start, start + 7).forEach((row, i) => {
		const idx = start + i;
		const it = Bag.ITEMS[row.id];
		const bid = (selling ? 'sell:' : 'buy:') + idx;
		const price = selling ? sellPrice(row.id) : it.price;
		const b = { id: bid, x: 24 * u, y: (104 + i * 48) * u, w: W - 118 * u, h: 42 * u,
			label: it.name, sub: selling ? `have ${row.n}` : `have ${Bag.count(row.id)}`,
			right: `$${price}`, kbSel: shopMenu.idx === idx };
		S.menuUi.push(b);
		BUI.button(sctx, b, S.menuHover === bid || shopMenu.idx === idx, u);
	});
	for (const [id, label, y] of [['shopscroll:-1', '▲', 104], ['shopscroll:1', '▼', 320]]) {
		const b = { id, x: W - 86 * u, y: y * u, w: 62 * u, h: 130 * u, label, center: true };
		S.menuUi.push(b);
		BUI.button(sctx, b, S.menuHover === id, u);
	}
	if (shopMenu.flash) {
		sctx.fillStyle = BUI.C.accent;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText(shopMenu.flash, 24 * u, H - 20 * u);
	}
}

// item icons for the canvas bag menu. Real sprites load lazily (getImage is
// async; the draw loop is sync), cached once resolved; a procedural category
// icon fills the box until then / when the item has no sprite. See itemicon.js.
const _bagIconImg = {}; // id -> HTMLImageElement | null | 'loading'
function drawBagIcon(ctx, id, x, y, s) {
	const file = itemIconFile(id);
	if (file) {
		const c = _bagIconImg[id];
		if (c && c !== 'loading') { ctx.imageSmoothingEnabled = false; ctx.drawImage(c, x, y, s, s); return; }
		if (c !== 'loading') {
			_bagIconImg[id] = 'loading';
			getImage(`item_icons/${file}`).then(im => { _bagIconImg[id] = im; }).catch(() => { _bagIconImg[id] = null; });
		}
	}
	drawCategoryIcon(ctx, (Bag.ITEMS[id] || {}).kind, id, x, y, s); // placeholder while loading / no sprite
}

export function drawBagMenu(W, H) {
	const u = H / 480;
	const pocket = BAG_POCKETS[bagMenu.pocket] || BAG_POCKETS[0];
	menuChrome(W, H, u, `BAG — ${pocket.label}`,
		`Money: $${Bag.getMoney()} — ←/→ pocket · tap an item, then who to use it on`);
	const entries = bagEntries();
	if (!entries.length) {
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
		sctx.fillText('The bag is empty.', 24 * u, 100 * u);
	}
	const colW = bagMenu.picking ? W * 0.44 : W - 48 * u;
	const start = Math.max(0, Math.min(bagMenu.idx - 3, entries.length - 7));
	entries.slice(start, start + 7).forEach(([id, n], i) => {
		const idx = start + i;
		const bid = 'item:' + idx;
		const b = { id: bid, x: 24 * u, y: (76 + i * 52) * u, w: colW, h: 46 * u,
			label: Bag.nameOf(id), right: `x${n}`, iconPad: 46 * u };
		S.menuUi.push(b);
		BUI.button(sctx, b, S.menuHover === bid || (bagMenu.idx === idx && !bagMenu.picking), u);
		drawBagIcon(sctx, id, b.x + 8 * u, b.y + (b.h - 32 * u) / 2, 32 * u);
	});
	if (bagMenu.ppPick) {
		const p = bagMenu.ppPick;
		sctx.fillStyle = BUI.C.text;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText(`${p.mon.name}: boost which move's PP?`, W * 0.5, 70 * u);
		p.mon.moves.forEach((mv, i) => {
			const bid = 'pppick:' + i;
			const b = { id: bid, x: W * 0.5, y: (76 + i * 52) * u, w: W * 0.47, h: 46 * u,
				label: mv.name, right: `${mv.pp}/${mv.maxPp}` };
			S.menuUi.push(b);
			BUI.button(sctx, b, S.menuHover === bid || p.idx === i, u);
		});
	} else if (bagMenu.forget) {
		const f = bagMenu.forget;
		sctx.fillStyle = BUI.C.text;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText(`${f.mon.name}: forget which move?`, W * 0.5, 70 * u);
		f.mon.moves.forEach((mv, i) => {
			const bid = 'forget:' + i;
			const b = { id: bid, x: W * 0.5, y: (76 + i * 52) * u, w: W * 0.47, h: 46 * u,
				label: mv.name, right: `${mv.pp}/${mv.maxPp}` };
			S.menuUi.push(b);
			BUI.button(sctx, b, S.menuHover === bid || f.idx === i, u);
		});
	} else if (bagMenu.picking) {
		sctx.fillStyle = BUI.C.text;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText('Use on:', W * 0.5, 70 * u);
		S.party.forEach((m, i) => {
			monRow('use:' + i, W * 0.5, (76 + i * 54) * u, W * 0.47, 48 * u, m, bagMenu.pickIdx === i, u);
		});
	}
	if (bagMenu.flash) {
		sctx.fillStyle = BUI.C.accent;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText(bagMenu.flash, 24 * u, H - 24 * u);
	}
}

export function drawPcMenu(W, H) {
	const u = H / 480;
	const box = getBox();
	const pageStart = pcMenu.box * PC_BOX_CAP;
	const viewIdx = pcMenu.filter != null ? pcMatches(box, pcMenu.filter) : null;
	const page = viewIdx ? viewIdx.map(i => box[i]) : box.slice(pageStart, pageStart + PC_BOX_CAP);
	menuChrome(W, H, u, 'POKEMON STORAGE',
		pcMenu.confirm != null ? `Release ${box[pcMenu.confirm]?.name}? Z releases — X keeps it.`
			: pcMenu.releaseMode ? 'RELEASE MODE: tap a boxed Pokémon to let it go.'
			: pcMenu.flash || 'Z moves · ←/→ change box · R release · S sort · F search.');
	sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
	sctx.fillStyle = pcMenu.side === 0 ? BUI.C.accent : BUI.C.dim;
	sctx.fillText('PARTY', 24 * u, 78 * u);
	sctx.fillStyle = pcMenu.side === 1 ? BUI.C.accent : BUI.C.dim;
	sctx.fillText(viewIdx
		? `SEARCH "${pcMenu.filter}" — ${page.length} found of ${box.length}`
		: `BOX ${pcMenu.box + 1}/${PC_BOXES} (${page.length}/${PC_BOX_CAP} · ${box.length} total)`, W * 0.52, 78 * u);
	// tappable controls: box paging + sort + release mode; confirm gets its own pair
	const navBtns = pcMenu.confirm != null
		? [['pcnav:yes', 'RELEASE', W * 0.52, 100 * u], ['pcnav:no', 'KEEP', W * 0.52 + 110 * u, 76 * u]]
		: [
			['pcnav:prev', '<', W * 0.465, 24 * u],
			['pcnav:next', '>', W - 40 * u, 24 * u],
			['pcnav:sort', 'SORT', 24 * u, 60 * u],
			['pcnav:rel', pcMenu.releaseMode ? 'DONE' : 'RELEASE', 96 * u, 90 * u],
			['pcnav:find', pcMenu.filter ? 'CLEAR' : 'FIND', 198 * u, 70 * u],
		];
	for (const [bid, label, x, w] of navBtns) {
		const b = { id: bid, x, y: 62 * u, w, h: 22 * u, label, center: true };
		S.menuUi.push(b);
		BUI.button(sctx, b, S.menuHover === bid, u);
	}
	if (pcMenu.confirm != null) return; // the confirm banner + buttons say it all
	S.party.forEach((m, i) => {
		monRow('pcp:' + i, 24 * u, (88 + i * 54) * u, W * 0.44, 48 * u, m,
			pcMenu.side === 0 && pcMenu.idx === i, u);
	});
	const start = Math.max(0, Math.min((pcMenu.side === 1 ? pcMenu.idx : 0) - 3, page.length - 7));
	page.slice(start, start + 7).forEach((m, i) => {
		const idx = start + i;
		monRow('pcb:' + idx, W * 0.52, (88 + i * 54) * u, W * 0.44, 48 * u, m,
			pcMenu.side === 1 && pcMenu.idx === idx, u);
	});
}

export function drawFerryMenu(W, H) {
	const u = H / 480;
	menuChrome(W, H, u, 'FERRY', 'All aboard! Where to, sailor?');
	const dests = FERRY_DESTS.filter(d => d.file !== world.current.name);
	dests.forEach((d, i) => {
		const bid = 'sail:' + i;
		const b = { id: bid, x: 24 * u, y: (90 + i * 64) * u, w: W - 48 * u, h: 56 * u,
			label: d.label, big: true, center: true, kbSel: ferryMenu.idx === i };
		S.menuUi.push(b);
		BUI.button(sctx, b, S.menuHover === bid || ferryMenu.idx === i, u);
	});
}

export function drawPortalMenu(W, H) {
	const u = H / 480;
	menuChrome(W, H, u, 'PORTAL', 'The pad hums. Where to, traveler?');
	const rows = portalMenu.dests.map(d => `${d.town}  (${d.region})`).concat(['Cancel']);
	rows.forEach((label, i) => {
		const bid = 'portal:' + i;
		const b = { id: bid, x: 24 * u, y: (90 + i * 64) * u, w: W - 48 * u, h: 56 * u,
			label, big: true, center: true, kbSel: portalMenu.idx === i };
		S.menuUi.push(b);
		BUI.button(sctx, b, S.menuHover === bid || portalMenu.idx === i, u);
	});
}

// a compact vertical list menu (Start / Cards); returns tappable rows
export function drawVertical(W, H, u, title, sub, items, idx, idPrefix) {
	menuChrome(W, H, u, title, sub, title !== 'MENU');
	const bw = Math.min(W - 48 * u, 360 * u);
	items.forEach((lab, i) => {
		const bid = idPrefix + ':' + i;
		const b = { id: bid, x: W - bw - 24 * u, y: (80 + i * 46) * u, w: bw, h: 40 * u,
			label: lab, center: true, kbSel: idx === i };
		S.menuUi.push(b);
		BUI.button(sctx, b, S.menuHover === bid || idx === i, u);
	});
}
export function drawStartMenu(W, H) {
	drawVertical(W, H, H / 480, 'MENU', 'Press START/Enter to close.', startItems(), startMenu.idx, 'start');
}
export function drawQuest(W, H) {
	const rk = playerRegion();
	if (questMenu.page === 1) {
		// THINGS TO DO — the discovery checklist
		const rows = todoRows();
		const left = rows.filter(r => r.startsWith('[ ]') || r.startsWith('[>]')).length;
		optionList(W, H, H / 480, 'THINGS TO DO', `◄ ► quest log   ·   ${THINGS_TO_DO.length - left} explored, ${left} to discover`, rows, questMenu.idx, 'todo:', null);
		return;
	}
	const mark = r => (r.state === 'done' ? '[x] ' : r.state === 'current' ? '[>] ' : '[ ] ') + r.label;
	// the postgame arc appends below the region log — the log used to end at the
	// League row while sixteen more badges, RED and the legendary hunt existed
	const pg = postgameLog();
	const rows = Quest.log(rk).map(mark).concat(pg.length ? ['— THE OLD KANTO —', ...pg.map(mark)] : []);
	const next = (Quest.stage(rk) === Quest.DONE && postgameObjective()) || Quest.objective(rk);
	// the title carries the SHARED gym tier (all three regions must clear each tier); the
	// subtitle's objective already spells out the cross-region "who's behind" when relevant
	optionList(W, H, H / 480, `${rk} — GYM TIER ${Quest.globalTier()}/8`, 'NEXT: ' + next + '   ·   ◄ ► things to do', rows, questMenu.idx, 'quest:', null);
}
export function drawCardsMenu(W, H) {
	drawVertical(W, H, H / 480, 'CARDS', 'Your collection, decks, packs, and battles.', cardsItems(), cardsMenu.idx, 'cards');
}
export function drawRunMenu(W, H) {
	drawVertical(W, H, H / 480, 'DUNGEON RUN', 'Pick a run mode.', runModeItems(), runMenu.idx, 'run');
}
export function drawFriendsMenu(W, H) {
	const u = H / 480;
	const sub = friendsChallenge.mode ? 'Choose a friend to challenge.'
		: `Your code: ${S.mpAccount?.friendCode || '……'} — add friends and visit their world.`;
	menuChrome(W, H, u, 'FRIENDS', sub);
	// row 0: add friend; row 1: the inbox (challenges + trade offers waiting)
	const bd = friendsMenu.badges;
	const waiting = bd ? bd.ch + bd.tr : 0;
	const rows = [
		{ id: 'friend:0', label: '+ ADD FRIEND BY CODE', sub: '' },
		{
			id: 'friend:1',
			label: `INBOX${waiting ? `  (${waiting}!)` : ''}`,
			sub: bd == null ? 'checking…' : waiting
				? [bd.ch ? `${bd.ch} battle challenge${bd.ch === 1 ? '' : 's'}` : '', bd.tr ? `${bd.tr} trade offer${bd.tr === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')
				: 'no challenges or trade offers waiting',
		},
	];
	S.friends.forEach((f, i) => rows.push({
		id: 'friend:' + (i + 2),
		label: f.username + (f.online ? '  ●' : '  ○'),
		sub: f.online ? (friendsChallenge.mode ? 'tap to challenge' : `in ${f.map || 'their world'} — tap to visit`) : 'offline — tap to offer a trade',
		online: f.online,
	}));
	rows.forEach((r, i) => {
		const b = { id: r.id, x: 24 * u, y: (78 + i * 52) * u, w: W - 48 * u, h: 46 * u,
			label: r.label, sub: r.sub, kbSel: friendsMenu.idx === i };
		S.menuUi.push(b);
		BUI.button(sctx, b, S.menuHover === r.id || friendsMenu.idx === i, u);
	});
	if (!S.friends.length) {
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
		sctx.fillText('No friends yet — share your code!', 24 * u, (78 + 60) * u);
	}
}

// taps route into the same state + key logic the keyboard uses
export function menuTap(id) {
	const [kind, a, b2] = id.split(':');
	if (kind === 'close') { pressKey('Escape'); pressKey('x'); return; }
	if (kind === 'party') { if (!partyMenu.action) { partyMenu.idx = +a; pressKey('z'); } return; }
	if (kind === 'pact') { if (partyMenu.action) { partyMenu.action.idx = +a; pressKey('z'); } return; }
	if (kind === 'take') {
		const mon = S.party[+a];
		if (mon?.heldItem) {
			Bag.addItem(mon.heldItem);
			mon.heldItem = null;
			saveParty(S.party);
		}
		return;
	}
	if (kind === 'region') { starterMenu.row = +a; pressKey('z'); return; }
	if (kind === 'starterpick') { starterMenu.col = +a; pressKey('z'); return; }
	if (kind === 'buy' || kind === 'sell') { shopMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'shopmode') { if (shopMenu.mode !== a) { shopMenu.mode = a; shopMenu.idx = 0; } return; }
	if (kind === 'shopscroll') { pressKey(+a > 0 ? 'ArrowDown' : 'ArrowUp'); return; }
	if (kind === 'sail') { ferryMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'portal') { portalMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'bp') { bpShopMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'item') { bagMenu.idx = +a; bagMenu.picking = false; bagMenu.forget = null; pressKey('z'); return; }
	if (kind === 'use') { bagMenu.pickIdx = +a; pressKey('z'); return; }
	if (kind === 'forget') { if (bagMenu.forget) bagMenu.forget.idx = +a; pressKey('z'); return; }
	if (kind === 'pppick') { if (bagMenu.ppPick) bagMenu.ppPick.idx = +a; pressKey('z'); return; }
	if (kind === 'mail') { mailMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'pcp') { pcMenu.side = 0; pcMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'gc') { gcMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'vf') { if (vfMenu.game?.phase === 'play') vfMenu.cur = +a; pressKey('z'); return; }
	if (kind === 'pcb') {
		pcMenu.side = 1;
		pcMenu.idx = +a;
		pressKey(pcMenu.releaseMode ? 'r' : 'z'); // release mode arms the confirm instead of withdrawing
		return;
	}
	if (kind === 'pcnav') {
		if (a === 'yes') { pressKey('z'); return; }
		if (a === 'no') { pressKey('x'); return; }
		if (a === 'sort') { pressKey('s'); return; }
		if (a === 'rel') { pcMenu.releaseMode = !pcMenu.releaseMode; return; }
		if (a === 'find') {
			// tapping CLEAR drops the filter without a prompt; FIND asks for one
			if (pcMenu.filter) { pcMenu.filter = null; pcMenu.idx = 0; pcMenu.flash = 'Search cleared.'; }
			else pressKey('f');
			return;
		}
		pcMenu.side = 1;
		pressKey(a === 'prev' ? 'ArrowLeft' : 'ArrowRight');
		return;
	}
	if (kind === 'start') { startMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'trade') { trade.idx = +a; pressKey('z'); return; }
	if (kind === 'player') { playerMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'deck') { deckSelect.idx = +a; pressKey('z'); return; }
	if (kind === 'cards') { cardsMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'run') { runMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'friend') { friendsMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'deco') { decoMenu.idx = +a; decoKey('z'); return; }
	if (kind === 'soc' || kind === 'socm') { socialMenu.idx = +a; socialKey('z'); return; }
	if (kind === 'dex') { dexMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'summary-lead') {
		if (partyMenu.summary && partyMenu.idx > 0) { const [m] = S.party.splice(partyMenu.idx, 1); S.party.unshift(m); partyMenu.idx = 0; saveParty(S.party); }
		return;
	}
	if (kind === 'summary-move') {
		// reorder the summary's move slots: first tap arms, second tap swaps
		// (same slot cancels) — PP rides along, the order persists on the mon
		const m = S.party[partyMenu.idx];
		const i = +a;
		if (!partyMenu.summary || !m || !(m.moves?.length > 1) || i >= m.moves.length) return;
		if (partyMenu.moveSwap == null) { partyMenu.moveSwap = i; sfx('ui_select'); }
		else if (partyMenu.moveSwap === i) { partyMenu.moveSwap = null; sfx('ui_cancel'); }
		else {
			const j = partyMenu.moveSwap;
			[m.moves[i], m.moves[j]] = [m.moves[j], m.moves[i]];
			partyMenu.moveSwap = null;
			saveParty(S.party);
			sfx('ui_select');
		}
		return;
	}
	if (kind === 'townreg') { townMap.region = +a; townMap.idx = 0; townMap.flash = null; return; }
	if (kind === 'town') { townMap.idx = +a; townMap.flash = null; return; }
	if (kind === 'townfly') { pressKey('z'); return; }
	if (kind === 'dc') { daycareMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'dcdep') { daycareMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'nr') { nameRater.idx = +a; pressKey('z'); return; }
	if (kind === 'hp3') { halfParty.idx = +a; pressKey('z'); return; }
	if (kind === 'hp3go') { halfParty.idx = S.party.length; pressKey('z'); return; }
	if (kind === 'ms') { moveShop.idx = +a; pressKey('z'); return; }
	if (kind === 'mspick') { moveShop.idx = +a; pressKey('z'); return; }
	if (kind === 'msdel') { moveShop.idx = +a; pressKey('z'); return; }
	if (kind === 'msrel') { moveShop.idx = +a; pressKey('z'); return; }
	if (kind === 'ct' || kind === 'ctr' || kind === 'ctm' || kind === 'ctmv') { contestMenu.idx = +a; contestKey('z'); return; }
	if (kind === 'ct-next') { contestKey('z'); return; }
	if (kind === 'bb' || kind === 'bbf') { blendMenu.idx = +a; blendKey('z'); return; }
	if (kind === 'opt') { optionsMenu.idx = +a; Settings.cycle(OPTION_KEYS[+a], 1); syncBgmVolume(); return; }
	if (kind === 'optact') { optionsMenu.idx = OPTION_KEYS.length + (+a); runSaveAction(OPTION_ACTIONS[+a]?.id); return; }
	if (kind === 'ctl') { optionsMenu.idx = +a; optionsKey('z'); return; }
	if (kind === 'bkp') {
		const i = +a;
		if (i >= (optionsMenu.list || []).length) { optionsMenu.mode = 'main'; optionsMenu.idx = 0; optionsMenu.flash = null; }
		else restoreBackup(optionsMenu.list[i]);
		return;
	}
}
export const anyMenuOpen = () => partyMenu.open || shopMenu.open || bagMenu.open || pcMenu.open || starterMenu.open || ferryMenu.open || portalMenu.open || bpShopMenu.open || startMenu.open || playerMenu.open || deckSelect.open || cardsMenu.open || runMenu.open || friendsMenu.open || dexMenu.open || trainerCard.open || townMap.open || daycareMenu.open || nameRater.open || halfParty.open || moveShop.open || optionsMenu.open || questMenu.open || tradeMenu.open;

