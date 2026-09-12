// webgl-guard.js — Battlecards is the only Magepunk game drawn with WebGL
// (three.js r165 needs a WebGL 2 context; the overworld and Pair of Pears are
// plain 2D canvas). When the browser can't hand out a context — graphics
// acceleration off or the GPU blocklisted (Flatpak browsers on a Steam Deck,
// remote desktops, VMs), a privacy setting that blocks WebGL, or a crashed GPU
// process — three's WebGLRenderer constructor throws at module top level and
// the page just sits there: the static HUD, no table, no cards, no message.
//
// createRenderer wraps that constructor so the failure becomes (a) a readable
// screen that says what's missing and how to turn it back on, with the
// browser's own GL facts for a screenshot, and (b) a crash beacon to
// /errors.html. It fires BEFORE site/topbar.js has installed its error
// listener (module scripts run in document order and game.js comes first), so
// it posts the beacon itself in the same shape topbar.js uses.

// what this browser can actually do, probed only after the real renderer failed
function probeGL() {
	const out = { gl2: false, gl1: false, gpu: '' };
	try {
		const c = document.createElement('canvas');
		let gl = c.getContext('webgl2');
		if (gl) out.gl2 = true;
		else gl = c.getContext('webgl') || c.getContext('experimental-webgl');
		if (gl) {
			out.gl1 = true;
			const dbg = gl.getExtension('WEBGL_debug_renderer_info');
			out.gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : String(gl.getParameter(gl.RENDERER) || '');
		}
	} catch (e) { /* a throwing getContext is just another "no" */ }
	return out;
}

