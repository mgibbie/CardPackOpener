// gamepad_core_test.mjs — the shared controller core (site/gamepad.js), Phase 0 of
// Plans/CONTROLLER_SUPPORT_PLAN.md. Pure node, fake pads: headless Chrome has no
// controllers, so every surface's test drives the core the same way.
//
//   node overworld/tests/gamepad_core_test.mjs
import { createGamepad, startGamepad, stickDirection, controllerKind, ACTIONS } from '../../site/gamepad.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// a fake standard-mapping pad: set buttons by index, sticks by axis
function fakePad(id = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', index = 0) {
	const p = { id, index, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
	p.set = (i, on) => { p.buttons[i] = { pressed: !!on, value: on ? 1 : 0 }; return p; };
	p.stick = (x, y) => { p.axes[0] = x; p.axes[1] = y; return p; };
	return p;
}
function rig(opts = {}) {
	let pads = [];
	const log = [];
	const pad = createGamepad({
		readPads: () => pads,
		onPress: (a, i) => log.push(i.repeat ? `repeat:${a}` : `press:${a}`),
		onRelease: (a, i) => log.push(i.forced ? `forced:${a}` : `release:${a}`),
		onConnect: e => log.push(`connect:${e.kind}`),
		onDisconnect: () => log.push('disconnect'),
		...opts,
	});
	return { pad, log, setPads: p => { pads = p; }, take: () => log.splice(0) };
}

// ---------- pure helpers ----------
A(stickDirection(0.2, 0.2) === null, 'a stick inside the radial deadzone is centred');
A(stickDirection(0.9, 0.1) === 'right' && stickDirection(-0.1, -0.8) === 'up' && stickDirection(0.3, 0.7) === 'down', 'the dominant axis picks the direction');
A(controllerKind('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)') === 'xbox'
	&& controllerKind('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)') === 'playstation'
	&& controllerKind('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)') === 'switch'
	&& controllerKind('Some USB Pad') === 'generic', 'the controller family is read from its id');
A(['confirm', 'cancel', 'menu', 'select', 'prev', 'next', 'context', 'secondary', 'up', 'down', 'left', 'right'].every(a => ACTIONS.includes(a)), 'the logical action vocabulary is complete');

// ---------- edges ----------
{
	const r = rig(), p = fakePad();
	r.setPads([p]);
	r.pad.poll(0);
	A(r.take().join() === 'connect:xbox', 'a new pad reports connect, with its family');
	p.set(0, true); r.pad.poll(16); r.pad.poll(32); r.pad.poll(500);
	A(r.take().join() === 'press:confirm', 'holding A fires ONE press, never a repeat (only directions repeat)');
	A(r.pad.held('confirm'), '...and reads as held');
	p.set(0, false); r.pad.poll(516);
	A(r.take().join() === 'release:confirm' && !r.pad.held('confirm'), 'letting go fires one release');
	p.set(1, true).set(9, true); r.pad.poll(600);
	A(r.take().sort().join() === 'press:cancel,press:menu', 'B and Start map to cancel and menu');
	p.set(1, false).set(9, false); r.pad.poll(616); r.take();
}

// ---------- direction repeat ----------
{
	const r = rig(), p = fakePad();
	r.setPads([p]); r.pad.poll(0); r.take();
	p.set(13, true);                                   // d-pad down, held
	for (let t = 0; t <= 520; t += 10) r.pad.poll(1000 + t);
	const ev = r.take();
	A(ev[0] === 'press:down', 'a held direction presses at once', ev.slice(0, 2).join());
	const repeats = ev.filter(e => e === 'repeat:down').length;
	// press at 1000, first repeat at >=1250, then every 90ms up to 1520: 1250,1340,1430,1520
	A(repeats === 4, 'then repeats after 250ms, every 90ms', String(repeats));
	A(r.pad.direction() === 'down', 'direction() reports the held direction for walking');
	p.set(13, false); r.pad.poll(1600);
	A(r.pad.direction() === null && r.take().join() === 'release:down', 'releasing it stops the walk');
}

// ---------- the left stick, deadzone, and newest-direction-wins ----------
{
	const r = rig(), p = fakePad();
	r.setPads([p]); r.pad.poll(0); r.take();
	p.stick(0.25, 0.1); r.pad.poll(10);
	A(r.take().length === 0, 'a drifting stick inside the deadzone does nothing');
	p.stick(0.9, 0); r.pad.poll(20);
	A(r.take().join() === 'press:right' && r.pad.direction() === 'right', 'pushing the stick right presses right');
	p.set(12, true); r.pad.poll(30);                   // d-pad up while the stick still holds right
	A(r.pad.direction() === 'up', 'the most recently pressed direction wins (d-pad over stick)');
	p.set(12, false); r.pad.poll(40);
	A(r.pad.direction() === 'right', '...and letting it go falls back to the still-held stick');
	p.stick(0, 0); r.pad.poll(50); r.take();
}

// ---------- blur: release everything, and don't re-fire until let go ----------
{
	const r = rig(), p = fakePad();
	r.setPads([p]); r.pad.poll(0); r.take();
	p.stick(0, -1).set(1, true); r.pad.poll(10); r.take();   // walking up, holding B (run)
	r.pad.releaseAll();
	A(r.take().sort().join() === 'forced:cancel,forced:up', 'blur releases every held action (marked forced)');
	A(!r.pad.held('up') && r.pad.direction() === null, 'nothing reads as held after blur');
	r.pad.poll(20); r.pad.poll(400);                          // back on the tab, stick still pushed
	A(r.take().length === 0, 'returning with the stick still pushed does NOT fire a surprise step');
	p.stick(0, 0).set(1, false); r.pad.poll(420);
	p.stick(0, -1); r.pad.poll(440);
	A(r.take().join() === 'press:up', 'after a physical release it presses normally again');
}

// ---------- disconnect ----------
{
	const r = rig(), p = fakePad();
	r.setPads([p]); r.pad.poll(0); r.take();
	p.set(0, true); r.pad.poll(10); r.take();
	r.setPads([]); r.pad.poll(20);
	const ev = r.take();
	A(ev.includes('disconnect') && ev.includes('forced:confirm'), 'unplugging releases what it held', ev.join());
	A(!r.pad.connected(), '...and reads as disconnected');
	r.setPads([p]); r.pad.poll(30);
	A(r.take().join() === 'connect:xbox,press:confirm', 'plugging back in with A held presses once, cleanly', '');
}

// ---------- two pads merge; a released-by-one button stays held by the other ----------
{
	const r = rig(), a = fakePad('Xbox', 0), b = fakePad('DualSense 054c', 1);
	r.setPads([a, b]); r.pad.poll(0); r.take();
	a.set(0, true); b.set(0, true); r.pad.poll(10);
	A(r.take().join() === 'press:confirm', 'two pads pressing A is one press');
	a.set(0, false); r.pad.poll(20);
	A(r.take().length === 0 && r.pad.held('confirm'), 'one letting go while the other holds is no release');
	b.set(0, false); r.pad.poll(30); r.take();
}

// ---------- Nintendo A/B swap ----------
{
	const r = rig({ swapAB: true }), p = fakePad('Pro Controller 057e');
	r.setPads([p]); r.pad.poll(0); r.take();
	p.set(1, true); r.pad.poll(10);
	A(r.take().join() === 'press:confirm', 'with swapAB, the right face button confirms');
	p.set(1, false).set(0, true); r.pad.poll(20);
	A(r.take().join() === 'release:confirm,press:cancel', '...and the bottom one cancels');
}

// ---------- browser wiring: rAF poller + blur/visibility release ----------
{
	const listeners = {}, docListeners = {};
	let frameCb = null;
	globalThis.requestAnimationFrame = cb => { frameCb = cb; return 1; };
	globalThis.cancelAnimationFrame = () => { frameCb = null; };
	globalThis.addEventListener = (t, f) => { (listeners[t] ||= []).push(f); };
	globalThis.removeEventListener = (t, f) => { listeners[t] = (listeners[t] || []).filter(x => x !== f); };
	globalThis.document = { hidden: false, addEventListener: (t, f) => { (docListeners[t] ||= []).push(f); }, removeEventListener: (t, f) => { docListeners[t] = (docListeners[t] || []).filter(x => x !== f); } };
	const p = fakePad(), log = [];
	const pad = startGamepad({ readPads: () => [p], onPress: a => log.push('press:' + a), onRelease: (a, i) => log.push((i.forced ? 'forced:' : 'release:') + a) });
	frameCb(0);
	p.set(0, true); frameCb(16);
	A(log.join() === 'press:confirm', 'startGamepad polls every animation frame');
	listeners.blur.forEach(f => f());
	A(log.includes('forced:confirm'), 'a window blur releases held actions');
	p.set(0, false); frameCb(32); p.stick(1, 0); frameCb(48);
	document.hidden = true; docListeners.visibilitychange.forEach(f => f());
	A(log.includes('forced:right'), 'a hidden tab releases them too');
	pad.stop();
	A(!listeners.blur.length && !docListeners.visibilitychange.length && frameCb === null, 'stop() removes its listeners and the poller');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
