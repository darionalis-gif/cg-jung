// r128: amplitude of the held states over time, and what `throw` actually does to the rig.
// Samples one beat per state at 24 time points and reports peak-to-peak of every joint channel.
import { createServer } from 'node:http'; import { readFileSync, writeFileSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(args.html || path.join(HERE, '..', 'index.html'), 'utf8');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 620 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });

const STATES = ['idle', 'grieve', 'pockets', 'yell', 'fold', 'push', 'throw', 'kneel', 'walk'];
const DUR = 8;
const scene = {
  title: 'poses', mood: 'probe', world: { sky: 'day', ground: 'grass', fogDensity: 0.004, sunIntensity: 1.1 },
  actors: [{ id: 'a1', kind: 'person', label: 'a', color: '#3d6fa8', pos: [-1.2, 0, 0], yaw: 180 },
           { id: 'a2', kind: 'person', label: 'b', color: '#c85a3c', pos: [1.2, 0, 0], yaw: 180 }],
  beats: STATES.map(s => ({ dur: DUR, text: s, camera: { mode: 'fixed', target: 'a1', pos: [0, 2.0, -6], lookAt: [0, 1.0, 0] },
    actions: [{ actor: 'a1', state: s }, { actor: 'a2', state: s }] }))
};
await page.evaluate(s => { const S = window.__somnium; const d = { id: 'p', title: s.title, text: '', scene: S.normalizeScene(s, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; }, scene);

const read = () => page.evaluate(() => {
  const S = window.__somnium.Stage; const out = {};
  for (const id of ['a1', 'a2']) { const rec = S.actors.get(id); const L = rec.g.userData.limbs; if (!L) continue;
    out[id] = { rootY: rec.g.position.y, rootX: rec.g.position.x, rootZ: rec.g.position.z,
      torsoY: L.torso.position.y, torsoX: L.torso.rotation.x, torsoZ: L.torso.rotation.z,
      armZ0: L.arms[0].rotation.z, armZ1: L.arms[1].rotation.z, armX0: L.arms[0].rotation.x, armX1: L.arms[1].rotation.x,
      foreX0: L.fore[0].rotation.x, foreX1: L.fore[1].rotation.x,
      legX0: L.legs[0].rotation.x, legX1: L.legs[1].rotation.x, shinX0: L.shins[0].rotation.x, shinX1: L.shins[1].rotation.x,
      headX: L.head.rotation.x, headY: L.head.rotation.y,
      knee0: (() => { const v = new window.THREE.Vector3(); L.shins[0].getWorldPosition(v); return v.y; })(),
      knee1: (() => { const v = new window.THREE.Vector3(); L.shins[1].getWorldPosition(v); return v.y; })(),
      lowest: (() => { const b = new window.THREE.Box3().setFromObject(rec.g); return b.min.y; })() }; }
  return out;
});
const out = {};
for (let i = 0; i < STATES.length; i++) {
  const t0 = i * DUR; const samples = [];
  for (let k = 0; k < 24; k++) {
    await page.evaluate(t => { const S = window.__somnium.Stage; S.setTime(t); S.playing = false; }, t0 + DUR * (0.45 + 0.5 * k / 23));
    await page.waitForTimeout(45);
    samples.push(await read());
  }
  const keys = Object.keys(samples[0].a1);
  const amp = {}; for (const k of keys) { const v = samples.map(s => s.a1[k]); amp[k] = +(Math.max(...v) - Math.min(...v)).toFixed(4); }
  const pk = keys.filter(k => k !== 'rootX' && k !== 'rootZ');
  const phase = +Math.max(...pk.map(k => Math.max(...samples.map(s => Math.abs(s.a1[k] - s.a2[k]))))).toFixed(4);
  const mid = samples[11].a1;
  out[STATES[i]] = { amp, phaseSpread: phase, mid };
  const big = Object.entries(amp).filter(([, v]) => v > 0.004).sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(STATES[i].padEnd(8), 'peak-to-peak:', big.map(([k, v]) => `${k}=${v}`).join(' ') || '(none > 0.004 rad/m)',
    '| a1-vs-a2 max joint diff', phase, '| knees(mid)', +mid.knee0.toFixed(3), +mid.knee1.toFixed(3), '| lowest', +mid.lowest.toFixed(3));
}
writeFileSync(path.join(HERE, 'out', 'probe128pose.json'), JSON.stringify(out, null, 1));
await ctx.close(); await browser.close(); server.close();
