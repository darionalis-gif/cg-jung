// r144: the locomotion cycle itself. A figure is given a long move so it actually walks/runs/limps,
// and every joint channel is sampled 60 times over 6 s, so arm swing, knee bend and foot slide can
// be measured rather than guessed at from a still.
import { createServer } from 'node:http'; import { readFileSync, writeFileSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
const CASES = [['walk', 8], ['run', 26], ['limp', 8], ['walk', 0]];   // state, metres travelled in 8 s
const scene = { title: 'gait', mood: 'probe', world: { sky: 'day', ground: 'grass', fogDensity: 0.002, sunIntensity: 1.2 },
  actors: [{ id: 'a', kind: 'person', label: '', color: '#3d6fa8', pos: [0, 0, 0], yaw: 0 }],
  beats: CASES.map(([s, d]) => ({ dur: 8, text: s + ' ' + d, camera: { mode: 'follow', target: 'a', distance: 5, height: 1.6 },
    actions: [{ actor: 'a', state: s, ...(d ? { move: [0, 0, d] } : {}) }] })) };
await page.evaluate(s => { const S = window.__somnium; const d = { id: 'p', title: s.title, text: '', scene: S.normalizeScene(s, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; S.Stage.fixedDt = 1 / 30; }, scene);
const out = {};
for (let i = 0; i < CASES.length; i++) {
  const key = CASES[i][0] + '@' + CASES[i][1];
  await page.evaluate(t => { const S = window.__somnium.Stage; S.setTime(t); S.playing = false; }, i * 8 + 0.5);
  const rows = [];
  for (let k = 0; k < 72; k++) {
    await page.evaluate(async () => { const S = window.__somnium.Stage; S.playing = true; await new Promise(r => requestAnimationFrame(r)); S.playing = false; });
    rows.push(await page.evaluate(() => { const S = window.__somnium.Stage, THREE = window.THREE; const rec = S.actors.get('a'); const L = rec.g.userData.limbs;
      const w = new THREE.Vector3();
      const feet = L.feet ? L.feet.map(f => { f.getWorldPosition(w); return [+w.x.toFixed(4), +w.y.toFixed(4), +w.z.toFixed(4)]; }) : null;
      return { t: +S.time.toFixed(3), z: +rec.g.position.z.toFixed(4),
        armX: L.arms.map(a => +a.rotation.x.toFixed(3)), foreX: L.fore.map(a => +a.rotation.x.toFixed(3)),
        legX: L.legs.map(a => +a.rotation.x.toFixed(3)), shinX: L.shins.map(a => +a.rotation.x.toFixed(3)),
        rootY: +rec.g.position.y.toFixed(4), feet }; }));
  }
  out[key] = rows;
  const pp = f => { const v = rows.map(f); return +(Math.max(...v) - Math.min(...v)).toFixed(3); };
  // foot slide: horizontal travel of a foot while it is at its lowest (planted)
  let slide = 'n/a';
  if (rows[0].feet) { const lows = [];
    for (let s = 0; s < 2; s++) { const ys = rows.map(r => r.feet[s][1]); const lo = Math.min(...ys), hi = Math.max(...ys);
      const plantedIdx = rows.map((r, j) => [r.feet[s][1], j]).filter(([y]) => y < lo + (hi - lo) * 0.15).map(([, j]) => j);
      // longest run of consecutive planted frames
      let best = [], cur = [];
      for (const j of plantedIdx) { if (cur.length && j === cur[cur.length - 1] + 1) cur.push(j); else { if (cur.length > best.length) best = cur; cur = [j]; } }
      if (cur.length > best.length) best = cur;
      if (best.length > 2) { const z0 = rows[best[0]].feet[s][2], z1 = rows[best[best.length - 1]].feet[s][2];
        const dz = Math.abs(z1 - z0); const bodyDz = Math.abs(rows[best[best.length - 1]].z - rows[best[0]].z);
        lows.push(`foot${s}: planted ${best.length} frames, foot moved ${dz.toFixed(3)} m while body moved ${bodyDz.toFixed(3)} m`); } }
    slide = lows.join('; '); }
  console.log(key.padEnd(9),
    'armX p-p', [pp(r => r.armX[0]), pp(r => r.armX[1])].join('/'),
    '| legX p-p', [pp(r => r.legX[0]), pp(r => r.legX[1])].join('/'),
    '| shinX p-p', [pp(r => r.shinX[0]), pp(r => r.shinX[1])].join('/'),
    '| shin range', [Math.min(...rows.map(r => r.shinX[0])).toFixed(2), Math.max(...rows.map(r => r.shinX[0])).toFixed(2)].join('..'),
    '| rootY p-p', pp(r => r.rootY), '| z travelled', (rows[rows.length - 1].z - rows[0].z).toFixed(2));
  console.log('          ', slide);
}
writeFileSync(path.join(HERE, 'out', 'probe144gait.json'), JSON.stringify(out, null, 1));
await browser.close(); server.close();
