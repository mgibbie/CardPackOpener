// Local dev server for the account system: static files + the real /api/mp function
// handler. Production runs on Cloudflare with a D1 binding (env.MP_DB); here we
// hand the handler the same interface backed by a local SQLite file, so it runs
// the identical code and the identical SQL.
//
//   node mp-dev-server.mjs [port]     (default 8767)
//   MP_DEV_DB=/path/to.sqlite  to keep accounts between runs (default: temp file)
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';

// Minimal stand-in for a Cloudflare D1 binding: prepare().bind().first()/.run(),
// which is the whole surface mp.mjs uses.
const dbFile = process.env.MP_DEV_DB || join(tmpdir(), 'mp-dev-users.sqlite');
const sqlite = new DatabaseSync(dbFile);
sqlite.exec('CREATE TABLE IF NOT EXISTS mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = {
	prepare(sql) {
		const stmt = sqlite.prepare(sql);
		const bound = [];
		const api = {
			bind(...args) { bound.length = 0; bound.push(...args); return api; },
			async first() { return stmt.get(...bound) ?? null; },
			async run() { return stmt.run(...bound); },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
console.log('accounts db:', dbFile);

// bundle the function exactly like the Cloudflare build does, then import it
const bundle = join(mkdtempSync(join(tmpdir(), 'mp-fn-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: ['server/mp.mjs'],
	bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
const { default: handler } = await import('file://' + bundle.replace(/\\/g, '/'));

const MIME = {
	'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
	'.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
	'.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
};

const port = +(process.argv[2] || 8767);
// local-only save target for the art/sprite tuning editors (arttune.html and
// the ?spritetune=1 overlay). Allowlisted — production has no such endpoint,
// so the tools fall back to copy-to-clipboard there.
const SAVABLE = new Set(['overworld/sprite_tuning.json', 'battlecards/art_tuning.json']);
createServer(async (req, res) => {
	const url = new URL(req.url, `http://localhost:${port}`);
	if (url.pathname === '/dev/save' && req.method === 'POST') {
		const chunks = [];
		for await (const c of req) chunks.push(c);
		try {
			const { file, content } = JSON.parse(Buffer.concat(chunks));
			if (!SAVABLE.has(file)) { res.writeHead(403); res.end('not an allowed tuning file'); return; }
			writeFileSync(file, JSON.stringify(content, null, '\t') + '\n');
			console.log('saved', file, `(${Object.keys(content).length} entries)`);
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end('{"ok":true}');
		} catch (e) { res.writeHead(400); res.end(String(e.message || e)); }
		return;
	}
	// ?mapedit=1 Save: writes one map layout back into overworld/data/layouts/.
	// That tree is gitignored and deploys to magepunk-owdata separately, so this
	// only lands locally — publish with:
	//   npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --branch=main --commit-dirty=true
	// Path is rebuilt from the layout id rather than trusted from the client, so
	// nothing can be written outside the layouts directory.
	if (url.pathname === '/dev/save-layout' && req.method === 'POST') {
		const chunks = [];
		for await (const c of req) chunks.push(c);
		try {
			const { content } = JSON.parse(Buffer.concat(chunks));
			const id = content?.id;
			if (!/^LAYOUT_[A-Z0-9_]+$/.test(id || '')) throw new Error('bad layout id');
			if (!Array.isArray(content.map) || !content.map.length) throw new Error('layout has no map grid');
			if (content.map.length !== content.height) throw new Error('map rows != height');
			for (const row of content.map) {
				if (!Array.isArray(row) || row.length !== content.width) throw new Error('a map row != width');
				for (const v of row) if (!Number.isInteger(v) || v < 0 || v > 0xFFFF) throw new Error('grid cell out of u16 range');
			}
			writeFileSync(join('overworld/data/layouts', id + '.json'), JSON.stringify(content));
			console.log('saved layout', id, `(${content.width}x${content.height})`);
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end('{"ok":true}');
		} catch (e) { res.writeHead(400); res.end(String(e.message || e)); }
		return;
	}
	// mapedit "save map": writes overworld/data/maps/<stem>_map.json. The LAYOUT
	// is the painted grid; the MAP is everything that makes a painted grid a
	// place — warps, connections, object events. The editor could only ever write
	// layouts, so a region built with it had no doors and nobody in it.
	//
	// Validated hard because a malformed map JSON is a boot failure, not a
	// cosmetic bug: the fields are checked by shape and every dest_map / connection
	// target must exist in map_index.json, so a typo cannot strand the player.
	if (url.pathname === '/dev/save-map' && req.method === 'POST') {
		const chunks = [];
		for await (const c of req) chunks.push(c);
		try {
			const { stem, content } = JSON.parse(Buffer.concat(chunks));
			if (!/^[A-Za-z0-9_]+$/.test(stem || '')) throw new Error('bad map stem');
			if (!content || typeof content !== 'object') throw new Error('no map content');
			if (!/^MAP_[A-Z0-9_]+$/.test(content.id || '')) throw new Error('bad map id');
			if (!/^LAYOUT_[A-Z0-9_]+$/.test(content.layout || '')) throw new Error('bad layout id');

			const index = JSON.parse(readFileSync('overworld/data/map_index.json', 'utf8'));
			const known = id => typeof id === 'string' && (index[id] || /^MAP_(DYNAMIC|NONE)$/.test(id));
			const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

			for (const w of (content.warp_events || [])) {
				if (!int(+w.x, 0, 2000) || !int(+w.y, 0, 2000)) throw new Error('warp out of range');
				if (!known(w.dest_map)) throw new Error('warp points at an unknown map: ' + w.dest_map);
			}
			for (const c2 of (content.connections || [])) {
				if (!['up', 'down', 'left', 'right', 'dive', 'emerge'].includes(c2.direction)) {
					throw new Error('bad connection direction: ' + c2.direction);
				}
				if (!known(c2.map)) throw new Error('connection points at an unknown map: ' + c2.map);
			}
			for (const o of (content.object_events || [])) {
				if (!int(+o.x, 0, 2000) || !int(+o.y, 0, 2000)) throw new Error('object out of range');
				if (!/^[A-Za-z0-9_]*$/.test(String(o.graphics_id ?? ''))) throw new Error('bad graphics_id');
			}
			writeFileSync(join('overworld/data/maps', stem + '_map.json'), JSON.stringify(content));
			console.log('saved map', stem,
				`(${(content.warp_events || []).length} warps, ${(content.connections || []).length} connections, ${(content.object_events || []).length} objects)`);
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end('{"ok":true}');
		} catch (e) { res.writeHead(400); res.end(String(e.message || e)); }
		return;
	}
	// arttune.html "replace image": writes battlecards/art/<id>.jpg, adds the id
	// to art/index.json, and bumps the id's ART_REVS cache-bust in cardart.js so
	// the 7-day CDN cache can't serve the stale image after the next art deploy.
	if (url.pathname === '/dev/save-art' && req.method === 'POST') {
		const chunks = [];
		for await (const c of req) chunks.push(c);
		try {
			const { id, dataUrl } = JSON.parse(Buffer.concat(chunks));
			if (!/^[a-z0-9_]+$/.test(id || '')) throw new Error('bad card id');
			const m = /^data:image\/jpeg;base64,(.+)$/.exec(dataUrl || '');
			if (!m) throw new Error('expected a base64 jpeg data URL');
			writeFileSync(`battlecards/art/${id}.jpg`, Buffer.from(m[1], 'base64'));
			// index.json: array of ids with art
			let index = [];
			try { index = JSON.parse(readFileSync('battlecards/art/index.json', 'utf8')); } catch (e) {}
			if (!index.includes(id)) { index.push(id); index.sort(); writeFileSync('battlecards/art/index.json', JSON.stringify(index)); }
			// ART_REVS bump (single-line object literal in cardart.js)
			const srcPath = 'battlecards/cardart.js';
			const src = readFileSync(srcPath, 'utf8');
			const lit = /const ART_REVS = \{[^}]*\};/.exec(src);
			if (!lit) throw new Error('ART_REVS literal not found in cardart.js');
			const revs = new Function('return ' + lit[0].slice('const ART_REVS = '.length, -1))();
			const rev = (revs[id] || 1) + 1;
			revs[id] = rev;
			const body = Object.keys(revs).sort().map(k => `${/^[a-z_][a-z0-9_]*$/.test(k) ? k : JSON.stringify(k)}: ${revs[k]}`).join(', ');
			writeFileSync(srcPath, src.replace(lit[0], `const ART_REVS = { ${body} };`));
			console.log(`saved art ${id}.jpg (${Buffer.from(m[1], 'base64').length} bytes, rev ${rev})`);
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, rev }));
		} catch (e) { res.writeHead(400); res.end(String(e.message || e)); }
		return;
	}
	if (url.pathname === '/api/mp') {
		const chunks = [];
		for await (const c of req) chunks.push(c);
		const request = new Request(`http://localhost${url.pathname}`, {
			method: req.method,
			headers: req.headers,
			body: chunks.length ? Buffer.concat(chunks) : undefined,
		});
		const out = await handler(request, { MP_DB, ...process.env });
		res.writeHead(out.status, Object.fromEntries(out.headers));
		res.end(Buffer.from(await out.arrayBuffer()));
		return;
	}
	// static: mirror Cloudflare Pages' repo-root publish + directory index behavior
	let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
	if (p === '' || p.endsWith('/') || p.endsWith('\\')) p = join(p, 'index.html');
	if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
	if (!existsSync(p)) { res.writeHead(404); res.end('not found'); return; }
	res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
	res.end(readFileSync(p));
}).listen(port, () => console.log(`mp dev server: http://localhost:${port}/login/`));
