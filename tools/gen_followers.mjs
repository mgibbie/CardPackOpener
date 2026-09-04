// gen_followers.mjs — batch-generate overworld FOLLOWER walk sheets for the
// ~855 species (the Ransei fakemon + newest dex) that have none and currently
// trail as a bobbing battle-mini.
//
// Output format (must match followSheet() in overworld/main.js): a 128x128 PNG,
// 4 rows in order DOWN / LEFT / RIGHT / UP, x 4 walk-frame columns, 32x32 cells.
// Input: each species' front battle sprite (overworld/data/pokemon/<sprite>).
//
// The generation itself is pluggable (PROVIDERS): a fully-working `stub` that
// tiles a downscaled front sprite (proves the whole pipeline with no API key),
// plus `pixellab` / `retrodiffusion` adapters that call the real APIs when their
// key is set. Everything else — enumerating targets, preprocessing the
// reference, assembling the sheet, resuming, rate-limiting, and the QA contact
// sheet — is provider-agnostic.
//
//   node tools/gen_followers.mjs --list                 # what's missing (count + ids)
//   node tools/gen_followers.mjs --limit=20             # stub a 20-sprite pilot
//   node tools/gen_followers.mjs --only=pignite,tepig   # just these ids
//   node tools/gen_followers.mjs --redo=pignite         # regenerate (ignore manifest)
//   node tools/gen_followers.mjs --contact              # (re)build the QA contact sheet
//   node tools/gen_followers.mjs --promote              # copy staged sheets -> live data
//
// RETRO DIFFUSION (recommended): a prepaid rdpk- key from retrodiffusion.ai.
//   export RETRODIFFUSION_API_KEY=rdpk-...
//   node tools/gen_followers.mjs --credits                                  # check balance
//   node tools/gen_followers.mjs --provider=retrodiffusion --check-cost     # price one image x targets
//   node tools/gen_followers.mjs --provider=retrodiffusion --probe --only=gigalion,vintera,twydra
//        # ^ generates a few AND saves RD's RAW output to tools/data/followers_probe/.
//          Open one: if RD's four-angle grid isn't 4 rows down/left/right/up x4 cols,
//          set RD_GRID_ROWS / RD_GRID_COLS / RD_ROW_ORDER env vars to match, then:
//   node tools/gen_followers.mjs --provider=retrodiffusion --limit=20       # pilot
//   node tools/gen_followers.mjs --provider=retrodiffusion                  # full run (resumes)
//   node tools/gen_followers.mjs --redo=<ids>                               # fix the misses
//   node tools/gen_followers.mjs --promote                                  # -> live data, then deploy owdata
// Tunables (env): RD_STYLE, RD_SIZE, RD_STRENGTH (img2img fidelity), RD_MIN_BALANCE.
//
// Staged output lives in tools/data/followers_out/ — nothing touches the live
// overworld/data/pokemon_follow until you review the contact sheet and --promote.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'overworld/data');
const SPRITES = path.join(DATA, 'pokemon');
const FOLLOW = path.join(DATA, 'pokemon_follow');
const WORK = path.join(HERE, 'data');
const STAGE_DEFAULT = path.join(WORK, 'followers_out');
const MANIFEST = path.join(WORK, 'followers_manifest.json');
const CONTACT = path.join(WORK, 'followers_contact.html');

