import { createServer } from 'node:http'; import { readFileSync, writeFileSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const OUT = path.join(HERE, 'out', 'r101');
const ids = ['alta-263','hall_female-365','natural_scientist-203','norms-m-315','pegasus-1015','vietnam_vet-89'];
const res = {};
for (const id of ids) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
  const scene = JSON.parse(readFileSync(path.join(OUT, id, 'scene.json'), 'utf8'));
  await page.evaluate(x => { const S = window.__somnium; const d = { id: 'rr', title: x.title, text: '', scene: S.normalizeScene(x, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; }, scene);
  const beats = scene.beats; const rows = []; let t = 0;
  for (let i = 0; i < beats.length; i++) {
    const mid = t + beats[i].dur * 0.5;
    await page.evaluate(m => { window.__somnium.Stage.setTime(m); window.__somnium.Stage.playing = false; }, mid);
    await page.waitForTimeout(240);
    const r = await page.evaluate(async () => {
      const S = window.__somnium.Stage;
      // the harness's own predicate: position + look summed
      const settleA = async () => { let last = null; for (let k = 0; k < 150; k++) { await new Promise(r => requestAnimationFrame(r));
        const now = S.camera.position.clone().add(S.cam.look); if (last && now.distanceTo(last) < 0.002) return k; last = now; } return -1; };
      // separate vectors
      const settleB = async () => { let lp = null, ll = null; for (let k = 0; k < 150; k++) { await new Promise(r => requestAnimationFrame(r));
        const p = S.camera.position.clone(), l = S.cam.look.clone(); if (lp && p.distanceTo(lp) < 0.002 && l.distanceTo(ll) < 0.002) return k; lp = p; ll = l; } return -1; };
      const a = await settleA(); const b = await settleB();
      const p0 = S.camera.position.clone(), l0 = S.cam.look.clone();
      return { a, b, p0: p0.toArray(), l0: l0.toArray() };
    });
    const p1 = await page.evaluate(() => window.__somnium.pixels());
    await page.evaluate(() => { window.__somnium.Stage.playing = true; }); await page.waitForTimeout(700);
    const p2 = await page.evaluate(() => window.__somnium.pixels());
    const after = await page.evaluate(() => { const S = window.__somnium.Stage; S.playing = false; return { p: S.camera.position.toArray(), l: S.cam.look.toArray() }; });
    const diff = p1.reduce((s, v, k) => s + Math.abs(v - p2[k]), 0) / p1.length;
    const dCam = Math.hypot(after.p[0] - r.p0[0], after.p[1] - r.p0[1], after.p[2] - r.p0[2]);
    const dLook = Math.hypot(after.l[0] - r.l0[0], after.l[1] - r.l0[1], after.l[2] - r.l0[2]);
    rows.push({ beat: i + 1, settleA: r.a, settleB: r.b, motion: +diff.toFixed(2), camMove: +dCam.toFixed(2), lookMove: +dLook.toFixed(2) });
    t += beats[i].dur;
  }
  res[id] = rows; console.log('===', id); for (const x of rows) console.log('  ', JSON.stringify(x));
  await ctx.close();
}
writeFileSync(path.join(HERE, 'out', 'probe101d.json'), JSON.stringify(res, null, 1));
await browser.close(); server.close();
