// tab_lock.js — only ONE tab plays the overworld at a time.
//
// Two tabs of the game share one localStorage save. Several modules cache their
// record when the game starts and write the whole cached copy back on the next
// change (the party above all — it is live state, not a copy of storage), so
// an older tab writing after a newer one puts the older save back. 2026-10-03:
// Instinct lost 96 trainer wins and the Mineral badge to stale writes.
//
// When a NEWER overworld tab starts, every older tab pauses: a blocking notice
// ("This game is open in another tab — this one is paused. Reload to play
// here."), every write to a synced save key is dropped, and pushOw stops (it
// checks isTabPaused). Reloading the paused tab makes it the newest, which
// pauses the other. A single tab never pauses. BroadcastChannel only — where it
// doesn't exist the game behaves as before.
const CHANNEL = 'magepunk-ow';
const me = { id: Math.random().toString(36).slice(2) + Date.now().toString(36), t: Date.now() };
let paused = false;
let channel = null;

export function isTabPaused() { return paused; }

// keys: the synced save keys (OW_KEYS); onPause: called once when this tab pauses
export function startTabLock({ keys = [], onPause } = {}) {
	if (channel || typeof BroadcastChannel === 'undefined') return;
	const blocked = new Set(keys);
	try { channel = new BroadcastChannel(CHANNEL); } catch (e) { return; }
	const newer = m => m.t > me.t || (m.t === me.t && m.id > me.id);
	channel.onmessage = e => {
		const m = e && e.data;
		if (!m || m.type !== 'hello' || m.id === me.id || !newer(m)) return;
		pause();
	};
	function pause() {
		if (paused) return;
		paused = true;
		// drop every write to the synced save from this tab, whoever makes it —
		// safeSave, the story store, money, a raw localStorage.setItem
		try {
			const proto = Object.getPrototypeOf(localStorage);
			const set = proto.setItem, rm = proto.removeItem;
			proto.setItem = function (k, v) { if (this === localStorage && blocked.has(String(k))) return; return set.call(this, k, v); };
			proto.removeItem = function (k) { if (this === localStorage && blocked.has(String(k))) return; return rm.call(this, k); };
		} catch (e) {}
		try { showPausedNotice(); } catch (e) {}
		try { onPause && onPause(); } catch (e) {}
	}
	try { channel.postMessage({ type: 'hello', ...me }); } catch (e) {}
}

function showPausedNotice() {
	if (typeof document === 'undefined' || document.getElementById('tab-paused')) return;
	const d = document.createElement('div');
	d.id = 'tab-paused';
	d.setAttribute('role', 'alertdialog');
	d.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(10,8,24,0.86);color:#fff;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:16px';
	const box = document.createElement('div');
	box.style.cssText = 'max-width:420px;background:#1d1838;border:2px solid #6c5ce7;border-radius:12px;padding:20px 22px';
	const p = document.createElement('p');
	p.style.margin = '0 0 14px';
	p.textContent = 'This game is open in another tab — this one is paused. Reload to play here.';
	const b = document.createElement('button');
	b.type = 'button';
	b.textContent = 'Reload to play here';
	b.style.cssText = 'font:inherit;padding:8px 16px;border-radius:8px;border:0;background:#6c5ce7;color:#fff;cursor:pointer';
	b.addEventListener('click', () => location.reload());
	box.append(p, b);
	d.append(box);
	document.body.append(d);
	// the game behind keeps no input: keys stop here
	addEventListener('keydown', e => { if (paused && e.key !== 'F5') { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
}
