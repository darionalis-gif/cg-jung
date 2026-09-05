// r128: hall_female beat 1 tells guests_far to dance. Do the crowd members' limbs move at all?
import { createServer } from 'node:http'; import { readFileSync, existsSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(args.html || path.join(HERE, '..', 'index.html'), 'utf8');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
const OUT = path.join(HERE, 'out', args.round || 'r128');
const id = args.id || 'hall_female-365';
const p = path.join(OUT, id, 'raw.json'); const q = path.join(OUT, id, 'scene.json');
let scene = null; if (existsSync(p)) { try { const r = JSON.parse(readFileSync(p, 'utf8')); if (r && Array.isArray(r.actors) && r.actors.length) scene = r; } catch (e) { } }
if (!scene) scene = JSON.parse(readFileSync(q, 'utf8'));
await page.evaluate(s => { const S = window.__somnium; const d = { id: 'rr', title: s.title, text: '', scene: S.normalizeScene(s, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; }, scene);
const sample = t => page.evaluate(tt => {
  const S = window.__somnium.Stage; S.setTime(tt); S.playing = false;
  const out = {};
  for (const [aid, rec] of S.actors) { const mem = rec.g.userData.members; if (!mem) continue;
    out[aid] = { state: (S.statesAt ? null : null), n: mem.length,
      arms: mem.slice(0, 4).map(m => { const L = m.userData.limbs; return L ? [+L.arms[0].rotation.x.toFixed(3), +L.arms[0].rotation.z.toFixed(3), +L.legs[0].rotation.x.toFixed(3)] : null; }),
      hasLimbs: mem.filter(m => !!m.userData.limbs).length }; }
  return out;
}, t);
const times = [1.0, 1.6, 2.2, 2.8, 3.4, 4.0, 4.6];
const rows = [];
for (const t of times) { rows.push({ t, v: await sample(t) }); await page.waitForTimeout(60); }
const ids = Object.keys(rows[0].v);
for (const aid of ids) {
  console.log(aid, 'members', rows[0].v[aid].n, 'withLimbs', rows[0].v[aid].hasLimbs);
  for (const r of rows) console.log('   t=' + r.t, JSON.stringify(r.v[aid].arms));
}
await browser.close(); server.close();