// sheet geometry — DO NOT change without changing followSheet()/FOLLOW_ROW in main.js
const CELL = 32, COLS = 4, ROWS = ['down', 'left', 'right', 'up'], SHEET = CELL * COLS; // 128
const REF = 64; // the reference size handed to a generator

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = (n, d) => { const p = argv.find(a => a.startsWith('--' + n + '=')); return p ? p.slice(n.length + 3) : d; };
const provider = opt('provider', 'stub');
const limit = opt('limit') ? +opt('limit') : Infinity;
const only = opt('only') ? opt('only').split(',').map(s => s.trim()).filter(Boolean) : null;
const redo = opt('redo') ? opt('redo').split(',').map(s => s.trim()).filter(Boolean) : null;
const concurrency = opt('concurrency') ? +opt('concurrency') : 4;
const outDir = opt('out') ? path.resolve(opt('out')) : STAGE_DEFAULT;
const fakemonOnly = flag('fakemon');
const doList = flag('list');
const contactOnly = flag('contact');
const doPromote = flag('promote');
const doCredits = flag('credits');     // print Retro Diffusion balance and exit
const doCheckCost = flag('check-cost'); // free dry-run cost estimate for one target, then exit
const doProbe = flag('probe');         // also save the RAW provider output (to calibrate the layout remap)

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// ---------- Retro Diffusion (api.retrodiffusion.ai/v2) ----------
// Real contract: POST /v2/inferences returns {status:'accepted',task_id}; poll
// GET /v2/inferences/tasks/{id} until status 'succeeded' -> result.base64_images
// (base64 PNG, no data: prefix). Auth header X-RD-Token. Input images must be RGB
// (no alpha). The four-angle walking style returns a 4-direction walk cycle; with
// return_spritesheet:true it's a PNG grid.
let lastBalance = null; // RD remaining credit balance, updated after each success
const RD_BASE = 'https://api.retrodiffusion.ai/v2';
const RD_STYLE = process.env.RD_STYLE || 'rd_animation__four_angle_walking';
const RD_SIZE = +(process.env.RD_SIZE || 48);       // native frame size the style wants
const RD_STRENGTH = +(process.env.RD_STRENGTH || 0.62); // img2img: lower = truer to the front sprite
const RD_MIN_BALANCE = +(process.env.RD_MIN_BALANCE || 1); // stop the run if credits fall below this
// RD's four-angle sheet layout — the frame grid and which rows map to our
// down/left/right/up. UNVERIFIED until a --probe sample is inspected; override via
// env once known (RD_GRID_COLS, RD_GRID_ROWS, RD_ROW_ORDER="down,left,right,up").
const RD_GRID_COLS = +(process.env.RD_GRID_COLS || 4);
const RD_GRID_ROWS = +(process.env.RD_GRID_ROWS || 4);
const RD_ROW_ORDER = (process.env.RD_ROW_ORDER || 'down,left,right,up').split(',');
const PROBE_DIR = path.join(WORK, 'followers_probe');
async function rdFetch(pathname, key, init) {
	const res = await fetch(RD_BASE + pathname, { ...init, headers: { 'X-RD-Token': key, 'content-type': 'application/json', ...(init?.headers || {}) } });
	const text = await res.text();
	let json; try { json = JSON.parse(text); } catch { json = null; }
	if (!res.ok) throw new Error(`RD ${res.status} ${pathname}: ${text.slice(0, 200)}`);
	return json;
}
async function rdCredits(key) { return rdFetch('/v2/inferences/credits', key, { method: 'GET' }); }
async function rdInfer(key, body) {
	const acc = await rdFetch('/v2/inferences', key, { method: 'POST', body: JSON.stringify(body) });
	if (acc.result?.base64_images || acc.base64_images) return acc.result || acc; // some responses come back sync
	if (!acc.task_id) throw new Error('RD: no task_id in ' + JSON.stringify(acc).slice(0, 160));
	for (let i = 0; i < 120; i++) { // poll up to ~2 min
		await sleep(1000);
		const t = await rdFetch(`/v2/inferences/tasks/${acc.task_id}`, key, { method: 'GET' });
		if (t.status === 'succeeded') return t.result;
		if (t.status === 'failed') throw new Error('RD task failed: ' + JSON.stringify(t).slice(0, 160));
	}
	throw new Error('RD task timed out');
}
// remap RD's four-angle spritesheet PNG into our 128x128 down/left/right/up x4
async function rdAssemble(sheetB64, id) {
	const raw = Buffer.from(sheetB64, 'base64');
	if (doProbe) { fs.mkdirSync(PROBE_DIR, { recursive: true }); fs.writeFileSync(path.join(PROBE_DIR, id + '.raw.png'), raw); }
	const meta = await sharp(raw).metadata();
	const cw = Math.floor(meta.width / RD_GRID_COLS), ch = Math.floor(meta.height / RD_GRID_ROWS);
	const frames = [];
	for (const dir of ROWS) {                    // our output row order
		const rdRow = RD_ROW_ORDER.indexOf(dir);
		const row = rdRow < 0 ? 0 : rdRow;
		for (let c = 0; c < COLS; c++) {
			const src = Math.min(RD_GRID_COLS - 1, Math.round(c * (RD_GRID_COLS - 1) / (COLS - 1))); // sample COLS frames evenly
			const cell = await sharp(raw).extract({ left: src * cw, top: row * ch, width: cw, height: ch })
				.resize(CELL, CELL, { fit: 'contain', kernel: 'nearest', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
			frames.push(cell);
		}
	}
	return assembleSheet(frames);
}

// ---------- species + targets ----------
const species = JSON.parse(fs.readFileSync(path.join(DATA, 'species_index.json'), 'utf8'));
const hasOwnFollow = id => fs.existsSync(path.join(FOLLOW, id + '.png'));
const baseOf = id => (id.includes('_') ? id.split('_')[0] : null);
// mirrors followSheet(): a form falls back to its base's sheet, so it only counts
// as "missing" when neither the id nor its base has one
function needsFollow(id) {
	if (hasOwnFollow(id)) return false;
	const b = baseOf(id);
	if (b && hasOwnFollow(b)) return false;
	return true;
}
function computeTargets() {
	let t = Object.keys(species).filter(id => {
		const sp = species[id];
		if (!sp?.sprite || !fs.existsSync(path.join(SPRITES, sp.sprite))) return false; // need a front sprite to work from
		if (fakemonOnly && (sp.num > 0)) return false; // fakemon = non-standard dex number
		return needsFollow(id);
	});
	// if a form's BASE is itself a target, the base's sheet will cover the form — drop the form
	const set = new Set(t);
	t = t.filter(id => { const b = baseOf(id); return !(b && set.has(b)); });
	if (only) t = t.filter(id => only.includes(id));
	t.sort((a, b) => (species[a].num || 1e9) - (species[b].num || 1e9) || a.localeCompare(b));
	return t;
}

// ---------- image helpers ----------
// trim transparent margins, contain into REFxREF, nearest-neighbor (crisp pixels)
async function prepRef(spritePath) {
	let buf;
	try { buf = await sharp(spritePath).trim({ threshold: 12 }).png().toBuffer(); }
	catch { buf = fs.readFileSync(spritePath); }
	return sharp(buf).resize(REF, REF, { fit: 'contain', kernel: 'nearest', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}
// place 16 exactly-32x32 frame buffers (row-major: down x4, left x4, right x4, up x4) into a 128x128 sheet
async function assembleSheet(frames) {
	if (frames.length !== ROWS.length * COLS) throw new Error(`expected ${ROWS.length * COLS} frames, got ${frames.length}`);
	const composite = frames.map((input, i) => ({ input, left: (i % COLS) * CELL, top: Math.floor(i / COLS) * CELL }));
	return sharp({ create: { width: SHEET, height: SHEET, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composite).png().toBuffer();
}
const cell32 = buf => sharp(buf).resize(CELL, CELL, { fit: 'contain', kernel: 'nearest', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

// ---------- providers ----------
// each: { rpm, async gen({id,name,refBuf,spritePath}) -> 128x128 png Buffer }
const PROVIDERS = {
	// no API: a placeholder sheet — the front sprite shrunk into every cell, with a
	// 1px two-step bob so the contact-sheet walk preview actually moves. Proves the
	// pipeline end-to-end and is obviously-not-final art (never --promote the stub).
	stub: {
		rpm: 0,
		async gen({ refBuf }) {
			const flat = await cell32(refBuf);
			const bob = await sharp(refBuf).resize(CELL, CELL - 1, { fit: 'contain', kernel: 'nearest', background: { r: 0, g: 0, b: 0, alpha: 0 } })
				.extend({ top: 1, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
			const frames = [];
			for (let r = 0; r < ROWS.length; r++) for (let c = 0; c < COLS; c++) frames.push(c % 2 ? bob : flat);
			return assembleSheet(frames);
		},
	},
	// PixelLab (api.pixellab.ai/v2) — reference-driven. Endpoint/response schema is
	// per their docs; VALIDATE against a live key before a full run (kept behind the
	// key so `stub` stays the default, testable path).
	pixellab: {
		rpm: 30,
		async gen({ name, refBuf }) {
			const key = process.env.PIXELLAB_API_KEY;
			if (!key) throw new Error('set PIXELLAB_API_KEY');
			const res = await fetch('https://api.pixellab.ai/v2/create-character-with-4-directions', {
				method: 'POST',
				headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
				body: JSON.stringify({
					description: `top-down GBA overworld follower sprite of ${name}, 4-directional walk cycle, clean pixel art`,
					size: 64, view: 'top-down',
					reference_image: { type: 'base64', base64: refBuf.toString('base64') },
				}),
			});
			if (!res.ok) throw new Error('pixellab ' + res.status + ': ' + (await res.text()).slice(0, 160));
			const data = await res.json();
			return framesToSheet(data); // normalize the API's directional frames -> our 128x128 layout
		},
	},
	// Retro Diffusion (v2) — the four-angle walking style is a purpose-built
	// 4-direction walk cycle. img2img from the fakemon's front sprite keeps its
	// look; return_spritesheet gives a PNG grid we remap to our layout.
	retrodiffusion: {
		rpm: 10, // documented 10 req/min per key
		async gen({ id, name, refBuf, checkCost }) {
			const key = process.env.RETRODIFFUSION_API_KEY;
			if (!key) throw new Error('set RETRODIFFUSION_API_KEY (your rdpk- key)');
			// RD inputs must be RGB (no alpha) — flatten the reference onto white,
			// and ask RD to strip the background back out of the result
			const rgb = await sharp(refBuf).flatten({ background: '#ffffff' }).png().toBuffer();
			const body = {
				prompt: `${name}, full-body creature, simple`,
				prompt_style: RD_STYLE,
				width: RD_SIZE, height: RD_SIZE,
				num_images: 1,
				input_image: rgb.toString('base64'),
				strength: RD_STRENGTH,
				return_spritesheet: true,
				remove_bg: true,
			};
			if (checkCost) { body.check_cost = true; return rdInfer(key, body); } // returns cost estimate, no image
			const result = await rdInfer(key, body);
			if (result.remaining_balance != null) lastBalance = result.remaining_balance;
			const b64 = (result.base64_images || [])[0];
			if (!b64) throw new Error('RD returned no image: ' + JSON.stringify(result).slice(0, 160));
			return rdAssemble(b64, id);
		},
	},
};

// normalize a provider's returned frames into our DOWN/LEFT/RIGHT/UP x4 128x128
// sheet. Real APIs vary in shape (a packed sheet, a per-direction array, base64
// frames) — fill this in per provider once its live response is known. Throwing
// here keeps a mis-parsed response from silently writing a broken sheet.
async function framesToSheet(_data) {
	throw new Error('framesToSheet: wire this to the real API response shape (see the API docs / a sample response) before a full run');
}

// ---------- concurrency + rate limit ----------
const _starts = [];
async function rateGate(rpm) {
	if (!rpm) return;
	for (;;) {
		const now = Date.now();
		while (_starts.length && now - _starts[0] > 60000) _starts.shift();
		if (_starts.length < rpm) { _starts.push(now); return; }
		await sleep(60000 - (now - _starts[0]) + 10);
	}
}
async function pool(items, n, fn) {
	let idx = 0;
	const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
		while (idx < items.length) { const my = idx++; await fn(items[my], my); }
	});
	await Promise.all(runners);
}
async function withRetry(fn, tries = 3) {
	let err;
	for (let t = 0; t < tries; t++) { try { return await fn(); } catch (e) { err = e; await sleep(400 * 2 ** t); } }
	throw err;
}

// ---------- manifest ----------
function loadManifest() { try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { return {}; } }
function saveManifest(m) { fs.mkdirSync(WORK, { recursive: true }); fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 1)); }

// ---------- contact sheet ----------
function buildContact(manifest) {
	const rel = p => path.relative(WORK, p).replace(/\\/g, '/');
	const rows = Object.keys(manifest).filter(id => manifest[id].status === 'done').sort((a, b) => (species[a]?.num || 1e9) - (species[b]?.num || 1e9));
	const cards = rows.map(id => {
		const sp = species[id] || {};
		const front = fs.existsSync(path.join(SPRITES, sp.sprite || '')) ? rel(path.join(SPRITES, sp.sprite)) : '';
		const sheet = rel(path.join(outDir, id + '.png'));
		return `<div class="card"><div class="nm">${id}<span>#${sp.num ?? '?'} ${manifest[id].provider}</span></div>
	<div class="imgs"><img class="front" src="${front}" title="front sprite"><div class="walk" style="--s:url('${sheet}')" title="follower (down-walk)"></div><img class="raw" src="${sheet}" title="full 4x4 sheet"></div></div>`;
	}).join('\n');
	const html = `<!doctype html><meta charset="utf-8"><title>Follower sheets — ${rows.length}</title>
<style>
 body{background:#1a1f2b;color:#e7ecf5;font:13px system-ui,sans-serif;margin:16px}
 h1{font-size:16px} .grid{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}
 .card{background:#232a38;border:1px solid #33405a;border-radius:8px;padding:8px;width:150px}
 .nm{font-weight:600;display:flex;flex-direction:column} .nm span{font-weight:400;color:#8ea0bd;font-size:11px}
 .imgs{display:flex;align-items:flex-end;gap:8px;margin-top:6px;height:72px}
 img{image-rendering:pixelated} .front{max-height:64px;max-width:48px}
 .raw{height:64px;image-rendering:pixelated;opacity:.85}
 /* live down-walk preview: 32x32 window over row 0, stepped across 4 columns */
 .walk{width:32px;height:32px;transform:scale(2);transform-origin:bottom left;image-rendering:pixelated;
   background-image:var(--s);background-repeat:no-repeat;animation:w .6s steps(4) infinite}
 @keyframes w{from{background-position:0 0}to{background-position:-128px 0}}
</style>
<h1>Follower walk sheets — ${rows.length} generated (${provider})</h1>
<p>Front sprite · live down-walk preview · full 128×128 sheet. Flag any that are off, then re-run with <code>--redo=&lt;ids&gt;</code>.</p>
<div class="grid">${cards}</div>`;
	fs.mkdirSync(WORK, { recursive: true });
	fs.writeFileSync(CONTACT, html);
	log(`contact sheet → ${path.relative(ROOT, CONTACT)} (${rows.length} sheets)`);
}

// ---------- promote ----------
function promote(manifest) {
	fs.mkdirSync(FOLLOW, { recursive: true });
	let n = 0;
	for (const id of Object.keys(manifest)) {
		if (manifest[id].status !== 'done') continue;
		const src = path.join(outDir, id + '.png');
		if (!fs.existsSync(src)) continue;
		fs.copyFileSync(src, path.join(FOLLOW, id + '.png'));
		n++;
	}
	log(`promoted ${n} sheets → overworld/data/pokemon_follow/`);
	log('remember to deploy: npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --commit-dirty=true');
}

// ---------- main ----------
(async () => {
	const manifest = loadManifest();
	if (contactOnly) { buildContact(manifest); return; }
	if (doPromote) { promote(manifest); return; }
	if (doCredits) { // RD balance check
		const key = process.env.RETRODIFFUSION_API_KEY;
		if (!key) { console.error('set RETRODIFFUSION_API_KEY'); process.exit(1); }
		log('Retro Diffusion credits:', JSON.stringify(await rdCredits(key)));
		return;
	}

	const targets = computeTargets();
	if (doCheckCost) { // free dry-run: estimate the per-image cost on the first target
		const key = process.env.RETRODIFFUSION_API_KEY;
		if (!key) { console.error('set RETRODIFFUSION_API_KEY'); process.exit(1); }
		const id = (only ? targets.filter(t => only.includes(t)) : targets)[0];
		if (!id) { log('no target to price'); return; }
		const refBuf = await prepRef(path.join(SPRITES, species[id].sprite));
		const est = await PROVIDERS.retrodiffusion.gen({ id, name: species[id].name, refBuf, checkCost: true });
		log(`cost estimate for '${id}': ${JSON.stringify(est)}`);
		log(`≈ ${targets.length} targets → rough total ${(targets.length * (est.balance_cost || est.cost || 0)).toFixed(2)} credits (before retries)`);
		return;
	}
	if (doList) {
		log(`${targets.length} species need a follower sheet${fakemonOnly ? ' (fakemon only)' : ''}${only ? ' (filtered)' : ''}.`);
		log(targets.slice(0, 60).join(', ') + (targets.length > 60 ? `, … (+${targets.length - 60} more)` : ''));
		return;
	}
	if (!PROVIDERS[provider]) { console.error(`unknown provider '${provider}' (have: ${Object.keys(PROVIDERS).join(', ')})`); process.exit(1); }

	const redoSet = redo ? new Set(redo) : null;
	const queue = targets.filter(id => {
		if (redoSet) return redoSet.has(id);
		const m = manifest[id];
		return !(m && m.status === 'done' && fs.existsSync(path.join(outDir, id + '.png')));
	}).slice(0, limit);

	fs.mkdirSync(outDir, { recursive: true });
	log(`provider=${provider}  targets=${targets.length}  queued=${queue.length}  out=${path.relative(ROOT, outDir)}`);
	if (!queue.length) { log('nothing to do (all done or none match) — building contact sheet.'); buildContact(manifest); return; }

	let done = 0, failed = 0, since = 0, stopped = false;
	const P = PROVIDERS[provider];
	await pool(queue, concurrency, async (id) => {
		if (stopped) return; // low-balance kill switch tripped
		const sp = species[id];
		try {
			const refBuf = await prepRef(path.join(SPRITES, sp.sprite));
			await rateGate(P.rpm);
			let sheet = await withRetry(() => P.gen({ id, name: sp.name, refBuf, spritePath: path.join(SPRITES, sp.sprite) }));
			const meta = await sharp(sheet).metadata();
			if (meta.width !== SHEET || meta.height !== SHEET) sheet = await sharp(sheet).resize(SHEET, SHEET, { kernel: 'nearest' }).png().toBuffer();
			fs.writeFileSync(path.join(outDir, id + '.png'), sheet);
			manifest[id] = { status: 'done', provider, name: sp.name, num: sp.num };
			done++;
		} catch (e) {
			manifest[id] = { status: 'failed', provider, name: sp.name, num: sp.num, error: String(e.message || e).slice(0, 200) };
			failed++;
		}
		if (++since >= 10) { saveManifest(manifest); since = 0; } // checkpoint for resume
		if ((done + failed) % 25 === 0) log(`  ${done + failed}/${queue.length}  (ok ${done}, fail ${failed})${lastBalance != null ? `  bal ${lastBalance}` : ''}`);
		if (lastBalance != null && lastBalance < RD_MIN_BALANCE && !stopped) { stopped = true; log(`\n⚠ RD balance ${lastBalance} below floor ${RD_MIN_BALANCE} — stopping (resume later, manifest saved).`); }
	});
	saveManifest(manifest);
	buildContact(manifest);
	log(`\nDone: ${done} generated, ${failed} failed. Review ${path.relative(ROOT, CONTACT)}, then --promote.`);
	if (failed) log(`Re-run failures: node tools/gen_followers.mjs --provider=${provider} --redo=${Object.keys(manifest).filter(k => manifest[k].status === 'failed').slice(0, 20).join(',')}`);
})();
