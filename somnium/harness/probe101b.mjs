import { createServer } from 'node:http'; import { readFileSync, writeFileSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const OUT = path.join(HERE, 'out', 'r101');
const ids = process.argv[2] ? process.argv[2].split(',') : ['alta-263','hall_female-365','natural_scientist-203','norms-m-315','pegasus-1015','vietnam_vet-89'];
const res = {};
for (const id of ids) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
  const scene = JSON.parse(readFileSync(path.join(OUT, id, 'scene.json'), 'utf8'));
  await page.evaluate(x => { const S = window.__somnium; const d = { id: 'rr', title: x.title, text: '', scene: S.normalizeScene(x, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; }, scene);
  // replicate the harness loop, but also record how far the camera travels during the 700 ms motion window
  const rows = await page.evaluate(async () => {
    const S = window.__somnium.Stage; const beats = S.scene.beats; const out = []; let t = 0;
    const settle2 = async () => { let lp = null, ll = null;
      for (let k = 0; k < 150; k++) { await new Promise(r => requestAnimationFrame(r));
        const p = S.camera.position.clone(), l = S.cam.look.clone();
        if (lp && p.distanceTo(lp) < 0.002 && l.distanceTo(ll) < 0.002) return k; lp = p; ll = l; } return -1; };
    for (let i = 0; i < beats.length; i++) {
      const mid = t + beats[i].dur * 0.5;
      S.setTime(mid); S.playing = false; await new Promise(r => setTimeout(r, 240));
      const s1 = await settle2();
      const p0 = S.camera.position.clone(), l0 = S.cam.look.clone();
      S.playing = true; await new Promise(r => setTimeout(r, 700)); 
      const p1 = S.camera.position.clone(), l1 = S.cam.look.clone();
      S.playing = false;
      const s2 = await settle2();
      const m = S.metrics();
      out.push({ beat: i + 1, settle: [s1, s2], camMove: +p0.distanceTo(p1).toFixed(2), lookMove: +l0.distanceTo(l1).toFixed(2),
        camY: +S.camera.position.y.toFixed(2), lookY: +S.cam.look.y.toFixed(2), mode: m.camera.mode });
      t += beats[i].dur;
    }
    return out;
  });
  res[id] = rows; console.log('===', id); for (const r of rows) console.log('  ', JSON.stringify(r));
  await ctx.close();
}
writeFileSync(path.join(HERE, 'out', 'probe101b.json'), JSON.stringify(res, null, 1));
await browser.close(); server.close();
