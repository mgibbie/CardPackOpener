// itemicon.js — item icons for the bag menu + the inventory page.
// Most items use a real 24x24 sprite (data extracted from the pokéemerald /
// pokéemerald-expansion decomps into overworld/item_icons/, indexed by
// item_icons_index.json). Items with no decomp art (apricorns, shards, X-items,
// Crystal key items, vitamins, mints…) fall back to a crisp procedural icon
// drawn by category, so every item shows *something*.

let INDEX = {};
let _ready = null;
export function loadItemIcons(base = '') {
	if (!_ready) _ready = fetch(base + 'item_icons_index.json').then(r => r.json()).then(j => { INDEX = j || {}; }).catch(() => { INDEX = {}; });
	return _ready;
}
// the real-sprite file for an id, or null (→ use drawCategoryIcon)
export function itemIconFile(id) { return INDEX[id] || null; }

// ---- procedural category icons (canvas), for items with no decomp sprite ----
// draws into a `size`×`size` box at (x,y). Kept simple + readable at 24-32px.
export function drawCategoryIcon(ctx, kind, id, x, y, size) {
	const s = size, cx = x + s / 2, cy = y + s / 2;
	ctx.save();
	ctx.translate(x, y);
	const disc = (col, r = s * 0.42) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(s / 2, s / 2, r, 0, Math.PI * 2); ctx.fill(); };
	const APRICOT = { redapricorn: '#d64b3f', bluapricorn: '#3f7fd6', ylwapricorn: '#e6c040', grnapricorn: '#4faf55', whtapricorn: '#e8e8e8', blkapricorn: '#3a3a44', pnkapricorn: '#e88fc0' };
	const SHARD = { redshard: '#d64b3f', blueshard: '#3f7fd6', yellowshard: '#e6c040', greenshard: '#4faf55' };
	const SCARF = { redscarf: '#d64b3f', bluescarf: '#3f7fd6', greenscarf: '#4faf55', pinkscarf: '#e88fc0', yellowscarf: '#e6c040' };
	if (kind === 'apricorn' || APRICOT[id]) {
		disc(APRICOT[id] || '#c98a3a', s * 0.36);
		ctx.fillStyle = '#5a3f22'; ctx.fillRect(s / 2 - 1, s * 0.12, 2, s * 0.18); // stem
	} else if (kind === 'sell' && SHARD[id]) { // elemental shard — a gem
		ctx.fillStyle = SHARD[id]; ctx.beginPath(); ctx.moveTo(s / 2, s * 0.16); ctx.lineTo(s * 0.8, s / 2); ctx.lineTo(s / 2, s * 0.84); ctx.lineTo(s * 0.2, s / 2); ctx.closePath(); ctx.fill();
		ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.stroke();
	} else if (kind === 'sell') { disc('#c9b070', s * 0.34); ctx.fillStyle = '#a68a48'; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.16, 0, Math.PI * 2); ctx.fill(); // nugget/salt
	} else if (kind === 'vitamin') { // drink bottle
		ctx.fillStyle = '#f06a9a'; ctx.fillRect(s * 0.34, s * 0.28, s * 0.32, s * 0.5);
		ctx.fillStyle = '#c94a7a'; ctx.fillRect(s * 0.4, s * 0.16, s * 0.2, s * 0.14);
	} else if (kind === 'mint') { ctx.fillStyle = '#7fd6a0'; ctx.beginPath(); ctx.ellipse(s / 2, s / 2, s * 0.3, s * 0.18, -0.6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#3f8f5f'; ctx.beginPath(); ctx.moveTo(s * 0.3, s * 0.66); ctx.lineTo(s * 0.7, s * 0.34); ctx.stroke();
	} else if (kind === 'flute') { ctx.fillStyle = id === 'blackflute' ? '#3a3a44' : '#e8e8e8'; ctx.fillRect(s * 0.2, s * 0.44, s * 0.6, s * 0.12); ctx.fillStyle = '#8a6a3a'; for (let i = 0; i < 3; i++) ctx.fillRect(s * (0.3 + i * 0.15), s * 0.4, 2, 3);
	} else if (kind === 'form' || id === 'riftprism') { ctx.fillStyle = '#a860e0'; ctx.beginPath(); ctx.moveTo(s / 2, s * 0.16); ctx.lineTo(s * 0.78, s * 0.6); ctx.lineTo(s * 0.22, s * 0.6); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(s * 0.46, s * 0.3, 3, s * 0.24);
	} else if (kind === 'xitem') { disc('#e0574f', s * 0.4); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s * 0.36, s * 0.36); ctx.lineTo(s * 0.64, s * 0.64); ctx.moveTo(s * 0.64, s * 0.36); ctx.lineTo(s * 0.36, s * 0.64); ctx.stroke();
	} else if (kind === 'misc' && SCARF[id]) { ctx.fillStyle = SCARF[id]; ctx.fillRect(s * 0.22, s * 0.4, s * 0.56, s * 0.12); ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.52); ctx.lineTo(s * 0.4, s * 0.76); ctx.lineTo(s * 0.6, s * 0.76); ctx.closePath(); ctx.fill();
	} else if (kind === 'key' || kind === 'charm' || kind === 'seeker' || kind === 'rod') { // key
		ctx.strokeStyle = '#e6c040'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(s * 0.38, s * 0.4, s * 0.14, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(s * 0.48, s * 0.5); ctx.lineTo(s * 0.72, s * 0.74); ctx.moveTo(s * 0.66, s * 0.68); ctx.lineTo(s * 0.74, s * 0.6); ctx.stroke();
	} else if (kind === 'held' || kind === 'cure') { disc('#7fae4a', s * 0.3); ctx.fillStyle = '#e8404d'; ctx.beginPath(); ctx.arc(s / 2, s * 0.42, s * 0.12, 0, Math.PI * 2); ctx.fill(); // generic berry-ish held
	} else { // default: a wrapped item / box
		ctx.fillStyle = '#c9a24a'; ctx.fillRect(s * 0.24, s * 0.3, s * 0.52, s * 0.44);
		ctx.strokeStyle = '#8a6a2a'; ctx.strokeRect(s * 0.24, s * 0.3, s * 0.52, s * 0.44);
		ctx.fillStyle = '#8a6a2a'; ctx.fillRect(s * 0.46, s * 0.3, s * 0.08, s * 0.44);
	}
	ctx.restore();
}
