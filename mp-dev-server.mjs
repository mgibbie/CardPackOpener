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
