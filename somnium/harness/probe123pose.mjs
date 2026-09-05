// r123: do the named states actually pose the rig, and do they move?
//  A: a controlled scene, one beat per state, close camera, four samples across the beat.
//     Records the limb angles the poser produced and the pixel change between samples.
//  B: does a crowd member have a contact shadow / blob at all?
//  C: how far is the lens from the shot it was told to take, frame by frame after the cut?
import { createServer } from 'node:http'; import { readFileSync, writeFileSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(args.html || path.join(HERE, '..', 'index.html'), 'utf8');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });

const STATES = ['idle', 'kneel', 'throw', 'wave', 'dance', 'yell', 'push', 'shake', 'grieve', 'pockets', 'fold', 'walk', 'limp'];
const scene = {
  title: 'poses', mood: 'probe', world: { sky: 'day', ground: 'grass', fogDensity: 0.004, sunIntensity: 1.1 },
  actors: [
    { id: 'a1', kind: 'person', label: 'a', color: '#3d6fa8', pos: [-1.2, 0, 0], yaw: 180 },
    { id: 'a2', kind: 'person', label: 'b', color: '#c85a3c', pos: [1.2, 0, 0], yaw: 180 },
    { id: 'mob', kind: 'crowd', label: 'crowd', color: '#4a5140', pos: [0, 0, 8], detail: { count: 4, radius: 1.6 } }
  ],
  beats: STATES.map(s => ({ dur: 8, text: s, camera: { mode: 'fixed', target: 'a1', pos: [0, 2.0, -6], lookAt: [0, 1.0, 0] },
    actions: [{ actor: 'a1', state: s }, { actor: 'a2', state: s }, { actor: 'mob', state: s }] }))
};
await page.evaluate(s => { const S = window.__somnium; const d = { id: 'p', title: s.title, text: '', scene: S.normalizeScene(s, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; }, scene);

const limbs = () => page.evaluate(() => {
  const S = window.__somnium.Stage; const out = {};
  for (const id of ['a1', 'a2']) { const rec = S.actors.get(id); const L = rec.g.userData.limbs; if (!L) continue;
    out[id] = { hipsY: +rec.g.position.y.toFixed(3), torsoY: +L.torso.position.y.toFixed(3), torsoRotX: +L.torso.rotation.x.toFixed(2),
      armZ: L.arms.map(a => +a.rotation.z.toFixed(2)), armX: L.arms.map(a => +a.rotation.x.toFixed(2)),
      foreX: L.fore.map(a => +a.rotation.x.toFixed(2)),
      legX: L.legs.map(a => +a.rotation.x.toFixed(2)), shinX: L.shins.map(a => +a.rotation.x.toFixed(2)),
      headX: +L.head.rotation.x.toFixed(2) }; }
  const mob = S.actors.get('mob'); const m0 = mob.g.userData.members[0];
  out.crowdBlob = !!mob.blob; out.crowdCasts = (() => { let n = 0; m0.traverse(o => { if (o.isMesh && o.castShadow) n++; }); return n; })();
  out.crowdMeshes = (() => { let n = 0; m0.traverse(o => { if (o.isMesh) n++; }); return n; })();
  out.soloBlob = !!S.actors.get('a1').blob;
  out.crowdArm = (() => { const L = m0.userData.limbs; return L ? { armZ: L.arms.map(a => +a.rotation.z.toFixed(2)), foreX: L.fore.map(a => +a.rotation.x.toFixed(2)), foreMeshes: L.fore.reduce((n, g) => { let k = 0; g.traverse(o => { if (o.isMesh) k++; }); return n + k; }, 0) } : null; })();
  return out;
});
const grid = (a, b) => +(a.reduce((s, v, k) => s + Math.abs(v - b[k]), 0) / a.length).toFixed(2);
const res = {};
for (let i = 0; i < STATES.length; i++) {
  const t0 = i * 8; const rows = [];
  for (const f of [0.15, 0.35, 0.55, 0.8]) {
    await page.evaluate(t => { const S = window.__somnium.Stage; S.setTime(t); S.playing = false; }, t0 + 8 * f);
    await page.waitForTimeout(150);
    const l = await limbs(); const px = await page.evaluate(() => window.__somnium.pixels());
    rows.push({ f, l, px });
  }
  await page.screenshot({ path: path.join(HERE, 'out', `probe123pose-${STATES[i]}.png`) });
  const moved = [grid(rows[0].px, rows[1].px), grid(rows[1].px, rows[2].px), grid(rows[2].px, rows[3].px)];
  const a = rows[1].l.a1, b = rows[1].l.a2;
  console.log(`${STATES[i].padEnd(8)} pxΔ ${moved.map(v => String(v).padStart(6)).join(' ')} | a1 armZ ${JSON.stringify(a.armZ)} legX ${JSON.stringify(a.legX)} shinX ${JSON.stringify(a.shinX)} hipsY ${a.hipsY} torsoY ${a.torsoY}`);
  console.log(`${' '.repeat(8)}                              | a2 armZ ${JSON.stringify(b.armZ)} legX ${JSON.stringify(b.legX)} shinX ${JSON.stringify(b.shinX)} hipsY ${b.hipsY} torsoY ${b.torsoY}` + (JSON.stringify(a) === JSON.stringify(b) ? '   [identical to a1]' : ''));
  res[STATES[i]] = { moved, rows: rows.map(r => ({ f: r.f, a1: r.l.a1, a2: r.l.a2 })) };
}
const meta = await limbs();
console.log('crowd: blob=', meta.crowdBlob, ' solo blob=', meta.soloBlob, ' crowd meshes casting shadow=', meta.crowdCasts, '/', meta.crowdMeshes, ' crowd forearm meshes=', meta.crowdArm && meta.crowdArm.foreMeshes);
writeFileSync(path.join(HERE, 'out', 'probe123pose.json'), JSON.stringify({ res, meta }, null, 1));
await ctx.close(); await browser.close(); server.close();
