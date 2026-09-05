// r113: what is standing in front of the lens in vietnam_vet-89 beat 5, and why does nothing cost it?
import { createServer } from 'node:http'; import { readFileSync, existsSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(args.html || path.join(HERE, '..', 'index.html'), 'utf8');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const OUT = path.join(HERE, 'out', 'r113');
for (const [id, beat] of [['vietnam_vet-89', 5], ['pegasus-1015', 12], ['alta-263', 5]]) {
  const rawF = path.join(OUT, id, 'raw.json');
  let scene = JSON.parse(readFileSync(path.join(OUT, id, 'scene.json'), 'utf8'));
  if (existsSync(rawF)) { try { const r = JSON.parse(readFileSync(rawF, 'utf8')); if (r && Array.isArray(r.actors) && r.actors.length) scene = r; } catch (e) { } }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
  await page.evaluate(s => { const S = window.__somnium; const d = { id: 'rr', title: s.title, text: '', scene: S.normalizeScene(s, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; }, scene);
  let t = 0; for (let i = 0; i < beat - 1; i++) t += scene.beats[i].dur;
  const mid = t + scene.beats[beat - 1].dur * 0.5;
  const out = await page.evaluate(async m => {
    const S = window.__somnium.Stage, THREE = window.THREE;
    S.setTime(m); S.playing = false;
    for (let k = 0; k < 60; k++) await new Promise(r => requestAnimationFrame(r));
    const cam = S.camera; cam.updateMatrixWorld(true);
    const res = { cam: cam.position.toArray().map(v => +v.toFixed(2)), look: S.cam.look.toArray().map(v => +v.toFixed(2)), bodies: [] };
    const target = S.scene.beats[S.beatAt(S.time)].camera.target;
    // every drawn body in the scene, by how much of the frame it covers and how near it is
    for (const [id, rec] of S.actors) {
      const members = rec.g.userData.members || [rec.g];
      members.forEach((mm, i) => {
        const bx = new THREE.Box3().setFromObject(mm); if (bx.isEmpty()) return;
        const c = bx.getCenter(new THREE.Vector3());
        const d = c.distanceTo(cam.position); if (d > 12) return;
        // project the eight corners and measure the screen rectangle
        let x0 = 9, x1 = -9, y0 = 9, y1 = -9, anyFront = false;
        for (const sx of [bx.min.x, bx.max.x]) for (const sy of [bx.min.y, bx.max.y]) for (const sz of [bx.min.z, bx.max.z]) {
          const p = new THREE.Vector3(sx, sy, sz).project(cam); if (p.z < 1) anyFront = true;
          x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
        if (!anyFront) return;
        const w = Math.min(1, x1) - Math.max(-1, x0), h = Math.min(1, y1) - Math.max(-1, y0);
        if (w <= 0 || h <= 0) return;
        res.bodies.push({ id: id + (rec.g.userData.members ? '#' + i : ''), dist: +d.toFixed(2),
          frameW: +(w / 2 * 100).toFixed(0), frameH: +(h / 2 * 100).toFixed(0), cx: +((x0 + x1) / 2).toFixed(2) });
      });
    }
    res.bodies.sort((a, b) => b.frameH * b.frameW - a.frameH * a.frameW);
    res.bodies = res.bodies.slice(0, 8);
    // what does occluded() see on the way to the target?
    const rec = S.actors.get(target), st = S.states.get(target);
    if (rec && st) {
      const top = rec.g.userData.baseHeight * (st.size / rec.a.size);
      const to = new THREE.Vector3(st.pos[0], st.pos[1] + top / 2, st.pos[2]);
      res.rayTo = to.toArray().map(v => +v.toFixed(2));
      res.occluded = S.occluded(cam.position.clone(), to.clone(), rec.g);
      const dir = to.clone().sub(cam.position); const len = dir.length(); dir.divideScalar(len);
      const ray = new THREE.Raycaster(cam.position.clone(), dir, 0.2, len - 0.3);
      res.hits = ray.intersectObjects(S.solidsNow || S.solids, false).slice(0, 5).map(h => ({ d: +h.distance.toFixed(2), geo: h.object.geometry.type, soft: !!h.object.userData.soft }));
      res.lensCrowding = S.lensCrowding(cam.position.clone(), [rec.g]);
      res.solidsSoftCount = (S.solidsNow || []).filter(o => o.userData.soft).length;
    }
    return res;
  }, mid);
  console.log('===', id, 'beat', beat, JSON.stringify(out, null, 1));
  await ctx.close();
}
await browser.close(); server.close();
