// clip.js — CLIPS (owner, 2026-11-19): a replay link that starts at a moment. Every game's replay viewer reads its start
// position from the page URL (`&t=<position>`: a frame, an action, a turn or a step, whatever that viewer counts in) and
// has a "Copy link to this moment" button that copies its own replay URL with `t` set to where the viewer is now.
// One place for the URL handling, so every viewer reads and writes `t` the same way.

// the start position the page was opened at (a whole number >= 0), or null when there is none.
// `max` (optional): the last valid position — a larger t is clamped to it.
export function clipStart(max) {
	let raw = null;
	try { raw = new URLSearchParams(location.search).get('t'); } catch { raw = null; }
	if (raw == null || !/^\d{1,9}$/.test(raw)) return null;
	const t = +raw;
	return Number.isFinite(max) ? Math.max(0, Math.min(Math.floor(max), t)) : t;
}

// the URL of this page with t=<pos> (and any `extra` params set, `null` deletes one); the page's own replay params kept
export function clipUrl(pos, extra) {
	const u = new URL(location.href);
	u.hash = '';
	for (const [k, v] of Object.entries(extra || {})) { if (v == null) u.searchParams.delete(k); else u.searchParams.set(k, String(v)); }
	u.searchParams.set('t', String(Math.max(0, Math.floor(+pos) || 0)));
	return u.toString();
}

// copy a link to the clipboard (falls back to a prompt the player can copy from); resolves to the link
export async function copyClip(pos, extra) {
	const url = clipUrl(pos, extra);
	try { window.__lastClip = url; } catch { /* the tests read it */ }
	try { await navigator.clipboard.writeText(url); }
	catch { try { window.prompt('Copy this link to the moment:', url); } catch { /* headless */ } }
	return url;
}

// a "Copy link to this moment" button: `getPos()` says where the viewer is now (and `getExtra()` any params beside t).
// It is a real <button>, so a mouse, a tap, the keyboard (Enter/Space) and the site's pad navigator all press it.
export function clipButton(getPos, opts = {}) {
	const b = document.createElement('button');
	b.type = 'button';
	b.className = opts.className || 'clip-btn';
	b.dataset.clip = '1';
	b.textContent = opts.label || '🔗 Copy link to this moment';
	b.title = 'Copy a link that opens this replay right here';
	if (opts.style) b.style.cssText = opts.style;
	b.addEventListener('click', async (e) => {
		e.preventDefault(); e.stopPropagation();
		const url = await copyClip(getPos(), opts.getExtra ? opts.getExtra() : null);
		const was = b.textContent;
		b.textContent = '✓ Link copied';
		setTimeout(() => { b.textContent = was; }, 1600);
		if (opts.onCopied) opts.onCopied(url);
	});
	return b;
}

// the same button floating over a canvas game (the overworld's replay viewers draw everything on a canvas): fixed to the
// bottom right corner, so a mouse or a tap reaches it; the game's own key for it (C / the pad's secondary) calls copyClip.
// Remove it with .remove() when the replay closes.
export function floatingClipButton(getPos, opts = {}) {
	const old = document.getElementById(opts.id || 'clip-float');
	if (old) old.remove();
	const b = clipButton(getPos, { ...opts, style: 'position:fixed;right:12px;bottom:12px;z-index:60;padding:8px 12px;border-radius:9px;border:1px solid #6a5f8a;background:rgba(20,16,36,.88);color:#e8e0d0;font:600 13px system-ui,sans-serif;cursor:pointer' });
	b.id = opts.id || 'clip-float';
	document.body.appendChild(b);
	return b;
}
