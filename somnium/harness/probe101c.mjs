import { createServer } from 'node:http'; import { readFileSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const OUT = path.join(HERE, 'out', 'r101');
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
const load = async s => page.evaluate(x => { const S = window.__somnium; const d = { id: 'rr', title: x.title, text: '', scene: S.normalizeScene(x, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; }, s);
// A) the hospital-room "moon" in the edited norms scene
await load(JSON.parse(readFileSync(path.join(OUT, 'norms-m-315', 'scene-after-edit.json'), 'utf8')));
for (const t of [66, 70.5]) { await page.evaluate(x => { const S = window.__somnium.Stage; S.setTime(x); S.playing = false; }, t); await page.waitForTimeout(1500); await page.screenshot({ path: path.join(HERE, 'out', `probe101-norms-moon-${t}.png`) }); }
// B) alta beat 3: where the camera goes across the beat (azimuth off the subject's facing)
await load(JSON.parse(readFileSync(path.join(OUT, 'alta-263', 'scene.json'), 'utf8')));
const sweep = await page.evaluate(async () => {
  const S = window.__somnium.Stage; S.setTime(14.5); S.playing = true; const out = [];
  const t0 = performance.now();
  while (S.time < 26 && performance.now() - t0 < 60000) {
    await new Promise(r => requestAnimationFrame(r));
    const st = S.states ? null : null;
    const p = S.camera.position, l = S.cam.look;
    out.push({ t: +S.time.toFixed(2), az: +(Math.atan2(p.x - l.x, p.z - l.z) * 180 / Math.PI).toFixed(1), d: +Math.hypot(p.x - l.x, p.z - l.z).toFixed(2), y: +p.y.toFixed(2) });
  }
  S.playing = false; return out.filter((r, i) => i % 4 === 0);
});
console.log('ALTA BEAT3 SWEEP'); for (const r of sweep) console.log('  ', JSON.stringify(r));
await browser.close(); server.close();
