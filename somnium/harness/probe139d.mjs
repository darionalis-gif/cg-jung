// r139 technical review: a close look at the rig itself. One figure, one pose per beat, lens at
// 2.6 m, 1280x900, so the shoulder and elbow joints are big enough on screen to judge.
import { createServer } from 'node:http'; import { readFileSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(args.html || path.join(HERE, '..', 'index.html'), 'utf8');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
const STATES = ['idle', 'walk', 'run', 'pockets', 'push', 'throw', 'kneel', 'yell', 'grieve', 'wave'];
const scene = { title: 'rig', mood: 'probe', world: { sky: 'day', ground: 'grass', fogDensity: 0.002, sunIntensity: 1.2 },
  actors: [{ id: 'bare', kind: 'person', label: '', color: '#3d6fa8', pos: [-0.9, 0, 0], yaw: 200 },
           { id: 'coat', kind: 'person', label: '', color: '#6b6050', pos: [0.9, 0, 0], yaw: 200, detail: { wear: 'coat', wearColor: '#6d5a2f' } }],
  beats: STATES.map(s => ({ dur: 8, text: s, camera: { mode: 'fixed', target: 'bare', pos: [0, 1.5, -2.6], lookAt: [0, 1.0, 0] },
    actions: [{ actor: 'bare', state: s }, { actor: 'coat', state: s }] })) };
await page.evaluate(s => { const S = window.__somnium; const d = { id: 'p', title: s.title, text: '', scene: S.normalizeScene(s, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; S.Stage.fixedDt = 1 / 30; }, scene);
for (let i = 0; i < STATES.length; i++) {
  await page.evaluate(t => { const S = window.__somnium.Stage; S.setTime(t); S.playing = false; }, i * 8);
  await page.waitForTimeout(80);
  await page.evaluate(async m => { const S = window.__somnium.Stage; S.playing = true; for (let k = 0; k < 2000; k++) { if (S.time >= m) break; await new Promise(r => requestAnimationFrame(r)); } S.playing = false; }, i * 8 + 3.4);
  await page.screenshot({ path: path.join(HERE, 'out', `probe139rig-${STATES[i]}.png`) });
  // world-space gap between the top of the upper-arm mesh and the chest surface
  const g = await page.evaluate(() => { const S = window.__somnium.Stage, THREE = window.THREE; const out = {};
    for (const id of ['bare', 'coat']) { const rec = S.actors.get(id); const L = rec.g.userData.limbs;
      out[id] = { armZ: L.arms.map(a => +a.rotation.z.toFixed(2)), armX: L.arms.map(a => +a.rotation.x.toFixed(2)),
        foreX: L.fore.map(a => +a.rotation.x.toFixed(2)), legX: L.legs.map(a => +a.rotation.x.toFixed(2)),
        shinX: L.shins.map(a => +a.rotation.x.toFixed(2)), rootY: +rec.g.position.y.toFixed(3),
        footY: (() => { const b = new THREE.Box3().setFromObject(rec.g); return +b.min.y.toFixed(3); })() }; }
    return out; });
  console.log(STATES[i].padEnd(8), 'bare rootY', g.bare.rootY, 'lowest y', g.bare.footY, '| armX', JSON.stringify(g.bare.armX), 'armZ', JSON.stringify(g.bare.armZ), 'legX', JSON.stringify(g.bare.legX), 'shinX', JSON.stringify(g.bare.shinX), '| coat lowest y', g.coat.footY);
}
await browser.close(); server.close();