function beacon(msg, where) {
	try {
		if (typeof window.reportErr === 'function') { window.reportErr(msg, where); return; }
		const body = JSON.stringify({ action: 'err', msg: String(msg).slice(0, 300), where: String(where).slice(0, 200), page: location.pathname, ua: navigator.userAgent.slice(0, 120) });
		if (navigator.sendBeacon) navigator.sendBeacon('/api/mp', new Blob([body], { type: 'application/json' }));
		else fetch('/api/mp', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
	} catch (e) { /* the screen below is the real deliverable; the beacon is best-effort */ }
}

const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// Full-screen explainer. `err` is whatever the renderer constructor threw.
export function showWebGLHelp(err) {
	const gl = probeGL();
	const ua = navigator.userAgent;
	const brave = !!(navigator.brave && typeof navigator.brave.isBrave === 'function');
	const chromium = brave || /Chrome\//.test(ua);
	const scheme = brave ? 'brave://' : chromium ? 'chrome://' : '';
	const software = /llvmpipe|swiftshader|software/i.test(gl.gpu);
	const details = [
		'WebGL 2: ' + (gl.gl2 ? 'yes' : 'NO'),
		'WebGL 1: ' + (gl.gl1 ? 'yes' : 'NO'),
		'GPU: ' + (gl.gpu || 'unknown'),
		'Error: ' + ((err && err.message) || String(err || 'no context')),
		'Browser: ' + ua,
		'Screen: ' + screen.width + 'x' + screen.height + ' @' + (window.devicePixelRatio || 1),
	].join('\n');
	beacon('WebGL unavailable: ' + ((err && err.message) || err) + ' | gl2:' + (gl.gl2 ? 'y' : 'n') + ' gl1:' + (gl.gl1 ? 'y' : 'n') + ' gpu:' + (gl.gpu || '?'), 'webgl-guard.js');

	const why = gl.gl1 && !gl.gl2
		? 'This browser only offers WebGL 1, and the card table needs WebGL 2.'
		: software
			? 'The browser is drawing with a software renderer (no GPU), and it refuses to run WebGL that way.'
			: 'The browser refused to create a WebGL 2 canvas.';
	const steps = [];
	if (chromium) {
		steps.push(`<b>Turn graphics acceleration on.</b> ${scheme ? `<code>${scheme}settings/system</code>` : 'Settings → System'} → “Use graphics acceleration when available” → relaunch the browser.`);
		steps.push(`<b>Check what the browser thinks of your GPU.</b> Open <code>${scheme || 'chrome://'}gpu</code>: if WebGL / WebGL2 read “Software only” or “Unavailable”, enable “Override software rendering list” at <code>${scheme || 'chrome://'}flags/#ignore-gpu-blocklist</code> and relaunch.`);
	} else {
		steps.push('<b>Turn hardware acceleration on</b> in the browser’s settings (Firefox: Settings → General → Performance) and restart it.');
	}
	if (brave) steps.push('<b>Brave Shields:</b> click the lion icon for this site and set “Block fingerprinting” to Standard (aggressive blocking disables WebGL in some versions), then reload.');
	steps.push('<b>Steam Deck / Flatpak browsers:</b> if acceleration is already on and it still fails, the sandboxed browser may not be reaching the GPU — try Firefox from the Discover store, or Chrome/Brave installed outside Flatpak.');
	steps.push('<b>Still stuck?</b> Tap “Copy details” below and send them to us — it tells us exactly what your browser reported.');

	const box = document.createElement('div');
	box.id = 'webgl-help';
	box.innerHTML = `
		<style>
			#webgl-help { position: fixed; inset: 0; z-index: 1000; overflow: auto; background: rgba(13,10,20,0.97);
				color: #e8e2f4; font-family: 'Segoe UI', system-ui, sans-serif; user-select: text; -webkit-user-select: text;
				touch-action: auto; display: flex; align-items: flex-start; justify-content: center; padding: 24px 16px; box-sizing: border-box; }
			#webgl-help .wh-card { max-width: 560px; width: 100%; background: rgba(30,22,48,0.96); border: 1px solid #8f6fff; border-radius: 14px;
				padding: 20px 22px; box-shadow: 0 14px 44px rgba(0,0,0,0.6); margin: auto; }
			#webgl-help h1 { font-size: 20px; margin: 0 0 6px; color: #f4eede; letter-spacing: .5px; }
			#webgl-help p { font-size: 14px; line-height: 1.5; margin: 8px 0; color: #d8d0ee; }
			#webgl-help ol { padding-left: 20px; margin: 10px 0; }
			#webgl-help li { font-size: 13.5px; line-height: 1.5; margin: 7px 0; color: #d8d0ee; }
			#webgl-help li b { color: #ffd25f; }
			#webgl-help code { background: #1a1428; border: 1px solid #4a3f6b; border-radius: 5px; padding: 1px 5px; font-size: 12.5px; color: #9fd0ff; }
			#webgl-help pre { background: #120d1e; border: 1px solid #4a3f6b; border-radius: 8px; padding: 9px 11px; font-size: 11.5px;
				line-height: 1.45; color: #b9b0d4; white-space: pre-wrap; word-break: break-word; margin: 10px 0; }
			#webgl-help .wh-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
			#webgl-help button, #webgl-help a.wh-btn { display: inline-block; padding: 9px 16px; border-radius: 8px; border: 1px solid #5a4a8a; background: #3a2e5c;
				color: #e8e2f4; font-size: 13.5px; font-weight: 600; cursor: pointer; text-decoration: none; }
			#webgl-help button.primary { background: #6b4fd4; border-color: #6b4fd4; color: #fff; }
			#webgl-help button:hover, #webgl-help a.wh-btn:hover { filter: brightness(1.15); }
		</style>
		<div class="wh-card">
			<h1>Battlecards needs WebGL 2</h1>
			<p>${esc(why)} The card table is drawn in 3D, so nothing can be shown without it. The overworld and Pair of Pears use a plain 2D canvas, which is why they still run fine.</p>
			<ol>${steps.map(s => `<li>${s}</li>`).join('')}</ol>
			<pre id="wh-details">${esc(details)}</pre>
			<div class="wh-actions">
				<button class="primary" id="wh-retry">Try again</button>
				<button id="wh-copy">Copy details</button>
				<a class="wh-btn" href="start.html">Back to modes</a>
				<a class="wh-btn" href="../overworld/">Play the RPG instead</a>
			</div>
		</div>`;
	document.body.appendChild(box);
	box.querySelector('#wh-retry').addEventListener('click', () => location.reload());
	box.querySelector('#wh-copy').addEventListener('click', async ev => {
		const b = ev.currentTarget;
		try { await navigator.clipboard.writeText(details); b.textContent = 'Copied ✓'; }
		catch (e) {
			// no clipboard (insecure context / permission): select the text so a long-press or Ctrl+C works
			const pre = box.querySelector('#wh-details');
			const r = document.createRange(); r.selectNodeContents(pre);
			const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
			b.textContent = 'Select + copy the text above';
		}
	});
	return box;
}

// Drop-in for `new THREE.WebGLRenderer(opts)`: on failure, explain on screen,
// beacon the crash, and rethrow so the caller's module stops evaluating the
// same way it always did (nothing downstream can run without a renderer).
export function createRenderer(THREE, opts) {
	try {
		return new THREE.WebGLRenderer(opts);
	} catch (err) {
		try { showWebGLHelp(err); } catch (e) { console.error('webgl-guard: could not show help screen', e); }
		throw err;
	}
}
