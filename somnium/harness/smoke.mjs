import { createServer } from 'node:http'; import { readFileSync } from 'node:fs'; import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1200, height: 760 } }); const errs = [];
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') { errs.push(m.text().slice(0, 300)); console.log('CONSOLE', m.text().slice(0, 300)); } });
p.on('pageerror', e => { errs.push('PAGEERROR ' + e.message); console.log('PAGEERROR', e.message, (e.stack || '').split('\n').slice(0, 3).join(' / ')); });
await p.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: new URL('./vendor/three.min.js', import.meta.url).pathname, contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
await p.goto(`http://127.0.0.1:${port}/`); await p.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 15000 });
const scene = JSON.parse(readFileSync(new URL('./smoke-scene.json', import.meta.url), 'utf8'));
await p.evaluate(s => { const S = window.__somnium; const d = { id: 'smoke', title: 'smoke', text: 'smoke test', scene: S.normalizeScene(s, 'x'), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); }, scene);
const idem = await p.evaluate(s => { const S = window.__somnium; const a = S.App.exportScene(S.normalizeScene(s, 'x')); const b = S.App.exportScene(S.normalizeScene(JSON.parse(JSON.stringify(a)), 'x')); return JSON.stringify(a) === JSON.stringify(b) ? 'idempotent' : 'NOT idempotent: ' + JSON.stringify(a).length + ' vs ' + JSON.stringify(b).length; }, scene); console.log(idem);
const total = await p.evaluate(() => window.__somnium.Stage.scene.total);
for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) { await p.evaluate(t => { window.__somnium.Stage.setTime(t); window.__somnium.Stage.playing = false; }, f * total); await p.waitForTimeout(250); await p.screenshot({ path: `harness/out/smoke-${f}.png` }); const m = await p.evaluate(() => window.__somnium.Stage.metrics()); console.log(f, JSON.stringify(m)); }
await p.setViewportSize({ width: 390, height: 780 }); await p.waitForTimeout(300); await p.screenshot({ path: 'harness/out/smoke-phone.png' });
// a second scene: an authored fixed shot over a pit, the path that broke the camera settle
{ const pit = JSON.parse(readFileSync(new URL('./smoke-scene-pit.json', import.meta.url), 'utf8'));
  await p.evaluate(s => { const S = window.__somnium; const d = { id: 'pit', title: 'pit', text: 'pit smoke', scene: S.normalizeScene(s, 'x'), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); }, pit);
  const idem2 = await p.evaluate(s => { const S = window.__somnium; const a = S.App.exportScene(S.normalizeScene(s, 'x')); const b = S.App.exportScene(S.normalizeScene(JSON.parse(JSON.stringify(a)), 'x')); return JSON.stringify(a) === JSON.stringify(b) ? 'idempotent' : 'NOT idempotent'; }, pit); console.log('pit', idem2);
  const t2 = await p.evaluate(() => window.__somnium.Stage.scene.total);
  await p.setViewportSize({ width: 1200, height: 760 });
  for (const f of [0.08, 0.25, 0.45, 0.62, 0.85]) { await p.evaluate(t => { window.__somnium.Stage.setTime(t); window.__somnium.Stage.playing = false; }, f * t2); await p.waitForTimeout(200); const m = await p.evaluate(() => window.__somnium.Stage.metrics()); console.log('pit', f, JSON.stringify(m)); }
  await p.screenshot({ path: 'harness/out/smoke-pit.png' }); }
console.log('errors:', errs); await b.close(); server.close();
