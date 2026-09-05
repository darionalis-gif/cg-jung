import { createServer } from 'node:http'; import { readFileSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage();
await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
const scene = JSON.parse(readFileSync(path.join(HERE, 'out', 'r101', 'norms-m-315', 'scene.json'), 'utf8'));
await page.evaluate(x => { const S = window.__somnium; const d = { id: 'rr', title: x.title, text: '', scene: S.normalizeScene(x, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; }, scene);
// walk the whole of beat 3 (17..24) in playback and log the camera y
const out = await page.evaluate(async () => {
  const S = window.__somnium.Stage; S.setTime(16.5); S.playing = true; const rows = [];
  const t0 = performance.now();
  while (S.time < 24.5 && performance.now() - t0 < 60000) { await new Promise(r => requestAnimationFrame(r));
    rows.push({ t: +S.time.toFixed(2), y: +S.camera.position.y.toFixed(2), x: +S.camera.position.x.toFixed(2), z: +S.camera.position.z.toFixed(2), ly: +S.cam.look.y.toFixed(2) }); }
  S.playing = false; return rows;
});
console.log('NORMS beat3 playback, camera y:');
for (let i = 0; i < out.length; i += 3) console.log('  ', JSON.stringify(out[i]));
console.log('min y', Math.min(...out.map(r => r.y)), 'max y', Math.max(...out.map(r => r.y)));
// also: paused at the harness's exact sample point
for (const t of [20.5, 21.2]) {
  await page.evaluate(x => { const S = window.__somnium.Stage; S.setTime(x); S.playing = false; }, t);
  await page.waitForTimeout(3000);
  const m = await page.evaluate(() => window.__somnium.Stage.metrics());
  console.log('paused t=' + t, JSON.stringify(m.camera));
  await page.screenshot({ path: path.join(HERE, 'out', `probe101-norms-b3-${t}.png`) });
}
await browser.close(); server.close();
