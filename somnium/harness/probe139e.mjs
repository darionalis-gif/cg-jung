// r139: how long is a `throw` actually a throw?  Samples one figure's shoulder angle across the
// whole beat, and does the same for the four throwers of norms-m-315 beat 5 in the real scene.
import { createServer } from 'node:http'; import { readFileSync, existsSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(args.html || path.join(HERE, '..', 'index.html'), 'utf8');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 700, height: 500 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
const scene = JSON.parse(readFileSync(path.join(HERE, 'out', args.round || 'r139', 'norms-m-315', 'raw.json'), 'utf8'));
await page.evaluate(x => { const S = window.__somnium; const d = { id: 'p', title: x.title, text: '', scene: S.normalizeScene(x, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.setTime(0); S.Stage.playing = true; S.Stage.fixedDt = 1 / 30; }, scene);
const rows = await page.evaluate(async () => {
  const S = window.__somnium.Stage; const res = []; const ids = ['me', 'friend_1', 'friend_2', 'friend_3'];
  while (S.time < 46) { await new Promise(r => requestAnimationFrame(r));
    if (res.length && S.time - res[res.length - 1].t < 0.2) continue;
    res.push({ t: +S.time.toFixed(2), b: S.beatAt(S.time) + 1,
      a: ids.map(i => { const r = S.actors.get(i); const p = r && r.g.userData.pose; return p ? +p.armsX[0].toFixed(2) : null; }),
      s: ids.map(i => (S.states.get(i) || {}).state) }); }
  S.playing = false; return res; });
for (const r of rows) if (r.b >= 4 && r.b <= 5) console.log('t=' + r.t, 'b' + r.b, 'armsX[0]', JSON.stringify(r.a), r.s.join(','));
await browser.close(); server.close();
