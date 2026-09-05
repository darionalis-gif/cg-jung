import { createServer } from 'node:http'; import { readFileSync, existsSync, writeFileSync } from 'node:fs'; import path from 'node:path';
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
  const load = async s => page.evaluate(x => { const S = window.__somnium; const d = { id: 'rr', title: x.title, text: '', scene: S.normalizeScene(x, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; }, s);
  const rec = { id };
  // ---- A: camera jump log over a full playthrough of the ORIGINAL scene
  await load(JSON.parse(readFileSync(path.join(OUT, id, 'scene.json'), 'utf8')));
  const jumps = await page.evaluate(async () => {
    const S = window.__somnium.Stage; S.setTime(0); S.playing = true;
    const log = []; let last = null, lastT = -1, lastBeat = S.lastBeat;
    const total = S.scene.total; const t0 = performance.now();
    while (S.time < total - 0.05 && performance.now() - t0 < 120000) {
      await new Promise(r => requestAnimationFrame(r));
      const p = S.camera.position.clone();
      if (last) { const d = p.distanceTo(last); if (d > 0.8) log.push({ t: +S.time.toFixed(2), d: +d.toFixed(2), cut: S.lastBeat !== lastBeat, beat: S.lastBeat + 1 }); }
      last = p; lastBeat = S.lastBeat;
    }
    S.playing = false; return log;
  });
  rec.jumps = jumps.filter(j => j.d > 1.0);
  // ---- B: moon ndc across the EDITED scene
  const ef = path.join(OUT, id, 'scene-after-edit.json');
  if (existsSync(ef)) {
    await load(JSON.parse(readFileSync(ef, 'utf8')));
    rec.moon = await page.evaluate(async () => {
      const S = window.__somnium.Stage; const out = [];
      const moonIds = [...S.actors.entries()].filter(([k, r]) => r.a.kind === 'moon' || r.a.kind === 'sun').map(([k]) => k);
      if (!moonIds.length) return null;
      const total = S.scene.total;
      for (const f of [0.5 / total, 0.08, 0.25, 0.5, 0.75, 0.95]) {
        S.setTime(f * (f < 0.01 ? total : total)); S.playing = false;
        for (let k = 0; k < 40; k++) await new Promise(r => requestAnimationFrame(r));
        S.camera.updateMatrixWorld(true);
        for (const mid of moonIds) {
          const g = S.actors.get(mid).g; const v = g.position.clone(); const d = v.distanceTo(S.camera.position);
          const n = v.clone().project(S.camera);
          // horizon ndc
          const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.camera.quaternion); fwd.y = 0; fwd.normalize();
          const far = S.camera.position.clone().add(fwd.multiplyScalar(900)); far.y = S.camera.position.y; const hy = far.project(S.camera).y;
          out.push({ t: +S.time.toFixed(1), id: mid, x: +n.x.toFixed(2), y: +n.y.toFixed(2), z: +n.z.toFixed(2), dist: +d.toFixed(1), vis: g.visible, horizonY: +hy.toFixed(2), posY: +g.position.y.toFixed(1) });
        }
      }
      return out;
    });
  }
  res[id] = rec; console.log('---', id); console.log(JSON.stringify(rec, null, 1));
  await ctx.close();
}
writeFileSync(path.join(HERE, 'out', 'probe101.json'), JSON.stringify(res, null, 1));
await browser.close(); server.close();
