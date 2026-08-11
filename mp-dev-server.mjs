// Local dev server for the account system: static files + the real /api/mp function
// handler. Production runs on Cloudflare with a D1 binding (env.MP_DB); here we
// hand the handler the same interface backed by a local SQLite file, so it runs
// the identical code and the identical SQL.
//
//   node mp-dev-server.mjs [port]     (default 8767)
//   MP_DEV_DB=/path/to.sqlite  to keep accounts between runs (default: temp file)
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdtempSync } from 'node:fs';
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
createServer(async (req, res) => {
	const url = new URL(req.url, `http://localhost:${port}`);
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
	// static: mirror Netlify's publish="." + directory index behavior
	let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
	if (p === '' || p.endsWith('/') || p.endsWith('\\')) p = join(p, 'index.html');
	if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
	if (!existsSync(p)) { res.writeHead(404); res.end('not found'); return; }
	res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
	res.end(readFileSync(p));
}).listen(port, () => console.log(`mp dev server: http://localhost:${port}/login/`));
